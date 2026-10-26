// Sổ thép về công trình: chuyến thép về, đơn hàng, nhà cung cấp — sổ THỐNG KÊ, tách hẳn khỏi tồn bãi.
import { CAP, DAY_RE, HttpError, bad, json, rand, vnDay } from './core.js';
import { CSV_HEAD, auditStmt, batchGuarded, bump, csvDec, csvRow, guardStmt, readJson } from './helpers.js';
import { firstAdminId } from './admin.js';
import { bbKhoa } from './loans.js';

/* ========================= SỔ THÉP VỀ =========================
   Ghi MỌI chuyến thép về công trình từ đầu năm (kể cả trước khi dùng app) để theo dõi đơn hàng, nhà cung cấp, ngày về, loại,
   số lượng. KHÔNG đụng tồn bãi: số liệu ra / vào bãi trước đây không có nên tổng thép về sẽ không bao giờ khớp tồn bãi, và không
   cần khớp. (Thép về từ nay mà vào bãi thì vẫn lập phiếu Nhập kho như thường để tồn bãi đúng.)
   - QUYỀN GHI (ghi chuyến, lập / đóng đơn, nhập Excel, huỷ): admin đầu tiên, và người được admin đầu tiên GIAO QUYỀN (users.thep_ve).
     XEM: những người đó và CVKTHT trở lên.
   - MỖI DÒNG một phi, đủ các cột như phiếu giao / đơn hàng: số bó, số cây, kg theo phiếu (gõ tay), và kg APP TỰ TÍNH
     = (bó × số cây mỗi bó + cây) × kg mỗi cây của phi LÚC GHI (chụp lại, đổi danh mục phi sau này không làm đổi sổ cũ).
     Khối lượng dùng cho thống kê = kg theo phiếu nếu có, không thì kg tự tính. Chênh lệch giữa hai số hiện ra để soát.
     Phi thép cuộn (D6, D8): "bó" là số cuộn, "cây" là số phần (như mọi chỗ khác của app).
   - ĐƠN HÀNG: nhà cung cấp, số đơn, ngày đặt, hạn, các phi + khối lượng đặt. Chuyến về gắn vào đơn; app cộng đã về / còn thiếu.
   - NHẬP EXCEL: dán bảng từ Excel (mỗi dòng một phi của một chuyến); các dòng cùng ngày + nhà cung cấp + số phiếu là một chuyến.
     Thử trước (thu) để xem lỗi / số chuyến rồi mới ghi; cả lần nhập là một giao dịch, lỗi một dòng thì không ghi gì. */
export const TV_MAX_KG = 500000; // một dòng tối đa 500 tấn: hơn là gõ nhầm đơn vị
const SO = 99999;

const chu = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
const ngayThat = (d) => { const t = Date.parse(d + 'T00:00:00Z'); return DAY_RE.test(d) && Number.isFinite(t) && vnDay(t) === d; };
const intOr = (v, max, label) => {
  if (v === undefined || v === null || v === '') return null;
  let t = String(v).trim().replace(/\s/g, '');
  if (/^\d{1,3}(,\d{3})+$/.test(t)) t = t.replace(/,/g, ''); // "1,250" của Excel kiểu Mỹ = 1250
  const n = Number(t.replace(/\./g, '').replace(',', '.'));
  if (!Number.isInteger(n) || n < 0 || n > max) throw bad(label + ' không hợp lệ');
  return n;
};
// kg gõ tay: nhận "25340", "25.340" (dấu chấm nghìn kiểu Việt), "25340,5" -> làm tròn kg
const kgOr = (v, label) => {
  if (v === undefined || v === null || v === '') return null;
  let t = String(v).trim().replace(/\s/g, '');
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, ''); // Excel kiểu Mỹ: "25,340" = 25340 kg
  else t = t.replace(',', '.');
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n > TV_MAX_KG) throw bad(label + ' không hợp lệ (kg, tối đa ' + TV_MAX_KG / 1000 + ' tấn một dòng)');
  return Math.round(n);
};
export async function quyenTv(env, user) {
  if (!user) return { ghi: false, xem: false };
  const first = await firstAdminId(env);
  const ghi = user.id === first || user.thep_ve === 1;
  const cap = CAP[user.role] || 0;
  return { ghi, xem: ghi || cap >= 1, first };
}
const canGhi = async (env, user) => { const q = await quyenTv(env, user); if (!q.ghi) throw new HttpError(403, 'Chỉ người được admin đầu tiên giao quyền mới ghi sổ thép về'); return q; };

