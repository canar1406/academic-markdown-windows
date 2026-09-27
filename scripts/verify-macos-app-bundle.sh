#!/usr/bin/env bash
set -euo pipefail

app_path="${1:?Pass the macOS .app bundle path}"
info_plist="$app_path/Contents/Info.plist"

test -f "$info_plist"
plutil -lint "$info_plist" >/dev/null

executable_name="$(plutil -extract CFBundleExecutable raw -o - "$info_plist")"
test -n "$executable_name"
test -x "$app_path/Contents/MacOS/$executable_name"

icon_name="$(plutil -extract CFBundleIconFile raw -o - "$info_plist")"
test -n "$icon_name"
if [[ "$icon_name" != *.icns ]]; then
  icon_name="$icon_name.icns"
fi
test -f "$app_path/Contents/Resources/$icon_name"
