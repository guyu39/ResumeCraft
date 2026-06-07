package resume

import (
	"context"
	"errors"

	"resumecraft-pdf-backend/internal/model"
	resumeRepo "resumecraft-pdf-backend/internal/storage/resume"
)

var (
	ErrResumeNotFound  = errors.New("resume not found")
	ErrDuplicateTitle  = errors.New("resume title already exists")
	ErrDuplicateLabel  = errors.New("snapshot label already exists")
	ErrVersionConflict = errors.New("version conflict")
)

type Service interface {
	List(ctx context.Context, userID string, page, pageSize int, keyword string) (*model.ResumeListResponse, error)
	Create(ctx context.Context, userID string, req model.CreateResumeRequest) (*model.ResumeListItem, error)
	GetByID(ctx context.Context, userID, resumeID string) (*model.ResumeDetail, error)
	Update(ctx context.Context, userID, resumeID string, req model.UpdateResumeRequest) (*model.ResumeUpdateResponse, error)
	Delete(ctx context.Context, userID, resumeID string) error
	RestoreVersion(ctx context.Context, userID, resumeID, versionID string) (*model.ResumeUpdateResponse, error)

	// 版本快照
	ListSnapshots(ctx context.Context, resumeID string, limit int, includeAuto bool) (*model.SnapshotListResponse, error)
	CreateManualSnapshot(ctx context.Context, userID, resumeID string, label string) (*model.VersionSnapshot, error)
	UpdateSnapshotLabel(ctx context.Context, snapshotID, userID string, label string) error
	DeleteSnapshot(ctx context.Context, snapshotID, userID string) error
	GetSnapshotDetail(ctx context.Context, snapshotID, userID string) (*model.VersionSnapshot, []byte, error)
	DiffSnapshots(ctx context.Context, userID string, req model.DiffSnapshotsRequest) (*model.DiffResult, error)

	// 分享链接
	CreateShareLink(ctx context.Context, userID string, req model.CreateShareRequest) (*model.ShareLink, error)
	GetShareLink(ctx context.Context, token string) (*model.ShareLink, error)
	ListShareLinks(ctx context.Context, userID, resumeID string) ([]model.ShareLink, error)
	DeactivateShareLink(ctx context.Context, userID, shareID string) error

	// 分享评论
	AddComment(ctx context.Context, token, authorName, content, moduleID, visitorID string, itemIndex int, snapshotID *string) (*model.ShareComment, error)
	ListComments(ctx context.Context, token, visitorID, snapshotID string) ([]model.ShareComment, error)
	DeleteComment(ctx context.Context, commentID string) error
	ListAllComments(ctx context.Context, userID, resumeID string) (*model.AdminCommentsResponse, error)

	// 分享视图
	GetShareResumeView(ctx context.Context, token string) (*model.ShareResumeView, error)
}

type service struct {
	repo resumeRepo.Repository
}

func NewService(repo resumeRepo.Repository) Service {
	return &service{repo: repo}
}

func (s *service) List(ctx context.Context, userID string, page, pageSize int, keyword string) (*model.ResumeListResponse, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = 20
	}
	if pageSize > 100 {
		pageSize = 100
	}

	items, total, err := s.repo.List(ctx, userID, page, pageSize, keyword)
	if err != nil {
		return nil, err
	}

	totalPages := total / pageSize
	if total%pageSize > 0 {
		totalPages++
	}

	return &model.ResumeListResponse{
		Items: items,
		Pagination: model.Pagination{
			Page:       page,
			PageSize:   pageSize,
			Total:      total,
			TotalPages: totalPages,
		},
	}, nil
}

func (s *service) Create(ctx context.Context, userID string, req model.CreateResumeRequest) (*model.ResumeListItem, error) {
	exists, err := s.repo.FindByTitle(ctx, userID, req.Title)
	if err != nil {
		return nil, err
	}
	if exists {
		return nil, ErrDuplicateTitle
	}
	return s.repo.Create(ctx, userID, req)
}

