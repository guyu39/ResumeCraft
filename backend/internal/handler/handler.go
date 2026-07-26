package handler

import (
	"resumecraft-pdf-backend/internal/service/ai"
	"resumecraft-pdf-backend/internal/service/auth"
	"resumecraft-pdf-backend/internal/service/export"
	jobapplication "resumecraft-pdf-backend/internal/service/job_application"
	"resumecraft-pdf-backend/internal/service/job_posting"
	"resumecraft-pdf-backend/internal/service/pdf"
	"resumecraft-pdf-backend/internal/service/resume"
	"resumecraft-pdf-backend/internal/storage/object"
)

type Handler struct {
	pdfService         pdf.Service
	authService        auth.Service
	resumeService      resume.Service
	exportService      export.Service
	aiService          ai.Service
	applicationService jobapplication.Service
	jobPostingService  job_posting.Service
	objectStorage      object.ObjectStorage
	parserServiceURL   string
}

func New(
	pdfService pdf.Service,
	authService auth.Service,
	resumeService resume.Service,
	exportService export.Service,
	aiService ai.Service,
	applicationService jobapplication.Service,
	jobPostingService job_posting.Service,
	objectStorage object.ObjectStorage,
	parserServiceURL string,
) *Handler {
	return &Handler{
		pdfService:         pdfService,
		authService:        authService,
		resumeService:      resumeService,
		exportService:      exportService,
		aiService:          aiService,
		applicationService: applicationService,
		jobPostingService:  jobPostingService,
		objectStorage:      objectStorage,
		parserServiceURL:   parserServiceURL,
	}
}

func (h *Handler) AuthEnabled() bool {
	return h.authService != nil
}

func (h *Handler) AuthService() auth.Service {
	return h.authService
}

func (h *Handler) ResumeService() resume.Service {
	return h.resumeService
}

func (h *Handler) ExportService() export.Service {
	return h.exportService
}

func (h *Handler) AIService() ai.Service {
	return h.aiService
}

func (h *Handler) ApplicationService() jobapplication.Service {
	return h.applicationService
}

func (h *Handler) JobPostingService() job_posting.Service {
	return h.jobPostingService
}

func (h *Handler) ObjectStorage() object.ObjectStorage {
	return h.objectStorage
}
