package config

import (
	"bufio"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Server ServerConfig
	PDF    PDFConfig
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

func Load() Config {
	_ = loadDotEnv(".env")

	return Config{
		Server: ServerConfig{
			Port:              getEnv("PORT", "8787"),
			FrontendDistDir:   getEnv("FRONTEND_DIST_DIR", ""),
			ReadHeaderTimeout: getEnvDurationSeconds("SERVER_READ_HEADER_TIMEOUT_SEC", 10),
			ReadTimeout:       getEnvDurationSeconds("SERVER_READ_TIMEOUT_SEC", 30),
			WriteTimeout:      getEnvDurationSeconds("SERVER_WRITE_TIMEOUT_SEC", 120),
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
	}
}

func loadDotEnv(path string) error {
	file, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
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
