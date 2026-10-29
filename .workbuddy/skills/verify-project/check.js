#!/usr/bin/env node
'use strict';

/**
 * verify-project —— 发布前检查（myself-block 专用）
 * 用法：node .workbuddy/skills/verify-project/check.js [--only=A] [--selftest] [--no-history] [--json]
 * 退出码：0 = 无 FAIL；1 = 有 FAIL
 *
 * 设计原则：每项检查都必须有「可判定的失败条件」。
 * 不许出现"看起来正常"这种无法验证的描述——那样只会养成虚报通过的习惯。
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../../..');
const API = 'https://myself-demo-d3gdb1m6x686e940f-1509266644.ap-shanghai.app.tcloudbase.com';
const WEB = 'https://myself-demo-d3gdb1m6x686e940f-1509266644.tcloudbaseapp.com';
const ARGS = process.argv.slice(2);
const SKIP_HISTORY = ARGS.includes('--no-history');
const AS_JSON = ARGS.includes('--json');
/* --only=A  只跑某一组（A/B/C/D/E），用于专项排查与演示截图 */
const ONLY = (ARGS.find(function (a) { return a.indexOf('--only=') === 0; }) || '').slice(7).toUpperCase();
/* --selftest：临时植入一个假密钥，验证检查器真的会 FAIL，跑完自动删除。
   目的是让"它不会虚报通过"这件事可以一键复现，而不是靠人记得手工造文件。 */
const SELFTEST = ARGS.includes('--selftest');

/* ---------------- 小工具 ---------------- */

function git(args) {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  return { code: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}

async function http(method, url, body, headers) {
  const init = { method, headers: Object.assign({}, headers || {}) };
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  init.signal = AbortSignal.timeout(12000);
  const res = await fetch(url, init);
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (e) { json = null; }
  return { status: res.status, text, json, headers: res.headers };
}

/* 真实密钥格式：只抓"值"，不抓变量名（变量名是允许的） */
const SECRET_RE = /AKID[A-Za-z0-9]{10,}|sk-[A-Za-z0-9]{16,}|eyJ[A-Za-z0-9_-]{20,}|postgres(ql)?:\/\/|BEGIN [A-Z ]*PRIVATE KEY/;

const SKIP_DIRS = new Set(['.git', 'node_modules', 'tmp', 'dist', 'build', '.cache']);
const SKIP_EXT = new Set(['.webp', '.jpg', '.jpeg', '.png', '.gif', '.ico', '.zip', '.woff', '.woff2', '.ttf', '.mp3', '.mp4', '.pdf', '.lnk']);

function walk(dir, acc) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return acc; }
  for (const en of entries) {
    if (en.isDirectory()) {
      if (SKIP_DIRS.has(en.name)) continue;
      walk(path.join(dir, en.name), acc);
    } else if (en.isFile()) {
      if (SKIP_EXT.has(path.extname(en.name).toLowerCase())) continue;
      const p = path.join(dir, en.name);
      try { if (fs.statSync(p).size > 1024 * 1024) continue; } catch (e) { continue; }
      acc.push(p);
    }
  }
  return acc;
}

/* ---------------- 检查项 ---------------- */

const CHECKS = [];
function check(group, name, fn) { CHECKS.push({ group, name, fn }); }

/* === A 密钥 === */

check('A 密钥', '工作区没有真实密钥格式', async () => {
  const files = walk(ROOT, []);
  const hits = [];
  for (const f of files) {
    let text;
    try { text = fs.readFileSync(f, 'utf8'); } catch (e) { continue; }
    const m = text.match(SECRET_RE);
    /* 只显示前 4 位 + 长度：检查报告本身也不能二次扩散密钥 */
    if (m) hits.push(path.relative(ROOT, f) + ' → ' + m[0].slice(0, 4) + '…（' + m[0].length + ' 字符）');
  }
  return hits.length
    ? { status: 'FAIL', detail: hits.length + ' 处命中：' + hits.slice(0, 3).join('；') }
    : { status: 'PASS', detail: '扫描 ' + files.length + ' 个文本文件，0 处命中' };
});