/* Đọc các dòng của một chuyến / một đơn: { phi, bo, cay, kg }. Phi theo danh mục (cả phi đã ẩn: số liệu cũ vẫn ghi được). */
function docDong(lines, phiBy, label) {
  const raw = Array.isArray(lines) ? lines : [];
  if (!raw.length) throw bad(label + ' chưa có dòng nào');
  if (raw.length > 40) throw bad(label + ' tối đa 40 dòng');
  return raw.map((x, i) => {
    const phi = String((x && x.phi) || '').trim();
    if (!Object.hasOwn(phiBy, phi)) throw bad(`Dòng ${i + 1}: phi không hợp lệ "${phi}"`);
    const p = phiBy[phi];
    const bo = intOr(x.bo, SO, `Dòng ${i + 1}: số bó`), cay = intOr(x.cay, SO * 100, `Dòng ${i + 1}: số cây`), kg = kgOr(x.kg, `Dòng ${i + 1}: kg`);
    if (!bo && !cay && !kg) throw bad(`Dòng ${i + 1} (${phi}): ghi ít nhất số bó, số cây hoặc kg`);
    const kgTinh = bo || cay ? Math.round(((bo || 0) * p.bo_size + (cay || 0)) * p.kg_per_cay) : null;
    return { phi, bo, cay, kg, kg_tinh: kgTinh };
  });
}
const docNgay = (v, label) => {
  const d = String(v || '');
  if (!ngayThat(d)) throw bad(label + ' không hợp lệ');
  if (d > vnDay()) throw bad(label + ' không được sau hôm nay');
  return d;
};

/* Nhà cung cấp theo tên (tạo mới nếu chưa có). Trả về câu lệnh tạo + biểu thức SQL lấy id theo tên. */
const nccTao = (env, name) => env.DB.prepare('INSERT OR IGNORE INTO thep_ncc (name, active, ts) VALUES (?, 1, ?)').bind(name, Date.now());

