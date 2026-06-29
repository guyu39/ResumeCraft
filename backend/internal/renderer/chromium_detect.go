package renderer

import (
	"os"
	"os/exec"
	"runtime"
)

// chromiumCandidates 按优先级返回当前操作系统上常见的 Chromium 内核浏览器候选路径。
// 优先 Chrome（兼容性最成熟），其次 Edge / Chromium / Brave，均为 Chromium 内核。
// 非 Chromium 内核（如 Safari/WebKit）不在列表，chromedp 无法驱动。
func chromiumCandidates() []string {
	switch runtime.GOOS {
	case "darwin":
		return []string{
			"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
			"/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
			"/Applications/Chromium.app/Contents/MacOS/Chromium",
			"/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
		}
	case "windows":
		return []string{
			`C:\Program Files\Google\Chrome\Application\chrome.exe`,
			`C:\Program Files (x86)\Google\Chrome\Application\chrome.exe`,
			`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`,
			`C:\Program Files\Microsoft\Edge\Application\msedge.exe`,
			`C:\Program Files\Chromium\Application\chrome.exe`,
		}
	default: // linux 及其他
		return []string{
			"/usr/bin/google-chrome",
			"/usr/bin/google-chrome-stable",
			"/usr/bin/chromium",
			"/usr/bin/chromium-browser",
			"/usr/bin/microsoft-edge",
			"/usr/bin/microsoft-edge-stable",
			"/usr/bin/brave-browser",
			"/snap/bin/chromium",
		}
	}
}

// linuxPATHNames Linux 下用 exec.LookPath 在 PATH 中查找的可执行名（覆盖非标准安装目录）。
var linuxPATHNames = []string{
	"google-chrome", "google-chrome-stable", "chromium", "chromium-browser",
	"microsoft-edge", "microsoft-edge-stable", "brave-browser",
}

// DetectChromiumPath 探测系统中已安装的 Chromium 内核浏览器路径。
// 返回空字符串表示未找到（调用方应据此给出可读提示）。
func DetectChromiumPath() string {
	for _, p := range chromiumCandidates() {
		if fileExists(p) {
			return p
		}
	}
	// Linux 回退：在 PATH 中查找（应对自定义安装路径）
	if runtime.GOOS != "darwin" && runtime.GOOS != "windows" {
		for _, name := range linuxPATHNames {
			if p, err := exec.LookPath(name); err == nil {
				return p
			}
		}
	}
	return ""
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}
