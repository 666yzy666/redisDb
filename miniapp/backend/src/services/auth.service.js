'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const UserRepository = require('../repositories/user.repository');
const emailService = require('./email.service');
const { getRedis } = require('../loaders/redis');

const SESSION_TTL = 7 * 24 * 3600;

const codeKey = (email) => `verify:register:${email}`;
const cooldownKey = (email) => `verify:cooldown:${email}`;
const sessionKey = (userId) => `session:${userId}`;
const resetCodeKey = (email) => `verify:reset:${email}`;
const resetCdKey = (email) => `verify:reset-cd:${email}`;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function assertEmail(email) {
  if (!email || !EMAIL_RE.test(email)) throw ApiError.badRequest('邮箱格式不正确');
}
function assertPassword(password) {
  if (!password || password.length < 6) throw ApiError.badRequest('密码至少 6 位');
}

// 生成 6 位数字验证码(用 crypto 保证随机性)
function genCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

// 签发 JWT + 写 Redis 会话,返回 { token, user }(去掉密码哈希)
async function issueSession(user) {
  const token = jwt.sign({ userId: user.id, email: user.email, role: user.role }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
  await getRedis().set(sessionKey(user.id), token, 'EX', SESSION_TTL);
  const safeUser = {
    id: user.id,
    email: user.email,
    role: user.role,
    nickname: user.nickname,
    avatar_url: user.avatar_url,
    created_at: user.created_at,
  };
  return { token, user: safeUser };
}

const AuthService = {
  // 发送注册验证码
  async sendRegisterCode(email) {
    assertEmail(email);
    const redis = getRedis();

    if (await redis.get(cooldownKey(email))) {
      throw ApiError.badRequest('验证码发送过于频繁,请稍后再试', 42900);
    }
    const code = genCode();
    await redis.set(codeKey(email), code, 'EX', config.verify.codeTtl);
    await redis.set(cooldownKey(email), '1', 'EX', config.verify.cooldown);

    await emailService.sendMail(
      email,
      '注册验证码',
      `您的验证码是 ${code},${Math.floor(config.verify.codeTtl / 60)} 分钟内有效。`
    );
    logger.info(`已为 ${email} 生成注册验证码`);

    // dev 模式把 code 一并返回,方便本地无邮箱调试
    return config.env === 'development' ? { sent: true, code } : { sent: true };
  },

  // 注册:校验验证码 → 哈希密码 → 入库 → 注册即登录
  async register(email, password, code) {
    assertEmail(email);
    assertPassword(password);
    if (!code) throw ApiError.badRequest('请输入验证码');

    const redis = getRedis();
    const real = await redis.get(codeKey(email));
    if (!real || real !== String(code)) {
      throw ApiError.badRequest('验证码错误或已过期', 40010);
    }

    if (await UserRepository.findByEmail(email)) {
      throw ApiError.badRequest('该邮箱已注册', 40011);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await UserRepository.createEmailUser({ email, passwordHash });
    await redis.del(codeKey(email));

    const user = await UserRepository.findByEmail(email);
    return issueSession(user);
  },

  // 邮箱密码登录
  async login(email, password) {
    assertEmail(email);
    assertPassword(password);

    const user = await UserRepository.findByEmail(email);
    // 统一提示,不泄露账号是否存在
    if (!user || !user.password_hash) throw ApiError.unauthorized('邮箱或密码错误');
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) throw ApiError.unauthorized('邮箱或密码错误');

    return issueSession(user);
  },

  // 发送重置密码验证码(账号不存在时静默,不泄露)
  async sendResetCode(email) {
    assertEmail(email);
    const redis = getRedis();
    if (await redis.get(resetCdKey(email))) {
      throw ApiError.badRequest('验证码发送过于频繁,请稍后再试', 42900);
    }
    const user = await UserRepository.findByEmail(email);
    if (user) {
      const code = genCode();
      await redis.set(resetCodeKey(email), code, 'EX', config.verify.codeTtl);
      await redis.set(resetCdKey(email), '1', 'EX', config.verify.cooldown);
      await emailService.sendMail(
        email,
        '重置密码验证码',
        `您的重置验证码是 ${code},${Math.floor(config.verify.codeTtl / 60)} 分钟内有效。`
      );
      logger.info(`已为 ${email} 生成重置验证码`);
      return config.env === 'development' ? { sent: true, code } : { sent: true };
    }
    return { sent: true };
  },

  // 用验证码重置密码
  async resetPassword(email, code, password) {
    assertEmail(email);
    assertPassword(password);
    if (!code) throw ApiError.badRequest('请输入验证码');

    const redis = getRedis();
    const real = await redis.get(resetCodeKey(email));
    if (!real || real !== String(code)) {
      throw ApiError.badRequest('验证码错误或已过期', 40010);
    }
    const user = await UserRepository.findByEmail(email);
    if (!user) throw ApiError.badRequest('账号不存在', 40012);

    const passwordHash = await bcrypt.hash(password, 10);
    await UserRepository.updatePassword(user.id, passwordHash);
    await redis.del(resetCodeKey(email));
    return { reset: true };
  },
};

module.exports = AuthService;
