import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [vue(), vueDevTools(), tailwindcss()],

  root: 'src/client',
  resolve: {
    alias: {
      '@': resolve(__dirname, './src/client'),
    },
  },

  build: {
    emptyOutDir: true,
    outDir: '../../dist/client',
  },
})
