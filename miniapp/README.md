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
│       ├── router/     路由 + 登录守卫
│       └── views/      LoginView / RegisterView / HomeView
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

> 未配置 SMTP 时,验证码会打印到**后端控制台**,且开发模式下接口会直接返回 code,
> 注册页也会显示出来,本地无需真实邮箱即可走通。

## 邮箱认证接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/send-code` | 发送注册验证码(`{email}`),60s 冷却 |
| POST | `/api/auth/register`  | 注册(`{email,password,code}`),注册即登录,返回 `{token,user}` |
| POST | `/api/auth/login`     | 登录(`{email,password}`),返回 `{token,user}` |

- 密码用 `bcrypt` 加盐哈希入库,绝不存明文。
- 登录态复用现有 JWT + Redis 会话(`session:{userId}`)。
- 验证码存 Redis(`verify:register:{email}`,5 分钟有效)。

## 数据库

`users` 表在原微信用户表基础上,新增 `email`(唯一)、`password_hash`,并把 `openid` 改为可空
(邮箱用户没有 openid)。变更见 `backend/sql/migrations/001_add_email_auth.sql`。

## 说明

- 微信登录(`/api/users/login`)与订单模块原样保留,未受影响。
- 设计文档:`docs/superpowers/specs/2026-06-17-email-auth-design.md`
- 实现计划:`docs/superpowers/plans/2026-06-17-email-auth.md`