func (s *service) GetByID(ctx context.Context, userID, resumeID string) (*model.ResumeDetail, error) {
	detail, err := s.repo.GetByID(ctx, userID, resumeID)
	if err != nil {
		if errors.Is(err, resumeRepo.ErrResumeNotFound) {
			return nil, ErrResumeNotFound
		}
		return nil, err
	}
	return detail, nil
}

func (s *service) Update(ctx context.Context, userID, resumeID string, req model.UpdateResumeRequest) (*model.ResumeUpdateResponse, error) {
	resp, err := s.repo.Update(ctx, userID, resumeID, req)
	if err != nil {
		if errors.Is(err, resumeRepo.ErrResumeNotFound) {
			return nil, ErrResumeNotFound
		}
		if errors.Is(err, resumeRepo.ErrVersionConflict) {
			return nil, ErrVersionConflict
		}
		return nil, err
	}
	return resp, nil
}

func (s *service) Delete(ctx context.Context, userID, resumeID string) error {
	err := s.repo.Delete(ctx, userID, resumeID)
	if err != nil {
		if errors.Is(err, resumeRepo.ErrResumeNotFound) {
			return ErrResumeNotFound
		}
		return err
	}
	return nil
}

func (s *service) RestoreVersion(ctx context.Context, userID, resumeID, versionID string) (*model.ResumeUpdateResponse, error) {
	// 获取版本内容
	versionContent, err := s.repo.GetVersionContent(ctx, versionID)
	if err != nil {
		if errors.Is(err, resumeRepo.ErrResumeNotFound) {
			return nil, ErrResumeNotFound
		}
		return nil, err
	}

	// 恢复简历
	resp, err := s.repo.RestoreFromVersion(ctx, userID, resumeID, versionContent)
	if err != nil {
		if errors.Is(err, resumeRepo.ErrResumeNotFound) {
			return nil, ErrResumeNotFound
		}
		if errors.Is(err, resumeRepo.ErrVersionConflict) {
			return nil, ErrVersionConflict
		}
		return nil, err
	}
	return resp, nil
}

// ---------- 版本快照 Service 实现 ----------

func (s *service) ListSnapshots(ctx context.Context, resumeID string, limit int, includeAuto bool) (*model.SnapshotListResponse, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	items, total, err := s.repo.ListSnapshots(ctx, resumeID, limit, includeAuto)
	if err != nil {
		return nil, err
	}
	return &model.SnapshotListResponse{
		Items:   items,
		Total:   total,
		HasMore: len(items) < total,
	}, nil
}

func (s *service) CreateManualSnapshot(ctx context.Context, userID, resumeID string, label string) (*model.VersionSnapshot, error) {
	snapshot, err := s.repo.CreateManualSnapshot(ctx, userID, resumeID, label)
	if err != nil {
		if errors.Is(err, resumeRepo.ErrDuplicateLabel) {
			return nil, ErrDuplicateLabel
		}
		return nil, err
	}
	return snapshot, nil
}

func (s *service) UpdateSnapshotLabel(ctx context.Context, snapshotID, userID string, label string) error {
	return s.repo.UpdateSnapshotLabel(ctx, snapshotID, userID, label)
}

func (s *service) DeleteSnapshot(ctx context.Context, snapshotID, userID string) error {
	err := s.repo.DeleteSnapshot(ctx, snapshotID, userID)
	if errors.Is(err, resumeRepo.ErrResumeNotFound) {
		return ErrResumeNotFound
	}
	return err
}

func (s *service) GetSnapshotDetail(ctx context.Context, snapshotID, userID string) (*model.VersionSnapshot, []byte, error) {
	snapshot, content, err := s.repo.GetSnapshotDetail(ctx, snapshotID)
	if err != nil {
		if errors.Is(err, resumeRepo.ErrResumeNotFound) {
			return nil, nil, ErrResumeNotFound
		}
		return nil, nil, err
	}
	return snapshot, content, nil
}

func (s *service) DiffSnapshots(ctx context.Context, userID string, req model.DiffSnapshotsRequest) (*model.DiffResult, error) {
	return s.repo.DiffSnapshots(ctx, req.SnapshotAID, req.SnapshotBID, req.CurrentModules, req.ComparisonModules)
}
