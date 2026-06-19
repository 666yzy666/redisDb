#!/usr/bin/env bash
# 全栈一键部署脚本(mysql + redis + backend + frontend 都跑在容器里)
# 用法: ./deploy.sh <命令>
set -euo pipefail

cd "$(dirname "$0")"   # 切到 miniapp/ 目录(compose 文件所在)

COMPOSE="docker compose"
FRONT_URL="http://localhost:5173"
API_URL="http://localhost:3000/api/health"

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

入口: 前端 ${FRONT_URL}  |  后端 API ${API_URL%/health}
EOF
}

case "${1:-help}" in
  up)
    $COMPOSE up -d --build
    echo "✅ 已启动。前端: ${FRONT_URL}  后端: ${API_URL%/health}"
    ;;
  build)
    $COMPOSE build
    echo "✅ 镜像构建完成。"
    ;;
  rebuild)
    echo "🔁 无缓存重建镜像..."
    $COMPOSE build --no-cache
    $COMPOSE up -d --force-recreate
    echo "✅ 已重建并启动。前端: ${FRONT_URL}"
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
