// Sổ vay mượn thép với đối tác ngoài bãi (không tính vào tồn).
import { DAY_RE, HttpError, bad, daysBetween, json, rand, vnDay } from './core.js';
import { DUYET_JOIN_LOAN, DUYET_NAME_LOAN, IS_CLOSED, UNAME, auditStmt, batchGuarded, bump, closedErr, guardStmt, intIn,
  readJson, unitWord } from './helpers.js';
import { J } from './counts.js';
import { checkTransferStock, receiptCtx } from './phieu.js';

/* ========================= VAY MƯỢN NGOÀI BÃI =========================
   Sổ công nợ thép với đối tác NGOÀI bãi — KHÔNG đụng tới tồn kho (counts/receipts), xem chú thích
   đầu bảng loans trong schema.sql: thép di chuyển qua cổng thật thì vẫn phải lập phiếu Nhập/Xuất
   như thường, sổ này chỉ nhớ "ai đang giữ thép của ai". Ai cũng GHI được (kể cả người đếm), vì
   mục đích là nhiều người cùng chép lại ngay lúc phát sinh, tránh quên — nhưng admin vẫn phải
   DUYỆT từng lần ghi, như mọi phiếu khác, để số liệu chính thức luôn qua tay admin.
   kind: 'vay' + 'tra_vay' là một cặp (mình nợ đối tác), 'cho_vay' + 'tra_no' là cặp còn lại (đối
   tác nợ mình) — hai cặp tính riêng, vì cùng một đối tác có thể vừa đang vay mình D16 vừa đang
   được mình cho vay D18 cùng lúc. */
export const LOAN_KINDS = ['vay', 'tra_vay', 'cho_vay', 'tra_no'];
export const LOAN_ACTION = { vay: 'loan_vay', tra_vay: 'loan_tra_vay', cho_vay: 'loan_cho_vay', tra_no: 'loan_tra_no' };
/* Hai loại làm thép RỜI bãi (mình cho mượn, mình trả lại), hai loại làm thép VÀO bãi. Dùng để ra
   dấu cho phiếu kho đi kèm: thép rời bãi là dòng âm, phải qua chốt chặn "không rút quá số đang có". */
const LOAN_RA = ['cho_vay', 'tra_vay'];
const loanTitle = (kind, ten) => ({ vay: `Vay của ${ten}`, tra_vay: `Trả ${ten}`, cho_vay: `Cho ${ten} vay`, tra_no: `${ten} trả lại` }[kind] || ten);
/* Huỷ một lần ghi ĐÃ DUYỆT chỉ trong ngần này ngày kể từ lúc duyệt. Sổ vay không có "chốt ngày" như
   tồn, nên không có mốc này thì một khoản duyệt từ năm ngoái vẫn huỷ được, và dư nợ quá khứ đổi theo
   lặng lẽ. Quá hạn thì ghi một lần NGƯỢC LẠI (trả, hoặc vay) — sổ giữ được cả hai dấu vết. */
const LOAN_VOID_DAYS = 7;

/* CÒN NỢ THEO TỪNG LẦN VAY. Lần trả trừ vào lần vay CŨ NHẤT trước (theo ngày giao nhận), riêng từng
   đối tác × phi × chiều (mình nợ / họ nợ). Nhờ vậy biết đúng PHẦN NÀO đang quá hạn, chứ không chỉ
   một con số tổng: vay 100 hẹn 06/10, vay thêm 50 hẹn 30/10, đã trả 80 — thì còn 20 của lần đầu
   (quá hạn) và 50 của lần sau (chưa tới hạn).
   rows: các dòng ĐÃ DUYỆT, chưa huỷ, xếp theo ngay rồi id. Trả dư (trả khi không còn lần vay nào
   mở) thì bỏ qua ở đây — dư nợ âm đã được nói ở chỗ khác. */
