// Báo cáo sản lượng gửi cấp trên: quân số đã báo của các tổ + số công gia công thép + thiết lập => sản lượng.
import { HttpError, bad, json, vnDay } from './core.js';
import { auditStmt, batchGuarded, bump, guardStmt, readJson } from './helpers.js';
import { MAU_CO, QS_TONG_MAX, TO_SX } from './quanso.js';

/* ========================= BÁO CÁO SẢN LƯỢNG =========================
   Cùng khuôn với báo cáo ca (src/baocao.js): CVKTHT trở lên soạn, phần đầu (đơn vị, chỉ huy, dự án, khu vực) dùng CHUNG
   mẫu bc_mau với báo cáo ca. Khác ở chỗ: MỘT báo cáo gộp ca ngày và ca đêm, mỗi tổ một dòng.
   - QUÂN SỐ CỦA MỘT TỔ trong báo cáo ngày D: số tổ đã báo của CA NGÀY ngày D, và/hoặc của CA ĐÊM NGÀY HÔM TRƯỚC (ca đêm D-1 kết thúc
     sáng D) nếu tổ làm đêm. Tổ chia hai ca thì cộng cả hai. Không có phần nghỉ / lý do nghỉ. Tổ không báo thì lấy số thiết lập đã
     chép lúc hết ca (quan_so_tl).
   - CÔNG GIA CÔNG THÉP của tổ: mặc định = số ĐI LÀM ở trên; CVKTHT trở lên sửa được từng tổ (data.cong, chỉ lưu ô đã sửa).
   - THIẾT LẬP (lưu ở bc_mau.data.sl, dùng cho mọi ngày, CVKTHT trở lên sửa):
       chuan  công chuẩn, kg/công (mặc định 158)
       gia    tỷ lệ giá, CHUNG cho mọi tổ, 0,2 – 1 (mặc định 0,2)
       gc     tỷ lệ gia công, RIÊNG TỪNG TỔ, 0,5 – 1; tổ chưa đặt thì mặc định ngẫu nhiên 0,70 – 0,80, cố định theo tổ.
   - SẢN LƯỢNG của tổ (kg) = (công × chuan × tỷ lệ gia công của tổ) ÷ tỷ lệ giá, làm tròn kg; tổng báo cáo = cộng các tổ.
   - Lưu báo cáo của một ngày thì CHỤP LẠI thiết lập đang dùng (data.chup): đổi thiết lập sau này không làm đổi số của báo cáo cũ.
   Server GOM SỐ và LƯU; việc ghép chữ nằm ở máy khách (app.js, slTao), như báo cáo ca. */
export const SL_CHUAN = { min: 1, max: 1000, mac_dinh: 158 };
export const SL_GIA = { min: 0.2, max: 1, mac_dinh: 0.2 };
export const SL_GC = { min: 0.5, max: 1 };
const SL_SUA_NGAY = 31;

// tỷ lệ gia công mặc định của một tổ: 0,70 – 0,80, cố định theo tổ
export function glMacDinh(uid) {
  let h = 0;
  for (const c of 'to' + uid) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (70 + (h % 11)) / 100;
}
export const sanLuongKg = (cong, chuan, gc, gia) => Math.round((cong * chuan * gc) / gia);

