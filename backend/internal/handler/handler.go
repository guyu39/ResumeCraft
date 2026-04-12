package handler

import "resumecraft-pdf-backend/internal/service/pdf"

type Handler struct {
	pdfService pdf.Service
}

func New(pdfService pdf.Service) *Handler {
	return &Handler{pdfService: pdfService}
}
