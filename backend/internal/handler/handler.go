package handler

import (
	"resumecraft-pdf-backend/internal/service/ai"
	"resumecraft-pdf-backend/internal/service/auth"
	"resumecraft-pdf-backend/internal/service/export"
	homeservice "resumecraft-pdf-backend/internal/service/home"
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
	homeService        homeservice.Service
	objectStorage      object.ObjectStorage
	parserServiceURL   string
	// 系统级 AI 凭证（.env 配置，服务端内置；简历解析等后台任务使用）
	sysAIAPIKey  string
	sysAIBaseURL string
	sysAIModel   string
}

func New(
	pdfService pdf.Service,
	authService auth.Service,
	resumeService resume.Service,
	exportService export.Service,
	aiService ai.Service,
	applicationService jobapplication.Service,
	jobPostingService job_posting.Service,
	homeService homeservice.Service,
	objectStorage object.ObjectStorage,
	parserServiceURL string,
	sysAIAPIKey, sysAIBaseURL, sysAIModel string,
) *Handler {
	return &Handler{
		pdfService:         pdfService,
		authService:        authService,
		resumeService:      resumeService,
		exportService:      exportService,
		aiService:          aiService,
		applicationService: applicationService,
		jobPostingService:  jobPostingService,
		homeService:        homeService,
		objectStorage:      objectStorage,
		parserServiceURL:   parserServiceURL,
		sysAIAPIKey:        sysAIAPIKey,
		sysAIBaseURL:       sysAIBaseURL,
		sysAIModel:         sysAIModel,
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

func (h *Handler) HomeService() homeservice.Service {
	return h.homeService
}

func (h *Handler) ObjectStorage() object.ObjectStorage {
	return h.objectStorage
}
