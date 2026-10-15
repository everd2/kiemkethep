// Quân số đầu ca: mỗi tổ (Tiểu đội trưởng) báo số đi làm, số nghỉ và lý do nghỉ ở đầu mỗi ca.
import { DAY_RE, HttpError, bad, capOf, fmtDay, json, vnDay } from './core.js';
import { CA_DEFAULT, SETTINGS_SQL, auditStmt, batchGuarded, bump, guardStmt, intIn, parseSettings, readJson } from './helpers.js';

/* ========================= QUÂN SỐ ĐẦU CA =========================
   Tách hẳn khỏi phần đếm thép. Đây là nguồn số cho mục "Quân số" của báo cáo ca gửi cấp trên.
   - MỘT TỔ = MỘT TIỂU ĐỘI TRƯỞNG. Có bao nhiêu Tiểu đội trưởng đang dùng app thì có bấy nhiêu tổ.
   - BÁO THEO CA, đầu mỗi ca: tổ làm cả hai ca thì báo hai lần, tổ chỉ làm ca đêm thì chỉ báo ca đêm. Ca đêm
     vắt qua nửa đêm nên ngày của ca là ngày BẮT ĐẦU ca (xem caLuc).
   - NGƯỜI BÁO CHỈ GHI: tổng quân số tổ, số đi làm ca này, số nghỉ THEO TỪNG LÝ DO. Số nghỉ là tổng các lý do
     (OFF luân phiên cũng là một lý do), phần còn lại là người thuộc ca kia — server tự tính, nên một dòng
     không bao giờ có kiểu "nghỉ 5 (6 OFF)" hay cộng lại khác tổng.
   - AI GHI: Tiểu đội trưởng chỉ ghi tổ mình, cho ca đang diễn ra hoặc ca kế tiếp (báo sớm trước giờ vào ca).
     CVKTHT trở lên ghi thay hoặc sửa cho mọi tổ, lùi được 7 ngày; dòng ghi rõ ai ghi (by_id).
   - AI XEM: Tiểu đội trưởng chỉ thấy tổ mình; CVKTHT trở lên thấy mọi tổ.
   - HẠN BÁO: mỗi ca có một giờ phải báo xong (mặc định ca ngày 7h, ca đêm 19h15; CVKTHT trở lên đổi được).
     Hạn chỉ để NHẮC — quá hạn thẻ nhắc chuyển đỏ — chứ không khoá: báo muộn vẫn hơn không báo.
   - TỔ ĐANG LÀM CA NÀO: một tổ thường làm cố định ca ngày (hoặc ca đêm) 15–30 ngày rồi mới đổi. App không
     bắt khai lịch đổi ca: lấy theo LẦN BÁO GẦN NHẤT của tổ (xem caCua), và chỉ nhắc tổ ở ca tổ đang làm.
   Báo lại là ghi đè dòng của ca đó; lần ghi nào cũng vào nhật ký. */
export const QS_LY_DO = [['om', 'ốm'], ['phep', 'nghỉ phép năm'], ['que', 'về quê'], ['gd', 'việc gia đình'], ['off', 'OFF luân phiên'], ['khac', 'lý do khác']];
export const CA_TEN = { 1: 'ca ngày', 2: 'ca đêm' };
// trần cho một tổ: cao hơn hẳn thực tế (tổ vài chục người), chỉ để chặn gõ thừa số
export const QS_TONG_MAX = 500;
const QS_SUA_NGAY = 7;
const PHUT = 60e3, NGAY = 864e5;

const congNgay = (d, n) => new Date(Date.parse(d) + n * NGAY).toISOString().slice(0, 10);
// số lưu hỏng (ca đêm không sau ca ngày) thì về giờ mặc định, như khung giờ đếm
const caMoc = (st) => (st.ca1_tu >= 0 && st.ca2_tu < 1440 && st.ca1_tu < st.ca2_tu ? [st.ca1_tu, st.ca2_tu] : CA_DEFAULT);
/* Ca đang diễn ra lúc `ms`, theo giờ Việt Nam của máy chủ. Trước giờ vào ca ngày (0h → 6h30) vẫn là CA ĐÊM
   CỦA HÔM QUA: người báo lúc 2h sáng đang ở giữa ca bắt đầu từ tối hôm trước. */
export function caLuc(st, ms = Date.now()) {
  const [a, b] = caMoc(st), day = vnDay(ms), m = ((ms + 7 * 3600e3) % NGAY) / PHUT;
  if (m < a) return { ngay: congNgay(day, -1), ca: 2 };
  return { ngay: day, ca: m < b ? 1 : 2 };
}
export const caKe = (c) => (c.ca === 1 ? { ngay: c.ngay, ca: 2 } : { ngay: congNgay(c.ngay, 1), ca: 1 });
// so sánh chuỗi này là so thứ tự thời gian của hai ca
export const caKhoa = (c) => c.ngay + ':' + c.ca;
// giờ bắt đầu và kết thúc thật của một ca (ms)
export function caGio(st, c) {
  const [a, b] = caMoc(st), d0 = Date.parse(c.ngay + 'T00:00:00+07:00');
  return c.ca === 1 ? { tu: d0 + a * PHUT, den: d0 + b * PHUT } : { tu: d0 + b * PHUT, den: d0 + NGAY + a * PHUT };
}
const caGoi = (c) => CA_TEN[c.ca] + ' ' + fmtDay(c.ngay);
// hạn báo hợp lệ: của ca ngày nằm trong ca ngày, của ca đêm từ lúc vào ca đêm tới hết ngày đó
const hanMoc = (st) => {
  const [a, b] = caMoc(st);
  return [st.qs_han1 >= a && st.qs_han1 < b ? st.qs_han1 : Math.min(a + 30, b - 1), st.qs_han2 >= b && st.qs_han2 < 1440 ? st.qs_han2 : Math.min(b + 45, 1439)];
};
// giờ thật (ms) phải báo xong quân số của một ca
export const caHan = (st, c) => Date.parse(c.ngay + 'T00:00:00+07:00') + hanMoc(st)[c.ca - 1] * PHUT;
/* Tổ đang làm ca nào, suy từ các dòng tổ báo ở NGÀY BÁO GẦN NHẤT: có người đi làm ca nào thì tổ làm ca đó,
   có người "thuộc ca kia" thì tổ làm cả ca kia (tổ chia hai ca, hoặc cả tổ làm ca kia). Mảng rỗng = chưa
   biết (tổ chưa báo lần nào): coi như ca nào cũng có thể. */
