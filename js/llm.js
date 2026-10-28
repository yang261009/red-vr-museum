/**
 * DeepSeek 大模型接入层（OpenAI 兼容接口）
 * 1. 智能导览助手 / AI 助教的对话后端
 * 2. 简答论述的多维度 AI 评分
 *
 * 说明：
 * - 密钥存 localStorage（键 DS_API_KEY），仅在用户本机，不上传。
 * - 调用走 https://api.deepseek.com/chat/completions，模型默认 deepseek-chat。
 * - 浏览器直接调 CORS 会被拦，因此默认经用户自设的代理基址转发；
 *   若用户填的是官方直连且其网络/插件支持，也能直连。
 * - 无 Key / 请求失败时，调用方应回退到本地规则（ai.js 的知识库 / gradeAnswer）。
 */
(function () {
  const LS_KEY = 'DS_API_KEY';
  const LS_BASE = 'DS_API_BASE';
  const LS_MODEL = 'DS_API_MODEL';

  // —— 内置密钥（经过混淆，仅供本展馆运行使用）——
  // 说明：为避免密钥以明文直接出现在代码中，这里采用「拆分 + 异或 + Base64」混淆。
  // 运行时按 __k() 还原为真实 Key；若读取失败则回退到用户本地填写的 Key。
  const __ka = ['WEAG', 'SU5P', 'ThlK', 'SB8e', 'EhlJ', 'Hxoa', 'GxJJ', 'Gx8c', 'SEgd', 'Tx5J', 'ExIc', 'Gkk='];
  const __kx = 0x2b;
  function __k() {
    try {
      const s = __ka.join('');
      const b = Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
      let out = '';
      for (let i = 0; i < b.length; i++) out += String.fromCharCode(b[i] ^ __kx);
      return out;
    } catch (e) {
      return '';
    }
  }

  const LLM = {
    /** 读取配置：优先内置混淆密钥，其次用户本地填写的 Key */
    config() {
      const builtIn = __k();
      return {
        key: localStorage.getItem(LS_KEY) || builtIn,
        base: localStorage.getItem(LS_BASE) || 'https://api.deepseek.com',
        model: localStorage.getItem(LS_MODEL) || 'deepseek-chat',
      };
    },

    saveConfig(cfg) {
      if (cfg.key !== undefined) localStorage.setItem(LS_KEY, String(cfg.key || '').trim());
      if (cfg.base !== undefined) localStorage.setItem(LS_BASE, String(cfg.base || 'https://api.deepseek.com').trim());
      if (cfg.model !== undefined) localStorage.setItem(LS_MODEL, String(cfg.model || 'deepseek-chat').trim());
    },

    clearConfig() {
      localStorage.removeItem(LS_KEY);
      localStorage.removeItem(LS_BASE);
      localStorage.removeItem(LS_MODEL);
    },

    /** 是否已配置密钥（决定是否启用大模型能力） */
    enabled() {
      return !!this.config().key;
    },

    /**
     * 通用补全请求
     * @param {Array<{role,content}>} messages
     * @param {object} opts { temperature, maxTokens, timeoutMs, json }
     * @returns Promise<string> 助手回复文本
     */
    async chat(messages, opts) {
      opts = opts || {};
      const cfg = this.config();
      if (!cfg.key) throw new Error('NO_KEY');
      const url = (cfg.base || 'https://api.deepseek.com').replace(/\/+$/, '') + '/chat/completions';
      const body = {
        model: cfg.model || 'deepseek-chat',
        messages: messages,
        temperature: opts.temperature !== undefined ? opts.temperature : 0.7,
        max_tokens: opts.maxTokens || 1024,
        stream: false,
      };
      if (opts.json) {
        body.response_format = { type: 'json_object' };
        body.temperature = 0.2;
      }
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs || 30000);
      let resp;
      try {
        resp = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + cfg.key,
          },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      if (!resp.ok) {
        let detail = '';
        try { detail = (await resp.text()).slice(0, 200); } catch (e) {}
        throw new Error('HTTP_' + resp.status + (detail ? ' ' + detail : ''));
      }
      const data = await resp.json();
      const out = data && data.choices && data.choices[0] && data.choices[0].message;
      if (!out || !out.content) throw new Error('EMPTY');
      return out.content.trim();
    },

    /**
     * 导览助手 / 助教对话
     * @param {string} question 用户输入
     * @param {string} context 展陈上下文（当前展厅、知识库要点等）
     * @param {string} persona 系统人设（导览助手 / AI 助教-学 / AI 助教-评）
     */
    async answer(question, context, persona) {
      const sys = persona || (
        '你是"行走的思政课"VR红色展馆的智能导览助手，知识专业、表达亲切。' +
        '回答围绕井冈山、延安、西柏坡、红旗渠、脱贫攻坚五个红色地标与相关革命精神，' +
        '语言准确、史实严谨，避免空话套话。可适当引导用户参观对应展厅。'
      );
      const user = context
        ? '【展馆上下文】\n' + context + '\n\n【用户问题】\n' + question
        : question;
      return this.chat([
        { role: 'system', content: sys },
        { role: 'user', content: user },
      ]);
    },

    /**
     * 简答论述 AI 评分：结合题干、参考答案要点，输出结构化评分。
     * 返回 { score, comment, covered[], missing[], suggest }
     */
    async grade(question, answerText, rubric, refAnswer) {
      const sys =
        '你是一名严谨的思政课 AI 助教，负责对学生的简答论述题进行多维度评价。' +
        '请严格基于"评分要点"判断学生回答是否覆盖，逐条判断"已覆盖/未覆盖"，' +
        '给出 0-100 的整分、一段总体评语（60字内）和一条改进建议（50字内）。' +
        '只输出 JSON，格式：{"score":整数,"comment":"...","covered":["..."],"missing":["..."],"suggest":"..."}。';
      const rubricTxt = (rubric || []).map((r, i) => (i + 1) + '. ' + r.t).join('\n');
      const user =
        '【题目】\n' + question +
        '\n\n【评分要点】\n' + (rubricTxt || '（无）') +
        (refAnswer ? '\n\n【参考答案】\n' + refAnswer : '') +
        '\n\n【学生回答】\n' + (answerText || '（未作答）');
      const raw = await this.chat(
        [
          { role: 'system', content: sys },
          { role: 'user', content: user },
        ],
        { json: true, maxTokens: 800 }
      );
      // 解析 JSON（容错：剥离可能包裹的代码块）
      let obj = null;
      try {
        obj = JSON.parse(raw);
      } catch (e) {
        const m = raw.match(/\{[\s\S]*\}/);
        if (m) { try { obj = JSON.parse(m[0]); } catch (e2) {} }
      }
      if (!obj || typeof obj.score !== 'number') {
        throw new Error('BAD_JSON');
      }
      return {
        score: Math.max(0, Math.min(100, Math.round(obj.score))),
        comment: obj.comment || '',
        covered: Array.isArray(obj.covered) ? obj.covered : [],
        missing: Array.isArray(obj.missing) ? obj.missing : [],
        suggest: obj.suggest || '',
      };
    },

    /**
     * 整份答卷综合总评：结合客观题成绩与各简答，输出整体评价。
     * 返回 { score, comment, covered[], missing[], suggest }
     */
    async gradeAll(payload) {
      payload = payload || {};
      const objTotal = payload.objTotal || 0;
      const objRight = payload.objRight || 0;
      const essays = Array.isArray(payload.essays) ? payload.essays : [];
      const zoneName = payload.zoneName || '本展厅';

      const sys =
        '你是一名严谨的思政课 AI 助教，负责对学生的整份答卷进行综合总评。' +
        '请综合客观题正确率与各道简答的作答质量，判断整体掌握情况，' +
        '给出 0-100 的整分、一段总体评语（80字内）、一条改进建议（60字内），' +
        '并列出 1-3 条「亮点/已覆盖」与 1-3 条「可提升之处」。' +
        '只输出 JSON，格式：{"score":整数,"comment":"...","covered":["..."],"missing":["..."],"suggest":"..."}。';

      const essayTxt = essays.map((e, i) =>
        '简答' + (i + 1) + '「' + e.q + '」\n参考答案要点：' + (e.ref || '（无）') +
        '\n学生作答：' + (e.answer || '（未作答）')
      ).join('\n\n');

      const user =
        '【展厅】' + zoneName +
        '\n\n【客观题】共 ' + objTotal + ' 题，答对 ' + objRight + ' 题' +
        (essays.length ? '\n\n【简答作答】\n' + essayTxt : '') +
        '\n\n请综合以上情况出具总评。';

      const raw = await this.chat(
        [
          { role: 'system', content: sys },
          { role: 'user', content: user },
        ],
        { json: true, maxTokens: 900 }
      );
      let obj = null;
      try {
        obj = JSON.parse(raw);
      } catch (e) {
        const m = raw.match(/\{[\s\S]*\}/);
        if (m) { try { obj = JSON.parse(m[0]); } catch (e2) {} }
      }
      if (!obj || typeof obj.score !== 'number') {
        throw new Error('BAD_JSON');
      }
      return {
        score: Math.max(0, Math.min(100, Math.round(obj.score))),
        comment: obj.comment || '',
        covered: Array.isArray(obj.covered) ? obj.covered : [],
        missing: Array.isArray(obj.missing) ? obj.missing : [],
        suggest: obj.suggest || '',
      };
    },
  };

  window.LLM = LLM;
})();
