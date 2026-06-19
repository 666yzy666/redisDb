USE `miniapp`;
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
