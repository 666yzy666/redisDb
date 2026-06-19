# 后端架构 & DB / Redis 用法详解

本文目标：让你快速搞清楚这个 demo 的**后端分层**，以及 **MySQL 和 Redis 各自负责什么、怎么配合**。

---

## 1. 分层架构：一条请求是怎么流动的

```
HTTP 请求
   │
   ▼
routes/            定义 URL → 控制器的映射；挂载鉴权、async 包装中间件
   │
   ▼
controllers/       解析 req 参数、调用 service、用统一格式返回 res；不含业务逻辑
   │
   ▼
services/          业务逻辑层：编排「数据访问」与「缓存」，事务/规则都在这层
   │
   ├──────────────┐
   ▼              ▼
repositories/     utils/cache.js
(MySQL DAO)       (Redis 缓存)
   │              │
   ▼              ▼
loaders/mysql.js  loaders/redis.js
(连接池单例)       (客户端单例)
```

**每层职责单一、上层只依赖下层**，所以可以单独替换/测试任意一层。例如想把 MySQL 换成 PostgreSQL，只动 `repositories/` 和 `loaders/mysql.js`，上面的 controller / service 不用改。

| 层 | 目录 | 只做一件事 |
|----|------|-----------|
| 路由 | `routes/` | URL 映射 + 串中间件 |
| 控制器 | `controllers/` | 收发 HTTP，不写业务 |
| 服务 | `services/` | 业务编排（DB + 缓存） |
| 数据访问 | `repositories/` | 只写 SQL |
| 基础设施 | `loaders/` | 连接池/客户端单例 |
| 中间件 | `middlewares/` | 鉴权、错误处理、async 包装 |
| 工具 | `utils/` | 日志、响应、异常、缓存 |

---

## 2. MySQL：负责「持久化的真相」

- **连接池单例**（`loaders/mysql.js`）：进程启动时 `createPool` 一次，全局复用，避免每次请求重新建连。用 `namedPlaceholders` 写带名占位符的 SQL，防注入也更易读。
- **DAO 只写 SQL**（`repositories/user.repository.js`）：不碰缓存、不碰业务判断，纯粹「进 SQL、出数据」。

### 关键点：原子 get-or-create（登录）

老写法是「先 `SELECT` 查 openid，没有再 `INSERT`」——两个并发登录会**同时查空**，然后都去 `INSERT`，第二个撞唯一键 `uk_openid` 报错。

现在用一条 SQL 解决：

```sql
INSERT INTO users (openid) VALUES (:openid)
ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id);
```

- openid 不存在 → 正常插入，`insertId` = 新行 id；
- openid 已存在 → 命中唯一键走 UPDATE 分支，`LAST_INSERT_ID(id)` 这个小技巧让 `insertId` **回填成既有行的 id**。

于是无论新老用户、无论并发与否，一条语句都能拿到正确的 `userId`，再回读一次完整资料即可。

---

## 3. Redis：负责「快」——两类完全不同的用途

Redis 在本 demo 里干**两件互不相干的事**，看 key 前缀就能区分：

| 用途 | key | 谁在用 | 失效方式 |
|------|-----|--------|----------|
| **会话**（登录态） | `session:{userId}` | service 登录写入 / auth 中间件校验 | 7 天 TTL 或 logout 主动删 |
| **资料缓存** | `user:profile:{userId}` | `utils/cache.js` 的 Cache-Aside | 5 分钟 TTL（带抖动）/ 更新时刷新 |

> 会话直接用 `getRedis().set/get/del` 管理；资料缓存统一走 `cache` 工具。两者刻意分开，避免把「登录态」和「读缓存」混为一谈。

### 3.1 会话：服务端可控的登录态

登录时把签发的 JWT 存进 `session:{userId}`。鉴权中间件（`middlewares/auth.js`）不仅验 JWT 签名，还会**比对 Redis 里的 token 是否一致**：

```
请求带 Bearer token
   → jwt.verify 验签（拿到 userId）
   → GET session:{userId} 比对 token
   → 一致才放行
```

好处：token 没过期也能**服务端踢登录**（logout 删 key，或换设备登录覆盖旧 token），这是纯 JWT 做不到的。

### 3.2 资料缓存：Cache-Aside（旁路缓存）

读路径（`getProfile`）：

```
GET user:profile:{id}
   ├─ 命中真实值 ──────────────→ 直接返回
   ├─ 命中「空值标记」─────────→ 返回 null（不打库）
   └─ 未命中
        → 查 MySQL
            ├─ 有 → 写回缓存(带抖动 TTL) → 返回
            └─ 无 → 写「空值标记」(短 TTL) → 返回 null
```

这套逻辑封装在 [`src/utils/cache.js`](../src/utils/cache.js) 的 `cacheAside()`，顺手解决了缓存三大经典问题：

