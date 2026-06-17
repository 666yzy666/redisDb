USE `miniapp`;
ALTER TABLE `users` ADD COLUMN `status` VARCHAR(16) NOT NULL DEFAULT 'active'
  COMMENT '状态: active / disabled';
