import type {
  DocumentThemePackageReference,
  DocumentThemeSelection,
} from '@markdown/document-core';

export type ThemePackageReference = DocumentThemePackageReference;
export type ThemeSelectionSchema = DocumentThemeSelection;

export interface LatexThemeImportEntry {
  path: string;
  bytes: string | Uint8Array;
}

export type LatexThemeArtifactKind =
  | 'source'
  | 'protected-component'
  | 'local-package'
  | 'runtime-asset'
  | 'generated'
  | 'reference'
  | 'metadata'
  | 'archive'
  | 'unsupported';

export interface LatexThemeArtifact {
  path: string;
  kind: LatexThemeArtifactKind;
  byteLength: number;
  reason?: string;
}

export interface LatexRawLatexComponent {
  path: string;
  source: string;
  dependencies: string[];
  protected: true;
}

export interface LatexCompilerProfile {
  engines: Array<'pdflatex' | 'xelatex' | 'lualatex'>;
  shellEscape: boolean;
  reasons: string[];
}

export interface LatexThemeCompatibilityReport {
  recognized: string[];
  unsupported: string[];
  unsafe: string[];
  dropped: string[];
  approximated: string[];
  compiler: LatexCompilerProfile;
}

export interface LatexThemeImportReport {
  lossless: boolean;
  projectRoot: string;
  entrypoint: string;
  documentClass: string | null;
  sourceGraph: string[];
  protectedComponents: string[];
  rawComponents: LatexRawLatexComponent[];
  localPackages: string[];
  externalPackages: string[];
  generated: string[];
  references: string[];
  runtimeAssets: string[];
  unresolved: string[];
  artifacts: LatexThemeArtifact[];
  compatibility: LatexThemeCompatibilityReport;
}

export interface LatexThemeProject {
  root: string;
  entrypoint: string;
  documentClass: string | null;
}

export type ThemeCategory =
  | 'report-project'
  | 'essay-thesis'
  | 'book-textbook'
  | 'exam-quiz'
  | 'exercise-answer'
  | 'presentation'
  | 'cover-pack'
  | 'math-worksheet'
  | 'component-pack'
  | 'uncategorized';

export interface ThemeCatalogEntry {
  id: string;
  name: string;
  version: string;
  engine: 'latex';
  compatibility: { app: string; exporter: string };
  digest: string;
  source: 'bundled' | 'installed' | 'imported';
  category: ThemeCategory;
  tags: string[];
  description?: string;
  author?: string;
  license?: string;
  provenance?: string;
  capabilities?: Record<string, boolean | number>;
  componentSlots?: string[];
}

export interface ThemeCatalog {
  schemaVersion: 1;
  themes: ThemeCatalogEntry[];
}

export interface ThemeBlockSelection {
  componentSlot: string;
  themeAlias?: string;
}

export interface ResolvedThemeSelection {
  alias?: string;
  theme: ThemePackageReference;
  source: 'instance' | 'component' | 'default' | 'fallback';
  diagnostics: string[];
}

export type ThemeSelectionOperation = {
  scope: 'all';
  componentSlot: string;
  themeAlias: string;
};

export function resolveThemeForBlock(
  selection: ThemeSelectionSchema,
  block: ThemeBlockSelection,
  fallback?: ThemePackageReference,
): ResolvedThemeSelection {
  const source = block.themeAlias !== undefined
    ? 'instance'
    : selection.theme.components[block.componentSlot] !== undefined
      ? 'component'
      : 'default';
  const alias = block.themeAlias
    ?? selection.theme.components[block.componentSlot]
    ?? selection.theme.default;
  const theme = selection.themes[alias];
  if (theme) return { alias, theme, source, diagnostics: [] };
  const diagnostics = [`Theme alias is not declared: ${alias}.`];
  if (!fallback) throw new Error(diagnostics[0]);
  return { theme: fallback, source: 'fallback', diagnostics };
}

export function applyThemeSelection(
  selection: ThemeSelectionSchema,
  operation: ThemeSelectionOperation,
): ThemeSelectionSchema {
  return {
    ...selection,
    themes: { ...selection.themes },
    theme: {
      ...selection.theme,
      components: {
        ...selection.theme.components,
        [operation.componentSlot]: operation.themeAlias,
      },
    },
  };
}

export function inferLatexCompilerProfile(
  sources: readonly string[],
): LatexCompilerProfile {
  const source = sources.map(uncommentLatex).join('\n');
  const reasons: string[] = [];
  const engines: LatexCompilerProfile['engines'] = /\\(?:usepackage(?:\[[^\]]*\])?\{[^}]*\b(?:fontspec|unicode-math|polyglossia)\b[^}]*\}|(?:setmainfont|setsansfont|setmonofont)\b)/i.test(source)
    ? ['xelatex', 'lualatex']
    : ['pdflatex', 'xelatex', 'lualatex'];
  if (engines.length === 2) {
    reasons.push('fontspec or OpenType font commands require XeLaTeX or LuaLaTeX.');
  }
  const shellEscape = /\\(?:usepackage(?:\[[^\]]*\])?\{[^}]*\bminted\b[^}]*\}|begin\{minted\}|write18\b)/i.test(source);
  if (shellEscape) reasons.push('minted or explicit write18 commands require shell escape.');
  if (reasons.length === 0) reasons.push('No engine-specific source requirement was detected.');
  return { engines, shellEscape, reasons };
}

