'use strict';
/* Kho Thép Bãi - giao diện (không cần build). Gọi API /api/* trên cùng domain. */

const $app = document.getElementById('app');
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtInt = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const fmtT = (kg) => (kg / 1000).toFixed(2).replace('.', ',');
// phi có unit='cuon' (D8) đếm theo cuộn, không phải cây; nội bộ vẫn lưu cây, chỉ hiển thị đổi sang cuộn
const isCuon = (p) => { const o = typeof p === 'string' ? (S.boot && S.boot.phiBy[p]) : p; return !!(o && o.unit === 'cuon'); };
const unitLbl = (p) => isCuon(p) ? 'cuộn' : 'cây';
/* Số cây tổng của cả bãi. Thép cuộn không đếm được bằng cây nên số này luôn chỉ là thép cây;
   chỉ nói thêm "chưa gồm cuộn" khi bãi thật có phi cuộn đang dùng, không thì câu đó chỉ gây
   thắc mắc. Trước đây viết "cây nguyên", ngoài bãi dễ hiểu thành cây chưa cắt / bó chưa tách. */
const cayTxt = (n) => fmtInt(n) + ' cây' + (S.boot && S.boot.phiAct && S.boot.phiAct.some(isCuon) ? ' (chưa gồm cuộn)' : '');
// nhập kho: 1 đơn vị người dùng gõ = bao nhiêu cây (D8 gõ theo cuộn, còn lại gõ theo cây)
const uStepOf = (p) => { const o = typeof p === 'string' ? (S.boot && S.boot.phiBy[p]) : p; return o && o.unit === 'cuon' ? o.bo_size : 1; };
const phiOf = (p) => (typeof p === 'string' ? (S.boot && S.boot.phiBy[p]) : p);
const fmtDec = (x) => String(Math.round(x * 100) / 100).replace('.', ',');
// thép cuộn lưu bo_size phần = 1 cuộn (cuộn dở gõ theo %): hiện "3,5 cuộn"
const cuonTxt = (v, po) => `${fmtDec(v / po.bo_size)} cuộn`;
// hiển thị đầy đủ: "2 bó + 15 cây", "15 cây" hoặc "3,5 cuộn"
const fmtCount = (v, p) => {
  const po = phiOf(p);
  if (isCuon(po)) return cuonTxt(v, po);
  if (v < 0) return `−${fmtInt(-v)} cây`; // "−1 bó + 10 cây" dễ đọc nhầm dấu
  if (!po || po.bo_size <= 1 || v < po.bo_size) return `${fmtInt(v)} cây`;
  const c = Math.floor(v / po.bo_size), r = v % po.bo_size;
  return r ? `${fmtInt(c)} bó + ${fmtInt(r)} cây` : `${fmtInt(c)} bó`;
};
const minStockLbl = (p) => qMain(p.min_stock, p);
/* Một cặp "còn bao nhiêu / mức báo động" phải so được bằng mắt. qMain tự rơi về "cây" khi số
   chưa đủ một bó, nên trước đây cảnh báo ra "Còn 40 cây, báo động 1 bó" — đúng lúc cần so sánh
   nhất thì hai số lại khác đơn vị (tồn dưới mức báo động thì gần như luôn dưới một bó).
   Hàm này ép cả hai về cùng một đơn vị; các kiểu hiện Cây/Tấn vốn đã cùng đơn vị nên giữ nguyên. */
const qPair = (a, z, p) => {
  const po = phiOf(p), m = S.unit;
  const sz = po && !isCuon(po) && po.bo_size > 1 ? po.bo_size : 0;
  if (sz && (m === 'all' || m === 'bo') && (a < sz || z < sz)) return [qCay(a, po), qCay(z, po)];
  return [qMain(a, po), qMain(z, po)];
};

/* ===== Kiểu hiện số lượng =====
   Mặc định hiện cả cây + bó + tấn để hình dung nhanh; người dùng đổi ở Thêm → Cách hiện số lượng.
   Lưu riêng từng máy nên mỗi người chọn kiểu hợp với mình, không ảnh hưởng người khác. */
const UNIT_OPTS = [['all', 'Tất cả'], ['cay', 'Cây'], ['bo', 'Bó'], ['kg', 'Tấn']];
const qCay = (v, po) => (isCuon(po) ? cuonTxt(v, po) : `${fmtInt(v)} cây`);
// bó chỉ có nghĩa với thép cây; thép cuộn luôn trả về dạng cuộn.
// Phần lẻ luôn kèm chữ "cây": "31 bó + 10" không nói 10 cái gì, kể cả khi đứng sau số cây tổng.
const qBo = (v, po) => {
  if (isCuon(po)) return cuonTxt(v, po);
  if (!po || po.bo_size <= 1 || v < po.bo_size) return `${fmtInt(v)} cây`;
  const c = Math.floor(v / po.bo_size), r = v % po.bo_size;
  return r ? `${fmtInt(c)} bó + ${fmtInt(r)} cây` : `${fmtInt(c)} bó`;
};
const qKg = (v, po) => `${fmtT(v * po.kg_per_cay)} tấn`;
// Số âm chỉ xuất hiện khi "đã dùng" ra số âm (dấu hiệu sai số liệu). Khi đó hiện GỌN một đơn vị
// kèm dấu trừ: nếu tách "−80 cây (2 bó) · 1,48 tấn" thì dấu trừ trông như chỉ áp cho phần đầu.
const qNeg = (v, po) => {
  const m = S.unit;
  if (m === 'kg') return '−' + qKg(-v, po);
  if (m === 'bo') return '−' + qBo(-v, po);
  return '−' + qCay(-v, po);
};
/* Chọn hàm nào: theo VIỆC người dùng đang làm, không theo số dòng của ô hiển thị.
   - qMain/qSub — ĐANG ĐỌC TỒN ("còn bao nhiêu", "đã dùng bao nhiêu"): neo theo BÓ,
     vì ngoài bãi người ta nhìn thấy bó. Dùng ở Tồn bãi, Thống kê, cảnh báo Tổng quan,
     mức báo động, dòng tham chiếu khi đếm.
   - fmtQ — ĐANG KIỂM LẠI SỐ VỪA GÕ (nhập kho, chuyển khu): neo theo CÂY, tức đúng con số
     người dùng vừa bấm, rồi mới tới bó trong ngoặc và tấn. Đổi thứ tự ở đây sẽ làm
     người nhập không đối chiếu được với cái mình vừa gõ.
   - fmtQs — dòng có NHIỀU số (phép tính ở Duyệt, bảng so sánh, nhật ký, danh sách phiếu):
     một đơn vị duy nhất cho khỏi tràn và khỏi rối. */
// fmtQ: dạng đầy đủ, dùng ở chỗ mỗi dòng chỉ có MỘT số lượng.
const fmtQ = (v, p) => {
  const po = phiOf(p);
  if (!po) return fmtInt(v);
  if (v < 0) return qNeg(v, po);
  const m = S.unit;
  if (m === 'cay') return qCay(v, po);
  if (m === 'bo') return qBo(v, po);
  if (m === 'kg') return qKg(v, po);
  const cay = qCay(v, po), bo = qBo(v, po);
  // "1.250 cây (31 bó + 10 cây) · 23,10 tấn"; bỏ ngoặc khi phần bó trùng y hệt phần cây
  return cay + (bo === cay ? '' : ` (${bo})`) + ' · ' + qKg(v, po);
};
// fmtQs: dạng gọn một đơn vị, dùng ở chỗ một dòng có NHIỀU số (phép tính, bảng so sánh).
// Chế độ "Tất cả" ở đây lấy cây cho khỏi tràn dòng.
const fmtQs = (v, p) => {
  const po = phiOf(p);
  if (!po) return fmtInt(v);
  if (v < 0) return qNeg(v, po);
  const m = S.unit;
  if (m === 'bo') return qBo(v, po);
  if (m === 'kg') return qKg(v, po);
  return qCay(v, po);
};
// Người ở bãi hình dung theo BÓ trước, nên dòng chính là "25 bó + 39 cây";
// dòng phụ mới là số cây tổng và số tấn. Phi cuộn không có "cây" nên chỉ ghi tấn.
const qtySub = (v, p) => {
  const po = phiOf(p), kg = po ? v * po.kg_per_cay : 0;
  const cay = isCuon(po) ? '' : `${fmtInt(v)} cây`;
  return (cay && cay !== fmtCount(v, po) ? cay + ' · ' : '') + fmtT(kg) + ' tấn';
};
// Khối 2 dòng (Tồn bãi, Thống kê) và câu cảnh báo: dòng chính ưu tiên bó cho dễ hình dung.
const qMain = (v, p) => {
  const po = phiOf(p), m = S.unit;
  if (v < 0) return qNeg(v, po);
  if (m === 'cay') return qCay(v, po);
  if (m === 'kg') return qKg(v, po);
  return fmtCount(v, po); // 'all' và 'bo' đều lấy bó + cây lẻ
};
// Dòng phụ chỉ xuất hiện ở chế độ "Tất cả". Số âm đã nói đủ ở dòng chính nên bỏ dòng phụ.
const qSub = (v, p) => (S.unit === 'all' && v >= 0 ? qtySub(v, p) : '');
// Phép tính "tồn cũ + nhập − đếm = dùng": dấu cộng của "31 bó + 10" lẫn với dấu cộng của phép
// tính, nên chỗ này chỉ dùng đơn vị cộng trừ được là cây hoặc tấn, không tách bó.
const fmtQe = (v, p) => {
  const po = phiOf(p);
  if (!po) return fmtInt(v);
  const f = S.unit === 'kg' ? qKg : qCay;
  return v < 0 ? '−' + f(-v, po) : f(v, po);
};
const two = (n) => String(n).padStart(2, '0');
// cắt tên dài cho nhãn nút khỏi tràn
const cut = (s, n) => { const t = String(s == null ? '' : s); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
const hhmm = (ts) => { const d = new Date(ts); return two(d.getHours()) + ':' + two(d.getMinutes()); };
const dmy = (ts) => { const d = new Date(ts); return two(d.getDate()) + '/' + two(d.getMonth() + 1) + ' ' + hhmm(ts); };
const ROLE = { admin: 'Admin', thukho: 'Thủ kho', nguoidem: 'Người đếm' };
const ROWH = 46; // chiều cao một dòng bảng đếm, phải khớp .mxrow/.mxh/.oc trong style.css

const IC = {
  back: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  chev: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
  home: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>',
  count: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9zM9 14l2 2 4-4"/></svg>',
  inn: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 11l5 5 5-5M5 20h14"/></svg>',
  shield: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6l8-3zM8.5 12l2.5 2.5 4.5-5"/></svg>',
  more: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/></svg>',
};

/* ===================== TRẠNG THÁI ===================== */
const S = {
  me: null, boot: null, screen: 'login', khu: null,
  bkFile: null, // tệp bản sao đã chọn và đọc được, chờ xác nhận nạp lại
  khuMo: {}, // thẻ khu nào ở Tổng quan đang mở chi tiết
  draft: { cells: {} }, sel: null, bo: '', le: '', field: 'bo', rep: { bo: false, le: false }, zoomK: null,
  toast: '', toastErr: false, form: {}, err: '',
  review: null, showNormal: false, audit: null, logFilter: 'all', auditF: { ngay: '', q: '' }, auditMore: false, users: null, pinShown: null,
  usage: null, usageDays: 30, statScope: 'all', expand: {},
  cc: { days: 7, data: null, mo: {} },
  // chú thích màu của bảng đếm: mở sẵn cho người mới, đóng một lần rồi thì nhớ luôn
  legendSeen: (() => { try { return !!localStorage.getItem('kt:legendSeen'); } catch (e) { return false; } })(),
  // dir/reason chỉ dùng cho chế độ điều chỉnh tồn; mặc định 'giam' vì đó là chiều hay phải sửa nhất
  nhap: { mode: 'nhap', phi: null, qty: 0, khu: null, from: null, to: null, lines: [], done: null, dir: 'giam', reason: null }, scrollSel: null,
  // Vay mượn ngoài bãi: form đang gõ (doitac/kind/phi/qty) + S.loans nạp riêng khi vào màn (như S.users)
  loan: { doitac: null, kind: 'vay', phi: null, qty: 0, done: null }, loans: null, doitacEdit: null, loanDt: null, loanDetail: null,
  hist: { date: '', data: null }, bc: { from: '', to: '', data: null }, legend: false, draftWarn: null, cmp: null, busy: false,
  stale: null, subs: {}, // subs: khu_id -> null (đang tải) | mảng lần báo
  kuEdit: null, kuPick: [], // đang gán người phụ trách cho khu nào, và danh sách đang chọn

  // kiểu hiện số lượng: 'all' (cây + bó + tấn) | 'cay' | 'bo' | 'kg'
  unit: (() => { try { return localStorage.getItem('kt:unit') || 'all'; } catch (e) { return 'all'; } })(),
  ask: null, loadErr: {}, netBad: false, netOk: 0, busyMsg: '',
};
const fmtDay = (d) => String(d || '').split('-').reverse().join('/');

/* ===================== API ===================== */
async function api(method, path, body) {
  let r;
  try {
    r = await fetch('/api' + path, {
      method, credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) { const er = new Error('Không có kết nối mạng'); er.net = true; er.retry = true; throw er; }
  let d = {};
  try { d = await r.json(); } catch (e) { /* không phải JSON */ }
  if (!r.ok) {
    // 429 không có JSON là Cloudflare chặn (thường do hết hạn mức miễn phí trong ngày, tự phục hồi 7:00 sáng)
    const quota = r.status === 429 && !d.error;
    const er = new Error(d.error || (quota ? 'Hệ thống tạm quá tải hoặc hết hạn mức trong ngày, sẽ tự hoạt động lại (muộn nhất 7:00 sáng)' : 'Lỗi ' + r.status));
    er.status = r.status; er.code = d.code; er.retry = quota || r.status >= 500;
    // server nhận ra máy đang chạy bản app cũ: bật dải "có bản mới" ngay, khỏi đợi lần hỏi định kỳ
    if (d.code === 'old_app') S.newVer = true;
    if (r.status === 401 && S.me) { S.me = null; S.boot = null; S.screen = 'login'; S.err = 'Phiên đăng nhập đã hết hạn, hãy đăng nhập lại'; forgetBoot(); render(); }
    throw er;
  }
  return d;
}

// Một dải duy nhất cho mọi trạng thái kết nối: người dùng luôn biết số đang xem có mới hay không.
function netBar() {
  const top = 'style="margin-top:calc(8px + env(safe-area-inset-top))"';
  const at = S.netOk ? hhmm(S.netOk) : '';
  if (S.stale) return `<div class="toast err" data-net="1" role="status" ${top}>Mất kết nối: đang xem số liệu lưu lúc ${dmy(S.stale)}. Tự cập nhật khi có mạng.</div>`;
  if (!navigator.onLine) return `<div class="toast err" data-net="1" role="status" ${top}>Máy đang mất mạng${at ? ', đang xem số lúc ' + at : ''}. Tự cập nhật khi có mạng lại.</div>`;
  if (S.netBad) return `<div class="toast err" data-net="1" role="status" ${top}>Chưa cập nhật được số mới${at ? ', đang xem số lúc ' + at : ''}. Đang thử lại.</div>`;
  return '';
}
/* ===== Bản app mới =====
   App cài trên màn hình chính giữ trang chạy ngầm cả ngày: code đã nạp từ trước lần deploy cứ thế
   chạy tiếp, vì vòng tự làm mới chỉ tải lại SỐ LIỆU chứ không tải lại GIAO DIỆN. Máy đó thiếu nút,
   thiếu màn hình mới, và gửi lên kiểu cũ thì server mới từ chối — người dùng tưởng app hỏng.
   Nên hỏi định kỳ dấu nhận dạng (ETag) của /app.js: nội dung file đổi là ETag đổi. Hỏi HEAD tới
   file tĩnh không chạy Worker nên không tốn hạn mức. Không tự tải lại (đang gõ dở thì mất), chỉ
   bày dải để người dùng bấm khi tiện. */
let appTag = null, lastVerCheck = 0;
async function checkVer(cachMs) {
  if (Date.now() - lastVerCheck < (cachMs == null ? 5 * 60e3 : cachMs)) return;
  lastVerCheck = Date.now();
  try {
    const r = await fetch('/app.js', { method: 'HEAD', cache: 'no-store' });
    const t = r && r.ok && r.headers ? r.headers.get('ETag') || r.headers.get('Last-Modified') : null;
    if (!t) return;
    if (!appTag) appTag = t;
    else if (t !== appTag && !S.newVer) { S.newVer = true; render(); }
  } catch (e) { /* mất mạng: lần sau hỏi lại */ }
}
const verBar = () => (S.newVer
  ? `<button class="toast" data-a="reloadapp" style="margin-top:calc(8px + env(safe-area-inset-top));display:block;width:calc(100% - 24px);text-align:left;border:0;font:inherit;font-weight:700">Có bản mới của app. Bấm vào đây để cập nhật.</button>`
  : '');
const busyHtml = () => (S.busy ? `<div class="busy" role="status" aria-live="polite" aria-busy="true"><span>${esc(S.busyMsg || 'Đang lưu...')}</span></div>` : '');
// Màn chờ dữ liệu: tải lỗi thì nói rõ và cho bấm thử lại, không treo mãi ở "Đang tải..."
function panelWait(screen) {
  const e = S.loadErr[screen];
  if (!e) return '<div class="pad muted">Đang tải...</div>';
  return `<div class="pad col gap8"><div class="card bad col gap6"><b style="font-size:17px">Không tải được dữ liệu</b><span class="sm">${esc(e)}</span></div><button class="btn full" data-a="retry" data-s="${esc(screen)}">THỬ LẠI</button></div>`;
}

function indexBoot(b) {
  b.phiBy = {}; b.phi.forEach((p) => (b.phiBy[p.id] = p));
  b.khuBy = {}; b.khu.forEach((k) => (b.khuBy[k.id] = k));
  b.khuAct = b.khu.filter((k) => k.active);
  b.kp = {}; b.khuPhi.forEach((r) => (b.kp[r.khu_id + '|' + r.phi_id] = r));
  // b.khuPhi giờ chỉ còn keep_streak có nghĩa (xem khu_phi trong schema.sql)
  // số đếm hiệu lực: lần báo gần nhất kể từ lần chốt trước. Khu báo hôm qua mà hôm nay chưa báo
  // thì vẫn phải lấy số hôm qua, không được quay về tồn chuẩn cũ.
  b.em = {}; (b.eff || []).forEach((c) => (b.em[c.khu_id + '|' + c.phi_id] = c));
  b.bm = {}; b.baseline.forEach((r) => (b.bm[r.khu_id + '|' + r.phi_id] = r.v));
  b.rm = {}; b.reports.forEach((r) => (b.rm[r.khu_id] = r));
  /* Khung giờ đếm (settings.report_slots_per_day > 1). Khung nào khu đã đếm thì server tính sẵn
     theo giờ Việt Nam. "Bây giờ là mấy giờ" cũng lấy theo đồng hồ server (độ lệch đo lúc tải),
     không theo đồng hồ máy: máy để sai giờ thì mỗi máy sẽ nhắc một kiểu. Bản cache cũ không có
     b.slot thì coi như 1 lần/ngày, tức không nhắc gì. */
  const sl = b.slot || {};
  b.nSlot = sl.n > 1 ? sl.n : 1;
  b.slotDefs = sl.defs || [];
  b.slotDone = {};
  Object.keys(sl.done || {}).forEach((k) => (b.slotDone[k] = new Set(sl.done[k])));
  b.skew = typeof sl.now === 'number' ? sl.now - Date.now() : 0;
  // nhập/chuyển kể từ lần chốt trước theo khu × phi, và cộng theo phi
  b.mv = {}; b.innPhi = {}; b.xuatPhi = {};
  (b.innKhu || []).forEach((r) => {
    const key = r.khu_id + '|' + r.phi_id;
    b.mv[key] = (b.mv[key] || 0) + r.q;
    b.innPhi[r.phi_id] = (b.innPhi[r.phi_id] || 0) + r.q;
    // xuatPhi giữ số DƯƠNG: lượng đã rời bãi có phiếu, dùng để tách khỏi vế "nhập"
    if (r.kind === 'xuat') b.xuatPhi[r.phi_id] = (b.xuatPhi[r.phi_id] || 0) - r.q;
  });
  // phần nhập/chuyển xảy ra SAU lần đếm hiệu lực: chỉ phần này mới chưa nằm trong số đếm
  b.mvn = {}; (b.mvNew || []).forEach((r) => (b.mvn[r.khu_id + '|' + r.phi_id] = r.q));
  b.rate = {}; b.rateDays = {};
  (b.rates || []).forEach((r) => { b.rate[r.phi_id] = r.per_day; b.rateDays[r.phi_id] = r.days || 0; });
  // phi admin đã tắt: không hiện trong bảng đếm / nhập kho nữa, nhưng vẫn tra cứu được số liệu cũ qua phiBy
  b.phiAct = b.phi.filter((p) => p.active !== 0);
  // ku[khu] = mảng user_id phụ trách; khu không có trong ku = chưa phân công, ai cũng đếm được
  b.ku = {}; b.kuTen = {};
  (b.khuUser || []).forEach((r) => {
    (b.ku[r.khu_id] = b.ku[r.khu_id] || []).push(r.user_id);
    if (r.name) (b.kuTen[r.khu_id] = b.kuTen[r.khu_id] || []).push(r.name);
  });
  // ai là chủ hệ thống: bootstrap gửi sẵn nên mọi màn đều biết, không phải chờ nạp màn Người dùng
  if (b.uFirst !== undefined) S.uFirst = b.uFirst;
}
async function loadBoot() {
  const b = await api('GET', '/bootstrap');
  try { localStorage.setItem('kt:boot', JSON.stringify({ at: Date.now(), b })); } catch (e) { /* đầy bộ nhớ */ }
  indexBoot(b);
  S.boot = b; S.me = b.user; S.stale = null;
  S.netOk = Date.now(); S.netBad = false;
}
// Mất mạng hoặc hết hạn mức: vẫn mở được app với số liệu lần tải gần nhất (chỉ xem)
function useCachedBoot() {
  let c = null;
  try { c = JSON.parse(localStorage.getItem('kt:boot') || 'null'); } catch (e) { c = null; }
  if (!c || !c.b || !c.b.user) return false;
  indexBoot(c.b);
  /* Độ lệch giờ so với server phải đo lúc LƯU bản này, không phải bây giờ: indexBoot vừa lấy giờ
     server của lúc lưu trừ giờ máy hiện tại, tức "bây giờ" bị đứng ở lúc lưu — mất mạng hai tiếng
     là nhắc khung giờ sai hai tiếng. */
  if (c.b.slot && typeof c.b.slot.now === 'number' && c.at) c.b.skew = c.b.slot.now - c.at;
  S.boot = c.b; S.me = c.b.user; S.stale = c.at;
  return true;
}
function forgetBoot() { try { localStorage.removeItem('kt:boot'); } catch (e) { /* bỏ qua */ } }
const isAdmin = () => S.me && S.me.role === 'admin';
const canIn = () => S.me && (S.me.role === 'admin' || S.me.role === 'thukho');
// Khu chưa phân công ai thì mọi người đếm được; đã phân công thì chỉ người được gán và admin
const canCount = (kid) => {
  const a = S.boot && S.boot.ku ? S.boot.ku[kid] : null;
  return !a || !a.length || isAdmin() || a.includes(S.me.id);
};
const myKhu = () => S.boot.khuAct.filter((k) => canCount(k.id));

function say(msg, err) {
  S.toast = msg; S.toastErr = !!err;
  clearTimeout(say.t);
  say.t = setTimeout(hideToast, 5000);
}
// Hết 5 giây thì bỏ đúng thẻ thông báo, KHÔNG vẽ lại cả màn hình:
// vẽ lại sẽ xoá sạch những gì người dùng đang gõ trong các ô cấu hình.
function hideToast() {
  S.toast = ''; S.toastErr = false;
  const t = document.querySelectorAll('[data-toast]');
  if (t.length) t.forEach((e) => e.remove()); else render();
}
// giá trị ô nhập: ưu tiên những gì người dùng đang gõ (S.form), chưa gõ thì lấy số hiện tại
const fv = (k, dflt) => (S.form[k] === undefined ? String(dflt == null ? '' : dflt) : S.form[k]);

/* Hộp xác nhận trong app: thay confirm() của hệ điều hành để chữ to, nút to,
   cùng một ngôn ngữ giao diện với phần còn lại. Trả về Promise(true/false). */
function ask(msg, okLbl, danger) {
  return new Promise((resolve) => {
    if (S.ask) S.ask.resolve(false); // hộp cũ chưa trả lời thì coi như huỷ
    S.ask = { msg, ok: okLbl || 'Đồng ý', danger: !!danger, resolve };
    render();
  });
}
function askHtml() {
  const a = S.ask;
  if (!a) return '';
  return `<div class="modal" role="dialog" aria-modal="true" aria-label="Xác nhận"><div class="box col gap8">
    <div style="font-size:18px;line-height:1.45;white-space:pre-line">${esc(a.msg)}</div>
    <button class="btn ${a.danger ? 'bad' : 'pri'} full" data-a="askyes">${esc(a.ok)}</button>
    <button class="btn full" data-a="askno">Để sau</button>
  </div></div>`;
}

/* ===================== TÍNH TOÁN ===================== */
/* Ngưỡng cảnh báo lấy từ server (/bootstrap trả boot.limits) chứ không chép hằng số sang đây:
   trước đây Tổng quan báo "đã dùng âm" ngay khi lệch 1 cây còn Duyệt chỉ báo từ 100 kg, nên thẻ đỏ
   dẫn sang Duyệt rồi không có gì để xử lý. Vẫn để số dự phòng cho bản cache cũ và cho bộ test. */
const LIM_DEF = { negKg: 100, highKg: 500, rateDays: 5 };
const LIM = (k, dflt) => {
  const v = S.boot && S.boot.limits ? S.boot.limits[k] : undefined;
  return typeof v === 'number' ? v : (dflt === undefined ? LIM_DEF[k] : dflt);
};
/* Từ bản 1.3 mọi khu luôn hỏi đủ phi D6..D36, không còn khái niệm "phi có trong khu": phi khu
   không có thì người đếm ĐỂ TRỐNG và hệ thống hiểu là 0. Cả cơ chế tự ẩn phi khỏi khu sau N ngày
   đếm 0 lẫn luồng "chạm ô dấu · để thêm phi" đều bỏ, nên isPresent không còn lý do tồn tại. */
// số làm mốc khi đếm: lần đếm ĐÃ DUYỆT gần nhất của ô đó, chưa có thì lấy tồn chuẩn
const refOf = (k, p) => { const c = S.boot.em[k + '|' + p]; return c ? c.v : S.boot.bm[k + '|' + p]; };
// nhập/chuyển vào (+) hoặc ra (−) SAU lần đếm gần nhất, tức phần chưa có trong số mốc
const movedOf = (k, p) => S.boot.mvn[k + '|' + p] || 0;
// ngày của lần đếm làm mốc, để nói rõ "số hôm qua" hay "số ngày 28/10"
const refDay = (k, p) => { const c = S.boot.em[k + '|' + p]; return c ? c.day : null; };
// số dự kiến = tồn chuẩn hôm qua + nhập/chuyển; dùng để so lệch khi đếm
const expOf = (k, p) => { const r = refOf(k, p), m = movedOf(k, p); return r === undefined ? (m ? m : undefined) : r + m; };
// chỉ cho "giữ nguyên" khi có số hôm qua, khu không có thép nhập/chuyển, và chưa giữ nguyên quá số ngày cho phép
function keepBlock(k, p) {
  if (refOf(k, p) === undefined) return 'Phi này chưa có số hôm qua, hãy nhập số đếm.';
  if (movedOf(k, p)) return 'Phi này có thay đổi tồn (nhập, chuyển khu hoặc điều chỉnh) từ lần chốt trước, hãy đếm thực tế.';
  if ((S.boot.kp[k + '|' + p] || {}).keep_streak >= S.boot.settings.max_keep_streak) return 'Phi này giữ nguyên quá nhiều ngày, hãy đếm lại.';
  return '';
}
function valOf(k, p, useDraft) {
  const b = S.boot;
  if (useDraft && k === S.khu && S.draft.cells[p]) return S.draft.cells[p].v;
  const c = b.em[k + '|' + p];
  if (c) return c.v;
  const r = b.bm[k + '|' + p];
  return r === undefined ? 0 : r;
}
/* Thép ĐANG CÓ ở một ô = số đếm đã duyệt gần nhất + phần nhập/chuyển ĐÃ DUYỆT sau lần đếm đó.
   Phải cộng phần sau, nếu không thì một phiếu đã duyệt lại KHÔNG vào tồn — trái đúng quy tắc
   trung tâm của bản này ("chưa duyệt thì không vào tồn", tức đã duyệt là phải vào). Trước đây
   Tổng quan chỉ lấy số đếm nên một khu vừa nhận 180 cây đã duyệt mà chưa kịp đếm vẫn hiện số cũ,
   trong khi màn Đếm lại ghi dự kiến đã gồm 180 đó: hai màn hình nói hai số cho cùng một khu.
   movedOf chỉ gồm phiếu duyệt SAU lần đếm (xem mvNew ở server), nên không cộng trùng phần khu
   đã đếm thấy tận mắt. */
const tonOf = (k, p) => valOf(k, p) + movedOf(k, p);

function totals() {
  const b = S.boot;
  const T = { cay: 0, kg: 0, perPhi: {}, perKhu: {}, used: {}, usedKg: null, inKg: 0, hidKg: 0 };
  b.phi.forEach((p) => (T.perPhi[p.id] = 0));
  b.khuAct.forEach((k) => (T.perKhu[k.id] = { cay: 0, kg: 0 }));
  // cộng cả khu đang ẩn (nếu còn thép) để tổng khớp với màn Duyệt
  for (const k of b.khu) {
    for (const p of b.phi) {
      const v = tonOf(k.id, p.id);
      T.perPhi[p.id] += v; if (!isCuon(p)) T.cay += v; T.kg += v * p.kg_per_cay;
      if (T.perKhu[k.id]) { if (!isCuon(p)) T.perKhu[k.id].cay += v; T.perKhu[k.id].kg += v * p.kg_per_cay; }
      else T.hidKg += v * p.kg_per_cay; // khu đã ẩn mà còn thép: vẫn vào tổng bãi, nói rõ ở Tổng quan
    }
  }
  /* "Nhập hôm nay" chỉ tính THÉP VỀ: chuyển khu chỉ dời chỗ, còn điều chỉnh là sửa sổ chứ không
     có xe thép nào vào bãi. Gộp điều chỉnh vào đây là con số "nhập hôm nay" ở Tổng quan nói có
     thép về trong khi không có, và nó lệch luôn với cột Nhập của báo cáo kỳ (đã trừ dc ở server). */
  /* Và chỉ tính phiếu ĐÃ DUYỆT HÔM NAY: b.receipts còn gồm phiếu chờ duyệt (cả của ngày trước), mà
     chưa duyệt thì chưa vào tồn. Phiếu tính theo NGÀY DUYỆT, đúng như cột Nhập của báo cáo kỳ. */
  b.receipts.forEach((r) => { const p = b.phiBy[r.phi_id]; if (p && r.duyet_day === b.today && !r.voided && !['chuyen', 'dc', 'xuat', 'vay'].includes(r.kind)) T.inKg += r.qty * p.kg_per_cay; });
  // nhập kể từ lần chốt gần nhất (gồm ngày quên chốt), giống cách server tính; chuyển khu tự triệt tiêu
  const inn = b.innPhi;
  if (b.lastClosed) {
    T.usedKg = 0;
    for (const p of b.phi) {
      let old = 0;
      for (const k of b.khu) old += b.bm[k.id + '|' + p.id] || 0;
      /* Ở đây CỐ Ý dùng valOf chứ không phải tonOf: phép tính là "tồn cũ + nhập − đếm", mà
         phần nhập đã nằm ở inn rồi. Lấy tonOf thì lượng nhập bị cộng hai lần và "đã dùng" ra sai.
         Server tính y hệt (xem rows trong computeReview), hai bên phải khớp nhau. */
      let cnt = 0;
      for (const k of b.khu) cnt += valOf(k.id, p.id);
      /* Cộng lại phần xuất vì inn đã trừ nó sẵn (phiếu xuất lưu số âm): thép đi theo phiếu xuất
         là ĐÃ DÙNG thật, để nguyên trong vế nhập thì nó tự triệt tiêu với phần khu đếm hụt và
         "đã dùng" tụt xuống chỉ còn phần không có phiếu. Server tính y hệt (xem used trong computeReview). */
      const u = old + ((inn[p.id] || 0) + (b.xuatPhi[p.id] || 0)) - cnt;
      T.used[p.id] = u; T.usedKg += u * p.kg_per_cay;
    }
  }
  return T;
}
/* Một ô của khu đang CHỜ DUYỆT nếu lần báo mới nhất chưa được duyệt. Mốc duyet_ts giữ ts của
   lần báo đã duyệt, nên "đã duyệt" là phép so BẰNG — xem chú thích counts trong schema.sql. */
const khuWaiting = (id) => S.boot.counts.some((c) => c.khu_id === id && !(c.duyet_ts != null && c.duyet_ts === c.ts));
/* ===== Khung giờ đếm (mỗi khu đếm nhiều lần/ngày) =====
   Cùng luật với server (slotOf/slotsDue): khung ĐÃ KẾT THÚC mà khu chưa đếm là thiếu, và lần đếm
   khung sau không bù cho khung trước. Màn Duyệt lấy kết quả thẳng từ server; mấy hàm này chỉ để
   Tổng quan và màn chọn khu nhắc đúng lúc mà không phải hỏi server mỗi phút. */
const vnHourNow = () => ((Date.now() + (S.boot.skew || 0) + 7 * 3600e3) % 864e5) / 3600e3;
// khung đang diễn ra; trước giờ làm tính khung đầu, sau giờ làm tính khung cuối (như server)
const slotNow = () => {
  const b = S.boot;
  if (b.nSlot <= 1 || !b.slotDefs.length) return null;
  const h = vnHourNow();
  return b.slotDefs.find((d) => h < d.to) || b.slotDefs[b.slotDefs.length - 1];
};
// khung của một mốc giờ (ms) trong ngày, cùng cách chia với slotNow
const slotIdxOf = (ts) => {
  const defs = S.boot.slotDefs, h = ((ts + 7 * 3600e3) % 864e5) / 3600e3;
  const d = defs.find((x) => h < x.to);
  return d ? d.i : defs.length - 1;
};
/* Khu có bị đòi đếm không: giống server, khu chưa báo lần nào kể từ lần chốt trước thì thẻ
   "chưa báo" đã nói, còn khu trống trơn (không tồn, không phiếu, không đếm ra gì) thì không bị đòi. */
/* Khu có gì để đếm không: còn tồn chuẩn, có phiếu đã duyệt, hoặc đã đếm ra số khác 0 — cùng điều
   kiện server dùng để đòi khu báo (khu_missing chỉ tính khu có items). Khu trống trơn thì không ai
   phải ra đếm 13 số 0, nên cũng không nhắc. Ngày đầu tiên (chưa có tồn chuẩn nào) thì khu nào cũng
   phải báo để lập sổ, nên khi đó coi mọi khu là có việc. */
function khuCoViec(kid) {
  const b = S.boot;
  if (!b.lastClosed) return true;
  return b.phi.some((p) => (b.bm[kid + '|' + p.id] || 0) !== 0 || (b.mv[kid + '|' + p.id] || 0) !== 0)
    || (b.counts || []).some((c) => c.khu_id === kid && c.v !== 0)
    || (b.eff || []).some((c) => c.khu_id === kid && c.v !== 0);
}
function slotNeed(kid) {
  const b = S.boot;
  const daBao = !!b.rm[kid] || (b.eff || []).some((c) => c.khu_id === kid);
  if (!daBao) return false;
  return b.phi.some((p) => (b.bm[kid + '|' + p.id] || 0) !== 0 || (b.mv[kid + '|' + p.id] || 0) !== 0)
    || (b.counts || []).some((c) => c.khu_id === kid && c.v !== 0)
    || (b.eff || []).some((c) => c.khu_id === kid && c.v !== 0);
}
// khung đã kết thúc mà khu chưa đếm. Ngày đã chốt thì không nhắc: không còn gửi số được nữa.
function slotMissing(kid) {
  const b = S.boot;
  if (b.nSlot <= 1 || b.closed || !slotNeed(kid)) return [];
  const h = vnHourNow(), done = b.slotDone[kid] || new Set();
  return b.slotDefs.filter((d) => d.to <= h && !done.has(d.i));
}
const slotTxt = (defs) => defs.map((d) => d.label).join(', ');
/* Tên khung NGẮN cho câu nhắc ("buổi sáng", "lần 2") — giờ của khung đã có ở bảng ✓/✗ và ở Cài đặt,
   nhắc lại trong mọi câu chỉ làm câu dài. */
const slotTen = (d, n) => (n === 2 ? (d.i === 0 ? 'buổi sáng' : 'buổi chiều') : 'lần ' + (d.i + 1));
const slotTenNgan = (ds) => ds.map((d) => slotTen(d, S.boot.nSlot)).join(', ');
/* Mỗi khung MỘT DÒNG ngắn: dấu, tên, giờ khung, và bên phải là giờ đếm thật / thiếu / đang trong giờ.
     ✓ Sáng   6h–12h30    09:15
     ✗ Chiều  12h30–19h   thiếu
   Đọc là hiểu, không cần câu giải thích. */
function slotBang(defs, done, missing, gio) {
  if (!defs || defs.length < 2) return '';
  const h = vnHourNow(), n = defs.length;
  return `<div class="col" style="gap:2px;margin:2px 0">${defs.map((d) => {
    const ok = done.includes(d.i), thieu = missing.includes(d.i);
    const mau = ok ? 'var(--ok)' : thieu ? 'var(--bad)' : 'var(--mut)';
    const phai = ok ? (gio && gio[d.i] ? hhmm(gio[d.i]) : 'đã đếm') : thieu ? 'thiếu' : h >= d.from && h < d.to ? 'đang trong giờ' : 'chưa tới giờ';
    const ten = slotTen(d, n);
    return `<div class="row sm" style="justify-content:space-between;gap:8px"><span><b style="color:${mau};display:inline-block;width:18px">${ok ? '✓' : thieu ? '✗' : '·'}</b><b>${ten.replace('buổi ', '').charAt(0).toUpperCase() + ten.replace('buổi ', '').slice(1)}</b> <span class="muted">${fmtGio(d.from)}–${fmtGio(d.to)}</span></span><span style="color:${mau};white-space:nowrap${thieu ? ';font-weight:700' : ''}">${phai}</span></div>`;
  }).join('')}</div>`;
}
/* Báo cáo chưa duyệt lúc tự chốt sổ được CHUYỂN sang hôm nay, giữ nguyên giờ đếm (carryStmts ở server).
   Nó vẫn nằm trong khu_report hôm nay, nên phải nhận ra để không nói "đã báo hôm nay". */
const vnDayOf = (ms) => new Date(ms + 7 * 3600e3).toISOString().slice(0, 10);
const tuHomQua = (r) => !!(r && r.ts && vnDayOf(r.ts) !== S.boot.today);
const daBaoHomNay = (kid) => { const r = S.boot.rm[kid]; return !!r && !tuHomQua(r); };
function khuStatus(k) {
  const r = S.boot.rm[k.id];
  if (!r) return { cls: 'idle', label: 'Chưa báo', who: 'Chưa có ai báo' };
  const who = r.uname + ' · ' + (tuHomQua(r) ? 'báo ngày ' + fmtDay(vnDayOf(r.ts)).slice(0, 5) + ' ' : '') + hhmm(r.ts);
  /* Ngày hôm nay chỉ bị khoá khi admin đặt lại số liệu: số chưa duyệt lúc đó không vào tồn nữa. */
  if (S.boot.closed && khuWaiting(k.id)) return { cls: 'warn', label: 'Không duyệt', who: who + ' · ngày đã khoá, số này không vào tồn' };
  if (r.conflict && !r.resolved) return { cls: 'warn', label: 'Cần xem', who: '2 người báo số khác nhau' };
  if (r.recount) return { cls: 'warn', label: 'Đếm lại', who: 'Admin yêu cầu đếm lại' };
  // thiếu khung đếm không được mang nhãn xanh "Đã duyệt" như đã xong việc trong ngày
  const thieu = slotMissing(k.id);
  if (thieu.length) return { cls: 'warn', label: 'Thiếu lần đếm', who: 'Thiếu ' + slotTenNgan(thieu) + (khuWaiting(k.id) ? ' · có báo cáo chờ duyệt' : '') };
  /* Báo rồi mà chưa duyệt thì tồn CHƯA đổi, nên không được hiện "Đã báo" màu xanh như đã xong:
     người đếm phải thấy báo cáo của mình đang chờ, không thì tưởng hệ thống làm mất số. */
  if (khuWaiting(k.id)) return { cls: 'warn', label: 'Chờ duyệt', who: who + ' · chờ admin duyệt' };
  return { cls: 'ok', label: 'Đã duyệt', who };
}
const reportedCount = () => S.boot.khuAct.filter((k) => daBaoHomNay(k.id)).length;

/* ===================== NHÁP & GỬI BÁO CÁO ===================== */
/* Nháp tách theo NGƯỜI ĐĂNG NHẬP, không chỉ theo ngày + khu. Nhiều người dùng chung một điện thoại
   là chuyện thường ngoài bãi: không tách thì người sau mở cùng khu thấy sẵn số người trước gõ dở,
   bấm gửi là số của người kia mang tên mình — và nhật ký thì không sửa lại được. */
const draftKey = () => 'kt:' + S.boot.today + ':' + S.me.id + ':' + S.khu;
// khu mở lần trước cũng nhớ theo từng người: người khác dùng máy thì không mở nhầm khu của người trước
const lastKhuKey = () => 'kt:lastKhu:' + (S.me ? S.me.id : '');
/* Nháp chỉ điền sẵn số đã gửi của HÔM NAY, ĐÚNG KHUNG GIỜ đang diễn ra — tức là để sửa lại lần báo
   vừa rồi. Báo cáo hôm qua chưa duyệt (được chuyển sang hôm nay) và số của khung trước thì KHÔNG:
   điền sẵn chúng thành ô "đã đếm" là chỉ cần bấm GỬI, số cũ thành lần đếm mới với giờ mới, và thép
   duyệt vào sau lần đếm cũ bị nuốt mất (hệ thống tin số cũ "đã gồm" lô thép đó). Ô vẫn để chưa
   đếm, nên phi có thép mới về vẫn bị bắt đếm thực tế như mọi ngày. */
function dienSan(ts) {
  if (!ts || vnDayOf(ts) !== S.boot.today) return false;
  const cur = slotNow();
  return !cur || slotIdxOf(ts) === cur.i;
}
function saveDraft() { try { localStorage.setItem(draftKey(), JSON.stringify(S.draft)); } catch (e) { /* đầy bộ nhớ */ } }
function loadDraft(fresh) {
  let d = null;
  if (!fresh) { try { d = JSON.parse(localStorage.getItem(draftKey()) || 'null'); } catch (e) { d = null; } }
  const rep = S.boot.rm[S.khu];
  S.draftWarn = null;
  // nháp cũ trên máy, nhưng sau đó người khác đã gửi báo cáo khu này: hỏi dùng số nào
  if (d && d.cells && rep && rep.user_id !== S.me.id && rep.ts > (d.baseTs || 0) && Object.keys(d.cells).length) S.draftWarn = { uname: rep.uname, ts: rep.ts };
  if (!d || !d.cells) {
    d = { cells: {}, baseTs: rep ? rep.ts : 0 };
    for (const c of S.boot.counts) {
      if (c.khu_id === S.khu && dienSan(c.ts)) d.cells[c.phi_id] = { v: c.v, kind: c.kind, bo: c.bo == null ? undefined : c.bo, le: c.le == null ? undefined : c.le };
    }
  }
  S.draft = d;
}
function openDem(k) {
  S.khu = k; S.sel = null; S.bo = ''; S.le = ''; S.zoomK = null;
  if (!S.legendSeen) S.legend = true;
  try { localStorage.setItem(lastKhuKey(), k); } catch (e) { /* bỏ qua */ }
  loadDraft();
  S.screen = 'dem';
}
function myPhiList() { return S.boot.phiAct; }
// ô chưa chạm tới. KHÔNG còn chặn gửi (để trống = 0), chỉ để đếm và để hỏi lại cho chắc.
function pendingList() { return myPhiList().filter((p) => !S.draft.cells[p.id]); }
/* Phi để trống mà đang CÓ THÉP: lỗi dễ xảy ra nhất của quy tắc "không điền = 0" — quên gõ một
   phi là vài tấn biến mất trên giấy tờ. Hỏi lại ngay lúc gửi, khi người đếm còn đứng trước đống
   thép, chứ không đẩy hết sang cho người duyệt. Phi dự kiến đang 0 mà để trống thì im lặng cho
   qua — đó mới là chỗ quy tắc này có ích: 9 ô trống gửi thẳng, không hỏi gì. */
// mốc là số DỰ KIẾN (expOf) — đúng con số ô đang hiện, nên câu hỏi khớp với cái người đếm thấy
/* Ô "để trống" có sẵn từ lần báo trước (kind 'zero') cũng là để trống: không tính nó thì người báo
   lại — có khi là người khác — gửi đi 0 cho phi đang có thép mà không được hỏi câu nào. */
function blankWithStock() {
  return myPhiList().filter((p) => { const c = S.draft.cells[p.id]; return (!c || c.kind === 'zero') && (expOf(S.khu, p.id) || 0) > 0; });
}

/* Hàng chờ báo cáo: mỗi báo cáo ghi kèm NGÀY ĐẾM. Server từ chối nếu đã sang ngày khác,
   khi đó báo cáo nằm lại kèm lý do để người dùng tự chọn "gửi làm số hôm nay" hoặc "bỏ". */
const PKEY = 'kt:pending';
function readPending() {
  try { const q = JSON.parse(localStorage.getItem(PKEY) || '[]'); return Array.isArray(q) ? q : []; } catch (e) { return []; }
}
function writePending(q) { try { localStorage.setItem(PKEY, JSON.stringify(q)); } catch (e) { /* đầy bộ nhớ */ } }
const sameJob = (a, b) => a.khu === b.khu && a.day === b.day && a.ts === b.ts;
/* Báo cáo trong hàng chờ là của NGƯỜI ĐÃ ĐẾM (j.uid), không phải của máy. App chỉ tự gửi báo cáo
   của người đang đăng nhập: gửi bằng phiên của người khác thì server ghi số đếm, nhật ký, dấu khung
   giờ dưới tên người đó — hoặc từ chối vì họ không phụ trách khu, rồi báo cáo bị bỏ oan.
   Báo cáo lưu từ bản cũ chưa có uid thì vẫn coi là của người đang đăng nhập, như trước. */
const ofMe = (j) => j.uid == null || (S.me && j.uid === S.me.id);
// khoá nhận dạng một báo cáo trong hàng chờ: vị trí trong mảng đổi sau mỗi lần tự gửi, không dùng được
const pendKey = (j) => j.khu + '|' + (j.day || '') + '|' + j.ts;
function queuePending(job) {
  // chỉ thay báo cáo cũ của CHÍNH người này cho cùng khu + ngày; báo cáo của người khác giữ nguyên
  writePending(readPending().filter((x) => !(x.khu === job.khu && x.day === job.day && x.uid === job.uid)).concat([job]));
}
let flushing = false;
async function flushPending() {
  if (flushing || !S.me || S.me.must_change) return;
  const q = readPending();
  if (!q.some((j) => !j.err && ofMe(j))) return;
  flushing = true;
  const rest = [];
  let sent = 0, failed = 0;
  try {
    for (const job of q) {
      // báo cáo của người khác: để nguyên, chờ chính người đó đăng nhập lại trên máy này
      if (job.err || !ofMe(job)) { rest.push(job); continue; }
      if (!job.day) { rest.push({ ...job, err: 'Báo cáo lưu từ bản cũ, không rõ ngày đếm' }); failed++; continue; }
      /* tuoi = đã trôi bao lâu từ lúc bấm gửi lần đầu, để khung giờ tính theo buổi khu ra bãi đếm chứ
         không theo lúc có mạng lại. Gửi THỜI GIAN ĐÃ TRÔI chứ không gửi giờ máy: máy để sai giờ thì
         hiệu hai mốc vẫn đúng, server tự lấy giờ của nó trừ đi. */
      try { await api('PUT', '/counts', { khu: job.khu, day: job.day, items: job.items, tuoi: Math.max(0, Date.now() - job.ts) }); sent++; }
      catch (e) { if (e.retry) rest.push(job); else { rest.push({ ...job, err: e.message }); failed++; } }
    }
  } finally {
    // giữ các báo cáo mới được thêm trong lúc đang gửi
    writePending(rest.concat(readPending().filter((x) => !q.some((j) => sameJob(j, x)))));
    flushing = false;
  }
  if (sent || failed) {
    try { await loadBoot(); } catch (e) { /* bỏ qua */ }
    if (sent) say('Đã tự gửi ' + sent + ' báo cáo lưu khi mất mạng.' + (failed ? ' Có báo cáo không gửi được, xem ở Tổng quan.' : ''), !!failed);
    else say('Có báo cáo lưu khi mất mạng không gửi được, xem ở Tổng quan.', true);
    render();
  }
}
async function sendCounts() {
  if (S.busy) return;
  S.busy = true; render();
  try { await sendCountsInner(); } finally { S.busy = false; }
  render();
}
async function sendCountsInner() {
  const list = myPhiList();
  /* Ô người đếm không chạm tới gửi lên kind 'zero' (để trống, mặc định 0), KHÁC với bấm "Hết (0)"
     là 'dem' với v = 0 (đã đếm, xác nhận hết thép). Server phân biệt hai cái đó để màn Duyệt nói
     được "khu để trống D25 trong khi dự kiến 72 cây", rất khác "khu đếm, D25 hết thật".
     Máy khách điền 0 chứ không để server tự điền phần thiếu: một bản app cũ còn trong cache chỉ
     gửi các phi nó tưởng là "khu đang có", server điền 0 hộ là xoá sạch tồn những phi nó không
     biết. Server vì vậy đòi đủ phi và trả need_all nếu thiếu. */
  const items = list.map((p) => {
    const c = S.draft.cells[p.id];
    return c ? { phi: p.id, v: c.v, kind: c.kind, bo: c.bo, le: c.le } : { phi: p.id, v: 0, kind: 'zero', bo: 0, le: 0 };
  });
  const khuName = S.boot.khuBy[S.khu].name;
  const job = { khu: S.khu, day: S.boot.today, items, ts: Date.now(), uid: S.me.id, uname: S.me.name };
  try {
    const r = await api('PUT', '/counts', { khu: job.khu, day: job.day, items, tuoi: Math.max(0, Date.now() - job.ts) });
    try { localStorage.removeItem(draftKey()); } catch (e) { /* bỏ qua */ }
    await loadBoot();
    S.sel = null; S.screen = 'home';
    say('Đã gửi báo cáo ' + khuName + (r.conflict ? '. Số khác với người báo trước, admin sẽ xem.' : '. Cảm ơn bạn!'));
  } catch (e) {
    if (e.retry) { queuePending(job); say('Chưa gửi được (' + e.message + '). Đã lưu báo cáo, sẽ tự gửi lại.', true); }
    else if (e.code === 'stale_day') {
      queuePending({ ...job, err: e.message });
      S.sel = null; S.screen = 'home';
      try { await loadBoot(); } catch (er) { /* bỏ qua */ }
      say('Đã sang ngày mới. Báo cáo được giữ lại ở Tổng quan để bạn quyết định.', true);
    } else say(e.message, true);
  }
}
function pendingHtml() {
  const all = readPending();
  if (!all.length) return '';
  const kn = (id) => (S.boot && S.boot.khuBy[id] ? S.boot.khuBy[id].name : id);
  /* Báo cáo của người khác trên cùng máy: chỉ báo cho biết, không có nút gửi hay bỏ — người đang
     đăng nhập không được gửi số người khác đếm dưới tên mình, cũng không được xoá công đếm của họ. */
  const khac = all.filter((j) => !ofMe(j));
  const khacHtml = khac.map((j) => `<div class="card sm" style="line-height:1.4"><b>Báo cáo ${esc(kn(j.khu))} của ${esc(j.uname || 'người khác')}${j.day ? ' (đếm ngày ' + esc(fmtDay(j.day)) + ')' : ''}</b> chưa gửi được. Chờ ${esc(j.uname || 'người đó')} đăng nhập lại trên máy này để gửi.</div>`).join('');
  const q = all.filter(ofMe);
  const waiting = q.filter((j) => !j.err).length;
  return (waiting ? `<div class="card warn sm b">${waiting} báo cáo đang chờ gửi (mất mạng), sẽ tự gửi khi có mạng.</div>` : '') +
    q.map((j) => (j.err ? `<div class="card bad col gap8"><b style="font-size:17px">Báo cáo ${esc(kn(j.khu))}${j.day ? ' đếm ngày ' + esc(fmtDay(j.day)) : ''} chưa gửi được</b>
      <span class="sm">${esc(j.err)}</span>
      <div class="row gap6"><button class="btn s f1" data-a="pendsend" data-j="${esc(pendKey(j))}">Gửi làm số hôm nay</button><button class="btn s bad f1" data-a="pendrm" data-j="${esc(pendKey(j))}">Bỏ báo cáo</button></div></div>` : '')).join('') + khacHtml;
}


/* ===================== MÀN HÌNH ===================== */
function head(title, sub, back) {
  return `<div class="top">${back ? `<button class="iconbtn" aria-label="Quay lại" data-a="nav" data-s="${back}">${IC.back}</button>` : ''}<div class="t"><h1>${title}</h1>${sub ? `<small>${sub}</small>` : ''}</div></div>`;
}

function lastPhone() { try { return localStorage.getItem('kt:phone') || ''; } catch (e) { return ''; } }
function vLogin() {
  return `<div class="login f1 scroll">
    <div class="col gap8"><div class="logo"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg></div>
      <div style="font-size:30px;font-weight:700;line-height:1.2">Kho Thép Bãi</div>
      <div class="muted" style="font-size:18px">Đăng nhập bằng số điện thoại và PIN 4 số</div></div>
    <label class="field">Số điện thoại<input id="phone" type="tel" inputmode="numeric" autocomplete="username" data-model="phone" data-enter="login" value="${esc(S.form.phone || lastPhone())}"></label>
    <label class="field">PIN 4 số<input id="pin" type="password" inputmode="numeric" maxlength="4" autocomplete="current-password" data-enter="login"></label>
    <div class="err" id="err">${esc(S.err)}</div>
    <button class="btn pri full" style="min-height:60px;font-size:20px" data-a="login">ĐĂNG NHẬP</button>
    <div class="muted" style="text-align:center;line-height:1.5">Máy sẽ nhớ đăng nhập 30 ngày.<br>Quên PIN: nhờ admin đặt lại trong mục Người dùng.</div>
    ${installBtn('btn full')}
  </div>`;
}
function vForcePin() {
  return `<div class="login f1 scroll">
    <div style="font-size:26px;font-weight:700">Đổi PIN lần đầu</div>
    <div class="muted" style="font-size:17px;line-height:1.5">Chào ${esc(S.me.name)}. Hãy tự chọn PIN 4 số mới (không dùng 1234, 0000...).</div>
    <label class="field">PIN hiện tại (admin đã đưa)<input id="pin0" type="password" inputmode="numeric" maxlength="4"></label>
    <label class="field">PIN mới<input id="pin1" type="password" inputmode="numeric" maxlength="4"></label>
    <label class="field">Nhập lại PIN mới<input id="pin2" type="password" inputmode="numeric" maxlength="4" data-enter="changepin"></label>
    <div class="err" id="err">${esc(S.err)}</div>
    <button class="btn pri full" style="min-height:60px;font-size:20px" data-a="changepin">LƯU PIN MỚI</button>
    <button class="btn full" data-a="logout">Đăng xuất</button>
  </div>`;
}

/* --- Tổng quan --- */
function vHome() {
  const b = S.boot, T = totals();
  const alerts = [];
  /* Khu chưa báo: admin theo dõi cả bãi nên thấy mọi khu; người đếm và thủ kho chỉ thấy khu mình
     đếm được — khu người khác phụ trách thì họ không làm gì được, nhắc chỉ thành nhiễu.
     Dòng "Tạm tính: N khu chưa báo" ở đầu trang vẫn tính cả bãi, vì đó là nói về con số tồn. */
  const miss = b.khuAct.filter((k) => !daBaoHomNay(k.id));
  // chỉ nhắc khu có gì để đếm (khớp với server); dòng "Tạm tính" đầu trang vẫn tính mọi khu
  const missViec = miss.filter((k) => khuCoViec(k.id));
  const missMine = isAdmin() ? missViec : missViec.filter((k) => canCount(k.id));
  /* Admin cần biết NHẮC AI: kèm tên người phụ trách từng khu; khu chưa giao ai thì nói thẳng. */
  const ai = (k) => (b.kuTen[k.id] && b.kuTen[k.id].length ? b.kuTen[k.id].join(', ') : 'chưa giao ai');
  const missS = isAdmin() ? missMine.map((k) => k.name + ' (' + ai(k) + ')').join(' · ') : missMine.map((k) => k.name).join(', ');
  // một khu và người này đếm được: bấm là mở thẳng khu đó
  const missK = missMine.length === 1 && canCount(missMine[0].id) ? missMine[0].id : null;
  if (missMine.length) alerts.push({ bad: false, t: (missMine.length === 1 ? missMine[0].name : missMine.length + ' khu') + ' chưa báo', s: missS, to: 'dem', k: missK });
  /* Khu CHƯA GIAO NGƯỜI PHỤ TRÁCH thì app không biết nhắc ai, nên nhắc TẤT CẢ mọi người — tức là nhắc
     sai người. Chỉ admin sửa được (Cài đặt → Khu bãi), nên chỉ admin thấy thẻ này. */
  if (isAdmin()) {
    const chuaGiao = b.khuAct.filter((k) => !(b.ku[k.id] && b.ku[k.id].length));
    if (chuaGiao.length) alerts.push({ bad: false, t: chuaGiao.length + ' khu chưa giao người phụ trách', s: chuaGiao.map((k) => k.name).join(', ') + ' · ai cũng được nhắc đếm các khu này. Giao ở Cài đặt → Khu bãi', to: 'settings' });
  }
  b.reports.forEach((r) => {
    const k = b.khuBy[r.khu_id];
    if (!k || !k.active) return;
    // chỉ người liên quan: admin, và người đếm được khu đó — khu của người khác thì không có việc gì cho họ
    if (!isAdmin() && !canCount(k.id)) return;
    if (r.conflict && !r.resolved) alerts.push({ bad: false, t: k.name + ': 2 người báo số khác nhau', s: isAdmin() ? 'Vào Duyệt để chọn số' : 'Admin đang xem', to: isAdmin() ? 'duyet' : null });
    if (r.recount) alerts.push({ bad: false, t: k.name + ' cần đếm lại', s: 'Admin yêu cầu đếm lại · bấm để đếm', to: 'dem', k: canCount(k.id) ? k.id : null });
  });
  /* Việc chờ duyệt phải hiện ngay ở Tổng quan, cho cả hai phía: admin biết còn phải duyệt, còn
     người đếm biết báo cáo của mình đã tới chứ chưa được tính vào tồn. */
  // ngày đã chốt thì không còn gì "chờ duyệt" nữa: nhãn khu đã nói số đó không vào tồn
  // người không phải admin: chỉ khu mình đếm được (báo cáo của mình đang chờ), không phải cả bãi
  const cho = b.closed ? [] : b.khuAct.filter((k) => b.rm[k.id] && khuWaiting(k.id) && (isAdmin() || canCount(k.id)));
  if (cho.length) {
    alerts.push({
      bad: false,
      t: (cho.length === 1 ? cho[0].name : cho.length + ' khu') + ' chờ duyệt',
      s: isAdmin() ? 'Vào Duyệt để xem số và duyệt theo từng khu' : 'Đã gửi, chờ admin duyệt mới tính vào tồn',
      to: isAdmin() ? 'duyet' : null,
    });
  }
  /* Admin bắt mỗi khu đếm nhiều lần/ngày (Cài đặt → Quy tắc). Đây là việc BẮT BUỘC: khung đã qua
     mà khu chưa đếm thì màn Duyệt tính là việc chưa xử lý và ghi vào nhật ký lúc sổ tự chốt, không
     chốt — nên thẻ màu đỏ. Chỉ nhắc khu ĐÃ báo hôm nay: khu chưa báo gì thì thẻ "chưa báo" ở trên
     đã nói, nhắc thêm nữa thành hai thẻ trùng ý cho cùng một khu. Nhiều khu thì gom một thẻ. */
  /* Khung ĐÃ HẾT mà thiếu: chỉ admin cần biết (để nhắc khu, việc thiếu ghi vào nhật ký chốt). Người
     đếm không bù được khung đã qua — thẻ đỏ không bấm được chỉ làm họ quen bỏ qua cảnh báo. */
  // daBaoHomNay chứ không phải b.rm: báo cáo chưa duyệt chuyển từ hôm qua sang không phải "đã báo hôm nay",
  // khu đó đã có thẻ "chưa báo" ở trên — nhắc thêm thiếu khung là hai thẻ trùng ý cho một khu
  const thieuSlot = !isAdmin() ? [] : b.khuAct.filter((k) => daBaoHomNay(k.id)).map((k) => ({ k, m: slotMissing(k.id) })).filter((x) => x.m.length);
  const slotHint = 'Không bù được, ghi vào nhật ký khi chốt sổ';
  if (thieuSlot.length > 2) alerts.push({ bad: true, t: thieuSlot.length + ' khu thiếu lần đếm', s: thieuSlot.map((x) => x.k.name).join(', ') + ' · ' + slotHint, to: isAdmin() ? 'duyet' : null });
  else thieuSlot.forEach((x) => alerts.push({ bad: true, t: x.k.name + ' thiếu ' + slotTenNgan(x.m), s: slotHint, to: isAdmin() ? 'duyet' : null }));
  /* Khung ĐANG DIỄN RA mà khu chưa đếm: đây mới là lời nhắc có ích — còn kịp đếm. Chỉ khu đã báo
     hôm nay (khu chưa báo gì thì thẻ "chưa báo" ở trên đã nói) và khu người này được đếm. */
  const curS = slotNow(), hNow = curS ? vnHourNow() : 0;
  if (curS && !b.closed && hNow >= curS.from && hNow < curS.to) {
    /* Admin đếm được mọi khu nhưng thường không đi đếm: chỉ nhắc admin những khu CHÍNH họ được gán.
       Ai khác thì nhắc mọi khu họ đếm được. */
    const cuaToi = isAdmin() ? b.khuAct.filter((k) => (b.ku[k.id] || []).includes(S.me.id)) : myKhu();
    const chua = cuaToi.filter((k) => daBaoHomNay(k.id) && slotNeed(k.id) && !(b.slotDone[k.id] || new Set()).has(curS.i));
    const con = 'Còn tới ' + fmtGio(curS.to);
    if (chua.length > 2) alerts.push({ bad: false, t: chua.length + ' khu chưa đếm ' + curS.label, s: chua.map((k) => k.name).join(', ') + ' · ' + con, to: 'dem' });
    else chua.forEach((k) => alerts.push({ bad: false, t: k.name + ' chưa đếm ' + slotTen(curS, b.nSlot), s: con, to: 'dem', k: k.id }));
  }
  /* Khoản vay mượn QUÁ HẠN TRẢ (phần còn nợ của lần vay đã qua hạn): admin và thủ kho là người đi đòi
     hoặc đi trả, nên chỉ họ thấy. Nói cả hai chiều, vì mình nợ quá hạn cũng là việc phải xử lý. */
  const qh = b.loanQuaHan || { no: 0, co: 0 };
  if ((isAdmin() || canIn()) && (qh.no || qh.co)) {
    alerts.push({ bad: true, t: (qh.no + qh.co) + ' khoản vay mượn quá hạn trả', s: [qh.co ? 'đối tác nợ mình ' + qh.co + ' khoản' : '', qh.no ? 'mình nợ đối tác ' + qh.no + ' khoản' : ''].filter(Boolean).join(' · '), to: 'vaymuon' });
  }
  // sổ vay mượn chờ duyệt: chỉ nhắc admin, vì chỉ admin duyệt được, và việc này không chặn chốt ngày
  if (isAdmin() && b.loanPending) alerts.push({ bad: false, t: b.loanPending + ' lần ghi vay mượn chờ duyệt', s: 'Chưa tính vào dư nợ với đối tác', to: 'vaymuon' });
  const choP = (b.receipts || []).filter((r) => !r.duyet_day && !r.voided);
  // người đếm không lập phiếu, cũng không duyệt: thẻ phiếu chờ không có gì cho họ làm
  if (choP.length && (isAdmin() || canIn())) {
    const nP = new Set(choP.map((r) => r.grp || 'id' + r.id)).size;
    alerts.push({
      bad: false,
      t: nP + ' phiếu chờ duyệt',
      s: isAdmin() ? 'Chưa tính vào tồn. Vào Duyệt để duyệt hoặc từ chối' : 'Chưa tính vào tồn, chờ admin duyệt',
      // người đếm không có tab Nhập: thẻ chỉ để đọc, không dẫn vào màn họ không dùng được
      to: isAdmin() ? 'duyet' : canIn() ? 'nhap' : null,
    });
  }
  /* (Đã có thẻ "lần ghi vay mượn chờ duyệt" cho admin ở trên. Không bày thêm cho người khác: số này là
     của CẢ BÃI, không phải lần ghi của người đang xem — trạng thái từng lần ghi đã có ở màn Vay mượn.) */
  // Gom các phi cùng một loại cảnh báo vào MỘT thẻ khi có nhiều hơn 2:
  // ngày đầu chưa có tồn chuẩn, cả 15 phi đều dưới mức tối thiểu sẽ đẩy hết nội dung khác xuống dưới.
  const rateTxt = (p) => (b.rate[p.id] ? (isCuon(p) ? fmtDec(b.rate[p.id] / p.bo_size) + ' cuộn/ngày' : fmtInt(b.rate[p.id]) + ' cây/ngày') : '');
  const neg = [], low = [], shortp = [];
  b.phiAct.forEach((p) => {
    // cùng ngưỡng kg với màn Duyệt: lệch vài cây là sai số đếm thường ngày, báo đỏ ở đây thì
    // bấm sang Duyệt lại không có việc gì để xử lý, và người dùng mất tin vào cảnh báo
    if (b.lastClosed && T.used[p.id] * p.kg_per_cay < -LIM('negKg')) neg.push(p);
    const dl = daysLeft(p.id, T.perPhi[p.id]);
    if (T.perPhi[p.id] < p.min_stock) low.push(p);
    else if (dl !== null && dl < 3) shortp.push({ p, dl });
  });
  const toDuyet = isAdmin() ? 'duyet' : null; // người không phải admin: thẻ chỉ để đọc, không bấm được
  if (neg.length > 2) alerts.push({ bad: true, t: neg.length + ' phi có số "đã dùng" âm', s: neg.map((p) => p.id).join(', ') + ' · nhập sót phiếu hoặc đếm sai?', to: toDuyet });
  else neg.forEach((p) => alerts.push({ bad: true, t: p.id + ' đã dùng âm (' + qMain(T.used[p.id], p) + ')', s: 'Nhập sót phiếu hoặc đếm sai?', to: toDuyet }));
  if (low.length > 2) alerts.push({ bad: true, t: low.length + ' phi dưới mức báo động', s: low.map((p) => p.id).join(', '), to: 'ton' });
  else low.forEach((p) => { const [cur, mn] = qPair(T.perPhi[p.id], p.min_stock, p); alerts.push({ bad: true, t: p.id + ' dưới mức báo động', s: 'Còn ' + cur + ', báo động ' + mn, to: 'ton' }); });
  if (shortp.length > 2) alerts.push({ bad: false, t: shortp.length + ' phi chỉ còn đủ dùng dưới 3 ngày', s: shortp.map((x) => x.p.id).join(', '), to: 'ton' });
  else shortp.forEach((x) => alerts.push({ bad: false, t: x.p.id + ' chỉ còn đủ dùng ' + daysTxt(x.dl), s: 'Còn ' + qMain(T.perPhi[x.p.id], x.p) + (rateTxt(x.p) ? ', dùng TB ' + rateTxt(x.p) : ''), to: 'ton' }));
  const maxKhu = Math.max(1, ...b.khuAct.map((k) => T.perKhu[k.id].kg));
  // dùng kg để scale bar (so sánh D8 cuộn vs D10+ cây trên cùng thước đo)
  const maxBarKg = Math.max(1, ...b.phiAct.map((p) => T.perPhi[p.id] * p.kg_per_cay), ...b.phiAct.map((p) => p.min_stock * p.kg_per_cay));
  const khuCards = b.khuAct.map((k) => {
    const st = khuStatus(k), tk = T.perKhu[k.id];
    const unrep = !daBaoHomNay(k.id);
    const open = !!S.khuMo[k.id];
    return `<div class="card col gap8" style="${st.cls === 'warn' ? 'background:var(--warnbg);border:2px solid var(--warn)' : ''}">
      <button class="col gap8" style="background:transparent;border:0;padding:0;width:100%;text-align:left;align-items:stretch" aria-expanded="${open}" data-a="khumo" data-k="${esc(k.id)}">
        <div class="row" style="justify-content:space-between;gap:8px;align-items:flex-start"><b class="clamp2" style="font-size:20px;min-width:0">${esc(k.name)}</b><b style="font-size:20px;white-space:nowrap;flex:none">${fmtT(tk.kg)} tấn</b></div>
        <div class="bar"><i style="width:${Math.round(tk.kg / maxKhu * 100)}%"></i></div>
        <div class="row" style="justify-content:space-between;gap:8px"><span class="sm">${esc(st.who)}${unrep && b.lastClosed ? ' · tạm lấy số hôm qua' : ''}</span><span class="badge ${st.cls}">${st.label}</span></div>
        <span class="sm" style="color:var(--pri);text-decoration:underline">${open ? 'Ẩn chi tiết' : 'Xem chi tiết thép trong khu'}</span>
      </button>
      ${open ? khuChiTiet(k) : ''}
    </div>`;
  }).join('');
  const bars = b.phiAct.map((p) => {
    const v = T.perPhi[p.id], low = v < p.min_stock;
    const vKg = v * p.kg_per_cay, minKg = p.min_stock * p.kg_per_cay;
    const dispV = isCuon(p) ? fmtDec(v / p.bo_size) : fmtInt(v);
    return `<div class="r"><span class="l">${p.id}</span><div class="t"><i class="${low ? 'low' : ''}" style="width:${Math.max(2, Math.round(vKg / maxBarKg * 100))}%"></i><u style="left:${Math.round(minKg / maxBarKg * 100)}%"></u></div><span class="v ${low ? 'low' : ''}">${dispV}<i>${unitLbl(p)}</i></span></div>`;
  }).join('');
  // quên chốt ngày trước thì "đã dùng" là lượng dùng gộp từ sau ngày chốt gần nhất
  const yday = new Date(Date.parse(b.today) - 864e5).toISOString().slice(0, 10);
  const usedLabel = b.lastClosed && b.lastClosed < yday ? 'Đã dùng từ sau ' + fmtDay(b.lastClosed).slice(0, 5) : 'Đã dùng hôm nay';
  const usedTxt = T.usedKg === null ? '—' : fmtT(T.usedKg) + ' tấn';
  const note = (miss.length ? `Tạm tính: ${miss.length} khu chưa báo${b.lastClosed ? ' nên lấy số hôm qua' : ''}` : 'Đủ ' + b.khuAct.length + '/' + b.khuAct.length + ' khu đã báo hôm nay')
    + (T.hidKg > 0 ? ` · gồm ${fmtT(T.hidKg)} tấn ở khu đã ẩn (không có trong danh sách dưới)` : '');
  return `<div class="f1 scroll" id="body">
    <div class="hero">
      <div class="row" style="justify-content:space-between"><span>Tổng quan · ${esc(b.today.split('-').reverse().join('/'))}</span><span class="badge" style="background:#fff;color:var(--pri)">${ROLE[S.me.role]}</span></div>
      <div class="row" style="justify-content:space-between;align-items:flex-end;gap:10px;flex-wrap:wrap"><div class="col"><span style="font-size:15px">Tồn toàn bãi</span><span class="big">${fmtT(T.kg)} tấn</span></div><span style="font-size:17px;padding-bottom:6px">${cayTxt(T.cay)}</span></div>
      <div class="sm" style="color:#D6E0EE">${note}</div>
      <div class="mini"><div><span>Nhập hôm nay</span><b>${fmtT(T.inKg)} tấn</b></div><div><span>${usedLabel}</span><b>${usedTxt}</b></div></div>
    </div>
    ${b.closed ? `<div class="toast" style="margin-top:12px">${b.closedReset ? 'Hôm nay admin vừa đặt lại số liệu, ngày đã khoá.' : 'Sổ hôm nay đã chốt.'}</div>` : ''}
    <div class="pad col gap12">
      ${pendingHtml()}
      ${alerts.length ? `<h2 class="sec">Cần xử lý (${alerts.length})</h2>` + alerts.map((a) => {
        const inner = `<span class="f1 col" style="gap:2px"><b style="font-size:17px">${esc(a.t)}</b><span class="sm">${esc(a.s)}</span></span>`;
        return a.to
          ? `<button class="alertbtn ${a.bad ? 'bad' : 'warn'}" data-a="nav" data-s="${a.to}"${a.k ? ` data-k="${esc(a.k)}"` : ''}>${inner}${IC.chev}</button>`
          : `<div class="alertbtn ${a.bad ? 'bad' : 'warn'}">${inner}</div>`;
      }).join('') : ''}
      <div class="row" style="justify-content:space-between;align-items:baseline;gap:8px"><h2 class="sec" style="min-width:0">Tồn theo khu và người báo</h2><span class="sm muted" style="white-space:nowrap;flex:none">${reportedCount()}/${b.khuAct.length} khu đã báo</span></div>
      ${khuCards}
      <div class="row" style="justify-content:space-between;align-items:baseline;gap:8px"><h2 class="sec" style="min-width:0">Tồn theo đường kính</h2><button class="b" style="border:0;background:transparent;color:var(--pri);text-decoration:underline;font-size:15px;padding:8px 0;white-space:nowrap;flex:none" data-a="nav" data-s="ton">Xem chi tiết</button></div>
      <div class="sm muted">Vạch đen là mức báo động. Thanh đỏ là tồn đã xuống dưới mức báo động.</div>
      <div class="bars">${bars}</div>
    </div></div>`;
}

/* Chi tiết thép đang có trong một khu, mở ra khi chạm vào thẻ khu ở Tổng quan.
   Cột "Đang có" là số ĐÃ DUYỆT — tức số liệu TRƯỚC báo cáo đang chờ. Đó không phải chọn cho tiện
   mà là đúng quy tắc của bản này: báo cáo chưa duyệt thì chưa vào tồn. Khi admin duyệt, cùng ô
   này tự hiện số mới, không cần làm gì thêm.
   Khu đang có báo cáo chờ duyệt thì bày thêm cột "Khu báo" đặt cạnh, để thấy ngay số sẽ đổi
   thành bao nhiêu và lệch bao nhiêu — xem mà không phải sang màn Duyệt. */
function khuChiTiet(k) {
  const b = S.boot;
  // lần báo mới nhất của hôm nay, chỉ lấy phần CHƯA được duyệt
  const cho = {};
  (b.counts || []).forEach((c) => {
    if (c.khu_id !== k.id) return;
    if (c.duyet_ts != null && c.duyet_ts === c.ts) return; // đã duyệt rồi, không phải số đang chờ
    cho[c.phi_id] = c;
  });
  const coCho = Object.keys(cho).length > 0;
  const rows = b.phiAct.map((p) => {
    const v = tonOf(k.id, p.id);
    const c = cho[p.id];
    return { p, v, moi: c ? c.v : null, trong: c ? c.kind === 'zero' : false };
  });
  /* Bày ĐỦ mọi đường kính, phi không có thép thì ghi 0: người xem đối chiếu được từng dòng với
     bảng đếm và với thực tế ngoài khu, không phải đoán "không thấy D25 là hết hay là quên". */
  const coThep = rows.filter((r) => r.v > 0).length;
  const tongKg = rows.reduce((a, r) => a + r.v * r.p.kg_per_cay, 0);
  // đếm/báo cáo ngay từ đây: chỉ khi người này đếm được khu này và ngày chưa chốt
  const nutDem = !b.closed && canCount(k.id)
    ? `<button class="btn s pri full" data-a="nav" data-s="dem" data-k="${esc(k.id)}">${daBaoHomNay(k.id) ? 'BÁO CÁO LẠI ' : 'BÁO CÁO '}${esc(cut(k.name, 18).toUpperCase())}</button>` : '';
  const dong = (r) => {
    const lech = r.moi === null ? null : r.moi - r.v;
    return `<div class="li" style="gap:6px${r.v || r.moi ? '' : ';color:var(--mut)'}"><b style="width:44px">${r.p.id}</b>
      <span class="f1 sm">${r.v ? fmtQs(r.v, r.p) + ' · ' + fmtT(r.v * r.p.kg_per_cay) + ' tấn' : '0'}</span>
      ${r.moi === null ? '' : `<span class="sm" style="white-space:nowrap;color:${lech ? 'var(--warn)' : 'var(--mut)'}">${r.trong ? 'để trống' : fmtQs(r.moi, r.p)}${lech ? ' (' + (lech > 0 ? '+' : '−') + fmtQs(Math.abs(lech), r.p) + ')' : ''}</span>`}</div>`;
  };
  return `<div class="col gap6" style="border-top:1px solid var(--line);padding-top:8px">
    <div class="li sm b" style="background:#E8EEF6"><span style="width:44px">ɸ</span><span class="f1">Đang có${coCho ? ' (trước báo cáo)' : ''}</span>${coCho ? '<span>Khu báo</span>' : ''}</div>
    <div class="card" style="padding:0;overflow:hidden;margin:0">${rows.map(dong).join('')}</div>
    <div class="row sm" style="justify-content:space-between"><span class="muted">${coThep}/${rows.length} phi có thép</span><b>${fmtT(tongKg)} tấn</b></div>
    ${coCho
      ? `<span class="sm" style="line-height:1.45;color:var(--warn)"><b>Số bên trái là số đang dùng, chưa tính báo cáo mới.</b> Khi admin duyệt báo cáo, nó đổi thành số ở cột "Khu báo".</span>`
      : '<span class="sm muted" style="line-height:1.45">Đây là số đã duyệt, cũng là số đang dùng để tính tồn bãi.</span>'}
    ${nutDem}
  </div>`;
}

/* --- Chọn khu --- */
function vKhu() {
  const b = S.boot;
  const mine = myKhu();
  const cards = mine.map((k) => {
    const st = khuStatus(k);
    const cls = st.cls === 'ok' ? 'background:var(--okbg);border:2px solid var(--ok)' : st.cls === 'warn' ? 'background:var(--warnbg);border:2px solid var(--warn)' : 'background:#ECEAE4;border:2px solid #8C8678';
    return `<button class="col gap8" style="${cls};min-height:104px;padding:14px;border-radius:16px;text-align:left;align-items:flex-start" data-a="khuopen" data-k="${esc(k.id)}">
      <b class="clamp2" style="font-size:20px;line-height:1.2;width:100%">${esc(k.name)}</b><span class="badge ${st.cls}">${st.label}</span><span class="sm">${esc(st.who)}</span></button>`;
  }).join('');
  const hidden = b.khuAct.length - mine.length;
  /* Đếm nhiều lần/ngày thì "đã báo" phải hiểu theo khung đang diễn ra: khu báo lúc 8h đã xong
     buổi sáng nhưng chưa xong buổi chiều, nói "Đã báo 3/3" lúc 14h là sai. */
  const cur = slotNow();
  const sub = !mine.length ? 'Bạn chưa được giao khu nào'
    : cur ? 'Đang ' + cur.label + ': đã đếm ' + mine.filter((k) => (b.slotDone[k.id] || new Set()).has(cur.i)).length + '/' + mine.length + ' khu của bạn'
    : 'Đã báo ' + mine.filter((k) => daBaoHomNay(k.id)).length + '/' + mine.length + ' khu của bạn';
  const body = mine.length
    ? `<div class="grid2">${cards}</div>${hidden ? `<div class="sm muted" style="padding:10px 2px;line-height:1.4">Còn ${hidden} khu do người khác phụ trách nên không hiện ở đây.</div>` : ''}`
    : `<div class="card warn col gap6"><b style="font-size:18px">Chưa được giao khu nào</b><span class="sm" style="line-height:1.4">Admin cần vào Thêm → Cài đặt → Khu bãi để gán bạn phụ trách khu. Khi đó khu sẽ hiện ở màn này.</span></div>`;
  return `${head('Chọn khu để báo cáo', sub, S.khu ? 'dem' : 'home')}
    <div class="f1 scroll pad" id="body">${body}</div>`;
}

/* --- Bảng đếm toàn bãi --- */
function demView() {
  const b = S.boot, k = S.khu, kname = b.khuBy[k].name;
  if (!b.phiAct.length) return `${head('Báo cáo ' + esc(kname), '', 'home')}<div class="pad muted">Chưa có phi thép nào trong hệ thống. Admin vào Thêm → Cài đặt → "Khôi phục phi mặc định".</div>`;
  if (!canCount(k)) return `${head('Báo cáo ' + esc(kname), 'Không có quyền', 'khu')}<div class="pad"><div class="card warn col gap6"><b style="font-size:18px">Bạn không phụ trách ${esc(kname)}</b><span class="sm" style="line-height:1.4">Admin đã giao khu này cho người khác. Bấm "Đổi khu" để chọn khu của bạn, hoặc nhờ admin gán quyền.</span><button class="btn s full" data-a="nav" data-s="khu">Đổi khu</button></div></div>`;
  const zk =S.zoomK && S.zoomK !== k ? S.zoomK : null;
  const others = b.khuAct.filter((x) => x.id !== k);
  const shown = zk ? others.filter((x) => x.id === zk) : others;
  const n = Math.max(1, shown.length);
  // vừa màn thì chia đều, quá nhiều khu thì cố định 42px và kéo ngang (không co chữ đến mức không đọc được)
  // cột khu khác tối thiểu 46px (đủ "12.345", "155,07"); nhiều khu thì bảng cuộn ngang thay vì bóp số
  const avail = Math.max(160, (window.innerWidth || 390) - 182);
  const cwStyle = zk || avail / n >= 46 ? 'flex:1 1 0;min-width:0' : 'flex:0 0 46px';
  const cFont = zk ? 20 : n > 6 ? 13 : 15;
  const size = (p) => b.phiBy[p].bo_size;
  const boN = parseInt(S.bo || '0', 10), leN = parseInt(S.le || '0', 10);
  const hasIn = S.bo !== '' || S.le !== '';
  const curV = (p) => boN * size(p) + leN;
  const list = myPhiList(), pend = pendingList();
  const T = { own: 0, ownKg: 0, all: 0, allKg: 0 };
  const colTotKg = {};
  b.khuAct.forEach((x) => { colTotKg[x.id] = 0; });

  const lrows = [], rrows = [];
  b.phiAct.forEach((p, idx) => {
    const cell = S.draft.cells[p.id];
    const isSel = S.sel === p.id;
    const ref = expOf(k, p.id), mv = movedOf(k, p.id);
    // so với số dự kiến (hôm qua + nhập/chuyển), không phải số hôm qua
    // lệch hiển thị theo đúng đơn vị của phi: tròn cuộn thì ghi cuộn, lẻ thì ghi cây
    const dTxt = (d) => { const a = Math.abs(d), sg = d > 0 ? '+' : '−'; return sg + (isCuon(p) ? cuonTxt(a, p) : fmtInt(a)); };
    const delta = (v) => { if (ref === undefined) return null; const d = v - ref; return { big: ref >= 10 && Math.abs(d) / ref > 0.5, t: d === 0 ? 'đúng dự kiến' : dTxt(d) }; };
    const toDisp = (v) => isCuon(p.id) ? fmtDec(v / p.bo_size) : fmtInt(v);
    let cls, txt, sub = '';
    if (isSel) { cls = 'sel'; txt = hasIn ? String(toDisp(curV(p.id))) : '__'; const dl = hasIn ? delta(curV(p.id)) : null; sub = dl ? dl.t : ''; if (dl && dl.big) cls += ' big'; }
    else if (cell) {
      if (cell.kind === 'giu') { cls = 'giu'; txt = '=' + toDisp(cell.v); sub = 'giữ nguyên'; }
      // 'zero' = đã gửi ở trạng thái để trống; nói rõ để người đếm không tưởng là mình đã đếm ra 0
      else if (cell.kind === 'zero') { const dl = delta(0); cls = dl && dl.big ? 'big' : 'okc'; txt = '0'; sub = 'để trống'; }
      else { const dl = delta(cell.v); cls = dl && dl.big ? 'big' : 'okc'; txt = String(toDisp(cell.v)); sub = dl ? dl.t : ''; }
    } else {
      /* Ô chưa chạm tới thì GỬI ĐI SẼ LÀ 0, nên phải nói đúng điều đó. Bản cũ hiện số hôm qua
         kèm nhãn "hôm qua"/"dự kiến"; dưới quy tắc mới đó là mời hiểu sai nguy hiểm nhất —
         "ô đang hiện 72, tôi không sửa thì nó vẫn 72" — trong khi thực tế sẽ thành 0.
         Muốn giữ số hôm qua thì phải bấm "Giữ nguyên", một hành động rõ ràng.
         Ô để trống mà đang có thép thì tô cảnh báo: đó là ô sắp làm mất thép trên giấy tờ. */
      cls = ref ? 'pend big' : 'pend';
      txt = '—';
      sub = ref ? 'sẽ ghi 0 · đang có ' + toDisp(ref) : 'sẽ ghi 0';
    }
    // tổng bãi cộng cả khu đã ẩn còn thép, cho khớp số với Tổng quan và màn Duyệt
    let total = 0;
    for (const x of b.khu) {
      /* Ô người đếm đã gõ số thì lấy đúng số đó: đó là đếm tận mắt, đã gồm cả thép vừa về.
         Ô chưa gõ, và mọi khu khác, thì lấy thép đang có (tonOf). */
      const v = x.id === k ? (isSel && hasIn ? curV(p.id) : (cell ? cell.v : tonOf(k, p.id))) : tonOf(x.id, p.id);
      total += v; T.all += v; T.allKg += v * p.kg_per_cay;
      if (colTotKg[x.id] !== undefined) colTotKg[x.id] += v * p.kg_per_cay;
      if (x.id === k) { T.own += v; T.ownKg += v * p.kg_per_cay; }
    }
    const bg = isSel ? ' sel' : idx % 2 ? ' alt' : '';
    lrows.push(`<div class="mxrow${bg}"><div class="mxp">${p.id}</div><div class="mxo"><button class="own ${cls}" aria-label="Nhập ${p.id}" data-a="cell" data-p="${p.id}"><b>${txt}</b><i>${sub}</i></button></div><div class="mxv">${toDisp(total)}</div></div>`);
    rrows.push(`<div class="mxrow${bg}">${shown.map((x) => {
      const st = khuStatus(x);
      // mọi khu nay đều có đủ 13 dòng mà phần lớn là 0: hiện dấu · cho bảng đỡ rối
      const v = tonOf(x.id, p.id);
      const has = v !== 0;
      const unrep = !daBaoHomNay(x.id); // báo cáo chuyển từ hôm qua chưa phải số hôm nay
      return `<div class="oc" style="${cwStyle};font-size:${cFont}px;color:${has ? (unrep ? '#4B5360' : '#1C1F22') : '#9A9489'};background:${st.cls === 'warn' ? '#FFF3D6' : unrep ? '#EDEBE4' : 'transparent'}">${has ? (isCuon(p.id) ? fmtDec(v / p.bo_size) : v) : '·'}</div>`;
    }).join('')}</div>`);
  });
  const hdrs = shown.map((x) => `<button class="khh" aria-label="Phóng to ${esc(x.name)}" data-a="zoom" data-k="${esc(x.id)}" style="${cwStyle};font-size:${zk ? 15 : 14}px">${zk ? esc(x.name) + ' (chạm để thu nhỏ)' : esc(x.id)}</button>`).join('');
  const tots = shown.map((x) => `<div class="oc" style="${cwStyle};font-size:${zk ? 16 : 12}px;font-weight:700;height:40px;white-space:nowrap">${fmtT(colTotKg[x.id])}</div>`).join('');

  const rep0 = b.rm[k];
  const already = rep0 && !tuHomQua(rep0) && rep0.user_id !== S.me.id ? rep0 : null;
  const keepable = pend.filter((p) => !keepBlock(k, p.id));
  const empty = list.length === 0; // không còn phi nào đang bật trong hệ thống
  const keepTxt = empty ? 'Chưa có phi thép nào'
    : pend.length === 0 ? 'Đã nhập số cho mọi phi'
    : !keepable.length ? `${pend.length} phi còn lại phải đếm thực tế`
    : `Giữ nguyên ${keepable.length} phi còn lại`;
  /* Gửi được bất cứ lúc nào: ô để trống là 0, người đếm không phải gõ 0 cho chín phi khu không có.
     Chốt chặn duy nhất là hộp hỏi lại khi để trống phi ĐANG CÓ THÉP (xem hành động send). */
  const canSend = list.length > 0;
  const nBlank = blankWithStock().length;

  let sheet = '';
  if (S.sel) {
    const p = S.sel, ref = refOf(k, p), mv = movedOf(k, p), ex = expOf(k, p);
    const streakOk = !keepBlock(k, p);
    const selPhi = b.phiBy[p];
    const refTxt = 'Hôm qua: ' + (ref === undefined ? 'chưa có' : qMain(ref, selPhi)) + (mv ? ` · ${mv > 0 ? 'nhập/chuyển vào +' + qMain(mv, selPhi) : 'chuyển đi −' + qMain(Math.abs(mv), selPhi)} · <b>dự kiến ${qMain(ex, selPhi)}</b>` : '');
    const cu = isCuon(p);
    /* "Xóa" hứa xoá cả ô nhưng nút này chỉ bớt một chữ số, nên nói đúng việc nó làm. */
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Xóa 1 số', '0', S.field === 'bo' ? (cu ? 'Dở ›' : 'Lẻ ›') : (cu ? '‹ Cuộn' : '‹ Bó')];
    /* Hai dòng riêng, không nối bằng dấu "·": gộp lại thì "Hôm qua: 40 cây · 1 bó = 320 cây"
       đọc như một số lượng duy nhất, và dấu "·" phải gánh ba nghĩa (ngăn số liệu, ngăn quy đổi,
       ngăn hướng dẫn gõ). Dòng trên là số liệu của ô, dòng dưới là cách quy đổi và cách gõ. */
    const howTxt = unitHint(selPhi) + (cu ? ' · cuộn dở gõ %: 50 = nửa cuộn' : '');
    sheet = `<div class="pad-sheet">
      <div class="row" style="justify-content:space-between;gap:8px"><div class="col"><b style="font-size:16px">${esc(kname)} · ${p}${hasIn ? '  = ' + fmtCount(curV(p), b.phiBy[p]) + ' · ' + fmtT(curV(p) * b.phiBy[p].kg_per_cay) + ' tấn' : ''}</b><span class="sm muted" style="line-height:1.35">${refTxt}</span><span class="sm muted" style="line-height:1.35">${howTxt}</span></div><button class="btn s" style="min-height:44px" data-a="closesel">Đóng</button></div>
      <div class="row gap6"><button class="boxn ${S.field === 'bo' ? 'on' : ''}" data-a="fld" data-v="bo"><span>${cu ? 'Cuộn nguyên' : 'Số bó'}</span><b>${S.bo || '0'}</b></button><span class="sm b" style="white-space:nowrap">${cu ? '+' : '× ' + size(p) + ' +'}</span><button class="boxn ${S.field === 'le' ? 'on' : ''}" data-a="fld" data-v="le"><span>${cu ? 'Cuộn dở (%)' : 'Cây lẻ'}</span><b>${S.le || '0'}</b></button></div>
      <div class="keys">${keys.map((d, i) => `<button class="key ${d.length > 1 ? 'fn' : ''}" data-a="key" data-d="${i}">${d}</button>`).join('')}</div>
      <div class="acts"><button class="btn ${streakOk ? '' : 'dis'}" data-a="keep">Giữ nguyên</button><button class="btn bad" data-a="zero">Hết (0)</button><button class="btn pri" data-a="next">TIẾP</button></div>
    </div>`;
  }
  const pendingNote = readPending().filter(ofMe).length;

  return `<div class="top" style="padding-bottom:2px"><button class="iconbtn" aria-label="Về tổng quan" data-a="nav" data-s="home">${IC.back}</button><div class="t"><h1>Báo cáo ${esc(kname)}</h1><small>${slotNow() ? 'Lần đếm ' + esc(slotNow().label) + ((b.slotDone[k] || new Set()).has(slotNow().i) ? ' · khu này đã đếm' : ' · khu này chưa đếm') : 'Bảng toàn bãi, nhập ngay trong bảng'}</small></div><button class="btn s" data-a="nav" data-s="khu">Đổi khu</button></div>
    <div class="mxhead"><div style="min-width:0"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(kname)} (bạn)</span><b>${fmtT(T.ownKg)} tấn</b></div><div style="text-align:center;flex:none"><span>Phi chưa nhập</span><b>${pend.length}</b></div><div style="text-align:right;flex:none"><span>Tổng bãi (tạm tính)</span><b>${fmtT(T.allKg)} tấn</b></div></div>
    ${S.toast ? `<div class="toast ${S.toastErr ? 'err' : ''}" data-toast="1" role="${S.toastErr ? 'alert' : 'status'}" aria-live="${S.toastErr ? 'assertive' : 'polite'}">${esc(S.toast)}</div>` : ''}
    ${b.closed ? `<div class="toast err">${b.closedReset ? 'Hôm nay vừa đặt lại số liệu, ngày đã khoá. Ngày mai hãy báo số như thường.' : 'Sổ hôm nay đã chốt. Ngày mai hãy báo số như thường.'}</div>` : ''}
    ${S.sel ? '' : `<div class="col gap6 tbar" style="padding:6px 12px 2px">${already ? `<div class="card sm" style="line-height:1.4"><b>${esc(already.uname)} đã báo ${esc(kname)} lúc ${hhmm(already.ts)}.</b> Bạn đang đếm lại: chỉ gửi khi vừa đếm thực tế, số khác với người trước sẽ chuyển admin xem.</div>` : ''}${rep0 && khuWaiting(k) && !b.closed ? `<div class="card warn sm" style="line-height:1.4"><b>Báo cáo ${esc(kname)} ${tuHomQua(rep0) ? 'ngày ' + esc(fmtDay(vnDayOf(rep0.ts))) + ' ' : ''}lúc ${hhmm(rep0.ts)} đang chờ admin duyệt.</b> ${dienSan(rep0.ts)
      ? 'Số dưới đây là số đã gửi; nó chỉ vào tồn bãi sau khi được duyệt. Gửi lại sẽ thay số đang chờ.'
      : `Số đó ${tuHomQua(rep0) ? 'của ngày trước' : 'của lần đếm trước'} nên không điền sẵn vào bảng: hãy đếm thực tế rồi gửi, số mới sẽ thay số đang chờ.`}</div>` : ''}<button class="btn s full ${pend.length === 0 || !keepable.length ? 'dis' : ''}" data-a="keepall">${keepTxt}</button>
      ${S.draftWarn ? `<div class="card warn col gap6"><b>${esc(S.draftWarn.uname)} đã gửi báo cáo khu này lúc ${hhmm(S.draftWarn.ts)}, sau khi bạn bắt đầu nháp.</b><div class="row gap6"><button class="btn s f1" data-a="draftnew">Dùng số mới</button><button class="btn s f1" data-a="draftkeep">Giữ nháp của tôi</button></div></div>` : ''}
      <button class="sm" style="border:0;background:transparent;color:var(--pri);text-align:left;padding:4px 0;text-decoration:underline" data-a="legend">${S.legend ? 'Ẩn chú thích' : 'ⓘ Chú thích màu'}</button>
      ${S.legend ? '<div class="sm muted" style="line-height:1.4">Xanh lá: đã đếm · Dấu =: giữ nguyên · Dấu — : để trống, gửi đi sẽ ghi 0 · Viền cam đậm: lệch lớn so với dự kiến, hoặc để trống phi đang có thép. Phi khu không có thì cứ để trống. Chạm chữ cái khu để phóng to.</div>' : ''}
      ${nBlank ? `<div class="sm b" style="color:var(--bad);line-height:1.4">${nBlank} phi đang có thép mà còn để trống: ${blankWithStock().slice(0, 6).map((p) => p.id).join(', ')}${nBlank > 6 ? '…' : ''}. Gửi là ghi 0.</div>` : ''}</div>`}
    <div class="f1" id="mx"><div class="mxw">
      <div class="mxl"><div class="mxh"><div class="mxp" style="font-size:13px">ɸ</div><div class="mxo" style="font-size:13px;font-weight:700;color:var(--pri)">Bạn đếm</div><div class="mxv" style="font-size:13px">Tổng bãi</div></div>${lrows.join('')}<div class="mxtot"><div class="mxp" style="font-size:12px;line-height:1.1">Tổng<br>(tấn)</div><div class="mxo" style="font-weight:700;color:var(--pri)">${fmtT(T.ownKg)}</div><div class="mxv">${fmtT(T.allKg)}</div></div></div>
      <div class="mxr"><div class="mxh">${hdrs}</div>${rrows.join('')}<div class="mxtot">${tots}</div></div>
    </div></div>
    ${S.sel ? sheet : `<div class="sendbar">${pendingNote ? '<div class="sm b" style="color:var(--bad);margin-bottom:6px">Có báo cáo chưa gửi được, xem ở Tổng quan.</div>' : ''}<button class="btn full ${canSend && !b.closed ? 'pri' : 'dis'}" data-a="send">${canSend ? 'GỬI BÁO CÁO ' + esc(cut(kname, 20).toUpperCase()) : 'CHƯA CÓ PHI THÉP NÀO'}</button></div>`}`;
}

/* --- Nhập kho / chuyển khu --- */
const unitHint = (p) => (isCuon(p) ? `1 cuộn ≈ ${fmtInt(p.bo_size * p.kg_per_cay)} kg` : `1 bó = ${fmtInt(p.bo_size)} cây ≈ ${fmtT(p.bo_size * p.kg_per_cay)} tấn`);
const nkgText = (qty, p) => `= ${fmtInt(qty * p.kg_per_cay)} kg (${fmtT(qty * p.kg_per_cay)} tấn) · ${unitHint(p)}`;
/* "Đang có X → còn Y" của màn Điều chỉnh. Tách thành hàm vì phải vẽ được ở HAI chỗ: lúc dựng màn
   hình, và lúc người dùng đang gõ số (chỗ đó chỉ sửa textContent chứ không vẽ lại cả màn, nếu
   không ô nhập mất con trỏ giữa lúc gõ). Hai chỗ mà hai công thức là mời sai lệch. */
/* r.inn là TỔNG mọi loại phiếu đã duyệt: gồm cả điều chỉnh và cả phiếu xuất (lưu số âm).
   Nhập THẬT là phần còn lại: trừ dc ra, và cộng lại phần xuất vì nó đang nằm trong inn với dấu âm.
   Nhãn "Nhập" phải nói đúng lượng thép VỀ bãi; không trừ thì một ngày có phiếu xuất sẽ hiện
   "+ Nhập −1.100", còn phép tính thì không cộng ra đúng số đã dùng bên cạnh. */
/* Còn trừ phần VAY MƯỢN (phiếu kho kind 'vay'): thép đi vay về không phải thép mua về, thép cho
   mượn đi cũng không phải thép dùng. Nó nằm trong inn nên tồn đúng; nhãn "Nhập" thì không được gồm. */
const nhapThatOf = (r) => r.inn - (r.dc || 0) + (r.xuat || 0) - (r.vay || 0);
const dcSauText = (qty, dangCo, dir, p, phiId) => {
  if (!qty) return `${phiId}: đang có ${fmtQs(dangCo, p)}`;
  const sau = dangCo + (dir === 'tang' ? qty : -qty);
  return `${phiId}: ${fmtQs(dangCo, p)} → ${fmtQs(sau, p)}`
    + (sau < 0 ? ' — quá số đang có, phiếu sẽ bị từ chối' : '');
};
/* Còn lấy ra được bao nhiêu ở một ô = thép đang có TRỪ phần các phiếu rút thép (chuyển đi, xuất,
   điều chỉnh giảm) ĐANG CHỜ DUYỆT. Server chặn theo đúng con số này (stockOf): phiếu chờ duyệt đã
   giữ phần thép đó, nên hai phiếu không cùng rút một lô. Hiện tonOf trần thì màn hình nói "còn đủ"
   rồi lưu lại bị từ chối. */
const choRut = (k, p) => (S.boot.receipts || []).reduce((a, r) => a + (!r.duyet_day && !r.voided && r.khu_id === k && r.phi_id === p && r.qty < 0 ? -r.qty : 0), 0);
const conLay = (k, p) => tonOf(k, p) - choRut(k, p);
// tổng sẽ rút của phi đang chọn: các dòng đã thêm vào phiếu + số đang gõ dở
const nhapRut = (N) => (N.lines || []).reduce((a, l) => a + (l.phi === N.phi ? l.qty : 0), 0) + N.qty * uStepOf(N.phi);
const kName = (id) => (S.boot.khuBy[id] ? S.boot.khuBy[id].name : id);
/* Nhãn lý do điều chỉnh do server gửi xuống (boot.dcReasons), nên mã lý do chỉ có MỘT nguồn và
   hai bên không bao giờ lệch nhau. Danh sách dự phòng là cho bản app còn trong cache của máy cũ:
   thiếu nó thì bước "Lý do" hiện ra trống và không ai lưu được phiếu nào. */
const reasons0 = (b) => ((b.dcReasons || []).length ? b.dcReasons
  : [{ id: 'dem_sai', name: 'Đếm sai kỳ trước' }, { id: 'ghi_nham', name: 'Ghi nhầm phiếu' }, { id: 'hao_hut', name: 'Hao hụt / mất' }, { id: 'khac', name: 'Lý do khác' }]);
/* Gom các dòng cùng phiếu (grp) để hiện và hoàn tác cả phiếu.
   Phiếu ĐIỀU CHỈNH là loại đầu tiên có thể CHỈ GỒM DÒNG ÂM (giảm tồn), nên chỗ này không được
   giả định "phiếu luôn có ít nhất một dòng dương" nữa. Bản cũ lọc pos = qty > 0 rồi đọc
   pos[0].khu_id: với phiếu giảm thì pos rỗng, tiêu đề thành "Nhập vào …", phần mô tả rỗng và
   khối lượng ra 0 — phiếu hiện ra trống trơn, không ai biết nó là gì. */
function receiptGroups(list) {
  const by = {}, order = [];
  list.forEach((r) => { const g = r.grp || 'id' + r.id; if (!by[g]) { by[g] = []; order.push(g); } by[g].push(r); });
  return order.map((g) => {
    const rows = by[g], r0 = rows[0];
    const chuyen = r0.kind === 'chuyen';
    const dc = r0.kind === 'dc';
    const xuat = r0.kind === 'xuat';
    const vay = r0.kind === 'vay'; // phiếu kho của sổ vay mượn: một dòng có dấu mỗi phi, như điều chỉnh
    /* Dòng dùng để mô tả phiếu: chuyển khu lấy nửa dương (nửa âm là cùng lô thép, kể hai lần là
       nhân đôi khối lượng), còn điều chỉnh thì lấy ĐÚNG các dòng của nó, cả dấu, vì mỗi dòng là
       một thay đổi riêng và dấu chính là nội dung. */
    const show = dc || xuat || vay ? rows : rows.filter((r) => r.qty > 0);
    const from = chuyen ? (rows.find((r) => r.qty < 0) || {}).khu_id : null;
    const kgOf = (r) => r.qty * (S.boot.phiBy[r.phi_id] ? S.boot.phiBy[r.phi_id].kg_per_cay : 0);
    const kg = show.reduce((a, r) => a + kgOf(r), 0);
    const what = show.map((r) => {
      const rp = S.boot.phiBy[r.phi_id];
      // dấu phải hiện rõ: "D20 −40 cây" khác hẳn "D20 40 cây", mà đó là cả nội dung của phiếu
      return `${r.phi_id} ${r.qty < 0 ? '−' : dc || vay ? '+' : ''}${fmtQs(Math.abs(r.qty), rp)}`;
    }).join(' · ');
    const title = chuyen
      ? `Chuyển ${esc(kName(from))} → ${esc(kName((show[0] || {}).khu_id || ''))}`
      : dc ? `Điều chỉnh ${esc(kName(r0.khu_id))}`
      : xuat ? `Xuất từ ${esc(kName(r0.khu_id))}`
      : vay ? `Vay mượn · ${esc(kName(r0.khu_id))}` : `Nhập vào ${esc(kName(r0.khu_id))}`;
    return { id: Math.min(...rows.map((r) => r.id)), r0, chuyen, dc, xuat, vay, title, what, kg, voided: !!r0.voided, duyet_day: r0.duyet_day };
  });
}
function vNhap() {
  const b = S.boot, N = S.nhap;
  // tới được đây bằng nút Back hoặc link cũ: người đếm không lập phiếu (server cũng chặn)
  if (!canIn()) return `${head('Nhập kho', '', 'home')}<div class="pad"><div class="card warn">Chỉ thủ kho và admin lập phiếu nhập, chuyển, xuất và điều chỉnh.</div></div>`;
  if (!b.khuAct.length) return `${head('Nhập kho', '', 'home')}<div class="pad muted">Chưa có khu nào đang dùng. Admin vào Thêm → Cài đặt để thêm khu.</div>`;
  const okKhu = (id) => id && b.khuBy[id] && b.khuBy[id].active;
  if (!okKhu(N.khu)) N.khu = okKhu(S.khu) ? S.khu : b.khuAct[0].id;
  if (!okKhu(N.from)) N.from = b.khuAct[0].id;
  if (!okKhu(N.to) || N.to === N.from) N.to = (b.khuAct.find((k) => k.id !== N.from) || {}).id || null;
  if (!b.phiAct.length) return `${head('Nhập kho', '', 'home')}<div class="pad muted">Chưa có phi thép nào. Admin vào Thêm → Cài đặt → "Khôi phục phi mặc định".</div>`;
  N.lines = N.lines.filter((l) => b.phiBy[l.phi]);
  if (!b.phiBy[N.phi] || b.phiBy[N.phi].active === 0) N.phi = b.phiAct[0].id;
  const p = b.phiBy[N.phi];
  const uStep = uStepOf(p); // N.qty giữ theo ĐƠN VỊ NGƯỜI DÙNG GÕ (cuộn với D8), đổi sang cây khi thêm dòng
  const chuyen = N.mode === 'chuyen';
  const dc = N.mode === 'dc';
  const xuat = N.mode === 'xuat';
  const khuChips = (sel, f, skip) => `<div class="wrap">${b.khuAct.filter((k) => k.id !== skip).map((k) => `<button class="chip s ${k.id === sel ? 'on' : ''}" data-a="nkhu" data-f="${f}" data-v="${esc(k.id)}">${esc(k.name)}</button>`).join('')}</div>`;
  const lineKg = N.lines.reduce((a, l) => a + l.qty * b.phiBy[l.phi].kg_per_cay, 0);
  const lines = N.lines.length ? `<div class="card" style="padding:0;overflow:hidden">${N.lines.map((l, i) => { const lp = b.phiBy[l.phi]; return `<div class="li"><span><b>${l.phi}</b> · ${fmtQ(l.qty, lp)}</span><button class="btn s bad" data-a="nrm" data-i="${i}">Xóa</button></div>`; }).join('')}<div class="li" style="background:#E8EEF6"><b>${N.lines.length} dòng</b><b>${fmtT(lineKg)} tấn</b></div></div>` : '';
  const groups = receiptGroups(b.receipts);
  const recs = groups.map((g) => {
    const cho = !g.duyet_day;
    /* Phiếu chờ duyệt: người lập rút lại được không giới hạn thời gian, vì nó chưa vào tồn.
       Phiếu đã duyệt: chỉ trong 10 phút kể từ LÚC DUYỆT (lúc nó vào tồn), sau đó nhờ admin.
       Mốc là giờ duyệt chứ không phải giờ nhập: phiếu có thể được duyệt sau hàng giờ, lấy mốc
       nhập thì người lập không bao giờ kịp hoàn tác. */
    const mine = g.r0.user_id === S.me.id;
    const can = isAdmin() || (mine && (cho || Date.now() - g.r0.duyet_ts < 10 * 60e3));
    const ngay = cho
      ? (g.r0.day !== b.today ? ` · nhập ${esc(fmtDay(g.r0.day))}` : '')
      : (g.r0.duyet_day !== g.r0.day ? ` · nhập ${esc(fmtDay(g.r0.day))}, duyệt ${esc(fmtDay(g.r0.duyet_day))}` : '');
    const trangThai = cho
      ? '<span class="badge warn">Chờ duyệt</span>'
      : `<span class="badge ok">Đã duyệt${g.r0.duyet_name ? ' · ' + esc(g.r0.duyet_name) : ''}</span>`;
    const nut = isAdmin() && cho
      ? `<div class="row gap6"><button class="btn s ok" data-a="pduyet" data-id="${g.id}">Duyệt</button><button class="btn s bad" data-a="void" data-id="${g.id}">Từ chối</button></div>`
      : can ? `<button class="btn s bad" data-a="void" data-id="${g.id}">${cho ? 'Rút lại' : 'Huỷ'}</button>`
      // không có nút thì nói vì sao: phiếu của người khác đang chờ duyệt, hay của mình mà đã quá giờ
      : cho ? '<span class="sm muted" style="text-align:right;max-width:92px">chờ admin duyệt</span>'
      : mine ? '<span class="sm muted" style="text-align:right;max-width:92px">quá 10 phút, nhờ admin huỷ</span>'
      : '';
    return `<div class="li"><span><b>${g.title}</b> ${trangThai}<br>${esc(g.what)} · ${fmtT(g.kg)} tấn<br><span class="sm muted">${esc(g.r0.uname)} · ${hhmm(g.r0.ts)}${ngay}${g.r0.note ? ' · ' + esc(g.r0.note) : ''}</span></span>${nut}</div>`;
  }).join('');
  const saveLbl = dc ? 'XÁC NHẬN ĐIỀU CHỈNH' : xuat ? 'GHI PHIẾU XUẤT' : chuyen ? 'XÁC NHẬN CHUYỂN KHU' : 'XÁC NHẬN NHẬP KHO';
  const tieu = dc ? ['Điều chỉnh tồn', 'Sửa sổ khi số trong máy không khớp thực tế']
    : xuat ? ['Xuất kho', 'Ghi thép rời bãi đi đâu — tuỳ bạn, không bắt buộc']
    : chuyen ? ['Chuyển khu', 'Dời thép giữa các khu, tổng bãi không đổi']
    : ['Nhập kho', 'Ghi phiếu thép mới về'];
  /* Số bước đánh lại theo chế độ. Điều chỉnh có thêm bước "tăng hay giảm" ngay sau khu và trước
     khi chọn phi: chiều là thứ dễ bấm sai nhất, mà bấm sai thì lệch gấp đôi lượng điều chỉnh —
     nên nó đứng riêng một bước có chữ giải thích, không nhét vào cùng chỗ gõ số. */
  const stepDc = dc ? 1 : 0;
  // đang có bao nhiêu ở đúng ô này: con số người lập phiếu cần để biết mình sửa TỪ ĐÂU về đâu
  /* Giảm và xuất thì mốc là "còn lấy được" (đã trừ phiếu rút khác đang chờ); điều chỉnh TĂNG
     không rút gì nên mốc là thép đang có, và không có gì để trừ. */
  const tang = dc && N.dir === 'tang';
  const dangCo = dc || xuat ? (tang ? tonOf(N.khu, N.phi) : conLay(N.khu, N.phi)) : 0;
  const giu = (dc || xuat) && !tang ? choRut(N.khu, N.phi) : 0;
  const sau = dangCo + (N.dir === 'tang' ? 1 : -1) * N.qty * uStep;
  // tổng khối lượng cả phiếu, gồm cả số đang gõ dở, vì nút lưu cũng tính số đó vào phiếu
  const dcKg = Math.abs(N.lines.reduce((a, l) => a + l.qty * b.phiBy[l.phi].kg_per_cay, 0) + N.qty * uStep * p.kg_per_cay);
  const bigKg = LIM('dcBigKg', 20000);
  const dcWord = (b.limits && b.limits.dcWord) || 'DONG Y';
  const reasons = reasons0(b);
  return `${head(tieu[0], tieu[1], 'home')}
  <div class="f1 scroll pad col gap12" id="body">
    <div class="row gap6"><button class="chip s f1 ${N.mode === 'nhap' ? 'on' : ''}" data-a="nmode" data-v="nhap">Nhập thép về</button><button class="chip s f1 ${chuyen ? 'on' : ''}" data-a="nmode" data-v="chuyen">Chuyển khu</button><button class="chip s f1 ${xuat ? 'on' : ''}" data-a="nmode" data-v="xuat">Xuất kho</button><button class="chip s f1 ${dc ? 'on' : ''}" data-a="nmode" data-v="dc">Điều chỉnh</button></div>
    <button class="sm" style="border:0;background:transparent;color:var(--pri);text-align:left;padding:2px 0;text-decoration:underline" data-a="nav" data-s="vaymuon">Cho đối tác mượn hoặc đi vay thép? Ghi ở Vay mượn ngoài bãi →</button>
    ${N.done ? `<div class="card warn col gap8"><b style="font-size:18px">Đã lưu phiếu · chờ admin duyệt</b><span style="font-size:17px">${esc(N.done.text)}</span><span class="sm" style="line-height:1.4">Phiếu chỉ tính vào tồn sau khi admin duyệt. Chứng từ ghi cả ngày nhập và ngày duyệt.</span><button class="btn s full" data-a="void" data-id="${N.done.id}">RÚT LẠI CẢ PHIẾU</button></div>` : ''}
    ${xuat ? `<div class="card col gap6" style="border:2px solid var(--pri)"><b style="font-size:17px">Ghi phiếu xuất là <i>tuỳ bạn</i>, không bắt buộc</b><span class="sm" style="line-height:1.45">Không ghi thì app vẫn tính lượng dùng như cũ. Ghi được bao nhiêu thì phần <b>không rõ</b> co lại bấy nhiêu — và chính phần không rõ mới là con số đáng đi hỏi. Phiếu phải được admin duyệt mới tính vào sổ.</span></div>` : ''}
    ${dc ? `<div class="card bad col gap6"><b style="font-size:17px">Việc này SỬA SỔ, không phải ghi thép ra vào</b><span class="sm" style="line-height:1.45">Chỉ dùng khi số trong máy sai mà không phiếu nào giải thích được. Thép thật đi hay về thì dùng <b>Nhập thép về</b> hoặc <b>Chuyển khu</b>; thép dùng hết thì để khu đếm xuống, đừng điều chỉnh. Phiếu phải được admin duyệt mới vào tồn, và lý do nằm trong nhật ký mãi mãi.</span></div>` : ''}
    ${chuyen
      ? `<div class="col gap8"><b style="font-size:18px">1. Từ khu</b>${khuChips(N.from, 'from')}</div><div class="col gap8"><b style="font-size:18px">2. Sang khu</b>${khuChips(N.to, 'to', N.from)}</div>`
      : `<div class="col gap8"><b style="font-size:18px">1. ${dc ? 'Sửa tồn của khu' : xuat ? 'Lấy thép từ khu' : 'Để vào khu'}</b>${khuChips(N.khu, 'khu')}</div>`}
    ${xuat ? `<div class="col gap8"><b style="font-size:18px">2. Xuất cho ai / công trình nào</b>
      <input class="inp s" id="nnoi" maxlength="120" placeholder="Ví dụ: Công trình Nam Hà, tổ 3" data-model="nnoi" value="${esc(S.form.nnoi || '')}">
      <span class="sm muted" style="line-height:1.4">Bắt buộc. Phiếu xuất không nói đi đâu thì không thêm được gì so với con số app đã tự suy ra.</span></div>` : ''}
    ${dc ? `<div class="col gap8"><b style="font-size:18px">2. Tăng hay giảm</b>
      <div class="row gap6"><button class="chip f1 ${N.dir === 'tang' ? 'on' : ''}" data-a="ndir" data-v="tang">Tăng tồn (+)</button><button class="chip f1 ${N.dir === 'giam' ? 'on' : ''}" data-a="ndir" data-v="giam">Giảm tồn (−)</button></div>
      <span class="sm muted">${N.dir === 'tang' ? 'Máy đang ghi THIẾU so với thực tế ngoài bãi.' : 'Máy đang ghi THỪA so với thực tế ngoài bãi.'}</span></div>` : ''}
    <div class="col gap8"><b style="font-size:18px">${chuyen ? 3 : 2 + stepDc + (xuat ? 1 : 0)}. Chọn phi</b><div class="grid4">${b.phiAct.map((x) => `<button class="chip ${x.id === N.phi ? 'on' : ''}" data-a="nphi" data-v="${x.id}">${x.id}</button>`).join('')}</div>
      ${dc || xuat ? `<span class="sm">${esc(kName(N.khu))} ${tang ? 'đang có' : 'còn lấy được'} <b>${fmtQs(dangCo, p)}</b> ${N.phi}${giu ? ` <span class="muted">(đã trừ ${fmtQs(giu, p)} phiếu khác đang chờ duyệt)</span>` : ''}</span>` : ''}</div>
    <div class="col gap8"><b style="font-size:18px">${chuyen ? 4 : 3 + stepDc + (xuat ? 1 : 0)}. Số ${isCuon(p) ? 'cuộn' : 'cây'}${dc ? (N.dir === 'tang' ? ' cộng thêm' : ' bớt đi') : xuat ? ' xuất đi' : ''} ${N.phi}</b>
      <div class="row gap6"><button class="btn s" data-a="nq" data-v="-10">−10</button><button class="btn s" data-a="nq" data-v="-1">−1</button><input class="f1" id="nqty" type="text" inputmode="numeric" pattern="[0-9]*" aria-label="Số ${unitLbl(p)} ${N.phi}" placeholder="0" value="${N.qty || ''}" style="min-width:0;width:100%;height:60px;border-radius:14px;border:2px solid #8C8678;background:#fff;text-align:center;font-size:32px;font-weight:700"><button class="btn s pri" data-a="nq" data-v="1">+1</button><button class="btn s pri" data-a="nq" data-v="10">+10</button></div>
      <span class="muted" id="nkg">${nkgText(N.qty * uStep, p)}</span>
      ${dc || xuat ? `<span class="sm b" id="ndcsau">${dcSauText(dc ? N.qty * uStep : nhapRut(N), dangCo, xuat ? 'giam' : N.dir, p, N.phi)}</span>` : ''}
      <div class="row gap6">${isCuon(p) ? '' : `<button class="btn s f1" data-a="nq" data-v="bo">+1 bó (${p.bo_size})</button>`}<button class="btn s f1" data-a="nadd">+ Thêm phi khác</button></div></div>
    ${lines}
    ${dc ? `<div class="col gap8"><b style="font-size:18px">${4 + stepDc}. Lý do</b>
      <div class="wrap">${reasons.map((r) => `<button class="chip s ${N.reason === r.id ? 'on' : ''}" data-a="nreason" data-v="${esc(r.id)}">${esc(r.name)}</button>`).join('')}</div></div>` : ''}
    <input class="inp s" id="nnote" maxlength="200" placeholder="${dc ? (N.reason === 'khac' ? 'Ghi rõ lý do (bắt buộc)…' : 'Ghi chú thêm (không bắt buộc)…') : 'Ghi chú: số phiếu, biển số xe…'}" data-model="nnote" value="${esc(S.form.nnote || '')}">
    ${dc && dcKg > bigKg ? `<div class="card bad col gap6"><b>Điều chỉnh ${fmtT(dcKg)} tấn — rất lớn</b><span class="sm">Gõ đúng <b>${esc(dcWord)}</b> rồi mới lưu được.</span><input class="inp s" id="ndcword" maxlength="20" placeholder="${esc(dcWord)}" data-model="ndcword" value="${esc(S.form.ndcword || '')}" autocapitalize="characters"></div>` : ''}
    <button class="btn pri full" style="min-height:60px;font-size:20px" data-a="nconfirm">${saveLbl}</button>
    ${recs ? `<h2 class="sec">Phiếu hôm nay</h2><div class="card" style="padding:0;overflow:hidden">${recs}</div>` : ''}
  </div>`;
}

/* --- Tồn bãi --- */
// số ngày còn đủ dùng = tồn / lượng dùng trung bình mỗi ngày (28 ngày gần nhất, tính khi chốt ngày)
// Dưới ngần này ngày dữ liệu thì mức dùng trung bình chưa đáng tin: thà không dự báo còn hơn dự báo sai.
// Ngưỡng do server gửi trong /bootstrap (boot.limits) nên Duyệt và Tồn bãi không thể lệch nhau.
const minRateDays = () => LIM('rateDays', 5);
function daysLeft(phi, v) {
  const r = S.boot.rate[phi];
  return r > 0 && (S.boot.rateDays[phi] || 0) >= minRateDays() ? v / r : null;
}
const rateReady = (phi) => (S.boot.rateDays[phi] || 0) >= minRateDays();
const daysTxt = (d) => (d < 1 ? 'dưới 1 ngày' : '~' + Math.floor(d) + ' ngày');
function vTon() {
  const b = S.boot, T = totals();
  const rows = b.phiAct.map((p) => {
    const v = T.perPhi[p.id], low = v < p.min_stock, open = S.expand[p.id];
    const dl = daysLeft(p.id, v), short = dl !== null && dl < 3;
    const rateDisp = !b.rate[p.id] ? null
      : !rateReady(p.id) ? `chưa đủ dữ liệu (${b.rateDays[p.id] || 0}/${minRateDays()} ngày)`
      : isCuon(p) ? `${fmtDec(b.rate[p.id] / p.bo_size)} cuộn/ngày` : `${fmtInt(b.rate[p.id])} cây/ngày`;
    const det = open ? `<div class="card" style="margin:-4px 0 4px;border-radius:0 0 16px 16px">${b.khu.map((k) => { const x = tonOf(k.id, p.id); return x ? `<div class="li"><span>${esc(k.name)}${k.active ? '' : ' (ẩn)'}</span><span class="col" style="align-items:flex-end"><b>${qMain(x, p)}</b><span class="sm muted">${qSub(x, p)}</span></span></div>` : ''; }).join('') || '<div class="muted">Không có ở khu nào</div>'}${rateDisp ? `<div class="li"><span class="sm muted">Dùng trung bình</span><span class="sm">${rateDisp}</span></div>` : ''}</div>` : '';
    // số lớn bên phải và mức báo động ở dòng phụ phải cùng đơn vị mới so được
    const [curTxt, minTxt] = qPair(v, p.min_stock, p);
    /* Không khẳng định "Đủ dùng" khi chính app nói chưa đủ dữ liệu để dự báo: mở chi tiết ra
       thấy "chưa đủ dữ liệu (2/5 ngày)" ngay bên dưới thì câu "Đủ dùng" thành vô căn cứ. */
    const sub = low ? 'Dưới mức báo động (' + minTxt + ')' + (dl !== null ? ' · còn ' + daysTxt(dl) : '')
      : dl !== null ? 'Còn đủ dùng ' + daysTxt(dl)
      : !b.rate[p.id] ? 'Chưa có số liệu dùng' : 'Chưa đủ dữ liệu để dự báo';
    return `<button class="tonrow ${low ? 'low' : ''}" data-a="expand" data-p="${p.id}"><span class="col" style="gap:2px"><b style="font-size:24px">${p.id}</b><span class="sm" style="${low ? 'color:var(--bad);font-weight:700' : short ? 'color:var(--warn);font-weight:700' : 'color:#5F6670'}">${sub}</span></span><span class="col" style="align-items:flex-end;text-align:right;min-width:0"><b style="font-size:24px;line-height:1.15;white-space:nowrap">${curTxt}</b><span class="sm muted">${qSub(v, p)}</span></span></button>${det}`;
  }).join('');
  return `${head('Tồn bãi', 'Tồn hiện tại (số đã duyệt)' + (b.lastClosed ? ' · chốt gần nhất ' + fmtDay(b.lastClosed) : ' · chưa chốt ngày nào') + ' · chạm phi để xem từng khu', 'home')}
    <div class="hero tbar" style="margin:4px 16px;border-radius:14px;padding:14px 16px"><div class="row" style="justify-content:space-between;gap:10px;flex-wrap:wrap"><div class="col"><span style="font-size:15px">Tổng toàn bãi</span><span style="font-size:30px;font-weight:700">${fmtT(T.kg)} tấn</span></div><span style="font-size:17px">${cayTxt(T.cay)}</span></div></div>
    <div class="f1 scroll pad col gap8" id="body">${rows}</div>`;
}

/* --- Bảng lần báo của một khu (dùng trong vDuyet) --- */
function renderSubsPanel(khu, R) {
  const subData = S.subs[khu];
  if (subData === undefined) return '';
  if (subData === null) return '<span class="sm muted">Đang tải...</span>';
  if (!subData.length) return '<span class="sm muted">Chưa có lần báo nào.</span>';
  const lastSub = subData[subData.length - 1];
  const phiSet = new Set();
  subData.forEach((s) => Object.keys(s.vals).forEach((p) => phiSet.add(p)));
  const phiList = S.boot.phi.filter((p) => phiSet.has(p.id));
  const rep = R.reports.find((r) => r.khu_id === khu);
  const canPick = !R.closed && subData.length > 1 && !(rep && rep.recount);
  /* Đếm nhiều lần/ngày: lần báo của KHUNG GIỜ KHÁC không phải là phương án thay thế cho số mới nhất —
     buổi chiều khác buổi sáng là vì thép đã dùng, đã về. Nên chỉ đem so (tô màu) và chỉ cho "Dùng"
     những lần báo cùng khung với lần mới nhất; lần của khung trước chỉ để xem lại. */
  const defs = (R.slot && R.slot.n > 1 && R.slot.defs) || [];
  const khungOf = (ts) => {
    if (!defs.length) return 0;
    const h = ((ts + 7 * 3600e3) % 864e5) / 3600e3;
    const d = defs.find((x) => h < x.to);
    return d ? d.i : defs.length - 1;
  };
  const cungKhung = (i) => khungOf(subData[i].ts) === khungOf(lastSub.ts);
  const hdrs = subData.map((s, i) => {
    const cur = i === subData.length - 1;
    const khung = defs.length ? '<br><span style="font-weight:400;font-size:12px">' + esc(defs[khungOf(s.ts)].label.split(' (')[0]) + '</span>' : '';
    return `<th style="text-align:center;${cur ? 'color:var(--pri)' : ''};white-space:nowrap;font-size:13px">${esc(s.uname)}<br><span style="font-weight:400">${hhmm(s.ts)}${cur ? ' ✓' : ''}</span>${khung}</th>`;
  }).join('');
  const bodyRows = phiList.map((p) => {
    const lastV = lastSub.vals[p.id]; // undefined nếu lần cuối là admin-pick chỉ ghi phi thay đổi
    // hasDiff: so với lastV nếu lastV có giá trị; nếu không, so giữa các lần báo trước với nhau
    const hasDiff = lastV !== undefined
      ? subData.some((s, i) => i < subData.length - 1 && cungKhung(i) && s.vals[p.id] !== undefined && s.vals[p.id] !== lastV)
      : (() => { const vs = new Set(subData.slice(0, -1).filter((s, i) => cungKhung(i)).map((s) => s.vals[p.id]).filter((v) => v !== undefined)); return vs.size > 1; })();
    const cells = subData.map((s, i) => {
      const v = s.vals[p.id];
      const diff = lastV !== undefined && i < subData.length - 1 && cungKhung(i) && v !== undefined && v !== lastV;
      return `<td style="text-align:center${diff ? ';color:var(--warn);font-weight:700' : ''}">${v !== undefined ? fmtQs(v, p) : '—'}</td>`;
    }).join('');
    return `<tr${hasDiff ? ' style="background:rgba(255,160,0,0.12)"' : ''}><td><b>${p.id}</b></td>${cells}</tr>`;
  }).join('');
  const footRow = canPick ? `<tr><td></td>${subData.map((s, i) => {
    const cur = i === subData.length - 1;
    return `<td style="text-align:center;padding:6px 4px">${cur ? '<span class="sm muted">đang dùng</span>' : !cungKhung(i) ? '<span class="sm muted">khung trước</span>' : `<button class="btn s" data-a="spick" data-k="${esc(khu)}" data-i="${i}">Dùng</button>`}</td>`;
  }).join('')}</tr>` : '';
  return `<div style="overflow-x:auto;margin-top:6px"><table class="tbl"><thead><tr><th>ɸ</th>${hdrs}</tr></thead><tbody>${bodyRows}</tbody>${footRow ? '<tfoot>' + footRow + '</tfoot>' : ''}</table></div>`;
}

/* Sổ vay mượn chờ duyệt, bày ngay ở màn Duyệt: admin vẫn duyệt mọi thứ ở đây, bắt sang một màn
   khác chỉ để duyệt sổ vay là để nó nằm chờ mãi. Lần ghi có kèm phiếu kho thì server đã bỏ khỏi
   danh sách này, vì phiếu kho đi kèm nằm ở mục Phiếu chờ duyệt và duyệt phiếu là duyệt luôn sổ. */
function loanSec(R) {
  const L = R.loans || [];
  if (!L.length) return '';
  const by = {}, order = [];
  L.forEach((r) => { const g = r.grp || 'id' + r.id; if (!by[g]) { by[g] = []; order.push(g); } by[g].push(r); });
  return `<div class="col gap8"><div class="row" style="justify-content:space-between;align-items:baseline"><span class="sec">Sổ vay mượn chờ duyệt</span><span class="sm muted">không tính vào tồn</span></div>
    ${order.map((g) => {
      const rows = by[g], r0 = rows[0], id = Math.min(...rows.map((r) => r.id));
      return `<div class="card col gap6"><b>${esc(loanTitle(r0.kind, r0.doitac_name || '#' + r0.doitac_id))}</b>
        <span>${esc(rows.map((r) => r.phi_id + ' ' + fmtQs(r.qty, r.phi_id)).join(' · '))}</span>
        <span class="sm muted">${esc(r0.uname)} · ${dmy(r0.ts)}${r0.note ? ' · ' + esc(r0.note) : ''}</span>
        ${R.closed ? '' : `<div class="row gap6"><button class="btn s ok f1" data-a="lduyet" data-id="${id}">DUYỆT</button><button class="btn s bad f1" data-a="lvoid" data-id="${id}">TỪ CHỐI</button></div>`}</div>`;
    }).join('')}</div>`;
}

/* --- Duyệt (admin) --- */
// Nạp lại màn Duyệt, nuốt lỗi mạng để không che mất lỗi gốc khi gọi trong finally.
/* Nạp lại màn Duyệt. Khu nào đổi dấu (báo lại, phiếu mới) thì bỏ luôn bảng so sánh và danh sách lần
   báo đang mở của khu đó: chúng tải từ trước, chọn số trên đó là chọn trên số cũ. */
async function reloadReview() {
  let nv;
  try { nv = await api('GET', '/review'); } catch (e) { return; /* giữ lỗi gốc */ }
  const cu = Object.fromEntries(((S.review && S.review.khus) || []).map((k) => [k.khu, k.mark]));
  (nv.khus || []).forEach((k) => {
    if (cu[k.khu] === undefined || cu[k.khu] === k.mark) return;
    delete S.subs[k.khu];
    if (S.cmp && S.cmp.khu === k.khu) S.cmp = null;
  });
  S.review = nv;
}
const markOf = (khu) => (((S.review && S.review.khus) || []).find((k) => k.khu === khu) || {}).mark || '';

/* Màn Duyệt của bản 1.3 không còn là màn "cảnh báo" mà là màn LÀM VIỆC: với từng khu nó bày số
   dự kiến đặt cạnh số khu báo và phần lệch, rồi để người duyệt quyết định. Lệch to hay nhỏ chỉ
   đổi màu chữ, không đổi việc khu có duyệt được hay không — khu nào đã báo cũng duyệt được,
   riêng từng khu, không liên quan khu khác. */
function vDuyet() {
  const b = S.boot, R = S.review;
  if (!R) return `${head('Duyệt số liệu', '', 'home')}${panelWait('duyet')}`;
  const badRows = R.rows.filter((r) => r.neg || r.high), normal = R.rows.filter((r) => !(r.neg || r.high));
  const kname = (id) => (b.khuBy[id] ? b.khuBy[id].name : id);
  const khus = R.khus || [];
  const phieu = R.phieu || [];
  const phieuBy = Object.fromEntries(phieu.map((v) => [v.key, v]));

  /* --- Phiếu chờ duyệt --- */
  const phieuCard = (v) => {
    const dc = v.kind === 'dc', xuat = v.kind === 'xuat', vay = v.kind === 'vay';
    /* Phiếu điều chỉnh có thể CHỈ GỒM DÒNG ÂM, nên không lọc qty > 0 cho nó: lọc là thẻ hiện ra
       trống, đúng cái thẻ mà admin phải đọc để quyết định có cho sửa tồn hay không. */
    const show = dc || xuat || vay ? v.lines : v.lines.filter((l) => l.qty > 0);
    const from = v.kind === 'chuyen' ? (v.lines.find((l) => l.qty < 0) || {}).khu : null;
    const title = v.kind === 'chuyen'
      ? `Chuyển ${esc(kname(from))} → ${esc(kname((show[0] || {}).khu || ''))}`
      : dc ? `ĐIỀU CHỈNH TỒN ${esc(kname((show[0] || {}).khu || ''))}`
      : xuat ? `Xuất từ ${esc(kname((show[0] || {}).khu || ''))}`
      : vay ? `Vay mượn · ${esc(kname((show[0] || {}).khu || ''))}`
      : `Nhập vào ${esc(kname((show[0] || {}).khu || ''))}`;
    const what = show.map((l) => `${l.phi} ${l.qty < 0 ? '−' : dc || vay ? '+' : ''}${fmtQs(Math.abs(l.qty), b.phiBy[l.phi])}`).join(' · ');
    const kg = show.reduce((a, l) => a + l.qty * (b.phiBy[l.phi] ? b.phiBy[l.phi].kg_per_cay : 0), 0);
    // phiếu lập từ ngày trước mà chưa ai duyệt: nói rõ ngày nhập, vì duyệt hôm nay là nó vào tồn hôm nay
    const cuNgay = v.day !== R.day ? ` · <b style="color:var(--warn)">nhập ${esc(fmtDay(v.day))}</b>` : '';
    /* Điều chỉnh không có thép thật đi kèm, nên admin không đối chiếu được với xe hay với phiếu
       giấy nào: lời nhắc này là chỗ duy nhất nói ra điều đó trước khi bấm duyệt. */
    const canhBao = dc ? '<span class="sm b" style="color:var(--bad);line-height:1.4">Phiếu này SỬA SỔ, không có thép ra vào bãi. Duyệt xong hãy cho khu đếm lại để xác minh.</span>'
      /* Duyệt phiếu xuất là hạ số dự kiến của khu xuống, tức đổi chính cái thước dùng để soi khu đó.
         Nói thắng ra để người duyệt biết mình đang xác nhận thép đã rời bãi, không phải thép về. */
      : xuat ? '<span class="sm b" style="line-height:1.4">Duyệt là lượng này rời bãi: tồn dự kiến của khu hạ xuống đúng bằng đó.</span>'
      // phiếu kho của sổ vay mượn: duyệt bên này là duyệt luôn sổ, và nó không tính là nhập hay dùng
      : vay ? '<span class="sm b" style="line-height:1.4">Phiếu kho của sổ vay mượn: duyệt là duyệt luôn lần ghi sổ. Thép này đổi tồn khu nhưng không tính là nhập, cũng không tính là dùng.</span>' : '';
    return `<div class="card ${dc ? 'bad' : 'warn'} col gap8"><div class="col" style="gap:2px"><b style="font-size:17px">${title}</b>
      <span style="font-size:16px">${esc(what)} · ${fmtT(kg)} tấn</span>
      <span class="sm muted">${esc(v.uname)} · ${hhmm(v.ts)}${cuNgay}${v.note ? ' · ' + esc(v.note) : ''}</span>${canhBao}</div>
      ${R.closed ? '' : `<div class="row gap6"><button class="btn s ok f1" data-a="pduyet" data-id="${v.id}">DUYỆT PHIẾU</button><button class="btn s bad f1" data-a="preject" data-id="${v.id}">TỪ CHỐI</button></div>`}</div>`;
  };
  const phieuSec = !phieu.length ? '' : `<div class="col gap8">
    <div class="row" style="justify-content:space-between;align-items:baseline"><span class="sec">Phiếu chờ duyệt</span><span class="sm b" style="color:var(--warn)">${phieu.length} phiếu chưa vào tồn</span></div>
    <div class="sm muted" style="line-height:1.4">Phiếu chỉ tính vào tồn kể từ ngày được duyệt. Duyệt khu cũng duyệt luôn phiếu của khu đó.</div>
    ${phieu.map(phieuCard).join('')}</div>`;

  /* --- Việc cần xử lý riêng: xung đột hai người báo, và chờ đếm lại --- */
  const items = R.exceptions.filter((e) => e.type === 'conflict' || e.type === 'recount').map((e) => {
    if (e.type === 'recount') return `<div class="card warn col gap8"><b style="font-size:18px">${esc(e.name)} đang chờ đếm lại</b><span class="sm">Đã yêu cầu, chưa có số mới.</span></div>`;
    const r = R.reports.find((x) => x.khu_id === e.khu);
    const C = S.cmp && S.cmp.khu === e.khu ? S.cmp : null;
    let cmp = '';
    if (C && !C.data) cmp = '<span class="sm">Đang tải...</span>';
    else if (C && C.data && C.data.diffs.length) {
      const A = C.data.a, B = C.data.b;
      cmp = `<div class="card" style="padding:0;overflow:hidden;color:var(--ink)"><div class="li sm b"><span style="width:44px">ɸ</span><span class="f1" style="text-align:center">${esc(A.uname)} ${hhmm(A.ts)}</span><span class="f1" style="text-align:center">${esc(B.uname)} ${hhmm(B.ts)}</span></div>${C.data.diffs.map((x) => {
        const pickB = C.pick[x.phi] !== 'a';
        return `<div class="li"><b style="width:44px">${x.phi}</b><button class="chip s f1 ${pickB ? '' : 'on'}" data-a="cpick" data-p="${x.phi}" data-v="a">${x.a == null ? '—' : fmtQs(x.a, x.phi)}</button><button class="chip s f1 ${pickB ? 'on' : ''}" data-a="cpick" data-p="${x.phi}" data-v="b">${x.b == null ? '—' : fmtQs(x.b, x.phi)}</button></div>`;
      }).join('')}</div><span class="sm">Chạm số đúng cho từng phi (đang chọn: ô đậm), rồi lưu. Chọn số xong vẫn phải bấm Duyệt khu.</span>
      <div class="row gap8"><button class="btn s warnb f1" data-a="cresolve" data-k="${esc(e.khu)}">LƯU LỰA CHỌN</button><button class="btn s warnb f1" data-a="recount" data-k="${esc(e.khu)}">ĐẾM LẠI</button></div>`;
    } else if (C && C.data) cmp = '<span class="sm">Không tìm thấy khác biệt trong lịch sử, có thể giữ số báo sau.</span>';
    return `<div class="card warn col gap8"><b style="font-size:18px">${esc(e.name)}: 2 người báo số khác nhau</b><span class="sm">Số đang chờ duyệt là của ${esc(r ? r.uname : '')} (báo sau). Dùng "Xem lần báo" ở thẻ khu để xem chi tiết từng người.</span>
      ${cmp || `<div class="row gap8"><button class="btn s warnb f1" data-a="cview" data-k="${esc(e.khu)}">SO SÁNH 2 SỐ</button><button class="btn s warnb f1" data-a="resolve" data-k="${esc(e.khu)}">DÙNG SỐ BÁO SAU</button></div><button class="btn s warnb full" data-a="recount" data-k="${esc(e.khu)}">YÊU CẦU ĐẾM LẠI</button>`}
      ${C && C.data && !C.data.diffs.length ? `<button class="btn s warnb full" data-a="resolve" data-k="${esc(e.khu)}">DÙNG SỐ BÁO SAU</button>` : ''}</div>`;
  }).join('');

  /* --- Cảnh báo cấp phi: dùng âm / dùng cao bất thường --- */
  const cards = badRows.map((r) => {
    const canRe = r.topKhu && khus.some((k) => k.khu === r.topKhu && k.rep && k.rep.day === R.day);
    const rp = b.phiBy[r.phi];
    const fmtEq = (v) => v === null ? '—' : fmtQe(v, rp);
    const perDayTxt = (x) => (isCuon(rp) ? fmtDec(x / rp.bo_size) + ' cuộn/ngày' : fmtInt(x) + ' cây/ngày');
    const avgDisp = r.avg === null ? '' : perDayTxt(r.avg);
    const peakDisp = r.peak ? perDayTxt(r.peak) : '';
    const topNetDisp = (r.topNet >= 0 ? '+' : '−') + fmtQs(Math.abs(r.topNet), rp);
    return `<div class="card bad col gap8"><div class="row" style="justify-content:space-between"><b style="font-size:24px">${r.phi}</b><span class="badge bad">Bất thường</span></div>
      <div class="eq${r.dc && r.vay ? ' eq6' : r.dc || r.vay ? ' eq5' : ''}"><div><span>Tồn cũ</span><b>${fmtEq(r.old)}</b></div><div><span>+ Nhập</span><b>${fmtEq(nhapThatOf(r))}</b></div>${r.dc ? `<div><span>${r.dc > 0 ? '+' : '−'} Điều chỉnh</span><b>${fmtEq(Math.abs(r.dc))}</b></div>` : ''}${r.vay ? `<div><span>${r.vay > 0 ? '+' : '−'} Vay mượn</span><b>${fmtEq(Math.abs(r.vay))}</b></div>` : ''}<div><span>− Đếm mới</span><b>${fmtEq(r.cnt)}</b></div><div><span>= Đã dùng</span><b style="color:var(--bad)">${fmtEq(r.used)}</b></div></div>
      ${r.xuat ? `<span class="sm" style="line-height:1.4">Trong số đó: <b>${fmtEq(r.xuat)}</b> có phiếu xuất, <b>${fmtEq(r.used - r.xuat)}</b> không rõ đi đâu.</span>` : ''}
      <b style="font-size:16px">${r.neg
        ? 'Đã dùng âm (tồn nhiều hơn tính toán): có thể nhập sót phiếu hoặc đếm sai.'
        : `Dùng cao bất thường: hơn 3 lần mức trung bình${avgDisp ? ' (' + avgDisp + ')' : ''}${peakDisp ? ' và hơn 1,5 lần ngày dùng nhiều nhất (' + peakDisp + ')' : ''}.`}</b>
      ${r.topKhu ? `<span class="sm">Khu biến động lớn nhất: <b>${esc(kname(r.topKhu))}</b> (${topNetDisp})</span>` : ''}
      ${canRe ? `<button class="btn s bad full" data-a="recount" data-k="${esc(r.topKhu)}">YÊU CẦU KHU NÀY ĐẾM LẠI</button>` : ''}</div>`;
  }).join('');

  const pend = R.pending != null ? R.pending : R.exceptions.length;
  const allOk = pend === 0;
  const verdict = allOk
    ? `<div class="card ok col" style="gap:4px"><b style="font-size:19px">Đã duyệt hết</b><span style="font-size:16px;line-height:1.4">Mọi khu đã báo đều đã duyệt và không còn phiếu nào chờ. Sổ hôm nay tự chốt sau 0h; khu nào báo lại số khác sẽ phải duyệt lại.</span></div>`
    : `<div class="card warn col" style="gap:4px"><b style="font-size:19px">Còn ${pend} việc cần xử lý</b><span class="sm" style="line-height:1.4">Duyệt từng khu${khus.filter((k) => k.waiting || k.phieu.length || k.recheck).length > 1 ? ', hoặc "Duyệt tất cả"' : ''}. Sổ hôm nay <b>tự chốt sau 0h</b> theo số đã duyệt: báo cáo chưa duyệt chuyển sang ngày mai chờ duyệt tiếp, việc còn treo được ghi vào nhật ký.</span></div>`;
  const gap = R.span > 1 && !R.closed ? `<div class="card warn col" style="gap:4px"><b>Có ${R.span - 1} ngày chưa tự chốt xong</b><span class="sm" style="line-height:1.4">Lượng dùng dưới đây gộp ${R.span} ngày kể từ ngày chốt ${esc(fmtDay(R.last))}. Cảnh báo "dùng nhiều" đã chia theo số ngày.</span></div>` : '';
  const first = !R.last ? `<div class="card col" style="gap:4px"><b>Ngày đầu tiên</b><span class="sm muted">Chưa có tồn chuẩn cũ. Sau 0h, số đã duyệt hôm nay tự trở thành tồn chuẩn đầu tiên.</span></div>` : '';

  /* --- Thẻ của từng khu: NỘI DUNG NHƯ NHAU dù lệch hay không --- */
  // khu "cần xem lại" cũng cần một lần bấm Duyệt khu, nên tính vào số khu đang chờ
  const nCho = khus.filter((k) => k.waiting || k.phieu.length || k.recheck).length;
  const nDuyet = khus.filter((k) => k.rep && !k.waiting).length;
  const khuHead = nCho
    ? `<span class="sm b" style="color:var(--warn)">${nCho} khu chờ duyệt</span>`
    : nDuyet ? `<span class="sm b" style="color:var(--ok)">${nDuyet} khu đã duyệt</span>` : '<span class="sm muted">chưa có khu nào báo</span>';
  const duyetAll = nCho > 1 && !R.closed ? `<button class="btn s ok full" data-a="khuduyetall">DUYỆT TẤT CẢ ${nCho} KHU</button>` : '';

  const khuSec = `<div class="col gap8"><div class="row" style="justify-content:space-between;align-items:baseline"><span class="sec">Báo cáo theo khu</span>${khuHead}</div>${duyetAll}${khus.map((k) => {
    const subOpen = S.subs[k.khu] !== undefined;
    const cho = k.waiting > 0, choP = k.phieu.length;
    const edge = !k.rep ? 'border:2px solid var(--warn)' : cho || choP ? 'border:2px solid var(--pri)' : k.recheck ? 'border:2px solid var(--warn)'
      : k.slots && k.slots.missing.length && k.items.length ? 'border:2px solid var(--bad)' : '';
    const badge = !k.rep ? '<span class="badge warn">Chưa báo</span>'
      : cho ? '<span class="badge" style="background:var(--pri);color:#fff">Chờ duyệt</span>'
      : choP ? '<span class="badge warn">Còn phiếu chờ</span>'
      // đã duyệt nhưng dự kiến vừa đổi vì phiếu: không được mang nhãn xanh như đã xong
      : k.recheck ? '<span class="badge warn">Cần xem lại</span>'
      // khu trống không bị đòi đếm (server không tính là việc), nên cũng không mang nhãn đỏ
      : k.slots && k.slots.missing.length && k.items.length ? '<span class="badge bad">Thiếu lần đếm</span>'
      : '<span class="badge ok">Đã duyệt</span>';
    // lần báo của ngày trước (quên chốt): phải nói rõ ngày, không thì admin tưởng là số hôm nay
    // báo từ ngày trước (chuyển sang lúc tự chốt, giữ giờ đếm thật): nói rõ ngày đếm
    const ngayDem = k.rep ? vnDayOf(k.rep.ts) : null;
    const cuNgay = k.rep && ngayDem !== R.day ? ` · <b style="color:var(--warn)">báo ngày ${esc(fmtDay(ngayDem))}</b>` : '';
    const who = k.rep
      ? esc(k.rep.uname) + ' · ' + hhmm(k.rep.ts) + cuNgay + (k.rep.recount ? ' · <b style="color:var(--warn)">chờ đếm lại</b>' : '')
      : 'Chưa có ai báo kể từ lần chốt trước';
    const duyetLine = k.duyet ? `<span class="sm" style="color:var(--ok)">Đã duyệt · ${esc(k.duyet.by || '')} · ${hhmm(k.duyet.ts)}</span>` : '';

    /* Bảng dự kiến / báo / lệch. Đây là thứ thay cho hai loại cảnh báo khu_up và khu_down:
       cùng một bảng cho mọi khu, lệch lớn chỉ khác màu. */
    const row = (x) => {
      const p = b.phiBy[x.phi];
      if (!p) return '';
      const col = x.d > 0 ? 'var(--bad)' : 'var(--warn)';
      const dTxt = x.d === null ? '—' : x.d === 0 ? '0' : (x.d > 0 ? '+' : '−') + fmtQe(Math.abs(x.d), p);
      const cnTxt = x.cnt === null ? '<span class="muted">chưa báo</span>' : fmtQe(x.cnt, p);
      const blank = x.blank ? ' <b style="color:var(--bad)">để trống</b>' : '';
      return `<div class="li" style="gap:6px"><b style="width:46px">${x.phi}</b>
        <span class="sm" style="flex:1">${fmtQe(x.exp, p)} → <b>${cnTxt}</b>${blank}</span>
        <b class="sm" style="color:${x.d ? col : 'var(--ink)'};white-space:nowrap;${x.big ? 'font-size:15px' : ''}">${dTxt}</b></div>`;
    };
    const lech = k.items.filter((x) => x.d || x.cnt === null);
    const khop = k.items.length - lech.length;
    const bang = !k.items.length ? '<span class="sm muted">Khu không có thép, không có gì để đối chiếu.</span>'
      : `<div class="card" style="padding:0;overflow:hidden;margin:4px 0"><div class="li sm b" style="background:#E8EEF6"><span style="width:46px">ɸ</span><span class="f1">Dự kiến → Khu báo</span><span>Lệch</span></div>${(lech.length ? lech : k.items).map(row).join('')}</div>`
      + (lech.length && khop ? `<span class="sm muted">${khop} phi còn lại khớp dự kiến.</span>` : '');

    const choPhieu = !choP ? '' : `<div class="sm b" style="color:var(--warn)">Còn ${choP} phiếu chờ duyệt của khu này: ${k.phieu.map((g) => {
      const v = phieuBy[g];
      if (!v) return '';
      // chuyển khu: chỉ kể dòng của CHÍNH khu này (bên đi âm, bên đến dương); xuất/điều chỉnh: đủ dấu
      const ls = v.lines.filter((l) => l.khu === k.khu);
      return esc(ls.map((l) => l.phi + ' ' + (l.qty < 0 ? '−' : '+') + fmtQs(Math.abs(l.qty), b.phiBy[l.phi])).join(', '));
    }).filter(Boolean).join(' · ')}. Bấm Duyệt khu là duyệt luôn.</div>`;
    const blankWarn = k.blank ? `<div class="sm b" style="color:var(--bad)">${k.blank} phi được để trống trong khi đang có thép — xem lại trước khi duyệt.</div>` : '';
    /* recheck thay cho cảnh báo "nhập muộn" cũ, và quan trọng là GỠ ĐƯỢC: duyệt lại khu là hết.
       Bản cũ không có đường nào xoá nó, ngày đó bắt buộc chốt kèm ghi chú. */
    /* Khung giờ đếm (khi admin bắt đếm nhiều lần/ngày). Thiếu khung thì nói luôn cách gỡ duy nhất:
       lần đếm sau không bù được, nên phải ghi lý do lúc chốt. Báo cáo tới muộn (mất mạng rồi gửi
       lại) thì khung tính theo lúc máy khai là đã đếm — bày cả hai giờ ra cho người duyệt soi. */
    const sl = k.rep && k.slots ? k.slots : null;
    const sDefs = (R.slot && R.slot.defs) || [];
    // mỗi khung một dòng ✓/✗ — thay cho câu "Lần đếm hôm nay…" và đoạn giải thích chữ đỏ
    const slotLine = !sl ? '' : slotBang(sDefs, sl.done, k.items.length ? sl.missing : [], sl.gio);
    const slotWarn = '';
    const slotLate = sl && sl.late.length ? `<div class="sm" style="color:var(--warn)">Gửi muộn: đếm ${sl.late.map((x) => hhmm(x.at) + ', tới ' + hhmm(x.ts)).join('; ')}</div>` : '';
    const recheck = k.recheck ? `<div class="sm b" style="color:var(--warn);line-height:1.4">Có phiếu được duyệt SAU khi số của khu đã duyệt, nên số dự kiến vừa đổi. Xem bảng trên rồi duyệt lại khu, hoặc yêu cầu đếm lại.</div>` : '';

    const btns = R.closed ? '' : `<div class="row gap6">${cho || choP
      ? `<button class="btn s ok f1" data-a="khuduyet" data-k="${esc(k.khu)}">DUYỆT ${esc(cut(k.name, 14).toUpperCase())}</button>`
      : k.recheck ? `<button class="btn s ok f1" data-a="khuduyet" data-k="${esc(k.khu)}">DUYỆT LẠI</button>` : ''}
      ${k.rep && k.rep.day === R.day ? `<button class="btn s bad f1" data-a="recount" data-k="${esc(k.khu)}">Yêu cầu đếm lại</button>` : ''}</div>`;

    return `<div class="card col gap6" style="${edge}"><div class="row" style="justify-content:space-between;gap:8px;flex-wrap:wrap">
      <div class="col" style="gap:2px"><div class="row gap6" style="align-items:center"><b style="font-size:16px">${esc(k.name)}</b>${badge}</div><span class="sm muted">${who}</span>${duyetLine}</div>
      ${k.rep ? `<button class="btn s" data-a="svload" data-k="${esc(k.khu)}">${subOpen ? 'Ẩn' : 'Xem lần báo'}</button>` : ''}
    </div>${slotLine}${k.rep ? bang : '<span class="sm">Hãy nhắc người phụ trách, hoặc tự báo cáo khu này ở tab Báo cáo.</span>'}${slotWarn}${slotLate}${blankWarn}${recheck}${choPhieu}${btns}${renderSubsPanel(k.khu, R)}</div>`;
  }).join('')}</div>`;

  /* Phép tính phải CÒN ĐÚNG VỀ SỐ HỌC mà nhãn vẫn nói thật: r.inn là TỔNG (gồm điều chỉnh), nên
     không được in nguyên nó dưới chữ "Nhập". Tách thành hai hạng: nhập thật (inn − dc) và phần
     điều chỉnh, chỉ hiện hạng thứ hai khi nó khác 0 — phi nào không bị sửa sổ thì dòng vẫn gọn
     như trước. */
  const eqTxt = (r, fE) => {
    const nhapThat = nhapThatOf(r);
    const dcTxt = r.dc ? ` ${r.dc > 0 ? '+' : '−'} ${fE(Math.abs(r.dc))}(đc)` : '';
    // phần có phiếu xuất KHÔNG nằm trong phép tính — nó chỉ tách con số "đã dùng" thành hai phần
    const xTxt = r.xuat ? ` (có phiếu ${fE(r.xuat)})` : '';
    const vayTxt = r.vay ? ` ${r.vay > 0 ? '+' : '−'} ${fE(Math.abs(r.vay))}(vay)` : '';
    return fE(r.old) + ' + ' + fE(nhapThat) + dcTxt + vayTxt + ' − ' + fE(r.cnt) + ' = ' + fE(r.used) + xTxt;
  };
  const normalHtml = S.showNormal ? `<div class="card" style="padding:0;overflow:hidden">${normal.map((r) => { const np = b.phiBy[r.phi]; const fE = (v) => fmtQe(v, np); return `<div class="li"><b>${r.phi}</b><span class="sm">${R.last ? eqTxt(r, fE) : 'đếm ' + fE(r.cnt)}</span></div>`; }).join('')}</div>` : '';
  return `${head('Duyệt ngày ' + b.today.split('-').reverse().slice(0, 2).join('/'), 'Duyệt theo từng khu' + (R.slot && R.slot.n > 1 ? ' · mỗi khu đếm ' + R.slot.n + ' lần/ngày' : ''), 'home')}
  <div class="f1 scroll pad col gap12" id="body">
    ${R.closed ? (b.closedReset ? '<div class="card ok"><b>Hôm nay vừa đặt lại số liệu.</b> Tồn cả bãi về 0, ngày này đã khoá. Ngày mai các khu báo số như thường.</div>' : '<div class="card ok"><b>Sổ hôm nay đã chốt.</b> Ngày mai các khu báo số như thường.</div>') : verdict}
    ${R.closed && b.closedReset ? `<div class="card col gap6"><b>Đặt lại nhầm?</b><input class="inp s" id="reopenNote" placeholder="Lý do hoàn tác (bắt buộc)" data-model="reopenNote" value="${esc(S.form.reopenNote || '')}"><button class="btn s bad full" data-a="reopen">HOÀN TÁC ĐẶT LẠI SỐ LIỆU</button></div>` : ''}
    ${R.slot && R.slot.changed ? `<div class="card warn col" style="gap:4px"><b>Khung giờ đếm vừa đổi hôm nay lúc ${hhmm(R.slot.changed.at)}${R.slot.changed.by ? ' (' + esc(R.slot.changed.by) + ')' : ''}</b><span class="sm" style="line-height:1.4">Các lần đếm hôm nay đã được xếp lại theo khung mới, nên việc "thiếu lần đếm" có thể khác lúc trước khi đổi.</span></div>` : ''}
    ${gap}${first}${phieuSec}${loanSec(R)}${items}${cards}
    ${khuSec}
    <button class="card b" style="text-align:left;min-height:52px;font-size:16px;border:2px solid #B9B4A8" data-a="toggle-normal">${normal.length} phi bình thường · ${S.showNormal ? 'bấm để ẩn' : 'bấm để xem'}</button>${normalHtml}
  </div>`;
}

/* --- Xem lại ngày cũ --- */
const ydayOf = (d) => new Date(Date.parse(d) - 864e5).toISOString().slice(0, 10);
function vLichSu() {
  const b = S.boot, H = S.hist, D = H.data;
  const top = `${head('Xem lại ngày cũ', 'Số liệu tồn, nhập, dùng của một ngày', 'more')}
    <div class="row gap8 tbar" style="padding:4px 16px"><input class="inp s f1" type="date" id="hdate" max="${b.today}" value="${H.date}" data-change="hdate"><button class="btn s" data-a="hprev">‹ Trước</button><button class="btn s ${H.date >= b.today ? 'dis' : ''}" data-a="hnext" ${H.date >= b.today ? 'disabled' : ''}>Sau ›</button></div>`;
  if (!D) return `${top}${panelWait('lichsu')}`;
  const key = (r) => r.khu_id + '|' + r.phi_id;
  const cm = {}, bm = {}, pm = {}, mm = {};
  D.counts.forEach((r) => (cm[key(r)] = r.v));
  D.baseline.forEach((r) => (bm[key(r)] = r.v));
  D.prevBaseline.forEach((r) => (pm[key(r)] = r.v));
  (D.mvNew || []).forEach((r) => (mm[key(r)] = r.q));
  const closed = !!D.close;
  /* Ngày ĐÃ CHỐT: tồn chuẩn là số chính thức, dùng thẳng.
     Ngày CHƯA chốt (xem lại chính hôm nay): phải cộng thêm thép đã duyệt mà khu chưa kịp đếm,
     đúng như Tồn bãi và Tổng quan đang tính — không thì hai màn hình của cùng một app nói hai
     con số khác nhau về cùng một ngày. */
  const val = (k, p) => {
    const x = k + '|' + p;
    return closed ? bm[x] || 0 : (cm[x] !== undefined ? cm[x] : pm[x] || 0) + (mm[x] || 0);
  };
  const sum = Object.fromEntries(D.summary.map((r) => [r.phi_id, r]));
  let totKg = 0, totIn = 0, totUse = 0, totDc = 0, totX = 0, totVay = 0;
  const rows = b.phiAct.map((p) => {
    let v = 0;
    b.khu.forEach((k) => (v += val(k.id, p.id)));
    const s = sum[p.id];
    // ngày đã chốt: kg/cây LÚC CHỐT (s.kg), để sửa kg/cây sau này không đổi số tấn của ngày đã khoá
    const kgP = closed && s && s.kg != null ? s.kg : p.kg_per_cay;
    totKg += v * kgP;
    if (s) { totIn += s.nhap * kgP; totUse += (s.dung || 0) * kgP; totDc += (s.dc || 0) * kgP; totX += (s.xuat || 0) * kgP; totVay += (s.vay || 0) * kgP; }
    const open = S.expand['h' + p.id];
    const det = open ? b.khu.map((k) => { const x = val(k.id, p.id); return x ? `<div class="li" style="padding-left:28px"><span class="sm">${esc(k.name)}</span><span class="sm">${fmtQs(x, p)}</span></div>` : ''; }).join('') : '';
    /* Phi không có dòng tổng hợp (ngày cũ trước khi có bảng daily_summary) trước đây mất hẳn
       đoạn "· nhập · dùng", nên dòng đó trông như bị cắt chứ không như "không có số liệu".
       Giữ cùng một cấu trúc cho mọi dòng, chỗ nào không biết thì ghi "—". */
    const nDisp = s ? fmtQs(s.nhap, p) : '—';
    const dDisp = s && s.dung != null ? fmtQs(s.dung, p) : '—';
    return `<button class="li" style="width:100%;background:#fff;border:0;border-bottom:1px solid var(--line);text-align:left" data-a="expand" data-p="h${p.id}"><b style="width:44px">${p.id}</b><span class="sm" style="flex:1;text-align:right">${fmtQs(v, p)} · nhập ${nDisp} · dùng ${dDisp}</span></button>${det}`;
  }).join('');
  const reps = D.reports.map((r) => `${esc(kName(r.khu_id))}: ${esc(r.uname)} ${hhmm(r.ts)}`).join(' · ');
  const groups = receiptGroups(D.receipts.slice().reverse());
  const recs = groups.map((g) => `<div class="li" style="${g.voided ? 'opacity:.55;text-decoration:line-through' : ''}"><span><b>${g.title}</b>${g.voided ? ' (đã hủy)' : ''}<br>${esc(g.what)} · ${fmtT(g.kg)} tấn<br><span class="sm muted">${esc(g.r0.uname)} · ${hhmm(g.r0.ts)}${g.r0.note ? ' · ' + esc(g.r0.note) : ''}</span></span></div>`).join('');
  const status = closed
    ? `<div class="card ok col" style="gap:4px"><b>Đã chốt${D.close.uname ? ' bởi ' + esc(D.close.uname) : ' tự động'} lúc ${dmy(D.close.ts)}</b>${D.close.span > 1 ? `<span class="sm">Gộp ${D.close.span} ngày (các ngày trước đó chưa chốt)</span>` : ''}${D.close.note ? `<span class="sm">Ghi chú: ${esc(D.close.note)}</span>` : ''}${treoTxt(D.close.exc_json)}</div>`
    : `<div class="card warn col" style="gap:4px"><b>Ngày này chưa chốt</b><span class="sm">Số tồn lấy theo báo cáo đếm trong ngày; khu không báo tạm lấy tồn chuẩn trước đó.</span></div>`;
  return `${top}<div class="f1 scroll pad col gap12" id="body">
    ${status}
    <div class="hero" style="border-radius:14px;padding:14px 16px"><div class="row" style="justify-content:space-between"><div class="col"><span style="font-size:15px">Tồn cuối ngày ${esc(fmtDay(D.day))}</span><span style="font-size:28px;font-weight:700">${fmtT(totKg)} tấn</span></div>${closed ? `<div class="col" style="align-items:flex-end;font-size:15px"><span>Nhập ${fmtT(totIn)} tấn</span>${totDc ? `<span>Điều chỉnh ${totDc > 0 ? '+' : '−'}${fmtT(Math.abs(totDc))} tấn</span>` : ''}${totVay ? `<span>Vay mượn ${totVay > 0 ? '+' : '−'}${fmtT(Math.abs(totVay))} tấn</span>` : ''}<span>Dùng ${fmtT(totUse)} tấn</span>${totX ? `<span class="sm">trong đó ${fmtT(totX)} tấn có phiếu xuất</span>` : ''}</div>` : ''}</div></div>
    <h2 class="sec">Theo đường kính (chạm để xem từng khu)</h2>
    <div class="card" style="padding:0;overflow:hidden">${rows}</div>
    <h2 class="sec">Người báo</h2><div class="sm">${reps || '<span class="muted">Không có báo cáo đếm</span>'}</div>
    <h2 class="sec">Phiếu nhập / chuyển / xuất / điều chỉnh / vay mượn</h2>${recs ? `<div class="card" style="padding:0;overflow:hidden">${recs}</div>` : '<div class="muted">Không có phiếu</div>'}
  </div>`;
}
/* Những việc còn treo LÚC CHỐT (day_close.exc_json): khu chưa báo, khu thiếu lần đếm, hai người báo
   khác số... Ngày chốt kèm lý do thì xem lại phải biết lý do đó là cho việc gì. Nhãn khung giờ lưu
   sẵn trong exc_json lúc chốt, nên đổi giờ làm sau này không làm sai câu này. */
function treoTxt(json) {
  let ex = [];
  try { ex = JSON.parse(json || '[]'); } catch (e) { ex = []; }
  const kn = (id) => kName(id);
  const t = ex.map((e) => (e.type === 'khu_missing' ? `${kn(e.khu)} chưa báo`
    : e.type === 'slot_missing' ? `${kn(e.khu)} thiếu lần đếm ${(e.missing || []).join(', ')}`
    : e.type === 'conflict' ? `${kn(e.khu)}: hai người báo khác số`
    : e.type === 'recount' ? `${kn(e.khu)} đang chờ đếm lại`
    : e.type === 'late' ? `${kn(e.khu)} gửi báo cáo sau chốt chưa được nhận`
    : e.type === 'khu_pending' ? `${kn(e.khu)} còn báo cáo chưa duyệt`
    : e.type === 'recheck' ? `${kn(e.khu)} cần xem lại`
    : e.type === 'receipt_pending' ? 'phiếu chờ duyệt'
    : e.type === 'phi' ? `${e.phi} ${e.reason === 'neg' ? 'dùng âm' : 'dùng nhiều bất thường'}` : ''))
    .filter(Boolean);
  const uniq = [...new Set(t)];
  return uniq.length ? `<span class="sm" style="line-height:1.4">Lúc chốt còn: ${esc(uniq.join(' · '))}</span>` : '';
}
async function loadHist(date) {
  S.hist = { date, data: null }; delete S.loadErr.lichsu; render();
  try { const d = await api('GET', '/day?date=' + date); if (S.hist.date === date) S.hist.data = d; }
  catch (e) { S.loadErr.lichsu = e.message; say(e.message, true); }
  render();
}

/* --- Báo cáo theo kỳ --- */
function vBaoCao() {
  const b = S.boot, R = S.bc, D = R.data;
  const top = `${head('Báo cáo Nhập – Dùng – Tồn', 'Theo các ngày đã chốt', 'more')}
    <div class="col gap8 tbar" style="padding:4px 16px">
      <div class="row gap8"><label class="f1 sm">Từ ngày<input class="inp s" style="width:100%" type="date" id="rfrom" data-model="rfrom" max="${b.today}" value="${esc(fv('rfrom', R.from))}"></label><label class="f1 sm">Đến ngày<input class="inp s" style="width:100%" type="date" id="rto" data-model="rto" max="${b.today}" value="${esc(fv('rto', R.to))}"></label></div>
      <div class="wrap"><button class="chip s" data-a="rquick" data-v="week">7 ngày</button><button class="chip s" data-a="rquick" data-v="month">Tháng này</button><button class="chip s" data-a="rquick" data-v="last">Tháng trước</button></div>
      <div class="row gap8"><button class="btn s pri f1" data-a="rload">XEM</button><button class="btn s f1" data-a="rcsv">Tải Excel (CSV)</button></div></div>`;
  if (!D) return `${top}${panelWait('baocao')}`;
  const kgOf = (id) => (b.phiBy[id] ? b.phiBy[id].kg_per_cay : 0);
  /* Ô "—" là KHÔNG BIẾT, không phải 0. Cộng nó thành 0 rồi in ra một dòng "Tấn" trông như tổng
     đầy đủ thì bảng tự nói dối: phi không có tồn đầu kỳ vẫn được tính là 0 tấn. Vẫn cộng các phi
     biết số (bỏ hẳn thì mất luôn thông tin), nhưng đếm số phi thiếu và nói rõ ở chân bảng. */
  const t = { dau: 0, nhap: 0, dc: 0, vay: 0, kk: 0, xuat: 0, dung: 0, cuoi: 0 };
  /* Cột Điều chỉnh chỉ hiện khi kỳ này THẬT CÓ điều chỉnh (server trả hasDc). Màn hình điện thoại
     đã chật, thêm một cột toàn số 0 vào mọi kỳ là lấy chỗ của số người ta cần đọc. Tệp CSV thì
     luôn có cột đó, vì tệp mang đi đối chiếu phải cùng một bộ cột ở mọi kỳ. */
  const hasDc = !!D.hasDc;
  /* Cột "Có phiếu" là phần lượng dùng giải thích được bằng phiếu xuất. Nó NẰM TRONG cột Dùng,
     không cộng thêm, nên đẳng thức đầu + nhập − dùng = cuối vẫn đúng. Ghi phiếu là tự nguyện nên
     kỳ nào không ai ghi thì bỏ hẳn cột, giống cách làm với cột Điều chỉnh. */
  const hasXuat = !!D.hasXuat;
  // cột "Vay mượn": thép ra/vào theo sổ vay mượn, đứng riêng như Điều chỉnh (không phải nhập, không phải dùng)
  const hasVay = !!D.hasVay;
  /* cột "Đặt về 0": ngày đặt tồn về 0 ghi tồn = 0 mà không ghi Dùng, nên phần bị đặt về 0 phải có cột
     riêng, không thì Tồn đầu + Nhập − Dùng lệch khỏi Tồn cuối mà bảng không nói vì sao */
  const hasKk = !!D.hasKk;
  const miss = { dau: 0, cuoi: 0 };
  const rows = D.rows.map((r) => {
    const kg = kgOf(r.phi), rp = b.phiBy[r.phi];
    /* Số tấn lấy từ server (r.*_kg), tính theo kg/cây LÚC CHỐT của từng ngày. Không tự nhân với kg/cây
       hiện tại: sửa kg/cây hôm nay không được đổi số tấn của kỳ đã khoá. */
    const K = (f, x) => (r[f + '_kg'] != null ? r[f + '_kg'] : (x || 0) * kg);
    if (r.dau == null) miss.dau++; else t.dau += K('dau', r.dau);
    if (r.cuoi == null) miss.cuoi++; else t.cuoi += K('cuoi', r.cuoi);
    t.nhap += K('nhap', r.nhap); t.dc += K('dc', r.dc); t.vay += K('vay', r.vay); t.kk += K('kk', r.kk); t.xuat += K('xuat', r.xuat); t.dung += K('dung', r.dung);
    const u = (x) => (isCuon(rp) ? fmtDec(x / rp.bo_size) : fmtInt(x));
    const dash = (x) => (x == null ? '—' : u(x));
    // điều chỉnh phải hiện CẢ DẤU: "−300" và "300" là hai việc trái ngược nhau
    const sg = (x) => (x > 0 ? '+' : x < 0 ? '−' : '') + u(Math.abs(x));
    return `<tr><th>${r.phi}${isCuon(rp) ? '<small class="muted"> (cuộn)</small>' : ''}</th><td>${dash(r.dau)}</td><td>${u(r.nhap)}</td>${hasDc ? `<td>${sg(r.dc || 0)}</td>` : ''}${hasVay ? `<td>${sg(r.vay || 0)}</td>` : ''}${hasKk ? `<td>${sg(r.kk || 0)}</td>` : ''}<td>${u(r.dung)}</td>${hasXuat ? `<td>${u(r.xuat || 0)}</td>` : ''}<td><b>${dash(r.cuoi)}</b></td></tr>`;
  }).join('');
  const days = D.days.slice().reverse().map((d) => `<div class="li"><span>${fmtDay(d.day)}${d.span > 1 ? ` <span class="sm muted">(gộp ${d.span} ngày)</span>` : ''}</span><span class="sm">nhập ${fmtT(d.nhap_kg)} · dùng ${fmtT(d.dung_kg)} · tồn <b>${fmtT(d.ton_kg)}</b> tấn</span></div>`).join('');
  return `${top}<div class="f1 scroll pad col gap12" id="body">
    ${D.closedDays || D.openDay ? '' : '<div class="card warn">Không có ngày nào được chốt trong khoảng này.</div>'}
    ${D.openDay ? '' : '<div class="sm muted">Chưa có ngày chốt nào nên chưa có số tồn đầu kỳ.</div>'}
    ${D.openStock ? `<div class="card sm" style="line-height:1.4">Kỳ này gồm cả lần chốt đầu tiên (${esc(fmtDay(D.openDay))}) — đó là buổi kiểm kê mở sổ, nên lấy luôn làm tồn đầu kỳ. Lượng nhập/dùng trước buổi đó không ai ghi nên không tính vào kỳ.</div>` : ''}
    ${(D.resetDays || []).length ? `<div class="card warn sm" style="line-height:1.4">Kỳ này có ngày <b>đặt tồn về 0</b> (${D.resetDays.map((d) => esc(fmtDay(d))).join(', ')}). Ngày đó không tính lượng dùng; ${hasKk ? 'phần tồn bị đặt về 0 nằm ở cột <b>Đặt về 0</b>, nên Tồn đầu + Nhập − Dùng vẫn khớp Tồn cuối.' : 'lúc đặt lại bãi không còn thép nên không có gì bị đặt về 0.'}</div>` : ''}
    <div class="card" style="padding:0;overflow-x:auto"><table class="tbl"><thead><tr><th>ɸ</th><th>Tồn đầu</th><th>Nhập</th>${hasDc ? '<th>Điều chỉnh</th>' : ''}${hasVay ? '<th>Vay mượn</th>' : ''}${hasKk ? '<th>Đặt về 0</th>' : ''}<th>Dùng</th>${hasXuat ? '<th>Có phiếu</th>' : ''}<th>Tồn cuối</th></tr></thead><tbody>${rows}</tbody>
      <tfoot><tr><th>Tấn</th><td>${fmtT(t.dau)}${miss.dau ? '*' : ''}</td><td>${fmtT(t.nhap)}</td>${hasDc ? `<td>${fmtT(t.dc)}</td>` : ''}${hasVay ? `<td>${fmtT(t.vay)}</td>` : ''}${hasKk ? `<td>${fmtT(t.kk)}</td>` : ''}<td>${fmtT(t.dung)}</td>${hasXuat ? `<td>${fmtT(t.xuat)}</td>` : ''}<td><b>${fmtT(t.cuoi)}${miss.cuoi ? '*' : ''}</b></td></tr></tfoot></table></div>
    ${miss.dau || miss.cuoi ? `<div class="card warn sm" style="line-height:1.4">* Tổng tấn chưa gồm ${[miss.dau ? miss.dau + ' phi không có tồn đầu kỳ' : '', miss.cuoi ? miss.cuoi + ' phi không có tồn cuối kỳ' : ''].filter(Boolean).join(' và ')} (ô ghi "—"). Những phi đó chưa có lần chốt nào trong khoảng này.</div>` : ''}
    <div class="sm muted">Đơn vị: cây (D10–D36) hoặc cuộn (D6, D8), dòng cuối: tấn. ${D.openDay ? (D.openStock ? 'Tồn đầu lấy buổi kiểm kê mở sổ ' : 'Tồn đầu lấy ngày chốt ') + fmtDay(D.openDay) + '. ' : ''}${D.closeDay ? 'Tồn cuối lấy ngày chốt ' + fmtDay(D.closeDay) + '. ' : ''}Chuyển khu không tính vào nhập.${hasDc ? ' Cột Điều chỉnh là những lần sửa sổ (không có thép ra vào bãi): nó không nằm trong cột Nhập và không tính vào Dùng.' : ''}${hasXuat ? ' Cột Có phiếu là phần lượng dùng đã có phiếu xuất giải thích — nó nằm TRONG cột Dùng, phần còn lại là chưa rõ đi đâu.' : ''}${hasVay ? ' Cột Vay mượn là thép cho đối tác mượn (−) hoặc đi vay về (+) qua bãi: đổi tồn nhưng không phải nhập, cũng không phải dùng.' : ''} Số tấn tính theo kg/cây lúc chốt từng ngày.</div>
    ${days ? `<h2 class="sec">Theo ngày (${D.closedDays} ngày đã chốt)</h2><div class="card" style="padding:0;overflow:hidden">${days}</div>` : ''}
  </div>`;
}
function repRange(kind) {
  const today = S.boot.today;
  if (kind === 'week') return [new Date(Date.parse(today) - 6 * 864e5).toISOString().slice(0, 10), today];
  if (kind === 'last') {
    const first = today.slice(0, 8) + '01';
    const end = ydayOf(first);
    return [end.slice(0, 8) + '01', end];
  }
  return [today.slice(0, 8) + '01', today];
}
async function loadRep() {
  const R = S.bc;
  R.data = null; delete S.loadErr.baocao; render();
  try { R.data = await api('GET', `/report?from=${R.from}&to=${R.to}`); } catch (e) { S.loadErr.baocao = e.message; say(e.message, true); }
  render();
}

/* --- Nhật ký (admin) --- */
// dòng phiếu trong nhật ký: bản mới có lines, bản cũ có phi/qty
const lineTxt = (d) => { const items = d.lines ? d.lines : (d.phi !== undefined ? [{ phi: d.phi, qty: d.qty }] : []); return items.map((l) => { const lp = S.boot && S.boot.phiBy[l.phi]; return l.phi + ' ' + fmtQs(l.qty, lp); }).join(', '); };
const phieuWord = (d) => ({ chuyen: 'chuyển khu', dc: 'điều chỉnh tồn', xuat: 'xuất kho' }[d.kind] || 'nhập');
/* Nhập và chuyển khu thì chỉ kể nửa dương (nửa âm của phiếu chuyển là cùng lô thép, kể cả hai là
   nhân đôi khối lượng). Phiếu ĐIỀU CHỈNH thì phải kể ĐỦ CẢ DẤU: lọc qty > 0 như trước là một
   phiếu giảm hiện ra "hủy phiếu điều chỉnh tồn đã duyệt: " rồi hết — dòng nhật ký không nói được
   nó vừa hoàn tác cái gì, mà nhật ký thì không sửa lại được. */
const dcLines = (d) => (d.kind === 'dc' || d.kind === 'xuat' ? d : { ...d, lines: (d.lines || []).filter((l) => l.qty > 0) });
// "Vay của Cty A: D16 180 cây"; dòng nhật ký cũ (trước khi ghi kèm đối tác) chỉ còn loại ghi
const loanAuditTxt = (d) => (d.doitac ? loanTitle(d.kind, d.doitac) : ((LOAN_KIND[d.kind] || {}).ten || d.kind))
  + (d.lines && d.lines.length ? ': ' + lineTxt(d) : '');
function fmtAudit(a) {
  let d = {};
  try { d = a.detail ? JSON.parse(a.detail) : {}; } catch (e) { d = {}; }
  const kn = (id) => (S.boot.khuBy[id] ? S.boot.khuBy[id].name : id);
  const M = {
    login: ['đăng nhập', 'login'], login_fail: ['nhập sai PIN (lần ' + d.n + ')', 'flag'], login_locked: ['bị khóa ' + (d.mins >= 60 ? d.mins / 60 + ' giờ' : (d.mins || 15) + ' phút') + ' do nhập sai PIN nhiều lần', 'flag'],
    change_pin: ['đổi PIN', 'login'], recover_pin: ['khôi phục PIN qua trang recovery', 'flag'], setup: ['thiết lập hệ thống', 'admin'],
    receipt: ['nhập kho vào ' + kn(d.khu) + ': ' + lineTxt(d) + (d.note ? ' (' + d.note + ')' : ''), 'nhap'],
    transfer: ['chuyển ' + kn(d.from) + ' → ' + kn(d.to) + ': ' + lineTxt(d) + (d.note ? ' (' + d.note + ')' : ''), 'nhap'],
    adjust: ['điều chỉnh tồn ' + kn(d.khu) + ' ' + (d.dir === 'giam' ? 'GIẢM' : 'TĂNG') + ': ' + lineTxt(d)
      + (d.note ? ' — ' + d.note : ''), 'dc'],
    issue: ['xuất từ ' + kn(d.khu) + ' cho ' + (d.noi || '?') + ': ' + lineTxt(d) + (d.ghi ? ' — ' + d.ghi : ''), 'nhap'],
    receipt_void: ['hủy phiếu ' + phieuWord(d) + ' đã duyệt: ' + lineTxt(dcLines(d)), 'nhap'],
    // từ chối khác hủy: phiếu chưa duyệt nên chưa từng vào tồn, không có gì phải lùi
    receipt_reject: ['từ chối phiếu ' + phieuWord(d) + ' (chưa duyệt): ' + lineTxt(dcLines(d)), 'flag'],
    receipt_duyet: ['duyệt phiếu ' + phieuWord(d)
      + (d.duyet_day && d.day && d.duyet_day !== d.day ? ' (nhập ' + fmtDay(d.day) + ')' : '')
      + ': ' + lineTxt(dcLines(d)), 'admin'],
    close_day: ['chốt ngày ' + fmtDay(d.day) + (d.note ? ' (' + d.note + ')' : ''), 'admin'],
    late_accept: ['nhận số ' + kn(d.khu) + ' gửi sau chốt' + (d.changes && d.changes.length ? ': ' + d.changes.map((c) => c.phi + ' ' + (c.from == null ? 'mới' : c.from) + ' → ' + c.to).join('; ') : ' (không đổi)'), 'flag'],
    late_delete: ['xoá báo cáo ' + kn(d.khu) + ' gửi sau chốt (không nhận)', 'admin'],
    auto_close: ['tự chốt sổ ngày ' + fmtDay(d.day) + (d.note && d.note !== 'Tự chốt: không còn việc treo' ? ' (' + d.note.replace(/^Tự chốt · /, '') + ')' : ''), 'admin'],
    auto_close_skip: ['không tự chốt ngày ' + fmtDay(d.day) + ': ' + d.reason, 'flag'],
    // bảng nhãn được dựng cho MỌI dòng nhật ký: d.khu ở dòng khác là chuỗi, nên không gọi .join trực tiếp
    khu_duyet: ['duyệt số của ' + [].concat(d.names || d.khu || []).join(', ')
      + (d.phieu && d.phieu.length ? ' (kèm ' + d.phieu.length + ' phiếu)' : '')
      + (d.lech && d.lech.length ? ' · lệch: ' + d.lech.slice(0, 8).join(', ') : ''), 'admin'],
    reopen_day: ['mở lại ngày ' + fmtDay(d.day) + ' (' + d.note + ')', 'flag'], recount: ['yêu cầu ' + kn(d.khu) + ' đếm lại', 'admin'], recount_after_close: ['mở lại ngày, yêu cầu ' + kn(d.khu) + ' đếm lại', 'flag'], conflict_resolve: [(d.changes && d.changes.length ? 'chọn số cho ' + kn(d.khu) + ': ' + d.changes.map((c) => c.phi + ' ' + c.from + ' → ' + c.to).join('; ') : 'chọn số báo sau cho ' + kn(d.khu)), 'admin'],
    user_create: ['tạo tài khoản ' + d.name, 'admin'], user_reset_pin: ['đặt lại PIN cho ' + d.name, 'admin'], user_lock: ['khóa ' + d.name, 'admin'], user_unlock: ['mở khóa ' + d.name, 'admin'],
    user_role: ['đổi vai trò ' + d.name + ' thành ' + (ROLE[d.role] || d.role), 'admin'], user_logout: ['đăng xuất mọi máy của ' + d.name, 'admin'],
    /* Dòng này là cái NỐI hai tên lại: nhật ký lưu sẵn tên vào từng dòng và database từ chối sửa,
       nên các dòng trước khi đổi tên vẫn mang tên cũ. Có dòng này thì vẫn tra ra được là ai. */
    user_rename: ['đổi tên "' + d.from + '" thành "' + d.to + '"', 'admin'],
    user_delete: ['xoá tài khoản ' + d.name + ' (' + (ROLE[d.role] || d.role) + ')' + (d.phone ? ' · ' + d.phone : '') + ' — hoạt động cũ vẫn giữ tên', 'flag'],
    user_restore: ['khôi phục tài khoản ' + d.name, 'admin'],
    /* Hai dòng này là chỗ DUY NHẤT còn đọc lại được số thép trước khi đặt lại, vì nhật ký không
       xoá được. Nên hiện luôn tổng tấn và số theo từng phi, đừng chỉ ghi "đã đặt lại". */
    backup: ['tải bản sao toàn bộ ngày ' + fmtDay(d.ngay) + (d.dong ? ' (' + fmtInt(Object.values(d.dong).reduce((a, x) => a + x, 0)) + ' dòng)' : ''), 'admin'],
    restore: ['NẠP LẠI TOÀN BỘ từ bản sao ngày ' + fmtDay(d.ngay) + ' (do ' + (d.boi || '?') + ' tải)'
      + (d.dong ? ' — ' + fmtInt(Object.values(d.dong).reduce((a, x) => a + x, 0)) + ' dòng' : '')
      + (d.giu && d.giu.length ? ' · giữ nguyên sổ vay mượn (bản sao chưa có)' : ''), 'flag'],
    reset_zero: ['ĐẶT TỒN CẢ BÃI VỀ 0 — trước đó ' + d.tan + ' tấn'
      + (d.truoc && d.truoc.length ? ' (' + d.truoc.map((x) => x.phi + ' ' + x.v).join(', ') + ')' : ''), 'flag'],
    reset_wipe: ['XOÁ SẠCH DỮ LIỆU THÉP — trước đó ' + d.tan + ' tấn'
      + (d.truoc && d.truoc.length ? ' (' + d.truoc.map((x) => x.phi + ' ' + x.v).join(', ') + ')' : ''), 'flag'],
    // vay mượn ngoài bãi: sổ công nợ, có chip lọc "Vay mượn" riêng
    loan_vay: ['ghi sổ: vay của ' + (d.doitac || '?') + ': ' + lineTxt(d) + (d.note ? ' (' + d.note + ')' : ''), 'vay'],
    loan_tra_vay: ['ghi sổ: trả ' + (d.doitac || '?') + ': ' + lineTxt(d) + (d.note ? ' (' + d.note + ')' : ''), 'vay'],
    loan_cho_vay: ['ghi sổ: cho ' + (d.doitac || '?') + ' vay: ' + lineTxt(d) + (d.note ? ' (' + d.note + ')' : ''), 'vay'],
    loan_tra_no: ['ghi sổ: ' + (d.doitac || '?') + ' trả lại: ' + lineTxt(d) + (d.note ? ' (' + d.note + ')' : ''), 'vay'],
    loan_duyet: ['duyệt sổ vay mượn: ' + loanAuditTxt(d), 'vay'],
    loan_reject: ['bỏ lần ghi sổ vay mượn chưa duyệt: ' + loanAuditTxt(d), 'vay'],
    loan_void: ['huỷ lần ghi sổ vay mượn đã duyệt: ' + loanAuditTxt(d), 'flag'],
    doitac_create: ['thêm đối tác ' + d.name, 'vay'],
    doitac_update: ['sửa đối tác ' + d.name + (d.active ? '' : ' (ẩn)'), 'vay'],
    khu_create: ['thêm ' + d.name, 'admin'], khu_update: ['sửa ' + d.name + (d.active ? '' : ' (ẩn)'), 'admin'],
    khu_users: [d.n ? 'gán ' + d.n + ' người phụ trách ' + kn(d.khu) : 'bỏ phân công ' + kn(d.khu) + ' (mọi người đếm được)', 'admin'], phi_update: ['sửa cấu hình ' + (d.items ? d.items.map((x) => x.id).join(', ') : d.id), 'admin'], phi_seed: ['khôi phục phi mặc định D6–D36', 'admin'], settings_update: ['sửa cài đặt', 'admin'],
  };
  if (a.action === 'count' || a.action === 'count_late') {
    const u = (v, phi) => (S.boot && S.boot.phiBy[phi] ? fmtQs(v, phi) : v); // cuộn: 350 → "3,5 cuộn"
    const ch = (d.changes || []).map((c) => c.phi + ': ' + (c.from == null ? 'mới' : u(c.from, c.phi)) + ' → ' + u(c.to, c.phi)).join('; ');
    const sau = a.action === 'count_late' ? ' sau khi chốt, chờ admin nhận' : '';
    return { text: 'báo ' + kn(d.khu) + sau + (ch ? ' (' + ch + ')' : ' (không đổi)'), type: 'dem', flag: !!d.conflict || !!sau };
  }
  const m = M[a.action] || [a.action, 'admin'];
  return { text: m[0], type: m[1] === 'flag' ? 'login' : m[1], flag: m[1] === 'flag' };
}
function vNhatKy() {
  // "Điều chỉnh" đứng riêng, KHÔNG gộp vào "Nhập kho": đây là nhóm việc người ta sẽ phải soi lại
  const F = [['all', 'Tất cả'], ['dem', 'Báo đếm'], ['nhap', 'Nhập kho'], ['dc', 'Điều chỉnh'], ['vay', 'Vay mượn'], ['admin', 'Admin'], ['flag', 'Cần chú ý']];
  const rows = (S.audit || []).map((a) => ({ a, f: fmtAudit(a) })).filter((x) => S.logFilter === 'all' || (S.logFilter === 'flag' ? x.f.flag : x.f.type === S.logFilter));
  const AF = S.auditF;
  const loc = AF.ngay || AF.q ? `<span class="sm muted">Đang lọc${AF.ngay ? ' ngày ' + esc(fmtDay(AF.ngay)) : ''}${AF.q ? ' chữ "' + esc(AF.q) + '"' : ''} · <button class="sm" style="border:0;background:transparent;color:var(--pri);text-decoration:underline;padding:0" data-a="logclear">bỏ lọc</button></span>` : '';
  const them = S.audit && S.auditMore ? `<button class="btn s full" data-a="logmore">Tải thêm dòng cũ hơn</button>` : '';
  return `${head('Nhật ký hoạt động', 'Không ai xóa hoặc sửa được', 'more')}
  <div class="col gap6 tbar" style="padding:6px 16px">
    <div class="row gap6"><input class="inp s" style="flex:0 0 150px" type="date" id="logday" max="${S.boot.today}" value="${esc(AF.ngay)}" data-change="logday">
      <input class="inp s f1" id="logq" style="min-width:0" placeholder="Tìm: tên, khu, phi, đối tác…" data-model="logq" data-enter="logfind" value="${esc(fv('logq', AF.q))}"><button class="btn s" data-a="logfind">Tìm</button></div>
    ${loc}
    <div class="wrap">${F.map((f) => `<button class="chip s ${S.logFilter === f[0] ? 'on' : ''}" data-a="logf" data-v="${f[0]}">${f[1]}</button>`).join('')}</div></div>
  <div class="f1 scroll ${S.audit ? 'pad ' : ''}col gap8" id="body">${S.audit ? (rows.map((x) => `<div class="logrow ${x.f.flag ? 'flag' : ''}"><div class="row" style="justify-content:space-between"><b>${esc(x.a.user_name || 'Hệ thống')}</b><span class="sm muted">${dmy(x.a.ts)}</span></div><div style="font-size:16px;line-height:1.4">${esc(x.f.text)}</div>${x.f.flag ? '<span class="badge bad" style="align-self:flex-start">Cần chú ý</span>' : ''}</div>`).join('') || '<div class="muted">Không có dòng nào</div>') + them : panelWait('nhatky')}</div>`;
}

// duyệt/huỷ sổ vay gọi từ màn nào thì nạp lại đúng màn đó (Duyệt, Vay mượn, hay chi tiết đối tác)
async function reloadLoanScreen() {
  if (S.screen === 'duyet') await reloadReview();
  else if (S.screen === 'vaychitiet') S.loanDetail = await api('GET', '/loans?doitac=' + S.loanDt);
  else S.loans = await api('GET', '/loans');
  await loadBoot();
}
/* Nạp nhật ký theo bộ lọc ngày/chữ. more = nối thêm trang cũ hơn (before = id nhỏ nhất đang có).
   Chip loại (Báo đếm, Vay mượn...) vẫn lọc trên máy, trên những dòng đã tải. */
async function loadAudit(more) {
  const AF = S.auditF, qs = ['limit=300'];
  if (AF.ngay) qs.push('ngay=' + AF.ngay);
  if (AF.q) qs.push('q=' + encodeURIComponent(AF.q));
  if (more && S.audit && S.audit.length) qs.push('before=' + S.audit[S.audit.length - 1].id);
  if (!more) { S.audit = null; render(); }
  const r = await api('GET', '/audit?' + qs.join('&'));
  S.audit = more ? (S.audit || []).concat(r.items) : r.items;
  S.auditMore = !!r.more;
}

/* --- Thống kê --- */
/* --- Chấm công báo cáo (admin) ---
   Ai báo, ai không báo, khu thiếu buổi nào, trên các ngày ĐÃ CHỐT (sổ tự chốt sau 0h, nên hôm nay
   chưa tính). Mỗi buổi khu phải báo mà không ai báo là một buổi thiếu, tính cho mọi người phụ trách
   khu đó lúc chốt; khu không có người phụ trách thì chỉ hiện ở phần khu. */
async function loadChamCong() {
  const C = S.cc;
  C.data = null; delete S.loadErr.chamcong; render();
  const to = ydayOf(S.boot.today);
  let from = to;
  for (let i = 1; i < C.days; i++) from = ydayOf(from);
  try { C.data = await api('GET', `/cham-cong?from=${from}&to=${to}`); } catch (e) { S.loadErr.chamcong = e.message; say(e.message, true); }
  render();
}
function vChamCong() {
  const C = S.cc, D = C.data;
  const chips = `<div class="row gap6">${[7, 30, 90].map((n) => `<button class="chip s f1 ${C.days === n ? 'on' : ''}" data-a="ccdays" data-v="${n}">${n} ngày</button>`).join('')}</div>`;
  const top = `${head('Chấm công báo cáo', 'Ai báo, ai không báo · các ngày đã chốt', 'more')}`;
  if (!D) return `${top}<div class="f1 scroll pad col gap12" id="body">${chips}${panelWait('chamcong')}</div>`;
  const dm = (d) => fmtDay(d).slice(0, 5);
  const kn = (id) => (S.boot.khuBy[id] ? S.boot.khuBy[id].name : id);
  const khoang = `<span class="sm muted">Từ ${esc(fmtDay(D.from))} tới ${esc(fmtDay(D.to))} · ${D.ngay} ngày đã chốt. Hôm nay chưa tính (sổ tự chốt sau 0h).</span>`;
  if (!D.ngay) {
    return `${top}<div class="f1 scroll pad col gap12" id="body">${chips}${khoang}
      <div class="card col gap6"><b>Chưa có ngày nào đã chốt trong khoảng này</b><span class="sm muted" style="line-height:1.4">Mỗi đêm sau 0h, lúc sổ tự chốt, app ghi lại ai phụ trách khu nào và ai đã báo buổi nào. Số liệu bắt đầu có từ ngày chốt đầu tiên.</span></div></div>`;
  }
  const nguoi = D.nguoi.map((n) => {
    const key = 'u' + n.id, mo = !!C.mo[key];
    const ds = n.thieu.map((t) => `<div class="li"><span>${esc(dm(t.day))} · ${esc(kn(t.khu))}</span><span class="sm" style="text-align:right">thiếu ${esc(t.buoi.join(', '))}${t.cung.length ? '<br><span class="muted">cùng phụ trách: ' + esc(t.cung.join(', ')) + '</span>' : ''}</span></div>`).join('');
    const phai = n.phai ? ` · phải báo ${n.phai} buổi: tự báo ${n.tu}${n.thay ? ', người khác báo thay ' + n.thay : ''}` : ' · không phụ trách khu nào';
    return `<div class="card col gap6" style="${n.soThieu ? 'border:2px solid var(--bad)' : ''}">
      <div class="row" style="justify-content:space-between;gap:8px"><b style="font-size:17px;min-width:0">${esc(n.name)}</b>${n.phai ? `<span class="badge ${n.soThieu ? 'bad' : 'ok'}">${n.soThieu ? 'Thiếu ' + n.soThieu + ' buổi' : 'Đủ'}</span>` : ''}</div>
      <span class="sm" style="line-height:1.4">Báo ${n.lan} lần · ${n.ngay} ngày có báo${phai}</span>
      ${n.thieu.length ? `<button class="sm" style="border:0;background:transparent;color:var(--pri);text-align:left;padding:2px 0;text-decoration:underline" data-a="ccmo" data-k="${key}">${mo ? 'Ẩn ngày thiếu' : 'Xem ' + n.thieu.length + ' ngày thiếu'}</button>` : ''}
      ${mo ? `<div class="card" style="padding:0;overflow:hidden">${ds}</div>` : ''}</div>`;
  }).join('');
  const khu = D.khu.filter((k) => k.phai).map((k) => {
    const key = 'k' + k.khu, mo = !!C.mo[key];
    const ds = k.thieu.map((t) => `<div class="li"><span>${esc(dm(t.day))}</span><span class="sm" style="text-align:right">thiếu ${esc(t.buoi.join(', '))}<br><span class="muted">${t.pt.length ? 'phụ trách: ' + esc(t.pt.join(', ')) : 'không ai phụ trách'}</span></span></div>`).join('');
    return `<div class="card col gap6">
      <div class="row" style="justify-content:space-between;gap:8px"><b style="font-size:17px;min-width:0">${esc(k.name)}</b><span class="badge ${k.soThieu ? 'bad' : 'ok'}">${k.soThieu ? 'Thiếu ' + k.soThieu + ' buổi' : 'Đủ'}</span></div>
      <span class="sm">Phải báo ${k.phai} buổi${k.khongPt ? ` · <b style="color:var(--warn)">${k.khongPt} ngày không người phụ trách</b>` : ''}</span>
      ${k.thieu.length ? `<button class="sm" style="border:0;background:transparent;color:var(--pri);text-align:left;padding:2px 0;text-decoration:underline" data-a="ccmo" data-k="${key}">${mo ? 'Ẩn ngày thiếu' : 'Xem ' + k.thieu.length + ' ngày thiếu'}</button>` : ''}
      ${mo ? `<div class="card" style="padding:0;overflow:hidden">${ds}</div>` : ''}</div>`;
  }).join('');
  return `${top}<div class="f1 scroll pad col gap12" id="body">${chips}${khoang}
    <h2 class="sec">Theo người</h2>${nguoi || '<span class="muted">Không có ai phụ trách hay báo cáo trong khoảng này.</span>'}
    <h2 class="sec">Theo khu</h2>${khu || '<span class="muted">Không khu nào phải báo trong khoảng này.</span>'}
  </div>`;
}

function vStats() {
  const b = S.boot, T = totals();
  const scope = S.statScope;
  const chips = [['all', 'Toàn bãi']].concat(b.khuAct.map((k) => [k.id, k.name]));
  /* Bày ĐỦ mọi đường kính, kể cả khi chọn một khu: phi không có thép ghi 0 (chữ mờ), như thẻ khu ở
     Tổng quan. Ẩn đi thì khu trống trơn chỉ còn dòng "Cộng 0" — trông như trang hỏng, và người xem
     không đối chiếu được "không thấy D25 là hết hay là quên". */
  const rows = b.phiAct.map((p) => ({ p, v: scope === 'all' ? T.perPhi[p.id] : tonOf(scope, p.id) }));
  const coThep = rows.filter((r) => r.v > 0).length;
  const tenScope = scope === 'all' ? 'toàn bãi' : ((b.khuBy[scope] || {}).name || scope);
  const sumCay = rows.filter((r) => !isCuon(r.p)).reduce((a, r) => a + r.v, 0);
  const sumKg = rows.reduce((a, r) => a + r.v * r.p.kg_per_cay, 0);
  let usageHtml = panelWait('stats');
  if (S.usage) {
    /* d.kg là kg/cây LÚC CHỐT của ngày đó (server gửi), d.xuat là phần dùng có phiếu xuất. Số tấn
       không nhân với kg/cây hiện tại: sửa kg/cây hôm nay không được đổi số tấn của ngày đã khoá. */
    const per = {}, perX = {}; let tot = 0, totX = 0;
    S.usage.forEach((d) => {
      let dayKg = 0;
      const kgOfDay = (p) => (d.kg && d.kg[p] != null ? d.kg[p] : (b.phiBy[p] || {}).kg_per_cay || 0);
      for (const p in d.used) { per[p] = (per[p] || 0) + d.used[p]; dayKg += d.used[p] * kgOfDay(p); }
      for (const p in d.xuat || {}) { perX[p] = (perX[p] || 0) + d.xuat[p]; totX += d.xuat[p] * kgOfDay(p); }
      d.tan = dayKg; tot += dayKg;
      // used rỗng = ngày mở sổ (chốt đầu tiên, hoặc đặt tồn về 0): không có tồn hôm trước để trừ
      d.moSo = !d.used || Object.keys(d.used).length === 0;
    });
    const tinhDuoc = S.usage.filter((d) => !d.moSo).length;
    const coPhieu = (p) => (perX[p.id] ? `<span class="sm muted">trong đó ${fmtQs(perX[p.id], p)} có phiếu xuất</span>` : '');
    usageHtml = S.usage.length ? `<div class="card" style="padding:0;overflow:hidden">${b.phiAct.filter((p) => per[p.id]).map((p) => `<div class="li"><b>${p.id}</b><span class="col" style="align-items:flex-end"><b>${qMain(per[p.id], p)}</b><span class="sm muted">${qSub(per[p.id], p)}</span>${coPhieu(p)}</span></div>`).join('')}<div class="li" style="background:#E8EEF6"><b>Tổng dùng</b><b>${fmtT(tot)} tấn</b></div>${totX ? `<div class="li"><span class="sm">trong đó có phiếu xuất</span><span class="sm">${fmtT(totX)} tấn · không rõ ${fmtT(tot - totX)} tấn</span></div>` : ''}</div>
      <h2 class="sec">Theo ngày</h2><div class="card" style="padding:0;overflow:hidden">${S.usage.map((d) => `<div class="li"><span>${d.day.split('-').reverse().join('/')}</span>${d.moSo
        ? '<span class="sm muted">mở sổ · chưa tính dùng</span>' : `<b>${fmtT(d.tan)} tấn</b>`}</div>`).join('')}</div>
      ${tinhDuoc ? '' : '<div class="sm muted" style="line-height:1.4">Ngày mở sổ là ngày lập tồn đầu tiên: chưa có tồn hôm trước nên chưa tính được lượng dùng. Lượng dùng bắt đầu có từ lần chốt kế tiếp.</div>'}`
      /* 1. Trống: nói rõ VÌ SAO trống và KHI NÀO có số, không chỉ "chưa có" — trang trống mà không nói
         gì thì người dùng tưởng app hỏng. */
      : b.lastClosed ? '<div class="muted">Chưa có ngày nào được chốt trong khoảng này.</div>'
      : '<div class="card col gap6"><b>Sổ chưa chốt ngày nào</b><span class="sm" style="line-height:1.45">Sổ tự chốt sau 0h mỗi đêm. Lần chốt đầu tiên là ngày <b>mở sổ</b> (lập tồn đầu kỳ); lượng dùng bắt đầu tính từ ngày thứ hai.</span></div>';
  }
  return `${head('Thống kê', 'Tồn theo khu hoặc toàn bãi · lượng dùng toàn bãi', 'more')}
  <div class="f1 scroll pad col gap12" id="body">
    <h2 class="sec">Tồn hiện tại · ${esc(tenScope)}</h2>
    <div class="wrap">${chips.map((c) => `<button class="chip s ${scope === c[0] ? 'on' : ''}" data-a="sscope" data-v="${esc(c[0])}">${esc(c[1])}</button>`).join('')}</div>
    <div class="sm muted">Chọn khu chỉ đổi bảng tồn ngay dưới; lượng dùng bên dưới luôn tính cho cả bãi.</div>
    <div class="card" style="padding:0;overflow:hidden">${rows.map((r) => (r.v
      ? `<div class="li"><b>${r.p.id}</b><span class="col" style="align-items:flex-end"><b>${qMain(r.v, r.p)}</b><span class="sm muted">${qSub(r.v, r.p)}</span></span></div>`
      : `<div class="li" style="color:var(--mut)"><b>${r.p.id}</b><span>0</span></div>`)).join('')}<div class="li" style="background:#E8EEF6"><b>Cộng · ${coThep}/${rows.length} phi có thép</b><b>${cayTxt(sumCay)} · ${fmtT(sumKg)} tấn</b></div></div>
    <h2 class="sec">Thép đã dùng · toàn bãi, các ngày đã chốt</h2>
    <div class="wrap">${[7, 30, 90].map((d) => `<button class="chip s ${S.usageDays === d ? 'on' : ''}" data-a="sdays" data-v="${d}">${d} ngày</button>`).join('')}</div>
    ${usageHtml}
  </div>`;
}

/* --- Thêm --- */
// phi mẫu cho ô xem trước kiểu hiện số: ưu tiên cây nguyên vì có đủ cả bó lẫn cây lẻ
function uDemo() {
  const b = S.boot;
  return b.phi.find((p) => !isCuon(p) && p.bo_size > 1) || b.phi[0];
}
function vMore() {
  const a = isAdmin();
  return `${head('Thêm', esc(S.me.name) + ' · ' + ROLE[S.me.role])}
  <div class="f1 scroll pad col gap8" id="body">
    <button class="menu" data-a="nav" data-s="stats">Thống kê theo khu / toàn bãi</button>
    <button class="menu" data-a="nav" data-s="ton">Tồn bãi theo đường kính</button>
    <button class="menu" data-a="nav" data-s="lichsu">Xem lại ngày cũ</button>
    ${canIn() ? '<button class="menu" data-a="nav" data-s="baocao">Báo cáo Nhập – Dùng – Tồn theo kỳ</button>' : ''}
    <button class="menu" data-a="nav" data-s="vaymuon">Vay mượn ngoài bãi${S.boot.loanPending ? ` (${S.boot.loanPending} chờ duyệt)` : ''}</button>
    ${a ? `<button class="menu" data-a="nav" data-s="chamcong">Chấm công báo cáo (ai báo, ai không báo)</button>
    <button class="menu" data-a="nav" data-s="nhatky">Nhật ký hoạt động</button>
    <button class="menu" data-a="nav" data-s="users">Người dùng và PIN</button>
    <button class="menu" data-a="nav" data-s="settings">Cài đặt khu, phi, quy tắc</button>
    <div class="card col gap6"><b>Xuất Excel (CSV) bảng khu × phi</b><div class="row gap6"><input class="inp s f1" type="date" id="exday" data-model="exday" max="${S.boot.today}" value="${esc(fv('exday', S.boot.today))}"><button class="btn s" data-a="exportday">Tải về</button></div></div>` : ''}
    <div class="card col gap6"><b>Cách hiện số lượng</b>
      <div class="row gap6">${UNIT_OPTS.map(([v, l]) => `<button class="chip s f1 ${S.unit === v ? 'on' : ''}" data-a="unit" data-v="${v}">${l}</button>`).join('')}</div>
      <span class="sm muted" style="line-height:1.4">Ví dụ phi ${esc(uDemo().id)}: <b>${fmtQ(uDemo().bo_size * 31 + 10, uDemo())}</b><br>Chỉ đổi cách hiện trên máy này, số liệu không đổi.</span></div>
    ${installCard()}
    <button class="menu" data-a="nav" data-s="pin">Đổi PIN của tôi</button>
    <button class="menu" style="color:var(--bad)" data-a="logout">Đăng xuất</button>
    <div class="sm muted" style="text-align:center;padding-top:8px">Kho Thép Bãi · phiên bản 1.3</div>
  </div>`;
}
function vPin() {
  return `${head('Đổi PIN', '', 'more')}<div class="f1 scroll pad col gap12" id="body">
    <label class="field">PIN hiện tại<input id="pin0" type="password" inputmode="numeric" maxlength="4"></label>
    <label class="field">PIN mới<input id="pin1" type="password" inputmode="numeric" maxlength="4"></label>
    <label class="field">Nhập lại PIN mới<input id="pin2" type="password" inputmode="numeric" maxlength="4" data-enter="changepin"></label>
    <div class="err" id="err">${esc(S.err)}</div><button class="btn pri full" data-a="changepin">LƯU PIN MỚI</button></div>`;
}

/* --- Người dùng (admin) --- */
/* Nạp danh sách kèm id của ADMIN ĐẦU TIÊN (người thiết lập hệ thống). Chỉ người đó được sửa tên,
   xoá và khôi phục tài khoản, và chính tài khoản đó thì không ai khoá/hạ quyền/xoá được. Server
   mới là chỗ chặn thật (xem OWNER_ONLY/PROTECT_FIRST); phần này chỉ để khỏi bày nút vô dụng. */
async function loadUsers() {
  const r = await api('GET', '/users');
  S.users = r.users; S.uFirst = r.first;
}
const isOwner = () => !!S.me && S.uFirst === S.me.id;

function vUsers() {
  const own = isOwner();
  const all = S.users || [];
  const live = all.filter((u) => !u.deleted);
  const gone = all.filter((u) => u.deleted);
  const card = (u) => {
    const first = u.id === S.uFirst;
    const me = u.id === S.me.id;
    /* Sửa tên là việc của riêng admin đầu tiên, vì tên là thứ đi theo mọi hoạt động: số đếm,
       phiếu và báo cáo khu đều lấy tên bằng cách join nên đổi tên là đổi cả lịch sử hiển thị.
       Kể cả thẻ của CHÍNH admin đầu tiên — đó mới là tài khoản cần sửa tên nhất: nó hay được đặt
       theo chức danh ("admin") rồi ghi "admin" lên mọi việc nó duyệt, đúng cái mà tính năng này
       sinh ra để chữa. Server vẫn cho (rename không nằm trong PROTECT_FIRST). */
    const renameBox = own && S.uRename === u.id
      ? `<div class="row gap6"><input class="inp s f1" id="urn" placeholder="Tên mới" value="${esc(S.form.urn || u.name)}" data-model="urn"><button class="btn s pri" data-a="urenamesave" data-id="${u.id}">Lưu</button><button class="btn s" data-a="urenamecancel">Bỏ</button></div>`
      : '';
    const tags = [
      first ? '<span class="badge" style="background:var(--pri);color:#fff">Admin đầu tiên</span>' : '',
      u.locked ? '<span class="badge bad">Đã khóa</span>' : '',
      u.must_change ? '<span class="badge warn">chưa đổi PIN</span>' : '',
    ].filter(Boolean).join(' ');
    return `<div class="card col gap8" style="${u.locked ? 'opacity:.75;' : ''}${first ? 'border:2px solid var(--pri)' : ''}">
      <div class="row" style="justify-content:space-between;gap:8px;flex-wrap:wrap">
        <div class="col" style="gap:2px;min-width:0"><div class="row gap6" style="align-items:center;flex-wrap:wrap"><b style="font-size:18px">${esc(u.name)}</b>${tags}</div>
          <span class="sm muted">${esc(u.phone)}</span></div>
        <select class="inp s" style="width:130px;font-size:15px" data-change="role" data-id="${u.id}" ${first ? 'disabled' : ''}>${Object.keys(ROLE).map((r) => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${ROLE[r]}</option>`).join('')}</select></div>
      ${renameBox}
      <div class="row gap6">${first && !own ? '' : `<button class="btn s f1" data-a="ureset" data-id="${u.id}">Đặt lại PIN</button>`}
        ${me || first ? '' : `<button class="btn s f1 ${u.locked ? '' : 'bad'}" data-a="ulock" data-id="${u.id}" data-v="${u.locked ? 0 : 1}">${u.locked ? 'Mở khóa' : 'Khóa'}</button>`}
        <button class="btn s f1" data-a="ulogout" data-id="${u.id}">Đăng xuất máy</button></div>
      ${own && !renameBox ? `<div class="row gap6"><button class="btn s f1" data-a="urename" data-id="${u.id}">Sửa tên</button>
        ${me || first ? '' : `<button class="btn s bad f1" data-a="udelete" data-id="${u.id}">Xoá tài khoản</button>`}</div>` : ''}
      ${first ? '<span class="sm muted" style="line-height:1.4">Tài khoản thiết lập hệ thống: không ai khóa, hạ quyền, xoá hay đặt lại PIN được, kể cả admin khác.</span>' : ''}</div>`;
  };
  const goneSec = !gone.length ? '' : `<h2 class="sec">Tài khoản đã xoá (${gone.length})</h2>
    <div class="sm muted" style="line-height:1.4">Không đăng nhập được và không nhận phân công khu. Mọi số đếm, phiếu và báo cáo họ đã làm vẫn giữ nguyên tên — đó là lý do dòng tài khoản không bị xoá hẳn.</div>
    ${gone.map((u) => `<div class="card col gap8" style="opacity:.75">
      <div class="col" style="gap:2px"><div class="row gap6" style="align-items:center;flex-wrap:wrap"><b style="font-size:17px">${esc(u.name)}</b>${u.locked ? '<span class="badge bad">Đã khóa</span>' : ''}</div><span class="sm muted">${esc(u.phone)} · ${ROLE[u.role] || u.role}</span></div>
      ${u.locked ? '<span class="sm muted" style="line-height:1.4">Bị khóa trước khi xoá nên khôi phục xong vẫn còn khóa — nhớ mở khóa nếu cho dùng lại.</span>' : ''}
      ${own ? `<button class="btn s f1" data-a="urestore" data-id="${u.id}">KHÔI PHỤC</button>` : '<span class="sm muted">Chỉ admin đầu tiên khôi phục được.</span>'}</div>`).join('')}`;
  return `${head('Người dùng', own ? 'Bạn là admin đầu tiên: tạo, sửa tên và xoá tài khoản' : 'Admin tạo tài khoản và PIN', 'more')}<div class="f1 scroll pad col gap12" id="body">
    ${S.pinShown ? `<div class="card ok col gap8"><b style="font-size:18px">PIN của ${esc(S.pinShown.name)}</b><b style="font-size:40px;letter-spacing:8px">${esc(S.pinShown.pin)}</b><span class="sm">Đưa PIN này cho người dùng (chỉ hiện một lần). Họ sẽ phải đổi PIN khi đăng nhập lần đầu.</span><button class="btn s full" data-a="pinok">Đã ghi lại</button></div>` : ''}
    <div class="card col gap8"><b style="font-size:18px">Thêm người dùng</b>
      <input class="inp s" id="un" placeholder="Họ tên" value="${esc(S.form.un || '')}" data-model="un"><input class="inp s" id="up" type="tel" inputmode="numeric" placeholder="Số điện thoại" value="${esc(S.form.up || '')}" data-model="up">
      <select class="inp s" id="ur" data-model="ur">${Object.keys(ROLE).reverse().map((r) => `<option value="${r}" ${(S.form.ur || 'nguoidem') === r ? 'selected' : ''}>${ROLE[r]}</option>`).join('')}</select>
      <span class="sm muted" style="line-height:1.4">Đặt ĐÚNG HỌ TÊN, đừng đặt theo chức danh: tên này đi theo mọi số đếm, phiếu và dòng nhật ký của người đó.</span>
      <div class="err" id="err">${esc(S.err)}</div><button class="btn pri full" data-a="ucreate">TẠO TÀI KHOẢN</button></div>
    ${live.map(card).join('') || (S.users ? '<div class="muted">Chưa có người dùng nào</div>' : panelWait('users'))}
    ${goneSec}</div>`;
}

/* --- Vay mượn ngoài bãi ---
   Sổ công nợ thép với đối tác NGOÀI bãi. KHÔNG đụng tới tồn: thép qua cổng thật vẫn phải lập
   phiếu Nhập/Xuất như thường, sổ này chỉ trả lời "ai đang giữ thép của ai". Ai cũng ghi được
   (người phát hiện thường là người ngoài bãi), admin duyệt từng lần ghi như mọi phiếu khác.
   Hai cặp tính riêng: vay/tra_vay là MÌNH NỢ đối tác, cho_vay/tra_no là ĐỐI TÁC NỢ MÌNH — cùng
   một đối tác có thể vừa cho mình vay D16 vừa đang mượn của mình D18. */
const LOAN_KIND = {
  vay: { ten: 'Mình vay', mo: 'Đối tác đưa thép cho bãi mình mượn — mình NỢ họ thêm' },
  tra_vay: { ten: 'Mình trả', mo: 'Bãi mình trả lại thép đã vay — mình bớt nợ họ' },
  cho_vay: { ten: 'Cho họ vay', mo: 'Bãi mình đưa thép cho đối tác mượn — họ NỢ mình thêm' },
  tra_no: { ten: 'Họ trả', mo: 'Đối tác trả lại thép đã mượn — họ bớt nợ mình' },
};
// câu mô tả một lần ghi theo đúng hướng thép đi: "Vay của X", "Trả X", "Cho X vay", "X trả lại"
const loanTitle = (kind, ten) => ({ vay: `Vay của ${ten}`, tra_vay: `Trả ${ten}`, cho_vay: `Cho ${ten} vay`, tra_no: `${ten} trả lại` }[kind] || ten);
/* Dư nợ theo đối tác × phi, chỉ tính dòng ĐÃ DUYỆT (server cộng sẵn theo kind trong agg).
   no = mình nợ họ, co = họ nợ mình. */
function loanBalances(L) {
  const by = {};
  ((L && L.agg) || []).forEach((r) => {
    const k = r.doitac_id + '|' + r.phi_id;
    const x = by[k] || (by[k] = { dt: r.doitac_id, phi: r.phi_id, no: 0, co: 0 });
    if (r.kind === 'vay') x.no += r.q; else if (r.kind === 'tra_vay') x.no -= r.q;
    else if (r.kind === 'cho_vay') x.co += r.q; else if (r.kind === 'tra_no') x.co -= r.q;
  });
  return Object.values(by);
}
/* Thẻ một lần ghi (nhiều phi cùng grp). Dùng chung cho màn Vay mượn và màn chi tiết một đối tác.
   Lần ghi đã huỷ (chỉ màn chi tiết mới có) thì gạch ngang, không có nút. */
/* Ngày tháng của sổ vay: "07/10" cho ngày cùng năm, đủ năm khi khác năm (sổ công nợ có thể kéo
   sang năm sau). Số ngày giữa hai ngày YYYY-MM-DD tính theo lịch, không theo giờ. */
const ngayNgan = (d) => (!d ? '' : d.slice(0, 4) === (S.boot ? S.boot.today : '').slice(0, 4) ? fmtDay(d).slice(0, 5) : fmtDay(d));
const soNgay = (a, z) => Math.round((Date.parse(z) - Date.parse(a)) / 864e5);
const congNgay = (d, n) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);
// các lần vay còn nợ (server tính: lần trả trừ vào lần vay cũ nhất trước), của màn đang mở
const loanLotsHien = () => ((S.screen === 'vaychitiet' ? S.loanDetail : S.loans) || {}).lots || [];
// hạn trả của một lần vay: "hẹn 06/10" / "quá hạn 3 ngày" / "còn 2 ngày" — chỉ khi lần đó còn nợ
function hanTxt(han, conNo) {
  if (!han) return '';
  const today = S.boot.today;
  if (!conNo) return `hẹn trả ${ngayNgan(han)}`;
  const n = soNgay(today, han);
  return n < 0 ? `<b style="color:var(--bad)">quá hạn ${-n} ngày</b> (hẹn ${ngayNgan(han)})`
    : n <= 3 ? `<b style="color:var(--warn)">${n === 0 ? 'đến hạn hôm nay' : 'còn ' + n + ' ngày'}</b> (hẹn ${ngayNgan(han)})`
    : `hẹn trả ${ngayNgan(han)}`;
}
function loanCard(rows) {
  const b = S.boot;
  const r0 = rows[0], cho = !r0.duyet_ts, mine = r0.user_id === S.me.id, huy = !!r0.voided;
  const id = Math.min(...rows.map((r) => r.id));
  const kg = rows.reduce((a, r) => a + r.qty * (b.phiBy[r.phi_id] ? b.phiBy[r.phi_id].kg_per_cay : 0), 0);
  // cùng luật với server (voidLoan): người ghi rút lại khi chưa duyệt, huỷ trong 10 phút sau duyệt
  const nut = huy ? ''
    : isAdmin() && cho
      ? `<div class="row gap6"><button class="btn s ok" data-a="lduyet" data-id="${id}">Duyệt</button><button class="btn s bad" data-a="lvoid" data-id="${id}">Từ chối</button></div>`
    // cùng luật với server: admin huỷ lần ghi đã duyệt trong 7 ngày; quá hạn thì ghi một lần ngược lại
    : !cho && isAdmin() && Date.now() - r0.duyet_ts > 7 * 864e5
      ? '<span class="sm muted" style="text-align:right;max-width:110px">quá 7 ngày, ghi lần ngược lại để sửa</span>'
    : isAdmin() || (mine && (cho || Date.now() - r0.duyet_ts < 10 * 60e3))
      ? `<button class="btn s bad" data-a="lvoid" data-id="${id}">${cho ? 'Rút lại' : 'Huỷ'}</button>`
      : '';
  const nhan = huy ? '<span class="badge bad">Đã huỷ</span>' : cho ? '<span class="badge warn">Chờ duyệt</span>' : `<span class="badge ok">Đã duyệt${r0.duyet_uname ? ' · ' + esc(r0.duyet_uname) : ''}</span>`;
  /* Ba dòng: (1) NGÀY GIAO NHẬN + việc + trạng thái, (2) phi và khối lượng, (3) chứng từ: số biên
     bản, hạn trả, xe, người — rồi người ghi sổ. Ngày giao nhận là ngày trên biên bản, khác lúc bấm ghi. */
  const conNo = !huy && !cho && loanLotsHien().some((l) => l.grp === r0.grp && l.con > 0);
  const ct = [r0.so_bb ? 'BB ' + esc(r0.so_bb) : '', hanTxt(r0.han, conNo), r0.bien_so ? 'xe ' + esc(r0.bien_so) : '', r0.nguoi ? esc(r0.nguoi) : '',
    r0.kho ? 'phiếu kho ' + esc(kName(r0.kho)) : ''].filter(Boolean).join(' · ');
  return `<div class="li" style="${huy ? 'opacity:.6' : ''}"><span style="${huy ? 'text-decoration:line-through' : ''}">${r0.ngay ? `<b>${ngayNgan(r0.ngay)}</b> · ` : ''}<b>${esc(loanTitle(r0.kind, r0.doitac_name || '#' + r0.doitac_id))}</b> ${nhan}<br>
    ${esc(rows.map((r) => r.phi_id + ' ' + fmtQs(r.qty, r.phi_id)).join(' · '))} · ${fmtT(kg)} tấn<br>
    ${ct ? `<span class="sm">${ct}</span><br>` : ''}<span class="sm muted">ghi sổ: ${esc(r0.uname)} · ${dmy(r0.ts)}${r0.note ? ' · ' + esc(r0.note) : ''}</span></span>${nut}</div>`;
}
// gom các dòng cùng lần ghi (grp), giữ thứ tự mới nhất trước như server trả về
const loanGroups = (items) => {
  const by = {}, order = [];
  (items || []).forEach((r) => { const g = r.grp || 'id' + r.id; if (!by[g]) { by[g] = []; order.push(g); } by[g].push(r); });
  return order.map((g) => by[g]);
};
const kgPhi = (q, phi) => q * ((S.boot.phiBy[phi] || {}).kg_per_cay || 0);

function vVayMuon() {
  const b = S.boot, L = S.loans, F = S.loan;
  const top = head('Vay mượn ngoài bãi', 'Sổ công nợ thép với đối tác, không tính vào tồn', 'more');
  if (!L) return `${top}${panelWait('vaymuon')}`;
  const dtBy = Object.fromEntries((L.doitac || []).map((d) => [d.id, d]));
  const dtAct = (L.doitac || []).filter((d) => d.active);
  if (F.doitac && !(dtBy[F.doitac] && dtBy[F.doitac].active)) F.doitac = null;
  if (!F.phi || !b.phiBy[F.phi] || b.phiBy[F.phi].active === 0) F.phi = (b.phiAct[0] || {}).id || null;
  const p = F.phi ? b.phiBy[F.phi] : null;
  const canSua = isAdmin() || canIn();

  /* --- Dư nợ: một ô tổng cho cả bãi, rồi một thẻ cho mỗi đối tác (bấm để xem chi tiết) ---
     Người dùng cần thấy ngay hai con số: bãi đang NỢ người ta bao nhiêu, và người ta đang GIỮ thép
     của bãi bao nhiêu — rồi mới tới từng đối tác, từng phi. */
  const balBy = {};
  loanBalances(L).forEach((x) => (balBy[x.dt] = balBy[x.dt] || []).push(x));
  const choBy = {};
  loanGroups((L.items || []).filter((r) => !r.duyet_ts)).forEach((rows) => { choBy[rows[0].doitac_id] = (choBy[rows[0].doitac_id] || 0) + 1; });
  let noKg = 0, coKg = 0; const noDt = new Set(), coDt = new Set();
  loanBalances(L).forEach((x) => {
    if (x.no > 0) { noKg += kgPhi(x.no, x.phi); noDt.add(x.dt); }
    if (x.co > 0) { coKg += kgPhi(x.co, x.phi); coDt.add(x.dt); }
  });
  const tong = `<div class="hero" style="border-radius:14px;padding:14px 16px"><div class="row" style="justify-content:space-between;gap:10px;flex-wrap:wrap">
      <div class="col"><span style="font-size:14px">Bãi đang nợ đối tác</span><span style="font-size:24px;font-weight:700">${fmtT(noKg)} tấn</span><span class="sm" style="color:#D6E0EE">${noDt.size} đối tác</span></div>
      <div class="col" style="align-items:flex-end;text-align:right"><span style="font-size:14px">Đối tác đang giữ của bãi</span><span style="font-size:24px;font-weight:700">${fmtT(coKg)} tấn</span><span class="sm" style="color:#D6E0EE">${coDt.size} đối tác</span></div></div></div>`;
  /* Một dòng tóm tắt theo chiều: "Mình nợ họ 0,52 tấn — D16 120 cây, D18 40 cây". Số âm là ghi TRẢ
     nhiều hơn số đã vay trong sổ — gần như luôn là sổ thiếu một lần vay; hiện "nợ −10" thì đọc ngược
     nghĩa, nên nói thẳng là trả dư. */
  const chieu = (xs, f, nhan, mau, du) => {
    const duong = xs.filter((x) => x[f] > 0), am = xs.filter((x) => x[f] < 0);
    const kg = duong.reduce((a, x) => a + kgPhi(x[f], x.phi), 0);
    return (duong.length ? `<div class="row" style="justify-content:space-between;gap:8px"><span class="sm">${nhan}</span><b style="color:${mau};white-space:nowrap">${fmtT(kg)} tấn</b></div>
        <span class="sm muted" style="line-height:1.4">${esc(duong.map((x) => x.phi + ' ' + fmtQs(x[f], x.phi)).join(' · '))}</span>` : '')
      + (am.length ? `<span class="sm" style="color:var(--warn);line-height:1.4">${du}: ${esc(am.map((x) => x.phi + ' ' + fmtQs(-x[f], x.phi)).join(' · '))}</span>` : '');
  };
  const coSo = (id) => (balBy[id] || []).some((x) => x.no || x.co) || choBy[id];
  const theDt = (d) => {
    const xs = balBy[d.id] || [];
    const noi = chieu(xs, 'no', 'Mình nợ họ', 'var(--bad)', 'Mình trả dư (sổ thiếu một lần vay?)')
      + chieu(xs, 'co', 'Họ nợ mình', 'var(--ok)', 'Họ trả dư (sổ thiếu một lần cho vay?)');
    // khoản QUÁ HẠN (phần còn nợ của từng lần vay) và hạn gần nhất của phần chưa tới hạn
    const lots = (L.lots || []).filter((l) => l.doitac_id === d.id);
    const qh = lots.filter((l) => l.quaHan);
    const toi = lots.filter((l) => l.han && !l.quaHan).sort((a, z) => (a.han < z.han ? -1 : 1))[0];
    const hanHtml = (qh.length ? `<span class="sm" style="color:var(--bad);line-height:1.4"><b>⚠ Quá hạn:</b> ${esc(qh.map((l) => l.phi_id + ' ' + fmtQs(l.con, l.phi_id) + ' (hẹn ' + ngayNgan(l.han) + ')').join(' · '))}</span>` : '')
      + (toi ? `<span class="sm muted">Hạn trả gần nhất: ${ngayNgan(toi.han)} · ${esc(toi.phi_id + ' ' + fmtQs(toi.con, toi.phi_id))}</span>` : '');
    return `<button class="card col gap6" style="text-align:left;width:100%;align-items:stretch" data-a="ldtview" data-id="${d.id}">
      <div class="row" style="justify-content:space-between;gap:8px"><b style="font-size:17px">${esc(d.name)}${d.active ? '' : ' <span class="sm muted">(đã ẩn)</span>'}</b>${choBy[d.id] ? `<span class="badge warn">${choBy[d.id]} chờ duyệt</span>` : ''}</div>
      ${noi || '<span class="sm muted">Đã tất toán</span>'}${hanHtml}
      <span class="sm" style="color:var(--pri);text-decoration:underline">Xem chi tiết ›</span></button>`;
  };
  const dsDt = (L.doitac || []).filter((d) => coSo(d.id));
  const khacDt = (L.doitac || []).filter((d) => !coSo(d.id));
  const duNo = tong + (dsDt.length ? dsDt.map(theDt).join('') : '<div class="muted">Chưa có khoản vay mượn nào đang mở.</div>')
    + (khacDt.length ? `<div class="sm muted">Đối tác đã tất toán hoặc chưa có khoản nào:</div><div class="card" style="padding:0;overflow:hidden">${khacDt.map((d) => `<button class="li" style="width:100%;background:#fff;border:0;border-bottom:1px solid var(--line);text-align:left" data-a="ldtview" data-id="${d.id}"><span>${esc(d.name)}${d.active ? '' : ' <span class="sm muted">(đã ẩn)</span>'}</span><span class="sm" style="color:var(--pri);text-decoration:underline;white-space:nowrap">Xem chi tiết ›</span></button>`).join('')}</div>` : '');

  /* --- Form ghi sổ --- */
  const dtChips = dtAct.length
    ? `<div class="wrap">${dtAct.map((d) => `<button class="chip s ${F.doitac === d.id ? 'on' : ''}" data-a="ldt" data-v="${d.id}">${esc(d.name)}</button>`).join('')}</div>`
    : '<span class="sm muted">Chưa có đối tác nào. Thêm tên ở ô dưới.</span>';
  const kindChips = Object.keys(LOAN_KIND).map((k) => `<button class="chip s ${F.kind === k ? 'on' : ''}" style="flex:1 1 40%" data-a="lkind" data-v="${k}">${LOAN_KIND[k].ten}</button>`).join('');
  // đang trả thì cho thấy số đang nợ, để người ghi đối chiếu trước khi gõ
  const cur = F.doitac && p ? (loanBalances(L).find((x) => x.dt === F.doitac && x.phi === F.phi) || { no: 0, co: 0 }) : null;
  const dangNo = !cur ? '' : F.kind === 'tra_vay' ? `Mình đang nợ ${esc(dtBy[F.doitac].name)} ${fmtQs(cur.no, F.phi)} ${F.phi}`
    : F.kind === 'tra_no' ? `${esc(dtBy[F.doitac].name)} đang nợ mình ${fmtQs(cur.co, F.phi)} ${F.phi}` : '';
  /* Thép qua bãi: thủ kho/admin lập kèm phiếu kho cùng lần ghi, để tồn khu đổi đúng mà lượng dùng
     không bị tính thêm (cho đối tác mượn không phải dùng thép). Người đếm không lập phiếu kho được,
     nên với họ chỉ có ghi sổ. */
  const khoOn = canIn() && F.kho !== false;
  if (khoOn && !(F.khu && b.khuBy[F.khu] && b.khuBy[F.khu].active)) F.khu = (b.khuAct[0] || {}).id || null;
  const ra = F.kind === 'cho_vay' || F.kind === 'tra_vay';
  // hạn trả chỉ có nghĩa với lần VAY / CHO VAY (lần trả thì đóng khoản, không có hạn)
  const coHan = F.kind === 'vay' || F.kind === 'cho_vay';
  const khoBox = !canIn() ? '' : `<b class="sm">6. Thép có qua bãi không?</b>
    <div class="row gap6"><button class="chip s f1 ${khoOn ? 'on' : ''}" data-a="lkho" data-v="1">Có, lập phiếu kho</button><button class="chip s f1 ${khoOn ? '' : 'on'}" data-a="lkho" data-v="0">Không, chỉ ghi sổ</button></div>
    ${khoOn ? `<div class="wrap">${b.khuAct.map((k) => `<button class="chip s ${F.khu === k.id ? 'on' : ''}" data-a="lkhu" data-v="${esc(k.id)}">${esc(k.name)}</button>`).join('')}</div>
      <span class="sm muted" style="line-height:1.4">${ra ? 'Thép rời' : 'Thép vào'} ${esc(kName(F.khu))}${ra && p ? ` (còn lấy được ${fmtQs(conLay(F.khu, F.phi), p)} ${F.phi})` : ''}. Tồn khu đổi theo khi duyệt, nhưng <b>không</b> tính là nhập hay dùng.</span>`
    : '<span class="sm muted" style="line-height:1.4">Chỉ ghi công nợ, tồn bãi không đổi (thép giao thẳng, không qua bãi).</span>'}`;
  const lines = (F.lines || []).length ? `<div class="card" style="padding:0;overflow:hidden">${F.lines.map((l, i) => `<div class="li"><span><b>${l.phi}</b> · ${fmtQ(l.qty, l.phi)}</span><button class="btn s bad" data-a="lrm" data-i="${i}">Xóa</button></div>`).join('')}</div>` : '';
  const form = `<div class="card col gap8">
    <b style="font-size:17px">Ghi sổ vay mượn</b>
    <b class="sm">1. Đối tác</b>${dtChips}
    <div class="row gap6"><input class="inp s f1" id="ldtnew" maxlength="60" placeholder="Tên đối tác mới" data-model="ldtnew" value="${esc(S.form.ldtnew || '')}"><button class="btn s" data-a="ldtadd">Thêm</button></div>
    <b class="sm">2. Loại</b><div class="row gap6" style="flex-wrap:wrap">${kindChips}</div>
    <span class="sm muted">${LOAN_KIND[F.kind].mo}</span>
    <b class="sm">3. Ngày giao nhận</b>
    <input class="inp s" type="date" id="lngay" data-model="lngay" max="${b.today}" value="${esc(fv('lngay', b.today))}">
    ${coHan ? `<b class="sm">Hạn trả <span class="muted" style="font-weight:400">(không bắt buộc)</span></b>
      <div class="row gap6"><input class="inp s f1" type="date" id="lhan" data-model="lhan" min="${esc(fv('lngay', b.today))}" value="${esc(S.form.lhan || '')}" style="min-width:0">
        ${[7, 15, 30].map((n) => `<button class="btn s" data-a="lhanq" data-v="${n}">+${n}</button>`).join('')}${S.form.lhan ? '<button class="btn s" data-a="lhanq" data-v="">Bỏ</button>' : ''}</div>` : ''}
    <b class="sm">4. Phi</b><div class="grid4">${b.phiAct.map((x) => `<button class="chip ${x.id === F.phi ? 'on' : ''}" data-a="lphi" data-v="${x.id}">${x.id}</button>`).join('')}</div>
    ${dangNo ? `<span class="sm">${dangNo}</span>` : ''}
    <b class="sm">5. Số ${p ? unitLbl(p) : 'cây'} ${F.phi || ''}</b>
    ${p ? `<div class="row gap6"><button class="btn s" data-a="lq" data-v="-10">−10</button><button class="btn s" data-a="lq" data-v="-1">−1</button><input class="f1" id="lqty" type="text" inputmode="numeric" pattern="[0-9]*" aria-label="Số ${unitLbl(p)} ${F.phi}" placeholder="0" data-model="lqty" value="${esc(S.form.lqty || '')}" style="min-width:0;width:100%;height:60px;border-radius:14px;border:2px solid #8C8678;background:#fff;text-align:center;font-size:32px;font-weight:700"><button class="btn s pri" data-a="lq" data-v="1">+1</button><button class="btn s pri" data-a="lq" data-v="10">+10</button></div>
      <span class="muted" id="lkg">${nkgText((parseInt(S.form.lqty, 10) || 0) * uStepOf(p), p)}</span>
      <div class="row gap6">${isCuon(p) ? '' : `<button class="btn s f1" data-a="lq" data-v="bo">+1 bó (${p.bo_size})</button>`}<button class="btn s f1" data-a="ladd">+ Thêm phi khác</button></div>` : ''}
    ${lines}
    ${khoBox}
    <b class="sm">${canIn() ? 7 : 6}. Chứng từ</b>
    <input class="inp s" id="lsobb" maxlength="40" placeholder="Số biên bản giao nhận (bắt buộc)" data-model="lsobb" value="${esc(S.form.lsobb || '')}">
    <div class="row gap6"><input class="inp s f1" id="lnguoi" maxlength="60" placeholder="Người giao/nhận bên đối tác" data-model="lnguoi" value="${esc(S.form.lnguoi || '')}" style="min-width:0"><input class="inp s" id="lbienso" maxlength="20" placeholder="Biển số xe" data-model="lbienso" value="${esc(S.form.lbienso || '')}" style="width:130px"></div>
    <input class="inp s" id="lnote" maxlength="200" placeholder="Ghi chú thêm (không bắt buộc)" data-model="lnote" value="${esc(S.form.lnote || '')}">
    ${tickBox('bb', F.bb, 'Đã có biên bản giao nhận')}
    ${tickBox('zl', F.zl, 'Đã gửi biên bản lên nhóm Zalo')}
    <button class="btn ${F.bb && F.zl ? 'pri' : 'dis'} full" style="min-height:56px;font-size:18px" data-a="lsave">GHI SỔ</button>
    ${F.bb && F.zl ? '' : '<span class="sm muted" style="line-height:1.4">Tick đủ hai ô trên mới ghi sổ được: biên bản giao nhận là chứng từ gốc, sổ này chỉ là bản ghi nhớ.</span>'}</div>`;

  /* --- Lịch sử, gom theo lần ghi (grp) để duyệt/huỷ cả lần như một phiếu --- */
  const nhom = loanGroups(L.items);
  const cho = nhom.filter((rows) => !rows[0].duyet_ts), xong = nhom.filter((rows) => rows[0].duyet_ts);

  /* --- Danh bạ đối tác: sửa tên, ẩn/hiện (admin, thủ kho — server chặn người đếm) --- */
  const dtList = !canSua || !(L.doitac || []).length ? '' : `<h2 class="sec">Đối tác</h2><div class="card" style="padding:0;overflow:hidden">${L.doitac.map((d) => (S.doitacEdit === d.id
    ? `<div class="li"><input class="inp s f1" id="ldtname" maxlength="60" value="${esc(S.form.ldtname == null ? d.name : S.form.ldtname)}" data-model="ldtname"><button class="btn s pri" data-a="ldtsave" data-id="${d.id}">Lưu</button><button class="btn s" data-a="ldtcancel">Bỏ</button></div>`
    : `<div class="li" style="${d.active ? '' : 'opacity:.6'}"><span>${esc(d.name)}${d.active ? '' : ' (đã ẩn)'}</span><span class="row gap6"><button class="btn s" data-a="ldtedit" data-id="${d.id}">Sửa tên</button><button class="btn s ${d.active ? 'bad' : ''}" data-a="ldthide" data-id="${d.id}" data-v="${d.active ? 0 : 1}">${d.active ? 'Ẩn' : 'Hiện'}</button></span></div>`)).join('')}</div>`;

  return `${top}<div class="f1 scroll pad col gap12" id="body">
    ${F.done ? `<div class="card warn col gap6"><b style="font-size:17px">Đã ghi sổ · chờ admin duyệt</b><span>${esc(F.done)}</span><span class="sm">Chỉ tính vào dư nợ sau khi admin duyệt.</span></div>` : ''}
    <h2 class="sec">Công nợ hiện tại</h2>${duNo}
    ${form}
    ${cho.length ? `<h2 class="sec">Chờ duyệt (${cho.length})</h2><div class="card" style="padding:0;overflow:hidden">${cho.map(loanCard).join('')}</div>` : ''}
    <h2 class="sec">Đã duyệt gần đây</h2>${xong.length ? `<div class="card" style="padding:0;overflow:hidden">${xong.map(loanCard).join('')}</div>` : '<div class="muted">Chưa có.</div>'}
    ${dtList}
  </div>`;
}

/* Ô tick to, bấm cả dòng: ngoài bãi tay đeo găng, ô vuông 16px là không bấm trúng. */
const tickBox = (k, on, txt) => `<button class="chip s" style="justify-content:flex-start;gap:10px;font-size:16px;min-height:48px;${on ? '' : 'background:#fff'}" data-a="ltick" data-v="${k}" aria-pressed="${!!on}"><b style="font-size:20px;width:22px">${on ? '☑' : '☐'}</b>${esc(txt)}</button>`;

/* --- Chi tiết công nợ một đối tác ---
   Mở khi bấm thẻ đối tác ở màn Vay mượn. Cho thấy: còn nợ bao nhiêu theo từng chiều, từng phi đã
   vay/đã trả bao nhiêu (để đối chiếu với biên bản), lần ghi đang chờ, và TOÀN BỘ lịch sử kể cả lần
   đã huỷ — sổ bị sửa gì thì nhìn thấy ở đây. */
function vVayChiTiet() {
  const b = S.boot, D = S.loanDetail;
  const dt = D && D.doitac && D.doitac[0];
  const top = head(dt ? esc(dt.name) : 'Chi tiết vay mượn', 'Chi tiết công nợ với đối tác', 'vaymuon');
  if (!D) return `${top}${panelWait('vaychitiet')}`;
  const tong = {};
  (D.agg || []).forEach((r) => { const x = tong[r.phi_id] || (tong[r.phi_id] = { vay: 0, tra_vay: 0, cho_vay: 0, tra_no: 0 }); x[r.kind] += r.q; });
  const phis = b.phi.filter((p) => tong[p.id]).map((p) => p.id);
  const bang = (tieu, f1, f2, n1, n2, n3, mau) => {
    const rs = phis.filter((ph) => tong[ph][f1] || tong[ph][f2]);
    if (!rs.length) return '';
    let kgCon = 0;
    const dong = rs.map((ph) => {
      const x = tong[ph], con = x[f1] - x[f2];
      kgCon += kgPhi(Math.max(0, con), ph);
      return `<tr><th>${ph}</th><td>${fmtQs(x[f1], ph)}</td><td>${fmtQs(x[f2], ph)}</td><td><b style="color:${con > 0 ? mau : con < 0 ? 'var(--warn)' : 'var(--mut)'}">${con < 0 ? 'trả dư ' + fmtQs(-con, ph) : fmtQs(con, ph)}</b></td></tr>`;
    }).join('');
    return `<h2 class="sec">${tieu}</h2><div class="card" style="padding:0;overflow-x:auto"><table class="tbl"><thead><tr><th>ɸ</th><th>${n1}</th><th>${n2}</th><th>${n3}</th></tr></thead>
      <tbody>${dong}</tbody><tfoot><tr><th colspan="3">Còn lại (tấn)</th><td><b>${fmtT(kgCon)}</b></td></tr></tfoot></table></div>`;
  };
  let noKg = 0, coKg = 0;
  phis.forEach((ph) => { const x = tong[ph]; noKg += kgPhi(Math.max(0, x.vay - x.tra_vay), ph); coKg += kgPhi(Math.max(0, x.cho_vay - x.tra_no), ph); });
  /* Còn nợ theo TỪNG LẦN VAY (lần trả trừ vào lần vay cũ nhất trước): ngày giao nhận, phi, còn bao
     nhiêu, hạn trả và trạng thái. Đây là bảng trả lời "phần nào đang quá hạn". */
  const lotBang = (chieu, tieu) => {
    const ls = (D.lots || []).filter((l) => l.chieu === chieu).sort((a, z) => (a.ngay < z.ngay ? -1 : a.ngay > z.ngay ? 1 : a.id - z.id));
    if (!ls.length) return '';
    return `<h2 class="sec">${tieu}</h2><div class="card" style="padding:0;overflow-x:auto"><table class="tbl"><thead><tr><th>Ngày</th><th>ɸ</th><th>Còn</th><th>Hạn trả</th></tr></thead><tbody>${ls.map((l) => `<tr${l.quaHan ? ' style="background:#FDECEA"' : ''}><td>${ngayNgan(l.ngay)}${l.so_bb ? `<br><span class="sm muted">BB ${esc(l.so_bb)}</span>` : ''}</td><th>${l.phi_id}</th><td>${fmtQs(l.con, l.phi_id)}</td><td>${l.han ? hanTxt(l.han, true) : '<span class="muted">không hẹn</span>'}</td></tr>`).join('')}</tbody></table></div>`;
  };
  const nhom = loanGroups(D.items);
  const cho = nhom.filter((rows) => !rows[0].duyet_ts && !rows[0].voided);
  const ls = nhom.filter((rows) => rows[0].duyet_ts || rows[0].voided);
  const huy = ls.filter((rows) => rows[0].voided).length;
  return `${top}<div class="f1 scroll pad col gap12" id="body">
    <div class="hero" style="border-radius:14px;padding:14px 16px"><div class="row" style="justify-content:space-between;gap:10px;flex-wrap:wrap">
      <div class="col"><span style="font-size:14px">Mình nợ họ</span><span style="font-size:24px;font-weight:700">${fmtT(noKg)} tấn</span></div>
      <div class="col" style="align-items:flex-end;text-align:right"><span style="font-size:14px">Họ nợ mình</span><span style="font-size:24px;font-weight:700">${fmtT(coKg)} tấn</span></div></div>
      ${!noKg && !coKg ? '<div class="sm" style="color:#D6E0EE">Đã tất toán: không còn khoản nào mở (tính các lần ghi đã duyệt).</div>' : ''}</div>
    ${bang('Mình vay của họ', 'vay', 'tra_vay', 'Đã vay', 'Đã trả', 'Còn nợ', 'var(--bad)')}
    ${bang('Họ mượn của mình', 'cho_vay', 'tra_no', 'Đã cho vay', 'Họ đã trả', 'Họ còn nợ', 'var(--ok)')}
    ${lotBang('no', 'Mình còn nợ theo từng lần vay')}
    ${lotBang('co', 'Họ còn nợ theo từng lần mượn')}
    ${phis.length ? '<div class="sm muted">Chỉ tính các lần ghi đã duyệt; lần trả được trừ vào lần vay cũ nhất trước. Lần đang chờ duyệt nằm ở mục dưới.</div>' : '<div class="muted">Chưa có lần ghi nào được duyệt với đối tác này.</div>'}
    ${cho.length ? `<h2 class="sec">Chờ duyệt (${cho.length})</h2><div class="card" style="padding:0;overflow:hidden">${cho.map(loanCard).join('')}</div>` : ''}
    <h2 class="sec">Lịch sử (${ls.length} lần ghi${huy ? ', ' + huy + ' đã huỷ' : ''})</h2>${ls.length ? `<div class="card" style="padding:0;overflow:hidden">${ls.map(loanCard).join('')}</div>` : '<div class="muted">Chưa có.</div>'}
    ${dt && dt.active ? `<button class="btn pri full" data-a="ldtghi" data-id="${dt.id}">GHI SỔ VỚI ĐỐI TÁC NÀY</button>` : ''}
  </div>`;
}

/* --- Cài đặt (admin) --- */
const numIn = (s) => { const x = parseFloat(String(s).trim().replace(',', '.')); return Number.isFinite(x) ? x : NaN; };
// số của một phi theo đơn vị người dùng hiểu: thép cây theo bó/cây/kg, thép cuộn theo kg mỗi cuộn
function phiForm(p) {
  const mn = String(Math.round((p.min_stock / p.bo_size) * 10) / 10).replace('.', ','); // 29/57 bó hiện 0,5 thay vì 0,51
  return isCuon(p) ? { kgc: String(Math.round(p.kg_per_cay * p.bo_size)), mn } : { bo: String(p.bo_size), kg: String(p.kg_per_cay).replace('.', ','), mn };
}
const phiStdOf = (id) => (S.boot.phiStd || []).find((s) => s.id === id);
const PHI_FIELDS = ['bo', 'kg', 'kgc', 'mn'];
// dòng quy đổi đọc số đang gõ trong form, để admin thấy ngay số sai
function phiHint(p) {
  const f = phiForm(p), g = (k) => numIn(fv(k + '-' + p.id, f[k]));
  const mn = g('mn');
  if (isCuon(p)) {
    const kgc = g('kgc'), d = parseInt(p.id.slice(1), 10) || 0;
    if (!(kgc > 0) || !(mn >= 0)) return 'Số chưa hợp lệ';
    // "dưới ≈ 4,00 tấn" đọc lửng; ô đang gõ là số CUỘN nên nói theo cuộn trước, tấn để trong ngoặc
    return `1 cuộn dài ≈ ${d ? fmtInt(kgc / (0.00617 * d * d)) : '—'} m · báo động khi còn dưới ${fmtDec(mn)} cuộn (≈ ${fmtT(mn * kgc)} tấn)`;
  }
  const bo = g('bo'), kg = g('kg');
  if (!(bo >= 1) || !(kg > 0) || !(mn >= 0)) return 'Số chưa hợp lệ';
  // mn = 1 thì số tấn của mức báo động đúng bằng số tấn một bó vừa ghi ở trên: nhắc lại
  // y hệt một lần nữa chỉ làm người đọc tưởng tính sai, nên bỏ.
  return `1 bó ≈ ${fmtT(bo * kg)} tấn · báo động khi còn dưới ${fmtInt(mn * bo)} cây`
    + (mn === 1 ? ' (đúng 1 bó)' : ` ≈ ${fmtT(mn * bo * kg)} tấn`);
}
function phiCard(p) {
  const cu = isCuon(p), f = phiForm(p), s = phiStdOf(p.id), sf = s ? phiForm({ ...s, unit: p.unit }) : null;
  const custom = sf && Object.keys(f).some((k) => numIn(f[k]) !== numIn(sf[k]));
  const inp = (k, label, mode) => `<label class="f1 sm">${label}<input class="inp s" style="width:100%" id="${k}-${p.id}" data-model="${k}-${p.id}" inputmode="${mode}" value="${esc(fv(k + '-' + p.id, f[k]))}"></label>`;
  const fields = cu
    ? inp('kgc', 'kg / 1 cuộn', 'numeric') + inp('mn', 'Báo động (cuộn)', 'decimal')
    : inp('bo', 'Cây / 1 bó', 'numeric') + inp('kg', 'kg / 1 cây', 'decimal') + inp('mn', 'Báo động (bó)', 'decimal');
  const stdTxt = !sf ? '' : cu ? `Chuẩn: cuộn ${fmtInt(numIn(sf.kgc))} kg · báo động ${sf.mn} cuộn` : `Chuẩn: ${sf.bo} cây/bó · ${sf.kg} kg/cây · báo động ${sf.mn} bó`;
  const off = p.active === 0;
  return `<div class="card col gap6" style="${off ? 'opacity:.6' : ''}"><div class="row" style="justify-content:space-between;align-items:baseline"><b style="font-size:18px">${p.id} <span class="sm muted">${off ? 'đang tắt' : cu ? 'thép cuộn' : 'thép cây 11,7 m'}</span></b>${sf ? `<span class="sm b" style="color:${custom ? 'var(--warn)' : 'var(--ok)'}">${custom ? 'Số riêng' : 'Số chuẩn'}</span>` : ''}</div>
    ${off ? '' : `<div class="row gap6">${fields}</div>
    <div class="sm b" id="ph-${p.id}">${esc(phiHint(p))}</div>`}
    <div class="row gap6" style="justify-content:space-between;align-items:center">${sf && !off ? `<span class="sm muted">${stdTxt}</span><button class="btn s" data-a="pstd" data-p="${p.id}">Dùng số chuẩn</button>` : `<span class="sm muted">${off ? 'Đang tắt: phi này không hiện trong bảng đếm và nhập kho' : 'Phi bãi không dùng thì tắt đi cho bảng đếm gọn'}</span>`}<button class="btn s ${off ? '' : 'bad'}" data-a="phioff" data-p="${p.id}" data-v="${off ? 1 : 0}">${off ? 'Bật lại' : 'Tắt phi'}</button></div></div>`;
}
function fillStd(p) {
  const s = phiStdOf(p.id); if (!s) return false;
  const sf = phiForm({ ...s, unit: p.unit });
  Object.keys(sf).forEach((k) => (S.form[k + '-' + p.id] = sf[k]));
  return true;
}
/* ===== Giờ làm việc và khung đếm ở màn Cài đặt =====
   Xem trước khung giờ NGAY khi admin đang chọn, trước khi bấm lưu — nên phải tính trên máy, không
   chờ server. Đây là bản chép của slotDefs/fmtGio trong worker.js; bộ test so hai bản với nhau.
   Mọi màn khác (Tổng quan, Duyệt) vẫn dùng nhãn server gửi xuống, không dùng hàm này. */
const fmtGio = (x) => {
  const h = Math.floor(x + 1e-9), m = Math.round((x - h) * 60);
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
};
function slotPreview(n, a, z) {
  const len = (z - a) / n;
  return Array.from({ length: n }, (_, i) => {
    const from = a + i * len, to = i === n - 1 ? z : from + len;
    const ten = n === 2 ? (i === 0 ? 'buổi sáng' : 'buổi chiều') : `lần ${i + 1}`;
    return `${ten} (${fmtGio(from)}–${fmtGio(to)})`;
  });
}
// số đang chọn trên màn hình (chưa lưu thì lấy số đã lưu)
const slotForm = () => {
  const st = S.boot.settings || {};
  return {
    n: parseInt(fv('sslots', st.report_slots_per_day || 1), 10),
    a: parseInt(fv('sfrom', st.work_from == null ? 6 : st.work_from), 10),
    z: parseInt(fv('sto', st.work_to == null ? 18 : st.work_to), 10),
  };
};
// dòng xem trước; cùng điều kiện với settingsUpdate để admin thấy lỗi trước khi bấm lưu
function slotPrevTxt() {
  const { n, a, z } = slotForm();
  if (!(a < z)) return 'Giờ kết thúc phải sau giờ bắt đầu.';
  if (z - a < n) return `Giờ làm ${z - a} tiếng không đủ cho ${n} lần đếm (mỗi lần cần ít nhất 1 tiếng).`;
  if (n === 1) return `Đếm 1 lần trong ngày, không chia khung giờ.`;
  return 'Khung đếm: ' + slotPreview(n, a, z).join(' · ') + '. Đếm trước giờ bắt đầu tính vào khung đầu, sau giờ kết thúc tính vào khung cuối.';
}
const slotBad = () => { const { n, a, z } = slotForm(); return !(a < z) || z - a < n; };
function slotOpts() {
  const { n } = slotForm();
  return [1, 2, 3, 4].map((k) => `<option value="${k}" ${n === k ? 'selected' : ''}>${k === 1 ? '1 lần (như trước)' : k + ' lần'}</option>`).join('');
}
const hourOpts = (cur, lo, hi) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)
  .map((h) => `<option value="${h}" ${cur === h ? 'selected' : ''}>${h}h</option>`).join('');
function vSettings() {
  const b = S.boot;
  const phi = b.phi.map(phiCard).join('');
  const uById = {}; (S.users || []).forEach((u) => (uById[u.id] = u));
  const khu = b.khu.map((k) => {
    const asg = b.ku[k.id] || [];
    const names = asg.map((id) => (uById[id] ? uById[id].name : '#' + id));
    const open = S.kuEdit === k.id;
    /* Bảng chọn bỏ tài khoản ĐÃ XOÁ: /users trả cả dòng đã xoá (màn Người dùng cần để khôi phục),
       còn server thì từ chối gán khu cho người đã xoá — bày tên họ ra đây chỉ dẫn tới mất cả lượt
       lưu phân công vì một lỗi 400, mà người bấm không hiểu vì sao. */
    const picker = open ? `<div class="col gap6" style="border-top:1px solid var(--line);padding-top:8px">
      ${(S.users || []).filter((u) => u.role !== 'admin' && !u.deleted && !u.locked).map((u) => `<button class="chip ${S.kuPick.includes(u.id) ? 'on' : ''}" style="justify-content:flex-start;font-size:16px" data-a="kupick" data-v="${u.id}">${esc(u.name)} · ${ROLE[u.role] || u.role}</button>`).join('') || '<span class="sm muted">Chưa có tài khoản nào ngoài admin.</span>'}
      <span class="sm muted" style="line-height:1.4">${S.kuPick.length ? 'Chỉ ' + S.kuPick.length + ' người được chọn (và admin) đếm được khu này.' : 'Không chọn ai = mọi người đều đếm được khu này.'}</span>
      <div class="row gap6"><button class="btn s pri f1" data-a="kusave" data-k="${esc(k.id)}">Lưu phân công</button><button class="btn s f1" data-a="kucancel">Hủy</button></div></div>` : '';
    return `<div class="card col gap6" style="${k.active ? '' : 'opacity:.6'}"><div class="row gap6"><b style="width:30px">${esc(k.id)}</b><input class="inp s f1" id="kn-${esc(k.id)}" data-model="kn-${esc(k.id)}" value="${esc(fv('kn-' + k.id, k.name))}"></div>
      <div class="row gap6"><button class="btn s f1" data-a="ksave" data-k="${esc(k.id)}">Lưu tên</button><button class="btn s f1 ${k.active ? 'bad' : ''}" data-a="khide" data-k="${esc(k.id)}" data-v="${k.active ? 0 : 1}">${k.active ? 'Ẩn khu' : 'Hiện lại'}</button></div>
      <button class="row gap6" style="background:transparent;border:0;padding:4px 0;min-height:44px;text-align:left;width:100%;justify-content:space-between" data-a="kuedit" data-k="${esc(k.id)}">
        <span class="sm" style="line-height:1.4">Phụ trách: <b>${names.length ? esc(names.join(', ')) : 'chưa gán ai (mọi người đếm được)'}</b></span>
        <span class="sm" style="color:var(--pri);text-decoration:underline;white-space:nowrap">${open ? 'Đóng' : 'Sửa'}</span></button>
      ${picker}</div>`;
  }).join('');
  return `${head('Cài đặt', 'Khu, phi và quy tắc', 'more')}<div class="f1 scroll pad col gap12" id="body">
    <h2 class="sec">Quy tắc</h2>
    <div class="card col gap8"><div class="sm muted" style="line-height:1.4">Mọi khu luôn hiện đủ phi D6→D36. Phi khu không có thì người đếm để trống, hệ thống hiểu là 0 — không còn cài đặt tự ẩn phi khỏi khu.</div>
    <label class="sm">Bắt buộc đếm lại khi "giữ nguyên" quá (ngày)<input class="inp s" style="width:100%" id="s-keep" inputmode="numeric" value="${b.settings.max_keep_streak}"></label>
    <label class="sm">Mỗi khu phải đếm mấy lần/ngày<select class="inp s" style="width:100%" id="s-slots" data-model="sslots">${slotOpts()}</select></label>
    ${slotForm().n > 1 ? `<div class="row gap6"><label class="f1 sm">Giờ làm từ<select class="inp s" style="width:100%" id="s-from" data-model="sfrom">${hourOpts(slotForm().a, 0, 23)}</select></label>
      <label class="f1 sm">đến<select class="inp s" style="width:100%" id="s-to" data-model="sto">${hourOpts(slotForm().z, 1, 24)}</select></label></div>` : ''}
    <span class="sm b" id="slotprev" style="line-height:1.45;${slotBad() ? 'color:var(--bad)' : ''}">${esc(slotPrevTxt())}</span>
    <span class="sm muted" style="line-height:1.45">Từ 2 lần trở lên là <b>bắt buộc</b>: giờ làm được chia đều thành các khung; khung đã qua mà khu chưa đếm thì màn Duyệt tính là việc chưa xử lý, và việc thiếu được ghi vào nhật ký lúc sổ tự chốt sau 0h. Lần đếm sau không bù cho khung trước. Khu trống không bị đòi. Mỗi lần khu báo lại phải được duyệt lại.</span>
<button class="btn s" data-a="ssave">Lưu quy tắc</button></div>
    <h2 class="sec">Khu bãi</h2>${khu}
    <div class="card col gap6"><b>Thêm khu mới</b><input class="inp s" id="newk" placeholder="Tên khu, ví dụ: Khu I" data-model="newk" value="${esc(S.form.newk || '')}"><button class="btn s pri" data-a="kadd">Thêm khu</button></div>
    <h2 class="sec">Phi thép (D6 - D36)</h2>
    <div class="sm muted" style="line-height:1.5">Số chuẩn: kg/cây theo TCVN (giống nhau giữa các nhà máy), số cây/bó theo bó nhà máy Hòa Phát (~3,3 tấn/bó), cuộn D6/D8 Hòa Phát, Việt Ý ~2.000 kg. Bó Việt Ý hoặc bó tách ở bãi có số cây khác: sửa riêng phi đó. Số thập phân gõ dấu phẩy (0,5) hoặc dấu chấm.</div>
    <button class="btn s full" data-a="pstdall">Điền số chuẩn cho tất cả phi (xem lại rồi bấm LƯU)</button>
    ${phi}
    <button class="btn pri full" data-a="psaveall">LƯU CẤU HÌNH PHI</button>
    <button class="btn full" style="border:2px dashed var(--bad);color:var(--bad)" data-a="phiseed">Khôi phục phi bị xoá (D6–D36)</button>
    ${vReset()}</div>`;
}

/* Đặt lại số liệu thép. Hai việc tách làm hai nút vì hậu quả khác nhau một trời một vực, và nút
   phá được thì đặt riêng ở cuối, sau một ô phải gõ câu xác nhận — không để nó nằm cạnh nút dùng
   hằng ngày. Chỉ admin đầu tiên thấy mục này; chốt chặn thật nằm ở server (resetData). */
function vReset() {
  if (!isOwner()) return '';
  const b = S.boot, T = totals();
  const dangCo = fmtT(T.kg);
  const go = (S.form.wipeword || '').trim().toUpperCase() === 'XOA SACH';
  return `<h2 class="sec">Dữ liệu thép</h2>
  <div class="card col gap8"><b style="font-size:17px">Đang có trong bãi: ${dangCo} tấn</b>
    <span class="sm muted" style="line-height:1.45">Nên tải một bản sao trước khi đặt lại. Nhật ký và lịch sử đếm thì không bao giờ xoá được (database chặn), nên con số cũ vẫn còn một chỗ đọc lại.</span>
    <div class="row gap6"><button class="btn s f1" data-a="exportday" data-d="${esc(b.today)}">Tải tồn theo khu (CSV)</button>
      <button class="btn s f1" data-a="dlall">Tải báo cáo từ ngày đầu (CSV)</button></div>
  </div>
  <div class="card col gap8"><b style="font-size:17px">Sao lưu toàn bộ</b>
    <span class="sm" style="line-height:1.45">Một tệp chứa <b>tất cả</b>: phi, khu, tài khoản, số đếm, phiếu, các ngày đã chốt, tồn chuẩn và nhật ký. Khác hai tệp CSV ở trên — tệp này <b>nạp lại được</b>, nên nó mới là đường lùi thật nếu lỡ tay. Nên tải định kỳ và cất ra ngoài máy.</span>
    <button class="btn s pri full" data-a="dlbackup">TẢI BẢN SAO TOÀN BỘ (JSON)</button>
    <div style="border-top:1px solid var(--line);padding-top:8px" class="col gap6">
      <b class="sm">Nạp lại từ bản sao</b>
      <span class="sm" style="line-height:1.45">Thay <b>sạch</b> số liệu hiện tại bằng số liệu trong tệp — không trộn. Nhật ký thì giữ nguyên và ghi thêm một dòng, vì database không cho xoá nhật ký.</span>
      <input class="inp s" type="file" accept=".json,application/json" id="bkfile" data-change="bkfile">
      ${S.bkFile ? `<span class="sm b">Đã chọn: ${esc(S.bkFile.ten)} · ${esc(S.bkFile.mo)}</span>
      <label class="sm">Gõ <b>NAP LAI</b> để mở nút<input class="inp s" style="width:100%" id="napword" placeholder="NAP LAI" data-model="napword" value="${esc(S.form.napword || '')}"></label>
      <button class="btn s full ${(S.form.napword || '').trim().toUpperCase() === 'NAP LAI' ? 'bad' : 'dis'}" data-a="dorestore">NẠP LẠI TỪ BẢN SAO</button>` : ''}
    </div>
  </div>
  <div class="card col gap8"><b style="font-size:17px">Đặt tồn về 0 (kiểm kê lại)</b>
    <span class="sm" style="line-height:1.45">Ghi một mốc <b>cả bãi = 0</b> cho hôm nay: coi như admin vừa kiểm kê và khai 0 cho mọi khu. Lịch sử và báo cáo theo kỳ cũ <b>vẫn xem được</b>; thống kê tính lại từ mốc này. Hôm nay thành <b>đã chốt</b>, từ mai đếm và nhập bình thường từ 0.<br>Bấm nhầm thì vào Duyệt → <i>Hoàn tác đặt lại số liệu</i> (trong ngày): tồn và các báo cáo của hôm nay trở lại <b>đúng như trước</b>, vì hệ thống chụp lại trạng thái trước khi đặt lại.</span>
    <button class="btn s full" style="border:2px solid var(--warn)" data-a="resetzero">ĐẶT TỒN VỀ 0</button>
  </div>
  <div class="card bad col gap8"><b style="font-size:17px">Xoá sạch dữ liệu thép</b>
    <span class="sm" style="line-height:1.45">Xoá <b>mọi</b> số đếm, tồn chuẩn, phiếu nhập/chuyển, ngày đã chốt và bảng tổng hợp — bãi trở lại như mới dựng. <b>Báo cáo theo kỳ cũ mất theo và KHÔNG hoàn tác được.</b> Dùng khi chạy thử xong, bắt đầu dùng thật.</span>
    <label class="sm">Gõ <b>XOA SACH</b> để mở nút<input class="inp s" style="width:100%" id="wipeword" placeholder="XOA SACH" data-model="wipeword" value="${esc(S.form.wipeword || '')}"></label>
    <button class="btn s full ${go ? 'bad' : 'dis'}" data-a="resetwipe">XOÁ SẠCH DỮ LIỆU THÉP</button>
  </div>`;
}

/* ===================== KHUNG CHÍNH ===================== */
function tabsHtml() {
  const on = { home: 'home', ton: 'home', khu: 'dem', dem: 'dem', nhap: 'nhap', duyet: 'duyet', nhatky: 'more', lichsu: 'more', baocao: 'more', more: 'more', stats: 'more', chamcong: 'more', users: 'more', settings: 'more', pin: 'more', vaymuon: 'more', vaychitiet: 'more' }[S.screen];
  const T = [['home', 'Tổng quan', IC.home, true], ['dem', 'Báo cáo', IC.count, true], ['nhap', 'Nhập', IC.inn, canIn()], ['duyet', 'Duyệt', IC.shield, isAdmin()], ['more', 'Thêm', IC.more, true]].filter((t) => t[3]);
  return `<nav class="tabs">${T.map((t) => `<button class="tab ${on === t[0] ? 'on' : ''}" data-a="nav" data-s="${t[0]}">${t[2]}${t[1]}</button>`).join('')}</nav>`;
}

function vMain() {
  let body = '';
  switch (S.screen) {
    case 'home': body = vHome(); break;
    case 'khu': body = vKhu(); break;
    case 'dem': body = demView(); break;
    case 'nhap': body = vNhap(); break;
    case 'ton': body = vTon(); break;
    case 'duyet': body = vDuyet(); break;
    case 'nhatky': body = vNhatKy(); break;
    case 'lichsu': body = vLichSu(); break;
    case 'baocao': body = vBaoCao(); break;
    case 'stats': body = vStats(); break;
    case 'chamcong': body = vChamCong(); break;
    case 'more': body = vMore(); break;
    case 'pin': body = vPin(); break;
    case 'users': body = vUsers(); break;
    case 'settings': body = vSettings(); break;
    case 'vaymuon': body = vVayMuon(); break;
    case 'vaychitiet': body = vVayChiTiet(); break;
    default: body = vHome();
  }
  const showToast = S.toast && S.screen !== 'dem';
  const noTabs = S.screen === 'dem' && S.sel;
  return `${busyHtml()}${verBar()}${netBar()}${showToast ? `<div class="toast ${S.toastErr ? 'err' : ''}" data-toast="1" role="${S.toastErr ? 'alert' : 'status'}" aria-live="${S.toastErr ? 'assertive' : 'polite'}" style="margin-top:calc(8px + env(safe-area-inset-top))">${esc(S.toast)}</div>` : ''}${body}${noTabs ? '' : tabsHtml()}${askHtml()}`;
}

function render() {
  const body = document.getElementById('body');
  const mx = document.getElementById('mx');
  const keep = { screen: S._last, b: body ? body.scrollTop : 0, m: mx ? mx.scrollTop : 0 };
  const ae = document.activeElement;
  // giữ cả vị trí con trỏ: vẽ lại mà con trỏ nhảy về cuối thì số đang gõ dở sẽ sai
  let fc = null;
  if (ae && ae.id && (ae.tagName === 'INPUT' || ae.tagName === 'SELECT')) {
    fc = { id: ae.id, s: null, e: null };
    try { fc.s = ae.selectionStart; fc.e = ae.selectionEnd; } catch (er) { /* type=date không cho đọc */ }
  }
  let html;
  if (!S.me || S.screen === 'login') html = busyHtml() + vLogin() + askHtml();
  else if (S.me.must_change) html = busyHtml() + vForcePin() + askHtml();
  else html = vMain();
  $app.innerHTML = html;
  const nb = document.getElementById('body'), nm = document.getElementById('mx');
  if (keep.screen === S.screen) { if (nb) nb.scrollTop = keep.b; if (nm) nm.scrollTop = keep.m; }
  if (S.scrollSel && nm) {
    const idx = S.boot.phiAct.findIndex((p) => p.id === S.scrollSel);
    nm.scrollTop = Math.max(0, ROWH + idx * ROWH - 110);
    S.scrollSel = null;
  }
  if (S.ask) {
    const y = $app.querySelector('[data-a="askyes"]'); // hộp xác nhận mở: focus vào nút, không giành lại ô nhập
    if (y) y.focus();
  } else if (fc) {
    const el = document.getElementById(fc.id);
    if (el) { el.focus(); try { if (fc.s != null && el.setSelectionRange) el.setSelectionRange(fc.s, fc.e); } catch (er) { /* ô không hỗ trợ */ } }
  }
  S._last = S.screen;
}

/* ===================== HÀNH ĐỘNG ===================== */
const val = (id) => { const e = document.getElementById(id); return e ? e.value : ''; };
function addLine(phi, qty) {
  const l = S.nhap.lines.find((x) => x.phi === phi);
  if (l) l.qty += qty; else S.nhap.lines.push({ phi, qty });
}
// số lượng nhập kho gõ trực tiếp: đọc từ ô trước mỗi thao tác (theo đơn vị của phi)
function syncQty() {
  const e = document.getElementById('nqty');
  if (!e) return;
  const cap = Math.floor(99999 / uStepOf(S.nhap.phi)); // server chặn 99999 cây mỗi phi mỗi phiếu
  S.nhap.qty = Math.min(cap, parseInt(e.value.replace(/\D/g, '') || '0', 10));
}

async function go(screen, noPush) {
  S.err = ''; S.sel = null;
  delete S.loadErr[screen];
  // lựa chọn khung giờ chọn dở mà không lưu: vào lại Cài đặt phải thấy số ĐANG LƯU, không phải số chọn dở
  if (screen === 'settings') ['sslots', 'sfrom', 'sto'].forEach((k) => delete S.form[k]);
  if (screen === 'dem') {
    const ok = (id) => id && S.boot.khuBy[id] && S.boot.khuBy[id].active && canCount(id);
    if (!S.boot.khuAct.length) { say('Chưa có khu nào đang dùng. Admin vào Thêm → Cài đặt để thêm khu.', true); S.screen = 'home'; return render(); }
    const mine = myKhu();
    if (!mine.length) S.screen = 'khu'; // chưa được giao khu nào: về màn chọn khu để thấy lời nhắc
    else {
      let last = null;
      try { last = localStorage.getItem(lastKhuKey()); } catch (e) { /* bỏ qua */ }
      openDem(ok(S.khu) ? S.khu : ok(last) ? last : mine[0].id);
    }
  } else S.screen = screen;
  if (!noPush) pushNav();
  render();
  try {
    if (screen === 'duyet') { S.review = null; S.subs = {}; render(); S.review = await api('GET', '/review'); }
    else if (screen === 'nhatky') { await loadAudit(false); }
    else if (screen === 'users') { await loadUsers(); }
    else if (screen === 'lichsu') { await loadHist(S.hist.date || ydayOf(S.boot.today)); }
    else if (screen === 'baocao') { if (!S.bc.from) [S.bc.from, S.bc.to] = repRange('month'); await loadRep(); }
    else if (screen === 'stats') { S.usage = null; render(); S.usage = (await api('GET', '/usage?days=' + S.usageDays)).items; }
    else if (screen === 'chamcong') { await loadChamCong(); }
    else if (screen === 'settings') { S.kuEdit = null; await loadBoot(); await loadUsers(); }
    else if (screen === 'vaymuon') { S.loans = null; render(); S.loans = await api('GET', '/loans'); }
    else if (screen === 'vaychitiet') { S.loanDetail = null; render(); S.loanDetail = await api('GET', '/loans?doitac=' + S.loanDt); }
    else if (['home', 'ton', 'khu', 'nhap', 'dem'].includes(screen)) { await loadBoot(); }
  } catch (e) { S.loadErr[screen] = e.message; say(e.message, true); }
  render();
}

/* Nút Back của điện thoại đi về màn trước thay vì đóng hẳn app (app cài về máy không có nút Back trên màn hình) */
function pushNav() {
  try {
    const st = history.state;
    if (!st || st.s !== S.screen || st.k !== (S.khu || null)) history.pushState({ s: S.screen, k: S.khu || null }, '');
  } catch (e) { /* bỏ qua */ }
}
window.addEventListener('popstate', (e) => {
  if (!S.me || S.me.must_change) return;
  if (S.ask) { const a = S.ask; S.ask = null; a.resolve(false); pushNav(); return render(); } // Back = Để sau
  if (S.sel) { ACTIONS.closesel(); pushNav(); return; } // Back = đóng bảng số
  const st = e.state, sc = st && st.s ? st.s : 'home';
  if (sc === 'dem' && st.k && S.boot.khuBy[st.k] && S.boot.khuBy[st.k].active) S.khu = st.k;
  go(sc, true);
});
// Một thao tác ghi tại một thời điểm: bấm đúp hay mạng chậm cũng không gửi trùng (ví dụ 2 phiếu nhập)
async function act(fn, okMsg, busyMsg) {
  if (S.busy) return;
  S.busy = true; S.busyMsg = busyMsg || 'Đang lưu...'; render();
  try { await fn(); if (okMsg) say(okMsg); } catch (e) { say(e.message, true); }
  finally { S.busy = false; S.busyMsg = ''; }
  render();
}

// Tải tệp bằng fetch rồi lưu: điều hướng bằng location.href trong app đã cài dễ để lại tab trắng
async function download(path, fname) {
  if (S.busy) return;
  S.busy = true; S.busyMsg = 'Đang tạo tệp...'; render();
  try {
    const r = await fetch('/api' + path, { credentials: 'same-origin' });
    if (!r.ok) throw new Error('Không tải được tệp (lỗi ' + r.status + ')');
    const u = URL.createObjectURL(await r.blob());
    const a = document.createElement('a');
    a.href = u; a.download = fname;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 10000);
    say('Đã tải ' + fname);
  } catch (e) { say(e.net ? 'Không có kết nối mạng' : e.message, true); }
  finally { S.busy = false; S.busyMsg = ''; }
  render();
}

const V_MAX = 99999; // trần server cho số đếm một phi (intIn trong putCounts)
function pressKey(i) {
  const f = S.field;
  if (i === 11) { S.field = f === 'bo' ? 'le' : 'bo'; }
  else if (i === 9) { S.rep[f] = false; S[f] = S[f].slice(0, -1); S.typed = true; }
  else {
    const d = String(i === 10 ? 0 : i + 1);
    const cur = S.rep[f] ? '' : S[f]; // ô đang hiện số cũ: gõ số mới sẽ thay thế
    // cuộn dở gõ theo % của một cuộn (bo_size phần) nên không vượt quá bo_size - 1
    const maxLen = f === 'bo' ? 3 : S.sel && isCuon(S.sel) ? String(S.boot.phiBy[S.sel].bo_size - 1).length : 4;
    const next = (cur === '0' ? d : cur + d).slice(0, maxLen);
    /* Chặn ngay tại bàn số thay vì để server từ chối lúc bấm GỬI: 999 bó D10 là 439.560 cây,
       người đếm nhập xong cả khu rồi mới biết số không hợp lệ và không rõ phi nào sai. */
    const size = S.sel ? S.boot.phiBy[S.sel].bo_size : 1;
    const boN = parseInt((f === 'bo' ? next : S.bo) || '0', 10);
    const leN = parseInt((f === 'le' ? next : S.le) || '0', 10);
    if (boN * size + leN > V_MAX) {
      const cu = isCuon(S.sel);
      return say(`Số ${S.sel} quá lớn, không nhập thêm được. Kiểm tra lại số ${cu ? 'cuộn' : 'bó'} (tối đa ${fmtInt(Math.floor(V_MAX / size))} ${cu ? 'cuộn' : 'bó'}).`, true);
    }
    S.rep[f] = false;
    S[f] = next;
    S.typed = true;
  }
}
function nextPhi(p) {
  const ids = S.boot.phiAct.map((x) => x.id);
  const i = ids.indexOf(p);
  return i >= 0 && i < ids.length - 1 ? ids[i + 1] : null;
}
function fillSel(p) {
  const c = p ? S.draft.cells[p] : null;
  if (c && c.bo != null && c.le != null && c.kind === 'dem') { S.bo = String(c.bo); S.le = String(c.le); }
  else if (c) { // số lưu không kèm bó/lẻ (giữ nguyên, admin chọn số...): tách theo cỡ bó/cuộn
    const sz = S.boot.phiBy[p].bo_size || 1, q = Math.floor(c.v / sz);
    S.bo = q ? String(q) : ''; S.le = String(c.v - q * sz);
  }
  else { S.bo = ''; S.le = ''; }
  S.rep = { bo: S.bo !== '', le: S.le !== '' };
  S.typed = false;
  S.field = 'bo';
}
function settle(kind) {
  const p = S.sel; if (!p) return;
  const size = S.boot.phiBy[p].bo_size;
  const boN = parseInt(S.bo || '0', 10), leN = parseInt(S.le || '0', 10);
  if (kind === 'keep') {
    const why = keepBlock(S.khu, p);
    if (why) return say(why, true);
    S.draft.cells[p] = { v: refOf(S.khu, p), kind: 'giu' };
  /* Bấm "Hết (0)" là ĐẾM THẬT và xác nhận hết thép, nên ghi kind 'dem' với v = 0 — khác hẳn
     ĐỂ TRỐNG, cái đó mới là kind 'zero' và do sendCountsInner điền cho ô người đếm không chạm tới.
     Phân biệt hai cái này là lý do màn Duyệt nói được "khu để trống D25 trong khi dự kiến 72 cây",
     rất khác "khu đã đếm, D25 hết thật". Trước bản 1.3 'zero' mang nghĩa ngược lại (xem migration 10). */
  } else if (kind === 'zero') S.draft.cells[p] = { v: 0, kind: 'dem', bo: 0, le: 0 };
  /* Mở lại một ô đã có số mà KHÔNG gõ gì thì ô giữ nguyên như cũ, kể cả LOẠI của nó. Trước đây số
     cũ được tách ra bó/lẻ rồi lưu lại như vừa gõ, nên chạm qua ô "giữ nguyên" là nó thành "đếm thật"
     (chuỗi giữ nguyên về 0, lách được giới hạn N ngày), và chạm qua ô "để trống" là nó thành "đã đếm,
     hết (0)" mà không qua hộp hỏi của nút Hết (0). */
  else if (!S.typed && S.draft.cells[p]) { /* không đổi gì */ }
  else if (S.bo !== '' || S.le !== '') S.draft.cells[p] = { v: boN * size + leN, kind: 'dem', bo: boN, le: leN };
  // chưa gõ gì mà bấm TIẾP: đứng lại, không lặng lẽ nhảy qua phi chưa đếm
  else return say((isCuon(p) ? 'Gõ số cuộn nguyên / % cuộn dở' : 'Gõ số bó / cây lẻ') + ', hoặc bấm "Hết (0)" nếu khu không còn phi này.', true);
  saveDraft();
  const nx = nextPhi(p);
  S.sel = nx; fillSel(nx); S.scrollSel = nx;
}

const ACTIONS = {
  async login() {
    if (S.busy) return; // bấm nhiều lần khi mạng chậm sẽ tính thành nhiều lần sai PIN
    const phone = val('phone'), pin = val('pin');
    S.form.phone = phone;
    if (!phone || pin.length !== 4) { S.err = 'Nhập số điện thoại và PIN 4 số'; return render(); }
    S.busy = true; S.busyMsg = 'Đang đăng nhập...'; S.err = ''; render();
    try {
      const r = await api('POST', '/login', { phone, pin });
      try { localStorage.setItem('kt:phone', phone); } catch (e) { /* bỏ qua */ }
      S.me = r.user; S.err = ''; S.screen = 'home';
      if (!r.user.must_change) { await loadBoot(); flushPending(); }
    } catch (e) { S.err = e.message; S.me = null; S.screen = 'login'; }
    finally { S.busy = false; S.busyMsg = ''; }
    try { history.replaceState({ s: S.screen, k: null }, ''); } catch (e) { /* bỏ qua */ }
    render();
  },
  async logout() { try { await api('POST', '/logout', {}); } catch (e) { /* bỏ qua */ } forgetBoot(); S.me = null; S.stale = null; S.boot = null; S.screen = 'login'; S.form = {}; S.err = ''; render(); },
  async changepin() {
    if (S.busy) return;
    const a = val('pin0'), n1 = val('pin1'), n2 = val('pin2');
    if (!/^\d{4}$/.test(n1)) { S.err = 'PIN mới phải là 4 chữ số'; return render(); }
    if (n1 !== n2) { S.err = 'Hai lần nhập PIN mới không giống nhau'; return render(); }
    S.busy = true; S.busyMsg = 'Đang lưu PIN...'; render();
    try { await api('POST', '/change-pin', { pin: a, newPin: n1 }); S.err = ''; S.me.must_change = 0; await loadBoot(); S.screen = 'home'; say('Đã đổi PIN.'); }
    catch (e) { S.err = e.message; }
    finally { S.busy = false; S.busyMsg = ''; }
    render();
  },
  askyes() { const a = S.ask; S.ask = null; render(); if (a) a.resolve(true); },
  askno() { const a = S.ask; S.ask = null; render(); if (a) a.resolve(false); },
  retry(d) { S.loadErr = {}; go(d.s); },
  // thẻ nhắc một khu cụ thể (data-k) thì mở thẳng khu đó, không mở khu đếm gần nhất
  nav(d) { if (d.s === 'dem' && d.k && S.boot && S.boot.khuBy[d.k] && canCount(d.k)) S.khu = d.k; go(d.s); },
  khuopen(d) { if (!canCount(d.k)) return say('Bạn không phụ trách khu này.', true), render(); openDem(d.k); pushNav(); render(); },
  zoom(d) { S.zoomK = S.zoomK === d.k ? null : d.k; render(); },
  cell(d) {
    const p = d.p;
    if (S.boot.closed) return say(S.boot.closedReset ? 'Hôm nay vừa đặt lại số liệu, ngày đã khoá. Ngày mai hãy báo số như thường.' : 'Sổ hôm nay đã chốt. Ngày mai hãy báo số như thường.', true), render();
    S.sel = p; fillSel(p); S.scrollSel = p; render();
  },
  key(d) { pressKey(Number(d.d)); render(); },
  fld(d) { S.field = d.v; render(); },
  next() { settle('next'); render(); },
  keep() { settle('keep'); render(); },
  /* "Hết (0)" nằm sát nút TIẾP; bấm nhầm là ghi 0 cho một phi đang có thép, và hộp hỏi lúc gửi không
     bắt được vì ô đã tính là "đã đếm". Nên hỏi lại ngay ở đây, chỉ khi phi đó đang có thép. */
  async zero() {
    const p = S.sel; if (!p) return;
    const ex = expOf(S.khu, p) || 0;
    if (ex > 0 && !(await ask(`${p}: ghi HẾT (0)?\nĐang có ${fmtQs(ex, p)}. Chỉ chọn khi khu đã hết thật phi này.`, 'ĐÚNG, ĐÃ HẾT', true))) return render();
    if (S.sel !== p) return render(); // hộp mở lâu, người dùng đã chuyển sang phi khác
    settle('zero'); render();
  },
  closesel() {
    const p = S.sel;
    // chỉ lưu khi có gõ: đóng một ô vừa mở xem thì ô đó giữ nguyên loại cũ (xem settle)
    if (p && S.typed && (S.bo !== '' || S.le !== '')) {
      const size = S.boot.phiBy[p].bo_size, boN = parseInt(S.bo || '0', 10), leN = parseInt(S.le || '0', 10);
      S.draft.cells[p] = { v: boN * size + leN, kind: 'dem', bo: boN, le: leN }; saveDraft();
    }
    S.sel = null; S.bo = ''; S.le = ''; render();
  },
  /* Ghi số cho nhiều phi một lúc nên phải xác nhận. Trước đây xác nhận bằng cách bấm nút
     hai lần, trong khi mọi thao tác hàng loạt khác đều dùng hộp ask() — người dùng không có lý
     do gì để đoán rằng riêng nút này đổi nghĩa sau lần bấm đầu. */
  async keepall() {
    const pend = pendingList().filter((p) => !keepBlock(S.khu, p.id));
    if (!pend.length) {
      const left = pendingList();
      return say(left.length ? 'Các phi còn lại phải đếm thực tế: ' + left.map((p) => p.id).join(', ') + '.' : 'Đã xử lý hết phi của khu này.', true), render();
    }
    const ids = pend.map((p) => p.id);
    if (!(await ask('Giữ nguyên số hôm qua cho ' + ids.length + ' phi?\n' + ids.join(', ') + '\nChỉ chọn khi bạn đã xem và các phi này đúng bằng hôm qua.', 'GIỮ NGUYÊN ' + ids.length + ' PHI'))) return;
    // hộp xác nhận mở ra lâu, trong lúc đó có thể đã đếm hoặc đã sang ngày khác: tính lại danh sách
    pendingList().filter((p) => !keepBlock(S.khu, p.id)).forEach((p) => { S.draft.cells[p.id] = { v: refOf(S.khu, p.id), kind: 'giu' }; });
    saveDraft(); render();
  },
  /* Không còn bắt điền đủ: ô để trống là 0. Nhưng để trống một phi ĐANG CÓ THÉP là xoá vài tấn
     khỏi giấy tờ bằng một lần quên gõ, nên hỏi lại ở đúng đây — lúc người đếm còn đứng trước đống
     thép, chứ không đẩy sang cho người duyệt phát hiện qua cột lệch. Phi dự kiến 0 thì gửi thẳng. */
  async send() {
    if (S.boot.closed) return say(S.boot.closedReset ? 'Hôm nay vừa đặt lại số liệu, ngày đã khoá. Ngày mai hãy báo số như thường.' : 'Sổ hôm nay đã chốt. Ngày mai hãy báo số như thường.', true), render();
    if (!myPhiList().length) return say('Chưa có phi thép nào trong hệ thống.', true), render();
    const blank = blankWithStock();
    if (blank.length) {
      const dong = blank.slice(0, 8).map((p) => '   ' + p.id + ' — đang có ' + fmtQs(expOf(S.khu, p.id) || 0, p)).join('\n');
      const msg = 'Bạn để trống ' + blank.length + ' phi đang có thép:\n' + dong
        + (blank.length > 8 ? '\n   … và ' + (blank.length - 8) + ' phi nữa' : '')
        + '\n\nGửi báo cáo = ghi 0, tức là những phi này đã hết thép. Đúng chưa?';
      if (!(await ask(msg, 'ĐÚNG, ĐÃ HẾT THÉP', true))) return render();
    }
    sendCounts();
  },
  legend() {
    S.legend = !S.legend;
    if (!S.legend) { S.legendSeen = true; try { localStorage.setItem('kt:legendSeen', '1'); } catch (e) { /* bỏ qua */ } }
    render();
  },
  draftnew() { try { localStorage.removeItem(draftKey()); } catch (e) { /* bỏ qua */ } loadDraft(true); render(); },
  draftkeep() { const r = S.boot.rm[S.khu]; S.draft.baseTs = r ? r.ts : Date.now(); S.draftWarn = null; saveDraft(); render(); },
  async pendsend(d) {
    const gone = () => (say('Báo cáo này không còn trong hàng chờ.', true), render());
    const j = readPending().find((x) => pendKey(x) === d.j && ofMe(x));
    if (!j) return gone();
    if (!(await ask('Gửi báo cáo này làm số đếm của HÔM NAY?\nChỉ chọn khi số liệu vẫn đúng với thực tế hôm nay.', 'GỬI LÀM SỐ HÔM NAY'))) return;
    const q = readPending(), i = q.findIndex((x) => pendKey(x) === d.j && ofMe(x));
    if (i < 0) return gone();
    q[i] = { khu: j.khu, items: j.items, day: S.boot.today, ts: Date.now(), uid: S.me.id, uname: S.me.name };
    writePending(q); flushPending(); render();
  },
  async pendrm(d) {
    if (!readPending().some((x) => pendKey(x) === d.j && ofMe(x))) return say('Báo cáo này không còn trong hàng chờ.', true), render();
    if (!(await ask('Bỏ báo cáo này?\nSố liệu trong báo cáo sẽ mất.', 'BỎ BÁO CÁO', true))) return;
    // chỉ bỏ đúng báo cáo của mình, không đụng tới báo cáo người khác trùng khoá
    writePending(readPending().filter((x) => !(pendKey(x) === d.j && ofMe(x)))); render();
  },

  /* Đổi chế độ thì XOÁ các dòng đã thêm: ba chế độ dùng chung N.lines, mà một dòng gõ cho phiếu
     nhập mang nghĩa khác hẳn khi nó nằm trong phiếu điều chỉnh. Giữ lại là người dùng bấm sang
     "Điều chỉnh" rồi lưu luôn mấy dòng vừa gõ cho phiếu nhập, thành sửa sổ ngoài ý muốn. */
  nmode(d) {
    const N = S.nhap;
    syncQty(); // bấm lại đúng chế độ đang mở thì số đang gõ không được mất
    if (N.mode !== d.v) { N.lines = []; N.qty = 0; N.reason = null; S.form.ndcword = ''; S.form.nnoi = ''; }
    N.mode = d.v; N.done = null; render();
  },
  ndir(d) { syncQty(); S.nhap.dir = d.v; S.nhap.done = null; render(); },
  nreason(d) { S.nhap.reason = S.nhap.reason === d.v ? null : d.v; render(); },
  nphi(d) {
    syncQty();
    const o = S.boot.phiBy[S.nhap.phi], nw = S.boot.phiBy[d.v];
    if (o && nw && isCuon(o) !== isCuon(nw)) S.nhap.qty = 0; // cuộn và cây không cùng đơn vị, không giữ số cũ
    S.nhap.phi = d.v; S.nhap.done = null; render();
  },
  nkhu(d) { syncQty(); S.nhap[d.f || 'khu'] = d.v; S.nhap.done = null; render(); },
  nq(d) {
    const N = S.nhap, v = d.v;
    syncQty();
    if (v === 'bo') N.qty += S.boot.phiBy[N.phi].bo_size; else N.qty = Math.max(0, N.qty + Number(v));
    N.done = null; render();
  },
  nadd() {
    const N = S.nhap, b = S.boot;
    syncQty();
    if (N.qty <= 0) return say('Nhập số ' + unitLbl(b.phiBy[N.phi]) + ' của ' + N.phi + ' trước khi thêm phi khác.', true), render();
    addLine(N.phi, N.qty * uStepOf(N.phi)); N.qty = 0; N.done = null;
    render();
  },
  nrm(d) { S.nhap.lines.splice(Number(d.i), 1); render(); },
  async nconfirm() {
    const N = S.nhap, b = S.boot;
    syncQty();
    if (N.qty > 0) { addLine(N.phi, N.qty * uStepOf(N.phi)); N.qty = 0; } // số đang gõ dở cũng được tính vào phiếu
    if (!N.lines.length) return say('Nhập số ' + unitLbl(b.phiBy[N.phi]) + ' lớn hơn 0.', true), render();
    const chuyen = N.mode === 'chuyen', dc = N.mode === 'dc', xuat = N.mode === 'xuat';
    if (chuyen && (!N.to || N.from === N.to)) return say('Chọn khu đi và khu đến khác nhau.', true), render();
    const note = val('nnote').trim();
    const noi = xuat ? val('nnoi').trim() : '';
    /* Nơi đến bắt buộc: phiếu xuất không nói thép đi đâu thì không thêm được gì so với con số
       "đã dùng" mà app đã tự suy ra sẵn — mà đó mới là lý do duy nhất để ghi phiếu. */
    if (xuat && !noi) return say('Ghi rõ xuất cho ai hoặc cho công trình nào.', true), render();
    const confirmWord = val('ndcword').trim();
    const kg = N.lines.reduce((a, l) => a + l.qty * b.phiBy[l.phi].kg_per_cay, 0);
    /* Chặn ngay trên máy những thứ server cũng chặn, để người dùng không phải chờ một vòng mạng
       mới biết mình thiếu lý do. Server vẫn kiểm lại — đây chỉ là lớp cho nhanh, không phải chốt. */
    if (dc) {
      if (!N.reason) return say('Chọn lý do điều chỉnh.', true), render();
      if (N.reason === 'khac' && !note) return say('Chọn "Lý do khác" thì phải ghi rõ lý do.', true), render();
      const dcWord = (b.limits && b.limits.dcWord) || 'DONG Y';
      if (kg > LIM('dcBigKg', 20000) && confirmWord.toUpperCase() !== dcWord) {
        return say(`Điều chỉnh ${fmtT(kg)} tấn là rất lớn, hãy gõ đúng "${dcWord}" để xác nhận.`, true), render();
      }
    }
    const where = chuyen ? `từ ${kName(N.from)} sang ${kName(N.to)}` : `${dc ? 'ở' : xuat ? 'từ' : 'vào'} ${kName(N.khu)}`;
    // cùng cách hiện với danh sách dòng phía trên: người dùng đối chiếu đúng con số vừa gõ
    const dau = (dc && N.dir === 'giam') || xuat ? '−' : dc ? '+' : '';
    const list = N.lines.map((l) => { const lp = b.phiBy[l.phi]; return `  ${l.phi}: ${dau}${fmtQ(l.qty, lp)}`; }).join('\n');
    const reasonName = dc ? ((reasons0(b).find((r) => r.id === N.reason) || {}).name || N.reason) : '';
    render();
    const viec = dc ? `Điều chỉnh ${N.dir === 'giam' ? 'GIẢM' : 'TĂNG'} tồn` : xuat ? 'Xuất kho' : chuyen ? 'Chuyển khu' : 'Nhập kho';
    /* Hộp xác nhận của điều chỉnh nói thẳng hệ quả, không chỉ nhắc lại con số: đây là loại phiếu
       duy nhất sửa sổ mà không có thép thật đi kèm, nên người bấm phải đọc được điều đó. */
    const them = dc ? `\nLý do: ${reasonName}${note ? ' — ' + note : ''}\n\nĐây là SỬA SỔ, không có thép ra vào bãi.\nPhiếu cần admin duyệt mới vào tồn.`
      : xuat ? `\nXuất cho: ${noi}\n\nPhiếu cần admin duyệt mới trừ vào tồn.` : '';
    if (!(await ask(`${viec} ${where}:\n${list}\nTổng ${fmtT(kg)} tấn${them}\n\nĐúng chưa?`, dc ? 'ĐIỀU CHỈNH' : xuat ? 'GHI PHIẾU XUẤT' : chuyen ? 'CHUYỂN KHU' : 'NHẬP KHO', dc))) return;
    const lines = N.lines.slice();
    act(async () => {
      const r = dc
        ? await api('POST', '/adjust', { khu: N.khu, dir: N.dir, lines, reason: N.reason, note, confirm: confirmWord })
        : xuat
        ? await api('POST', '/xuat', { khu: N.khu, lines, noi, note })
        : chuyen
        ? await api('POST', '/transfers', { from: N.from, to: N.to, lines, note })
        : await api('POST', '/receipts', { khu: N.khu, lines, note });
      N.lines = []; S.form.nnote = ''; S.form.ndcword = ''; S.form.nnoi = ''; N.reason = null;
      N.done = { id: r.id, text: `${lines.map((l) => { const lp = b.phiBy[l.phi]; return l.phi + ' ' + dau + fmtQs(l.qty, lp); }).join(' · ')} · ${fmtT(kg)} tấn · ${where}` };
      await loadBoot();
    });
  },
  /* Một đường cho hai việc, vì với database là cùng một việc: phiếu chưa duyệt thì rút lại/từ chối
     (chưa vào tồn, không có gì phải lùi), phiếu đã duyệt thì huỷ (lượng thép rút khỏi tồn ngay). */
  async void(d) {
    const g = receiptGroups(S.boot.receipts).find((x) => x.id === Number(d.id));
    const cho = g ? !g.duyet_day : false;
    const msg = cho ? 'Rút lại cả phiếu này?\nPhiếu chưa được duyệt nên chưa vào tồn.'
      : 'Huỷ cả phiếu này?\nPhiếu đã duyệt, huỷ là rút lượng thép này khỏi tồn.';
    if (!(await ask(msg, cho ? 'RÚT LẠI' : 'HUỶ PHIẾU', true))) return;
    act(async () => {
      await api('DELETE', '/receipts/' + d.id);
      S.nhap.done = null;
      if (S.review) await reloadReview();
      await loadBoot();
    }, cho ? 'Đã rút lại phiếu.' : 'Đã hủy phiếu.');
  },
  expand(d) { S.expand[d.p] = !S.expand[d.p]; render(); },
  khumo(d) { S.khuMo[d.k] = !S.khuMo[d.k]; render(); },

  'toggle-normal'() { S.showNormal = !S.showNormal; render(); },
  resolve(d) {
    const mark = markOf(d.k);
    act(async () => {
      try { await api('POST', '/conflict/resolve', { khu: d.k, mark }); S.cmp = null; }
      finally { await reloadReview(); await loadBoot(); }
    }, 'Đã giữ số báo sau.');
  },
  async cview(d) {
    S.cmp = { khu: d.k, data: null, pick: {} }; render();
    try { const r = await api('GET', '/conflict?khu=' + encodeURIComponent(d.k)); if (S.cmp && S.cmp.khu === d.k) S.cmp.data = r; }
    catch (e) { S.cmp = null; say(e.message, true); }
    render();
  },
  cpick(d) { if (S.cmp) { S.cmp.pick[d.p] = d.v; render(); } },
  cresolve(d) {
    const C = S.cmp; if (!C || !C.data) return;
    const pick = {};
    const from = {};
    C.data.diffs.forEach((x) => {
      const a = C.pick[x.phi] === 'a', v = a ? x.a : x.b;
      if (v != null) { pick[x.phi] = v; from[x.phi] = (a ? C.data.a : C.data.b).ts; }
    });
    const mark = markOf(d.k);
    act(async () => {
      let r;
      try { r = await api('POST', '/conflict/resolve', { khu: d.k, pick, mark, from }); S.cmp = null; }
      finally { await reloadReview(); await loadBoot(); }
      say('Đã lưu lựa chọn' + (r.changed ? ' (' + r.changed + ' phi đổi số).' : '.'));
    });
  },
  recount(d) { act(async () => { await api('POST', '/recount', { khu: d.k }); S.review = await api('GET', '/review'); await loadBoot(); }, 'Đã yêu cầu đếm lại.'); },
  async svload(d) {
    const khu = d.k;
    if (S.subs[khu] !== undefined) { delete S.subs[khu]; return render(); }
    S.subs[khu] = null; render();
    try {
      const r = await api('GET', '/submissions?khu=' + encodeURIComponent(khu));
      if (S.subs[khu] === null) S.subs[khu] = r.subs; // chỉ set nếu chưa bị huỷ
    } catch (e) { if (S.subs[khu] === null) delete S.subs[khu]; say(e.message, true); }
    render();
  },
  async spick(d) {
    const khu = d.k, idx = Number(d.i);
    const subData = S.subs[khu];
    if (!Array.isArray(subData) || !subData[idx]) return;
    const sub = subData[idx];
    if (!(await ask('Dùng số báo của ' + sub.uname + ' (' + hhmm(sub.ts) + ') cho ' + kName(khu) + '?', 'DÙNG SỐ NÀY'))) return;
    const pick = { ...sub.vals };
    const mark = markOf(khu);
    act(async () => {
      try { await api('POST', '/conflict/resolve', { khu, pick, mark, from: sub.ts }); delete S.subs[khu]; }
      finally { await reloadReview(); await loadBoot(); }
    }, 'Đã cập nhật số ' + kName(khu) + '.');
  },
  // hoàn tác lần đặt lại số liệu của hôm nay: việc duy nhất còn "mở lại" một ngày đã khoá
  async reopen() {
    const note = val('reopenNote').trim();
    if (!note) return say('Ghi lý do hoàn tác vào ô phía trên.', true), render();
    if (!(await ask('Hoàn tác lần đặt lại số liệu hôm nay?\nSố đếm trước lúc đặt lại được dựng lại, ngày hôm nay mở lại.', 'HOÀN TÁC', true))) return;
    act(async () => { await api('POST', '/reopen', { note }); S.form.reopenNote = ''; await reloadReview(); await loadBoot(); }, 'Đã hoàn tác lần đặt lại số liệu.');
  },
  hprev() { loadHist(ydayOf(S.hist.date)); },
  hnext() { const n = new Date(Date.parse(S.hist.date) + 864e5).toISOString().slice(0, 10); if (n <= S.boot.today) loadHist(n); },
  rquick(d) { [S.bc.from, S.bc.to] = repRange(d.v); S.form.rfrom = S.bc.from; S.form.rto = S.bc.to; loadRep(); },
  rload() { const a = val('rfrom'), z = val('rto'); if (!a || !z || a > z) return say('Chọn khoảng ngày hợp lệ.', true), render(); S.bc.from = a; S.bc.to = z; loadRep(); },
  rcsv() { const a = val('rfrom') || S.bc.from, z = val('rto') || S.bc.to; download(`/report?format=csv&from=${a}&to=${z}`, `bao-cao_${a}_${z}.csv`); },
  exportday(d) { const day = d.d || val('exday') || S.boot.today; download('/export?date=' + day, `kho-thep_${day}.csv`); },
  // bản sao cả kỳ: từ ngày chốt đầu tiên tới hôm nay, để trước khi xoá còn giữ được số cũ
  // from=dau: server lấy từ ngày chốt ĐẦU TIÊN. Đây là bản sao được khuyên tải trước khi xoá sạch,
  // nên phải đủ mọi tháng chứ không chỉ tháng này.
  dlall() { const z = S.boot.today; download(`/report?format=csv&from=dau&to=${z}`, `bao-cao_tu-dau_${z}.csv`); },
  // tải bản sao: dùng chung đường download như các tệp CSV khác
  dlbackup() { download('/backup', `kho-thep_sao-luu_${S.boot.today}.json`); },
  /* Chọn tệp thì ĐỌC NGAY và kiểm sơ bộ, chứ không đợi tới lúc bấm nạp: chọn nhầm tệp mà mãi
     sau mới biết là đã gõ xong câu xác nhận, tay đã quen, dễ bấm tiếp cho xong. */
  pickbackup(f) {
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      let j = null;
      try { j = JSON.parse(rd.result); } catch (e) { j = null; }
      if (!j || j.app !== 'kho-thep' || !j.bang) {
        S.bkFile = null; S.form.napword = '';
        return say('Tệp này không phải bản sao của ứng dụng.', true), render();
      }
      const dong = Object.values(j.bang).reduce((a, x) => a + (Array.isArray(x) ? x.length : 0), 0);
      S.bkFile = { ten: f.name, mo: `sao lưu ngày ${fmtDay(j.ngay)} · ${fmtInt(dong)} dòng`, data: j };
      render();
    };
    rd.onerror = () => { S.bkFile = null; say('Không đọc được tệp.', true); render(); };
    rd.readAsText(f);
  },
  async dorestore() {
    const f = S.bkFile;
    if (!f) return say('Hãy chọn tệp bản sao trước.', true), render();
    if ((val('napword') || '').trim().toUpperCase() !== 'NAP LAI') return say('Gõ đúng NAP LAI để mở nút.', true), render();
    const msg = `Nạp lại từ ${f.ten}?\n\n`
      + `• ${f.mo}\n`
      + `• Toàn bộ số liệu hiện tại bị THAY SẠCH bằng số liệu trong tệp.\n`
      + `• Tài khoản và PIN cũng theo tệp: ai được tạo sau ngày sao lưu sẽ mất tài khoản.\n`
      + (Array.isArray(f.data.bang.loans) ? `• Sổ vay mượn cũng theo tệp.\n` : `• Bản sao chưa có sổ vay mượn: sổ vay hiện tại được GIỮ NGUYÊN.\n`)
      + `• KHÔNG HOÀN TÁC ĐƯỢC. Nên tải một bản sao của hiện tại trước khi nạp.`;
    if (!(await ask(msg, 'NẠP LẠI', true))) return render();
    act(async () => {
      const r = await api('POST', '/restore', { file: f.data, confirm: 'NAP LAI' });
      S.bkFile = null; S.form.napword = ''; S.review = null;
      await loadBoot();
      say('Đã nạp lại từ bản sao (' + fmtInt(Object.values(r.dong).reduce((a, x) => a + x, 0)) + ' dòng).'
        + ((r.giu || []).length ? ' Sổ vay mượn giữ nguyên vì bản sao chưa có sổ này.' : ''));
    });
  },
  async resetzero() {
    const T = totals();
    const msg = `Đặt tồn cả bãi về 0?\n\n`
      + `• Đang có ${fmtT(T.kg)} tấn — sau khi đặt lại, mọi khu về 0 và thống kê tính lại từ hôm nay.\n`
      + `• Lịch sử và báo cáo theo kỳ cũ VẪN xem được.\n`
      + `• Hôm nay thành đã chốt; từ mai đếm và nhập bình thường từ 0.\n`
      + `• Bấm nhầm thì Duyệt → Hoàn tác đặt lại số liệu (trong ngày): mọi thứ trở lại đúng như trước.\n\n`
      + `Nên tải bản sao trước nếu chưa tải.`;
    if (!(await ask(msg, 'ĐẶT TỒN VỀ 0', true))) return render();
    act(async () => {
      const r = await api('POST', '/reset', { mode: 'zero' });
      S.review = null; await loadBoot();
      say(`Đã đặt tồn về 0 (trước đó ${r.tan} tấn). Hôm nay đã chốt, từ mai đếm lại từ 0.`);
    });
  },
  /* Hai lớp xác nhận cho việc không hoàn tác được: gõ đúng câu để mở nút, rồi còn một hộp hỏi
     nữa nói rõ mất những gì. Server vẫn kiểm lại câu xác nhận, không tin máy khách. */
  async resetwipe() {
    const word = (val('wipeword') || '').trim().toUpperCase();
    if (word !== 'XOA SACH') return say('Gõ đúng XOA SACH vào ô trên để mở nút.', true), render();
    const T = totals();
    const msg = `XOÁ SẠCH dữ liệu thép?\n\n`
      + `• Mất: mọi số đếm, tồn chuẩn, phiếu, ngày đã chốt, bảng tổng hợp và báo cáo theo kỳ.\n`
      + `• Đang có ${fmtT(T.kg)} tấn trong sổ — sau khi xoá là 0.\n`
      + `• KHÔNG HOÀN TÁC ĐƯỢC.\n`
      + `• Còn giữ: tài khoản, khu, cấu hình phi, nhật ký, lịch sử đếm và sổ vay mượn (công nợ với bên ngoài, không phải số liệu của bãi).`;
    if (!(await ask(msg, 'XOÁ SẠCH', true))) return render();
    act(async () => {
      const r = await api('POST', '/reset', { mode: 'wipe', confirm: 'XOA SACH' });
      S.form.wipeword = ''; S.review = null; await loadBoot();
      say(`Đã xoá sạch dữ liệu thép (trước đó ${r.tan} tấn). Bãi như mới dựng.`);
    });
  },
  // tải lại cả trang để nhận app.js mới (service worker "mạng trước" lấy bản mới từ server)
  reloadapp() { try { window.location.reload(); } catch (e) { /* môi trường không có trang */ } },
  logf(d) { S.logFilter = d.v; render(); },
  logfind() { S.auditF.q = String(val('logq')).trim(); delete S.form.logq; go('nhatky', true); },
  logclear() { S.auditF = { ngay: '', q: '' }; delete S.form.logq; go('nhatky', true); },
  async logmore() {
    if (S.busy) return;
    S.busy = true; S.busyMsg = 'Đang tải...'; render();
    try { await loadAudit(true); } catch (e) { say(e.message, true); }
    finally { S.busy = false; S.busyMsg = ''; }
    render();
  },
  sscope(d) { S.statScope = d.v; render(); },
  sdays(d) { S.usageDays = Number(d.v); go('stats'); },
  ccdays(d) { S.cc.days = Number(d.v); S.cc.mo = {}; loadChamCong(); },
  ccmo(d) { S.cc.mo[d.k] = !S.cc.mo[d.k]; render(); },

  ucreate() {
    const name = val('un'), phone = val('up'), role = val('ur');
    S.form.un = name; S.form.up = phone; S.form.ur = role;
    act(async () => {
      try { const r = await api('POST', '/users', { name, phone, role }); S.pinShown = { name, pin: r.pin }; S.form.un = ''; S.form.up = ''; S.err = ''; await loadUsers(); }
      catch (e) { S.err = e.message; }
    });
  },
  pinok() { S.pinShown = null; render(); },
  async ureset(d) { const u = (S.users || []).find((x) => x.id === Number(d.id)); if (!u) return; if (!(await ask('Đặt lại PIN cho ' + u.name + '?\nHọ sẽ bị đăng xuất khỏi mọi máy và phải đổi PIN khi đăng nhập lại.', 'ĐẶT LẠI PIN'))) return; act(async () => { const r = await api('POST', `/users/${d.id}/reset-pin`, {}); S.pinShown = { name: u.name, pin: r.pin }; await loadUsers(); }); },
  ulock(d) { act(async () => { await api('POST', `/users/${d.id}/lock`, { locked: d.v === '1' }); await loadUsers(); }); },
  ulogout(d) { act(async () => { await api('POST', `/users/${d.id}/logout`, {}); }, 'Đã đăng xuất người dùng khỏi mọi máy.'); },
  // mở ô sửa tên, mồi sẵn tên hiện tại để chỉ phải sửa phần cần sửa
  urename(d) { const u = (S.users || []).find((x) => x.id === Number(d.id)); S.uRename = Number(d.id); S.form.urn = u ? u.name : ''; render(); },
  urenamecancel() { S.uRename = null; S.form.urn = ''; render(); },
  urenamesave(d) {
    const name = val('urn');
    if (!name) return say('Cần nhập tên.', true), render();
    act(async () => {
      await api('POST', `/users/${d.id}/rename`, { name });
      S.uRename = null; S.form.urn = '';
      await loadUsers(); await loadBoot();
    }, 'Đã sửa tên. Số đếm và phiếu cũ hiện tên mới ngay; dòng nhật ký cũ giữ tên cũ (nhật ký không sửa được).');
  },
  /* Xoá tài khoản. Nói rõ hai điều người dùng cần biết trước khi bấm: hoạt động cũ KHÔNG mất, và
     khôi phục được — nếu không họ sẽ không dám bấm, hoặc bấm rồi tưởng đã mất số liệu. */
  async udelete(d) {
    const u = (S.users || []).find((x) => x.id === Number(d.id));
    if (!u) return;
    /* Khu mà người này là người phụ trách DUY NHẤT: xoá xong khu đó không còn ai phụ trách, mà
       khu không ai phụ trách thì MỌI người đếm đều đếm được. Phải nói ra TRƯỚC khi bấm, không thì
       việc "xoá một người" lại âm thầm mở một khu ra cho cả bãi. Chỉ gửi confirm_khu khi hộp xác
       nhận đã thật sự cảnh báo, để server còn chặn lại được khi số liệu trên máy đã cũ. */
    const ku = (S.boot && S.boot.ku) || {};
    const solo = Object.keys(ku).filter((k) => ku[k].length === 1 && ku[k][0] === u.id);
    const tenKhu = (k) => k + ' ' + ((S.boot.khuBy[k] && S.boot.khuBy[k].name) || '');
    const msg = `Xoá tài khoản ${u.name}?\n\n`
      + `• Không đăng nhập được nữa, bị đăng xuất khỏi mọi máy và bỏ khỏi phân công khu.\n`
      + (solo.length ? `• ${u.name} là người phụ trách DUY NHẤT của ${solo.map(tenKhu).join(', ')} — xoá xong thì MỌI người đếm đều đếm được khu đó. Gán người khác trước nếu không muốn vậy.\n` : '')
      + `• Mọi số đếm, phiếu và báo cáo ${u.name} đã làm VẪN GIỮ NGUYÊN, vẫn mang tên ${u.name}.\n`
      + `• Khôi phục lại được ở cuối màn hình này.`;
    if (!(await ask(msg, 'XOÁ TÀI KHOẢN', true))) return render();
    act(async () => {
      try { await api('POST', `/users/${d.id}/delete`, { confirm_khu: solo.length > 0 }); }
      // số liệu trên máy đã cũ: nạp lại để lần bấm sau hộp xác nhận nói đúng khu nào sẽ mở ra
      catch (e) { if (e.code === 'khu_open') await loadBoot(); throw e; }
      await loadUsers(); await loadBoot();
    }, 'Đã xoá tài khoản ' + u.name + '.'
      + (solo.length ? ' ' + solo.map(tenKhu).join(', ') + ' không còn ai phụ trách: mọi người đếm đều đếm được.' : ''));
  },
  async urestore(d) {
    const u = (S.users || []).find((x) => x.id === Number(d.id));
    if (!u) return;
    if (!(await ask(`Khôi phục tài khoản ${u.name}?\nPIN cũ bị thu hồi, hệ thống cấp PIN MỚI hiện ngay sau đây để bạn đưa lại cho họ.`
      + (u.locked ? `\n${u.name} đang bị khóa, khôi phục xong vẫn còn khóa: mở khóa nếu cho dùng lại.` : ''), 'KHÔI PHỤC'))) return render();
    // PIN mới là phản hồi của việc này, hiện bằng đúng thẻ PIN như lúc tạo tài khoản
    act(async () => {
      const r = await api('POST', `/users/${d.id}/restore`, {});
      S.pinShown = { name: u.name, pin: r.pin };
      await loadUsers(); await loadBoot();
    });
  },

  async phiseed() {
    if (!(await ask('Khôi phục phi mặc định D6–D36?\nPhi đã có sẽ KHÔNG bị thay đổi, chỉ thêm lại các phi bị xoá nhầm.', 'KHÔI PHỤC'))) return;
    act(async () => { await api('POST', '/phi/seed', {}); await loadBoot(); say('Đã khôi phục phi mặc định.'); });
  },
  async phioff(d) {
    const on = d.v === '1';
    if (!on && !(await ask('Tắt phi ' + d.p + '?\nPhi này sẽ không hiện trong bảng đếm và nhập kho nữa. Chỉ tắt được khi bãi không còn ' + d.p + '.', 'TẮT PHI', true))) return;
    act(async () => { await api('PATCH', '/phi/' + d.p, { active: on ? 1 : 0 }); await loadBoot(); }, on ? 'Đã bật lại phi ' + d.p + '.' : 'Đã tắt phi ' + d.p + '.');
  },
  pstd(d) { const p = S.boot.phiBy[d.p]; if (p && fillStd(p)) say('Đã điền số chuẩn cho ' + p.id + '. Bấm LƯU CẤU HÌNH PHI để áp dụng.'); render(); },
  pstdall() { const n = S.boot.phiAct.filter(fillStd).length; say('Đã điền số chuẩn cho ' + n + ' phi. Xem lại, sửa phi nào khác rồi bấm LƯU CẤU HÌNH PHI.'); render(); },
  /* Chỉ tính lại trường mà admin THỰC SỰ đã sửa (có trong S.form), các trường còn lại gửi y số
     đang lưu. Ô "Báo động (bó)" và "kg / 1 cuộn" chỉ hiện số đã làm tròn, nên nếu lượt lưu nào cũng
     quy đổi ngược từ ô hiển thị thì mở Cài đặt rồi bấm LƯU là đủ đổi số: min_stock 30 cây D28
     (57 cây/bó) hiện "0,5 bó" rồi lưu lại thành 29. Bộ số chuẩn tình cờ quy đổi khứ hồi khớp nên
     lỗi này không lộ ra với phi mặc định, chỉ lộ với số admin tự đặt. */
  psaveall() {
    const items = [];
    for (const p of S.boot.phiAct) { // phi đã tắt không có ô nhập trên màn hình, không gửi lên
      const g = (k) => numIn(val(k + '-' + p.id));
      // "đã sửa" = chữ trong ô khác với số đang lưu mà ô hiển thị; so trực tiếp trên ô nên không
      // phụ thuộc vào việc S.form có được điền hay không
      const f0 = phiForm(p);
      const edited = (k) => f0[k] !== undefined && document.getElementById(k + '-' + p.id) && String(val(k + '-' + p.id)).trim() !== f0[k];
      const bad = () => (say('Số của ' + p.id + ' chưa hợp lệ, hãy kiểm tra lại.', true), render());
      const it = { id: p.id, bo_size: p.bo_size, kg_per_cay: p.kg_per_cay, min_stock: p.min_stock };
      if (isCuon(p)) { // 1 cuộn = bo_size phần; kg mỗi phần = kg cuộn / bo_size
        if (edited('kgc')) {
          const kgc = g('kgc');
          if (!(kgc > 0)) return bad();
          it.kg_per_cay = Math.round((kgc / p.bo_size) * 1e4) / 1e4;
        }
      } else {
        if (edited('bo')) { const bo = Math.round(g('bo')); if (!(bo >= 1)) return bad(); it.bo_size = bo; }
        if (edited('kg')) { const kg = g('kg'); if (!(kg > 0)) return bad(); it.kg_per_cay = kg; }
      }
      if (edited('mn')) { const mn = g('mn'); if (!(mn >= 0)) return bad(); it.min_stock = Math.round(mn * it.bo_size); }
      items.push(it);
    }
    act(async () => {
      const r = await api('PUT', '/phi', { items });
      items.forEach((it) => PHI_FIELDS.forEach((k) => delete S.form[k + '-' + it.id]));
      await loadBoot(); say(r.n ? 'Đã lưu ' + r.n + ' phi.' : 'Không có thay đổi.');
    });
  },
  ksave(d) { act(async () => { await api('PATCH', '/khu/' + d.k, { name: val('kn-' + d.k) }); delete S.form['kn-' + d.k]; await loadBoot(); }, 'Đã lưu tên khu.'); },
  async khide(d) {
    /* Server không cho ẩn khu còn thép (ẩn rồi thì không ai đếm được nữa, tồn "đóng băng"), nên
       nói luật đó TRƯỚC khi bấm, đừng để người ta xác nhận xong mới nhận lỗi. */
    if (d.v !== '1' && !(await ask('Ẩn ' + kName(d.k) + '?\nChỉ ẩn được khi khu đã hết thép: chuyển thép sang khu khác hoặc đếm về 0 trước. Khu ẩn không còn trong danh sách đếm, hiện lại được bất cứ lúc nào.', 'ẨN KHU', true))) return;
    act(async () => { await api('PATCH', '/khu/' + d.k, { active: d.v === '1' }); await loadBoot(); }, d.v === '1' ? 'Đã hiện lại khu.' : 'Đã ẩn khu.');
  },
  // Gọi hộp cài app của trình duyệt. Mỗi sự kiện chỉ dùng được một lần.
  async install() {
    if (!installEvt) return;
    const ev = installEvt; installEvt = null;
    try { ev.prompt(); await ev.userChoice; } catch (e) { /* người dùng đóng hộp */ }
    render();
  },
  unit(d) { S.unit = d.v; try { localStorage.setItem('kt:unit', d.v); } catch (e) { /* bỏ qua */ } render(); },
  /* Duyệt khu: số của khu vào tồn kể từ lúc này, và phiếu đang chờ của khu đó được duyệt cùng
     trong một lần ghi. Gửi kèm dấu (mark) của khu lúc màn hình được tải: khu vừa báo lại hay có
     phiếu mới thì server từ chối, admin không duyệt nhầm con số mình chưa thấy.
     Luôn nạp lại màn Duyệt kể cả khi lỗi, để admin thấy ngay số mới nhất. */
  khuduyet(d) {
    const kk = ((S.review && S.review.khus) || []).find((k) => k.khu === d.k);
    act(async () => {
      let r;
      try { r = await api('POST', '/review/duyet', { khu: d.k, marks: { [d.k]: kk ? kk.mark : '' } }); }
      finally { await reloadReview(); await loadBoot(); }
      say('Đã duyệt ' + kName(d.k) + (r.phieu ? ' và ' + r.phieu + ' phiếu của khu.' : '.'));
    });
  },
  async khuduyetall() {
    const R = S.review; if (!R) return;
    const ks = (R.khus || []).filter((k) => k.waiting || k.phieu.length || k.recheck);
    if (!ks.length) return say('Không còn khu nào chờ duyệt.', true), render();
    if (!(await ask('Duyệt cả ' + ks.length + ' khu đang chờ?\n' + ks.map((k) => k.name).join(', ')
      + '\nSố của các khu này sẽ thành tồn chính thức. Hãy xem bảng lệch trước khi duyệt hàng loạt.', 'DUYỆT TẤT CẢ'))) return;
    act(async () => {
      let r;
      try { r = await api('POST', '/review/duyet', { all: true, marks: Object.fromEntries((R.khus || []).map((k) => [k.khu, k.mark])) }); }
      finally { await reloadReview(); await loadBoot(); }
      say('Đã duyệt ' + r.khu + ' khu' + (r.phieu ? ' và ' + r.phieu + ' phiếu.' : '.'));
    });
  },
  // duyệt một phiếu riêng: thép về lúc 9h, khu chưa đếm, vẫn phải vào tồn được ngay
  pduyet(d) {
    act(async () => {
      try { await api('POST', '/receipts/' + d.id + '/duyet', {}); }
      finally { await reloadReview(); await loadBoot(); }
      say('Đã duyệt phiếu, lượng thép này đã vào tồn.');
    });
  },
  async preject(d) {
    if (!(await ask('Từ chối phiếu này?\nPhiếu sẽ bị huỷ và không vào tồn. Người lập phải nhập lại nếu cần.', 'TỪ CHỐI PHIẾU', true))) return;
    act(async () => {
      try { await api('DELETE', '/receipts/' + d.id); }
      finally { await reloadReview(); await loadBoot(); }
      say('Đã từ chối phiếu.');
    });
  },
  kadd() { const name = val('newk'); act(async () => { await api('POST', '/khu', { name }); S.form.newk = ''; await loadBoot(); }, 'Đã thêm khu.'); },
  kuedit(d) {
    if (S.kuEdit === d.k) { S.kuEdit = null; return render(); }
    S.kuEdit = d.k; S.kuPick = (S.boot.ku[d.k] || []).slice(); render();
  },
  kupick(d) { const id = Number(d.v); const i = S.kuPick.indexOf(id); if (i < 0) S.kuPick.push(id); else S.kuPick.splice(i, 1); render(); },
  kucancel() { S.kuEdit = null; S.kuPick = []; render(); },
  kusave(d) {
    const users = S.kuPick.slice();
    act(async () => { await api('PUT', '/khu/' + d.k + '/users', { users }); S.kuEdit = null; S.kuPick = []; await loadBoot(); },
      users.length ? 'Đã gán ' + users.length + ' người phụ trách.' : 'Đã bỏ phân công, mọi người đếm được khu này.');
  },
  /* --- Vay mượn ngoài bãi --- */
  ldt(d) { S.loan.doitac = Number(d.v); S.loan.done = null; render(); },
  lkind(d) { S.loan.kind = d.v; S.loan.done = null; render(); },
  lphi(d) {
    const o = S.boot.phiBy[S.loan.phi], nw = S.boot.phiBy[d.v];
    if (o && nw && isCuon(o) !== isCuon(nw)) S.form.lqty = ''; // cuộn và cây không cùng đơn vị
    S.loan.phi = d.v; S.loan.done = null; render();
  },
  /* Bộ nút số lượng giống hệt màn Nhập kho (−10 −1 +1 +10, +1 bó): cùng một thao tác ở hai màn thì
     phải bấm giống nhau. Số tính theo đơn vị người dùng thấy (cuộn với thép cuộn), trần như server. */
  lq(d) {
    const p = S.boot.phiBy[S.loan.phi]; if (!p) return;
    let q = parseInt(String(val('lqty')).replace(/\D/g, '') || '0', 10);
    q = d.v === 'bo' ? q + p.bo_size : Math.max(0, q + Number(d.v));
    q = Math.min(q, Math.floor(99999 / uStepOf(p)));
    S.form.lqty = q ? String(q) : ''; S.loan.done = null; render();
  },
  // số gõ theo đơn vị người dùng (cuộn với thép cuộn), đổi sang cây/phần như sổ lưu
  ladd() {
    const q = parseInt(String(val('lqty')).replace(/\D/g, '') || '0', 10);
    if (!(q > 0)) return say('Nhập số ' + unitLbl(S.boot.phiBy[S.loan.phi]) + ' trước khi thêm phi khác.', true), render();
    const L = S.loan.lines || (S.loan.lines = []), qty = q * uStepOf(S.loan.phi);
    const l = L.find((x) => x.phi === S.loan.phi);
    if (l) l.qty += qty; else L.push({ phi: S.loan.phi, qty });
    S.form.lqty = ''; render();
  },
  lrm(d) { (S.loan.lines || []).splice(Number(d.i), 1); render(); },
  lkho(d) { S.loan.kho = d.v === '1'; S.loan.done = null; render(); },
  // hạn trả nhanh: +7 / +15 / +30 ngày kể từ NGÀY GIAO NHẬN (không phải hôm nay); "" = bỏ hạn
  lhanq(d) { const ngay = val('lngay') || S.boot.today; S.form.lngay = ngay; S.form.lhan = d.v ? congNgay(ngay, Number(d.v)) : ''; render(); },
  ltick(d) { S.loan[d.v] = !S.loan[d.v]; render(); },
  ldtview(d) { S.loanDt = Number(d.id); go('vaychitiet'); },
  // từ màn chi tiết: chọn sẵn đối tác rồi về form ghi sổ
  ldtghi(d) { S.loan.doitac = Number(d.id); S.loan.done = null; go('vaymuon'); },
  lkhu(d) { S.loan.khu = d.v; S.loan.done = null; render(); },
  ldtadd() {
    const name = String(val('ldtnew')).trim();
    if (!name) return say('Gõ tên đối tác mới.', true), render();
    act(async () => {
      const r = await api('POST', '/doitac', { name });
      S.form.ldtnew = ''; S.loan.doitac = r.id;
      S.loans = await api('GET', '/loans');
    }, 'Đã thêm đối tác ' + name + '.');
  },
  async lsave() {
    const F = S.loan, L = S.loans;
    if (!L) return;
    const q = parseInt(String(val('lqty')).replace(/\D/g, '') || '0', 10);
    const lines = (F.lines || []).map((l) => ({ ...l }));
    if (q > 0) { const qty = q * uStepOf(F.phi), l = lines.find((x) => x.phi === F.phi); if (l) l.qty += qty; else lines.push({ phi: F.phi, qty }); }
    if (!F.doitac) return say('Chọn đối tác.', true), render();
    const today = S.boot.today;
    const ngay = String(val('lngay') || today);
    const coHan = F.kind === 'vay' || F.kind === 'cho_vay';
    const han = coHan ? String(val('lhan') || '') : '';
    const soBB = String(val('lsobb')).trim(), nguoi = String(val('lnguoi')).trim(), bienSo = String(val('lbienso')).trim();
    S.form.lngay = ngay; S.form.lhan = han; S.form.lsobb = soBB; S.form.lnguoi = nguoi; S.form.lbienso = bienSo;
    // cùng điều kiện với server, báo ngay trên máy cho khỏi chờ một vòng mạng
    if (ngay > today) return say('Ngày giao nhận không được sau hôm nay.', true), render();
    if (han && han < ngay) return say('Hạn trả phải từ ngày giao nhận trở đi.', true), render();
    if (!soBB) return say('Ghi số biên bản giao nhận.', true), render();
    if (!(F.bb && F.zl)) return say('Tick xác nhận: đã có biên bản giao nhận và đã gửi biên bản lên nhóm Zalo.', true), render();
    if (!lines.length) return say('Nhập số lượng lớn hơn 0.', true), render();
    const ten = ((L.doitac || []).find((d) => d.id === F.doitac) || {}).name || '';
    const note = String(val('lnote')).trim();
    S.form.lnote = note;
    /* Trả vượt số đang nợ trong sổ: không chặn (có thể một lần vay cũ chưa ai ghi), nhưng nói
       ra trước khi lưu, vì dư nợ âm là dấu hiệu sổ đang thiếu một dòng. */
    const bal = loanBalances(L);
    const vuot = F.kind === 'tra_vay' || F.kind === 'tra_no' ? lines.filter((l) => {
      const x = bal.find((y) => y.dt === F.doitac && y.phi === l.phi) || { no: 0, co: 0 };
      return l.qty > (F.kind === 'tra_vay' ? x.no : x.co);
    }) : [];
    const kho = canIn() && F.kho !== false && F.khu ? F.khu : null;
    const ra = F.kind === 'cho_vay' || F.kind === 'tra_vay';
    const msg = `${loanTitle(F.kind, ten)}:\n${lines.map((l) => '  ' + l.phi + ': ' + fmtQ(l.qty, l.phi)).join('\n')}`
      + (vuot.length ? `\n\nLưu ý: ${vuot.map((l) => l.phi).join(', ')} trả nhiều hơn số đang nợ trong sổ. Có thể một lần vay trước đó chưa được ghi.` : '')
      + (kho ? `\n\nKèm phiếu kho: thép ${ra ? 'rời' : 'vào'} ${kName(kho)}. Tồn khu đổi khi duyệt, không tính là nhập hay dùng.`
        : '\n\nChỉ ghi sổ: tồn bãi KHÔNG đổi.')
      + `\n\nNgày giao nhận: ${fmtDay(ngay)}${soNgay(ngay, today) > 7 ? ` (ghi bù ${soNgay(ngay, today)} ngày — kiểm tra lại ngày trên biên bản)` : ''}`
      + (han ? `\nHạn trả: ${fmtDay(han)}` : '')
      + `\nBiên bản số: ${soBB}${bienSo ? ' · xe ' + bienSo : ''}${nguoi ? ' · ' + nguoi : ''}`
      + '\n✓ Đã có biên bản giao nhận\n✓ Đã gửi biên bản lên nhóm Zalo'
      + '\nCần admin duyệt. Đúng chưa?';
    if (!(await ask(msg, 'GHI SỔ'))) return;
    act(async () => {
      await api('POST', '/loans', { doitac: F.doitac, kind: F.kind, lines, note, bienban: true, zalo: true, ngay, han: han || null, so_bb: soBB, nguoi, bien_so: bienSo, ...(kho ? { khu: kho } : {}) });
      // hai ô xác nhận và các trường chứng từ là của lần ghi VỪA RỒI: lần sau phải nhập lại cho biên bản mới
      F.lines = []; S.form.lqty = ''; S.form.lnote = ''; F.bb = false; F.zl = false;
      ['lngay', 'lhan', 'lsobb', 'lnguoi', 'lbienso'].forEach((k) => delete S.form[k]);
      F.done = `${loanTitle(F.kind, ten)}: ${lines.map((l) => l.phi + ' ' + fmtQs(l.qty, l.phi)).join(' · ')}`;
      S.loans = await api('GET', '/loans'); await loadBoot();
    });
  },
  lduyet(d) {
    act(async () => {
      try { await api('POST', '/loans/' + d.id + '/duyet', {}); }
      // gọi từ màn Duyệt hay màn Vay mượn thì cũng nạp lại đúng màn đang đứng
      finally { await reloadLoanScreen(); }
    }, 'Đã duyệt, khoản này đã vào dư nợ.');
  },
  async lvoid(d) {
    const r0 = [].concat((S.loans && S.loans.items) || [], (S.loanDetail && S.loanDetail.items) || [], (S.review && S.review.loans) || []).find((r) => r.id === Number(d.id));
    const cho = r0 ? !r0.duyet_ts : true;
    const tuChoi = cho && isAdmin() && r0 && r0.user_id !== S.me.id;
    const msg = cho ? (tuChoi ? 'Từ chối lần ghi này?' : 'Rút lại lần ghi này?') + '\nChưa duyệt nên chưa vào dư nợ.'
      : 'Huỷ lần ghi đã duyệt?\nDư nợ được tính lại không có khoản này.';
    if (!(await ask(msg, cho ? (tuChoi ? 'TỪ CHỐI' : 'RÚT LẠI') : 'HUỶ', true))) return;
    act(async () => {
      try { await api('DELETE', '/loans/' + d.id); }
      finally { await reloadLoanScreen(); }
    }, cho ? 'Đã bỏ lần ghi.' : 'Đã huỷ lần ghi.');
  },
  ldtedit(d) { S.doitacEdit = Number(d.id); S.form.ldtname = null; render(); },
  ldtcancel() { S.doitacEdit = null; S.form.ldtname = null; render(); },
  ldtsave(d) {
    const name = String(val('ldtname')).trim();
    if (!name) return say('Cần nhập tên.', true), render();
    act(async () => { await api('PATCH', '/doitac/' + d.id, { name }); S.doitacEdit = null; S.form.ldtname = null; S.loans = await api('GET', '/loans'); }, 'Đã sửa tên đối tác.');
  },
  async ldthide(d) {
    const on = d.v === '1';
    if (!on && !(await ask('Ẩn đối tác này?\nKhông ghi thêm được, nhưng dư nợ và lịch sử vẫn giữ nguyên. Hiện lại được bất cứ lúc nào.', 'ẨN', true))) return;
    act(async () => { await api('PATCH', '/doitac/' + d.id, { active: on }); S.loans = await api('GET', '/loans'); await loadBoot(); }, on ? 'Đã hiện lại đối tác.' : 'Đã ẩn đối tác.');
  },
  ssave() {
    if (slotBad()) return say(slotPrevTxt(), true), render();
    act(async () => {
      // giờ làm chỉ có ô khi đếm từ 2 lần/ngày: không có ô thì không gửi, giữ nguyên số đang lưu
      const o = (id) => (document.getElementById(id) ? val(id) : undefined);
      await api('PUT', '/settings', { max_keep_streak: val('s-keep'), report_slots_per_day: val('s-slots'), work_from: o('s-from'), work_to: o('s-to') });
      ['sslots', 'sfrom', 'sto'].forEach((k) => delete S.form[k]);
      await loadBoot();
    }, 'Đã lưu quy tắc.');
  },
};

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-a]');
  if (!t || !ACTIONS[t.dataset.a]) return;
  ACTIONS[t.dataset.a](t.dataset, e);
});
document.addEventListener('input', (e) => {
  const m = e.target.dataset && e.target.dataset.model;
  if (m) S.form[m] = e.target.value;
  // Cài đặt quy tắc: khung giờ đếm đổi theo ngay khi chọn số lần hoặc giờ làm, chưa cần lưu
  if (m === 'sslots' || m === 'sfrom' || m === 'sto') {
    const el = document.getElementById('slotprev');
    if (el) { el.textContent = slotPrevTxt(); el.style.color = slotBad() ? 'var(--bad)' : ''; }
  }
  const pm = m && /^(bo|kg|kgc|mn)-(.+)$/.exec(m); // Cài đặt phi: cập nhật dòng quy đổi ngay khi gõ
  if (pm && S.boot && S.boot.phiBy[pm[2]]) { const h = document.getElementById('ph-' + pm[2]); if (h) h.textContent = phiHint(S.boot.phiBy[pm[2]]); }
  // ô số lượng ở màn Vay mượn: lọc chữ, chặn trần, và cập nhật dòng quy đổi kg/tấn ngay khi gõ
  if (e.target.id === 'lqty' && S.boot && S.loan.phi) {
    const p = S.boot.phiBy[S.loan.phi];
    const raw = e.target.value.replace(/\D/g, '');
    const q = Math.min(parseInt(raw || '0', 10), Math.floor(99999 / uStepOf(p)));
    const v = q ? String(q) : '';
    if (e.target.value !== v) e.target.value = v;
    S.form.lqty = v;
    const k = document.getElementById('lkg');
    if (k && p) k.textContent = nkgText(q * uStepOf(p), p);
  }
  if (e.target.id === 'nqty' && S.boot) { // cập nhật số kg ngay, không vẽ lại cả màn hình khi đang gõ
    const raw = e.target.value.replace(/\D/g, '');
    syncQty(); S.nhap.done = null;
    // gõ chữ, số 0 đứng đầu hoặc vượt trần: viết lại ô cho khớp số thật
    if (raw !== e.target.value || (raw !== '' && String(S.nhap.qty) !== raw)) e.target.value = S.nhap.qty ? String(S.nhap.qty) : '';
    const k = document.getElementById('nkg'), p = S.boot.phiBy[S.nhap.phi];
    if (k && p) k.textContent = nkgText(S.nhap.qty * uStepOf(p), p);
    // màn Điều chỉnh: "đang có X → còn Y" phải chạy theo từng chữ số vừa gõ, đó là cả giá trị của nó
    const sv = document.getElementById('ndcsau');
    if (sv && p) {
      const N = S.nhap;
      const xuat = N.mode === 'xuat';
      const goc = N.mode === 'dc' && N.dir === 'tang' ? tonOf(N.khu, N.phi) : conLay(N.khu, N.phi);
      sv.textContent = dcSauText(xuat ? nhapRut(N) : N.qty * uStepOf(p), goc, xuat ? 'giam' : N.dir, p, N.phi);
    }
  }
});
document.addEventListener('change', async (e) => {
  const t = e.target;
  // ô chọn tệp bản sao: đọc ngay khi chọn, xem thử có phải bản sao của app không
  if (t.dataset && t.dataset.change === 'bkfile') { ACTIONS.pickbackup(t.files && t.files[0]); return; }
  // đổi số lần đếm: hiện/ẩn ô giờ làm (1 lần/ngày thì giờ làm không có tác dụng gì)
  if (t.dataset && t.dataset.model === 'sslots') { render(); return; }
  if (t.dataset && t.dataset.change === 'logday') { S.auditF.ngay = t.value || ''; go('nhatky', true); return; }
  if (t.dataset && t.dataset.change === 'hdate') { if (t.value) loadHist(t.value > S.boot.today ? S.boot.today : t.value); return; }
  if (t.dataset && t.dataset.change === 'role') {
    const id = t.dataset.id, role = t.value;
    const u = (S.users || []).find((x) => x.id === Number(id));
    if (!(await ask(`Đổi vai trò ${u ? u.name : ''} thành ${ROLE[role]}?`, 'ĐỔI VAI TRÒ'))) return render(); // vẽ lại để ô chọn quay về vai trò cũ
    act(async () => { await api('POST', `/users/${id}/role`, { role }); await loadUsers(); }, 'Đã đổi vai trò.');
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.dataset && e.target.dataset.enter) { e.preventDefault(); ACTIONS[e.target.dataset.enter](); }
});

/* ===================== KHỞI ĐỘNG ===================== */
/* Làm mới thích ứng để tiết kiệm hạn mức miễn phí:
   - đang thao tác: hỏi phiên bản mỗi 60 giây; để yên quá 5 phút: mỗi 5 phút
   - ngoài giờ làm (20:00 - 6:00): mỗi 15 phút; app chạy nền: không hỏi */
let lastAct = Date.now(), lastPoll = 0, lastScroll = 0;
['click', 'keydown', 'touchstart'].forEach((ev) => document.addEventListener(ev, () => { lastAct = Date.now(); }, { passive: true }));
// Vẽ lại là thay cả DOM nên cú miết tay đang dở sẽ bị cắt. Sự kiện scroll không nổi bọt,
// phải bắt ở pha capture trên document.
document.addEventListener('scroll', () => { lastScroll = Date.now(); lastAct = Date.now(); }, { capture: true, passive: true });
function pollEvery() {
  const h = new Date().getHours();
  if (h < 6 || h >= 20) return 15 * 60e3;
  return Date.now() - lastAct > 5 * 60e3 ? 5 * 60e3 : 60e3;
}
async function refresh() {
  if (!S.me || document.hidden || S.me.must_change) return;
  if (Date.now() - lastScroll < 2000) return; // đang cuộn: để yên, vòng sau hỏi lại
  lastPoll = Date.now();
  try {
    // chỉ hỏi số phiên bản (rất nhẹ), có thay đổi hoặc sang ngày mới mới tải lại toàn bộ
    const r = await api('GET', '/rev');
    const healed = S.netBad; S.netBad = false; S.netOk = Date.now();
    checkVer();
    if (readPending().some((j) => !j.err && ofMe(j))) flushPending();
    if (S.boot && r.today !== S.boot.today && S.screen === 'dem') {
      // nháp đang đếm thuộc ngày cũ: không để lẫn sang ngày mới
      S.screen = 'home'; S.sel = null;
      say('Đã sang ngày mới, hãy mở lại màn Báo cáo để báo cho hôm nay.', true);
    }
    const changed = !S.boot || S.stale || r.rev !== S.boot.rev || r.today !== S.boot.today;
    // đang nhập số ở màn Đếm thì không vẽ lại giữa chừng (trừ khi sang ngày mới)
    const busy = S.screen === 'dem' && S.sel && S.boot && r.today === S.boot.today;
    /* Màn Duyệt cũng làm mới: admin để màn này mở cả buổi, không làm mới thì khu báo lại hay gửi sau
       chốt mà màn hình vẫn bày số cũ. Đang mở hộp xác nhận thì để yên, vòng sau hỏi lại. */
    const reviewBusy = S.screen === 'duyet' && (S.ask || S.busy);
    if (changed && !busy && !reviewBusy && ['home', 'ton', 'khu', 'nhap', 'dem', 'stats', 'vaymuon', 'vaychitiet', 'duyet'].includes(S.screen)) {
      await loadBoot();
      if (S.screen === 'vaymuon') S.loans = await api('GET', '/loans');
      if (S.screen === 'vaychitiet') S.loanDetail = await api('GET', '/loans?doitac=' + S.loanDt);
      if (S.screen === 'duyet') await reloadReview();
      render();
    }
    else if (healed) render();
  } catch (e) {
    // mất mạng khi làm mới ngầm: chỉ hiện dải thông báo, không làm gián đoạn việc đang làm
    if (!S.netBad) { S.netBad = true; render(); }
  }
}
function tick() {
  if (Date.now() - lastPoll >= pollEvery()) refresh();
  setTimeout(tick, 15000);
}
// xóa nháp đếm của các ngày trước để localStorage không phình mãi
function cleanDrafts(today) {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const m = /^kt:(\d{4}-\d{2}-\d{2}):/.exec(localStorage.key(i) || '');
      if (m && m[1] < today) localStorage.removeItem(localStorage.key(i));
    }
  } catch (e) { /* bỏ qua */ }
}
async function start() {
  render();
  try {
    const r = await api('GET', '/me');
    S.me = r.user;
    if (!r.user.must_change) { await loadBoot(); cleanDrafts(S.boot.today); flushPending(); }
    S.screen = 'home';
  } catch (e) {
    if (e.retry && useCachedBoot()) S.screen = 'home';
    else { S.me = null; S.screen = 'login'; S.err = e.retry ? e.message : ''; }
  }
  render();
  lastPoll = Date.now();
  checkVer(0); // ghi dấu của bản đang chạy
  setTimeout(tick, 15000);
  /* Mở app lên lại từ nền là lúc hay có bản mới nhất (app nằm ngầm qua đêm, qua lần deploy), nên
     hỏi luôn lúc đó, không đợi đủ 5 phút. */
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { checkVer(60e3); if (Date.now() - lastPoll > 30e3) refresh(); } });
  window.addEventListener('online', () => { render(); refresh(); flushPending(); });
  window.addEventListener('offline', () => render());
  try { history.replaceState({ s: S.screen, k: null }, ''); } catch (e) { /* bỏ qua */ }
}
/* Cài app vào màn hình chính.
   Chrome Android bắn 'beforeinstallprompt' khi web đủ chuẩn PWA. Giữ lại sự kiện để tự hiện
   nút ngay trong app, khỏi bắt người dùng mò menu ⋮ của trình duyệt — menu đó đổi tên và đổi
   chỗ liên tục theo phiên bản Chrome, và biến mất hẳn trong trình duyệt của Zalo, Facebook. */
let installEvt = null;
function isStandalone() {
  try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { return false; }
}
// Vẽ lại để nút hiện ra, nhưng không vẽ khi người dùng đang gõ dở (sẽ xoá mất số đang nhập);
// bỏ qua lần vẽ này thì nút vẫn hiện ở lần vẽ kế tiếp.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); installEvt = e;
  const ae = document.activeElement;
  if (!ae || (ae.tagName !== 'INPUT' && ae.tagName !== 'SELECT')) render();
});
window.addEventListener('appinstalled', () => { installEvt = null; say('Đã cài app vào màn hình chính'); render(); });
// Nút cài: chỉ hiện khi máy cho cài và app chưa được cài.
function installBtn(cls) {
  if (!installEvt || isStandalone()) return '';
  return `<button class="${cls}" data-a="install">Cài app vào màn hình chính</button>`;
}
// Trong mục Thêm: cài được thì hiện nút, không thì chỉ cách làm tay.
function installCard() {
  if (isStandalone()) return '';
  if (installEvt) return installBtn('menu');
  return `<div class="card col gap6"><b>Cài app vào màn hình chính</b>
    <span class="sm muted" style="line-height:1.5">Máy này chưa cho cài tự động. Làm tay:<br>
    <b>Android:</b> mở bằng Chrome, bấm menu ⋮ góc trên → <b>Cài đặt ứng dụng</b> (hoặc <b>Thêm vào Màn hình chính</b>).<br>
    <b>iPhone:</b> mở bằng Safari, bấm nút Chia sẻ → vuốt xuống → <b>Thêm vào MH chính</b>.<br>
    Mở link trong Zalo hay Facebook thì không cài được, phải bấm "Mở bằng trình duyệt".</span></div>`;
}
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
start();
