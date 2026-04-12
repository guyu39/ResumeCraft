package renderer

import (
	"context"
	"time"

	"github.com/chromedp/cdproto/emulation"
	"github.com/chromedp/cdproto/page"
	"github.com/chromedp/chromedp"
)

type Renderer interface {
	RenderPDF(html string) ([]byte, error)
}

type Options struct {
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

type chromedpRenderer struct {
	options Options
}

func NewChromedpRenderer(options Options) Renderer {
	if options.RenderTimeout <= 0 {
		options.RenderTimeout = 60 * time.Second
	}
	if options.ViewportWidth <= 0 {
		options.ViewportWidth = 794
	}
	if options.ViewportHeight <= 0 {
		options.ViewportHeight = 1123
	}
	if options.DeviceScaleFactor <= 0 {
		options.DeviceScaleFactor = 1
	}
	if options.PaperWidthInches <= 0 {
		options.PaperWidthInches = 8.27
	}
	if options.PaperHeightInches <= 0 {
		options.PaperHeightInches = 11.69
	}
	if options.PDFScale <= 0 {
		options.PDFScale = 1
	}

	return &chromedpRenderer{options: options}
}

func (r *chromedpRenderer) RenderPDF(html string) ([]byte, error) {
	allocOptions := []chromedp.ExecAllocatorOption{}
	if r.options.ChromiumHeadless {
		allocOptions = append(allocOptions, chromedp.Headless)
	} else {
		allocOptions = append(allocOptions, chromedp.Flag("headless", false))
	}
	if r.options.ChromiumDisableGPU {
		allocOptions = append(allocOptions, chromedp.DisableGPU)
	}
	if r.options.ChromiumNoSandbox {
		allocOptions = append(allocOptions, chromedp.NoSandbox)
	}
	if r.options.ChromiumDisableSetUID {
		allocOptions = append(allocOptions, chromedp.Flag("disable-setuid-sandbox", true))
	}

	allocCtx, cancelAlloc := chromedp.NewExecAllocator(context.Background(), allocOptions...)
	defer cancelAlloc()

	ctx, cancelCtx := chromedp.NewContext(allocCtx)
	defer cancelCtx()

	ctx, cancelTimeout := context.WithTimeout(ctx, r.options.RenderTimeout)
	defer cancelTimeout()

	var pdf []byte
	err := chromedp.Run(ctx,
		chromedp.Navigate("about:blank"),
		emulation.SetDeviceMetricsOverride(int64(r.options.ViewportWidth), int64(r.options.ViewportHeight), r.options.DeviceScaleFactor, false),
		chromedp.ActionFunc(func(ctx context.Context) error {
			frameTree, err := page.GetFrameTree().Do(ctx)
			if err != nil {
				return err
			}
			return page.SetDocumentContent(frameTree.Frame.ID, html).Do(ctx)
		}),
		emulation.SetEmulatedMedia().WithMedia("print"),
		chromedp.WaitReady("body", chromedp.ByQuery),
		chromedp.ActionFunc(func(ctx context.Context) error {
			var err error
			pdf, _, err = page.PrintToPDF().
				WithPrintBackground(true).
				WithPreferCSSPageSize(false).
				WithPaperWidth(r.options.PaperWidthInches).
				WithPaperHeight(r.options.PaperHeightInches).
				WithScale(r.options.PDFScale).
				WithMarginTop(0).
				WithMarginBottom(0).
				WithMarginLeft(0).
				WithMarginRight(0).
				Do(ctx)
			return err
		}),
	)
	if err != nil {
		return nil, err
	}

	return pdf, nil
}
