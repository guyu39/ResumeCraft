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

	// 基础启动参数：禁止后台节流，确保 headless Tab 全力渲染图片和布局
	allocOpts := []chromedp.ExecAllocatorOption{
		chromedp.Flag("disable-background-timer-throttling", true),
		chromedp.Flag("disable-backgrounding-occluded-windows", true),
		chromedp.Flag("disable-renderer-backgrounding", true),
		chromedp.Flag("disable-features", "LazyFrameLoading,PaintHolding"),
		chromedp.Flag("disable-extensions", true),
		chromedp.Flag("disable-component-extensions-with-background-pages", true),
	}
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
		// 等待 body 可见（而非仅 DOM 就绪），确保浏览器已经开始渲染
		chromedp.WaitVisible("body", chromedp.ByQuery),
		// 显式等待所有图片加载完成，避免图片半截或缺失导致布局塌陷
		chromedp.Evaluate(`
			Promise.all(
				Array.from(document.images).map(img =>
					img.complete ? Promise.resolve() :
					new Promise(r => { img.onload = r; img.onerror = r; })
				)
			)
		`, nil),
		// 等待字体加载完成
		chromedp.Evaluate(`document.fonts.ready`, nil),
		// 额外留布局稳定时间
		chromedp.Sleep(500*time.Millisecond),
		emulation.SetEmulatedMedia().WithMedia("print"),
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
