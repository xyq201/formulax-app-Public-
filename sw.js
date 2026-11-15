/* FormulaX sw.js — v10.21 安全版
 * 旧版问题（已修）：cache-first + 预缓存 index.html + 固定缓存名 formulax-v1，
 * 导致 UC 上永远加载第一次访问时的旧版 index.html，任何代码更新都不生效。
 * 新版原则：HTML / 页面导航一律 network-first（断网才用缓存兜底），
 * 其它静态资源网络优先、失败回缓存。换版时旧缓存整体清除。
 */
const CACHE_NAME = 'formulax-v1021';

// 不预缓存 index.html —— 页面必须永远以网络为准，缓存只做断网兜底

self.addEventListener('install', (event) => {
  // 不做任何预缓存，安装即生效
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const accept = event.request.headers.get('Accept') || '';
  const isNavigate = event.request.mode === 'navigate' || accept.indexOf('text/html') !== -1;

  if (isNavigate) {
    // 页面导航：网络优先，绝不拿缓存挡在前面；只有断网才回退缓存首页
    event.respondWith(
      fetch(event.request).then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((c) => c.put('./index.html', clone));
        }
        return response;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // 其它 GET 资源：网络优先，失败回缓存（断网时图标等仍可用）
  event.respondWith(
    fetch(event.request).then((response) => {
      if (response && response.status === 200) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
      }
      return response;
    }).catch(() => caches.match(event.request))
  );
});
