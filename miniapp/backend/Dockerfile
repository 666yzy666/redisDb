# 后端镜像:Node 跑 Express(src/server.js)
FROM node:20-alpine

WORKDIR /app

# 先装依赖(利用层缓存:package*.json 没变就不重装)
COPY package*.json ./
RUN npm ci --omit=dev

# 再拷源码与 SQL
COPY src ./src
COPY sql ./sql

EXPOSE 3000

CMD ["node", "src/server.js"]
