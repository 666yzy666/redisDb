'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config');
const ApiError = require('../utils/ApiError');
const UserRepository = require('../repositories/user.repository');
const wechatService = require('./wechat.service');
const { getRedis } = require('../loaders/redis');
const cache = require('../utils/cache');

const PROFILE_CACHE_TTL = 300; // 用户资料缓存 5 分钟
const SESSION_TTL = 7 * 24 * 3600; // 会话 7 天，与 JWT 过期一致

// Redis key 约定集中在此，避免散落各处拼错：
//   · session:{userId}      会话（登录态），由本层直接读写
//   · user:profile:{userId} 资料缓存，走 cache 工具的 Cache-Aside
const sessionKey = (userId) => `session:${userId}`;
const profileKey = (userId) => `user:profile:${userId}`;

// 业务逻辑层：编排 repository（MySQL）与缓存（Redis）
const UserService = {
  // 小程序登录：code -> openid -> 原子拿到/创建用户 -> 签发 JWT -> 写 Redis 会话
  async login(code) {
    if (!code) {
      throw ApiError.badRequest('缺少 code');
    }

    const { openid } = await wechatService.code2session(code);

    // 一条 upsert 原子地拿到（或创建）用户 id，再回读完整资料。
    // 并发登录也安全，不会撞唯一键。
    const userId = await UserRepository.upsertByOpenid(openid);
    const user = await UserRepository.findById(userId);

    const token = jwt.sign(
      { userId: user.id, openid: user.openid },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    // Redis 存会话，支持服务端校验/踢登录（会话直接管理，不走缓存工具）
    await getRedis().set(sessionKey(user.id), token, 'EX', SESSION_TTL);

    return { token, user };
  },

  // 读用户资料：Cache-Aside —— 命中即返回，未命中查 MySQL 回填。
  // 防穿透 / 防雪崩的细节都封在 cache.cacheAside 里。
  async getProfile(userId) {
    const profile = await cache.cacheAside(profileKey(userId), PROFILE_CACHE_TTL, () =>
      UserRepository.findById(userId)
    );
    if (!profile) {
      throw ApiError.notFound('用户不存在');
    }
    return profile;
  },

  // 更新资料：写 MySQL 后直接把最新值刷回缓存（写后刷新，下次读直接命中）
  async updateProfile(userId, { nickname, avatarUrl }) {
    const user = await UserRepository.findById(userId);
    if (!user) {
      throw ApiError.notFound('用户不存在');
    }

    const next = {
      nickname: nickname ?? user.nickname,
      avatarUrl: avatarUrl ?? user.avatar_url,
    };
    await UserRepository.updateProfile(userId, next);

    // 用已知字段拼出最新资料，省去再查一次库；同步刷新缓存。
    const updated = { ...user, nickname: next.nickname, avatar_url: next.avatarUrl };
    await cache.setJSON(profileKey(userId), updated, PROFILE_CACHE_TTL);
    return updated;
  },

  // 退出登录：删除 Redis 会话
  async logout(userId) {
    await getRedis().del(sessionKey(userId));
  },
};

module.exports = UserService;
