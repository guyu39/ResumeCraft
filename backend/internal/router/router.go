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

func Register(engine *gin.Engine, h *handler.Handler, frontendDistDir string, authLimiter, aiLimiter gin.HandlerFunc) {
	api := engine.Group("/api")
	{
		authGroup := api.Group("/auth")
		{
			// 认证路由挂载限流（注册/登录/刷新为高风险接口）
			if authLimiter != nil {
				authGroup.POST("/register", authLimiter, h.Register)
				authGroup.POST("/login", authLimiter, h.Login)
				authGroup.POST("/refresh", authLimiter, h.Refresh)
			} else {
				authGroup.POST("/register", h.Register)
				authGroup.POST("/login", h.Login)
				authGroup.POST("/refresh", h.Refresh)
			}
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
				resumeGroup.POST("/parse", h.ParseResume)
				resumeGroup.GET("/:id", h.GetResume)
				resumeGroup.PUT("/:id", h.UpdateResume)
				resumeGroup.DELETE("/:id", h.DeleteResume)

				// 版本快照
				resumeGroup.GET("/:id/snapshots", h.ListSnapshots)
				resumeGroup.POST("/:id/snapshots", h.CreateManualSnapshot)
				resumeGroup.GET("/:id/snapshots/:snapshotId", h.GetSnapshotDetail)
				resumeGroup.PUT("/:id/snapshots/:snapshotId", h.UpdateSnapshotLabel)
				resumeGroup.DELETE("/:id/snapshots/:snapshotId", h.DeleteSnapshot)
				resumeGroup.POST("/:id/snapshots/:snapshotId/restore", h.RestoreFromSnapshot)
				resumeGroup.POST("/:id/snapshots/diff", h.DiffSnapshots)

				// 导出接口
				resumeGroup.POST("/:id/exports", h.CreateExport)

				// 分享链接（需认证）
				resumeGroup.POST("/:id/share", h.CreateShareLink)
				resumeGroup.GET("/:id/shares", h.ListShareLinks)
				resumeGroup.DELETE("/:id/shares/:shareId", h.DeactivateShareLink)

				// 评论管理（管理员视图，需认证）
				resumeGroup.GET("/:id/comments", h.ListAllComments)
				resumeGroup.DELETE("/:id/comments/:commentId", h.DeleteResumeComment)
			}
		}

		// 分享公开访问（无需认证）
		if h.ResumeService() != nil {
			shareGroup := api.Group("/share")
			{
				shareGroup.GET("/:token", h.ViewSharedResume)
				shareGroup.GET("/:token/comments", h.ListComments)
				shareGroup.POST("/:token/comments", h.AddComment)
				shareGroup.DELETE("/:token/comments/:commentId", h.DeleteComment)
			}
			// AI 分析 + 需求文档 + PDF 下载（公开访问）
			if h.AIService() != nil {
				shareGroup.POST("/:token/analyze", h.AnalyzeSharedResume)
				shareGroup.POST("/:token/requirement-doc", h.GenerateRequirementDoc)
			}
			shareGroup.POST("/:token/pdf", h.ExportSharePDF)
		}

		// AI 接口 - 需要认证
		if h.AIService() != nil {
			aiGroup := api.Group("/ai")
			aiGroup.Use(middleware.AuthRequired(h.AuthService()))
			{
				aiGroup.GET("/config", h.GetAIConfig)
				aiGroup.POST("/config", h.SaveAIConfig)
				aiGroup.GET("/parser-config", h.GetResumeParserConfig)
				aiGroup.POST("/parser-config", h.SaveResumeParserConfig)
				aiGroup.GET("/conversations", h.ListAIConversations)
				aiGroup.GET("/conversations/:id", h.GetAIConversation)
				aiGroup.DELETE("/conversations/:id", h.DeleteAIConversation)

				// 高成本 AI 接口挂载限流
				if aiLimiter != nil {
					aiGroup.POST("/evaluate/stream", aiLimiter, h.EvaluateResumeStream)
					aiGroup.POST("/jd-match/stream", aiLimiter, h.JDMatchStream)
					aiGroup.POST("/score", aiLimiter, h.ScoreResumeForJD)
					aiGroup.POST("/rewrite/bullet", aiLimiter, h.RewriteBullet)
					aiGroup.POST("/cover-letter", aiLimiter, h.GenerateCoverLetter)
					aiGroup.POST("/suggest", aiLimiter, h.SuggestContent)
					aiGroup.POST("/translate", aiLimiter, h.TranslateResume)
					aiGroup.POST("/enhance", aiLimiter, h.EnhanceContent)
				} else {
					aiGroup.POST("/evaluate/stream", h.EvaluateResumeStream)
					aiGroup.POST("/jd-match/stream", h.JDMatchStream)
					aiGroup.POST("/score", h.ScoreResumeForJD)
					aiGroup.POST("/rewrite/bullet", h.RewriteBullet)
					aiGroup.POST("/cover-letter", h.GenerateCoverLetter)
					aiGroup.POST("/suggest", h.SuggestContent)
					aiGroup.POST("/translate", h.TranslateResume)
					aiGroup.POST("/enhance", h.EnhanceContent)
				}

				aiGroup.GET("/suggest-records", h.ListSuggestRecords)
				aiGroup.POST("/suggest-records", h.SaveSuggestRecord)
			}
		}

		// 导出任务查询和下载（独立路径）
		if h.ExportService() != nil {
			api.GET("/exports/:taskId", h.GetExportTask)
			api.GET("/exports/:taskId/download", h.DownloadExport)
		}

		// 用户头像上传
		if h.ObjectStorage() != nil && h.AuthEnabled() {
			usersGroup := api.Group("/users")
			usersGroup.Use(middleware.AuthRequired(h.AuthService()))
			{
				usersGroup.POST("/avatar", h.UploadAvatar)
			}
			// 头像代理（无需认证，避免直接暴露 MinIO 地址导致 403）
			api.GET("/avatars/:userID/:filename", h.ServeAvatar)
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
