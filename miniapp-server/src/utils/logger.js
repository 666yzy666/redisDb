'use strict';

// 极简日志封装：demo 用 console，生产可替换为 pino / winston
function ts() {
  return new Date().toISOString();
}

module.exports = {
  info: (msg) => console.log(`[${ts()}] [INFO] ${msg}`),
  warn: (msg) => console.warn(`[${ts()}] [WARN] ${msg}`),
  error: (msg) => console.error(`[${ts()}] [ERROR] ${msg}`),
};
