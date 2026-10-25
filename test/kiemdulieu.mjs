/* KIỂM DỮ LIỆU: soát một bản sao cơ sở dữ liệu (tệp .sql xuất bằng `wrangler d1 export`, hoặc tệp SQLite) — CHỈ ĐỌC, không ghi gì.
   node test/kiemdulieu.mjs <tệp.sql | tệp.sqlite> [đường-dẫn-repo]
   In ra: LỖI (dữ liệu sai thật, cần sửa), CẢNH BÁO (đáng xem lại), và số liệu tổng quan. Thoát mã 1 nếu có LỖI.
   Tồn kho tính bằng ĐÚNG hàm của app (tonCells ở src/phieu.js), nên "tồn âm" ở đây là tồn âm mà app đang thấy. */
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const TEP = process.argv[2], ROOT = process.argv[3] || '.';
if (!TEP) { console.error('Cách dùng: node test/kiemdulieu.mjs <tệp.sql | tệp.sqlite> [repo]'); process.exit(2); }
let raw;
if (/\.sql$/i.test(TEP)) { raw = new DatabaseSync(':memory:'); raw.exec('PRAGMA foreign_keys=OFF'); raw.exec(readFileSync(TEP, 'utf8')); }
else raw = new DatabaseSync(TEP, { readOnly: true });

const LOI = [], CB = [], TQ = [];
const q = (sql, ...p) => { try { return raw.prepare(sql).all(...p); } catch (e) { return { loi: e.message }; } };
const mot = (sql, ...p) => { const r = q(sql, ...p); return Array.isArray(r) ? r[0] : r; };
const co = (bang) => !!mot("SELECT 1 x FROM sqlite_master WHERE type = 'table' AND name = ?", bang);
const loi = (t, rows) => { if (rows && rows.length) LOI.push([t, rows.length, rows.slice(0, 5)]); };
const cb = (t, rows) => { if (rows && rows.length) CB.push([t, rows.length, rows.slice(0, 5)]); };
const vnDay = (ms = Date.now()) => new Date(ms + 7 * 3600e3).toISOString().slice(0, 10);
const today = vnDay();

/* ---------- 1. Cấu trúc ---------- */
const BANG = ['users', 'sessions', 'login_fail', 'phi', 'khu', 'khu_phi', 'khu_user', 'counts', 'counts_log', 'khu_report', 'khu_report_log', 'receipts',
  'day_close', 'daily_summary', 'phi_rate', 'baseline', 'doitac', 'loans', 'satvun', 'audit', 'settings', 'meta', 'bao_cao_ngay', 'bao_cao_huy', 'don_gc',
  'don_gc_log', 'quan_so', 'quan_so_tl', 'gc_muc', 'bao_cao_ca', 'san_luong', 'bc_mau', 'don_gc_nguoi', 'don_gc_tn', 'don_gc_doc', 'anh_bb'];
loi('Thiếu bảng', BANG.filter((b) => !co(b)).map((b) => ({ bang: b })));
const SCHEMA_NOW = Number(readFileSync(path.join(ROOT, 'src/db.js'), 'utf8').match(/SCHEMA_VERSION = (\d+)/)[1]);
const sc = mot("SELECT value FROM meta WHERE key = 'schema'");
if (!sc || Number(sc.value) !== SCHEMA_NOW) LOI.push(['Phiên bản cấu trúc khác bản của mã', 1, [{ csdl: sc && sc.value, ma: SCHEMA_NOW, ghi_chu: 'cơ sở dữ liệu tự nâng cấp ở lần gọi API đầu tiên sau deploy' }]]);
const TRIG = ['audit_no_update', 'audit_no_delete', 'counts_log_no_update', 'counts_log_no_delete', 'loans_chk_insert', 'loans_no_edit', 'satvun_chk_insert', 'satvun_no_edit'];
loi('Thiếu trigger bảo vệ', TRIG.filter((t) => !mot("SELECT 1 x FROM sqlite_master WHERE type = 'trigger' AND name = ?", t)).map((t) => ({ trigger: t })));
const ok = (b) => co(b);

