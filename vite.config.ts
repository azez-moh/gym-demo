import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build` -> dist/ (multi-file, relative base).
// `npm run build:single` -> dist-single/index.html with every asset inlined (publishable as one file).
export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    base: './',
    plugins: single ? [react(), viteSingleFile({ removeViteModuleLoader: true })] : [react()],
    build: single
      ? { outDir: 'dist-single', assetsInlineLimit: 100_000_000, chunkSizeWarningLimit: 100_000, cssCodeSplit: false }
      : { outDir: 'dist', chunkSizeWarningLimit: 1500 },
  };
});
