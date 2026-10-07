(function () {
  var KEY = 'loadingShown';
  var DEFAULT = 'index.html';
  var MIN_MS = 450;
  var start = performance.now();
  var bar = document.getElementById('ld-bar');
  var pct = document.getElementById('ld-pct');
  var root = document.getElementById('ld-root');

  var params = new URLSearchParams(location.search);
  var to = params.get('to') || DEFAULT;
  var target = to.split('#')[0].split('?')[0];
  var hash = to.indexOf('#') > -1 ? to.slice(to.indexOf('#')) : '';
  if (!/^[^\/\\:]+\.html$/i.test(target) || /^loader\.html$/i.test(target)) { target = DEFAULT; hash = ''; }

  var shown = 0, goal = 0, done = false, finishing = false;
  function setGoal(p) { goal = Math.max(goal, Math.min(0.95, p)); }
  function render() {
    if (finishing) return;
    shown += (goal - shown) * 0.15;
    bar.style.transform = 'scaleX(' + shown.toFixed(3) + ')';
    pct.textContent = Math.round(shown * 100) + '%';
    if (window.__ldUpdate) window.__ldUpdate(shown);
    if (done && performance.now() - start >= MIN_MS) return finish();
    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);

  function finish() {
    finishing = true;
    bar.style.transition = 'transform 0.2s ease';
    bar.style.transform = 'scaleX(1)';
    pct.textContent = '100%';
    if (window.__ldUpdate) window.__ldUpdate(1);
    try { sessionStorage.setItem(KEY, 'true'); } catch (e) {}
    setTimeout(function () {
      root.style.opacity = '0';
      root.style.transform = 'translateY(-12px)';
      setTimeout(function () { location.replace(target + hash); }, 400);
    }, 200);
  }

  function readWithProgress(res, weight) {
    var total = +res.headers.get('content-length') || 0;
    if (!res.body || !res.body.getReader) return res.text().then(function (t) { setGoal(weight); return t; });
    var reader = res.body.getReader(), received = 0, chunks = [];
    return (function pump() {
      return reader.read().then(function (r) {
        if (r.done) {
          setGoal(weight);
          var all = new Uint8Array(received), off = 0;
          chunks.forEach(function (c) { all.set(c, off); off += c.length; });
          return new TextDecoder('utf-8').decode(all);
        }
        chunks.push(r.value); received += r.value.length;
        var frac = total ? received / total : 1 - 1 / (1 + received / 40000);
        setGoal(weight * frac);
        return pump();
      });
    })();
  }

  function collectAssets(html) {
    var urls = {};
    var re = /(?:src|href)\s*=\s*"([^"]+)"|['"](assets\/[^'"]+)['"]/gi, m;
    while ((m = re.exec(html))) {
      var u = (m[1] || m[2] || '').replace(/&amp;/g, '&');
      if (!u || u.indexOf('{{') > -1 || /^(#|mailto:|tel:|javascript:|data:)/i.test(u)) continue;
      if (/\.html(#|\?|$)/i.test(u) || /loader\.(html|js)$/i.test(u)) continue;
      if (/^https?:/i.test(u) && u.indexOf('fonts.googleapis.com/css') === -1) continue;
      urls[u] = 1;
    }
    return Object.keys(urls);
  }

  function preload(list, base, weight) {
    if (!list.length) { setGoal(base + weight); return Promise.resolve(); }
    var n = 0;
    return Promise.all(list.map(function (u) {
      var p = /\.(png|jpe?g|webp|gif|svg|avif)(\?|$)/i.test(u)
        ? new Promise(function (ok) { var i = new Image(); i.onload = i.onerror = ok; i.src = u; })
        : fetch(u, { mode: /^https?:/i.test(u) ? 'cors' : 'same-origin' }).then(function (r) { return r.text(); }).catch(function () {});
      return p.then(function () { n++; setGoal(base + weight * (n / list.length)); });
    }));
  }

  setGoal(0.04);
  fetch(target, { credentials: 'same-origin' })
    .then(function (res) { return readWithProgress(res, 0.4); })
    .then(function (html) {
      var assets = collectAssets(html).concat(['https://unpkg.com/react@18.3.1/umd/react.production.min.js','https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js']);
      return preload(assets, 0.4, 0.55);
    })
    .catch(function () {})
    .then(function () {
      var fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
      return fontsReady;
    })
    .then(function () { done = true; });
})();
