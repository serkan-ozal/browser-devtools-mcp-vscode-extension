import { defineConfig } from 'vite';

/**
 * publicDir: false — tüm asset'ler ?inline ile base64 olarak bundle'a gömülüyor,
 * statik dosya sunumuna gerek yok. Bu sayede Vite 6'nın "public/ klasöründeki
 * dosyalar JavaScript'ten import edilemez" kısıtlaması da ortadan kalkar.
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
