# API 契约（api-contract.md）

> 项目：**myself-block**（站点名 ROVER）· 版本 **v0.2（表结构已落库）** · 日期 **2026-10-19（Day 16）**
> 状态：**Day 15 登记接口，Day 16 落地两张核心表**。本文件是第 3 周（Day 16–20）建表、写接口的**唯一依据**。
> 前端现状：`client/api/data.js` 为 mock 数据版；接口上线后，`data.js` 改为 HTTP 取数，
> **页面与字段形状保持不变**（字段名以本契约为准）。

---

## 0. 总约定

| 项 | 约定 |
| --- | --- |
| Base URL | `https://myself-demo-d3gdb1m6x686e940f-1509266644.ap-shanghai.app.tcloudbase.com`（CloudBase HTTP 网关默认域名；接口路径以 `/api` 开头） |
| 传输 | HTTPS，UTF-8，`Content-Type: application/json; charset=utf-8` |
| 日期格式 | 日期 `YYYY-MM-DD`；时间戳 ISO 8601（如 `2026-10-17T13:00:00+08:00`） |
| 成功响应 | HTTP 2xx + `{ "ok": true, "data": ... }`（**data 必有**，可为对象/数组/null） |
| 失败响应 | HTTP 4xx/5xx + `{ "ok": false, "error": { "code": "...", "message": "..." } }` |
| **错误文案（2026-10-21 定）** | `error.message` **必须是中文、人能看懂**（说明"哪里不对、怎么改"）；`error.code` 保留英文机器码供前端分支判断。前端**只认这一种形状**，所有接口不得例外。 |
| 错误码 | `BAD_REQUEST`(400) · `NOT_FOUND`(404) · `METHOD_NOT_ALLOWED`(405) · `CONFLICT`(409) · `INTERNAL`(500) |
| 分页 | 查询参数 `limit`（默认 20，最大 50）+ `offset`（默认 0）；响应带 `total` |
| 缓存 | 读接口 `Cache-Control: no-store`（阶段一从简） |
| 方法限制 | 除 `GET`/`HEAD`（写接口另有 `POST`）外一律 `405` |
| **跨域（CORS）** | **白名单**：`CORS_ORIGIN` 逗号分隔（如 `https://站点域,http://localhost:8000`），**禁止 `*`**；仅当请求 `Origin` 在白名单内才原样回显，否则回第一个来源（浏览器拦截）。`OPTIONS` 预检返 `204`。**网关路由的"跨域"开关必须关闭**，否则响应头会出现两个值导致浏览器拒收。 |

### 0.1 health 也走统一信封（保留兼容字段）

`GET /api/health` 早期是扁平结构，自 2026-10-21 起同样返回 `data`；`service` 顶层字段**保留**，不破坏 Day 15 的验收与监控脚本：

```json
{ "ok": true, "service": "myself-block", "data": { "service": "myself-block", "status": "ok" } }
```

---

## 1. `GET /api/health` — ✅ 已实现（Day 15）

| 项 | 内容 |
| --- | --- |
| 路径 | `/api/health` |
| 方法 | `GET`（`HEAD` 同义） |
| 请求参数 | 无 |
| 成功响应 | `200` → `{ "ok": true, "service": "myself-block", "data": { "service": "myself-block", "status": "ok" } }`（`service` 为 Day 15 兼容字段，`data` 为统一信封） |
| 错误返回 | `405` → `{ "ok": false, "error": { "code": "METHOD_NOT_ALLOWED", "message": "Only GET is allowed" } }`；平台层异常（崩溃/超时）由网关返 `500/502`，无应用层 JSON |
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
| 成功响应 | `200` → 见下 |
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

## 3. `GET /api/photos` — 照片墙（三组）— ✅ **已实现（Day 17）**

对应前端 `data.js` 的 `PHOTO_GROUPS`（v1.12 三分组：EXPERIENCE / FUNNY / HANDSOME）。

