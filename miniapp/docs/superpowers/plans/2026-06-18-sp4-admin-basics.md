# SP4 后台基础(仪表盘 + 公告 + 系统设置)实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐后台基础:真实统计仪表盘、公告(admin 发布/用户可见)、系统设置(site_name 顶栏显示、registration_open 真正控制注册)。

**Architecture:** 新增 announcements / settings 两表;setting/announcement 各自分层(repository+service+controller);settings 经白名单写入并接入注册拦截;仪表盘统计聚合在 admin.service.getStats;前端新增三后台页 + 用户公告页,小 app store 加载公开设置显示站名。

**Tech Stack:** Node.js/Express + MySQL + Redis;Vue3 + Vite + Pinia + Vue Router。

**验证方式:** 手动冒烟(curl + 浏览器 + 查 MySQL),无自动化测试(spec §8)。

参考 spec:`miniapp/docs/superpowers/specs/2026-06-18-sp4-admin-basics-design.md`。命令默认在 `/home/yzy/05project`;MySQL 容器 `miniapp-mysql`(root/123456,db miniapp)。账号:alice@demo.com/secret123(admin,id=1)、bob@demo.com/secret123(user,id=2)。

---

## Task 1:数据库迁移 — announcements + settings

**Files:**
- Create: `miniapp/backend/sql/migrations/005_admin_basics.sql`
- Modify: `miniapp/backend/sql/init.sql`(末尾追加两表 + 种子)

- [ ] **Step 1: 写迁移文件**

`miniapp/backend/sql/migrations/005_admin_basics.sql`:
```sql
USE `miniapp`;
CREATE TABLE IF NOT EXISTS `announcements` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `title`      VARCHAR(255) NOT NULL COMMENT '公告标题',
  `content`    TEXT         NOT NULL COMMENT '公告内容(纯文本)',
  `published`  TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '0草稿 / 1已发布',
  `created_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_published` (`published`, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='公告';

CREATE TABLE IF NOT EXISTS `settings` (
  `key`        VARCHAR(64)  NOT NULL COMMENT '设置键',
  `value`      VARCHAR(512) NOT NULL DEFAULT '' COMMENT '设置值(字符串)',
  `updated_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统设置(键值)';

INSERT INTO `settings` (`key`, `value`) VALUES
  ('site_name', 'MiniApp 框架'),
  ('registration_open', '1')
ON DUPLICATE KEY UPDATE `key` = `key`;
```

- [ ] **Step 2: 同步 init.sql**

把上面 announcements、settings 两个 `CREATE TABLE IF NOT EXISTS ...` 块和那条 `INSERT ... settings ... ON DUPLICATE KEY UPDATE`(都不含 `USE` 行)追加到 `miniapp/backend/sql/init.sql` 末尾,前加注释 `-- ===== 后台基础:公告 + 设置 =====`。

- [ ] **Step 3: 执行迁移**

```bash
docker exec -i miniapp-mysql mysql -uroot -p123456 < miniapp/backend/sql/migrations/005_admin_basics.sql
```

- [ ] **Step 4: 验证**

```bash
docker exec miniapp-mysql mysql -uroot -p123456 -e "USE miniapp; SHOW TABLES LIKE 'announcements'; SHOW TABLES LIKE 'settings'; SELECT * FROM settings;" 2>/dev/null
```
Expected: 两表存在;settings 有 site_name='MiniApp 框架'、registration_open='1' 两行。

- [ ] **Step 5: Commit**

```bash
cd /home/yzy/05project && git add -A && git commit -m "feat(db): add announcements and settings tables"
```

---

## Task 2:setting 仓库 + 服务

**Files:**
- Create: `miniapp/backend/src/repositories/setting.repository.js`
- Create: `miniapp/backend/src/services/setting.service.js`

- [ ] **Step 1: setting.repository.js**

注意 `key`/`value` 是 MySQL 保留字,SQL 中必须用反引号:
```js
'use strict';

const { getPool } = require('../loaders/mysql');

const SettingRepository = {
  async getAll() {
    const [rows] = await getPool().query('SELECT `key`, `value` FROM settings');
    return rows;
  },

  async get(key) {
    const [rows] = await getPool().execute(
      'SELECT `key`, `value` FROM settings WHERE `key` = :key LIMIT 1',
      { key }
    );
    return rows[0] || null;
  },

  async upsert(key, value) {
    await getPool().execute(
      'INSERT INTO settings (`key`, `value`) VALUES (:key, :value) ON DUPLICATE KEY UPDATE `value` = :value',
      { key, value }
    );
  },
};

module.exports = SettingRepository;
```

- [ ] **Step 2: setting.service.js**

```js
'use strict';

const SettingRepository = require('../repositories/setting.repository');

const ALLOWED_KEYS = ['site_name', 'registration_open'];
const DEFAULTS = { site_name: 'MiniApp 框架', registration_open: '1' };

// 取所有设置为对象(带默认值)
async function loadMap() {
  const rows = await SettingRepository.getAll();
  const map = { ...DEFAULTS };
  for (const r of rows) map[r.key] = r.value;
  return map;
}

