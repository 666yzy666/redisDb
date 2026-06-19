# SP2 后台用户管理 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在后台(AdminLayout)实现用户管理:分页+邮箱搜索的用户列表、改角色(user↔admin)、启用/禁用(禁用即阻止登录并踢下线),并带自我保护。

**Architecture:** 后端新增独立的 admin 业务层(admin.service / admin.controller),仓库加用户查询与更新方法;禁用复用现有 Redis 会话机制(删 session 即踢下线),登录处加 status 拦截。前端新增 UsersView 页面 + api/admin.js,接入 AdminLayout 侧边栏与嵌套路由。

**Tech Stack:** Node.js/Express + MySQL + Redis;Vue3 + Vite + Pinia + Vue Router。

**验证方式:** 手动冒烟(curl + 浏览器 + 查 MySQL/Redis),无自动化测试(spec §6)。

参考 spec:`miniapp/docs/superpowers/specs/2026-06-18-sp2-user-management-design.md`。命令默认在 `/home/yzy/05project`;MySQL 容器 `miniapp-mysql`(root/123456,db miniapp)。当前在 `main` 分支(实现前会切到 sp2 分支,由执行流程负责)。

---

## Task 1:数据库迁移 — users 加 status 列

**Files:**
- Create: `miniapp/backend/sql/migrations/003_add_user_status.sql`
- Modify: `miniapp/backend/sql/init.sql`

- [ ] **Step 1: 写迁移文件**

`miniapp/backend/sql/migrations/003_add_user_status.sql`:
```sql
USE `miniapp`;
ALTER TABLE `users` ADD COLUMN `status` VARCHAR(16) NOT NULL DEFAULT 'active'
  COMMENT '状态: active / disabled';
```

- [ ] **Step 2: 同步 init.sql**

在 `miniapp/backend/sql/init.sql` 的 users 表里,`role` 行之后加一行:
```sql
  `status`        VARCHAR(16)  NOT NULL DEFAULT 'active' COMMENT '状态: active / disabled',
```

- [ ] **Step 3: 对运行中的库执行迁移**

```bash
docker exec -i miniapp-mysql mysql -uroot -p123456 < miniapp/backend/sql/migrations/003_add_user_status.sql
```

- [ ] **Step 4: 验证**

```bash
docker exec miniapp-mysql mysql -uroot -p123456 -e "USE miniapp; DESC users;" 2>/dev/null | grep status
```
Expected: 出现 `status  varchar(16)  NO   ...  active`。

- [ ] **Step 5: Commit**

```bash
cd /home/yzy/05project && git add -A && git commit -m "feat(db): add status column to users"
```

---

## Task 2:仓库层 — 用户查询与更新方法

**Files:**
- Modify: `miniapp/backend/src/repositories/user.repository.js`

- [ ] **Step 1: 加 4 个方法**

在 `user.repository.js` 的 `updatePassword` 之后(`}` 闭合对象之前)加入。注意:列表/计数用 `getPool().query`(因带 LIMIT/OFFSET 且 email 可选拼接),角色/状态更新用 `execute`:
```js
  // 用户列表(邮箱模糊搜索 + 分页)。email 为空则不过滤。
  async listUsers({ email, limit, offset }) {
    const where = email ? 'WHERE email LIKE ?' : '';
    const params = email ? [`%${email}%`, limit, offset] : [limit, offset];
    const [rows] = await getPool().query(
      `SELECT id, email, role, status, nickname, created_at FROM users ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
      params
    );
    return rows;
  },

  async countUsers({ email }) {
    const where = email ? 'WHERE email LIKE ?' : '';
    const params = email ? [`%${email}%`] : [];
    const [rows] = await getPool().query(
      `SELECT COUNT(*) AS total FROM users ${where}`,
      params
    );
    return rows[0].total;
  },

  async updateRole(id, role) {
    await getPool().execute('UPDATE users SET role = :role WHERE id = :id', { id, role });
  },

  async updateStatus(id, status) {
    await getPool().execute('UPDATE users SET status = :status WHERE id = :id', { id, status });
  },
```

- [ ] **Step 2: 验证加载**

```bash
cd /home/yzy/05project/miniapp/backend && node -e "require('./src/repositories/user.repository.js'); console.log('ok')"
```
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
cd /home/yzy/05project && git add -A && git commit -m "feat(backend): user repo list/count/updateRole/updateStatus"
```

---

## Task 3:admin.service 业务逻辑

**Files:**
- Create: `miniapp/backend/src/services/admin.service.js`

