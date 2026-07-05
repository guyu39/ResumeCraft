#!/bin/bash
# deploy.sh — 本地 build + 上传 dist 到服务器 + 重启 nginx
# 用法: ./deploy.sh

set -e

SERVER="guyu@49.235.166.228"
REMOTE_DIR="~/workspace/introduce"

echo "=== 1. 构建前端 ==="
npm run build

echo "=== 2. 上传 dist 到服务器 ==="
scp -r dist/ "$SERVER:$REMOTE_DIR/dist/"

echo "=== 3. 重建 nginx 容器 ==="
ssh "$SERVER" "cd $REMOTE_DIR && docker compose stop web && docker compose rm -f web && docker compose up -d web"

echo "=== 部署完成 ==="