export function classifyLatexThemeArtifact(path: string): LatexThemeArtifactKind {
  const lower = path.toLowerCase();
  if (/\.(?:aux|log|out|toc|ptc|thm|synctex\.gz|maf|mtc|mtc\d|idx|fls|fdb_latexmk)$/i.test(lower)) {
    return 'generated';
  }
  if (/\.pdf$/i.test(lower)) return 'reference';
  if (/\.(?:png|jpe?g|gif|svg|eps|webp|ttf|otf|tfm|vf|fd|map|enc)$/i.test(lower)) {
    return 'runtime-asset';
  }
  if (/\.(?:zip|tar|gz|tgz|7z)$/i.test(lower)) return 'archive';
  if (/\.(?:tex|sty|cls|bib)$/i.test(lower)) return 'source';
  if (/\.(?:json|yaml|yml|txt|md)$/i.test(lower)) return 'metadata';
  return 'unsupported';
}

export function discoverLatexThemeProjects(
  entries: readonly LatexThemeImportEntry[],
): LatexThemeProject[] {
  assertSafeImportEntries(entries);
  const texEntries = entries.filter((entry) => (
    classifyLatexThemeArtifact(entry.path) === 'source' && /\.tex$/i.test(entry.path)
  ));
  const canonicalEntrypoints = texEntries.filter((entry) => /(?:^|\/)main\.tex$/i.test(entry.path));
  const entrypoints = canonicalEntrypoints.length > 0
    ? canonicalEntrypoints
    : texEntries.filter((entry) => (
      readDocumentClass(entry.bytes) !== null && containsDocumentBody(entry.bytes)
    ));
  return entrypoints
    .map((entry) => ({
      root: directoryName(entry.path),
      entrypoint: entry.path,
      documentClass: readDocumentClass(entry.bytes),
    }))
    .sort((left, right) => left.root.localeCompare(right.root));
}

export function inferLatexThemeTaxonomy(
  project: LatexThemeProject,
  report: Pick<LatexThemeImportReport, 'externalPackages' | 'localPackages' | 'protectedComponents'>,
): { category: ThemeCategory; tags: string[] } {
  const haystack = [
    project.root,
    project.documentClass ?? '',
    ...report.externalPackages,
    ...report.localPackages,
    ...report.protectedComponents,
  ].join(' ').toLocaleLowerCase('vi');
  const tags = new Set<string>(['latex']);
  if (/beamer|slide|trình chiếu/.test(haystack)) tags.add('presentation');
  if (/book|extbook|sách|giáo trình/.test(haystack)) tags.add('book');
  if (/exam|ex_test|đề thi|trắc nghiệm|soạn đề/.test(haystack)) tags.add('exam');
  if (/đáp án|dap an|answer|loigiai/.test(haystack)) tags.add('answers');
  if (/toán|math|amsmath|tkz/.test(haystack)) tags.add('math');
  if (/bìa|cover|titlepage/.test(haystack)) tags.add('cover');
  if (/report|article|báo cáo|bài tập lớn/.test(haystack)) tags.add('report');
  if (/thesis|luận văn|tiểu luận/.test(haystack)) tags.add('thesis');
  const category: ThemeCategory = tags.has('presentation') ? 'presentation'
    : tags.has('exam') && tags.has('answers') ? 'exercise-answer'
    : tags.has('exam') ? 'exam-quiz'
    : tags.has('book') ? 'book-textbook'
    : tags.has('thesis') ? 'essay-thesis'
    : tags.has('report') ? 'report-project'
    : tags.has('cover') ? 'cover-pack'
    : tags.has('math') ? 'math-worksheet'
    : 'uncategorized';
  return { category, tags: [...tags].sort() };
}

export function buildThemeCatalog(entries: readonly ThemeCatalogEntry[]): ThemeCatalog {
  return {
    schemaVersion: 1,
    themes: [...entries].sort((left, right) => (
      left.id.localeCompare(right.id)
      || left.version.localeCompare(right.version)
      || left.digest.localeCompare(right.digest)
    )),
  };
}

export type ThemeToken =
  | { type: 'color'; value: string }
  | { type: 'length'; value: number; unit: 'mm' | 'pt' }
  | { type: 'font-family'; value: string };

export type ThemeValue = string | number | boolean | { token: string };

export interface ThemeBindingDefinition {
  key: string;
  valueType: 'string' | 'number' | 'boolean' | 'image';
}

export interface ThemeVariant {
  label?: string;
}

export interface ThemeSceneNode {
  [key: string]: unknown;
  id: string;
  widget: string;
  version: number;
  slot?: string;
  properties: Record<string, ThemeValue>;
  style: Record<string, ThemeValue>;
  bindings?: Record<string, string>;
  children: ThemeSceneNode[];
  locked?: boolean;
}

export interface ThemeSceneV2 {
  schemaVersion: 2;
  page: { size: 'A4'; widthMm: 210; heightMm: 297 };
  tokens: Record<string, ThemeToken>;
  variants: Record<string, ThemeVariant>;
  bindings: ThemeBindingDefinition[];
  root: ThemeSceneNode;
}

export type ThemeSceneOperation =
  | { type: 'insert'; parentId: string; index: number; node: ThemeSceneNode }
  | { type: 'remove'; nodeId: string }
  | { type: 'move'; nodeId: string; parentId: string; index: number }
  | { type: 'reorder'; parentId: string; sourceIndices: number[]; destination: number }
  | {
    type: 'update';
    nodeId: string;
    patch: ThemeSceneNodePatch;
  };

export type ThemeSceneNodePatch = Partial<Omit<ThemeSceneNode, 'id' | 'children'>>;

export interface ThemeSceneValidation {
  valid: boolean;
  errors: string[];
}

