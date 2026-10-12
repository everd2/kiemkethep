// Đơn giao gia công cấu kiện: giao cho Tiểu đội trưởng, họ nhận, cập nhật tiến độ, xác nhận xong.
import { DAY_RE, HttpError, bad, capOf, fmtDay, json, vnDay } from './core.js';
import { auditStmt, batchGuarded, bump, guardStmt, readJson } from './helpers.js';

/* ========================= GIA CÔNG CẤU KIỆN =========================
   Tách hẳn khỏi phần đếm thép: đơn gia công KHÔNG đụng tới tồn, số đếm hay phiếu kho.
   Khác với phần còn lại của app ở hai chỗ, cả hai đều cố ý:
   - AI CŨNG XEM ĐƯỢC MỌI ĐƠN. Thẻ nhắc ở Tổng quan vẫn riêng từng người, nhưng bảng đơn là bảng chung
     của cả đơn vị — mục đích là ai cũng biết tiểu đội nào đang làm gì, tới đâu.
   - KHÔNG CÓ BƯỚC DUYỆT. Người được giao tự nhận đơn và tự xác nhận xong. Vì không ai kiểm lại, CVKTHT
     trở lên có nút MỞ LẠI đơn đã xong, bắt buộc ghi lý do.
   tt: 'moi' vừa giao, chưa nhận · 'nhan' đã nhận · 'lam' đang làm (pct > 0) · 'xong' · 'huy'.
   mo_lai: lý do đơn bị MỞ LẠI sau khi đã báo xong; còn đó cho tới khi đơn xong lần nữa (hoặc bị huỷ), để
   người được giao thấy ngay vì sao đơn của mình quay lại.
   vuong: lý do đang kẹt (thiếu thép, chưa có bản vẽ...); NULL = không vướng. Vướng là cờ đi kèm, không
   phải một trạng thái: đơn đang làm 50% vẫn có thể đang vướng.
   Trễ hạn không lưu: han < hôm nay mà đơn còn mở là trễ, máy khách tự tính. */
export const GC_MO = ['moi', 'nhan', 'lam'];
// tiến độ theo nấc cho dễ bấm ngoài bãi; 100% không nằm ở đây vì đó là việc "xác nhận xong"
export const GC_PCT = [0, 25, 50, 75];
const GC_BUOI = ['sang', 'chieu'];
// đơn đã xong / đã huỷ còn nằm trên bảng chung 30 ngày kể từ lần cập nhật cuối
const GC_GIU_MS = 30 * 864e5;
// đơn vừa bị huỷ còn được nhắc cho người đang giữ nó trong 2 ngày (xem bootstrap), kẻo họ vẫn làm tiếp
export const GC_BAO_HUY_MS = 2 * 864e5;
// hạn xa nhất: 1 năm. Xa hơn gần như chắc chắn là gõ nhầm năm, và đơn đó sẽ không bao giờ hiện "trễ"
const GC_HAN_MAX_MS = 366 * 864e5;
const GC_SELECT = `SELECT d.id, d.cau_kien, d.hang_muc, d.truc, d.noi_dung, d.user_id, d.han, d.buoi, d.tt, d.pct, d.vuong,
    d.giao_by, d.ts, d.cap_ts, d.xong_ts, d.huy_ly_do, d.mo_lai,
    COALESCE(u.name, '(đã xoá)') uname, COALESCE(g.name, '(đã xoá)') giao_name
  FROM don_gc d LEFT JOIN users u ON u.id = d.user_id LEFT JOIN users g ON g.id = d.giao_by`;

const chu = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
const khongThay = () => new HttpError(404, 'Không tìm thấy đơn gia công');
const vuaDoi = () => new HttpError(409, 'Đơn vừa được người khác cập nhật. Màn hình đã tải lại, hãy xem rồi làm lại.', 'changed');

