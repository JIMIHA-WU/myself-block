# myself-block · Ja的小屋

一个长期存放照片与文字的个人空间。前端是静态 HTML/CSS/JS，数据在 CloudBase（云函数 + PostgreSQL），图片走静态托管。

> 隐私约定：仓库内不出现真实姓名、住址、学校全名。

---

## 目录结构（只列主干）

```
client/                 前端（首页 / 照片墙 / 记录 / 作品 / 音乐 / 关于 / 检查台）
  api/data.js           全站唯一取数入口
  api/api-client.js     接口客户端（统一信封、中文错误翻译）
server/cloudfunctions/  云函数：photos-api（读写照片）、health（健康检查）
db/                     建表与初始化 SQL
public/assets/photos/   照片产物（WebP，三组）
.workbuddy/skills/      项目级 Skill
```

## 本地打开

双击根目录的 `启动网站.bat`，会起一个本地静态服务并打开浏览器。
（`localhost` 只对本机有意义，不要把这个地址发给别人。）

## 线上地址

- 页面：`https://myself-demo-d3gdb1m6x686e940f-1509266644.tcloudbaseapp.com/client/`
- 接口：`https://myself-demo-d3gdb1m6x686e940f-1509266644.ap-shanghai.app.tcloudbase.com/api/photos`

## 发布前检查（verify-project）

改完 `client/` 或 `server/` 之后、宣布"上线完成"之前，**必须**跑一遍：

```bash
node .workbuddy/skills/verify-project/check.js
```

Windows 下建议用批处理（会自动切 UTF-8，避免中文乱码）：

```bat
.workbuddy\skills\verify-project\run-check.bat
```

常用参数：

| 参数 | 作用 |
| --- | --- |
| `--only=A` | 只跑某一组（A/B/C/D/E 可选），排查时用 |
| `--selftest` | 自检：临时植入假密钥，验证它真的会 FAIL，跑完自动删除 |
| `--no-history` | 跳过 git 全历史扫描，快 2 秒（正式发布前别跳） |
| `--json` | 输出 JSON，便于以后接流水线 |

退出码 `0` = 可以发布；`1` = 有 FAIL，不许发布。

检查项与判定标准见 `.workbuddy/skills/verify-project/SKILL.md`（5 组 20 项），历次运行记录见同目录 `check-run-*.md`。

### 它会拦下什么（真实拦过的）

- 线上云函数版本与代码不一致（忘了部署）
- 静态托管传的还是旧文件（字节数对不上）
- 密钥被写进代码（注入测试已验证：注入后 FAIL，移除后 PASS）
- 超长请求体把云函数打崩（回归锁，防止 439 重演）

## 文档索引

| 文件 | 用途 |
| --- | --- |
| `PRD.md` | 需求与验收标准 |
| `TECH_DESIGN.md` | 技术设计 |
| `api-contract.md` | 接口契约（唯一依据） |
| `安全自查清单.md` | 密钥/裸报错/非法输入/忽略规则的自查方法与命令 |
| `核心流程测试清单.md` | 六步主链路 + 防呆用例，修复前后各跑一遍 |
| `Bug修复-Day24.md` | 超长请求体导致进程退出的完整定位过程 |
| `检验报告-Day23-24.md` | 阶段验收判定（PASS/FAIL/未执行） |

## 已知风险

- 写接口（POST/PATCH/DELETE）**没有鉴权**，知道地址的人都能改数据。方案见 `安全自查清单.md` §3.7，尚未实施。
