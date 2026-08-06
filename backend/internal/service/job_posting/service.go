package job_posting

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"resumecraft-pdf-backend/internal/model"
	homeStorage "resumecraft-pdf-backend/internal/storage/home"
	jobpostingRepo "resumecraft-pdf-backend/internal/storage/job_posting"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Service 招聘数据聚合服务
type Service interface {
	// SyncFromSmartsheet 调用 Python 抓取脚本 → 解析 → 入库，返回统计结果
	SyncFromSmartsheet(ctx context.Context) (*model.SyncResult, error)
	// ListJobPostings 透传 Repository，返回分页结果
	ListJobPostings(ctx context.Context, filters model.JobPostingFilters) (*model.JobPostingListResponse, error)
	// GetFilters 透传 Repository，返回筛选枚举
	GetFilters(ctx context.Context) (*model.JobPostingFiltersResponse, error)
	// SetMark 设置/取消当前用户对某条招聘信息的「已投递」标记
	SetMark(ctx context.Context, userID, jobPostingID string, applied bool) error
}

// syncCooldown 手动同步最小间隔：两次同步（含自动调度触发）至少间隔 1 分钟，防止频繁爬取源文档。
const syncCooldown = time.Minute

type service struct {
	repo       jobpostingRepo.Repository
	newJobRepo homeStorage.NewJobRepository // 可为 nil：未注入时不推送 Redis「最近新增」列表
	scriptPath string
	pythonBin  string
	mu         sync.Mutex   // 防止并发同步
	lastSyncAt atomic.Int64 // 上次同步开始时间（UnixNano），用于限流
}

// NewService 构造服务。scriptPath 为抓取脚本路径（默认 "../python-parser/scrape_smartsheet.py"），
// pythonBin 为 Python 解释器（为空时自动探测已安装 playwright 的解释器，可用 PYTHON_BIN 覆盖）。
// newJobRepo 用于将本次同步新插入的岗位追加到 Redis「最近新增」列表，可传 nil（不推送）。
func NewService(repo jobpostingRepo.Repository, newJobRepo homeStorage.NewJobRepository, scriptPath, pythonBin string) Service {
	if scriptPath == "" {
		scriptPath = "../python-parser/scrape_smartsheet.py"
	}
	pythonBin = resolvePythonBin(pythonBin)
	log.Printf("[job_posting] resolved python interpreter: %s", pythonBin)
	return &service{repo: repo, newJobRepo: newJobRepo, scriptPath: scriptPath, pythonBin: pythonBin}
}

// resolvePythonBin 返回最终使用的 Python 解释器：
//  1. 若显式配置的 pythonBin 已安装 playwright，直接使用（部署场景通过 PYTHON_BIN 指定）；
//  2. 否则自动探测 PATH 候选与已知 venv 中第一个可 import playwright 的解释器；
//  3. 仍失败则返回配置值（或 "python3"），sync 时再次探测并以清晰错误提示。
func resolvePythonBin(configured string) string {
	if configured != "" && canImportModule(configured, "playwright") {
		return configured
	}
	if detected := detectPlaywrightPython(); detected != "" {
		return detected
	}
	if configured != "" {
		return configured
	}
	return "python3"
}

// detectPlaywrightPython 扫描 PATH 候选与已知 venv 路径，返回第一个能 import playwright 的 python；
// 全部失败时返回空字符串。仅在探测时调用，不修改任何状态。
func detectPlaywrightPython() string {
	for _, c := range pythonCandidates() {
		if _, err := exec.LookPath(c); err != nil {
			continue
		}
		if canImportModule(c, "playwright") {
			return c
		}
	}
	for _, p := range knownVenvPythons() {
		if fileExists(p) && canImportModule(p, "playwright") {
			return p
		}
	}
	return ""
}

// pythonCandidates 返回按 OS 排序的 python 命令候选名
func pythonCandidates() []string {
	if runtime.GOOS == "windows" {
		return []string{"python", "python3"}
	}
	return []string{"python3", "python"}
}

