'use strict';

const express = require('express');
const SettingController = require('../controllers/setting.controller');
const asyncHandler = require('../middlewares/asyncHandler');

const router = express.Router();

// 公开:站名 + 是否开放注册
router.get('/public', asyncHandler(SettingController.getPublic));

module.exports = router;
