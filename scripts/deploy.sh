#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# growth-account-studio 一键部署脚本（Lighthouse / 任意 Docker 主机）
# 用法：
#   1) 服务器上:  ./deploy.sh init      # 首次：装 Docker Compose 插件 + 拉代码
#   2) 服务器上:  ./deploy.sh up        # 构建并启动（含迁移）
#   3) 服务器上:  ./deploy.sh update    # 拉最新代码并重建
#   4) 服务器上:  ./deploy.sh logs      # 跟日志
#   5) 服务器上:  ./deploy.sh down      # 停服
# 前置：git 仓库已推送、.env 已按 .env.production.example 配置
# ─────────────────────────────────────────────────────────────
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/growth-studio}"
REPO_URL="${REPO_URL:-}"   # 例：git@github.com:you/growth-account-studio.git
BRANCH="${BRANCH:-main}"

need() { command -v "$1" >/dev/null 2>&1 || { echo "❌ 缺少依赖: $1"; exit 1; }; }

cmd_init() {
  need docker
  # Docker Compose v2 插件
  docker compose version >/dev/null 2>&1 || {
    echo "安装 docker compose 插件..."
    sudo mkdir -p /usr/local/lib/docker/cli-plugins
    sudo curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$(uname -m)" \
      -o /usr/local/lib/docker/cli-plugins/docker-compose
    sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
  }
  [ -n "$REPO_URL" ] && {
    sudo mkdir -p "$APP_DIR"
    sudo git clone -b "$BRANCH" "$REPO_URL" "$APP_DIR" 2>/dev/null || echo "目录已存在，跳过 clone"
  }
  echo "✅ init 完成。下一步：cd $APP_DIR && cp .env.production.example .env && 编辑 .env"
}

cmd_up() {
  [ -f .env ] || { echo "❌ 缺少 .env（cp .env.production.example .env 后填写）"; exit 1; }
  docker compose --env-file .env up -d --build
  echo "✅ 已启动。验证：curl -s http://localhost:3000/api/v1/health"
}

cmd_update() {
  [ -n "$REPO_URL" ] && git pull --ff-only
  cmd_up
}

cmd_logs() { docker compose --env-file .env logs -f --tail=100; }
cmd_down() { docker compose --env-file .env down; }

case "${1:-}" in
  init)   cmd_init ;;
  up)     cmd_up ;;
  update) cmd_update ;;
  logs)   cmd_logs ;;
  down)   cmd_down ;;
  *) echo "用法: $0 {init|up|update|logs|down}"; exit 1 ;;
esac
