// Báo cáo sản lượng gửi cấp trên: quân số đã báo của các tổ + số công gia công thép + hai tỷ lệ => sản lượng.
import { HttpError, bad, json, vnDay } from './core.js';
import { auditStmt, batchGuarded, bump, guardStmt, readJson } from './helpers.js';
import { QS_TONG_MAX, TO_SX } from './quanso.js';

/* ========================= BÁO CÁO SẢN LƯỢNG =========================
   Cùng khuôn với báo cáo ca (src/baocao.js): CVKTHT trở lên soạn, phần đầu (đơn vị, chỉ huy, dự án, khu vực) dùng CHUNG
   mẫu bc_mau với báo cáo ca, nên sửa ở đâu cũng được và hai báo cáo luôn khớp. Khác ở chỗ: tính theo NGÀY (cả ca ngày và ca đêm),
   mặc định là hôm qua, và mục quân số thay phần nghỉ / lý do nghỉ bằng "công gia công thép".
   - QUÂN SỐ: lấy nguyên số tổ đã báo (quan_so), tổ không báo thì số thiết lập đã chép lúc hết ca (quan_so_tl). Không có phần nghỉ.
   - CÔNG GIA CÔNG THÉP: số công của tổ ở từng ca làm gia công thép. Mặc định = số ĐI LÀM đã báo của ca đó; CVKTHT trở lên sửa
     được từng tổ, từng ca. Chỉ lưu những ô đã sửa (data.cong), ô nào không sửa thì luôn theo số báo mới nhất.
   - SẢN LƯỢNG (kg) = (công × 158 kg × tỷ lệ gia công) ÷ tỷ lệ giá, làm tròn kg. 158 kg/công là công chuẩn.
       tỷ lệ giá 0,2 – 1, mặc định 0,2; tỷ lệ gia công 0,5 – 1, mặc định ngẫu nhiên 0,70 – 0,80.
     Mặc định ngẫu nhiên được suy từ chính ngày báo cáo (cùng ngày luôn ra cùng số), nên mở lại hay tải lại không đổi; người soạn
     sửa thì lưu số đã sửa.
   Server GOM SỐ và LƯU; việc ghép chữ nằm ở máy khách (app.js, slTao), như báo cáo ca. */
export const CONG_CHUAN_KG = 158;
export const SL_GIA = { min: 0.2, max: 1, mac_dinh: 0.2 };
export const SL_GC = { min: 0.5, max: 1 };
const SL_SUA_NGAY = 31;

