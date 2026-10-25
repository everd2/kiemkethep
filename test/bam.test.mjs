/* BẤM LOẠN: dựng một bãi cỡ thật (9 tổ, đủ khu, 30 phiếu, 40 đơn gia công, quân số hai ca), rồi trên TỪNG MÀN bấm MỌI NÚT đang hiện
   (đúng data-* của nút) và vẽ lại. Chạy hai lượt: lượt 1 bấm "Quay lại" ở mọi hộp hỏi, lượt 2 bấm "Đồng ý" (điền lý do khi cần) để
   thử cả nhánh xoá / huỷ / khoá / duyệt. Lỗi máy chủ trả về (400/403/409) là bình thường; chỉ LỖI JAVASCRIPT (TypeError,
   ReferenceError...) mới là hỏng. Mất phiên sau một nút cũng được ghi lại (trừ đúng trường hợp tự đặt lại PIN của mình).
   node bam.test.mjs <đường-dẫn-repo> */
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
let tuDatPin = false;
const loi = [];
const loiJs = (e) => e && /^(TypeError|ReferenceError|RangeError|SyntaxError)$/.test(e.name || (e.constructor && e.constructor.name));
const oldErr = console.error;
console.error = (...a) => { if (a.some((x) => loiJs(x) || /TypeError|ReferenceError/.test(String(x)))) loi.push(['console.error', String(a[0]).slice(0, 160)]); };
ctx.console = console;
let soNut = 0;
for (const DONG_Y of [false, true]) {
const dongAsk = () => R(DONG_Y
  ? "(() => { let n = 0; while (S.ask && n++ < 5) { if (S.ask.input) S.form.askin = 'Lý do thử nghiệm'; if (S.ask.go) S.form.askgo = S.ask.go; ACTIONS.askyes(); } })()"
  : '(() => { let n = 0; while (S.ask && n++ < 5) { const a = S.ask; S.ask = null; a.resolve(false); } })()');
const nut = (html) => {
  const out = [];
  for (const m of html.matchAll(/<(?:button|div|span|a|label|input)\b([^>]*?)\bdata-a="([a-zA-Z0-9_]+)"([^>]*)>/g)) {
    const at = m[1] + ' ' + m[3], ds = {};
    for (const x of at.matchAll(/data-([a-z0-9]+)="([^"]*)"/g)) ds[x[1]] = x[2].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'");
    ds.a = m[2];
    out.push(ds);
  }
  return out;
};
const BO = new Set(['logout', 'install', 'reload', 'dl', 'download', 'csv', 'xuatcsv', 'backup']); // rời phiên / tải tệp: bỏ
const MAN_BAM = ['home', 'ton', 'khu', 'nhap', 'duyet', 'giacong', 'quanso', 'baocaoca', 'sanluong', 'qstk', 'vaymuon', 'satvun', 'nhatky', 'settings', 'users', 'more', 'lichsu', 'stats', 'baocao'];
for (const m of MAN_BAM) {
  const moMan = async () => { dongAsk(); R('S.sel = null; S.gcXu = null; S.gcVg = null; S.anhXem = null; S.form = {}'); if (m === 'sanluong') R('S.sl = null; ACTIONS.slmo()'); else R(`go('${m}')`); await cho(); dongAsk(); };
  try { await moMan(); } catch (e) { loi.push([m, 'mở màn: ' + e.message]); continue; }
  let ds;
  try { ds = nut(R('vMain()')); } catch (e) { loi.push([m, 'vẽ: ' + (e && e.stack || e).toString().slice(0, 200)]); continue; }
  const daBam = new Set();
  for (const d of ds) {
    const khoa = JSON.stringify(d);
    if (daBam.has(khoa) || BO.has(d.a)) continue;
    daBam.add(khoa);
    soNut++;
    try {
      const fn = R(`ACTIONS[${JSON.stringify(d.a)}]`);
      if (!fn) { loi.push([m, 'nút không có ACTIONS: ' + d.a]); continue; }
      const r = R(`ACTIONS[${JSON.stringify(d.a)}](${JSON.stringify(d)}, { preventDefault() {}, stopPropagation() {}, target: { closest: () => null } })`);
      if (r && typeof r.then === 'function') { for (let k = 0; k < 400; k++) { await new Promise((z) => setImmediate(z)); dongAsk(); } await Promise.race([r.catch((e) => { if (loiJs(e)) loi.push([m, d.a + ': ' + (e.stack || e).toString().split('\n').slice(0, 2).join(' | ')]); }), new Promise((z) => setTimeout(z, 50))]); }
      await cho(); dongAsk();
      R('render()');
    } catch (e) {
      if (loiJs(e)) loi.push([m, d.a + ' ' + JSON.stringify(d).slice(0, 80) + ': ' + (e.stack || e).toString().split('\n').slice(0, 2).join(' | ')]);
    }
    if (!R('!!(S.me && S.boot)')) {
      if (!(d.a === 'ureset' && /PIN mới của bạn: \d{4}/.test(R('S.err') || ''))) loi.push([m, 'MẤT PHIÊN sau nút ' + JSON.stringify(d).slice(0, 90) + ' (màn: ' + R('S.screen') + ', lỗi: ' + R('S.err') + ')']);
      const pm = /PIN mới của bạn: (\d{4})/.exec(R('S.err') || '');
      if (pm) {
        tuDatPin = true;
        await S.login('admin', '0900000001', pm[1]);
        await S.call('POST', '/change-pin', { pin: pm[1], newPin: '2468' }, 'admin');
      }
      try { await S.login('admin', '0900000001', '2468'); }
      catch (e) {
        // không đăng nhập lại được: người dùng bị khoá ngoài (ví dụ tự đặt lại PIN mà PIN mới không hiện ra)
        loi.push([m, 'BỊ KHOÁ NGOÀI sau nút ' + JSON.stringify(d).slice(0, 80) + ': ' + e.message]);
        console.log('FAIL |', m, '| BỊ KHOÁ NGOÀI sau nút', d.a);
        console.log('\n=== ' + (soNut + 1) + ' kiểm tra, ' + (loi.length + 1) + ' lỗi ===');
        process.exit(1);
      }
      const bt2 = (await S.call('GET', '/bootstrap', undefined, 'admin')).data;
      R(`S.boot = ${JSON.stringify(bt2)}; indexBoot(S.boot); S.me = S.boot.user; S.screen = 'more';`);
    }
    try { await moMan(); } catch (e) { loi.push([m, 'mở lại màn sau nút ' + d.a + ': ' + (e.stack || e).toString().split('\n').slice(0, 2).join(' | ')]); }
  }
}
}
console.error = oldErr;
console.log('đã bấm', soNut, 'nút (hai lượt), lỗi:', loi.length);
for (const x of loi) console.log('FAIL |', x[0], '|', x[1]);
console.log(tuDatPin ? 'PASS | tự đặt lại PIN của mình: màn đăng nhập hiện PIN mới' : 'FAIL | không thử được nhánh tự đặt lại PIN');
const n = loi.length + (tuDatPin ? 0 : 1);
console.log('\n=== ' + (soNut + 1) + ' kiểm tra, ' + n + ' lỗi ===');
process.exit(n ? 1 : 0);
