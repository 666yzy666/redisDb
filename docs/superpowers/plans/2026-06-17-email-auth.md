# 邮箱注册/登录 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把项目重构为 `frontend/` + `backend/`,在保留原有微信登录/订单的前提下,新增"邮箱+验证码注册、邮箱+密码登录"的前后端闭环。

**Architecture:** 后端沿用现有 Express 分层(routes→controllers→services→repositories),邮箱认证单独挂 `/api/auth`;前端是全新 Vue3(JS)单页应用,经 Vite 代理调后端。验证码存 Redis,密码用 bcrypt 哈希,登录态复用现有 JWT+Redis 会话。

**Tech Stack:** 后端 Node.js/Express + MySQL + Redis + bcryptjs + nodemailer;前端 Vue3 + Vite + Pinia + Vue Router + Tailwind + axios。

**验证方式:** 本轮按 spec §8 用手动冒烟(curl + 浏览器 + 查库/Redis),不写自动化测试。

参考 spec:`docs/superpowers/specs/2026-06-17-email-auth-design.md`

---

## Task 0:初始化 git + 目录重构

**Files:**
- Move: `miniapp-server/` → `backend/`
- Create: `.gitignore`(顶层)

- [ ] **Step 1: git init + 顶层 .gitignore**

```bash
cd /home/yzy/05project
git init
printf 'node_modules/\n.env\ndist/\n*.log\n' > .gitignore
```

- [ ] **Step 2: 停掉正在后台跑的旧后端进程**(避免占用 3000 端口与文件锁)

由实现者用 TaskStop 停掉后台 server(若仍在跑)。

- [ ] **Step 3: 目录改名 miniapp-server → backend**

```bash
cd /home/yzy/05project
git add -A && git commit -m "chore: snapshot before restructure" || true
mv miniapp-server backend
```

- [ ] **Step 4: 提交重构**

```bash
cd /home/yzy/05project
git add -A
git commit -m "refactor: move miniapp-server to backend/"
```

- [ ] **Step 5: 验证**

Run: `ls /home/yzy/05project`
Expected: 看到 `backend/`、`docs/`,无 `miniapp-server/`

---

## Task 1:数据库迁移 — users 表加邮箱字段

**Files:**
- Create: `backend/sql/migrations/001_add_email_auth.sql`
- Modify: `backend/sql/init.sql`(users 表加列,供全新环境)

- [ ] **Step 1: 写迁移文件**

`backend/sql/migrations/001_add_email_auth.sql`:
```sql
-- 让微信字段可空,新增邮箱与密码哈希列
USE `miniapp`;
ALTER TABLE `users`
  MODIFY COLUMN `openid` VARCHAR(64) NULL COMMENT '微信 openid(邮箱用户为空)',
  ADD COLUMN `email`         VARCHAR(255) NULL UNIQUE COMMENT '登录邮箱',
  ADD COLUMN `password_hash` VARCHAR(255) NULL COMMENT 'bcrypt 哈希后的密码';
```

- [ ] **Step 2: 同步 init.sql 的 users 表**(让重建环境一步到位)

把 `backend/sql/init.sql` 中 `users` 表的 `openid` 行改为可空,并在其后加入 email / password_hash 两列:
```sql
  `openid`        VARCHAR(64)  NULL COMMENT '微信 openid(邮箱用户为空)',
  `email`         VARCHAR(255) NULL COMMENT '登录邮箱',
  `password_hash` VARCHAR(255) NULL COMMENT 'bcrypt 哈希后的密码',
```
并在表内唯一键区域加上 `UNIQUE KEY uk_email (email)`;`uk_openid` 保留。

- [ ] **Step 3: 重建数据库容器(项目名已变,自动跑新 init.sql)**

```bash
cd /home/yzy/05project/backend
docker compose down
docker compose up -d
```
说明:目录已变为 backend,compose 项目名随之改变,会创建全新空库并执行更新后的 init.sql。

- [ ] **Step 4: 验证表结构**

```bash
docker exec backend-mysql mysql -uroot -p123456 -e "USE miniapp; DESC users;" 2>/dev/null
```
Expected: 列中出现 `email`、`password_hash`,且 `openid` 的 Null 列为 `YES`。
(若容器名不是 `backend-mysql`,先 `docker compose ps` 查实际名。)

