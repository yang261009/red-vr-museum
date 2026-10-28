/**
 * 展馆视觉素材生成器（程序化 Canvas 绘制）
 * 说明：所有图像均可被真实素材替换——
 *   把图片放到 assets/{展区id}.jpg（如 assets/hqq.jpg）即自动覆盖插画；
 *   也可在详情面板中粘贴在线图片地址。
 */
(function () {
  const FONT = '"Microsoft YaHei","PingFang SC","Hiragino Sans GB","Source Han Sans SC",sans-serif';
  const SERIF = '"Songti SC","SimSun","Source Han Serif SC",serif';

  function cv(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  function wrap(ctx, text, maxW) {
    const lines = [];
    let line = '';
    for (const ch of String(text)) {
      if (ch === '\n') {
        lines.push(line);
        line = '';
        continue;
      }
      const test = line + ch;
      if (ctx.measureText(test).width > maxW && line) {
        lines.push(line);
        line = ch;
      } else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }

  function text(ctx, str, x, y, size, color, opts) {
    opts = opts || {};
    ctx.save();
    ctx.font = `${opts.weight || 'normal'} ${size}px ${opts.serif ? SERIF : FONT}`;
    ctx.fillStyle = color;
    ctx.textBaseline = opts.baseline || 'alphabetic';
    if (opts.align) ctx.textAlign = opts.align;
    if (opts.letter) ctx.letterSpacing = opts.letter; // 部分浏览器支持
    if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
    ctx.fillText(str, x, y);
    ctx.restore();
  }

  function para(ctx, str, x, y, size, color, maxW, lh) {
    const lines = wrap(ctx, str, maxW);
    lines.forEach((l, i) => text(ctx, l, x, y + i * (lh || size * 1.7), size, color));
    return y + lines.length * (lh || size * 1.7);
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function noise(ctx, w, h, amount, alpha) {
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * amount;
      d[i] += n;
      d[i + 1] += n;
      d[i + 2] += n;
    }
    ctx.putImageData(img, 0, 0);
    if (alpha) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.restore();
    }
  }

  // ---------- 建筑材质 ----------
  const Tex = {};

  Tex.wall = function () {
    const c = cv(512, 512);
    const g = c.getContext('2d');
    // 深褐近黑纪念馆墙，带微妙暖调渐变
    const grad = g.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, '#2e2420');
    grad.addColorStop(0.5, '#251d1a');
    grad.addColorStop(1, '#1c1614');
    g.fillStyle = grad;
    g.fillRect(0, 0, 512, 512);
    // 极淡的竖向分缝（暖金微光）
    g.strokeStyle = 'rgba(255,210,150,0.07)';
    g.lineWidth = 1;
    for (let x = 0; x <= 512; x += 128) {
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 512); g.stroke();
    }
    // 顶部洗墙灯光晕（从上方略亮）
    const topGlow = g.createLinearGradient(0, 0, 0, 200);
    topGlow.addColorStop(0, 'rgba(255,200,130,0.08)');
    topGlow.addColorStop(1, 'rgba(255,200,130,0)');
    g.fillStyle = topGlow;
    g.fillRect(0, 0, 512, 200);
    noise(g, 512, 512, 10);
    return c;
  };

  Tex.floor = function () {
    const c = cv(512, 512);
    const g = c.getContext('2d');
    // 深暖灰大理石底色渐变
    const bg = g.createLinearGradient(0, 0, 512, 512);
    bg.addColorStop(0, '#342f2c');
    bg.addColorStop(0.5, '#2a2623');
    bg.addColorStop(1, '#36312d');
    g.fillStyle = bg;
    g.fillRect(0, 0, 512, 512);
    // 云雾色团（明暗起伏）
    for (let i = 0; i < 16; i++) {
      const x = Math.random() * 512, y = Math.random() * 512, r = 60 + Math.random() * 150;
      const rg = g.createRadialGradient(x, y, 0, x, y, r);
      const light = Math.random() > 0.5;
      rg.addColorStop(0, light ? 'rgba(255,236,205,0.055)' : 'rgba(0,0,0,0.12)');
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    // 大理石脉络（随机游走的淡金细纹，含分叉）
    const vein = (x0, y0, angle, len, alpha, width) => {
      g.strokeStyle = `rgba(216,192,152,${alpha})`;
      g.lineWidth = width;
      g.lineCap = 'round';
      g.beginPath(); g.moveTo(x0, y0);
      let x = x0, y = y0, a = angle;
      const steps = 26;
      for (let s = 0; s < steps; s++) {
        a += (Math.random() - 0.5) * 0.55;
        const step = len / steps;
        x += Math.cos(a) * step;
        y += Math.sin(a) * step;
        g.lineTo(x, y);
      }
      g.stroke();
    };
    for (let i = 0; i < 10; i++) {
      vein(
        Math.random() * 512, Math.random() * 512,
        Math.random() * Math.PI * 2,
        280 + Math.random() * 320,
        0.09 + Math.random() * 0.13,
        0.7 + Math.random() * 1.5
      );
    }
    // 大板分缝（2×2，淡金细线）
    g.strokeStyle = 'rgba(212,168,74,0.20)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(256, 0); g.lineTo(256, 512);
    g.moveTo(0, 256); g.lineTo(512, 256);
    g.stroke();
    noise(g, 512, 512, 10);
    return c;
  };

  Tex.ceil = function () {
    const c = cv(256, 256);
    const g = c.getContext('2d');
    g.fillStyle = '#20242b';
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(255,255,255,0.05)';
    g.lineWidth = 2;
    for (let i = 0; i <= 256; i += 64) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i, 256);
      g.stroke();
    }
    return c;
  };

  // ---------- 地标插画 ----------
  function skyGradient(g, w, h, stops) {
    const grad = g.createLinearGradient(0, 0, 0, h);
    stops.forEach((s) => grad.addColorStop(s[0], s[1]));
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  }

  // 多层山峦剪影
  function ridge(g, w, h, baseY, amp, color, seed, roughness) {
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(0, h);
    g.lineTo(0, baseY);
    let x = 0;
    let rnd = seed;
    const rand = () => ((rnd = (rnd * 9301 + 49297) % 233280) / 233280);
    while (x < w) {
      const step = 40 + rand() * 60;
      const peak = baseY - amp * (0.35 + rand() * 0.65);
      g.lineTo(x + step * 0.5, peak);
      x += step;
      if (roughness) g.lineTo(x, baseY - amp * 0.15 * rand());
      else g.lineTo(x, baseY - amp * 0.1);
    }
    g.lineTo(w, baseY);
    g.lineTo(w, h);
    g.closePath();
    g.fill();
  }

  function pineTree(g, x, y, scale, color) {
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x - 14 * scale, y);
    g.lineTo(x - 3 * scale, y - 14 * scale);
    g.lineTo(x - 9 * scale, y - 14 * scale);
    g.lineTo(x - 1 * scale, y - 30 * scale);
    g.lineTo(x - 6 * scale, y - 30 * scale);
    g.lineTo(x, y - 46 * scale);
    g.lineTo(x + 6 * scale, y - 30 * scale);
    g.lineTo(x + 1 * scale, y - 30 * scale);
    g.lineTo(x + 9 * scale, y - 14 * scale);
    g.lineTo(x + 3 * scale, y - 14 * scale);
    g.lineTo(x + 14 * scale, y);
    g.closePath();
    g.fill();
  }

  const scenes = {
    // 井冈山：层叠青山 + 松林 + 云海 + 红旗
    mountain(g, w, h, accent) {
      skyGradient(g, w, h, [
        [0, '#f6d9a8'],
        [0.35, '#f0b184'],
        [0.7, '#d98d7a'],
        [1, '#a86f70'],
      ]);
      // 太阳
      g.fillStyle = 'rgba(255,240,205,0.85)';
      g.beginPath();
      g.arc(w * 0.74, h * 0.3, 46, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,240,205,0.18)';
      g.beginPath();
      g.arc(w * 0.74, h * 0.3, 92, 0, Math.PI * 2);
      g.fill();
      // 云海
      g.fillStyle = 'rgba(255,255,255,0.35)';
      for (let i = 0; i < 5; i++) {
        const cy = h * (0.46 + i * 0.045);
        g.beginPath();
        g.ellipse(w * (0.15 + i * 0.2), cy, 130 - i * 8, 16, 0, 0, Math.PI * 2);
        g.fill();
      }
      ridge(g, w, h, h * 0.66, h * 0.3, '#8f6b74', 12);
      ridge(g, w, h, h * 0.76, h * 0.26, '#6d505f', 77);
      ridge(g, w, h, h * 0.88, h * 0.22, '#453a4c', 231);
      // 前景松林
      for (let i = 0; i < 14; i++) {
        pineTree(g, 30 + i * (w / 13) + (i % 3) * 8, h * 0.98, 1.5 + (i % 4) * 0.35, '#22242f');
      }
      // 山顶红旗
      g.fillStyle = accent;
      const fx = w * 0.5;
      const fy = h * 0.4;
      g.fillRect(fx, fy, 3, 44);
      g.beginPath();
      g.moveTo(fx + 3, fy);
      g.lineTo(fx + 34, fy + 11);
      g.lineTo(fx + 3, fy + 24);
      g.closePath();
      g.fill();
    },

    // 延安：黄土高原 + 宝塔山 + 窑洞灯火
    yanan(g, w, h, accent) {
      skyGradient(g, w, h, [
        [0, '#f7c98b'],
        [0.4, '#e8a05c'],
        [0.75, '#c67b45'],
        [1, '#8f5a34'],
      ]);
      g.fillStyle = 'rgba(255,225,170,0.9)';
      g.beginPath();
      g.arc(w * 0.28, h * 0.34, 40, 0, Math.PI * 2);
      g.fill();
      ridge(g, w, h, h * 0.52, h * 0.16, '#c89763', 5);
      ridge(g, w, h, h * 0.62, h * 0.2, '#a97c4d', 55);
      ridge(g, w, h, h * 0.74, h * 0.18, '#86603c', 321);
      // 塬（黄土台地）
      g.fillStyle = '#6f4f31';
      g.fillRect(0, h * 0.78, w, h * 0.22);
      // 沟壑
      g.strokeStyle = 'rgba(45,30,18,0.45)';
      g.lineWidth = 6;
      for (let i = 0; i < 6; i++) {
        g.beginPath();
        g.moveTo(w * (0.05 + i * 0.17), h * 0.8);
        g.quadraticCurveTo(w * (0.1 + i * 0.17), h * 0.93, w * (0.13 + i * 0.17), h);
        g.stroke();
      }
      // 宝塔山（宝塔剪影）
      const bx = w * 0.62;
      const by = h * 0.78;
      g.fillStyle = '#3a2a1d';
      const tiers = 6;
      for (let i = 0; i < tiers; i++) {
        const tw = 62 - i * 7;
        const ty = by - i * 34;
        g.fillRect(bx - tw / 2, ty - 26, tw, 26);
        g.beginPath();
        g.moveTo(bx - tw / 2 - 9, ty - 26);
        g.lineTo(bx + tw / 2 + 9, ty - 26);
        g.lineTo(bx + tw / 2 - 3, ty - 33);
        g.lineTo(bx - tw / 2 + 3, ty - 33);
        g.closePath();
        g.fill();
      }
      g.beginPath();
      g.moveTo(bx - 5, by - tiers * 34 - 26);
      g.lineTo(bx + 5, by - tiers * 34 - 26);
      g.lineTo(bx, by - tiers * 34 - 46);
      g.closePath();
      g.fill();
      // 窑洞（拱形门窗+暖光）
      for (let i = 0; i < 5; i++) {
        const x = 60 + i * 150;
        const y = h * 0.845;
        g.fillStyle = '#33251a';
        g.beginPath();
        g.moveTo(x, y + 52);
        g.lineTo(x, y + 18);
        g.arc(x + 26, y + 18, 26, Math.PI, 0);
        g.lineTo(x + 52, y + 52);
        g.closePath();
        g.fill();
        g.fillStyle = 'rgba(255,196,110,0.92)';
        g.beginPath();
        g.moveTo(x + 7, y + 48);
        g.lineTo(x + 7, y + 20);
        g.arc(x + 26, y + 20, 19, Math.PI, 0);
        g.lineTo(x + 45, y + 48);
        g.closePath();
        g.fill();
        // 窗棂
        g.strokeStyle = 'rgba(90,60,30,0.8)';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(x + 26, y + 2);
        g.lineTo(x + 26, y + 48);
        g.moveTo(x + 7, y + 30);
        g.lineTo(x + 45, y + 30);
        g.stroke();
      }
      // 前景枯枝
      g.strokeStyle = '#2a1d13';
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(w - 60, h);
      g.quadraticCurveTo(w - 120, h * 0.8, w - 40, h * 0.62);
      g.stroke();
    },

    // 西柏坡：山村院落 + 松柏 + 晨光
    village(g, w, h, accent) {
      skyGradient(g, w, h, [
        [0, '#cfe0ea'],
        [0.45, '#e6dcc6'],
        [1, '#b6a98c'],
      ]);
      g.fillStyle = 'rgba(255,246,220,0.75)';
      g.beginPath();
      g.arc(w * 0.82, h * 0.26, 34, 0, Math.PI * 2);
      g.fill();
      ridge(g, w, h, h * 0.5, h * 0.22, '#9aa7a2', 9);
      ridge(g, w, h, h * 0.62, h * 0.18, '#7b8a82', 91);
      // 院落房屋群
      g.fillStyle = '#8c8471';
      g.fillRect(0, h * 0.72, w, h * 0.28);
      const houses = [
        [0.08, 0.3, 0.13],
        [0.26, 0.26, 0.12],
        [0.46, 0.34, 0.15],
        [0.72, 0.24, 0.11],
      ];
      houses.forEach(([hx, hw, hh]) => {
        const x = w * hx;
        const bw = w * hw;
        const bh = h * hh;
        const y = h * 0.76 - bh;
        g.fillStyle = '#d8cdb6';
        g.fillRect(x, y, bw, bh);
        // 屋顶
        g.fillStyle = '#6d6355';
        g.beginPath();
        g.moveTo(x - 10, y);
        g.lineTo(x + bw / 2, y - h * 0.07);
        g.lineTo(x + bw + 10, y);
        g.closePath();
        g.fill();
        // 门窗
        g.fillStyle = '#4b4238';
        g.fillRect(x + bw * 0.35, y + bh * 0.42, bw * 0.3, bh * 0.58);
        g.fillStyle = 'rgba(255,208,130,0.85)';
        g.fillRect(x + bw * 0.08, y + bh * 0.3, bw * 0.18, bh * 0.22);
        g.fillRect(x + bw * 0.74, y + bh * 0.3, bw * 0.18, bh * 0.22);
      });
      // 院墙
      g.strokeStyle = '#9b9182';
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(0, h * 0.82);
      g.lineTo(w, h * 0.82);
      g.stroke();
      // 松柏
      for (let i = 0; i < 5; i++) {
        pineTree(g, 70 + i * (w / 4.5), h * 0.94, 1.8, '#3f5145');
      }
      // 电报线
      g.strokeStyle = 'rgba(50,45,38,0.7)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(0, h * 0.4);
      g.quadraticCurveTo(w * 0.5, h * 0.5, w, h * 0.38);
      g.stroke();
      for (let i = 1; i < 4; i++) {
        g.beginPath();
        g.moveTo(w * (i / 4), h * 0.44);
        g.lineTo(w * (i / 4), h * 0.72);
        g.stroke();
      }
    },

    // 红旗渠：太行峭壁 + 悬空渠道
    canal(g, w, h, accent) {
      skyGradient(g, w, h, [
        [0, '#8fc4e0'],
        [0.5, '#bcdcea'],
        [1, '#dbe9e6'],
      ]);
      // 峭壁（左右两块巨岩）
      g.fillStyle = '#6f7b78';
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(w * 0.34, 0);
      g.lineTo(w * 0.42, h * 0.35);
      g.lineTo(w * 0.33, h * 0.62);
      g.lineTo(w * 0.44, h);
      g.lineTo(0, h);
      g.closePath();
      g.fill();
      g.fillStyle = '#5a6663';
      g.beginPath();
      g.moveTo(w, 0);
      g.lineTo(w * 0.66, 0);
      g.lineTo(w * 0.6, h * 0.4);
      g.lineTo(w * 0.7, h * 0.7);
      g.lineTo(w * 0.62, h);
      g.lineTo(w, h);
      g.closePath();
      g.fill();
      // 岩层纹理
      g.strokeStyle = 'rgba(30,40,40,0.35)';
      g.lineWidth = 3;
      for (let i = 0; i < 12; i++) {
        const y = (h / 12) * i + 8;
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(w * 0.36, y + 12);
        g.stroke();
        g.beginPath();
        g.moveTo(w, y + 6);
        g.lineTo(w * 0.64, y + 18);
        g.stroke();
      }
      // 远山
      ridge(g, w, h, h * 0.55, h * 0.2, '#8fa5a8', 33);
      // 渠道（横贯山腰）
      const cy = h * 0.5;
      g.fillStyle = '#7e6a58';
      g.fillRect(0, cy, w, 26);
      g.fillStyle = 'rgba(120,200,220,0.95)';
      g.fillRect(0, cy + 4, w, 16);
      g.strokeStyle = 'rgba(255,255,255,0.6)';
      g.lineWidth = 2;
      for (let i = 0; i < 26; i++) {
        g.beginPath();
        g.moveTo(((i * 47) % w) + 6, cy + 8);
        g.lineTo(((i * 47) % w) + 40, cy + 8);
        g.stroke();
      }
      // 支撑拱券
      g.fillStyle = '#6b5b4b';
      for (let i = 0; i < 7; i++) {
        const x = 30 + i * (w / 6.4);
        g.beginPath();
        g.moveTo(x, cy + 26);
        g.lineTo(x, cy + 60);
        g.lineTo(x + 26, cy + 60);
        g.lineTo(x + 26, cy + 26);
        g.closePath();
        g.fill();
      }
      // 隧洞
      g.fillStyle = '#2b3336';
      g.beginPath();
      g.moveTo(w * 0.44, cy - 40);
      g.lineTo(w * 0.44, cy + 26);
      g.arc(w * 0.49, cy + 26, w * 0.05, Math.PI, 0);
      g.lineTo(w * 0.54, cy - 40);
      g.closePath();
      g.fill();
      // 悬空作业的人影（除险）
      g.strokeStyle = '#2a2a2a';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(w * 0.24, 0);
      g.lineTo(w * 0.24, cy - 90);
      g.stroke();
      g.fillStyle = accent;
      g.beginPath();
      g.arc(w * 0.24, cy - 78, 7, 0, Math.PI * 2);
      g.fill();
      g.fillRect(w * 0.24 - 5, cy - 70, 10, 22);
      // 前景植被
      g.fillStyle = '#3d5245';
      for (let i = 0; i < 10; i++) {
        g.beginPath();
        g.ellipse(20 + i * (w / 9), h * 0.95, 32, 14, 0, 0, Math.PI * 2);
        g.fill();
      }
    },

    // 新时代：城市天际线 + 高铁 + 光伏田野
    modern(g, w, h, accent) {
      skyGradient(g, w, h, [
        [0, '#1f3b6e'],
        [0.4, '#4a7fb5'],
        [0.7, '#9fc6dd'],
        [1, '#dceaf0'],
      ]);
      // 朝阳
      const grad = g.createRadialGradient(w * 0.5, h * 0.72, 10, w * 0.5, h * 0.72, 260);
      grad.addColorStop(0, 'rgba(255,236,190,0.95)');
      grad.addColorStop(1, 'rgba(255,236,190,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
      // 远处城市
      g.fillStyle = '#2c4870';
      let x = 0;
      let rnd = 3;
      const rand = () => ((rnd = (rnd * 9301 + 49297) % 233280) / 233280);
      while (x < w) {
        const bw = 26 + rand() * 40;
        const bh = h * (0.2 + rand() * 0.36);
        g.fillRect(x, h * 0.82 - bh, bw, bh);
        // 窗户灯
        g.fillStyle = 'rgba(255,226,150,0.5)';
        for (let wy = h * 0.82 - bh + 8; wy < h * 0.82; wy += 14) {
          for (let wx = x + 5; wx < x + bw - 6; wx += 12) {
            if (rand() > 0.45) g.fillRect(wx, wy, 4, 6);
          }
        }
        g.fillStyle = '#2c4870';
        x += bw + 6;
      }
      // 高铁
      g.fillStyle = '#e9eef2';
      g.fillRect(0, h * 0.8, w, 16);
      g.fillStyle = '#b9c4cd';
      g.fillRect(0, h * 0.816, w, 5);
      g.fillStyle = '#f4f7f9';
      roundRect(g, w * 0.55, h * 0.775, w * 0.34, 26, 12);
      g.fill();
      g.fillStyle = '#5b7fa6';
      for (let i = 0; i < 9; i++) g.fillRect(w * 0.56 + i * (w * 0.035), h * 0.783, 14, 9);
      // 光伏田野
      g.fillStyle = '#5d7a4a';
      g.fillRect(0, h * 0.86, w, h * 0.14);
      g.fillStyle = 'rgba(60,120,170,0.85)';
      for (let i = 0; i < 9; i++) {
        g.save();
        g.transform(1, 0, -0.5, 1, 40 + i * 118, h * 0.9);
        g.fillRect(0, 0, 74, 30);
        g.restore();
      }
      // 光束
      g.strokeStyle = 'rgba(255,255,255,0.28)';
      g.lineWidth = 3;
      for (let i = 0; i < 6; i++) {
        g.beginPath();
        g.moveTo(w * 0.5, h * 0.72);
        g.lineTo(w * (0.05 + i * 0.19), 0);
        g.stroke();
      }
    },
  };

  Tex.scene = function (type, accent, caption) {
    const c = cv(1024, 683);
    const g = c.getContext('2d');
    (scenes[type] || scenes.mountain)(g, 1024, 683, accent || '#b3322c');
    // 渐隐暗角
    const vg = g.createRadialGradient(512, 340, 200, 512, 340, 660);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.45)');
    g.fillStyle = vg;
    g.fillRect(0, 0, 1024, 683);
    if (caption) {
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(0, 683 - 78, 1024, 78);
      text(g, caption, 40, 683 - 30, 34, '#ffffff', { weight: 'bold' });
    }
    return c;
  };

  // ---------- 展板 ----------
  Tex.board = function (zone) {
    const W = 1024;
    const H = 586;
    const c = cv(W, H);
    const g = c.getContext('2d');
    // 底
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#fbf8f2');
    bg.addColorStop(1, '#efe9de');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    // 顶部色带
    g.fillStyle = zone.accent;
    g.fillRect(0, 0, W, 12);
    // 左侧竖条
    g.fillStyle = zone.accent;
    g.fillRect(40, 46, 8, H - 120);
    // 序号
    text(g, String(zone.order).padStart(2, '0'), 66, 108, 54, zone.accent, { weight: 'bold', alpha: 0.85 });
    // 标题
    text(g, zone.board.title, 150, 104, 44, '#22201c', { weight: 'bold' });
    // 副信息
    text(g, `${zone.place}　|　${zone.period}`, 152, 138, 22, '#7a7267');
    // 分隔线
    g.strokeStyle = 'rgba(0,0,0,0.12)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(66, 158);
    g.lineTo(W - 48, 158);
    g.stroke();
    // 正文（两栏流式排版，字号换行计算必须先设置 font 再测量）
    const colW = (W - 160) / 2 - 20;
    const size = 19;
    const lh = size * 1.8;
    const gap = 16;
    const topY = 200;
    const availH = H - 150 - topY; // 单栏可用高度（底部留给数据卡）
    g.font = `normal ${size}px ${FONT}`;
    const blocks = zone.board.paragraphs.map((p) => ({ lines: wrap(g, p, colW) }));
    // 放不下的内容截断，并提示在详情面板查看全文
    let usedPx = 0;
    const shown = [];
    let truncated = false;
    blocks.forEach((b, i) => {
      const hgt = b.lines.length * lh + (i > 0 ? gap : 0);
      if (usedPx + hgt > availH * 2) {
        truncated = true;
        return;
      }
      shown.push(b);
      usedPx += hgt;
    });
    // 按高度平衡分栏
    let col = 0;
    let accY = 0;
    const cols = [[], []];
    shown.forEach((b, i) => {
      const hgt = b.lines.length * lh + (i > 0 ? gap : 0);
      if (col === 0 && accY + hgt > availH) col = 1;
      cols[col].push(b);
      accY += hgt;
    });
    [0, 1].forEach((ci) => {
      let y = topY;
      cols[ci].forEach((b, bi) => {
        if (bi > 0) y += gap;
        b.lines.forEach((l, li) => text(g, l, 66 + ci * (colW + 40), y + li * lh, size, '#3a352e'));
        y += b.lines.length * lh;
      });
      if (truncated && ci === 1) {
        text(g, '…… 点击展板，在详情面板阅读全文', 66 + colW + 40, Math.min(y + gap, H - 160), 17, '#8a8175');
      }
    });
    // 数据卡
    const cardY = H - 128;
    const cardW = (W - 110) / zone.board.facts.length;
    zone.board.facts.forEach((f, i) => {
      const x = 56 + i * cardW;
      g.fillStyle = 'rgba(0,0,0,0.04)';
      roundRect(g, x + 4, cardY, cardW - 16, 96, 8);
      g.fill();
      g.fillStyle = zone.accent;
      g.fillRect(x + 4, cardY, 5, 96);
      text(g, f.k, x + 22, cardY + 30, 19, '#8a8175');
      g.font = `bold 19px ${FONT}`;
      const lines = wrap(g, f.v, cardW - 44).slice(0, 2);
      lines.forEach((l, li) => text(g, l, x + 22, cardY + 60 + li * 27, 19, '#26231e', { weight: 'bold' }));
    });
    return c;
  };

  // 顶部标题条
  Tex.titleBar = function (zone) {
    const W = 1400;
    const H = 118;
    const c = cv(W, H);
    const g = c.getContext('2d');
    g.fillStyle = '#1c1f26';
    g.fillRect(0, 0, W, H);
    g.fillStyle = zone.accent;
    g.fillRect(0, 0, W, 8);
    text(g, zone.name, 40, 82, 62, '#ffffff', { weight: 'bold' });
    text(g, zone.slogan, 280, 78, 34, zone.accent, { baseline: 'alphabetic' });
    text(g, zone.period, W - 40, 78, 30, '#9aa3ad', { align: 'right' });
    return c;
  };

  // 精神卡竖板
  Tex.spirit = function (zone) {
    const W = 560;
    const H = 720;
    const c = cv(W, H);
    const g = c.getContext('2d');
    const bg = g.createLinearGradient(160, 0, W, H);
    bg.addColorStop(0, zone.accent);
    bg.addColorStop(1, '#20242c');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    // 装饰圆
    g.strokeStyle = 'rgba(255,255,255,0.16)';
    g.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.arc(W - 60, 110, 40 + i * 44, 0, Math.PI * 2);
      g.stroke();
    }
    text(g, '精神谱系', 44, 96, 30, 'rgba(255,255,255,0.65)');
    text(g, zone.spiritCard.name, 44, 170, 62, '#ffffff', { weight: 'bold' });
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.fillRect(44, 200, 90, 5);
    let y = 280;
    zone.spiritCard.items.forEach((it) => {
      g.fillStyle = 'rgba(255,255,255,0.18)';
      roundRect(g, 44, y, W - 88, 82, 10);
      g.fill();
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(76, y + 41, 7, 0, Math.PI * 2);
      g.fill();
      const lines = wrap(g, it, W - 160);
      lines.forEach((l, li) =>
        text(g, l, 100, y + (lines.length > 1 ? 34 : 52) + li * 34, 30, '#ffffff', { weight: 'bold' })
      );
      y += 100;
    });
    if (zone.hero) {
      text(g, '人物', 44, H - 190, 26, 'rgba(255,255,255,0.6)');
      text(g, zone.hero.name, 44, H - 140, 44, '#ffd97a', { weight: 'bold' });
      g.font = `normal 24px ${FONT}`;
      wrap(g, zone.hero.text.slice(0, 60) + '…', W - 88).forEach((l, li) =>
        text(g, l, 44, H - 100 + li * 30, 24, 'rgba(255,255,255,0.85)')
      );
    }
    return c;
  };

  // 视频屏封面
  Tex.videoScreen = function (zone, frameImg) {
    const W = 1024;
    const H = 569;
    const c = cv(W, H);
    const g = c.getContext('2d');
    // 底图：优先用视频某一帧（<video> 或 <img> 均可，统一 cover 填满），否则回退插画
    const fw = frameImg ? (frameImg.videoWidth || frameImg.width || 0) : 0;
    const fh = frameImg ? (frameImg.videoHeight || frameImg.height || 0) : 0;
    if (frameImg && fw && fh) {
      const ir = fw / fh, tr = W / H;
      let sw = fw, sh = fh, sx = 0, sy = 0;
      if (ir > tr) { sw = fh * tr; sx = (fw - sw) / 2; }
      else { sh = fw / tr; sy = (fh - sh) / 2; }
      g.drawImage(frameImg, sx, sy, sw, sh, 0, 0, W, H);
    } else {
      const s = Tex.scene(zone.scene, zone.accent);
      g.drawImage(s, 0, 0, W, H);
    }
    g.fillStyle = 'rgba(10,12,16,0.42)';
    g.fillRect(0, 0, W, H);
    // 播放按钮
    g.fillStyle = 'rgba(255,255,255,0.92)';
    g.beginPath();
    g.arc(W / 2, H / 2 - 20, 62, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = zone.accent;
    g.beginPath();
    g.moveTo(W / 2 - 22, H / 2 - 52);
    g.lineTo(W / 2 + 34, H / 2 - 20);
    g.lineTo(W / 2 - 22, H / 2 + 12);
    g.closePath();
    g.fill();
    // 文字：只保留“点击播放”，放大居中、字距舒展
    text(g, '点 击 播 放', W / 2, H / 2 + 96, 46, '#ffffff', { align: 'center', weight: 'bold', letter: '6px' });
    // 底部进度条（装饰）
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(60, H - 46, W - 120, 6);
    g.fillStyle = zone.accent;
    g.fillRect(60, H - 46, (W - 120) * 0.32, 6);
    return c;
  };

  // 序厅主题墙
  Tex.lobby = function (meta, lobby) {
    const W = 1600;
    const H = 620;
    const c = cv(W, H);
    const g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#8f1f1c');
    bg.addColorStop(0.55, '#b3322c');
    bg.addColorStop(1, '#5e1512');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    // 光晕
    const rg = g.createRadialGradient(W * 0.5, H * 0.4, 40, W * 0.5, H * 0.4, 700);
    rg.addColorStop(0, 'rgba(255,220,150,0.35)');
    rg.addColorStop(1, 'rgba(255,220,150,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, W, H);
    // 五角星
    function star(cx2, cy2, r, color) {
      g.fillStyle = color;
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const rr = i % 2 === 0 ? r : r * 0.42;
        const a = (Math.PI / 5) * i - Math.PI / 2;
        const px = cx2 + Math.cos(a) * rr;
        const py = cy2 + Math.sin(a) * rr;
        i === 0 ? g.moveTo(px, py) : g.lineTo(px, py);
      }
      g.closePath();
      g.fill();
    }
    star(150, 150, 62, 'rgba(255,225,130,0.95)');
    for (let i = 0; i < 4; i++) star(228 + i * 46, 196 + i * 8, 18, 'rgba(255,225,130,0.8)');
    // 标题
    text(g, meta.title, 120, 330, 96, '#ffffff', { weight: 'bold' });
    text(g, meta.subtitle, 126, 408, 50, 'rgba(255,235,180,0.95)', { weight: 'bold' });
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.fillRect(128, 440, 240, 4);
    let y = 496;
    lobby.lines.forEach((l) => {
      text(g, l, 128, y, 28, 'rgba(255,255,255,0.92)');
      y += 42;
    });
    return c;
  };

  // 地面时间轴长条
  Tex.timeline = function (items) {
    const W = 2048;
    const H = 200;
    const c = cv(W, H);
    const g = c.getContext('2d');
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(20,22,28,0.9)';
    g.fillRect(0, 30, W, 140);
    g.fillStyle = '#c0392b';
    g.fillRect(0, 96, W, 8);
    const step = W / items.length;
    items.forEach((it, i) => {
      const cx = step * (i + 0.5);
      g.fillStyle = '#c0392b';
      g.beginPath();
      g.arc(cx, 100, 20, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(cx, 100, 9, 0, Math.PI * 2);
      g.fill();
      text(g, it.year, cx, 78, 46, '#ffd97a', { align: 'center', weight: 'bold' });
      text(g, it.label, cx, 152, 30, 'rgba(255,255,255,0.92)', { align: 'center' });
    });
    // 箭头
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.beginPath();
    g.moveTo(W - 30, 62);
    g.lineTo(W - 30, 138);
    g.lineTo(W - 4, 100);
    g.closePath();
    g.fill();
    return c;
  };

  // 地面圆标（站点编号）
  Tex.floorMark = function (zone) {
    const S = 512;
    const c = cv(S, S);
    const g = c.getContext('2d');
    g.clearRect(0, 0, S, S);
    // 圆环
    g.strokeStyle = zone.accent;
    g.lineWidth = 14;
    g.beginPath();
    g.arc(S / 2, S / 2, 200, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 6;
    g.beginPath();
    g.arc(S / 2, S / 2, 168, 0, Math.PI * 2);
    g.stroke();
    // 底盘
    g.fillStyle = 'rgba(20,22,28,0.55)';
    g.beginPath();
    g.arc(S / 2, S / 2, 160, 0, Math.PI * 2);
    g.fill();
    text(g, String(zone.order).padStart(2, '0'), S / 2, S / 2 + 34, 150, '#ffffff', {
      align: 'center',
      weight: 'bold',
    });
    text(g, zone.name, S / 2, S / 2 + 96, 52, zone.accent, { align: 'center', weight: 'bold' });
    return c;
  };

  // 引导箭头（地面）
  Tex.arrow = function (color) {
    const c = cv(256, 256);
    const g = c.getContext('2d');
    g.clearRect(0, 0, 256, 256);
    g.fillStyle = color || 'rgba(255,215,120,0.75)';
    g.beginPath();
    g.moveTo(128, 20);
    g.lineTo(208, 140);
    g.lineTo(160, 140);
    g.lineTo(160, 236);
    g.lineTo(96, 236);
    g.lineTo(96, 140);
    g.lineTo(48, 140);
    g.closePath();
    g.fill();
    return c;
  };

  // 视频/音频缺失时的占位封面
  Tex.placeholder = function (title, sub) {
    const W = 1024;
    const H = 576;
    const c = cv(W, H);
    const g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#2a2f3a');
    bg.addColorStop(1, '#171a21');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,255,255,0.15)';
    g.lineWidth = 4;
    roundRect(g, 60, 60, W - 120, H - 120, 16);
    g.setLineDash([16, 12]);
    g.stroke();
    g.setLineDash([]);
    text(g, title, W / 2, H / 2 - 10, 42, '#ffffff', { align: 'center', weight: 'bold' });
    text(g, sub, W / 2, H / 2 + 44, 26, 'rgba(255,255,255,0.6)', { align: 'center' });
    return c;
  };

  // ---------- 参考图风格：红色展墙 / 弧墙照片组合 / 展台牌 ----------

  // 深红展墙底
  Tex.redWall = function () {
    const W = 1024;
    const H = 512;
    const c = cv(W, H);
    const g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#8f1f1c');
    bg.addColorStop(0.45, '#a92b26');
    bg.addColorStop(1, '#5e1310');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    // 顶部暖光晕
    const lg = g.createLinearGradient(0, 0, 0, H * 0.35);
    lg.addColorStop(0, 'rgba(255,205,130,0.22)');
    lg.addColorStop(1, 'rgba(255,205,130,0)');
    g.fillStyle = lg;
    g.fillRect(0, 0, W, H * 0.35);
    // 竖向渐变暗纹
    for (let x = 0; x < W; x += 64) {
      g.fillStyle = 'rgba(0,0,0,0.05)';
      g.fillRect(x, 0, 2, H);
    }
    noise(g, W, H, 14);
    return c;
  };

  // 做旧照片卡（黑白资料照风格）
  function photoCard(g, img, sx, sy, sw, sh, dx, dy, dw, dh, caption) {
    g.fillStyle = '#f2eee4';
    g.fillRect(dx - 10, dy - 10, dw + 20, dh + 40);
    g.save();
    g.beginPath();
    g.rect(dx, dy, dw, dh);
    g.clip();
    try {
      g.filter = 'grayscale(1) contrast(1.08) sepia(0.18)';
    } catch (e) {}
    g.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
    try {
      g.filter = 'none';
    } catch (e) {}
    g.restore();
    if (caption) text(g, caption, dx + dw / 2, dy + dh + 22, Math.max(15, dw * 0.045), '#5c1613', { align: 'center' });
  }

  /**
   * 弧形翼墙纹理：红墙 + 资料照片组合（参考图样式）
   * img：配图（AI 生成或程序插画）；side：'L'/'R'
   */
  Tex.arcWall = function (zone, img, side) {
    const W = 768;
    const H = 512;
    const c = cv(W, H);
    const g = c.getContext('2d');
    g.drawImage(Tex.redWall(), 0, 0, W, H);
    const src = img || Tex.scene(zone.scene, zone.accent);
    const dir = side === 'R' ? 1 : -1;
    // 主照片（大幅）
    photoCard(g, src, W * 0.08, H * 0.1, W * 0.5, H * 0.42, W * 0.1, H * 0.12, W * 0.52, H * 0.4, zone.name + ' · 资料图');
    // 副照片（小幅错位）
    photoCard(g, src, W * 0.45, H * 0.45, W * 0.4, H * 0.4, W * 0.46 + dir * 14, H * 0.58, W * 0.34, H * 0.26, zone.period);
    return c;
  };

  // 斜面展台标题牌
  Tex.standPlate = function (zone) {
    const W = 512;
    const H = 360;
    const c = cv(W, H);
    const g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#fbf7ef');
    bg.addColorStop(1, '#efe7d8');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    g.fillStyle = zone.accent;
    g.fillRect(0, 0, W, 12);
    text(g, '第 ' + zone.order + ' 展区', W / 2, 96, 30, '#8a8175', { align: 'center' });
    text(g, zone.name, W / 2, 176, 72, zone.accent, { align: 'center', weight: 'bold' });
    g.fillStyle = 'rgba(0,0,0,0.15)';
    g.fillRect(W * 0.2, 206, W * 0.6, 3);
    text(g, zone.slogan, W / 2, 262, 26, '#3a352e', { align: 'center' });
    text(g, zone.period, W / 2, 308, 24, '#8a8175', { align: 'center' });
    return c;
  };

  // ================= 现代党建展厅（哑光正红 + 水泥灰 + 白） =================

  // 水泥灰墙面（带模板缝与细颗粒）
  Tex.cementWall = function () {
    const c = cv(512, 512);
    const g = c.getContext('2d');
    // 深色斜面墙（近黑暖灰，融入整体暗调）
    const grad = g.createLinearGradient(0, 0, 512, 512);
    grad.addColorStop(0, '#2e2622');
    grad.addColorStop(0.5, '#251f1c');
    grad.addColorStop(1, '#1c1715');
    g.fillStyle = grad;
    g.fillRect(0, 0, 512, 512);
    // 模板缝（极淡金线）
    g.strokeStyle = 'rgba(255,210,150,0.08)';
    g.lineWidth = 2;
    for (let y = 64; y < 512; y += 128) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(512, y);
      g.stroke();
    }
    // 对拉螺栓孔
    g.fillStyle = 'rgba(0,0,0,0.3)';
    for (let y = 64; y < 512; y += 128) {
      for (let x = 40; x < 512; x += 128) {
        g.beginPath();
        g.arc(x, y, 4, 0, Math.PI * 2);
        g.fill();
      }
    }
    noise(g, 512, 512, 18);
    return c;
  };

  // 哑光正红墙面（细腻颗粒 + 暗金细闪，无高光）
  Tex.redMatte = function () {
    const c = cv(512, 512);
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 512, 0);
    grad.addColorStop(0, '#7a1410');
    grad.addColorStop(0.45, '#9a1a14');
    grad.addColorStop(1, '#7e1510');
    g.fillStyle = grad;
    g.fillRect(0, 0, 512, 512);
    // 暗金细闪（微妙，远观不显）
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(212,168,74,${Math.random() * 0.07})`;
      g.fillRect(Math.random() * 512, Math.random() * 512, 1.5, 1.5);
    }
    noise(g, 512, 512, 10);
    return c;
  };

  // 顶部圆形馆徽标识
  Tex.emblem = function (zone) {
    const S = 512;
    const c = cv(S, S);
    const g = c.getContext('2d');
    const cx = S / 2;
    const cy = S / 2;
    g.clearRect(0, 0, S, S);
    // 外环
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(cx, cy, 244, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#a81d17';
    g.beginPath();
    g.arc(cx, cy, 224, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#ffd97a';
    g.lineWidth = 5;
    g.beginPath();
    g.arc(cx, cy, 196, 0, Math.PI * 2);
    g.stroke();
    // 五角星
    g.save();
    g.translate(cx, cy - 18);
    g.fillStyle = '#ffd97a';
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 96 : 40;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.closePath();
    g.fill();
    g.restore();
    // 弧形文字
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.font = `bold 42px ${FONT}`;
    g.fillText('红色地标', cx, cy + 132);
    g.font = `26px ${FONT}`;
    g.fillStyle = 'rgba(255,255,255,0.72)';
    g.fillText(zone.period || '', cx, cy + 172);
    return c;
  };

  // 中英双语标题（透明底，贴在红墙之上）
  Tex.bilingual = function (zone) {
    const W = 1200;
    const H = 260;
    const c = cv(W, H);
    const g = c.getContext('2d');
    g.clearRect(0, 0, W, H);
    g.textAlign = 'center';
    text(g, zone.name, W / 2, 118, 108, '#ffffff', { weight: 'bold', align: 'center', letter: '6px' });
    // 分隔线
    g.strokeStyle = 'rgba(255,217,122,0.9)';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(W / 2 - 190, 156);
    g.lineTo(W / 2 + 190, 156);
    g.stroke();
    text(g, zone.en || '', W / 2, 208, 40, 'rgba(255,255,255,0.82)', { align: 'center', letter: '3px' });
    text(g, zone.place || '', W / 2, 250, 28, 'rgba(255,255,255,0.55)', { align: 'center', letter: '2px' });
    return c;
  };

  // 老照片卡（深色卡纸 + 鎏金细框，做旧棕褐色调）
  Tex.photoCard = function (zone, img, caption, idx) {
    const W = 640;
    const H = 520;
    const c = cv(W, H);
    const g = c.getContext('2d');
    // 深色卡纸底
    g.fillStyle = '#241a16';
    g.fillRect(0, 0, W, H);
    // 鎏金细框
    g.strokeStyle = '#cfa850';
    g.lineWidth = 5;
    g.strokeRect(10, 10, W - 20, H - 20);
    g.strokeStyle = 'rgba(207,168,80,0.3)';
    g.lineWidth = 1.5;
    g.strokeRect(20, 20, W - 40, H - 40);
    const px = 34;
    const py = 34;
    const pw = W - 68;
    const ph = 356;
    g.save();
    g.beginPath();
    g.rect(px, py, pw, ph);
    g.clip();
    if (img) {
      const ir = img.width / img.height;
      const tr = pw / ph;
      let sw = img.width;
      let sh = img.height;
      let sx = 0;
      let sy = 0;
      if (ir > tr) {
        sw = img.height * tr;
        sx = (img.width - sw) / 2;
      } else {
        sh = img.width / tr;
        sy = (img.height - sh) / 2;
      }
      try {
        g.filter = 'sepia(0.55) grayscale(0.3) contrast(1.05) brightness(0.92)';
      } catch (e) {}
      g.drawImage(img, sx, sy, sw, sh, px, py, pw, ph);
      g.filter = 'none';
      // 做旧压角
      g.fillStyle = 'rgba(120,86,48,0.18)';
      g.fillRect(px, py, pw, ph);
    } else {
      g.drawImage(Tex.scene(zone.scene, zone.accent, ''), px, py, pw, ph);
      g.fillStyle = 'rgba(120,86,48,0.35)';
      g.fillRect(px, py, pw, ph);
    }
    // 划痕
    g.strokeStyle = 'rgba(255,255,255,0.12)';
    g.lineWidth = 1.2;
    for (let i = 0; i < 12; i++) {
      const x = px + Math.random() * pw;
      g.beginPath();
      g.moveTo(x, py);
      g.lineTo(x + (Math.random() - 0.5) * 26, py + ph);
      g.stroke();
    }
    g.restore();
    // 内框线
    g.strokeStyle = 'rgba(207,168,80,0.5)';
    g.lineWidth = 1.5;
    g.strokeRect(px, py, pw, ph);
    // 说明文字（金色 + 浅金）
    text(g, caption || zone.place || '', px + 2, H - 84, 30, '#f0d98a', { weight: 'bold' });
    text(g, (zone.timelineNotes && zone.timelineNotes[idx]) || '资料照片 · 展陈示意', px + 2, H - 44, 24, 'rgba(255,240,220,0.55)');
    return c;
  };

  // 文字展板（深酒红底 + 鎏金描边，嵌入红墙模块）
  Tex.textPanel = function (zone) {
    const W = 760;
    const H = 980;
    const c = cv(W, H);
    const g = c.getContext('2d');
    // 深酒红渐变底
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#5a1410');
    bg.addColorStop(1, '#380c09');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    // 鎏金外框 + 内框
    g.strokeStyle = '#d4a84a';
    g.lineWidth = 6;
    g.strokeRect(14, 14, W - 28, H - 28);
    g.strokeStyle = 'rgba(212,168,74,0.35)';
    g.lineWidth = 2;
    g.strokeRect(28, 28, W - 56, H - 56);
    // 标题
    text(g, zone.board ? zone.board.title : zone.name, 56, 108, 44, '#f0d98a', { weight: 'bold' });
    // 金色分隔短线
    g.strokeStyle = '#d4a84a';
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(56, 132); g.lineTo(210, 132); g.stroke();
    // 正文（米白暖字）
    let y = 190;
    const body = zone.board ? zone.board.paragraphs : [];
    const maxW = W - 112;
    for (let i = 0; i < body.length && y < H - 160; i++) {
      const lines = wrap(g, body[i], maxW);
      for (const ln of lines) {
        if (y > H - 160) break;
        text(g, ln, 56, y, 27, 'rgba(255,240,220,0.92)');
        y += 43;
      }
      y += 20;
    }
    // 底部要点（金色竖条）
    const facts = (zone.board && zone.board.facts) || [];
    let fy = H - 130;
    facts.slice(0, 3).forEach((f, i) => {
      const x = 56 + i * ((W - 112) / 3);
      g.fillStyle = '#d4a84a';
      g.fillRect(x, fy - 34, 5, 86);
      text(g, f.k, x + 16, fy - 6, 22, 'rgba(240,217,138,0.72)');
      const vv = wrap(g, f.v, (W - 112) / 3 - 40);
      text(g, vv[0] || '', x + 16, fy + 30, 25, '#fff5e0', { weight: 'bold' });
      if (vv[1]) text(g, vv[1], x + 16, fy + 58, 25, '#fff5e0', { weight: 'bold' });
    });
    return c;
  };

  // 历史油画（带画框）
  Tex.oilPainting = function (zone, img, caption) {
    const W = 900;
    const H = 640;
    const c = cv(W, H);
    const g = c.getContext('2d');
    // 画框
    const fr = g.createLinearGradient(0, 0, 0, H);
    fr.addColorStop(0, '#4a4038');
    fr.addColorStop(0.5, '#2e2721');
    fr.addColorStop(1, '#3d342c');
    g.fillStyle = fr;
    g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(200,164,96,0.65)';
    g.lineWidth = 6;
    g.strokeRect(16, 16, W - 32, H - 32);
    const ix = 46;
    const iy = 46;
    const iw = W - 92;
    const ih = H - 132;
    if (img) {
      const ir = img.width / img.height;
      const tr = iw / ih;
      let sw = img.width;
      let sh = img.height;
      let sx = 0;
      let sy = 0;
      if (ir > tr) {
        sw = img.height * tr;
        sx = (img.width - sw) / 2;
      } else {
        sh = img.width / tr;
        sy = (img.height - sh) / 2;
      }
      g.drawImage(img, sx, sy, sw, sh, ix, iy, iw, ih);
    } else {
      g.drawImage(Tex.scene(zone.scene, zone.accent, ''), ix, iy, iw, ih);
    }
    // 铭牌
    g.fillStyle = '#f2efe7';
    g.fillRect(W / 2 - 230, H - 74, 460, 46);
    g.textAlign = 'center';
    text(g, caption || zone.name + ' · 主题油画', W / 2, H - 42, 26, '#3a342c', { align: 'center' });
    g.textAlign = 'left';
    return c;
  };

  // 战争/历史插图（黑白版画风格）
  Tex.warIllustration = function (zone) {
    const W = 900;
    const H = 640;
    const c = cv(W, H);
    const g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#d9d5cc');
    bg.addColorStop(1, '#efece5');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    // 远山
    ridge(g, W, H, H * 0.62, 78, 'rgba(60,58,54,0.55)', 11, 0.9);
    ridge(g, W, H, H * 0.72, 54, 'rgba(40,38,36,0.7)', 27, 0.8);
    // 硝烟
    for (let i = 0; i < 6; i++) {
      const x = 120 + i * 128 + Math.random() * 40;
      const r = 60 + Math.random() * 70;
      const rg = g.createRadialGradient(x, H * 0.44, 4, x, H * 0.44, r);
      rg.addColorStop(0, 'rgba(255,255,255,0.55)');
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = rg;
      g.beginPath();
      g.arc(x, H * 0.44, r, 0, Math.PI * 2);
      g.fill();
    }
    // 行进队伍剪影
    const baseY = H * 0.86;
    g.fillStyle = '#23211d';
    for (let i = 0; i < 16; i++) {
      const x = 60 + i * 52;
      const s = 1 + (i % 3) * 0.12;
      g.save();
      g.translate(x, baseY);
      g.scale(s, s);
      g.beginPath();
      g.arc(0, -86, 11, 0, Math.PI * 2); // 头
      g.fill();
      g.fillRect(-11, -76, 22, 44); // 身
      g.fillRect(-11, -34, 8, 34); // 腿
      g.fillRect(3, -34, 8, 34);
      g.strokeStyle = '#23211d';
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(10, -70);
      g.lineTo(24, -112); // 枪
      g.stroke();
      g.restore();
    }
    // 旗帜
    g.save();
    g.translate(W - 108, baseY - 150);
    g.strokeStyle = '#23211d';
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(0, -170);
    g.stroke();
    g.fillStyle = '#23211d';
    g.beginPath();
    g.moveTo(0, -170);
    g.lineTo(84, -148);
    g.lineTo(0, -126);
    g.closePath();
    g.fill();
    g.restore();
    noise(g, W, H, 26);
    // 图注
    g.fillStyle = 'rgba(255,255,255,0.86)';
    g.fillRect(0, H - 62, W, 62);
    text(g, '历史插图 · 版画风格展陈示意', 34, H - 22, 28, '#4a453c');
    return c;
  };

  // 竖向人物图文卡片（黑白版画肖像 + 红色标签）
  Tex.personCard = function (fig, accent) {
    const W = 440;
    const H = 1120;
    const c = cv(W, H);
    const g = c.getContext('2d');
    g.fillStyle = '#f6f4ef';
    g.fillRect(0, 0, W, H);
    // 肖像区（黑白版画风格剪影）
    const ph = 660;
    const pg = g.createLinearGradient(0, 0, 0, ph);
    pg.addColorStop(0, '#e8e5de');
    pg.addColorStop(1, '#cfcbc2');
    g.fillStyle = pg;
    g.fillRect(0, 0, W, ph);
    // 半身剪影
    g.save();
    g.translate(W / 2, ph);
    g.fillStyle = '#2b2925';
    g.beginPath();
    g.moveTo(-168, 0);
    g.bezierCurveTo(-166, -170, -120, -272, 0, -272);
    g.bezierCurveTo(120, -272, 166, -170, 168, 0);
    g.closePath();
    g.fill();
    g.beginPath();
    g.arc(0, -348, 96, 0, Math.PI * 2); // 头
    g.fill();
    // 帽檐
    g.beginPath();
    g.moveTo(-104, -388);
    g.lineTo(104, -388);
    g.lineTo(88, -418);
    g.lineTo(-88, -418);
    g.closePath();
    g.fill();
    g.restore();
    // 排线（版画质感）
    g.strokeStyle = 'rgba(0,0,0,0.10)';
    g.lineWidth = 2;
    for (let i = 0; i < 60; i++) {
      g.beginPath();
      g.moveTo(0, ph - i * 11);
      g.lineTo(W, ph - i * 11 - 40);
      g.stroke();
    }
    noise(g, W, ph, 18);
    // 红色标签 + 姓名
    g.fillStyle = accent || '#a81d17';
    g.fillRect(0, ph, W, 132);
    text(g, fig.name || '', 36, ph + 96, 78, '#ffffff', { weight: 'bold' });
    // 说明区
    g.fillStyle = '#ffffff';
    g.fillRect(0, ph + 132, W, H - ph - 132);
    g.fillStyle = accent || '#a81d17';
    g.fillRect(36, ph + 184, W - 72, 78);
    text(g, fig.tag || '', 58, ph + 236, 27, '#ffffff');
    let y = ph + 336;
    g.font = `30px ${FONT}`;
    const lines = wrap(g, fig.desc || '', W - 96);
    lines.slice(0, 9).forEach((l) => {
      text(g, l, 46, y, 30, '#3b3730');
      y += 46;
    });
    text(g, '肖像为版画风格展陈示意', 46, H - 44, 24, '#9b9387');
    return c;
  };

  // 触控查询台界面
  Tex.kioskUI = function (zone) {
    const W = 512;
    const H = 1024;
    const c = cv(W, H);
    const g = c.getContext('2d');
    g.fillStyle = '#f7f6f3';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#a81d17';
    g.fillRect(0, 0, W, 132);
    text(g, zone.name || '', 32, 74, 52, '#ffffff', { weight: 'bold' });
    text(g, 'TOUCH QUERY', 32, 112, 22, 'rgba(255,255,255,0.7)');
    const items = [
      ['展板全文', 'BOARD'],
      ['影像资料', 'VIDEO'],
      ['思考与讨论', 'THINK'],
      ['史料出处', 'SOURCE'],
      ['人物故事', 'FIGURES'],
    ];
    items.forEach((it, i) => {
      const y = 186 + i * 132;
      g.fillStyle = '#ffffff';
      roundRect(g, 32, y, W - 64, 108, 14);
      g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.08)';
      g.lineWidth = 2;
      g.stroke();
      g.fillStyle = '#a81d17';
      g.fillRect(32, y, 8, 108);
      text(g, it[0], 60, y + 56, 36, '#26241f', { weight: 'bold' });
      text(g, it[1], 60, y + 92, 22, '#a49c90');
      g.fillStyle = '#a81d17';
      g.beginPath();
      g.arc(W - 78, y + 54, 20, 0, Math.PI * 2);
      g.fill();
      text(g, '›', W - 78, y + 62, 30, '#ffffff', { align: 'center' });
    });
    g.fillStyle = 'rgba(0,0,0,0.05)';
    g.fillRect(0, H - 120, W, 120);
    text(g, '点击屏幕或展项可查看详情', 40, H - 42, 26, '#6f6a61');
    return c;
  };

  // 立体发光大字（单字，透明底，鎏金暖光）
  Tex.glowChar = function (ch) {
    const S = 256;
    const c = cv(S, S);
    const g = c.getContext('2d');
    g.clearRect(0, 0, S, S);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `bold 190px ${FONT}`;
    // 外层金色辉光
    g.shadowColor = 'rgba(255,200,90,0.95)';
    g.shadowBlur = 40;
    g.fillStyle = '#ffd98a';
    g.fillText(ch, S / 2, S / 2 + 6);
    g.shadowBlur = 0;
    // 字芯：暖白偏金
    g.fillStyle = '#fff3d0';
    g.fillText(ch, S / 2, S / 2 + 6);
    return c;
  };

  // 文物展柜展签
  Tex.caseLabel = function (zone, i) {
    const W = 512;
    const H = 128;
    const c = cv(W, H);
    const g = c.getContext('2d');
    g.fillStyle = '#f7f5f0';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#a81d17';
    g.fillRect(0, 0, W, 6);
    const titles = ['文献资料', '生活用具', '工程器具'];
    text(g, titles[i % 3], 22, 58, 40, '#22201c', { weight: 'bold' });
    text(g, zone.name + ' · 展陈示意', 22, 98, 24, '#8a8175');
    return c;
  };

  // 精神谱系条（嵌入红墙模块）
  Tex.spiritStrip = function (zone) {
    const W = 700;
    const H = 290;
    const c = cv(W, H);
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#a81d17';
    g.fillRect(0, 0, W, 10);
    const card = zone.spiritCard || { name: zone.spirit || '', items: [] };
    text(g, card.name, 32, 76, 46, '#a81d17', { weight: 'bold' });
    let y = 132;
    (card.items || []).slice(0, 4).forEach((it) => {
      const txt = typeof it === 'string' ? it : it.t || it.text || String(it);
      g.fillStyle = '#a81d17';
      g.beginPath();
      g.arc(44, y - 8, 6, 0, Math.PI * 2);
      g.fill();
      const lines = wrap(g, txt, W - 110);
      g.font = `26px ${FONT}`;
      text(g, lines[0] || '', 60, y, 26, '#3b3730');
      y += 38;
    });
    return c;
  };

  // 柔和辉光（用于发光大字的泛光）
  Tex.softGlow = function () {
    const S = 256;
    const c = cv(S, S);
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S / 2);
    rg.addColorStop(0, 'rgba(255,255,255,1)');
    rg.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, S, S);
    return c;
  };

  // 白色立体标题副标题行（透明底）
  Tex.subLine = function (str) {
    const W = 1400;
    const H = 200;
    const c = cv(W, H);
    const g = c.getContext('2d');
    g.clearRect(0, 0, W, H);
    g.textAlign = 'center';
    text(g, str, W / 2, 120, 76, '#ffffff', { align: 'center', weight: 'bold', letter: '8px' });
    g.strokeStyle = 'rgba(255,255,255,0.6)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(W / 2 - 420, 158);
    g.lineTo(W / 2 + 420, 158);
    g.stroke();
    return c;
  };

  // 序厅历史图文展板
  Tex.lobbyPanel = function (meta, lobby) {
    const W = 760;
    const H = 980;
    const c = cv(W, H);
    const g = c.getContext('2d');
    g.fillStyle = '#fbfaf7';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#a81d17';
    g.fillRect(0, 0, W, 12);
    text(g, meta.title, 44, 92, 48, '#1f1d19', { weight: 'bold' });
    g.fillStyle = '#a81d17';
    g.fillRect(44, 114, 96, 6);
    let y = 176;
    g.font = `28px ${FONT}`;
    const intros = wrap(g, meta.intro, W - 92);
    intros.forEach((l) => {
      text(g, l, 44, y, 28, '#3b3730');
      y += 46;
    });
    y += 26;
    g.fillStyle = '#a81d17';
    g.fillRect(44, y - 26, 6, 26);
    text(g, '展陈线路', 64, y - 4, 32, '#a81d17', { weight: 'bold' });
    y += 46;
    (lobby.nav || []).forEach((n, i) => {
      g.fillStyle = '#a81d17';
      g.beginPath();
      g.arc(62, y - 9, 11, 0, Math.PI * 2);
      g.fill();
      text(g, n, 92, y, 30, '#2f2b25');
      y += 48;
    });
    // 底部引言
    y += 20;
    g.strokeStyle = 'rgba(0,0,0,0.12)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(44, y);
    g.lineTo(W - 44, y);
    g.stroke();
    y += 60;
    (lobby.lines || []).forEach((l) => {
      const ls = wrap(g, l, W - 92);
      ls.forEach((ln) => {
        text(g, ln, 44, y, 27, '#6b655b', { serif: true });
        y += 42;
      });
    });
    return c;
  };

  // 序厅地面圆标
  Tex.lobbyMark = function () {
    const S = 512;
    const c = cv(S, S);
    const g = c.getContext('2d');
    g.clearRect(0, 0, S, S);
    g.strokeStyle = 'rgba(255,255,255,0.28)';
    g.lineWidth = 8;
    g.beginPath();
    g.arc(256, 256, 232, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = 'rgba(168,29,23,0.9)';
    g.beginPath();
    g.arc(256, 256, 176, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(255,217,122,0.85)';
    g.lineWidth = 6;
    g.beginPath();
    g.arc(256, 256, 150, 0, Math.PI * 2);
    g.stroke();
    g.textAlign = 'center';
    text(g, '序厅', 256, 238, 82, '#ffffff', { align: 'center', weight: 'bold' });
    text(g, '参观起点', 256, 300, 34, 'rgba(255,255,255,0.85)', { align: 'center' });
    return c;
  };

  // ==================== 中国元素素材（中式框景 / 星空中国轮廓） ====================
  // 轮廓为艺术化简化表达（星光点阵），领土构成完整：
  // 包含大陆、台湾岛、海南岛与南海诸岛示意，符合国家地图表示规范。

  // 生成结果缓存（同参数只绘制一次，避免多个展区重复生成大尺寸纹理导致构建缓慢）
  const _cache = {};
  function memo(key, fn) {
    if (!_cache[key]) _cache[key] = fn();
    return _cache[key];
  }

  // 大陆轮廓（经度, 纬度），自东北起顺时针
  const CN_MAINLAND = [
    [124.5, 53.3], [126.0, 52.6], [127.5, 50.2], [130.7, 48.9], [134.3, 48.4], [135.1, 47.3],
    [133.0, 45.2], [131.3, 44.0], [131.0, 42.9], [129.5, 42.4], [128.0, 41.5], [126.0, 40.9],
    [124.4, 39.9], [121.7, 39.0], [122.0, 40.1], [121.0, 40.8], [118.9, 39.0], [117.8, 38.9],
    [119.0, 37.3], [120.8, 37.8], [122.7, 37.4], [121.1, 36.0], [119.2, 35.0], [120.3, 34.0],
    [121.9, 31.7], [121.5, 30.3], [122.2, 29.5], [121.6, 28.4], [120.4, 27.2], [119.6, 25.5],
    [118.1, 24.5], [116.5, 23.3], [114.3, 22.6], [113.0, 21.8], [110.5, 21.2], [109.5, 21.5],
    [108.5, 21.6], [107.9, 21.5], [106.7, 22.0], [105.3, 23.3], [103.5, 22.7], [101.8, 21.2],
    [101.1, 22.0], [99.5, 22.5], [98.0, 24.1], [97.5, 25.6], [97.9, 28.3], [96.2, 29.0],
    [94.7, 29.3], [92.1, 27.8], [89.0, 27.5], [86.5, 27.9], [84.2, 28.9], [81.5, 30.4],
    [78.8, 31.3], [78.2, 34.5], [76.0, 35.5], [74.9, 37.0], [73.6, 39.4], [75.0, 40.5],
    [76.9, 41.0], [80.2, 42.9], [82.6, 45.2], [85.0, 47.0], [87.4, 49.2], [90.0, 47.9],
    [93.0, 45.9], [96.4, 42.7], [99.5, 42.6], [102.0, 42.2], [105.0, 41.6], [107.5, 42.4],
    [110.4, 43.0], [113.0, 44.7], [115.5, 45.5], [117.8, 46.8], [119.3, 47.6], [117.5, 49.5],
    [120.0, 50.5], [121.5, 51.5], [122.0, 52.5],
  ];
  // 台湾岛（中国省级行政区）
  const CN_TAIWAN = [
    [121.0, 25.3], [121.9, 25.0], [121.9, 24.0], [121.0, 22.6], [120.5, 22.0],
    [120.1, 23.0], [120.3, 24.3],
  ];
  // 海南岛（中国省级行政区）
  const CN_HAINAN = [
    [109.0, 19.9], [110.1, 20.1], [110.6, 19.6], [110.0, 18.6], [109.2, 18.4], [108.7, 19.3],
  ];
  // 南海诸岛示意（断续弧 + 岛点）
  const CN_NANHAI_LINE = [
    [108.6, 18.2], [110.5, 15.0], [112.5, 12.0], [114.5, 9.0], [116.0, 6.5],
    [117.5, 4.5], [118.5, 8.0], [119.0, 12.0], [119.6, 16.0], [118.5, 19.5], [116.5, 21.3],
  ];
  const CN_NANHAI_DOTS = [
    [112.3, 16.8], [114.3, 11.5], [116.8, 9.5], [117.8, 15.8], [111.6, 15.9], [115.5, 17.6],
  ];

  // 经纬度 → 画布区域投影（纬度方向按 cos 压缩，保持版图观感）
  function projectChina(pts, box) {
    const lonMin = 73.0, lonMax = 136.0, latMin = 3.5, latMax = 54.0;
    const kx = Math.cos((37 * Math.PI) / 180);
    return pts.map(([lon, lat]) => {
      const fx = (lon - lonMin) / (lonMax - lonMin);
      const fy = ((latMax - lat) / (latMax - latMin)) * kx;
      return [box.x + fx * box.w, box.y + fy * box.h];
    });
  }

  /** 渐变星空 + 星光连成的中国轮廓（顶部中心） */
  Tex.starfieldChina = function (W, H) {
    W = W || 1024; H = H || 1024;
    return memo('starfield' + W + 'x' + H, function () {
    const c = cv(W, H);
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.62);
    rg.addColorStop(0, '#141a2e');
    rg.addColorStop(0.45, '#0d1120');
    rg.addColorStop(1, '#070910');
    g.fillStyle = rg;
    g.fillRect(0, 0, W, H);

    // 背景星点
    for (let i = 0; i < 420; i++) {
      g.fillStyle = `rgba(255,255,255,${0.06 + Math.random() * 0.22})`;
      g.beginPath();
      g.arc(Math.random() * W, Math.random() * H, Math.random() * 1.5 + 0.3, 0, Math.PI * 2);
      g.fill();
    }
    // 亮星十字光芒
    for (let i = 0; i < 26; i++) {
      const x = Math.random() * W;
      const y = Math.random() * H;
      const s = 3 + Math.random() * 5;
      g.strokeStyle = 'rgba(255,240,210,0.30)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x - s, y);
      g.lineTo(x + s, y);
      g.moveTo(x, y - s);
      g.lineTo(x, y + s);
      g.stroke();
    }

    const box = { x: W * 0.16, y: H * 0.18, w: W * 0.68, h: H * 0.64 };
    const paths = [CN_MAINLAND, CN_TAIWAN, CN_HAINAN];

    // 轮廓内部辉光
    g.save();
    paths.forEach((pts) => {
      const p = projectChina(pts, box);
      g.beginPath();
      p.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
    });
    const inner = g.createRadialGradient(W * 0.5, H * 0.48, 20, W * 0.5, H * 0.48, W * 0.32);
    inner.addColorStop(0, 'rgba(190,60,48,0.30)');
    inner.addColorStop(1, 'rgba(190,60,48,0.02)');
    g.fillStyle = inner;
    g.fill();
    g.restore();

    // 轮廓连线
    paths.forEach((pts) => {
      const p = projectChina(pts, box);
      g.strokeStyle = 'rgba(232,203,140,0.55)';
      g.lineWidth = 1.6;
      g.beginPath();
      p.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
      g.stroke();
    });

    // 南海断续弧
    const nh = projectChina(CN_NANHAI_LINE, box);
    g.setLineDash([8, 7]);
    g.strokeStyle = 'rgba(232,203,140,0.34)';
    g.lineWidth = 1.4;
    g.beginPath();
    nh.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
    g.setLineDash([]);

    // 星光节点
    const drawNodes = (pts, r, alpha) => {
      projectChina(pts, box).forEach(([x, y]) => {
        g.fillStyle = `rgba(255,238,205,${alpha})`;
        g.shadowColor = 'rgba(255,220,150,0.9)';
        g.shadowBlur = 10;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
        g.shadowBlur = 0;
      });
    };
    drawNodes(CN_MAINLAND.filter((_, i) => i % 2 === 0), 2.6, 0.85);
    drawNodes(CN_TAIWAN, 2.2, 0.8);
    drawNodes(CN_HAINAN, 2.2, 0.8);
    drawNodes(CN_NANHAI_DOTS, 1.9, 0.75);
    return c;
    });
  };

  /** 圆形中国轮廓光影（主墙面低对比使用） */
  Tex.chinaMedallion = function (size) {
    size = size || 512;
    return memo('medallion' + size, function () {
    const c = cv(size, size);
    const g = c.getContext('2d');
    const cx = size / 2, cy = size / 2;
    const rg = g.createRadialGradient(cx, cy, size * 0.05, cx, cy, size * 0.5);
    rg.addColorStop(0, 'rgba(196,58,45,0.55)');
    rg.addColorStop(0.7, 'rgba(120,30,24,0.22)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg;
    g.beginPath();
    g.arc(cx, cy, size * 0.5, 0, Math.PI * 2);
    g.fill();

    const box = { x: size * 0.2, y: size * 0.2, w: size * 0.6, h: size * 0.6 };
    [CN_MAINLAND, CN_TAIWAN, CN_HAINAN].forEach((pts) => {
      const p = projectChina(pts, box);
      g.beginPath();
      p.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
      g.fillStyle = 'rgba(255,232,190,0.10)';
      g.fill();
      g.strokeStyle = 'rgba(240,214,150,0.5)';
      g.lineWidth = 1.8;
      g.stroke();
    });
    const nh = projectChina(CN_NANHAI_LINE, box);
    g.setLineDash([6, 6]);
    g.strokeStyle = 'rgba(240,214,150,0.3)';
    g.lineWidth = 1.2;
    g.beginPath();
    nh.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
    g.setLineDash([]);
    return c;
    });
  };

  /** 淡金回纹（可平铺中式连续纹样） */
  Tex.huiwen = function (size, color) {
    size = size || 256;
    color = color || 'rgba(226,193,126,0.55)';
    return memo('huiwen' + size + color, function () {
    const c = cv(size, size);
    const g = c.getContext('2d');
    const u = size / 4;
    g.strokeStyle = color;
    g.lineWidth = Math.max(1.5, size / 90);
    g.lineJoin = 'miter';
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        const flip = (i + j) % 2 === 0 ? 1 : -1;
        g.save();
        g.translate(i * u + u / 2, j * u + u / 2);
        g.scale(flip, 1);
        const s = u * 0.34;
        g.beginPath();
        g.moveTo(-s, -s);
        g.lineTo(s, -s);
        g.lineTo(s, s);
        g.lineTo(-s, s);
        g.lineTo(-s, -s * 0.2);
        g.lineTo(s * 0.55, -s * 0.2);
        g.lineTo(s * 0.55, s * 0.55);
        g.lineTo(-s * 0.2, s * 0.55);
        g.stroke();
        g.restore();
      }
    }
    return c;
    });
  };

  /** 极淡全息网格 + 节点光点 + 红色脉络线 */
  Tex.holoGrid = function (W, H) {
    W = W || 512; H = H || 512;
    return memo('holo' + W + 'x' + H, function () {
    const c = cv(W, H);
    const g = c.getContext('2d');
    g.clearRect(0, 0, W, H);
    const step = W / 24;
    g.strokeStyle = 'rgba(120,190,220,0.10)';
    g.lineWidth = 1;
    for (let x = 0; x <= W; x += step) {
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke();
    }
    for (let y = 0; y <= H; y += step) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
    }
    for (let x = 0; x <= W; x += step) {
      for (let y = 0; y <= H; y += step) {
        if (Math.random() > 0.86) {
          g.fillStyle = 'rgba(255,220,170,0.16)';
          g.beginPath(); g.arc(x, y, 1.8, 0, Math.PI * 2); g.fill();
        }
      }
    }
    g.strokeStyle = 'rgba(190,60,48,0.10)';
    g.lineWidth = 1.2;
    for (let k = 0; k < 5; k++) {
      const y0 = Math.random() * H;
      g.beginPath();
      g.moveTo(0, y0);
      g.bezierCurveTo(W * 0.3, y0 + (Math.random() - 0.5) * 60, W * 0.7, y0 + (Math.random() - 0.5) * 60, W, y0);
      g.stroke();
    }
    return c;
    });
  };

  /** 哑光暗红框式展墙（炭灰底 + 暗红圆角框 + 淡金回纹腰线） */
  Tex.frameWall = function (opts) {
    opts = opts || {};
    return memo('framewall' + (opts.medallion === false ? 'plain' : 'med') + (opts.image ? 'img' : ''), function () {
    const W = 1024, H = 512;
    const c = cv(W, H);
    const g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#2a2c31');
    bg.addColorStop(1, '#1d1f24');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 2200; i++) {
      g.fillStyle = `rgba(255,255,255,${Math.random() * 0.035})`;
      g.fillRect(Math.random() * W, Math.random() * H, 1, 1);
    }
    const m = 46;
    g.strokeStyle = 'rgba(150,38,30,0.85)';
    g.lineWidth = 12;
    roundRect(g, m, m, W - m * 2, H - m * 2, 26);
    g.stroke();
    g.strokeStyle = 'rgba(226,193,126,0.30)';
    g.lineWidth = 2;
    roundRect(g, m + 16, m + 16, W - (m + 16) * 2, H - (m + 16) * 2, 20);
    g.stroke();
    // 回纹腰线
    const hp = g.createPattern(Tex.huiwen(64, 'rgba(226,193,126,0.28)'), 'repeat');
    g.fillStyle = hp;
    g.fillRect(m, 8, W - m * 2, 22);
    g.fillRect(m, H - 30, W - m * 2, 22);
    // 中心影像位（低对比）
    const ix = m + 34, iy = m + 44, iw = W - (m + 34) * 2, ih = H - (m + 44) * 2;
    if (opts.image) {
      g.save();
      g.globalAlpha = 0.42;
      g.drawImage(opts.image, ix, iy, iw, ih);
      g.restore();
    }
    g.fillStyle = 'rgba(20,22,26,0.34)';
    g.fillRect(ix, iy, iw, ih);
    if (opts.medallion !== false) {
      g.save();
      g.globalAlpha = 0.5;
      g.drawImage(Tex.chinaMedallion(320), W / 2 - 150, H / 2 - 150, 300, 300);
      g.restore();
    }
    return c;
    });
  };

  /** 压暗处理的展陈影像（不抢主视觉） */
  Tex.dimmedArt = function (img, W = 512, H = 340) {
    const c = cv(W, H);
    const g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#22242a');
    bg.addColorStop(1, '#15171b');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    if (img) {
      g.save();
      g.globalAlpha = 0.5;
      const ir = img.width / img.height;
      const tr = W / H;
      let sw = img.width, sh = img.height, sx = 0, sy = 0;
      if (ir > tr) { sw = img.height * tr; sx = (img.width - sw) / 2; }
      else { sh = img.width / tr; sy = (img.height - sh) / 2; }
      g.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
      g.restore();
    }
    g.fillStyle = 'rgba(12,14,18,0.45)';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(150,38,30,0.7)';
    g.lineWidth = 7;
    roundRect(g, 14, 14, W - 28, H - 28, 12);
    g.stroke();
    g.strokeStyle = 'rgba(226,193,126,0.22)';
    g.lineWidth = 1.5;
    roundRect(g, 24, 24, W - 48, H - 48, 10);
    g.stroke();
    return c;
  };


  // ==================== 序厅弧形巨幕（红色星空 · 地标纪实影像 · 光轨） ====================
  // photos：可选，长度 5 的图片数组，对应 井冈山/延安/西柏坡/红旗渠/新时代。
  // 传入且已就绪时绘制「金框纪实照片 + 地名牌」；未传时退回金色浮雕剪影（旧样式兜底）。
  Tex.lobbyScreen = function (W, H, photos) {
    W = W || 2048; H = H || 800;
    const hasPhotos = !!(photos && photos.some((p) => p && p.width));
    const paint = function () {
      const c = cv(W, H);
      const g = c.getContext('2d');

      // 深红黑渐变底
      const bg = g.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#190607');
      bg.addColorStop(0.45, '#3c0d0e');
      bg.addColorStop(0.8, '#551512');
      bg.addColorStop(1, '#280909');
      g.fillStyle = bg;
      g.fillRect(0, 0, W, H);

      // 中央红色光晕
      const rg = g.createRadialGradient(W * 0.5, H * 0.4, 30, W * 0.5, H * 0.4, W * 0.34);
      rg.addColorStop(0, 'rgba(222,62,40,0.5)');
      rg.addColorStop(0.5, 'rgba(182,42,32,0.18)');
      rg.addColorStop(1, 'rgba(182,42,32,0)');
      g.fillStyle = rg;
      g.fillRect(0, 0, W, H);

      // 星点
      for (let i = 0; i < 320; i++) {
        const b = Math.random();
        g.fillStyle = b > 0.85
          ? 'rgba(150,200,255,' + (0.3 + Math.random() * 0.4).toFixed(2) + ')'
          : 'rgba(255,220,200,' + (0.1 + Math.random() * 0.35).toFixed(2) + ')';
        g.beginPath();
        g.arc(Math.random() * W, Math.random() * H * 0.72, Math.random() * 1.8 + 0.4, 0, Math.PI * 2);
        g.fill();
      }

      // 底部金色光雾
      const fog = g.createLinearGradient(0, H * 0.6, 0, H);
      fog.addColorStop(0, 'rgba(122,72,20,0)');
      fog.addColorStop(0.55, 'rgba(192,122,42,0.34)');
      fog.addColorStop(1, 'rgba(242,182,82,0.6)');
      g.fillStyle = fog;
      g.fillRect(0, H * 0.6, W, H * 0.4);

      // 金色人物浮雕（无照片时的兜底：保持旧观感，不再作为主视觉）
      function figure(x, baseY, h, alpha) {
        const hw = h * 0.16, bw = h * 0.30;
        g.save();
        g.globalAlpha = alpha;
        const lg = g.createLinearGradient(0, baseY - h, 0, baseY);
        lg.addColorStop(0, 'rgba(255,226,160,0.95)');
        lg.addColorStop(1, 'rgba(202,132,52,0.25)');
        g.fillStyle = lg;
        g.beginPath(); g.arc(x, baseY - h + hw, hw, 0, Math.PI * 2); g.fill();
        g.beginPath();
        g.moveTo(x - bw * 0.62, baseY);
        g.lineTo(x - bw * 0.5, baseY - h * 0.42);
        g.quadraticCurveTo(x - bw * 0.44, baseY - h * 0.55, x, baseY - h * 0.58);
        g.quadraticCurveTo(x + bw * 0.44, baseY - h * 0.55, x + bw * 0.5, baseY - h * 0.42);
        g.lineTo(x + bw * 0.62, baseY);
        g.closePath(); g.fill();
        g.restore();
      }

      // 中部：五处红色地标的纪实影像（替换原先的抽象金色剪影——
      // 剪影无五官、半身被裁，观感像"人物没显示全"）
      (function landmarkPhotos() {
        const LABELS = ['井冈山', '延安', '西柏坡', '红旗渠', '新时代'];
        const PW = 250, PH = 228, GAP = 30;
        const totalPW = LABELS.length * PW + (LABELS.length - 1) * GAP;
        const left0 = (W - totalPW) / 2;
        const top0 = H * 0.40;
        for (let i = 0; i < LABELS.length; i++) {
          const px = left0 + i * (PW + GAP);
          const py = top0;
          const img = photos && photos[i];
          const ready = img && img.width && img.height;
          // 深色衬底 + 鎏金双线画框
          g.save();
          g.fillStyle = 'rgba(22,7,6,0.62)';
          g.fillRect(px - 7, py - 7, PW + 14, PH + 14);
          g.strokeStyle = '#d4a84a';
          g.lineWidth = 2.5;
          g.strokeRect(px - 7, py - 7, PW + 14, PH + 14);
          g.strokeStyle = 'rgba(212,168,74,0.32)';
          g.lineWidth = 1;
          g.strokeRect(px - 1.5, py - 1.5, PW + 3, PH + 3);
          if (ready) {
            const ir = img.width / img.height, tr = PW / PH;
            let sw = img.width, sh = img.height, sx = 0, sy = 0;
            if (ir > tr) { sw = img.height * tr; sx = (img.width - sw) / 2; }
            else { sh = img.width / tr; sy = (img.height - sh) / 2; }
            g.drawImage(img, sx, sy, sw, sh, px, py, PW, PH);
            // 统一暖红调性 + 底部压暗，让照片与弧幕红光融合
            g.fillStyle = 'rgba(72,14,10,0.26)';
            g.fillRect(px, py, PW, PH);
            const vg = g.createLinearGradient(0, py + PH * 0.52, 0, py + PH);
            vg.addColorStop(0, 'rgba(18,4,4,0)');
            vg.addColorStop(1, 'rgba(18,4,4,0.62)');
            g.fillStyle = vg;
            g.fillRect(px, py + PH * 0.52, PW, PH * 0.48);
          } else {
            g.save();
            g.beginPath(); g.rect(px, py, PW, PH); g.clip();
            g.fillStyle = 'rgba(58,14,12,0.8)';
            g.fillRect(px, py, PW, PH);
            figure(px + PW / 2, py + PH * 0.97, PH * 0.74, 0.85);
            g.restore();
          }
          g.restore();
          // 地名牌
          g.save();
          g.fillStyle = 'rgba(26,7,6,0.86)';
          g.fillRect(px, py + PH + 11, PW, 36);
          g.strokeStyle = 'rgba(212,168,74,0.55)';
          g.lineWidth = 1;
          g.strokeRect(px, py + PH + 11, PW, 36);
          text(g, LABELS[i], px + PW / 2, py + PH + 37, 23, '#f0d98a',
            { align: 'center', weight: 'bold', letter: '3px' });
          g.restore();
        }
      })();

      // 右下原先有一组「冲锋群像浮雕」暗红剪影（12 个三角形+圆点），
      // 与中部纪实照片风格冲突、且同样属于"人物显示不全"的抽象人形，故移除。

      // 金色地台光
      const gt = g.createRadialGradient(W * 0.5, H * 1.0, 10, W * 0.5, H * 1.0, W * 0.3);
      gt.addColorStop(0, 'rgba(255,212,120,0.5)');
      gt.addColorStop(1, 'rgba(255,190,90,0)');
      g.fillStyle = gt;
      g.fillRect(0, H * 0.72, W, H * 0.28);

      // 左右暗角
      const eL = g.createLinearGradient(0, 0, W * 0.09, 0);
      eL.addColorStop(0, 'rgba(0,0,0,0.85)'); eL.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = eL; g.fillRect(0, 0, W * 0.09, H);
      const eR = g.createLinearGradient(W, 0, W * 0.91, 0);
      eR.addColorStop(0, 'rgba(0,0,0,0.85)'); eR.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = eR; g.fillRect(W * 0.91, 0, W * 0.09, H);

      return c;
    };
    // 有照片时不走 memo（每次都要重绘）；无照片时缓存，避免重复生成星空
    return hasPhotos ? paint() : memo('lobbyScreen' + W + 'x' + H, paint);
  };

  // ============================================================
  // 新版展区纹理（对齐参考图：深酒红 + 鎏金回纹 + 山形背景）
  // ============================================================

  // 金色回纹角花（画在 (x,y) 位置，dir 控制朝向：'tl'|'tr'|'bl'|'br'）
  function cornerMotif(g, x, y, size, dir) {
    g.save();
    g.translate(x, y);
    if (dir === 'tr') g.scale(-1, 1);
    if (dir === 'bl') g.scale(1, -1);
    if (dir === 'br') g.scale(-1, -1);
    g.strokeStyle = '#d4a84a';
    g.lineWidth = 3;
    // 外框 L
    g.beginPath();
    g.moveTo(0, size); g.lineTo(0, 0); g.lineTo(size, 0);
    g.stroke();
    // 回纹内折
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(12, size - 12); g.lineTo(12, 12); g.lineTo(size - 12, 12);
    g.stroke();
    g.beginPath();
    g.moveTo(24, size - 24); g.lineTo(24, 24); g.lineTo(size - 24, 24);
    g.stroke();
    g.restore();
  }

  // 背景墙：深色底 + 金色山形线条 + 四角回纹角花（用于展区主墙）
  Tex.bgMountains = function () {
    const W = 2048, H = 800;
    const c = cv(W, H);
    const g = c.getContext('2d');
    // 深褐近黑底
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#221a16');
    bg.addColorStop(1, '#16100d');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    // 远山金色线条（两层）
    g.strokeStyle = 'rgba(212,168,74,0.35)';
    g.lineWidth = 2;
    ridgeLine(g, W, H * 0.72, H * 0.18, 12345, 0.35);
    g.strokeStyle = 'rgba(212,168,74,0.6)';
    g.lineWidth = 2.5;
    ridgeLine(g, W, H * 0.82, H * 0.22, 54321, 0.6);
    // 顶部中国轮廓（简化金色线条）
    g.strokeStyle = 'rgba(212,168,74,0.5)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(W * 0.42, H * 0.22);
    g.bezierCurveTo(W * 0.46, H * 0.14, W * 0.54, H * 0.14, W * 0.58, H * 0.22);
    g.bezierCurveTo(W * 0.62, H * 0.28, W * 0.6, H * 0.36, W * 0.54, H * 0.38);
    g.bezierCurveTo(W * 0.48, H * 0.40, W * 0.42, H * 0.34, W * 0.42, H * 0.22);
    g.stroke();
    // 星点
    for (let i = 0; i < 60; i++) {
      g.fillStyle = `rgba(255,220,140,${Math.random() * 0.5 + 0.1})`;
      g.beginPath();
      g.arc(Math.random() * W, Math.random() * H * 0.5, Math.random() * 1.8 + 0.5, 0, Math.PI * 2);
      g.fill();
    }
    // 四角回纹角花
    cornerMotif(g, 30, 30, 80, 'tl');
    cornerMotif(g, W - 30, 30, 80, 'tr');
    cornerMotif(g, 30, H - 30, 80, 'bl');
    cornerMotif(g, W - 30, H - 30, 80, 'br');
    noise(g, W, H, 8);
    return c;
  };

  function ridgeLine(g, W, baseY, amp, seed, alpha) {
    let rnd = seed;
    const rand = () => ((rnd = (rnd * 9301 + 49297) % 233280) / 233280);
    g.beginPath();
    g.moveTo(0, baseY);
    let x = 0;
    while (x < W) {
      const step = 60 + rand() * 80;
      const peak = baseY - amp * (0.3 + rand() * 0.7);
      g.lineTo(x + step * 0.5, peak);
      x += step;
      g.lineTo(x, baseY - amp * 0.15 * rand());
    }
    g.lineTo(W, baseY);
    g.stroke();
  }

  // 主展板：深酒红底 + 鎏金回纹框 + 馆徽 + 金色标题 + 油画 + 文字 + 老照片 + 底部标语
  Tex.mainPanel = function (zone, img, photoImgs, photoList) {
    const W = 1600, H = 1000;
    const c = cv(W, H);
    const g = c.getContext('2d');
    // 深酒红渐变底
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#6e1a14');
    bg.addColorStop(0.5, '#5a1410');
    bg.addColorStop(1, '#3d0d0a');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    // 鎏金外框
    g.strokeStyle = '#d4a84a';
    g.lineWidth = 6;
    g.strokeRect(18, 18, W - 36, H - 36);
    g.strokeStyle = 'rgba(212,168,74,0.35)';
    g.lineWidth = 2;
    g.strokeRect(32, 32, W - 64, H - 64);
    // 四角回纹角花
    cornerMotif(g, 40, 40, 60, 'tl');
    cornerMotif(g, W - 40, 40, 60, 'tr');
    cornerMotif(g, 40, H - 40, 60, 'bl');
    cornerMotif(g, W - 40, H - 40, 60, 'br');

    // 顶部圆形馆徽（上移并缩小，避免压住下方大标题）
    const emblemX = W / 2, emblemY = 88;
    g.save();
    g.fillStyle = '#d4a84a';
    g.beginPath(); g.arc(emblemX, emblemY, 46, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#a81d17';
    g.beginPath(); g.arc(emblemX, emblemY, 38, 0, Math.PI * 2); g.fill();
    // 金星
    g.fillStyle = '#ffd97a';
    g.save();
    g.translate(emblemX, emblemY - 3);
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 19 : 8;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath(); g.fill();
    g.restore();
    g.restore();

    // 金色大标题（下移，与馆徽留出间距）
    text(g, zone.name, W / 2, 268, 104, '#f0d98a', { weight: 'bold', align: 'center', serif: true, letter: '10px' });
    // 英文+地点
    text(g, (zone.en || '') + '  ·  ' + (zone.place || ''), W / 2, 312, 28, 'rgba(240,217,138,0.7)', { align: 'center', letter: '4px' });
    // 标题下金线
    g.strokeStyle = '#d4a84a';
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(W / 2 - 160, 332); g.lineTo(W / 2 + 160, 332); g.stroke();

    // 左侧油画区（约 600x420）
    const ox = 60, oy = 350, ow = 560, oh = 420;
    g.save();
    g.beginPath(); g.rect(ox, oy, ow, oh); g.clip();
    if (img) {
      const ir = img.width / img.height;
      const tr = ow / oh;
      let sw = img.width, sh = img.height, sx = 0, sy = 0;
      if (ir > tr) { sw = img.height * tr; sx = (img.width - sw) / 2; }
      else { sh = img.width / tr; sy = (img.height - sh) / 2; }
      g.drawImage(img, sx, sy, sw, sh, ox, oy, ow, oh);
      g.fillStyle = 'rgba(80,20,15,0.25)';
      g.fillRect(ox, oy, ow, oh);
    } else {
      g.drawImage(Tex.scene(zone.scene, zone.accent, ''), ox, oy, ow, oh);
    }
    g.restore();
    g.strokeStyle = '#d4a84a';
    g.lineWidth = 3;
    g.strokeRect(ox, oy, ow, oh);

    // 右侧文字区
    const tx = 660, ty = 360, tw = W - 660 - 60;
    text(g, zone.board ? zone.board.title : zone.name, tx, ty + 10, 36, '#f0d98a', { weight: 'bold' });
    g.strokeStyle = '#d4a84a'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(tx, ty + 26); g.lineTo(tx + 80, ty + 26); g.stroke();
    // 正文（取前两段）
    let yy = ty + 60;
    const paragraphs = zone.board ? zone.board.paragraphs : [];
    g.font = '24px ' + FONT;
    paragraphs.slice(0, 2).forEach((p) => {
      const lines = wrap(g, p, tw);
      lines.slice(0, 5).forEach((ln) => {
        text(g, ln, tx, yy, 24, 'rgba(255,240,220,0.88)');
        yy += 38;
      });
      yy += 12;
    });

    // 底部历史照片区（按实际接线的张数排布，最多 5 张）
    const fy = 800;
    const photoW = 260, photoH = 140;
    const boardPhotos = photoList || (zone.board && zone.board.photos) || [];
    const photoData = boardPhotos.slice(0, 5).map((p, i) => ({
      label: (p && p.label) || (i === 0 ? '历史影像' : i === 1 ? '现场实录' : '历史影像'),
      focus: p && p.focus,
    }));
    if (!photoData.length) photoData.push({ label: '历史影像' }, { label: '现场实录' });
    photoData.forEach((pd, i) => {
      const px = 60 + i * (photoW + 30);
      g.fillStyle = '#1a1410';
      g.fillRect(px, fy, photoW, photoH);
      g.strokeStyle = '#d4a84a'; g.lineWidth = 2;
      g.strokeRect(px, fy, photoW, photoH);
      const pimg = photoImgs && photoImgs[i];
      g.save();
      g.beginPath(); g.rect(px + 4, fy + 4, photoW - 8, photoH - 8); g.clip();
      if (pimg) {
        const ir = pimg.width / pimg.height, tr = (photoW - 8) / (photoH - 28);
        let sw = pimg.width, sh = pimg.height, sx = 0, sy = 0;
        if (ir > tr) { sw = pimg.height * tr; sx = (pimg.width - sw) / 2; }
        else {
          sh = pimg.width / tr;
          sy = pd.focus === 'top' ? 0 : (pimg.height - sh) / 2;
        }
        g.drawImage(pimg, sx, sy, sw, sh, px + 4, fy + 4, photoW - 8, photoH - 28);
        // 底部标签压条
        g.fillStyle = 'rgba(30,10,8,0.82)';
        g.fillRect(px + 4, fy + photoH - 30, photoW - 8, 26);
      } else {
        g.globalAlpha = 0.5;
        g.drawImage(Tex.scene(zone.scene, zone.accent, ''), px, fy, photoW, photoH);
      }
      g.restore();
      text(g, pd.label, px + 10, fy + photoH - 10, 18, '#f0d98a', { weight: 'bold' });
    });

    // 底部金色标语（自适应字号，保证不超出左右边距）
    if (zone.spiritCard) {
      const slogan = zone.spiritCard.items.join('   ·   ');
      let fs = 30;
      while (fs > 16) {
        g.font = 'bold ' + fs + 'px ' + FONT;
        if (g.measureText(slogan).width <= W - 140) break;
        fs -= 2;
      }
      text(g, slogan, W / 2, 970, fs, '#f0d98a', { align: 'center', weight: 'bold', letter: '2px' });
    }
    noise(g, W, H, 6);
    return c;
  };

  // 人物立牌：深酒红底 + 鎏金回纹框 + 顶部金星 + 金色人物剪影 + 标签
  Tex.figureStand = function (fig, zone, img) {
    const W = 480, H = 1000;
    const c = cv(W, H);
    const g = c.getContext('2d');
    // 深酒红底
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#5a1410');
    bg.addColorStop(1, '#380c09');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    // 鎏金回纹外框
    g.strokeStyle = '#d4a84a';
    g.lineWidth = 5;
    g.strokeRect(16, 16, W - 32, H - 32);
    // 回纹内框（细）
    g.strokeStyle = 'rgba(212,168,74,0.4)';
    g.lineWidth = 1.5;
    g.strokeRect(28, 28, W - 56, H - 56);
    cornerMotif(g, 36, 36, 45, 'tl');
    cornerMotif(g, W - 36, 36, 45, 'tr');
    cornerMotif(g, 36, H - 36, 45, 'bl');
    cornerMotif(g, W - 36, H - 36, 45, 'br');

    // 顶部两颗金星
    g.fillStyle = '#ffd97a';
    for (let i = 0; i < 2; i++) {
      const sx = W / 2 + (i === 0 ? -28 : 28);
      const sy = 80 + (i === 0 ? 0 : 30);
      g.save();
      g.translate(sx, sy);
      g.beginPath();
      for (let j = 0; j < 10; j++) {
        const r = j % 2 === 0 ? 16 : 7;
        const a = -Math.PI / 2 + (j * Math.PI) / 5;
        g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.closePath(); g.fill();
      g.restore();
    }

    // 中部人物区：槽位固定为拱形；有照片贴照片，没有照片用「金色浮雕剪影」展签兜底
    const pw = 360, ph = 470, cx = W / 2, cy = H * 0.50;
    const px = cx - pw / 2, py = cy - ph / 2;
    const archPath = (inset) => {
      const r = (pw - inset * 2) / 2;
      g.beginPath();
      g.moveTo(px + inset, py + ph - inset);
      g.lineTo(px + inset, py + r + inset);
      g.arc(cx, py + r + inset, r, Math.PI, 0, false);
      g.lineTo(px + pw - inset, py + ph - inset);
      g.closePath();
    };

    // 拱龛底：深红径向光（照片与剪影共用同一槽位底，避免"空槽"观感）
    g.save();
    archPath(0);
    g.clip();
    const niche = g.createRadialGradient(cx, py + ph * 0.6, 12, cx, py + ph * 0.6, pw);
    niche.addColorStop(0, '#7d241b');
    niche.addColorStop(0.6, '#59140e');
    niche.addColorStop(1, '#3a0b07');
    g.fillStyle = niche;
    g.fillRect(px, py, pw, ph);
    g.restore();

    if (img) {
      // 拱形（半圆顶）裁切
      g.save();
      archPath(0);
      g.clip();
      // cover 填满，取景规则（优先级从高到低）：
      //   fig.photoCrop  —— 归一化原图区域 [x0, y0, w, h]，用于合影中锁定本人
      //   fig.photoFocus —— { x: 'left'|'right', y: 'top'|'bottom' }，微调裁切侧重
      //   默认            —— 居中
      const focus = (fig && fig.photoFocus) || {};
      const crop = (fig && fig.photoCrop) || null;
      const rx = crop ? crop[0] * img.width : 0;
      const ry = crop ? crop[1] * img.height : 0;
      const rw = crop ? crop[2] * img.width : img.width;
      const rh = crop ? crop[3] * img.height : img.height;
      const ir = rw / rh, tr = pw / ph;
      let sw = rw, sh = rh, sx = rx, sy = ry;
      if (ir > tr) {
        sw = rh * tr;
        sx = focus.x === 'left' ? rx : focus.x === 'right' ? rx + rw - sw : rx + (rw - sw) / 2;
      } else {
        sh = rw / tr;
        sy = focus.y === 'top' ? ry : focus.y === 'bottom' ? ry + rh - sh : ry + (rh - sh) / 2;
      }
      g.drawImage(img, sx, sy, sw, sh, px, py, pw, ph);
      // 轻微暗角，融入深红底
      const vg = g.createLinearGradient(0, py, 0, py + ph);
      vg.addColorStop(0, 'rgba(60,12,9,0.18)');
      vg.addColorStop(1, 'rgba(40,8,6,0.35)');
      g.fillStyle = vg;
      g.fillRect(px, py, pw, ph);
      g.restore();
    } else {
      // 金色浮雕剪影（半身像）：无肖像素材时的统一展签语言
      g.save();
      archPath(6);
      g.clip();
      const wash = g.createLinearGradient(0, py, 0, py + ph);
      wash.addColorStop(0, 'rgba(255,224,160,0.16)');
      wash.addColorStop(0.55, 'rgba(255,224,160,0.04)');
      wash.addColorStop(1, 'rgba(0,0,0,0.2)');
      g.fillStyle = wash;
      g.fillRect(px, py, pw, ph);
      g.translate(cx, py + ph * 0.58);
      g.scale(1.1, 1.1);
      const gold = g.createLinearGradient(0, -240, 0, 190);
      gold.addColorStop(0, '#f8e4ad');
      gold.addColorStop(0.55, '#e8c87a');
      gold.addColorStop(1, '#b98c3e');
      g.fillStyle = gold;
      // 肩胸（半身浮雕）
      g.beginPath();
      g.moveTo(-134, 210);
      g.quadraticCurveTo(-124, 34, -48, 6);
      g.lineTo(48, 6);
      g.quadraticCurveTo(124, 34, 134, 210);
      g.closePath();
      g.fill();
      // 颈
      g.fillRect(-24, -60, 48, 74);
      // 头
      g.beginPath();
      g.ellipse(0, -100, 57, 67, 0, 0, Math.PI * 2);
      g.fill();
      // 浮雕高光（左侧）
      const hl = g.createLinearGradient(-120, -160, 120, 160);
      hl.addColorStop(0, 'rgba(255,246,214,0.35)');
      hl.addColorStop(0.5, 'rgba(255,246,214,0)');
      g.fillStyle = hl;
      g.fillRect(-140, -240, 280, 460);
      g.restore();
    }

    // 鎏金拱形边框（照片/剪影共用，保证槽位外观一致）
    archPath(0);
    g.strokeStyle = '#d4a84a';
    g.lineWidth = 5;
    g.stroke();
    archPath(9);
    g.strokeStyle = 'rgba(212,168,74,0.35)';
    g.lineWidth = 1.5;
    g.stroke();

    // 底部标签框
    const labelY = H - 220;
    g.strokeStyle = '#d4a84a';
    g.lineWidth = 3;
    roundRect(g, W / 2 - 140, labelY, 280, 70, 6);
    g.stroke();
    text(g, fig.name, W / 2, labelY + 46, 38, '#f0d98a', { weight: 'bold', align: 'center', serif: true });
    // 下方小字
    text(g, fig.tag || '', W / 2, H - 120, 22, 'rgba(240,217,138,0.75)', { align: 'center' });
    // 底部小字：优先人物生卒年 fig.life，未填则回退展区年代 zone.period
    text(g, fig.life || (zone ? zone.period || '' : ''), W / 2, H - 85, 20, 'rgba(255,240,220,0.5)', { align: 'center' });
    noise(g, W, H, 8);
    return c;
  };

  // 右侧6个竖向资料卡（整幅Canvas，深红/深灰交替底色）
  Tex.sideCards = function (zone) {
    const CARD_W = 450, CARD_H = 900, N = 4;
    const W = CARD_W * N, H = CARD_H;
    const c = cv(W, H);
    const g = c.getContext('2d');
    g.fillStyle = 'transparent';
    g.clearRect(0, 0, W, H);

    // 只保留史料精华：影像资料 / 史料出处 / 文献摘录 / 人物故事
    const labels = ['影像资料', '史料出处', '文献摘录', '人物故事'];
    const isRed = [true, true, false, true];

    const factLine = (f) => f.k + '：' + f.v;
    const srcList = (window.MUSEUM_DATA && window.MUSEUM_DATA.sources && window.MUSEUM_DATA.sources[zone.id]) || [];
    const panels = [
      {
        head: zone.video ? zone.video.title : '影像资料',
        body: (zone.board.facts || []).map(factLine).join('\n'),
      },
      {
        head: '史料出处',
        body: srcList.join('\n'),
      },
      {
        head: '文献摘录',
        body: zone.board && zone.board.paragraphs[0] ? zone.board.paragraphs[0] : '',
      },
      {
        head: zone.figures && zone.figures[0] ? zone.figures[0].name : '人物故事',
        body: zone.figures && zone.figures[0]
          ? (zone.figures[0].tag || '') + '\n' + (zone.figures[0].desc || '')
          : '',
      },
    ];

    for (let i = 0; i < N; i++) {
      const x = i * CARD_W;
      // 卡片底色
      g.fillStyle = isRed[i] ? '#5a1410' : '#2a2a30';
      g.fillRect(x, 0, CARD_W, CARD_H);
      // 金色边框
      g.strokeStyle = '#d4a84a';
      g.lineWidth = 3;
      g.strokeRect(x + 4, 4, CARD_W - 8, CARD_H - 8);
      // 顶部标签
      g.fillStyle = isRed[i] ? '#d4a84a' : '#cfa850';
      roundRect(g, x + 30, 30, CARD_W - 60, 56, 4);
      g.fill();
      text(g, labels[i], x + CARD_W / 2, 68, 28, '#3d1a0a', { weight: 'bold', align: 'center' });
      // 内容区（浅色底）
      g.fillStyle = 'rgba(255,245,225,0.92)';
      g.fillRect(x + 20, 110, CARD_W - 40, CARD_H - 140);

      const panel = panels[i] || { head: '', body: '' };
      g.textAlign = 'left';
      // 金色栏名已在顶部，卡片内小标题若与栏名重复则不再绘制
      const showHead = panel.head && panel.head !== labels[i];
      // 先折行预算，便于在内容区垂直居中
      g.font = 'bold 30px "Microsoft YaHei", sans-serif';
      const headLines = showHead ? wrap(g, panel.head, CARD_W - 80).slice(0, 2) : [];
      g.font = '30px "Microsoft YaHei", sans-serif';
      const bodyLines = [];
      String(panel.body).split('\n').forEach((para) => {
        wrap(g, para, CARD_W - 80).forEach((ln) => bodyLines.push(ln));
      });
      const HEAD_LH = 52, BODY_LH = 70, GAP = 60;
      const totalH = (showHead ? headLines.length * HEAD_LH + GAP : 0) + bodyLines.length * BODY_LH;
      const areaTop = 130, areaH = CARD_H - 160;
      let yy = Math.max(areaTop, areaTop + (areaH - totalH) / 2);
      // 小标题（深红），仅在与栏名不同时绘制
      if (showHead) {
        g.fillStyle = '#8a2a1e';
        g.font = 'bold 30px "Microsoft YaHei", sans-serif';
        headLines.forEach((ln) => { g.fillText(ln, x + 38, yy); yy += HEAD_LH; });
        // 金色分隔线
        g.strokeStyle = 'rgba(180,130,60,0.6)';
        g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(x + 38, yy + 12); g.lineTo(x + CARD_W - 38, yy + 12); g.stroke();
        yy += GAP;
      }
      // 正文（深棕，30px、拉开行距，自动换行）
      g.fillStyle = '#4a3324';
      g.font = '30px "Microsoft YaHei", sans-serif';
      bodyLines.forEach((ln) => {
        if (yy > CARD_H - 110) return;
        g.fillText(ln, x + 38, yy);
        yy += BODY_LH;
      });
    }
    return c;
  };

  // 墙面装饰：透明底 + 淡金色山形线条（贴在深色空墙上，干净不杂乱）
  Tex.wallDeco = function () {
    const W = 2048, H = 600;
    const c = cv(W, H);
    const g = c.getContext('2d');
    g.clearRect(0, 0, W, H);
    // 两层远山金色线条
    g.strokeStyle = 'rgba(212,168,74,0.22)';
    g.lineWidth = 1.5;
    ridgeLine(g, W, H * 0.65, H * 0.2, 11111, 0.3);
    g.strokeStyle = 'rgba(212,168,74,0.35)';
    g.lineWidth = 2;
    ridgeLine(g, W, H * 0.8, H * 0.25, 22222, 0.5);
    // 顶部零星星点
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(255,220,140,${Math.random() * 0.3 + 0.08})`;
      g.beginPath();
      g.arc(Math.random() * W, Math.random() * H * 0.4, Math.random() * 1.5 + 0.5, 0, Math.PI * 2);
      g.fill();
    }
    return c;
  };

  // 历史照片带：3张老照片并排 + 金色标签 + 简短文字
  Tex.historyStrip = function (zone) {
    const W = 1400, H = 360;
    const c = cv(W, H);
    const g = c.getContext('2d');
    // 深色底
    g.fillStyle = '#1a120c';
    g.fillRect(0, 0, W, H);
    // 鎏金边框
    g.strokeStyle = '#cfa850';
    g.lineWidth = 4;
    g.strokeRect(6, 6, W - 12, H - 12);
    g.strokeStyle = 'rgba(207,168,80,0.4)';
    g.lineWidth = 1;
    g.strokeRect(14, 14, W - 28, H - 28);

    // 3张老照片
    const titles = (zone.board && zone.board.photos) || [
      '历史影像', '现场纪实', '文献资料'
    ];
    const photoW = 380, photoH = 200;
    const startX = (W - photoW * 3 - 40) / 2;
    for (let i = 0; i < 3; i++) {
      const px = startX + i * (photoW + 20);
      const py = 30;
      // 照片底（老照片棕褐色调）
      const grad = g.createLinearGradient(px, py, px, py + photoH);
      grad.addColorStop(0, '#8a7a5a');
      grad.addColorStop(0.5, '#6b5d42');
      grad.addColorStop(1, '#4a3f2e');
      g.fillStyle = grad;
      g.fillRect(px, py, photoW, photoH);
      // 模拟老照片噪点
      for (let n = 0; n < 200; n++) {
        g.fillStyle = `rgba(255,240,200,${Math.random() * 0.15})`;
        g.fillRect(px + Math.random() * photoW, py + Math.random() * photoH, 2, 2);
      }
      // 照片白边
      g.strokeStyle = 'rgba(255,240,210,0.6)';
      g.lineWidth = 2;
      g.strokeRect(px + 3, py + 3, photoW - 6, photoH - 6);
      // 标签
      g.fillStyle = '#cfa850';
      g.font = 'bold 22px "Microsoft YaHei", sans-serif';
      g.textAlign = 'center';
      g.fillText(titles[i] || `影像 ${i + 1}`, px + photoW / 2, py + photoH + 35);
    }
    return c;
  };

  // 全息中国地图（透明底 + 金色发光轮廓 + 主要城市光点）
  Tex.holoChina = function () {
    const W = 1024, H = 768;
    const c = cv(W, H);
    const g = c.getContext('2d');
    g.clearRect(0, 0, W, H);
    // 投影到画布
    const box = { x: 60, y: 60, w: W - 120, h: H - 120 };
    const mainland = projectChina(CN_MAINLAND, box);
    const taiwan = projectChina(CN_TAIWAN, box);
    const hainan = projectChina(CN_HAINAN, box);
    const nanhai = projectChina(CN_NANHAI_LINE, box);
    // 画发光轮廓
    g.strokeStyle = 'rgba(255,215,130,0.9)';
    g.lineWidth = 3;
    g.shadowColor = 'rgba(255,200,80,0.8)';
    g.shadowBlur = 12;
    const drawPath = (pts) => {
      g.beginPath();
      pts.forEach(([x, y], i) => {
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      });
      g.closePath();
      g.stroke();
    };
    drawPath(mainland);
    drawPath(taiwan);
    drawPath(hainan);
    // 南海断续线（国家地图规范要素，保留并调淡，避免抢轮廓）
    g.strokeStyle = 'rgba(255,215,130,0.32)';
    g.lineWidth = 1.2;
    g.setLineDash([7, 6]);
    g.beginPath();
    nanhai.forEach(([x, y], i) => {
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    });
    g.stroke();
    g.setLineDash([]);
    // 仅标记与前四个展厅对应的地点（末两位为标签相对光点的 x/y 偏移，用于避免叠字）
    const cities = [
      [114.05, 26.57, '井冈山', 8, -6],
      [109.49, 36.59, '延安', 8, -6],
      [113.98, 38.27, '西柏坡', 8, -10],
      [113.82, 36.18, '红旗渠', 8, 16],
    ];
    g.fillStyle = '#fff0c0';
    g.shadowColor = '#ffd97a';
    g.shadowBlur = 8;
    cities.forEach(([lon, lat, name, dx, dy]) => {
      const [x, y] = projectChina([[lon, lat]], box)[0];
      g.beginPath();
      g.arc(x, y, 4, 0, Math.PI * 2);
      g.fill();
      g.font = '16px "Microsoft YaHei", sans-serif';
      g.textAlign = 'left';
      g.fillText(name, x + (dx || 8), y + (dy == null ? -6 : dy));
    });
    return c;
  };

  window.Tex = Tex;
})();
