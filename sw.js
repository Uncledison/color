// Service Worker — 이 사이트는 SW로 캐시하지 않는다(network-only).
//
// 예전에 캐시를 썼다면 배포 후에도 옛 index.html/도안 페이지가 남아
// '/p/<id>' 새 페이지가 안 보이는 문제가 생긴다. 그래서:
// - install/activate에서 즉시 새 SW로 교체하고(clients.claim) 예전 캐시를 모두 지운다.
// - 주소 이동(navigate, 예: '/', '/p/<id>')은 항상 네트워크에서 새로 받는다.
// - 그 밖의 GET(이미지·data.json 등)도 그대로 네트워크로 보낸다.
// 즉 이 파일은 '설치된 SW가 오래된 화면을 물고 있지 않게' 하는 역할만 한다.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (err) { /* Cache API 없는 환경은 그냥 넘어간다 */ }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return; // POST 등은 브라우저 기본 동작

  if (req.mode === 'navigate') {
    // 페이지 이동은 캐시를 절대 쓰지 않는다 — 새 배포(/p/<id> 페이지 포함)가 바로 보이도록
    e.respondWith(fetch(req, { cache: 'no-store' }));
    return;
  }
  e.respondWith(fetch(req));
});
