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
  // 9h sáng: số đêm qua đặt ở ô Đêm hôm trước, ô Đêm là số của đêm nay
  eq('đặt ô Đêm hôm trước: Đêm 17, Hai 9, Mới 6', (await S.call('PUT', '/quanso/thietlap', { ds: [], dem_truoc: { ngay: hom, ds: [{ user: U['Đêm'], lam: 17 }, { user: U['Hai'], lam: 9 }, { user: U['Mới'], lam: 6 }] } }, 'CV')).status, 200);
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
  // báo cáo i: 0 = ca ngày hôm nay (S.sl.bc), 1 = ca đêm hôm trước (số liệu đi kèm báo cáo ca ngày: S.sl.bc.demTr)
  const bcI = (i) => (i ? 'S.sl.bc.demTr' : 'S.sl.bc');
  const dong = (i, ten) => R(`bcQuanSo(${bcI(i)}, bcBan(${bcI(i)}).nguon).dong.find((l) => l.startsWith('Tổ ${ten}'))`);

  await tai();
  eq('báo cáo sản lượng đọc báo cáo ca ngày hôm nay, kèm ca đêm hôm trước', R(`[S.sl.bc.demTr.ngay, S.sl.bc.demTr.ca, S.sl.bc.ngay, S.sl.bc.ca].join()`), [hom, 2, D, 1].join());
  // [ca đêm hôm trước, ca ngày hôm nay, tổng công]
  eq('số từng tổ (đêm, ngày, cộng)', Object.fromEntries(['Ngày', 'Đêm', 'Hai', 'Khai', 'Mới'].map((t) => [t, so(t)])), { 'Ngày': [null, 12, 12], 'Đêm': [17, null, 17], 'Hai': [9, 8, 17], 'Khai': [10, 10, 20], 'Mới': [6, 5, 11] });
  ok('báo cáo ca ngày ghi tổ Hai 8 + đêm 9', /ca ngày 8\/20 cn, ca đêm 9\/20 cn/.test(dong(0, 'Hai')), dong(0, 'Hai'));
  ok('báo cáo ca đêm hôm trước ghi tổ Hai 9', /ca đêm 9\/20 cn/.test(dong(1, 'Hai')), dong(1, 'Hai'));
  ok('báo cáo ca đêm hôm trước ghi tổ Đêm 17', /ca đêm 17\/20 cn/.test(dong(1, 'Đêm')), dong(1, 'Đêm'));
  ok('báo cáo ca ngày ghi tổ Khai 10 + đêm 10', /ca ngày 10\/20 cn, ca đêm 10\/20 cn/.test(dong(0, 'Khai')), dong(0, 'Khai'));
  // tổ chỉ làm đêm, tổ chưa đặt lịch: báo cáo ca ngày cũng ghi số ca đêm hôm trước, đúng số sản lượng dùng
  eq('báo cáo ca ngày ghi tổ Đêm (làm ca đêm) 17', dong(0, 'Đêm'), 'Tổ Đêm (làm ca đêm): ca đêm 17/20 cn');
  ok('báo cáo ca ngày ghi tổ Mới 5 + đêm 6', /ca ngày 5\/20 cn, ca đêm 6\/20 cn/.test(dong(0, 'Mới')), dong(0, 'Mới'));
  ok('bản chữ sản lượng: tổ Hai đủ hai ca', R('slTao()').includes('• Tổ Hai: ca ngày 8/20 cn, ca đêm 9/20 cn'), R('slTao()'));
  ok('bản chữ sản lượng: tổ Khai đủ hai ca như báo cáo ca', R('slTao()').includes('• Tổ Khai: ca ngày 10/20 cn, ca đêm 10/20 cn'), R('slTao()'));
  /* chốt 2026-11-05: "ca đêm" trên dòng của báo cáo ca ngày T là ca đêm T-1; sản lượng T cộng cả hai ca ĐÚNG như dòng đó ghi, kể cả tổ
     CHƯA ĐẶT LỊCH hai ca (trước đây tổ chưa đặt lịch thì dòng ghi ca đêm mà sản lượng không cộng). */
  const lichCu = S.one('SELECT data FROM bc_mau WHERE id = 1').data;
  S.raw.prepare(`UPDATE bc_mau SET data = json_remove(data, '$.lich."${U['Khai']}"') WHERE id = 1`).run();
  await tai();
  eq('Khai chưa đặt lịch: báo cáo ca ngày ghi ca ngày 10 + ca đêm 10, sản lượng cộng 20', [dong(0, 'Khai'), so('Khai')], ['Tổ Khai: ca ngày 10/20 cn, ca đêm 10/20 cn', [10, 10, 20]]);
  S.raw.prepare('UPDATE bc_mau SET data = ? WHERE id = 1').run(lichCu);

  /* NGUỒN SỐ CỦA CA ĐÊM ĐẨY SANG CA NGÀY. Trước đây phần ca đêm trên báo cáo ca ngày theo nguồn của báo cáo ca NGÀY, còn sản lượng theo
     nguồn của báo cáo ca ĐÊM: tổ Hai tự báo đêm 5 (thiết lập 9), ca đêm chọn "Chỉ số thiết lập" thì báo cáo ca ngày ghi 5, sản lượng 9. */
  eq('Hai tự báo ca đêm hôm trước 5', (await S.call('PUT', '/quanso', { ngay: hom, ca: 2, user: U['Hai'], tong: 20, lam: 5 }, 'CV')).status, 200);
  await tai();
  eq('ca đêm Theo tổ báo: ca ngày ghi đêm 5, sản lượng 5', [/ca đêm 5\/20 cn/.test(dong(0, 'Hai')), so('Hai')], [true, [5, 8, 13]]);
  eq('báo cáo ca đêm hôm trước chép với nguồn Chỉ số thiết lập', (await S.call('PUT', '/baocao', { ngay: hom, ca: 2, ts: 0, van_ban: 'x', muc: {}, nguon: 'tl' }, 'CV')).status, 200);
  await tai();
  eq('ca đêm Chỉ số thiết lập: báo cáo ca đêm 9, báo cáo ca ngày 9, sản lượng 9', [/ca đêm 9\/20 cn/.test(dong(1, 'Hai')), /ca ngày 8\/20 cn, ca đêm 9\/20 cn/.test(dong(0, 'Hai')), so('Hai')], [true, true, [9, 8, 17]]);
  S.raw.prepare('DELETE FROM bao_cao_ca WHERE ngay = ? AND ca = 2').run(hom);
  S.raw.prepare('DELETE FROM quan_so WHERE ngay = ? AND ca = 2 AND user_id = ?').run(hom, U['Hai']);

  // sửa MỘT bảng thiết lập: ca đang chạy đổi ở cả báo cáo ca và sản lượng
  const tsOf = (ten) => JSON.parse(S.one('SELECT data FROM bc_mau WHERE id = 1').data).tl[U[ten]].ts;
  eq('sửa thiết lập tổ Hai: ngày 7, đêm 9', (await S.call('PUT', '/quanso/thietlap', { user: U['Hai'], ts: tsOf('Hai'), tong: 20, s1: 7, s2: 9 }, 'CV')).status, 200);
  await tai();
  eq('sửa một chỗ: sản lượng theo ngay', so('Hai'), [9, 7, 16]);
  ok('sửa một chỗ: báo cáo ca ngày theo ngay', /ca ngày 7\/20 cn/.test(dong(0, 'Hai')), dong(0, 'Hai'));

  // ca đêm đã chép lúc hết ca: sửa số đặt sau đó không đổi ca đêm hôm trước ở cả hai báo cáo, ca ngày vẫn theo số mới
  eq('sửa thiết lập tổ Hai sau khi ca đêm đã chép: đêm 4, ngày 6', (await S.call('PUT', '/quanso/thietlap', { user: U['Hai'], ts: tsOf('Hai'), tong: 20, s1: 6, s2: 4 }, 'CV')).status, 200);
  await tai();
  eq('ca đêm hôm trước giữ 9, ca ngày hôm nay 6', so('Hai'), [9, 6, 15]);
  ok('báo cáo ca đêm hôm trước vẫn 9', /ca đêm 9\/20 cn/.test(dong(1, 'Hai')), dong(1, 'Hai'));
  ok('báo cáo ca ngày ghi đêm 9', /ca ngày 6\/20 cn, ca đêm 9\/20 cn/.test(dong(0, 'Hai')), dong(0, 'Hai'));

  // sửa tay số ca đêm NGAY TRONG báo cáo ca ngày (dòng tổ hai ca có cả số ca đêm): sản lượng cũng phải theo
  const nhap = (i, s3) => R(`localStorage.setItem(bcKey(${bcI(i)}), ${JSON.stringify(JSON.stringify({ v: 2, muc: { s3 }, dau: {}, ts: Date.now() + 1 }))}); slGan()`);
  nhap(0, 'Quân số\nTổ Hai: ca ngày 6/20 cn, ca đêm 3/20 cn');
  eq('sửa tay ca đêm trong báo cáo ca ngày: sản lượng theo', so('Hai'), [3, 6, 9]);
  /* CA ĐÊM ĐẨY SANG CA NGÀY: sửa tay ở báo cáo ca đêm hôm trước thì báo cáo ca ngày (chưa sửa tay) ghi theo, sản lượng theo báo cáo ca ngày.
     Báo cáo ca ngày đã sửa tay dòng đó thì chữ của báo cáo ca ngày là chữ đã gửi đi: sản lượng theo đúng chữ đó. */
  nhap(1, 'Quân số\nTổ Hai: ca đêm 2/20 cn\nTổ Đêm: ca đêm 15/20 cn');
  eq('ca ngày đã sửa tay dòng Hai: sản lượng vẫn theo báo cáo ca ngày', so('Hai'), [3, 6, 9]);
  eq('tổ Đêm không có dòng trong chữ sửa tay ca ngày: theo số ca đêm đẩy sang (15)', so('Đêm'), [15, null, 15]);
  R(`localStorage.removeItem(bcKey(S.sl.bc)); slGan()`);
  eq('bỏ sửa tay ca ngày: số ca đêm đã sửa tay đẩy sang, sản lượng theo', so('Hai'), [2, 6, 8]);
  /* HAI NGƯỜI: phần sửa ca đêm ở trên là NHÁP trên máy này (chưa chép). Máy khác vẫn thấy số cũ, nên màn sản lượng và báo cáo ca ngày
     của máy này nhắc chép báo cáo ca đêm đó trước. */
  ok('nháp ca đêm chưa chép: màn sản lượng nhắc, có nút mở báo cáo ca đêm', R('vSanLuong()').includes('sửa chưa chép') && R('vSanLuong()').includes(`data-a="bcmoca" data-v="${hom}:2"`));
  ok('báo cáo ca ngày cũng nhắc', R(`(() => { S.bcc = S.sl.bc; bcDung(S.bcc); S.bcV = bcVGoc(S.bcc); return vBaoCaoCa(); })()`).includes(`data-a="bcmoca" data-v="${hom}:2"`));
  // máy KHÁC (không có nháp đó) chép báo cáo ca đêm với số khác: máy này vẫn theo nháp của mình, máy khác theo bản đã chép
  eq('máy khác chép báo cáo ca đêm: Hai 7', (await S.call('PUT', '/baocao', { ngay: hom, ca: 2, ts: 0, van_ban: 'k', muc: { s3: 'Quân số\nTổ Hai: ca đêm 7/20 cn' } }, 'Admin')).status, 200);
  await tai();
  eq('máy này: nháp của mình (chưa chép) vẫn thắng, vẫn nhắc', [so('Hai'), R('vSanLuong()').includes('sửa chưa chép')], [[2, 6, 8], true]);
  R(`localStorage.removeItem(bcKey(S.sl.bc.demTr)); slGan()`);
  eq('bỏ nháp: theo bản máy khác đã chép (7), hết nhắc', [so('Hai'), R('vSanLuong()').includes('sửa chưa chép')], [[7, 6, 13], false]);
  S.raw.prepare('DELETE FROM bao_cao_ca WHERE ngay = ? AND ca = 2').run(hom);
  R(`localStorage.setItem(bcKey(S.sl.bc.demTr), ${JSON.stringify(JSON.stringify({ v: 2, muc: { s3: 'Quân số\nTổ Hai: ca đêm 2/20 cn\nTổ Đêm: ca đêm 15/20 cn' }, dau: {}, ts: Date.now() + 1 }))})`);
  await tai();
  // chữ sửa tay KIỂU CŨ của báo cáo ca ngày (chép trước bản này): "Tổ Đêm (làm ca đêm)" không có số — ca đêm của tổ Đêm không mất
  nhap(0, 'Quân số\nTổ Ngày: ca ngày 12/20 cn\nTổ Đêm (làm ca đêm)');
  eq('chữ sửa tay kiểu cũ: tổ Đêm vẫn có ca đêm đẩy sang (15)', so('Đêm'), [15, null, 15]);
  nhap(0, 'Quân số\nTổ Đêm (làm ca đêm): ca đêm 0/20 cn');
  eq('ghi rõ ca đêm 0/20: theo chữ đó', so('Đêm'), [0, null, 0]);
  R(`localStorage.removeItem(bcKey(S.sl.bc)); slGan()`);
  ok('báo cáo ca ngày ghi đúng số ca đêm đã sửa tay',/ca ngày 6\/20 cn, ca đêm 2\/20 cn/.test(dong(0, 'Hai')) && dong(0, 'Đêm') === 'Tổ Đêm (làm ca đêm): ca đêm 15/20 cn', dong(0, 'Hai') + ' | ' + dong(0, 'Đêm'));

  /* NÚT CHÉP: chữ chép ra phải theo thiết lập hiện tại. Máy khác vừa sửa mà máy này chưa làm mới thì chữ chép là số cũ (chép phải chạy ngay
     lúc bấm, không kịp hỏi máy chủ): lưu xong tải lại, báo đỏ để chép lại, lần chép sau đúng số mới. */
  const doiXong = async () => { for (let k = 0; k < 3000; k++) { await new Promise((r) => setImmediate(r)); if (!R('S.busy') && k > 40) return; } };
  R(`localStorage.removeItem(bcKey(S.sl.bc)); localStorage.removeItem(bcKey(S.sl.bc.demTr))`);
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
  R('ACTIONS.slrnd()'); await doiXong();
  const kg = (t) => Number(/Tổ Ngày: ca ngày \d+\/20 cn gia công thép (\d+) kg/.exec(t)[1]);
  const kg0 = kg(R('slTao()'));
  eq('đổi tỷ lệ giá sang 0,5', (await S.call('PUT', '/sanluong/thietlap', { gia: 0.5 }, 'CV')).status, 200);
  await tai();
  eq('đã lưu: bản chữ giữ thiết lập lúc lưu', kg(R('slTao()')), kg0);
  ok('màn hình nhắc khác thiết lập hiện tại', R('vSanLuong()').includes('Tính lại theo thiết lập hiện tại'));
  R('ACTIONS.slai()');
  eq('bấm Tính lại: bản chữ theo tỷ lệ giá 0,5', kg(R('slTao()')), Math.round(14 * 158 * R('S.sl.tl.gc[' + U['Ngày'] + ']') / 0.5));

  /* Báo cáo sản lượng ĐÃ LƯU chỉ giữ thiết lập SẢN LƯỢNG (công chuẩn, tỷ lệ); quân số vẫn theo bảng thiết lập quân số chung. */
  ok('báo cáo sản lượng hôm nay đã lưu', !!S.one('SELECT ts FROM san_luong WHERE ngay = ?', D));
  eq('sửa thiết lập quân số tổ Ngày thành 15', (await dat(15)).status, 200);
  await tai();
  eq('đã lưu: quân số vẫn theo bảng thiết lập', so('Ngày'), [null, 15, 15]);
  eq('đã lưu: công mặc định cũng theo', R(`slTinh().dong.find((r) => r.u.id === ${U['Ngày']}).cong`), 15);
  const bcNgay = (await S.call('GET', `/baocao?ngay=${D}&ca=1`, undefined, 'CV')).data, bcDem = (await S.call('GET', `/baocao?ngay=${D}&ca=2`, undefined, 'CV')).data;
  eq('cả hai báo cáo ca cùng đọc một bảng', JSON.stringify(bcDem.tl), JSON.stringify(bcNgay.tl));
  // ca đêm TỐI NAY: báo cáo ca đêm hôm nay đọc bảng chung, và sẽ là phần ca đêm của sản lượng ngày MAI
  eq('tổ Đêm: ca đêm tối nay dùng số thiết lập 17', R(`bcQuanSo(${JSON.stringify(bcDem)}, 'to').rows.find((r) => r.u.id === ${U['Đêm']}).lam`), 17);

  /* HAI CA ĐÊM TÁCH RIÊNG: ô Đêm là đêm nay, ô Đêm hôm trước là đêm qua, sửa ô này không đổi ô kia. */
  const datDem = (ten, s2) => S.call('PUT', '/quanso/thietlap', { user: U[ten], ts: tsOf(ten), tong: 20, s1: 0, s2 }, 'CV');
  const demTr = (ds, ngay = hom) => S.call('PUT', '/quanso/thietlap', { ds: [], dem_truoc: { ngay, ds } }, 'CV');
  const dTon = async () => (await S.call('GET', `/baocao?ngay=${D}&ca=2`, undefined, 'CV')).data;
  const demNay = async (ten) => R(`bcQuanSo(${JSON.stringify(await dTon())}, 'to').rows.find((r) => r.u.id === ${U[ten]}).lam`);
  eq('sửa ô Đêm thành 4 cho đêm nay', (await datDem('Đêm', 4)).status, 200);
  await tai();
  eq('đêm qua giữ 17', so('Đêm'), [17, null, 17]);
  eq('báo cáo ca đêm hôm nay dùng 4', await demNay('Đêm'), 4);
  eq('sửa ô Đêm hôm trước thành 16', (await demTr([{ user: U['Đêm'], lam: 16 }])).status, 200);
  await tai();
  eq('đêm qua theo ô Đêm hôm trước 16', so('Đêm'), [16, null, 16]);
  eq('đêm nay vẫn 4', await demNay('Đêm'), 4);
  eq('trang cũ từ hôm trước: từ chối', (await demTr([{ user: U['Đêm'], lam: 5 }], D)).status, 409);
  eq('nhiều hơn tổng: từ chối', (await demTr([{ user: U['Đêm'], lam: 21 }])).status, 400);
  ok('màn thiết lập có ngày đêm hôm trước và số đã đặt', (await S.call('GET', '/quanso', undefined, 'CV')).data.demTr.so[U['Đêm']].lam === 16);
  // không có bản chép: đêm qua ghi chưa báo, không lấy ô Đêm của đêm nay đè lên
  S.raw.prepare('DELETE FROM quan_so_tl WHERE ngay = ? AND ca = 2 AND user_id = ?').run(hom, U['Mới']);
  await tai();
  eq('không có số đêm qua: không đọc ô Đêm', so('Mới')[0], null);
  // tổ đã tự báo đêm qua: ô khoá, chọn nguồn Chỉ số thiết lập cũng không lấy ô Đêm của đêm nay
  eq('Đêm tự báo đêm qua 8', (await S.call('PUT', '/quanso', { ngay: hom, ca: 2, user: U['Đêm'], tong: 20, lam: 8 }, 'CV')).status, 200);
  eq('tổ đã báo: ô Đêm hôm trước bị từ chối', (await demTr([{ user: U['Đêm'], lam: 5 }])).status, 400);
  S.raw.prepare('DELETE FROM quan_so_tl WHERE ngay = ? AND ca = 2 AND user_id = ?').run(hom, U['Đêm']);
  // báo cáo ca đêm hôm trước chọn "Chỉ số thiết lập" (nháp trên máy): nguồn đó đẩy sang ca ngày
  const nguonDem = (nguon) => R(`localStorage.setItem(bcKey(S.sl.bc.demTr), ${JSON.stringify(JSON.stringify({ v: 2, muc: {}, dau: {}, nguon, ts: Date.now() + 1 }))}); slGan()`);
  await tai(); nguonDem('tl');
  eq('nguồn thiết lập: tổ đã báo vẫn đúng số báo', so('Đêm'), [8, null, 8]);
  eq('sửa ô Đêm thành 3', (await datDem('Đêm', 3)).status, 200);
  await tai(); nguonDem('tl');
  eq('nguồn thiết lập: sửa đêm nay không đổi đêm qua', so('Đêm'), [8, null, 8]);

  // ô "Đêm hôm trước" đã bỏ khỏi bảng thiết lập: số ca đêm đã hết chỉ lấy từ báo cáo ca đêm hôm đó
  await R('qsTai()');
  const vq = R(`(() => { const s = S.screen; S.screen = 'quanso'; const h = vQuanSo(); S.screen = s; return h; })()`);
  ok('bảng thiết lập không còn ô Đêm hôm trước', !vq.includes('(hôm trước)') && !/id="tl_\d+_d"/.test(vq) && vq.includes('data-a="qstlluu"'), vq.slice(0, 200));
  // tổ đã xoá mà ca đêm hôm trước còn số: báo cáo ca ngày vẫn có dòng, sản lượng vẫn tính (trước đây báo cáo ca ngày mất dòng)
  S.raw.prepare('UPDATE users SET deleted = 1 WHERE id = ?').run(U['Đêm']);
  await tai(); nguonDem('tl');
  eq('tổ đã xoá: báo cáo ca ngày ghi ca đêm 8, sản lượng 8', [dong(0, 'Đêm'), so('Đêm')], ['Tổ Đêm (làm ca đêm): ca đêm 8/20 cn', [8, null, 8]]);

  xong = true;
  const fail = T.filter((x) => x[0] === 'FAIL');
  console.log(T.map((x) => x[0] + ' | ' + x[1] + (x[2] && x[0] === 'FAIL' ? '  [' + x[2] + ']' : '')).join('\n'));
  console.log('\n=== ' + T.length + ' kiểm tra, ' + fail.length + ' lỗi ===');
  process.exit(fail.length ? 1 : 0);
}
main().catch((e) => { console.log('CRASH', e); process.exit(2); });
