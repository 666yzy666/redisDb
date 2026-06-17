# SP3 付款订单 + 支付渠道抽象 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给框架一个业务无关、可插拔支付的下单付款核心:用户下单→发起支付→(mock)回调→订单转 paid,含我的订单、取消、后台订单管理。

**Architecture:** 新增 payment_orders 表(不碰电商 orders);支付渠道做成可插拔(channels/ + 注册表),mock 渠道实现 createCharge/parseNotify;后端用 paymentOrder.* 命名避开电商 order.*;markPaid 用守卫式 UPDATE 保证幂等。前端新增用户端 OrdersView 与后台 admin/OrdersView。

**Tech Stack:** Node.js/Express + MySQL + Redis;Vue3 + Vite + Pinia + Vue Router。

**验证方式:** 手动冒烟(curl + 浏览器 + 查 MySQL),无自动化测试(spec §7)。

参考 spec:`miniapp/docs/superpowers/specs/2026-06-18-sp3-payment-orders-design.md`。命令默认在 `/home/yzy/05project`;MySQL 容器 `miniapp-mysql`(root/123456,db miniapp)。账号:alice@demo.com/secret123(admin,id=1)、bob@demo.com/secret123(user,id=2)。

---

## Task 1:数据库迁移 — payment_orders 表

**Files:**
- Create: `miniapp/backend/sql/migrations/004_payment_orders.sql`
- Modify: `miniapp/backend/sql/init.sql`(末尾追加表)

- [ ] **Step 1: 写迁移文件**

`miniapp/backend/sql/migrations/004_payment_orders.sql`:
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

- [ ] **Step 2: 同步 init.sql**

把上面整段 `CREATE TABLE IF NOT EXISTS payment_orders (...)`(不含 `USE` 行)追加到 `miniapp/backend/sql/init.sql` 文件末尾,前面加一行注释 `-- ===== 框架付款订单 =====`。

- [ ] **Step 3: 执行迁移**

```bash
docker exec -i miniapp-mysql mysql -uroot -p123456 < miniapp/backend/sql/migrations/004_payment_orders.sql
```

- [ ] **Step 4: 验证**

```bash
docker exec miniapp-mysql mysql -uroot -p123456 -e "USE miniapp; DESC payment_orders;" 2>/dev/null | head
```
Expected: 列出 id/order_no/user_id/amount/subject/status/channel/paid_at 等字段。

- [ ] **Step 5: Commit**

```bash
cd /home/yzy/05project && git add -A && git commit -m "feat(db): add payment_orders table"
```

---

## Task 2:仓库层 paymentOrder.repository

**Files:**
- Create: `miniapp/backend/src/repositories/paymentOrder.repository.js`

- [ ] **Step 1: 写仓库**

```js
'use strict';

const { getPool } = require('../loaders/mysql');

// 付款订单数据访问层
const PaymentOrderRepository = {
  async create({ orderNo, userId, amount, subject }) {
    const [result] = await getPool().execute(
      'INSERT INTO payment_orders (order_no, user_id, amount, subject) VALUES (:orderNo, :userId, :amount, :subject)',
      { orderNo, userId, amount, subject }
    );
    return result.insertId;
  },

  async findById(id) {
    const [rows] = await getPool().execute(
      'SELECT id, order_no, user_id, amount, subject, status, channel, paid_at, created_at FROM payment_orders WHERE id = :id LIMIT 1',
      { id }
    );
    return rows[0] || null;
  },

  async findByNo(orderNo) {
    const [rows] = await getPool().execute(
      'SELECT id, order_no, user_id, amount, subject, status, channel, paid_at, created_at FROM payment_orders WHERE order_no = :orderNo LIMIT 1',
      { orderNo }
    );
    return rows[0] || null;
  },

  async listByUser(userId) {
    const [rows] = await getPool().execute(
      'SELECT id, order_no, amount, subject, status, channel, paid_at, created_at FROM payment_orders WHERE user_id = :userId ORDER BY id DESC',
      { userId }
    );
    return rows;
  },

  // 后台分页;status 可选过滤
  async listAll({ status, limit, offset }) {
    const where = status ? 'WHERE status = ?' : '';
    const params = status ? [status, limit, offset] : [limit, offset];
    const [rows] = await getPool().query(
      `SELECT id, order_no, user_id, amount, subject, status, channel, paid_at, created_at FROM payment_orders ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
      params
    );
    return rows;
  },

  async countAll({ status }) {
    const where = status ? 'WHERE status = ?' : '';
    const params = status ? [status] : [];
    const [rows] = await getPool().query(
      `SELECT COUNT(*) AS total FROM payment_orders ${where}`,
      params
    );
    return rows[0].total;
  },

  // 守卫式:仅 pending 才能转 paid;返回 affectedRows(幂等关键)
  async markPaid(id, channel) {
    const [result] = await getPool().execute(
      "UPDATE payment_orders SET status='paid', channel=:channel, paid_at=NOW() WHERE id=:id AND status='pending'",
      { id, channel }
    );
    return result.affectedRows;
  },

  // 守卫式:仅 pending 才能取消;返回 affectedRows
  async markCancelled(id) {
    const [result] = await getPool().execute(
      "UPDATE payment_orders SET status='cancelled' WHERE id=:id AND status='pending'",
      { id }
    );
    return result.affectedRows;
  },
};

