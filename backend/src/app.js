'use strict';

const express = require('express');
const routes = require('./routes');
const { notFoundHandler, errorHandler } = require('./middlewares/errorHandler');

// 组装 Express 应用（不负责监听端口，便于测试）
function createApp() {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // 业务路由
  app.use('/api', routes);

  // 兜底：404 与全局错误处理，必须放最后
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