export interface ThemeManifestV2 {
  schemaVersion: 2;
  id: string;
  name: string;
  version: string;
  engine: 'latex';
  compatibility: { app: string; exporter: string };
  category: ThemeCategory;
  tags: string[];
  scene: string;
  tokens: string;
  components: Record<string, string>;
  assets: string[];
  dependencies: Array<{ id: string; version: string }>;
  preambleContributions: string[];
  compilerPackages: string[];
  integrity: string;
}

export interface LoadedThemePackageV2 {
  manifest: ThemeManifestV2;
  resources: ThemeResources;
}

export interface ThemePackageV2LoadResult {
  theme?: LoadedThemePackageV2;
  errors: string[];
}

export interface ThemeManifestV1 {
  schemaVersion: 1;
  id: string;
  name: string;
  version: string;
  engine: 'latex';
  documentClass: string;
  page: {
    size: string;
  };
  capabilities: ThemeCapabilities;
  components: Record<string, string>;
  assets: string[];
  settings?: ThemeSettingDefinition[];
}

export interface ThemeCapabilities {
  cover: boolean;
  toc: boolean;
  listOfFigures: boolean;
  listOfTables: boolean;
  header: boolean;
  footer: boolean;
  headingDepth: number;
}

export interface ThemeSettingDefinition {
  key: string;
  type: 'string' | 'boolean' | 'number' | 'select';
  label: string;
  required: boolean;
  section: string;
  options?: string[];
}

export interface ThemeDocumentSettings {
  title: string;
  university?: string;
  school?: string;
  faculty: string;
  reportType: string;
  major?: string;
  council?: string;
  supervisor?: string;
  secretary?: string;
  students?: Array<{ name: string; id: string }>;
  locationDate?: string;
  coverHeading?: string;
  coverLogoEnabled?: boolean;
  coverLogoWidthCm?: number;
  coverBorderEnabled?: boolean;
  coverOuterBorderWidthPt?: number;
  coverInnerBorderWidthPt?: number;
  headerEnabled?: boolean;
  headerInstitution?: string;
  headerFaculty?: string;
  headerLogoEnabled?: boolean;
  headerLogoSizeMm?: number;
  headerFontSizePt?: number;
  headerBold?: boolean;
  headerRuleEnabled?: boolean;
  headerRuleWidthPt?: number;
  footerEnabled?: boolean;
  footerLeft: string;
  footerPageNumber?: 'current-total' | 'current' | 'none';
  footerFontSizePt?: number;
  footerRuleEnabled?: boolean;
  footerRuleWidthPt?: number;
  tocDepth?: number;
  includeCover: boolean;
  includeToc: boolean;
  includeListOfFigures: boolean;
  includeListOfTables: boolean;
  explicitStructureBlocks?: ThemeStructureBlock[];
  /** Authored sections expanded at explicit LMX markers, not auto-prepended. */
  explicitThemeLayoutNodes?: string[];
}

export type ThemeStructureBlock = 'cover' | 'toc' | 'list-of-figures' | 'list-of-tables';

export interface LatexTheme {
  manifest: ThemeManifestV1;
  renderDocument(body: string, settings: ThemeDocumentSettings): string;
  renderStructureBlock?(block: ThemeStructureBlock, settings: ThemeDocumentSettings): string;
  renderBodyStart?(settings: ThemeDocumentSettings): string;
  /** Undefined means the ID cannot be expanded as an authored section. */
  renderThemeLayout?(nodeId: string): string | undefined;
  renderComponent?(slot: string, values: Readonly<Record<string, string>>): string;
}

export interface ThemeManifestValidation {
  valid: boolean;
  errors: string[];
}

export type ThemeResource = string | Uint8Array;
export type ThemeResources = Readonly<Record<string, ThemeResource>>;

export interface LoadedThemePackage {
  manifest: ThemeManifestV1;
  resources: ThemeResources;
}

export interface ThemePackageLoadResult {
  theme?: LoadedThemePackage;
  errors: string[];
}

export interface ResolvedThemeComponent {
  path: string;
  source: string;
}

