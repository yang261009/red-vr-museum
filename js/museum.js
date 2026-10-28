/**
 * 展馆三维场景构建
 * 布局：矩形展厅 44m × 32m，五个主题展区沿墙顺时针排列，与历史时间顺序一致。
 * 参观动线：序厅(西) → 01井冈山(北西) → 02延安(北东) → 03西柏坡(东) → 04红旗渠(南东) → 05新时代(南西)
 */
(function () {
  const ROOM = { w: 44, d: 32, h: 6.6 }; // 房间尺寸
  const HALF_W = ROOM.w / 2;
  const HALF_D = ROOM.d / 2;

  // 墙面：法线朝房间内；沿墙方向（局部 +x）与顺时针动线同向
  const WALLS = {
    north: { pos: (u) => [u, 0, -HALF_D + 0.15], rotY: 0 },
    south: { pos: (u) => [u, 0, HALF_D - 0.15], rotY: Math.PI },
    east: { pos: (u) => [HALF_W - 0.15, 0, u], rotY: -Math.PI / 2 },
    west: { pos: (u) => [-HALF_W + 0.15, 0, u], rotY: Math.PI / 2 },
  };

  function texFromCanvas(canvas, repeat) {
    const t = new THREE.CanvasTexture(canvas);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 8;
    if (repeat) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repeat[0], repeat[1]);
    }
    return t;
  }

  // 以 file:// 打开时，浏览器把每个本地文件视为"唯一源"，图片画进 canvas 后再上传 WebGL
  // 会抛 SecurityError，墙面照片因此全部空白。assets/photos/embed.js 提供了同源 data-URL
  // 副本（由 tools/scan_photos.py 生成），这里统一做一次地址解析。
  // 记录"清单里有、但内嵌包里没有"的素材：出现即说明新增了图片却没重跑扫描脚本
  const embedMissing = [];
  window.PHOTO_EMBED_MISSING = embedMissing;

  function assetUrl(url) {
    const map = window.PHOTO_EMBED;
    if (!map) return url;
    if (map[url]) return map[url];
    if (embedMissing.indexOf(url) < 0) embedMissing.push(url);
    return url;
  }

  // 尝试加载外部图片，失败时使用程序化生成的 canvas
  function loadImageOrDefault(url, defaultCanvas, onReady) {
    const loader = new THREE.TextureLoader();
    loader.load(
      assetUrl(url),
      (t) => {
        t.encoding = THREE.sRGBEncoding;
        t.anisotropy = 8;
        onReady(t);
      },
      undefined,
      () => onReady(texFromCanvas(defaultCanvas))
    );
  }

  // 原生 Image 加载像素图（供 Canvas drawImage），失败回调 onFail
  function loadPlainImage(url, onOk, onFail) {
    const im = new Image();
    im.onload = () => onOk(im);
    im.onerror = () => { if (onFail) onFail(); };
    im.src = assetUrl(url);
  }

  // 槽位自动接线：data.js 显式指定优先，文件夹里剩下的图按文件名顺序补进空槽位
  // 补位顺序：主图 → 展板小图1 → 展板小图2 → 立牌1 → 立牌2
  // 清单来自 assets/photos/manifest.js（由 tools/scan_photos.py 生成）
  function zoneSlotPlan(zone) {
    const boardOn = true; // 所有展厅统一走标准主展板（标题+正文+主图+历史小图）
    const board = zone.board || {};
    const figs = (zone.figures || []).slice(0, 2);
    const hero = (boardOn && board.hero) || '';
    const photos = boardOn
      ? (board.photos || []).map((p) => (typeof p === 'string' ? { src: p } : p))
      : [];
    const figPhotos = figs.map((f) => (f && f.photo) || '');
    const used = [hero].concat(photos.map((p) => p.src), figPhotos, zone.reservedPhotos || [])
      .filter(Boolean);
    const pool = (((window.PHOTO_MANIFEST || {})[zone.id]) || [])
      .filter((src) => used.indexOf(src) < 0);
    let k = 0;
    const take = () => (k < pool.length ? pool[k++] : '');
    const out = { hero: hero || (boardOn ? take() : ''), photos: photos.slice(), figPhotos: [] };
    if (boardOn) {
      while (out.photos.length < 2) {
        const p = take();
        if (!p) break;
        out.photos.push({ src: p });
      }
    }
    figs.forEach((f, i) => { out.figPhotos[i] = figPhotos[i] || take(); });
    if (k < pool.length) {
      console.info('[展陈照片] 以下图片当前没有空槽位可放：' + pool.slice(k).join('、'));
    }
    return out;
  }

  // 厅内液晶屏：懒加载抽取本地视频（videos/{id}.mp4|webm|mov|m4v）的某一帧作静态封面，
  // 不自动播放、不循环；仅取帧替换封面，点击仍走详情面板播放。rec={zone,mesh,done}
  function doCapture(rec) {
    if (rec.done || rec.started) return; // 进行中/已成功不重复触发，避免每帧反复新建 video
    if (rec.poster) { rec.done = true; return; } // 已有预抽封面帧，不必再解码大视频
    rec.started = true;
    const id = rec.zone.id;
    const mesh = rec.mesh;
    const zone = rec.zone;
    const exts = ['mp4', 'webm', 'mov', 'm4v'];
    let ei = 0;
    let settled = false;
    const cleanup = (v) => { v.removeAttribute('src'); v.load(); };
    const tryNext = () => {
      if (ei >= exts.length || settled) { rec.started = false; return; } // 全失败允许下次重试
      const v = document.createElement('video');
      v.muted = true;
      v.playsInline = true;
      v.preload = 'auto';
      const timer = setTimeout(() => { if (!settled) { settled = true; cleanup(v); tryNext(); } }, 20000);
      const onErr = () => { clearTimeout(timer); if (!settled) { cleanup(v); tryNext(); } };
      const onSeeked = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        v.pause();
        rec.done = true;
        mesh.material.map = texFromCanvas(Tex.videoScreen(zone, v));
        mesh.material.needsUpdate = true;
        mesh.userData.frame = true;
        cleanup(v);
      };
      v.src = assetUrl('videos/' + id + '.' + exts[ei++]);
      v.addEventListener('error', onErr);
      v.addEventListener('loadeddata', () => {
        const d = v.duration && isFinite(v.duration) && v.duration > 0 ? v.duration : 3;
        // 避开片头黑场，取约第 15% 处（上限 1.5s）的一帧
        v.currentTime = Math.min(1.5, d * 0.15);
      });
      v.addEventListener('seeked', onSeeked);
    };
    tryNext();
  }

  function plane(w, h, material) {
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  }

  const Museum = {};

  Museum.build = function (scene, data) {
    const collidables = []; // 世界坐标 AABB 碰撞体
    const clickables = []; // 可点击对象
    const videoScreens = {}; // zoneId -> { zone, mesh, done } 视频屏（懒加载抽帧）
    const zoneViews = {}; // 各展区最佳观看点
    const marks = {}; // 地面圆标（用于导航高亮）
    const spinners = []; // 逐帧动画对象（全息环等）：{ obj, axis, speed, bob?, baseY? }

    // ---------- 建筑外壳 ----------
    const wallMat = new THREE.MeshLambertMaterial({
      map: texFromCanvas(Tex.wall(), [10, 2]),
      color: 0xffffff,
    });
    const floorMat = new THREE.MeshLambertMaterial({
      map: texFromCanvas(Tex.floor(), [11, 8]),
      color: 0xffffff,
    });
    const ceilMat = new THREE.MeshBasicMaterial({
      color: 0x0a0a0f,
    });

    const floor = plane(ROOM.w, ROOM.d, floorMat);
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    const ceil = plane(ROOM.w, ROOM.d, ceilMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = ROOM.h;
    scene.add(ceil);

    // 天花板繁星（律动闪烁）
    let starsRef = null;
    let lobbyStarRef = null;
    (function starfield() {
      const N = 300;
      const pos = new Float32Array(N * 3);
      const phase = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        pos[i * 3] = (Math.random() - 0.5) * (ROOM.w - 1);
        pos[i * 3 + 1] = ROOM.h - 0.15 - Math.random() * 0.3;
        pos[i * 3 + 2] = (Math.random() - 0.5) * (ROOM.d - 1);
        phase[i] = Math.random() * Math.PI * 2;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({
        color: 0xfff0c0, size: 0.06, transparent: true, opacity: 0.8,
        sizeAttenuation: true, depthWrite: false,
      });
      const stars = new THREE.Points(geo, mat);
      scene.add(stars);
      starsRef = { stars, phase, N };
    })();

    // 墙顶四周一圈灯带
    (function perimeterLights() {
      const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2dc });
      const glowMat = new THREE.MeshBasicMaterial({
        color: 0xffe6bd, transparent: true, opacity: 0.3,
      });
      const y = ROOM.h - 0.25;
      // 南北墙
      [[0, -HALF_D + 0.06, ROOM.w, 0], [0, HALF_D - 0.06, ROOM.w, Math.PI]].forEach(([x, z, w, ry]) => {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, 0.06), lightMat);
        strip.position.set(x, y, z);
        scene.add(strip);
        const glow = new THREE.Mesh(new THREE.BoxGeometry(w, 0.35, 0.02), glowMat);
        glow.position.set(x, y - 0.15, z - (z > 0 ? 0.04 : -0.04));
        glow.rotation.y = ry;
        scene.add(glow);
      });
      // 东西墙
      [[-HALF_W + 0.06, 0, ROOM.d], [HALF_W - 0.06, 0, ROOM.d]].forEach(([x, z, d]) => {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, d), lightMat);
        strip.position.set(x, y, z);
        scene.add(strip);
        const glow = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.35, d), glowMat);
        glow.position.set(x - (x > 0 ? 0.04 : -0.04), y - 0.15, z);
        scene.add(glow);
      });
    })();

    // 四面墙
    const wallDefs = [
      { w: ROOM.w, pos: [0, ROOM.h / 2, -HALF_D], rotY: 0 },
      { w: ROOM.w, pos: [0, ROOM.h / 2, HALF_D], rotY: Math.PI },
      { w: ROOM.d, pos: [-HALF_W, ROOM.h / 2, 0], rotY: Math.PI / 2 },
      { w: ROOM.d, pos: [HALF_W, ROOM.h / 2, 0], rotY: -Math.PI / 2 },
    ];
    wallDefs.forEach((wd) => {
      const m = plane(wd.w, ROOM.h, wallMat);
      m.position.set(wd.pos[0], wd.pos[1], wd.pos[2]);
      m.rotation.y = wd.rotY;
      scene.add(m);
    });

    // ---------- 墙面装饰：干净深色墙 + 淡金山形线条 + 转角灯带 ----------
    (function wallDecor() {
      const inset = 0.05;

      // 淡金山形线条装饰层（四面墙，半透明，不抢展板）
      const decoMat = new THREE.MeshBasicMaterial({
        map: texFromCanvas(Tex.wallDeco()),
        transparent: true, opacity: 0.6, depthWrite: false,
      });
      const mkDeco = (w, x, z, rotY) => {
        const d = plane(w, 3.0, decoMat);
        d.position.set(x, 2.8, z);
        d.rotation.y = rotY;
        scene.add(d);
      };
      mkDeco(ROOM.w - 0.3, 0, -HALF_D + inset, 0);
      mkDeco(ROOM.w - 0.3, 0, HALF_D - inset, 0);
      mkDeco(ROOM.d - 0.3, -HALF_W + inset, 0, Math.PI / 2);
      mkDeco(ROOM.d - 0.3, HALF_W - inset, 0, Math.PI / 2);
    })();

    // 顶部灯带
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff4e0 });
    for (let i = -1; i <= 1; i++) {
      const lamp = plane(ROOM.w * 0.86, 0.5, lampMat);
      lamp.rotation.x = Math.PI / 2;
      lamp.position.set(0, ROOM.h - 0.06, i * 9);
      scene.add(lamp);
    }

    // ---------- 中央主题柱 ----------
    (function centralPillar() {
      const c = document.createElement('canvas');
      c.width = 1024;
      c.height = 256;
      const g = c.getContext('2d');
      const grad = g.createLinearGradient(0, 0, 1024, 0);
      grad.addColorStop(0, '#7d1a17');
      grad.addColorStop(0.5, '#b3322c');
      grad.addColorStop(1, '#7d1a17');
      g.fillStyle = grad;
      g.fillRect(0, 0, 1024, 256);
      g.fillStyle = 'rgba(255,215,130,0.9)';
      g.fillRect(0, 40, 1024, 4);
      g.fillRect(0, 212, 1024, 4);
      g.font = 'bold 86px "Microsoft YaHei",sans-serif';
      g.fillStyle = '#ffffff';
      g.textAlign = 'center';
      g.fillText('奋斗之路　1927 — 2026', 512, 152);
      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(1.35, 1.35, 5.2, 32, 1, true),
        new THREE.MeshBasicMaterial({ map: texFromCanvas(c), side: THREE.DoubleSide })
      );
      pillar.position.set(0, 2.6, 0);
      scene.add(pillar);
      // 顶盖与底座
      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(1.5, 1.5, 0.25, 32),
        new THREE.MeshLambertMaterial({ color: 0x2a2d34 })
      );
      cap.position.set(0, 5.3, 0);
      scene.add(cap);
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(1.7, 1.9, 0.18, 32),
        new THREE.MeshLambertMaterial({ color: 0x2a2d34 })
      );
      base.position.set(0, 0.09, 0);
      scene.add(base);
      collidables.push({ minX: -2.1, maxX: 2.1, minZ: -2.1, maxZ: 2.1 });
    })();

    // 圆形地雕
    (function floorMedallion() {
      const c = document.createElement('canvas');
      c.width = c.height = 512;
      const g = c.getContext('2d');
      g.fillStyle = '#2c3038';
      g.beginPath();
      g.arc(256, 256, 250, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#c0392b';
      g.lineWidth = 10;
      g.beginPath();
      g.arc(256, 256, 226, 0, Math.PI * 2);
      g.stroke();
      g.strokeStyle = 'rgba(255,215,130,0.5)';
      g.lineWidth = 4;
      g.beginPath();
      g.arc(256, 256, 196, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.75)';
      g.font = 'bold 40px "Microsoft YaHei",sans-serif';
      g.textAlign = 'center';
      const m = plane(9, 9, new THREE.MeshBasicMaterial({ map: texFromCanvas(c), transparent: true }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(0, 0.02, 0);
      scene.add(m);
    })();

    // ---------- 顶面：红金框式中国元素结构（星空中国轮廓 + 同心圆框 + 回纹 + 对称矩形框） ----------
    function chinaCeiling(px, pz, skyR, ringR, frameW, frameD) {
      const grp = new THREE.Group();
      const darkRedMat = new THREE.MeshLambertMaterial({ color: 0x6e1712 });
      const goldMat = new THREE.MeshBasicMaterial({
        map: texFromCanvas(Tex.huiwen(256, 'rgba(226,193,126,0.75)'), [12, 1]),
        transparent: true,
      });

      // 1) 中心：渐变星空 + 星光中国轮廓（圆形，法线朝下）
      const sky = new THREE.Mesh(
        new THREE.CircleGeometry(skyR, 64),
        new THREE.MeshBasicMaterial({ map: texFromCanvas(Tex.starfieldChina(1024, 1024)) })
      );
      sky.rotation.x = Math.PI / 2;
      sky.position.y = 0;
      grp.add(sky);

      // 2) 圆形同心框：暗红环 + 淡金细环 + 回纹环带
      const mkRing = (rIn, rOut, mat, y) => {
        const ring = new THREE.Mesh(new THREE.RingGeometry(rIn, rOut, 96), mat);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = y;
        grp.add(ring);
      };
      mkRing(skyR, skyR + 0.16, darkRedMat, -0.02); // 暗红宽环
      mkRing(skyR + 0.16, skyR + 0.22, new THREE.MeshBasicMaterial({ color: 0xe2c17e }), -0.03); // 淡金细环
      // 回纹环带
      const huiRing = new THREE.Mesh(
        new THREE.RingGeometry(skyR + 0.24, skyR + 0.5, 96),
        new THREE.MeshBasicMaterial({
          map: texFromCanvas(Tex.huiwen(256, 'rgba(226,193,126,0.45)'), [26, 1]),
          transparent: true, opacity: 0.85,
        })
      );
      huiRing.rotation.x = Math.PI / 2;
      huiRing.position.y = -0.02;
      grp.add(huiRing);
      mkRing(skyR + 0.5, skyR + 0.64, darkRedMat, -0.02);

      // 3) 对称矩形框（外圈，稳重克制的细框）
      const mkFrame = (w, d, t, y, mat) => {
        [-1, 1].forEach((s) => {
          const bx = new THREE.Mesh(new THREE.BoxGeometry(w, t, t), mat);
          bx.position.set(0, y, (s * d) / 2);
          grp.add(bx);
        });
        [-1, 1].forEach((s) => {
          const bz = new THREE.Mesh(new THREE.BoxGeometry(t, t, d), mat);
          bz.position.set((s * w) / 2, y, 0);
          grp.add(bz);
        });
      };
      mkFrame(frameW, frameD, 0.09, -0.28, darkRedMat); // 外框
      mkFrame(frameW - 0.7, frameD - 0.7, 0.05, -0.24, new THREE.MeshLambertMaterial({ color: 0x5a120e })); // 内框

      // 外框四角淡金角饰（小型 L 型）
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
        const l1 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: 0xcfa964 }));
        l1.position.set(sx * (frameW / 2 - 0.42), -0.33, sz * (frameD / 2 - 0.06));
        grp.add(l1);
        const l2 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.7), new THREE.MeshBasicMaterial({ color: 0xcfa964 }));
        l2.position.set(sx * (frameW / 2 - 0.06), -0.33, sz * (frameD / 2 - 0.42));
        grp.add(l2);
      });

      // 4) 极淡全息网格层（透明，浮于星空上方，不产生眩光）
      const holo = new THREE.Mesh(
        new THREE.CircleGeometry(skyR + 0.64, 64),
        new THREE.MeshBasicMaterial({
          map: texFromCanvas(Tex.holoGrid(512, 512), [5, 5]),
          transparent: true, opacity: 0.35, depthWrite: false,
        })
      );
      holo.rotation.x = Math.PI / 2;
      holo.position.y = 0.02;
      grp.add(holo);

      grp.position.set(px, 5.42, pz);
      scene.add(grp);
    }
    // 中央大厅：大型星空中国轮廓顶（避开主题柱正上方视线压迫，直径适中）
    // 中央大厅：柱子上方保留红框圆环结构
    chinaCeiling(0, 0, 2.0, 2.6, 6.0, 6.0);
    // 东西两翼：对称小型框式结构（无星空，仅框+回纹，保持克制）
    function frameCeilingSmall(px, pz, w, d) {
      const grp = new THREE.Group();
      const darkRedMat = new THREE.MeshLambertMaterial({ color: 0x6e1712 });
      const mkFrame = (fw, fd, t, y, mat) => {
        [-1, 1].forEach((s) => {
          const bx = new THREE.Mesh(new THREE.BoxGeometry(fw, t, t), mat);
          bx.position.set(0, y, (s * fd) / 2);
          grp.add(bx);
        });
        [-1, 1].forEach((s) => {
          const bz = new THREE.Mesh(new THREE.BoxGeometry(t, t, fd), mat);
          bz.position.set((s * fw) / 2, y, 0);
          grp.add(bz);
        });
      };
      mkFrame(w, d, 0.08, -0.26, darkRedMat);
      mkFrame(w - 0.6, d - 0.6, 0.045, -0.22, new THREE.MeshLambertMaterial({ color: 0x5a120e }));
      const hui = new THREE.Mesh(
        new THREE.PlaneGeometry(w - 1.2, d - 1.2),
        new THREE.MeshBasicMaterial({
          map: texFromCanvas(Tex.huiwen(256, 'rgba(226,193,126,0.30)'), [10, 6]),
          transparent: true, opacity: 0.5, depthWrite: false,
        })
      );
      hui.rotation.x = Math.PI / 2;
      hui.position.y = -0.18;
      grp.add(hui);
      grp.position.set(px, 5.42, pz);
      scene.add(grp);
    }
    // 东西两翼红框已移除
    // frameCeilingSmall(-14.5, 0, 3.5, 2.8);
    // frameCeilingSmall(14.5, 0, 3.5, 2.8);

    // ---------- 序厅（西墙）：沉浸式红幕大厅（星空弧幕 + 金色群像 + 黑顶红格栅） ----------
    (function lobby() {
      const g = new THREE.Group();
      const p = WALLS.west.pos(0);
      g.position.set(p[0], 0, p[2]);
      g.rotation.y = WALLS.west.rotY;
      scene.add(g);

      const darkMat = new THREE.MeshLambertMaterial({ color: 0x191b20 });
      const darkMat2 = new THREE.MeshLambertMaterial({ color: 0x23262c });

      // 内嵌展框：暗底板 + 暖白光晕边
      const frameGlow = (x, y, w, h, z) => {
        const f = plane(w, h, new THREE.MeshBasicMaterial({ color: 0x2b2e35 }));
        f.position.set(x, y, z - 0.02);
        g.add(f);
        const glowP = plane(w + 0.14, h + 0.14, new THREE.MeshBasicMaterial({
          map: texFromCanvas(Tex.softGlow()), color: 0xf3e2b8,
          transparent: true, opacity: 0.26, blending: THREE.AdditiveBlending, depthWrite: false,
        }));
        glowP.position.set(x, y, z - 0.045);
        g.add(glowP);
      };

      // ===== 中央：弧形红色星空巨幕（凹面朝观众） =====
      const ARC_R = 8.5;
      const ARC_L = 1.7;
      const arcTex0 = texFromCanvas(Tex.lobbyScreen(2048, 800));
      arcTex0.wrapS = THREE.RepeatWrapping;
      arcTex0.repeat.x = -1;
      arcTex0.offset.x = 1;
      const screen = new THREE.Mesh(
        new THREE.CylinderGeometry(ARC_R, ARC_R, 4.9, 72, 1, true, Math.PI - ARC_L / 2, ARC_L),
        new THREE.MeshBasicMaterial({ map: arcTex0, side: THREE.BackSide })
      );
      screen.position.set(0, 2.75, ARC_R);
      g.add(screen);
      clickables.push({ mesh: screen, zoneId: 'lobby', item: 'lobby' });

      // 弧幕中部：五处红色地标的纪实影像（异步载入后重绘整张弧幕纹理）
      // 注意：弧幕是 CylinderGeometry + BackSide，从内侧看纹理左右镜像，
      // 所以贴图要在此处做一次 UV 水平翻转，否则地名顺序与文字都会反。
      (function lobbyLandmarkPhotos() {
        const order = ['jgs', 'yanan', 'xbp', 'hqq', 'xsd'];
        // 每站一张真实纪实照片（assets/{id}.jpg 是 AI 油画，不能用）
        const srcs = [
          'assets/photos/jgs/jgs-meeting.jpg',
          'assets/photos/yanan/yanan-nanniwan.jpg',
          'assets/photos/xbp/xbp-site.jpg',
          'assets/photos/hqq/hqq-qingniandong.jpg',
          'assets/photos/xsd/xsd-fupin.jpg',
        ];
        const imgs = new Array(order.length);
        let pending = order.length;
        let painted = false;
        const repaint = () => {
          if (painted) return;
          painted = true;
          const t = texFromCanvas(Tex.lobbyScreen(2048, 800, imgs));
          t.wrapS = THREE.RepeatWrapping;
          t.repeat.x = -1;
          t.offset.x = 1;
          screen.material.map = t;
          screen.material.needsUpdate = true;
        };
        const tick = () => { if (--pending === 0) repaint(); };
        srcs.forEach((src, i) => {
          loadPlainImage(src, (im) => { imgs[i] = im; tick(); }, tick);
        });
      })();

      // 弧幕上下缘红色发光弧条
      [0.3, 5.2].forEach((y) => {
        const arcGeo = new THREE.TorusGeometry(ARC_R, 0.038, 10, 96, ARC_L);
        arcGeo.rotateZ(Math.PI / 2 - ARC_L / 2);
        arcGeo.rotateX(-Math.PI / 2);
        const arcBar = new THREE.Mesh(arcGeo, new THREE.MeshBasicMaterial({ color: 0xff4530 }));
        arcBar.position.set(0, y, ARC_R);
        g.add(arcBar);
      });

      // ===== 弧幕内侧：独立闪烁星点（逐颗相位） =====
      (function lobbyStars() {
        const N = 160;
        const r = ARC_R - 0.18;
        const pos = new Float32Array(N * 3);
        const col = new Float32Array(N * 3);
        const phase = new Float32Array(N);
        const speed = new Float32Array(N);
        const base = new Float32Array(N * 3);
        for (let i = 0; i < N; i++) {
          // 沿弧面角度采样（θ 以 π 为中心，±ARC_L/2）
          const theta = Math.PI - ARC_L / 2 + Math.random() * ARC_L;
          pos[i * 3] = r * Math.sin(theta);
          pos[i * 3 + 1] = 0.9 + Math.random() * 3.9;
          pos[i * 3 + 2] = r * Math.cos(theta);
          phase[i] = Math.random() * Math.PI * 2;
          speed[i] = 1.5 + Math.random() * 2.5;
          // 暖白/淡蓝两种星色
          const warm = Math.random() > 0.3;
          const c = warm ? [1.0, 0.92, 0.72] : [0.72, 0.85, 1.0];
          base[i * 3] = c[0]; base[i * 3 + 1] = c[1]; base[i * 3 + 2] = c[2];
          col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        const mat = new THREE.PointsMaterial({
          size: 0.09, vertexColors: true, transparent: true, opacity: 0.9,
          sizeAttenuation: true, depthWrite: false, blending: THREE.AdditiveBlending,
        });
        const pts = new THREE.Points(geo, mat);
        g.add(pts);
        lobbyStarRef = { pts, phase, speed, base, N };
      })();

      // ===== 巨幕脚下：金色光台 + 「星星之火」发光标题 =====
      const glow = plane(9.5, 4.6, new THREE.MeshBasicMaterial({
        map: texFromCanvas(Tex.softGlow()), color: 0xffc878,
        transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      glow.rotation.x = -Math.PI / 2;
      glow.position.set(0, 0.03, 1.6);
      g.add(glow);

      // 全息中国地图投影（讲桌上方，默认隐藏，点击讲桌后显示）
      const holoMap = plane(2.8, 2.1, new THREE.MeshBasicMaterial({
        map: texFromCanvas(Tex.holoChina()), transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }));
      holoMap.position.set(0, 2.5, 1.5);
      g.add(holoMap);
      // billboard：始终面向相机，保留上下浮动；不做 y 自转
      spinners.push({ obj: holoMap, billboard: true, bob: 0.08, baseY: 2.5 });

      // 讲桌（深色木质 + 鎏金饰边）
      (function podium() {
        const woodMat = new THREE.MeshLambertMaterial({ color: 0x3a2418 });
        const darkWood = new THREE.MeshLambertMaterial({ color: 0x2a1810 });
        const goldMat = new THREE.MeshBasicMaterial({ color: 0xcfa850 });
        // 桌身（梯形，用 Box 近似）
        const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.0, 0.7), woodMat);
        body.position.set(0, 0.5, 1.5);
        g.add(body);
        // 桌面（略倾斜）
        const top = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.06, 0.8), darkWood);
        top.position.set(0, 1.02, 1.45);
        top.rotation.x = -0.12;
        g.add(top);
        // 桌面鎏金边
        const edge = new THREE.Mesh(new THREE.BoxGeometry(2.12, 0.03, 0.04), goldMat);
        edge.position.set(0, 1.0, 1.82);
        g.add(edge);
        // 桌身正面鎏金饰条
        const trim = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.04, 0.02), goldMat);
        trim.position.set(0, 0.85, 1.86);
        g.add(trim);
        // 底座脚
        const foot = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.08, 0.8), darkWood);
        foot.position.set(0, 0.04, 1.5);
        g.add(foot);
        // 点击热区（整个桌身可点击）
        clickables.push({ mesh: body, zoneId: 'lobby', item: 'holomap', holoMesh: holoMap });
        // 桌面"点亮地图"提示
        const hintCv = document.createElement('canvas');
        hintCv.width = 512; hintCv.height = 128;
        const hg = hintCv.getContext('2d');
        hg.fillStyle = 'rgba(0,0,0,0)';
        hg.fillRect(0, 0, 512, 128);
        hg.fillStyle = '#ffd97a';
        hg.font = 'bold 48px "Microsoft YaHei", sans-serif';
        hg.textAlign = 'center';
        hg.fillText('✨ 点亮地图', 256, 80);
        const hint = plane(1.3, 0.32, new THREE.MeshBasicMaterial({
          map: texFromCanvas(hintCv), transparent: true,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }));
        hint.position.set(0, 0.85, 1.88);
        g.add(hint);
      })();
      // 「星星之火 可以燎原」标题图已按需求移除（原 assets/lobby-title.png）。
      // 弧幕 screen 本身已注册 lobby 点击热区，删掉该图不影响入场交互。

      // ===== 弧幕上方：立体主题字（行走的思政课）+ 副标题 =====
      (function bigTitle() {
        const chars = '行走的思政课'.split('');
        const cw = 0.66;
        const totalW = chars.length * (cw + 0.06) - 0.06;
        const sideMat = new THREE.MeshLambertMaterial({ color: 0x8a6a30 });
        chars.forEach((ch, i) => {
          const x = -totalW / 2 + cw / 2 + i * (cw + 0.06);
          const face = new THREE.MeshBasicMaterial({ map: texFromCanvas(Tex.glowChar(ch)), transparent: true });
          const box = new THREE.Mesh(new THREE.BoxGeometry(cw, 0.92, 0.22), [
            sideMat, sideMat, sideMat, sideMat, face, sideMat,
          ]);
          box.position.set(x, 5.28, 1.9);
          g.add(box);
          const halo = plane(cw * 2.0, 1.8, new THREE.MeshBasicMaterial({
            map: texFromCanvas(Tex.softGlow()), color: 0xffe9b8,
            transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false,
          }));
          halo.position.set(x, 5.28, 1.82);
          g.add(halo);
        });
        const sub = plane(4.9, 0.7, new THREE.MeshBasicMaterial({
          map: texFromCanvas(Tex.subLine('红色地标 VR 虚拟展馆')), transparent: true,
        }));
        sub.position.set(0, 4.62, 1.9);
        g.add(sub);
      })();

      // ===== 左右深色展墙已移除（保持序厅简洁，只留中央弧幕和发光字） =====

      // ===== 顶面：黑顶 + 淡金山形装饰 =====
      (function ceilingLobby() {
        const raft = new THREE.Mesh(new THREE.BoxGeometry(22, 0.22, 10.4), new THREE.MeshLambertMaterial({ color: 0x0a0b0f }));
        raft.position.set(0, 5.92, 2.4);
        g.add(raft);
        // 天花板下方淡金山形线条（中国水墨风）
        const deco = plane(22, 10.4, new THREE.MeshBasicMaterial({
          map: texFromCanvas(Tex.wallDeco()), transparent: true, opacity: 0.55,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        }));
        deco.rotation.x = Math.PI / 2;
        deco.position.set(0, 5.8, 2.4);
        g.add(deco);
      })();

      // ===== 地面：红色动线（外圈矩形 + 与巨幕同心的弧形灯带） =====
      (function floorLines() {
        const lineMat = new THREE.MeshBasicMaterial({ color: 0xff3a28 });
        [
          { w: 18.6, d: 0.09, x: 0, z: 7.4 },
          { w: 18.6, d: 0.09, x: 0, z: 0.45 },
        ].forEach((m) => {
          const b = new THREE.Mesh(new THREE.BoxGeometry(m.w, 0.02, m.d), lineMat);
          b.position.set(m.x, 0.02, m.z);
          g.add(b);
        });
        [
          { x: -9.3, z: 3.95 },
          { x: 9.3, z: 3.95 },
        ].forEach((m) => {
          const b = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.02, 6.95), lineMat);
          b.position.set(m.x, 0.02, m.z);
          g.add(b);
        });
        const arcGeo = new THREE.RingGeometry(ARC_R - 2.4, ARC_R - 2.26, 96, 1, Math.PI / 2 - ARC_L / 2, ARC_L);
        arcGeo.rotateX(-Math.PI / 2);
        const arc = new THREE.Mesh(arcGeo, new THREE.MeshBasicMaterial({
          color: 0xff4530, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false,
        }));
        arc.position.set(0, 0.025, ARC_R);
        g.add(arc);
      })();

      // ===== 全息元素：左侧双环 + 右侧 VR 眼镜线框（缓慢旋转） =====
      (function holo() {
        const holoMat = new THREE.MeshBasicMaterial({ color: 0x8fd4ff, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false });
        const r1 = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.03, 10, 72), holoMat);
        r1.position.set(-4.6, 2.1, 3.8);
        r1.rotation.x = 1.15;
        g.add(r1);
        const r2 = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.025, 10, 72), holoMat.clone());
        r2.position.set(-4.6, 2.4, 3.8);
        r2.rotation.x = 1.35;
        r2.rotation.y = 0.4;
        g.add(r2);
        spinners.push({ obj: r1, axis: 'y', speed: 0.8 });
        spinners.push({ obj: r2, axis: 'y', speed: -0.6 });

        const vg = new THREE.Group();
        vg.position.set(5.6, 3.3, 3.8);
        g.add(vg);
        const edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(new THREE.BoxGeometry(1.0, 0.44, 0.55)),
          new THREE.LineBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.75 })
        );
        vg.add(edges);
        [-0.24, 0.24].forEach((dx) => {
          const lens = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.012, 8, 32), holoMat);
          lens.position.set(dx, 0.02, -0.28);
          lens.rotation.x = Math.PI / 2;
          vg.add(lens);
        });
        spinners.push({ obj: vg, axis: 'y', speed: 0.3, bob: 0.1, baseY: 3.3 });
      })();

      g.updateMatrixWorld(true);
      const wp = new THREE.Vector3(0, 1.65, 6.8);
      g.localToWorld(wp);
      const wt = new THREE.Vector3(0, 2.8, 0);
      g.localToWorld(wt);
      zoneViews.lobby = { pos: wp, target: wt };

      // 序厅碰撞保护
      const corners = [
        new THREE.Vector3(-10.5, 0, 0),
        new THREE.Vector3(10.5, 0, 0),
        new THREE.Vector3(-10.5, 0, 2.6),
        new THREE.Vector3(10.5, 0, 2.6),
      ].map((v) => g.localToWorld(v));
      collidables.push({
        minX: Math.min(...corners.map((v) => v.x)),
        maxX: Math.max(...corners.map((v) => v.x)),
        minZ: Math.min(...corners.map((v) => v.z)),
        maxZ: Math.max(...corners.map((v) => v.z)),
      });
    })();

    // ---------- 五个主题展区（现代党建展厅布局） ----------
    // ---------- 五个主题展区（新版：主展板+人物立牌+资料卡布局） ----------
    data.zones.forEach((zone) => {
      const g = new THREE.Group();
      const p = WALLS[zone.wall].pos(zone.u);
      g.position.set(p[0], 0, p[2]);
      g.rotation.y = WALLS[zone.wall].rotY;
      scene.add(g);

      const plan = zoneSlotPlan(zone); // 本厅五个槽位分别用哪张图

      // 1. 背景墙：深色底 + 金色山形线条
      const bgWall = plane(15, 5.2, new THREE.MeshBasicMaterial({
        map: texFromCanvas(Tex.bgMountains()),
      }));
      bgWall.position.set(0, 2.7, 0.04);
      g.add(bgWall);

      // 2. 左侧主展板（jgs展区直接用原图）
      const mpBack = plane(7.0, 4.45, new THREE.MeshBasicMaterial({ color: 0x2a1a12 }));
      mpBack.position.set(-3.7, 2.6, 0.12);
      g.add(mpBack);
      const mainPanelMat = new THREE.MeshBasicMaterial({ map: texFromCanvas(Tex.mainPanel(zone, null, null, plan.photos)) });
      const mainPanel = plane(6.85, 4.3, mainPanelMat);
      mainPanel.position.set(-3.7, 2.6, 0.16);
      g.add(mainPanel);
      clickables.push({ mesh: mainPanel, zoneId: zone.id, item: 'board' });

      // 3. 中间两个人物立牌
      (zone.figures || []).slice(0, 2).forEach((fig, i) => {
        const fx = 0.7 + i * 1.35;
        const figBack = plane(1.05, 2.2, new THREE.MeshBasicMaterial({ color: 0x2a1a12 }));
        figBack.position.set(fx, 2.25, 0.14);
        g.add(figBack);
        const figMat = new THREE.MeshBasicMaterial({ map: texFromCanvas(Tex.figureStand(fig, zone)) });
        const figMesh = plane(0.95, 2.1, figMat);
        figMesh.position.set(fx, 2.25, 0.18);
        g.add(figMesh);
        clickables.push({ mesh: figMesh, zoneId: zone.id, item: 'figure', fig: fig });
        // 真实肖像照片：异步加载成功后重绘立牌
        const figPhoto = plan.figPhotos[i];
        if (figPhoto) {
          loadPlainImage(figPhoto, (im) => {
            figMat.map = texFromCanvas(Tex.figureStand(fig, zone, im));
            figMat.needsUpdate = true;
          });
        }
        const base = new THREE.Mesh(
          new THREE.BoxGeometry(1.15, 0.12, 0.35),
          new THREE.MeshLambertMaterial({ color: 0x2a2018 })
        );
        base.position.set(fx, 0.06, 0.2);
        g.add(base);
      });

      // 4. 右侧6个竖向资料卡
      const scBack = plane(4.6, 2.4, new THREE.MeshBasicMaterial({ color: 0x1a1410 }));
      scBack.position.set(5.3, 3.2, 0.12);
      g.add(scBack);
      const sideCardsMat = new THREE.MeshBasicMaterial({ map: texFromCanvas(Tex.sideCards(zone)) });
      const sideCards = plane(4.5, 2.25, sideCardsMat);
      sideCards.position.set(5.3, 3.2, 0.16);
      g.add(sideCards);
      clickables.push({ mesh: sideCards, zoneId: zone.id, item: 'spirit' });

      // 5. 嵌入式视频屏（资料卡下方）
      const bezel = new THREE.Mesh(
        new THREE.BoxGeometry(2.6, 1.45, 0.1),
        new THREE.MeshLambertMaterial({ color: 0x15181d })
      );
      bezel.position.set(5.3, 1.2, 0.2);
      g.add(bezel);
      const lcd = plane(2.4, 1.25, new THREE.MeshBasicMaterial({
        map: texFromCanvas(Tex.videoScreen(zone)),
      }));
      lcd.position.set(5.3, 1.2, 0.27);
      g.add(lcd);
      clickables.push({ mesh: lcd, zoneId: zone.id, item: 'video' });
      // 懒加载：进入该站时由 Museum.captureFrame(zoneId) 抽取视频帧，避免五站并发下载
      videoScreens[zone.id] = { zone, mesh: lcd, done: false };
      // 预抽封面帧优先：tools/make_posters.py 生成的静态帧，一进场就有真实画面，
      // 不依赖 400MB 视频的缓冲与 seek；缺失时再退回 captureFrame 的运行时抽帧。
      loadPlainImage('assets/posters/' + zone.id + '.jpg', (im) => {
        const rec = videoScreens[zone.id];
        if (!rec || rec.done) return;
        lcd.material.map = texFromCanvas(Tex.videoScreen(zone, im));
        lcd.material.needsUpdate = true;
        rec.poster = true;
      });

      // 7. 展区洗墙灯带（围住整个展区矩形框）
      (function zoneFrameLight() {
        const lw = 0.06;
        const W = 15, H = 4.4;
        const cx = 0.2, cy = 2.6;
        const mat = new THREE.MeshBasicMaterial({ color: 0xfff2dc });
        // 上边
        const top = new THREE.Mesh(new THREE.BoxGeometry(W, lw, 0.04), mat);
        top.position.set(cx, cy + H / 2, 0.2);
        g.add(top);
        // 下边
        const bot = new THREE.Mesh(new THREE.BoxGeometry(W, lw, 0.04), mat);
        bot.position.set(cx, cy - H / 2, 0.2);
        g.add(bot);
        // 左边
        const left = new THREE.Mesh(new THREE.BoxGeometry(lw, H, 0.04), mat);
        left.position.set(cx - W / 2, cy, 0.2);
        g.add(left);
        // 右边
        const right = new THREE.Mesh(new THREE.BoxGeometry(lw, H, 0.04), mat);
        right.position.set(cx + W / 2, cy, 0.2);
        g.add(right);
      })();

      // 8. 前景红色地台 + 鎏金大字标语
      (function foreground() {
        const plat = new THREE.Mesh(
          new THREE.BoxGeometry(15, 0.28, 3.2),
          new THREE.MeshLambertMaterial({ map: texFromCanvas(Tex.redMatte(), [4, 1]) })
        );
        plat.position.set(0.2, 0.14, 4.6);
        g.add(plat);
        // 红色地台碰撞：挡住观众走上抬高的台面（水平 AABB，局部 z 3.0→6.2）
        g.updateMatrixWorld(true);
        const plCorners = [
          [-7.3, 3.0], [7.7, 3.0], [-7.3, 6.2], [7.7, 6.2],
        ].map(([lx, lz]) => g.localToWorld(new THREE.Vector3(lx, 0, lz)));
        collidables.push({
          minX: Math.min(...plCorners.map((v) => v.x)),
          maxX: Math.max(...plCorners.map((v) => v.x)),
          minZ: Math.min(...plCorners.map((v) => v.z)),
          maxZ: Math.max(...plCorners.map((v) => v.z)),
        });
        // 台前感应条（贴过道侧外边缘）：只触发“可绕近参观”提示，不参与实体阻挡
        g.updateMatrixWorld(true);
        const hz = [
          [-7.3, 6.2], [7.7, 6.2], [-7.3, 6.6], [7.7, 6.6],
        ].map(([lx, lz]) => g.localToWorld(new THREE.Vector3(lx, 0, lz)));
        collidables.push({
          minX: Math.min(...hz.map((v) => v.x)),
          maxX: Math.max(...hz.map((v) => v.x)),
          minZ: Math.min(...hz.map((v) => v.z)),
          maxZ: Math.max(...hz.map((v) => v.z)),
          hint: '此处为展台，可绕近参观',
          noBlock: true,
        });
        const edge = new THREE.Mesh(
          new THREE.BoxGeometry(15.06, 0.05, 0.06),
          new THREE.MeshBasicMaterial({ color: 0xcfa850 })
        );
        edge.position.set(0.2, 0.3, 6.18);
        g.add(edge);
        const chars = String(zone.slogan || zone.name).replace(/[，,、。\s]/g, '').split('');
        // 标语立在红色展台台面上（台面 y=0.28，台体 z 3.0~6.2），
        // 字块顶端约 0.96，远低于展板照片带下沿（y≈0.71 以上），不会挡住展板内容。
        const PLAT_TOP = 0.28;
        const cw = chars.length > 9 ? 0.30 : 0.46;
        const gap = chars.length > 9 ? 0.036 : 0.05;
        const boxH = 0.68;
        const totalW = chars.length * (cw + gap) - gap;
        const sideMat = new THREE.MeshBasicMaterial({ color: 0xb81f18 });
        chars.forEach((ch, i) => {
          const x = 0.2 - totalW / 2 + cw / 2 + i * (cw + gap);
          const face = new THREE.MeshBasicMaterial({
            map: texFromCanvas(Tex.glowChar(ch)), transparent: true,
          });
          const box = new THREE.Mesh(new THREE.BoxGeometry(cw, boxH, 0.18), [
            sideMat, sideMat, sideMat, sideMat, face, new THREE.MeshBasicMaterial({ color: 0x8f1712 }),
          ]);
          box.position.set(x, PLAT_TOP + boxH / 2, 4.6);
          g.add(box);
          const halo = plane(cw * 2.2, 1.35, new THREE.MeshBasicMaterial({
            map: texFromCanvas(Tex.softGlow()), color: 0xffd97a,
            transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false,
          }));
          halo.position.set(x, PLAT_TOP + boxH / 2 + 0.01, 4.47);
          g.add(halo);
        });
      })();

      // 9. 配图就位后刷新主展板（所有展厅统一标准展板；无主图时回退山景插画）
      {
        const photoSrcs = plan.photos;
        const paintWith = (img) => {
          const photoImgs = new Array(photoSrcs.length);
          let pending = photoSrcs.length;
          const paint = () => {
            mainPanelMat.map = texFromCanvas(Tex.mainPanel(zone, img, photoImgs, photoSrcs));
            mainPanelMat.needsUpdate = true;
          };
          if (pending === 0) { paint(); return; }
          photoSrcs.forEach((p, pi) => {
            loadPlainImage(p.src, (im) => {
              photoImgs[pi] = im;
              if (--pending === 0) paint();
            }, () => { if (--pending === 0) paint(); });
          });
        };
        const heroSrc = plan.hero || ('assets/' + zone.id + '.jpg');
        loadPlainImage(heroSrc, paintWith, () => {
          loadImageOrDefault('assets/' + zone.id + '.jpg', Tex.scene(zone.scene, zone.place), (t) => {
            if (t && t.image) paintWith(t.image);
          });
        });
      }

      // 10. 地面圆标
      const mark = plane(3.6, 3.6, new THREE.MeshBasicMaterial({
        map: texFromCanvas(Tex.floorMark(zone)), transparent: true,
      }));
      mark.rotation.x = -Math.PI / 2;
      mark.position.set(0, 0.03, 7.9);
      g.add(mark);
      marks[zone.id] = mark;

      // 11. 地面光带
      const strip = plane(14, 0.24, new THREE.MeshBasicMaterial({
        color: new THREE.Color(zone.accent), transparent: true, opacity: 0.5,
      }));
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(0, 0.025, 6.7);
      g.add(strip);

      // 12. 引导箭头
      const arrowHolder = new THREE.Group();
      arrowHolder.rotation.y = -Math.PI / 2;
      arrowHolder.position.set(8.2, 0.04, 7.4);
      g.add(arrowHolder);
      const arrow = plane(1.1, 1.1, new THREE.MeshBasicMaterial({
        map: texFromCanvas(Tex.arrow('rgba(255,215,120,0.8)')), transparent: true,
      }));
      arrow.rotation.x = -Math.PI / 2;
      arrowHolder.add(arrow);
      arrow.userData.pulse = true;

      // 更新世界矩阵
      g.updateMatrixWorld(true);

      // 观看点
      const wp = new THREE.Vector3(0, 1.65, 8.1);
      g.localToWorld(wp);
      const wt = new THREE.Vector3(0, 2.6, 0);
      g.localToWorld(wt);
      zoneViews[zone.id] = { pos: wp, target: wt };

      // 不再为展区前方设置整片隐形碰撞，允许观众走到展板、立牌、资料卡跟前；
      // 活动范围由房间四周边界（setBounds）约束，避免走出展厅。
    });

    // 进入某站时调用，懒加载抽取该站视频屏封面帧（幂等）
    Museum.captureFrame = function (zoneId) {
      const rec = videoScreens[zoneId];
      if (rec) doCapture(rec);
    };

    return { collidables, clickables, zoneViews, marks, spinners, stars: starsRef, lobbyStars: lobbyStarRef, room: ROOM, half: { w: HALF_W, d: HALF_D } };
  };

  // ---------- 辅助：立式展牌 ----------
  function makeStand(zone, canvas, w, h) {
    const grp = new THREE.Group();
    const panel = plane(w, h, new THREE.MeshBasicMaterial({ map: texFromCanvas(canvas) }));
    panel.position.set(0, h / 2 + 0.55, 0);
    panel.rotation.x = -0.1;
    grp.add(panel);
    const back = plane(w + 0.14, h + 0.14, new THREE.MeshLambertMaterial({ color: 0x22252b }));
    back.position.set(0, h / 2 + 0.55, -0.03);
    back.rotation.x = -0.1;
    grp.add(back);
    const foot = plane(w + 0.1, 0.55, new THREE.MeshLambertMaterial({ color: 0x2c3038 }));
    foot.position.set(0, 0.28, 0.02);
    grp.add(foot);
    grp.userData.panel = panel;
    return grp;
  }

  // ---------- 辅助：思考题展牌内容 ----------
  function makeQuestionCanvas(zone) {
    const W = 760;
    const H = 980;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#fbf8f2');
    bg.addColorStop(1, '#ece5d8');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    g.fillStyle = zone.accent;
    g.fillRect(0, 0, W, 14);
    g.font = 'bold 54px "Microsoft YaHei",sans-serif';
    g.fillStyle = '#22201c';
    g.fillText('思考与讨论', 48, 116);
    g.fillStyle = zone.accent;
    g.fillRect(48, 140, 110, 6);
    let y = 214;
    zone.questions.forEach((q, i) => {
      g.fillStyle = zone.accent;
      g.beginPath();
      g.arc(72, y - 14, 24, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.font = 'bold 28px "Microsoft YaHei",sans-serif';
      g.textAlign = 'center';
      g.fillText(String(i + 1), 72, y - 4);
      g.textAlign = 'left';
      g.fillStyle = '#2b2721';
      g.font = '30px "Microsoft YaHei",sans-serif';
      let line = '';
      let yy = y;
      const maxW = W - 190;
      for (const ch of q.q) {
        if (g.measureText(line + ch).width > maxW) {
          g.fillText(line, 116, yy);
          yy += 44;
          line = ch;
        } else line += ch;
      }
      g.fillText(line, 116, yy);
      y = yy + 110;
      // 虚线分隔
      g.strokeStyle = 'rgba(0,0,0,0.15)';
      g.lineWidth = 2;
      g.setLineDash([8, 8]);
      g.beginPath();
      g.moveTo(48, y - 56);
      g.lineTo(W - 48, y - 56);
      g.stroke();
      g.setLineDash([]);
    });
    g.fillStyle = '#8a8175';
    g.font = '26px "Microsoft YaHei",sans-serif';
    g.fillText('点击展牌或打开详情面板查看答题要点', 48, H - 56);
    return c;
  }

  // ---------- 辅助：动线说明牌 ----------
  function makeRouteCanvas(data) {
    const W = 900;
    const H = 268;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(24,27,34,0.92)';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#c0392b';
    g.fillRect(0, 0, 8, H);
    g.font = 'bold 38px "Microsoft YaHei",sans-serif';
    g.fillStyle = '#ffd97a';
    g.fillText('参观动线（按历史时间顺序）', 40, 62);
    const items = ['序厅', '井冈山', '延安', '西柏坡', '红旗渠', '新时代'];
    const startX = 52;
    items.forEach((it, i) => {
      const x = startX + i * 138;
      g.fillStyle = i === 0 ? '#8a8175' : '#c0392b';
      g.beginPath();
      g.arc(x, 132, 20, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.font = 'bold 22px "Microsoft YaHei",sans-serif';
      g.textAlign = 'center';
      g.fillText(i === 0 ? '起' : String(i), x, 140);
      g.fillStyle = '#f0ece4';
      g.font = '28px "Microsoft YaHei",sans-serif';
      g.fillText(it, x, 196);
      if (i < items.length - 1) {
        g.strokeStyle = 'rgba(255,255,255,0.35)';
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(x + 30, 132);
        g.lineTo(x + 108, 132);
        g.stroke();
      }
    });
    g.textAlign = 'left';
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.font = '24px "Microsoft YaHei",sans-serif';
    g.fillText('沿地面光带顺时针前行', 52, 244);
    return c;
  }

  Museum.ROOM = ROOM;
  window.Museum = Museum;
})();
