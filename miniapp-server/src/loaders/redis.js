'use strict';

const Redis = require('ioredis');
const config = require('../config');
const logger = require('../utils/logger');

// 全局单例 Redis 客户端
let client;

async function initRedis() {
  client = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    db: config.redis.db,
    lazyConnect: true,
    maxRetriesPerRequest: 2,
  });

  client.on('error', (err) => logger.error(`Redis error: ${err.message}`));

  await client.connect();
  await client.ping();
  logger.info(`Redis connected -> ${config.redis.host}:${config.redis.port} db=${config.redis.db}`);
  return client;
}

function getRedis() {
  if (!client) {
    throw new Error('Redis client 未初始化，请先调用 initRedis()');
  }
  return client;
}

async function closeRedis() {
  if (client) {
    await client.quit();
    client = undefined;
    logger.info('Redis client closed');
  }
}

module.exports = { initRedis, getRedis, closeRedis };
