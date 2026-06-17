# 设计文档:SP2 — 后台 + 用户管理

- 日期:2026-06-18
- 所属:通用前后端框架的第二个子项目
- 前置:SP1 已完成(角色 user/admin、admin 中间件、AdminLayout 后台外壳、按角色路由守卫、`GET /api/admin/ping`)

## 1. 目标与非目标

**目标:** 在后台(AdminLayout)里实现用户管理:
- 用户列表(分页 + 按邮箱模糊搜索)
- 改角色(user ↔ admin)
- 启用/禁用账号(禁用 = 阻止登录 + 立即踢下线)
- 自我保护:管理员不能禁用/降级自己

**非目标(YAGNI):**
- 删除用户(用"禁用"代替)
- 重置他人密码、批量操作、导出
- 多字段/高级搜索(只按邮箱)
- 自动化测试(本期手动冒烟)

## 2. 数据库改动

新增迁移 `backend/sql/migrations/003_add_user_status.sql`:
```sql
USE `miniapp`;
ALTER TABLE `users` ADD COLUMN `status` VARCHAR(16) NOT NULL DEFAULT 'active'
  COMMENT '状态: active / disabled';
```
同步更新 `backend/sql/init.sql` 的 users 表加 `status` 列。

## 3. 后端设计(分层不变)

### 3.1 新增 admin 业务层
admin 相关逻辑独立于 auth,新增:
- `services/admin.service.js` —— 列表分页编排、改角色、改状态(含自我保护与踢下线)
- `controllers/admin.controller.js` —— 解析参数、调 service、统一响应
- `repositories/user.repository.js` 新增方法:
  - `listUsers({ email, limit, offset })` —— 邮箱模糊匹配(email 为空则不过滤),按 id DESC,返回行
  - `countUsers({ email })` —— 同条件总数(用于分页)
  - `updateRole(id, role)`
  - `updateStatus(id, status)`

### 3.2 接口(全部挂 `/api/admin`,经 `auth` + `admin` 中间件)
保留已有 `GET /api/admin/ping`,新增:

```
GET /api/admin/users?page=1&pageSize=20&email=<可选>
  - page 默认 1,pageSize 默认 20(上限 100),email 可选模糊匹配
  - 返回 { items: [{id,email,role,status,nickname,created_at}], total, page, pageSize }
  - items 不含 password_hash

PATCH /api/admin/users/:id/role   body: { role }
  - role 必须是 'user' 或 'admin',否则 400
  - 不能改自己(:id === 当前管理员 id)→ 400「不能修改自己的角色」
  - 目标用户不存在 → 404
  - 成功返回更新后的用户(安全字段)

PATCH /api/admin/users/:id/status  body: { status }
  - status 必须是 'active' 或 'disabled',否则 400
  - 不能禁用自己 → 400「不能禁用自己」
  - 目标用户不存在 → 404
  - 当 status=disabled:删除该用户的 Redis 会话 session:{id}(踢下线)
  - 成功返回更新后的用户(安全字段)
```

### 3.3 禁用如何生效(复用现有机制,不改 auth.js)
- **阻止登录**:`auth.service.login` 在校验密码后增加判断 —— `user.status === 'disabled'` → 抛 `ApiError.forbidden('账号已被禁用')`。
- **踢下线**:禁用操作删除 `session:{id}`。该用户下次带旧 token 请求时,现有 `middlewares/auth.js` 的 Redis 会话校验(`cachedToken !== token`)失败 → 401。无需修改 auth.js,也无需把 status 放进 JWT。

### 3.4 自我保护
`admin.service` 的 setRole / setStatus 接收当前管理员 id 作为参数;若等于目标 :id,直接抛 400。前端同时隐藏自己那行的危险操作(双重保险,真正约束在后端)。

## 4. 前端设计

### 4.1 新增/改动
- `api/admin.js`(新):
  - `listUsers({ page, pageSize, email })` → `GET /admin/users`
  - `setUserRole(id, role)` → `PATCH /admin/users/:id/role`
  - `setUserStatus(id, status)` → `PATCH /admin/users/:id/status`
- `views/admin/UsersView.vue`(新):
  - 顶部:邮箱搜索框 + 搜索按钮
  - 表格列:邮箱、角色、状态、注册时间、操作
  - 操作:改角色(user/admin 切换)、启用/禁用按钮
  - 分页:上一页/下一页 + 当前页/总数
  - 当前登录管理员自己那行:角色/禁用操作禁用(灰掉),提示"不能操作自己"
  - 操作成功后刷新当前列表
- `layouts/AdminLayout.vue`:侧边栏在"仪表盘"下加「用户管理」→ `/admin/users`
- `router/index.js`:`/admin` children 加 `{ path: 'users', component: UsersView }`

### 4.2 当前用户 id 来源
前端用 `useAuthStore().user.id` 判断"自己那行"。(登录返回的 user 含 id。)

## 5. 验收标准(手动冒烟)

1. 跑迁移 003,users 表有 status 列(默认 active)。
2. admin 登录 → 进 `/admin/users` → 看到用户列表(分页),能按邮箱搜索。
3. 把 bob 改成 admin、再改回 user,数据库 role 随之变化。
4. 禁用 bob → bob 用密码登录被拒(账号已被禁用);若 bob 已登录,其下一次请求返回 401(被踢)。
5. 启用 bob → 恢复可登录。
6. 管理员对自己那行:改角色/禁用被拒(前端灰掉 + 后端 400)。
7. 普通用户访问任何 `/api/admin/users*` → 403(admin 中间件)。

## 6. 测试策略

本期手动冒烟(curl 验证接口 + 浏览器验证后台页面 + 查 MySQL/Redis)。自动化测试待框架稳定后统一补;admin.service 已按可测试性留好边界(纯函数式的分页参数处理、明确的 service 方法)。
