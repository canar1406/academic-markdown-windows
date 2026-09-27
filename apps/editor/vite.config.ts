import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  base: './',
  publicDir: fileURLToPath(new URL('../../packages/muya-fork/node_modules/prismjs/components', import.meta.url)),
  plugins: [
    {
      name: 'classic-wkwebview-entry',
      apply: 'build',
      enforce: 'post',
      transformIndexHtml(html) {
        return html
          .replace(/\s+type="module"/g, '')
          .replace(/\s+crossorigin(?=[\s>])/g, '')
          .replace(/<script(?=\s+src="\.\/assets\/)/g, '<script defer');
      },
    },
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
      },
    },
  },
});
