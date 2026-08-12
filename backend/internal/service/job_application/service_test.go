package job_application

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"resumecraft-pdf-backend/internal/model"
	appRepo "resumecraft-pdf-backend/internal/storage/job_application"

	"github.com/xuri/excelize/v2"
)

func TestDeriveChecklistFromMatchAndScore(t *testing.T) {
	items := deriveChecklist("snap-1", &model.JDMatchResponse{
		Gaps: []model.JDGap{
			{Requirement: "React 性能优化", Suggestion: "补充性能优化案例"},
		},
		ResumeSuggestions: []model.JDResumeSuggestion{
			{Title: "项目经历", Suggestion: "突出复杂业务项目"},
		},
		ActionItems: []string{"补充英文简历版本"},
	}, &model.JDScoreResponse{
		Breakdown: model.JDScoreBreakdown{
			ATS: model.JDATSScoreDetail{Checks: []model.JDFormatCheckItem{
				{Passed: false, Description: "缺少量化指标", Suggestion: "补充数字结果"},
			}},
			KeywordMatch: model.JDKeywordMatchDetail{Missing: []string{"TypeScript"}},
			SeniorityFit: model.JDSeniorityFitDetail{Score: 70, LevelMatch: "资历表达偏弱"},
		},
		Improvements: []model.JDScoreImprovement{
			{Action: "强化业务影响", PotentialGain: 8, Priority: "high"},
		},
	})

	if len(items) != 7 {
		t.Fatalf("len(items) = %d, want 7", len(items))
	}
	for _, item := range items {
		if item.SourceSnapshotVersionID != "snap-1" {
			t.Fatalf("source snapshot = %q, want snap-1", item.SourceSnapshotVersionID)
		}
		if item.Title == "" {
			t.Fatal("checklist title should not be empty")
		}
	}
}

// detectConflicts 冲突检测：区间合并法，需覆盖无冲突 / 两两冲突 / 连环冲突 / 无 scheduledEnd 兜底
func TestDetectConflicts(t *testing.T) {
	const hour = int64(60 * 60 * 1000)
	base := int64(1_760_000_000_000)

	cases := []struct {
		name       string
		events     []model.CalendarEvent
		wantGroups int
		wantIDs    []int
	}{
		{
			name: "无冲突：首尾相接不算重叠",
			events: []model.CalendarEvent{
				{ID: "a", ScheduledAt: base, ScheduledEnd: base + hour},
				{ID: "b", ScheduledAt: base + hour, ScheduledEnd: base + 2*hour},
			},
			wantGroups: 0,
			wantIDs:    []int{0, 0},
		},
		{
			name: "两两冲突：半小时重叠",
			events: []model.CalendarEvent{
				{ID: "a", ScheduledAt: base, ScheduledEnd: base + hour},
				{ID: "b", ScheduledAt: base + hour/2, ScheduledEnd: base + hour + hour/2},
			},
			wantGroups: 1,
			wantIDs:    []int{1, 1},
		},
		{
			name: "连环冲突：A-B 重叠、B-C 重叠，三者归为一组",
			events: []model.CalendarEvent{
				{ID: "a", ScheduledAt: base, ScheduledEnd: base + hour},
				{ID: "b", ScheduledAt: base + hour/2, ScheduledEnd: base + hour + hour/2},
				{ID: "c", ScheduledAt: base + hour, ScheduledEnd: base + 2*hour},
			},
			wantGroups: 1,
			wantIDs:    []int{1, 1, 1},
		},
		{
			name: "两个独立冲突组",
			events: []model.CalendarEvent{
				{ID: "a", ScheduledAt: base, ScheduledEnd: base + hour},
				{ID: "b", ScheduledAt: base + hour/2, ScheduledEnd: base + hour},
				{ID: "c", ScheduledAt: base + 5*hour, ScheduledEnd: base + 6*hour},
				{ID: "d", ScheduledAt: base + 5*hour + hour/2, ScheduledEnd: base + 6*hour},
			},
			wantGroups: 2,
			wantIDs:    []int{1, 1, 2, 2},
		},
		{
			name: "无 scheduledEnd 兜底 1 小时后产生冲突",
			events: []model.CalendarEvent{
				{ID: "a", ScheduledAt: base},
				{ID: "b", ScheduledAt: base + hour/2},
			},
			wantGroups: 1,
			wantIDs:    []int{1, 1},
		},
		{
			name: "单个事件不构成冲突",
			events: []model.CalendarEvent{
				{ID: "a", ScheduledAt: base},
			},
			wantGroups: 0,
			wantIDs:    []int{0},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := detectConflicts(tc.events)
			if got != tc.wantGroups {
				t.Fatalf("groups = %d, want %d", got, tc.wantGroups)
			}
			for i, want := range tc.wantIDs {
				if tc.events[i].ConflictGroupID != want {
					t.Fatalf("event[%d].conflictGroupId = %d, want %d", i, tc.events[i].ConflictGroupID, want)
				}
			}
		})
	}
}

