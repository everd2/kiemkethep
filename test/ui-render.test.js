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
const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10); // giờ Việt Nam như app (UTC thì 0h–7h lệch một ngày)
const yday = new Date(Date.now() + 7 * 3600e3 - 864e5).toISOString().slice(0, 10);
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
    // phiếu kho của sổ vay mượn: thép cho đối tác mượn rời khu A, chờ duyệt
    { id: 16, phi_id: 'D10', khu_id: 'A', qty: -40, note: 'Vay mượn · Cho Cty Đông Á vay: xe 15C', kind: 'vay', grp: 'g5', ts, user_id: 3, uname: 'Thủ kho' },
  ],
  innKhu: [{ khu_id: 'A', phi_id: 'D8', q: 110 }, { khu_id: 'A', phi_id: 'D10', q: -50 }, { khu_id: 'B', phi_id: 'D10', q: 50 }],
  // khu B đã đếm D10 hôm nay; phần còn lại chưa đếm nên vẫn là "chưa được đếm"
  eff: [{ khu_id: 'B', phi_id: 'D10', v: 240, kind: 'dem', ts: Date.now() - 36e5, day: today }],
  // (v70) server không còn gửi mvNew (phiếu cộng lên tồn): tồn = số đếm đã duyệt, chưa có thì tồn chuẩn
  rates: [{ phi_id: 'D8', per_day: 33, days: 28 }, { phi_id: 'D10', per_day: 120, days: 2 }],
  settings: { hide_after_zero_days: 3, max_keep_streak: 3, auto_close: 1, report_slots_per_day: 1 },
};
const review = {
  day: today, last: yday, span: 2, closed: false,
  rows: [
    { phi: 'D8', old: 220, inn: 110, dc: 0, cnt: 180, used: 150, neg: false, high: true, avg: 33, topKhu: 'A', topNet: -40 },
    // điều chỉnh và vay mượn cùng lúc: thẻ đỏ dùng lưới 6 ô, phép tính gọn có cả "(đc)" lẫn "(vay)"
    { phi: 'D14', old: 500, inn: -30, dc: 20, vay: -50, xuat: 0, cnt: 400, used: 70, neg: false, high: true, avg: 10, topKhu: 'A', topNet: -70 },
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

    { type: 'recount', khu: 'C', name: 'Khu C' },
    { type: 'slot_missing', khu: 'C', name: 'Khu C', missing: ['buổi sáng (6h–12h)'] },
    { type: 'receipt_pending', key: 'g1', id: 71, kind: 'nhap', day: today },
    { type: 'receipt_pending', key: 'g3', id: 73, kind: 'dc', day: today },
    { type: 'phi', phi: 'D10', reason: 'neg' },
  ],
  /* Thẻ của từng khu: đủ các trạng thái cần vẽ — chưa báo, chờ duyệt kèm lệch và ô để trống,
     đã duyệt, và khu báo từ NGÀY TRƯỚC (quên chốt) để thử nhãn ngày. */
  khus: [
    { khu: 'A', name: 'Khu A', items: [{ phi: 'D10', ref: 300, mv: 0, exp: 300, cnt: null, d: null, kind: null, duyet: null }], waiting: 0, blank: 0, rep: null, phieu: [], duyet: null },
    { khu: 'B', name: 'Khu B dài tên để thử tràn nút bấm',
      items: [
        { phi: 'D8', ref: 220, mv: 110, exp: 330, cnt: 180, d: -150, kind: 'dem', big: true, blank: false, duyet: false },
        { phi: 'D10', ref: 0, mv: 0, exp: 0, cnt: 200, d: 200, kind: 'dem', big: true, blank: false, duyet: false },
        { phi: 'D12', ref: 40, mv: 0, exp: 40, cnt: 0, d: -40, kind: 'zero', big: false, blank: true, duyet: false },
        { phi: 'D14', ref: 55, mv: 0, exp: 55, cnt: 55, d: 0, kind: 'dem', big: false, blank: false, duyet: false },
      ],
      waiting: 4, blank: 1, rep: { uname: 'Nguyễn Văn B', ts, day: today, conflict: 1, resolved: 0, recount: 0 },
      phieu: ['g1'], duyet: null },
    { khu: 'C', name: 'Khu C', items: [{ phi: 'D10', ref: 100, mv: 0, exp: 100, cnt: 100, d: 0, kind: 'dem', big: false, blank: false, duyet: true }],
      waiting: 0, blank: 0, rep: { uname: 'Trần Thị C', ts, day: yday, conflict: 0, resolved: 0, recount: 1 },
      phieu: [], duyet: { by: 'Admin', ts },
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
    // phiếu kho của sổ vay mượn: thép cho đối tác mượn rời khu A
    { key: 'g5', grp: 'g5', id: 75, day: today, ts, uname: 'Thủ kho', kind: 'vay', note: 'Vay mượn · Cho Cty Đông Á vay',
      lines: [{ phi: 'D10', khu: 'A', qty: -40 }] },
  ],
  pending: 7,
  reports: boot.reports, khu,
  loans: [
    { id: 31, grp: 'L1', doitac_id: 5, doitac_name: 'Cty Đông Á', phi_id: 'D8', kind: 'vay', qty: 22, note: 'hẹn trả T6', ts, user_id: 2, uname: 'An', ngay: yday, han: today, so_bb: 'BB-0456', nguoi: 'anh Hùng', bien_so: '29C-123' },
    { id: 32, grp: 'L1', doitac_id: 5, doitac_name: 'Cty Đông Á', phi_id: 'D10', kind: 'vay', qty: 30, note: 'hẹn trả T6', ts, user_id: 2, uname: 'An' },
  ],
};
review.slot.changed = { at: ts, by: 'Admin' };
const dayData = {
  day: yday, close: { uname: 'Nguyễn Văn A', ts, note: 'An nghỉ chiều', span: 1,
    exc_json: JSON.stringify([{ type: 'slot_missing', khu: 'A', name: 'Khu A', missing: ['buổi chiều (12h–18h)'] }, { type: 'khu_missing', khu: 'B' }]) },
  counts: [{ khu_id: 'A', phi_id: 'D8', v: 220 }], baseline: boot.baseline, prevBaseline: boot.baseline,
  summary: [{ phi_id: 'D8', nhap: 110, dung: 55, dc: 0, xuat: 22, vay: 0, kg: 0.4 }, { phi_id: 'D10', nhap: 0, dung: 120, dc: -30, xuat: 0, vay: -40, kg: 0.62 }],
  reports: boot.reports, receipts: boot.receipts.map((r) => ({ ...r, voided: 0 })),
  lastClose: yday, // là lần chốt gần nhất, nên màn hình bày nút mở lại
};
const repData = {
  rows: [
    { phi: 'D8', dau: 220, nhap: 110, dc: 0, vay: 0, dung: 55, cuoi: 275, dau_kg: 88, nhap_kg: 44, dc_kg: 0, vay_kg: 0, dung_kg: 22, xuat_kg: 0, cuoi_kg: 110 },
    { phi: 'D10', dau: null, nhap: 0, dc: -30, vay: -40, dung: 120, cuoi: null, dau_kg: null, nhap_kg: 0, dc_kg: -18.6, vay_kg: -24.8, dung_kg: 74.4, xuat_kg: 0, cuoi_kg: null },
  ],
  days: [{ day: yday, span: 2, nhap_kg: 4345, dc_kg: -555, vay_kg: -24.8, dung_kg: 7421, ton_kg: 23450 }],
  closedDays: 1, openDay: yday, closeDay: yday, hasDc: true, hasVay: true,
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
  { id: 2, name: 'Trần B', phone: '0902222222', role: 'tieudoi', locked: 1, deleted: 0, must_change: 1 },
  { id: 3, name: 'Phạm D', phone: '0903333333', role: 'cvktht', locked: 0, deleted: 0, must_change: 0 },
  { id: 4, name: 'Lê C', phone: '0904444444', role: 'tieudoi', locked: 0, deleted: 1, must_change: 0 },
];
S.uFirst = 1;
S.usage = [{ day: '${yday}', span: 1, used: { D8: 55, D10: 120 }, kg: { D8: 0.4, D10: 0.62 }, xuat: { D10: 30 } }];
S.hist = { date: '${yday}', data: ${JSON.stringify(dayData)} };
S.bc = { from: '${yday}', to: '${today}', data: ${JSON.stringify(repData)} };
S.subs = { B: [
  { uname: 'Trần B', ts: Date.now() - 7200e3, vals: { D10: 260 } },
  { uname: 'Lê C', ts: Date.now() - 3600e3, vals: { D10: 240 } },
] };
S.khu = 'A';
loadDraft(true);
// sổ sắt vụn: chờ duyệt, đã duyệt, đã huỷ kèm lý do; thống kê theo tháng / khu / nơi nhận
S.svs = { nam: S.boot.today.slice(0, 4), thangNay: S.boot.today.slice(0, 7), noiGan: ['Cty Phế Liệu A', 'Cơ sở Bảy'],
  tong: { n: 3, kg: 13250, nThang: 2, kgThang: 3250, nNam: 3, kgNam: 13250 },
  thang: [{ thang: S.boot.today.slice(0, 7), n: 2, kg: 3250 }, { thang: '2025-12', n: 1, kg: 10000 }],
  khu: [{ khu_id: 'A', n: 2, kg: 12500 }, { khu_id: null, n: 1, kg: 750 }],
  noi: [{ noi: 'Cty Phế Liệu A tên rất dài để thử tràn dòng trên màn hình hẹp', n: 2, kg: 12500 }, { noi: 'Cơ sở Bảy', n: 1, kg: 750 }],
  items: [
    { id: 1, ngay: S.boot.today, khu_id: 'A', kg: 2500, noi: 'Cty Phế Liệu A', so_phieu: 'PC-01', bien_so: '29C-123', nguoi: 'anh Tư', note: 'đầu mẩu', user_id: 2, uname: 'An', cap: 0, ts: Date.now(), duyet_ts: null, voided: 0 },
    { id: 2, ngay: S.boot.today, khu_id: null, kg: 750, noi: 'Cơ sở Bảy', so_phieu: 'PC-02', bien_so: null, nguoi: null, note: null, user_id: 1, uname: 'A', cap: 2, ts: Date.now(), duyet_ts: Date.now(), duyet_uname: 'A', voided: 0 },
    { id: 3, ngay: S.boot.today, khu_id: 'B', kg: 10000, noi: 'Cty Phế Liệu A', so_phieu: 'PC-03', bien_so: null, nguoi: null, note: null, user_id: 2, uname: 'An', cap: 0, ts: Date.now(), duyet_ts: Date.now(), duyet_uname: 'A', voided: 1, voided_uname: 'Trung', voided_note: 'cân lại' },
  ] };
// sổ vay mượn: đủ trạng thái — chờ duyệt (một lần ghi hai phi), đã duyệt, đối tác đã ẩn, dư nợ hai chiều
S.loans = { doitac: [{ id: 5, name: 'Công ty Thép Hoà Bình tên dài để thử tràn dòng', active: 1 }, { id: 6, name: 'Cty Cũ', active: 0 }],
  items: [
    { id: 11, doitac_id: 5, doitac_name: 'Công ty Thép Hoà Bình tên dài để thử tràn dòng', phi_id: 'D8', kind: 'vay', qty: 220, grp: 'g1', user_id: 2, uname: 'An', ts: Date.now(), duyet_ts: null, note: 'xe 29C' },
    { id: 12, doitac_id: 5, doitac_name: 'Công ty Thép Hoà Bình tên dài để thử tràn dòng', phi_id: 'D10', kind: 'vay', qty: 40, grp: 'g1', user_id: 2, uname: 'An', ts: Date.now(), duyet_ts: null },
    { id: 9, doitac_id: 6, doitac_name: 'Cty Cũ', phi_id: 'D10', kind: 'cho_vay', qty: 20, grp: 'g0', user_id: 1, uname: 'A', ts: Date.now() - 864e5, duyet_ts: Date.now() - 864e5, duyet_uname: 'A' },
  ],
  agg: [{ doitac_id: 5, phi_id: 'D8', kind: 'vay', q: 330 }, { doitac_id: 6, phi_id: 'D10', kind: 'cho_vay', q: 20 }] };
S.loan.doitac = 5; S.loan.lines = [{ phi: 'D10', qty: 30 }];
S.boot.loanPending = 1; S.boot.loanDuyet = 1;
// gia công cấu kiện: đơn đủ trạng thái (mới giao, đang làm và đang vướng, trễ hạn, đã xong, đã huỷ), một đơn đang mở, một đơn đang soạn
S.gc = { tdt: [{ id: 2, name: 'Trần B' }, { id: 7, name: 'Vũ E chưa có đơn' }],
  muc: { khu: [{ id: 1, ten: 'Khu A' }, { id: 2, ten: 'Tháp T1 tên dài để thử tràn dòng' }], hm: [{ id: 3, ten: 'Phần thân' }], ck: [{ id: 4, ten: 'Dầm' }, { id: 5, ten: 'Cột' }, { id: 6, ten: 'Cầu thang' }] }, items: [
  { id: 31, cau_kien: 'Dầm D3 tên rất dài để thử tràn dòng trên màn hình hẹp', hang_muc: 'Phần thân', phan_khu: 'Khu A', tang: '5', truc: 'X12-X17 / Y3-Y5', noi_dung: '2,4 tấn; D16 × 120 thanh', user_id: 2, uname: 'Trần B', han: '${today}', buoi: 'chieu', tt: 'lam', pct: 50, vuong: 'Thiếu D16', giao_by: 1, giao_name: 'Nguyễn Văn A', ts: Date.now() - 864e5, cap_ts: Date.now(), xong_ts: null, huy_ly_do: null },
  { id: 32, cau_kien: 'Cột C2', hang_muc: null, truc: null, noi_dung: null, user_id: 2, uname: 'Trần B', han: '${yday}', buoi: null, tt: 'moi', pct: 0, vuong: null, giao_by: 1, giao_name: 'Nguyễn Văn A', ts: Date.now() - 2 * 864e5, cap_ts: Date.now() - 2 * 864e5, xong_ts: null, huy_ly_do: null },
  { id: 33, cau_kien: 'Sàn tầng 4', hang_muc: 'Khối B', truc: 'X1-X4', noi_dung: null, user_id: 1, uname: 'Nguyễn Văn A', han: '${yday}', buoi: 'sang', tt: 'xong', pct: 100, vuong: null, giao_by: 3, giao_name: 'Phạm D', ts: Date.now() - 3 * 864e5, cap_ts: Date.now() - 3600e3, xong_ts: Date.now() - 3600e3, huy_ly_do: null },
  { id: 34, cau_kien: 'Móng M1', hang_muc: null, truc: 'X2 / Y2', noi_dung: null, user_id: 2, uname: 'Trần B', han: '${today}', buoi: null, tt: 'huy', pct: 25, vuong: null, giao_by: 1, giao_name: 'Nguyễn Văn A', ts: Date.now() - 864e5, cap_ts: Date.now() - 7200e3, xong_ts: null, huy_ly_do: 'Đổi thiết kế' },
] };
S.gcId = 31;
S.gcDetail = { don: S.gc.items[0], log: [
  { id: 3, ts: Date.now(), viec: 'vuong', pct: 50, note: 'Thiếu D16', uname: 'Trần B' },
  { id: 2, ts: Date.now() - 3600e3, viec: 'tiendo', pct: 50, note: null, uname: 'Trần B' },
  { id: 1, ts: Date.now() - 7200e3, viec: 'nhan', pct: 0, note: null, uname: 'Trần B' },
] };
S.gcForm = { id: null, user: 2, buoi: 'sang', ck: 'Dầm', khu: 'Khu A', hm: '', trucTu: false };
S.boot.gc = S.gc.items.filter(gcMo).map((d) => ({ user_id: d.user_id, tt: d.tt, han: d.han, vuong: d.vuong }));
// quân số đầu ca: tổ chia hai ca (đã báo cả hai), tổ làm ca đêm (cấp trên ghi thay), tổ chưa báo có lần báo trước, tổ chưa báo lần nào
S.boot.qs = { hien: { ngay: '${today}', ca: 1 }, ke: { ngay: '${today}', ca: 2 }, den: Date.now() + 1800e3, han: Date.now() - 600e3, hanKe: Date.now() + 3600e3,
  to: [{ id: 1, name: 'Nguyễn Văn A', da: false, daKe: false, ca: [] }, { id: 2, name: 'Trần B', da: true, daKe: true, ca: [1, 2] }, { id: 7, name: 'Vũ E', da: false, daKe: false, ca: [1] }, { id: 8, name: 'Lê G', da: false, daKe: false, ca: [2] }] };
S.qs = { ngay: '${today}', ca: 1, hien: { ngay: '${today}', ca: 1 }, ke: { ngay: '${today}', ca: 2 }, gio: { tu: Date.now() - 3600e3, den: Date.now() + 3600e3 }, han: Date.now() - 600e3, hanPhut: [420, 1155], lyDo: QS_LY_DO, 
  chon: [{ ngay: '${today}', ca: 1, gio: { tu: Date.now() - 3600e3, den: Date.now() + 3600e3 }, han: Date.now() - 600e3, row: { ngay: '${today}', ca: 1, tong: 19, lam: 8, ca_kia: 10, nghi: { om: 1 }, ghi_chu: null, ts: Date.now() } },
    { ngay: '${today}', ca: 2, gio: { tu: Date.now() + 3600e3, den: Date.now() + 13 * 3600e3 }, han: Date.now() + 2 * 3600e3, row: null }],
  tdt: [{ id: 2, name: 'Trần B' }, { id: 7, name: 'Vũ E tên rất dài để thử tràn dòng trên màn hình hẹp' }, { id: 8, name: 'Lê G' }, { id: 9, name: 'Tổ chưa báo lần nào' }],
  rows: [
    { ngay: '${today}', ca: 1, user_id: 2, tong: 19, lam: 8, ca_kia: 10, nghi: { om: 1 }, ghi_chu: null, ts: Date.now(), by_id: 2, uname: 'Trần B', by_name: 'Trần B' },
    { ngay: '${today}', ca: 2, user_id: 2, tong: 19, lam: 9, ca_kia: 9, nghi: { gd: 1, khac: 1 }, ghi_chu: 'chăm bố ốm', ts: Date.now(), by_id: 2, uname: 'Trần B', by_name: 'Trần B' },
    { ngay: '${today}', ca: 1, user_id: 7, tong: 21, lam: 0, ca_kia: 21, nghi: {}, ghi_chu: null, ts: Date.now(), by_id: 1, uname: 'Vũ E tên rất dài để thử tràn dòng trên màn hình hẹp', by_name: 'Nguyễn Văn A' },
  ],
  truoc: [{ user_id: 2, ngay: '${yday}', ca: 2, tong: 19, lam: 9, ca_kia: 9 }, { user_id: 8, ngay: '${yday}', ca: 1, tong: 20, lam: 17, ca_kia: 0 }] };
S.bcc = { ngay: S.boot.today, ca: 1, hien: { ngay: S.boot.today, ca: 1 }, ke: { ngay: S.boot.today, ca: 2 }, gio: { tu: Date.parse(S.boot.today + 'T06:30:00+07:00'), den: Date.parse(S.boot.today + 'T18:30:00+07:00') }, lyDo: QS_LY_DO, tdt: [{ id: 2, name: 'Trần B' }, { id: 7, name: 'Vũ E tên rất dài để thử tràn dòng trên màn hình hẹp' }], qs: [{ ca: 1, user_id: 2, tong: 19, lam: 8, ca_kia: 10, nghi: { om: 1, khac: 1 }, ghi_chu: 'chăm bố ốm', uname: 'Trần B' }], truoc: [], don: [{ id: 1, cau_kien: 'Dầm sàn chéo', hang_muc: null, phan_khu: 'KDC', tang: '7', cote: null, truc: 'X17-X20', user_id: 2, han: S.boot.today, buoi: null, tt: 'lam', pct: 80, vuong: 'Thiếu thép: D16', xong_ts: null }], nguoi: [{ id: 3, name: 'Phạm D', role: 'cvktht' }], mau: { dau: { don_vi: 'Trung đoàn XD 01', ddt: '', tdtr: '', cbpt: 'Phạm D', du_an: 'Olympic', khu_vuc: '' }, mmtb: '7 máy', kt: ['Dọn dẹp: tốt'] }, bao: { muc: {}, van_ban: 'x', ts: Date.now(), by_name: 'Phạm D' }, suaDuoc: true }; S.bcM = { s5: '7 máy – 3 Kato' }; S.bcDau = { ...S.bcc.mau.dau }; S.bcDauMo = true;

// chi tiết công nợ một đối tác: có cả lần chờ, lần đã huỷ, hai chiều nợ
S.loanDt = 5;
S.loanDetail = { chiTiet: true, doitac: [{ id: 5, name: 'Công ty Thép Hoà Bình tên dài để thử tràn dòng', active: 1 }],
  agg: [{ phi_id: 'D8', kind: 'vay', q: 330 }, { phi_id: 'D8', kind: 'tra_vay', q: 110 }, { phi_id: 'D10', kind: 'cho_vay', q: 20 }, { phi_id: 'D10', kind: 'tra_no', q: 30 }],
  items: S.loans.items.map((x) => ({ ...x, voided: 0 })).concat([{ id: 8, doitac_id: 5, doitac_name: 'X', phi_id: 'D8', kind: 'vay', qty: 11, grp: 'g8', user_id: 2, uname: 'An', ts: Date.now() - 864e5, duyet_ts: null, voided: 1 }]) };
// thống kê quân số: tổ tự báo, số thiết lập chép lúc hết ca, ca thiếu số, một tổ đã xoá, có lý do khác
{ const d0 = S.boot.today, d1 = congNgay(S.boot.today, -1), t0 = congNgay(S.boot.today.slice(0, 7) + '-01', -3);
  S.tk = { tu: t0, den: d0, lyDo: QS_LY_DO, nguong: 15, to: [{ id: 2, name: 'Trần B', deleted: 0 }, { id: 3, name: 'Tổ tên rất dài để thử tràn dòng của tổ', deleted: 0 }, { id: 4, name: 'Lê C', deleted: 0 }],
    qs: [{ ngay: d0, ca: 1, u: 2, tong: 20, lam: 16, nghi: { om: 2, off: 1, khac: 1 }, ghi_chu: 'đi khám' }, { ngay: d1, ca: 1, u: 2, tong: 20, lam: 20, nghi: {}, ghi_chu: null },
      { ngay: d0, ca: 2, u: 3, tong: 30, lam: 21, nghi: { phep: 5, que: 4 }, ghi_chu: null }, { ngay: t0, ca: 1, u: 2, tong: 20, lam: 19, nghi: { gd: 1 }, ghi_chu: null }, { ngay: d0, ca: 1, u: 9, tong: 5, lam: 5, nghi: {}, ghi_chu: null }],
    tl: [{ ngay: d1, ca: 2, u: 3, tong: 30, lam: 28, nghi: { om: 2 }, ghi_chu: null }, { ngay: d1, ca: 1, u: 4, tong: null, lam: null, nghi: {}, ghi_chu: null }] }; }
const SCREENS = ['home','khu','dem','nhap','ton','duyet','nhatky','lichsu','baocao','stats','more','pin','users','settings','vaymuon','vaychitiet','satvun','giacong','gcdon','gcform','gcsetup','quanso','baocaoca','qstk','sanluong'];
const out = [];
function one(label) {
  render();
  const h = $app.innerHTML;
  out.push([label, h.length, /undefined|NaN|\\[object Object\\]/.test(h) ? 'BAD:' + (h.match(/.{0,40}(undefined|NaN|\\[object Object\\]).{0,40}/) || [''])[0] : 'ok']);
}
for (const sc of SCREENS) { S.screen = sc; one(sc); }
S.screen = 'baocaoca'; S.bcV = null; S.bcMo = 's4'; one('baocaoca+muc4-theo-dong'); S.bcvMo = true; one('baocaoca+muc4-them-viec'); S.bcvMo = false; S.bcMo = null;
S.sl = { ngay: S.boot.today, hom: '2026-01-01', gioi_han: { chuan: { min: 1, max: 1000 }, gia: { min: 0.2, max: 1 }, gc: { min: 0.5, max: 1 } }, tl: { chuan: 158, gia: 0.2, gc: { 2: 0.75, 4: 0.7 }, da_dat: [2] },
  dau: { don_vi: 'Đại đội 1.1.6', ddt: '', tdtr: '', cbpt: '', du_an: 'Dự án A', khu_vuc: '' }, luu: null, bc: [{}, {}],
  to: [{ id: 2, name: 'Trần B', ngay: { ngay: S.boot.today, tong: 21, lam: 18, nguon: 'bao' }, dem: null, lam: 18, tong: 21 }, { id: 4, name: 'Lê D', ngay: null, dem: { ngay: '2026-01-01', tong: 19, lam: 9, nguon: 'tl' }, lam: 9, tong: 19 }] };
S.screen = 'sanluong'; one('sanluong'); S.slTlMo = true; one('sanluong+thiet-lap'); S.slTlMo = false; S.form['slc_2'] = '2x'; one('sanluong+cong-loi'); delete S.form['slc_2']; S.sl = null;
S.screen = 'qstk'; S.tkCa = 2; one('qstk+ca-dem'); S.tkCa = 0; S.tkTo = 2; S.tkNgay = S.boot.today; one('qstk+mot-to'); S.tkTo = 4; one('qstk+to-thieu-so'); S.tkTo = null; S.tkNgMo = true; one('qstk+doi-nguong'); S.tkNgMo = false; one('qstk+chon-ngay'); S.tkNgay = null;
{ const me0 = S.me; S.me = { id: 2, name: 'Trần B', role: 'tieudoi' }; one('qstk+tieu-doi-truong'); S.me = me0; }
// bảng quân số đang xếp thứ tự tổ, và thẻ báo của tổ trưởng đang mở phần người nghỉ + dòng ca kia
S.screen = 'quanso'; S.qsSx = S.qs.tdt.map((u) => u.id); one('quanso+xep-thu-tu'); S.qsSx = null;
{ const me0 = S.me; S.me = { id: 2, name: 'Trần B', role: 'tieudoi' }; S.boot.qs.toi = { tong: 19, hien: null, ke: null, truocHien: { ngay: S.boot.today, ca: 1, tong: 19, lam: 8, ca_kia: 10, nghi: { om: 1 }, ghi_chu: null }, truocKe: null, coDinh: 0 }; S.qsH = null; qhState().mo = true; qhState().nghi = { om: 2, khac: 1 }; S.screen = 'home'; one('home+the-quan-so-mo'); S.boot.qs.toi.coDinh = 1; S.qsH = null; one('home+the-quan-so-ca-co-dinh'); S.qsH = null; delete S.boot.qs.toi; S.me = me0; }

// các trạng thái đặc biệt
S.screen = 'dem'; S.sel = 'D8'; fillSel('D8'); one('dem+ban-so-D8');
S.sel = 'D10'; fillSel('D10'); S.bo = '12'; S.le = '7'; one('dem+dang-go-D10');
S.sel = null; S.zoomK = 'B'; one('dem+phong-to-khu'); S.zoomK = null;
S.draftWarn = { uname: 'Trần B', ts: Date.now() }; one('dem+nhap-trung'); S.draftWarn = null;
S.khu = 'B'; loadDraft(true); one('dem+khu-da-co-nguoi-bao'); S.khu = 'A'; loadDraft(true);
S.legend = true; one('dem+chu-thich'); S.legend = false;
S.toast = 'Đã gửi báo cáo'; S.toastErr = false; one('dem+toast');
// quân số đầu ca dưới mắt Tiểu đội trưởng: màn xem tổ mình đã báo, thẻ nhắc ở Tổng quan (quá hạn ca này + ca sắp tới)
{ const me0 = S.me, sc0 = S.screen;
  S.me = { id: 2, name: 'Trần B', role: 'tieudoi' }; S.screen = 'quanso'; one('quanso+to-minh-da-bao');
  S.me = { id: 1, name: 'Nguyễn Văn A', role: 'tieudoi' }; S.screen = 'home'; one('home+nhac-quan-so');
  S.me = me0; S.screen = sc0; }
S.screen = 'home'; one('home+toast'); S.toast = '';
S.busy = true; S.busyMsg = 'Đang lưu...'; one('home+dang-luu'); S.busy = false;
S.ask = { msg: 'Chốt ngày hôm nay?\\nSố đếm thành tồn chuẩn mới.', ok: 'CHỐT NGÀY', danger: false, resolve: () => {} };
one('home+hop-xac-nhan'); S.ask = null;
S.stale = Date.now() - 6e5; one('home+mat-ket-noi'); S.stale = null;
navigator.onLine = false; one('home+offline'); navigator.onLine = true;
S.netBad = true; one('home+chua-cap-nhat'); S.netBad = false;
S.boot.closed = true; S.screen = 'duyet'; S.review.closed = true; one('duyet+da-chot');
// ngày deploy mà admin đã lỡ chốt tay: khoá, nhưng KHÔNG có nút hoàn tác đặt lại số liệu
render();
{ const h = $app.innerHTML; out.push(['duyet+chot-cu', h.length, h.includes('Sổ hôm nay đã chốt') && !h.includes('HOÀN TÁC') ? 'ok' : 'BAD:ngày chốt kiểu cũ']); }
S.boot.closedReset = true;
// ngày bị khoá chỉ còn vì đặt lại số liệu: Duyệt có nút hoàn tác, không có nút chốt
render();
{ const h = $app.innerHTML; out.push(['duyet+dat-lai', h.length, h.includes('HOÀN TÁC ĐẶT LẠI SỐ LIỆU') && !h.includes('data-a="close"') ? 'ok' : 'BAD:màn Duyệt ngày đặt lại']); }
S.screen = 'dem'; render();
{ const h = $app.innerHTML; out.push(['dem+dat-lai', h.length, h.includes('vừa đặt lại số liệu') && h.includes('btn full dis" data-a="send"') ? 'ok' : 'BAD:màn Báo cáo ngày đặt lại']); }
S.boot.closed = false; S.boot.closedReset = false; S.review.closed = false;
// đếm 2 lần/ngày: lần báo của khung trước chỉ để xem, không có nút "Dùng"
{ const giuSlot = S.review.slot, giuSubs = S.subs;
  const t = (h) => Date.parse(S.boot.today + 'T' + h + ':00+07:00');
  S.review.slot = { n: 2, defs: [{ i: 0, from: 6, to: 12, label: 'buổi sáng (6h–12h)' }, { i: 1, from: 12, to: 18, label: 'buổi chiều (12h–18h)' }], changed: null };
  S.subs = { B: [{ uname: 'Duy', ts: t('10:39'), vals: { D12: 0 } }, { uname: 'Lý', ts: t('14:37'), vals: { D12: 18560 } }] };
  S.screen = 'duyet'; render(); const h = $app.innerHTML;
  out.push(['duyet+lan-bao-khung-truoc', h.length, h.includes('khung trước') && !h.includes('data-a="spick"') ? 'ok' : 'BAD:lần báo buổi sáng vẫn có nút Dùng']);
  S.subs = { B: [{ uname: 'Duy', ts: t('13:00'), vals: { D12: 18000 } }, { uname: 'Lý', ts: t('14:37'), vals: { D12: 18560 } }] }; render();
  out.push(['duyet+lan-bao-cung-khung', 0, $app.innerHTML.includes('data-a="spick"') ? 'ok' : 'BAD:cùng khung mà không cho chọn']);
  S.review.slot = giuSlot; S.subs = giuSubs; }
// thống kê báo cáo (mục của màn Nhật ký): người thiếu buổi mang nhãn đỏ, chạm mở ra thấy ngày nào, khu nào
S.cc = { days: 7, mo: { u2: true, kC: true }, data: { from: S.boot.today, to: S.boot.today, ngay: 1,
  nguoi: [{ id: 2, name: 'An', lan: 1, ngay: 1, phai: 4, tu: 1, thay: 2, soThieu: 1, thieu: [{ day: S.boot.today, khu: 'A', buoi: ['buổi chiều (12h–18h)'], cung: ['Bình'] }] },
          { id: 3, name: 'Bình', lan: 2, ngay: 1, phai: 2, tu: 2, thay: 0, soThieu: 0, thieu: [] }],
  khu: [{ khu: 'C', name: 'Khu C', phai: 2, khongPt: 1, soThieu: 2, thieu: [{ day: S.boot.today, buoi: ['buổi sáng (6h–12h)', 'buổi chiều (12h–18h)'], pt: [] }] }] } };
S.audit = []; S.logTab = 'tk'; S.screen = 'nhatky'; render();
{ const h = $app.innerHTML; const thieu = ['Thiếu 1 buổi', 'cùng phụ trách: Bình', 'không ai phụ trách', 'không người phụ trách', '>Đủ<', '1/2 người thiếu buổi', '1/1 khu thiếu buổi', 'Tự báo 1/4 buổi', 'data-a="logtab" data-v="log"', 'data-a="ccdays"'].filter((x) => !h.includes(x));
  out.push(['chamcong', h.length, thieu.length ? 'BAD:thiếu ' + thieu.join(' | ') : 'ok']); }
S.cc.data = { from: S.boot.today, to: S.boot.today, ngay: 0, nguoi: [], khu: [] }; render();
out.push(['chamcong+trong', 0, $app.innerHTML.includes('Chưa có ngày nào đã chốt') ? 'ok' : 'BAD:chấm công trống']);
S.logTab = 'log'; render();
out.push(['nhatky+hai-muc', 0, $app.innerHTML.includes('data-a="logtab" data-v="tk"') && $app.innerHTML.includes('id="logq"') && !$app.innerHTML.includes('Theo người') ? 'ok' : 'BAD:mục Nhật ký thiếu nút sang Thống kê hoặc lẫn nội dung']);
S.screen = 'more'; render();
out.push(['more+chamcong', 0, !$app.innerHTML.includes('data-s="chamcong"') && $app.innerHTML.includes('data-s="nhatky">Nhật ký hoạt động</button>') ? 'ok' : 'BAD:màn Thêm còn lối Chấm công riêng, hoặc thiếu mục Nhật ký hoạt động']);
S.screen = 'duyet';
// bảng "phi bình thường" mở ra: đây là chỗ in phép tính gọn, có cả phi bị sửa sổ
S.screen = 'duyet'; S.showNormal = true; one('duyet+phi-binh-thuong'); S.showNormal = false;
// các phần mới phải THẬT SỰ hiện ra, không chỉ "không lỗi"
S.screen = 'duyet'; render();
{ const h = $app.innerHTML; const thieu = ['Sổ vay mượn chờ duyệt', 'Vay của Cty Đông Á', 'BB BB-0456', 'xe 29C-123', 'anh Hùng', 'hẹn trả ', 'Khung giờ đếm vừa đổi hôm nay', 'Vay mượn · ', 'Phiếu kho của sổ vay mượn'].filter((x) => !h.includes(x));
  out.push(['duyet+vay-muon', h.length, thieu.length ? 'BAD:thiếu ' + thieu.join(' | ') : 'ok']); }
S.screen = 'lichsu'; render();
{ const h = $app.innerHTML; out.push(['lichsu+treo', h.length, h.includes('Lúc chốt còn: Khu A thiếu lần đếm buổi chiều') && h.includes('Vay mượn −') ? 'ok' : 'BAD:không nói việc còn treo / vay mượn']); }
S.screen = 'baocao'; render();
{ const h = $app.innerHTML; out.push(['baocao+vay', h.length, h.includes('<th>Vay mượn</th>') ? 'ok' : 'BAD:thiếu cột Vay mượn']); }
// bảng so sánh hai người báo: số theo đúng đơn vị (D8 là cuộn, không phải số phần)
S.screen = 'duyet'; S.cmp = { khu: 'B', pick: {}, data: { a: { uname: 'An', ts: Date.now() }, b: { uname: 'Bình', ts: Date.now() }, diffs: [{ phi: 'D8', a: 22, b: 33 }] } }; render();
{ const h = $app.innerHTML; out.push(['duyet+so-sanh', h.length, h.split('data-a="cpick"').slice(1).filter((x) => x.split('</button>')[0].includes('cuộn')).length === 2 && !h.includes('>22</button>') ? 'ok' : 'BAD:so sánh hai người báo hiện số thô']); }
S.cmp = null;
// khu thiếu khung đếm: thẻ khu phải nói khung nào thiếu, khung nào đã đếm, và lần gửi muộn
S.screen = 'duyet'; render();
{ const h = $app.innerHTML; out.push(['duyet+nut-chot', h.length,
  !h.includes('data-a="close"') && h.includes('tự chốt sau 0h') && h.includes('D8 +1,1 cuộn') ? 'ok' : 'BAD:không còn nút chốt / phiếu chờ của khu']); }
// báo cáo chưa duyệt chuyển từ hôm qua: thẻ khu nói rõ ngày đếm, không tính là "đã báo hôm nay"
{ const kq = Object.keys(S.boot.rm)[0]; const r0 = S.boot.rm[kq]; const giu = r0.ts, xd = r0.conflict; r0.conflict = 0; r0.ts = Date.parse(S.boot.today + 'T17:00:00+07:00') - 864e5;
  S.screen = 'home'; render(); const h = $app.innerHTML;
  out.push(['home+bao-tu-hom-qua', h.length, h.includes('báo ngày ') && !daBaoHomNay(kq) ? 'ok' : 'BAD:báo cáo chuyển từ hôm qua']);
  r0.ts = giu; r0.conflict = xd; S.screen = 'duyet'; }
{ S.screen = 'home'; render(); const h = $app.innerHTML; out.push(['tab-bao-cao', h.length, />Báo cáo</.test(h) && !/>Đếm</.test(h) ? 'ok' : 'BAD:tab Đếm chưa đổi thành Báo cáo']); S.screen = 'duyet'; render(); }
{ const h = $app.innerHTML; out.push(['duyet+thieu-khung', h.length,
  ['✗</b><b>Sáng</b>', '✓</b><b>Chiều</b>', '>thiếu<', 'Gửi muộn', 'mỗi khu đếm 2 lần/ngày'].every((x) => h.includes(x)) && !h.includes('Lần đếm hôm nay')
    ? 'ok' : 'BAD:thiếu dòng khung giờ']); }

// trạng thái đang tải và tải lỗi
for (const [sc, k] of [['duyet','review'],['nhatky','audit'],['users','users'],['stats','usage'],['vaymuon','loans'],['vaychitiet','loanDetail'],['satvun','svs'],['giacong','gc'],['gcdon','gcDetail'],['gcform','gc'],['gcsetup','gc'],['quanso','qs'],['baocaoca','bcc'],['qstk','tk']]) {
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
S.me.role = 'tieudoi'; S.boot.user.role = 'tieudoi';
for (const sc of ['home','more','dem','ton']) { S.screen = sc; one('tieudoi:' + sc); }
S.me.role = 'cvktht'; S.screen = 'nhap'; one('cvktht:nhap');
S.me.role = 'admin';

/* Màn Nhập có bốn chế độ dùng chung một hàm vẽ, nên phải render cả bốn. Chế độ Điều chỉnh còn phải
   vẽ được ở hai chiều, lúc chưa gõ số, lúc đã gõ, lúc nhiều hơn số đang có (v70: không báo đỏ, phiếu không đổi tồn), và lúc vượt ngưỡng
   "rất lớn" (hiện ô gõ chữ xác nhận). */
S.screen = 'nhap';
S.nhap.mode = 'chuyen'; one('nhap+chuyen-khu');
S.nhap.mode = 'dc'; S.nhap.khu = 'A'; S.nhap.phi = 'D12'; S.nhap.qty = 0; S.nhap.reason = null;
one('nhap+dieu-chinh+chua-go');
S.nhap.dir = 'giam'; S.nhap.qty = 10; S.nhap.reason = 'dem_sai'; one('nhap+dieu-chinh+giam');
S.nhap.dir = 'tang'; S.nhap.qty = 10; one('nhap+dieu-chinh+tang');
S.nhap.reason = 'khac'; one('nhap+dieu-chinh+ly-do-khac');
// giảm 9999 cây D12 khi khu chỉ có 40: dòng "đang có" vẫn vẽ được (không còn báo quá số), và vượt ngưỡng tấn
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
