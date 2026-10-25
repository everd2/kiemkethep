/* CHUYỂN MÀN KHÔNG CHỜ TRẮNG: giả lập mạng trễ (mặc định 150 ms mỗi lượt gọi), mở lần lượt mọi màn hai lần. Lần MỞ LẠI không màn
   nào được hiện khung "Đang tải..." toàn màn (phải bày số đã có ngay, số mới thay vào khi về); sau khi tải sẵn lúc đăng nhập
   (taiSan('dau')), lần mở ĐẦU của Duyệt / Gia công / Báo cáo ca cũng không chờ. Số lượt gọi mỗi lần mở không quá 3.
   node chuyenman.test.mjs <đường-dẫn-repo> */
import { boot, vnDay } from './harness.mjs';
const ROOT = process.argv[2] || '.';
const S = await boot(ROOT);
// đếm: mỗi .all/.run là 1 câu + 1 lượt; mỗi batch là 1 lượt, n câu
let cau = 0, luot = 0;
const D = S.DB, all0 = Object.getPrototypeOf(D.prepare('select 1')).all, run0 = Object.getPrototypeOf(D.prepare('select 1')).run, b0 = D.batch.bind(D);
const P = Object.getPrototypeOf(D.prepare('select 1'));
P.all = function (...a) { cau++; luot++; return all0.apply(this, a); };
P.run = function (...a) { cau++; luot++; return run0.apply(this, a); };
D.batch = async (st) => { cau += st.length; luot++; const r = await b0(st); return r; };
// first() gọi all() nên đã đếm

await S.call('POST', '/setup', { token: 'setup-tok', name: 'Admin', phone: '0900000001', pin: '2468' });
await S.login('admin', '0900000001', '2468');
const to = [];
for (let i = 0; i < 9; i++) {
  const r = await S.call('POST', '/users', { name: 'Tổ trưởng ' + i, phone: '09100000' + String(i).padStart(2, '0'), role: 'tieudoi' });
  await S.login('T' + i, '09100000' + String(i).padStart(2, '0'), r.data.pin);
  await S.call('POST', '/change-pin', { pin: r.data.pin, newPin: '1357' }, 'T' + i);
  to.push(r.data.id);
}
const cv = await S.call('POST', '/users', { name: 'CVKTHT', phone: '0920000000', role: 'cvktht' });
await S.login('CV', '0920000000', cv.data.pin); await S.call('POST', '/change-pin', { pin: cv.data.pin, newPin: '1357' }, 'CV');
const B = (await S.call('GET', '/bootstrap')).data;
const khu = B.khu.filter((k) => k.active).map((k) => k.id), phi = B.phi.filter((p) => p.active).map((p) => p.id);
const day = vnDay(), hom = vnDay(Date.now() - 864e5);
// số đếm cho mọi khu, phiếu nhập / chuyển, quân số, đơn gia công
for (const k of khu) await S.call('PUT', '/counts', { khu: k, day, items: phi.map((p, i) => ({ phi: p, v: 100 + i * 7, kind: 'dem' })) });
for (let i = 0; i < 30; i++) await S.call('POST', '/receipts', { khu: khu[i % khu.length], lines: [{ phi: phi[i % phi.length], qty: 10 + i }] });
for (const [i, u] of to.entries()) {
  await S.call('PUT', '/quanso', { ngay: day, ca: 1, user: u, tong: 20, lam: 15 + (i % 3), nghi: { om: 1 } }, 'CV');
  await S.call('PUT', '/quanso', { ngay: hom, ca: 2, user: u, tong: 20, lam: 14, nghi: {} }, 'CV');
}
for (let i = 0; i < 40; i++) await S.call('POST', '/giacong', { cau_kien: 'Dầm D' + i, tang: String(i % 9), truc: 'X' + i, user: to[i % 9], han: vnDay(Date.now() + 864e5 * (i % 5)) }, 'CV');


