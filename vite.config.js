import { fileURLToPath, URL } from 'node:url'
import { resolve } from 'path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig(({ command }) => {
  const config = {
    plugins: [
      vue(),
      vueDevTools(),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        'vue-key-mgr': resolve(__dirname, 'src/lib/index.js')
      },
    },
  }

  if (command === 'build') {
    config.build = {
      lib: {
        entry: resolve(__dirname, 'src/lib/index.js'),
        name: 'VueKeyMgr',
        fileName: (format) => `vue-key-mgr.${format}.js`,
      },
      rollupOptions: {
        external: ['vue'],
        output: {
          globals: {
            vue: 'Vue',
          },
        },
      },
    }
  }

  return config
})