// đọc và kiểm nội dung đơn. cu: đơn đang có (khi sửa) — hạn cũ đã qua thì vẫn giữ được nếu không đổi
async function docDon(env, b, cu) {
  const cau_kien = chu(b.cau_kien, 80);
  if (!cau_kien) throw bad('Cần ghi tên cấu kiện');
  const han = String(b.han || '');
  /* Ngày phải CÓ THẬT: Date đọc "2026-02-31" thành 03/03 chứ không báo lỗi, nên phải dựng lại rồi so.
     Lưu một ngày không có thật là mọi phép so hạn ("trễ mấy ngày") về sau đều sai. */
  const dt = DAY_RE.test(han) ? new Date(han + 'T00:00:00Z') : null;
  if (!dt || Number.isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== han) throw bad('Cần chọn ngày cần xong');
  if (!(cu && cu.han === han)) {
    if (han < vnDay()) throw bad('Ngày cần xong không được trước hôm nay');
    if (han > vnDay(Date.now() + GC_HAN_MAX_MS)) throw bad('Ngày cần xong xa quá một năm. Kiểm tra lại năm.');
  }
  const buoi = b.buoi ? String(b.buoi) : null;
  if (buoi && !GC_BUOI.includes(buoi)) throw bad('Buổi không hợp lệ');
  const uid = Number(b.user);
  if (!Number.isInteger(uid)) throw bad('Cần chọn Tiểu đội trưởng nhận đơn');
  const u = await env.DB.prepare('SELECT id, name, role, deleted FROM users WHERE id = ?').bind(uid).first();
  // đơn đang có giữ được người cũ dù họ vừa đổi vai trò; giao MỚI thì chỉ giao cho Tiểu đội trưởng
  if (!u || ((u.deleted || u.role !== 'tieudoi') && !(cu && cu.user_id === uid))) throw bad('Chỉ giao đơn cho Tiểu đội trưởng đang dùng app');
  return { cau_kien, hang_muc: chu(b.hang_muc, 60) || null, truc: chu(b.truc, 60) || null, noi_dung: chu(b.noi_dung, 300) || null, han, buoi, user_id: uid, uname: u.name };
}

/* Bảng chung: mọi đơn còn mở, cộng đơn đã xong / đã huỷ trong 30 ngày gần đây. Kèm danh sách Tiểu đội
   trưởng (id, tên) để người giao chọn — /users chỉ admin gọi được, mà người giao là từ CVKTHT trở lên. */
export async function gcList(env) {
  const [don, tdt] = await env.DB.batch([
    /* Hai nửa nối bằng UNION ALL chứ không dùng OR: mỗi nửa đi thẳng theo index (tt, cap_ts), còn OR thì
       quét cả bảng — mà bảng này chỉ dài ra, và mỗi lần có người cập nhật là mọi máy đang mở bảng tải lại. */
    env.DB.prepare(`SELECT * FROM (${GC_SELECT} WHERE d.tt IN ('moi', 'nhan', 'lam')
                    UNION ALL ${GC_SELECT} WHERE d.tt IN ('xong', 'huy') AND d.cap_ts > ?) ORDER BY han, id`).bind(Date.now() - GC_GIU_MS),
    env.DB.prepare("SELECT id, name FROM users WHERE role = 'tieudoi' AND deleted = 0 ORDER BY name"),
  ]);
  return json({ items: don.results, tdt: tdt.results });
}

export async function gcView(env, id) {
  if (!Number.isInteger(id)) throw khongThay();
  const [don, log] = await env.DB.batch([
    env.DB.prepare(`${GC_SELECT} WHERE d.id = ?`).bind(id),
    env.DB.prepare(`SELECT l.id, l.ts, l.viec, l.pct, l.note, COALESCE(u.name, '(đã xoá)') uname
                    FROM don_gc_log l LEFT JOIN users u ON u.id = l.user_id WHERE l.don_id = ? ORDER BY l.id DESC`).bind(id),
  ]);
  if (!don.results.length) throw khongThay();
  return json({ don: don.results[0], log: log.results });
}

export async function gcCreate(req, env, user) {
  const f = await docDon(env, await readJson(req), null);
  const ts = Date.now();
  const r = await env.DB.batch([
    env.DB.prepare(`INSERT INTO don_gc (cau_kien, hang_muc, truc, noi_dung, user_id, han, buoi, tt, pct, giao_by, ts, cap_ts)
                    VALUES (?,?,?,?,?,?,?,'moi',0,?,?,?)`).bind(f.cau_kien, f.hang_muc, f.truc, f.noi_dung, f.user_id, f.han, f.buoi, user.id, ts, ts),
    auditStmt(env, user, 'gc_giao', { cau_kien: f.cau_kien, hang_muc: f.hang_muc, truc: f.truc, cho: f.uname, han: f.han }),
    bump(env),
  ]);
  return json({ ok: true, id: r[0].meta.last_row_id });
}

