'use strict';

const ApiError = require('../utils/ApiError');

// 必须在 auth 之后使用:校验当前用户是管理员
module.exports = function admin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return next(ApiError.forbidden('需要管理员权限'));
  }
  next();
};
