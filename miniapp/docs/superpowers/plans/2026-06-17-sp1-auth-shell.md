# SP1 认证完善 + 应用骨架 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有邮箱认证基础上,补齐找回密码、用户角色(user/admin)、前台/后台分双布局、按角色路由守卫、个人资料页,形成可复用的框架骨架。

**Architecture:** 后端沿用 Express 分层(routes→controllers→services→repositories);角色随 JWT 传递,新增 admin 中间件;找回密码复用邮箱验证码机制。前端用 Vue3 嵌套路由 + 两套布局组件(DefaultLayout/AdminLayout),路由守卫按 store 里的角色放行。

**Tech Stack:** Node.js/Express + MySQL + Redis + bcryptjs;Vue3 + Vite + Pinia + Vue Router。

**验证方式:** 手动冒烟(curl + 浏览器 + 查 MySQL/Redis),不写自动化测试(spec §6)。

参考 spec:`miniapp/docs/superpowers/specs/2026-06-17-sp1-auth-shell-design.md`。所有命令默认在 `/home/yzy/05project` 下;容器名 `miniapp-mysql` / `miniapp-redis`。

---

## Task 1:数据库迁移 — users 加 role 列

**Files:**
- Create: `miniapp/backend/sql/migrations/002_add_user_role.sql`
- Modify: `miniapp/backend/sql/init.sql`(users 表加 role)

- [ ] **Step 1: 写迁移文件**

`miniapp/backend/sql/migrations/002_add_user_role.sql`:
```sql
USE `miniapp`;
ALTER TABLE `users` ADD COLUMN `role` VARCHAR(16) NOT NULL DEFAULT 'user'
  COMMENT '角色: user / admin';
```

- [ ] **Step 2: 同步 init.sql**

在 `miniapp/backend/sql/init.sql` 的 users 表里,`avatar_url` 行之后加一行:
```sql
  `role`          VARCHAR(16)  NOT NULL DEFAULT 'user' COMMENT '角色: user / admin',
```

- [ ] **Step 3: 对运行中的库执行迁移(不重建,保留现有用户)**

```bash
docker exec -i miniapp-mysql mysql -uroot -p123456 < miniapp/backend/sql/migrations/002_add_user_role.sql
```

- [ ] **Step 4: 验证**

```bash
docker exec miniapp-mysql mysql -uroot -p123456 -e "USE miniapp; DESC users;" 2>/dev/null | grep role
```
Expected: 出现 `role  varchar(16)  NO   ...  user`。

- [ ] **Step 5: Commit**

```bash
cd /home/yzy/05project && git add -A && git commit -m "feat(db): add role column to users"
```

---

## Task 2:后端角色贯通(JWT + 中间件 + 仓库)

**Files:**
- Modify: `miniapp/backend/src/utils/ApiError.js`(加 forbidden)
- Create: `miniapp/backend/src/middlewares/admin.js`
- Modify: `miniapp/backend/src/middlewares/auth.js`(req.user 带 role)
- Modify: `miniapp/backend/src/services/auth.service.js`(JWT + safeUser 带 role)
- Modify: `miniapp/backend/src/repositories/user.repository.js`(findById/findByEmail 选 role)

- [ ] **Step 1: ApiError 加 forbidden**

在 `ApiError.js` 的 `notFound` 静态方法之后加:
```js
  static forbidden(msg = '无权限', code = 40300) {
    return new ApiError(403, msg, code);
  }
```

- [ ] **Step 2: 新建 admin 中间件**

`miniapp/backend/src/middlewares/admin.js`:
```js
'use strict';

const ApiError = require('../utils/ApiError');

// 必须在 auth 之后使用:校验当前用户是管理员
module.exports = function admin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return next(ApiError.forbidden('需要管理员权限'));
  }
  next();
};
```

- [ ] **Step 3: auth 中间件把 role 放进 req.user**