// knownVenvPythons 返回常见虚拟环境 python 绝对路径（开发机与服务器）
func knownVenvPythons() []string {
	home, herr := os.UserHomeDir()
	if herr != nil {
		home = ""
	}
	var paths []string
	if runtime.GOOS == "windows" {
		if home != "" {
			paths = append(paths, filepath.Join(home, ".workbuddy", "binaries", "python", "envs", "default", "Scripts", "python.exe"))
		}
	} else {
		if home != "" {
			paths = append(paths,
				filepath.Join(home, "venv", "bin", "python"),
				filepath.Join(home, ".venv", "bin", "python"),
			)
		}
		paths = append(paths,
			"/opt/resumecraft/venv/bin/python",
			"/opt/venv/bin/python",
		)
	}
	return paths
}

func fileExists(p string) bool {
	info, err := os.Stat(p)
	return err == nil && !info.IsDir()
}

// canImportModule 探测指定 python 是否可 import 给定模块（设置短超时避免卡死）
func canImportModule(bin, module string) bool {
	if bin == "" {
		return false
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, bin, "-c", "import "+module)
	return cmd.Run() == nil
}

// NewServiceFromPool 便捷构造：直接基于连接池创建 Repository 与服务（不推送 Redis「最近新增」列表）
func NewServiceFromPool(pool *pgxpool.Pool, scriptPath, pythonBin string) Service {
	return NewService(jobpostingRepo.NewRepository(pool), nil, scriptPath, pythonBin)
}

func (s *service) SyncFromSmartsheet(ctx context.Context) (*model.SyncResult, error) {
	// 限流：同步进行中直接拒绝，避免重复触发
	if !s.mu.TryLock() {
		return nil, fmt.Errorf("同步任务正在进行中，请稍候")
	}
	defer s.mu.Unlock()

	// 手动同步最小间隔：距上次同步开始不足 1 分钟则拒绝
	now := time.Now()
	if last := time.Unix(0, s.lastSyncAt.Load()); !last.IsZero() {
		if remaining := syncCooldown - now.Sub(last); remaining > 0 {
			return nil, fmt.Errorf("同步过于频繁，请 %s 后重试", remaining.Round(time.Second))
		}
	}
	s.lastSyncAt.Store(now.UnixNano())

	start := time.Now()
	result := &model.SyncResult{StartedAt: start.Format(time.RFC3339)}

	// 解析脚本目录，脚本产出的 smartsheet_data.json 落在同目录
	absDir, err := filepath.Abs(filepath.Dir(s.scriptPath))
	if err != nil {
		return finishErr(result, start, fmt.Errorf("resolve script dir: %w", err))
	}
	outFile := filepath.Join(absDir, "smartsheet_data.json")

	// 同步前校验 Python 环境（playwright 依赖）。
	// 即便构造时锁定的解释器不可用，也在此重新探测一次已知 venv / PATH 候选，
	// 避免因启动期探测偏差而持续失败。
	py := s.pythonBin
	if !canImportModule(py, "playwright") {
		if detected := detectPlaywrightPython(); detected != "" {
			log.Printf("[job_posting] %s 缺少 playwright，重新探测到可用解释器: %s", py, detected)
			py = detected
		} else {
			return finishErr(result, start, fmt.Errorf(
				"未找到已安装 playwright 的 Python 解释器（当前解释器: %s）。"+
					"请确认下列路径之一可用，或通过环境变量 PYTHON_BIN 指定：\n  已知 venv: %s",
				py, strings.Join(knownVenvPythons(), ", "),
			))
		}
	}

	cmd := exec.CommandContext(ctx, py, s.scriptPath)
	cmd.Dir = absDir
	var stdout, stderr strings.Builder
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		log.Printf("[job_posting] scraper failed: %v\nstdout: %s\nstderr: %s", err, truncate(stdout.String(), 3000), truncate(stderr.String(), 3000))
		return finishErr(result, start, fmt.Errorf("run scraper: %w", err))
	}
	log.Printf("[job_posting] scraper finished. output: %s", truncate(stdout.String(), 3000))

	data, err := os.ReadFile(outFile)
	if err != nil {
		return finishErr(result, start, fmt.Errorf("read scraper output %s: %w", outFile, err))
	}

	var parsed scraperOutput
	if err := json.Unmarshal(data, &parsed); err != nil {
		return finishErr(result, start, fmt.Errorf("parse scraper output: %w", err))
	}

	postings, parseErrs := toPostings(parsed.Records)
	result.Errors += len(parseErrs)
	result.Total = len(postings)
	result.Source = parsed.Source
	for _, e := range parseErrs {
		log.Printf("[job_posting] parse record error: %v", e)
	}

	if len(postings) > 0 {
		upsertResult, err := s.repo.UpsertJobPostings(ctx, postings)
		if err != nil {
			return finishErr(result, start, fmt.Errorf("upsert postings: %w", err))
		}
		result.Inserted = upsertResult.Inserted
		result.Updated = upsertResult.Updated
		s.pushNewJobsToRedis(ctx, upsertResult.InsertedItems)
	}

	result.FinishedAt = time.Now().Format(time.RFC3339)
	result.DurationMs = time.Since(start).Milliseconds()
	return result, nil
}

