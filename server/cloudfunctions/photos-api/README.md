# Day 17 部署手册：photos-api（GET /api/photos）

> 本文件只讲**这一个接口**怎么上线与验证；环境速查见本文件 §0，health 云函数见 §A。
> 前置：Day 16 已完成（`photo_groups` 5 行、`photos` 17 行）。

---

## A. 建函数（控制台，约 3 分钟）

1. 控制台 → 云函数 → 创建云函数 → 通过模板创建；
2. 模板选 **HTTP 云函数 → Hello World（HTTP Node.js Hello World）**；
3. 函数名称：**`photos-api`**（必须叫这个，代码注释与路由都按它写）；
4. 创建后进入「函数代码」，覆盖两个文件：
   - `index.js` ← 本目录 `index.js` 全文；
   - `package.json` ← 本目录 `package.json`（**0.2.0 起无第三方依赖**，不用装包）；
   - `scf_bootstrap` 保持模板默认（`#!/bin/bash` + `node index.js`）；
5. **先配环境变量再部署**（见 B），否则函数首次请求会连库失败。

## B. 环境变量（控制台 → 函数 → 配置 → 环境变量）

> **v0.2.0 起不再直连数据库。** 免费体验版是"共享集群"，不提供内网/外网直连（要升级独享集群=付费），
> 因此改走 **CloudBase 平台 REST（PostgREST）**：不需要数据库地址与密码，只要一个 **API Key**。

| Key | 取值 | 说明 |
| --- | --- | --- |
| `TCB_ENV_ID` | `myself-demo-d3gdb1m6x686e940f` | 环境 ID |
| `TCB_API_KEY` | 控制台生成的 **API Key**（service_role） | **只填在云函数环境变量里，绝不放前端、不进代码库** |
| `SITE_ORIGIN` | `https://myself-demo-d3gdb1m6x686e940f-1509266644.tcloudbaseapp.com` | 用于把表里的 `/public/assets/...` 拼成完整图片 URL |
| `CORS_ORIGIN` | 可留空（默认 `*`） | 想收紧就填静态托管域 |

> 旧的 `PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD` 可以留也可以删——新代码不读它们，删掉更干净。

### B1. 创建 API Key

控制台左下 **「环境管理」→「API Key 配置」→「服务端 API Key」→「创建 API Key」**（2026-10-22 实测位置；
「身份认证」页里没有 Key 管理）。创建后立即复制，通常只显示一次。

### B2. 授予表权限（SQL 编辑器执行一次）

```sql
grant usage on schema public to service_role;
grant select on public.photo_groups, public.photos to service_role;
grant insert on public.photos to service_role;
```

> `service_role` 具备 BYPASSRLS；表未启用 RLS，所以这一步只要是 GRANT 通过即可。

## C. 部署 + 开路由

1. 「保存并部署」，等状态变为「部署完成」；
2. HTTP 网关 → 路由管理 → 新增路由：
   - 路径：**`/api/photos`**
   - 关联资源：云函数 → `photos-api`
   - 其余同 `/api/health` 的配置（路径透传关、身份认证关、跨域开）
3. 公网地址形如：
   `https://myself-demo-d3gdb1m6x686e940f-1509266644.ap-shanghai.app.tcloudbase.com/api/photos`

## D. 验证

### D1. 浏览器

打开 `…/api/photos`，应看到 `{"ok":true,"data":{"total":17,"groups":[…3 组…]}}`；
再试：
- `…/api/photos?group=funny` → 只有 FUNNY，7 张；
- `…/api/photos?limit=2` → 每组 2 张，`total` 变 6；
- `…/api/photos?group=places` → `{"ok":true,"data":{"total":0,"groups":[]}}`（预留空组被过滤）。

### D2. 命令行

```bat
curl -i "https://<函数域名>/api/photos?group=funny"
```

### D3. 「改一行数据，接口跟着变」（Day 17 验收项）

1. 控制台 → SQL 编辑器执行：

```sql
update photo_groups set name = 'PLACES-X' where id = 'places';
```

2. 重新请求 `…/api/photos`（或 `?group=places`）——接口返回里应出现 `PLACES-X`（有照片的组才返回；若 places 无图，改用 funny 验证）：

```sql
update photo_groups set name = 'FUNNY-X' where id = 'funny';
```

