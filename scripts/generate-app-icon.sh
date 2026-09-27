#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
source_svg="$repo_root/apps/macos/Assets/AppIcon.svg"
output_icns="$repo_root/apps/macos/Assets/AcademicMarkdown.icns"
iconset="$(mktemp -d)/AcademicMarkdown.iconset"
trap 'rm -rf "$(dirname "$iconset")"' EXIT

mkdir -p "$iconset"
base_png="$iconset/icon_512x512@2x.png"
sips -s format png "$source_svg" --out "$base_png" >/dev/null

for size in 16 32 128 256 512; do
  sips -z "$size" "$size" "$base_png" --out "$iconset/icon_${size}x${size}.png" >/dev/null
  doubled=$((size * 2))
  sips -z "$doubled" "$doubled" "$base_png" --out "$iconset/icon_${size}x${size}@2x.png" >/dev/null
done

iconutil -c icns "$iconset" -o "$output_icns"