- [ ] **Step 1: 写 admin.service.js**

```js
'use strict';

const ApiError = require('../utils/ApiError');
const UserRepository = require('../repositories/user.repository');
const { getRedis } = require('../loaders/redis');

const MAX_PAGE_SIZE = 100;
const sessionKey = (userId) => `session:${userId}`;

// 只暴露安全字段
function toSafe(u) {
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    status: u.status,
    nickname: u.nickname,
    created_at: u.created_at,
  };
}

const AdminService = {
  // 用户列表:分页 + 邮箱模糊搜索
  async listUsers({ page, pageSize, email }) {
    const p = Math.max(1, Number(page) || 1);
    const size = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(pageSize) || 20));
    const offset = (p - 1) * size;
    const trimmed = (email || '').trim();

    const [items, total] = await Promise.all([
      UserRepository.listUsers({ email: trimmed, limit: size, offset }),
      UserRepository.countUsers({ email: trimmed }),
    ]);
    return { items, total, page: p, pageSize: size };
  },

  // 改角色;不能改自己
  async setRole(currentUserId, targetId, role) {
    if (role !== 'user' && role !== 'admin') {
      throw ApiError.badRequest('role 必须是 user 或 admin');
    }
    if (Number(targetId) === Number(currentUserId)) {
      throw ApiError.badRequest('不能修改自己的角色');
    }
    const user = await UserRepository.findById(targetId);
    if (!user) throw ApiError.notFound('用户不存在');

    await UserRepository.updateRole(targetId, role);
    return toSafe({ ...user, role });
  },

  // 改状态;不能禁用自己;禁用时踢下线(删会话)
  async setStatus(currentUserId, targetId, status) {
    if (status !== 'active' && status !== 'disabled') {
      throw ApiError.badRequest('status 必须是 active 或 disabled');
    }
    if (Number(targetId) === Number(currentUserId)) {
      throw ApiError.badRequest('不能禁用自己');
    }
    const user = await UserRepository.findById(targetId);
    if (!user) throw ApiError.notFound('用户不存在');

    await UserRepository.updateStatus(targetId, status);
    if (status === 'disabled') {
      await getRedis().del(sessionKey(targetId)); // 立即踢下线
    }
    return toSafe({ ...user, status });
  },
};

module.exports = AdminService;
```

- [ ] **Step 2: 验证加载**

```bash
cd /home/yzy/05project/miniapp/backend && node -e "require('./src/services/admin.service.js'); console.log('ok')"
```
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
cd /home/yzy/05project && git add -A && git commit -m "feat(backend): admin service (list/setRole/setStatus)"
```

---

## Task 4:登录拦截被禁用账号

**Files:**
- Modify: `miniapp/backend/src/services/auth.service.js`

- [ ] **Step 1: 在 login 里加 status 判断**

在 `auth.service.js` 的 `login` 方法中,`bcrypt.compare` 校验通过之后、`return issueSession(user)` 之前,加:
```js
    if (user.status === 'disabled') {
      throw ApiError.forbidden('账号已被禁用');
    }
```
（注意:`findByEmail` 已选出哪些列?当前选了 id,email,password_hash,role,nickname,avatar_url,created_at —— 需要补 `status`。见 Step 2。）

- [ ] **Step 2: 让 findByEmail 选出 status**

在 `miniapp/backend/src/repositories/user.repository.js` 中,把 `findByEmail` 的 SQL 改为(加入 `status`):
```js
      'SELECT id, email, password_hash, role, status, nickname, avatar_url, created_at FROM users WHERE email = :email LIMIT 1',
```

- [ ] **Step 3: 验证加载**

```bash
cd /home/yzy/05project/miniapp/backend && node -e "require('./src/services/auth.service.js'); require('./src/repositories/user.repository.js'); console.log('ok')"
```
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
cd /home/yzy/05project && git add -A && git commit -m "feat(backend): block login for disabled accounts"
```

---

## Task 5:admin.controller + 路由

**Files:**
- Create: `miniapp/backend/src/controllers/admin.controller.js`
- Modify: `miniapp/backend/src/routes/admin.route.js`

- [ ] **Step 1: 写 admin.controller.js**

```js
'use strict';

const AdminService = require('../services/admin.service');
const { success } = require('../utils/response');

const AdminController = {
  async listUsers(req, res) {
    const { page, pageSize, email } = req.query;
    const result = await AdminService.listUsers({ page, pageSize, email });
    return success(res, result);
  },

  async setRole(req, res) {
    const { role } = req.body;
    const user = await AdminService.setRole(req.user.userId, req.params.id, role);
    return success(res, user, '角色已更新');
  },

  async setStatus(req, res) {
    const { status } = req.body;
    const user = await AdminService.setStatus(req.user.userId, req.params.id, status);
    return success(res, user, '状态已更新');
  },
};

module.exports = AdminController;
```

