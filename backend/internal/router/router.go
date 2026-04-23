package router

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"resumecraft-pdf-backend/internal/handler"
	"resumecraft-pdf-backend/internal/middleware"

	"github.com/gin-gonic/gin"
)

func Register(engine *gin.Engine, h *handler.Handler, frontendDistDir string) {
	api := engine.Group("/api")
	{
		authGroup := api.Group("/auth")
		{
			authGroup.POST("/register", h.Register)
			authGroup.POST("/login", h.Login)
			authGroup.POST("/refresh", h.Refresh)
			authGroup.POST("/logout", h.Logout)
			if h.AuthEnabled() {
				authGroup.GET("/me", middleware.AuthRequired(h.AuthService()), h.Me)
			}
		}

		// 简历接口 - 需要认证
		if h.ResumeService() != nil {
			resumeGroup := api.Group("/resumes")
			resumeGroup.Use(middleware.AuthRequired(h.AuthService()))
			{
				resumeGroup.GET("", h.ListResumes)
				resumeGroup.POST("", h.CreateResume)
				resumeGroup.GET("/:id", h.GetResume)
				resumeGroup.PUT("/:id", h.UpdateResume)
				resumeGroup.DELETE("/:id", h.DeleteResume)

				// 导出接口
				resumeGroup.POST("/:id/exports", h.CreateExport)
			}
		}

		// AI 接口 - 需要认证
		if h.AIService() != nil {
			aiGroup := api.Group("/ai")
			aiGroup.Use(middleware.AuthRequired(h.AuthService()))
			{
				aiGroup.GET("/config", h.GetAIConfig)
				aiGroup.POST("/config", h.SaveAIConfig)
				aiGroup.GET("/conversations", h.ListAIConversations)
				aiGroup.GET("/conversations/:id", h.GetAIConversation)
				aiGroup.DELETE("/conversations/:id", h.DeleteAIConversation)
				aiGroup.POST("/evaluate/stream", h.EvaluateResumeStream)
				aiGroup.POST("/suggest", h.SuggestContent)
				aiGroup.GET("/suggest-records", h.ListSuggestRecords)
				aiGroup.POST("/suggest-records", h.SaveSuggestRecord)
			}
		}

		// 导出任务查询（独立路径）
		if h.ExportService() != nil {
			api.GET("/exports/:taskId", h.GetExportTask)
		}

		pdf := api.Group("/pdf")
		{
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