在 `miniapp/backend/src/middlewares/auth.js` 中,把
```js
    req.user = { userId: payload.userId, openid: payload.openid };
```
改为:
```js
    req.user = { userId: payload.userId, email: payload.email, role: payload.role };
```

- [ ] **Step 4: 仓库的 findById / findByEmail 选出 role**

在 `miniapp/backend/src/repositories/user.repository.js`:
- `findById` 的 SQL 改为:
```js
      'SELECT id, openid, email, role, nickname, avatar_url, created_at FROM users WHERE id = :id LIMIT 1',
```
- `findByEmail` 的 SQL 改为:
```js
      'SELECT id, email, password_hash, role, nickname, avatar_url, created_at FROM users WHERE email = :email LIMIT 1',
```

- [ ] **Step 5: issueSession 把 role 写进 JWT 与返回 user**

在 `miniapp/backend/src/services/auth.service.js` 的 `issueSession` 中:
- `jwt.sign` 的 payload 改为带 role:
```js
  const token = jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
```
- `safeUser` 加 role:
```js
  const safeUser = {
    id: user.id,
    email: user.email,
    role: user.role,
    nickname: user.nickname,
    avatar_url: user.avatar_url,
    created_at: user.created_at,
  };
```

- [ ] **Step 6: 验证加载无语法错误**

```bash
cd /home/yzy/05project/miniapp/backend && node -e "require('./src/middlewares/admin.js'); require('./src/services/auth.service.js'); console.log('ok')"
```
Expected: `ok`

- [ ] **Step 7: Commit**

```bash
cd /home/yzy/05project && git add -A && git commit -m "feat(backend): carry role in JWT, add admin middleware"
```

---

## Task 3:后端找回密码(发码 + 重置)+ 管理员探测接口

**Files:**
- Modify: `miniapp/backend/src/services/auth.service.js`(sendResetCode/resetPassword)
- Modify: `miniapp/backend/src/repositories/user.repository.js`(updatePassword)
- Modify: `miniapp/backend/src/controllers/auth.controller.js`(forgotPassword/resetPassword)
- Modify: `miniapp/backend/src/routes/auth.route.js`(两路由)
- Create: `miniapp/backend/src/routes/admin.route.js`(admin ping)
- Modify: `miniapp/backend/src/routes/index.js`(挂载 /admin)

- [ ] **Step 1: 仓库加 updatePassword**

在 `user.repository.js` 的 `createEmailUser` 之后加:
```js
  async updatePassword(id, passwordHash) {
    await getPool().execute(
      'UPDATE users SET password_hash = :passwordHash WHERE id = :id',
      { id, passwordHash }
    );
  },
```

- [ ] **Step 2: auth.service 加重置码与重置逻辑**

在 `auth.service.js` 顶部 key 定义区加:
```js
const resetCodeKey = (email) => `verify:reset:${email}`;
const resetCdKey = (email) => `verify:reset-cd:${email}`;
```
在 `AuthService` 对象里(`login` 之后)加两个方法:
```js
  // 发送重置密码验证码(账号不存在时静默,不泄露)
  async sendResetCode(email) {
    assertEmail(email);
    const redis = getRedis();
    if (await redis.get(resetCdKey(email))) {
      throw ApiError.badRequest('验证码发送过于频繁,请稍后再试', 42900);
    }
    const user = await UserRepository.findByEmail(email);
    if (user) {
      const code = genCode();
      await redis.set(resetCodeKey(email), code, 'EX', config.verify.codeTtl);
      await redis.set(resetCdKey(email), '1', 'EX', config.verify.cooldown);
      await emailService.sendMail(
        email,
        '重置密码验证码',
        `您的重置验证码是 ${code},${Math.floor(config.verify.codeTtl / 60)} 分钟内有效。`
      );
      logger.info(`已为 ${email} 生成重置验证码`);
      return config.env === 'development' ? { sent: true, code } : { sent: true };
    }
    // 账号不存在:静默返回,不泄露
    return { sent: true };
  },

  // 用验证码重置密码
  async resetPassword(email, code, password) {
    assertEmail(email);
    assertPassword(password);
    if (!code) throw ApiError.badRequest('请输入验证码');

    const redis = getRedis();
    const real = await redis.get(resetCodeKey(email));
    if (!real || real !== String(code)) {
      throw ApiError.badRequest('验证码错误或已过期', 40010);
    }
    const user = await UserRepository.findByEmail(email);
    if (!user) throw ApiError.badRequest('账号不存在', 40012);

    const passwordHash = await bcrypt.hash(password, 10);
    await UserRepository.updatePassword(user.id, passwordHash);
    await redis.del(resetCodeKey(email));
    return { reset: true };
  },
```

