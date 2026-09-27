#!/bin/zsh
set -u
RESOURCES="$(cd "$(dirname "$0")/../Resources" && pwd)"
NODE="${CODEX_TASK_LENS_NODE:-}"
if [[ -z "$NODE" || ! -x "$NODE" ]]; then
  for candidate in \
    "$HOME/.volta/bin/node" \
    "/opt/homebrew/bin/node" \
    "/usr/local/bin/node" \
    "$HOME/.local/bin/node" \
    "/usr/bin/node"; do
    if [[ -x "$candidate" ]]; then NODE="$candidate"; break; fi
  done
fi
if [[ -z "$NODE" || ! -x "$NODE" ]]; then
  NODE="$(/bin/zsh -lc 'command -v node' 2>/dev/null | /usr/bin/head -n 1)"
fi
if [[ -z "$NODE" || ! -x "$NODE" ]]; then
  /usr/bin/osascript -e 'display dialog "Codex Task Lens 需要 Node.js 22.20+ 或 24.x。请先安装 Node.js。" buttons {"好"} default button 1 with icon caution' >/dev/null 2>&1 || true
  exit 1
fi
if ! "$NODE" -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit((a===22&&b>=20)||a===24?0:1)' >/dev/null 2>&1; then
  VERSION="$($NODE -p 'process.version' 2>/dev/null || echo unknown)"
  /usr/bin/osascript -e "display dialog \"Codex Task Lens 需要 Node.js 22.20+ 或 24.x；当前为 $VERSION。\" buttons {\"好\"} default button 1 with icon caution" >/dev/null 2>&1 || true
  exit 1
fi
exec "$NODE" "$RESOURCES/launcher.mjs"
