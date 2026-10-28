# Bug 修复留证（Day 24 · 2026-10-28）

> Bug：**请求体超过 8 KB 时，云函数进程直接退出**，客户端拿不到任何中文提示
> 严重度：**高**（任何一次超长输入都能让接口“假死”一次）
> 状态：**代码已修并提交（`96a274a`）；线上待部署 0.4.0 后复验**

---

## 0. 一句话结论

> 不是网络的锅，也不是网关的锅，是 `readBody()` 里那句 `req.destroy()`——
> 它把「参数错误」硬生生做成了「连接异常」，在云函数运行时里甚至直接把进程搞退出。

---

## ① 复现（Reproduce）

### 现象（用户视角）

在页面里提交一段**较长的说明文字**（比如从别处粘贴一大段），点保存后：
- 浏览器 Network 里那条请求是红的，状态码 **439**；
- 控制台报 `Failed to fetch`；
- 接口没有返回任何中文提示，用户不知道是自己写太长，还是网断了。

### 复现步骤（命令行，任何人都能重跑）

```bash
# 造一个 8702 字节的请求体（alt 塞 8600 个 x），超过 8 KB 上限
# 注意：这个请求不会写入任何数据，因为它在校验之前就被拦下了
curl -X POST "https://myself-demo-d3gdb1m6x686e940f-1509266644.ap-shanghai.app.tcloudbase.com/api/photos" \
  -H "Content-Type: application/json" \
  --data-binary @bigbody-8600.json
```

### 实测结果（2026-10-28 23:26，线上 0.3.0）

| 请求体大小 | HTTP | 响应体 |
| --- | --- | --- |
| 7,102 B（对照） | `400` | `{"ok":false,"error":{"code":"BAD_REQUEST","message":"alt 必须是不超过 200 字的字符串"}}` ← 正常，中文 |
| 8,702 B | **`439`** | `{"ret_code":200406,"ret_msg":"UHJvY2VzcyBleGl0ZWQgdW5leHBlY3RlZGx5Lg==","duration_in_ms":1,"mem_usage_in_bytes":7540736}` |

`ret_msg` 是 base64，解出来是：**`Process exited unexpectedly.`**（进程意外退出）
—— 也就是说：**云函数被打挂了**，网关只好替它回一段英文。

> 为什么 439 这个状态码很可疑：网关自己的限流/超限一般是 `413`/`429`，返回 `439 + 进程退出` 说明是**函数进程死了**，不是网关拦的。

---

## ② 定位（Locate）

### 怎么排除掉其他原因（这是今天要掌握的部分）

| 怀疑对象 | 怎么排除 | 结论 |
| --- | --- | --- |
| ① 网络问题 | 同一个域名，`GET /api/photos` 稳定 200；`POST` 小请求体也稳定 200/400 | 排除 |
| ② 参数校验逻辑 | 7 KB 的请求体能正常返回中文 400（`alt 必须是不超过 200 字`），说明校验链路是通的 | 排除 |
| ③ 跨域 CORS | `curl` 请求**不带 Origin** 也照样 439 → 与浏览器跨域无关 | 排除 |
| ④ 网关请求体限制 | 网关自己的限制会回 `413`，且不会出现 `ret_code / Process exited`；这里是 **439 + 进程退出** | 排除 |
| ⑤ 数据库 / 上游 | 该请求在校验阶段就被拦，**根本没走到 db.js**；同时 `?diag=1` 显示 `restStatus:200` | 排除 |
| ⑥ 代码里唯一的“分界点” | 做二分：7,102 B 正常 / 8,702 B 崩，边界落在 **8192 B = `BODY_LIMIT`** | **锁定** |

**关键推理**：只有“8 KB 这个数字”能解释这个边界。全文搜索 `8 * 1024`，只命中一处：

```js
// server/cloudfunctions/photos-api/index.js（修复前）
const BODY_LIMIT = 8 * 1024;
```

### 真正的坏味道（修复前代码）

```js
function readBody(req) {
  return new Promise(function (resolve, reject) {
    let size = 0;
    const chunks = [];
    req.on('data', function (chunk) {
      size += chunk.length;
      if (size > BODY_LIMIT) {
        reject(new Error('body too large'));
        req.destroy();          // ← 元凶
        return;
      }
      chunks.push(chunk);
    });
    ...
```

这里有一个**时序错误**：

1. `reject()` 只是把 Promise 标成失败，**此时还没有写出任何响应**；
2. 紧接着 `req.destroy()` 把底层 socket 掐断；
3. 上层 `.catch()` 里准备 `fail(res, 400, ...)` 时，**连接已经没了**，响应写不出去。

结果就是：一个本该是「400 参数错误」的场景，被做成了「连接异常」。
本地复现是客户端 `ECONNRESET`（进程还活着）；线上云函数运行时对未处理的 socket 错误更严格，直接进程退出（`Process exited unexpectedly.`）。
**同一行代码，两种表现，指向同一个原因。**

---

## ③ 修复（Fix）

### 改法：不掐断连接，改成“停止累积 + 把剩余数据读完”

```js
function readBody(req) {
  return new Promise(function (resolve, reject) {
    let size = 0;
    let stopped = false;               // 新增：已超限标记
    const chunks = [];
    req.on('data', function (chunk) {
      if (stopped) return;             // 新增：超限后不再累积
      size += chunk.length;
      if (size > BODY_LIMIT) {
        stopped = true;
        const err = new Error('body too large');
        err.code = 'BODY_TOO_LARGE';   // 新增：用机器码判断，不靠比对英文字符串
        reject(err);
        req.resume();                  // 新增：丢弃剩余字节，但不掐断连接
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', function () { if (!stopped) resolve(Buffer.concat(chunks).toString('utf8')); });
    req.on('error', reject);
  });
}
```