module.exports = PaymentOrderRepository;
```

- [ ] **Step 2: 验证加载**

```bash
cd /home/yzy/05project/miniapp/backend && node -e "require('./src/repositories/paymentOrder.repository.js'); console.log('ok')"
```
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
cd /home/yzy/05project && git add -A && git commit -m "feat(backend): paymentOrder repository"
```

---

## Task 3:支付渠道抽象(mock 渠道 + 注册表)

**Files:**
- Create: `miniapp/backend/src/services/payment/channels/mock.channel.js`
- Create: `miniapp/backend/src/services/payment/index.js`

- [ ] **Step 1: mock 渠道**

`miniapp/backend/src/services/payment/channels/mock.channel.js`:
```js
'use strict';

// mock 支付渠道:本地模拟"发起支付 + 回调"。
// 真实渠道(支付宝/Stripe)实现同样的 name / createCharge / parseNotify 即可替换。
const mockChannel = {
  name: 'mock',

  // 发起支付:返回一个"模拟支付页"地址。真实渠道这里会向网关下单并返回真实支付 URL。
  async createCharge(order) {
    return { payUrl: `/payment/mock?orderNo=${order.order_no}`, channel: 'mock' };
  },

  // 解析回调:真实渠道这里要验签。mock 直接信任 body。
  parseNotify(body) {
    return { orderNo: body && body.orderNo, success: true };
  },
};

module.exports = mockChannel;
```

- [ ] **Step 2: 渠道注册表**

`miniapp/backend/src/services/payment/index.js`:
```js
'use strict';

const ApiError = require('../../utils/ApiError');
const mockChannel = require('./channels/mock.channel');

// 渠道注册表:新增真实渠道时,在此登记即可
const channels = {
  [mockChannel.name]: mockChannel,
};

function getChannel(name) {
  const ch = channels[name];
  if (!ch) throw ApiError.badRequest(`未知支付渠道: ${name}`);
  return ch;
}

module.exports = { getChannel };
```

- [ ] **Step 3: 验证加载**

```bash
cd /home/yzy/05project/miniapp/backend && node -e "const {getChannel}=require('./src/services/payment'); console.log(getChannel('mock').name)"
```
Expected: `mock`

- [ ] **Step 4: Commit**

```bash
cd /home/yzy/05project && git add -A && git commit -m "feat(backend): pluggable payment channel registry + mock channel"
```

---

## Task 4:paymentOrder.service + payment.service

**Files:**
- Create: `miniapp/backend/src/services/paymentOrder.service.js`
- Create: `miniapp/backend/src/services/payment.service.js`

- [ ] **Step 1: paymentOrder.service.js**

