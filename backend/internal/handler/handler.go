package handler

import (
	"resumecraft-pdf-backend/internal/service/ai"
	"resumecraft-pdf-backend/internal/service/auth"
	"resumecraft-pdf-backend/internal/service/export"
	"resumecraft-pdf-backend/internal/service/pdf"
	"resumecraft-pdf-backend/internal/service/resume"
)

type Handler struct {
	pdfService    pdf.Service
	authService   auth.Service
	resumeService resume.Service
	exportService export.Service
	aiService     ai.Service
}

func New(
	pdfService pdf.Service,
	authService auth.Service,
	resumeService resume.Service,
	exportService export.Service,
	aiService ai.Service,
) *Handler {
	return &Handler{
		pdfService:    pdfService,
		authService:   authService,
		resumeService: resumeService,
		exportService: exportService,
		aiService:     aiService,
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
