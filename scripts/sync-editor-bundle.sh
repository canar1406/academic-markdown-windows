#!/bin/zsh
set -euo pipefail

repo_root="${0:A:h}/.."
editor_dir="$repo_root/apps/editor"
resource_dir="$repo_root/apps/macos/Sources/MarkdownMacOS/Resources/Web"

cd "$repo_root"
npx --yes pnpm@10.15.0 --filter @markdown/editor build
find "$resource_dir" -mindepth 1 ! -name README.txt -delete
cp -R "$editor_dir/dist/." "$resource_dir/"
