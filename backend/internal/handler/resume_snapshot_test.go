package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"resumecraft-pdf-backend/internal/middleware"
	"resumecraft-pdf-backend/internal/model"
	resumeService "resumecraft-pdf-backend/internal/service/resume"

	"github.com/gin-gonic/gin"
)

type snapshotServiceStub struct {
	resumeService.Service
	userID     string
	resumeID   string
	snapshotID string
	deleteErr  error
}

func (s *snapshotServiceStub) ListSnapshots(_ context.Context, userID, resumeID string, _ int, _ bool) (*model.SnapshotListResponse, error) {
	s.userID = userID
	s.resumeID = resumeID
	return &model.SnapshotListResponse{Items: []model.SnapshotListItem{}}, nil
}

func (s *snapshotServiceStub) DiffSnapshots(_ context.Context, userID, resumeID string, _ model.DiffSnapshotsRequest) (*model.DiffResult, error) {
	s.userID = userID
	s.resumeID = resumeID
	return &model.DiffResult{Diffs: []model.FieldDiff{}}, nil
}

func (s *snapshotServiceStub) DeleteSnapshot(_ context.Context, userID, resumeID, snapshotID string) error {
	s.userID = userID
	s.resumeID = resumeID
	s.snapshotID = snapshotID
	return s.deleteErr
}

func TestListSnapshotsPassesAuthenticatedOwner(t *testing.T) {
	gin.SetMode(gin.TestMode)
	service := &snapshotServiceStub{}
	h := New(nil, nil, service, nil, nil, nil, nil, nil, nil, "", "", "", "")
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/resumes/resume-1/snapshots", nil)
	c.Params = gin.Params{{Key: "id", Value: "resume-1"}}
	c.Set(middleware.ContextUserIDKey, "user-1")

	h.ListSnapshots(c)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", recorder.Code, recorder.Body.String())
	}
	if service.userID != "user-1" || service.resumeID != "resume-1" {
		t.Fatalf("owner scope = (%q, %q), want (user-1, resume-1)", service.userID, service.resumeID)
	}
}

func TestDiffSnapshotsPassesAuthenticatedOwner(t *testing.T) {
	gin.SetMode(gin.TestMode)
	service := &snapshotServiceStub{}
	h := New(nil, nil, service, nil, nil, nil, nil, nil, nil, "", "", "", "")
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/resumes/resume-1/snapshots/diff", strings.NewReader(`{"snapshotAId":"a","snapshotBId":"b"}`))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Params = gin.Params{{Key: "id", Value: "resume-1"}}
	c.Set(middleware.ContextUserIDKey, "user-1")

	h.DiffSnapshots(c)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", recorder.Code, recorder.Body.String())
	}
	if service.userID != "user-1" || service.resumeID != "resume-1" {
		t.Fatalf("owner scope = (%q, %q), want (user-1, resume-1)", service.userID, service.resumeID)
	}
}

func TestDeleteSnapshotReturnsConflictReason(t *testing.T) {
	tests := []struct {
		name        string
		serviceErr  error
		wantCode    string
		wantMessage string
	}{
		{
			name:        "active snapshot",
			serviceErr:  resumeService.ErrSnapshotActive,
			wantCode:    "SNAPSHOT_ACTIVE",
			wantMessage: "请先切换到其他分支再删除",
		},
		{
			name:        "snapshot in use",
			serviceErr:  resumeService.ErrSnapshotInUse,
			wantCode:    "SNAPSHOT_IN_USE",
			wantMessage: "该快照已被投递记录使用，无法删除",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gin.SetMode(gin.TestMode)
			service := &snapshotServiceStub{deleteErr: tt.serviceErr}
			h := New(nil, nil, service, nil, nil, nil, nil, nil, nil, "", "", "", "")
			recorder := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(recorder)
			c.Request = httptest.NewRequest(http.MethodDelete, "/api/resumes/resume-1/snapshots/snapshot-1", nil)
			c.Params = gin.Params{
				{Key: "id", Value: "resume-1"},
				{Key: "snapshotId", Value: "snapshot-1"},
			}
			c.Set(middleware.ContextUserIDKey, "user-1")

			h.DeleteSnapshot(c)

			if recorder.Code != http.StatusConflict {
				t.Fatalf("status = %d, want 409; body=%s", recorder.Code, recorder.Body.String())
			}
			if !strings.Contains(recorder.Body.String(), tt.wantCode) || !strings.Contains(recorder.Body.String(), tt.wantMessage) {
				t.Fatalf("body = %s, want code %q and message %q", recorder.Body.String(), tt.wantCode, tt.wantMessage)
			}
			if service.userID != "user-1" || service.resumeID != "resume-1" || service.snapshotID != "snapshot-1" {
				t.Fatalf("scope was not forwarded: %#v", service)
			}
		})
	}
}
