'use strict';

const express = require('express');
const AuthController = require('../controllers/auth.controller');
const asyncHandler = require('../middlewares/asyncHandler');

const router = express.Router();

// 邮箱认证(均为公开接口)
router.post('/send-code', asyncHandler(AuthController.sendCode));
router.post('/register', asyncHandler(AuthController.register));
router.post('/login', asyncHandler(AuthController.login));

module.exports = router;
