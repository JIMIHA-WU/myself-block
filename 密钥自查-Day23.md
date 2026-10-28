# 密钥自查（Day 23 · 2026-10-27）

> 用途：每次上线前照着跑一遍，5 分钟能确认「仓库里没有密钥」。
> 结论先行：**2026-10-27 全量扫描 = 0 处真实密钥**。

---

## 一、扫什么：三层，一层比一层严

| 层 | 扫什么 | 期望 | 为什么这么定 |
| --- | --- | --- | --- |
| **A 层：真实密钥格式** | 见下方正则 | **必须 0 条** | 只要有 1 条，就是已经把密钥 push 上去了 |
| **B 层：凭证文件** | `.env` / `*.key` / `*.pem` / `secrets.json` / `credentials.json` | **必须 0 个被 git 跟踪**；本地文件可以存在 | 文件存在没错，被跟踪才错 |
| **C 层：变量名引用** | `process.env.TCB_API_KEY`、`apikey: API_KEY`、`'Bearer ' + API_KEY` | **允许存在** | 这是"去哪里取值"，不是"值本身" |

**C 层为什么允许**：`apikey` 是平台规定的 HTTP 头名，绕不开；`process.env.XXX` 是取值语法，里面没有值。
真正要防的是「值被写死」，不是「名字被提到」。

---

## 二、A 层扫描：正则与结果

在 VS Code 里打开全局搜索（`Ctrl+Shift+F`），点搜索框右侧的 `.*` 开启正则，粘这一行：

```
AKID[A-Za-z0-9]{10,}|sk-[A-Za-z0-9]{16,}|eyJ[A-Za-z0-9_-]{20,}|postgres(ql)?://|BEGIN [A-Z ]*PRIVATE KEY
```

| 片段 | 抓的是什么 |
| --- | --- |
| `AKID…` | 腾讯云 SecretId 的固定前缀 |
| `sk-…` | OpenAI / 多数大模型厂商的密钥前缀 |
| `eyJ…` | JWT 的固定开头（CloudBase API Key、很多平台的 token 都是这个形状） |
| `postgres` 后面跟 `://` | 数据库连接串（里面通常直接带账号密码）。**注意**：本文档这里故意拆成两段写，如果连在一起写，它会被上面这条规则自己抓到，截图就不是 0 条了 |
| `BEGIN … PRIVATE KEY` | PEM 私钥文件内容 |

**2026-10-27 实测结果：0 results in 46 files。**

> VS Code 的搜索默认遵循 `.gitignore`（设置项 `search.useIgnoreFiles`，默认开），
> 所以 `.env` 不会出现在结果里 —— 这是对的，因为它本来就不该进仓库。
> 如果哪天搜索里冒出了 `.env`，说明这个设置被关了，要去看一眼。

## 三、B 层：`git ls-files` 里有没有凭证文件

```bash
git ls-files | findstr /i ".env .key .pem secret credential"
```

**2026-10-27 实测：无输出（46 个跟踪文件，0 个命中）。**

## 四、`.env` 现状

| 项 | 值 |
| --- | --- |
| 文件位置 | `D:\myself-block\.env` |
| 大小 | 311 B |
| 内容性质 | **假数据**（文件头自己写着"这是测试用的假文件…全是假数据"） |
| 键名 | `DB_HOST` / `DB_USER` / `DB_PASSWORD` / `API_KEY` |
| 是否被 git 跟踪 | **否** |
| 是否被忽略 | **是** → `git check-ignore -v .env` 输出 `.gitignore:8:.env` |
| 是否进过 git 历史 | **否**（`git log --all --full-history -- .env` 无输出） |

**真实凭证在哪**：CloudBase 控制台 → 云函数 `photos-api` → 环境变量
（`TCB_ENV_ID` / `TCB_API_KEY` / `SITE_ORIGIN` / `CORS_ORIGIN`）。
代码只读环境变量，仓库里一个字都没有。

## 五、git 历史也查一遍（这条最容易被忘）

文件现在不在仓库，不代表以前没提交过 —— 提交过就永远留在历史里。

```bash
git log --all --full-history --oneline -- ".env" "*.key" "*.pem" "secrets.json"
git log --all --pretty=format: --name-only | sort -u | findstr /i "env key secret credential"
```

**2026-10-27 实测：两条都无输出。**

## 六、以后加新密钥的标准动作

1. 值只填在 **CloudBase 控制台的环境变量**里（或本地 `.env`，仅调试用）；
2. 代码里只写 `process.env.XXX`；
3. 如果要在文档里举例，用 `你的KEY`、`xxxx` 这种一眼能看出是占位的写法；
4. 加完跑一遍本文件第二节的正则。

## 七、今天的截图怎么拍

一张图要同时证明「搜了」和「是 0 条」：

- 搜索框里能看到**正则原文**；
- 结果区写着 **`0 results in 46 files`**；
- 左侧文件树能看到 `myself-block`（证明搜的是整个仓库）。

---

## 附：本次检查用到的命令与结果

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 磁盘上的凭证文件 | `Get-ChildItem -Recurse -Force -Include .env,*.key,*.pem,...` | 只有 `D:\myself-block\.env`（假数据） |
| git 跟踪的凭证文件 | `git ls-files` 过滤 | 0 个 |
| 忽略规则是否生效 | `git check-ignore -v .env` | `.gitignore:8:.env` |
| 历史提交 | `git log --all --full-history` | 0 次 |
| 硬编码赋值 | 正则 `(api[_-]?key\|secret\|password\|token)\s*[:=]\s*['"]…` | 0 条 |
| 真实密钥格式 | 见第二节 | 0 条 |
