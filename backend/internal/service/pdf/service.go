package pdf

import (
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
	return &service{
		renderer: renderer.NewChromedpRenderer(renderer.Options{
			RenderTimeout:         cfg.RenderTimeout,
			ChromiumHeadless:      cfg.ChromiumHeadless,
			ChromiumDisableGPU:    cfg.ChromiumDisableGPU,
			ChromiumNoSandbox:     cfg.ChromiumNoSandbox,
			ChromiumDisableSetUID: cfg.ChromiumDisableSetUID,
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