const SettingService = {
  // 公开设置:站名 + 是否开放注册(布尔)
  async getPublic() {
    const map = await loadMap();
    return {
      site_name: map.site_name,
      registration_open: map.registration_open !== '0' && map.registration_open !== 'false',
    };
  },

  // 后台:白名单内的键值列表
  async getAllForAdmin() {
    const map = await loadMap();
    return { items: ALLOWED_KEYS.map((key) => ({ key, value: map[key] })) };
  },

  // 仅更新白名单键
  async updateMany(obj) {
    for (const key of ALLOWED_KEYS) {
      if (obj[key] !== undefined && obj[key] !== null) {
        await SettingRepository.upsert(key, String(obj[key]));
      }
    }
    return this.getAllForAdmin();
  },

  async isRegistrationOpen() {
    const row = await SettingRepository.get('registration_open');
    if (!row) return true; // 默认开放
    return row.value !== '0' && row.value !== 'false';
  },
};

module.exports = SettingService;
```

- [ ] **Step 3: 验证加载**

```bash
cd /home/yzy/05project/miniapp/backend && node -e "require('./src/repositories/setting.repository.js'); require('./src/services/setting.service.js'); console.log('ok')"
```
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
cd /home/yzy/05project && git add -A && git commit -m "feat(backend): setting repository + service (whitelist key-value)"
```

---

## Task 3:注册接入 registration_open + 设置路由

**Files:**
- Modify: `miniapp/backend/src/services/auth.service.js`(register 开头加拦截)
- Create: `miniapp/backend/src/controllers/setting.controller.js`
- Create: `miniapp/backend/src/routes/setting.route.js`(公开 + 后台拆开见下)
- Modify: `miniapp/backend/src/routes/index.js`(挂 /settings)
- Modify: `miniapp/backend/src/routes/admin.route.js`(加 GET/PUT /settings)
- Modify: `miniapp/backend/src/controllers/admin.controller.js`(加 getSettings/updateSettings)
- Modify: `miniapp/backend/src/services/admin.service.js`(委托 setting.service)

- [ ] **Step 1: register 接入注册开关**

在 `miniapp/backend/src/services/auth.service.js` 顶部 require 区加:
```js
const settingService = require('./setting.service');
```
在 `register(email, password, code)` 方法体最开头(`assertEmail` 之前)加:
```js
    if (!(await settingService.isRegistrationOpen())) {
      throw ApiError.forbidden('注册已关闭');
    }
```

- [ ] **Step 2: setting.controller.js(公开端)**

```js
'use strict';

const SettingService = require('../services/setting.service');
const { success } = require('../utils/response');

const SettingController = {
  async getPublic(req, res) {
    const data = await SettingService.getPublic();
    return success(res, data);
  },
};

module.exports = SettingController;
```

- [ ] **Step 3: setting.route.js(公开端,无鉴权)**

```js
'use strict';

const express = require('express');
const SettingController = require('../controllers/setting.controller');
const asyncHandler = require('../middlewares/asyncHandler');

const router = express.Router();

// 公开:站名 + 是否开放注册
router.get('/public', asyncHandler(SettingController.getPublic));

module.exports = router;
```

- [ ] **Step 4: 挂 /settings**

在 `miniapp/backend/src/routes/index.js` 顶部引入并挂载:
```js
const settingRoute = require('./setting.route');
// ...在 router.use('/auth', authRoute); 附近:
router.use('/settings', settingRoute);
```

- [ ] **Step 5: 后台设置接口(加到 admin)**

(a) `miniapp/backend/src/services/admin.service.js`:顶部 require 加:
```js
const SettingService = require('./setting.service');
```
`AdminService` 对象内加:
```js
  async getSettings() {
    return SettingService.getAllForAdmin();
  },

  async updateSettings(body) {
    return SettingService.updateMany(body || {});
  },
```
(b) `miniapp/backend/src/controllers/admin.controller.js`:`AdminController` 内加:
```js
  async getSettings(req, res) {
    const result = await AdminService.getSettings();
    return success(res, result);
  },

  async updateSettings(req, res) {
    const result = await AdminService.updateSettings(req.body);
    return success(res, result, '设置已保存');
  },
```
(c) `miniapp/backend/src/routes/admin.route.js`:在已有路由后加:
```js
router.get('/settings', asyncHandler(AdminController.getSettings));
router.put('/settings', asyncHandler(AdminController.updateSettings));
```

- [ ] **Step 6: 重启后端 + 冒烟**

由实现者停旧后端,在 `miniapp/backend` 后台 `npm start`,等待 "Server listening"。然后:
```bash
B=http://localhost:3000/api
ADMIN=$(curl -s -X POST $B/auth/login -H 'Content-Type: application/json' -d '{"email":"alice@demo.com","password":"secret123"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
echo "[公开设置] $(curl -s $B/settings/public)"
echo "[后台设置] $(curl -s $B/admin/settings -H "Authorization: Bearer $ADMIN" | head -c 150)"
# 关闭注册 → 注册应被拒
curl -s -X PUT $B/admin/settings -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' -d '{"registration_open":"0"}' >/dev/null
echo "[关注册后发码] $(curl -s -X POST $B/auth/send-code -H 'Content-Type: application/json' -d '{"email":"new@demo.com"}' >/dev/null; curl -s -X POST $B/auth/register -H 'Content-Type: application/json' -d '{"email":"new@demo.com","password":"123456","code":"000000"}' | grep -o '"message":"[^"]*"')"
# 恢复开放
curl -s -X PUT $B/admin/settings -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' -d '{"registration_open":"1"}' >/dev/null
echo "[恢复后公开设置] $(curl -s $B/settings/public)"
```
Expected:公开设置 `{...,"registration_open":true}`;后台设置含 site_name/registration_open;关注册后注册返回 `注册已关闭`;恢复后 registration_open 又为 true。(注意:关注册时 register 在校验验证码前就被拦,故返回"注册已关闭"而非"验证码错误"。)

