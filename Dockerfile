FROM oyh0mq3odt54g3vzjv.xuanyuan.run/library/golang:1.25.0-alpine AS backend-builder
WORKDIR /app/backend

COPY backend/go.mod backend/go.sum ./
ENV GOPROXY=https://goproxy.cn,direct
RUN go mod download

COPY backend/. ./
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-w -s" -o /out/server ./cmd/server

FROM oyh0mq3odt54g3vzjv.xuanyuan.run/library/debian:bookworm-slim AS runtime

RUN sed -i 's|http://deb.debian.org/debian|http://mirrors.tuna.tsinghua.edu.cn/debian|g' /etc/apt/sources.list.d/debian.sources && \
    sed -i 's|http://deb.debian.org/debian-security|http://mirrors.tuna.tsinghua.edu.cn/debian-security|g' /etc/apt/sources.list.d/debian.sources && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
    chromium \
    ca-certificates \
    fonts-noto-cjk \
    fonts-roboto \
    fonts-wqy-microhei \
    fonts-wqy-zenhei \
    fontconfig \
    tzdata \
    wget \
    && fc-cache -fv \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -m -s /bin/bash appuser \
    && mkdir -p /app \
    && chown -R appuser:appuser /app

RUN mkdir -p /home/appuser/.config/fontconfig && \
    printf '<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\n<fontconfig>\n  <!-- 微软雅黑 → 文泉驿微米黑 -->\n  <alias><family>Microsoft YaHei</family><prefer><family>WenQuanYi Micro Hei</family></prefer></alias>\n  <!-- 宋体 → Noto Serif CJK SC -->\n  <alias><family>SimSun</family><prefer><family>Noto Serif CJK SC</family></prefer></alias>\n  <!-- 黑体 → 文泉驿正黑 -->\n  <alias><family>SimHei</family><prefer><family>WenQuanYi Zen Hei</family></prefer></alias>\n  <!-- 楷体 → 文泉驿微米黑（Linux 无自带楷体） -->\n  <alias><family>KaiTi</family><prefer><family>WenQuanYi Micro Hei</family></prefer></alias>\n  <!-- 苹方 → 文泉驿微米黑 -->\n  <alias><family>PingFang SC</family><prefer><family>WenQuanYi Micro Hei</family></prefer></alias>\n</fontconfig>\n' > /home/appuser/.config/fontconfig/fonts.conf && \
    chown -R appuser:appuser /home/appuser/.config


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
