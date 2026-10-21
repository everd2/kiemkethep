// Đơn giao gia công cấu kiện: giao cho Tiểu đội trưởng, họ nhận, cập nhật tiến độ, xác nhận xong.
import { DAY_RE, HttpError, bad, capOf, fmtDay, json, vnDay } from './core.js';
import { auditStmt, batchGuarded, bump, guardStmt, readJson } from './helpers.js';
import { anhJson, docAnh } from './anh.js';

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
   bằng đúng một tên: gõ tay thì "Khu A", "khu a", "KA" thành ba khu trên bảng.
   ORDER: od_nguoi (người order) và od_dd (đại đội order) — ai đặt làm cấu kiện này; chữ tự do, đều không bắt buộc. */
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
/* ĐƠN XONG CHƯA XUẤT có index riêng (idx_don_gc_chua_xuat, index một phần — chỉ chứa đúng các đơn đó). Phải ÉP dùng
   (INDEXED BY): để tự chọn thì SQLite lấy index (tt, cap_ts) và đi qua MỌI đơn đã xong từ trước tới nay — đo trên
   6.000 đơn: 5.702 dòng mỗi lần mở app, mà chỉ 29 đơn là cần. Điều kiện phải viết đúng từng chữ như lúc tạo index. */
export const GC_CHUA_XUAT = "tt = 'xong' AND COALESCE(xuat_tt, '') <> 'duyet'";
export const GC_CHUA_XUAT_IDX = 'INDEXED BY idx_don_gc_chua_xuat';
const GC_SELECT = `SELECT d.id, d.cau_kien, d.hang_muc, d.phan_khu, d.tang, d.cote, d.truc, d.noi_dung, d.user_id, d.han, d.buoi, d.tt, d.pct, d.vuong,
    d.giao_by, d.ts, d.cap_ts, d.xong_ts, d.huy_ly_do, d.mo_lai, d.huy_ts, d.biet_ts,
    d.vuong_loai, d.vuong_dung, d.vuong_ts, d.vuong_xem_ts, d.lam_ts, d.cho_tl, d.tn_id,
    d.xuat_tt, d.xuat_ts, d.xuat_cho, d.xuat_note, d.xuat_duyet_ts, d.xuat_tu_choi, d.od_nguoi, d.od_dd, xg.name xuat_name, xd.name xuat_duyet_name,
    COALESCE(u.name, '(đã xoá)') uname, COALESCE(g.name, '(đã xoá)') giao_name, h.name huy_name, x.name vuong_xem_name,
    (SELECT json_group_array(json_object('id', n.user_id, 'ten', COALESCE(un.name, '(đã xoá)'), 'biet', n.biet_ts))
       FROM don_gc_nguoi n LEFT JOIN users un ON un.id = n.user_id WHERE n.don_id = d.id) nguoi_json
  FROM don_gc d LEFT JOIN users u ON u.id = d.user_id LEFT JOIN users g ON g.id = d.giao_by LEFT JOIN users h ON h.id = d.huy_by
    LEFT JOIN users x ON x.id = d.vuong_xem_by LEFT JOIN users xg ON xg.id = d.xuat_by LEFT JOIN users xd ON xd.id = d.xuat_duyet_by`;

/* NHIỀU NGƯỜI CÙNG LÀM MỘT ĐƠN (bảng don_gc_nguoi, tối đa GC_NGUOI_MAX): ví dụ tổ ca ngày và tổ ca đêm cùng làm
   một cấu kiện. Mọi người trong đơn NGANG NHAU: ai cũng nhận đơn (một người nhận là đơn đã nhận), cập nhật một % CHUNG,
   báo / hết vướng và xác nhận xong — xong rồi thì đơn khoá với tất cả. Riêng "đã biết" khi đơn bị huỷ là của TỪNG
   người (don_gc_nguoi.biet_ts): mọi tổ đang làm đều phải dừng tay; don_gc.biet_ts chỉ có khi tất cả đã biết.
   don_gc.user_id vẫn giữ người ĐẦU TIÊN được chọn (người chính): báo cáo ca và các chỗ chỉ cần một tên đọc cột này. */
export const GC_NGUOI_MAX = 4;
// gắn danh sách người vào dòng đơn đọc từ GC_SELECT; người chính đứng đầu; uname thành tên mọi người, nối bằng dấu phẩy
function docNguoi(d) {
  if (!d) return d;
  let ds = [];
  try { ds = JSON.parse(d.nguoi_json || '[]'); } catch (e) { ds = []; }
  if (!ds.length) ds = [{ id: d.user_id, ten: d.uname, biet: d.biet_ts }];
  ds.sort((a, z) => (z.id === d.user_id) - (a.id === d.user_id));
  delete d.nguoi_json;
  d.nguoi = ds;
  d.uname = ds.map((n) => n.ten).join(', ');
  return docAnh(d);
}
const chu = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
/* Tầng chỉ lưu phần riêng của nó: "1", "2", "B1", "Mái". Người giao gõ "Tầng 5" hay "5" đều thành "5", nên đơn
   trùng, gom và tìm theo tầng không bị tách đôi; chữ "Tầng" do màn hình tự thêm khi hiện. */
