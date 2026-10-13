// Báo cáo ca gửi cấp trên: gom quân số đầu ca + công việc gia công thành một bản chữ theo mẫu của đơn vị.
import { bad, json, vnDay } from './core.js';
import { SETTINGS_SQL, auditStmt, parseSettings, readJson } from './helpers.js';
import { MAU_CO, QS_LY_DO, TO_SX, caGio, caKe, caKhoa, caLuc, docCfg } from './quanso.js';

/* ========================= BÁO CÁO CA =========================
   Người soạn: CVKTHT trở lên. Server chỉ GOM SỐ LIỆU và LƯU; việc ghép chữ theo mẫu nằm ở máy khách (app.js,
   bcTao), vì người soạn sửa từng mục ngay trên màn hình và phải thấy bản chữ đổi theo lúc đang gõ.
   - Số liệu app chỉ là BẢN ĐIỀN SẴN: mục nào người soạn đã sửa thì lưu nguyên chữ (data.muc[k]), lần mở sau dùng
     chữ đó; mục chưa sửa thì ghép lại từ số mới nhất.
   - MẪU (bc_mau, một dòng): phần đầu (đơn vị, chỉ huy, dự án, khu vực), máy móc thiết bị và các dòng kiểm tra mặc
     định. Phần đầu và máy móc lưu lại mỗi lần chép báo cáo (ca sau dùng tiếp); dòng kiểm tra chỉ đổi khi người soạn
     bấm "đặt làm mẫu", để một nhận xét xấu của hôm nay không tự lặp lại sang hôm sau. */
// mẫu mặc định: năm dòng kiểm tra, giám sát của đơn vị
export const BC_KT = [
  'Quản lý máy 3 ca: bố trí việc hợp lý, đúng; ký nhật trình đúng',
  'Dọn dẹp cuối ca: tốt; các tổ dọn dẹp cuối giờ, có ảnh báo cáo',
  'Thiết bị nâng hạ không giá kê: không có, đã kê kích đầy đủ',
  'Kiểm soát vật tư: tránh làm hỏng vật tư, thất thoát, lãng phí',
  'Hình ảnh văn hoá CBCNV (túm tụm, trốn việc, đồ bảo hộ sai quy cách): không có',
];
const BC_DAU = ['don_vi', 'ddt', 'tdtr', 'cbpt', 'du_an', 'khu_vuc'];
const BC_MUC = ['s3', 's4', 's5', 's6', 's7', 's8'];
const BC_SUA_NGAY = 7;
const docJ = (s) => { try { const o = JSON.parse(s || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } };
const chu = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
// chữ nhiều dòng (một mục của báo cáo): giữ xuống dòng, bỏ dòng trống thừa
const doan = (v, max) => String(v == null ? '' : v).replace(/\r/g, '').split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n').slice(0, max);
const docMau = (row) => {
  const d = docJ(row && row.data);
  return { dau: Object.fromEntries(BC_DAU.map((k) => [k, chu((d.dau || {})[k], 120)])), mmtb: chu(d.mmtb, 400), kt: Array.isArray(d.kt) && d.kt.length ? d.kt.map((x) => chu(x, 200)).filter(Boolean) : BC_KT,
    // thứ tự tổ do CVKTHT xếp (id Tiểu đội trưởng), dùng cho bảng quân số và mục 3 của báo cáo
    thu_tu: Array.isArray(d.thu_tu) ? d.thu_tu.filter((x) => Number.isInteger(x)) : [] };
};
function docCa(q, st) {
  const hien = caLuc(st);
  if (!q.get('ngay') && !q.get('ca')) return hien;
  const ngay = String(q.get('ngay') || ''), ca = Number(q.get('ca'));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ngay) || (ca !== 1 && ca !== 2)) throw bad('Ca không hợp lệ');
  const c = { ngay, ca };
  if (caKhoa(c) > caKhoa(caKe(hien))) throw bad('Chưa tới ca này');
  return c;
}

