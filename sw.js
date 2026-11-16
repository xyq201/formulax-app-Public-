/* FormulaX sw.js — v10.24 跨域放行版
 * v10.21 版的问题：fetch 拦截对页面发出的所有 GET（包括跨域的主机同步
 * http://192.168.x.x:5002、AI 接口等）都做了 respondWith，而 SW 内部
 * 再发内网 http 请求会被安全层处理失败，导致主机同步报 HTTP 503。
 * 修复原则：SW 只管本站资源的离线兜底，跨域请求一律放行（不拦截、不缓存），
 * 交给浏览器原生网络栈 —— 主机同步、AI 接口等行为与"无 SW"时完全一致。
 */
var CACHE_NAME = 'formulax-v1024';

self.addEventListener('install', function (event) {
  // 不预缓存任何东西，安装即生效
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(
        names.filter(function (n) { return n !== CACHE_NAME; })
             .map(function (n) { return caches.delete(n); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  // ★ 关键修复：跨域请求一律放行，绝不 respondWith
  //   （主机同步 http://192.168.x.x、AI 接口等不经过 SW）
  try {
    if (new URL(req.url).origin !== self.location.origin) return;
  } catch (e) { return; }

  // 以下只处理本站请求
  var accept = '';
  try { accept = req.headers.get('Accept') || ''; } catch (e2) {}
  var isNavigate = req.mode === 'navigate' || accept.indexOf('text/html') !== -1;

  if (isNavigate) {
    // 页面导航：网络优先，绝不拿缓存挡在前面；只有断网才回退缓存首页
    event.respondWith(
      fetch(req).then(function (resp) {
        if (resp && resp.status === 200) {
          var cl = resp.clone();
          caches.open(CACHE_NAME).then(function (c) { c.put('./index.html', cl); });
        }
        return resp;
      }).catch(function () { return caches.match('./index.html'); })
    );
    return;
  }

  // 其它本站 GET 资源：网络优先，失败回缓存（断网时图标等仍可用）
  event.respondWith(
    fetch(req).then(function (resp) {
      if (resp && resp.status === 200) {
        var cl = resp.clone();
        caches.open(CACHE_NAME).then(function (c) { c.put(req, cl); });
      }
      return resp;
    }).catch(function () { return caches.match(req); })
  );
});
