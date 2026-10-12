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
   Trễ hạn không lưu: han < hôm nay mà đơn còn mở là trễ, máy khách tự tính.
   VỊ TRÍ của một đơn gồm bốn phần: truc (BẮT BUỘC, chữ tự do kiểu "X12-X17 / Y3-Y5"), phan_khu (bắt buộc khi admin
   đã lập danh mục phân khu), tang và cote (cao độ) — phải có ÍT NHẤT MỘT trong hai: đã ghi tầng thì cote
   không bắt buộc —, hang_muc (tuỳ chọn). Phân khu, hạng mục và loại cấu kiện chọn từ
   DANH MỤC do admin lập trước (bảng gc_muc) — để người giao bấm chọn thay vì gõ, và để cả đơn vị gọi một khu
   bằng đúng một tên: gõ tay thì "Khu A", "khu a", "KA" thành ba khu trên bảng. */
export const GC_MO = ['moi', 'nhan', 'lam'];
/* Tiến độ theo nấc 10% cho dễ bấm ngoài bãi; 100% không nằm ở đây vì đó là việc "xác nhận xong". Nấc 10 chứ
   không phải 25 như trước: báo cáo ca gửi cấp trên ghi "đang gia công 80%", "85%", và lấy thẳng số này.
   Đơn cũ đang 25% / 75% giữ nguyên số cho tới lần cập nhật sau. */
export const GC_PCT = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90];
// đơn bị mở lại về nấc cao nhất: việc còn dở là phần cuối, và 100% chỉ có được qua "xác nhận xong"
const GC_PCT_MO_LAI = 90;
const GC_BUOI = ['sang', 'chieu'];
// đơn đã xong / đã huỷ còn nằm trên bảng chung 30 ngày kể từ lần cập nhật cuối
const GC_GIU_MS = 30 * 864e5;
/* HUỶ = "đơn này KHÔNG CẦN LÀM NỮA". Không xoá đơn: xoá là mất dấu ai đã giao, ai đã làm tới đâu. Ba luật:
   1. Người giữ đơn phải bấm "ĐÃ BIẾT" (biet_ts). App không có thông báo đẩy, nên đây là cách duy nhất để người
      huỷ chắc chắn bên kia đã dừng tay; chưa bấm thì đơn còn nằm đầu danh sách của họ và người huỷ thấy "chưa xem".
      Đơn huỷ chưa được xem đi kèm bootstrap tối đa 30 ngày (người giữ đơn nghỉ hẳn thì không treo mãi).
   2. Đơn giữ nguyên tiến độ lúc huỷ ("dừng ở 50%"), ghi ai huỷ, lúc nào, vì sao (huy_by, huy_ts, huy_ly_do).
   3. Huỷ nhầm thì KHÔI PHỤC được trong 7 ngày: đơn về đúng trạng thái trước khi huỷ (huy_tt). */
export const GC_BAO_HUY_MS = 30 * 864e5;
const GC_KHOI_PHUC_MS = 7 * 864e5;
// hạn xa nhất: 1 năm. Xa hơn gần như chắc chắn là gõ nhầm năm, và đơn đó sẽ không bao giờ hiện "trễ"
const GC_HAN_MAX_MS = 366 * 864e5;
const GC_SELECT = `SELECT d.id, d.cau_kien, d.hang_muc, d.phan_khu, d.tang, d.cote, d.truc, d.noi_dung, d.user_id, d.han, d.buoi, d.tt, d.pct, d.vuong,
    d.giao_by, d.ts, d.cap_ts, d.xong_ts, d.huy_ly_do, d.mo_lai, d.huy_ts, d.biet_ts,
    COALESCE(u.name, '(đã xoá)') uname, COALESCE(g.name, '(đã xoá)') giao_name, h.name huy_name
  FROM don_gc d LEFT JOIN users u ON u.id = d.user_id LEFT JOIN users g ON g.id = d.giao_by LEFT JOIN users h ON h.id = d.huy_by`;

const chu = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
const khongThay = () => new HttpError(404, 'Không tìm thấy đơn gia công');
const vuaDoi = () => new HttpError(409, 'Đơn vừa được người khác cập nhật. Màn hình đã tải lại, hãy xem rồi làm lại.', 'changed');

