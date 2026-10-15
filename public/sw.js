// Service worker: lưu giao diện để mở nhanh và mở được khi mất mạng (dữ liệu luôn lấy từ server).
// Chiến lược "mạng trước": bản mới luôn được lấy và ghi lại vào cache sau mỗi lần mở có mạng,
// nên KHÔNG cần đổi số phiên bản mỗi lần sửa giao diện. Chỉ đổi khi muốn xoá sạch cache cũ.
/* v6: bản 1.3 đổi giao thức báo cáo (gửi đủ mọi phi, ô để trống là 0). Bản app cũ còn trong cache
   sẽ gửi thiếu phi và bị server từ chối (need_all), nên phải xoá sạch cache cũ ở lần cài này. */
const CACHE = 'kho-thep-v38';
const CHO_MS = 4000; // chờ mạng tối đa bấy lâu rồi dùng bản đã lưu (xem fetch bên dưới)
const SHELL = ['/', '/style.css', '/app.js', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/icon-maskable-512.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  /* Ưu tiên bản mới từ mạng, mất mạng thì dùng bản đã lưu; chỉ lưu phản hồi thành công.
     Mạng có HẠN CHỜ: sóng yếu ngoài bãi (còn vạch nhưng gói tin không đi) thì fetch không báo lỗi mà treo, app mở lên
     trắng màn hình cả phút dù bản đã lưu nằm sẵn trong máy. Quá CHO_MS mà mạng chưa trả thì đưa bản đã lưu ra dùng;
     lần tải vẫn chạy tiếp ở nền và ghi vào cache, lần mở sau là bản mới. */
  const mang = fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  });
  e.waitUntil(mang.catch(() => {}));
  const het = new Promise((r) => setTimeout(() => r(null), CHO_MS));
  e.respondWith(
    caches.match(req).then((cu) => (cu ? Promise.race([mang, het]).then((res) => res || cu) : mang))
      .catch(() => caches.match(req).then((r) => r || caches.match('/')))
  );
});
