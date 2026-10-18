/* Service worker CitySim 3D: полный офлайн-кэш сборки. Версия и список файлов подставляются при сборке (vite.config.ts).
 * Новая версия устанавливается в фоне и ждёт: игра сама предлагает «Обновить», после чего вызывает skipWaiting. */
const VERSION = '__VERSION__';
const CACHE = 'citysim-' + VERSION;
const ASSETS = __ASSETS__;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(ASSETS.map((u) => c.add(new Request(u, { cache: 'reload' }))))));
});

self.addEventListener('message', (e) => {
  if (e.data === 'skip') self.skipWaiting();
  if (e.data === 'version') e.source && e.source.postMessage({ type: 'version', version: VERSION });
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('citysim-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(
      (hit) =>
        hit ||
        fetch(req)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())),
    ),
  );
});
