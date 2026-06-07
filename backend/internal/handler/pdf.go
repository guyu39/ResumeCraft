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

	// 注入 base URL，使相对路径（如 /api/avatars/...）可被 headless Chromium 正确解析
	scheme := "http"
	if c.Request.TLS != nil || c.GetHeader("X-Forwarded-Proto") == "https" {
		scheme = "https"
	}
	baseURL := scheme + "://" + c.Request.Host

	// 在 </head> 或 <html> 之后插入 <base> 标签
	if idx := strings.Index(html, "</head>"); idx >= 0 {
		html = html[:idx] + `<base href="` + baseURL + `">` + html[idx:]
	} else if idx := strings.Index(html, "<html"); idx >= 0 {
		end := strings.Index(html[idx:], ">") + idx + 1
		html = html[:end] + `<head><base href="` + baseURL + `"></head>` + html[end:]
	} else {
		html = `<head><base href="` + baseURL + `"></head>` + html
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
