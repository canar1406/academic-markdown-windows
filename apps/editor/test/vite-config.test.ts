import { describe, expect, it } from 'vitest';
import type { Plugin } from 'vite';
import viteConfig from '../vite.config.js';

function isPlugin(value: unknown): value is Plugin {
  return Boolean(
    value
    && typeof value === 'object'
    && !Array.isArray(value)
    && 'name' in value,
  );
}

describe('packaged WKWebView bundle', () => {
  it('emits one classic IIFE without runtime module imports', () => {
    if (typeof viteConfig === 'function' || viteConfig instanceof Promise) {
      throw new Error('Expected a static Vite configuration');
    }

    const output = viteConfig.build?.rollupOptions?.output;
    expect(Array.isArray(output)).toBe(false);
    expect(output).toMatchObject({
      format: 'iife',
      inlineDynamicImports: true,
    });

    const plugin = viteConfig.plugins?.find(
      (candidate) => isPlugin(candidate) && candidate.name === 'classic-wkwebview-entry',
    );
    if (!isPlugin(plugin) || typeof plugin.transformIndexHtml !== 'function') {
      throw new Error('Missing classic WKWebView index transformer');
    }
    expect(plugin.apply).toBe('build');
    const transformed = plugin.transformIndexHtml(
      '<script type="module" crossorigin src="./assets/editor.js"></script>',
      {} as never,
    );
    expect(transformed).toBe('<script defer src="./assets/editor.js"></script>');
  });
});