3. 验证完**改回去**：

```sql
update photo_groups set name = 'FUNNY' where id = 'funny';
```

> 这一步证明：接口读的是**库里的真实数据**，不是代码里的假数据。

## E. 常见故障

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `500 INTERNAL database query failed` | 环境变量缺失/错误，或账号无表权限 | 看函数日志里的 `query failed:` 详情；核对 5 个 PG 变量 |
| `getaddrinfo ENOTFOUND` | PGHOST 填错 | 用控制台连接信息里的地址 |
| 连接超时 | 用了公网地址但网络不通 | 换内网地址（同环境云函数应走内网） |
| 图片 404（`src` 打不开） | `SITE_ORIGIN` 没配或配错 | 检查该变量，末尾不要带斜杠 |
| `Cannot find module 'pg'` | 部署时没带 package.json | 确认上传了含 `pg` 依赖的 `package.json` 并重新部署 |
| POST 返回 `400 请求体不是合法 JSON`，但 body 看着没问题 | **PowerShell 5.1 调用 `curl.exe` 会吞掉 JSON 里的双引号**（不是接口问题） | 用 Node 发请求，或 `curl.exe --data-binary "@body.json"`（把 JSON 存文件），或 `Invoke-RestMethod -Body ([Text.Encoding]::UTF8.GetBytes($json))` |
| POST 返回 `405 只支持 GET 和 POST 请求` | 网关「路径透传=关」时函数收到 URL `/`，旧代码按 `/api/photos` 精确匹配 | 已在 2026-10-22 修复：POST 不再校验路径 |

---

## F. POST /api/photos（Day 18：写接口 + 读写闭环）

> 改动：`index.js` 已同时支持 GET 与 POST；重新粘贴 `index.js` 并「保存并部署」即可，环境变量不用改。

### F1. 正常写入（期望 201）

```powershell
$body = '{"group_id":"funny","src":"/public/assets/photos/Funny/photo-99.webp","w":1600,"h":900,"alt":"新增测试照片"}'
Invoke-RestMethod -Uri "https://<函数域名>/api/photos" -Method Post -ContentType "application/json" -Body $body | ConvertTo-Json -Depth 6
```

期望返回：

```json
{"ok":true,"data":{"photo":{"id":"p_9f3a1c","group_id":"funny","src":"/public/assets/photos/Funny/photo-99.webp","w":1600,"h":900,"alt":"新增测试照片","sort":8,"added_at":"2026-10-21"}}}
```

### F2. 数据库确认新行

```sql
select id, group_id, src, w, h, alt, sort, added_at
  from photos
 where src = '/public/assets/photos/Funny/photo-99.webp';
```

应出现 1 行（`sort` 是组内最大值 +1，`added_at` 默认今天）。

### F3. 重复提交（期望 409）

同一条请求**再发一次**，应返回：

```json
{"ok":false,"error":{"code":"CONFLICT","message":"这张图已在该分组登记过"}}
```

（`(group_id, src)` 有唯一约束；若显式带相同 `id`，则提示 `photo id already exists`。）

### F4. 缺字段 / 非法分组（期望 400，信息可读）

```powershell
# 缺 src / w / h
Invoke-RestMethod -Uri "https://<函数域名>/api/photos" -Method Post -ContentType "application/json" -Body '{"group_id":"funny"}' -SkipHttpErrorCheck

# 分组不存在
Invoke-RestMethod -Uri "https://<函数域名>/api/photos" -Method Post -ContentType "application/json" -Body '{"group_id":"nope","src":"/public/assets/x.webp","w":100,"h":100}' -SkipHttpErrorCheck
```

期望分别是：

- `400 BAD_REQUEST`：`src 必填：需以 /public/assets/ 开头，并以 .webp/.jpg/.jpeg/.png 结尾（不超过 300 字符）`
- `400 BAD_REQUEST`：`分组不存在：nope`

### F5. 读回（读写闭环）

浏览器打开 `…/api/photos?group=funny` → `photos` 数组末尾应出现刚写入的 `photo-99.webp`，`total` 从 7 变 8。

### F6. 清理测试数据（可选，保持 17 张）

```sql
delete from photos where src = '/public/assets/photos/Funny/photo-99.webp';
```
