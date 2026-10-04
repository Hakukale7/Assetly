import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'scanner':      ['html5-qrcode'],
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
});
