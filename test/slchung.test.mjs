/* Một bảng THIẾT LẬP QUÂN SỐ dùng chung cho ba báo cáo: báo cáo ca đêm, báo cáo ca ngày, báo cáo sản lượng. node slchung.test.mjs <repo>
   Báo cáo sản lượng của ngày D (báo cáo cuối ngày) = ca đêm NGÀY D-1 + ca ngày NGÀY D, mỗi tổ một dòng, số phải đúng bằng hai báo cáo ca.
   Dựng 5 tổ: chỉ ca ngày, chỉ ca đêm, cả hai ca theo số thiết lập, cả hai ca tổ tự báo (khai người thuộc ca kia), chưa đặt lịch. */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { advance, boot, vnDay } from './harness.mjs';

const ROOT = process.argv[2] || '.';
const T = [];
const ok = (name, cond, extra) => { T.push([cond ? 'PASS' : 'FAIL', name, extra === undefined ? '' : String(extra)]); };
const eq = (name, a, b) => ok(name + ' = ' + JSON.stringify(b), JSON.stringify(a) === JSON.stringify(b), 'thực tế: ' + JSON.stringify(a));
let xong = false;
process.on('beforeExit', () => { if (!xong) { console.log('CRASH test dừng giữa chừng'); process.exit(2); } });

