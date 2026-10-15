'use strict';
/* Bãi Gia Công - giao diện (không cần build). Gọi API /api/* trên cùng domain. */

const $app = document.getElementById('app');
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtInt = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
/* Số tấn. Số âm mang dấu trừ "−" như mọi số lượng khác (trước đây ra gạch nối "-", đứng cạnh
   "−30 cây" thành hai kiểu dấu trên một dòng); âm nhỏ tới mức làm tròn về 0 thì là 0, không phải "-0,00". */
const fmtT = (kg) => { const s = (kg / 1000).toFixed(2); return (Number(s) === 0 ? '0.00' : s).replace('-', '−').replace('.', ','); };
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
const qNeg = (v, po) => fmtQd(v, po);
/* Số CÓ DẤU (dòng của phiếu, phần lệch, số âm): dấu đứng trước MỘT con số duy nhất.
   Kiểu Bó chỉ ghi bó khi tròn bó ("−2 bó"); còn lẻ thì ghi cây, vì "−1 bó + 10 cây" đọc được hai
   cách (bớt 190 cây, hay bớt 1 bó rồi thêm 10 cây) — cùng lý do với fmtCount.
   plus: số dương cũng mang dấu "+" (phiếu điều chỉnh, vay mượn, phần lệch). */
const fmtQd = (v, p, plus) => {
  const po = phiOf(p), a = Math.abs(v), dau = v < 0 ? '−' : plus ? '+' : '';
  if (!po) return dau + fmtInt(a);
  if (S.unit === 'kg') return dau + qKg(a, po);
  if (S.unit === 'bo' && !isCuon(po) && po.bo_size > 1 && a >= po.bo_size && a % po.bo_size === 0) return dau + qBo(a, po);
  return dau + qCay(a, po);
};
/* Nối tổng tấn vào sau một dãy số lượng. Ở kiểu Tấn mà dãy chỉ có MỘT dòng thì chính dòng đó đã là
   tổng: bỏ, không thì ra "D16 2,20 tấn · 2,20 tấn". */
const kemTan = (txt, kg) => (S.unit === 'kg' && !txt.includes(' · ') ? txt : txt + ' · ' + fmtT(kg) + ' tấn');
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
/* Vai trò theo cấp bậc. CAP là cấp DUYỆT, chép
   từ src/core.js: 0 chỉ báo; 1 = CVKTHT, duyệt báo cáo đếm và sổ vay của cấp 0; 2 = Trung đội trưởng,
   Đại đội trưởng, admin, duyệt được hết. PHIẾU KHO chỉ cấp 2 duyệt. Phần hệ thống (tài khoản, khu, phi, quy tắc) chỉ vai trò admin.
   Server mới là chỗ chặn thật; ở đây chỉ để khỏi bày nút bấm vào là bị từ chối. */
const ROLE = { admin: 'Admin', daidoi: 'Đại đội trưởng', trungdoi: 'Trung đội trưởng', cvktht: 'CVKTHT', tieudoi: 'Tiểu đội trưởng' };
const roleTen = (r) => ROLE[r] || r;
// tên vai trò của một người: admin có gắn chức danh thì kèm chức danh thật ("Admin · CVKTHT"), xem users.chuc_danh
const CHUC_DANH = ['daidoi', 'trungdoi', 'cvktht'];
const nguoiTen = (u) => roleTen(u.role) + (u.role === 'admin' && ROLE[u.chuc_danh] ? ' · ' + ROLE[u.chuc_danh] : '');
const CAP = { admin: 2, daidoi: 2, trungdoi: 2, cvktht: 1, tieudoi: 0 };
const CAP_TREN = 'Trung đội trưởng, Đại đội trưởng hoặc admin';
const ROWH = 46; // chiều cao một dòng bảng đếm, phải khớp .mxrow/.mxh/.oc trong style.css

const IC = {
  back: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  chev: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
  home: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>',
  count: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9zM9 14l2 2 4-4"/></svg>',
  inn: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 11l5 5 5-5M5 20h14"/></svg>',
  shield: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6l8-3zM8.5 12l2.5 2.5 4.5-5"/></svg>',
  gc: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h10M4 18h7"/><path d="M15 17l2.5 2.5L21 15"/></svg>',
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
  cc: { days: 7, data: null, mo: {} }, logTab: 'log',
  // chú thích màu của bảng đếm: mở sẵn cho người mới, đóng một lần rồi thì nhớ luôn
  legendSeen: (() => { try { return !!localStorage.getItem('kt:legendSeen'); } catch (e) { return false; } })(),
  // dir/reason chỉ dùng cho chế độ điều chỉnh tồn; mặc định 'giam' vì đó là chiều hay phải sửa nhất
  nhap: { mode: 'nhap', phi: null, qty: 0, khu: null, from: null, to: null, lines: [], done: null, dir: 'giam', reason: null }, scrollSel: null,
  // Vay mượn ngoài bãi: form đang gõ (doitac/kind/phi/qty) + S.loans nạp riêng khi vào màn (như S.users)
  // sổ xuất sắt vụn: form đang gõ + S.svs nạp riêng khi vào màn (như S.loans)
  sv: { khu: null, done: null }, svs: null, svKy: null, // svKy: kỳ thống kê đang xem (null = năm nay, 'YYYY', 'YYYY-MM', 'all')
  loan: { doitac: null, kind: 'vay', phi: null, qty: 0, done: null }, loans: null, doitacEdit: null, loanDt: null, loanDetail: null,
  /* Gia công cấu kiện: S.gc = bảng đơn chung (nạp riêng khi vào tab, như S.loans), gcF = bộ lọc đang chọn,
     gcId / gcDetail = đơn đang mở, gcForm = đơn đang soạn (giao mới hoặc sửa), gcPct = mức tiến độ vừa chọn chưa lưu */
  gc: null, gcF: 'mo', gcId: null, gcDetail: null, gcForm: null, gcPct: null,
  /* Quân số đầu ca: S.qs = số liệu màn Quân số (nạp riêng khi vào màn), qsH = thẻ báo của tổ trưởng trên Tổng quan,
     qsVe = màn để quay lại ('baocaoca' khi mở từ báo cáo ca), qsSx = mảng id tổ khi đang xếp thứ tự */
  qs: null, qsH: null, qsHanMo: false, qsVe: null, bcNguon: 'to', qsSx: null,
  /* Báo cáo ca: S.bcc = số liệu của ca đang soạn (nạp riêng), bcCa = ca chọn (null = ca đang diễn ra), bcM = các mục
     đã sửa tay { s3..s8 }, bcDau = phần đầu, bcNguon = nguồn quân số mục 3 — cả ba là bản dùng chung trên máy chủ
     cộng phần máy này sửa chưa chép (xem bcKhac / bcGhep) */
  bcc: null, bcCa: null, bcM: {}, bcDau: null, bcMo: null, // bcMo: mục đang mở ô sửa ('dau', 's3'..'s8') hoặc null // qsH: thẻ báo quân số trên Tổng quan (qsTheHome)
  hist: { date: '', data: null }, bc: { from: '', to: '', data: null }, legend: false, draftWarn: null, cmp: null, busy: false,
  stale: null, subs: {}, // subs: khu_id -> null (đang tải) | mảng lần báo
  kuEdit: null, kuPick: [], // đang gán người phụ trách cho khu nào, và danh sách đang chọn

  // kiểu hiện số lượng: 'all' (cây + bó + tấn) | 'cay' | 'bo' | 'kg'
  unit: (() => { try { return localStorage.getItem('kt:unit') || 'all'; } catch (e) { return 'all'; } })(),
  ask: null, loadErr: {}, netBad: false, netOk: 0, busyMsg: '',
};
const fmtDay = (d) => String(d || '').split('-').reverse().join('/');

/* ===================== API ===================== */
/* Mỗi lần gọi có HẠN CHỜ. fetch tự nó không bao giờ bỏ cuộc: sóng yếu ngoài bãi (còn vạch nhưng gói tin không
   đi) thì lời gọi treo vô thời hạn, lớp "Đang lưu..." phủ kín màn hình mãi và app coi như đơ — phải tắt mở lại.
   Hàng chờ gửi bù (flushPending, qsFlush) cũng kẹt theo vì cờ "đang gửi" không bao giờ hạ. Quá hạn thì báo như
   mất mạng (net + retry): báo cáo đếm và quân số tự xếp hàng gửi lại như khi mất sóng. */
const API_CHO_MS = 20000;
/* TẢI LẠI KÈM LỆNH GHI (xem kemSau ở src/worker.js). Lệnh ghi gửi kèm tiêu đề X-Kem: các đường GET mà màn đang đứng
   sắp tải lại (sauGhi); server ghi xong chạy luôn các đường đó và trả trong khoá `sau`. Kết quả cất vào SAU vài
   giây: lời gọi GET đúng đường đó ngay sau lấy ra dùng, KHÔNG đi mạng nữa — một lần lưu còn một vòng mạng mà các chỗ
   gọi không phải đổi gì. Server không kèm (bản cũ, phần kèm lỗi) hay đoán trật đường thì GET đi mạng như trước.
   kem: false = không xin kèm (lệnh ghi chạy ngầm hoặc gửi cả loạt), mảng = xin đúng các đường đó. */
const SAU = {}, SAU_MS = 4000;
function sauGhi() {
  const s = S.screen, ds = ['/bootstrap'];
  if (s === 'duyet') ds.push('/review');
  else if (s === 'giacong' || s === 'gcsetup') ds.push('/giacong');
  else if (s === 'gcdon' && S.gcId) ds.push('/giacong/' + S.gcId);
  else if (s === 'gcform') ds.push(S.gcForm && S.gcForm.id ? '/giacong/' + S.gcForm.id : '/giacong');
  else if (s === 'quanso') ds.push('/quanso');
  else if (s === 'satvun') ds.push('/satvun' + (S.svKy ? '?ky=' + encodeURIComponent(S.svKy) : ''));
  else if (s === 'vaymuon') ds.push('/loans');
  else if (s === 'vaychitiet' && S.loanDt) ds.push('/loans?doitac=' + S.loanDt);
  return ds;
}
async function api(method, path, body, choMs, kem) {
  const uid = S.me ? S.me.id : 0;
  if (method === 'GET') {
    const c = SAU[path];
    if (c) { delete SAU[path]; if (c.uid === uid && Date.now() - c.at < SAU_MS) return c.d; }
  }
  const xin = method === 'GET' || kem === false || !S.boot ? [] : (kem || sauGhi());
  const d = await apiCho(method, path, body, choMs, xin);
  if (d && d.sau && typeof d.sau === 'object') {
    Object.keys(d.sau).forEach((k) => { SAU[k] = { at: Date.now(), uid, d: d.sau[k] }; });
    delete d.sau;
  }
  return d;
}
async function apiCho(method, path, body, choMs, xin) {
  let het = false;
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const hen = ctl ? setTimeout(() => { het = true; ctl.abort(); }, choMs || API_CHO_MS) : 0;
  const quaLau = () => {
    const er = new Error(method === 'GET' ? 'Mạng quá chậm, chưa tải được. Thử lại khi sóng khá hơn.'
      : 'Mạng quá chậm, chưa nhận được trả lời của máy chủ. Xem lại đã lưu chưa rồi hãy bấm lại.');
    er.net = true; er.retry = true; er.cham = true; return er;
  };
  try { return await apiGoi(method, path, body, ctl, () => het, quaLau, xin); }
  finally { if (hen) clearTimeout(hen); }
}
async function apiGoi(method, path, body, ctl, het, quaLau, xin) {
  let r;
  try {
    r = await fetch('/api' + path, {
      method, credentials: 'same-origin',
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(xin && xin.length ? { 'X-Kem': xin.join(',') } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      ...(ctl ? { signal: ctl.signal } : {}),
    });
  } catch (e) { if (het()) throw quaLau(); const er = new Error('Không có kết nối mạng'); er.net = true; er.retry = true; throw er; }
  let d = {};
  // quá hạn giữa lúc đọc thân trả lời: không được coi {} là trả lời thành công
  try { d = await r.json(); } catch (e) { if (het()) throw quaLau(); /* không phải JSON */ }
  if (!r.ok) {
    // 429 không có JSON là Cloudflare chặn (thường do hết hạn mức miễn phí trong ngày, tự phục hồi 7:00 sáng)
    const quota = r.status === 429 && !d.error;
    const er = new Error(d.error || (quota ? 'Hệ thống tạm quá tải hoặc hết hạn mức trong ngày, sẽ tự hoạt động lại (muộn nhất 7h sáng)' : 'Lỗi ' + r.status));
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
  // f1: chiếm hết phần còn lại của màn, không thì thanh tab ở đáy nhảy lên sát dưới tiêu đề trong lúc chờ tải
  if (!e) return '<div class="f1 pad muted">Đang tải...</div>';
  return `<div class="f1 pad col gap8"><div class="card bad col gap6"><b style="font-size:18px">Không tải được dữ liệu</b><span class="sm">${esc(e)}</span></div><button class="btn full" data-a="retry" data-s="${esc(screen)}">THỬ LẠI</button></div>`;
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
  // báo cáo bị admin huỷ hôm nay, theo khu (lần huỷ mới nhất). Xem huyOf.
  b.hm = {}; (b.huy || []).forEach((h) => (b.hm[h.khu_id] = h));
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
  if (b.tn != null) S.tnBiet = b.tn;
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
// isAdmin: quản trị HỆ THỐNG. Việc duyệt thì hỏi isQL / isCH / duyetCap, không hỏi isAdmin.
const isAdmin = () => S.me && S.me.role === 'admin';
const capMe = () => (S.me && CAP[S.me.role]) || 0;
const isQL = () => capMe() >= 1; // cấp duyệt: CVKTHT trở lên, có tab Duyệt
const isCH = () => capMe() >= 2; // cấp chỉ huy: duyệt được hết, đếm được mọi khu
/* duyệt được việc mà người báo (cao nhất) ở cấp capBao không. Cấp người báo do server ghi vào dòng số
   liệu lúc báo (cap); thiếu thì coi là 2, tức chỉ cấp chỉ huy duyệt. */
const duyetCap = (capBao) => capMe() >= 2 || (capMe() === 1 && capBao === 0);
// một lần ghi sổ vay: theo cấp ghi trong dòng, và dưới cấp chỉ huy thì không tự duyệt lần ghi của mình (như server)
const duyetDuoc = (r) => duyetCap(r && r.cap != null ? r.cap : 2) && (isCH() || !r || r.user_id !== S.me.id);
const canIn = () => !!S.me && S.me.role in CAP && S.me.role !== 'tieudoi';
// Khu chưa phân công ai thì mọi người đếm được; đã phân công thì chỉ Tiểu đội trưởng được gán, và CVKTHT trở lên
const canCount = (kid) => {
  const a = S.boot && S.boot.ku ? S.boot.ku[kid] : null;
  return !a || !a.length || isQL() || a.includes(S.me.id);
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
/* Như ask() nhưng bắt GÕ MỘT DÒNG (lý do) trước khi đồng ý; trả về chuỗi đã gõ, hoặc false nếu bỏ.
   Chữ đang gõ giữ ở S.form.askin (ô có data-model) nên màn hình vẽ lại giữa chừng không làm mất. */
function askText(msg, okLbl, hint, can) {
  return new Promise((resolve) => {
    if (S.ask) S.ask.resolve(false);
    delete S.form.askin;
    S.ask = { msg, ok: okLbl || 'Đồng ý', danger: true, resolve, input: hint || 'Lý do', can };
    render();
  });
}
function askHtml() {
  const a = S.ask;
  if (!a) return '';
  return `<div class="modal" role="dialog" aria-modal="true" aria-label="Xác nhận"><div class="box col gap8">
    <div style="font-size:18px;line-height:1.45;white-space:pre-line">${esc(a.msg)}</div>
    ${a.input ? `<input class="inp" id="askin" data-model="askin" maxlength="300" autocomplete="off" placeholder="${esc(a.input)}" value="${esc(S.form.askin || '')}">${a.thieu ? `<span class="sm b" style="color:var(--bad)">${esc(a.can || 'Phải ghi lý do thì mới huỷ được.')}</span>` : ''}` : ''}
    <button class="btn ${a.danger ? 'bad' : 'pri'} full" data-a="askyes">${esc(a.ok)}</button>
    <button class="btn full" data-a="askno">Quay lại</button>
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
/* Nhãn của số mốc: số đó là lần đếm ĐÃ DUYỆT trong ngày thì nói giờ duyệt, chỉ khi lấy tồn chuẩn mới
   gọi là "Hôm qua". Bản cũ luôn ghi "Hôm qua", nên đếm 2 lần/ngày thì buổi chiều người đếm đọc số
   sáng nay tưởng là số hôm qua — so sai đúng ở chỗ người báo dùng để tự kiểm số mình. */
const refLbl = (k, p) => {
  const b = S.boot, c = b.em[k + '|' + p];
  if (c) return c.day === b.today ? 'Đã duyệt lúc ' + hhmm(c.ts) : 'Đã duyệt ngày ' + fmtDay(c.day);
  return !b.lastClosed || b.lastClosed === ydayOf(b.today) ? 'Hôm qua' : 'Chốt ngày ' + fmtDay(b.lastClosed);
};
// số dự kiến = tồn chuẩn hôm qua + nhập/chuyển; dùng để so lệch khi đếm
const expOf = (k, p) => { const r = refOf(k, p), m = movedOf(k, p); return r === undefined ? (m ? m : undefined) : r + m; };
// chỉ cho "giữ nguyên" khi có số hôm qua, khu không có thép nhập/chuyển, và chưa giữ nguyên quá số ngày cho phép
function keepBlock(k, p) {
  if (refOf(k, p) === undefined) return 'Phi này chưa có số hôm qua, hãy nhập số đếm.';
  if (movedOf(k, p)) return 'Phi này có thay đổi tồn (nhập, chuyển khu hoặc điều chỉnh) từ lần chốt trước, hãy đếm thực tế.';
  /* Chuỗi tính trên trạng thái TRƯỚC lần báo đầu tiên của hôm nay, như server (keep0 ở putCounts):
     sáng đã giữ nguyên thì chuỗi đã cộng cho hôm nay rồi, chiều giữ nguyên tiếp không cộng nữa.
     Không trừ thì máy chặn "quá nhiều ngày" một việc mà server vẫn nhận. */
  const c0 = S.boot.counts.find((c) => c.khu_id === k && c.phi_id === p);
  const daGiu = c0 && c0.kind === 'giu' && vnDayOf(c0.ts) === S.boot.today ? 1 : 0;
  if (((S.boot.kp[k + '|' + p] || {}).keep_streak || 0) - daGiu >= S.boot.settings.max_keep_streak) return 'Phi này giữ nguyên quá nhiều ngày, hãy đếm lại.';
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
      /* Vế cuối là THÉP ĐANG CÓ (tonOf): báo cáo đã duyệt + phiếu duyệt SAU lần duyệt đó. Chỉ lấy
         số báo cáo (valOf) thì thép vừa về mà khu chưa báo lại bị tính thành "đã dùng". Không cộng
         trùng: phiếu duyệt trước hoặc cùng lúc với báo cáo không nằm trong movedOf.
         Server tính y hệt (xem rows trong computeReview), hai bên phải khớp nhau. */
      let cnt = 0;
      for (const k of b.khu) cnt += tonOf(k.id, p.id);
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
/* Người đang xem có DUYỆT ĐƯỢC khu này không — cùng luật với reviewDuyet ở server, tính trên bootstrap
   để Tổng quan chỉ nhắc việc của đúng người: cấp chỉ huy duyệt được mọi khu; CVKTHT chỉ khi mọi ô do
   cấp 0 báo (cap ghi trong dòng), khu không còn phiếu kho chờ, và không có phiếu kho nào được duyệt
   hoặc huỷ SAU lần báo mới nhất của khu (phieuTs, cùng mốc với màn Duyệt). */
// cùng điều kiện 'recheck' của màn Duyệt: phiếu kho của khu được duyệt/huỷ SAU lần duyệt số gần nhất
const khuCanXemLai = (id) => {
  const lastDuyet = S.boot.counts.filter((c) => c.khu_id === id).reduce((m, c) => Math.max(m, c.duyet_at || 0), 0);
  return !!(lastDuyet && ((S.boot.phieuTs || {})[id] || 0) > lastDuyet);
};
const khuDuyetDuoc = (id) => {
  if (isCH()) return true;
  if (capMe() !== 1) return false;
  const b = S.boot, cs = b.counts.filter((c) => c.khu_id === id);
  if (cs.some((c) => (c.cap == null ? 2 : c.cap) !== 0)) return false;
  if (cs.some((c) => c.user_id === S.me.id)) return false; // không tự duyệt số của mình
  if ((b.receipts || []).some((r) => r.khu_id === id && !r.voided && !r.duyet_day)) return false;
  const subTs = cs.reduce((m, c) => Math.max(m, c.ts || 0), 0);
  return !(subTs && ((b.phieuTs || {})[id] || 0) > subTs);
};
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
const slotIdxOf = (ts, defs = S.boot.slotDefs) => {
  const h = ((ts + 7 * 3600e3) % 864e5) / 3600e3;
  const d = defs.find((x) => h < x.to);
  return d ? d.i : defs.length - 1;
};
/* Khu có bị đòi đếm không: giống server, khu chưa báo lần nào kể từ lần chốt trước thì thẻ
   "chưa báo" đã nói, còn khu trống trơn (không tồn, không phiếu, không đếm ra gì) thì không bị đòi. */
/* Khu có gì để đếm không: còn tồn chuẩn, có phiếu đã duyệt, hoặc đã đếm ra số khác 0 — cùng điều
   kiện server dùng để đòi khu báo (khu_missing chỉ tính khu có items). Khu trống trơn thì không ai
   phải ra đếm 13 số 0, nên cũng không nhắc. Ngày đầu tiên (chưa có tồn chuẩn nào) thì khu nào cũng
   phải báo để lập sổ, nên khi đó coi mọi khu là có việc. */
const khuCoSo = (kid) => {
  const b = S.boot;
  return b.phi.some((p) => (b.bm[kid + '|' + p.id] || 0) !== 0 || (b.mv[kid + '|' + p.id] || 0) !== 0)
    || (b.counts || []).some((c) => c.khu_id === kid && c.v !== 0)
    || (b.eff || []).some((c) => c.khu_id === kid && c.v !== 0);
};
const khuCoViec = (kid) => !S.boot.lastClosed || khuCoSo(kid);
function slotNeed(kid) {
  const b = S.boot;
  const daBao = !!b.rm[kid] || (b.eff || []).some((c) => c.khu_id === kid);
  return daBao && khuCoSo(kid);
}
// khung đã kết thúc mà khu chưa đếm. Ngày đã chốt thì không nhắc: không còn gửi số được nữa.
function slotMissing(kid) {
  const b = S.boot;
  if (b.nSlot <= 1 || b.closed || !slotNeed(kid)) return [];
  const h = vnHourNow(), done = b.slotDone[kid] || new Set();
  return b.slotDefs.filter((d) => d.to <= h && !done.has(d.i));
}
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
/* Báo cáo của khu vừa bị admin HUỶ và khu CHƯA báo lại: còn phải nhắc. Khu báo lại rồi (lần báo
   mới hơn lúc huỷ) thì thông báo hết việc. Khu có lần báo đã duyệt trước đó thì b.rm vẫn còn, nhưng
   nó cũ hơn lúc huỷ nên vẫn nhắc — đúng: lần báo sau của họ vừa bị huỷ. */
function huyOf(kid) {
  const h = S.boot.hm && S.boot.hm[kid], r = S.boot.rm[kid];
  return h && (!r || r.ts < h.ts) ? h : null;
}
// thẻ đỏ cho người đếm: báo cáo nào bị huỷ, ai huỷ, vì sao, và việc phải làm
function huyCard(kid) {
  const h = huyOf(kid);
  if (!h) return '';
  const cua = S.me && h.user_id === S.me.id ? 'của bạn' : 'của ' + esc(h.uname || '');
  return `<div class="card bad col" style="gap:4px;line-height:1.4"><b style="font-size:18px">Báo cáo ${esc(kName(kid))} ${cua} đã bị huỷ</b>
    <span class="sm">Gửi lúc ${hhmm(h.rep_ts)} · ${esc(h.huy_name || 'Admin')} huỷ lúc ${hhmm(h.ts)}</span>
    <span><b>Lý do:</b> ${esc(h.ly_do)}</span>
    <span class="sm">Số trong báo cáo đó không vào tồn và khu đang tính là <b>chưa báo</b>. Hãy đếm thực tế rồi gửi lại.</span></div>`;
}
function khuStatus(k) {
  const r = S.boot.rm[k.id];
  if (!r) return huyOf(k.id) ? { cls: 'warn', label: 'Bị huỷ', who: 'Báo cáo bị huỷ · chưa báo lại' } : { cls: 'idle', label: 'Chưa báo', who: 'Chưa có ai báo' };
  const who = r.uname + ' · ' + (tuHomQua(r) ? 'báo ngày ' + fmtDay(vnDayOf(r.ts)).slice(0, 5) + ' ' : '') + hhmm(r.ts);
  /* Ngày hôm nay chỉ bị khoá khi admin đặt lại số liệu: số chưa duyệt lúc đó không vào tồn nữa. */
  if (S.boot.closed && khuWaiting(k.id)) return { cls: 'warn', label: 'Không duyệt', who: who + ' · ngày đã khoá, số này không vào tồn' };
  if (r.conflict && !r.resolved) return { cls: 'warn', label: 'Cần xem', who: '2 người báo số khác nhau' };
  // thiếu khung đếm không được mang nhãn xanh "Đã duyệt" như đã xong việc trong ngày
  const thieu = slotMissing(k.id);
  if (thieu.length) return { cls: 'warn', label: 'Thiếu lần đếm', who: 'Thiếu ' + slotTenNgan(thieu) + (khuWaiting(k.id) ? ' · có báo cáo chờ duyệt' : '') };
  /* Báo rồi mà chưa duyệt thì tồn CHƯA đổi, nên không được hiện "Đã báo" màu xanh như đã xong:
     người đếm phải thấy báo cáo của mình đang chờ, không thì tưởng hệ thống làm mất số. */
  if (khuWaiting(k.id)) return { cls: 'warn', label: 'Chờ duyệt', who: who + ' · chờ cấp trên duyệt' };
  return { cls: 'ok', label: 'Đã duyệt', who };
}
const reportedCount = () => S.boot.khuAct.filter((k) => daBaoHomNay(k.id)).length;

/* ===================== NHÁP & GỬI BÁO CÁO ===================== */
/* Nháp tách theo NGƯỜI ĐĂNG NHẬP, không chỉ theo ngày + khu. Nhiều người dùng chung một điện thoại
   là chuyện thường ngoài bãi: không tách thì người sau mở cùng khu thấy sẵn số người trước gõ dở,
   bấm gửi là số của người kia mang tên mình — và nhật ký thì không sửa lại được. */
// nháp đếm dở: theo ngày, theo NGƯỜI, theo khu — người khác dùng chung máy không thấy nháp của người trước
const draftKey = (kid = S.khu) => 'kt:' + S.boot.today + ':' + S.me.id + ':' + kid;
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
/* Ô ĐIỀN SẴN mang theo mốc của lần báo nó lấy ra (src). Nháp nằm trên máy cả ngày và màn đếm có thể
   để mở qua mốc khung giờ, nên chỉ xét dienSan lúc dựng nháp là chưa đủ: ô điền sẵn buổi sáng được
   ghi xuống máy rồi đọc lại buổi chiều, vẫn thành ô "đã đếm". Gỡ những ô đó mỗi lần đọc nháp và
   ngay trước khi gửi. Ô người đếm tự gõ / giữ nguyên / bấm Hết thì không có src, không bao giờ bị gỡ. */
function boSoCu() {
  const cells = (S.draft && S.draft.cells) || {};
  const cu = Object.keys(cells).filter((p) => cells[p].src && !dienSan(cells[p].src));
  cu.forEach((p) => delete cells[p]);
  return cu;
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
      if (c.khu_id === S.khu && dienSan(c.ts)) d.cells[c.phi_id] = { v: c.v, kind: c.kind, bo: c.bo == null ? undefined : c.bo, le: c.le == null ? undefined : c.le, src: c.ts };
    }
  }
  S.draft = d;
  if (boSoCu().length) saveDraft();
}
// hôm nay bị khoá (chỉ khi vừa đặt lại số liệu): một câu cho mọi chỗ chặn việc báo số
const ngayKhoaMsg = () => (S.boot.closedReset ? 'Hôm nay vừa đặt lại số liệu, ngày đã khoá. Ngày mai hãy báo số như thường.' : 'Sổ hôm nay đã chốt. Ngày mai hãy báo số như thường.');
function openDem(k) {
  S.khu = k; S.sel = null; S.bo = ''; S.le = ''; S.zoomK = null;
  if (!S.legendSeen) S.legend = true;
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
/* Gửi bù xong thì nháp của báo cáo đó cũng xong, như lúc gửi thẳng. Để lại thì lần mở sau (có khi
   đã sang khung giờ khác) bảng hiện sẵn số đã gửi ở dạng "đã đếm". Chỉ xoá khi nháp trên máy còn
   ĐÚNG là báo cáo vừa gửi: người đếm sửa thêm sau lúc xếp hàng thì nháp đó là việc đang làm dở. */
function boNhapDaGui(job) {
  try {
    const key = 'kt:' + job.day + ':' + S.me.id + ':' + job.khu;
    const d = JSON.parse(localStorage.getItem(key) || 'null');
    if (!d || !d.cells) return;
    const same = job.items.every((it) => { const c = d.cells[it.phi]; return c ? c.v === it.v && c.kind === it.kind : it.kind === 'zero'; });
    if (!same) return;
    localStorage.removeItem(key);
    // đang không mở màn đếm khu đó thì bỏ luôn bản trong bộ nhớ, lần mở sau dựng lại từ số đã gửi
    if (S.khu === job.khu && S.screen !== 'dem' && S.boot && S.boot.today === job.day) S.draft = { cells: {}, baseTs: 0 };
  } catch (e) { /* bỏ qua */ }
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
      try { await api('PUT', '/counts', { khu: job.khu, day: job.day, items: job.items, tuoi: Math.max(0, Date.now() - job.ts) }); sent++; boNhapDaGui(job); }
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
    /* Lần gửi này là số mới nhất của mình cho khu + ngày đó: bản cũ còn nằm trong hàng chờ (lần
       trước gửi lỗi) phải bỏ đi, không thì lát nữa nó tự gửi lại và ĐÈ số cũ lên số vừa gửi. */
    writePending(readPending().filter((x) => !(x.khu === job.khu && x.day === job.day && ofMe(x))));
    await loadBoot();
    S.sel = null; S.screen = 'khu'; pushNav();
    say('Đã gửi báo cáo ' + khuName + (r.conflict ? '. Số khác với người báo trước, cấp trên sẽ xem.' : '. Cảm ơn bạn!'));
  } catch (e) {
    if (e.retry) { queuePending(job); say('Chưa gửi được (' + (e.cham ? 'mạng quá chậm' : e.message) + '). Đã lưu báo cáo, sẽ tự gửi lại.', true); }
    else if (e.code === 'stale_day') {
      queuePending({ ...job, err: e.message });
      S.sel = null; S.screen = 'home';
      try { await loadBoot(); } catch (er) { /* bỏ qua */ }
      say('Đã sang ngày mới. Báo cáo được giữ lại ở Tổng quan để bạn quyết định.', true);
    } else if (e.code === 'giu_lech') {
      /* Số mốc đã đổi sau lúc bấm "Giữ nguyên" (admin vừa duyệt một báo cáo khác). Tải số mới rồi
         trả các ô giữ nguyên đã lệch về "chưa đếm", để người đếm tự xem lại chứ không gửi số cũ. */
      try { await loadBoot(); } catch (er) { /* bỏ qua */ }
      const cells = S.draft.cells;
      Object.keys(cells).forEach((p) => { if (cells[p].kind === 'giu' && cells[p].v !== refOf(S.khu, p)) delete cells[p]; });
      saveDraft();
      say(e.message, true);
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
    q.map((j) => (j.err ? `<div class="card bad col gap8"><b style="font-size:18px">Báo cáo ${esc(kn(j.khu))}${j.day ? ' đếm ngày ' + esc(fmtDay(j.day)) : ''} chưa gửi được</b>
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
      <div style="font-size:32px;font-weight:700;line-height:1.2">Bãi Gia Công</div>
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
    <div style="font-size:24px;font-weight:700">Đổi PIN lần đầu</div>
    <div class="muted" style="font-size:18px;line-height:1.5">Chào ${esc(S.me.name)}. Hãy tự chọn PIN 4 số mới (không dùng 1234, 0000...).</div>
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
  /* MỖI NGƯỜI CHỈ THẤY VIỆC CỦA MÌNH: thẻ nào cũng phải là việc người đang xem PHẢI làm hoặc ĐƯỢC
     QUYỀN làm, hoặc tin về chính việc họ đã báo. Theo vai trò:
       - Tiểu đội trưởng: đếm khu mình (chưa báo, chưa đếm buổi, báo cáo bị huỷ), báo cáo của mình
         đang chờ duyệt, hai người báo khác số ở khu mình.
       - CVKTHT: quản lý việc đếm của cả bãi (khu chưa báo kèm tên người phụ trách, thiếu buổi, báo cáo
         bị huỷ chờ báo lại), những gì mình DUYỆT ĐƯỢC, phiếu và lần ghi sổ của chính mình đang chờ,
         tồn thấp, vay mượn quá hạn.
       - Trung đội trưởng, Đại đội trưởng: những gì chờ duyệt (họ duyệt được hết), tồn, vay mượn.
       - Admin: như cấp chỉ huy, cộng việc hệ thống (khu chưa giao người phụ trách).
     Việc đếm của cả bãi là của CVKTHT, nên cấp chỉ huy không bị nhắc khu chưa báo / thiếu buổi. */
  const qlDem = capMe() === 1; // người quản lý việc đếm cả bãi
  /* Khu chưa báo: Tiểu đội trưởng chỉ thấy khu mình đếm được; CVKTHT thấy cả bãi, kèm tên người phụ
     trách từng khu để biết nhắc ai. Dòng "Tạm tính: N khu chưa báo" ở đầu trang vẫn tính cả bãi, vì
     đó là nói về con số tồn. */
  const miss = b.khuAct.filter((k) => !daBaoHomNay(k.id));
  // chỉ nhắc khu có gì để đếm (khớp với server); dòng "Tạm tính" đầu trang vẫn tính mọi khu
  const missViec = miss.filter((k) => khuCoViec(k.id));
  const missMine = isCH() ? [] : qlDem ? missViec : missViec.filter((k) => canCount(k.id));
  const ai = (k) => (b.kuTen[k.id] && b.kuTen[k.id].length ? b.kuTen[k.id].join(', ') : 'chưa giao ai');
  const missS = qlDem ? missMine.map((k) => k.name + ' (' + ai(k) + ')').join(' · ') : missMine.map((k) => k.name).join(', ');
  // một khu và người này đếm được: bấm là mở thẳng khu đó
  const missK = missMine.length === 1 && canCount(missMine[0].id) ? missMine[0].id : null;
  if (missMine.length) alerts.push({ bad: false, t: (missMine.length === 1 ? missMine[0].name : missMine.length + ' khu') + ' chưa báo', s: missS, to: 'dem', k: missK });
  /* Khu CHƯA GIAO NGƯỜI PHỤ TRÁCH thì app không biết nhắc ai, nên nhắc TẤT CẢ mọi người — tức là nhắc
     sai người. Chỉ admin sửa được (Cài đặt → Khu bãi), nên chỉ admin thấy thẻ này. */
  if (isAdmin()) {
    const chuaGiao = b.khuAct.filter((k) => !(b.ku[k.id] && b.ku[k.id].length));
    if (chuaGiao.length) alerts.push({ bad: false, t: chuaGiao.length + ' khu chưa giao người phụ trách', s: chuaGiao.map((k) => k.name).join(', ') + ' · ai cũng được nhắc đếm các khu này. Giao ở Cài đặt → Khu bãi', to: 'settings' });
  }
  /* Hai người báo khác số: cấp duyệt chọn số (việc của họ); Tiểu đội trưởng của khu đó thấy để biết
     số của mình đang bị đem so. */
  b.reports.forEach((r) => {
    const k = b.khuBy[r.khu_id];
    if (!k || !k.active || !(r.conflict && !r.resolved)) return;
    if (isQL()) alerts.push({ bad: false, t: k.name + ': 2 người báo số khác nhau', s: 'Vào Duyệt để chọn số', to: 'duyet' });
    else if (canCount(k.id)) alerts.push({ bad: false, t: k.name + ': 2 người báo số khác nhau', s: 'Cấp trên đang xem', to: null });
  });
  /* Báo cáo bị huỷ: người GỬI và Tiểu đội trưởng đếm được khu đó phải đi đếm lại (thẻ đỏ, bấm là mở
     màn đếm). CVKTHT quản lý việc đếm nên thấy khu nào đang chờ báo lại. Cấp chỉ huy không có việc gì ở
     đây (chính họ hoặc CVKTHT là người huỷ). */
  b.khuAct.forEach((k) => {
    const h = huyOf(k.id);
    if (!h) return;
    const cuaToi = h.user_id === S.me.id, demLai = !isQL() && canCount(k.id);
    if (cuaToi || demLai) {
      alerts.push({ bad: true, t: 'Báo cáo ' + k.name + (cuaToi ? ' của bạn' : '') + ' đã bị huỷ',
        s: 'Lý do: ' + cut(h.ly_do, 90) + (canCount(k.id) ? ' · bấm để đếm và báo lại' : ''), to: canCount(k.id) ? 'dem' : null, k: canCount(k.id) ? k.id : null });
    } else if (qlDem) alerts.push({ bad: false, t: k.name + ': đã huỷ báo cáo, chờ báo lại', s: 'Của ' + (h.uname || '') + ' · lý do: ' + cut(h.ly_do, 70), to: null });
  });
  /* Khu chờ duyệt, hai phía:
     - người DUYỆT ĐƯỢC khu đó (cùng luật với server, xem khuDuyetDuoc): "N khu chờ bạn duyệt";
     - người đã gửi báo cáo mà mình không tự duyệt được: "báo cáo của bạn đang chờ duyệt", để biết số
       đã tới nhưng chưa vào tồn. Báo cáo của người khác thì không phải việc của họ. */
  // ngày đã chốt thì không còn gì "chờ duyệt" nữa: nhãn khu đã nói số đó không vào tồn
  const choKhu = b.closed ? [] : b.khuAct.filter((k) => b.rm[k.id] && khuWaiting(k.id));
  const choToiDuyet = isQL() ? choKhu.filter((k) => khuDuyetDuoc(k.id)) : [];
  const choCuaToi = choKhu.filter((k) => !choToiDuyet.includes(k) && b.rm[k.id].user_id === S.me.id);
  /* Hết giờ làm mà còn báo cáo HÔM NAY chưa duyệt thì thẻ chuyển đỏ và nói hạn 0h: qua 0h số đó dồn
     sang ngày mai (carryStmts ở server), hôm nay khu đó tính như không dùng thép còn ngày mai dùng gấp
     đôi. Báo cáo đã dồn từ hôm qua thì quá hạn rồi, không đếm vào đây. */
  const gioHet = (b.settings || {}).work_to == null ? 18 : b.settings.work_to;
  const sapDon = choToiDuyet.filter((k) => !tuHomQua(b.rm[k.id]));
  const nhacHan = sapDon.length > 0 && vnHourNow() >= gioHet;
  if (choToiDuyet.length) {
    alerts.push({ bad: nhacHan, t: (choToiDuyet.length === 1 ? choToiDuyet[0].name : choToiDuyet.length + ' khu') + ' chờ bạn duyệt' + (nhacHan ? ', duyệt trước 0h' : ''),
      s: nhacHan ? 'Qua 0h số dồn sang ngày mai: hôm nay khu đó tính như không dùng thép, ngày mai dùng gấp đôi' : 'Vào Duyệt để xem số và duyệt theo từng khu', to: 'duyet' });
  }
  if (choCuaToi.length) {
    alerts.push({ bad: false, t: 'Báo cáo ' + choCuaToi.map((k) => k.name).join(', ') + ' của bạn chờ duyệt', s: 'Đã gửi, chờ cấp trên duyệt mới tính vào tồn', to: null });
  }
  /* Khu CẦN XEM LẠI: số đã duyệt, rồi một phiếu kho của khu được duyệt hoặc huỷ sau đó, nên dự kiến
     vừa đổi mà số đã duyệt thì không. Duyệt lại là quyết định về phiếu kho → chỉ cấp chỉ huy. Khu có
     báo cáo mới đang chờ thì thẻ "chờ bạn duyệt" ở trên đã nói, không nhắc hai lần. */
  if (isCH() && !b.closed) {
    const xemLai = b.khuAct.filter((k) => !khuWaiting(k.id) && khuCanXemLai(k.id));
    if (xemLai.length) alerts.push({ bad: false, t: (xemLai.length === 1 ? xemLai[0].name : xemLai.length + ' khu') + ' cần xem lại', s: 'Có phiếu kho duyệt hoặc huỷ sau khi số của khu đã duyệt. Vào Duyệt để duyệt lại', to: 'duyet' });
  }
  /* Khung ĐÃ HẾT mà thiếu: không bù được nữa, việc thiếu ghi vào nhật ký lúc chốt. Người quản lý việc
     đếm (CVKTHT) cần biết để nhắc khu; Tiểu đội trưởng không bù được khung đã qua — thẻ đỏ không bấm
     được chỉ làm họ quen bỏ qua cảnh báo.
     daBaoHomNay chứ không phải b.rm: báo cáo chưa duyệt chuyển từ hôm qua sang không phải "đã báo hôm
     nay", khu đó đã có thẻ "chưa báo" ở trên — nhắc thêm thiếu khung là hai thẻ trùng ý cho một khu. */
  const thieuSlot = !qlDem ? [] : b.khuAct.filter((k) => daBaoHomNay(k.id)).map((k) => ({ k, m: slotMissing(k.id) })).filter((x) => x.m.length);
  const slotHint = 'Không bù được, ghi vào nhật ký khi chốt sổ';
  if (thieuSlot.length > 2) alerts.push({ bad: true, t: thieuSlot.length + ' khu thiếu lần đếm', s: thieuSlot.map((x) => x.k.name).join(', ') + ' · ' + slotHint, to: 'duyet' });
  else thieuSlot.forEach((x) => alerts.push({ bad: true, t: x.k.name + ' thiếu ' + slotTenNgan(x.m), s: slotHint, to: 'duyet' }));
  /* Khung ĐANG DIỄN RA mà khu chưa đếm: đây mới là lời nhắc có ích — còn kịp đếm. Chỉ khu đã báo
     hôm nay (khu chưa báo gì thì thẻ "chưa báo" ở trên đã nói). Tiểu đội trưởng: khu họ đếm được;
     CVKTHT: mọi khu; cấp chỉ huy: không nhắc. */
  const curS = slotNow(), hNow = curS ? vnHourNow() : 0;
  if (curS && !b.closed && hNow >= curS.from && hNow < curS.to) {
    const cuaToi = isCH() ? [] : myKhu();
    const chua = cuaToi.filter((k) => daBaoHomNay(k.id) && slotNeed(k.id) && !(b.slotDone[k.id] || new Set()).has(curS.i));
    const con = 'Còn tới ' + fmtGio(curS.to);
    if (chua.length > 2) alerts.push({ bad: false, t: chua.length + ' khu chưa đếm ' + curS.label, s: chua.map((k) => k.name).join(', ') + ' · ' + con, to: 'dem' });
    else chua.forEach((k) => alerts.push({ bad: false, t: k.name + ' chưa đếm ' + slotTen(curS, b.nSlot), s: con, to: 'dem', k: k.id }));
  }
  /* Đơn gia công. Người được giao thấy đơn CỦA MÌNH: mới giao chưa nhận, trễ hạn, hạn hôm nay. Người
     giao đơn (CVKTHT trở lên) thấy đơn trễ và đơn đang vướng của cả đơn vị — hai thứ họ phải ra tay.
     Bảng đủ mọi đơn của mọi tiểu đội thì ai cũng xem được ở tab Gia công. */
  const gcAll = b.gc || [], gcToi = gcAll.filter(gcCuaToi);
  {
    const mo = gcToi.filter(gcMo);
    // đỏ: việc đã hỏng hạn hoặc bị trả về; vàng: việc còn kịp làm
    const viec = [[mo.filter((d) => d.mo_lai).length, 'bị mở lại', 1], [mo.filter(gcTre).length, 'trễ hạn', 1], 
      [mo.filter((d) => d.tt === 'moi').length, 'chưa nhận', 0], [mo.filter((d) => d.han === b.today && !gcTre(d)).length, 'hạn hôm nay', 0],
      [mo.filter(gcDungYen).length, 'chưa cập nhật tiến độ từ ' + GC_DUNG_YEN_NGAY + ' ngày', 0]].filter((x) => x[0]);
    /* Đơn của mình vừa bị HUỶ mà chưa bấm "đã biết": mỗi đơn một thẻ đỏ GỌI ĐÚNG TÊN, đứng trước mọi thẻ gia công
       khác — "1 đơn vừa bị huỷ" thì người đang cắt thép không biết phải dừng đơn nào. Bấm là mở thẳng đơn đó. */
    const huy = gcToi.filter((d) => d.tt === 'huy');
    huy.slice(0, 3).forEach((d) => alerts.push({ bad: true, t: 'KHÔNG LÀM NỮA: ' + d.cau_kien + (d.truc ? ' · ' + d.truc : ''), s: 'Lý do: ' + cut(d.huy_ly_do, 80) + ' · bấm để xem và báo đã biết', to: 'gcdon', gid: d.id }));
    if (huy.length > 3) alerts.push({ bad: true, t: 'Còn ' + (huy.length - 3) + ' đơn gia công khác của bạn bị huỷ', s: 'Bấm để xem và báo đã biết', to: 'giacong', f: 'mo' });
    // người giao hỏi "cần trả lời" trên đơn của mình: thẻ đỏ gọi đúng tên đơn, bấm là mở đơn
    mo.filter((d) => d.cho_tl).slice(0, 3).forEach((d) => alerts.push({ bad: true, t: 'Chờ bạn trả lời: ' + d.cau_kien + (d.truc ? ' · ' + d.truc : ''), s: 'Người giao hỏi và cần câu trả lời · bấm để xem và trả lời', to: 'gcdon', gid: d.id }));
    if (viec.length) alerts.push({ bad: viec.some((x) => x[2]), t: 'Đơn gia công của bạn' + (mo.length ? ': ' + mo.length + ' đơn đang mở' : ''), s: viec.map((x) => x[0] + ' ' + x[1]).join(' · ') + ' · bấm để xem', to: 'giacong', f: 'toi' });
  }
  /* Tin mới về đơn gia công liên quan tới mình (mình làm, mình giao, hoặc mình đã nhắn trong đó): một đơn thì bấm là mở
     thẳng đơn, nhiều đơn thì mở bảng ở mục "Có tin mới". */
  {
    const tn = b.gcTn || [], tong = tn.reduce((a, x) => a + x.moi, 0);
    if (tong) alerts.push({ bad: false, t: tong + ' tin mới về đơn gia công', s: tn.slice(0, 3).map((x) => x.cau_kien + (x.truc ? ' · ' + x.truc : '')).join(', ') + (tn.length > 3 ? '…' : '') + ' · bấm để đọc', to: tn.length === 1 ? 'gcdon' : 'giacong', gid: tn.length === 1 ? tn[0].id : undefined, f: tn.length === 1 ? undefined : 'tin' });
  }
  /* XUẤT. Tổ: đơn của mình đã xong mà chưa gửi xuất (đỏ khi quá 1 ngày). Người giao: đơn chờ mình duyệt xuất, và
     đơn của các tổ xong quá 1 ngày chưa xuất. */
  {
    const chua = gcToi.filter((d) => gcChoXuat(d) && !d.xuat_tt), tre = chua.filter(gcXuatTre).length;
    if (chua.length) alerts.push({ bad: tre > 0, t: chua.length + ' đơn gia công của bạn đã xong, chưa xuất', s: (tre ? tre + ' đơn quá 1 ngày · ' : '') + 'Ký giao nhận, kiểm đếm, chụp ảnh rồi bấm Xuất', to: chua.length === 1 ? 'gcdon' : 'giacong', gid: chua.length === 1 ? chua[0].id : undefined, f: chua.length === 1 ? undefined : 'xuat' });
    if (isQL()) {
      const cho = gcAll.filter((d) => d.tt === 'xong' && d.xuat_tt === 'cho' && !gcCuaToi(d));
      if (cho.length) alerts.push({ bad: false, t: cho.length + ' đơn gia công chờ bạn duyệt xuất', s: cho.slice(0, 3).map((d) => d.cau_kien + (d.truc ? ' · ' + d.truc : '')).join(', ') + ' · bấm để xem và duyệt', to: cho.length === 1 ? 'gcdon' : 'giacong', gid: cho.length === 1 ? cho[0].id : undefined, f: cho.length === 1 ? undefined : 'xuat' });
      const quaHan = gcAll.filter((d) => !gcCuaToi(d) && gcXuatTre(d)).length;
      if (quaHan) alerts.push({ bad: true, t: quaHan + ' đơn gia công xong quá 1 ngày chưa xuất', s: 'Nhắc tổ ký giao nhận, kiểm đếm, chụp ảnh rồi bấm Xuất', to: 'giacong', f: 'xuat' });
    }
  }
  if (isQL()) {
    const khac = gcAll.filter((d) => gcMo(d) && !gcCuaToi(d));
    const tre = khac.filter(gcTre).length, vg = khac.filter((d) => d.vuong).length;
    // đơn đã huỷ mà người giữ đơn chưa bấm "đã biết": có thể họ vẫn đang làm — người giao cần gọi trực tiếp
    const chuaXem = gcAll.filter((d) => d.tt === 'huy' && !gcCuaToi(d)).length;
    if (chuaXem) alerts.push({ bad: false, t: chuaXem + ' đơn gia công đã huỷ mà người giữ đơn chưa xem', s: 'Có thể họ vẫn đang làm. Xem ở mục Xong / huỷ rồi báo trực tiếp', to: 'giacong', f: 'dong' });
    /* Vướng: nói rõ bao nhiêu đơn tổ DỪNG HẲN và bao nhiêu lần báo CHƯA AI NHẬN XỬ LÝ — đó là việc của người giao.
       Đơn đứng yên (đã nhận mà mấy ngày không ai cập nhật) cũng nhắc ở đây, vì không thẻ nào khác bắt được nó. */
    const vgDs = khac.filter((d) => d.vuong), dung = vgDs.filter((d) => d.vuong_dung).length, chua = vgDs.filter((d) => !d.vuong_xem_ts).length;
    const yen = khac.filter(gcDungYen).length;
    const vgTxt = vg ? vg + ' đơn đang vướng' + (dung || chua ? ' (' + [dung ? dung + ' dừng hẳn' : '', chua ? chua + ' chưa ai xử lý' : ''].filter(Boolean).join(', ') + ')' : '') : '';
    if (tre || vg || yen) alerts.push({ bad: !!tre || (dung > 0 && chua > 0), t: 'Gia công: ' + [tre ? tre + ' đơn trễ hạn' : '', vgTxt, yen ? yen + ' đơn đứng yên' : ''].filter(Boolean).join(' · '), s: chua ? 'Vào đơn đang vướng, bấm "Đã xem, đang xử lý" để tổ biết' : 'Xem tiểu đội nào đang trễ, đang kẹt ở tab Gia công', to: 'giacong', f: chua || (vg && !tre) ? 'vuong' : tre ? 'tre' : 'dungyen' });
  }
  /* Quân số đầu ca. Tiểu đội trưởng: tổ mình chưa báo ca đang diễn ra. CVKTHT (người gom số để soạn báo cáo
     ca): tổ nào chưa báo, để nhắc. Cấp chỉ huy không bị nhắc, như việc đếm. */
  /* Chỉ nhắc tổ ở CA TỔ ĐANG LÀM (theo lần báo gần nhất): tổ ca đêm không bị nhắc báo ca ngày. Mỗi ca có hạn
     báo; còn trong hạn thì thẻ vàng, quá hạn thì đỏ. */
  const qc = qsCaNay();
  if (qc) {
    // Tiểu đội trưởng không có thẻ nhắc ở đây: thẻ BÁO QUÂN SỐ nằm ngay đầu trang (qsTheHome) vừa nhắc vừa là chỗ báo
    const phai = qlDem ? b.qs.to.filter((t) => qsLamCa(t, qc.ca.ca)) : [], chua = phai.filter((t) => !qc.da(t));
    /* Qua hạn báo mà báo cáo ca chưa chép: nhắc người soạn (CVKTHT), bấm là mở thẳng màn soạn đúng ca đó. Ca đã chép
       thì thôi nhắc (b.qs.bcDa). Bản đang có qua giờ giao ca thì bcDa là của ca cũ: không nhắc tới khi tải lại. */
    const canSoan = qlDem && qc.tre && !b.qs.bcDa && caKhoa(qc.ca) === caKhoa(b.qs.hien) && phai.length;
    /* Còn tổ chưa báo: một thẻ, mở màn báo cáo ca — bước 1 ở đó có danh sách tổ và nút chép tin nhắc. Các tổ báo đủ rồi
       mà báo cáo ca chưa chép: thẻ mở thẳng màn soạn. */
    if (chua.length) alerts.push({ bad: qc.tre, t: chua.length + '/' + phai.length + ' tổ chưa báo quân số ' + caGoi(qc.ca) + (qc.tre ? ', đã quá hạn' : ''), s: chua.map((t) => t.name).join(', ') + ' · hạn báo ' + hhmm(qc.han) + ' · bấm để nhắc' + (canSoan ? ' hoặc soạn báo cáo ca' : ''), to: 'baocaoca' });
    else if (canSoan) alerts.push({ bad: false, t: 'Soạn báo cáo ' + caGoi(qc.ca) + ' gửi cấp trên', s: phai.length + '/' + phai.length + ' tổ đã báo quân số · bấm để soạn và chép', to: 'baocaoca' });
  }
  /* Khoản vay mượn QUÁ HẠN TRẢ (phần còn nợ của lần vay đã qua hạn): người lập phiếu được là người đi đòi
     hoặc đi trả, nên chỉ họ thấy. Nói cả hai chiều, vì mình nợ quá hạn cũng là việc phải xử lý. */
  const qh = b.loanQuaHan || { no: 0, co: 0 };
  if (canIn() && (qh.no || qh.co)) {
    alerts.push({ bad: true, t: (qh.no + qh.co) + ' khoản vay mượn quá hạn trả', s: [qh.co ? 'đối tác nợ mình ' + qh.co + ' khoản' : '', qh.no ? 'mình nợ đối tác ' + qh.no + ' khoản' : ''].filter(Boolean).join(' · '), to: 'vaymuon' });
  }
  // sổ vay mượn chờ duyệt: nhắc đúng số lần ghi NGƯỜI NÀY duyệt được (server đếm sẵn theo cấp bậc)
  if (isQL() && b.svDuyet) alerts.push({ bad: false, t: b.svDuyet + ' lần xuất sắt vụn chờ bạn duyệt', s: 'Chưa tính vào thống kê sắt vụn', to: 'satvun' });
  if (isQL() && b.loanDuyet) alerts.push({ bad: false, t: b.loanDuyet + ' lần ghi vay mượn chờ bạn duyệt', s: 'Chưa tính vào dư nợ với đối tác', to: 'vaymuon' });
  /* Phiếu kho chờ duyệt: cấp chỉ huy duyệt được mọi phiếu nên thấy tất cả; người khác chỉ thấy phiếu
     CỦA MÌNH đang chờ (phiếu của người khác không phải việc của họ). */
  const choP = (b.receipts || []).filter((r) => !r.duyet_day && !r.voided);
  const nPhieu = (list) => new Set(list.map((r) => r.grp || 'id' + r.id)).size;
  if (isCH() && choP.length) {
    alerts.push({ bad: false, t: nPhieu(choP) + ' phiếu chờ bạn duyệt', s: 'Chưa tính vào tồn. Vào Duyệt để duyệt hoặc từ chối', to: 'duyet' });
  } else if (canIn()) {
    const cuaToi = choP.filter((r) => r.user_id === S.me.id);
    if (cuaToi.length) alerts.push({ bad: false, t: nPhieu(cuaToi) + ' phiếu của bạn chờ duyệt', s: 'Chưa tính vào tồn, chờ ' + CAP_TREN + ' duyệt', to: 'nhap' });
  }
  // Gom các phi cùng một loại cảnh báo vào MỘT thẻ khi có nhiều hơn 2:
  // ngày đầu chưa có tồn chuẩn, cả 15 phi đều dưới mức tối thiểu sẽ đẩy hết nội dung khác xuống dưới.
  const rateTxt = (p) => (b.rate[p.id] ? (isCuon(p) ? fmtDec(b.rate[p.id] / p.bo_size) + ' cuộn/ngày' : fmtInt(b.rate[p.id]) + ' cây/ngày') : '');
  const neg = [], low = [], shortp = [];
  /* Cảnh báo theo phi: "đã dùng âm" là số liệu cần soi lại — việc của người duyệt (huỷ báo cáo sai);
     tồn thấp / sắp hết là việc của người lo nhập thép (từ CVKTHT trở lên). Tiểu đội trưởng không làm gì
     được với các thẻ này nên không thấy. */
  if (canIn()) b.phiAct.forEach((p) => {
    // cùng ngưỡng kg với màn Duyệt: lệch vài cây là sai số đếm thường ngày, báo đỏ ở đây thì
    // bấm sang Duyệt lại không có việc gì để xử lý, và người dùng mất tin vào cảnh báo
    if (b.lastClosed && T.used[p.id] * p.kg_per_cay < -LIM('negKg')) neg.push(p);
    const dl = daysLeft(p.id, T.perPhi[p.id]);
    if (T.perPhi[p.id] < p.min_stock) low.push(p);
    else if (dl !== null && dl < 3) shortp.push({ p, dl });
  });
  const toDuyet = 'duyet';
  if (!isQL()) neg.length = 0;
  if (neg.length > 2) alerts.push({ bad: true, t: neg.length + ' phi có số "đã dùng" âm', s: neg.map((p) => p.id).join(', ') + ' · nhập sót phiếu hoặc đếm sai?', to: toDuyet });
  else neg.forEach((p) => alerts.push({ bad: true, t: p.id + ' đã dùng âm (' + qMain(T.used[p.id], p) + ')', s: 'Nhập sót phiếu hoặc đếm sai?', to: toDuyet }));
  if (low.length > 2) alerts.push({ bad: true, t: low.length + ' phi dưới mức báo động', s: low.map((p) => p.id).join(', '), to: 'ton' });
  else low.forEach((p) => { const [cur, mn] = qPair(T.perPhi[p.id], p.min_stock, p); alerts.push({ bad: true, t: p.id + ' dưới mức báo động', s: 'Còn ' + cur + ', báo động ' + mn, to: 'ton' }); });
  if (shortp.length > 2) alerts.push({ bad: false, t: shortp.length + ' phi chỉ còn đủ dùng dưới 3 ngày', s: shortp.map((x) => x.p.id).join(', '), to: 'ton' });
  else shortp.forEach((x) => alerts.push({ bad: false, t: x.p.id + ' chỉ còn đủ dùng ' + daysTxt(x.dl), s: 'Còn ' + qMain(T.perPhi[x.p.id], x.p) + (rateTxt(x.p) ? ', dùng trung bình ' + rateTxt(x.p) : ''), to: 'ton' }));
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
  const canXuLy = pendingHtml() + (alerts.length ? `<h2 class="sec">Cần xử lý (${alerts.length})</h2>` + alerts.map((a) => {
    const inner = `<span class="f1 col" style="gap:2px"><b style="font-size:18px">${esc(a.t)}</b><span class="sm">${esc(a.s)}</span></span>`;
    return a.to
      ? `<button class="alertbtn ${a.bad ? 'bad' : 'warn'}" data-a="nav" data-s="${a.to}"${a.k ? ` data-k="${esc(a.k)}"` : ''}${a.f ? ` data-f="${a.f}"` : ''}${a.gid ? ` data-gid="${a.gid}"` : ''}>${inner}${IC.chev}</button>`
      : `<div class="alertbtn ${a.bad ? 'bad' : 'warn'}">${inner}</div>`;
  }).join('') : '');
  /* Tiểu đội trưởng: việc của họ (báo ca, việc cần xử lý, đơn gia công) đứng TRÊN ô tồn toàn bãi — họ không quản tồn
     cả bãi, mà ô đó cao gần nửa màn, đẩy "Cần xử lý" xuống dưới phải cuộn mới thấy. Cấp trên thì giữ tồn bãi ở đầu. */
  const tren = S.me.role === 'tieudoi' ? qsTheHome() + canXuLy + gcHomeRow() : '';
  return `<div class="f1 scroll" id="body">
    ${tren ? `<div class="pad col gap12" style="padding-top:calc(16px + env(safe-area-inset-top));padding-bottom:0">${tren}</div>` : ''}
    <div class="hero"${tren ? ' style="margin-top:12px;padding-top:18px"' : ''}>
      <div class="row" style="justify-content:space-between"><span>Tổng quan · ${esc(b.today.split('-').reverse().join('/'))}</span><span class="badge" style="background:#fff;color:var(--pri)">${esc(nguoiTen(S.me))}</span></div>
      <div class="row" style="justify-content:space-between;align-items:flex-end;gap:10px;flex-wrap:wrap"><div class="col"><span style="font-size:16px">Tồn toàn bãi</span><span class="big">${fmtT(T.kg)} tấn</span></div><span style="font-size:18px;padding-bottom:6px">${cayTxt(T.cay)}</span></div>
      <div class="sm" style="color:#D6E0EE">${note}</div>
      <div class="mini"><div><span>Nhập hôm nay</span><b>${fmtT(T.inKg)} tấn</b></div><div><span>${usedLabel}</span><b>${usedTxt}</b></div></div>
    </div>
    ${b.closed ? `<div class="toast" style="margin-top:12px">${b.closedReset ? 'Hôm nay admin vừa đặt lại số liệu, ngày đã khoá.' : 'Sổ hôm nay đã chốt.'}</div>` : ''}
    <div class="pad col gap12">
      ${tren ? '' : gcHomeRow() + canXuLy}
      <div class="row" style="justify-content:space-between;align-items:baseline;gap:8px"><h2 class="sec" style="min-width:0">Tồn theo khu và người báo</h2><span class="sm muted" style="white-space:nowrap;flex:none">${reportedCount()}/${b.khuAct.length} khu đã báo</span></div>
      ${khuCards}
      <div class="row" style="justify-content:space-between;align-items:baseline;gap:8px"><h2 class="sec" style="min-width:0">Tồn theo đường kính</h2><button class="b" style="border:0;background:transparent;color:var(--pri);text-decoration:underline;font-size:16px;padding:8px 0;white-space:nowrap;flex:none" data-a="nav" data-s="ton">Xem chi tiết</button></div>
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
  /* Kiểu "Tất cả": đây là chỗ xem CHI TIẾT nên bó, cây, tấn đứng ba cột riêng, thẳng hàng giữa các
     phi — không dồn vào một câu "1.750 cây (3 bó + 430 cây) · 12,63 tấn" phải đọc mới tách ra được.
     Số khu vừa báo (đang chờ duyệt) xuống dòng riêng bên dưới, cũng đủ ba đơn vị. Các kiểu Cây / Bó /
     Tấn giữ một cột theo đúng đơn vị người dùng đã chọn. */
  const ba = S.unit === 'all';
  const COT = 'display:grid;grid-template-columns:1.5fr 1fr 1fr;gap:6px;text-align:right';
  const dong = (r) => {
    const lech = r.moi === null ? null : r.moi - r.v;
    const lechTxt = lech ? ' (' + fmtQd(lech, r.p, true) + ')' : '';
    const mauBao = lech ? 'var(--warn)' : 'var(--mut)';
    if (!ba || r.v < 0) {
      return `<div class="li" style="gap:6px${r.v || r.moi ? '' : ';color:var(--mut)'}"><b style="width:44px">${r.p.id}</b>
      <span class="f1 sm">${r.v ? fmtQ(r.v, r.p) : '0'}</span>
      ${r.moi === null ? '' : `<span class="sm" style="white-space:nowrap;color:${mauBao}">${r.trong ? 'để trống' : fmtQs(r.moi, r.p)}${lechTxt}</span>`}</div>`;
    }
    const cu = isCuon(r.p);
    const bo = cu ? cuonTxt(r.v, r.p) : r.p.bo_size > 1 && r.v >= r.p.bo_size ? qBo(r.v, r.p) : '<span class="muted" style="font-weight:400">chưa đủ bó</span>';
    return `<div class="li" style="gap:6px;flex-wrap:wrap${r.v || r.moi ? '' : ';color:var(--mut)'}"><b style="width:44px">${r.p.id}</b>
      ${r.v ? `<span class="f1 sm" style="${COT}"><b style="text-align:left">${bo}</b><span>${cu ? '' : fmtInt(r.v) + ' cây'}</span><span>${qKg(r.v, r.p)}</span></span>` : '<span class="f1 sm">0</span>'}
      ${r.moi === null ? '' : `<span class="sm" style="width:100%;padding-left:50px;color:${mauBao}">Khu báo: ${r.trong ? 'để trống' : r.moi ? fmtQ(r.moi, r.p) : '0'}${lechTxt}</span>`}</div>`;
  };
  const tongCay = rows.reduce((a, r) => a + (isCuon(r.p) ? 0 : r.v), 0);
  return `<div class="col gap6" style="border-top:1px solid var(--line);padding-top:8px">
    <div class="li sm b" style="background:#E8EEF6"><span style="width:44px">ɸ</span>${ba
      ? `<span class="f1" style="${COT}"><span style="text-align:left">Đang có${coCho ? ' (trước báo cáo)' : ''}: bó</span><span>cây</span><span>tấn</span></span>`
      : `<span class="f1">Đang có${coCho ? ' (trước báo cáo)' : ''}</span>${coCho ? '<span>Khu báo</span>' : ''}`}</div>
    <div class="card" style="padding:0;overflow:hidden;margin:0">${rows.map(dong).join('')}</div>
    <div class="row sm" style="justify-content:space-between;gap:8px"><span class="muted">${coThep}/${rows.length} phi có thép</span><b style="text-align:right">${tongCay ? cayTxt(tongCay) + ' · ' : ''}${fmtT(tongKg)} tấn</b></div>
    ${coCho
      ? `<span class="sm" style="line-height:1.45;color:var(--warn)"><b>Số ${ba ? 'ở dòng trên' : 'bên trái'} là số đang dùng, chưa tính báo cáo mới.</b> Khi cấp trên duyệt báo cáo, nó đổi thành số ở ${ba ? 'dòng' : 'cột'} "Khu báo".</span>`
      : '<span class="sm muted" style="line-height:1.45">Đây là số đã duyệt, cũng là số đang dùng để tính tồn bãi.</span>'}
    ${nutDem}
  </div>`;
}

/* --- Chọn khu --- */
/* Số phi người này đã TỰ GÕ trong nháp đếm dở của một khu (ô điền sẵn từ lần gửi trước không tính). */
function demDo(kid) {
  let d = null;
  try { d = JSON.parse(localStorage.getItem(draftKey(kid)) || 'null'); } catch (e) { d = null; }
  return d && d.cells ? Object.values(d.cells).filter((c) => c && !c.src).length : 0;
}
/* MÀN CHỌN KHU — bước đầu của tab Báo cáo. Mỗi khu một thẻ: trạng thái hôm nay (chưa báo, chờ duyệt,
   bị huỷ, thiếu buổi...), ai báo lúc nào, và việc dở dang của CHÍNH người đang cầm máy (đang đếm dở,
   báo cáo chưa gửi được vì mất mạng). Khu cần làm đứng trước, khu đã xong xếp sau. */
function vKhu() {
  const b = S.boot;
  const mine = myKhu();
  const cur = slotNow();
  const xong = (k) => (cur && b.nSlot > 1 ? (b.slotDone[k.id] || new Set()).has(cur.i) : daBaoHomNay(k.id)) && khuStatus(k).cls === 'ok';
  const cho = readPending().filter(ofMe);
  const cards = mine.slice().sort((x, y) => Number(xong(x)) - Number(xong(y))).map((k) => {
    const st = khuStatus(k);
    const cls = st.cls === 'ok' ? 'background:var(--okbg);border:2px solid var(--ok)' : st.cls === 'warn' ? 'background:var(--warnbg);border:2px solid var(--warn)' : 'background:#ECEAE4;border:2px solid #8C8678';
    const n = demDo(k.id), guiSau = cho.some((j) => j.khu === k.id);
    const viec = [
      guiSau ? '<span class="sm b" style="color:var(--bad)">Có báo cáo chưa gửi được</span>' : '',
      n ? `<span class="sm b" style="color:var(--pri)">Đang đếm dở ${n} phi</span>` : '',
      cur && b.nSlot > 1 && slotNeed(k.id) && !(b.slotDone[k.id] || new Set()).has(cur.i) && daBaoHomNay(k.id) ? `<span class="sm b" style="color:var(--warn)">Chưa đếm ${esc(slotTen(cur, b.nSlot))}</span>` : '',
    ].filter(Boolean).join('');
    return `<button class="col gap8" style="${cls};min-height:104px;padding:14px;border-radius:16px;text-align:left;align-items:flex-start" data-a="khuopen" data-k="${esc(k.id)}">
      <b class="clamp2" style="font-size:20px;line-height:1.2;width:100%">${esc(k.name)}</b><span class="badge ${st.cls}">${st.label}</span><span class="sm">${esc(st.who)}</span>${viec}</button>`;
  }).join('');
  const hidden = b.khuAct.length - mine.length;
  /* Đếm nhiều lần/ngày thì "đã báo" phải hiểu theo khung đang diễn ra: khu báo lúc 8h đã xong
     buổi sáng nhưng chưa xong buổi chiều, nói "Đã báo 3/3" lúc 14h là sai. */
  const cua = isQL() ? 'khu' : 'khu của bạn';
  const sub = !mine.length ? 'Bạn chưa được giao khu nào'
    : cur && b.nSlot > 1 ? 'Đang ' + cur.label + ': đã đếm ' + mine.filter((k) => (b.slotDone[k.id] || new Set()).has(cur.i)).length + '/' + mine.length + ' ' + cua
    : 'Đã báo ' + mine.filter((k) => daBaoHomNay(k.id)).length + '/' + mine.length + ' ' + cua;
  const body = mine.length
    ? `<div class="sm muted" style="padding:0 2px 10px;line-height:1.4">Chạm vào khu bạn đang đứng để mở bảng đếm của khu đó.</div>
      ${b.closed ? `<div class="card warn" style="margin-bottom:10px">${ngayKhoaMsg()}</div>` : ''}
      <div class="grid2">${cards}</div>${hidden ? `<div class="sm muted" style="padding:10px 2px;line-height:1.4">Còn ${hidden} khu do người khác phụ trách nên không hiện ở đây.</div>` : ''}`
    : `<div class="card warn col gap6"><b style="font-size:18px">Chưa được giao khu nào</b><span class="sm" style="line-height:1.4">Admin cần vào Thêm → Cài đặt → Khu bãi để giao khu cho bạn. Khi đó khu sẽ hiện ở màn này.</span></div>`;
  return `${head('Chọn khu để báo cáo', sub, 'home')}
    <div class="f1 scroll pad" id="body">${body}</div>`;
}

/* --- Bảng đếm toàn bãi --- */
function demView() {
  const b = S.boot, k = S.khu, kname = b.khuBy[k].name;
  if (!b.phiAct.length) return `${head('Báo cáo ' + esc(kname), '', 'home')}<div class="pad muted">Chưa có phi thép nào trong hệ thống. Admin vào Thêm → Cài đặt → "Khôi phục phi mặc định".</div>`;
  if (!canCount(k)) return `${head('Báo cáo ' + esc(kname), 'Không có quyền', 'khu')}<div class="pad"><div class="card warn col gap6"><b style="font-size:18px">Bạn không phụ trách ${esc(kname)}</b><span class="sm" style="line-height:1.4">Khu này đã giao cho người khác. Hãy chọn khu của bạn, hoặc nhờ admin giao khu.</span><button class="btn s full" data-a="nav" data-s="khu">Chọn khu khác</button></div></div>`;
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
    const refTxt = refLbl(k, p) + ': ' + (ref === undefined ? 'chưa có' : qMain(ref, selPhi)) + (mv ? ` · ${mv > 0 ? 'nhập/chuyển vào +' + qMain(mv, selPhi) : 'chuyển đi −' + qMain(Math.abs(mv), selPhi)} · <b>dự kiến ${qMain(ex, selPhi)}</b>` : '');
    const cu = isCuon(p);
    /* "Xoá" hứa xoá cả ô nhưng nút này chỉ bớt một chữ số, nên nói đúng việc nó làm. */
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Xoá 1 số', '0', S.field === 'bo' ? (cu ? 'Dở ›' : 'Lẻ ›') : (cu ? '‹ Cuộn' : '‹ Bó')];
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

  return `<div class="top" style="padding-bottom:2px"><button class="iconbtn" aria-label="Về danh sách khu" data-a="nav" data-s="khu">${IC.back}</button><div class="t"><h1>Báo cáo ${esc(kname)}</h1><small>${slotNow() ? 'Lần đếm ' + esc(slotNow().label) + ((b.slotDone[k] || new Set()).has(slotNow().i) ? ' · khu này đã đếm' : ' · khu này chưa đếm') : 'Bảng toàn bãi, nhập ngay trong bảng'}</small></div><button class="btn s" style="font-size:14px;flex:none" data-a="nav" data-s="khu">Chọn khu khác</button></div>
    <div class="mxhead"><div style="min-width:0"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(kname)} (bạn)</span><b>${fmtT(T.ownKg)} tấn</b></div><div style="text-align:center;flex:none"><span>Phi chưa nhập</span><b>${pend.length}</b></div><div style="text-align:right;flex:none"><span>Tổng bãi (tạm tính)</span><b>${fmtT(T.allKg)} tấn</b></div></div>
    ${S.toast ? `<div class="toast ${S.toastErr ? 'err' : ''}" data-toast="1" role="${S.toastErr ? 'alert' : 'status'}" aria-live="${S.toastErr ? 'assertive' : 'polite'}">${esc(S.toast)}</div>` : ''}
    ${b.closed ? `<div class="toast err">${ngayKhoaMsg()}</div>` : ''}
    ${S.sel ? '' : `<div class="col gap6 tbar" style="padding:6px 12px 2px">${huyCard(k)}${already ? `<div class="card sm" style="line-height:1.4"><b>${esc(already.uname)} đã báo ${esc(kname)} lúc ${hhmm(already.ts)}.</b> Bạn đang đếm lại: chỉ gửi khi vừa đếm thực tế, số khác với người trước cấp trên sẽ xem.</div>` : ''}${rep0 && khuWaiting(k) && !b.closed ? `<div class="card warn sm" style="line-height:1.4"><b>Báo cáo ${esc(kname)} ${tuHomQua(rep0) ? 'ngày ' + esc(fmtDay(vnDayOf(rep0.ts))) + ' ' : ''}lúc ${hhmm(rep0.ts)} đang chờ cấp trên duyệt.</b> ${dienSan(rep0.ts)
      ? 'Số dưới đây là số đã gửi; nó chỉ vào tồn bãi sau khi được duyệt. Gửi lại sẽ thay số đang chờ.'
      : `Số đó ${tuHomQua(rep0) ? 'của ngày trước' : 'của lần đếm trước'} nên không điền sẵn vào bảng: hãy đếm thực tế rồi gửi, số mới sẽ thay số đang chờ.`}</div>` : ''}<button class="btn s full ${pend.length === 0 || !keepable.length ? 'dis' : ''}" data-a="keepall">${keepTxt}</button>
      ${S.draftWarn ? `<div class="card warn col gap6"><b>${esc(S.draftWarn.uname)} đã gửi báo cáo khu này lúc ${hhmm(S.draftWarn.ts)}, sau khi bạn bắt đầu nháp.</b><div class="row gap6"><button class="btn s f1" data-a="draftnew">Dùng số mới</button><button class="btn s f1" data-a="draftkeep">Giữ nháp của tôi</button></div></div>` : ''}
      <button class="sm" style="border:0;background:transparent;color:var(--pri);text-align:left;padding:4px 0;text-decoration:underline" data-a="legend">${S.legend ? 'Ẩn chú thích' : 'ⓘ Chú thích màu'}</button>
      ${S.legend ? '<div class="sm muted" style="line-height:1.4">Xanh lá: đã đếm · Dấu =: giữ nguyên · Dấu — : để trống, gửi đi sẽ ghi 0 · Viền cam đậm: lệch lớn so với dự kiến, hoặc để trống phi đang có thép. Phi khu không có thì cứ để trống. Chạm chữ cái khu để phóng to.</div>' : ''}
      ${nBlank ? `<div class="sm b" style="color:var(--bad);line-height:1.4">${nBlank} phi đang có thép mà còn để trống: ${blankWithStock().slice(0, 6).map((p) => p.id).join(', ')}${nBlank > 6 ? '…' : ''}. Gửi là ghi 0.</div>` : ''}</div>`}
    <div class="f1" id="mx"><div class="mxw">
      <div class="mxl"><div class="mxh"><div class="mxp" style="font-size:14px">ɸ</div><div class="mxo" style="font-size:14px;font-weight:700;color:var(--pri)">Bạn đếm</div><div class="mxv" style="font-size:14px">Tổng bãi</div></div>${lrows.join('')}<div class="mxtot"><div class="mxp" style="font-size:12px;line-height:1.1">Tổng<br>(tấn)</div><div class="mxo" style="font-weight:700;color:var(--pri)">${fmtT(T.ownKg)}</div><div class="mxv">${fmtT(T.allKg)}</div></div></div>
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
      return `${r.phi_id} ${fmtQd(r.qty, rp, dc || vay)}`;
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
  if (!canIn()) return `${head('Nhập kho', '', 'home')}<div class="pad"><div class="card warn">Tiểu đội trưởng không lập phiếu nhập, chuyển, xuất và điều chỉnh — việc này của CVKTHT và cấp chỉ huy.</div></div>`;
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
  const lines = N.lines.length ? `<div class="card" style="padding:0;overflow:hidden">${N.lines.map((l, i) => { const lp = b.phiBy[l.phi]; return `<div class="li"><span><b>${l.phi}</b> · ${fmtQ(l.qty, lp)}</span><button class="btn s bad" data-a="nrm" data-i="${i}">Xoá</button></div>`; }).join('')}<div class="li" style="background:#E8EEF6"><b>${N.lines.length} dòng</b><b>${fmtT(lineKg)} tấn</b></div></div>` : '';
  const groups = receiptGroups(b.receipts);
  const recs = groups.map((g) => {
    const cho = !g.duyet_day;
    /* Phiếu chờ duyệt: người lập rút lại được không giới hạn thời gian, vì nó chưa vào tồn.
       Phiếu đã duyệt: chỉ trong 10 phút kể từ LÚC DUYỆT (lúc nó vào tồn), sau đó nhờ admin.
       Mốc là giờ duyệt chứ không phải giờ nhập: phiếu có thể được duyệt sau hàng giờ, lấy mốc
       nhập thì người lập không bao giờ kịp hoàn tác. */
    const mine = g.r0.user_id === S.me.id;
    // phiếu kho chỉ cấp chỉ huy duyệt; ai duyệt được thì cũng từ chối / huỷ được
    const quyen = isCH();
    const can = quyen || (mine && (cho || Date.now() - g.r0.duyet_ts < 10 * 60e3));
    const ngay = cho
      ? (g.r0.day !== b.today ? ` · nhập ${esc(fmtDay(g.r0.day))}` : '')
      : (g.r0.duyet_day !== g.r0.day ? ` · nhập ${esc(fmtDay(g.r0.day))}, duyệt ${esc(fmtDay(g.r0.duyet_day))}` : '');
    const trangThai = cho
      ? '<span class="badge warn">Chờ duyệt</span>'
      : `<span class="badge ok">Đã duyệt${g.r0.duyet_name ? ' · ' + esc(g.r0.duyet_name) : ''}</span>`;
    const nut = quyen && cho
      ? `<div class="row gap6"><button class="btn s ok" data-a="pduyet" data-id="${g.id}">Duyệt</button><button class="btn s bad" data-a="void" data-id="${g.id}">Từ chối</button></div>`
      : can ? `<button class="btn s bad" data-a="void" data-id="${g.id}">${cho ? 'Rút lại' : 'Huỷ'}</button>`
      // không có nút thì nói vì sao: phiếu của người khác đang chờ duyệt, hay của mình mà đã quá giờ
      : cho ? '<span class="sm muted" style="text-align:right;max-width:92px">chờ cấp trên duyệt</span>'
      : mine ? '<span class="sm muted" style="text-align:right;max-width:92px">quá 10 phút, nhờ cấp trên huỷ</span>'
      : '';
    return `<div class="li"><span><b>${g.title}</b> ${trangThai}<br>${esc(kemTan(g.what, g.kg))}<br><span class="sm muted">${esc(g.r0.uname)} · ${hhmm(g.r0.ts)}${ngay}${g.r0.note ? ' · ' + esc(g.r0.note) : ''}</span></span>${nut}</div>`;
  }).join('');
  const saveLbl = dc ? 'XÁC NHẬN ĐIỀU CHỈNH' : xuat ? 'GHI PHIẾU XUẤT' : chuyen ? 'XÁC NHẬN CHUYỂN KHU' : 'XÁC NHẬN NHẬP KHO';
  const tieu = dc ? ['Điều chỉnh tồn', 'Sửa sổ khi số trong sổ không khớp thực tế']
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
    ${N.done ? `<div class="card warn col gap8"><b style="font-size:18px">Đã lưu phiếu · chờ cấp trên duyệt</b><span style="font-size:18px">${esc(N.done.text)}</span><span class="sm" style="line-height:1.4">Phiếu chỉ tính vào tồn sau khi được duyệt. Chứng từ ghi cả ngày nhập và ngày duyệt.</span><button class="btn s full" data-a="void" data-id="${N.done.id}">RÚT LẠI CẢ PHIẾU</button></div>` : ''}
    ${xuat ? `<div class="card col gap6" style="border:2px solid var(--pri)"><b style="font-size:18px">Phiếu xuất: không bắt buộc</b><span class="sm" style="line-height:1.45">Ghi để biết thép đi đâu; không ghi thì lượng dùng vẫn được tính. Phiếu cần cấp trên duyệt.</span></div>` : ''}
    ${dc ? `<div class="card bad col gap6"><b style="font-size:18px">Việc này SỬA SỔ, không phải ghi thép ra vào</b><span class="sm" style="line-height:1.45">Chỉ dùng khi số trong sổ sai mà không phiếu nào giải thích được. Thép về hoặc dời khu: dùng <b>Nhập thép về</b>, <b>Chuyển khu</b>. Thép dùng hết: để khu đếm lại. Phiếu cần cấp trên duyệt; lý do lưu trong nhật ký.</span></div>` : ''}
    ${chuyen
      ? `<div class="col gap8"><b style="font-size:18px">1. Từ khu</b>${khuChips(N.from, 'from')}</div><div class="col gap8"><b style="font-size:18px">2. Sang khu</b>${khuChips(N.to, 'to', N.from)}</div>`
      : `<div class="col gap8"><b style="font-size:18px">1. ${dc ? 'Sửa tồn của khu' : xuat ? 'Lấy thép từ khu' : 'Để vào khu'}</b>${khuChips(N.khu, 'khu')}</div>`}
    ${xuat ? `<div class="col gap8"><b style="font-size:18px">2. Xuất cho ai / công trình nào</b>
      <input class="inp s" id="nnoi" maxlength="120" placeholder="Ví dụ: Công trình Nam Hà, tổ 3" data-model="nnoi" value="${esc(S.form.nnoi || '')}">
      <span class="sm muted" style="line-height:1.4">Bắt buộc: ghi xuất cho ai hoặc công trình nào.</span></div>` : ''}
    ${dc ? `<div class="col gap8"><b style="font-size:18px">2. Tăng hay giảm</b>
      <div class="row gap6"><button class="chip f1 ${N.dir === 'tang' ? 'on' : ''}" data-a="ndir" data-v="tang">Tăng tồn (+)</button><button class="chip f1 ${N.dir === 'giam' ? 'on' : ''}" data-a="ndir" data-v="giam">Giảm tồn (−)</button></div>
      <span class="sm muted">${N.dir === 'tang' ? 'Sổ đang ghi THIẾU so với thực tế ngoài bãi.' : 'Sổ đang ghi THỪA so với thực tế ngoài bãi.'}</span></div>` : ''}
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
    <div class="hero tbar" style="margin:4px 16px;border-radius:14px;padding:14px 16px"><div class="row" style="justify-content:space-between;gap:10px;flex-wrap:wrap"><div class="col"><span style="font-size:16px">Tổng toàn bãi</span><span style="font-size:32px;font-weight:700">${fmtT(T.kg)} tấn</span></div><span style="font-size:18px">${cayTxt(T.cay)}</span></div></div>
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
  const canPick = !R.closed && subData.length > 1;
  /* Đếm nhiều lần/ngày: lần báo của KHUNG GIỜ KHÁC không phải là phương án thay thế cho số mới nhất —
     buổi chiều khác buổi sáng là vì thép đã dùng, đã về. Nên chỉ đem so (tô màu) và chỉ cho "Dùng"
     những lần báo cùng khung với lần mới nhất; lần của khung trước chỉ để xem lại. */
  const defs = (R.slot && R.slot.n > 1 && R.slot.defs) || [];
  const khungOf = (ts) => (defs.length ? slotIdxOf(ts, defs) : 0);
  const cungKhung = (i) => khungOf(subData[i].ts) === khungOf(lastSub.ts);
  const hdrs = subData.map((s, i) => {
    const cur = i === subData.length - 1;
    const khung = defs.length ? '<br><span style="font-weight:400;font-size:12px">' + esc(defs[khungOf(s.ts)].label.split(' (')[0]) + '</span>' : '';
    return `<th style="text-align:center;${cur ? 'color:var(--pri)' : ''};white-space:nowrap;font-size:14px">${esc(s.uname)}<br><span style="font-weight:400">${hhmm(s.ts)}${cur ? ' ✓' : ''}</span>${khung}</th>`;
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

// thay cho nút duyệt khi việc này do CVKTHT (hoặc cấp trên) báo mà người đang xem là CVKTHT
const choCapTren = (gi) => `<span class="sm b" style="color:var(--warn);line-height:1.4">${gi}: chờ ${CAP_TREN} duyệt.</span>`;

/* Sổ vay mượn chờ duyệt, bày ngay ở màn Duyệt: admin vẫn duyệt mọi thứ ở đây, bắt sang một màn
   khác chỉ để duyệt sổ vay là để nó nằm chờ mãi. Lần ghi có kèm phiếu kho thì server đã bỏ khỏi
   danh sách này, vì phiếu kho đi kèm nằm ở mục Phiếu chờ duyệt và duyệt phiếu là duyệt luôn sổ. */
function loanSec(R) {
  const L = (R.loans || []).filter((r) => duyetDuoc(r));
  if (!L.length) return '';
  const by = {}, order = [];
  L.forEach((r) => { const g = r.grp || 'id' + r.id; if (!by[g]) { by[g] = []; order.push(g); } by[g].push(r); });
  return `<div class="col gap8"><div class="row" style="justify-content:space-between;align-items:baseline"><span class="sec">Sổ vay mượn chờ duyệt</span><span class="sm muted">không tính vào tồn</span></div>
    ${order.map((g) => {
      const rows = by[g], r0 = rows[0], id = Math.min(...rows.map((r) => r.id));
      // chứng từ để người duyệt đối chiếu với tờ biên bản trong nhóm Zalo ngay tại đây, như thẻ ở màn Vay mượn
      const ct = [r0.so_bb ? 'BB ' + esc(r0.so_bb) : '', hanTxt(r0.han, false), r0.bien_so ? 'xe ' + esc(r0.bien_so) : '', r0.nguoi ? esc(r0.nguoi) : ''].filter(Boolean).join(' · ');
      return `<div class="card col gap6"><b>${r0.ngay ? ngayNgan(r0.ngay) + ' · ' : ''}${esc(loanTitle(r0.kind, r0.doitac_name || '#' + r0.doitac_id))}</b>
        <span>${esc(rows.map((r) => r.phi_id + ' ' + fmtQs(r.qty, r.phi_id)).join(' · '))}</span>
        ${ct ? `<span class="sm">${ct}</span>` : ''}
        <span class="sm muted">${esc(r0.uname)} · ${dmy(r0.ts)}${r0.note ? ' · ' + esc(r0.note) : ''}</span>
        ${R.closed ? '' : duyetDuoc(r0) ? `<div class="row gap6"><button class="btn s ok f1" data-a="lduyet" data-id="${id}">DUYỆT</button><button class="btn s bad f1" data-a="lvoid" data-id="${id}">TỪ CHỐI</button></div>` : choCapTren('Lần ghi do CVKTHT hoặc cấp trên ghi')}</div>`;
    }).join('')}</div>`;
}

/* Sổ sắt vụn chờ duyệt, bày ở màn Duyệt như sổ vay: duyệt ngay ở đây, khỏi phải nhớ sang màn khác. */
function svSec(R) {
  const L = (R.satvun || []).filter((r) => duyetDuoc(r));
  if (!L.length) return '';
  return `<div class="col gap8"><div class="row" style="justify-content:space-between;align-items:baseline"><span class="sec">Sắt vụn xuất chờ duyệt</span><span class="sm muted">không tính vào tồn</span></div>
    ${L.map((r) => `<div class="card col gap6"><b>${ngayNgan(r.ngay)} · ${svT(r.kg)} tấn → ${esc(r.noi)}</b>
      <span class="sm">${esc(svCt(r))}</span>
      <span class="sm muted">${esc(r.uname)} · ${dmy(r.ts)}${r.note ? ' · ' + esc(r.note) : ''}</span>
      ${R.closed ? '' : `<div class="row gap6"><button class="btn s ok f1" data-a="svduyet" data-id="${r.id}">DUYỆT</button><button class="btn s bad f1" data-a="svvoid" data-id="${r.id}">TỪ CHỐI</button></div>`}</div>`).join('')}</div>`;
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
  // khu mình duyệt được: đủ cấp cho CẢ số đếm lẫn phiếu chờ của khu (duyệt khu là duyệt cả hai)
  const khuDuoc = (k) => duyetCap(Math.max(k.capBao || 0, k.capPhieu || 0)) && (isCH() || !(k.nguoiBao || []).includes(S.me.id));
  const huyDuoc = (kid) => { const k = khus.find((x) => x.khu === kid); return !!k && duyetCap(k.capBao || 0); };
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
    const what = show.map((l) => `${l.phi} ${fmtQd(l.qty, b.phiBy[l.phi], dc || vay)}`).join(' · ');
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
    return `<div class="card ${dc ? 'bad' : 'warn'} col gap8"><div class="col" style="gap:2px"><b style="font-size:18px">${title}</b>
      <span style="font-size:16px">${esc(kemTan(what, kg))}</span>
      <span class="sm muted">${esc(v.uname)} · ${hhmm(v.ts)}${cuNgay}${v.note ? ' · ' + esc(v.note) : ''}</span>${canhBao}</div>
      ${R.closed ? '' : duyetCap(v.cap) ? `<div class="row gap6"><button class="btn s ok f1" data-a="pduyet" data-id="${v.id}">DUYỆT PHIẾU</button><button class="btn s bad f1" data-a="preject" data-id="${v.id}">TỪ CHỐI</button></div>` : choCapTren('Phiếu kho')}</div>`;
  };
  // phiếu kho chỉ cấp chỉ huy duyệt: người khác không có việc gì ở mục này (khu bị vướng phiếu đã tự nói)
  const phieuSec = !phieu.length || !isCH() ? '' : `<div class="col gap8">
    <div class="row" style="justify-content:space-between;align-items:baseline"><span class="sec">Phiếu chờ duyệt</span><span class="sm b" style="color:var(--warn)">${phieu.length} phiếu chưa vào tồn</span></div>
    <div class="sm muted" style="line-height:1.4">Phiếu chỉ tính vào tồn kể từ ngày được duyệt. Duyệt khu cũng duyệt luôn phiếu của khu đó.</div>
    ${phieu.map(phieuCard).join('')}</div>`;

  /* --- Việc cần xử lý riêng: xung đột hai người báo, và chờ đếm lại --- */
  const items = R.exceptions.filter((e) => e.type === 'conflict').map((e) => {
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
      <div class="row gap8"><button class="btn s warnb f1" data-a="cresolve" data-k="${esc(e.khu)}">LƯU LỰA CHỌN</button>${huyDuoc(e.khu) ? `<button class="btn s warnb f1" data-a="recount" data-k="${esc(e.khu)}">HUỶ BÁO CÁO</button>` : ''}</div>`;
    } else if (C && C.data) cmp = '<span class="sm">Không tìm thấy khác biệt trong lịch sử, có thể giữ số báo sau.</span>';
    return `<div class="card warn col gap8"><b style="font-size:18px">${esc(e.name)}: 2 người báo số khác nhau</b><span class="sm">Số đang chờ duyệt là của ${esc(r ? r.uname : '')} (báo sau). Dùng "Xem lần báo" ở thẻ khu để xem chi tiết từng người.</span>
      ${cmp || `<div class="row gap8"><button class="btn s warnb f1" data-a="cview" data-k="${esc(e.khu)}">SO SÁNH 2 SỐ</button><button class="btn s warnb f1" data-a="resolve" data-k="${esc(e.khu)}">DÙNG SỐ BÁO SAU</button></div>${huyDuoc(e.khu) ? `<button class="btn s warnb full" data-a="recount" data-k="${esc(e.khu)}">HUỶ BÁO CÁO, BẮT ĐẾM LẠI</button>` : ''}`}
      ${C && C.data && !C.data.diffs.length ? `<button class="btn s warnb full" data-a="resolve" data-k="${esc(e.khu)}">DÙNG SỐ BÁO SAU</button>` : ''}</div>`;
  }).join('');

  /* --- Cảnh báo cấp phi: dùng âm / dùng cao bất thường --- */
  const cards = badRows.map((r) => {
    // chỉ báo cáo ĐANG CHỜ DUYỆT mới huỷ được; số đã duyệt thì đã là tồn
    const canRe = r.topKhu && khus.some((k) => k.khu === r.topKhu && k.waiting) && huyDuoc(r.topKhu);
    const rp = b.phiBy[r.phi];
    const fmtEq = (v) => v === null ? '—' : fmtQe(v, rp);
    const perDayTxt = (x) => (isCuon(rp) ? fmtDec(x / rp.bo_size) + ' cuộn/ngày' : fmtInt(x) + ' cây/ngày');
    const avgDisp = r.avg === null ? '' : perDayTxt(r.avg);
    const peakDisp = r.peak ? perDayTxt(r.peak) : '';
    const topNetDisp = fmtQd(r.topNet, rp, true);
    return `<div class="card bad col gap8"><div class="row" style="justify-content:space-between"><b style="font-size:24px">${r.phi}</b><span class="badge bad">Bất thường</span></div>
      <div class="eq${r.dc && r.vay ? ' eq6' : r.dc || r.vay ? ' eq5' : ''}"><div><span>Tồn cũ</span><b>${fmtEq(r.old)}</b></div><div><span>+ Nhập</span><b>${fmtEq(nhapThatOf(r))}</b></div>${r.dc ? `<div><span>${r.dc > 0 ? '+' : '−'} Điều chỉnh</span><b>${fmtEq(Math.abs(r.dc))}</b></div>` : ''}${r.vay ? `<div><span>${r.vay > 0 ? '+' : '−'} Vay mượn</span><b>${fmtEq(Math.abs(r.vay))}</b></div>` : ''}<div><span>− Đếm mới</span><b>${fmtEq(r.cnt)}</b></div><div><span>= Đã dùng</span><b style="color:var(--bad)">${fmtEq(r.used)}</b></div></div>
      ${r.xuat ? `<span class="sm" style="line-height:1.4">Trong số đó: <b>${fmtEq(r.xuat)}</b> có phiếu xuất, <b>${fmtEq(r.used - r.xuat)}</b> không rõ đi đâu.</span>` : ''}
      <b style="font-size:16px">${r.neg
        ? 'Đã dùng âm (tồn nhiều hơn tính toán): có thể nhập sót phiếu hoặc đếm sai.'
        : `Dùng cao bất thường: hơn 3 lần mức trung bình${avgDisp ? ' (' + avgDisp + ')' : ''}${peakDisp ? ' và hơn 1,5 lần ngày dùng nhiều nhất (' + peakDisp + ')' : ''}.`}</b>
      ${r.topKhu ? `<span class="sm">Khu biến động lớn nhất: <b>${esc(kname(r.topKhu))}</b> (${topNetDisp})</span>` : ''}
      ${canRe ? `<button class="btn s bad full" data-a="recount" data-k="${esc(r.topKhu)}">HUỶ BÁO CÁO CỦA ${esc(cut(kname(r.topKhu), 14).toUpperCase())}</button>` : ''}</div>`;
  }).join('');

  /* Số việc CỦA NGƯỜI ĐANG XEM, đếm theo lần bấm như server (R.pending): khu mình duyệt được, phiếu kho
     (chỉ cấp chỉ huy), hai người báo khác số và phi bất thường (cấp duyệt nào cũng xử lý được), khu chưa
     báo / thiếu buổi (việc nhắc đếm của CVKTHT). Việc chỉ cấp trên làm được thì không tính vào đây. */
  const khuOf = (id) => khus.find((k) => k.khu === id);
  const viec = new Set(R.exceptions.filter((e) => {
    if (e.type === 'receipt_pending') return isCH();
    if (e.type === 'khu_pending' || e.type === 'recheck') return !!khuOf(e.khu) && khuDuoc(khuOf(e.khu));
    if (e.type === 'khu_missing' || e.type === 'slot_missing') return capMe() === 1;
    return true;
  }).map((e) => (e.type === 'receipt_pending' ? 'phieu|' + e.key : e.type === 'khu_pending' || e.type === 'recheck' ? 'khu|' + e.khu : e.type + '|' + (e.khu || e.phi))));
  const pend = viec.size;
  const tong = R.pending != null ? R.pending : R.exceptions.length;
  const allOk = pend === 0;
  const verdict = allOk && tong
    ? `<div class="card ok col" style="gap:4px"><b style="font-size:18px">Không còn việc của bạn</b><span style="font-size:16px;line-height:1.4">Còn ${tong} việc chờ ${CAP_TREN} xử lý. Sổ hôm nay tự chốt sau 0h.</span></div>`
    : allOk
    ? `<div class="card ok col" style="gap:4px"><b style="font-size:18px">Đã duyệt hết</b><span style="font-size:16px;line-height:1.4">Mọi khu đã báo đều đã duyệt và không còn phiếu nào chờ. Sổ hôm nay tự chốt sau 0h; khu nào báo lại số khác sẽ phải duyệt lại.</span></div>`
    : `<div class="card warn col" style="gap:4px"><b style="font-size:18px">Còn ${pend} việc cần xử lý</b><span class="sm" style="line-height:1.4">Duyệt từng khu${khus.filter((k) => (k.waiting || k.phieu.length || k.recheck) && khuDuoc(k)).length > 1 ? ', hoặc "Duyệt tất cả"' : ''}. Sổ hôm nay <b>tự chốt sau 0h</b> theo số đã duyệt: báo cáo chưa duyệt chuyển sang ngày mai chờ duyệt tiếp, việc còn treo được ghi vào nhật ký.</span></div>`;
  const gap = R.span > 1 && !R.closed ? `<div class="card warn col" style="gap:4px"><b>Có ${R.span - 1} ngày chưa tự chốt xong</b><span class="sm" style="line-height:1.4">Lượng dùng dưới đây gộp ${R.span} ngày kể từ ngày chốt ${esc(fmtDay(R.last))}. Cảnh báo "dùng nhiều" đã chia theo số ngày.</span></div>` : '';
  const first = !R.last ? `<div class="card col" style="gap:4px"><b>Ngày đầu tiên</b><span class="sm muted">Chưa có tồn chuẩn cũ. Sau 0h, số đã duyệt hôm nay tự trở thành tồn chuẩn đầu tiên.</span></div>` : '';

  /* --- Thẻ của từng khu: NỘI DUNG NHƯ NHAU dù lệch hay không --- */
  // khu "cần xem lại" cũng cần một lần bấm Duyệt khu, nên tính vào số khu đang chờ
  const nCho = khus.filter((k) => k.waiting || k.phieu.length || k.recheck).length;
  // trong đó, số khu NGƯỜI NÀY duyệt được: nút "Duyệt tất cả" chỉ nói về phần này
  const nDuoc = khus.filter((k) => (k.waiting || k.phieu.length || k.recheck) && khuDuoc(k)).length;
  const nDuyet = khus.filter((k) => k.rep && !k.waiting).length;
  const khuHead = nCho
    ? `<span class="sm b" style="color:var(--warn)">${nCho} khu chờ duyệt</span>`
    : nDuyet ? `<span class="sm b" style="color:var(--ok)">${nDuyet} khu đã duyệt</span>` : '<span class="sm muted">chưa có khu nào báo</span>';
  const duyetAll = nDuoc > 1 && !R.closed ? `<button class="btn s ok full" data-a="khuduyetall">DUYỆT TẤT CẢ ${nDuoc} KHU${nDuoc < nCho ? ' BẠN DUYỆT ĐƯỢC' : ''}</button>` : '';

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
      ? esc(k.rep.uname) + ' · ' + hhmm(k.rep.ts) + cuNgay
      : 'Chưa có ai báo kể từ lần chốt trước';
    const hk = huyOf(k.khu);
    const duyetLine = (k.duyet ? `<span class="sm" style="color:var(--ok)">Đã duyệt · ${esc(k.duyet.by || '')} · ${hhmm(k.duyet.ts)}</span>` : '')
      + (hk ? `<span class="sm" style="color:var(--bad);line-height:1.4"><b>Đã huỷ báo cáo của ${esc(hk.uname || '')}</b> lúc ${hhmm(hk.ts)} · ${esc(hk.ly_do)} · chờ khu báo lại</span>` : '');

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
        <b class="sm" style="color:${x.d ? col : 'var(--ink)'};white-space:nowrap;${x.big ? 'font-size:16px' : ''}">${dTxt}</b></div>`;
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
      return esc(ls.map((l) => l.phi + ' ' + fmtQd(l.qty, b.phiBy[l.phi], true)).join(', '));
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
    const slotLate = sl && sl.late.length ? `<div class="sm" style="color:var(--warn)">Gửi muộn: đếm ${sl.late.map((x) => hhmm(x.at) + ', tới ' + hhmm(x.ts)).join('; ')}</div>` : '';
    const recheck = k.recheck ? `<div class="sm b" style="color:var(--warn);line-height:1.4">Có phiếu duyệt SAU khi số của khu đã duyệt, nên tồn của khu đang cộng thêm thép đó. Nếu số khu báo ĐÃ gồm thép đó, bấm Duyệt lại để tồn lấy theo báo cáo.</div>` : '';

    /* Theo cấp bậc: CVKTHT không duyệt khu có số của CVKTHT trở lên, hoặc còn phiếu kho chờ. Không bày nút mà nói
       rõ đang chờ ai, và vì cái gì (số đếm hay phiếu) — không thì người xem tưởng app hỏng. */
    const duoc = khuDuoc(k), canViec = cho || choP || k.recheck;
    const vuong = !canViec || duoc ? '' : choCapTren(!duyetCap(k.capBao || 0) ? 'Số của khu do CVKTHT hoặc cấp trên báo' : (k.nguoiBao || []).includes(S.me.id) ? 'Số của khu do chính bạn báo' : choP ? 'Khu còn phiếu kho chờ duyệt' : 'Số của khu đếm TRƯỚC lúc có phiếu kho mới duyệt hoặc huỷ (khu đếm lại thì CVKTHT duyệt được)');
    const btns = R.closed ? '' : `${vuong}<div class="row gap6">${!duoc ? '' : cho || choP
      ? `<button class="btn s ok f1" data-a="khuduyet" data-k="${esc(k.khu)}">DUYỆT ${esc(cut(k.name, 14).toUpperCase())}</button>`
      : k.recheck ? `<button class="btn s ok f1" data-a="khuduyet" data-k="${esc(k.khu)}">DUYỆT LẠI</button>` : ''}
      ${cho && duyetCap(k.capBao || 0) ? `<button class="btn s bad f1" data-a="recount" data-k="${esc(k.khu)}">Huỷ báo cáo</button>` : ''}</div>`;

    return `<div class="card col gap6" style="${edge}"><div class="row" style="justify-content:space-between;gap:8px;flex-wrap:wrap">
      <div class="col" style="gap:2px"><div class="row gap6" style="align-items:center"><b style="font-size:16px">${esc(k.name)}</b>${badge}</div><span class="sm muted">${who}</span>${duyetLine}</div>
      ${k.rep ? `<button class="btn s" data-a="svload" data-k="${esc(k.khu)}">${subOpen ? 'Ẩn' : 'Xem lần báo'}</button>` : ''}
    </div>${slotLine}${k.rep ? bang : '<span class="sm">Hãy nhắc người phụ trách, hoặc tự báo cáo khu này ở tab Báo cáo.</span>'}${slotLate}${blankWarn}${recheck}${choPhieu}${btns}${renderSubsPanel(k.khu, R)}</div>`;
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
    ${R.closed && b.closedReset && isAdmin() ? `<div class="card col gap6"><b>Đặt lại nhầm?</b><input class="inp s" id="reopenNote" placeholder="Lý do hoàn tác (bắt buộc)" data-model="reopenNote" value="${esc(S.form.reopenNote || '')}"><button class="btn s bad full" data-a="reopen">HOÀN TÁC ĐẶT LẠI SỐ LIỆU</button></div>` : ''}
    ${R.slot && R.slot.changed ? `<div class="card warn col" style="gap:4px"><b>Khung giờ đếm vừa đổi hôm nay lúc ${hhmm(R.slot.changed.at)}${R.slot.changed.by ? ' (' + esc(R.slot.changed.by) + ')' : ''}</b><span class="sm" style="line-height:1.4">Các lần đếm hôm nay đã được xếp lại theo khung mới, nên việc "thiếu lần đếm" có thể khác lúc trước khi đổi.</span></div>` : ''}
    ${gap}${first}${gcXuatSec()}${phieuSec}${loanSec(R)}${svSec(R)}${items}${cards}
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
  const recs = groups.map((g) => `<div class="li" style="${g.voided ? 'opacity:.55;text-decoration:line-through' : ''}"><span><b>${g.title}</b>${g.voided ? ' (đã huỷ)' : ''}<br>${esc(kemTan(g.what, g.kg))}<br><span class="sm muted">${esc(g.r0.uname)} · ${hhmm(g.r0.ts)}${g.r0.note ? ' · ' + esc(g.r0.note) : ''}</span></span></div>`).join('');
  const status = closed
    ? `<div class="card ok col" style="gap:4px"><b>Đã chốt${D.close.uname ? ' bởi ' + esc(D.close.uname) : ' tự động'} lúc ${dmy(D.close.ts)}</b>${D.close.span > 1 ? `<span class="sm">Gộp ${D.close.span} ngày (các ngày trước đó chưa chốt)</span>` : ''}${D.close.note ? `<span class="sm">Ghi chú: ${esc(D.close.note)}</span>` : ''}${treoTxt(D.close.exc_json)}</div>`
    : `<div class="card warn col" style="gap:4px"><b>Ngày này chưa chốt</b><span class="sm">Số tồn lấy theo báo cáo đếm trong ngày; khu không báo tạm lấy tồn chuẩn trước đó.</span></div>`;
  const dn = donTxt(D.don);
  return `${top}<div class="f1 scroll pad col gap12" id="body">
    ${status}
    ${dn ? `<div class="card warn sm" style="line-height:1.45"><b>Ngày bị dồn số.</b> ${esc(dn)}. Lượng dùng của ngày này không phải số của riêng một ngày; cộng với ngày ${[D.don.tu.length ? 'trước' : '', D.don.sang.length ? 'sau' : ''].filter(Boolean).join(' và ')} thì mới đúng.</div>` : ''}
    <div class="hero" style="border-radius:14px;padding:14px 16px"><div class="row" style="justify-content:space-between"><div class="col"><span style="font-size:16px">Tồn cuối ngày ${esc(fmtDay(D.day))}</span><span style="font-size:32px;font-weight:700">${fmtT(totKg)} tấn</span></div>${closed ? `<div class="col" style="align-items:flex-end;font-size:16px"><span>Nhập ${fmtT(totIn)} tấn</span>${totDc ? `<span>Điều chỉnh ${totDc > 0 ? '+' : '−'}${fmtT(Math.abs(totDc))} tấn</span>` : ''}${totVay ? `<span>Vay mượn ${totVay > 0 ? '+' : '−'}${fmtT(Math.abs(totVay))} tấn</span>` : ''}<span>Dùng ${fmtT(totUse)} tấn</span>${totX ? `<span class="sm">trong đó ${fmtT(totX)} tấn có phiếu xuất</span>` : ''}</div>` : ''}</div></div>
    <h2 class="sec">Theo đường kính (chạm để xem từng khu)</h2>
    <div class="card" style="padding:0;overflow:hidden">${rows}</div>
    <h2 class="sec">Người báo</h2><div class="sm">${reps || '<span class="muted">Không có báo cáo đếm</span>'}</div>
    <h2 class="sec">Phiếu nhập / chuyển / xuất / điều chỉnh / vay mượn</h2>${recs ? `<div class="card" style="padding:0;overflow:hidden">${recs}</div>` : '<div class="muted">Không có phiếu</div>'}
  </div>`;
}
/* Ngày bị DỒN SỐ (server gửi don = { sang, tu }, xem donNgay ở src/reports.js): báo cáo chưa duyệt lúc
   0h chuyển sang ngày sau, nên ngày trước khu đó trông như không dùng thép, ngày sau dùng gấp đôi.
   Tổng nhiều ngày vẫn đúng; câu này để không ai so từng ngày mà kết luận sai. */
function donTxt(d) {
  if (!d) return '';
  const ten = (ids) => ids.map(kName).join(', ');
  return [
    (d.sang || []).length ? ten(d.sang) + ' chưa duyệt lúc 0h, số dồn sang ngày sau' : '',
    (d.tu || []).length ? ten(d.tu) + ' nhận số dồn từ hôm trước' : '',
  ].filter(Boolean).join('; ');
}
// dòng đánh dấu dưới một ngày trong danh sách "Theo ngày" (báo cáo kỳ, Thống kê); ngày không dồn thì rỗng
const donDong = (d) => { const t = donTxt(d); return t ? `<span class="sm" style="width:100%;color:var(--warn);line-height:1.35">Dồn số: ${esc(t)}</span>` : ''; };
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
  const days = D.days.slice().reverse().map((d) => `<div class="li" style="flex-wrap:wrap"><span>${fmtDay(d.day)}${d.span > 1 ? ` <span class="sm muted">(gộp ${d.span} ngày)</span>` : ''}</span><span class="sm">nhập ${fmtT(d.nhap_kg)} · dùng ${fmtT(d.dung_kg)} · tồn <b>${fmtT(d.ton_kg)}</b> tấn</span>${donDong((D.don || {})[d.day])}</div>`).join('');
  return `${top}<div class="f1 scroll pad col gap12" id="body">
    ${D.closedDays || D.openDay ? '' : '<div class="card warn">Không có ngày nào được chốt trong khoảng này.</div>'}
    ${D.openDay ? '' : '<div class="sm muted">Chưa có ngày chốt nào nên chưa có số tồn đầu kỳ.</div>'}
    ${D.openStock ? `<div class="card sm" style="line-height:1.4">Kỳ này gồm cả lần chốt đầu tiên (${esc(fmtDay(D.openDay))}) : đó là lần kiểm kê mở sổ, lấy làm tồn đầu kỳ. Nhập/dùng trước đó không tính.</div>` : ''}
    ${(D.resetDays || []).length ? `<div class="card warn sm" style="line-height:1.4">Kỳ này có ngày <b>đặt tồn về 0</b> (${D.resetDays.map((d) => esc(fmtDay(d))).join(', ')}). Ngày đó không tính lượng dùng; ${hasKk ? 'phần tồn bị đặt về 0 nằm ở cột <b>Đặt về 0</b>, nên Tồn đầu + Nhập − Dùng vẫn khớp Tồn cuối.' : 'lúc đặt lại bãi không còn thép nên không có gì bị đặt về 0.'}</div>` : ''}
    <div class="card" style="padding:0;overflow-x:auto"><table class="tbl"><thead><tr><th>ɸ</th><th>Tồn đầu</th><th>Nhập</th>${hasDc ? '<th>Điều chỉnh</th>' : ''}${hasVay ? '<th>Vay mượn</th>' : ''}${hasKk ? '<th>Đặt về 0</th>' : ''}<th>Dùng</th>${hasXuat ? '<th>Có phiếu</th>' : ''}<th>Tồn cuối</th></tr></thead><tbody>${rows}</tbody>
      <tfoot><tr><th>Tấn</th><td>${fmtT(t.dau)}${miss.dau ? '*' : ''}</td><td>${fmtT(t.nhap)}</td>${hasDc ? `<td>${fmtT(t.dc)}</td>` : ''}${hasVay ? `<td>${fmtT(t.vay)}</td>` : ''}${hasKk ? `<td>${fmtT(t.kk)}</td>` : ''}<td>${fmtT(t.dung)}</td>${hasXuat ? `<td>${fmtT(t.xuat)}</td>` : ''}<td><b>${fmtT(t.cuoi)}${miss.cuoi ? '*' : ''}</b></td></tr></tfoot></table></div>
    ${miss.dau || miss.cuoi ? `<div class="card warn sm" style="line-height:1.4">* Tổng tấn chưa gồm ${[miss.dau ? miss.dau + ' phi không có tồn đầu kỳ' : '', miss.cuoi ? miss.cuoi + ' phi không có tồn cuối kỳ' : ''].filter(Boolean).join(' và ')} (ô ghi "—"). Những phi đó chưa có lần chốt nào trong khoảng này.</div>` : ''}
    <div class="sm muted">Đơn vị: cây (D10–D36) hoặc cuộn (D6, D8), dòng cuối: tấn. ${D.openDay ? (D.openStock ? 'Tồn đầu lấy lần kiểm kê mở sổ ' : 'Tồn đầu lấy ngày chốt ') + fmtDay(D.openDay) + '. ' : ''}${D.closeDay ? 'Tồn cuối lấy ngày chốt ' + fmtDay(D.closeDay) + '. ' : ''}Chuyển khu không tính vào nhập.${hasDc ? ' Điều chỉnh: sửa sổ, không tính vào Nhập hay Dùng.' : ''}${hasXuat ? ' Có phiếu: phần lượng dùng đã có phiếu xuất, nằm TRONG cột Dùng.' : ''}${hasVay ? ' Vay mượn: cho mượn (−) hoặc vay về (+), không tính vào Nhập hay Dùng.' : ''} Số tấn tính theo kg/cây lúc chốt từng ngày.</div>
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
   phiếu giảm hiện ra "huỷ phiếu điều chỉnh tồn đã duyệt: " rồi hết — dòng nhật ký không nói được
   nó vừa hoàn tác cái gì, mà nhật ký thì không sửa lại được. */
const dcLines = (d) => (d.kind === 'dc' || d.kind === 'xuat' ? d : { ...d, lines: (d.lines || []).filter((l) => l.qty > 0) });
// "Vay của Cty A: D16 180 cây"; dòng nhật ký cũ (trước khi ghi kèm đối tác) chỉ còn loại ghi
const loanAuditTxt = (d) => (d.doitac ? loanTitle(d.kind, d.doitac) : ((LOAN_KIND[d.kind] || {}).ten || d.kind))
  + (d.lines && d.lines.length ? ': ' + lineTxt(d) : '') + (d.ly_do ? ' · lý do: ' + d.ly_do : '');
const gcAuditTxt = (d) => (d.cau_kien || '') + (d.truc ? ' (trục ' + d.truc + ')' : '');
const svAuditTxt = (d) => (d.ngay ? fmtDay(d.ngay) + ' · ' : '') + svT(d.kg || 0) + ' tấn cho ' + (d.noi || '?') + (d.so_phieu ? ' (phiếu ' + d.so_phieu + ')' : '') + (d.ly_do ? ' · lý do: ' + d.ly_do : '');
function fmtAudit(a) {
  let d = {};
  try { d = a.detail ? JSON.parse(a.detail) : {}; } catch (e) { d = {}; }
  const kn = (id) => (S.boot.khuBy[id] ? S.boot.khuBy[id].name : id);
  const M = {
    login: ['đăng nhập', 'login'], login_fail: ['nhập sai PIN (lần ' + d.n + ')', 'flag'], login_locked: ['bị khoá ' + (d.mins >= 60 ? d.mins / 60 + ' giờ' : (d.mins || 15) + ' phút') + ' do nhập sai PIN nhiều lần', 'flag'],
    change_pin: ['đổi PIN', 'login'], recover_pin: ['đặt lại PIN qua trang khôi phục', 'flag'], setup: ['thiết lập hệ thống', 'admin'],
    receipt: ['nhập kho vào ' + kn(d.khu) + ': ' + lineTxt(d) + (d.note ? ' (' + d.note + ')' : ''), 'nhap'],
    transfer: ['chuyển ' + kn(d.from) + ' → ' + kn(d.to) + ': ' + lineTxt(d) + (d.note ? ' (' + d.note + ')' : ''), 'nhap'],
    adjust: ['điều chỉnh tồn ' + kn(d.khu) + ' ' + (d.dir === 'giam' ? 'GIẢM' : 'TĂNG') + ': ' + lineTxt(d)
      + (d.note ? ' — ' + d.note : ''), 'dc'],
    issue: ['xuất từ ' + kn(d.khu) + ' cho ' + (d.noi || '?') + ': ' + lineTxt(d) + (d.ghi ? ' — ' + d.ghi : ''), 'nhap'],
    receipt_void: ['huỷ phiếu ' + phieuWord(d) + ' đã duyệt: ' + lineTxt(dcLines(d)), 'nhap'],
    // từ chối khác huỷ: phiếu chưa duyệt nên chưa từng vào tồn, không có gì phải lùi
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
    reopen_day: ['mở lại ngày ' + fmtDay(d.day) + ' (' + d.note + ')', 'flag'], recount: ['yêu cầu ' + kn(d.khu) + ' đếm lại', 'admin'], report_cancel: ['huỷ báo cáo ' + kn(d.khu) + (d.nguoi_bao ? ' của ' + d.nguoi_bao : '') + ' · lý do: ' + (d.ly_do || ''), 'flag'], recount_after_close: ['mở lại ngày, yêu cầu ' + kn(d.khu) + ' đếm lại', 'flag'], conflict_resolve: [(d.changes && d.changes.length ? 'chọn số cho ' + kn(d.khu) + ': ' + d.changes.map((c) => c.phi + ' ' + c.from + ' → ' + c.to).join('; ') : 'chọn số báo sau cho ' + kn(d.khu)), 'admin'],
    user_create: ['tạo tài khoản ' + d.name, 'admin'], user_reset_pin: ['đặt lại PIN cho ' + d.name, 'admin'], user_lock: ['khoá ' + d.name, 'admin'], user_unlock: ['mở khoá ' + d.name, 'admin'],
    user_role: ['đổi vai trò ' + d.name + ' thành ' + roleTen(d.role), 'admin'],
    user_chuc_danh: [d.chuc_danh ? 'gắn chức danh ' + roleTen(d.chuc_danh) + ' cho admin ' + d.name : 'bỏ chức danh của admin ' + d.name, 'admin'], user_logout: ['đăng xuất mọi máy của ' + d.name, 'admin'],
    /* Dòng này là cái NỐI hai tên lại: nhật ký lưu sẵn tên vào từng dòng và database từ chối sửa,
       nên các dòng trước khi đổi tên vẫn mang tên cũ. Có dòng này thì vẫn tra ra được là ai. */
    user_rename: ['đổi tên "' + d.from + '" thành "' + d.to + '"', 'admin'],
    user_delete: ['xoá tài khoản ' + d.name + ' (' + roleTen(d.role) + ')' + (d.phone ? ' · ' + d.phone : '') + ' — hoạt động cũ vẫn giữ tên', 'flag'],
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
    // sổ sắt vụn: chung chip lọc Vay mượn
    sv_ghi: ['ghi xuất sắt vụn: ' + svAuditTxt(d), 'vay'],
    sv_duyet: ['duyệt xuất sắt vụn: ' + svAuditTxt(d), 'vay'],
    sv_reject: ['bỏ lần xuất sắt vụn chưa duyệt: ' + svAuditTxt(d), 'vay'],
    sv_void: ['huỷ lần xuất sắt vụn đã duyệt: ' + svAuditTxt(d), 'flag'],
    // gia công cấu kiện: chỉ các mốc của đơn; từng lần cập nhật tiến độ nằm ở lịch sử của chính đơn đó
    gc_giao: ['giao đơn gia công ' + gcAuditTxt(d) + ' cho ' + (d.cho || '?') + ', hạn ' + fmtDay(d.han), 'gc'],
    gc_sua: ['sửa đơn gia công ' + (d.cau_kien || '') + ': ' + [].concat(d.doi || []).join(' · '), 'gc'],
    gc_xong: ['xác nhận ĐÃ XONG đơn gia công ' + gcAuditTxt(d), 'gc'],
    gc_huy: ['huỷ đơn gia công ' + gcAuditTxt(d) + ' của ' + (d.cua || '?') + ' · lý do: ' + (d.ly_do || ''), 'flag'],
    gc_khoiphuc: ['khôi phục đơn gia công đã huỷ ' + gcAuditTxt(d) + ' của ' + (d.cua || '?') + ' · lý do: ' + (d.ly_do || ''), 'flag'],
    gc_xuat: ['gửi xuất đơn gia công ' + gcAuditTxt(d) + ' cho ' + (d.xuat_cho || '?') + ' (đã ký giao nhận, kiểm đếm, gửi ảnh)', 'gc'],
    gc_duyetxuat: ['DUYỆT XUẤT đơn gia công ' + gcAuditTxt(d) + ' của ' + (d.cua || '?'), 'gc'],
    gc_tuchoixuat: ['không duyệt xuất đơn gia công ' + gcAuditTxt(d) + ' · lý do: ' + (d.ly_do || ''), 'flag'],
    gc_molai: ['mở lại đơn gia công đã xong ' + gcAuditTxt(d) + ' của ' + (d.cua || '?') + ' · lý do: ' + (d.ly_do || ''), 'flag'],
    // quân số đầu ca: mỗi lần tổ báo (hoặc cấp trên ghi thay) là một dòng, vì báo lại là ghi đè số cũ
    qs_bao: [(d.thay ? 'ghi thay quân số tổ ' : 'báo quân số tổ ') + (d.to || '?') + ', ' + CA_TEN[d.ca] + ' ' + fmtDay(d.ngay) + ': đi làm ' + d.lam + '/' + d.tong
      + (d.ca_kia ? ', ' + CA_TEN[d.ca === 1 ? 2 : 1] + ' ' + d.ca_kia : '')
      + (qsSoNghi(d.nghi) ? ', nghỉ ' + qsSoNghi(d.nghi) + ' (' + QS_LY_DO.filter((l) => (d.nghi || {})[l[0]]).map((l) => d.nghi[l[0]] + ' ' + l[1]).join(', ') + ')' : '')
      + (d.ghi_chu ? ' — ' + d.ghi_chu : ''), 'qs'],
    bc_luu: ['chép báo cáo ' + CA_TEN[d.ca] + ' ' + fmtDay(d.ngay) + ' gửi cấp trên' + (d.kt_mau ? ' (đặt lại mẫu kiểm tra)' : ''), 'qs'],
    qs_lich: ['đặt ca cho tổ ' + (d.to || '?') + ': ' + (CA_LICH[d.ca] || '').toLowerCase() + (d.den ? ', đến ' + fmtDay(d.den) : ', đến khi đổi'), 'qs'],
    qs_nguong: ['đặt ngưỡng tô đỏ thống kê quân số: nghỉ từ ' + d.pct + '%', 'qs'],
    qs_thietlap: ['đặt số thiết lập tổ ' + (d.to || '?') + ': tổng ' + d.tong + ', ca ngày ' + d.s1 + ', ca đêm ' + d.s2
      + [1, 2].map((c) => (qsSoNghi(d['n' + c]) ? `, nghỉ ${CA_TEN[c]} ${qsSoNghi(d['n' + c])} (${qsLyDoTxt(d['n' + c], QS_LY_DO)})` : '')).join(''), 'qs'],
    qs_thutu: ['xếp lại thứ tự ' + (d.n || 0) + ' tổ', 'qs'],
    qs_han: ['đổi hạn báo quân số: ca ngày trước ' + phutGio(d.ca1 || 0) + ', ca đêm trước ' + phutGio(d.ca2 || 0), 'qs'],
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
  // "Cần chú ý" đứng ngay sau "Tất cả": hàng nút lọc cuộn ngang, nút hay dùng nhất không được nằm khuất bên phải
  const F = [['all', 'Tất cả'], ['flag', 'Cần chú ý'], ['dem', 'Báo đếm'], ['nhap', 'Nhập kho'], ['dc', 'Điều chỉnh'], ['vay', 'Vay mượn'], ['gc', 'Gia công'], ['qs', 'Quân số'], ['admin', 'Admin']];
  const rows = (S.audit || []).map((a) => ({ a, f: fmtAudit(a) })).filter((x) => S.logFilter === 'all' || (S.logFilter === 'flag' ? x.f.flag : x.f.type === S.logFilter));
  const AF = S.auditF;
  const loc = AF.ngay || AF.q ? `<span class="sm muted">Đang lọc${AF.ngay ? ' ngày ' + esc(fmtDay(AF.ngay)) : ''}${AF.q ? ' chữ "' + esc(AF.q) + '"' : ''} · <button class="sm" style="border:0;background:transparent;color:var(--pri);text-decoration:underline;padding:0" data-a="logclear">bỏ lọc</button></span>` : '';
  const them = S.audit && S.auditMore ? `<button class="btn s full" data-a="logmore">Tải thêm dòng cũ hơn</button>` : '';
  /* Hai mục trong MỘT màn: dòng nhật ký, và thống kê báo cáo (ai báo, ai không báo). Cả hai trả
     lời cùng một câu hỏi "ai đã làm gì", nên không tách thành hai lối vào ở màn Thêm nữa. */
  const tk = S.logTab === 'tk';
  const muc = `<div class="row gap6">${[['log', 'Nhật ký'], ['tk', 'Thống kê báo cáo']].map((m) => `<button class="chip s f1 ${(tk ? 'tk' : 'log') === m[0] ? 'on' : ''}" data-a="logtab" data-v="${m[0]}">${m[1]}</button>`).join('')}</div>`;
  if (tk) {
    return `${head('Nhật ký hoạt động', 'Ai báo, ai không báo · các ngày đã chốt', 'more')}
  <div class="col gap6 tbar" style="padding:6px 16px">${muc}
    <div class="row gap6">${[7, 30, 90].map((n) => `<button class="chip s f1 ${S.cc.days === n ? 'on' : ''}" data-a="ccdays" data-v="${n}">${n} ngày</button>`).join('')}</div></div>
  <div class="f1 scroll pad col gap12" id="body">${chamCongBody()}</div>`;
  }
  return `${head('Nhật ký hoạt động', 'Không ai xoá hoặc sửa được', 'more')}
  <div class="col gap6 tbar" style="padding:6px 16px">${muc}
    <div class="row gap6"><input class="inp s" style="flex:0 0 150px" type="date" id="logday" max="${S.boot.today}" value="${esc(AF.ngay)}" data-change="logday">
      <input class="inp s f1" id="logq" style="min-width:0" placeholder="Tìm: tên, khu, phi, đối tác…" data-model="logq" data-enter="logfind" value="${esc(fv('logq', AF.q))}"><button class="btn s" data-a="logfind">Tìm</button></div>
    ${loc}
    <div class="row gap6" style="overflow-x:auto" data-sx="logf">${F.map((f) => `<button class="chip s ${S.logFilter === f[0] ? 'on' : ''}" style="flex:none;white-space:nowrap"${S.logFilter === f[0] ? ' data-cur="1"' : ''} data-a="logf" data-v="${f[0]}">${f[1]}</button>`).join('')}</div></div>
  <div class="f1 scroll ${S.audit ? 'pad ' : ''}col gap8" id="body">${S.audit ? (rows.map((x) => `<div class="logrow ${x.f.flag ? 'flag' : ''}"><div class="row" style="justify-content:space-between"><b>${esc(x.a.user_name || 'Hệ thống')}</b><span class="sm muted">${dmy(x.a.ts)}</span></div><div style="font-size:16px;line-height:1.4">${esc(x.f.text)}</div>${x.f.flag ? '<span class="badge bad" style="align-self:flex-start">Cần chú ý</span>' : ''}</div>`).join('') || '<div class="muted">Không có dòng nào</div>') + them : panelWait('nhatky')}</div>`;
}

// duyệt/huỷ sổ vay gọi từ màn nào thì nạp lại đúng màn đó (Duyệt, Vay mượn, hay chi tiết đối tác)
async function reloadLoanScreen() {
  const man = async () => {
    if (S.screen === 'duyet') await reloadReview();
    else if (S.screen === 'vaychitiet') S.loanDetail = await api('GET', '/loans?doitac=' + S.loanDt);
    else S.loans = await api('GET', '/loans');
  };
  await Promise.all([man(), loadBoot()]);
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
/* Thân mục "Thống kê báo cáo" của màn Nhật ký. MỘT kiểu dòng cho cả người lẫn khu: tên + một dòng
   phụ ở trái, nhãn Đủ / Thiếu N ở phải; dòng có buổi thiếu thì chạm để mở ra từng ngày. Trước đây mỗi
   người, mỗi khu là một thẻ riêng viền đỏ với nút chữ gạch chân — mười người là mười thẻ. */
function chamCongBody() {
  const C = S.cc, D = C.data;
  if (!D) return panelWait('chamcong');
  const dm = (d) => fmtDay(d).slice(0, 5);
  const kn = (id) => (S.boot.khuBy[id] ? S.boot.khuBy[id].name : id);
  if (!D.ngay) {
    return `<div class="card col gap6"><b>Chưa có ngày nào đã chốt trong khoảng này</b><span class="sm muted" style="line-height:1.4">Từ ${esc(fmtDay(D.from))} tới ${esc(fmtDay(D.to))}. Mỗi đêm sau 0h, lúc sổ tự chốt, app ghi lại ai phụ trách khu nào và ai đã báo buổi nào. Số liệu bắt đầu có từ ngày chốt đầu tiên.</span></div>`;
  }
  // một dòng: có buổi thiếu thì là nút mở/đóng, không thì chỉ là dòng đọc
  const dong = (key, ten, phu, nhan, lop, chiTiet) => {
    const mo = !!C.mo[key];
    const trong = `<span class="col" style="gap:2px;min-width:0;flex:1;text-align:left"><b>${ten}</b><span class="sm muted" style="line-height:1.35">${phu}</span></span>
      <span class="badge ${lop}">${nhan}</span>${chiTiet ? `<span class="muted" aria-hidden="true" style="width:14px;text-align:center">${mo ? '▾' : '▸'}</span>` : '<span style="width:14px"></span>'}`;
    return (chiTiet
      ? `<button class="li" style="width:100%;border:0;border-bottom:1px solid #E4E0D6;background:#fff;font:inherit;color:inherit" data-a="ccmo" data-k="${key}" aria-expanded="${mo}">${trong}</button>`
      : `<div class="li">${trong}</div>`) + (mo ? chiTiet : '');
  };
  const con = (trai, phai) => `<div class="li sm" style="background:#F7F5F0;padding-left:26px;align-items:flex-start"><span style="white-space:nowrap">${trai}</span><span style="text-align:right;line-height:1.35">${phai}</span></div>`;
  const nguoi = D.nguoi.map((n) => {
    const phu = n.phai
      ? `Tự báo ${n.tu}/${n.phai} buổi${n.thay ? ' · người khác báo thay ' + n.thay : ''} · gửi ${n.lan} lần`
      : `Gửi ${n.lan} lần trong ${n.ngay} ngày`;
    const ct = n.thieu.map((t) => con(esc(dm(t.day)) + ' · ' + esc(kn(t.khu)), 'thiếu ' + esc(t.buoi.join(', ')) + (t.cung.length ? '<br><span class="muted">cùng phụ trách: ' + esc(t.cung.join(', ')) + '</span>' : ''))).join('');
    return dong('u' + n.id, esc(n.name), phu, !n.phai ? 'Không phụ trách' : n.soThieu ? 'Thiếu ' + n.soThieu + ' buổi' : 'Đủ', !n.phai ? 'idle' : n.soThieu ? 'bad' : 'ok', ct);
  }).join('');
  const dsKhu = D.khu.filter((k) => k.phai);
  const khu = dsKhu.map((k) => {
    const phu = `Phải báo ${k.phai} buổi` + (k.khongPt ? ` · <b style="color:var(--warn)">${k.khongPt} ngày không người phụ trách</b>` : '');
    const ct = k.thieu.map((t) => con(esc(dm(t.day)), 'thiếu ' + esc(t.buoi.join(', ')) + '<br><span class="muted">' + (t.pt.length ? 'phụ trách: ' + esc(t.pt.join(', ')) : 'không ai phụ trách') + '</span>')).join('');
    return dong('k' + k.khu, esc(k.name), phu, k.soThieu ? 'Thiếu ' + k.soThieu + ' buổi' : 'Đủ', k.soThieu ? 'bad' : 'ok', ct);
  }).join('');
  const coPt = D.nguoi.filter((n) => n.phai), nThieu = coPt.filter((n) => n.soThieu).length, kThieu = dsKhu.filter((k) => k.soThieu).length;
  const bang = (h) => `<div class="card" style="padding:0;overflow:hidden">${h}</div>`;
  return `<div class="card sm" style="line-height:1.45"><b>${esc(dm(D.from))} – ${esc(dm(D.to))} · ${D.ngay} ngày đã chốt</b><br>
      Người: <b style="color:${nThieu ? 'var(--bad)' : 'var(--ok)'}">${nThieu ? nThieu + '/' + coPt.length + ' người thiếu buổi' : 'đủ cả ' + coPt.length + ' người'}</b> · Khu: <b style="color:${kThieu ? 'var(--bad)' : 'var(--ok)'}">${kThieu ? kThieu + '/' + dsKhu.length + ' khu thiếu buổi' : 'đủ cả ' + dsKhu.length + ' khu'}</b>
      <br><span class="muted">Hôm nay chưa tính: sổ tự chốt sau 0h.</span></div>
    <h2 class="sec">Theo người</h2>${nguoi ? bang(nguoi) : '<span class="muted">Không có ai phụ trách hay báo cáo trong khoảng này.</span>'}
    <h2 class="sec">Theo khu</h2>${khu ? bang(khu) : '<span class="muted">Không khu nào phải báo trong khoảng này.</span>'}`;
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
      <h2 class="sec">Theo ngày</h2><div class="card" style="padding:0;overflow:hidden">${S.usage.map((d) => `<div class="li" style="flex-wrap:wrap"><span>${d.day.split('-').reverse().join('/')}</span>${d.moSo
        ? '<span class="sm muted">mở sổ · chưa tính dùng</span>' : `<b>${fmtT(d.tan)} tấn</b>`}${donDong(d.don)}</div>`).join('')}</div>
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
  // các mục chia nhóm có tên: danh sách phẳng hơn chục mục thì phải đọc từng dòng mới tìm ra chỗ cần vào
  const nhom = (ten) => `<div class="sm b muted" style="padding:8px 4px 0;text-transform:uppercase;letter-spacing:.04em">${ten}</div>`;
  return `${head('Thêm', esc(S.me.name) + ' · ' + esc(nguoiTen(S.me)))}
  <div class="f1 scroll pad col gap8" id="body">
    ${nhom('Hằng ngày')}
    ${isQL() ? '<button class="menu" data-a="nav" data-s="baocaoca">Báo cáo ca và quân số các tổ</button>' : ''}
    <button class="menu" data-a="nav" data-s="qstk">Thống kê quân số${isQL() ? ' các tổ' : ' của tổ'}</button>
    ${nhom('Sổ theo dõi')}
    <button class="menu" data-a="nav" data-s="vaymuon">Vay mượn ngoài bãi${S.boot.loanPending ? ` (${S.boot.loanPending} chờ duyệt)` : ''}</button>
    <button class="menu" data-a="nav" data-s="satvun">Sắt vụn xuất ra ngoài${S.boot.svPending ? ` (${S.boot.svPending} chờ duyệt)` : ''}</button>
    ${isQL() ? '<button class="menu" data-a="nav" data-s="nhatky">Nhật ký hoạt động</button>' : ''}
    ${nhom('Thống kê và báo cáo')}
    <button class="menu" data-a="nav" data-s="stats">Thống kê theo khu / toàn bãi</button>
    <button class="menu" data-a="nav" data-s="ton">Tồn bãi theo đường kính</button>
    <button class="menu" data-a="nav" data-s="lichsu">Xem lại ngày cũ</button>
    ${canIn() ? '<button class="menu" data-a="nav" data-s="baocao">Báo cáo Nhập – Dùng – Tồn theo kỳ</button>' : ''}
    ${isQL() ? `<div class="card col gap6"><b>Xuất Excel (CSV) bảng khu × phi</b><div class="row gap6"><input class="inp s f1" type="date" id="exday" data-model="exday" max="${S.boot.today}" value="${esc(fv('exday', S.boot.today))}"><button class="btn s" data-a="exportday">Tải về</button></div></div>` : ''}
    ${a ? `${nhom('Quản trị')}
    <button class="menu" data-a="nav" data-s="users">Người dùng và PIN</button>
    <button class="menu" data-a="nav" data-s="settings">Cài đặt khu, phi, quy tắc</button>` : ''}
    ${nhom('Máy này và tài khoản')}
    <div class="card col gap6"><b>Cách hiện số lượng</b>
      <div class="row gap6">${UNIT_OPTS.map(([v, l]) => `<button class="chip s f1 ${S.unit === v ? 'on' : ''}" data-a="unit" data-v="${v}">${l}</button>`).join('')}</div>
      <span class="sm muted" style="line-height:1.4">Ví dụ phi ${esc(uDemo().id)}: <b>${fmtQ(uDemo().bo_size * 31 + 10, uDemo())}</b><br>Chỉ đổi cách hiện trên máy này, số liệu không đổi.</span></div>
    ${installCard()}
    <button class="menu" data-a="nav" data-s="pin">Đổi PIN của tôi</button>
    <button class="menu" style="color:var(--bad)" data-a="logout">Đăng xuất</button>
    <div class="sm muted" style="text-align:center;padding-top:8px">Bãi Gia Công · phiên bản 1.3</div>
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
      u.locked ? '<span class="badge bad">Đã khoá</span>' : '',
      u.must_change ? '<span class="badge warn">chưa đổi PIN</span>' : '',
    ].filter(Boolean).join(' ');
    return `<div class="card col gap8" style="${u.locked ? 'opacity:.75;' : ''}${first ? 'border:2px solid var(--pri)' : ''}">
      <div class="row" style="justify-content:space-between;gap:8px;flex-wrap:wrap">
        <div class="col" style="gap:2px;min-width:0"><div class="row gap6" style="align-items:center;flex-wrap:wrap"><b style="font-size:18px">${esc(u.name)}</b>${tags}</div>
          <span class="sm muted">${esc(u.phone)}</span></div>
        <select class="inp s" style="width:168px;font-size:16px" data-change="role" data-id="${u.id}" ${first ? 'disabled' : ''}>${Object.keys(ROLE).map((r) => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${ROLE[r]}</option>`).join('')}</select></div>
      ${u.role === 'admin' ? `<div class="row gap8" style="align-items:center"><span class="sm f1" style="line-height:1.4">Chức danh ở đơn vị<br><span class="muted">để báo cáo ca điền đúng tên, không đổi quyền</span></span>
        <select class="inp s" style="width:168px;font-size:16px" data-change="chucdanh" data-id="${u.id}"><option value="">Không có</option>${CHUC_DANH.map((r) => `<option value="${r}" ${u.chuc_danh === r ? 'selected' : ''}>${ROLE[r]}</option>`).join('')}</select></div>` : ''}
      ${renameBox}
      <div class="row gap6">${first && !own ? '' : `<button class="btn s f1" data-a="ureset" data-id="${u.id}">Đặt lại PIN</button>`}
        ${me || first ? '' : `<button class="btn s f1 ${u.locked ? '' : 'bad'}" data-a="ulock" data-id="${u.id}" data-v="${u.locked ? 0 : 1}">${u.locked ? 'Mở khoá' : 'Khoá'}</button>`}
        <button class="btn s f1" data-a="ulogout" data-id="${u.id}">Đăng xuất máy</button></div>
      ${own && !renameBox ? `<div class="row gap6"><button class="btn s f1" data-a="urename" data-id="${u.id}">Sửa tên</button>
        ${me || first ? '' : `<button class="btn s bad f1" data-a="udelete" data-id="${u.id}">Xoá tài khoản</button>`}</div>` : ''}
      ${first ? '<span class="sm muted" style="line-height:1.4">Tài khoản thiết lập hệ thống: không ai khoá, hạ quyền, xoá hay đặt lại PIN được, kể cả admin khác.</span>' : ''}</div>`;
  };
  const goneSec = !gone.length ? '' : `<h2 class="sec">Tài khoản đã xoá (${gone.length})</h2>
    <div class="sm muted" style="line-height:1.4">Không đăng nhập được và không nhận phân công khu. Mọi số đếm, phiếu và báo cáo họ đã làm vẫn giữ nguyên tên — đó là lý do dòng tài khoản không bị xoá hẳn.</div>
    ${gone.map((u) => `<div class="card col gap8" style="opacity:.75">
      <div class="col" style="gap:2px"><div class="row gap6" style="align-items:center;flex-wrap:wrap"><b style="font-size:18px">${esc(u.name)}</b>${u.locked ? '<span class="badge bad">Đã khoá</span>' : ''}</div><span class="sm muted">${esc(u.phone)} · ${ROLE[u.role] || u.role}</span></div>
      ${u.locked ? '<span class="sm muted" style="line-height:1.4">Bị khoá trước khi xoá nên khôi phục xong vẫn còn khoá — nhớ mở khoá nếu cho dùng lại.</span>' : ''}
      ${own ? `<button class="btn s f1" data-a="urestore" data-id="${u.id}">KHÔI PHỤC</button>` : '<span class="sm muted">Chỉ admin đầu tiên khôi phục được.</span>'}</div>`).join('')}`;
  return `${head('Người dùng', own ? 'Bạn là admin đầu tiên: tạo, sửa tên và xoá tài khoản' : 'Admin tạo tài khoản, PIN và xếp cấp bậc', 'more')}<div class="f1 scroll pad col gap12" id="body">
    ${S.pinShown ? `<div class="card ok col gap8"><b style="font-size:18px">PIN của ${esc(S.pinShown.name)}</b><b style="font-size:40px;letter-spacing:8px">${esc(S.pinShown.pin)}</b><span class="sm">Đưa PIN này cho người dùng (chỉ hiện một lần). Họ sẽ phải đổi PIN khi đăng nhập lần đầu.</span><button class="btn s full" data-a="pinok">Đã ghi lại</button></div>` : ''}
    <div class="card col gap8"><b style="font-size:18px">Thêm người dùng</b>
      <input class="inp s" id="un" placeholder="Họ tên" value="${esc(S.form.un || '')}" data-model="un"><input class="inp s" id="up" type="tel" inputmode="numeric" placeholder="Số điện thoại" value="${esc(S.form.up || '')}" data-model="up">
      <select class="inp s" id="ur" data-model="ur">${Object.keys(ROLE).reverse().map((r) => `<option value="${r}" ${(S.form.ur || 'tieudoi') === r ? 'selected' : ''}>${ROLE[r]}</option>`).join('')}</select>
      <span class="sm muted" style="line-height:1.4"><b>Cấp duyệt:</b> Tiểu đội trưởng báo số → <b>CVKTHT</b> duyệt báo cáo của Tiểu đội trưởng, và lập phiếu kho → <b>Trung đội trưởng, Đại đội trưởng</b> duyệt được hết: việc CVKTHT báo và mọi phiếu kho. <b>Admin</b> duyệt được hết và quản lý hệ thống (tài khoản, khu, phi, quy tắc).</span>
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
  // ai duyệt được lần ghi này thì cũng từ chối / huỷ được; lần ghi kèm phiếu kho thì chỉ cấp chỉ huy
  const quyen = r0.kho ? isCH() : duyetDuoc(r0);
  const nut = huy ? ''
    : quyen && cho
      ? `<div class="row gap6"><button class="btn s ok" data-a="lduyet" data-id="${id}">Duyệt</button><button class="btn s bad" data-a="lvoid" data-id="${id}">Từ chối</button></div>`
    // cùng luật với server: admin huỷ lần ghi đã duyệt trong 7 ngày; quá hạn thì ghi một lần ngược lại
    : !cho && quyen && Date.now() - r0.duyet_ts > 7 * 864e5
      ? '<span class="sm muted" style="text-align:right;max-width:110px">quá 7 ngày, ghi lần ngược lại để sửa</span>'
    : quyen || (mine && (cho || Date.now() - r0.duyet_ts < 10 * 60e3))
      ? `<button class="btn s bad" data-a="lvoid" data-id="${id}">${cho ? 'Rút lại' : 'Huỷ'}</button>`
      : '';
  const nhan = huy ? `<span class="badge bad">Đã huỷ${r0.voided_uname ? ' · ' + esc(r0.voided_uname) : ''}</span>` : cho ? '<span class="badge warn">Chờ duyệt</span>' : `<span class="badge ok">Đã duyệt${r0.duyet_uname ? ' · ' + esc(r0.duyet_uname) : ''}</span>`;
  /* Ba dòng: (1) NGÀY GIAO NHẬN + việc + trạng thái, (2) phi và khối lượng, (3) chứng từ: số biên
     bản, hạn trả, xe, người — rồi người ghi sổ. Ngày giao nhận là ngày trên biên bản, khác lúc bấm ghi. */
  const conNo = !huy && !cho && loanLotsHien().some((l) => l.grp === r0.grp && l.con > 0);
  const ct = [r0.so_bb ? 'BB ' + esc(r0.so_bb) : '', hanTxt(r0.han, conNo), r0.bien_so ? 'xe ' + esc(r0.bien_so) : '', r0.nguoi ? esc(r0.nguoi) : '',
    r0.kho ? 'phiếu kho ' + esc(kName(r0.kho)) : ''].filter(Boolean).join(' · ');
  return `<div class="li" style="${huy ? 'opacity:.6' : ''}"><span style="${huy ? 'text-decoration:line-through' : ''}">${r0.ngay ? `<b>${ngayNgan(r0.ngay)}</b> · ` : ''}<b>${esc(loanTitle(r0.kind, r0.doitac_name || '#' + r0.doitac_id))}</b> ${nhan}<br>
    ${esc(kemTan(rows.map((r) => r.phi_id + ' ' + fmtQs(r.qty, r.phi_id)).join(' · '), kg))}<br>
    ${ct ? `<span class="sm">${ct}</span><br>` : ''}<span class="sm muted">ghi sổ: ${esc(r0.uname)} · ${dmy(r0.ts)}${r0.note ? ' · ' + esc(r0.note) : ''}</span>${huy && r0.voided_note ? `<br><span class="sm">Lý do huỷ: ${esc(r0.voided_note)}</span>` : ''}</span>${nut}</div>`;
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
  const canSua = canIn();

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
      <div class="row" style="justify-content:space-between;gap:8px"><b style="font-size:18px">${esc(d.name)}${d.active ? '' : ' <span class="sm muted">(đã ẩn)</span>'}</b>${choBy[d.id] ? `<span class="badge warn">${choBy[d.id]} chờ duyệt</span>` : ''}</div>
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
  /* Thép qua bãi: CVKTHT trở lên lập kèm phiếu kho cùng lần ghi, để tồn khu đổi đúng mà lượng dùng
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
      <span class="sm muted" style="line-height:1.4">${ra ? 'Thép rời' : 'Thép vào'} ${esc(kName(F.khu))}${ra && p ? ` (còn lấy được ${fmtQs(conLay(F.khu, F.phi), p)} ${F.phi})` : ''}. Tồn khu đổi theo khi duyệt, nhưng <b>không</b> tính là nhập hay dùng.</span>${fv('lngay', b.today) < b.today ? '<span class="sm" style="color:var(--warn);line-height:1.4"><b>Ghi bù ngày cũ:</b> phiếu kho đổi tồn từ HÔM NAY. Nếu khu đã đếm lại sau lần giao nhận đó thì số đếm đã tính thép này rồi — chọn "Không, chỉ ghi sổ".</span>' : ''}`
    : '<span class="sm muted" style="line-height:1.4">Chỉ ghi công nợ, tồn bãi không đổi (thép giao thẳng, không qua bãi).</span>'}`;
  const lines = (F.lines || []).length ? `<div class="card" style="padding:0;overflow:hidden">${F.lines.map((l, i) => `<div class="li"><span><b>${l.phi}</b> · ${fmtQ(l.qty, l.phi)}</span><button class="btn s bad" data-a="lrm" data-i="${i}">Xoá</button></div>`).join('')}</div>` : '';
  const form = `<div class="card col gap8">
    <b style="font-size:18px">Ghi sổ vay mượn</b>
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
    ${F.bb && F.zl ? '' : '<span class="sm muted" style="line-height:1.4">Đánh dấu đủ hai ô trên mới ghi sổ được: biên bản giao nhận là chứng từ gốc, sổ này chỉ là bản ghi nhớ.</span>'}</div>`;

  /* --- Lịch sử, gom theo lần ghi (grp) để duyệt/huỷ cả lần như một phiếu --- */
  const nhom = loanGroups(L.items);
  const cho = nhom.filter((rows) => !rows[0].duyet_ts), xong = nhom.filter((rows) => rows[0].duyet_ts);

  /* --- Danh bạ đối tác: sửa tên, ẩn/hiện (CVKTHT trở lên — server chặn Tiểu đội trưởng) --- */
  const dtList = !canSua || !(L.doitac || []).length ? '' : `<h2 class="sec">Đối tác</h2><div class="card" style="padding:0;overflow:hidden">${L.doitac.map((d) => (S.doitacEdit === d.id
    ? `<div class="li"><input class="inp s f1" id="ldtname" maxlength="60" value="${esc(S.form.ldtname == null ? d.name : S.form.ldtname)}" data-model="ldtname"><button class="btn s pri" data-a="ldtsave" data-id="${d.id}">Lưu</button><button class="btn s" data-a="ldtcancel">Bỏ</button></div>`
    : `<div class="li" style="${d.active ? '' : 'opacity:.6'}"><span>${esc(d.name)}${d.active ? '' : ' (đã ẩn)'}</span><span class="row gap6"><button class="btn s" data-a="ldtedit" data-id="${d.id}">Sửa tên</button><button class="btn s ${d.active ? 'bad' : ''}" data-a="ldthide" data-id="${d.id}" data-v="${d.active ? 0 : 1}">${d.active ? 'Ẩn' : 'Hiện'}</button></span></div>`)).join('')}</div>`;

  return `${top}<div class="f1 scroll pad col gap12" id="body">
    ${vmTabs('vaymuon')}
    ${F.done ? `<div class="card warn col gap6"><b style="font-size:18px">Đã ghi sổ · chờ cấp trên duyệt</b><span>${esc(F.done)}</span><span class="sm">Chỉ tính vào dư nợ sau khi được duyệt.</span></div>` : ''}
    <h2 class="sec">Công nợ hiện tại</h2>${duNo}
    ${form}
    ${cho.length ? `<h2 class="sec">Chờ duyệt (${cho.length})</h2><div class="card" style="padding:0;overflow:hidden">${cho.map(loanCard).join('')}</div>` : ''}
    <h2 class="sec">Đã duyệt gần đây</h2>${xong.length ? `<div class="card" style="padding:0;overflow:hidden">${xong.map(loanCard).join('')}</div>` : '<div class="muted">Chưa có.</div>'}
    ${canSua ? '<button class="btn full" data-a="lcsv">Tải cả sổ vay mượn (Excel)</button><span class="sm muted" style="line-height:1.4">Mọi lần ghi từ trước tới nay (cả lần đã huỷ) và bảng dư nợ theo đối tác, để đối chiếu công nợ và lưu ngoài app.</span>' : ''}
    ${dtList}
  </div>`;
}

/* --- Sắt vụn xuất ra ngoài ---
   Sổ riêng, cạnh sổ vay mượn: sắt vụn trộn nhiều phi nên chỉ ghi KHỐI LƯỢNG (tấn), không đụng tới tồn. Mỗi lần
   xe chở vụn ra cổng ghi một dòng (ngày, khu, tấn, cho ai, số phiếu cân, xe) để thống kê và đối chiếu với
   phiếu cân của bên mua. Ghi và duyệt như sổ vay. */
const vmTabs = (on) => `<div class="row gap6"><button class="chip s f1 ${on === 'vaymuon' ? 'on' : ''}" data-a="nav" data-s="vaymuon">Vay mượn thép</button><button class="chip s f1 ${on === 'satvun' ? 'on' : ''}" data-a="nav" data-s="satvun">Sắt vụn xuất ra</button></div>`;
// chứng từ của một lần xuất: khu, số phiếu cân, xe, người nhận
const svCt = (r) => [r.khu_id ? kName(r.khu_id) : 'nhiều khu', r.so_phieu ? 'phiếu ' + r.so_phieu : '', r.bien_so ? 'xe ' + r.bien_so : '', r.nguoi || ''].filter(Boolean).join(' · ');
// tấn gõ tay → kg nguyên, cùng luật với server (tanToKg): "2,5" hay "2.5"; có cả hai dấu thì không đoán
/* Khối lượng sắt vụn hiện BA số lẻ (tới từng kg), khác fmtT hai số lẻ của tồn bãi: sổ này để đối chiếu với
   phiếu cân, 2.675 kg mà hiện "2,68 tấn" là lệch phiếu ngay trên màn hình. */
const svT = (kg) => (kg / 1000).toFixed(3).replace('.', ',');
const svKg = (v) => { const t = String(v || '').trim().replace(/\s/g, ''); return /^\d+([.,]\d{1,3})?$/.test(t) ? Math.round(Number(t.replace(',', '.')) * 1000) : NaN; };
function svCard(r) {
  const cho = !r.duyet_ts, huy = !!r.voided, mine = r.user_id === S.me.id;
  // cùng luật với server (voidSv): người duyệt được thì từ chối / huỷ trong 7 ngày; người ghi rút lại, hoặc huỷ trong 10 phút sau duyệt
  const quyen = duyetDuoc(r) || (isCH() && !huy);
  const nut = huy ? ''
    : quyen && cho ? `<div class="row gap6"><button class="btn s ok" data-a="svduyet" data-id="${r.id}">Duyệt</button><button class="btn s bad" data-a="svvoid" data-id="${r.id}">Từ chối</button></div>`
    // đã duyệt quá 7 ngày: chỉ cấp chỉ huy còn huỷ được (kèm lý do), xem voidSv
    : !cho && quyen && !isCH() && Date.now() - r.duyet_ts > 7 * 864e5 ? ''
    : quyen || (mine && (cho || Date.now() - r.duyet_ts < 10 * 60e3)) ? `<button class="btn s bad" data-a="svvoid" data-id="${r.id}">${cho ? 'Rút lại' : 'Huỷ'}</button>` : '';
  const nhan = huy ? `<span class="badge bad">Đã huỷ${r.voided_uname ? ' · ' + esc(r.voided_uname) : ''}</span>` : cho ? '<span class="badge warn">Chờ duyệt</span>'
    : `<span class="badge ok">Đã duyệt${r.duyet_uname ? ' · ' + esc(r.duyet_uname) : ''}</span>`;
  return `<div class="li" style="${huy ? 'opacity:.6' : ''}"><span style="${huy ? 'text-decoration:line-through' : ''}"><b>${ngayNgan(r.ngay)}</b> · <b>${svT(r.kg)} tấn → ${esc(r.noi)}</b> ${nhan}<br>
    <span class="sm">${esc(svCt(r))}</span><br><span class="sm muted">ghi: ${esc(r.uname)} · ${dmy(r.ts)}${r.note ? ' · ' + esc(r.note) : ''}</span>${huy && r.voided_note ? `<br><span class="sm">Lý do huỷ: ${esc(r.voided_note)}</span>` : ''}</span>${nut}</div>`;
}
function vSatVun() {
  const b = S.boot, V = S.svs, F = S.sv;
  const top = head('Sắt vụn xuất ra ngoài', 'Ghi mỗi lần xuất vụn, để thống kê và đối chiếu · không tính vào tồn', 'more');
  if (!V) return `${top}${panelWait('satvun')}`;
  if (F.khu && !(b.khuBy[F.khu] && b.khuBy[F.khu].active)) F.khu = null;
  const T = V.tong || { kg: 0, n: 0, kgThang: 0, nThang: 0, kgNam: 0, nNam: 0 };
  const tong = `<div class="hero" style="border-radius:14px;padding:14px 16px"><div class="row" style="justify-content:space-between;gap:10px;flex-wrap:wrap">
      <div class="col"><span style="font-size:14px">Tháng này</span><span style="font-size:24px;font-weight:700">${svT(T.kgThang)} tấn</span><span class="sm" style="color:#D6E0EE">${T.nThang} lần xuất</span></div>
      <div class="col" style="align-items:flex-end;text-align:right"><span style="font-size:14px">Năm ${esc(V.nam)}</span><span style="font-size:24px;font-weight:700">${svT(T.kgNam)} tấn</span><span class="sm" style="color:#D6E0EE">${T.nNam} lần xuất</span></div></div>
      <div class="sm" style="color:#D6E0EE;margin-top:6px">Từ trước tới nay: ${svT(T.kg)} tấn · ${T.n} lần (chỉ tính lần đã duyệt)</div></div>`;
  const bang = (tieu, cot, rows, ten) => (rows.length ? `<h2 class="sec">${tieu}</h2><div class="card" style="padding:0;overflow-x:auto"><table class="tbl"><thead><tr><th>${cot}</th><th>Số lần</th><th>Tấn</th></tr></thead>
    <tbody>${rows.map((x) => `<tr><th>${esc(ten(x))}</th><td>${x.n}</td><td><b>${svT(x.kg)}</b></td></tr>`).join('')}</tbody></table></div>` : '');
  const thangTen = (x) => x.thang.slice(5) + '/' + x.thang.slice(0, 4) + (x.thang === V.thangNay ? ' (tháng này)' : '');
  /* KỲ của hai bảng theo khu / theo nơi nhận: năm nay, năm trước, từ trước tới nay, hoặc MỘT THÁNG (bấm vào dòng
     tháng ở bảng trên). Đối chiếu với bên mua làm theo tháng, nên chọn tháng thì danh sách bên dưới cũng là đủ
     các lần xuất của tháng đó. */
  const ky = V.ky || V.nam, kyThang = /^\d{4}-\d{2}$/.test(ky), namTruoc = String(Number(V.nam) - 1);
  const kyTen = ky === 'all' ? 'từ trước tới nay' : kyThang ? 'tháng ' + ky.slice(5) + '/' + ky.slice(0, 4) : 'năm ' + ky;
  const kyChip = (v, t) => `<button class="chip s ${ky === v ? 'on' : ''}" data-a="svky" data-v="${v}">${t}</button>`;
  const KT = V.kyTong || { n: 0, kg: 0 };
  const kyBox = `<h2 class="sec">Xem theo kỳ</h2><div class="wrap">${kyChip(V.nam, 'Năm nay')}${kyChip(namTruoc, 'Năm ' + namTruoc)}${kyChip('all', 'Tất cả')}${kyThang ? kyChip(ky, 'Tháng ' + ky.slice(5) + '/' + ky.slice(0, 4)) : ''}</div>
    <span class="sm"><b>${kyTen.charAt(0).toUpperCase() + kyTen.slice(1)}: ${svT(KT.kg)} tấn · ${KT.n} lần xuất</b> (đã duyệt)${kyThang ? '' : ' · bấm vào một tháng ở bảng dưới để xem riêng tháng đó'}</span>`;
  const thangBang = (V.thang || []).length ? `<h2 class="sec">Theo tháng</h2><div class="card" style="padding:0;overflow-x:auto"><table class="tbl"><thead><tr><th>Tháng</th><th>Số lần</th><th>Tấn</th></tr></thead>
    <tbody>${V.thang.map((x) => `<tr${x.thang === ky ? ' style="background:#EAF2FB"' : ''}><th><button class="sm" style="border:0;background:transparent;color:var(--pri);text-decoration:underline;padding:6px 0;font-weight:700;text-align:left" data-a="svky" data-v="${x.thang}">${esc(thangTen(x))}</button></th><td>${x.n}</td><td><b>${svT(x.kg)}</b></td></tr>`).join('')}</tbody></table></div>` : '';
  const kyBang = bang('Theo khu · ' + kyTen, 'Khu', V.khu || [], (x) => (x.khu_id ? kName(x.khu_id) : 'Nhiều khu'))
    + bang('Theo nơi nhận · ' + kyTen, 'Xuất cho', V.noi || [], (x) => x.noi);
  const tk = !(V.tong && V.tong.n) ? '' : kyBox + thangBang + (kyBang || `<div class="muted">Không có lần xuất nào đã duyệt trong ${kyTen}.</div>`);
  const kg = svKg(fv('svtan', ''));
  const khuChips = `<div class="wrap">${b.khuAct.map((k) => `<button class="chip s ${F.khu === k.id ? 'on' : ''}" data-a="svkhu" data-v="${esc(k.id)}">${esc(k.name)}</button>`).join('')}<button class="chip s ${F.khu === '' ? 'on' : ''}" data-a="svkhu" data-v="">Nhiều khu / chung</button></div>`;
  const noiChips = (V.noiGan || []).length ? `<div class="wrap">${V.noiGan.map((n) => `<button class="chip s" data-a="svnoi" data-v="${esc(n)}">${esc(n)}</button>`).join('')}</div>` : '';
  const form = `<div class="card col gap8">
    <b style="font-size:18px">Ghi một lần xuất sắt vụn</b>
    <b class="sm">1. Ngày xuất</b>
    <input class="inp s" type="date" id="svngay" data-model="svngay" max="${b.today}" value="${esc(fv('svngay', b.today))}">
    <b class="sm">2. Xuất từ khu</b>${khuChips}
    <b class="sm">3. Khối lượng (tấn)</b>
    <input class="inp" id="svtan" inputmode="decimal" maxlength="12" placeholder="Ví dụ 2,5" data-model="svtan" value="${esc(fv('svtan', ''))}" style="font-size:28px;font-weight:700;text-align:center;height:60px">
    <span class="sm muted" id="svkg">${kg > 0 ? '= ' + fmtInt(kg) + ' kg' : 'Ghi theo phiếu cân, đơn vị tấn (dấu phẩy cho số lẻ).'}</span>
    <b class="sm">4. Xuất cho (đơn vị mua / nơi nhận)</b>
    ${noiChips}<input class="inp s" id="svnoi" maxlength="80" placeholder="Tên đơn vị mua / nơi nhận" data-model="svnoi" value="${esc(fv('svnoi', ''))}">
    <b class="sm">5. Chứng từ</b>
    <input class="inp s" id="svphieu" maxlength="40" placeholder="Số phiếu cân / biên bản (bắt buộc)" data-model="svphieu" value="${esc(fv('svphieu', ''))}">
    <div class="row gap6"><input class="inp s f1" id="svnguoi" maxlength="60" placeholder="Người nhận" data-model="svnguoi" value="${esc(fv('svnguoi', ''))}" style="min-width:0"><input class="inp s" id="svbienso" maxlength="20" placeholder="Biển số xe" data-model="svbienso" value="${esc(fv('svbienso', ''))}" style="width:130px"></div>
    <input class="inp s" id="svnote" maxlength="200" placeholder="Ghi chú (không bắt buộc)" data-model="svnote" value="${esc(fv('svnote', ''))}">
    <button class="btn pri full" style="min-height:56px;font-size:18px" data-a="svsave">GHI SỔ</button></div>`;
  const items = V.items || [];
  const cho = items.filter((r) => !r.duyet_ts && !r.voided), ls = items.filter((r) => r.duyet_ts || r.voided);
  return `${top}<div class="f1 scroll pad col gap12" id="body">
    ${vmTabs('satvun')}
    ${F.done ? `<div class="card warn col gap6"><b style="font-size:18px">Đã ghi · chờ cấp trên duyệt</b><span>${esc(F.done)}</span><span class="sm">Chỉ tính vào thống kê sau khi được duyệt.</span></div>` : ''}
    ${tong}
    ${form}
    ${cho.length ? `<h2 class="sec">Chờ duyệt (${cho.length})</h2><div class="card" style="padding:0;overflow:hidden">${cho.map(svCard).join('')}</div>` : ''}
    ${tk || '<div class="muted">Chưa có lần xuất nào được duyệt.</div>'}
    <h2 class="sec">${kyThang ? 'Các lần xuất trong ' + kyTen + ' (' + ls.length + ')' : 'Các lần xuất gần đây'}</h2>${ls.length ? `<div class="card" style="padding:0;overflow:hidden">${ls.map(svCard).join('')}</div>` : '<div class="muted">Chưa có.</div>'}
    ${canIn() ? '<button class="btn full" data-a="svcsv">Tải sổ sắt vụn (Excel)</button><span class="sm muted" style="line-height:1.4">Mọi lần xuất từ trước tới nay (cả lần đã huỷ), tổng theo tháng và theo nơi nhận, để đối chiếu với phiếu cân.</span>' : ''}
  </div>`;
}
// tải sổ theo KỲ đang chọn; mọi chỗ nạp lại màn Sắt vụn đều qua đây để không rơi về kỳ mặc định
const svTai = () => api('GET', '/satvun' + (S.svKy ? '?ky=' + encodeURIComponent(S.svKy) : ''));
// duyệt / huỷ gọi từ màn Duyệt hay màn Sắt vụn thì nạp lại đúng màn đó
async function svReload() {
  const man = async () => { if (S.screen === 'duyet') await reloadReview(); else S.svs = await svTai(); };
  await Promise.all([man(), loadBoot()]);
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

/* --- Gia công cấu kiện ---
   Đơn giao cho Tiểu đội trưởng gia công thép của một cấu kiện, ở một vị trí trục, có hạn. KHÔNG liên
   quan tới đếm thép hay tồn kho. Khác phần còn lại của app ở chỗ AI CŨNG XEM ĐƯỢC MỌI ĐƠN: đây là bảng
   chung của cả đơn vị. Quyền (server mới là chỗ chặn thật, xem src/giacong.js):
     - giao, sửa, giao lại, huỷ, mở lại đơn đã xong: CVKTHT trở lên;
     - nhận đơn, cập nhật tiến độ, báo vướng, xác nhận xong: CHỈ người được giao. */
const GC_TT = { moi: ['Mới giao', 'warn'], nhan: ['Đã nhận', 'idle'], lam: ['Đang làm', 'pri'], xong: ['Đã xong', 'ok'], huy: ['Đã huỷ', 'bad'] };
const GC_PCT = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90]; // chép từ src/giacong.js; 100% là việc "xác nhận đã xong"
// nấc kế tiếp để bấm nhanh trên thẻ đơn; đơn cũ đang 25% / 75% (nấc trước đây) thì lên nấc chẵn chục gần nhất
const gcPctKe = (pct) => Math.min(90, Math.floor(pct / 10) * 10 + 10);
const GC_VIEC = { nhan: 'nhận đơn', tiendo: 'cập nhật tiến độ', vuong: 'báo đang vướng', hetvuong: 'báo hết vướng', xong: 'xác nhận đã xong', sua: 'sửa đơn', huy: 'huỷ đơn (không làm nữa)', molai: 'mở lại đơn', biet: 'đã biết đơn bị huỷ', khoiphuc: 'khôi phục đơn đã huỷ', xemvuong: 'đã xem vướng, đang xử lý', xuat: 'gửi xuất', duyetxuat: 'DUYỆT XUẤT', tuchoixuat: 'không duyệt xuất' };
/* Tên gọi ngắn (chữ cuối của họ tên: "Nguyễn Văn An" → "An") cho những chỗ chật, như dòng vị trí trên thẻ đơn. */
const gcTen = (n) => String(n || '').trim().split(/\s+/).pop();
// bao lâu rồi, theo giờ server: "5 phút", "3 giờ", "2 ngày"
const gcLau = (ts) => {
  const m = Math.max(1, Math.round((Date.now() + ((S.boot && S.boot.skew) || 0) - ts) / 60e3));
  return m < 60 ? m + ' phút' : m < 1440 ? Math.floor(m / 60) + ' giờ' : Math.floor(m / 1440) + ' ngày';
};
/* ĐƠN ĐỨNG YÊN: đã nhận mà từ 2 ngày nay người làm không động tới (không tiến độ, không báo vướng). Không trễ hạn,
   không vướng nên không có thẻ nhắc nào bắt được — mà đây thường là đơn bị quên. Trả về số ngày (0 = không). Đơn
   đang vướng thì không tính: lý do đứng yên đã được nói ra. */
const GC_DUNG_YEN_NGAY = 2;
const gcDungYen = (d) => {
  if (!(d.tt === 'nhan' || d.tt === 'lam') || d.vuong) return 0;
  const n = Math.floor((Date.now() + ((S.boot && S.boot.skew) || 0) - (d.lam_ts || d.ts)) / 864e5);
  return n >= GC_DUNG_YEN_NGAY ? n : 0;
};
// dòng vướng: lý do, mức độ, và đã có ai nhận xử lý chưa
const gcVuongTxt = (d) => `<b>Vướng${d.vuong_dung ? ' · DỪNG HẲN' : ''}:</b> ${esc(d.vuong)}`;
const gcVuongXem = (d) => (d.vuong_xem_ts ? `${esc(d.vuong_xem_name || '')} đang xử lý (${gcLau(d.vuong_xem_ts)} trước)` : '<b>chưa ai nhận xử lý</b>');
/* HUỶ nghĩa là "đơn này KHÔNG CẦN LÀM NỮA" (không xoá đơn). Người giữ đơn phải bấm ĐÃ BIẾT: chưa bấm thì đơn
   nằm đầu danh sách của họ, và người giao thấy "chưa xem". Huỷ nhầm thì người giao khôi phục được trong 7 ngày. */
/* NHIỀU NGƯỜI CÙNG LÀM MỘT ĐƠN (tối đa GC_NGUOI_MAX, xem src/giacong.js): ai trong đơn cũng nhận, cập nhật, báo vướng,
   xác nhận xong được; "đã biết" khi đơn bị huỷ là của từng người. Bảng đơn và màn một đơn có d.nguoi
   [{ id, ten, biet }] (người chính đứng đầu, d.uname = tên mọi người); bootstrap chỉ có d.ids và d.chua_biet. */
const GC_NGUOI_MAX = 4;
const gcNguoi = (d) => (Array.isArray(d.nguoi) && d.nguoi.length ? d.nguoi.map((n) => n.id) : d.ids ? String(d.ids).split(',').map(Number) : [d.user_id]);
const gcCuaToi = (d) => gcNguoi(d).includes(S.me.id);
const gcTenNguoi = (d, ngan) => (Array.isArray(d.nguoi) && d.nguoi.length ? d.nguoi.map((n) => n.ten) : [d.uname || '']).map((t) => (ngan ? gcTen(t) : t)).join(', ');
// những người CHƯA bấm "đã biết" trên đơn bị huỷ
const gcChuaBiet = (d) => (Array.isArray(d.nguoi) && d.nguoi.length ? d.nguoi.filter((n) => !n.biet).map((n) => n.id)
  : d.chua_biet !== undefined ? (d.chua_biet ? String(d.chua_biet).split(',').map(Number) : []) : d.biet_ts ? [] : [d.user_id]);
const gcCanBiet = (d) => d.tt === 'huy' && gcChuaBiet(d).includes(S.me.id);
/* TRAO ĐỔI TRÊN ĐƠN (xem gcTn ở src/giacong.js). S.boot.gcTn = [{ id, cau_kien, truc, moi }]: đơn liên quan tới mình có
   tin chưa đọc. Tin không làm đổi 'rev' mà đổi bộ đếm 'tn' (trả kèm /rev): đổi thì máy chỉ hỏi lại danh sách này. */
const GC_TN_MO_MS = 7 * 864e5, GC_TN_THU_HOI_MS = 2 * 60e3; // chép từ src/giacong.js
const gcTnMoi = (id) => (((S.boot && S.boot.gcTn) || []).find((x) => x.id === id) || {}).moi || 0;
// trả lời nhanh: một chạm là gửi
const GC_TN_NHANH = { lam: ['Đã rõ', 'Đang làm', 'Cần thêm thời gian', 'Cần thêm thép'], giao: ['Đã rõ', 'Làm gấp', 'Đã chuyển thép', 'Kiểm tra lại bản vẽ'] };
// viết được không: người trong đơn hoặc CVKTHT trở lên; đơn đã đóng quá 7 ngày thì khoá
function gcTnDuoc(d) {
  if (!gcCuaToi(d) && !isQL()) return false;
  const dong = d.tt === 'xong' ? d.xong_ts : d.tt === 'huy' ? d.huy_ts || d.cap_ts : null;
  return !(dong && Date.now() - dong > GC_TN_MO_MS);
}
// đánh dấu đã đọc mọi tin của đơn đang mở (không chờ, lỗi mạng thì lần mở sau đánh dấu lại)
function gcDocXong() {
  const D = S.gcDetail;
  if (!D || !D.tn || !D.tn.length) return;
  const max = Math.max(...D.tn.map((t) => t.id));
  if (S.boot && S.boot.gcTn) S.boot.gcTn = S.boot.gcTn.filter((x) => x.id !== D.don.id);
  if (max <= (D.doc || 0)) return;
  D.doc = max;
  api('POST', `/giacong/${D.don.id}/doc`, { den: max }, 0, false).catch(() => {});
}
// tải lại phần trao đổi khi bộ đếm tin đổi: tin chưa đọc của mình, và đơn đang mở / bảng đơn đang xem
async function gcTnTai() {
  S.boot.gcTn = (await api('GET', '/giacong/tnmoi')).items;
  if (S.screen === 'gcdon' && S.gcId) { const n = (S.gcDetail && S.gcDetail.tn || []).length; S.gcDetail = await api('GET', '/giacong/' + S.gcId); if (S.gcDetail.tn.length > n) S.gcXuong = true; gcDocXong(); }
  if (S.screen === 'giacong') S.gc = await api('GET', '/giacong');
}
const GC_KHOI_PHUC_MS = 7 * 864e5; // chép từ src/giacong.js
// một dòng nói đủ về lần huỷ: ai huỷ, lúc nào, người giữ đơn đã biết chưa
const gcHuyAi = (d) => `${d.huy_name ? esc(d.huy_name) + ' huỷ' : 'Huỷ'}${d.huy_ts ? ' ' + dmy(d.huy_ts) : ''} · ${(Array.isArray(d.nguoi) && d.nguoi.length ? d.nguoi : [{ ten: d.uname, biet: d.biet_ts }]).map((n) => (n.biet ? esc(n.ten) + ' đã biết ' + dmy(n.biet) : `<b style="color:var(--warn)">${esc(n.ten)} chưa xem</b>`)).join(' · ')}`;
const GC_BUOI = [['', 'Trong ngày'], ['sang', 'Buổi sáng'], ['chieu', 'Buổi chiều']];
const gcMo = (d) => d.tt === 'moi' || d.tt === 'nhan' || d.tt === 'lam';
// trễ: đã qua ngày cần xong; đơn hạn BUỔI SÁNG thì trễ từ 12h trưa hôm đó (giờ server, như khung giờ đếm)
const gcTre = (d) => gcMo(d) && (d.han < S.boot.today || (d.han === S.boot.today && d.buoi === 'sang' && vnHourNow() >= 12));
const gcBuoi = (d) => (d.buoi === 'sang' ? ' sáng' : d.buoi === 'chieu' ? ' chiều' : '');
// hạn của đơn: còn mở thì nói trễ / hôm nay / còn mấy ngày; đã đóng thì chỉ ghi ngày
function gcHan(d) {
  const t = ngayNgan(d.han) + gcBuoi(d);
  if (!gcMo(d)) return 'Hạn ' + t;
  const n = soNgay(S.boot.today, d.han);
  return n < 0 ? `<b style="color:var(--bad)">Trễ ${-n} ngày</b> (hạn ${t})`
    : gcTre(d) ? '<b style="color:var(--bad)">Trễ: hạn sáng nay</b>'
    : n === 0 ? `<b style="color:var(--warn)">Hạn hôm nay${gcBuoi(d)}</b>`
    : n === 1 ? `<b style="color:var(--warn)">Hạn ngày mai${gcBuoi(d)}</b>`
    : `Hạn ${t} (còn ${n} ngày)`;
}
// tầng người giao gõ gọn ("5", "B1"): hiện thành "Tầng 5"; đã là chữ đủ nghĩa ("Mái", "Hầm 2") thì để nguyên
const gcTang = (t) => (!t ? '' : /^(tầng|mái|hầm|lửng|trệt|sân|tum)/i.test(t) ? t : 'Tầng ' + t);
// như server (chuTang): bỏ chữ "Tầng" người dùng lỡ gõ, viết hoa chữ đầu — "tầng 5" → "5", "mái" → "Mái"
const gcTangChu = (v) => { const t = String(v || '').trim().replace(/\s+/g, ' ').replace(/^(tầng|tang)\s*/i, ''); return t ? t.charAt(0).toUpperCase() + t.slice(1) : ''; };
/* Vị trí của một đơn trên một dòng: TRỤC in đậm đứng đầu (thứ người làm tìm trước tiên), rồi phân khu, tầng;
   kemNguoi: thêm tên người giữ đơn, dùng khi bảng không gom theo tổ. */
const gcViTri = (d, kemNguoi) => [d.truc ? `<b style="color:var(--ink)">${esc(d.truc)}</b>` : '', esc(d.phan_khu || ''), esc(gcTang(d.tang)), d.cote ? 'cote ' + esc(d.cote) : '', kemNguoi ? esc(gcTenNguoi(d, true)) : ''].filter(Boolean).join(' · ');
const gcBar = (pct) => `<div class="row gap8"><div class="bar" style="flex:1"><i style="width:${pct}%"></i></div><b class="sm" style="flex:none">${pct}%</b></div>`;
// hạn viết gọn cho một dòng trên bảng: chỉ nói cái cần biết ngay (trễ mấy ngày, hôm nay, mai), còn lại là ngày
function gcHanNgan(d) {
  const t = ngayNgan(d.han) + gcBuoi(d);
  if (!gcMo(d)) return t;
  const n = soNgay(S.boot.today, d.han);
  return n < 0 ? `<b style="color:var(--bad)">Trễ ${-n} ngày</b>`
    : gcTre(d) ? '<b style="color:var(--bad)">Trễ: hạn sáng nay</b>'
    : n === 0 ? `<b style="color:var(--warn)">Hôm nay${gcBuoi(d)}</b>`
    : n === 1 ? `<b style="color:var(--warn)">Mai${gcBuoi(d)}</b>` : t;
}
// tìm không cần gõ dấu: "dam d3" khớp "Dầm D3"
const gcKhongDau = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
/* TÌM KIẾM theo TỪNG TỪ, không theo chuỗi con:
   - mọi từ gõ vào đều phải khớp (gõ "w23 tang 5" là W23 ở tầng 5), thứ tự tuỳ ý, không cần dấu;
   - từ có SỐ là mã (cấu kiện W23, trục X14, tầng 5) nên phải khớp ĐÚNG mã: "w23" ra "Vách W23", "W23a" nhưng
     không ra "W230"; "d3" không ra "D30". Tìm chuỗi con thì gõ "w2" ra cả W2, W20…W29 — quá nhiều để dùng;
   - từ không có số ("vach", "khu", tên người) khớp ĐẦU từ: "va" ra "Vách";
   - mã trục còn khớp theo DẢI: "x14" ra đơn ghi X12-X17, "c" ra đơn trên Trục C (A-D)... vì cấu kiện ở trục 14
     nằm trong dải đó;
   - gõ liền hay cách ("w 23", "w-23") đều như nhau. */
function gcKhop(text, q) {
  if (!q) return true;
  const tu = text.split(/[^a-z0-9]+/).filter(Boolean);
  const dai = [...text.matchAll(/([a-z]*)(\d+)\s*-\s*([a-z]*)(\d+)/g)].filter((m) => !m[3] || m[3] === m[1]);
  const mot = (x) => {
    if (tu.some((w) => (/\d/.test(x) ? w === x || (w.startsWith(x) && !/\d/.test(w[x.length])) : w.startsWith(x)))) return true;
    const m = /^([a-z]*)(\d+)$/.exec(x);
    return !!m && dai.some((r) => r[1] === m[1] && Math.min(+r[2], +r[4]) <= +m[2] && +m[2] <= Math.max(+r[2], +r[4]));
  };
  const qs = q.split(/[^a-z0-9]+/).filter(Boolean);
  return qs.every(mot) || (qs.length > 1 && mot(qs.join('')));
}
const gcTuKhoa = (d) => gcKhongDau([d.cau_kien, d.truc, d.phan_khu, gcTang(d.tang), d.cote ? 'cote ' + d.cote : '', d.hang_muc, gcTenNguoi(d), d.noi_dung, d.od_nguoi, d.od_dd].filter(Boolean).join(' '));
/* XUẤT sau khi xong (xem src/giacong.js): đơn xong mà chưa duyệt xuất vẫn là việc dở — chưa gửi xuất, hoặc chờ
   CVKTHT trở lên duyệt. Quá một ngày chưa gửi xuất thì nhắc đỏ cả tổ lẫn người giao. */
const gcChoXuat = (d) => d.tt === 'xong' && d.xuat_tt !== 'duyet';
const gcXuatTre = (d) => gcChoXuat(d) && !d.xuat_tt && d.xong_ts && Date.now() + ((S.boot && S.boot.skew) || 0) - d.xong_ts > 864e5;
// nhãn trạng thái của đơn; đơn đã xong tách theo việc xuất
/* Hàng tóm tắt gia công trên Tổng quan: đơn của CẢ ĐƠN VỊ (các thẻ "Cần xử lý" chỉ nói việc của riêng người xem).
   Mỗi ô bấm là mở bảng đơn đúng mục lọc đó. Lấy từ S.boot.gc — đơn còn mở và đơn xong chưa xuất — nên không tải thêm gì. */
function gcHomeRow() {
  const all = S.boot.gc || [], mo = all.filter(gcMo), xuat = all.filter(gcChoXuat).length;
  if (!mo.length && !xuat) return '';
  const o = [['mo', 'Đang mở', mo.length, ''], ['tre', 'Trễ', mo.filter(gcTre).length, 'bad'], ['vuong', 'Vướng', mo.filter((d) => d.vuong).length, 'warn'], ['xuat', 'Chưa xuất', xuat, 'warn']];
  return `<div class="col gap6"><div class="row" style="justify-content:space-between;align-items:baseline;gap:8px"><h2 class="sec" style="min-width:0">Gia công cấu kiện</h2><span class="sm muted" style="white-space:nowrap;flex:none">đơn của mọi tiểu đội</span></div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px">${o.map(([f, ten, n, mau]) => `<button class="card col" style="padding:8px 2px;min-height:60px;align-items:center;justify-content:center;gap:2px;font-family:inherit;color:inherit" aria-label="${ten}: ${n} đơn" data-a="nav" data-s="giacong" data-f="${f}"><b style="font-size:22px;line-height:1.1${n && mau ? `;color:var(--${mau})` : ''}">${n}</b><span class="sm" style="white-space:nowrap">${ten}</span></button>`).join('')}</div></div>`;
}
function gcTT(d) {
  if (d.tt === 'xong') return d.xuat_tt === 'duyet' ? ['Đã xuất', 'ok'] : d.xuat_tt === 'cho' ? ['Chờ duyệt xuất', 'warn'] : ['Xong · chưa xuất', 'ok'];
  return GC_TT[d.tt] || [d.tt, 'idle'];
}
/* MỘT DÒNG CẢNH BÁO trên thẻ: việc gấp nhất của đơn, kèm "+N việc khác". Thẻ nhiều dòng cảnh báo cao gấp đôi và
   chỉ còn 2 đơn một màn; đủ chi tiết thì mở đơn. Thứ tự: dừng hẳn > bị mở lại > chờ trả lời > vướng > đứng yên;
   đơn đã xong thì là việc xuất. Trả về [{ mau, html }]. */
function gcCanhBao(d) {
  const mo = gcMo(d), out = [];
  if (mo && d.vuong && d.vuong_dung) out.push({ mau: 'bad', html: gcVuongTxt(d) + ' · ' + gcVuongXem(d) });
  if (mo && d.mo_lai) out.push({ mau: 'bad', html: '<b>Bị mở lại:</b> ' + esc(d.mo_lai) });
  if (mo && d.cho_tl) out.push({ mau: 'warn', html: `<b>Chờ ${esc(gcTenNguoi(d, true))} trả lời</b> câu hỏi của người giao` });
  if (mo && d.vuong && !d.vuong_dung) out.push({ mau: 'warn', html: gcVuongTxt(d) + ' · ' + gcVuongXem(d) });
  const yen = gcDungYen(d);
  if (yen) out.push({ mau: 'warn', html: `<b>Đứng yên ${yen} ngày</b> · chưa cập nhật tiến độ` });
  if (gcChoXuat(d)) {
    if (d.xuat_tt === 'cho') out.push({ mau: 'warn', html: `<b>Chờ duyệt xuất</b> · xuất cho ${esc(d.xuat_cho || '')}` });
    else out.push({ mau: gcXuatTre(d) ? 'bad' : 'warn', html: `<b>Chưa xuất</b>${d.xong_ts ? ' · xong ' + gcLau(d.xong_ts) + ' trước' : ''}${d.xuat_tu_choi ? ' · lần trước không duyệt: ' + esc(d.xuat_tu_choi) : ''}` });
  }
  return out;
}
// chấm màu của dòng gọn: đỏ = gấp, vàng = cần để ý, xanh lá = xong, xanh = đang làm, xám = mới giao / đã huỷ
function gcCham(d) {
  const cb = gcCanhBao(d);
  if (gcTre(d) || gcCanBiet(d) || cb.some((x) => x.mau === 'bad')) return 'var(--bad)';
  if (cb.length) return 'var(--warn)';
  return d.tt === 'xong' ? 'var(--ok)' : d.tt === 'lam' || d.tt === 'nhan' ? 'var(--pri)' : '#8C8678';
}
/* DANH SÁCH GỌN: mỗi đơn một dòng (~52px, 10–12 đơn một màn): chấm màu · cấu kiện · trục, rồi trạng thái · % · hạn.
   Bấm dòng là mở đơn. Không có nút làm nhanh: chế độ này để nhìn tổng thể. */
function gcDong(d, q, kemNguoi) {
  const tk = gcTuKhoa(d), [ten] = gcTT(d), cb = gcCanhBao(d), tn = gcTnMoi(d.id);
  const dong2 = [ten, d.tt === 'huy' ? '' : d.pct + '%', gcMo(d) ? gcHanNgan(d) : ''].filter(Boolean).join(' · ');
  return `<button class="li" data-gcq="${esc(tk)}" data-a="gcview" data-id="${d.id}" style="width:100%;background:#fff;border:0;border-bottom:1px solid var(--line);text-align:left;font:inherit;color:inherit;padding:8px 12px;${q && !gcKhop(tk, q) ? 'display:none;' : ''}">
    <span style="width:10px;height:10px;border-radius:50%;background:${gcCham(d)};flex:none"></span>
    <span class="col" style="flex:1;min-width:0;gap:1px">
      <span class="row" style="gap:6px;min-width:0;align-items:baseline"><b style="flex:0 1 auto;min-width:0;max-width:62%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(d.cau_kien)}</b><span class="sm muted" style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(d.truc || '')}${kemNguoi ? ' · ' + esc(gcTenNguoi(d, true)) : ''}</span></span>
      <span class="sm" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${dong2}${cb.length ? ` · <span style="color:var(--${cb[0].mau})">${cb[0].html.replace(/<[^>]+>/g, '')}</span>` : ''}</span></span>
    ${tn ? `<span class="badge bad" style="flex:none">${tn}</span>` : ''}</button>`;
}
/* Một đơn trên bảng: cấu kiện · trạng thái; vị trí; tiến độ · hạn; MỘT dòng cảnh báo. Bấm vào là mở đơn.
   Đơn CỦA NGƯỜI ĐANG XEM có thêm hàng nút làm ngay tại bảng (nhận, lên %, vướng, xong, xuất). q: chữ đang tìm (đã bỏ
   dấu); đơn không khớp thì ẩn chứ không bỏ khỏi trang, để gõ tìm chỉ việc ẩn / hiện. */
function gcCard(d, q, kemNguoi) {
  const [ten, mau] = gcTT(d);
  const vt = gcViTri(d, kemNguoi), mo = gcMo(d), vuong = d.vuong && mo, cuaToi = mo && gcCuaToi(d);
  const tk = gcTuKhoa(d);
  const canBiet = gcCanBiet(d);
  const cb = gcCanhBao(d);
  const vien = gcTre(d) || canBiet || cb.some((x) => x.mau === 'bad') ? 'border:2px solid var(--bad);' : cb.length ? 'border:2px solid var(--warn);' : '';
  // ba nút gọn một hàng cho người làm: lên một nấc, báo / hết vướng, xong. Mười nấc hay ghi chú thì mở đơn.
  const nho = 'style="flex:1;min-height:40px;padding:4px 2px;font-size:15px;white-space:nowrap"';
  const toiXuat = gcChoXuat(d) && !d.xuat_tt && gcCuaToi(d);
  const nut = canBiet ? `<button class="btn s bad full" data-a="gcqbiet" data-id="${d.id}">ĐÃ BIẾT, DỪNG LÀM</button>`
    : toiXuat ? `<button class="btn s pri full" data-a="gcqxuat" data-id="${d.id}">XUẤT</button>`
    : !cuaToi ? ''
    : d.tt === 'moi' ? `<button class="btn s pri full" data-a="gcqnhan" data-id="${d.id}">NHẬN ĐƠN</button>`
    : `<div class="row gap6">${d.pct < 90 ? `<button class="chip s" ${nho} data-a="gcqpct" data-id="${d.id}" data-v="${gcPctKe(d.pct)}">Lên ${gcPctKe(d.pct)}%</button>` : ''}${d.vuong ? `<button class="chip s" ${nho} data-a="gcqhetvuong" data-id="${d.id}">Hết vướng</button>` : `<button class="chip s" ${nho.replace('style="', 'style="color:var(--bad);border-color:var(--bad);')} data-a="gcqvuong" data-id="${d.id}">Vướng</button>`}<button class="btn s ok" ${nho} data-a="gcqxong" data-id="${d.id}">XONG</button></div>`;
  // người giao: lần báo vướng chưa ai nhận thì nhận ngay trên thẻ; đơn chờ duyệt xuất thì mở đơn để xem rồi duyệt
  const ngoai = !gcCuaToi(d) && isQL();
  const nutQl = ngoai && vuong && !d.vuong_xem_ts ? `<button class="btn s full" data-a="gcqxemvuong" data-id="${d.id}">ĐÃ XEM, ĐANG XỬ LÝ VƯỚNG</button>`
    : ngoai && d.xuat_tt === 'cho' && d.tt === 'xong' ? `<button class="btn s ok full" data-a="gcview" data-id="${d.id}">XEM VÀ DUYỆT XUẤT</button>` : '';
  return `<div class="card col gap6" data-gcq="${esc(tk)}" style="padding:10px 12px;${vien}${d.tt === 'huy' && !canBiet ? 'opacity:.75;' : ''}${q && !gcKhop(tk, q) ? 'display:none;' : ''}">
    <button class="col" style="gap:4px;border:0;background:transparent;padding:0;margin:0;text-align:left;font:inherit;color:inherit;width:100%;align-items:stretch" data-a="gcview" data-id="${d.id}">
      <span class="row" style="justify-content:space-between;gap:8px;align-items:flex-start"><b style="font-size:17px;min-width:0">${esc(d.cau_kien)}</b><span class="row gap6" style="flex:none">${gcTnMoi(d.id) ? `<span class="badge bad">${gcTnMoi(d.id)} tin mới</span>` : ''}<span class="badge ${mau}">${ten}</span></span></span>
      ${vt ? `<span class="sm muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${vt}</span>` : ''}
      ${!kemNguoi && gcNguoi(d).length > 1 ? `<span class="sm muted">Cùng làm: ${esc(gcTenNguoi(d, true))}</span>` : ''}
      ${d.od_nguoi || d.od_dd ? `<span class="sm muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Order: ${esc([d.od_nguoi, d.od_dd].filter(Boolean).join(' · '))}</span>` : ''}
      <span class="row gap8">${d.tt === 'huy' ? `<b class="sm" style="flex:none">${d.pct ? 'Dừng ở ' + d.pct + '%' : 'Chưa làm'}</b>` : `<span class="bar" style="width:72px;flex:none"><i style="width:${d.pct}%"></i></span><b class="sm" style="flex:none">${d.pct}%</b>`}<span class="sm" style="margin-left:auto;text-align:right">${gcHanNgan(d)}</span></span>
      ${cb.length ? `<span class="sm" style="color:var(--${cb[0].mau})">${cb[0].html}${cb.length > 1 ? ` <span class="muted">· +${cb.length - 1} việc khác</span>` : ''}</span>` : ''}
      ${d.tt === 'huy' ? `<span class="sm" style="color:var(--bad)"><b>Không làm nữa:</b> ${esc(d.huy_ly_do || '')}</span><span class="sm muted">${gcHuyAi(d)}</span>` : ''}
    </button>${nut}${nutQl}</div>`;
}
/* Gõ tìm: tìm trên MỌI đơn, kể cả đã xong và đã huỷ, bất kể đang ở mục lọc nào. Tìm một đơn đã huỷ mà không ra
   thì người ta tưởng chưa ai giao, rồi giao lại. Trang giữ sẵn hai khối: danh sách theo mục lọc ([data-gcds]) và
   kết quả tìm ([data-gctim], mọi đơn); gõ chữ chỉ việc ẩn / hiện, không vẽ lại màn hình giữa lúc gõ tiếng Việt. */
function gcLoc() {
  const q = gcKhongDau(S.form.gcq).trim();
  const ds = document.querySelector('[data-gcds]'), tim = document.querySelector('[data-gctim]');
  if (!ds || !tim) return;
  ds.style.display = q ? 'none' : '';
  tim.style.display = q ? '' : 'none';
  tim.innerHTML = gcTimKhoi(q);
}
/* Khối kết quả tìm: CHỈ dựng thẻ của các đơn khớp (tối đa GC_TIM_MAX), đơn còn mở đứng trước. Bản đầu dựng sẵn
   thẻ của MỌI đơn rồi ẩn / hiện: đo với 481 đơn thì mỗi lần vẽ lại màn hình (mỗi lần chạm) sinh 716 KB HTML, 612
   thẻ, trong khi người dùng chỉ thấy vài cái. Gõ tìm vẫn không vẽ lại cả màn: gcLoc chỉ thay nội dung khối này. */
const GC_TIM_MAX = 60;
function gcTimKhoi(q) {
  if (!q) return '';
  const khop = ((S.gc && S.gc.items) || []).filter((d) => gcKhop(gcTuKhoa(d), q))
    .sort((a, z) => gcMo(z) - gcMo(a) || (a.han < z.han ? -1 : a.han > z.han ? 1 : a.id - z.id));
  const hien = khop.slice(0, GC_TIM_MAX);
  return `<h2 class="sec" style="font-size:16px">Kết quả tìm: <span data-gcdem="1">${khop.length} đơn</span> <span class="sm muted" style="font-weight:400">· trên mọi đơn, kể cả đã xong và đã huỷ</span></h2>
    ${gcGon() ? `<div class="card" style="padding:0;overflow:hidden">${hien.map((d) => gcDong(d, '', true)).join('')}</div>` : hien.map((d) => gcCard(d, '', true)).join('')}
    ${khop.length > hien.length ? `<div class="sm muted" style="line-height:1.4">Còn ${khop.length - hien.length} đơn khớp nữa. Gõ thêm chữ để thu hẹp.</div>` : ''}
    ${khop.length ? '' : '<div class="muted" data-gckhong="1">Không có đơn nào khớp.</div>'}`;
}

/* Bảng chung: đơn của MỌI Tiểu đội trưởng. Phần đầu đứng yên khi cuộn, ba hàng:
     1. ô tìm (không cần gõ dấu) + nút giao đơn;
     2. mục lọc kèm số đơn: nhìn một lần là biết đang mở mấy đơn, trễ mấy, vướng mấy;
     3. cách gom: THEO TỔ (ai đang giữ gì), THEO HẠN (cái gì phải xong trước), THEO KHU (khu nào đang làm tới đâu).
   Cùng một bộ đơn, ba cách nhìn — người giao việc kiểm theo tổ, chỉ huy kiểm theo hạn và theo khu. Trong mỗi
   nhóm, đơn trễ và đơn vướng xếp lên đầu. */
const GC_XEM = [['to', 'Theo tổ'], ['han', 'Theo hạn'], ['khu', 'Theo khu']];
// danh sách gọn / thẻ, và các nhóm đang thu gọn: nhớ trên máy này
const gcGon = () => (S.gcGon != null ? S.gcGon : gcNho('kt:gcgon') === '1');
const gcThuDoc = () => { try { return JSON.parse(localStorage.getItem('kt:gcthu') || '[]'); } catch (e) { return []; } };
const gcXem = () => (GC_XEM.some((x) => x[0] === S.gcV) ? S.gcV : GC_XEM.some((x) => x[0] === gcNho('kt:gcv')) ? gcNho('kt:gcv') : 'to');
// nhóm của một đơn theo cách gom đang chọn: [khoá, tên nhóm, thứ tự]
function gcNhom(d, xem, G, dong) {
  if (xem === 'khu') {
    const i = ((G.muc && G.muc.khu) || []).findIndex((m) => m.ten === d.phan_khu);
    return [d.phan_khu || '', d.phan_khu || 'Chưa ghi phân khu', d.phan_khu ? (i < 0 ? 500 : i) : 999];
  }
  if (xem === 'han') {
    if (gcChoXuat(d)) return d.xuat_tt === 'cho' ? ['choxuat', 'Chờ duyệt xuất', 0] : ['chuaxuat', 'Xong, chưa xuất', 1];
    if (dong) return d.tt === 'xong' ? ['xong', 'Đã xuất', 0] : ['huy', 'Đã huỷ', 1];
    const n = soNgay(S.boot.today, d.han);
    return gcTre(d) ? ['tre', 'Trễ hạn', 0] : n <= 0 ? ['nay', 'Hôm nay', 1] : n === 1 ? ['mai', 'Ngày mai', 2] : n <= 7 ? ['tuan', 'Trong 7 ngày tới', 3] : ['sau', 'Sau 7 ngày', 4];
  }
  // theo tổ: một nhóm cho mỗi người làm (đơn nhiều người hiện trong nhóm của từng người)
  return gcNguoi(d).map((uid, i) => {
    const toi = uid === S.me.id, ten = Array.isArray(d.nguoi) && d.nguoi[i] ? d.nguoi[i].ten : d.uname;
    return ['u' + uid, ten + (toi ? ' (bạn)' : ''), toi ? 0 : 1, uid];
  });
}
function vGiaCong() {
  const G = S.gc;
  const top = head('Gia công cấu kiện', 'Đơn của mọi tiểu đội · ai cũng xem được');
  if (!G) return `${top}${panelWait('giacong')}`;
  const all = G.items || [];
  const mo = all.filter(gcMo), cuaToi = mo.filter(gcCuaToi);
  const F = [['mo', 'Đang mở', mo], ['toi', 'Của tôi', cuaToi], ['tre', 'Trễ', mo.filter(gcTre)], ['vuong', 'Vướng', mo.filter((d) => d.vuong)], ['dungyen', 'Đứng yên', mo.filter(gcDungYen)], ['tin', 'Có tin mới', all.filter((d) => gcTnMoi(d.id))],
    ['moi', 'Chưa nhận', mo.filter((d) => d.tt === 'moi')], ['xuat', 'Chưa xuất', all.filter(gcChoXuat)],
    ['dong', 'Đã xuất / huỷ', all.filter((d) => d.tt === 'huy' || (d.tt === 'xong' && d.xuat_tt === 'duyet'))]]
    // "Của tôi" chỉ có nghĩa với người đang giữ đơn
    .filter((f) => (f[0] !== 'toi' || cuaToi.length || S.gcF === 'toi') && (f[0] !== 'tin' || f[2].length || S.gcF === 'tin'));
  const cur = F.find((f) => f[0] === S.gcF) || F[0];
  const xem = gcXem(), dong = cur[0] === 'dong';
  const q = gcKhongDau(S.form.gcq).trim();
  const gap = (d) => (gcTre(d) || d.mo_lai || (d.vuong && d.vuong_dung) ? 0 : d.vuong ? 1 : gcDungYen(d) ? 2 : 3);
  const sx = dong ? (a, z) => z.cap_ts - a.cap_ts
    : cur[0] === 'xuat' ? (a, z) => (a.xong_ts || 0) - (z.xong_ts || 0)
    : (a, z) => gap(a) - gap(z) || (a.han < z.han ? -1 : a.han > z.han ? 1 : a.id - z.id);
  const by = {}, order = [];
  /* Đơn của NGƯỜI ĐANG XEM vừa bị huỷ mà họ chưa bấm "đã biết": đứng trên cùng ở mọi mục đơn còn mở — đây là
     việc gấp nhất của họ (dừng tay), không được để nó nằm khuất trong mục "Xong / huỷ". */
  const canBiet = dong ? [] : all.filter(gcCanBiet);
  const khoiBiet = canBiet.length ? `<div class="col gap6"><h2 class="sec" style="font-size:16px;color:var(--bad)">Không làm nữa <span class="sm muted" style="font-weight:400">· ${canBiet.length} đơn của bạn vừa bị huỷ, bấm Đã biết</span></h2>${canBiet.map((d) => gcCard(d, '', false)).join('')}</div>` : '';
  cur[2].slice().sort(sx).forEach((d) => {
    const nh = gcNhom(d, xem, G, dong);
    (xem === 'to' ? nh : [nh]).forEach(([k, ten, o, uid]) => {
      if (!by[k]) { by[k] = { ten, o, ds: [], uid }; order.push(k); }
      by[k].ds.push(d);
    });
  });
  order.sort((a, z) => by[a].o - by[z].o || String(by[a].ten).localeCompare(String(by[z].ten), 'vi'));
  const gon = gcGon(), thu = gcThuDoc();
  /* Chỉ dựng một số đơn mỗi lần (thẻ: 60, dòng gọn: 200), còn lại bấm "Hiện thêm": mỗi lần chạm là vẽ lại cả màn,
     mà vài trăm thẻ là vài trăm KB HTML — điện thoại yếu khựng thấy rõ. Số đếm ở tên nhóm vẫn là số đơn thật. */
  const buoc = gon ? 200 : 60;
  let con = S.gcHien || buoc, an = 0;
  const cat1 = (ds) => { const lay = ds.slice(0, Math.max(0, con)); con -= lay.length; an += ds.length - lay.length; return lay; };
  const nhom = order.map((k) => {
    const g = by[k], ds = g.ds, kt = xem + ':' + k, dong1 = thu.includes(kt), t = ds.filter(gcTre).length, v = ds.filter((d) => d.vuong && gcMo(d)).length;
    // nhóm "Trễ hạn" thì khỏi nhắc lại "n trễ"
    const dem = `${ds.length} đơn${t && k !== 'tre' ? `, <b style="color:var(--bad)">${t} trễ</b>` : ''}${v ? `, <b style="color:var(--warn)">${v} vướng</b>` : ''}`;
    const hetTdt = xem === 'to' && ds.some(gcMo) && !(G.tdt || []).some((u) => u.id === g.uid);
    // bấm tên nhóm để thu gọn / mở (app nhớ); thu gọn thì chỉ còn dòng tên nhóm kèm số đơn
    return `<div class="col gap6">
      <button class="sec row" style="font-size:16px;border:0;background:transparent;padding:10px 0;text-align:left;font-family:inherit;font-weight:700;color:${k === 'tre' ? 'var(--bad)' : 'inherit'};gap:6px;align-items:baseline" aria-expanded="${!dong1}" data-a="gcthu" data-k="${esc(kt)}"><span style="flex:none;width:14px">${dong1 ? '▸' : '▾'}</span><span style="min-width:0">${esc(g.ten)} <span class="sm muted" style="font-weight:400">· ${dem}</span></span></button>
      ${dong1 ? '' : `${hetTdt ? '<span class="sm b" style="color:var(--bad);line-height:1.4">Người này không còn là Tiểu đội trưởng đang dùng app: các đơn còn mở cần giao lại cho người khác.</span>' : ''}
      ${((hien) => (!hien.length ? '' : gon ? `<div class="card" style="padding:0;overflow:hidden">${hien.map((d) => gcDong(d, '', xem !== 'to')).join('')}</div>` : hien.map((d) => gcCard(d, '', xem !== 'to')).join('')))(cat1(ds))}`}</div>`;
  }).join('') + (an ? `<button class="btn full" data-a="gchienthem" data-v="${buoc}">Hiện thêm ${Math.min(an, buoc)} đơn (còn ${an} đơn chưa hiện)</button>` : '');
  // ai đang không có đơn nào mở: người giao việc nhìn là biết tiểu đội nào còn rảnh
  const ranh = cur[0] === 'mo' && xem === 'to' ? (G.tdt || []).filter((u) => !mo.some((d) => gcNguoi(d).includes(u.id))) : [];
  const trong = { mo: 'Chưa có đơn nào đang mở.', toi: 'Bạn không giữ đơn nào đang mở.', tre: 'Không có đơn nào trễ hạn.', vuong: 'Không có đơn nào đang vướng.', dungyen: 'Không có đơn nào đứng yên quá ' + GC_DUNG_YEN_NGAY + ' ngày.', tin: 'Không còn tin nào chưa đọc.', moi: 'Không có đơn nào chờ nhận.', dong: 'Chưa có đơn nào xuất hoặc huỷ trong 30 ngày gần đây.', xuat: 'Không có đơn nào đã xong mà chưa xuất.' }[cur[0]];
  const nho = 'style="flex:none;white-space:nowrap"';
  return `${top}
  <div class="col gap6 tbar" style="padding:6px 16px">
    <div class="row gap6"><input class="inp s f1" id="gcq" style="min-width:0" placeholder="Tìm: W23, x14, khu a tang 5, tên" autocomplete="off" data-model="gcq" value="${esc(S.form.gcq || '')}">${isQL() ? `<button class="btn s pri" ${nho} data-a="gcnew">+ Giao đơn</button>` : ''}${isAdmin() ? `<button class="btn s" ${nho} aria-label="Thiết lập danh mục" data-a="nav" data-s="gcsetup">⚙</button>` : ''}</div>
    <div class="row gap6" style="overflow-x:auto" data-sx="gcf">
      <button class="chip s on" ${nho} aria-label="Đổi cách gom" data-a="gcxem" data-v="${GC_XEM[(GC_XEM.findIndex((x) => x[0] === xem) + 1) % GC_XEM.length][0]}">${GC_XEM.find((x) => x[0] === xem)[1]} ⇄</button>
      <button class="chip s ${gon ? 'on' : ''}" ${nho} aria-pressed="${gon}" data-a="gcgon">☰ Gọn</button>
      <span style="flex:none;width:1px;align-self:stretch;background:var(--line)"></span>
      ${F.map((f) => `<button class="chip s ${cur[0] === f[0] ? 'on' : ''}" ${nho}${cur[0] === f[0] ? ' data-cur="1"' : ''} data-a="gcf" data-v="${f[0]}">${f[1]} ${f[2].length}</button>`).join('')}</div></div>
  <div class="f1 scroll pad col gap12" id="body">
    <div class="col gap12" data-gcds="1"${q ? ' style="display:none"' : ''}>${khoiBiet}${nhom || (khoiBiet ? '' : `<div class="muted">${trong}</div>`)}</div>
    <div class="col gap6" data-gctim="1"${q ? '' : ' style="display:none"'}>${gcTimKhoi(q)}</div>
    ${ranh.length && !q ? `<div class="sm muted" style="line-height:1.4">Đang không có đơn nào mở: ${esc(ranh.map((u) => u.name).join(', '))}</div>` : ''}
  </div>`;
}

// Một đơn: nội dung, tiến độ, nút theo quyền, và toàn bộ lịch sử cập nhật (mới nhất trước).
function vGcDon() {
  const D = S.gcDetail, d = D && D.don;
  const top = head(d ? esc(d.cau_kien) : 'Đơn gia công', d ? 'Giao cho ' + esc(d.uname) : '', 'giacong');
  if (!D) return `${top}${panelWait('gcdon')}`;
  const [ten, mau] = gcTT(d);
  const cuaToi = gcCuaToi(d), mo = gcMo(d), dangLam = d.tt === 'nhan' || d.tt === 'lam';
  const dong = (nhan, v) => (v ? `<div class="row" style="justify-content:space-between;gap:12px;align-items:flex-start"><span class="sm muted" style="flex:none">${nhan}</span><span style="text-align:right;min-width:0">${v}</span></div>` : '');
  const thongTin = `<div class="card col gap8">
    <div class="row" style="justify-content:space-between;gap:8px"><b style="font-size:18px">Tiến độ</b><span class="badge ${mau}">${ten}</span></div>
    ${d.tt === 'huy' ? `<b>${d.pct ? 'Dừng ở ' + d.pct + '%' : 'Chưa làm gì'}</b>` : gcBar(d.pct)}
    ${d.vuong && mo ? `<div class="card ${d.vuong_dung ? 'bad' : 'warn'} col gap6" style="padding:8px 12px"><b>Đang vướng${d.vuong_dung ? ' · tổ DỪNG HẲN' : ' · vẫn làm được phần khác'}</b><span>${esc(d.vuong)}</span><span class="sm">${d.vuong_ts ? 'Báo lúc ' + dmy(d.vuong_ts) + ' · ' : ''}${gcVuongXem(d)}</span></div>` : ''}
    ${d.mo_lai && mo ? `<div class="card bad col gap6" style="padding:8px 12px"><b>Đơn bị mở lại</b><span>${esc(d.mo_lai)}</span></div>` : ''}
    ${d.tt === 'huy' ? `<div class="card bad col gap6" style="padding:8px 12px"><b>Đơn đã huỷ · không cần làm nữa</b><span>${esc(d.huy_ly_do || '')}</span><span class="sm">${gcHuyAi(d)}</span></div>` : ''}
    ${dong('Cấu kiện', `<b>${esc(d.cau_kien)}</b>`)}${dong('Vị trí trục', d.truc ? `<b>${esc(d.truc)}</b>` : '')}${dong('Phân khu', esc(d.phan_khu || ''))}
    ${dong('Tầng', esc(gcTang(d.tang)))}${dong('Cote', esc(d.cote || ''))}${dong('Hạng mục', esc(d.hang_muc || ''))}
    ${dong('Cần xong', gcHan(d))}${dong('Nội dung', esc(d.noi_dung || ''))}
    ${dong('Người order', esc(d.od_nguoi || ''))}${dong('Đại đội order', esc(d.od_dd || ''))}
    ${dong('Giao cho', esc(d.uname))}${dong('Người giao', esc(d.giao_name) + ' · ' + dmy(d.ts))}
    ${d.tt === 'nhan' || d.tt === 'lam' ? dong('Người làm cập nhật', d.lam_ts ? gcLau(d.lam_ts) + ' trước' + (gcDungYen(d) ? ' · <b style="color:var(--warn)">đứng yên</b>' : '') : '') : ''}
    ${d.tt === 'xong' && d.xong_ts ? dong('Xong lúc', dmy(d.xong_ts)) : ''}
  </div>`;
  // việc của người được giao
  const pct = S.gcPct == null ? d.pct : S.gcPct;
  const cuaNguoiLam = !cuaToi || !mo ? ''
    : d.tt === 'moi' ? '<button class="btn pri full" style="min-height:60px;font-size:20px" data-a="gcnhan">NHẬN ĐƠN</button>'
    : `<div class="card col gap8"><b style="font-size:18px">Cập nhật tiến độ</b>
        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px">${GC_PCT.map((n) => `<button class="chip ${pct === n ? 'on' : ''}" style="padding:6px 2px" data-a="gcpct" data-v="${n}">${n}%</button>`).join('')}</div>
        <input class="inp s" id="gcnote" maxlength="200" placeholder="Ghi chú (không bắt buộc)" data-model="gcnote" value="${esc(S.form.gcnote || '')}">
        <button class="btn full" data-a="gctiendo">LƯU TIẾN ĐỘ</button>
        <button class="btn ok full" style="min-height:60px;font-size:20px" data-a="gcxong">XÁC NHẬN ĐÃ XONG</button></div>`;
  const bietBtn = gcCanBiet(d) ? '<button class="btn bad full" style="min-height:60px;font-size:20px" data-a="gcbiet">ĐÃ BIẾT, DỪNG LÀM</button><span class="sm muted" style="line-height:1.4">Bấm để người huỷ biết bạn đã thấy và đã dừng làm đơn này.</span>' : '';
  const vuongBtn = !cuaToi || !mo ? '' : d.vuong ? '<button class="btn full" data-a="gchetvuong">ĐÃ HẾT VƯỚNG</button>' : '<button class="btn bad full" data-a="gcvuong">Báo đang vướng</button>';
  const xemVuong = !cuaToi && isQL() && mo && d.vuong && !d.vuong_xem_ts ? '<button class="btn pri full" data-a="gcxemvuong">ĐÃ XEM, ĐANG XỬ LÝ VƯỚNG</button><span class="sm muted" style="line-height:1.4">Bấm để tổ biết lần báo vướng đã tới người lo.</span>' : '';
  const chiXem = !cuaToi && mo && !isQL() ? `<div class="sm muted" style="line-height:1.4">Đơn của ${esc(d.uname)}: chỉ người được giao mới cập nhật được. Bạn xem được tiến độ và lịch sử.</div>` : '';
  // việc của người giao đơn
  const ql = !isQL() ? '' : mo ? '<div class="row gap6"><button class="btn f1" data-a="gcedit">Sửa / giao lại</button><button class="btn bad f1" data-a="gchuy">Huỷ đơn</button></div>'
    : d.tt === 'xong' && d.xuat_tt !== 'duyet' ? '<button class="btn bad full" data-a="gcmolai">Mở lại đơn (chưa xong thật)</button>'
    // cùng luật với server: khôi phục đơn huỷ nhầm trong 7 ngày kể từ lúc huỷ
    : d.tt === 'huy' ? (Date.now() - (d.huy_ts || d.cap_ts) <= GC_KHOI_PHUC_MS ? '<button class="btn full" data-a="gckhoiphuc">Khôi phục đơn (huỷ nhầm)</button>' : '<span class="sm muted" style="line-height:1.4">Đơn huỷ đã quá 7 ngày, không khôi phục được nữa. Cần làm lại thì giao đơn mới giống đơn này.</span>') : '';
  /* TRAO ĐỔI VÀ LỊCH SỬ: một dòng thời gian, cũ ở trên, mới ở dưới, để tin nhắn nằm ngay cạnh mốc làm nó phát sinh
     ("Bình báo vướng: thiếu thép" rồi "Cv: thép D16 về lúc 14h"). Mốc của đơn là dòng xám nhỏ; tin nhắn là ô. */
  const trongDon = (uid) => gcNguoi(d).includes(uid);
  const moc = [{ ts: d.ts, html: `<b>${esc(d.giao_name)}</b> giao đơn` }].concat((D.log || []).map((l) => ({ ts: l.ts, html: `<b>${esc(l.uname)}</b> ${GC_VIEC[l.viec] || esc(l.viec)}${l.viec === 'tiendo' ? ' <b>' + l.pct + '%</b>' : ''}${l.note ? ': ' + esc(l.note) : ''}` })))
    .map((m) => ({ ...m, loai: 'moc' }));
  const tins = (D.tn || []).map((t) => ({ ...t, loai: 'tn' }));
  const dong2 = moc.concat(tins).sort((a, z) => a.ts - z.ts || (a.loai === 'moc' ? -1 : 1));
  const tinHtml = (t) => {
    const toi = t.user_id === S.me.id, moi = !toi && t.id > (D.doc || 0);
    const nhan = trongDon(t.user_id) ? '' : ` <span class="sm muted">· ${esc(roleTen(t.role))}</span>`;
    const thu = toi && !t.thu_hoi && Date.now() - t.ts < GC_TN_THU_HOI_MS ? ` · <button class="sm" style="border:0;background:transparent;color:var(--pri);text-decoration:underline;padding:0" data-a="gctnthu" data-id="${t.id}">Thu hồi</button>` : '';
    return `<div class="col" style="align-items:${toi ? 'flex-end' : 'flex-start'}"><div class="col" style="gap:3px;max-width:86%;padding:8px 12px;border-radius:14px;border:${moi ? '2px solid var(--bad)' : '1px solid var(--line)'};background:${toi ? '#DCE6F2' : '#fff'}">
      <span class="sm"><b>${toi ? 'Bạn' : esc(t.uname)}</b>${nhan} · <span class="muted">${dmy(t.ts)}</span>${t.can_tl ? ' · <b style="color:var(--warn)">Cần trả lời</b>' : ''}${thu}</span>
      ${t.thu_hoi ? '<i class="muted">Tin đã thu hồi</i>' : `<span style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(t.noi_dung)}</span>`}</div></div>`;
  };
  const ls = dong2.map((x) => (x.loai === 'tn' ? tinHtml(x) : `<div class="sm muted" style="text-align:center;line-height:1.35">${x.html} · ${dmy(x.ts)}</div>`)).join('');
  // ô nhắn ở đáy màn: trả lời nhanh một chạm; người giao (ngoài nhóm làm) bật được "Cần trả lời"
  const tnDuoc = gcTnDuoc(d), laNguoiGiao = !cuaToi && isQL();
  const oNhan = !tnDuoc ? '' : `<div class="sendbar col gap6">
    <div class="row gap6" style="overflow-x:auto">${GC_TN_NHANH[cuaToi ? 'lam' : 'giao'].map((x) => `<button class="chip s" style="flex:none;white-space:nowrap;min-height:36px;padding:2px 12px;font-size:15px" data-a="gctnq" data-v="${esc(x)}">${esc(x)}</button>`).join('')}</div>
    <div class="row gap6"><input class="inp s f1" id="gctn" style="min-width:0" maxlength="500" autocomplete="off" enterkeyhint="send" placeholder="${cuaToi ? 'Nhắn người giao…' : 'Nhắn ' + esc(gcTenNguoi(d, true)) + '…'}" data-model="gctn" data-enter="gctngui" value="${esc(S.form.gctn || '')}">
      ${laNguoiGiao ? `<button class="chip s ${S.gcTnCan ? 'on' : ''}" style="flex:none;min-height:44px;padding:2px 8px;font-size:14px;white-space:nowrap" aria-pressed="${!!S.gcTnCan}" data-a="gctncan">Cần trả lời</button>` : ''}
      <button class="btn s pri" style="flex:none" data-a="gctngui">Gửi</button></div></div>`;
  /* XUẤT: đơn đã xong. Chưa gửi: nút XUẤT cho người làm (lần trước bị từ chối thì ghi lý do). Chờ duyệt: đủ những gì
     tổ đã xác nhận, và nút duyệt / không duyệt cho CVKTHT trở lên (không phải người trong đơn). Đã xuất: ai duyệt. */
  const xuat = d.tt !== 'xong' ? '' : !d.xuat_tt ? `<div class="card ${gcXuatTre(d) ? 'bad' : 'warn'} col gap6" style="padding:10px 12px"><b>Đã xong, chưa xuất</b>
      <span class="sm">Xong ${d.xong_ts ? dmy(d.xong_ts) + ' (' + gcLau(d.xong_ts) + ' trước)' : ''}. Trước khi xuất: ký biên bản giao nhận, kiểm đếm, chụp ảnh gửi nhóm Zalo.</span>
      ${d.xuat_tu_choi ? `<span class="sm"><b>Lần trước không được duyệt:</b> ${esc(d.xuat_tu_choi)}</span>` : ''}
      ${cuaToi || gcCuaToi(d) ? '<button class="btn pri full" style="min-height:56px;font-size:19px" data-a="gcxuat">XUẤT</button>' : '<span class="sm muted">Chờ tổ làm đơn bấm Xuất.</span>'}</div>`
    : d.xuat_tt === 'cho' ? `<div class="card warn col gap6" style="padding:10px 12px"><b>Chờ duyệt xuất</b>
      <span class="sm">${esc(d.xuat_name || '')} gửi lúc ${d.xuat_ts ? dmy(d.xuat_ts) : ''}</span>
      <span><b>Xuất cho:</b> ${esc(d.xuat_cho || '')}</span>
      <span class="sm">✓ Đã ký biên bản giao nhận · ✓ Đã kiểm đếm · ✓ Đã chụp ảnh gửi nhóm</span>
      ${d.xuat_note ? `<span class="sm">Ghi chú: ${esc(d.xuat_note)}</span>` : ''}
      ${!gcCuaToi(d) && isQL() ? '<div class="row gap6"><button class="btn ok f1" data-a="gcduyetxuat">DUYỆT XUẤT</button><button class="btn bad f1" data-a="gctuchoixuat">Không duyệt</button></div>' : '<span class="sm muted">Chờ CVKTHT trở lên duyệt.</span>'}</div>`
    : `<div class="card ok col gap6" style="padding:10px 12px"><b>Đã xuất</b><span><b>Xuất cho:</b> ${esc(d.xuat_cho || '')}</span>
      <span class="sm">${d.xuat_name ? esc(d.xuat_name) + ' gửi ' + dmy(d.xuat_ts) + ' · ' : ''}${d.xuat_duyet_name ? esc(d.xuat_duyet_name) + ' duyệt ' + dmy(d.xuat_duyet_ts) : 'duyệt ' + (d.xuat_duyet_ts ? dmy(d.xuat_duyet_ts) : '')}</span></div>`;
  const choTl = d.cho_tl && mo ? `<div class="card warn col gap6" style="padding:8px 12px"><b>Chờ ${esc(gcTenNguoi(d))} trả lời</b><span class="sm">Người giao đã hỏi và cần câu trả lời. Xem ở mục Trao đổi bên dưới.</span></div>` : '';
  return `${top}<div class="f1 scroll pad col gap12" id="body">
    ${thongTin}${xuat}${choTl}${bietBtn}${xemVuong}${cuaNguoiLam}${vuongBtn}${chiXem}${ql}
    ${isQL() ? '<button class="btn full" data-a="gccopy">Giao đơn mới giống đơn này</button>' : ''}
    <h2 class="sec">Trao đổi và lịch sử${tins.length ? ` <span class="sm muted" style="font-weight:400">· ${tins.length} tin</span>` : ''}</h2><div class="col gap8">${ls}</div>
    ${tnDuoc ? '' : '<span class="sm muted" style="line-height:1.4">' + (gcCuaToi(d) || isQL() ? 'Đơn đã đóng quá 7 ngày, không trao đổi thêm được.' : 'Chỉ người làm đơn này và CVKTHT trở lên mới nhắn được. Bạn xem được toàn bộ trao đổi.') + '</span>'}
  </div>${oNhan}`;
}

/* Soạn đơn: giao mới hoặc sửa / giao lại. Làm sao cho giao một đơn nhanh nhất có thể, vì người giao thường
   giao cả loạt đơn của cùng một khu, một tầng:
   - CHỌN thay vì gõ: loại cấu kiện, phân khu, hạng mục lấy từ danh mục admin lập trước (màn Thiết lập);
   - TRỤC (bắt buộc) nhập bằng bốn ô số X từ–đến, Y từ–đến: bàn phím số, không phải đổi qua lại chữ / số /
     dấu; app tự ghép thành "X12-X17 / Y3-Y5". Trục không theo dạng X / Y thì bấm "Gõ tự do";
   - ô nào đoán được thì điền sẵn: hạn = ngày mai; loại cấu kiện, phân khu, tầng, hạng mục, người nhận = của
     lần giao trước;
   - nút GIAO đứng yên ở đáy, và "GIAO + ĐƠN TIẾP" giữ lại mọi thứ trừ số hiệu, trục và nội dung.
   Trạng thái: S.gcForm giữ các lựa chọn bấm (ck, khu, hm, user, buoi, trucTu), S.form giữ chữ đang gõ
   (gcck số hiệu / tên, gcx1 gcx2 gcy1 gcy2 hoặc gctruc, gctang, gcnd, gchan). */
const GC_HANQ = [[0, 'Hôm nay'], [1, 'Mai'], [2, '+2'], [3, '+3'], [7, '+7']];
const GC_O_TRUC = ['gcx1', 'gcx2', 'gcy1', 'gcy2', 'gct1', 'gct2'];
const gcNho = (k) => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
const gcMucTen = (loai) => ((S.gc && S.gc.muc && S.gc.muc[loai]) || []).map((m) => m.ten);
/* VỊ TRÍ TRỤC nhập bằng ô, ba phần TUỲ Ý KẾT HỢP — ghi phần nào thì có phần đó, cần ít nhất một:
     X từ – đến · Y từ – đến · Trục từ – đến.
   Phần "Trục" theo cách gọi ngoài công trường: ghi MỘT trục là cấu kiện nằm TRÊN trục đó ("Trục 6"), ghi HAI trục
   là nằm TRONG KHOẢNG giữa hai trục ("Trục 1-2"). Các phần nối bằng " / ":
     "X12-X17 / Y3-Y5" · "Trục 6" · "Trục 1-2" · "X12 / Trục C" · "X12-X17 / Y3 / Trục 6-7".
   Ô X, Y là số (bàn phím số); ô Trục nhận cả chữ (trục A, B, C). Không theo được dạng này thì bấm "Gõ tự do". */
function gcTrucGhep() {
  const o = (k) => String(S.form[k] || '').trim().toUpperCase().replace(/^(TRỤC|TRUC)\s*/, '');
  const p = (c, a, z) => (a ? c + a + (z && z !== a ? '-' + c + z : '') : '');
  const t1 = o('gct1'), t2 = o('gct2'), a = t1 || t2, z = t1 && t2 && t2 !== t1 ? t2 : '';
  return [p('X', o('gcx1'), o('gcx2')), p('Y', o('gcy1'), o('gcy2')), a ? 'Trục ' + a + (z ? '-' + z : '') : ''].filter(Boolean).join(' / ');
}
// cách nhập trục: 'xy' = theo ô (X / Y / Trục), 'tu' = gõ tự do
const gcTrucKieu = () => (S.gcForm && S.gcForm.trucKieu === 'tu' ? 'tu' : 'xy');
const gcTrucCua = () => (gcTrucKieu() === 'tu' ? String(S.form.gctruc || '').trim() : gcTrucGhep());
const gcTrucO1 = () => (gcTrucKieu() === 'tu' ? 'gctruc' : 'gcx1');
/* Đưa một chữ trục có sẵn (đơn đang sửa, đơn mẫu, nút gợi ý) vào form: tách từng phần " / " về đúng ô X, Y, Trục;
   phần nào không đọc được (hoặc lặp lại) thì để cả chữ ở ô gõ tự do. Trả về cách nhập đã chọn. */
function gcTrucDat(t) {
  const F = S.gcForm, v = String(t || '').trim();
  GC_O_TRUC.forEach((k) => delete S.form[k]); delete S.form.gctruc;
  F.trucKieu = 'xy'; F.trucTu = false;
  if (!v) return 'xy';
  const o = {};
  const ok = v.split(/\s*\/\s*/).every((p) => {
    let m = /^X(\d+[A-Z]?)(?:\s*-\s*X?(\d+[A-Z]?))?$/i.exec(p);
    if (m && !o.gcx1) { o.gcx1 = m[1]; if (m[2]) o.gcx2 = m[2]; return true; }
    m = /^Y(\d+[A-Z]?)(?:\s*-\s*Y?(\d+[A-Z]?))?$/i.exec(p);
    if (m && !o.gcy1) { o.gcy1 = m[1]; if (m[2]) o.gcy2 = m[2]; return true; }
    m = /^tr[ụu]c\s*([A-Z0-9']+)(?:\s*-\s*(?:tr[ụu]c\s*)?([A-Z0-9']+))?$/i.exec(p);
    if (m && !o.gct1) { o.gct1 = m[1]; if (m[2]) o.gct2 = m[2]; return true; }
    return false;
  });
  if (ok) Object.keys(o).forEach((k) => (S.form[k] = o[k].toUpperCase()));
  else { F.trucKieu = 'tu'; F.trucTu = true; S.form.gctruc = v; }
  return F.trucKieu;
}
/* GỢI Ý BỎ ĐƯỢC. Trục và tầng gợi ý lấy từ các đơn đã giao, nên một lần gõ sai là gợi ý sai nằm đó mãi. Người
   dùng bấm × để bỏ; bỏ chỉ trên máy mình (localStorage), không đụng đơn nào. Gợi ý quay lại nếu sau lúc bỏ lại có
   đơn mới dùng đúng giá trị đó (tức là nó đúng). */
const gcAnDoc = () => { try { return JSON.parse(localStorage.getItem('kt:gcan') || '{}'); } catch (e) { return {}; } };
function gcGoiY(items, f, loai, n) {
  const an = gcAnDoc()[loai] || {}, moi = {};
  items.forEach((d) => { const v = d[f]; if (v && (!moi[v] || d.ts > moi[v])) moi[v] = d.ts; });
  return Object.keys(moi).filter((v) => !(an[v] && an[v] >= moi[v])).sort((a, z) => moi[z] - moi[a]).slice(0, n);
}
const gcChipGoiY = (loai, v, on, a, nhan) => `<span class="row" style="flex:none;gap:0"><button class="chip s ${on ? 'on' : ''}" style="flex:none;white-space:nowrap;border-radius:999px 0 0 999px;padding-right:10px" data-a="${a}" data-v="${esc(v)}">${esc(nhan || v)}</button><button class="chip s" style="flex:none;border-radius:0 999px 999px 0;border-left:0;padding:6px 10px;color:var(--mut)" aria-label="Bỏ gợi ý ${esc(v)}" data-a="gcanq" data-l="${loai}" data-v="${esc(v)}">×</button></span>`;
/* Mở màn soạn. d = đơn để lấy nội dung: đơn đang sửa (sua = true) hoặc đơn mẫu để chép; không có d thì điền
   sẵn theo lần giao trước. Loại cấu kiện chưa tách ở đây (F.ck để undefined): phải có danh mục mới tách được,
   mà danh mục đi kèm bảng đơn — vGcForm tách khi đã có. */
function gcSoan(d, sua) {
  const b = S.boot;
  S.gcForm = { id: sua ? d.id : null, users: d ? gcNguoi(d) : gcNho('kt:gcuser').split(',').map(Number).filter(Boolean),
    usersCu: sua ? gcNguoi(d) : [], nguoiCu: sua && Array.isArray(d.nguoi) ? d.nguoi : [],
    buoi: d ? d.buoi || '' : '', khu: d ? d.phan_khu || '' : gcNho('kt:gckhu'), hm: d ? d.hang_muc || '' : gcNho('kt:gchm'),
    thieuCaoDo: !!(sua && !d.tang && !d.cote), ckDay: d ? d.cau_kien : null, khuCu: sua ? d.phan_khu || '' : '', hmCu: sua ? d.hang_muc || '' : '',
    trucKieu: 'xy', trucTu: false };
  Object.assign(S.form, { gcck: '', gctang: d ? d.tang || '' : gcNho('kt:gctang'), gccote: d ? d.cote || '' : '', gcnd: d ? d.noi_dung || '' : '',
    gcodn: d ? d.od_nguoi || '' : '', gcodd: d ? d.od_dd || '' : '',
    gchan: d && (sua || d.han >= b.today) ? d.han : congNgay(b.today, 1) });
  gcTrucDat(d ? d.truc || '' : '');
  go('gcform');
}
// tách "Dầm D3" thành loại "Dầm" + số hiệu "D3" theo danh mục; không khớp loại nào thì là "Khác"
function gcTachCk(F) {
  const ds = gcMucTen('ck').slice().sort((a, z) => z.length - a.length);
  if (F.ckDay == null) { const nho = gcNho('kt:gcck'); F.ck = ds.includes(nho) || nho === 'khac' ? nho : null; return; }
  const full = F.ckDay, low = full.toLowerCase();
  const hit = ds.find((t) => low === t.toLowerCase() || low.startsWith(t.toLowerCase() + ' '));
  F.ck = hit || 'khac';
  S.form.gcck = hit ? full.slice(hit.length).trim() : full;
}
const gcCauKien = (F) => { const t = String(S.form.gcck || '').trim(); return F.ck === 'khac' ? t : F.ck ? F.ck + (t ? ' ' + t : '') : ''; };
const gcFocus = (id) => { const e = document.getElementById(id); if (e) { e.focus(); try { e.setSelectionRange(e.value.length, e.value.length); } catch (er) { /* ô không hỗ trợ */ } } };
function vGcForm() {
  const G = S.gc, F = S.gcForm || {}, b = S.boot;
  const top = head(F.id ? 'Sửa đơn gia công' : 'Giao đơn gia công', F.id ? 'Đổi hạn, đổi nội dung hoặc giao cho người khác' : 'Giao cho một hoặc vài Tiểu đội trưởng', F.id ? 'gcdon' : 'giacong');
  if (!G) return `${top}${panelWait('gcform')}`;
  if (F.ck === undefined) gcTachCk(F);
  // người đang giữ đơn có thể vừa thôi làm Tiểu đội trưởng: vẫn hiện để giữ nguyên được
  const ds = (G.tdt || []).slice();
  if (!Array.isArray(F.users)) F.users = F.user ? [F.user] : [];
  // người đang làm đơn (khi sửa) có thể vừa thôi làm Tiểu đội trưởng: vẫn hiện để giữ nguyên được
  (F.nguoiCu || []).forEach((n) => { if (!ds.some((u) => u.id === n.id)) ds.unshift({ id: n.id, name: n.ten }); });
  // người nhận điền sẵn từ lần trước (hoặc từ đơn mẫu) mà nay không còn là Tiểu đội trưởng: bỏ chọn
  F.users = F.users.filter((i) => ds.some((u) => u.id === i));
  /* Phân khu, hạng mục: danh mục, cộng giá trị ĐƠN ĐANG SỬA đang mang nếu mục đó đã bị xoá khỏi danh mục (giữ
     nguyên được, đúng luật server). Giá trị nhớ từ lần trước mà không còn trong danh mục thì bỏ chọn. */
  const dsKhu = gcMucTen('khu'), dsHm = gcMucTen('hm');
  const kem = (list, cu) => (cu && !list.includes(cu) ? [cu].concat(list) : list);
  const khus = kem(dsKhu, F.khuCu), hms = kem(dsHm, F.hmCu);
  if (F.khu && !khus.includes(F.khu)) F.khu = '';
  if (F.hm && !hms.includes(F.hm)) F.hm = '';
  const cks = gcMucTen('ck');
  const han = fv('gchan', '');
  const cuon = 'style="overflow-x:auto"', dinh = 'style="flex:none;white-space:nowrap"';
  const tuy = '<span class="muted" style="font-weight:400">(không bắt buộc)</span>';
  const chuaCo = (ten) => `<span class="sm muted" style="line-height:1.4">Chưa có danh mục ${ten}. ${isAdmin() ? '<button class="sm b" style="border:0;background:transparent;color:var(--pri);text-decoration:underline;padding:0" data-a="nav" data-s="gcsetup">Thiết lập ngay</button>' : 'Nhờ admin thêm ở Gia công → nút ⚙.'}</span>`;
  // trục đã dùng gần đây (ưu tiên cùng phân khu đang chọn): loạt đơn liền nhau thường chung một dải trục
  const trucGoiY = gcGoiY((G.items || []).filter((d) => !F.khu || d.phan_khu === F.khu), 'truc', 'truc', 5);
  const tangGoiY = gcGoiY(G.items || [], 'tang', 'tang', 6);
  // người / đại đội order: nút theo danh mục (admin lập), cộng tên đã dùng gần đây mà chưa có trong danh mục
  const dsOdn = gcMucTen('od'), dsOdd = gcMucTen('dd');
  const odnGoiY = gcGoiY(G.items || [], 'od_nguoi', 'odn', 5).filter((t) => !dsOdn.includes(t)), oddGoiY = gcGoiY(G.items || [], 'od_dd', 'odd', 5).filter((t) => !dsOdd.includes(t));
  const odChon = (ds, k, a) => (ds.length ? `<div class="wrap">${ds.map((t) => `<button class="chip s ${String(S.form[k] || '').trim() === t ? 'on' : ''}" data-a="${a}" data-v="${esc(t)}">${esc(t)}</button>`).join('')}</div>` : '');
  const kieu = gcTrucKieu();
  const oTruc = (k, sau, chu) => `<input class="inp s" id="${k}" style="flex:1;min-width:0;text-align:center;padding:0 2px" ${chu ? 'autocapitalize="characters" maxlength="5"' : 'inputmode="numeric" maxlength="4"'} autocomplete="off" enterkeyhint="${sau ? 'next' : 'done'}" data-enter="${sau ? 'gcden' + sau : 'gcblur'}" data-model="${k}" value="${esc(S.form[k] || '')}">`;
  const nhan = (t) => `<b style="flex:0 0 40px">${t}</b>`, gach = '<span class="muted" style="flex:none">–</span>';
  const truc = kieu === 'tu'
    ? `<input class="inp s" id="gctruc" maxlength="60" placeholder="Ví dụ: lõi thang T2, A-D / 1-5" autocomplete="off" autocapitalize="characters" enterkeyhint="done" data-enter="gcblur" data-model="gctruc" value="${esc(S.form.gctruc || '')}">`
    : `<div class="row gap6">${nhan('X')}${oTruc('gcx1', 'x2')}${gach}${oTruc('gcx2', 'y1')}<span style="flex:0 0 8px"></span>${nhan('Y')}${oTruc('gcy1', 'y2')}${gach}${oTruc('gcy2', 't1')}</div>
      <div class="row gap6">${nhan('Trục')}${oTruc('gct1', 't2', 1)}${gach}${oTruc('gct2', '', 1)}<span class="sm muted" style="flex:1.6;line-height:1.25">1 trục: nằm trên trục · 2 trục: nằm giữa</span></div>
      <span class="sm">Ghi vào đơn: <b id="gctrucxem">${esc(gcTrucGhep() || 'chưa nhập')}</b> <span class="muted">· ghi phần nào cũng được</span></span>`;
  return `${top}<div class="f1 scroll pad col gap8" id="body">
    <b class="sm">Cấu kiện</b>
    <div class="wrap">${cks.map((c) => `<button class="chip s ${F.ck === c ? 'on' : ''}" data-a="gcckq" data-v="${esc(c)}">${esc(c)}</button>`).join('')}<button class="chip s ${F.ck === 'khac' ? 'on' : ''}" data-a="gcckq" data-v="khac">Khác</button></div>
    <input class="inp s" id="gcck" maxlength="70" placeholder="${F.ck === 'khac' ? 'Tên cấu kiện (bắt buộc), ví dụ: Bể nước, ram dốc' : 'Số hiệu, ví dụ: D3 (không bắt buộc)'}" autocomplete="off" enterkeyhint="next" data-enter="gcnext" data-model="gcck" value="${esc(S.form.gcck || '')}">
    <b class="sm">Vị trí trục</b>
    <div class="row gap6">${[['xy', 'Theo ô X / Y / Trục'], ['tu', 'Gõ tự do']].map(([k, l]) => `<button class="chip s ${kieu === k ? 'on' : ''}" style="flex:1;min-height:38px;padding:2px 4px;font-size:15px;white-space:nowrap" data-a="gctruck" data-v="${k}">${l}</button>`).join('')}</div>
    ${truc}
    ${trucGoiY.length ? `<div class="row gap6" ${cuon} data-sx="gctruc">${trucGoiY.map((t) => gcChipGoiY('truc', t, t === gcTrucCua(), 'gctrucq')).join('')}</div>` : ''}
    <b class="sm">Phân khu</b>
    ${khus.length ? `<div class="wrap">${khus.map((k) => `<button class="chip s ${F.khu === k ? 'on' : ''}" data-a="gckhu" data-v="${esc(k)}">${esc(k)}</button>`).join('')}</div>` : chuaCo('phân khu')}
    <b class="sm">Tầng / Cote <span class="muted" style="font-weight:400">(ghi ít nhất một; có tầng thì cote không bắt buộc)</span></b>
    <div class="row gap6"><input class="inp s" id="gctang" style="flex:1;min-width:0" maxlength="20" placeholder="Tầng: 1, 2, mái" autocomplete="off" enterkeyhint="next" data-enter="gcdencote" data-model="gctang" value="${esc(S.form.gctang || '')}">
      <input class="inp s" id="gccote" style="flex:1;min-width:0" maxlength="20" placeholder="Cote: +3.600" autocomplete="off" enterkeyhint="done" data-enter="gcblur" data-model="gccote" value="${esc(S.form.gccote || '')}"></div>
    ${tangGoiY.length ? `<div class="row gap6" ${cuon} data-sx="gctang">${tangGoiY.map((t) => gcChipGoiY('tang', t, gcTangChu(S.form.gctang) === t, 'gctangq')).join('')}</div>` : ''}
    <b class="sm">Hạng mục ${tuy}</b>
    ${hms.length ? `<div class="wrap">${hms.map((h) => `<button class="chip s ${F.hm === h ? 'on' : ''}" data-a="gchmq" data-v="${esc(h)}">${esc(h)}</button>`).join('')}</div>` : chuaCo('hạng mục')}
    <b class="sm">Giao cho <span class="muted" style="font-weight:400">(chọn tối đa ${GC_NGUOI_MAX} người: ca ngày, ca đêm cùng làm thì chọn cả hai)</span></b>
    ${ds.length ? `<div class="wrap">${ds.map((u) => `<button class="chip s ${F.users.includes(u.id) ? 'on' : ''}" aria-pressed="${F.users.includes(u.id)}" data-a="gcuser" data-v="${u.id}">${F.users.includes(u.id) ? '✓ ' : ''}${esc(u.name)}</button>`).join('')}</div>`
      : '<span class="sm muted">Chưa có tài khoản Tiểu đội trưởng nào. Admin tạo ở Thêm → Người dùng và PIN.</span>'}
    ${F.id && F.users.length && !F.users.some((i) => (F.usersCu || []).includes(i)) ? '<span class="sm" style="color:var(--warn);line-height:1.4">Giao hẳn cho người khác thì đơn về "Mới giao": người mới phải tự nhận đơn. Chỉ thêm / bớt người cùng làm thì đơn giữ nguyên.</span>' : ''}
    <b class="sm">Cần xong</b>
    <div class="row gap6" ${cuon} data-sx="gchan">${GC_HANQ.map(([n, l]) => `<button class="chip s ${han === congNgay(b.today, n) ? 'on' : ''}" ${dinh} data-a="gchanq" data-v="${n}">${l}</button>`).join('')}</div>
    <input class="inp s" type="date" id="gchan" data-model="gchan" data-change="gchan" min="${b.today}" value="${esc(han)}">
    <div class="row gap6">${GC_BUOI.map(([v, l]) => `<button class="chip s ${(F.buoi || '') === v ? 'on' : ''}" style="flex:1;padding:6px 4px;white-space:nowrap" data-a="gcbuoi" data-v="${v}">${l}</button>`).join('')}</div>
    <b class="sm">Nội dung, khối lượng ${tuy}</b>
    <input class="inp s" id="gcnd" maxlength="300" placeholder="Ví dụ: 2,4 tấn; D16 × 120 thanh, đai D8 a150" autocomplete="off" data-model="gcnd" value="${esc(S.form.gcnd || '')}">
    <b class="sm">Người order ${tuy}</b>
    ${odChon(dsOdn, 'gcodn', 'gcodnq')}
    <input class="inp s" id="gcodn" maxlength="60" placeholder="${dsOdn.length ? 'Hoặc gõ tên khác' : 'Họ tên người order'}" autocomplete="off" enterkeyhint="next" data-enter="gcdenodd" data-model="gcodn" value="${esc(S.form.gcodn || '')}">
    ${odnGoiY.length ? `<div class="row gap6" ${cuon} data-sx="gcodn">${odnGoiY.map((t) => gcChipGoiY('odn', t, String(S.form.gcodn || '').trim() === t, 'gcodnq')).join('')}</div>` : ''}
    <b class="sm">Đại đội order ${tuy}</b>
    ${odChon(dsOdd, 'gcodd', 'gcoddq')}
    <input class="inp s" id="gcodd" maxlength="40" placeholder="${dsOdd.length ? 'Hoặc gõ tên khác' : 'Ví dụ: Đại đội 2'}" autocomplete="off" enterkeyhint="done" data-enter="gcblur" data-model="gcodd" value="${esc(S.form.gcodd || '')}">
    ${oddGoiY.length ? `<div class="row gap6" ${cuon} data-sx="gcodd">${oddGoiY.map((t) => gcChipGoiY('odd', t, String(S.form.gcodd || '').trim() === t, 'gcoddq')).join('')}</div>` : ''}
  </div>
  <div class="sendbar row gap6">${F.id ? '<button class="btn pri" style="flex:1" data-a="gcsave">LƯU THAY ĐỔI</button>'
    : '<button class="btn" style="flex:1;padding:8px 4px;font-size:15px;white-space:nowrap" data-a="gcsave" data-v="tiep">GIAO + ĐƠN TIẾP</button><button class="btn pri" style="flex:1" data-a="gcsave">GIAO ĐƠN</button>'}</div>`;
}

/* Thiết lập danh mục (chỉ admin): phân khu, hạng mục, loại cấu kiện. Lập một lần, sau đó người giao đơn chỉ
   việc bấm chọn — và cả đơn vị gọi một khu bằng đúng một tên, nên gom "theo khu" và tìm kiếm mới đúng. */
const GC_MUC = [['khu', 'Phân khu', 'Người giao phải chọn một phân khu cho mỗi đơn.', 'Ví dụ: Khu A, Zone 2, Tháp T1'],
  ['hm', 'Hạng mục', 'Không bắt buộc khi giao đơn.', 'Ví dụ: Phần ngầm, Phần thân, Bể nước'],
  ['ck', 'Loại cấu kiện', '"Khác" luôn có sẵn để ghi tên cấu kiện ngoài danh mục.', 'Ví dụ: Dầm, Cột, Lanh tô'],
  ['vg', 'Lý do vướng', 'Tiểu đội trưởng bấm chọn khi báo vướng. "Khác" luôn có sẵn.', 'Ví dụ: Chờ cẩu, Thiếu đai'],
  ['od', 'Người order', 'Không bắt buộc khi giao đơn. Bấm chọn cho nhanh; vẫn gõ được tên ngoài danh mục.', 'Họ tên người order'],
  ['dd', 'Đại đội order', 'Không bắt buộc khi giao đơn. Bấm chọn cho nhanh; vẫn gõ được tên ngoài danh mục.', 'Ví dụ: Đại đội 2']];
function vGcSetup() {
  const G = S.gc;
  const top = head('Thiết lập gia công', 'Danh mục để chọn nhanh khi giao đơn', 'giacong');
  if (!G) return `${top}${panelWait('gcsetup')}`;
  const khoi = ([loai, tieu, mo, vd]) => {
    const ds = (G.muc && G.muc[loai]) || [];
    return `<div class="card col gap8"><b style="font-size:18px">${tieu} <span class="sm muted" style="font-weight:400">· ${ds.length} mục</span></b>
      <span class="sm muted" style="line-height:1.4">${mo}</span>
      ${ds.length ? `<div class="card" style="padding:0;overflow:hidden">${ds.map((m) => `<div class="li"><span>${esc(m.ten)}</span><button class="btn s bad" data-a="gcmucxoa" data-id="${m.id}">Xoá</button></div>`).join('')}</div>` : '<span class="sm" style="color:var(--warn)">Chưa có mục nào.</span>'}
      <div class="row gap6"><input class="inp s f1" id="gcm${loai}" style="min-width:0" maxlength="${loai === 'hm' || loai === 'od' ? 60 : 40}" placeholder="${vd}" autocomplete="off" data-model="gcm${loai}" value="${esc(S.form['gcm' + loai] || '')}"><button class="btn s pri" style="flex:none" data-a="gcmucadd" data-v="${loai}">Thêm</button></div></div>`;
  };
  return `${top}<div class="f1 scroll pad col gap12" id="body">
    ${GC_MUC.map(khoi).join('')}
    <span class="sm muted" style="line-height:1.4">Xoá một mục không đổi gì ở các đơn đã giao: đơn cũ vẫn mang tên đó, chỉ là không chọn được cho đơn mới nữa. Muốn đổi tên thì xoá rồi thêm lại.</span>
  </div>`;
}

/* Một việc trên một đơn (mặc định: đơn đang mở). Làm xong hay bị từ chối cũng tải lại — bị từ chối thường
   là vì đơn vừa đổi (người giao sửa hạn, giao lại cho người khác), màn hình phải bày đúng cái đang có.
   Đang ở bảng chung (bấm nút làm nhanh trên thẻ đơn) thì tải lại bảng, đang mở một đơn thì tải lại đơn đó. */
function gcDo(viec, body, okMsg, id = S.gcId) {
  const tai = async () => { if (S.screen === 'giacong') S.gc = await api('GET', '/giacong'); else S.gcDetail = await api('GET', '/giacong/' + id); };
  return act(async () => {
    let r;
    try { r = await api('POST', `/giacong/${id}/${viec}`, body); }
    catch (e) { if (!e.net) { try { await tai(); } catch (e2) { /* giữ bản đang có */ } } throw e; }
    S.gcPct = null; delete S.form.gcnote;
    /* Server đã ghi. Áp ngay trạng thái nó trả về vào bản đang có, rồi mới tải lại: nếu lần tải lại rớt
       mạng thì màn hình vẫn đúng và người dùng không bị báo lỗi cho một việc đã xong (bấm lại sẽ bị từ
       chối "đã nhận rồi", rất khó hiểu). Vòng tự làm mới sẽ tải lại phần còn thiếu. */
    const ap = (x) => { if (x && x.id === id) { x.tt = r.tt; x.pct = r.pct; } };
    ((S.gc && S.gc.items) || []).forEach(ap);
    if (S.gcDetail) ap(S.gcDetail.don);
    try { await Promise.all([tai(), loadBoot()]); } catch (e) { /* đã ghi xong */ }
  }, okMsg);
}

/* --- Quân số đầu ca ---
   Mỗi tổ (= một Tiểu đội trưởng) báo ở đầu mỗi ca: tổng quân số, nghỉ mấy người vì lý do gì, đi làm mấy
   người. Tổ làm cả hai ca thì báo hai lần. Không liên quan đếm thép. Quyền (server chặn thật, xem src/quanso.js):
     - Tiểu đội trưởng: chỉ thấy và chỉ ghi tổ mình, cho ca đang diễn ra hoặc ca kế tiếp;
     - CVKTHT trở lên: thấy mọi tổ (bước 1 của màn báo cáo ca) và đặt số thiết lập; app không còn màn ghi thay cho tổ
       (server vẫn nhận lần ghi thay, lùi 7 ngày).
   Làm sao cho báo xong trong nửa phút: tổng quân số theo số tổ tự khai hoặc lần báo trước, lý do nghỉ là nút bấm,
   số đi làm app tự tính (tổng − nghỉ), chỉ tổ làm cả hai ca mới phải gõ số người của ca. */
const CA_TEN = { 1: 'ca ngày', 2: 'ca đêm' };
// lý do nghỉ, chép từ src/quanso.js để đọc nhật ký; ô ghi thì dùng danh sách server gửi kèm (S.qs.lyDo)
const QS_LY_DO = [['om', 'ốm'], ['phep', 'nghỉ phép năm'], ['que', 'về quê'], ['gd', 'việc gia đình'], ['off', 'OFF luân phiên'], ['khac', 'lý do khác']];
const caKhoa = (c) => c.ngay + ':' + c.ca;
const caGoi = (c) => CA_TEN[c.ca] + ' ' + ngayNgan(c.ngay);
const hoa = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const soTu = (s) => parseInt(String(s == null ? '' : s).replace(/\D/g, ''), 10) || 0;
/* Ca đang diễn ra để Tổng quan nhắc, theo giờ server. App hay nằm mở qua giờ giao ca: qua mốc `den` của bản
   đang có thì nhìn sang cột ca kế (server gửi sẵn cả hai), không nhắc nhầm theo ca cũ trong lúc chờ tải lại. */
function qsCaNay() {
  const q = S.boot && S.boot.qs;
  if (!q) return null;
  const now = Date.now() + (S.boot.skew || 0), qua = now >= q.den;
  const han = qua ? q.hanKe : q.han;
  /* sap: ca KẾ TIẾP, chỉ nhắc Tiểu đội trưởng và chỉ trong một tiếng trước giờ vào ca — tổ ca đêm mở app lúc
     18h thấy luôn lời nhắc báo ca đêm, không phải đợi tới 18h30. */
  return { ca: qua ? q.ke : q.hien, da: (t) => (qua ? t.daKe : t.da), han, tre: now > han,
    sap: !qua && now >= q.den - 3600e3 ? { ca: q.ke, da: (t) => t.daKe, han: q.hanKe, tre: false } : null };
}
// tổ có làm ca này không, theo lần báo gần nhất (xem caCua ở src/quanso.js); chưa biết thì coi như có
const qsLamCa = (t, ca) => !t.ca || !t.ca.length || t.ca.includes(ca);
const qsCaCua = (rows) => { const s = new Set(); rows.forEach((r) => { if (r.lam > 0) s.add(r.ca); if (r.ca_kia > 0) s.add(r.ca === 1 ? 2 : 1); }); return [...s].sort(); };
const qsSoNghi = (nghi) => Object.values(nghi || {}).reduce((a, x) => a + (Number(x) || 0), 0);
const qsLyDoTxt = (nghi, lyDo) => lyDo.filter((l) => nghi[l[0]]).map((l) => nghi[l[0]] + ' ' + l[1]).join(', ');
// một dòng quân số đọc thành câu: "đi làm 8/19 · ca đêm 10 · nghỉ 1: 1 ốm"
function qsDong(r, lyDo) {
  const kia = CA_TEN[r.ca === 1 ? 2 : 1], n = qsSoNghi(r.nghi);
  if (!r.lam && !n && r.ca_kia) return 'cả tổ làm ' + kia;
  return [`đi làm ${r.lam}/${r.tong}`, r.ca_kia ? `${kia} ${r.ca_kia}` : '', n ? `nghỉ ${n}: ${qsLyDoTxt(r.nghi, lyDo)}` : 'không ai nghỉ', r.ghi_chu || ''].filter(Boolean).join(' · ');
}
/* THẺ BÁO QUÂN SỐ TRÊN TỔNG QUAN (chỉ Tiểu đội trưởng). Hai việc, tách hẳn nhau:
   1. LỊCH CA của tổ — Ca ngày / Ca đêm / Cả 2 ca, kèm thời hạn (đến khi đổi, 15 ngày, 30 ngày). Tổ trưởng đặt một
      lần, 15–30 ngày mới đổi. Chưa đặt hoặc hết hạn thì thẻ hỏi trước. Nhờ có lịch, thẻ CHỈ bày nút của ca tổ đang
      làm: không còn nút ca kia để bấm nhầm, app cũng không phải đoán tổ làm ca nào.
   2. BÁO QUÂN SỐ của ca đó — ngày đủ quân là MỘT chạm:
      - tổng quân số lấy theo lần báo trước (nút Đổi);
      - có người nghỉ thì mở tại chỗ: chạm lý do là thêm một người, hoặc gõ số vào ô cạnh lý do; ghi chú có sẵn ở đó;
      - "Như hôm qua" lấy lại danh sách nghỉ lần trước — nút phải tự bấm, không điền sẵn;
      - tổ làm CẢ 2 CA báo từng ca một (ca tới trước báo trước), mỗi ca ghi số người của tổ thuộc ca đó;
      - mất sóng lúc gửi: lưu trên máy (qsHangDoi), tự gửi khi có mạng; thẻ ghi "chờ gửi";
      - báo xong thẻ thành dòng "đã báo" kèm nút Sửa.
   Trạng thái thẻ ở S.qsH { mo, nghi, doiTong, sua, thu (đã bấm gửi), doiCa (đang đổi lịch ca), den (thời hạn đang
   chọn: 0 = đến khi đổi, 15, 30), som (báo sớm ca kế) }; ô đang gõ ở S.form (qhtong, qhbc, qhnote, qhn_<lý do>). */
const qhState = () => S.qsH || (S.qsH = { mo: false, nghi: {}, doiTong: false, sua: null, doiCa: false, den: 0 });
const qhBo = () => { S.qsH = null; Object.keys(S.form).filter((k) => /^qh(tong|bc|note|kt|n_)/.test(k)).forEach((k) => delete S.form[k]); };
const CA_LICH = { 1: 'Ca ngày', 2: 'Ca đêm', 3: 'Cả 2 ca' };
// ca theo lịch của tổ mình: 1, 2, 3 hoặc 0 (chưa đặt / hết hạn)
const qhLich = () => { const l = S.boot.qs.toi && S.boot.qs.toi.lich; return l && !l.het ? l.ca : 0; };
/* Lần báo LÚC MẤT SÓNG: lưu theo người (máy dùng chung vẫn gửi đúng tên), tự gửi khi có mạng (qsFlush). */
const QS_Q = 'kt:qsq';
const qsHangDoi = () => { try { const q = JSON.parse(localStorage.getItem(QS_Q) || '[]'); return Array.isArray(q) ? q : []; } catch (e) { return []; } };
const qsGhiHang = (q) => { try { localStorage.setItem(QS_Q, JSON.stringify(q)); } catch (e) { /* đầy bộ nhớ */ } };
let qsDangGui = false;
async function qsFlush() {
  if (qsDangGui || !S.me) return;
  const toi = qsHangDoi().filter((j) => j.uid === S.me.id);
  if (!toi.length) return;
  qsDangGui = true;
  let doi = false;
  try {
    for (const j of toi) {
      try { await api('PUT', '/quanso', j.body); doi = true; }
      catch (e) { if (e.net || e.retry) break; say('Lần báo quân số lúc mất sóng không gửi được: ' + e.message, true); doi = true; }
      qsGhiHang(qsHangDoi().filter((x) => x.id !== j.id));
    }
  } finally { qsDangGui = false; }
  if (doi) { try { await loadBoot(); } catch (e) { /* vòng sau */ } render(); }
}
/* Các ca báo được lúc này (ca tới trước đứng trước), kèm dòng đã báo, lần đang chờ gửi (mất sóng), hạn, và lần báo
   trước của ca đó. Qua giờ giao ca mà bản đang có chưa kịp tải lại thì chỉ còn ca kế. */
function qhCas() {
  const q = S.boot.qs, t = q.toi, now = Date.now() + (S.boot.skew || 0), qua = now >= q.den;
  const hang = qsHangDoi().filter((j) => j.uid === S.me.id);
  const cho = (x) => { const j = hang.find((h) => h.body.ngay === x.c.ngay && h.body.ca === x.c.ca); return j ? { ...x, cho: j.body } : x; };
  // sap: ca kế mới mở báo từ một tiếng trước giờ vào ca (qua giờ giao ca thì nó chính là ca đang diễn ra)
  const ke = { c: q.ke, row: t.ke, han: q.hanKe, truoc: t.truocKe, ke: !qua, mo: qua || now >= q.den - 3600e3, tu: q.den - 3600e3 };
  return (qua ? [ke] : [{ c: q.hien, row: t.hien, han: q.han, truoc: t.truocHien, mo: true }, ke]).map(cho);
}
// ca tổ đang phải báo trên thẻ: ca theo lịch chưa báo và đã tới giờ mở (hoặc tổ bấm "báo sớm"); đang sửa thì ca đang sửa
function qhDang() {
  const H = qhState(), cas = qhCas(), L = qhLich();
  if (H.sua) return cas.find((x) => caKhoa(x.c) === H.sua) || null;
  if (!L) return null;
  return cas.find((x) => (L === 3 || x.c.ca === L) && !x.row && !x.cho && (x.mo || H.som)) || null;
}
// số người của tổ thuộc ca đang báo (tổ 2 ca): theo lần báo trước cùng ca
const qhBcCu = (x) => (x && x.truoc && x.truoc.ca === x.c.ca ? x.truoc.lam + qsSoNghi(x.truoc.nghi) : '');
function qhTinh() {
  const H = qhState(), x = qhDang(), haiCa = qhLich() === 3 || (H.sua && x && x.row && x.row.ca_kia > 0);
  const tong = soTu(fv('qhtong', S.boot.qs.toi.tong || '')), nghi = qsSoNghi(H.nghi);
  const bc = haiCa ? soTu(fv('qhbc', qhBcCu(x))) : tong, lam = bc - nghi;
  const loi = !tong ? 'Ghi tổng quân số của tổ.' : haiCa && !bc ? 'Ghi số người của tổ thuộc ca này.' : bc > tong ? `Ca này ${bc} người, nhiều hơn tổng quân số ${tong}.`
    : lam < 0 ? `Nghỉ ${nghi} nhiều hơn số người của ca (${bc}).` : '';
  return { tong, nghi, lam, bc, haiCa, loi };
}
/* Chưa gõ tổng quân số (tổ báo lần đầu) không phải là lỗi: chỉ nói phải làm gì, chữ thường. Chữ đỏ dành cho số
   cộng sai, hoặc khi đã bấm gửi mà còn thiếu (qhgui đặt H.thu). */
const qhLoiDo = (T) => !!T.loi && ((T.tong > 0 && (!T.haiCa || T.bc > 0)) || qhState().thu);
const qhPrevTxt = (T) => ((!T.tong || (T.haiCa && !T.bc)) && !qhState().thu ? (T.tong ? 'Gõ số người của tổ thuộc ca này rồi bấm báo.' : 'Gõ tổng quân số của tổ rồi bấm báo.') : '') || T.loi
  || [`Đi làm ${T.lam}/${T.haiCa ? T.bc : T.tong}`, T.nghi ? `nghỉ ${T.nghi}: ${qsLyDoTxt(qhState().nghi, S.boot.qs.lyDo || QS_LY_DO)}` : 'không ai nghỉ'].join(' · ');
// khối chọn lịch ca: ba nút ca (chạm là lưu) + thời hạn
function qhLichHtml(het) {
  const H = qhState(), l = S.boot.qs.toi.lich, dang = l && !l.het ? l.ca : 0;
  /* TỔ TỰ KHAI BÁO hai thứ cùng một chỗ: tổng quân số của tổ và ca tổ làm. Gõ tổng trước, chạm ca là lưu cả hai. */
  return `<b style="font-size:18px">${het ? 'Lịch ca đã hết hạn. Tổ làm ca nào?' : dang ? 'Đổi ca của tổ' : 'Tổ làm ca nào?'}</b>
    <div class="row gap8"><span class="f1">Tổng quân số của tổ</span><input class="inp s" style="width:76px;flex:none;text-align:center;font-weight:700" id="qhkt" inputmode="numeric" maxlength="3" autocomplete="off" placeholder="Số" data-model="qhkt" value="${esc(fv('qhkt', (l && l.tong) || S.boot.qs.toi.tong || ''))}"></div>
    <div class="row gap6">${[1, 2, 3].map((c) => `<button class="btn ${dang === c ? 'pri' : ''}" style="flex:1;min-width:0;padding:8px 4px;white-space:nowrap" data-a="qhca" data-v="${c}">${CA_LICH[c]}</button>`).join('')}</div>
    <div class="row gap6" style="align-items:center"><span class="sm" style="flex:none">Áp dụng</span>${[[0, 'Đến khi đổi'], [15, '15 ngày'], [30, '30 ngày']].map(([n, t]) => `<button class="chip s f1 ${H.den === n ? 'on' : ''}" style="min-width:0;padding:6px 4px;white-space:nowrap" data-a="qhden" data-v="${n}">${t}</button>`).join('')}</div>
    <span class="sm muted" style="line-height:1.4">Gõ tổng quân số rồi chạm ca là lưu. Thẻ chỉ bày nút báo của ca tổ đang làm${dang ? '' : '; đổi lúc nào cũng được'}.</span>
    ${H.doiCa ? '<button class="btn s" data-a="qhthoi">Thôi</button>' : ''}`;
}
// dòng "đã báo" trên thẻ của tổ trưởng: "Đi làm 16/21 · nghỉ 5: 5 ốm"; tổ 2 ca: "9 người ca ngày: đi làm 8 · nghỉ 1: 1 ốm"
function qhDongGon(r, lyDo) {
  const n = qsSoNghi(r.nghi), nghi = n ? `nghỉ ${n}: ${qsLyDoTxt(r.nghi, lyDo)}` : 'không ai nghỉ';
  const ra = r.ca_kia > 0 && r.lam > 0 ? [`${r.lam + n} người ${CA_TEN[r.ca]}: đi làm ${r.lam}`, nghi] : [`Đi làm ${r.lam}/${r.tong}`, nghi];
  return ra.concat(r.ghi_chu || []).join(' · ');
}
function qsTheHome() {
  const q = S.boot && S.boot.qs;
  if (!q || !q.toi || S.me.role !== 'tieudoi') return '';
  const H = qhState(), lyDo = q.lyDo || QS_LY_DO, qc = qsCaNay(), toi = q.toi, L = qhLich();
  const to = q.to.find((t) => t.id === S.me.id) || { ca: [] };
  const cas = qhCas();
  // chưa đặt lịch ca, lịch hết hạn, hoặc đang đổi ca: chỉ hỏi ca
  if (!L || H.doiCa) return `<div class="card ${!L ? 'warn' : ''} col gap8">${qhLichHtml(!!(toi.lich && toi.lich.het))}</div>`;
  // việc phải làm ngay: ca tổ đang làm mà chưa báo (ca đang diễn ra, hoặc ca kế trong một tiếng trước giờ vào ca)
  const can = [qc, qc.sap].filter((k) => k && qsLamCa(to, k.ca.ca) && !k.da(to) && !cas.some((x) => x.cho && caKhoa(x.c) === caKhoa(k.ca)));
  const tre = can.some((k) => k.tre);
  /* Dòng tiêu đề nói luôn ca của tổ và thời hạn lịch ca; nút Đổi ca nằm cạnh — không tốn một dòng riêng. */
  const caTxt = CA_LICH[L].toLowerCase() + (toi.lich.den ? ', đến ' + esc(ngayNgan(toi.lich.den)) : '');
  const dauChu = can.length
    ? `<span class="col f1" style="gap:2px;min-width:0"><b style="font-size:18px">${can[0].tre ? 'Quá hạn báo quân số ' : 'Báo quân số '}${esc(caGoi(can[0].ca))}</b><span class="sm">Hạn ${hhmm(can[0].han)} · tổ làm ${caTxt}</span></span>`
    : `<span class="col f1" style="gap:2px;min-width:0"><b style="font-size:18px">Quân số tổ</b><span class="sm">Tổ làm ${caTxt}</span></span>`;
  const dau = `<div class="row gap8" style="align-items:flex-start">${dauChu}${H.sua ? '' : '<button class="chip s" style="flex:none" data-a="qhdoica">Đổi ca</button>'}</div>`;
  const lichO = '';
  const cuaToi = cas.filter((x) => L === 3 || x.c.ca === L || x.row || x.cho);
  const daBao = cuaToi.filter((x) => (x.row || x.cho) && H.sua !== caKhoa(x.c)).map((x) => x.cho && !x.row
    ? `<div class="sm" style="line-height:1.4"><b>${esc(hoa(caGoi(x.c)))}: chờ gửi (mất sóng)</b><br>Đi làm ${x.cho.lam}/${x.cho.tong} · app tự gửi khi có mạng</div>`
    : `<div class="row gap8"><span class="f1 sm" style="line-height:1.4"><b>${esc(hoa(caGoi(x.c)))}: đã báo</b> lúc ${hhmm(x.row.ts)}<br>${esc(qhDongGon(x.row, lyDo))}</span>
    ${H.sua ? '' : `<button class="chip s" style="flex:none" data-a="qhsua" data-v="${caKhoa(x.c)}">Sửa</button>`}</div>`).join('');
  const x = qhDang();
  if (!x) {
    // không có ca nào phải báo lúc này: nói ca kế mở báo lúc nào, kèm lối báo sớm
    const sau = cuaToi.find((y) => !y.row && !y.cho && !y.mo);
    const cho = sau ? `<div class="row gap8"><span class="f1 sm muted">${esc(hoa(caGoi(sau.c)))}: mở báo từ ${hhmm(sau.tu)}</span><button class="chip s" style="flex:none" data-a="qhsom">Báo sớm</button></div>` : '';
    // đã báo xong, không còn gì phải làm: lối sang thống kê của tổ (thay cho màn "Quân số tổ đã báo" lặp đúng thẻ này)
    return `<div class="card col gap8">${dau}${lichO}${daBao}${cho}<button class="sm" style="border:0;background:transparent;color:var(--pri);text-decoration:underline;padding:0;text-align:left" data-a="nav" data-s="qstk">Xem thống kê nghỉ của tổ ›</button></div>`;
  }
  const T = qhTinh();
  const oSo = (id, v, ph) => `<input class="inp s" style="width:76px;flex:none;text-align:center;font-weight:700" id="${id}" inputmode="numeric" maxlength="3" autocomplete="off" placeholder="${ph || ''}" data-model="${id}" value="${esc(v)}">`;
  const tongO = H.doiTong || !toi.tong
    ? `<div class="row gap8"><span class="f1">Tổ có bao nhiêu người?</span>${oSo('qhtong', fv('qhtong', toi.tong || ''), 'Số')}</div>`
    : '';
  // tổ 2 ca: mỗi ca ghi số người của tổ thuộc ca đó (điền sẵn theo lần báo trước cùng ca)
  const bcO = T.haiCa ? `<div class="row gap8"><span class="f1">Người của tổ làm ${CA_TEN[x.c.ca]}</span>${oSo('qhbc', fv('qhbc', qhBcCu(x)), 'Số')}</div>` : '';
  // "Như hôm qua": danh sách nghỉ của lần báo trước của ca đang báo; chỉ bày khi lần đó có người nghỉ và ô nghỉ còn trống
  const ng = x.truoc && x.truoc.ca === x.c.ca ? x.truoc : null;
  const homQua = ng && ng.ngay === congNgay(x.c.ngay, -1);
  const nhu = ng && qsSoNghi(ng.nghi) && !T.nghi ? `<button class="chip s" style="white-space:normal;text-align:left" data-a="qhnhu">${homQua ? 'Như hôm qua' : 'Như lần trước'}: ${esc(qsLyDoTxt(ng.nghi, lyDo))}</button>` : '';
  /* Một dòng cho cả hai con số hay nhìn nhất: tổ bao nhiêu người (chạm để đổi), nghỉ mấy người. */
  const tongChu = tongO ? '' : `<button style="border:0;background:transparent;padding:0;font:inherit;color:inherit;text-align:left" data-a="qhtong" aria-label="Đổi tổng quân số">Tổ <b>${T.tong}</b> người <span class="sm" style="color:var(--pri);text-decoration:underline">đổi</span></button> · `;
  const nghiO = `<div class="wrap" style="gap:6px;align-items:center"><span>${tongChu}nghỉ: <b id="qhnt">${T.nghi ? T.nghi + ' người' : 'không ai'}</b></span>
      <button class="chip s" style="white-space:nowrap" data-a="qhmo">${H.mo ? 'Xong' : T.nghi ? 'Sửa người nghỉ' : 'Có người nghỉ'}</button>${nhu}</div>`;
  // dòng tóm tắt chỉ cần khi có gì để tóm tắt: có người nghỉ, tổ 2 ca, đang gõ tổng, hoặc có lỗi
  const canTom = !!(T.loi || T.nghi || T.haiCa || tongO || H.mo);
  const mo = !H.mo ? '' : `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">${lyDo.map(([ma, ten]) => `<div class="row gap6" style="min-width:0">
        <button class="chip s f1 ${H.nghi[ma] ? 'on' : ''}" style="min-width:0;padding:6px 6px;border-radius:12px" data-a="qhnghi" data-k="${ma}" data-v="1">${esc(hoa(ten))}</button>
        ${H.nghi[ma] ? `<input class="inp s" style="width:48px;flex:none;text-align:center;padding:0 4px;font-weight:700" id="qhn_${ma}" inputmode="numeric" maxlength="3" autocomplete="off" data-model="qhn_${ma}" aria-label="Số người ${esc(ten)}" value="${H.nghi[ma]}">` : ''}</div>`).join('')}</div>
      <span class="sm muted">Chạm lý do để thêm 1 người, hoặc gõ số vào ô bên cạnh. Gõ 0 là bỏ.</span>
      <input class="inp s" id="qhnote" maxlength="200" autocomplete="off" placeholder="${H.nghi.khac ? 'Ghi rõ lý do khác (bắt buộc)' : 'Ghi chú, ví dụ: 1 người chăm bố ốm'}" data-model="qhnote" value="${esc(S.form.qhnote || '')}">`;
  return `<div class="card ${tre ? 'bad' : can.length ? 'warn' : ''} col gap8">${dau}${H.sua ? '' : lichO}${daBao}
    ${tongO}${bcO}${nghiO}${mo}
    ${canTom ? `<b id="qhprev" style="font-size:17px${qhLoiDo(T) ? ';color:var(--bad)' : T.loi ? ';font-weight:400' : ''}">${esc(qhPrevTxt(T))}</b>` : ''}
    <div class="row gap6"><button class="btn pri" style="flex:3;min-width:0;padding:8px 6px;line-height:1.2" data-a="qhgui" data-v="${caKhoa(x.c)}">${x.row ? 'GỬI LẠI ' : 'BÁO '}${esc(caGoi(x.c).toUpperCase())}</button>${H.sua || H.som ? '<button class="btn" style="flex:1;min-width:0;padding:8px 6px" data-a="qhthoi">Thôi</button>' : ''}</div>
  </div>`;
}
// số liệu của màn Quân số: bảng thiết lập (CVKTHT trở lên) hoặc các ca tổ mình đã báo (Tiểu đội trưởng)
async function qsTai() { S.qs = await api('GET', '/quanso'); }
/* CHỌN CA trên màn báo cáo ca (CVKTHT trở lên): ‹ ngày › đổi ngày, hai nút Ca ngày / Ca đêm
   đổi ca — chạm thẳng ca cần xem, không phải lùi từng ca một. Ca chưa tới (sau ca kế tiếp) thì khoá. Đang xem ca
   khác ca đang diễn ra thì có một dòng để về lại. C = { ngay, ca, hien, ke }; a = việc gọi khi chọn (data-v = khoá ca). */
function caChon(C, a) {
  const toi = (c) => caKhoa(c) <= caKhoa(C.ke), nay = S.boot ? S.boot.today : '';
  const tr = { ngay: congNgay(C.ngay, -1), ca: C.ca };
  let sau = { ngay: congNgay(C.ngay, 1), ca: C.ca };
  if (!toi(sau)) sau = { ngay: sau.ngay, ca: 1 };
  const bam = (c) => (toi(c) ? `data-a="${a}" data-v="${caKhoa(c)}"` : 'disabled');
  const mui = (c, chu, ten) => `<button class="chip s" style="flex:none;width:40px;padding:6px 0${toi(c) ? '' : ';opacity:.35'}" ${bam(c)} aria-label="${ten}">${chu}</button>`;
  const ca = (n) => {
    const c = { ngay: C.ngay, ca: n }, on = C.ca === n;
    return `<button class="chip s ${on ? 'on' : ''}" style="flex:none;white-space:nowrap;padding:6px 10px${on || toi(c) ? '' : ';opacity:.35'}" ${on ? 'aria-pressed="true"' : bam(c)}>${hoa(CA_TEN[n])}</button>`;
  };
  const goi = !nay ? '' : C.ngay === nay ? 'hôm nay' : C.ngay === congNgay(nay, -1) ? 'hôm qua' : C.ngay === congNgay(nay, 1) ? 'ngày mai' : '';
  return `<div class="row gap6">${mui(tr, '‹', 'Ngày trước')}<span class="col f1" style="min-width:0;align-items:center;line-height:1.15"><b style="white-space:nowrap">${esc(ngayNgan(C.ngay))}</b>${goi ? `<span class="sm muted">${goi}</span>` : ''}</span>${mui(sau, '›', 'Ngày sau')}${ca(1)}${ca(2)}</div>
    ${caKhoa(C) !== caKhoa(C.hien) ? `<button class="sm" style="border:0;background:transparent;color:var(--pri);text-decoration:underline;padding:0;text-align:left" data-a="${a}" data-v="${caKhoa(C.hien)}">Về ca đang diễn ra: ${esc(caGoi(C.hien))}</button>` : ''}`;
}
// phút trong ngày ↔ "HH:MM" của ô chọn giờ
const phutGio = (m) => two(Math.floor(m / 60)) + ':' + two(m % 60);
const gioPhut = (s) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim()); return m ? Number(m[1]) * 60 + Number(m[2]) : NaN; };
/* HAI LUỒNG, hai màn khác nhau dưới cùng một tên:
   - Tiểu đội trưởng: CHỈ XEM tổ mình đã báo ca nào. Khai báo (ca, tổng quân số) và báo quân số đầu ca đều làm ở MỘT
     chỗ: thẻ Quân số tổ ngay đầu Tổng quan (qsTheHome).
   - CVKTHT trở lên: bảng THIẾT LẬP — ca của từng tổ (đặt hộ được) và SỐ THIẾT LẬP (tổng, người ca ngày, người ca đêm),
     số của CVKTHT mà báo cáo ca dùng cho tổ chưa báo. Xem tổ nào đã báo và nhắc tổ chưa báo thì ở bước 1 của màn
     Báo cáo ca. Hai người sửa cùng một tổ thì người lưu sau bị từ chối và thấy số người kia vừa đặt (server chặn theo ts). */
function vQuanSo() {
  const Q = S.qs, ql = isQL();
  // mở từ màn báo cáo ca (nút thiết lập) thì nút quay lại về đúng báo cáo đang soạn
  const top = head(ql ? 'Thiết lập quân số' : 'Quân số tổ đã báo', !Q ? '' : ql ? 'Ca và số quân từng tổ' : 'Báo ở thẻ Quân số tổ, đầu Tổng quan', ql && S.qsVe === 'baocaoca' ? 'baocaoca' : 'more');
  if (!Q) return `${top}${panelWait('quanso')}`;
  if (!ql) {
    const the = (Q.chon || []).slice().sort((a, z) => a.ca - z.ca).map((c) => `<div class="card col" style="gap:4px;padding:14px">
      <span class="row" style="justify-content:space-between;gap:8px"><b style="font-size:20px">${esc(hoa(caGoi(c)))}</b>${c.row ? '<span class="badge ok" style="flex:none">Đã báo</span>' : '<span class="badge warn" style="flex:none">Chưa báo</span>'}</span>
      <span class="sm">${hhmm(c.gio.tu)}–${hhmm(c.gio.den)} · báo trước ${hhmm(c.han)}</span>
      ${c.row ? `<span class="sm" style="line-height:1.4">${esc(hoa(qsDong(c.row, Q.lyDo)))}</span>` : ''}</div>`).join('');
    return `${top}<div class="f1 scroll pad col gap8" id="body">
      ${!Q.tdt.length ? '<div class="muted">Chỉ Tiểu đội trưởng báo quân số của tổ mình.</div>' : `${the}
      <span class="sm muted" style="line-height:1.4">Tổ trưởng tự khai báo ca, tổng quân số và báo quân số đầu mỗi ca ở thẻ <b>Quân số tổ</b> ngay đầu Tổng quan.</span>
      <button class="btn full" data-a="nav" data-s="home">VỀ TỔNG QUAN ĐỂ BÁO</button>`}</div>`;
  }
  const ds = Q.tdt.slice();
    /* THIẾT LẬP dạng BẢNG GỌN: mỗi tổ một dòng (tên, ca, tổng, ca ngày, ca đêm), MỘT nút "Lưu tất cả" ở đáy —
       9 tổ vừa một màn, không phải cuộn qua 9 thẻ với 9 nút Lưu. Số XÁM là số gợi ý theo lần tổ báo gần nhất, CHƯA
       lưu (báo cáo ca chưa dùng); bấm Lưu tất cả là nhận luôn các gợi ý đó. Ô của ca tổ không làm thì khoá. */
    const tieuDe = Q.tdt.length ? `<div style="display:grid;grid-template-columns:minmax(0,1fr) 74px 50px 50px 50px;gap:6px;align-items:center" class="sm muted"><span>Tổ</span><span>Ca</span><span style="text-align:center">Tổng</span><span style="text-align:center">Ngày</span><span style="text-align:center">Đêm</span></div>` : '';
    if (S.qsSx) ds.sort((a, z) => S.qsSx.indexOf(a.id) - S.qsSx.indexOf(z.id));
    const cuaTdt = ds;
    const o = (id, v, goiY, khoa) => `<input class="inp s" style="text-align:center;padding:0 2px;min-width:0;width:100%;font-weight:${goiY ? 400 : 700}${goiY ? ';color:var(--mut)' : ''}${khoa ? ';background:#ECE9E1;color:var(--mut)' : ''}" id="${id}" inputmode="numeric" maxlength="3" autocomplete="off" data-model="${id}" value="${esc(v)}"${khoa ? ' disabled' : ''}>`;
    const dong = cuaTdt.map((u) => {
      if (S.qsSx) return `<div class="row gap6" style="padding:6px 0;border-bottom:1px solid var(--line)"><b class="f1" style="min-width:0">Tổ ${esc(u.name)}</b><button class="chip s" style="flex:none" data-a="qssx" data-id="${u.id}" data-v="-1" aria-label="Lên">↑</button><button class="chip s" style="flex:none" data-a="qssx" data-id="${u.id}" data-v="1" aria-label="Xuống">↓</button></div>`;
      const k = 'tl_' + u.id + '_', tl = (Q.tl || {})[u.id], d = qsTlMacDinh(u.id);
      // ca đang chọn trong ô (chưa lưu) hoặc ca theo lịch; 0 = chưa đặt
      const L = Number(fv(k + 'c', qsLichCa(Q.lich, u.id, Q.hien.ngay))) || 0;
      const gy = (hau) => !tl && S.form[k + hau] === undefined && String(d[hau === 't' ? 'tong' : hau === '1' ? 's1' : 's2']) !== '';
      /* NGƯỜI NGHỈ theo lý do, từng ca tổ làm: một dòng tóm tắt dưới mỗi tổ, chạm là mở ô ghi (một lúc một tổ). Báo cáo
         ca của tổ chưa báo lấy đúng các số này: "nghỉ 4 cn — 2 ốm, 2 về quê". */
      // tổ chưa đặt ca: theo ô số người đang có của từng ca
      const coCa = [1, 2].filter((c) => (L ? L === 3 || L === c : soTu(fv(k + c, c === 1 ? d.s1 : d.s2)) > 0));
      const cas = coCa.length ? coCa : [1, 2], moN = S.tlMo === u.id;
      const tom = cas.map((c) => { const N = qsTlNghi(u.id, c), n = qsSoNghi(N.nghi); return `${cas.length > 1 ? (c === 1 ? 'ngày ' : 'đêm ') : ''}${n ? n + ' (' + bcLyDo({ nghi: N.nghi, ghi_chu: N.gc }, Q.lyDo) + ')' : 'chưa ghi'}`; }).join(' · ');
      const nghiO = `<button class="sm" style="grid-column:1 / -1;border:0;background:transparent;padding:0;text-align:left;font:inherit;font-size:14px;line-height:1.35;color:var(--pri)" data-a="tlnghimo" data-id="${u.id}" aria-expanded="${moN}">Nghỉ: ${esc(tom)} <span style="text-decoration:underline">${moN ? 'xong' : 'sửa'}</span></button>
        ${!moN ? '' : `<div class="col gap6" style="grid-column:1 / -1;padding:2px 0 6px">${cas.map((c) => {
          const N = qsTlNghi(u.id, c);
          return `<span class="sm b">Nghỉ ${CA_TEN[c]}</span><div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">${Q.lyDo.map(([ma, ten]) => `<div class="row gap6" style="min-width:0">
            <button class="chip s f1 ${N.nghi[ma] ? 'on' : ''}" style="min-width:0;padding:6px 6px;border-radius:12px" data-a="tlnghi" data-id="${u.id}" data-ca="${c}" data-k="${ma}">${esc(hoa(ten))}</button>
            ${N.nghi[ma] ? `<input class="inp s" style="width:48px;flex:none;text-align:center;padding:0 4px;font-weight:700" id="${k}n${c}_${ma}" inputmode="numeric" maxlength="3" autocomplete="off" data-model="${k}n${c}_${ma}" aria-label="Số người ${esc(ten)} ${CA_TEN[c]}" value="${N.nghi[ma]}">` : ''}</div>`).join('')}</div>
          ${N.nghi.khac ? `<input class="inp s" id="${k}g${c}" maxlength="200" autocomplete="off" placeholder="Ghi rõ lý do khác (bắt buộc)" data-model="${k}g${c}" value="${esc(N.gc)}">` : ''}`;
        }).join('')}<span class="sm muted">Chạm lý do để thêm 1 người, hoặc gõ số vào ô bên cạnh. Gõ 0 là bỏ. Xong bấm Lưu tất cả.</span></div>`}`;
      return `<div style="display:grid;grid-template-columns:minmax(0,1fr) 74px 50px 50px 50px;gap:6px;align-items:center;padding:5px 0;border-bottom:1px solid var(--line)">
        <b style="min-width:0;font-size:15px;line-height:1.25;overflow-wrap:anywhere">${esc(u.name)}</b>
        <select class="inp s" style="padding:0 2px;font-size:15px;min-width:0;width:100%" id="${k}c" data-model="${k}c" data-change="tlca" aria-label="Ca của tổ ${esc(u.name)}">${[[0, '—'], [1, 'Ngày'], [2, 'Đêm'], [3, '2 ca']].filter(([c]) => c || !L).map(([c, t]) => `<option value="${c}"${L === c ? ' selected' : ''}>${t}</option>`).join('')}</select>
        ${o(k + 't', fv(k + 't', d.tong), gy('t'))}${o(k + '1', L === 2 ? '' : fv(k + '1', d.s1), gy('1'), L === 2)}${o(k + '2', L === 1 ? '' : fv(k + '2', d.s2), gy('2'), L === 1)}${nghiO}</div>`;
    }).join('');
    const moi = Object.entries(Q.tl || {}).sort((a, z) => z[1].ts - a[1].ts)[0];
    const tenTo = (id) => (Q.tdt.find((u) => u.id === Number(id)) || {}).name || '';
    const coGoiY = !S.qsSx && cuaTdt.some((u) => !(Q.tl || {})[u.id] && qsTlMacDinh(u.id).tong !== '');
    // dòng TỔNG của mọi tổ, chạy theo số đang gõ (xem bộ bắt sự kiện input)
    const tg = qsTlTong(), oT = (id, v) => `<b id="${id}" style="text-align:center">${v}</b>`;
    const tongDong = S.qsSx || cuaTdt.length < 2 ? '' : `<div style="display:grid;grid-template-columns:minmax(0,1fr) 74px 50px 50px 50px;gap:6px;align-items:center;padding:8px 0 2px"><b style="grid-column:1 / 3">Tổng ${cuaTdt.length} tổ</b>${oT('tlS_t', tg.tong)}${oT('tlS_1', tg.s1)}${oT('tlS_2', tg.s2)}</div>`;
    return `${top}<div class="f1 scroll pad col gap8" id="body">
      ${S.qsSx ? '<div class="card warn col gap6"><b>Đang xếp thứ tự tổ</b><span class="sm">Thứ tự này dùng cho bảng quân số và báo cáo ca.</span><div class="row gap6"><button class="btn s pri f1" data-a="qssxluu">Lưu thứ tự</button><button class="btn s f1" data-a="qssxthoi">Thôi</button></div></div>'
        : '<span class="sm muted" style="line-height:1.4">Ca của từng tổ, và số quân CVKTHT đặt: báo cáo ca dùng số này khi tổ <b>chưa báo</b>.</span>'}
      ${Q.tdt.length ? `<div class="card col" style="gap:0;padding:8px 12px">${S.qsSx ? '' : tieuDe}${dong}${tongDong}</div>` : '<div class="muted">Chưa có tài khoản Tiểu đội trưởng nào. Admin tạo ở Thêm → Người dùng và PIN.</div>'}
      ${coGoiY ? '<span class="sm muted" style="line-height:1.4">Số <span style="color:var(--mut)">xám</span> là gợi ý theo số tổ tự khai hoặc lần tổ báo gần nhất, <b>chưa lưu</b>. Bấm Lưu tất cả để dùng.</span>' : ''}
      ${moi && !S.qsSx ? `<span class="sm muted" style="line-height:1.4">Sửa gần nhất: ${esc(moi[1].by_name || '')} · tổ ${esc(tenTo(moi[0]))} · ${dmy(moi[1].ts)}</span>` : ''}
      ${Q.tdt.length > 1 && !S.qsSx ? '<button class="sm" style="border:0;background:transparent;color:var(--pri);text-decoration:underline;padding:0;text-align:left" data-a="qssxmo">Xếp thứ tự tổ</button>' : ''}
      ${S.qsSx ? '' : !S.qsHanMo ? `<div class="row gap8 sm muted"><span class="f1">Hạn báo: ca ngày trước ${phutGio(Q.hanPhut[0])}, ca đêm trước ${phutGio(Q.hanPhut[1])}</span><button class="chip s" style="flex:none" data-a="qshanmo">Đổi</button></div>` : `<div class="card col gap6"><b>Hạn báo quân số</b>
      <div class="row gap8"><div class="col f1" style="gap:4px"><span class="sm">Ca ngày, trước</span><input class="inp s" type="time" id="qsh1" data-model="qsh1" value="${esc(fv('qsh1', phutGio(Q.hanPhut[0])))}"></div>
        <div class="col f1" style="gap:4px"><span class="sm">Ca đêm, trước</span><input class="inp s" type="time" id="qsh2" data-model="qsh2" value="${esc(fv('qsh2', phutGio(Q.hanPhut[1])))}"></div></div>
      <div class="row gap6"><button class="btn s f1" data-a="qshan">Lưu hạn báo</button><button class="btn s" style="flex:none" data-a="qshanmo">Thôi</button></div>
      <span class="sm muted" style="line-height:1.4">Quá giờ này mà tổ chưa báo thì thẻ nhắc ở Tổng quan chuyển đỏ. Báo muộn vẫn ghi được.</span></div>`}
    </div>${Q.tdt.length && !S.qsSx ? '<div class="sendbar"><button class="btn pri full" data-a="qstlluu">LƯU TẤT CẢ</button></div>' : ''}`;
}
// ca theo lịch của một tổ vào một ngày: 1, 2, 3 hoặc 0 (chưa đặt / hết hạn)
const qsLichCa = (lich, uid, ngay) => { const r = (lich || {})[uid]; return r && [1, 2, 3].includes(r.ca) && (!r.den || ngay <= r.den) ? r.ca : 0; };
/* TỔNG QUÂN SỐ CỦA MỘT TỔ theo chính tổ đó, khi ca đang xem chưa có dòng báo: số MỚI HƠN trong hai số — số tổ tự khai
   (lich.tong) và lần tổ báo gần nhất (tr). Một luật dùng chung cho thẻ báo của tổ (qsBoot ở server), gợi ý trong bảng
   thiết lập và tổng quân số của báo cáo ca. */
const toTongKhai = (lich, tr, uid) => { const l = (lich || {})[uid]; return l && l.tong && (!tr || !tr.ts || l.ts > tr.ts) ? l.tong : tr ? tr.tong : 0; };
/* Số hiện sẵn trong ô thiết lập của một tổ: số đã thiết lập; chưa có thì gợi ý theo số TỔ TỰ KHAI, rồi tới lần tổ báo
   gần nhất, kể cả lần báo của ca đang diễn ra (tổ một ca: cả tổ làm ca đó).
   Tổ MỘT CA theo ca ĐANG CHỌN trong ô (chưa lưu cũng tính): vừa đổi ca (Ngày ↔ Đêm, hai ca → một ca), hoặc số đã lưu
   của ca đó là 0, thì cả tổ làm ca đó — ô của ca đó lấy theo tổng đang hiện. Trước đây ô lấy số đã lưu của ca mới
   (là 0), đổi ca rồi Lưu tất cả là tổ thành 0 người. */
function qsTlMacDinh(uid) {
  const Q = S.qs, tl = (Q.tl || {})[uid], k = 'tl_' + uid + '_', Lluu = qsLichCa(Q.lich, uid, Q.hien.ngay), L = Number(fv(k + 'c', Lluu)) || 0;
  const tr = Q.rows.filter((x) => x.user_id === uid).concat(Q.truoc.filter((x) => x.user_id === uid)).sort((a, z) => z.ts - a.ts)[0];
  const tong = tl ? tl.tong : toTongKhai(Q.lich, tr, uid) || '', tongO = fv(k + 't', tong);
  // chưa đặt ca: cả tổ làm đúng ca của lần báo gần nhất (lần đó không chia ca)
  const caCa = (c) => (L === c || (!L && tr && tr.ca === c && tr.lam > 0 && !tr.ca_kia) ? tongO : '');
  if (!tl) return { tong, s1: caCa(1), s2: caCa(2) };
  const doi = (c) => L === c && (Lluu !== c || !tl['s' + c]);
  return { tong, s1: doi(1) ? tongO : tl.s1, s2: doi(2) ? tongO : tl.s2 };
}
// người nghỉ theo lý do của một tổ ở một ca trong bảng thiết lập: số đang chọn (chưa lưu) đè lên số đã lưu
function qsTlNghi(uid, ca) {
  const tl = (S.qs.tl || {})[uid] || {}, cu = tl['n' + ca] || {}, nghi = {};
  (S.qs.lyDo || QS_LY_DO).forEach(([ma]) => { const v = soTu(fv(`tl_${uid}_n${ca}_${ma}`, cu[ma] || 0)); if (v) nghi[ma] = v; });
  return { nghi, gc: String(fv(`tl_${uid}_g${ca}`, tl['gc' + ca] || '')).trim() };
}
/* Tổng của bảng thiết lập theo số ĐANG HIỆN trong các ô (đã lưu, gợi ý, hoặc đang gõ dở), tính như lúc lưu (qstlluu):
   tổ một ca mà bỏ trống số ca thì cả tổ làm ca đó. */
function qsTlTong() {
  const Q = S.qs, ra = { tong: 0, s1: 0, s2: 0 };
  for (const u of Q.tdt) {
    const k = 'tl_' + u.id + '_', d = qsTlMacDinh(u.id), L = Number(fv(k + 'c', qsLichCa(Q.lich, u.id, Q.hien.ngay))) || 0;
    const so = (hau, mac) => { const v = String(fv(k + hau, mac)).trim(); return v === '' ? null : soTu(v); };
    const tong = so('t', d.tong) || 0, s1 = L === 2 ? 0 : so('1', d.s1), s2 = L === 1 ? 0 : so('2', d.s2);
    ra.tong += tong; ra.s1 += L === 1 && s1 == null ? tong : s1 || 0; ra.s2 += L === 2 && s2 == null ? tong : s2 || 0;
  }
  return ra;
}
// gửi một tin trên đơn đang mở; gửi xong cuộn xuống tin vừa gửi
function gcTnGui(nd, canTl) {
  if (!nd) { say('Gõ nội dung rồi bấm Gửi.', true); render(); return gcFocus('gctn'); }
  const id = S.gcId;
  return act(async () => {
    await api('POST', `/giacong/${id}/tn`, { noi_dung: nd, can_tl: canTl ? 1 : 0 }, 0, ['/giacong/' + id]);
    delete S.form.gctn; S.gcTnCan = false;
    try { S.gcDetail = await api('GET', '/giacong/' + id); S.gcXuong = true; gcDocXong(); } catch (e) { /* đã gửi; vòng tự làm mới tải lại */ }
  });
}
/* HỘP XUẤT: tổ phải tick đủ ba việc (ký giao nhận, kiểm đếm, chụp ảnh gửi nhóm) và ghi xuất cho ai / vị trí lắp
   dựng mới gửi được. S.gcXu = { id, bb, dem, anh }; chữ ở S.form.gcxcho, gcxnote. */
function gcXuatHtml() {
  const X = S.gcXu;
  if (!X || S.ask) return '';
  const d = [].concat((S.gc && S.gc.items) || [], S.gcDetail ? [S.gcDetail.don] : []).find((x) => x && x.id === X.id);
  const o = (k, t) => `<button class="chip s" style="justify-content:flex-start;gap:10px;font-size:16px;min-height:48px;text-align:left;${X[k] ? '' : 'background:#fff'}" aria-pressed="${!!X[k]}" data-a="gcxtick" data-v="${k}"><b style="font-size:20px;width:22px;flex:none">${X[k] ? '☑' : '☐'}</b>${t}</button>`;
  const du = X.bb && X.dem && X.anh && String(S.form.gcxcho || '').trim();
  return `<div class="modal" role="dialog" aria-modal="true" aria-label="Xuất đơn"><div class="box col gap8">
    <b style="font-size:18px">Xuất${d ? ': ' + esc(d.cau_kien) + (d.truc ? ' · ' + esc(d.truc) : '') : ''}</b>
    <span class="sm">Làm đủ ba việc rồi tick, sau đó gửi CVKTHT duyệt:</span>
    ${o('bb', 'Đã ký biên bản giao nhận')}${o('dem', 'Đã kiểm đếm')}${o('anh', 'Đã chụp ảnh, gửi lên nhóm Zalo')}
    <input class="inp s" id="gcxcho" maxlength="120" autocomplete="off" placeholder="Xuất cho ai / vị trí lắp dựng (bắt buộc)" data-model="gcxcho" value="${esc(S.form.gcxcho || '')}">
    <input class="inp s" id="gcxnote" maxlength="200" autocomplete="off" placeholder="Ghi chú (không bắt buộc)" data-model="gcxnote" value="${esc(S.form.gcxnote || '')}">
    <button class="btn ${du ? 'pri' : 'dis'} full" data-a="gcxgui">GỬI DUYỆT XUẤT</button>
    ${du ? '' : '<span class="sm muted" style="line-height:1.4">Tick đủ ba ô và ghi xuất cho ai thì mới gửi được.</span>'}
    <button class="btn full" data-a="gcxdong">Quay lại</button>
  </div></div>`;
}
const gcXuatMo = (id) => { S.gcXu = { id, bb: false, dem: false, anh: false }; ['gcxcho', 'gcxnote'].forEach((k) => delete S.form[k]); render(); };
// tab Duyệt: đơn gia công chờ duyệt xuất (của người khác), bấm là mở đơn để xem rồi duyệt
function gcXuatSec() {
  const ds = ((S.boot && S.boot.gc) || []).filter((d) => d.tt === 'xong' && d.xuat_tt === 'cho' && !gcCuaToi(d));
  if (!ds.length) return '';
  return `<h2 class="sec">Gia công chờ duyệt xuất (${ds.length})</h2><div class="card" style="padding:0;overflow:hidden">${ds.map((d) => `<button class="li" style="width:100%;background:#fff;border:0;border-bottom:1px solid var(--line);text-align:left;font:inherit;color:inherit" data-a="nav" data-s="gcdon" data-gid="${d.id}"><span><b>${esc(d.cau_kien)}</b>${d.truc ? ' · ' + esc(d.truc) : ''}</span><span class="sm" style="color:var(--pri);text-decoration:underline;white-space:nowrap">Xem và duyệt ›</span></button>`).join('')}</div>`;
}
/* HỘP BÁO VƯỚNG: chọn lý do (một chạm), chọn mức độ, ghi chú thì tuỳ — trừ "Khác" phải ghi rõ. Lý do lấy từ danh
   mục admin lập (Gia công → ⚙), đi kèm bảng đơn hoặc màn một đơn. S.gcVg = { id, loai, dung }; ghi chú ở S.form.gcvgnote. */
function gcVgHtml() {
  const V = S.gcVg;
  if (!V || S.ask) return '';
  const muc = (S.gc && S.gc.muc) || (S.gcDetail && S.gcDetail.muc) || {};
  const lyDo = (muc.vg || []).map((m) => m.ten).concat(['Khác']);
  const d = [].concat((S.gc && S.gc.items) || [], S.gcDetail ? [S.gcDetail.don] : []).find((x) => x && x.id === V.id);
  const du = V.loai && (V.loai !== 'Khác' || String(S.form.gcvgnote || '').trim());
  return `<div class="modal" role="dialog" aria-modal="true" aria-label="Báo vướng"><div class="box col gap8">
    <b style="font-size:18px">Báo vướng${d ? ': ' + esc(d.cau_kien) : ''}</b>
    <span class="sm b">Vướng gì?</span>
    <div class="wrap">${lyDo.map((l) => `<button class="chip s ${V.loai === l ? 'on' : ''}" data-a="gcvgloai" data-v="${esc(l)}">${esc(l)}</button>`).join('')}</div>
    <span class="sm b">Tổ còn làm được không?</span>
    <div class="row gap6"><button class="chip s f1 ${V.dung ? '' : 'on'}" data-a="gcvgdung" data-v="0">Vẫn làm phần khác</button><button class="chip s f1 ${V.dung ? 'on' : ''}" style="${V.dung ? 'background:var(--bad);border-color:var(--bad)' : ''}" data-a="gcvgdung" data-v="1">Dừng hẳn</button></div>
    <input class="inp s" id="gcvgnote" maxlength="200" autocomplete="off" placeholder="${V.loai === 'Khác' ? 'Ghi rõ đang vướng gì (bắt buộc)' : 'Ghi thêm, ví dụ: hết D16 (không bắt buộc)'}" data-model="gcvgnote" value="${esc(S.form.gcvgnote || '')}">
    <button class="btn ${du ? 'bad' : 'dis'} full" data-a="gcvggui">GỬI BÁO VƯỚNG</button>
    <button class="btn full" data-a="gcvgdong">Quay lại</button>
  </div></div>`;
}
const gcVgMo = (id) => { S.gcVg = { id, loai: null, dung: false }; delete S.form.gcvgnote; render(); };

/* --- Báo cáo ca gửi cấp trên ---
   CVKTHT trở lên soạn "BÁO CÁO QUÂN SỐ CA" theo đúng mẫu của đơn vị rồi chép dán vào Zalo. Mục tiêu: soát và chép
   trong vài phút. Mỗi mục là một ô chữ ĐIỀN SẴN từ số liệu app:
     - phần đầu (đơn vị, chỉ huy, dự án, khu vực) và máy móc: lấy từ mẫu, lần chép trước lưu lại;
     - 3. quân số: từ quân số đầu ca các tổ đã báo (tổ chia ca, tổ làm ca kia, tổ chưa báo đều có dòng);
     - 4. công việc: đơn gia công đang làm (kèm %) và đơn xong trong giờ ca;
     - 6. kiểm tra: các dòng mặc định của mẫu; 7. vướng mắc, 8. tiến độ: từ đơn đang vướng / trễ hạn.
   Người soạn sửa thẳng trong ô; mục đã sửa giữ nguyên chữ của họ (có nút lấy lại số từ app). Chép cả báo cáo hay
   chép riêng một phần đều lưu báo cáo của ca đó. Nháp đang sửa lưu trên máy theo ca, mất mạng hay lỡ thoát cũng không mất. */
const BC_DAU = [['don_vi', 'Đơn vị', 'Trung đoàn XD 01, Tiểu đoàn 1.1, Đại đội 1.1.6, Trung đội 1.1.6.1'], ['ddt', 'Đại đội trưởng', '', 'daidoi'],
  ['tdtr', 'Trung đội trưởng', '', 'trungdoi'], ['cbpt', 'CBPT', '', 'cvktht'], ['du_an', 'Dự án', 'Tên dự án'], ['khu_vuc', 'Khu vực thi công', 'Ví dụ: Bãi gia công trung đoàn']];
const BC_MUC = [['s3', '3. Quân số'], ['s4', '4. Công việc trong ngày'], ['s5', '5. Máy móc thiết bị (MMTB)'], ['s6', '6. Kiểm tra, giám sát'], ['s7', '7. Vướng mắc'], ['s8', '8. Đánh giá tiến độ']];
const bcKey = (B) => 'kt:bc:' + B.ngay + ':' + B.ca;
const gioH = (ms) => { const m = ((ms + 7 * 3600e3) % 864e5) / 60e3; return Math.floor(m / 60) + 'h' + (m % 60 ? two(m % 60) : ''); };
// "Dầm D3 tầng 5 trục X12-X17 / Y3-Y5 KDC": đủ để đọc ra cấu kiện nằm ở đâu
const bcDon = (d) => [d.cau_kien, d.tang ? 'tầng ' + d.tang : '', d.cote ? 'cote ' + d.cote : '', d.truc ? 'trục ' + d.truc : '', d.phan_khu || '', d.hang_muc ? '(' + d.hang_muc + ')' : ''].filter(Boolean).join(' ');
// lý do nghỉ đọc thành câu; "lý do khác" thay bằng chính ghi chú tổ đã ghi
function bcLyDo(r, lyDo) {
  const n = r.nghi || {}, ds = lyDo.filter((l) => n[l[0]] && l[0] !== 'khac').map((l) => n[l[0]] + ' ' + l[1]);
  if (n.khac) ds.push(n.khac + ' ' + (r.ghi_chu || 'lý do khác'));
  else if (r.ghi_chu) ds.push(r.ghi_chu);
  return ds.join(', ');
}
/* Mục 3: dòng tổng + một dòng mỗi tổ, theo cách người đọc muốn hình dung quân số:
   - tổ làm CA ĐANG BÁO CÁO đứng trước (theo thứ tự tổ), mỗi tổ ghi đi làm / tổng và nghỉ theo lý do;
   - tổ làm CẢ 2 CA ghi thêm CA LIỀN TRƯỚC — báo cáo ca ngày kèm ca đêm hôm trước, báo cáo ca đêm kèm ca ngày cùng
     ngày — để thấy tổ có bao nhiêu người, làm ca nào, nghỉ thế nào;
   - tổ làm ca kia dồn xuống cuối, chỉ một dòng ngắn "(làm ca đêm)".
   Tổ làm ca nào: theo LỊCH CA; tổ chưa đặt lịch thì theo các lần báo gần nhất.
   NGUỒN SỐ (S.bcNguon): 'to' = số tổ báo, tổ chưa báo thì lấy SỐ THIẾT LẬP; 'tl' = chỉ số thiết lập. Dòng dùng số
   thiết lập viết y như dòng thường (không ghi chú gì thêm): đó là số CVKTHT chịu trách nhiệm.
   Tổng quân số tính mọi tổ, kể cả tổ làm ca kia và tổ chưa báo. */
function bcQuanSo(B) {
  const ca = B.ca, kia = ca === 1 ? 2 : 1, caNay = CA_TEN[ca], caKia = CA_TEN[kia], chiTl = S.bcNguon === 'tl';
  const ds = B.tdt.concat(B.qs.filter((x) => !B.tdt.some((u) => u.id === x.user_id)).map((x) => ({ id: x.user_id, name: x.uname })))
    .filter((u, i, a) => a.findIndex((v) => v.id === u.id) === i);
  // ca liền trước của ca đang báo cáo
  const truocDs = ca === 1 ? (B.qsDemTruoc || []) : B.qs.filter((x) => x.ca === 1);
  let lam = 0, tong = 0, nghi = 0, kiaSo = 0, chuaSo = 0;
  /* hang: từng dòng của mục 3 kèm trạng thái tổ — 'da' tổ tự báo, 'tl' đang lấy số thiết lập, 'chua' chưa có số, 'kia' làm
     ca kia. Màn soạn hiện nhãn ngay trên dòng đó, nên không cần một danh sách tổ riêng ở bước 1. */
  const chua = [], dung = [], truocNhom = [], sauNhom = [], truocHang = [], sauHang = [], kiaTen = [];
  ds.forEach((u) => {
    const r0 = B.qs.find((x) => x.user_id === u.id && x.ca === ca), p0 = truocDs.find((x) => x.user_id === u.id);
    const tr = B.truoc.find((x) => x.user_id === u.id), tl = (B.tl || {})[u.id];
    // dòng theo số thiết lập: người nghỉ CVKTHT ghi (theo lý do) nằm trong số người của ca, đi làm = số người ca − nghỉ
    const tlDong = (c) => { if (!tl) return null; const ng = tl['n' + c] || {}; return { ca: c, tong: tl.tong, lam: Math.max(0, (c === 1 ? tl.s1 : tl.s2) - qsSoNghi(ng)), ca_kia: 0, nghi: ng, ghi_chu: tl['gc' + c] || null, tl: true }; };
    const chon = (row, c) => (chiTl ? tlDong(c) || row : row || tlDong(c));
    let L = qsLichCa(B.lich, u.id, B.ngay);
    if (!L) { const th = qsCaCua(r0 ? [r0] : p0 ? [p0] : tr ? [tr] : []); L = th.length === 2 ? 3 : th[0] || ca; }
    /* tổng quân số của tổ, cùng nguồn với dòng của tổ: chọn "Chỉ số thiết lập" thì số thiết lập; theo tổ báo thì lần tổ
       báo CA NÀY, rồi số thiết lập (CVKTHT vừa sửa thì tổng đổi theo), rồi lần báo ca liền trước, rồi số tổ tự khai */
    const tongTo = ((chiTl && tl) || r0 || tl || p0 || { tong: toTongKhai(B.lich, tr, u.id) }).tong;
    tong += tongTo;
    if (L === kia) { sauNhom.push(`Tổ ${u.name} (làm ${caKia})`); sauHang.push('kia'); kiaTen.push(u.name); kiaSo += tongTo; return; }
    if (!r0) chua.push(u.name);
    const r = chon(r0, ca);
    if (!r) { truocNhom.push(`Tổ ${u.name}: chưa báo quân số ${caNay}`); truocHang.push('chua'); chuaSo += tongTo; return; }
    if (r.tl) dung.push(u.name);
    truocHang.push(r.tl ? (r0 ? 'tlda' : 'tl') : 'da');
    lam += r.lam;
    const p = [`${caNay} ${r.lam}/${r.tong} cn`], n1 = qsSoNghi(r.nghi), ly1 = bcLyDo(r, B.lyDo);
    nghi += n1; kiaSo += Math.max(0, tongTo - r.lam - n1);
    let n2 = 0, ly2 = '';
    if (L === 3) {
      const k = chon(p0, kia);
      if (k) { p.push(`${caKia} ${k.lam}/${r.tong} cn`); n2 = qsSoNghi(k.nghi); ly2 = bcLyDo(k, B.lyDo); }
      // chưa có số của ca liền trước: lấy số "người thuộc ca kia" tổ đã khai khi báo ca này, để dòng vẫn đủ hai ca
      else if (r.ca_kia > 0) p.push(`${caKia} ${r.ca_kia}/${r.tong} cn`);
    }
    if (n1 + n2) p.push(`nghỉ ${n1 + n2} cn`);
    const ly = ly1 && ly2 ? `${caNay}: ${ly1}; ${caKia}: ${ly2}` : ly2 ? `${caKia}: ${ly2}` : ly1;
    truocNhom.push(`Tổ ${u.name}: ${p.join(', ')}${ly ? ' — ' + ly : ''}`);
  });
  /* nghi: số nghỉ của ca đang báo cáo; phai: số tổ làm ca này (tổ làm ca kia không tính là phải báo). kiaSo: người
     không thuộc ca này (tổ làm ca kia, phần ca kia của tổ 2 ca); chuaSo: người của tổ chưa có số nào cho ca này.
     Bốn số cộng lại đúng bằng tổng: tong = lam + nghi + kiaSo + chuaSo. */
  return { dong: truocNhom.concat(sauNhom), hang: truocHang.concat(sauHang), kiaTen, chua, dung, lam, tong, nghi, kiaSo, chuaSo, phai: truocNhom.length, soTo: ds.length, dau: `Quân số đi làm trong ca ${ca} là: ${lam} công nhân / (tổng quân số ${tong})` };
}
const bcTre = (B, d) => gcMo(d) && (d.han < B.ngay || (d.han === B.ngay && B.ca === 2));
// chữ app tự ghép cho một mục
/* MỤC 4 SOẠN THEO DÒNG. Mỗi đơn gia công một dòng, người soạn chạm −10 / +10 / Xong / × thay vì gõ chữ; việc ngoài app
   thì thêm bằng chạm loại cấu kiện + gõ tầng, trục. S.bcV = phần chỉnh { d: { id: { tt, an } }, them: [id], tu: [{ id,
   ten, tt }] } (xem docViec ở src/baocao.js): dòng không chỉnh vẫn theo số mới nhất của đơn. Chỉnh chỉ nằm trong báo
   cáo, KHÔNG ghi ngược vào đơn gia công. Việc ngoài app chưa xong tự mang sang ca sau (bcVGoc). "Sửa bằng chữ" vẫn còn:
   khi đó S.bcM.s4 là chữ và thắng các dòng. */
const bcVRong = () => ({ d: {}, them: [], tu: [] });
// phần chỉnh mục 4 của bản chung: báo cáo đã lưu của ca; ca chưa ai lưu thì mang các việc ngoài app chưa xong của ca trước
const bcVGoc = (B) => JSON.parse(JSON.stringify(B.bao ? B.bao.viec || bcVRong() : { ...bcVRong(), tu: B.viecTruoc || [] }));
// tên việc tự thêm chuẩn hoá y như server (chu ở src/baocao.js): chữ chép đi và chữ lưu lại phải khớp nhau
const bcTenViec = (t) => String(t == null ? '' : t).replace(/\s+/g, ' ').trim().slice(0, 160);
const bcViecChu = (x) => `${x.ten}: ${x.tt === 'xong' ? 'hoàn thành' : 'đang gia công ' + x.tt + '%'}`;
// tiến độ của đơn theo app, và theo báo cáo (số người soạn chỉnh, không thì số của đơn)
const bcDonTt = (d) => (d.tt === 'xong' ? 'xong' : d.pct);
const bcVTt = (V, d) => { const o = V.d[d.id]; return o && o.tt != null ? o.tt : bcDonTt(d); };
// các dòng của mục 4 (việc đang làm trước, việc hoàn thành sau) và các đơn còn mở chưa nằm trong báo cáo (để chạm thêm)
function bcViecDs(B, V) {
  const lam = [], xong = [], goiY = [];
  for (const d of B.don) {
    const o = V.d[d.id] || {}, co = d.tt === 'xong' || d.pct > 0 || o.tt != null || V.them.includes(d.id);
    if (!co || o.an) { if (gcMo(d) || (co && o.an)) goiY.push({ id: d.id, ten: bcDon(d) }); continue; }
    /* lech: đơn đã đi tiếp SAU lúc người soạn chỉnh (g = số của đơn lúc chỉnh). Chỉnh % cố ý khác số đơn thì không nhắc;
       chỉ nhắc khi tổ báo thêm sau đó, lúc ấy số đã chỉnh có thể đã cũ. */
    const x = { k: 'd' + d.id, ten: bcDon(d), tt: bcVTt(V, d), doi: o.tt != null, app: bcDonTt(d) };
    x.lech = x.doi && o.g != null && o.g !== x.app && x.tt !== x.app;
    (x.tt === 'xong' ? xong : lam).push(x);
  }
  V.tu.forEach((t) => (t.tt === 'xong' ? xong : lam).push({ k: 't' + t.id, ten: t.ten, tt: t.tt, tu: true }));
  return { dong: lam.concat(xong), goiY };
}
/* PHẦN SỬA RIÊNG CỦA MỤC 4 tính THEO TỪNG DÒNG so với bản chung (bcKhac): { d: { id: chỉnh | null }, them: { id: true |
   false }, tu: { id: việc | null } }, undefined nếu không khác. Ghép lại lên bản chung mới (bcGhep: người khác vừa chép,
   hoặc vòng tự làm mới) chỉ đè đúng các dòng mình đã đụng: dòng người kia vừa thêm hay chỉnh vẫn còn. */
function bcVKhac(goc, V) {
  const d = {}, them = {}, tu = {}, gt = Object.fromEntries(goc.tu.map((t) => [t.id, t]));
  new Set([...Object.keys(goc.d), ...Object.keys(V.d)]).forEach((k) => { if (JSON.stringify(V.d[k] || null) !== JSON.stringify(goc.d[k] || null)) d[k] = V.d[k] || null; });
  V.them.filter((x) => !goc.them.includes(x)).forEach((x) => { them[x] = true; });
  goc.them.filter((x) => !V.them.includes(x)).forEach((x) => { them[x] = false; });
  V.tu.forEach((t) => { if (JSON.stringify(t) !== JSON.stringify(gt[t.id] || null)) tu[t.id] = t; });
  goc.tu.forEach((t) => { if (!V.tu.some((x) => x.id === t.id)) tu[t.id] = null; });
  return Object.keys(d).length || Object.keys(them).length || Object.keys(tu).length ? { d, them, tu } : undefined;
}
function bcVGhep(V, K) {
  if (!K || Array.isArray(K.tu)) return V;
  Object.entries(K.d || {}).forEach(([k, m]) => { if (m) V.d[k] = m; else delete V.d[k]; });
  Object.entries(K.them || {}).forEach(([k, co]) => { const id = Number(k); V.them = V.them.filter((x) => x !== id); if (co) V.them.push(id); });
  Object.entries(K.tu || {}).forEach(([id, t]) => {
    const i = V.tu.findIndex((x) => x.id === id);
    if (!t) { if (i >= 0) V.tu.splice(i, 1); } else if (i >= 0) V.tu[i] = t; else V.tu.push(t);
  });
  return V;
}
// đặt trạng thái một dòng: 'd<id>' (đơn) hoặc 't<id>' (việc tự thêm); tt = undefined là về số của đơn
function bcVDat(k, tt, an) {
  const V = S.bcV, id = k.slice(1);
  if (k[0] === 't') { const i = V.tu.findIndex((x) => x.id === id); if (i < 0) return; if (an) V.tu.splice(i, 1); else V.tu[i] = { ...V.tu[i], tt }; return; }
  const cu = V.d[id] || {}, m = {}, don = S.bcc.don.find((x) => String(x.id) === id);
  const t2 = an ? cu.tt : tt;
  if (t2 != null) { m.tt = t2; m.g = an ? cu.g : don ? bcDonTt(don) : cu.g; if (m.g == null) delete m.g; }
  if (an) m.an = 1;
  if (Object.keys(m).length) V.d[id] = m; else delete V.d[id];
  if (an) V.them = V.them.filter((x) => x !== Number(id));
}
// có chỉnh trên đơn nào CÒN trong báo cáo của ca không (chỉnh trên đơn đã huỷ / đã xong từ ca trước thì không tính)
const bcVChinh = (B, V) => Object.keys(V.d).some((k) => B.don.some((d) => String(d.id) === k)) || V.them.some((id) => B.don.some((d) => d.id === id));
// nhãn của mục 4 trong danh sách các phần: đã chỉnh gì, có việc tự thêm không, có dòng nào khác số đơn không
function bcVNhan(B) {
  const V = S.bcV, lech = bcViecDs(B, V).dong.filter((x) => x.lech).length;
  return [bcVChinh(B, V) ? 'đã chỉnh trên đơn' : 'từ đơn gia công', V.tu.length ? V.tu.length + ' việc tự thêm' : '',
    lech ? `<b style="color:var(--warn)">${lech} dòng khác số đơn</b>` : ''].filter(Boolean).join(' · ');
}
const bcTtChu = (tt) => (tt === 'xong' ? 'hoàn thành' : tt + '%');
function bcViecHtml(B) {
  const V = S.bcV, L = bcViecDs(B, V);
  const nut = (a, k, v, chu) => `<button class="chip s" style="flex:none;min-width:44px;padding:6px 8px" data-a="${a}" data-k="${k}"${v != null ? ` data-v="${v}"` : ''}>${chu}</button>`;
  const dong = L.dong.map((x) => `<div style="padding:7px 0;border-bottom:1px solid var(--line)">
      <div class="sm" style="line-height:1.35">${esc(x.ten)}${x.tu ? ' <span class="muted">(tự thêm)</span>' : ''}</div>
      <div class="row gap6" style="margin-top:5px">${x.tt === 'xong' ? '<b class="f1" style="color:var(--ok)">Hoàn thành</b>'
        : `${nut('bcvpct', x.k, -10, '−10')}<b style="min-width:48px;text-align:center;font-size:17px${x.doi ? ';color:var(--pri)' : ''}">${x.tt}%</b>${nut('bcvpct', x.k, 10, '+10')}<span class="f1"></span>`}
        <button class="chip s ${x.tt === 'xong' ? 'on' : ''}" style="flex:none" data-a="bcvxong" data-k="${x.k}">Xong</button>${nut('bcvbo', x.k, null, '×')}</div>
      ${x.lech ? `<button class="sm" style="border:0;background:transparent;color:var(--warn);text-decoration:underline;padding:4px 0 0;text-align:left;font-weight:700" data-a="bcvtheo" data-k="${x.k}">Đơn đang ${bcTtChu(x.app)} · lấy theo đơn</button>` : ''}</div>`).join('');
  const goiY = L.goiY.length ? `<span class="sm b">Đơn chưa có trong báo cáo, chạm để thêm:</span><div class="wrap" style="gap:6px">${L.goiY.map((g) => `<button class="chip s" style="white-space:normal;text-align:left" data-a="bcvthem" data-v="${g.id}">+ ${esc(g.ten)}</button>`).join('')}</div>` : '';
  const ten = String(S.form.bcv_ten || '').trim();
  const moi = !S.bcvMo ? '<button class="btn s full" data-a="bcvmo">+ Thêm việc ngoài app</button>'
    : `<div class="card col gap6" style="padding:10px"><b>Thêm việc ngoài app</b>
      ${(B.ck || []).length ? `<div class="wrap" style="gap:6px">${B.ck.map((c) => `<button class="chip s ${ten === c ? 'on' : ''}" data-a="bcvck" data-v="${esc(c)}">${esc(c)}</button>`).join('')}</div>` : ''}
      <input class="inp s" id="bcv_ten" maxlength="100" autocomplete="off" placeholder="Việc, ví dụ: LK11, LK12 (thấp tầng)" data-model="bcv_ten" value="${esc(S.form.bcv_ten || '')}">
      <div class="row gap6"><input class="inp s f1" style="min-width:0" id="bcv_tang" maxlength="20" autocomplete="off" placeholder="Tầng" data-model="bcv_tang" value="${esc(S.form.bcv_tang || '')}">
        <input class="inp s f1" style="min-width:0" id="bcv_truc" maxlength="30" autocomplete="off" placeholder="Trục" data-model="bcv_truc" value="${esc(S.form.bcv_truc || '')}"></div>
      <div class="row gap6"><button class="btn s pri f1" data-a="bcvmoi" data-v="10">Thêm: đang làm</button><button class="btn s f1" data-a="bcvmoi" data-v="xong">Thêm: hoàn thành</button></div>
      <button class="btn s" data-a="bcvmo">Thôi</button>
      <span class="sm muted" style="line-height:1.4">Việc tự thêm chưa xong tự mang sang ca sau, chỉ cần chạm đổi %.</span></div>`;
  return `<div class="col" style="gap:0">${dong || '<span class="sm muted" style="padding:6px 0">Chưa có việc nào.</span>'}</div>${goiY}${moi}
    <span class="sm muted" style="line-height:1.4">Số chỉnh ở đây chỉ vào báo cáo, không đổi tiến độ của đơn gia công. Dòng không chạm vẫn theo số mới nhất của đơn. +10 ở 90% là hoàn thành.</span>
    <button class="sm" style="border:0;background:transparent;color:var(--pri);text-decoration:underline;padding:0;text-align:left" data-a="bcvchu">Sửa bằng chữ</button>`;
}
function bcAuto(B, k) {
  if (k === 's3') { const Q = bcQuanSo(B); return [Q.dau].concat(Q.dong).join('\n'); }
  if (k === 's4') return bcViecDs(B, B === S.bcc && S.bcV ? S.bcV : bcVGoc(B)).dong.map(bcViecChu).join('\n');
  if (k === 's5') return B.mau.mmtb || '';
  if (k === 's6') return (B.mau.kt || []).join('\n');
  if (k === 's7') { const v = B.don.filter((d) => gcMo(d) && d.vuong).map((d) => `${bcDon(d)}: ${d.vuong}`); return v.length ? v.join('\n') : 'Hiện tại chưa có'; }
  // mục 8 theo đúng tiến độ đã soát ở mục 4: đơn người soạn đánh "Xong" thì không còn là trễ, % lấy số đã chỉnh
  const V = B === S.bcc && S.bcV ? S.bcV : bcVGoc(B), t = B.don.filter((d) => bcTre(B, d) && bcVTt(V, d) !== 'xong');
  return t.length ? [`Nguy cơ chậm tiến độ: ${t.length} đơn trễ hạn`].concat(t.map((d) => `${bcDon(d)}: hạn ${ngayNgan(d.han)}, đang ${bcVTt(V, d)}%`)).join('\n') : 'Nguy cơ chậm tiến độ: Không có';
}
const bcGet = (k) => (typeof S.bcM[k] === 'string' ? S.bcM[k] : bcAuto(S.bcc, k));
// dòng của một mục, bỏ dấu đầu dòng người soạn tự gõ (app tự thêm "• ")
const bcDong = (t) => String(t || '').split('\n').map((l) => l.replace(/^\s*[•\-*+]\s*/, '').trim()).filter(Boolean);
/* Các dòng đúng mẫu của TỪNG PHẦN (phần đầu, mục 3 → 8): màn soạn bày từng phần kèm nút chép riêng, bản gửi đi là
   các phần nối lại (bcTao). */
function bcPhan() {
  const B = S.bcc, D = S.bcDau || {}, Q = bcQuanSo(B), g = (k) => (D[k] || '').trim();
  const cham = (ds) => ds.map((x) => '• ' + x), muc = (k, trong) => { const ds = bcDong(bcGet(k)); return ds.length || !trong ? ds : [trong]; };
  const dau = [g('don_vi'), g('ddt') && 'Đại đội trưởng: ' + g('ddt'), g('tdtr') && 'Trung Đội trưởng: ' + g('tdtr'), g('cbpt') && 'CBPT: ' + g('cbpt'),
    g('du_an') && 'Dự Án: ' + g('du_an'), g('khu_vuc') && 'Khu vực thi công: ' + g('khu_vuc'), `Tổng số tổ: ${Q.soTo} tổ`].filter(Boolean);
  const s3 = muc('s3');
  const P = {
    dau: [`BÁO CÁO QUÂN SỐ CA ${B.ca} Từ ${gioH(B.gio.tu)} đến ${gioH(B.gio.den)} ngày ${fmtDay(B.ngay)}`].concat(cham(dau)),
    s3: ['3. ' + (s3[0] || Q.dau)].concat(cham(s3.slice(1))),
    s4: ['4. Nội dung công việc thực hiện trong ngày'].concat(cham(muc('s4', 'Chưa có'))),
    s5: ['5. Tổng hợp MMTB: ' + muc('s5').join(' – ')],
    s6: ['6. Kiểm tra, giám sát'].concat(cham(muc('s6'))),
    s7: ['7. Các vướng mắc ảnh hưởng đến tiến độ thi công:'].concat(cham(muc('s7', 'Hiện tại chưa có'))),
    s8: ['8. Đánh giá tiến độ'].concat(cham(muc('s8', 'Nguy cơ chậm tiến độ: Không có'))),
  };
  // không để dấu cách thừa cuối dòng ("5. Tổng hợp MMTB: " khi mục trống): server cắt đi, bản lưu sẽ lệch bản đã chép
  Object.keys(P).forEach((k) => { P[k] = P[k].map((l) => l.trimEnd()); });
  return P;
}
// chuẩn hoá như server lúc lưu (doan ở src/baocao.js), để so bản đang hiện với bản đã chép
const bcChuan = (t) => String(t || '').replace(/\r/g, '').split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n');
// bản chữ đúng mẫu để dán vào Zalo
function bcTao() {
  const P = bcPhan();
  return ['dau'].concat(BC_MUC.map((m) => m[0])).map((k) => P[k].join('\n')).join('\n');
}
/* BẢN DÙNG CHUNG VÀ PHẦN SỬA RIÊNG. Báo cáo của ca và mẫu trên máy chủ (S.bcc) là MỘT bản cho mọi người soạn. Máy
   này chỉ giữ riêng PHẦN SỬA CHƯA CHÉP, tức chỗ đang khác bản dùng chung: mục khác bản đã lưu của ca (chuỗi = chữ đã
   sửa, null = lấy lại số từ app), ô phần đầu khác mẫu, nguồn quân số nếu khác. Nháp trên máy chỉ lưu phần khác đó,
   nên người khác chép hay đổi mẫu thì mọi chỗ mình CHƯA đụng tới đều theo bản mới (bcGhep). */
function bcKhac() {
  const B = S.bcc, goc = (B.bao && B.bao.muc) || {}, muc = {}, dau = {}, ng = (B.bao && B.bao.nguon) || 'to';
  BC_MUC.forEach(([k]) => { const a = typeof S.bcM[k] === 'string' ? S.bcM[k] : null, g = typeof goc[k] === 'string' ? goc[k] : null; if (a !== g) muc[k] = a; });
  BC_DAU.forEach(([k]) => { if ((S.bcDau[k] || '') !== (B.mau.dau[k] || '')) dau[k] = S.bcDau[k] || ''; });
  return { muc, dau, nguon: S.bcNguon !== ng ? S.bcNguon : undefined, viec: bcVKhac(bcVGoc(B), S.bcV) };
}
const bcCoKhac = (K) => !!(Object.keys(K.muc).length || Object.keys(K.dau).length || K.nguon || K.viec);
// đặt bản dùng chung B làm nền rồi ghép phần sửa riêng K (nếu có) lên trên
function bcGhep(B, K) {
  S.bcc = B;
  const muc = { ...((B.bao && B.bao.muc) || {}) };
  Object.entries((K && K.muc) || {}).forEach(([k, v]) => { if (typeof v === 'string') muc[k] = v; else delete muc[k]; });
  S.bcM = muc;
  S.bcDau = { ...B.mau.dau, ...((K && K.dau) || {}) };
  S.bcNguon = (K && K.nguon) || (B.bao && B.bao.nguon) || 'to';
  S.bcV = bcVGhep(bcVGoc(B), K && K.viec);
}
function bcNhap() {
  const K = bcKhac();
  try {
    if (bcCoKhac(K)) localStorage.setItem(bcKey(S.bcc), JSON.stringify({ v: 2, ...K, ts: Date.now() }));
    else localStorage.removeItem(bcKey(S.bcc));
  } catch (e) { /* đầy bộ nhớ */ }
}
async function bcTai() {
  const c = S.bcCa;
  const B = await api('GET', '/baocao' + (c ? `?ngay=${c.ngay}&ca=${c.ca}` : ''));
  let n = null;
  try { n = JSON.parse(localStorage.getItem(bcKey(B)) || 'null'); } catch (e) { n = null; }
  // nháp kiểu cũ giữ cả bản chứ không phải phần khác: đọc thành "mọi mục theo nháp"
  if (n && n.v !== 2) n = { ...n, muc: Object.fromEntries(BC_MUC.map(([k]) => [k, n.muc && typeof n.muc[k] === 'string' ? n.muc[k] : null])) };
  /* Nháp cũ hơn bản đã lưu thì bỏ khi bản lưu đó là của CHÍNH MÌNH (đã chép từ máy khác, nháp này là đồ thừa). Bản lưu
     của người khác thì giữ nháp: đó là chữ mình gõ mà chưa chép. */
  const thua = n && B.bao && n.ts < B.bao.ts && (n.v !== 2 || B.bao.by_id === S.me.id);
  bcGhep(B, n && !thua ? n : null);
  if (thua) { try { localStorage.removeItem(bcKey(B)); } catch (e) { /* bỏ qua */ } }
  S.bcvMo = false;
  // phần đầu còn trống (lần đầu dùng): mở sẵn cho điền
  S.bcMo = !S.bcDau.don_vi && !S.bcDau.du_an ? 'dau' : null;
  // dọn nháp báo cáo của các ca hơn một tuần trước
  try {
    const cu = congNgay(S.boot.today, -7);
    for (let i = localStorage.length - 1; i >= 0; i--) { const m = /^kt:bc:(\d{4}-\d{2}-\d{2}):/.exec(localStorage.key(i) || ''); if (m && m[1] < cu) localStorage.removeItem(localStorage.key(i)); }
  } catch (e) { /* bỏ qua */ }
}
function vBaoCaoCa() {
  const B = S.bcc;
  const top = head('Báo cáo ca', B ? esc(hoa(caGoi(B))) + ' · ' + gioH(B.gio.tu) + '–' + gioH(B.gio.den) : '', 'more');
  if (!B) return `${top}${panelWait('baocaoca')}`;
  if (!S.bcV) S.bcV = bcVGoc(B);
  const Q = bcQuanSo(B), dinh = 'style="flex:none;white-space:nowrap"';
  const D = S.bcDau || {}, daBao = Q.phai - Q.chua.length;
  /* ĐÃ CHÉP CHƯA, so bản đang hiện với bản đã chép lần cuối: 'chua' chưa chép; 'da' đã chép đúng bản này; 'doi' nội dung
     đã đổi sau lần chép (tổ báo thêm, đơn gia công đổi, sửa tay) — bản cấp trên đang có là bản cũ, phải chép lại. */
  const chep = !B.bao ? 'chua' : bcChuan(B.bao.van_ban) === bcChuan(bcTao()) ? 'da' : 'doi';
  /* BỐ CỤC: một màn đọc từ trên xuống, MỖI THỨ MỘT CHỖ.
     - Thanh trên (đứng yên): chọn ca; một hàng gồm trạng thái tổ báo (chạm là tới mục 3) và nút CHÉP cả báo cáo.
     - Bên dưới là chính bản sẽ gửi, chia theo từng phần của mẫu; mỗi phần có nút chép riêng và nút sửa tại chỗ.
     - Từng tổ (đã báo / số thiết lập / chưa báo), nút nhắc tổ chưa báo và nút thiết lập (bánh răng) đều nằm ở MỤC 3 —
       không có khối "tổ báo" riêng lặp lại cùng danh sách. Phần còn thiếu báo ngay trên tiêu đề phần đó (phần đầu:
       "n ô trống", máy móc: "chưa có"), không có thẻ "còn thiếu" riêng. */
  const quaHan = caKhoa(B) < caKhoa(B.hien) || (caKhoa(B) === caKhoa(B.hien) && Date.now() + (S.boot.skew || 0) > B.han);
  const nutTo = `<button class="chip s f1" style="min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:6px 8px${Q.chua.length ? `;border-color:var(--${quaHan ? 'bad' : 'warn'});color:var(--${quaHan ? 'bad' : 'warn'})` : ''}" data-a="bcden" data-v="3">${Q.chua.length ? `${quaHan ? 'Quá hạn' : 'Chưa báo'}: ${Q.chua.length} tổ · ` : ''}Tổ đã báo ${daBao}/${Q.phai}</button>`;
  const nutChep = `<button class="chip s on" style="flex:none;white-space:nowrap;padding:6px 14px;gap:6px${chep === 'da' ? ';background:var(--ok);border-color:var(--ok)' : ''}" data-a="bcchep">${chep === 'da' ? IC_BC.xong : IC_BC.chep}${chep === 'da' ? 'Đã chép' : chep === 'doi' ? 'Chép lại' : 'Chép báo cáo'}</button>`;
  const chips = `<div class="col gap6 tbar" style="padding:6px 16px">${caChon(B, 'bcca')}<div class="row gap6">${nutTo}${nutChep}</div></div>`;
  const thieu = BC_DAU.filter((f) => !(D[f[0]] || '').trim()).map((f) => f[1]);
  const thieuMm = !bcDong(bcGet('s5')).length;
  const nguonTen = { s3: 'quân số các tổ', s4: 'đơn gia công', s5: 'lần chép trước', s6: 'mẫu', s7: 'đơn đang vướng', s8: 'đơn trễ hạn' };
  const suaO = (k) => {
    if (k === 'dau') return `${BC_DAU.map(([f, ten, goiY, role]) => {
        const chon = role ? B.nguoi.filter((u) => u.role === role) : [];
        const laNut = chon.some((u) => u.name === D[f]), oGo = !chon.length || (D[f] && !laNut) || (S.bcKhac || {})[f];
        return `<span class="sm">${ten}</span>${chon.length ? `<div class="row gap6" style="overflow-x:auto">${chon.map((u) => `<button class="chip s ${D[f] === u.name ? 'on' : ''}" ${dinh} data-a="bcpick" data-k="${f}" data-v="${esc(u.name)}">${esc(u.name)}</button>`).join('')}<button class="chip s ${oGo ? 'on' : ''}" ${dinh} data-a="bckhac" data-k="${f}">Khác…</button></div>` : ''}
          ${oGo ? `<input class="inp s" id="bcd_${f}" maxlength="120" autocomplete="off" placeholder="${esc(goiY || 'Họ tên')}" data-model="bcd_${f}" value="${esc(D[f] || '')}">` : ''}`;
      }).join('')}
      <span class="sm muted" style="line-height:1.4">Khi chép báo cáo, các ô này thành mẫu dùng chung: mọi người soạn và các ca sau đều điền sẵn theo.</span>`;
    if (k === 's4' && typeof S.bcM.s4 !== 'string') return bcViecHtml(B);
    const t = bcGet(k);
    // mục 3: chọn nguồn số — số tổ báo (tổ chưa báo lấy số thiết lập), hoặc chỉ số thiết lập
    const nguonO = k !== 's3' ? '' : `<div class="row gap6">${[['to', 'Theo tổ báo'], ['tl', 'Chỉ số thiết lập']].map(([v, n]) => `<button class="chip s f1 ${(S.bcNguon === 'tl' ? 'tl' : 'to') === v ? 'on' : ''}" style="min-width:0;white-space:nowrap" data-a="bcnguon" data-v="${v}">${n}</button>`).join('')}</div>`;
    // đủ cao để thấy cả mục: tính cả dòng dài tự xuống hàng (khoảng 34 chữ một hàng ở màn 360–390px)
    const dong = Math.max(2, Math.min(18, t.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / 34)), 0) + 1));
    return `${nguonO}<textarea class="inp s" id="bc_${k}" rows="${dong}" style="height:auto;padding:8px 10px;font:inherit;font-size:16px;line-height:1.4;resize:vertical" data-model="bc_${k}">${esc(t)}</textarea>
      <span class="sm muted">Mỗi dòng là một gạch đầu dòng.</span>
      ${k === 's4' ? '<button class="sm" style="border:0;background:transparent;color:var(--pri);text-decoration:underline;padding:0;text-align:left" data-a="bclay" data-k="s4">Về soạn theo dòng (bỏ chữ đã sửa)</button>' : ''}
      ${k === 's6' && typeof S.bcM[k] === 'string' ? '<button class="sm" style="border:0;background:transparent;color:var(--pri);text-decoration:underline;padding:0;text-align:left" data-a="bcktmau">Đặt các dòng này làm mẫu cho các ca sau</button>' : ''}`;
  };
  const P = bcPhan(), K = bcKhac(), coRieng = bcCoKhac(K);
  // mục 3 đọc được ngay tổ nào tự báo, tổ nào đang lấy số thiết lập, tổ nào chưa báo (bản chép đi vẫn đúng chữ của mẫu)
  const nhan = { da: '<span class="badge ok" style="flex:none;font-size:12px;padding:2px 8px">Đã báo</span>', tlda: '<span class="badge pri" style="flex:none;font-size:12px;padding:2px 8px">Số thiết lập</span>',
    tl: `<span class="badge ${quaHan ? 'bad' : 'warn'}" style="flex:none;font-size:12px;padding:2px 8px">Chưa báo · số thiết lập</span>`,
    chua: `<span class="badge ${quaHan ? 'bad' : 'warn'}" style="flex:none;font-size:12px;padding:2px 8px">${quaHan ? 'Quá hạn' : 'Chưa báo'}</span>`, kia: '' };
  const s3Html = `<div class="col" style="gap:0;margin:2px 4px 0 0;font-size:15px;line-height:1.45"><span>${esc(P.s3[0])}</span>${P.s3.slice(1).map((l, i) => `<div class="row gap8" style="align-items:flex-start;padding:3px 0"><span class="f1" style="min-width:0">${esc(l)}</span>${nhan[Q.hang[i]] || ''}</div>`).join('')}</div>`;
  const ib = (a, k, ten, hinh, on) => `<button class="ib${on ? ' on' : ''}" data-a="${a}" data-k="${k}" aria-label="${ten}" title="${ten}">${hinh}</button>`;
  const muc = [['dau', 'Phần đầu']].concat(BC_MUC).map(([k, ten]) => {
    const mo = S.bcMo === k, sua = k !== 'dau' && (typeof S.bcM[k] === 'string' || (k === 's4' && bcVChinh(B, S.bcV)));
    // phần mình sửa mà chưa chép (mới chỉ nằm trên máy này) nói khác hẳn phần đã sửa tay và đã lưu chung
    const rieng = k === 'dau' ? Object.keys(K.dau).length > 0 : k in K.muc || (k === 's3' && !!K.nguon) || (k === 's4' && !!K.viec);
    // mục 4: dòng đã chỉnh mà đơn đã đi tiếp thì luôn nhắc, kể cả khi đang có phần sửa chưa chép
    const lech = k === 's4' && typeof S.bcM.s4 !== 'string' ? bcViecDs(B, S.bcV).dong.filter((x) => x.lech).length : 0;
    const trangThai = rieng ? '<b style="color:var(--warn)">sửa chưa chép</b>' + (lech ? ` · <b style="color:var(--warn)">${lech} dòng khác số đơn</b>` : '')
      : k === 'dau' ? (thieu.length ? `<span style="color:var(--warn)">${thieu.length} ô trống</span>` : '')
      : k === 's4' && typeof S.bcM.s4 !== 'string' ? bcVNhan(B) : sua ? '<b>đã sửa tay</b>'
      : k === 's5' && thieuMm ? '<b style="color:var(--warn)">chưa có, bấm sửa để điền</b>' : 'từ ' + nguonTen[k];
    return `<div style="border-bottom:1px solid var(--line);padding:6px 8px 8px 12px${k === 's3' ? ';scroll-margin-top:8px' : ''}"${k === 's3' ? ' id="bcb3"' : ''}><div class="row gap6"><span class="f1 sm muted" style="min-width:0;line-height:1.3"><b style="color:var(--ink)">${ten}</b>${trangThai ? ' · ' + trangThai : ''}</span>
        ${k === 's3' ? '<button class="ib" data-a="bctl" aria-label="Thiết lập ca và quân số các tổ" title="Thiết lập ca và quân số các tổ">' + IC_BC.cai + '</button>' : ''}${sua ? ib('bclay', k, 'Lấy lại số từ app cho ' + ten, IC_BC.lay) : ''}${ib('bcchep', k, 'Chép ' + ten, IC_BC.chep)}${ib('bcsua', k, (mo ? 'Sửa xong ' : 'Sửa ') + ten, mo ? IC_BC.xong : IC_BC.sua, mo)}</div>
      ${mo ? `<div class="col gap6" style="padding:6px 4px 2px 0">${suaO(k)}</div>` : k === 's3' && typeof S.bcM.s3 !== 'string' ? s3Html
        : `<pre style="white-space:pre-wrap;word-break:break-word;margin:2px 4px 0 0;font:inherit;font-size:15px;line-height:1.45">${esc(P[k].join('\n'))}</pre>`}
      ${k === 's3' && !mo && Q.chua.length && caKhoa(B) >= caKhoa(B.hien) ? `<button class="btn s full" style="margin-top:6px" data-a="bcnhac">Chép tin nhắc ${Q.chua.length} tổ chưa báo (dán vào Zalo)</button>` : ''}</div>`;
  }).join('');
  return `${top}${chips}<div class="f1 scroll pad col gap8" id="body">
    <div class="card" style="padding:0;overflow:hidden">${muc}</div>
    ${coRieng ? `<div class="row gap8 sm" style="line-height:1.4;align-items:flex-start"><span class="f1" style="min-width:0;color:var(--warn)">Phần <b>sửa chưa chép</b> mới chỉ nằm trên máy này. Bấm <b>Chép báo cáo</b> để lưu thành bản chung cho mọi người soạn.</span><button class="chip s" style="flex:none" data-a="bcbo">Bỏ phần sửa</button></div>` : ''}
    <span class="sm muted" style="line-height:1.4">Báo cáo của ca và mẫu là một bản dùng chung. Phần đã sửa tay giữ nguyên chữ; các phần khác tự lấy số mới nhất từ app.</span>
    ${B.bao ? `<span class="sm ${chep === 'doi' ? '' : 'muted'}" style="line-height:1.4${chep === 'doi' ? ';color:var(--warn);font-weight:600' : ''}">Đã chép lúc ${dmy(B.bao.ts)} · ${esc(B.bao.by_name)}${chep === 'doi' ? '. Nội dung đã đổi sau lần chép đó: bấm Chép lại để gửi bản mới.' : ''}</span>` : ''}
  </div>`;
}
/* --- Thống kê quân số ---
   Màn riêng, không dính tới báo cáo ca. Đếm theo CÔNG (một người trong một ca). Mỗi tổ, mỗi ca lấy số theo thứ tự:
   tổ tự báo → số thiết lập đã chép lúc hết ca → ca thiếu số (xem qsChotCa / qsThongKe ở src/quanso.js). OFF luân
   phiên tính là nghỉ. % nghỉ = công nghỉ ÷ (đi làm + nghỉ); của toàn bộ, của một khoảng ngày thì cộng công rồi mới chia
   (tổ đông người, ngày đông người nặng hơn). Server gửi số thô của tháng đang xem và ba tháng trước; lọc ca và cộng ở đây.
   HAI CÁCH XEM, cùng một khuôn để so sánh — kỳ đang xem đặt cạnh ba kỳ liền trước và một mốc trung bình dài hơn:
   - THEO NGÀY: ngày đang xem với 3 ngày liền trước và TB tháng (từ đầu tháng tới hôm nay).
   - THEO THÁNG: tháng đang xem với 3 tháng liền trước và TB 3 tháng đó.
   S.tk = số thô, S.tkChe = 'ngay' | 'thang' (nhớ trên máy), S.tkNgay = ngày đang xem, S.tkThang = 'YYYY-MM' đang xem,
   S.tkCa = 0 cả hai ca | 1 | 2, S.tkTo = tổ đang xem riêng, S.tkNgMo = đang mở ô đổi ngưỡng. */
const TK_MAU = { om: '#B03A2E', phep: '#1F6FB2', que: '#7D3C98', gd: '#B9770E', off: '#5D6D7E', khac: '#138D75' };
const TK_THU = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const tkPct = (x) => (x == null ? '—' : (Math.round(x * 1000) / 10).toFixed(1).replace('.', ',') + '%');
const tkDiem = (x) => (Math.round(x * 1000) / 10).toFixed(1).replace('.', ',');
const tkSo = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
// mặc định xem THEO THÁNG (thống kê là chuyện các ngày đã qua; ca đang diễn ra xem ở báo cáo ca)
const tkChe = () => (S.tkChe || (gcNho('kt:tkche') === 'ngay' ? 'ngay' : 'thang'));
// xem theo ngày mà chưa chọn ngày: hôm qua (ngày đã đủ hai ca)
const tkNgayCua = () => { const t = S.boot ? S.boot.today : ''; return S.tkNgay && S.tkNgay <= t ? S.tkNgay : t ? congNgay(t, -1) : ''; };
const tkThangCua = () => (tkChe() === 'ngay' ? tkNgayCua().slice(0, 7) : S.tkThang || (S.boot ? S.boot.today.slice(0, 7) : ''));
const tkCongThang = (t, n) => { const [y, m] = t.split('-').map(Number); return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7); };
const tkCuoiThang = (t) => new Date(Date.parse(tkCongThang(t, 1) + '-01') - 864e5).toISOString().slice(0, 10);
const tkTenThang = (t) => 'tháng ' + Number(t.slice(5)) + '/' + t.slice(0, 4);
const tkThu = (k) => TK_THU[new Date(k + 'T00:00:00Z').getUTCDay()];
const tkNgayNgan = (k) => fmtDay(k).slice(0, 5);
// khoảng ngày cần tải: tháng đang xem và ba tháng trước (đủ cho cả "3 ngày trước" của những ngày đầu tháng)
const tkCan = () => { const t = tkThangCua(); return { tu: tkCongThang(t, -3) + '-01', den: tkCuoiThang(t) }; };
async function tkTai() {
  const c = tkCan();
  return api('GET', `/quanso/thongke?tu=${c.tu}&den=${c.den}`);
}
// đã có đủ số cho kỳ đang xem thì chỉ vẽ lại, không thì tải
function tkDam() {
  const c = tkCan(), T = S.tk;
  if (T && T.tu <= c.tu && T.den >= c.den) { render(); const b = document.getElementById('body'); if (b) b.scrollTop = 0; return; }
  S.tk = null; go('qstk', true);
}
/* Các dòng số đã gộp hai nguồn (tổ tự báo đè số chép lúc hết ca), tính một lần cho mỗi lần tải. Dòng tổ tự báo mà không
   có ai đi làm hay nghỉ (cả tổ làm ca kia) không phải một ca của tổ, bỏ qua. */
function tkDong(T) {
  if (T._dong) return T._dong;
  const da = new Set(T.qs.map((r) => r.ngay + ':' + r.ca + ':' + r.u));
  const ds = T.qs.map((r) => ({ ...r, nguon: 'to' })).concat(T.tl.filter((r) => !da.has(r.ngay + ':' + r.ca + ':' + r.u)).map((r) => ({ ...r, nguon: r.lam == null ? 'thieu' : 'tl' })))
    // số tạm: ca đang diễn ra, tổ chưa báo thì tạm lấy số thiết lập (như báo cáo ca), để hai màn cùng một số
    .concat((T.tam || []).map((r) => ({ ...r, nguon: 'tl' })))
    .map((r) => ({ ...r, n: qsSoNghi(r.nghi) })).filter((r) => r.nguon === 'thieu' || r.lam + r.n > 0);
  Object.defineProperty(T, '_dong', { value: ds, enumerable: false, configurable: true });
  return ds;
}
/* Cộng số của một khoảng ngày: mỗi tổ, toàn bộ, từng ngày. tu: 'YYYY-MM' (cả tháng) hoặc 'YYYY-MM-DD' (tới den, mặc
   định đúng ngày đó). ca: 0 cả hai ca, 1 ca ngày, 2 ca đêm. toId: chỉ một tổ. */
function tkTinh(T, tu, ca, den, toId) {
  if (tu.length === 7) { den = tkCuoiThang(tu); tu += '-01'; } else if (!den) den = tu;
  const moi = () => ({ lam: 0, nghi: 0, ly: {}, to: 0, tl: 0, thieu: 0, khac: [], ngaySo: new Set(), caSo: new Set() });
  const to = new Map(T.to.map((u) => [u.id, { id: u.id, name: u.name, deleted: u.deleted, ...moi() }])), tong = moi(), ngay = {};
  for (const r of tkDong(T)) {
    if (r.ngay < tu || r.ngay > den || (ca && r.ca !== ca) || (toId != null && r.u !== toId)) continue;
    if (!to.has(r.u)) to.set(r.u, { id: r.u, name: '(đã xoá)', deleted: 1, ...moi() });
    const t = to.get(r.u), d = ngay[r.ngay] || (ngay[r.ngay] = { lam: 0, nghi: 0, thieu: 0 });
    for (const x of [t, tong]) {
      x[r.nguon]++; x.caSo.add(r.ca);
      if (r.nguon === 'thieu') continue;
      x.ngaySo.add(r.ngay);
      x.lam += r.lam; x.nghi += r.n;
      for (const k in r.nghi) x.ly[k] = (x.ly[k] || 0) + r.nghi[k];
    }
    if (r.nguon === 'thieu') d.thieu++; else { d.lam += r.lam; d.nghi += r.n; }
    if (r.nghi.khac && r.ghi_chu) { const k = { ngay: r.ngay, ca: r.ca, n: r.nghi.khac, gc: r.ghi_chu, ten: t.name }; t.khac.push(k); tong.khac.push(k); }
  }
  const pct = (x) => (x.lam + x.nghi ? x.nghi / (x.lam + x.nghi) : null);
  const ds = [...to.values()].filter((x) => x.to + x.tl + x.thieu > 0 || !x.deleted).map((x) => ({ ...x, pct: pct(x) }));
  Object.values(ngay).forEach((d) => { d.pct = pct(d); });
  // số ngày có số (để ra "đi làm trung bình mỗi ngày")
  const soNgay = Object.values(ngay).filter((d) => d.lam + d.nghi > 0).length;
  return { to: ds, tong: { ...tong, pct: pct(tong), soNgay }, ngay };
}
/* Các kỳ để so sánh, theo cách xem: kỳ đang xem (k), ba kỳ liền trước (truoc, cũ → mới), mốc A (gộp ba kỳ trước) và mốc B
   (dài hơn: TB tháng khi xem ngày; khi xem tháng thì B cũng là ba tháng trước). */
function tkKy() {
  const b = S.boot.today;
  if (tkChe() === 'ngay') {
    const d = tkNgayCua(), m = d.slice(0, 7), cuoi = tkCuoiThang(m);
    return { che: 'ngay', k: d, tu: d, den: d, truoc: [3, 2, 1].map((n) => congNgay(d, -n)), aTu: congNgay(d, -3), aDen: congNgay(d, -1), aTen: 'TB 3 ngày trước',
      bTu: m + '-01', bDen: cuoi < b ? cuoi : b, bTen: 'TB ' + tkTenThang(m).replace(/\/\d+$/, ''), sau: d < b };
  }
  const t = tkThangCua(), t3 = tkCongThang(t, -3);
  return { che: 'thang', k: t, tu: t + '-01', den: tkCuoiThang(t), truoc: [3, 2, 1].map((n) => tkCongThang(t, -n)), aTu: tkCongThang(t, -1) + '-01', aDen: tkCuoiThang(tkCongThang(t, -1)), aTen: tkTenThang(tkCongThang(t, -1)),
    bTu: t3 + '-01', bDen: tkCuoiThang(tkCongThang(t, -1)), bTen: 'TB 3 tháng trước', sau: t < b.slice(0, 7) };
}
// chênh lệch theo điểm phần trăm: nghỉ tăng là xấu (đỏ ▲), giảm là tốt (xanh ▼)
const tkLech = (a, b, chu, tot) => (a == null || b == null ? '<span class="muted">—</span>'
  : Math.abs(a - b) < 0.0005 ? '<span class="muted">bằng</span>'
    : `<b style="color:var(--${(a > b) !== !!tot ? 'bad' : 'ok'});white-space:nowrap">${a > b ? '▲' : '▼'} ${tkDiem(Math.abs(a - b))}${chu ? ' điểm' : ''}</b>`);
/* QUÂN SỐ THEO NGƯỜI (không theo công): mỗi tổ, mỗi ngày — tổng quân số tổ khai (tong, lấy ở lần báo sau cùng trong ngày:
   ca đêm nếu có), đi làm = cộng đi làm hai ca, nghỉ = cộng nghỉ hai ca (mỗi người thuộc một ca). Phần còn lại
   (tong − đi làm − nghỉ) là người của ca chưa có số (ca kia chưa báo, ca chưa hết). Luôn tính cả hai ca: tổng quân số là
   của cả tổ, lọc một ca thì tỷ lệ đi làm / quân số mất nghĩa. Ngày tổ không có tong (ca thiếu số) thì không tính.
   Trả về từng tổ và tổng các tổ: cộng dồn qua các ngày (sTong, sLam, sNghi) và số ngày có số (soNgay). */
function tkQs(T, tu, den, toId) {
  const ngay = new Map();
  for (const r of tkDong(T)) {
    if (r.ngay < tu || r.ngay > den || (toId != null && r.u !== toId)) continue;
    const k = r.u + ':' + r.ngay, x = ngay.get(k) || { u: r.u, tong: null, ca: 0, lam: 0, nghi: 0 };
    if (r.tong != null && r.ca >= x.ca) { x.tong = r.tong; x.ca = r.ca; }
    if (r.nguon !== 'thieu') { x.lam += r.lam; x.nghi += r.n; }
    ngay.set(k, x);
  }
  const moi = () => ({ sTong: 0, sLam: 0, sNghi: 0, soNgay: 0 }), to = new Map(), tong = moi(), ngayCo = new Set();
  for (const [k, x] of ngay) {
    if (!x.tong) continue;
    const t = to.get(x.u) || to.set(x.u, moi()).get(x.u);
    for (const o of [t, tong]) { o.sTong += x.tong; o.sLam += Math.min(x.lam, x.tong); o.sNghi += Math.min(x.nghi, x.tong); }
    t.soNgay++; ngayCo.add(k.split(':')[1]);
  }
  tong.soNgay = ngayCo.size;
  return { to, tong };
}
/* THẺ ĐẦU, gọn: % nghỉ của kỳ đang xem kèm MỘT dòng so với kỳ liền trước, số đi làm / nghỉ, ca thiếu số, nguồn số. So
   sánh chi tiết (từng tổ, từng ngày / tháng) nằm ở bảng các tổ và bảng màu, không lặp lại ở đây. Xem theo ngày thì số là
   người (mỗi người thuộc một ca); xem theo tháng thì là công cả tháng, kèm trung bình người đi làm mỗi ngày. */
function tkTom(T, K, ten, ca, toId, ng) {
  const R = tkTinh(T, K.tu, ca, K.den, toId).tong, A = tkTinh(T, K.aTu, ca, K.aDen, toId).tong, ngay = K.che === 'ngay', ql = isQL();
  const cao = R.pct != null && R.pct >= ng, lamTb = R.soNgay ? Math.round(R.lam / R.soNgay) : null;
  const tam = tkDong(T).some((r) => r.tam && r.ngay >= K.tu && r.ngay <= K.den && (!ca || r.ca === ca) && (toId == null || r.u === toId));
  return `<div class="card ${cao ? 'bad' : ''} col" style="gap:4px">
      <span class="sm muted">${esc(ten)}</span>
      <div class="wrap" style="gap:2px 10px;align-items:baseline"><b style="font-size:30px;line-height:1.1">${R.pct == null ? 'Chưa có số' : 'Nghỉ ' + tkPct(R.pct)}</b>
        ${R.pct != null && A.pct != null ? `<span class="sm">${tkLech(R.pct, A.pct, true)} so với ${esc(K.aTen)} (${tkPct(A.pct)})</span>` : ''}</div>
      <span class="sm">${ngay ? `Đi làm <b>${tkSo(R.lam)}</b> người · nghỉ <b>${tkSo(R.nghi)}</b> người`
        : `Cả tháng: đi làm <b>${tkSo(R.lam)}</b> công · nghỉ <b>${tkSo(R.nghi)}</b> công${lamTb != null ? ` · TB <b>${tkSo(lamTb)}</b> người đi làm/ngày` : ''}`}${R.thieu ? ` · <span style="color:var(--warn);font-weight:700">${R.thieu} ca thiếu số</span>` : ''}</span>
      ${ql ? `<span class="sm muted" style="line-height:1.35">${esc(tkNguonTxt(R))}${tam ? ' · gồm số tạm của ca đang diễn ra' : ''}</span>` : ''}
    </div>`;
}
/* Nghỉ theo lý do: thanh chồng, rồi từng lý do — số công, phần trăm trên tổng công, và chênh với mốc (cùng thước đo % công
   nên so được giữa một ngày với cả tháng, giữa tháng 30 ngày với tháng đang dở). */
function tkLyDoHtml(x, lyDo, moc, mocTen) {
  if (!x.nghi && !(moc && moc.nghi)) return '<span class="sm muted">Không có công nghỉ.</span>';
  if (moc && !(moc.lam + moc.nghi)) moc = null;
  const ds = lyDo.filter(([k]) => x.ly[k] || (moc && moc.ly[k])), c = x.lam + x.nghi, cm = moc ? moc.lam + moc.nghi : 0;
  const ti = (o, k, cc) => (cc ? (o.ly[k] || 0) / cc : null);
  return `${x.nghi ? `<div style="display:flex;height:16px;border-radius:8px;overflow:hidden;background:var(--line)" role="img" aria-label="Nghỉ theo lý do">${ds.filter(([k]) => x.ly[k]).map(([k]) => `<span style="flex:${x.ly[k]} 0 0;background:${TK_MAU[k]}"></span>`).join('')}</div>` : ''}
    <div class="card sm" style="display:grid;grid-template-columns:minmax(0,1fr) auto auto${moc ? ' auto' : ''};gap:6px 12px;align-items:center;padding:8px 12px">
      <span class="muted">Lý do</span><span class="muted" style="text-align:right">Công</span><span class="muted" style="text-align:right">% công</span>${moc ? `<span class="muted" style="text-align:right">so ${esc(mocTen)}</span>` : ''}
      ${ds.map(([k, ten]) => `<span class="row" style="gap:6px;min-width:0"><span style="width:10px;height:10px;border-radius:3px;background:${TK_MAU[k]};flex:none"></span><span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(hoa(ten))}</span></span>
        <b style="text-align:right">${tkSo(x.ly[k] || 0)}</b><span style="text-align:right">${tkPct(ti(x, k, c))}</span>${moc ? `<span style="text-align:right">${tkLech(ti(x, k, c), ti(moc, k, cm))}</span>` : ''}`).join('')}
    </div>`;
}
// dòng nguồn số: thống kê tin được tới đâu, và các tổ có chịu báo đều không
const tkNguonTxt = (x) => { const c = x.to + x.tl + x.thieu; return !c ? 'Chưa có ca nào.' : `${c} ca: ` + [['tổ tự báo', x.to], ['số thiết lập', x.tl], ['thiếu số', x.thieu]].filter(([, n]) => n).map(([t, n]) => `${t} ${tkPct(n / c)}`).join(' · '); };
/* BẢNG CÁC TỔ: mọi tổ trong MỘT bảng, cùng các cột — quân số (người, cả tổ), đi làm, nghỉ, % nghỉ, chênh với mốc gần
   (3 ngày trước / tháng trước); dòng dưới tên là ca và lý do nghỉ. Xem theo tháng thì số là trung bình mỗi ngày có số.
   Dòng tổng đứng đầu; tổ không có số vẫn có dòng (biết ngay tổ nào thiếu). Xếp: nghỉ nhiều trước (mặc định) hoặc thứ tự tổ. */
function tkBang(T, K, R, A, ca, ng, lyDo) {
  const ngay = K.che === 'ngay', Q = tkQs(T, K.tu, K.den, null), sx = S.tkSx === 'to' ? 'to' : 'nghi';
  const cao = (p) => p != null && p >= ng, tim = (X, id) => X.to.find((t) => t.id === id) || {};
  const cot = 'display:grid;grid-template-columns:minmax(0,1fr) 34px 34px 52px 44px;gap:4px;align-items:center';
  const so = (v, n) => (v == null ? '—' : tkSo(Math.round(n ? v / n : v)));
  // nghỉ trung bình mỗi ngày thường chỉ 1–2 người: một chữ số lẻ, không thì tổ nghỉ 3% và tổ nghỉ 6% cùng hiện "1"
  const so1 = (v, n) => (n ? (Math.round((v / n) * 10) / 10).toFixed(1).replace('.', ',') : so(v));
  // lý do: số người nghỉ (xem ngày) hoặc tổng công nghỉ cả tháng (trung bình mỗi ngày thường dưới 1, làm tròn ra 0)
  const lyTxt = (x) => (ngay ? '' : 'cả tháng ') + lyDo.filter(([k]) => x.ly[k]).map(([k, t]) => `${x.ly[k]} ${t}`).join(' · ');
  const caTxt = (x) => (x.caSo.size > 1 ? '2 ca' : x.caSo.has(2) ? 'Ca đêm' : x.caSo.has(1) ? 'Ca ngày' : '');
  const qsCua = (q) => (q && q.sTong ? (ngay ? q.sTong : q.sTong / q.soNgay) : null);
  const dong = (x, ten, tong, id) => {
    const nd = ngay ? 0 : x.ngaySo.size, coSo = x.pct != null;
    const qs = qsCua(tong ? Q.tong : Q.to.get(id)), qsTxt = qs == null ? '' : `quân số ${tkSo(Math.round(qs))}`;
    const phu = tong ? qsTxt
      : x.thieu && !coSo ? '<span style="color:var(--warn);font-weight:700">thiếu số</span>'
      : !coSo ? 'không có số (nghỉ, làm ca khác hoặc ca chưa hết)'
      : [qsTxt, caTxt(x), x.nghi ? lyTxt(x) : 'không ai nghỉ'].filter(Boolean).join(' · ') + (x.thieu ? ` · <span style="color:var(--warn)">${x.thieu} ca thiếu số</span>` : '')
        + (() => { const q = ngay && Q.to.get(id), con = q ? q.sTong - q.sLam - q.sNghi : 0; return con > 0 ? ` · còn ${con} người chưa có số` : ''; })();
    const trong = `<span class="col" style="gap:1px;min-width:0"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:${tong ? 800 : 600}">${esc(ten)}</span>${phu ? `<span class="muted" style="font-size:12px;line-height:1.25;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${phu}</span>` : ''}</span>
      <span style="text-align:right">${coSo ? so(x.lam, nd) : '—'}</span><span style="text-align:right;${x.nghi ? 'color:var(--bad);font-weight:700' : ''}">${coSo ? (ngay ? so(x.nghi) : so1(x.nghi, nd)) : '—'}</span>
      <span style="text-align:center;border-radius:6px;padding:2px 0;font-weight:800;${cao(x.pct) ? 'background:var(--badbg);color:var(--bad)' : coSo ? 'background:#ECE9E1' : 'color:var(--mut)'}">${coSo ? tkPct(x.pct) : '—'}</span>
      <span style="text-align:right;font-size:12px">${coSo ? tkLech(x.pct, tong ? A.tong.pct : tim(A, id).pct) : ''}</span>`;
    return tong ? `<div style="${cot};padding:8px 12px;background:#F3F1EC;border-bottom:1px solid var(--line)">${trong}</div>`
      : `<button style="${cot};width:100%;border:0;border-bottom:1px solid var(--line);background:${cao(x.pct) ? '#FFF6F5' : '#fff'};padding:7px 12px;text-align:left;font:inherit;color:inherit" data-a="tkto" data-v="${id}">${trong}</button>`;
  };
  const thu = new Map(T.to.map((u, i) => [u.id, i])), hang = (t) => (t.pct != null ? t.pct : t.thieu ? -0.5 : -1);
  const ds = R.to.filter((t) => !t.deleted || t.pct != null || t.thieu)
    .sort(sx === 'to' ? (a, z) => (thu.has(a.id) ? thu.get(a.id) : 999) - (thu.has(z.id) ? thu.get(z.id) : 999) : (a, z) => hang(z) - hang(a));
  const soTo = ds.filter((t) => t.pct != null || t.thieu).length;
  return `<div class="row gap6" style="align-items:center"><b class="f1">Bảng các tổ</b>
      ${[['nghi', 'Nghỉ nhiều trước'], ['to', 'Thứ tự tổ']].map(([v, t]) => `<button class="chip s ${sx === v ? 'on' : ''}" style="flex:none;white-space:nowrap;padding:4px 10px;font-size:14px" data-a="tksx" data-v="${v}">${t}</button>`).join('')}</div>
    <div class="card sm" style="padding:0;overflow:hidden">
      <div class="muted" style="${cot};padding:6px 12px;font-size:12px;line-height:1.15;border-bottom:1px solid var(--line)"><span>Tổ</span><span style="text-align:right">Đi làm</span><span style="text-align:right">Nghỉ</span><span style="text-align:center">% nghỉ</span><span style="text-align:right">so ${ngay ? '3 ngày' : 'th. trước'}</span></div>
      ${dong(R.tong, `Tổng ${soTo} tổ`, true)}${ds.map((t) => dong(t, t.name, false, t.id)).join('')}</div>
    <span class="sm muted" style="line-height:1.4">Quân số (dưới tên tổ): người của cả tổ, hai ca${ngay ? '' : ', TB mỗi ngày'}. Đi làm, nghỉ${ca ? ' theo ca đang lọc' : ''}${ngay ? '' : ': trung bình mỗi ngày có số'}. Đỏ: nghỉ từ ${T.nguong}%. Chạm một tổ để xem riêng.</span>`;
}
/* BẢNG MÀU: tổ (hàng) × kỳ (cột: 7 ngày gần đây khi xem ngày, 4 tháng khi xem tháng). Ô tô theo % nghỉ — nhìn một lần
   thấy tổ nào nghỉ nhiều vào lúc nào và có kéo dài không. Chạm ô để sang kỳ đó, chạm tên để xem riêng tổ. */
const tkNen = (p, thieu, co, ng) => (p == null ? (thieu ? ['var(--warnbg)', 'var(--warn)'] : co ? ['#fff', 'var(--mut)'] : ['transparent', 'var(--mut)'])
  : p >= ng ? ['#F2C4BF', 'var(--bad)'] : p >= ng / 2 ? ['#F8E2B8', '#6B4500'] : p > 0 ? ['#DCE6F2', 'var(--ink)'] : ['var(--okbg)', 'var(--ok)']);
function tkNhiet(T, K, ca, ng) {
  const ngay = K.che === 'ngay', b = S.boot.today, het = ngay ? b : b.slice(0, 7);
  const cols = ngay ? [6, 5, 4, 3, 2, 1, 0].map((n) => congNgay(K.k, -n)).map((k) => ({ k, tu: k, den: k, nhan: String(Number(k.slice(8))), phu: tkThu(k) }))
    : K.truoc.concat(K.k).map((k) => ({ k, tu: k + '-01', den: tkCuoiThang(k), nhan: 'Th' + Number(k.slice(5)), phu: k.slice(0, 4) }));
  const X = cols.map((c) => tkTinh(T, c.tu, ca, c.den)), cua = (x, id) => x.to.find((t) => t.id === id);
  // tổ đang dùng app, cộng tổ đã thôi mà còn số trong các kỳ này
  const tos = T.to.filter((u) => !u.deleted || X.some((x) => { const t = cua(x, u.id); return t && t.to + t.tl + t.thieu > 0; }));
  const luoi = `display:grid;grid-template-columns:minmax(84px,1fr) repeat(${cols.length},minmax(0,${ngay ? 38 : 56}px));gap:3px;align-items:center`;
  const o = (x, c, dam) => {
    const co = x && x.lam + x.nghi > 0, [nen, chu] = tkNen(x ? x.pct : null, x && x.thieu, co, ng), on = c.k === K.k;
    const v = !x || (x.pct == null && !x.thieu) ? '' : x.pct == null ? '?' : String(Math.round(x.pct * 100));
    return `<button style="height:${dam ? 32 : 30}px;min-width:0;border-radius:6px;border:${on ? '2px solid var(--ink)' : '1px solid rgba(0,0,0,.06)'};background:${nen};color:${chu};font:inherit;font-size:13px;font-weight:${dam || (x && x.pct >= ng) ? 800 : 600};padding:0" ${c.k > het ? 'disabled' : `data-a="tkden" data-v="${c.k}"`} aria-label="${esc(c.nhan)}: ${v ? 'nghỉ ' + v + '%' : 'không có số'}">${v}</button>`;
  };
  const hang = tos.map((u) => `<button style="border:0;background:transparent;padding:0;text-align:left;font:inherit;color:inherit;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" data-a="tkto" data-v="${u.id}">${esc(u.name)}</button>${cols.map((c, i) => o(cua(X[i], u.id), c)).join('')}`).join('');
  const mau = (p, t) => { const [nen] = tkNen(p, 0, 1, ng); return `<span class="row" style="gap:4px"><span style="width:14px;height:14px;border-radius:4px;background:${nen};border:1px solid rgba(0,0,0,.08);flex:none"></span>${t}</span>`; };
  const chuThich = mau(0, '0%') + mau(ng / 4, 'dưới ' + String(T.nguong / 2).replace('.', ',') + '%') + mau(ng / 2, 'gần ngưỡng') + mau(ng, 'từ ' + T.nguong + '%')
    + '<span class="row" style="gap:4px"><span style="width:14px;height:14px;border-radius:4px;background:var(--warnbg);color:var(--warn);font-size:11px;font-weight:800;text-align:center;line-height:14px;flex:none">?</span>thiếu số</span>';
  return `<b>% nghỉ ${ngay ? '7 ngày gần đây' : '4 tháng gần đây'}</b>
    <div class="card sm" style="padding:10px 12px;display:flex;flex-direction:column;gap:3px">
      <div class="muted" style="${luoi};font-size:12px;line-height:1.15"><span></span>${cols.map((c) => `<span style="text-align:center;${c.k === K.k ? 'color:var(--ink);font-weight:800' : ''}">${esc(c.nhan)}<br>${esc(c.phu)}</span>`).join('')}</div>
      ${hang ? `<div style="${luoi}">${hang}</div>` : ''}
      <div style="${luoi};border-top:1px solid var(--line);padding-top:4px;margin-top:2px"><b>Toàn bộ</b>${cols.map((c, i) => o(X[i].tong, c, true)).join('')}</div>
    </div>
    <div class="row sm muted" style="gap:6px 12px;flex-wrap:wrap">${chuThich}</div>
    <span class="sm muted" style="line-height:1.4">Số trong ô là % nghỉ. Ô viền đậm: ${ngay ? 'ngày' : 'tháng'} đang xem. Chạm ô để xem ${ngay ? 'ngày' : 'tháng'} đó, chạm tên để xem riêng tổ.</span>`;
}
function vThongKeQs() {
  const T = S.tk, ql = isQL(), che = tkChe(), ngay = che === 'ngay', b = S.boot.today;
  const top = head('Thống kê quân số', ngay ? tkThu(tkNgayCua()).replace(/^T/, 'Thứ ').replace('CN', 'Chủ nhật') + ', ' + fmtDay(tkNgayCua()) : hoa(tkTenThang(tkThangCua())), 'more');
  if (!T) return `${top}${panelWait('qstk')}`;
  const ca = Number(S.tkCa) || 0, K = tkKy(), ng = T.nguong / 100, thang = tkThangCua(), cao = (p) => p != null && p >= ng;
  const R = tkTinh(T, K.tu, ca, K.den), A = tkTinh(T, K.aTu, ca, K.aDen), B = tkTinh(T, K.bTu, ca, K.bDen);
  // thanh chọn HAI hàng: cách xem + ca (ca là ô chọn, ít đổi); rồi lùi / tới / chọn kỳ
  const hop = 'style="flex:none;width:40px;padding:6px 0"';
  const chon = `<div class="col gap6 tbar" style="padding:6px 16px">
    <div class="row gap6">${[['ngay', 'Theo ngày'], ['thang', 'Theo tháng']].map(([v, t]) => `<button class="chip s f1 ${che === v ? 'on' : ''}" style="min-width:0;white-space:nowrap;padding-left:4px;padding-right:4px" aria-pressed="${che === v}" data-a="tkche" data-v="${v}">${t}</button>`).join('')}
      <select class="inp s" style="flex:none;width:112px;padding:0 4px;font-size:15px;font-weight:700${ca ? ';border-color:var(--pri);color:var(--pri)' : ''}" data-change="tkcachon" aria-label="Lọc theo ca">${[[0, 'Cả hai ca'], [1, 'Ca ngày'], [2, 'Ca đêm']].map(([v, t]) => `<option value="${v}" ${ca === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
    <div class="row gap6"><button class="chip s" ${hop} data-a="tkdi" data-v="-1" aria-label="${ngay ? 'Ngày trước' : 'Tháng trước'}">‹</button>
      ${ngay ? `<input class="inp s f1" type="date" style="min-width:0;text-align:center;font-weight:700;padding:0 4px" max="${b}" data-change="tkngaychon" aria-label="Chọn ngày" value="${esc(K.k)}">`
        : `<b class="f1" style="text-align:center">${esc(hoa(tkTenThang(thang)))}</b>`}
      <button class="chip s" style="flex:none;width:40px;padding:6px 0${K.sau ? '' : ';opacity:.35'}" ${K.sau ? 'data-a="tkdi" data-v="1"' : 'disabled'} aria-label="${ngay ? 'Ngày sau' : 'Tháng sau'}">›</button>
      ${K.sau ? `<button class="chip s" style="flex:none;white-space:nowrap;padding-left:10px;padding-right:10px" data-a="tkden" data-v="${ngay ? b : b.slice(0, 7)}">${ngay ? 'Hôm nay' : 'Tháng này'}</button>` : ''}</div></div>`;
  const nguongO = !ql ? '' : !S.tkNgMo ? `<div class="row gap8 sm muted"><span class="f1">Tô đỏ khi nghỉ từ ${T.nguong}% trở lên</span><button class="chip s" style="flex:none" data-a="tkngmo">Đổi</button></div>`
    : `<div class="card col gap6"><b>Ngưỡng tô đỏ</b><div class="row gap8"><span class="f1">Nghỉ từ (%)</span><input class="inp s" style="width:76px;flex:none;text-align:center;font-weight:700" id="tkng" inputmode="numeric" maxlength="3" autocomplete="off" data-model="tkng" value="${esc(fv('tkng', T.nguong))}"></div>
      <div class="row gap6"><button class="btn s f1" data-a="tkngluu">Lưu ngưỡng</button><button class="btn s" style="flex:none" data-a="tkngmo">Thôi</button></div></div>`;
  // cách tính: thu vào một nút, chỉ mở khi cần
  const ghiChu = !S.tkCach ? '<button class="sm" style="border:0;background:transparent;color:var(--pri);text-decoration:underline;padding:0;text-align:left" data-a="tkcach">Cách tính</button>'
    : `<div class="card col sm muted" style="gap:4px;line-height:1.4"><span>Một <b>công</b> là một người trong một ca. OFF luân phiên tính là nghỉ. % nghỉ = công nghỉ ÷ (công đi làm + công nghỉ); của nhiều tổ, nhiều ngày thì cộng công rồi mới chia.</span>
      <span>Tổ không báo: lấy số thiết lập (lúc hết ca; ca đang diễn ra là số tạm). Tổ không báo, không có số thiết lập: ca thiếu số.</span>
      <span>Chênh lệch tính theo điểm phần trăm: ▲ đỏ là nghỉ nhiều hơn, ▼ xanh là ít hơn.</span>
      <button class="sm" style="border:0;background:transparent;color:var(--pri);text-decoration:underline;padding:0;text-align:left" data-a="tkcach">Thu gọn</button></div>`;
  const chep = `<button class="btn full" data-a="tkchep">Chép tóm tắt ${ngay ? 'ngày' : 'tháng'} (dán vào Zalo)</button>`;
  const khacHtml = (ds, kemTen) => (ds.length ? `<b>Lý do khác</b><div class="card" style="padding:4px 12px">${ds.map((k) => `<div class="li sm" style="padding:6px 0"><span>${ngay ? '' : esc(tkNgayNgan(k.ngay)) + ' '}${kemTen ? 'Tổ ' + esc(k.ten) + ' ' : ''}${esc(CA_TEN[k.ca])}: ${k.n} người — ${esc(k.gc)}</span></div>`).join('')}</div>` : '');
  const veTatCa = ql ? '<button class="sm" style="border:0;background:transparent;color:var(--pri);text-decoration:underline;padding:0;text-align:left" data-a="tkto" data-v="">‹ Tất cả các tổ</button>' : '';

  // MỘT TỔ (người quản lý chạm vào một tổ, hoặc Tiểu đội trưởng — chỉ thấy tổ mình)
  const motTo = S.tkTo != null ? R.to.find((t) => t.id === S.tkTo) || T.to.find((t) => t.id === S.tkTo) : !ql && T.to.length === 1 ? R.to[0] || T.to[0] : null;
  if (motTo) {
    const id = motTo.id, X = tkTinh(T, K.tu, ca, K.den, id).tong, M = tkTinh(T, K.bTu, ca, K.bDen, id).tong;
    let lich = '';
    if (!ngay) {
      // lịch tháng tô theo % nghỉ từng ngày; chạm một ngày để xem ngày đó
      const bo = tkTinh(T, thang, ca, undefined, id).ngay;
      const dau = (new Date(thang + '-01T00:00:00Z').getUTCDay() + 6) % 7, cuoi = Number(tkCuoiThang(thang).slice(8)), o = [];
      for (let i = 0; i < dau; i++) o.push('<span></span>');
      for (let i = 1; i <= cuoi; i++) {
        const k = thang + '-' + two(i), d = bo[k], p = d ? d.pct : null;
        const nen = !d ? '#fff' : p == null ? 'var(--warnbg)' : cao(p) ? 'var(--badbg)' : p > 0 ? '#E8EEF6' : 'var(--okbg)';
        o.push(`<button class="col" style="align-items:center;justify-content:center;gap:0;min-height:44px;padding:0;border-radius:8px;border:1px solid var(--line);background:${nen};font:inherit;color:inherit${k > b ? ';opacity:.4' : ''}" ${k > b ? 'disabled' : `data-a="tkxemngay" data-v="${k}"`} aria-label="Ngày ${i}"><span class="muted" style="font-size:12px">${i}</span><b style="font-size:13px${cao(p) ? ';color:var(--bad)' : ''}">${!d ? '' : p == null ? '?' : tkPct(p).replace(',0%', '%')}</b></button>`);
      }
      lich = `<b>Từng ngày</b><div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px">${['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((x) => `<span class="sm muted" style="text-align:center">${x}</span>`).join('')}${o.join('')}</div>
        <span class="sm muted">Ô đỏ: nghỉ từ ${T.nguong}%. Ô vàng có dấu ?: ca thiếu số. Chạm một ngày để so với 3 ngày trước.</span>`;
    }
    return `${top}${chon}<div class="f1 scroll pad col gap8" id="body">
      ${veTatCa}
      ${tkTom(T, K, 'Tổ ' + motTo.name, ca, id, ng)}
      ${lich}
      <b>Nghỉ theo lý do</b>${tkLyDoHtml(X, T.lyDo, ql ? M : null, ngay ? 'TB tháng' : 'TB 3 th.')}
      ${khacHtml(X.khac, false)}
      ${X.lam + X.nghi + X.thieu ? chep : ''}
      ${ghiChu}</div>`;
  }

  // TOÀN BỘ: thẻ đầu, bảng các tổ, bảng màu, lý do — mỗi khối nói một việc, không lặp số của nhau
  const coSo = R.to.some((t) => t.pct != null || t.thieu);
  // ca đang diễn ra là việc của báo cáo ca: xem hôm nay thì có lối sang đó
  const homNay = ql && ngay && K.k === b ? '<button class="card col" style="gap:2px;text-align:left;font:inherit;color:inherit;width:100%" data-a="nav" data-s="baocaoca"><b>Hôm nay đang diễn ra</b><span class="sm">Tổ báo, nhắc tổ chưa báo, soạn và chép báo cáo ca: ở <u style="color:var(--pri)">Báo cáo ca ›</u></span></button>' : '';
  const soCo = R.to.filter((t) => t.pct != null || t.thieu).length, soTo = T.to.filter((u) => !u.deleted).length;
  return `${top}${chon}<div class="f1 scroll pad col gap8" id="body">
    ${homNay}
    ${tkTom(T, K, ql ? `Toàn bộ · ${soCo}/${soTo} tổ có số` : 'Tổ của bạn', ca, null, ng)}
    ${!coSo ? `<div class="muted">${ngay ? 'Chưa có số quân số nào trong ngày này.' : 'Chưa có số quân số nào trong tháng này.'}</div>` : `
    ${ql ? tkBang(T, K, R, A, ca, ng, T.lyDo) : ''}
    ${ql ? tkNhiet(T, K, ca, ng) : ''}
    <b>Nghỉ theo lý do (${tkSo(R.tong.nghi)} công)</b>${tkLyDoHtml(R.tong, T.lyDo, B.tong, ngay ? 'TB tháng' : 'TB 3 th.')}
    ${ngay ? khacHtml(R.tong.khac, true) : ''}`}
    ${nguongO}
    ${coSo ? chep : ''}
    ${ghiChu}</div>`;
}
// tóm tắt ngày / tháng ra chữ để dán Zalo, kèm so sánh với các mốc
function tkChu() {
  const T = S.tk, ca = Number(S.tkCa) || 0, K = tkKy(), ngay = K.che === 'ngay', ql = isQL();
  const toId = S.tkTo != null ? S.tkTo : null;
  const R = tkTinh(T, K.tu, ca, K.den, toId), A = tkTinh(T, K.aTu, ca, K.aDen, toId).tong, B = tkTinh(T, K.bTu, ca, K.bDen, toId).tong;
  const ly = (x) => T.lyDo.filter(([k]) => x.ly[k]).map(([k, t]) => `${x.ly[k]} ${t}`).join(', ');
  // xem ngày: mỗi người thuộc một ca nên công là người, gọi đúng như trên màn
  const dv = ngay ? 'người' : 'công';
  const lech = (a, b) => (a == null || b == null ? '' : Math.abs(a - b) < 0.0005 ? ' (bằng)' : ` (${a > b ? 'tăng' : 'giảm'} ${tkDiem(Math.abs(a - b))} điểm)`);
  const ds = toId != null || !ql ? [] : R.to.filter((t) => t.pct != null).sort((a, z) => z.pct - a.pct);
  const soCo = R.to.filter((t) => t.pct != null || t.thieu).length, soTo = T.to.filter((u) => !u.deleted).length;
  const ten = toId != null ? 'Tổ ' + ((R.to.find((t) => t.id === toId) || {}).name || '') : ql ? `Toàn bộ (${soCo}/${soTo} tổ có số)` : 'Tổ ' + ((R.to[0] || {}).name || '');
  return [`${ngay ? 'QUÂN SỐ NGÀY ' + fmtDay(K.k) : 'THỐNG KÊ QUÂN SỐ ' + tkTenThang(K.k).toUpperCase()} (${['cả hai ca', 'ca ngày', 'ca đêm'][ca]})`,
    `${ten}: nghỉ ${tkPct(R.tong.pct)} (${tkSo(R.tong.nghi)}/${tkSo(R.tong.lam + R.tong.nghi)} ${dv})${R.tong.nghi ? ' — ' + ly(R.tong) : ''}`,
    `So với ${K.aTen}: ${tkPct(A.pct)}${lech(R.tong.pct, A.pct)}` + (K.bTu !== K.aTu ? ` · ${K.bTen}: ${tkPct(B.pct)}${lech(R.tong.pct, B.pct)}` : '')]
    .concat((() => { const q = tkQs(T, K.tu, K.den, toId).tong, n = q.soNgay || 1, tb = (v) => tkSo(Math.round(v / n)); return q.sTong ? [`Quân số${ngay ? '' : ' TB/ngày'}: ${tb(q.sTong)} người · đi làm ${tb(q.sLam)} · nghỉ ${tb(q.sNghi)}${q.sTong - q.sLam - q.sNghi > 0 ? ` · chưa có số ${tb(q.sTong - q.sLam - q.sNghi)}` : ''}`] : []; })())
    .concat(ds.map((t) => `• Tổ ${t.name}: nghỉ ${tkPct(t.pct)} (${tkSo(t.nghi)}/${tkSo(t.lam + t.nghi)} ${dv})${t.nghi ? ' — ' + ly(t) : ''}`))
    .concat(R.tong.thieu ? [`Ca thiếu số: ${R.tong.thieu}`] : []).join('\n');
}
// biểu tượng của các nút nhỏ trên màn báo cáo ca: chép, sửa, sửa xong, lấy lại số từ app, thiết lập
const IC_BC = (() => {
  const v = (d) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  return {
    chep: v('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>'),
    sua: v('<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>'),
    xong: v('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
    lay: v('<path d="M4 12a8 8 0 1 0 2.6-5.9"/><path d="M4 4v5h5"/>'),
    cai: v('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h0a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6h0a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v0a1.7 1.7 0 0 0 1.6 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  };
})();
// chép chữ vào bộ nhớ tạm; máy / trình duyệt cũ không có clipboard API thì chép bằng ô ẩn
async function bcChepChu(t) {
  try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(t); return true; } } catch (e) { /* thử cách cũ */ }
  try {
    const a = document.createElement('textarea');
    a.value = t; a.setAttribute('readonly', ''); a.style.position = 'fixed'; a.style.opacity = '0';
    document.body.appendChild(a); a.select(); const ok = document.execCommand('copy'); document.body.removeChild(a);
    return ok;
  } catch (e) { return false; }
}
// lưu báo cáo của ca (và phần đầu, máy móc vào mẫu); xong thì bỏ nháp trên máy
/* Gửi kèm ts của bản đã lưu mà mình đang nhìn: người khác đã chép sau đó thì server từ chối, app tải bản đó về, ghép
   phần mình đang sửa lên rồi để người soạn soát và chép lại. Phần đầu chỉ gửi các ô đã sửa, máy móc chỉ gửi khi mục 5
   vừa được sửa: không đè lại mẫu người khác vừa đổi (xem bcPut ở src/baocao.js). */
function bcLuu(van_ban, them, okMsg) {
  const B = S.bcc, K = bcKhac(), mmtb = typeof K.muc.s5 === 'string' ? bcDong(K.muc.s5).join(' – ') : undefined;
  return act(async () => {
    let r;
    try { r = await api('PUT', '/baocao', { ngay: B.ngay, ca: B.ca, ts: B.bao ? B.bao.ts : 0, van_ban, muc: S.bcM, viec: S.bcV, dau: K.dau, mmtb, nguon: S.bcNguon, ...(them || {}) }, 0, false); }
    catch (e) {
      if (e.code === 'changed') {
        try { const M = await api('GET', `/baocao?ngay=${B.ngay}&ca=${B.ca}`); if (S.bcc === B) { bcGhep(M, K); bcNhap(); } } catch (er) { /* vòng tự làm mới sẽ tải lại */ }
      }
      throw e;
    }
    try { localStorage.removeItem(bcKey(B)); } catch (e) { /* bỏ qua */ }
    // server không ghi gì (nội dung y như bản đang lưu) thì giữ nguyên dòng "đã chép lúc" của bản đó
    const giu = B.bao && r.ts === B.bao.ts ? { by_id: B.bao.by_id, by_name: B.bao.by_name } : { by_id: S.me.id, by_name: r.by_name || S.me.name };
    B.bao = { muc: { ...S.bcM }, viec: JSON.parse(JSON.stringify(S.bcV)), nguon: S.bcNguon, van_ban, ts: r.ts, ...giu };
    B.mau = { ...B.mau, dau: { ...S.bcDau }, ...(mmtb != null ? { mmtb } : {}) };
    if (them && them.kt_mau) B.mau.kt = bcDong(S.bcM.s6);
  }, okMsg);
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
/* Giao khu chỉ cho Tiểu đội trưởng đang dùng được. Người đang đứng tên khu mà vừa BỊ KHOÁ vẫn phải
   hiện trong bảng chọn: họ nằm sẵn trong danh sách gửi lên, server từ chối cả lượt lưu vì họ, mà
   không hiện thì admin không có gì để bỏ chọn. (Người đổi vai trò thì server đã gỡ khỏi khu rồi.) */
const kuDuoc = (u) => u.role === 'tieudoi' && !u.locked;
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
      ${(S.users || []).filter((u) => !u.deleted && (kuDuoc(u) || S.kuPick.includes(u.id))).map((u) => `<button class="chip ${S.kuPick.includes(u.id) ? 'on' : ''}" style="justify-content:flex-start;font-size:16px" data-a="kupick" data-v="${u.id}">${esc(u.name)} · ${roleTen(u.role)}${kuDuoc(u) ? '' : ' · <b style="color:var(--bad)">' + (u.locked ? 'đang khoá' : 'không phải Tiểu đội trưởng') + ', bỏ chọn rồi mới lưu được</b>'}</button>`).join('') || '<span class="sm muted">Chưa có tài khoản Tiểu đội trưởng nào.</span>'}
      <span class="sm muted" style="line-height:1.4">${S.kuPick.length ? 'Trong các Tiểu đội trưởng, chỉ ' + S.kuPick.length + ' người được chọn đếm được khu này. CVKTHT trở lên đếm được mọi khu, không cần giao.' : 'Không chọn ai = Tiểu đội trưởng nào cũng đếm được khu này.'}</span>
      <div class="row gap6"><button class="btn s pri f1" data-a="kusave" data-k="${esc(k.id)}">Lưu phân công</button><button class="btn s f1" data-a="kucancel">Huỷ</button></div></div>` : '';
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
    <span class="sm muted" style="line-height:1.45">Từ 2 lần trở lên là <b>bắt buộc</b>: giờ làm chia đều thành các khung. Khung đã qua mà khu chưa đếm thì tính là thiếu và ghi vào nhật ký khi chốt sổ; lần đếm sau không bù được. Khu trống không phải đếm. Mỗi lần báo lại phải duyệt lại.</span>
<button class="btn s" data-a="ssave">Lưu quy tắc</button></div>
    <h2 class="sec">Khu bãi</h2>${khu}
    <div class="card col gap6"><b>Thêm khu mới</b><input class="inp s" id="newk" placeholder="Tên khu, ví dụ: Khu I" data-model="newk" value="${esc(S.form.newk || '')}"><button class="btn s pri" data-a="kadd">Thêm khu</button></div>
    <h2 class="sec">Phi thép (D6 - D36)</h2>
    <div class="sm muted" style="line-height:1.5">Số chuẩn: kg/cây theo TCVN; số cây/bó theo bó Hòa Phát (~3,3 tấn/bó); cuộn D6/D8 ~2.000 kg. Bó có số cây khác thì sửa riêng phi đó. Số thập phân gõ dấu phẩy hoặc dấu chấm.</div>
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
  <div class="card col gap8"><b style="font-size:18px">Đang có trong bãi: ${dangCo} tấn</b>
    <span class="sm muted" style="line-height:1.45">Nên tải một bản sao trước khi đặt lại. Nhật ký và lịch sử đếm không bao giờ bị xoá.</span>
    <div class="row gap6"><button class="btn s f1" data-a="exportday" data-d="${esc(b.today)}">Tải tồn theo khu (CSV)</button>
      <button class="btn s f1" data-a="dlall">Tải báo cáo từ ngày đầu (CSV)</button></div>
  </div>
  <div class="card col gap8"><b style="font-size:18px">Sao lưu toàn bộ</b>
    <span class="sm" style="line-height:1.45">Một tệp chứa <b>tất cả</b> số liệu, tài khoản và nhật ký. Chỉ tệp này <b>nạp lại được</b> (hai tệp CSV ở trên thì không). Nên tải định kỳ và cất ra ngoài máy.</span>
    <button class="btn s pri full" data-a="dlbackup">TẢI BẢN SAO TOÀN BỘ</button>
    <div style="border-top:1px solid var(--line);padding-top:8px" class="col gap6">
      <b class="sm">Nạp lại từ bản sao</b>
      <span class="sm" style="line-height:1.45">Thay <b>sạch</b> số liệu hiện tại bằng số liệu trong tệp, không trộn. Nhật ký giữ nguyên và ghi thêm một dòng.</span>
      <input class="inp s" type="file" accept=".json,application/json" id="bkfile" data-change="bkfile">
      ${S.bkFile ? `<span class="sm b">Đã chọn: ${esc(S.bkFile.ten)} · ${esc(S.bkFile.mo)}</span>
      <label class="sm">Gõ <b>NAP LAI</b> để mở nút<input class="inp s" style="width:100%" id="napword" placeholder="NAP LAI" data-model="napword" value="${esc(S.form.napword || '')}"></label>
      <button class="btn s full ${(S.form.napword || '').trim().toUpperCase() === 'NAP LAI' ? 'bad' : 'dis'}" data-a="dorestore">NẠP LẠI TỪ BẢN SAO</button>` : ''}
    </div>
  </div>
  <div class="card col gap8"><b style="font-size:18px">Đặt tồn về 0 (kiểm kê lại)</b>
    <span class="sm" style="line-height:1.45">Đặt <b>cả bãi = 0</b> từ hôm nay, như vừa kiểm kê lại. Lịch sử và báo cáo cũ <b>vẫn xem được</b>. Hôm nay thành <b>đã chốt</b>, từ mai đếm và nhập bình thường.<br>Bấm nhầm: trong ngày vào Duyệt → <i>Hoàn tác đặt lại số liệu</i>, mọi thứ trở lại <b>đúng như trước</b>.</span>
    <button class="btn s full" style="border:2px solid var(--warn)" data-a="resetzero">ĐẶT TỒN VỀ 0</button>
  </div>
  <div class="card bad col gap8"><b style="font-size:18px">Xoá sạch dữ liệu thép</b>
    <span class="sm" style="line-height:1.45">Xoá <b>mọi</b> số đếm, phiếu, ngày đã chốt và báo cáo theo kỳ; bãi trở lại như mới. <b>KHÔNG hoàn tác được.</b> Dùng khi chạy thử xong, bắt đầu dùng thật.</span>
    <label class="sm">Gõ <b>XOA SACH</b> để mở nút<input class="inp s" style="width:100%" id="wipeword" placeholder="XOA SACH" data-model="wipeword" value="${esc(S.form.wipeword || '')}"></label>
    <button class="btn s full ${go ? 'bad' : 'dis'}" data-a="resetwipe">XOÁ SẠCH DỮ LIỆU THÉP</button>
  </div>`;
}

/* ===================== KHUNG CHÍNH ===================== */
function tabsHtml() {
  const on = { home: 'home', ton: 'home', khu: 'dem', dem: 'dem', nhap: 'nhap', duyet: 'duyet', nhatky: 'more', lichsu: 'more', baocao: 'more', more: 'more', stats: 'more', users: 'more', settings: 'more', pin: 'more', vaymuon: 'more', vaychitiet: 'more', satvun: 'more', giacong: 'giacong', gcdon: 'giacong', gcform: 'giacong', gcsetup: 'giacong', quanso: 'more', baocaoca: 'more', qstk: 'more' }[S.screen];
  const T = [['home', 'Tổng quan', IC.home, true], ['dem', 'Báo cáo', IC.count, true], ['giacong', 'Gia công', IC.gc, true], ['nhap', 'Nhập', IC.inn, canIn()], ['duyet', 'Duyệt', IC.shield, isQL()], ['more', 'Thêm', IC.more, true]].filter((t) => t[3]);
  // đủ 6 tab (CVKTHT trở lên) thì chữ nhỏ lại một cỡ cho vừa màn hình hẹp
  return `<nav class="tabs${T.length > 5 ? ' n6' : ''}">${T.map((t) => `<button class="tab ${on === t[0] ? 'on' : ''}" data-a="nav" data-s="${t[0]}">${t[2]}${t[1]}</button>`).join('')}</nav>`;
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
    case 'more': body = vMore(); break;
    case 'pin': body = vPin(); break;
    case 'users': body = vUsers(); break;
    case 'settings': body = vSettings(); break;
    case 'vaymuon': body = vVayMuon(); break;
    case 'vaychitiet': body = vVayChiTiet(); break;
    case 'satvun': body = vSatVun(); break;
    case 'giacong': body = vGiaCong(); break;
    case 'gcdon': body = vGcDon(); break;
    case 'gcform': body = vGcForm(); break;
    case 'gcsetup': body = vGcSetup(); break;
    case 'quanso': body = vQuanSo(); break;
    case 'baocaoca': body = vBaoCaoCa(); break;
    case 'qstk': body = vThongKeQs(); break;
    default: body = vHome();
  }
  const showToast = S.toast && S.screen !== 'dem';
  const noTabs = S.screen === 'dem' && S.sel;
  return `${busyHtml()}${verBar()}${netBar()}${showToast ? `<div class="toast ${S.toastErr ? 'err' : ''}" data-toast="1" role="${S.toastErr ? 'alert' : 'status'}" aria-live="${S.toastErr ? 'assertive' : 'polite'}" style="margin-top:calc(8px + env(safe-area-inset-top))">${esc(S.toast)}</div>` : ''}${body}${noTabs ? '' : tabsHtml()}${askHtml()}${gcVgHtml()}${gcXuatHtml()}`;
}

function render() {
  const body = document.getElementById('body');
  const mx = document.getElementById('mx');
  const keep = { screen: S._last, b: body ? body.scrollTop : 0, m: mx ? mx.scrollTop : 0, x: {} };
  // hàng nút lọc cuộn ngang (data-sx): nhớ chỗ đang cuộn, vẽ lại xong thì đặt lại
  document.querySelectorAll('[data-sx]').forEach((e) => { keep.x[e.dataset.sx] = e.scrollLeft; });
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
  /* Hàng nút lọc cuộn ngang: không đặt lại thì mỗi lần vẽ lại nó nhảy về đầu — bấm một nút ở cuối hàng (vd "Đã xuất /
     huỷ") xong là chính nút vừa chọn trôi khuất bên phải. Mới vào màn thì kéo nút đang chọn (data-cur) vào tầm nhìn. */
  document.querySelectorAll('[data-sx]').forEach((e) => {
    if (keep.screen === S.screen && keep.x[e.dataset.sx] != null) e.scrollLeft = keep.x[e.dataset.sx];
    const c = e.querySelector('[data-cur]');
    if (!c) return;
    const r = c.getBoundingClientRect(), R = e.getBoundingClientRect();
    if (r.left < R.left || r.right > R.right) e.scrollLeft += r.left - R.left - 16;
  });
  // màn một đơn gia công: vừa gửi tin hoặc vừa mở có tin mới thì cuộn xuống cuối
  if (S.gcXuong && S.screen === 'gcdon' && nb && S.gcDetail) { nb.scrollTop = nb.scrollHeight; S.gcXuong = false; }
  if (S.scrollSel && nm) {
    const idx = S.boot.phiAct.findIndex((p) => p.id === S.scrollSel);
    nm.scrollTop = Math.max(0, ROWH + idx * ROWH - 110);
    S.scrollSel = null;
  }
  if (S.ask) {
    // hộp xác nhận mở: focus vào nút, không giành lại ô nhập — trừ hộp bắt gõ lý do thì vào ô gõ
    const y = S.ask.input ? document.getElementById('askin') : $app.querySelector('[data-a="askyes"]');
    if (y) {
      y.focus();
      if (S.ask.input && fc && fc.id === 'askin') { try { y.setSelectionRange(fc.s, fc.e); } catch (er) { /* bỏ qua */ } }
    }
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

/* khu: chỉ dùng với screen 'dem' — mở THẲNG màn đếm của khu đó (thẻ nhắc ở Tổng quan, nút "Báo cáo
   khu X", nút Back). Không có khu thì tab Báo cáo mở MÀN CHỌN KHU: người đếm phải tự chọn khu mỗi
   lần, để không ai báo nhầm sang khu đã mở lần trước. */
async function go(screen, noPush, khu) {
  // chấm công nay là một mục của màn Nhật ký; lối cũ (nút THỬ LẠI, lịch sử trình duyệt) dẫn về đó
  if (screen === 'chamcong') { S.logTab = 'tk'; screen = 'nhatky'; }
  // màn soạn đơn chỉ vào được khi đang soạn (nút Back về lại sau khi đã lưu thì ra bảng đơn)
  if ((screen === 'gcform' && !(S.gcForm && isQL())) || (screen === 'gcdon' && !S.gcId) || (screen === 'gcsetup' && !isAdmin())) screen = 'giacong';
  if (screen === 'quanso') { S.qsSx = null; Object.keys(S.form).filter((k) => /^(qsh[12]$|tl_)/.test(k)).forEach((k) => delete S.form[k]); }
  S.err = ''; S.sel = null;
  delete S.loadErr[screen];
  // lựa chọn khung giờ chọn dở mà không lưu: vào lại Cài đặt phải thấy số ĐANG LƯU, không phải số chọn dở
  if (screen === 'settings') ['sslots', 'sfrom', 'sto'].forEach((k) => delete S.form[k]);
  if (screen === 'dem') {
    const ok = (id) => id && S.boot.khuBy[id] && S.boot.khuBy[id].active && canCount(id);
    if (!S.boot.khuAct.length) { say('Chưa có khu nào đang dùng. Admin vào Thêm → Cài đặt để thêm khu.', true); S.screen = 'home'; return render(); }
    // khu không hợp lệ / không được đếm, hoặc không chỉ khu nào: về màn chọn khu (có lời nhắc nếu chưa được giao)
    if (ok(khu)) openDem(khu);
    else S.screen = 'khu';
  } else S.screen = screen;
  if (!noPush) pushNav();
  render();
  try {
    if (screen === 'duyet') { S.review = null; S.subs = {}; render(); S.review = await api('GET', '/review'); }
    else if (screen === 'nhatky') { if (S.logTab === 'tk') await loadChamCong(); else await loadAudit(false); }
    else if (screen === 'users') { await loadUsers(); }
    else if (screen === 'lichsu') { await loadHist(S.hist.date || ydayOf(S.boot.today)); }
    else if (screen === 'baocao') { if (!S.bc.from) [S.bc.from, S.bc.to] = repRange('month'); await loadRep(); }
    else if (screen === 'stats') { S.usage = null; render(); S.usage = (await api('GET', '/usage?days=' + S.usageDays)).items; }
    else if (screen === 'settings') { S.kuEdit = null; await loadBoot(); await loadUsers(); }
    else if (screen === 'vaymuon') { S.loans = null; render(); S.loans = await api('GET', '/loans'); }
    else if (screen === 'satvun') { S.svs = null; render(); S.svs = await svTai(); }
    else if (screen === 'vaychitiet') { S.loanDetail = null; render(); S.loanDetail = await api('GET', '/loans?doitac=' + S.loanDt); }
    // bảng đơn giữ bản đang có trong lúc tải lại (khỏi nháy "Đang tải" mỗi lần đổi tab); đơn KHÁC thì phải xoá bản cũ
    else if (screen === 'giacong') { S.gc = await api('GET', '/giacong'); }
    else if (screen === 'gcdon') {
      if (S.gcDetail && S.gcDetail.don.id !== S.gcId) { S.gcDetail = null; render(); }
      S.gcDetail = await api('GET', '/giacong/' + S.gcId);
      // có tin chưa đọc thì mở thẳng xuống cuối, chỗ tin mới
      if (S.gcDetail.tn.some((t) => t.user_id !== S.me.id && t.id > (S.gcDetail.doc || 0))) S.gcXuong = true;
      gcDocXong();
    }
    else if (screen === 'gcform') { if (!S.gc) S.gc = await api('GET', '/giacong'); }
    else if (screen === 'gcsetup') { S.gc = await api('GET', '/giacong'); }
    else if (screen === 'quanso') { await qsTai(); }
    else if (screen === 'baocaoca') { await bcTai(); }
    else if (screen === 'qstk') { S.tk = await tkTai(); }
    else if (['home', 'ton', 'khu', 'nhap', 'dem'].includes(screen)) {
      await loadBoot();
      /* Nháp ở trên dựng từ boot ĐANG CÓ để màn hình lên ngay, mà boot đó có thể là của hôm qua (app
         nằm nền qua đêm): khi ấy số hôm qua bị coi là "hôm nay" và điền sẵn. Có boot mới thì dựng lại.
         Không mất gì của người đếm: mỗi lần đổi ô đều đã ghi nháp xuống máy. */
      if (screen === 'dem' && S.screen === 'dem' && S.boot.khuBy[S.khu]) loadDraft();
    }
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
  if (S.ask) { const a = S.ask; S.ask = null; a.resolve(false); pushNav(); return render(); } // Back = Quay lại
  if (S.sel) { ACTIONS.closesel(); pushNav(); return; } // Back = đóng bảng số
  const st = e.state, sc = st && st.s ? st.s : 'home';
  go(sc, true, sc === 'dem' ? st.k : undefined);
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

// mã ngẫu nhiên 16 chữ hex cho khoá chống ghi trùng của phiếu kho
function khoaMoi() {
  const b = new Array(8).fill(0);
  try { crypto.getRandomValues(new Uint8Array(8)).forEach((x, i) => { b[i] = x; }); }
  catch (e) { for (let i = 0; i < 8; i++) b[i] = Math.floor(Math.random() * 256); }
  return b.map((x) => x.toString(16).padStart(2, '0')).join('');
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
  async logout() { try { await api('POST', '/logout', {}); } catch (e) { /* bỏ qua */ } forgetBoot(); S.me = null; S.stale = null; S.boot = null; S.screen = 'login'; S.form = {}; S.qsH = null; S.err = ''; render(); },
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
  askyes() {
    const a = S.ask;
    if (a && a.input) {
      const t = String(S.form.askin || '').trim();
      if (!t) { a.thieu = true; return render(); } // chưa gõ lý do: đứng lại, nói rõ
      S.ask = null; delete S.form.askin; render();
      return a.resolve(t);
    }
    S.ask = null; render(); if (a) a.resolve(true);
  },
  askno() { const a = S.ask; S.ask = null; delete S.form.askin; render(); if (a) a.resolve(false); },
  retry(d) { S.loadErr = {}; go(d.s); },
  // thẻ nhắc một khu cụ thể (data-k) thì mở thẳng khu đó, không mở khu đếm gần nhất
  nav(d) {
    // thẻ nhắc gia công: mở đúng mục lọc của nó và bỏ chữ đang tìm dở, kẻo vào bảng mà không thấy đơn được nhắc
    if (d.f) { S.gcF = d.f; S.gcHien = null; delete S.form.gcq; }
    if (d.gid) { S.gcId = Number(d.gid); S.gcPct = null; }
    // vào Quân số từ màn Thêm: tải lại số liệu, nút quay lại về màn Thêm
    if (d.s === 'quanso') { S.qs = null; S.qsVe = null; }
    if (d.s === 'qstk') { S.tk = null; S.tkTo = null; S.tkNgay = null; S.tkThang = null; S.tkNgMo = false; }
    // báo cáo ca: vào từ thẻ nhắc hay từ Thêm là ca đang diễn ra; quay về từ bảng quân số mở từ báo cáo thì giữ ca đang soạn
    if (d.s === 'baocaoca') { if (!(S.qsVe === 'baocaoca' && S.screen === 'quanso')) S.bcCa = null; S.bcc = null; S.qsVe = null; S.bcKhac = null; }
    go(d.s, false, d.s === 'dem' ? d.k : undefined);
  },
  khuopen(d) { if (!canCount(d.k)) return say('Bạn không phụ trách khu này.', true), render(); openDem(d.k); pushNav(); render(); },
  zoom(d) { S.zoomK = S.zoomK === d.k ? null : d.k; render(); },
  cell(d) {
    const p = d.p;
    if (S.boot.closed) return say(ngayKhoaMsg(), true), render();
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
    if (S.boot.closed) return say(ngayKhoaMsg(), true), render();
    if (!myPhiList().length) return say('Chưa có phi thép nào trong hệ thống.', true), render();
    // màn đếm để mở qua mốc khung giờ: số điền sẵn của lần đếm trước không được đi theo lần gửi này
    const cu = boSoCu();
    if (cu.length) {
      saveDraft();
      return say('Đã sang lần đếm mới: số của lần đếm trước (' + cu.join(', ') + ') đã bỏ khỏi bảng. Hãy đếm thực tế các phi đó rồi gửi.', true), render();
    }
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
    const them = dc ? `\nLý do: ${reasonName}${note ? ' — ' + note : ''}\n\nĐây là SỬA SỔ, không có thép ra vào bãi.\nPhiếu cần cấp trên duyệt mới vào tồn.`
      : xuat ? `\nXuất cho: ${noi}\n\nPhiếu cần cấp trên duyệt mới trừ vào tồn.` : '';
    if (!(await ask(`${viec} ${where}:\n${list}\nTổng ${fmtT(kg)} tấn${them}\n\nĐúng chưa?`, dc ? 'ĐIỀU CHỈNH' : xuat ? 'GHI PHIẾU XUẤT' : chuyen ? 'CHUYỂN KHU' : 'NHẬP KHO', dc))) return;
    const lines = N.lines.slice();
    /* Khoá chống ghi trùng (xem receiptCtx ở src/phieu.js): một mã cho mỗi phiếu đã xác nhận, giữ nguyên khi bấm lưu
       lại ĐÚNG nội dung đó (lần trước mạng chậm, không rõ đã vào chưa) — server trả lại phiếu đã ghi thay vì ghi thêm.
       Sửa bất cứ gì trong phiếu là thành phiếu khác, mã khác. */
    const dau1 = JSON.stringify([N.mode, N.khu, N.from, N.to, N.dir, N.reason, lines, note, noi]);
    if (!N.khoa || N.khoa.dau !== dau1) N.khoa = { dau: dau1, k: khoaMoi() };
    const khoa = N.khoa.k;
    act(async () => {
      const r = dc
        ? await api('POST', '/adjust', { khu: N.khu, dir: N.dir, lines, reason: N.reason, note, confirm: confirmWord, khoa })
        : xuat
        ? await api('POST', '/xuat', { khu: N.khu, lines, noi, note, khoa })
        : chuyen
        ? await api('POST', '/transfers', { from: N.from, to: N.to, lines, note, khoa })
        : await api('POST', '/receipts', { khu: N.khu, lines, note, khoa });
      N.khoa = null;
      N.lines = []; S.form.nnote = ''; S.form.ndcword = ''; S.form.nnoi = ''; N.reason = null;
      N.done = { id: r.id, text: `${kemTan(lines.map((l) => { const lp = b.phiBy[l.phi]; return l.phi + ' ' + dau + fmtQs(l.qty, lp); }).join(' · '), kg)} · ${where}` };
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
    }, cho ? 'Đã rút lại phiếu.' : 'Đã huỷ phiếu.');
  },
  expand(d) { S.expand[d.p] = !S.expand[d.p]; render(); },
  khumo(d) { S.khuMo[d.k] = !S.khuMo[d.k]; render(); },

  'toggle-normal'() { S.showNormal = !S.showNormal; render(); },
  resolve(d) {
    const mark = markOf(d.k);
    act(async () => {
      try { await api('POST', '/conflict/resolve', { khu: d.k, mark }); S.cmp = null; }
      finally { await Promise.all([reloadReview(), loadBoot()]); }
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
      finally { await Promise.all([reloadReview(), loadBoot()]); }
      say('Đã lưu lựa chọn' + (r.changed ? ' (' + r.changed + ' phi đổi số).' : '.'));
    });
  },
  /* HUỶ báo cáo đang chờ duyệt của một khu. Phải gõ lý do: đó là thứ duy nhất người đếm đọc được
     để biết đếm lại chỗ nào. Huỷ xong số đó rời khỏi màn Duyệt (không còn "chờ duyệt"), khu trở về
     chưa báo. Gửi kèm dấu của khu như lúc duyệt, để không huỷ nhầm một báo cáo vừa tới. */
  async recount(d) {
    const kk = ((S.review && S.review.khus) || []).find((k) => k.khu === d.k);
    const ai = kk && kk.rep ? kk.rep.uname + ' gửi lúc ' + hhmm(kk.rep.ts) : '';
    const ly = await askText('Huỷ báo cáo của ' + kName(d.k) + '?' + (ai ? '\n' + ai : '')
      + '\n\nSố trong báo cáo này sẽ KHÔNG vào tồn và không còn chờ duyệt. Khu trở về "chưa báo"; người gửi thấy thông báo kèm lý do bạn ghi dưới đây.',
      'HUỶ BÁO CÁO', 'Lý do huỷ, ví dụ: D16 đếm thiếu 2 bó');
    if (!ly) return;
    act(async () => {
      try { await api('POST', '/recount', { khu: d.k, ly_do: ly, mark: kk ? kk.mark : undefined }); }
      finally { await Promise.all([reloadReview(), loadBoot()]); }
      say('Đã huỷ báo cáo ' + kName(d.k) + '. Khu trở về chưa báo.');
    });
  },
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
      finally { await Promise.all([reloadReview(), loadBoot()]); }
    }, 'Đã cập nhật số ' + kName(khu) + '.');
  },
  // hoàn tác lần đặt lại số liệu của hôm nay: việc duy nhất còn "mở lại" một ngày đã khoá
  async reopen() {
    const note = val('reopenNote').trim();
    if (!note) return say('Ghi lý do hoàn tác vào ô phía trên.', true), render();
    if (!(await ask('Hoàn tác lần đặt lại số liệu hôm nay?\nSố đếm trước lúc đặt lại được dựng lại, ngày hôm nay mở lại.', 'HOÀN TÁC', true))) return;
    act(async () => { await api('POST', '/reopen', { note }); S.form.reopenNote = ''; await Promise.all([reloadReview(), loadBoot()]); }, 'Đã hoàn tác lần đặt lại số liệu.');
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
      // tệp bản sao có thể nặng vài MB: cho hạn chờ dài hơn hẳn các lời gọi thường
      const r = await api('POST', '/restore', { file: f.data, confirm: 'NAP LAI' }, 180000);
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
  logfind() { S.logTab = 'log'; S.auditF.q = String(val('logq')).trim(); delete S.form.logq; go('nhatky', true); },
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
  // đổi mục trong màn Nhật ký: mục nào chưa có dữ liệu thì nạp, có rồi thì chỉ vẽ lại
  logtab(d) {
    S.logTab = d.v === 'tk' ? 'tk' : 'log';
    if (S.logTab === 'tk' && !S.cc.data) return loadChamCong();
    if (S.logTab === 'log' && !S.audit) return go('nhatky', true);
    render();
  },
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
      await Promise.all([loadUsers(), loadBoot()]);
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
      await Promise.all([loadUsers(), loadBoot()]);
    }, 'Đã xoá tài khoản ' + u.name + '.'
      + (solo.length ? ' ' + solo.map(tenKhu).join(', ') + ' không còn ai phụ trách: mọi người đếm đều đếm được.' : ''));
  },
  async urestore(d) {
    const u = (S.users || []).find((x) => x.id === Number(d.id));
    if (!u) return;
    if (!(await ask(`Khôi phục tài khoản ${u.name}?\nPIN cũ bị thu hồi, hệ thống cấp PIN MỚI hiện ngay sau đây để bạn đưa lại cho họ.`
      + (u.locked ? `\n${u.name} đang bị khoá, khôi phục xong vẫn còn khoá: mở khoá nếu cho dùng lại.` : ''), 'KHÔI PHỤC'))) return render();
    // PIN mới là phản hồi của việc này, hiện bằng đúng thẻ PIN như lúc tạo tài khoản
    act(async () => {
      const r = await api('POST', `/users/${d.id}/restore`, {});
      S.pinShown = { name: u.name, pin: r.pin };
      await Promise.all([loadUsers(), loadBoot()]);
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
      finally { await Promise.all([reloadReview(), loadBoot()]); }
      say('Đã duyệt ' + kName(d.k) + (r.phieu ? ' và ' + r.phieu + ' phiếu của khu.' : '.'));
    });
  },
  async khuduyetall() {
    const R = S.review; if (!R) return;
    const ks = (R.khus || []).filter((k) => (k.waiting || k.phieu.length || k.recheck) && duyetCap(Math.max(k.capBao || 0, k.capPhieu || 0)));
    if (!ks.length) return say('Không còn khu nào bạn duyệt được.', true), render();
    if (!(await ask('Duyệt cả ' + ks.length + ' khu đang chờ?\n' + ks.map((k) => k.name).join(', ')
      + '\nSố của các khu này sẽ thành tồn chính thức. Hãy xem bảng lệch trước khi duyệt hàng loạt.', 'DUYỆT TẤT CẢ'))) return;
    act(async () => {
      let r;
      try { r = await api('POST', '/review/duyet', { all: true, marks: Object.fromEntries((R.khus || []).map((k) => [k.khu, k.mark])) }); }
      finally { await Promise.all([reloadReview(), loadBoot()]); }
      say('Đã duyệt ' + r.khu + ' khu' + (r.phieu ? ' và ' + r.phieu + ' phiếu' : '') + (r.con ? '. Còn ' + r.con + ' khu chờ ' + CAP_TREN + '.' : '.'));
    });
  },
  // duyệt một phiếu riêng: thép về lúc 9h, khu chưa đếm, vẫn phải vào tồn được ngay
  pduyet(d) {
    act(async () => {
      try { await api('POST', '/receipts/' + d.id + '/duyet', {}); }
      finally { await Promise.all([reloadReview(), loadBoot()]); }
      say('Đã duyệt phiếu, lượng thép này đã vào tồn.');
    });
  },
  async preject(d) {
    if (!(await ask('Từ chối phiếu này?\nPhiếu sẽ bị huỷ và không vào tồn. Người lập phải nhập lại nếu cần.', 'TỪ CHỐI PHIẾU', true))) return;
    act(async () => {
      try { await api('DELETE', '/receipts/' + d.id); }
      finally { await Promise.all([reloadReview(), loadBoot()]); }
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
    if (!(F.bb && F.zl)) return say('Đánh dấu xác nhận: đã có biên bản giao nhận và đã gửi biên bản lên nhóm Zalo.', true), render();
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
          + (ngay < today ? `\n⚠ GHI BÙ ngày ${fmtDay(ngay)} mà kèm phiếu kho: tồn ${kName(kho)} sẽ đổi từ HÔM NAY. Nếu khu đã đếm lại sau ngày đó thì số đếm đã tính thép này rồi — bỏ, chọn "Không, chỉ ghi sổ".` : '')
        : '\n\nChỉ ghi sổ: tồn bãi KHÔNG đổi.')
      + `\n\nNgày giao nhận: ${fmtDay(ngay)}${soNgay(ngay, today) > 7 ? ` (ghi bù ${soNgay(ngay, today)} ngày — kiểm tra lại ngày trên biên bản)` : ''}`
      + (han ? `\nHạn trả: ${fmtDay(han)}` : '')
      + `\nBiên bản số: ${soBB}${bienSo ? ' · xe ' + bienSo : ''}${nguoi ? ' · ' + nguoi : ''}`
      + '\n✓ Đã có biên bản giao nhận\n✓ Đã gửi biên bản lên nhóm Zalo'
      + '\nCần cấp trên duyệt. Đúng chưa?';
    if (!(await ask(msg, 'GHI SỔ'))) return;
    /* Server dừng lại khi số biên bản này đã có trong sổ (cùng đối tác, loại, phi): hỏi rồi mới gửi
       lại kèm trung. Hỏi NGOÀI act, vì hộp hỏi không mở được khi màn đang "Đang lưu...". */
    let trungMsg = '';
    const gui = (trung) => act(async () => {
      try {
        await api('POST', '/loans', { doitac: F.doitac, kind: F.kind, lines, note, bienban: true, zalo: true, ngay, han: han || null, so_bb: soBB, nguoi, bien_so: bienSo, ...(kho ? { khu: kho } : {}), ...(trung ? { trung: true } : {}) });
      } catch (e) { if (e.code !== 'trung_bb' || trung) throw e; trungMsg = e.message; return; }
      // hai ô xác nhận và các trường chứng từ là của lần ghi VỪA RỒI: lần sau phải nhập lại cho biên bản mới
      F.lines = []; S.form.lqty = ''; S.form.lnote = ''; F.bb = false; F.zl = false;
      ['lngay', 'lhan', 'lsobb', 'lnguoi', 'lbienso'].forEach((k) => delete S.form[k]);
      F.done = `${loanTitle(F.kind, ten)}: ${lines.map((l) => l.phi + ' ' + fmtQs(l.qty, l.phi)).join(' · ')}`;
      [S.loans] = await Promise.all([api('GET', '/loans'), loadBoot()]);
    });
    await gui(false);
    if (trungMsg && await ask(trungMsg + '\n\nVẫn ghi thêm một lần nữa?', 'VẪN GHI', true)) await gui(true);
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
    const tuChoi = cho && r0 && (r0.kho ? isCH() : duyetDuoc(r0)) && r0.user_id !== S.me.id;
    const msg = cho ? (tuChoi ? 'Từ chối lần ghi này?' : 'Rút lại lần ghi này?') + '\nChưa duyệt nên chưa vào dư nợ.'
      : 'Huỷ lần ghi đã duyệt?\nDư nợ được tính lại không có khoản này.';
    /* Từ chối lần ghi của người khác, hoặc huỷ lần đã duyệt: hỏi LÝ DO, server ghi vào chính dòng đó cùng
       tên người huỷ — về sau mở sổ ra là thấy, không phải lục nhật ký. Tự rút lại lần ghi của mình thì khỏi. */
    let ly = '';
    if (tuChoi || !cho) {
      ly = await askText(msg, cho ? 'TỪ CHỐI' : 'HUỶ', 'Lý do (vd: ghi trùng, sai số lượng)');
      if (ly === false) return;
    } else if (!(await ask(msg, 'RÚT LẠI', true))) return;
    act(async () => {
      try { await api('DELETE', '/loans/' + d.id, ly ? { ly_do: String(ly).trim() } : undefined); }
      finally { await reloadLoanScreen(); }
    }, cho ? 'Đã bỏ lần ghi.' : 'Đã huỷ lần ghi.');
  },
  svkhu(d) { S.sv.khu = d.v; S.sv.done = null; render(); },
  // đổi kỳ thống kê: bấm lại tháng đang chọn thì về năm nay
  svky(d) { const v = d.v === String(S.svs && S.svs.nam) || (S.svKy === d.v && /-/.test(d.v)) ? null : d.v; act(async () => { S.svKy = v; S.svs = await svTai(); }, '', 'Đang tải...'); },
  svnoi(d) { S.form.svnoi = d.v; render(); },
  svcsv() { download('/satvun/export', `so-sat-vun_${S.boot.today}.csv`); },
  async svsave() {
    if (!S.svs) return;
    const today = S.boot.today, F = S.sv;
    const ngay = String(val('svngay') || today), tanTxt = String(val('svtan')).trim(), noi = String(val('svnoi')).trim();
    const soPhieu = String(val('svphieu')).trim(), nguoi = String(val('svnguoi')).trim(), bienSo = String(val('svbienso')).trim(), note = String(val('svnote')).trim();
    Object.assign(S.form, { svngay: ngay, svtan: tanTxt, svnoi: noi, svphieu: soPhieu, svnguoi: nguoi, svbienso: bienSo, svnote: note });
    // cùng điều kiện với server, báo ngay trên máy
    const kg = svKg(tanTxt);
    if (ngay > today) return say('Ngày xuất không được sau hôm nay.', true), render();
    if (!(kg >= 1 && kg <= 1000000)) return say('Ghi khối lượng theo tấn, ví dụ 2,5 — tối đa ba số lẻ, tối đa 1.000 tấn một lần.', true), render();
    if (!noi) return say('Ghi xuất cho ai (đơn vị mua / nơi nhận).', true), render();
    if (!soPhieu) return say('Ghi số phiếu cân / biên bản.', true), render();
    // khu phải CHỌN RÕ (kể cả "Nhiều khu / chung"): để sẵn một lựa chọn thì ai cũng bấm qua, bảng thống kê theo khu thành vô nghĩa
    if (F.khu == null) return say('Chọn khu xuất, hoặc "Nhiều khu / chung".', true), render();
    const msg = `Xuất sắt vụn ${svT(kg)} tấn (${fmtInt(kg)} kg)\nCho: ${noi}\nTừ: ${F.khu ? kName(F.khu) : 'nhiều khu / chung'}\nNgày xuất: ${fmtDay(ngay)}`
      + (soNgay(ngay, today) > 7 ? ` (ghi bù ${soNgay(ngay, today)} ngày — kiểm tra lại ngày trên phiếu cân)` : '')
      + `\nPhiếu cân / biên bản: ${soPhieu}${bienSo ? ' · xe ' + bienSo : ''}${nguoi ? ' · ' + nguoi : ''}`
      + '\n\nKhông tính vào tồn bãi. Cần cấp trên duyệt. Đúng chưa?';
    if (!(await ask(msg, 'GHI SỔ'))) return;
    // trùng số phiếu cân: server dừng lại hỏi, xác nhận thì gửi lại kèm trung (hỏi ngoài act, như sổ vay)
    let trungMsg = '';
    const gui = (trung) => act(async () => {
      try {
        await api('POST', '/satvun', { ngay, khu: F.khu || null, tan: tanTxt, noi, so_phieu: soPhieu, nguoi, bien_so: bienSo, note, ...(trung ? { trung: true } : {}) });
      } catch (e) { if (e.code !== 'trung_sv' || trung) throw e; trungMsg = e.message; return; }
      ['svngay', 'svtan', 'svphieu', 'svnguoi', 'svbienso', 'svnote'].forEach((k) => delete S.form[k]);
      F.done = `${svT(kg)} tấn cho ${noi} · phiếu ${soPhieu}`;
      [S.svs] = await Promise.all([svTai(), loadBoot()]);
    });
    await gui(false);
    if (trungMsg && await ask(trungMsg + '\n\nVẫn ghi thêm một lần nữa?', 'VẪN GHI', true)) await gui(true);
  },
  svduyet(d) {
    act(async () => {
      try { await api('POST', '/satvun/' + d.id + '/duyet', {}); }
      finally { await svReload(); }
    }, 'Đã duyệt, lần xuất này đã vào thống kê.');
  },
  async svvoid(d) {
    const r = [].concat((S.svs && S.svs.items) || [], (S.review && S.review.satvun) || []).find((x) => x.id === Number(d.id));
    const cho = r ? !r.duyet_ts : true;
    const tuChoi = cho && r && duyetDuoc(r) && r.user_id !== S.me.id;
    const msg = cho ? (tuChoi ? 'Từ chối lần xuất này?' : 'Rút lại lần xuất này?') + '\nChưa duyệt nên chưa vào thống kê.' : 'Huỷ lần xuất đã duyệt?\nThống kê được tính lại không có lần này.';
    // từ chối lần ghi của người khác, hoặc huỷ lần đã duyệt: hỏi lý do (ghi vào chính dòng đó); tự rút lại thì khỏi
    let ly = '';
    if (tuChoi || !cho) {
      ly = await askText(msg, cho ? 'TỪ CHỐI' : 'HUỶ', 'Lý do (vd: ghi trùng, sai số tấn)');
      if (ly === false) return;
    } else if (!(await ask(msg, 'RÚT LẠI', true))) return;
    act(async () => {
      try { await api('DELETE', '/satvun/' + d.id, ly ? { ly_do: String(ly).trim() } : undefined); }
      finally { await svReload(); }
    }, cho ? 'Đã bỏ lần ghi.' : 'Đã huỷ lần xuất.');
  },
  lcsv() { download('/loans/export', `so-vay-muon_${S.boot.today}.csv`); },
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
    act(async () => { await api('PATCH', '/doitac/' + d.id, { active: on }); [S.loans] = await Promise.all([api('GET', '/loans'), loadBoot()]); }, on ? 'Đã hiện lại đối tác.' : 'Đã ẩn đối tác.');
  },
  /* ----- Gia công cấu kiện ----- */
  gcf(d) { S.gcF = d.v; S.gcHien = null; render(); },
  gchienthem(d) { S.gcHien = (S.gcHien || (gcGon() ? 200 : 60)) + Number(d.v); render(); },
  gcview(d) { S.gcId = Number(d.id); S.gcPct = null; delete S.form.gcnote; go('gcdon'); },
  gcnew() { gcSoan(null); },
  // giao đơn mới giống đơn đang mở: chép hết nội dung, người giao chỉ sửa chỗ khác (thường là trục)
  gccopy() { const d = S.gcDetail && S.gcDetail.don; if (d) gcSoan(d); },
  gcedit() { const d = S.gcDetail && S.gcDetail.don; if (d) gcSoan(d, true); },
  gcxem(d) { S.gcV = d.v; S.gcHien = null; try { localStorage.setItem('kt:gcv', d.v); } catch (e) { /* đầy bộ nhớ */ } render(); },
  // chọn / bỏ chọn người nhận; người chọn đầu tiên là người chính
  gcuser(d) {
    const F = S.gcForm, id = Number(d.v);
    if (!Array.isArray(F.users)) F.users = F.user ? [F.user] : [];
    if (F.users.includes(id)) F.users = F.users.filter((x) => x !== id);
    else if (F.users.length >= GC_NGUOI_MAX) return say('Một đơn giao tối đa ' + GC_NGUOI_MAX + ' người.', true), render();
    else F.users.push(id);
    render();
  },
  gcbuoi(d) { S.gcForm.buoi = d.v; render(); },
  gchanq(d) { S.form.gchan = congNgay(S.boot.today, Number(d.v)); render(); },
  // bấm loại cấu kiện: chọn xong là đủ; "Khác" thì đưa con trỏ vào ô để gõ tên
  gcckq(d) { S.gcForm.ck = d.v; render(); if (d.v === 'khac') gcFocus('gcck'); },
  gckhu(d) { S.gcForm.khu = d.v; render(); },
  gchmq(d) { S.gcForm.hm = S.gcForm.hm === d.v ? '' : d.v; render(); },
  gctangq(d) { S.form.gctang = gcTangChu(S.form.gctang) === d.v ? '' : d.v; render(); },
  gctrucq(d) { gcTrucDat(d.v); render(); },
  gcodnq(d) { S.form.gcodn = String(S.form.gcodn || '').trim() === d.v ? '' : d.v; render(); },
  gcoddq(d) { S.form.gcodd = String(S.form.gcodd || '').trim() === d.v ? '' : d.v; render(); },
  // đổi cách nhập trục, mang theo chữ đang có
  // đổi cách nhập trục, mang theo chữ đang có (đổi được thì tách về đúng ô, không thì báo và giữ ô gõ tự do)
  gctruck(d) {
    const F = S.gcForm, t = gcTrucCua();
    if (d.v === 'tu') { GC_O_TRUC.forEach((k) => delete S.form[k]); S.form.gctruc = t; F.trucKieu = 'tu'; F.trucTu = true; }
    else if (gcTrucDat(t) !== 'xy') say('Trục "' + t + '" không tách được về ô X / Y / Trục nên giữ ở ô gõ tự do.', true);
    render(); gcFocus(gcTrucO1());
  },
  // bỏ một gợi ý trục / tầng trên máy này (xem gcGoiY)
  gcanq(d) {
    const an = gcAnDoc();
    (an[d.l] = an[d.l] || {})[d.v] = Date.now();
    try { localStorage.setItem('kt:gcan', JSON.stringify(an)); } catch (e) { /* đầy bộ nhớ */ }
    say('Đã bỏ gợi ý "' + d.v + '" trên máy này.'); render();
  },
  gcsave(d, trung) {
    const F = S.gcForm, G = S.gc; if (!F) return;
    const t = (k) => String(S.form[k] || '').trim();
    const oTruc = gcTrucO1();
    if (!F.ck) return say('Chọn loại cấu kiện (hoặc Khác).', true), render();
    if (F.ck === 'khac' && !t('gcck')) { say('Ghi tên cấu kiện.', true); render(); return gcFocus('gcck'); }
    const truc = gcTrucCua();
    if (!truc) { say('Nhập vị trí trục.', true); render(); return gcFocus(oTruc); }
    if (gcMucTen('khu').length && !F.khu) return say('Chọn phân khu.', true), render();
    if (!t('gctang') && !t('gccote') && !(F.id && F.thieuCaoDo)) { say('Ghi tầng hoặc cote (có tầng thì cote không bắt buộc).', true); render(); return gcFocus('gctang'); }
    if (!(F.users || []).length) return say('Chọn Tiểu đội trưởng nhận đơn.', true), render();
    if (!t('gchan')) return say('Chọn ngày cần xong.', true), render();
    const body = { cau_kien: gcCauKien(F), truc, phan_khu: F.khu || '', tang: gcTangChu(t('gctang')), cote: t('gccote'), hang_muc: F.hm || '', noi_dung: t('gcnd'), od_nguoi: t('gcodn'), od_dd: t('gcodd'), users: F.users, user: F.users[0], han: t('gchan'), buoi: F.buoi || null };
    const tiep = !F.id && d && d.v === 'tiep';
    const ten = F.users.map((i) => (((G && G.tdt) || []).find((u) => u.id === i) || (F.nguoiCu || []).map((n) => ({ id: n.id, name: n.ten })).find((u) => u.id === i) || {}).name || '').join(', ');
    let hoiTrung = null, xong = false;
    act(async () => {
      /* trung === true, KHÔNG phải "trung có giá trị": bấm nút thì hàm này được gọi với (dataset, sự kiện bấm), nên tham số
         thứ hai luôn có giá trị — bản đầu vì thế lần nào cũng gửi trung: true và server không bao giờ hỏi đơn trùng. */
      try { if (F.id) await api('PATCH', '/giacong/' + F.id, body); else await api('POST', '/giacong', trung === true ? { ...body, trung: true } : body); }
      // người nhận đang giữ một đơn giống hệt còn mở: dừng lại hỏi (hộp hỏi mở sau khi lớp "Đang lưu" tắt)
      catch (e) { if (e.code === 'trung') { hoiTrung = e.message; return; } throw e; }
      /* Server đã ghi. Từ đây không được để lỗi mạng lúc tải lại biến thành "giao hỏng": người giao sẽ bấm
         lại và sinh đơn trùng. Rời màn soạn (hoặc xoá ô) TRƯỚC, tải lại SAU và bỏ qua lỗi. */
      xong = true;
      say(F.id ? 'Đã lưu thay đổi.' : `Đã giao ${body.cau_kien} · ${truc} cho ${ten}.` + (tiep ? ' Soạn đơn tiếp.' : ''));
      // nhớ các lựa chọn của lần giao này để điền sẵn cho lần sau
      if (!F.id) {
        try { [['kt:gcuser', F.users.join(',')], ['kt:gckhu', F.khu || ''], ['kt:gchm', F.hm || ''], ['kt:gctang', body.tang], ['kt:gcck', F.ck]].forEach(([k, v]) => localStorage.setItem(k, String(v))); }
        catch (e) { /* đầy bộ nhớ */ }
      }
      const xoa = ['gcck', 'gctruc', 'gcnd'].concat(GC_O_TRUC);
      if (tiep) {
        // soạn đơn tiếp: giữ loại cấu kiện, phân khu, tầng, hạng mục, người nhận, hạn; chỉ xoá những ô đơn nào cũng khác
        xoa.forEach((k) => delete S.form[k]);
      } else {
        S.gcForm = null;
        xoa.concat(['gctang', 'gccote', 'gchan', 'gcodn', 'gcodd']).forEach((k) => delete S.form[k]);
        // sửa xong về lại đơn đó; giao mới thì về bảng đơn, mở sẵn mục "Đang mở" để thấy đơn vừa giao
        if (F.id) S.screen = 'gcdon'; else { S.gcF = 'mo'; delete S.form.gcq; S.screen = 'giacong'; }
        pushNav();
      }
      try {
        const [moi] = await Promise.all([api('GET', F.id ? '/giacong/' + F.id : '/giacong'), loadBoot()]);
        if (F.id) S.gcDetail = moi; else S.gc = moi;
      } catch (e) { /* đã ghi xong; vòng tự làm mới sẽ tải lại */ }
    }).then(async () => {
      if (hoiTrung) { if (await ask(hoiTrung, 'VẪN GIAO THÊM')) ACTIONS.gcsave(d, true); return; }
      // đơn tiếp theo trong loạt: thứ phải gõ đầu tiên là trục
      if (xong && tiep) gcFocus(oTruc);
    });
  },
  // danh mục chọn nhanh (admin)
  gcmucadd(d) {
    const k = 'gcm' + d.v, ten = String(S.form[k] || '').trim();
    if (!ten) { say('Gõ tên rồi bấm Thêm.', true); render(); return gcFocus(k); }
    act(async () => { await api('POST', '/giacong/muc', { loai: d.v, ten }); delete S.form[k]; S.gc = await api('GET', '/giacong'); }, 'Đã thêm "' + ten + '".').then(() => gcFocus(k));
  },
  async gcmucxoa(d) {
    const m = [].concat(...Object.values((S.gc && S.gc.muc) || {})).find((x) => x.id === Number(d.id)); if (!m) return;
    if (!(await ask(`Xoá "${m.ten}" khỏi danh mục?\n\nCác đơn đã giao vẫn giữ tên này, chỉ là không chọn được cho đơn mới nữa.`, 'XOÁ', true))) return;
    act(async () => { try { await api('DELETE', '/giacong/muc/' + m.id); } finally { S.gc = await api('GET', '/giacong'); } }, 'Đã xoá "' + m.ten + '".');
  },
  // làm nhanh ngay trên bảng, cho đơn của chính mình
  gcqnhan(d) { gcDo('nhan', {}, 'Đã nhận đơn.', Number(d.id)); },
  // trao đổi trên đơn
  gctnq(d) { gcTnGui(d.v, false); },
  gctngui() { gcTnGui(String(S.form.gctn || '').trim(), !!S.gcTnCan); },
  gctncan() { S.gcTnCan = !S.gcTnCan; render(); gcFocus('gctn'); },
  async gctnthu(d) {
    if (!(await ask('Thu hồi tin nhắn này? Mọi người sẽ thấy "Tin đã thu hồi".', 'THU HỒI', true))) return;
    act(async () => { try { await api('POST', `/giacong/${S.gcId}/tn/${d.id}/thuhoi`, {}, 0, ['/giacong/' + S.gcId]); } finally { S.gcDetail = await api('GET', '/giacong/' + S.gcId); } }, 'Đã thu hồi.');
  },
  // xuất
  gcqxuat(d) { gcXuatMo(Number(d.id)); },
  gcxuat() { gcXuatMo(S.gcId); },
  gcxtick(d) { S.gcXu[d.v] = !S.gcXu[d.v]; render(); },
  gcxdong() { S.gcXu = null; render(); },
  gcxgui() {
    const X = S.gcXu; if (!X) return;
    const cho = String(S.form.gcxcho || '').trim();
    if (!(X.bb && X.dem && X.anh)) return say('Tick đủ ba việc: ký giao nhận, kiểm đếm, chụp ảnh.', true), render();
    if (!cho) { say('Ghi xuất cho ai / vị trí lắp dựng.', true); render(); return gcFocus('gcxcho'); }
    const note = String(S.form.gcxnote || '').trim();
    S.gcXu = null; ['gcxcho', 'gcxnote'].forEach((k) => delete S.form[k]);
    gcDo('xuat', { bien_ban: 1, kiem_dem: 1, anh: 1, xuat_cho: cho, note }, 'Đã gửi xuất, chờ CVKTHT duyệt.', X.id);
  },
  async gcduyetxuat() {
    const d = S.gcDetail && S.gcDetail.don; if (!d) return;
    if (!(await ask(`Duyệt xuất "${d.cau_kien}" cho ${d.xuat_cho}?\n\nĐã xuất thì đơn khoá hẳn, không mở lại được nữa.`, 'DUYỆT XUẤT'))) return;
    gcDo('duyetxuat', {}, 'Đã duyệt xuất.');
  },
  async gctuchoixuat() {
    const d = S.gcDetail && S.gcDetail.don; if (!d) return;
    const ly = await askText(`Không duyệt xuất "${d.cau_kien}"?\nĐơn về "chưa xuất", tổ sửa rồi gửi lại. Ghi lý do.`, 'KHÔNG DUYỆT', 'Lý do (ví dụ: thiếu chữ ký bên nhận)', 'Phải ghi lý do.');
    if (ly) gcDo('tuchoixuat', { ly_do: ly }, 'Đã trả lại cho tổ.');
  },
  // hiển thị: danh sách gọn / thẻ; thu gọn / mở một nhóm
  gcgon() { S.gcHien = null; S.gcGon = !gcGon(); try { localStorage.setItem('kt:gcgon', S.gcGon ? '1' : ''); } catch (e) { /* đầy bộ nhớ */ } render(); },
  gcthu(d) {
    const t = gcThuDoc(), i = t.indexOf(d.k);
    if (i >= 0) t.splice(i, 1); else t.push(d.k);
    try { localStorage.setItem('kt:gcthu', JSON.stringify(t.slice(-40))); } catch (e) { /* đầy bộ nhớ */ }
    render();
  },
  gcqbiet(d) { gcDo('biet', {}, 'Đã báo: bạn đã biết và dừng làm đơn này.', Number(d.id)); },
  gcbiet() { gcDo('biet', {}, 'Đã báo: bạn đã biết và dừng làm đơn này.'); },
  async gckhoiphuc() {
    const d = S.gcDetail && S.gcDetail.don; if (!d) return;
    const ly = await askText(`Khôi phục đơn "${d.cau_kien}" của ${d.uname}?\nĐơn trở lại như trước khi huỷ và ${d.uname} phải làm tiếp. Ghi lý do.`, 'KHÔI PHỤC ĐƠN', 'Lý do khôi phục (ví dụ: huỷ nhầm)', 'Phải ghi lý do thì mới khôi phục được.');
    if (ly) gcDo('khoiphuc', { ly_do: ly }, 'Đã khôi phục đơn.');
  },
  gcqpct(d) {
    const x = ((S.gc && S.gc.items) || []).find((i) => i.id === Number(d.id)), pct = Number(d.v);
    if (!x || x.pct === pct) return;
    gcDo('tiendo', { pct }, `Đã lưu ${x.cau_kien}: ${pct}%.`, x.id);
  },
  async gcqxong(d) {
    const x = ((S.gc && S.gc.items) || []).find((i) => i.id === Number(d.id)); if (!x) return;
    if (!(await ask(`Xác nhận ĐÃ XONG đơn này?\n\n${x.cau_kien}${x.truc ? '\nTrục ' + x.truc : ''}\n\nCả đơn vị sẽ thấy đơn đã xong.`, 'ĐÃ XONG'))) return;
    gcDo('xong', {}, 'Đã xác nhận xong.', x.id);
  },
  // phím Enter trên bàn phím điện thoại: số hiệu → trục (X từ → X đến → Y từ → Y đến) → đóng bàn phím cho lộ nút GIAO
  gcnext() { gcFocus(gcTrucO1()); },
  gcdent1() { gcFocus('gct1'); }, gcdent2() { gcFocus('gct2'); },
  gcdencote() { gcFocus('gccote'); },
  gcdenodd() { gcFocus('gcodd'); },
  gcdenx2() { gcFocus('gcx2'); }, gcdeny1() { gcFocus('gcy1'); }, gcdeny2() { gcFocus('gcy2'); },
  gcblur() { const e = document.activeElement; if (e && e.blur) e.blur(); },
  gcpct(d) { S.gcPct = Number(d.v); render(); },
  gcnhan() { gcDo('nhan', {}, 'Đã nhận đơn.'); },
  gctiendo() {
    const d = S.gcDetail && S.gcDetail.don; if (!d) return;
    const pct = S.gcPct == null ? d.pct : S.gcPct, note = String(S.form.gcnote || '').trim();
    if (pct === d.pct && !note) return say('Chọn mức tiến độ mới hoặc ghi chú thêm rồi mới lưu.', true), render();
    gcDo('tiendo', { pct, note }, 'Đã lưu tiến độ ' + pct + '%.');
  },
  async gcxong() {
    const d = S.gcDetail && S.gcDetail.don; if (!d) return;
    if (!(await ask(`Xác nhận ĐÃ XONG đơn này?\n\n${d.cau_kien}${d.truc ? '\nTrục ' + d.truc : ''}\n\nCả đơn vị sẽ thấy đơn đã xong.`, 'ĐÃ XONG'))) return;
    gcDo('xong', { note: String(S.form.gcnote || '').trim() }, 'Đã xác nhận xong.');
  },
  gcvuong() { gcVgMo(S.gcId); },
  gcqvuong(d) { gcVgMo(Number(d.id)); },
  gcqhetvuong(d) { gcDo('hetvuong', {}, 'Đã báo hết vướng.', Number(d.id)); },
  gcvgloai(d) { S.gcVg.loai = d.v; render(); if (d.v === 'Khác') gcFocus('gcvgnote'); },
  gcvgdung(d) { S.gcVg.dung = d.v === '1'; render(); },
  gcvgdong() { S.gcVg = null; delete S.form.gcvgnote; render(); },
  gcvggui() {
    const V = S.gcVg; if (!V) return;
    const note = String(S.form.gcvgnote || '').trim();
    if (!V.loai) return say('Chọn đang vướng gì.', true), render();
    if (V.loai === 'Khác' && !note) { say('Ghi rõ đang vướng gì.', true); render(); return gcFocus('gcvgnote'); }
    S.gcVg = null; delete S.form.gcvgnote;
    gcDo('vuong', { loai: V.loai, dung: V.dung ? 1 : 0, ly_do: note }, V.dung ? 'Đã báo vướng: tổ dừng hẳn.' : 'Đã báo vướng.', V.id);
  },
  gcxemvuong() { gcDo('xemvuong', {}, 'Đã nhận xử lý. Tổ thấy bạn đang lo việc này.'); },
  gcqxemvuong(d) { gcDo('xemvuong', {}, 'Đã nhận xử lý. Tổ thấy bạn đang lo việc này.', Number(d.id)); },
  gchetvuong() { gcDo('hetvuong', {}, 'Đã báo hết vướng.'); },
  async gchuy() {
    const d = S.gcDetail && S.gcDetail.don; if (!d) return;
    const ly = await askText(`Huỷ đơn "${d.cau_kien}" của ${d.uname}? Nghĩa là KHÔNG CẦN LÀM NỮA.\n${d.uname} phải bấm "Đã biết"; cả đơn vị thấy lý do. Chỉ bớt khối lượng thì dùng Sửa đơn.`, 'HUỶ ĐƠN', 'Lý do không làm nữa');
    if (ly) gcDo('huy', { ly_do: ly }, 'Đã huỷ đơn.');
  },
  async gcmolai() {
    const d = S.gcDetail && S.gcDetail.don; if (!d) return;
    const ly = await askText(`Mở lại đơn "${d.cau_kien}" mà ${d.uname} đã báo xong?\nĐơn về "Đang làm" 90%. Ghi rõ còn thiếu gì.`, 'MỞ LẠI ĐƠN', 'Còn thiếu gì', 'Phải ghi lý do thì mới mở lại được.');
    if (ly) gcDo('molai', { ly_do: ly }, 'Đã mở lại đơn.');
  },
  // quân số đầu ca

  /* LƯU TẤT CẢ ở bảng Thiết lập: gom mọi thay đổi trên bảng — ca vừa chọn lại, số vừa sửa, và các số gợi ý (xám) chưa
     lưu — gửi trong MỘT request. Mỗi tổ vẫn mang ts riêng: người khác vừa sửa đúng tổ đó thì server từ chối cả lần lưu
     (không ghi dở), app tải số mới và nói rõ tổ nào, ai sửa. */
  qstlluu() {
    const Q = S.qs; if (!Q) return;
    const ds = [];
    for (const u of Q.tdt) {
      const k = 'tl_' + u.id + '_', tl = (Q.tl || {})[u.id], d = qsTlMacDinh(u.id);
      const Lcu = qsLichCa(Q.lich, u.id, Q.hien.ngay), L = Number(fv(k + 'c', Lcu)) || 0;
      if (L && L !== Lcu) ds.push({ user: u.id, ca: L });
      const so = (hau, mac) => { const v = String(fv(k + hau, mac)).trim(); return v === '' ? null : soTu(v); };
      const tong = so('t', d.tong);
      if (tong == null) continue; // tổ chưa có số nào để lưu
      if (!tong) { say('Tổ ' + u.name + ': tổng quân số phải lớn hơn 0.', true); render(); return gcFocus(k + 't'); }
      // tổ một ca: bỏ trống số ca thì cả tổ làm ca đó; ô của ca tổ không làm là 0
      let s1 = L === 2 ? 0 : so('1', d.s1), s2 = L === 1 ? 0 : so('2', d.s2);
      if (L === 1 && s1 == null) s1 = tong;
      if (L === 2 && s2 == null) s2 = tong;
      s1 = s1 || 0; s2 = s2 || 0;
      if (s1 + s2 > tong) { say(`Tổ ${u.name}: ca ngày ${s1} + ca đêm ${s2} nhiều hơn tổng ${tong}.`, true); render(); return gcFocus(k + 't'); }
      // người nghỉ theo lý do của từng ca; ca tổ không làm (theo ca đã chọn) thì không có ai nghỉ
      const N = [1, 2].map((c) => (L && L !== 3 && L !== c ? { nghi: {}, gc: '' } : qsTlNghi(u.id, c)));
      for (const c of [1, 2]) {
        const n = qsSoNghi(N[c - 1].nghi), s = c === 1 ? s1 : s2;
        if (n > s) { say(`Tổ ${u.name}: nghỉ ${CA_TEN[c]} ${n} người, nhiều hơn số người ${CA_TEN[c]} (${s}).`, true); S.tlMo = u.id; return render(); }
        if (N[c - 1].nghi.khac && !N[c - 1].gc) { say(`Tổ ${u.name}: có người nghỉ ${CA_TEN[c]} vì lý do khác, ghi rõ lý do.`, true); S.tlMo = u.id; render(); return gcFocus(`${k}g${c}`); }
      }
      const khacN = [1, 2].some((c) => JSON.stringify(N[c - 1].nghi) !== JSON.stringify((tl && tl['n' + c]) || {}) || (qsSoNghi(N[c - 1].nghi) ? N[c - 1].gc : '') !== ((tl && tl['gc' + c]) || ''));
      if (tl && tl.tong === tong && tl.s1 === s1 && tl.s2 === s2 && !khacN) continue;
      /* có tổng mà không ai làm ca nào (chưa chọn ca, ô ca để trống): lưu vào là báo cáo ghi "0/N cn" cho tổ chưa báo.
         Dòng chỉ có số gợi ý (chưa đụng tới) thì bỏ qua, không chặn cả lần lưu; dòng đã gõ thì hỏi lại. */
      if (!s1 && !s2) {
        if (!tl && !Object.keys(S.form).some((x) => x.startsWith(k))) continue;
        say(`Tổ ${u.name}: chọn ca (Ngày / Đêm / 2 ca) hoặc ghi số người từng ca.`, true); render(); return gcFocus(k + 'c');
      }
      ds.push({ user: u.id, tong, s1, s2, n1: N[0].nghi, n2: N[1].nghi, gc1: N[0].gc, gc2: N[1].gc, ts: tl ? tl.ts : 0 });
    }
    if (!ds.length) return say('Không có gì thay đổi.'), render();
    const xoa = () => Object.keys(S.form).filter((x) => /^tl_/.test(x)).forEach((x) => delete S.form[x]);
    act(async () => {
      /* MỘT request cho cả bảng (xem qsThietLap ở src/quanso.js), kèm luôn phần tải lại (sauGhi: /bootstrap và /quanso):
         lưu mười tổ cũng chỉ một vòng mạng. Có tổ bị người khác sửa trước thì server từ chối CẢ lần lưu và nói rõ tổ nào. */
      try { await api('PUT', '/quanso/thietlap', { ds }); }
      catch (e) { xoa(); try { await qsTai(); } catch (e2) { /* giữ bản đang có */ } throw e; }
      xoa();
      try { await Promise.all([qsTai(), loadBoot()]); } catch (e) { /* đã lưu */ }
    }, `Đã lưu ${ds.length} thay đổi.`);
  },
  // bảng thiết lập: mở / đóng ô ghi người nghỉ của một tổ; chạm một lý do là thêm 1 người (chưa lưu, chờ Lưu tất cả)
  tlnghimo(d) { const id = Number(d.id); S.tlMo = S.tlMo === id ? null : id; render(); },
  tlnghi(d) { const k = `tl_${d.id}_n${d.ca}_${d.k}`; S.form[k] = String(qsTlNghi(Number(d.id), Number(d.ca)).nghi[d.k] + 1 || 1); render(); },
  // thống kê quân số
  // thống kê quân số: đổi cách xem (nhớ trên máy), lùi / tới một kỳ, nhảy tới một kỳ, xem một ngày từ biểu đồ tháng
  tkche(d) {
    const v = d.v === 'thang' ? 'thang' : 'ngay';
    if (v === 'thang') S.tkThang = tkNgayCua().slice(0, 7);
    else if (tkChe() === 'thang') { const t = tkThangCua(), b = S.boot.today; S.tkNgay = t === b.slice(0, 7) ? congNgay(b, -1) : tkCuoiThang(t); }
    S.tkChe = v;
    try { localStorage.setItem('kt:tkche', v); } catch (e) { /* đầy bộ nhớ */ }
    tkDam();
  },
  tkdi(d) {
    const n = Number(d.v) || 0, b = S.boot.today;
    if (tkChe() === 'ngay') { const k = congNgay(tkNgayCua(), n); S.tkNgay = k > b ? b : k; }
    else { const t = tkCongThang(tkThangCua(), n); S.tkThang = t > b.slice(0, 7) ? b.slice(0, 7) : t; }
    tkDam();
  },
  tkthang(d) { S.tkThang = tkCongThang(tkThangCua(), Number(d.v)); S.tkChe = 'thang'; tkDam(); },
  tkden(d) { if (String(d.v).length === 7) { S.tkThang = d.v; S.tkChe = 'thang'; } else { S.tkNgay = d.v; S.tkChe = 'ngay'; } tkDam(); },
  tkxemngay(d) { S.tkNgay = d.v; S.tkChe = 'ngay'; tkDam(); },
  tkca(d) { S.tkCa = Number(d.v) || 0; render(); },
  tkcach() { S.tkCach = !S.tkCach; render(); },
  tksx(d) { S.tkSx = d.v === 'to' ? 'to' : 'nghi'; render(); },
  tkto(d) { S.tkTo = d.v === '' || d.v == null ? null : Number(d.v); render(); const b = document.getElementById('body'); if (b) b.scrollTop = 0; },
  tkngmo() { S.tkNgMo = !S.tkNgMo; delete S.form.tkng; render(); },
  tkngluu() {
    const pct = soTu(fv('tkng', S.tk ? S.tk.nguong : ''));
    if (pct < 1 || pct > 100) return say('Ngưỡng là một số từ 1 đến 100.', true), render();
    act(async () => {
      await api('PUT', '/quanso/nguong', { pct });
      S.tkNgMo = false; delete S.form.tkng;
      try { S.tk = await tkTai(); } catch (e) { /* đã lưu; vòng tự làm mới sẽ tải lại */ }
    }, `Đã đặt ngưỡng: tô đỏ khi nghỉ từ ${pct}%.`);
  },
  async tkchep() {
    if (!S.tk) return;
    const ok = await bcChepChu(tkChu());
    say(ok ? `Đã chép tóm tắt ${tkChe() === 'ngay' ? 'ngày' : 'tháng'}. Mở Zalo và dán vào nhóm.` : 'Máy không cho chép tự động.', !ok);
    render();
  },
  // chép tin nhắc các tổ chưa báo, để dán vào nhóm Zalo
  async bcnhac() {
    const B = S.bcc; if (!B) return;
    const ten = bcQuanSo(B).chua.map((x) => 'Tổ ' + x);
    if (!ten.length) return say('Các tổ đã báo đủ.'), render();
    const t = `Các tổ chưa báo quân số ${caGoi(B)} (hạn ${hhmm(B.han)}):\n${ten.map((x) => '• ' + x).join('\n')}\nTổ trưởng mở app Bãi Gia Công, bấm BÁO ở thẻ Quân số tổ ngay đầu Tổng quan.`;
    const ok = await bcChepChu(t);
    say(ok ? 'Đã chép tin nhắc. Mở Zalo và dán vào nhóm.' : 'Máy không cho chép tự động.', !ok);
    render();
  },
  // xếp thứ tự tổ
  qssxmo() { const Q = S.qs; if (!Q) return; S.qsSx = Q.tdt.map((u) => u.id); render(); },
  qssxthoi() { S.qsSx = null; render(); },
  qssx(d) {
    const a = S.qsSx; if (!a) return;
    const i = a.indexOf(Number(d.id)), j = i + Number(d.v);
    if (i < 0 || j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]]; render();
  },
  qssxluu() {
    const ids = S.qsSx; if (!ids) return;
    act(async () => {
      await api('PUT', '/quanso/thutu', { ids });
      S.qsSx = null;
      try { await qsTai(); } catch (e) { /* đã lưu */ }
    }, 'Đã lưu thứ tự tổ.');
  },
  // thẻ báo quân số trên Tổng quan (qsTheHome)
  qhmo() { const H = qhState(); H.mo = !H.mo; render(); },
  qhtong() { qhState().doiTong = true; S.form.qhtong = String(S.boot.qs.toi.tong || ''); render(); gcFocus('qhtong'); },
  // lịch ca của tổ mình: chạm ca là lưu, theo thời hạn đang chọn
  qhden(d) { qhState().den = Number(d.v) || 0; render(); },
  qhdoica() { qhBo(); qhState().doiCa = true; render(); },
  qhsom() { qhState().som = true; render(); },
  qhca(d) {
    const ca = Number(d.v), den = qhState().den ? congNgay(S.boot.today, qhState().den) : null;
    // tổ tự khai tổng quân số cùng lúc với ca: thiếu thì chưa lưu
    const toi = S.boot.qs.toi, tong = soTu(fv('qhkt', (toi.lich && toi.lich.tong) || toi.tong || ''));
    if (!tong) { say('Gõ tổng quân số của tổ trước, rồi chạm ca.', true); render(); return gcFocus('qhkt'); }
    act(async () => {
      await api('PUT', '/quanso/lich', { ca, den, tong });
      qhBo();
      try { await loadBoot(); } catch (e) { /* đã lưu; vòng tự làm mới sẽ tải lại */ }
    }, `Đã khai báo: tổ ${tong} người, làm ${CA_LICH[ca].toLowerCase()}${den ? ' đến ' + ngayNgan(den) : ''}.`);
  },
  qhnghi(d) {
    const H = qhState(), T = qhTinh(), them = Number(d.v) > 0, n = (H.nghi[d.k] || 0) + (them ? 1 : -1);
    if (n < 0) return;
    if (them && T.tong && T.nghi >= T.tong) return say('Số nghỉ đã bằng tổng quân số của tổ.', true), render();
    if (n) H.nghi[d.k] = n; else delete H.nghi[d.k];
    delete S.form['qhn_' + d.k];
    render();
    if (d.k === 'khac' && them && n === 1) gcFocus('qhnote');
  },
  qhnhu() {
    const H = qhState(), x = qhDang();
    if (!x || !x.truoc) return;
    H.nghi = { ...x.truoc.nghi }; H.mo = true;
    if (x.truoc.ghi_chu && !S.form.qhnote) S.form.qhnote = x.truoc.ghi_chu;
    render();
  },
  qhsua(d) {
    const x = qhCas().find((c) => caKhoa(c.c) === d.v); if (!x || !x.row) return;
    qhBo();
    const r = x.row, H = qhState(), sn = qsSoNghi(r.nghi);
    Object.assign(H, { sua: d.v, nghi: { ...r.nghi }, mo: sn > 0 || !!r.ghi_chu, doiTong: true });
    S.form.qhtong = String(r.tong);
    // tổ 2 ca: số người của tổ thuộc ca đó = đi làm + nghỉ của lần đã báo
    if (qhLich() === 3 || r.ca_kia > 0) S.form.qhbc = String(r.lam + sn);
    if (r.ghi_chu) S.form.qhnote = r.ghi_chu;
    render();
  },
  qhthoi() { qhBo(); render(); },
  qshanmo() { S.qsHanMo = !S.qsHanMo; delete S.form.qsh1; delete S.form.qsh2; render(); },
  // báo cáo ca
  bcca(d) { const [ngay, ca] = String(d.v).split(':'); S.bcCa = { ngay, ca: Number(ca) }; S.bcc = null; go('baocaoca', true); },
  // từ báo cáo ca sang bảng thiết lập (ca và số quân từng tổ); nút quay lại ở đó về đúng báo cáo đang soạn
  bctl() { if (!S.bcc) return; S.qs = null; S.qsVe = 'baocaoca'; go('quanso'); },
  // dải bước ở đầu màn: nhảy tới bước 1 (tổ báo) hoặc bước 2 (soát nội dung)
  bcden(d) { const e = document.getElementById('bcb' + d.v); if (e && e.scrollIntoView) e.scrollIntoView({ block: 'start' }); },
  bcsua(d) {
    S.bcMo = d.mo ? d.k : S.bcMo === d.k ? null : d.k; render();
    if (S.bcMo) { const e = document.getElementById(S.bcMo === 'dau' ? 'bcd_don_vi' : 'bc_' + S.bcMo); if (e && e.scrollIntoView) e.scrollIntoView({ block: 'center' }); }
  },
  bcpick(d) { S.bcDau[d.k] = d.v; if (S.bcKhac) delete S.bcKhac[d.k]; bcNhap(); render(); },
  // tên chỉ huy ngoài danh sách: mở ô gõ (bỏ tên đang chọn bằng nút); bấm lại thì đóng ô
  bckhac(d) {
    const K = S.bcKhac || (S.bcKhac = {}), D = S.bcDau, mo = !K[d.k] && !(D[d.k] && !(S.bcc.nguoi || []).some((u) => u.name === D[d.k]));
    if (mo) { K[d.k] = 1; if ((S.bcc.nguoi || []).some((u) => u.name === D[d.k])) D[d.k] = ''; } else { delete K[d.k]; D[d.k] = ''; }
    bcNhap(); render(); if (mo) gcFocus('bcd_' + d.k);
  },
  /* lấy lại số từ app. Mục 4: đang sửa bằng chữ thì về soạn theo dòng; đang soạn theo dòng thì bỏ các chỉnh trên đơn
     gia công (giữ việc tự thêm) */
  bclay(d) {
    if (d.k === 's4' && typeof S.bcM.s4 !== 'string') S.bcV = { ...bcVRong(), tu: S.bcV.tu };
    delete S.bcM[d.k]; bcNhap(); render();
  },
  // mục 4 soạn theo dòng
  bcvpct(d) {
    const x = bcViecDs(S.bcc, S.bcV).dong.find((y) => y.k === d.k); if (!x) return;
    /* 10–90%: +10 ở 90% là hoàn thành, −10 không xuống dưới 10% (báo cáo không ghi "đang gia công 100%" hay "0%") */
    const cu = x.tt === 'xong' ? 100 : x.tt, moi = Math.round((cu + Number(d.v)) / 10) * 10;
    bcVDat(d.k, moi >= 100 ? 'xong' : Math.max(10, moi)); bcNhap(); render();
  },
  bcvxong(d) {
    const x = bcViecDs(S.bcc, S.bcV).dong.find((y) => y.k === d.k); if (!x) return;
    if (x.tt !== 'xong') bcVDat(d.k, 'xong');
    // bỏ "xong": đơn về số của đơn (đơn đã xong thật thì về 90%), việc tự thêm về 90%
    else if (d.k[0] === 'd' && x.doi && (S.bcc.don.find((o) => 'd' + o.id === d.k) || {}).tt !== 'xong') bcVDat(d.k, undefined);
    else bcVDat(d.k, 90);
    bcNhap(); render();
  },
  bcvbo(d) { bcVDat(d.k, undefined, true); bcNhap(); render(); },
  // dòng đã chỉnh mà đơn đã đi tiếp: lấy lại theo số của đơn
  bcvtheo(d) { bcVDat(d.k, undefined); bcNhap(); render(); },
  bcvthem(d) {
    const id = String(d.v), o = S.bcV.d[id];
    if (o && o.an) { delete o.an; if (!Object.keys(o).length) delete S.bcV.d[id]; }
    const don = S.bcc.don.find((x) => String(x.id) === id);
    if (don && !(don.pct > 0) && don.tt !== 'xong' && !S.bcV.them.includes(don.id)) S.bcV.them.push(don.id);
    bcNhap(); render();
  },
  bcvmo() { S.bcvMo = !S.bcvMo; ['bcv_ten', 'bcv_tang', 'bcv_truc'].forEach((k) => delete S.form[k]); render(); },
  bcvck(d) { S.form.bcv_ten = d.v; render(); gcFocus('bcv_tang'); },
  bcvmoi(d) {
    // người gõ sẵn chữ "tầng" / "trục" trong ô thì bỏ, khỏi thành "tầng Tầng 5"
    const g = (k) => String(S.form[k] || '').trim(), tang = g('bcv_tang').replace(/^tầng\s*/iu, ''), truc = g('bcv_truc').replace(/^trục\s*/iu, '');
    const ten = bcTenViec([g('bcv_ten'), tang && 'tầng ' + tang, truc && 'trục ' + truc].filter(Boolean).join(' '));
    if (!g('bcv_ten')) { say('Ghi việc gì (hoặc chạm loại cấu kiện).', true); render(); return gcFocus('bcv_ten'); }
    S.bcV.tu.push({ id: 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ten, tt: d.v === 'xong' ? 'xong' : 10 });
    ['bcv_ten', 'bcv_tang', 'bcv_truc'].forEach((k) => delete S.form[k]); S.bcvMo = false;
    bcNhap(); render();
  },
  // chuyển mục 4 sang sửa bằng chữ, bắt đầu từ đúng chữ đang hiện
  bcvchu() { S.bcM.s4 = bcGet('s4'); bcNhap(); render(); },
  // đổi nguồn quân số là ghép lại mục 3 theo nguồn mới (chữ đã sửa tay ở mục 3 bỏ đi)
  bcnguon(d) { S.bcNguon = d.v === 'tl' ? 'tl' : 'to'; delete S.bcM.s3; bcNhap(); render(); },
  // bỏ phần sửa chưa chép của máy này: về đúng bản dùng chung đang lưu
  bcbo() { if (!S.bcc) return; bcGhep(S.bcc, null); bcNhap(); S.bcMo = null; say('Đã bỏ phần sửa chưa chép, về bản chung đang lưu.'); render(); },
  /* Chép cả báo cáo, hoặc riêng một phần (d.k = 'dau', 's3' … 's8'). Lần chép nào cũng lưu cả báo cáo của ca: phần
     đầu và máy móc thành mẫu cho ca sau, thẻ nhắc soạn báo cáo ở Tổng quan thôi nhắc. */
  async bcchep(d) {
    if (!S.bcc) return;
    const t = bcTao(), k = d && d.k, phan = k ? bcPhan()[k] : null;
    const ten = k === 'dau' ? 'phần đầu' : k ? 'mục ' + (BC_MUC.find((m) => m[0] === k) || ['', k])[1] : '';
    // chép TRƯỚC khi gọi mạng: trình duyệt chỉ cho chép ngay sau lần bấm
    const ok = await bcChepChu(phan ? phan.join('\n') : t);
    bcLuu(t, null, ok ? (phan ? `Đã chép ${ten}.` : 'Đã chép cả báo cáo. Mở Zalo và dán vào nhóm.') : 'Máy không cho chép tự động: chạm giữ vào chữ để chép tay. Báo cáo đã lưu.');
  },
  bcktmau() { if (S.bcc) bcLuu(bcTao(), { kt_mau: true }, 'Đã đặt các dòng kiểm tra này làm mẫu.'); },
  async qhgui(d) {
    const x = qhDang(); if (!x || caKhoa(x.c) !== d.v) return;
    const H = qhState(), T = qhTinh(), note = String(S.form.qhnote || '').trim();
    if (T.loi) { H.thu = true; say(T.loi, true); render(); return gcFocus(!T.tong ? 'qhtong' : T.haiCa ? 'qhbc' : 'qhtong'); }
    if (H.nghi.khac && !note) { say('Có người nghỉ vì lý do khác: ghi rõ lý do.', true); H.mo = true; render(); return gcFocus('qhnote'); }
    const body = { ngay: x.c.ngay, ca: x.c.ca, tong: T.tong, lam: T.lam, nghi: { ...H.nghi }, ghi_chu: note };
    act(async () => {
      try { await api('PUT', '/quanso', body); }
      catch (e) {
        if (!e.net && !e.retry) throw e;
        // mất sóng (hoặc máy chủ tạm lỗi): lưu trên máy theo người, tự gửi khi có mạng (qsFlush)
        qsGhiHang(qsHangDoi().filter((j) => !(j.uid === S.me.id && j.body.ngay === body.ngay && j.body.ca === body.ca)).concat({ id: Date.now() + ':' + Math.random(), uid: S.me.id, body, at: Date.now() }));
        qhBo();
        say('Mất sóng: đã lưu quân số trên máy, app tự gửi khi có mạng.');
        return;
      }
      // đã ghi: bỏ thẻ đang gõ TRƯỚC, tải lại SAU và bỏ qua lỗi mạng lúc tải lại
      qhBo();
      say(`Đã báo quân số ${caGoi(x.c)}: đi làm ${T.lam}/${T.tong}${T.nghi ? ', nghỉ ' + T.nghi : ''}.`);
      try { await loadBoot(); } catch (e) { /* vòng tự làm mới sẽ tải lại */ }
    });
  },
  qshan() {
    const Q = S.qs; if (!Q) return;
    const ca1 = gioPhut(fv('qsh1', phutGio(Q.hanPhut[0]))), ca2 = gioPhut(fv('qsh2', phutGio(Q.hanPhut[1])));
    if (Number.isNaN(ca1) || Number.isNaN(ca2)) return say('Chọn đủ giờ hạn báo của hai ca.', true), render();
    act(async () => {
      await api('PUT', '/quanso/han', { ca1, ca2 });
      delete S.form.qsh1; delete S.form.qsh2;
      try { await Promise.all([qsTai(), loadBoot()]); } catch (e) { /* đã lưu; vòng tự làm mới sẽ tải lại */ }
    }, `Đã lưu hạn báo: ca ngày trước ${phutGio(ca1)}, ca đêm trước ${phutGio(ca2)}.`);
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
  if (m === 'gcq') gcLoc();
  if (m && GC_O_TRUC.includes(m)) { const x = document.getElementById('gctrucxem'); if (x) x.textContent = gcTrucCua() || 'chưa nhập'; }
  /* Quân số đầu ca: gõ tổng thì số đi làm và dòng tóm tắt chạy theo ngay, không vẽ lại màn hình giữa lúc gõ.
     Gõ vào ô đi làm là gõ đè (tổ chia hai ca); xoá trắng ô đó thì về lại số app tự tính. */
  /* Báo cáo ca: gõ vào một mục là mục đó thành "đã sửa tay"; không vẽ lại màn hình (vẽ lại giữa lúc gõ là mất vị
     trí con trỏ trong ô nhiều dòng) — đóng ô sửa là thấy chữ sẽ gửi của mục đó. Nháp lưu xuống máy theo ca. */
  if (m && S.bcc && S.screen === 'baocaoca' && (/^bc_s[3-8]$/.test(m) || /^bcd_/.test(m))) {
    if (m.startsWith('bc_')) S.bcM[m.slice(3)] = e.target.value; else S.bcDau[m.slice(4)] = e.target.value;
    bcNhap();
  }
  // bảng thiết lập quân số: dòng tổng của mọi tổ chạy theo số đang gõ
  if (m && /^tl_\d+_[t12]$/.test(m) && S.qs && S.screen === 'quanso') {
    const T = qsTlTong();
    [['tlS_t', T.tong], ['tlS_1', T.s1], ['tlS_2', T.s2]].forEach(([id, v]) => { const el = document.getElementById(id); if (el) el.textContent = v; });
    // ô của ca chưa gõ tay mà đang theo tổng (tổ một ca, vừa đổi ca hoặc chưa có số): chạy theo tổng đang gõ
    const uid = Number(m.split('_')[1]), d = qsTlMacDinh(uid);
    [1, 2].forEach((c) => { const el = document.getElementById(`tl_${uid}_${c}`); if (el && !el.disabled && S.form[`tl_${uid}_${c}`] === undefined) el.value = String(d['s' + c]); });
  }
  // thẻ báo quân số trên Tổng quan: dòng tóm tắt chạy theo ô đang gõ, không vẽ lại cả trang
  if (m && /^qhn_/.test(m) && S.qsH) { const n = soTu(e.target.value); if (n) S.qsH.nghi[m.slice(4)] = n; else delete S.qsH.nghi[m.slice(4)]; }
  if (m && (m === 'qhtong' || m === 'qhbc' || /^qhn_/.test(m)) && S.boot && S.boot.qs && S.boot.qs.toi) {
    const T = qhTinh(), pv = document.getElementById('qhprev'), nt = document.getElementById('qhnt');
    if (nt) nt.textContent = T.nghi ? T.nghi + ' người' : 'không ai';
    if (pv) { pv.textContent = qhPrevTxt(T); pv.style.color = qhLoiDo(T) ? 'var(--bad)' : ''; pv.style.fontWeight = T.loi && !qhLoiDo(T) ? '400' : ''; }
  }
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
  if (e.target.id === 'svtan') { // sổ sắt vụn: hiện số kg ngay khi gõ số tấn
    const kg = svKg(e.target.value), k = document.getElementById('svkg');
    if (k) k.textContent = kg > 0 ? '= ' + fmtInt(kg) + ' kg' : 'Ghi theo phiếu cân, đơn vị tấn (dấu phẩy cho số lẻ).';
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
  if (t.dataset && t.dataset.change === 'tlca') { S.form[t.dataset.model] = t.value; render(); return; }
  if (t.dataset && t.dataset.change === 'tkcachon') { ACTIONS.tkca({ v: t.value }); return; }
  if (t.dataset && t.dataset.change === 'tkngaychon') { if (t.value) { S.tkNgay = t.value > S.boot.today ? S.boot.today : t.value; S.tkChe = 'ngay'; tkDam(); } return; }
  if (t.dataset && t.dataset.change === 'gchan') { S.form.gchan = t.value || ''; render(); return; }
  if (t.dataset && t.dataset.change === 'logday') { S.auditF.ngay = t.value || ''; go('nhatky', true); return; }
  if (t.dataset && t.dataset.change === 'hdate') { if (t.value) loadHist(t.value > S.boot.today ? S.boot.today : t.value); return; }
  if (t.dataset && t.dataset.change === 'chucdanh') {
    const id = t.dataset.id, chuc_danh = t.value || null;
    act(async () => {
      try { await api('POST', `/users/${id}/chuc-danh`, { chuc_danh }); }
      finally { await loadUsers(); }
      await loadBoot();
    }, chuc_danh ? 'Đã gắn chức danh ' + ROLE[chuc_danh] + '.' : 'Đã bỏ chức danh.');
    return;
  }
  if (t.dataset && t.dataset.change === 'role') {
    const id = t.dataset.id, role = t.value;
    const u = (S.users || []).find((x) => x.id === Number(id));
    /* Thôi là Tiểu đội trưởng thì server gỡ người này khỏi mọi khu đang phụ trách. Khu mà họ là người
       DUY NHẤT sẽ thành chưa giao ai — nói ra trước khi bấm, y như lúc xoá tài khoản (xem udelete). */
    const ku = (S.boot && S.boot.ku) || {};
    const cua = role === 'tieudoi' ? [] : Object.keys(ku).filter((k) => ku[k].includes(Number(id)));
    const solo = cua.filter((k) => ku[k].length === 1);
    const tenKhu = (k) => (S.boot.khuBy[k] && S.boot.khuBy[k].name) || k;
    const msg = `Đổi vai trò ${u ? u.name : ''} thành ${ROLE[role]}?`
      + (cua.length ? `\n\n• Thôi phụ trách ${cua.map(tenKhu).join(', ')}: chỉ Tiểu đội trưởng mới đứng tên khu.` : '')
      + (solo.length ? `\n• ${solo.map(tenKhu).join(', ')} sẽ không còn ai phụ trách — Tiểu đội trưởng nào cũng đếm được. Giao người khác ở Cài đặt → Khu bãi.` : '');
    if (!(await ask(msg, 'ĐỔI VAI TRÒ'))) return render(); // vẽ lại để ô chọn quay về vai trò cũ
    act(async () => {
      try { await api('POST', `/users/${id}/role`, { role, confirm_khu: solo.length > 0 }); }
      catch (e) { if (e.code === 'khu_open') await loadBoot(); throw e; }
      finally { await loadUsers(); }
      await loadBoot();
    }, 'Đã đổi vai trò.' + (cua.length ? ' Đã gỡ khỏi ' + cua.map(tenKhu).join(', ') + '.' : ''));
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
  // đang mở một đơn gia công (đang trao đổi): hỏi dày hơn để tin tới nhanh
  if (S.screen === 'gcdon') return 15e3;
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
    qsFlush();
    if (S.boot && r.today !== S.boot.today && S.screen === 'dem') {
      // nháp đang đếm thuộc ngày cũ: không để lẫn sang ngày mới
      S.screen = 'home'; S.sel = null;
      say('Đã sang ngày mới, hãy mở lại màn Báo cáo để báo cho hôm nay.', true);
    }
    // sang ca mới cũng tải lại: thẻ nhắc quân số đầu ca tính theo ca, mà giao ca thì không làm đổi rev
    const sangCa = S.boot && S.boot.qs && Date.now() + (S.boot.skew || 0) >= S.boot.qs.den;
    const changed = !S.boot || S.stale || r.rev !== S.boot.rev || r.today !== S.boot.today || sangCa;
    // đang nhập số ở màn Đếm thì không vẽ lại giữa chừng (trừ khi sang ngày mới)
    const busy = S.screen === 'dem' && S.sel && S.boot && r.today === S.boot.today;
    /* Màn Duyệt cũng làm mới: admin để màn này mở cả buổi, không làm mới thì khu báo lại hay gửi sau
       chốt mà màn hình vẫn bày số cũ. Đang mở hộp xác nhận thì để yên, vòng sau hỏi lại. */
    const reviewBusy = S.screen === 'duyet' && (S.ask || S.busy);
    if (changed && !busy && !reviewBusy && ['home', 'ton', 'khu', 'nhap', 'dem', 'stats', 'vaymuon', 'vaychitiet', 'satvun', 'duyet', 'giacong', 'gcdon', 'quanso', 'qstk'].includes(S.screen)) {
      await loadBoot();
      if (S.screen === 'quanso') await qsTai();
      if (S.screen === 'qstk') S.tk = await tkTai();
      if (S.screen === 'giacong') S.gc = await api('GET', '/giacong');
      if (S.screen === 'gcdon' && S.gcId) { S.gcDetail = await api('GET', '/giacong/' + S.gcId); gcDocXong(); }
      if (S.screen === 'vaymuon') S.loans = await api('GET', '/loans');
      if (S.screen === 'satvun') S.svs = await svTai();
      if (S.screen === 'vaychitiet') S.loanDetail = await api('GET', '/loans?doitac=' + S.loanDt);
      if (S.screen === 'duyet') await reloadReview();
      render();
    }
    /* Màn báo cáo ca: tổ báo thêm (hay đơn gia công đổi) thì bước 1 và các phần chưa sửa tay phải theo số mới. Chỉ thay
       SỐ LIỆU — chữ đang sửa, phần đang mở giữ nguyên. Đang mở ô sửa thì không vẽ lại (mất con trỏ trong ô nhiều
       dòng): đóng ô là thấy số mới. */
    if (changed && S.screen === 'baocaoca' && S.bcc && !S.busy && !S.ask) {
      await loadBoot();
      const B = S.bcc, M = await api('GET', `/baocao?ngay=${B.ngay}&ca=${B.ca}`);
      if (S.bcc === B && S.screen === 'baocaoca') {
        // bản dùng chung mới làm nền, phần mình sửa chưa chép ghép lại lên trên; người khác vừa chép thì nói rõ
        const K = bcKhac(), moi = M.bao && (!B.bao || M.bao.ts !== B.bao.ts) && M.bao.by_id !== S.me.id;
        bcGhep(M, K); bcNhap();
        if (moi) say(`${M.bao.by_name} vừa chép báo cáo ca này. Màn hình đã lấy bản đó${bcCoKhac(K) ? ', phần bạn đang sửa vẫn giữ' : ''}.`);
        if (!S.bcMo) render();
      }
    }
    /* Chỉ có tin nhắn gia công mới (rev không đổi): hỏi lại tin chưa đọc của mình và đơn / bảng đang mở, không tải lại cả
       dữ liệu chung. Đang gõ dở tin thì không vẽ lại (mất chữ đang gõ), vòng sau hỏi lại. */
    else if (S.boot && r.tn != null && r.tn !== S.tnBiet && !(document.activeElement && document.activeElement.id === 'gctn' && S.form.gctn)) {
      S.tnBiet = r.tn;
      await gcTnTai();
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
// xoá nháp đếm của các ngày trước để localStorage không phình mãi
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
    if (!r.user.must_change) { await loadBoot(); cleanDrafts(S.boot.today); flushPending(); qsFlush(); }
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
  window.addEventListener('online', () => { render(); refresh(); flushPending(); qsFlush(); });
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