上层两处 `catch` 也同步改成按机器码判断，并把文案换成“哪里不对 + 怎么办”：

```js
// 修复前
if (err && err.message === 'body too large') {
  return fail(res, 400, 'BAD_REQUEST', '请求体过大（最多 8 KB）', method);
}
// 修复后
if (err && err.code === 'BODY_TOO_LARGE') {
  return fail(res, 400, 'BAD_REQUEST', '请求体太大：最多 8 KB，请把内容删短一些（比如 alt 少写几个字）', method);
}
```

**为什么不是简单删掉 `req.destroy()` 就完事**：不 `destroy` 又不读，剩下的字节会堵在 socket 缓冲区里，HTTP keep-alive 复用这条连接时就会错位。所以必须 `req.resume()` 把剩余数据读干净再丢。

---

## ④ 验证（Verify）

### 本地回归（改后实测，`audit-input.js`）

| 用例 | 结果 |
| --- | --- |
| 9,000 B 请求体 | `400 请求体太大：最多 8 KB，请把内容删短一些（比如 alt 少写几个字）` |
| src 含 `..` | `400 … 不能含 .. 或 //` |
| src 含 `//` | `400 … 不能含 .. 或 //` |
| src 合法（对照） | `201`，正常写入 |
| alt 201 字 | `400 alt 必须是不超过 200 字的字符串` |
| 请求体 `{bad` | `400 请求体不是合法 JSON` |

### 回归（确认没改坏别的）

- Day 23 全量错误回归：10 个后端场景（500 / 401 / 断连 / 无凭证 / 400 / 404 / 405）全部中文，无回归；
- 前端 5 个场景：5/5 通过。

### 线上复验（部署 0.4.0 后必做）

```bash
curl -X POST "https://…/api/photos" -H "Content-Type: application/json" --data-binary @bigbody-8600.json
```

**期望**：`HTTP 400` + `{"ok":false,"error":{"code":"BAD_REQUEST","message":"请求体太大：…"}}`
**若仍是 439**：说明云函数没换成 0.4.0（看 `?diag=1` 的 `version`）。

---

## 截图怎么拍（两张）

### 第一张：F12 里的报错原文（**现在就能拍，线上还是旧版**）

1. 打开 `…/client/check.html`，按 F12 → Console；
2. 粘贴并回车：

```js
fetch(ApiClient.base + '/api/photos', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    group_id: 'screenshots',
    src: '/public/assets/photos/Test/checkboard.webp',
    w: 800, h: 600, alt: 'x'.repeat(8600)
  })
}).then(r => r.text()).then(console.log).catch(console.error)
```

3. 截图要点：**Console 里的红色 `Failed to fetch`** + **Network 里那条 `439`**（把 Network 面板也打开，选中该请求）。

### 第二张：修复后正常运行

部署 0.4.0 后，在同一个页面 Console 粘贴：

```js
ApiClient.post('/api/photos', {
  group_id: 'screenshots',
  src: '/public/assets/photos/Test/checkboard.webp',
  w: 800, h: 600, alt: 'x'.repeat(8600)
}).catch(e => console.log('[' + e.code + '] ' + e.message))
```

**期望输出**：`[BAD_REQUEST] 请求体太大：最多 8 KB，请把内容删短一些（比如 alt 少写几个字）`
截图时把**地址栏**一起拍进去（证明是线上环境）。

---

## 余力加练：第二个 Bug（低优先级，已修）

**现象**：`GET /api/photos/f1` 这种“按 id 取单张”的写法，接口从来没实现过，但也不报错——它**静默返回整份列表（200）**。
调用方会以为拿到了单张，实际拿到的是全部数据；爬虫或误拼的链接也会因此拿到全量。

**原因**：`pathPhotoId()` 对所有 HTTP 方法都生效，但 `GET` 分支直接进了列表处理，从头到尾没用过 `pathId`。

```js
// 修复前
if (method === 'GET' || method === 'HEAD') {
  return handleList(req, res, method);      // pathId 被无视
}
// 修复后
if (method === 'GET' || method === 'HEAD') {
  if (pathId) {
    return fail(res, 404, 'NOT_FOUND',
      '接口不存在：' + path + '（查询列表请用 GET /api/photos；按 id 取单张尚未提供）', method);
  }
  return handleList(req, res, method);
}
```

**验证（6 个用例，重点看有没有误伤正常列表）**

| 用例 | 修复前 | 修复后 |
| --- | --- | --- |
| `GET /api/photos` | 200 列表 | **200 列表**（未受影响） |
| `GET /api/photos?group=funny` | 200 | **200**（未受影响） |
| `GET /api/photos/f1` | 200 整份列表 | **404 中文** |
| `GET /f1` | 200 整份列表 | **404 中文** |
| `HEAD /api/photos` | 200 | **200** |
| `GET /`（探活） | 200 | **200** |

---

## 遗留记录（今日不修，只登记）

| # | 问题 | 影响 | 备注 |
| --- | --- | --- | --- |
| 1 | 网关/SFC 的 `ret_code`/`ret_msg` 信封未被 `api-client.js` 识别，会落到“接口地址不对…”这一句 | 低 | 现在会被翻成中文，但归因不准；正确做法是单独识别 `ret_code` 并提示“云函数异常退出” |
| 2 | 写接口无鉴权，任何人可增删改 | **高** | 见《安全自查清单.md》§3.7，三方案待定 |
