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

  async listAnnouncements(req, res) {
    const result = await AdminService.listAnnouncements(req.query);
    return success(res, result);
  },
  async createAnnouncement(req, res) {
    const item = await AdminService.createAnnouncement(req.body);
    return success(res, item, '已创建');
  },
  async updateAnnouncement(req, res) {
    const item = await AdminService.updateAnnouncement(Number(req.params.id), req.body);
    return success(res, item, '已更新');
  },
  async setAnnouncementPublished(req, res) {
    const item = await AdminService.setAnnouncementPublished(Number(req.params.id), !!req.body.published);
    return success(res, item, '已更新发布状态');
  },
  async removeAnnouncement(req, res) {
    const result = await AdminService.removeAnnouncement(Number(req.params.id));
    return success(res, result, '已删除');
  },
  async getStats(req, res) {
    const result = await AdminService.getStats();
    return success(res, result);
  },
};

module.exports = AdminController;
