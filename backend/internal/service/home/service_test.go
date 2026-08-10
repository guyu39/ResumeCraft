package home

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"resumecraft-pdf-backend/internal/model"
	githubStorage "resumecraft-pdf-backend/internal/storage/github"
	homeStorage "resumecraft-pdf-backend/internal/storage/home"
)

// ============================================================
// 摘要工具
// ============================================================

func TestTruncate(t *testing.T) {
	trunc := truncate("一二三四五六七八九十", 6)
	if trunc != "一二三四五六…" {
		t.Errorf("truncate = %q", trunc)
	}
	if got := truncate("short", 10); got != "short" {
		t.Errorf("truncate short = %q", got)
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

func (m *mockGithubRepo) ListRecent(_ context.Context, _, _ int) ([]model.GithubProjectItem, error) {
	return m.items, nil
}

func (m *mockGithubRepo) UpdateZhContent(_ context.Context, fullName, summaryZh, highlightZh string) error {
	for i := range m.items {
		if m.items[i].FullName == fullName {
			m.items[i].SummaryZh = summaryZh
			m.items[i].HighlightZh = highlightZh
		}
	}
	return nil
}

var _ githubStorage.Repository = (*mockGithubRepo)(nil)

// mockSnapshotRepo 空实现：SyncGithubProjects 会写当日快照，测试无需断言内容
type mockSnapshotRepo struct{}

func (m *mockSnapshotRepo) UpsertDaily(_ context.Context, _ string, _ string, _ []byte) error {
	return nil
}
func (m *mockSnapshotRepo) ListRecent(_ context.Context, _ string, _ int) ([]homeStorage.SnapshotItem, error) {
	return nil, nil
}

var _ homeStorage.SnapshotRepository = (*mockSnapshotRepo)(nil)

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
	svc := &service{githubRepo: mockRepo, snapshotRepo: &mockSnapshotRepo{}, client: server.Client(), githubAPIBase: server.URL}
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
