'use strict';

const { getPool } = require('../loaders/mysql');

const AnnouncementRepository = {
  async listPublished() {
    const [rows] = await getPool().query(
      'SELECT id, title, content, created_at FROM announcements WHERE published = 1 ORDER BY id DESC'
    );
    return rows;
  },

  async listAll({ limit, offset }) {
    const [rows] = await getPool().query(
      'SELECT id, title, content, published, created_at FROM announcements ORDER BY id DESC LIMIT ? OFFSET ?',
      [limit, offset]
    );
    return rows;
  },

  async countAll() {
    const [rows] = await getPool().query('SELECT COUNT(*) AS total FROM announcements');
    return rows[0].total;
  },

  async findById(id) {
    const [rows] = await getPool().execute(
      'SELECT id, title, content, published, created_at FROM announcements WHERE id = :id LIMIT 1',
      { id }
    );
    return rows[0] || null;
  },

  async create({ title, content }) {
    const [result] = await getPool().execute(
      'INSERT INTO announcements (title, content) VALUES (:title, :content)',
      { title, content }
    );
    return result.insertId;
  },

  async update(id, { title, content }) {
    await getPool().execute(
      'UPDATE announcements SET title = :title, content = :content WHERE id = :id',
      { id, title, content }
    );
  },

  async setPublished(id, published) {
    await getPool().execute(
      'UPDATE announcements SET published = :published WHERE id = :id',
      { id, published }
    );
  },

  async remove(id) {
    await getPool().execute('DELETE FROM announcements WHERE id = :id', { id });
  },
};

module.exports = AnnouncementRepository;
