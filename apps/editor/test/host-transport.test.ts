import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createEnvelope, type BridgeEnvelope } from '@markdown/bridge-protocol';
import { installBridge, postToHost } from '../src/bridge';
import { installHostTransport, resolveDocumentImageSrc } from '../src/host-transport';

type HostMessageListener = (event: MessageEvent<unknown>) => void;
const hostEnvelopeFixtures: Array<{ name: string; valid: boolean; envelope: unknown }> = JSON.parse(
  readFileSync(new URL('../../../packages/bridge-protocol/test/fixtures/host-envelope-v1.json', import.meta.url), 'utf8'),
);

class NativeWebView {
  readonly messages: BridgeEnvelope[] = [];
  private readonly listeners = new Set<HostMessageListener>();
  onPostMessage?: (message: BridgeEnvelope) => void;

  postMessage(message: BridgeEnvelope): void {
    this.messages.push(message);
    this.onPostMessage?.(message);
  }

  addEventListener(type: 'message', listener: HostMessageListener): void {
    expect(type).toBe('message');
    this.listeners.add(listener);
  }

  removeEventListener(type: 'message', listener: HostMessageListener): void {
    expect(type).toBe('message');
    this.listeners.delete(listener);
  }

  receive(data: unknown): void {
    for (const listener of this.listeners) {
      listener(new MessageEvent<unknown>('message', { data }));
    }
  }
}

function createEditor(initialContent = '# Bản nháp') {
  let content = initialContent;
  const listeners = new Map<string, () => void>();
  return {
    setContent(next: string): void { content = next; },
    getMarkdown(): string { return content; },
    on(event: string, listener: () => void): void { listeners.set(event, listener); },
    changeContent(next: string): void {
      content = next;
      listeners.get('content-change')?.();
    },
  };
}