// pushNewJobsToRedis 将本次同步真正新插入（非更新）的岗位追加到 Redis「最近新增」列表，
// 供首页按新增时间倒序读取最近 10 条；未注入 newJobRepo 或单条写入失败仅记录日志，不影响同步主流程结果。
func (s *service) pushNewJobsToRedis(ctx context.Context, items []model.NewJobItem) {
	if s.newJobRepo == nil || len(items) == 0 {
		return
	}
	for _, item := range items {
		if err := s.newJobRepo.PushRecent(ctx, item); err != nil {
			log.Printf("[job_posting] push new job %s to redis recent list failed: %v", item.ID, err)
		}
	}
}

func (s *service) ListJobPostings(ctx context.Context, filters model.JobPostingFilters) (*model.JobPostingListResponse, error) {
	normalizeFilters(&filters)
	items, total, err := s.repo.ListJobPostings(ctx, filters)
	if err != nil {
		return nil, err
	}
	totalPages := total / filters.PageSize
	if total%filters.PageSize > 0 {
		totalPages++
	}
	return &model.JobPostingListResponse{
		Items: items,
		Pagination: model.Pagination{
			Page:       filters.Page,
			PageSize:   filters.PageSize,
			Total:      total,
			TotalPages: totalPages,
		},
	}, nil
}

func (s *service) GetFilters(ctx context.Context) (*model.JobPostingFiltersResponse, error) {
	return s.repo.GetFilters(ctx)
}

func (s *service) SetMark(ctx context.Context, userID, jobPostingID string, applied bool) error {
	return s.repo.SetMark(ctx, userID, jobPostingID, applied)
}

// ---------- 抓取脚本输出结构 ----------

type scraperOutput struct {
	Source       string              `json:"source"`
	TotalRecords int                 `json:"total_records"`
	Fields       []scraperField      `json:"fields"`
	Records      []map[string]string `json:"records"`
}

type scraperField struct {
	ID   string      `json:"id"`
	Name string      `json:"name"`
	Type interface{} `json:"type"` // 腾讯文档字段类型可能为数字或字符串，宽松解析
}

// 中文表头 → 模型字段赋值
var fieldMap = map[string]func(*model.JobPosting, string){
	"企业名称": func(jp *model.JobPosting, v string) { jp.CompanyName = strings.TrimSpace(v) },
	"所属行业": func(jp *model.JobPosting, v string) { jp.Industry = strings.TrimSpace(v) },
	"招聘类型": func(jp *model.JobPosting, v string) { jp.RecruitmentType = strings.TrimSpace(v) },
	"开启时间": func(jp *model.JobPosting, v string) { jp.OpenDate = parseCNDate(v) },
	"工作地点": func(jp *model.JobPosting, v string) { jp.Location = strings.TrimSpace(v) },
	"招聘岗位": func(jp *model.JobPosting, v string) { jp.Positions = strings.TrimSpace(v) },
	"投递链接": func(jp *model.JobPosting, v string) { jp.ApplicationURL = strings.TrimSpace(v) },
	"内推码":  func(jp *model.JobPosting, v string) { jp.ReferralCode = strings.TrimSpace(v) },
	"备注":   func(jp *model.JobPosting, v string) { jp.Notes = strings.TrimSpace(v) },
}

