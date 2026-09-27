import { BRIDGE_PROTOCOL_VERSION, type BridgeEnvelope } from '@markdown/bridge-protocol';

interface BridgeHandler {
  postMessage(message: BridgeEnvelope): void;
}

interface WebView2Handler extends BridgeHandler {
  addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
}

declare global {
  interface Window {
    webkit?: {
      messageHandlers?: {
        bridge?: BridgeHandler;
      };
    };
    chrome?: {
      webview?: WebView2Handler;
    };
  }
}

const installedTransports = new WeakMap<Window, () => void>();
const WINDOWS_EDITOR_ORIGIN = 'https://editor.academic-markdown.invalid';
const WINDOWS_DOCUMENT_ORIGIN = 'https://document.academic-markdown.invalid';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isHostEnvelope(value: unknown): value is BridgeEnvelope {
  return isRecord(value)
    && value.protocolVersion === BRIDGE_PROTOCOL_VERSION
    && typeof value.type === 'string'
    && value.type.trim().length > 0
    && (value.requestId === null || typeof value.requestId === 'string')
    && isRecord(value.payload);
}

export function postToHost(message: BridgeEnvelope): void {
  const handler = window.webkit?.messageHandlers?.bridge ?? window.chrome?.webview;
  handler?.postMessage(message);
}

export function installHostTransport(): () => void {
  const hostWindow = window;
  installedTransports.get(hostWindow)?.();
  const webview = hostWindow.chrome?.webview;
  if (hostWindow.webkit?.messageHandlers?.bridge || !webview) return () => {};

  // PostWebMessageAsJson already supplies a parsed object on this native-only channel.
  const receive = (event: MessageEvent<unknown>): void => {
    if (isHostEnvelope(event.data)) hostWindow.markdownEditor?.handleEnvelope(event.data);
  };
  webview.addEventListener('message', receive);
  const dispose = (): void => {
    webview.removeEventListener('message', receive);
    if (installedTransports.get(hostWindow) === dispose) installedTransports.delete(hostWindow);
  };
  installedTransports.set(hostWindow, dispose);
  return dispose;
}

export function resolveDocumentImageSrc(src: string): string | undefined {
  let imageRoot: string;
  if (window.location.protocol === 'file:' && window.webkit) {
    imageRoot = 'app-document://local';
  } else if (window.location.origin === WINDOWS_EDITOR_ORIGIN && window.chrome?.webview) {
    imageRoot = WINDOWS_DOCUMENT_ORIGIN;
  } else {
    return undefined;
  }
  const segments = src.split('/');
  if (!segments.every(isSafeImagePathSegment)) return undefined;
  try {
    return `${imageRoot}/${segments.map(segment => encodeURIComponent(segment)).join('/')}`;
  } catch {
    // A lone UTF-16 surrogate must not abort rendering or mutate the Markdown source.
    return undefined;
  }
}

function isSafeImagePathSegment(segment: string): boolean {
  let candidate = segment;
  while (true) {
    if (candidate === '' || candidate.trimEnd() === '.' || candidate.trimEnd() === '..'
      || /[\\/:\u0000-\u001f\u007f]/.test(candidate)) return false;
    // Inspect escapes (including nested ones) without decoding the actual filename.
    // Each successful replacement shortens the candidate, so this loop terminates.
    const decoded = candidate.replace(/%([0-9a-f]{2})/gi, (_escape, hex: string) => (
      String.fromCharCode(Number.parseInt(hex, 16))
    ));
    if (decoded === candidate) return true;
    candidate = decoded;
  }
}