export function analyzeLatexThemeImport(
  entries: readonly LatexThemeImportEntry[],
  rootPath: string,
): LatexThemeImportReport {
  assertSafeImportEntries(entries);
  if (!isSafeRelativePath(rootPath)) throw new Error(`Unsafe LaTeX theme import path: ${rootPath}`);

  const entryMap = new Map(entries.map((entry) => [entry.path, entry]));
  if (!entryMap.has(rootPath)) throw new Error(`LaTeX theme entrypoint was not found: ${rootPath}`);
  const projectRoot = directoryName(rootPath);
  const projectEntries = entries.filter((entry) => isWithinProjectRoot(entry.path, projectRoot));
  const sourceGraph: string[] = [];
  const unresolved = new Set<string>();
  const unsafe = new Set<string>();
  const packages = new Set<string>();
  const documentClass = { value: null as string | null };

  const visit = (path: string): void => {
    if (sourceGraph.includes(path)) return;
    const entry = entryMap.get(path);
    if (!entry || typeof entry.bytes !== 'string') {
      unresolved.add(path);
      return;
    }
    sourceGraph.push(path);
    const source = uncommentLatex(entry.bytes);
    documentClass.value ??= readDocumentClass(source);
    for (const name of readPackageNames(source)) packages.add(name);
    for (const dependency of readLatexDependencies(path, source)) {
      if (dependency.dynamic) continue;
      const resolved = resolveProjectDependency(path, dependency.target, dependency.extension, projectRoot);
      if (!resolved.safe) {
        unsafe.add(resolved.reportPath);
        unresolved.add(resolved.reportPath);
      } else if (entryMap.has(resolved.path)) {
        if (dependency.followSource) visit(resolved.path);
      } else if (dependency.required) {
        unresolved.add(resolved.path);
      }
    }
  };
  visit(rootPath);

  const localPackages: string[] = [];
  const externalPackages: string[] = [];
  for (const name of packages) {
    const resolved = resolveProjectDependency(rootPath, name, '.sty', projectRoot);
    if (resolved.safe && entryMap.has(resolved.path)) localPackages.push(resolved.path);
    else externalPackages.push(name);
  }

  const sourceSet = new Set(sourceGraph);
  const localPackageSet = new Set(localPackages);
  const artifacts: LatexThemeArtifact[] = [];
  const generated: string[] = [];
  const references: string[] = [];
  const runtimeAssets: string[] = [];
  const protectedComponents: string[] = [];
  const unsupported: string[] = [];
  for (const entry of projectEntries) {
    const classified = classifyLatexThemeArtifact(entry.path);
    let kind = classified;
    let reason: string | undefined;
    if (localPackageSet.has(entry.path)) {
      kind = 'local-package';
      reason = 'Resolved local LaTeX package dependency.';
    } else if (classified === 'source' && !sourceSet.has(entry.path)) {
      kind = 'protected-component';
      reason = 'Inactive or indirectly resolved source preserved verbatim.';
      protectedComponents.push(entry.path);
    } else if (sourceSet.has(entry.path)) {
      reason = entry.path === rootPath ? 'Selected project entrypoint.' : 'Active source dependency.';
    }
    if (kind === 'generated') generated.push(entry.path);
    else if (kind === 'reference') references.push(entry.path);
    else if (kind === 'runtime-asset') runtimeAssets.push(entry.path);
    else if (kind === 'unsupported') unsupported.push(entry.path);
    artifacts.push({ path: entry.path, kind, byteLength: byteLength(entry.bytes), ...(reason ? { reason } : {}) });
  }

  const rawComponents = projectEntries.flatMap((entry): LatexRawLatexComponent[] => {
    if (!isLatexSourcePath(entry.path) || typeof entry.bytes !== 'string') return [];
    const dependencies = readLatexDependencies(entry.path, uncommentLatex(entry.bytes)).flatMap((dependency) => {
      if (dependency.dynamic) return [];
      const resolved = resolveProjectDependency(
        entry.path,
        dependency.target,
        dependency.extension,
        projectRoot,
      );
      return [resolved.safe ? resolved.path : resolved.reportPath];
    });
    return [{
      path: entry.path,
      source: entry.bytes,
      dependencies: [...new Set(dependencies)].sort(),
      protected: true,
    }];
  }).sort((left, right) => left.path.localeCompare(right.path));

  const recognized = artifacts
    .filter((artifact) => artifact.kind !== 'unsupported')
    .map((artifact) => artifact.path)
    .sort();
  const sortedUnsafe = [...unsafe].sort();
  const sortedUnresolved = [...unresolved].sort();
  return {
    lossless: sortedUnresolved.length === 0 && sortedUnsafe.length === 0,
    projectRoot,
    entrypoint: rootPath,
    documentClass: documentClass.value,
    sourceGraph,
    protectedComponents: [...new Set(protectedComponents)].sort(),
    rawComponents,
    localPackages: [...new Set(localPackages)].sort(),
    externalPackages: [...externalPackages].sort(),
    generated: generated.sort(),
    references: references.sort(),
    runtimeAssets: runtimeAssets.sort(),
    unresolved: sortedUnresolved,
    artifacts: artifacts.sort((left, right) => left.path.localeCompare(right.path)),
    compatibility: {
      recognized,
      unsupported: unsupported.sort(),
      unsafe: sortedUnsafe,
      dropped: [],
      approximated: [],
      compiler: inferLatexCompilerProfile(rawComponents.map((component) => component.source)),
    },
  };
}

export function validateThemeScene(value: unknown): ThemeSceneValidation {
  if (!isRecord(value)) return { valid: false, errors: ['Theme scene must be an object.'] };
  const errors: string[] = [];
  if (value.schemaVersion !== 2) errors.push('Unsupported theme scene schema version.');
  if (!isRecord(value.page)
    || value.page.size !== 'A4'
    || value.page.widthMm !== 210
    || value.page.heightMm !== 297) {
    errors.push('Theme scene page must be the canonical 210 × 297 mm A4 canvas.');
  }
  if (!isRecord(value.tokens)) errors.push('Theme scene tokens must be an object.');
  if (!isRecord(value.variants)) errors.push('Theme scene variants must be an object.');
  if (!Array.isArray(value.bindings)) errors.push('Theme scene bindings must be an array.');
  if (!isRecord(value.root)) {
    errors.push('Theme scene root node is required.');
  } else {
    validateSceneTree(value.root, isRecord(value.tokens) ? value.tokens : {}, errors);
  }
  errors.sort((left, right) => left.localeCompare(right));
  return { valid: errors.length === 0, errors };
}

