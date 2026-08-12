package job_application

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"resumecraft-pdf-backend/internal/model"
	appRepo "resumecraft-pdf-backend/internal/storage/job_application"

	"github.com/xuri/excelize/v2"
)

var (
	ErrApplicationNotFound = errors.New("job application not found")
	ErrInvalidAssociation  = errors.New("resume snapshot does not belong to user resume")
	ErrInvalidStatus       = errors.New("invalid application status")
	ErrInvalidPayload      = errors.New("invalid job application payload")
)

// 面试阶段权重：从小到大，顺序不可逆
var interviewRoundWeights = map[string]int{
	"一面":  1,
	"二面":  2,
	"三面":  3,
	"主管面": 4,
	"HR面": 5,
}

// 面试业务校验错误
var (
	ErrInterviewRoundInvalid    = errors.New("invalid interview round")
	ErrInterviewRoundDuplicated = errors.New("interview round already exists")
	ErrInterviewNoPrerequisite  = errors.New("interview round lacks earlier round")
	ErrInterviewDateTooEarly    = errors.New("interview date earlier than prior round")
	ErrInterviewDateConflict    = errors.New("interview date conflicts with neighbor rounds")
	ErrInterviewNotDeletable    = errors.New("only the latest interview can be deleted")
	ErrApplicationFinalized     = errors.New("application is finalized, cannot add interview")
)

type Service interface {
	List(ctx context.Context, userID string, filters model.JobApplicationFilters) (*model.JobApplicationListResponse, error)
	GetByID(ctx context.Context, userID, applicationID string) (*model.JobApplication, error)
	Create(ctx context.Context, userID string, req model.CreateJobApplicationRequest) (*model.JobApplication, error)
	Update(ctx context.Context, userID, applicationID string, req model.UpdateJobApplicationRequest) (*model.JobApplication, error)
	Delete(ctx context.Context, userID, applicationID string) error
	CheckDuplicates(ctx context.Context, userID string, req model.DuplicateJobApplicationRequest) (*model.DuplicateJobApplicationResponse, error)
	UpdateStatus(ctx context.Context, userID, applicationID string, req model.UpdateJobApplicationStatusRequest) (*model.JobApplicationStatusEvent, error)
	CreateChecklistItem(ctx context.Context, userID, applicationID string, req model.CreateChecklistItemRequest) (*model.JobApplicationChecklistItem, error)
	UpdateChecklistItem(ctx context.Context, userID, applicationID, itemID string, req model.UpdateChecklistItemRequest) (*model.JobApplicationChecklistItem, error)
	DeleteChecklistItem(ctx context.Context, userID, applicationID, itemID string) error
	RegenerateChecklist(ctx context.Context, userID, applicationID string) ([]model.JobApplicationChecklistItem, error)
	CreateAIRun(ctx context.Context, userID, applicationID string, req model.CreateJobApplicationAIRunRequest) (*model.JobApplicationAIRun, error)
	CreateInterview(ctx context.Context, userID, applicationID string, req model.CreateInterviewRequest) (*model.JobApplicationInterview, error)
	UpdateInterview(ctx context.Context, userID, applicationID, interviewID string, req model.UpdateInterviewRequest) (*model.JobApplicationInterview, error)
	DeleteInterview(ctx context.Context, userID, applicationID, interviewID string) error
	UploadInterviewRecording(ctx context.Context, userID, applicationID string, params UploadInterviewRecordingParams) (*model.JobApplicationAttachment, error)
	GetInterviewRecording(ctx context.Context, userID, applicationID, interviewID string) (*model.JobApplicationAttachment, error)
	ExportExcel(ctx context.Context, userID string, filters model.JobApplicationFilters) ([]byte, error)
	// GetFunnelStats 漏斗分析 + 简历版本 A/B 对比
	GetFunnelStats(ctx context.Context, userID string) (*model.FunnelStatsResponse, error)
	// GetTrendStats 按周/月分桶的漏斗趋势
	GetTrendStats(ctx context.Context, userID string, bucket model.TrendBucket, from, to time.Time) (*model.TrendStatsResponse, error)
	// GetInterviewRoundsStats 面试轮次分布 + 阶段停留时长
	GetInterviewRoundsStats(ctx context.Context, userID string) (*model.InterviewRoundsResponse, error)
	// GetCalendar 日程视图：时间区间内的笔试/面试事件 + 冲突检测
	GetCalendar(ctx context.Context, userID string, from, to time.Time) (*model.CalendarResponse, error)
	// GetInterviewBank 面试题库：跨投递检索自己记录过的面试问题
	GetInterviewBank(ctx context.Context, userID string, filters model.InterviewBankFilters) (*model.InterviewBankResponse, error)
}

type UploadInterviewRecordingParams struct {
	InterviewID string
	FileName    string
	FileType    string
	FileSize    int64
	StorageKey  string
}

type service struct {
	repo appRepo.Repository
}

func NewService(repo appRepo.Repository) Service {
	return &service{repo: repo}
}