| 问题 | 现象 | 本 demo 的对策 |
|------|------|----------------|
| **缓存穿透** | 查一个**根本不存在**的 id，每次都穿过缓存打库 | 把「确认不存在」也缓存一个短 TTL 的空值标记 |
| **缓存雪崩** | 大批 key 同一时刻过期，流量瞬间压垮 MySQL | TTL 加 ±10% 随机**抖动**，过期时间分散 |
| **写后不一致** | 「写库后删缓存」时，正在回源的旧请求可能把旧值又写回 | 改为**写后刷新**：更新库后直接把最新值 `SET` 回缓存 |

写路径（`updateProfile`）：

```
UPDATE users ...           （写 MySQL，真相落库）
   → SET user:profile:{id} 最新值   （写后刷新，下次读直接命中）
```

---

## 4. 一图看懂：登录 → 读资料 → 更新 的完整数据流

```
① 登录  POST /users/login
   controller → service.login
       → wechat.code2session(code) 换 openid
       → MySQL: upsertByOpenid  (原子 get-or-create)
       → MySQL: findById        (回读完整资料)
       → 签发 JWT
       → Redis: SET session:{id} = token  (EX 7d)
   ← { token, user }

② 读资料  GET /users/profile   (Header: Bearer token)
   auth 中间件: 验签 + 比对 Redis session
   controller → service.getProfile
       → Redis: GET user:profile:{id}
            命中 → 返回
            未命中 → MySQL findById → 回填 Redis → 返回
   ← user

③ 更新  PUT /users/profile
   controller → service.updateProfile
       → MySQL: findById (存在性校验)
       → MySQL: UPDATE
       → Redis: SET user:profile:{id} = 最新值  (写后刷新)
   ← updated user
```

---

## 5. 订单模块：事务 + 状态机怎么用 DB / Redis

订单模块完全沿用上面的分层（`order.route → order.controller → order.service → product/order.repository`），重点演示两件事：**多表事务**和**订单状态机**。

### 5.1 表关系

```
users 1───* orders 1───* order_items *───1 products
```

- `orders`：一张订单，`status` 字段是状态机的核心。
- `order_items`：明细，下单时**快照**了 `product_name` 和 `price` —— 商品后续改价，历史订单金额不变。

### 5.2 下单：一个事务把三件事捆在一起

下单要同时改三张表，必须「要么全成功，要么全回滚」，否则会出现「扣了库存却没生成订单」这种脏数据。`loaders/mysql.js` 的 `withTransaction(fn)` 借一条连接、开启事务，`fn` 内所有 SQL 用同一条 `conn`：

```
withTransaction(conn =>
   ① 逐项 UPDATE products SET stock=stock-:qty WHERE id=:id AND stock>=:qty
        └─ affectedRows=0 → 库存不足 → 抛错 → 整笔 ROLLBACK
   ② INSERT orders ...
   ③ INSERT order_items ... (多值批量插入)
)  ← 全部成功才 COMMIT
```

`WHERE stock >= :qty` 这个守卫顺带挡住了超卖：并发下两个请求抢最后一件库存，只有一个能让 `affectedRows=1`。

### 5.3 订单状态机：合法流转表 + 守卫式 UPDATE

```
pending ──pay──→ paid ──ship──→ shipped ──complete──→ completed
   │               │
   └───────────────┴──cancel──→ cancelled
```

规则集中定义在 `order.service.js` 的 `TRANSITIONS` 表：动作 →「允许的旧状态 + 目标状态」。不在表里的流转一律 400。

真正保证并发安全的是 DB 层的**守卫式 UPDATE**：

```sql
UPDATE orders SET status = :to WHERE id = :id AND status = :from;
```

- `affectedRows = 1` → 流转成功；
- `affectedRows = 0` → 当前状态不是预期的 `:from`（已被并发改过，或越级流转），拒绝。

所以即便两个请求同时点「支付」，也只有一个能把 `pending` 改成 `paid`，**不会重复支付**。这一行 `WHERE status=:from` 等价于一把乐观锁。

取消订单则把「状态流转 + 回滚库存」放进同一个 `withTransaction`，保证一致。

### 5.4 Redis 在订单里的角色

订单详情读走和用户资料一样的 Cache-Aside（`order:detail:{id}`，复用 `utils/cache.js`）；任何状态流转成功后 `del` 掉缓存，下次读自动回源拿到最新状态。

---

## 6. 想继续往「生产级」演进，可以再加什么

本 demo 刻意保持简单。若要上生产，建议按需补：

- **入参校验**（zod/joi）：挡住非法 `code` / 超长 `nickname`。
- **限流 + 安全头**（express-rate-limit + helmet）：尤其保护 `/login`。
- **防击穿（singleflight）**：热点 key 失效瞬间，用 `SET NX` 锁让单个请求回源，其余等待。
- **结构化日志**（pino）替换 console。
- **外部调用超时**：给 `wechat` 的 `fetch` 加 `AbortController`。
- **集成测试 + docker-compose**：一键起 MySQL/Redis 跑通全流程。