- [ ] **Step 2: 在 admin.route.js 加 3 条用户管理路由**

`miniapp/backend/src/routes/admin.route.js` 现有 `/ping`。整体替换为(保留 ping,新增用户管理,统一在文件顶部加 auth+admin):
```js
'use strict';

const express = require('express');
const auth = require('../middlewares/auth');
const admin = require('../middlewares/admin');
const asyncHandler = require('../middlewares/asyncHandler');
const { success } = require('../utils/response');
const AdminController = require('../controllers/admin.controller');

const router = express.Router();

// 所有 admin 接口都需登录 + 管理员
router.use(auth, admin);

// 验证后端鉴权链路
router.get('/ping', asyncHandler(async (req, res) => {
  return success(res, { admin: true, userId: req.user.userId }, 'pong');
}));

// 用户管理
router.get('/users', asyncHandler(AdminController.listUsers));
router.patch('/users/:id/role', asyncHandler(AdminController.setRole));
router.patch('/users/:id/status', asyncHandler(AdminController.setStatus));

module.exports = router;
```
说明:用 `router.use(auth, admin)` 给本路由下所有接口统一挂中间件,比每条重复写更 DRY;`/ping` 行为不变。

- [ ] **Step 3: 重启后端**

由实现者停掉旧后端(端口 3000),在 `miniapp/backend` 后台 `npm start`,等待 "Server listening"。

- [ ] **Step 4: 冒烟测试**

```bash
B=http://localhost:3000/api
ADMIN=$(curl -s -X POST $B/auth/login -H 'Content-Type: application/json' -d '{"email":"alice@demo.com","password":"secret123"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

echo "[列表] $(curl -s "$B/admin/users?page=1&pageSize=20" -H "Authorization: Bearer $ADMIN" | head -c 200)"
echo "[搜索 bob] $(curl -s "$B/admin/users?email=bob" -H "Authorization: Bearer $ADMIN" | grep -o '"email":"[^"]*"')"

# 改 bob(id=2)角色为 admin 再改回 user
echo "[提 bob 为 admin] $(curl -s -X PATCH $B/admin/users/2/role -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' -d '{"role":"admin"}' | grep -o '"role":"[^"]*"\|"message":"[^"]*"')"
echo "[降 bob 为 user]  $(curl -s -X PATCH $B/admin/users/2/role -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' -d '{"role":"user"}' | grep -o '"role":"[^"]*"')"

# 自我保护:alice(id=1)改自己角色应被拒
echo "[改自己角色 应400] $(curl -s -X PATCH $B/admin/users/1/role -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' -d '{"role":"user"}' | grep -o '"message":"[^"]*"')"

# 禁用 bob → bob 登录应被拒
echo "[禁用 bob] $(curl -s -X PATCH $B/admin/users/2/status -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' -d '{"status":"disabled"}' | grep -o '"status":"[^"]*"')"
echo "[禁用后 bob 登录 应被拒] $(curl -s -X POST $B/auth/login -H 'Content-Type: application/json' -d '{"email":"bob@demo.com","password":"secret123"}' | grep -o '"message":"[^"]*"')"
echo "[启用 bob] $(curl -s -X PATCH $B/admin/users/2/status -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' -d '{"status":"active"}' | grep -o '"status":"[^"]*"')"
echo "[启用后 bob 登录 应成功] $(curl -s -X POST $B/auth/login -H 'Content-Type: application/json' -d '{"email":"bob@demo.com","password":"secret123"}' | grep -o '"message":"[^"]*"')"

# 普通用户访问 admin/users 应 403
USER=$(curl -s -X POST $B/auth/login -H 'Content-Type: application/json' -d '{"email":"bob@demo.com","password":"secret123"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
echo "[user 访问 应403] $(curl -s "$B/admin/users" -H "Authorization: Bearer $USER" | grep -o '"message":"[^"]*"')"
```
Expected: 列表含 items/total;搜索只返回 bob;提/降角色返回对应 role;改自己角色 → `不能修改自己的角色`;禁用返回 disabled、禁用后登录 → `账号已被禁用`;启用后登录 → `登录成功`;user 访问 → `需要管理员权限`。
如有不符,排查修复后再提交。

