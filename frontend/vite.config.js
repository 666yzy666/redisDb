import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    host: true, // 监听 0.0.0.0,容器内可被外部访问
    port: 5173,
    proxy: {
      // 把 /api 转发到后端。本地 npm dev 默认走 localhost:3000;
      // 容器里通过 VITE_PROXY_TARGET=http://backend:3000 指向后端服务。
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
