package ai

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

// HomeContentReport 首页 AI 一次生成的完整结果（日报 + 项目推荐）
type HomeContentReport struct {
	Report  *HomeDailyReport `json:"report"`
	Project []*HomeProject   `json:"projects"`
}

// HomeDailyReport 首页日报（AI 生成结构）
type HomeDailyReport struct {
	Title         string           `json:"title"`
	Theme         string           `json:"theme"`
	TrendKeywords []string         `json:"trendKeywords"`
	Items         []HomeReportItem `json:"items"`
}

// HomeReportItem 日报单条资讯
type HomeReportItem struct {
	Rank        int    `json:"rank"`
	Title       string `json:"title"`
	URL         string `json:"url"`
	Source      string `json:"source"`
	PublishedAt string `json:"publishedAt"` // YYYY-MM-DD
	Rating      int    `json:"rating"`      // 1-5
	Summary     string `json:"summary"`
	Insight     string `json:"insight"`
}

// HomeProject 首页项目推荐（AI 生成结构）
type HomeProject struct {
	Name          string   `json:"name"`
	Tagline       string   `json:"tagline"`
	TechStack     []string `json:"techStack"`
	Modules       []string `json:"modules"`
	ST            string   `json:"st"` // STAR：情境/任务
	A             string   `json:"a"`  // 行动
	R             string   `json:"r"`  // 结果
	Duration      string   `json:"duration"`
	Difficulty    int      `json:"difficulty"` // 1-5
	TrendRelation string   `json:"trendRelation"`
}

var (
	// ErrHomeAIConfigMissing 系统级 AI 凭证未在 .env 配置
	ErrHomeAIConfigMissing = errors.New("system AI provider not configured")
	// ErrHomeAIGenerateFailed AI 生成失败
	ErrHomeAIGenerateFailed = errors.New("home content generate failed")
)

// GenerateHomeContent 使用系统级（.env）AI 凭证一次性生成首页内容。
// 仅调用一次 API，返回日报 + 项目推荐。未配置凭证或调用失败时返回对应错误。
// today 用于标题日期；news 为最近抓取的 AI 新闻素材（可为空，为空时提示 AI 按今天日期编写）。
func GenerateHomeContent(ctx context.Context, apiKey, baseURL, model, today string, news []string) (*HomeContentReport, error) {
	if strings.TrimSpace(apiKey) == "" || strings.TrimSpace(baseURL) == "" || strings.TrimSpace(model) == "" {
		return nil, ErrHomeAIConfigMissing
	}
	if today == "" {
		today = time.Now().Format("2006-01-02")
	}
	newsBlock := "（无素材，请基于你对 AI 行业的最新了解编写，日期用今天）"
	if len(news) > 0 {
		newsBlock = "以下是最近 24 小时抓取到的真实 AI 新闻（标题 | 来源 | 日期）：\n" + strings.Join(news, "\n") + "\n请优先从这些真实素材中挑选，不得编造标题或链接。"
	}

	provider := newAIProvider(nil)
	prompt := fmt.Sprintf(`你是求职产品的内容编辑。请基于今天 %s 的 AI 行业最新动态，一次生成首页「AI 日报」与「简历项目推荐」。

%s

要求：
1. report.items：8 条今日 AI 精选资讯，每条含 rank(1-8)、title、url(真实原文链接)、source、publishedAt(YYYY-MM-DD，必须是 %s 或素材中的真实日期)、rating(1-5)、summary(2-3 句话中文摘要)、insight(对开发者的启示)。
2. report.theme：本期主题短语；report.trendKeywords：3-5 个本周趋势关键词。
3. projects：5 个值得做的 toC 项目，每个含 name、tagline(一句话定位)、techStack(数组)、modules(3-5 个核心功能模块数组)、st(情境/任务)、a(行动)、r(结果)、duration(开发周期)、difficulty(1-5)、trendRelation(与 AI 趋势的关联点)。

只输出一个 JSON 对象，不要任何多余文字，结构：
{"report":{"title":"AI 日报 · %s","theme":"...","trendKeywords":[...],"items":[...]},"projects":[...]}`,
		today, newsBlock, today, today)

	resp, err := provider.Complete(ctx, CompleteRequest{
		APIKey:    apiKey,
		BaseURL:   baseURL,
		Model:     model,
		Prompt:    prompt,
		TimeoutMs: 120000,
		Stream:    false,
		MaxTokens: 8192,
	})
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrHomeAIGenerateFailed, err)
	}

	text := strings.TrimSpace(resp.Text)
	// 剥离可能包裹的 ```json ... ``` 代码块
	if strings.HasPrefix(text, "```") {
		if idx := strings.Index(text, "\n"); idx >= 0 {
			text = text[idx+1:]
		}
		if idx := strings.LastIndex(text, "```"); idx >= 0 {
			text = text[:idx]
		}
		text = strings.TrimSpace(text)
	}

	var result HomeContentReport
	if err := json.Unmarshal([]byte(text), &result); err != nil {
		return nil, fmt.Errorf("%w: invalid JSON: %v", ErrHomeAIGenerateFailed, err)
	}
	return &result, nil
}