- [ ] **Step 5: Commit**

```bash
cd /home/yzy/05project && git add -A && git commit -m "feat(backend): admin user-management routes (list/role/status)"
```

---

## Task 6:前端 api/admin.js + 路由 + 侧边栏入口

**Files:**
- Create: `miniapp/frontend/src/api/admin.js`
- Modify: `miniapp/frontend/src/router/index.js`(加 /admin/users 子路由)
- Modify: `miniapp/frontend/src/layouts/AdminLayout.vue`(侧边栏加入口)

- [ ] **Step 1: api/admin.js**

```js
import client from './client';

export const listUsers = (params) => client.get('/admin/users', { params });
export const setUserRole = (id, role) => client.patch(`/admin/users/${id}/role`, { role });
export const setUserStatus = (id, status) => client.patch(`/admin/users/${id}/status`, { status });
```

- [ ] **Step 2: 路由加 /admin/users**

在 `miniapp/frontend/src/router/index.js` 的 `/admin` 路由 children 数组里,`dashboard` 之后加:
```js
      { path: 'users', component: () => import('../views/admin/UsersView.vue') },
```

- [ ] **Step 3: 侧边栏加「用户管理」**

在 `miniapp/frontend/src/layouts/AdminLayout.vue` 的 `<nav>` 里,"仪表盘" router-link 之后加:
```html
        <router-link to="/admin/users" class="block px-3 py-2 rounded hover:bg-gray-700">用户管理</router-link>
```

- [ ] **Step 4: 验证 build(UsersView 暂不存在,先建占位以免 build 失败)**

先创建占位 `miniapp/frontend/src/views/admin/UsersView.vue`:
```vue
<template><div>placeholder</div></template>
```
然后:
```bash
cd /home/yzy/05project/miniapp/frontend && npm run build 2>&1 | tail -6
```
Expected: "built in ..." 无错误。

- [ ] **Step 5: Commit**

```bash
cd /home/yzy/05project && git add -A && git commit -m "feat(frontend): admin api + users route + sidebar entry"
```

---

## Task 7:前端 UsersView 页面

**Files:**
- Modify(覆盖占位): `miniapp/frontend/src/views/admin/UsersView.vue`

- [ ] **Step 1: 写 UsersView.vue**

