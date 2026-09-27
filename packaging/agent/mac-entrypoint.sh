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
  /usr/bin/osascript -e 'display dialog "Codex Task Lens 需要 Node.js 22.20+。请先安装 Node.js。" buttons {"好"} default button 1 with icon caution' >/dev/null 2>&1 || true
  exit 1
fi
if ! "$NODE" -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=20)?0:1)' >/dev/null 2>&1; then
  VERSION="$($NODE -p 'process.version' 2>/dev/null || echo unknown)"
  /usr/bin/osascript -e "display dialog \"Codex Task Lens 需要 Node.js 22.20+；当前为 $VERSION。\" buttons {\"好\"} default button 1 with icon caution" >/dev/null 2>&1 || true
  exit 1
fi
if [[ "${TASK_LENS_AGENT_SMOKE:-0}" == "1" ]]; then
  exec "$NODE" "$RESOURCES/launcher.mjs"
fi
STATE="$HOME/Library/Application Support/CodexTaskLens"
LOCK="$STATE/agent.lock"
CONTROL="$STATE/agent.control.json"
SETTINGS="$STATE/desktop-settings.json"
PORT="$($NODE -e 'const fs=require("fs");let p=9341;try{const v=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));if(Number.isInteger(v.port)&&v.port>=1024&&v.port<=65535)p=v.port}catch{}process.stdout.write(String(p))' "$SETTINGS")"
CODEX_RUNNING=0; LISTENING=0
(/usr/bin/pgrep -x ChatGPT >/dev/null 2>&1 || /usr/bin/pgrep -x Codex >/dev/null 2>&1) && CODEX_RUNNING=1
/usr/sbin/lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1 && LISTENING=1
LOCK_PID="$(/usr/bin/sed -n 's/.*"pid":\([0-9][0-9]*\).*/\1/p' "$LOCK" 2>/dev/null || true)"
if [[ -n "$LOCK_PID" ]] && /bin/kill -0 "$LOCK_PID" 2>/dev/null; then
  if [[ "$CODEX_RUNNING" == "0" ]]; then
    /bin/mkdir -p "$STATE"
    TMP="$CONTROL.$$"
    /usr/bin/printf '{"action":"restart","requestedAt":%s}\n' "$(/bin/date +%s)" > "$TMP"
    /bin/mv -f "$TMP" "$CONTROL"
    /usr/bin/osascript -e 'display notification "正在重新启动 Codex 并恢复 Task Lens…" with title "Codex Task Lens"' >/dev/null 2>&1 || true
  elif [[ "$LISTENING" == "0" ]]; then
    /usr/bin/osascript -e "display dialog \"Task Lens 后台已运行，但当前 Codex 没有开启本机调试端口 $PORT。\\n\\n请先正常退出 Codex，再双击 Task Lens。\" buttons {\"知道了\"} default button 1 with icon note" >/dev/null 2>&1 || true
  else
    /usr/bin/osascript -e 'display notification "Task Lens 已在运行，正在打开 Codex" with title "Codex Task Lens"' >/dev/null 2>&1 || true
    /usr/bin/osascript -e 'if application "ChatGPT" is running then' -e 'tell application "ChatGPT" to activate' -e 'end if' >/dev/null 2>&1 || true
  fi
  exit 0
fi
if [[ "$CODEX_RUNNING" == "1" && "$LISTENING" == "0" ]]; then
  /usr/bin/osascript -e "display dialog \"Codex 正在运行，但没有开启 Task Lens 需要的本机调试端口 $PORT。\\n\\n请先正常退出 Codex，再双击 Task Lens。Task Lens 会重新启动 Codex 并自动注入界面。\" buttons {\"知道了\"} default button 1 with icon note" >/dev/null 2>&1 || true
  exit 0
fi
MESSAGE="正在启动 Codex 并加载 Task Lens…"
[[ "$LISTENING" == "1" ]] && MESSAGE="正在连接 Codex…"
nohup "$NODE" "$RESOURCES/launcher.mjs" >/dev/null 2>&1 &
/usr/bin/osascript -e "display notification \"$MESSAGE\" with title \"Codex Task Lens\"" >/dev/null 2>&1 || true
(
  /bin/sleep 1
  /usr/bin/osascript -e 'if application "ChatGPT" is running then' -e 'tell application "ChatGPT" to activate' -e 'end if' >/dev/null 2>&1 || true
) &!
exit 0
