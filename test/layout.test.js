/* Kiểm tra bố cục cuộn.
   #app là flex column, chiều cao bằng khung nhìn, overflow:hidden. Luật để mọi nội dung đều xem được:
   - mỗi màn có ĐÚNG MỘT vùng cuộn (.f1.scroll hoặc #mx);
   - mọi con trực tiếp khác của #app phải có flex:none, nếu không nó sẽ bị bóp và cắt mất chữ;
   - không dùng 100vh cho #app (trình duyệt cũ tính 100vh = khung không có thanh địa chỉ nên đáy bị mất);
   - có đường lùi cho màn hình thấp, nếu không vùng cuộn bị bóp về 0 và người dùng không thấy gì. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = process.argv[2] || '.';
const code = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'public/style.css'), 'utf8');

const T = [];
const ok = (name, cond, extra) => T.push([cond ? 'PASS' : 'FAIL', name, extra === undefined ? '' : String(extra)]);

/* ---------- môi trường giả ---------- */
const mk = (id) => ({ id, tagName: 'INPUT', value: '', scrollTop: 0, dataset: {}, style: {}, focus() {}, remove() {}, click() {}, setSelectionRange() {}, querySelector: () => null, appendChild() {}, closest: () => null, set innerHTML(v) { this._h = v; }, get innerHTML() { return this._h || ''; } });
const app = mk('app');
const store = {};
const ctx = {
  console, Date, Math, JSON, String, Number, Object, Array, Set, Map, parseInt, parseFloat, isNaN, Promise, RegExp, Error,
  encodeURIComponent, URL: { createObjectURL: () => '' }, setTimeout: () => 0, clearTimeout: () => {},
  localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; }, key: (i) => Object.keys(store)[i] || null, get length() { return Object.keys(store).length; } },
  navigator: { onLine: true }, history: { state: null, pushState() {}, replaceState() {} },
  fetch: () => Promise.reject(new TypeError('x')),
  document: { activeElement: null, body: { appendChild() {} }, createElement: () => mk('t'), getElementById: (id) => (id === 'app' ? app : null), querySelectorAll: () => [], addEventListener() {} },
  window: { addEventListener() {} },
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(code, ctx);

const today = new Date().toISOString().slice(0, 10);
const yday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
const ts = Date.now() - 36e5;
const phi = [
  { id: 'D6', kg_per_cay: 20, bo_size: 100, min_stock: 200, unit: 'cuon', active: 1 },
  { id: 'D8', kg_per_cay: 20, bo_size: 100, min_stock: 200, unit: 'cuon', active: 1 },
  { id: 'D10', kg_per_cay: 7.22, bo_size: 440, min_stock: 440, unit: 'cay', active: 1 },
  { id: 'D20', kg_per_cay: 28.88, bo_size: 114, min_stock: 114, unit: 'cay', active: 1 },
  { id: 'D25', kg_per_cay: 45.11, bo_size: 72, min_stock: 36, unit: 'cay', active: 1 },
];
const khu = [{ id: 'A', name: 'Khu A', active: 1 }, { id: 'B', name: 'Khu B', active: 1 }];
const B = {
  rev: 9, today, lastClosed: yday, closed: false,
  user: { id: 1, name: 'A', role: 'admin' },
  phi, khu, ku: {},
  khuPhi: phi.flatMap((p) => khu.map((k) => ({ khu_id: k.id, phi_id: p.id, active: 1, keep_streak: 0 }))),
  counts: [], eff: [], mvNew: [],
  baseline: phi.flatMap((p) => khu.map((k) => ({ khu_id: k.id, phi_id: p.id, v: 3 * p.bo_size }))),
  reports: [], receipts: [], innKhu: [],
  rates: [{ phi_id: 'D20', per_day: 120, days: 28 }],
  settings: { hide_after_zero_days: 3, max_keep_streak: 3, auto_close: 1, report_slots_per_day: 1 },
  phiStd: phi.map((p) => ({ id: p.id, kg_per_cay: p.kg_per_cay, bo_size: p.bo_size, min_stock: p.min_stock, unit: p.unit })),
};
vm.runInContext(`
  S.me = ${JSON.stringify(B.user)}; const BB = ${JSON.stringify(B)}; indexBoot(BB); S.boot = BB;
  S.review = { day: '${today}', last: '${yday}', span: 1, rev: 9, closed: false, pending: 0,
    rows: BB.phi.map((p) => ({ phi: p.id, kg: p.kg_per_cay, old: 100, inn: 0, cnt: 90, used: 10, avg: 5, peak: 8, rateDays: 28, neg: false, high: false, topKhu: 'A', topNet: -10 })),
    exceptions: [], reports: [], khu: BB.khu };
  S.audit = []; S.users = []; S.usage = [];
  S.hist = { date: '${yday}', data: { day: '${yday}', close: null, counts: [], baseline: [], prevBaseline: BB.baseline, summary: [], reports: [], receipts: [] } };
  S.bc = { from: '${yday}', to: '${today}', data: { rows: [], days: [], closedDays: 1, openDay: '${yday}', closeDay: '${today}', openStock: false } };
  S.khu = 'A'; loadDraft(true);
`, ctx);