func (s *service) List(ctx context.Context, userID string, filters model.JobApplicationFilters) (*model.JobApplicationListResponse, error) {
	normalizeFilters(&filters)
	if err := validateStatuses(filters.Statuses); err != nil {
		return nil, err
	}
	items, total, err := s.repo.List(ctx, userID, filters)
	if err != nil {
		return nil, err
	}
	totalPages := total / filters.PageSize
	if total%filters.PageSize > 0 {
		totalPages++
	}
	return &model.JobApplicationListResponse{
		Items: items,
		Pagination: model.Pagination{
			Page:       filters.Page,
			PageSize:   filters.PageSize,
			Total:      total,
			TotalPages: totalPages,
		},
	}, nil
}

func (s *service) GetByID(ctx context.Context, userID, applicationID string) (*model.JobApplication, error) {
	app, err := s.repo.GetByID(ctx, userID, applicationID)
	return app, mapRepoError(err)
}

func (s *service) Create(ctx context.Context, userID string, req model.CreateJobApplicationRequest) (*model.JobApplication, error) {
	if strings.TrimSpace(req.ResumeID) == "" || strings.TrimSpace(req.TargetTitle) == "" {
		return nil, ErrInvalidPayload
	}
	// JD 允许为空：jd_hash 列 NOT NULL，空 JD 用固定 hash 占位（hashJD 对空串稳定）
	jdText := strings.TrimSpace(req.JDText)
	snapshotVersionID := trimmedOptionalString(req.SnapshotVersionID)
	matchScore, jdScore := extractScores(req)
	app, err := s.repo.Create(ctx, appRepo.CreateApplicationParams{
		UserID:            userID,
		ResumeID:          strings.TrimSpace(req.ResumeID),
		SnapshotVersionID: snapshotVersionID,
		CompanyName:       strings.TrimSpace(req.CompanyName),
		Department:        strings.TrimSpace(req.Department),
		TargetTitle:       strings.TrimSpace(req.TargetTitle),
		JDText:            jdText,
		JDHash:            hashJD(jdText),
		PreferredCity:     strings.TrimSpace(req.PreferredCity),
		ApplicationURL:    strings.TrimSpace(req.ApplicationURL),
		NextAction:        strings.TrimSpace(req.NextAction),
		MatchScore:        matchScore,
		JDScore:           jdScore,
	})
	if err != nil {
		return nil, mapRepoError(err)
	}

	if req.MatchResult != nil {
		if _, err := s.repo.CreateAIRun(ctx, userID, app.ID, buildMatchRun(req)); err != nil {
			return nil, mapRepoError(err)
		}
	}
	if req.ScoreResult != nil {
		if _, err := s.repo.CreateAIRun(ctx, userID, app.ID, buildScoreRun(req)); err != nil {
			return nil, mapRepoError(err)
		}
	}
	for _, run := range req.AIRuns {
		if run.SourceSnapshotVersionID == "" {
			run.SourceSnapshotVersionID = snapshotVersionID
		}
		if run.ResumeID == "" {
			run.ResumeID = req.ResumeID
		}
		if _, err := s.repo.CreateAIRun(ctx, userID, app.ID, run); err != nil {
			return nil, mapRepoError(err)
		}
	}

	checklist := deriveChecklist(snapshotVersionID, req.MatchResult, req.ScoreResult)
	if len(checklist) > 0 {
		if _, err := s.repo.ReplaceChecklistItems(ctx, userID, app.ID, checklist); err != nil {
			return nil, mapRepoError(err)
		}
	}
	return s.GetByID(ctx, userID, app.ID)
}

func (s *service) Update(ctx context.Context, userID, applicationID string, req model.UpdateJobApplicationRequest) (*model.JobApplication, error) {
	if req.Status != "" && !isValidStatus(req.Status) {
		return nil, ErrInvalidStatus
	}
	var submittedAt *time.Time
	clearSubmittedAt := false
	if req.SubmittedAt != nil && *req.SubmittedAt > 0 {
		t := time.UnixMilli(*req.SubmittedAt)
		submittedAt = &t
	} else if req.SubmittedAt != nil {
		clearSubmittedAt = true
	}
	var writtenTestAt *time.Time
	clearWrittenTestAt := false
	if req.WrittenTestAt != nil && *req.WrittenTestAt > 0 {
		wt := time.UnixMilli(*req.WrittenTestAt)
		writtenTestAt = &wt
	} else if req.WrittenTestAt != nil {
		clearWrittenTestAt = true
	}
	// PreferredCity 指针语义：nil=未传不更新；空串=清空城市；非空=设置城市
	preferredCityProvided := false
	var preferredCity string
	if req.PreferredCity != nil {
		preferredCityProvided = true
		preferredCity = strings.TrimSpace(*req.PreferredCity)
	}
	// JDText 指针语义：nil=未传不更新；空串=清空 JD；非空=设置 JD
	jdTextProvided := false
	var jdText string
	if req.JDText != nil {
		jdTextProvided = true
		jdText = strings.TrimSpace(*req.JDText)
	}
	params := appRepo.UpdateApplicationParams{
		ResumeID:                  strings.TrimSpace(req.ResumeID),
		SnapshotVersionID:         trimmedOptionalString(req.SnapshotVersionID),
		SnapshotVersionIDProvided: req.SnapshotVersionID != nil,
		CompanyName:               strings.TrimSpace(req.CompanyName),
		Department:                strings.TrimSpace(req.Department),
		TargetTitle:               strings.TrimSpace(req.TargetTitle),
		JDText:                    jdText,
		JDTextProvided:            jdTextProvided,
		PreferredCity:             preferredCity,
		PreferredCityProvided:     preferredCityProvided,
		ApplicationURL:            strings.TrimSpace(req.ApplicationURL),
		NextAction:                strings.TrimSpace(req.NextAction),
		SubmittedAt:               submittedAt,
		ClearSubmittedAt:          clearSubmittedAt,
		WrittenTestAt:             writtenTestAt,
		ClearWrittenTestAt:        clearWrittenTestAt,
		Status:                    req.Status,
	}
	if jdTextProvided {
		params.JDHash = hashJD(jdText)
	}
	app, err := s.repo.Update(ctx, userID, applicationID, params)
	return app, mapRepoError(err)
}

