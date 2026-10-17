'use strict';

/**
 * CloudBase 云函数：health
 * ------------------------------------------------------------------
 * 唯一职责：响应 GET /api/health，证明「公网 → 云函数」链路已打通。
 * 不连数据库、不读环境变量之外的任何资源、无第三方依赖。
 *
 * 部署位置：CloudBase 控制台 → 云函数 → 新建 health（Node.js 18）
 * HTTP 访问路径：/api/health（在函数详情里新增）
 *
 * 返回契约（api-contract.md §1）：
 *   200 → {"ok":true,"service":"myself-block"}
 *   405 → {"ok":false,"error":{"code":"METHOD_NOT_ALLOWED","message":"Only GET is allowed"}}
 *
 * 说明：CloudBase「HTTP 访问服务」会把 API 网关事件传进来（httpMethod 等字段）；
 * 在控制台点「测试」直接执行时没有 httpMethod —— 按 GET 处理，方便自测。
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
        error: { code: 'METHOD_NOT_ALLOWED', message: 'Only GET is allowed' }
      })
    );
  }

  return respond(200, JSON.stringify({ ok: true, service: 'myself-block' }));
};
