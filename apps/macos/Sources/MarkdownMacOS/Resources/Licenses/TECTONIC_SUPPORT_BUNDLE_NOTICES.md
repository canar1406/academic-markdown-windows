# Tectonic Offline Support Bundle Notices

This application embeds `TeX/hcmut-offline-v1.ttb`, a reduced, repacked
support bundle for Tectonic 0.17.0. It contains only the 492 support files that
were fetched from Tectonic's official TeX Live 2024 default bundle while
compiling the HCMUT reference, application golden, and offline compatibility
fixtures.

## Provenance

- Upstream bundle URL: `https://relay.fullyjustified.net/default_bundle_v33.tar`
- Upstream bundle content identifier: `6ffe055852f8faf66c0acbe1a7fb27f87b869a90bad1204f3bf4d9683f597c7c`
- Tectonic bundle content hash: `e2101d345c91038cc219591863d6e74d0ee57b19befce0ec8f2bd5170c908cbe`
- Embedded file SHA-256: `12127614ab3adae2ed63f28d5f7159ddebe45e2c681c881a2c30c6354b8b9781`
- TeX Live catalogue snapshot used for the inventory: release 2024 frozen
- Repacking change: Tectonic's cache files were copied without source edits and
  packed into a local TTBv1 file. No TeX package source was modified.
- Repack recipe: `scripts/repack-offline-tex-support.sh`, pinned to Tectonic
  0.17.0 and the fixture `scripts/fixtures/offline-tex/report.tex`.

The bundle contains 492 support files. The font closure added for
Times-compatible mathematics is `8r.enc`,
`psyr.tfm`, `psyro.tfm`, `ptmr8r.tfm`, `ptmri8r.tfm`, `rsfs10.pfb`,
`rsfs10.tfm`, `usyr.pfb`, `utmr8a.pfb`, `utmri8a.pfb`, `zptmcm7m.vf`,
`zptmcm7t.vf`, and `zptmcm7y.vf`. TeX Live 2024 maps these files to `times`
and `symbol` (the GPL-licensed URW Base 35 fonts), `rsfs`, and the `dvips` or
`pdftex` core packages. `GNU_GPL_V2.txt` accompanies the GPL-covered fonts.
`lmmono10-regular.otf` is included from the `lm` package so normal-size
`\texttt` and listings content compile offline; the package is covered by the
GUST Font License recorded in the inventory.

TeX Live is a collection of independently licensed packages. Its redistribution
conditions are included in `TEXLIVE_LICENSE.txt`. Package source notices are
authoritative; catalogue identifiers below are an audit aid, not a replacement
for those notices. Entries marked `not-declared` are present in the TeX Live
catalogue without a single catalogue license identifier and therefore require
checking their package source before any public redistribution review is signed
off.

## Conservative Package Inventory

The cache format stores resources by lookup filename rather than original TeX
Live path. Where a filename can belong to both stable and development packages,
this inventory deliberately lists every plausible owner so notices are
over-inclusive rather than silently incomplete.

