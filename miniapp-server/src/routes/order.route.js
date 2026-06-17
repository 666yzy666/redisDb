'use strict';

const express = require('express');
const OrderController = require('../controllers/order.controller');
const auth = require('../middlewares/auth');
const asyncHandler = require('../middlewares/asyncHandler');

const router = express.Router();

// 受保护接口：均需携带 Bearer token，订单归属当前登录用户
router.post('/', auth, asyncHandler(OrderController.createOrder));
router.get('/', auth, asyncHandler(OrderController.listOrders));
router.get('/:id', auth, asyncHandler(OrderController.getOrder));

// 状态机流转
router.post('/:id/pay', auth, asyncHandler(OrderController.pay));
router.post('/:id/ship', auth, asyncHandler(OrderController.ship));
router.post('/:id/complete', auth, asyncHandler(OrderController.complete));
router.post('/:id/cancel', auth, asyncHandler(OrderController.cancel));

module.exports = router;