/* ---------- XEM: chuyến về trong khoảng ngày, đơn hàng, nhà cung cấp, thống kê ---------- */
export async function tvView(env, url, user) {
  const q = await quyenTv(env, user);
  if (!q.xem) throw new HttpError(403, 'Bạn không có quyền xem sổ thép về');
  const today = vnDay();
  let tu = String(url.searchParams.get('tu') || today.slice(0, 4) + '-01-01'), den = String(url.searchParams.get('den') || today);
  if (!ngayThat(tu) || !ngayThat(den) || tu > den) throw bad('Khoảng ngày không hợp lệ');
  /* TỐI ƯU: cả năm có thể gần nghìn chuyến / vài nghìn dòng phi (~350 KB) — không gửi hết xuống điện thoại.
     - Thống kê của kỳ (tổng, theo tháng, theo nhà cung cấp, theo phi, bảng chéo NCC × phi) cộng sẵn bằng SQL, chỉ gửi kết quả.
     - Danh sách chuyến theo TRANG: mới nhất trước, mỗi trang `so` chuyến (mặc định 100), bỏ qua `bo_qua` chuyến đầu ("Xem thêm"). */
  const so = Math.min(300, Math.max(1, Number(url.searchParams.get('so')) || 100)), boQua = Math.max(0, Number(url.searchParams.get('bo_qua')) || 0);
  const KG = 'COALESCE(d.kg, d.kg_tinh, 0)', TU = 'FROM thep_ve v JOIN thep_ve_dong d ON d.ve_id = v.id WHERE v.voided = 0 AND v.ngay >= ?1 AND v.ngay <= ?2';
  const [nccR, donR, donDongR, veR, dongR, daVeR, phiR, tongR, thangR, nccTkR, phiTkR, cheoR] = await env.DB.batch([
    env.DB.prepare('SELECT id, name, active FROM thep_ncc ORDER BY name'),
    env.DB.prepare("SELECT d.*, COALESCE(u.name, '(đã xoá)') uname FROM thep_don d LEFT JOIN users u ON u.id = d.user_id ORDER BY (d.tt = 'mo') DESC, d.ngay_dat DESC, d.id DESC LIMIT 500"),
    env.DB.prepare('SELECT don_id, phi_id phi, bo, cay, kg FROM thep_don_dong'),
    env.DB.prepare("SELECT v.id, v.ngay, v.ncc_id, v.don_id, v.so_don, v.so_phieu, v.bien_so, v.ghi_chu, v.nguon, v.ts, COALESCE(u.name, '(đã xoá)') uname FROM thep_ve v LEFT JOIN users u ON u.id = v.user_id WHERE v.voided = 0 AND v.ngay >= ?1 AND v.ngay <= ?2 ORDER BY v.ngay DESC, v.id DESC LIMIT ?3 OFFSET ?4").bind(tu, den, so, boQua),
    // chỉ dòng phi của các chuyến trong TRANG này
    env.DB.prepare(`SELECT d.ve_id, d.phi_id phi, d.bo, d.cay, d.kg, d.kg_tinh FROM thep_ve_dong d WHERE d.ve_id IN (
                      SELECT v.id FROM thep_ve v WHERE v.voided = 0 AND v.ngay >= ?1 AND v.ngay <= ?2 ORDER BY v.ngay DESC, v.id DESC LIMIT ?3 OFFSET ?4) ORDER BY d.id`).bind(tu, den, so, boQua),
    // đã về theo đơn × phi (MỌI ngày, không chỉ trong khoảng đang xem): tiến độ đơn hàng
    env.DB.prepare('SELECT v.don_id, d.phi_id phi, SUM(COALESCE(d.kg, d.kg_tinh, 0)) kg, COUNT(DISTINCT v.id) chuyen FROM thep_ve v JOIN thep_ve_dong d ON d.ve_id = v.id WHERE v.voided = 0 AND v.don_id IS NOT NULL GROUP BY v.don_id, d.phi_id'),
    env.DB.prepare('SELECT id, bo_size, kg_per_cay, unit, active FROM phi ORDER BY sort, id'),
    env.DB.prepare(`SELECT COUNT(DISTINCT v.id) chuyen, COALESCE(SUM(${KG}), 0) kg, COUNT(DISTINCT v.ncc_id) ncc ${TU}`).bind(tu, den),
    env.DB.prepare(`SELECT substr(v.ngay, 1, 7) thang, COUNT(DISTINCT v.id) n, SUM(${KG}) kg ${TU} GROUP BY thang ORDER BY thang DESC`).bind(tu, den),
    env.DB.prepare(`SELECT v.ncc_id, COUNT(DISTINCT v.id) n, SUM(${KG}) kg ${TU} GROUP BY v.ncc_id ORDER BY kg DESC`).bind(tu, den),
    env.DB.prepare(`SELECT d.phi_id phi, SUM(${KG}) kg ${TU} GROUP BY d.phi_id`).bind(tu, den),
    env.DB.prepare(`SELECT v.ncc_id, d.phi_id phi, SUM(${KG}) kg ${TU} GROUP BY v.ncc_id, d.phi_id`).bind(tu, den),
  ]);
  const dongBy = {};
  for (const d of dongR.results) (dongBy[d.ve_id] = dongBy[d.ve_id] || []).push(d);
  const ddBy = {}, veDon = {};
  for (const d of donDongR.results) (ddBy[d.don_id] = ddBy[d.don_id] || []).push(d);
  for (const d of daVeR.results) { const o = (veDon[d.don_id] = veDon[d.don_id] || {}); o[d.phi] = d.kg; }
  const tong = tongR.results[0] || { chuyen: 0, kg: 0, ncc: 0 };
  return json({
    tu, den, quyen: { ghi: q.ghi }, ncc: nccR.results, phi: phiR.results,
    don: donR.results.map((d) => ({ ...d, dong: ddBy[d.id] || [], da_ve: veDon[d.id] || {} })),
    ve: veR.results.map((v) => ({ ...v, dong: dongBy[v.id] || [] })),
    trang: { so, bo_qua: boQua, tong: tong.chuyen },
    tk: { tong, thang: thangR.results, ncc: nccTkR.results, phi: phiTkR.results, cheo: cheoR.results },
  });
}