export function applyThemeSceneOperation(
  scene: ThemeSceneV2,
  operation: ThemeSceneOperation,
): ThemeSceneV2 {
  const root = cloneSceneNode(scene.root);
  if (operation.type === 'insert') {
    const parent = findSceneNode(root, operation.parentId);
    if (!parent) throw new Error(`Theme scene parent was not found: ${operation.parentId}`);
    validateInsertedSceneNode(root, operation.node, scene.tokens);
    const index = clampIndex(operation.index, parent.children.length);
    parent.children.splice(index, 0, cloneSceneNode(operation.node));
    return { ...scene, root };
  }

  if (operation.type === 'remove') {
    if (operation.nodeId === root.id) throw new Error('Theme scene root cannot be removed.');
    if (!removeSceneNode(root, operation.nodeId)) {
      throw new Error(`Theme scene node was not found: ${operation.nodeId}`);
    }
    return { ...scene, root };
  }

  if (operation.type === 'update') {
    const node = findSceneNode(root, operation.nodeId);
    if (!node) throw new Error(`Theme scene node was not found: ${operation.nodeId}`);
    updateSceneNode(node, operation.patch);
    return { ...scene, root };
  }

  if (operation.type === 'reorder') {
    const parent = findSceneNode(root, operation.parentId);
    if (!parent) throw new Error(`Theme scene parent was not found: ${operation.parentId}`);
    parent.children = reorderSceneChildren(
      parent.children,
      operation.sourceIndices,
      operation.destination,
    );
    return { ...scene, root };
  }

  if (operation.nodeId === root.id) throw new Error('Theme scene root cannot be moved.');
  const movedNode = findSceneNode(root, operation.nodeId);
  if (movedNode && findSceneNode(movedNode, operation.parentId)) {
    throw new Error('Theme scene node cannot be moved into its own descendant.');
  }
  const removed = removeSceneNode(root, operation.nodeId);
  if (!removed) throw new Error(`Theme scene node was not found: ${operation.nodeId}`);
  const parent = findSceneNode(root, operation.parentId);
  if (!parent) throw new Error(`Theme scene parent was not found: ${operation.parentId}`);
  const index = clampIndex(operation.index, parent.children.length);
  parent.children.splice(index, 0, removed);
  return { ...scene, root };
}

export function validateThemeManifestV2(value: unknown): ThemeManifestValidation {
  if (!isRecord(value)) return { valid: false, errors: ['Theme v2 manifest must be an object.'] };
  const errors: string[] = [];
  if (value.schemaVersion !== 2) errors.push('Unsupported theme v2 manifest schema version.');
  for (const key of ['id', 'name', 'version'] as const) {
    if (typeof value[key] !== 'string' || value[key].length === 0) {
      errors.push(`Theme v2 ${key} is required.`);
    }
  }
  if (value.engine !== 'latex') errors.push('Theme v2 engine must be "latex".');
  const themeCategories: ThemeCategory[] = [
    'report-project', 'essay-thesis', 'book-textbook', 'exam-quiz',
    'exercise-answer', 'presentation', 'cover-pack', 'math-worksheet',
    'component-pack', 'uncategorized',
  ];
  if (typeof value.category !== 'string' || !themeCategories.includes(value.category as ThemeCategory)) {
    errors.push('Theme v2 category is invalid.');
  }
  if (!isStringArray(value.tags)) errors.push('Theme v2 tags must be non-empty strings.');
  if (!isRecord(value.compatibility)
    || typeof value.compatibility.app !== 'string'
    || typeof value.compatibility.exporter !== 'string') {
    errors.push('Theme v2 compatibility ranges are required.');
  }
  for (const key of ['scene', 'tokens', 'integrity'] as const) {
    if (!isSafeRelativePath(value[key])) errors.push(`Theme v2 ${key} must use a safe relative path.`);
  }
  validateComponents(value.components, errors);
  if (!Array.isArray(value.assets)) {
    errors.push('Theme v2 assets must be an array.');
  } else {
    for (const path of value.assets) {
      if (!isSafeRelativePath(path)) errors.push('Theme v2 assets must use safe relative paths.');
      else if (/\.(?:js|mjs|cjs|wasm|dylib|so|exe)$/i.test(path)) {
        errors.push(`Theme v2 asset type is forbidden: ${path}.`);
      }
    }
  }
  if (!Array.isArray(value.dependencies)) errors.push('Theme v2 dependencies must be an array.');
  if (!isStringArray(value.preambleContributions)) errors.push('Theme v2 preamble contributions must be strings.');
  if (!isStringArray(value.compilerPackages)) errors.push('Theme v2 compiler packages must be strings.');
  errors.sort((left, right) => left.localeCompare(right));
  return { valid: errors.length === 0, errors };
}

export function loadThemePackageV2(
  manifestSource: string | unknown,
  resources: ThemeResources,
): ThemePackageV2LoadResult {
  let value = manifestSource;
  if (typeof manifestSource === 'string') {
    try {
      value = JSON.parse(manifestSource) as unknown;
    } catch {
      return { errors: ['Theme v2 manifest is not valid JSON.'] };
    }
  }
  const validation = validateThemeManifestV2(value);
  if (!validation.valid) return { errors: validation.errors };
  const manifest = value as unknown as ThemeManifestV2;
  const declared = new Set([
    manifest.scene,
    manifest.tokens,
    manifest.integrity,
    ...Object.values(manifest.components),
    ...manifest.assets,
  ]);
  const errors: string[] = [];
  for (const path of declared) {
    if (!Object.prototype.hasOwnProperty.call(resources, path) || resources[path] === undefined) {
      errors.push(`Theme v2 resource is missing: ${path}.`);
    }
  }
  for (const path of Object.keys(resources)) {
    if (!declared.has(path)) errors.push(`Theme v2 resource is undeclared: ${path}.`);
  }
  const integritySource = resources[manifest.integrity];
  if (typeof integritySource !== 'string' || !validateIntegritySource(integritySource)) {
    errors.push('Theme v2 integrity contains an invalid resource record.');
  }
  errors.sort((left, right) => left.localeCompare(right));
  return errors.length > 0
    ? { errors }
    : { theme: { manifest, resources }, errors: [] };
}