func (s *service) Delete(ctx context.Context, userID, applicationID string) error {
	return mapRepoError(s.repo.Delete(ctx, userID, applicationID))
}

func (s *service) CheckDuplicates(ctx context.Context, userID string, req model.DuplicateJobApplicationRequest) (*model.DuplicateJobApplicationResponse, error) {
	items, err := s.repo.FindDuplicates(ctx, userID, strings.TrimSpace(req.CompanyName), strings.TrimSpace(req.TargetTitle), hashJD(req.JDText))
	if err != nil {
		return nil, err
	}
	return &model.DuplicateJobApplicationResponse{Items: items}, nil
}

func (s *service) UpdateStatus(ctx context.Context, userID, applicationID string, req model.UpdateJobApplicationStatusRequest) (*model.JobApplicationStatusEvent, error) {
	if !isValidStatus(req.Status) {
		return nil, ErrInvalidStatus
	}
	event, err := s.repo.UpdateStatus(ctx, userID, applicationID, req.Status, strings.TrimSpace(req.Note))
	return event, mapRepoError(err)
}

func (s *service) CreateChecklistItem(ctx context.Context, userID, applicationID string, req model.CreateChecklistItemRequest) (*model.JobApplicationChecklistItem, error) {
	req.Title = strings.TrimSpace(req.Title)
	if req.Title == "" {
		return nil, ErrInvalidPayload
	}
	item, err := s.repo.CreateChecklistItem(ctx, userID, applicationID, req)
	return item, mapRepoError(err)
}

func (s *service) UpdateChecklistItem(ctx context.Context, userID, applicationID, itemID string, req model.UpdateChecklistItemRequest) (*model.JobApplicationChecklistItem, error) {
	item, err := s.repo.UpdateChecklistItem(ctx, userID, applicationID, itemID, req)
	return item, mapRepoError(err)
}

func (s *service) DeleteChecklistItem(ctx context.Context, userID, applicationID, itemID string) error {
	return mapRepoError(s.repo.DeleteChecklistItem(ctx, userID, applicationID, itemID))
}

func (s *service) RegenerateChecklist(ctx context.Context, userID, applicationID string) ([]model.JobApplicationChecklistItem, error) {
	app, err := s.repo.GetByID(ctx, userID, applicationID)
	if err != nil {
		return nil, mapRepoError(err)
	}
	var match *model.JDMatchResponse
	var score *model.JDScoreResponse
	for _, run := range app.AIRuns {
		switch run.ResultType {
		case "jd_match":
			var summary model.JDMatchResponse
			if json.Unmarshal(run.Summary, &summary) == nil {
				match = &summary
			}
		case "jd_score":
			var summary model.JDScoreResponse
			if json.Unmarshal(run.Summary, &summary) == nil {
				score = &summary
			}
		}
	}
	items := deriveChecklist(optionalStringValue(app.SnapshotVersionID), match, score)
	result, err := s.repo.ReplaceChecklistItems(ctx, userID, applicationID, items)
	return result, mapRepoError(err)
}

func (s *service) CreateAIRun(ctx context.Context, userID, applicationID string, req model.CreateJobApplicationAIRunRequest) (*model.JobApplicationAIRun, error) {
	if strings.TrimSpace(req.ResultType) == "" {
		return nil, ErrInvalidPayload
	}
	run, err := s.repo.CreateAIRun(ctx, userID, applicationID, req)
	return run, mapRepoError(err)
}

