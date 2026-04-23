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
	Server ServerConfig
	DB     DBConfig
	Auth   AuthConfig
	PDF    PDFConfig
	AI     AIConfig
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

	return Config{
		Server: ServerConfig{
			Port:              getEnv("PORT", "8787"),
			FrontendDistDir:   getEnv("FRONTEND_DIST_DIR", ""),
			ReadHeaderTimeout: getEnvDurationSeconds("SERVER_READ_HEADER_TIMEOUT_SEC", 10),
			ReadTimeout:       getEnvDurationSeconds("SERVER_READ_TIMEOUT_SEC", 30),
			WriteTimeout:      getEnvDurationSeconds("SERVER_WRITE_TIMEOUT_SEC", 120),
		},
		DB: DBConfig{
			DSN: dsn,
		},
		Auth: AuthConfig{
			Enabled:         getEnvBool("AUTH_ENABLED", true),
			JWTSecret:       getEnv("AUTH_JWT_SECRET", "change-this-in-production"),
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
			EncryptionKey: getEnv("AI_ENCRYPTION_KEY", "change-this-32-char-key!!"),
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