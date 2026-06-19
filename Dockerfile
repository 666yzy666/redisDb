# =============================================================================
# 单应用镜像(Go 版,对齐 sub2api 思路):前端构建 -> 内嵌进 Go 二进制 -> 单进程托管
#   Stage 1  vite build 出前端 dist
#   Stage 2  golang 编译,把 dist 拷进 internal/web/dist 后 `-tags embed` 内嵌
#   Stage 3  极小运行镜像,只有一个静态二进制
# 一个容器、一个端口(3000)同时提供前端页面与 /api 接口。
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: 前端构建
# -----------------------------------------------------------------------------
FROM node:20-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build          # 产物在 /app/frontend/dist

# -----------------------------------------------------------------------------
# Stage 2: Go 编译(内嵌前端)
# -----------------------------------------------------------------------------
FROM golang:1.25-alpine AS builder
ENV GOPROXY=https://goproxy.cn,direct \
    CGO_ENABLED=0 \
    GOOS=linux
WORKDIR /src
# 先拉依赖(利用层缓存)
COPY backend-go/go.mod backend-go/go.sum ./
RUN go mod download
# 源码 + 前端产物 -> internal/web/dist(供 //go:embed all:dist)
COPY backend-go/ ./
COPY --from=frontend /app/frontend/dist ./internal/web/dist
RUN go build -tags embed -trimpath -ldflags="-s -w" -o /miniapp ./cmd/server

# -----------------------------------------------------------------------------
# Stage 3: 运行(极小镜像)
# -----------------------------------------------------------------------------
FROM alpine:3.20
# ca-certificates: SMTP over TLS;wget: 健康检查;tzdata: DSN loc=Local 时区
RUN apk add --no-cache ca-certificates wget tzdata \
    && addgroup -g 1001 app && adduser -u 1001 -G app -D app
USER app
COPY --from=builder /miniapp /miniapp

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -T 5 -O /dev/null http://localhost:3000/api/health || exit 1

ENTRYPOINT ["/miniapp"]