func (s *service) CreateInterview(ctx context.Context, userID, applicationID string, req model.CreateInterviewRequest) (*model.JobApplicationInterview, error) {
	// 终态（offer/rejected/withdrawn）禁止新增面试
	status, err := s.repo.GetStatus(ctx, userID, applicationID)
	if err != nil {
		return nil, mapRepoError(err)
	}
	if isFinalStatus(status) {
		return nil, ErrApplicationFinalized
	}
	existing, err := s.repo.ListInterviews(ctx, userID, applicationID)
	if err != nil {
		return nil, fmt.Errorf("list interviews for validation: %w", err)
	}
	if err := validateCreateInterview(existing, req.Round, req.ScheduledAt); err != nil {
		return nil, err
	}
	item, err := s.repo.CreateInterview(ctx, userID, applicationID, req)
	if err != nil {
		return nil, mapRepoError(err)
	}
	// 创建面试后自动将投递状态更新为"面试中"（非终态且当前非面试）
	if !isFinalStatus(status) && status != model.JobApplicationStatusInterview {
		_, _ = s.repo.UpdateStatus(ctx, userID, applicationID, model.JobApplicationStatusInterview, "")
	}
	return item, nil
}

func (s *service) UpdateInterview(ctx context.Context, userID, applicationID, interviewID string, req model.UpdateInterviewRequest) (*model.JobApplicationInterview, error) {
	// 更新前校验日期：比低权重晚、比高权重早
	existing, err := s.repo.ListInterviews(ctx, userID, applicationID)
	if err != nil {
		return nil, fmt.Errorf("list interviews for validation: %w", err)
	}
	if err := validateUpdateInterviewDate(existing, interviewID, req.Round, req.ScheduledAt); err != nil {
		return nil, err
	}
	item, err := s.repo.UpdateInterview(ctx, userID, applicationID, interviewID, req)
	return item, mapRepoError(err)
}

func (s *service) DeleteInterview(ctx context.Context, userID, applicationID, interviewID string) error {
	existing, err := s.repo.ListInterviews(ctx, userID, applicationID)
	if err != nil {
		return fmt.Errorf("list interviews for validation: %w", err)
	}
	if len(existing) > 1 {
		// 倒序：日期最新排在第一位
		sorted := make([]model.JobApplicationInterview, len(existing))
		copy(sorted, existing)
		sort.Slice(sorted, func(i, j int) bool {
			ai := interviewScheduledOrCreated(sorted[i])
			aj := interviewScheduledOrCreated(sorted[j])
			return ai > aj
		})
		if sorted[0].ID != interviewID {
			return ErrInterviewNotDeletable
		}
	}
	if err := s.repo.DeleteInterview(ctx, userID, applicationID, interviewID); err != nil {
		return mapRepoError(err)
	}

	// 删除唯一一条面试后，状态从「面试中」回退：
	//   有笔试时间 → 笔试；无笔试时间 → 已投递
	// 仅在当前状态为 interview 时回退（终态不回退，避免误改 offer/rejected/withdrawn）
	if len(existing) == 1 {
		app, err := s.repo.GetByID(ctx, userID, applicationID)
		if err == nil && app.Status == model.JobApplicationStatusInterview {
			var next model.JobApplicationStatus
			if app.WrittenTestAt != nil && *app.WrittenTestAt > 0 {
				next = model.JobApplicationStatusWrittenTest
			} else {
				next = model.JobApplicationStatusSubmitted
			}
			_, _ = s.repo.UpdateStatus(ctx, userID, applicationID, next, "")
		}
	}
	return nil
}

func (s *service) UploadInterviewRecording(ctx context.Context, userID, applicationID string, params UploadInterviewRecordingParams) (*model.JobApplicationAttachment, error) {
	if strings.TrimSpace(params.FileName) == "" || strings.TrimSpace(params.StorageKey) == "" {
		return nil, ErrInvalidPayload
	}
	attachment, err := s.repo.CreateInterviewAttachment(ctx, userID, applicationID, appRepo.CreateInterviewAttachmentParams{
		InterviewID: params.InterviewID,
		FileName:    params.FileName,
		FileType:    params.FileType,
		FileSize:    params.FileSize,
		StorageKey:  params.StorageKey,
	})
	return attachment, mapRepoError(err)
}

func (s *service) GetInterviewRecording(ctx context.Context, userID, applicationID, interviewID string) (*model.JobApplicationAttachment, error) {
	attachment, err := s.repo.GetInterviewAttachment(ctx, userID, applicationID, interviewID)
	return attachment, mapRepoError(err)
}