/* ---------- GHI MỘT CHUYẾN ---------- */
export async function tvGhi(req, env, user) {
  await canGhi(env, user);
  const b = await readJson(req);
  const ngay = docNgay(b.ngay, 'Ngày về');
  const ncc = chu(b.ncc, 80);
  if (!ncc) throw bad('Chưa ghi nhà cung cấp');
  const phiR = await env.DB.prepare('SELECT id, bo_size, kg_per_cay FROM phi').all();
  const lines = docDong(b.lines, Object.fromEntries(phiR.results.map((p) => [p.id, p])), 'Chuyến');
  const soPhieu = chu(b.so_phieu, 40), bienSo = chu(b.bien_so, 20), ghiChu = chu(b.ghi_chu, 200), soDon = chu(b.so_don, 40);
  // khoá chống ghi trùng do máy gửi (bấm đúp / gửi lại lúc mạng chậm thì cùng khoá); không có thì server tự sinh — khoá cũng là chỗ nối dòng vào chuyến
  const khoaMay = /^[a-f0-9]{16}$/.test(String(b.khoa || '')) ? String(b.khoa) : null;
  const khoa = khoaMay || 's' + rand(8);
  // gửi lại cùng khoá (bấm đúp, mạng chậm): chính chuyến đã ghi — trả lại nó, trước mọi kiểm tra khác (kể cả "số phiếu trùng")
  if (khoaMay) {
    const co = await env.DB.prepare('SELECT id FROM thep_ve WHERE khoa = ?').bind(khoaMay).first();
    if (co) return json({ ok: true, id: co.id, trung: true });
  }
  const donId = b.don_id == null || b.don_id === '' ? null : Number(b.don_id);
  if (donId != null) {
    const d = await env.DB.prepare('SELECT d.id, d.tt, n.name ncc FROM thep_don d JOIN thep_ncc n ON n.id = d.ncc_id WHERE d.id = ?').bind(donId).first();
    if (!d) throw bad('Không tìm thấy đơn hàng');
    if (d.tt === 'huy') throw bad('Đơn hàng đã huỷ');
    if (d.ncc.toLowerCase() !== ncc.toLowerCase()) throw bad(`Đơn hàng này của ${d.ncc}, khác nhà cung cấp đang ghi`);
  }
  // cùng nhà cung cấp, cùng số phiếu, chưa huỷ: gần như chắc ghi hai lần — hỏi lại (trung: true để ghi thêm)
  if (soPhieu && b.trung !== true) {
    const k = bbKhoa(soPhieu);
    const tr = (await env.DB.prepare('SELECT v.so_phieu, v.ngay FROM thep_ve v JOIN thep_ncc n ON n.id = v.ncc_id WHERE v.voided = 0 AND v.so_phieu IS NOT NULL AND n.name = ? COLLATE NOCASE').bind(ncc).all()).results.filter((x) => bbKhoa(x.so_phieu) === k);
    if (tr.length) throw new HttpError(409, `Phiếu số ${tr[0].so_phieu} của ${ncc} đã có trong sổ (ngày ${tr[0].ngay.split('-').reverse().join('/')}). Nếu đúng là chuyến khác thì xác nhận để ghi thêm.`, 'trung_tv');
  }
  const ts = Date.now();
  const data = JSON.stringify(lines);
  const stmts = [
    nccTao(env, ncc),
    env.DB.prepare(`INSERT INTO thep_ve (ngay, ncc_id, don_id, so_don, so_phieu, bien_so, ghi_chu, nguon, user_id, ts, khoa)
                    VALUES (?1, (SELECT id FROM thep_ncc WHERE name = ?2 COLLATE NOCASE), ?3, ?4, ?5, ?6, ?7, 'app', ?8, ?9, ?10)`)
      .bind(ngay, ncc, donId, soDon || null, soPhieu || null, bienSo || null, ghiChu || null, user.id, ts, khoa),
    env.DB.prepare(`INSERT INTO thep_ve_dong (ve_id, phi_id, bo, cay, kg, kg_tinh)
                    SELECT (SELECT id FROM thep_ve WHERE khoa = ?1), json_extract(j.value, '$.phi'), json_extract(j.value, '$.bo'), json_extract(j.value, '$.cay'),
                           json_extract(j.value, '$.kg'), json_extract(j.value, '$.kg_tinh') FROM json_each(?2) j`).bind(khoa, data),
    auditStmt(env, user, 'tv_ghi', { ngay, ncc, so_phieu: soPhieu || undefined, so_don: soDon || undefined, don_id: donId || undefined, lines: lines.map((l) => ({ phi: l.phi, kg: l.kg ?? l.kg_tinh })) }),
    bump(env),
    env.DB.prepare('SELECT id FROM thep_ve WHERE khoa = ?').bind(khoa),
  ];
  // gửi lại cùng khoá (bấm đúp, mạng chậm): không ghi thêm
  const res = await batchGuarded(env, guardStmt(env, 'EXISTS (SELECT 1 FROM thep_ve WHERE khoa = ?)', khoa), stmts,
    new HttpError(409, 'Chuyến này vừa được ghi (gửi hai lần). Xem lại sổ.', 'trung_tv'));
  return json({ ok: true, id: res[res.length - 1].results[0].id });
}

