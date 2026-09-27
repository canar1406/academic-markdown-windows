# Beta 1 License Audit

Audit date: 2026-08-26

## Scope

- Swift application source and packaging scripts.
- Bundled editor assets produced by the pnpm workspace.
- Muya/MarkText-derived source in `packages/muya-fork`.
- Tectonic and TeX support files considered for offline PDF export.
- HCMUT theme artwork and the supplied university logo.

## Evidence

Run from the repository root:

```bash
pnpm licenses list --json
```

The command completed successfully for the current lockfile. It reports 12
license buckets; the only package reported as `Unknown` is `khroma@2.1.0`,
whose installed package contains an MIT license file. The JSON output is kept
as a local audit artifact rather than checked into the app bundle.

The installed JavaScript dependency graph primarily uses MIT, ISC,
BSD-2-Clause, BSD-3-Clause, Apache-2.0, MPL-2.0/Apache-2.0, BlueOak-1.0.0,
CC0-1.0, Unlicense, and 0BSD licenses. `khroma@2.1.0` is reported as
`Unknown` by pnpm because its package metadata omits a license field, but its
installed `license` file contains the MIT License and the copyright notice for
Fabio Spampinato and Andrew Maney.

Muya's MIT license is preserved at `packages/muya-fork/LICENSE`. The pinned
upstream revision and local patch policy remain documented separately from
generated package metadata.

The universal macOS package now embeds arm64 and x86_64 Tectonic 0.17.0 plus a
reduced 492-file support bundle. Its
upstream URL/content identifier, TTB content hash, packaged SHA-256, repacking
method, TeX Live 2024 copying conditions, and conservative package/license
inventory ship under `Resources/Licenses`. The bundle is exercised with an
empty cache by `scripts/verify-offline-tex-support.sh`; Tectonic is invoked with
`--only-cached` so export cannot fetch undeclared resources at runtime. The
Times-compatible math closure adds resources from `times`, `symbol`, and
`rsfs`; the GPLv2 text for the embedded URW Base 35 fonts is included. The
Latin Modern Mono resource required by normal-size `\texttt` and listings is
from the GUST Font License-covered `lm` package already listed in the bundle
inventory.

`pnpm licenses:notice` now generates `THIRD_PARTY_NOTICES.md` from the current
lockfile. The generated notice records all 381 reported packages, metadata, and
the license/notice files found in each installed package; packages without a
license file are called out explicitly for manual review. The output is
deterministic for an unchanged lockfile.

## Release Requirements

Before a public build can be called Beta 1:

1. Generate a complete release notice from the production dependency graph,
   including license texts required by each redistributed package.
2. Record the exact Tectonic version and distribution method.
3. If Tectonic or a TeX support bundle is embedded, include its license and the
   notices required by every redistributed support package.
4. Obtain explicit permission or a documented trademark/license basis for
   redistributing `hcmut.png` and the supplied HCMUT theme artwork.
5. If logo permission is unavailable, remove the logo from public artifacts or
   require the user to provide it locally; do not silently ship the reference
   asset.

## Current Release Blockers

- HCMUT logo redistribution rights are not established.
- The support-bundle distribution method is finalized technically. Entries
  whose TeX Live catalogue license is `not-declared` still require final legal
  sign-off before public redistribution.
- The generated notice covers the current development lockfile. A final public
  release still needs a production-only dependency review and confirmation that
  every redistributed asset/support package is represented.

These blockers do not prevent local development or private fixture comparison,
but they prevent claiming a redistributable public Beta 1 package.
