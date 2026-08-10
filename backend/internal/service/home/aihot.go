// ============================================================
// AI HOT 数据同步与查询（https://aihot.virxact.com，REST API v1）
// 匿名只读；ETag 条件请求 304 跳过；失败时调用方回退本地缓存或降级
// ============================================================

package home

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"time"

	"resumecraft-pdf-backend/internal/model"
)

// aihotBaseURL AI HOT REST API v1 基地址
const aihotBaseURL = "https://aihot.virxact.com"

// aihotStoryCacheTTL 事件详情本地缓存有效期（1 小时）
const aihotStoryCacheTTL = time.Hour

var aihotPublicIDRe = regexp.MustCompile(`^[0-9a-fA-F-]{36}$`)

// fetchAihotJSON GET 一个 v1 端点：返回 (body, notModified, error)。
// 带 If-None-Match 条件请求；收到 304 时 notModified=true；成功时更新进程内 ETag。
func (s *service) fetchAihotJSON(ctx context.Context, path string) ([]byte, bool, error) {
	s.aihotMu.Lock()
	etag := s.aihotETags[path]
	s.aihotMu.Unlock()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, aihotBaseURL+path, nil)
	if err != nil {
		return nil, false, err
	}
	req.Header.Set("User-Agent", "ResumeCraft-Home/1.0")
	if etag != "" {
		req.Header.Set("If-None-Match", etag)
	}

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, false, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotModified {
		return nil, true, nil
	}
	if resp.StatusCode != http.StatusOK {
		return nil, false, fmt.Errorf("aihot %s: status %d", path, resp.StatusCode)
	}

	if newEtag := resp.Header.Get("ETag"); newEtag != "" {
		s.aihotMu.Lock()
		s.aihotETags[path] = newEtag
		s.aihotMu.Unlock()
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return nil, false, fmt.Errorf("read aihot %s: %w", path, err)
	}
	return body, false, nil
}

// ---- 内部响应结构（与 AI HOT v1 字段对齐） ----

type aihotItemResp struct {
	ID            string `json:"id"`
	Title         string `json:"title"`
	OriginalTitle string `json:"originalTitle"`
	Summary       string `json:"summary"`
	Source        struct {
		Name string `json:"name"`
	} `json:"source"`
	Links struct {
		Aihot    string `json:"aihot"`
		Original string `json:"original"`
	} `json:"links"`
	Category     string    `json:"category"`
	Score        int       `json:"score"`
	PublishedAt  time.Time `json:"publishedAt"`
	DiscoveredAt time.Time `json:"discoveredAt"`
}

type aihotItemsPayload struct {
	Items []aihotItemResp `json:"items"`
}

type aihotHotTopicResp struct {
	Rank   int    `json:"rank"`
	ID     string `json:"id"`
	Title  string `json:"title"`
	Source struct {
		Name string `json:"name"`
	} `json:"source"`
	Links struct {
		Aihot    string `json:"aihot"`
		Original string `json:"original"`
		Story    string `json:"story"`
	} `json:"links"`
	SourceCount int       `json:"sourceCount"`
	SignalCount int       `json:"signalCount"`
	LatestAt    time.Time `json:"latestAt"`
}

type aihotHotTopicsPayload struct {
	Items []aihotHotTopicResp `json:"items"`
}

type aihotDailyPayload struct {
	Report struct {
		Date        string    `json:"date"`
		GeneratedAt time.Time `json:"generatedAt"`
		Links       struct {
			Aihot string `json:"aihot"`
		} `json:"links"`
		// sections 等其余字段原样保留在 raw 中
	} `json:"report"`
}

// ---- 同步 ----

// SyncAihotItems 同步最近 24h 精选快讯（ETag 304 跳过）
func (s *service) SyncAihotItems(ctx context.Context) (*model.SyncResult, error) {
	started := time.Now()
	result := &model.SyncResult{Source: "aihot_items", StartedAt: started.Format(time.RFC3339)}

	body, notModified, err := s.fetchAihotJSON(ctx, "/api/v1/items?mode=selected&window=24h&limit=100")
	if err != nil {
		result.Errors++
		return result, err
	}
	if notModified {
		result.Skipped++
		result.FinishedAt = time.Now().Format(time.RFC3339)
		result.DurationMs = time.Since(started).Milliseconds()
		return result, nil
	}

	var payload aihotItemsPayload
	if err := json.Unmarshal(body, &payload); err != nil {
		result.Errors++
		return result, fmt.Errorf("unmarshal aihot items: %w", err)
	}

	items := make([]model.AihotItem, 0, len(payload.Items))
	for _, it := range payload.Items {
		items = append(items, model.AihotItem{
			ID:            it.ID,
			Title:         it.Title,
			OriginalTitle: it.OriginalTitle,
			Summary:       it.Summary,
			SourceName:    it.Source.Name,
			LinksAihot:    it.Links.Aihot,
			LinksOriginal: it.Links.Original,
			Category:      it.Category,
			Score:         it.Score,
			PublishedAt:   it.PublishedAt,
			DiscoveredAt:  it.DiscoveredAt,
		})
	}

	result.Total = len(items)
	inserted, err := s.aihotRepo.UpsertItems(ctx, items)
	if err != nil {
		result.Errors++
		return result, err
	}
	result.Inserted = inserted
	result.FinishedAt = time.Now().Format(time.RFC3339)
	result.DurationMs = time.Since(started).Milliseconds()
	return result, nil
}