- [ ] **Step 7: Commit**

```bash
cd /home/yzy/05project && git add -A && git commit -m "feat(backend): settings routes (public/admin) + gate registration"
```

---

## Task 4:公告 仓库 + 服务

**Files:**
- Create: `miniapp/backend/src/repositories/announcement.repository.js`
- Create: `miniapp/backend/src/services/announcement.service.js`

- [ ] **Step 1: announcement.repository.js**

```js
'use strict';

const { getPool } = require('../loaders/mysql');

const AnnouncementRepository = {
  async listPublished() {
    const [rows] = await getPool().query(
      'SELECT id, title, content, created_at FROM announcements WHERE published = 1 ORDER BY id DESC'
    );
    return rows;
  },

  async listAll({ limit, offset }) {
    const [rows] = await getPool().query(
      'SELECT id, title, content, published, created_at FROM announcements ORDER BY id DESC LIMIT ? OFFSET ?',
      [limit, offset]
    );
    return rows;
  },

  async countAll() {
    const [rows] = await getPool().query('SELECT COUNT(*) AS total FROM announcements');
    return rows[0].total;
  },

  async findById(id) {
    const [rows] = await getPool().execute(
      'SELECT id, title, content, published, created_at FROM announcements WHERE id = :id LIMIT 1',
      { id }
    );
    return rows[0] || null;
  },

  async create({ title, content }) {
    const [result] = await getPool().execute(
      'INSERT INTO announcements (title, content) VALUES (:title, :content)',
      { title, content }
    );
    return result.insertId;
  },

  async update(id, { title, content }) {
    await getPool().execute(
      'UPDATE announcements SET title = :title, content = :content WHERE id = :id',
      { id, title, content }
    );
  },

  async setPublished(id, published) {
    await getPool().execute(
      'UPDATE announcements SET published = :published WHERE id = :id',
      { id, published }
    );
  },

  async remove(id) {
    await getPool().execute('DELETE FROM announcements WHERE id = :id', { id });
  },
};

module.exports = AnnouncementRepository;
```

- [ ] **Step 2: announcement.service.js**

```js
'use strict';

const ApiError = require('../utils/ApiError');
const AnnouncementRepository = require('../repositories/announcement.repository');

const MAX_PAGE_SIZE = 100;

function assertFields({ title, content }) {
  if (!title || !String(title).trim()) throw ApiError.badRequest('标题不能为空');
  if (!content || !String(content).trim()) throw ApiError.badRequest('内容不能为空');
}

const AnnouncementService = {
  async listForUser() {
    return AnnouncementRepository.listPublished();
  },

  async listForAdmin({ page, pageSize }) {
    const p = Math.max(1, Number(page) || 1);
    const size = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(pageSize) || 20));
    const offset = (p - 1) * size;
    const [items, total] = await Promise.all([
      AnnouncementRepository.listAll({ limit: size, offset }),
      AnnouncementRepository.countAll(),
    ]);
    return { items, total, page: p, pageSize: size };
  },

  async create({ title, content }) {
    assertFields({ title, content });
    const id = await AnnouncementRepository.create({
      title: String(title).trim(),
      content: String(content).trim(),
    });
    return AnnouncementRepository.findById(id);
  },

  async update(id, { title, content }) {
    assertFields({ title, content });
    const found = await AnnouncementRepository.findById(id);
    if (!found) throw ApiError.notFound('公告不存在');
    await AnnouncementRepository.update(id, {
      title: String(title).trim(),
      content: String(content).trim(),
    });
    return AnnouncementRepository.findById(id);
  },

  async setPublished(id, published) {
    const found = await AnnouncementRepository.findById(id);
    if (!found) throw ApiError.notFound('公告不存在');
    await AnnouncementRepository.setPublished(id, published ? 1 : 0);
    return AnnouncementRepository.findById(id);
  },

  async remove(id) {
    const found = await AnnouncementRepository.findById(id);
    if (!found) throw ApiError.notFound('公告不存在');
    await AnnouncementRepository.remove(id);
    return { removed: true };
  },
};

module.exports = AnnouncementService;
```

- [ ] **Step 3: 验证加载**