- [ ] **Step 3: controller 加两方法**

在 `auth.controller.js` 的 `login` 之后加:
```js
  async forgotPassword(req, res) {
    const { email } = req.body;
    const result = await AuthService.sendResetCode(email);
    return success(res, result, '验证码已发送');
  },

  async resetPassword(req, res) {
    const { email, code, password } = req.body;
    const result = await AuthService.resetPassword(email, code, password);
    return success(res, result, '密码已重置');
  },
```

- [ ] **Step 4: 路由加两条**

在 `auth.route.js` 的 login 路由之后加:
```js
router.post('/forgot-password', asyncHandler(AuthController.forgotPassword));
router.post('/reset-password', asyncHandler(AuthController.resetPassword));
```

- [ ] **Step 5: 新建 admin 路由(探测管理员鉴权)**

`miniapp/backend/src/routes/admin.route.js`:
```js
'use strict';

const express = require('express');
const auth = require('../middlewares/auth');
const admin = require('../middlewares/admin');
const asyncHandler = require('../middlewares/asyncHandler');
const { success } = require('../utils/response');

const router = express.Router();

// 仅管理员可访问;用于前端后台验证后端鉴权链路
router.get('/ping', auth, admin, asyncHandler(async (req, res) => {
  return success(res, { admin: true, userId: req.user.userId }, 'pong');
}));

module.exports = router;
```

- [ ] **Step 6: 挂载 /admin**

在 `miniapp/backend/src/routes/index.js` 顶部引入:
```js
const adminRoute = require('./admin.route');
```
在 `router.use('/auth', authRoute);` 之后加:
```js
router.use('/admin', adminRoute);
```

- [ ] **Step 7: 重启后端**

由实现者用 TaskStop 停掉旧后端,再于 `miniapp/backend` 后台 `npm start`,等待 "Server listening"。

- [ ] **Step 8: 冒烟测试找回密码 + 管理员鉴权**

```bash
B=http://localhost:3000/api
# 提一个已有用户为 admin(用现有 alice@demo.com)
docker exec miniapp-mysql mysql -uroot -p123456 -e "USE miniapp; UPDATE users SET role='admin' WHERE email='alice@demo.com';" 2>/dev/null

# admin 登录拿 token
TOKEN=$(curl -s -X POST $B/auth/login -H 'Content-Type: application/json' -d '{"email":"alice@demo.com","password":"secret123"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
echo "admin ping(应 pong): $(curl -s $B/admin/ping -H "Authorization: Bearer $TOKEN" | grep -o '"message":"[^"]*"')"

# 普通用户 bob 访问 admin/ping(应 403)
TOKEN2=$(curl -s -X POST $B/auth/login -H 'Content-Type: application/json' -d '{"email":"bob@demo.com","password":"secret123"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
echo "user ping(应403): $(curl -s $B/admin/ping -H "Authorization: Bearer $TOKEN2" | grep -o '"message":"[^"]*"')"

# 找回密码:发码 → 重置 → 用新密码登录
SEND=$(curl -s -X POST $B/auth/forgot-password -H 'Content-Type: application/json' -d '{"email":"bob@demo.com"}')
CODE=$(echo "$SEND" | grep -o '"code":"[0-9]*"' | grep -o '[0-9]*')
echo "reset: $(curl -s -X POST $B/auth/reset-password -H 'Content-Type: application/json' -d "{\"email\":\"bob@demo.com\",\"code\":\"$CODE\",\"password\":\"newpass123\"}" | grep -o '"message":"[^"]*"')"
echo "新密码登录: $(curl -s -X POST $B/auth/login -H 'Content-Type: application/json' -d '{"email":"bob@demo.com","password":"newpass123"}' | grep -o '"message":"[^"]*"')"
```
Expected: admin ping 返回 `pong`;user ping 返回 `需要管理员权限`;reset 返回 `密码已重置`;新密码登录返回 `登录成功`。

