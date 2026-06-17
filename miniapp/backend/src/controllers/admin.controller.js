'use strict';

const AdminService = require('../services/admin.service');
const { success } = require('../utils/response');

const AdminController = {
  async listUsers(req, res) {
    const { page, pageSize, email } = req.query;
    const result = await AdminService.listUsers({ page, pageSize, email });
    return success(res, result);
  },

  async setRole(req, res) {
    const { role } = req.body;
    const user = await AdminService.setRole(req.user.userId, req.params.id, role);
    return success(res, user, '角色已更新');
  },

  async setStatus(req, res) {
    const { status } = req.body;
    const user = await AdminService.setStatus(req.user.userId, req.params.id, status);
    return success(res, user, '状态已更新');
  },

  async listOrders(req, res) {
    const { page, pageSize, status } = req.query;
    const result = await AdminService.listOrders({ page, pageSize, status });
    return success(res, result);
  },

  async getSettings(req, res) {
    const result = await AdminService.getSettings();
    return success(res, result);
  },

  async updateSettings(req, res) {
    const result = await AdminService.updateSettings(req.body);
    return success(res, result, '设置已保存');
  },
};

module.exports = AdminController;
