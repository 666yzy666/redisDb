# =============================================================================
# 单应用镜像(对齐 sub2api 思路):前端构建 -> 后端 Express 一起托管
#   Stage 1  构建前端静态资源(vite build -> dist)
#   Stage 2  Node 运行后端,并把前端 dist 放到 /app/public 由 Express 托管
# 一个容器、一个端口(3000)同时提供前端页面与 /api 接口。
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: 前端构建
# -----------------------------------------------------------------------------
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build          # 产物在 /app/frontend/dist

# -----------------------------------------------------------------------------
# Stage 2: 后端运行(内含前端静态)
# -----------------------------------------------------------------------------
FROM node:20-alpine
WORKDIR /app

# 先装后端生产依赖(利用层缓存)
COPY backend/package*.json ./
RUN npm ci --omit=dev

# 后端源码 + SQL
COPY backend/src ./src
COPY backend/sql ./sql

# 前端构建产物 -> /app/public(app.js 默认从 ../public 托管)
COPY --from=frontend-builder /app/frontend/dist ./public

# 非 root 运行(安全),并把工作目录归属给它
RUN addgroup -g 1001 app && adduser -u 1001 -G app -D app && chown -R app:app /app
USER app

EXPOSE 3000

# 健康检查:打 /api/health
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -T 5 -O /dev/null http://localhost:3000/api/health || exit 1

CMD ["node", "src/server.js"]
