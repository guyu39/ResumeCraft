package config

import (
	"bufio"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Server    ServerConfig
	DB        DBConfig
	Auth      AuthConfig
	PDF       PDFConfig
	AI        AIConfig
	Storage   StorageConfig
	Parser    ParserConfig
	Redis     RedisConfig
	RateLimit RateLimitConfig
}

type DBConfig struct {
	DSN string
}

type AuthConfig struct {
	Enabled         bool
	JWTSecret       string
	AccessTokenTTL  time.Duration
	RefreshTokenTTL time.Duration
}

type ServerConfig struct {
	Port              string
	FrontendDistDir   string
	ReadHeaderTimeout time.Duration
	ReadTimeout       time.Duration
	WriteTimeout      time.Duration
}

type PDFConfig struct {
	RenderTimeout         time.Duration
	ChromiumHeadless      bool
	ChromiumDisableGPU    bool
	ChromiumNoSandbox     bool
	ChromiumDisableSetUID bool
	ViewportWidth         int
	ViewportHeight        int
	DeviceScaleFactor     float64
	PaperWidthInches      float64
	PaperHeightInches     float64
	PDFScale              float64
}

type AIConfig struct {
	EncryptionKey string
}

type StorageConfig struct {
	Endpoint  string
	AccessKey string
	SecretKey string
	Bucket    string
	UseSSL    bool
}

type ParserConfig struct {
	ServiceURL string
}

type RedisConfig struct {
	Enabled      bool
	Addr         string
	Password     string
	DB           int
	DialTimeout  time.Duration
	ReadTimeout  time.Duration
	WriteTimeout time.Duration
}

type RateLimitConfig struct {
	Enabled        bool
	FailOpen       bool
	AuthCapacity   int
	AuthRefill     float64
	AICapacity     int
	AIRefill       float64
	GlobalCapacity int
	GlobalRefill   float64
}

func Load() Config {
	// 尝试从多个位置加载 .env 文件
	dirs := []string{
		".",
		filepath.Dir(os.Args[0]),
		getWorkingDir(),
	}

	for _, dir := range dirs {
		envPath := filepath.Join(dir, ".env")
		if err := loadDotEnv(envPath); err == nil {
			log.Printf("[config] Loaded .env from: %s", envPath)
			break
		}
	}

	// 打印加载的配置（用于调试）
	dsn := getEnv("PG_DSN", "")
	log.Printf("[config] PG_DSN: %s", maskPassword(dsn))

	jwtSecret := getEnv("AUTH_JWT_SECRET", "change-this-in-production")
	if jwtSecret == "change-this-in-production" || jwtSecret == "change-this-in-production-32ch" {
		log.Println("[security] AUTH_JWT_SECRET is using a default value; set a strong secret before production deployment")
	}

	log.Println("[security] Production deployment MUST use HTTPS to protect credentials in transit")

	aiEncryptionKey := getEnv("AI_ENCRYPTION_KEY", "change-this-32-char-key!!")
	if aiEncryptionKey == "change-this-32-char-key!!" {
		log.Println("[security] AI_ENCRYPTION_KEY is using a default value; set a strong key before production deployment")
	}

	return Config{
		Server: ServerConfig{
			Port:              getEnv("PORT", "8787"),
			FrontendDistDir:   getEnv("FRONTEND_DIST_DIR", ""),
			ReadHeaderTimeout: getEnvDurationSeconds("SERVER_READ_HEADER_TIMEOUT_SEC", 10),
			ReadTimeout:       getEnvDurationSeconds("SERVER_READ_TIMEOUT_SEC", 30),
			WriteTimeout:      getEnvDurationSeconds("SERVER_WRITE_TIMEOUT_SEC", 300),
		},
		DB: DBConfig{
			DSN: dsn,
		},
		Auth: AuthConfig{
			Enabled:         getEnvBool("AUTH_ENABLED", true),
			JWTSecret:       jwtSecret,
			AccessTokenTTL:  getEnvDurationMinutes("AUTH_ACCESS_TTL_MIN", 120),
			RefreshTokenTTL: getEnvDurationMinutes("AUTH_REFRESH_TTL_MIN", 43200),
		},
		PDF: PDFConfig{
			RenderTimeout:         getEnvDurationSeconds("PDF_RENDER_TIMEOUT_SEC", 60),
			ChromiumHeadless:      getEnvBool("CHROMIUM_HEADLESS", true),
			ChromiumDisableGPU:    getEnvBool("CHROMIUM_DISABLE_GPU", true),
			ChromiumNoSandbox:     getEnvBool("CHROMIUM_NO_SANDBOX", true),
			ChromiumDisableSetUID: getEnvBool("CHROMIUM_DISABLE_SETUID_SANDBOX", true),
			ViewportWidth:         getEnvInt("PDF_VIEWPORT_WIDTH", 794),
			ViewportHeight:        getEnvInt("PDF_VIEWPORT_HEIGHT", 1123),
			DeviceScaleFactor:     getEnvFloat64("PDF_DEVICE_SCALE_FACTOR", 1),
			PaperWidthInches:      getEnvFloat64("PDF_PAPER_WIDTH_INCH", 8.27),
			PaperHeightInches:     getEnvFloat64("PDF_PAPER_HEIGHT_INCH", 11.69),
			PDFScale:              getEnvFloat64("PDF_SCALE", 1),
		},
		AI: AIConfig{
			EncryptionKey: aiEncryptionKey,
		},
		Storage: StorageConfig{
			Endpoint:  getEnv("S3_ENDPOINT", ""),
			AccessKey: getEnv("S3_ACCESS_KEY", ""),
			SecretKey: getEnv("S3_SECRET_KEY", ""),
			Bucket:    getEnv("S3_BUCKET", "resumecraft"),
			UseSSL:    getEnvBool("S3_USE_SSL", false),
		},
		Parser: ParserConfig{
			ServiceURL: getEnv("PARSER_SERVICE_URL", ""),
		},
		Redis: RedisConfig{
			Enabled:      getEnvBool("REDIS_ENABLED", false),
			Addr:         getEnv("REDIS_ADDR", "localhost:6379"),
			Password:     getEnv("REDIS_PASSWORD", ""),
			DB:           getEnvIntAllowZero("REDIS_DB", 0),
			DialTimeout:  getEnvDurationSeconds("REDIS_DIAL_TIMEOUT_SEC", 5),
			ReadTimeout:  getEnvDurationSeconds("REDIS_READ_TIMEOUT_SEC", 3),
			WriteTimeout: getEnvDurationSeconds("REDIS_WRITE_TIMEOUT_SEC", 3),
		},
		RateLimit: RateLimitConfig{
			Enabled:        getEnvBool("RATE_LIMIT_ENABLED", true),
			FailOpen:       getEnvBool("RATE_LIMIT_FAIL_OPEN", true),
			AuthCapacity:   getEnvInt("RATE_LIMIT_AUTH_CAPACITY", 8),
			AuthRefill:     getEnvFloat64("RATE_LIMIT_AUTH_REFILL_PER_SEC", 0.2),
			AICapacity:     getEnvInt("RATE_LIMIT_AI_CAPACITY", 20),
			AIRefill:       getEnvFloat64("RATE_LIMIT_AI_REFILL_PER_SEC", 0.05),
			GlobalCapacity: getEnvInt("RATE_LIMIT_GLOBAL_CAPACITY", 120),
			GlobalRefill:   getEnvFloat64("RATE_LIMIT_GLOBAL_REFILL_PER_SEC", 2),
		},
	}
}

