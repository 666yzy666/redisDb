'use strict';

const express = require('express');
const PaymentOrderController = require('../controllers/paymentOrder.controller');
const auth = require('../middlewares/auth');
const asyncHandler = require('../middlewares/asyncHandler');

const router = express.Router();

// 回调:无鉴权(真实网关无 token)
router.post('/notify/:channel', asyncHandler(PaymentOrderController.notify));

// 以下均需登录
router.post('/orders', auth, asyncHandler(PaymentOrderController.create));
router.get('/orders', auth, asyncHandler(PaymentOrderController.listMine));
router.post('/orders/:id/pay', auth, asyncHandler(PaymentOrderController.pay));
router.post('/orders/:id/cancel', auth, asyncHandler(PaymentOrderController.cancel));
router.post('/mock/complete', auth, asyncHandler(PaymentOrderController.mockComplete));

module.exports = router;
