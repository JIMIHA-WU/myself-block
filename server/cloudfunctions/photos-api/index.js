'use strict';

/**
 * CloudBase 云函数：photos-api —— 【HTTP 云函数 / Web 服务模式】
 * ------------------------------------------------------------------
 * Day 19 重构：数据库操作全部移到 ./db.js（数据访问层），本文件只保留
 *   HTTP 服务、路由、参数校验、响应组装。
 *
 * 契约：
 *   GET  /api/photos  → api-contract.md §3
 *   POST /api/photos  → api-contract.md §11
 *
 * 环境变量：
 *   TCB_ENV_ID / TCB_API_KEY   由 db.js 读取（数据通道凭证）
 *   SITE_ORIGIN                静态托管域名（拼完整图片 URL）
 *   CORS_ORIGIN                白名单，逗号分隔（如 https://a.com,http://localhost:8000）；禁止 *
 */

const http = require('node:http');
const crypto = require('node:crypto');
const db = require('./db');

const PORT = process.env.PORT || 9000;
const SITE_ORIGIN = String(process.env.SITE_ORIGIN || '').replace(/\/+$/, '');
/* CORS 白名单（2026-10-22 Day 20）：环境变量 CORS_ORIGIN 支持逗号分隔多个来源，
   绝不使用 *。浏览器 Origin 不在白名单内时，只回第一个来源（浏览器会拦下）。 */
const CORS_ENV = String(process.env.CORS_ORIGIN || '').trim();
const CORS_LIST = CORS_ENV
  ? CORS_ENV.split(',').map(function (s) { return s.trim(); }).filter(Boolean)
  : [];

function pickOrigin(req) {
  const origin = String((req.headers && req.headers.origin) || '');
  if (origin && CORS_LIST.indexOf(origin) >= 0) return origin;
  if (!CORS_LIST.length) return '*';
  return CORS_LIST[0];
}
const BODY_LIMIT = 8 * 1024;

/* ---------------- 响应组装（纯函数，便于本地测试） ---------------- */
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

/* ---------------- 写入参数校验（纯函数，便于本地测试） ---------------- */
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

/* ---------------- PATCH 参数校验（Day 22） ---------------- */
function validatePhotoPatch(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { error: '请求体必须是 JSON 对象' };
  }

  const out = {};
  let count = 0;

  if (input.alt !== undefined) {
    if (typeof input.alt !== 'string' || input.alt.length > 200) {
      return { error: 'alt 必须是不超过 200 字的字符串' };
    }
    out.alt = input.alt;
    count++;
  }

  if (input.sort !== undefined) {
    const s = toInt(input.sort);
    if (!(s >= 1 && s <= 32767)) return { error: 'sort 必须是 1–32767 的整数' };
    out.sort = s;
    count++;
  }

  if (input.group_id !== undefined) {
    if (typeof input.group_id !== 'string' || !/^[a-z0-9_-]{1,32}$/.test(input.group_id)) {
      return { error: 'group_id 只允许小写字母、数字、下划线、连字符（1–32 位）' };
    }
    out.group_id = input.group_id;
    count++;
  }

  if (input.w !== undefined) {
    const w = toInt(input.w);
    if (!(w >= 1 && w <= 100000)) return { error: 'w 必须是 1–100000 的整数' };
    out.w = w;
    count++;
  }

  if (input.h !== undefined) {
    const h = toInt(input.h);
    if (!(h >= 1 && h <= 100000)) return { error: 'h 必须是 1–100000 的整数' };
    out.h = h;
    count++;
  }

  if (input.id !== undefined || input.src !== undefined || input.added_at !== undefined) {
    return { error: 'id、src、added_at 不允许修改' };
  }

  if (count === 0) {
    return { error: '至少提供一个要修改的字段：alt / sort / group_id / w / h' };
  }

  return { value: out };
}

/* ---------------- HTTP 工具 ---------------- */
function sendJson(res, status, body, method) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': res.corsOrigin || CORS_LIST[0] || '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
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

/* ---------------- 诊断（只读，不泄露密钥） ---------------- */
function handleDiag(req, res, method) {
  const info = {
    version: '0.3.0',
    channel: 'rest',
    layer: 'index.js + db.js',
    method: String(req.method || ''),
    url: String(req.url || ''),
    envIdSet: !!process.env.TCB_ENV_ID,
    apiKeySet: !!process.env.TCB_API_KEY,
    siteOriginSet: !!SITE_ORIGIN
  };

  db.restFetch('photo_groups?select=id&limit=1')
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

/* ---------------- 读接口 ---------------- */
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

  db.listRows(group)
    .then(function (rows) {
      sendJson(res, 200, { ok: true, data: buildPayload(rows, { limit: limit }) }, method);
    })
    .catch(function (err) {
      console.error('list failed:', err && err.message);
      const msg = err && err.code === 'NO_CREDENTIALS' ? '服务端缺少 TCB_ENV_ID / TCB_API_KEY' : '数据库查询失败';
      fail(res, 500, 'INTERNAL', msg, method);
    });
}

