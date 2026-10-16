#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
package_root="$repo_root/apps/macos"
configuration="${1:-release}"
binary_name="MarkdownMacOS"
display_name="Academic Markdown"
bundle_id="vn.heavietnam.academic-markdown"
output_root="$repo_root/build"
app_bundle="$output_root/$display_name.app"
build_dir="$package_root/.build/$configuration"
binary_path="$build_dir/$binary_name"
resource_bundle="$build_dir/MarkdownMacOS_MarkdownMacOS.bundle"
resource_root="$resource_bundle/Contents/Resources"
packaged_resource_bundle="$app_bundle/Contents/Resources/MarkdownMacOS_MarkdownMacOS.bundle"
packaged_resource_root="$packaged_resource_bundle/Contents/Resources"
tectonic_universal_source="${TECTONIC_BIN:-}"
tectonic_arm64_source="${TECTONIC_ARM64_BIN:-$repo_root/output/tools/tectonic-0.17.0/tectonic}"
tectonic_x86_64_source="${TECTONIC_X86_64_BIN:-$repo_root/output/tools/tectonic-0.17.0-x86_64/tectonic}"
tectonic_license="${TECTONIC_LICENSE:-$repo_root/output/tools/tectonic-0.17.0/LICENSE}"
third_party_notices="$repo_root/THIRD_PARTY_NOTICES.md"
muya_license="$repo_root/packages/muya-fork/LICENSE"
app_icon="$package_root/Assets/AcademicMarkdown.icns"

if [[ -n "$tectonic_universal_source" ]]; then
  if [[ ! -x "$tectonic_universal_source" ]]; then
    echo "TECTONIC_BIN is not executable: $tectonic_universal_source" >&2
    exit 1
  fi
else
  if [[ ! -x "$tectonic_arm64_source" || ! -x "$tectonic_x86_64_source" ]]; then
    echo "Missing arm64 or x86_64 Tectonic 0.17.0 binary." >&2
    exit 1
  fi
fi
if [[ ! -f "$tectonic_license" ]]; then
  echo "Missing Tectonic license at $tectonic_license" >&2
  exit 1
fi
if [[ ! -f "$third_party_notices" || ! -f "$muya_license" ]]; then
  echo "Missing THIRD_PARTY_NOTICES.md or the Muya MIT license." >&2
  exit 1
fi
if [[ ! -f "$app_icon" ]]; then
  echo "Missing app icon at $app_icon. Run scripts/generate-app-icon.sh." >&2
  exit 1
fi
if [[ -n "$tectonic_universal_source" ]]; then
  tectonic_architectures="$(lipo -archs "$tectonic_universal_source")"
  [[ " $tectonic_architectures " == *" arm64 "* && " $tectonic_architectures " == *" x86_64 "* ]] || {
    echo "TECTONIC_BIN must contain arm64 and x86_64 architectures." >&2
    exit 1
  }
else
  [[ "$(lipo -archs "$tectonic_arm64_source")" == "arm64" ]] || {
    echo "Tectonic arm64 input has the wrong architecture." >&2
    exit 1
  }
  [[ "$(lipo -archs "$tectonic_x86_64_source")" == "x86_64" ]] || {
    echo "Tectonic x86_64 input has the wrong architecture." >&2
    exit 1
  }
fi

"$repo_root/scripts/sync-editor-bundle.sh"

# Package.swift previously processed resources into a flat bundle. Remove that
# generated bundle so stale flat assets cannot leak into a newly packaged app.
rm -rf "$resource_bundle"

swift build \
  --package-path "$package_root" \
  --configuration "$configuration" \
  --arch arm64 \
  --arch x86_64

if [[ ! -x "$binary_path" ]]; then
  echo "Missing executable at $binary_path" >&2
  exit 1
fi
if [[ ! -d "$resource_bundle" ]]; then
  echo "Missing SwiftPM resource bundle at $resource_bundle" >&2
  exit 1
fi

mkdir -p "$resource_root/Tools"
mkdir -p "$resource_root/Licenses"
if [[ -n "$tectonic_universal_source" ]]; then
  cp "$tectonic_universal_source" "$resource_root/Tools/tectonic"
else
  lipo -create \
    "$tectonic_arm64_source" \
    "$tectonic_x86_64_source" \
    -output "$resource_root/Tools/tectonic"
fi
cp "$tectonic_license" "$resource_root/Tools/TECTONIC_LICENSE"
cp "$third_party_notices" "$resource_root/Licenses/THIRD_PARTY_NOTICES.md"
cp "$muya_license" "$resource_root/Licenses/MUYA_LICENSE"
chmod +x "$resource_root/Tools/tectonic"

"$repo_root/scripts/verify-macos-resource-layout.sh" "$resource_bundle"

mkdir -p "$output_root"
rm -rf "$app_bundle"
mkdir -p "$app_bundle/Contents/MacOS" "$app_bundle/Contents/Resources"
cp "$binary_path" "$app_bundle/Contents/MacOS/$binary_name"
cp -R "$resource_bundle" "$packaged_resource_bundle"
cp "$app_icon" "$app_bundle/Contents/Resources/AcademicMarkdown.icns"
chmod +x "$app_bundle/Contents/MacOS/$binary_name"

cat > "$app_bundle/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key><string>vi</string>
  <key>CFBundleDisplayName</key><string>$display_name</string>
  <key>CFBundleExecutable</key><string>$binary_name</string>
  <key>CFBundleIdentifier</key><string>$bundle_id</string>
  <key>CFBundleIconFile</key><string>AcademicMarkdown</string>
  <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
  <key>CFBundleName</key><string>$display_name</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>0.1.0</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSMinimumSystemVersion</key><string>15.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>CFBundleDocumentTypes</key>
  <array>
    <dict>
      <key>CFBundleTypeExtensions</key><array><string>md</string><string>markdown</string></array>
      <key>CFBundleTypeName</key><string>Markdown Document</string>
      <key>CFBundleTypeRole</key><string>Editor</string>
    </dict>
  </array>
</dict>
</plist>
PLIST

xattr -cr "$app_bundle"
"$repo_root/scripts/verify-macos-app-bundle.sh" "$app_bundle"
for universal_binary in \
  "$app_bundle/Contents/MacOS/$binary_name" \
  "$packaged_resource_root/Tools/tectonic"; do
  packaged_architectures="$(lipo -archs "$universal_binary")"
  [[ " $packaged_architectures " == *" arm64 "* && " $packaged_architectures " == *" x86_64 "* ]] || {
    echo "Packaged binary is not universal: $universal_binary" >&2
    exit 1
  }
done
codesign --force --sign - "$packaged_resource_root/Tools/tectonic"
codesign --force --sign - "$packaged_resource_bundle"
codesign --force --sign - "$app_bundle"
codesign --verify --deep --strict "$app_bundle"

echo "$app_bundle"
