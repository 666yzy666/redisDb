USE `miniapp`;
ALTER TABLE `users` ADD COLUMN `role` VARCHAR(16) NOT NULL DEFAULT 'user'
  COMMENT '角色: user / admin';