// danh mục chọn nhanh, admin lập trước: phân khu, hạng mục, loại cấu kiện ("Khác" luôn có sẵn ở máy khách, không lưu)
export const GC_MUC = { khu: 'phân khu', hm: 'hạng mục', ck: 'loại cấu kiện' };
const GC_MUC_MAX = 40;
const MUC_SQL = 'SELECT id, loai, ten FROM gc_muc ORDER BY loai, sort, id';
const xepMuc = (rows) => { const o = { khu: [], hm: [], ck: [] }; rows.forEach((r) => { if (o[r.loai]) o[r.loai].push({ id: r.id, ten: r.ten }); }); return o; };
// so tên không phân hoa/thường (COLLATE NOCASE của SQLite chỉ biết chữ không dấu, nên so ở đây)
const mucTen = (ds, v) => { const x = ds.find((m) => m.ten.toLowerCase() === String(v).toLowerCase()); return x ? x.ten : null; };

// đọc và kiểm nội dung đơn. cu: đơn đang có (khi sửa) — hạn cũ đã qua, mục đã bị xoá khỏi danh mục thì vẫn giữ được nếu không đổi
async function docDon(env, b, cu) {
  const cau_kien = chu(b.cau_kien, 80);
  if (!cau_kien) throw bad('Cần chọn loại cấu kiện hoặc ghi tên cấu kiện');
  const truc = chu(b.truc, 60);
  if (!truc) throw bad('Cần ghi vị trí trục');
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
  const [uR, mR] = await env.DB.batch([
    env.DB.prepare('SELECT id, name, role, deleted FROM users WHERE id = ?').bind(uid),
    env.DB.prepare(MUC_SQL),
  ]);
  const u = uR.results[0];
  // đơn đang có giữ được người cũ dù họ vừa đổi vai trò; giao MỚI thì chỉ giao cho Tiểu đội trưởng
  if (!u || ((u.deleted || u.role !== 'tieudoi') && !(cu && cu.user_id === uid))) throw bad('Chỉ giao đơn cho Tiểu đội trưởng đang dùng app');
  /* Phân khu và hạng mục lấy theo danh mục, ghi đúng cách viết trong danh mục. Danh mục còn trống (admin
     chưa lập) thì chưa đòi phân khu và hạng mục nhận chữ tự do — không thì cả tính năng đứng im cho tới khi
     admin vào thiết lập. */
  const muc = xepMuc(mR.results);
  let phan_khu = chu(b.phan_khu, 40) || null, hang_muc = chu(b.hang_muc, 60) || null;
  if (muc.khu.length) {
    if (!phan_khu) throw bad('Cần chọn phân khu');
    const ten = mucTen(muc.khu, phan_khu);
    if (ten) phan_khu = ten;
    else if (!(cu && cu.phan_khu === phan_khu)) throw bad('Phân khu "' + phan_khu + '" không có trong danh mục. Admin thêm ở Gia công → Thiết lập.');
  }
  if (hang_muc && muc.hm.length) {
    const ten = mucTen(muc.hm, hang_muc);
    if (ten) hang_muc = ten;
    else if (!(cu && cu.hang_muc === hang_muc)) throw bad('Hạng mục "' + hang_muc + '" không có trong danh mục. Admin thêm ở Gia công → Thiết lập.');
  }
  /* Tầng hoặc cote: phải biết cấu kiện nằm ở cao độ nào. Có tầng rồi thì cote không bắt buộc. Đơn cũ (trước khi
     có luật này) không có cả hai thì vẫn sửa được nếu vẫn để trống cả hai. */
  const tang = chu(b.tang, 20) || null, cote = chu(b.cote, 20) || null;
  if (!tang && !cote && !(cu && !cu.tang && !cu.cote)) throw bad('Cần ghi tầng hoặc cote (đã ghi tầng thì cote không bắt buộc)');
  return { cau_kien, hang_muc, phan_khu, tang, cote, truc, noi_dung: chu(b.noi_dung, 300) || null, han, buoi, user_id: uid, uname: u.name };
}

/* Bảng chung: mọi đơn còn mở, cộng đơn đã xong / đã huỷ trong 30 ngày gần đây. Kèm danh sách Tiểu đội
   trưởng (id, tên) để người giao chọn — /users chỉ admin gọi được, mà người giao là từ CVKTHT trở lên. */
