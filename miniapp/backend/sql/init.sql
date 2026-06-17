-- 初始化数据库与表
-- 用法: mysql -u root -p < sql/init.sql

CREATE DATABASE IF NOT EXISTS `miniapp`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `miniapp`;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='小程序用户表';

-- ===== 电商订单模块 =====

-- 商品表
CREATE TABLE IF NOT EXISTS `products` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`       VARCHAR(128)    NOT NULL COMMENT '商品名',
  `price`      DECIMAL(10,2)   NOT NULL COMMENT '单价（元）',
  `stock`      INT UNSIGNED    NOT NULL DEFAULT 0 COMMENT '库存',
  `created_at` TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商品表';

-- 订单表：status 是状态机的核心字段
CREATE TABLE IF NOT EXISTS `orders` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`      BIGINT UNSIGNED NOT NULL COMMENT '下单用户',
  `status`       VARCHAR(16)     NOT NULL DEFAULT 'pending'
                 COMMENT '状态: pending/paid/shipped/completed/cancelled',
  `total_amount` DECIMAL(10,2)   NOT NULL DEFAULT 0 COMMENT '订单总额（下单时快照）',
  `created_at`   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user` (`user_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单表';

-- 订单明细表：下单时快照商品名与价格，商品后续改价不影响历史订单
CREATE TABLE IF NOT EXISTS `order_items` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_id`     BIGINT UNSIGNED NOT NULL,
  `product_id`   BIGINT UNSIGNED NOT NULL,
  `product_name` VARCHAR(128)    NOT NULL COMMENT '下单时的商品名快照',
  `price`        DECIMAL(10,2)   NOT NULL COMMENT '下单时的单价快照',
  `quantity`     INT UNSIGNED    NOT NULL COMMENT '购买数量',
  PRIMARY KEY (`id`),
  KEY `idx_order` (`order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单明细表';

-- 种几条商品，方便直接下单
INSERT INTO `products` (`name`, `price`, `stock`) VALUES
  ('机械键盘', 299.00, 100),
  ('无线鼠标', 99.00, 200),
  ('USB-C 数据线', 29.90, 500)
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

-- ===== 框架付款订单 =====
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='付款订单(框架通用)';

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