export function validateThemeManifest(value: unknown): ThemeManifestValidation {
  if (!isRecord(value)) return { valid: false, errors: ['Theme manifest must be an object.'] };
  const errors: string[] = [];
  if (value.schemaVersion !== 1) errors.push('Unsupported theme manifest schema version.');
  for (const key of ['id', 'name', 'version', 'documentClass'] as const) {
    if (typeof value[key] !== 'string' || value[key].length === 0) errors.push(`${key} is required.`);
  }
  if (value.engine !== 'latex') errors.push('Theme engine must be "latex".');
  if (!isRecord(value.page) || typeof value.page.size !== 'string' || value.page.size.length === 0) {
    errors.push('Theme page size is required.');
  }
  validateCapabilities(value.capabilities, errors);
  validateComponents(value.components, errors);
  if (!Array.isArray(value.assets) || value.assets.some((path) => !isSafeRelativePath(path))) {
    errors.push('Theme assets must contain safe relative paths only.');
  }
  validateSettings(value.settings, errors);
  return { valid: errors.length === 0, errors };
}

export function loadThemePackage(
  manifestSource: string | unknown,
  resources: ThemeResources,
): ThemePackageLoadResult {
  let value = manifestSource;
  if (typeof manifestSource === 'string') {
    try {
      value = JSON.parse(manifestSource) as unknown;
    } catch {
      return { errors: ['Theme manifest is not valid JSON.'] };
    }
  }

  const validation = validateThemeManifest(value);
  if (!validation.valid) return { errors: validation.errors };
  const manifest = value as ThemeManifestV1;
  const componentPaths = Object.values(manifest.components);
  const requiredPaths = [...componentPaths, ...manifest.assets];
  const errors = requiredPaths.flatMap((path) => (
    Object.prototype.hasOwnProperty.call(resources, path)
      ? []
      : [`Theme resource is missing: ${path}.`]
  ));
  if (errors.length > 0) return { errors };
  return { theme: { manifest, resources }, errors: [] };
}

export function resolveThemeComponent(
  theme: LoadedThemePackage,
  slot: string,
): ResolvedThemeComponent | undefined {
  const path = theme.manifest.components[slot];
  if (!path) return undefined;
  const source = theme.resources[path];
  return typeof source === 'string' ? { path, source } : undefined;
}

export function renderThemeComponent(
  theme: LoadedThemePackage,
  slot: string,
  values: Readonly<Record<string, string>>,
): string {
  const component = resolveThemeComponent(theme, slot);
  if (!component) throw new Error(`Theme component is not defined: ${slot}.`);

  let output = component.source.replace(
    /\{\{#([A-Za-z0-9_.-]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (_match, key: string, body: string) => values[key] ? body : '',
  );
  output = output.replace(
    /\{\{\{([A-Za-z0-9_.-]+)\}\}\}/g,
    (_match, key: string) => values[key] ?? '',
  );
  return output.replace(
    /\{\{([A-Za-z0-9_.-]+)\}\}/g,
    (_match, key: string) => values[key] ?? '',
  );
}

export function escapeLatexText(value: string): string {
  const replacements: Record<string, string> = {
    '\\': '\\textbackslash{}',
    '#': '\\#',
    '$': '\\$',
    '%': '\\%',
    '&': '\\&',
    '_': '\\_',
    '{': '\\{',
    '}': '\\}',
    '~': '\\textasciitilde{}',
    '^': '\\textasciicircum{}',
  };
  return [...value].map((character) => replacements[character] ?? character).join('');
}

export function latexPath(value: string): string {
  return `\\detokenize{${value.replaceAll('}', '')}}`;
}

function isSafeRelativePath(value: unknown): boolean {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\\')) return false;
  if (value.startsWith('/') || /^[A-Za-z]:/.test(value)) return false;
  return !value.split('/').some((component) => component === '..' || component === '');
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && item.length > 0);
}

function validateIntegritySource(source: string): boolean {
  try {
    const parsed: unknown = JSON.parse(source);
    if (!isRecord(parsed) || !Array.isArray(parsed.resources) || parsed.resources.length === 0) {
      return false;
    }
    return parsed.resources.every((record) => (
      isRecord(record)
      && isSafeRelativePath(record.path)
      && typeof record.kind === 'string'
      && record.kind.length > 0
      && Number.isInteger(record.byteLength)
      && (record.byteLength as number) >= 0
      && typeof record.sha256 === 'string'
      && /^[a-f\d]{64}$/i.test(record.sha256)
    ));
  } catch {
    return false;
  }
}

function validateCapabilities(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push('Theme capabilities are required.');
    return;
  }
  for (const key of [
    'cover',
    'toc',
    'listOfFigures',
    'listOfTables',
    'header',
    'footer',
  ] as const) {
    if (typeof value[key] !== 'boolean') errors.push(`Theme capability "${key}" must be boolean.`);
  }
  if (!Number.isInteger(value.headingDepth) || (value.headingDepth as number) < 1) {
    errors.push('Theme headingDepth must be a positive integer.');
  }
}

function validateComponents(value: unknown, errors: string[]): void {
  if (!isRecord(value) || Object.keys(value).length === 0) {
    errors.push('Theme components must define at least one component slot.');
    return;
  }
  for (const [slot, path] of Object.entries(value)) {
    if (!isSafeRelativePath(path)) {
      errors.push(`Theme component "${slot}" must use a safe relative path.`);
    }
  }
}

