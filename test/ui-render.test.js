/* Smoke test: nạp public/app.js trong môi trường DOM giả, dựng dữ liệu mẫu,
   rồi render từng màn hình + từng trạng thái để bắt lỗi runtime (biến thiếu, undefined trong HTML). */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = process.argv[2] || '.';
const code = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');

const mkEl = (id) => ({
  id, tagName: 'INPUT', value: '', scrollTop: 0, dataset: {}, style: {},
  selectionStart: 0, selectionEnd: 0,
  focus() {}, remove() {}, click() {}, setSelectionRange() {},
  querySelector: () => null, querySelectorAll: () => [], appendChild() {}, closest: () => null,
  set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html || ''; },
});
const appEl = mkEl('app');
const store = {};

const ctx = {
  console,
  setTimeout: () => 0, clearTimeout: () => {}, Date, Math, JSON, String, Number, Object, Array, Set, Map,
  parseInt, parseFloat, isNaN, Promise, RegExp, Error, encodeURIComponent, URL: { createObjectURL: () => 'blob:x' },
  localStorage: {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    key: (i) => Object.keys(store)[i] || null,
    get length() { return Object.keys(store).length; },
  },
  navigator: { onLine: true },
  history: { state: null, pushState(s) { this.state = s; }, replaceState(s) { this.state = s; } },
  fetch: () => Promise.reject(new TypeError('offline trong smoke test')),
  document: {
    activeElement: null,
    body: { appendChild() {}, removeChild() {} },
    createElement: () => mkEl('tmp'),
    getElementById: (id) => (id === 'app' ? appEl : null),
    querySelectorAll: () => [],
    addEventListener() {},
  },
  window: { addEventListener() {} },
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(code, ctx, { filename: 'app.js' });

/* ---------- dữ liệu mẫu ---------- */
const today = new Date().toISOString().slice(0, 10);
const yday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
const ts = Date.now() - 36e5;
const phi = [
  { id: 'D6', kg_per_cay: 20, bo_size: 100, min_stock: 200, unit: 'cuon', active: 0 },
  { id: 'D8', kg_per_cay: 20, bo_size: 100, min_stock: 200, unit: 'cuon', active: 1 },
  { id: 'D10', kg_per_cay: 7.22, bo_size: 440, min_stock: 440, unit: 'cay', active: 1 },
  { id: 'D12', kg_per_cay: 10.4, bo_size: 320, min_stock: 320, unit: 'cay', active: 1 },
  { id: 'D16', kg_per_cay: 18.48, bo_size: 180, min_stock: 180, unit: 'cay', active: 1 },
];
const khu = [
  { id: 'A', name: 'Khu A', active: 1 },
  { id: 'B', name: 'Khu B dài tên để thử tràn nút bấm', active: 1 },
  { id: 'C', name: 'Khu C', active: 1 },
  { id: 'Z', name: 'Khu Z cũ', active: 0 },
];
const boot = {
  rev: 7, today, lastClosed: yday, closed: false,
  user: { id: 1, name: 'Nguyễn Văn A', role: 'admin' },
  phi, khu,
  khuPhi: [
    { khu_id: 'A', phi_id: 'D8', active: 1, keep_streak: 0 },
    { khu_id: 'A', phi_id: 'D10', active: 1, keep_streak: 3 },
    { khu_id: 'A', phi_id: 'D12', active: 1, keep_streak: 0 },
    { khu_id: 'B', phi_id: 'D10', active: 1, keep_streak: 0 },
    { khu_id: 'C', phi_id: 'D16', active: 1, keep_streak: 0 },
  ],
  counts: [{ khu_id: 'B', phi_id: 'D10', v: 240, kind: 'dem', bo: 24, le: 0, user_id: 2, uname: 'Trần B', ts }],
  baseline: [
    { khu_id: 'A', phi_id: 'D8', v: 220 }, { khu_id: 'A', phi_id: 'D10', v: 300 },
    { khu_id: 'A', phi_id: 'D12', v: 40 }, { khu_id: 'B', phi_id: 'D10', v: 260 },
    { khu_id: 'C', phi_id: 'D16', v: 20 }, { khu_id: 'Z', phi_id: 'D16', v: 15 },
  ],
  reports: [{ khu_id: 'B', user_id: 2, uname: 'Trần B', ts, conflict: 1, resolved: 0, recount: 0 }],
  receipts: [
    { id: 11, phi_id: 'D8', khu_id: 'A', qty: 110, note: 'xe 29C-123', kind: 'nhap', grp: 'g1', ts, user_id: 1, uname: 'Nguyễn Văn A' },
    { id: 12, phi_id: 'D10', khu_id: 'A', qty: -50, note: '', kind: 'chuyen', grp: 'g2', ts, user_id: 1, uname: 'Nguyễn Văn A' },
    { id: 13, phi_id: 'D10', khu_id: 'B', qty: 50, note: '', kind: 'chuyen', grp: 'g2', ts, user_id: 1, uname: 'Nguyễn Văn A' },
    /* Phiếu ĐIỀU CHỈNH là loại duy nhất có thể CHỈ GỒM DÒNG ÂM. Nó nằm trong dữ liệu mẫu để mọi
       màn hình bày phiếu đều phải vẽ được nó: bản cũ lọc qty > 0 rồi đọc pos[0].khu_id, nên phiếu
       giảm hiện ra tiêu đề "Nhập vào undefined" và phần mô tả rỗng. */
    { id: 14, phi_id: 'D12', khu_id: 'C', qty: -30, note: 'Đếm sai kỳ trước', kind: 'dc', grp: 'g3', ts, user_id: 1, uname: 'Nguyễn Văn A' },
    { id: 15, phi_id: 'D16', khu_id: 'A', qty: 25, note: 'Ghi nhầm phiếu: thiếu một bó', kind: 'dc', grp: 'g4', ts, user_id: 1, uname: 'Nguyễn Văn A', duyet_day: today, duyet_ts: ts, duyet_name: 'Nguyễn Văn A' },
  ],
  innKhu: [{ khu_id: 'A', phi_id: 'D8', q: 110 }, { khu_id: 'A', phi_id: 'D10', q: -50 }, { khu_id: 'B', phi_id: 'D10', q: 50 }],
  // khu B đã đếm D10 hôm nay; phần còn lại chưa đếm nên vẫn là "chưa được đếm"
  eff: [{ khu_id: 'B', phi_id: 'D10', v: 240, kind: 'dem', ts: Date.now() - 36e5, day: today }],
  mvNew: [{ khu_id: 'A', phi_id: 'D8', q: 110 }, { khu_id: 'A', phi_id: 'D10', q: -50 }],
  rates: [{ phi_id: 'D8', per_day: 33, days: 28 }, { phi_id: 'D10', per_day: 120, days: 2 }],
  settings: { hide_after_zero_days: 3, max_keep_streak: 3, auto_close: 1, report_slots_per_day: 1 },
};
const review = {
  day: today, last: yday, span: 2, closed: false,
  rows: [
    { phi: 'D8', old: 220, inn: 110, dc: 0, cnt: 180, used: 150, neg: false, high: true, avg: 33, topKhu: 'A', topNet: -40 },
    /* inn là TỔNG, gồm cả phần điều chỉnh: ở đây nhập thật 20, sửa sổ −20, nên phép tính trên màn
       Duyệt phải tách ra thành "+ 20" và "− 20(đc)" mà tổng vẫn khớp. Phi này còn là phi bị gắn cờ
       "dùng âm", tức nó đi qua cả thẻ đỏ (lưới .eq 5 ô) lẫn dòng gọn. */
    { phi: 'D10', old: 560, inn: 0, dc: -20, cnt: 600, used: -40, neg: true, high: false, avg: 120, topKhu: 'B', topNet: 40 },
    { phi: 'D12', old: 40, inn: 0, dc: 0, cnt: 40, used: 0, neg: false, high: false, avg: 5, topKhu: null, topNet: 0 },
  ],
  exceptions: [
    { type: 'khu_missing', khu: 'A', name: 'Khu A' },
    { type: 'khu_pending', khu: 'B', name: 'Khu B dài tên để thử tràn nút bấm', n: 3, blank: 1 },
    { type: 'conflict', khu: 'B', name: 'Khu B dài tên để thử tràn nút bấm' },
    { type: 'recheck', khu: 'B', name: 'Khu B dài tên để thử tràn nút bấm' },
    { type: 'recount', khu: 'C', name: 'Khu C' },
    { type: 'slot_missing', khu: 'C', name: 'Khu C', missing: ['buổi sáng (6h–12h)'] },
    { type: 'receipt_pending', key: 'g1', id: 71, kind: 'nhap', day: today },
    { type: 'receipt_pending', key: 'g3', id: 73, kind: 'dc', day: today },
    { type: 'phi', phi: 'D10', reason: 'neg' },
  ],
  /* Thẻ của từng khu: đủ các trạng thái cần vẽ — chưa báo, chờ duyệt kèm lệch và ô để trống,
     đã duyệt, và khu báo từ NGÀY TRƯỚC (quên chốt) để thử nhãn ngày. */
  khus: [
    { khu: 'A', name: 'Khu A', items: [{ phi: 'D10', ref: 300, mv: 0, exp: 300, cnt: null, d: null, kind: null, duyet: null }], waiting: 0, blank: 0, rep: null, recheck: false, phieu: [], duyet: null },
    { khu: 'B', name: 'Khu B dài tên để thử tràn nút bấm',
      items: [
        { phi: 'D8', ref: 220, mv: 110, exp: 330, cnt: 180, d: -150, kind: 'dem', big: true, blank: false, duyet: false },
        { phi: 'D10', ref: 0, mv: 0, exp: 0, cnt: 200, d: 200, kind: 'dem', big: true, blank: false, duyet: false },
        { phi: 'D12', ref: 40, mv: 0, exp: 40, cnt: 0, d: -40, kind: 'zero', big: false, blank: true, duyet: false },
        { phi: 'D14', ref: 55, mv: 0, exp: 55, cnt: 55, d: 0, kind: 'dem', big: false, blank: false, duyet: false },
      ],
      waiting: 4, blank: 1, rep: { uname: 'Nguyễn Văn B', ts, day: today, conflict: 1, resolved: 0, recount: 0 },
      recheck: true, phieu: ['g1'], duyet: null },
    { khu: 'C', name: 'Khu C', items: [{ phi: 'D10', ref: 100, mv: 0, exp: 100, cnt: 100, d: 0, kind: 'dem', big: false, blank: false, duyet: true }],
      waiting: 0, blank: 0, rep: { uname: 'Trần Thị C', ts, day: yday, conflict: 0, resolved: 0, recount: 1 },
      recheck: false, phieu: [], duyet: { by: 'Admin', ts },
      // đếm nhiều lần/ngày: thiếu buổi sáng, và lần chiều gửi muộn sau mất mạng
      slots: { done: [1], missing: [0], late: [{ at: ts - 3600e3, ts }] } },
  ],
  slot: { n: 2, defs: [{ i: 0, from: 6, to: 12, label: 'buổi sáng (6h–12h)' }, { i: 1, from: 12, to: 18, label: 'buổi chiều (12h–18h)' }] },
  phieu: [
    { key: 'g1', grp: 'g1', id: 71, day: today, ts, uname: 'Thủ kho', kind: 'nhap', note: 'xe 12A',
      lines: [{ phi: 'D8', khu: 'B', qty: 110 }] },
    { key: 'g2', grp: 'g2', id: 72, day: yday, ts, uname: 'Thủ kho', kind: 'chuyen', note: '',
      lines: [{ phi: 'D10', khu: 'A', qty: -50 }, { phi: 'D10', khu: 'B', qty: 50 }] },
    // phiếu điều chỉnh chờ duyệt, chỉ có dòng âm: thẻ trên màn Duyệt phải nói rõ nó sửa sổ
    { key: 'g3', grp: 'g3', id: 73, day: today, ts, uname: 'Thủ kho', kind: 'dc', note: 'Đếm sai kỳ trước',
      lines: [{ phi: 'D12', khu: 'C', qty: -30 }] },
  ],
  pending: 7,
  reports: boot.reports, khu,
};
const dayData = {
  day: yday, close: { uname: 'Nguyễn Văn A', ts, note: 'bình thường', span: 1 },
  counts: [{ khu_id: 'A', phi_id: 'D8', v: 220 }], baseline: boot.baseline, prevBaseline: boot.baseline,
  summary: [{ phi_id: 'D8', nhap: 110, dung: 55, dc: 0, xuat: 22 }, { phi_id: 'D10', nhap: 0, dung: 120, dc: -30, xuat: 0 }],
  reports: boot.reports, receipts: boot.receipts.map((r) => ({ ...r, voided: 0 })),
  lastClose: yday, // là lần chốt gần nhất, nên màn hình bày nút mở lại
};
const repData = {
  rows: [
    { phi: 'D8', dau: 220, nhap: 110, dc: 0, dung: 55, cuoi: 275 },
    { phi: 'D10', dau: null, nhap: 0, dc: -30, dung: 120, cuoi: null },
  ],
  days: [{ day: yday, span: 2, nhap_kg: 4345, dc_kg: -555, dung_kg: 7421, ton_kg: 23450 }],
  closedDays: 1, openDay: yday, closeDay: yday, hasDc: true,
};

/* ---------- chạy ---------- */
const T = `
S.me = ${JSON.stringify(boot.user)};
const BOOT = ${JSON.stringify(boot)};
indexBoot(BOOT); S.boot = BOOT;
S.review = ${JSON.stringify(review)};
S.audit = [
  { ts: Date.now(), user_name: 'Nguyễn Văn A', action: 'receipt', detail: JSON.stringify({ khu: 'A', lines: [{ phi: 'D8', qty: 110 }], note: 'xe 29C' }) },
  { ts: Date.now(), user_name: 'Trần B', action: 'count', detail: JSON.stringify({ khu: 'B', changes: [{ phi: 'D10', from: 260, to: 240 }], conflict: 1 }) },
  { ts: Date.now(), user_name: null, action: 'auto_close_skip', detail: JSON.stringify({ day: '${today}', reason: '1 khu chưa báo' }) },
  { ts: Date.now(), user_name: 'Nguyễn Văn A', action: 'login_locked', detail: JSON.stringify({ mins: 60 }) },
  { ts: Date.now(), user_name: 'An', action: 'loan_cho_vay', detail: JSON.stringify({ doitac: 'Cty Hoà Bình', lines: [{ phi: 'D8', qty: 220 }], note: 'hẹn trả T6' }) },
  { ts: Date.now(), user_name: 'A', action: 'loan_duyet', detail: JSON.stringify({ id: 11, kind: 'vay' }) },
  { ts: Date.now(), user_name: 'A', action: 'restore', detail: JSON.stringify({ ngay: '${yday}', boi: 'A', dong: { phi: 13 }, giu: ['doitac', 'loans'] }) },
];
/* Đủ các trạng thái màn Người dùng phải vẽ: admin đầu tiên (không khoá/hạ quyền/xoá được),
   người bị khoá, admin thường, và một tài khoản ĐÃ XOÁ để thử mục khôi phục. */
S.users = [
  { id: 1, name: 'Nguyễn Văn A', phone: '0901234567', role: 'admin', locked: 0, deleted: 0, must_change: 0 },
  { id: 2, name: 'Trần B', phone: '0902222222', role: 'nguoidem', locked: 1, deleted: 0, must_change: 1 },
  { id: 3, name: 'Phạm D', phone: '0903333333', role: 'thukho', locked: 0, deleted: 0, must_change: 0 },
  { id: 4, name: 'Lê C', phone: '0904444444', role: 'nguoidem', locked: 0, deleted: 1, must_change: 0 },
];
S.uFirst = 1;
S.usage = [{ day: '${yday}', span: 1, used: { D8: 55, D10: 120 } }];
S.hist = { date: '${yday}', data: ${JSON.stringify(dayData)} };
S.bc = { from: '${yday}', to: '${today}', data: ${JSON.stringify(repData)} };
S.subs = { B: [
  { uname: 'Trần B', ts: Date.now() - 7200e3, vals: { D10: 260 } },
  { uname: 'Lê C', ts: Date.now() - 3600e3, vals: { D10: 240 } },
] };
S.khu = 'A';
loadDraft(true);
// sổ vay mượn: đủ trạng thái — chờ duyệt (một lần ghi hai phi), đã duyệt, đối tác đã ẩn, dư nợ hai chiều
S.loans = { doitac: [{ id: 5, name: 'Công ty Thép Hoà Bình tên dài để thử tràn dòng', active: 1 }, { id: 6, name: 'Cty Cũ', active: 0 }],
  items: [
    { id: 11, doitac_id: 5, doitac_name: 'Công ty Thép Hoà Bình tên dài để thử tràn dòng', phi_id: 'D8', kind: 'vay', qty: 220, grp: 'g1', user_id: 2, uname: 'An', ts: Date.now(), duyet_ts: null, note: 'xe 29C' },
    { id: 12, doitac_id: 5, doitac_name: 'Công ty Thép Hoà Bình tên dài để thử tràn dòng', phi_id: 'D10', kind: 'vay', qty: 40, grp: 'g1', user_id: 2, uname: 'An', ts: Date.now(), duyet_ts: null },
    { id: 9, doitac_id: 6, doitac_name: 'Cty Cũ', phi_id: 'D10', kind: 'cho_vay', qty: 20, grp: 'g0', user_id: 1, uname: 'A', ts: Date.now() - 864e5, duyet_ts: Date.now() - 864e5, duyet_uname: 'A' },
  ],
  agg: [{ doitac_id: 5, phi_id: 'D8', kind: 'vay', q: 330 }, { doitac_id: 6, phi_id: 'D10', kind: 'cho_vay', q: 20 }] };
S.loan.doitac = 5; S.loan.lines = [{ phi: 'D10', qty: 30 }];
S.boot.loanPending = 1;

const SCREENS = ['home','khu','dem','nhap','ton','duyet','nhatky','lichsu','baocao','stats','more','pin','users','settings','vaymuon'];
const out = [];
function one(label) {
  render();
  const h = $app.innerHTML;
  out.push([label, h.length, /undefined|NaN|\\[object Object\\]/.test(h) ? 'BAD:' + (h.match(/.{0,40}(undefined|NaN|\\[object Object\\]).{0,40}/) || [''])[0] : 'ok']);
}
for (const sc of SCREENS) { S.screen = sc; one(sc); }

// các trạng thái đặc biệt
S.screen = 'dem'; S.sel = 'D8'; fillSel('D8'); one('dem+ban-so-D8');
S.sel = 'D10'; fillSel('D10'); S.bo = '12'; S.le = '7'; one('dem+dang-go-D10');
S.sel = null; S.zoomK = 'B'; one('dem+phong-to-khu'); S.zoomK = null;
S.draftWarn = { uname: 'Trần B', ts: Date.now() }; one('dem+nhap-trung'); S.draftWarn = null;
S.khu = 'B'; loadDraft(true); one('dem+khu-da-co-nguoi-bao'); S.khu = 'A'; loadDraft(true);
S.legend = true; one('dem+chu-thich'); S.legend = false;
S.toast = 'Đã gửi báo cáo'; S.toastErr = false; one('dem+toast');
S.screen = 'home'; one('home+toast'); S.toast = '';
S.busy = true; S.busyMsg = 'Đang lưu...'; one('home+dang-luu'); S.busy = false;
S.ask = { msg: 'Chốt ngày hôm nay?\\nSố đếm thành tồn chuẩn mới.', ok: 'CHỐT NGÀY', danger: false, resolve: () => {} };
one('home+hop-xac-nhan'); S.ask = null;
S.stale = Date.now() - 6e5; one('home+mat-ket-noi'); S.stale = null;
navigator.onLine = false; one('home+offline'); navigator.onLine = true;
S.netBad = true; one('home+chua-cap-nhat'); S.netBad = false;
S.boot.closed = true; S.screen = 'duyet'; S.review.closed = true; one('duyet+da-chot');
S.boot.closed = false; S.review.closed = false;
// bảng "phi bình thường" mở ra: đây là chỗ in phép tính gọn, có cả phi bị sửa sổ
S.screen = 'duyet'; S.showNormal = true; one('duyet+phi-binh-thuong'); S.showNormal = false;
// bảng so sánh hai người báo: số theo đúng đơn vị (D8 là cuộn, không phải số phần)
S.screen = 'duyet'; S.cmp = { khu: 'B', pick: {}, data: { a: { uname: 'An', ts: Date.now() }, b: { uname: 'Bình', ts: Date.now() }, diffs: [{ phi: 'D8', a: 22, b: 33 }] } }; render();
{ const h = $app.innerHTML; out.push(['duyet+so-sanh', h.length, h.split('data-a="cpick"').slice(1).filter((x) => x.split('</button>')[0].includes('cuộn')).length === 2 && !h.includes('>22</button>') ? 'ok' : 'BAD:so sánh hai người báo hiện số thô']); }
S.cmp = null;
// khu thiếu khung đếm: thẻ khu phải nói khung nào thiếu, khung nào đã đếm, và lần gửi muộn
S.screen = 'duyet'; render();
{ const h = $app.innerHTML; out.push(['duyet+nut-chot', h.length,
  h.includes('CHỐT NGÀY (KÈM LÝ DO)') && !h.includes('DUYỆT & CHỐT') && h.includes('D8 +1,1 cuộn') ? 'ok' : 'BAD:nút chốt hoặc phiếu chờ của khu']); }
{ const h = $app.innerHTML; out.push(['duyet+thieu-khung', h.length,
  ['Thiếu lần đếm buổi sáng (6h–12h)', '✗ buổi sáng', '✓ buổi chiều', 'gửi muộn', 'mỗi khu đếm 2 lần/ngày'].every((x) => h.includes(x))
    ? 'ok' : 'BAD:thiếu dòng khung giờ']); }

// trạng thái đang tải và tải lỗi
for (const [sc, k] of [['duyet','review'],['nhatky','audit'],['users','users'],['stats','usage'],['vaymuon','loans']]) {
  S.screen = sc; const bak = S[k]; S[k] = null;
  one(sc + '+dang-tai');
  S.loadErr[sc] = 'Không có kết nối mạng'; one(sc + '+loi-tai'); delete S.loadErr[sc];
  S[k] = bak;
}
S.screen = 'lichsu'; S.hist.data = null; one('lichsu+dang-tai');
/* Xem lại ngày cũ có ba trạng thái trái ngược nhau quanh cái nút nguy hiểm nhất của màn này:
   là lần chốt gần nhất thì bày nút mở lại, cũ hơn thì nói rõ vì sao không mở được, chưa chốt thì
   không liên quan. Cả ba đều phải vẽ được. */
const HD = ${JSON.stringify(dayData)};
S.hist = { date: '${yday}', data: HD }; S.screen = 'lichsu';
one('lichsu+chot-gan-nhat+mo-lai-duoc');
S.hist = { date: '${yday}', data: { ...HD, lastClose: '${today}' } };
one('lichsu+ngay-cu-hon+khong-mo-duoc');
S.hist = { date: '${yday}', data: { ...HD, close: null } };
one('lichsu+chua-chot');
S.hist = { date: '${yday}', data: HD };
S.loadErr.lichsu = 'Lỗi 500'; one('lichsu+loi-tai'); delete S.loadErr.lichsu;
S.screen = 'baocao'; S.bc.data = null; one('baocao+dang-tai');

// hàng chờ gửi khi mất mạng
writePending([
  { khu: 'A', day: '${yday}', items: [{ phi: 'D8', v: 220, kind: 'dem', bo: 20, le: 0 }], ts: Date.now() - 9e5, err: 'Đã sang ngày mới' },
  { khu: 'C', day: '${today}', items: [], ts: Date.now() },
]);
S.screen = 'home'; one('home+hang-cho-gui');

/* Thẻ khu ở Tổng quan mở ra bảng chi tiết: dựng cả hai cảnh, khu có báo cáo đang chờ duyệt
   (bày thêm cột "Khu báo") và khu không có gì chờ. */
S.screen = 'home'; S.khuMo = { A: 1, B: 1 }; one('home+chi-tiet-khu');
S.boot.counts = [
  { khu_id: 'A', phi_id: 'D10', v: 250, kind: 'dem', ts: 2000, duyet_v: null, duyet_ts: null },
  { khu_id: 'A', phi_id: 'D12', v: 0, kind: 'zero', ts: 2000, duyet_v: null, duyet_ts: null },
];
one('home+chi-tiet-khu+cho-duyet');
S.boot.counts = []; S.khuMo = {};

// vai trò khác
S.me.role = 'nguoidem'; S.boot.user.role = 'nguoidem';
for (const sc of ['home','more','dem','ton']) { S.screen = sc; one('nguoidem:' + sc); }
S.me.role = 'thukho'; S.screen = 'nhap'; one('thukho:nhap');
S.me.role = 'admin';

/* Màn Nhập có bốn chế độ dùng chung một hàm vẽ, nên phải render cả bốn. Chế độ Điều chỉnh còn phải
   vẽ được ở hai chiều, lúc chưa gõ số, lúc đã gõ, lúc quá số đang có (báo đỏ), và lúc vượt ngưỡng
   "rất lớn" (hiện ô gõ chữ xác nhận). */
S.screen = 'nhap';
S.nhap.mode = 'chuyen'; one('nhap+chuyen-khu');
S.nhap.mode = 'dc'; S.nhap.khu = 'A'; S.nhap.phi = 'D12'; S.nhap.qty = 0; S.nhap.reason = null;
one('nhap+dieu-chinh+chua-go');
S.nhap.dir = 'giam'; S.nhap.qty = 10; S.nhap.reason = 'dem_sai'; one('nhap+dieu-chinh+giam');
S.nhap.dir = 'tang'; S.nhap.qty = 10; one('nhap+dieu-chinh+tang');
S.nhap.reason = 'khac'; one('nhap+dieu-chinh+ly-do-khac');
// giảm 9999 cây D12 khi khu chỉ có 40: dòng "đang có → còn" phải báo quá số, và vượt ngưỡng tấn
S.nhap.dir = 'giam'; S.nhap.qty = 9999; S.nhap.reason = 'dem_sai'; one('nhap+dieu-chinh+qua-so-va-rat-lon');
S.nhap.qty = 0; S.nhap.reason = null;
// Xuất kho: chỉ có dòng âm và có ô nơi đến riêng, nên vẽ cả lúc chưa gõ và lúc đã gõ số
S.nhap.mode = 'xuat'; S.nhap.khu = 'A'; S.nhap.phi = 'D12'; one('nhap+xuat-kho+chua-go');
S.nhap.qty = 10; one('nhap+xuat-kho+da-go');
S.nhap.qty = 0; S.nhap.mode = 'nhap'; S.nhap.dir = 'giam';

// đăng nhập / đổi PIN lần đầu
S.me = null; S.screen = 'login'; one('login');
S.err = 'PIN không đúng'; one('login+loi'); S.err = '';
S.busy = true; one('login+dang-dang-nhap'); S.busy = false;
S.me = { id: 1, name: 'Nguyễn Văn A', role: 'admin', must_change: 1 }; one('doi-pin-lan-dau');

out.map((r) => r.join(' | ')).join('\\n');
`;
const res = vm.runInContext(T, ctx, { filename: 'smoke' });
console.log(res);
const bad = res.split('\n').filter((l) => l.includes('BAD'));
console.log('\n=== ' + (bad.length ? bad.length + ' MÀN HÌNH CÓ VẤN ĐỀ ===' : 'TẤT CẢ RENDER SẠCH ==='));
process.exit(bad.length ? 1 : 0);
