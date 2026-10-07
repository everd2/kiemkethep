// Service worker: lưu giao diện để mở nhanh và mở được khi mất mạng (dữ liệu luôn lấy từ server)
// Đổi số phiên bản CACHE mỗi khi sửa giao diện để máy cũ bỏ bản lưu cũ.
const CACHE = 'kho-thep-v2';
const SHELL = ['/', '/style.css', '/app.js', '/manifest.webmanifest', '/icon-192.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  // ưu tiên bản mới từ mạng, mất mạng thì dùng bản đã lưu; chỉ lưu phản hồi thành công
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then((r) => r || caches.match('/')))
  );
});
