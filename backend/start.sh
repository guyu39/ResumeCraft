#!/usr/bin/env bash
# 固定在 backend/ 目录启动后端，确保能加载同目录下的 .env（含 PG_DSN 等）。
# 无论从哪个目录调用，都先切到脚本所在目录再运行。
set -euo pipefail

# 脚本所在目录 = backend/，作为工作目录
SCRIPT_DIR="$(dirname "${BASH_SOURCE[0]}")"
cd "${SCRIPT_DIR}"

# 国内代理拉取依赖（已配置则不覆盖）
export GOPROXY="${GOPROXY:-https://goproxy.cn,direct}"

# 端口配置，默认8787
PORT="${PORT:-8787}"

# 检查端口占用并清理
echo "[start] 正在检测端口 ${PORT} 占用情况..."
# 获取监听该端口的进程PID
PIDS=$(lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN -t 2>/dev/null || true)
if [[ -n "${PIDS}" ]]; then
    echo "[start] 端口 ${PORT} 被进程占用，PID列表：${PIDS}"
    # 先温柔kill
    kill ${PIDS} 2>/dev/null || true
    sleep 0.5
    # 二次检查，没释放就强制kill
    REMAIN_PIDS=$(lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN -t 2>/dev/null || true)
    if [[ -n "${REMAIN_PIDS}" ]]; then
        echo "[start] 进程未正常退出，执行强制杀死：${REMAIN_PIDS}"
        kill -9 ${REMAIN_PIDS} 2>/dev/null || true
    fi
    echo "[start] 端口 ${PORT} 占用清理完成"
else
    echo "[start] 端口 ${PORT} 当前无占用"
fi

# 兜底清理 go run 编译出的孤儿子进程（Ctrl+C 时 server 子进程可能未随父进程退出，
# 残留后会继续占用端口，导致下次启动 "address already in use"）
ORPHANS=$(pgrep -f "cmd/server" 2>/dev/null || true)
if [[ -n "${ORPHANS}" ]]; then
    echo "[start] 清理残留 cmd/server 进程：${ORPHANS}"
    kill -9 ${ORPHANS} 2>/dev/null || true
    sleep 0.5
fi

echo "[start] 当前工作目录：$(pwd)"
echo "[start] 启动服务 go run ./cmd/server $*"
# 执行程序，接管进程信号
exec go run ./cmd/server "$@"