export async function gcList(env) {
  const [don, tdt, muc] = await env.DB.batch([
    /* Hai nửa nối bằng UNION ALL chứ không dùng OR: mỗi nửa đi thẳng theo index (tt, cap_ts), còn OR thì
       quét cả bảng — mà bảng này chỉ dài ra, và mỗi lần có người cập nhật là mọi máy đang mở bảng tải lại. */
    env.DB.prepare(`SELECT * FROM (${GC_SELECT} WHERE d.tt IN ('moi', 'nhan', 'lam')
                    UNION ALL ${GC_SELECT} WHERE d.tt IN ('xong', 'huy') AND d.cap_ts > ?) ORDER BY han, id`).bind(Date.now() - GC_GIU_MS),
    env.DB.prepare("SELECT id, name FROM users WHERE role = 'tieudoi' AND deleted = 0 ORDER BY name"),
    env.DB.prepare(MUC_SQL),
  ]);
  return json({ items: don.results, tdt: tdt.results, muc: xepMuc(muc.results) });
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

// một đơn CÒN MỞ khác (id khác boQua) của cùng người, giống hệt cấu kiện + phân khu + tầng + cote + trục
const donTrung = (env, f, boQua) => env.DB.prepare(
  `SELECT d.id, d.ts, COALESCE(g.name, '(đã xoá)') giao_name FROM don_gc d LEFT JOIN users g ON g.id = d.giao_by
   WHERE d.tt IN ('moi', 'nhan', 'lam') AND d.id <> ?1 AND d.user_id = ?2 AND d.cau_kien = ?3 COLLATE NOCASE
     AND COALESCE(d.phan_khu, '') = ?4 COLLATE NOCASE AND COALESCE(d.tang, '') = ?5 COLLATE NOCASE
     AND COALESCE(d.cote, '') = ?6 COLLATE NOCASE AND COALESCE(d.truc, '') = ?7 COLLATE NOCASE
   ORDER BY d.id DESC LIMIT 1`).bind(boQua, f.user_id, f.cau_kien, f.phan_khu || '', f.tang || '', f.cote || '', f.truc || '').first();
const viTriTxt = (f) => [f.cau_kien, f.phan_khu, f.tang ? 'tầng ' + f.tang : '', f.cote ? 'cote ' + f.cote : '', f.truc ? 'trục ' + f.truc : ''].filter(Boolean).join(', ');

/* ĐƠN TRÙNG: người nhận đang giữ một đơn CÒN MỞ giống hệt (cấu kiện, phân khu, tầng, cote, trục). Hai đường dẫn tới đó,
   đều thật: mạng chập chờn làm mất câu trả lời nên người giao bấm lại, và "giao đơn giống đơn này" /
   "giao + đơn tiếp" mà quên sửa trục. Dừng lại hỏi chứ không chặn hẳn: máy khách gửi lại kèm trung = true. */
export async function gcCreate(req, env, user) {
  const b = await readJson(req);
  const f = await docDon(env, b, null);
  if (!b.trung) {
    const t = await donTrung(env, f, 0);
    if (t) {
      throw new HttpError(409, `${f.uname} đang giữ một đơn còn mở giống hệt: ${viTriTxt(f)} (${t.giao_name} giao ngày ${fmtDay(vnDay(t.ts))}).\n\nNếu vừa bấm giao mà mạng chập chờn thì đơn đã vào rồi. Vẫn giao thêm một đơn nữa?`, 'trung');
    }
  }
  const ts = Date.now();
  const r = await env.DB.batch([
    env.DB.prepare(`INSERT INTO don_gc (cau_kien, hang_muc, phan_khu, tang, cote, truc, noi_dung, user_id, han, buoi, tt, pct, giao_by, ts, cap_ts)
                    VALUES (?,?,?,?,?,?,?,?,?,?,'moi',0,?,?,?)`).bind(f.cau_kien, f.hang_muc, f.phan_khu, f.tang, f.cote, f.truc, f.noi_dung, f.user_id, f.han, f.buoi, user.id, ts, ts),
    auditStmt(env, user, 'gc_giao', { cau_kien: f.cau_kien, hang_muc: f.hang_muc, phan_khu: f.phan_khu, tang: f.tang, cote: f.cote, truc: f.truc, cho: f.uname, han: f.han }),
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
  if (f.phan_khu !== d.phan_khu) doi.push('phân khu: ' + (f.phan_khu || '(bỏ)'));
  if (f.tang !== d.tang) doi.push('tầng: ' + (f.tang || '(bỏ)'));
  if (f.cote !== d.cote) doi.push('cote: ' + (f.cote || '(bỏ)'));
  if (f.truc !== d.truc) doi.push('trục: ' + f.truc);
  if (f.noi_dung !== d.noi_dung) doi.push('đổi nội dung');
  const hanTxt = (x) => fmtDay(x.han) + (x.buoi === 'sang' ? ' sáng' : x.buoi === 'chieu' ? ' chiều' : '');
  if (f.han !== d.han || f.buoi !== d.buoi) doi.push('hạn ' + hanTxt(d) + ' → ' + hanTxt(f));
  const giaoLai = f.user_id !== d.user_id;
  if (giaoLai) doi.push('giao lại: ' + d.uname + ' → ' + f.uname);
  if (!doi.length) return json({ ok: true, id, doi: 0 });
  const ts = Math.max(Date.now(), d.cap_ts + 1);
  await batchGuarded(env, guardStmt(env, 'NOT EXISTS (SELECT 1 FROM don_gc WHERE id = ?1 AND cap_ts = ?2)', id, d.cap_ts), [
    env.DB.prepare('UPDATE don_gc SET cau_kien = ?, hang_muc = ?, phan_khu = ?, tang = ?, cote = ?, truc = ?, noi_dung = ?, user_id = ?, han = ?, buoi = ?, tt = ?, cap_ts = ? WHERE id = ?')
      .bind(f.cau_kien, f.hang_muc, f.phan_khu, f.tang, f.cote, f.truc, f.noi_dung, f.user_id, f.han, f.buoi, giaoLai ? 'moi' : d.tt, ts, id),
    env.DB.prepare('INSERT INTO don_gc_log (don_id, ts, user_id, viec, pct, note) VALUES (?,?,?,?,?,?)').bind(id, ts, user.id, 'sua', d.pct, doi.join(' · ')),
    auditStmt(env, user, 'gc_sua', { id, cau_kien: f.cau_kien, doi }),
    bump(env),
  ], vuaDoi());
  return json({ ok: true, id, doi: doi.length });
}

/* DANH MỤC chọn nhanh (chỉ admin): thêm và xoá một mục. Đơn lưu TÊN chứ không lưu id của mục, nên xoá một mục
   không đụng tới đơn nào đã giao — đơn cũ vẫn mang tên đó, chỉ là không chọn được cho đơn mới nữa. Muốn đổi
   tên thì xoá rồi thêm lại. */
export async function gcMucAdd(req, env, user) {
  const b = await readJson(req);
  const loai = String(b.loai || '');
  if (!GC_MUC[loai]) throw bad('Loại danh mục không hợp lệ');
  const ten = chu(b.ten, loai === 'hm' ? 60 : 40);
  if (!ten) throw bad('Cần ghi tên ' + GC_MUC[loai]);
  if (loai === 'ck' && ten.toLowerCase() === 'khác') throw bad('"Khác" luôn có sẵn, không cần thêm');
  const co = (await env.DB.prepare('SELECT ten FROM gc_muc WHERE loai = ?').bind(loai).all()).results;
  if (co.some((m) => m.ten.toLowerCase() === ten.toLowerCase())) throw bad('Đã có ' + GC_MUC[loai] + ' "' + ten + '"');
  if (co.length >= GC_MUC_MAX) throw bad('Danh mục ' + GC_MUC[loai] + ' đã đủ ' + GC_MUC_MAX + ' mục. Xoá bớt mục không dùng.');
  const r = await env.DB.batch([
    env.DB.prepare('INSERT INTO gc_muc (loai, ten, sort) VALUES (?1, ?2, (SELECT COALESCE(MAX(sort), 0) + 1 FROM gc_muc WHERE loai = ?1))').bind(loai, ten),
    auditStmt(env, user, 'gc_muc', { loai, ten }),
    bump(env),
  ]);
  return json({ ok: true, id: r[0].meta.last_row_id });
}
export async function gcMucXoa(env, user, id) {
  const m = Number.isInteger(id) ? await env.DB.prepare('SELECT id, loai, ten FROM gc_muc WHERE id = ?').bind(id).first() : null;
  if (!m) throw new HttpError(404, 'Không tìm thấy mục này');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM gc_muc WHERE id = ?').bind(id),
    auditStmt(env, user, 'gc_muc', { loai: m.loai, ten: m.ten, xoa: true }),
    bump(env),
  ]);
  return json({ ok: true });
}

/* Một việc trên đơn.
   Của NGƯỜI ĐƯỢC GIAO (và chỉ họ): nhan, tiendo, vuong, hetvuong, xong.
   Của NGƯỜI ĐƯỢC GIAO còn có: biet — bấm "đã biết" trên đơn vừa bị huỷ (xem luật huỷ ở đầu tệp).
   Của CVKTHT trở lên: huy, molai (mở lại đơn đã xong), khoiphuc (khôi phục đơn huỷ nhầm) — đều bắt buộc ghi lý do.
   Kiểm quyền TRƯỚC khi tìm đơn, để người không có quyền nhận 403 chứ không dò được đơn nào có thật. */
const VIEC_QL = ['huy', 'molai', 'khoiphuc'];
const VIEC_CUA = ['nhan', 'tiendo', 'vuong', 'hetvuong', 'xong', 'biet'];
export async function gcViec(req, env, user, id, viec) {
  if (!VIEC_QL.includes(viec) && !VIEC_CUA.includes(viec)) throw new HttpError(404, 'Không tìm thấy');
  if (VIEC_QL.includes(viec) && capOf(user.role) < 1) throw new HttpError(403, 'Bạn không có quyền thực hiện việc này');
  if (!Number.isInteger(id)) throw khongThay();
  const b = await readJson(req);
  const d = await env.DB.prepare(`${GC_SELECT} WHERE d.id = ?`).bind(id).first();
  if (!d) throw khongThay();
  if (VIEC_CUA.includes(viec) && d.user_id !== user.id) throw new HttpError(403, 'Chỉ ' + d.uname + ' (người được giao đơn này) mới làm được việc đó');
  const sai = (msg) => new HttpError(409, msg, 'tt');
  const dong = d.tt === 'xong' ? 'Đơn đã xong.' : d.tt === 'huy' ? 'Đơn đã huỷ, không cần làm nữa.' : '';
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
    // giữ nguyên pct ("dừng ở 50%"); nhớ trạng thái trước khi huỷ để khôi phục về đúng chỗ; cờ vướng hết nghĩa
    Object.assign(set, { tt: 'huy', huy_ly_do: note, huy_by: user.id, huy_ts: ts, huy_tt: d.tt, biet_ts: null, vuong: null, mo_lai: null });
    audit = 'gc_huy';
  } else if (viec === 'biet') {
    if (d.tt !== 'huy') throw sai('Đơn này không bị huỷ.');
    if (d.biet_ts) throw sai('Bạn đã báo đã biết rồi.');
    set.biet_ts = ts;
  } else if (viec === 'khoiphuc') {
    if (d.tt !== 'huy') throw sai('Chỉ khôi phục được đơn đã huỷ.');
    if (Date.now() - (d.huy_ts || d.cap_ts) > GC_KHOI_PHUC_MS) throw sai('Đơn huỷ đã quá 7 ngày, không khôi phục được nữa. Hãy giao đơn mới (có nút "Giao đơn mới giống đơn này").');
    note = chu(b.ly_do, 200);
    if (!note) throw bad('Cần ghi lý do khôi phục đơn');
    // trong lúc đơn nằm ở trạng thái huỷ có thể đã có người giao lại đúng việc đó: khôi phục nữa là hai đơn một việc
    const t = await donTrung(env, d, d.id);
    if (t) throw sai(d.uname + ' đang giữ một đơn còn mở giống hệt (' + t.giao_name + ' giao ngày ' + fmtDay(vnDay(t.ts)) + '). Không khôi phục thêm đơn này.');
    const truoc = (await env.DB.prepare('SELECT huy_tt FROM don_gc WHERE id = ?').bind(id).first('huy_tt')) || (d.pct > 0 ? 'lam' : 'moi');
    /* Về đúng trạng thái trước khi huỷ. Lý do khôi phục ghi vào mo_lai — cùng chỗ với "bị mở lại" — để người
       giữ đơn thấy ngay trên thẻ và ở Tổng quan rằng đơn này quay lại, phải làm tiếp. */
    Object.assign(set, { tt: GC_MO.includes(truoc) ? truoc : 'moi', huy_ly_do: null, huy_by: null, huy_ts: null, huy_tt: null, biet_ts: null, mo_lai: 'Khôi phục sau khi huỷ: ' + note });
    audit = 'gc_khoiphuc';
  } else {
    if (d.tt !== 'xong') throw sai('Chỉ mở lại được đơn đã xong.');
    note = chu(b.ly_do, 200);
    if (!note) throw bad('Cần ghi lý do mở lại đơn');
    Object.assign(set, { tt: 'lam', pct: GC_PCT_MO_LAI, xong_ts: null, mo_lai: note });
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