| 项 | 内容 |
| --- | --- |
| 路径 | `/api/photos`（云函数根路径 `/` 等价，便于自检） |
| 方法 | `GET`（`HEAD` 同义；`OPTIONS` 返 204 预检） |
| 请求参数 | `group`（可选，组 id：`experience` / `funny` / `handsome` / 预留组；缺省返回全部）· `limit`（可选，1–100，**每组最多返回张数**） |
| 成功响应 | `200` → 见下 |
| 错误返回 | `400`（group 非法 / limit 越界）→ `BAD_REQUEST`；`405` → `METHOD_NOT_ALLOWED`；`500` → `INTERNAL`（形状均见 §0 信封） |
| 实现 | `server/cloudfunctions/photos-api/index.js`（HTTP 云函数，**走平台 REST / PostgREST + API Key**；免费共享集群不支持 PG 直连，故不直连数据库） |
| 行为说明 | ① **空组过滤**：没有照片的分组不返回（`PLACES` / `SCREENSHOTS` 这类预留组因此不可见）；② `src` = `SITE_ORIGIN`（静态托管域名）+ 表内 `/public/assets/...` 路径；③ `total` = 本次响应里的照片总数（受 `group`/`limit` 影响）；④ 读接口带 `Cache-Control: no-store` |

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
| 成功响应 | `200` → 见下（列表项**不含正文**，正文走详情接口） |
| 错误返回 | `400`（type 非法/limit 超限）· `500`（形状均见 §0 信封） |

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
| 成功响应 | `200` → 见下 |
| 错误返回 | `400`（缺 id）→ `BAD_REQUEST`；`404` → `NOT_FOUND`；`500` → `INTERNAL`（形状均见 §0 信封） |

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
| 成功响应 | `200` → 见下 |
| 错误返回 | `500` → `INTERNAL`（信封见 §0） |

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
| 成功响应 | `200` → 见下 |
| 错误返回 | `500` → `INTERNAL`（信封见 §0） |

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
| 成功响应 | `200` → 见下 |
| 错误返回 | `500` → `INTERNAL`（信封见 §0） |

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

## 9. 数据表（Day 16 已落地）

> 依据 §3 的字段形状建表，**不另造字段**。
> Day 16 只建两张**有外键关系**的核心表：`photo_groups`（1）→ `photos`（N）。
> 其余四张（`site_meta` / `posts` / `works` / `tracks`）相互孤立、无外键，随各自接口上线补建（Day 18 起）。
>
> - 建表脚本：`db/schema.sql`（开头 DROP，可整体重建）
> - 开发期种子：`db/seed.sql`（先删后插，可重复执行）
> - **第 20 天上线后禁止执行以上两个脚本**，数据变更一律用增量 SQL。

### 9.1 已建表（2 张）

**`photo_groups`** — 照片分组，对应 `GET /api/photos` 的 `data.groups[]`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | TEXT | PK | 组标识，与前端 `group id` 一致（`experience` / `funny` / `handsome`） |
| `name` | TEXT | NOT NULL · UNIQUE | 显示名，全大写英文 |
| `sort` | SMALLINT | NOT NULL DEFAULT 0 | 分组顺序，从 1 开始 |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT now() | 创建时间 |

**`photos`** — 照片，对应 `GET /api/photos` 的 `data.groups[].photos[]`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | TEXT | PK | 与前端一致（`e1` / `f1` / `h1` …） |
| `group_id` | TEXT | NOT NULL · FK → `photo_groups.id` · ON DELETE RESTRICT | **两张表唯一的关联字段** |
| `src` | TEXT | NOT NULL | 站点根相对路径，如 `/public/assets/photos/Funny/photo-01.webp` |
| `w` | INTEGER | NOT NULL · CHECK > 0 | 像素宽（瀑布流分列用） |
| `h` | INTEGER | NOT NULL · CHECK > 0 | 像素高（瀑布流分列用） |
| `alt` | TEXT | NOT NULL DEFAULT '' | 中性描述，不含地点与人物身份（PRD §3.3） |
| `sort` | SMALLINT | NOT NULL DEFAULT 0 | 组内顺序，从 1 开始 |
| `added_at` | DATE | NOT NULL DEFAULT CURRENT_DATE | 入库日期，页面不直接展示 |

索引：`idx_photos_group_sort (group_id, sort)` —— 覆盖「按组过滤 + 组内排序」的典型查询。
业务唯一：`UNIQUE (group_id, src)` —— 同一分组内同一张图只登记一次。

**两条字段约定（与 §3 示例的差异，Day 17 写接口时按此实现）**

1. `id` 用 TEXT 而不用自增整数：前端 id 已是 `e1` / `f1` 这类短串，自增会逼接口做一层映射。
2. `src` 存**站点根相对路径**，不存完整 URL：域名由接口层拼接（§10 要求的绝对地址在响应里体现），换域名时不必改库。

### 9.2 待建表（4 张，Day 18 起）

