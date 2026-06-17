# 小程序后台服务器 Demo

基于 **Node.js + Express + MySQL + Redis** 的小程序后台脚手架，采用清晰的分层架构。
内置一套完整的「微信登录 → JWT 鉴权 → 用户资料读写 + Redis 缓存」示例。

## 分层架构

```
miniapp-server/
├── src/
│   ├── server.js              # 启动入口：初始化基础设施 + 监听端口 + 优雅关闭
│   ├── app.js                 # 组装 Express 应用（中间件、路由、错误处理）
│   ├── config/                # 配置层：统一读取环境变量
│   │   └── index.js
│   ├── loaders/               # 基础设施层：连接池/客户端单例
│   │   ├── mysql.js           #   MySQL 连接池 + withTransaction 事务助手
│   │   └── redis.js           #   Redis 客户端（ioredis）
│   ├── routes/                # 路由层：定义 URL 与控制器的映射
│   │   ├── index.js
│   │   ├── user.route.js
│   │   └── order.route.js     #   订单 + 商品路由
│   ├── controllers/           # 控制器层：解析请求 / 返回响应，不含业务逻辑
│   │   ├── user.controller.js
│   │   └── order.controller.js
│   ├── services/              # 业务逻辑层：编排数据访问与缓存
│   │   ├── user.service.js
│   │   ├── wechat.service.js
│   │   └── order.service.js   #   订单业务 + 状态机
│   ├── repositories/          # 数据访问层(DAO)：只写 SQL
│   │   ├── user.repository.js
│   │   ├── product.repository.js
│   │   └── order.repository.js
│   ├── middlewares/           # 中间件：鉴权、错误处理、async 包装
│   │   ├── auth.js
│   │   ├── errorHandler.js
│   │   └── asyncHandler.js
│   └── utils/                 # 工具：日志、统一响应、业务异常、缓存
│       ├── logger.js
│       ├── response.js
│       ├── ApiError.js
│       └── cache.js           #   Cache-Aside 封装（防穿透/雪崩/写后刷新）
├── sql/
│   └── init.sql               # 建库建表脚本
├── .env.example               # 环境变量样例
└── package.json
```

**请求流向**：`routes → controllers → services → repositories(MySQL) / loaders(Redis)`
每一层职责单一，上层依赖下层，便于测试与替换。

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 准备配置
cp .env.example .env       # 按需修改 MySQL / Redis / 微信 / JWT 配置

# 3. 初始化数据库（需本地已装 MySQL）
mysql -u root -p < sql/init.sql

# 4. 启动（需本地已装并启动 Redis）
npm run dev                # 开发模式（nodemon 热重载）
# 或
npm start
```

> 未配置微信 `WX_APPID` 时，登录接口会使用 mock openid，方便本地无微信账号也能跑通全流程。

## API 示例

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET  | `/api/health`             | 否 | 健康检查 |
| POST | `/api/users/login`        | 否 | 小程序登录，返回 token |
| GET  | `/api/users/profile`      | 是 | 获取用户资料（Redis 缓存） |
| PUT  | `/api/users/profile`      | 是 | 更新用户资料（更新后刷新缓存） |
| POST | `/api/users/logout`       | 是 | 退出登录（删除 Redis 会话） |
| GET  | `/api/products`           | 否 | 商品列表 |
| POST | `/api/orders`             | 是 | 下单（事务：扣库存 + 建订单 + 写明细） |
| GET  | `/api/orders`             | 是 | 我的订单列表 |
| GET  | `/api/orders/:id`         | 是 | 订单详情（Redis 缓存） |
| POST | `/api/orders/:id/pay`     | 是 | 状态机：待支付→已支付 |
| POST | `/api/orders/:id/ship`    | 是 | 状态机：已支付→已发货 |
| POST | `/api/orders/:id/complete`| 是 | 状态机：已发货→已完成 |
| POST | `/api/orders/:id/cancel`  | 是 | 状态机：待支付/已支付→已取消（回滚库存） |

### 登录并调用受保护接口

```bash
# 登录（前端用 wx.login 拿到的 code，这里用任意字符串模拟）
curl -X POST http://localhost:3000/api/users/login \
  -H 'Content-Type: application/json' \
  -d '{"code":"test_code_123"}'
# => { "code":0, "data": { "token":"xxx", "user": {...} } }

# 用返回的 token 访问资料
curl http://localhost:3000/api/users/profile \
  -H 'Authorization: Bearer <token>'
```

### 下单并走完订单状态机

```bash
TOKEN=<上一步拿到的 token>

# 看商品（公开）
curl http://localhost:3000/api/products

# 下单：买 1 个商品1 + 2 个商品2（事务内扣库存）
curl -X POST http://localhost:3000/api/orders \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"items":[{"productId":1,"quantity":1},{"productId":2,"quantity":2}]}'
# => 返回订单详情，status=pending

# 状态机流转：支付 → 发货 → 完成（每步都有守卫，越级/重复会被拒）
curl -X POST http://localhost:3000/api/orders/1/pay      -H "Authorization: Bearer $TOKEN"
curl -X POST http://localhost:3000/api/orders/1/ship     -H "Authorization: Bearer $TOKEN"
curl -X POST http://localhost:3000/api/orders/1/complete -H "Authorization: Bearer $TOKEN"

# 已完成的订单再支付会被状态机拒绝（40901）
curl -X POST http://localhost:3000/api/orders/1/pay      -H "Authorization: Bearer $TOKEN"
```

## 设计要点

- **连接池单例**：MySQL/Redis 在进程启动时初始化一次，全局复用。
- **原子 get-or-create**：登录用 `INSERT ... ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)` 一条 SQL 拿到/创建用户，天然规避并发登录撞唯一键。
- **Cache-Aside 缓存模式**（封装在 `src/utils/cache.js`）：读资料先查 Redis，未命中查 MySQL 回填；并内置三项防护——
  - **防穿透**：不存在的数据也缓存一个短 TTL 的空值标记；
  - **防雪崩**：TTL 加 ±10% 随机抖动，避免 key 集体过期；
  - **写后刷新**：更新后直接把最新值写回缓存，比「删缓存」少一次 miss，也避免删除时机的旧值回填竞争。
- **Redis 会话**：登录时把 token 存入 `session:{userId}`，鉴权中间件比对，支持服务端踢登录。
- **多表事务下单**：`withTransaction` 把「扣库存 + 建订单 + 写明细」包进一个事务，任一步失败整体回滚。
- **订单状态机**：合法流转表集中定义规则，状态变更用守卫式 `UPDATE ... WHERE status=:old`，靠 `affectedRows` 在 DB 层保证并发下不会重复支付/越级流转。
- **统一响应与错误处理**：`{ code, message, data }` 格式 + 全局错误中间件 + `ApiError` 业务异常。
- **优雅关闭**：收到信号先停收请求，再关闭连接池/客户端。

> 架构分层与 DB/Redis 数据流详解见 [`doc/ARCHITECTURE.md`](doc/ARCHITECTURE.md)。