- [ ] **Step 9: Commit**

```bash
cd /home/yzy/05project && git add -A && git commit -m "feat(backend): forgot/reset password + admin ping route"
```

---

## Task 4:前端 store 角色 + api 扩展

**Files:**
- Modify: `miniapp/frontend/src/stores/auth.js`(isAdmin getter)
- Modify: `miniapp/frontend/src/api/auth.js`(forgotPassword/resetPassword)
- Create: `miniapp/frontend/src/api/user.js`(getProfile/updateProfile)

- [ ] **Step 1: store 加 isAdmin**

在 `stores/auth.js` 的 `getters` 中,`isLoggedIn` 之后加:
```js
    isAdmin: (s) => s.user?.role === 'admin',
```

- [ ] **Step 2: api/auth.js 加两个调用**

在 `api/auth.js` 末尾加:
```js
export const forgotPassword = (email) => client.post('/auth/forgot-password', { email });
export const resetPassword = (email, code, password) =>
  client.post('/auth/reset-password', { email, code, password });
```

- [ ] **Step 3: 新建 api/user.js**

`miniapp/frontend/src/api/user.js`:
```js
import client from './client';

export const getProfile = () => client.get('/users/profile');
export const updateProfile = (data) => client.put('/users/profile', data);
```

- [ ] **Step 4: Commit**

```bash
cd /home/yzy/05project && git add -A && git commit -m "feat(frontend): isAdmin getter + auth/user api calls"
```

---

## Task 5:前端布局 + 嵌套路由 + 守卫

**Files:**
- Create: `miniapp/frontend/src/layouts/DefaultLayout.vue`
- Create: `miniapp/frontend/src/layouts/AdminLayout.vue`
- Modify: `miniapp/frontend/src/router/index.js`(嵌套路由 + 守卫)

- [ ] **Step 1: DefaultLayout(前台顶栏)**

`miniapp/frontend/src/layouts/DefaultLayout.vue`:
```vue
<script setup>
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const auth = useAuthStore();

function logout() {
  auth.logout();
  router.push('/login');
}
</script>

<template>
  <div class="min-h-screen bg-gray-100">
    <header class="bg-white shadow flex items-center justify-between px-6 h-14">
      <div class="font-bold text-blue-600">MiniApp 框架</div>
      <nav class="flex items-center gap-4 text-sm">
        <router-link to="/home" class="text-gray-700 hover:text-blue-600">首页</router-link>
        <router-link to="/profile" class="text-gray-700 hover:text-blue-600">个人资料</router-link>
        <router-link v-if="auth.isAdmin" to="/admin/dashboard" class="text-gray-700 hover:text-blue-600">后台</router-link>
        <span class="text-gray-400">{{ auth.user?.email }}</span>
        <button @click="logout" class="text-red-500 hover:underline">退出</button>
      </nav>
    </header>
    <main class="p-6"><router-view /></main>
  </div>
</template>
```

- [ ] **Step 2: AdminLayout(后台侧边栏)**

