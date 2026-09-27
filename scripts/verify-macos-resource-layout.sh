#!/usr/bin/env bash
set -euo pipefail

bundle_path="${1:?Pass the SwiftPM resource bundle path}"
resource_root="$bundle_path"
if [[ -d "$bundle_path/Contents/Resources" ]]; then
  resource_root="$bundle_path/Contents/Resources"
fi

test -f "$resource_root/Web/index.html"
test -d "$resource_root/Web/assets"
grep -q "script-src 'self';" "$resource_root/Web/index.html"
grep -q "style-src 'self' 'unsafe-inline';" "$resource_root/Web/index.html"
grep -q "connect-src 'none';" "$resource_root/Web/index.html"
grep -Eq '<script defer src="\./assets/index-[^"]+\.js"></script>' "$resource_root/Web/index.html"
if grep -Eq '<script[^>]+type="module"' "$resource_root/Web/index.html"; then
  echo "WKWebView entry must be a classic script, not a module." >&2
  exit 1
fi

javascript_path="$(find "$resource_root/Web/assets" -maxdepth 1 -name 'index-*.js' -print -quit)"
test -n "$javascript_path"
if ! find "$resource_root/Web/assets" -maxdepth 1 -name 'index-*.css' -print -quit | grep -q .; then
  grep -q 'createElement("style")' "$javascript_path"
fi
test -f "$resource_root/Web/prism-yaml.js"
test -f "$resource_root/Web/prism-latex.js"
test -f "$resource_root/Theme/Images/hcmut.png"
for font in lmmonolt10-bold lmmonolt10-boldoblique lmmono10-italic; do
  test -s "$resource_root/Theme/Fonts/$font.otf"
done
test -s "$resource_root/Theme/Fonts/GUST-FONT-LICENSE.txt"
test -s "$resource_root/Theme/Fonts/PROVENANCE.md"
test -f "$resource_root/TeX/hcmut-offline-v1.ttb"
test -x "$resource_root/Tools/tectonic"
test -f "$resource_root/Tools/TECTONIC_LICENSE"
test -f "$resource_root/Licenses/TECTONIC_SUPPORT_BUNDLE_NOTICES.md"
test -f "$resource_root/Licenses/TEXLIVE_LICENSE.txt"
test -f "$resource_root/Licenses/GNU_GPL_V2.txt"
test -f "$resource_root/Licenses/THIRD_PARTY_NOTICES.md"
test -f "$resource_root/Licenses/MUYA_LICENSE"
