const CACHE_NAME = 'formulax-v1';

// 需要预缓存的核心文件
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
];

// 安装：预缓存核心文件
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] 预缓存核心文件');
      return cache.addAll(PRECACHE_URLS);
    })
  );
  // 立即激活，不等待旧 SW
  self.skipWaiting();
});

// 激活：清理旧缓存
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

// 请求拦截：缓存优先，网络回退
self.addEventListener('fetch', (event) => {
  // 跳过非 GET 请求
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      // 有缓存直接返回
      if (cached) return cached;

      // 无缓存则请求网络，并缓存副本
      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200) return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, clone);
        });
        return response;
      }).catch(() => {
        // 网络失败，返回离线页面（对于 HTML 请求返回首页）
        if (event.request.headers.get('Accept')?.includes('text/html')) {
          return caches.match('./index.html');
        }
        return new Response('离线状态，请联网后重试', { status: 503 });
      });
    })
  );
});
