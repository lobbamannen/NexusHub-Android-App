import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  base: '/',
  plugins: [react(), {
    name: 'nexushub-ci-server-identity',
    configureServer(server) {
      if (!process.env.NEXUS_TEST_RUN_ID) return;
      server.middlewares.use('/__nexus-test-run', (_request,response) => {
        response.setHeader('Content-Type','text/plain; charset=utf-8');
        response.setHeader('Cache-Control','no-store');
        response.end(process.env.NEXUS_TEST_RUN_ID);
      });
    },
  }],
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  build: { target: 'es2022', outDir: 'dist', sourcemap: false },
});
