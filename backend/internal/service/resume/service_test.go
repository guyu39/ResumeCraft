package resume

import (
	"context"
	"errors"
	"testing"

	"resumecraft-pdf-backend/internal/model"
	resumeRepo "resumecraft-pdf-backend/internal/storage/resume"
)

type snapshotRepositoryStub struct {
	resumeRepo.Repository
	userID      string
	resumeID    string
	snapshotID  string
	err         error
	deleteCalls int
}

func (s *snapshotRepositoryStub) ListSnapshots(_ context.Context, userID, resumeID string, _ int, _ bool) ([]model.SnapshotListItem, int, error) {
	s.userID = userID
	s.resumeID = resumeID
	return []model.SnapshotListItem{}, 0, s.err
}

func (s *snapshotRepositoryStub) GetSnapshotDetail(_ context.Context, userID, resumeID, snapshotID string) (*model.VersionSnapshot, []byte, error) {
	s.userID = userID
	s.resumeID = resumeID
	s.snapshotID = snapshotID
	if s.err != nil {
		return nil, nil, s.err
	}
	return &model.VersionSnapshot{ID: snapshotID}, []byte(`{"modules":[]}`), nil
}

func (s *snapshotRepositoryStub) DiffSnapshots(_ context.Context, userID, resumeID, snapshotAID, _ string, _ []map[string]interface{}, _ []map[string]interface{}) (*model.DiffResult, error) {
	s.userID = userID
	s.resumeID = resumeID
	s.snapshotID = snapshotAID
	if s.err != nil {
		return nil, s.err
	}
	return &model.DiffResult{}, nil
}

func (s *snapshotRepositoryStub) DeleteSnapshot(_ context.Context, userID, resumeID, snapshotID string) error {
	s.userID = userID
	s.resumeID = resumeID
	s.snapshotID = snapshotID
	s.deleteCalls++
	return s.err
}

func TestListSnapshotsForwardsOwnerScope(t *testing.T) {
	repo := &snapshotRepositoryStub{}
	svc := NewService(repo)

	if _, err := svc.ListSnapshots(context.Background(), "user-1", "resume-1", 50, false); err != nil {
		t.Fatalf("ListSnapshots returned error: %v", err)
	}
	if repo.userID != "user-1" || repo.resumeID != "resume-1" {
		t.Fatalf("owner scope = (%q, %q), want (user-1, resume-1)", repo.userID, repo.resumeID)
	}
}

func TestGetSnapshotDetailMapsForeignSnapshotToNotFound(t *testing.T) {
	repo := &snapshotRepositoryStub{err: resumeRepo.ErrResumeNotFound}
	svc := NewService(repo)

	_, _, err := svc.GetSnapshotDetail(context.Background(), "user-1", "resume-1", "snapshot-2")
	if !errors.Is(err, ErrResumeNotFound) {
		t.Fatalf("error = %v, want ErrResumeNotFound", err)
	}
	if repo.userID != "user-1" || repo.resumeID != "resume-1" || repo.snapshotID != "snapshot-2" {
		t.Fatalf("scope was not forwarded: %#v", repo)
	}
}

func TestDiffSnapshotsForwardsParentResume(t *testing.T) {
	repo := &snapshotRepositoryStub{}
	svc := NewService(repo)

	_, err := svc.DiffSnapshots(context.Background(), "user-1", "resume-1", model.DiffSnapshotsRequest{
		SnapshotAID: "snapshot-a",
		SnapshotBID: "snapshot-b",
	})
	if err != nil {
		t.Fatalf("DiffSnapshots returned error: %v", err)
	}
	if repo.userID != "user-1" || repo.resumeID != "resume-1" || repo.snapshotID != "snapshot-a" {
		t.Fatalf("scope was not forwarded: %#v", repo)
	}
}

func TestDeleteSnapshotMapsRepositoryErrors(t *testing.T) {
	tests := []struct {
		name    string
		repoErr error
		wantErr error
	}{
		{name: "active snapshot", repoErr: resumeRepo.ErrSnapshotActive, wantErr: ErrSnapshotActive},
		{name: "snapshot in use", repoErr: resumeRepo.ErrSnapshotInUse, wantErr: ErrSnapshotInUse},
		{name: "snapshot not found", repoErr: resumeRepo.ErrResumeNotFound, wantErr: ErrResumeNotFound},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := &snapshotRepositoryStub{err: tt.repoErr}
			svc := NewService(repo)

			err := svc.DeleteSnapshot(context.Background(), "user-1", "resume-1", "snapshot-1")
			if !errors.Is(err, tt.wantErr) {
				t.Fatalf("error = %v, want %v", err, tt.wantErr)
			}
			if repo.deleteCalls != 1 {
				t.Fatalf("DeleteSnapshot calls = %d, want 1", repo.deleteCalls)
			}
			if repo.userID != "user-1" || repo.resumeID != "resume-1" || repo.snapshotID != "snapshot-1" {
				t.Fatalf("scope was not forwarded: %#v", repo)
			}
		})
	}
}
