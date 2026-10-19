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

  /* 2026-10-18 新增：纯白简介板块（#intro）——与 hero 同一文案来源，改 data.js 即同步 */
  text('introName',     S.name);
  text('introSlogan',   S.slogan);
  text('introSubtitle', S.subtitle);
  var introWhite = document.getElementById('introText');
  if (introWhite) {
    introWhite.innerHTML = S.intro.map(function (line) {
      return '<p>' + line + '</p>';
    }).join('');
  }

  /* 2026-10-18：首屏 TechText 第二行「ROVER」——文本取自 SITE.name 转大写，
     与站点名保持单一来源（tech-text.js 在 app.js 之后加载，读的就是这里写入的值） */
  var ttBrand = document.getElementById('ttBrand');
  if (ttBrand) ttBrand.setAttribute('data-text', String(S.name || 'Rover').toUpperCase());

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

  function markActive(href) {
    navLinks.forEach(function (a) {
      a.classList.toggle('active', a.getAttribute('href') === href);
    });
  }

  navLinks.forEach(function (a) {
    a.addEventListener('click', function () {
      markActive(a.getAttribute('href'));
    });
  });

  /* 点「关于」时给信息卡一次短暂高亮
     PRD §4.2：避免出现「点了没反应」的感觉。
     【v1.11】「关于」已独立成 about.html —— 锚点高亮逻辑只在页面里
     同时存在 #nav 的 #about 链接和 #about 元素时才生效（老页面兜底）。 */
  var aboutLink = document.querySelector('#nav a[href="#about"]');
  var card      = document.getElementById('about');
  if (aboutLink && card) {
    aboutLink.addEventListener('click', function () {
      card.classList.add('flash');
      setTimeout(function () { card.classList.remove('flash'); }, 1200);
    });
  }

  /* 滚到哪个区块，顶栏就高亮哪一项。
     【v1.11】导航项已是页面跳转（photos.html 等），只有以 '#' 开头的
     锚点链接参与滚动高亮；页面跳转链接直接跳过。 */
  var sections = navLinks
    .map(function (a) { return a.getAttribute('href') || ''; })
    .filter(function (h) { return h.charAt(0) === '#' && h.slice(1) !== 'about'; })
    .map(function (h) { return document.getElementById(h.slice(1)); })
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
     5b. 首页板块入口卡（PRD §4.2，v1.11 新增；Day 8 改四态）
     首页不再内嵌板块内容，改为四张入口卡（数据来自 D.ENTRIES）。
     取数走 entriesAsync（模拟网络），因此具备四种状态：
       加载中（骨架）/ 成功（四张卡）/ 空（ENTRIES 为空）/ 错误（重试）
     演示：index.html?demo=slow / empty / error（与记录区同一套开关）。
     setRegionState 在本文件第 8 节定义（函数声明提升，先调用没问题）。
     ============================================================ */
  var entriesRegion = document.getElementById('entriesRegion');
  if (entriesRegion) {
    var entryGrid = document.getElementById('entryGrid');

    function renderEntryCards(list) {
      var efrag = document.createDocumentFragment();
      list.forEach(function (it) {
        var a = document.createElement('a');
        a.className = 'entry-card';
        a.setAttribute('href', it.href);

        var no = document.createElement('span');
        no.className = 'entry-no t-min';
        no.textContent = it.no;

        var h3 = document.createElement('h3');
        h3.textContent = it.title;

        var p = document.createElement('p');
        p.className = 't-min';
        p.textContent = it.desc;

        var arrow = document.createElement('span');
        arrow.className = 'entry-arrow';
        arrow.textContent = '→';

        a.appendChild(no);
        a.appendChild(h3);
        a.appendChild(p);
        a.appendChild(arrow);
        efrag.appendChild(a);
      });
      entryGrid.innerHTML = '';
      entryGrid.appendChild(efrag);
    }

    function loadEntries() {
      setRegionState(entriesRegion, 'loading');
      D.entriesAsync().then(function (list) {
        if (!list || !list.length) { setRegionState(entriesRegion, 'empty'); return; }
        renderEntryCards(list);
        setRegionState(entriesRegion, 'done');
      }).catch(function () {
        setRegionState(entriesRegion, 'error');
      });
    }

    var entriesRetry = document.getElementById('entriesRetry');
    if (entriesRetry) entriesRetry.addEventListener('click', loadEntries);

    loadEntries();
  }

  /* ============================================================
     5c. 主题切换已下线（2026-10-19 Jack 要求删除按钮与相关逻辑）
     ------------------------------------------------------------
     · 原「浅色（天空）↔ 深色（夜云）」按钮已从 index.html 移除；
     · index.html <head> 里的无闪烁脚本同步删除；
     · 站点固定浅色，styles.css 中 .theme-btn 规则已清理。
     · html[data-theme="dark"] 的变量块暂留（不影响浅色渲染），
       如确定永不再用可一并删除。
     ============================================================ */

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

  /* 谁矮放谁 —— 这就是「错落」的来源。
     offset：本组照片在「拍平表」里的起始序号（灯箱跨组翻页要用全局序号） */
  function splitColumns(photos, offset) {
    var base = offset || 0;
    var cols = [[], []];
    var acc  = [0, 0];                       // 两列累计高度（以"每单位列宽的高度"计）

    photos.forEach(function (p, i) {
      var ratio = (p.w && p.h) ? (p.w / p.h) : 1;
      var h     = WATERFALL_BY_REAL_HEIGHT ? (1 / ratio) : ratio;
      var c     = (acc[0] <= acc[1]) ? 0 : 1;
      cols[c].push({ photo: p, index: base + i });
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
    if (!D.PHOTOS.length) {
      /* photos 为空（素材被删 / 尚未接入）—— 显示空态，不是留白。
         样式与记录区空态同一套语言（.ph-empty）。 */
      wall.innerHTML = '';
      wall.classList.remove('no-js');
      wall.classList.add('ph-empty');
      var phEmpty = document.createElement('p');
      phEmpty.className = 't-min';
      phEmpty.setAttribute('role', 'status');
      phEmpty.textContent = '照片墙还是空的 —— 新照片拍好后会出现在这里。';
      wall.appendChild(phEmpty);
      text('photoCount', '共 0 张');
    } else {
      /* 【v1.12】三组渲染：每组 = 组标题（名称 + 张数）+ 一条独立瀑布流。
         灯箱序号走「拍平表」（D.PHOTOS，组序 × 组内序），跨组连续翻页。 */
      var frag = document.createDocumentFragment();
      var offset = 0;

      D.PHOTO_GROUPS.forEach(function (g) {
        var block = document.createElement('div');
        block.className = 'pgroup';
        block.setAttribute('data-group', g.id);

        var head = document.createElement('div');
        head.className = 'pgroup-head';
        var h3 = document.createElement('h3');
        h3.textContent = g.name;
        var cnt = document.createElement('span');
        cnt.className = 'count t-min';
        cnt.textContent = g.photos.length + ' 张';
        head.appendChild(h3);
        head.appendChild(cnt);
        block.appendChild(head);

        var grid = document.createElement('div');
        grid.className = 'photos';
        splitColumns(g.photos, offset).forEach(function (list) {
          var col = document.createElement('div');
          col.className = 'col';
          list.forEach(function (item) { col.appendChild(buildPhotoItem(item)); });
          grid.appendChild(col);
        });
        block.appendChild(grid);

        offset += g.photos.length;
        frag.appendChild(block);
      });

      wall.innerHTML = '';
      wall.appendChild(frag);
      wall.classList.remove('no-js');
      text('photoCount', '共 ' + D.PHOTOS.length + ' 张　·　点击放大');
    }
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
    card.setAttribute('data-id', p.id);   /* Day 12 筛选用：DOM 反查数据条目 */
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

  /* ---- Day 13：四态辅助 —— 状态挂在区域容器的 class 上，CSS 据此显隐 ----
     state-loading 骨架占位 · state-empty 数据为空 · state-error 取数失败 · state-done 正常
     加载 / 空 / 错误三种状态下 CSS 会隐藏筛选条（没有数据，筛选没有意义）。 */
  function setRegionState(region, state) {
    if (!region) return;
    region.classList.remove('state-loading', 'state-empty', 'state-error', 'state-done');
    region.classList.add('state-' + state);
  }

  var flow = document.getElementById('cardFlow');
  var feedSection = document.getElementById('notes');
  var filterInited = false;

  function renderFeedCards(list) {
    var frag = document.createDocumentFragment();
    list.forEach(function (p) { frag.appendChild(buildCard(p)); });
    flow.innerHTML = '';
    flow.appendChild(frag);
    var nMoment = D.POSTS.filter(function (p) { return p.type === 'moment'; }).length;
    text('recordCount', '笔记 ' + D.notes().length + ' 篇　·　感悟 ' + nMoment + ' 条　·　按时间倒序');
  }

  /* Day 13：取数走 feedAsync（模拟网络），页面按 加载 → 空/错误/正常 呈现。
     筛选（第 14 节）等到卡片真正渲染完成才初始化一次；重试成功后走同一条路。 */
  function loadFeed() {
    if (!flow) return;
    setRegionState(feedSection, 'loading');
    D.feedAsync().then(function (list) {
      if (!list || !list.length) { setRegionState(feedSection, 'empty'); return; }
      renderFeedCards(list);
      setRegionState(feedSection, 'done');
      if (!filterInited) { filterInited = true; initFilter(); }
    }).catch(function () {
      setRegionState(feedSection, 'error');
    });
  }

  if (flow) {
    loadFeed();
    var feedRetry = document.getElementById('feedRetry');
    if (feedRetry) feedRetry.addEventListener('click', loadFeed);
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

    if (typeof document.title === 'string') document.title = post.title + ' · ' + S.name;
  }

  var postRoot = document.getElementById('postRoot');

  /* ---------- 5.1 顶栏渐显（Prisma 式：导航先融进首屏，离开才浮出）----------
     2026-09-29：首屏改满屏 hero 后，顶栏默认透明；滚动超过约 80% 屏高
     （即离开首屏）才加 body.scrolled，由 CSS 浮出毛玻璃底与下边框。
     防御：老浏览器 / 微信内置浏览器若没有滚动事件支持，就直接加上
     scrolled，保证顶栏始终有一层底、文字不会读不清。 */
  (function () {
    if (!window.addEventListener) { document.body.classList.add('scrolled'); return; }

    var last = -1;
    function onScroll() {
      var h = window.innerHeight || document.documentElement.clientHeight || 800;
      var y = window.pageYOffset ||
              (document.documentElement && document.documentElement.scrollTop) || 0;
      var want = y > h * 0.8;
      if (want === last) return;          /* 只在状态翻转时改 DOM，不每帧写 */
      last = want;
      document.body.classList.toggle('scrolled', want);
    }
    window.addEventListener('scroll', onScroll, false);
    onScroll();
  })();

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

  /* ============================================================
     10. 入场动效（Prisma 皮肤 · 2026-09-29）
     ============================================================
     三种手法（样式都在 styles.css 末尾「Prisma 皮肤」块里）：
       .wpu  站点名逐字浮起（外层 overflow 隐藏，字从下面升上来）
       .scr  自我介绍由暗渐亮
       .rise 照片 / 卡片进入视口时轻轻上浮

     两个防御：
       · 用户开了「减少动态效果」（prefers-reduced-motion）→ 整段跳过，
         元素保持原样显示（CSS 里也有同款降级，双保险）。
       · 老浏览器没有 IntersectionObserver → 不加任何入场类，直接全亮。

     一个必须做的收尾：
       .rise 的 transition 会压住 .photo / .card 自己的 hover 过渡，
       所以入场动画播完后要把类名移除、延迟清掉，把 hover 还回去。 */

  var reducedMotion = false;
  try {
    reducedMotion = !!(window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch (err) { reducedMotion = false; }

  if (!reducedMotion) {

    /* requestAnimationFrame 兜底：老浏览器用 setTimeout 代替 */
    var raf = (typeof window.requestAnimationFrame === 'function')
      ? function (fn) { window.requestAnimationFrame(fn); }
      : function (fn) { setTimeout(fn, 16); };

    /* ---- 10.1 站点名逐字浮起（仅首页有 #siteName） ---- */
    var nameEl = document.getElementById('siteName');
    if (nameEl && nameEl.textContent) {
      var chars = nameEl.textContent;
      var wfrag = document.createDocumentFragment();
      nameEl.textContent = '';
      for (var ci = 0; ci < chars.length; ci++) {
        var wrap = document.createElement('span');
        wrap.className = 'wpu';
        var sp = document.createElement('span');
        sp.textContent = chars.charAt(ci);
        sp.style.transitionDelay = (ci * 70) + 'ms';   /* 一字比一字晚 70ms */
        wrap.appendChild(sp);
        wfrag.appendChild(wrap);
      }
      nameEl.appendChild(wfrag);
      /* 双 rAF：等浏览器先把「初始位置」画出来，再加 .on 触发动画 */
      raf(function () {
        raf(function () {
          var ws = nameEl.querySelectorAll('.wpu');
          for (var wi = 0; wi < ws.length; wi++) ws[wi].classList.add('on');
        });
      });
    }

    /* ---- 10.2 自我介绍渐亮 + 10.3 照片 / 卡片上浮 ---- */
    var animEls = [];

    var introEl = document.getElementById('siteIntro');
    if (introEl) {
      introEl.classList.add('scr');
      animEls.push(introEl);
    }

    var riseItems = [];
    var q1 = document.querySelectorAll('.card');
    var q2 = document.querySelectorAll('.photo');
    var q3 = document.querySelectorAll('.sec-head');   /* 区块头也一起浮起（深度版） */
    for (var qi = 0; qi < q1.length; qi++) riseItems.push(q1[qi]);
    for (var qj = 0; qj < q2.length; qj++) riseItems.push(q2[qj]);
    for (var qk = 0; qk < q3.length; qk++) riseItems.push(q3[qk]);

    for (var ri = 0; ri < riseItems.length; ri++) {
      riseItems[ri].classList.add('rise');
      /* 同一屏里的卡片错开 60ms，不会齐刷刷一起动 */
      riseItems[ri].style.transitionDelay = ((ri % 6) * 60) + 'ms';
      animEls.push(riseItems[ri]);
    }

    if ('IntersectionObserver' in window && animEls.length) {
      var ioAnim = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          ioAnim.unobserve(e.target);
          var el = e.target;
          el.classList.add('in');
          /* 播完动画就摘掉类名、清掉延迟，把 hover 过渡还给照片和卡片 */
          var d = parseInt(el.style.transitionDelay, 10) || 0;
          setTimeout(function () {
            el.classList.remove('rise');
            el.classList.remove('scr');
            el.classList.remove('in');
            el.style.transitionDelay = '';
          }, 800 + d);
        });
      }, { threshold: 0.12 });
      animEls.forEach(function (el) { ioAnim.observe(el); });
    } else {
      /* 没有 IO：不玩入场，直接全亮 */
      animEls.forEach(function (el) {
        el.classList.remove('rise');
        el.classList.remove('scr');
        el.style.transitionDelay = '';
      });
    }
  }

  /* ============================================================
     11. 首屏标题：液态烟雾扰动（2026-10-05 · gpc 参考复刻）
     ============================================================
     参考图里 "Applied" 的字母被一小团烟雾状涡流"溶开"：
     底层文字始终清晰锐利，只有鼠标附近一小块区域出现
     位移 / 拉伸 / 重影 / 雾化；鼠标走后留短暂残影再衰减。

     做法（不改变标题的位置、字号、字体和排版）：
       · 真实 <h1> 留在原处（布局、选中、SEO 都不动），激活后
         把它的颜色设为透明，视觉交给叠在上面的同尺寸 canvas；
       · canvas 用与 h1 相同的字体画出标题（= 清晰底层），再叠加：
         ① 多层重影：取最近几帧鼠标位置各画一份标题，透明度递减、
            逐层加 blur → ghosting / motion trail；
         ② 位移：每层叠加随时间流动的噪声偏移 + 速度拖尾，
            文字边缘出现拉伸错位（不只是 blur）；
         ③ 遮罩：径向渐变 + 可平铺噪声"侵蚀"出柔和烟雾边，
            重影只在遮罩内可见 → 局部生效、边缘不规则；
         ④ 蚀刻：在扰动核心把清晰层轻轻"溶"掉一点，露出重影。
       · 强度由鼠标速度门控：静止时完全清晰（克制），
         移动时出现，停下后约半秒衰减消失。

     防御：无 canvas / 触屏 / 窄屏 / 减少动态效果 / 老浏览器
     → 整段跳过，标题保持原生文字；出错也只回退，不碰页面其余部分。 */

  (function () {
    var h1 = document.getElementById('siteName');
    if (!h1 || reducedMotion) return;

    var started = false;
    var rafId = 0;

    function restoreH1() {
      try {
        h1.style.color = '';
        h1.style.textShadow = '';
        var bad = document.getElementById('titleFxCanvas');
        if (bad && bad.parentNode) bad.parentNode.removeChild(bad);
      } catch (err2) { /* 忽略 */ }
    }

    try {

      /* ---- 能力检测（在最小 DOM 检查台里跑 app.js 时，这里会安全退出）---- */
      var probe = document.createElement('canvas');
      if (!probe.getContext || !probe.getContext('2d')) return;

      var fine = null;
      try {
        fine = window.matchMedia
          ? window.matchMedia('(min-width: 901px) and (pointer: fine)')
          : null;
      } catch (errM) { fine = null; }
      if (fine && !fine.matches) return;          /* 触屏 / 窄屏：不启用 */

      /* ---- 可平铺 fbm 噪声（液态感的唯一来源，零依赖离线可跑）---- */
      var perm = new Uint8Array(512);
      (function seed() {
        var s = 20261005, tmp, j, k;
        var p = [];
        for (var i = 0; i < 256; i++) p.push(i);
        for (j = 255; j > 0; j--) {
          k = Math.floor((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296 * (j + 1));
          tmp = p[j]; p[j] = p[k]; p[k] = tmp;
        }
        for (var m2 = 0; m2 < 512; m2++) perm[m2] = p[m2 & 255];
      })();

      function vnoise(x, y) {
        var X = Math.floor(x), Y = Math.floor(y);
        var fx = x - X, fy = y - Y;
        var u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
        var X0 = X & 255, Y0 = Y & 255, X1 = (X + 1) & 255, Y1 = (Y + 1) & 255;
        var a = perm[X0 + perm[Y0]], b = perm[X1 + perm[Y0]];
        var c = perm[X0 + perm[Y1]], d = perm[X1 + perm[Y1]];
        return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) / 255;
      }
      function fbm(x, y) {
        return vnoise(x, y) * 0.55 +
               vnoise(x * 2.13 + 37.7, y * 2.13 + 11.3) * 0.28 +
               vnoise(x * 4.31 + 91.1, y * 4.31 + 7.7) * 0.17;
      }
      /* 四向无缝化，噪声贴图平铺时看不到接缝 */
      function tileFbm(x, y, P) {
        return (fbm(x, y) * (P - x) * (P - y) +
                fbm(x + P, y) * x * (P - y) +
                fbm(x, y + P) * (P - x) * y +
                fbm(x + P, y + P) * x * y) / (P * P);
      }

      /* ---- 噪声侵蚀贴图（白色 + alpha 噪声，供 destination-out 啃边用）---- */
      var NZ = 256;
      var noiseCv = document.createElement('canvas');
      noiseCv.width = NZ; noiseCv.height = NZ;
      (function paintNoise() {
        var nc = noiseCv.getContext('2d');
        var img = nc.createImageData(NZ, NZ);
        var P = 4;
        for (var y = 0; y < NZ; y++) {
          for (var x = 0; x < NZ; x++) {
            var v = tileFbm(x / NZ * P, y / NZ * P, P);
            var a = Math.max(0, Math.min(1, (v - 0.34) / 0.38));
            var o = (y * NZ + x) * 4;
            img.data[o] = 255; img.data[o + 1] = 255; img.data[o + 2] = 255;
            img.data[o + 3] = Math.round(a * 235);
          }
        }
        nc.putImageData(img, 0, 0);
      })();

      /* ---- 等两件事：字体就绪 + 入场动画播完，再无缝接管 ---- */
      var fontsReady = false, entranceDone = false, kicked = false;
      function tryStart() {
        if (kicked || !fontsReady || !entranceDone) return;
        kicked = true;
        activate();
      }
      if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
        document.fonts.ready.then(function () { fontsReady = true; tryStart(); });
        setTimeout(function () { fontsReady = true; tryStart(); }, 2500);
      } else {
        fontsReady = true;
      }
      setTimeout(function () { entranceDone = true; tryStart(); }, 1500);

      /* ================================================================
         activate：建 canvas、量字、渲染清晰底层、跑扰动循环
         ================================================================ */
      function activate() {
        if (started) return;
        started = true;

        var cs = window.getComputedStyle ? getComputedStyle(h1) : null;
        var baseFs = cs ? parseFloat(cs.fontSize) || 120 : 120;
        var family = cs ? cs.fontFamily : 'serif';
        var weight = cs ? cs.fontWeight : '400';
        var color  = cs ? cs.color : '#101418';
        var lsBase = cs ? (parseFloat(cs.letterSpacing) || 0) : 0;

        /* 标题被 10.1 拆成了逐字 span —— 从 span 里把原文字拼回来 */
        var text = '';
        var spans = h1.querySelectorAll('.wpu > span');
        if (spans.length) {
          for (var i = 0; i < spans.length; i++) text += spans[i].textContent;
        } else {
          text = h1.textContent || '';
        }
        if (!text) { started = false; return; }

        var rect = h1.getBoundingClientRect ? h1.getBoundingClientRect() : null;
        if (!rect || !rect.width || !rect.height) { started = false; return; }

        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        var W = 0, H = 0, fs = baseFs, lsPx = 0;
        var widths = [];
        var Wl = 0, Hl = 0;

        var mcv = document.createElement('canvas');
        var mctx = mcv.getContext('2d');

        /* 量字：字号超出盒子就往回缩，防极端视口溢出 */
        function measure() {
          mctx.font = weight + ' ' + fs + 'px ' + family;
          widths = [];
          var total = 0;
          for (var c = 0; c < text.length; c++) {
            var w = mctx.measureText(text.charAt(c)).width;
            widths.push(w);
            total += w + (c ? lsPx : 0);
          }
          return total;
        }

        var master = document.createElement('canvas');
        var maskCv = document.createElement('canvas');
        var ghostCv = document.createElement('canvas');
        var cv = document.createElement('canvas');
        cv.id = 'titleFxCanvas';
        cv.setAttribute('aria-hidden', 'true');
        cv.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;';

        var ctx, mctx2, gctx;

        /* 布局：读一次盒子尺寸 → 四块 canvas 全部重铺（activate 和窗口变化共用） */
        function layout() {
          rect = h1.getBoundingClientRect();
          W = rect.width; H = rect.height;
          Wl = W; Hl = H;
          /* 字号是 clamp(vw/vh) 响应式的 —— 每次重铺都重读，不能用激活时的旧值 */
          var cs2 = window.getComputedStyle ? getComputedStyle(h1) : null;
          if (cs2) {
            baseFs = parseFloat(cs2.fontSize) || baseFs;
            lsBase = parseFloat(cs2.letterSpacing) || 0;
          }
          fs = baseFs; lsPx = lsBase;

          mcv.width = 8; mcv.height = 8;
          mctx = mcv.getContext('2d');
          var guard = 0;
          while (measure() > W - 2 && fs > 40 && guard++ < 24) {
            fs *= 0.96;
            lsPx = lsBase * (fs / baseFs);
          }

          master.width = maskCv.width = ghostCv.width = cv.width = Math.round(W * dpr);
          master.height = maskCv.height = ghostCv.height = cv.height = Math.round(H * dpr);

          var mm = master.getContext('2d');
          mm.scale(dpr, dpr);
          mm.font = weight + ' ' + fs + 'px ' + family;
          mm.fillStyle = color;
          mm.shadowColor = 'rgba(21, 48, 84, 0.14)';
          mm.shadowBlur = fs * 0.3;
          mm.shadowOffsetY = fs * 0.04;
          mm.textBaseline = 'alphabetic';
          var met = mm.measureText(text);
          var asc = (met.actualBoundingBoxAscent != null) ? met.actualBoundingBoxAscent : fs * 0.78;
          var desc = (met.actualBoundingBoxDescent != null) ? met.actualBoundingBoxDescent : fs * 0.06;
          var baseY = (H + asc - desc) / 2;
          var x0 = 0;
          for (var ci = 0; ci < text.length; ci++) {   /* 逐字画：自己实现字距，兼容性最好 */
            mm.fillText(text.charAt(ci), x0, baseY);
            x0 += widths[ci] + lsPx;
          }

          ctx = cv.getContext('2d');
          mctx2 = maskCv.getContext('2d');
          gctx = ghostCv.getContext('2d');
          ctx.scale(dpr, dpr); mctx2.scale(dpr, dpr); gctx.scale(dpr, dpr);
          clean = false;
        }

        if (!h1.style.position) h1.style.position = 'relative';
        h1.style.color = 'transparent';        /* 视觉交给 canvas，布局原地不动 */
        h1.style.textShadow = 'none';
        h1.appendChild(cv);
        layout();

        var filterOK = ('filter' in gctx);

        /* ---- 输入：鼠标在首屏内移动（蒙版可以探出标题盒，"附近"也生效）---- */
        var hero = h1.closest ? (h1.closest('section') || document.body) : document.body;
        var tx = 0, ty = 0, hasMouse = false, firstMove = true;
        var smx = 0, smy = 0, mxp = 0, myp = 0, spd = 0, I = 0, prevI = 0;
        var clean = false;
        var bornAt = 0;
        var trail = [];

        hero.addEventListener('mousemove', function (e) {
          var r = cv.getBoundingClientRect();
          tx = e.clientX - r.left;
          ty = e.clientY - r.top;
          if (firstMove) { smx = tx; smy = ty; mxp = smx; myp = smy; firstMove = false; }
          hasMouse = true;
        });
        hero.addEventListener('mouseleave', function () { hasMouse = false; });

        /* 滚出首屏就歇着，不白烧帧 */
        var visible = true;
        if ('IntersectionObserver' in window) {
          visible = false;
          new IntersectionObserver(function (es) {
            for (var i = 0; i < es.length; i++) visible = es[i].isIntersecting;
          }, { threshold: 0 }).observe(cv);
        }

        /* 噪声贴图平铺啃边（漂移 = 烟雾在动） */
        function drawTiledNoise(c, off, z, alpha) {
          c.save();
          c.globalAlpha = alpha;
          var s = NZ * z;
          var ox = -(off % s), oy = -((off * 0.6) % s);
          for (var yy = oy; yy < Hl; yy += s) {
            for (var xx = ox; xx < Wl; xx += s) {
              c.drawImage(noiseCv, xx, yy, s, s);
            }
          }
          c.restore();
        }

        /* 从轨迹里取 lag 毫秒前的位置 → 重影拖尾 */
        function trailAt(t) {
          if (!trail.length) return { x: smx, y: smy };
          for (var i = trail.length - 1; i >= 0; i--) {
            if (trail[i].t <= t || i === 0) return trail[i];
          }
          return trail[0];
        }

        var raf = (typeof window.requestAnimationFrame === 'function')
          ? function (fn) { return window.requestAnimationFrame(fn); }
          : function (fn) { setTimeout(function () { fn(Date.now()); }, 16); return 0; };

        var GA = [0.42, 0.3, 0.2, 0.12];       /* 四层重影的透明度档 */

        function frame(now) {
          if (!started) return;
          rafId = raf(frame);
          if (!visible) return;

          /* 接管淡入：和入场动画做无缝交接 */
          var appear = Math.min(1, (now - bornAt) / 450);

          /* 平滑跟随 + 速度门控（静止 → 完全清晰）*/
          if (hasMouse) {
            smx += (tx - smx) * 0.22;
            smy += (ty - smy) * 0.22;
          }
          var vx = smx - mxp, vy = smy - myp;
          mxp = smx; myp = smy;
          spd += (Math.sqrt(vx * vx + vy * vy) - spd) * 0.16;
          var target = hasMouse ? Math.min(1, spd / 9) : 0;
          I += (target - I) * (target > I ? 0.3 : 0.08);   /* 起得快退得慢 → 短残影 */

          if (hasMouse) {
            trail.push({ x: smx, y: smy, t: now });
            if (trail.length > 40) trail.shift();
          }
          while (trail.length && now - trail[0].t > 520) trail.shift();

          /* 完全静止：只画一次清晰底层，然后零开销待机 */
          if (I < 0.004) {
            if (!clean || appear < 1) {
              ctx.globalCompositeOperation = 'source-over';
              ctx.globalAlpha = appear;
              ctx.clearRect(0, 0, Wl, Hl);
              ctx.drawImage(master, 0, 0, Wl, Hl);
              ctx.globalAlpha = 1;
              clean = appear >= 1;
            }
            prevI = I;
            return;
          }
          clean = false;

          /* ---- 遮罩：径向渐变 + 两层漂移噪声侵蚀 → 柔和烟雾边 ---- */
          mctx2.clearRect(0, 0, Wl, Hl);
          var R = fs * 1.12;
          var g = mctx2.createRadialGradient(smx, smy, R * 0.12, smx, smy, R);
          g.addColorStop(0, 'rgba(255,255,255,1)');
          g.addColorStop(0.55, 'rgba(255,255,255,0.82)');
          g.addColorStop(1, 'rgba(255,255,255,0)');
          mctx2.fillStyle = g;
          mctx2.fillRect(0, 0, Wl, Hl);
          mctx2.globalCompositeOperation = 'destination-out';
          drawTiledNoise(mctx2, now * 0.012, 1.9, 0.5);
          drawTiledNoise(mctx2, now * 0.027 + 400, 3.1, 0.42);
          mctx2.globalCompositeOperation = 'source-over';

          /* ---- 重影层：轨迹滞后 + 噪声游移 + 速度拖尾 ---- */
          gctx.clearRect(0, 0, Wl, Hl);
          for (var k = 0; k < 4; k++) {
            var p = trailAt(now - k * 85);
            var wob = (k + 1) * 1.9;
            var dxn = (fbm(smx * 0.006 + now * 0.00033 + k * 7.31,
                           smy * 0.006 - now * 0.00021) - 0.5) * fs * 0.05 * wob;
            var dyn = (fbm(smx * 0.006 - now * 0.00026 + k * 3.7,
                           smy * 0.006 + now * 0.00031 + k * 11.7) - 0.5) * fs * 0.05 * wob;
            var dx = (p.x - smx) * 0.9 + vx * (k * 0.35) + dxn;
            var dy = (p.y - smy) * 0.9 + vy * (k * 0.35) + dyn;
            gctx.globalAlpha = GA[k] * I;
            if (filterOK && k >= 2) gctx.filter = 'blur(' + ((k - 1) * 1.6) + 'px)';
            if (k === 1) {
              /* 轻微拉抻的一层 → 液体被拖拽的感觉 */
              gctx.save();
              gctx.translate(smx + dx, smy + dy);
              gctx.scale(1 + 0.05 * I, 1 - 0.03 * I);
              gctx.drawImage(master, -Wl / 2, -Hl / 2, Wl, Hl);
              gctx.restore();
            } else {
              gctx.drawImage(master, dx, dy, Wl, Hl);
            }
            if (filterOK) gctx.filter = 'none';
          }
          /* 重影只在遮罩范围内可见 */
          gctx.globalAlpha = 1;
          gctx.globalCompositeOperation = 'destination-in';
          gctx.drawImage(maskCv, 0, 0, Wl, Hl);
          gctx.globalCompositeOperation = 'source-over';

          /* ---- 合成：清晰底层 + 核心蚀刻 + 重影 ---- */
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = appear;
          ctx.clearRect(0, 0, Wl, Hl);
          ctx.drawImage(master, 0, 0, Wl, Hl);
          /* 在扰动核心把清晰层轻轻"溶"掉一点，露出重影 → 液化感 */
          ctx.globalCompositeOperation = 'destination-out';
          ctx.globalAlpha = 0.38 * I * appear;
          ctx.drawImage(maskCv, smx - Wl * 0.31, smy - Hl * 0.31, Wl * 0.62, Hl * 0.62);
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 1;
          ctx.drawImage(ghostCv, 0, 0, Wl, Hl);

          prevI = I;
        }

        bornAt = (typeof performance === 'object' && performance.now) ? performance.now() : Date.now();
        rafId = raf(frame);

        /* ---- 窗口变化：字号是 clamp(vw/vh) 的，必须重铺 ---- */
        var resizeTimer = null;
        window.addEventListener('resize', function () {
          clearTimeout(resizeTimer);
          resizeTimer = setTimeout(function () {
            if (!started) return;
            var r = h1.getBoundingClientRect();
            if (Math.abs(r.width - W) < 2 && Math.abs(r.height - H) < 2) return;
            layout();
          }, 180);
        });

        /* ---- 从窄屏/触屏切回桌面：补启用；反向则退回原生文字 ---- */
        if (fine && fine.addEventListener) {
          fine.addEventListener('change', function (e) {
            if (e.matches) {
              if (!started) { kicked = true; fontsReady = true; entranceDone = true; activate(); }
            } else {
              started = false;
              if (rafId && window.cancelAnimationFrame) window.cancelAnimationFrame(rafId);
              restoreH1();
            }
          });
        }
      }
    } catch (err) {
      /* 效果失败不影响页面：标题回退成原生文字 */
      if (rafId && window.cancelAnimationFrame) window.cancelAnimationFrame(rafId);
      restoreH1();
    }
  })();

  /* ============================================================
     12. 记录区背景：Aceternity「Cloud Shader」原生 WebGL 移植
     ============================================================
     来源：ui.aceternity.com/registry/cloud-shader.json
     （Aceternity UI 免费组件，作者 Manu Arora）。
     Jack 2026-10-06 指令：把「记录（说说）」区背景换成这个效果。

     为什么不用 npx shadcn add：该命令只认 React + Tailwind 项目，
     本站是阶段一纯静态 HTML（PRD §11 技术方案）。所以把组件里的
     GLSL 云层 shader 逐行移植成零依赖原生 WebGL，不引库、断网能跑。

     与原版的差异（全部是有意的适配）：
       ① 挂在 section#notes 里，canvas 上下边缘 mask 渐隐，
          避免与页面底色 / 白色页脚出现硬接缝；
       ② 滚出视口自动暂停渲染（原版 hero 常驻，无此需要）；
       ③ devicePixelRatio 上限 1.5（原版 2）：云是软边渐变，
          肉眼无差，像素量省一半以上；
       ④ prefers-reduced-motion 时只画一帧静云，不进渲染循环；
       ⑤ WebGL 不可用 / 着色器编译失败 → 整段撤掉，
          区块回退原纯色背景，页面其余部分不受影响。
     配套可读性改动见 styles.css 末尾「记录区云层底幕」块。 */

  (function () {
    /* 2026-10-06 Jack 追加指令：照片墙也换成云层 shader
       → 把单挂 #notes 的写法重构成 mount(section)，两个区块各挂一块
       2026-10-13 Jack 指令：作品集 / 音乐 / 关于 三页背景也换成同款
       2026-10-14 Jack 指令：首页下方"去看看"区也换成同款
         （首页第一屏 hero = Lightfall，不在本列表里，保持不动）
       → 目标列表扩为 6 个区块（每页最多命中一个） */
    var targets = [];
    ['photos', 'notes', 'works', 'music', 'about', 'entriesRegion'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) targets.push(el);
    });
    if (!targets.length) return;

    function mount(section) {
    var cv = null;
    var rafId = 0;
    try {
      cv = document.createElement('canvas');
      if (!cv.getContext || !cv.getContext('webgl')) return;

      var reduced = false;
      try {
        reduced = !!(window.matchMedia &&
          window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      } catch (errM) { reduced = false; }

      /* ---- 着色器：与原版逐行一致 ---- */
      var VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

      var FRAG = `
precision highp float;

varying vec2 v_uv;

uniform vec2 u_res;
uniform float u_time;
uniform float u_count;
uniform vec3 u_cloud;
uniform vec3 u_skyTop;
uniform vec3 u_skyBottom;

const mat2 R = mat2(0.80, 0.60, -0.60, 0.80);

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(41.31, 289.17))) * 26737.367);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += amp * vnoise(p);
    p = R * p * 2.03 + 19.19;
    amp *= 0.5;
  }
  return sum;
}

// billow noise: sharp puffy ridges, like cauliflower cloud tops
float billow(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 5; i++) {
    sum += amp * (1.0 - abs(2.0 * vnoise(p) - 1.0));
    p = R * p * 2.11 + 13.37;
    amp *= 0.5;
  }
  return sum;
}

// raw density for one cloud at point p
float cloudDensity(vec2 p, vec2 c, vec2 r, float seed, float t) {
  vec2 q = p - c;

  // envelope: dome above the center, flat base below
  float ry = q.y > 0.0 ? r.y : r.y * 0.42;
  float env = 1.0 - length(vec2(q.x / r.x, q.y / ry));
  if (env < -0.35) return 0.0;

  // domain-warped billow detail, moves with the cloud, evolves slowly
  vec2 dp = q * (2.4 / r.x) + seed;
  dp += 0.6 * vec2(
    fbm(dp * 1.4 + t * 0.04),
    fbm(dp * 1.4 + 7.7 - t * 0.03)
  );
  float detail = billow(dp * 1.6);

  return env + (detail - 0.62) * 0.62;
}

// shades one cloud and blends it over the current color
vec3 shadeCloud(vec3 color, vec3 sky, vec2 p, vec2 c, vec2 r, float seed, float t, float dist) {
  float d = cloudDensity(p, c, r, seed, t);
  if (d < 0.02) return color;

  // sample density toward the sun (straight up) for self-shadowing
  float dUp = cloudDensity(p + vec2(0.0, r.y * 0.55), c, r, seed, t);
  float occl = clamp((dUp - d) * 1.1 + d * 0.55, 0.0, 1.0);

  vec3 lit = u_cloud * 1.04;
  vec3 shadow = mix(u_cloud * 0.60, sky, 0.38);
  vec3 cloudCol = mix(lit, shadow, occl * 0.85);

  float alpha = smoothstep(0.02, 0.38, d);

  // silver lining on thin edges
  float rim = smoothstep(0.02, 0.14, d) * (1.0 - smoothstep(0.14, 0.40, d));
  cloudCol += rim * 0.10;

  // atmospheric perspective: far clouds fade into the sky
  cloudCol = mix(cloudCol, sky, dist * 0.35);
  alpha *= mix(1.0, 0.8, dist);

  return mix(color, cloudCol, alpha);
}

// one drifting cloud: horizontal wrap + gentle vertical bob
vec3 cloudPass(vec3 color, vec3 sky, vec2 p, float aspect, float t,
               float spd, float phase, float y, vec2 r, float seed, float dist) {
  float cx = mix(-r.x - 0.25, aspect + r.x + 0.25, fract(t * spd + phase));
  float cy = y + sin(t * 0.05 + phase * 6.2831) * 0.012;
  return shadeCloud(color, sky, p, vec2(cx, cy), r, seed, t, dist);
}

void main() {
  float aspect = u_res.x / u_res.y;
  vec2 p = vec2(v_uv.x * aspect, v_uv.y);
  float t = u_time;

  vec3 sky = mix(u_skyBottom, u_skyTop, v_uv.y);
  vec3 color = sky;

  // faint haze band near the horizon
  color = mix(color, u_skyBottom * 1.06, smoothstep(0.35, 0.0, v_uv.y) * 0.5);

  // soft sun glow, upper area
  vec2 sunPos = vec2(aspect * 0.78, 0.92);
  float sunDist = length(p - sunPos);
  color += vec3(1.0, 0.95, 0.82) * exp(-sunDist * sunDist * 5.0) * 0.28;

  // thin cirrus streaks, stretched horizontally, high in the sky
  float cirrusBand = smoothstep(0.55, 0.8, v_uv.y) * (1.0 - smoothstep(0.9, 1.0, v_uv.y));
  if (cirrusBand > 0.01) {
    float streak = fbm(vec2(p.x * 1.6 - t * 0.006, p.y * 12.0));
    float wisp = smoothstep(0.52, 0.78, streak) * cirrusBand;
    color = mix(color, u_cloud * 0.98, wisp * 0.35);
  }

  // far layer: small, high, slow
  if (u_count > 5.5) {
    color = cloudPass(color, sky, p, aspect, t, 0.006, 0.10, 0.84, vec2(0.20, 0.10), 43.7, 1.0);
  }
  if (u_count > 4.5) {
    color = cloudPass(color, sky, p, aspect, t, 0.008, 0.62, 0.73, vec2(0.24, 0.12), 71.3, 0.85);
  }

  // middle layer
  if (u_count > 3.5) {
    color = cloudPass(color, sky, p, aspect, t, 0.011, 0.33, 0.60, vec2(0.34, 0.16), 17.3, 0.55);
  }
  if (u_count > 2.5) {
    color = cloudPass(color, sky, p, aspect, t, 0.013, 0.80, 0.47, vec2(0.30, 0.15), 29.9, 0.45);
  }

  // near layer: big, low, fast
  if (u_count > 1.5) {
    color = cloudPass(color, sky, p, aspect, t, 0.016, 0.05, 0.35, vec2(0.46, 0.20), 91.1, 0.15);
  }
  color = cloudPass(color, sky, p, aspect, t, 0.020, 0.48, 0.20, vec2(0.56, 0.24), 57.2, 0.0);

  gl_FragColor = vec4(color, 1.0);
}
`;

      var gl = cv.getContext('webgl', { alpha: false, antialias: false, premultipliedAlpha: false });
      if (!gl) return;

      function compile(type, source) {
        var sh = gl.createShader(type);
        if (!sh) return null;
        gl.shaderSource(sh, source);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
          gl.deleteShader(sh);
          return null;
        }
        return sh;
      }

      var vert = compile(gl.VERTEX_SHADER, VERT);
      var frag = compile(gl.FRAGMENT_SHADER, FRAG);
      if (!vert || !frag) return;

      var prog = gl.createProgram();
      if (!prog) return;
      gl.attachShader(prog, vert);
      gl.attachShader(prog, frag);
      gl.bindAttribLocation(prog, 0, 'a_pos');
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
      gl.useProgram(prog);

      var buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

      var loc = {
        res: gl.getUniformLocation(prog, 'u_res'),
        time: gl.getUniformLocation(prog, 'u_time'),
        count: gl.getUniformLocation(prog, 'u_count'),
        cloud: gl.getUniformLocation(prog, 'u_cloud'),
        skyTop: gl.getUniformLocation(prog, 'u_skyTop'),
        skyBottom: gl.getUniformLocation(prog, 'u_skyBottom')
      };

      /* 颜色：组件默认值，原样照搬 */
      function parseHex(value) {
        var hex = value.slice(1);
        return [
          parseInt(hex.slice(0, 2), 16) / 255,
          parseInt(hex.slice(2, 4), 16) / 255,
          parseInt(hex.slice(4, 6), 16) / 255
        ];
      }
      var CLOUD = parseHex('#fbf8f2');
      var SKY_TOP = parseHex('#3876ba');
      var SKY_BOTTOM = parseHex('#8cbfe8');

      /* ---- 挂载：填满 section#notes，上下边缘渐隐防硬接缝 ---- */
      section.style.position = 'relative';
      section.style.isolation = 'isolate';
      cv.id = 'cloudShader-' + (section.id || 'x');   /* 按区块命名，避免同页多块时重复 id */
      cv.setAttribute('aria-hidden', 'true');
      var fade = 'linear-gradient(to bottom,transparent 0,#000 140px,#000 calc(100% - 120px),transparent 100%)';
      cv.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;'
        + 'z-index:-1;pointer-events:none;'
        + '-webkit-mask-image:' + fade + ';mask-image:' + fade + ';';
      section.insertBefore(cv, section.firstChild);

      var running = true;
      var visible = true;

      function resize() {
        var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        var w = Math.max(1, Math.floor(cv.clientWidth * dpr));
        var h = Math.max(1, Math.floor(cv.clientHeight * dpr));
        if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
        gl.viewport(0, 0, w, h);
        gl.uniform2f(loc.res, w, h);
      }
      if ('ResizeObserver' in window) {
        new ResizeObserver(resize).observe(cv);
      } else if (window.addEventListener) {
        window.addEventListener('resize', resize, false);
      }
      resize();

      var raf = (typeof window.requestAnimationFrame === 'function')
        ? function (fn) { return window.requestAnimationFrame(fn); }
        : function (fn) { setTimeout(function () { fn(Date.now()); }, 16); return 0; };

      var t0 = (typeof performance === 'object' && performance.now) ? performance.now() : Date.now();

      function drawFrame(now) {
        var elapsed = reduced ? 0 : ((now - t0) / 1000);
        gl.uniform1f(loc.time, elapsed);
        gl.uniform1f(loc.count, 6);
        gl.uniform3f(loc.cloud, CLOUD[0], CLOUD[1], CLOUD[2]);
        gl.uniform3f(loc.skyTop, SKY_TOP[0], SKY_TOP[1], SKY_TOP[2]);
        gl.uniform3f(loc.skyBottom, SKY_BOTTOM[0], SKY_BOTTOM[1], SKY_BOTTOM[2]);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }

      function loop(now) {
        if (!running || !visible) { rafId = 0; return; }
        drawFrame(now);
        rafId = raf(loop);
      }

      if (reduced) {
        /* 减少动态：只画一帧静云，不进渲染循环 */
        drawFrame(t0);
      } else {
        rafId = raf(loop);
      }

      /* 滚出视口就暂停（内嵌区块不像 hero 常驻可见） */
      if ('IntersectionObserver' in window && !reduced) {
        new IntersectionObserver(function (es) {
          var vis = false;
          for (var i = 0; i < es.length; i++) {
            if (es[i].isIntersecting) vis = true;
          }
          if (vis === visible) return;
          visible = vis;
          if (visible && !rafId) {
            rafId = raf(loop);
          } else if (!visible && rafId && window.cancelAnimationFrame) {
            window.cancelAnimationFrame(rafId);
            rafId = 0;
          }
        }, { threshold: 0 }).observe(section);
      }
      } catch (err) {
        /* 任何失败 → 撤掉 canvas，区块回退原纯色背景 */
        try {
          if (rafId && window.cancelAnimationFrame) window.cancelAnimationFrame(rafId);
          if (cv && cv.parentNode) cv.parentNode.removeChild(cv);
          section.style.position = '';
          section.style.isolation = '';
        } catch (err2) { /* 忽略 */ }
      }
    }

    targets.forEach(mount);
  })();

  /* ============================================================
     13. 顶栏 Dock 导航 —— Aceternity Floating Dock 原生移植
     ------------------------------------------------------------
     原组件（ui.aceternity.com 的 floating-dock）依赖 React +
     Framer Motion，本站零依赖静态页，按原参数手写等效实现。
     2026-10-06 深夜 Jack 反馈「导航位置不要变动太多，还在原先
     顶栏的位置」→ 交互模式保留（弹簧放大 + 气泡），挂载点从
     页面底部改回顶栏原导航位置（brand 左 · dock 右，同图二）。

     与原版一致：
     · 鼠标到每个图标中心的横向距离 → 宽度线性映射，越界钳制
       （原版 [-150,0,150] → [40,80,40]；顶栏空间有限，等比
        缩小为 [30,54]，倍率 1.8 ≈ 原版 2 的观感）
     · 弹簧 mass 0.1 / stiffness 150 / damping 12（解析解推进，
       与原版弹簧同参数、观感一致，且任何帧长无条件稳定）
     · 容器圆角胶囊 + 底对齐改居中；间距/内边距同比例缩小

     适配点（每条都有理由）：
     · 挂载进顶栏 .wrap（原 #nav 之后），dock-on 时顶栏只留品牌字
     · pageX → clientX：dock 随顶栏 sticky，视口坐标才一致
     · 气泡翻到图标**下方**（顶栏在页面顶部，上方没有空间），
       浮现方向相应翻转（y -8 → 0）
     · 图标宽 = 圆底宽 ÷ 2：原版两条映射恰为恒定 2 倍关系，
       同参数弹簧对线性缩放目标的解也精确缩放，省一半积分
     · 高亮零侵入：MutationObserver 盯 #nav a 的 .active 变化，
       顶栏怎么高亮 dock 就怎么高亮（首页与详情页自动生效）
     · 仅桌面（≥901px 且有鼠标）启用；窄屏/触屏 CSS 兜底回原导航
     · prefers-reduced-motion：不挂鼠标监听，宽度恒定无动画
     · 任何一步失败：撤 dock、去 body.dock-on，顶栏导航原样
  ============================================================ */
  (function () {
    var dock = null;
    var rafId = 0;
    try {
      var nav = document.getElementById('nav');
      if (!nav) return;
      var mq = window.matchMedia
        ? window.matchMedia('(min-width: 901px) and (pointer: fine)')
        : null;
      if (!mq || !mq.matches) return;

      /* 顶栏版尺寸：常态 30px ↔ 放大 54px（原版 40↔80 的等比缩小） */
      var CAP_MIN = 30, CAP_MAX = 54;

      /* ---- 图标库：24×24 stroke 风格，currentColor 跟随状态变色 ---- */
      var ICONS = {
        home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.8 12 3.5l9 7.3"/><path d="M5.5 9.3V20h13V9.3"/><path d="M10 20v-5.5h4V20"/></svg>',
        photos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M3.5 16.5 9 12l4 3.5 3-2.5 4.5 4"/></svg>',
        notes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/><path d="M9.5 12h6M9.5 15.5h6"/></svg>',
        about: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 7.6v.2"/></svg>',
        /* v1.11：作品集（网格/奖章感）与音乐（音符） */
        works: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/></svg>',
        music: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/></svg>'
      };
      function pickIcon(href) {
        var h = href || '';
        if (h.indexOf('photos') >= 0) return ICONS.photos;
        if (h.indexOf('notes') >= 0)  return ICONS.notes;
        if (h.indexOf('works') >= 0)  return ICONS.works;
        if (h.indexOf('music') >= 0)  return ICONS.music;
        if (h.indexOf('about') >= 0)  return ICONS.about;
        return ICONS.home;   /* index.html / #top / 首页裸链接 */
      }

      /* ---- 构建 DOM：导航项从现有 #nav 读，dock 与顶栏永远同源 ---- */
      var navLinks = Array.prototype.slice.call(nav.querySelectorAll('a'));
      if (!navLinks.length) return;

      dock = document.createElement('nav');
      dock.id = 'dock';
      dock.setAttribute('aria-label', '底部导航');

      var items = [];
      navLinks.forEach(function (a) {
        var href = a.getAttribute('href') || '#';
        var label = (a.textContent || '').trim();

        var item = document.createElement('a');
        item.className = 'dock-item';
        /* href 走 setAttribute：与下面 click 处理里的 getAttribute('href')
           读写路径一致（href= 赋值在部分 DOM 替身里不反射成 attribute） */
        item.setAttribute('href', href);
        item.setAttribute('aria-label', label);

        var cap = document.createElement('span');  /* 外层圆底：宽高被弹簧驱动 */
        cap.className = 'dock-cap';
        var tip = document.createElement('span');  /* 气泡提示 */
        tip.className = 'dock-tip';
        tip.textContent = label;
        var ico = document.createElement('span');  /* 图标框：宽高恒为圆底一半 */
        ico.className = 'dock-ico';
        ico.innerHTML = pickIcon(href);

        cap.appendChild(tip);
        cap.appendChild(ico);
        item.appendChild(cap);
        dock.appendChild(item);
        items.push({ a: item, cap: cap, ico: ico, href: href, s: { x: CAP_MIN, v: 0, t: CAP_MIN } });
      });
      /* 挂进顶栏 .wrap（原 #nav 的旁边）—— 位置与原导航一致（图二），
         dock-on 后顶栏只留品牌字 + 本 dock */
      nav.parentNode.appendChild(dock);

      /* ---- 弹簧：mass .1 / stiffness 150 / damping 12（原版参数）----
         数值方案 = 解析解（与 Framer Motion 同思路）：
         本组参数 ζ = 12/(2·√(150·0.1)) ≈ 1.55 > 1，恒为过阻尼，
         位移是两条指数衰减的叠加，任何帧长都无条件稳定。
         （半隐式欧拉在 60fps 下恰好落在稳定边界，会持续振荡——
           2026-10-06 在检查台实测踩到后换掉。） */
      var STIFF = 150, DAMP = 12, MASS = 0.1;
      var OMEGA0 = Math.sqrt(STIFF / MASS);                      /* ≈ 38.7 rad/s */
      var ZETA  = DAMP / (2 * Math.sqrt(STIFF * MASS));          /* ≈ 1.55 过阻尼 */
      var ROOT1 = -OMEGA0 * (ZETA - Math.sqrt(ZETA * ZETA - 1)); /* 慢根 ≈ -14.2 */
      var ROOT2 = -OMEGA0 * (ZETA + Math.sqrt(ZETA * ZETA - 1)); /* 快根 ≈ -105.8 */
      function stepSpring(s, dt) {
        var dx = s.x - s.t;
        var A = (s.v - ROOT2 * dx) / (ROOT1 - ROOT2);
        var B = dx - A;
        var e1 = Math.exp(ROOT1 * dt);
        var e2 = Math.exp(ROOT2 * dt);
        s.x = s.t + A * e1 + B * e2;
        s.v = A * ROOT1 * e1 + B * ROOT2 * e2;
        if (Math.abs(s.x - s.t) < 0.05 && Math.abs(s.v) < 0.05) {
          s.x = s.t; s.v = 0;
          return true;
        }
        return false;
      }

      var mouseX = Infinity;
      var lastT = 0;

      function kick() {
        if (!rafId && window.requestAnimationFrame) {
          rafId = window.requestAnimationFrame(loop);
        }
      }
      function loop(ts) {
        rafId = 0;
        var dt = lastT ? Math.min((ts - lastT) / 1000, 1 / 30) : 1 / 60;
        lastT = ts;

        /* 读写分离：先整轮读几何，再整轮写样式，避免强制回流 */
        var rects = [];
        for (var i = 0; i < items.length; i++) {
          rects.push(items[i].cap.getBoundingClientRect());
        }
        var settled = true;
        for (var j = 0; j < items.length; j++) {
          var it = items[j];
          var r = rects[j];
          var d = mouseX === Infinity ? Infinity : mouseX - r.left - r.width / 2;
          var dd = Math.max(-150, Math.min(150, d));      /* 原版 clamp */
          it.s.t = CAP_MIN + (CAP_MAX - CAP_MIN) * (1 - Math.abs(dd) / 150);
          if (!stepSpring(it.s, dt)) settled = false;
          var w = it.s.x;
          it.cap.style.width = w.toFixed(2) + 'px';
          it.cap.style.height = w.toFixed(2) + 'px';
          it.ico.style.width = (w / 2).toFixed(2) + 'px';
          it.ico.style.height = (w / 2).toFixed(2) + 'px';
        }
        if (!settled) kick();
      }

      dock.addEventListener('mousemove', function (e) {
        mouseX = e.clientX; kick();
      }, false);
      dock.addEventListener('mouseleave', function () {
        mouseX = Infinity; kick();
      }, false);

      /* ---- 高亮同步：零侵入既有 markActive ---- */
      function syncActive() {
        var cur = nav.querySelector('a.active');
        var href = cur ? cur.getAttribute('href') : null;
        for (var i = 0; i < items.length; i++) {
          items[i].a.classList.toggle('active', items[i].href === href);
        }
      }
      syncActive();
      if (window.MutationObserver) {
        /* 用 window.MutationObserver 而不是裸名：与上面的防御条件保持
           同一来源，非浏览器环境（如检查台）不会 ReferenceError */
        new window.MutationObserver(syncActive).observe(nav, {
          subtree: true, attributes: true, attributeFilter: ['class']
        });
      }

      /* 点 dock 项：立刻给反馈（不等滚动），滚动后由 IO 推顶栏、
         再由上面的同步保持一致；点「关于」补顶栏同款短暂高亮 */
      dock.addEventListener('click', function (e) {
        var t = e.target;
        while (t && t !== dock && !(t.tagName === 'A' && (' ' + t.className + ' ').indexOf(' dock-item ') >= 0)) {
          t = t.parentNode;
        }
        if (!t || t === dock) return;
        var href = t.getAttribute('href');
        navLinks.forEach(function (a) {
          a.classList.toggle('active', a.getAttribute('href') === href);
        });
        if (href.indexOf('#about') >= 0) {
          var card = document.getElementById('about');
          if (card) {
            card.classList.add('flash');
            setTimeout(function () { card.classList.remove('flash'); }, 1200);
          }
        }
      }, false);

      /* 全部就位才隐藏顶栏导航（失败路径不会走到这里） */
      if (document.body.classList) document.body.classList.add('dock-on');
    } catch (err) {
      /* 任何失败：撤掉半成品，顶栏导航原样保留 */
      try {
        if (rafId && window.cancelAnimationFrame) window.cancelAnimationFrame(rafId);
      } catch (e1) { /* 忽略 */ }
      try {
        if (dock && dock.parentNode) dock.parentNode.removeChild(dock);
        if (document.body) document.body.classList.remove('dock-on');
      } catch (e2) { /* 忽略 */ }
    }
  })();

  /* ============================================================
     14. 卡片流筛选（Day 12）：类型按钮 + 关键字搜索
     ------------------------------------------------------------
     三种状态是验收硬标准（技能 filter-interaction-check）：
       有结果   → 显示的卡片与条件一致，计数同步
       无结果   → 出现空态提示（role=status），不是留白
       清空恢复 → 点「清空」或按 Escape，回到完整列表
     匹配走数据（D.feed / D.cardText）而不是 DOM 文字：
     标题 + cardText 全部段落拼一起做小写包含判断，检查台可断言。
     卡片类型映射：数据 type 'moment' ↔ DOM 类名 'thought'。

     【Day 13 改动】从「脚本启动就跑」改成函数 initFilter()，
     由第 8 节在卡片渲染完成后调用一次——数据改成异步取数后，
     启动时卡片还没渲染，筛选抢跑会算出「0 / 0 条」与加载态打架。
     函数声明会提升，所以第 8 节（在前）可以直接调用。
  ============================================================ */
  function initFilter() {
    var bar = document.getElementById('filterBar');
    var flow = document.getElementById('cardFlow');
    if (!bar || !flow) return;
    var btns = Array.prototype.slice.call(bar.querySelectorAll('.fbtn'));
    var input = document.getElementById('filterInput');
    var clearBtn = document.getElementById('filterClear');
    var empty = document.getElementById('filterEmpty');
    var countEl = document.getElementById('filterCount');
    if (!btns.length || !input || !clearBtn || !empty || !countEl) return;

    /* id → 数据条目；匹配文本 = 标题 + cardText 全部段落（小写比较） */
    var byId = {};
    D.feed().forEach(function (p) { byId[p.id] = p; });
    function matchText(p) {
      return ((p.title || '') + D.cardText(p).join('')).toLowerCase();
    }

    var type = 'all';
    var kw = '';

    function apply() {
      var cards = Array.prototype.slice.call(flow.querySelectorAll('.card'));
      var shown = 0;
      cards.forEach(function (card) {
        var p = byId[card.getAttribute('data-id')];
        var okType = (type === 'all') ||
          (type === 'note' ? card.classList.contains('note')
                           : card.classList.contains('thought'));
        var okKw = !kw || (p ? matchText(p).indexOf(kw) >= 0 : false);
        var show = okType && okKw;
        card.hidden = !show;
        if (show) shown++;
      });
      countEl.textContent = shown + ' / ' + cards.length + ' 条';
      empty.hidden = shown !== 0;
      clearBtn.hidden = (type === 'all' && !kw);
      btns.forEach(function (b) {
        var on = b.getAttribute('data-type') === type;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }

    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        type = b.getAttribute('data-type');
        apply();
      });
    });
    input.addEventListener('input', function () {
      kw = (input.value || '').trim().toLowerCase();
      apply();
    });
    clearBtn.addEventListener('click', function () {
      type = 'all';
      kw = '';
      input.value = '';
      apply();
    });
    input.addEventListener('keydown', function (e) {
      if (e && e.key === 'Escape') {
        type = 'all';
        kw = '';
        input.value = '';
        apply();
      }
    });

    apply();   /* 初始归位：计数「4 / 4 条」，其余控件按默认态渲染 */
  }

  /* ============================================================
     15. 归档视图（Day 13）：同一批记录，按月份分组重排
     ------------------------------------------------------------
     对应 archive.html（第 3 个视图）。数据不加新的一条，只换排列：
       首页记录区 = 2 列卡片流；这里 = 按月份分组的时间轴列表。
     取数同样走 feedAsync → 本页也有 加载 / 空 / 错误 / 正常 四态，
     占位结构与样式和首页共用（.feed-states / .feed-skel / …）。
     笔记行可点进详情页（PRD §4.3：感悟卡不可点，这里同样）。
     ============================================================ */
  (function () {
    var region = document.getElementById('archiveRegion');
    var listEl = document.getElementById('archiveList');
    if (!region || !listEl) return;
    var countEl = document.getElementById('archiveCount');

    function render(list) {
      /* 按月分组：date 'YYYY-MM-DD' → 组键 'YYYY-MM'；组内保持传入顺序（倒序） */
      var groups = [];
      var byKey = {};
      list.forEach(function (p) {
        var key = (p.date || '').slice(0, 7);
        if (!byKey[key]) { byKey[key] = []; groups.push(key); }
        byKey[key].push(p);
      });

      listEl.innerHTML = '';
      groups.forEach(function (key) {
        var sec = document.createElement('section');
        sec.className = 'amonth';

        var h3 = document.createElement('h3');
        h3.className = 'amonth-title';
        h3.textContent = key.replace('-', ' 年 ') + ' 月';

        var ol = document.createElement('ol');
        ol.className = 'amonth-list';

        byKey[key].forEach(function (p) {
          var li = document.createElement('li');
          li.className = 'aitem';
          var isNote = (p.type === 'note');

          /* 笔记 → 链接进详情页；感悟 → 普通行（同卡片流的可点规则） */
          var main = document.createElement(isNote ? 'a' : 'span');
          main.className = 'aitem-main';
          if (isNote) main.setAttribute('href', 'note.html?id=' + encodeURIComponent(p.id));

          var tag = document.createElement('span');
          tag.className = 'tag' + (isNote ? '' : ' plain');
          tag.textContent = isNote ? '笔记' : '感悟';

          var title = document.createElement('span');
          title.className = 'aitem-title';
          title.textContent = isNote ? (p.title || '（无标题）') : (D.cardText(p)[0] || '');

          main.appendChild(tag);
          main.appendChild(title);

          var dateEl = document.createElement('span');
          dateEl.className = 't-min aitem-date';
          dateEl.textContent = p.date;

          li.appendChild(main);
          li.appendChild(dateEl);
          ol.appendChild(li);
        });

        sec.appendChild(h3);
        sec.appendChild(ol);
        listEl.appendChild(sec);
      });

      if (countEl) {
        countEl.textContent = list.length + ' 条 · 按 ' + groups.length + ' 个月归档';
      }
    }

    function load() {
      setRegionState(region, 'loading');
      D.feedAsync().then(function (list) {
        if (!list || !list.length) { setRegionState(region, 'empty'); return; }
        render(list);
        setRegionState(region, 'done');
      }).catch(function () {
        setRegionState(region, 'error');
      });
    }

    var retry = document.getElementById('archiveRetry');
    if (retry) retry.addEventListener('click', load);

    load();
  })();

  /* ============================================================
     16. 作品集（PRD §4.11，v1.11 新增）：卡片网格
     ------------------------------------------------------------
     对应 works.html。每张卡 = 截图 + 标题 + 简介 + 外链按钮。
     外链安全（PRD §4.11 硬规则）：target=_blank + rel=noopener noreferrer；
     无外链的卡不可点（不渲染链接，不给手型光标）。
     ============================================================ */
  (function () {
    var grid = document.getElementById('worksGrid');
    if (!grid) return;
    var countEl = document.getElementById('worksCount');
    var emptyEl = document.getElementById('worksEmpty');

    var list = D.WORKS || [];

    if (!list.length) {
      if (emptyEl) emptyEl.hidden = false;
      if (countEl) countEl.textContent = '共 0 个';
      return;
    }

    var frag = document.createDocumentFragment();

    list.forEach(function (w) {
      var card = document.createElement('article');
      card.className = 'work-card';

      if (w.cover) {
        var cov = document.createElement('div');
        cov.className = 'work-cover';
        var img = document.createElement('img');
        img.src = w.cover;
        img.alt = w.title || '作品截图';
        img.setAttribute('loading', 'lazy');
        cov.appendChild(img);
        card.appendChild(cov);
      }

      var bodyEl = document.createElement('div');
      bodyEl.className = 'work-body';

      var h3 = document.createElement('h3');
      h3.textContent = w.title || '';
      bodyEl.appendChild(h3);

      if (w.desc) {
        var p = document.createElement('p');
        p.className = 't-min';
        p.textContent = w.desc;
        bodyEl.appendChild(p);
      }

      if (w.url) {   /* 有外链 → 新窗口打开；没外链 → 整卡不可点（PRD §4.11） */
        var a = document.createElement('a');
        a.className = 'work-link';
        a.setAttribute('href', w.url);
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
        a.textContent = '看作品 →';
        bodyEl.appendChild(a);
      }

      card.appendChild(bodyEl);
      frag.appendChild(card);
    });

    grid.innerHTML = '';
    grid.appendChild(frag);
    if (countEl) countEl.textContent = '共 ' + list.length + ' 个';
  })();

  /* ============================================================
     17. 音乐（PRD §4.12，v1.11 新增）：页内播放列表
     ------------------------------------------------------------
     对应 music.html。点某条 → 该条高亮并在页内播放（<audio>，手动触发，
     不自动播放 —— PRD §5.2 验收项）。音频文件未就位（404）时显示一句
     提示，不弹错误、不打断页面。
     ============================================================ */
  (function () {
    var listEl = document.getElementById('musicList');
    if (!listEl) return;
    var countEl = document.getElementById('musicCount');
    var emptyEl = document.getElementById('musicEmpty');
    var tipEl = document.getElementById('musicTip');

    var list = D.MUSIC || [];

    if (!list.length) {
      if (emptyEl) emptyEl.hidden = false;
      if (countEl) countEl.textContent = '共 0 首';
      return;
    }

    var audio = document.createElement('audio');
    audio.id = 'musicPlayer';
    audio.preload = 'none';                       /* 不预载：打开页面不出声也不下载 */
    audio.hidden = true;
    /* 插到列表前面；检查台的最小 DOM 桩没有 insertBefore，用 appendChild 兜底 */
    if (listEl.parentNode && listEl.parentNode.insertBefore) {
      listEl.parentNode.insertBefore(audio, listEl);
    } else {
      listEl.appendChild(audio);
    }

    var items = [];
    var current = -1;

    function setTip(msg) {
      if (tipEl) { tipEl.textContent = msg || ''; tipEl.hidden = !msg; }
    }

    function stopAll() {
      items.forEach(function (it) { it.classList.remove('playing'); });
    }

    audio.addEventListener('ended', function () {
      stopAll();
      current = -1;
    });
    audio.addEventListener('error', function () {
      stopAll();
      setTip('音频文件还没放进来（素材待补）—— 先看到列表就说明播放列表通了。');
    });

    var frag = document.createDocumentFragment();

    list.forEach(function (t, i) {
      var row = document.createElement('button');
      row.className = 'track';
      row.setAttribute('type', 'button');
      row.setAttribute('aria-pressed', 'false');

      var no = document.createElement('span');
      no.className = 'track-no t-min';
      no.textContent = ('0' + (i + 1)).slice(-2);

      var main = document.createElement('span');
      main.className = 'track-main';
      var title = document.createElement('span');
      title.className = 'track-title';
      title.textContent = t.title || ('曲目 ' + (i + 1));
      var artist = document.createElement('span');
      artist.className = 'track-artist t-min';
      artist.textContent = t.artist || '';
      main.appendChild(title);
      main.appendChild(artist);

      var dur = document.createElement('span');
      dur.className = 'track-dur t-min';
      dur.textContent = t.duration || '';

      row.appendChild(no);
      row.appendChild(main);
      row.appendChild(dur);

      row.addEventListener('click', function () {
        if (current === i && !audio.paused) {     /* 再点一次 = 暂停 */
          audio.pause();
          row.classList.remove('playing');
          row.setAttribute('aria-pressed', 'false');
          return;
        }
        stopAll();
        current = i;
        setTip('');
        row.classList.add('playing');
        row.setAttribute('aria-pressed', 'true');
        audio.src = t.src;
        var p = (typeof audio.play === 'function') ? audio.play() : null;
        if (p && p.catch) {
          p.catch(function () { /* 文件未就位等 → 交给 error 事件统一提示 */ });
        }
      });

      items.push(row);
      frag.appendChild(row);
    });

    listEl.innerHTML = '';
    listEl.appendChild(frag);
    if (countEl) countEl.textContent = '共 ' + list.length + ' 首';
  })();
})();
