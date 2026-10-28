'use strict';

/**
 * CloudBase 云函数：health —— 【事件函数版 / 旧版控制台】
 * ------------------------------------------------------------------
 * 适用范围：旧版控制台「事件函数 + HTTP 访问路径」模型。
 *   新建函数（Node.js 18）→ 用本文件覆盖 index.js → 部署
 *   → 在「HTTP 访问路径」里把 /api/health 映射到本函数。
 *
 * 新版控制台的「HTTP 云函数」模板请用目录里的 index.js（Web 服务版），
 * 它自己监听端口、直接给公网地址，不需要 HTTP 访问路径配置。
 *
 * 唯一职责：响应 GET /api/health，证明「公网 → 云函数」链路已打通。
 * 不连数据库、无第三方依赖、无外部请求。
 *
 * 返回契约（api-contract.md §1）：
 *   200 → {"ok":true,"service":"myself-block","data":{"service":"myself-block","status":"ok"}}
 *   405 → {"ok":false,"error":{"code":"METHOD_NOT_ALLOWED","message":"只支持 GET 请求"}}
 *
 * 2026-10-28 审计：本文件 405 的文案原为英文 "Only GET is allowed"，
 *   与 index.js 及契约 §0「message 必须是中文」冲突，已统一为中文。
 */

function respond(statusCode, body) {
  return {
    statusCode: statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    },
    body: body,
    isBase64Encoded: false
  };
}

exports.main = async function main(event) {
  var method = String((event && (event.httpMethod || event.method)) || 'GET').toUpperCase();

  if (method !== 'GET' && method !== 'HEAD') {
    return respond(
      405,
      JSON.stringify({
        ok: false,
        error: { code: 'METHOD_NOT_ALLOWED', message: '只支持 GET 请求' }
      })
    );
  }

  return respond(
    200,
    JSON.stringify({ ok: true, service: 'myself-block', data: { service: 'myself-block', status: 'ok' } })
  );
};