/* ---------------- 写接口 ---------------- */
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

      return db.groupExists(p.group_id).then(function (exists) {
        if (!exists) {
          return fail(res, 400, 'BAD_REQUEST', '分组不存在：' + p.group_id, method);
        }
        const id = p.id || ('p_' + crypto.randomBytes(3).toString('hex'));
        const sortPromise = p.sort ? Promise.resolve(p.sort) : db.nextSort(p.group_id);
        return sortPromise.then(function (sort) {
          return db.insertPhoto(p, id, sort).then(function (photo) {
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

/* ---------------- 修改接口（Day 22） ---------------- */
function handleUpdate(req, res, method) {
  let query;
  try {
    query = new URL('http://x' + (req.url || '/')).searchParams;
  } catch (e) {
    return fail(res, 400, 'BAD_REQUEST', '查询参数不合法', method);
  }

  const id = query.get('id');
  if (!id || !/^[a-z0-9_-]{1,16}$/.test(id)) {
    return fail(res, 400, 'BAD_REQUEST', 'id 必填：只允许小写字母、数字、下划线、连字符（1–16 位）', method);
  }

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

      const checked = validatePhotoPatch(body);
      if (checked.error) {
        return fail(res, 400, 'BAD_REQUEST', checked.error, method);
      }
      const fields = checked.value;

      const ensureGroup = fields.group_id
        ? db.groupExists(fields.group_id)
        : Promise.resolve(true);

      return ensureGroup
        .then(function (groupOk) {
          if (!groupOk) {
            return fail(res, 400, 'BAD_REQUEST', '分组不存在：' + fields.group_id, method);
          }
          return db.updatePhoto(id, fields).then(function (photo) {
            if (!photo) {
              return fail(res, 404, 'NOT_FOUND', '照片不存在：' + id, method);
            }
            sendJson(res, 200, { ok: true, data: { photo: photo } }, method);
          });
        });
    })
    .catch(function (err) {
      if (err && err.message === 'body too large') {
        return fail(res, 400, 'BAD_REQUEST', '请求体过大（最多 8 KB）', method);
      }
      console.error('update failed:', err && err.message);
      if (!res.writableEnded) {
        const msg = err && err.code === 'CONFLICT' ? '该分组下已有同一张图，无法移动' :
          (err && err.code === 'NO_CREDENTIALS' ? '服务端缺少 TCB_ENV_ID / TCB_API_KEY' : '数据库查询失败');
        fail(res, err && err.code === 'CONFLICT' ? 409 : 500, err && err.code === 'CONFLICT' ? 'CONFLICT' : 'INTERNAL', msg, method);
      }
    });
}

/* ---------------- 删除接口（Day 22） ---------------- */
function handleDelete(req, res, method) {
  let query;
  try {
    query = new URL('http://x' + (req.url || '/')).searchParams;
  } catch (e) {
    return fail(res, 400, 'BAD_REQUEST', '查询参数不合法', method);
  }

  const id = query.get('id');
  if (!id || !/^[a-z0-9_-]{1,16}$/.test(id)) {
    return fail(res, 400, 'BAD_REQUEST', 'id 必填：只允许小写字母、数字、下划线、连字符（1–16 位）', method);
  }

  db.deletePhoto(id)
    .then(function (row) {
      if (!row) {
        return fail(res, 404, 'NOT_FOUND', '照片不存在：' + id, method);
      }
      sendJson(res, 200, { ok: true, data: { deleted: row } }, method);
    })
    .catch(function (err) {
      console.error('delete failed:', err && err.message);
      const msg = err && err.code === 'NO_CREDENTIALS' ? '服务端缺少 TCB_ENV_ID / TCB_API_KEY' : '数据库查询失败';
      fail(res, 500, 'INTERNAL', msg, method);
    });
}

/* ---------------- 路由 ---------------- */
const server = http.createServer(function (req, res) {
  const method = String(req.method || 'GET').toUpperCase();
  res.corsOrigin = pickOrigin(req);
  res.setHeader('X-Debug-Method', method);
  res.setHeader('X-Debug-Url', String(req.url || '/').slice(0, 120));

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': res.corsOrigin || CORS_LIST[0] || '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400'
    });
    res.end();
    return;
  }

  const path = normalizePath(req.url);
  if (String(req.url || '').indexOf('diag=1') >= 0 && method !== 'OPTIONS') {
    return handleDiag(req, res, method);
  }
  if (path !== '/' && path !== '/api/photos') {
    return fail(res, 404, 'NOT_FOUND', '接口不存在', method);
  }

  if (method === 'GET' || method === 'HEAD') {
    return handleList(req, res, method);
  }
  /* 网关「路径透传」关闭时 POST 到达函数可能是 "/"，所以不要求精确路径 */
  if (method === 'POST') {
    return handleCreate(req, res, method);
  }
  if (method === 'PATCH') {
    return handleUpdate(req, res, method);
  }
  if (method === 'DELETE') {
    return handleDelete(req, res, method);
  }
  return fail(res, 405, 'METHOD_NOT_ALLOWED', '只支持 GET、POST、PATCH、DELETE 请求', method);
});

server.listen(PORT, function () {
  console.log('photos-api listening on port ' + PORT);
});

module.exports = { buildPayload: buildPayload, validatePhotoInput: validatePhotoInput };