const chuTang = (v) => {
  const t = chu(v, 20).replace(/^(tầng|tang)\s*/i, '');
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : null;
};
// người / đại đội order: bản app cũ không gửi hai ô này, nên khi sửa đơn mà thiếu hẳn ô thì giữ giá trị cũ chứ không xoá
const odCua = (b, cu, k, max) => (b[k] === undefined && cu ? cu[k] || null : chu(b[k], max) || null);
const khongThay = () => new HttpError(404, 'Không tìm thấy đơn gia công');
const vuaDoi = () => new HttpError(409, 'Đơn vừa được người khác cập nhật. Màn hình đã tải lại, hãy xem rồi làm lại.', 'changed');

/* danh mục chọn nhanh, admin lập trước: phân khu, hạng mục, loại cấu kiện ("Khác" luôn có sẵn ở máy khách, không lưu),
   lý do vướng, người order, đại đội order. Hai mục order chỉ để bấm cho nhanh: vẫn gõ được tên ngoài danh mục. */
export const GC_MUC = { khu: 'phân khu', hm: 'hạng mục', ck: 'loại cấu kiện', vg: 'lý do vướng', od: 'người order', dd: 'đại đội order' };
const GC_MUC_MAX = 40;
const MUC_SQL = 'SELECT id, loai, ten FROM gc_muc ORDER BY loai, sort, id';
const xepMuc = (rows) => { const o = { khu: [], hm: [], ck: [], vg: [], od: [], dd: [] }; rows.forEach((r) => { if (o[r.loai]) o[r.loai].push({ id: r.id, ten: r.ten }); }); return o; };
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
  /* Người nhận: users (danh sách, người đầu là người chính) hoặc user (một người, bản app cũ). Đơn đang có giữ được
     người cũ dù họ vừa đổi vai trò; người MỚI thêm vào thì phải là Tiểu đội trưởng đang dùng app. */
  const ids = [...new Set((Array.isArray(b.users) ? b.users : [b.user]).map(Number))].filter(Number.isInteger);
  if (!ids.length) throw bad('Cần chọn Tiểu đội trưởng nhận đơn');
  if (ids.length > GC_NGUOI_MAX) throw bad('Một đơn giao tối đa ' + GC_NGUOI_MAX + ' người');
  const uid = ids[0], cuIds = cu ? (cu.nguoi || []).map((n) => n.id).concat(cu.user_id) : [];
  const [uR, mR] = await env.DB.batch([
    env.DB.prepare('SELECT id, name, role, deleted FROM users WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(ids)),
    env.DB.prepare(MUC_SQL),
  ]);
  const us = ids.map((i) => uR.results.find((r) => r.id === i));
  const u = { name: us.map((x) => (x ? x.name : '?')).join(', ') };
  // đơn đang có giữ được người cũ dù họ vừa đổi vai trò; giao MỚI thì chỉ giao cho Tiểu đội trưởng
  if (us.some((x, i) => !x || ((x.deleted || x.role !== 'tieudoi') && !cuIds.includes(ids[i])))) throw bad('Chỉ giao đơn cho Tiểu đội trưởng đang dùng app');
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
  const tang = chuTang(b.tang), cote = chu(b.cote, 20) || null;
  if (!tang && !cote && !(cu && !cu.tang && !cu.cote)) throw bad('Cần ghi tầng hoặc cote (đã ghi tầng thì cote không bắt buộc)');
  return { cau_kien, hang_muc, phan_khu, tang, cote, truc, noi_dung: chu(b.noi_dung, 300) || null, od_nguoi: odCua(b, cu, 'od_nguoi', 60), od_dd: odCua(b, cu, 'od_dd', 40), han, buoi, user_id: uid, user_ids: ids, uname: u.name };
}

/* Bảng chung: mọi đơn còn mở, cộng đơn đã xong / đã huỷ trong 30 ngày gần đây. Kèm danh sách Tiểu đội
   trưởng (id, tên) để người giao chọn — /users chỉ admin gọi được, mà người giao là từ CVKTHT trở lên. */
export async function gcList(env) {
  const [don, tdt, muc] = await env.DB.batch([
    /* Hai nửa nối bằng UNION ALL chứ không dùng OR: mỗi nửa đi thẳng theo index (tt, cap_ts), còn OR thì
       quét cả bảng — mà bảng này chỉ dài ra, và mỗi lần có người cập nhật là mọi máy đang mở bảng tải lại. */
    env.DB.prepare(`SELECT * FROM (${GC_SELECT} WHERE d.tt IN ('moi', 'nhan', 'lam')
                    UNION ALL ${GC_SELECT.replace('FROM don_gc d ', `FROM don_gc d ${GC_CHUA_XUAT_IDX} `)} WHERE d.tt = 'xong' AND COALESCE(d.xuat_tt, '') <> 'duyet'
                    UNION ALL ${GC_SELECT} WHERE d.tt IN ('xong', 'huy') AND d.cap_ts > ? AND (d.tt = 'huy' OR d.xuat_tt = 'duyet')) ORDER BY han, id`).bind(Date.now() - GC_GIU_MS),
    env.DB.prepare("SELECT id, name FROM users WHERE role = 'tieudoi' AND deleted = 0 ORDER BY name"),
    env.DB.prepare(MUC_SQL),
  ]);
  return json({ items: don.results.map(docNguoi), tdt: tdt.results, muc: xepMuc(muc.results) });
}