function validateSettings(value: unknown, errors: string[]): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    errors.push('Theme settings must be an array.');
    return;
  }
  const keys = new Set<string>();
  for (const setting of value) {
    if (!isRecord(setting)
      || typeof setting.key !== 'string'
      || setting.key.length === 0
      || !['string', 'boolean', 'number', 'select'].includes(String(setting.type))
      || typeof setting.label !== 'string'
      || typeof setting.required !== 'boolean'
      || typeof setting.section !== 'string') {
      errors.push('Theme settings contain an invalid field definition.');
      continue;
    }
    if (setting.type === 'select'
      && (!Array.isArray(setting.options)
        || setting.options.length === 0
        || setting.options.some((option) => typeof option !== 'string' || option.length === 0))) {
      errors.push(`Select theme setting "${setting.key}" must define non-empty string options.`);
    }
    if (keys.has(setting.key)) {
      errors.push(`Theme setting keys must be unique: ${setting.key}.`);
    }
    keys.add(setting.key);
  }
}

function uncommentLatex(source: string): string {
  return source
    .split(/\r?\n/)
    .map((line) => {
      let escaped = false;
      for (let index = 0; index < line.length; index += 1) {
        const character = line[index];
        if (character === '%' && !escaped) return line.slice(0, index);
        escaped = character === '\\' ? !escaped : false;
      }
      return line;
    })
    .join('\n');
}

interface LatexSourceDependency {
  target: string;
  extension: string;
  required: boolean;
  followSource: boolean;
  dynamic: boolean;
}

interface ResolvedProjectDependency {
  safe: boolean;
  path: string;
  reportPath: string;
}

function assertSafeImportEntries(entries: readonly LatexThemeImportEntry[]): void {
  const paths = new Set<string>();
  for (const entry of entries) {
    if (!isSafeRelativePath(entry.path)) {
      throw new Error(`Unsafe LaTeX theme import path: ${entry.path}`);
    }
    if (paths.has(entry.path)) throw new Error(`Duplicate LaTeX theme import path: ${entry.path}`);
    paths.add(entry.path);
  }
}

function readDocumentClass(bytes: string | Uint8Array): string | null {
  if (typeof bytes !== 'string') return null;
  const match = /\\documentclass(?:\[[^\]]*\])?\{([^}]+)\}/.exec(uncommentLatex(bytes));
  return match?.[1]?.trim() || null;
}

function containsDocumentBody(bytes: string | Uint8Array): boolean {
  return typeof bytes === 'string' && /\\begin\s*\{document\}/.test(uncommentLatex(bytes));
}

function readPackageNames(source: string): string[] {
  const names: string[] = [];
  for (const match of source.matchAll(/\\usepackage(?:\[[^\]]*\])?\{([^}]+)\}/g)) {
    for (const name of (match[1] ?? '').split(',').map((item) => item.trim()).filter(Boolean)) {
      names.push(name);
    }
  }
  return names;
}

function readLatexDependencies(sourcePath: string, source: string): LatexSourceDependency[] {
  const dependencies: LatexSourceDependency[] = [];
  for (const match of source.matchAll(/\\(input|include)\{([^}]+)\}/g)) {
    const target = match[2] ?? '';
    dependencies.push({
      target,
      extension: target.toLowerCase().endsWith('.tex') ? '' : '.tex',
      required: true,
      followSource: true,
      dynamic: isDynamicLatexPath(target),
    });
  }
  for (const name of readPackageNames(source)) {
    dependencies.push({
      target: name,
      extension: name.toLowerCase().endsWith('.sty') ? '' : '.sty',
      required: false,
      followSource: false,
      dynamic: isDynamicLatexPath(name),
    });
  }
  const classMatch = /\\documentclass(?:\[[^\]]*\])?\{([^}]+)\}/.exec(source);
  if (classMatch?.[1]) {
    const target = classMatch[1].trim();
    dependencies.push({
      target,
      extension: target.toLowerCase().endsWith('.cls') ? '' : '.cls',
      required: false,
      followSource: false,
      dynamic: isDynamicLatexPath(target),
    });
  }
  return dependencies;
}

function isDynamicLatexPath(value: string): boolean {
  return value.length === 0 || /#\d|\\[A-Za-z@]|[{}]/.test(value);
}

function resolveProjectDependency(
  sourcePath: string,
  target: string,
  extension: string,
  projectRoot: string,
): ResolvedProjectDependency {
  const directory = directoryName(sourcePath);
  const targetWithExtension = `${target}${extension}`;
  const reportPath = directory.length > 0 ? `${directory}/${targetWithExtension}` : targetWithExtension;
  const normalized = normalizeRelativePath(reportPath);
  const safe = !target.startsWith('/')
    && !/^[A-Za-z]:/.test(target)
    && !target.includes('\\')
    && isSafeRelativePath(normalized)
    && isWithinProjectRoot(normalized, projectRoot)
    && !reportPath.split('/').some((component, index, components) => (
      component === '..' && normalizeRelativePath(components.slice(0, index).join('/')) === projectRoot
    ));
  return { safe, path: normalized, reportPath };
}

function normalizeRelativePath(value: string): string {
  const parts: string[] = [];
  for (const component of value.split('/')) {
    if (component === '' || component === '.') continue;
    if (component === '..') parts.pop();
    else parts.push(component);
  }
  return parts.join('/');
}

function directoryName(path: string): string {
  const index = path.lastIndexOf('/');
  return index < 0 ? '' : path.slice(0, index);
}

