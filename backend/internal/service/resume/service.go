package resume

import (
	"context"
	"errors"

	"resumecraft-pdf-backend/internal/model"
	"resumecraft-pdf-backend/internal/storage/resume"
)

var (
	ErrResumeNotFound  = errors.New("resume not found")
	ErrDuplicateTitle = errors.New("resume title already exists")
)

type Service interface {
	List(ctx context.Context, userID string, page, pageSize int, keyword string) (*model.ResumeListResponse, error)
	Create(ctx context.Context, userID string, req model.CreateResumeRequest) (*model.ResumeListItem, error)
	GetByID(ctx context.Context, userID, resumeID string) (*model.ResumeDetail, error)
	Update(ctx context.Context, userID, resumeID string, req model.UpdateResumeRequest) (*model.ResumeUpdateResponse, error)
	Delete(ctx context.Context, userID, resumeID string) error
	RestoreVersion(ctx context.Context, userID, resumeID, versionID string) (*model.ResumeUpdateResponse, error)
}

type service struct {
	repo resume.Repository
}

func NewService(repo resume.Repository) Service {
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
		if errors.Is(err, resume.ErrResumeNotFound) {
			return nil, ErrResumeNotFound
		}
		return nil, err
	}
	return detail, nil
}

func (s *service) Update(ctx context.Context, userID, resumeID string, req model.UpdateResumeRequest) (*model.ResumeUpdateResponse, error) {
	resp, err := s.repo.Update(ctx, userID, resumeID, req)
	if err != nil {
		if errors.Is(err, resume.ErrResumeNotFound) {
			return nil, ErrResumeNotFound
		}
		return nil, err
	}
	return resp, nil
}

func (s *service) Delete(ctx context.Context, userID, resumeID string) error {
	err := s.repo.Delete(ctx, userID, resumeID)
	if err != nil {
		if errors.Is(err, resume.ErrResumeNotFound) {
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
		if errors.Is(err, resume.ErrResumeNotFound) {
			return nil, ErrResumeNotFound
		}
		return nil, err
	}

	// 恢复简历
	resp, err := s.repo.RestoreFromVersion(ctx, userID, resumeID, versionContent)
	if err != nil {
		if errors.Is(err, resume.ErrResumeNotFound) {
			return nil, ErrResumeNotFound
		}
		return nil, err
	}
	return resp, nil
}