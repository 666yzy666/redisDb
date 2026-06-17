'use strict';

// 统一响应体格式：{ code, message, data }
function success(res, data = null, message = 'ok') {
  return res.json({ code: 0, message, data });
}

function fail(res, statusCode, code, message) {
  return res.status(statusCode).json({ code, message, data: null });
}

module.exports = { success, fail };
