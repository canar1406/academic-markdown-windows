import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const inventoryName = 'resource-inventory.json';
const owner = 'academic-markdown-windows-resources';
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function safePath(value) {
  requireValue(typeof value === 'string' && value.length > 0, 'Resource path must be nonempty');
  for (const part of value.split('/')) {
    requireValue(part && part !== '.' && part !== '..'
      && !/[<>:"\\|?*%\u0000-\u001f\u007f]/u.test(part)
      && !/[. ]$/u.test(part)
      && !/^(?:CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])(?:\.|$)/iu.test(part),
    `Unsafe Windows resource path: ${JSON.stringify(value)}`);
  }
  return value;
}

function sha256Pin(value) {
  requireValue(typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value), 'Missing or invalid SHA-256 checksum pin');
}

function uniquePaths(values) {
  const seen = new Set();
  for (const value of values) {
    const key = safePath(value).toLowerCase();
    requireValue(!seen.has(key), `Duplicate resource path: ${value}`);
    seen.add(key);
  }
}

export function validateManifest(manifest) {
  requireValue(manifest?.schemaVersion === 1, 'Unsupported resource manifest schemaVersion');
  requireValue(manifest.webSource === 'apps/editor/dist', 'Web source must be apps/editor/dist, never the macOS copy');
  const tools = manifest.toolchain;
  requireValue(tools?.runtimeIdentifier === 'win-x64' && tools.platform === 'x64'
    && tools.targetFramework === 'net8.0-windows10.0.19041.0'
    && /^\d+\.\d+\.\d+$/u.test(tools.dotnetSdk)
    && /^\d+\.\d+\.\d+$/u.test(tools.pnpm)
    && /^\d+\.\d+\.\d+$/u.test(tools.windowsAppSdk)
    && Number.isInteger(tools.nodeMajor), 'Invalid Windows toolchain pins');
  const compiler = manifest.tectonic;
  requireValue(/^\d+\.\d+\.\d+$/u.test(compiler?.version), 'Missing compiler version');
  for (const item of [compiler.archive, compiler.executable, compiler.license]) {
    safePath(item?.name);
    requireValue(!item.name.includes('/'), 'Compiler filename must not contain a path');
    sha256Pin(item.sha256);
  }
  for (const item of [compiler.archive, compiler.license]) {
    const url = new URL(item.url);
    requireValue(url.protocol === 'https:' && !url.username && !url.password
      && ['github.com', 'raw.githubusercontent.com'].includes(url.hostname),
    'Compiler downloads must use official GitHub HTTPS URLs');
  }
  requireValue(Array.isArray(manifest.pinnedFiles) && manifest.pinnedFiles.length > 0, 'Missing pinned resources');
  requireValue(Array.isArray(manifest.noticeFiles) && manifest.noticeFiles.length > 0, 'Missing license notices');
  const files = [...manifest.pinnedFiles, ...manifest.noticeFiles];
  for (const file of files) {
    safePath(file.source);
    safePath(file.target);
  }
  for (const file of manifest.pinnedFiles) sha256Pin(file.sha256);
  uniquePaths([...files.map((file) => file.target), 'Tools/tectonic.exe',
    'Tools/TECTONIC_LICENSE', 'runtime-resources.json', inventoryName, 'Licenses/WINDOWS_BUILD_MANIFEST.json']);
  requireValue(Array.isArray(manifest.requiredWebFiles)
    && manifest.requiredWebFiles.includes('index.html'), 'Missing web entry requirement');
  uniquePaths(manifest.requiredWebFiles);
  const runtime = manifest.runtimeResources;
  requireValue(runtime?.schemaVersion === 1, 'Unsupported runtime resources schemaVersion');
  requireValue(runtime.compiler === 'Tools/tectonic.exe', 'Invalid runtime compiler path');
  safePath(runtime.supportBundle);
  const pinnedTargets = new Set(manifest.pinnedFiles.map((file) => file.target));
  requireValue(pinnedTargets.has(runtime.supportBundle), 'Missing support bundle mapping');
  requireValue(Array.isArray(runtime.assets) && runtime.assets.length > 0, 'Missing runtime assets');
  for (const asset of runtime.assets) {
    safePath(asset.source);
    safePath(asset.target);
    requireValue(pinnedTargets.has(asset.source), `Missing pinned runtime asset: ${asset.source}`);
    requireValue(!/^(?:report|main|texput)\.(?:tex|pdf|log|aux)$/iu.test(asset.target),
      `Reserved compiler workspace path: ${asset.target}`);
  }
  uniquePaths(runtime.assets.map((asset) => asset.target));
  return manifest;
}

