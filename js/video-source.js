/**
 * 本地视频素材解析
 * 规则：优先使用 data.js 中配置的 file 路径；不存在时自动探测 videos/{展区id}.{扩展名}
 * 支持的扩展名：mp4 / webm / mov / m4v（大小写均可），用户放入任一格式即可被识别
 */
(function () {
  var EXTS = ['mp4', 'webm', 'mov', 'm4v', 'MP4', 'WebM', 'MOV', 'M4V'];
  var cache = {};

  // file:// 协议下无法发起请求，直接沿用配置路径
  function isFileProtocol() {
    return typeof location !== 'undefined' && location.protocol === 'file:';
  }

  function head(url) {
    return fetch(url, { method: 'HEAD' }).then(function (r) {
      if (!r.ok) throw new Error('miss');
      var t = (r.headers.get('content-type') || '').toLowerCase();
      // 静态服务器对缺失文件可能返回 200 + HTML 兜底页
      if (t.indexOf('text/html') >= 0) throw new Error('html');
      return url;
    });
  }

  /**
   * @param {string} id 展区 id（jgs / yanan / xbp / hqq / xsd 等）
   * @param {string} [preferred] data.js 中配置的 file 路径
   * @returns {Promise<string|null>} 可用的本地视频地址，无则返回 null
   */
  function resolve(id, preferred) {
    var key = id + '|' + (preferred || '');
    if (cache[key] !== undefined) return Promise.resolve(cache[key]);
    if (isFileProtocol()) {
      cache[key] = preferred || null;
      return Promise.resolve(cache[key]);
    }
    var list = [];
    if (preferred) list.push(preferred);
    EXTS.forEach(function (e) {
      var u = 'videos/' + id + '.' + e;
      if (list.indexOf(u) < 0) list.push(u);
    });
    // 并行探测全部候选，按优先顺序取第一个命中（一次网络往返，避免串行等待）
    return Promise.all(
      list.map(function (u) {
        return head(u).then(
          function () { return u; },
          function () { return null; }
        );
      })
    ).then(function (results) {
      var hit = null;
      for (var i = 0; i < results.length; i++) {
        if (results[i]) { hit = results[i]; break; }
      }
      cache[key] = hit;
      return hit;
    });
  }
  window.LocalVideo = { resolve: resolve, EXTS: EXTS };
})();
