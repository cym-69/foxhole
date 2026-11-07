import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:4180', '/stream': 'http://127.0.0.1:4180' } },
  build: {
    // vendor-globe is split by layer so the heavy three.js + globe.gl
    // land in separate async chunks: 'globe' (the Globe component) is
    // only needed when Globe3D mounts and rides the lazy boundary.
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('three/examples')) return 'vendor-three-examples';
            if (id.includes('/three/') || id.endsWith('/three/index.js') || id.includes('node_modules\\\\three')) return 'vendor-three';
            if (id.includes('globe.gl') || id.includes('topojson-client') || id.includes('world-atlas')) return 'vendor-globe';
            if (id.includes('satellite.js')) return 'vendor-sats';
            if (id.includes('hls.js')) return 'vendor-hls';
            if (id.includes('framer-motion')) return 'vendor-motion';
            if (id.includes('react') || id.includes('scheduler')) return 'vendor-react';
          }
        },
      },
    },
  },
});