async function fileHash(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

async function regularFile(root, relative) {
  safePath(relative);
  let current = root;
  const parts = relative.split('/');
  for (let index = 0; index < parts.length; index++) {
    current = path.join(current, parts[index]);
    const info = await lstat(current);
    requireValue(!info.isSymbolicLink(), `Symlink/reparse resource refused: ${current}`);
    if (index < parts.length - 1) requireValue(info.isDirectory(), `Not a resource directory: ${current}`);
    else requireValue(info.isFile() && info.size > 0, `Missing or empty resource file: ${current}`);
  }
  return current;
}

async function listFiles(root, relative = '') {
  const info = await lstat(path.join(root, relative));
  requireValue(info.isDirectory() && !info.isSymbolicLink(), `Symlink/reparse or invalid directory: ${relative}`);
  const result = [];
  for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
    const name = relative ? `${relative}/${entry.name}` : entry.name;
    safePath(name);
    requireValue(!entry.isSymbolicLink(), `Symlink/reparse resource refused: ${name}`);
    if (entry.isDirectory()) result.push(...await listFiles(root, name));
    else {
      requireValue(entry.isFile(), `Not a regular resource file: ${name}`);
      result.push(name);
    }
  }
  uniquePaths(result);
  return result.sort();
}

async function exists(file) {
  try { await lstat(file); return true; } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function copyChecked(sourceRoot, source, destination, target, expectedHash) {
  const file = await regularFile(sourceRoot, source);
  const hash = expectedHash ?? await fileHash(file);
  const output = path.join(destination, safePath(target));
  await mkdir(path.dirname(output), { recursive: true });
  await copyFile(file, output);
  requireValue(await fileHash(output) === hash, `Resource checksum mismatch: ${source}`);
}

async function validateWeb(root, requiredFiles) {
  for (const file of requiredFiles) await regularFile(root, file);
  const html = await readFile(path.join(root, 'index.html'), 'utf8');
  requireValue(html.includes("script-src 'self';") && html.includes("connect-src 'none';"),
    'Built Web entry is missing its restrictive CSP');
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gu)];
  requireValue(scripts.length > 0, 'Built Web entry has no script');
  for (const [, source] of scripts) {
    requireValue(source.startsWith('./'), `Web script must be bundled locally: ${source}`);
    await regularFile(root, source.slice(2));
  }
}

export async function verifyResources(destination) {
  requireValue(!(await lstat(destination)).isSymbolicLink(), 'Symlink/reparse resource destination refused');
  const root = await realpath(destination);
  const inventory = JSON.parse(await readFile(await regularFile(root, inventoryName), 'utf8'));
  requireValue(inventory.schemaVersion === 1 && inventory.generatedBy === owner && Array.isArray(inventory.files),
    'Unowned or invalid resource inventory; refusing to overwrite');
  uniquePaths(inventory.files.map((file) => file.path));
  const names = (await listFiles(root)).filter((name) => name !== inventoryName);
  requireValue(JSON.stringify(names) === JSON.stringify(inventory.files.map((file) => file.path).sort()),
    'Resource inventory mismatch: missing or unexpected files');
  for (const item of inventory.files) {
    sha256Pin(item.sha256);
    const file = await regularFile(root, item.path);
    requireValue((await lstat(file)).size === item.size && await fileHash(file) === item.sha256,
      `Resource checksum mismatch (modified file): ${item.path}`);
  }
  const manifest = validateManifest(JSON.parse(await readFile(
    await regularFile(root, 'Licenses/WINDOWS_BUILD_MANIFEST.json'), 'utf8')));
  const runtime = JSON.parse(await readFile(await regularFile(root, 'runtime-resources.json'), 'utf8'));
  requireValue(JSON.stringify(runtime) === JSON.stringify(manifest.runtimeResources), 'Runtime resource mapping mismatch');
  for (const item of manifest.pinnedFiles) {
    requireValue(await fileHash(await regularFile(root, item.target)) === item.sha256,
      `Pinned resource checksum mismatch: ${item.target}`);
  }
  for (const [target, pin] of [['Tools/tectonic.exe', manifest.tectonic.executable],
    ['Tools/TECTONIC_LICENSE', manifest.tectonic.license]]) {
    requireValue(await fileHash(await regularFile(root, target)) === pin.sha256, `Compiler checksum mismatch: ${target}`);
  }
  for (const item of manifest.noticeFiles) await regularFile(root, item.target);
  await validateWeb(path.join(root, 'Web'), manifest.requiredWebFiles);
  return inventory;
}