覆盖占位文件,完整内容:
```vue
<script setup>
import { ref, onMounted } from 'vue';
import { listUsers, setUserRole, setUserStatus } from '../../api/admin';
import { useAuthStore } from '../../stores/auth';

const auth = useAuthStore();
const items = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = 20;
const searchEmail = ref('');
const error = ref('');
const loading = ref(false);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await listUsers({ page: page.value, pageSize, email: searchEmail.value || undefined });
    items.value = res.items;
    total.value = res.total;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

function onSearch() {
  page.value = 1;
  load();
}

function prevPage() {
  if (page.value > 1) { page.value -= 1; load(); }
}
function nextPage() {
  if (page.value * pageSize < total.value) { page.value += 1; load(); }
}

const isSelf = (u) => u.id === auth.user?.id;

async function toggleRole(u) {
  error.value = '';
  try {
    await setUserRole(u.id, u.role === 'admin' ? 'user' : 'admin');
    await load();
  } catch (e) {
    error.value = e.message;
  }
}

async function toggleStatus(u) {
  error.value = '';
  try {
    await setUserStatus(u.id, u.status === 'active' ? 'disabled' : 'active');
    await load();
  } catch (e) {
    error.value = e.message;
  }
}

onMounted(load);
</script>

<template>
  <div class="bg-white rounded-lg shadow p-6 space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="text-lg font-bold">用户管理</h1>
      <div class="flex gap-2">
        <input v-model="searchEmail" placeholder="按邮箱搜索" class="border rounded px-3 py-1 text-sm" @keyup.enter="onSearch" />
        <button @click="onSearch" class="bg-blue-600 text-white rounded px-3 py-1 text-sm">搜索</button>
      </div>
    </div>

    <p v-if="error" class="text-red-500 text-sm">{{ error }}</p>

    <table class="w-full text-sm border-collapse">
      <thead>
        <tr class="text-left text-gray-500 border-b">
          <th class="py-2">ID</th><th>邮箱</th><th>角色</th><th>状态</th><th>注册时间</th><th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="u in items" :key="u.id" class="border-b">
          <td class="py-2">{{ u.id }}</td>
          <td>{{ u.email || '(无)' }}</td>
          <td>
            <span :class="u.role === 'admin' ? 'text-purple-600' : 'text-gray-700'">{{ u.role }}</span>
          </td>
          <td>
            <span :class="u.status === 'active' ? 'text-green-600' : 'text-red-500'">{{ u.status }}</span>
          </td>
          <td class="text-gray-400">{{ u.created_at }}</td>
          <td class="space-x-2">
            <template v-if="isSelf(u)">
              <span class="text-gray-400 text-xs">本人不可操作</span>
            </template>
            <template v-else>
              <button @click="toggleRole(u)" class="text-blue-600 hover:underline">
                {{ u.role === 'admin' ? '降为user' : '提为admin' }}
              </button>
              <button @click="toggleStatus(u)" :class="u.status === 'active' ? 'text-red-500' : 'text-green-600'" class="hover:underline">
                {{ u.status === 'active' ? '禁用' : '启用' }}
              </button>
            </template>
          </td>
        </tr>
      </tbody>
    </table>

    <div class="flex items-center justify-between text-sm">
      <span class="text-gray-500">共 {{ total }} 人 · 第 {{ page }} 页</span>
      <div class="space-x-2">
        <button @click="prevPage" :disabled="page <= 1" class="border rounded px-3 py-1 disabled:opacity-40">上一页</button>
        <button @click="nextPage" :disabled="page * pageSize >= total" class="border rounded px-3 py-1 disabled:opacity-40">下一页</button>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: 验证 build**

```bash
cd /home/yzy/05project/miniapp/frontend && npm run build 2>&1 | tail -6
```
Expected: "built in ..." 无错误。

- [ ] **Step 3: 起前端 + 代理冒烟(无浏览器,验证 build 与 /api 代理)**

```bash
cd /home/yzy/05project/miniapp/frontend && (npm run dev > /tmp/sp2-fe.log 2>&1 &) ; sleep 4 ; grep -o "Local:.*" /tmp/sp2-fe.log | head -1
echo "homepage: $(curl -s -o /dev/null -w '%{http_code}' http://localhost:5173/)"
ADMIN=$(curl -s -X POST http://localhost:5173/api/auth/login -H 'Content-Type: application/json' -d '{"email":"alice@demo.com","password":"secret123"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
echo "proxy users 列表: $(curl -s "http://localhost:5173/api/admin/users?pageSize=5" -H "Authorization: Bearer $ADMIN" | grep -o '"total":[0-9]*')"
pkill -f vite 2>/dev/null; echo stopped
```
Expected: homepage `200`;proxy users 列表返回 `"total":N`。

- [ ] **Step 4: Commit**

```bash
cd /home/yzy/05project && git add -A && git commit -m "feat(frontend): admin UsersView (list/search/paginate/role/status)"
```

---

## Task 8:文档 + 回归

**Files:**
- Modify: `miniapp/README.md`

- [ ] **Step 1: 更新 README**

在 README 增加:
- 接口表加 3 行:`GET /api/admin/users`(分页+邮箱搜索)、`PATCH /api/admin/users/:id/role`、`PATCH /api/admin/users/:id/status`。
- 说明 users 表新增 `status`(active/disabled);禁用=阻止登录+删 Redis 会话踢下线;管理员不能操作自己。
- 前端结构补充:后台「用户管理」页 `views/admin/UsersView.vue`、`api/admin.js`。

- [ ] **Step 2: 回归冒烟**

按 spec §5 验收标准逐条过一遍(迁移、列表/搜索、改角色、禁用拦登录+踢下线、启用恢复、自我保护、普通用户 403)。

- [ ] **Step 3: Commit**

```bash
cd /home/yzy/05project && git add -A && git commit -m "docs: document SP2 user management"
```

---

## 自查记录(spec 覆盖)

- §2 数据库 status → Task 1。
- §3.1 admin 业务层 / 仓库方法 → Task 2(仓库)、Task 3(service)。
- §3.2 三接口 → Task 5(controller + route)。
- §3.3 禁用拦登录 + 踢下线 → Task 4(登录拦截)+ Task 3 setStatus 删会话。
- §3.4 自我保护 → Task 3(后端 400)+ Task 7(前端本人行禁用)。
- §4 前端 api/页面/侧边栏/路由 → Task 6、7。
- §5 验收 → Task 5/7/8 冒烟。
- §6 测试(手动冒烟)→ 各 Task 验证步骤。
- 类型一致性:items 字段(id,email,role,status,nickname,created_at)在仓库 listUsers、service toSafe、前端表格三处一致;角色值 user/admin、状态值 active/disabled 全程一致。
