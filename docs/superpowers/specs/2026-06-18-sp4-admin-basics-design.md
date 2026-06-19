# 设计文档:SP4 — 后台基础(仪表盘 + 公告 + 系统设置)

- 日期:2026-06-18
- 所属:通用前后端框架的第四个子项目(收尾)
- 前置:SP1(角色/双布局/守卫)、SP2(用户管理)、SP3(付款订单)已完成

## 1. 目标与非目标

**目标:** 补齐后台基础功能,让框架后台完整可用:
- **仪表盘**:真实统计(用户数、订单数、已付数、已付金额、公告数)
- **公告**:管理员发布/编辑/删除/上下架;登录用户可见已发布公告
- **系统设置**:键值配置,真正驱动行为(`site_name` 顶栏显示;`registration_open` 关闭则拒绝注册)

**非目标(YAGNI):**
- 公告富文本/Markdown(纯文本 content 即可)
- 公告完全公开(本期需登录才看)
- 设置项的复杂类型/校验框架(仅 site_name、registration_open 两个白名单键)
- 仪表盘图表(本期数字卡片即可)
- 自动化测试(本期手动冒烟)

## 2. 数据模型

新增迁移 `backend/sql/migrations/005_admin_basics.sql`:
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
`init.sql` 同步追加这两张表 + 种子(用同样的 `ON DUPLICATE KEY UPDATE` 防重复)。

## 3. 系统设置(真驱动行为)

### 3.1 后端
- `repositories/setting.repository.js`:`getAll()`(返回所有 {key,value})、`get(key)`、`upsert(key, value)`(INSERT ... ON DUPLICATE KEY UPDATE)
- `services/setting.service.js`:
  - 白名单 `ALLOWED_KEYS = ['site_name', 'registration_open']`
  - `getPublic()` —— 返回 `{ site_name, registration_open }`(registration_open 转布尔)。缺失键用默认值(site_name 默认 'MiniApp'、registration_open 默认 true)
  - `getAllForAdmin()` —— 返回白名单内所有设置的 {key,value}
  - `updateMany(obj)` —— 仅更新白名单键,逐个 upsert;非白名单键忽略
  - `isRegistrationOpen()` —— 读 registration_open,'0'/'false' 视为关闭,其余开放
- **接口**:
  - `GET /api/settings/public`(无鉴权)→ `{ site_name, registration_open }`
  - `GET /api/admin/settings`(auth+admin)→ `{ items: [{key,value}] }`
  - `PUT /api/admin/settings`(auth+admin)body `{ site_name?, registration_open? }` → 更新后返回 getAllForAdmin()
- **接入**:`auth.service.register` 开头加 `if (!(await settingService.isRegistrationOpen())) throw ApiError.forbidden('注册已关闭');`

### 3.2 前端
- `api/settings.js`:`getPublicSettings()`、`getAdminSettings()`、`updateSettings(data)`
- `stores/app.js`(新,小):state `{ siteName }`;action `loadPublic()` 拉 `/settings/public` 存 siteName(默认 'MiniApp 框架')
- 两个布局顶栏的站名由硬编码 'MiniApp 框架' 改为 `app.siteName`;在布局 onMounted 调 `app.loadPublic()`
- `views/admin/SettingsView.vue`:加载 getAdminSettings → 表单(site_name 文本框 + registration_open 开关)→ 保存调 updateSettings

## 4. 公告

### 4.1 后端
- `repositories/announcement.repository.js`:
  - `listPublished()` → 已发布(published=1)按 id DESC
  - `listAll({ limit, offset })` / `countAll()` → 后台分页(全部)
  - `findById(id)`
  - `create({ title, content })` → insertId(默认 published=0)
  - `update(id, { title, content })`
  - `setPublished(id, published)` → 0/1
  - `remove(id)`
- `services/announcement.service.js`:
  - `listForUser()` → listPublished()
  - `listForAdmin({ page, pageSize })` → 分页(pageSize 上限 100)
  - `getById(id)`(不存在 404)
  - `create({ title, content })`(title/content 非空校验)
  - `update(id, { title, content })`(存在性校验 + 校验)
  - `setPublished(id, published)`(published 规范化为 0/1)
  - `remove(id)`