// GetCalendar 缺省时间窗口应展开为当前月 ±7 天，避免全量扫描
func TestGetCalendarDefaultsRange(t *testing.T) {
	const hour = int64(60 * 60 * 1000)
	base := int64(1_760_000_000_000)
	repo := &mockRepo{calendarEvents: []model.CalendarEvent{
		{ID: "a", ScheduledAt: base, ScheduledEnd: base + hour},
		{ID: "b", ScheduledAt: base + hour/2, ScheduledEnd: base + hour},
	}}
	svc := NewService(repo)

	resp, err := svc.GetCalendar(context.Background(), "user-1", time.Time{}, time.Time{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.Conflicts != 1 {
		t.Fatalf("conflicts = %d, want 1", resp.Conflicts)
	}
	if len(resp.Events) != 2 {
		t.Fatalf("events = %d, want 2", len(resp.Events))
	}
}

// 时间范围倒置应直接报错，不落到 SQL 层
func TestGetCalendarRejectsInvertedRange(t *testing.T) {
	svc := NewService(&mockRepo{})
	now := time.Now()
	_, err := svc.GetCalendar(context.Background(), "user-1", now, now.Add(-time.Hour))
	if err == nil {
		t.Fatal("expected error for inverted range")
	}
}

func TestUpdateStatusRejectsInvalidStatus(t *testing.T) {
	svc := NewService(&mockRepo{})
	_, err := svc.UpdateStatus(context.Background(), "user-1", "app-1", model.UpdateJobApplicationStatusRequest{
		Status: model.JobApplicationStatus("unknown"),
	})
	if !errors.Is(err, ErrInvalidStatus) {
		t.Fatalf("err = %v, want ErrInvalidStatus", err)
	}
}

// GetTrendStats 非法 bucket 应兜底为 week；缺省时间范围应展开为「近 3 个月」，
// 避免 handler 传入零值时对 repository 发起全量扫描
func TestGetTrendStatsDefaults(t *testing.T) {
	repo := &mockRepo{}
	svc := NewService(repo)
	resp, err := svc.GetTrendStats(context.Background(), "user-1", model.TrendBucket("invalid"), time.Time{}, time.Time{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.Bucket != model.TrendBucketWeek {
		t.Fatalf("bucket = %s, want week", resp.Bucket)
	}
	if repo.trendBucket != model.TrendBucketWeek {
		t.Fatalf("repo bucket = %s, want week", repo.trendBucket)
	}
	if repo.trendTo.IsZero() || repo.trendFrom.IsZero() {
		t.Fatal("from/to should be filled with defaults")
	}
	// 近 3 个月：to - from 应介于 ~89 天与 ~92 天之间（闰月/月份长度差异容忍）
	delta := repo.trendTo.Sub(repo.trendFrom)
	if delta < 24*time.Hour*89 || delta > 24*time.Hour*93 {
		t.Fatalf("default range = %v, want ~3 months", delta)
	}
}

func TestCreateDoesNotCreateSnapshotAndPersistsDerivedChecklist(t *testing.T) {
	repo := &mockRepo{created: &model.JobApplication{ID: "app-1"}}
	svc := NewService(repo)
	snapshotID := "snapshot-1"
	_, err := svc.Create(context.Background(), "user-1", model.CreateJobApplicationRequest{
		ResumeID:          "resume-1",
		SnapshotVersionID: &snapshotID,
		TargetTitle:       "前端工程师",
		JDText:            "负责 React 开发",
		MatchResult: &model.JDMatchResponse{
			MatchScore: 81,
			Gaps:       []model.JDGap{{Requirement: "React", Suggestion: "补充 React 项目"}},
		},
	})
	if err != nil {
		t.Fatalf("Create returned error: %v", err)
	}
	if repo.createParams.SnapshotVersionID != "snapshot-1" {
		t.Fatalf("snapshot id = %q, want snapshot-1", repo.createParams.SnapshotVersionID)
	}
	if repo.createParams.MatchScore == nil || *repo.createParams.MatchScore != 81 {
		t.Fatalf("match score not persisted: %#v", repo.createParams.MatchScore)
	}
	if repo.replacedChecklistCount != 1 {
		t.Fatalf("replaced checklist count = %d, want 1", repo.replacedChecklistCount)
	}
	if repo.createdSnapshot {
		t.Fatal("service should not create resume snapshots")
	}
}

func TestCreateAllowsMissingSnapshotAndLeavesAISourcesEmpty(t *testing.T) {
	repo := &mockRepo{created: &model.JobApplication{ID: "app-1"}}
	svc := NewService(repo)

	_, err := svc.Create(context.Background(), "user-1", model.CreateJobApplicationRequest{
		ResumeID:    "resume-1",
		TargetTitle: "前端工程师",
		JDText:      "负责 React 开发",
		MatchResult: &model.JDMatchResponse{
			MatchScore: 81,
			Gaps:       []model.JDGap{{Requirement: "React", Suggestion: "补充 React 项目"}},
		},
	})
	if err != nil {
		t.Fatalf("Create returned error: %v", err)
	}
	if repo.createParams.SnapshotVersionID != "" {
		t.Fatalf("snapshot id = %q, want empty", repo.createParams.SnapshotVersionID)
	}
	if len(repo.aiRuns) != 1 || repo.aiRuns[0].SourceSnapshotVersionID != "" {
		t.Fatalf("AI runs = %#v, want one run without source snapshot", repo.aiRuns)
	}
	if len(repo.replacedChecklist) != 1 || repo.replacedChecklist[0].SourceSnapshotVersionID != "" {
		t.Fatalf("checklist = %#v, want source snapshot empty", repo.replacedChecklist)
	}
}

func TestCreateStillRejectsMissingRequiredFields(t *testing.T) {
	tests := []struct {
		name string
		req  model.CreateJobApplicationRequest
	}{
		{name: "resume", req: model.CreateJobApplicationRequest{TargetTitle: "工程师", JDText: "JD"}},
		{name: "title", req: model.CreateJobApplicationRequest{ResumeID: "resume-1", JDText: "JD"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := NewService(&mockRepo{}).Create(context.Background(), "user-1", tt.req)
			if !errors.Is(err, ErrInvalidPayload) {
				t.Fatalf("err = %v, want ErrInvalidPayload", err)
			}
		})
	}
}

func TestCreateAllowsEmptyJD(t *testing.T) {
	repo := &mockRepo{created: &model.JobApplication{ID: "app-1"}}
	svc := NewService(repo)

	app, err := svc.Create(context.Background(), "user-1", model.CreateJobApplicationRequest{
		ResumeID:    "resume-1",
		TargetTitle: "后端开发",
		JDText:      "",
	})
	if err != nil {
		t.Fatalf("Create with empty JD returned error: %v", err)
	}
	if app == nil || app.ID != "app-1" {
		t.Fatalf("app = %#v, want id app-1", app)
	}
	if repo.createParams.JDText != "" {
		t.Fatalf("jd text = %q, want empty", repo.createParams.JDText)
	}
	if repo.createParams.JDHash == "" {
		t.Fatalf("jd hash should be a stable placeholder, got empty")
	}
}

func TestUpdateForwardsSnapshotTriState(t *testing.T) {
	repo := &mockRepo{}
	svc := NewService(repo)
	emptySnapshot := ""

	if _, err := svc.Update(context.Background(), "user-1", "app-1", model.UpdateJobApplicationRequest{
		SnapshotVersionID: &emptySnapshot,
	}); err != nil {
		t.Fatalf("Update returned error: %v", err)
	}
	if !repo.updateParams.SnapshotVersionIDProvided || repo.updateParams.SnapshotVersionID != "" {
		t.Fatalf("update params = %#v, want explicit empty snapshot", repo.updateParams)
	}

	if _, err := svc.Update(context.Background(), "user-1", "app-1", model.UpdateJobApplicationRequest{
		ResumeID: "resume-2",
	}); err != nil {
		t.Fatalf("Update returned error: %v", err)
	}
	if repo.updateParams.SnapshotVersionIDProvided {
		t.Fatalf("update params = %#v, want snapshot omitted", repo.updateParams)
	}
}

func TestExportExcelUsesConciseFields(t *testing.T) {
	repo := &mockRepo{
		listItems: []model.JobApplicationListItem{{
			ID:                "app-1",
			CompanyName:       "Acme",
			Department:        "基础架构部",
			TargetTitle:       "前端工程师",
			Status:            model.JobApplicationStatusInterview,
			ResumeTitle:       "主简历",
			SnapshotLabel:     "投递版",
			ApplicationURL:    "https://example.com/job",
			UpdatedAt:         1720000000000,
			SnapshotVersionID: stringPtr("snapshot-1"),
		}},
		interviews: []model.JobApplicationInterview{
			{Round: "一面", Result: "通过", ScheduledAt: int64Ptr(1720000000000)},
			{Round: "二面", Result: "终止"},
		},
	}
	svc := NewService(repo)
	data, err := svc.ExportExcel(context.Background(), "user-1", model.JobApplicationFilters{})
	if err != nil {
		t.Fatalf("ExportExcel returned error: %v", err)
	}
	f, err := excelize.OpenReader(strings.NewReader(string(data)))
	if err != nil {
		t.Fatalf("failed to open generated excel: %v", err)
	}
	defer f.Close()
	rows, err := f.GetRows("投递记录")
	if err != nil {
		t.Fatalf("failed to read rows: %v", err)
	}
	if len(rows) != 2 {
		t.Fatalf("expected header + 1 data row, got %d rows", len(rows))
	}
	header := rows[0]
	wantHeader := []string{"公司", "岗位", "投递部门", "投递链接", "关联简历", "关联快照", "投递时间", "意向城市", "一面", "一面时间", "二面", "二面时间", "投递状态"}
	if strings.Join(header, "|") != strings.Join(wantHeader, "|") {
		t.Fatalf("header = %v, want %v", header, wantHeader)
	}
	dataRow := rows[1]
	joined := strings.Join(dataRow, "|")
	if !strings.Contains(joined, "Acme") || !strings.Contains(joined, "基础架构部") {
		t.Fatalf("excel output missing concise fields: %v", dataRow)
	}
	if !strings.Contains(joined, "通过") || !strings.Contains(joined, "终止") {
		t.Fatalf("excel output missing interview results: %v", dataRow)
	}
	if !strings.HasSuffix(joined, "面试") {
		t.Fatalf("last column should be application status: %v", dataRow)
	}
	if strings.Contains(joined, "负责 React 开发") {
		t.Fatalf("excel should not include full JD text: %v", dataRow)
	}
}

func TestExportExcelLabelsMissingSnapshot(t *testing.T) {
	repo := &mockRepo{listItems: []model.JobApplicationListItem{{
		ID:          "app-1",
		CompanyName: "Acme",
		TargetTitle: "前端工程师",
		ResumeTitle: "主简历",
		Status:      model.JobApplicationStatusPendingAdaptation,
	}}}

	data, err := NewService(repo).ExportExcel(context.Background(), "user-1", model.JobApplicationFilters{})
	if err != nil {
		t.Fatalf("ExportExcel returned error: %v", err)
	}
	f, err := excelize.OpenReader(strings.NewReader(string(data)))
	if err != nil {
		t.Fatalf("failed to open generated excel: %v", err)
	}
	defer f.Close()
	value, err := f.GetCellValue("投递记录", "F2")
	if err != nil {
		t.Fatalf("failed to read snapshot cell: %v", err)
	}
	if value != "未关联版本" {
		t.Fatalf("snapshot cell = %q, want 未关联版本", value)
	}
}

func int64Ptr(v int64) *int64    { return &v }
func stringPtr(v string) *string { return &v }

type mockRepo struct {
	created                *model.JobApplication
	createParams           appRepo.CreateApplicationParams
	updateParams           appRepo.UpdateApplicationParams
	listItems              []model.JobApplicationListItem
	replacedChecklistCount int
	createdSnapshot        bool
	interviews             []model.JobApplicationInterview
	status                 model.JobApplicationStatus
	aiRuns                 []model.CreateJobApplicationAIRunRequest
	replacedChecklist      []model.CreateChecklistItemRequest
	trendBucket            model.TrendBucket
	trendFrom              time.Time
	trendTo                time.Time
	calendarEvents         []model.CalendarEvent
}

func (m *mockRepo) List(ctx context.Context, userID string, filters model.JobApplicationFilters) ([]model.JobApplicationListItem, int, error) {
	return m.listItems, len(m.listItems), nil
}

func (m *mockRepo) GetByID(ctx context.Context, userID, applicationID string) (*model.JobApplication, error) {
	if m.created != nil {
		return m.created, nil
	}
	return &model.JobApplication{ID: applicationID}, nil
}

func (m *mockRepo) Create(ctx context.Context, params appRepo.CreateApplicationParams) (*model.JobApplication, error) {
	m.createParams = params
	return m.created, nil
}

func (m *mockRepo) Update(ctx context.Context, userID, applicationID string, params appRepo.UpdateApplicationParams) (*model.JobApplication, error) {
	m.updateParams = params
	return &model.JobApplication{ID: applicationID}, nil
}

func (m *mockRepo) Delete(ctx context.Context, userID, applicationID string) error { return nil }

func (m *mockRepo) FindDuplicates(ctx context.Context, userID, companyName, targetTitle, jdHash string) ([]model.JobApplicationListItem, error) {
	return nil, nil
}

func (m *mockRepo) UpdateStatus(ctx context.Context, userID, applicationID string, status model.JobApplicationStatus, note string) (*model.JobApplicationStatusEvent, error) {
	return &model.JobApplicationStatusEvent{ApplicationID: applicationID, ToStatus: status}, nil
}

func (m *mockRepo) ListStatusEvents(ctx context.Context, userID, applicationID string) ([]model.JobApplicationStatusEvent, error) {
	return nil, nil
}

func (m *mockRepo) ListChecklistItems(ctx context.Context, userID, applicationID string) ([]model.JobApplicationChecklistItem, error) {
	return nil, nil
}

func (m *mockRepo) CreateChecklistItem(ctx context.Context, userID, applicationID string, req model.CreateChecklistItemRequest) (*model.JobApplicationChecklistItem, error) {
	return &model.JobApplicationChecklistItem{ApplicationID: applicationID, Title: req.Title}, nil
}

func (m *mockRepo) UpdateChecklistItem(ctx context.Context, userID, applicationID, itemID string, req model.UpdateChecklistItemRequest) (*model.JobApplicationChecklistItem, error) {
	return &model.JobApplicationChecklistItem{ID: itemID, ApplicationID: applicationID}, nil
}

func (m *mockRepo) DeleteChecklistItem(ctx context.Context, userID, applicationID, itemID string) error {
	return nil
}

func (m *mockRepo) ReplaceChecklistItems(ctx context.Context, userID, applicationID string, items []model.CreateChecklistItemRequest) ([]model.JobApplicationChecklistItem, error) {
	m.replacedChecklistCount = len(items)
	m.replacedChecklist = append([]model.CreateChecklistItemRequest(nil), items...)
	return nil, nil
}

func (m *mockRepo) CreateAIRun(ctx context.Context, userID, applicationID string, req model.CreateJobApplicationAIRunRequest) (*model.JobApplicationAIRun, error) {
	m.aiRuns = append(m.aiRuns, req)
	return &model.JobApplicationAIRun{ApplicationID: applicationID, ResultType: req.ResultType}, nil
}

func (m *mockRepo) ListAIRuns(ctx context.Context, userID, applicationID string) ([]model.JobApplicationAIRun, error) {
	return nil, nil
}

func (m *mockRepo) ListInterviews(ctx context.Context, userID, applicationID string) ([]model.JobApplicationInterview, error) {
	return m.interviews, nil
}

func (m *mockRepo) CreateInterview(ctx context.Context, userID, applicationID string, req model.CreateInterviewRequest) (*model.JobApplicationInterview, error) {
	return &model.JobApplicationInterview{ApplicationID: applicationID}, nil
}

func (m *mockRepo) UpdateInterview(ctx context.Context, userID, applicationID, interviewID string, req model.UpdateInterviewRequest) (*model.JobApplicationInterview, error) {
	return &model.JobApplicationInterview{ID: interviewID, ApplicationID: applicationID}, nil
}

func (m *mockRepo) DeleteInterview(ctx context.Context, userID, applicationID, interviewID string) error {
	return nil
}

func (m *mockRepo) CreateInterviewAttachment(ctx context.Context, userID, applicationID string, params appRepo.CreateInterviewAttachmentParams) (*model.JobApplicationAttachment, error) {
	return &model.JobApplicationAttachment{InterviewID: params.InterviewID}, nil
}

func (m *mockRepo) GetInterviewAttachment(ctx context.Context, userID, applicationID, interviewID string) (*model.JobApplicationAttachment, error) {
	return &model.JobApplicationAttachment{InterviewID: interviewID}, nil
}

func (m *mockRepo) DeleteInterviewAttachment(ctx context.Context, userID, applicationID, interviewID string) error {
	return nil
}

func (m *mockRepo) GetStatus(ctx context.Context, userID, applicationID string) (model.JobApplicationStatus, error) {
	return m.status, nil
}

func (m *mockRepo) GetFunnelStats(ctx context.Context, userID string) (model.FunnelStats, error) {
	return model.FunnelStats{}, nil
}

func (m *mockRepo) GetConversionBySnapshot(ctx context.Context, userID string) ([]model.SnapshotConversion, error) {
	return nil, nil
}

func (m *mockRepo) GetTrendStats(ctx context.Context, userID string, bucket model.TrendBucket, from, to time.Time) ([]model.TrendPoint, error) {
	m.trendBucket = bucket
	m.trendFrom = from
	m.trendTo = to
	return nil, nil
}

func (m *mockRepo) GetInterviewRoundsStats(ctx context.Context, userID string) (float64, float64, int, []model.RoundBucket, error) {
	return 0, 0, 0, nil, nil
}

func (m *mockRepo) GetStageDurationStats(ctx context.Context, userID string) ([]model.StageDurationStat, error) {
	return nil, nil
}

func (m *mockRepo) CalendarEvents(ctx context.Context, userID string, from, to time.Time) ([]model.CalendarEvent, error) {
	return m.calendarEvents, nil
}

func (m *mockRepo) ListInterviewBank(ctx context.Context, userID string, f model.InterviewBankFilters) ([]model.InterviewBankItem, int, int, error) {
	return nil, 0, 0, nil
}