```bash
cd /home/yzy/05project/miniapp/backend && node -e "require('./src/repositories/announcement.repository.js'); require('./src/services/announcement.service.js'); console.log('ok')"
```
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
cd /home/yzy/05project && git add -A && git commit -m "feat(backend): announcement repository + service"
```

---

## Task 5:公告路由 + 仪表盘统计 + 后端冒烟

**Files:**
- Create: `miniapp/backend/src/controllers/announcement.controller.js`
- Create: `miniapp/backend/src/routes/announcement.route.js`(用户端)
- Modify: `miniapp/backend/src/routes/index.js`(挂 /announcements)
- Modify: `miniapp/backend/src/routes/admin.route.js`(公告 CRUD + stats)
- Modify: `miniapp/backend/src/controllers/admin.controller.js`(公告 + stats)
- Modify: `miniapp/backend/src/services/admin.service.js`(getStats + 公告委托)
- Modify: `miniapp/backend/src/repositories/paymentOrder.repository.js`(加 stats)

- [ ] **Step 1: paymentOrder.repository 加 stats**

在 `miniapp/backend/src/repositories/paymentOrder.repository.js` 的 `countAll` 之后加:
```js
  async stats() {
    const [rows] = await getPool().query(
      "SELECT COUNT(*) AS total, SUM(status='paid') AS paid, COALESCE(SUM(CASE WHEN status='paid' THEN amount ELSE 0 END),0) AS paidAmount FROM payment_orders"
    );
    const r = rows[0] || {};
    return { total: Number(r.total) || 0, paid: Number(r.paid) || 0, paidAmount: Number(r.paidAmount) || 0 };
  },
```

- [ ] **Step 2: announcement.controller.js**

```js
'use strict';

const AnnouncementService = require('../services/announcement.service');
const { success } = require('../utils/response');

const AnnouncementController = {
  // 用户端:已发布
  async listForUser(req, res) {
    const items = await AnnouncementService.listForUser();
    return success(res, items);
  },
  // 后台
  async listForAdmin(req, res) {
    const { page, pageSize } = req.query;
    const result = await AnnouncementService.listForAdmin({ page, pageSize });
    return success(res, result);
  },
  async create(req, res) {
    const { title, content } = req.body;
    const item = await AnnouncementService.create({ title, content });
    return success(res, item, '已创建');
  },
  async update(req, res) {
    const { title, content } = req.body;
    const item = await AnnouncementService.update(Number(req.params.id), { title, content });
    return success(res, item, '已更新');
  },
  async setPublished(req, res) {
    const item = await AnnouncementService.setPublished(Number(req.params.id), !!req.body.published);
    return success(res, item, '已更新发布状态');
  },
  async remove(req, res) {
    const result = await AnnouncementService.remove(Number(req.params.id));
    return success(res, result, '已删除');
  },
};

module.exports = AnnouncementController;
```

- [ ] **Step 3: announcement.route.js(用户端,需登录)**

```js
'use strict';

const express = require('express');
const AnnouncementController = require('../controllers/announcement.controller');
const auth = require('../middlewares/auth');
const asyncHandler = require('../middlewares/asyncHandler');

const router = express.Router();

// 登录用户:查看已发布公告
router.get('/', auth, asyncHandler(AnnouncementController.listForUser));

module.exports = router;
```

- [ ] **Step 4: 挂 /announcements**

`miniapp/backend/src/routes/index.js` 引入并挂载:
```js
const announcementRoute = require('./announcement.route');
// ...
router.use('/announcements', announcementRoute);
```

- [ ] **Step 5: admin 加公告 CRUD + stats**

(a) `services/admin.service.js`:顶部 require 加:
```js
const AnnouncementService = require('./announcement.service');
const AnnouncementRepository = require('../repositories/announcement.repository');
const PaymentOrderRepository = require('../repositories/paymentOrder.repository');
const UserRepository = require('../repositories/user.repository');
```
(若其中某些已 require,勿重复;以文件实际为准)。`AdminService` 内加:
```js
  // 公告(委托)
  listAnnouncements(params) { return AnnouncementService.listForAdmin(params); },
  createAnnouncement(data) { return AnnouncementService.create(data); },
  updateAnnouncement(id, data) { return AnnouncementService.update(id, data); },
  setAnnouncementPublished(id, published) { return AnnouncementService.setPublished(id, published); },
  removeAnnouncement(id) { return AnnouncementService.remove(id); },

  // 仪表盘统计
  async getStats() {
    const [users, orderStats, announcements] = await Promise.all([
      UserRepository.countUsers({ email: '' }),
      PaymentOrderRepository.stats(),
      AnnouncementRepository.countAll(),
    ]);
    return {
      users,
      orders: orderStats.total,
      paidOrders: orderStats.paid,
      paidAmount: orderStats.paidAmount,
      announcements,
    };
  },
```
(b) `controllers/admin.controller.js`:`AdminController` 内加:
```js
  async listAnnouncements(req, res) {
    const result = await AdminService.listAnnouncements(req.query);
    return success(res, result);
  },
  async createAnnouncement(req, res) {
    const item = await AdminService.createAnnouncement(req.body);
    return success(res, item, '已创建');
  },
  async updateAnnouncement(req, res) {
    const item = await AdminService.updateAnnouncement(Number(req.params.id), req.body);
    return success(res, item, '已更新');
  },
  async setAnnouncementPublished(req, res) {
    const item = await AdminService.setAnnouncementPublished(Number(req.params.id), !!req.body.published);
    return success(res, item, '已更新发布状态');
  },
  async removeAnnouncement(req, res) {
    const result = await AdminService.removeAnnouncement(Number(req.params.id));
    return success(res, result, '已删除');
  },
  async getStats(req, res) {
    const result = await AdminService.getStats();
    return success(res, result);
  },
