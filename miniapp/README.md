# 邮箱认证 Demo(前后端分离)

参考 `sub2api` 的 monorepo 框架,拆分为 `frontend/` + `backend/`。
当前实现第一个核心业务:**邮箱 + 验证码注册、邮箱 + 密码登录,配合后端入库**。

## 目录结构

```
05project/
├── backend/        Node.js + Express + MySQL + Redis(分层架构)
│   ├── src/
│   │   ├── routes/         路由(含 auth.route.js 邮箱认证)
│   │   ├── controllers/    控制器(含 auth.controller.js)
│   │   ├── services/       业务逻辑(auth.service.js / email.service.js)
│   │   ├── repositories/   数据访问(user.repository.js)
│   │   ├── loaders/        MySQL/Redis 连接
│   │   └── ...
│   ├── sql/        init.sql + migrations/
│   └── docker-compose.yml
├── frontend/       Vue3 + Vite + Pinia + Vue Router + Tailwind + axios
│   └── src/
│       ├── api/        axios 封装 + auth 接口
│       ├── stores/     Pinia auth store
│       ├── router/     路由 + 角色守卫(requiresAuth / requiresAdmin)
│       ├── layouts/    DefaultLayout(前台顶栏)/ AdminLayout(后台侧边栏)
│       └── views/      auth/(Login/Register/ForgotPassword)、user/(Home/Profile)、admin/(Dashboard)
└── docs/superpowers/  设计文档(specs)与实现计划(plans)
```

## 启动方式(三步)

```bash
# 1) 起 MySQL + Redis(在 backend/)
cd backend && docker compose up -d

# 2) 起后端(端口 3000)
cd backend && npm install && npm run dev

# 3) 起前端(端口 5173,自动代理 /api 到后端)
cd frontend && npm install && npm run dev
```

浏览器打开 http://localhost:5173 ,先注册再登录。

### 首个管理员

系统没有内置管理员,首个管理员靠手动 SQL 提权:先注册一个普通账号,再把它提为 `admin`:

```sql
UPDATE users SET role='admin' WHERE email='你的邮箱';
```

也可直接用容器执行:

```bash
docker exec miniapp-mysql mysql -uroot -p123456 -e "USE miniapp; UPDATE users SET role='admin' WHERE email='你的邮箱';"
```

> 提权后需**重新登录**,新签发的 token 才带 admin 角色。

> 未配置 SMTP 时,验证码会打印到**后端控制台**,且开发模式下接口会直接返回 code,
> 注册页也会显示出来,本地无需真实邮箱即可走通。

## 邮箱认证接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/send-code` | 发送注册验证码(`{email}`),60s 冷却 |
| POST | `/api/auth/register`  | 注册(`{email,password,code}`),注册即登录,返回 `{token,user}` |
| POST | `/api/auth/login`     | 登录(`{email,password}`),返回 `{token,user}` |
| POST | `/api/auth/forgot-password` | 发送重置密码验证码(`{email}`) |
| POST | `/api/auth/reset-password`  | 用验证码重置密码(`{email,code,password}`) |
| GET  | `/api/admin/ping`     | 仅管理员;验证后端鉴权链路 |
| GET  | `/api/admin/users?page=&pageSize=&email=` | 用户列表(分页 + 邮箱模糊搜索),仅管理员 |
| PATCH | `/api/admin/users/:id/role`   | 改角色 user↔admin(不能改自己),仅管理员 |
| PATCH | `/api/admin/users/:id/status` | 启用/禁用(active/disabled,不能禁用自己),仅管理员 |

- 密码用 `bcrypt` 加盐哈希入库,绝不存明文。
- 登录态复用现有 JWT + Redis 会话(`session:{userId}`)。
- 验证码存 Redis(`verify:register:{email}`,5 分钟有效)。

## 数据库

`users` 表在原微信用户表基础上,新增 `email`(唯一)、`password_hash`,并把 `openid` 改为可空
(邮箱用户没有 openid)。变更见 `backend/sql/migrations/001_add_email_auth.sql`。

`users` 表另有 `role` 字段(`user` / `admin`,默认 `user`)。角色随 JWT 携带:
后端 `admin` 中间件校验角色、前端路由守卫控制后台访问,二者共同把守后台。

`users` 表新增 `status` 字段(`active` / `disabled`,默认 `active`):

- 禁用 = 阻止登录(登录返回「账号已被禁用」)+ 删除该用户 Redis 会话(已登录的会被踢下线)。
- 管理员不能禁用 / 降级自己(后端返回 400,前端灰掉本人行)。

## 前端结构

- 新增 `frontend/src/layouts/`:`DefaultLayout`(前台顶栏)/ `AdminLayout`(后台侧边栏)。
- 双布局:前台页面(`user/Home`、`user/Profile`)用顶栏布局,后台页面(`admin/*`)用侧边栏布局。
- 新增页面:`auth/ForgotPasswordView`、`user/ProfileView`、`admin/DashboardView`。
- 新增后台「用户管理」页 `frontend/src/views/admin/UsersView.vue`(表格 + 邮箱搜索 + 分页 + 改角色 / 启用禁用),AdminLayout 侧边栏新增「用户管理」入口。
- 新增 `frontend/src/api/admin.js`(`listUsers` / `setUserRole` / `setUserStatus`)。
- 路由按角色守卫:未登录访问需鉴权页跳 `/login`;非管理员访问 `/admin/*` 跳 `/home`。

## 说明

- 微信登录(`/api/users/login`)与订单模块原样保留,未受影响。
- 设计文档:`docs/superpowers/specs/2026-06-17-email-auth-design.md`
- 实现计划:`docs/superpowers/plans/2026-06-17-email-auth.md`
