import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { stageResources, validateManifest, verifyResources, writeChecksums } from '../windows/resource-tools.mjs';

const manifest = JSON.parse(await readFile(new URL('../windows/resources.manifest.json', import.meta.url), 'utf8'));
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function put(root, name, bytes) {
  const file = path.join(root, name);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, bytes);
}

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'windows resources Tiếng Việt '));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repoRoot = path.join(root, 'repo');
  const compilerDirectory = path.join(root, 'compiler');
  const destination = path.join(root, 'Resources');
  const pin = structuredClone(manifest);
  for (const item of [...pin.pinnedFiles, ...pin.noticeFiles]) {
    const bytes = `fixture for ${item.source}\n`;
    await put(repoRoot, item.source, bytes);
    if ('sha256' in item) item.sha256 = digest(bytes);
  }
  for (const item of [pin.tectonic.executable, pin.tectonic.license]) {
    const bytes = `not executable: ${item.name}\n`;
    await put(compilerDirectory, item.name, bytes);
    item.sha256 = digest(bytes);
  }
  await put(repoRoot, 'apps/editor/dist/index.html', '<meta http-equiv="Content-Security-Policy" content="script-src \'self\'; connect-src \'none\';"><script defer src="./assets/index-new.js"></script>');
  await put(repoRoot, 'apps/editor/dist/assets/index-new.js', 'fresh editor');
  await put(repoRoot, 'apps/editor/dist/prism-yaml.js', 'yaml');
  await put(repoRoot, 'apps/editor/dist/prism-latex.js', 'latex');
  await put(repoRoot, 'apps/macos/Sources/MarkdownMacOS/Resources/Web/index.html', 'STALE MAC COPY');
  return { root, repoRoot, compilerDirectory, destination, manifest: pin };
}

test('versioned manifest defines the compiler, offline bundle and all four runtime assets', () => {
  assert.equal(validateManifest(manifest), manifest);
  assert.equal(manifest.toolchain.dotnetSdk, '8.0.425');
  assert.equal(manifest.toolchain.windowsAppSdk, '1.8.260921001');
  assert.equal(manifest.tectonic.version, '0.17.0');
  assert.deepEqual(manifest.runtimeResources, {
    schemaVersion: 1,
    compiler: 'Tools/tectonic.exe',
    supportBundle: 'TeX/hcmut-offline-v1.ttb',
    assets: [
      { source: 'Theme/Images/hcmut.png', target: 'Images/hcmut.png' },
      { source: 'Theme/Fonts/lmmonolt10-bold.otf', target: 'lmmonolt10-bold.otf' },
      { source: 'Theme/Fonts/lmmonolt10-boldoblique.otf', target: 'lmmonolt10-boldoblique.otf' },
      { source: 'Theme/Fonts/lmmono10-italic.otf', target: 'lmmono10-italic.otf' },
    ],
  });
});

for (const unsafe of ['../outside', '/absolute', 'C:/escape', 'a\\b', 'file:stream', 'a/./b', 'a//b', '%2e%2e/file', 'AUX.txt', 'COM1', 'a/NUL.png', 'trail. ', 'file\nname']) {
  test(`manifest rejects unsafe Windows asset paths: ${JSON.stringify(unsafe)}`, () => {
    const pin = structuredClone(manifest);
    pin.runtimeResources.assets[0].target = unsafe;
    assert.throws(() => validateManifest(pin), /path/i);
  });
}

test('manifest rejects unsupported schemas, absent hashes, stale web source and missing resource mappings', () => {
  for (const mutate of [
    (pin) => { pin.schemaVersion = 2; },
    (pin) => { pin.runtimeResources.schemaVersion = 2; },
    (pin) => { delete pin.tectonic.archive.sha256; },
    (pin) => { pin.pinnedFiles[0].sha256 = 'not-a-checksum'; },
    (pin) => { pin.webSource = 'apps/macos/Sources/MarkdownMacOS/Resources/Web'; },
    (pin) => { pin.runtimeResources.assets[0].source = 'Theme/missing.png'; },
    (pin) => { pin.tectonic.license.url = 'http://example.com/LICENSE'; },
    (pin) => { pin.noticeFiles = []; },
  ]) {
    const pin = structuredClone(manifest);
    mutate(pin);
    assert.throws(() => validateManifest(pin));
  }
});

test('manifest rejects case-insensitive duplicate outputs and compiler-workspace target collisions', () => {
  const pin = structuredClone(manifest);
  pin.pinnedFiles.push({ ...pin.pinnedFiles[0], target: pin.pinnedFiles[0].target.toUpperCase() });
  assert.throws(() => validateManifest(pin), /duplicate/i);
  const another = structuredClone(manifest);
  another.runtimeResources.assets[1].target = another.runtimeResources.assets[0].target.toUpperCase();
  assert.throws(() => validateManifest(another), /duplicate/i);
  another.runtimeResources.assets[1].target = 'report.tex';
  assert.throws(() => validateManifest(another), /reserved/i);
});

test('staging uses current editor dist, preserves notices, emits runtime mappings and deterministic inventory', async (t) => {
  const f = await fixture(t);
  await stageResources(f);
  assert.match(await readFile(path.join(f.destination, 'Web/index.html'), 'utf8'), /index-new/);
  assert.equal(await readFile(path.join(f.destination, 'Web/assets/index-new.js'), 'utf8'), 'fresh editor');
  assert.deepEqual(JSON.parse(await readFile(path.join(f.destination, 'runtime-resources.json'))), f.manifest.runtimeResources);
  for (const item of f.manifest.noticeFiles) {
    assert.deepEqual(await readFile(path.join(f.destination, item.target)), await readFile(path.join(f.repoRoot, item.source)));
  }
  await verifyResources(f.destination);
  const inventory = await readFile(path.join(f.destination, 'resource-inventory.json'));
  await stageResources(f);
  assert.deepEqual(await readFile(path.join(f.destination, 'resource-inventory.json')), inventory);
});

