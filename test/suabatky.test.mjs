/* SỬA QUÂN SỐ LÚC NÀO CŨNG ĐƯỢC (chốt 2026-11-18), cấp trên biết ai sửa:
   10h sáng sửa số ca đêm hôm trước, đánh dấu tổ không làm ca đêm, chuyển tổ ca đêm sang ca ngày — báo cáo ca đêm, báo cáo ca ngày (kèm ca
   đêm hôm trước), sản lượng, thống kê và lượt chép đều khớp; dòng bị sửa ghi "sửa: tên · giờ" (chỉ trên màn hình, không vào bản chép); thẻ
   "Quân số vừa được sửa" trên Tổng quan của cấp chỉ huy, bấm là mở Nhật ký lọc Quân số, xem rồi thì tắt.
   node suabatky.test.mjs <đường-dẫn-repo> */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { advance, boot, vnDay } from './harness.mjs';

const ROOT = process.argv[2] || '.';
const SRC = readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');
const T = [];
const ok = (name, cond, extra) => { T.push([cond ? 'PASS' : 'FAIL', name, extra === undefined ? '' : String(extra)]); };
const eq = (name, a, b) => ok(name + ' = ' + JSON.stringify(b), JSON.stringify(a) === JSON.stringify(b), 'thực tế: ' + JSON.stringify(a));
const tick = async (n = 60) => { for (let i = 0; i < n; i++) await new Promise((z) => setImmediate(z)); };
const toi = (h, m) => { const cur = ((Date.now() + 7 * 3600e3) % 864e5) / 60e3; advance(((h * 60 + m - cur + 1440) % 1440 || 1440) * 60e3); };

async function dung(names) {
  const S = await boot(ROOT);
  await S.call('POST', '/setup', { token: 'setup-tok', name: 'Admin', phone: '0900000001', pin: '2468' });
  await S.login('Admin', '0900000001', '2468');
  const U = {};
  let i = 2;
  for (const [name, role] of names) {
    const phone = '09000000' + String(i++).padStart(2, '0');
    const r = await S.call('POST', '/users', { name, phone, role }, 'Admin');
    await S.login(name, phone, r.data.pin);
    await S.call('POST', '/change-pin', { pin: r.data.pin, newPin: '1357' }, name);
    U[name] = r.data.id;
  }
  return { S, U };
}
// app.js trong vm, gọi worker thật dưới tên `who` (CVKTHT)
async function may(S, U, who) {
  const store = {};
  const el = () => ({ value: '', dataset: {}, style: {}, click() {}, focus() {}, remove() {}, select() {}, setAttribute() {}, setSelectionRange() {}, querySelector: () => null, querySelectorAll: () => [], appendChild() {}, closest: () => null, getBoundingClientRect: () => ({ left: 0, right: 0 }), set innerHTML(v) {}, get innerHTML() { return ''; } });
  const loi = [];
  const ctx = {
    console: { log() {}, warn() {}, error: (...a) => loi.push(a.map(String).join(' ')) },
    Date, Math, JSON, String, Number, Object, Array, Set, Map, parseInt, parseFloat, isNaN, Promise, RegExp, Error, TypeError, encodeURIComponent,
    setTimeout: () => 0, clearTimeout: () => {},
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; }, key: (n) => Object.keys(store)[n] || null, get length() { return Object.keys(store).length; } },
    navigator: { onLine: true, clipboard: { writeText: async () => {} } },
    history: { state: null, pushState() {}, replaceState() {} },
    document: { activeElement: null, hidden: false, body: { appendChild() {}, removeChild() {} }, createElement: el, getElementById: () => el(), querySelectorAll: () => [], addEventListener() {}, execCommand: () => false },
    window: { addEventListener() {} },
    fetch: async (url, o = {}) => {
      const r = await S.call(o.method || 'GET', String(url).replace(/^\/api/, ''), o.body ? JSON.parse(o.body) : undefined, who);
      return { ok: r.status < 400, status: r.status, json: async () => r.data, headers: { get: () => null } };
    },
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: 'app.js' });
  const R = (src) => vm.runInContext(src, ctx);
  await tick(200);
  const bt = (await S.call('GET', '/bootstrap', undefined, who)).data;
  R(`S.boot = ${JSON.stringify(bt)}; indexBoot(S.boot); S.me = ${JSON.stringify({ id: U[who], name: who, role: 'cvktht' })}; S._dataUid = S.me.id; S.form = {};`);
  const moBc = async (ngay, ca) => { R(`S.bcCa = { ngay: '${ngay}', ca: ${ca} }; S.bcc = null; go('baocaoca', true)`); await tick(300); };
  const dong = (ten) => R("bcAuto(S.bcc, 's3')").split('\n').find((l) => l.includes('Tổ ' + ten));
  return { R, moBc, dong, loi };
}