check('A 密钥', 'git 全历史没有密钥', async () => {
  if (SKIP_HISTORY) return { status: 'SKIP', detail: '--no-history 跳过（正式发布前不建议跳过）' };
  const revs = git(['rev-list', '--all']).out.split('\n').filter(Boolean);
  if (!revs.length) return { status: 'SKIP', detail: '仓库无提交' };
  const r = spawnSync('git', ['grep', '-I', '-E', SECRET_RE.source].concat(revs), {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024
  });
  const out = (r.stdout || '').trim();
  const lines = out ? out.split('\n') : [];
  return lines.length
    ? { status: 'FAIL', detail: lines.length + ' 处命中（含历史提交）：' + lines[0].slice(0, 100) }
    : { status: 'PASS', detail: '遍历 ' + revs.length + ' 个提交，0 处命中' };
});

check('A 密钥', '.env 未被跟踪', async () => {
  const tracked = git(['ls-files']).out.split('\n');
  const bad = tracked.filter(function (f) { return /(^|\/)\.env$/.test(f); });
  const exists = fs.existsSync(path.join(ROOT, '.env'));
  if (bad.length) return { status: 'FAIL', detail: '.env 被跟踪：' + bad.join(', ') };
  const ign = git(['check-ignore', '-v', '.env']);
  return {
    status: ign.code === 0 ? 'PASS' : (exists ? 'FAIL' : 'PASS'),
    detail: exists
      ? '磁盘存在但未跟踪；' + (ign.code === 0 ? '忽略规则生效（' + ign.out.split('\t')[0] + '）' : '⚠ 未被忽略')
      : '磁盘无 .env，且未跟踪'
  };
});

check('A 密钥', '.env.example 已入库', async () => {
  const p = path.join(ROOT, '.env.example');
  if (!fs.existsSync(p)) return { status: 'FAIL', detail: '根目录没有 .env.example' };
  const tracked = git(['ls-files', '--error-unmatch', '.env.example']).code === 0;
  return {
    status: tracked ? 'PASS' : 'FAIL',
    detail: tracked ? '.env.example 存在且被 git 跟踪' : '.env.example 存在但没提交'
  };
});

check('A 密钥', '高危文件已被忽略', async () => {
  const need = ['.env', 'x.key', 'x.pem', 'secrets.json', '.npmrc', '.netrc'];
  const missing = need.filter(function (f) { return git(['check-ignore', f]).code !== 0; });
  return missing.length
    ? { status: 'FAIL', detail: '未被忽略：' + missing.join(', ') }
    : { status: 'PASS', detail: need.length + ' 类高危文件全部命中忽略规则' };
});

/* === B 线上 === */

let diagCache = null;
async function diag() {
  if (diagCache) return diagCache;
  const r = await http('GET', API + '/api/photos?diag=1');
  diagCache = r;
  return r;
}

function codeVersion() {
  const src = fs.readFileSync(path.join(ROOT, 'server/cloudfunctions/photos-api/index.js'), 'utf8');
  const m = /version:\s*'([0-9.]+)'/.exec(src);
  return m ? m[1] : null;
}

check('B 线上', '健康接口可达', async () => {
  const r = await diag();
  return r.status === 200 && r.json && r.json.ok
    ? { status: 'PASS', detail: 'HTTP 200，信封 ok:true' }
    : { status: 'FAIL', detail: 'HTTP ' + r.status + '，' + r.text.slice(0, 80) };
});

check('B 线上', '线上版本 = 代码版本', async () => {
  const r = await diag();
  const v = r.json && r.json.data && r.json.data.version;
  const local = codeVersion();
  if (!local) return { status: 'FAIL', detail: '代码里找不到 version 声明' };
  return v === local
    ? { status: 'PASS', detail: '线上 ' + v + ' = 代码 ' + local }
    : { status: 'FAIL', detail: '线上 ' + v + ' ≠ 代码 ' + local + '（没部署或部署错文件）' };
});

