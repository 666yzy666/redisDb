'use strict';

const mysql = require('mysql2/promise');
const config = require('../config');
const logger = require('../utils/logger');

// 全局单例连接池：整个进程共享一个 pool，避免频繁建连
let pool;

function createPool() {
  return mysql.createPool({
    host: config.mysql.host,
    port: config.mysql.port,
    user: config.mysql.user,
    password: config.mysql.password,
    database: config.mysql.database,
    waitForConnections: true,
    connectionLimit: config.mysql.connectionLimit,
    queueLimit: 0,
    namedPlaceholders: true,
    charset: 'utf8mb4',
  });
}

// 初始化并做一次连通性探测
async function initMysql() {
  pool = createPool();
  const conn = await pool.getConnection();
  try {
    await conn.ping();
    logger.info(`MySQL connected -> ${config.mysql.host}:${config.mysql.port}/${config.mysql.database}`);
  } finally {
    conn.release();
  }
  return pool;
}

function getPool() {
  if (!pool) {
    throw new Error('MySQL pool 未初始化，请先调用 initMysql()');
  }
  return pool;
}

// 事务助手：从连接池借一条连接，开启事务执行 fn(conn)。
// fn 内的所有 SQL 都要用同一条 conn，才会在一个事务里；
// 成功则 COMMIT，抛错则整体 ROLLBACK，最后无论成败都把连接还回池子。
// 用法：await withTransaction(async (conn) => { await conn.execute(...); ... })
async function withTransaction(fn) {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function closeMysql() {
  if (pool) {
    await pool.end();
    pool = undefined;
    logger.info('MySQL pool closed');
  }
}

module.exports = { initMysql, getPool, withTransaction, closeMysql };
