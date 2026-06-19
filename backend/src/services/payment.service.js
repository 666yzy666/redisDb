'use strict';

const ApiError = require('../utils/ApiError');
const { getChannel } = require('./payment');
const PaymentOrderService = require('./paymentOrder.service');

const DEFAULT_CHANNEL = 'mock';

const PaymentService = {
  async pay(userId, orderId) {
    const order = await PaymentOrderService.getOwnedOrder(userId, orderId);
    if (order.status !== 'pending') {
      throw ApiError.badRequest('订单状态不可支付');
    }
    const channel = getChannel(DEFAULT_CHANNEL);
    const charge = await channel.createCharge(order);
    return { ...charge, orderNo: order.order_no };
  },

  async handleNotify(channelName, body) {
    const channel = getChannel(channelName);
    const { orderNo, success } = channel.parseNotify(body);
    if (!orderNo) throw ApiError.badRequest('回调缺少 orderNo');
    if (success) {
      await PaymentOrderService.markPaidByNo(orderNo, channelName);
    }
    return { ok: true };
  },
};

module.exports = PaymentService;