```js
'use strict';

const crypto = require('crypto');
const ApiError = require('../utils/ApiError');
const PaymentOrderRepository = require('../repositories/paymentOrder.repository');

const MAX_PAGE_SIZE = 100;

// 生成业务订单号:时间 + 随机(crypto),够唯一
function genOrderNo() {
  const ts = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const rand = crypto.randomBytes(4).toString('hex');
  return `PO${ts}${rand}`;
}

const PaymentOrderService = {
  async createOrder(userId, { amount, subject }) {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      throw ApiError.badRequest('金额必须大于 0');
    }
    if (!subject || !String(subject).trim()) {
      throw ApiError.badRequest('订单标题不能为空');
    }
    const orderNo = genOrderNo();
    const id = await PaymentOrderRepository.create({
      orderNo,
      userId,
      amount: Number(amt.toFixed(2)),
      subject: String(subject).trim(),
    });
    return PaymentOrderRepository.findById(id);
  },

  async listMyOrders(userId) {
    return PaymentOrderRepository.listByUser(userId);
  },

  // 取订单并校验归属;不存在或越权统一按"不存在"
  async getOwnedOrder(userId, id) {
    const order = await PaymentOrderRepository.findById(id);
    if (!order || String(order.user_id) !== String(userId)) {
      throw ApiError.notFound('订单不存在');
    }
    return order;
  },

  async cancelOrder(userId, id) {
    await this.getOwnedOrder(userId, id); // 含归属校验
    const affected = await PaymentOrderRepository.markCancelled(id);
    if (!affected) throw ApiError.badRequest('订单状态已变化,无法取消', 40903);
    return PaymentOrderRepository.findById(id);
  },

  // 按订单号置为已支付(幂等:已处理则直接返回)
  async markPaidByNo(orderNo, channel) {
    const order = await PaymentOrderRepository.findByNo(orderNo);
    if (!order) throw ApiError.notFound('订单不存在');
    await PaymentOrderRepository.markPaid(order.id, channel); // affectedRows=0 视为已处理,幂等
    return PaymentOrderRepository.findById(order.id);
  },

  // 后台分页列表
  async listAllForAdmin({ page, pageSize, status }) {
    const p = Math.max(1, Number(page) || 1);
    const size = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(pageSize) || 20));
    const offset = (p - 1) * size;
    const st = status === 'pending' || status === 'paid' || status === 'cancelled' ? status : '';
    const [items, total] = await Promise.all([
      PaymentOrderRepository.listAll({ status: st, limit: size, offset }),
      PaymentOrderRepository.countAll({ status: st }),
    ]);
    return { items, total, page: p, pageSize: size };
  },
};

module.exports = PaymentOrderService;
```

- [ ] **Step 2: payment.service.js**

```js
'use strict';

const ApiError = require('../utils/ApiError');
const { getChannel } = require('./payment');
const PaymentOrderService = require('./paymentOrder.service');

const DEFAULT_CHANNEL = 'mock';

const PaymentService = {
  // 发起支付:校验订单属于本人且为 pending,调渠道发起
  async pay(userId, orderId) {
    const order = await PaymentOrderService.getOwnedOrder(userId, orderId);
    if (order.status !== 'pending') {
      throw ApiError.badRequest('订单状态不可支付');
    }
    const channel = getChannel(DEFAULT_CHANNEL);
    const charge = await channel.createCharge(order);
    return { ...charge, orderNo: order.order_no };
  },

  // 处理支付回调(网关或 mock 触发):解析 → 置已支付(幂等)
  async handleNotify(channelName, body) {
    const channel = getChannel(channelName);
    const { orderNo, success } = channel.parseNotify(body);
    if (!orderNo) throw ApiError.badRequest('回调缺少 orderNo');
    if (success) {
      await PaymentOrderService.markPaidByNo(orderNo, channelName);
    }
    return { ok: true };
  },
};

module.exports = PaymentService;
```

- [ ] **Step 3: 验证加载**

```bash
cd /home/yzy/05project/miniapp/backend && node -e "require('./src/services/paymentOrder.service.js'); require('./src/services/payment.service.js'); console.log('ok')"
```
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
cd /home/yzy/05project && git add -A && git commit -m "feat(backend): paymentOrder service + payment orchestration service"
```

---

## Task 5:controller + 路由 + 挂载 + 后端冒烟

**Files:**
- Create: `miniapp/backend/src/controllers/paymentOrder.controller.js`
- Create: `miniapp/backend/src/routes/payment.route.js`
- Modify: `miniapp/backend/src/routes/index.js`(挂 /payment)
- Modify: `miniapp/backend/src/services/admin.service.js`(加 listOrders 委托)
- Modify: `miniapp/backend/src/controllers/admin.controller.js`(加 listOrders)
- Modify: `miniapp/backend/src/routes/admin.route.js`(加 GET /orders)

- [ ] **Step 1: paymentOrder.controller.js**

```js
'use strict';

