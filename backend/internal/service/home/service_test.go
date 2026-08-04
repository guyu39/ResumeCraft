package home

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"resumecraft-pdf-backend/internal/model"
	githubStorage "resumecraft-pdf-backend/internal/storage/github"
)

// ============================================================
// 时间解析
// ============================================================

func TestParseFeedTime(t *testing.T) {
	cases := []struct {
		raw  string
		want time.Time
		ok   bool
	}{
		{"Mon, 02 Jan 2006 15:04:05 +0000", time.Date(2006, 1, 2, 15, 4, 5, 0, time.UTC), true}, // RSS RFC1123Z
		{"2006-01-02T15:04:05Z", time.Date(2006, 1, 2, 15, 4, 5, 0, time.UTC), true},            // Atom RFC3339
		{"2006-01-02T15:04:05+08:00", time.Date(2006, 1, 2, 7, 4, 5, 0, time.UTC), true},
		{"", time.Time{}, false},
		{"not-a-date", time.Time{}, false},
	}
	for _, c := range cases {
		got, ok := parseFeedTime(c.raw)
		if ok != c.ok {
			t.Errorf("parseFeedTime(%q) ok=%v, want %v", c.raw, ok, c.ok)
			continue
		}
		if ok && !got.Equal(c.want) {
			t.Errorf("parseFeedTime(%q) = %v, want %v", c.raw, got, c.want)
		}
	}
}

// ============================================================
// RSS / Atom 解析
// ============================================================

func TestFetchFeedRSS(t *testing.T) {
	const rssBody = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <item>
      <title>AI Breakthrough</title>
      <link>https://example.com/ai</link>
      <pubDate>Mon, 02 Jan 2026 15:04:05 +0000</pubDate>
      <description>&lt;p&gt;A &lt;b&gt;big&lt;/b&gt; story&lt;/p&gt;</description>
    </item>
  </channel>
</rss>`

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/rss+xml")
		_, _ = w.Write([]byte(rssBody))
	}))
	defer server.Close()

	svc := &service{client: server.Client()}
	items, err := svc.fetchFeed(context.Background(), "Test", server.URL)
	if err != nil {
		t.Fatalf("fetchFeed failed: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(items))
	}
	item := items[0]
	if item.Title != "AI Breakthrough" {
		t.Errorf("title = %q", item.Title)
	}
	if item.URL != "https://example.com/ai" {
		t.Errorf("url = %q", item.URL)
	}
	if item.Source != "Test" {
		t.Errorf("source = %q", item.Source)
	}
	// 摘要应去除 HTML 标签
	if item.Summary != "A big story" {
		t.Errorf("summary = %q", item.Summary)
	}
	want := time.Date(2026, 1, 2, 15, 4, 5, 0, time.UTC).UnixMilli()
	if item.PublishedAt != want {
		t.Errorf("publishedAt = %d, want %d", item.PublishedAt, want)
	}
}

func TestFetchFeedAtom(t *testing.T) {
	const atomBody = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Feed</title>
  <entry>
    <title>Model Release</title>
    <link href="https://example.com/model"/>
    <published>2026-02-01T10:00:00Z</published>
    <summary>Open source weights released.</summary>
  </entry>
</feed>`

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/atom+xml")
		_, _ = w.Write([]byte(atomBody))
	}))
	defer server.Close()

	svc := &service{client: server.Client()}
	items, err := svc.fetchFeed(context.Background(), "AtomSource", server.URL)
	if err != nil {
		t.Fatalf("fetchFeed failed: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(items))
	}
	if items[0].Title != "Model Release" {
		t.Errorf("title = %q", items[0].Title)
	}
	if items[0].URL != "https://example.com/model" {
		t.Errorf("url = %q", items[0].URL)
	}
}

func TestFetchFeedInvalid(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("<html>not a feed</html>"))
	}))
	defer server.Close()

	svc := &service{client: server.Client()}
	if _, err := svc.fetchFeed(context.Background(), "Bad", server.URL); err == nil {
		t.Fatal("expected error for invalid feed")
	}
}

// ============================================================
// 摘要工具
// ============================================================

func TestStripHTMLAndTruncate(t *testing.T) {
	cleaned := stripHTML("<p>Hello <b>world</b> &amp; friends</p>")
	if cleaned != "Hello world &amp; friends" {
		t.Errorf("stripHTML = %q", cleaned)
	}
	trunc := truncate("一二三四五六七八九十", 6)
	if trunc != "一二三四五六…" {
		t.Errorf("truncate = %q", trunc)
	}
}

// ============================================================
// GitHub 项目同步（mock HTTP）
// ============================================================

// mockGithubRepo 内存版 GitHub 仓库存储，用于隔离测试 Upsert 逻辑
type mockGithubRepo struct {
	items []model.GithubProjectItem
}

func (m *mockGithubRepo) Upsert(_ context.Context, items []model.GithubProjectItem) (int, int, error) {
	m.items = append(m.items, items...)
	return len(items), 0, nil
}

func (m *mockGithubRepo) ListTop(_ context.Context, _ int) ([]model.GithubProjectItem, error) {
	return m.items, nil
}

var _ githubStorage.Repository = (*mockGithubRepo)(nil)

func TestSyncGithubProjects(t *testing.T) {
	const apiBody = `{
	  "items": [
	    {
	      "full_name": "acme/ai-agent",
	      "html_url": "https://github.com/acme/ai-agent",
	      "description": "An AI agent framework",
	      "language": "Go",
	      "stargazers_count": 1234,
	      "forks_count": 56,
	      "topics": ["ai", "agent"]
	    }
	  ]
	}`

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/search/repositories" {
			t.Errorf("unexpected path %q", r.URL.Path)
		}
		if r.UserAgent() == "" {
			t.Error("expected User-Agent header")
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(apiBody))
	}))
	defer server.Close()

	mockRepo := &mockGithubRepo{}
	svc := &service{githubRepo: mockRepo, client: server.Client(), githubAPIBase: server.URL}
	result, err := svc.SyncGithubProjects(context.Background())
	if err != nil {
		t.Fatalf("SyncGithubProjects failed: %v", err)
	}
	if result.Total != 1 || result.Inserted != 1 {
		t.Fatalf("result = %+v", result)
	}
	if len(mockRepo.items) != 1 {
		t.Fatalf("expected 1 upserted item, got %d", len(mockRepo.items))
	}
	got := mockRepo.items[0]
	if got.FullName != "acme/ai-agent" || got.Stars != 1234 || got.Forks != 56 {
		t.Errorf("upserted item = %+v", got)
	}
	if got.Language != "Go" || len(got.Topics) != 2 {
		t.Errorf("language/topics = %+v", got)
	}
}

func TestSyncGithubProjectsAPIError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	}))
	defer server.Close()

	svc := &service{client: server.Client(), githubAPIBase: server.URL}
	result, err := svc.SyncGithubProjects(context.Background())
	if err == nil {
		t.Fatal("expected error for 403 response")
	}
	if result.Errors != 1 {
		t.Fatalf("result.Errors = %d, want 1", result.Errors)
	}
}