function installWindowsWindow(webview: NativeWebView): void {
  Object.assign(globalThis, {
    window: {
      chrome: { webview },
      location: new URL('https://editor.academic-markdown.invalid/index.html'),
    },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(globalThis, 'window');
});

describe('native host transport integration', () => {
  it('posts readiness and lightweight revision messages to WebView2 as objects', () => {
    const webview = new NativeWebView();
    installWindowsWindow(webview);
    const editor = createEditor();

    installBridge(editor);
    editor.changeContent('# Nội dung mới');

    expect(webview.messages[0]).toEqual({
      protocolVersion: 1, type: 'editor.ready', requestId: null, payload: {},
    });
    expect(webview.messages.find(message => message.type === 'document.changed')).toEqual({
      protocolVersion: 1, type: 'document.changed', requestId: null, payload: { revision: 1 },
    });
  });

  it('receives a synchronous native load reply before editor.ready finishes posting', () => {
    const webview = new NativeWebView();
    installWindowsWindow(webview);
    const editor = createEditor();
    const markdown = '# Tiếng Việt\n\n"Quotes", `code`, ${notJavaScript} and \\slashes';
    webview.onPostMessage = message => {
      if (message.type === 'editor.ready') {
        webview.receive(createEnvelope('document.loadMarkdown', null, { markdown }));
      }
    };

    installBridge(editor);

    expect(editor.getMarkdown()).toBe(markdown);
  });

  it('dispatches PostWebMessageAsJson data and preserves async request IDs', () => {
    const webview = new NativeWebView();
    installWindowsWindow(webview);
    const editor = createEditor();
    installBridge(editor);

    webview.receive(createEnvelope('document.loadMarkdown', null, { markdown: '# Tài liệu' }));
    webview.receive(createEnvelope('document.requestMarkdown', 'save-windows-1'));

    expect(webview.messages.at(-1)).toEqual({
      protocolVersion: 1,
      type: 'document.markdown',
      requestId: 'save-windows-1',
      payload: { markdown: '# Tài liệu', revision: 0 },
    });
  });

  it.each(['WebKit', 'WebView2'])('flushes pending edits before the %s Markdown/revision snapshot', host => {
    const nativeHost = new NativeWebView();
    if (host === 'WebView2') {
      installWindowsWindow(nativeHost);
    } else {
      Object.assign(globalThis, {
        window: { webkit: { messageHandlers: { bridge: nativeHost } } },
      });
    }
    const editor = createEditor();
    let pending: string | null = '# Nội dung Source/IME chưa gửi\n\nTiếng Việt';
    let flushes = 0;
    installBridge({
      ...editor,
      commitPendingChanges(): void {
        flushes += 1;
        if (pending === null) return;
        editor.changeContent(pending);
        pending = null;
      },
    });
    const request = createEnvelope('document.requestMarkdown', 'save-pending');

    if (host === 'WebView2') nativeHost.receive(request);
    else window.markdownEditor?.handleEnvelope(request);

    expect(flushes).toBe(1);
    expect(nativeHost.messages.at(-1)).toEqual({
      protocolVersion: 1,
      type: 'document.markdown',
      requestId: 'save-pending',
      payload: { markdown: '# Nội dung Source/IME chưa gửi\n\nTiếng Việt', revision: 1 },
    });
    window.markdownEditor?.requestMarkdown('no-more-pending-edits');
    expect(nativeHost.messages.at(-1)?.payload.revision).toBe(1);

    window.markdownEditor?.loadMarkdown('# Tài liệu khác');
    window.markdownEditor?.requestMarkdown('after-load');
    expect(nativeHost.messages.at(-1)).toEqual({
      protocolVersion: 1,
      type: 'document.markdown',
      requestId: 'after-load',
      payload: { markdown: '# Tài liệu khác', revision: 0 },
    });
  });

  it.each(hostEnvelopeFixtures)('matches the shared v1 envelope fixture: $name', ({ valid, envelope }) => {
    const webview = new NativeWebView();
    installWindowsWindow(webview);
    installBridge(createEditor());
    const dispatcher = window.markdownEditor;
    if (!dispatcher) throw new Error('Bridge was not installed');
    const dispatch = vi.spyOn(dispatcher, 'handleEnvelope');

    expect(() => webview.receive(envelope)).not.toThrow();

    if (valid) expect(dispatch).toHaveBeenCalledExactlyOnceWith(envelope);
    else expect(dispatch).not.toHaveBeenCalled();
  });

  it('ignores malformed or unsupported envelopes without throwing or changing Markdown', () => {
    const webview = new NativeWebView();
    installWindowsWindow(webview);
    const editor = createEditor();
    installBridge(editor);
    const dispatcher = window.markdownEditor;
    if (!dispatcher) throw new Error('Bridge was not installed');
    const dispatch = vi.spyOn(dispatcher, 'handleEnvelope');
    const valid = createEnvelope('document.loadMarkdown', null, { markdown: '# Hợp lệ' });
    const invalid: unknown[] = [
      null, undefined, false, 42, [], {}, JSON.stringify(valid),
      { ...valid, protocolVersion: undefined },
      { ...valid, protocolVersion: 2 },
      { ...valid, protocolVersion: '1' },
      { ...valid, type: undefined },
      { ...valid, type: null },
      { ...valid, type: 42 },
      { ...valid, type: '' },
      { ...valid, type: ' ' },
      { ...valid, requestId: undefined },
      { ...valid, requestId: 42 },
      { ...valid, requestId: {} },
      { ...valid, payload: undefined },
      { ...valid, payload: null },
      { ...valid, payload: [] },
      { ...valid, payload: 'not an object' },
    ];

    for (const envelope of invalid) {
      expect(() => webview.receive(envelope)).not.toThrow();
      expect(editor.getMarkdown()).toBe('# Bản nháp');
    }
    expect(dispatch).not.toHaveBeenCalled();
    webview.receive(valid);
    expect(dispatch).toHaveBeenCalledExactlyOnceWith(valid);
    expect(editor.getMarkdown()).toBe('# Hợp lệ');
  });

  it('reinstalls without duplicate native listeners or a stale editor dispatcher', () => {
    const webview = new NativeWebView();
    installWindowsWindow(webview);
    const firstEditor = createEditor('# First');
    const nextEditor = createEditor('# Tiếp theo');
    installBridge(firstEditor);
    installBridge(nextEditor);

    webview.receive(createEnvelope('document.requestMarkdown', 'after-reinstall'));

    expect(webview.messages.filter(message => message.type === 'document.markdown')).toEqual([{
      protocolVersion: 1,
      type: 'document.markdown',
      requestId: 'after-reinstall',
      payload: { markdown: '# Tiếp theo', revision: 0 },
    }]);
  });

  it('disposes only its own listener even when an old disposer runs after reinstallation', () => {
    const webview = new NativeWebView();
    installWindowsWindow(webview);
    const editor = createEditor();
    installBridge(editor);
    const disposeOld = installHostTransport();
    const disposeCurrent = installHostTransport();

    disposeOld();
    webview.receive(createEnvelope('document.loadMarkdown', null, { markdown: '# Active' }));
    expect(editor.getMarkdown()).toBe('# Active');

    disposeCurrent();
    disposeCurrent();
    webview.receive(createEnvelope('document.loadMarkdown', null, { markdown: '# Disposed' }));
    expect(editor.getMarkdown()).toBe('# Active');
  });

  it('preserves WebKit transport and does not double-send when both namespaces exist', () => {
    const webkit = new NativeWebView();
    const webview = new NativeWebView();
    installWindowsWindow(webview);
    Object.assign(window, { webkit: { messageHandlers: { bridge: webkit } } });

    const editor = createEditor();
    installBridge(editor);
    postToHost(createEnvelope('document.requestOpen', 'macos-1'));
    webview.receive(createEnvelope('document.loadMarkdown', null, { markdown: '# Wrong host' }));

    expect(webkit.messages.map(message => message.type)).toEqual([
      'editor.ready', 'document.requestOpen',
    ]);
    expect(webview.messages).toEqual([]);
    expect(editor.getMarkdown()).toBe('# Bản nháp');
  });

  it('keeps ordinary browser editing usable without a native transport', () => {
    Object.assign(globalThis, {
      window: { chrome: {}, location: new URL('http://localhost:5173/') },
    });
    const editor = createEditor();

    expect(() => installBridge(editor)).not.toThrow();
    expect(() => postToHost(createEnvelope('editor.ready', null))).not.toThrow();
    window.markdownEditor?.loadMarkdown('# Browser');
    expect(editor.getMarkdown()).toBe('# Browser');
  });
});

describe.each([
  { host: 'WebKit', imageRoot: 'app-document://local/' },
  { host: 'WebView2', imageRoot: 'https://document.academic-markdown.invalid/' },
])('document images on $host', ({ host, imageRoot }) => {
  function installHost(): void {
    if (host === 'WebView2') {
      installWindowsWindow(new NativeWebView());
    } else {
      Object.assign(globalThis, {
        window: {
          webkit: { messageHandlers: { bridge: new NativeWebView() } },
          location: new URL('file:///Applications/Markdown.app/Contents/Resources/editor/index.html'),
        },
      });
    }
  }

  it.each([
    ['assets/figure.png', 'assets/figure.png'],
    ['ảnh/figure 1.png', '%E1%BA%A3nh/figure%201.png'],
    ['assets/figure #1?.png', 'assets/figure%20%231%3F.png'],
    ['assets/100%.png', 'assets/100%25.png'],
    ['assets/figure%20name.png', 'assets/figure%2520name.png'],
  ])('encodes relative filename segments without rewriting %s', (src, encodedPath) => {
    installHost();

    expect(resolveDocumentImageSrc(src)).toBe(`${imageRoot}${encodedPath}`);
  });

  it.each([
    '',
    '/assets/figure.png',
    '//server/share/figure.png',
    '\\\\server\\share\\figure.png',
    'C:/assets/figure.png',
    'C:\\assets\\figure.png',
    'assets\\figure.png',
    'assets/../figure.png',
    '../figure.png',
    './figure.png',
    'assets/./figure.png',
    'assets//figure.png',
    'assets/',
    'assets/.. /figure.png',
    'assets/%2e%2e/figure.png',
    'assets/%252E%252E/figure.png',
    'assets/%2fsecret.png',
    'assets/%255csecret.png',
    'assets/figure.png:secret',
    'assets/figure.png%3asecret',
    'https://example.com/figure.png',
    'https%3a//example.com/figure.png',
    'file:///tmp/figure.png',
    'data:image/png;base64,AAAA',
    'blob:https://example.com/image.png',
    'javascript:alert(1)',
    'app-document://local/assets/figure.png',
    'assets/\u0000figure.png',
    'assets/%00figure.png',
    'assets/\nfigure.png',
    'assets/\ud800.png',
  ])('rejects unsafe or malformed document paths: %j', src => {
    installHost();

    expect(() => resolveDocumentImageSrc(src)).not.toThrow();
    expect(resolveDocumentImageSrc(src)).toBeUndefined();
  });
});

describe('document image host isolation', () => {
  it.each([
    'http://editor.academic-markdown.invalid/index.html',
    'https://editor.academic-markdown.invalid.evil.test/index.html',
    'https://other.academic-markdown.invalid/index.html',
    'https://document.academic-markdown.invalid/figure.png',
    'https://editor.academic-markdown.invalid:444/index.html',
    'file:///tmp/index.html',
  ])('does not resolve Windows assets from an unapproved editor origin: %s', href => {
    installWindowsWindow(new NativeWebView());
    Object.assign(window, { location: new URL(href) });

    expect(resolveDocumentImageSrc('assets/figure.png')).toBeUndefined();
  });

  it.each([
    'file:///tmp/index.html',
    'http://localhost:5173/',
    'https://editor.academic-markdown.invalid/index.html',
  ])('leaves image resolution unchanged in an ordinary browser: %s', href => {
    Object.assign(globalThis, { window: { chrome: {}, location: new URL(href) } });

    expect(resolveDocumentImageSrc('assets/figure.png')).toBeUndefined();
  });

  it('allows only the document image origin in CSP without relaxing scripts or connections', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const policy = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
    expect(policy).toBeDefined();
    const directives = new Map(policy?.split(';').filter(part => part.trim()).map(part => {
      const [name, ...sources] = part.trim().split(/\s+/);
      return [name, sources];
    }));

    expect(directives.get('img-src')).toEqual([
      "'self'", 'data:', 'app-document:', 'https://document.academic-markdown.invalid',
    ]);
    expect(directives.get('script-src')).toEqual(["'self'"]);
    expect(directives.get('connect-src')).toEqual(["'none'"]);
    expect(directives.get('default-src')).toEqual(["'self'"]);
  });
});
