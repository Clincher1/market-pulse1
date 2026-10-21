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
  build: {
    rollupOptions: {
      output: {
        // Выносим тяжёлые библиотеки в отдельные чанки:
        // браузер кэширует их отдельно от кода приложения,
        // а основной бандл перестаёт быть одним файлом на 800+ КБ.
        manualChunks: {
          charts: ['recharts'],
          animation: ['framer-motion'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
});
