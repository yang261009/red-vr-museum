/**
 * AI 赋能模块
 * 1. 语音讲解员（Web Speech API 语音合成 + 用户配音文件优先播放）
 * 2. 智能导览助手（展陈知识库语义匹配 + 自动导航）
 * 3. 配音素材自动探测（audio/{展区id}.mp3 存在即优先播放真人配音）
 */
(function () {
  const data = window.MUSEUM_DATA;

  const AI = {
    voice: null,
    rate: 1.0,
    speaking: false,
    queue: null,
    audioEl: null,
    mode: '', // 'audio' = 正在播放用户配音文件；'tts' = 语音合成；'' = 空闲
    _probe: {},
    _timeline: {},
    _ctx: null,

    init() {
      const pick = () => {
        const vs = window.speechSynthesis ? speechSynthesis.getVoices() : [];
        this.voice =
          vs.find((v) => /zh[-_]CN/i.test(v.lang)) ||
          vs.find((v) => /^zh/i.test(v.lang)) ||
          null;
      };
      pick();
      if (window.speechSynthesis && speechSynthesis.getVoices().length === 0) {
        speechSynthesis.onvoiceschanged = pick;
      }
    },

    /** 把长文本切成句子，逐句朗读，便于同步字幕与中断 */
    split(text) {
      return text
        .split(/(?<=[。！？；：])/u)
        .map((s) => s.trim())
        .filter(Boolean);
    },

    speak(text, hooks) {
      hooks = hooks || {};
      if (!window.speechSynthesis) {
        if (hooks.onEnd) hooks.onEnd();
        return;
      }
      this.stop();
      const sentences = this.split(text);
      let i = 0;
      this.speaking = true;
      const self = this;
      const next = () => {
        if (i >= sentences.length || !self.speaking) {
          self.speaking = false;
          if (hooks.onEnd) hooks.onEnd();
          return;
        }
        const s = sentences[i];
        const u = new SpeechSynthesisUtterance(s);
        if (self.voice) u.voice = self.voice;
        u.lang = 'zh-CN';
        u.rate = self.rate;
        u.pitch = 1.0;
        u.onstart = () => {
          if (hooks.onSentence) hooks.onSentence(i, s, sentences);
        };
        u.onend = () => {
          i++;
          next();
        };
        u.onerror = () => {
          i++;
          next();
        };
        speechSynthesis.speak(u);
      };
      this.queue = { stop: () => (this.speaking = false) };
      next();
    },

    pause() {
      if (this.mode === 'audio' && this.audioEl) this.audioEl.pause();
      else if (window.speechSynthesis) speechSynthesis.pause();
    },

    resume() {
      if (this.mode === 'audio' && this.audioEl) this.audioEl.play();
      else if (window.speechSynthesis) speechSynthesis.resume();
    },

    /** 当前是否处于暂停状态（自动判断配音文件 / 语音合成两种模式） */
    isPaused() {
      if (this.mode === 'audio' && this.audioEl) return this.audioEl.paused;
      return !!(window.speechSynthesis && speechSynthesis.paused);
    },

    stop() {
      this.speaking = false;
      this.mode = '';
      if (this._syncTimer) {
        clearInterval(this._syncTimer);
        this._syncTimer = null;
      }
      if (window.speechSynthesis) speechSynthesis.cancel();
      if (this.audioEl) {
        this.audioEl.pause();
        this.audioEl.currentTime = 0;
      }
    },

    /** 探测配音文件是否可用（结果按路径缓存，不可用则回退语音合成） */
    tryAudio(src) {
      if (this._probe[src]) return this._probe[src];
      const p = new Promise((resolve, reject) => {
        const a = new Audio();
        a.preload = 'auto';
        a.src = src;
        // 超时放宽到 8s，避免慢网络下误判缺失而回退语音合成
        const timer = setTimeout(() => resolve(src), 8000);
        a.onloadedmetadata = () => {
          clearTimeout(timer);
          resolve(src);
        };
        a.oncanplay = () => {
          clearTimeout(timer);
          resolve(src);
        };
        a.onerror = () => {
          clearTimeout(timer);
          reject(new Error('missing'));
        };
      });
      this._probe[src] = p;
      return p;
    },

    /** 配音稿全文：默认"过渡语 + 讲解词"（与整段录音稿一致）；data.js 中可给 zone 加 script 字段覆盖 */
    scriptOf(zone) {
      return zone.script || ((zone.transition || '') + (zone.lecture || '')).trim();
    },

    /**
     * 把配音稿切成适合逐条显示的字幕单元。
     * 录音通常在逗号处也有停顿，因此先按全部标点细切，
     * 再依据音频语音段数量（每段≈一次停顿）做合并/再分。
     */
    subUnits(text, target) {
      // 只在句末标点断句；逗号、顿号、分号、冒号、破折号属句内停顿，保留在同一条内，
      // 避免字幕条以悬挂的逗号/顿号结尾。
      const BRK = '。！？…';
      let ps = [];
      let buf = '';
      for (const ch of String(text)) {
        buf += ch;
        if (BRK.indexOf(ch) >= 0) {
          const t = buf.trim();
          if (t) ps.push(t);
          buf = '';
        }
      }
      if (buf.trim()) ps.push(buf.trim());
      ps = ps.filter((x) => !/^[—…]+$/.test(x));
      if (!ps.length) ps = [String(text).trim()];

      // 1) 过短片段（<6 字）并入相邻
      while (ps.length > 1 && Math.min.apply(null, ps.map((x) => x.length)) < 6) {
        let mi = 0;
        for (let i = 1; i < ps.length; i++) if (ps[i].length < ps[mi].length) mi = i;
        const j = mi === 0 ? 1 : mi - 1;
        ps[Math.min(mi, j)] = ps[Math.min(mi, j)] + ps[Math.max(mi, j)];
        ps.splice(Math.max(mi, j), 1);
      }
      // 2) 多于目标段数：合并相邻最短对
      while (target > 0 && ps.length > target) {
        let bi = 0, bs = Infinity;
        for (let i = 0; i < ps.length - 1; i++) {
          const v = ps[i].length + ps[i + 1].length;
          if (v < bs) { bs = v; bi = i; }
        }
        ps[bi] = ps[bi] + ps[bi + 1];
        ps.splice(bi + 1, 1);
      }
      // 3) 明显少于目标段数（不足一半）才拆分最长片段，避免在词中间断开
      while (target > 0 && ps.length * 2 <= target) {
        let mi = 0;
        for (let i = 1; i < ps.length; i++) if (ps[i].length > ps[mi].length) mi = i;
        if (ps[mi].length < 12) break;
        const cut = this._cutPoint(ps[mi]);
        ps.splice(mi, 1, ps[mi].slice(0, cut), ps[mi].slice(cut));
      }
      // 兜底：去掉每条首尾残留的句内停顿标点，避免悬挂逗号/前导逗号
      ps = ps.map((x) => x.replace(/^[，、；：—\s]+|[，、；：—\s]+$/g, '')).filter(Boolean);
      if (!ps.length) ps = [String(text).trim()];
      return ps;
    },

    /** 在字符串中点附近找一个"好"的切点：优先标点，避开数字/字母中间 */
    _cutPoint(s) {
      const mid = s.length >> 1;
      let best = mid, bestScore = Infinity;
      for (let i = 2; i < s.length - 1; i++) {
        let sc = Math.abs(i - mid);
        if ('，、；：—…'.indexOf(s[i]) >= 0) sc -= 40;
        if (/[0-9A-Za-z]/.test(s[i]) || /[0-9A-Za-z]/.test(s[i - 1])) sc += 35;
        if (sc < bestScore) { bestScore = sc; best = i; }
      }
      return best;
    },

    /**
     * 字幕推进。
     * 先解码音频波形解出语音段（每段≈一次停顿），把文本切成同等粒度的
     * 字幕单元后做单调对齐；解不出时退回"时长 × 字数比例"估算。
     */
    _syncSubtitle(a, text, hooks, alt) {
      if (this._syncTimer) {
        clearInterval(this._syncTimer);
        this._syncTimer = null;
      }
      if (!hooks.onSentence) return;
      const self = this;

      const run = (tl) => {
        let parts, marks;
        if (tl && tl.units && tl.marks && tl.units.length === tl.marks.length) {
          parts = tl.units;
          marks = tl.marks;
        } else {
          parts = this.subUnits(tl && tl.textUsed ? tl.textUsed : text, 0);
          const dur = a.duration;
          const total = parts.reduce((n, x) => n + x.length, 0);
          if (!dur || !isFinite(dur) || dur <= 0 || !total) {
            hooks.onSentence(0, parts.join(''), parts);
            return;
          }
          let acc = 0;
          const ends = parts.map((x) => {
            acc += x.length;
            return (acc / total) * dur;
          });
          marks = ends.map((e, i) => ({ s: i ? ends[i - 1] : 0, e: e }));
        }
        let idx = -1;
        const tick = () => {
          const t = a.currentTime;
          let j = 0;
          // 句间留白时仍显示当前句，直到下一句真正开始
          while (j < marks.length - 1 && t >= marks[j + 1].s) j++;
          if (j !== idx) {
            idx = j;
            hooks.onSentence(j, parts[j], parts);
          }
        };
        tick();
        self._syncTimer = setInterval(tick, 120);
      };

      this.buildTimeline(a.src, text, alt).then(run, () => run(null));
    },

    /**
     * 解码配音并生成「字幕单元 + 时间轴」（结果按 url 缓存）。
     * 依赖 fetch + AudioContext，file:// 等场景不可用时会返回 null。
     */
    buildTimeline(url, text, alt) {
      if (this._timeline[url]) return this._timeline[url];
      const self = this;
      const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
      const p = (!AC || typeof fetch !== 'function')
        ? Promise.resolve(null)
        : fetch(url)
            .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error('http'))))
            .then((ab) => new Promise((res, rej) => {
              let ctx = self._ctx;
              if (!ctx) {
                try { ctx = self._ctx = new AC(); } catch (e) { return rej(e); }
              }
              const ok = (buf) => res(buf);
              const bad = (e) => rej(e || new Error('decode'));
              const r = ctx.decodeAudioData(ab, ok, bad);
              if (r && r.then) r.then(ok, bad);
            }))
            .then((buf) => {
              const ch = buf.getChannelData(0);
              const segs = self._voicedSegments(ch, buf.sampleRate);
              if (!segs.length) return null;
              // 自适应：录音可能只含讲解词（无过渡语）。两种文本都试对齐，
              // 取"中位语速最接近自然朗读(≈5字/秒)"的一版。
              const tryAlign = (t) => {
                const units = self.subUnits(t, segs.length);
                const marks = self._align(units, segs);
                return marks ? { units: units, marks: marks, textUsed: t } : null;
              };
              const full = tryAlign(text);
              const judge = (r) => {
                if (!r) return Infinity;
                const sp = r.units
                  .map((u, i) => u.length / Math.max(r.marks[i].e - r.marks[i].s, 0.05))
                  .sort((a, b) => a - b);
                return Math.abs(sp[sp.length >> 1] - 5);
              };
              let best = full;
              if (alt && alt !== text) {
                const only = tryAlign(alt);
                if (judge(only) < judge(full)) best = only;
              }
              return best;
            })
            .catch(() => null);
      this._timeline[url] = p;
      p.then((tl) => {
        p.__resolved = true;
        p.__textUsed = tl ? tl.textUsed : text;
      });
      return p;
    },

    /** 字幕初始显示文本：能判定录音结构时用匹配的稿子，否则先按讲解词 */
    captionOf(zone) {
      const pr = zone.audio && this._timeline[zone.audio];
      if (pr && pr.__resolved && pr.__textUsed) return pr.__textUsed;
      return zone.lecture || this.scriptOf(zone);
    },

    /** 短时能量静音检测：返回语音段 [{s,e}]（秒） */
    _voicedSegments(data, sr) {
      const frame = Math.max(1, Math.round(sr * 0.02));
      const frameDur = frame / sr;
      const en = [];
      for (let i = 0; i + frame <= data.length; i += frame) {
        let sum = 0;
        for (let j = 0; j < frame; j++) {
          const v = data[i + j];
          sum += v * v;
        }
        en.push(Math.sqrt(sum / frame));
      }
      if (en.length < 3) return [];
      const sorted = en.slice().sort((a, b) => a - b);
      const at = (r) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * r))];
      const lo = at(0.10), hi = at(0.90);
      let th = Math.max(lo * 2.4, hi * 0.10, 1e-4);
      // 几乎没有留白的连读录音：抬高阈值，避免整段被判定成一句话
      if (hi > 0 && lo / hi > 0.45) th = hi * 0.45;
      const v = en.map((e) => e > th);
      const MIN_SIL = Math.max(1, Math.round(0.18 / frameDur));
      const MIN_VO = Math.max(1, Math.round(0.30 / frameDur));
      for (let i = 0; i < v.length; ) {
        if (v[i]) { i++; continue; }
        let j = i;
        while (j < v.length && !v[j]) j++;
        if (j - i < MIN_SIL && i > 0 && j < v.length) for (let k = i; k < j; k++) v[k] = true;
        i = j;
      }
      for (let i = 0; i < v.length; ) {
        if (!v[i]) { i++; continue; }
        let j = i;
        while (j < v.length && v[j]) j++;
        if (j - i < MIN_VO) for (let k = i; k < j; k++) v[k] = false;
        i = j;
      }
      const segs = [];
      for (let i = 0; i < v.length; ) {
        if (!v[i]) { i++; continue; }
        let j = i;
        while (j < v.length && v[j]) j++;
        segs.push({ s: i * frameDur, e: j * frameDur });
        i = j;
      }
      return segs;
    },

    /**
     * 句子与语音段的单调对齐：允许"一句跨多段""多句共一段"，
     * 使每句的"按字数推算的应有时长"与"实际语音段时长"整体最接近。
     */
    _align(parts, segs) {
      const M = parts.length, N = segs.length;
      if (!M || !N) return null;
      const totalChars = parts.reduce((n, x) => n + x.length, 0) || 1;
      const voiced = segs.reduce((t, g) => t + (g.e - g.s), 0) || 1;
      const exp = parts.map((x) => (x.length / totalChars) * voiced);
      const charsOf = (from, to) => parts.slice(from, to).reduce((n, x) => n + x.length, 0) || 1;
      const K = 3;
      const INF = Number.MAX_VALUE;
      const dp = [], prevJ = [], howMany = [];
      for (let i = 0; i <= M; i++) {
        dp.push(new Array(N + 1).fill(INF));
        prevJ.push(new Array(N + 1).fill(0));
        howMany.push(new Array(N + 1).fill(1));
      }
      dp[0][0] = 0;
      const durOf = (a, b) => {
        let d = 0;
        for (let t = a; t < b; t++) d += segs[t].e - segs[t].s;
        return d;
      };
      for (let i = 1; i <= M; i++) {
        for (let j = 1; j <= N; j++) {
          for (let k = 1; k <= K && j - k >= 0; k++) {
            if (dp[i - 1][j - k] === INF) continue;
            const cost = Math.abs(durOf(j - k, j) - exp[i - 1]) + 0.6 * (k - 1);
            if (dp[i - 1][j - k] + cost < dp[i][j]) {
              dp[i][j] = dp[i - 1][j - k] + cost;
              prevJ[i][j] = j - k;
              howMany[i][j] = 1;
            }
          }
          for (let k = 2; k <= K && i - k >= 0; k++) {
            if (dp[i - k][j - 1] === INF) continue;
            let need = 0;
            for (let t = i - k; t < i; t++) need += exp[t];
            const cost = Math.abs(segs[j - 1].e - segs[j - 1].s - need) + 1.2 * (k - 1);
            if (dp[i - k][j - 1] + cost < dp[i][j]) {
              dp[i][j] = dp[i - k][j - 1] + cost;
              prevJ[i][j] = j - 1;
              howMany[i][j] = k;
            }
          }
        }
      }
      if (dp[M][N] === INF) return null;

      const out = new Array(M);
      let i = M, j = N, guard = 0;
      while (i > 0 && guard++ < M * 4) {
        const cnt = howMany[i][j] || 1;
        const pj = prevJ[i][j];
        const start = i - cnt;
        const s0 = segs[pj].s, e0 = segs[j - 1].e;
        if (cnt === 1) {
          out[start] = { s: s0, e: e0 };
        } else {
          const tot = charsOf(start, i);
          let acc = 0;
          for (let t = start; t < i; t++) {
            const a1 = s0 + (acc / tot) * (e0 - s0);
            acc += parts[t].length;
            out[t] = { s: a1, e: s0 + (acc / tot) * (e0 - s0) };
          }
        }
        i = start;
        j = pj;
      }
      // 兜底：修正空值与非单调
      let prev = 0;
      for (let t = 0; t < M; t++) {
        if (!out[t]) out[t] = { s: prev, e: prev + exp[t] };
        if (out[t].s < prev) out[t].s = prev;
        if (out[t].e <= out[t].s) out[t].e = out[t].s + 0.4;
        prev = out[t].e;
      }
      return out;
    },

    /** 播放单个配音文件；text 为同步字幕稿（alt 为备选稿：仅讲解词）；hooks: onAudioStart(src), onEnd(), onAudioFail() */
    _playFile(src, hooks, text, alt) {
      hooks = hooks || {};
      const self = this;
      this.stop();
      const a = this.audioEl || new Audio();
      this.audioEl = a;
      a.src = src;
      a.currentTime = 0;
      a.onended = () => {
        self.mode = '';
        if (self._syncTimer) {
          clearInterval(self._syncTimer);
          self._syncTimer = null;
        }
        if (hooks.onEnd) hooks.onEnd();
      };
      a.onerror = () => {
        self.mode = '';
        if (self._syncTimer) {
          clearInterval(self._syncTimer);
          self._syncTimer = null;
        }
        if (hooks.onAudioFail) hooks.onAudioFail();
      };
      this.mode = 'audio';
      if (hooks.onAudioStart) hooks.onAudioStart(src);
      if (text) {
        // 元数据就绪后才有 duration，否则无法按比例推算时间点
        const startSync = () => this._syncSubtitle(a, text, hooks, alt);
        if (a.readyState >= 1 && isFinite(a.duration) && a.duration > 0) startSync();
        else a.addEventListener('loadedmetadata', startSync, { once: true });
      }
      const pr = a.play();
      if (pr && pr.catch) {
        pr.catch(() => {
          // 自动播放被拦截或解码失败时回退到语音合成
          self.mode = '';
          if (hooks.onAudioFail) hooks.onAudioFail();
        });
      }
    },

    /**
     * 播放展厅讲解：优先播放用户配音文件（audio/{id}.mp3），缺失时回退语音合成
     * hooks: onAudioStart(src), onTTSStart(), onSentence(i, text, all), onEnd()
     */
    playNarration(zone, hooks) {
      hooks = hooks || {};
      const self = this;
      if (zone.audio) {
        this.tryAudio(zone.audio).then(
          (src) =>
            self._playFile(
              src,
              Object.assign({}, hooks, {
                onAudioFail: () => self._speakText(zone.lecture, hooks),
              }),
              self.scriptOf(zone),
              zone.lecture
            ),
          () => self._speakText(zone.lecture, hooks)
        );
      } else {
        this._speakText(zone.lecture, hooks);
      }
    },

    /**
     * 自动导览单站讲解：优先播放 audio/{id}.mp3 真人配音
     * 配音可用时过渡语只走字幕（不再另做语音合成），保证全程同一音色；
     * 配音缺失时才把"过渡语 + 讲解词"交给语音合成。
     */
    playTourStep(zone, hooks) {
      hooks = hooks || {};
      const self = this;
      const fallback = () => self._speakText((zone.transition || '') + zone.lecture, hooks);
      if (zone.audio) {
        this.tryAudio(zone.audio).then(
          (src) => self._playFile(src, Object.assign({}, hooks, { onAudioFail: fallback }), self.scriptOf(zone), zone.lecture),
          fallback
        );
      } else {
        fallback();
      }
    },

    _speakText(text, hooks) {
      if (hooks.onTTSStart) hooks.onTTSStart();
      this.mode = 'tts';
      this.speak(text, hooks);
    },

    /** 本地规则评分：按 rubric 关键词命中要点，返回得分/已覆盖/待补充/评语 */
    gradeAnswer(studentText, rubric) {
      const text = String(studentText || '').trim();
      const list = Array.isArray(rubric) ? rubric : [];
      if (!text || !list.length) {
        return { score: 0, covered: [], missing: list.map((r) => r.t), comment: '请先写下你的思考，再提交AI评价。' };
      }
      const covered = [], missing = [];
      list.forEach((r) => {
        const hit = (r.k || []).some((kw) => text.includes(kw));
        (hit ? covered : missing).push(r.t);
      });
      const score = Math.round((covered.length / list.length) * 100);
      let comment;
      if (score >= 85) comment = '回答全面，核心要点均已覆盖，理解到位，继续保持。';
      else if (score >= 60) comment = '主体思路正确，已覆盖多数要点，补上遗漏处论述会更完整。';
      else if (score >= 35) comment = '已有一定思考，但覆盖要点偏少，建议对照参考答案补充关键角度。';
      else comment = '回答较简略，建议结合展板内容重新梳理，抓住核心要点再作答。';
      return { score, covered, missing, comment };
    },

    /** 组装展陈上下文（供大模型对话使用）：知识库要点 + 展厅清单 + 当前所处展厅 */
    buildContext(currentZoneId) {
      const zones = data.zones
        .map((z) => `${z.name}（${z.place}，${z.period}）：${z.spirit || z.name + '精神'}`)
        .join('\n');
      const kb = data.knowledge
        .map((k) => k.keys.join('/') + '：' + k.a)
        .join('\n');
      let cur = '';
      if (currentZoneId) {
        const z = data.zones.find((x) => x.id === currentZoneId);
        if (z) cur = '用户当前所在展厅：' + z.name + '（' + z.spirit + '）。' +
          (z.board ? '\n该展厅展板要点：' + (z.board.paragraphs || []).join('') : '');
      }
      return '【五大展厅】\n' + zones + '\n\n【展陈知识库】\n' + kb + (cur ? '\n\n' + cur : '');
    },

    /**
     * 按当前展厅返回"第一人称亲历者"角色设定。
     * 让导览员像陪学生走在现场一样讲故事，而不是念资料卡上的定义。
     */
    zoneRole(zoneId) {
      const roles = {
        jgs:
          '你此刻是一位1927年随秋收起义部队登上井冈山的红军老战士。请用第一人称"我"的口吻，带着山里的寒风、篝火和红米饭南瓜汤的温度，' +
          '给学生讲井冈山的故事。多讲黄洋界哨口的炮火、茅坪八角楼的油灯、朱毛会师、三湾改编这些具体的人和场景，少用"革命道路""武装割据"这类抽象定义；' +
          '学生问"为什么"时，用你亲眼所见的艰难与信念来回答。',
        yanan:
          '你此刻是一位在延安窑洞住了十三年的老八路/教员。请用第一人称"我"的口吻，在煤油灯下给学生讲故事：' +
          '张思德烧炭、白求恩不远万里来救伤员、南泥湾开荒。语气朴实温暖，强调"为人民服务"是用行动做出来的，而不是一句口号。',
        xbp:
          '你此刻是一位1949年在西柏坡这个小山村里跟随党中央准备"进京赶考"的老警卫员。请用第一人称"我"的口吻，' +
          '讲七届二中全会、两个务必、最后一个农村指挥所的故事。语气郑重而清醒，提醒学生"赶考"的谦虚与谨慎从何而来。',
        hqq:
          '你此刻是一位1960年在河南林县太行山上、腰系绳索悬在悬崖上除险石的修渠民工（就像任羊成那样）。请用第一人称"我"的口吻，' +
          '讲吴祖太怎么勘测设计、老乡们怎么用一锤一钎在绝壁上凿出千里天河。多讲饿肚子、摔石头、十年不回家的具体艰辛，让学生懂得"红旗渠精神"是拿命换的。',
        xsd:
          '你此刻是一位在大山里驻村的年轻第一书记（就像黄文秀那样）。请用第一人称"我"的口吻，讲脱贫攻坚、帮助山里女孩走出大山读书的故事。' +
          '语气真诚向上，和今天的青年学生聊"奋斗"和"选择"。',
      };
      return roles[zoneId] || '';
    },

    /**
     * 与人物立牌"对话"：AI 以该人物第一人称回答。
     * 返回 Promise<{ text, via }>。无 Key / 失败时回退本地人物简介。
     */
    async talkToFigure(q, fig, zoneId) {
      q = String(q || '').trim();
      const zone = zoneId ? data.zones.find((z) => z.id === zoneId) : null;
      const fallback = () => this.figureLocal(q, fig, zone);
      if (!(window.LLM && window.LLM.enabled())) {
        return Object.assign({ via: 'local' }, fallback());
      }
      const sys =
        '你现在就是中国革命历史人物「' + fig.name + '」（生卒：' + (fig.life || '不详') + '）。' +
        '请始终以第一人称"我"的口吻，回答今天在VR展馆里参观的学生。你此刻仍站在' +
        (zone ? (zone.name + '（' + zone.place + '）') : '本展馆') + '，身处你那个年代。' +
        '你亲身经历、可以确信的事：' + (fig.desc || '') + '。' +
        '要求：①语言朴实真诚、有温度，符合你的身份与时代，不用现代网络语；' +
        '②只谈你亲身经历、亲眼所见，不假装知道你身后才发生的事；' +
        '③学生若问你无法知道的现代问题，温和地说"这个我那个年代还想不到"，再把话题引回你的信念与故事；' +
        '④每次回答控制在150字以内，像面对面聊天，不要列提纲。';
      const ctx = '【对话对象】学生（今天的参观者）。' +
        (zone ? '\n【所在展厅】' + zone.name + '，主题：' + (zone.spirit || '') : '');
      try {
        const text = await window.LLM.answer(q, ctx, sys);
        return { text: text, via: 'llm' };
      } catch (e) {
        const r = fallback();
        r.fallbackNote = '（大模型暂不可用，以下为立牌资料）';
        return Object.assign({ via: 'local' }, r);
      }
    },

    /** 人物对话的本地兜底：用立牌资料生成一段第一人称回应 */
    figureLocal(q, fig, zone) {
      if (!q) {
        return {
          text: '我是' + fig.name + '（' + (fig.life || '') + '）。' +
            '你想问我当年的哪段经历？尽管开口。',
        };
      }
      return {
        text: '关于这件事，我说说我当年的经历：' + (fig.desc || '（立牌暂无更多资料）') +
          (zone ? '\n我们那个年代在' + zone.place + '，认准的事再难也要干成。' : ''),
      };
    },

    /** 语义匹配：返回 { text, go, zone }（本地规则，作为无大模型时的兜底） */
    answerLocal(q) {
      q = String(q || '').trim();
      if (!q) return { text: '你可以问我：井冈山精神是什么、红旗渠有多长、黄文秀是谁，或者说"带我去延安"。' };

      // 1) 导航意图
      const navZone = this.detectNav(q);
      if (navZone) {
        return {
          text: `好的，正在带你前往【${navZone.name}】——${navZone.place}。${navZone.transition || ''}`,
          go: navZone.id,
          zone: navZone,
        };
      }

      // 2) 讲解意图
      const explainZone = data.zones.find((z) => q.includes(z.name) && /讲解|介绍|说说|讲一讲|念一下|朗读/.test(q));
      if (explainZone) {
        return { text: '正在播放【' + explainZone.name + '】的讲解词。', speak: explainZone, zone: explainZone };
      }

      // 3) 知识库关键词匹配（按命中长度加权）
      let best = null;
      let bestScore = 0;
      data.knowledge.forEach((k) => {
        let score = 0;
        k.keys.forEach((key) => {
          if (q.includes(key)) score += key.length * 2;
        });
        // 模糊匹配：问题中任意 2 字词出现在关键词里
        if (score === 0) {
          const seg = q.replace(/[，。？！、\s]/g, '');
          for (let i = 0; i < seg.length - 1; i++) {
            const w = seg.substr(i, 2);
            if (k.keys.some((key) => key.includes(w))) score += 1;
          }
        }
        if (score > bestScore) {
          bestScore = score;
          best = k;
        }
      });

      if (best && bestScore > 0) {
        const zone = best.go ? data.zones.find((z) => z.id === best.go) : null;
        return { text: best.a, go: best.go, zone };
      }

      return { text: data.fallback[Math.floor(Math.random() * data.fallback.length)] };
    },

    /**
     * 智能导览助手 / AI 助教入口（异步）。
     * 优先调用 DeepSeek 大模型（已配置 Key 时）；无 Key / 请求失败时回退本地规则。
     * 返回 Promise<{ text, go, zone, speak, via }>。
     * mode: 'guide' 导览 | 'learn' 学(知识问答) | 'grade' 评(AI评分)
     */
    async answer(q, currentZoneId, mode) {
      q = String(q || '').trim();
      mode = mode || 'guide';

      // 无 Key：直接本地
      if (!(window.LLM && window.LLM.enabled())) {
        return Object.assign({ via: 'local' }, this.answerLocal(q));
      }

      // 有 Key：交给大模型（带模式化人设）
      const personas = {
        guide:
          '你是"行走的思政课"VR红色展馆的智能导览助手。围绕井冈山、延安、西柏坡、红旗渠、脱贫攻坚五处红色地标与革命精神作答，' +
          '史实严谨、表达亲切，避免空话。可在合适时引导用户参观对应展厅，但不要臆造史实数据。',
        learn:
          '你是"行走的思政课"AI 助教（学习模式）。负责循循善诱地讲解知识、答疑解惑，帮助学生理解红色历史与革命精神内涵，' +
          '必要时可启发式提问。语言通俗准确，条理清晰。',
        grade:
          '你是"行走的思政课"AI 助教（评价模式）。对学生的回答进行客观、鼓励性的评价，指出优点与不足，并给出改进建议。',
      };
      let sysPersona = personas[mode] || personas.guide;
      // 导览模式：按当前展厅叠加"第一人称亲历者"角色，让讲解像陪走而非念资料卡
      if (mode === 'guide') {
        const role = this.zoneRole(currentZoneId);
        if (role) sysPersona += '\n\n【当前角色】' + role;
      }
      try {
        const text = await window.LLM.answer(q, this.buildContext(currentZoneId), sysPersona);
        // 若回复中明确要导航到某展厅，尽量联动（弱解析，不强制）
        const navZone = this.detectNav(q);
        return { text: text, go: navZone ? navZone.id : undefined, zone: navZone || undefined, via: 'llm' };
      } catch (e) {
        // 大模型失败：回退本地规则，并保留一条提示
        const local = Object.assign({ via: 'local' }, this.answerLocal(q));
        local.fallbackNote = '（大模型暂不可用，已切换本地知识库）';
        return local;
      }
    },

    /**
     * 简答论述 AI 评分（异步）。
     * 已配置 Key 时用 DeepSeek 多维度评分；否则回退本地关键词评分。
     * 返回 Promise<{ score, comment, covered, missing, suggest?, via }>
     */
    async grade(studentText, rubric, question, refAnswer) {
      const text = String(studentText || '').trim();
      if (!text || !(rubric && rubric.length)) {
        return Object.assign({ via: 'local' }, this.gradeAnswer(studentText, rubric));
      }
      if (window.LLM && window.LLM.enabled()) {
        try {
          const r = await window.LLM.grade(question || '', text, rubric, refAnswer || '');
          return Object.assign({ via: 'llm' }, r);
        } catch (e) {
          // 回退本地
          return Object.assign({ via: 'local' }, this.gradeAnswer(studentText, rubric));
        }
      }
      return Object.assign({ via: 'local' }, this.gradeAnswer(studentText, rubric));
    },

    /**
     * 整份答卷综合总评（异步）。
     * 汇总一个展厅的客观题成绩 + 各简答，出具整体评价。
     * @param {object} payload { zoneName, objTotal, objRight, essays: [{q, ref, answer}] }
     * @returns Promise<{ score, comment, covered[], missing[], suggest?, via }>
     */
    async gradeAll(payload) {
      payload = payload || {};
      const objTotal = payload.objTotal || 0;
      const objRight = payload.objRight || 0;
      const essays = Array.isArray(payload.essays) ? payload.essays : [];

      if (window.LLM && window.LLM.enabled()) {
        try {
          const r = await window.LLM.gradeAll(payload);
          return Object.assign({ via: 'llm' }, r);
        } catch (e) {
          // 回退本地综合评分
          return Object.assign({ via: 'local' }, this.gradeAllLocal(payload));
        }
      }
      return Object.assign({ via: 'local' }, this.gradeAllLocal(payload));
    },

    /** 本地综合总评（无大模型时兜底） */
    gradeAllLocal(payload) {
      const objTotal = payload.objTotal || 0;
      const objRight = payload.objRight || 0;
      const essays = Array.isArray(payload.essays) ? payload.essays : [];
      const zoneName = payload.zoneName || '本展厅';

      // 客观题得分
      const objScore = objTotal ? (objRight / objTotal) * 100 : 0;

      // 简答得分：对每道简答按参考答案关键词做粗略覆盖统计（复用本地要点打分思路）
      let essayScore = 0;
      const covered = [];
      const missing = [];
      essays.forEach((e) => {
        const ref = String(e.ref || '');
        const ans = String(e.answer || '').trim();
        // 从参考答案中提取若干关键词作命中依据
        const kws = ref
          .replace(/[①-⑩\d\.、；：（）()]/g, ' ')
          .split(/\s+/)
          .filter((w) => w.length >= 2)
          .slice(0, 6);
        const hit = kws.filter((k) => ans.includes(k)).length;
        const ratio = kws.length ? hit / kws.length : (ans ? 1 : 0);
        essayScore += ratio * 100;
        if (ratio >= 0.6) covered.push(e.q.slice(0, 18) + '……（理解到位）');
        else missing.push(e.q.slice(0, 18) + '……（可再充实）');
      });
      const essayAvg = essays.length ? essayScore / essays.length : 0;

      // 综合：客观题权重 50%，简答权重 50%（无简答时仅按客观题）
      let score;
      if (objTotal && essays.length) score = Math.round(objScore * 0.5 + essayAvg * 0.5);
      else if (objTotal) score = Math.round(objScore);
      else if (essays.length) score = Math.round(essayAvg);
      else score = 0;

      let comment;
      if (score >= 85) comment = `你在「${zoneName}」的整体表现优秀，客观题与简答均体现出扎实的理解，继续保持。`;
      else if (score >= 60) comment = `你在「${zoneName}」表现良好，主体掌握到位，个别要点还可进一步充实。`;
      else if (score >= 35) comment = `你在「${zoneName}」有了一定的思考，但覆盖要点偏少，建议对照参考答案补齐关键角度。`;
      else comment = `建议先认真阅读「${zoneName}」的展板内容与史料，再重新梳理答题思路。`;

      return {
        score,
        comment,
        covered,
        missing,
        suggest: score >= 60 ? '可结合展板史料深化论述，让观点更有史实支撑。' : '先抓核心要点，再补充具体史实与逻辑链条。',
      };
    },

    detectNav(q) {
      const hasGo = data.goWords.some((w) => q.includes(w));
      const z = data.zones.find((z) => q.includes(z.name));
      if (z && (hasGo || /去|看/.test(q))) return z;
      if (/下一站|下一个|继续/.test(q)) return null; // 由调用方处理
      return null;
    },

    nextZone(currentId) {
      const i = data.route.indexOf(currentId);
      if (i < 0) return data.route[0];
      return data.route[(i + 1) % data.route.length];
    },
  };

  window.AI = AI;
})();
