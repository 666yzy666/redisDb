'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config');
const ApiError = require('../utils/ApiError');
const { getRedis } = require('../loaders/redis');

// 鉴权中间件：校验 JWT，并与 Redis 中的会话比对（支持服务端踢登录）
module.exports = async function auth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
      throw ApiError.unauthorized('缺少 token');
    }

    let payload;
    try {
      payload = jwt.verify(token, config.jwt.secret);
    } catch (e) {
      throw ApiError.unauthorized('token 无效或已过期');
    }

    // 校验 Redis 会话是否仍存在（demo：登录时写入 session:{userId}）
    const redis = getRedis();
    const cachedToken = await redis.get(`session:${payload.userId}`);
    if (!cachedToken || cachedToken !== token) {
      throw ApiError.unauthorized('会话已失效，请重新登录');
    }

    req.user = { userId: payload.userId, openid: payload.openid };
    next();
  } catch (err) {
    next(err);
  }
};