`miniapp/frontend/src/layouts/AdminLayout.vue`:
```vue
<script setup>
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const auth = useAuthStore();

function logout() {
  auth.logout();
  router.push('/login');
}
</script>

<template>
  <div class="min-h-screen flex bg-gray-100">
    <aside class="w-48 bg-gray-800 text-gray-100 flex flex-col">
      <div class="h-14 flex items-center px-4 font-bold border-b border-gray-700">管理后台</div>
      <nav class="flex-1 p-2 space-y-1 text-sm">
        <router-link to="/admin/dashboard" class="block px-3 py-2 rounded hover:bg-gray-700">仪表盘</router-link>
        <!-- SP2 起在此加：用户管理 / 订单 等 -->
      </nav>
      <router-link to="/home" class="px-4 py-3 text-xs text-gray-400 hover:text-white border-t border-gray-700">← 返回前台</router-link>
    </aside>
    <div class="flex-1 flex flex-col">
      <header class="bg-white shadow flex items-center justify-end px-6 h-14 gap-4 text-sm">
        <span class="text-gray-400">{{ auth.user?.email }}（管理员）</span>
        <button @click="logout" class="text-red-500 hover:underline">退出</button>
      </header>
      <main class="p-6 flex-1"><router-view /></main>
    </div>
  </div>
</template>
```

- [ ] **Step 3: 改写 router 为嵌套路由 + 角色守卫**

整体替换 `miniapp/frontend/src/router/index.js`:
```js
import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import DefaultLayout from '../layouts/DefaultLayout.vue';
import AdminLayout from '../layouts/AdminLayout.vue';

const routes = [
  { path: '/', redirect: '/home' },

  // 无布局(全屏认证页)
  { path: '/login', component: () => import('../views/auth/LoginView.vue') },
  { path: '/register', component: () => import('../views/auth/RegisterView.vue') },
  { path: '/forgot-password', component: () => import('../views/auth/ForgotPasswordView.vue') },

  // 前台(顶栏布局,需登录)
  {
    path: '/',
    component: DefaultLayout,
    meta: { requiresAuth: true },
    children: [
      { path: 'home', component: () => import('../views/HomeView.vue') },
      { path: 'profile', component: () => import('../views/user/ProfileView.vue') },
    ],
  },

  // 后台(侧边栏布局,需管理员)
  {
    path: '/admin',
    component: AdminLayout,
    meta: { requiresAuth: true, requiresAdmin: true },
    children: [
      { path: 'dashboard', component: () => import('../views/admin/DashboardView.vue') },
    ],
  },
];

const router = createRouter({ history: createWebHistory(), routes });

router.beforeEach((to) => {
  const auth = useAuthStore();
  const needsAuth = to.matched.some((r) => r.meta.requiresAuth);
  const needsAdmin = to.matched.some((r) => r.meta.requiresAdmin);
  if (needsAuth && !auth.isLoggedIn) return '/login';
  if (needsAdmin && !auth.isAdmin) return '/home';
  if (['/login', '/register', '/forgot-password'].includes(to.path) && auth.isLoggedIn) return '/home';
});

export default router;
```
说明:用 `to.matched.some(...)` 让父路由(布局)上的 meta 对所有子路由生效。

- [ ] **Step 4: Commit**

```bash
cd /home/yzy/05project && git add -A && git commit -m "feat(frontend): dual layouts + nested routes + role guards"
```

---

## Task 6:前端三个页面(找回密码 / 资料 / 后台首页)

**Files:**
- Create: `miniapp/frontend/src/views/auth/ForgotPasswordView.vue`
- Create: `miniapp/frontend/src/views/user/ProfileView.vue`
- Create: `miniapp/frontend/src/views/admin/DashboardView.vue`

- [ ] **Step 1: ForgotPasswordView**

