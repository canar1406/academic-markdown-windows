import { describe, expect, it } from 'vitest';
import { createEnvelope, isSupportedEnvelope, type BridgeEnvelope } from '../src/index.js';

describe('bridge envelope v1', () => {
  it('creates a deterministic request envelope', () => {
    const envelope = createEnvelope('document.loadMarkdown', 'request-1', { markdown: '# Xin chào' });

    expect(envelope).toEqual({
      protocolVersion: 1,
      type: 'document.loadMarkdown',
      requestId: 'request-1',
      payload: { markdown: '# Xin chào' },
    });
  });

  it('rejects an unsupported protocol version', () => {
    const envelope: BridgeEnvelope = {
      protocolVersion: 2,
      type: 'editor.ready',
      requestId: null,
      payload: {},
    };

    expect(isSupportedEnvelope(envelope)).toBe(false);
  });
});
