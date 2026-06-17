'use strict';

const ApiError = require('../utils/ApiError');
const UserRepository = require('../repositories/user.repository');
const { getRedis } = require('../loaders/redis');

const MAX_PAGE_SIZE = 100;
const sessionKey = (userId) => `session:${userId}`;

// 只暴露安全字段
function toSafe(u) {
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    status: u.status,
    nickname: u.nickname,
    created_at: u.created_at,
  };
}

const AdminService = {
  // 用户列表:分页 + 邮箱模糊搜索
  async listUsers({ page, pageSize, email }) {
    const p = Math.max(1, Number(page) || 1);
    const size = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(pageSize) || 20));
    const offset = (p - 1) * size;
    const trimmed = (email || '').trim();

    const [items, total] = await Promise.all([
      UserRepository.listUsers({ email: trimmed, limit: size, offset }),
      UserRepository.countUsers({ email: trimmed }),
    ]);
    return { items, total, page: p, pageSize: size };
  },

  // 改角色;不能改自己
  async setRole(currentUserId, targetId, role) {
    if (role !== 'user' && role !== 'admin') {
      throw ApiError.badRequest('role 必须是 user 或 admin');
    }
    if (Number(targetId) === Number(currentUserId)) {
      throw ApiError.badRequest('不能修改自己的角色');
    }
    const user = await UserRepository.findById(targetId);
    if (!user) throw ApiError.notFound('用户不存在');

    await UserRepository.updateRole(targetId, role);
    return toSafe({ ...user, role });
  },

  // 改状态;不能禁用自己;禁用时踢下线(删会话)
  async setStatus(currentUserId, targetId, status) {
    if (status !== 'active' && status !== 'disabled') {
      throw ApiError.badRequest('status 必须是 active 或 disabled');
    }
    if (Number(targetId) === Number(currentUserId)) {
      throw ApiError.badRequest('不能禁用自己');
    }
    const user = await UserRepository.findById(targetId);
    if (!user) throw ApiError.notFound('用户不存在');

    await UserRepository.updateStatus(targetId, status);
    if (status === 'disabled') {
      await getRedis().del(sessionKey(targetId)); // 立即踢下线
    }
    return toSafe({ ...user, status });
  },
};

module.exports = AdminService;
