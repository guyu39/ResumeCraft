#!/usr/bin/env bash
set -euo pipefail

# 通过代理访问 github，便于 skills add 拉取仓库
# no_proxy 确保百度内网域名（npm registry 等）直连，不走外网代理
#export https_proxy="http://agent.baidu.com:8891"
#export http_proxy="http://agent.baidu.com:8891"
#export no_proxy="localhost,127.0.0.1,.baidu.com,.baidu-int.com"

echo "==> 检查 Node.js 与 npm 版本"

if ! command -v node >/dev/null 2>&1; then
  echo "错误: 未检测到 node，请先安装 Node.js (https://nodejs.org/)" >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "错误: 未检测到 npm，请先安装 npm" >&2
  exit 1
fi

node_version="$(node -v)"
npm_version="$(npm -v)"

echo "Node.js 版本: ${node_version}"
echo "npm 版本: ${npm_version}"

echo "==> 安装 openspec"
current_openspec="$(openspec --version 2>/dev/null || echo none)"
latest_openspec="$(npm view @fission-ai/openspec version 2>/dev/null || echo unknown)"
if [ "$current_openspec" = "$latest_openspec" ]; then
  echo "openspec 已是最新 (${current_openspec})，跳过安装"
else
  echo "openspec 当前版本: ${current_openspec}，最新版本: ${latest_openspec}，开始安装"
  npm install -g @fission-ai/openspec@latest
fi

if [ -d openspec ]; then
  echo "openspec 已初始化，跳过 init"
else
  openspec init --tools claude
fi

echo "==> openspec 安装完成"
openspec --version 2>/dev/null || echo "提示: 可执行 'openspec --help' 查看用法"

echo "==> 添加 obsidian 技能仓库 (kepano/obsidian-skills)"
if [ -d .claude/skills/obsidian-markdown ]; then
  echo "obsidian 技能已存在，位置: $(pwd)/.claude/skills/obsidian-markdown"
else
  npx -y skills add https://github.com/kepano/obsidian-skills --skill '*' --agent claude-code -y
fi

echo "==> 添加 superpowers 技能仓库 (obra/superpowers)"
if [ -d .claude/skills/using-superpowers ]; then
  echo "superpowers 技能已存在，位置: $(pwd)/.claude/skills/using-superpowers"
else
  npx -y skills add https://github.com/obra/superpowers --skill '*' --agent claude-code -y
fi

echo "==> 添加 karpathy 技能仓库 (forrestchang/andrej-karpathy-skills)"
if [ -d .claude/skills/karpathy-guidelines ]; then
  echo "karpathy 技能已存在，位置: $(pwd)/.claude/skills/karpathy-guidelines"
else
  npx -y skills add https://github.com/forrestchang/andrej-karpathy-skills --skill '*' --agent claude-code -y
fi

echo "==> 添加 gstack 技能仓库 (garrytan/gstack)"
if [ -d .claude/skills/gstack ]; then
  echo "gstack 技能已存在，位置: $(pwd)/.claude/skills/gstack"
else
  npx -y skills add https://github.com/garrytan/gstack --skill '*' --agent claude-code -y
fi

echo "==> 添加 ui-ux-pro-max 技能仓库 (nextlevelbuilder/ui-ux-pro-max-skill)"
if [ -d .codebuddy/skills/ui-ux-pro-max ]; then
  echo "ui-ux-pro-max 技能已存在，跳过安装"
else
  npx -y ui-ux-pro-max-cli@latest init --ai codebuddy
fi

echo "==> 技能添加完成"
