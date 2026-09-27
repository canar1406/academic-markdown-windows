// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import { Muya } from '../../muya';

describe('JSONState pending operation flush', () => {
    it('commits queued edits synchronously and does not emit them again next frame', async () => {
        const host = document.createElement('section');
        document.body.append(host);
        const muya = new Muya(host, { frontMatter: true });
        muya.init();
        muya.setContent('# Trang B\n');
        let changes = 0;
        muya.on('json-change', () => { changes += 1; });
        try {
            muya.editor.jsonState.replaceOperation([0, 'text'], '# Trang B', '# Trang B mới');
            expect(muya.getState()[0]).toMatchObject({ text: '# Trang B' });

            expect(muya.flushPendingChanges()).toBe(true);
            expect(muya.getState()[0]).toMatchObject({ text: '# Trang B mới' });
            expect(changes).toBe(1);

            await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
            expect(changes).toBe(1);
            expect(muya.flushPendingChanges()).toBe(false);
        }
        finally {
            muya.destroy();
        }
    });
});
