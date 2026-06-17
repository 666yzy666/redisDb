USE `miniapp`;
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
