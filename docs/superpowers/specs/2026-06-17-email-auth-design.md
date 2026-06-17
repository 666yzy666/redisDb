# 设计文档:邮箱注册/登录(前后端分离)

- 日期:2026-06-17
- 范围:第一个核心业务 —— 邮箱 + 验证码注册、邮箱 + 密码登录,配合后端入库
- 参考框架:`D:\03project\09sub2api\sub2api`(monorepo:`backend/` + `frontend/`,前端 Vue3)

---

## 1. 目标与非目标

**目标**
- 把现有项目重新布局为 `frontend/` + `backend/` 的 monorepo。
- 后端在原有 Node.js/Express 基础上**新增**邮箱认证(微信登录、订单模块原样保留)。
- 前端用 Vue3 + JavaScript(不带 TypeScript),结构对齐参考项目。
- 实现闭环:注册(邮箱+验证码+密码)→ 登录(邮箱+密码)→ 登录后页面显示当前用户。

**非目标(本次不做,YAGNI)**
- 找回密码、改密码、第三方登录。
- 邮箱认证的自动化测试(第一轮手动冒烟,结构稳定后再补)。
- 生产级邮件服务、限流中间件、安全加固(仅做基础冷却与校验)。

---

## 2. 文件夹布局

```
05project/
├── backend/                     ← 由 miniapp-server 整体移入,原代码不变
│   ├── src/  sql/  doc/
│   ├── docker-compose.yml  .env  .env.example  package.json
│   └── (微信登录、订单模块保持原样)
├── frontend/                    ← 全新 Vue3 应用
│   ├── index.html  vite.config.js  tailwind.config.js  postcss.config.js
│   ├── package.json  .env
│   └── src/{main.js, App.vue, api/, router/, stores/, views/, components/}
├── docs/superpowers/specs/      ← 本设计文档
└── README.md                    ← 顶层:如何同时启动前后端
```

**已知影响:** docker compose 的数据卷名包含项目目录名(当前为 `miniapp-server_mysql_data`)。移到 `backend/` 后项目名变为 `backend`,会创建全新空库并重跑建表脚本。旧卷数据(此前的测试订单)保留在旧卷中但不再被使用。对学习 demo 无影响,且本次需要给 users 表加邮箱字段,正好重建。**已与用户确认接受。**

---

## 3. 数据库改动

现有 `users` 表:`id, openid(NOT NULL UNIQUE), nickname, avatar_url, created_at, updated_at`。
邮箱用户没有 openid,因此需要让 openid 可空,并新增邮箱与密码哈希列。

新增迁移文件 `backend/sql/migrations/001_add_email_auth.sql`:

```sql
ALTER TABLE users
  MODIFY COLUMN openid VARCHAR(64) NULL COMMENT '微信 openid(邮箱用户为空)',
  ADD COLUMN email         VARCHAR(255) NULL UNIQUE COMMENT '登录邮箱',
  ADD COLUMN password_hash VARCHAR(255) NULL COMMENT 'bcrypt 哈希后的密码';
```

同时同步更新 `backend/sql/init.sql` 的 `CREATE TABLE users`(新环境一步到位)。

**安全约定:** 密码绝不存明文,统一用 `bcryptjs` 加盐哈希;数据库与日志中只出现 `password_hash`。

---

## 4. 后端设计(分层不变,微信登录不动)

邮箱认证单独成组,挂在 `/api/auth` 下,与微信登录 `/api/users/login` 互不干扰。

### 新增/改动文件

| 层 | 文件 | 职责 |
|----|------|------|
| 路由 | `routes/auth.route.js`(新) | 3 个接口挂到 `/api/auth`;在 `routes/index.js` 挂载 |
| 控制器 | `controllers/auth.controller.js`(新) | 解析参数、调 service、统一响应 |
| 服务 | `services/auth.service.js`(新) | 邮箱认证业务:发码、注册、登录 |
| 服务 | `services/email.service.js`(新) | 发邮件;仿 `wechat.service` —— 未配 SMTP 时把验证码打印到控制台,本地可直接跑 |
| 数据访问 | `repositories/user.repository.js`(改) | 新增 `findByEmail(email)`、`createEmailUser({email, passwordHash})` |
| 配置 | `config/index.js` + `.env.example`(改) | 新增 SMTP 配置项与验证码 TTL/冷却 |

### 接口与流程

