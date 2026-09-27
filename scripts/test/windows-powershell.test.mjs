import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const scripts = fileURLToPath(new URL('../windows/', import.meta.url));
const pwsh = process.env.POWERSHELL_TEST_EXE ?? 'pwsh';
const probe = spawnSync(pwsh, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', '$PSVersionTable.PSVersion.Major'], {
  encoding: 'utf8', timeout: 30_000,
});
if (process.env.POWERSHELL_TEST_EXE) {
  assert.equal(probe.status, 0, `Requested PowerShell validation runtime failed: ${probe.stderr ?? probe.error}`);
}
const options = { skip: probe.status === 0 && probe.stdout.trim() === '7'
  ? false : 'PowerShell 7 not installed; PowerShell execution remains a Windows CI gate' };

function run(script, env = {}) {
  return spawnSync(pwsh, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    timeout: 60_000,
    env: { ...process.env, WINDOWS_SCRIPTS_TEST_ROOT: scripts, ...env },
  });
}

function succeeded(result) {
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}\n${result.error ?? ''}`);
}

test('PowerShell parses all Windows build scripts without syntax errors', options, () => {
  succeeded(run(`
    $ErrorActionPreference = 'Stop'
    foreach ($file in Get-ChildItem -LiteralPath $env:WINDOWS_SCRIPTS_TEST_ROOT -Filter '*.ps1') {
      $tokens = $null; $errors = $null
      [void][Management.Automation.Language.Parser]::ParseFile($file.FullName, [ref]$tokens, [ref]$errors)
      if ($errors.Count -gt 0) { throw ($errors | Out-String) }
    }
  `));
});

test('manifest loader returns only its object even when validation writes progress to stdout', options, () => {
  succeeded(run(`
    . (Join-Path $env:WINDOWS_SCRIPTS_TEST_ROOT 'Common.ps1')
    $manifest = Get-WindowsResourceManifest
    if (@($manifest).Count -ne 1 -or $manifest.toolchain.dotnetSdk -cne '8.0.425') {
      throw 'Manifest load failed'
    }
    function Invoke-Checked {
      param($Command, $Arguments)
      Write-Output 'Validator progress should not contaminate a function return.'
    }
    $manifest = Get-WindowsResourceManifest
    if (@($manifest).Count -ne 1 -or $manifest.toolchain.dotnetSdk -cne '8.0.425') {
      throw 'Validation stdout contaminated the returned manifest'
    }
  `));
});

test('native command errors propagate instead of falling through to a successful package', options, () => {
  succeeded(run(`
    . (Join-Path $env:WINDOWS_SCRIPTS_TEST_ROOT 'Common.ps1')
    try {
      Invoke-Checked node @('-e', 'process.exit(23)')
      throw 'The failed command was ignored'
    } catch {
      if ($_.Exception.Message -notmatch 'exit code 23') { throw }
    }
    exit 0
  `));
});

test('download checksum gate rejects missing and corrupt cache files without a network fallback', options, async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'windows-download-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bytes = Buffer.from('verified fixture');
  await writeFile(path.join(root, 'good'), bytes);
  await writeFile(path.join(root, 'bad'), 'corrupt');
  const sha = createHash('sha256').update(bytes).digest('hex');
  succeeded(run(`
    . (Join-Path $env:WINDOWS_SCRIPTS_TEST_ROOT 'Common.ps1')
    $pin = [pscustomobject]@{ name = 'good'; sha256 = $env:EXPECTED_HASH; url = 'https://invalid.invalid/no-network' }
    $file = Get-PinnedDownload $pin $env:TEST_CACHE
    if ($file -cne (Join-Path $env:TEST_CACHE 'good')) { throw 'Wrong cache path' }
    $pin.name = 'bad'
    try {
      [void](Get-PinnedDownload $pin $env:TEST_CACHE)
      throw 'Bad cache was accepted'
    } catch {
      if ($_.Exception.Message -notmatch 'checksum mismatch') { throw }
    }
    try {
      Assert-FileHash (Join-Path $env:TEST_CACHE 'missing') $pin.sha256
      throw 'Missing cache was accepted'
    } catch {
      if ($_.Exception.Message -notmatch 'Missing resource') { throw }
    }
    # -Command otherwise inherits the status of the deliberately caught error.
    exit 0
  `, { TEST_CACHE: root, EXPECTED_HASH: sha }));
});

test('TRX gate requires the actual NativePdfSmoke test to pass, not merely a green portable suite', options, async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'windows-trx-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [name, results, passes] of [
    ['passed', [['AcademicMarkdown.Core.Tests.NativePdfSmokeTests.BundledNativeCompilerProducesOfflineVietnamesePdf', 'Passed']], true],
    ['skipped', [['AcademicMarkdown.Core.Tests.NativePdfSmokeTests.BundledNativeCompilerProducesOfflineVietnamesePdf', 'NotExecuted']], false],
    ['failed', [['AcademicMarkdown.Core.Tests.NativePdfSmokeTests.BundledNativeCompilerProducesOfflineVietnamesePdf', 'Failed']], false],
    ['absent', [['AcademicMarkdown.Core.Tests.PortableCoreTests.CanSave', 'Passed']], false],
    ['empty', [], false],
    ['mixed', [['NativePdfSmokeTests.First', 'Passed'], ['NativePdfSmokeTests.Second', 'NotExecuted']], false],
  ]) {
    const file = path.join(root, `${name}.trx`);
    await writeFile(file, `<TestRun xmlns="http://microsoft.com/schemas/VisualStudio/TeamTest/2010"><Results>${results
      .map(([testName, outcome]) => `<UnitTestResult testName="${testName}" outcome="${outcome}" />`).join('')}</Results></TestRun>`);
    const result = run(`
      . (Join-Path $env:WINDOWS_SCRIPTS_TEST_ROOT 'Common.ps1')
      Assert-NativePdfSmokePassed $env:TEST_TRX
    `, { TEST_TRX: file });
    if (passes) succeeded(result);
    else {
      assert.notEqual(result.status, 0, `${name} unexpectedly passed the packaging gate`);
      assert.match(result.stderr, /NativePdfSmoke must exist and pass/);
    }
  }
});

test('the complete Windows build refuses to run or execute a Windows binary on non-Windows hosts', {
  skip: options.skip || (process.platform === 'win32' ? 'Host is Windows' : false),
}, () => {
  const result = run(`& (Join-Path $env:WINDOWS_SCRIPTS_TEST_ROOT 'Build-Windows.ps1')`);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /require an x64 Windows host/);
});