- [ ] **Step 5: Commit**

```bash
cd /home/yzy/05project && git add -A && git commit -m "feat(db): add email/password columns to users"
```

---

## Task 2:后端依赖 + 配置

**Files:**
- Modify: `backend/package.json`(加依赖)
- Modify: `backend/src/config/index.js`(加 smtp/verify 配置)
- Modify: `backend/.env.example`(加 SMTP 与验证码配置示例)

- [ ] **Step 1: 安装依赖**

```bash
cd /home/yzy/05project/backend
npm install bcryptjs nodemailer
```

- [ ] **Step 2: config 增加 smtp 与 verify 段**

在 `backend/src/config/index.js` 的 config 对象里、`jwt` 段之后追加:
```js
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'no-reply@example.com',
  },

  verify: {
    codeTtl: Number(process.env.VERIFY_CODE_TTL) || 300,    // 验证码有效期(秒)
    cooldown: Number(process.env.VERIFY_COOLDOWN) || 60,    // 发码冷却(秒)
  },
```

- [ ] **Step 3: .env.example 追加**

在 `backend/.env.example` 末尾追加:
```
# ===== SMTP(留空则验证码打印到控制台,本地可直接跑) =====
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=no-reply@example.com

# ===== 验证码 =====
VERIFY_CODE_TTL=300
VERIFY_COOLDOWN=60
```
并同步把这些行加进实际的 `backend/.env`(没有就从 .env.example 复制)。

- [ ] **Step 4: Commit**

```bash
cd /home/yzy/05project && git add -A && git commit -m "chore(backend): add bcryptjs/nodemailer deps and smtp/verify config"
```

---

## Task 3:邮件服务(mock 优先)

**Files:**
- Create: `backend/src/services/email.service.js`

- [ ] **Step 1: 写 email.service.js**

仿 `wechat.service.js`:未配 SMTP 时打印到控制台。
```js
'use strict';

const nodemailer = require('nodemailer');
const config = require('../config');
const logger = require('../utils/logger');

// 未配置 SMTP 时,把邮件内容打印到控制台(本地 demo 直接可用)
let transporter = null;
if (config.smtp.host) {
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
}

async function sendMail(to, subject, text) {
  if (!transporter) {
    logger.warn(`未配置 SMTP,模拟发信 -> 收件人:${to} 主题:${subject} 内容:${text}`);
    return;
  }
  await transporter.sendMail({ from: config.smtp.from, to, subject, text });
  logger.info(`邮件已发送 -> ${to}`);
}

module.exports = { sendMail };
```

- [ ] **Step 2: Commit**

```bash
cd /home/yzy/05project && git add -A && git commit -m "feat(backend): add email service with console mock fallback"
```

---

## Task 4:user.repository 增加邮箱方法

**Files:**
- Modify: `backend/src/repositories/user.repository.js`

- [ ] **Step 1: 加 findByEmail 与 createEmailUser**

在 `UserRepository` 对象中、`updateProfile` 之后追加(注意现有 findById 没选 email/password_hash,新增方法显式选取):
```js
  async findByEmail(email) {
    const [rows] = await getPool().execute(
      'SELECT id, email, password_hash, nickname, avatar_url, created_at FROM users WHERE email = :email LIMIT 1',
      { email }
    );
    return rows[0] || null;
  },

  async createEmailUser({ email, passwordHash, nickname }) {
    const [result] = await getPool().execute(
      'INSERT INTO users (email, password_hash, nickname) VALUES (:email, :passwordHash, :nickname)',
      { email, passwordHash, nickname: nickname || '' }
    );
    return result.insertId;
  },
```

- [ ] **Step 2: 验证语法**

Run: `cd /home/yzy/05project/backend && node -e "require('./src/repositories/user.repository.js'); console.log('ok')"`
Expected: 打印 `ok`(无语法错误;它不连库,只校验加载)

- [ ] **Step 3: Commit**

```bash
cd /home/yzy/05project && git add -A && git commit -m "feat(backend): add findByEmail/createEmailUser to user repo"
```

---

## Task 5:auth.service 业务逻辑

**Files:**
- Create: `backend/src/services/auth.service.js`

- [ ] **Step 1: 写 auth.service.js**