`miniapp/frontend/src/views/auth/ForgotPasswordView.vue`:
```vue
<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { forgotPassword, resetPassword } from '../../api/auth';

const email = ref('');
const code = ref('');
const password = ref('');
const error = ref('');
const info = ref('');
const loading = ref(false);
const countdown = ref(0);
const router = useRouter();

async function onSendCode() {
  error.value = '';
  info.value = '';
  try {
    const res = await forgotPassword(email.value);
    info.value = res.code ? `重置码(dev):${res.code}` : '若邮箱已注册,验证码已发送';
    countdown.value = 60;
    const timer = setInterval(() => {
      countdown.value -= 1;
      if (countdown.value <= 0) clearInterval(timer);
    }, 1000);
  } catch (e) {
    error.value = e.message;
  }
}

async function onSubmit() {
  error.value = '';
  loading.value = true;
  try {
    await resetPassword(email.value, code.value, password.value);
    info.value = '密码已重置,请用新密码登录';
    setTimeout(() => router.push('/login'), 800);
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-100">
    <form class="bg-white p-8 rounded-lg shadow w-80 space-y-4" @submit.prevent="onSubmit">
      <h1 class="text-xl font-bold text-center">找回密码</h1>
      <input v-model="email" type="email" placeholder="邮箱" class="w-full border rounded px-3 py-2" />
      <div class="flex gap-2">
        <input v-model="code" placeholder="验证码" class="flex-1 border rounded px-3 py-2" />
        <button type="button" :disabled="countdown > 0" @click="onSendCode"
          class="whitespace-nowrap border rounded px-3 text-sm disabled:opacity-50">
          {{ countdown > 0 ? `${countdown}s` : '发送验证码' }}
        </button>
      </div>
      <input v-model="password" type="password" placeholder="新密码(至少6位)" class="w-full border rounded px-3 py-2" />
      <p v-if="info" class="text-green-600 text-sm">{{ info }}</p>
      <p v-if="error" class="text-red-500 text-sm">{{ error }}</p>
      <button :disabled="loading" class="w-full bg-blue-600 text-white rounded py-2 disabled:opacity-50">
        {{ loading ? '提交中...' : '重置密码' }}
      </button>
      <p class="text-sm text-center"><router-link to="/login" class="text-blue-600">返回登录</router-link></p>
    </form>
  </div>
</template>
```

- [ ] **Step 2: 登录页加"忘记密码"入口**

在 `miniapp/frontend/src/views/auth/LoginView.vue` 模板里,"去注册"那段 `<p>` 之后加:
```html
      <p class="text-sm text-center"><router-link to="/forgot-password" class="text-gray-500">忘记密码?</router-link></p>
```

- [ ] **Step 3: ProfileView(读资料 + 改昵称)**

`miniapp/frontend/src/views/user/ProfileView.vue`:
```vue
<script setup>
import { ref, onMounted } from 'vue';
import { getProfile, updateProfile } from '../../api/user';
import { useAuthStore } from '../../stores/auth';

const auth = useAuthStore();
const profile = ref(null);
const nickname = ref('');
const msg = ref('');
const error = ref('');

onMounted(async () => {
  try {
    profile.value = await getProfile();
    nickname.value = profile.value.nickname || '';
  } catch (e) {
    error.value = e.message;
  }
});

async function onSave() {
  msg.value = '';
  error.value = '';
  try {
    const updated = await updateProfile({ nickname: nickname.value });
    profile.value = updated;
    msg.value = '保存成功';
  } catch (e) {
    error.value = e.message;
  }
}
</script>

<template>
  <div class="max-w-md mx-auto bg-white rounded-lg shadow p-6 space-y-4">
    <h1 class="text-lg font-bold">个人资料</h1>
    <div v-if="profile" class="space-y-3 text-sm">
      <div><span class="text-gray-500">邮箱:</span> {{ profile.email }}</div>
      <div><span class="text-gray-500">角色:</span> {{ profile.role }}</div>
      <div>
        <label class="text-gray-500 block mb-1">昵称</label>
        <input v-model="nickname" class="w-full border rounded px-3 py-2" placeholder="设置昵称" />
      </div>
      <p v-if="msg" class="text-green-600">{{ msg }}</p>
      <p v-if="error" class="text-red-500">{{ error }}</p>
      <button @click="onSave" class="bg-blue-600 text-white rounded px-4 py-2">保存</button>
    </div>
    <p v-else-if="error" class="text-red-500 text-sm">{{ error }}</p>
    <p v-else class="text-gray-400 text-sm">加载中...</p>
  </div>
</template>
```

