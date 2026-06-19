#!/usr/bin/env bash
# 单镜像一键部署脚本(app[前端+后端] + mysql + redis 三个容器)
# 用法: ./deploy.sh <命令>
set -euo pipefail

cd "$(dirname "$0")"   # 切到脚本所在目录(compose 文件所在,即仓库根)

COMPOSE="docker compose"
APP_URL="http://localhost:3000"   # 单镜像:前端页面 + /api 同一端口

usage() {
  cat <<EOF
用法: ./deploy.sh <命令>

  up        启动全部(镜像不存在会自动构建)
  build     构建镜像(用缓存)
  rebuild   无缓存重建镜像 + 重新创建容器(改了代码用这个)
  down      停止并移除容器(数据卷保留)
  clean     停止并删除容器 + 数据卷(数据清空,回到全新)
  logs      跟踪查看日志(Ctrl+C 退出)
  ps        查看各容器状态
  help      显示本帮助

入口: ${APP_URL} (前端页面 + /api 同一端口)
EOF
}

case "${1:-help}" in
  up)
    $COMPOSE up -d --build
    echo "✅ 已启动。入口: ${APP_URL} (前端 + API)"
    ;;
  build)
    $COMPOSE build
    echo "✅ 镜像构建完成。"
    ;;
  rebuild)
    echo "🔁 无缓存重建镜像..."
    $COMPOSE build --no-cache
    $COMPOSE up -d --force-recreate
    echo "✅ 已重建并启动。入口: ${APP_URL}"
    ;;
  down)
    $COMPOSE down
    echo "✅ 已停止(数据卷保留)。"
    ;;
  clean)
    read -r -p "⚠️  将删除容器并清空数据卷(数据全没),确认? [y/N] " ans
    if [ "${ans:-}" = "y" ] || [ "${ans:-}" = "Y" ]; then
      $COMPOSE down -v
      echo "✅ 已清空。"
    else
      echo "已取消。"
    fi
    ;;
  logs)
    $COMPOSE logs -f
    ;;
  ps)
    $COMPOSE ps
    ;;
  help|-h|--help)
    usage
    ;;
  *)
    echo "未知命令: $1"; echo; usage; exit 1
    ;;
esac
