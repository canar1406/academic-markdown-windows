// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('Prism utility initialization', () => {
    const requestedLanguages: string[] = [];
    let appendSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.resetModules();
        requestedLanguages.length = 0;

        // Keep the test offline while preserving the registration side effect
        // that a successfully loaded Prism component script would perform.
        appendSpy = vi.spyOn(document.head, 'append').mockImplementation((...nodes) => {
            for (const node of nodes) {
                if (!(node instanceof HTMLScriptElement))
                    continue;

                const language = node.dataset.prismLanguage;
                if (!language)
                    continue;

                requestedLanguages.push(language);
                const prism = (window as typeof window & {
                    Prism?: { languages: Record<string, unknown> };
                }).Prism;
                if (prism)
                    prism.languages[language] = {};
                queueMicrotask(() => node.dispatchEvent(new Event('load')));
            }
        });
    });

    afterEach(() => {
        appendSpy.mockRestore();
        Reflect.deleteProperty(window, 'Prism');
    });

    it('does not request language scripts merely by importing the utility', async () => {
        await import('../index');
        await Promise.resolve();

        expect(requestedLanguages).toEqual([]);
    });
});
