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

function fail(res, status, code, message, method, requestId) {
  const error = { code: code, message: message };
  if (requestId) error.requestId = requestId;
  sendJson(res, status, { ok: false, error: error }, method);
}

/* ============================================================
   Day 23：三类错误的中文文案表
   ------------------------------------------------------------
   类 1 参数不对  → 400 BAD_REQUEST      「你传的东西不对，应该这样传」
   类 2 找不到    → 404 NOT_FOUND        「这个东西不存在，可能已经没了」
   类 3 服务端故障 → 500 INTERNAL        「不是你的问题，我们这边出状况了」

   原则：机器码（code）保持英文，供前端分支判断；message 一律中文，
   说清"哪里不对 + 怎么办"。改前 5xx 一律叫「数据库查询失败」，
   连"凭证没配"都算作查询失败 —— 用户照着这句去查是查不出来的。
   ============================================================ */
const ERROR_TEXT = {
  NO_CREDENTIALS: '服务端未配置数据库凭证，请联系管理员',
  UPSTREAM_TIMEOUT: '数据库响应太慢，已超时，请稍后重试',
  UPSTREAM_UNREACHABLE: '连不上数据库，请稍后重试',
  UPSTREAM_ERROR: '数据库暂时不可用，请稍后重试',
  UPSTREAM_REJECTED: '数据库拒绝了这次请求，请稍后重试',
  UNKNOWN: '服务器内部错误，请稍后重试'
};

/* 网关会把同一个 id 同时写进请求头和响应头；取前 8 位当「报错编号」，
   够短能念出来，也够长能在平台日志里搜到 */
function requestIdOf(req) {
  const h = (req && req.headers) || {};
  return String(h['x-request-id'] || h['x-cloudbase-request-id'] || '').trim().slice(0, 8);
}

/** 类 3 统一出口：中文口径 + 报错编号（原始英文只进 console） */
function failServer(req, res, err, method, tag) {
  const code = (err && err.code) || 'UNKNOWN';
  const base = ERROR_TEXT[code] || ERROR_TEXT.UNKNOWN;
  const rid = requestIdOf(req);
  console.error(
    '[' + (tag || 'server') + '] code=' + code +
    ' status=' + (err && err.upstreamStatus ? err.upstreamStatus : '-') +
    ' rid=' + (rid || '-') +
    ' detail=' + String((err && (err.detail || err.message)) || '').slice(0, 300)
  );
  fail(res, 500, 'INTERNAL', rid ? base + '（编号 ' + rid + '）' : base, method, rid || undefined);
}

function normalizePath(url) {
  const raw = String(url || '/').split('?')[0];
  const trimmed = raw.replace(/\/+$/, '');
  return trimmed || '/';
}

/* 路径参数解析（Day 22）：支持 /api/photos/p_xxx 与 /p_xxx 两种透传形态 */
function pathPhotoId(path) {
  const m = /^\/(?:api\/photos\/)?([a-z0-9_-]{1,16})$/.exec(String(path || ''));
  if (!m) return null;
  if (m[1] === 'photos' || m[1] === 'health') return null;
  return m[1];
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
    version: '0.4.0',
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
      info.restOk = r.status < 400;
      if (r.status >= 400) {
        /* Day 23：改前这里回的是上游英文原文（relation "photo_groups" does not exist …），
           等于把内部报错直接摆到公网。现在只回机器码 + 一句中文排查方向。 */
        const b = r.body || {};
        info.restError = {
          code: String(b.code || ('HTTP_' + r.status)).slice(0, 40),
          hint: r.status === 401 || r.status === 403
            ? '凭证被拒绝：检查 TCB_API_KEY 是否有效或已过期'
            : r.status === 404
              ? '表不存在：检查 db/schema.sql 是否已在该环境执行'
              : '平台 REST 返回 ' + r.status + '，详细原因见云函数日志'
        };
      }
      sendJson(res, 200, { ok: true, data: info }, method);
    })
    .catch(function (err) {
      info.restStatus = null;
      info.restOk = false;
      info.restError = {
        code: (err && err.code) || 'UNKNOWN',
        hint: ERROR_TEXT[(err && err.code)] || ERROR_TEXT.UNKNOWN
      };
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
    return fail(res, 400, 'BAD_REQUEST',
      '分组参数 group 只能用 1–32 位小写字母、数字、下划线或连字符，你传的是「' + group + '」', method);
  }

  const limitRaw = query.get('limit');
  let limit = 0;
  if (limitRaw !== null) {
    limit = Number(limitRaw);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      return fail(res, 400, 'BAD_REQUEST',
        'limit 只能是 1–100 的整数，你传的是「' + limitRaw + '」', method);
    }
  }

  db.listRows(group)
    .then(function (rows) {
      sendJson(res, 200, { ok: true, data: buildPayload(rows, { limit: limit }) }, method);
    })
    .catch(function (err) {
      failServer(req, res, err, method, 'list');
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
        failServer(req, res, err, method, 'create');
      }
    });
}