| 表 | 主要字段 | 对应接口 | 状态 |
| --- | --- | --- | --- |
| `site_meta`（单行） | `name` `slogan` `subtitle` `intro`(jsonb) `email` `github` `first_online` | `/api/site` | 待建 |
| `posts` | `id` `type` `title` `date` `summary` `cover` `body`(jsonb) | `/api/posts`（列表/详情）、`/api/archive`（聚合） | 待建 |
| `works` | `id` `date` `title` `desc` `cover` `url` `sort` | `/api/works` | 待建 |
| `tracks` | `id` `title` `artist` `duration` `src` `sort` | `/api/tracks` | 待建 |

## 10. 前端接线点（Day 16–20 才做）

- `client/api/data.js` 的 `SITE` / `PHOTO_GROUPS` / `POSTS` / `WORKS` / `MUSIC` 改为 `fetch` 上述接口；
- **字段名与形状不变**，页面渲染代码（`app.js`）不改；
- 静态资源域名：接口返回的 `src`/`cover` 用**静态托管域的绝对地址**（前端不再依赖 `../public/...` 相对路径）；
- CORS：**白名单**（`CORS_ORIGIN` 逗号分隔，禁止 `*`）；网关路由的「跨域」需关闭，只保留函数自身的头

---

## 11. `POST /api/photos` — 新增一张照片（Day 18）— ✅ **已实现并公网验证（2026-10-22）**

> 实现：`server/cloudfunctions/photos-api/index.js`（走平台 REST / PostgREST）。
> 验证记录：正常写入 `201`（`p_5705fa`，`sort` 自动为 1）→ 重复提交 `409` → 缺字段 `400` → `GET /api/photos?group=screenshots` 读回同一条，`total` 17→18。
> 注意：HTTP 网关「路径透传=关」时，函数收到的 URL 是 `/`（不是 `/api/photos`），代码已按此适配。
> 只做「新增」，不提供修改/删除（阶段二后台上线时另定）。

| 项 | 内容 |
| --- | --- |
| 路径 | `/api/photos` |
| 方法 | `POST` |
| 请求头 | `Content-Type: application/json`（其他类型 → 400） |
| 请求体上限 | 8 KB |

**请求体字段**

| 字段 | 必填 | 规则 | 缺省 |
| --- | --- | --- | --- |
| `group_id` | ✅ | `^[a-z0-9_-]{1,32}$`，且**必须已存在**于 `photo_groups` | — |
| `src` | ✅ | 必须以 `/public/assets/` 开头，扩展名 `webp/jpg/jpeg/png`，长度 ≤ 300 | — |
| `w` / `h` | ✅ | 整数，1–100000 | — |
| `alt` | — | 字符串 ≤ 200 | `''` |
| `sort` | — | 整数 1–32767 | 组内 `max(sort) + 1` |
| `added_at` | — | `YYYY-MM-DD` | `CURRENT_DATE` |
| `id` | — | `^[a-z0-9_-]{1,16}$` | 服务端生成 `p_` + 6 位十六进制 |

**成功响应** `201`

```json
{
  "ok": true,
  "data": {
    "photo": {
      "id": "p_9f3a1c",
      "group_id": "funny",
      "src": "/public/assets/photos/Funny/photo-99.webp",
      "w": 1600, "h": 900, "alt": "新增测试照片", "sort": 8,
      "added_at": "2026-10-21"
    }
  }
}
```

**错误返回**

| 状态 | code | 触发条件 |
| --- | --- | --- |
| 400 | `BAD_REQUEST` | 缺必填字段 / 字段格式不对 / `group_id` 不存在（message 会写明字段名） |
| 409 | `CONFLICT` | `id` 已存在，或 `(group_id, src)` 已登记过 |
| 405 | `METHOD_NOT_ALLOWED` | 非 GET/POST/HEAD/OPTIONS |
| 500 | `INTERNAL` | 数据库错误（message 不含内部细节） |

**鉴权**：本接口**暂未鉴权**（Day 18 范围内）；上线前（Day 19–20）必须加管理端 Token 或仅内网可达，否则任何人都能写库。

**它如何影响读取接口**：写入成功后，`GET /api/photos` 会立刻返回新行——这就是 Day 18 要验证的「读写闭环」。

---

## 12. `PATCH /api/photos?id=<照片 id>` — 修改一张照片（Day 22）

> 状态：**✅ 已实现（代码 + 本地全链路验证，2026-10-24）；公网部署后转为「已验证」**。

| 项 | 内容 |
| --- | --- |
| 路径 | `/api/photos` |
| 方法 | `PATCH` |
| 定位方式 | 查询参数 `id`（必填，`^[a-z0-9_-]{1,16}$`） |
| 请求头 | `Content-Type: application/json` |