check('B 线上', '数据库连通', async () => {
  const r = await diag();
  const d = (r.json && r.json.data) || {};
  return d.restOk === true
    ? { status: 'PASS', detail: 'restStatus ' + d.restStatus + '，restOk true' }
    : { status: 'FAIL', detail: 'restOk ' + d.restOk + '，hint：' + ((d.restError && d.restError.hint) || '无') };
});

check('B 线上', '核心表有数据', async () => {
  const r = await http('GET', API + '/api/photos');
  const total = r.json && r.json.data && r.json.data.total;
  return typeof total === 'number' && total > 0
    ? { status: 'PASS', detail: 'total = ' + total }
    : { status: 'FAIL', detail: 'total = ' + total + '（0 或取不到）' };
});

/* === C 错误契约 === */

check('C 错误契约', '参数错返回中文 400', async () => {
  const r = await http('GET', API + '/api/photos?limit=999');
  const msg = (r.json && r.json.error && r.json.error.message) || '';
  const ok = r.status === 400 && /你传的是/.test(msg) && /[\u4e00-\u9fa5]/.test(msg);
  return ok ? { status: 'PASS', detail: msg } : { status: 'FAIL', detail: 'HTTP ' + r.status + ' ' + (msg || r.text.slice(0, 60)) };
});

check('C 错误契约', '找不到返回中文 404', async () => {
  const r = await http('PATCH', API + '/api/photos/p_nope', { alt: 'x' });
  const msg = (r.json && r.json.error && r.json.error.message) || '';
  const ok = r.status === 404 && /不存在/.test(msg);
  return ok ? { status: 'PASS', detail: msg } : { status: 'FAIL', detail: 'HTTP ' + r.status + ' ' + (msg || r.text.slice(0, 60)) };
});

check('C 错误契约', '错方法返回中文 405', async () => {
  const r = await http('PUT', API + '/api/photos', {});
  const msg = (r.json && r.json.error && r.json.error.message) || '';
  const ok = r.status === 405 && /不支持/.test(msg);
  return ok ? { status: 'PASS', detail: msg } : { status: 'FAIL', detail: 'HTTP ' + r.status + ' ' + (msg || r.text.slice(0, 60)) };
});

check('C 错误契约', '超长请求体不再崩溃', async () => {
  const big = JSON.stringify({
    group_id: 'screenshots',
    src: '/public/assets/photos/Test/checkboard.webp',
    w: 800, h: 600,
    alt: 'x'.repeat(8600)
  });
  const r = await http('POST', API + '/api/photos', big);
  const msg = (r.json && r.json.error && r.json.error.message) || '';
  const ok = r.status === 400 && /请求体/.test(msg);
  return ok
    ? { status: 'PASS', detail: 'HTTP 400（修复前是 439 进程退出）' }
    : { status: 'FAIL', detail: 'HTTP ' + r.status + '（期望 400）' + (msg ? ' ' + msg.slice(0, 60) : '') };
});

check('C 错误契约', '前端错误翻译已上线', async () => {
  const r = await http('GET', WEB + '/client/api/api-client.js');
  const ok = r.status === 200 && /连不上服务器/.test(r.text);
  return ok
    ? { status: 'PASS', detail: '线上 api-client.js 含「连不上服务器」' }
    : { status: 'FAIL', detail: '线上 api-client.js 是旧版（' + r.text.length + ' B），未含中文兜底' };
});

/* 2026-10-29 覆盖度检测补：Day 21 验收里有这三条，之前没进检查项 */

