#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
verifier="$repo_root/scripts/verify-macos-resource-layout.sh"
fixture_root="$(mktemp -d)"
trap 'rm -rf "$fixture_root"' EXIT

make_bundle() {
  local bundle_path="$1"
  local script_tag="$2"

  mkdir -p \
    "$bundle_path/Web/assets" \
    "$bundle_path/Theme/Images" \
    "$bundle_path/TeX" \
    "$bundle_path/Tools" \
    "$bundle_path/Licenses"
  printf '%s\n' \
    '<meta http-equiv="Content-Security-Policy" content="script-src '\''self'\''; style-src '\''self'\'' '\''unsafe-inline'\''; connect-src '\''none'\'';">' \
    "$script_tag" \
    > "$bundle_path/Web/index.html"
  printf '%s\n' \
    'const style = document.createElement("style");' \
    'style.textContent = "body { color: black; }";' \
    'document.head.appendChild(style);' \
    'document.body.dataset.ready = "true";' \
    > "$bundle_path/Web/assets/index-test.js"
  printf '%s\n' 'Prism.languages.yaml = {};' > "$bundle_path/Web/prism-yaml.js"
  printf '%s\n' 'Prism.languages.latex = {};' > "$bundle_path/Web/prism-latex.js"
  printf '%s\n' 'logo' > "$bundle_path/Theme/Images/hcmut.png"
  printf '%s\n' '#!/usr/bin/env bash' 'exit 0' > "$bundle_path/Tools/tectonic"
  chmod +x "$bundle_path/Tools/tectonic"
  printf '%s\n' 'license' > "$bundle_path/Tools/TECTONIC_LICENSE"
  printf '%s\n' 'offline bundle' > "$bundle_path/TeX/hcmut-offline-v1.ttb"
  printf '%s\n' 'support bundle notices' > "$bundle_path/Licenses/TECTONIC_SUPPORT_BUNDLE_NOTICES.md"
  printf '%s\n' 'TeX Live redistribution conditions' > "$bundle_path/Licenses/TEXLIVE_LICENSE.txt"
  printf '%s\n' 'GNU GPL version 2' > "$bundle_path/Licenses/GNU_GPL_V2.txt"
  printf '%s\n' 'third-party notices' > "$bundle_path/Licenses/THIRD_PARTY_NOTICES.md"
  printf '%s\n' 'Muya MIT license' > "$bundle_path/Licenses/MUYA_LICENSE"
}

classic_bundle="$fixture_root/classic.bundle"
make_bundle "$classic_bundle" '<script defer src="./assets/index-test.js"></script>'
"$verifier" "$classic_bundle"

nested_bundle="$fixture_root/nested.bundle"
make_bundle "$nested_bundle/Contents/Resources" '<script defer src="./assets/index-test.js"></script>'
"$verifier" "$nested_bundle"

relaxed_csp_bundle="$fixture_root/relaxed-csp.bundle"
make_bundle "$relaxed_csp_bundle" '<script defer src="./assets/index-test.js"></script>'
perl -0pi -e "s/connect-src 'none';/connect-src 'self';/" "$relaxed_csp_bundle/Web/index.html"
if "$verifier" "$relaxed_csp_bundle"; then
  echo "Verifier accepted a bundle with a relaxed connect-src policy." >&2
  exit 1
fi

module_bundle="$fixture_root/module.bundle"
make_bundle "$module_bundle" '<script defer type="module" src="./assets/index-test.js"></script>'
if "$verifier" "$module_bundle"; then
  echo "Verifier accepted a module entry that WKWebView cannot execute." >&2
  exit 1
fi

missing_notices_bundle="$fixture_root/missing-notices.bundle"
make_bundle "$missing_notices_bundle" '<script defer src="./assets/index-test.js"></script>'
mv "$missing_notices_bundle/Licenses" "$fixture_root/removed-licenses"
if "$verifier" "$missing_notices_bundle"; then
  echo "Verifier accepted an app bundle without redistributed dependency notices." >&2
  exit 1
fi

missing_prism_bundle="$fixture_root/missing-prism.bundle"
make_bundle "$missing_prism_bundle" '<script defer src="./assets/index-test.js"></script>'
mv "$missing_prism_bundle/Web/prism-yaml.js" "$fixture_root/removed-prism-yaml.js"
if "$verifier" "$missing_prism_bundle"; then
  echo "Verifier accepted an app bundle without local Prism language assets." >&2
  exit 1
fi

missing_tex_bundle="$fixture_root/missing-tex.bundle"
make_bundle "$missing_tex_bundle" '<script defer src="./assets/index-test.js"></script>'
mv "$missing_tex_bundle/TeX/hcmut-offline-v1.ttb" "$fixture_root/removed-hcmut-offline-v1.ttb"
if "$verifier" "$missing_tex_bundle"; then
  echo "Verifier accepted an app bundle without offline TeX support files." >&2
  exit 1
fi

missing_tex_notices="$fixture_root/missing-tex-notices.bundle"
make_bundle "$missing_tex_notices" '<script defer src="./assets/index-test.js"></script>'
mv "$missing_tex_notices/Licenses/TECTONIC_SUPPORT_BUNDLE_NOTICES.md" "$fixture_root/removed-tectonic-support-notices.md"
if "$verifier" "$missing_tex_notices"; then
  echo "Verifier accepted an app bundle without TeX support-bundle notices." >&2
  exit 1
fi

missing_texlive_license="$fixture_root/missing-texlive-license.bundle"
make_bundle "$missing_texlive_license" '<script defer src="./assets/index-test.js"></script>'
mv "$missing_texlive_license/Licenses/TEXLIVE_LICENSE.txt" "$fixture_root/removed-texlive-license.txt"
if "$verifier" "$missing_texlive_license"; then
  echo "Verifier accepted an app bundle without TeX Live redistribution conditions." >&2
  exit 1
fi

missing_gpl_license="$fixture_root/missing-gpl-license.bundle"
make_bundle "$missing_gpl_license" '<script defer src="./assets/index-test.js"></script>'
mv "$missing_gpl_license/Licenses/GNU_GPL_V2.txt" "$fixture_root/removed-gpl-license.txt"
if "$verifier" "$missing_gpl_license"; then
  echo "Verifier accepted an app bundle without the GPL text for embedded URW fonts." >&2
  exit 1
fi