test('clean restaging removes old generated assets instead of merging stale files', async (t) => {
  const f = await fixture(t);
  await stageResources(f);
  await rm(path.join(f.repoRoot, 'apps/editor/dist/assets/index-new.js'));
  await put(f.repoRoot, 'apps/editor/dist/assets/index-next.js', 'next build');
  await put(f.repoRoot, 'apps/editor/dist/index.html', '<meta content="script-src \'self\'; connect-src \'none\';"><script src="./assets/index-next.js"></script>');
  await stageResources(f);
  assert.deepEqual(await readdir(path.join(f.destination, 'Web/assets')), ['index-next.js']);
});

for (const missing of ['bundle', 'logo', 'font-bold', 'font-boldoblique', 'font-italic', 'notice', 'compiler-license', 'web-entry', 'web-script']) {
  test(`missing ${missing} fails closed and leaves the previous staged tree untouched`, async (t) => {
    const f = await fixture(t);
    await stageResources(f);
    const inventory = await readFile(path.join(f.destination, 'resource-inventory.json'));
    const files = {
      bundle: path.join(f.repoRoot, f.manifest.pinnedFiles[0].source),
      logo: path.join(f.repoRoot, f.manifest.pinnedFiles[1].source),
      'font-bold': path.join(f.repoRoot, f.manifest.pinnedFiles[2].source),
      'font-boldoblique': path.join(f.repoRoot, f.manifest.pinnedFiles[3].source),
      'font-italic': path.join(f.repoRoot, f.manifest.pinnedFiles[4].source),
      notice: path.join(f.repoRoot, f.manifest.noticeFiles[0].source),
      'compiler-license': path.join(f.compilerDirectory, 'LICENSE'),
      'web-entry': path.join(f.repoRoot, 'apps/editor/dist/index.html'),
      'web-script': path.join(f.repoRoot, 'apps/editor/dist/assets/index-new.js'),
    };
    await rm(files[missing]);
    await assert.rejects(stageResources(f), /missing|ENOENT|script/i);
    assert.deepEqual(await readFile(path.join(f.destination, 'resource-inventory.json')), inventory);
    await verifyResources(f.destination);
  });
}

test('checksum mismatches in either the compiler or offline bundle abort staging', async (t) => {
  for (const resource of ['compiler', 'bundle']) {
    const f = await fixture(t);
    const file = resource === 'compiler'
      ? path.join(f.compilerDirectory, 'tectonic.exe')
      : path.join(f.repoRoot, f.manifest.pinnedFiles[0].source);
    await writeFile(file, 'corrupt');
    await assert.rejects(stageResources(f), /checksum/i);
    await assert.rejects(readFile(path.join(f.destination, 'runtime-resources.json')), /ENOENT/);
  }
});

test('staging will not overwrite manually modified or unowned resource directories', async (t) => {
  const f = await fixture(t);
  await put(f.destination, 'keep.md', 'user work');
  await assert.rejects(stageResources(f), /inventory|unowned/i);
  assert.equal(await readFile(path.join(f.destination, 'keep.md'), 'utf8'), 'user work');
  await rm(f.destination, { recursive: true });
  await stageResources(f);
  await put(f.destination, 'Web/assets/index-new.js', 'manual edit');
  await assert.rejects(stageResources(f), /checksum|modified/i);
  assert.equal(await readFile(path.join(f.destination, 'Web/assets/index-new.js'), 'utf8'), 'manual edit');
});

test('empty resources are rejected', async (t) => {
  const f = await fixture(t);
  await put(f.repoRoot, f.manifest.noticeFiles[0].source, '');
  await assert.rejects(stageResources(f), /empty/i);
});

test('staging rejects symlinks instead of following them outside the source root', async (t) => {
  const f = await fixture(t);
  const file = path.join(f.repoRoot, 'apps/editor/dist/prism-yaml.js');
  await rm(file);
  try {
    await symlink(path.join(f.compilerDirectory, 'LICENSE'), file);
  } catch (error) {
    if (error.code === 'EPERM') return t.skip('Windows host does not permit creating test symlinks');
    throw error;
  }
  await assert.rejects(stageResources(f), /symlink|reparse/i);
});

test('verification detects missing, modified, and extra published resources', async (t) => {
  for (const mutate of [
    (root) => rm(path.join(root, 'Tools/tectonic.exe')),
    (root) => put(root, 'Tools/tectonic.exe', 'different binary'),
    (root) => put(root, 'Tools/unexpected.exe', 'untracked'),
  ]) {
    const f = await fixture(t);
    await stageResources(f);
    await mutate(f.destination);
    await assert.rejects(verifyResources(f.destination), /checksum|inventory|missing/i);
  }
});

test('portable checksum list is sorted, covers notices/resources, and excludes itself', async (t) => {
  const f = await fixture(t);
  await stageResources(f);
  await writeChecksums(f.destination);
  const first = await readFile(path.join(f.destination, 'SHA256SUMS'), 'utf8');
  assert.match(first, / {2}Tools\/tectonic\.exe\n/);
  assert.match(first, / {2}Licenses\/THIRD_PARTY_NOTICES\.md\n/);
  assert.doesNotMatch(first, / {2}SHA256SUMS/);
  const names = first.trim().split('\n').map((line) => line.slice(66));
  assert.deepEqual(names, [...names].sort());
  await writeChecksums(f.destination);
  assert.equal(await readFile(path.join(f.destination, 'SHA256SUMS'), 'utf8'), first);
});