async function main() {
  // 9h sáng: ca đêm hôm qua đã hết, ca ngày hôm nay đang chạy
  const cur = ((Date.now() + 7 * 3600e3) % 864e5) / 60e3;
  advance(((9 * 60 - cur + 1440) % 1440 || 1440) * 60e3);
  const S = await boot(ROOT);
  await S.call('POST', '/setup', { token: 'setup-tok', name: 'Admin', phone: '0900000001', pin: '2468' });
  await S.login('Admin', '0900000001', '2468');
  const U = {};
  let i = 2;
  for (const [name, role] of [['Ngày', 'tieudoi'], ['Đêm', 'tieudoi'], ['Hai', 'tieudoi'], ['Khai', 'tieudoi'], ['Mới', 'tieudoi'], ['CV', 'cvktht']]) {
    const phone = '09000000' + String(i++).padStart(2, '0');
    const r = await S.call('POST', '/users', { name, phone, role }, 'Admin');
    await S.login(name, phone, r.data.pin);
    await S.call('POST', '/change-pin', { pin: r.data.pin, newPin: '1357' }, name);
    U[name] = r.data.id;
  }
  const D = vnDay(), hom = vnDay(Date.now() - 864e5);
  const tl = async (ten, b) => S.call('PUT', '/quanso/thietlap', { user: U[ten], ts: 0, ...b }, 'CV');
  eq('đặt thiết lập: Ngày', (await tl('Ngày', { ca: 1, tong: 20, s1: 12, s2: 0 })).status, 200);
  eq('đặt thiết lập: Đêm', (await tl('Đêm', { ca: 2, tong: 20, s1: 0, s2: 17 })).status, 200);
  eq('đặt thiết lập: Hai', (await tl('Hai', { ca: 3, tong: 20, s1: 8, s2: 9 })).status, 200);
  eq('đặt thiết lập: Mới (chưa đặt lịch)', (await tl('Mới', { tong: 20, s1: 5, s2: 6 })).status, 200);
  eq('đặt ca: Khai làm hai ca', (await S.call('PUT', '/quanso/lich', { user: U['Khai'], ca: 3 }, 'CV')).status, 200);
  eq('Khai báo ca ngày 10/20, còn lại 10 người thuộc ca đêm', (await S.call('PUT', '/quanso', { ngay: D, ca: 1, user: U['Khai'], tong: 20, lam: 10 }, 'CV')).status, 200);

  const store = {};
  let chep = '';
  const el = () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, appendChild() {}, remove() {}, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} });
  const ctx = {
    console, Date, Math, JSON, String, Number, Object, Array, Set, Map, parseInt, parseFloat, isNaN, Promise, RegExp, Error, TypeError, encodeURIComponent,
    setTimeout: () => 0, clearTimeout: () => {},
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; }, key: (n) => Object.keys(store)[n] || null, get length() { return Object.keys(store).length; } },
    navigator: { onLine: true, clipboard: { writeText: async (x) => { chep = x; } } },
    history: { state: null, pushState() {}, replaceState() {} },
    document: { activeElement: null, hidden: false, body: { appendChild() {}, removeChild() {} }, createElement: el, getElementById: () => el(), querySelectorAll: () => [], addEventListener() {}, execCommand: () => false },
    window: { addEventListener() {} },
    fetch: async (url, o = {}) => {
      if (!/^\/api\/(baocao|sanluong|bootstrap|quanso|rev)/.test(String(url))) return new Promise(() => {});
      const r = await S.call(o.method || 'GET', String(url).replace(/^\/api/, ''), o.body ? JSON.parse(o.body) : undefined, 'CV');
      return { ok: r.status < 400, status: r.status, json: async () => r.data, headers: { get: () => null } };
    },
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(readFileSync(path.join(ROOT, 'public/app.js'), 'utf8'), ctx, { filename: 'app.js' });
  const R = (src) => vm.runInContext(src, ctx);
  const bt = (await S.call('GET', '/bootstrap', undefined, 'CV')).data;
  R(`S.boot = ${JSON.stringify(bt)}; indexBoot(S.boot); S.me = ${JSON.stringify({ id: U['CV'], name: 'CV', role: 'cvktht' })}; S.form = {}; S.screen = 'sanluong';`);
  const tai = async () => { await R(`slLay('${D}').then((L) => { slDung(L, false); })`); };
  const so = (ten) => JSON.parse(R(`(() => { const u = S.sl.to.find((x) => x.id === ${U[ten]}); return JSON.stringify([u.dem && u.dem.lam, u.ngay && u.ngay.lam, u.lam]); })()`));
  const dong = (i, ten) => R(`bcQuanSo(S.sl.bc[${i}], 'to').dong.find((l) => l.startsWith('Tổ ${ten}'))`);

  await tai();
  eq('báo cáo sản lượng lấy đúng ca đêm hôm trước + ca ngày hôm nay', R(`[S.sl.bc[1].ngay, S.sl.bc[1].ca, S.sl.bc[0].ngay, S.sl.bc[0].ca].join()`), [hom, 2, D, 1].join());
  // [ca đêm hôm trước, ca ngày hôm nay, tổng công]
  eq('số từng tổ (đêm, ngày, cộng)', Object.fromEntries(['Ngày', 'Đêm', 'Hai', 'Khai', 'Mới'].map((t) => [t, so(t)])), { 'Ngày': [null, 12, 12], 'Đêm': [17, null, 17], 'Hai': [9, 8, 17], 'Khai': [10, 10, 20], 'Mới': [6, 5, 11] });
  ok('báo cáo ca ngày ghi tổ Hai 8 + đêm 9', /ca ngày 8\/20 cn, ca đêm 9\/20 cn/.test(dong(0, 'Hai')), dong(0, 'Hai'));
  ok('báo cáo ca đêm hôm trước ghi tổ Hai 9', /ca đêm 9\/20 cn/.test(dong(1, 'Hai')), dong(1, 'Hai'));
  ok('báo cáo ca đêm hôm trước ghi tổ Đêm 17', /ca đêm 17\/20 cn/.test(dong(1, 'Đêm')), dong(1, 'Đêm'));
  ok('báo cáo ca ngày ghi tổ Khai 10 + đêm 10', /ca ngày 10\/20 cn, ca đêm 10\/20 cn/.test(dong(0, 'Khai')), dong(0, 'Khai'));
  ok('bản chữ sản lượng: tổ Hai đủ hai ca', R('slTao()').includes('• Tổ Hai: ca ngày 8/20 cn, ca đêm 9/20 cn'), R('slTao()'));
  ok('bản chữ sản lượng: tổ Khai đủ hai ca như báo cáo ca', R('slTao()').includes('• Tổ Khai: ca ngày 10/20 cn, ca đêm 10/20 cn'), R('slTao()'));

  // sửa MỘT bảng thiết lập: ca đang chạy đổi ở cả báo cáo ca và sản lượng
  const tsOf = (ten) => JSON.parse(S.one('SELECT data FROM bc_mau WHERE id = 1').data).tl[U[ten]].ts;
  eq('sửa thiết lập tổ Hai: ngày 7, đêm 9', (await S.call('PUT', '/quanso/thietlap', { user: U['Hai'], ts: tsOf('Hai'), tong: 20, s1: 7, s2: 9 }, 'CV')).status, 200);
  await tai();
  eq('sửa một chỗ: sản lượng theo ngay', so('Hai'), [9, 7, 16]);
  ok('sửa một chỗ: báo cáo ca ngày theo ngay', /ca ngày 7\/20 cn/.test(dong(0, 'Hai')), dong(0, 'Hai'));

  // ca đêm đã chép lúc hết ca: sửa số đặt sau đó không đổi ca đêm hôm trước ở cả hai báo cáo, ca ngày vẫn theo số mới
  S.raw.prepare('INSERT INTO quan_so_tl (ngay, ca, user_id, tong, lam, nghi, ghi_chu, ts) VALUES (?, 2, ?, 20, 9, ?, NULL, ?)').run(hom, U['Hai'], '{}', Date.now());
  eq('sửa thiết lập tổ Hai sau khi ca đêm đã chép: đêm 4, ngày 6', (await S.call('PUT', '/quanso/thietlap', { user: U['Hai'], ts: tsOf('Hai'), tong: 20, s1: 6, s2: 4 }, 'CV')).status, 200);
  await tai();
  eq('ca đêm hôm trước giữ 9, ca ngày hôm nay 6', so('Hai'), [9, 6, 15]);
  ok('báo cáo ca đêm hôm trước vẫn 9', /ca đêm 9\/20 cn/.test(dong(1, 'Hai')), dong(1, 'Hai'));
  ok('báo cáo ca ngày ghi đêm 9', /ca ngày 6\/20 cn, ca đêm 9\/20 cn/.test(dong(0, 'Hai')), dong(0, 'Hai'));

  // sửa tay số ca đêm NGAY TRONG báo cáo ca ngày (dòng tổ hai ca có cả số ca đêm): sản lượng cũng phải theo
  const nhap = (i, s3) => R(`localStorage.setItem(bcKey(S.sl.bc[${i}]), ${JSON.stringify(JSON.stringify({ v: 2, muc: { s3 }, dau: {}, ts: Date.now() + 1 }))}); slGan()`);
  nhap(0, 'Quân số\nTổ Hai: ca ngày 6/20 cn, ca đêm 3/20 cn');
  eq('sửa tay ca đêm trong báo cáo ca ngày: sản lượng theo', so('Hai'), [3, 6, 9]);
  nhap(1, 'Quân số\nTổ Hai: ca đêm 2/20 cn');
  eq('báo cáo ca đêm cũng sửa tay: chính báo cáo ca đêm thắng', so('Hai'), [2, 6, 8]);

  /* NÚT CHÉP: chữ chép ra phải theo thiết lập hiện tại. Máy khác vừa sửa mà máy này chưa làm mới thì chữ chép là số cũ (chép phải chạy ngay
     lúc bấm, không kịp hỏi máy chủ): lưu xong tải lại, báo đỏ để chép lại, lần chép sau đúng số mới. */
  const doiXong = async () => { for (let k = 0; k < 3000; k++) { await new Promise((r) => setImmediate(r)); if (!R('S.busy') && k > 40) return; } };
  R(`localStorage.removeItem(bcKey(S.sl.bc[0])); localStorage.removeItem(bcKey(S.sl.bc[1]))`);
  await tai();
  const dat = (s1) => S.call('PUT', '/quanso/thietlap', { user: U['Ngày'], ts: tsOf('Ngày'), tong: 20, s1, s2: 0 }, 'CV');
  // cùng máy, số đã tải: chép đúng số đang đặt
  R('ACTIONS.slchep()'); await doiXong();
  ok('sản lượng: chép đúng thiết lập hiện tại, báo đã chép', chep.includes('• Tổ Ngày: ca ngày 12/20 cn') && /Đã chép báo cáo sản lượng/.test(R('S.toast')), R('S.toast'));
  eq('máy khác sửa thiết lập tổ Ngày thành 13', (await dat(13)).status, 200);
  R('ACTIONS.slchep()'); await doiXong();
  ok('sản lượng: chép lúc chưa làm mới là số cũ, nhưng báo đỏ', chep.includes('ca ngày 12/20 cn') && /Số vừa đổi/.test(R('S.toast')) && R('S.toastErr'), R('S.toast'));
  eq('màn hình đã lấy số mới', so('Ngày'), [null, 13, 13]);
  R('ACTIONS.slchep()'); await doiXong();
  ok('sản lượng: chép lại đúng số mới', chep.includes('• Tổ Ngày: ca ngày 13/20 cn') && /Đã chép báo cáo sản lượng/.test(R('S.toast')), R('S.toast'));
  // báo cáo ca: y như vậy
  R(`S.screen = 'baocaoca'; S.bcCa = { ngay: '${D}', ca: 1 }; S.bcc = null;`);
  await R('bcTai()');
  R('ACTIONS.bcchep({})'); await doiXong();
  ok('báo cáo ca: chép đúng thiết lập hiện tại', chep.includes('Tổ Ngày: ca ngày 13/20 cn') && /Đã chép cả báo cáo/.test(R('S.toast')), R('S.toast'));
  eq('máy khác sửa thiết lập tổ Ngày thành 14', (await dat(14)).status, 200);
  R('ACTIONS.bcchep({})'); await doiXong();
  ok('báo cáo ca: chép lúc chưa làm mới là số cũ, nhưng báo đỏ', chep.includes('ca ngày 13/20 cn') && /Số vừa đổi/.test(R('S.toast')), R('S.toast'));
  R('ACTIONS.bcchep({})'); await doiXong();
  ok('báo cáo ca: chép lại đúng số mới, hết báo', chep.includes('Tổ Ngày: ca ngày 14/20 cn') && /Đã chép cả báo cáo/.test(R('S.toast')), R('S.toast'));
  R('ACTIONS.bcchep({ k: "s3" })'); await doiXong();
  ok('báo cáo ca: chép riêng mục quân số cũng đúng số mới', chep.startsWith('3. ') && chep.includes('ca ngày 14/20 cn'), chep);
  // ngày đã lưu giữ thiết lập sản lượng lúc lưu: màn và chữ cùng số cũ, có nhắc; bấm Tính lại thì theo thiết lập hiện tại
  R(`S.screen = 'sanluong'`); await tai();
  const kg = (t) => Number(/Tổ Ngày: ca ngày \d+\/20 cn gia công thép (\d+) kg/.exec(t)[1]);
  const kg0 = kg(R('slTao()'));
  eq('đổi tỷ lệ giá sang 0,5', (await S.call('PUT', '/sanluong/thietlap', { gia: 0.5 }, 'CV')).status, 200);
  await tai();
  eq('đã lưu: bản chữ giữ thiết lập lúc lưu', kg(R('slTao()')), kg0);
  ok('màn hình nhắc khác thiết lập hiện tại', R('vSanLuong()').includes('Tính lại theo thiết lập hiện tại'));
  R('ACTIONS.slai()');
  eq('bấm Tính lại: bản chữ theo tỷ lệ giá 0,5', kg(R('slTao()')), Math.round(14 * 158 * R('S.sl.tl.gc[' + U['Ngày'] + ']') / 0.5));

  xong = true;
  const fail = T.filter((x) => x[0] === 'FAIL');
  console.log(T.map((x) => x[0] + ' | ' + x[1] + (x[2] && x[0] === 'FAIL' ? '  [' + x[2] + ']' : '')).join('\n'));
  console.log('\n=== ' + T.length + ' kiểm tra, ' + fail.length + ' lỗi ===');
  process.exit(fail.length ? 1 : 0);
}
main().catch((e) => { console.log('CRASH', e); process.exit(2); });
