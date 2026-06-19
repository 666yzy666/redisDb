# 设计文档:SP3 — 付款订单 + 支付渠道抽象

- 日期:2026-06-18
- 所属:通用前后端框架的第三个子项目
- 前置:SP1(角色/双布局/守卫)、SP2(后台用户管理)已完成

## 1. 目标与非目标

**目标:** 给框架一个业务无关、可插拔支付的"下单付款"核心:
- 用户下单(金额 + 标题)→ 发起支付 → 支付回调 → 订单转 paid
- 支付渠道抽象:本期只实现 mock 渠道,但接口形状贴近真实(以后接支付宝/Stripe 只需新增一个 channel 文件)
- 我的订单列表(用户端)、取消订单(pending→cancelled)
- 后台订单管理(admin 看所有订单,复用 SP2 的 admin 布局/模式)

**非目标(YAGNI):**
- 真实支付渠道(支付宝/Stripe/微信)接入
- 退款、对账报表、优惠券、订单超时自动取消
- 与现有电商订单模块(products/stock/order_items)的整合 —— 本期不碰,二者并存
- 自动化测试(本期手动冒烟)

## 2. 数据模型

新增迁移 `backend/sql/migrations/004_payment_orders.sql`(电商 orders 表不动):
```sql
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
```
`init.sql` 同步追加该表(放在文件末尾的独立段落,不影响已有表)。

## 3. 支付渠道抽象(可插拔)

```
backend/src/services/payment/
├── channels/mock.channel.js   mock 渠道实现
└── index.js                   渠道注册表
```

**渠道接口**(每个渠道实现这两个方法):
- `name` —— 渠道标识(如 'mock')
- `createCharge(order)` —— 发起支付。返回 `{ payUrl }`。mock 返回指向"模拟支付"的标记/地址。
- `parseNotify(body)` —— 解析网关回调,返回 `{ orderNo, success }`。mock 直接信任 body(`{ orderNo }` → success=true)。

**注册表 `index.js`:** `getChannel(name)` 返回对应渠道;未知渠道抛 400。当前注册 `{ mock }`。新增真实渠道:写 `alipay.channel.js` 实现同接口 → 注册进表,其余代码不变。

## 4. 后端设计(分层;命名避开电商 order.*)

### 4.1 文件
- `repositories/paymentOrder.repository.js`:
  - `create({ orderNo, userId, amount, subject })` → insertId
  - `findById(id)` / `findByNo(orderNo)` → 行或 null
  - `listByUser(userId)` → 该用户订单(id DESC)
  - `listAll({ status, limit, offset })` / `countAll({ status })` → 后台分页(status 可选过滤)
  - `markPaid(id, channel)` → 守卫式 `UPDATE ... SET status='paid', channel=:channel, paid_at=NOW() WHERE id=:id AND status='pending'`,返回 affectedRows(幂等关键)
  - `markCancelled(id)` → 守卫式 `UPDATE ... SET status='cancelled' WHERE id=:id AND status='pending'`,返回 affectedRows
- `services/paymentOrder.service.js`:
  - `createOrder(userId, { amount, subject })` —— 校验 amount>0、subject 非空;生成 order_no;入库;返回订单
  - `listMyOrders(userId)`
  - `getOwnedOrder(userId, id)` —— 取并校验归属,不存在/越权统一 404
  - `cancelOrder(userId, id)` —— 校验归属 + markCancelled;affectedRows=0 → 400「订单状态已变化」
  - `markPaidByNo(orderNo, channel)` —— findByNo → markPaid(幂等:affectedRows=0 视为已处理,直接返回)
  - `listAllForAdmin({ page, pageSize, status })` —— 分页(同 SP2 风格,pageSize 上限 100)
- `services/payment.service.js`:
  - `pay(userId, orderId)` —— getOwnedOrder;非 pending → 400;选 mock 渠道;`channel.createCharge(order)` → 返回 `{ payUrl, channel: 'mock', orderNo }`
  - `handleNotify(channelName, body)` —— getChannel→parseNotify→若 success 则 `paymentOrderService.markPaidByNo(orderNo, channelName)`;返回 `{ ok: true }`