export function loanLots(rows, today) {
  const q = {};
  for (const r of rows) {
    const no = r.kind === 'vay' || r.kind === 'tra_vay';
    const key = r.doitac_id + '|' + r.phi_id + '|' + (no ? 'no' : 'co');
    const arr = q[key] || (q[key] = []);
    if (r.kind === 'vay' || r.kind === 'cho_vay') {
      arr.push({ id: r.id, grp: r.grp, doitac_id: r.doitac_id, phi_id: r.phi_id, chieu: no ? 'no' : 'co', ngay: r.ngay, han: r.han || null, so_bb: r.so_bb || null, con: r.qty });
    } else {
      let t = r.qty;
      for (const lot of arr) { if (!t) break; const x = Math.min(lot.con, t); lot.con -= x; t -= x; }
    }
  }
  return Object.values(q).flat().filter((l) => l.con > 0).map((l) => ({ ...l, quaHan: !!(l.han && l.han < today) }));
}
export const LOAN_LOT_SQL = "SELECT id, grp, doitac_id, phi_id, kind, qty, ngay, han, so_bb FROM loans WHERE voided = 0 AND duyet_ts IS NOT NULL ORDER BY ngay, id";

export async function doitacCreate(req, env, user) {
  const b = await readJson(req);
  const name = String(b.name || '').trim().slice(0, 60);
  if (!name) throw bad('Cần nhập tên đối tác');
  const dup = await env.DB.prepare('SELECT id FROM doitac WHERE name = ? COLLATE NOCASE').bind(name).first();
  if (dup) throw bad('Đối tác này đã có trong danh sách');
  const res = await env.DB.batch([
    env.DB.prepare('INSERT INTO doitac (name, active) VALUES (?, 1)').bind(name),
    auditStmt(env, user, 'doitac_create', { name }),
    bump(env),
  ]);
  return json({ ok: true, id: res[0].meta.last_row_id });
}

export async function doitacUpdate(req, env, user, id) {
  const d = await env.DB.prepare('SELECT * FROM doitac WHERE id = ?').bind(Number(id)).first();
  if (!d) throw new HttpError(404, 'Không tìm thấy đối tác');
  const b = await readJson(req);
  const name = b.name !== undefined ? String(b.name).trim().slice(0, 60) || d.name : d.name;
  if (name.toLowerCase() !== d.name.toLowerCase()) {
    const dup = await env.DB.prepare('SELECT id FROM doitac WHERE name = ? COLLATE NOCASE AND id <> ?').bind(name, d.id).first();
    if (dup) throw bad('Tên này đã dùng cho một đối tác khác');
  }
  const active = b.active !== undefined ? (b.active ? 1 : 0) : d.active;
  await env.DB.batch([
    env.DB.prepare('UPDATE doitac SET name = ?, active = ? WHERE id = ?').bind(name, active, d.id),
    auditStmt(env, user, 'doitac_update', { id: d.id, name, active }),
    bump(env),
  ]);
  return json({ ok: true });
}

// Đọc danh sách dòng { phi, qty } của một lần ghi — giống parseLines của receipts nhưng không cần ctx.khu
export function parseLoanLines(b, phiBy) {
  const raw = Array.isArray(b.lines) ? b.lines : b.phi !== undefined ? [{ phi: b.phi, qty: b.qty }] : [];
  if (!raw.length) throw bad('Chưa có dòng nào');
  if (raw.length > 30) throw bad('Một lần ghi tối đa 30 dòng');
  const sum = {};
  for (const it of raw) {
    const phi = String((it && it.phi) || '');
    if (!phiBy[phi]) throw bad('Phi không hợp lệ: ' + phi);
    sum[phi] = (sum[phi] || 0) + intIn(it.qty, 1, 99999, 'Số ' + unitWord(phiBy[phi]) + ' của ' + phi);
  }
  return Object.entries(sum).map(([phi, qty]) => ({ phi, qty }));
}

