// MealMood service worker.
// 策略:页面导航网络优先(部署新版后立刻能看到),hash 资源缓存优先,其余 SWR。
const CACHE_NAME = 'mealmood-v0-2-0';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(['./'])));
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

const putInCache = async (request, response) => {
  const cache = await caches.open(CACHE_NAME);
  cache.put(request, response);
};

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || !request.url.startsWith(self.location.origin)) return;

  // 页面导航:网络优先,断网才退回缓存。
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          putInCache(request, response.clone());
          return response;
        })
        .catch(async () => (await caches.match(request)) ?? caches.match('./'))
    );
    return;
  }

  // Vite 构建产物带内容 hash,内容永不变:缓存优先。
  if (request.url.includes('/assets/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            putInCache(request, response.clone());
            return response;
          })
      )
    );
    return;
  }

  // 其余静态资源:先用缓存,后台悄悄更新。
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          putInCache(request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached ?? network;
    })
  );
});
