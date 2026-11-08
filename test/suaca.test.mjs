/* Sửa một ca + lịch ca theo thời điểm (chốt 2026-11-08):
   1. Đổi lịch giữa ca thì ca ĐANG CHẠY vẫn theo lịch cũ (tự chép số, báo cáo ca), lịch mới áp từ ca sau; đổi nhiều lần trong một ca vẫn nhớ
      lịch lúc vào ca.
   2. CVKTHT trở lên "Sửa ca này" trên mục 3 báo cáo ca (lùi 7 ngày): sửa số của tổ cho đúng ca đó (ghi thay), hoặc "Tổ không làm ca này":
      ca đó không tự chép số, báo cáo ghi "không làm", sản lượng không tính công ca đó; tổ báo số thì dấu tự bỏ; bỏ dấu được; ghi nhật ký.
   node suaca.test.mjs <đường-dẫn-repo> */
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
  /* ===== 1. Đổi lịch giữa ca ===== */
  {
    toi(20, 0);
    const { S, U } = await dung([['A', 'tieudoi'], ['B', 'tieudoi'], ['CV', 'cvktht']]);
    for (const t of ['A', 'B']) {
      await S.call('PUT', '/quanso/lich', { ca: 2 }, t);
      await S.call('PUT', '/quanso/thietlap', { user: U[t], ts: 0, ca: 2, tong: 10, s1: 0, s2: 9, n2: { om: 1 } }, 'CV');
    }
    advance(864e5); toi(20, 0); // sang hôm sau, lịch đã đặt từ trước ca đêm này
    const D = vnDay();
    advance(2 * 3600e3); // 22h: ca đêm đang chạy
    eq('1: 22h tổ A (ca đêm) tự đổi lịch sang ca ngày', (await S.call('PUT', '/quanso/lich', { ca: 1 }, 'A')).status, 200);
    eq('1: 22h CVKTHT đổi hộ tổ B sang ca ngày rồi đổi lại ca đêm, rồi lại ca ngày (ba lần trong một ca)', [
      (await S.call('PUT', '/quanso/thietlap', { ds: [{ user: U.B, ca: 1 }] }, 'CV')).status,
      (await S.call('PUT', '/quanso/thietlap', { ds: [{ user: U.B, ca: 2 }] }, 'CV')).status,
      (await S.call('PUT', '/quanso/thietlap', { ds: [{ user: U.B, ca: 1 }] }, 'CV')).status], [200, 200, 200]);
    const M = await may(S, U, 'CV');
    await M.moBc(D, 2);
    eq('1: báo cáo ca đêm tối nay: tổ A vẫn là tổ ca đêm (lịch mới áp từ ca sau)', M.dong('A'), 'Tổ A: ca đêm 9/10 cn, nghỉ 1 cn — 1 ốm');
    eq('1: …tổ B cũng vậy (đổi ba lần trong ca vẫn nhớ lịch lúc vào ca)', M.dong('B'), 'Tổ B: ca đêm 9/10 cn, nghỉ 1 cn — 1 ốm');
    toi(7, 0); await S.cron();
    eq('1: hết ca đêm, lượt chép tự động vẫn chép số đêm đó cho cả hai tổ', S.sql('SELECT user_id, lam FROM quan_so_tl WHERE ngay = ? AND ca = 2 ORDER BY user_id', D).map((r) => [r.user_id, r.lam]), [[U.A, 9], [U.B, 9]]);
    const homNay = vnDay();
    await M.moBc(homNay, 1);
    ok('1: báo cáo ca ngày hôm sau: tổ A thuộc ca ngày (lịch mới), kèm ca đêm vừa qua', /^Tổ A: (chưa báo quân số ca ngày|ca ngày)/.test(M.dong('A') || '') && /ca đêm 9\/10/.test(M.dong('A') || ''), M.dong('A'));
    ok('1: không có lỗi JavaScript', !M.loi.length, M.loi.join(' | '));
  }

  /* ===== 2. Sửa ca này / Tổ không làm ca này ===== */
  {
    toi(9, 0);
    const { S, U } = await dung([['An', 'tieudoi'], ['Binh', 'tieudoi'], ['CV', 'cvktht']]);
    for (const t of ['An', 'Binh']) {
      await S.call('PUT', '/quanso/lich', { ca: 1 }, t);
      await S.call('PUT', '/quanso/thietlap', { user: U[t], ts: 0, ca: 1, tong: 12, s1: 12, s2: 0 }, 'CV');
    }
    advance(864e5); toi(9, 0); // hôm sau, giữa ca ngày
    const D = vnDay(), hom = vnDay(Date.now() - 864e5);
    await S.call('PUT', '/quanso', { ngay: D, ca: 1, tong: 12, lam: 11, nghi: { om: 1 } }, 'Binh');
    toi(20, 0); toi(9, 0); // sang ngày kế: ca ngày D đã qua
    await S.cron();
    const D2 = vnDay();
    eq('2: tổ trưởng không tự sửa được ca đã qua', (await S.call('PUT', '/quanso', { ngay: D, ca: 1, tong: 12, lam: 5, nghi: {} }, 'An')).status, 409);
    eq('2: tổ trưởng không đánh dấu "không làm" được', (await S.call('PUT', '/quanso/khong', { ngay: D, ca: 1, user: U.An, khong: true }, 'An')).status, 403);
    const M = await may(S, U, 'CV');
    await M.moBc(D, 1);
    eq('2: ca ngày D (đã qua): tổ An theo số đã chép', M.dong('An'), 'Tổ An: ca ngày 12/12 cn');
    ok('2: mục 3 có nút Sửa trên dòng mỗi tổ', (M.R('vBaoCaoCa()').match(/data-a="bcsuaca"/g) || []).length >= 2);
    // sửa số tổ An ca ngày D
    M.R(`ACTIONS.bcsuaca({ id: '${U.An}' })`);
    eq('2: mở Sửa: điền sẵn số đang ghi', M.R("JSON.stringify([S.form.bsc_t, S.form.bsc_l])"), JSON.stringify(['12', '12']));
    ok('2: form sửa hiện ngay dưới dòng tổ', M.R('vBaoCaoCa()').includes('Sửa quân số tổ An'));
    M.R("S.form.bsc_l = '9'; S.form.bsc_n_phep = '2'; S.form.bsc_n_khac = '1'; S.form.bsc_gc = ''; ACTIONS.bcsualuu()"); await tick(100);
    ok('2: thiếu ghi chú khi có nghỉ lý do khác: chưa lưu', S.one('SELECT COUNT(*) n FROM quan_so WHERE ngay = ? AND ca = 1 AND user_id = ?', D, U.An).n === 0 && /lý do khác/.test(M.R('S.toast')));
    M.R("S.form.bsc_gc = 'đi khám'; ACTIONS.bcsualuu()"); await tick(300);
    const r = S.one('SELECT tong, lam, nghi, by_id FROM quan_so WHERE ngay = ? AND ca = 1 AND user_id = ?', D, U.An);
    eq('2: lưu: số ca ngày D của tổ An, người ghi là CVKTHT', r && [r.tong, r.lam, JSON.parse(r.nghi), r.by_id], [12, 9, { phep: 2, khac: 1 }, U.CV]);
    eq('2: báo cáo ca ngày D theo số vừa sửa', M.dong('An'), 'Tổ An: ca ngày 9/12 cn, nghỉ 3 cn — 2 nghỉ phép năm, 1 đi khám');
    // không làm ca này
    M.R(`ACTIONS.bcsuaca({ id: '${U.Binh}' })`);
    M.R('globalThis.__hoi = ask; ask = async () => true');
    M.R("ACTIONS.bcsuakhong({ v: '1' })"); await tick(300);
    eq('2: đánh dấu tổ Binh không làm ca ngày D: báo cáo ghi "không làm"', M.dong('Binh'), 'Tổ Binh: không làm ca ngày');
    eq('2: số tổ đã báo của ca đó bị bỏ', S.one('SELECT COUNT(*) n FROM quan_so WHERE ngay = ? AND ca = 1 AND user_id = ?', D, U.Binh).n, 0);
    ok('2: nhật ký ghi số cũ', /"cu":\{"tong":12,"lam":11/.test(S.one("SELECT detail FROM audit WHERE action = 'qs_khong' ORDER BY id DESC LIMIT 1").detail || ''));
    ok('2: nhãn "Không làm ca này" trên dòng', M.R('vBaoCaoCa()').includes('Không làm ca này'));
    const Q = M.R('JSON.stringify((() => { const q = bcQuanSo(S.bcc); return [q.lam, q.tong, q.nghi, q.kiaSo, q.chuaSo]; })())');
    eq('2: tổng ca: đi làm 9, tổng 24, nghỉ 3, tổ không làm tính vào người không thuộc ca này 12', JSON.parse(Q), [9, 24, 3, 12, 0]);
    // sản lượng ngày D: không tính công tổ Binh
    await M.R(`slLay('${D}').then((L) => { slDung(L, false); })`); await tick(100);
    eq('2: sản lượng ngày D: tổ An 9 công, tổ Binh 0 công', JSON.parse(M.R('JSON.stringify(slTinh().dong.map((r) => [r.u.name, r.cong]))')), [['An', 9], ['Binh', 0]]);
    // ca đang chạy (hôm nay) đánh dấu không làm: lượt chép không chép
    eq('2: đánh dấu Binh không làm ca ngày hôm nay (ca đang chạy)', (await S.call('PUT', '/quanso/khong', { ngay: D2, ca: 1, user: U.Binh, khong: true }, 'CV')).status, 200);
    toi(19, 0); await S.cron();
    eq('2: hết ca: không chép số thiết lập cho tổ Binh, vẫn chép cho tổ An', S.sql('SELECT user_id FROM quan_so_tl WHERE ngay = ? AND ca = 1 ORDER BY user_id', D2).map((x) => x.user_id), [U.An]);
    const tk = (await S.call('GET', `/quanso/thongke?tu=${D}&den=${D2}`, undefined, 'CV')).data;
    ok('2: thống kê không có số nào của tổ Binh ở hai ca không làm', !tk.qs.concat(tk.tl, tk.tam).some((x) => x.u === U.Binh && x.ca === 1 && (x.ngay === D || x.ngay === D2)));
    // bỏ dấu
    eq('2: bỏ dấu "không làm" ca ngày D', (await S.call('PUT', '/quanso/khong', { ngay: D, ca: 1, user: U.Binh, khong: false }, 'CV')).status, 200);
    await M.moBc(D, 1);
    ok('2: bỏ dấu: tổ Binh không còn dòng "không làm"', !/không làm/.test(M.dong('Binh') || ''), M.dong('Binh'));
    // tổ báo số cho ca đã đánh dấu: dấu tự bỏ
    toi(19, 0); advance(864e5); toi(7, 0);
    const D3 = vnDay();
    await S.call('PUT', '/quanso/khong', { ngay: D3, ca: 1, user: U.An, khong: true }, 'CV');
    await S.call('PUT', '/quanso', { ngay: D3, ca: 1, tong: 12, lam: 12, nghi: {} }, 'An');
    ok('2: tổ An tự báo ca đã đánh dấu: dấu "không làm" tự bỏ', !(JSON.parse(S.one('SELECT data FROM bc_mau WHERE id = 1').data).khong || {})[D3 + ':1']?.[U.An]);
    // giới hạn 7 ngày
    eq('2: quá 7 ngày: không sửa được', (await S.call('PUT', '/quanso/khong', { ngay: vnDay(Date.now() - 9 * 864e5), ca: 1, user: U.An, khong: true }, 'CV')).status, 400);
    ok('2: không có lỗi JavaScript', !M.loi.length, M.loi.join(' | '));
    void hom;
  }

  const fail = T.filter((x) => x[0] === 'FAIL');
  console.log(T.map((x) => x[0] + ' | ' + x[1] + (x[2] && x[0] === 'FAIL' ? '  [' + x[2] + ']' : '')).join('\n'));
  console.log('\n=== ' + T.length + ' kiểm tra, ' + fail.length + ' lỗi ===');
  process.exit(fail.length ? 1 : 0);
}
main().catch((e) => { console.error('CRASH', e); process.exit(2); });
