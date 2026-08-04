// ---- 서비스 워커 등록 (PWA) ----
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    const inPages = location.pathname.includes('/pages/');
    const swUrl = inPages ? '../sw.js' : 'sw.js';
    const swScope = inPages ? '../' : './';

    try {
      const registration = await navigator.serviceWorker.register(swUrl, {
        scope: swScope,
        updateViaCache: 'none'
      });

      // 항상 최신 Service Worker 확인
      registration.update();

      // 새 버전이 설치되면 즉시 활성화
      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }

      // 페이지를 새 SW로 자동 새로고침
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
      });

    } catch (e) {
      console.error('Service Worker 등록 실패', e);
    }
  });
}
