import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    // React + Remotion ship as one ~450 kB vendor bundle (≈140 kB gzipped)
    chunkSizeWarningLimit: 900
  }
});
