import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/SHOPBRAIN_AI/',
  build: {
    // ⚡ Target modern browsers for smaller, faster code
    target: 'es2020',
    // ⚡ Split vendor chunks to leverage browser caching
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'supabase': ['@supabase/supabase-js'],
        },
      },
    },
    // ⚡ Enable CSS code splitting
    cssCodeSplit: true,
    // ⚡ Use esbuild for fast minification (built-in, no extra install)
    minify: 'esbuild',
    // ⚡ Increase warning limit since we're chunking now
    chunkSizeWarningLimit: 300,
  },
  // ⚡ Faster dev server
  server: {
    warmup: {
      clientFiles: ['./src/main.jsx', './src/App.jsx', './src/Dashboard.jsx'],
    },
  },
})
