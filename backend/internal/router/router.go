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
			// 认证路由挂载限流（注册/登录/刷新/发码为高风险接口）
			if authLimiter != nil {
				authGroup.POST("/send-code", authLimiter, h.SendCode)
				authGroup.POST("/register", authLimiter, h.Register)
				authGroup.POST("/login", authLimiter, h.Login)
				authGroup.POST("/login/confirm", authLimiter, h.ConfirmLogin)
				authGroup.POST("/refresh", authLimiter, h.Refresh)
			} else {
				authGroup.POST("/send-code", h.SendCode)
				authGroup.POST("/register", h.Register)
				authGroup.POST("/login", h.Login)
				authGroup.POST("/login/confirm", h.ConfirmLogin)
				authGroup.POST("/refresh", h.Refresh)
			}
			authGroup.POST("/logout", h.Logout)
			if h.AuthEnabled() {
				authGroup.GET("/me", middleware.AuthRequired(h.AuthService()), h.Me)
				authGroup.POST("/change-password", middleware.AuthRequired(h.AuthService()), h.ChangePassword)
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
					aiGroup.POST("/rewrite/module", aiLimiter, h.RewriteModule)
					aiGroup.POST("/jd-optimize", aiLimiter, h.OptimizeForJD)
					aiGroup.POST("/suggest", aiLimiter, h.SuggestContent)
					aiGroup.POST("/translate", aiLimiter, h.TranslateResume)
					aiGroup.POST("/enhance", aiLimiter, h.EnhanceContent)
					aiGroup.POST("/star/analyze", aiLimiter, h.AnalyzeStar)
					aiGroup.POST("/star/generate", aiLimiter, h.GenerateStar)
					aiGroup.POST("/writing/diagnose", aiLimiter, h.WritingDiagnose)
					aiGroup.POST("/checkup/stream", aiLimiter, h.ResumeCheckupStream)
				} else {
					aiGroup.POST("/evaluate/stream", h.EvaluateResumeStream)
					aiGroup.POST("/jd-match/stream", h.JDMatchStream)
					aiGroup.POST("/score", h.ScoreResumeForJD)
					aiGroup.POST("/rewrite/bullet", h.RewriteBullet)
					aiGroup.POST("/rewrite/module", h.RewriteModule)
					aiGroup.POST("/jd-optimize", h.OptimizeForJD)
					aiGroup.POST("/suggest", h.SuggestContent)
					aiGroup.POST("/translate", h.TranslateResume)
					aiGroup.POST("/enhance", h.EnhanceContent)
					aiGroup.POST("/star/analyze", h.AnalyzeStar)
					aiGroup.POST("/star/generate", h.GenerateStar)
					aiGroup.POST("/writing/diagnose", h.WritingDiagnose)
					aiGroup.POST("/checkup/stream", h.ResumeCheckupStream)
				}

				aiGroup.GET("/suggest-records", h.ListSuggestRecords)
				aiGroup.POST("/suggest-records", h.SaveSuggestRecord)

				interviewGroup := aiGroup.Group("/interview")
				{
					if aiLimiter != nil {
						interviewGroup.POST("/generate", aiLimiter, h.GenerateInterviewQuestions)
						interviewGroup.POST("/evaluate", aiLimiter, h.EvaluateInterviewAnswers)
						interviewGroup.POST("/analyze-transcript", aiLimiter, h.AnalyzeTranscript)
						interviewGroup.POST("/followup", aiLimiter, h.GenerateFollowup)
					} else {
						interviewGroup.POST("/generate", h.GenerateInterviewQuestions)
						interviewGroup.POST("/evaluate", h.EvaluateInterviewAnswers)
						interviewGroup.POST("/analyze-transcript", h.AnalyzeTranscript)
						interviewGroup.POST("/followup", h.GenerateFollowup)
					}
					interviewGroup.PUT("/sessions/:id/progress", h.SaveInterviewProgress)
					// 面试历史查询（轻量级，不挂载 aiLimiter）
					interviewGroup.GET("/sessions", h.ListInterviewSessions)
					interviewGroup.GET("/sessions/:id", h.GetInterviewSession)
					interviewGroup.DELETE("/sessions/:id", h.DeleteInterviewSession)
				}
			}
		}

		// 投递管理 / 职位库接口 - 需要认证
		if h.ApplicationService() != nil {
			applicationGroup := api.Group("/applications")
			applicationGroup.Use(middleware.AuthRequired(h.AuthService()))
			{
			applicationGroup.GET("", h.ListApplications)
			applicationGroup.POST("", h.CreateApplication)
			applicationGroup.GET("/export", h.ExportApplications)
			applicationGroup.POST("/duplicates", h.CheckApplicationDuplicates)
			applicationGroup.GET("/stats", h.GetApplicationStats)
			applicationGroup.GET("/stats/trend", h.GetApplicationTrend)
			applicationGroup.GET("/stats/interview-rounds", h.GetApplicationInterviewRounds)
			applicationGroup.GET("/calendar", h.GetApplicationCalendar)
			applicationGroup.GET("/interviews/bank", h.GetInterviewBank)
				applicationGroup.GET("/:id", h.GetApplication)
				applicationGroup.PUT("/:id", h.UpdateApplication)
				applicationGroup.DELETE("/:id", h.DeleteApplication)
				applicationGroup.PUT("/:id/status", h.UpdateApplicationStatus)
				applicationGroup.POST("/:id/checklist", h.CreateApplicationChecklistItem)
				applicationGroup.POST("/:id/checklist/regenerate", h.RegenerateApplicationChecklist)
				applicationGroup.PUT("/:id/checklist/:itemId", h.UpdateApplicationChecklistItem)
				applicationGroup.DELETE("/:id/checklist/:itemId", h.DeleteApplicationChecklistItem)
				applicationGroup.POST("/:id/ai-runs", h.CreateApplicationAIRun)
				applicationGroup.POST("/:id/interviews", h.CreateApplicationInterview)
				applicationGroup.POST("/:id/interviews/analyze-file", h.AnalyzeInterviewFile)
				applicationGroup.PUT("/:id/interviews/:interviewId", h.UpdateApplicationInterview)
				applicationGroup.DELETE("/:id/interviews/:interviewId", h.DeleteApplicationInterview)
				applicationGroup.POST("/:id/interviews/:interviewId/recording", h.UploadInterviewRecording)
				applicationGroup.GET("/:id/interviews/:interviewId/recording", h.GetInterviewRecording)
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

		// 招聘数据聚合（公开只读列表/筛选枚举 + 登录用户可触发同步）
		if h.JobPostingService() != nil {
			jobGroup := api.Group("/job-postings")
			{
				jobGroup.GET("", middleware.OptionalAuth(h.AuthService()), h.ListJobPostings)
				jobGroup.GET("/filters", h.GetJobPostingFilters)
				jobGroup.POST("/sync", middleware.AuthRequired(h.AuthService()), h.SyncJobPostings)
				jobGroup.PUT("/:id/mark", middleware.AuthRequired(h.AuthService()), h.SetJobPostingMark)
			}
		}

		// 首页工作台（需认证）
		if h.HomeService() != nil {
			homeGroup := api.Group("/home")
			homeGroup.Use(middleware.AuthRequired(h.AuthService()))
			{
				homeGroup.GET("/todos", h.ListHomeTodos)
				homeGroup.GET("/github-projects", h.ListHomeGithubProjects)
				homeGroup.GET("/daily-report", h.GetHomeDailyReports)
				homeGroup.GET("/projects", h.ListHomeProjects)
				homeGroup.GET("/new-jobs", h.ListHomeNewJobs)
				homeGroup.GET("/aihot/items", h.ListHomeAihotItems)
				homeGroup.GET("/aihot/daily", h.GetHomeAihotDaily)
				homeGroup.GET("/aihot/hot-topics", h.ListHomeAihotHotTopics)
				homeGroup.GET("/aihot/stories/:publicId", h.GetHomeAihotStory)
			}
			// 手动触发生成今日日报（系统级操作，无需登录；个人工具场景避免误用）
			api.Group("/home").POST("/daily-report/generate", h.GenerateHomeDailyReport)
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