export async function postLoan(req, env, user) {
  const b = await readJson(req);
  const kind = String(b.kind || '');
  if (!LOAN_KINDS.includes(kind)) throw bad('Chưa chọn loại vay/mượn hợp lệ');
  const doitacId = intIn(b.doitac, 1, 1e9, 'Đối tác');
  const [dR, phiR] = await env.DB.batch([
    env.DB.prepare('SELECT id, name, active FROM doitac WHERE id = ?').bind(doitacId),
    env.DB.prepare('SELECT id, bo_size, unit FROM phi WHERE active = 1'),
  ]);
  const d = dR.results[0];
  if (!d) throw bad('Đối tác không hợp lệ');
  if (!d.active) throw bad('Đối tác này đã ẩn, không ghi thêm được. Hãy hiện lại ở màn Vay mượn trước');
  const phiBy = Object.fromEntries(phiR.results.map((r) => [r.id, r]));
  const lines = parseLoanLines(b, phiBy);
  /* Mỗi lần thép đi/về với đối tác phải có biên bản giao nhận, và biên bản phải được gửi lên nhóm
     Zalo của bãi — sổ này chỉ là bản ghi nhớ, chứng từ gốc là biên bản. Bắt xác nhận ở đây (cả trên
     máy lẫn server) để người ghi không quên, và lần xác nhận nằm lại trong nhật ký. */
  /* Yêu cầu KHÔNG CÓ hai trường này (khác với có mà chưa tick) là máy đang chạy bản app cũ, chưa có
     hai ô xác nhận. Đòi "hãy xác nhận" thì người dùng đi tìm một ô không có trên màn hình — nói
     thẳng là app cũ, kèm mã để máy khách bật dải "có bản mới". */
  if (b.bienban === undefined && b.zalo === undefined) {
    throw new HttpError(409, 'Bản app trên máy đã cũ (chưa có ô xác nhận biên bản). Hãy tắt hẳn app rồi mở lại để cập nhật.', 'old_app');
  }
  if (b.bienban !== true || b.zalo !== true) {
    throw bad('Hãy xác nhận đã có biên bản giao nhận và đã gửi biên bản lên nhóm Zalo trước khi ghi sổ');
  }
  /* Số biên bản: bắt buộc từ bản 20 — đầu mối để từ dòng sổ tìm ra tờ biên bản trong nhóm Zalo.
     Yêu cầu KHÔNG CÓ trường này là máy đang chạy bản app trước (chưa có ô số biên bản). */
  if (b.so_bb === undefined) {
    throw new HttpError(409, 'Bản app trên máy đã cũ (chưa có ô số biên bản). Hãy tắt hẳn app rồi mở lại để cập nhật.', 'old_app');
  }
  const soBB = String(b.so_bb || '').trim().slice(0, 40);
  if (!soBB) throw bad('Cần ghi số biên bản giao nhận');
  /* Ngày giao nhận THẬT (ghi bù được): sổ phải khớp ngày trên biên bản, không phải ngày bấm ghi.
     Không được sau hôm nay; quá một năm trước thì gần như chắc là gõ nhầm năm. */
  const today = vnDay();
  const ngay = b.ngay == null || b.ngay === '' ? today : String(b.ngay);
  if (!DAY_RE.test(ngay) || ngay > today) throw bad('Ngày giao nhận không hợp lệ (không được sau hôm nay)');
  if (daysBetween(ngay, today) > 366) throw bad('Ngày giao nhận quá xa (hơn một năm trước). Kiểm tra lại năm');
  // Hạn trả: tuỳ chọn, chỉ lần vay / cho vay (lần trả thì không có hạn), không trước ngày giao nhận
  let han = null;
  if (b.han != null && b.han !== '') {
    if (kind !== 'vay' && kind !== 'cho_vay') throw bad('Chỉ lần vay hoặc cho vay mới có hạn trả');
    han = String(b.han);
    if (!DAY_RE.test(han) || han < ngay) throw bad('Hạn trả phải từ ngày giao nhận trở đi');
    if (daysBetween(ngay, han) > 731) throw bad('Hạn trả quá xa (hơn hai năm). Kiểm tra lại năm');
  }
  const nguoi = String(b.nguoi || '').trim().slice(0, 60);
  const bienSo = String(b.bien_so || '').trim().slice(0, 20);
  const note = String(b.note || '').trim().slice(0, 200);
  const grp = rand(8);
  const ts = Date.now();
  const data = JSON.stringify(lines);
  /* THÉP QUA BÃI (b.khu): lập kèm một phiếu kho loại 'vay' CÙNG grp với lần ghi sổ. Phiếu đó đổi tồn
     khu như mọi phiếu, nhưng không tính là nhập cũng không tính là dùng (xem vc ở computeReview):
     cho đối tác mượn 30 cây rồi khu đếm hụt 30 cây thì "đã dùng" ra 0, không phải 30 — nếu không,
     mức dùng trung bình đội lên, dự báo "còn đủ dùng" nói thiếu, và có khi bật cảnh báo "dùng
     nhiều bất thường" chỉ vì cho mượn thép. Sổ và phiếu cùng grp nên duyệt hay huỷ bên nào cũng là
     cả hai. Lập phiếu kho thì phải là thủ kho/admin, như mọi phiếu kho khác. */
  const khuId = b.khu ? String(b.khu) : '';
  const stmts = [
    env.DB.prepare(
      `INSERT INTO loans (doitac_id, phi_id, kind, qty, note, grp, user_id, ts, ngay, han, so_bb, nguoi, bien_so)
       SELECT ?1, ${J('phi')}, ?2, ${J('qty')}, ?3, ?4, ?5, ?6, ?8, ?9, ?10, ?11, ?12 FROM json_each(?7) j`
    ).bind(doitacId, kind, note, grp, user.id, ts, data, ngay, han, soBB, nguoi || null, bienSo || null),
  ];
  let day = null;
  if (khuId) {
    if (user.role !== 'admin' && user.role !== 'thukho') throw new HttpError(403, 'Chỉ thủ kho và admin lập được phiếu kho kèm sổ vay. Bỏ chọn "Thép qua bãi" để chỉ ghi sổ.');
    const ctx = await receiptCtx(env, [khuId]); // chặn ngày đã chốt và khu không hợp lệ
    for (const l of lines) if (!ctx.phiBy[l.phi]) throw bad('Phi không hợp lệ: ' + l.phi);
    day = ctx.day;
    const dau = LOAN_RA.includes(kind) ? -1 : 1;
    const rows = lines.map((l) => ({ phi: l.phi, khu: khuId, qty: dau * l.qty }));
    if (dau < 0) await checkTransferStock(env, day, rows.map((r) => ({ phi_id: r.phi, khu_id: r.khu, qty: r.qty })), { kind: 'vay', duyet: false });
    const ghi = 'Vay mượn · ' + loanTitle(kind, d.name) + ' · BB ' + soBB + (note ? ': ' + note : '');
    stmts.push(env.DB.prepare(
      `INSERT INTO receipts (day, phi_id, khu_id, qty, note, user_id, ts, kind, grp)
       SELECT ?1, ${J('phi')}, ${J('khu')}, ${J('qty')}, ?2, ?3, ?4, 'vay', ?5 FROM json_each(?6) j`
    ).bind(day, ghi, user.id, ts, grp, JSON.stringify(rows)));
  }
  stmts.push(
    auditStmt(env, user, LOAN_ACTION[kind], { doitac: d.name, lines, note, grp, bienban: true, zalo: true, so_bb: soBB, ngay, han, ...(khuId ? { khu: khuId } : {}) }),
    bump(env),
    env.DB.prepare('SELECT id FROM loans WHERE grp = ?').bind(grp),
  );
  const res = day
    ? await batchGuarded(env, guardStmt(env, IS_CLOSED, day), stmts, closedErr())
    : await env.DB.batch(stmts);
  const ids = res[res.length - 1].results.map((r) => r.id);
  return json({ ok: true, grp, ids });
}