export async function gcView(env, id, user) {
  if (!Number.isInteger(id)) throw khongThay();
  const [don, log, muc, tn, doc] = await env.DB.batch([
    /* Ảnh biên bản xuất (xem src/anh.js) chỉ cần ở MÀN CHI TIẾT MỘT đơn, nên bọc riêng ở đây —
       không nhét vào GC_SELECT: đường đó còn chạy cho gcList (bảng chung, UNION ALL ba nhánh, tải
       lại mỗi lần ai cập nhật một đơn), thêm một subquery vào đó cho MỌI đơn chỉ để một màn chi
       tiết dùng là phí. Cột ngoài phải gọi g.id: viết trơn "id" thì SQLite hiểu là a.id của anh_bb. */
    env.DB.prepare(`SELECT g.*, ${anhJson('gc', 'g.id')} FROM (${GC_SELECT} WHERE d.id = ?) g`).bind(id),
    env.DB.prepare(`SELECT l.id, l.ts, l.viec, l.pct, l.note, COALESCE(u.name, '(đã xoá)') uname
                    FROM don_gc_log l LEFT JOIN users u ON u.id = l.user_id WHERE l.don_id = ? ORDER BY l.id DESC`).bind(id),
    env.DB.prepare(MUC_SQL),
    // trao đổi: 200 tin gần nhất (tin đã thu hồi không trả nội dung)
    env.DB.prepare(`SELECT * FROM (SELECT t.id, t.user_id, t.ts, CASE WHEN t.thu_hoi = 1 THEN NULL ELSE t.noi_dung END noi_dung, t.can_tl, t.thu_hoi,
                      COALESCE(u.name, '(đã xoá)') uname, u.role FROM don_gc_tn t LEFT JOIN users u ON u.id = t.user_id
                    WHERE t.don_id = ? ORDER BY t.id DESC LIMIT 200) ORDER BY id`).bind(id),
    env.DB.prepare('SELECT doc_id FROM don_gc_doc WHERE don_id = ? AND user_id = ?').bind(id, user ? user.id : 0),
  ]);
  if (!don.results.length) throw khongThay();
  return json({ don: docNguoi(don.results[0]), log: log.results, muc: xepMuc(muc.results), tn: tn.results, doc: (doc.results[0] || {}).doc_id || 0 });
}

