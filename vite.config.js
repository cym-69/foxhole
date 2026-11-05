import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:4180' } },
  build: {
    // vendor-globe (three.js ~1.9 MB) is fully lazy via Globe3D — it never rides the first paint.
    // The warning would otherwise be a false alarm, so we keep the honest threshold.
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('globe.gl') || id.includes('topojson-client') || id.includes('world-atlas')) return 'vendor-globe';
            if (id.includes('satellite.js')) return 'vendor-sats';
            if (id.includes('framer-motion')) return 'vendor-motion';
            if (id.includes('react') || id.includes('scheduler')) return 'vendor-react';
          }
        },
      },
    },
  },
});
