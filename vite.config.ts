import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern-compiler', // legacy-js-api 경고 제거
        silenceDeprecations: ['legacy-js-api']
      }
    }
  },
  server: {
    port: 3000
    // proxy 설정 제거됨 - API Gateway(localhost:9000)를 통해 직접 연결
  },
  optimizeDeps: {
    include: ['monaco-editor']
  }
})
