'use strict';

const { getPool } = require('../loaders/mysql');

// 数据访问层（DAO）：只负责 SQL，不含业务逻辑
const UserRepository = {
  async findById(id) {
    const [rows] = await getPool().execute(
      'SELECT id, openid, email, role, nickname, avatar_url, created_at FROM users WHERE id = :id LIMIT 1',
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

  // 邮箱认证用：显式选取 email/password_hash(findById 没选这两列)
  async findByEmail(email) {
    const [rows] = await getPool().execute(
      'SELECT id, email, password_hash, role, nickname, avatar_url, created_at FROM users WHERE email = :email LIMIT 1',
      { email }
    );
    return rows[0] || null;
  },

  async createEmailUser({ email, passwordHash, nickname }) {
    const [result] = await getPool().execute(
      'INSERT INTO users (email, password_hash, nickname) VALUES (:email, :passwordHash, :nickname)',
      { email, passwordHash, nickname: nickname || '' }
    );
    return result.insertId;
  },

  async updatePassword(id, passwordHash) {
    await getPool().execute(
      'UPDATE users SET password_hash = :passwordHash WHERE id = :id',
      { id, passwordHash }
    );
  },

  // 用户列表(邮箱模糊搜索 + 分页)。email 为空则不过滤。
  async listUsers({ email, limit, offset }) {
    const where = email ? 'WHERE email LIKE ?' : '';
    const params = email ? [`%${email}%`, limit, offset] : [limit, offset];
    const [rows] = await getPool().query(
      `SELECT id, email, role, status, nickname, created_at FROM users ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
      params
    );
    return rows;
  },

  async countUsers({ email }) {
    const where = email ? 'WHERE email LIKE ?' : '';
    const params = email ? [`%${email}%`] : [];
    const [rows] = await getPool().query(
      `SELECT COUNT(*) AS total FROM users ${where}`,
      params
    );
    return rows[0].total;
  },

  async updateRole(id, role) {
    await getPool().execute('UPDATE users SET role = :role WHERE id = :id', { id, role });
  },

  async updateStatus(id, status) {
    await getPool().execute('UPDATE users SET status = :status WHERE id = :id', { id, status });
  },
};

module.exports = UserRepository;
