import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    // The browser preview uses a per-session *.e2b.app host rather than localhost.
    allowedHosts: ['.e2b.app'],
  },
  build: {
    rollupOptions: {
      output: {
        // Rolldown (Vite 8) принимает manualChunks только функцией.
        // Состав чанков тот же, что был в объектной форме Rollup:
        // тяжёлые библиотеки кэшируются отдельно от кода приложения.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/]node_modules[\\/](framer-motion|motion-dom|motion-utils)[\\/]/.test(id)) {
            return 'animation';
          }
          if (id.includes('node_modules/@supabase/')) {
            return 'supabase';
          }
          return undefined;
        },
      },
    },
  },
});
