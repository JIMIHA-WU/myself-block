# Day 15 部署手册（云函数 health + 前端静态托管）

> 本文件是**操作手册**，不是代码：照顺序在 CloudBase 控制台点完即可。
> 环境 ID、地域、到期时间记得当天记录（Day 15 截图要求）。
> 现状前提：前端是**静态 HTML（PRD 方案 2）**，没有构建步骤——课程里的「构建 React 项目」
> 对本项目等价于「直接上传现有目录」，见 §B。

---

## A. 云函数：GET /api/health

### A1. 新建函数

1. 打开 CloudBase 控制台 → 选中环境（`rover-dev`）；
2. 左侧「云函数」→「新建云函数」；
3. 函数名称：**`health`**（必须叫这个，HTTP 路径与代码注释都按它写）；
4. 运行环境：**Node.js 18**（Nodejs18.15）；地域跟随环境，不用改；
5. 创建。

### A2. 写入代码

1. 进入函数 →「函数代码」页；
2. 用本目录 `index.js` 的**全部内容**覆盖编辑器里的 `index.js`；
3. 点「保存并部署」。（无第三方依赖，不需要 npm install；若控制台提示安装依赖，直接部署即可。）

### A3. 控制台自测（函数层）

1. 函数详情 →「测试」→ 事件模板选「空事件」`{}`；
2. 执行 → 返回体应为：

```json
{"statusCode":200,"headers":{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"},"body":"{\"ok\":true,\"service\":\"myself-block\"}","isBase64Encoded":false}
```

注意 `body` 里是**转义后的 JSON 字符串**——这是正常形态（函数返回的是 HTTP 响应对象，body 需要是字符串）。

### A4. 开 HTTP 访问路径（公网入口）

1. 函数详情 →「触发管理」或「HTTP 访问路径」（不同控制台版本名称略有差异）；
2. 如首次使用，先按提示**开启 HTTP 访问服务**；
3. 新增路径：**`/api/health`**，方法 `GET`（如可选 HEAD 一并勾上）；
4. 保存后控制台会给出公网地址，形如：

```
https://<环境ID>.service.tcloudbase.com/api/health
```

（也可能带平台生成的随机子域，**以控制台显示为准**，记下来。）

### A5. 公网验证（Day 15 验收项）

**浏览器**：地址栏直接打开上面那个 URL →
应看到一行 JSON：

```json
{"ok":true,"service":"myself-block"}
```

再看 DevTools → Network：
- 状态码 `200`；
- `Content-Type: application/json; charset=utf-8`；
- `Cache-Control: no-store`。

**命令行（二选一）**：

```bat
curl -i https://<环境ID>.service.tcloudbase.com/api/health
```

```powershell
Invoke-RestMethod -Uri "https://<环境ID>.service.tcloudbase.com/api/health"
```

**反例验证（证明方法限制生效）**：

```bat
curl -i -X POST https://<环境ID>.service.tcloudbase.com/api/health
```

应返回 `405` + `{"ok":false,"error":{"code":"METHOD_NOT_ALLOWED",...}}`。

### A6. 常见故障对照

| 现象 | 最可能原因 | 处理 |
| --- | --- | --- |
| 访问返回 404 页面 | HTTP 访问路径没建，或路径拼写不是 `/api/health` | 回 A4 核对路径与方法 |
| 502 / 500 | 函数代码报错（粘贴不完整） | 函数「日志」看报错；重贴 index.js 再部署 |
| 405 | 用了 POST/PUT 访问 | 改用 GET（这是设计行为） |
| 首次访问慢（几秒） | 冷启动 | 重试一次即正常，属预期 |
| 返回 HTML 而不是 JSON | 命中了静态托管的兜底页而不是函数 | 核对域名：函数域是 `service.tcloudbase.com`，静态托管是 `tcloudbaseapp.com` |

---

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
3. 方式二：装 `@cloudbase/cli` 后 `tcb hosting deploy ./client -e <环境ID>`（需先在本机登录）；
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
