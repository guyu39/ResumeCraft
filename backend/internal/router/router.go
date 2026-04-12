package router

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"resumecraft-pdf-backend/internal/handler"

	"github.com/gin-gonic/gin"
)

func Register(engine *gin.Engine, h *handler.Handler, frontendDistDir string) {
	api := engine.Group("/api")
	{
		pdf := api.Group("/pdf")
		{
			pdf.GET("/health", h.PDFHealth)
			pdf.POST("/export", h.ExportPDF)
		}
	}

	if frontendDistDir == "" {
		return
	}

	if info, err := os.Stat(frontendDistDir); err != nil || !info.IsDir() {
		return
	}

	indexPath := filepath.Join(frontendDistDir, "index.html")
	assetsPath := filepath.Join(frontendDistDir, "assets")

	if info, err := os.Stat(assetsPath); err == nil && info.IsDir() {
		engine.Static("/assets", assetsPath)
	}

	engine.GET("/", func(c *gin.Context) {
		c.File(indexPath)
	})

	engine.NoRoute(func(c *gin.Context) {
		if strings.HasPrefix(c.Request.URL.Path, "/api/") {
			c.JSON(http.StatusNotFound, gin.H{"message": "not found"})
			return
		}
		c.File(indexPath)
	})
}
