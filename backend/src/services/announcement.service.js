'use strict';

const ApiError = require('../utils/ApiError');
const AnnouncementRepository = require('../repositories/announcement.repository');

const MAX_PAGE_SIZE = 100;

function assertFields({ title, content }) {
  if (!title || !String(title).trim()) throw ApiError.badRequest('标题不能为空');
  if (!content || !String(content).trim()) throw ApiError.badRequest('内容不能为空');
}

const AnnouncementService = {
  async listForUser() {
    return AnnouncementRepository.listPublished();
  },

  async listForAdmin({ page, pageSize }) {
    const p = Math.max(1, Number(page) || 1);
    const size = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(pageSize) || 20));
    const offset = (p - 1) * size;
    const [items, total] = await Promise.all([
      AnnouncementRepository.listAll({ limit: size, offset }),
      AnnouncementRepository.countAll(),
    ]);
    return { items, total, page: p, pageSize: size };
  },

  async create({ title, content }) {
    assertFields({ title, content });
    const id = await AnnouncementRepository.create({
      title: String(title).trim(),
      content: String(content).trim(),
    });
    return AnnouncementRepository.findById(id);
  },

  async update(id, { title, content }) {
    assertFields({ title, content });
    const found = await AnnouncementRepository.findById(id);
    if (!found) throw ApiError.notFound('公告不存在');
    await AnnouncementRepository.update(id, {
      title: String(title).trim(),
      content: String(content).trim(),
    });
    return AnnouncementRepository.findById(id);
  },

  async setPublished(id, published) {
    const found = await AnnouncementRepository.findById(id);
    if (!found) throw ApiError.notFound('公告不存在');
    await AnnouncementRepository.setPublished(id, published ? 1 : 0);
    return AnnouncementRepository.findById(id);
  },

  async remove(id) {
    const found = await AnnouncementRepository.findById(id);
    if (!found) throw ApiError.notFound('公告不存在');
    await AnnouncementRepository.remove(id);
    return { removed: true };
  },
};

module.exports = AnnouncementService;
