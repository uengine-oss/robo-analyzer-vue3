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
    port: 3000,
    proxy: {
      // ANTLR Server - 파일 업로드, 파싱
      '/antlr': {
        target: 'http://127.0.0.1:8081',
        changeOrigin: true
      },
      // ROBO Analyzer - 소스 분석, 그래프 생성
      '/robo': {
        target: 'http://127.0.0.1:5502',
        changeOrigin: true
      },
      // Text2SQL API - 테이블 조회, ingest, ReAct
      '/text2sql': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true
      }
    }
  },
  optimizeDeps: {
    include: ['monaco-editor']
  }
})