export async function stageResources({ repoRoot, compilerDirectory, destination, manifest }) {
  validateManifest(manifest);
  repoRoot = await realpath(repoRoot);
  compilerDirectory = await realpath(compilerDirectory);
  await mkdir(path.dirname(path.resolve(destination)), { recursive: true });
  destination = path.join(await realpath(path.dirname(path.resolve(destination))), path.basename(destination));
  const hadPrevious = await exists(destination);
  if (hadPrevious) await verifyResources(destination);
  const scratch = await mkdtemp(path.join(path.dirname(destination), '.Resources-stage-'));
  const backup = `${destination}.previous-${randomUUID()}`;
  let movedPrevious = false;
  try {
    const webRoot = path.join(repoRoot, manifest.webSource);
    // Walk from the approved root as well, so a symlinked dist parent is refused.
    await regularFile(repoRoot, `${manifest.webSource}/index.html`);
    await validateWeb(webRoot, manifest.requiredWebFiles);
    for (const file of await listFiles(webRoot)) await copyChecked(webRoot, file, scratch, `Web/${file}`);
    for (const item of [...manifest.pinnedFiles, ...manifest.noticeFiles]) {
      await copyChecked(repoRoot, item.source, scratch, item.target, item.sha256);
    }
    await copyChecked(compilerDirectory, manifest.tectonic.executable.name, scratch,
      'Tools/tectonic.exe', manifest.tectonic.executable.sha256);
    await copyChecked(compilerDirectory, manifest.tectonic.license.name, scratch,
      'Tools/TECTONIC_LICENSE', manifest.tectonic.license.sha256);
    await writeFile(path.join(scratch, 'runtime-resources.json'), json(manifest.runtimeResources));
    await writeFile(path.join(scratch, 'Licenses/WINDOWS_BUILD_MANIFEST.json'), json(manifest));
    const files = [];
    for (const file of await listFiles(scratch)) {
      const absolute = await regularFile(scratch, file);
      files.push({ path: file, size: (await lstat(absolute)).size, sha256: await fileHash(absolute) });
    }
    await writeFile(path.join(scratch, inventoryName), json({ schemaVersion: 1, generatedBy: owner, files }));
    await verifyResources(scratch);
    if (hadPrevious) {
      await verifyResources(destination);
      await rename(destination, backup);
      movedPrevious = true;
    }
    await rename(scratch, destination);
    if (movedPrevious) await rm(backup, { recursive: true });
    return destination;
  } catch (error) {
    if (movedPrevious && !await exists(destination)) await rename(backup, destination);
    throw error;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

export async function writeChecksums(directory) {
  const root = await realpath(directory);
  const lines = [];
  for (const name of await listFiles(root)) {
    if (name !== 'SHA256SUMS') lines.push(`${await fileHash(await regularFile(root, name))}  ${name}`);
  }
  await writeFile(path.join(root, 'SHA256SUMS'), `${lines.join('\n')}\n`);
}

async function main([command, ...args]) {
  const manifestPath = fileURLToPath(new URL('./resources.manifest.json', import.meta.url));
  const manifest = validateManifest(JSON.parse(await readFile(manifestPath, 'utf8')));
  if (command === 'validate' && args.length === 0) return;
  if (command === 'verify' && args.length === 1) return void await verifyResources(args[0]);
  if (command === 'checksums' && args.length === 1) return writeChecksums(args[0]);
  if (command === 'stage' && args.length === 3) {
    return void await stageResources({ repoRoot: args[0], compilerDirectory: args[1], destination: args[2], manifest });
  }
  throw new Error('Usage: resource-tools.mjs validate | stage <repo> <compiler-directory> <destination> | verify <Resources> | checksums <directory>');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
