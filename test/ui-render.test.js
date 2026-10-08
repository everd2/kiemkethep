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
  ],
  innKhu: [{ khu_id: 'A', phi_id: 'D8', q: 110 }, { khu_id: 'A', phi_id: 'D10', q: -50 }, { khu_id: 'B', phi_id: 'D10', q: 50 }],
  // khu B đã đếm D10 hôm nay; phần còn lại chưa đếm nên vẫn là "chưa được đếm"
  eff: [{ khu_id: 'B', phi_id: 'D10', v: 240, kind: 'dem', ts: Date.now() - 36e5, day: today }],
  mvNew: [{ khu_id: 'A', phi_id: 'D8', q: 110 }, { khu_id: 'A', phi_id: 'D10', q: -50 }],
  rates: [{ phi_id: 'D8', per_day: 33, days: 28 }, { phi_id: 'D10', per_day: 120, days: 2 }],
  settings: { hide_after_zero_days: 3, max_keep_streak: 3, auto_close: 1 },
};
const review = {
  day: today, last: yday, span: 2, closed: false,
  rows: [
    { phi: 'D8', old: 220, inn: 110, cnt: 180, used: 150, neg: false, high: true, avg: 33, topKhu: 'A', topNet: -40 },
    { phi: 'D10', old: 560, inn: 0, cnt: 600, used: -40, neg: true, high: false, avg: 120, topKhu: 'B', topNet: 40 },
    { phi: 'D12', old: 40, inn: 0, cnt: 40, used: 0, neg: false, high: false, avg: 5, topKhu: null, topNet: 0 },
  ],
  exceptions: [
    { type: 'khu_missing', khu: 'A', name: 'Khu A' },
    { type: 'khu_pending', khu: 'B', name: 'Khu B dài tên để thử tràn nút bấm', n: 3, blank: 1 },
    { type: 'conflict', khu: 'B', name: 'Khu B dài tên để thử tràn nút bấm' },
    { type: 'recheck', khu: 'B', name: 'Khu B dài tên để thử tràn nút bấm' },
    { type: 'recount', khu: 'C', name: 'Khu C' },
    { type: 'receipt_pending', key: 'g1', id: 71, kind: 'nhap', day: today },
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
      recheck: false, phieu: [], duyet: { by: 'Admin', ts } },
  ],
  phieu: [
    { key: 'g1', grp: 'g1', id: 71, day: today, ts, uname: 'Thủ kho', kind: 'nhap', note: 'xe 12A',
      lines: [{ phi: 'D8', khu: 'B', qty: 110 }] },
    { key: 'g2', grp: 'g2', id: 72, day: yday, ts, uname: 'Thủ kho', kind: 'chuyen', note: '',
      lines: [{ phi: 'D10', khu: 'A', qty: -50 }, { phi: 'D10', khu: 'B', qty: 50 }] },
  ],
  pending: 6,
  reports: boot.reports, khu,
};
const dayData = {
  day: yday, close: { uname: 'Nguyễn Văn A', ts, note: 'bình thường', span: 1 },
  counts: [{ khu_id: 'A', phi_id: 'D8', v: 220 }], baseline: boot.baseline, prevBaseline: boot.baseline,
  summary: [{ phi_id: 'D8', nhap: 110, dung: 55 }, { phi_id: 'D10', nhap: 0, dung: 120 }],
  reports: boot.reports, receipts: boot.receipts.map((r) => ({ ...r, voided: 0 })),
};
const repData = {
  rows: [
    { phi: 'D8', dau: 220, nhap: 110, dung: 55, cuoi: 275 },
    { phi: 'D10', dau: null, nhap: 0, dung: 120, cuoi: null },
  ],
  days: [{ day: yday, span: 2, nhap_kg: 4345, dung_kg: 7421, ton_kg: 23450 }],
  closedDays: 1, openDay: yday, closeDay: yday,
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
];
S.users = [
  { id: 1, name: 'Nguyễn Văn A', phone: '0901234567', role: 'admin', locked: 0, must_change: 0 },
  { id: 2, name: 'Trần B', phone: '0902222222', role: 'nguoidem', locked: 1, must_change: 1 },
];
S.usage = [{ day: '${yday}', span: 1, used: { D8: 55, D10: 120 } }];
S.hist = { date: '${yday}', data: ${JSON.stringify(dayData)} };
S.bc = { from: '${yday}', to: '${today}', data: ${JSON.stringify(repData)} };
S.subs = { B: [
  { uname: 'Trần B', ts: Date.now() - 7200e3, vals: { D10: 260 } },
  { uname: 'Lê C', ts: Date.now() - 3600e3, vals: { D10: 240 } },
] };
S.khu = 'A';
loadDraft(true);

const SCREENS = ['home','khu','dem','nhap','ton','duyet','nhatky','lichsu','baocao','stats','more','pin','users','settings'];
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

// trạng thái đang tải và tải lỗi
for (const [sc, k] of [['duyet','review'],['nhatky','audit'],['users','users'],['stats','usage']]) {
  S.screen = sc; const bak = S[k]; S[k] = null;
  one(sc + '+dang-tai');
  S.loadErr[sc] = 'Không có kết nối mạng'; one(sc + '+loi-tai'); delete S.loadErr[sc];
  S[k] = bak;
}
S.screen = 'lichsu'; S.hist.data = null; one('lichsu+dang-tai');
S.loadErr.lichsu = 'Lỗi 500'; one('lichsu+loi-tai'); delete S.loadErr.lichsu;
S.screen = 'baocao'; S.bc.data = null; one('baocao+dang-tai');

// hàng chờ gửi khi mất mạng
writePending([
  { khu: 'A', day: '${yday}', items: [{ phi: 'D8', v: 220, kind: 'dem', bo: 20, le: 0 }], ts: Date.now() - 9e5, err: 'Đã sang ngày mới' },
  { khu: 'C', day: '${today}', items: [], ts: Date.now() },
]);
S.screen = 'home'; one('home+hang-cho-gui');

// vai trò khác
S.me.role = 'nguoidem'; S.boot.user.role = 'nguoidem';
for (const sc of ['home','more','dem','ton']) { S.screen = sc; one('nguoidem:' + sc); }
S.me.role = 'thukho'; S.screen = 'nhap'; one('thukho:nhap');
S.me.role = 'admin';

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
