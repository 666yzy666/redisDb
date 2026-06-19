-- 初始化数据库与表(Go 版框架:邮箱认证 + 用户管理 + 付款订单 + 后台公告/设置)
-- docker-compose 把本文件挂到 mysql 的 /docker-entrypoint-initdb.d/,容器首启自动执行。
-- 手动执行: mysql -u root -p < sql/init.sql

-- 确保本会话用 utf8mb4,否则容器初始化时中文(如 'MiniApp 框架')会被
-- 按 latin1 重新编码,存成乱码(双重编码)。
SET NAMES utf8mb4;

CREATE DATABASE IF NOT EXISTS `miniapp`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `miniapp`;

-- ===== 用户 =====
CREATE TABLE IF NOT EXISTS `users` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `openid`        VARCHAR(64)  NULL COMMENT '微信 openid(邮箱用户为空)',
  `email`         VARCHAR(255) NULL COMMENT '登录邮箱',
  `password_hash` VARCHAR(255) NULL COMMENT 'bcrypt 哈希后的密码',
  `nickname`      VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '昵称',
  `avatar_url`    VARCHAR(512) NOT NULL DEFAULT '' COMMENT '头像 URL',
  `role`          VARCHAR(16)  NOT NULL DEFAULT 'user' COMMENT '角色: user / admin',
  `status`        VARCHAR(16)  NOT NULL DEFAULT 'active' COMMENT '状态: active / disabled',
  `created_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_openid` (`openid`),
  UNIQUE KEY `uk_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表';

-- ===== 付款订单 =====
CREATE TABLE IF NOT EXISTS `payment_orders` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_no`   VARCHAR(64)     NOT NULL COMMENT '业务订单号,支付回调对账用',
  `user_id`    BIGINT UNSIGNED NOT NULL COMMENT '下单用户',
  `amount`     DECIMAL(10,2)   NOT NULL COMMENT '金额(元)',
  `subject`    VARCHAR(255)    NOT NULL COMMENT '订单标题/描述',
  `status`     VARCHAR(16)     NOT NULL DEFAULT 'pending' COMMENT 'pending/paid/cancelled',
  `channel`    VARCHAR(32)     NULL COMMENT '支付渠道,如 mock',
  `paid_at`    TIMESTAMP       NULL COMMENT '支付完成时间',
  `created_at` TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_order_no` (`order_no`),
  KEY `idx_user` (`user_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='付款订单';

-- ===== 后台基础:公告 + 设置 =====
CREATE TABLE IF NOT EXISTS `announcements` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `title`      VARCHAR(255) NOT NULL COMMENT '公告标题',
  `content`    TEXT         NOT NULL COMMENT '公告内容(纯文本)',
  `published`  TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '0草稿 / 1已发布',
  `created_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_published` (`published`, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='公告';

CREATE TABLE IF NOT EXISTS `settings` (
  `key`        VARCHAR(64)  NOT NULL COMMENT '设置键',
  `value`      VARCHAR(512) NOT NULL DEFAULT '' COMMENT '设置值(字符串)',
  `updated_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统设置(键值)';

INSERT INTO `settings` (`key`, `value`) VALUES
  ('site_name', 'MiniApp 框架'),
  ('registration_open', '1')
ON DUPLICATE KEY UPDATE `key` = `key`;
