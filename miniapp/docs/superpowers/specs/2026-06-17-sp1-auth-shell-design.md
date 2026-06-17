# 设计文档:SP1 — 认证完善 + 应用骨架

- 日期:2026-06-17
- 所属:通用前后端框架(SaaS 脚手架)的第一个子项目
- 参考框架:`sub2api` 的 layouts / views / router 结构
- 前置:已完成邮箱认证(注册/登录/验证码)+ 分层后端 + Vue 前端(登录/注册/首页)

## 0. 框架整体拆解(背景)

整个框架拆为 4 个子项目,各走"设计→计划→实现":

| # | 子项目 | 内容 |
|---|--------|------|
| **SP1(本文)** | 认证完善 + 应用骨架 | 找回密码、角色、分双布局、角色路由守卫、个人资料 |
| SP2 | 后台 + 用户管理 | admin 外壳、用户列表/搜索/禁用/改角色 |
| SP3 | 订单 + 支付渠道抽象 | 通用订单模型、可插拔支付渠道(先 mock) |
| SP4 | 后台基础杂项 | 系统设置、公告、仪表盘 |

设计原则:业务无关的核心先搭好,具体业务(小游戏 / API 分销等)以后作为"插件"接入。

## 1. SP1 目标与非目标

**目标**
- 找回/重置密码(邮箱验证码式,复用现有发码机制)
- 用户角色 `user` / `admin`
- 分双布局:前台顶栏(DefaultLayout)+ 后台侧边栏(AdminLayout)
- 按角色的路由守卫(requiresAuth / requiresAdmin)
- 个人资料页(显示邮箱/角色,可改昵称)

**非目标(YAGNI)**
- 多角色/RBAC 权限点(本期只 user/admin 枚举)
- 创建管理员的 UI(首个管理员手动改 SQL)
- 真正的用户管理 CRUD(留给 SP2)
- 自动化测试(本期手动冒烟)

## 2. 数据库改动

新增迁移 `backend/sql/migrations/002_add_user_role.sql`:
```sql
USE `miniapp`;
ALTER TABLE `users` ADD COLUMN `role` VARCHAR(16) NOT NULL DEFAULT 'user'
  COMMENT '角色: user / admin';
```
同步更新 `backend/sql/init.sql` 的 `users` 表加 `role` 列。

**首个管理员:** 注册普通账号后手动执行
`UPDATE users SET role='admin' WHERE email='你的邮箱';`(README/文档写明)。

## 3. 后端设计(分层不变)

### 3.1 角色贯通 JWT
- `auth.service.js` 的 `issueSession`:payload 与返回 user 都加上 `role`。
- `middlewares/auth.js`:`req.user` 增加 `role`(取自 payload)。
- 新增 `middlewares/admin.js`:校验 `req.user.role === 'admin'`,否则抛 403(`ApiError.forbidden`)。需在 `ApiError` 增加 `forbidden(msg, code=40300)` 静态方法(返回 403)。

### 3.2 资料接口补字段
- `user.repository.js` 的 `findById`:SELECT 增加 `email, role`(当前未选,导致资料页拿不到邮箱/角色)。

### 3.3 找回密码(挂 `/api/auth`,加进 auth.route.js)
```
POST /forgot-password  { email }
  - 校验邮箱格式
  - 冷却检查 verify:reset-cd:{email}(60s)
  - 查 findByEmail:
      · 存在 → 生成 6 位码 → 存 Redis verify:reset:{email}(TTL 300s)→ 设冷却键 → 发码
      · 不存在 → 静默跳过(不生成、不发)
  - 无论是否存在,统一返回 { sent: true }(不泄露账号);dev 模式且账号存在时附带 code

POST /reset-password   { email, code, password }
  - 校验邮箱/密码(>=6 位)
  - 比对 Redis verify:reset:{email},不符 → 400
  - findByEmail 不存在 → 400
  - bcrypt.hash(password) → updatePassword → 删码
  - 返回 { reset: true }
```
- `auth.service.js` 新增 `sendResetCode(email)`、`resetPassword(email, code, password)`。
- `user.repository.js` 新增 `updatePassword(id, passwordHash)`。
- `auth.controller.js`、`auth.route.js` 各加两个对应方法/路由。

### 3.4 Redis 键
| 键 | 用途 | TTL |
|----|------|-----|
| `verify:reset:{email}` | 重置密码验证码 | 300s |
| `verify:reset-cd:{email}` | 发码冷却 | 60s |

复用现有 JWT/会话/ApiError/success 机制。

## 4. 前端设计(对齐 sub2api 的 layouts/views/router)

### 4.1 目录
```
frontend/src/
├── layouts/
│   ├── DefaultLayout.vue   前台:顶栏(logo + 用户菜单 + 退出)+ <router-view/>
│   └── AdminLayout.vue     后台:左侧边栏导航 + 顶栏 + <router-view/>
├── router/index.js         嵌套路由 + 角色守卫
├── stores/auth.js          user 含 role;新增 getter isAdmin
├── api/
│   ├── auth.js             新增 forgotPassword / resetPassword
│   └── user.js (新)        getProfile / updateProfile
└── views/
    ├── auth/ForgotPasswordView.vue   邮箱→发码(60s 倒计时)→ 验码 + 新密码,一页完成
    ├── user/ProfileView.vue          显示邮箱/角色,可改昵称并保存
    └── admin/DashboardView.vue       后台首页占位(验证 admin 布局 + 守卫)
```

### 4.2 布局用嵌套路由
```
/login /register /forgot-password        → 无布局(全屏卡片)
/        (component: DefaultLayout)       → children: home, profile
/admin   (component: AdminLayout)         → children: dashboard
```
父路由渲染布局,布局内的 `<router-view/>` 渲染子页面。

### 4.3 路由守卫
```js
router.beforeEach((to) => {
  const auth = useAuthStore();
  if (to.meta.requiresAuth && !auth.isLoggedIn) return '/login';
  if (to.meta.requiresAdmin && !auth.isAdmin) return '/home';  // 非管理员踢回前台
  if (['/login','/register','/forgot-password'].includes(to.path) && auth.isLoggedIn) return '/home';
});
```
- `/` 下子路由 meta.requiresAuth=true;`/admin` 下 meta.requiresAuth=true + requiresAdmin=true。

### 4.4 store 调整
- `state.user` 现在含 `role`;新增 `getters.isAdmin: (s) => s.user?.role === 'admin'`。

### 4.5 数据流(进后台)
```
访问 /admin/dashboard
  → 守卫:已登录? 是 admin?(读 store.isAdmin)
      否 → 跳 /login 或 /home;是 → AdminLayout(侧边栏)渲染 DashboardView
```

## 5. 验收标准(手动冒烟)

1. 跑迁移 002,users 表有 role 列,默认 user。
2. 注册新用户 → 手动 SQL 提为 admin → 重新登录(JWT 带上 role)。
3. 普通用户访问 `/admin/dashboard` → 被守卫踢回;admin 用户可进,看到侧边栏布局。
4. 前台页面(home/profile)是顶栏布局;后台是侧边栏布局。
5. 个人资料页显示当前邮箱 + 角色;改昵称保存成功,刷新后保留。
6. 找回密码:`/forgot-password` 输入邮箱 → 收到/打印重置码 → 输入码+新密码 → 提示成功 → 用新密码登录成功;旧密码登录失败。
7. 错误路径:重置码错/过期、密码太短,均有清晰提示。

## 6. 测试策略

本期手动冒烟(浏览器 + curl + 查 MySQL/Redis),与既有一致。自动化测试待框架稳定后统一补(auth.service、stores/auth 已留好可测边界)。