/* Sửa đơn / giao lại (CVKTHT trở lên), chỉ khi đơn còn mở. Giao cho người khác thì đơn về "mới giao":
   người mới phải tự nhận, không thừa hưởng lần nhận của người cũ. Mỗi lần sửa ghi rõ đổi gì vào lịch sử
   của đơn, nhất là HẠN — dời hạn mà không để dấu thì bảng "trễ hạn" không còn nghĩa. */
export async function gcUpdate(req, env, user, id) {
  if (!Number.isInteger(id)) throw khongThay();
  const b = await readJson(req);
  const d = await env.DB.prepare(`${GC_SELECT} WHERE d.id = ?`).bind(id).first();
  if (!d) throw khongThay();
  if (!GC_MO.includes(d.tt)) throw new HttpError(409, d.tt === 'xong' ? 'Đơn đã xong, không sửa được. Mở lại đơn trước.' : 'Đơn đã huỷ, không sửa được.');
  const f = await docDon(env, b, d);
  const doi = [];
  if (f.cau_kien !== d.cau_kien) doi.push('cấu kiện: ' + f.cau_kien);
  if (f.hang_muc !== d.hang_muc) doi.push('hạng mục: ' + (f.hang_muc || '(bỏ)'));
  if (f.truc !== d.truc) doi.push('trục: ' + (f.truc || '(bỏ)'));
  if (f.noi_dung !== d.noi_dung) doi.push('đổi nội dung');
  const hanTxt = (x) => fmtDay(x.han) + (x.buoi === 'sang' ? ' sáng' : x.buoi === 'chieu' ? ' chiều' : '');
  if (f.han !== d.han || f.buoi !== d.buoi) doi.push('hạn ' + hanTxt(d) + ' → ' + hanTxt(f));
  const giaoLai = f.user_id !== d.user_id;
  if (giaoLai) doi.push('giao lại: ' + d.uname + ' → ' + f.uname);
  if (!doi.length) return json({ ok: true, id, doi: 0 });
  const ts = Math.max(Date.now(), d.cap_ts + 1);
  await batchGuarded(env, guardStmt(env, 'NOT EXISTS (SELECT 1 FROM don_gc WHERE id = ?1 AND cap_ts = ?2)', id, d.cap_ts), [
    env.DB.prepare('UPDATE don_gc SET cau_kien = ?, hang_muc = ?, truc = ?, noi_dung = ?, user_id = ?, han = ?, buoi = ?, tt = ?, cap_ts = ? WHERE id = ?')
      .bind(f.cau_kien, f.hang_muc, f.truc, f.noi_dung, f.user_id, f.han, f.buoi, giaoLai ? 'moi' : d.tt, ts, id),
    env.DB.prepare('INSERT INTO don_gc_log (don_id, ts, user_id, viec, pct, note) VALUES (?,?,?,?,?,?)').bind(id, ts, user.id, 'sua', d.pct, doi.join(' · ')),
    auditStmt(env, user, 'gc_sua', { id, cau_kien: f.cau_kien, doi }),
    bump(env),
  ], vuaDoi());
  return json({ ok: true, id, doi: doi.length });
}

/* Một việc trên đơn.
   Của NGƯỜI ĐƯỢC GIAO (và chỉ họ): nhan, tiendo, vuong, hetvuong, xong.
   Của CVKTHT trở lên: huy, molai (mở lại đơn đã xong) — cả hai bắt buộc ghi lý do.
   Kiểm quyền TRƯỚC khi tìm đơn, để người không có quyền nhận 403 chứ không dò được đơn nào có thật. */
