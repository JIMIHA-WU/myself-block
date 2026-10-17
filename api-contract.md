# API 契约（api-contract.md）

> 项目：**myself-block**（站点名 ROVER）· 版本 **v0.1（占位稿）** · 日期 **2026-10-17（Day 15）**
> 状态：**只登记，不实现**。本文件是第 3 周（Day 16–20）建表、写接口的**唯一依据**。
> 前端现状：`client/api/data.js` 为 mock 数据版；接口上线后，`data.js` 改为 HTTP 取数，
> **页面与字段形状保持不变**（字段名以本契约为准）。

---

## 0. 总约定

| 项 | 约定 |
| --- | --- |
| Base URL | `https://<环境ID>.service.tcloudbase.com`（以控制台实际域名为准） |
| 传输 | HTTPS，UTF-8，`Content-Type: application/json; charset=utf-8` |
| 日期格式 | 日期 `YYYY-MM-DD`；时间戳 ISO 8601（如 `2026-10-17T13:00:00+08:00`） |
| 成功响应 | HTTP 2xx + `{ "ok": true, "data": ... }` |
| 失败响应 | HTTP 4xx/5xx + `{ "ok": false, "error": { "code": "...", "message": "..." } }` |
| 错误码 | `BAD_REQUEST`(400) · `NOT_FOUND`(404) · `METHOD_NOT_ALLOWED`(405) · `INTERNAL`(500) |
| 分页 | 查询参数 `limit`（默认 20，最大 50）+ `offset`（默认 0）；响应带 `total` |
| 缓存 | 读接口 `Cache-Control: no-store`（阶段一从简） |
| 方法限制 | 除 `GET`/`HEAD` 外一律 `405` |
| **跨域（CORS）** | **本日不处理**。静态托管域与函数域不同源，Day 16 接接口时在函数响应头加 `Access-Control-Allow-Origin`；今天接口未接线，前端不受影响。 |

### 0.1 唯一例外：health 是扁平结构

`GET /api/health` 按课程要求返回**扁平 JSON**（不使用 `data` 信封）：

```json
{ "ok": true, "service": "myself-block" }
```

---

## 1. `GET /api/health` — ✅ 已实现（Day 15）

| 项 | 内容 |
| --- | --- |
| 路径 | `/api/health` |
| 方法 | `GET`（`HEAD` 同义） |
| 请求参数 | 无 |
| 成功响应 | `200` → `{ "ok": true, "service": "myself-block" }` |
| 错误返回 | `405` → `{ "ok": false, "error": { "code": "METHOD_NOT_ALLOWED", "message": "Only GET is allowed" } }` |
| 实现 | `server/cloudfunctions/health/index.js` |
| 用途 | 证明「公网 → 云函数」链路；部署自检；后续可加版本号/环境 ID |

---

## 2. `GET /api/site` — 站点信息（占位）

对应前端 `data.js` 的 `SITE` + `stats()`。

| 项 | 内容 |
| --- | --- |
| 路径 | `/api/site` |
| 方法 | `GET` |
| 请求参数 | 无 |
| 成功响应 | 见下 |
| 错误返回 | `500` → `{ "ok": false, "error": { "code": "INTERNAL", "message": "..." } }` |

```json
{
  "ok": true,
  "data": {
    "name": "ROVER",
    "slogan": "to record myself",
    "subtitle": "So you can look below.",
    "intro": ["大二在读，方向是导航与电子信息，平时折腾代码和一些自己想做的小工具。", "这里放我拍的照片和随手记下的东西。"],
    "email": "1689871232@qq.com",
    "github": "https://github.com/JIMIHA-WU/myself-block",
    "firstOnline": "2026-09-28",
    "stats": { "photos": 17, "notes": 4, "days": 20, "lastUpdated": "2026-10-14" }
  }
}
```

> `days`（建站天数）由后端按 `firstOnline` 与当天日期计算，不存库。

---

## 3. `GET /api/photos` — 照片墙（三组，占位）

对应前端 `data.js` 的 `PHOTO_GROUPS`（v1.12 三分组：EXPERIENCE / FUNNY / HANDSOME）。

| 项 | 内容 |
| --- | --- |
| 路径 | `/api/photos` |
| 方法 | `GET` |
| 请求参数 | `group`（可选，组 id：`experience` / `funny` / `handsome`；缺省返回全部） |
| 成功响应 | 见下 |
| 错误返回 | `400`（group 非法）→ `{ "ok": false, "error": { "code": "BAD_REQUEST", "message": "unknown group" } }` |

```json
{
  "ok": true,
  "data": {
    "total": 17,
    "groups": [
      {
        "id": "experience",
        "name": "EXPERIENCE",
        "photos": [
          { "id": "e1", "src": "https://<静态托管域>/public/assets/photos/Experience/photo-01.webp", "w": 1078, "h": 598, "alt": "EXPERIENCE 照片 01" }
        ]
      }
    ]
  }
}
```

> `w`/`h` 必填：前端瀑布流靠它分列（不依赖图片加载完成）。

---

## 4. `GET /api/posts` — 记录列表（占位）

对应前端 `data.js` 的 `POSTS` + `feed()`（笔记与感悟混排，日期倒序）。

| 项 | 内容 |
| --- | --- |
| 路径 | `/api/posts`（**不带 `id`** 时为列表） |
| 方法 | `GET` |
| 请求参数 | `type`（可选：`note` / `moment`）· `limit` · `offset` |
| 成功响应 | 见下（列表项**不含正文**，正文走详情接口） |
| 错误返回 | `400`（type 非法/limit 超限）· `500` |

