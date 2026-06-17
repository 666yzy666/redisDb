'use strict';

// mock 支付渠道:本地模拟"发起支付 + 回调"。
// 真实渠道(支付宝/Stripe)实现同样的 name / createCharge / parseNotify 即可替换。
const mockChannel = {
  name: 'mock',

  // 发起支付:返回一个"模拟支付页"地址。真实渠道这里会向网关下单并返回真实支付 URL。
  async createCharge(order) {
    return { payUrl: `/payment/mock?orderNo=${order.order_no}`, channel: 'mock' };
  },

  // 解析回调:真实渠道这里要验签。mock 直接信任 body。
  parseNotify(body) {
    return { orderNo: body && body.orderNo, success: true };
  },
};

module.exports = mockChannel;