**可改字段**（至少提供一个；`id` 与 `src` 不可改）

| 字段 | 规则 |
| --- | --- |
| `alt` | 字符串 ≤ 200（可为空串） |
| `sort` | 整数 1–32767 |
| `group_id` | `^[a-z0-9_-]{1,32}$`，且必须已存在 |
| `w` / `h` | 整数 1–100000 |

**成功响应** `200`

```json
{
  "ok": true,
  "data": {
    "photo": {
      "id": "p_9f3a1c", "group_id": "funny",
      "src": "/public/assets/photos/Funny/photo-99.webp",
      "w": 1600, "h": 900, "alt": "改过的说明", "sort": 3,
      "added_at": "2026-10-21"
    }
  }
}
```

**错误返回**

| 状态 | code | 触发条件 |
| --- | --- | --- |
| 400 | `BAD_REQUEST` | 缺 `id` / `id` 格式错 / 请求体不是 JSON / 没提供可改字段 / 字段值非法 / `group_id` 不存在（message 写明字段） |
| 404 | `NOT_FOUND` | 该 `id` 不存在 |
| 409 | `CONFLICT` | 改 `group_id` 后与同组已有 `src` 冲突 |
| 405 | `METHOD_NOT_ALLOWED` | 方法不在 GET/POST/PATCH/DELETE/HEAD/OPTIONS 内 |

---

## 13. `DELETE /api/photos?id=<照片 id>` — 删除一张照片（Day 22）

> 状态：**✅ 已实现（代码 + 本地全链路验证，2026-10-24）；公网部署后转为「已验证」**。当前为**物理删除**；软删除（`is_deleted`）列为 Day 22 余力项，未实施。

| 项 | 内容 |
| --- | --- |
| 路径 | `/api/photos` |
| 方法 | `DELETE` |
| 定位方式 | 查询参数 `id`（必填） |

**成功响应** `200`

```json
{ "ok": true, "data": { "deleted": { "id": "p_9f3a1c" } } }
```

**错误返回**

| 状态 | code | 触发条件 |
| --- | --- | --- |
| 400 | `BAD_REQUEST` | 缺 `id` / 格式错 |
| 404 | `NOT_FOUND` | 该 `id` 不存在（删除已删的也返回 404） |
| 405 | `METHOD_NOT_ALLOWED` | 方法不允许 |

**为什么删除比新增更容易出事**（实现约定）：
1. 新增只影响自己，删除影响**别人是否能再看到**——不可逆；
2. 因此删除必须**先确认存在**（404 而非静默成功）、**必须带精确定位**（不允许无 `id` 批量删）、**必须只删一条**（`id` 唯一）；
3. 前端调用删除前必须二次确认；批量删除不在本周范围。
### 12/13 验证记录（2026-10-24，本地全链路）

用内存版 PostgREST 替身跑「增→查→改→查→删→查」，结果：

| 步骤 | 结果 |
| --- | --- |
| ① `POST /api/photos` | `201`，返回 `id=p_e6ba63`、`alt="原始说明"`、`sort=1` |
| ② `GET ?group=screenshots` | `200`，`total:1`，含该 id |
| ③ `PATCH ?id=…`（`alt`、`sort`） | `200`，返回 `alt="改过的说明"`、`sort=9` |
| ④ `GET` 再读 | `200`，值已变为改后 |
| ⑤ `DELETE ?id=…` | `200`，`{"deleted":{"id":"p_e6ba63"}}` |
| ⑥ `GET` 删除后 | `200`，`total:0`、`groups:[]`（该 id 不再返回） |
| ⑦ 再 `DELETE` 同 id | `404`，`"照片不存在：p_e6ba63"` |
| ⑧ `PATCH` 不存在 id | `404`，`"照片不存在：p_nope"` |

**数据库前后对比方法（公网部署后用 SQL 复核）**

```sql
-- 改之前
select id, alt, sort from photos where id = 'p_xxxxxx';
-- PATCH 之后再查：alt / sort 应变为新值
select id, alt, sort from photos where id = 'p_xxxxxx';
-- DELETE 之后再查：0 行
select id, alt from photos where id = 'p_xxxxxx';
```

**前端二次确认位置**：`client/check.html` 第 4 块「修改 / 删除」的删除按钮里
`window.confirm('删除后不可恢复。\n\n记录：' + p.id + '\n确定删除这条吗？')`，点取消直接 `return`，不发请求。