/* ---------- 2. Người dùng ---------- */
if (ok('users')) {
  TQ.push(['Người dùng (đang dùng / đã xoá / bị khoá)', [mot('SELECT COUNT(*) n FROM users WHERE deleted = 0').n, mot('SELECT COUNT(*) n FROM users WHERE deleted = 1').n, mot('SELECT COUNT(*) n FROM users WHERE locked = 1 AND deleted = 0').n].join(' / ')]);
  if (!mot("SELECT 1 x FROM users WHERE role = 'admin' AND deleted = 0 AND locked = 0")) LOI.push(['Không còn admin nào dùng được', 1, []]);
  loi('Số điện thoại trùng', q('SELECT phone, COUNT(*) n FROM users GROUP BY phone HAVING n > 1'));
  loi('Vai trò lạ', q("SELECT id, name, role FROM users WHERE role NOT IN ('admin','daidoi','trungdoi','cvktht','tieudoi')"));
  cb('Tài khoản chưa đổi PIN lần đầu', q('SELECT id, name FROM users WHERE must_change = 1 AND deleted = 0'));
  if (ok('sessions')) cb('Phiên đăng nhập của tài khoản đã xoá / bị khoá', q('SELECT s.user_id FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.deleted = 1 OR u.locked = 1'));
}

/* ---------- 3. Danh mục khu, phi ---------- */
if (ok('khu') && ok('phi')) {
  TQ.push(['Khu (đang dùng / ẩn)', mot('SELECT COUNT(*) n FROM khu WHERE active = 1').n + ' / ' + mot('SELECT COUNT(*) n FROM khu WHERE active = 0').n]);
  TQ.push(['Phi (đang dùng / ẩn)', mot('SELECT COUNT(*) n FROM phi WHERE active = 1').n + ' / ' + mot('SELECT COUNT(*) n FROM phi WHERE active = 0').n]);
  loi('Phi có khối lượng / số cây mỗi bó không hợp lệ', q('SELECT id, kg_per_cay, bo_size FROM phi WHERE NOT (kg_per_cay > 0) OR NOT (bo_size >= 1)'));
  const thieu = (bang, cot) => (ok(bang) ? q(`SELECT DISTINCT ${cot} v FROM ${bang} WHERE ${cot} IS NOT NULL AND ${cot} NOT IN (SELECT id FROM ${cot === 'phi_id' ? 'phi' : 'khu'})`) : []);
  for (const [b, c] of [['receipts', 'khu_id'], ['receipts', 'phi_id'], ['counts', 'khu_id'], ['counts', 'phi_id'], ['baseline', 'khu_id'], ['baseline', 'phi_id'], ['loans', 'phi_id'], ['satvun', 'khu_id'], ['khu_phi', 'khu_id'], ['khu_phi', 'phi_id']]) {
    loi(`${b}.${c} trỏ tới ${c === 'phi_id' ? 'phi' : 'khu'} không có thật`, thieu(b, c));
  }
}

/* ---------- 4. Phiếu kho ---------- */
if (ok('receipts')) {
  TQ.push(['Dòng phiếu kho (hiệu lực / chờ duyệt / đã huỷ)', [mot('SELECT COUNT(*) n FROM receipts WHERE voided = 0 AND duyet_day IS NOT NULL').n, mot('SELECT COUNT(*) n FROM receipts WHERE voided = 0 AND duyet_day IS NULL').n, mot('SELECT COUNT(*) n FROM receipts WHERE voided = 1').n].join(' / ')]);
  loi('Dòng phiếu số lượng 0', q('SELECT id, grp, kind FROM receipts WHERE qty = 0'));
  loi('Phiếu nhập có số âm', q("SELECT id, grp, qty FROM receipts WHERE kind = 'nhap' AND qty < 0"));
  loi('Phiếu xuất có số dương', q("SELECT id, grp, qty FROM receipts WHERE kind = 'xuat' AND qty > 0"));
  loi('Phiếu chuyển khu không cân hai đầu (tổng ≠ 0)', q("SELECT grp, phi_id, SUM(qty) tong FROM receipts WHERE kind = 'chuyen' AND voided = 0 GROUP BY grp, phi_id HAVING tong <> 0"));
  loi('Một phiếu (grp) nửa duyệt nửa chưa', q('SELECT grp FROM receipts WHERE grp IS NOT NULL AND voided = 0 GROUP BY grp HAVING SUM(duyet_day IS NULL) > 0 AND SUM(duyet_day IS NOT NULL) > 0'));
  loi('Một phiếu (grp) nửa huỷ nửa còn', q('SELECT grp FROM receipts WHERE grp IS NOT NULL GROUP BY grp HAVING SUM(voided = 1) > 0 AND SUM(voided = 0) > 0'));
  cb('Phiếu chờ duyệt quá 3 ngày', q('SELECT grp, MIN(day) ngay, kind FROM receipts WHERE voided = 0 AND duyet_day IS NULL AND day < ? GROUP BY grp', vnDay(Date.now() - 3 * 864e5)));
}

