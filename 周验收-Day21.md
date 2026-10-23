# 第 3 周验收表（Day 15–21）

> 生成时间：2026-10-23 19:50 ｜ 口径：每项必须有**可当场复现的验证方法**，结论只用 **PASS / FAIL / 未执行**，不用"基本完成"。
> 公网接口：`https://myself-demo-d3gdb1m6x686e940f-1509266644.ap-shanghai.app.tcloudbase.com`
> 公网站点：`https://myself-demo-d3gdb1m6x686e940f-1509266644.tcloudbaseapp.com/client/`

## A. 数据层脚本（schema / seed）

| 项 | 验证方法 | 证据 | 结论 |
| --- | --- | --- | --- |
| A1 `db/schema.sql` 可独立建表 | 在空库执行全文；或查看建表与约束语句 | 文件 89 行，含 `CREATE TABLE photo_groups`、`CREATE TABLE photos`；三条约束：`photo_groups_name_uniq`、`photos_size_positive CHECK (w>0 AND h>0)`、`photos_group_src_uniq UNIQUE (group_id, src)` | **PASS** |
| A2 `db/seed.sql` 幂等重灌 | 执行 `seed.sql`（两条 INSERT，文件 70 行）→ 查行数 | `photo_groups` 5 行、`photos` 17 行（Day 16 记录；当前接口 `total:18` 含 1 行写入测试，见 A4） | **PASS** |
| A3 唯一约束真的生效 | 对同 `(group_id, src)` 再 `INSERT` 或再 `POST` 一次 | 数据库返回 23505 → 接口映射为 `409 "这张图已在该分组登记过"`（实测） | **PASS** |
| A4 数据当前是干净状态 | `select count(*) from photos;` 与 `select name from photo_groups where id='funny';` | 当前 `19` 行（含 2 行写入测试）、`FUNNY-Y`（改名验证残留） | **FAIL**（收尾 SQL 见文末） |

## B. 公网接口（GET / POST）

| 项 | 验证方法 | 证据 | 结论 |
| --- | --- | --- | --- |
| B1 健康接口 | 浏览器打开 `/api/health` | `200 {"ok":true,"service":"myself-block","data":{"service":"myself-block","status":"ok"}}` | **PASS** |
| B2 读接口总览 | 打开 `/api/photos` | `200`，`total:19`，`groups: experience:3 / funny:7 / handsome:7 / screenshots:2`（同伴独立写入后 +1） | **PASS** |
| B3 单分组过滤 | 打开 `/api/photos?group=funny` | `200`，`total:7` | **PASS** |
| B4 非法分组 | 打开 `/api/photos?group=BAD!` | `400 {"ok":false,"error":{"code":"BAD_REQUEST","message":"分组参数不合法"}}` | **PASS** |
| B5 写入成功 | `POST /api/photos`（可用检查台按钮） | `201`，返回 `p_5705fa`、`sort=1`、`added_at=2026-10-22`；库中可见 | **PASS** |
| B6 重复写入被拒 | 同一 payload 再 `POST` 一次 | `409`，`"这张图已在该分组登记过"`；行数不增（18→18） | **PASS** |
| B7 缺必填字段被拒 | 只发 `{"group_id":"funny"}` | `400`，`"src 必填：需以 /public/assets/ 开头…"` | **PASS** |
| B8 方法限制 | `PUT /api/photos` | `405`，`"只支持 GET 和 POST 请求"` | **PASS** |
| B9 跨域只允自有域、禁 `*` | `curl -H "Origin: <静态域>"` 与 `Origin: <外来域>` 对比响应头 | 静态域 → 回显静态域；localhost → 回显 localhost；外来域 → health 无 ACAO、photos-api 回第一个来源 | **PASS** |
| B10 写接口鉴权 | 用未登录的浏览器/命令行直接 `POST` | 无需任何凭证即可写入 | **FAIL**（已知缺口，下周修） |

## C. 分层重构（Day 19）

| 项 | 验证方法 | 证据 | 结论 |
| --- | --- | --- | --- |
| C1 数据库操作独立成文件 | 查看 `server/cloudfunctions/photos-api/` 文件树与行数 | `db.js` **170 行**，导出 `restFetch / listRows / groupExists / nextSort / insertPhoto`；`index.js` **340 行**（重构前 482） | **PASS** |
| C2 分层真的生效（不只建文件） | 打开 `/api/photos?diag=1` | `version:0.3.0`、`layer:"index.js + db.js"`、`restStatus:200` | **PASS** |
| C3 全接口回归 | 依次跑 B1–B8 | 7/7 通过（Day 19 回归记录） | **PASS** |
| C4 已提交 | `git log --oneline` | `9cdfe47 Day 19｜拆出数据访问层 db.js…` | **PASS** |