const PaymentOrderService = require('../services/paymentOrder.service');
const PaymentService = require('../services/payment.service');
const { success } = require('../utils/response');

const PaymentOrderController = {
  async create(req, res) {
    const { amount, subject } = req.body;
    const order = await PaymentOrderService.createOrder(req.user.userId, { amount, subject });
    return success(res, order, '下单成功');
  },

  async listMine(req, res) {
    const orders = await PaymentOrderService.listMyOrders(req.user.userId);
    return success(res, orders);
  },

  async pay(req, res) {
    const result = await PaymentService.pay(req.user.userId, Number(req.params.id));
    return success(res, result, '发起支付');
  },

  async cancel(req, res) {
    const order = await PaymentOrderService.cancelOrder(req.user.userId, Number(req.params.id));
    return success(res, order, '已取消');
  },

  // 支付网关回调(无鉴权)
  async notify(req, res) {
    const result = await PaymentService.handleNotify(req.params.channel, req.body);
    return success(res, result);
  },

  // 本地模拟网关完成支付(需登录):内部走和真实回调同一条路径
  async mockComplete(req, res) {
    const result = await PaymentService.handleNotify('mock', { orderNo: req.body.orderNo });
    return success(res, result, '模拟支付完成');
  },
};

module.exports = PaymentOrderController;
```

- [ ] **Step 2: payment.route.js**

```js
'use strict';

const express = require('express');
const PaymentOrderController = require('../controllers/paymentOrder.controller');
const auth = require('../middlewares/auth');
const asyncHandler = require('../middlewares/asyncHandler');

const router = express.Router();

// 回调:无鉴权(真实网关无 token)
router.post('/notify/:channel', asyncHandler(PaymentOrderController.notify));

// 以下均需登录
router.post('/orders', auth, asyncHandler(PaymentOrderController.create));
router.get('/orders', auth, asyncHandler(PaymentOrderController.listMine));
router.post('/orders/:id/pay', auth, asyncHandler(PaymentOrderController.pay));
router.post('/orders/:id/cancel', auth, asyncHandler(PaymentOrderController.cancel));
router.post('/mock/complete', auth, asyncHandler(PaymentOrderController.mockComplete));

module.exports = router;
```

- [ ] **Step 3: 挂载 /payment**

在 `miniapp/backend/src/routes/index.js` 顶部引入:
```js
const paymentRoute = require('./payment.route');
```
在 `router.use('/auth', authRoute);` 之后(或 admin 挂载附近)加:
```js
router.use('/payment', paymentRoute);
```

- [ ] **Step 4: admin 加订单列表**

在 `miniapp/backend/src/services/admin.service.js`,顶部 require 区加:
```js
const PaymentOrderService = require('./paymentOrder.service');
```
在 `AdminService` 对象里加一个方法(委托给 paymentOrder service):
```js
  async listOrders({ page, pageSize, status }) {
    return PaymentOrderService.listAllForAdmin({ page, pageSize, status });
  },
```
在 `miniapp/backend/src/controllers/admin.controller.js` 的 `AdminController` 里加:
```js
  async listOrders(req, res) {
    const { page, pageSize, status } = req.query;
    const result = await AdminService.listOrders({ page, pageSize, status });
    return success(res, result);
  },