/* ---------- 5. Số đếm, chốt ngày ---------- */
if (ok('counts')) {
  loi('Số đếm âm', q('SELECT day, khu_id, phi_id, v FROM counts WHERE v < 0'));
  loi('Số đếm "để trống" mà khác 0', q("SELECT day, khu_id, phi_id, v FROM counts WHERE kind = 'zero' AND v <> 0"));
  cb('Báo cáo đếm chờ duyệt từ ngày trước', q('SELECT day, khu_id, COUNT(*) n FROM counts WHERE NOT (duyet_ts IS NOT NULL AND duyet_ts = ts) AND day < ? GROUP BY day, khu_id', today));
}
if (ok('day_close')) {
  const ds = q('SELECT day FROM day_close ORDER BY day').map((r) => r.day);
  TQ.push(['Ngày đã chốt', ds.length ? `${ds.length} ngày, gần nhất ${ds[ds.length - 1]}` : 'chưa có']);
  const ho = [];
  for (let i = 1; i < ds.length; i++) { const sau = new Date(Date.parse(ds[i - 1] + 'T00:00:00Z') + 864e5).toISOString().slice(0, 10); if (sau !== ds[i]) ho.push({ tu: ds[i - 1], den: ds[i] }); }
  cb('Khoảng trống giữa các ngày chốt (ngày không có số liệu thì bình thường)', ho);
  const cuoi = ds[ds.length - 1];
  if (cuoi && cuoi < vnDay(Date.now() - 2 * 864e5)) CB.push(['Lâu chưa tự chốt ngày (lịch chạy mỗi giờ có thể đang hỏng)', 1, [{ ngay_chot_cuoi: cuoi }]]);
}

/* ---------- 6. Tồn kho theo đúng hàm của app ---------- */
if (ok('khu') && ok('phi') && ok('receipts') && ok('counts')) {
  // shim D1 tối giản trên node:sqlite (như test/harness.mjs), chỉ đọc
  const st = (sql, p = []) => ({ bind: (...a) => st(sql, a), all: async () => ({ results: raw.prepare(sql).all(...p) }), first: async () => raw.prepare(sql).get(...p) || null });
  const env = { DB: { prepare: (sql) => st(sql), batch: async (ss) => Promise.all(ss.map((x) => x.all())) } };
  const { tonCells } = await import(pathToFileURL(path.join(ROOT, 'src/phieu.js')).href);
  const khu = q('SELECT id, name FROM khu'), phi = q('SELECT id, kg_per_cay FROM phi');
  const cells = khu.flatMap((k) => phi.map((p) => ({ khu: k.id, phi: p.id })));
  const ton = await tonCells(env, today, cells, false);
  const am = Object.entries(ton).filter(([, v]) => v < 0).map(([k, v]) => ({ o: k, ton: v }));
  loi('TỒN ÂM (khu|phi) theo cách app tính', am);
  const kgTong = Object.entries(ton).reduce((a, [k, v]) => a + Math.max(0, v) * (phi.find((p) => p.id === k.split('|')[1]) || { kg_per_cay: 0 }).kg_per_cay, 0);
  TQ.push(['Tổng tồn toàn bãi (đã duyệt)', (kgTong / 1000).toFixed(2) + ' tấn']);
  const an = khu.filter((k) => mot('SELECT active FROM khu WHERE id = ?', k.id).active === 0 && phi.some((p) => (ton[k.id + '|' + p.id] || 0) > 0));
  cb('Khu đã ẩn mà còn thép', an.map((k) => ({ khu: k.id, ten: k.name })));
}

/* ---------- 7. Sổ vay mượn, sắt vụn ---------- */
if (ok('loans')) {
  loi('Dòng vay mượn trỏ tới đối tác không có thật', q('SELECT id, doitac_id FROM loans WHERE doitac_id NOT IN (SELECT id FROM doitac)'));
  loi('Dòng vay mượn số lượng ≤ 0', q('SELECT id, qty FROM loans WHERE qty <= 0'));
  loi('Dư nợ âm (trả nhiều hơn vay) theo đối tác × phi',
    q(`SELECT doitac_id, phi_id, SUM(CASE WHEN kind IN ('vay','cho_vay') THEN qty ELSE -qty END) du, (kind IN ('vay','tra_vay')) chieu
       FROM loans WHERE voided = 0 AND duyet_ts IS NOT NULL GROUP BY doitac_id, phi_id, chieu HAVING du < 0`));
  cb('Số biên bản ghi trùng (cùng đối tác, loại, phi)', q("SELECT doitac_id, kind, phi_id, so_bb, COUNT(*) n FROM loans WHERE voided = 0 AND so_bb IS NOT NULL GROUP BY doitac_id, kind, phi_id, lower(replace(replace(replace(so_bb,' ',''),'-',''),'.','')) HAVING n > 1"));
}
if (ok('satvun')) {
  loi('Sắt vụn khối lượng ≤ 0', q('SELECT id, kg FROM satvun WHERE kg <= 0'));
  cb('Số phiếu cân sắt vụn ghi trùng', q("SELECT so_phieu, COUNT(*) n FROM satvun WHERE voided = 0 GROUP BY lower(replace(replace(replace(so_phieu,' ',''),'-',''),'.','')) HAVING n > 1"));
}

