# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS frontend-builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html ./
COPY tsconfig.json tsconfig.node.json vite.config.ts postcss.config.js tailwind.config.js ./
COPY src ./src
RUN npm run build

FROM golang:1.22-bookworm AS backend-builder
WORKDIR /app/backend

COPY backend/go.mod backend/go.sum ./
RUN go mod download

COPY backend/. ./
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /out/server ./cmd/server

FROM debian:bookworm-slim AS runtime
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends chromium ca-certificates fonts-noto-cjk tzdata \
    && rm -rf /var/lib/apt/lists/*

COPY --from=backend-builder /out/server /app/server
COPY --from=frontend-builder /app/dist /app/dist

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
    PDF_SCALE=1

EXPOSE 8787

CMD ["/app/server"]