```js
'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const UserRepository = require('../repositories/user.repository');
const emailService = require('./email.service');
const { getRedis } = require('../loaders/redis');

const SESSION_TTL = 7 * 24 * 3600;

const codeKey = (email) => `verify:register:${email}`;
const cooldownKey = (email) => `verify:cooldown:${email}`;
const sessionKey = (userId) => `session:${userId}`;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function assertEmail(email) {
  if (!email || !EMAIL_RE.test(email)) throw ApiError.badRequest('邮箱格式不正确');
}
function assertPassword(password) {
  if (!password || password.length < 6) throw ApiError.badRequest('密码至少 6 位');
}

// 生成 6 位数字验证码(不引入随机库,用时间也不行——这里用 crypto)
function genCode() {
  const crypto = require('crypto');
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

// 签发 JWT + 写 Redis 会话,返回 { token, user }(去掉密码哈希)
async function issueSession(user) {
  const token = jwt.sign({ userId: user.id, email: user.email }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
  await getRedis().set(sessionKey(user.id), token, 'EX', SESSION_TTL);
  const safeUser = { id: user.id, email: user.email, nickname: user.nickname, avatar_url: user.avatar_url, created_at: user.created_at };
  return { token, user: safeUser };
}

const AuthService = {
  // 发送注册验证码
  async sendRegisterCode(email) {
    assertEmail(email);
    const redis = getRedis();

    if (await redis.get(cooldownKey(email))) {
      throw ApiError.badRequest('验证码发送过于频繁,请稍后再试', 42900);
    }
    const code = genCode();
    await redis.set(codeKey(email), code, 'EX', config.verify.codeTtl);
    await redis.set(cooldownKey(email), '1', 'EX', config.verify.cooldown);

    await emailService.sendMail(email, '注册验证码', `您的验证码是 ${code},${Math.floor(config.verify.codeTtl / 60)} 分钟内有效。`);
    logger.info(`已为 ${email} 生成注册验证码`);

    // dev 模式把 code 一并返回,方便本地无邮箱调试
    return config.env === 'development' ? { sent: true, code } : { sent: true };
  },

  // 注册:校验验证码 → 哈希密码 → 入库 → 注册即登录
  async register(email, password, code) {
    assertEmail(email);
    assertPassword(password);
    if (!code) throw ApiError.badRequest('请输入验证码');

    const redis = getRedis();
    const real = await redis.get(codeKey(email));
    if (!real || real !== String(code)) {
      throw ApiError.badRequest('验证码错误或已过期', 40010);
    }

    if (await UserRepository.findByEmail(email)) {
      throw ApiError.badRequest('该邮箱已注册', 40011);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = await UserRepository.createEmailUser({ email, passwordHash });
    await redis.del(codeKey(email));

    const user = await UserRepository.findByEmail(email);
    return issueSession(user);
  },

  // 邮箱密码登录
  async login(email, password) {
    assertEmail(email);
    assertPassword(password);

    const user = await UserRepository.findByEmail(email);
    // 统一提示,不泄露账号是否存在
    if (!user || !user.password_hash) throw ApiError.unauthorized('邮箱或密码错误');
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) throw ApiError.unauthorized('邮箱或密码错误');

    return issueSession(user);
  },
};

module.exports = AuthService;
```

- [ ] **Step 2: 验证加载**

Run: `cd /home/yzy/05project/backend && node -e "require('./src/services/auth.service.js'); console.log('ok')"`
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
cd /home/yzy/05project && git add -A && git commit -m "feat(backend): add auth service (send-code/register/login)"
```

---

## Task 6:auth.controller + auth.route + 挂载

**Files:**
- Create: `backend/src/controllers/auth.controller.js`
- Create: `backend/src/routes/auth.route.js`
- Modify: `backend/src/routes/index.js`(挂载 /auth)

- [ ] **Step 1: auth.controller.js**

```js
'use strict';

const AuthService = require('../services/auth.service');
const { success } = require('../utils/response');

const AuthController = {
  async sendCode(req, res) {
    const { email } = req.body;
    const result = await AuthService.sendRegisterCode(email);
    return success(res, result, '验证码已发送');
  },

  async register(req, res) {
    const { email, password, code } = req.body;
    const result = await AuthService.register(email, password, code);
    return success(res, result, '注册成功');
  },

  async login(req, res) {
    const { email, password } = req.body;
    const result = await AuthService.login(email, password);
    return success(res, result, '登录成功');
  },
};