const ROOT2 = ROOT;
const CV = 'CV';
  const { readFileSync } = await import('node:fs');
  const vm = (await import('node:vm')).default;
  const path = (await import('node:path')).default;
  let who = CV, chep = null;
  const el = () => ({ value: '', dataset: {}, style: {}, click() {}, focus() {}, remove() {}, select() {}, setAttribute() {}, setSelectionRange() {}, querySelector: () => null, querySelectorAll: () => [], appendChild() {}, closest: () => null, set innerHTML(v) {}, get innerHTML() { return ''; } });
  const store = {};
  // bộ bắt sự kiện thật của app (input, click...) để phát sự kiện gõ như trên điện thoại; ô xem trước giữ một đối tượng cố định
  const nghe = {}, prev = { textContent: '' };
  const ctx = {
    console, Date, Math, JSON, String, Number, Object, Array, Set, Map, parseInt, parseFloat, isNaN, Promise, RegExp, Error, TypeError, encodeURIComponent,
    setTimeout: () => 0, clearTimeout: () => {},
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; }, key: (n) => Object.keys(store)[n] || null, get length() { return Object.keys(store).length; } },
    navigator: { onLine: true, clipboard: { writeText: async (t) => { chep = t; } } },
    history: { state: null, pushState() {}, replaceState() {} },
    document: { activeElement: null, hidden: false, body: { appendChild() {}, removeChild() {} }, createElement: el, getElementById: (id) => (id === 'bcprev' ? prev : el()), querySelectorAll: () => [], addEventListener(t, fn) { (nghe[t] = nghe[t] || []).push(fn); }, execCommand: () => false },
    window: { addEventListener() {} },
    fetch: async (url, o = {}) => {
      
      const r = await S.call(o.method || 'GET', String(url).replace(/^\/api/, ''), o.body ? JSON.parse(o.body) : undefined, who);
      return { ok: r.status < 400, status: r.status, json: async () => r.data, headers: { get: () => null } };
    },
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(readFileSync(path.join(ROOT2, 'public/app.js'), 'utf8'), ctx, { filename: 'app.js' });
  const R = (src) => vm.runInContext(src, ctx);
  /* go() không bật S.busy (chỉ act() bật), nên chỉ nhìn S.busy thì cho() chỉ chờ đủ 40 vòng rồi đi tiếp dù go() chưa
     nạp xong — đọc S.bcc lúc đó ra null, test hỏng ngẫu nhiên tuỳ máy nhanh chậm. Bọc go() để đếm số lần chuyển màn
     đang chạy dở, cho() chờ tới khi về 0 thật. */
  let dangGo = 0;
  const go0 = ctx.go;
  ctx.go = (...a) => { dangGo++; return Promise.resolve(go0(...a)).finally(() => { dangGo--; }); };
  const cho = async () => { for (let k = 0; k < 3000; k++) { await new Promise((r) => setImmediate(r)); if (!R('S.busy') && !dangGo && k > 40) return; } };
  const bt = (await S.call('GET', '/bootstrap', undefined, 'admin')).data;
  R(`S.boot = ${JSON.stringify(bt)}; indexBoot(S.boot); S.me = ${JSON.stringify({ id: 1, name: 'Admin', role: 'admin' })}; S.form = {}; S.screen = 'more';`);
who = 'admin';

// một tài khoản duy nhất (như người dùng thật): nạp lại bootstrap của chính người đang gọi
await R('loadBoot()'); R('S.me = S.boot.user; S._dataUid = S.me.id');
const TRE = Number(process.env.TRE || 150);
const goc = ctx.fetch; let soGoi = 0, dangCho = 0;
ctx.fetch = async (url, o) => { soGoi++; dangCho++; try { await new Promise((z) => setTimeout(z, TRE)); return await goc(url, o); } finally { dangCho--; } };
const yen = async () => { let im = 0; for (let k = 0; k < 3000 && im < 8; k++) { await new Promise((z) => setTimeout(z, 10)); im = dangCho === 0 && !R('S.busy') ? im + 1 : 0; } };
const PANEL = '<div class="f1 pad muted">Đang tải...</div>';
const doMan = async (lenh) => {
  R(`S.screen = 'more'; render()`); await yen();
  soGoi = 0;
  const t0 = performance.now();
  R(lenh);
  let thay = null;
  for (let k = 0; k < 800 && thay == null; k++) { if (!R('vMain()').includes(PANEL)) thay = performance.now() - t0; else await new Promise((z) => setTimeout(z, 5)); }
  await yen();
  return [Math.round(thay), soGoi];
};
R("S.review = null; S.gc = null; taiSan('dau')"); await yen();
const MAN = ['home', 'ton', 'khu', 'nhap', 'duyet', 'giacong', 'quanso', 'qstk', 'baocaoca', 'vaymuon', 'satvun', 'nhatky', 'users', 'settings', 'lichsu', 'baocao', 'stats', 'sanluong'];
const lenh = (s) => (s === 'sanluong' ? 'ACTIONS.slmo()' : `ACTIONS.nav({ s: '${s}' })`);
const kq = {};
for (const lan of [1, 2]) for (const s of MAN) (kq[s] = kq[s] || []).push(await doMan(lenh(s)));
const T = [];
const ok = (name, cond, extra) => { T.push([cond ? 'PASS' : 'FAIL', name, extra === undefined ? '' : String(extra)]); };
for (const [n, v] of Object.entries(kq)) {
  ok(`mở lại "${n}": không chờ trắng`, v[1][0] <= 50, v[1][0] + ' ms');
  ok(`"${n}": mỗi lần mở gọi máy chủ không quá 3 lượt`, v[0][1] <= 3 && v[1][1] <= 3, v.map((x) => x[1]).join('/'));
}
for (const n of ['duyet', 'giacong', 'baocaoca']) ok(`tải sẵn lúc đăng nhập: mở lần ĐẦU "${n}" không chờ trắng`, kq[n][0][0] <= 50, kq[n][0][0] + ' ms');
const fail = T.filter((x) => x[0] === 'FAIL');
console.log(T.map((x) => x[0] + ' | ' + x[1] + (x[0] === 'FAIL' ? '  [' + x[2] + ']' : '')).join('\n'));
console.log('\n=== ' + T.length + ' kiểm tra, ' + fail.length + ' lỗi ===');
process.exit(fail.length ? 1 : 0);
