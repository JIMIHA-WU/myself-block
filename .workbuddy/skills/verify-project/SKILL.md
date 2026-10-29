---
name: verify-project
description: 发布前检查（myself-block 专用）。当用户说"运行 verify-project""发布前检查""上线前自检""这个项目现在能不能发布"时使用。会检查密钥泄漏、线上版本与代码是否一致、三类错误是否中文、静态文件是否最新、仓库是否已推送，任一项 FAIL 就不许宣布"发布完成"。
---

# verify-project · 发布前检查

这个文件是**自足的**：即使你不知道项目背景、也没读过任何历史对话，照着本文就能跑完并判断结果。

## 0. 前置条件（缺一不可）

| 条件 | 怎么确认 |
| --- | --- |
| 仓库在 `D:\myself-block`（Windows） | `Test-Path D:\myself-block\.workbuddy\skills\verify-project\check.js` |
| Node.js ≥ 18（脚本用了全局 `fetch`） | `node --version` |
| 能访问外网（要打公网接口） | 浏览器能打开 `https://myself-demo-d3gdb1m6x686e940f-1509266644.tcloudbaseapp.com/client/` |
| git 已初始化（要做全历史扫描） | `git -C D:\myself-block rev-parse --is-inside-work-tree` |

任一条不满足，脚本会给出 FAIL 或 SKIP 并说明原因——**不要跳过，记下来**。

## 1. 怎么跑

Windows 推荐（自动切 UTF-8，避免 CMD 里中文乱码）：

```bat
D:\myself-block\.workbuddy\skills\verify-project\run-check.bat
```

任何平台：

```bash
node D:/myself-block/.workbuddy/skills/verify-project/check.js
```

参数：

| 参数 | 作用 |
| --- | --- |
| `--only=A` | 只跑某一组（A/B/C/D/E） |
| `--selftest` | **自检**：临时植入假密钥 → 只跑 A 组 → 必须 FAIL → 自动删除。用来验证"它不是永远 PASS" |
| `--no-history` | 跳过 git 全历史扫描（快 2 秒，正式发布前别跳） |
| `--json` | 输出机器可读结果 |

退出码：`0` = 可以发布（可能有 WARN）；`1` = 有 FAIL，**不许发布**。

## 2. 输出长什么样（示例，来自 2026-10-29 实跑）

```
  发布前检查 · myself-block
  2026/10/29 09:34:12
  ----------------------------------------------------------------

  [A 密钥]
  ✓ PASS  工作区没有真实密钥格式
          扫描 57 个文本文件，0 处命中
  ...
  [C 错误契约]
  ✗ FAIL  前端错误翻译已上线
          线上 api-client.js 是旧版（1704 B），未含中文兜底
  ...

  合计 20 项：PASS 17 / WARN 1 / FAIL 2
  结论：不许发布，先修 FAIL 项。
```

看到 `结论：不许发布` 就是有 FAIL，此时**不允许**口头解释成"应该没事"。

## 3. 全部检查项（5 组 20 项）

### A 密钥（5 项，红线）

| 项 | 怎么算通过 | 不通过意味着 |
| --- | --- | --- |
| 工作区没有真实密钥格式 | `AKID…`/`sk-…`/`eyJ…`/数据库连接串/PEM 私钥头，**0 处命中** | 有人把密钥写进了代码 |
| git 全历史没有密钥 | 遍历所有提交，0 处命中 | 密钥已被 push 过，必须作废重发（见《安全自查清单》§1.7） |
| `.env` 未被跟踪 | `git ls-files` 里没有 `.env` | 密钥文件会进仓库 |
| `.env.example` 已入库 | 文件存在 **且** 被 git 跟踪 | 接手者不知道该配哪些变量 |
| 高危文件已被忽略 | `.env`/`*.key`/`*.pem`/`secrets.json`/`.npmrc`/`.netrc` 全部命中 ignore | 将来的凭证文件会裸奔 |

### B 线上（4 项）

