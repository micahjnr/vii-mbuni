import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

// ── Auto-bump the SW cache version on every build ────────────
// Uses a timestamp so every Netlify deploy gets a unique version,
// meaning all users are forced off the old SW cache automatically.
function swVersionPlugin() {
  return {
    name: 'sw-version',
    writeBundle() {
      const version = Date.now()
      const swPath = path.resolve(__dirname, 'dist/sw.js')
      if (fs.existsSync(swPath)) {
        const content = fs.readFileSync(swPath, 'utf8')
        fs.writeFileSync(swPath, content.replace('__BUILD_VERSION__', version))
      }
    },
  }
}

export default defineConfig({
  publicDir: 'public',
  plugins: [react(), swVersionPlugin(), {
    // Vite can skip dot-directories — this ensures .well-known is always copied
    name: 'copy-well-known',
    closeBundle() {
      const src  = path.resolve(__dirname, 'public/.well-known')
      const dest = path.resolve(__dirname, 'dist/.well-known')
      if (fs.existsSync(src)) {
        fs.mkdirSync(dest, { recursive: true })
        fs.readdirSync(src).forEach(file => {
          fs.copyFileSync(path.join(src, file), path.join(dest, file))
        })
        console.log('[copy-well-known] Copied .well-known to dist/')
      }
    },
  }],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    include: ['@breezystack/lamejs'],
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 800,
    // Minify for smaller APK
    minify: 'esbuild',
    target: ['es2020', 'chrome80', 'firefox80', 'safari13'],
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('zaarDict'))                              return 'zaar-dict'
          // React ecosystem MUST all be in one chunk so useState etc
          // are guaranteed to be defined before any app code runs.
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/react-router') ||
            id.includes('node_modules/@remix-run/') ||
            id.includes('node_modules/scheduler/')
          )                                                         return 'vendor'
          if (id.includes('@supabase'))                             return 'supabase'
          if (id.includes('@tanstack'))                             return 'query'
          if (id.includes('lucide-react'))                         return 'icons'
          if (id.includes('date-fns'))                             return 'utils'
        },
      },
    },
  },
  server: {
    port: 5173,
  },
})
