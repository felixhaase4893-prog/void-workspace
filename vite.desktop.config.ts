import { defineConfig } from 'vite';

/**
 * Bundles the PC Optimizer backend (TypeScript, src/desktop/optimizer) into one
 * CommonJS file for the Electron main process. Dependencies such as zod are
 * bundled in, because the packaged app ships without node_modules.
 */
export default defineConfig({
  // The web app's public/ folder belongs to the renderer build, not next to the backend.
  publicDir: false,
  build: {
    ssr: 'src/desktop/optimizer/backend.ts',
    outDir: 'electron/generated',
    emptyOutDir: true,
    target: 'node22',
    minify: false,
    sourcemap: false,
    rollupOptions: {
      output: { format: 'cjs', entryFileNames: 'optimizerBackend.cjs' },
    },
  },
  ssr: { noExternal: true, target: 'node' },
});