/* Số liệu cho một ca: quân số hai ca của ngày đó (tổ chia ca thì dòng ca kia cũng vào báo cáo), lần báo gần nhất
   của từng tổ (tổ chưa báo vẫn vào tổng quân số), đơn gia công đang làm và đơn xong trong giờ ca, các đơn đang
   vướng / trễ, người có thể chọn nhanh làm chỉ huy, mẫu, và báo cáo đã soạn (nếu có). */
export async function bcView(env, url) {
  const st = parseSettings((await env.DB.prepare(SETTINGS_SQL).all()).results);
  const c = docCa(url.searchParams, st), gio = caGio(st, c), hien = caLuc(st);
  const [tdt, qs, qsDem, truoc, don, nguoi, mau, bc] = await env.DB.batch([
    env.DB.prepare(`SELECT u.id, u.name FROM users u WHERE u.role = 'tieudoi' AND u.deleted = 0 ORDER BY ${TO_SX}`),
    env.DB.prepare(`SELECT q.ca, q.user_id, q.tong, q.lam, q.ca_kia, q.nghi, q.ghi_chu, COALESCE(u.name, '(đã xoá)') uname
                    FROM quan_so q LEFT JOIN users u ON u.id = q.user_id WHERE q.ngay = ?`).bind(c.ngay),
    // ca đêm của NGÀY HÔM TRƯỚC: báo cáo ca ngày của tổ làm hai ca kèm ca liền trước đó
    env.DB.prepare('SELECT q.ca, q.user_id, q.tong, q.lam, q.ca_kia, q.nghi, q.ghi_chu FROM quan_so q WHERE q.ngay = ? AND q.ca = 2').bind(new Date(Date.parse(c.ngay) - 864e5).toISOString().slice(0, 10)),
    env.DB.prepare(`SELECT q.user_id, q.ca, q.tong, q.lam, q.ca_kia FROM users u JOIN quan_so q ON q.rowid = (
                      SELECT x.rowid FROM quan_so x WHERE x.user_id = u.id AND x.ngay < ?1 ORDER BY x.ngay DESC, x.ca DESC LIMIT 1)
                    WHERE u.role = 'tieudoi' AND u.deleted = 0`).bind(c.ngay),
    /* Đơn còn mở, cộng đơn XONG trong giờ ca. UNION ALL để mỗi nửa đi theo index (tt, cap_ts) như gcList. */
    env.DB.prepare(`SELECT * FROM (
                      SELECT id, cau_kien, hang_muc, phan_khu, tang, cote, truc, user_id, han, buoi, tt, pct, vuong, xong_ts FROM don_gc WHERE tt IN ('moi', 'nhan', 'lam')
                      UNION ALL SELECT id, cau_kien, hang_muc, phan_khu, tang, cote, truc, user_id, han, buoi, tt, pct, vuong, xong_ts FROM don_gc
                        WHERE tt = 'xong' AND cap_ts >= ?1 AND xong_ts >= ?1 AND xong_ts < ?2) ORDER BY id`).bind(gio.tu, gio.den),
    // admin mang chức danh (users.chuc_danh) cũng là người chọn được, xếp theo chức danh đó
    env.DB.prepare(`SELECT id, name, CASE role WHEN 'admin' THEN chuc_danh ELSE role END role FROM users
                    WHERE deleted = 0 AND (role IN ('daidoi', 'trungdoi', 'cvktht') OR (role = 'admin' AND chuc_danh IN ('daidoi', 'trungdoi', 'cvktht'))) ORDER BY name`),
    env.DB.prepare('SELECT data FROM bc_mau WHERE id = 1'),
    env.DB.prepare(`SELECT b.data, b.van_ban, b.ts, COALESCE(u.name, '(đã xoá)') by_name FROM bao_cao_ca b LEFT JOIN users u ON u.id = b.by_id
                    WHERE b.ngay = ? AND b.ca = ?`).bind(c.ngay, c.ca),
  ]);
  const r = bc.results[0];
  return json({
    ngay: c.ngay, ca: c.ca, hien, ke: caKe(hien), gio, lyDo: QS_LY_DO,
    tdt: tdt.results, qs: qs.results.map((x) => ({ ...x, nghi: docJ(x.nghi) })), truoc: truoc.results,
    // ca đêm của ngày hôm trước (cho báo cáo ca ngày); lịch ca và số thiết lập của các tổ
    qsDemTruoc: qsDem.results.map((x) => ({ ...x, nghi: docJ(x.nghi) })),
    lich: docCfg(mau.results[0]).lich, tl: docCfg(mau.results[0]).tl,
    don: don.results, nguoi: nguoi.results, mau: docMau(mau.results[0]),
    bao: r ? { muc: docJ(r.data).muc || {}, van_ban: r.van_ban, ts: r.ts, by_name: r.by_name } : null,
    suaDuoc: c.ngay >= vnDay(Date.now() - BC_SUA_NGAY * 864e5),
  });
}

