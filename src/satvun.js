// Sổ xuất sắt vụn ra ngoài bãi: ghi nhớ, thống kê, đối chiếu (không tính vào tồn).
import { CAP_TREN, DAY_RE, HttpError, bad, capOf, daysBetween, duyetCap, duyetCuaNguoi, fmtDay, json, vnDay } from './core.js';
import { CSV_HEAD, UNAME, auditStmt, batchGuarded, bump, csvDec, csvRow, guardStmt, readJson } from './helpers.js';
import { bbKhoa } from './loans.js';

/* ========================= SẮT VỤN XUẤT RA NGOÀI =========================
   Sắt vụn là thép thừa, đầu mẩu TRỘN NHIỀU PHI, nên chỉ có KHỐI LƯỢNG (cân theo tấn), không có số cây.
   Nó KHÔNG nằm trong tồn kho: bảng đếm và phiếu kho đều tính theo phi, phần thép thành vụn đã ra khỏi
   tồn từ lúc cắt (nằm trong "đã dùng"). Vì vậy sổ này không đụng tới counts / receipts — chỉ ghi lại MỖI
   LẦN xuất vụn ra cổng: ngày, khu nào, bao nhiêu tấn, cho ai, phiếu cân số mấy, xe nào. Để thống kê
   (tháng này / năm nay xuất bao nhiêu, theo khu, theo nơi nhận) và đối chiếu với phiếu cân của bên mua.
   Ghi và duyệt giống sổ vay mượn: ai cũng ghi được (người ở cổng thường là người thấy xe ra), duyệt theo
   cấp bậc, chưa duyệt thì chưa vào thống kê. Khối lượng lưu theo KG nguyên để cộng không lệch số lẻ. */
export const SV_KG_MAX = 1000000; // một lần xuất tối đa 1.000 tấn: quá thì gần như chắc gõ nhầm đơn vị
const SV_VOID_DAYS = 7;

/* tấn gõ tay → kg nguyên. Nhận "2,5" và "2.5"; số có cả hai dấu (1.250,5) thì không đoán, từ chối. Tối đa
   BA số lẻ (tới từng kg): gõ 2,6755 mà lặng lẽ làm tròn thành 2.676 kg thì sổ lệch phiếu cân không ai hay. */
export function tanToKg(v) {
  const s = String(v == null ? '' : v).trim().replace(/\s/g, '');
  if (!/^\d+([.,]\d{1,3})?$/.test(s)) return NaN;
  return Math.round(Number(s.replace(',', '.')) * 1000);
}