export function caCua(rows) {
  const s = new Set();
  for (const r of rows) { if (r.lam > 0) s.add(r.ca); if (r.ca_kia > 0) s.add(r.ca === 1 ? 2 : 1); }
  return [...s].sort();
}

function docCa(ngay, ca) {
  const d = String(ngay || ''), n = Number(ca);
  // ngày phải có thật: Date đọc "2026-02-31" thành 03/03 chứ không báo lỗi (xem docDon ở giacong.js)
  const dt = DAY_RE.test(d) ? new Date(d + 'T00:00:00Z') : null;
  if (!dt || Number.isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== d || (n !== 1 && n !== 2)) throw bad('Ca không hợp lệ');
  return { ngay: d, ca: n };
}
const chu = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
/* LỊCH CA VÀ SỐ THIẾT LẬP của từng tổ. Lưu trong mẫu báo cáo (bc_mau.data), không cần bảng riêng:
     lich."<id>" = { ca: 1 ca ngày | 2 ca đêm | 3 cả hai ca, den: 'YYYY-MM-DD' hoặc null (đến khi đổi), ts, by }
       — tổ trưởng tự đặt (CVKTHT đặt hộ được). Tổ thường làm một ca 15–30 ngày rồi đổi; hết hạn thì app hỏi lại.
     tl."<id>" = { tong, s1, s2, n1, n2, gc1, gc2, ts, by } — SỐ THIẾT LẬP do CVKTHT trở lên đặt: tổng quân số, người ca
       ngày ĐI LÀM, người ca đêm ĐI LÀM, và người NGHỈ (ngoài số đi làm) theo lý do của từng ca (n1 / n2, ghi chú gc1 / gc2; xem tlNghi). Là số dự phòng: báo cáo ca dùng nó cho tổ chưa báo (hoặc khi người soạn chọn "chỉ số thiết lập").
   Ghi bằng json_set từng nhánh, không đọc-sửa-ghi cả khối: hai người sửa hai tổ cùng lúc không đè nhau. Hai người
   sửa CÙNG một tổ thì chặn bằng ts: lưu dựa trên bản cũ là bị từ chối và được báo ai vừa sửa (qsThietLap). */
export const MAU_CO = "INSERT OR IGNORE INTO bc_mau (id, data, ts) VALUES (1, '{}', 0)";
export const docCfg = (row) => {
  let d = {}; try { d = JSON.parse((row && row.data) || '{}') || {}; } catch (e) { d = {}; }
  return { lich: d.lich && typeof d.lich === 'object' ? d.lich : {}, tl: d.tl && typeof d.tl === 'object' ? d.tl : {} };
};
// ca của tổ theo lịch vào ngày `ngay`: 1, 2, 3 (cả hai) hoặc 0 (chưa đặt / hết hạn)
export const caLich = (cfg, uid, ngay) => { const r = cfg.lich[uid]; return r && [1, 2, 3].includes(r.ca) && (!r.den || ngay <= r.den) ? r.ca : 0; };
const caMang = (c) => (c === 3 ? [1, 2] : c ? [c] : []);

/* THỨ TỰ TỔ: CVKTHT xếp một lần (lưu trong mẫu báo cáo, bc_mau.data.thu_tu = mảng id Tiểu đội trưởng), để bảng
   quân số và báo cáo ca ngày nào cũng cùng một thứ tự. Tổ chưa được xếp đứng sau, theo tên. Dùng với bí danh u. */
