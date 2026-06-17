'use strict';

const { getPool } = require('../loaders/mysql');

// 数据访问层（DAO）：只负责 SQL，不含业务逻辑
const UserRepository = {
  async findById(id) {
    const [rows] = await getPool().execute(
      'SELECT id, openid, nickname, avatar_url, created_at FROM users WHERE id = :id LIMIT 1',
      { id }
    );
    return rows[0] || null;
  },

  // 原子「拿到或创建」：openid 不存在则插入；已存在则命中唯一键 uk_openid。
  // 关键是 ON DUPLICATE KEY UPDATE 里的 LAST_INSERT_ID(id)：它让「已存在」分支
  // 也能通过 result.insertId 拿回既有行的 id。于是一条 SQL 就解决了
  // 并发登录的竞争 —— 不会再出现两个请求都先查空、再抢 INSERT 撞唯一键报错。
  async upsertByOpenid(openid) {
    const [result] = await getPool().execute(
      'INSERT INTO users (openid) VALUES (:openid) ' +
        'ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)',
      { openid }
    );
    return result.insertId;
  },

  async updateProfile(id, { nickname, avatarUrl }) {
    await getPool().execute(
      'UPDATE users SET nickname = :nickname, avatar_url = :avatarUrl WHERE id = :id',
      { id, nickname, avatarUrl }
    );
  },
};

module.exports = UserRepository;