func (s *service) ExportExcel(ctx context.Context, userID string, filters model.JobApplicationFilters) ([]byte, error) {
	filters.Page = 1
	filters.PageSize = 10000
	resp, err := s.List(ctx, userID, filters)
	if err != nil {
		return nil, err
	}

	// 每条记录的面试记录，按 round 建索引；同时收集本次导出范围内出现过的阶段，用于动态建列
	interviewsByItem := make([]map[string]model.JobApplicationInterview, len(resp.Items))
	presentRounds := map[string]bool{}
	for i, item := range resp.Items {
		interviews, err := s.repo.ListInterviews(ctx, userID, item.ID)
		if err != nil {
			return nil, mapRepoError(err)
		}
		byRound := make(map[string]model.JobApplicationInterview, len(interviews))
		for _, it := range interviews {
			byRound[it.Round] = it
			presentRounds[it.Round] = true
		}
		interviewsByItem[i] = byRound
	}

	// 按固定权重（一面→HR面）排序本次实际出现的阶段，未出现的阶段不建列
	rounds := make([]string, 0, len(presentRounds))
	for round := range presentRounds {
		rounds = append(rounds, round)
	}
	sort.Slice(rounds, func(a, b int) bool {
		return interviewRoundWeights[rounds[a]] < interviewRoundWeights[rounds[b]]
	})

	f := excelize.NewFile()
	defer f.Close()
	const sheet = "投递记录"
	f.SetSheetName("Sheet1", sheet)

	header := []string{"公司", "岗位", "投递部门", "投递链接", "关联简历", "关联快照", "投递时间", "意向城市"}
	for _, round := range rounds {
		header = append(header, round, round+"时间")
	}
	header = append(header, "投递状态")
	for col, title := range header {
		cell, _ := excelize.CoordinatesToCellName(col+1, 1)
		f.SetCellStr(sheet, cell, title)
	}

	for row, item := range resp.Items {
		snapshotLabel := item.SnapshotLabel
		if item.SnapshotVersionID == nil {
			snapshotLabel = "未关联版本"
		}
		values := []string{
			item.CompanyName,
			item.TargetTitle,
			item.Department,
			item.ApplicationURL,
			item.ResumeTitle,
			snapshotLabel,
			formatTimePtr(item.SubmittedAt),
			item.PreferredCity,
		}
		byRound := interviewsByItem[row]
		for _, round := range rounds {
			if it, ok := byRound[round]; ok {
				values = append(values, interviewResultCell(it), formatInterviewTime(it))
			} else {
				values = append(values, "", "")
			}
		}
		values = append(values, statusLabel(item.Status))
		for col, value := range values {
			cell, _ := excelize.CoordinatesToCellName(col+1, row+2)
			f.SetCellStr(sheet, cell, value)
		}
	}

	var buf bytes.Buffer
	if err := f.Write(&buf); err != nil {
		return nil, fmt.Errorf("write excel: %w", err)
	}
	return buf.Bytes(), nil
}

// GetFunnelStats 汇总漏斗各阶段计数 + 按简历版本分组的转化数据
func (s *service) GetFunnelStats(ctx context.Context, userID string) (*model.FunnelStatsResponse, error) {
	funnel, err := s.repo.GetFunnelStats(ctx, userID)
	if err != nil {
		return nil, err
	}
	bySnapshot, err := s.repo.GetConversionBySnapshot(ctx, userID)
	if err != nil {
		return nil, err
	}
	return &model.FunnelStatsResponse{
		Funnel:     funnel,
		BySnapshot: bySnapshot,
	}, nil
}

// GetTrendStats 漏斗趋势。bucket 非法时兜底为 week；时间范围缺省为近 3 个月，
// 避免全量扫描历史数据。
func (s *service) GetTrendStats(ctx context.Context, userID string, bucket model.TrendBucket, from, to time.Time) (*model.TrendStatsResponse, error) {
	if bucket != model.TrendBucketWeek && bucket != model.TrendBucketMonth {
		bucket = model.TrendBucketWeek
	}
	if to.IsZero() {
		to = time.Now()
	}
	if from.IsZero() || !from.Before(to) {
		from = to.AddDate(0, -3, 0)
	}

	points, err := s.repo.GetTrendStats(ctx, userID, bucket, from, to)
	if err != nil {
		return nil, err
	}
	return &model.TrendStatsResponse{
		Bucket: bucket,
		From:   from.UnixMilli(),
		To:     to.UnixMilli(),
		Points: points,
	}, nil
}

// GetInterviewRoundsStats 面试轮次分布 + 阶段停留时长（两项均为历史全量口径）
func (s *service) GetInterviewRoundsStats(ctx context.Context, userID string) (*model.InterviewRoundsResponse, error) {
	avg, median, max, dist, err := s.repo.GetInterviewRoundsStats(ctx, userID)
	if err != nil {
		return nil, err
	}
	stages, err := s.repo.GetStageDurationStats(ctx, userID)
	if err != nil {
		return nil, err
	}
	return &model.InterviewRoundsResponse{
		Avg:            avg,
		Median:         median,
		Max:            max,
		Distribution:   dist,
		StageDurations: stages,
	}, nil
}

// defaultInterviewDurationMs 面试/笔试未填 scheduledEnd 时的兜底时长（1 小时）
// 大部分校招面试在 45-60 分钟，比"点时间冲突"更符合实际直觉
const defaultInterviewDurationMs int64 = 60 * 60 * 1000

func effectiveEnd(ev model.CalendarEvent) int64 {
	if ev.ScheduledEnd > ev.ScheduledAt {
		return ev.ScheduledEnd
	}
	return ev.ScheduledAt + defaultInterviewDurationMs
}

