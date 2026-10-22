'use strict';

/**
 * CloudBase 云函数：photos-api —— 【HTTP 云函数版 / Web 服务模式】
 * ------------------------------------------------------------------
 * 数据通道（2026-10-22 改）：**CloudBase 平台 REST（PostgREST）**，不再直连 PG。
 *   原因：体验版共享集群不提供内网/外网直连（升级独享集群才给），
 *   而平台网关通道本身即可访问同环境数据库，无需数据库地址与密码。
 *
 * 端点：https://<环境ID>.api.tcloudbasegateway.com/v1/rdb/rest/<表>
 * 认证：Authorization: Bearer <API Key>（service_role；只配在云函数环境变量里）
 *
 * 契约：
 *   GET  /api/photos  → api-contract.md §3（Day 17）
 *   POST /api/photos  → api-contract.md §11（Day 18）
 *
 * 环境变量：
 *   TCB_ENV_ID   环境 ID（如 myself-demo-d3gdb1m6x686e940f）
 *   TCB_API_KEY  控制台「API Key」（service_role，切勿放前端）
 *   SITE_ORIGIN  静态托管域名（拼完整图片 URL 用）
 *   CORS_ORIGIN  可选，默认 *
 *
 * 安全：
 *   · 只读 + 单条 INSERT；不做 UPDATE/DELETE；
 *   · 所有查询走参数化查询串（PostgREST 的 eq 过滤），无 SQL 拼接；
 *   · POST 暂未鉴权（契约 §11 已注明，上线前必须加保护）。
 */

const http = require('node:http');
const crypto = require('node:crypto');

const PORT = process.env.PORT || 9000;
const ENV_ID = String(process.env.TCB_ENV_ID || '').trim();
const API_KEY = String(process.env.TCB_API_KEY || '').trim();
const SITE_ORIGIN = String(process.env.SITE_ORIGIN || '').replace(/\/+$/, '');
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const BODY_LIMIT = 8 * 1024;
const REST_TIMEOUT_MS = 8000;

/* ---------------- 平台 REST 客户端 ---------------- */
function restUrl(path) {
  return 'https://' + ENV_ID + '.api.tcloudbasegateway.com/v1/rdb/rest/' + path;
}

async function restFetch(path, init) {
  if (!ENV_ID || !API_KEY) {
    const err = new Error('missing TCB_ENV_ID or TCB_API_KEY');
    err.code = 'NO_CREDENTIALS';
    throw err;
  }
  const res = await fetch(restUrl(path), Object.assign({}, init, {
    headers: Object.assign(
      {
        apikey: API_KEY,
        Authorization: 'Bearer ' + API_KEY,
        'Content-Type': 'application/json'
      },
      (init && init.headers) || {}
    ),
    signal: AbortSignal.timeout(REST_TIMEOUT_MS)
  }));
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch (e) { body = null; }
  return { status: res.status, body: body, text: text };
}

/* ---------------- GET：组装响应（纯函数，便于本地测试） ---------------- */
function buildPayload(rows, options) {
  const limit = options && options.limit ? options.limit : 0;

  const groups = [];
  const index = {};
  let total = 0;

  rows.forEach(function (r) {
    if (!index[r.group_id]) {
      index[r.group_id] = { id: r.group_id, name: r.name, photos: [] };
      groups.push(index[r.group_id]);
    }
    if (limit > 0 && index[r.group_id].photos.length >= limit) return;
    index[r.group_id].photos.push({
      id: r.id,
      src: (SITE_ORIGIN ? SITE_ORIGIN : '') + r.src,
      w: r.w,
      h: r.h,
      alt: r.alt
    });
    total++;
  });

  return {
    total: total,
    groups: groups.filter(function (g) { return g.photos.length > 0; })
  };
}

/* ---------------- POST：参数校验（纯函数，便于本地测试） ---------------- */
function toInt(value) {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return Number(value);
  return NaN;
}

function validatePhotoInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { error: '请求体必须是 JSON 对象' };
  }

  const group = input.group_id;
  if (typeof group !== 'string' || !/^[a-z0-9_-]{1,32}$/.test(group)) {
    return { error: 'group_id 必填：只允许小写字母、数字、下划线、连字符（1–32 位）' };
  }

  const src = input.src;
  if (
    typeof src !== 'string' ||
    src.length > 300 ||
    src.indexOf('/public/assets/') !== 0 ||
    !/\.(webp|jpe?g|png)$/i.test(src)
  ) {
    return { error: 'src 必填：需以 /public/assets/ 开头，并以 .webp/.jpg/.jpeg/.png 结尾（不超过 300 字符）' };
  }

  const w = toInt(input.w);
  if (!(w >= 1 && w <= 100000)) return { error: 'w 必填：1–100000 的整数' };

  const h = toInt(input.h);
  if (!(h >= 1 && h <= 100000)) return { error: 'h 必填：1–100000 的整数' };

  let alt = '';
  if (input.alt !== undefined && input.alt !== null) {
    if (typeof input.alt !== 'string' || input.alt.length > 200) {
      return { error: 'alt 必须是不超过 200 字的字符串' };
    }
    alt = input.alt;
  }

  let sort = null;
  if (input.sort !== undefined && input.sort !== null) {
    const s = toInt(input.sort);
    if (!(s >= 1 && s <= 32767)) return { error: 'sort 必须是 1–32767 的整数' };
    sort = s;
  }

  let addedAt = null;
  if (input.added_at !== undefined && input.added_at !== null) {
    if (typeof input.added_at !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.added_at)) {
      return { error: 'added_at 必须是 YYYY-MM-DD 格式' };
    }
    addedAt = input.added_at;
  }

  let id = null;
  if (input.id !== undefined && input.id !== null) {
    if (typeof input.id !== 'string' || !/^[a-z0-9_-]{1,16}$/.test(input.id)) {
      return { error: 'id 只允许小写字母、数字、下划线、连字符（1–16 位）' };
    }
    id = input.id;
  }

  return {
    value: { id: id, group_id: group, src: src, w: w, h: h, alt: alt, sort: sort, added_at: addedAt }
  };
}

/* ---------------- HTTP 工具 ---------------- */
function sendJson(res, status, body, method) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': CORS_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(method === 'HEAD' ? undefined : text);
}

function fail(res, status, code, message, method) {
  sendJson(res, status, { ok: false, error: { code: code, message: message } }, method);
}

function normalizePath(url) {
  const raw = String(url || '/').split('?')[0];
  const trimmed = raw.replace(/\/+$/, '');
  return trimmed || '/';
}