```
在 `miniapp/backend/src/routes/admin.route.js`,在用户管理路由之后加:
```js
router.get('/orders', asyncHandler(AdminController.listOrders));
```

- [ ] **Step 5: 重启后端**

由实现者停掉旧后端(端口 3000),在 `miniapp/backend` 后台 `npm start`,等待 "Server listening"。

- [ ] **Step 6: 冒烟测试**

```bash
B=http://localhost:3000/api
USER=$(curl -s -X POST $B/auth/login -H 'Content-Type: application/json' -d '{"email":"bob@demo.com","password":"secret123"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
ADMIN=$(curl -s -X POST $B/auth/login -H 'Content-Type: application/json' -d '{"email":"alice@demo.com","password":"secret123"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

# 下单
ORD=$(curl -s -X POST $B/payment/orders -H "Authorization: Bearer $USER" -H 'Content-Type: application/json' -d '{"amount":9.9,"subject":"测试订单"}')
echo "[下单] $(echo "$ORD" | grep -o '"status":"[^"]*"\|"order_no":"[^"]*"')"
OID=$(echo "$ORD" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
ONO=$(echo "$ORD" | grep -o '"order_no":"[^"]*"' | cut -d'"' -f4)

# 发起支付
echo "[发起支付] $(curl -s -X POST $B/payment/orders/$OID/pay -H "Authorization: Bearer $USER" | grep -o '"payUrl":"[^"]*"')"
# 模拟完成支付 → paid
echo "[模拟支付] $(curl -s -X POST $B/payment/mock/complete -H "Authorization: Bearer $USER" -H 'Content-Type: application/json' -d "{\"orderNo\":\"$ONO\"}" | grep -o '"message":"[^"]*"')"
# 幂等:再次完成
echo "[再次完成 幂等] $(curl -s -X POST $B/payment/mock/complete -H "Authorization: Bearer $USER" -H 'Content-Type: application/json' -d "{\"orderNo\":\"$ONO\"}" | grep -o '"message":"[^"]*"\|"status":"[^"]*"')"
# 我的订单(应含该单,status paid)
echo "[我的订单] $(curl -s $B/payment/orders -H "Authorization: Bearer $USER" | grep -o '"status":"[^"]*"' | head -1)"

# 取消一个新 pending 单
ORD2=$(curl -s -X POST $B/payment/orders -H "Authorization: Bearer $USER" -H 'Content-Type: application/json' -d '{"amount":5,"subject":"待取消"}')
OID2=$(echo "$ORD2" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
echo "[取消 pending] $(curl -s -X POST $B/payment/orders/$OID2/cancel -H "Authorization: Bearer $USER" | grep -o '"status":"[^"]*"')"
echo "[取消已paid单 应400] $(curl -s -X POST $B/payment/orders/$OID/cancel -H "Authorization: Bearer $USER" | grep -o '"message":"[^"]*"')"

# 越权:admin(id1)用 bob 的订单? 用 alice token 取 bob 的订单 → 404
echo "[越权取消 应404] $(curl -s -X POST $B/payment/orders/$OID/cancel -H "Authorization: Bearer $ADMIN" | grep -o '"message":"[^"]*"')"

# 后台订单列表
echo "[admin 订单列表] $(curl -s "$B/admin/orders?pageSize=5" -H "Authorization: Bearer $ADMIN" | grep -o '"total":[0-9]*')"
echo "[user 访问admin订单 应403] $(curl -s "$B/admin/orders" -H "Authorization: Bearer $USER" | grep -o '"message":"[^"]*"')"
```
Expected:下单 status=pending 且有 order_no;发起支付返回 payUrl;模拟支付=`模拟支付完成`;再次完成不报错且仍 paid;我的订单第一条 paid;取消 pending → cancelled;取消已 paid → `订单状态已变化,无法取消`;越权取消 → `订单不存在`;admin 订单列表 total>0;user 访问 → `需要管理员权限`。

- [ ] **Step 7: Commit**

```bash
cd /home/yzy/05project && git add -A && git commit -m "feat(backend): payment routes (order/pay/notify/cancel) + admin orders"
```

---

## Task 6:前端 api + 路由 + 入口

**Files:**
- Create: `miniapp/frontend/src/api/payment.js`
- Modify: `miniapp/frontend/src/api/admin.js`(加 listOrders)
- Modify: `miniapp/frontend/src/router/index.js`(加 /orders、/admin/orders)
- Modify: `miniapp/frontend/src/layouts/DefaultLayout.vue`(顶栏加「我的订单」)
- Modify: `miniapp/frontend/src/layouts/AdminLayout.vue`(侧边栏加「订单管理」)

- [ ] **Step 1: api/payment.js**

```js
import client from './client';

export const createOrder = (data) => client.post('/payment/orders', data);
export const listMyOrders = () => client.get('/payment/orders');
export const payOrder = (id) => client.post(`/payment/orders/${id}/pay`);
export const cancelOrder = (id) => client.post(`/payment/orders/${id}/cancel`);
export const mockComplete = (orderNo) => client.post('/payment/mock/complete', { orderNo });
```

- [ ] **Step 2: api/admin.js 加 listOrders**

在 `miniapp/frontend/src/api/admin.js` 末尾加:
```js
export const listOrders = (params) => client.get('/admin/orders', { params });
```

- [ ] **Step 3: 路由加两页**

在 `miniapp/frontend/src/router/index.js`:
- `/`(DefaultLayout)children 的 `profile` 之后加:
```js
      { path: 'orders', component: () => import('../views/user/OrdersView.vue') },
```
- `/admin`(AdminLayout)children 的 `users` 之后加:
```js
      { path: 'orders', component: () => import('../views/admin/OrdersView.vue') },
```

- [ ] **Step 4: 顶栏 + 侧边栏入口**

- `miniapp/frontend/src/layouts/DefaultLayout.vue` 的 `<nav>` 里,"个人资料" router-link 之后加:
```html
        <router-link to="/orders" class="text-gray-700 hover:text-blue-600">我的订单</router-link>
```
- `miniapp/frontend/src/layouts/AdminLayout.vue` 的 `<nav>` 里,"用户管理" router-link 之后加:
```html
        <router-link to="/admin/orders" class="block px-3 py-2 rounded hover:bg-gray-700">订单管理</router-link>
```

- [ ] **Step 5: 占位两页(让 build 通过,Task 7 覆盖)**

创建 `miniapp/frontend/src/views/user/OrdersView.vue` 与 `miniapp/frontend/src/views/admin/OrdersView.vue`,各含:
```vue
<template><div>placeholder</div></template>
```

- [ ] **Step 6: 验证 build**

```bash
cd /home/yzy/05project/miniapp/frontend && npm run build 2>&1 | tail -6
```
Expected: "built in ..." 无错误。

- [ ] **Step 7: Commit**

```bash
cd /home/yzy/05project && git add -A && git commit -m "feat(frontend): payment api + orders routes + nav entries"
```

---

## Task 7:前端两页面(用户下单/付款 + 后台订单)

**Files:**
- Modify(覆盖占位): `miniapp/frontend/src/views/user/OrdersView.vue`
- Modify(覆盖占位): `miniapp/frontend/src/views/admin/OrdersView.vue`

- [ ] **Step 1: 用户端 OrdersView.vue**

覆盖 `miniapp/frontend/src/views/user/OrdersView.vue`:
```vue
<script setup>
import { ref, onMounted } from 'vue';
import { createOrder, listMyOrders, payOrder, cancelOrder, mockComplete } from '../../api/payment';

const orders = ref([]);
const amount = ref('');
const subject = ref('');
const error = ref('');
const info = ref('');

async function load() {
  error.value = '';
  try {
    orders.value = await listMyOrders();
  } catch (e) {
    error.value = e.message;
  }
}

async function onCreate() {
  error.value = '';
  info.value = '';
  try {
    await createOrder({ amount: Number(amount.value), subject: subject.value });
    amount.value = '';
    subject.value = '';
    await load();
  } catch (e) {
    error.value = e.message;
  }
}

// 发起支付 → mock 渠道:直接模拟完成支付(真实渠道会跳转 payUrl)
async function onPay(o) {
  error.value = '';
  info.value = '';
  try {
    await payOrder(o.id);          // 发起(拿到 payUrl,mock 下直接模拟完成)
    await mockComplete(o.order_no); // 模拟网关回调
    info.value = `订单 ${o.order_no} 支付成功`;
    await load();
  } catch (e) {
    error.value = e.message;
  }
}

async function onCancel(o) {
  error.value = '';
  try {
    await cancelOrder(o.id);
    await load();
  } catch (e) {
    error.value = e.message;
  }
}

onMounted(load);
</script>

<template>
  <div class="max-w-3xl mx-auto space-y-6">
    <div class="bg-white rounded-lg shadow p-6 space-y-3">
      <h1 class="text-lg font-bold">下单</h1>
      <div class="flex gap-2">
        <input v-model="amount" type="number" step="0.01" placeholder="金额" class="border rounded px-3 py-2 w-32" />
        <input v-model="subject" placeholder="订单标题" class="border rounded px-3 py-2 flex-1" />
        <button @click="onCreate" class="bg-blue-600 text-white rounded px-4 py-2">创建</button>
      </div>
      <p v-if="info" class="text-green-600 text-sm">{{ info }}</p>
      <p v-if="error" class="text-red-500 text-sm">{{ error }}</p>
    </div>

    <div class="bg-white rounded-lg shadow p-6">
      <h2 class="text-lg font-bold mb-3">我的订单</h2>
      <table class="w-full text-sm border-collapse">
        <thead>
          <tr class="text-left text-gray-500 border-b">
            <th class="py-2">订单号</th><th>标题</th><th>金额</th><th>状态</th><th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="o in orders" :key="o.id" class="border-b">
            <td class="py-2 text-xs">{{ o.order_no }}</td>
            <td>{{ o.subject }}</td>
            <td>¥{{ o.amount }}</td>
            <td>
              <span :class="{ 'text-yellow-600': o.status==='pending', 'text-green-600': o.status==='paid', 'text-gray-400': o.status==='cancelled' }">{{ o.status }}</span>
            </td>
            <td class="space-x-2">
              <template v-if="o.status === 'pending'">
                <button @click="onPay(o)" class="text-blue-600 hover:underline">去支付</button>
                <button @click="onCancel(o)" class="text-red-500 hover:underline">取消</button>
              </template>
              <span v-else class="text-gray-400 text-xs">—</span>
            </td>
          </tr>
          <tr v-if="!orders.length"><td colspan="5" class="py-4 text-center text-gray-400">暂无订单</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
```

- [ ] **Step 2: 后台 OrdersView.vue**

覆盖 `miniapp/frontend/src/views/admin/OrdersView.vue`:
```vue
<script setup>
import { ref, onMounted } from 'vue';
import { listOrders } from '../../api/admin';

const items = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = 20;
const status = ref('');
const error = ref('');

async function load() {
  error.value = '';
  try {
    const res = await listOrders({ page: page.value, pageSize, status: status.value || undefined });
    items.value = res.items;
    total.value = res.total;
  } catch (e) {
    error.value = e.message;
  }
}

function onFilter() { page.value = 1; load(); }
function prevPage() { if (page.value > 1) { page.value -= 1; load(); } }
function nextPage() { if (page.value * pageSize < total.value) { page.value += 1; load(); } }

onMounted(load);
</script>

<template>
  <div class="bg-white rounded-lg shadow p-6 space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="text-lg font-bold">订单管理</h1>
      <select v-model="status" @change="onFilter" class="border rounded px-3 py-1 text-sm">
        <option value="">全部状态</option>
        <option value="pending">pending</option>
        <option value="paid">paid</option>
        <option value="cancelled">cancelled</option>
      </select>
    </div>
    <p v-if="error" class="text-red-500 text-sm">{{ error }}</p>
    <table class="w-full text-sm border-collapse">
      <thead>
        <tr class="text-left text-gray-500 border-b">
          <th class="py-2">ID</th><th>订单号</th><th>用户ID</th><th>标题</th><th>金额</th><th>状态</th><th>时间</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="o in items" :key="o.id" class="border-b">
          <td class="py-2">{{ o.id }}</td>
          <td class="text-xs">{{ o.order_no }}</td>
          <td>{{ o.user_id }}</td>
          <td>{{ o.subject }}</td>
          <td>¥{{ o.amount }}</td>
          <td>
            <span :class="{ 'text-yellow-600': o.status==='pending', 'text-green-600': o.status==='paid', 'text-gray-400': o.status==='cancelled' }">{{ o.status }}</span>
          </td>
          <td class="text-gray-400">{{ o.created_at }}</td>
        </tr>
        <tr v-if="!items.length"><td colspan="7" class="py-4 text-center text-gray-400">暂无订单</td></tr>
      </tbody>
    </table>
    <div class="flex items-center justify-between text-sm">
      <span class="text-gray-500">共 {{ total }} 单 · 第 {{ page }} 页</span>
      <div class="space-x-2">
        <button @click="prevPage" :disabled="page <= 1" class="border rounded px-3 py-1 disabled:opacity-40">上一页</button>
        <button @click="nextPage" :disabled="page * pageSize >= total" class="border rounded px-3 py-1 disabled:opacity-40">下一页</button>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 3: 验证 build**

```bash
cd /home/yzy/05project/miniapp/frontend && npm run build 2>&1 | tail -6
```
Expected: "built in ..." 无错误。

- [ ] **Step 4: 起前端 + 代理冒烟(无浏览器)**

```bash
cd /home/yzy/05project/miniapp/frontend && (npm run dev > /tmp/sp3-fe.log 2>&1 &) ; sleep 4 ; grep -o "Local:.*" /tmp/sp3-fe.log | head -1
echo "homepage: $(curl -s -o /dev/null -w '%{http_code}' http://localhost:5173/)"
USER=$(curl -s -X POST http://localhost:5173/api/auth/login -H 'Content-Type: application/json' -d '{"email":"bob@demo.com","password":"secret123"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
echo "proxy 我的订单: $(curl -s http://localhost:5173/api/payment/orders -H "Authorization: Bearer $USER" | head -c 80)"
pkill -f vite 2>/dev/null; echo stopped
```
Expected: homepage `200`;proxy 我的订单返回 JSON 数组(`[...]`)。

- [ ] **Step 5: Commit**

```bash
cd /home/yzy/05project && git add -A && git commit -m "feat(frontend): user OrdersView (create/pay/cancel) + admin OrdersView"
```

---

## Task 8:文档 + 回归

**Files:**
- Modify: `miniapp/README.md`

- [ ] **Step 1: 更新 README**

增加:
- 接口表:`POST /api/payment/orders`、`GET /api/payment/orders`、`POST /api/payment/orders/:id/pay`、`POST /api/payment/orders/:id/cancel`、`POST /api/payment/notify/:channel`、`POST /api/payment/mock/complete`、`GET /api/admin/orders`。
- 说明:新增 `payment_orders` 表(框架通用付款订单,与电商 orders 并存);支付渠道可插拔(`services/payment/channels/`,mock 渠道;真实渠道实现 createCharge/parseNotify 即可);markPaid 守卫式 UPDATE 保证幂等;支付流程"发起→回调"。
- 前端结构:`views/user/OrdersView.vue`、`views/admin/OrdersView.vue`、`api/payment.js`;顶栏「我的订单」、侧边栏「订单管理」。

- [ ] **Step 2: 回归冒烟**

按 spec §6 验收标准逐条过一遍(下单→支付→paid、幂等、我的订单、取消、越权 404、admin 列表、user 403)。

- [ ] **Step 3: Commit**

```bash
cd /home/yzy/05project && git add -A && git commit -m "docs: document SP3 payment orders + channel abstraction"
```

---

## 自查记录(spec 覆盖)

- §2 数据模型 payment_orders → Task 1。
- §3 支付渠道抽象(mock + 注册表 getChannel/createCharge/parseNotify)→ Task 3。
- §4.1 仓库/service 方法 → Task 2(repo)、Task 4(service)。
- §4.2 路由(下单/我的/支付/取消/notify/mock-complete + admin orders)→ Task 5。
- §5 前端 api/页面/入口/路由 → Task 6、7。
- §6 验收(含幂等、越权、取消、403)→ Task 5/7/8 冒烟。
- §7 测试(手动冒烟)→ 各 Task 验证步骤。
- 命名一致性:repo `PaymentOrderRepository`、service `PaymentOrderService`/`PaymentService`、channel `name/createCharge/parseNotify`、字段 order_no/amount/subject/status/channel/paid_at 全程统一;状态值 pending/paid/cancelled 一致。
- markPaid 幂等:Task 2 守卫式 UPDATE + Task 4 markPaidByNo 不依赖 affectedRows 报错 → Task 5 冒烟"再次完成"验证。