/* ---------- HUỶ MỘT CHUYẾN (ghi nhầm) ---------- */
export async function tvHuy(req, env, user, id) {
  await canGhi(env, user);
  const b = await readJson(req);
  const ly = chu(b.ly_do, 200);
  if (!ly) throw bad('Cần ghi lý do huỷ');
  const v = await env.DB.prepare('SELECT v.*, n.name ncc FROM thep_ve v LEFT JOIN thep_ncc n ON n.id = v.ncc_id WHERE v.id = ?').bind(id).first();
  if (!v) throw new HttpError(404, 'Không tìm thấy chuyến');
  if (v.voided) throw bad('Chuyến này đã huỷ');
  await batchGuarded(env, guardStmt(env, 'NOT EXISTS (SELECT 1 FROM thep_ve WHERE id = ? AND voided = 0)', id), [
    env.DB.prepare('UPDATE thep_ve SET voided = 1, voided_ts = ?, voided_by = ?, voided_note = ? WHERE id = ?').bind(Date.now(), user.id, ly, id),
    auditStmt(env, user, 'tv_huy', { id, ngay: v.ngay, ncc: v.ncc, so_phieu: v.so_phieu || undefined, ly_do: ly }),
    bump(env),
  ], new HttpError(409, 'Chuyến này vừa được huỷ', 'changed'));
  return json({ ok: true });
}