async function main() {
  toi(20, 0);
  const { S, U } = await dung([['A', 'tieudoi'], ['B', 'tieudoi'], ['C', 'tieudoi'], ['CV', 'cvktht'], ['Trung', 'trungdoi']]);
  await S.call('PUT', '/quanso/lich', { ca: 2 }, 'A'); await S.call('PUT', '/quanso/thietlap', { user: U.A, ts: 0, ca: 2, tong: 10, s1: 0, s2: 10 }, 'CV');
  await S.call('PUT', '/quanso/lich', { ca: 1 }, 'B'); await S.call('PUT', '/quanso/thietlap', { user: U.B, ts: 0, ca: 1, tong: 12, s1: 12, s2: 0 }, 'CV');
  await S.call('PUT', '/quanso/lich', { ca: 3 }, 'C'); await S.call('PUT', '/quanso/thietlap', { user: U.C, ts: 0, ca: 3, tong: 16, s1: 8, s2: 8 }, 'CV');
  advance(864e5); toi(19, 0);
  const H = vnDay(); // ca đêm H: tối hôm trước
  toi(7, 5); await S.cron();
  const D = vnDay();
  eq('sáng D: lượt chép đã chép ca đêm H (A 10, C 8)', S.sql('SELECT user_id u, lam FROM quan_so_tl WHERE ngay = ? AND ca = 2 ORDER BY u', H).map((r) => [r.u, r.lam]), [[U.A, 10], [U.C, 8]]);
  const M = await may(S, U, 'CV');
  toi(10, 0);
  /* 1. 10h sáng D sửa số ca đêm H của tổ A */
  await M.moBc(H, 2);
  M.R(`ACTIONS.bcsuaca({ id: '${U.A}' })`); M.R("S.form.bsc_t = '10'; S.form.bsc_l = '7'; S.form.bsc_n_om = '3'; ACTIONS.bcsualuu()"); await tick(300);
  eq('1: báo cáo ca đêm H theo số vừa sửa', M.dong('A'), 'Tổ A: ca đêm 7/10 cn, nghỉ 3 cn — 3 ốm');
  ok('1: dòng tổ A ghi người sửa (chỉ trên màn hình)', /✎ Sửa: CV · /.test(M.R('vBaoCaoCa()')) && !/sửa: CV/i.test(M.R('bcTao()')), M.R(`bcQuanSo(S.bcc).sua.join('|')`));
  /* 2. tổ C không làm ca đêm H */
  M.R(`ACTIONS.bcsuaca({ id: '${U.C}' })`); M.R('ask = async () => true'); M.R("ACTIONS.bcsuakhong({ v: '1' })"); await tick(300);
  eq('2: tổ C không làm ca đêm H', M.dong('C'), 'Tổ C: không làm ca đêm');
  ok('2: dòng tổ C ghi người đánh dấu', /Đánh dấu không làm: CV · /.test(M.R(`bcQuanSo(S.bcc).sua.join('|')`)), M.R(`bcQuanSo(S.bcc).sua.join('|')`));
  eq('2: tổng ca đêm H: đi làm 7', M.R('bcQuanSo(S.bcc).lam'), 7);
  /* 3. 10h chuyển tổ A từ ca đêm sang ca ngày (bảng thiết lập), số ca ngày 10 */
  const Q = (await S.call('GET', '/quanso', undefined, 'CV')).data;
  eq('3: chuyển tổ A sang ca ngày lúc 10h', (await S.call('PUT', '/quanso/thietlap', { ds: [{ user: U.A, ca: 1, tong: 10, s1: 10, s2: 0, ts: Q.tl[U.A].ts }] }, 'CV')).status, 200);
  await M.moBc(D, 1);
  eq('3: báo cáo ca ngày D: tổ A ca ngày 10 kèm ca đêm H đã sửa', M.dong('A'), 'Tổ A: ca ngày 10/10 cn, ca đêm 7/10 cn, nghỉ 3 cn — ca đêm: 3 ốm');
  eq('3: tổ C ca ngày D, không kèm ca đêm H (không làm)', M.dong('C'), 'Tổ C: ca ngày 8/16 cn');
  ok('3: báo cáo ca ngày ghi cả người sửa ca đêm hôm trước', /Ca đêm \d\d\/\d\d sửa: CV/.test(M.R(`bcQuanSo(S.bcc).sua.join('|')`)), M.R(`bcQuanSo(S.bcc).sua.join('|')`));
  await M.moBc(H, 2);
  eq('3: ca đêm H vẫn giữ số đã sửa của tổ A sau khi chuyển ca', M.dong('A'), 'Tổ A: ca đêm 7/10 cn, nghỉ 3 cn — 3 ốm');
  /* 4. sản lượng D = ca ngày D + ca đêm H */
  await M.R(`slLay('${D}').then((L) => { slDung(L, false); })`); await tick(100);
  eq('4: sản lượng D: A 10 + 7, B 12, C 8 (không cộng đêm H)', JSON.parse(M.R('JSON.stringify(slTinh().dong.map((r) => [r.u.name, r.cong]))')), [['A', 17], ['B', 12], ['C', 8]]);
  ok('4: sản lượng ghi người sửa của tổ A', /sửa: CV/.test(M.R(`S.sl.to.find((u) => u.name === 'A').sua`) || '') && M.R('vSanLuong()').includes('✎'), M.R(`S.sl.to.find((u) => u.name === 'A').sua`));
  /* 5. thống kê và lượt chép */
  toi(19, 0); await S.cron();
  eq('5: hết ca ngày D: chép A 10, B 12, C 8', S.sql('SELECT user_id u, lam FROM quan_so_tl WHERE ngay = ? AND ca = 1 ORDER BY u', D).map((r) => [r.u, r.lam]), [[U.A, 10], [U.B, 12], [U.C, 8]]);
  const tk = (await S.call('GET', `/quanso/thongke?tu=${H}&den=${D}`, undefined, 'CV')).data;
  eq('5: thống kê ca đêm H: số đã sửa của tổ A (7), không còn số của tổ C', tk.qs.filter((x) => x.ngay === H && x.ca === 2).map((x) => [x.u, x.lam]).concat(tk.tl.filter((x) => x.ngay === H && x.ca === 2 && x.u === U.C).map((x) => [x.u, x.lam])), [[U.A, 7]]);
  /* 6. thẻ trên Tổng quan của cấp chỉ huy */
  const T2 = await may(S, U, 'Trung');
  T2.R(`S.me.role = 'trungdoi'; S.screen = 'home'`);
  const home = T2.R('vHome()');
  ok('6: Tổng quan của Trung đội trưởng có thẻ "Quân số vừa được sửa" kèm người sửa', /Quân số vừa được sửa \(\d+ lần\)/.test(home) && /CV sửa quân số tổ A ca đêm/.test(home) && /CV đánh dấu tổ C không làm ca đêm/.test(home), home.slice(home.indexOf('Cần xử lý'), home.indexOf('Cần xử lý') + 400));
  T2.R('ACTIONS.qssuaxem()'); await tick(100);
  eq('6: bấm thẻ: mở Nhật ký lọc Quân số', T2.R('JSON.stringify([S.screen, S.logFilter])'), JSON.stringify(['nhatky', 'qs']));
  T2.R(`S.screen = 'home'`);
  ok('6: đã xem: thẻ tắt', !T2.R('vHome()').includes('Quân số vừa được sửa'));
  const cvHome = M.R(`S.screen = 'home'; vHome()`);
  ok('6: CVKTHT (không phải cấp chỉ huy) không có thẻ này', !cvHome.includes('Quân số vừa được sửa'));
  ok('không có lỗi JavaScript', !M.loi.length && !T2.loi.length, M.loi.concat(T2.loi).join(' | '));

  const fail = T.filter((x) => x[0] === 'FAIL');
  console.log(T.map((x) => x[0] + ' | ' + x[1] + (x[2] && x[0] === 'FAIL' ? '  [' + x[2] + ']' : '')).join('\n'));
  console.log('\n=== ' + T.length + ' kiểm tra, ' + fail.length + ' lỗi ===');
  process.exit(fail.length ? 1 : 0);
}
main().catch((e) => { console.error('CRASH', e); process.exit(2); });
