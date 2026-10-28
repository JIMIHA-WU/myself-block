/* ============================================================
   api-client.js —— 接口客户端（Day 20 建；Day 23 改）
   ------------------------------------------------------------
   作用：把「怎么调接口」集中在这里，页面其它代码不再直接 fetch。
   约定（与 api-contract.md §0 一致）：
     成功 → { ok: true,  data: ... }
     失败 → { ok: false, error: { code, message } } → 抛 Error，message 为中文

   Day 23 改了什么：三类错误全部翻成中文，前端不再把英文甩给用户。
     1) 网络层   fetch 直接 reject（断网 / 域名写错 / 被拦）
                改前：Failed to fetch            ← 浏览器原文，用户看不懂
                改后：连不上服务器，请检查网络或确认接口已部署
     2) 网关层   平台网关自己的回复，形如
                {"code":"INVALID_PATH","message":"Invalid path. For more information…"}
                改前：这句英文会被原样显示
                改后：接口地址不对或服务暂时不可用，请检查地址后重试（INVALID_PATH）
     3) 业务层   { ok:false, error:{ code, message } }，message 本来就是中文，直接用
   英文原文不丢，统一放进 err.detail，只在控制台看，不给用户看。
   ============================================================ */
(function (global) {
  'use strict';

  /* 云函数 HTTP 网关地址（与静态托管域名不是同一个，见 server/README §0） */
  var BASE = 'https://myself-demo-d3gdb1m6x686e940f-1509266644.ap-shanghai.app.tcloudbase.com';

  var TEXT_NETWORK = '连不上服务器，请检查网络或确认接口已部署';
  var TEXT_GATEWAY = '接口地址不对或服务暂时不可用，请检查地址后重试';
  var TEXT_BAD_JSON = '服务暂时不可用，请稍后重试';

  function makeError(message, code, detail) {
    var err = new Error(message);
    err.code = code;
    if (detail) err.detail = detail;
    return err;
  }

  function request(method, path, body) {
    var init = {
      method: method,
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    };
    if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }

    return fetch(BASE + path, init)
      /* 1) 网络层：连不上就先翻成人话，别把 "Failed to fetch" 漏出去 */
      .catch(function (e) {
        throw makeError(TEXT_NETWORK, 'NETWORK', String((e && e.message) || e));
      })
      .then(function (res) {
        return res.json()
          .catch(function () {
            /* 网关 502/504 常返回 HTML 或空体，JSON 解析会失败 */
            throw makeError(TEXT_BAD_JSON + '（HTTP ' + res.status + '）', 'BAD_RESPONSE');
          });
      })
      .then(function (payload) {
        /* 3) 业务层：我们的统一信封 */
        if (payload && payload.ok === true) return payload.data;

        if (payload && payload.error) {
          var err = makeError(payload.error.message || TEXT_GATEWAY, payload.error.code || 'ERROR');
          if (payload.error.requestId) err.requestId = payload.error.requestId;
          throw err;
        }

        /* 2) 网关层：有 code、没有 error 字段，message 是英文 */
        var code = (payload && payload.code) || 'GATEWAY';
        throw makeError(TEXT_GATEWAY + '（' + code + '）', code,
          String((payload && payload.message) || ''));
      });
  }

  global.ApiClient = {
    base: BASE,
    get: function (path) { return request('GET', path); },
    post: function (path, body) { return request('POST', path, body); },
    patch: function (path, body) { return request('PATCH', path, body); },
    del: function (path) { return request('DELETE', path); }
  };
})(window);
