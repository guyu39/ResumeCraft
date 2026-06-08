package handler

import (
	"log"
	"net/http"
	"strings"

	"resumecraft-pdf-backend/internal/model"
	"resumecraft-pdf-backend/pkg/response"

	"github.com/gin-gonic/gin"
)

func (h *Handler) ExportPDF(c *gin.Context) {
	var req model.ExportPDFRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "请求参数不合法")
		return
	}

	html := strings.TrimSpace(req.HTML)
	if html == "" {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "html 不能为空")
		return
	}

	pdfBytes, err := h.pdfService.RenderHTML(html)
	if err != nil {
		log.Printf("[pdf-backend] export failed: %v", err)
		response.JSONError(c, http.StatusInternalServerError, "EXPORT_FAILED", "PDF 生成失败")
		return
	}

	filename := h.pdfService.NormalizeFilename(req.Filename)
	c.Header("Content-Type", "application/pdf")
	c.Header("Content-Disposition", "attachment; filename=\""+filename+".pdf\"")
	c.Data(http.StatusOK, "application/pdf", pdfBytes)
}