## D. 公网检查台

| 项 | 验证方法 | 证据 | 结论 |
| --- | --- | --- | --- |
| D1 可打开 | 打开 `…/client/check.html` | `200`（4,647 字节） | **PASS** |
| D2 展示健康状态 | 看第 1 块 | 显示 `{"ok":true,"service":"myself-block","data":{…}}` | **PASS** |
| D3 展示核心表真实数据 | 看第 2 块 | `19 张 / 4 组`，逐组列出，`funny / FUNNY-Y: 7 张`（同伴写入后 +1） | **PASS** |
| D4 一次写入测试入口 | 点「写一条测试记录」两次 | 第一次 `201 OK`；第二次 `被拒绝（CONFLICT）这张图已在该分组登记过` | **PASS** |
| D5 入口是否受控 | 未登录用户直接访问该页 | 任何人都能点写入 | **FAIL**（与 B10 同源） |

## E. 契约完整性（`api-contract.md`）

| 项 | 验证方法 | 证据 | 结论 |
| --- | --- | --- | --- |
| E1 结构与条目齐全 | 打开文件看目录与章节 | 385 行，含 §0 统一信封与中文错误规则、§1 health、§3 GET、§10 CORS、§11 POST、错误码表与分页约定 | **PASS** |
| E2 实际返回与契约一致 | 现场重跑断言脚本（2026-10-23 19:50，`spot.js`） | **15 项断言 15/15 一致**：顶层键、`ok`、`data{total,groups}`、`group{id,name,photos}`、`photo{id,src,w,h,alt}`、`src` 为 https、`w/h` 正整数、错误 `400`、错误键 `ok,error`、`code` 机器码、`message` 含中文。**注：此前写"18 项"是旧脚本口径，与本次实跑不符，已按实跑修正。** | **PASS**（口径已修正） |
| E3 实现与契约无隐藏偏差 | 检查 health 的顶层 `service` | 契约 §0.1 已注明为"兼容字段"，非偏差 | **PASS** |
| E4 临时调试接口是否登记 | 检索 `diag` | `?diag=1` 未写入契约（临时调试用） | **FAIL**（应移除或登记） |

## F. 同伴交叉验证

| 项 | 验证方法 | 证据 | 结论 |
| --- | --- | --- | --- |
| F1 同伴三行结论 | 同伴用自己设备打开两个公网链接并点一次写入 | 三行均有明确结果：①能打开（照片墙正常、控制台无报错）②能真实读写（写入后 18→19，第二次 409 不再增行）③无红色提示/无转圈/无控制台报错 | **PASS** |

**发给同伴的模板（照抄即可）**

```
帮我验三行，各回一句就行：
1. 能否打开：https://myself-demo-d3gdb1m6x686e940f-1509266644.tcloudbaseapp.com/client/photos.html
2. 能否真实读写：https://myself-demo-d3gdb1m6x686e940f-1509266644.tcloudbaseapp.com/client/check.html
   看"核心表真实数据"显示多少张（不是空白/报错）
3. 有无报错：页面上有没有红色提示或一直转圈
```

回收后把原话贴回本节：

```
同伴结论（2026-10-XX）：
1. 能否打开：是
2. 能否真实读写：是，显示 N 张
3. 有无报错：无
补充：
```

## G. 汇总

| 结论 | 数量 | 条目 |
| --- | --- | --- |
| **PASS** | 19 | A1–A3、B1–B9、C1–C4、D1–D4、E1–E3、F1 |
| **FAIL** | 4 | A4（数据未清理）、B10（写接口无鉴权）、D5（检查台写入开放）、E4（调试接口未登记） |
| **未执行** | 0 | —（同伴验证已回收） |

## 收尾 SQL（执行后 A4 转 PASS）

```sql
delete from photos where id like 'p_%';
update photo_groups set name = 'FUNNY' where id = 'funny';
select (select count(*) from photos) as photos, (select count(*) from photo_groups) as groups;
-- 期望：photos=17，groups=5
```

## 本周复盘

- **同伴验证补充**：对方第二次点写入得到 409，是 `(group_id, src)` 唯一约束生效，不是故障；测试行因此停在 19 行。
- **最花时间**：数据通道打通（Day 17–18，约 3.5 小时）。四处卡点：共享集群不支持 PG 直连；API Key 入口在「环境管理」；网关跨域与函数 CORS 叠加导致响应头双值；网关关闭路径透传后 POST 的 `req.url` 变成 `/` 导致 405。
- **值不值**：值。换来四张可复用清单：通道选型、CORS 双层排查法、网关路径/方法坑位、部署目录必须与仓库一致。后续接口预估 30 分钟内完成。