- **接口**:
  - `GET /api/announcements`(auth)→ 已发布列表
  - `GET /api/admin/announcements?page=&pageSize=`(auth+admin)→ `{items,total,page,pageSize}`(全部)
  - `POST /api/admin/announcements`(auth+admin)`{title,content}` → 新建(草稿)
  - `PUT /api/admin/announcements/:id`(auth+admin)`{title,content}` → 编辑
  - `PATCH /api/admin/announcements/:id/publish`(auth+admin)`{published}` → 上/下架
  - `DELETE /api/admin/announcements/:id`(auth+admin)→ 删除

### 4.2 前端
- `api/announcement.js`:`listAnnouncements()`(用户);admin:`adminListAnnouncements(params)`、`createAnnouncement(data)`、`updateAnnouncement(id,data)`、`setAnnouncementPublished(id,published)`、`deleteAnnouncement(id)`
- `views/user/AnnouncementsView.vue`(前台):已发布公告列表(标题 + 内容 + 时间)
- `views/admin/AnnouncementsView.vue`(后台):表格(标题/状态/时间/操作)+ 新建/编辑表单(标题、内容)+ 发布开关 + 删除 + 分页

## 5. 仪表盘(真实统计)

### 5.1 后端
- 统计聚合放在 `admin.service.js` 的 `getStats()`,依赖:
  - 用户数:`UserRepository.countUsers({ email: '' })`(SP2 已有)
  - 付款订单:`PaymentOrderRepository` 加 `stats()` → `{ total, paid, paidAmount }`(`SELECT COUNT(*) total, SUM(status='paid') paid, COALESCE(SUM(CASE WHEN status='paid' THEN amount END),0) paidAmount FROM payment_orders`)
  - 公告数:`AnnouncementRepository.countAll()`
  - 返回 `{ users, orders, paidOrders, paidAmount, announcements }`
- **接口**:`GET /api/admin/stats`(auth+admin)→ 上述对象

### 5.2 前端
- `api/admin.js` 加 `getStats()`
- `views/admin/DashboardView.vue`:替换占位/ping,改为加载 getStats → 数字卡片(用户数、订单数、已付订单、已付金额、公告数)

## 6. 路由与入口(前端)

- 路由新增:
  - `/`(DefaultLayout)children:`announcements` → user/AnnouncementsView
  - `/admin`(AdminLayout)children:`announcements` → admin/AnnouncementsView、`settings` → admin/SettingsView(dashboard 已存在)
- 入口:
  - DefaultLayout 顶栏加「公告」→ `/announcements`
  - AdminLayout 侧边栏加「公告」→ `/admin/announcements`、「系统设置」→ `/admin/settings`

## 7. 验收标准(手动冒烟)

1. 跑迁移 005,`announcements`、`settings` 表存在,settings 有 site_name / registration_open 两行。
2. `GET /api/settings/public` 返回 `{site_name:'MiniApp 框架', registration_open:true}`。
3. 后台把 registration_open 改为关闭 → 注册接口返回「注册已关闭」;改回开放 → 注册恢复。
4. 后台改 site_name → 前端顶栏站名随之变化(刷新后)。
5. 后台新建公告(草稿)→ 用户端 `/announcements` 看不到;发布后能看到;下架后又看不到。
6. 后台编辑/删除公告生效;列表分页正常。
7. 仪表盘 `GET /api/admin/stats` 返回正确数字(与 DB 一致);普通用户访问任何 `/api/admin/*` → 403。
8. 浏览器:管理员后台三页(仪表盘/公告/系统设置)可用;用户端能看公告、顶栏显示站名。

## 8. 测试策略

本期手动冒烟(curl 接口 + 浏览器页面 + 查 MySQL)。自动化测试待统一补;service 层(setting/announcement)与白名单逻辑、published 过滤已按可测试性留好边界。