/* Đối tác và các dòng của CẢ lần ghi, để dòng nhật ký duyệt/huỷ tự đọc được: "duyệt sổ vay mượn"
   mà không nói của ai, bao nhiêu thì đọc lại nhật ký không biết vừa duyệt khoản nào — và nhật ký
   thì không sửa lại được. */
async function loanGroupInfo(env, r) {
  const [dR, lR] = await env.DB.batch([
    env.DB.prepare('SELECT name FROM doitac WHERE id = ?').bind(r.doitac_id),
    r.grp
      ? env.DB.prepare('SELECT phi_id phi, qty FROM loans WHERE grp = ? AND voided = 0 ORDER BY id').bind(r.grp)
      : env.DB.prepare('SELECT phi_id phi, qty FROM loans WHERE id = ?').bind(r.id),
  ]);
  return { doitac: (dR.results[0] || {}).name || null, lines: lR.results };
}

export async function duyetLoan(env, user, id) {
  const r = await env.DB.prepare('SELECT * FROM loans WHERE id = ?').bind(id).first();
  if (!r) throw new HttpError(404, 'Không tìm thấy dòng vay/mượn');
  if (r.voided) throw bad('Dòng này đã bị hủy, không duyệt được');
  if (r.duyet_ts) throw bad('Dòng này đã được duyệt');
  const info = await loanGroupInfo(env, r);
  const ts = Date.now();
  // phiếu kho đi kèm (thép qua bãi): vào tồn hôm nay, nên qua cùng chốt chặn với phiếu thường
  const kho = r.grp ? (await env.DB.prepare("SELECT phi_id, khu_id, qty FROM receipts WHERE grp = ? AND kind = 'vay' AND voided = 0 AND duyet_day IS NULL").bind(r.grp).all()).results : [];
  const day = vnDay();
  if (kho.length) await checkTransferStock(env, day, kho, { kind: 'vay' });
  const run = kho.length
    ? (stmts) => batchGuarded(env, guardStmt(env, IS_CLOSED, day), stmts, closedErr('Ngày hôm nay đã chốt, không duyệt được phiếu kho đi kèm'))
    : (stmts) => env.DB.batch(stmts);
  await run([
    ...(kho.length ? [env.DB.prepare("UPDATE receipts SET duyet_day = ?, duyet_ts = ?, duyet_by = ?, duyet_name = ? WHERE grp = ? AND kind = 'vay' AND voided = 0 AND duyet_day IS NULL")
      .bind(day, ts, user.id, user.name, r.grp)] : []),
    r.grp
      ? env.DB.prepare('UPDATE loans SET duyet_ts = ?, duyet_by = ?, duyet_name = ? WHERE grp = ? AND voided = 0 AND duyet_ts IS NULL')
        .bind(ts, user.id, user.name, r.grp)
      : env.DB.prepare('UPDATE loans SET duyet_ts = ?, duyet_by = ?, duyet_name = ? WHERE id = ?')
        .bind(ts, user.id, user.name, id),
    auditStmt(env, user, 'loan_duyet', { id, grp: r.grp, kind: r.kind, doitac_id: r.doitac_id, ...info }),
    bump(env),
  ]);
  return json({ ok: true });
}

