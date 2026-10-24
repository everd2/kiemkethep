// Ảnh biên bản đính kèm cho sổ Vay mượn, Sắt vụn và Gia công xuất cho. Ảnh thật lưu ở R2 (bucket
// ANH, xem wrangler.toml), bảng anh_bb chỉ giữ metadata để liệt kê nhanh theo từng dòng sổ (xem
// schema.sql). Thêm ẢNH KHÔNG chặn lúc ghi sổ: ảnh được đính SAU, từ chính dòng sổ đang xem, nên
// luôn tự gắn đúng dòng — không có bước tìm/khớp ảnh với dòng nào.
import { HttpError, bad, capOf, json, rand } from './core.js';
import { auditStmt, batchGuarded, bump, guardStmt } from './helpers.js';

export const ANH_LOAI = ['loan', 'satvun', 'gc'];
// Các view loans/satvun/giacong/review JOIN kèm cột anh_json (mảng {id, ts}) để hiện thumbnail ngay trong
// danh sách, không tốn thêm vòng mạng — gọi hàm này sau khi đọc kết quả để tách thành r.anh.
export const anhJson = (loai, idCol) =>
  `(SELECT json_group_array(json_object('id', a.id, 'ts', a.ts)) FROM anh_bb a WHERE a.loai = '${loai}' AND a.entity_id = ${idCol}) anh_json`;
export function docAnh(r) {
  if (!r) return r;
  try { r.anh = JSON.parse(r.anh_json || '[]'); } catch (e) { r.anh = []; }
  delete r.anh_json;
  return r;
}
/* Mỗi loại sổ: bảng chứa dòng, và câu đọc MÔ TẢ ngắn của dòng đó để nhật ký nói được "ảnh của biên bản nào" — nhật ký
   không sửa được và dòng sổ có thể bị huỷ sau này, nên ghi sẵn chữ vào lúc thêm / xoá. */
const ANH_BANG = { loan: 'loans', satvun: 'satvun', gc: 'don_gc' };
const ANH_MO_TA = {
  loan: "SELECT l.ngay, l.so_bb, d.name ten, l.voided huy FROM loans l LEFT JOIN doitac d ON d.id = l.doitac_id WHERE l.id = ?",
  satvun: 'SELECT ngay, so_phieu so_bb, noi ten, voided huy FROM satvun WHERE id = ?',
  gc: "SELECT NULL ngay, NULL so_bb, cau_kien || COALESCE(' · ' || truc, '') ten, tt = 'huy' huy FROM don_gc WHERE id = ?",
};
const ANH_MAX_DONG = 20; // ảnh mỗi dòng sổ: một biên bản vài trang là cùng; chặn lỡ chọn cả thư viện ảnh
// máy khách đã nén về JPEG (resizeAnh trong app.js); nhận thêm PNG/WebP cho bản app sau, ngoài ra thì không
const ANH_KIEU = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const ANH_MAX_BYTES = 6 * 1024 * 1024; // ảnh đã nén ở máy khách, đây chỉ chặn trường hợp bất thường
const ANH_XOA_MS = 10 * 60e3; // người tải lên rút lại được trong 10 phút, giống cửa sổ rút lại của loans/satvun
const khongThay = () => new HttpError(404, 'Không tìm thấy ảnh');
const soId = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : 0; };

// mô tả dòng sổ cho nhật ký, kèm số ảnh đang có; null = dòng không còn
async function dongSo(env, loai, entityId) {
  const [m, n] = await env.DB.batch([
    env.DB.prepare(ANH_MO_TA[loai]).bind(entityId),
    env.DB.prepare('SELECT COUNT(*) n FROM anh_bb WHERE loai = ? AND entity_id = ?').bind(loai, entityId),
  ]);
  const r = m.results[0];
  return r ? { ngay: r.ngay || undefined, so_bb: r.so_bb || undefined, ten: r.ten || undefined, huy: !!r.huy, n: n.results[0].n } : null;
}