func getWorkingDir() string {
	dir, err := os.Getwd()
	if err != nil {
		return "."
	}
	return dir
}

func maskPassword(dsn string) string {
	// 简单的密码脱敏
	if strings.Contains(dsn, "@") {
		parts := strings.Split(dsn, "@")
		if len(parts) >= 2 {
			userPart := parts[0]
			if idx := strings.Index(userPart, ":"); idx > 0 {
				userPart = userPart[:idx+1] + "*****"
			}
			return userPart + "@" + parts[1]
		}
	}
	return dsn
}

func loadDotEnv(path string) error {
	file, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			return err
		}
		return err
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		eq := strings.Index(line, "=")
		if eq <= 0 {
			continue
		}

		key := strings.TrimSpace(line[:eq])
		value := strings.TrimSpace(line[eq+1:])
		value = strings.Trim(value, `"'`)

		if key == "" {
			continue
		}
		if _, exists := os.LookupEnv(key); !exists {
			_ = os.Setenv(key, value)
		}
	}

	return scanner.Err()
}

func getEnv(key, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func getEnvBool(key string, fallback bool) bool {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	value, err := strconv.ParseBool(raw)
	if err != nil {
		return fallback
	}
	return value
}

func getEnvDurationSeconds(key string, fallbackSeconds int) time.Duration {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return time.Duration(fallbackSeconds) * time.Second
	}
	seconds, err := strconv.Atoi(raw)
	if err != nil || seconds <= 0 {
		return time.Duration(fallbackSeconds) * time.Second
	}
	return time.Duration(seconds) * time.Second
}

func getEnvDurationMinutes(key string, fallbackMinutes int) time.Duration {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return time.Duration(fallbackMinutes) * time.Minute
	}
	minutes, err := strconv.Atoi(raw)
	if err != nil || minutes <= 0 {
		return time.Duration(fallbackMinutes) * time.Minute
	}
	return time.Duration(minutes) * time.Minute
}

func getEnvInt(key string, fallback int) int {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value <= 0 {
		return fallback
	}
	return value
}

func getEnvIntAllowZero(key string, fallback int) int {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value < 0 {
		return fallback
	}
	return value
}

func getEnvFloat64(key string, fallback float64) float64 {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	value, err := strconv.ParseFloat(raw, 64)
	if err != nil || value <= 0 {
		return fallback
	}
	return value
}
