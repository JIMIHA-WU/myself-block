# 第 3 周验收表（Day 15–21）

> 验收时间：2026-10-23 19:45
> 证据类型：公网链接（可直接打开）/ 命令输出 / 数据库截图 / 提交记录
> 结论口径：**PASS** = 有可复核证据；**FAIL** = 未达成；**未执行** = 本周未做；**偏离** = 与课程模板不同但已说明

## 一、逐项验收

| # | 验收项 | 证据 | 结果 |
| --- | --- | --- | --- |
| 1 | 健康接口公网可用，返回统一信封 | https://myself-demo-d3gdb1m6x686e940f-1509266644.ap-shanghai.app.tcloudbase.com/api/health → `200 {"ok":true,"service":"myself-block","data":{…}}` | **PASS** |
| 2 | 静态站公网可打开 | https://myself-demo-d3gdb1m6x686e940f-1509266644.tcloudbaseapp.com/client/ → 200 | **PASS** |
| 3 | 数据库两张表 + 种子数据 | SQL 编辑器：`photo_groups` 5 行、`photos` 17 行（10-21 截图；当前含 1 行写入测试，见 #16） | **PASS** |
| 4 | `GET /api/photos` 按契约返回分组结构 | https://…/api/photos → `total:18`，`groups: experience:3 / funny:7 / handsome:7 / screenshots:1` | **PASS** |
| 5 | 单分组过滤 | https://…/api/photos?group=funny → `total:7` | **PASS** |
| 6 | 改库后接口跟着变 | `update photo_groups set name='FUNNY-Y' where id='funny'` → 接口返回 `"name":"FUNNY-Y"`（当前仍是该值，**待恢复**） | **PASS（待恢复）** |
| 7 | 错误形状可读、非裸报错 | https://…/api/photos?group=BAD! → `400 {"ok":false,"error":{"code":"BAD_REQUEST","message":"分组参数不合法"}}` | **PASS** |
| 8 | `POST /api/photos` 真实写入 | 201 + `p_5705fa`，`sort=1`，`added_at=2026-10-22`；数据库可见该行 | **PASS** |
| 9 | 重复提交被拒 | 同 payload 再发 → `409 "这张图已在该分组登记过"` | **PASS** |
| 10 | 缺必填字段被拒且中文 | `{"group_id":"funny"}` → `400 "src 必填：需以 /public/assets/ 开头…"` | **PASS** |
| 11 | 方法限制 | `PUT /api/photos` → `405 "只支持 GET 和 POST 请求"` | **PASS** |
| 12 | 数据访问层拆分 | `server/cloudfunctions/photos-api/db.js`（170 行）；`index.js` 482→327 行；提交 `9cdfe47` | **PASS** |
| 13 | 全接口回归 | 7/7：diag 0.3.0、list 200、group 200、BAD 400、POST 409、POST 400、PUT 405 | **PASS** |
| 14 | 前端接公网接口（非 mock） | https://…/client/check.html → 健康 ● 正常、核心表 `18 张 / 4 组`、`funny / FUNNY-Y` | **PASS** |
| 15 | 跨域白名单（禁 `*`） | 函数 `CORS_ORIGIN` = 静态域 + localhost；实测两种 Origin 各自回显、外来域无 ACAO（health）/ 回首个来源（photos-api） | **PASS** |
| 16 | 写入测试痕迹已清理 | `photos` 仍含 `p_%` 测试行（18 张）；`photo_groups.name` 仍为 `FUNNY-Y` | **FAIL（未清理）** |
| 17 | 首页展示数据库真实数据 | 首页按 PRD 无照片模块；真实数据页为 `/client/photos.html` 与 `/client/check.html` | **偏离（已说明）** |
| 18 | 同伴交叉验证（三行结论） | 待同伴回：可打开 / 可读写 / 无报错 | **未执行** |
| 19 | 演示提纲并完整走通一遍 | 见 `演示提纲-Day21.md` | **PASS（提纲）/ 未演练** |
| 20 | 3 分钟演示视频（余力） | 未录制 | **未执行** |

## 二、遗留问题（如实记录，不在本周修）

| 编号 | 问题 | 风险 | 计划 |
| --- | --- | --- | --- |
| R1 | 写接口无鉴权，公网任何人可 POST | 中 | 下周加管理端 Token 或来源限制 |
| R2 | 调试面仍在线上：`?diag=1`、响应头 `X-Debug-Method/X-Debug-Url` | 低 | 上线前移除 |
| R3 | 静态托管根目录与 `client/` 下各有一份误传的 `api/` 文件 | 低 | 清理控制台冗余文件 |
| R4 | 测试行与 `FUNNY-Y` 未恢复 | 低 | 本周收尾执行两条 SQL（见下） |
| R5 | 照片原图 4 张未入库（`.gitignore` 第 7 节） | 低 | 保持现状（体积与隐私） |
| R6 | 检查台写入按钮对公网开放 | 中 | 与 R1 同批处理 |

## 三、收尾 SQL（执行后 #16 转 PASS）

```sql
delete from photos where id like 'p_%';
update photo_groups set name = 'FUNNY' where id = 'funny';
select (select count(*) from photos) as photos, (select count(*) from photo_groups) as groups;
-- 期望：photos=17, groups=5
```

## 四、同伴交叉验证（把下面这段发给同伴）

> 麻烦帮我验三件事，各回一句就行（不用懂技术）：
> 1. 打开这个链接能不能正常显示照片墙？`https://myself-demo-d3gdb1m6x686e940f-1509266644.tcloudbaseapp.com/client/photos.html`
> 2. 再打开这个检查台，看"核心表真实数据"是否显示 `17 张`（或 18 张）而不是空白/报错？`https://…/client/check.html`
> 3. 页面上有没有出现红色报错或一直转圈？

同伴回复后把三行原话贴回本文件"同伴结论"一节：

```
同伴结论（YYYY-MM-DD）：
1. 可打开：是 / 否
2. 可读写（数据可见）：是 / 否
3. 无报错：是 / 否
补充：
```

## 五、本周复盘（今日要掌握的问题）

**最花时间的一步**：数据通道打通（Day 17–18），累计约 3.5 小时。具体卡在四处：
共享集群不提供 PG 内网/外网直连 → 改平台 REST；API Key 入口藏在「环境管理」；网关「跨域」与函数 CORS 叠加导致响应头双值；网关「路径透传=关」让 POST 的 `req.url` 变成 `/` 导致 405。

**值不值**：值。原因不是"接口能用了"，而是换来了四张可复用清单——① 免费额度下的数据通道选型；② CORS 双层排查法（`curl -H Origin` 对比响应头）；③ 网关路径/方法的坑位；④ 部署文件目录必须与仓库结构一致（否则 404 排查极慢）。后续每加一个接口，预计从"一晚上"降到"30 分钟内"。
