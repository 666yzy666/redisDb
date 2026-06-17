'use strict';

const express = require('express');
const UserController = require('../controllers/user.controller');
const auth = require('../middlewares/auth');
const asyncHandler = require('../middlewares/asyncHandler');

const router = express.Router();

// 公开接口：登录
router.post('/login', asyncHandler(UserController.login));

// 受保护接口：需携带 Bearer token
router.get('/profile', auth, asyncHandler(UserController.getProfile));
router.put('/profile', auth, asyncHandler(UserController.updateProfile));
router.post('/logout', auth, asyncHandler(UserController.logout));

module.exports = router;
