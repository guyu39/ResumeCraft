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
	Close()
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
	MaxBrowserTabs        int           // 最大并发 Tab 数（0=默认10）
	BrowserIdleTimeout    time.Duration // 浏览器空闲超时后自动关闭（0=不自动关闭）
}

type chromedpRenderer struct {
	options Options
	pool    *BrowserPool
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
	if options.MaxBrowserTabs <= 0 {
		options.MaxBrowserTabs = 10
	}
	if options.BrowserIdleTimeout <= 0 {
		options.BrowserIdleTimeout = 5 * time.Minute
	}

	allocOpts := []chromedp.ExecAllocatorOption{}
	if options.ChromiumHeadless {
		allocOpts = append(allocOpts, chromedp.Headless)
	} else {
		allocOpts = append(allocOpts, chromedp.Flag("headless", false))
	}
	if options.ChromiumDisableGPU {
		allocOpts = append(allocOpts, chromedp.DisableGPU)
	}
	if options.ChromiumNoSandbox {
		allocOpts = append(allocOpts, chromedp.NoSandbox)
	}
	if options.ChromiumDisableSetUID {
		allocOpts = append(allocOpts, chromedp.Flag("disable-setuid-sandbox", true))
	}

	return &chromedpRenderer{
		options: options,
		pool:    NewBrowserPool(allocOpts, options.MaxBrowserTabs, options.BrowserIdleTimeout),
	}
}

func (r *chromedpRenderer) RenderPDF(html string) ([]byte, error) {
	ctx, cancelTimeout := context.WithTimeout(context.Background(), r.options.RenderTimeout)
	defer cancelTimeout()

	tabCtx, releaseTab := r.pool.Acquire(ctx)
	if tabCtx == nil {
		return nil, ctx.Err()
	}
	defer releaseTab()

	tabCtx, cancelTab := context.WithTimeout(tabCtx, r.options.RenderTimeout)
	defer cancelTab()

	var pdf []byte
	err := chromedp.Run(tabCtx,
		chromedp.Navigate("about:blank"),
		emulation.SetDeviceMetricsOverride(int64(r.options.ViewportWidth), int64(r.options.ViewportHeight), r.options.DeviceScaleFactor, false),
		chromedp.ActionFunc(func(ctx context.Context) error {
			frameTree, err := page.GetFrameTree().Do(ctx)
			if err != nil {
				return err
			}
			return page.SetDocumentContent(frameTree.Frame.ID, html).Do(ctx)
		}),
		chromedp.WaitReady("body", chromedp.ByQuery),
		emulation.SetEmulatedMedia().WithMedia("print"),
		// 等待字体加载完成 + 布局稳定，避免缺失字体导致排版错乱或内容截断
		chromedp.Evaluate(`document.fonts.ready`, nil),
		chromedp.Sleep(300*time.Millisecond),
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

func (r *chromedpRenderer) Close() {
	r.pool.Close()
}