// Hủy theo nhóm (grp), giống voidReceipt: chờ duyệt thì người ghi rút lại bất cứ lúc nào, đã
// duyệt thì chỉ trong 10 phút kể từ lúc duyệt, sau đó nhờ admin. Không có khái niệm "ngày chốt"
// ở đây nên không cần chốt chặn theo ngày như receipts.
export async function voidLoan(env, user, id) {
  const r = await env.DB.prepare('SELECT * FROM loans WHERE id = ? AND voided = 0').bind(id).first();
  if (!r) throw new HttpError(404, 'Không tìm thấy dòng vay/mượn');
  const pending = !r.duyet_ts;
  if (user.role !== 'admin') {
    if (r.user_id !== user.id) throw new HttpError(403, 'Chỉ người ghi hoặc admin mới hủy được');
    if (!pending && Date.now() - r.duyet_ts > 10 * 60e3) {
      throw new HttpError(403, 'Dòng đã duyệt quá 10 phút, nhờ admin hủy');
    }
  }
  if (!pending && user.role === 'admin' && Date.now() - r.duyet_ts > LOAN_VOID_DAYS * 864e5) {
    throw new HttpError(409, `Lần ghi đã duyệt quá ${LOAN_VOID_DAYS} ngày, không huỷ được nữa. Ghi một lần ngược lại (trả, hoặc vay) để sửa dư nợ.`, 'too_old');
  }
  const info = await loanGroupInfo(env, r);
  /* Phiếu kho đi kèm: đã duyệt mà NGÀY DUYỆT đã chốt thì không huỷ được (luật của mọi phiếu kho:
     không viết lại ngày đã khoá), nên cả lần ghi sổ cũng không huỷ — sổ và kho không được lệch nhau. */
  const kho = r.grp ? (await env.DB.prepare("SELECT duyet_day FROM receipts WHERE grp = ? AND kind = 'vay' AND voided = 0").bind(r.grp).all()).results : [];
  const ngayDuyet = kho.map((x) => x.duyet_day).filter(Boolean)[0];
  if (ngayDuyet && await env.DB.prepare('SELECT 1 x FROM day_close WHERE day = ?').bind(ngayDuyet).first()) {
    throw new HttpError(409, 'Phiếu kho đi kèm đã vào ngày đã chốt, không huỷ được. Ghi một lần ngược lại (trả, hoặc vay) để sửa.', 'closed');
  }
  const run = kho.length
    ? (stmts) => batchGuarded(env, guardStmt(env, IS_CLOSED, ngayDuyet || vnDay()), stmts, closedErr())
    : (stmts) => env.DB.batch(stmts);
  await run([
    ...(kho.length ? [env.DB.prepare("UPDATE receipts SET voided = 1, voided_ts = ? WHERE grp = ? AND kind = 'vay' AND voided = 0").bind(Date.now(), r.grp)] : []),
    r.grp
      ? env.DB.prepare('UPDATE loans SET voided = 1, voided_ts = ? WHERE grp = ? AND voided = 0').bind(Date.now(), r.grp)
      : env.DB.prepare('UPDATE loans SET voided = 1, voided_ts = ? WHERE id = ?').bind(Date.now(), id),
    auditStmt(env, user, pending ? 'loan_reject' : 'loan_void', { id, kind: r.kind, doitac_id: r.doitac_id, grp: r.grp, ...info }),
    bump(env),
  ]);
  return json({ ok: true, pending });
}

