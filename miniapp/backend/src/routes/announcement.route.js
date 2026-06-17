'use strict';

const express = require('express');
const AnnouncementController = require('../controllers/announcement.controller');
const auth = require('../middlewares/auth');
const asyncHandler = require('../middlewares/asyncHandler');

const router = express.Router();

// 登录用户:查看已发布公告
router.get('/', auth, asyncHandler(AnnouncementController.listForUser));

module.exports = router;
