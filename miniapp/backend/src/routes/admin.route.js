'use strict';

const express = require('express');
const auth = require('../middlewares/auth');
const admin = require('../middlewares/admin');
const asyncHandler = require('../middlewares/asyncHandler');
const { success } = require('../utils/response');
const AdminController = require('../controllers/admin.controller');

const router = express.Router();

// 所有 admin 接口都需登录 + 管理员
router.use(auth, admin);

// 验证后端鉴权链路
router.get('/ping', asyncHandler(async (req, res) => {
  return success(res, { admin: true, userId: req.user.userId }, 'pong');
}));

// 用户管理
router.get('/users', asyncHandler(AdminController.listUsers));
router.patch('/users/:id/role', asyncHandler(AdminController.setRole));
router.patch('/users/:id/status', asyncHandler(AdminController.setStatus));

router.get('/orders', asyncHandler(AdminController.listOrders));

router.get('/settings', asyncHandler(AdminController.getSettings));
router.put('/settings', asyncHandler(AdminController.updateSettings));

router.get('/stats', asyncHandler(AdminController.getStats));
router.get('/announcements', asyncHandler(AdminController.listAnnouncements));
router.post('/announcements', asyncHandler(AdminController.createAnnouncement));
router.put('/announcements/:id', asyncHandler(AdminController.updateAnnouncement));
router.patch('/announcements/:id/publish', asyncHandler(AdminController.setAnnouncementPublished));
router.delete('/announcements/:id', asyncHandler(AdminController.removeAnnouncement));

module.exports = router;