function readBody(req) {
  return new Promise(function (resolve, reject) {
    let size = 0;
    const chunks = [];
    req.on('data', function (chunk) {
      size += chunk.length;
      if (size > BODY_LIMIT) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', function () { resolve(Buffer.concat(chunks).toString('utf8')); });
    req.on('error', reject);
  });
}

/* ---------------- 数据访问 ---------------- */
async function loadRows(group) {
  const groupQuery = 'select=id,name,sort&order=sort.asc';
  const photoQuery = 'select=id,group_id,src,w,h,alt,sort&order=sort.asc' +
    (group ? '&group_id=eq.' + encodeURIComponent(group) : '');

  const results = await Promise.all([
    restFetch('photo_groups?' + groupQuery),
    restFetch('photos?' + photoQuery)
  ]);

  const groupsRes = results[0];
  const photosRes = results[1];
  if (groupsRes.status >= 400 || photosRes.status >= 400) {
    const err = new Error('rest query failed: ' + (groupsRes.status >= 400 ? groupsRes.text : photosRes.text));
    err.code = 'REST_ERROR';
    throw err;
  }

  const nameById = {};
  const orderById = {};
  (groupsRes.body || []).forEach(function (g, i) {
    nameById[g.id] = g.name;
    orderById[g.id] = i;
  });

  const rows = (photosRes.body || []).map(function (p) {
    return {
      group_id: p.group_id,
      name: nameById[p.group_id] || p.group_id,
      id: p.id,
      src: p.src,
      w: p.w,
      h: p.h,
      alt: p.alt
    };
  }).filter(function (p) { return !!nameById[p.group_id]; });

  /* 按「分组顺序（photo_groups.sort）→ 组内顺序（photos.sort）」稳定排序，
     避免只按 photos.sort 排时三个组交错 */
  rows.sort(function (a, b) {
    const ga = orderById[a.group_id] === undefined ? 999 : orderById[a.group_id];
    const gb = orderById[b.group_id] === undefined ? 999 : orderById[b.group_id];
    return ga - gb;
  });

  return rows;
}

async function groupExists(group) {
  const r = await restFetch('photo_groups?select=id&id=eq.' + encodeURIComponent(group));
  if (r.status >= 400) {
    const err = new Error('rest group check failed: ' + r.text);
    err.code = 'REST_ERROR';
    throw err;
  }
  return Array.isArray(r.body) && r.body.length > 0;
}

async function nextSort(group) {
  const r = await restFetch(
    'photos?select=sort&group_id=eq.' + encodeURIComponent(group) + '&order=sort.desc&limit=1'
  );
  if (r.status >= 400) {
    const err = new Error('rest sort query failed: ' + r.text);
    err.code = 'REST_ERROR';
    throw err;
  }
  const top = Array.isArray(r.body) && r.body.length ? Number(r.body[0].sort) : 0;
  return (Number.isFinite(top) ? top : 0) + 1;
}

async function insertPhoto(p, id, sort) {
  const body = {
    id: id,
    group_id: p.group_id,
    src: p.src,
    w: p.w,
    h: p.h,
    alt: p.alt,
    sort: sort
  };
  if (p.added_at) body.added_at = p.added_at;

  const r = await restFetch('photos', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(body)
  });

  if (r.status === 409 || (r.body && r.body.code === '23505')) {
    const err = new Error('conflict');
    err.code = 'CONFLICT';
    err.detail = r.text;
    throw err;
  }
  if (r.status >= 400) {
    const err = new Error('rest insert failed: ' + r.text);
    err.code = 'REST_ERROR';
    throw err;
  }
  const row = Array.isArray(r.body) ? r.body[0] : r.body;
  return {
    id: row.id,
    group_id: row.group_id,
    src: row.src,
    w: row.w,
    h: row.h,
    alt: row.alt,
    sort: row.sort,
    added_at: row.added_at
  };
}

/* ---------------- 处理函数 ---------------- */
/* ---------------- 诊断路由（不泄露密钥） ---------------- */
function handleDiag(req, res, method) {
  const info = {
    version: '0.2.0',
    channel: 'rest',
    envIdSet: !!ENV_ID,
    apiKeySet: !!API_KEY,
    siteOriginSet: !!SITE_ORIGIN,
    gateway: ENV_ID ? ('https://' + ENV_ID + '.api.tcloudbasegateway.com') : null
  };

  restFetch('photo_groups?select=id&limit=1')
    .then(function (r) {
      info.restStatus = r.status;
      if (r.status >= 400) {
        const b = r.body || {};
        info.restError = { code: b.code || null, message: String(b.message || r.text || '').slice(0, 160) };
      }
      sendJson(res, 200, { ok: true, data: info }, method);
    })
    .catch(function (err) {
      info.restStatus = null;
      info.restError = { code: err && err.code ? err.code : 'FETCH_ERROR', message: String(err && err.message || '').slice(0, 160) };
      sendJson(res, 200, { ok: true, data: info }, method);
    });
}

function handleList(req, res, method) {
  let query;
  try {
    query = new URL('http://x' + (req.url || '/')).searchParams;
  } catch (e) {
    return fail(res, 400, 'BAD_REQUEST', '查询参数不合法', method);
  }

  const group = query.get('group');
  if (query.get('diag') === '1') {
    return handleDiag(req, res, method);
  }
  if (group !== null && !/^[a-z0-9_-]{1,32}$/.test(group)) {
    return fail(res, 400, 'BAD_REQUEST', '分组参数不合法', method);
  }

  const limitRaw = query.get('limit');
  let limit = 0;
  if (limitRaw !== null) {
    limit = Number(limitRaw);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      return fail(res, 400, 'BAD_REQUEST', 'limit 必须是 1–100 的整数', method);
    }
  }

  loadRows(group)
    .then(function (rows) {
      sendJson(res, 200, { ok: true, data: buildPayload(rows, { limit: limit }) }, method);
    })
    .catch(function (err) {
      console.error('list failed:', err && err.message);
      const msg = err && err.code === 'NO_CREDENTIALS' ? '服务端缺少 TCB_ENV_ID / TCB_API_KEY' : '数据库查询失败';
      fail(res, 500, 'INTERNAL', msg, method);
    });
}

