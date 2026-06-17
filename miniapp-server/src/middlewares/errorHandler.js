'use strict';

const logger = require('../utils/logger');
const { fail } = require('../utils/response');

// 404 处理
function notFoundHandler(req, res, next) {
  res.status(404).json({ code: 40400, message: `接口不存在: ${req.method} ${req.path}`, data: null });
}

// 全局错误处理：放在所有路由之后
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err && err.isApiError) {
    return fail(res, err.statusCode, err.code, err.message);
  }
  logger.error(`Unhandled error: ${err.stack || err.message}`);
  return fail(res, 500, 50000, '服务器内部错误');
}

module.exports = { notFoundHandler, errorHandler };