// detectConflicts 用区间合并法（events 已按 scheduledAt 升序）扫描重叠聚簇：
// 时间区间连成一片的事件归入同一组，仅当组内 ≥ 2 个事件才算冲突组。
// 就地写入 ConflictGroupID（从 1 递增），返回冲突组总数。
func detectConflicts(events []model.CalendarEvent) int {
	if len(events) < 2 {
		return 0
	}
	groupID := 0
	clusterStart := 0
	clusterMaxEnd := effectiveEnd(events[0])
	for i := 1; i < len(events); i++ {
		if events[i].ScheduledAt < clusterMaxEnd {
			if e := effectiveEnd(events[i]); e > clusterMaxEnd {
				clusterMaxEnd = e
			}
			continue
		}
		// 当前事件与聚簇无交集，若上一聚簇 ≥ 2 事件则登记为冲突组
		if i-clusterStart >= 2 {
			groupID++
			for j := clusterStart; j < i; j++ {
				events[j].ConflictGroupID = groupID
			}
		}
		clusterStart = i
		clusterMaxEnd = effectiveEnd(events[i])
	}
	if len(events)-clusterStart >= 2 {
		groupID++
		for j := clusterStart; j < len(events); j++ {
			events[j].ConflictGroupID = groupID
		}
	}
	return groupID
}

// GetCalendar 时间区间内的笔试/面试事件；缺省窗口为当前月 ±7 天。
// 冲突检测在应用层实时计算，不落库。
func (s *service) GetCalendar(ctx context.Context, userID string, from, to time.Time) (*model.CalendarResponse, error) {
	if from.IsZero() || to.IsZero() {
		now := time.Now()
		monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
		if from.IsZero() {
			from = monthStart.AddDate(0, 0, -7)
		}
		if to.IsZero() {
			to = monthStart.AddDate(0, 1, 7)
		}
	}
	if !from.Before(to) {
		return nil, fmt.Errorf("invalid time range: from must be before to")
	}

	events, err := s.repo.CalendarEvents(ctx, userID, from, to)
	if err != nil {
		return nil, err
	}
	conflicts := detectConflicts(events)
	return &model.CalendarResponse{Events: events, Conflicts: conflicts}, nil
}

// 题库轮次筛选允许的取值，防止任意字符串打到数据库
var interviewBankRounds = map[string]bool{
	"一面": true, "二面": true, "三面": true, "主管面": true, "HR面": true, "其他": true,
}

func (s *service) GetInterviewBank(ctx context.Context, userID string, f model.InterviewBankFilters) (*model.InterviewBankResponse, error) {
	f.Keyword = strings.TrimSpace(f.Keyword)
	f.Company = strings.TrimSpace(f.Company)
	f.Round = strings.TrimSpace(f.Round)
	if !interviewBankRounds[f.Round] {
		f.Round = ""
	}
	// 只接受受支持的时间窗，其余按「全部」处理
	if f.RangeDays != 30 && f.RangeDays != 90 && f.RangeDays != 365 {
		f.RangeDays = 0
	}
	if f.Page < 1 {
		f.Page = 1
	}
	if f.PageSize < 1 || f.PageSize > 100 {
		f.PageSize = 20
	}

	items, total, companies, err := s.repo.ListInterviewBank(ctx, userID, f)
	if err != nil {
		return nil, err
	}
	totalPages := total / f.PageSize
	if total%f.PageSize > 0 {
		totalPages++
	}
	if totalPages < 1 {
		totalPages = 1
	}
	return &model.InterviewBankResponse{
		Items: items,
		Pagination: model.Pagination{
			Page:       f.Page,
			PageSize:   f.PageSize,
			Total:      total,
			TotalPages: totalPages,
		},
		Meta: model.InterviewBankMeta{TotalRecords: total, TotalCompanies: companies},
	}, nil
}

// interviewResultCell 有结果则拼接为「通过」「终止」，否则留空表示进行中/待反馈
func interviewResultCell(it model.JobApplicationInterview) string {
	return it.Result
}

func normalizeFilters(filters *model.JobApplicationFilters) {
	if filters.Page < 1 {
		filters.Page = 1
	}
	if filters.PageSize < 1 {
		filters.PageSize = 20
	}
	if filters.PageSize > 10000 {
		filters.PageSize = 10000
	}
	filters.Keyword = strings.TrimSpace(filters.Keyword)
	filters.Company = strings.TrimSpace(filters.Company)
	filters.ResumeID = strings.TrimSpace(filters.ResumeID)
}

func extractScores(req model.CreateJobApplicationRequest) (*int, *int) {
	var matchScore *int
	var jdScore *int
	if req.MatchResult != nil {
		v := req.MatchResult.MatchScore
		matchScore = &v
	}
	if req.ScoreResult != nil {
		v := req.ScoreResult.OverallScore
		jdScore = &v
	}
	return matchScore, jdScore
}