export const TO_SX = "COALESCE((SELECT j.key FROM bc_mau m, json_each(m.data, '$.thu_tu') j WHERE m.id = 1 AND j.value = u.id), 9999), u.name";
const docNghi = (s) => { try { const o = JSON.parse(s || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } };

/* Quân số của một ca (mặc định: ca đang diễn ra). Trả cả hai ca của ngày đó — tổ chia hai ca thì dòng ca
   kia nói bao nhiêu người thuộc ca này — và lần báo gần nhất TRƯỚC ca này của từng tổ, để điền sẵn tổng
   quân số (tìm thẳng theo index idx_quan_so_u, không quét bảng). */
export async function qsView(env, user, url) {
  const st = parseSettings((await env.DB.prepare(SETTINGS_SQL).all()).results);
  const hien = caLuc(st), ke = caKe(hien), q = url.searchParams;
  const c = q.get('ngay') || q.get('ca') ? docCa(q.get('ngay'), q.get('ca')) : hien;
  if (caKhoa(c) > caKhoa(ke)) throw bad('Chưa tới ' + caGoi(c));
  const ql = capOf(user.role) >= 1;
  // Tiểu đội trưởng: mọi câu chỉ lấy tổ mình
  const rieng = (n) => (ql ? '' : ` AND u.id = ?${n}`), kem = ql ? [] : [user.id];
  const [tdt, rows, truoc, cuaToi, cfgR, tenR] = await env.DB.batch([
    env.DB.prepare(`SELECT u.id, u.name FROM users u WHERE u.role = 'tieudoi' AND u.deleted = 0${rieng(1)} ORDER BY ${TO_SX}`).bind(...kem),
    env.DB.prepare(`SELECT q.ngay, q.ca, q.user_id, q.tong, q.lam, q.ca_kia, q.nghi, q.ghi_chu, q.ts, q.by_id,
                      COALESCE(u.name, '(đã xoá)') uname, COALESCE(b.name, '(đã xoá)') by_name
                    FROM quan_so q LEFT JOIN users u ON u.id = q.user_id LEFT JOIN users b ON b.id = q.by_id
                    WHERE q.ngay = ?1${ql ? '' : ' AND q.user_id = ?2'} ORDER BY uname, q.ca`).bind(c.ngay, ...kem),
    env.DB.prepare(`SELECT q.user_id, q.ngay, q.ca, q.tong, q.lam, q.ca_kia, q.ts FROM users u JOIN quan_so q ON q.rowid = (
                      SELECT x.rowid FROM quan_so x WHERE x.user_id = u.id AND (x.ngay < ?1 OR (x.ngay = ?1 AND x.ca < ?2))
                      ORDER BY x.ngay DESC, x.ca DESC LIMIT 1)
                    WHERE u.role = 'tieudoi' AND u.deleted = 0${rieng(3)}`).bind(c.ngay, c.ca, ...kem),
    // dòng của chính người đang xem ở ca đang diễn ra và ca kế: màn "Quân số tổ đã báo" của Tiểu đội trưởng
    env.DB.prepare('SELECT ngay, ca, tong, lam, ca_kia, nghi, ghi_chu, ts FROM quan_so WHERE user_id = ?1 AND ((ngay = ?2 AND ca = ?3) OR (ngay = ?4 AND ca = ?5))')
      .bind(user.id, hien.ngay, hien.ca, ke.ngay, ke.ca),
    env.DB.prepare('SELECT data FROM bc_mau WHERE id = 1'),
    env.DB.prepare('SELECT id, name FROM users'),
  ]);
  const cfg = docCfg(cfgR.results[0]), ten = Object.fromEntries(tenR.results.map((u) => [u.id, u.name]));
  const loc = (o) => Object.fromEntries(Object.entries(o).filter(([id]) => ql || Number(id) === user.id).map(([id, v]) => [id, { ...v, by_name: ten[v.by] || '' }]));
  const hm = hanMoc(st);
  return json({
    ngay: c.ngay, ca: c.ca, hien, ke, gio: caGio(st, c), han: caHan(st, c), hanPhut: hm, lyDo: QS_LY_DO,
    // hai ca báo được lúc này (một ca ngày, một ca đêm), kèm dòng tổ mình đã báo: màn xem lại của Tiểu đội trưởng
    chon: [hien, ke].map((x) => {
      const r = cuaToi.results.find((y) => y.ngay === x.ngay && y.ca === x.ca);
      return { ...x, gio: caGio(st, x), han: caHan(st, x), row: r ? { ...r, nghi: docNghi(r.nghi) } : null };
    }),
    tdt: tdt.results, rows: rows.results.map((r) => ({ ...r, nghi: docNghi(r.nghi) })), truoc: truoc.results,
    lich: loc(cfg.lich), tl: ql ? loc(cfg.tl) : {},
  });
}

/* Ghi quân số một tổ cho một ca. Kiểm quyền TRƯỚC khi tìm tổ, như gcViec.
   lam + tổng nghỉ không được vượt tổng quân số; phần còn lại là người thuộc ca kia (ca_kia). */
export async function qsPut(req, env, user) {
  const b = await readJson(req);
  const c = docCa(b.ngay, b.ca);
  const ql = capOf(user.role) >= 1;
  const uid = b.user == null ? user.id : Number(b.user);
  if (!Number.isInteger(uid)) throw bad('Cần chọn tổ');
  if (!ql && uid !== user.id) throw new HttpError(403, 'Bạn chỉ báo được quân số của tổ mình');
  // cài đặt (giờ ca) và tổ cần ghi: MỘT lượt D1. Tổ đã có dòng ở ca này thì sửa được dù người đó vừa thôi làm Tiểu đội
  // trưởng; ghi MỚI thì chỉ cho tổ đang có.
  const [stR, toR] = await env.DB.batch([
    env.DB.prepare(SETTINGS_SQL),
    env.DB.prepare(`SELECT u.id, u.name, u.role, u.deleted, EXISTS (SELECT 1 FROM quan_so q WHERE q.ngay = ?2 AND q.ca = ?3 AND q.user_id = u.id) co
                    FROM users u WHERE u.id = ?1`).bind(uid, c.ngay, c.ca),
  ]);
  const st = parseSettings(stR.results), hien = caLuc(st), to = toR.results[0];
  if (caKhoa(c) > caKhoa(caKe(hien))) throw bad('Chưa tới ' + caGoi(c) + ': chỉ báo trước được một ca');
  if (!ql && caKhoa(c) < caKhoa(hien)) throw new HttpError(409, CA_TEN[c.ca][0].toUpperCase() + caGoi(c).slice(1) + ' đã qua. Nhờ CVKTHT trở lên sửa giúp.', 'qua');
  if (ql && c.ngay < vnDay(Date.now() - QS_SUA_NGAY * NGAY)) throw bad(`Chỉ sửa được quân số trong ${QS_SUA_NGAY} ngày gần đây`);
  if (!to || ((to.deleted || to.role !== 'tieudoi') && !to.co)) {
    throw bad(uid === user.id ? 'Chọn tổ cần ghi quân số' : 'Chỉ ghi quân số cho tổ của một Tiểu đội trưởng đang dùng app');
  }
  const tong = intIn(b.tong, 1, QS_TONG_MAX, 'Tổng quân số của tổ');
  const lam = intIn(b.lam, 0, QS_TONG_MAX, 'Số đi làm');
  const vao = b.nghi && typeof b.nghi === 'object' && !Array.isArray(b.nghi) ? b.nghi : {};
  if (Object.keys(vao).some((k) => !QS_LY_DO.some((l) => l[0] === k))) throw bad('Lý do nghỉ không hợp lệ');
  const nghi = {};
  for (const [ma, ten] of QS_LY_DO) {
    const n = vao[ma] == null || vao[ma] === '' ? 0 : intIn(vao[ma], 0, QS_TONG_MAX, 'Số người nghỉ (' + ten + ')');
    if (n) nghi[ma] = n;
  }
  const soNghi = Object.values(nghi).reduce((a, x) => a + x, 0);
  if (lam + soNghi > tong) throw bad(`Đi làm ${lam} + nghỉ ${soNghi} = ${lam + soNghi}, nhiều hơn tổng quân số ${tong} của tổ`);
  const ghi_chu = chu(b.ghi_chu, 200) || null;
  // "lý do khác" mà không ghi rõ thì báo cáo ca chỉ còn chép lại được chữ "lý do khác"
  if (nghi.khac && !ghi_chu) throw bad('Có người nghỉ vì lý do khác: ghi rõ lý do vào ô ghi chú');
  const ca_kia = tong - lam - soNghi, ts = Date.now();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO quan_so (ngay, ca, user_id, tong, lam, ca_kia, nghi, ghi_chu, ts, by_id) VALUES (?,?,?,?,?,?,?,?,?,?)
                    ON CONFLICT(ngay, ca, user_id) DO UPDATE SET tong = excluded.tong, lam = excluded.lam, ca_kia = excluded.ca_kia,
                      nghi = excluded.nghi, ghi_chu = excluded.ghi_chu, ts = excluded.ts, by_id = excluded.by_id`)
      .bind(c.ngay, c.ca, uid, tong, lam, ca_kia, JSON.stringify(nghi), ghi_chu, ts, user.id),
    auditStmt(env, user, 'qs_bao', { ngay: c.ngay, ca: c.ca, to: to.name, tong, lam, nghi, ca_kia, ghi_chu: ghi_chu || undefined, thay: uid !== user.id ? 1 : undefined }),
    bump(env),
  ]);
  return json({ ok: true, ngay: c.ngay, ca: c.ca, user: uid, tong, lam, ca_kia, nghi: soNghi });
}

/* Đổi hạn báo quân số của hai ca (CVKTHT trở lên). Nhận phút trong ngày: { ca1, ca2 }. Hạn ca ngày phải nằm
   trong ca ngày, hạn ca đêm từ lúc vào ca đêm tới trước nửa đêm. */
export async function qsHan(req, env, user) {
  const b = await readJson(req);
  const st = parseSettings((await env.DB.prepare(SETTINGS_SQL).all()).results);
  const [a, z] = caMoc(st), gio = (m) => Math.floor(m / 60) + 'h' + String(m % 60).padStart(2, '0');
  const h1 = intIn(b.ca1, 0, 1439, 'Hạn báo ca ngày'), h2 = intIn(b.ca2, 0, 1439, 'Hạn báo ca đêm');
  if (h1 < a || h1 >= z) throw bad(`Hạn báo ca ngày phải nằm trong ca ngày (${gio(a)} → ${gio(z)})`);
  if (h2 < z) throw bad(`Hạn báo ca đêm phải từ ${gio(z)} (giờ vào ca đêm) tới trước nửa đêm`);
  const dat = (k, v) => env.DB.prepare('INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(k, String(v));
  await env.DB.batch([dat('qs_han1', h1), dat('qs_han2', h2), auditStmt(env, user, 'qs_han', { ca1: h1, ca2: h2 }), bump(env)]);
  return json({ ok: true, ca1: h1, ca2: h2 });
}

/* Đặt lịch ca của một tổ. Tiểu đội trưởng đặt cho tổ mình; CVKTHT trở lên đặt hộ mọi tổ.
   body: { user (bỏ trống = tổ mình), ca: 1 | 2 | 3, den: 'YYYY-MM-DD' | null }. */
export async function qsLich(req, env, user) {
  const b = await readJson(req);
  const ql = capOf(user.role) >= 1, uid = b.user == null ? user.id : Number(b.user);
  if (!ql && uid !== user.id) throw new HttpError(403, 'Bạn chỉ đặt được ca của tổ mình');
  const ca = Number(b.ca);
  if (![1, 2, 3].includes(ca)) throw bad('Chọn ca ngày, ca đêm hoặc cả hai ca');
  let den = null;
  if (b.den) {
    den = docCa(b.den, 1).ngay;
    if (den < vnDay()) throw bad('Ngày kết thúc phải từ hôm nay trở đi');
    if (den > vnDay(Date.now() + 366 * NGAY)) throw bad('Ngày kết thúc xa quá một năm');
  }
  /* TỔNG QUÂN SỐ TỔ TỰ KHAI (tong): tổ trưởng khai cùng lúc với ca. Lần đặt ca không gửi kèm tổng thì giữ nguyên số tổ
     đã khai. Khác SỐ THIẾT LẬP (tl) — số của CVKTHT, xem qsThietLap. Tìm tổ và đọc số đã khai trong MỘT lượt D1. */
  const [toR, cuR] = await env.DB.batch([
    env.DB.prepare('SELECT id, name, role, deleted FROM users WHERE id = ?').bind(uid),
    env.DB.prepare("SELECT json_extract(m.data, ?) v FROM bc_mau m WHERE m.id = 1").bind('$.lich."' + uid + '".tong'),
  ]);
  const to = toR.results[0], cu = cuR.results[0];
  if (!to || to.deleted || to.role !== 'tieudoi') throw bad('Chỉ đặt ca cho tổ của một Tiểu đội trưởng đang dùng app');
  const tong = b.tong == null || b.tong === '' ? (cu && Number(cu.v)) || undefined : intIn(b.tong, 1, QS_TONG_MAX, 'Tổng quân số của tổ');
  const v = { ca, den, tong, ts: Date.now(), by: user.id };
  await env.DB.batch([
    env.DB.prepare(MAU_CO),
    env.DB.prepare("UPDATE bc_mau SET data = json_set(COALESCE(data, '{}'), ?, json(?)) WHERE id = 1").bind('$.lich."' + uid + '"', JSON.stringify(v)),
    auditStmt(env, user, 'qs_lich', { to: to.name, ca, den: den || undefined, tong: b.tong == null || b.tong === '' ? undefined : tong }),
    bump(env),
  ]);
  return json({ ok: true, user: uid, ...v });
}

/* Đặt SỐ THIẾT LẬP (CVKTHT trở lên), một tổ hoặc CẢ BẢNG trong MỘT request.
   body: { user, tong, s1, s2, ts } cho một tổ, hoặc { ds: [{ user, ca?, tong?, s1?, s2?, ts? }, ...] } cho cả bảng — bảng
   thiết lập bấm "Lưu tất cả" gửi mọi thay đổi (ca đặt hộ lẫn số) một lần. Trước đây mỗi thay đổi là một request riêng:
   mười tổ đổi cả ca lẫn số là hai mươi request, màn hình đứng ở "Đang lưu..." suốt lúc đó.
   Một mục có `ca` là đặt ca hộ tổ (giữ nguyên tổng tổ tự khai), có `tong` là đặt số thiết lập. ts là lần sửa mà người
   này đang nhìn thấy (0 nếu tổ chưa có số thiết lập): người khác đã sửa sau đó thì TỪ CHỐI CẢ LẦN LƯU, nói rõ ai sửa, số
   mới là gì. Cả lần lưu là một batch (một giao dịch): hoặc ghi hết, hoặc không ghi gì. D1: một lượt đọc, một lượt ghi. */
export async function qsThietLap(req, env, user) {
  const b = await readJson(req);
  const ds = Array.isArray(b.ds) ? b.ds : [b];
  if (!ds.length || ds.length > 200) throw bad('Không có gì để lưu');
  for (const x of ds) if (!x || !Number.isInteger(Number(x.user))) throw bad('Cần chọn tổ');
  const [toR, mauR] = await env.DB.batch([
    env.DB.prepare("SELECT id, name FROM users WHERE role = 'tieudoi' AND deleted = 0"),
    env.DB.prepare('SELECT data FROM bc_mau WHERE id = 1'),
  ]);
  const to = new Map(toR.results.map((u) => [u.id, u])), cfg = docCfg(mauR.results[0]);
  const now = Date.now(), chan = [], ghi = [], dat = (path, v) => env.DB.prepare("UPDATE bc_mau SET data = json_set(COALESCE(data, '{}'), ?, json(?)) WHERE id = 1").bind(path, JSON.stringify(v));
  let dau = null;
  for (const x of ds) {
    const uid = Number(x.user), t = to.get(uid);
    if (!t) throw bad('Chỉ thiết lập cho tổ của một Tiểu đội trưởng đang dùng app');
    if (x.ca != null) {
      const ca = Number(x.ca);
      if (![1, 2, 3].includes(ca)) throw bad('Chọn ca ngày, ca đêm hoặc cả hai ca');
      // đặt ca hộ: đến khi đổi, giữ nguyên tổng quân số tổ tự khai
      ghi.push(dat('$.lich."' + uid + '"', { ca, den: null, tong: (cfg.lich[uid] || {}).tong || undefined, ts: now, by: user.id }), auditStmt(env, user, 'qs_lich', { to: t.name, ca }));
    }
    if (x.tong == null || x.tong === '') continue;
    const tong = intIn(x.tong, 1, QS_TONG_MAX, 'Tổng quân số');
    const s1 = x.s1 == null || x.s1 === '' ? 0 : intIn(x.s1, 0, QS_TONG_MAX, 'Số đi làm ca ngày');
    const s2 = x.s2 == null || x.s2 === '' ? 0 : intIn(x.s2, 0, QS_TONG_MAX, 'Số đi làm ca đêm');
    const cu = Number(x.ts) || 0, path = '$.tl."' + uid + '"';
    if (((cfg.tl[uid] || {}).ts || 0) !== cu) throw await tlDaDoi(env, t.name, path);
    let ng1 = tlNghi(x, cfg.tl[uid], 1, t.name), ng2 = tlNghi(x, cfg.tl[uid], 2, t.name);
    const soN = (g) => Object.values(g.n || {}).reduce((a, v) => a + v, 0);
    // người nghỉ giữ lại từ bản cũ (app cũ không gửi) mà không còn vừa tổng thì bỏ, không chặn cả lần lưu
    if (s1 + s2 + soN(ng1) + soN(ng2) > tong) { if (ng1.giu) ng1 = {}; if (ng2.giu) ng2 = {}; }
    const het = s1 + s2 + soN(ng1) + soN(ng2);
    if (het > tong) throw bad(`${ds.length > 1 ? 'Tổ ' + t.name + ': đi' : 'Đi'} làm ngày ${s1} + đêm ${s2}${soN(ng1) + soN(ng2) ? ' + nghỉ ' + (soN(ng1) + soN(ng2)) : ''} = ${het}, nhiều hơn tổng quân số ${tong}`);
    const v = { tong, s1, s2, n1: ng1.n, n2: ng2.n, gc1: ng1.gc, gc2: ng2.gc, ts: Math.max(now, cu + 1), by: user.id };
    // chặn lần nữa ngay trong batch: giữa lượt đọc ở trên và lượt ghi vẫn có thể có người khác lưu
    chan.push([guardStmt(env, "EXISTS (SELECT 1 FROM bc_mau WHERE id = 1 AND COALESCE(json_extract(data, ?1), 0) <> ?2)", path + '.ts', cu), t.name, path, uid, cu]);
    ghi.push(dat(path, v), auditStmt(env, user, 'qs_thietlap', { to: t.name, tong, s1, s2, n1: v.n1, n2: v.n2 }));
    if (!dau) dau = { user: uid, ...v };
  }
  if (!ghi.length) throw bad('Không có gì để lưu');
  const sau = [env.DB.prepare(MAU_CO), ...ghi, bump(env)];
  if (!chan.length) await env.DB.batch(sau);
  else {
    try { await batchGuarded(env, chan[0][0], [...chan.slice(1).map((c) => c[0]), ...sau], new HttpError(409, 'doi', 'doi')); }
    catch (e) {
      if (!(e instanceof HttpError) || e.code !== 'doi') throw e;
      // tìm tổ vừa bị người khác sửa để nói cho đúng
      const moi = docCfg(await env.DB.prepare('SELECT data FROM bc_mau WHERE id = 1').first());
      const c = chan.find(([, , , uid, cu]) => ((moi.tl[uid] || {}).ts || 0) !== cu) || chan[0];
      throw await tlDaDoi(env, c[1], c[2]);
    }
  }
  return json({ ok: true, n: ghi.length / 2, ...(dau || {}) });
}
/* NGƯỜI NGHỈ trong số thiết lập, theo từng ca: x.n1 / x.n2 = { mã lý do: số người } (như cột nghi của quan_so), x.gc1 /
   x.gc2 = ghi chú của "lý do khác" (bắt buộc khi có, không có thì không lưu). s1 / s2 là SỐ ĐI LÀM của ca, người nghỉ
   ghi riêng NGOÀI số đó: đi làm ngày + đi làm đêm + nghỉ ≤ tổng (kiểm ở qsThietLap). Nhờ vậy báo cáo ca của tổ chưa
   báo ghi được "ca ngày 17/19 cn, nghỉ 2 cn — 1 ốm, 1 về quê" đúng như số CVKTHT gõ.
   Không gửi n (bản app cũ) thì giữ người nghỉ đang có (giu: bỏ đi nếu không còn vừa tổng). */
function tlNghi(x, cu, ca, tenTo) {
  const vao = x['n' + ca], ten = CA_TEN[ca];
  if (vao === undefined) {
    const n = (cu && cu['n' + ca]) || {};
    return Object.keys(n).length ? { n, gc: (n.khac && cu['gc' + ca]) || undefined, giu: true } : {};
  }
  const o = vao && typeof vao === 'object' && !Array.isArray(vao) ? vao : {};
  if (Object.keys(o).some((k) => !QS_LY_DO.some((l) => l[0] === k))) throw bad('Lý do nghỉ không hợp lệ');
  const n = {};
  for (const [ma, lyDo] of QS_LY_DO) {
    const so = o[ma] == null || o[ma] === '' ? 0 : intIn(o[ma], 0, QS_TONG_MAX, 'Số người nghỉ (' + lyDo + ')');
    if (so) n[ma] = so;
  }
  const tong = Object.values(n).reduce((a, v) => a + v, 0);
  if (!tong) return {};
  // ghi chú chỉ đi kèm "lý do khác": ghi chú còn sót khi đã bỏ lý do khác thì báo cáo ghi lặp ("1 về quê, Về quê")
  const gc = (n.khac && chu(x['gc' + ca], 200)) || undefined;
  if (n.khac && !gc) throw bad(`Tổ ${tenTo}: có người nghỉ ${ten} vì lý do khác, ghi rõ lý do`);
  return { n, gc };
}
// lời từ chối khi số thiết lập của một tổ đã bị người khác sửa: ai sửa, số mới là gì
async function tlDaDoi(env, tenTo, path) {
  const r = await env.DB.prepare("SELECT json_extract(m.data, ?1) v, (SELECT name FROM users WHERE id = json_extract(m.data, ?1 || '.by')) ai FROM bc_mau m WHERE m.id = 1").bind(path).first();
  const m = r && r.v ? JSON.parse(r.v) : null;
  return new HttpError(409, m ? `${(r && r.ai) || 'Người khác'} vừa sửa số thiết lập tổ ${tenTo}: tổng ${m.tong}, ca ngày ${m.s1}, ca đêm ${m.s2}. Màn hình đã tải lại số mới, xem rồi sửa lại nếu cần.` : 'Số thiết lập vừa đổi. Tải lại rồi sửa lại.', 'changed');
}

/* Xếp thứ tự tổ (CVKTHT trở lên). ids: id các Tiểu đội trưởng theo thứ tự mới. Lưu vào mẫu báo cáo, giữ nguyên
   các phần khác của mẫu. */
export async function qsThuTu(req, env, user) {
  const b = await readJson(req);
  const ids = Array.isArray(b.ids) ? [...new Set(b.ids.map(Number).filter((x) => Number.isInteger(x) && x > 0))].slice(0, 200) : null;
  if (!ids) throw bad('Thứ tự tổ không hợp lệ');
  await env.DB.batch([
    env.DB.prepare(MAU_CO),
    env.DB.prepare("UPDATE bc_mau SET data = json_set(COALESCE(data, '{}'), '$.thu_tu', json(?)) WHERE id = 1").bind(JSON.stringify(ids)),
    auditStmt(env, user, 'qs_thutu', { n: ids.length }),
    bump(env),
  ]);
  return json({ ok: true, n: ids.length });
}

/* Phần cho /bootstrap, để Tổng quan nhắc: tổ nào đã báo ca ĐANG DIỄN RA và ca KẾ TIẾP, hạn báo của hai ca,
   và mỗi tổ đang làm ca nào (ca: [1], [2], [1, 2] hoặc [] = chưa biết) để không nhắc tổ ca đêm báo ca ngày.
   Gửi cả ca kế vì app hay nằm mở qua giờ giao ca: qua mốc `den` thì máy khách tự chuyển sang nhìn cột ca kế,
   không nhắc nhầm theo ca cũ trong lúc chờ tải lại. Tiểu đội trưởng chỉ nhận dòng của tổ mình.
   Câu lệnh lấy các dòng từ hôm qua (đủ cho ca đang diễn ra và ca kế) cộng DÒNG GẦN NHẤT của từng tổ (l, tìm
   thẳng theo index): tổ nghỉ báo vài hôm vẫn biết đang làm ca nào. */
export const qsBootStmt = (env) => env.DB.prepare(
  `SELECT u.id, u.name, q.ngay, q.ca, q.lam, q.ca_kia, l.ngay lngay, l.ca lca, l.lam llam, l.ca_kia lkia
   FROM users u LEFT JOIN quan_so q ON q.user_id = u.id AND q.ngay >= ?
   LEFT JOIN quan_so l ON l.rowid = (SELECT x.rowid FROM quan_so x WHERE x.user_id = u.id ORDER BY x.ngay DESC, x.ca DESC LIMIT 1)
   WHERE u.role = 'tieudoi' AND u.deleted = 0 ORDER BY ${TO_SX}`).bind(vnDay(Date.now() - NGAY));
/* Báo cáo ca đã chép cho ca nào (từ hôm qua), để thẻ "Soạn báo cáo ca" của CVKTHT thôi nhắc khi đã chép. */
export const bcDaStmt = (env) => env.DB.prepare('SELECT ngay, ca FROM bao_cao_ca WHERE ngay >= ?').bind(vnDay(Date.now() - NGAY));
/* Mấy lần báo gần nhất của CHÍNH người đang xem (mới nhất trước), cho thẻ báo quân số ngay trên Tổng quan của
   Tiểu đội trưởng: dòng đã báo ở ca đang diễn ra / ca kế, tổng quân số lần trước, và lần báo trước của từng ca
   để nút "Như hôm qua" lấy lại danh sách nghỉ. Sáu dòng là đủ cả với tổ báo hai ca mỗi ngày. */
export const qsToiStmt = (env, user) => env.DB.prepare(
  'SELECT ngay, ca, tong, lam, ca_kia, nghi, ghi_chu, ts FROM quan_so WHERE user_id = ? ORDER BY ngay DESC, ca DESC LIMIT 6').bind(user.id);
function qsToi(mine, hien, ke) {
  const cua = mine.map((r) => ({ ...r, nghi: docNghi(r.nghi) }));
  const tim = (c) => cua.find((r) => caKhoa(r) === caKhoa(c)) || null;
  // lần báo trước của CÙNG ca; tổ vừa đổi ca thì chưa có, lấy lần báo trước bất kỳ
  const truoc = (c) => cua.find((r) => r.ca === c.ca && caKhoa(r) < caKhoa(c)) || cua.find((r) => caKhoa(r) < caKhoa(c)) || null;
  /* Ca cố định: hai lần báo gần nhất cùng một ca, cả tổ làm ca đó (không chia ca). Khi đó thẻ chỉ bày nút báo ca
     đó; ca kia thu vào một dòng nhỏ — tổ làm một ca 15–30 ngày liền, nút ca kia chỉ để bấm nhầm. */
  const [a, z] = cua, motCa = (r) => r && r.lam > 0 && !r.ca_kia;
  const coDinh = motCa(a) && motCa(z) && a.ca === z.ca ? a.ca : 0;
  return { tong: cua.length ? cua[0].tong : 0, hien: tim(hien), ke: tim(ke), truocHien: truoc(hien), truocKe: truoc(ke), coDinh };
}
export function qsBoot(rows, st, user, mine = [], bcDa = [], cfgRow = null) {
  const cfg = docCfg(cfgRow);
  const hien = caLuc(st), ke = caKe(hien), to = new Map();
  for (const r of rows) {
    const t = to.get(r.id) || { id: r.id, name: r.name, da: false, daKe: false, ds: r.lngay ? [{ ngay: r.lngay, ca: r.lca, lam: r.llam, ca_kia: r.lkia }] : [] };
    if (r.ngay && caKhoa(r) === caKhoa(hien)) t.da = true;
    if (r.ngay && caKhoa(r) === caKhoa(ke)) t.daKe = true;
    if (r.ngay) t.ds.push(r);
    to.set(r.id, t);
  }
  /* Ca của tổ: theo LỊCH CA nếu đã đặt và còn hạn; chưa đặt thì đoán theo lần báo gần nhất như trước. */
  const ds = [...to.values()].map(({ ds: d, ...t }) => { const l = caLich(cfg, t.id, hien.ngay); return { ...t, ca: l ? caMang(l) : caCua(d.filter((r) => r.ngay === d[0].ngay)), lich: l }; });
  const lt = cfg.lich[user.id], toi = user.role === 'tieudoi' ? qsToi(mine, hien, ke) : null;
  // tổng quân số của tổ: số tổ tự khai nếu khai SAU lần báo gần nhất, không thì theo lần báo gần nhất
  if (toi && lt && lt.tong && (!mine.length || lt.ts > mine[0].ts || !toi.tong)) toi.tong = lt.tong;
  return { hien, ke, den: caGio(st, hien).den, han: caHan(st, hien), hanKe: caHan(st, ke), to: capOf(user.role) >= 1 ? ds : ds.filter((t) => t.id === user.id),
    lyDo: QS_LY_DO, toi: toi ? { ...toi, lich: lt ? { ca: lt.ca, den: lt.den || null, het: !caLich(cfg, user.id, hien.ngay), ...(lt.tong ? { tong: lt.tong } : {}) } : null } : undefined,
    // ca đang diễn ra đã chép báo cáo ca chưa (chỉ cần cho CVKTHT trở lên)
    bcDa: capOf(user.role) >= 1 && bcDa.some((r) => caKhoa(r) === caKhoa(hien)) };
}

/* ========================= THỐNG KÊ QUÂN SỐ =========================
   Màn riêng, không dính tới báo cáo ca. Đếm theo CÔNG (một người trong một ca). Số của mỗi tổ, mỗi ca lấy theo thứ
   tự: dòng tổ tự báo (quan_so) → số thiết lập đã chép lúc hết ca (quan_so_tl) → ca thiếu số. Việc cộng và tính phần
   trăm làm ở máy khách (lọc ca ngày / ca đêm không phải hỏi lại máy chủ). OFF luân phiên tính là nghỉ.
   % nghỉ = công nghỉ ÷ (công đi làm + công nghỉ); của toàn bộ thì cộng công mọi tổ rồi mới chia. */
export const QS_NGUONG_MAC = 15;
const TK_NGAY_MAX = 124;
const caTruoc = (c) => (c.ca === 2 ? { ngay: c.ngay, ca: 1 } : { ngay: congNgay(c.ngay, -1), ca: 2 });

/* LƯU SỐ CỦA CA TỔ KHÔNG BÁO, chạy theo lịch mỗi giờ. Số thiết lập và lịch ca chỉ có một bản, sửa là mất số cũ, nên
   hết ca nào chép lại ngay ca đó: tổ LÀM ca đó (theo lịch ca; chưa đặt lịch thì theo số thiết lập có người ca đó) mà
   không có dòng quan_so thì ghi một dòng quan_so_tl — có số thiết lập thì lấy số đó (đi làm = số người ca − nghỉ),
   không có thì để trống (ca thiếu số). Lịch ca đặt sau lúc hết ca thì bỏ qua ca đó (không chép ngược). Xét ba ca gần nhất đã hết: lịch chạy lỡ vài giờ vẫn bù được. INSERT OR IGNORE:
   lần chép đầu tiên sau giờ hết ca là lần giữ lại. */
/* Tổ `id` có LÀM ca `c` không (theo lịch ca; chưa đặt lịch thì theo số thiết lập có người ca đó), và số của ca đó theo
   số thiết lập. Lịch ca (hoặc số thiết lập, khi chưa đặt lịch) đặt SAU mốc `het` thì không biết lúc đó tổ có làm ca này
   không: null. Kết quả: { tong, lam, nghi, ghi_chu } — tong / lam null nếu tổ làm ca này mà chưa có số thiết lập.
   Dùng chung cho việc chép lúc hết ca (qsChotCa) và số tạm của ca đang diễn ra trên màn thống kê (qsThongKe). */
function soTlCa(cfg, id, c, het) {
  // s: số ĐI LÀM của ca theo số thiết lập; người nghỉ ghi riêng ngoài số đó
  const tl = cfg.tl[id], s = tl ? Number(tl['s' + c.ca]) || 0 : 0, nghi = (tl && tl['n' + c.ca]) || {}, so = Object.values(nghi).reduce((a, v) => a + v, 0), co = s + so > 0;
  const L = caLich(cfg, id, c.ngay);
  if (L ? L !== 3 && L !== c.ca : !co) return null;
  if ((L ? cfg.lich[id].ts : tl.ts) > het) return null;
  return { tong: co ? tl.tong : null, lam: co ? s : null, nghi: co ? nghi : {}, ghi_chu: (co && nghi.khac && tl['gc' + c.ca]) || null };
}
export async function qsChotCa(env, now = Date.now()) {
  const cas = [];
  const [stR, toR, cfgR] = await env.DB.batch([
    env.DB.prepare(SETTINGS_SQL),
    env.DB.prepare("SELECT id FROM users WHERE role = 'tieudoi' AND deleted = 0"),
    env.DB.prepare('SELECT data FROM bc_mau WHERE id = 1'),
  ]);
  if (!toR.results.length) return 0;
  const st = parseSettings(stR.results), cfg = docCfg(cfgR.results[0]);
  for (let c = caTruoc(caLuc(st, now)); cas.length < 3; c = caTruoc(c)) cas.push(c);
  const tu = cas[cas.length - 1].ngay;
  const [coR, daR] = await env.DB.batch([
    env.DB.prepare('SELECT ngay, ca, user_id FROM quan_so WHERE ngay >= ?').bind(tu),
    env.DB.prepare('SELECT ngay, ca, user_id FROM quan_so_tl WHERE ngay >= ?').bind(tu),
  ]);
  const co = new Set(coR.results.concat(daR.results).map((r) => r.ngay + ':' + r.ca + ':' + r.user_id));
  const ghi = [];
  for (const c of cas) {
    for (const { id } of toR.results) {
      if (co.has(caKhoa(c) + ':' + id)) continue;
      // tổ không làm ca này, chưa biết làm ca nào, hoặc lịch ca đặt sau lúc hết ca (không chép ngược)
      const x = soTlCa(cfg, id, c, caGio(st, c).den);
      if (!x) continue;
      ghi.push(env.DB.prepare('INSERT OR IGNORE INTO quan_so_tl (ngay, ca, user_id, tong, lam, nghi, ghi_chu, ts) VALUES (?,?,?,?,?,?,?,?)')
        .bind(c.ngay, c.ca, id, x.tong, x.lam, JSON.stringify(x.nghi), x.ghi_chu, now));
    }
  }
  if (ghi.length) await env.DB.batch(ghi);
  return ghi.length;
}

/* Số liệu thô cho màn thống kê, một khoảng ngày (tối đa 124 ngày: tháng đang xem và ba tháng trước để so sánh — với 3
   ngày trước, TB tháng khi xem ngày; với 3 tháng trước khi xem tháng). Tiểu đội
   trưởng chỉ nhận tổ mình. Kèm danh sách tổ (cả tổ đã thôi nhưng có số trong khoảng này) theo thứ tự tổ, và ngưỡng
   tô đỏ.
   SỐ TẠM (tam): ca ĐANG DIỄN RA hoặc vừa hết mà lịch chạy chưa kịp chép — tổ làm ca đó chưa báo, có số thiết lập — thì
   gửi kèm số thiết lập lúc này, như báo cáo ca đang dùng. Nhờ vậy thống kê hôm nay khớp số với báo cáo ca. Tổ chưa có số
   thiết lập thì không có số tạm (chỉ thành "thiếu số" khi hết ca). */
export async function qsThongKe(env, user, url) {
  const q = url.searchParams, tu = docCa(q.get('tu'), 1).ngay, den = docCa(q.get('den'), 1).ngay;
  if (den < tu) throw bad('Khoảng ngày không hợp lệ');
  if ((Date.parse(den) - Date.parse(tu)) / NGAY >= TK_NGAY_MAX) throw bad(`Xem tối đa ${TK_NGAY_MAX} ngày một lần`);
  const ql = capOf(user.role) >= 1, rieng = ql ? '' : ' AND user_id = ?3', kem = ql ? [] : [user.id];
  const [toR, qsR, tlR, ngR, stR, cfgR, tdtR] = await env.DB.batch([
    env.DB.prepare(`SELECT u.id, u.name, u.deleted FROM users u WHERE ${ql ? `(u.role = 'tieudoi' AND u.deleted = 0)
                      OR u.id IN (SELECT user_id FROM quan_so WHERE ngay BETWEEN ?1 AND ?2 UNION SELECT user_id FROM quan_so_tl WHERE ngay BETWEEN ?1 AND ?2)` : 'u.id = ?3'}
                    ORDER BY ${TO_SX}`).bind(tu, den, ...kem),
    env.DB.prepare(`SELECT ngay, ca, user_id u, tong, lam, nghi, ghi_chu FROM quan_so WHERE ngay BETWEEN ?1 AND ?2${rieng}`).bind(tu, den, ...kem),
    env.DB.prepare(`SELECT ngay, ca, user_id u, tong, lam, nghi, ghi_chu FROM quan_so_tl WHERE ngay BETWEEN ?1 AND ?2${rieng}`).bind(tu, den, ...kem),
    env.DB.prepare("SELECT value FROM settings WHERE key = 'qs_nguong'"),
    env.DB.prepare(SETTINGS_SQL),
    env.DB.prepare('SELECT data FROM bc_mau WHERE id = 1'),
    env.DB.prepare(`SELECT id FROM users WHERE role = 'tieudoi' AND deleted = 0${ql ? '' : ' AND id = ?'}`).bind(...kem),
  ]);
  const dong = (rs) => rs.map((r) => ({ ...r, nghi: docNghi(r.nghi) }));
  const ng = ngR.results[0] ? Number(ngR.results[0].value) : QS_NGUONG_MAC;
  // số tạm: ca đang diễn ra và hai ca liền trước (vừa hết, lịch mỗi giờ có thể chưa chép)
  const st = parseSettings(stR.results), cfg = docCfg(cfgR.results[0]), now = Date.now(), tam = [];
  const co = new Set(qsR.results.concat(tlR.results).map((r) => r.ngay + ':' + r.ca + ':' + r.u));
  for (let c = caLuc(st, now), i = 0; i < 3; c = caTruoc(c), i++) {
    if (c.ngay < tu || c.ngay > den) continue;
    for (const { id } of tdtR.results) {
      if (co.has(caKhoa(c) + ':' + id)) continue;
      const x = soTlCa(cfg, id, c, caGio(st, c).den);
      if (x && x.lam != null) tam.push({ ngay: c.ngay, ca: c.ca, u: id, ...x, tam: 1 });
    }
  }
  return json({ tu, den, lyDo: QS_LY_DO, nguong: ng >= 1 && ng <= 100 ? ng : QS_NGUONG_MAC, to: toR.results, qs: dong(qsR.results), tl: dong(tlR.results), tam });
}

// Đổi ngưỡng tô đỏ của màn thống kê (CVKTHT trở lên): % nghỉ từ mức này trở lên thì tô đỏ.
export async function qsNguong(req, env, user) {
  const b = await readJson(req), pct = intIn(b.pct, 1, 100, 'Ngưỡng % nghỉ');
  await env.DB.batch([
    env.DB.prepare("INSERT INTO settings (key, value) VALUES ('qs_nguong', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(String(pct)),
    auditStmt(env, user, 'qs_nguong', { pct }),
    bump(env),
  ]);
  return json({ ok: true, pct });
}