```
(c) `routes/admin.route.js`:在已有路由后加:
```js
router.get('/stats', asyncHandler(AdminController.getStats));
router.get('/announcements', asyncHandler(AdminController.listAnnouncements));
router.post('/announcements', asyncHandler(AdminController.createAnnouncement));
router.put('/announcements/:id', asyncHandler(AdminController.updateAnnouncement));
router.patch('/announcements/:id/publish', asyncHandler(AdminController.setAnnouncementPublished));
router.delete('/announcements/:id', asyncHandler(AdminController.removeAnnouncement));
```

- [ ] **Step 6: 重启后端 + 冒烟**

实现者重启后端,然后:
```bash
B=http://localhost:3000/api
ADMIN=$(curl -s -X POST $B/auth/login -H 'Content-Type: application/json' -d '{"email":"alice@demo.com","password":"secret123"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
USER=$(curl -s -X POST $B/auth/login -H 'Content-Type: application/json' -d '{"email":"bob@demo.com","password":"secret123"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

# 新建公告(草稿)
ANN=$(curl -s -X POST $B/admin/announcements -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' -d '{"title":"欢迎","content":"这是第一条公告"}')
AID=$(echo "$ANN" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
echo "[新建公告 published] $(echo "$ANN" | grep -o '"published":[0-9]*')"
echo "[草稿期用户可见?应空] $(curl -s $B/announcements -H "Authorization: Bearer $USER")"
echo "[发布] $(curl -s -X PATCH $B/admin/announcements/$AID/publish -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' -d '{"published":true}' | grep -o '"published":[0-9]*')"
echo "[发布后用户可见] $(curl -s $B/announcements -H "Authorization: Bearer $USER" | grep -o '"title":"[^"]*"')"
echo "[后台列表total] $(curl -s "$B/admin/announcements?pageSize=5" -H "Authorization: Bearer $ADMIN" | grep -o '"total":[0-9]*')"
echo "[下架] $(curl -s -X PATCH $B/admin/announcements/$AID/publish -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' -d '{"published":false}' | grep -o '"published":[0-9]*')"
echo "[下架后用户可见?应空] $(curl -s $B/announcements -H "Authorization: Bearer $USER")"
echo "[统计] $(curl -s $B/admin/stats -H "Authorization: Bearer $ADMIN")"
echo "[user 访问 stats 应403] $(curl -s $B/admin/stats -H "Authorization: Bearer $USER" | grep -o '"message":"[^"]*"')"
```
Expected:新建 published=0;草稿期用户列表 `[]`;发布后 published=1 且用户能看到标题"欢迎";后台 total≥1;下架 published=0;下架后用户列表 `[]`;统计返回 `{users,orders,paidOrders,paidAmount,announcements}` 数字;user 访问 stats → `需要管理员权限`。

- [ ] **Step 7: Commit**

```bash
cd /home/yzy/05project && git add -A && git commit -m "feat(backend): announcement routes (user/admin) + dashboard stats"
```

---

## Task 6:前端 api + app store + 路由 + 入口

**Files:**
- Create: `miniapp/frontend/src/api/settings.js`
- Create: `miniapp/frontend/src/api/announcement.js`
- Modify: `miniapp/frontend/src/api/admin.js`(加 getStats)
- Create: `miniapp/frontend/src/stores/app.js`
- Modify: `miniapp/frontend/src/router/index.js`(加 3 子路由)
- Modify: `miniapp/frontend/src/layouts/DefaultLayout.vue`(站名 + 公告入口)
- Modify: `miniapp/frontend/src/layouts/AdminLayout.vue`(站名 + 公告/设置入口)

- [ ] **Step 1: api/settings.js**

```js
import client from './client';

export const getPublicSettings = () => client.get('/settings/public');
export const getAdminSettings = () => client.get('/admin/settings');
export const updateSettings = (data) => client.put('/admin/settings', data);
```

- [ ] **Step 2: api/announcement.js**

```js
import client from './client';

export const listAnnouncements = () => client.get('/announcements');
export const adminListAnnouncements = (params) => client.get('/admin/announcements', { params });
export const createAnnouncement = (data) => client.post('/admin/announcements', data);
export const updateAnnouncement = (id, data) => client.put(`/admin/announcements/${id}`, data);
export const setAnnouncementPublished = (id, published) =>
  client.patch(`/admin/announcements/${id}/publish`, { published });
export const deleteAnnouncement = (id) => client.delete(`/admin/announcements/${id}`);
```

- [ ] **Step 3: api/admin.js 加 getStats**

在 `miniapp/frontend/src/api/admin.js` 末尾加:
```js
export const getStats = () => client.get('/admin/stats');
```

- [ ] **Step 4: stores/app.js**

```js
import { defineStore } from 'pinia';
import { getPublicSettings } from '../api/settings';

export const useAppStore = defineStore('app', {
  state: () => ({ siteName: 'MiniApp 框架' }),
  actions: {
    async loadPublic() {
      try {
        const s = await getPublicSettings();
        if (s && s.site_name) this.siteName = s.site_name;
      } catch (e) {
        // 公开设置拉取失败时保留默认站名
      }
    },
  },
});
```

- [ ] **Step 5: 路由加 3 页**

在 `miniapp/frontend/src/router/index.js`:
- `/`(DefaultLayout)children 加:
```js
      { path: 'announcements', component: () => import('../views/user/AnnouncementsView.vue') },
```
- `/admin`(AdminLayout)children 加:
```js
      { path: 'announcements', component: () => import('../views/admin/AnnouncementsView.vue') },
      { path: 'settings', component: () => import('../views/admin/SettingsView.vue') },
```

- [ ] **Step 6: 布局站名 + 入口**

- `miniapp/frontend/src/layouts/DefaultLayout.vue`:
  - `<script setup>` 引入并在 onMounted 加载站名(与现有 import 合并):
```js
import { onMounted } from 'vue';
import { useAppStore } from '../stores/app';
const app = useAppStore();
onMounted(() => app.loadPublic());
```
  - 顶栏品牌处把硬编码 `MiniApp 框架` 改为 `{{ app.siteName }}`
  - `<nav>` 里 "个人资料"/"我的订单" 之后加:
```html
        <router-link to="/announcements" class="text-gray-700 hover:text-blue-600">公告</router-link>
```
- `miniapp/frontend/src/layouts/AdminLayout.vue`:
  - `<script setup>` 同样引入 app store 并 onMounted 加载;顶部"管理后台"标题处可保留,或在标题旁显示 `{{ app.siteName }}`(把侧边栏顶部 "管理后台" 改为 `{{ app.siteName }} 后台`)
  - 侧边栏 `<nav>` 在 "订单管理" 之后加:
```html
        <router-link to="/admin/announcements" class="block px-3 py-2 rounded hover:bg-gray-700">公告</router-link>
        <router-link to="/admin/settings" class="block px-3 py-2 rounded hover:bg-gray-700">系统设置</router-link>
```

- [ ] **Step 7: 占位三页(让 build 通过,Task 7 覆盖)**

创建以下文件,各含 `<template><div>placeholder</div></template>`:
- `miniapp/frontend/src/views/user/AnnouncementsView.vue`
- `miniapp/frontend/src/views/admin/AnnouncementsView.vue`
- `miniapp/frontend/src/views/admin/SettingsView.vue`

- [ ] **Step 8: 验证 build**

```bash
cd /home/yzy/05project/miniapp/frontend && npm run build 2>&1 | tail -6
```
Expected: "built in ..." 无错误。

- [ ] **Step 9: Commit**

```bash
cd /home/yzy/05project && git add -A && git commit -m "feat(frontend): settings/announcement api + app store + routes + nav"
```

---

## Task 7:前端四页面(仪表盘真数据 + 公告×2 + 设置)

**Files:**
- Modify: `miniapp/frontend/src/views/admin/DashboardView.vue`(占位→真实统计)
- Modify(覆盖占位): `miniapp/frontend/src/views/admin/AnnouncementsView.vue`
- Modify(覆盖占位): `miniapp/frontend/src/views/admin/SettingsView.vue`
- Modify(覆盖占位): `miniapp/frontend/src/views/user/AnnouncementsView.vue`

- [ ] **Step 1: 后台 DashboardView.vue(真实统计)**

覆盖 `miniapp/frontend/src/views/admin/DashboardView.vue`:
```vue
<script setup>
import { ref, onMounted } from 'vue';
import { getStats } from '../../api/admin';

const stats = ref(null);
const error = ref('');
const cards = [
  { key: 'users', label: '用户数' },
  { key: 'orders', label: '订单总数' },
  { key: 'paidOrders', label: '已付订单' },
  { key: 'paidAmount', label: '已付金额(¥)' },
  { key: 'announcements', label: '公告数' },
];

onMounted(async () => {
  try {
    stats.value = await getStats();
  } catch (e) {
    error.value = e.message;
  }
});
</script>

<template>
  <div class="space-y-4">
    <h1 class="text-lg font-bold">仪表盘</h1>
    <p v-if="error" class="text-red-500 text-sm">{{ error }}</p>
    <div v-if="stats" class="grid grid-cols-2 md:grid-cols-5 gap-4">
      <div v-for="c in cards" :key="c.key" class="bg-white rounded-lg shadow p-4 text-center">
        <div class="text-2xl font-bold text-blue-600">{{ stats[c.key] }}</div>
        <div class="text-gray-500 text-sm mt-1">{{ c.label }}</div>
      </div>
    </div>
    <p v-else-if="!error" class="text-gray-400 text-sm">加载中...</p>
  </div>
</template>
```

- [ ] **Step 2: 后台 AnnouncementsView.vue**

覆盖 `miniapp/frontend/src/views/admin/AnnouncementsView.vue`:
```vue
<script setup>
import { ref, onMounted } from 'vue';
import {
  adminListAnnouncements, createAnnouncement, updateAnnouncement,
  setAnnouncementPublished, deleteAnnouncement,
} from '../../api/announcement';

const items = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = 20;
const error = ref('');

const editingId = ref(null); // null=新建
const title = ref('');
const content = ref('');

async function load() {
  error.value = '';
  try {
    const res = await adminListAnnouncements({ page: page.value, pageSize });
    items.value = res.items;
    total.value = res.total;
  } catch (e) { error.value = e.message; }
}

function startNew() { editingId.value = null; title.value = ''; content.value = ''; }
function startEdit(a) { editingId.value = a.id; title.value = a.title; content.value = a.content; }

async function onSave() {
  error.value = '';
  try {
    if (editingId.value) await updateAnnouncement(editingId.value, { title: title.value, content: content.value });
    else await createAnnouncement({ title: title.value, content: content.value });
    startNew();
    await load();
  } catch (e) { error.value = e.message; }
}

async function onTogglePublish(a) {
  error.value = '';
  try { await setAnnouncementPublished(a.id, !a.published); await load(); }
  catch (e) { error.value = e.message; }
}

async function onDelete(a) {
  error.value = '';
  try { await deleteAnnouncement(a.id); await load(); }
  catch (e) { error.value = e.message; }
}

function prevPage() { if (page.value > 1) { page.value -= 1; load(); } }
function nextPage() { if (page.value * pageSize < total.value) { page.value += 1; load(); } }

onMounted(load);
</script>

<template>
  <div class="space-y-4">
    <div class="bg-white rounded-lg shadow p-6 space-y-3">
      <h1 class="text-lg font-bold">{{ editingId ? '编辑公告' : '新建公告' }}</h1>
      <input v-model="title" placeholder="标题" class="w-full border rounded px-3 py-2" />
      <textarea v-model="content" placeholder="内容" rows="3" class="w-full border rounded px-3 py-2"></textarea>
      <div class="space-x-2">
        <button @click="onSave" class="bg-blue-600 text-white rounded px-4 py-2">{{ editingId ? '保存' : '创建' }}</button>
        <button v-if="editingId" @click="startNew" class="border rounded px-4 py-2">取消编辑</button>
      </div>
      <p v-if="error" class="text-red-500 text-sm">{{ error }}</p>
    </div>

    <div class="bg-white rounded-lg shadow p-6">
      <h2 class="text-lg font-bold mb-3">公告列表</h2>
      <table class="w-full text-sm border-collapse">
        <thead>
          <tr class="text-left text-gray-500 border-b"><th class="py-2">ID</th><th>标题</th><th>状态</th><th>时间</th><th>操作</th></tr>
        </thead>
        <tbody>
          <tr v-for="a in items" :key="a.id" class="border-b">
            <td class="py-2">{{ a.id }}</td>
            <td>{{ a.title }}</td>
            <td><span :class="a.published ? 'text-green-600' : 'text-gray-400'">{{ a.published ? '已发布' : '草稿' }}</span></td>
            <td class="text-gray-400">{{ a.created_at }}</td>
            <td class="space-x-2">
              <button @click="startEdit(a)" class="text-blue-600 hover:underline">编辑</button>
              <button @click="onTogglePublish(a)" class="text-yellow-600 hover:underline">{{ a.published ? '下架' : '发布' }}</button>
              <button @click="onDelete(a)" class="text-red-500 hover:underline">删除</button>
            </td>
          </tr>
          <tr v-if="!items.length"><td colspan="5" class="py-4 text-center text-gray-400">暂无公告</td></tr>
        </tbody>
      </table>
      <div class="flex items-center justify-between text-sm mt-3">
        <span class="text-gray-500">共 {{ total }} 条 · 第 {{ page }} 页</span>
        <div class="space-x-2">
          <button @click="prevPage" :disabled="page <= 1" class="border rounded px-3 py-1 disabled:opacity-40">上一页</button>
          <button @click="nextPage" :disabled="page * pageSize >= total" class="border rounded px-3 py-1 disabled:opacity-40">下一页</button>
        </div>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 3: 后台 SettingsView.vue**

覆盖 `miniapp/frontend/src/views/admin/SettingsView.vue`:
```vue
<script setup>
import { ref, onMounted } from 'vue';
import { getAdminSettings, updateSettings } from '../../api/settings';
import { useAppStore } from '../../stores/app';

const app = useAppStore();
const siteName = ref('');
const registrationOpen = ref(true);
const msg = ref('');
const error = ref('');

onMounted(async () => {
  try {
    const res = await getAdminSettings();
    const map = {};
    for (const it of res.items) map[it.key] = it.value;
    siteName.value = map.site_name || '';
    registrationOpen.value = map.registration_open !== '0' && map.registration_open !== 'false';
  } catch (e) { error.value = e.message; }
});

async function onSave() {
  msg.value = ''; error.value = '';
  try {
    await updateSettings({ site_name: siteName.value, registration_open: registrationOpen.value ? '1' : '0' });
    msg.value = '已保存';
    await app.loadPublic(); // 刷新顶栏站名
  } catch (e) { error.value = e.message; }
}
</script>

<template>
  <div class="max-w-md bg-white rounded-lg shadow p-6 space-y-4">
    <h1 class="text-lg font-bold">系统设置</h1>
    <div>
      <label class="text-gray-500 block mb-1 text-sm">站点名称</label>
      <input v-model="siteName" class="w-full border rounded px-3 py-2" />
    </div>
    <label class="flex items-center gap-2 text-sm">
      <input type="checkbox" v-model="registrationOpen" /> 开放注册
    </label>
    <p v-if="msg" class="text-green-600 text-sm">{{ msg }}</p>
    <p v-if="error" class="text-red-500 text-sm">{{ error }}</p>
    <button @click="onSave" class="bg-blue-600 text-white rounded px-4 py-2">保存</button>
  </div>
</template>
```

- [ ] **Step 4: 用户端 AnnouncementsView.vue**

覆盖 `miniapp/frontend/src/views/user/AnnouncementsView.vue`:
```vue
<script setup>
import { ref, onMounted } from 'vue';
import { listAnnouncements } from '../../api/announcement';

const items = ref([]);
const error = ref('');

onMounted(async () => {
  try { items.value = await listAnnouncements(); }
  catch (e) { error.value = e.message; }
});
</script>

<template>
  <div class="max-w-2xl mx-auto space-y-4">
    <h1 class="text-lg font-bold">公告</h1>
    <p v-if="error" class="text-red-500 text-sm">{{ error }}</p>
    <div v-for="a in items" :key="a.id" class="bg-white rounded-lg shadow p-4">
      <div class="font-bold">{{ a.title }}</div>
      <div class="text-gray-600 text-sm mt-1 whitespace-pre-wrap">{{ a.content }}</div>
      <div class="text-gray-400 text-xs mt-2">{{ a.created_at }}</div>
    </div>
    <p v-if="!items.length && !error" class="text-gray-400 text-sm">暂无公告</p>
  </div>
</template>
```

- [ ] **Step 5: 验证 build**

```bash
cd /home/yzy/05project/miniapp/frontend && npm run build 2>&1 | tail -6
```
Expected: "built in ..." 无错误。

- [ ] **Step 6: 起前端 + 代理冒烟(无浏览器)**

```bash
cd /home/yzy/05project/miniapp/frontend && (npm run dev > /tmp/sp4-fe.log 2>&1 &) ; sleep 4 ; grep -o "Local:.*" /tmp/sp4-fe.log | head -1
echo "homepage: $(curl -s -o /dev/null -w '%{http_code}' http://localhost:5173/)"
echo "proxy 公开设置: $(curl -s http://localhost:5173/api/settings/public)"
ADMIN=$(curl -s -X POST http://localhost:5173/api/auth/login -H 'Content-Type: application/json' -d '{"email":"alice@demo.com","password":"secret123"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
echo "proxy stats: $(curl -s http://localhost:5173/api/admin/stats -H "Authorization: Bearer $ADMIN")"
pkill -f vite 2>/dev/null; echo stopped
```
Expected: homepage `200`;公开设置返回 `{...site_name...registration_open...}`;stats 返回统计对象。

- [ ] **Step 7: Commit**

```bash
cd /home/yzy/05project && git add -A && git commit -m "feat(frontend): dashboard stats + admin/user announcements + settings views"
```

---

## Task 8:文档 + 回归

**Files:**
- Modify: `miniapp/README.md`

- [ ] **Step 1: 更新 README**

增加:
- 接口表:`GET /api/settings/public`、`GET/PUT /api/admin/settings`、`GET /api/announcements`、`GET/POST /api/admin/announcements`、`PUT /api/admin/announcements/:id`、`PATCH /api/admin/announcements/:id/publish`、`DELETE /api/admin/announcements/:id`、`GET /api/admin/stats`。
- 说明:新增 announcements / settings 表;系统设置驱动行为(site_name 顶栏显示、registration_open 关闭则拒绝注册);公告草稿/发布(用户只看已发布);仪表盘真实统计。
- 前端结构:后台仪表盘(真数据)/公告/系统设置三页、用户端公告页;app store 加载站名;顶栏「公告」、侧边栏「公告」「系统设置」。

- [ ] **Step 2: 回归冒烟**

按 spec §7 验收标准逐条过一遍(迁移、公开设置、关/开注册、改站名、公告草稿→发布→下架可见性、编辑/删除/分页、统计正确、user 403)。

- [ ] **Step 3: Commit**

```bash
cd /home/yzy/05project && git add -A && git commit -m "docs: document SP4 admin basics (dashboard/announcements/settings)"
```

---

## 自查记录(spec 覆盖)

- §2 数据模型(announcements/settings + 种子)→ Task 1。
- §3 设置(repo/service/白名单/公开+后台接口/注册接入)→ Task 2、3。
- §4 公告(repo/service/用户+后台接口)→ Task 4、5。
- §5 仪表盘统计(paymentOrder.stats + admin.getStats + /admin/stats)→ Task 5。
- §6 前端路由与入口 → Task 6。
- §5.2/§3.2/§4.2 前端页面 → Task 7。
- §7 验收 → Task 3/5/7/8 冒烟。
- §8 测试(手动冒烟)→ 各 Task 验证步骤。
- 命名/字段一致性:设置键 site_name/registration_open;stats 字段 users/orders/paidOrders/paidAmount/announcements;公告字段 id/title/content/published/created_at;admin.service 委托方法名与 controller/route 一致。settings 表 `key`/`value` 全程反引号。