/* Màn Vay mượn: danh sách MỌI đối tác (cả đã ẩn, để admin quản lý), lịch sử gần đây (đủ cho màn
   hình, không tải hết — giống /users không tải hết nhật ký) và số dư nợ từng (đối tác × phi),
   tính trên MỌI dòng ĐÃ DUYỆT từ trước tới nay bằng SUM ở database, không phụ thuộc `items` có
   tải đủ hay không. agg trả về thô theo kind; cộng/trừ đúng cặp (vay/tra_vay, cho_vay/tra_no)
   làm ở app.js, để server khỏi phải biết màn hình trình bày thế nào. */
export async function loansView(env, url) {
  /* ?doitac=id: màn chi tiết MỘT đối tác — đủ lịch sử (cả lần đã huỷ, để thấy sổ từng bị sửa gì) và
     số cộng dồn theo phi của riêng đối tác đó. Trần 2000 dòng chỉ để chặn trường hợp bất thường. */
  const dtId = url ? Number(url.searchParams.get('doitac')) : 0;
  if (dtId > 0) {
    const [dR, itemR, aggR] = await env.DB.batch([
      env.DB.prepare('SELECT id, name, active FROM doitac WHERE id = ?').bind(dtId),
      env.DB.prepare(
        `SELECT l.id, l.doitac_id, d.name doitac_name, l.phi_id, l.kind, l.qty, l.note, l.grp, l.voided, l.voided_ts,
           l.ngay, l.han, l.so_bb, l.nguoi, l.bien_so,
           l.user_id, ${UNAME}, l.ts, l.duyet_ts, l.duyet_by, ${DUYET_NAME_LOAN},
           (SELECT r.khu_id FROM receipts r WHERE r.grp = l.grp AND r.kind = 'vay' LIMIT 1) kho
         FROM loans l LEFT JOIN users u ON u.id = l.user_id LEFT JOIN doitac d ON d.id = l.doitac_id
           ${DUYET_JOIN_LOAN}
         WHERE l.doitac_id = ? ORDER BY l.ngay DESC, l.id DESC LIMIT 2000`
      ).bind(dtId),
      env.DB.prepare('SELECT doitac_id, phi_id, kind, SUM(qty) q FROM loans WHERE voided = 0 AND duyet_ts IS NOT NULL AND doitac_id = ? GROUP BY phi_id, kind').bind(dtId),
    ]);
    if (!dR.results[0]) throw new HttpError(404, 'Không tìm thấy đối tác');
    const lotR = await env.DB.prepare(LOAN_LOT_SQL.replace('ORDER BY', 'AND doitac_id = ? ORDER BY')).bind(dtId).all();
    return json({ doitac: dR.results, items: itemR.results, agg: aggR.results, chiTiet: true, lots: loanLots(lotR.results, vnDay()) });
  }
  const [dR, itemR, aggR] = await env.DB.batch([
    env.DB.prepare('SELECT id, name, active FROM doitac ORDER BY name'),
    env.DB.prepare(
      `SELECT l.id, l.doitac_id, d.name doitac_name, l.phi_id, l.kind, l.qty, l.note, l.grp,
         l.ngay, l.han, l.so_bb, l.nguoi, l.bien_so, l.user_id, ${UNAME}, l.ts, l.duyet_ts, l.duyet_by, ${DUYET_NAME_LOAN},
         (SELECT r.khu_id FROM receipts r WHERE r.grp = l.grp AND r.kind = 'vay' AND r.voided = 0 LIMIT 1) kho
       FROM loans l LEFT JOIN users u ON u.id = l.user_id LEFT JOIN doitac d ON d.id = l.doitac_id
         ${DUYET_JOIN_LOAN}
       WHERE l.voided = 0
         /* 300 dòng gần nhất, CỘNG mọi dòng còn chờ duyệt dù cũ tới đâu: số "chờ duyệt" ở Tổng quan
            đếm trên toàn bộ, nên lần ghi chờ duyệt nào cũng phải tìm thấy được để duyệt. */
         AND (l.duyet_ts IS NULL OR l.id >= COALESCE((SELECT MIN(id) FROM (SELECT id FROM loans WHERE voided = 0 ORDER BY id DESC LIMIT 300)), 0))
       ORDER BY l.id DESC`
    ),
    env.DB.prepare('SELECT doitac_id, phi_id, kind, SUM(qty) q FROM loans WHERE voided = 0 AND duyet_ts IS NOT NULL GROUP BY doitac_id, phi_id, kind'),
  ]);
  const lotR = await env.DB.prepare(LOAN_LOT_SQL).all();
  return json({ doitac: dR.results, items: itemR.results, agg: aggR.results, lots: loanLots(lotR.results, vnDay()) });
}