export async function postSv(req, env, user) {
  const b = await readJson(req);
  const today = vnDay();
  const ngay = b.ngay == null || b.ngay === '' ? today : String(b.ngay);
  if (!DAY_RE.test(ngay) || ngay > today) throw bad('Ngày xuất không hợp lệ (không được sau hôm nay)');
  if (daysBetween(ngay, today) > 366) throw bad('Ngày xuất quá xa (hơn một năm trước). Kiểm tra lại năm');
  const kg = tanToKg(b.tan);
  if (!(kg >= 1 && kg <= SV_KG_MAX)) throw bad('Khối lượng không hợp lệ: ghi số tấn, ví dụ 2,5 — tối đa ba số lẻ (tới kg), tối đa 1.000 tấn một lần');
  // khu: khu xuất vụn; để trống = gom từ nhiều khu / chung cả bãi
  let khuId = null;
  if (b.khu) {
    const k = await env.DB.prepare('SELECT id FROM khu WHERE id = ? AND active = 1').bind(String(b.khu)).first();
    if (!k) throw bad('Khu không hợp lệ');
    khuId = k.id;
  }
  let noi = String(b.noi || '').normalize('NFC').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!noi) throw bad('Phải ghi xuất cho ai (đơn vị mua / nơi nhận)');
  /* Cùng một nơi nhận mà gõ khác hoa/thường ("Cty A" / "cty a") thì thống kê theo nơi nhận tách thành hai dòng.
     Tên đã có trong sổ (lần ghi chưa huỷ, cách viết đầu tiên) thì dùng lại đúng cách viết đó. So trong JavaScript
     vì SQLite không gộp hoa/thường của chữ có dấu. Gõ sai tên ngay lần đầu thì huỷ lần đó rồi ghi lại. */
  const khoaNoi = (x) => String(x).normalize('NFC').toLowerCase();
  const coSan = (await env.DB.prepare('SELECT noi FROM satvun WHERE voided = 0 GROUP BY noi ORDER BY MIN(id)').all()).results.find((x) => khoaNoi(x.noi) === khoaNoi(noi));
  if (coSan) noi = coSan.noi;
  const soPhieu = String(b.so_phieu || '').trim().slice(0, 40);
  if (!soPhieu) throw bad('Cần ghi số phiếu cân / biên bản giao nhận');
  /* Cùng số phiếu cân với một lần xuất chưa huỷ thì gần như chắc là ghi hai lần (hai người cùng chép, hoặc
     mất mạng rồi bấm lại). Dừng lại hỏi như sổ vay; xác nhận thì gửi lại kèm trung: true. So không kể dấu
     cách, gạch, hoa/thường. */
  if (b.trung !== true) {
    const khoa = bbKhoa(soPhieu);
    const tr = (await env.DB.prepare(
      `SELECT s.ngay, s.kg, s.noi, s.so_phieu, s.duyet_ts, ${UNAME} FROM satvun s LEFT JOIN users u ON u.id = s.user_id
       WHERE s.voided = 0 ORDER BY s.id DESC LIMIT 3000`
    ).all()).results.filter((x) => bbKhoa(x.so_phieu) === khoa);
    if (tr.length) {
      const x = tr[0];
      throw new HttpError(409, `Phiếu cân số ${x.so_phieu} đã có trong sổ: ${fmtDay(x.ngay)} · ${(x.kg / 1000).toFixed(3).replace('.', ',')} tấn cho ${x.noi}`
        + ` (${x.uname} ghi, ${x.duyet_ts ? 'đã duyệt' : 'đang chờ duyệt'}). Nếu đây đúng là một lần xuất khác thì xác nhận để ghi thêm.`, 'trung_sv');
    }
  }
  const bienSo = String(b.bien_so || '').trim().slice(0, 20);
  const nguoi = String(b.nguoi || '').trim().slice(0, 60);
  const note = String(b.note || '').trim().slice(0, 200);
  const ts = Date.now();
  const res = await env.DB.batch([
    env.DB.prepare(`INSERT INTO satvun (ngay, khu_id, kg, noi, so_phieu, bien_so, nguoi, note, user_id, ts, cap)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(ngay, khuId, kg, noi, soPhieu, bienSo || null, nguoi || null, note || null, user.id, ts, capOf(user.role)),
    auditStmt(env, user, 'sv_ghi', { ngay, khu: khuId, kg, noi, so_phieu: soPhieu, ...(bienSo ? { bien_so: bienSo } : {}), ...(note ? { note } : {}) }),
    bump(env),
  ]);
  return json({ ok: true, id: res[0].meta.last_row_id });
}

// tóm tắt một lần xuất cho nhật ký duyệt / huỷ: đọc lại nhật ký phải biết vừa duyệt lần nào
const svInfo = (r) => ({ id: r.id, ngay: r.ngay, khu: r.khu_id, kg: r.kg, noi: r.noi, so_phieu: r.so_phieu });

/* Ghi chỉ khi dòng vẫn ở đúng trạng thái vừa đọc: hai người cùng bấm duyệt, hoặc người này huỷ đúng lúc
   người kia duyệt, thì người sau nhận "vừa đổi" — không ghi nhật ký thừa, không duyệt một dòng đã huỷ. */
async function ghiNeuChuaDoi(env, id, duyetTs, stmts) {
  const DOI = new HttpError(409, 'Lần xuất này vừa được người khác duyệt hoặc huỷ. Xem lại rồi làm tiếp.', 'changed');
  return batchGuarded(env, guardStmt(env, 'NOT EXISTS (SELECT 1 FROM satvun WHERE id = ? AND voided = 0 AND COALESCE(duyet_ts, 0) = ?)', id, duyetTs || 0), stmts, DOI);
}

export async function duyetSv(env, user, id) {
  const r = await env.DB.prepare('SELECT * FROM satvun WHERE id = ?').bind(id).first();
  if (!r) throw new HttpError(404, 'Không tìm thấy lần xuất sắt vụn');
  if (r.voided) throw bad('Lần xuất này đã bị huỷ, không duyệt được');
  if (r.duyet_ts) throw bad('Lần xuất này đã được duyệt');
  if (!duyetCuaNguoi(user, r.cap, [r.user_id])) throw new HttpError(403, `Lần ghi do CVKTHT, cấp trên hoặc chính bạn ghi: cần ${CAP_TREN} duyệt.`, 'cap');
  const ts = Date.now();
  await ghiNeuChuaDoi(env, id, 0, [
    env.DB.prepare('UPDATE satvun SET duyet_ts = ?, duyet_by = ?, duyet_name = ? WHERE id = ?').bind(ts, user.id, user.name, id),
    auditStmt(env, user, 'sv_duyet', svInfo(r)),
    bump(env),
  ]);
  return json({ ok: true });
}

/* Huỷ: người ghi rút lại khi chưa duyệt, hoặc trong 10 phút sau khi duyệt; người duyệt được thì từ chối / huỷ.
   Lần đã duyệt QUÁ SV_VOID_DAYS ngày thì chỉ CẤP CHỈ HUY huỷ được. Khác sổ vay ở chỗ này, và có lý do: sổ vay
   sửa sai bằng một lần ghi NGƯỢC LẠI, còn ở đây khối lượng luôn dương nên không có lần ghi ngược — khoá cứng
   sau 7 ngày thì một lần gõ nhầm 25 tấn thay cho 2,5 tấn, tới cuối tháng đối chiếu phiếu cân mới thấy, sẽ nằm
   mãi trong thống kê không cách nào gỡ. Thống kê tháng cũ vì vậy vẫn đổi được, nhưng không lặng lẽ: huỷ lần
   đã duyệt BẮT BUỘC ghi lý do, tên người huỷ và lý do nằm ngay trong dòng, dòng vẫn ở lại trong sổ. */
export async function voidSv(req, env, user, id) {
  let ly = '';
  try { ly = String((await req.json()).ly_do || '').trim().slice(0, 200); } catch (e) { /* không có thân */ }
  const r = await env.DB.prepare('SELECT * FROM satvun WHERE id = ? AND voided = 0').bind(id).first();
  if (!r) throw new HttpError(404, 'Không tìm thấy lần xuất sắt vụn');
  const pending = !r.duyet_ts;
  const quyen = duyetCap(user.role, r.cap);
  if (!quyen) {
    if (r.user_id !== user.id) throw new HttpError(403, 'Chỉ người ghi hoặc cấp duyệt được lần ghi này mới huỷ được');
    if (!pending && Date.now() - r.duyet_ts > 10 * 60e3) throw new HttpError(403, 'Đã duyệt quá 10 phút, nhờ cấp trên huỷ');
  }
  if (!pending && quyen && capOf(user.role) < 2 && Date.now() - r.duyet_ts > SV_VOID_DAYS * 864e5) {
    throw new HttpError(409, `Lần xuất đã duyệt quá ${SV_VOID_DAYS} ngày: chỉ ${CAP_TREN} huỷ được.`, 'too_old');
  }
  if (!pending && !ly) throw bad('Huỷ lần xuất đã duyệt thì phải ghi lý do');
  await ghiNeuChuaDoi(env, id, r.duyet_ts, [
    env.DB.prepare('UPDATE satvun SET voided = 1, voided_ts = ?, voided_by = ?, voided_name = ?, voided_note = ? WHERE id = ?')
      .bind(Date.now(), user.id, user.name, ly || null, id),
    auditStmt(env, user, pending ? 'sv_reject' : 'sv_void', { ...svInfo(r), ...(ly ? { ly_do: ly } : {}) }),
    bump(env),
  ]);
  return json({ ok: true, pending });
}

const SV_COLS = `s.id, s.ngay, s.khu_id, s.kg, s.noi, s.so_phieu, s.bien_so, s.nguoi, s.note, s.user_id, s.cap, s.ts,
  s.duyet_ts, s.voided, s.voided_ts, s.voided_note, ${UNAME},
  COALESCE((SELECT x.name FROM users x WHERE x.id = s.duyet_by), s.duyet_name) duyet_uname,
  COALESCE((SELECT x.name FROM users x WHERE x.id = s.voided_by), s.voided_name) voided_uname`;
// thống kê chỉ tính lần ĐÃ DUYỆT, chưa huỷ
const DA = 'voided = 0 AND duyet_ts IS NOT NULL';

/* Màn Sắt vụn: danh sách (mọi lần chờ duyệt + 300 lần gần nhất, cả lần đã huỷ để thấy sổ bị sửa gì) và
   thống kê cộng ở database: theo tháng (13 tháng gần nhất), theo khu và theo nơi nhận (năm nay). */
/* KỲ của hai bảng "theo khu" và "theo nơi nhận" (?ky=): một NĂM "2026", một THÁNG "2026-10", hoặc "all" = từ
   trước tới nay; không gửi thì là năm nay. Đối chiếu với bên mua làm theo từng tháng, nên chọn một tháng thì
   danh sách bên dưới cũng là ĐỦ các lần xuất của tháng đó (không phải 300 lần gần nhất). Trả [từ, tới) theo
   ngày xuất để câu lọc đi theo index idx_satvun_ngay. */
export function svKy(ky, nam) {
  const k = String(ky || '');
  if (k === 'all') return { ky: 'all', tu: '0000-00-00', toi: '9999-99-99' };
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(k)) {
    const [y, m] = k.split('-').map(Number);
    return { ky: k, tu: k + '-01', toi: (m === 12 ? (y + 1) + '-01' : y + '-' + String(m + 1).padStart(2, '0')) + '-01', thang: true };
  }
  const y = /^\d{4}$/.test(k) ? k : nam;
  return { ky: y, tu: y + '-01-01', toi: (Number(y) + 1) + '-01-01' };
}

export async function svView(env, url) {
  const today = vnDay(), nam = today.slice(0, 4), thang = today.slice(0, 7);
  const K = svKy(url ? url.searchParams.get('ky') : '', nam);
  const tu = (() => { const [y, m] = thang.split('-').map(Number); const t = (y * 12 + m - 1) - 12; return Math.floor(t / 12) + '-' + String(t % 12 + 1).padStart(2, '0'); })();
  const [itemR, thangR, khuR, noiR, tongR] = await env.DB.batch([
    env.DB.prepare(`SELECT ${SV_COLS} FROM satvun s LEFT JOIN users u ON u.id = s.user_id
                    WHERE (s.voided = 0 AND s.duyet_ts IS NULL) OR ${K.thang
                      ? '(s.ngay >= ?1 AND s.ngay < ?2)'
                      : '(?1 = ?1 AND ?2 = ?2 AND s.id >= COALESCE((SELECT MIN(id) FROM (SELECT id FROM satvun ORDER BY id DESC LIMIT 300)), 0))'}
                    ORDER BY s.ngay DESC, s.id DESC LIMIT 2000`).bind(K.tu, K.toi),
    env.DB.prepare(`SELECT substr(ngay, 1, 7) thang, COUNT(*) n, SUM(kg) kg FROM satvun WHERE ${DA} AND ngay >= ? GROUP BY thang ORDER BY thang DESC`).bind(tu + '-01'),
    env.DB.prepare(`SELECT khu_id, COUNT(*) n, SUM(kg) kg FROM satvun WHERE ${DA} AND ngay >= ? AND ngay < ? GROUP BY khu_id ORDER BY kg DESC`).bind(K.tu, K.toi),
    env.DB.prepare(`SELECT noi, COUNT(*) n, SUM(kg) kg FROM satvun WHERE ${DA} AND ngay >= ? AND ngay < ? GROUP BY noi ORDER BY kg DESC`).bind(K.tu, K.toi),
    env.DB.prepare(`SELECT COUNT(*) n, COALESCE(SUM(kg), 0) kg,
                      COALESCE(SUM(CASE WHEN substr(ngay, 1, 7) = ?1 THEN kg END), 0) kgThang, COUNT(CASE WHEN substr(ngay, 1, 7) = ?1 THEN 1 END) nThang,
                      COALESCE(SUM(CASE WHEN substr(ngay, 1, 4) = ?2 THEN kg END), 0) kgNam, COUNT(CASE WHEN substr(ngay, 1, 4) = ?2 THEN 1 END) nNam
                    FROM satvun WHERE ${DA}`).bind(thang, nam),
  ]);
  // nơi nhận gần đây, cho nút chọn nhanh (tên gõ lại mỗi lần dễ lệch chữ, thống kê theo nơi nhận bị tách đôi)
  const noiGan = (await env.DB.prepare('SELECT noi FROM satvun WHERE voided = 0 GROUP BY noi ORDER BY MAX(id) DESC LIMIT 8').all()).results.map((x) => x.noi);
  const kyTong = khuR.results.reduce((a, x) => ({ n: a.n + x.n, kg: a.kg + x.kg }), { n: 0, kg: 0 });
  return json({ items: itemR.results, thang: thangR.results, khu: khuR.results, noi: noiR.results, tong: tongR.results[0], noiGan, nam, thangNay: thang, ky: K.ky, kyTong });
}

/* TỆP EXCEL: mọi lần xuất từ trước tới nay (cả chờ duyệt và đã huỷ, có cột trạng thái), rồi tổng theo tháng
   và theo nơi nhận — để đối chiếu với phiếu cân / bảng kê của bên mua. */
export async function svCsv(env) {
  const [rowR, khuR] = await env.DB.batch([
    env.DB.prepare(`SELECT ${SV_COLS} FROM satvun s LEFT JOIN users u ON u.id = s.user_id ORDER BY s.ngay, s.id`),
    env.DB.prepare('SELECT id, name FROM khu'),
  ]);
  const kn = Object.fromEntries(khuR.results.map((k) => [k.id, k.name]));
  const esc = (x) => '"' + String(x == null ? '' : x).replace(/"/g, '""') + '"';
  // chữ người dùng gõ mà Excel tự "hiểu" (ngày, số, công thức) thì ghi dạng ="..." cho giữ nguyên (xem loansCsv)
  const txt = (x) => {
    const v = String(x == null ? '' : x);
    if (!/^[=+\-@\t\r]/.test(v) && !/^[\d\s.,/:\-]+$/.test(v) && !/^\d+[eE]\d+$/.test(v)) return esc(v);
    return esc('="' + v.replace(/"/g, '""') + '"');
  };
  const gio = (ms) => (ms ? fmtDay(vnDay(ms)) + ' ' + new Date(ms + 7 * 3600e3).toISOString().slice(11, 16) : '');
  const tan = (kg) => csvDec(kg / 1000, 3);
  const lines = [csvRow(['Ngày xuất', 'Khu', 'Tấn', 'Xuất cho', 'Số phiếu cân / biên bản', 'Biển số xe', 'Người nhận', 'Ghi chú',
    'Người ghi', 'Ghi lúc', 'Trạng thái', 'Người duyệt', 'Duyệt lúc', 'Người huỷ', 'Huỷ lúc', 'Lý do huỷ'].map(esc))];
  const thang = {}, noi = {};
  for (const r of rowR.results) {
    lines.push(csvRow([esc(fmtDay(r.ngay)), esc(r.khu_id ? kn[r.khu_id] || r.khu_id : 'Nhiều khu'), tan(r.kg), txt(r.noi), txt(r.so_phieu), txt(r.bien_so), txt(r.nguoi), txt(r.note),
      esc(r.uname), esc(gio(r.ts)), esc(r.voided ? 'Đã huỷ' : r.duyet_ts ? 'Đã duyệt' : 'Chờ duyệt'), esc(r.duyet_ts ? r.duyet_uname : ''), esc(gio(r.duyet_ts)),
      esc(r.voided ? r.voided_uname : ''), esc(r.voided ? gio(r.voided_ts) : ''), txt(r.voided_note)]));
    if (r.voided || !r.duyet_ts) continue;
    const t = r.ngay.slice(0, 7);
    (thang[t] = thang[t] || { n: 0, kg: 0 }).n++; thang[t].kg += r.kg;
    (noi[r.noi] = noi[r.noi] || { n: 0, kg: 0 }).n++; noi[r.noi].kg += r.kg;
  }
  lines.push('', csvRow([esc('TỔNG THEO THÁNG (chỉ lần đã duyệt, chưa huỷ)')]), csvRow(['Tháng', 'Số lần', 'Tấn'].map(esc)));
  for (const t of Object.keys(thang).sort()) lines.push(csvRow([esc(t.slice(5) + '/' + t.slice(0, 4)), thang[t].n, tan(thang[t].kg)]));
  lines.push('', csvRow([esc('TỔNG THEO NƠI NHẬN')]), csvRow(['Xuất cho', 'Số lần', 'Tấn'].map(esc)));
  for (const [k, x] of Object.entries(noi).sort((a, z) => z[1].kg - a[1].kg)) lines.push(csvRow([txt(k), x.n, tan(x.kg)]));
  return new Response(CSV_HEAD + lines.join('\r\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="sat-vun-${vnDay()}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}

// lần xuất chờ duyệt (cho Tổng quan và màn Duyệt)
export const SV_CHO_SQL = `SELECT ${SV_COLS} FROM satvun s LEFT JOIN users u ON u.id = s.user_id WHERE s.voided = 0 AND s.duyet_ts IS NULL ORDER BY s.id`;