function isWithinProjectRoot(path: string, projectRoot: string): boolean {
  return projectRoot.length === 0 || path === projectRoot || path.startsWith(`${projectRoot}/`);
}

function isLatexSourcePath(path: string): boolean {
  return /\.(?:tex|sty|cls|bib)$/i.test(path);
}

function byteLength(bytes: string | Uint8Array): number {
  return typeof bytes === 'string' ? new TextEncoder().encode(bytes).byteLength : bytes.byteLength;
}

function validateSceneTree(
  root: Record<string, unknown>,
  tokens: Record<string, unknown>,
  errors: string[],
): void {
  const ids = new Set<string>();
  const visit = (node: Record<string, unknown>): void => {
    const id = typeof node.id === 'string' ? node.id : '';
    if (!id) errors.push('Theme scene nodes require non-empty IDs.');
    else if (ids.has(id)) errors.push(`Theme scene node IDs must be unique: ${id}.`);
    else ids.add(id);

    if (typeof node.widget !== 'string' || node.widget.length === 0) {
      errors.push(`Theme scene node "${id || '?'}" requires a widget.`);
    }
    if (!Number.isInteger(node.version) || (node.version as number) < 1) {
      errors.push(`Theme scene node "${id || '?'}" requires a positive widget version.`);
    }
    if (!isRecord(node.properties)) errors.push(`Theme scene node "${id || '?'}" properties must be an object.`);
    if (!isRecord(node.style)) {
      errors.push(`Theme scene node "${id || '?'}" style must be an object.`);
    } else {
      for (const value of Object.values(node.style)) {
        if (isRecord(value) && typeof value.token === 'string' && !(value.token in tokens)) {
          errors.push(`Theme token reference is unresolved: ${value.token}.`);
        }
      }
    }
    if (!Array.isArray(node.children)) {
      errors.push(`Theme scene node "${id || '?'}" children must be an array.`);
      return;
    }
    for (const child of node.children) {
      if (isRecord(child)) visit(child);
      else errors.push(`Theme scene node "${id || '?'}" contains an invalid child.`);
    }
  };
  visit(root);
}

function cloneSceneNode(node: ThemeSceneNode): ThemeSceneNode {
  return cloneSceneValue(node) as ThemeSceneNode;
}

function findSceneNode(root: ThemeSceneNode, id: string): ThemeSceneNode | null {
  if (root.id === id) return root;
  for (const child of root.children) {
    const match = findSceneNode(child, id);
    if (match) return match;
  }
  return null;
}

function removeSceneNode(root: ThemeSceneNode, id: string): ThemeSceneNode | null {
  const index = root.children.findIndex((child) => child.id === id);
  if (index >= 0) return root.children.splice(index, 1)[0] ?? null;
  for (const child of root.children) {
    const match = removeSceneNode(child, id);
    if (match) return match;
  }
  return null;
}

function clampIndex(index: number, length: number): number {
  return Math.max(0, Math.min(Number.isInteger(index) ? index : length, length));
}

function validateInsertedSceneNode(
  root: ThemeSceneNode,
  node: ThemeSceneNode,
  tokens: Record<string, ThemeToken>,
): void {
  const errors: string[] = [];
  validateSceneTree(node, tokens, errors);
  if (errors.length > 0) throw new Error(errors.sort((left, right) => left.localeCompare(right))[0]);

  const existingIds = new Set<string>();
  collectSceneNodeIds(root, existingIds);
  const incomingIds = new Set<string>();
  collectSceneNodeIds(node, incomingIds);
  for (const id of incomingIds) {
    if (existingIds.has(id)) throw new Error(`Theme scene node IDs must be unique: ${id}.`);
  }
}

function collectSceneNodeIds(node: ThemeSceneNode, ids: Set<string>): void {
  ids.add(node.id);
  for (const child of node.children) collectSceneNodeIds(child, ids);
}

function updateSceneNode(node: ThemeSceneNode, patch: ThemeSceneNodePatch): void {
  const { id: _id, children: _children, ...editablePatch } = patch;
  const existingProperties = node.properties;
  const existingStyle = node.style;
  const existingBindings = node.bindings;
  Object.assign(node, editablePatch);
  if (patch.properties) node.properties = { ...existingProperties, ...patch.properties };
  if (patch.style) node.style = { ...existingStyle, ...patch.style };
  if (patch.bindings) node.bindings = { ...existingBindings, ...patch.bindings };
}

function reorderSceneChildren(
  children: ThemeSceneNode[],
  sourceIndices: number[],
  destination: number,
): ThemeSceneNode[] {
  const validIndices = [...new Set(sourceIndices.filter((index) => (
    Number.isInteger(index) && index >= 0 && index < children.length
  )))]
    .sort((left, right) => left - right);
  if (validIndices.length === 0) return children;

  const moving = validIndices.map((index) => children[index]!);
  const remaining = children.filter((_, index) => !validIndices.includes(index));
  const removedBeforeDestination = validIndices.filter((index) => index < destination).length;
  const insertion = clampIndex(destination - removedBeforeDestination, remaining.length);
  remaining.splice(insertion, 0, ...moving);
  return remaining;
}

function cloneSceneValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneSceneValue);
  if (isRecord(value)) {
    const clone: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) clone[key] = cloneSceneValue(entry);
    return clone;
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export { compileAuthoredTheme, type AuthoredThemeSnapshot, type AuthoredThemeCompilation, type AuthoredLayout } from './authored-theme.js';
export { authoredBindingKeys, type AuthoredBindingKey } from './authored-bindings.js';
export { createStudioStarterThemes } from './studio-starters.js';