const VIEC_QL = ['huy', 'molai'];
const VIEC_CUA = ['nhan', 'tiendo', 'vuong', 'hetvuong', 'xong'];
export async function gcViec(req, env, user, id, viec) {
  if (!VIEC_QL.includes(viec) && !VIEC_CUA.includes(viec)) throw new HttpError(404, 'Không tìm thấy');
  if (VIEC_QL.includes(viec) && capOf(user.role) < 1) throw new HttpError(403, 'Bạn không có quyền thực hiện việc này');
  if (!Number.isInteger(id)) throw khongThay();
  const b = await readJson(req);
  const d = await env.DB.prepare(`${GC_SELECT} WHERE d.id = ?`).bind(id).first();
  if (!d) throw khongThay();
  if (VIEC_CUA.includes(viec) && d.user_id !== user.id) throw new HttpError(403, 'Chỉ ' + d.uname + ' (người được giao đơn này) mới làm được việc đó');
  const sai = (msg) => new HttpError(409, msg, 'tt');
  const dong = d.tt === 'xong' ? 'Đơn đã xong.' : d.tt === 'huy' ? 'Đơn đã huỷ.' : '';
  const ts = Math.max(Date.now(), d.cap_ts + 1);
  const set = {};
  let note = null, audit = null;
  if (viec === 'nhan') {
    if (d.tt !== 'moi') throw sai(dong || 'Đơn này đã nhận rồi.');
    set.tt = 'nhan';
  } else if (viec === 'tiendo') {
    if (d.tt === 'moi') throw sai('Hãy nhận đơn trước khi cập nhật tiến độ.');
    if (dong) throw sai(dong);
    const pct = Number(b.pct);
    if (!GC_PCT.includes(pct)) throw bad('Tiến độ không hợp lệ');
    note = chu(b.note, 200) || null;
    if (pct === d.pct && !note) throw bad('Tiến độ chưa đổi. Chọn mức khác hoặc ghi chú thêm.');
    set.pct = pct;
    if (pct > 0) set.tt = 'lam';
  } else if (viec === 'vuong') {
    if (dong) throw sai(dong);
    note = chu(b.ly_do, 200);
    if (!note) throw bad('Cần ghi đang vướng gì');
    set.vuong = note;
  } else if (viec === 'hetvuong') {
    if (dong) throw sai(dong);
    if (!d.vuong) throw sai('Đơn này không còn vướng.');
    set.vuong = null;
  } else if (viec === 'xong') {
    if (d.tt === 'moi') throw sai('Hãy nhận đơn trước khi xác nhận xong.');
    if (dong) throw sai(dong);
    note = chu(b.note, 200) || null;
    Object.assign(set, { tt: 'xong', pct: 100, vuong: null, mo_lai: null, xong_ts: ts });
    audit = 'gc_xong';
  } else if (viec === 'huy') {
    if (dong) throw sai(dong + (d.tt === 'xong' ? ' Muốn làm lại thì mở lại đơn.' : ''));
    note = chu(b.ly_do, 200);
    if (!note) throw bad('Cần ghi lý do huỷ đơn');
    Object.assign(set, { tt: 'huy', huy_ly_do: note, mo_lai: null });
    audit = 'gc_huy';
  } else {
    if (d.tt !== 'xong') throw sai('Chỉ mở lại được đơn đã xong.');
    note = chu(b.ly_do, 200);
    if (!note) throw bad('Cần ghi lý do mở lại đơn');
    // về 75%: việc còn dở là phần cuối, và 100% chỉ có được qua "xác nhận xong"
    Object.assign(set, { tt: 'lam', pct: 75, xong_ts: null, mo_lai: note });
    audit = 'gc_molai';
  }
  const cot = Object.keys(set);
  const pctSau = set.pct === undefined ? d.pct : set.pct;
  const stmts = [
    env.DB.prepare(`UPDATE don_gc SET ${cot.map((c) => c + ' = ?').join(', ')}, cap_ts = ? WHERE id = ?`).bind(...cot.map((c) => set[c]), ts, id),
    env.DB.prepare('INSERT INTO don_gc_log (don_id, ts, user_id, viec, pct, note) VALUES (?,?,?,?,?,?)').bind(id, ts, user.id, viec, pctSau, note),
  ];
  // nhật ký chung chỉ ghi các mốc của đơn (giao, sửa, xong, huỷ, mở lại); từng lần cập nhật tiến độ nằm ở lịch sử của đơn
  if (audit) stmts.push(auditStmt(env, user, audit, { id, cau_kien: d.cau_kien, truc: d.truc, cua: d.uname, ly_do: VIEC_QL.includes(viec) ? note : undefined }));
  stmts.push(bump(env));
  await batchGuarded(env, guardStmt(env, 'NOT EXISTS (SELECT 1 FROM don_gc WHERE id = ?1 AND cap_ts = ?2)', id, d.cap_ts), stmts, vuaDoi());
  return json({ ok: true, id, tt: set.tt || d.tt, pct: pctSau });
}