```json
{
  "ok": true,
  "data": {
    "total": 5,
    "items": [
      {
        "id": "n4",
        "type": "note",
        "date": "2026-10-14",
        "title": "布什各门，这是什么情况",
        "summary": "这个React网站上面真的有很多的优秀作品集……",
        "cover": "https://<静态托管域>/public/assets/covers/2026-10-14-note-a.webp"
      }
    ]
  }
}
```

> `summary`：笔记必返（PRD §4.3 必填）；感悟无该字段，前端卡片显示正文全文（列表接口对感悟用 `excerpt` 返回前 200 字，可后续再定）。

---

## 5. `GET /api/posts?id=` — 记录详情（占位）

| 项 | 内容 |
| --- | --- |
| 路径 | `/api/posts?id=<记录 id>` |
| 方法 | `GET` |
| 请求参数 | `id`（必填） |
| 成功响应 | 见下 |
| 错误返回 | `400`（缺 id）→ `BAD_REQUEST`；`404` → `{ "ok": false, "error": { "code": "NOT_FOUND", "message": "post not found" } }` |

```json
{
  "ok": true,
  "data": {
    "id": "n4",
    "type": "note",
    "date": "2026-10-14",
    "title": "布什各门，这是什么情况",
    "summary": "……",
    "cover": "https://<静态托管域>/public/assets/covers/2026-10-14-note-a.webp",
    "body": [
      { "type": "p", "text": "之后要进入修改期，今天晚上的作业同时包括打卡，知识库搭建《田间智能传感器》" },
      { "type": "img", "src": "https://<静态托管域>/public/assets/inline/2026-10-14-note-a-1.webp", "alt": "插图" }
    ],
    "prevId": null,
    "nextId": "n1"
  }
}
```

> `body` 数组只允许两种元素：`{type:"p"}` 段落 / `{type:"img"}` 插图（与前端 mock 的「字符串 / {img,alt}」一一对应，由 `data.js` 适配层转换）。
> `prevId`/`nextId` 仅在**笔记之间**跳转（PRD §9.8）；感悟返回 `null`。

---

## 6. `GET /api/archive` — 归档（占位）

对应前端 `app.js` 第 15 节（按月份分组）。

| 项 | 内容 |
| --- | --- |
| 路径 | `/api/archive` |
| 方法 | `GET` |
| 请求参数 | 无 |
| 成功响应 | 见下 |
| 错误返回 | `500` |

```json
{
  "ok": true,
  "data": {
    "total": 5,
    "months": [
      { "ym": "2026-10", "label": "2026 年 10 月", "count": 1 },
      { "ym": "2026-09", "label": "2026 年 9 月", "count": 4 }
    ]
  }
}
```

---

## 7. `GET /api/works` — 作品集（占位）

对应前端 `data.js` 的 `WORKS`。

| 项 | 内容 |
| --- | --- |
| 路径 | `/api/works` |
| 方法 | `GET` |
| 请求参数 | `limit` · `offset`（可选） |
| 成功响应 | 见下 |
| 错误返回 | `500` |

```json
{
  "ok": true,
  "data": {
    "total": 2,
    "items": [
      { "id": "w1", "date": "2026-10-12", "title": "这个网站本身", "desc": "……", "cover": "https://<静态托管域>/public/assets/works/work-01.webp", "url": "https://github.com/JIMIHA-WU/myself-block" }
    ]
  }
}
```

> `url` 为空字符串 = 该作品无外链，前端卡片不可点（PRD §4.11）。

---

## 8. `GET /api/tracks` — 音乐列表（占位）

对应前端 `data.js` 的 `MUSIC`。

| 项 | 内容 |
| --- | --- |
| 路径 | `/api/tracks` |
| 方法 | `GET` |
| 请求参数 | 无 |
| 成功响应 | 见下 |
| 错误返回 | `500` |

```json
{
  "ok": true,
  "data": {
    "total": 3,
    "items": [
      { "id": "t1", "title": "未命名曲目一", "artist": "Jack", "duration": "3:24", "src": "https://<静态托管域>/public/assets/audio/track-01.mp3" }
    ]
  }
}
```

> `duration` 为**展示用字符串**（`m:ss`），与页面显示一致；不要求前端换算。

---

## 9. 数据表映射（Day 16 建表依据，占位）

> 仅登记表与字段的对应关系，**今日不建表**。命名遵循 `TECH_DESIGN.md`（阶段二 PostgreSQL）。

| 表 | 主要字段 | 对应接口 |
| --- | --- | --- |
| `site_meta`（单行） | `name` `slogan` `subtitle` `intro`(jsonb) `email` `github` `first_online` | `/api/site` |
| `photo_groups` | `id` `name` `sort` | `/api/photos` |
| `photos` | `id` `group_id` `src` `w` `h` `alt` `sort` `added_at` | `/api/photos` |
| `posts` | `id` `type` `title` `date` `summary` `cover` `body`(jsonb) | `/api/posts`（列表/详情）、`/api/archive`（聚合） |
| `works` | `id` `date` `title` `desc` `cover` `url` `sort` | `/api/works` |
| `tracks` | `id` `title` `artist` `duration` `src` `sort` | `/api/tracks` |

## 10. 前端接线点（Day 16–20 才做）

- `client/api/data.js` 的 `SITE` / `PHOTO_GROUPS` / `POSTS` / `WORKS` / `MUSIC` 改为 `fetch` 上述接口；
- **字段名与形状不变**，页面渲染代码（`app.js`）不改；
- 静态资源域名：接口返回的 `src`/`cover` 用**静态托管域的绝对地址**（前端不再依赖 `../public/...` 相对路径）；
- CORS：在函数响应头加 `Access-Control-Allow-Origin: https://<静态托管域>`（Day 16 与本契约同步落）。
