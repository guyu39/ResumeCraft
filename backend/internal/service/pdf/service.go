package pdf

import (
	"log"
	"regexp"
	"strings"

	"resumecraft-pdf-backend/internal/config"
	"resumecraft-pdf-backend/internal/renderer"
)

type Service interface {
	RenderHTML(html string) ([]byte, error)
	NormalizeFilename(raw string) string
}

type service struct {
	renderer renderer.Renderer
}

var invalidFilenameChars = regexp.MustCompile(`[\\/:*?"<>|]+`)

func NewService(cfg config.PDFConfig) Service {
	// 浏览器路径：优先 CHROME_PATH，否则自动探测系统已装的 Chromium 内核浏览器（Chrome/Edge/Chromium 等）
	execPath := cfg.ChromiumExecPath
	if execPath == "" {
		execPath = renderer.DetectChromiumPath()
	}
	if execPath != "" {
		log.Printf("[pdf] 使用浏览器: %s", execPath)
	} else {
		log.Printf("[pdf] 未找到 Chromium 内核浏览器，PDF 导出将不可用；请安装 Chrome/Edge/Chromium，或设置 CHROME_PATH 环境变量")
	}

	return &service{
		renderer: renderer.NewChromedpRenderer(renderer.Options{
			RenderTimeout:         cfg.RenderTimeout,
			ChromiumHeadless:      cfg.ChromiumHeadless,
			ChromiumDisableGPU:    cfg.ChromiumDisableGPU,
			ChromiumNoSandbox:     cfg.ChromiumNoSandbox,
			ChromiumDisableSetUID: cfg.ChromiumDisableSetUID,
			ChromiumExecPath:      execPath,
			ViewportWidth:         cfg.ViewportWidth,
			ViewportHeight:        cfg.ViewportHeight,
			DeviceScaleFactor:     cfg.DeviceScaleFactor,
			PaperWidthInches:      cfg.PaperWidthInches,
			PaperHeightInches:     cfg.PaperHeightInches,
			PDFScale:              cfg.PDFScale,
		}),
	}
}

func (s *service) RenderHTML(html string) ([]byte, error) {
	return s.renderer.RenderPDF(html)
}

func (s *service) NormalizeFilename(raw string) string {
	name := strings.TrimSpace(raw)
	name = strings.TrimSuffix(name, ".pdf")
	name = invalidFilenameChars.ReplaceAllString(name, "_")
	if name == "" {
		return "resume"
	}
	return name
}
