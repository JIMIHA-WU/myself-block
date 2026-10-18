'use strict';

/**
 * CloudBase 云函数：health —— 【HTTP 云函数版 / Web 服务模式，新版控制台】
 * ------------------------------------------------------------------
 * 对应界面：控制台「云函数 → 创建云函数 → 通过模板创建 → HTTP 云函数 →
 *   Hello World (HTTP Node.js Hello World)」生成的函数。
 * 用法：创建后，用本文件覆盖函数里的 index.js，部署即可。
 *   scf_bootstrap 保持模板默认（内容应为两行：#!/bin/bash + node index.js）。
 *
 * 与事件函数版的区别：
 *   本版本自己起 HTTP 服务、监听端口（CloudBase 注入 PORT，本地缺省 9000），
 *   因此不需要在控制台另配「HTTP 访问路径」——函数详情会直接给公网地址。
 *
 * 路由（契约见 api-contract.md §1）：
 *   GET|HEAD /            → 200  {"ok":true,"service":"myself-block"}   便于直接打开域名
 *   GET|HEAD /api/health  → 200  同上
 *   其他方法              → 405  {"ok":false,"error":{"code":"METHOD_NOT_ALLOWED",...}}
 *   其他路径              → 404  {"ok":false,"error":{"code":"NOT_FOUND",...}}
 *
 * 零依赖：只用 Node 内置模块，不连数据库、不发外部请求。
 */

const http = require('node:http');

const PORT = process.env.PORT || 9000;
const HEALTH = { ok: true, service: 'myself-block' };

function sendJson(res, status, body, method) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(method === 'HEAD' ? undefined : text);
}

function normalizePath(url) {
  const raw = String(url || '/').split('?')[0];
  const trimmed = raw.replace(/\/+$/, '');
  return trimmed || '/';
}

const server = http.createServer(function (req, res) {
  const method = String(req.method || 'GET').toUpperCase();
  const path = normalizePath(req.url);

  if (path !== '/' && path !== '/api/health') {
    return sendJson(res, 404, { ok: false, error: { code: 'NOT_FOUND', message: 'not found' } }, method);
  }

  if (method !== 'GET' && method !== 'HEAD') {
    return sendJson(
      res,
      405,
      { ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Only GET is allowed' } },
      method
    );
  }

  return sendJson(res, 200, HEALTH, method);
});

server.listen(PORT, function () {
  console.log('health service listening on port ' + PORT);
});
