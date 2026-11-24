import { defineConfig } from 'vite';

// Hash routes do not need server-side routing. Relative build assets also
// support hosting below a repository path instead of only the domain root.
export default defineConfig({
  base: './',
  build: { outDir: 'dist-static', manifest: true, target: 'es2020' },
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true }
});
