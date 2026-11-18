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
  /* CHỜ THEO ĐIỀU KIỆN, không theo số vòng: đăng nhập / xác thực có bước chạy bất đồng bộ thật (băm PIN, phiên), máy bận thì 300 vòng chưa đủ —
     test từng hỏng ngẫu nhiên (~1/5 lần) vì bấm Sửa lúc màn báo cáo ca chưa tải xong. */
  const cho = async (f) => { for (let i = 0; i < 50000; i++) { await new Promise((z) => setImmediate(z)); if (f()) { await tick(20); return true; } } return false; };
  const moBc = async (ngay, ca) => { R(`Object.keys(NHO).filter((k) => /^bc:/.test(k)).forEach((k) => delete NHO[k]); S.bcCa = { ngay: '${ngay}', ca: ${ca} }; S.bcc = null; go('baocaoca', true)`); await cho(() => R(`!!(S.bcc && S.bcc.ngay === '${ngay}' && S.bcc.ca === ${ca} && !S.busy)`)); };
  const xong = async () => { await tick(10); await cho(() => !R('S.busy')); };
  const dong = (ten) => R("bcAuto(S.bcc, 's3')").split('\n').find((l) => l.includes('Tổ ' + ten));
  return { R, moBc, dong, loi, xong };
}

const bcBanS3 = (M) => M.R('bcBan(S.bcc).s3') || '';
async function main() {
  toi(20, 0);
  const { S, U } = await dung([['A', 'tieudoi'], ['B', 'tieudoi'], ['C', 'tieudoi'], ['E', 'tieudoi'], ['CV', 'cvktht'], ['Trung', 'trungdoi']]);
  await S.call('PUT', '/quanso/lich', { ca: 2 }, 'E'); await S.call('PUT', '/quanso/thietlap', { user: U.E, ts: 0, ca: 2, tong: 10, s1: 0, s2: 9 }, 'CV');
  await S.call('PUT', '/quanso/lich', { ca: 2 }, 'A'); await S.call('PUT', '/quanso/thietlap', { user: U.A, ts: 0, ca: 2, tong: 10, s1: 0, s2: 10 }, 'CV');
  await S.call('PUT', '/quanso/lich', { ca: 1 }, 'B'); await S.call('PUT', '/quanso/thietlap', { user: U.B, ts: 0, ca: 1, tong: 12, s1: 12, s2: 0 }, 'CV');
  await S.call('PUT', '/quanso/lich', { ca: 3 }, 'C'); await S.call('PUT', '/quanso/thietlap', { user: U.C, ts: 0, ca: 3, tong: 16, s1: 8, s2: 8 }, 'CV');
  advance(864e5); toi(19, 0);
  const H = vnDay(); // ca đêm H: tối hôm trước
  toi(7, 5); await S.cron();
  const D = vnDay();
  eq('sáng D: lượt chép đã chép ca đêm H (A 10, C 8, E 9)', S.sql('SELECT user_id u, lam FROM quan_so_tl WHERE ngay = ? AND ca = 2 ORDER BY u', H).map((r) => [r.u, r.lam]), [[U.A, 10], [U.C, 8], [U.E, 9]]);
  const M = await may(S, U, 'CV');
  toi(10, 0);
  /* 1. 10h sáng D sửa số ca đêm H của tổ A */
  await M.moBc(H, 2);
  M.R(`ACTIONS.bcsuaca({ id: '${U.A}' })`); M.R("S.form.bsc_t = '10'; S.form.bsc_l = '7'; S.form.bsc_n_om = '3'; ACTIONS.bcsualuu()"); await M.xong();
  eq('1: báo cáo ca đêm H theo số vừa sửa', M.dong('A'), 'Tổ A: ca đêm 7/10 cn, nghỉ 3 cn — 3 ốm');
  ok('1: dòng tổ A ghi người sửa (chỉ trên màn hình)', /✎ Sửa: CV · /.test(M.R('vBaoCaoCa()')) && !/sửa: CV/i.test(M.R('bcTao()')), M.R(`bcQuanSo(S.bcc).sua.join('|')`));
  eq('1: nguồn "Chỉ số thiết lập": số đã Sửa cho riêng ca này vẫn được dùng', M.R(`bcQuanSo(S.bcc, 'tl').rows.find((r) => r.u.id === ${U.A}).lam`), 7);
  /* 2. tổ C không làm ca đêm H */
  M.R(`ACTIONS.bcsuaca({ id: '${U.C}' })`); M.R('ask = async () => true'); M.R("ACTIONS.bcsuakhong({ v: '1' })"); await M.xong();
  eq('2: tổ C không làm ca đêm H', M.dong('C'), 'Tổ C: không làm ca đêm');
  ok('2: dòng tổ C ghi người đánh dấu', /Đánh dấu không làm: CV · /.test(M.R(`bcQuanSo(S.bcc).sua.join('|')`)), M.R(`bcQuanSo(S.bcc).sua.join('|')`));
  eq('2: tổng ca đêm H: đi làm 7 (A) + 9 (E)', M.R('bcQuanSo(S.bcc).lam'), 16);
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
  eq('4: sản lượng D: A 10 + 7, B 12, C 8 (không cộng đêm H), E 9 (đêm H)', JSON.parse(M.R('JSON.stringify(slTinh().dong.map((r) => [r.u.name, r.cong]))')), [['A', 17], ['B', 12], ['C', 8], ['E', 9]]);
  ok('4: sản lượng ghi người sửa của tổ A', /sửa: CV/.test(M.R(`S.sl.to.find((u) => u.name === 'A').sua`) || '') && M.R('vSanLuong()').includes('✎'), M.R(`S.sl.to.find((u) => u.name === 'A').sua`));
  /* 4b. XUNG ĐỘT NÚT SỬA / BÁNH RĂNG (lỗi 18/11) — lần sửa sau cùng thắng, dù sửa ở đâu */
  {
    // tổ E (chỉ ca đêm) ở báo cáo ca NGÀY: bấm Sửa thì chọn sẵn ca đêm hôm trước — ca có số trên dòng của tổ — không ghi nhầm vào ca ngày
    await M.moBc(D, 1);
    M.R(`ACTIONS.bcsuaca({ id: '${U.E}' })`);
    eq('4b: Sửa tổ E (làm ca đêm) trên báo cáo ca ngày: chọn sẵn ca đêm hôm trước, điền số 9', M.R('JSON.stringify([S.bcSuaCa.ngay, S.bcSuaCa.ca, S.form.bsc_l])'), JSON.stringify([H, 2, '9']));
    ok('4b: form có hai nút chọn ca', (M.R('vBaoCaoCa()').match(/data-a="bcsuachon"/g) || []).length === 2);
    M.R("S.form.bsc_l = '8'; ACTIONS.bcsualuu()"); await M.xong();
    eq('4b: lưu vào ca đêm H, không có gì ở ca ngày D', [S.one('SELECT lam FROM quan_so WHERE ngay = ? AND ca = 2 AND user_id = ?', H, U.E)?.lam, S.one('SELECT COUNT(*) n FROM quan_so WHERE ngay = ? AND ca = 1 AND user_id = ?', D, U.E).n], [8, 0]);
    M.R(`ACTIONS.bcsuaca({ id: '${U.E}' }); ACTIONS.bcsuachon({ v: '${D}|1' })`);
    eq('4b: đổi sang ca ngày D trong form: ô trống (tổ không làm ca ngày)', M.R('JSON.stringify([S.bcSuaCa.ngay, S.bcSuaCa.ca, S.form.bsc_l])'), JSON.stringify([D, 1, '']));
    M.R('ACTIONS.bcsuadong()');
    // bánh răng sửa số đêm hôm trước SAU khi đã bấm Sửa: trước đây bị chặn "tổ đã tự báo" (thật ra là CVKTHT ghi thay)
    const Q2 = (await S.call('GET', '/quanso', undefined, 'CV')).data;
    ok('4b: /quanso gửi kèm người ghi số đêm hôm trước', Q2.demTr.bao[U.A] && Q2.demTr.bao[U.A].by_id === U.CV);
    const r1 = await S.call('PUT', '/quanso/thietlap', { ds: [], dem_truoc: { ngay: H, ds: [{ user: U.A, lam: 6, tong: 10, n2: { om: 4 }, ts: (Q2.demTr.so[U.A] || {}).ts || 0 }] } }, 'CV');
    eq('4b: bánh răng sửa số đêm H của tổ A (đã Sửa ghi thay trước đó): được', r1.status, 200);
    await M.moBc(H, 2);
    eq('4b: báo cáo ca đêm H theo số bánh răng vừa lưu (sau cùng thắng)', M.dong('A'), 'Tổ A: ca đêm 6/10 cn, nghỉ 4 cn — 4 ốm');
    // bánh răng ghi số đêm H cho tổ C (đang đánh dấu không làm đêm H): bỏ dấu, số ăn
    const r2 = await S.call('PUT', '/quanso/thietlap', { ds: [], dem_truoc: { ngay: H, ds: [{ user: U.C, lam: 5, tong: 16, ts: 0 }] } }, 'CV');
    await M.moBc(H, 2);
    eq('4b: bánh răng ghi số đêm H cho tổ đang "không làm": bỏ dấu, báo cáo theo số mới', [r2.status, /^Tổ C: ca đêm 5\/16/.test(M.dong('C') || '')], [200, true]);
    // số thiết lập ca ĐANG CHẠY đổi sau khi đã Sửa ca đó: số thiết lập mới thắng
    await S.call('PUT', '/quanso', { ngay: D, ca: 1, user: U.B, tong: 12, lam: 11, nghi: { om: 1 } }, 'CV');
    const Q3 = (await S.call('GET', '/quanso', undefined, 'CV')).data;
    eq('4b: bánh răng đổi số ca ngày của tổ B sau khi đã Sửa ca ngày D', (await S.call('PUT', '/quanso/thietlap', { ds: [{ user: U.B, tong: 12, s1: 10, s2: 0, n1: { phep: 2 }, ts: Q3.tl[U.B].ts }] }, 'CV')).status, 200);
    await M.moBc(D, 1);
    // số thiết lập là số dùng hằng ngày; số "Sửa" là số chính xác của riêng ca đó — sửa bánh răng (cho các ngày sau) không xoá số chính xác đã Sửa
    eq('4b: ca đang chạy đã Sửa: số Sửa giữ, bánh răng đổi sau không đè', M.dong('B'), 'Tổ B: ca ngày 11/12 cn, nghỉ 1 cn — 1 ốm');
    ok('4b: dòng có nhãn người sửa', /sửa: CV/i.test(M.R(`bcQuanSo(S.bcc).sua.join('|')`)));
    // tổ TỰ báo thì bánh răng không đè (như trước)
    await S.call('PUT', '/quanso', { ngay: D, ca: 1, tong: 12, lam: 12, nghi: {} }, 'B');
    const Q4 = (await S.call('GET', '/quanso', undefined, 'CV')).data;
    await S.call('PUT', '/quanso/thietlap', { ds: [{ user: U.B, tong: 12, s1: 9, s2: 0, n1: { phep: 3 }, ts: Q4.tl[U.B].ts }] }, 'CV');
    await M.moBc(D, 1);
    eq('4b: tổ B tự báo ca ngày D: số tổ báo giữ nguyên dù bánh răng đổi sau', M.dong('B'), 'Tổ B: ca ngày 12/12 cn');
    await M.R(`slLay('${D}').then((L) => { slDung(L, false); })`); await tick(100);
  }
  /* 4c. SỐ VỪA SỬA LUÔN VÀO BÁO CÁO, kể cả khi mục 3 đã sửa tay bằng chữ (chốt 2026-11-18) */
  {
    // nháp trên máy: mục 3 báo cáo ca ngày D sửa tay ghi tổ A 99 người
    await M.moBc(D, 1);
    M.R(`S.bcM.s3 = bcAuto(S.bcc, 's3').replace(/Tổ A: [^\\n]*/, 'Tổ A: ca ngày 99/99 cn'); bcNhap()`);
    eq('4c: mục 3 sửa tay (nháp): chữ thắng số app', bcBanS3(M).includes('Tổ A: ca ngày 99/99 cn'), true);
    M.R(`ACTIONS.bcsuaca({ id: '${U.A}' })`); M.R("S.form.bsc_t = '10'; S.form.bsc_l = '9'; S.form.bsc_n_om = '1'; ACTIONS.bcsualuu()"); await M.xong();
    eq('4c: bấm Sửa tổ A ca ngày D: chữ sửa tay bỏ, báo cáo theo số vừa sửa', [M.R("typeof S.bcM.s3"), M.dong('A')], ['undefined', 'Tổ A: ca ngày 9/10 cn, ca đêm 6/10 cn, nghỉ 5 cn — ca ngày: 1 ốm; ca đêm: 4 ốm']);
    // bản đã lưu trên máy chủ: báo cáo ca đêm H có chữ sửa tay ghi tổ E 1 người — báo cáo ca ngày D và sản lượng D đọc chữ đó
    S.raw.prepare("INSERT INTO bao_cao_ca (ngay, ca, data, van_ban, ts, by_id) VALUES (?, 2, ?, 'x', ?, ?) ON CONFLICT(ngay, ca) DO UPDATE SET data = excluded.data")
      .run(H, JSON.stringify({ muc: { s3: 'Quân số đi làm trong ca 2 là: 1 công nhân\nTổ E: ca đêm 1/10 cn' } }), Date.now(), U.CV);
    await M.moBc(D, 1);
    ok('4c: báo cáo ca ngày D đọc chữ sửa tay của ca đêm H (E 1)', /ca đêm 1\/10/.test(M.dong('E') || ''), M.dong('E'));
    M.R(`ACTIONS.bcsuaca({ id: '${U.E}' })`); M.R("S.form.bsc_l = '7'; ACTIONS.bcsualuu()"); await M.xong();
    eq('4c: Sửa tổ E ca đêm H: máy chủ bỏ chữ sửa tay của ca đêm H', S.one("SELECT json_type(data, '$.muc.s3') t FROM bao_cao_ca WHERE ngay = ? AND ca = 2", H).t, null);
    await M.moBc(D, 1);
    ok('4c: báo cáo ca ngày D theo số vừa sửa (E ca đêm 7)', /ca đêm 7\/10/.test(M.dong('E') || ''), M.dong('E'));
    await M.R(`slLay('${D}').then((L) => { slDung(L, false); })`); await tick(100);
    eq('4c: sản lượng D theo số vừa sửa: A 9 + 6, E 7', JSON.parse(M.R("JSON.stringify(slTinh().dong.filter((r) => r.u.name === 'A' || r.u.name === 'E').map((r) => [r.u.name, r.cong]))")), [['A', 15], ['E', 7]]);
    // Sửa 0 người đi làm (cả tổ nghỉ có lý do) cho tổ có lịch ca kia: vẫn là số của ca đó
    await M.moBc(H, 2);
    M.R(`ACTIONS.bcsuaca({ id: '${U.B}' }); ACTIONS.bcsuachon({ v: '${H}|2' })`); M.R("S.form.bsc_t = '12'; S.form.bsc_l = '0'; S.form.bsc_n_phep = '12'; ACTIONS.bcsualuu()"); await M.xong();
    eq('4c: tổ B (lịch ca ngày) Sửa ca đêm H 0 người, 12 phép: dòng ghi đúng số, không thành "(làm ca ngày)"', M.dong('B'), 'Tổ B: ca đêm 0/12 cn, nghỉ 12 cn — 12 nghỉ phép năm');
  }
  /* 5. thống kê và lượt chép */
  toi(19, 0); await S.cron();
  eq('5: hết ca ngày D: chép C 8 (A đã Sửa, B đã tự báo: không chép)', S.sql('SELECT user_id u, lam FROM quan_so_tl WHERE ngay = ? AND ca = 1 ORDER BY u', D).map((r) => [r.u, r.lam]), [[U.C, 8]]);
  const tk = (await S.call('GET', `/quanso/thongke?tu=${H}&den=${D}`, undefined, 'CV')).data;
  eq('5: thống kê ca đêm H: A 6 (bánh răng), B 0 (Sửa), C 5 (bánh răng), E 7 (Sửa)', tk.qs.filter((x) => x.ngay === H && x.ca === 2).map((x) => [x.u, x.lam]).concat(tk.tl.filter((x) => x.ngay === H && x.ca === 2 && !tk.qs.some((q) => q.ngay === H && q.ca === 2 && q.u === x.u)).map((x) => [x.u, x.lam])).sort((a, b) => a[0] - b[0]), [[U.A, 6], [U.B, 0], [U.C, 5], [U.E, 7]]);
  /* 6. thẻ trên Tổng quan của cấp chỉ huy */
  const T2 = await may(S, U, 'Trung');
  T2.R(`S.me.role = 'trungdoi'; S.screen = 'home'`);
  const home = T2.R('vHome()');
  ok('6: Tổng quan của Trung đội trưởng có thẻ "Quân số vừa được sửa" kèm người sửa', /Quân số vừa được sửa \(\d+ lần\)/.test(home) && /CV sửa (quân số|số đêm)/.test(home) && T2.R('S.boot.qsSua.some((x) => x.action === "qs_khong" && x.d.to === "C")'), home.slice(home.indexOf('Cần xử lý'), home.indexOf('Cần xử lý') + 400));
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
