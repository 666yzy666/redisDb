-- 让微信字段可空,新增邮箱与密码哈希列
-- 用法: docker exec -i backend-mysql mysql -uroot -p123456 < 001_add_email_auth.sql
USE `miniapp`;
ALTER TABLE `users`
  MODIFY COLUMN `openid` VARCHAR(64) NULL COMMENT '微信 openid(邮箱用户为空)',
  ADD COLUMN `email`         VARCHAR(255) NULL COMMENT '登录邮箱',
  ADD COLUMN `password_hash` VARCHAR(255) NULL COMMENT 'bcrypt 哈希后的密码',
  ADD UNIQUE KEY `uk_email` (`email`);
