// 오프라인용 서비스 워커: 앱 파일은 캐시하고, 워커(노션) 요청은 건드리지 않아요.
const CACHE = 'geumi-log-v3';
const SHELL = ['./', 'index.html', 'css/style.css', 'js/app.js', 'js/db.js', 'js/pixel.js', 'data/caresheet.enc.json',
  'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const sameOrigin = url.origin === location.origin;
  const font = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!sameOrigin && !font) return;
  // 앱 파일: 네트워크 우선, 안 되면 캐시 / 폰트: 캐시 우선
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (font) {
      const hit = await cache.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    }
    try {
      const res = await fetch(e.request);
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    } catch {
      return (await cache.match(e.request)) || (await cache.match('index.html'));
    }
  })());
});
