'use strict';

const { getPool } = require('../loaders/mysql');

const SettingRepository = {
  async getAll() {
    const [rows] = await getPool().query('SELECT `key`, `value` FROM settings');
    return rows;
  },

  async get(key) {
    const [rows] = await getPool().execute(
      'SELECT `key`, `value` FROM settings WHERE `key` = :key LIMIT 1',
      { key }
    );
    return rows[0] || null;
  },

  async upsert(key, value) {
    await getPool().execute(
      'INSERT INTO settings (`key`, `value`) VALUES (:key, :value) ON DUPLICATE KEY UPDATE `value` = :value',
      { key, value }
    );
  },
};

module.exports = SettingRepository;