```
① POST /api/auth/send-code   body: { email }
   - 校验邮箱格式
   - Redis 冷却检查 verify:cooldown:{email}(存在则拒绝,提示稍后再试)
   - 生成 6 位数字验证码 → 存 Redis verify:register:{email}(TTL 300s)
   - 设冷却键 verify:cooldown:{email}(TTL 60s)
   - 调 email.service 发送(或控制台打印)
   - 返回 { sent: true }(dev 模式额外返回 code,方便本地调试)

② POST /api/auth/register    body: { email, password, code }
   - 校验邮箱/密码格式(密码长度 >= 6)
   - 取 Redis verify:register:{email} 比对验证码,不符 → 400
   - findByEmail 查重,已注册 → 400
   - bcrypt.hash(password) → createEmailUser 入库
   - 删除验证码键
   - 签 JWT + 写 Redis 会话 session:{userId}(复用现有机制)
   - 返回 { token, user }(注册即登录)

③ POST /api/auth/login       body: { email, password }
   - findByEmail,不存在 → 401(统一提示"邮箱或密码错误",不泄露账号是否存在)
   - bcrypt.compare,不符 → 401(同上提示)
   - 签 JWT + 写 Redis 会话
   - 返回 { token, user }
```

### Redis 键约定

| 键 | 用途 | TTL |
|----|------|-----|
| `verify:register:{email}` | 注册验证码 | 300s |
| `verify:cooldown:{email}` | 发码冷却,防刷 | 60s |
| `session:{userId}` | 登录会话(复用现有) | 7 天 |

### 复用的现有机制
- `utils/ApiError` 业务异常、`utils/response.success` 统一响应。
- `middlewares/auth.js` 鉴权中间件(不改)。
- `loaders/mysql.js`、`loaders/redis.js` 连接池/客户端单例。
- JWT 签发与 Redis 会话写入逻辑(与 `user.service.login` 一致)。

### 新增后端依赖
- `bcryptjs` —— 纯 JS 密码哈希,WSL 无需本地编译。
- `nodemailer` —— SMTP 发信;未配置时由 `email.service` 走 mock(控制台打印)。

---

## 5. 前端设计(Vue3 + JS + Vite + Pinia + Vue Router + Tailwind + axios)

结构取参考项目 `frontend/src` 的子集:

```
frontend/src/
├── main.js                  应用入口:挂载 Pinia、Router
├── App.vue                  根组件:<router-view/>
├── api/
│   ├── client.js            axios 实例:baseURL=/api、请求拦截器自动带 Bearer token、
│   │                        响应拦截器统一解包 {code,message,data} 与错误提示
│   └── auth.js              sendCode(email) / register(...) / login(...)
├── router/index.js          路由表 + 全局前置守卫(未登录访问受保护页 → 跳 /login)
├── stores/auth.js           Pinia store:token、user;login/register/logout 动作;
│                            token 持久化到 localStorage
└── views/
    ├── auth/LoginView.vue        邮箱 + 密码登录表单
    ├── auth/RegisterView.vue     邮箱 + 「发送验证码」按钮(60s 倒计时) + 验证码 + 密码
    └── HomeView.vue              受保护首页:显示当前登录用户邮箱 + 退出按钮
```

### 数据流(以登录为例)
```
LoginView 提交
  → stores/auth.login(email, password)
      → api/auth.login() → api/client (axios POST /api/auth/login)
          → Vite dev 代理转发到 http://localhost:3000/api/auth/login
      → 拿到 {token, user} → 存入 store + localStorage
  → router 跳转 /home
```

### 跨域处理
开发期用 **Vite 代理**:`vite.config.js` 把 `/api` 转发到 `http://localhost:3000`,前端代码里只写相对路径 `/api/...`,浏览器视角同源,无需后端开 CORS。

### 路由守卫
- `/login`、`/register` 公开。
- `/home`(及未来受保护页)在守卫里检查 store.token,无则重定向到 `/login`。

---

## 6. 运行方式

```bash
# 1) 起基础设施(在 backend/)
cd backend && docker compose up -d        # MySQL + Redis

# 2) 起后端(端口 3000)
cd backend && npm install && npm run dev

# 3) 起前端(端口 5173,代理 /api → 3000)
cd frontend && npm install && npm run dev
# 浏览器打开 http://localhost:5173
```

---

## 7. 验收标准(第一轮手动冒烟)

1. 打开 `/register`,输入邮箱 → 点「发送验证码」→ 后端控制台打印 6 位验证码(未配 SMTP 时)。
2. 填入验证码 + 密码 → 注册成功 → 自动登录并跳转 `/home`,页面显示该邮箱。
3. 数据库 `users` 表出现新行:`email` 已填、`password_hash` 为哈希串(非明文)、`openid` 为 NULL。
4. Redis 中 `session:{userId}` 存在;验证码键已被删除。
5. 退出登录 → 用 `/login` 邮箱+密码重新登录成功。
6. 错误路径:验证码错/过期、邮箱已注册、密码错误,均返回清晰错误提示。

---

## 8. 测试策略

- **本轮:手动冒烟**(浏览器操作 + 查 MySQL 入库 + 查 Redis 键),与既有 curl 验证一脉相承。
- **后续(非本次):** 用 jest + supertest 对 `/api/auth/*` 写集成测试;前端用 vitest 测 store 与 api 封装。结构在 `auth.service` / `stores/auth` 已为可测试性留好边界。