/* ---------- ĐƠN HÀNG ---------- */
export async function tvDon(req, env, user) {
  await canGhi(env, user);
  const b = await readJson(req);
  const ncc = chu(b.ncc, 80), soDon = chu(b.so_don, 40);
  if (!ncc) throw bad('Chưa ghi nhà cung cấp');
  if (!soDon) throw bad('Chưa ghi số đơn hàng');
  const ngayDat = docNgay(b.ngay_dat, 'Ngày đặt');
  let han = null;
  if (b.han) { han = String(b.han); if (!ngayThat(han) || han < ngayDat) throw bad('Hạn giao phải từ ngày đặt trở đi'); }
  const phiR = await env.DB.prepare('SELECT id, bo_size, kg_per_cay FROM phi').all();
  const lines = docDong(b.lines, Object.fromEntries(phiR.results.map((p) => [p.id, p])), 'Đơn hàng');
  if (new Set(lines.map((l) => l.phi)).size !== lines.length) throw bad('Mỗi phi chỉ một dòng trong đơn');
  const trung = await env.DB.prepare("SELECT d.id FROM thep_don d JOIN thep_ncc n ON n.id = d.ncc_id WHERE n.name = ? COLLATE NOCASE AND d.so_don = ? COLLATE NOCASE AND d.tt <> 'huy'").bind(ncc, soDon).first();
  if (trung) throw bad(`Đơn số ${soDon} của ${ncc} đã có`);
  const ts = Date.now(), khoaDon = 'd' + rand(8);
  // kg đặt của dòng = kg gõ tay, không thì kg tự tính từ bó / cây
  const data = JSON.stringify(lines.map((l) => ({ phi: l.phi, bo: l.bo, cay: l.cay, kg: l.kg ?? l.kg_tinh })));
  const res = await env.DB.batch([
    nccTao(env, ncc),
    env.DB.prepare(`INSERT INTO thep_don (ncc_id, so_don, ngay_dat, han, ghi_chu, tt, user_id, ts, khoa)
                    VALUES ((SELECT id FROM thep_ncc WHERE name = ? COLLATE NOCASE), ?, ?, ?, ?, 'mo', ?, ?, ?)`).bind(ncc, soDon, ngayDat, han, chu(b.ghi_chu, 200) || null, user.id, ts, khoaDon),
    env.DB.prepare(`INSERT INTO thep_don_dong (don_id, phi_id, bo, cay, kg) SELECT (SELECT id FROM thep_don WHERE khoa = ?1), json_extract(j.value, '$.phi'), json_extract(j.value, '$.bo'),
                    json_extract(j.value, '$.cay'), json_extract(j.value, '$.kg') FROM json_each(?2) j`).bind(khoaDon, data),
    auditStmt(env, user, 'tv_don', { ncc, so_don: soDon, ngay_dat: ngayDat, lines: lines.map((l) => ({ phi: l.phi, kg: l.kg ?? l.kg_tinh })) }),
    bump(env),
    env.DB.prepare('SELECT id FROM thep_don WHERE khoa = ?').bind(khoaDon),
  ]);
  return json({ ok: true, id: res[res.length - 1].results[0].id });
}
// đóng đơn (đã đủ / thôi không giao nữa) hoặc huỷ đơn lập nhầm; mở lại đơn đã đóng
export async function tvDonViec(req, env, user, id, viec) {
  await canGhi(env, user);
  const b = await readJson(req);
  const d = await env.DB.prepare('SELECT d.*, n.name ncc FROM thep_don d LEFT JOIN thep_ncc n ON n.id = d.ncc_id WHERE d.id = ?').bind(id).first();
  if (!d) throw new HttpError(404, 'Không tìm thấy đơn hàng');
  const ly = chu(b.ly_do, 200);
  const moi = { dong: 'xong', huy: 'huy', molai: 'mo' }[viec];
  if (!moi) throw new HttpError(404, 'Không tìm thấy');
  if (viec === 'molai' && d.tt !== 'xong') throw bad('Chỉ mở lại được đơn đã đóng');
  if (viec !== 'molai' && d.tt !== 'mo') throw bad('Đơn này không còn mở');
  if (viec === 'huy') {
    if (!ly) throw bad('Cần ghi lý do huỷ đơn');
    const co = await env.DB.prepare('SELECT COUNT(*) n FROM thep_ve WHERE don_id = ? AND voided = 0').bind(id).first();
    if (co.n) throw bad(`Đơn đã có ${co.n} chuyến về: không huỷ được, hãy "Đóng đơn" thay vì huỷ`);
  }
  await batchGuarded(env, guardStmt(env, 'NOT EXISTS (SELECT 1 FROM thep_don WHERE id = ? AND tt = ?)', id, d.tt), [
    env.DB.prepare('UPDATE thep_don SET tt = ?, dong_ts = ?, dong_by = ?, dong_note = ? WHERE id = ?').bind(moi, Date.now(), user.id, ly || null, id),
    auditStmt(env, user, 'tv_don_' + viec, { id, ncc: d.ncc, so_don: d.so_don, ly_do: ly || undefined }),
    bump(env),
  ], new HttpError(409, 'Đơn hàng vừa được người khác cập nhật', 'changed'));
  return json({ ok: true });
}

/* ---------- NHẬP TỪ EXCEL ----------
   rows: [{ ngay, ncc, so_don, so_phieu, bien_so, phi, bo, cay, kg, ghi_chu }] — mỗi dòng một phi; dòng cùng (ngày, nhà cung cấp, số
   phiếu) gộp thành một chuyến (dòng không có số phiếu: mỗi dòng một chuyến). thu = true: chỉ kiểm, trả lỗi và số chuyến, không ghi.
   Ghi: MỘT batch cho cả lần nhập (một giao dịch). Số đơn trùng một đơn đã lập của cùng nhà cung cấp thì gắn chuyến vào đơn đó. */
