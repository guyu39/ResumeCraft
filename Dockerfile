FROM xuanyuan.run/library/golang:1.25.0-alpine AS backend-builder
WORKDIR /app/backend

COPY backend/go.mod backend/go.sum ./
ENV GOPROXY=https://goproxy.cn,direct
RUN go mod download

COPY backend/. ./
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-w -s" -o /out/server ./cmd/server

FROM xuanyuan.run/library/debian:bookworm-slim AS runtime

RUN sed -i 's|http://deb.debian.org/debian|http://mirrors.tuna.tsinghua.edu.cn/debian|g' /etc/apt/sources.list.d/debian.sources && \
    sed -i 's|http://deb.debian.org/debian-security|http://mirrors.tuna.tsinghua.edu.cn/debian-security|g' /etc/apt/sources.list.d/debian.sources && \
    apt-get update && \
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

COPY --chown=appuser:appuser --from=backend-builder /out/server /app/server

ENV PORT=8787 \
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

CMD ["/app/server"]
