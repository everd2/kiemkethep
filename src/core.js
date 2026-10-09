// Tiện ích dùng chung không phụ thuộc gì: lỗi HTTP, băm, giờ Việt Nam, hằng số ngưỡng, phi mặc định.

export class HttpError extends Error {
  constructor(status, msg, code) { super(msg); this.status = status; this.code = code; }
}
export const bad = (m) => new HttpError(400, m);

export const enc = new TextEncoder();
export const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
export const rand = (n = 32) => toHex(crypto.getRandomValues(new Uint8Array(n)));

export async function sha256(s) {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}
export async function hmac(key, msg) {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toHex(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
}
export function safeEq(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
// PIN chỉ có 4 số nên băm kèm "PEPPER" (bí mật lưu ngoài database): lộ database cũng không dò được PIN
export const hashPin = (env, salt, pin) => hmac(env.PEPPER, salt + ':' + pin);

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });

export const vnDay = (ms = Date.now()) => new Date(ms + 7 * 3600e3).toISOString().slice(0, 10); // giờ Việt Nam
export const vnHour = (ms = Date.now()) => ((ms + 7 * 3600e3) % 86400e3) / 3600e3; // giờ Việt Nam, có phần lẻ

export const fmtDay = (d) => String(d).split('-').reverse().join('/');
export const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400e3);
export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const KINDS = ['dem', 'giu', 'zero'];
export const ROLES = ['admin', 'thukho', 'nguoidem'];
export const SESSION_MS = 30 * 24 * 3600e3;
export const LOCK_AFTER = 5;
export const LOCK_STEPS = [15 * 60e3, 60 * 60e3, 24 * 3600e3]; // sai nhiều đợt liên tiếp thì khóa lâu dần
// số lần sai PIN tối đa mỗi ngày từ một địa chỉ IP; cả bãi dùng chung Wi-Fi/4G (chung IP) nên để cao,
// việc chặn dò PIN từng tài khoản đã do LOCK_AFTER/LOCK_STEPS đảm nhận
export const IP_FAIL_MAX = 300;
export const SYSTEM = { id: 0, name: 'Hệ thống' };
/* Ngưỡng cảnh báo tính theo KHỐI LƯỢNG, không theo số "cây": 10 cây D10 là 72 kg còn 10 phần D6 là 200 kg,
   nên một mốc đếm chung sẽ nhạy khác nhau cả chục lần giữa các phi. */
export const HIGH_KG = 500;  // "dùng nhiều bất thường" chỉ xét khi lượng dùng vượt 500 kg
export const NEG_KG = 100;   // "dùng âm" dưới 100 kg coi là sai số đếm, không báo động
export const RATE_K = 3;     // và phải gấp 3 lần mức dùng trung bình mỗi ngày
export const PEAK_K = 1.5;   // và hơn 1,5 lần ngày dùng nhiều nhất từng ghi nhận (phi dùng thưa không bị báo oan)
export const MIN_RATE_DAYS = 5; // dưới 5 ngày dữ liệu thì chưa dự báo "còn đủ dùng bao lâu"
/* Soi riêng từng khu (xem computeReview). Ba mốc này CHỈ để tô đậm dòng lệch cho người duyệt
   dễ thấy; chúng KHÔNG quyết định khu có được duyệt hay không. Mọi khu đã báo đều duyệt được,
   lệch hay không lệch, vì người duyệt mới là người quyết định — màn Duyệt chỉ có việc bày số ra. */
export const KHU_UP_KG = 100;    // đếm dư quá 100 kg thì tô đậm
export const KHU_DOWN_KG = 300;  // hụt quá 300 kg
export const KHU_DOWN_PCT = 0.5; // và quá nửa số dự kiến thì tô đậm

/* ========================= DỮ LIỆU MẶC ĐỊNH PHI =========================
   Thông số chuẩn; admin sửa riêng trong Cài đặt. INSERT OR IGNORE không ghi đè số admin đã sửa.
   - Thép cây: kg/cây 11,7 m theo TCVN 1651-2 (0,00617 × D²), giống nhau giữa các nhà máy.
     Cây/bó theo bó nhà máy Hòa Phát (~3,2–3,3 tấn/bó); bó Việt Ý hoặc bó tách ở bãi thì sửa riêng.
   - Thép cuộn: 1 cuộn lưu thành `bo` phần (100 phần = 1 cuộn), kg = kg mỗi phần.
     Cuộn Hòa Phát / Việt Ý ~2.000 kg → 20 kg/phần.
   - min: mức báo động (đơn vị lưu: cây hoặc phần cuộn) = 1 bó, ½ bó với phi lớn, 2 cuộn với D6/D8. */
export const PHI_DEFAULTS = [
  { id: 'D6',  sort: 0,  kg: 20,    bo: 100, min: 200, unit: 'cuon' },
  { id: 'D8',  sort: 1,  kg: 20,    bo: 100, min: 200, unit: 'cuon' },
  { id: 'D10', sort: 2,  kg: 7.22,  bo: 440, min: 440, unit: 'cay'  },
  { id: 'D12', sort: 3,  kg: 10.40, bo: 320, min: 320, unit: 'cay'  },
  { id: 'D14', sort: 4,  kg: 14.15, bo: 222, min: 222, unit: 'cay'  },
  { id: 'D16', sort: 5,  kg: 18.48, bo: 180, min: 180, unit: 'cay'  },
  { id: 'D18', sort: 6,  kg: 23.39, bo: 138, min: 138, unit: 'cay'  },
  { id: 'D20', sort: 7,  kg: 28.88, bo: 114, min: 114, unit: 'cay'  },
  { id: 'D22', sort: 8,  kg: 34.94, bo: 90,  min: 90,  unit: 'cay'  },
  { id: 'D25', sort: 9,  kg: 45.11, bo: 72,  min: 36,  unit: 'cay'  },
  { id: 'D28', sort: 10, kg: 56.60, bo: 57,  min: 29,  unit: 'cay'  },
  { id: 'D32', sort: 11, kg: 73.92, bo: 45,  min: 23,  unit: 'cay'  },
  { id: 'D36', sort: 12, kg: 93.55, bo: 35,  min: 18,  unit: 'cay'  },
];
export function seedPhi(env) {
  return env.DB.batch(PHI_DEFAULTS.map((p) =>
    env.DB.prepare('INSERT OR IGNORE INTO phi (id, sort, kg_per_cay, bo_size, min_stock, unit) VALUES (?,?,?,?,?,?)')
      .bind(p.id, p.sort, p.kg, p.bo, p.min, p.unit)
  ));
}
