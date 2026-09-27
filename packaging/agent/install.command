#!/bin/zsh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
VERSION="$(tr -d '\r\n' < "$ROOT/VERSION")"
NODE="$(command -v node || true)"
if [[ -z "$NODE" ]]; then
  /usr/bin/osascript -e 'display dialog "Codex Task Lens 轻量版需要 Node.js 24。请先安装 Node.js，再重新运行安装器。" buttons {"好"} default button 1 with icon caution' || true
  exit 1
fi
MAJOR="$($NODE -p 'process.versions.node.split(".")[0]')"
if [[ "$MAJOR" != "24" ]]; then
  /usr/bin/osascript -e 'display dialog "当前 Node.js 版本不受支持。Codex Task Lens 需要 Node.js 24.x。" buttons {"好"} default button 1 with icon caution' || true
  exit 1
fi
INSTALL="$HOME/Library/Application Support/CodexTaskLens/runtime/$VERSION"
APP="$HOME/Applications/Codex Task Lens.app"
mkdir -p "$INSTALL" "$APP/Contents/MacOS"
rm -rf "$INSTALL/agent"
/usr/bin/ditto "$ROOT/agent" "$INSTALL/agent"
cp "$ROOT/launcher.mjs" "$INSTALL/launcher.mjs"
chmod 700 "$INSTALL/launcher.mjs"
NODE_Q="$(printf '%q' "$NODE")"
LAUNCH_Q="$(printf '%q' "$INSTALL/launcher.mjs")"
cat > "$APP/Contents/MacOS/Codex Task Lens" <<EOF
#!/bin/zsh
exec $NODE_Q $LAUNCH_Q
EOF
chmod 700 "$APP/Contents/MacOS/Codex Task Lens"
cat > "$APP/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>Codex Task Lens</string>
<key>CFBundleDisplayName</key><string>Codex Task Lens</string>
<key>CFBundleIdentifier</key><string>dev.yzin.codex-task-lens.agent</string>
<key>CFBundleVersion</key><string>$VERSION</string>
<key>CFBundleShortVersionString</key><string>$VERSION</string>
<key>CFBundleExecutable</key><string>Codex Task Lens</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>LSUIElement</key><true/>
</dict></plist>
EOF
/usr/bin/plutil -lint "$APP/Contents/Info.plist" >/dev/null
echo "Codex Task Lens $VERSION 已安装：$APP"
echo "以后双击这个 App 即可；运行界面会直接注入 Codex。"
echo "默认读取 ~/.codex 的会话路径线索，不读取 auth.json。"
if [[ "${TASK_LENS_INSTALL_NO_LAUNCH:-0}" != "1" ]]; then /usr/bin/open "$APP"; fi
