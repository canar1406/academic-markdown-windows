#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
verifier="$repo_root/scripts/verify-macos-app-bundle.sh"
fixture_root="$(mktemp -d)"
trap 'rm -rf "$fixture_root"' EXIT

make_app() {
  local app_path="$1"
  local icon_name="$2"
  mkdir -p "$app_path/Contents/MacOS" "$app_path/Contents/Resources"
  printf '%s\n' '#!/usr/bin/env bash' 'exit 0' > "$app_path/Contents/MacOS/MarkdownMacOS"
  chmod +x "$app_path/Contents/MacOS/MarkdownMacOS"
  cat > "$app_path/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleExecutable</key><string>MarkdownMacOS</string>
  <key>CFBundleIconFile</key><string>$icon_name</string>
</dict></plist>
PLIST
}

valid_app="$fixture_root/Valid.app"
make_app "$valid_app" "AcademicMarkdown"
printf '%s\n' 'icon' > "$valid_app/Contents/Resources/AcademicMarkdown.icns"
"$verifier" "$valid_app"

missing_icon_app="$fixture_root/MissingIcon.app"
make_app "$missing_icon_app" "AcademicMarkdown"
if "$verifier" "$missing_icon_app"; then
  echo "Verifier accepted an app bundle without its declared icon." >&2
  exit 1
fi

missing_icon_key_app="$fixture_root/MissingIconKey.app"
make_app "$missing_icon_key_app" ""
printf '%s\n' 'icon' > "$missing_icon_key_app/Contents/Resources/AcademicMarkdown.icns"
if "$verifier" "$missing_icon_key_app"; then
  echo "Verifier accepted an app bundle without CFBundleIconFile." >&2
  exit 1
fi