function handleCreate(req, res, method) {
  const type = String(req.headers['content-type'] || '');
  if (type.indexOf('application/json') < 0) {
    return fail(res, 400, 'BAD_REQUEST', '请求头必须是 application/json', method);
  }

  readBody(req)
    .then(function (raw) {
      let body;
      try {
        body = JSON.parse(raw || '{}');
      } catch (e) {
        return fail(res, 400, 'BAD_REQUEST', '请求体不是合法 JSON', method);
      }

      const checked = validatePhotoInput(body);
      if (checked.error) {
        return fail(res, 400, 'BAD_REQUEST', checked.error, method);
      }
      const p = checked.value;

      return groupExists(p.group_id).then(function (exists) {
        if (!exists) {
          return fail(res, 400, 'BAD_REQUEST', '分组不存在：' + p.group_id, method);
        }
        const id = p.id || ('p_' + crypto.randomBytes(3).toString('hex'));
        const sortPromise = p.sort ? Promise.resolve(p.sort) : nextSort(p.group_id);
        return sortPromise.then(function (sort) {
          return insertPhoto(p, id, sort).then(function (photo) {
            sendJson(res, 201, { ok: true, data: { photo: photo } }, method);
          });
        });
      });
    })
    .catch(function (err) {
      if (err && err.message === 'body too large') {
        return fail(res, 400, 'BAD_REQUEST', '请求体过大（最多 8 KB）', method);
      }
      if (err && err.code === 'CONFLICT') {
        const detail = String(err.detail || '');
        const msg = /src/i.test(detail) ? '这张图已在该分组登记过' : '照片 id 已存在';
        return fail(res, 409, 'CONFLICT', msg, method);
      }
      console.error('create failed:', err && err.message);
      if (!res.writableEnded) {
        const msg = err && err.code === 'NO_CREDENTIALS' ? '服务端缺少 TCB_ENV_ID / TCB_API_KEY' : '数据库查询失败';
        fail(res, 500, 'INTERNAL', msg, method);
      }
    });
}

const server = http.createServer(function (req, res) {
  const method = String(req.method || 'GET').toUpperCase();

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': CORS_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400'
    });
    res.end();
    return;
  }

  const path = normalizePath(req.url);
  if (path !== '/' && path !== '/api/photos') {
    return fail(res, 404, 'NOT_FOUND', '接口不存在', method);
  }

  if (method === 'GET' || method === 'HEAD') {
    return handleList(req, res, method);
  }
  if (method === 'POST' && path === '/api/photos') {
    return handleCreate(req, res, method);
  }
  return fail(res, 405, 'METHOD_NOT_ALLOWED', '只支持 GET 和 POST 请求', method);
});

server.listen(PORT, function () {
  console.log('photos-api listening on port ' + PORT);
});

module.exports = { buildPayload: buildPayload, validatePhotoInput: validatePhotoInput };