export async function tvNhap(req, env, user) {
  await canGhi(env, user);
  const b = await readJson(req);
  const rows = Array.isArray(b.rows) ? b.rows : [];
  if (!rows.length) throw bad('Không có dòng nào để nhập');
  if (rows.length > 3000) throw bad('Mỗi lần nhập tối đa 3.000 dòng — chia file làm nhiều lần');
  const [phiR, donR, coR] = await env.DB.batch([
    env.DB.prepare('SELECT id, bo_size, kg_per_cay FROM phi'),
    env.DB.prepare("SELECT d.id, d.so_don, n.name ncc FROM thep_don d JOIN thep_ncc n ON n.id = d.ncc_id WHERE d.tt <> 'huy'"),
    env.DB.prepare('SELECT v.so_phieu, n.name ncc FROM thep_ve v JOIN thep_ncc n ON n.id = v.ncc_id WHERE v.voided = 0 AND v.so_phieu IS NOT NULL'),
  ]);
  const phiBy = Object.fromEntries(phiR.results.map((p) => [p.id, p]));
  const donBy = Object.fromEntries(donR.results.map((d) => [d.ncc.toLowerCase() + '|' + bbKhoa(d.so_don), d.id]));
  const daCo = new Set(coR.results.map((x) => x.ncc.toLowerCase() + '|' + bbKhoa(x.so_phieu)));
  const loi = [], chuyen = new Map();
  rows.forEach((r, i) => {
    const so = i + 1;
    try {
      const ngay = docNgay(String((r && r.ngay) || '').trim(), 'Ngày về');
      const ncc = chu(r.ncc, 80);
      if (!ncc) throw bad('Chưa có nhà cung cấp');
      const [l] = docDong([{ phi: r.phi, bo: r.bo, cay: r.cay, kg: r.kg }], phiBy, 'Dòng');
      const soPhieu = chu(r.so_phieu, 40), soDon = chu(r.so_don, 40);
      if (soPhieu && daCo.has(ncc.toLowerCase() + '|' + bbKhoa(soPhieu)) && b.bo_trung !== true) throw bad(`Phiếu ${soPhieu} của ${ncc} đã có trong sổ`);
      const k = soPhieu ? ngay + '|' + ncc.toLowerCase() + '|' + bbKhoa(soPhieu) : 'dong' + so;
      let c = chuyen.get(k);
      if (!c) { c = { ngay, ncc, so_phieu: soPhieu || null, so_don: soDon || null, bien_so: chu(r.bien_so, 20) || null, ghi_chu: chu(r.ghi_chu, 200) || null, dong: [], khoa: 'nh' + chuyen.size }; chuyen.set(k, c); }
      if (soDon && !c.so_don) c.so_don = soDon;
      c.dong.push(l);
    } catch (e) { loi.push({ dong: so, loi: e.message.replace(/^Dòng [^:]*: /, '') }); }
  });
  const ds = [...chuyen.values()];
  ds.forEach((c) => { c.don_id = c.so_don ? donBy[c.ncc.toLowerCase() + '|' + bbKhoa(c.so_don)] || null : null; });
  const tongKg = ds.reduce((a, c) => a + c.dong.reduce((s, l) => s + (l.kg ?? l.kg_tinh ?? 0), 0), 0);
  const ngays = ds.map((c) => c.ngay).sort();
  /* CẢNH BÁO (không chặn): dòng chỉ có kg mà kg rất nhỏ — gần như chắc cột "Khối lượng" đang ghi TẤN (25,34) chứ không phải kg.
     Hiện ra ở bước Kiểm tra để người nhập soát trước khi ghi; vẫn cho nhập (có thể là số lẻ thật). */
  const canh = [];
  ds.forEach((c) => c.dong.forEach((l) => { if (l.kg != null && l.kg < 100 && !l.bo && !l.cay) canh.push({ ngay: c.ngay, ncc: c.ncc, phi: l.phi, kg: l.kg }); }));
  const tomTat = { dong: rows.length, chuyen: ds.length, kg: tongKg, ncc: [...new Set(ds.map((c) => c.ncc))].length, gan_don: ds.filter((c) => c.don_id).length,
    tu: ngays[0] || null, den: ngays[ngays.length - 1] || null, canh: canh.slice(0, 50), so_canh: canh.length };
  if (b.thu === true || loi.length) return json({ ok: !loi.length, thu: true, loi: loi.slice(0, 200), so_loi: loi.length, ...tomTat });
  const ts = Date.now(), lo = 'n' + ts.toString(36); // khoá tạm cho lần nhập này: nối dòng vào đúng chuyến vừa chèn
  ds.forEach((c, i) => { c.khoa = lo + '-' + i; });
  const ncc = [...new Set(ds.map((c) => c.ncc))];
  const ve = JSON.stringify(ds.map((c) => ({ ngay: c.ngay, ncc: c.ncc, don_id: c.don_id, so_don: c.so_don, so_phieu: c.so_phieu, bien_so: c.bien_so, ghi_chu: c.ghi_chu, khoa: c.khoa })));
  const dong = JSON.stringify(ds.flatMap((c) => c.dong.map((l) => ({ khoa: c.khoa, ...l }))));
  const J = (f) => `json_extract(j.value, '$.${f}')`;
  await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO thep_ncc (name, active, ts) SELECT value, 1, ? FROM json_each(?)`).bind(ts, JSON.stringify(ncc)),
    env.DB.prepare(`INSERT INTO thep_ve (ngay, ncc_id, don_id, so_don, so_phieu, bien_so, ghi_chu, nguon, user_id, ts, khoa)
                    SELECT ${J('ngay')}, (SELECT id FROM thep_ncc WHERE name = ${J('ncc')} COLLATE NOCASE), ${J('don_id')}, ${J('so_don')}, ${J('so_phieu')}, ${J('bien_so')}, ${J('ghi_chu')},
                           'excel', ?1, ?2, ${J('khoa')} FROM json_each(?3) j`).bind(user.id, ts, ve),
    env.DB.prepare(`INSERT INTO thep_ve_dong (ve_id, phi_id, bo, cay, kg, kg_tinh)
                    SELECT (SELECT id FROM thep_ve WHERE khoa = ${J('khoa')}), ${J('phi')}, ${J('bo')}, ${J('cay')}, ${J('kg')}, ${J('kg_tinh')} FROM json_each(?) j`).bind(dong),
    auditStmt(env, user, 'tv_nhap', tomTat),
    bump(env),
  ]);
  return json({ ok: true, ...tomTat });
}

/* ---------- XUẤT EXCEL (CSV) ---------- */
export async function tvCsv(env, url, user) {
  const q = await quyenTv(env, user);
  if (!q.xem) throw new HttpError(403, 'Bạn không có quyền xem sổ thép về');
  const today = vnDay();
  const tu = String(url.searchParams.get('tu') || today.slice(0, 4) + '-01-01'), den = String(url.searchParams.get('den') || today);
  if (!ngayThat(tu) || !ngayThat(den) || tu > den) throw bad('Khoảng ngày không hợp lệ');
  const { results } = await env.DB.prepare(
    `SELECT v.ngay, n.name ncc, COALESCE(dn.so_don, v.so_don) so_don, v.so_phieu, v.bien_so, d.phi_id, d.bo, d.cay, d.kg, d.kg_tinh, v.ghi_chu
     FROM thep_ve v JOIN thep_ve_dong d ON d.ve_id = v.id LEFT JOIN thep_ncc n ON n.id = v.ncc_id LEFT JOIN thep_don dn ON dn.id = v.don_id
     WHERE v.voided = 0 AND v.ngay >= ? AND v.ngay <= ? ORDER BY v.ngay, v.id, d.id`).bind(tu, den).all();
  const t = (s) => { const x = String(s == null ? '' : s); return /^[=+\-@\t\r]/.test(x) ? "'" + x : x; };
  const o = (s) => '"' + t(s).replace(/"/g, '""') + '"';
  const lines = [csvRow(['Ngày về', 'Nhà cung cấp', 'Số đơn', 'Số phiếu', 'Biển số', 'Phi', 'Số bó', 'Số cây', 'Kg theo phiếu', 'Kg tự tính', 'Chênh lệch kg', 'Tấn (thống kê)', 'Ghi chú'])];
  for (const r of results) {
    const kg = r.kg ?? r.kg_tinh ?? 0;
    lines.push(csvRow([r.ngay.split('-').reverse().join('/'), o(r.ncc), o(r.so_don), o(r.so_phieu), o(r.bien_so), r.phi_id, r.bo ?? '', r.cay ?? '', r.kg ?? '', r.kg_tinh ?? '',
      r.kg != null && r.kg_tinh != null ? r.kg - r.kg_tinh : '', csvDec(kg / 1000, 3), o(r.ghi_chu)]));
  }
  return new Response(CSV_HEAD + lines.join('\r\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="thep-ve-${tu}-den-${den}.csv"`, 'Cache-Control': 'no-store' } });
}

/* ---------- GIAO QUYỀN (chỉ admin đầu tiên) ---------- */
export async function tvGiaoQuyen(req, env, admin, id) {
  const first = await firstAdminId(env);
  if (admin.id !== first) throw new HttpError(403, 'Chỉ admin đầu tiên mới giao quyền ghi sổ thép về');
  const b = await readJson(req);
  const u = await env.DB.prepare('SELECT id, name, deleted FROM users WHERE id = ?').bind(id).first();
  if (!u || u.deleted) throw new HttpError(404, 'Không tìm thấy người dùng');
  const co = b.co ? 1 : 0;
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET thep_ve = ? WHERE id = ?').bind(co, id),
    auditStmt(env, admin, 'user_thep_ve', { id, name: u.name, co }),
    bump(env),
  ]);
  return json({ ok: true, co });
}