module.exports = AuthController;
```

- [ ] **Step 2: auth.route.js**

```js
'use strict';

const express = require('express');
const AuthController = require('../controllers/auth.controller');
const asyncHandler = require('../middlewares/asyncHandler');

const router = express.Router();

// 邮箱认证(均为公开接口)
router.post('/send-code', asyncHandler(AuthController.sendCode));
router.post('/register', asyncHandler(AuthController.register));
router.post('/login', asyncHandler(AuthController.login));

module.exports = router;
```

- [ ] **Step 3: 在 routes/index.js 挂载**

在 `backend/src/routes/index.js` 引入并挂载(微信路由保持不动):
```js
const authRoute = require('./auth.route');
// ...在 router.use('/users', userRoute); 附近加:
router.use('/auth', authRoute);
```

- [ ] **Step 4: 重启后端并冒烟测试**

```bash
cd /home/yzy/05project/backend
npm run dev   # 实现者用后台运行;等待 "Server listening"
```
然后:
```bash
# 发码(dev 会返回 code)
curl -s -X POST http://localhost:3000/api/auth/send-code -H 'Content-Type: application/json' -d '{"email":"test@demo.com"}'
# 用返回的 code 注册
curl -s -X POST http://localhost:3000/api/auth/register -H 'Content-Type: application/json' -d '{"email":"test@demo.com","password":"123456","code":"<上一步的code>"}'
# 登录
curl -s -X POST http://localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"email":"test@demo.com","password":"123456"}'
```
Expected: 发码返回 `{code:0,...,data:{sent:true,code:"xxxxxx"}}`;注册/登录返回 `{code:0,...,data:{token,user}}`。
验证入库:`docker exec backend-mysql mysql -uroot -p123456 -e "USE miniapp; SELECT id,email,password_hash,openid FROM users;" 2>/dev/null` → email 已填、password_hash 是哈希串、openid 为 NULL。

- [ ] **Step 5: Commit**

```bash
cd /home/yzy/05project && git add -A && git commit -m "feat(backend): wire /api/auth routes for email auth"
```

---

## Task 7:前端脚手架(Vue3 + Vite)

**Files:**
- Create: `frontend/package.json`, `frontend/vite.config.js`, `frontend/index.html`
- Create: `frontend/tailwind.config.js`, `frontend/postcss.config.js`, `frontend/.env`
- Create: `frontend/src/main.js`, `frontend/src/App.vue`, `frontend/src/styles/index.css`

- [ ] **Step 1: package.json**

`frontend/package.json`:
```json
{
  "name": "frontend",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "axios": "^1.7.0",
    "pinia": "^2.2.0",
    "vue": "^3.4.0",
    "vue-router": "^4.4.0"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.1.0",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "vite": "^5.4.0"
  }
}
```

- [ ] **Step 2: vite.config.js(含 /api 代理)**

```js
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
});
```

- [ ] **Step 3: index.html**

```html
<!DOCTYPE html>
<html lang="zh">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>邮箱认证 Demo</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
```

- [ ] **Step 4: tailwind/postcss 配置**

`frontend/tailwind.config.js`:
```js
export default {
  content: ['./index.html', './src/**/*.{vue,js}'],
  theme: { extend: {} },
  plugins: [],
};
```
`frontend/postcss.config.js`:
```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```
`frontend/src/styles/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 5: main.js + App.vue**

`frontend/src/main.js`:
```js
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import './styles/index.css';

createApp(App).use(createPinia()).use(router).mount('#app');
```
`frontend/src/App.vue`:
```vue
<template>
  <router-view />
</template>
```

- [ ] **Step 6: .env**

`frontend/.env`:
```
VITE_API_BASE=/api
```

- [ ] **Step 7: 安装依赖**

```bash
cd /home/yzy/05project/frontend && npm install
```
Expected: 安装成功,生成 node_modules。

- [ ] **Step 8: Commit**

```bash
cd /home/yzy/05project && git add -A && git commit -m "feat(frontend): scaffold vue3 + vite + tailwind app"
```

