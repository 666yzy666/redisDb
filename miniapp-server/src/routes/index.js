'use strict';

const express = require('express');
const userRoute = require('./user.route');
const orderRoute = require('./order.route');
const OrderController = require('../controllers/order.controller');
const asyncHandler = require('../middlewares/asyncHandler');

const router = express.Router();

// 健康检查
router.get('/health', (req, res) => {
  res.json({ code: 0, message: 'ok', data: { uptime: process.uptime() } });
});

// 业务路由统一挂载在 /api 下（见 app.js）
router.use('/users', userRoute);

// 商品列表为公开接口，单独挂载（不需要登录即可浏览）
router.get('/products', asyncHandler(OrderController.listProducts));

// 订单相关（均需鉴权，见 order.route.js）
router.use('/orders', orderRoute);

module.exports = router;
