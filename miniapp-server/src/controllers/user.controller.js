'use strict';

const UserService = require('../services/user.service');
const { success } = require('../utils/response');

// 控制器层：解析请求参数、调用 service、返回统一响应；不写业务逻辑
const UserController = {
  async login(req, res) {
    const { code } = req.body;
    const result = await UserService.login(code);
    return success(res, result, '登录成功');
  },

  async getProfile(req, res) {
    const profile = await UserService.getProfile(req.user.userId);
    return success(res, profile);
  },

  async updateProfile(req, res) {
    const { nickname, avatarUrl } = req.body;
    const profile = await UserService.updateProfile(req.user.userId, { nickname, avatarUrl });
    return success(res, profile, '更新成功');
  },

  async logout(req, res) {
    await UserService.logout(req.user.userId);
    return success(res, null, '已退出登录');
  },
};

module.exports = UserController;
