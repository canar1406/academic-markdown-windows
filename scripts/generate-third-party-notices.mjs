#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const licenseReport = JSON.parse(
  execFileSync('pnpm', ['licenses', 'list', '--json'], {
    cwd: repoRoot,
    encoding: 'utf8',
  }),
)

const noticeFileNames = /^(?:licen[cs]e|copying|notice)(?:\.|$)|^unlicense$/i

function packageRows() {
  return Object.entries(licenseReport)
    .flatMap(([bucket, packages]) => packages.map((pkg) => ({ bucket, ...pkg })))
    .sort((left, right) => `${left.name}@${left.versions?.join(',')}`.localeCompare(`${right.name}@${right.versions?.join(',')}`))
}

function readNoticeFiles(packagePath) {
  if (!packagePath || !existsSync(packagePath)) return []
  return readdirSync(packagePath)
    .filter((name) => noticeFileNames.test(name))
    .sort()
    .map((name) => ({ name, text: readFileSync(join(packagePath, name), 'utf8').trim() }))
    .filter(({ text }) => text.length > 0)
}

const lines = [
  '# Third-Party Notices',
  '',
  '> Generated from the workspace lockfile with `pnpm licenses list --json`.',
  '> Regenerate with `pnpm licenses:notice` after dependency changes.',
  '',
  '## Project-specific notices',
  '',
  '- Unmodified Latin Modern Mono bold, italic and bold-oblique companion fonts are bundled under GUST Font License / LPPL 1.3c or later. Upstream license, README, manifest and file hashes are in `Theme/Fonts` in the macOS resource bundle.',
  '',
  '- Muya/MarkText-derived code is preserved under the MIT License in `packages/muya-fork/LICENSE`.',
  '- Universal Tectonic 0.17.0 binaries for arm64 and x86_64 are bundled; its MIT license is copied to `Tools/TECTONIC_LICENSE`.',
  '- The reduced offline TeX support bundle ships with TeX Live copying conditions, provenance, hashes, and a conservative package inventory under `Licenses/`.',
  '- The HCMUT logo and supplied theme artwork remain subject to redistribution approval; this notice does not grant those rights.',
  '',
  '## Dependency notices',
  '',
]

for (const pkg of packageRows()) {
  const version = pkg.versions?.join(', ') ?? 'unknown'
  const packagePath = pkg.paths?.[0]
  const notices = readNoticeFiles(packagePath)
  lines.push(`### ${pkg.name} ${version}`)
  lines.push('')
  lines.push(`- Declared license: ${pkg.license ?? pkg.bucket}`)
  if (pkg.author) lines.push(`- Author: ${pkg.author}`)
  if (pkg.homepage) lines.push(`- Homepage: ${pkg.homepage}`)
  if (notices.length === 0) {
    lines.push('- No license text file was present in the installed package; metadata above is the available notice.')
  } else {
    for (const notice of notices) {
      lines.push('')
      lines.push(`#### ${notice.name}`)
      lines.push('')
      lines.push('```text')
      lines.push(notice.text)
      lines.push('```')
    }
  }
  lines.push('')
}

writeFileSync(join(repoRoot, 'THIRD_PARTY_NOTICES.md'), `${lines.join('\n').trimEnd()}\n`, 'utf8')
console.log(`Wrote THIRD_PARTY_NOTICES.md for ${packageRows().length} packages.`)
