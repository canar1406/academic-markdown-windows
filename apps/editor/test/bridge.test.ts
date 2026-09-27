import { afterEach, describe, expect, it } from 'vitest';
import { installBridge } from '../src/bridge';
import {
  VISUAL_PAGE_ADD_REQUESTED,
  VISUAL_PAGE_DELETE_REQUESTED,
  VISUAL_PAGE_MOVE_REQUESTED,
} from '../src/page-action-strip';

describe('editor bridge', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'window');
  });

  it('announces readiness and reports revisions without sending document text', () => {
    const messages: unknown[] = [];
    Object.assign(globalThis, {
      window: {
        webkit: { messageHandlers: { bridge: { postMessage: (message: unknown) => messages.push(message) } } },
      },
    });

    let content = '# Nội dung';
    const listeners = new Map<string, () => void>();
    const editor = {
      setContent(next: string): void { content = next; },
      getMarkdown(): string { return content; },
      on(event: string, listener: () => void): void { listeners.set(event, listener); },
    };

    installBridge(editor);
    listeners.get('content-change')?.();

    expect(messages.map((message) => (message as { type?: string }).type)).toEqual([
      'editor.ready',
      'document.indexInvalidated',
      'document.changed',
      'document.indexChanged',
    ]);
    expect(messages).toContainEqual(
      { protocolVersion: 1, type: 'document.changed', requestId: null, payload: { revision: 1 } },
    );
    window.markdownEditor?.loadMarkdown('Xin chào');
    expect(content).toBe('Xin chào');
  });

  it('handles a versioned load command from the native host', () => {
    Object.assign(globalThis, { window: {} });
    let content = '';
    const editor = {
      setContent(next: string): void { content = next; },
      getMarkdown(): string { return content; },
      on(): void {},
    };

    installBridge(editor);
    window.markdownEditor?.handleEnvelope({
      protocolVersion: 1,
      type: 'document.loadMarkdown',
      requestId: null,
      payload: { markdown: '# Tài liệu' },
    });

    expect(content).toBe('# Tài liệu');
  });

  it('switches visual and source modes through the native bridge', () => {
    const messages: unknown[] = [];
    Object.assign(globalThis, {
      window: {
        webkit: { messageHandlers: { bridge: { postMessage: (message: unknown) => messages.push(message) } } },
      },
    });
    const modes: string[] = [];
    let modeListener: ((transition: {
      mode: 'visual' | 'source';
      requestedMode: 'visual' | 'source';
      accepted: boolean;
      diagnostics: unknown[];
    }) => void) | undefined;
    const editor = {
      setContent(): void {},
      getMarkdown(): string { return ''; },
      on(): void {},
      onModeChange(listener: typeof modeListener): void { modeListener = listener; },
      setMode(mode: 'visual' | 'source'): void {
        modes.push(mode);
        modeListener?.({ mode, requestedMode: mode, accepted: true, diagnostics: [] });
      },
    };

    installBridge(editor);
    window.markdownEditor?.handleEnvelope({
      protocolVersion: 1,
      type: 'editor.setMode',
      requestId: null,
      payload: { mode: 'source' },
    });

    expect(modes).toEqual(['source']);
    expect(messages.at(-1)).toEqual({
      protocolVersion: 1,
      type: 'editor.modeChanged',
      requestId: null,
      payload: { mode: 'source', requestedMode: 'source', accepted: true },
    });
  });

  it('reports Source as authoritative when Source to Visual validation is rejected', () => {
    const messages: unknown[] = [];
    Object.assign(globalThis, {
      window: {
        webkit: { messageHandlers: { bridge: { postMessage: (message: unknown) => messages.push(message) } } },
      },
    });
    let modeListener: ((transition: {
      mode: 'visual' | 'source';
      requestedMode: 'visual' | 'source';
      accepted: boolean;
      diagnostics: unknown[];
    }) => void) | undefined;
    const editor = {
      setContent(): void {},
      getMarkdown(): string { return '---\ndocument: [broken\n---'; },
      on(): void {},
      onModeChange(listener: typeof modeListener): void { modeListener = listener; },
      setMode(): void {
        modeListener?.({
          mode: 'source',
          requestedMode: 'visual',
          accepted: false,
          diagnostics: [],
        });
      },
    };

    installBridge(editor);
    window.markdownEditor?.handleEnvelope({
      protocolVersion: 1,
      type: 'editor.setMode',
      requestId: null,
      payload: { mode: 'visual' },
    });

    expect(messages.at(-1)).toEqual({
      protocolVersion: 1,
      type: 'editor.modeChanged',
      requestId: null,
      payload: { mode: 'source', requestedMode: 'visual', accepted: false },
    });
  });

  it('notifies the host only when parsed front matter metadata changes', () => {
    const messages: Array<{ type?: string; payload?: Record<string, unknown> }> = [];
    Object.assign(globalThis, {
      window: {
        webkit: { messageHandlers: { bridge: { postMessage: (message: typeof messages[number]) => messages.push(message) } } },
      },
    });
    let content = '---\nlmx:\n  schema: 1\n---\n\n# Báo cáo';
    const listeners = new Map<string, () => void>();
    const editor = {
      setContent(next: string): void { content = next; },
      getMarkdown(): string { return content; },
      on(event: string, listener: () => void): void { listeners.set(event, listener); },
    };
    installBridge(editor);

    content = '---\nlmx:\n  schema: 1\n---\n\n# Báo cáo mới';
    listeners.get('content-change')?.();
    expect(messages.filter((message) => message.type === 'document.metadataChanged')).toEqual([]);

    content = '---\nlmx:\n  schema: 1\n  cover:\n    title: Báo cáo mới\n---\n\n# Báo cáo mới';
    listeners.get('content-change')?.();

    expect(messages.filter((message) => message.type === 'document.metadataChanged')).toEqual([
      {
        protocolVersion: 1,
        type: 'document.metadataChanged',
        requestId: null,
        payload: { revision: 2, valid: true },
      },
    ]);
  });

  it('returns a Markdown snapshot with the matching request and editor revision', () => {
    const messages: unknown[] = [];
    Object.assign(globalThis, {
      window: {
        webkit: { messageHandlers: { bridge: { postMessage: (message: unknown) => messages.push(message) } } },
      },
    });
    const listeners = new Map<string, () => void>();
    const editor = {
      setContent(): void {},
      getMarkdown(): string { return '# Bản nháp'; },
      on(event: string, listener: () => void): void { listeners.set(event, listener); },
    };

    installBridge(editor);
    listeners.get('content-change')?.();
    window.markdownEditor?.handleEnvelope({
      protocolVersion: 1,
      type: 'document.requestMarkdown',
      requestId: 'save-1',
      payload: {},
    });

    expect(messages.at(-1)).toEqual({
      protocolVersion: 1,
      type: 'document.markdown',
      requestId: 'save-1',
      payload: { markdown: '# Bản nháp', revision: 1 },
    });
  });

  it('exports deterministic HCMUT LaTeX through the versioned bridge', () => {
    const messages: Array<{ type?: string; requestId?: string | null; payload?: Record<string, unknown> }> = [];
    Object.assign(globalThis, {
      window: {
        webkit: { messageHandlers: { bridge: { postMessage: (message: typeof messages[number]) => messages.push(message) } } },
      },
    });
    const editor = {
      setContent(): void {},
      getMarkdown(): string { return '# Giới thiệu\n'; },
      on(): void {},
    };

    installBridge(editor);
    window.markdownEditor?.handleEnvelope({
      protocolVersion: 1,
      type: 'export.requestLatex',
      requestId: 'export-1',
      payload: {},
    });

    expect(messages.at(-1)?.type).toBe('export.latex');
    expect(messages.at(-1)?.requestId).toBe('export-1');
    expect(messages.at(-1)?.payload?.latex).toContain('\\section{Giới thiệu}');
  });

  it('flushes pending edits before exporting a LaTeX snapshot with its revision', () => {
    const messages: Array<{ type?: string; requestId?: string | null; payload?: Record<string, unknown> }> = [];
    Object.assign(globalThis, {
      window: {
        webkit: { messageHandlers: { bridge: { postMessage: (message: typeof messages[number]) => messages.push(message) } } },
      },
    });
    let content = '# Bản nháp chưa flush';
    const listeners = new Map<string, () => void>();
    let commitCount = 0;
    const editor = {
      setContent(): void {},
      commitPendingChanges(): void {
        commitCount += 1;
        content = '# Bản nháp đã flush';
        listeners.get('content-change')?.();
      },
      getMarkdown(): string { return content; },
      on(event: string, listener: () => void): void { listeners.set(event, listener); },
    };

    installBridge(editor);
    window.markdownEditor?.handleEnvelope({
      protocolVersion: 1,
      type: 'export.requestLatex',
      requestId: 'export-snapshot-1',
      payload: {},
    });

    expect(commitCount).toBe(1);
    expect(messages.at(-1)).toMatchObject({
      protocolVersion: 1,
      type: 'export.latex',
      requestId: 'export-snapshot-1',
      payload: { revision: 1 },
    });
    expect(messages.at(-1)?.payload?.latex).toContain('\\section{Bản nháp đã flush}');
  });

  it('round-trips metadata through front matter without hiding state', () => {
    const messages: unknown[] = [];
    Object.assign(globalThis, {
      window: {
        webkit: { messageHandlers: { bridge: { postMessage: (message: unknown) => messages.push(message) } } },
      },
    });
    let content = '# Báo cáo';
    const editor = { setContent(next: string): void { content = next; }, getMarkdown(): string { return content; }, on(): void {} };
    installBridge(editor);
    window.markdownEditor?.handleEnvelope({ protocolVersion: 1, type: 'document.updateMetadata', requestId: 'update-1', payload: { patch: { cover: { title: 'Báo cáo mới' } } } });
    expect(content).toContain('title: Báo cáo mới');
    expect(messages.at(-1)).toMatchObject({
      type: 'document.metadata.updated', requestId: 'update-1', payload: { updated: true },
    });
    window.markdownEditor?.handleEnvelope({ protocolVersion: 1, type: 'document.requestMetadata', requestId: 'meta-1', payload: {} });
    expect(messages.at(-1)).toMatchObject({ type: 'document.metadata', requestId: 'meta-1' });
  });

  it('marks metadata edits as document changes with a new revision', () => {
    const messages: Array<{ type?: string; payload?: Record<string, unknown> }> = [];
    Object.assign(globalThis, {
      window: {
        webkit: { messageHandlers: { bridge: { postMessage: (message: typeof messages[number]) => messages.push(message) } } },
      },
    });
    let content = '# Báo cáo';
    const editor = {
      setContent(next: string): void { content = next; },
      getMarkdown(): string { return content; },
      on(): void {},
    };
    installBridge(editor);

    window.markdownEditor?.updateMetadata({ lmx: { cover: { title: 'Báo cáo mới' } } });

    expect(messages).toContainEqual({
      protocolVersion: 1,
      type: 'document.changed',
      requestId: null,
      payload: { revision: 1 },
    });
    expect(content).toContain('lmx:');
  });

  it('forwards selected LMX metadata and transient path to the native inspector', () => {
    const messages: unknown[] = [];
    type Selection = {
      name: string;
      identifier: string | null;
      attributes: Record<string, string | number | boolean>;
      path: Array<string | number>;
    };
    let selectionListener: ((selection: Selection) => void) | undefined;
    Object.assign(globalThis, {
      window: {
        webkit: { messageHandlers: { bridge: { postMessage: (message: unknown) => messages.push(message) } } },
      },
    });
    const editor = {
      setContent(): void {},
      getMarkdown(): string { return ''; },
      on(): void {},
      onLmxBlockSelected(listener: (selection: Selection) => void): void {
        selectionListener = listener;
      },
    };
    installBridge(editor);

    selectionListener?.({
      name: 'style',
      identifier: null,
      attributes: { color: '#1E4B8F', fontSizePt: 12 },
      path: [2],
    });

    expect(messages.at(-1)).toEqual({
      protocolVersion: 1,
      type: 'editor.lmxBlockSelected',
      requestId: null,
      payload: {
        name: 'style',
        identifier: null,
        attributes: { color: '#1E4B8F', fontSizePt: 12 },
        path: [2],
        hasCustomOverride: true,
      },
    });
  });

  it('flushes pending edits and replaces the source without forcing Visual mode', () => {
    const messages: Array<{ type?: string; requestId?: string | null; payload?: Record<string, unknown> }> = [];
    let content = [
      '---',
      'lmx:',
      '  schema: 2',
      '  themes: { base: {id: hcmut-report-v1, version: 1.0.0-beta.1}, formal: {id: formal-theme, version: 2.0.0} }',
      '  theme: {default: base}',
      '---',
      ':::theorem',
      'Nội dung cuối.',
      ':::',
    ].join('\n');
    let flushes = 0;
    let replacements = 0;
    Object.assign(globalThis, {
      window: {
        webkit: { messageHandlers: { bridge: { postMessage: (message: typeof messages[number]) => messages.push(message) } } },
      },
    });
    installBridge({
      setContent(next: string): void { content = next; },
      replaceMarkdownPreservingMode(next: string): void { replacements += 1; content = next; },
      commitPendingChanges(): void { flushes += 1; },
      getMarkdown(): string { return content; },
      on(): void {},
    });

    window.markdownEditor?.handleEnvelope({
      protocolVersion: 1,
      type: 'editor.applyThemeToComponent',
      requestId: 'theme-mode-1',
      payload: { componentSlot: 'theorem', themeAlias: 'formal' },
    });

    expect(flushes).toBe(1);
    expect(replacements).toBe(1);
    expect(content).toContain('components: { theorem: formal }');
    expect(messages.at(-1)).toMatchObject({
      type: 'document.themeComponent.updated',
      requestId: 'theme-mode-1',
      payload: { updated: true },
    });
  });

  it('responds with diagnostics instead of hanging on an invalid theme command', () => {
    const messages: Array<{ type?: string; requestId?: string | null; payload?: Record<string, unknown> }> = [];
    Object.assign(globalThis, {
      window: {
        webkit: { messageHandlers: { bridge: { postMessage: (message: typeof messages[number]) => messages.push(message) } } },
      },
    });
    let content = '---\nlmx:\n  schema: 2\n---\n\n# Báo cáo';
    installBridge({
      setContent(next: string): void { content = next; },
      getMarkdown(): string { return content; },
      on(): void {},
    });

    window.markdownEditor?.handleEnvelope({
      protocolVersion: 1,
      type: 'editor.applyThemeToComponent',
      requestId: 'theme-invalid-1',
      payload: { componentSlot: 42, themeAlias: null },
    });

    expect(content).toBe('---\nlmx:\n  schema: 2\n---\n\n# Báo cáo');
    expect(messages.at(-1)).toEqual({
      protocolVersion: 1,
      type: 'document.themeComponent.updated',
      requestId: 'theme-invalid-1',
      payload: {
        updated: false,
        diagnostics: [{
          code: 'bridge.invalid-theme-command',
          message: 'Theme component and alias must be strings.',
          severity: 'error',
        }],
      },
    });
  });

  it('applies a validated theme alias to a component and preserves instance overrides', () => {
    const messages: Array<{ type?: string; requestId?: string | null; payload?: Record<string, unknown> }> = [];
    let content = [
      '---',
      'lmx:',
      '  schema: 2',
      '  themes:',
      '    base: {id: hcmut-report-v1, version: 1.0.0-beta.1}',
      '    formal: {id: formal-theme, version: 2.0.0}',
      '  theme: {default: base}',
      '---',
      ':::theorem {theme="base"}',
      'Instance.',
      ':::',
    ].join('\n');
    Object.assign(globalThis, {
      window: {
        webkit: { messageHandlers: { bridge: { postMessage: (message: typeof messages[number]) => messages.push(message) } } },
      },
    });
    installBridge({
      setContent(next: string): void { content = next; },
      getMarkdown(): string { return content; },
      on(): void {},
    });

    window.markdownEditor?.handleEnvelope({
      protocolVersion: 1,
      type: 'editor.applyThemeToComponent',
      requestId: 'theme-all-1',
      payload: { componentSlot: 'theorem', themeAlias: 'formal' },
    });

    expect(content).toContain('components: { theorem: formal }');
    expect(content).toContain(':::theorem {theme="base"}');
    expect(messages).toContainEqual({
      protocolVersion: 1,
      type: 'document.changed',
      requestId: null,
      payload: { revision: 1 },
    });
    expect(messages.at(-1)).toEqual({
      protocolVersion: 1,
      type: 'document.themeComponent.updated',
      requestId: 'theme-all-1',
      payload: { updated: true, diagnostics: [] },
    });
  });

  it('routes a selected LMX metadata update without replacing the document', () => {
    Object.assign(globalThis, { window: {} });
    const updates: unknown[] = [];
    installBridge({
      setContent(): void {},
      getMarkdown(): string { return ''; },
      on(): void {},
      updateLmxBlockMetadata(path, patch): boolean {
        updates.push({ path, patch });
        return true;
      },
    });

    window.markdownEditor?.handleEnvelope({
      protocolVersion: 1,
      type: 'editor.updateSelectedLmxBlock',
      requestId: null,
      payload: {
        path: [2],
        identifier: null,
        attributes: { color: '#A12424', fontSizePt: 14 },
      },
    });

    expect(updates).toEqual([{
      path: [2],
      patch: { identifier: null, attributes: { color: '#A12424', fontSizePt: 14 } },
    }]);
  });

  it('forwards page selection and executes a confirmed native Delete Page command', () => {
    const messages: unknown[] = [];
    let pageSelectionListener: ((selection: {
      pageIndex: number;
      kind: 'semantic' | 'content' | 'blank';
      blockCount: number;
      semanticName: string | null;
      deletable: boolean;
    }) => void) | undefined;
    let deletionCount = 0;
    Object.assign(globalThis, {
      window: {
        webkit: { messageHandlers: { bridge: { postMessage: (message: unknown) => messages.push(message) } } },
      },
    });
    const editor = {
      setContent(): void {},
      getMarkdown(): string { return ''; },
      on(): void {},
      onPageSelectionChange(listener: typeof pageSelectionListener): void {
        pageSelectionListener = listener;
      },
      deleteSelectedPage(): boolean {
        deletionCount += 1;
        return true;
      },
    };
    installBridge(editor);

    pageSelectionListener?.({
      pageIndex: 2,
      kind: 'semantic',
      blockCount: 1,
      semanticName: 'cover',
      deletable: true,
    });
    window.markdownEditor?.handleEnvelope({
      protocolVersion: 1,
      type: 'editor.deleteSelectedPage',
      requestId: null,
      payload: {},
    });

    expect(messages.at(-1)).toEqual({
      protocolVersion: 1,
      type: 'editor.pageSelectionChanged',
      requestId: null,
      payload: {
        pageIndex: 2,
        kind: 'semantic',
        blockCount: 1,
        semanticName: 'cover',
        deletable: true,
      },
    });
    expect(deletionCount).toBe(1);
  });

  it('forwards page inventory and routes page navigation commands', () => {
    const messages: unknown[] = [];
    let inventoryListener: ((pages: Array<{
      pageIndex: number;
      kind: 'semantic' | 'content' | 'blank';
      semanticName: string | null;
      blockCount: number;
      insertAfterIndex: number;
      deletable: boolean;
      title: string;
    }>) => void) | undefined;
    const selected: number[] = [];
    const added: number[] = [];
    const deleted: number[] = [];
    const moved: Array<[number, string]> = [];
    Object.assign(globalThis, {
      window: {
        webkit: { messageHandlers: { bridge: { postMessage: (message: unknown) => messages.push(message) } } },
      },
    });
    const editor = {
      setContent(): void {},
      getMarkdown(): string { return ''; },
      on(): void {},
      onPageInventoryChange(listener: typeof inventoryListener): void { inventoryListener = listener; },
      selectPage(pageIndex: number): boolean { selected.push(pageIndex); return true; },
      addPage(pageIndex: number): boolean { added.push(pageIndex); return true; },
      deletePage(pageIndex: number): boolean { deleted.push(pageIndex); return true; },
      movePage(pageIndex: number, direction: 'up' | 'down'): boolean {
        moved.push([pageIndex, direction]); return true;
      },
    };
    installBridge(editor);
    inventoryListener?.([{ pageIndex: 0, kind: 'blank', semanticName: null, blockCount: 0, insertAfterIndex: -1, deletable: false, title: 'Trang 1' }]);
    window.markdownEditor?.handleEnvelope({ protocolVersion: 1, type: 'editor.selectPage', requestId: null, payload: { pageIndex: 2 } });
    window.markdownEditor?.handleEnvelope({ protocolVersion: 1, type: 'editor.addPage', requestId: null, payload: { afterPageIndex: 2 } });
    window.markdownEditor?.handleEnvelope({ protocolVersion: 1, type: 'editor.deletePage', requestId: null, payload: { pageIndex: 2 } });
    window.markdownEditor?.handleEnvelope({ protocolVersion: 1, type: 'editor.movePage', requestId: null, payload: { pageIndex: 2, direction: 'up' } });

    expect(messages.at(-1)).toMatchObject({ type: 'editor.pageInventoryChanged', payload: { pages: [{ pageIndex: 0 }] } });
    expect(selected).toEqual([2]);
    expect(added).toEqual([2]);
    expect(deleted).toEqual([2]);
    expect(moved).toEqual([[2, 'up']]);
  });

  it('forwards page action strip requests without mutating Markdown directly', () => {
    const messages: unknown[] = [];
    const visualContainer = new EventTarget() as HTMLElement;
    const added: number[] = [];
    const deleted: number[] = [];
    Object.assign(globalThis, {
      window: {
        webkit: { messageHandlers: { bridge: { postMessage: (message: unknown) => messages.push(message) } } },
      },
    });
    installBridge({
      setContent(): void {},
      getMarkdown(): string { return ''; },
      on(): void {},
      visualContainer,
      addPage(pageIndex: number): boolean { added.push(pageIndex); return true; },
      deletePage(pageIndex: number): boolean { deleted.push(pageIndex); return true; },
    });

    visualContainer.dispatchEvent(new CustomEvent(VISUAL_PAGE_ADD_REQUESTED, {
      detail: { afterPageIndex: 1 },
    }));
    visualContainer.dispatchEvent(new CustomEvent(VISUAL_PAGE_DELETE_REQUESTED, {
      detail: { pageIndex: 2 },
    }));
    visualContainer.dispatchEvent(new CustomEvent(VISUAL_PAGE_MOVE_REQUESTED, {
      detail: { pageIndex: 2, direction: 'up' },
    }));

    expect(messages.slice(-3)).toEqual([
      {
        protocolVersion: 1,
        type: 'editor.pageActionRequested',
        requestId: null,
        payload: { action: 'addAfter', pageIndex: 1 },
      },
      {
        protocolVersion: 1,
        type: 'editor.pageActionRequested',
        requestId: null,
        payload: { action: 'delete', pageIndex: 2 },
      },
      {
        protocolVersion: 1,
        type: 'editor.pageActionRequested',
        requestId: null,
        payload: { action: 'moveUp', pageIndex: 2 },
      },
    ]);
    expect(added).toEqual([]);
    expect(deleted).toEqual([]);
  });

  it('forwards rendered A4 thumbnails without exposing editor internals', () => {
    const messages: unknown[] = [];
    let thumbnailListener: ((thumbnail: {
      layoutRevision: number;
      pageIndex: number;
      mimeType: 'image/png' | 'image/jpeg';
      dataBase64: string;
    }) => void) | undefined;
    Object.assign(globalThis, {
      window: {
        webkit: { messageHandlers: { bridge: { postMessage: (message: unknown) => messages.push(message) } } },
      },
    });
    installBridge({
      setContent(): void {},
      getMarkdown(): string { return ''; },
      on(): void {},
      onPageThumbnailChange(listener): void { thumbnailListener = listener; },
    });

    thumbnailListener?.({ layoutRevision: 4, pageIndex: 1, mimeType: 'image/jpeg', dataBase64: 'AQID' });

    expect(messages.at(-1)).toEqual({
      protocolVersion: 1,
      type: 'editor.pageThumbnailChanged',
      requestId: null,
      payload: { layoutRevision: 4, pageIndex: 1, mimeType: 'image/jpeg', dataBase64: 'AQID' },
    });
  });

  it('invalidates and publishes a typed DocumentIndex snapshot without sending Markdown', () => {
    const messages: Array<{ type?: string; payload?: Record<string, unknown> }> = [];
    const listeners = new Map<string, () => void>();
    let content = '# Chương một\n\n[Docs](https://example.com)';
    Object.assign(globalThis, {
      window: {
        webkit: { messageHandlers: { bridge: { postMessage: (message: typeof messages[number]) => messages.push(message) } } },
      },
    });
    installBridge({
      setContent(next: string): void { content = next; },
      getMarkdown(): string { return content; },
      on(event: string, listener: () => void): void { listeners.set(event, listener); },
    });

    listeners.get('content-change')?.();

    expect(messages.map((message) => message.type)).toEqual([
      'editor.ready',
      'document.indexInvalidated',
      'document.changed',
      'document.indexChanged',
    ]);
    expect(messages.find((message) => message.type === 'document.changed')?.payload).toEqual({ revision: 1 });
    const snapshot = messages.find((message) => message.type === 'document.indexChanged')?.payload;
    expect(snapshot).toMatchObject({
      documentRevision: 1,
      outline: [{ title: 'Chương một', sourceRange: { from: 0, to: 12 } }],
      links: [{ destination: 'https://example.com', targetKind: 'external' }],
      images: [],
    });
    expect(snapshot).not.toHaveProperty('markdown');
  });

  it('routes a validated reveal location to the active editor mode', () => {
    const messages: unknown[] = [];
    const locations: unknown[] = [];
    Object.assign(globalThis, {
      window: {
        webkit: { messageHandlers: { bridge: { postMessage: (message: unknown) => messages.push(message) } } },
      },
    });
    installBridge({
      setContent(): void {},
      getMarkdown(): string { return '# Heading'; },
      on(): void {},
      revealLocation(location): boolean { locations.push(location); return true; },
    });

    window.markdownEditor?.handleEnvelope({
      protocolVersion: 1,
      type: 'editor.revealLocation',
      requestId: null,
      payload: {
        from: 0,
        to: 9,
        startLine: 1,
        startColumn: 1,
        endLine: 1,
        endColumn: 10,
      },
    });

    expect(locations).toEqual([{
      from: 0,
      to: 9,
      startLine: 1,
      startColumn: 1,
      endLine: 1,
      endColumn: 10,
    }]);
    expect(messages.at(-1)).toMatchObject({ type: 'editor.ready' });
  });

  it('forwards only validated page navigator demand to the renderer', () => {
    Object.assign(globalThis, { window: {} });
    const demands: unknown[] = [];
    installBridge({
      setContent(): void {},
      getMarkdown(): string { return ''; },
      on(): void {},
      setPageNavigatorDemand(demand): void { demands.push(demand); },
    });

    window.markdownEditor?.handleEnvelope({
      protocolVersion: 1,
      type: 'editor.setPageNavigatorDemand',
      requestId: null,
      payload: { pageIndices: [5, 2, 2, -1, 3.5, '4'], targetWidth: 144 },
    });
    window.markdownEditor?.handleEnvelope({
      protocolVersion: 1,
      type: 'editor.setPageNavigatorDemand',
      requestId: null,
      payload: { pageIndices: [], targetWidth: 144 },
    });

    expect(demands).toEqual([
      { pageIndices: [2, 5], targetWidth: 144 },
      { pageIndices: [], targetWidth: 144 },
    ]);
  });
});