func buildMatchRun(req model.CreateJobApplicationRequest) model.CreateJobApplicationAIRunRequest {
	summary, _ := json.Marshal(compactMatchSummary(req.MatchResult))
	return model.CreateJobApplicationAIRunRequest{
		ResumeID:                req.ResumeID,
		SourceSnapshotVersionID: trimmedOptionalString(req.SnapshotVersionID),
		ResultType:              "jd_match",
		Summary:                 summary,
		Model:                   req.MatchResult.Model,
		ConversationID:          req.MatchResult.ConversationID,
	}
}

func buildScoreRun(req model.CreateJobApplicationRequest) model.CreateJobApplicationAIRunRequest {
	summary, _ := json.Marshal(compactScoreSummary(req.ScoreResult))
	return model.CreateJobApplicationAIRunRequest{
		ResumeID:                req.ResumeID,
		SourceSnapshotVersionID: trimmedOptionalString(req.SnapshotVersionID),
		ResultType:              "jd_score",
		Summary:                 summary,
		Model:                   req.ScoreResult.Model,
		ConversationID:          req.ScoreResult.ConversationID,
	}
}

func compactMatchSummary(result *model.JDMatchResponse) *model.JDMatchResponse {
	if result == nil {
		return nil
	}
	copy := *result
	copy.RawText = ""
	copy.JDText = ""
	return &copy
}

func compactScoreSummary(result *model.JDScoreResponse) *model.JDScoreResponse {
	if result == nil {
		return nil
	}
	copy := *result
	copy.RawText = ""
	copy.JDText = ""
	return &copy
}

func deriveChecklist(snapshotID string, match *model.JDMatchResponse, score *model.JDScoreResponse) []model.CreateChecklistItemRequest {
	items := []model.CreateChecklistItemRequest{}
	seen := map[string]bool{}
	add := func(category, title, detail, source string) {
		title = strings.TrimSpace(title)
		if title == "" {
			return
		}
		key := strings.ToLower(category + "|" + title)
		if seen[key] {
			return
		}
		seen[key] = true
		items = append(items, model.CreateChecklistItemRequest{
			Source:                  source,
			SourceSnapshotVersionID: snapshotID,
			Category:                category,
			Title:                   title,
			Detail:                  strings.TrimSpace(detail),
			SortOrder:               len(items) + 1,
		})
	}

	if match != nil {
		for _, gap := range match.Gaps {
			add("能力缺口", gap.Requirement, gap.Suggestion, "jd_match")
		}
		for _, suggestion := range match.ResumeSuggestions {
			add("简历修改", suggestion.Title, suggestion.Suggestion, "jd_match")
		}
		for _, item := range match.ActionItems {
			add("下一步行动", item, "", "jd_match")
		}
	}
	if score != nil {
		for _, check := range score.Breakdown.ATS.Checks {
			if !check.Passed {
				add("ATS", check.Description, check.Suggestion, "jd_score")
			}
		}
		for _, keyword := range score.Breakdown.KeywordMatch.Missing {
			add("关键词", "补充关键词："+keyword, "", "jd_score")
		}
		for _, improvement := range score.Improvements {
			add("提分建议", improvement.Action, fmt.Sprintf("预计提升 %d 分，优先级：%s", improvement.PotentialGain, improvement.Priority), "jd_score")
		}
		if score.Breakdown.SeniorityFit.LevelMatch != "" && score.Breakdown.SeniorityFit.Score < 80 {
			add("资历匹配", "强化资历匹配表达", score.Breakdown.SeniorityFit.LevelMatch, "jd_score")
		}
	}
	return items
}

func hashJD(jdText string) string {
	normalized := strings.Join(strings.Fields(strings.ToLower(jdText)), " ")
	sum := sha256.Sum256([]byte(normalized))
	return hex.EncodeToString(sum[:])
}

func validateStatuses(statuses []model.JobApplicationStatus) error {
	for _, status := range statuses {
		if !isValidStatus(status) {
			return ErrInvalidStatus
		}
	}
	return nil
}

func isValidStatus(status model.JobApplicationStatus) bool {
	switch status {
	case model.JobApplicationStatusPendingAdaptation,
		model.JobApplicationStatusAdapted,
		model.JobApplicationStatusSubmitted,
		model.JobApplicationStatusWrittenTest,
		model.JobApplicationStatusInterview,
		model.JobApplicationStatusOffer,
		model.JobApplicationStatusRejected,
		model.JobApplicationStatusWithdrawn:
		return true
	default:
		return false
	}
}

func mapRepoError(err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, appRepo.ErrApplicationNotFound) {
		return ErrApplicationNotFound
	}
	if errors.Is(err, appRepo.ErrInvalidAssociation) {
		return ErrInvalidAssociation
	}
	if appRepo.IsCheckViolation(err) {
		return ErrInvalidStatus
	}
	return err
}

func intPtrString(value *int) string {
	if value == nil {
		return ""
	}
	return fmt.Sprintf("%d", *value)
}

func formatTimePtr(value *int64) string {
	if value == nil {
		return ""
	}
	return formatTime(*value)
}