/* ---------------- 修改接口（Day 22） ---------------- */
function handleUpdate(req, res, method, pathId) {
  let query;
  try {
    query = new URL('http://x' + (req.url || '/')).searchParams;
  } catch (e) {
    return fail(res, 400, 'BAD_REQUEST', '查询参数不合法', method);
  }

  const id = pathId || query.get('id');
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
              return fail(res, 404, 'NOT_FOUND', '照片不存在：' + id + '（可能已被删除，刷新列表后再试）', method);
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
        if (err && err.code === 'CONFLICT') {
          return fail(res, 409, 'CONFLICT', '该分组下已经有同一张图了，换一张或先删掉旧的', method);
        }
        failServer(req, res, err, method, 'update');
      }
    });
}

/* ---------------- 删除接口（Day 22） ---------------- */
function handleDelete(req, res, method, pathId) {
  let query;
  try {
    query = new URL('http://x' + (req.url || '/')).searchParams;
  } catch (e) {
    return fail(res, 400, 'BAD_REQUEST', '查询参数不合法', method);
  }

  const id = pathId || query.get('id');
  if (!id || !/^[a-z0-9_-]{1,16}$/.test(id)) {
    return fail(res, 400, 'BAD_REQUEST', 'id 必填：只允许小写字母、数字、下划线、连字符（1–16 位）', method);
  }

  db.deletePhoto(id)
    .then(function (row) {
      if (!row) {
        return fail(res, 404, 'NOT_FOUND', '照片不存在：' + id + '（可能已被删除，刷新列表后再试）', method);
      }
      sendJson(res, 200, { ok: true, data: { deleted: row } }, method);
    })
    .catch(function (err) {
      failServer(req, res, err, method, 'delete');
    });
}

/* ---------------- 路由 ---------------- */
const server = http.createServer(function (req, res) {
  const method = String(req.method || 'GET').toUpperCase();
  res.corsOrigin = pickOrigin(req);
  res.setHeader('X-Debug-Method', method);
  res.setHeader('X-Debug-Url', String(req.url || '/').slice(0, 120));

  /* Day 23 余力加练：请求日志（时间、方法、路径、结果码、耗时）。
     只写一行进云函数日志，响应体不带任何日志字段；线上排障靠这行对时间点。 */
  const t0 = Date.now();
  res.on('finish', function () {
    console.log(
      '[req] ' + new Date().toISOString() +
      ' ' + method +
      ' ' + String(req.url || '/').slice(0, 80) +
      ' → ' + res.statusCode +
      ' ' + (Date.now() - t0) + 'ms'
    );
  });

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
  const pathId = pathPhotoId(path);
  if (String(req.url || '').indexOf('diag=1') >= 0 && method !== 'OPTIONS') {
    return handleDiag(req, res, method);
  }
  if (path !== '/' && path !== '/api/photos' && !pathId) {
    return fail(res, 404, 'NOT_FOUND',
      '接口不存在：' + path + '（可用：GET/POST /api/photos，PATCH/DELETE /api/photos/:id，GET /api/health）', method);
  }

  if (method === 'GET' || method === 'HEAD') {
    return handleList(req, res, method);
  }
  /* 网关「路径透传」关闭时到达函数可能是 "/"，因此 POST 不要求精确路径 */
  if (method === 'POST') {
    return handleCreate(req, res, method);
  }
  if (method === 'PATCH') {
    return handleUpdate(req, res, method, pathId);
  }
  if (method === 'DELETE') {
    return handleDelete(req, res, method, pathId);
  }
  return fail(res, 405, 'METHOD_NOT_ALLOWED',
    '不支持 ' + method + ' 方法：这个地址只接受 GET、POST、PATCH、DELETE', method);
});

server.listen(PORT, function () {
  console.log('photos-api listening on port ' + PORT);
});

module.exports = { buildPayload: buildPayload, validatePhotoInput: validatePhotoInput };
