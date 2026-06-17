'use strict';

const config = require('../config');
const logger = require('../utils/logger');
const ApiError = require('../utils/ApiError');

// 调用微信 code2session，用前端传来的 code 换取 openid / session_key
// demo：未配置 appid 时返回 mock 数据，方便本地无微信账号也能跑通
async function code2session(code) {
  if (!config.wx.appid || config.wx.appid === 'your_wx_appid') {
    logger.warn('未配置微信 appid，使用 mock openid（仅用于本地 demo）');
    return { openid: `mock_openid_${code}`, sessionKey: 'mock_session_key' };
  }

  const url =
    'https://api.weixin.qq.com/sns/jscode2session' +
    `?appid=${config.wx.appid}` +
    `&secret=${config.wx.secret}` +
    `&js_code=${encodeURIComponent(code)}` +
    '&grant_type=authorization_code';

  const resp = await fetch(url);
  const data = await resp.json();

  if (data.errcode) {
    throw ApiError.badRequest(`微信登录失败: ${data.errmsg}`, 40001);
  }
  return { openid: data.openid, sessionKey: data.session_key };
}

module.exports = { code2session };