func formatTime(value int64) string {
	if value <= 0 {
		return ""
	}
	return time.UnixMilli(value).Format("2006-01-02 15:04")
}

// 面试时间段: 有结束时间 → "2026-07-05 09:00-10:00"，否则 → "2026-07-05"
func formatInterviewTime(it model.JobApplicationInterview) string {
	if it.ScheduledAt == nil || *it.ScheduledAt <= 0 {
		return ""
	}
	start := time.UnixMilli(*it.ScheduledAt).Format("2006-01-02 15:04")
	if it.ScheduledEnd != nil && *it.ScheduledEnd > 0 {
		end := time.UnixMilli(*it.ScheduledEnd).Format("15:04")
		return start + "-" + end
	}
	return time.UnixMilli(*it.ScheduledAt).Format("2006-01-02")
}

func statusLabel(status model.JobApplicationStatus) string {
	switch status {
	case model.JobApplicationStatusPendingAdaptation:
		return "待适配"
	case model.JobApplicationStatusAdapted:
		return "已适配"
	case model.JobApplicationStatusSubmitted:
		return "已投递"
	case model.JobApplicationStatusWrittenTest:
		return "笔试"
	case model.JobApplicationStatusInterview:
		return "面试"
	case model.JobApplicationStatusOffer:
		return "offer"
	case model.JobApplicationStatusRejected:
		return "拒绝"
	case model.JobApplicationStatusWithdrawn:
		return "放弃"
	default:
		return string(status)
	}
}

func trimmedOptionalString(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}

func optionalStringValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

// isFinalStatus 判断是否终态（offer/rejected/withdrawn）
func isFinalStatus(status model.JobApplicationStatus) bool {
	switch status {
	case model.JobApplicationStatusOffer,
		model.JobApplicationStatusRejected,
		model.JobApplicationStatusWithdrawn:
		return true
	default:
		return false
	}
}

// interviewScheduledOrCreated 取面试日期，缺失时回退到创建时间
func interviewScheduledOrCreated(it model.JobApplicationInterview) int64 {
	if it.ScheduledAt != nil {
		return *it.ScheduledAt
	}
	return it.CreatedAt
}

// roundWeight 返回面试阶段权重，未知阶段返回 0
func roundWeight(round string) int {
	return interviewRoundWeights[round]
}

// validateCreateInterview 校验新增面试：查重 + 前置顺序 + 日期递增
func validateCreateInterview(existing []model.JobApplicationInterview, round string, scheduledAt *int64) error {
	w := roundWeight(round)
	if w == 0 {
		return ErrInterviewRoundInvalid
	}
	// 步骤1：查重
	for _, it := range existing {
		if it.Round == round {
			return fmt.Errorf("%w: 该岗位已存在【%s】记录，不可重复添加", ErrInterviewRoundDuplicated, round)
		}
	}
	// 步骤2：前置顺序（支持跳阶段，但需至少一个更低权重）
	if w > 1 {
		hasEarlier := false
		for _, it := range existing {
			if roundWeight(it.Round) > 0 && roundWeight(it.Round) < w {
				hasEarlier = true
				break
			}
		}
		if !hasEarlier {
			return fmt.Errorf("%w: 新增【%s】需至少存在一轮更早面试", ErrInterviewNoPrerequisite, round)
		}
	}
	// 步骤3：日期递增（晚于所有权重更小的面试日期）
	if scheduledAt != nil {
		var maxPriorDate int64
		for _, it := range existing {
			if it.ScheduledAt != nil && roundWeight(it.Round) > 0 && roundWeight(it.Round) < w {
				if *it.ScheduledAt > maxPriorDate {
					maxPriorDate = *it.ScheduledAt
				}
			}
		}
		if maxPriorDate > 0 && *scheduledAt <= maxPriorDate {
			return fmt.Errorf("%w: 【%s】日期必须晚于更早面试日期", ErrInterviewDateTooEarly, round)
		}
	}
	return nil
}

// validateUpdateInterviewDate 校验更新某条面试日期：比低权重晚、比高权重早
func validateUpdateInterviewDate(all []model.JobApplicationInterview, targetID, round string, scheduledAt *int64) error {
	w := roundWeight(round)
	if w == 0 {
		return ErrInterviewRoundInvalid
	}
	if scheduledAt == nil {
		return nil
	}
	for _, it := range all {
		if it.ID == targetID {
			continue
		}
		ew := roundWeight(it.Round)
		if ew == 0 {
			continue
		}
		if ew < w && it.ScheduledAt != nil && *it.ScheduledAt >= *scheduledAt {
			return fmt.Errorf("%w: 【%s】日期必须晚于更早面试", ErrInterviewDateConflict, round)
		}
		if ew > w && it.ScheduledAt != nil && *it.ScheduledAt <= *scheduledAt {
			return fmt.Errorf("%w: 【%s】日期必须早于后续面试", ErrInterviewDateConflict, round)
		}
	}
	return nil
}
