'use strict';
/* Kho Thép Bãi - giao diện (không cần build). Gọi API /api/* trên cùng domain. */

const $app = document.getElementById('app');
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtInt = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const fmtT = (kg) => (kg / 1000).toFixed(2).replace('.', ',');
// phi có unit='cuon' (D8) đếm theo cuộn, không phải cây; nội bộ vẫn lưu cây, chỉ hiển thị đổi sang cuộn
const isCuon = (p) => { const o = typeof p === 'string' ? (S.boot && S.boot.phiBy[p]) : p; return !!(o && o.unit === 'cuon'); };
const unitLbl = (p) => isCuon(p) ? 'cuộn' : 'cây';
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

/* ===== Kiểu hiện số lượng =====
   Mặc định hiện cả cây + bó + tấn để hình dung nhanh; người dùng đổi ở Thêm → Cách hiện số lượng.
   Lưu riêng từng máy nên mỗi người chọn kiểu hợp với mình, không ảnh hưởng người khác. */
const UNIT_OPTS = [['all', 'Tất cả'], ['cay', 'Cây'], ['bo', 'Bó'], ['kg', 'Tấn']];
const qCay = (v, po) => (isCuon(po) ? cuonTxt(v, po) : `${fmtInt(v)} cây`);
// bó chỉ có nghĩa với cây nguyên; thép cuộn luôn trả về dạng cuộn.
// bare = đứng trong ngoặc sau số cây nên bỏ chữ "cây" ở phần lẻ cho gọn; đứng một mình thì phải có.
const qBo = (v, po, bare) => {
  if (isCuon(po)) return cuonTxt(v, po);
  if (!po || po.bo_size <= 1 || v < po.bo_size) return `${fmtInt(v)} cây`;
  const c = Math.floor(v / po.bo_size), r = v % po.bo_size;
  return r ? `${fmtInt(c)} bó + ${fmtInt(r)}${bare ? '' : ' cây'}` : `${fmtInt(c)} bó`;
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
  const cay = qCay(v, po), bo = qBo(v, po, true);
  // "1.250 cây (31 bó + 10) · 23,10 tấn"; bỏ ngoặc khi phần bó trùng y hệt phần cây
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
  draft: { cells: {}, added: {} }, sel: null, bo: '', le: '', field: 'bo', rep: { bo: false, le: false }, zoomK: null, confirmKeep: false,
  toast: '', toastErr: false, form: {}, err: '',
  review: null, showNormal: false, audit: null, logFilter: 'all', users: null, pinShown: null,
  usage: null, usageDays: 30, statScope: 'all', expand: {},
  // chú thích màu của bảng đếm: mở sẵn cho người mới, đóng một lần rồi thì nhớ luôn
  legendSeen: (() => { try { return !!localStorage.getItem('kt:legendSeen'); } catch (e) { return false; } })(),
  nhap: { mode: 'nhap', phi: null, qty: 0, khu: null, from: null, to: null, lines: [], done: null }, scrollSel: null,
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
  b.cm = {}; b.counts.forEach((c) => (b.cm[c.khu_id + '|' + c.phi_id] = c));
  b.bm = {}; b.baseline.forEach((r) => (b.bm[r.khu_id + '|' + r.phi_id] = r.v));
  b.rm = {}; b.reports.forEach((r) => (b.rm[r.khu_id] = r));
  // nhập/chuyển kể từ lần chốt trước theo khu × phi, và cộng theo phi
  b.mv = {}; b.innPhi = {};
  (b.innKhu || []).forEach((r) => { b.mv[r.khu_id + '|' + r.phi_id] = r.q; b.innPhi[r.phi_id] = (b.innPhi[r.phi_id] || 0) + r.q; });
  b.rate = {}; b.rateDays = {};
  (b.rates || []).forEach((r) => { b.rate[r.phi_id] = r.per_day; b.rateDays[r.phi_id] = r.days || 0; });
  // phi admin đã tắt: không hiện trong bảng đếm / nhập kho nữa, nhưng vẫn tra cứu được số liệu cũ qua phiBy
  b.phiAct = b.phi.filter((p) => p.active !== 0);
  // ku[khu] = mảng user_id phụ trách; khu không có trong ku = chưa phân công, ai cũng đếm được
  b.ku = {}; (b.khuUser || []).forEach((r) => { (b.ku[r.khu_id] = b.ku[r.khu_id] || []).push(r.user_id); });
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
const isPresent = (k, p) => {
  const b = S.boot;
  const kp = b.kp[k + '|' + p];
  if (kp && kp.active) return true;
  const c = b.cm[k + '|' + p];
  if (c && c.v > 0) return true;
  return k === S.khu && !!S.draft.added[p];
};
const refOf = (k, p) => S.boot.bm[k + '|' + p]; // undefined nếu chưa có tồn chuẩn
const movedOf = (k, p) => S.boot.mv[k + '|' + p] || 0; // nhập/chuyển vào (+) hoặc ra (−) khu từ lần chốt trước
// số dự kiến = tồn chuẩn hôm qua + nhập/chuyển; dùng để so lệch khi đếm
const expOf = (k, p) => { const r = refOf(k, p), m = movedOf(k, p); return r === undefined ? (m ? m : undefined) : r + m; };
// chỉ cho "giữ nguyên" khi có số hôm qua, khu không có thép nhập/chuyển, và chưa giữ nguyên quá số ngày cho phép
function keepBlock(k, p) {
  if (refOf(k, p) === undefined) return 'Phi này chưa có số hôm qua, hãy nhập số đếm.';
  if (movedOf(k, p)) return 'Khu có thép nhập/chuyển phi này từ lần chốt trước, hãy đếm thực tế.';
  if ((S.boot.kp[k + '|' + p] || {}).keep_streak >= S.boot.settings.max_keep_streak) return 'Phi này giữ nguyên quá nhiều ngày, hãy đếm lại.';
  return '';
}
function valOf(k, p, useDraft) {
  const b = S.boot;
  if (useDraft && k === S.khu && S.draft.cells[p]) return S.draft.cells[p].v;
  const c = b.cm[k + '|' + p];
  if (c) return c.v;
  const r = b.bm[k + '|' + p];
  return r === undefined ? 0 : r;
}
function totals() {
  const b = S.boot;
  const T = { cay: 0, kg: 0, perPhi: {}, perKhu: {}, used: {}, usedKg: null, inKg: 0, hidKg: 0 };
  b.phi.forEach((p) => (T.perPhi[p.id] = 0));
  b.khuAct.forEach((k) => (T.perKhu[k.id] = { cay: 0, kg: 0 }));
  // cộng cả khu đang ẩn (nếu còn thép) để tổng khớp với màn Duyệt
  for (const k of b.khu) {
    for (const p of b.phi) {
      const v = valOf(k.id, p.id);
      T.perPhi[p.id] += v; if (!isCuon(p)) T.cay += v; T.kg += v * p.kg_per_cay;
      if (T.perKhu[k.id]) { if (!isCuon(p)) T.perKhu[k.id].cay += v; T.perKhu[k.id].kg += v * p.kg_per_cay; }
      else T.hidKg += v * p.kg_per_cay; // khu đã ẩn mà còn thép: vẫn vào tổng bãi, nói rõ ở Tổng quan
    }
  }
  // "Nhập hôm nay" chỉ tính thép về, không tính chuyển khu
  b.receipts.forEach((r) => { const p = b.phiBy[r.phi_id]; if (p && r.kind !== 'chuyen') T.inKg += r.qty * p.kg_per_cay; });
  // nhập kể từ lần chốt gần nhất (gồm ngày quên chốt), giống cách server tính; chuyển khu tự triệt tiêu
  const inn = b.innPhi;
  if (b.lastClosed) {
    T.usedKg = 0;
    for (const p of b.phi) {
      let old = 0;
      for (const k of b.khu) old += b.bm[k.id + '|' + p.id] || 0;
      let cnt = 0;
      for (const k of b.khu) cnt += valOf(k.id, p.id);
      const u = old + (inn[p.id] || 0) - cnt;
      T.used[p.id] = u; T.usedKg += u * p.kg_per_cay;
    }
  }
  return T;
}
function khuStatus(k) {
  const r = S.boot.rm[k.id];
  if (!r) return { cls: 'idle', label: 'Chưa báo', who: 'Chưa có ai báo' };
  const who = r.uname + ' · ' + hhmm(r.ts);
  if (r.conflict && !r.resolved) return { cls: 'warn', label: 'Cần xem', who: '2 người báo số khác nhau' };
  if (r.recount) return { cls: 'warn', label: 'Đếm lại', who: 'Admin yêu cầu đếm lại' };
  return { cls: 'ok', label: 'Đã báo', who };
}
const reportedCount = () => S.boot.khuAct.filter((k) => S.boot.rm[k.id]).length;

/* ===================== NHÁP & GỬI BÁO CÁO ===================== */
const draftKey = () => 'kt:' + S.boot.today + ':' + S.khu;
function saveDraft() { try { localStorage.setItem(draftKey(), JSON.stringify(S.draft)); } catch (e) { /* đầy bộ nhớ */ } }
function loadDraft(fresh) {
  let d = null;
  if (!fresh) { try { d = JSON.parse(localStorage.getItem(draftKey()) || 'null'); } catch (e) { d = null; } }
  const rep = S.boot.rm[S.khu];
  S.draftWarn = null;
  // nháp cũ trên máy, nhưng sau đó người khác đã gửi báo cáo khu này: hỏi dùng số nào
  if (d && d.cells && rep && rep.user_id !== S.me.id && rep.ts > (d.baseTs || 0) && Object.keys(d.cells).length) S.draftWarn = { uname: rep.uname, ts: rep.ts };
  if (!d || !d.cells) {
    d = { cells: {}, added: {}, baseTs: rep ? rep.ts : 0 };
    for (const c of S.boot.counts) {
      if (c.khu_id === S.khu) d.cells[c.phi_id] = { v: c.v, kind: c.kind, bo: c.bo == null ? undefined : c.bo, le: c.le == null ? undefined : c.le };
    }
  }
  S.draft = d;
}
function openDem(k) {
  S.khu = k; S.sel = null; S.bo = ''; S.le = ''; S.zoomK = null; S.confirmKeep = false;
  if (!S.legendSeen) S.legend = true;
  try { localStorage.setItem('kt:lastKhu', k); } catch (e) { /* bỏ qua */ }
  loadDraft();
  S.screen = 'dem';
}
function myPhiList() { return S.boot.phiAct.filter((p) => isPresent(S.khu, p.id)); }
function pendingList() { return myPhiList().filter((p) => !S.draft.cells[p.id]); }

/* Hàng chờ báo cáo: mỗi báo cáo ghi kèm NGÀY ĐẾM. Server từ chối nếu đã sang ngày khác,
   khi đó báo cáo nằm lại kèm lý do để người dùng tự chọn "gửi làm số hôm nay" hoặc "bỏ". */
const PKEY = 'kt:pending';
function readPending() {
  try { const q = JSON.parse(localStorage.getItem(PKEY) || '[]'); return Array.isArray(q) ? q : []; } catch (e) { return []; }
}
function writePending(q) { try { localStorage.setItem(PKEY, JSON.stringify(q)); } catch (e) { /* đầy bộ nhớ */ } }
const sameJob = (a, b) => a.khu === b.khu && a.day === b.day && a.ts === b.ts;
// khoá nhận dạng một báo cáo trong hàng chờ: vị trí trong mảng đổi sau mỗi lần tự gửi, không dùng được
const pendKey = (j) => j.khu + '|' + (j.day || '') + '|' + j.ts;
function queuePending(job) {
  writePending(readPending().filter((x) => !(x.khu === job.khu && x.day === job.day)).concat([job]));
}
let flushing = false;
async function flushPending() {
  if (flushing || !S.me || S.me.must_change) return;
  const q = readPending();
  if (!q.some((j) => !j.err)) return;
  flushing = true;
  const rest = [];
  let sent = 0, failed = 0;
  try {
    for (const job of q) {
      if (job.err) { rest.push(job); continue; }
      if (!job.day) { rest.push({ ...job, err: 'Báo cáo lưu từ bản cũ, không rõ ngày đếm' }); failed++; continue; }
      try { await api('PUT', '/counts', { khu: job.khu, day: job.day, items: job.items }); sent++; }
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
  if (pendingList().length) return;
  const items = list.map((p) => { const c = S.draft.cells[p.id]; return { phi: p.id, v: c.v, kind: c.kind, bo: c.bo, le: c.le }; });
  const khuName = S.boot.khuBy[S.khu].name;
  const job = { khu: S.khu, day: S.boot.today, items, ts: Date.now() };
  try {
    const r = await api('PUT', '/counts', { khu: job.khu, day: job.day, items });
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
  const q = readPending();
  if (!q.length) return '';
  const kn = (id) => (S.boot && S.boot.khuBy[id] ? S.boot.khuBy[id].name : id);
  const waiting = q.filter((j) => !j.err).length;
  return (waiting ? `<div class="card warn sm b">${waiting} báo cáo đang chờ gửi (mất mạng), sẽ tự gửi khi có mạng.</div>` : '') +
    q.map((j) => (j.err ? `<div class="card bad col gap8"><b style="font-size:17px">Báo cáo ${esc(kn(j.khu))}${j.day ? ' đếm ngày ' + esc(fmtDay(j.day)) : ''} chưa gửi được</b>
      <span class="sm">${esc(j.err)}</span>
      <div class="row gap6"><button class="btn s f1" data-a="pendsend" data-j="${esc(pendKey(j))}">Gửi làm số hôm nay</button><button class="btn s bad f1" data-a="pendrm" data-j="${esc(pendKey(j))}">Bỏ báo cáo</button></div></div>` : '')).join('');
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
  const miss = b.khuAct.filter((k) => !b.rm[k.id]);
  if (miss.length) alerts.push({ bad: false, t: (miss.length === 1 ? miss[0].name : miss.length + ' khu') + ' chưa báo', s: miss.map((k) => k.name).join(', '), to: 'dem' });
  b.reports.forEach((r) => {
    const k = b.khuBy[r.khu_id];
    if (!k || !k.active) return;
    if (r.conflict && !r.resolved) alerts.push({ bad: false, t: k.name + ': 2 người báo số khác nhau', s: isAdmin() ? 'Vào Duyệt để chọn số' : 'Admin đang xem', to: isAdmin() ? 'duyet' : null });
    if (r.recount) alerts.push({ bad: false, t: k.name + ' cần đếm lại', s: 'Admin yêu cầu đếm lại', to: 'dem' });
  });
  // Gom các phi cùng một loại cảnh báo vào MỘT thẻ khi có nhiều hơn 2:
  // ngày đầu chưa có tồn chuẩn, cả 15 phi đều dưới mức tối thiểu sẽ đẩy hết nội dung khác xuống dưới.
  const rateTxt = (p) => (b.rate[p.id] ? (isCuon(p) ? fmtDec(b.rate[p.id] / p.bo_size) + ' cuộn/ngày' : fmtInt(b.rate[p.id]) + ' cây/ngày') : '');
  const neg = [], low = [], shortp = [];
  b.phiAct.forEach((p) => {
    if (b.lastClosed && T.used[p.id] < 0) neg.push(p);
    const dl = daysLeft(p.id, T.perPhi[p.id]);
    if (T.perPhi[p.id] < p.min_stock) low.push(p);
    else if (dl !== null && dl < 3) shortp.push({ p, dl });
  });
  const toDuyet = isAdmin() ? 'duyet' : null; // người không phải admin: thẻ chỉ để đọc, không bấm được
  if (neg.length > 2) alerts.push({ bad: true, t: neg.length + ' phi có số "đã dùng" âm', s: neg.map((p) => p.id).join(', ') + ' · nhập sót phiếu hoặc đếm sai?', to: toDuyet });
  else neg.forEach((p) => alerts.push({ bad: true, t: p.id + ' đã dùng âm (' + qMain(T.used[p.id], p) + ')', s: 'Nhập sót phiếu hoặc đếm sai?', to: toDuyet }));
  if (low.length > 2) alerts.push({ bad: true, t: low.length + ' phi dưới mức báo động', s: low.map((p) => p.id).join(', '), to: 'ton' });
  else low.forEach((p) => alerts.push({ bad: true, t: p.id + ' dưới mức báo động', s: 'Còn ' + qMain(T.perPhi[p.id], p) + ', báo động ' + minStockLbl(p), to: 'ton' }));
  if (shortp.length > 2) alerts.push({ bad: false, t: shortp.length + ' phi chỉ còn đủ dùng dưới 3 ngày', s: shortp.map((x) => x.p.id).join(', '), to: 'ton' });
  else shortp.forEach((x) => alerts.push({ bad: false, t: x.p.id + ' chỉ còn đủ dùng ' + daysTxt(x.dl), s: 'Còn ' + qMain(T.perPhi[x.p.id], x.p) + (rateTxt(x.p) ? ', dùng TB ' + rateTxt(x.p) : ''), to: 'ton' }));
  const maxKhu = Math.max(1, ...b.khuAct.map((k) => T.perKhu[k.id].kg));
  // dùng kg để scale bar (so sánh D8 cuộn vs D10+ cây trên cùng thước đo)
  const maxBarKg = Math.max(1, ...b.phiAct.map((p) => T.perPhi[p.id] * p.kg_per_cay), ...b.phiAct.map((p) => p.min_stock * p.kg_per_cay));
  const khuCards = b.khuAct.map((k) => {
    const st = khuStatus(k), tk = T.perKhu[k.id];
    const unrep = !b.rm[k.id];
    return `<div class="card col gap8" style="${st.cls === 'warn' ? 'background:var(--warnbg);border:2px solid var(--warn)' : ''}">
      <div class="row" style="justify-content:space-between;gap:8px;align-items:flex-start"><b class="clamp2" style="font-size:20px;min-width:0">${esc(k.name)}</b><b style="font-size:20px;white-space:nowrap;flex:none">${fmtT(tk.kg)} tấn</b></div>
      <div class="bar"><i style="width:${Math.round(tk.kg / maxKhu * 100)}%"></i></div>
      <div class="row" style="justify-content:space-between;gap:8px"><span class="sm">${esc(st.who)}${unrep && b.lastClosed ? ' · tạm lấy số hôm qua' : ''}</span><span class="badge ${st.cls}">${st.label}</span></div>
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
  const note = (miss.length ? `Tạm tính: ${miss.length} khu chưa báo${b.lastClosed ? ' nên lấy số hôm qua' : ''}` : 'Đủ ' + b.khuAct.length + '/' + b.khuAct.length + ' khu đã báo hôm nay')
    + (T.hidKg > 0 ? ` · gồm ${fmtT(T.hidKg)} tấn ở khu đã ẩn (không có trong danh sách dưới)` : '');
  return `<div class="f1 scroll" id="body">
    <div class="hero">
      <div class="row" style="justify-content:space-between"><span>Tổng quan · ${esc(b.today.split('-').reverse().join('/'))}</span><span class="badge" style="background:#fff;color:var(--pri)">${ROLE[S.me.role]}</span></div>
      <div class="row" style="justify-content:space-between;align-items:flex-end;gap:10px;flex-wrap:wrap"><div class="col"><span style="font-size:15px">Tồn toàn bãi</span><span class="big">${fmtT(T.kg)} tấn</span></div><span style="font-size:17px;padding-bottom:6px;white-space:nowrap">${fmtInt(T.cay)} cây nguyên</span></div>
      <div class="sm" style="color:#D6E0EE">${note}</div>
      <div class="mini"><div><span>Nhập hôm nay</span><b>${fmtT(T.inKg)} tấn</b></div><div><span>${usedLabel}</span><b>${T.usedKg === null ? '—' : fmtT(T.usedKg) + ' tấn'}</b></div></div>
    </div>
    ${b.closed ? '<div class="toast" style="margin-top:12px">Ngày hôm nay đã được admin chốt.</div>' : ''}
    <div class="pad col gap12">
      ${pendingHtml()}
      ${alerts.length ? `<h2 class="sec">Cần xử lý (${alerts.length})</h2>` + alerts.map((a) => {
        const inner = `<span class="f1 col" style="gap:2px"><b style="font-size:17px">${esc(a.t)}</b><span class="sm">${esc(a.s)}</span></span>`;
        return a.to
          ? `<button class="alertbtn ${a.bad ? 'bad' : 'warn'}" data-a="nav" data-s="${a.to}">${inner}${IC.chev}</button>`
          : `<div class="alertbtn ${a.bad ? 'bad' : 'warn'}">${inner}</div>`;
      }).join('') : ''}
      <div class="row" style="justify-content:space-between;align-items:baseline;gap:8px"><h2 class="sec" style="min-width:0">Tồn theo khu và người báo</h2><span class="sm muted" style="white-space:nowrap;flex:none">${reportedCount()}/${b.khuAct.length} khu đã báo</span></div>
      ${khuCards}
      <div class="row" style="justify-content:space-between;align-items:baseline"><h2 class="sec">Tồn theo phi</h2><button class="b" style="border:0;background:transparent;color:var(--pri);text-decoration:underline;font-size:15px;padding:8px 0" data-a="nav" data-s="ton">Xem chi tiết</button></div>
      <div class="sm muted">Vạch đen là mức báo động. Thanh đỏ là tồn đã xuống dưới mức báo động.</div>
      <div class="bars">${bars}</div>
    </div></div>`;
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
  const sub = mine.length ? 'Đã báo ' + mine.filter((k) => b.rm[k.id]).length + '/' + mine.length + ' khu của bạn' : 'Bạn chưa được giao khu nào';
  const body = mine.length
    ? `<div class="grid2">${cards}</div>${hidden ? `<div class="sm muted" style="padding:10px 2px;line-height:1.4">Còn ${hidden} khu do người khác phụ trách nên không hiện ở đây.</div>` : ''}`
    : `<div class="card warn col gap6"><b style="font-size:18px">Chưa được giao khu nào</b><span class="sm" style="line-height:1.4">Admin cần vào Thêm → Cài đặt → Khu bãi để gán bạn phụ trách khu. Khi đó khu sẽ hiện ở màn này.</span></div>`;
  return `${head('Chọn khu để đếm', sub, S.khu ? 'dem' : 'home')}
    <div class="f1 scroll pad" id="body">${body}</div>`;
}

/* --- Bảng đếm toàn bãi --- */
function demView() {
  const b = S.boot, k = S.khu, kname = b.khuBy[k].name;
  if (!b.phiAct.length) return `${head('Đếm ' + esc(kname), '', 'home')}<div class="pad muted">Chưa có phi thép nào trong hệ thống. Admin vào Thêm → Cài đặt → "Khôi phục phi mặc định".</div>`;
  if (!canCount(k)) return `${head('Đếm ' + esc(kname), 'Không có quyền', 'khu')}<div class="pad"><div class="card warn col gap6"><b style="font-size:18px">Bạn không phụ trách ${esc(kname)}</b><span class="sm" style="line-height:1.4">Admin đã giao khu này cho người khác. Bấm "Đổi khu" để chọn khu của bạn, hoặc nhờ admin gán quyền.</span><button class="btn s full" data-a="nav" data-s="khu">Đổi khu</button></div></div>`;
  const zk =S.zoomK && S.zoomK !== k ? S.zoomK : null;
  const others = b.khuAct.filter((x) => x.id !== k);
  const shown = zk ? others.filter((x) => x.id === zk) : others;
  const n = Math.max(1, shown.length);
  // vừa màn thì chia đều, quá nhiều khu thì cố định 42px và kéo ngang (không co chữ đến mức không đọc được)
  // cột khu khác tối thiểu 46px (đủ "12.345", "155,07"); nhiều khu thì bảng cuộn ngang thay vì bóp số
  const avail = Math.max(160, (window.innerWidth || 390) - 170);
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
    const present = isPresent(k, p.id);
    const cell = S.draft.cells[p.id];
    const isSel = S.sel === p.id;
    const ref = expOf(k, p.id), mv = movedOf(k, p.id);
    // so với số dự kiến (hôm qua + nhập/chuyển), không phải số hôm qua
    // lệch hiển thị theo đúng đơn vị của phi: tròn cuộn thì ghi cuộn, lẻ thì ghi cây
    const dTxt = (d) => { const a = Math.abs(d), sg = d > 0 ? '+' : '−'; return sg + (isCuon(p) ? cuonTxt(a, p) : fmtInt(a)); };
    const delta = (v) => { if (ref === undefined) return null; const d = v - ref; return { big: ref >= 10 && Math.abs(d) / ref > 0.5, t: d === 0 ? 'đúng dự kiến' : dTxt(d) }; };
    const toDisp = (v) => isCuon(p.id) ? fmtDec(v / p.bo_size) : fmtInt(v);
    let cls, txt, sub = '';
    if (!present) { cls = 'abs'; txt = '·'; }
    else if (isSel) { cls = 'sel'; txt = hasIn ? String(toDisp(curV(p.id))) : '__'; const dl = hasIn ? delta(curV(p.id)) : null; sub = dl ? dl.t : ''; if (dl && dl.big) cls += ' big'; }
    else if (cell) {
      if (cell.kind === 'giu') { cls = 'giu'; txt = '=' + toDisp(cell.v); sub = 'giữ nguyên'; }
      else { const dl = delta(cell.v); cls = dl && dl.big ? 'big' : 'okc'; txt = String(toDisp(cell.v)); sub = dl ? dl.t : ''; }
    } else { cls = 'pend'; txt = ref === undefined ? '?' : String(toDisp(ref)); sub = mv ? 'dự kiến' : 'hôm qua'; }
    // tổng bãi cộng cả khu đã ẩn còn thép, cho khớp số với Tổng quan và màn Duyệt
    let total = 0;
    for (const x of b.khu) {
      const v = x.id === k ? (isSel && hasIn ? curV(p.id) : (cell ? cell.v : valOf(k, p.id))) : valOf(x.id, p.id);
      total += v; T.all += v; T.allKg += v * p.kg_per_cay;
      if (colTotKg[x.id] !== undefined) colTotKg[x.id] += v * p.kg_per_cay;
      if (x.id === k) { T.own += v; T.ownKg += v * p.kg_per_cay; }
    }
    const bg = isSel ? ' sel' : idx % 2 ? ' alt' : '';
    lrows.push(`<div class="mxrow${bg}"><div style="width:40px;padding-left:4px;font-weight:700">${p.id}</div><div style="width:72px;display:flex;justify-content:center"><button class="own ${cls}" aria-label="Nhập ${p.id}" data-a="cell" data-p="${p.id}"><b>${txt}</b><i>${sub}</i></button></div><div style="width:52px;text-align:right;padding-right:6px;font-weight:700">${toDisp(total)}</div></div>`);
    rrows.push(`<div class="mxrow${bg}">${shown.map((x) => {
      const st = khuStatus(x);
      const has = S.boot.cm[x.id + '|' + p.id] || S.boot.bm[x.id + '|' + p.id] !== undefined || (S.boot.kp[x.id + '|' + p.id] && S.boot.kp[x.id + '|' + p.id].active);
      const v = valOf(x.id, p.id);
      const unrep = !b.rm[x.id];
      return `<div class="oc" style="${cwStyle};font-size:${cFont}px;color:${has ? (unrep ? '#4B5360' : '#1C1F22') : '#9A9489'};background:${st.cls === 'warn' ? '#FFF3D6' : unrep ? '#EDEBE4' : 'transparent'}">${has ? (isCuon(p.id) ? fmtDec(v / p.bo_size) : v) : '·'}</div>`;
    }).join('')}</div>`);
  });
  const hdrs = shown.map((x) => `<button class="khh" aria-label="Phóng to ${esc(x.name)}" data-a="zoom" data-k="${esc(x.id)}" style="${cwStyle};font-size:${zk ? 15 : 14}px">${zk ? esc(x.name) + ' (chạm để thu nhỏ)' : esc(x.id)}</button>`).join('');
  const tots = shown.map((x) => `<div class="oc" style="${cwStyle};font-size:${zk ? 16 : 12}px;font-weight:700;height:40px;white-space:nowrap">${fmtT(colTotKg[x.id])}</div>`).join('');

  const rep0 = b.rm[k];
  const already = rep0 && rep0.user_id !== S.me.id ? rep0 : null;
  const keepable = pend.filter((p) => !keepBlock(k, p.id));
  const empty = list.length === 0; // khu chưa có phi nào: không phải "đã xong", mà là chưa bắt đầu
  const keepTxt = empty ? 'Khu chưa có phi nào'
    : pend.length === 0 ? 'Đã xử lý hết phi của khu'
    : !keepable.length ? `${pend.length} phi còn lại phải đếm thực tế`
    : S.confirmKeep ? `Bấm lần nữa để giữ nguyên ${keepable.length} phi` : `Giữ nguyên ${keepable.length} phi còn lại`;
  const canSend = pend.length === 0 && list.length > 0;
  const absent = b.phiAct.filter((p) => !isPresent(k, p.id)).map((p) => p.id);

  let sheet = '';
  if (S.sel) {
    const p = S.sel, ref = refOf(k, p), mv = movedOf(k, p), ex = expOf(k, p);
    const streakOk = !keepBlock(k, p);
    const selPhi = b.phiBy[p];
    const refTxt = 'Hôm qua: ' + (ref === undefined ? 'chưa có' : qMain(ref, selPhi)) + (mv ? ` · ${mv > 0 ? 'nhập/chuyển vào +' + qMain(mv, selPhi) : 'chuyển đi −' + qMain(Math.abs(mv), selPhi)} · <b>dự kiến ${qMain(ex, selPhi)}</b>` : '');
    const cu = isCuon(p);
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Xóa', '0', S.field === 'bo' ? (cu ? 'Dở ›' : 'Lẻ ›') : (cu ? '‹ Cuộn' : '‹ Bó')];
    sheet = `<div class="pad-sheet">
      <div class="row" style="justify-content:space-between;gap:8px"><div class="col"><b style="font-size:16px">${esc(kname)} · ${p}${hasIn ? '  = ' + fmtCount(curV(p), b.phiBy[p]) + ' · ' + fmtT(curV(p) * b.phiBy[p].kg_per_cay) + ' tấn' : ''}</b><span class="sm muted">${refTxt} · ${unitHint(selPhi)}${cu ? ' · cuộn dở gõ %: 50 = nửa cuộn' : ''}</span></div><button class="btn s" style="min-height:44px" data-a="closesel">Đóng</button></div>
      <div class="row gap6"><button class="boxn ${S.field === 'bo' ? 'on' : ''}" data-a="fld" data-v="bo"><span>${cu ? 'Cuộn nguyên' : 'Số bó'}</span><b>${S.bo || '0'}</b></button><span class="sm b" style="white-space:nowrap">${cu ? '+' : '× ' + size(p) + ' +'}</span><button class="boxn ${S.field === 'le' ? 'on' : ''}" data-a="fld" data-v="le"><span>${cu ? 'Cuộn dở (%)' : 'Cây lẻ'}</span><b>${S.le || '0'}</b></button></div>
      <div class="keys">${keys.map((d, i) => `<button class="key ${d.length > 1 ? 'fn' : ''}" data-a="key" data-d="${i}">${d}</button>`).join('')}</div>
      <div class="acts"><button class="btn ${streakOk ? '' : 'dis'}" data-a="keep">Giữ nguyên</button><button class="btn bad" data-a="zero">Hết (0)</button><button class="btn pri" data-a="next">TIẾP</button></div>
    </div>`;
  }
  const pendingNote = readPending().length;

  return `<div class="top" style="padding-bottom:2px"><button class="iconbtn" aria-label="Về tổng quan" data-a="nav" data-s="home">${IC.back}</button><div class="t"><h1>Đếm ${esc(kname)}</h1><small>Bảng toàn bãi, nhập ngay trong bảng</small></div><button class="btn s" data-a="nav" data-s="khu">Đổi khu</button></div>
    <div class="mxhead"><div style="min-width:0"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(kname)} (bạn)</span><b>${fmtT(T.ownKg)} tấn</b></div><div style="text-align:center;flex:none"><span>Phi chưa nhập</span><b>${pend.length}</b></div><div style="text-align:right;flex:none"><span>Tổng bãi (tạm tính)</span><b>${fmtT(T.allKg)} tấn</b></div></div>
    ${S.toast ? `<div class="toast ${S.toastErr ? 'err' : ''}" data-toast="1" role="${S.toastErr ? 'alert' : 'status'}" aria-live="${S.toastErr ? 'assertive' : 'polite'}">${esc(S.toast)}</div>` : ''}
    ${b.closed ? '<div class="toast err">Ngày hôm nay đã chốt, không sửa được nữa.</div>' : ''}
    ${S.sel ? '' : `<div class="col gap6" style="padding:6px 12px 2px">${already ? `<div class="card sm" style="line-height:1.4"><b>${esc(already.uname)} đã báo ${esc(kname)} lúc ${hhmm(already.ts)}.</b> Bạn đang đếm lại: chỉ gửi khi vừa đếm thực tế, số khác với người trước sẽ chuyển admin xem.</div>` : ''}<button class="btn s full ${pend.length === 0 || !keepable.length ? 'dis' : ''}" data-a="keepall">${keepTxt}</button>
      ${S.draftWarn ? `<div class="card warn col gap6"><b>${esc(S.draftWarn.uname)} đã gửi báo cáo khu này lúc ${hhmm(S.draftWarn.ts)}, sau khi bạn bắt đầu nháp.</b><div class="row gap6"><button class="btn s f1" data-a="draftnew">Dùng số mới</button><button class="btn s f1" data-a="draftkeep">Giữ nháp của tôi</button></div></div>` : ''}
      <button class="sm" style="border:0;background:transparent;color:var(--pri);text-align:left;padding:4px 0;text-decoration:underline" data-a="legend">${S.legend ? 'Ẩn chú thích' : 'ⓘ Chú thích màu'}</button>
      ${S.legend ? '<div class="sm muted" style="line-height:1.4">Xanh lá: đã đếm · Dấu =: giữ nguyên · Nét đứt vàng: chưa nhập (số mờ là số dự kiến) · Vàng đậm: lệch lớn so với dự kiến · Chấm: không có (chạm để thêm phi). Chạm chữ cái khu để phóng to.</div>' : ''}
      ${absent.length ? `<div class="sm b">Không có: ${absent.join(', ')} (${absent.length} phi) — chạm ô dấu · để thêm vào khu</div>` : ''}</div>`}
    <div class="f1" id="mx"><div class="mxw">
      <div class="mxl"><div class="mxh"><div style="width:40px;padding-left:4px;font-size:13px;font-weight:700">Phi</div><div style="width:72px;text-align:center;font-size:13px;font-weight:700;color:var(--pri)">Bạn đếm</div><div style="width:52px;text-align:right;padding-right:6px;font-size:13px;font-weight:700">Tổng bãi</div></div>${lrows.join('')}<div class="mxtot"><div style="width:40px;padding-left:4px;font-size:12px;font-weight:700;line-height:1.1">Tổng<br>(tấn)</div><div style="width:72px;text-align:center;font-weight:700;color:var(--pri);white-space:nowrap">${fmtT(T.ownKg)}</div><div style="width:52px;text-align:right;padding-right:6px;font-weight:700;white-space:nowrap">${fmtT(T.allKg)}</div></div></div>
      <div class="mxr"><div class="mxh">${hdrs}</div>${rrows.join('')}<div class="mxtot">${tots}</div></div>
    </div></div>
    ${S.sel ? sheet : `<div class="sendbar">${pendingNote ? '<div class="sm b" style="color:var(--bad);margin-bottom:6px">Có báo cáo chưa gửi được, xem ở Tổng quan.</div>' : ''}<button class="btn full ${canSend && !b.closed ? 'pri' : 'dis'}" data-a="send">${canSend ? 'GỬI BÁO CÁO ' + esc(cut(kname, 20).toUpperCase()) : empty ? 'CHẠM Ô · ĐỂ THÊM PHI VÀO KHU' : 'Còn ' + pend.length + ' phi chưa nhập'}</button></div>`}`;
}

/* --- Nhập kho / chuyển khu --- */
const unitHint = (p) => (isCuon(p) ? `1 cuộn ≈ ${fmtInt(p.bo_size * p.kg_per_cay)} kg` : `1 bó = ${fmtInt(p.bo_size)} cây ≈ ${fmtT(p.bo_size * p.kg_per_cay)} tấn`);
const nkgText = (qty, p) => `= ${fmtInt(qty * p.kg_per_cay)} kg (${fmtT(qty * p.kg_per_cay)} tấn) · ${unitHint(p)}`;
const kName = (id) => (S.boot.khuBy[id] ? S.boot.khuBy[id].name : id);
// Gom các dòng cùng phiếu (grp) để hiện và hoàn tác cả phiếu
function receiptGroups(list) {
  const by = {}, order = [];
  list.forEach((r) => { const g = r.grp || 'id' + r.id; if (!by[g]) { by[g] = []; order.push(g); } by[g].push(r); });
  return order.map((g) => {
    const rows = by[g], r0 = rows[0];
    const chuyen = r0.kind === 'chuyen';
    const pos = rows.filter((r) => r.qty > 0);
    const from = chuyen ? (rows.find((r) => r.qty < 0) || {}).khu_id : null;
    const kg = pos.reduce((a, r) => a + r.qty * (S.boot.phiBy[r.phi_id] ? S.boot.phiBy[r.phi_id].kg_per_cay : 0), 0);
    const what = pos.map((r) => { const rp = S.boot.phiBy[r.phi_id]; return `${r.phi_id} ${fmtQs(r.qty, rp)}`; }).join(' · ');
    const title = chuyen ? `Chuyển ${esc(kName(from))} → ${esc(kName(pos[0] ? pos[0].khu_id : ''))}` : `Nhập vào ${esc(kName(r0.khu_id))}`;
    return { id: Math.min(...rows.map((r) => r.id)), r0, chuyen, title, what, kg, voided: !!r0.voided };
  });
}
function vNhap() {
  const b = S.boot, N = S.nhap;
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
  const khuChips = (sel, f, skip) => `<div class="wrap">${b.khuAct.filter((k) => k.id !== skip).map((k) => `<button class="chip s ${k.id === sel ? 'on' : ''}" data-a="nkhu" data-f="${f}" data-v="${esc(k.id)}">${esc(k.name)}</button>`).join('')}</div>`;
  const lineKg = N.lines.reduce((a, l) => a + l.qty * b.phiBy[l.phi].kg_per_cay, 0);
  const lines = N.lines.length ? `<div class="card" style="padding:0;overflow:hidden">${N.lines.map((l, i) => { const lp = b.phiBy[l.phi]; return `<div class="li"><span><b>${l.phi}</b> · ${fmtQ(l.qty, lp)}</span><button class="btn s bad" data-a="nrm" data-i="${i}">Xóa</button></div>`; }).join('')}<div class="li" style="background:#E8EEF6"><b>${N.lines.length} dòng</b><b>${fmtT(lineKg)} tấn</b></div></div>` : '';
  const groups = receiptGroups(b.receipts);
  const recs = groups.map((g) => {
    const can = isAdmin() || (g.r0.user_id === S.me.id && Date.now() - g.r0.ts < 10 * 60e3);
    return `<div class="li"><span><b>${g.title}</b><br>${esc(g.what)} · ${fmtT(g.kg)} tấn<br><span class="sm muted">${esc(g.r0.uname)} · ${hhmm(g.r0.ts)}${g.r0.note ? ' · ' + esc(g.r0.note) : ''}</span></span>${can ? `<button class="btn s bad" data-a="void" data-id="${g.id}">Huỷ</button>` : '<span class="sm muted" style="text-align:right;max-width:92px">quá 10 phút, nhờ admin huỷ</span>'}</div>`;
  }).join('');
  const saveLbl = chuyen ? 'XÁC NHẬN CHUYỂN KHU' : 'XÁC NHẬN NHẬP KHO';
  return `${head(chuyen ? 'Chuyển khu' : 'Nhập kho', chuyen ? 'Dời thép giữa các khu, tổng bãi không đổi' : 'Ghi phiếu thép mới về', 'home')}
  <div class="f1 scroll pad col gap12" id="body">
    <div class="row gap6"><button class="chip s f1 ${chuyen ? '' : 'on'}" data-a="nmode" data-v="nhap">Nhập thép về</button><button class="chip s f1 ${chuyen ? 'on' : ''}" data-a="nmode" data-v="chuyen">Chuyển khu</button></div>
    ${N.done ? `<div class="card ok col gap8"><b style="font-size:18px">Đã lưu phiếu</b><span style="font-size:17px">${esc(N.done.text)}</span><button class="btn s full" data-a="void" data-id="${N.done.id}">HOÀN TÁC CẢ PHIẾU</button></div>` : ''}
    ${chuyen
      ? `<div class="col gap8"><b style="font-size:18px">1. Từ khu</b>${khuChips(N.from, 'from')}</div><div class="col gap8"><b style="font-size:18px">2. Sang khu</b>${khuChips(N.to, 'to', N.from)}</div>`
      : `<div class="col gap8"><b style="font-size:18px">1. Để vào khu</b>${khuChips(N.khu, 'khu')}</div>`}
    <div class="col gap8"><b style="font-size:18px">${chuyen ? 3 : 2}. Chọn phi</b><div class="grid4">${b.phiAct.map((x) => `<button class="chip ${x.id === N.phi ? 'on' : ''}" data-a="nphi" data-v="${x.id}">${x.id}</button>`).join('')}</div></div>
    <div class="col gap8"><b style="font-size:18px">${chuyen ? 4 : 3}. Số ${isCuon(p) ? 'cuộn' : 'cây'} ${N.phi}</b>
      <div class="row gap6"><button class="btn s" data-a="nq" data-v="-10">−10</button><button class="btn s" data-a="nq" data-v="-1">−1</button><input class="f1" id="nqty" type="text" inputmode="numeric" pattern="[0-9]*" aria-label="Số ${unitLbl(p)} ${N.phi}" placeholder="0" value="${N.qty || ''}" style="min-width:0;width:100%;height:60px;border-radius:14px;border:2px solid #8C8678;background:#fff;text-align:center;font-size:32px;font-weight:700"><button class="btn s pri" data-a="nq" data-v="1">+1</button><button class="btn s pri" data-a="nq" data-v="10">+10</button></div>
      <span class="muted" id="nkg">${nkgText(N.qty * uStep, p)}</span>
      <div class="row gap6">${isCuon(p) ? '' : `<button class="btn s f1" data-a="nq" data-v="bo">+1 bó (${p.bo_size})</button>`}<button class="btn s f1" data-a="nadd">+ Thêm phi khác</button></div></div>
    ${lines}
    <input class="inp s" id="nnote" maxlength="200" placeholder="Ghi chú: số phiếu, biển số xe…" data-model="nnote" value="${esc(S.form.nnote || '')}">
    <button class="btn pri full" style="min-height:60px;font-size:20px" data-a="nconfirm">${saveLbl}</button>
    ${recs ? `<h2 class="sec">Phiếu hôm nay</h2><div class="card" style="padding:0;overflow:hidden">${recs}</div>` : ''}
  </div>`;
}

/* --- Tồn bãi --- */
// số ngày còn đủ dùng = tồn / lượng dùng trung bình mỗi ngày (28 ngày gần nhất, tính khi chốt ngày)
const MIN_RATE_DAYS = 5; // khớp MIN_RATE_DAYS trong src/worker.js
// Dưới 5 ngày dữ liệu thì mức dùng trung bình chưa đáng tin: thà không dự báo còn hơn dự báo sai
function daysLeft(phi, v) {
  const r = S.boot.rate[phi];
  return r > 0 && (S.boot.rateDays[phi] || 0) >= MIN_RATE_DAYS ? v / r : null;
}
const rateReady = (phi) => (S.boot.rateDays[phi] || 0) >= MIN_RATE_DAYS;
const daysTxt = (d) => (d < 1 ? 'dưới 1 ngày' : '~' + Math.floor(d) + ' ngày');
function vTon() {
  const b = S.boot, T = totals();
  const rows = b.phiAct.map((p) => {
    const v = T.perPhi[p.id], low = v < p.min_stock, open = S.expand[p.id];
    const dl = daysLeft(p.id, v), short = dl !== null && dl < 3;
    const rateDisp = !b.rate[p.id] ? null
      : !rateReady(p.id) ? `chưa đủ dữ liệu (${b.rateDays[p.id] || 0}/${MIN_RATE_DAYS} ngày)`
      : isCuon(p) ? `${Math.round(b.rate[p.id] / p.bo_size * 10) / 10} cuộn/ngày` : `${fmtInt(b.rate[p.id])} cây/ngày`;
    const det = open ? `<div class="card" style="margin:-4px 0 4px;border-radius:0 0 16px 16px">${b.khu.map((k) => { const x = valOf(k.id, p.id); return x ? `<div class="li"><span>${esc(k.name)}${k.active ? '' : ' (ẩn)'}</span><span class="col" style="align-items:flex-end"><b>${qMain(x, p)}</b><span class="sm muted">${qSub(x, p)}</span></span></div>` : ''; }).join('') || '<div class="muted">Không có ở khu nào</div>'}${rateDisp ? `<div class="li"><span class="sm muted">Dùng trung bình</span><span class="sm">${rateDisp}</span></div>` : ''}</div>` : '';
    const sub = low ? 'Dưới mức báo động (' + minStockLbl(p) + ')' + (dl !== null ? ' · còn ' + daysTxt(dl) : '') : dl !== null ? 'Còn đủ dùng ' + daysTxt(dl) : b.rate[p.id] === undefined ? 'Chưa có số liệu dùng' : 'Đủ dùng';
    return `<button class="tonrow ${low ? 'low' : ''}" data-a="expand" data-p="${p.id}"><span class="col" style="gap:2px"><b style="font-size:24px">${p.id}</b><span class="sm" style="${low ? 'color:var(--bad);font-weight:700' : short ? 'color:var(--warn);font-weight:700' : 'color:#5F6670'}">${sub}</span></span><span class="col" style="align-items:flex-end;text-align:right;min-width:0"><b style="font-size:24px;line-height:1.15;white-space:nowrap">${qMain(v, p)}</b><span class="sm muted">${qSub(v, p)}</span></span></button>${det}`;
  }).join('');
  return `${head('Tồn bãi', b.lastClosed ? 'Tồn chuẩn chốt ngày ' + fmtDay(b.lastClosed) + ' · chạm phi để xem từng khu' : 'Chưa có ngày nào được chốt', 'home')}
    <div class="hero" style="margin:4px 16px;border-radius:14px;padding:14px 16px"><div class="row" style="justify-content:space-between;gap:10px;flex-wrap:wrap"><div class="col"><span style="font-size:15px">Tổng toàn bãi</span><span style="font-size:30px;font-weight:700">${fmtT(T.kg)} tấn</span></div><span style="font-size:17px;white-space:nowrap">${fmtInt(T.cay)} cây nguyên</span></div></div>
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
  const hdrs = subData.map((s, i) => {
    const cur = i === subData.length - 1;
    return `<th style="text-align:center;${cur ? 'color:var(--pri)' : ''};white-space:nowrap;font-size:13px">${esc(s.uname)}<br><span style="font-weight:400">${hhmm(s.ts)}${cur ? ' ✓' : ''}</span></th>`;
  }).join('');
  const bodyRows = phiList.map((p) => {
    const lastV = lastSub.vals[p.id]; // undefined nếu lần cuối là admin-pick chỉ ghi phi thay đổi
    // hasDiff: so với lastV nếu lastV có giá trị; nếu không, so giữa các lần báo trước với nhau
    const hasDiff = lastV !== undefined
      ? subData.some((s, i) => i < subData.length - 1 && s.vals[p.id] !== undefined && s.vals[p.id] !== lastV)
      : (() => { const vs = new Set(subData.slice(0, -1).map((s) => s.vals[p.id]).filter((v) => v !== undefined)); return vs.size > 1; })();
    const cells = subData.map((s, i) => {
      const v = s.vals[p.id];
      const diff = lastV !== undefined && i < subData.length - 1 && v !== undefined && v !== lastV;
      return `<td style="text-align:center${diff ? ';color:var(--warn);font-weight:700' : ''}">${v !== undefined ? fmtQs(v, p) : '—'}</td>`;
    }).join('');
    return `<tr${hasDiff ? ' style="background:rgba(255,160,0,0.12)"' : ''}><td><b>${p.id}</b></td>${cells}</tr>`;
  }).join('');
  const footRow = canPick ? `<tr><td></td>${subData.map((s, i) => {
    const cur = i === subData.length - 1;
    return `<td style="text-align:center;padding:6px 4px">${cur ? '<span class="sm muted">đang dùng</span>' : `<button class="btn s" data-a="spick" data-k="${esc(khu)}" data-i="${i}">Dùng</button>`}</td>`;
  }).join('')}</tr>` : '';
  return `<div style="overflow-x:auto;margin-top:6px"><table class="tbl"><thead><tr><th>Phi</th>${hdrs}</tr></thead><tbody>${bodyRows}</tbody>${footRow ? '<tfoot>' + footRow + '</tfoot>' : ''}</table></div>`;
}

/* --- Duyệt (admin) --- */
// Nạp lại màn Duyệt, nuốt lỗi mạng để không che mất lỗi gốc khi gọi trong finally.
const reloadReview = async () => { try { S.review = await api('GET', '/review'); } catch (e) { /* giữ lỗi gốc */ } };

// Dấu số liệu của từng khu đang có cảnh báo, lấy đúng cái màn hình đang hiện.
// Gửi kèm khi duyệt để server biết admin đã nhìn con số nào.
const ackSigs = () => {
  const R = S.review, m = {};
  if (R) R.exceptions.forEach((e) => { if ((e.type === 'khu_up' || e.type === 'khu_down') && !e.ack) m[e.khu] = e.sig; });
  return m;
};

function vDuyet() {
  const b = S.boot, R = S.review;
  if (!R) return `${head('Duyệt số liệu', '', 'home')}${panelWait('duyet')}`;
  const badRows = R.rows.filter((r) => r.neg || r.high), normal = R.rows.filter((r) => !(r.neg || r.high));
  const kname = (id) => (b.khuBy[id] ? b.khuBy[id].name : id);
  const recountA = R.closed ? 'recountclose' : 'recount';
  const btnKhu = new Set(); // khu đã có nút "đếm lại" ở phần trên, không bày lại lần nữa ở dưới
  R.exceptions.forEach((e) => { if (e.khu && (e.type === 'conflict' || e.type === 'late')) btnKhu.add(e.khu); });
  badRows.forEach((r) => { if (r.topKhu && R.reports.some((x) => x.khu_id === r.topKhu)) btnKhu.add(r.topKhu); });
  // khu_up/khu_down hiện ngay trong thẻ của khu ở phần dưới, không bày lại ở đây cho đỡ trùng
  const items = R.exceptions.filter((e) => e.type !== 'phi' && e.type !== 'khu_up' && e.type !== 'khu_down').map((e) => {
    if (e.type === 'khu_missing') return `<div class="card warn col gap8"><b style="font-size:18px">${esc(e.name)} chưa báo</b><span class="sm">Chưa có ai báo hôm nay. Hãy nhắc người phụ trách, hoặc tự đếm khu này ở tab Đếm.</span></div>`;
    if (e.type === 'conflict') {
      const r = R.reports.find((x) => x.khu_id === e.khu);
      const C = S.cmp && S.cmp.khu === e.khu ? S.cmp : null;
      let cmp = '';
      if (C && !C.data) cmp = '<span class="sm">Đang tải...</span>';
      else if (C && C.data && C.data.diffs.length) {
        const A = C.data.a, B = C.data.b;
        cmp = `<div class="card" style="padding:0;overflow:hidden;color:var(--ink)"><div class="li sm b"><span style="width:44px">Phi</span><span class="f1" style="text-align:center">${esc(A.uname)} ${hhmm(A.ts)}</span><span class="f1" style="text-align:center">${esc(B.uname)} ${hhmm(B.ts)}</span></div>${C.data.diffs.map((x) => {
          const pickB = C.pick[x.phi] !== 'a';
          return `<div class="li"><b style="width:44px">${x.phi}</b><button class="chip s f1 ${pickB ? '' : 'on'}" data-a="cpick" data-p="${x.phi}" data-v="a">${x.a == null ? '—' : x.a}</button><button class="chip s f1 ${pickB ? 'on' : ''}" data-a="cpick" data-p="${x.phi}" data-v="b">${x.b == null ? '—' : x.b}</button></div>`;
        }).join('')}</div><span class="sm">Chạm số đúng cho từng phi (đang chọn: ô đậm), rồi lưu.</span>
        <div class="row gap8"><button class="btn s warnb f1" data-a="cresolve" data-k="${esc(e.khu)}">LƯU LỰA CHỌN</button><button class="btn s warnb f1" data-a="${recountA}" data-k="${esc(e.khu)}">ĐẾM LẠI</button></div>`;
      } else if (C && C.data) cmp = '<span class="sm">Không tìm thấy khác biệt trong lịch sử, có thể giữ số báo sau.</span>';
      return `<div class="card warn col gap8"><b style="font-size:18px">${esc(e.name)}: 2 người báo số khác nhau</b><span class="sm">Số đang dùng là của ${esc(r ? r.uname : '')} (báo sau). Dùng "Xem lần báo" bên dưới để xem chi tiết từng người.</span>
        ${cmp || `<div class="row gap8"><button class="btn s warnb f1" data-a="cview" data-k="${esc(e.khu)}">SO SÁNH 2 SỐ</button><button class="btn s warnb f1" data-a="resolve" data-k="${esc(e.khu)}">DÙNG SỐ BÁO SAU</button></div><button class="btn s warnb full" data-a="${recountA}" data-k="${esc(e.khu)}">YÊU CẦU ĐẾM LẠI</button>`}
        ${C && C.data && !C.data.diffs.length ? `<button class="btn s warnb full" data-a="resolve" data-k="${esc(e.khu)}">DÙNG SỐ BÁO SAU</button>` : ''}</div>`;
    }
    if (e.type === 'late') return `<div class="card warn col gap8"><b style="font-size:18px">${esc(e.name)}: có thép nhập/chuyển sau khi khu báo (${hhmm(e.reportTs)})</b><span class="sm">${e.items.map((x) => { const xp = S.boot.phiBy[x.phi]; return esc(x.phi) + ' ' + (x.q > 0 ? '+' : '−') + fmtQs(Math.abs(x.q), xp); }).join(' · ')}. Số đếm của khu chưa gồm lượng này nên tính "đã dùng" sẽ sai.</span><button class="btn s warnb full" data-a="${recountA}" data-k="${esc(e.khu)}">YÊU CẦU ${esc(cut(e.name, 18).toUpperCase())} ĐẾM LẠI</button></div>`;
    if (e.type === 'recount') return `<div class="card warn col gap8"><b style="font-size:18px">${esc(e.name)} đang chờ đếm lại</b><span class="sm">Đã yêu cầu, chưa có số mới.</span></div>`;
    return '';
  }).join('');
  const cards = badRows.map((r) => {
    const canRe = r.topKhu && R.reports.some((x) => x.khu_id === r.topKhu);
    const rp = S.boot.phiBy[r.phi];
    const fmtEq = (v) => v === null ? '—' : fmtQe(v, rp);
    const perDayTxt = (x) => (isCuon(rp) ? (x / rp.bo_size).toFixed(1) + ' cuộn/ngày' : fmtInt(x) + ' cây/ngày');
    const avgDisp = r.avg === null ? '' : perDayTxt(r.avg);
    const peakDisp = r.peak ? perDayTxt(r.peak) : '';
    const topNetDisp = (r.topNet >= 0 ? '+' : '−') + fmtQs(Math.abs(r.topNet), rp);
    return `<div class="card bad col gap8"><div class="row" style="justify-content:space-between"><b style="font-size:24px">${r.phi}</b><span class="badge bad">Bất thường</span></div>
      <div class="eq"><div><span>Tồn cũ</span><b>${fmtEq(r.old)}</b></div><div><span>+ Nhập</span><b>${fmtEq(r.inn)}</b></div><div><span>− Đếm mới</span><b>${fmtEq(r.cnt)}</b></div><div><span>= Đã dùng</span><b style="color:var(--bad)">${fmtEq(r.used)}</b></div></div>
      <b style="font-size:16px">${r.neg
        ? 'Đã dùng âm (tồn nhiều hơn tính toán): có thể nhập sót phiếu hoặc đếm sai.'
        : `Dùng cao bất thường: hơn 3 lần mức trung bình${avgDisp ? ' (' + avgDisp + ')' : ''}${peakDisp ? ' và hơn 1,5 lần ngày dùng nhiều nhất (' + peakDisp + ')' : ''}.`}</b>
      ${r.topKhu ? `<span class="sm">Khu biến động lớn nhất: <b>${esc(kname(r.topKhu))}</b> (${topNetDisp})</span>` : ''}
      ${canRe ? `<button class="btn s bad full" data-a="${recountA}" data-k="${esc(r.topKhu)}">YÊU CẦU ${esc(cut(kname(r.topKhu), 18).toUpperCase())} ĐẾM LẠI</button>` : ''}</div>`;
  }).join('');
  // pending: việc còn chặn chốt; cảnh báo khu admin đã duyệt vẫn hiện nhưng không tính
  const pend = R.pending != null ? R.pending : R.exceptions.length;
  const allOk = pend === 0;
  const verdict = allOk
    ? (R.exceptions.length
      ? `<div class="card ok col" style="gap:4px"><b style="font-size:19px">Cảnh báo khu đã được duyệt, có thể chốt</b><span style="font-size:16px;line-height:1.4">Không còn việc nào chặn chốt. Khu đã duyệt mà báo lại số khác sẽ phải duyệt lại.</span></div>`
      : `<div class="card ok col" style="gap:4px"><b style="font-size:19px">Ngày bình thường, đề xuất chốt</b><span style="font-size:16px;line-height:1.4">Đủ khu đã báo, không phi nào dùng âm hay bất thường. Bạn chỉ cần xác nhận một lần.</span></div>`)
    : `<div class="card warn col" style="gap:4px"><b style="font-size:19px">Có ${pend} việc cần xem trước khi chốt</b><span class="sm" style="line-height:1.4">Khu lệch số: duyệt từng khu hoặc "Duyệt tất cả" ở phần Báo cáo theo khu. Việc khác: xử lý, hoặc ghi chú lý do rồi chốt.</span></div>`;
  const gap = R.span > 1 && !R.closed ? `<div class="card warn col" style="gap:4px"><b>Có ${R.span - 1} ngày chưa chốt</b><span class="sm" style="line-height:1.4">Lượng dùng dưới đây gộp ${R.span} ngày kể từ ngày chốt ${esc(fmtDay(R.last))}. Cảnh báo "dùng nhiều" đã chia theo số ngày.</span></div>` : '';
  const first = !R.last ? `<div class="card col" style="gap:4px"><b>Ngày đầu tiên</b><span class="sm muted">Chưa có tồn chuẩn cũ. Chốt ngày này để số đếm hôm nay trở thành tồn chuẩn đầu tiên.</span></div>` : '';
  // cảnh báo soi riêng từng khu, gom theo khu để gắn vào đúng thẻ
  const kUp = {}, kDown = {}, kAck = {};
  R.exceptions.forEach((e) => {
    if (e.type === 'khu_up') kUp[e.khu] = e.items; else if (e.type === 'khu_down') kDown[e.khu] = e.items; else return;
    if (e.ack) kAck[e.khu] = e.ack;
  });
  const nKhuWarn = (R.khu || []).filter((k) => k.active && (kUp[k.id] || kDown[k.id]) && !kAck[k.id]).length;
  const nKhuAck = Object.keys(kAck).length;
  const khuHead = nKhuWarn
    ? `<span class="sm b" style="color:var(--bad)">${nKhuWarn} khu cần duyệt</span>`
    : nKhuAck ? `<span class="sm b" style="color:var(--ok)">${nKhuAck} khu đã duyệt</span>` : '<span class="sm muted">không khu nào lệch bất thường</span>';
  const ackAll = nKhuWarn > 1 && !R.closed ? `<button class="btn s ok full" data-a="khuackall">DUYỆT TẤT CẢ ${nKhuWarn} KHU LỆCH</button>` : '';
  const khuSec = `<div class="col gap8"><div class="row" style="justify-content:space-between;align-items:baseline"><span style="font-size:13px;font-weight:700;color:#5F6670;text-transform:uppercase;letter-spacing:.04em">Báo cáo theo khu</span>${khuHead}</div>${ackAll}${(R.khu || []).filter((k) => k.active).map((k) => {
    const rep = R.reports.find((r) => r.khu_id === k.id);
    const subOpen = S.subs[k.id] !== undefined;
    const up = kUp[k.id] || [], down = kDown[k.id] || [], ack = kAck[k.id], seen = !!ack;
    const nWarn = up.length + down.length;
    const edge = !nWarn || seen ? '' : up.length ? 'border:2px solid var(--bad)' : 'border:2px solid var(--warn)';
    const badge = !rep ? '' : nWarn && !seen
      ? `<span class="badge ${up.length ? 'bad' : 'warn'}">${nWarn} phi lệch</span>`
      : `<span class="badge ok">${seen && nWarn ? 'đã duyệt' : 'khớp dự kiến'}</span>`;
    const line = (x, isUp) => {
      const p = b.phiBy[x.phi];
      const why = x.mv === 0 ? 'không có thép nhập' : x.mv > 0 ? 'đã tính nhập ' + fmtQe(x.mv, p) : 'đã tính chuyển đi ' + fmtQe(-x.mv, p);
      return `<div class="li" style="gap:6px"><b style="width:46px">${x.phi}</b><span class="sm" style="flex:1">${fmtQe(x.ref, p)} → <b>${fmtQe(x.cnt, p)}</b> · ${why}</span><b class="sm" style="color:var(--${isUp ? 'bad' : 'warn'});white-space:nowrap">${x.d > 0 ? '+' : '−'}${fmtQe(Math.abs(x.d), p)}</b></div>`;
    };
    const ackLine = !nWarn || !seen ? '' : `<div class="row gap6" style="border-top:1px solid var(--line);padding-top:6px;justify-content:space-between"><span class="sm">Đã duyệt ${nWarn} phi lệch · ${esc(ack.by || '')} · ${hhmm(ack.ts)}</span>${R.closed ? '' : `<button class="btn s" data-a="khuunack" data-k="${esc(k.id)}">Bỏ duyệt</button>`}</div>`;
    const warnBox = !nWarn || seen ? ackLine : `<div class="col" style="border-top:1px solid var(--line);padding-top:6px">
      ${up.length ? `<b class="sm" style="color:var(--bad)">Đếm nhiều hơn mức giải thích được — thép không tự sinh ra:</b><div class="card" style="padding:0;overflow:hidden;margin:4px 0">${up.map((x) => line(x, true)).join('')}</div>` : ''}
      ${down.length ? `<b class="sm" style="color:var(--warn)">Hụt nhiều hơn bình thường — kiểm tra có xuất dùng thật không:</b><div class="card" style="padding:0;overflow:hidden;margin:4px 0">${down.map((x) => line(x, false)).join('')}</div>` : ''}
      ${R.closed ? '' : `<div class="row gap6"><button class="btn s ok f1" data-a="khuack" data-k="${esc(k.id)}">Duyệt khu này</button><button class="btn s bad f1" data-a="${recountA}" data-k="${esc(k.id)}">Yêu cầu đếm lại</button></div>`}</div>`;
    return `<div class="card col gap6" style="${edge}"><div class="row" style="justify-content:space-between;gap:8px;flex-wrap:wrap">
      <div class="col" style="gap:2px"><div class="row gap6" style="align-items:center"><b style="font-size:16px">${esc(k.name)}</b>${badge}</div><span class="sm muted">${rep ? esc(rep.uname) + ' · ' + hhmm(rep.ts) + (rep.recount ? ' · <b style="color:var(--warn)">chờ đếm lại</b>' : '') : 'Chưa có ai báo'}</span></div>
      ${rep ? `<div class="row gap6"><button class="btn s" data-a="svload" data-k="${esc(k.id)}">${subOpen ? 'Ẩn' : 'Xem lần báo'}</button>${btnKhu.has(k.id) || (nWarn && !seen) ? '' : `<button class="btn s bad" data-a="${recountA}" data-k="${esc(k.id)}">Đếm lại</button>`}</div>` : ''}
    </div>${warnBox}${renderSubsPanel(k.id, R)}</div>`;
  }).join('')}</div>`;
  const normalHtml = S.showNormal ? `<div class="card" style="padding:0;overflow:hidden">${normal.map((r) => { const np = S.boot.phiBy[r.phi]; const fE = (v) => fmtQe(v, np); return `<div class="li"><b>${r.phi}</b><span class="sm">${R.last ? fE(r.old) + ' + ' + fE(r.inn) + ' − ' + fE(r.cnt) + ' = ' + fE(r.used) : 'đếm ' + fE(r.cnt)}</span></div>`; }).join('')}</div>` : '';
  return `${head('Duyệt ngày ' + b.today.split('-').reverse().slice(0, 2).join('/'), 'Chỉ hiện những gì cần xem', 'home')}
  <div class="f1 scroll pad col gap12" id="body">
    ${R.closed ? '<div class="card ok"><b>Đã chốt ngày hôm nay.</b> Số đếm hôm nay là tồn chuẩn mới, ngày này đã khóa.</div>' : verdict}
    ${R.closed ? `<div class="card col gap6"><b>Chốt nhầm?</b><input class="inp s" id="reopenNote" placeholder="Lý do mở lại (bắt buộc)" data-model="reopenNote" value="${esc(S.form.reopenNote || '')}"><button class="btn s bad full" data-a="reopen">MỞ LẠI NGÀY HÔM NAY</button></div>` : ''}
    ${gap}${first}${items}${cards}
    ${khuSec}
    <button class="card b" style="text-align:left;min-height:52px;font-size:16px;border:2px solid #B9B4A8" data-a="toggle-normal">${normal.length} phi bình thường · ${S.showNormal ? 'bấm để ẩn' : 'bấm để xem'}</button>${normalHtml}
    <label class="col gap6" style="font-weight:600">Ghi chú lý do ${allOk ? '(không bắt buộc)' : '(bắt buộc khi còn việc chưa duyệt)'}<input class="inp s" style="height:52px" id="note" data-model="note" placeholder="Ví dụ: nhập sót phiếu D16" value="${esc(S.form.note || '')}"></label>
  </div>
  <div class="sendbar"><button class="btn ${R.closed ? 'dis' : 'ok'} full" style="min-height:60px;font-size:20px" data-a="close" ${R.closed ? 'disabled' : ''}>${R.closed ? 'ĐÃ CHỐT NGÀY' : allOk ? 'XÁC NHẬN CHỐT NGÀY' : 'DUYỆT & CHỐT NGÀY'}</button></div>`;
}

/* --- Xem lại ngày cũ --- */
const ydayOf = (d) => new Date(Date.parse(d) - 864e5).toISOString().slice(0, 10);
function vLichSu() {
  const b = S.boot, H = S.hist, D = H.data;
  const top = `${head('Xem lại ngày cũ', 'Số liệu tồn, nhập, dùng của một ngày', 'more')}
    <div class="row gap8" style="padding:4px 16px"><input class="inp s f1" type="date" id="hdate" max="${b.today}" value="${H.date}" data-change="hdate"><button class="btn s" data-a="hprev">‹ Trước</button><button class="btn s ${H.date >= b.today ? 'dis' : ''}" data-a="hnext" ${H.date >= b.today ? 'disabled' : ''}>Sau ›</button></div>`;
  if (!D) return `${top}${panelWait('lichsu')}`;
  const key = (r) => r.khu_id + '|' + r.phi_id;
  const cm = {}, bm = {}, pm = {};
  D.counts.forEach((r) => (cm[key(r)] = r.v));
  D.baseline.forEach((r) => (bm[key(r)] = r.v));
  D.prevBaseline.forEach((r) => (pm[key(r)] = r.v));
  const closed = !!D.close;
  const val = (k, p) => { const x = k + '|' + p; return closed ? bm[x] || 0 : cm[x] !== undefined ? cm[x] : pm[x] || 0; };
  const sum = Object.fromEntries(D.summary.map((r) => [r.phi_id, r]));
  let totKg = 0, totIn = 0, totUse = 0;
  const rows = b.phiAct.map((p) => {
    let v = 0;
    b.khu.forEach((k) => (v += val(k.id, p.id)));
    const s = sum[p.id];
    totKg += v * p.kg_per_cay;
    if (s) { totIn += s.nhap * p.kg_per_cay; totUse += (s.dung || 0) * p.kg_per_cay; }
    const open = S.expand['h' + p.id];
    const det = open ? b.khu.map((k) => { const x = val(k.id, p.id); return x ? `<div class="li" style="padding-left:28px"><span class="sm">${esc(k.name)}</span><span class="sm">${fmtQs(x, p)}</span></div>` : ''; }).join('') : '';
    const nDisp = s ? fmtQs(s.nhap, p) : '';
    const dDisp = s ? (s.dung == null ? '—' : fmtQs(s.dung, p)) : '';
    return `<button class="li" style="width:100%;background:#fff;border:0;border-bottom:1px solid var(--line);text-align:left" data-a="expand" data-p="h${p.id}"><b style="width:44px">${p.id}</b><span class="sm" style="flex:1;text-align:right">${fmtQs(v, p)}${s ? ` · nhập ${nDisp} · dùng ${dDisp}` : ''}</span></button>${det}`;
  }).join('');
  const reps = D.reports.map((r) => `${esc(kName(r.khu_id))}: ${esc(r.uname)} ${hhmm(r.ts)}`).join(' · ');
  const groups = receiptGroups(D.receipts.slice().reverse());
  const recs = groups.map((g) => `<div class="li" style="${g.voided ? 'opacity:.55;text-decoration:line-through' : ''}"><span><b>${g.title}</b>${g.voided ? ' (đã hủy)' : ''}<br>${esc(g.what)} · ${fmtT(g.kg)} tấn<br><span class="sm muted">${esc(g.r0.uname)} · ${hhmm(g.r0.ts)}${g.r0.note ? ' · ' + esc(g.r0.note) : ''}</span></span></div>`).join('');
  const status = closed
    ? `<div class="card ok col" style="gap:4px"><b>Đã chốt${D.close.uname ? ' bởi ' + esc(D.close.uname) : ' tự động'} lúc ${dmy(D.close.ts)}</b>${D.close.span > 1 ? `<span class="sm">Gộp ${D.close.span} ngày (các ngày trước đó chưa chốt)</span>` : ''}${D.close.note ? `<span class="sm">Ghi chú: ${esc(D.close.note)}</span>` : ''}</div>`
    : `<div class="card warn col" style="gap:4px"><b>Ngày này chưa chốt</b><span class="sm">Số tồn lấy theo báo cáo đếm trong ngày; khu không báo tạm lấy tồn chuẩn trước đó.</span></div>`;
  return `${top}<div class="f1 scroll pad col gap12" id="body">
    ${status}
    <div class="hero" style="border-radius:14px;padding:14px 16px"><div class="row" style="justify-content:space-between"><div class="col"><span style="font-size:15px">Tồn cuối ngày ${esc(fmtDay(D.day))}</span><span style="font-size:28px;font-weight:700">${fmtT(totKg)} tấn</span></div>${closed ? `<div class="col" style="align-items:flex-end;font-size:15px"><span>Nhập ${fmtT(totIn)} tấn</span><span>Dùng ${fmtT(totUse)} tấn</span></div>` : ''}</div></div>
    <h2 class="sec">Theo phi (chạm để xem từng khu)</h2>
    <div class="card" style="padding:0;overflow:hidden">${rows}</div>
    <h2 class="sec">Người báo</h2><div class="sm">${reps || '<span class="muted">Không có báo cáo đếm</span>'}</div>
    <h2 class="sec">Phiếu nhập / chuyển</h2>${recs ? `<div class="card" style="padding:0;overflow:hidden">${recs}</div>` : '<div class="muted">Không có phiếu</div>'}
  </div>`;
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
    <div class="col gap8" style="padding:4px 16px">
      <div class="row gap8"><label class="f1 sm">Từ ngày<input class="inp s" style="width:100%" type="date" id="rfrom" data-model="rfrom" max="${b.today}" value="${esc(fv('rfrom', R.from))}"></label><label class="f1 sm">Đến ngày<input class="inp s" style="width:100%" type="date" id="rto" data-model="rto" max="${b.today}" value="${esc(fv('rto', R.to))}"></label></div>
      <div class="wrap"><button class="chip s" data-a="rquick" data-v="week">7 ngày</button><button class="chip s" data-a="rquick" data-v="month">Tháng này</button><button class="chip s" data-a="rquick" data-v="last">Tháng trước</button></div>
      <div class="row gap8"><button class="btn s pri f1" data-a="rload">XEM</button><button class="btn s f1" data-a="rcsv">Tải Excel (CSV)</button></div></div>`;
  if (!D) return `${top}${panelWait('baocao')}`;
  const kgOf = (id) => (b.phiBy[id] ? b.phiBy[id].kg_per_cay : 0);
  const t = { dau: 0, nhap: 0, dung: 0, cuoi: 0 };
  const rows = D.rows.map((r) => {
    const kg = kgOf(r.phi), rp = b.phiBy[r.phi];
    t.dau += (r.dau || 0) * kg; t.nhap += r.nhap * kg; t.dung += r.dung * kg; t.cuoi += (r.cuoi || 0) * kg;
    const u = (x) => (isCuon(rp) ? fmtDec(x / rp.bo_size) : fmtInt(x));
    const dash = (x) => (x == null ? '—' : u(x));
    return `<tr><th>${r.phi}${isCuon(rp) ? '<small class="muted"> (cuộn)</small>' : ''}</th><td>${dash(r.dau)}</td><td>${u(r.nhap)}</td><td>${u(r.dung)}</td><td><b>${dash(r.cuoi)}</b></td></tr>`;
  }).join('');
  const days = D.days.slice().reverse().map((d) => `<div class="li"><span>${fmtDay(d.day)}${d.span > 1 ? ` <span class="sm muted">(gộp ${d.span} ngày)</span>` : ''}</span><span class="sm">nhập ${fmtT(d.nhap_kg)} · dùng ${fmtT(d.dung_kg)} · tồn <b>${fmtT(d.ton_kg)}</b> tấn</span></div>`).join('');
  return `${top}<div class="f1 scroll pad col gap12" id="body">
    ${D.closedDays ? '' : '<div class="card warn">Không có ngày nào được chốt trong khoảng này.</div>'}
    ${D.openDay ? '' : '<div class="sm muted">Chưa có ngày chốt trước kỳ nên không có số tồn đầu kỳ.</div>'}
    <div class="card" style="padding:0;overflow-x:auto"><table class="tbl"><thead><tr><th>Phi</th><th>Tồn đầu</th><th>Nhập</th><th>Dùng</th><th>Tồn cuối</th></tr></thead><tbody>${rows}</tbody>
      <tfoot><tr><th>Tấn</th><td>${fmtT(t.dau)}</td><td>${fmtT(t.nhap)}</td><td>${fmtT(t.dung)}</td><td><b>${fmtT(t.cuoi)}</b></td></tr></tfoot></table></div>
    <div class="sm muted">Đơn vị: cây (D10–D36) hoặc cuộn (D6, D8), dòng cuối: tấn. ${D.openDay ? 'Tồn đầu lấy ngày chốt ' + fmtDay(D.openDay) + '. ' : ''}${D.closeDay ? 'Tồn cuối lấy ngày chốt ' + fmtDay(D.closeDay) + '. ' : ''}Chuyển khu không tính vào nhập.</div>
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
function fmtAudit(a) {
  let d = {};
  try { d = a.detail ? JSON.parse(a.detail) : {}; } catch (e) { d = {}; }
  const kn = (id) => (S.boot.khuBy[id] ? S.boot.khuBy[id].name : id);
  const M = {
    login: ['đăng nhập', 'login'], login_fail: ['nhập sai PIN (lần ' + d.n + ')', 'flag'], login_locked: ['bị khóa ' + (d.mins >= 60 ? d.mins / 60 + ' giờ' : (d.mins || 15) + ' phút') + ' do nhập sai PIN nhiều lần', 'flag'],
    change_pin: ['đổi PIN', 'login'], recover_pin: ['khôi phục PIN qua trang recovery', 'flag'], setup: ['thiết lập hệ thống', 'admin'],
    receipt: ['nhập kho vào ' + kn(d.khu) + ': ' + lineTxt(d) + (d.note ? ' (' + d.note + ')' : ''), 'nhap'],
    transfer: ['chuyển ' + kn(d.from) + ' → ' + kn(d.to) + ': ' + lineTxt(d) + (d.note ? ' (' + d.note + ')' : ''), 'nhap'],
    receipt_void: ['hủy phiếu ' + (d.kind === 'chuyen' ? 'chuyển khu' : 'nhập') + ': ' + lineTxt({ ...d, lines: (d.lines || []).filter((l) => l.qty > 0) }), 'nhap'],
    close_day: ['chốt ngày ' + fmtDay(d.day) + (d.note ? ' (' + d.note + ')' : ''), 'admin'],
    auto_close: ['tự chốt ngày ' + fmtDay(d.day) + ' (ngày bình thường)', 'admin'],
    auto_close_skip: ['không tự chốt ngày ' + fmtDay(d.day) + ': ' + d.reason, 'flag'],
    // bảng nhãn được dựng cho MỌI dòng nhật ký: d.khu ở dòng khác là chuỗi, nên không gọi .join trực tiếp
    review_ack: ['duyệt khu lệch số: ' + [].concat(d.names || d.khu || []).join(', '), 'admin'],
    review_unack: ['bỏ duyệt khu: ' + [].concat(d.names || d.khu || []).join(', '), 'admin'],
    reopen_day: ['mở lại ngày ' + fmtDay(d.day) + ' (' + d.note + ')', 'flag'], recount: ['yêu cầu ' + kn(d.khu) + ' đếm lại', 'admin'], recount_after_close: ['mở lại ngày, xoá số ' + kn(d.khu) + ' và yêu cầu đếm lại', 'flag'], conflict_resolve: [(d.changes && d.changes.length ? 'chọn số cho ' + kn(d.khu) + ': ' + d.changes.map((c) => c.phi + ' ' + c.from + ' → ' + c.to).join('; ') : 'chọn số báo sau cho ' + kn(d.khu)), 'admin'],
    user_create: ['tạo tài khoản ' + d.name, 'admin'], user_reset_pin: ['đặt lại PIN cho ' + d.name, 'admin'], user_lock: ['khóa ' + d.name, 'admin'], user_unlock: ['mở khóa ' + d.name, 'admin'],
    user_role: ['đổi vai trò ' + d.name + ' thành ' + (ROLE[d.role] || d.role), 'admin'], user_logout: ['đăng xuất mọi máy của ' + d.name, 'admin'],
    khu_create: ['thêm ' + d.name, 'admin'], khu_update: ['sửa ' + d.name + (d.active ? '' : ' (ẩn)'), 'admin'],
    khu_users: [d.n ? 'gán ' + d.n + ' người phụ trách ' + kn(d.khu) : 'bỏ phân công ' + kn(d.khu) + ' (mọi người đếm được)', 'admin'], phi_update: ['sửa cấu hình ' + (d.items ? d.items.map((x) => x.id).join(', ') : d.id), 'admin'], phi_seed: ['khôi phục phi mặc định D6–D36', 'admin'], settings_update: ['sửa cài đặt', 'admin'],
  };
  if (a.action === 'count') {
    const u = (v, phi) => (S.boot && S.boot.phiBy[phi] ? fmtQs(v, phi) : v); // cuộn: 350 → "3,5 cuộn"
    const ch = (d.changes || []).map((c) => c.phi + ': ' + (c.from == null ? 'mới' : u(c.from, c.phi)) + ' → ' + u(c.to, c.phi)).join('; ');
    return { text: 'báo ' + kn(d.khu) + (ch ? ' (' + ch + ')' : ' (không đổi)'), type: 'dem', flag: !!d.conflict };
  }
  const m = M[a.action] || [a.action, 'admin'];
  return { text: m[0], type: m[1] === 'flag' ? 'login' : m[1], flag: m[1] === 'flag' };
}
function vNhatKy() {
  const F = [['all', 'Tất cả'], ['dem', 'Báo đếm'], ['nhap', 'Nhập kho'], ['admin', 'Admin'], ['flag', 'Cần chú ý']];
  const rows = (S.audit || []).map((a) => ({ a, f: fmtAudit(a) })).filter((x) => S.logFilter === 'all' || (S.logFilter === 'flag' ? x.f.flag : x.f.type === S.logFilter));
  return `${head('Nhật ký hoạt động', 'Không ai xóa hoặc sửa được', 'more')}
  <div class="wrap" style="padding:6px 16px">${F.map((f) => `<button class="chip s ${S.logFilter === f[0] ? 'on' : ''}" data-a="logf" data-v="${f[0]}">${f[1]}</button>`).join('')}</div>
  <div class="f1 scroll ${S.audit ? 'pad ' : ''}col gap8" id="body">${S.audit ? (rows.map((x) => `<div class="logrow ${x.f.flag ? 'flag' : ''}"><div class="row" style="justify-content:space-between"><b>${esc(x.a.user_name || 'Hệ thống')}</b><span class="sm muted">${dmy(x.a.ts)}</span></div><div style="font-size:16px;line-height:1.4">${esc(x.f.text)}</div>${x.f.flag ? '<span class="badge bad" style="align-self:flex-start">Cần chú ý</span>' : ''}</div>`).join('') || '<div class="muted">Chưa có dữ liệu</div>') : panelWait('nhatky')}</div>`;
}

/* --- Thống kê --- */
function vStats() {
  const b = S.boot, T = totals();
  const scope = S.statScope;
  const chips = [['all', 'Toàn bãi']].concat(b.khuAct.map((k) => [k.id, k.name]));
  const rows = b.phiAct.map((p) => {
    const v = scope === 'all' ? T.perPhi[p.id] : valOf(scope, p.id);
    return { p, v };
  }).filter((r) => scope === 'all' || r.v > 0 || isPresent(scope, r.p.id));
  const sumCay = rows.filter((r) => !isCuon(r.p)).reduce((a, r) => a + r.v, 0);
  const sumKg = rows.reduce((a, r) => a + r.v * r.p.kg_per_cay, 0);
  let usageHtml = panelWait('stats');
  if (S.usage) {
    const per = {}; let tot = 0;
    S.usage.forEach((d) => { let dayKg = 0; for (const p in d.used) { per[p] = (per[p] || 0) + d.used[p]; const ph = b.phiBy[p]; if (ph) dayKg += d.used[p] * ph.kg_per_cay; } d.kg = dayKg; tot += dayKg; });
    usageHtml = S.usage.length ? `<div class="card" style="padding:0;overflow:hidden">${b.phiAct.filter((p) => per[p.id]).map((p) => `<div class="li"><b>${p.id}</b><span class="col" style="align-items:flex-end"><b>${qMain(per[p.id], p)}</b><span class="sm muted">${qSub(per[p.id], p)}</span></span></div>`).join('')}<div class="li" style="background:#E8EEF6"><b>Tổng dùng</b><b>${fmtT(tot)} tấn</b></div></div>
      <h2 class="sec">Theo ngày</h2><div class="card" style="padding:0;overflow:hidden">${S.usage.map((d) => `<div class="li"><span>${d.day.split('-').reverse().join('/')}</span><b>${fmtT(d.kg)} tấn</b></div>`).join('')}</div>` : '<div class="muted">Chưa có ngày nào được chốt trong khoảng này.</div>';
  }
  return `${head('Thống kê', 'Theo khu hoặc toàn bãi', 'more')}
  <div class="f1 scroll pad col gap12" id="body">
    <h2 class="sec">Tồn hiện tại</h2>
    <div class="wrap">${chips.map((c) => `<button class="chip s ${scope === c[0] ? 'on' : ''}" data-a="sscope" data-v="${esc(c[0])}">${esc(c[1])}</button>`).join('')}</div>
    <div class="sm muted">Bộ chọn khu này chỉ áp dụng cho mục Tồn hiện tại ngay dưới.</div>
    <div class="card" style="padding:0;overflow:hidden">${rows.map((r) => `<div class="li"><b>${r.p.id}</b><span class="col" style="align-items:flex-end"><b>${qMain(r.v, r.p)}</b><span class="sm muted">${qSub(r.v, r.p)}</span></span></div>`).join('')}<div class="li" style="background:#E8EEF6"><b>Cộng</b><b>${fmtInt(sumCay)} cây nguyên · ${fmtT(sumKg)} tấn</b></div></div>
    <h2 class="sec">Thép đã dùng (toàn bãi)</h2>
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
    <button class="menu" data-a="nav" data-s="ton">Tồn bãi theo phi</button>
    <button class="menu" data-a="nav" data-s="lichsu">Xem lại ngày cũ</button>
    ${canIn() ? '<button class="menu" data-a="nav" data-s="baocao">Báo cáo Nhập – Dùng – Tồn theo kỳ</button>' : ''}
    ${a ? `<button class="menu" data-a="nav" data-s="nhatky">Nhật ký hoạt động</button>
    <button class="menu" data-a="nav" data-s="users">Người dùng và PIN</button>
    <button class="menu" data-a="nav" data-s="settings">Cài đặt khu, phi, quy tắc</button>
    <div class="card col gap6"><b>Xuất Excel (CSV) bảng khu × phi</b><div class="row gap6"><input class="inp s f1" type="date" id="exday" data-model="exday" max="${S.boot.today}" value="${esc(fv('exday', S.boot.today))}"><button class="btn s" data-a="exportday">Tải về</button></div></div>` : ''}
    <div class="card col gap6"><b>Cách hiện số lượng</b>
      <div class="row gap6">${UNIT_OPTS.map(([v, l]) => `<button class="chip s f1 ${S.unit === v ? 'on' : ''}" data-a="unit" data-v="${v}">${l}</button>`).join('')}</div>
      <span class="sm muted" style="line-height:1.4">Ví dụ phi ${esc(uDemo().id)}: <b>${fmtQ(uDemo().bo_size * 31 + 10, uDemo())}</b><br>Chỉ đổi cách hiện trên máy này, số liệu không đổi.</span></div>
    <button class="menu" data-a="nav" data-s="pin">Đổi PIN của tôi</button>
    <button class="menu" style="color:var(--bad)" data-a="logout">Đăng xuất</button>
    <div class="sm muted" style="text-align:center;padding-top:8px">Kho Thép Bãi · phiên bản 1.2</div>
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
function vUsers() {
  const list = (S.users || []).map((u) => `<div class="card col gap8" style="${u.locked ? 'opacity:.7' : ''}">
    <div class="row" style="justify-content:space-between;gap:8px"><div class="col"><b style="font-size:18px">${esc(u.name)}</b><span class="sm muted">${esc(u.phone)}${u.locked ? ' · ĐÃ KHÓA' : ''}${u.must_change ? ' · chưa đổi PIN' : ''}</span></div>
    <select class="inp s" style="width:130px;font-size:15px" data-change="role" data-id="${u.id}">${Object.keys(ROLE).map((r) => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${ROLE[r]}</option>`).join('')}</select></div>
    <div class="row gap6"><button class="btn s f1" data-a="ureset" data-id="${u.id}">Đặt lại PIN</button>${u.id === S.me.id ? '' : `<button class="btn s f1 ${u.locked ? '' : 'bad'}" data-a="ulock" data-id="${u.id}" data-v="${u.locked ? 0 : 1}">${u.locked ? 'Mở khóa' : 'Khóa'}</button>`}<button class="btn s f1" data-a="ulogout" data-id="${u.id}">Đăng xuất máy</button></div></div>`).join('');
  return `${head('Người dùng', 'Admin tạo tài khoản và PIN', 'more')}<div class="f1 scroll pad col gap12" id="body">
    ${S.pinShown ? `<div class="card ok col gap8"><b style="font-size:18px">PIN của ${esc(S.pinShown.name)}</b><b style="font-size:40px;letter-spacing:8px">${esc(S.pinShown.pin)}</b><span class="sm">Đưa PIN này cho người dùng (chỉ hiện một lần). Họ sẽ phải đổi PIN khi đăng nhập lần đầu.</span><button class="btn s full" data-a="pinok">Đã ghi lại</button></div>` : ''}
    <div class="card col gap8"><b style="font-size:18px">Thêm người dùng</b>
      <input class="inp s" id="un" placeholder="Họ tên" value="${esc(S.form.un || '')}" data-model="un"><input class="inp s" id="up" type="tel" inputmode="numeric" placeholder="Số điện thoại" value="${esc(S.form.up || '')}" data-model="up">
      <select class="inp s" id="ur" data-model="ur">${Object.keys(ROLE).reverse().map((r) => `<option value="${r}" ${(S.form.ur || 'nguoidem') === r ? 'selected' : ''}>${ROLE[r]}</option>`).join('')}</select>
      <div class="err" id="err">${esc(S.err)}</div><button class="btn pri full" data-a="ucreate">TẠO TÀI KHOẢN</button></div>
    ${list || (S.users ? '<div class="muted">Chưa có người dùng nào</div>' : panelWait('users'))}</div>`;
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
    return `1 cuộn dài ≈ ${d ? fmtInt(kgc / (0.00617 * d * d)) : '—'} m · báo động khi còn dưới ≈ ${fmtT(mn * kgc)} tấn`;
  }
  const bo = g('bo'), kg = g('kg');
  if (!(bo >= 1) || !(kg > 0) || !(mn >= 0)) return 'Số chưa hợp lệ';
  return `1 bó ≈ ${fmtT(bo * kg)} tấn · báo động khi còn dưới ${fmtInt(mn * bo)} cây ≈ ${fmtT(mn * bo * kg)} tấn`;
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
    <div class="row gap6" style="justify-content:space-between;align-items:center">${sf && !off ? `<span class="sm muted">${stdTxt}</span><button class="btn s" data-a="pstd" data-p="${p.id}">Dùng số chuẩn</button>` : '<span class="sm muted">Phi bãi không dùng thì tắt đi cho bảng đếm gọn</span>'}<button class="btn s ${off ? '' : 'bad'}" data-a="phioff" data-p="${p.id}" data-v="${off ? 1 : 0}">${off ? 'Bật lại' : 'Tắt phi'}</button></div></div>`;
}
function fillStd(p) {
  const s = phiStdOf(p.id); if (!s) return false;
  const sf = phiForm({ ...s, unit: p.unit });
  Object.keys(sf).forEach((k) => (S.form[k + '-' + p.id] = sf[k]));
  return true;
}
function vSettings() {
  const b = S.boot;
  const phi = b.phi.map(phiCard).join('');
  const uById = {}; (S.users || []).forEach((u) => (uById[u.id] = u));
  const khu = b.khu.map((k) => {
    const asg = b.ku[k.id] || [];
    const names = asg.map((id) => (uById[id] ? uById[id].name : '#' + id));
    const open = S.kuEdit === k.id;
    const picker = open ? `<div class="col gap6" style="border-top:1px solid var(--line);padding-top:8px">
      ${(S.users || []).filter((u) => u.role !== 'admin').map((u) => `<button class="chip ${S.kuPick.includes(u.id) ? 'on' : ''}" style="justify-content:flex-start;font-size:16px" data-a="kupick" data-v="${u.id}">${esc(u.name)} · ${ROLE[u.role] || u.role}</button>`).join('') || '<span class="sm muted">Chưa có tài khoản nào ngoài admin.</span>'}
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
    <div class="card col gap8"><label class="sm">Tự ẩn phi khỏi khu khi đếm bằng 0 liên tiếp (ngày)<input class="inp s" style="width:100%" id="s-zero" inputmode="numeric" value="${b.settings.hide_after_zero_days}"></label>
    <label class="sm">Bắt buộc đếm lại khi "giữ nguyên" quá (ngày)<input class="inp s" style="width:100%" id="s-keep" inputmode="numeric" value="${b.settings.max_keep_streak}"></label>
    <label class="sm">Tự chốt lúc 23:50 (mặc định Tắt). Khi Bật: chỉ chốt nếu đã có khu báo và không còn việc bất thường chưa duyệt<select class="inp s" style="width:100%" id="s-auto"><option value="1" ${b.settings.auto_close ? 'selected' : ''}>Bật</option><option value="0" ${b.settings.auto_close ? '' : 'selected'}>Tắt</option></select></label><button class="btn s" data-a="ssave">Lưu quy tắc</button></div>
    <h2 class="sec">Khu bãi</h2>${khu}
    <div class="card col gap6"><b>Thêm khu mới</b><input class="inp s" id="newk" placeholder="Tên khu, ví dụ: Khu I" data-model="newk" value="${esc(S.form.newk || '')}"><button class="btn s pri" data-a="kadd">Thêm khu</button></div>
    <h2 class="sec">Phi thép (D6 - D36)</h2>
    <div class="sm muted" style="line-height:1.5">Số chuẩn: kg/cây theo TCVN (giống nhau giữa các nhà máy), số cây/bó theo bó nhà máy Hòa Phát (~3,3 tấn/bó), cuộn D6/D8 Hòa Phát, Việt Ý ~2.000 kg. Bó Việt Ý hoặc bó tách ở bãi có số cây khác: sửa riêng phi đó. Số thập phân gõ dấu phẩy (0,5) hoặc dấu chấm.</div>
    <button class="btn s full" data-a="pstdall">Điền số chuẩn cho tất cả phi (xem lại rồi bấm LƯU)</button>
    ${phi}
    <button class="btn pri full" data-a="psaveall">LƯU CẤU HÌNH PHI</button>
    <button class="btn full" style="border:2px dashed var(--bad);color:var(--bad)" data-a="phiseed">Khôi phục phi bị xoá (D6–D36)</button></div>`;
}

/* ===================== KHUNG CHÍNH ===================== */
function tabsHtml() {
  const on = { home: 'home', ton: 'home', khu: 'dem', dem: 'dem', nhap: 'nhap', duyet: 'duyet', nhatky: 'more', lichsu: 'more', baocao: 'more', more: 'more', stats: 'more', users: 'more', settings: 'more', pin: 'more' }[S.screen];
  const T = [['home', 'Tổng quan', IC.home, true], ['dem', 'Đếm', IC.count, true], ['nhap', 'Nhập', IC.inn, canIn()], ['duyet', 'Duyệt', IC.shield, isAdmin()], ['more', 'Thêm', IC.more, true]].filter((t) => t[3]);
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
    case 'more': body = vMore(); break;
    case 'pin': body = vPin(); break;
    case 'users': body = vUsers(); break;
    case 'settings': body = vSettings(); break;
    default: body = vHome();
  }
  const showToast = S.toast && S.screen !== 'dem';
  const noTabs = S.screen === 'dem' && S.sel;
  return `${busyHtml()}${netBar()}${showToast ? `<div class="toast ${S.toastErr ? 'err' : ''}" data-toast="1" role="${S.toastErr ? 'alert' : 'status'}" aria-live="${S.toastErr ? 'assertive' : 'polite'}" style="margin-top:calc(8px + env(safe-area-inset-top))">${esc(S.toast)}</div>` : ''}${body}${noTabs ? '' : tabsHtml()}${askHtml()}`;
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
  if (screen === 'dem') {
    const ok = (id) => id && S.boot.khuBy[id] && S.boot.khuBy[id].active && canCount(id);
    if (!S.boot.khuAct.length) { say('Chưa có khu nào đang dùng. Admin vào Thêm → Cài đặt để thêm khu.', true); S.screen = 'home'; return render(); }
    const mine = myKhu();
    if (!mine.length) S.screen = 'khu'; // chưa được giao khu nào: về màn chọn khu để thấy lời nhắc
    else {
      let last = null;
      try { last = localStorage.getItem('kt:lastKhu'); } catch (e) { /* bỏ qua */ }
      openDem(ok(S.khu) ? S.khu : ok(last) ? last : mine[0].id);
    }
  } else S.screen = screen;
  if (!noPush) pushNav();
  render();
  try {
    if (screen === 'duyet') { S.review = null; S.subs = {}; render(); S.review = await api('GET', '/review'); }
    else if (screen === 'nhatky') { S.audit = null; render(); S.audit = (await api('GET', '/audit?limit=300')).items; }
    else if (screen === 'users') { S.users = (await api('GET', '/users')).users; }
    else if (screen === 'lichsu') { await loadHist(S.hist.date || ydayOf(S.boot.today)); }
    else if (screen === 'baocao') { if (!S.bc.from) [S.bc.from, S.bc.to] = repRange('month'); await loadRep(); }
    else if (screen === 'stats') { S.usage = null; render(); S.usage = (await api('GET', '/usage?days=' + S.usageDays)).items; }
    else if (screen === 'settings') { S.kuEdit = null; await loadBoot(); S.users = (await api('GET', '/users')).users; }
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

function pressKey(i) {
  const f = S.field;
  if (i === 11) { S.field = f === 'bo' ? 'le' : 'bo'; }
  else if (i === 9) { S.rep[f] = false; S[f] = S[f].slice(0, -1); }
  else {
    const d = String(i === 10 ? 0 : i + 1);
    if (S.rep[f]) { S[f] = ''; S.rep[f] = false; } // ô đang hiện số cũ: gõ số mới sẽ thay thế
    // cuộn dở gõ theo % của một cuộn (bo_size phần) nên không vượt quá bo_size - 1
    const maxLen = f === 'bo' ? 3 : S.sel && isCuon(S.sel) ? String(S.boot.phiBy[S.sel].bo_size - 1).length : 4;
    S[f] = (S[f] === '0' ? d : S[f] + d).slice(0, maxLen);
  }
}
function nextPhi(p) {
  const ids = S.boot.phiAct.map((x) => x.id).filter((id) => isPresent(S.khu, id));
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
  } else if (kind === 'zero') S.draft.cells[p] = { v: 0, kind: 'zero', bo: 0, le: 0 };
  else if (S.bo !== '' || S.le !== '') S.draft.cells[p] = { v: boN * size + leN, kind: 'dem', bo: boN, le: leN };
  // chưa gõ gì mà bấm TIẾP: đứng lại, không lặng lẽ nhảy qua phi chưa đếm
  else return say((isCuon(p) ? 'Gõ số cuộn nguyên / % cuộn dở' : 'Gõ số bó / cây lẻ') + ', hoặc bấm "Hết (0)" nếu khu không còn phi này.', true);
  saveDraft();
  const nx = nextPhi(p);
  S.sel = nx; fillSel(nx); S.scrollSel = nx; S.confirmKeep = false;
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
  nav(d) { go(d.s); },
  khuopen(d) { if (!canCount(d.k)) return say('Bạn không phụ trách khu này.', true), render(); openDem(d.k); pushNav(); render(); },
  zoom(d) { S.zoomK = S.zoomK === d.k ? null : d.k; render(); },
  cell(d) {
    const p = d.p;
    if (S.boot.closed) return say('Ngày hôm nay đã chốt, không sửa được nữa.', true), render();
    if (!isPresent(S.khu, p)) S.draft.added[p] = true;
    S.sel = p; fillSel(p); S.scrollSel = p; render();
  },
  key(d) { pressKey(Number(d.d)); render(); },
  fld(d) { S.field = d.v; render(); },
  next() { settle('next'); render(); },
  keep() { settle('keep'); render(); },
  zero() { settle('zero'); render(); },
  closesel() {
    const p = S.sel;
    if (p && (S.bo !== '' || S.le !== '')) {
      const size = S.boot.phiBy[p].bo_size, boN = parseInt(S.bo || '0', 10), leN = parseInt(S.le || '0', 10);
      S.draft.cells[p] = { v: boN * size + leN, kind: 'dem', bo: boN, le: leN }; saveDraft();
    }
    S.sel = null; S.bo = ''; S.le = ''; render();
  },
  keepall() {
    const pend = pendingList().filter((p) => !keepBlock(S.khu, p.id));
    if (!pend.length) {
      const left = pendingList();
      return say(left.length ? 'Các phi còn lại phải đếm thực tế: ' + left.map((p) => p.id).join(', ') + '.' : 'Đã xử lý hết phi của khu này.', true), render();
    }
    if (!S.confirmKeep) { S.confirmKeep = true; return render(); }
    pend.forEach((p) => { S.draft.cells[p.id] = { v: refOf(S.khu, p.id), kind: 'giu' }; });
    S.confirmKeep = false; saveDraft(); render();
  },
  send() {
    if (S.boot.closed) return say('Ngày hôm nay đã chốt, không sửa được nữa.', true), render();
    const pend = pendingList();
    // nói rõ còn thiếu phi nào, thay vì bấm vào nút xám mà không có phản hồi gì
    if (pend.length) return say('Còn ' + pend.length + ' phi chưa nhập: ' + pend.slice(0, 6).map((p) => p.id).join(', ') + (pend.length > 6 ? '…' : '') + '. Chạm vào ô của phi để nhập số.', true), render();
    if (!myPhiList().length) return say('Khu này chưa có phi nào. Chạm ô dấu · để thêm phi.', true), render();
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
    const j = readPending().find((x) => pendKey(x) === d.j);
    if (!j) return gone();
    if (!(await ask('Gửi báo cáo này làm số đếm của HÔM NAY?\nChỉ chọn khi số liệu vẫn đúng với thực tế hôm nay.', 'GỬI LÀM SỐ HÔM NAY'))) return;
    const q = readPending(), i = q.findIndex((x) => pendKey(x) === d.j);
    if (i < 0) return gone();
    q[i] = { khu: j.khu, items: j.items, day: S.boot.today, ts: Date.now() };
    writePending(q); flushPending(); render();
  },
  async pendrm(d) {
    if (readPending().every((x) => pendKey(x) !== d.j)) return say('Báo cáo này không còn trong hàng chờ.', true), render();
    if (!(await ask('Bỏ báo cáo này?\nSố liệu trong báo cáo sẽ mất.', 'BỎ BÁO CÁO', true))) return;
    writePending(readPending().filter((x) => pendKey(x) !== d.j)); render();
  },

  nmode(d) { syncQty(); S.nhap.mode = d.v; S.nhap.done = null; render(); },
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
    const chuyen = N.mode === 'chuyen';
    if (chuyen && (!N.to || N.from === N.to)) return say('Chọn khu đi và khu đến khác nhau.', true), render();
    const note = val('nnote').trim();
    const kg = N.lines.reduce((a, l) => a + l.qty * b.phiBy[l.phi].kg_per_cay, 0);
    const where = chuyen ? `từ ${kName(N.from)} sang ${kName(N.to)}` : `vào ${kName(N.khu)}`;
    // cùng cách hiện với danh sách dòng phía trên: người dùng đối chiếu đúng con số vừa gõ
    const list = N.lines.map((l) => { const lp = b.phiBy[l.phi]; return `  ${l.phi}: ${fmtQ(l.qty, lp)}`; }).join('\n');
    render();
    if (!(await ask(`${chuyen ? 'Chuyển khu' : 'Nhập kho'} ${where}:\n${list}\nTổng ${fmtT(kg)} tấn\n\nĐúng chưa?`, chuyen ? 'CHUYỂN KHU' : 'NHẬP KHO'))) return;
    const lines = N.lines.slice();
    act(async () => {
      const r = chuyen
        ? await api('POST', '/transfers', { from: N.from, to: N.to, lines, note })
        : await api('POST', '/receipts', { khu: N.khu, lines, note });
      N.lines = []; S.form.nnote = '';
      N.done = { id: r.id, text: `${lines.map((l) => { const lp = b.phiBy[l.phi]; return l.phi + ' ' + fmtQs(l.qty, lp); }).join(' · ')} · ${fmtT(kg)} tấn · ${where}` };
      await loadBoot();
    });
  },
  async void(d) { if (!(await ask('Huỷ cả phiếu này?', 'HUỶ PHIẾU', true))) return; act(async () => { await api('DELETE', '/receipts/' + d.id); S.nhap.done = null; await loadBoot(); }, 'Đã hủy phiếu.'); },
  expand(d) { S.expand[d.p] = !S.expand[d.p]; render(); },

  'toggle-normal'() { S.showNormal = !S.showNormal; render(); },
  resolve(d) { act(async () => { await api('POST', '/conflict/resolve', { khu: d.k }); S.cmp = null; S.review = await api('GET', '/review'); await loadBoot(); }, 'Đã giữ số báo sau.'); },
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
    C.data.diffs.forEach((x) => { const v = C.pick[x.phi] === 'a' ? x.a : x.b; if (v != null) pick[x.phi] = v; });
    act(async () => { const r = await api('POST', '/conflict/resolve', { khu: d.k, pick }); S.cmp = null; S.review = await api('GET', '/review'); await loadBoot(); say('Đã lưu lựa chọn' + (r.changed ? ' (' + r.changed + ' phi đổi số).' : '.')); });
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
    act(async () => { await api('POST', '/conflict/resolve', { khu, pick }); delete S.subs[khu]; S.review = await api('GET', '/review'); await loadBoot(); }, 'Đã cập nhật số ' + kName(khu) + '.');
  },
  async recountclose(d) {
    if (!(await ask('Xoá số liệu ' + kName(d.k) + ' và yêu cầu đếm lại?\nNgày đã chốt sẽ được mở lại để người dùng nộp số mới.', 'MỞ LẠI & ĐẾM LẠI', true))) return;
    act(async () => { await api('POST', '/recount-after-close', { khu: d.k }); S.review = await api('GET', '/review'); S.subs = {}; await loadBoot(); }, 'Đã mở lại ngày, yêu cầu ' + kName(d.k) + ' đếm lại.');
  },
  async close() {
    const R = S.review; if (!R || R.closed) return;
    const note = val('note'); S.form.note = note;
    if ((R.pending != null ? R.pending : R.exceptions.length) && !note.trim()) return say('Còn việc chưa duyệt: duyệt khu lệch hoặc ghi chú lý do trước khi chốt.', true), render();
    if (!(await ask('Chốt ngày hôm nay?\nSố đếm hôm nay thành tồn chuẩn mới và ngày này bị khoá.', 'CHỐT NGÀY'))) return;
    act(async () => {
      try { await api('POST', '/close', { note }); }
      catch (e) { if (e.code === 'changed' || e.code === 'closed') { S.review = await api('GET', '/review'); await loadBoot(); } throw e; }
      S.form.note = ''; S.review = await api('GET', '/review'); await loadBoot();
    }, 'Đã chốt ngày. Số đếm hôm nay là tồn chuẩn mới.');
  },
  async reopen() {
    const note = val('reopenNote').trim();
    if (!note) return say('Ghi lý do mở lại ngày vào ô phía trên.', true), render();
    if (!(await ask('Mở lại ngày hôm nay?\nSố đếm sẽ sửa được và cần chốt lại.', 'MỞ LẠI NGÀY', true))) return;
    act(async () => { await api('POST', '/reopen', { note }); S.form.reopenNote = ''; S.review = await api('GET', '/review'); await loadBoot(); }, 'Đã mở lại ngày. Có thể sửa số và chốt lại.');
  },
  hprev() { loadHist(ydayOf(S.hist.date)); },
  hnext() { const n = new Date(Date.parse(S.hist.date) + 864e5).toISOString().slice(0, 10); if (n <= S.boot.today) loadHist(n); },
  rquick(d) { [S.bc.from, S.bc.to] = repRange(d.v); S.form.rfrom = S.bc.from; S.form.rto = S.bc.to; loadRep(); },
  rload() { const a = val('rfrom'), z = val('rto'); if (!a || !z || a > z) return say('Chọn khoảng ngày hợp lệ.', true), render(); S.bc.from = a; S.bc.to = z; loadRep(); },
  rcsv() { const a = val('rfrom') || S.bc.from, z = val('rto') || S.bc.to; download(`/report?format=csv&from=${a}&to=${z}`, `bao-cao_${a}_${z}.csv`); },
  exportday() { const d = val('exday') || S.boot.today; download('/export?date=' + d, `kho-thep_${d}.csv`); },
  logf(d) { S.logFilter = d.v; render(); },
  sscope(d) { S.statScope = d.v; render(); },
  sdays(d) { S.usageDays = Number(d.v); go('stats'); },

  ucreate() {
    const name = val('un'), phone = val('up'), role = val('ur');
    S.form.un = name; S.form.up = phone; S.form.ur = role;
    act(async () => {
      try { const r = await api('POST', '/users', { name, phone, role }); S.pinShown = { name, pin: r.pin }; S.form.un = ''; S.form.up = ''; S.err = ''; S.users = (await api('GET', '/users')).users; }
      catch (e) { S.err = e.message; }
    });
  },
  pinok() { S.pinShown = null; render(); },
  async ureset(d) { const u = (S.users || []).find((x) => x.id === Number(d.id)); if (!u) return; if (!(await ask('Đặt lại PIN cho ' + u.name + '?\nHọ sẽ bị đăng xuất khỏi mọi máy và phải đổi PIN khi đăng nhập lại.', 'ĐẶT LẠI PIN'))) return; act(async () => { const r = await api('POST', `/users/${d.id}/reset-pin`, {}); S.pinShown = { name: u.name, pin: r.pin }; S.users = (await api('GET', '/users')).users; }); },
  ulock(d) { act(async () => { await api('POST', `/users/${d.id}/lock`, { locked: d.v === '1' }); S.users = (await api('GET', '/users')).users; }); },
  ulogout(d) { act(async () => { await api('POST', `/users/${d.id}/logout`, {}); }, 'Đã đăng xuất người dùng khỏi mọi máy.'); },

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
  psaveall() {
    const items = [];
    for (const p of S.boot.phiAct) { // phi đã tắt không có ô nhập trên màn hình, không gửi lên
      const g = (k) => numIn(val(k + '-' + p.id));
      const mn = g('mn'), bad = () => (say('Số của ' + p.id + ' chưa hợp lệ, hãy kiểm tra lại.', true), render());
      if (isCuon(p)) { // 1 cuộn = bo_size phần; kg mỗi phần = kg cuộn / bo_size
        const kgc = g('kgc');
        if (!(kgc > 0) || !(mn >= 0)) return bad();
        items.push({ id: p.id, bo_size: p.bo_size, kg_per_cay: Math.round((kgc / p.bo_size) * 1e4) / 1e4, min_stock: Math.round(mn * p.bo_size) });
      } else {
        const bo = Math.round(g('bo')), kg = g('kg');
        if (!(bo >= 1) || !(kg > 0) || !(mn >= 0)) return bad();
        items.push({ id: p.id, bo_size: bo, kg_per_cay: kg, min_stock: Math.round(mn * bo) });
      }
    }
    act(async () => {
      const r = await api('PUT', '/phi', { items });
      items.forEach((it) => PHI_FIELDS.forEach((k) => delete S.form[k + '-' + it.id]));
      await loadBoot(); say(r.n ? 'Đã lưu ' + r.n + ' phi.' : 'Không có thay đổi.');
    });
  },
  ksave(d) { act(async () => { await api('PATCH', '/khu/' + d.k, { name: val('kn-' + d.k) }); delete S.form['kn-' + d.k]; await loadBoot(); }, 'Đã lưu tên khu.'); },
  async khide(d) { if (d.v !== '1' && !(await ask('Ẩn ' + kName(d.k) + '?\nKhu ẩn không còn trong danh sách đếm, nhưng thép còn lại vẫn được tính vào tổng bãi.', 'ẨN KHU', true))) return; act(async () => { await api('PATCH', '/khu/' + d.k, { active: d.v === '1' }); await loadBoot(); }, d.v === '1' ? 'Đã hiện lại khu.' : 'Đã ẩn khu.'); },
  unit(d) { S.unit = d.v; try { localStorage.setItem('kt:unit', d.v); } catch (e) { /* bỏ qua */ } render(); },
  // duyệt lưu trên server (kèm số liệu lúc duyệt) nên chốt tay và tự chốt đều biết khu đã được duyệt
  // gửi kèm dấu số liệu đang hiện: khu vừa báo lại số mới thì server chặn, admin xem lại rồi mới duyệt
  khuack(d) {
    const sig = ackSigs()[d.k]; if (!sig) return;
    act(async () => {
      try { await api('POST', '/review/ack', { khu: d.k, sig }); }
      finally { await reloadReview(); } // bị chặn vì số vừa đổi thì cũng phải nạp lại để admin thấy số mới
    }, 'Đã duyệt ' + kName(d.k) + '.');
  },
  async khuackall() {
    const R = S.review; if (!R) return;
    const sigs = ackSigs();
    const names = [...new Set(R.exceptions.filter((e) => (e.type === 'khu_up' || e.type === 'khu_down') && !e.ack).map((e) => e.name))];
    if (!(await ask('Duyệt cả ' + names.length + ' khu lệch số?\n' + names.join(', ') + '\nCác khu này sẽ không còn chặn chốt ngày.', 'DUYỆT TẤT CẢ'))) return;
    act(async () => {
      let r;
      try { r = await api('POST', '/review/ack', { all: true, sigs }); }
      finally { await reloadReview(); }
      say('Đã duyệt ' + r.n + ' khu.');
    });
  },
  khuunack(d) { act(async () => { await api('POST', '/review/ack', { khu: d.k, undo: true }); S.review = await api('GET', '/review'); }, 'Đã bỏ duyệt ' + kName(d.k) + '.'); },
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
  ssave() { act(async () => { await api('PUT', '/settings', { hide_after_zero_days: val('s-zero'), max_keep_streak: val('s-keep'), auto_close: val('s-auto') }); await loadBoot(); }, 'Đã lưu quy tắc.'); },
};

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-a]');
  if (!t || !ACTIONS[t.dataset.a]) return;
  ACTIONS[t.dataset.a](t.dataset, e);
});
document.addEventListener('input', (e) => {
  const m = e.target.dataset && e.target.dataset.model;
  if (m) S.form[m] = e.target.value;
  const pm = m && /^(bo|kg|kgc|mn)-(.+)$/.exec(m); // Cài đặt phi: cập nhật dòng quy đổi ngay khi gõ
  if (pm && S.boot && S.boot.phiBy[pm[2]]) { const h = document.getElementById('ph-' + pm[2]); if (h) h.textContent = phiHint(S.boot.phiBy[pm[2]]); }
  if (e.target.id === 'nqty' && S.boot) { // cập nhật số kg ngay, không vẽ lại cả màn hình khi đang gõ
    const raw = e.target.value.replace(/\D/g, '');
    syncQty(); S.nhap.done = null;
    // gõ chữ, số 0 đứng đầu hoặc vượt trần: viết lại ô cho khớp số thật
    if (raw !== e.target.value || (raw !== '' && String(S.nhap.qty) !== raw)) e.target.value = S.nhap.qty ? String(S.nhap.qty) : '';
    const k = document.getElementById('nkg'), p = S.boot.phiBy[S.nhap.phi];
    if (k && p) k.textContent = nkgText(S.nhap.qty * uStepOf(p), p);
  }
});
document.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.dataset && t.dataset.change === 'hdate') { if (t.value) loadHist(t.value > S.boot.today ? S.boot.today : t.value); return; }
  if (t.dataset && t.dataset.change === 'role') {
    const id = t.dataset.id, role = t.value;
    const u = (S.users || []).find((x) => x.id === Number(id));
    if (!(await ask(`Đổi vai trò ${u ? u.name : ''} thành ${ROLE[role]}?`, 'ĐỔI VAI TRÒ'))) return render(); // vẽ lại để ô chọn quay về vai trò cũ
    act(async () => { await api('POST', `/users/${id}/role`, { role }); S.users = (await api('GET', '/users')).users; }, 'Đã đổi vai trò.');
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.dataset && e.target.dataset.enter) { e.preventDefault(); ACTIONS[e.target.dataset.enter](); }
});

/* ===================== KHỞI ĐỘNG ===================== */
/* Làm mới thích ứng để tiết kiệm hạn mức miễn phí:
   - đang thao tác: hỏi phiên bản mỗi 60 giây; để yên quá 5 phút: mỗi 5 phút
   - ngoài giờ làm (20:00 - 6:00): mỗi 15 phút; app chạy nền: không hỏi */
let lastAct = Date.now(), lastPoll = 0;
['click', 'keydown', 'touchstart'].forEach((ev) => document.addEventListener(ev, () => { lastAct = Date.now(); }, { passive: true }));
function pollEvery() {
  const h = new Date().getHours();
  if (h < 6 || h >= 20) return 15 * 60e3;
  return Date.now() - lastAct > 5 * 60e3 ? 5 * 60e3 : 60e3;
}
async function refresh() {
  if (!S.me || document.hidden || S.me.must_change) return;
  lastPoll = Date.now();
  try {
    // chỉ hỏi số phiên bản (rất nhẹ), có thay đổi hoặc sang ngày mới mới tải lại toàn bộ
    const r = await api('GET', '/rev');
    const healed = S.netBad; S.netBad = false; S.netOk = Date.now();
    if (readPending().some((j) => !j.err)) flushPending();
    if (S.boot && r.today !== S.boot.today && S.screen === 'dem') {
      // nháp đang đếm thuộc ngày cũ: không để lẫn sang ngày mới
      S.screen = 'home'; S.sel = null;
      say('Đã sang ngày mới, hãy mở lại màn Đếm để đếm cho hôm nay.', true);
    }
    const changed = !S.boot || S.stale || r.rev !== S.boot.rev || r.today !== S.boot.today;
    // đang nhập số ở màn Đếm thì không vẽ lại giữa chừng (trừ khi sang ngày mới)
    const busy = S.screen === 'dem' && S.sel && S.boot && r.today === S.boot.today;
    if (changed && !busy && ['home', 'ton', 'khu', 'nhap', 'dem', 'stats'].includes(S.screen)) { await loadBoot(); render(); }
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
  setTimeout(tick, 15000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - lastPoll > 30e3) refresh(); });
  window.addEventListener('online', () => { render(); refresh(); flushPending(); });
  window.addEventListener('offline', () => render());
  try { history.replaceState({ s: S.screen, k: null }, ''); } catch (e) { /* bỏ qua */ }
}
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
start();
