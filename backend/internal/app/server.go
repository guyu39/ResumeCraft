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
	"resumecraft-pdf-backend/internal/storage/object"
	resumeStorage "resumecraft-pdf-backend/internal/storage/resume"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

func NewServer() *http.Server {
	cfg := config.Load()

	gin.SetMode(gin.ReleaseMode)
	engine := gin.New()
	engine.Use(gin.Recovery())
	engine.Use(middleware.RequestLogger())
	engine.Use(middleware.CORS())

	pdfService := pdf.NewService(cfg.PDF)

	// ── 1. 初始化 Redis（token 存储 + 限流都依赖它） ──
	var redisClient *redis.Client
	if cfg.Redis.Enabled {
		redisClient = redis.NewClient(&redis.Options{
			Addr:         cfg.Redis.Addr,
			Password:     cfg.Redis.Password,
			DB:           cfg.Redis.DB,
			DialTimeout:  cfg.Redis.DialTimeout,
			ReadTimeout:  cfg.Redis.ReadTimeout,
			WriteTimeout: cfg.Redis.WriteTimeout,
		})
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		if err := redisClient.Ping(ctx).Err(); err != nil {
			log.Printf("[redis] ping failed: %v (auth_fail_open=true, rate_limit_fail_open=%v)", err, cfg.RateLimit.FailOpen)
		} else {
			log.Printf("[redis] connected to %s", cfg.Redis.Addr)
		}
		cancel()
	} else {
		log.Println("[redis] REDIS_ENABLED=false, token storage falls back to PostgreSQL, rate limiting disabled")
	}

	// ── 2. 初始化认证 & 业务服务 ──
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
				authService = auth.NewService(pool, redisClient, cfg.Auth)
				// 初始化简历服务
				resumeRepo := resumeStorage.NewRepository(pool)
				resumeService = resume.NewService(resumeRepo)
				// 初始化对象存储
				objectStorage := object.NewObjectStorage(cfg.Storage)

				// 初始化导出服务
				exportRepo := exportStorage.NewInMemoryRepository()
				exportService = export.NewService(exportRepo, resumeService, pdfService, 3, objectStorage)
				// 初始化 AI 服务
				aiRepo := aiStorage.NewRepository(pool)
				aiCfgRepo := aiStorage.NewConfigRepository(pool)
				aiSuggestRecordRepo := aiStorage.NewSuggestRecordRepository(pool)
				aiParserCfgRepo := aiStorage.NewParserConfigRepository(pool)
				aiService = ai.NewService(aiRepo, aiCfgRepo, aiSuggestRecordRepo, aiParserCfgRepo, cfg.AI)
			}
		}
	}

	// ── 3. 构建限流中间件 ──
	var authLimiter, aiLimiter gin.HandlerFunc
	if cfg.RateLimit.Enabled && redisClient != nil {
		authLimiter = middleware.RateLimit(middleware.RateLimitOptions{
			Client:   redisClient,
			Prefix:   "auth",
			Capacity: cfg.RateLimit.AuthCapacity,
			Refill:   cfg.RateLimit.AuthRefill,
			FailOpen: cfg.RateLimit.FailOpen,
		})
		aiLimiter = middleware.RateLimit(middleware.RateLimitOptions{
			Client:   redisClient,
			Prefix:   "ai",
			Capacity: cfg.RateLimit.AICapacity,
			Refill:   cfg.RateLimit.AIRefill,
			FailOpen: cfg.RateLimit.FailOpen,
		})
		log.Printf("[rate_limit] enabled — auth(%d/%.1f/s) ai(%d/%.1f/s)",
			cfg.RateLimit.AuthCapacity, cfg.RateLimit.AuthRefill,
			cfg.RateLimit.AICapacity, cfg.RateLimit.AIRefill)
	}

	// 初始化对象存储（不依赖数据库）
	objectStorage := object.NewObjectStorage(cfg.Storage)

	h := handler.New(pdfService, authService, resumeService, exportService, aiService, objectStorage, cfg.Parser.ServiceURL)
	router.Register(engine, h, cfg.Server.FrontendDistDir, authLimiter, aiLimiter)

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
	if redisClient != nil {
		server.RegisterOnShutdown(func() {
			if err := redisClient.Close(); err != nil {
				log.Printf("[redis] close error: %v", err)
			}
		})
	}

	return server
}
