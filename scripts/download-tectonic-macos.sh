#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
version="0.17.0"
release_base="https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%40$version"
output_root="$repo_root/output/tools"
work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

download_arch() {
  local release_arch="$1"
  local expected_hash="$2"
  local destination="$3"
  local archive="$work_dir/tectonic-$release_arch.tar.gz"

  curl -L --fail --silent \
    "$release_base/tectonic-$version-$release_arch-apple-darwin.tar.gz" \
    -o "$archive"
  printf '%s  %s\n' "$expected_hash" "$archive" | shasum -a 256 -c -
  mkdir -p "$destination"
  tar -xzf "$archive" -C "$destination"
}

download_arch \
  "aarch64" \
  "a3f1cac7c5678f01661a92212f58480ae3b0634115d880dbc59e2953ded45667" \
  "$output_root/tectonic-$version"
download_arch \
  "x86_64" \
  "7c90ef5b6ddb1eb1937e4337add5237b79338e4b9676459fa91187d24d6cdf80" \
  "$output_root/tectonic-$version-x86_64"

curl -L --fail --silent \
  "https://raw.githubusercontent.com/tectonic-typesetting/tectonic/tectonic%40$version/LICENSE" \
  -o "$output_root/tectonic-$version/LICENSE"

test "$(lipo -archs "$output_root/tectonic-$version/tectonic")" = "arm64"
test "$(lipo -archs "$output_root/tectonic-$version-x86_64/tectonic")" = "x86_64"