// một đơn CÒN MỞ khác (id khác boQua) của cùng người, giống hệt cấu kiện + phân khu + tầng + cote + trục
const donTrung = (env, f, boQua) => env.DB.prepare(
  `SELECT d.id, d.ts, COALESCE(g.name, '(đã xoá)') giao_name FROM don_gc d LEFT JOIN users g ON g.id = d.giao_by
   WHERE d.tt IN ('moi', 'nhan', 'lam') AND d.id <> ?1 AND EXISTS (SELECT 1 FROM don_gc_nguoi n WHERE n.don_id = d.id AND n.user_id IN (SELECT value FROM json_each(?2))) AND d.cau_kien = ?3 COLLATE NOCASE
     AND COALESCE(d.phan_khu, '') = ?4 COLLATE NOCASE AND COALESCE(d.tang, '') = ?5 COLLATE NOCASE
     AND COALESCE(d.cote, '') = ?6 COLLATE NOCASE AND COALESCE(d.truc, '') = ?7 COLLATE NOCASE
   ORDER BY d.id DESC LIMIT 1`).bind(boQua, JSON.stringify(f.user_ids || [f.user_id]), f.cau_kien, f.phan_khu || '', f.tang || '', f.cote || '', f.truc || '').first();
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
    env.DB.prepare(`INSERT INTO don_gc (cau_kien, hang_muc, phan_khu, tang, cote, truc, noi_dung, od_nguoi, od_dd, user_id, han, buoi, tt, pct, giao_by, ts, cap_ts)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'moi',0,?,?,?)`).bind(f.cau_kien, f.hang_muc, f.phan_khu, f.tang, f.cote, f.truc, f.noi_dung, f.od_nguoi, f.od_dd, f.user_id, f.han, f.buoi, user.id, ts, ts),
    // MAX(id) = đơn vừa ghi ở câu trên: cả batch là một giao dịch
    env.DB.prepare('INSERT INTO don_gc_nguoi (don_id, user_id) SELECT (SELECT MAX(id) FROM don_gc), value FROM json_each(?)').bind(JSON.stringify(f.user_ids)),
    auditStmt(env, user, 'gc_giao', { cau_kien: f.cau_kien, hang_muc: f.hang_muc, phan_khu: f.phan_khu, tang: f.tang, cote: f.cote, truc: f.truc, cho: f.uname, han: f.han, od_nguoi: f.od_nguoi || undefined, od_dd: f.od_dd || undefined }),
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
  const d = docNguoi(await env.DB.prepare(`${GC_SELECT} WHERE d.id = ?`).bind(id).first());
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
  if (f.od_nguoi !== d.od_nguoi) doi.push('người order: ' + (f.od_nguoi || '(bỏ)'));
  if (f.od_dd !== d.od_dd) doi.push('đại đội order: ' + (f.od_dd || '(bỏ)'));
  const hanTxt = (x) => fmtDay(x.han) + (x.buoi === 'sang' ? ' sáng' : x.buoi === 'chieu' ? ' chiều' : '');
  if (f.han !== d.han || f.buoi !== d.buoi) doi.push('hạn ' + hanTxt(d) + ' → ' + hanTxt(f));
  /* Đổi người: thêm / bớt người cùng làm thì đơn giữ nguyên trạng thái. Đổi HẲN sang những người khác (không còn ai
     của nhóm cũ) mới là giao lại: đơn về "mới giao", người mới phải tự nhận. */
  const cuIds = d.nguoi.map((n) => n.id);
  const doiNguoi = f.user_ids.join() !== cuIds.join();
  const giaoLai = !f.user_ids.some((i) => cuIds.includes(i));
  if (doiNguoi) doi.push((giaoLai ? 'giao lại: ' : 'người làm: ') + d.uname + ' → ' + f.uname);
  if (!doi.length) return json({ ok: true, id, doi: 0 });
  const ts = Math.max(Date.now(), d.cap_ts + 1);
  await batchGuarded(env, guardStmt(env, 'NOT EXISTS (SELECT 1 FROM don_gc WHERE id = ?1 AND cap_ts = ?2)', id, d.cap_ts), [
    env.DB.prepare('UPDATE don_gc SET cau_kien = ?, hang_muc = ?, phan_khu = ?, tang = ?, cote = ?, truc = ?, noi_dung = ?, od_nguoi = ?, od_dd = ?, user_id = ?, han = ?, buoi = ?, tt = ?, cap_ts = ? WHERE id = ?')
      .bind(f.cau_kien, f.hang_muc, f.phan_khu, f.tang, f.cote, f.truc, f.noi_dung, f.od_nguoi, f.od_dd, f.user_id, f.han, f.buoi, giaoLai ? 'moi' : d.tt, ts, id),
    env.DB.prepare('DELETE FROM don_gc_nguoi WHERE don_id = ? AND user_id NOT IN (SELECT value FROM json_each(?))').bind(id, JSON.stringify(f.user_ids)),
    env.DB.prepare('INSERT OR IGNORE INTO don_gc_nguoi (don_id, user_id) SELECT ?, value FROM json_each(?)').bind(id, JSON.stringify(f.user_ids)),
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
  const ten = chu(b.ten, loai === 'hm' || loai === 'od' ? 60 : 40);
  if (!ten) throw bad('Cần ghi tên ' + GC_MUC[loai]);
  if ((loai === 'ck' || loai === 'vg') && ten.toLowerCase() === 'khác') throw bad('"Khác" luôn có sẵn, không cần thêm');
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

/* ========================= TRAO ĐỔI TRÊN ĐƠN =========================
   Mỗi đơn một mạch tin nhắn giữa người giao và người làm, hiện chung dòng thời gian với các mốc của đơn.
   - VIẾT: người trong đơn và mọi CVKTHT trở lên. ĐỌC: cả đơn vị (như bảng đơn).
   - "Cần trả lời" (can_tl): chỉ người NGOÀI nhóm làm (người giao) bật được; đơn mang cho_tl = id tin đó cho tới khi một
     người trong nhóm làm nhắn lại.
   - Không sửa, không xoá; người gửi THU HỒI được trong 2 phút (tin còn dấu "đã thu hồi", nội dung không trả ra nữa).
   - Đơn xong / huỷ vẫn nhắn được 7 ngày rồi khoá.
   - Chưa đọc: don_gc_doc giữ id tin cuối mỗi người đã đọc. Tin không tăng meta 'rev' (cái đó bắt mọi máy tải lại cả
     dữ liệu chung) mà tăng meta 'tn': máy chỉ hỏi lại danh sách tin chưa đọc của mình. */
const GC_TN_MAX = 500, GC_TN_MO_MS = 7 * 864e5, GC_TN_THU_HOI_MS = 2 * 60e3;
const bumpTn = (env) => env.DB.prepare("UPDATE meta SET value = value + 1 WHERE key = 'tn'");
/* Đơn có tin mới (của người khác) mà người này chưa đọc — chỉ đơn LIÊN QUAN tới họ: đang làm, đã giao, hoặc đã nhắn
   trong đó. Chỉ xét các đơn CÒN TRÊN BẢNG (còn mở, xong chưa xuất, hoặc đóng trong 30 ngày): câu này chạy ở mỗi lần
   mở app và mỗi lần có tin, bản đầu quét cả bảng đơn từ trước tới nay (6.000 dòng sau một năm). Tin chưa đọc trên đơn
   đã rời bảng thì thôi nhắc — đơn đó cũng đã khoá trao đổi từ lâu. ?1 = người xem, ?2 = mốc 30 ngày. */
export const TN_MOI_SQL = `WITH ung(id) AS (
    SELECT id FROM don_gc WHERE tt IN ('moi', 'nhan', 'lam')
    UNION SELECT id FROM don_gc WHERE tt IN ('xong', 'huy') AND cap_ts > ?2
    UNION SELECT id FROM don_gc ${GC_CHUA_XUAT_IDX} WHERE ${GC_CHUA_XUAT})
  SELECT d.id, d.cau_kien, d.truc,
    (SELECT COUNT(*) FROM don_gc_tn t WHERE t.don_id = d.id AND t.id > COALESCE(r.doc_id, 0) AND t.user_id <> ?1 AND t.thu_hoi = 0) moi
  FROM ung JOIN don_gc d ON d.id = ung.id LEFT JOIN don_gc_doc r ON r.don_id = d.id AND r.user_id = ?1
  WHERE d.tn_id > COALESCE(r.doc_id, 0)
    AND (d.giao_by = ?1 OR EXISTS (SELECT 1 FROM don_gc_nguoi n WHERE n.don_id = d.id AND n.user_id = ?1)
         OR EXISTS (SELECT 1 FROM don_gc_tn t2 WHERE t2.don_id = d.id AND t2.user_id = ?1))`;
export const tnMoi = (rows) => rows.filter((r) => r.moi > 0);
export const tnMoiStmt = (env, user) => env.DB.prepare(TN_MOI_SQL).bind(user.id, Date.now() - GC_GIU_MS);
export async function gcTnMoi(env, user) {
  return json({ items: tnMoi((await tnMoiStmt(env, user).all()).results) });
}
export async function gcTn(req, env, user, id) {
  if (!Number.isInteger(id)) throw khongThay();
  const b = await readJson(req);
  const d = docNguoi(await env.DB.prepare(`${GC_SELECT} WHERE d.id = ?`).bind(id).first());
  if (!d) throw khongThay();
  const trong = d.nguoi.some((n) => n.id === user.id);
  if (!trong && capOf(user.role) < 1) throw new HttpError(403, 'Chỉ người làm đơn này và CVKTHT trở lên mới trao đổi được');
  const dong = d.tt === 'xong' ? d.xong_ts : d.tt === 'huy' ? d.huy_ts || d.cap_ts : null;
  if (dong && Date.now() - dong > GC_TN_MO_MS) throw new HttpError(409, 'Đơn đã đóng quá 7 ngày, không trao đổi thêm được.', 'tt');
  const nd = String(b.noi_dung == null ? '' : b.noi_dung).replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, GC_TN_MAX);
  if (!nd) throw bad('Tin nhắn trống');
  const canTl = b.can_tl && !trong ? 1 : 0;
  // người trong nhóm làm nhắn là đã trả lời; người giao hỏi "cần trả lời" thì đơn chờ tin đó
  const choTl = canTl ? '(SELECT MAX(id) FROM don_gc_tn)' : trong ? 'NULL' : 'cho_tl';
  const MAX = '(SELECT MAX(id) FROM don_gc_tn)';
  const r = await env.DB.batch([
    env.DB.prepare('INSERT INTO don_gc_tn (don_id, user_id, ts, noi_dung, can_tl) VALUES (?,?,?,?,?)').bind(id, user.id, Date.now(), nd, canTl),
    env.DB.prepare(`UPDATE don_gc SET tn_id = ${MAX}, cho_tl = ${choTl} WHERE id = ?`).bind(id),
    env.DB.prepare(`INSERT INTO don_gc_doc (don_id, user_id, doc_id) VALUES (?, ?, ${MAX})
                    ON CONFLICT(don_id, user_id) DO UPDATE SET doc_id = excluded.doc_id`).bind(id, user.id),
    bumpTn(env),
  ]);
  return json({ ok: true, id: r[0].meta.last_row_id });
}
export async function gcThuHoi(env, user, id, tnId) {
  const t = Number.isInteger(id) && Number.isInteger(tnId)
    ? await env.DB.prepare('SELECT t.id, t.user_id, t.ts, t.thu_hoi, d.cho_tl FROM don_gc_tn t JOIN don_gc d ON d.id = t.don_id WHERE t.id = ? AND t.don_id = ?').bind(tnId, id).first() : null;
  if (!t) throw new HttpError(404, 'Không tìm thấy tin nhắn');
  if (t.user_id !== user.id) throw new HttpError(403, 'Chỉ thu hồi được tin của chính mình');
  if (t.thu_hoi) throw new HttpError(409, 'Tin này đã thu hồi rồi.', 'tt');
  if (Date.now() - t.ts > GC_TN_THU_HOI_MS) throw new HttpError(409, 'Quá 2 phút, không thu hồi được nữa. Nhắn thêm một tin để đính chính.', 'tt');
  await env.DB.batch([
    env.DB.prepare('UPDATE don_gc_tn SET thu_hoi = 1 WHERE id = ?').bind(tnId),
    env.DB.prepare('UPDATE don_gc SET cho_tl = NULL WHERE id = ? AND cho_tl = ?').bind(id, tnId),
    bumpTn(env),
  ]);
  return json({ ok: true });
}
// đã đọc tới tin nào (không lùi): không tăng rev hay tn, chỉ việc của máy người đọc
export async function gcDoc(req, env, user, id) {
  const b = await readJson(req);
  const den = Number(b.den);
  if (!Number.isInteger(id) || !Number.isInteger(den)) throw bad('Dữ liệu không hợp lệ');
  await env.DB.prepare(`INSERT INTO don_gc_doc (don_id, user_id, doc_id) VALUES (?, ?, ?)
                        ON CONFLICT(don_id, user_id) DO UPDATE SET doc_id = MAX(doc_id, excluded.doc_id)`).bind(id, user.id, den).run();
  return json({ ok: true });
}

/* Một việc trên đơn.
   Của NGƯỜI ĐƯỢC GIAO (và chỉ họ): nhan, tiendo, vuong, hetvuong, xong.
   Của NGƯỜI ĐƯỢC GIAO còn có: biet — bấm "đã biết" trên đơn vừa bị huỷ (xem luật huỷ ở đầu tệp).
   Của CVKTHT trở lên: huy, molai (mở lại đơn đã xong), khoiphuc (khôi phục đơn huỷ nhầm) — đều bắt buộc ghi lý do;
   xemvuong — "đã xem, đang xử lý" một lần báo vướng, để tổ biết báo đã tới người lo.
   BÁO VƯỚNG: chọn lý do trong danh mục (loại 'vg', "Khác" thì phải ghi rõ), mức độ dung = 1 khi tổ DỪNG HẲN
   (0 = vẫn làm được phần khác). Báo lại thì xoá dấu "đã xem" cũ: lần báo mới chưa ai xem. Bản app cũ gửi chữ tự do
   (chỉ ly_do) vẫn nhận.
   lam_ts: lần cuối NGƯỜI LÀM động tới đơn (nhận, tiến độ, vướng, xong) — để biết đơn nào đứng yên lâu.
   XUẤT (sau khi xong, mỗi đơn MỘT lần): người trong đơn bấm "xuat" kèm xác nhận đủ ba việc — đã ký biên bản giao
   nhận, đã kiểm đếm, đã chụp ảnh gửi nhóm Zalo — và xuất cho ai / vị trí lắp dựng; đơn thành xuat_tt = 'cho'.
   CVKTHT trở lên "duyetxuat" (xuat_tt = 'duyet', đơn khoá hẳn: thép đã rời bãi, không mở lại được nữa) hoặc
   "tuchoixuat" kèm lý do (về chưa xuất, tổ sửa rồi gửi lại). Xuất KHÔNG đụng tồn kho: thép đã tính là dùng khi lấy
   ra gia công, trừ lần nữa là trừ hai lần.
   Kiểm quyền TRƯỚC khi tìm đơn, để người không có quyền nhận 403 chứ không dò được đơn nào có thật. */
const VIEC_QL = ['huy', 'molai', 'khoiphuc', 'xemvuong', 'duyetxuat', 'tuchoixuat'];
const VIEC_CUA = ['nhan', 'tiendo', 'vuong', 'hetvuong', 'xong', 'biet', 'xuat'];
export async function gcViec(req, env, user, id, viec) {
  if (!VIEC_QL.includes(viec) && !VIEC_CUA.includes(viec)) throw new HttpError(404, 'Không tìm thấy');
  if (VIEC_QL.includes(viec) && capOf(user.role) < 1) throw new HttpError(403, 'Bạn không có quyền thực hiện việc này');
  if (!Number.isInteger(id)) throw khongThay();
  const b = await readJson(req);
  const d = docNguoi(await env.DB.prepare(`${GC_SELECT} WHERE d.id = ?`).bind(id).first());
  if (!d) throw khongThay();
  const toi = d.nguoi.find((n) => n.id === user.id);
  if (VIEC_CUA.includes(viec) && !toi) throw new HttpError(403, 'Chỉ ' + d.uname + ' (người được giao đơn này) mới làm được việc đó');
  const them = []; // câu ghi thêm vào danh sách người của đơn (đã biết, huỷ, khôi phục)
  const sai = (msg) => new HttpError(409, msg, 'tt');
  const dong = d.tt === 'xong' ? 'Đơn đã xong.' : d.tt === 'huy' ? 'Đơn đã huỷ, không cần làm nữa.' : '';
  const ts = Math.max(Date.now(), d.cap_ts + 1);
  const set = {};
  let note = null, audit = null;
  if (viec === 'nhan') {
    if (d.tt !== 'moi') throw sai(dong || 'Đơn này đã nhận rồi.');
    set.tt = 'nhan';
    set.lam_ts = ts;
  } else if (viec === 'tiendo') {
    if (d.tt === 'moi') throw sai('Hãy nhận đơn trước khi cập nhật tiến độ.');
    if (dong) throw sai(dong);
    const pct = Number(b.pct);
    if (!GC_PCT.includes(pct)) throw bad('Tiến độ không hợp lệ');
    note = chu(b.note, 200) || null;
    if (pct === d.pct && !note) throw bad('Tiến độ chưa đổi. Chọn mức khác hoặc ghi chú thêm.');
    set.pct = pct;
    set.lam_ts = ts;
    if (pct > 0) set.tt = 'lam';
  } else if (viec === 'vuong') {
    if (dong) throw sai(dong);
    const ghi = chu(b.ly_do, 200), loai = chu(b.loai, 40);
    let ten = null;
    if (loai) {
      ten = loai.toLowerCase() === 'khác' ? 'Khác' : mucTen(xepMuc((await env.DB.prepare(MUC_SQL).all()).results).vg, loai);
      if (!ten) throw bad('Lý do vướng "' + loai + '" không có trong danh mục');
      if (ten === 'Khác' && !ghi) throw bad('Ghi rõ đang vướng gì');
      note = ten === 'Khác' ? ghi : ten + (ghi ? ': ' + ghi : '');
    } else {
      note = ghi;
      if (!note) throw bad('Cần ghi đang vướng gì');
    }
    Object.assign(set, { vuong: note, vuong_loai: ten, vuong_dung: b.dung ? 1 : 0, vuong_ts: ts, vuong_xem_by: null, vuong_xem_ts: null, lam_ts: ts });
  } else if (viec === 'hetvuong') {
    if (dong) throw sai(dong);
    if (!d.vuong) throw sai('Đơn này không còn vướng.');
    Object.assign(set, { vuong: null, vuong_loai: null, vuong_dung: 0, vuong_xem_by: null, vuong_xem_ts: null, lam_ts: ts });
  } else if (viec === 'xemvuong') {
    if (dong) throw sai(dong);
    if (!d.vuong) throw sai('Đơn này không còn vướng.');
    if (d.vuong_xem_ts) throw sai((d.vuong_xem_name || 'Người khác') + ' đã nhận xử lý lần báo vướng này rồi.');
    note = chu(b.note, 200) || null;
    Object.assign(set, { vuong_xem_by: user.id, vuong_xem_ts: ts });
  } else if (viec === 'xong') {
    if (d.tt === 'moi') throw sai('Hãy nhận đơn trước khi xác nhận xong.');
    if (dong) throw sai(dong);
    note = chu(b.note, 200) || null;
    Object.assign(set, { tt: 'xong', pct: 100, vuong: null, vuong_loai: null, vuong_dung: 0, vuong_xem_by: null, vuong_xem_ts: null, mo_lai: null, xong_ts: ts, lam_ts: ts,
      xuat_tt: null, xuat_ts: null, xuat_by: null, xuat_cho: null, xuat_note: null, xuat_duyet_by: null, xuat_duyet_ts: null, xuat_tu_choi: null });
    audit = 'gc_xong';
  } else if (viec === 'huy') {
    if (dong) throw sai(dong + (d.tt === 'xong' ? ' Muốn làm lại thì mở lại đơn.' : ''));
    note = chu(b.ly_do, 200);
    if (!note) throw bad('Cần ghi lý do huỷ đơn');
    // giữ nguyên pct ("dừng ở 50%"); nhớ trạng thái trước khi huỷ để khôi phục về đúng chỗ; cờ vướng hết nghĩa
    Object.assign(set, { tt: 'huy', huy_ly_do: note, huy_by: user.id, huy_ts: ts, huy_tt: d.tt, biet_ts: null, vuong: null, vuong_loai: null, vuong_dung: 0, vuong_xem_by: null, vuong_xem_ts: null, mo_lai: null });
    them.push(env.DB.prepare('UPDATE don_gc_nguoi SET biet_ts = NULL WHERE don_id = ?').bind(id));
    audit = 'gc_huy';
  } else if (viec === 'xuat') {
    if (d.tt !== 'xong') throw sai('Chỉ xuất được đơn đã xong.');
    if (d.xuat_tt === 'cho') throw sai('Đơn đang chờ duyệt xuất rồi.');
    if (d.xuat_tt === 'duyet') throw sai('Đơn đã xuất rồi.');
    if (!(b.bien_ban && b.kiem_dem && b.anh)) throw bad('Phải xác nhận đủ: đã ký giao nhận, đã kiểm đếm, đã chụp ảnh gửi nhóm');
    const cho = chu(b.xuat_cho, 120);
    if (!cho) throw bad('Ghi xuất cho ai / vị trí lắp dựng');
    note = 'xuất cho ' + cho + ' · đã ký giao nhận, đã kiểm đếm, đã gửi ảnh' + (chu(b.note, 200) ? ' · ' + chu(b.note, 200) : '');
    Object.assign(set, { xuat_tt: 'cho', xuat_ts: ts, xuat_by: user.id, xuat_cho: cho, xuat_note: chu(b.note, 200) || null, xuat_tu_choi: null });
    audit = 'gc_xuat';
  } else if (viec === 'duyetxuat') {
    if (d.tt !== 'xong' || d.xuat_tt !== 'cho') throw sai(d.xuat_tt === 'duyet' ? 'Đơn đã được duyệt xuất rồi.' : 'Đơn không chờ duyệt xuất.');
    // dưới cấp chỉ huy không tự duyệt việc của mình (người gửi xuất là CVKTHT trong nhóm làm)
    if (capOf(user.role) < 2 && (d.xuat_by === user.id || toi)) throw new HttpError(403, 'Bạn không tự duyệt xuất đơn của mình được: cần cấp trên duyệt.');
    Object.assign(set, { xuat_tt: 'duyet', xuat_duyet_by: user.id, xuat_duyet_ts: ts });
    audit = 'gc_duyetxuat';
  } else if (viec === 'tuchoixuat') {
    if (d.tt !== 'xong' || d.xuat_tt !== 'cho') throw sai('Đơn không chờ duyệt xuất.');
    note = chu(b.ly_do, 200);
    if (!note) throw bad('Cần ghi lý do không duyệt xuất');
    Object.assign(set, { xuat_tt: null, xuat_tu_choi: note });
    audit = 'gc_tuchoixuat';
  } else if (viec === 'biet') {
    if (d.tt !== 'huy') throw sai('Đơn này không bị huỷ.');
    if (toi.biet) throw sai('Bạn đã báo đã biết rồi.');
    them.push(env.DB.prepare('UPDATE don_gc_nguoi SET biet_ts = ? WHERE don_id = ? AND user_id = ?').bind(ts, id, user.id));
    // người cuối cùng biết thì cả đơn mới là "đã biết" (thôi nhắc người giao)
    if (d.nguoi.every((n) => n.id === user.id || n.biet)) set.biet_ts = ts;
  } else if (viec === 'khoiphuc') {
    if (d.tt !== 'huy') throw sai('Chỉ khôi phục được đơn đã huỷ.');
    if (Date.now() - (d.huy_ts || d.cap_ts) > GC_KHOI_PHUC_MS) throw sai('Đơn huỷ đã quá 7 ngày, không khôi phục được nữa. Hãy giao đơn mới (có nút "Giao đơn mới giống đơn này").');
    note = chu(b.ly_do, 200);
    if (!note) throw bad('Cần ghi lý do khôi phục đơn');
    // trong lúc đơn nằm ở trạng thái huỷ có thể đã có người giao lại đúng việc đó: khôi phục nữa là hai đơn một việc
    const t = await donTrung(env, { ...d, user_ids: d.nguoi.map((n) => n.id) }, d.id);
    if (t) throw sai(d.uname + ' đang giữ một đơn còn mở giống hệt (' + t.giao_name + ' giao ngày ' + fmtDay(vnDay(t.ts)) + '). Không khôi phục thêm đơn này.');
    const truoc = (await env.DB.prepare('SELECT huy_tt FROM don_gc WHERE id = ?').bind(id).first('huy_tt')) || (d.pct > 0 ? 'lam' : 'moi');
    /* Về đúng trạng thái trước khi huỷ. Lý do khôi phục ghi vào mo_lai — cùng chỗ với "bị mở lại" — để người
       giữ đơn thấy ngay trên thẻ và ở Tổng quan rằng đơn này quay lại, phải làm tiếp. */
    Object.assign(set, { tt: GC_MO.includes(truoc) ? truoc : 'moi', huy_ly_do: null, huy_by: null, huy_ts: null, huy_tt: null, biet_ts: null, mo_lai: 'Khôi phục sau khi huỷ: ' + note });
    them.push(env.DB.prepare('UPDATE don_gc_nguoi SET biet_ts = NULL WHERE don_id = ?').bind(id));
    audit = 'gc_khoiphuc';
  } else {
    if (d.tt !== 'xong') throw sai('Chỉ mở lại được đơn đã xong.');
    if (d.xuat_tt === 'duyet') throw sai('Đơn đã xuất (thép đã rời bãi), không mở lại được. Cần làm thêm thì giao đơn mới.');
    note = chu(b.ly_do, 200);
    if (!note) throw bad('Cần ghi lý do mở lại đơn');
    Object.assign(set, { tt: 'lam', pct: GC_PCT_MO_LAI, xong_ts: null, mo_lai: note });
    audit = 'gc_molai';
  }
  const cot = Object.keys(set);
  const pctSau = set.pct === undefined ? d.pct : set.pct;
  const stmts = [
    env.DB.prepare(`UPDATE don_gc SET ${cot.map((c) => c + ' = ?').concat('cap_ts = ?').join(', ')} WHERE id = ?`).bind(...cot.map((c) => set[c]), ts, id),
    ...them,
    env.DB.prepare('INSERT INTO don_gc_log (don_id, ts, user_id, viec, pct, note) VALUES (?,?,?,?,?,?)').bind(id, ts, user.id, viec, pctSau, note),
  ];
  // nhật ký chung chỉ ghi các mốc của đơn (giao, sửa, xong, huỷ, mở lại); từng lần cập nhật tiến độ nằm ở lịch sử của đơn
  if (audit) stmts.push(auditStmt(env, user, audit, { id, cau_kien: d.cau_kien, truc: d.truc, cua: d.uname, ly_do: VIEC_QL.includes(viec) ? note : undefined, xuat_cho: set.xuat_cho }));
  stmts.push(bump(env));
  await batchGuarded(env, guardStmt(env, 'NOT EXISTS (SELECT 1 FROM don_gc WHERE id = ?1 AND cap_ts = ?2)', id, d.cap_ts), stmts, vuaDoi());
  return json({ ok: true, id, tt: set.tt || d.tt, pct: pctSau });
}
