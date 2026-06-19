'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');
const routes = require('./routes');
const { notFoundHandler, errorHandler } = require('./middlewares/errorHandler');

// 前端打包产物目录:Docker 镜像里把 frontend/dist 拷到 /app/public。
// 本地 npm dev 时该目录不存在 => 跳过静态托管(前端仍单独跑 Vite)。
const STATIC_DIR = process.env.STATIC_DIR || path.join(__dirname, '../public');

// 组装 Express 应用（不负责监听端口，便于测试）
function createApp() {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // 业务路由
  app.use('/api', routes);

  // 未匹配的 /api/* 一律 JSON 404(放在静态托管之前,避免被 SPA 回退吞掉)
  app.use('/api', notFoundHandler);

  // 前端静态托管 + SPA 回退(仅当打包产物存在,即生产单镜像模式)
  if (fs.existsSync(path.join(STATIC_DIR, 'index.html'))) {
    app.use(express.static(STATIC_DIR));
    // 非 /api 的其余路径都交给前端路由(history 模式)
    app.get('*', (req, res) => {
      res.sendFile(path.join(STATIC_DIR, 'index.html'));
    });
  } else {
    // 无前端产物(本地 dev):非 /api 路径也走统一 404
    app.use(notFoundHandler);
  }

  // 全局错误处理,必须放最后
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
