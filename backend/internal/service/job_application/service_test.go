package job_application

import (
	"context"
	"errors"
	"strings"
	"testing"

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

func TestUpdateStatusRejectsInvalidStatus(t *testing.T) {
	svc := NewService(&mockRepo{})
	_, err := svc.UpdateStatus(context.Background(), "user-1", "app-1", model.UpdateJobApplicationStatusRequest{
		Status: model.JobApplicationStatus("unknown"),
	})
	if !errors.Is(err, ErrInvalidStatus) {
		t.Fatalf("err = %v, want ErrInvalidStatus", err)
	}
}

func TestCreateDoesNotCreateSnapshotAndPersistsDerivedChecklist(t *testing.T) {
	repo := &mockRepo{created: &model.JobApplication{ID: "app-1"}}
	svc := NewService(repo)
	_, err := svc.Create(context.Background(), "user-1", model.CreateJobApplicationRequest{
		ResumeID:          "resume-1",
		SnapshotVersionID: "snapshot-1",
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
			SnapshotVersionID: "snapshot-1",
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

func int64Ptr(v int64) *int64 { return &v }

type mockRepo struct {
	created                *model.JobApplication
	createParams           appRepo.CreateApplicationParams
	listItems              []model.JobApplicationListItem
	replacedChecklistCount int
	createdSnapshot        bool
	interviews             []model.JobApplicationInterview
	status                 model.JobApplicationStatus
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
	return nil, nil
}

func (m *mockRepo) CreateAIRun(ctx context.Context, userID, applicationID string, req model.CreateJobApplicationAIRunRequest) (*model.JobApplicationAIRun, error) {
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
