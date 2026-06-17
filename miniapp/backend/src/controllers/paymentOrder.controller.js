'use strict';

const PaymentOrderService = require('../services/paymentOrder.service');
const PaymentService = require('../services/payment.service');
const { success } = require('../utils/response');

const PaymentOrderController = {
  async create(req, res) {
    const { amount, subject } = req.body;
    const order = await PaymentOrderService.createOrder(req.user.userId, { amount, subject });
    return success(res, order, '下单成功');
  },

  async listMine(req, res) {
    const orders = await PaymentOrderService.listMyOrders(req.user.userId);
    return success(res, orders);
  },

  async pay(req, res) {
    const result = await PaymentService.pay(req.user.userId, Number(req.params.id));
    return success(res, result, '发起支付');
  },

  async cancel(req, res) {
    const order = await PaymentOrderService.cancelOrder(req.user.userId, Number(req.params.id));
    return success(res, order, '已取消');
  },

  async notify(req, res) {
    const result = await PaymentService.handleNotify(req.params.channel, req.body);
    return success(res, result);
  },

  async mockComplete(req, res) {
    const result = await PaymentService.handleNotify('mock', { orderNo: req.body.orderNo });
    return success(res, result, '模拟支付完成');
  },
};

module.exports = PaymentOrderController;