// GithubProjectZhInput 待中文加工的 GitHub 项目输入
type GithubProjectZhInput struct {
	FullName    string   `json:"fullName"`
	Description string   `json:"description"`
	Language    string   `json:"language"`
	Topics      []string `json:"topics"`
}

// GithubProjectZhResult AI 中文加工结果
type GithubProjectZhResult struct {
	FullName    string `json:"fullName"`
	SummaryZh   string `json:"summaryZh"`
	HighlightZh string `json:"highlightZh"`
}

// TranslateGithubProjects 使用系统级（.env）AI 凭证将一批 GitHub 项目的英文简介
// 加工为中文：summaryZh（一句话简介）+ highlightZh（求职视角的亮点点评）。
// 一次调用批量处理，减少 API 调用次数；未配置凭证或调用失败时返回错误，
// 调用方应将其视为可降级的后处理步骤（不影响项目本身已同步入库）。
func TranslateGithubProjects(ctx context.Context, apiKey, baseURL, model string, inputs []GithubProjectZhInput) ([]GithubProjectZhResult, error) {
	if strings.TrimSpace(apiKey) == "" || strings.TrimSpace(baseURL) == "" || strings.TrimSpace(model) == "" {
		return nil, ErrHomeAIConfigMissing
	}
	if len(inputs) == 0 {
		return nil, nil
	}

	raw, err := json.Marshal(inputs)
	if err != nil {
		return nil, fmt.Errorf("marshal github zh inputs: %w", err)
	}

	provider := newAIProvider(nil)
	prompt := fmt.Sprintf(`你是求职产品的技术内容编辑，面向正在准备求职的开发者。请将以下 GitHub 开源项目的英文信息加工为中文：

1. summaryZh：用一句中文话（30 字以内）概括项目是做什么的，面向普通开发者，避免直译。
2. highlightZh：1-2 句中文话点评这个项目为什么值得关注（技术亮点、行业热度或对求职简历的参考价值）。

原始项目信息（JSON 数组）：
%s

只输出一个 JSON 数组，每项对应输入的 fullName，不要任何多余文字，结构：
[{"fullName":"owner/repo","summaryZh":"...","highlightZh":"..."}]`, string(raw))

	resp, err := provider.Complete(ctx, CompleteRequest{
		APIKey:    apiKey,
		BaseURL:   baseURL,
		Model:     model,
		Prompt:    prompt,
		TimeoutMs: 60000,
		Stream:    false,
		MaxTokens: 4096,
	})
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrHomeAIGenerateFailed, err)
	}

	text := strings.TrimSpace(resp.Text)
	if strings.HasPrefix(text, "```") {
		if idx := strings.Index(text, "\n"); idx >= 0 {
			text = text[idx+1:]
		}
		if idx := strings.LastIndex(text, "```"); idx >= 0 {
			text = text[:idx]
		}
		text = strings.TrimSpace(text)
	}

	var results []GithubProjectZhResult
	if err := json.Unmarshal([]byte(text), &results); err != nil {
		return nil, fmt.Errorf("%w: invalid JSON: %v", ErrHomeAIGenerateFailed, err)
	}
	return results, nil
}
