// Sổ vay mượn thép với đối tác ngoài bãi (không tính vào tồn).
import { CAP_TREN, DAY_RE, HttpError, LAP_PHIEU, bad, capOf, daysBetween, duyetCap, duyetCuaNguoi, duyetPhieuDuoc, fmtDay, json, rand, vnDay } from './core.js';
import { CSV_HEAD, DUYET_JOIN_LOAN, DUYET_NAME_LOAN, IS_CLOSED, LOAN_AM_COND, UNAME, auditStmt, batchGuarded, bump, closedErr, csvDec, csvQty, csvRow, csvUnit, guardStmt, intIn,
  loanAmErr, loanAmRows, qtyWord, readJson, unitWord } from './helpers.js';
import { J } from './counts.js';
import { checkTransferStock, receiptCtx } from './phieu.js';
import { anhJson, docAnh } from './anh.js';

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
   rows: các dòng ĐÃ DUYỆT, chưa huỷ, xếp theo ngay rồi id.
   TRẢ DƯ (trả khi không còn lần vay nào mở) được GIỮ LẠI và trừ vào lần vay kế tiếp, để tổng "còn
   nợ theo từng lần" luôn bằng đúng dư nợ (SUM vay − SUM trả) mà thẻ đối tác đang hiện. Bỏ phần dư
   đi thì vay 100, trả 120, vay tiếp 50 ra dư nợ 30 mà bảng này nói còn 50; và một lần trả ghi ngày
   TRƯỚC lần vay (ghi bù, gõ nhầm ngày) làm khoản đã tất toán vẫn bị báo quá hạn. */
export function loanLots(rows, today) {
  const q = {}, du = {};
  for (const r of rows) {
    const no = r.kind === 'vay' || r.kind === 'tra_vay';
    const key = r.doitac_id + '|' + r.phi_id + '|' + (no ? 'no' : 'co');
    const arr = q[key] || (q[key] = []);
    if (r.kind === 'vay' || r.kind === 'cho_vay') {
      const x = Math.min(du[key] || 0, r.qty);
      if (x) du[key] -= x;
      arr.push({ id: r.id, grp: r.grp, doitac_id: r.doitac_id, phi_id: r.phi_id, chieu: no ? 'no' : 'co', ngay: r.ngay, han: r.han || null, so_bb: r.so_bb || null, con: r.qty - x });
    } else {
      let t = r.qty;
      for (const lot of arr) { if (!t) break; const x = Math.min(lot.con, t); lot.con -= x; t -= x; }
      if (t) du[key] = (du[key] || 0) + t;
    }
  }
  return Object.values(q).flat().filter((l) => l.con > 0).map((l) => ({ ...l, quaHan: !!(l.han && l.han < today) }));
}
export const LOAN_LOT_SQL = "SELECT id, grp, doitac_id, phi_id, kind, qty, ngay, han, so_bb FROM loans WHERE voided = 0 AND duyet_ts IS NOT NULL ORDER BY ngay, id";

/* TRÙNG TÊN ĐỐI TÁC so bằng JavaScript, không bằng COLLATE NOCASE của SQLite: NOCASE chỉ gộp hoa/thường
   của chữ KHÔNG DẤU, nên "Đức Anh" và "đức anh" (hay "Á Châu" / "á châu") thành hai đối tác và công nợ
   bị tách đôi. Chuẩn hoá NFC để chữ gõ từ bàn phím tổ hợp và dựng sẵn cũng là một, gộp khoảng trắng thừa.
   Danh bạ đối tác chỉ vài chục dòng nên đọc hết ra so là đủ. */
const tenChuan = (s) => String(s || '').normalize('NFC').replace(/\s+/g, ' ').trim();
const tenKhoa = (s) => tenChuan(s).toLowerCase();
async function doitacTrung(env, name, tru) {
  const ds = (await env.DB.prepare('SELECT id, name FROM doitac').all()).results;
  return ds.some((d) => d.id !== tru && tenKhoa(d.name) === tenKhoa(name));
}

