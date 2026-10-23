/* ============================================================
   api-client.js —— 接口客户端（2026-10-22 Day 20）
   ------------------------------------------------------------
   作用：把「怎么调接口」集中在这里，页面其它代码不再直接 fetch。
   约定（与 api-contract.md §0 一致）：
     成功 → { ok: true,  data: ... }
     失败 → { ok: false, error: { code, message } } → 抛 Error，message 为中文
   ============================================================ */
(function (global) {
  'use strict';

  /* 云函数 HTTP 网关地址（与静态托管域名不是同一个，见 server/README §0） */
  var BASE = 'https://myself-demo-d3gdb1m6x686e940f-1509266644.ap-shanghai.app.tcloudbase.com';

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
      .then(function (res) {
        return res.json().catch(function () {
          throw new Error('接口返回的不是 JSON（HTTP ' + res.status + '）');
        });
      })
      .then(function (payload) {
        if (!payload || payload.ok !== true) {
          var msg = (payload && payload.error && payload.error.message) || '接口返回异常';
          var err = new Error(msg);
          err.code = payload && payload.error && payload.error.code;
          err.status = payload && payload.error ? undefined : undefined;
          throw err;
        }
        return payload.data;
      });
  }

  global.ApiClient = {
    base: BASE,
    get: function (path) { return request('GET', path); },
    post: function (path, body) { return request('POST', path, body); }
  };
})(window);
