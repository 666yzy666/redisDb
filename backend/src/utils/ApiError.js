'use strict';

// 业务异常：携带 HTTP 状态码与业务 code，由全局错误中间件统一处理
class ApiError extends Error {
  constructor(statusCode, message, code) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code || statusCode;
    this.isApiError = true;
  }

  static badRequest(msg = '请求参数错误', code = 40000) {
    return new ApiError(400, msg, code);
  }

  static unauthorized(msg = '未授权', code = 40100) {
    return new ApiError(401, msg, code);
  }

  static notFound(msg = '资源不存在', code = 40400) {
    return new ApiError(404, msg, code);
  }

  static forbidden(msg = '无权限', code = 40300) {
    return new ApiError(403, msg, code);
  }

  static internal(msg = '服务器内部错误', code = 50000) {
    return new ApiError(500, msg, code);
  }
}

module.exports = ApiError;