// SyncAihotHotTopics 同步当前热点榜
func (s *service) SyncAihotHotTopics(ctx context.Context) (*model.SyncResult, error) {
	started := time.Now()
	result := &model.SyncResult{Source: "aihot_hot_topics", StartedAt: started.Format(time.RFC3339)}

	body, notModified, err := s.fetchAihotJSON(ctx, "/api/v1/hot-topics")
	if err != nil {
		result.Errors++
		return result, err
	}
	if notModified {
		result.Skipped++
		result.FinishedAt = time.Now().Format(time.RFC3339)
		result.DurationMs = time.Since(started).Milliseconds()
		return result, nil
	}

	var payload aihotHotTopicsPayload
	if err := json.Unmarshal(body, &payload); err != nil {
		result.Errors++
		return result, fmt.Errorf("unmarshal aihot hot topics: %w", err)
	}

	topics := make([]model.AihotHotTopic, 0, len(payload.Items))
	for _, t := range payload.Items {
		topics = append(topics, model.AihotHotTopic{
			Rank:          t.Rank,
			ID:            t.ID,
			Title:         t.Title,
			SourceName:    t.Source.Name,
			LinksAihot:    t.Links.Aihot,
			LinksOriginal: t.Links.Original,
			LinksStory:    t.Links.Story,
			SourceCount:   t.SourceCount,
			SignalCount:   t.SignalCount,
			LatestAt:      t.LatestAt,
		})
	}

	result.Total = len(topics)
	if err := s.aihotRepo.UpsertHotTopics(ctx, topics); err != nil {
		result.Errors++
		return result, err
	}
	result.Inserted = len(topics)
	result.FinishedAt = time.Now().Format(time.RFC3339)
	result.DurationMs = time.Since(started).Milliseconds()
	return result, nil
}

// SyncAihotDaily 同步最新日报（整包 raw 入库）
func (s *service) SyncAihotDaily(ctx context.Context) (*model.SyncResult, error) {
	started := time.Now()
	result := &model.SyncResult{Source: "aihot_daily", StartedAt: started.Format(time.RFC3339)}

	body, notModified, err := s.fetchAihotJSON(ctx, "/api/v1/dailies/latest")
	if err != nil {
		result.Errors++
		return result, err
	}
	if notModified {
		result.Skipped++
		result.FinishedAt = time.Now().Format(time.RFC3339)
		result.DurationMs = time.Since(started).Milliseconds()
		return result, nil
	}

	var payload aihotDailyPayload
	if err := json.Unmarshal(body, &payload); err != nil {
		result.Errors++
		return result, fmt.Errorf("unmarshal aihot daily: %w", err)
	}
	if payload.Report.Date == "" {
		result.Errors++
		return result, fmt.Errorf("aihot daily missing report.date")
	}

	if err := s.aihotRepo.UpsertDaily(ctx, payload.Report.Date, body, payload.Report.Links.Aihot, payload.Report.GeneratedAt); err != nil {
		result.Errors++
		return result, err
	}
	result.Total = 1
	result.Inserted = 1
	result.FinishedAt = time.Now().Format(time.RFC3339)
	result.DurationMs = time.Since(started).Milliseconds()
	return result, nil
}

// ---- 查询 ----

func (s *service) ListAihotItems(ctx context.Context, window, category, q string, limit int) ([]model.AihotItem, error) {
	return s.aihotRepo.ListItems(ctx, window, category, q, limit)
}

func (s *service) GetAihotDaily(ctx context.Context, date string) (*model.AihotDaily, []string, error) {
	daily, err := s.aihotRepo.GetDaily(ctx, date)
	if err != nil {
		return nil, nil, err
	}
	dates, err := s.aihotRepo.ListDailyDates(ctx, 7)
	if err != nil {
		return nil, nil, err
	}
	return daily, dates, nil
}

func (s *service) ListAihotHotTopics(ctx context.Context) ([]model.AihotHotTopic, error) {
	return s.aihotRepo.GetLatestHotTopics(ctx)
}

// GetAihotStory 事件详情：缓存 1 小时内直接返回；过期或缺失则回源拉取并落库
func (s *service) GetAihotStory(ctx context.Context, publicID string) (*model.AihotStory, error) {
	if !aihotPublicIDRe.MatchString(publicID) {
		return nil, fmt.Errorf("invalid aihot story public id")
	}

	if story, fetched, err := s.aihotRepo.GetStory(ctx, publicID); err == nil && story != nil {
		if time.Since(fetched) < aihotStoryCacheTTL {
			return story, nil
		}
	}

	body, _, err := s.fetchAihotJSON(ctx, "/api/v1/stories/"+publicID)
	if err != nil {
		return nil, err
	}
	if err := s.aihotRepo.UpsertStory(ctx, publicID, body); err != nil {
		return nil, err
	}
	// 从缓存读回（仓储统一处理包裹层与嵌套 links 映射）
	story, _, err := s.aihotRepo.GetStory(ctx, publicID)
	if err != nil {
		return nil, err
	}
	if story == nil {
		return nil, fmt.Errorf("aihot story cache missing")
	}
	return story, nil
}
