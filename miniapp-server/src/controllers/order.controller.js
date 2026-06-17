'use strict';

const OrderService = require('../services/order.service');
const { success } = require('../utils/response');

// 控制器层：解析请求、调用 service、返回统一响应；不写业务逻辑
const OrderController = {
  async listProducts(req, res) {
    const products = await OrderService.listProducts();
    return success(res, products);
  },

  async createOrder(req, res) {
    const { items } = req.body;
    const order = await OrderService.createOrder(req.user.userId, items);
    return success(res, order, '下单成功');
  },

  async listOrders(req, res) {
    const orders = await OrderService.listOrders(req.user.userId);
    return success(res, orders);
  },

  async getOrder(req, res) {
    const order = await OrderService.getOrder(req.user.userId, Number(req.params.id));
    return success(res, order);
  },

  async pay(req, res) {
    const order = await OrderService.transition(req.user.userId, Number(req.params.id), 'pay');
    return success(res, order, '支付成功');
  },

  async ship(req, res) {
    const order = await OrderService.transition(req.user.userId, Number(req.params.id), 'ship');
    return success(res, order, '已发货');
  },

  async complete(req, res) {
    const order = await OrderService.transition(req.user.userId, Number(req.params.id), 'complete');
    return success(res, order, '已完成');
  },

  async cancel(req, res) {
    const order = await OrderService.cancelOrder(req.user.userId, Number(req.params.id));
    return success(res, order, '已取消');
  },
};

module.exports = OrderController;