- `controllers/paymentOrder.controller.js` + `routes/payment.route.js`

### 4.2 路由(挂 `/api/payment`)
| 方法/路径 | 鉴权 | 作用 |
|------|------|------|
| `POST /payment/orders` | auth | 下单 `{amount, subject}` → 返回 pending 订单 |
| `GET /payment/orders` | auth | 我的订单列表 |
| `POST /payment/orders/:id/pay` | auth | 发起支付 → `{ payUrl, orderNo, channel }` |
| `POST /payment/orders/:id/cancel` | auth | 取消(仅 pending、仅本人) |
| `POST /payment/notify/:channel` | 无 | 支付网关回调 → markPaid(幂等) |
| `POST /payment/mock/complete` | auth | 模拟网关:body `{orderNo}` → 内部走 `handleNotify('mock', {orderNo})` |

后台订单管理接口加到现有 admin 路由:
| `GET /api/admin/orders?page=&pageSize=&status=` | auth+admin | 所有订单分页(status 可选) |

说明:
- **幂等**:notify/mock-complete 多次触发只第一次生效(守卫式 UPDATE 的 affectedRows)。
- `/payment/notify/:channel` 不加鉴权(真实网关无 token);mock 本地够用,真实渠道需在 parseNotify 里验签(本期不做,留注释)。
- `mock/complete` 是本地替代真实支付页的便捷入口;它复用 `handleNotify`,保证走的是和真实回调同一条代码路径。

## 5. 前端设计

- `api/payment.js`:`createOrder({amount,subject})`、`listMyOrders()`、`payOrder(id)`、`cancelOrder(id)`、`mockComplete(orderNo)`;`api/admin.js` 加 `listOrders(params)`(→ `/admin/orders`)
- `views/user/OrdersView.vue`(前台,DefaultLayout):
  - 顶部下单表单:金额 + 标题 → 提交创建
  - 我的订单表格:订单号、标题、金额、状态、时间、操作
  - 操作:pending → 「去支付」(调 pay,mock 下弹"模拟支付"按钮 → 调 mockComplete → 刷新)、「取消」;paid/cancelled 无操作
- `views/admin/OrdersView.vue`(后台,AdminLayout):所有订单表格 + 状态筛选 + 分页(同 UsersView 风格)
- 路由:`/orders` 加到 `/`(DefaultLayout)children;`/admin/orders` 加到 `/admin` children
- 入口:DefaultLayout 顶栏加「我的订单」→ `/orders`;AdminLayout 侧边栏加「订单管理」→ `/admin/orders`
- 当前用户/角色取自 `useAuthStore()`

## 6. 验收标准(手动冒烟)

1. 跑迁移 004,`payment_orders` 表存在。
2. 用户下单(amount=9.9, subject="测试") → 返回 pending 订单,带 order_no。
3. 发起支付 → 返回 payUrl/orderNo;调 mock/complete → 订单转 paid,paid_at 有值。
4. 幂等:再调一次 mock/complete(同 order_no)→ 不报错、订单仍 paid(不重复)。
5. 我的订单列表只显示本人订单。
6. 取消一个 pending 订单 → 转 cancelled;已 paid 的订单取消 → 400。
7. 越权:用户 A 取消/支付用户 B 的订单 → 404。
8. 后台 `GET /api/admin/orders` 返回所有订单(分页);普通用户访问 → 403。
9. 浏览器:`/orders` 下单→模拟支付→变 paid;`/admin/orders` 管理员看到所有订单。

## 7. 测试策略

本期手动冒烟(curl 跑接口链路 + 浏览器跑页面 + 查 MySQL)。自动化测试待框架稳定统一补;service 层(paymentOrder/payment)与渠道接口已按可测试性留好边界(渠道可替换、markPaid 幂等可单测)。
