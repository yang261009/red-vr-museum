/**
 * 主控：场景渲染、交互、AI 讲解与导览
 */
(function () {
  const data = window.MUSEUM_DATA;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  // 屏幕提示 toast
  let toastTimer = null;
  function showToast(msg) {
    let el = document.getElementById('vr-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'vr-toast';
      el.style.cssText = 'position:fixed;top:18%;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.75);color:#ffd97a;padding:10px 24px;border-radius:20px;font-size:16px;z-index:9999;pointer-events:none;transition:opacity 0.3s;border:1px solid #cfa850;';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = '1';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.style.opacity = '0'; }, 1800);
  }

  // 本地文件模式（file://）下的素材自检：
  // 浏览器在 file:// 下禁止把本地图片上传为 WebGL 贴图，必须依赖 assets/photos/embed.js。
  // 若内嵌包缺失或未覆盖新增图片，墙面照片会静默变空白 —— 这里直接说明原因与修复命令。
  function escHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function checkLocalAssetNotice() {
    if (location.protocol !== 'file:') return;
    const missing = window.PHOTO_EMBED_MISSING || [];
    const hasEmbed = !!window.PHOTO_EMBED;
    if (hasEmbed && !missing.length) return;

    const detail = hasEmbed
      ? '有 ' + missing.length + ' 张素材未打包进内嵌文件：'
        + escHtml(missing.map((p) => p.split('/').pop()).join('、'))
      : '未找到素材内嵌包 <code style="color:#ffd97a">assets/photos/embed.js</code>';

    let el = document.getElementById('vr-asset-notice');
    if (!el) {
      el = document.createElement('div');
      el.id = 'vr-asset-notice';
      el.style.cssText = 'position:fixed;left:50%;bottom:76px;transform:translateX(-50%);'
        + 'max-width:min(92vw,780px);background:rgba(30,8,6,0.95);color:#ffe0b0;'
        + 'padding:13px 44px 13px 18px;border-radius:10px;font-size:13px;line-height:1.65;'
        + 'z-index:9998;border:1px solid #cfa850;box-shadow:0 8px 26px rgba(0,0,0,0.55);';
      const txt = document.createElement('div');
      txt.id = 'vr-asset-notice-text';
      el.appendChild(txt);
      const btn = document.createElement('button');
      btn.textContent = '关闭';
      btn.style.cssText = 'position:absolute;right:10px;top:8px;background:none;border:none;'
        + 'color:#cfa850;cursor:pointer;font-size:12px;';
      btn.onclick = () => el.remove();
      el.appendChild(btn);
      document.body.appendChild(el);
    }
    document.getElementById('vr-asset-notice-text').innerHTML =
      '<b style="color:#ffd97a">本地文件模式提示：</b>' + detail
      + '<br>请在本项目目录执行 <code style="color:#ffd97a">python tools/scan_photos.py</code> 后刷新页面，'
      + '或改用本地服务器打开（<code style="color:#ffd97a">python -m http.server</code>）。';
  }

  let renderer, scene, camera, controls, world;
  let raycaster, pointer;
  let currentZoneId = null;
  let currentFigure = null; // 正在对话的人物立牌（fig 对象），null 表示普通导览模式
  let panelZoneId = null; // 详情面板当前展示展区（独立于每帧接近检测，避免被重置导致“走近”失效）
  let vrMode = false;
  let tour = null;
  const clock = new THREE.Clock();

  // ---------------- 初始化 ----------------
  function init() {
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;
    $('#stage').appendChild(renderer.domElement);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x14161b);
    scene.fog = new THREE.Fog(0x14161b, 40, 90);

    camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 200);

    // 灯光（博物馆聚光氛围：压暗环境光，点光偏暖聚焦展板）
    scene.add(new THREE.AmbientLight(0xffe8d0, 0.38));
    scene.add(new THREE.HemisphereLight(0xffe0c8, 0x1a1410, 0.3));
    for (let i = -1; i <= 1; i++) {
      const pl = new THREE.PointLight(0xffd8a8, 0.95, 32);
      pl.position.set(0, 5.6, i * 9);
      scene.add(pl);
    }

    world = Museum.build(scene, data);
    checkLocalAssetNotice();

    controls = new FPControls(camera, renderer.domElement);
    controls.collidables = world.collidables;
    controls.onBlocked = showToast;
    controls.setBounds(world.half.w, world.half.d);
    window.__controls = controls;
    controls.pos.set(-15.5, 1.65, 0);
    controls.yaw = Math.PI / 2; // 面向西墙序厅
    controls.pitch = -0.05;

    raycaster = new THREE.Raycaster();
    pointer = new THREE.Vector2();

    buildNav();
    buildQuickAsk();
    bindUI();
    AI.init();
    animate();

    // 支持 ?start=1 直接进入展馆（便于分享时跳过封面）
    if (/[?&]start=1/.test(location.search)) {
      $('#splash').classList.add('hidden');
    }
    // 支持 ?go=展区id 分享直达（jgs / yanan / xbp / hqq / xsd），&d=0 关闭自动弹出详情
    const mGo = location.search.match(/[?&]go=(\w+)/);
    if (mGo) {
      const openDetail = !/[?&]d=0/.test(location.search);
      setTimeout(() => goZone(mGo[1], openDetail, true), 600);
    }
    // 支持 ?about=1 打开展馆说明（便于分享与验证）
    if (/[?&]about=1/.test(location.search)) {
      setTimeout(openAbout, 200);
    }

    // 展馆构建完成，启用开始按钮
    const bs = $('#btnStart');
    bs.disabled = false;
    bs.textContent = '开始参观';
  } catch (err) {
    // 构建出错也保证启动按钮可用，并暴露真实错误（而非泛化的 Script error）
    console.error('INIT_FAIL', err);
    window.__errs = window.__errs || [];
    window.__errs.push({ message: (err && err.message) || String(err), stack: err && err.stack ? err.stack.split('\n').slice(0, 5).join(' | ') : '' });
    const bs = $('#btnStart');
    if (bs) {
      bs.disabled = false;
      bs.textContent = '开始参观';
      bs.onclick = () => {
        const sp = $('#splash');
        if (sp) sp.classList.add('hidden');
        showToast('初始化出现问题：' + ((err && err.message) || err));
      };
    }
  }
  }

  // ---------------- 导航按钮 ----------------
  function buildNav() {
    const nav = $('#navList');
    const items = [{ id: 'lobby', name: '序厅', order: '起' }].concat(
      data.route.map((id) => data.zones.find((z) => z.id === id))
    );
    items.forEach((it) => {
      const b = document.createElement('button');
      b.innerHTML = `<span class="n">${it.order}</span>${it.name}`;
      b.onclick = () => goZone(it.id, true);
      b.dataset.id = it.id;
      nav.appendChild(b);
    });
  }

  function setActiveNav(id) {
    $$('#navList button').forEach((b) => b.classList.toggle('on', b.dataset.id === id));
  }

  // ---------------- 前往展区 ----------------
  function goZone(id, openDetail, instant) {
    const v = world.zoneViews[id];
    if (!v) return;
    if (instant) {
      controls.pos.copy(v.pos);
      controls.lookAtPoint(v.target);
    } else {
      controls.flyTo(v.pos, v.target, 1.4);
    }
    currentZoneId = id === 'lobby' ? null : id;
    setActiveNav(id);
    if (id !== 'lobby' && window.Museum && Museum.captureFrame) Museum.captureFrame(id);
    const zone = data.zones.find((z) => z.id === id);
    $('#whereTxt').textContent = zone ? `${zone.name} · ${zone.place}` : '序厅';
    if (openDetail && zone) setTimeout(() => openDetailPanel(id), instant ? 100 : 1450);
  }

  // ---------------- 展馆说明（模块级，便于初始化时通过 ?about=1 打开） ----------------
  function openAbout() {
    buildAboutRoute();
    $('#about').classList.remove('hidden');
  }
  function closeAbout() {
    $('#about').classList.add('hidden');
  }
  // 渲染参观动线（可点击直达对应展厅）
  function buildAboutRoute() {
    const box = $('#abRoute');
    if (!box) return;
    const ordered = [{ id: 'lobby', name: '序厅', year: '' }].concat(
      data.zones.map((z) => ({ id: z.id, name: z.name, year: (z.period || '').split('—')[0].trim() }))
    );
    box.innerHTML = ordered
      .map((s, i) => {
        const chip = `<span class="ab-stop" data-goto="${s.id}">${s.name}<i>${s.year}</i></span>`;
        return i < ordered.length - 1 ? chip + '<span class="ab-arrow">→</span>' : chip;
      })
      .join('');
    box.querySelectorAll('.ab-stop').forEach((el) => {
      el.onclick = () => {
        closeAbout();
        $('#splash').classList.add('hidden');
        goZone(el.dataset.goto, false, true);
      };
    });
  }

  // ---------------- 详情面板 ----------------
  function openDetailPanel(id, tab) {
    const zone = data.zones.find((z) => z.id === id);
    if (!zone) return;
    currentZoneId = id;
    panelZoneId = id;
    setActiveNav(id);
    $('#dtOrder').textContent = String(zone.order).padStart(2, '0');
    $('#dtOrder').style.color = zone.accent;
    $('#dtTitle').textContent = zone.board.title;
    $('#dtSub').textContent = `${zone.place} · ${zone.period} · ${zone.slogan}`;
    $('#dtNarrate').style.background = zone.accent;

    // 展板全文
    const facts = zone.board.facts
      .map((f) => `<div class="fact"><div class="k">${f.k}</div><div class="v">${f.v}</div></div>`)
      .join('');
    const spirit = `<div class="spirit-box"><div class="sname">${zone.spiritCard.name}</div><ul>${zone.spiritCard.items
      .map((i) => `<li>${i}</li>`)
      .join('')}</ul></div>`;
    const hero = zone.hero
      ? `<div class="hero-box"><h5>${zone.hero.name}</h5><div class="tag">${zone.hero.tag}</div>
         <p>${zone.hero.text}</p><p class="quote">${zone.hero.quote}</p></div>`
      : '';
    $('#paneRead').innerHTML =
      `<p style="font-size:16px;color:${zone.accent};font-weight:700">${zone.slogan}</p>` +
      zone.board.paragraphs.map((p) => `<p>${p}</p>`).join('') +
      facts +
      spirit +
      hero +
      `<div class="note-box">${data.contentNote}</div>`;

    // 思考讨论（客观题即时判分 + 简答AI评价）
    const L = ['A', 'B', 'C', 'D', 'E', 'F'];
    const typeName = { single: '单选题', multiple: '多选题', judge: '判断题', fill: '填空题', essay: '简答论述' };

    // 单题渲染：按题型生成交互区
    const renderQ = (q, i) => {
      const tag = `<span class="qtype qt-${q.type || 'essay'}">${typeName[q.type || 'essay']}</span>`;
      let body = '';
      if (q.type === 'single' || q.type === 'multiple') {
        const input = q.type === 'single' ? 'radio' : 'checkbox';
        body =
          `<div class="opts">` +
          q.options
            .map(
              (o, oi) =>
                `<label class="opt"><input type="${input}" name="opt${i}" value="${oi}">
                 <span class="opt-l">${L[oi]}</span><span class="opt-t">${o}</span></label>`
            )
            .join('') +
          `</div>`;
      } else if (q.type === 'judge') {
        body =
          `<div class="opts judge-opts">` +
          `<label class="opt"><input type="radio" name="judge${i}" value="true"><span class="opt-l">✓</span><span class="opt-t">正确</span></label>` +
          `<label class="opt"><input type="radio" name="judge${i}" value="false"><span class="opt-l">✗</span><span class="opt-t">错误</span></label>` +
          `</div>`;
      } else if (q.type === 'fill') {
        body =
          `<div class="fill-row">` +
          q.answer
            .map((_, k) => `<input class="fill-input" data-k="${k}" id="fill${i}_${k}" placeholder="填空${k + 1}">`)
            .join('') +
          `</div>`;
      } else {
        // essay 简答
        body =
          `<textarea class="ask-input" id="askInput${i}" rows="3" placeholder="写下你的思考与理解…"></textarea>`;
      }
      const buttons =
        q.type === 'essay'
          ? `<button class="grade-btn essay-save" data-i="${i}">💾 保存作答</button>
             <button class="toggle" data-i="${i}">查看参考答案</button>`
          : `<button class="grade-btn obj-submit" data-i="${i}">提交</button>`;
      return (
        `<div class="qa" data-type="${q.type || 'essay'}">
          <div class="q">${tag}${q.q}</div>
          ${body}
          <div class="qa-btns">${buttons}</div>
          <div class="obj-result" id="grade${i}"></div>
          <div class="a" id="qa${i}">${q.a || ''}</div>
        </div>`
      );
    };

    $('#paneAsk').innerHTML =
      `<h4>思考与讨论：客观题即时判分，简答作答后统一由 AI 出具总评</h4>
       <div class="ask-summary" id="askSummary"></div>` +
      zone.questions.map((q, i) => renderQ(q, i)).join('') +
      `<div class="overall-box" id="overallBox">
         <button class="overall-btn" id="overallBtn">✍ 提交整份答卷，获取 AI 总评</button>
         <div class="overall-result" id="overallResult"></div>
       </div>`;

    // 客观题判分状态
    const objScore = {};

    // 简答作答记录（保存后参与总评）
    const essayAnswers = {};

    // 客观题正确答案文字
    const rightText = (q) => {
      if (q.type === 'single') return `${L[q.answer]}. ${q.options[q.answer]}`;
      if (q.type === 'multiple') return q.answer.map((a) => `${L[a]}. ${q.options[a]}`).join('；');
      if (q.type === 'judge') return q.answer ? '正确' : '错误';
      if (q.type === 'fill') return q.answer.join('、');
      return '';
    };

    // 展开/收起参考答案（仅简答）
    $$('#paneAsk .toggle').forEach((btn) => {
      btn.onclick = () => {
        const a = $('#qa' + btn.dataset.i);
        const show = !a.classList.contains('show');
        a.classList.toggle('show', show);
        btn.textContent = show ? '收起参考答案' : '查看参考答案';
      };
    });

    // 简答：保存作答（不逐题评分，统一在"提交总评"时由 AI 综合评分）
    $$('#paneAsk .essay-save').forEach((btn) => {
      btn.onclick = () => {
        const i = btn.dataset.i;
        const val = $('#askInput' + i).value.trim();
        const box = $('#grade' + i);
        if (!val) {
          box.innerHTML = `<div class="g-comment">请先写下你的思考，再保存作答。</div>`;
          return;
        }
        essayAnswers[i] = val;
        btn.textContent = '✅ 已保存';
        box.innerHTML = `<div class="g-comment">已保存作答，可继续作答其他题目，最后统一获取 AI 总评。</div>`;
        updateSummary();
      };
    });

    // 客观题即时判分
    $$('#paneAsk .obj-submit').forEach((btn) => {
      btn.onclick = () => {
        const i = btn.dataset.i;
        const q = zone.questions[i];
        const type = q.type || 'essay';
        const box = $('#grade' + i);

        // —— 客观题即时判分 ——
        let correct = false, picked = [];
        if (type === 'single') {
          const sel = document.querySelector(`input[name="opt${i}"]:checked`);
          picked = sel ? [Number(sel.value)] : [];
          correct = picked.length === 1 && picked[0] === q.answer;
        } else if (type === 'multiple') {
          picked = [...document.querySelectorAll(`input[name="opt${i}"]:checked`)].map((x) => Number(x.value));
          const a1 = [...picked].sort(), a2 = [...q.answer].sort();
          correct = picked.length === q.answer.length && a1.every((v, k) => v === a2[k]);
        } else if (type === 'judge') {
          const sel = document.querySelector(`input[name="judge${i}"]:checked`);
          const val = sel ? sel.value === 'true' : null;
          picked = [val];
          correct = val === q.answer;
        } else if (type === 'fill') {
          const qaBox = btn.closest('.qa');
          const inputs = qaBox.querySelectorAll('.fill-input');
          let allOk = inputs.length === q.answer.length;
          inputs.forEach((inp) => {
            const k = Number(inp.dataset.k);
            const v = (inp.value || '').replace(/\s/g, '');
            if (v !== q.answer[k]) allOk = false;
          });
          correct = allOk;
        }

        // 选项高亮
        const qaEl = btn.closest('.qa');
        qaEl.querySelectorAll('.opt').forEach((lab) => {
          const inp = lab.querySelector('input');
          const ov = inp.type === 'radio' || inp.type === 'checkbox' ? inp.value : null;
          lab.classList.remove('correct', 'wrong');
          const isRight =
            type === 'single' ? Number(ov) === q.answer
            : type === 'multiple' ? q.answer.includes(Number(ov))
            : type === 'judge' ? (ov === 'true') === q.answer
            : false;
          if (isRight) lab.classList.add('correct');
          else if (inp.checked) lab.classList.add('wrong');
        });

        box.innerHTML = correct
          ? `<div class="obj-ok">✅ 回答正确</div><div class="obj-explain">💡 ${q.explain}</div>`
          : `<div class="obj-no">❌ 回答错误　正确答案：${rightText(q)}</div><div class="obj-explain">💡 ${q.explain}</div>`;

        objScore[i] = correct;
        updateSummary();
      };
    });

    // 客观题成绩汇总 + 简答作答进度
    function updateSummary() {
      const objIdx = zone.questions
        .map((q, i) => ({ q, i }))
        .filter((x) => (x.q.type || 'essay') !== 'essay')
        .map((x) => x.i);
      const essayIdx = zone.questions
        .map((q, i) => ({ q, i }))
        .filter((x) => (x.q.type || 'essay') === 'essay')
        .map((x) => x.i);
      const done = objIdx.filter((i) => i in objScore);
      const right = done.filter((i) => objScore[i]).length;
      const savedEssay = essayIdx.filter((i) => i in essayAnswers).length;
      const el = $('#askSummary');
      let parts = [];
      if (objIdx.length) {
        parts.push(done.length
          ? `客观题 ${done.length}/${objIdx.length}，答对 <b>${right}</b> 题`
          : `客观题共 ${objIdx.length} 题，提交后即时判分`);
      }
      if (essayIdx.length) {
        parts.push(savedEssay
          ? `简答已保存 <b>${savedEssay}</b>/<b>${essayIdx.length}</b> 题`
          : `简答共 ${essayIdx.length} 题，作答后统一获取 AI 总评`);
      }
      el.innerHTML = parts.join(' · ');
    }
    updateSummary();

    // 提交整份答卷：AI 汇总客观题成绩 + 各简答，出具总评
    $('#overallBtn').onclick = () => {
      const box = $('#overallResult');
      const objIdx = zone.questions
        .map((q, i) => ({ q, i }))
        .filter((x) => (x.q.type || 'essay') !== 'essay')
        .map((x) => x.i);
      const essayIdx = zone.questions
        .map((q, i) => ({ q, i }))
        .filter((x) => (x.q.type || 'essay') === 'essay')
        .map((x) => x.i);

      // 校验：客观题全部提交、简答全部保存
      const missObj = objIdx.filter((i) => !(i in objScore));
      const missEssay = essayIdx.filter((i) => !(i in essayAnswers));
      if (missObj.length || missEssay.length) {
        const hint = [];
        if (missObj.length) hint.push(`客观题还有 ${missObj.length} 题未提交`);
        if (missEssay.length) hint.push(`简答还有 ${missEssay.length} 题未保存`);
        box.innerHTML = `<div class="g-comment">⚠️ ${hint.join('；')}，请完成后再获取总评。</div>`;
        return;
      }

      box.innerHTML = `<div class="g-loading">AI 正在综合评阅整份答卷…</div>`;
      const right = objIdx.filter((i) => objScore[i]).length;
      const essays = essayIdx.map((i) => {
        const q = zone.questions[i];
        return { q: q.q, ref: q.a || '', answer: essayAnswers[i] };
      });

      Promise.resolve(AI.gradeAll({
        zoneName: zone.name,
        objTotal: objIdx.length,
        objRight: right,
        essays: essays,
      })).then((r) => {
        const viaTag = r.via === 'llm'
          ? '<span class="g-via">DeepSeek 综合评阅</span>'
          : '<span class="g-via">本地规则综合评阅</span>';
        const suggestHtml = r.suggest ? `<div class="g-suggest">💡 改进建议：${r.suggest}</div>` : '';
        const coveredHtml = r.covered && r.covered.length
          ? `<div class="g-block ok"><b>✅ 亮点/已覆盖</b><ul>${r.covered.map((t) => `<li>${t}</li>`).join('')}</ul></div>`
          : '';
        const missingHtml = r.missing && r.missing.length
          ? `<div class="g-block miss"><b>📌 可提升之处</b><ul>${r.missing.map((t) => `<li>${t}</li>`).join('')}</ul></div>`
          : '';
        box.innerHTML =
          `<div class="g-head"><span class="score-num">${r.score}<em>分</em></span>
             <span class="g-tag">${r.score >= 85 ? '优秀' : r.score >= 60 ? '良好' : r.score >= 35 ? '基本掌握' : '待加强'}</span>
             ${viaTag}</div>
           <div class="g-meta">客观题答对 ${right}/${objIdx.length} 题 · 简答 ${essays.length} 题</div>
           <div class="g-comment">${r.comment}</div>
           ${suggestHtml}
           ${coveredHtml}
           ${missingHtml}`;
      }).catch(() => {
        box.innerHTML = `<div class="g-comment">总评暂不可用，请稍后重试。</div>`;
      });
    };

    // 史料出处
    const src = data.sources[zone.id] || [];
    $('#paneSrc').innerHTML =
      `<div class="note-box"><b>内容审校说明：</b>${data.contentNote}</div>` +
      `<h4>本展厅史料出处</h4><ul class="src-list">${src.map((s) => `<li>${s}</li>`).join('')}</ul>`;

    // 视频
    loadVideo(zone);

    switchTab(tab || 'read');
    $('#detail').classList.remove('hidden');
  }

  // 从 B站链接中提取 BV 号
  function bvidFromUrl(u) {
    const m = String(u || '').match(/(BV[0-9A-Za-z]{10})/);
    return m ? m[1] : null;
  }

  // 用 B站官方播放器 iframe 嵌入播放
  function showBilibili(box, bvid, pageUrl, credit) {
    box.classList.remove('hidden');
    box.innerHTML =
      `<div class="ve-frame"><iframe src="https://player.bilibili.com/player.html?bvid=${encodeURIComponent(
        bvid
      )}&autoplay=0&high_quality=1&danmaku=0" scrolling="no" frameborder="0" framespacing="0" ` +
      `allowfullscreen="true" referrerpolicy="no-referrer" title="B站视频"></iframe></div>` +
      `<div class="ve-src">${credit || '来源：哔哩哔哩'}` +
      (pageUrl
        ? ` · <a target="_blank" rel="noopener" href="${pageUrl}">在 B站打开原视频 ↗</a>`
        : '') +
      '</div>';
  }

  function loadVideo(zone) {
    const v = $('#dtVideo');
    const fb = $('#videoFallback');
    const box = $('#dtIframe');
    fb.classList.add('hidden');
    // 官方影像检索入口（B站站内搜索直达）
    $('#filmLinks').innerHTML =
      '<div class="vf-films-title">官方影像 · B站检索直达</div>' +
      (data.films[zone.id] || [])
        .map(
          (f) =>
            `<a class="film-link" target="_blank" rel="noopener" href="https://search.bilibili.com/all?keyword=${encodeURIComponent(
              f.kw
            )}">▶ ${f.name}</a>`
        )
        .join('');

    // 本地视频优先：自动探测 videos/{展区id}.{mp4|webm|mov|m4v}；缺失时回退 B站在线视频或占位提示
    box.classList.add('hidden');
    box.innerHTML = '';
    v.classList.remove('hidden');
    v.pause();
    let failed = false;
    const onErr = () => {
      if (failed) return;
      failed = true;
      v.classList.add('hidden');
      if (zone.video && zone.video.bvid) {
        showBilibili(box, zone.video.bvid, zone.video.pageUrl, zone.video.credit);
      } else {
        fb.classList.remove('hidden');
      }
    };
    v.onerror = onErr;
    const startLocal = (url) => {
      if (failed) return;
      if (!url) {
        onErr();
        return;
      }
      v.src = url;
      v.load();
      // 若 2.5 秒内无法获取元数据，视为素材缺失
      setTimeout(() => {
        if (v.readyState === 0) onErr();
      }, 2500);
    };
    if (window.LocalVideo) {
      LocalVideo.resolve(zone.id, zone.video && zone.video.file).then(startLocal);
    } else {
      startLocal(zone.video && zone.video.file);
    }
  }

  function switchTab(tab) {
    $$('#dtTabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    $$('.dt-pane').forEach((p) => p.classList.remove('on'));
    $('#pane' + tab[0].toUpperCase() + tab.slice(1)).classList.add('on');
  }

  // ---------------- 讲解 ----------------
  let narrating = false;
  function narrate(zone) {
    if (narrating) {
      AI.stop();
      setNarrating(false);
      return;
    }
    setNarrating(true);
    $('#capTag').textContent = '讲解员';
    $('#capText').textContent = '正在播放讲解…';
    AI.playNarration(zone, {
      onAudioStart: () => {
        $('#capTag').textContent = '讲解员';
        // 不立即显示整段字幕，由 _syncSubtitle 逐句同步
      },
      onTTSStart: () => {
        $('#capTag').textContent = '讲解员';
      },
      onSentence: (i, s) => {
        $('#capText').textContent = s;
      },
      onEnd: () => {
        setNarrating(false);
        setTimeout(() => $('#captionBar').classList.add('hidden'), 1200);
      },
    });
  }

  function setNarrating(on) {
    narrating = on;
    $('#captionBar').classList.toggle('hidden', !on);
    const b = $('#dtNarrate');
    b.classList.toggle('playing', on);
    b.textContent = on ? '■ 停止讲解' : '🔊 讲解员';
    $('#capPause').textContent = '暂停';
    if (!on) AI.stop();
  }

  // ---------------- 自动导览 ----------------
  function startTour() {
    if (tour) {
      stopTour();
      return;
    }
    tour = { i: 0, running: true };
    $('#btnTour').classList.add('active');
    $('#btnTour').textContent = '■ 停止导览';
    runTourStep();
  }

  function stopTour() {
    if (!tour) return;
    tour.running = false;
    tour = null;
    AI.stop();
    setNarrating(false);
    $('#btnTour').classList.remove('active');
    $('#btnTour').textContent = '▶ 自动导览';
  }

  function runTourStep() {
    if (!tour || !tour.running) return;
    const id = data.route[tour.i];
    const zone = data.zones.find((z) => z.id === id);
    goZone(id, false);
    setNarrating(true);
    $('#capTag').textContent = `第 ${tour.i + 1} 站 · ${zone.name}`;
    $('#capText').textContent = zone.transition;
    // 优先播放 audio/{id}.mp3 配音（过渡语仅以字幕呈现），配音缺失时回退语音合成
    AI.playTourStep(zone, {
      onAudioStart: () => {
        $('#capTag').textContent = `第 ${tour.i + 1} 站 · ${zone.name}`;
        // 不立即显示整段字幕，由 _syncSubtitle 逐句同步
      },
      onSentence: (i, s) => ($('#capText').textContent = s),
      onEnd: () => {
        if (!tour || !tour.running) return;
        tour.i++;
        setNarrating(false);
        if (tour.i >= data.route.length) {
          stopTour();
          $('#capTag').textContent = '导览结束';
          $('#capText').textContent = '五站参观完毕。你可以继续自由参观，或向智能导览助手提问。';
          $('#captionBar').classList.remove('hidden');
          setTimeout(() => $('#captionBar').classList.add('hidden'), 6000);
          return;
        }
        setTimeout(runTourStep, 900);
      },
    });
  }

  // ---------------- AI 助手 ----------------
  function buildQuickAsk() {
    const box = $('#asQuick');
    data.quickAsk.forEach((q) => {
      const b = document.createElement('button');
      b.textContent = q;
      b.onclick = () => ask(q);
      box.appendChild(b);
    });
    pushMsg('ai',
      '你好，我是本展馆的智能导览助手。你可以问我红色地标的史实、某种精神的内涵，' +
      '也可以说"带我去延安"让我自动导航。');
  }

  function pushMsg(who, text) {
    const d = document.createElement('div');
    d.className = 'msg ' + who;
    d.textContent = text;
    $('#asLog').appendChild(d);
    $('#asLog').scrollTop = $('#asLog').scrollHeight;
    return d;
  }

  // 导览助手统一使用"导览"人设（DeepSeek 接入保持不变，无 Key 时自动回退本地知识库）
  const ASK_MODE = 'guide';
  let askBusy = false;

  function ask(q) {
    if (!q || askBusy) return;
    pushMsg('me', q);
    $('#asInput').value = '';
    askBusy = true;
    const pendingEl = pushMsg('ai', '…'); // 占位，稍后替换为真实回复

    // 人物对话模式：以该人物第一人称回应
    const replyPromise = currentFigure
      ? Promise.resolve(AI.talkToFigure(q, currentFigure, currentZoneId))
      : Promise.resolve(AI.answer(q, currentZoneId, ASK_MODE));

    replyPromise.then((r) => {
      // 替换占位文本
      pendingEl.textContent = r.text + (r.fallbackNote ? '\n' + r.fallbackNote : '');
      if (r.go) {
        setTimeout(() => goZone(r.go, false), 400);
      }
      if (r.speak) {
        setTimeout(() => {
          if (r.zone) openDetailPanel(r.zone.id);
          narrate(r.zone);
        }, 600);
      }
    }).catch(() => {
      pendingEl.textContent = '抱歉，暂时无法回应，请稍后再试。';
    }).finally(() => {
      askBusy = false;
    });
  }

  // 进入"与人物对话"模式：展开助手面板，以该人物身份开场
  function startFigureChat(fig, zoneId) {
    currentFigure = fig;
    currentZoneId = zoneId || currentZoneId;
    // 展开助手面板
    const body = $('#asBody');
    body.classList.remove('hidden');
    $('#asToggle').textContent = '—';
    // 更新标题与状态
    $('#assistant').querySelector('strong').textContent = '与「' + fig.name + '」对话';
    $('#asState').textContent = '第一人称 · 第一视角交流（点头像可退出）';
    $('#asInput').placeholder = '对 ' + fig.name + ' 说：您当年为什么……？';
    // 清空并以人物口吻开场
    $('#asLog').innerHTML = '';
    pushMsg('ai',
      '同学你好，我是' + fig.name + '（' + (fig.life || '') + '）。' +
      (fig.desc || '') + '\n你想了解我当年的哪段经历？尽管问。');
    // 快捷问题
    const box = $('#asQuick');
    box.innerHTML = '';
    ['您当年为什么这样选择？', '能讲讲最艰难的时候吗？', '您觉得今天的青年该有怎样的担当？']
      .forEach((sq) => {
        const b = document.createElement('button');
        b.textContent = sq;
        b.onclick = () => ask(sq);
        box.appendChild(b);
      });
    showToast('已进入与「' + fig.name + '」的对话');
  }

  // 退出人物对话，回到普通导览助手
  function exitFigureChat() {
    if (!currentFigure) return;
    currentFigure = null;
    $('#assistant').querySelector('strong').textContent = '智能导览助手';
    const ok = window.LLM && window.LLM.enabled();
    $('#asState').textContent = ok ? '已接入 DeepSeek · 大模型模式' : '未接入大模型 · 本地知识库模式';
    $('#asInput').placeholder = '问我：井冈山精神是什么？或说“带我去延安”';
    $('#asLog').innerHTML = '';
    buildQuickAsk();
    showToast('已回到导览助手');
  }

  // ---------------- 小地图 ----------------
  function drawMinimap() {
    const c = $('#minimap');
    const g = c.getContext('2d');
    const W = c.width;
    const H = c.height;
    const sx = W / (world.half.w * 2);
    const sy = H / (world.half.d * 2);
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,0.07)';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 2;
    g.strokeRect(2, 2, W - 4, H - 4);

    const toX = (x) => (x + world.half.w) * sx;
    const toY = (z) => (z + world.half.d) * sy;

    // 展区标记
    data.zones.forEach((z) => {
      const v = world.zoneViews[z.id];
      const px = toX(v.target.x);
      const py = toY(v.target.z);
      g.fillStyle = z.accent;
      g.beginPath();
      g.arc(px, py, 7, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.font = 'bold 9px sans-serif';
      g.textAlign = 'center';
      g.fillText(String(z.order), px, py + 3);
    });

    // 序厅
    const lv = world.zoneViews.lobby;
    g.fillStyle = 'rgba(255,255,255,0.6)';
    g.beginPath();
    g.arc(toX(lv.target.x), toY(lv.target.z), 6, 0, Math.PI * 2);
    g.fill();

    // 玩家
    const px = toX(controls.pos.x);
    const py = toY(controls.pos.z);
    g.save();
    g.translate(px, py);
    g.rotate(-controls.yaw + Math.PI);
    g.fillStyle = currentZoneId ? '#ffd97a' : '#ffffff';
    g.beginPath();
    g.moveTo(0, -9);
    g.lineTo(6, 7);
    g.lineTo(0, 3);
    g.lineTo(-6, 7);
    g.closePath();
    g.fill();
    g.restore();
  }

  // ---------------- 事件绑定 ----------------
  function bindUI() {
    // 启动页
    $('#btnStart').onclick = () => {
      $('#splash').classList.add('hidden');
      AI.init();
      // 首次进入面向序厅，稍后自动转向第一站引导
      setTimeout(() => {
        $('#capTag').textContent = '参观提示';
        $('#capText').textContent = data.routeIntro;
        $('#captionBar').classList.remove('hidden');
        clearTimeout(window.__routeIntroT);
        window.__routeIntroT = setTimeout(() => $('#captionBar').classList.add('hidden'), 20000);
      }, 800);
    };

    // 帮助
    $('#btnHelp').onclick = () => $('#help').classList.remove('hidden');
    $$('[data-closehelp]').forEach((b) => (b.onclick = () => $('#help').classList.add('hidden')));

    // 展馆说明（启动页 / 操作说明面板内均可打开；openAbout 定义在模块级）
    if ($('#btnAbout')) $('#btnAbout').onclick = openAbout;
    if ($('#abClose')) $('#abClose').onclick = closeAbout;
    $$('[data-openabout]').forEach((b) => (b.onclick = openAbout));
    $('#about').addEventListener('click', (e) => {
      if (e.target === $('#about')) closeAbout();
    });

    // 关闭详情
    $$('[data-close]').forEach((b) => (b.onclick = () => $('#detail').classList.add('hidden')));

    // 详情 tab
    $$('#dtTabs button').forEach((b) => (b.onclick = () => switchTab(b.dataset.tab)));

    // 讲解
    $('#dtNarrate').onclick = () => {
      const z = data.zones.find((x) => x.id === currentZoneId);
      if (z) narrate(z);
    };
    $('#capPause').onclick = () => {
      if (!narrating) return;
      if (AI.isPaused()) {
        AI.resume();
        $('#capPause').textContent = '暂停';
      } else {
        AI.pause();
        $('#capPause').textContent = '继续';
      }
    };
    $('#capStop').onclick = () => setNarrating(false);

    // 上下一站
    $('#dtPrev').onclick = () => {
      const base = panelZoneId || currentZoneId;
      const i = data.route.indexOf(base);
      const id = data.route[(i - 1 + data.route.length) % data.route.length];
      openDetailPanel(id);
      goZone(id, false);
    };
    $('#dtNext').onclick = () => {
      const base = panelZoneId || currentZoneId;
      const i = data.route.indexOf(base);
      const id = data.route[(i + 1) % data.route.length];
      openDetailPanel(id);
      goZone(id, false);
    };
    $('#dtGo').onclick = () => {
      $('#detail').classList.add('hidden');
      goZone(panelZoneId || currentZoneId, false);
    };

    // 视频 URL 载入
    $('#videoLoad').onclick = () => {
      const u = $('#videoUrl').value.trim();
      if (!u) return;
      const v = $('#dtVideo');
      $('#videoFallback').classList.add('hidden');
      // B站链接 → 用官方播放器 iframe 嵌入（<video> 无法直接播放网页视频）
      const bv = bvidFromUrl(u);
      if (bv) {
        v.pause();
        v.classList.add('hidden');
        showBilibili($('#dtIframe'), bv, u, '来源：哔哩哔哩，版权归原作者所有');
        return;
      }
      $('#dtIframe').classList.add('hidden');
      $('#dtIframe').innerHTML = '';
      v.classList.remove('hidden');
      v.src = u;
      v.load();
      v.play().catch(() => {});
    };

    // AI 助手 / 助教
    $('#asSend').onclick = () => ask($('#asInput').value.trim());
    $('#asInput').onkeydown = (e) => {
      if (e.key === 'Enter') ask($('#asInput').value.trim());
    };
    $('#asHead').onclick = () => {
      // 人物对话模式下，点头部 = 退出对话、回到普通导览助手
      if (currentFigure) {
        exitFigureChat();
        return;
      }
      const b = $('#asBody');
      b.classList.toggle('hidden');
      $('#asToggle').textContent = b.classList.contains('hidden') ? '＋' : '—';
    };

    // 助手状态（DeepSeek 是否接入仅用于状态展示，不改变界面形态）
    const refreshAiState = () => {
      const ok = window.LLM && window.LLM.enabled();
      const el = $('#asState');
      if (el) el.textContent = ok ? '已接入 DeepSeek · 大模型模式' : '未接入大模型 · 本地知识库模式';
      const dot = $('#assistant .as-avatar');
      if (dot) dot.classList.toggle('llm', ok);
    };
    refreshAiState();

    // 背景纯音乐（用户交互后启动，循环播放）
    const bgm = new Audio('music/bgm.wav');
    bgm.loop = true;
    bgm.volume = 0.45;
    let musicOn = false;
    $('#btnMusic').onclick = () => {
      musicOn = !musicOn;
      $('#btnMusic').classList.toggle('active', musicOn);
      if (musicOn) bgm.play().catch(() => {});
      else bgm.pause();
    };
    // 开始参观时自动响起
    $('#btnStart').addEventListener('click', () => {
      musicOn = true;
      $('#btnMusic').classList.add('active');
      bgm.play().catch(() => {});
    }, { once: true });

    // 工具
    $('#btnTour').onclick = startTour;

    // 分享：复制当前展厅直达链接
    $('#btnShare').onclick = () => {
      const base = location.origin + location.pathname;
      const url = base + '?start=1' + (currentZoneId ? '&go=' + currentZoneId : '');
      const show = (txt) => {
        $('#capTag').textContent = '分享';
        $('#capText').textContent = txt;
        $('#captionBar').classList.remove('hidden');
        setTimeout(() => $('#captionBar').classList.add('hidden'), 4000);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(
          () =>
            show(
              currentZoneId
                ? '已复制当前展厅直达链接，发给同学即可打开这个展厅。'
                : '已复制展馆链接，发给同学即可在线参观。'
            ),
          () => show('请手动复制地址栏链接：' + url)
        );
      } else {
        show('请手动复制地址栏链接：' + url);
      }
    };

    $('#btnVR').onclick = () => {
      vrMode = !vrMode;
      $('#btnVR').classList.toggle('active', vrMode);
      $('#btnVR').textContent = vrMode ? '退出 VR' : 'VR 双屏';
      if (vrMode) {
        $('#hint').textContent = 'VR 模式：将手机放入眼镜盒中观看（双屏立体）';
      } else {
        // 退出双屏：重置视口/裁剪为全屏，避免残留半屏
        renderer.setScissorTest(false);
        renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
        onResize();
        $('#hint').textContent = 'W A S D 移动 · 按住鼠标左键拖动转视角 · 点击展板查看内容';
      }
    };

    // 3D 拾取
    const dom = renderer.domElement;
    let downX = 0;
    let downY = 0;
    let downT = 0;
    dom.addEventListener('pointerdown', (e) => {
      downX = e.clientX;
      downY = e.clientY;
      downT = performance.now();
    });
    dom.addEventListener('pointerup', (e) => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 8) return;
      if (performance.now() - downT > 600) return;
      pick(e.clientX, e.clientY);
    });

    // 移动端摇杆
    if ('ontouchstart' in window) {
      $('#joy').classList.remove('hidden');
      $('#hint').textContent = '摇杆移动 · 滑动屏幕转视角 · 点击展板查看内容';
    }

    window.addEventListener('resize', onResize);
  }

  function pick(cx, cy) {
    pointer.x = (cx / window.innerWidth) * 2 - 1;
    pointer.y = -(cy / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const meshes = world.clickables.map((c) => c.mesh);
    let hit = raycaster.intersectObjects(meshes, false)[0];
    if (hit) {
      const item = world.clickables.find((c) => c.mesh === hit.object);
      if (item && item.item === 'holomap' && item.holoMesh) {
        const m = item.holoMesh.material;
        const on = m.opacity <= 0.5;
        m.opacity = on ? 0.85 : 0;
        showToast(on ? '全息地图已点亮 ✨' : '全息地图已收起');
        return;
      }
      if (item && item.zoneId === 'lobby') {
        goZone('jgs', false);
        return;
      }
      if (item && item.item === 'figure' && item.fig) {
        // 点击人物立牌：进入"与人物对话"模式
        startFigureChat(item.fig, item.zoneId);
        return;
      }
      if (item) {
        const tab = item.item === 'video' ? 'video' : item.item === 'question' ? 'ask' : 'read';
        openDetailPanel(item.zoneId, tab);
      }
      return;
    }
    // 地面圆标
    const marks = Object.entries(world.marks).map(([id, m]) => ({ id, mesh: m }));
    const hitMark = raycaster.intersectObjects(marks.map((m) => m.mesh), false)[0];
    if (hitMark) {
      const m = marks.find((x) => x.mesh === hitMark.object);
      goZone(m.id, false);
    }
  }

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // ---------------- 渲染循环 ----------------
  const camL = new THREE.PerspectiveCamera(72, 1, 0.05, 200);
  const camR = new THREE.PerspectiveCamera(72, 1, 0.05, 200);

  function renderStereo() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const eye = 0.032;
    const right = new THREE.Vector3(Math.cos(controls.yaw), 0, -Math.sin(controls.yaw));
    camL.position.copy(camera.position).addScaledVector(right, -eye);
    camR.position.copy(camera.position).addScaledVector(right, eye);
    camL.rotation.copy(camera.rotation);
    camR.rotation.copy(camera.rotation);
    camL.aspect = camR.aspect = w / 2 / h;
    camL.updateProjectionMatrix();
    camR.updateProjectionMatrix();
    renderer.setScissorTest(true);
    renderer.setViewport(0, 0, w / 2, h);
    renderer.setScissor(0, 0, w / 2, h);
    renderer.render(scene, camL);
    renderer.setViewport(w / 2, 0, w / 2, h);
    renderer.setScissor(w / 2, 0, w / 2, h);
    renderer.render(scene, camR);
    renderer.setScissorTest(false);
  }

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    controls.update(dt);

    // 视频屏呼吸光效
    const t = clock.getElapsedTime();
    // 全息元素逐帧动画（旋转 / 上下浮动 / billboard 面向相机）
    (world.spinners || []).forEach((sp) => {
      if (sp.billboard) {
        sp.obj.lookAt(camera.position);
      } else {
        sp.obj.rotation[sp.axis || 'y'] += (sp.speed || 0.5) * dt;
      }
      if (sp.bob) sp.obj.position.y = sp.baseY + Math.sin(t * 1.1) * sp.bob;
    });
    // 天花板繁星律动闪烁
    if (world.stars) {
      world.stars.stars.material.opacity = 0.5 + Math.sin(t * 2.5) * 0.3;
      world.stars.stars.material.size = 0.05 + Math.sin(t * 3.5) * 0.02;
    }
    // 序厅弧幕星点：逐颗独立闪烁
    if (world.lobbyStars) {
      const ls = world.lobbyStars;
      const colors = ls.pts.geometry.attributes.color;
      for (let i = 0; i < ls.N; i++) {
        // 0.15 ~ 1.0 的呼吸亮度
        const b = 0.18 + 0.82 * (0.5 + 0.5 * Math.sin(t * ls.speed[i] + ls.phase[i]));
        colors.array[i * 3] = ls.base[i * 3] * b;
        colors.array[i * 3 + 1] = ls.base[i * 3 + 1] * b;
        colors.array[i * 3 + 2] = ls.base[i * 3 + 2] * b;
      }
      colors.needsUpdate = true;
    }
    world.clickables.forEach((c) => {
      if (c.item === 'video' && c.mesh.userData.glow) {
        c.mesh.userData.glow.material.opacity = 0.06 + Math.sin(t * 2.2) * 0.05;
      }
    });

    // 位置提示
    let near = null;
    let nd = 1e9;
    for (const id in world.zoneViews) {
      if (id === 'lobby') continue;
      const d = controls.pos.distanceTo(world.zoneViews[id].pos);
      if (d < nd) {
        nd = d;
        near = id;
      }
    }
    const lobbyView = world.zoneViews.lobby;
    const dl = lobbyView ? controls.pos.distanceTo(lobbyView.pos) : 1e9;
    if (near && nd < 9 && nd <= dl) {
      const z = data.zones.find((x) => x.id === near);
      $('#whereTxt').textContent = `${z.name} · ${z.place}`;
      setActiveNav(near);
      currentZoneId = currentZoneId || near;
      if (window.Museum && Museum.captureFrame) Museum.captureFrame(near);
    } else if (dl < 11) {
      $('#whereTxt').textContent = '序厅 · 参观起点';
      setActiveNav('lobby');
      currentZoneId = null;
    } else {
      $('#whereTxt').textContent = '展厅中庭';
    }

    drawMinimap();
    if (vrMode) renderStereo();
    else renderer.render(scene, camera);
  }

  window.addEventListener('DOMContentLoaded', init);
})();