check('C 错误契约', '重复写入返回 409（防重复）', async () => {
  const src = '/public/assets/photos/Test/__verify_dup.webp';
  /* 先清掉上一次可能残留的同 src 记录，否则首写就 409，检查会失真 */
  const pre = await http('GET', API + '/api/photos?group=screenshots');
  const groups = (pre.json && pre.json.data && pre.json.data.groups) || [];
  for (const g of groups) {
    for (const p of (g.photos || [])) {
      if (p.src && p.src.indexOf('__verify_dup.webp') >= 0) {
        await http('DELETE', API + '/api/photos/' + encodeURIComponent(p.id));
      }
    }
  }

  const body = { group_id: 'screenshots', src: src, w: 1, h: 1, alt: '重复检查' };
  const first = await http('POST', API + '/api/photos', body);
  const madeId = first.json && first.json.data && first.json.data.photo && first.json.data.photo.id;
  const second = await http('POST', API + '/api/photos', body);
  /* 无论结果如何都要清理，别给线上留垃圾 */
  if (madeId) await http('DELETE', API + '/api/photos/' + encodeURIComponent(madeId));
  const msg = (second.json && second.json.error && second.json.error.message) || '';
  if (second.status === 409 && /登记过/.test(msg)) {
    return { status: 'PASS', detail: '第二次写入被拒：' + msg + '（测试记录已删除）' };
  }
  return {
    status: 'FAIL',
    detail: '第二次返回 ' + second.status + (madeId ? '（测试记录 ' + madeId + ' 已清理）' : '（首次写入就没成功，检查可能失真）')
  };
});

check('C 错误契约', '删除不存在的记录返回 404', async () => {
  const r = await http('DELETE', API + '/api/photos/p_nope');
  const msg = (r.json && r.json.error && r.json.error.message) || '';
  const ok = r.status === 404 && /不存在/.test(msg) && !/删除成功/.test(msg);
  return ok
    ? { status: 'PASS', detail: '不会假成功：' + msg }
    : { status: 'FAIL', detail: 'HTTP ' + r.status + ' ' + (msg || r.text.slice(0, 60)) };
});

/* Day 24 余力修复项：GET 没有实现"按 id 取单张"，必须 404，不能静默返回整份列表 */
check('C 错误契约', '按 id 取单张返回 404', async () => {
  const r = await http('GET', API + '/api/photos/p_nope');
  const msg = (r.json && r.json.error && r.json.error.message) || '';
  if (r.status === 404 && /不存在/.test(msg)) {
    return { status: 'PASS', detail: msg };
  }
  if (r.status === 200) {
    return { status: 'FAIL', detail: '返回 200 且可能是整份列表（调用方会误以为拿到了单张）' };
  }
  return { status: 'FAIL', detail: 'HTTP ' + r.status + ' ' + (msg || r.text.slice(0, 60)) };
});

check('C 错误契约', '跨域响应头只有一个来源', async () => {
  /* 曾经踩过：网关和函数各写一次 ACAO，浏览器收到 "A,A" 直接拒收 */
  const res = await fetch(API + '/api/photos', {
    method: 'OPTIONS',
    headers: { Origin: WEB, 'Access-Control-Request-Method': 'POST' },
    signal: AbortSignal.timeout(12000)
  });
  const acao = res.headers.get('access-control-allow-origin') || '';
  const parts = acao.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  if (res.status !== 204 && res.status !== 200) {
    return { status: 'FAIL', detail: '预检返回 HTTP ' + res.status + '（期望 204）' };
  }
  if (parts.length !== 1) {
    return { status: 'FAIL', detail: '出现 ' + parts.length + ' 个 Access-Control-Allow-Origin：' + acao + '（浏览器会拒收）' };
  }
  return parts[0] === WEB
    ? { status: 'PASS', detail: '单一来源，且等于站点域' }
    : { status: 'FAIL', detail: '回显的是 ' + parts[0] + '，期望 ' + WEB };
});

/* === D 静态新鲜度 === */

const STATIC_FILES = [
  ['client/index.html', '/client/index.html'],
  ['client/app.js', '/client/app.js'],
  ['client/styles.css', '/client/styles.css'],
  ['client/check.html', '/client/check.html'],
  ['client/api/api-client.js', '/client/api/api-client.js'],
  ['client/api/aero-shards.js', '/client/api/aero-shards.js']
];

