/* ============================================================
   api/data.js —— 全站唯一的取数入口（阶段一：本地数据）
   ============================================================
   【这个文件是干什么的】
   全站所有内容（照片、笔记、感悟、站点信息）都写在这一个文件里。
   页面只负责「怎么显示」，不直接写死内容。

   【为什么单独放在 api/ 文件夹】
   TECH_DESIGN.md §12 的要求：阶段一就把取数集中在 api/ 一层，
   阶段二换成「调云函数接口」时只改这一个文件，页面代码不用动。
   文档原话：「阶段一即把取数集中在 api/ 一层，改造只动这一处」。

   【阶段一 / 阶段二 的区别】
     阶段一（现在）：数据写在本文件里，页面直接读数组。
     阶段二（以后）：本文件内部改成 fetch 调云函数，对外结构不变。

   【重要】下面所有条目都是【占位内容】，不是 Jack 的真实素材。
   C1 挑照片 / C2 写 3 篇笔记 / C3 写 1 条感悟 完成后，
   只需替换本文件里的字段值，页面代码一行都不用改。

   依据：PRD.md §4.2 §4.3 §4.4 §4.6 · TECH_DESIGN.md §5 §12
   ============================================================ */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------
     0. 占位图工具
     生成一张带编号的灰紫色图片（data URI），不需要任何图片文件。
     真照片到位后，把下面的 src 换成 'public/assets/photos/xxx.jpg' 即可。
     ------------------------------------------------------------ */
  function ph(label, w, h) {
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h +
      '" viewBox="0 0 ' + w + ' ' + h + '">' +
      '<rect width="' + w + '" height="' + h + '" fill="#23262E"/>' +
      '<rect x="1" y="1" width="' + (w - 2) + '" height="' + (h - 2) +
      '" fill="none" stroke="#3A3E48" stroke-width="2"/>' +
      '<text x="50%" y="50%" fill="#7E838E" font-family="sans-serif" font-size="' +
      Math.round(Math.min(w, h) / 7) +
      '" text-anchor="middle" dominant-baseline="middle">' + label + '</text>' +
      '</svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  /* ------------------------------------------------------------
     1. 站点信息（PRD §1.2 / §4.2 信息卡的文案部分）
     「建站 N 天」不在这里存数字，由 firstOnline + 当天日期算出，
       所以改一处常量就够了（PRD §4.2 补注）。
     ------------------------------------------------------------ */
  var SITE = {
    name:        'Ja的小屋',
    slogan:      '存放着时间',
    subtitle:    '从这里了解我',
    intro: [                                     // 2–3 句，不写真名与校名
      '大二在读，方向是导航与电子信息，平时折腾代码和一些自己想做的小工具。',
      '这里放我拍的照片和随手记下的东西。'
    ],
    email:       '1689871232@qq.com',
    github:      'https://github.com/JIMIHA-WU/myself-block',
    firstOnline: '2026-09-28',                   // 首次上线日；「建站 N 天」由此日起算

    /* 「建站 N 天」是否把上线当天算作第 1 天。
       两种读法都说得通，PRD §4.2 只写了"从首次上线日起算"，没写含不含首日：
         true  → 含首日（上线当天显示「1 天」）  ← 当前采用
         false → 纯日期差值（上线当天显示「0 天」）
       改这一个布尔值即可切换，不用动别的地方。 */
    daysCountIncludesFirstDay: true,

    footerYear:  '2026'
  };

  /* ------------------------------------------------------------
     2. 照片（PRD §4.4：纯图，无标题、无说明）

     【2026-09-28 换成 Jack 的真实照片】4 张，全部 16:9 附近，均由
       Rider01 / RiderKing / RiderKiva / RiderMice 四张原图转出：
         · 长边压到 1600px，按 PRD §8 命名 photo-01.webp … photo-04.webp
         · WebP（q82，RiderKing 为压到 300KB 内降到 q77），全部 ≤300KB（PRD §9.5）
         · 原始宽高比保留，未裁切
       路径写成 '../public/assets/photos/photo-NN.webp'：
         client/ 与 public/ 平级，所以从页面出发要退一级（PRD §8 目录树）。
       保留 w / h 是为了让照片墙能算出瀑布流分列（不依赖图片加载完）。
       alt 按 PRD §3.3 隐私边界，只写中性描述，不含地点与人物身份。
     ------------------------------------------------------------ */
  var PHOTO_BASE = '../public/assets/photos/';

  var PHOTOS = [
    { id: 'p1', added_at: '2026-09-28', alt: '照片 01', w: 1600, h:  900, src: PHOTO_BASE + 'photo-01.webp' },
    { id: 'p2', added_at: '2026-09-28', alt: '照片 02', w: 1600, h: 1132, src: PHOTO_BASE + 'photo-02.webp' },
    { id: 'p3', added_at: '2026-09-28', alt: '照片 03', w: 1600, h: 1067, src: PHOTO_BASE + 'photo-03.webp' },
    { id: 'p4', added_at: '2026-09-28', alt: '照片 04', w: 1600, h:  900, src: PHOTO_BASE + 'photo-04.webp' }
  ];

  /* ------------------------------------------------------------
     3. 内容（笔记 + 感悟同一条流，PRD §4.3）
     字段说明：
       type    : 'note' 笔记 / 'moment' 感悟
       title   : 笔记必须有；感悟允许为空字符串
       date    : 发布日期（= 排序依据；本数组不要求有序，读的时候再排）
       cover   : 卡片封面，统一 16:9（PRD §4.6），可省略
       summary : 卡片上显示的摘要。**2026-09-28 Jack 定：笔记卡必须有正文摘要**，
                 并已于同日写入 PRD §4.3（PRD v1.6 → **v1.7**），
                 验收项见 PRD §5.2「笔记卡有摘要」。**必填**，不写就没有摘要可显示。
                 实现层仍留了兜底：万一漏写，退回正文第一段（见下面的 cardText()），
                 但那是防错用的，不作为可以省略的理由。
       body    : 正文，条目可以是两种：
                   字符串        → 一个段落
                   { img, alt } → 一张正文插图，统一按 4:3 显示（PRD §4.6）
                 每篇最多 3 张插图（PRD §4.3）。
     ------------------------------------------------------------ */
  var POSTS = [
    {
      id: 'n1', type: 'note', date: '2026-09-26',
      title: '把卡片流的第一版做出来了',
      cover: ph('封面 16:9', 1600, 900),
      summary: '两张卡一列，笔记和感悟混排，靠标签区分。做的时候才发现，光是把间距和圆角对齐就要反复改好几遍。',
      body: [
        '两张卡一列，笔记和感悟混排，靠标签区分。',
        { img: ph('正文插图 4:3', 1200, 900), alt: '正文插图占位' },
        '做的时候才发现，光是把间距和圆角对齐就要反复改好几遍。'
      ]
    },
    {
      id: 'm1', type: 'moment', date: '2026-09-25',
      title: '',                                 // 感悟允许无标题
      cover: ph('封面 16:9', 1600, 900),
      body: [
        '今天傍晚的云特别低。',
        '下楼买水的时候站了一会儿，没拍好，但记下来了。'
      ]
    },
    {
      id: 'n2', type: 'note', date: '2026-09-23',
      title: '做这个网站之前，我在想什么',
      cover: ph('封面 16:9', 1600, 900),
      summary: '不是因为它解决了什么痛点，就是想要一个自己说了算的地方。',
      body: [
        '不是因为它解决了什么痛点，就是想要一个自己说了算的地方。'
      ]
    },
    {
      id: 'n3', type: 'note', date: '2026-09-20',
      title: '第一次把这套流程完整走了一遍',
      cover: ph('封面 16:9', 1600, 900),
      summary: '从写需求文档到提交代码，中间返工了两次。',
      body: [
        '从写需求文档到提交代码，中间返工了两次。'
      ]
    }
  ];

  /* ------------------------------------------------------------
     4. 派生计算（PRD §4.2 / §5.2「数字与实际一致」）
     数字一律由上面的数组算出来，不手写死值 —— 这样就不会出现
     「加了照片忘了改数字」这种漏改（PRD §5.2 有专门一条验收项
     查这个：信息卡的「照片 N 张」必须等于实际条数）。
     ------------------------------------------------------------ */

  var DAY_MS = 24 * 60 * 60 * 1000;

  /* 建站天数：从 SITE.firstOnline 算到 target 那一天。
     target 传 'YYYY-MM-DD'；不传就用浏览器当天（页面里的正常用法）。 */
  function daysOnline(target) {
    var start = new Date(SITE.firstOnline + 'T00:00:00');
    var end   = target ? new Date(target + 'T00:00:00') : new Date();
    if (isNaN(start) || isNaN(end)) return 0;
    var n = Math.floor((end - start) / DAY_MS);
    if (n < 0) n = 0;
    return n + (SITE.daysCountIncludesFirstDay ? 1 : 0);
  }

  /* 信息卡要用的四项：照片数 / 笔记数 / 建站天数 / 最后更新于 */
  function stats(target) {
    var notes  = 0;
    var latest = '';

    POSTS.forEach(function (p) {
      if (p.type === 'note') notes++;          // 感悟不计入「笔记 N 篇」
      if (p.date > latest) latest = p.date;
    });
    PHOTOS.forEach(function (p) {
      if (p.added_at > latest) latest = p.added_at;
    });

    return {
      photos:      PHOTOS.length,
      notes:       notes,
      days:        daysOnline(target),
      lastUpdated: latest
    };
  }

  /* ------------------------------------------------------------
     4b. 卡片流与详情页要用的派生（PRD §4.3 / §9.8）
     ------------------------------------------------------------ */

  /* 一条流：笔记 + 感悟混排，按日期倒序（PRD §4.3）。
     不直接改 POSTS 本身，返回的是排好序的副本 —— 免得读一次就把原数组搅乱。 */
  function feed() {
    return POSTS.slice().sort(function (a, b) {
      if (a.date === b.date) return 0;
      return a.date < b.date ? 1 : -1;           // 新的在前
    });
  }

  /* 只有笔记，同样倒序。详情页的上一篇 / 下一篇只在笔记之间跳（PRD §9.8） */
  function notes() {
    return feed().filter(function (p) { return p.type === 'note'; });
  }

  function noteById(id) {
    var list = notes();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  /* 上一篇 = 列表里更靠前（更新）的一篇；下一篇 = 更靠后（更旧）的一篇。
     PRD §5.2：第一篇无上一篇、最后一篇无下一篇。 */
  function noteNeighbors(id) {
    var list  = notes();
    var index = -1;

    list.forEach(function (p, i) { if (p.id === id) index = i; });

    if (index < 0) return { prev: null, next: null, index: -1, total: list.length };
    return {
      prev:  index > 0 ? list[index - 1] : null,
      next:  index < list.length - 1 ? list[index + 1] : null,
      index: index,
      total: list.length
    };
  }

  /* 卡片上显示哪几段文字（**2026-09-28 Jack 定：卡片必须有正文摘要**；PRD v1.7 §4.3 已同步）
       - 感悟：卡片上直接显示全文（PRD §4.3），长超过 150 字应先改写成笔记
       - 笔记：用写好的 summary（PRD §4.3 定为必填）；万一漏写才退回正文第一段
     返回的是「段落数组」，视图层逐段输出即可。 */
  function cardText(post) {
    var paras = (post.body || []).filter(function (x) { return typeof x === 'string'; });

    if (post.type === 'moment') return paras;
    if (post.summary) return [post.summary];
    return paras.length ? [paras[0]] : [];
  }

  /* ------------------------------------------------------------
     5. 对外出口
     ------------------------------------------------------------ */
  global.JaData = {
    SITE:   SITE,
    PHOTOS: PHOTOS,
    POSTS:  POSTS,

    /* 派生计算 */
    stats:          stats,
    feed:           feed,
    notes:          notes,
    noteById:       noteById,
    noteNeighbors:  noteNeighbors,
    cardText:       cardText
  };

})(window);
