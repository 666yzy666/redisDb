# 前端镜像:直接在容器里跑 Vite 开发服务器(不走 Nginx)
# /api 由 vite.config.js 的代理转发到后端容器(target 读环境变量 VITE_PROXY_TARGET)
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 5173

# --host 让 vite 监听 0.0.0.0,容器外才能访问
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
