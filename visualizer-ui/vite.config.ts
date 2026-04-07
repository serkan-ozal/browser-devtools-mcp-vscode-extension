import { defineConfig } from 'vite';

/**
 * publicDir: false — all assets are embedded into the bundle as base64 via ?inline,
 * so static file serving is not needed. This also avoids Vite 6's
 * "files under public/ cannot be imported from JavaScript" limitation.
 */
export default defineConfig({
  root: '.',
  publicDir: false,
  server: {
    port: Number(process.env.VIS_UI_PORT) || 3000,
    strictPort: false, // auto-increment if port is occupied
  },
  build: {
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
