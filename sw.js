const CACHE_NAME = 'danang-trip-v3';

const ASSETS = [
  './index.html',
  './pages/florence.html',
  './pages/belmarina.html',
  './pages/hyatt.html',
  './pages/altara.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // API는 항상 네트워크 우선
  if (
    url.includes('open.er-api.com') ||
    url.includes('open-meteo.com')
  ) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response('{}', {
          headers: {
            'Content-Type': 'application/json',
          },
        })
      )
    );
    return;
  }

  // 페이지 및 리소스는 Network First
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const responseClone = response.clone();

        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone);
        });

        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
