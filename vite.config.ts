import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
// @ts-expect-error — plain ESM module without type declarations
import { createAIHandler } from './server/ai/handler.mjs';

/** Mounts the same-origin AI proxy (/api/*) on the Vite dev & preview servers. */
function aiProxy(): Plugin {
  const handler = createAIHandler();
  return {
    name: 'leximaster-ai-proxy',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), aiProxy()],
  server: {
    port: 5173,
    host: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react/jsx-runtime', 'scheduler'],
          xlsx: ['xlsx'],
          icons: ['lucide-react'],
          motion: ['motion/react'],
        },
      },
    },
  },
  test: {
    include: ['tests/**/*.test.{ts,mjs}'],
  },
} as any);