// maxCompanyNameLen 与数据库 job_postings.company_name varchar(500) 上限一致（见迁移
// 2026-08-05-widen-job-postings-company-name.sql）；超出后截断，防止极端超长文本仍导致入库失败。
const maxCompanyNameLen = 500

// truncateRunes 按字符（rune）截断，避免多字节字符（如中文）被从字节中间切断产生乱码；
// varchar(n) 的长度限制按字符计数，故此处以 rune 数而非字节数对齐。
func truncateRunes(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n])
}

func toPostings(records []map[string]string) ([]model.JobPosting, []error) {
	out := make([]model.JobPosting, 0, len(records))
	var errs []error
	for _, rec := range records {
		jp := model.JobPosting{Source: "smartsheet"}
		for header, setter := range fieldMap {
			if raw, ok := rec[header]; ok {
				setter(&jp, raw)
			}
		}
		// 企业名称为空视为抓取产物中的空行/占位记录，静默跳过（不计入解析错误）
		if jp.CompanyName == "" {
			continue
		}
		// 脏数据过滤：真实岗位记录不会只有企业名称而核心字段全空，命中即跳过
		// （属正常过滤，非异常，不计入解析错误）。覆盖两种已知脏数据模式：
		// 1）源表格里整段说明性备注文字被误抓成「企业名称」
		// （例如"1.阿里系这么多家是单独招聘的..."），特征是企业名称超长；
		// 2）企业占位说明行（例如"菜鸟（过几天补充）"），特征是企业名称不长，
		// 但招聘类型/开启时间/工作地点/岗位/投递链接全部为空，是招聘信息还未
		// 就位时的占位记录，同样不应入库。
		// 用 rune 数（字符数）判断超长阈值，与数据库 varchar(n) 的长度限制口径
		// 一致（避免中文按字节数误判）。
		coreFieldsEmpty := jp.Industry == "" && jp.RecruitmentType == "" &&
			jp.OpenDate == nil && jp.Location == "" && jp.Positions == "" && jp.ApplicationURL == ""
		if coreFieldsEmpty {
			continue
		}
		// 兜底截断：防止极端超长文本（未命中上面的脏数据特征）仍撞库表长度限制
		jp.CompanyName = truncateRunes(jp.CompanyName, maxCompanyNameLen)
		// 归一化分类（用于筛选枚举，原始文本保留用于展示）
		jp.RecruitmentCategory = normalizeRecruitmentType(jp.RecruitmentType)
		jp.IndustryCategory = normalizeIndustry(jp.Industry)
		out = append(out, jp)
	}
	return out, errs
}

// parseCNDate 解析 "2026 年 7 月 9 日" 及常见日期格式
func parseCNDate(s string) *time.Time {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	if t, err := time.Parse("2006 年 1 月 2 日", s); err == nil {
		return &t
	}
	for _, layout := range []string{"2006-01-02", "2006/01/02", "2006.01.02"} {
		if t, err := time.Parse(layout, s); err == nil {
			return &t
		}
	}
	return nil
}

func normalizeFilters(f *model.JobPostingFilters) {
	if f.Page < 1 {
		f.Page = 1
	}
	if f.PageSize < 1 {
		f.PageSize = 20
	}
	if f.PageSize > 200 {
		f.PageSize = 200
	}
	f.Keyword = strings.TrimSpace(f.Keyword)
	f.Industry = strings.TrimSpace(f.Industry)
	f.RecruitmentType = strings.TrimSpace(f.RecruitmentType)
	f.Applied = strings.TrimSpace(f.Applied)
	if f.Applied != "true" && f.Applied != "false" {
		f.Applied = ""
	}
}

func finishErr(result *model.SyncResult, start time.Time, err error) (*model.SyncResult, error) {
	result.FinishedAt = time.Now().Format(time.RFC3339)
	result.DurationMs = time.Since(start).Milliseconds()
	return result, err
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "...(truncated)"
}