| 项 | 怎么算通过 |
| --- | --- |
| 健康接口可达 | `GET /api/photos?diag=1` 返回 200 且 `ok:true` |
| **线上版本 = 代码版本** | `diag.data.version` 与 `server/cloudfunctions/photos-api/index.js` 里的 `version:` 完全一致；不一致 = 忘了部署 |
| 数据库连通 | `diag.data.restOk === true` |
| 核心表有数据 | `GET /api/photos` 的 `total > 0` |

### C 错误契约（9 项，全部要求中文、可判定）

| 项 | 怎么算通过 |
| --- | --- |
| 参数错返回中文 400 | `?limit=999` → 400，且 message 含「你传的是」 |
| 找不到返回中文 404 | `PATCH /api/photos/p_nope` → 404，含「不存在」 |
| 错方法返回中文 405 | `PUT /api/photos` → 405，含「不支持」 |
| 超长请求体不再崩溃 | 8702 B body → **400**，不是 439（2026-10-28 修复前的表现见《Bug修复-Day24.md》） |
| 前端错误翻译已上线 | 线上 `api-client.js` 含「连不上服务器」 |
| 重复写入返回 409 | 同一条写两次，第二次 409 且含「登记过」；**检查会自己清理测试记录** |
| 删除不存在的记录返回 404 | `DELETE /api/photos/p_nope` → 404，且不能是"删除成功" |
| 按 id 取单张返回 404 | `GET /api/photos/p_nope` → 404，不能静默返回整份列表 |
| 跨域响应头只有一个来源 | 预检 204，且 `Access-Control-Allow-Origin` 只有 1 个值、等于站点域（曾出现 `A,A` 被浏览器拒收） |

### D 静态新鲜度（1 项，覆盖 6 个文件）

| 项 | 怎么算通过 |
| --- | --- |
| 前端文件与本地一致 | 6 个文件的线上 `Content-Length` 与本地字节数逐一相等：`index.html`、`app.js`、`styles.css`、`check.html`、`api/api-client.js`、`api/aero-shards.js`。任何一处不等 = 线上是旧版（或该路径返回 404 页面） |

### E 仓库（1 项）

| 项 | 怎么算通过 |
| --- | --- |
| 工作区干净且已推送 | `git status --porcelain` 为空，且没有 `ahead N`。有则 **WARN**（不阻断，但要写进当天记录） |

## 4. 判定规则

| 结论 | 含义 | 允许的动作 |
| --- | --- | --- |
| **FAIL** | 阻断发布 | 不许用"下次再说""影响不大"绕过；修完必须重跑 |
| **WARN** | 可以发布 | 必须写进当天的发布记录（例如"有 1 个提交未推送"） |
| **SKIP** | 环境不具备 | 必须写明为什么跳过，不能默默当成通过 |

## 5. 怎么加新检查

在 `check.js` 里用 `check(组, 名称, async () => ({status, detail}))` 追加一项。
硬性要求：

1. 必须是**可判定的失败条件**（能给出一条 curl / git 命令复现的），不许写"看起来正常"；
2. 失败时 `detail` 要写清**具体差异**（例如"本地 9176 / 线上 8177"），不能只说"不一致"；
3. 会写数据的检查（如 409 那条）必须自己清理，跑完不留垃圾。

## 6. 自检（防止这个 Skill 虚报通过）

```bash
node D:/myself-block/.workbuddy/skills/verify-project/check.js --selftest
```

预期：A 组出现 `✗ FAIL 工作区没有真实密钥格式`，退出码 1；随后临时文件被自动删除。
再跑一次不带 `--selftest`，应恢复 `✓ PASS`。两次结果不同，才说明检查真的在读文件。

> 实测记录（2026-10-29）：`--selftest` → `1 处命中：__selftest-leak.tmp.js → sk-a…（23 字符）`，退出码 1；无参重跑 → `0 处命中`，退出码 0。

## 7. 历史

| 日期 | 变更 |
| --- | --- |
| 2026-10-29 | 建立，5 组 16 项；后按"覆盖度检测"补 409、DELETE 404、跨域单值、按 id 取单张，扩到 20 项 |
| 2026-10-29 | 增加 `--selftest`；报告只显示密钥前 4 位，避免二次扩散 |
