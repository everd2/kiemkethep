// Quân số đầu ca: mỗi tổ (Tiểu đội trưởng) báo số đi làm, số nghỉ và lý do nghỉ ở đầu mỗi ca.
import { DAY_RE, HttpError, bad, capOf, fmtDay, json, vnDay } from './core.js';
import { CA_DEFAULT, SETTINGS_SQL, auditStmt, bump, intIn, parseSettings, readJson } from './helpers.js';

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
  const [tdt, rows, truoc, cuaToi, truocCa] = await env.DB.batch([
    env.DB.prepare(`SELECT u.id, u.name FROM users u WHERE u.role = 'tieudoi' AND u.deleted = 0${rieng(1)} ORDER BY ${TO_SX}`).bind(...kem),
    env.DB.prepare(`SELECT q.ngay, q.ca, q.user_id, q.tong, q.lam, q.ca_kia, q.nghi, q.ghi_chu, q.ts, q.by_id,
                      COALESCE(u.name, '(đã xoá)') uname, COALESCE(b.name, '(đã xoá)') by_name
                    FROM quan_so q LEFT JOIN users u ON u.id = q.user_id LEFT JOIN users b ON b.id = q.by_id
                    WHERE q.ngay = ?1${ql ? '' : ' AND q.user_id = ?2'} ORDER BY uname, q.ca`).bind(c.ngay, ...kem),
    env.DB.prepare(`SELECT q.user_id, q.ngay, q.ca, q.tong, q.lam, q.ca_kia FROM users u JOIN quan_so q ON q.rowid = (
                      SELECT x.rowid FROM quan_so x WHERE x.user_id = u.id AND (x.ngay < ?1 OR (x.ngay = ?1 AND x.ca < ?2))
                      ORDER BY x.ngay DESC, x.ca DESC LIMIT 1)
                    WHERE u.role = 'tieudoi' AND u.deleted = 0${rieng(3)}`).bind(c.ngay, c.ca, ...kem),
    // dòng của chính người đang xem ở ca đang diễn ra và ca kế: màn CHỌN CA của Tiểu đội trưởng ghi ca nào đã báo
    env.DB.prepare('SELECT ngay, ca, tong, lam, ca_kia, nghi, ghi_chu, ts FROM quan_so WHERE user_id = ?1 AND ((ngay = ?2 AND ca = ?3) OR (ngay = ?4 AND ca = ?5))')
      .bind(user.id, hien.ngay, hien.ca, ke.ngay, ke.ca),
    /* Lần báo gần nhất CÙNG CA của từng tổ, đủ cả lý do nghỉ: nút ghi nhanh "Như lần trước" và "Đủ quân" trên bảng
       của CVKTHT dựng lại đúng lần đó (tổ chia ca giữ nguyên số người ca kia). */
    env.DB.prepare(`SELECT q.user_id, q.ngay, q.ca, q.tong, q.lam, q.ca_kia, q.nghi, q.ghi_chu FROM users u JOIN quan_so q ON q.rowid = (
                      SELECT x.rowid FROM quan_so x WHERE x.user_id = u.id AND x.ca = ?2 AND x.ngay < ?1 ORDER BY x.ngay DESC LIMIT 1)
                    WHERE u.role = 'tieudoi' AND u.deleted = 0${rieng(3)}`).bind(c.ngay, c.ca, ...kem),
  ]);
  const hm = hanMoc(st);
  return json({
    ngay: c.ngay, ca: c.ca, hien, ke, gio: caGio(st, c), han: caHan(st, c), hanPhut: hm, lyDo: QS_LY_DO, tongMax: QS_TONG_MAX,
    /* Hai ca báo được lúc này — luôn là một ca ngày và một ca đêm. Tiểu đội trưởng PHẢI tự chọn ca trước khi
       báo (app không tự chọn hộ theo giờ): tổ ca đêm mở app lúc 17h không được báo nhầm vào ca ngày. */
    chon: [hien, ke].map((x) => {
      const r = cuaToi.results.find((y) => y.ngay === x.ngay && y.ca === x.ca);
      return { ...x, gio: caGio(st, x), han: caHan(st, x), row: r ? { ...r, nghi: docNghi(r.nghi) } : null };
    }),
    tdt: tdt.results, rows: rows.results.map((r) => ({ ...r, nghi: docNghi(r.nghi) })), truoc: truoc.results,
    truocCa: truocCa.results.map((r) => ({ ...r, nghi: docNghi(r.nghi) })),
    // cùng luật với qsPut, để máy khách khỏi bày nút bấm vào là bị từ chối
    suaDuoc: ql ? c.ngay >= vnDay(Date.now() - QS_SUA_NGAY * NGAY) : caKhoa(c) >= caKhoa(hien),
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
  const st = parseSettings((await env.DB.prepare(SETTINGS_SQL).all()).results);
  const hien = caLuc(st);
  if (caKhoa(c) > caKhoa(caKe(hien))) throw bad('Chưa tới ' + caGoi(c) + ': chỉ báo trước được một ca');
  if (!ql && caKhoa(c) < caKhoa(hien)) throw new HttpError(409, CA_TEN[c.ca][0].toUpperCase() + caGoi(c).slice(1) + ' đã qua. Nhờ CVKTHT trở lên sửa giúp.', 'qua');
  if (ql && c.ngay < vnDay(Date.now() - QS_SUA_NGAY * NGAY)) throw bad(`Chỉ sửa được quân số trong ${QS_SUA_NGAY} ngày gần đây`);
  // tổ đã có dòng ở ca này thì sửa được dù người đó vừa thôi làm Tiểu đội trưởng; ghi MỚI thì chỉ cho tổ đang có
  const to = await env.DB.prepare(
    `SELECT u.id, u.name, u.role, u.deleted, EXISTS (SELECT 1 FROM quan_so q WHERE q.ngay = ?2 AND q.ca = ?3 AND q.user_id = u.id) co
     FROM users u WHERE u.id = ?1`).bind(uid, c.ngay, c.ca).first();
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

/* Xếp thứ tự tổ (CVKTHT trở lên). ids: id các Tiểu đội trưởng theo thứ tự mới. Lưu vào mẫu báo cáo, giữ nguyên
   các phần khác của mẫu. */
export async function qsThuTu(req, env, user) {
  const b = await readJson(req);
  const ids = Array.isArray(b.ids) ? [...new Set(b.ids.map(Number).filter((x) => Number.isInteger(x) && x > 0))].slice(0, 200) : null;
  if (!ids) throw bad('Thứ tự tổ không hợp lệ');
  const r = await env.DB.prepare('SELECT data FROM bc_mau WHERE id = 1').first();
  const d = docNghi(r && r.data);
  d.thu_tu = ids;
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO bc_mau (id, data, ts, by_id) VALUES (1, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET data = excluded.data, ts = excluded.ts, by_id = excluded.by_id`).bind(JSON.stringify(d), Date.now(), user.id),
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
export function qsBoot(rows, st, user, mine = [], bcDa = []) {
  const hien = caLuc(st), ke = caKe(hien), to = new Map();
  for (const r of rows) {
    const t = to.get(r.id) || { id: r.id, name: r.name, da: false, daKe: false, ds: r.lngay ? [{ ngay: r.lngay, ca: r.lca, lam: r.llam, ca_kia: r.lkia }] : [] };
    if (r.ngay && caKhoa(r) === caKhoa(hien)) t.da = true;
    if (r.ngay && caKhoa(r) === caKhoa(ke)) t.daKe = true;
    if (r.ngay) t.ds.push(r);
    to.set(r.id, t);
  }
  const ds = [...to.values()].map(({ ds: d, ...t }) => ({ ...t, ca: caCua(d.filter((r) => r.ngay === d[0].ngay)) }));
  return { hien, ke, den: caGio(st, hien).den, han: caHan(st, hien), hanKe: caHan(st, ke), to: capOf(user.role) >= 1 ? ds : ds.filter((t) => t.id === user.id),
    lyDo: QS_LY_DO, toi: user.role === 'tieudoi' ? qsToi(mine, hien, ke) : undefined,
    // ca đang diễn ra đã chép báo cáo ca chưa (chỉ cần cho CVKTHT trở lên)
    bcDa: capOf(user.role) >= 1 && bcDa.some((r) => caKhoa(r) === caKhoa(hien)) };
}