export async function postAnh(req, env, user, loai, eid) {
  const entityId = soId(eid);
  if (!ANH_LOAI.includes(loai) || !entityId) throw new HttpError(404, 'Không tìm thấy dòng sổ này');
  const dong = await dongSo(env, loai, entityId);
  if (!dong) throw new HttpError(404, 'Không tìm thấy dòng sổ này');
  if (dong.huy) throw bad('Dòng sổ này đã huỷ, không thêm ảnh được');
  if (dong.n >= ANH_MAX_DONG) throw bad(`Mỗi dòng sổ tối đa ${ANH_MAX_DONG} ảnh. Xoá bớt ảnh thừa rồi thêm.`);
  const ct = (req.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
  if (!ANH_KIEU[ct]) throw bad('Chỉ nhận ảnh JPEG, PNG hoặc WebP');
  // quá lớn thì từ chối ngay theo Content-Length, khỏi đọc cả thân yêu cầu vào bộ nhớ rồi mới báo
  if (Number(req.headers.get('Content-Length')) > ANH_MAX_BYTES) throw bad('Ảnh quá lớn (tối đa 6MB)');
  const buf = await req.arrayBuffer();
  if (!buf.byteLength) throw bad('Ảnh trống');
  if (buf.byteLength > ANH_MAX_BYTES) throw bad('Ảnh quá lớn (tối đa 6MB)');
  /* Key random, sinh TRƯỚC khi biết id: ghi R2 xong mới ghi dòng DB, nên lỗi giữa đường chỉ để lại một
     object R2 mồ côi (vô hại) chứ không phải một dòng DB trỏ tới ảnh không có thật. */
  const key = `${loai}/${entityId}/${Date.now()}-${rand(6)}.${ANH_KIEU[ct]}`;
  await env.ANH.put(key, buf, { httpMetadata: { contentType: ct } });
  const ts = Date.now();
  let res;
  try {
    /* Kiểm tra `dong.n` ở trên chỉ để báo lỗi sớm: hai ảnh gửi cùng lúc đều thấy 19 rồi cùng chèn. Chặn thật nằm TRONG
       lượt ghi: bảo vệ đếm lại ngay lúc ghi, đủ ANH_MAX_DONG thì cả lượt (ảnh + nhật ký) bị huỷ. */
    res = await batchGuarded(env,
      guardStmt(env, '(SELECT COUNT(*) FROM anh_bb WHERE loai = ? AND entity_id = ?) >= ?', loai, entityId, ANH_MAX_DONG),
      [
        env.DB.prepare('INSERT INTO anh_bb (loai, entity_id, r2_key, kich_thuoc, user_id, user_name, ts) VALUES (?,?,?,?,?,?,?)')
          .bind(loai, entityId, key, buf.byteLength, user.id, user.name, ts),
        auditStmt(env, user, 'anh_bb_add', { loai, entity_id: entityId, ngay: dong.ngay, so_bb: dong.so_bb, ten: dong.ten }),
        bump(env),
      ],
      bad(`Mỗi dòng sổ tối đa ${ANH_MAX_DONG} ảnh. Xoá bớt ảnh thừa rồi thêm.`));
  } catch (e) {
    await env.ANH.delete(key).catch(() => {});
    throw e;
  }
  return json({ ok: true, id: res[0].meta.last_row_id, ts, user_name: user.name, kich_thuoc: buf.byteLength });
}

export async function listAnh(env, loai, eid) {
  const entityId = soId(eid);
  if (!ANH_LOAI.includes(loai) || !entityId) throw new HttpError(404, 'Không tìm thấy dòng sổ này');
  const rows = (await env.DB.prepare(
    'SELECT id, kich_thuoc, user_id, user_name, ts FROM anh_bb WHERE loai = ? AND entity_id = ? ORDER BY id'
  ).bind(loai, entityId).all()).results;
  return json({ items: rows });
}

export async function getAnh(env, aid, url) {
  const id = soId(aid);
  if (!id) throw khongThay();
  const r = await env.DB.prepare('SELECT * FROM anh_bb WHERE id = ?').bind(id).first();
  if (!r) throw khongThay();
  const obj = await env.ANH.get(r.r2_key);
  // dòng còn mà object mất: nạp lại bản sao có dòng ảnh, hoặc ai đó xoá thẳng trên R2
  if (!obj) throw khongThay();
  // ảnh không bao giờ sửa (chỉ thêm / xoá) nên cache lâu được; nosniff để không trình duyệt nào đoán ra kiểu khác
  const headers = {
    'Content-Type': (obj.httpMetadata && obj.httpMetadata.contentType) || 'image/jpeg',
    'Cache-Control': 'private, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
  };
  if (url && url.searchParams.get('dl')) headers['Content-Disposition'] = `attachment; filename="bien-ban-${r.loai}-${r.entity_id}-${r.id}.${r.r2_key.split('.').pop()}"`;
  return new Response(obj.body, { headers });
}

export async function deleteAnh(env, user, aid) {
  const id = soId(aid);
  if (!id) throw khongThay();
  const r = await env.DB.prepare('SELECT * FROM anh_bb WHERE id = ?').bind(id).first();
  if (!r) throw khongThay();
  const minh = r.user_id === user.id && Date.now() - r.ts < ANH_XOA_MS;
  if (!minh && capOf(user.role) < 1) {
    throw new HttpError(403, r.user_id === user.id ? 'Quá 10 phút rồi, nhờ CVKTHT trở lên xoá ảnh này' : 'Chỉ người tải lên (trong 10 phút) hoặc CVKTHT trở lên mới xoá được ảnh này');
  }
  const dong = await dongSo(env, r.loai, r.entity_id);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM anh_bb WHERE id = ?').bind(id),
    auditStmt(env, user, 'anh_bb_xoa', { loai: r.loai, entity_id: r.entity_id, id, ngay: dong && dong.ngay, so_bb: dong && dong.so_bb, ten: dong && dong.ten, cua: r.user_name }),
    bump(env),
  ]);
  // xoá dòng trước rồi mới xoá object: lỗi giữa đường thì chỉ còn object mồ côi, không còn dòng trỏ vào ảnh mất
  await env.ANH.delete(r.r2_key).catch(() => {});
  return json({ ok: true });
}