- [ ] **Step 4: 后台 DashboardView(占位 + 调 admin/ping 验证后端鉴权)**

`miniapp/frontend/src/views/admin/DashboardView.vue`:
```vue
<script setup>
import { ref, onMounted } from 'vue';
import client from '../../api/client';

const status = ref('检测中...');
onMounted(async () => {
  try {
    const res = await client.get('/admin/ping');
    status.value = res.admin ? '后端已确认:你是管理员 ✅' : '未知';
  } catch (e) {
    status.value = '后端鉴权失败:' + e.message;
  }
});
</script>

<template>
  <div class="bg-white rounded-lg shadow p-6 space-y-3">
    <h1 class="text-lg font-bold">管理后台 · 仪表盘</h1>
    <p class="text-gray-600 text-sm">这是后台占位页,用于验证「侧边栏布局 + 管理员守卫」已生效。</p>
    <p class="text-sm">{{ status }}</p>
    <p class="text-gray-400 text-xs">用户管理、订单等功能将在 SP2 起加入左侧菜单。</p>
  </div>
</template>
```

- [ ] **Step 5: 起前端,端到端冒烟**

由实现者在 `miniapp/frontend` 后台 `npm run dev`,等待 vite ready。浏览器:
1. `/login` 用 alice(已提为 admin)登录 → 顶栏出现"后台"链接 → 点进 `/admin/dashboard` → 侧边栏布局 + 显示"你是管理员 ✅"。
2. 用 bob(普通用户)登录 → 顶栏无"后台"链接;手动访问 `/admin/dashboard` → 被守卫踢回 `/home`。
3. `/profile` 显示邮箱 + 角色;改昵称保存,刷新后保留。
4. `/forgot-password` 走找回流程,用新密码登录成功。
Expected: 全部通过。

- [ ] **Step 6: Commit**

```bash
cd /home/yzy/05project && git add -A && git commit -m "feat(frontend): forgot-password, profile, admin dashboard views"
```

---

## Task 7:文档 + 回归

**Files:**
- Modify: `miniapp/README.md`(角色/找回密码/双布局说明 + 提管理员的 SQL)

- [ ] **Step 1: 更新 README**

在 `miniapp/README.md` 增加:
- "首个管理员"小节:`UPDATE users SET role='admin' WHERE email='你的';`
- 接口表补充 `/api/auth/forgot-password`、`/api/auth/reset-password`、`/api/admin/ping`。
- 前端结构补充 layouts/ 与新页面;说明前台顶栏 / 后台侧边栏的双布局。

- [ ] **Step 2: 回归冒烟**

按 spec §5 验收标准逐条过一遍(迁移、提管理员、双布局、守卫、资料、找回密码、错误路径)。

- [ ] **Step 3: Commit**

```bash
cd /home/yzy/05project && git add -A && git commit -m "docs: document roles, dual layouts, password reset (SP1)"
```

---

## 自查记录(spec 覆盖)

- §2 数据库 role → Task 1。
- §3.1 角色贯通 JWT / admin 中间件 → Task 2(含 ApiError.forbidden)。
- §3.2 findById 补字段 → Task 2 Step 4。
- §3.3 找回密码两接口 → Task 3。
- §4.1 目录 / §4.2 嵌套布局 / §4.3 守卫 / §4.4 store → Task 4、5。
- §4 三个页面 → Task 6。
- §5 验收 → Task 3/6/7 冒烟步骤。
- §6 测试(手动冒烟,无自动化)→ 各 Task 验证步骤,符合约定。
- admin 中间件不留死代码 → Task 3 的 `/api/admin/ping` 在 Task 6 Dashboard 中被调用验证。