- `00texlive.image` - `not-declared`
- `a4wide` - `lppl1`
- `algorithm2e` - `lppl`
- `amscls` - `lppl1.3c`
- `amsfonts` - `ofl`
- `amsmath` - `lppl1.3c`
- `antomega` - `lppl`
- `atbegshi` - `lppl1.3`
- `atveryend` - `lppl1.3c`
- `auxhook` - `lppl1.3`
- `babel` - `lppl1.3`
- `bigintcalc` - `lppl1.3`
- `bitset` - `lppl1.3`
- `booktabs` - `lppl1.3c`
- `cancel` - `pd`
- `caption` - `lppl1.3`
- `cm` - `knuth`
- `cslatex` - `gpl`
- `dehyph-exptl` - `lppl1.3`
- `diagbox` - `lppl1.3`
- `dvips` - `other-free`
- `dvipdfmx` - `gpl`
- `etexcmds` - `lppl1.3`
- `etoolbox` - `lppl1.3c`
- `fancyhdr` - `lppl1.3`
- `firstaid` - `lppl1.3c`
- `fontspec` - `lppl1.3c`
- `geometry` - `lppl1.3c`
- `gettitlestring` - `lppl1.3`
- `glyphlist` - `not-declared`
- `graphics` - `lppl1.3c`
- `graphics-cfg` - `pd`
- `graphics-def` - `lppl1.3c`
- `hycolor` - `lppl1.3`
- `hyperref` - `lppl1.3`
- `hyphen-afrikaans` - `not-declared`
- `hyphen-ancientgreek` - `not-declared`
- `hyphen-armenian` - `not-declared`
- `hyphen-base` - `not-declared`
- `hyphen-basque` - `other-free`
- `hyphen-belarusian` - `not-declared`
- `hyphen-bulgarian` - `not-declared`
- `hyphen-catalan` - `not-declared`
- `hyphen-chinese` - `not-declared`
- `hyphen-churchslavonic` - `not-declared`
- `hyphen-coptic` - `not-declared`
- `hyphen-croatian` - `lppl1.3`
- `hyphen-czech` - `not-declared`
- `hyphen-danish` - `lppl`
- `hyphen-dutch` - `lppl`
- `hyphen-english` - `not-declared`
- `hyphen-esperanto` - `not-declared`
- `hyphen-estonian` - `not-declared`
- `hyphen-ethiopic` - `not-declared`
- `hyphen-finnish` - `pd`
- `hyphen-french` - `not-declared`
- `hyphen-friulan` - `not-declared`
- `hyphen-galician` - `not-declared`
- `hyphen-georgian` - `not-declared`
- `hyphen-german` - `not-declared`
- `hyphen-greek` - `other-free`
- `hyphen-hungarian` - `gpl`
- `hyphen-icelandic` - `lppl`
- `hyphen-indic` - `not-declared`
- `hyphen-indonesian` - `not-declared`
- `hyphen-interlingua` - `not-declared`
- `hyphen-irish` - `not-declared`
- `hyphen-italian` - `lgpl`
- `hyphen-kurmanji` - `not-declared`
- `hyphen-latin` - `lppl`
- `hyphen-latvian` - `not-declared`
- `hyphen-lithuanian` - `not-declared`
- `hyphen-macedonian` - `not-declared`
- `hyphen-mongolian` - `not-declared`
- `hyphen-norwegian` - `not-declared`
- `hyphen-occitan` - `not-declared`
- `hyphen-piedmontese` - `not-declared`
- `hyphen-polish` - `knuth`
- `hyphen-portuguese` - `not-declared`
- `hyphen-romanian` - `not-declared`
- `hyphen-romansh` - `not-declared`
- `hyphen-russian` - `not-declared`
- `hyphen-sanskrit` - `not-declared`
- `hyphen-serbian` - `gpl`
- `hyphen-slovak` - `not-declared`
- `hyphen-slovenian` - `not-declared`
- `hyphen-spanish` - `mit`
- `hyphen-swedish` - `not-declared`
- `hyphen-thai` - `not-declared`
- `hyphen-turkish` - `other-free`
- `hyphen-turkmen` - `not-declared`
- `hyphen-ukrainian` - `not-declared`
- `hyphen-uppersorbian` - `not-declared`
- `hyphen-welsh` - `not-declared`
- `ifoddpage` - `lppl1.3`
- `iftex` - `lppl1.3c`
- `infwarerr` - `lppl1.3`
- `intcalc` - `lppl1.3`
- `kvdefinekeys` - `lppl1.3c`
- `kvoptions` - `lppl1.3`
- `kvsetkeys` - `lppl1.3`
- `l3backend` - `lppl1.3c`
- `l3backend-dev` - `lppl1.3c`
- `l3kernel` - `lppl1.3c`
- `l3kernel-dev` - `lppl1.3c`
- `l3packages` - `lppl1.3c`
- `lambda` - `not-declared`
- `lastpage` - `lppl1.3c`
- `latex` - `lppl1.3c`
- `latex-amsmath-dev` - `lppl1.3c`
- `latex-base-dev` - `lppl1.3c`
- `latex-firstaid-dev` - `lppl1.3c`
- `latex-fonts` - `lppl`
- `latex-graphics-dev` - `lppl1.3c`
- `latex-tools-dev` - `lppl1.3c`
- `letltxmacro` - `lppl1.3`
- `listings` - `lppl1.3c`
- `lm` - `gfl`
- `ltxcmds` - `lppl1.3c`
- `makecmds` - `lppl`
- `mdframed` - `lppl`
- `multirow` - `lppl1.3`
- `needspace` - `lppl`
- `ntgclass` - `lppl1.3`
- `pdfescape` - `lppl1.3`
- `pdftex` - `gpl`
- `pdftexcmds` - `lppl1.3c`
- `pgf` - `lppl1.3c gpl2 fdl`
- `pict2e` - `lppl1.3`
- `polyglossia` - `mit lppl1.3 cc0`
- `psnfss` - `lppl`
- `refcount` - `lppl1.3`
- `relsize` - `pd`
- `rerunfilecheck` - `lppl1.3c`
- `rsfs` - `other-free`
- `setspace` - `lppl1.3`
- `stringenc` - `lppl1.3`
- `symbol` - `gpl`
- `tectonic-format-latex` - `MIT (Tectonic project)`
- `tex-ini-files` - `pd`
- `times` - `gpl`
- `tlperl.windows` - `not-declared`
- `tools` - `lppl1.3c`
- `ulem` - `other-free`
- `unicode-data` - `lppl1.3c`
- `uniquecounter` - `lppl1.3`
- `url` - `lppl`
- `vntex` - `other-free`
- `xcolor` - `lppl1.3c`
- `xetex` - `x11`
- `xkeyval` - `lppl1.3`
- `zapfding` - `gpl`
- `zref` - `lppl1.3c`