---

## Task 8:前端 api 层 + Pinia store

**Files:**
- Create: `frontend/src/api/client.js`, `frontend/src/api/auth.js`
- Create: `frontend/src/stores/auth.js`

- [ ] **Step 1: api/client.js(axios 实例 + 拦截器)**

```js
import axios from 'axios';

const client = axios.create({ baseURL: import.meta.env.VITE_API_BASE || '/api' });

// 请求拦截:自动带上 token
client.interceptors.request.use((cfg) => {
  const token = localStorage.getItem('token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

// 响应拦截:统一解包 {code,message,data};后端业务错误转成 reject
client.interceptors.response.use(
  (resp) => {
    const body = resp.data;
    if (body && body.code !== 0) {
      return Promise.reject(new Error(body.message || '请求失败'));
    }
    return body.data;
  },
  (err) => {
    const msg = err.response?.data?.message || err.message || '网络错误';
    return Promise.reject(new Error(msg));
  }
);

export default client;
```

- [ ] **Step 2: api/auth.js**

```js
import client from './client';

export const sendCode = (email) => client.post('/auth/send-code', { email });
export const register = (email, password, code) => client.post('/auth/register', { email, password, code });
export const login = (email, password) => client.post('/auth/login', { email, password });
```

- [ ] **Step 3: stores/auth.js(Pinia)**

```js
import { defineStore } from 'pinia';
import * as authApi from '../api/auth';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem('token') || '',
    user: JSON.parse(localStorage.getItem('user') || 'null'),
  }),
  getters: {
    isLoggedIn: (s) => !!s.token,
  },
  actions: {
    _setSession({ token, user }) {
      this.token = token;
      this.user = user;
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
    },
    async register(email, password, code) {
      this._setSession(await authApi.register(email, password, code));
    },
    async login(email, password) {
      this._setSession(await authApi.login(email, password));
    },
    logout() {
      this.token = '';
      this.user = null;
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    },
  },
});
```

- [ ] **Step 4: Commit**

```bash
cd /home/yzy/05project && git add -A && git commit -m "feat(frontend): add api client and auth pinia store"
```

---

## Task 9:路由 + 三个页面

**Files:**
- Create: `frontend/src/router/index.js`
- Create: `frontend/src/views/auth/LoginView.vue`
- Create: `frontend/src/views/auth/RegisterView.vue`
- Create: `frontend/src/views/HomeView.vue`

- [ ] **Step 1: router/index.js(含登录守卫)**

```js
import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const routes = [
  { path: '/', redirect: '/home' },
  { path: '/login', component: () => import('../views/auth/LoginView.vue') },
  { path: '/register', component: () => import('../views/auth/RegisterView.vue') },
  { path: '/home', component: () => import('../views/HomeView.vue'), meta: { requiresAuth: true } },
];

const router = createRouter({ history: createWebHistory(), routes });

router.beforeEach((to) => {
  const auth = useAuthStore();
  if (to.meta.requiresAuth && !auth.isLoggedIn) return '/login';
  if ((to.path === '/login' || to.path === '/register') && auth.isLoggedIn) return '/home';
});

export default router;
```

- [ ] **Step 2: LoginView.vue**

```vue
<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth';

const email = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);
const router = useRouter();
const auth = useAuthStore();

async function onSubmit() {
  error.value = '';
  loading.value = true;
  try {
    await auth.login(email.value, password.value);
    router.push('/home');
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
      <h1 class="text-xl font-bold text-center">登录</h1>
      <input v-model="email" type="email" placeholder="邮箱" class="w-full border rounded px-3 py-2" />
      <input v-model="password" type="password" placeholder="密码" class="w-full border rounded px-3 py-2" />
      <p v-if="error" class="text-red-500 text-sm">{{ error }}</p>
      <button :disabled="loading" class="w-full bg-blue-600 text-white rounded py-2 disabled:opacity-50">
        {{ loading ? '登录中...' : '登录' }}
      </button>
      <p class="text-sm text-center">没有账号?<router-link to="/register" class="text-blue-600">去注册</router-link></p>
    </form>
  </div>
</template>
```

- [ ] **Step 3: RegisterView.vue(含验证码倒计时)**

