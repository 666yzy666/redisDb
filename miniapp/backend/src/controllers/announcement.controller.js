'use strict';

const AnnouncementService = require('../services/announcement.service');
const { success } = require('../utils/response');

const AnnouncementController = {
  async listForUser(req, res) {
    const items = await AnnouncementService.listForUser();
    return success(res, items);
  },
  async listForAdmin(req, res) {
    const { page, pageSize } = req.query;
    const result = await AnnouncementService.listForAdmin({ page, pageSize });
    return success(res, result);
  },
  async create(req, res) {
    const { title, content } = req.body;
    const item = await AnnouncementService.create({ title, content });
    return success(res, item, '已创建');
  },
  async update(req, res) {
    const { title, content } = req.body;
    const item = await AnnouncementService.update(Number(req.params.id), { title, content });
    return success(res, item, '已更新');
  },
  async setPublished(req, res) {
    const item = await AnnouncementService.setPublished(Number(req.params.id), !!req.body.published);
    return success(res, item, '已更新发布状态');
  },
  async remove(req, res) {
    const result = await AnnouncementService.remove(Number(req.params.id));
    return success(res, result, '已删除');
  },
};

module.exports = AnnouncementController;