// mặc định tỷ lệ gia công của một ngày: 0,70 – 0,80, cố định theo ngày
export function glMacDinh(ngay) {
  let h = 0;
  for (const c of String(ngay)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (70 + (h % 11)) / 100;
}
export const sanLuongKg = (cong, gia, gc) => Math.round((cong * CONG_CHUAN_KG * gc) / gia);

const docJ = (s) => { try { const o = JSON.parse(s || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch (e) { return {}; } };
const lam2 = (x) => Math.round(Number(x) * 100) / 100;
function docNgay(v) {
  const ngay = String(v == null || v === '' ? vnDay(Date.now() - 864e5) : v);
  const t = Date.parse(ngay + 'T00:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ngay) || !Number.isFinite(t) || vnDay(t) !== ngay) throw bad('Ngày không hợp lệ');
  if (ngay > vnDay()) throw bad('Chưa tới ngày này');
  return ngay;
}
// công đã sửa: { "<id tổ>": { "1": n, "2": n } }, chỉ nhận số nguyên 0..QS_TONG_MAX
function docCong(v) {
  const o = v && typeof v === 'object' && !Array.isArray(v) ? v : {}, out = {};
  for (const [uid, ca] of Object.entries(o).slice(0, 300)) {
    if (!/^\d+$/.test(uid) || !ca || typeof ca !== 'object') continue;
    for (const c of ['1', '2']) {
      if (ca[c] === undefined || ca[c] === null || ca[c] === '') continue;
      const n = Number(ca[c]);
      if (!Number.isInteger(n) || n < 0 || n > QS_TONG_MAX) throw bad('Số công gia công thép không hợp lệ (0 – ' + QS_TONG_MAX + ')');
      (out[uid] = out[uid] || {})[c] = n;
    }
  }
  return out;
}

/* Số liệu cho một ngày: mỗi tổ hai ca (tong / lam / nguồn), phần đã lưu (nếu có), mặc định, và phần đầu của mẫu dùng chung. */
export async function slView(env, url) {
  const ngay = docNgay(url.searchParams.get('ngay'));
  const [tdt, qs, tl, mau, bc] = await env.DB.batch([
    env.DB.prepare(`SELECT u.id, u.name FROM users u WHERE u.role = 'tieudoi' AND (u.deleted = 0 OR EXISTS (SELECT 1 FROM quan_so q WHERE q.user_id = u.id AND q.ngay = ?1)) ORDER BY ${TO_SX}`).bind(ngay),
    env.DB.prepare('SELECT ca, user_id, tong, lam FROM quan_so WHERE ngay = ?').bind(ngay),
    env.DB.prepare('SELECT ca, user_id, tong, lam FROM quan_so_tl WHERE ngay = ?').bind(ngay),
    env.DB.prepare('SELECT data FROM bc_mau WHERE id = 1'),
    env.DB.prepare(`SELECT s.data, s.ts, s.by_id, COALESCE(u.name, '(đã xoá)') by_name FROM san_luong s LEFT JOIN users u ON u.id = s.by_id WHERE s.ngay = ?`).bind(ngay),
  ]);
  const bao = new Map(qs.results.map((r) => [r.user_id + ':' + r.ca, r])), chep = new Map(tl.results.map((r) => [r.user_id + ':' + r.ca, r]));
  const to = tdt.results.map((u) => {
    const ca = {};
    for (const c of [1, 2]) {
      const b = bao.get(u.id + ':' + c), t = chep.get(u.id + ':' + c);
      // dòng tổ báo luôn hơn số thiết lập đã chép; tổ không làm ca đó thì không có dòng nào (null)
      ca[c] = b ? { tong: b.tong, lam: b.lam, nguon: 'bao' } : t && t.lam != null ? { tong: t.tong, lam: t.lam, nguon: 'tl' } : null;
    }
    return { id: u.id, name: u.name, ca };
  });
  const r = bc.results[0], d = r ? docJ(r.data) : {}, m = docJ(mau.results[0] && mau.results[0].data), dau = m.dau && typeof m.dau === 'object' ? m.dau : {};
  const gc0 = glMacDinh(ngay);
  return json({
    ngay, to, chuan: CONG_CHUAN_KG, gia_lim: SL_GIA, gc_lim: SL_GC,
    mac_dinh: { gia: SL_GIA.mac_dinh, gc: gc0 },
    dau: Object.fromEntries(['don_vi', 'ddt', 'tdtr', 'cbpt', 'du_an', 'khu_vuc'].map((k) => [k, String(dau[k] || '')])),
    luu: r ? { gia: d.gia, gc: d.gc, cong: docCong(d.cong), ts: r.ts, by_id: r.by_id, by_name: r.by_name } : null,
  });
}

export async function slPut(req, env, user) {
  const b = await readJson(req);
  const ngay = docNgay(b.ngay);
  if (ngay < vnDay(Date.now() - SL_SUA_NGAY * 864e5)) throw bad(`Chỉ lưu được báo cáo sản lượng trong ${SL_SUA_NGAY} ngày gần đây`);
  const gia = lam2(b.gia), gc = lam2(b.gc);
  if (!(gia >= SL_GIA.min && gia <= SL_GIA.max)) throw bad('Tỷ lệ giá phải từ ' + SL_GIA.min + ' đến ' + SL_GIA.max);
  if (!(gc >= SL_GC.min && gc <= SL_GC.max)) throw bad('Tỷ lệ gia công phải từ ' + SL_GC.min + ' đến ' + SL_GC.max);
  const cong = docCong(b.cong);
  const cu = await env.DB.prepare('SELECT ts FROM san_luong WHERE ngay = ?').bind(ngay).first();
  const biet = b.ts == null ? null : Number(b.ts) || 0;
  if (biet != null && cu && cu.ts !== biet) throw new HttpError(409, 'Có người vừa lưu báo cáo sản lượng này. Màn hình đã tải lại, hãy xem rồi lưu lại.', 'changed');
  const ts = Math.max(Date.now(), cu ? cu.ts + 1 : 0);
  const data = JSON.stringify({ gia, gc, cong });
  const ghi = [
    env.DB.prepare(`INSERT INTO san_luong (ngay, data, ts, by_id) VALUES (?,?,?,?)
                    ON CONFLICT(ngay) DO UPDATE SET data = excluded.data, ts = excluded.ts, by_id = excluded.by_id`).bind(ngay, data, ts, user.id),
    auditStmt(env, user, 'sl_luu', { ngay, gia, gc }),
    bump(env),
  ];
  // người khác lưu chen vào giữa lúc đọc và lúc ghi thì từ chối (chỉ khi máy gửi kèm ts đã biết)
  if (biet == null) await env.DB.batch(ghi);
  else {
    await batchGuarded(env, guardStmt(env, 'EXISTS (SELECT 1 FROM san_luong WHERE ngay = ? AND ts <> ?)', ngay, biet), ghi, new HttpError(409, 'Có người vừa lưu báo cáo sản lượng này. Hãy tải lại rồi lưu.', 'changed'));
  }
  return json({ ok: true, ngay, ts });
}
