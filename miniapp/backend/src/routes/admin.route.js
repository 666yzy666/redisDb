'use strict';

const express = require('express');
const auth = require('../middlewares/auth');
const admin = require('../middlewares/admin');
const asyncHandler = require('../middlewares/asyncHandler');
const { success } = require('../utils/response');

const router = express.Router();

// 仅管理员可访问;用于前端后台验证后端鉴权链路
router.get('/ping', auth, admin, asyncHandler(async (req, res) => {
  return success(res, { admin: true, userId: req.user.userId }, 'pong');
}));

module.exports = router;