/* Lưu báo cáo của một ca (lúc người soạn bấm chép / chia sẻ): các mục đã sửa và bản chữ đã gửi. Cùng lúc lưu phần
   đầu và máy móc vào mẫu để ca sau điền sẵn; dòng kiểm tra chỉ vào mẫu khi gửi kèm kt_mau = true. */
export async function bcPut(req, env, user) {
  const b = await readJson(req);
  const st = parseSettings((await env.DB.prepare(SETTINGS_SQL).all()).results);
  const q = new URLSearchParams({ ngay: String(b.ngay || ''), ca: String(b.ca || '') });
  const c = docCa(q, st);
  if (c.ngay < vnDay(Date.now() - BC_SUA_NGAY * 864e5)) throw bad(`Chỉ lưu được báo cáo trong ${BC_SUA_NGAY} ngày gần đây`);
  const van_ban = doan(b.van_ban, 20000);
  if (!van_ban) throw bad('Báo cáo trống');
  const vao = b.muc && typeof b.muc === 'object' ? b.muc : {};
  const muc = {};
  for (const k of BC_MUC) if (typeof vao[k] === 'string') muc[k] = doan(vao[k], 8000);
  const cu = docMau(await env.DB.prepare('SELECT data FROM bc_mau WHERE id = 1').first());
  const dau = b.dau && typeof b.dau === 'object' ? Object.fromEntries(BC_DAU.map((k) => [k, chu(b.dau[k], 120)])) : cu.dau;
  const mau = { dau, mmtb: b.mmtb != null ? chu(b.mmtb, 400) : cu.mmtb, kt: cu.kt, thu_tu: cu.thu_tu };
  if (b.kt_mau && typeof muc.s6 === 'string') mau.kt = muc.s6.split('\n').map((x) => chu(x, 200)).filter(Boolean);
  const ts = Date.now();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO bao_cao_ca (ngay, ca, data, van_ban, ts, by_id) VALUES (?,?,?,?,?,?)
                    ON CONFLICT(ngay, ca) DO UPDATE SET data = excluded.data, van_ban = excluded.van_ban, ts = excluded.ts, by_id = excluded.by_id`)
      .bind(c.ngay, c.ca, JSON.stringify({ muc }), van_ban, ts, user.id),
    // ghi từng nhánh của mẫu: không đè lịch ca / số thiết lập / thứ tự tổ người khác vừa sửa
    env.DB.prepare(MAU_CO),
    env.DB.prepare("UPDATE bc_mau SET data = json_set(COALESCE(data, '{}'), '$.dau', json(?), '$.mmtb', ?, '$.kt', json(?)), ts = ?, by_id = ? WHERE id = 1")
      .bind(JSON.stringify(mau.dau), mau.mmtb, JSON.stringify(mau.kt), ts, user.id),
    auditStmt(env, user, 'bc_luu', { ngay: c.ngay, ca: c.ca, kt_mau: b.kt_mau ? 1 : undefined }),
  ]);
  return json({ ok: true, ngay: c.ngay, ca: c.ca, ts });
}
