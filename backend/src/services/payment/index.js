'use strict';

const ApiError = require('../../utils/ApiError');
const mockChannel = require('./channels/mock.channel');

// 渠道注册表:新增真实渠道时,在此登记即可
const channels = {
  [mockChannel.name]: mockChannel,
};

function getChannel(name) {
  const ch = channels[name];
  if (!ch) throw ApiError.badRequest(`未知支付渠道: ${name}`);
  return ch;
}

module.exports = { getChannel };