export async function doitacCreate(req, env, user) {
  const b = await readJson(req);
  const name = tenChuan(b.name).slice(0, 60);
  if (!name) throw bad('Cần nhập tên đối tác');
  if (await doitacTrung(env, name, 0)) throw bad('Đối tác này đã có trong danh sách');
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
  const name = b.name !== undefined ? tenChuan(b.name).slice(0, 60) || d.name : d.name;
  if (name !== d.name && await doitacTrung(env, name, d.id)) throw bad('Tên này đã dùng cho một đối tác khác');
  const active = b.active !== undefined ? (b.active ? 1 : 0) : d.active;
  await env.DB.batch([
    env.DB.prepare('UPDATE doitac SET name = ?, active = ? WHERE id = ?').bind(name, active, d.id),
    auditStmt(env, user, 'doitac_update', { id: d.id, name, active }),
    bump(env),
  ]);
  return json({ ok: true });
}

// khoá so trùng số biên bản: chỉ giữ chữ và số, không phân hoa/thường; số chỉ toàn ký hiệu thì so nguyên văn
export const bbKhoa = (x) => { const v = String(x || '').normalize('NFC').toUpperCase(); return v.replace(/[^\p{L}\p{N}]/gu, '') || v.trim(); };

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
  /* TRÙNG BIÊN BẢN: cùng đối tác, cùng số biên bản, cùng loại và cùng phi với một lần ghi chưa huỷ
     thì gần như chắc là ghi hai lần — sổ này mở cho nhiều người cùng chép, và mất mạng đúng lúc lưu
     thì bấm lại là thành hai dòng. Không chặn hẳn (một biên bản có thể giao làm hai chuyến cùng phi):
     dừng lại, nói rõ dòng đang có, máy khách hỏi rồi gửi lại kèm trung: true. Khác phi thì cho qua,
     đó là ghi bổ sung phi còn thiếu của cùng biên bản. */
  if (b.trung !== true) {
    /* So theo KHOÁ đã bỏ dấu cách, gạch, chấm và hoa/thường: "BB 01", "bb-01", "BB.01" là cùng một tờ biên
       bản do hai người gõ hai kiểu. So trong JavaScript vì SQLite không bỏ ký tự như vậy được; mỗi lần ghi
       chỉ đọc các dòng cùng đối tác × loại × phi, mới nhất trước. */
    const khoa = bbKhoa(soBB);
    const tr = (await env.DB.prepare(
      `SELECT l.phi_id, l.qty, l.ngay, l.duyet_ts, l.so_bb, ${UNAME} FROM loans l LEFT JOIN users u ON u.id = l.user_id
       WHERE l.doitac_id = ?1 AND l.kind = ?2 AND l.voided = 0 AND l.so_bb IS NOT NULL
         AND l.phi_id IN (SELECT ${J('phi')} FROM json_each(?3) j) ORDER BY l.id DESC LIMIT 2000`
    ).bind(doitacId, kind, JSON.stringify(lines)).all()).results.filter((x) => bbKhoa(x.so_bb) === khoa).reverse();
    if (tr.length) {
      throw new HttpError(409, `Biên bản số ${tr[0].so_bb} đã có trong sổ: ${loanTitle(kind, d.name)} · `
        + tr.map((x) => x.phi_id + ' ' + qtyWord(x.qty, phiBy[x.phi_id])).join(', ')
        + ` (${tr[0].uname} ghi${tr[0].ngay ? ', giao nhận ' + fmtDay(tr[0].ngay) : ''}, ${tr[0].duyet_ts ? 'đã duyệt' : 'đang chờ duyệt'}).`
        + ' Nếu đây đúng là một lần giao nhận khác thì xác nhận để ghi thêm.', 'trung_bb');
    }
  }
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
     cả hai. Lập phiếu kho thì phải từ CVKTHT trở lên, như mọi phiếu kho khác. */
  const khuId = b.khu ? String(b.khu) : '';
  const stmts = [
    env.DB.prepare(
      // cap: cấp của người ghi LÚC NÀY, ghi vào dòng — xem lời giải thích ở CAP (core.js)
      `INSERT INTO loans (doitac_id, phi_id, kind, qty, note, grp, user_id, ts, ngay, han, so_bb, nguoi, bien_so, cap)
       SELECT ?1, ${J('phi')}, ?2, ${J('qty')}, ?3, ?4, ?5, ?6, ?8, ?9, ?10, ?11, ?12, ?13 FROM json_each(?7) j`
    ).bind(doitacId, kind, note, grp, user.id, ts, data, ngay, han, soBB, nguoi || null, bienSo || null, capOf(user.role)),
  ];
  let day = null;
  if (khuId) {
    if (!LAP_PHIEU.includes(user.role)) throw new HttpError(403, 'Tiểu đội trưởng không lập được phiếu kho kèm sổ vay. Bỏ chọn "Thép qua bãi" để chỉ ghi sổ.');
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

/* Ghi một lần DUYỆT / HUỶ chỉ khi các điều kiện đọc lúc trước vẫn còn đúng ĐÚNG LÚC GHI. Kiểm rồi mới ghi ở
   hai lượt khác nhau thì có khe hở: hai người cùng bấm duyệt (nhật ký ghi hai lần duyệt), hoặc người này
   huỷ đúng lúc người kia duyệt (nhật ký ghi "duyệt" một lần ghi đã huỷ, hoặc "từ chối" một lần đã duyệt).
   conds: [[điều kiện SQL làm HỎNG lần ghi, ...tham số]]; hỏng thì chan() đọc lại để nói đúng lý do. */
async function batchLoan(env, conds, stmts, chan) {
  const HONG = new HttpError(409, 'guard', 'guard');
  try {
    return await batchGuarded(env, guardStmt(env, conds.map((c) => '(' + c[0] + ')').join(' OR '), ...conds.flatMap((c) => c.slice(1))), stmts, HONG);
  } catch (e) { if (e !== HONG) throw e; throw await chan(); }
}
const daDoi = () => new HttpError(409, 'Lần ghi này vừa được người khác duyệt hoặc huỷ. Xem lại rồi làm tiếp.', 'changed');
const daChot = (env, day) => env.DB.prepare('SELECT 1 x FROM day_close WHERE day = ?').bind(day).first();

export async function duyetLoan(env, user, id) {
  const r = await env.DB.prepare('SELECT * FROM loans WHERE id = ?').bind(id).first();
  if (!r) throw new HttpError(404, 'Không tìm thấy dòng vay/mượn');
  if (r.voided) throw bad('Dòng này đã bị huỷ, không duyệt được');
  if (r.duyet_ts) throw bad('Dòng này đã được duyệt');
  if (!duyetCuaNguoi(user, r.cap, [r.user_id])) throw new HttpError(403, `Lần ghi do CVKTHT, cấp trên hoặc chính bạn ghi: cần ${CAP_TREN} duyệt.`, 'cap');
  const info = await loanGroupInfo(env, r);
  const ts = Date.now();
  // phiếu kho đi kèm (thép qua bãi): vào tồn hôm nay, nên qua cùng chốt chặn với phiếu thường
  const kho = r.grp ? (await env.DB.prepare("SELECT phi_id, khu_id, qty FROM receipts WHERE grp = ? AND kind = 'vay' AND voided = 0 AND duyet_day IS NULL").bind(r.grp).all()).results : [];
  /* Lần ghi kèm phiếu kho: duyệt sổ là duyệt luôn phiếu, nên phải đúng luật của phiếu kho — chỉ cấp
     chỉ huy, ai ghi cũng vậy. Kiểm theo CHÍNH PHIẾU, không suy ra từ cấp của người ghi. */
  if (kho.length && !duyetPhieuDuoc(user.role)) throw new HttpError(403, `Lần ghi này kèm phiếu kho: cần ${CAP_TREN} duyệt.`, 'cap');
  const day = vnDay();
  if (kho.length) await checkTransferStock(env, day, kho, { kind: 'vay' });
  const run = (stmts) => batchLoan(env, [
    ['NOT EXISTS (SELECT 1 FROM loans WHERE id = ? AND voided = 0 AND duyet_ts IS NULL)', id],
    ...(kho.length ? [[IS_CLOSED, day]] : []),
  ], stmts, async () => (kho.length && await daChot(env, day) ? closedErr('Ngày hôm nay đã chốt, không duyệt được phiếu kho đi kèm') : daDoi()));
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

/* Huỷ theo nhóm (grp), giống voidReceipt: chờ duyệt thì người ghi rút lại bất cứ lúc nào; đã duyệt
   thì người ghi chỉ huỷ trong 10 phút kể từ lúc duyệt, người duyệt được thì trong LOAN_VOID_DAYS ngày.
   Lần ghi chỉ ghi sổ không dính "ngày chốt"; lần ghi kèm phiếu kho thì theo ngày duyệt của phiếu.
   AI huỷ và lý do (tuỳ chọn, máy khách hỏi khi từ chối / huỷ lần đã duyệt) ghi ngay vào dòng. */
export async function voidLoan(req, env, user, id) {
  // bản app cũ gọi DELETE không có thân: coi như không ghi lý do
  let ly = '';
  try { ly = String((await req.json()).ly_do || '').trim().slice(0, 200); } catch (e) { /* không có thân */ }
  const r = await env.DB.prepare('SELECT * FROM loans WHERE id = ? AND voided = 0').bind(id).first();
  if (!r) throw new HttpError(404, 'Không tìm thấy dòng vay/mượn');
  const pending = !r.duyet_ts;
  // ai DUYỆT được lần ghi này thì cũng từ chối / huỷ được nó; kèm phiếu kho thì theo luật phiếu kho
  const coKho = !!(r.grp && await env.DB.prepare("SELECT 1 x FROM receipts WHERE grp = ? AND kind = 'vay' AND voided = 0").bind(r.grp).first());
  const quyen = coKho ? duyetPhieuDuoc(user.role) : duyetCap(user.role, r.cap);
  if (!quyen) {
    if (r.user_id !== user.id) throw new HttpError(403, 'Chỉ người ghi hoặc cấp duyệt được lần ghi này mới huỷ được');
    if (!pending && Date.now() - r.duyet_ts > 10 * 60e3) {
      throw new HttpError(403, 'Dòng đã duyệt quá 10 phút, nhờ cấp trên huỷ');
    }
  }
  if (!pending && quyen && Date.now() - r.duyet_ts > LOAN_VOID_DAYS * 864e5) {
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
  /* Ba thứ phải còn đúng lúc ghi: lần ghi vẫn ở trạng thái vừa đọc (chưa ai duyệt / huỷ chen vào), ngày của
     phiếu kho đi kèm chưa chốt, và — với lần đã duyệt — huỷ không làm dư nợ thành âm (xem LOAN_AM_COND). */
  const ngayKho = ngayDuyet || vnDay();
  const run = (stmts) => batchLoan(env, [
    ['NOT EXISTS (SELECT 1 FROM loans WHERE id = ? AND voided = 0 AND COALESCE(duyet_ts, 0) = ?)', id, r.duyet_ts || 0],
    ...(kho.length ? [[IS_CLOSED, ngayKho]] : []),
    ...(pending ? [] : [[LOAN_AM_COND, r.grp, id]]),
  ], stmts, async () => {
    if (kho.length && await daChot(env, ngayKho)) return closedErr();
    const nay = await env.DB.prepare('SELECT voided, duyet_ts FROM loans WHERE id = ?').bind(id).first();
    if (!nay || nay.voided || (nay.duyet_ts || 0) !== (r.duyet_ts || 0)) return daDoi();
    const am = pending ? [] : await loanAmRows(env, r.grp, id);
    return am.length ? loanAmErr(am) : daDoi();
  });
  await run([
    ...(kho.length ? [env.DB.prepare("UPDATE receipts SET voided = 1, voided_ts = ? WHERE grp = ? AND kind = 'vay' AND voided = 0").bind(Date.now(), r.grp)] : []),
    r.grp
      ? env.DB.prepare('UPDATE loans SET voided = 1, voided_ts = ?, voided_by = ?, voided_name = ?, voided_note = ? WHERE grp = ? AND voided = 0').bind(Date.now(), user.id, user.name, ly || null, r.grp)
      : env.DB.prepare('UPDATE loans SET voided = 1, voided_ts = ?, voided_by = ?, voided_name = ?, voided_note = ? WHERE id = ?').bind(Date.now(), user.id, user.name, ly || null, id),
    auditStmt(env, user, pending ? 'loan_reject' : 'loan_void', { id, kind: r.kind, doitac_id: r.doitac_id, grp: r.grp, ...info, ...(ly ? { ly_do: ly } : {}) }),
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
           COALESCE((SELECT uv.name FROM users uv WHERE uv.id = l.voided_by), l.voided_name) voided_uname, l.voided_note,
           l.ngay, l.han, l.so_bb, l.nguoi, l.bien_so,
           l.user_id, l.cap, ${UNAME}, l.ts, l.duyet_ts, l.duyet_by, ${DUYET_NAME_LOAN},
           (SELECT r.khu_id FROM receipts r WHERE r.grp = l.grp AND r.kind = 'vay' LIMIT 1) kho, ${anhJson('loan', 'l.id')}
         FROM loans l LEFT JOIN users u ON u.id = l.user_id LEFT JOIN doitac d ON d.id = l.doitac_id
           ${DUYET_JOIN_LOAN}
         WHERE l.doitac_id = ? ORDER BY l.ngay DESC, l.id DESC LIMIT 2000`
      ).bind(dtId),
      env.DB.prepare('SELECT doitac_id, phi_id, kind, SUM(qty) q FROM loans WHERE voided = 0 AND duyet_ts IS NOT NULL AND doitac_id = ? GROUP BY phi_id, kind').bind(dtId),
    ]);
    if (!dR.results[0]) throw new HttpError(404, 'Không tìm thấy đối tác');
    const lotR = await env.DB.prepare(LOAN_LOT_SQL.replace('ORDER BY', 'AND doitac_id = ? ORDER BY')).bind(dtId).all();
    return json({ doitac: dR.results, items: itemR.results.map(docAnh), agg: aggR.results, chiTiet: true, lots: loanLots(lotR.results, vnDay()) });
  }
  const [dR, itemR, aggR] = await env.DB.batch([
    env.DB.prepare('SELECT id, name, active FROM doitac ORDER BY name'),
    env.DB.prepare(
      `SELECT l.id, l.doitac_id, d.name doitac_name, l.phi_id, l.kind, l.qty, l.note, l.grp,
         l.ngay, l.han, l.so_bb, l.nguoi, l.bien_so, l.user_id, l.cap, ${UNAME}, l.ts, l.duyet_ts, l.duyet_by, ${DUYET_NAME_LOAN},
         (SELECT r.khu_id FROM receipts r WHERE r.grp = l.grp AND r.kind = 'vay' AND r.voided = 0 LIMIT 1) kho, ${anhJson('loan', 'l.id')}
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
  return json({ doitac: dR.results, items: itemR.results.map(docAnh), agg: aggR.results, lots: loanLots(lotR.results, vnDay()) });
}

/* TỆP EXCEL CỦA CẢ SỔ: mọi lần ghi từ trước tới nay (cả chờ duyệt và đã huỷ, có cột trạng thái), rồi
   bảng dư nợ theo đối tác × phi. Đây là bản để mang đi đối chiếu công nợ với đối tác và để lưu ngoài
   app — trước đây muốn có thì chỉ còn tệp sao lưu JSON mà riêng admin đầu tiên tải được. Số tấn tính
   theo kg/cây HIỆN TẠI; con số gốc của công nợ là số cây / số cuộn. */
export async function loansCsv(env) {
  const [phiR, rowR] = await env.DB.batch([
    env.DB.prepare('SELECT id, kg_per_cay, bo_size, unit FROM phi ORDER BY sort'),
    env.DB.prepare(
      `SELECT l.*, d.name doitac_name, ${UNAME}, ${DUYET_NAME_LOAN},
         COALESCE((SELECT uv.name FROM users uv WHERE uv.id = l.voided_by), l.voided_name) voided_uname,
         (SELECT r.khu_id FROM receipts r WHERE r.grp = l.grp AND r.kind = 'vay' LIMIT 1) kho
       FROM loans l LEFT JOIN users u ON u.id = l.user_id LEFT JOIN doitac d ON d.id = l.doitac_id
         ${DUYET_JOIN_LOAN}
       ORDER BY l.ngay, l.id`
    ),
  ]);
  const phiBy = Object.fromEntries(phiR.results.map((p) => [p.id, p]));
  const esc = (x) => '"' + String(x == null ? '' : x).replace(/"/g, '""') + '"';
  /* Chữ NGƯỜI DÙNG GÕ (số biên bản, biển số, tên người, ghi chú, tên đối tác) mà Excel tự "hiểu" thì hỏng:
     số biên bản "01/10" thành ngày 1 tháng 10, "0123" mất số 0 đầu, số điện thoại "+849..." thành con số,
     và ghi chú mở đầu bằng "=" chạy như công thức trên máy người mở tệp. Viết ô đó dạng ="..." thì Excel
     giữ nguyên là chữ. Chỉ làm với ô có nguy cơ, để chữ bình thường vẫn là chữ bình thường khi mở bằng
     phần mềm khác. */
  const txt = (x) => {
    const v = String(x == null ? '' : x);
    if (!/^[=+\-@\t\r]/.test(v) && !/^[\d\s.,/:\-]+$/.test(v) && !/^\d+[eE]\d+$/.test(v)) return esc(v);
    return esc('="' + v.replace(/"/g, '""') + '"');
  };
  const gio = (ms) => (ms ? fmtDay(vnDay(ms)) + ' ' + new Date(ms + 7 * 3600e3).toISOString().slice(11, 16) : '');
  const TEN = { vay: 'Mình vay', tra_vay: 'Mình trả', cho_vay: 'Cho họ vay', tra_no: 'Họ trả' };
  const tan = (q, p) => csvDec(q * (p ? p.kg_per_cay : 0) / 1000, 3);
  const lines = [csvRow(['Ngày giao nhận', 'Đối tác', 'Loại', 'Phi', 'Đơn vị', 'Số lượng', 'Tấn', 'Số biên bản', 'Hạn trả', 'Người giao/nhận', 'Biển số xe',
    'Ghi chú', 'Phiếu kho (khu)', 'Người ghi', 'Ghi lúc', 'Trạng thái', 'Người duyệt', 'Duyệt lúc', 'Người huỷ', 'Huỷ lúc', 'Lý do huỷ'].map(esc))];
  const du = {};
  for (const r of rowR.results) {
    const p = phiBy[r.phi_id];
    lines.push(csvRow([esc(r.ngay ? fmtDay(r.ngay) : ''), txt(r.doitac_name || '#' + r.doitac_id), esc(TEN[r.kind] || r.kind), esc(r.phi_id), esc(p ? csvUnit(p) : ''),
      p ? csvQty(r.qty, p) : r.qty, tan(r.qty, p), txt(r.so_bb), esc(r.han ? fmtDay(r.han) : ''), txt(r.nguoi), txt(r.bien_so), txt(r.note), esc(r.kho),
      esc(r.uname), esc(gio(r.ts)), esc(r.voided ? 'Đã huỷ' : r.duyet_ts ? 'Đã duyệt' : 'Chờ duyệt'), esc(r.duyet_ts ? r.duyet_uname : ''), esc(gio(r.duyet_ts)),
      esc(r.voided ? r.voided_uname : ''), esc(r.voided ? gio(r.voided_ts) : ''), txt(r.voided_note)]));
    if (r.voided || !r.duyet_ts) continue;
    const k = r.doitac_id + '|' + r.phi_id;
    const x = du[k] || (du[k] = { ten: r.doitac_name || '#' + r.doitac_id, phi: r.phi_id, vay: 0, tra_vay: 0, cho_vay: 0, tra_no: 0 });
    x[r.kind] += r.qty;
  }
  lines.push('', csvRow([esc('DƯ NỢ (chỉ tính lần ghi đã duyệt, chưa huỷ)')]),
    csvRow(['Đối tác', 'Phi', 'Đơn vị', 'Đã vay', 'Đã trả', 'Mình còn nợ', 'Mình còn nợ (tấn)', 'Đã cho vay', 'Họ đã trả', 'Họ còn nợ', 'Họ còn nợ (tấn)'].map(esc)));
  const thuTu = Object.fromEntries(phiR.results.map((p, i) => [p.id, i]));
  for (const x of Object.values(du).sort((a, z) => a.ten.localeCompare(z.ten, 'vi') || (thuTu[a.phi] ?? 99) - (thuTu[z.phi] ?? 99))) {
    const p = phiBy[x.phi], q = (v) => (p ? csvQty(v, p) : v);
    const no = x.vay - x.tra_vay, co = x.cho_vay - x.tra_no;
    lines.push(csvRow([txt(x.ten), esc(x.phi), esc(p ? csvUnit(p) : ''), q(x.vay), q(x.tra_vay), q(no), tan(no, p), q(x.cho_vay), q(x.tra_no), q(co), tan(co, p)]));
  }
  return new Response(CSV_HEAD + lines.join('\r\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="so-vay-muon-${vnDay()}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
