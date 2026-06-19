'use strict';

const config = require('./config');
const logger = require('./utils/logger');
const createApp = require('./app');
const { initMysql, closeMysql } = require('./loaders/mysql');
const { initRedis, closeRedis } = require('./loaders/redis');
const { ensureAdmin } = require('./services/bootstrap.service');

// 启动流程：先初始化基础设施（MySQL/Redis），再监听端口
async function bootstrap() {
  await initMysql();
  await initRedis();
  await ensureAdmin(); // 按 ADMIN_EMAIL/ADMIN_PASSWORD 自动建管理员(已存在则跳过)

  const app = createApp();
  const server = app.listen(config.port, () => {
    logger.info(`Server listening on http://localhost:${config.port} (env=${config.env})`);
  });

  // 优雅关闭：先停止收新请求，再关闭连接池/客户端
  async function shutdown(signal) {
    logger.warn(`收到 ${signal}，开始优雅关闭...`);
    server.close(async () => {
      await closeRedis();
      await closeMysql();
      logger.info('已优雅退出');
      process.exit(0);
    });
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  logger.error(`启动失败: ${err.stack || err.message}`);
  process.exit(1);
});
