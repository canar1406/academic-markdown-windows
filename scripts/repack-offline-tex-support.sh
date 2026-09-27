#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
tectonic="${TECTONIC_BIN:-$repo_root/output/tools/tectonic-0.17.0/tectonic}"
source_bundle="${SOURCE_BUNDLE:-$repo_root/apps/macos/Sources/MarkdownMacOS/Resources/TeX/hcmut-offline-v1.ttb}"
fixture="$repo_root/scripts/fixtures/offline-tex/report.tex"
bundle_spec="$repo_root/scripts/fixtures/offline-tex/hcmut-offline-v1-bundle.toml"
destination="${1:-$repo_root/output/hcmut-offline-v1.ttb}"
upstream_content_id="6ffe055852f8faf66c0acbe1a7fb27f87b869a90bad1204f3bf4d9683f597c7c"
work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

test -x "$tectonic"
test -f "$source_bundle"
test -f "$fixture"
test -f "$bundle_spec"

signature="$(dd if="$source_bundle" bs=14 count=1 2>/dev/null)"
test "$signature" = "tectonicbundle"
index_start="$(od -An -tu8 -j18 -N8 "$source_bundle" | tr -d ' ')"
index_length="$(od -An -tu4 -j26 -N4 "$source_bundle" | tr -d ' ')"
dd if="$source_bundle" bs=1 skip="$index_start" count="$index_length" 2>/dev/null \
  | gunzip > "$work_dir/source-index.txt"

# Seed Tectonic's cache from the current reduced bundle so the online closure
# fetch downloads only resources newly exercised by the compatibility fixture.
cache_data="$work_dir/cache/bundles/data/$upstream_content_id"
mkdir -p "$cache_data" "$work_dir/online-output"
awk '/^\[FILELIST\]/{in_files=1; next} in_files {print}' "$work_dir/source-index.txt" \
  | while read -r start gzip_length real_length hash file_path; do
      case "$file_path" in
        cache/*)
          target="$cache_data/${file_path#cache/}"
          dd if="$source_bundle" bs=1 skip="$start" count="$gzip_length" 2>/dev/null \
            | gunzip > "$target"
          ;;
      esac
    done

TECTONIC_CACHE_DIR="$work_dir/cache" "$tectonic" \
  --untrusted \
  --keep-logs \
  --outdir "$work_dir/online-output" \
  "$fixture"

test -s "$work_dir/online-output/report.pdf"

build_root="$work_dir/build"
content_dir="$build_root/hcmut-offline-v1/content"
mkdir -p "$content_dir/cache"
find "$cache_data" -maxdepth 1 -type f -exec cp {} "$content_dir/cache" \;

required_resources=(
  8r.enc
  cmex10.pfb
  lmmono10-regular.otf
  psyr.tfm
  psyro.tfm
  ptmr8r.tfm
  ptmri8r.tfm
  rsfs10.pfb
  rsfs10.tfm
  usyr.pfb
  utmr8a.pfb
  utmri8a.pfb
  zptmcm7m.vf
  zptmcm7t.vf
  zptmcm7v.vf
  zptmcm7y.vf
)
for resource in "${required_resources[@]}"; do
  test -s "$content_dir/cache/$resource"
done

resource_count="$(find "$content_dir/cache" -maxdepth 1 -type f | wc -l | tr -d ' ')"
test "$resource_count" = "544"

printf '/cache//\n' > "$content_dir/SEARCH"
(
  cd "$content_dir"
  {
    printf 'nohash FILELIST\n'
    printf '%s SEARCH\n' "$(shasum -a 256 SEARCH | awk '{print $1}')"
    printf 'nohash SHA256SUM\n'
    find cache -type f | LC_ALL=C sort | while IFS= read -r file_path; do
      printf '%s %s\n' "$(shasum -a 256 "$file_path" | awk '{print $1}')" "$file_path"
    done
  } > FILELIST
  shasum -a 256 FILELIST | awk '{print $1}' > SHA256SUM
)

content_hash="$(tr -d '\n' < "$content_dir/SHA256SUM")"
test "$content_hash" = "10933ca68a32ea43cdbda7815dee0bb84d7b15a270c7760954364d3dae5d2dbf"

"$tectonic" -X bundle create \
  --job pack \
  --build-dir "$build_root" \
  "$bundle_spec" \
  v1

candidate="$build_root/hcmut-offline-v1/hcmut-offline-v1.ttb"
test -s "$candidate"
mkdir -p "$(dirname "$destination")"
cp "$candidate" "$destination"

printf 'resources=%s\n' "$resource_count"
printf 'content_sha256=%s\n' "$content_hash"
printf 'bundle_sha256=%s\n' "$(shasum -a 256 "$destination" | awk '{print $1}')"
printf 'output=%s\n' "$destination"
