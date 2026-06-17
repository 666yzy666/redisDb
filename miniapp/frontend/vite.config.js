import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      // 把 /api 转发到后端,避免开发期跨域
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
});
