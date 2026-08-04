// ===== Danang Trip Service Worker =====

const CACHE_NAME = 'danang-trip';
const OFFLINE_FILES = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// 설치
self.addEventListener('install', (event) => {
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(OFFLINE_FILES))
  );
});

// 활성화
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {

    // 기존 캐시 삭제
    const keys = await caches.keys();

    await Promise.all(
      keys
        .filter(key => key !== CACHE_NAME)
        .map(key => caches.delete(key))
    );

    await self.clients.claim();

  })());
});

// 즉시 활성화
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Fetch
self.addEventListener('fetch', (event) => {

  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // API는 항상 최신
  if (
    url.hostname.includes('open.er-api.com') ||
    url.hostname.includes('open-meteo.com')
  ) {

    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match(event.request)
      )
    );

    return;
  }

  // HTML은 항상 최신
  if (event.request.mode === 'navigate') {

    event.respondWith(

      fetch(event.request)
        .then(response => {

          const copy = response.clone();

          caches.open(CACHE_NAME)
            .then(cache => cache.put(event.request, copy));

          return response;

        })
        .catch(() => caches.match('./index.html'))

    );

    return;
  }

  // CSS / JS / 이미지
  event.respondWith(

    fetch(event.request)

      .then(response => {

        const copy = response.clone();

        caches.open(CACHE_NAME)
          .then(cache => cache.put(event.request, copy));

        return response;

      })

      .catch(() => caches.match(event.request))

  );

});
