// ===== Danang Trip Service Worker =====
// V1 - 캐시 문제 방지 / GitHub Pages / iPhone Safari 대응
//
// 중요:
// 외부 API, Leaflet, OpenStreetMap, Bootstrap, Google Fonts 등은
// Service Worker가 가로채지 않습니다.
// 따라서 실시간 환율/날씨와 지도 CDN 요청이 정상적으로 네트워크로 전달됩니다.

self.addEventListener('install', (event) => {
  // 새 Service Worker를 즉시 설치 단계에서 활성화 대상으로 만듭니다.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // 기존 페이지를 새 Service Worker가 즉시 제어
      self.clients.claim(),

      // 이전 버전에서 만들어진 캐시가 있다면 모두 삭제
      caches.keys().then((keys) =>
        Promise.all(keys.map((key) => caches.delete(key)))
      ),
    ])
  );
});

// app.js에서 새 버전을 즉시 적용할 수 있도록 지원
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// V1에서는 fetch를 가로채지 않습니다.
// 즉,
// - GitHub Pages 파일
// - Open-Meteo
// - Exchange API
// - Leaflet
// - OpenStreetMap
// - Bootstrap
// - Google Fonts
// 모두 브라우저의 일반 네트워크 요청으로 처리됩니다.
//
// 이 방식이 현재 Danang Trip 프로젝트에서
// "GitHub에 Push했는데 아이폰에서 예전 버전이 보이는 문제"와
// "환율/날씨/지도가 캐시 때문에 안 나오는 문제"를 피하는 데 가장 안전합니다.
