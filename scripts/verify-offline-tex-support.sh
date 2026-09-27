#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
resource_bundle="${1:-$repo_root/apps/macos/Sources/MarkdownMacOS/Resources}"
resource_root="$resource_bundle"
if [[ -d "$resource_bundle/Contents/Resources" ]]; then
  resource_root="$resource_bundle/Contents/Resources"
fi
tectonic="${TECTONIC_BIN:-$repo_root/output/tools/tectonic-0.17.0/tectonic}"
support_bundle="$resource_root/TeX/hcmut-offline-v1.ttb"
fixture="$repo_root/scripts/fixtures/offline-tex/report.tex"
work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

test -x "$tectonic"
test -f "$support_bundle"
test -f "$fixture"

mkdir -p "$work_dir/cache" "$work_dir/output"
if ! TECTONIC_CACHE_DIR="$work_dir/cache" "$tectonic" \
  --untrusted \
  --only-cached \
  --bundle "$support_bundle" \
  --keep-logs \
  --outdir "$work_dir/output" \
  "$fixture" >"$work_dir/tectonic.stdout" 2>"$work_dir/tectonic.stderr"; then
  cat "$work_dir/tectonic.stdout"
  cat "$work_dir/tectonic.stderr" >&2
  exit 1
fi

test -s "$work_dir/output/report.pdf"
test -f "$work_dir/output/report.log"

font_error_pattern='Font shape .* undefined|unable to generate PK font|Could not locate a virtual/physical font|There are no valid font mapping entry|Unable to find TFM file|Cannot proceed without \.vf'
if grep -Eiq "$font_error_pattern" \
  "$work_dir/tectonic.stdout" \
  "$work_dir/tectonic.stderr" \
  "$work_dir/output/report.log"; then
  grep -Ein "$font_error_pattern" \
    "$work_dir/tectonic.stdout" \
    "$work_dir/tectonic.stderr" \
    "$work_dir/output/report.log" >&2
  exit 1
fi
