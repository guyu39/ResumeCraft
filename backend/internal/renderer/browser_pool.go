package renderer

import (
	"context"
	"log"
	"sync"
	"time"

	"github.com/chromedp/chromedp"
)

// BrowserPool 维护一个可复用的 Chromium 浏览器实例，按需创建 Tab 而非整个进程。
// 通过信号量限制并发 Tab 数量，空闲超时后自动释放浏览器进程。
type BrowserPool struct {
	opts        []chromedp.ExecAllocatorOption
	maxTabs     int
	idleTimeout time.Duration

	mu          sync.Mutex
	allocCtx    context.Context
	allocCancel context.CancelFunc
	sem         chan struct{}
	activeTabs  int
	idleTimer   *time.Timer
	closed      bool
}

// NewBrowserPool 创建浏览器实例池。
// maxTabs: 最大并发 Tab 数（建议 5~10，取决于服务器内存）。
// idleTimeout: 空闲多久后自动关闭浏览器（0 表示不自动关闭）。
func NewBrowserPool(opts []chromedp.ExecAllocatorOption, maxTabs int, idleTimeout time.Duration) *BrowserPool {
	if maxTabs <= 0 {
		maxTabs = 10
	}
	return &BrowserPool{
		opts:        opts,
		maxTabs:     maxTabs,
		idleTimeout: idleTimeout,
		sem:         make(chan struct{}, maxTabs),
	}
}

// Acquire 获取一个浏览器 Tab 上下文。首次调用时自动启动浏览器。
// 返回的 cancel 函数必须在用完后调用以释放 Tab 资源。
func (p *BrowserPool) Acquire(parent context.Context) (context.Context, func()) {
	// 先获取信号量（阻塞直到有空位）
	select {
	case p.sem <- struct{}{}:
	case <-parent.Done():
		return nil, func() { <-p.sem }
	}

	p.mu.Lock()
	if p.closed {
		p.mu.Unlock()
		<-p.sem
		return nil, func() {}
	}

	// 取消空闲定时器（如果有）
	if p.idleTimer != nil {
		p.idleTimer.Stop()
		p.idleTimer = nil
	}

	// 懒启动浏览器
	if p.allocCtx == nil {
		allocCtx, cancel := chromedp.NewExecAllocator(context.Background(), p.opts...)
		p.allocCtx = allocCtx
		p.allocCancel = cancel
		log.Println("[browser-pool] 启动 Chromium 浏览器实例")
	}

	p.activeTabs++
	p.mu.Unlock()

	// 从共享的 allocator 创建新 Tab
	tabCtx, tabCancel := chromedp.NewContext(p.allocCtx)
	return tabCtx, func() {
		tabCancel()
		<-p.sem

		p.mu.Lock()
		p.activeTabs--
		remaining := p.activeTabs
		p.mu.Unlock()

		// 无活跃 Tab 时启动空闲定时器
		if remaining == 0 && p.idleTimeout > 0 {
			p.mu.Lock()
			if p.activeTabs == 0 && !p.closed {
				p.idleTimer = time.AfterFunc(p.idleTimeout, func() {
					p.mu.Lock()
					defer p.mu.Unlock()
					if p.activeTabs == 0 && p.allocCancel != nil {
						log.Println("[browser-pool] 浏览器空闲，关闭以释放资源")
						p.allocCancel()
						p.allocCtx = nil
						p.allocCancel = nil
					}
				})
			}
			p.mu.Unlock()
		}
	}
}

// Close 立即关闭浏览器进程，释放所有资源。
func (p *BrowserPool) Close() {
	p.mu.Lock()
	defer p.mu.Unlock()

	p.closed = true

	if p.idleTimer != nil {
		p.idleTimer.Stop()
		p.idleTimer = nil
	}

	if p.allocCancel != nil {
		log.Println("[browser-pool] 强制关闭浏览器")
		p.allocCancel()
		p.allocCtx = nil
		p.allocCancel = nil
	}
}
