'use strict';

const crypto = require('crypto');
const ApiError = require('../utils/ApiError');
const PaymentOrderRepository = require('../repositories/paymentOrder.repository');

const MAX_PAGE_SIZE = 100;

// 生成业务订单号:时间 + 随机(crypto),够唯一
function genOrderNo() {
  const ts = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const rand = crypto.randomBytes(4).toString('hex');
  return `PO${ts}${rand}`;
}

const PaymentOrderService = {
  async createOrder(userId, { amount, subject }) {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      throw ApiError.badRequest('金额必须大于 0');
    }
    if (!subject || !String(subject).trim()) {
      throw ApiError.badRequest('订单标题不能为空');
    }
    const orderNo = genOrderNo();
    const id = await PaymentOrderRepository.create({
      orderNo,
      userId,
      amount: Number(amt.toFixed(2)),
      subject: String(subject).trim(),
    });
    return PaymentOrderRepository.findById(id);
  },

  async listMyOrders(userId) {
    return PaymentOrderRepository.listByUser(userId);
  },

  // 取订单并校验归属;不存在或越权统一按"不存在"
  async getOwnedOrder(userId, id) {
    const order = await PaymentOrderRepository.findById(id);
    if (!order || String(order.user_id) !== String(userId)) {
      throw ApiError.notFound('订单不存在');
    }
    return order;
  },

  async cancelOrder(userId, id) {
    await this.getOwnedOrder(userId, id);
    const affected = await PaymentOrderRepository.markCancelled(id);
    if (!affected) throw ApiError.badRequest('订单状态已变化,无法取消', 40903);
    return PaymentOrderRepository.findById(id);
  },

  // 按订单号置为已支付(幂等:已处理则直接返回)
  async markPaidByNo(orderNo, channel) {
    const order = await PaymentOrderRepository.findByNo(orderNo);
    if (!order) throw ApiError.notFound('订单不存在');
    await PaymentOrderRepository.markPaid(order.id, channel);
    return PaymentOrderRepository.findById(order.id);
  },

  async listAllForAdmin({ page, pageSize, status }) {
    const p = Math.max(1, Number(page) || 1);
    const size = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(pageSize) || 20));
    const offset = (p - 1) * size;
    const st = status === 'pending' || status === 'paid' || status === 'cancelled' ? status : '';
    const [items, total] = await Promise.all([
      PaymentOrderRepository.listAll({ status: st, limit: size, offset }),
      PaymentOrderRepository.countAll({ status: st }),
    ]);
    return { items, total, page: p, pageSize: size };
  },
};

module.exports = PaymentOrderService;
