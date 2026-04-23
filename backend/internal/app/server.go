package app

import (
	"context"
	"log"
	"net/http"
	"time"

	"resumecraft-pdf-backend/internal/config"
	"resumecraft-pdf-backend/internal/handler"
	"resumecraft-pdf-backend/internal/middleware"
	"resumecraft-pdf-backend/internal/router"
	"resumecraft-pdf-backend/internal/service/ai"
	"resumecraft-pdf-backend/internal/service/auth"
	"resumecraft-pdf-backend/internal/service/export"
	"resumecraft-pdf-backend/internal/service/pdf"
	"resumecraft-pdf-backend/internal/service/resume"
	aiStorage "resumecraft-pdf-backend/internal/storage/ai"
	"resumecraft-pdf-backend/internal/storage/db"
	exportStorage "resumecraft-pdf-backend/internal/storage/export"
	resumeStorage "resumecraft-pdf-backend/internal/storage/resume"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

func NewServer() *http.Server {
	cfg := config.Load()

	gin.SetMode(gin.ReleaseMode)
	engine := gin.New()
	engine.Use(gin.Recovery())
	engine.Use(middleware.RequestLogger())
	engine.Use(middleware.CORS())

	pdfService := pdf.NewService(cfg.PDF)

	var authService auth.Service
	var resumeService resume.Service
	var exportService export.Service
	var aiService ai.Service
	var pool *pgxpool.Pool

	if cfg.Auth.Enabled {
		if cfg.DB.DSN == "" {
			log.Println("[auth] AUTH_ENABLED=true but PG_DSN is empty, auth routes will be disabled")
		} else {
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			var err error
			pool, err = db.NewPostgresPool(ctx, cfg.DB.DSN)
			cancel()
			if err != nil {
				log.Printf("[auth] init postgres failed: %v", err)
			} else {
				authService = auth.NewService(pool, cfg.Auth)
				// 初始化简历服务
				resumeRepo := resumeStorage.NewRepository(pool)
				resumeService = resume.NewService(resumeRepo)
				// 初始化导出服务
				exportRepo := exportStorage.NewInMemoryRepository()
				exportService = export.NewService(exportRepo, resumeService, pdfService, 3)
				// 初始化 AI 服务
				aiRepo := aiStorage.NewRepository(pool)
				aiCfgRepo := aiStorage.NewConfigRepository(pool)
				aiSuggestRecordRepo := aiStorage.NewSuggestRecordRepository(pool)
				aiService = ai.NewService(aiRepo, aiCfgRepo, aiSuggestRecordRepo, cfg.AI)
			}
		}
	}

	h := handler.New(pdfService, authService, resumeService, exportService, aiService)
	router.Register(engine, h, cfg.Server.FrontendDistDir)

	server := &http.Server{
		Addr:              ":" + cfg.Server.Port,
		Handler:           engine,
		ReadHeaderTimeout: cfg.Server.ReadHeaderTimeout,
		ReadTimeout:       cfg.Server.ReadTimeout,
		WriteTimeout:      cfg.Server.WriteTimeout,
	}

	if pool != nil {
		server.RegisterOnShutdown(func() { pool.Close() })
	}

	return server
}
