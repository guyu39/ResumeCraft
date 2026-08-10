package app

import (
	"context"
	"log"
	"net/http"
	"os"
	"time"

	"resumecraft-pdf-backend/internal/config"
	"resumecraft-pdf-backend/internal/cron"
	"resumecraft-pdf-backend/internal/handler"
	"resumecraft-pdf-backend/internal/middleware"
	"resumecraft-pdf-backend/internal/migrate"
	"resumecraft-pdf-backend/internal/router"
	"resumecraft-pdf-backend/internal/service/ai"
	"resumecraft-pdf-backend/internal/service/auth"
	"resumecraft-pdf-backend/internal/service/export"
	homeservice "resumecraft-pdf-backend/internal/service/home"
	jobapplication "resumecraft-pdf-backend/internal/service/job_application"
	jobpostingService "resumecraft-pdf-backend/internal/service/job_posting"
	"resumecraft-pdf-backend/internal/service/mail"
	"resumecraft-pdf-backend/internal/service/pdf"
	"resumecraft-pdf-backend/internal/service/resume"
	aiStorage "resumecraft-pdf-backend/internal/storage/ai"
	aihotStorage "resumecraft-pdf-backend/internal/storage/aihot"
	"resumecraft-pdf-backend/internal/storage/audit"
	"resumecraft-pdf-backend/internal/storage/db"
	exportStorage "resumecraft-pdf-backend/internal/storage/export"
	githubStorage "resumecraft-pdf-backend/internal/storage/github"
	homeStorage "resumecraft-pdf-backend/internal/storage/home"
	applicationStorage "resumecraft-pdf-backend/internal/storage/job_application"
	jobpostingStorage "resumecraft-pdf-backend/internal/storage/job_posting"
	newsStorage "resumecraft-pdf-backend/internal/storage/news"
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
	// 反向代理信任名单：为空时不信任任何代理（ClientIP 取直连地址），防 X-Forwarded-For 伪造绕过限流
	if len(cfg.Server.TrustedProxies) > 0 {
		_ = engine.SetTrustedProxies(cfg.Server.TrustedProxies)
	} else {
		_ = engine.SetTrustedProxies(nil)
	}
	engine.Use(gin.Recovery())
	engine.Use(middleware.RequestLogger())
	engine.Use(middleware.CORS(cfg.Server.AllowedOrigins))

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
	var applicationService jobapplication.Service
	var jobPostingService jobpostingService.Service
	var homeService homeservice.Service
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
				// 启动自动迁移：补齐 migrations/*.sql 中尚未执行的变更（幂等、只跑一次）
				if mErr := migrate.RunMigrations(context.Background(), pool, getEnv("MIGRATIONS_DIR", "")); mErr != nil {
					log.Printf("[migrate] WARNING: auto-migration failed: %v", mErr)
				} else {
					log.Printf("[migrate] auto-migration completed")
				}

				authService = auth.NewService(pool, redisClient, cfg.Auth, mail.NewSender(cfg.SMTP))
				auditWriter := audit.NewWriter()
				// 初始化简历服务
				resumeRepo := resumeStorage.NewRepository(pool, auditWriter)
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
				aiInterviewRepo := aiStorage.NewInterviewRepository(pool)
				aiService = ai.NewService(aiRepo, aiCfgRepo, aiSuggestRecordRepo, aiParserCfgRepo, aiInterviewRepo, cfg.AI, redisClient)
				// 初始化投递管理服务
				applicationRepo := applicationStorage.NewRepository(pool, auditWriter)
				applicationService = jobapplication.NewService(applicationRepo)

				// 初始化招聘数据聚合服务（腾讯文档智能表格同步）
				// newJobRepo 在此提前构造，供 job_posting（写：同步新增岗位推送 Redis）与
				// home（读：首页展示最近新增列表）两个服务共用同一份 Redis「最近新增」存取逻辑
				jobPostingRepo := jobpostingStorage.NewRepository(pool)
				newJobRepo := homeStorage.NewNewJobRepository(pool, redisClient)
				jobPostingService = jobpostingService.NewService(
					jobPostingRepo,
					newJobRepo,
					getEnv("SCRAPER_SCRIPT", "../python-parser/scrape_smartsheet.py"),
					getEnv("PYTHON_BIN", "python3"),
				)
				// 初始化首页工作台服务（待办 + AI 新闻 + GitHub 项目 + 日报 + 项目推荐 + 新岗位 + AI HOT）
				// 系统级 AI 凭证来自 .env（服务端内置，不由用户自定义）
				homeService = homeservice.NewService(
					homeStorage.NewTodoRepository(pool),
					newsStorage.NewRepository(pool),
					githubStorage.NewRepository(pool),
					homeStorage.NewReportRepository(pool),
					homeStorage.NewProjectRepository(pool),
					homeStorage.NewSnapshotRepository(pool),
					newJobRepo,
					aihotStorage.NewRepository(pool),
					cfg.AI.ProviderAPIKey,
					cfg.AI.ProviderBaseURL,
					cfg.AI.ProviderModel,
				)
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

	h := handler.New(pdfService, authService, resumeService, exportService, aiService, applicationService, jobPostingService, homeService, objectStorage, cfg.Parser.ServiceURL, cfg.AI.ProviderAPIKey, cfg.AI.ProviderBaseURL, cfg.AI.ProviderModel)
	router.Register(engine, h, cfg.Server.FrontendDistDir, authLimiter, aiLimiter)

	// 招聘数据定时同步调度器（默认每小时，JOB_SYNC_INTERVAL 可覆盖）
	var jobScheduler *cron.JobSyncScheduler
	if jobPostingService != nil {
		interval := cron.DefaultJobSyncInterval
		if v := getEnv("JOB_SYNC_INTERVAL", ""); v != "" {
			if d, err := time.ParseDuration(v); err == nil {
				interval = d
			} else {
				log.Printf("[cron] invalid JOB_SYNC_INTERVAL=%q, fallback to %s", v, cron.DefaultJobSyncInterval)
			}
		}
		jobScheduler = cron.NewJobSyncScheduler(jobPostingService, interval)
	}

	// 首页 GitHub 项目定时同步（默认 6 小时，GITHUB_SYNC_INTERVAL 可覆盖）
	var githubScheduler *cron.GithubSyncScheduler
	if homeService != nil {
		interval := cron.DefaultGithubSyncInterval
		if v := getEnv("GITHUB_SYNC_INTERVAL", ""); v != "" {
			if d, err := time.ParseDuration(v); err == nil {
				interval = d
			} else {
				log.Printf("[cron] invalid GITHUB_SYNC_INTERVAL=%q, fallback to %s", v, cron.DefaultGithubSyncInterval)
			}
		}
		githubScheduler = cron.NewGithubSyncScheduler(homeService, interval)
	}

	// 首页 AI 日报定时生成（每天 0 点，跨天触发）
	var reportScheduler *cron.DailyReportScheduler
	if homeService != nil {
		reportScheduler = cron.NewDailyReportScheduler(homeService)
	}

	// AI HOT 数据定时同步（快讯 5min / 热点 10min / 日报 08:05 北京时间）
	var aihotScheduler *cron.AihotSyncScheduler
	if homeService != nil {
		aihotScheduler = cron.NewAihotSyncScheduler(homeService)
	}

	server := &http.Server{
		Addr:              ":" + cfg.Server.Port,
		Handler:           engine,
		ReadHeaderTimeout: cfg.Server.ReadHeaderTimeout,
		ReadTimeout:       cfg.Server.ReadTimeout,
		WriteTimeout:      cfg.Server.WriteTimeout,
	}

	if jobScheduler != nil {
		go jobScheduler.Start()
		server.RegisterOnShutdown(func() {
			jobScheduler.Stop()
			log.Println("[cron] job-postings scheduler shutdown signaled")
		})
	}

	if githubScheduler != nil {
		go githubScheduler.Start()
		server.RegisterOnShutdown(func() {
			githubScheduler.Stop()
			log.Println("[cron] github-projects scheduler shutdown signaled")
		})
	}

	if reportScheduler != nil {
		go reportScheduler.Start()
		server.RegisterOnShutdown(func() {
			reportScheduler.Stop()
			log.Println("[cron] daily-report scheduler shutdown signaled")
		})
	}

	if aihotScheduler != nil {
		go aihotScheduler.Start()
		server.RegisterOnShutdown(func() {
			aihotScheduler.Stop()
			log.Println("[cron] aihot scheduler shutdown signaled")
		})
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

// getEnv 读取环境变量，缺失时返回默认值
func getEnv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
