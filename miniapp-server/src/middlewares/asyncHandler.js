'use strict';

// 包裹 async 控制器，自动把 reject 转发给 Express 错误中间件
// 省去每个 controller 写 try/catch
module.exports = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