/* ---------- tách con trực tiếp của #app ---------- */
function topLevel(html) {
  const out = [];
  let depth = 0, cur = null;
  const re = /<(\/?)([a-z0-9]+)([^>]*)>/gi;
  let m;
  while ((m = re.exec(html))) {
    const close = m[1] === '/', name = m[2].toLowerCase(), attrs = m[3];
    if (/\/$/.test(attrs) || ['br', 'img', 'input', 'meta', 'hr'].includes(name)) continue;
    if (!close) {
      if (depth === 0) cur = { cls: (attrs.match(/class="([^"]*)"/) || ['', ''])[1], id: (attrs.match(/id="([^"]*)"/) || ['', ''])[1], tag: name };
      depth++;
    } else {
      depth--;
      if (depth === 0 && cur) { out.push(cur); cur = null; }
    }
  }
  return out;
}
// lớp nào có flex:none trong style.css (kể cả khi khai báo chung nhiều selector)
const hasFlexNone = (cls) => {
  const re = new RegExp('(^|[,}\\n])\\s*(#|\\.)' + cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*(,[^{]*)?\\{([^}]*)\\}', 'm');
  const m = CSS.match(re);
  return !!m && /flex\s*:\s*none/.test(m[4]);
};

vm.runInContext("S.loans = { doitac: [{ id: 1, name: 'Cty A', active: 1 }], items: [], agg: [] };", ctx);
const SCREENS = ['home', 'khu', 'dem', 'nhap', 'ton', 'duyet', 'nhatky', 'lichsu', 'baocao', 'stats', 'more', 'pin', 'users', 'settings', 'vaymuon'];
for (const sc of SCREENS) {
  vm.runInContext(`S.screen = '${sc}'; S.sel = null;`, ctx);
  const kids = topLevel(vm.runInContext('vMain()', ctx));
  const isScroll = (k) => /\bf1\b/.test(k.cls) || k.id === 'mx';
  const scrollers = kids.filter(isScroll);
  ok(sc + ': đúng một vùng cuộn', scrollers.length === 1, scrollers.length + ' vùng: ' + kids.map((k) => k.cls || k.id).join(' / '));
  for (const k of kids.filter((x) => !isScroll(x))) {
    const names = (k.cls || '').split(/\s+/).filter(Boolean).concat(k.id ? [k.id] : []);
    // thẻ phủ lên trên (position:absolute) không chiếm chỗ trong flex nên không cần flex:none
    const overlay = names.some((n) => ['busy', 'modal'].includes(n));
    ok(sc + ': "' + (k.cls || k.id) + '" không bị bóp', overlay || names.some(hasFlexNone), names.join(' '));
  }
}

/* ---------- luật CSS của khung ---------- */
const appRule = (CSS.match(/#app\{([^}]*)\}/) || ['', ''])[1];
ok('#app không dùng 100vh (trình duyệt cũ mất phần đáy)', !/height\s*:\s*100vh/.test(appRule), appRule.slice(0, 90));
ok('#app lấy chiều cao theo khung nhìn', /height\s*:\s*100%/.test(appRule) || /height\s*:\s*100dvh/.test(appRule), appRule.slice(0, 90));
ok('html/body khóa cuộn trang để khung không trôi', /html,\s*body\{[^}]*overflow\s*:\s*hidden/.test(CSS));
ok('vùng cuộn không kéo theo cả trang', /\.scroll\{[^}]*overscroll-behavior\s*:\s*contain/.test(CSS));
ok('bảng đếm cũng vậy', /#mx\{[^}]*overscroll-behavior\s*:\s*contain/.test(CSS));
ok('hộp xác nhận dài cuộn được trong hộp', /\.modal \.box\{[^}]*max-height[^}]*overflow-y\s*:\s*auto/.test(CSS));
ok('có đường lùi cho màn hình thấp', /@media \(max-height:\s*\d+px\)/.test(CSS), (CSS.match(/@media \(max-height:[^)]*\)/) || [''])[0]);

const fail = T.filter((x) => x[0] === 'FAIL');
console.log(T.map((x) => x[0] + ' | ' + x[1] + (x[2] && x[0] === 'FAIL' ? '  [' + x[2] + ']' : '')).join('\n'));
console.log('\n=== ' + T.length + ' kiểm tra, ' + fail.length + ' lỗi ===');
process.exit(fail.length ? 1 : 0);
