/* ============================================================
   app.js —— 页面渲染（把 api/data.js 的数据写进页面）
   ============================================================
   三个文件的分工（改东西时先看这里，就知道该动哪个）：
     index.html   = 页面骨架（只有结构，内容不写死）
     api/data.js  = 数据从哪来（阶段二换成云函数接口，只改这一个文件）
     app.js       = 数据怎么显示（就是本文件）

   第 2 步的范围：顶栏 + 首屏信息卡 + 页脚。
   第 3、4 步会往本文件后面追加：照片墙分列 / 灯箱 / 卡片流 / 详情页。
   ============================================================ */
(function () {
  'use strict';

  /* ---------- 0. 数据层没加载时，给一句能看懂的提示，而不是白屏 ---------- */
  var D = window.JaData;
  if (!D || typeof D.stats !== 'function') {
    var box0 = document.getElementById('about');
    if (box0) {
      box0.innerHTML = '<p style="font-size:14px;color:#B9BDC6;line-height:1.8">' +
        '内容加载失败：api/data.js 没有加载成功。<br>' +
        '请确认是用 http 地址打开本页，而不是双击文件用 file:// 打开。</p>';
    }
    return;
  }

  var S  = D.SITE;
  var st = D.stats();

  /* 小工具：按 id 填文字 */
  function text(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  /* ---------- 1. 信息卡文案（PRD §1.2 / §4.2） ---------- */
  text('brandName',    S.name);
  text('siteName',     S.name);
  text('siteSlogan',   S.slogan);
  text('siteSubtitle', S.subtitle);

  var intro = document.getElementById('siteIntro');
  if (intro) {
    intro.innerHTML = S.intro.map(function (line) {
      return '<p>' + line + '</p>';
    }).join('');
  }

  /* ---------- 2. 三个数字 + 最后更新于（PRD §4.2） ----------
     数字来自 api/data.js 的 stats()，是按数组实际条数算的，不是写死的 */
  var statsBox = document.getElementById('stats');
  if (statsBox) {
    statsBox.innerHTML =
      '<span><b>' + st.photos + '</b> 张照片</span><span>·</span>' +
      '<span><b>' + st.notes  + '</b> 篇笔记</span><span>·</span>' +
      '<span><b>' + st.days   + '</b> 天</span>';
  }
  text('lastUpdated', st.lastUpdated ? '最后更新于 ' + st.lastUpdated : '');

  /* ---------- 3. 联系方式 ----------
     PRD §5.2：点邮箱图标唤起邮件客户端，点 GitHub 图标打开仓库页 */
  var mail = document.getElementById('linkMail');
  if (mail) mail.href = 'mailto:' + S.email;
  var gh = document.getElementById('linkGithub');
  if (gh) gh.href = S.github;

  /* ---------- 4. 页脚 ---------- */
  text('footInfo', S.name + '　·　' + S.footerYear + '　·　' + S.email);

  /* ---------- 5. 顶栏：点导航高亮 + 滚动时自动跟着高亮 ---------- */
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('#nav a'));

  function markActive(hash) {
    navLinks.forEach(function (a) {
      a.classList.toggle('active', a.getAttribute('href') === hash);
    });
  }

  navLinks.forEach(function (a) {
    a.addEventListener('click', function () {
      markActive(a.getAttribute('href'));
    });
  });

  /* 点「关于」时给信息卡一次短暂高亮
     PRD §4.2：避免出现「点了没反应」的感觉 */
  var aboutLink = document.querySelector('#nav a[href="#about"]');
  var card      = document.getElementById('about');
  if (aboutLink && card) {
    aboutLink.addEventListener('click', function () {
      card.classList.add('flash');
      setTimeout(function () { card.classList.remove('flash'); }, 1200);
    });
  }

  /* 滚到哪个区块，顶栏就高亮哪一项。
     #about 在 #top 里面，不单独观察，否则两个会互相抢。 */
  var sections = navLinks
    .map(function (a) { return a.getAttribute('href').slice(1); })
    .filter(function (id) { return id !== 'about'; })
    .map(function (id) { return document.getElementById(id); })
    .filter(Boolean);

  if ('IntersectionObserver' in window && sections.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) markActive('#' + e.target.id);
      });
    }, { rootMargin: '-30% 0px -60% 0px' });
    sections.forEach(function (s) { io.observe(s); });
  }

  /* ============================================================
     6. 照片墙：瀑布流分列（PRD §4.4）
     ============================================================ */

  /* 分列依据（二选一，改这一个值就能切）：
       true  = 按「真实高度」累计 —— 符合 PRD §4.4 原文「当前累计高度较短的那一列」。
               两列列宽相同，所以"高度"等价于 (1 ÷ 宽高比)。
       false = 按「宽高比」本身累计 —— 与 homepage-mockup.html 里的写法一致。
               ⚠ 那个写法是反的：宽高比越大图越矮，累加它等于在比较"矮度"，
                 与 PRD 原文不符（这是我在移植时发现的一处模板 bug，没有跟抄）。
                 保留这个开关，只为万一你看过效果后更喜欢模板那种排法。 */
  var WATERFALL_BY_REAL_HEIGHT = true;

  /* 谁矮放谁 —— 这就是「错落」的来源 */
  function splitColumns(photos) {
    var cols = [[], []];
    var acc  = [0, 0];                       // 两列累计高度（以"每单位列宽的高度"计）

    photos.forEach(function (p, i) {
      var ratio = (p.w && p.h) ? (p.w / p.h) : 1;
      var h     = WATERFALL_BY_REAL_HEIGHT ? (1 / ratio) : ratio;
      var c     = (acc[0] <= acc[1]) ? 0 : 1;
      cols[c].push({ photo: p, index: i });
      acc[c] += h;
    });

    return cols;
  }

  function buildPhotoItem(item) {
    var p = item.photo;
    var a = document.createElement('a');
    a.className = 'photo';
    a.setAttribute('data-index', item.index);
    a.href = p.src;                              // 灯箱失效时点进去就是原图
    if (p.w && p.h) a.style.aspectRatio = p.w + ' / ' + p.h;  // 先占位，不等图片加载
    a.setAttribute('title', '点击放大');

    var img = document.createElement('img');
    img.src = p.src;
    img.alt = p.alt || '';                       // PRD §9.3：加载失败时显示 alt 文字
    img.setAttribute('loading', 'lazy');

    a.appendChild(img);
    return a;
  }

  var wall = document.getElementById('photoWall');

  if (wall) {
    var frag = document.createDocumentFragment();

    splitColumns(D.PHOTOS).forEach(function (list) {
      var col = document.createElement('div');
      col.className = 'col';
      list.forEach(function (item) { col.appendChild(buildPhotoItem(item)); });
      frag.appendChild(col);
    });

    wall.innerHTML = '';
    wall.appendChild(frag);
    wall.classList.remove('no-js');
    text('photoCount', '共 ' + D.PHOTOS.length + ' 张　·　点击放大');
  }

  /* ============================================================
     7. 照片灯箱（PRD §4.4：页面内放大 · 左右切换 · 点任意处关闭）
     ============================================================ */
  var lb = document.getElementById('lightbox');

  if (lb && wall && D.PHOTOS.length) {
    var lbImg = document.getElementById('lbImg');
    var lbCap = document.getElementById('lbCap');
    var total = D.PHOTOS.length;
    var cur   = 0;

    function showPhoto(i) {
      cur = ((i % total) + total) % total;       // 到头了绕回另一头
      var p = D.PHOTOS[cur];
      lbImg.src = p.src;
      lbImg.alt = p.alt || '';
      lbCap.textContent = (cur + 1) + ' / ' + total;
      lb.hidden = false;
      document.body.classList.add('lb-open');
    }

    function closeLightbox() {
      lb.hidden = true;
      document.body.classList.remove('lb-open');
    }

    wall.addEventListener('click', function (e) {
      var a = (e.target && e.target.closest) ? e.target.closest('a.photo') : null;
      if (!a) return;
      e.preventDefault();
      showPhoto(parseInt(a.getAttribute('data-index'), 10) || 0);
    });

    document.getElementById('lbPrev').addEventListener('click', function (e) {
      e.stopPropagation();                       // 别让"点任意处关闭"把翻页也吃掉
      showPhoto(cur - 1);
    });
    document.getElementById('lbNext').addEventListener('click', function (e) {
      e.stopPropagation();
      showPhoto(cur + 1);
    });
    document.getElementById('lbClose').addEventListener('click', function (e) {
      e.stopPropagation();
      closeLightbox();
    });

    lb.addEventListener('click', closeLightbox); /* 点任意处关闭 */

    /* 桌面端顺手支持键盘：← → 翻页、Esc 关闭（PRD §7.4 桌面优先） */
    document.addEventListener('keydown', function (e) {
      if (lb.hidden) return;
      if (e.key === 'Escape')     closeLightbox();
      if (e.key === 'ArrowLeft')  showPhoto(cur - 1);
      if (e.key === 'ArrowRight') showPhoto(cur + 1);
    });
  }

  /* ============================================================
     8. 记录卡片流：2 列 · 时间倒序（PRD §4.3）
     ============================================================ */

  function buildCard(p) {
    var isNote = (p.type === 'note');

    /* 笔记卡 → <a>，点进去是详情页；感悟卡 → <article>，不可点（PRD §4.3） */
    var card = document.createElement(isNote ? 'a' : 'article');
    card.className = 'card ' + (isNote ? 'note' : 'thought');
    if (isNote) card.href = 'note.html?id=' + encodeURIComponent(p.id);

    if (p.cover) {                                   /* 封面：可选 */
      var cov = document.createElement('div');
      cov.className = 'cover';
      var covImg = document.createElement('img');
      covImg.src = p.cover;
      covImg.alt = isNote ? (p.title || '') : '感悟配图';
      covImg.setAttribute('loading', 'lazy');
      cov.appendChild(covImg);
      card.appendChild(cov);
    }

    var body = document.createElement('div');
    body.className = 'card-body';

    var tagline = document.createElement('div');
    tagline.className = 'tagline';
    var tagEl = document.createElement('span');
    tagEl.className = 'tag' + (isNote ? '' : ' plain');   /* 感悟用浅色标签区分 */
    tagEl.textContent = isNote ? '笔记' : '感悟';
    var dateEl = document.createElement('span');
    dateEl.className = 't-min';
    dateEl.textContent = p.date;
    tagline.appendChild(tagEl);
    tagline.appendChild(dateEl);
    body.appendChild(tagline);

    if (isNote && p.title) {                         /* 感悟允许没有标题 */
      var h3 = document.createElement('h3');
      h3.textContent = p.title;
      body.appendChild(h3);
    }

    /* 卡片上的文字：笔记 = 摘要，感悟 = 全文
       （2026-09-28 Jack 定：卡片必须有正文摘要，参照 homepage-mockup.html） */
    var summary = document.createElement('div');
    summary.className = 'summary';
    D.cardText(p).forEach(function (line) {
      var lineEl = document.createElement('p');
      lineEl.textContent = line;
      summary.appendChild(lineEl);
    });
    body.appendChild(summary);

    card.appendChild(body);
    return card;
  }

  var flow = document.getElementById('cardFlow');

  if (flow) {
    var flowFrag = document.createDocumentFragment();
    D.feed().forEach(function (p) { flowFrag.appendChild(buildCard(p)); });
    flow.innerHTML = '';
    flow.appendChild(flowFrag);

    var nMoment = D.POSTS.filter(function (p) { return p.type === 'moment'; }).length;
    text('recordCount', '笔记 ' + D.notes().length + ' 篇　·　感悟 ' + nMoment + ' 条　·　按时间倒序');
  }

  /* ============================================================
     9. 笔记详情页（PRD §4.5 / §9.1）
     同一个 app.js 也管这个页面：note.html 里放了 #postRoot 就会走这一段。
     阶段一是静态页，所以用 note.html?id=xx 代替 PRD §4.1 写的 /notes/:id；
     阶段二换成 React 路由时，这里才真正变成 /notes/:id。
     ============================================================ */

  function navLink(post, prefix) {
    var a = document.createElement('a');
    a.href = 'note.html?id=' + encodeURIComponent(post.id);
    a.textContent = prefix + post.title;
    return a;
  }

  function navSpacer() {                             /* 缺一边时占位，保持另一边贴右 */
    var s = document.createElement('span');
    s.className = 'ph';
    s.textContent = '占位';
    return s;
  }

  function renderPost(root, id) {
    var post = D.noteById(id);
    var frag = document.createDocumentFragment();

    /* 返回首页（PRD §5.2：详情页必须有返回链接，且能点回） */
    var back = document.createElement('a');
    back.className = 'back';
    back.href = 'index.html';
    back.textContent = '← 返回首页';
    frag.appendChild(back);

    if (!post) {
      var miss = document.createElement('p');
      miss.className = 'post-empty';
      miss.textContent = '没有找到这篇笔记（id = ' + (id || '空') +
                         '）。链接可能过期了，回首页看看别的吧。';
      frag.appendChild(miss);                    /* ← 2026-09-28 修：这句之前漏了，
                                                     导致空态只剩返回链接、没有提示文字 */
      root.innerHTML = '';
      root.appendChild(frag);
      return;
    }

    if (post.cover) {                                /* 封面可选，没有就整段省掉 */
      var cover = document.createElement('img');
      cover.className = 'post-cover';
      cover.src = post.cover;
      cover.alt = post.title || '';
      frag.appendChild(cover);
    }

    var h1 = document.createElement('h1');
    h1.textContent = post.title;                     /* 笔记必须有标题（PRD §4.3） */
    frag.appendChild(h1);

    var meta = document.createElement('div');
    meta.className = 'post-meta';
    var tagEl = document.createElement('span');
    tagEl.className = 'tag';
    tagEl.textContent = '笔记';
    var dateEl = document.createElement('span');
    dateEl.className = 't-min';
    dateEl.textContent = post.date;
    meta.appendChild(tagEl);
    meta.appendChild(dateEl);
    frag.appendChild(meta);

    var body = document.createElement('div');
    body.className = 'post-body';
    (post.body || []).forEach(function (item) {
      if (typeof item === 'string') {
        var pEl = document.createElement('p');
        pEl.textContent = item;
        body.appendChild(pEl);
      } else if (item && item.img) {                 /* 正文插图，统一 4:3（PRD §4.6） */
        var img = document.createElement('img');
        img.src = item.img;
        img.alt = item.alt || '';
        img.setAttribute('loading', 'lazy');
        body.appendChild(img);
      }
    });
    frag.appendChild(body);

    /* 上一篇 / 下一篇：只在笔记之间跳（PRD §9.8）
       第一篇无上一篇、最后一篇无下一篇（PRD §5.2） */
    var nb  = D.noteNeighbors(post.id);
    var nav = document.createElement('nav');
    nav.className = 'post-nav';
    nav.appendChild(nb.prev ? navLink(nb.prev, '上一篇：') : navSpacer());
    nav.appendChild(nb.next ? navLink(nb.next, '下一篇：') : navSpacer());
    frag.appendChild(nav);

    root.innerHTML = '';
    root.appendChild(frag);

    if (typeof document.title === 'string') document.title = post.title + ' · Ja的小屋';
  }

  var postRoot = document.getElementById('postRoot');

  if (postRoot) {
    /* 从 ?id=xx 里取出要显示哪一篇（阶段一的静态做法，见上面说明） */
    var qs = {};
    String((window.location && window.location.search) || '')
      .replace(/^\?/, '')
      .split('&')
      .forEach(function (kv) {
        if (!kv) return;
        var i = kv.indexOf('=');
        var k = i < 0 ? kv : kv.slice(0, i);
        var v = i < 0 ? '' : kv.slice(i + 1);
        qs[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
      });

    renderPost(postRoot, qs.id);
  }
})();
