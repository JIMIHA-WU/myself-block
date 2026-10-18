# Day 15 部署手册（云函数 health + 前端静态托管）

> 本文件是**操作手册**，不是代码：照顺序在 CloudBase 控制台点完即可。
> 环境 ID、地域、到期时间记得当天记录（Day 15 截图要求）。
> 现状前提：前端是**静态 HTML（PRD 方案 2）**，没有构建步骤——课程里的「构建 React 项目」
> 对本项目等价于「直接上传现有目录」，见 §B。

---

## 0. 环境速查（2026-10-17 开通，Day 15 记录）

| 项 | 值 |
| --- | --- |
| 环境名称 | `myself-demo` |
| **环境 ID** | `myself-demo-d3gdb1m6x686e940f` |
| 所属地域 | 上海 |
| 套餐 | 体验版（免费） |
| 到期时间 | **2027-04-17 23:59:59**（不支持自动续费；到期前 1 个月内可续 6 个月） |
| 资源点额度 | **0.11 / 3000 点**（2026-10-18 截图时） |
| 云函数 HTTP 域 | `https://myself-demo-d3gdb1m6x686e940f-1509266644.ap-shanghai.app.tcloudbase.com`（HTTP 网关默认域名，测试域名） |
| **health 公网地址** | `https://myself-demo-d3gdb1m6x686e940f-1509266644.ap-shanghai.app.tcloudbase.com/api/health` ✅ 2026-10-18 验证 200 |
| 路由配置 | HTTP 网关 → 路由管理：`/api/health` → 云函数 `health`；**路径透传=关**、身份认证=关、跨域=开 |
| 静态托管域 | 以控制台「静态网站托管 → 默认域名」为准（形如 `https://<默认域名>/client/`） |

---

## A. 云函数：GET /api/health

> 两种控制台模型，二选一（**返回契约完全一致**，见 `api-contract.md` §1）：
> - **新版（当前界面）**：HTTP 云函数（Web 服务模式）→ 走 A1–A4，代码用 `index.js`；
> - 旧版：事件函数 + HTTP 访问路径 → 走 A5，代码用 `handler.js`。

### A1. 新建（新版：通过模板创建）

1. 控制台 → 左侧「云函数」→「创建云函数」；
2. 页面进入「通过模板创建」；右侧模板列表选：
   **HTTP 云函数 → Hello World（HTTP Node.js Hello World）**
   （不要选 Python / Go / PHP / Java，也不必选 Express / Django 框架模板——多引依赖，没必要）；
3. 底部「函数名称」改为 **`health`**；环境与地域不用改；
4. 点「创建」，等 1–2 分钟初始化完成。

### A2. 替换代码

1. 进入函数 →「函数代码」；
2. 打开本机 `server/cloudfunctions/health/index.js`，全选复制，覆盖编辑器里的 `index.js`；
3. 打开 `scf_bootstrap`，确认内容为两行（模板默认即如此）：

```bash
#!/bin/bash
node index.js
```

4. 点「保存并部署」，等状态变为「部署完成」。

### A3. 拿到公网地址并验证（Day 15 验收项）

1. 函数详情页找「访问地址 / 公网地址 / 函数 URL」（新版控制台在概览或"访问"卡片）；
2. 形如 `https://<环境ID>.service.tcloudbase.com`（有的环境带随机子域，以页面为准）；
3. 浏览器打开 `地址 + /api/health`，应看到：

```json
{"ok":true,"service":"myself-block"}
```

4. 再验三点：
   - DevTools → Network：`200`、`Content-Type: application/json; charset=utf-8`；
   - 打开域名根 `/` 也返回同一 JSON（一眼确认服务活着）；
   - 反例：`curl -i -X POST https://.../api/health` 应 `405` + `METHOD_NOT_ALLOWED`。

### A4. 失败排查

