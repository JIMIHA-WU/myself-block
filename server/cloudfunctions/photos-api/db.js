'use strict';

/**
 * 数据访问层（Data Access Layer）—— Day 19 从 index.js 拆出
 * ------------------------------------------------------------------
 * 职责：只负责「怎么跟数据库说话」，不含任何 HTTP、路由、参数校验代码。
 * 通道：CloudBase 平台 REST（PostgREST），不走数据库直连。
 *
 * 环境变量（控制台配置，不写入代码）：
 *   TCB_ENV_ID   环境 ID
 *   TCB_API_KEY  服务端 API Key（service_role）
 *
 * 对外函数：
 *   restFetch(path, init)                 底层 REST 请求（诊断用）
 *   listRows(group)                       查询分组+照片，返回拍平的行
 *   groupExists(groupId)                  分组是否存在
 *   nextSort(groupId)                     组内下一个排序号
 *   insertPhoto(photo, id, sort)          插入一条照片记录
 */

const ENV_ID = String(process.env.TCB_ENV_ID || '').trim();
const API_KEY = String(process.env.TCB_API_KEY || '').trim();
const REST_TIMEOUT_MS = 8000;

/* 2026-10-24：允许用 REST_BASE 覆盖网关地址（仅用于本地/测试替身，生产仍走平台网关） */
const REST_BASE = String(process.env.REST_BASE || '').replace(/\/+$/, '') ||
  (ENV_ID ? 'https://' + ENV_ID + '.api.tcloudbasegateway.com' : '');

function restUrl(path) {
  return REST_BASE + '/v1/rdb/rest/' + path;
}

/** 统一封装平台 REST：带认证头、超时、JSON 解析
 *
 * Day 23：这里只负责「把故障分类」，不负责「怎么跟用户说」。
 *   · err.message 只写英文短句，**只进日志**，绝不回给浏览器；
 *   · err.detail  放上游原文（截断 500 字），同样只进日志；
 *   · err.code    交给 index.js 翻成中文人话（ERROR_TEXT 表）。
 */
async function restFetch(path, init) {
  if (!ENV_ID || !API_KEY) {
    const err = new Error('missing credentials');
    err.code = 'NO_CREDENTIALS';
    throw err;
  }

  let res;
  try {
    res = await fetch(restUrl(path), Object.assign({}, init, {
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
  } catch (e) {
    /* 网络层失败：超时 / 域名解析不了 / 连接被拒 —— 改前这些也会被裹成
       "数据库查询失败"，用户看不出是"等太久"还是"压根连不上" */
    const timeout = e && (e.name === 'TimeoutError' || e.name === 'AbortError');
    const err = new Error(timeout ? 'upstream timeout' : 'upstream unreachable');
    err.code = timeout ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNREACHABLE';
    err.detail = String((e && e.message) || '');
    throw err;
  }

  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch (e) { body = null; }
  return { status: res.status, body: body, text: text };
}

/* Day 23：改前 err.message = 'rest groups query failed: {"code":"42P01","message":"relation …"}'，
   这句英文会被 ?diag=1 原样吐到公网。现在 message 只留短标签，原文进 detail。 */
function assertOk(result, action) {
  if (result.status >= 400) {
    const err = new Error('upstream ' + action + ' failed (HTTP ' + result.status + ')');
    err.code = result.status >= 500 ? 'UPSTREAM_ERROR' : 'UPSTREAM_REJECTED';
    err.upstreamStatus = result.status;
    err.detail = String(result.text || '').slice(0, 500);
    throw err;
  }
}

/**
 * 查询照片（可按分组过滤）。
 * 返回拍平的行：{ group_id, name, id, src, w, h, alt }
 * 排序：先按 photo_groups.sort，再按调用方给定的 photos.sort（REST order=sort.asc）
 */
async function listRows(group) {
  const groupQuery = 'select=id,name,sort&order=sort.asc';
  const photoQuery = 'select=id,group_id,src,w,h,alt,sort&order=sort.asc' +
    (group ? '&group_id=eq.' + encodeURIComponent(group) : '');

  const results = await Promise.all([
    restFetch('photo_groups?' + groupQuery),
    restFetch('photos?' + photoQuery)
  ]);
  const groupsRes = results[0];
  const photosRes = results[1];
  assertOk(groupsRes, 'groups query');
  assertOk(photosRes, 'photos query');

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

  rows.sort(function (a, b) {
    const ga = orderById[a.group_id] === undefined ? 999 : orderById[a.group_id];
    const gb = orderById[b.group_id] === undefined ? 999 : orderById[b.group_id];
    return ga - gb;
  });

  return rows;
}

async function groupExists(groupId) {
  const r = await restFetch('photo_groups?select=id&id=eq.' + encodeURIComponent(groupId));
  assertOk(r, 'group check');
  return Array.isArray(r.body) && r.body.length > 0;
}

async function nextSort(groupId) {
  const r = await restFetch(
    'photos?select=sort&group_id=eq.' + encodeURIComponent(groupId) + '&order=sort.desc&limit=1'
  );
  assertOk(r, 'sort query');
  const top = Array.isArray(r.body) && r.body.length ? Number(r.body[0].sort) : 0;
  return (Number.isFinite(top) ? top : 0) + 1;
}

async function insertPhoto(photo, id, sort) {
  const body = {
    id: id,
    group_id: photo.group_id,
    src: photo.src,
    w: photo.w,
    h: photo.h,
    alt: photo.alt,
    sort: sort
  };
  if (photo.added_at) body.added_at = photo.added_at;

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
  assertOk(r, 'insert');

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

/* ---------------- 更新 / 删除（Day 22） ---------------- */
async function updatePhoto(id, fields) {
  const r = await restFetch(
    'photos?id=eq.' + encodeURIComponent(id) + '&select=*',
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(fields)
    }
  );

  if (r.status === 409 || (r.body && r.body.code === '23505')) {
    const err = new Error('conflict');
    err.code = 'CONFLICT';
    err.detail = r.text;
    throw err;
  }
  assertOk(r, 'update');

  const row = Array.isArray(r.body) ? r.body[0] : r.body;
  if (!row) return null;
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

async function deletePhoto(id) {
  const r = await restFetch(
    'photos?id=eq.' + encodeURIComponent(id) + '&select=*',
    { method: 'DELETE', headers: { Prefer: 'return=representation' } }
  );
  assertOk(r, 'delete');
  const row = Array.isArray(r.body) ? r.body[0] : r.body;
  return row ? { id: row.id } : null;
}

module.exports = {
  restFetch: restFetch,
  listRows: listRows,
  groupExists: groupExists,
  nextSort: nextSort,
  insertPhoto: insertPhoto,
  updatePhoto: updatePhoto,
  deletePhoto: deletePhoto
};