/* ---------- 8. Quân số, gia công, ảnh, báo cáo ---------- */
if (ok('quan_so')) {
  loi('Quân số: đi làm âm hoặc vượt tổng', q('SELECT ngay, ca, user_id, tong, lam FROM quan_so WHERE lam < 0 OR lam > tong'));
  loi('Quân số: ca không phải 1 / 2', q('SELECT ngay, ca, user_id FROM quan_so WHERE ca NOT IN (1, 2)'));
  cb('Quân số của người không còn là Tiểu đội trưởng', q("SELECT DISTINCT q.user_id FROM quan_so q LEFT JOIN users u ON u.id = q.user_id WHERE u.id IS NULL OR u.role <> 'tieudoi'"));
}
if (ok('don_gc')) {
  loi('Đơn gia công tiến độ ngoài 0–100', q('SELECT id, pct FROM don_gc WHERE pct < 0 OR pct > 100'));
  loi('Đơn gia công trạng thái lạ', q("SELECT id, tt FROM don_gc WHERE tt NOT IN ('moi','nhan','lam','xong','huy')"));
  loi('Đơn gia công giao cho người không có thật', q('SELECT id, user_id FROM don_gc WHERE user_id NOT IN (SELECT id FROM users)'));
  if (ok('don_gc_nguoi')) loi('Người làm của đơn không còn đơn', q('SELECT don_id FROM don_gc_nguoi WHERE don_id NOT IN (SELECT id FROM don_gc)'));
  cb('Đơn đang mở của người đã xoá', q("SELECT d.id, d.cau_kien FROM don_gc d JOIN users u ON u.id = d.user_id WHERE u.deleted = 1 AND d.tt NOT IN ('xong','huy')"));
}
if (ok('anh_bb')) {
  loi('Ảnh biên bản trỏ tới dòng sổ không có thật', q(`SELECT id, loai, entity_id FROM anh_bb a WHERE NOT (
      (loai = 'loan' AND entity_id IN (SELECT id FROM loans)) OR (loai = 'satvun' AND entity_id IN (SELECT id FROM satvun)) OR (loai = 'gc' AND entity_id IN (SELECT id FROM don_gc)))`));
}
if (ok('thep_ve')) {
  const tv = mot('SELECT COUNT(*) n, MIN(ngay) tu, MAX(ngay) den FROM thep_ve WHERE voided = 0');
  TQ.push(['Sổ thép về (chuyến còn hiệu lực)', tv.n ? `${tv.n} chuyến, ${tv.tu} → ${tv.den}, ${(mot('SELECT SUM(COALESCE(d.kg, d.kg_tinh, 0)) s FROM thep_ve v JOIN thep_ve_dong d ON d.ve_id = v.id WHERE v.voided = 0').s / 1000).toFixed(2)} tấn` : 'chưa có']);
  loi('Chuyến thép về không có dòng phi nào', q('SELECT v.id, v.ngay FROM thep_ve v WHERE v.voided = 0 AND NOT EXISTS (SELECT 1 FROM thep_ve_dong d WHERE d.ve_id = v.id)'));
  loi('Dòng thép về mồ côi (không thuộc chuyến nào)', q('SELECT id, ve_id FROM thep_ve_dong WHERE ve_id IS NULL OR ve_id NOT IN (SELECT id FROM thep_ve)'));
  loi('Chuyến thép về trỏ tới nhà cung cấp không có thật', q('SELECT id, ncc_id FROM thep_ve WHERE ncc_id IS NULL OR ncc_id NOT IN (SELECT id FROM thep_ncc)'));
  loi('Chuyến thép về gắn đơn không có thật', q('SELECT id, don_id FROM thep_ve WHERE don_id IS NOT NULL AND don_id NOT IN (SELECT id FROM thep_don)'));
  loi('Dòng thép về phi không có thật', q('SELECT DISTINCT phi_id FROM thep_ve_dong WHERE phi_id NOT IN (SELECT id FROM phi)'));
  loi('Dòng thép về không có số nào (bó, cây, kg đều trống)', q('SELECT id, ve_id FROM thep_ve_dong WHERE COALESCE(bo, 0) = 0 AND COALESCE(cay, 0) = 0 AND COALESCE(kg, 0) = 0'));
  loi('Ngày về sau hôm nay', q('SELECT id, ngay FROM thep_ve WHERE ngay > ?', today));
  cb('Kg phiếu lệch kg tự tính quá 5%', q('SELECT ve_id, phi_id, kg, kg_tinh FROM thep_ve_dong WHERE kg IS NOT NULL AND kg_tinh IS NOT NULL AND kg_tinh > 0 AND ABS(kg - kg_tinh) > kg_tinh * 0.05'));
  cb('Số phiếu ghi trùng (cùng nhà cung cấp)', q("SELECT ncc_id, so_phieu, COUNT(*) n FROM thep_ve WHERE voided = 0 AND so_phieu IS NOT NULL GROUP BY ncc_id, lower(replace(replace(replace(so_phieu,' ',''),'-',''),'.','')) HAVING n > 1"));
  if (ok('thep_don')) {
    loi('Đơn hàng không có dòng phi nào', q("SELECT d.id, d.so_don FROM thep_don d WHERE d.tt <> 'huy' AND NOT EXISTS (SELECT 1 FROM thep_don_dong x WHERE x.don_id = d.id)"));
    loi('Đơn hàng trạng thái lạ', q("SELECT id, tt FROM thep_don WHERE tt NOT IN ('mo','xong','huy')"));
    cb('Đơn đang giao đã quá hạn mà chưa về đủ', q(`SELECT d.id, d.so_don, d.han FROM thep_don d WHERE d.tt = 'mo' AND d.han IS NOT NULL AND d.han < ? AND
      (SELECT COALESCE(SUM(kg), 0) FROM thep_don_dong WHERE don_id = d.id) > (SELECT COALESCE(SUM(COALESCE(x.kg, x.kg_tinh, 0)), 0) FROM thep_ve v JOIN thep_ve_dong x ON x.ve_id = v.id WHERE v.don_id = d.id AND v.voided = 0)`, today));
  }
}
/* ---------- 9. Tối ưu: bảng phình to, truy vấn quét cả bảng ---------- */
const lon = BANG.filter(ok).map((b) => ({ bang: b, dong: mot(`SELECT COUNT(*) n FROM ${b}`).n })).sort((a, z) => z.dong - a.dong);
TQ.push(['Bảng nhiều dòng nhất', lon.slice(0, 5).map((x) => `${x.bang} ${x.dong}`).join(', ')]);
if (ok('sessions')) cb('Phiên đăng nhập đã hết hạn chưa dọn (lịch dọn mỗi giờ có thể hỏng)', q('SELECT COUNT(*) n FROM sessions WHERE expires_at < ? HAVING n > 50', Date.now() - 2 * 3600e3));
if (ok('login_fail')) cb('Bộ đếm nhập sai PIN cũ chưa dọn', q('SELECT COUNT(*) n FROM login_fail WHERE day < ? HAVING n > 0', today));
if (san_luong_ok()) TQ.push(['Báo cáo sản lượng đã lưu', mot('SELECT COUNT(*) n FROM san_luong').n + ' ngày']);
function san_luong_ok() { return ok('san_luong'); }
if (ok('bao_cao_ca')) TQ.push(['Báo cáo ca đã lưu', mot('SELECT COUNT(*) n FROM bao_cao_ca').n + ' ca']);
if (ok('audit')) TQ.push(['Dòng nhật ký', String(mot('SELECT COUNT(*) n FROM audit').n)]);

/* ---------- in kết quả ---------- */
console.log('=== TỔNG QUAN ===');
for (const [t, v] of TQ) console.log(' ', t + ':', v);
console.log('\n=== LỖI (dữ liệu sai, cần sửa) ===' + (LOI.length ? '' : '\n  Không có.'));
for (const [t, n, mau] of LOI) console.log(`  ✗ ${t}: ${n}\n      ví dụ: ${JSON.stringify(mau)}`);
console.log('\n=== CẢNH BÁO (đáng xem lại, chưa chắc là sai) ===' + (CB.length ? '' : '\n  Không có.'));
for (const [t, n, mau] of CB) console.log(`  ! ${t}: ${n}\n      ví dụ: ${JSON.stringify(mau)}`);
process.exit(LOI.length ? 1 : 0);