| 现象 | 最可能原因 | 处理 |
| --- | --- | --- |
| 404 | 路径不是 `/api/health`；或函数没起来 | 核对路径；看日志 |
| 502 / 500 | 代码没贴全 / `scf_bootstrap` 缺失 / 端口不对 | 看函数「日志」；确认 index.js 全文 + scf_bootstrap 两行 |
| 405 | 用了 POST/PUT 访问 | 改 GET（设计行为） |
| 首次访问慢（几秒） | 冷启动 | 重试一次，属预期 |
| 返回 HTML 而非 JSON | 命中了静态托管兜底页 | 核对域名：函数域是 `service.tcloudbase.com` |

### A5. 旧版控制台（事件函数）备选

若界面没有「HTTP 云函数」模板，而是「事件函数」：
1. 新建函数 `health`（Node.js 18）；
2. 用 **`handler.js`**（`exports.main` 形态）覆盖 `index.js`；
3. 「HTTP 访问路径 / 触发管理」新增路径 `/api/health`，方法 GET；
4. 公网验证同 A3。

## B. 前端：静态托管（上传现有页面）

### B0. 先纠正一个概念

课程写的是「构建第 2 周的 React 项目」。本项目第 2 周的前端是**纯静态 HTML + 原生 JS**（PRD 方案 2，无打包步骤）——所以**没有 `npm run build`**，上传的就是现有目录本身。这一天要验证的链路（公网 → 静态托管 → 页面能开）与框架无关。

### B1. 上传前必须凑齐的三样（少一样页面就残）

| 上传内容 | 为什么 |
| --- | --- |
| `client/` 整个目录 | 全部页面、`app.js`、`styles.css`、`api/data.js` |
| `public/` 整个目录 | 照片 WebP、封面、作品图、音频（页面用 `../public/assets/...` 相对引用） |
| 根目录的 `logo.webp` | 首页 TechText 用 `/logo.webp` **绝对路径**引用 |

> 保持目录层级不变（`client/` 与 `public/` 同级放在托管根下）。

### B2. 上传

1. 控制台 →「静态网站托管」→ 开通（免费额度内）；
2. 方式一（最稳）：网页上传，按 B1 的结构把文件夹整包拖进去；
3. 方式二：装 `@cloudbase/cli` 后 `tcb hosting deploy ./client -e myself-demo-d3gdb1m6x686e940f`（需先在本机登录）；
   注意 CLI 单次只能传一个目录，`public/` 与 `logo.webp` 要分别再传一次。
4. 若控制台支持「默认首页」设置，指向 `client/index.html`；否则直接访问带路径的地址。

### B3. 公网地址

```
https://<环境ID>.tcloudbaseapp.com/client/
```

（以控制台「静态网站托管 → 默认域名」为准。）

### B4. 验证（Day 15 验收项）

1. **电脑浏览器**先开一遍：黑底光坠 + `Welcome To` 文字动画 → 底栏点「照片墙 / 记录」能切页；
2. **手机用蜂窝网络**（不连家里 Wi-Fi）打开同一地址——这是"公网"的真正证明；
3. 逐项检查：
   - 首页动画正常（不是白屏）→ JS 与 `/logo.webp` 都传对了；
   - 照片墙 17 张能显示 → `public/assets/photos/**` 层级正确；
   - 记录页第一条是「布什各门，这是什么情况」且封面显示 → `public/assets/covers/**` 正确；
   - 刷新一次无 404 → 缓存戳（`?v=`）指向的文件齐全。

### B5. 今日边界（不要顺手做）

- **不接接口**：页面仍读 `data.js` 的 mock 数据，公网版与本地版一致；
- **不配跨域**：静态托管域与函数域不同源，等 Day 16 接接口时在函数响应头加 `Access-Control-Allow-Origin`；
- 不改页面结构、不新增业务功能。

---

## C. 收尾检查清单（Day 15）

- [ ] `/api/health` 公网 200，返回 `{"ok":true,"service":"myself-block"}`
- [ ] POST 返回 405（证明方法限制生效）
- [ ] 前端公网页面在**手机蜂窝网络**能打开
- [ ] `api-contract.md` 已入库（本日另交付）
- [ ] 三张截图：① 函数公网 JSON（含地址栏）② 前端公网页面 ③ 控制台环境信息（环境 ID / 剩余额度 / 到期日期）
- [ ] 记录：环境 ID、地域、到期时间、剩余额度
