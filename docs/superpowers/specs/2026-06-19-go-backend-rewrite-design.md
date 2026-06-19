# 设计文档:后端 Go 重写(SP0–SP4 框架)

- 日期:2026-06-19
- 目标:把现有 Node/Express 后端用 Go 重写,保留 SP0–SP4 框架能力,丢弃遗留的微信登录 + 电商订单/商品 demo。
- 参考:sub2api(Go 后端、单二进制嵌前端)。前端、MySQL schema、数据均不变。

## 1. 目标与非目标

**目标**
- 用 Go 重写后端,API 契约与现 Node 版**完全一致**,前端零改动即可切过去。
- 范围:邮箱认证(注册/验证码/登录/找回/重置)、JWT + Redis 会话、角色(user/admin)+ admin 中间件、用户管理、付款订单 + 可插拔支付渠道、公告、系统设置、仪表盘统计、首启自动建管理员。
- 复用现有 MySQL 库与 `backend/sql/init.sql`(schema 不变)。
- 单二进制部署(前端 dist 嵌入 Go 二进制),对齐 sub2api。

**非目标(丢弃)**
- 遗留微信登录(`/api/users/login` code2session)。
- 电商订单/商品/购物车/order_items/状态机 demo。
- 自动化测试(本期手动冒烟,Go 单测后续补)。

## 2. 技术栈

- Go 1.22+
- HTTP:Gin
- DB:`jmoiron/sqlx` + `go-sql-driver/mysql`(手写 SQL,结果映射 struct)
- Redis:`redis/go-redis/v9`
- JWT:`golang-jwt/jwt/v5`
- 密码:`golang.org/x/crypto/bcrypt`
- 邮件:先 mock(SMTP_HOST 空 → 日志打印验证码),真实发信用 `net/smtp` 或 `gopkg.in/gomail.v2`
- 前端嵌入:Go `embed`

## 3. 目录结构(分层,对照现 Node 几乎 1:1)

```
backend-go/
├── go.mod
├── cmd/server/main.go         入口:加载配置 → initDB/initRedis → ensureAdmin → 启动 Gin
└── internal/
    ├── config/config.go       环境变量(同名:MYSQL_* / REDIS_* / JWT_* / SMTP_* / ADMIN_* / VERIFY_* / PORT)
    ├── db/db.go               sqlx 连接池(utf8mb4)
    ├── redisx/redisx.go       go-redis 客户端
    ├── httpx/response.go      统一响应 {code,message,data};ApiError(带 status/code)
    ├── middleware/
    │   ├── auth.go            验 JWT + 比对 Redis session:{userId},注入用户(id/email/role)
    │   ├── admin.go           要求 role==admin,否则 403
    │   └── recover.go         统一 panic/错误 → JSON
    ├── repository/            手写 SQL
    │   ├── user_repo.go       findByEmail/findByID/createEmailUser/updatePassword/updateRole/updateStatus/list/count
    │   ├── payment_repo.go    create/findByID/findByNo/listByUser/listAll/countAll/stats/markPaid/markCancelled
    │   ├── announcement_repo.go
    │   └── setting_repo.go    getAll/get/upsert
    ├── service/
    │   ├── auth.go            sendCode/register/login/sendResetCode/resetPassword/issueSession
    │   ├── payment.go         pay/handleNotify + paymentOrder 编排
    │   ├── channel/           支付渠道:registry + mock(createCharge/parseNotify)
    │   ├── announcement.go
    │   ├── setting.go         白名单 site_name/registration_open,getPublic/getAllForAdmin/updateMany/isRegistrationOpen
    │   ├── admin.go           listUsers/setRole/setStatus/listOrders/getStats/settings/announcements 编排
    │   ├── email.go           sendMail(mock 优先)
    │   └── bootstrap.go       ensureAdmin
    ├── handler/               Gin handlers:auth/user/payment/admin/announcement/setting
    ├── router/router.go       路由注册(/api/...)
    └── web/embed.go           //go:embed dist + 静态托管 + SPA 回退
```

## 4. API 契约(与 Node 完全一致)

| 方法/路径 | 鉴权 | 说明 |
|------|------|------|
| POST /api/auth/send-code | 无 | 发注册验证码 |
| POST /api/auth/register | 无 | 注册(注册即登录) |
| POST /api/auth/login | 无 | 邮箱密码登录 |
| POST /api/auth/forgot-password | 无 | 发重置码 |
| POST /api/auth/reset-password | 无 | 重置密码 |
| GET/PUT /api/users/profile | 用户 | 资料 |
| GET /api/settings/public | 无 | 站名/是否开放注册 |
| GET /api/announcements | 用户 | 已发布公告 |
| POST /api/payment/orders；GET /api/payment/orders | 用户 | 下单/我的 |
| POST /api/payment/orders/:id/pay；/cancel | 用户 | 支付/取消 |
| POST /api/payment/notify/:channel | 无 | 回调(幂等) |
| POST /api/payment/mock/complete | 用户 | 模拟完成 |
| GET /api/admin/ping | admin | 探测 |
| GET /api/admin/users；PATCH /users/:id/role；/status | admin | 用户管理 |
| GET /api/admin/orders；/stats；GET/PUT /settings | admin | 订单/统计/设置 |
| GET/POST/PUT/PATCH/DELETE /api/admin/announcements... | admin | 公告 CRUD |

约定:响应 `{code,message,data}`(成功 code=0);JWT `Authorization: Bearer`;Redis `session:{userId}` 7 天;`verify:register:{email}` / `verify:reset:{email}` + 冷却键;bcrypt 哈希;dev 模式发码接口返回 code,生产打日志。

## 5. 部署(单二进制嵌前端)

- 新多阶段 Dockerfile:① node 构建前端 dist → ② golang 编译(`//go:embed` 前端)→ ③ 极小 alpine 跑二进制。
- compose 的 `app` 改成构建 Go 后端;端口 3000、环境变量、依赖(mysql/redis)不变。
- MySQL 复用 `backend/sql/init.sql`(schema 与 Node 版一致)。

## 6. 位置与切换

- 新建 `backend-go/`;**Node `backend/` 原样保留**,两者并存、互不影响。
- Go 达到对等后,把根 Dockerfile / docker-compose 切到 Go,退役 Node 后端。切换前现有部署照常可用。

## 7. 增量路线(每步一个可运行里程碑)

| 步 | 内容 | 验收 |
|----|------|------|
| **P1 地基** | go.mod、config、db、redisx、httpx、auth/admin/recover 中间件、email(mock)、user_repo、auth service(send-code/register/login)、bootstrap.ensureAdmin、router、main;本地 `go run` 起在 3001(避让 Node)| curl 走通 send-code→register→login;auto-admin 生效 |
| P2 | forgot/reset password、users/profile、角色贯通 JWT、admin 中间件 + /admin/ping | |
| P3 | admin 用户管理(list/role/status,自我保护、禁用删会话) | |
| P4 | payment_repo + 渠道(mock)+ payment service + 路由 + admin orders | |
| P5 | announcement + setting + 公开设置 + 仪表盘 stats | |
| P6 | web embed 前端 + 多阶段 Dockerfile + compose 切换 + 退役 Node | 单二进制部署跑通全套 |

P1 先用独立端口(如 3001)本地 `go run` 验证,不与运行中的 Node 部署(3000)冲突;P6 才正式接管 3000。

## 8. 测试策略

手动冒烟(curl 接口 + 浏览器走前端 + 查 MySQL/Redis),与 Node 侧一致。Go 各 service/repo 边界清晰,后续可补 `go test`。