const docJ = (s) => { try { const o = JSON.parse(s || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch (e) { return {}; } };
const lam2 = (x) => Math.round(Number(x) * 100) / 100;
function docNgay(v) {
  const ngay = String(v == null || v === '' ? vnDay() : v);
  const t = Date.parse(ngay + 'T00:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ngay) || !Number.isFinite(t) || vnDay(t) !== ngay) throw bad('Ngày không hợp lệ');
  if (ngay > vnDay()) throw bad('Chưa tới ngày này');
  return ngay;
}
const congNgay = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const trong = (x, lim) => Number.isFinite(x) && x >= lim.min && x <= lim.max;
// công đã sửa: { "<id tổ>": n }, chỉ nhận số nguyên 0..QS_TONG_MAX
function docCong(v) {
  const o = v && typeof v === 'object' && !Array.isArray(v) ? v : {}, out = {};
  for (const [uid, x] of Object.entries(o).slice(0, 300)) {
    if (!/^\d+$/.test(uid) || x === undefined || x === null || x === '') continue;
    const n = Number(x);
    if (typeof x === 'object' || !Number.isInteger(n) || n < 0 || n > QS_TONG_MAX) throw bad('Số công gia công thép không hợp lệ (0 – ' + QS_TONG_MAX + ')');
    out[uid] = n;
  }
  return out;
}
// thiết lập đang lưu (đã lọc giá trị lạ), chưa điền mặc định theo tổ
function docSl(row) {
  const m = docJ(row && row.data), s = m.sl && typeof m.sl === 'object' ? m.sl : {}, gc = {};
  for (const [k, v] of Object.entries(s.gc && typeof s.gc === 'object' ? s.gc : {})) if (/^\d+$/.test(k) && trong(Number(v), SL_GC)) gc[k] = Number(v);
  return { chuan: trong(Number(s.chuan), SL_CHUAN) ? Number(s.chuan) : SL_CHUAN.mac_dinh, gia: trong(Number(s.gia), SL_GIA) ? Number(s.gia) : SL_GIA.mac_dinh, gc, dau: m.dau && typeof m.dau === 'object' ? m.dau : {} };
}
// thiết lập đầy đủ cho các tổ (tổ chưa đặt thì mặc định)
const slDayDu = (sl, ids) => ({ chuan: sl.chuan, gia: sl.gia, gc: Object.fromEntries(ids.map((id) => [id, sl.gc[id] !== undefined ? sl.gc[id] : glMacDinh(id)])) });
const docChup = (c, ids) => {
  const o = c && typeof c === 'object' ? c : null;
  if (!o || !trong(Number(o.chuan), SL_CHUAN) || !trong(Number(o.gia), SL_GIA)) return null;
  const gc = {};
  for (const id of ids) gc[id] = o.gc && trong(Number(o.gc[id]), SL_GC) ? Number(o.gc[id]) : glMacDinh(id);
  return { chuan: Number(o.chuan), gia: Number(o.gia), gc };
};

/* Số liệu cho một ngày: mỗi tổ một dòng (quân số ca ngày + ca đêm hôm trước), thiết lập, phần đã lưu, phần đầu của mẫu dùng chung. */
export async function slView(env, url) {
  const ngay = docNgay(url.searchParams.get('ngay')), hom = congNgay(ngay, -1);
  const [tdt, qs, tl, mau, bc] = await env.DB.batch([
    env.DB.prepare(`SELECT u.id, u.name FROM users u WHERE u.role = 'tieudoi' AND (u.deleted = 0 OR EXISTS (SELECT 1 FROM quan_so q WHERE q.user_id = u.id AND ((q.ngay = ?1 AND q.ca = 1) OR (q.ngay = ?2 AND q.ca = 2)))) ORDER BY ${TO_SX}`).bind(ngay, hom),
    env.DB.prepare('SELECT ngay, ca, user_id, tong, lam FROM quan_so WHERE (ngay = ?1 AND ca = 1) OR (ngay = ?2 AND ca = 2)').bind(ngay, hom),
    env.DB.prepare('SELECT ngay, ca, user_id, tong, lam FROM quan_so_tl WHERE (ngay = ?1 AND ca = 1) OR (ngay = ?2 AND ca = 2)').bind(ngay, hom),
    env.DB.prepare('SELECT data FROM bc_mau WHERE id = 1'),
    env.DB.prepare("SELECT s.data, s.ts, s.by_id, COALESCE(u.name, '(đã xoá)') by_name FROM san_luong s LEFT JOIN users u ON u.id = s.by_id WHERE s.ngay = ?").bind(ngay),
  ]);
  const bao = new Map(qs.results.map((r) => [r.user_id + ':' + r.ca, r])), chep = new Map(tl.results.map((r) => [r.user_id + ':' + r.ca, r]));
  const dong = (uid, ca, n) => {
    const b = bao.get(uid + ':' + ca), t = chep.get(uid + ':' + ca);
    // dòng tổ báo luôn hơn số thiết lập đã chép; tổ không làm ca đó thì không có dòng nào (null)
    return b ? { ngay: n, tong: b.tong, lam: b.lam, nguon: 'bao' } : t && t.lam != null ? { ngay: n, tong: t.tong, lam: t.lam, nguon: 'tl' } : null;
  };
  const to = tdt.results.map((u) => {
    const ngayCa = dong(u.id, 1, ngay), dem = dong(u.id, 2, hom), cs = [ngayCa, dem].filter(Boolean);
    return { id: u.id, name: u.name, ngay: ngayCa, dem, lam: cs.reduce((a, x) => a + x.lam, 0), tong: cs.reduce((a, x) => Math.max(a, x.tong || 0), 0) };
  });
  const ids = to.map((t) => t.id), sl = docSl(mau.results[0]);
  const r = bc.results[0], d = r ? docJ(r.data) : {};
  return json({
    ngay, hom, to,
    gioi_han: { chuan: SL_CHUAN, gia: SL_GIA, gc: SL_GC },
    tl: { ...slDayDu(sl, ids), da_dat: Object.keys(sl.gc).map(Number) },
    dau: Object.fromEntries(['don_vi', 'ddt', 'tdtr', 'cbpt', 'du_an', 'khu_vuc'].map((k) => [k, String(sl.dau[k] || '')])),
    luu: r ? { cong: docCong(d.cong), chup: docChup(d.chup, ids), ts: r.ts, by_id: r.by_id, by_name: r.by_name } : null,
  });
}

// lưu báo cáo của một ngày: công đã sửa + ảnh chụp thiết lập đang dùng
export async function slPut(req, env, user) {
  const b = await readJson(req);
  const ngay = docNgay(b.ngay);
  if (ngay < vnDay(Date.now() - SL_SUA_NGAY * 864e5)) throw bad(`Chỉ lưu được báo cáo sản lượng trong ${SL_SUA_NGAY} ngày gần đây`);
  const cong = docCong(b.cong), c = b.chup;
  if (!c || typeof c !== 'object') throw bad('Thiếu thiết lập đang dùng');
  if (!trong(Number(c.chuan), SL_CHUAN)) throw bad('Công chuẩn phải từ ' + SL_CHUAN.min + ' đến ' + SL_CHUAN.max + ' kg/công');
  if (!trong(Number(c.gia), SL_GIA)) throw bad('Tỷ lệ giá phải từ ' + SL_GIA.min + ' đến ' + SL_GIA.max);
  const gc = {};
  for (const [k, v] of Object.entries(c.gc && typeof c.gc === 'object' ? c.gc : {}).slice(0, 300)) {
    if (!/^\d+$/.test(k)) continue;
    if (!trong(Number(v), SL_GC)) throw bad('Tỷ lệ gia công phải từ ' + SL_GC.min + ' đến ' + SL_GC.max);
    gc[k] = lam2(v);
  }
  const cu = await env.DB.prepare('SELECT ts FROM san_luong WHERE ngay = ?').bind(ngay).first();
  const biet = b.ts == null ? null : Number(b.ts) || 0;
  if (biet != null && cu && cu.ts !== biet) throw new HttpError(409, 'Có người vừa lưu báo cáo sản lượng này. Màn hình đã tải lại, hãy xem rồi lưu lại.', 'changed');
  const ts = Math.max(Date.now(), cu ? cu.ts + 1 : 0);
  const data = JSON.stringify({ cong, chup: { chuan: lam2(c.chuan), gia: lam2(c.gia), gc } });
  const ghi = [
    env.DB.prepare(`INSERT INTO san_luong (ngay, data, ts, by_id) VALUES (?,?,?,?)
                    ON CONFLICT(ngay) DO UPDATE SET data = excluded.data, ts = excluded.ts, by_id = excluded.by_id`).bind(ngay, data, ts, user.id),
    auditStmt(env, user, 'sl_luu', { ngay, chuan: lam2(c.chuan), gia: lam2(c.gia) }),
    bump(env),
  ];
  // người khác lưu chen vào giữa lúc đọc và lúc ghi thì từ chối (chỉ khi máy gửi kèm ts đã biết)
  if (biet == null) await env.DB.batch(ghi);
  else await batchGuarded(env, guardStmt(env, 'EXISTS (SELECT 1 FROM san_luong WHERE ngay = ? AND ts <> ?)', ngay, biet), ghi, new HttpError(409, 'Có người vừa lưu báo cáo sản lượng này. Hãy tải lại rồi lưu.', 'changed'));
  return json({ ok: true, ngay, ts });
}

/* Đặt thiết lập: công chuẩn, tỷ lệ giá chung, tỷ lệ gia công từng tổ. Chỉ ghi các khoá được gửi, theo từng khoá (không đè cả khối),
   nên hai người đặt hai tổ khác nhau cùng lúc không đè nhau. Đổi thiết lập KHÔNG đổi báo cáo của ngày đã lưu (xem chup). */
export async function slThietLap(req, env, user) {
  const b = await readJson(req);
  const sets = ["'$.sl', json(COALESCE(json_extract(data, '$.sl'), '{}'))"], args = [], log = {};
  if (b.chuan !== undefined) {
    const v = lam2(b.chuan);
    if (!trong(v, SL_CHUAN)) throw bad('Công chuẩn phải từ ' + SL_CHUAN.min + ' đến ' + SL_CHUAN.max + ' kg/công');
    sets.push("'$.sl.chuan', ?"); args.push(v); log.chuan = v;
  }
  if (b.gia !== undefined) {
    const v = lam2(b.gia);
    if (!trong(v, SL_GIA)) throw bad('Tỷ lệ giá phải từ ' + SL_GIA.min + ' đến ' + SL_GIA.max);
    sets.push("'$.sl.gia', ?"); args.push(v); log.gia = v;
  }
  if (b.gc !== undefined) {
    if (!b.gc || typeof b.gc !== 'object' || Array.isArray(b.gc)) throw bad('Tỷ lệ gia công không hợp lệ');
    const ids = Object.keys(b.gc);
    if (ids.length > 300 || ids.some((k) => !/^\d+$/.test(k))) throw bad('Tỷ lệ gia công không hợp lệ');
    if (ids.length) {
      const co = new Set((await env.DB.prepare("SELECT id FROM users WHERE role = 'tieudoi'").all()).results.map((r) => String(r.id)));
      sets.push("'$.sl.gc', json(COALESCE(json_extract(data, '$.sl.gc'), '{}'))");
      log.gc = {};
      for (const k of ids) {
        if (!co.has(k)) throw bad('Không phải tổ (Tiểu đội trưởng)');
        const v = lam2(b.gc[k]);
        if (!trong(v, SL_GC)) throw bad('Tỷ lệ gia công phải từ ' + SL_GC.min + ' đến ' + SL_GC.max);
        sets.push(`'$.sl.gc.${k}', ?`); args.push(v); log.gc[k] = v;
      }
    }
  }
  if (sets.length === 1) throw bad('Chưa có thiết lập nào để lưu');
  const ts = Date.now();
  await env.DB.batch([
    env.DB.prepare(MAU_CO),
    env.DB.prepare(`UPDATE bc_mau SET data = json_set(COALESCE(data, '{}'), ${sets.join(', ')}), ts = ?, by_id = ? WHERE id = 1`).bind(...args, ts, user.id),
    auditStmt(env, user, 'sl_thietlap', log),
    bump(env),
  ]);
  return json({ ok: true });
}
