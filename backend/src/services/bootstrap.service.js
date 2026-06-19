'use strict';

const bcrypt = require('bcryptjs');
const config = require('../config');
const logger = require('../utils/logger');
const UserRepository = require('../repositories/user.repository');

// 首次启动按环境变量自动创建管理员(AUTO_SETUP 风格)。
// 仅当 ADMIN_EMAIL 与 ADMIN_PASSWORD 都已配置,且该邮箱尚不存在时才创建。
// 已存在则跳过(不改密码、不改角色),保证幂等、可重启。
async function ensureAdmin() {
  const { email, password } = config.admin;
  if (!email || !password) return; // 未配置 => 不做任何事

  const existing = await UserRepository.findByEmail(email);
  if (existing) {
    logger.info(`管理员 ${email} 已存在,跳过自动创建`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const id = await UserRepository.createEmailUser({ email, passwordHash, nickname: 'admin' });
  await UserRepository.updateRole(id, 'admin');
  logger.info(`已自动创建管理员: ${email}`);
}

module.exports = { ensureAdmin };
