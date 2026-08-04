package ai

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

// HomeContentReport 首页 AI 一次生成的完整结果（日报 + 项目推荐）
type HomeContentReport struct {
	Report  *HomeDailyReport  `json:"report"`
	Project []*HomeProject    `json:"projects"`
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
func GenerateHomeContent(ctx context.Context, apiKey, baseURL, model string) (*HomeContentReport, error) {
	if strings.TrimSpace(apiKey) == "" || strings.TrimSpace(baseURL) == "" || strings.TrimSpace(model) == "" {
		return nil, ErrHomeAIConfigMissing
	}

	provider := newAIProvider(nil)
	prompt := `你是求职产品的内容编辑。请基于 2026 年 8 月 AI 行业最新动态，一次生成首页「AI 日报」与「简历项目推荐」。

要求：
1. report.items：8 条今日 AI 精选资讯，每条含 rank(1-8)、title、url(真实原文链接)、source、publishedAt(YYYY-MM-DD)、rating(1-5)、summary(2-3 句话中文摘要)、insight(对开发者的启示)。
2. report.theme：本期主题短语；report.trendKeywords：3-5 个本周趋势关键词。
3. projects：5 个值得做的 toC 项目，每个含 name、tagline(一句话定位)、techStack(数组)、modules(3-5 个核心功能模块数组)、st(情境/任务)、a(行动)、r(结果)、duration(开发周期)、difficulty(1-5)、trendRelation(与 AI 趋势的关联点)。

只输出一个 JSON 对象，不要任何多余文字，结构：
{"report":{"title":"AI 日报 · 2026-08-04","theme":"...","trendKeywords":[...],"items":[...]},"projects":[...]}`

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
