# PDF Backend (Gin)

当前后端使用 Gin 作为基础框架，采用可扩展的分层结构。

## 目录结构

```text
backend/
├─ cmd/
│  └─ server/
│     └─ main.go
├─ internal/
│  ├─ app/
│  │  └─ server.go
│  ├─ config/
│  │  └─ config.go
│  ├─ middleware/
│  │  └─ cors.go
│  ├─ model/
│  │  └─ pdf.go
│  ├─ router/
│  │  └─ router.go
│  ├─ handler/
│  │  ├─ handler.go
│  │  └─ pdf.go
│  ├─ service/
│  │  └─ pdf/
│  │     └─ service.go
│  └─ renderer/
│     └─ chromedp_renderer.go
├─ pkg/
│  └─ response/
│     └─ response.go
└─ go.mod
```

## 当前已实现能力

1. `GET /api/pdf/health`：健康检查。
2. `POST /api/pdf/export`：接收 HTML，渲染并返回 PDF 文件流。

说明：当前仅实现 PDF 导出，认证、持久化、任务队列等能力保留扩展位。

## 本地运行

1. 安装依赖

```bash
go mod tidy
```

2. 准备环境变量文件

```bash
cp .env.example .env
```

可按需修改端口、Chromium 启动参数、渲染超时。

3. 启动服务

```bash
go run ./cmd/server
```

4. 服务地址

```text
http://localhost:8787
```

## 环境变量

1. `PORT`：服务端口。
2. `SERVER_READ_HEADER_TIMEOUT_SEC`：请求头读取超时（秒）。
3. `SERVER_READ_TIMEOUT_SEC`：请求读取超时（秒）。
4. `SERVER_WRITE_TIMEOUT_SEC`：响应写入超时（秒）。
5. `PDF_RENDER_TIMEOUT_SEC`：PDF 渲染超时（秒）。
6. `CHROMIUM_HEADLESS`：是否无头模式。
7. `CHROMIUM_DISABLE_GPU`：是否禁用 GPU。
8. `CHROMIUM_NO_SANDBOX`：是否启用 no-sandbox。
9. `CHROMIUM_DISABLE_SETUID_SANDBOX`：是否禁用 setuid sandbox。

## 请求示例

`POST /api/pdf/export`

```json
{
  "html": "<!doctype html><html><body><h1>Hello PDF</h1></body></html>",
  "filename": "resume"
}
```