check('D 静态新鲜度', '前端文件与本地一致', async () => {
  const rows = [];
  for (const [rel, url] of STATIC_FILES) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) { rows.push(rel + ' 本地缺失'); continue; }
    const local = fs.statSync(p).size;
    let remote = -1;
    try {
      const r = await http('HEAD', WEB + url);
      remote = Number(r.headers.get('content-length'));
    } catch (e) { remote = -1; }
    if (remote !== local) rows.push(path.basename(rel) + ' 本地 ' + local + ' / 线上 ' + (remote < 0 ? '?' : remote));
  }
  return rows.length
    ? { status: 'FAIL', detail: rows.join('；') }
    : { status: 'PASS', detail: STATIC_FILES.length + ' 个文件字节数全部一致' };
});

/* === E 仓库 === */

check('E 仓库', '工作区干净且已推送', async () => {
  const dirty = git(['status', '--porcelain']).out;
  const sb = git(['status', '-sb']).out.split('\n')[0] || '';
  const ahead = /ahead (\d+)/.exec(sb);
  const notes = [];
  if (dirty) notes.push('有未提交改动：' + dirty.split('\n').length + ' 个文件');
  if (ahead) notes.push('有 ' + ahead[1] + ' 个提交未推送');
  return notes.length
    ? { status: 'WARN', detail: notes.join('；') }
    : { status: 'PASS', detail: '工作区干净，与远程一致' };
});

/* ---------------- 执行与输出 ---------------- */

(async function main() {
  /* 自检模式：先植入假密钥（故意弄坏），确保 A 组会报 FAIL，最后无论成败都删除 */
  let planted = null;
  if (SELFTEST) {
    planted = path.join(ROOT, '__selftest-leak.tmp.js');
    fs.writeFileSync(planted, "// 自检临时文件，跑完自动删除\nconst K = 'sk-" + 'a'.repeat(20) + "';\n", 'utf8');
  }

  const results = [];
  let exitCode = 0;
  const scope = SELFTEST ? 'A' : ONLY;
  const list = scope ? CHECKS.filter(function (c) { return c.group.charAt(0) === scope; }) : CHECKS;
  try {
  for (const c of list) {
    let r;
    try {
      r = await c.fn();
    } catch (e) {
      r = { status: 'FAIL', detail: '检查本身抛错：' + (e && e.message ? e.message : String(e)) };
    }
    results.push({ group: c.group, name: c.name, status: r.status, detail: r.detail });
  }

  if (AS_JSON) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log('');
    console.log('  发布前检查 · myself-block');
    console.log('  ' + new Date().toLocaleString('zh-CN'));
    if (SELFTEST) console.log('  （自检模式：已临时植入一个假密钥，跑完自动删除）');
    console.log('  ' + '-'.repeat(64));
    let lastGroup = '';
    for (const r of results) {
      if (r.group !== lastGroup) { console.log('\n  [' + r.group + ']'); lastGroup = r.group; }
      const tag = r.status === 'PASS' ? '✓ PASS' : (r.status === 'WARN' ? '! WARN' : (r.status === 'SKIP' ? '- SKIP' : '✗ FAIL'));
      console.log('  ' + tag.padEnd(7) + ' ' + r.name);
      if (r.detail) console.log('          ' + r.detail);
    }
    const fail = results.filter(function (r) { return r.status === 'FAIL'; }).length;
    const warn = results.filter(function (r) { return r.status === 'WARN'; }).length;
    const pass = results.filter(function (r) { return r.status === 'PASS'; }).length;
    console.log('\n  ' + '-'.repeat(64));
    console.log('  合计 ' + results.length + ' 项：PASS ' + pass + ' / WARN ' + warn + ' / FAIL ' + fail);
    console.log(fail ? '  结论：不许发布，先修 FAIL 项。' : (warn ? '  结论：可以发布，但 WARN 要写进当天记录。' : '  结论：可以发布。'));
    console.log('');
  }

  exitCode = results.some(function (r) { return r.status === 'FAIL'; }) ? 1 : 0;
  } finally {
    /* 无论检查成功、抛错还是被 Ctrl+C，都不把假密钥留在仓库里 */
    if (planted) { try { fs.unlinkSync(planted); } catch (e) { /* 已删除 */ } }
  }
  process.exit(exitCode);
})();
