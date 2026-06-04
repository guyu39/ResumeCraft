package resume

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log"
	"time"

	"resumecraft-pdf-backend/internal/model"
)

func generateToken() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func (s *service) CreateShareLink(ctx context.Context, userID string, req model.CreateShareRequest) (*model.ShareLink, error) {
	token := generateToken()
	share, err := s.repo.CreateShareLink(ctx, req.ResumeID, userID, token, req.ExpiresIn)
	if err != nil {
		return nil, err
	}
	return share, nil
}

func (s *service) GetShareLink(ctx context.Context, token string) (*model.ShareLink, error) {
	share, err := s.repo.GetShareLinkByToken(ctx, token)
	if err != nil {
		return nil, err
	}
	if !share.IsActive {
		return nil, fmt.Errorf("share link is deactivated")
	}
	if share.ExpiresAt != nil {
		now := time.Now().UnixMilli()
		if now > *share.ExpiresAt {
			return nil, fmt.Errorf("share link has expired")
		}
	}
	return share, nil
}

func (s *service) ListShareLinks(ctx context.Context, userID, resumeID string) ([]model.ShareLink, error) {
	return s.repo.ListShareLinksByResume(ctx, resumeID, userID)
}

func (s *service) DeactivateShareLink(ctx context.Context, userID, shareID string) error {
	return s.repo.DeactivateShareLink(ctx, shareID, userID)
}

func (s *service) AddComment(ctx context.Context, token, authorName, content, moduleID string, itemIndex int) (*model.ShareComment, error) {
	share, err := s.GetShareLink(ctx, token)
	if err != nil {
		return nil, err
	}
	return s.repo.AddComment(ctx, share.ID, authorName, content, moduleID, itemIndex)
}

func (s *service) ListComments(ctx context.Context, token string) ([]model.ShareComment, error) {
	share, err := s.GetShareLink(ctx, token)
	if err != nil {
		return nil, err
	}
	return s.repo.ListComments(ctx, share.ID)
}

func (s *service) GetShareResumeView(ctx context.Context, token string) (*model.ShareResumeView, error) {
	share, err := s.GetShareLink(ctx, token)
	if err != nil {
		return nil, fmt.Errorf("invalid or expired link")
	}

	// Increment view count (best effort, don't fail the request)
	if err := s.repo.IncrementShareViewCount(ctx, token); err != nil {
		log.Printf("[share] increment view count error: %v", err)
	}

	// Get the resume detail (we use empty userID to skip ownership check for public view)
	// We need a way to get resume by ID without userID. Use the existing GetByID with empty userID
	// Actually, let's find the resume by its creator
	detail, err := s.repo.GetByID(ctx, share.CreatedBy, share.ResumeID)
	if err != nil {
		return nil, fmt.Errorf("resume not found")
	}

	comments, _ := s.repo.ListComments(ctx, share.ID)

	return &model.ShareResumeView{
		Title:      detail.Title,
		Locale:     detail.Locale,
		ThemeColor: detail.ThemeColor,
		Modules:    detail.Modules,
		ShareInfo:  share,
		Comments:   comments,
	}, nil
}

// Ensure package compiles
var _ = log.Printf