```vue
<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth';
import { sendCode } from '../../api/auth';

const email = ref('');
const password = ref('');
const code = ref('');
const error = ref('');
const info = ref('');
const loading = ref(false);
const countdown = ref(0);
const router = useRouter();
const auth = useAuthStore();

async function onSendCode() {
  error.value = '';
  info.value = '';
  try {
    const res = await sendCode(email.value);
    info.value = res.code ? `验证码(dev):${res.code}` : '验证码已发送,请查收邮箱';
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
    await auth.register(email.value, password.value, code.value);
    router.push('/home');
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
      <h1 class="text-xl font-bold text-center">注册</h1>
      <input v-model="email" type="email" placeholder="邮箱" class="w-full border rounded px-3 py-2" />
      <div class="flex gap-2">
        <input v-model="code" placeholder="验证码" class="flex-1 border rounded px-3 py-2" />
        <button type="button" :disabled="countdown > 0" @click="onSendCode"
          class="whitespace-nowrap border rounded px-3 text-sm disabled:opacity-50">
          {{ countdown > 0 ? `${countdown}s` : '发送验证码' }}
        </button>
      </div>
      <input v-model="password" type="password" placeholder="密码(至少6位)" class="w-full border rounded px-3 py-2" />
      <p v-if="info" class="text-green-600 text-sm">{{ info }}</p>
      <p v-if="error" class="text-red-500 text-sm">{{ error }}</p>
      <button :disabled="loading" class="w-full bg-blue-600 text-white rounded py-2 disabled:opacity-50">
        {{ loading ? '注册中...' : '注册' }}
      </button>
      <p class="text-sm text-center">已有账号?<router-link to="/login" class="text-blue-600">去登录</router-link></p>
    </form>
  </div>
</template>
```

- [ ] **Step 4: HomeView.vue**

```vue
<script setup>
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const auth = useAuthStore();

function onLogout() {
  auth.logout();
  router.push('/login');
}
</script>

<template>
  <div class="min-h-screen flex flex-col items-center justify-center bg-gray-100 gap-4">
    <h1 class="text-2xl font-bold">登录成功 🎉</h1>
    <p class="text-gray-700">当前用户:{{ auth.user?.email }}</p>
    <button @click="onLogout" class="bg-red-500 text-white rounded px-4 py-2">退出登录</button>
  </div>
</template>
```

- [ ] **Step 5: 起前端并端到端冒烟**

```bash
cd /home/yzy/05project/frontend && npm run dev   # 实现者后台运行,等待 vite ready
```
浏览器开 `http://localhost:5173/register`:
1. 输入邮箱 → 点「发送验证码」→ 页面显示 dev 验证码(后端控制台也会打印)
2. 填验证码 + 密码(≥6位)→ 注册 → 跳 /home 显示邮箱
3. 退出 → /login 用同邮箱密码登录成功
Expected: 全流程通过;数据库可见新用户行。

- [ ] **Step 6: Commit**

```bash
cd /home/yzy/05project && git add -A && git commit -m "feat(frontend): add login/register/home views with router guard"
```

---

## Task 10:顶层 README + 收尾

**Files:**
- Create: `/home/yzy/05project/README.md`

- [ ] **Step 1: 写顶层 README**

包含:项目结构(frontend/backend)、如何启动(docker compose + 后端 + 前端三步)、邮箱认证接口说明、验证方式。

- [ ] **Step 2: 最终冒烟回归**

按 spec §7 验收标准逐条过一遍(注册→入库→Redis会话→退出→登录→错误路径)。

- [ ] **Step 3: Commit**

```bash
cd /home/yzy/05project && git add -A && git commit -m "docs: add top-level README for frontend/backend monorepo"
```

---

## 自查记录(spec 覆盖)

- §2 文件夹布局 → Task 0、Task 7。
- §3 数据库改动 → Task 1。
- §4 后端(email.service/auth.service/auth.controller/auth.route/repo/config)→ Task 2-6。
- §5 前端(api/store/router/views)→ Task 7-9。
- §6 运行方式 → Task 10 README + 各 Task 启动步骤。
- §7 验收标准 → Task 6/9/10 的冒烟步骤。
- §8 测试策略(手动冒烟)→ 各 Task 验证步骤,无自动化测试,符合约定。
