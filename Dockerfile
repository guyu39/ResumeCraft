# syntax=docker/dockerfile:1

# ============================================================
# Stage 1: Frontend build
# ============================================================
FROM node:20-bookworm-slim AS frontend-builder
WORKDIR /app

# 依赖层优先缓存
COPY package.json package-lock.json ./
RUN npm ci

# 源码层
COPY index.html ./
COPY tsconfig.json tsconfig.node.json vite.config.ts postcss.config.js tailwind.config.js ./
COPY src ./src
RUN npm run build

# ============================================================
# Stage 2: Go backend build
# ============================================================
FROM golang:1.22-bookworm AS backend-builder
WORKDIR /app/backend

# 依赖层优先缓存
COPY backend/go.mod backend/go.sum ./
RUN go mod download

# 源码层
COPY backend/. /
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-w -s" -o /out/server ./cmd/server

# ============================================================
# Stage 3: Runtime
# ============================================================
FROM debian:bookworm-slim AS runtime

# 安装运行时依赖（无 root 用户）
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        chromium \
        ca-certificates \
        fonts-noto-cjk \
        tzdata \
        wget \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -m -s /bin/bash appuser \
    && mkdir -p /app \
    && chown -R appuser:appuser /app

USER appuser
WORKDIR /app

# 复制构建产物
COPY --chown=appuser:appuser --from=backend-builder /out/server /app/server
COPY --chown=appuser:appuser --from=frontend-builder /app/dist /app/dist

# 环境变量（可在 docker-compose.yml 中覆盖）
ENV PORT=8787 \
    FRONTEND_DIST_DIR=/app/dist \
    CHROMIUM_HEADLESS=true \
    CHROMIUM_DISABLE_GPU=true \
    CHROMIUM_NO_SANDBOX=true \
    CHROMIUM_DISABLE_SETUID_SANDBOX=true \
    PDF_VIEWPORT_WIDTH=794 \
    PDF_VIEWPORT_HEIGHT=1123 \
    PDF_DEVICE_SCALE_FACTOR=1 \
    PDF_PAPER_WIDTH_INCH=8.27 \
    PDF_PAPER_HEIGHT_INCH=11.69 \
    PDF_SCALE=1 \
    CHROME_BIN=/usr/bin/chromium

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=10s \
    CMD wget -qO- http://localhost:8787/api/pdf/export || exit 1

# 信号处理：前台运行 PID 1
CMD ["/app/server"]
