/* Bảng thiết lập mở từ BÁO CÁO CA NGÀY: cột Đêm / Nghỉ đêm là CA ĐÊM HÔM TRƯỚC (chốt 2026-11-05). node demht.test.mjs <repo>
   Dựng đúng thao tác thật ngày 05/11: 7h20 CVKTHT mở báo cáo ca ngày, bấm bánh răng, gõ số và lý do nghỉ của đêm vừa qua. Trước đây số đó
   thành số đêm TỐI NAY (lưu bảng còn chép chốt đêm qua trước), ô "Đêm hôm trước" thì không có chỗ ghi người nghỉ và xoá người nghỉ đã có:
   báo cáo ca ngày và sản lượng không có lý do nghỉ ca đêm hôm trước. */
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
  // 7h20 sáng: ca đêm hôm qua vừa hết (6h30), ca ngày hôm nay đang chạy
  const cur = ((Date.now() + 7 * 3600e3) % 864e5) / 60e3;
  advance(((7 * 60 + 20 - cur + 1440) % 1440 || 1440) * 60e3);
  const S = await boot(ROOT);
  await S.call('POST', '/setup', { token: 'setup-tok', name: 'Admin', phone: '0900000001', pin: '2468' });
  await S.login('Admin', '0900000001', '2468');
  const U = {};
  let i = 2;
  for (const [name, role] of [['Hai', 'tieudoi'], ['Dem', 'tieudoi'], ['Ba', 'tieudoi'], ['CV', 'cvktht']]) {
    const phone = '09000000' + String(i++).padStart(2, '0');
    const r = await S.call('POST', '/users', { name, phone, role }, 'Admin');
    await S.login(name, phone, r.data.pin);
    await S.call('POST', '/change-pin', { pin: r.data.pin, newPin: '1357' }, name);
    U[name] = r.data.id;
  }
  const D = vnDay(), hom = vnDay(Date.now() - 864e5), dd = (x) => x.slice(8, 10) + '/' + x.slice(5, 7);
  const tl = (ten, b) => S.call('PUT', '/quanso/thietlap', { user: U[ten], ts: 0, ...b }, 'CV');
  eq('Hai hai ca: tổng 15, ngày 7, đêm 8', (await tl('Hai', { ca: 3, tong: 15, s1: 7, s2: 8 })).status, 200);
  eq('Dem làm đêm: tổng 12, đêm 10', (await tl('Dem', { ca: 2, tong: 12, s1: 0, s2: 10 })).status, 200);
  eq('Ba làm đêm: tổng 9, đêm 9', (await tl('Ba', { ca: 2, tong: 9, s1: 0, s2: 9 })).status, 200);
  await S.cron(); // lịch mỗi giờ chép số ca đêm vừa hết
  eq('đã chép ca đêm hôm qua (Hai 8, Dem 10)', S.sql('SELECT user_id, lam FROM quan_so_tl WHERE ngay = ? AND ca = 2 ORDER BY user_id', hom).map((r) => r.lam), [8, 10, 9]);
  eq('Ba tự báo ca đêm hôm qua 7, 2 ốm', (await S.call('PUT', '/quanso', { ngay: hom, ca: 2, user: U['Ba'], tong: 9, lam: 7, nghi: { om: 2 } }, 'CV')).status, 200);

  const store = {};
  const el = () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, appendChild() {}, remove() {}, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} });
  const ctx = {
    console, Date, Math, JSON, String, Number, Object, Array, Set, Map, parseInt, parseFloat, isNaN, Promise, RegExp, Error, TypeError, encodeURIComponent,
    setTimeout: () => 0, clearTimeout: () => {},
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; }, key: (n) => Object.keys(store)[n] || null, get length() { return Object.keys(store).length; } },
    navigator: { onLine: true, clipboard: { writeText: async () => {} } },
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
  let dangGo = 0;
  const go0 = ctx.go;
  ctx.go = (...a) => { dangGo++; return Promise.resolve(go0(...a)).finally(() => { dangGo--; }); };
  const cho = async () => { for (let k = 0; k < 3000; k++) { await new Promise((r) => setImmediate(r)); if (!R('S.busy') && !dangGo && k > 40) return; } };
  const bt = (await S.call('GET', '/bootstrap', undefined, 'CV')).data;
  R(`S.boot = ${JSON.stringify(bt)}; indexBoot(S.boot); S.me = ${JSON.stringify({ id: U['CV'], name: 'CV', role: 'cvktht' })}; S.form = {}; S.screen = 'more';`);
  const cfg = () => JSON.parse(S.one('SELECT data FROM bc_mau WHERE id = 1').data);
  const chep = (ten) => { const r = S.one('SELECT lam, nghi FROM quan_so_tl WHERE ngay = ? AND ca = 2 AND user_id = ?', hom, U[ten]); return r && [r.lam, JSON.parse(r.nghi)]; };
  const dong = async (ngay, ca, ten) => { const B = (await S.call('GET', `/baocao?ngay=${ngay}&ca=${ca}`, undefined, 'CV')).data; return R(`bcQuanSo(${JSON.stringify(B)}, 'to').dong.find((l) => l.startsWith('Tổ ${ten}'))`); };

  // mở báo cáo ca ngày hôm nay, bấm bánh răng ở mục 3
  R(`S.bcCa = { ngay: '${D}', ca: 1 }; S.bcc = null; go('baocaoca')`); await cho();
  R('ACTIONS.bctl()'); await cho();
  const v = R('vQuanSo()');
  ok('mở từ báo cáo ca ngày: cột Đêm ghi ngày đêm hôm trước, có lời nói rõ', R('S.screen') === 'quanso' && v.includes('Đêm<br>' + dd(hom)) && v.includes('(đêm hôm trước)'), v.slice(0, 300));
  eq('cột Đêm hiện số của đêm hôm trước (bản đã chép)', [R(`fv('tl_${U['Hai']}_2', qsTlMacDinh(${U['Hai']}).s2)`), R(`fv('tl_${U['Dem']}_2', qsTlMacDinh(${U['Dem']}).s2)`)].map(String), ['8', '10']);
  ok('tổ đã tự báo đêm hôm trước: ô Đêm khoá', new RegExp(`id="tl_${U['Ba']}_2"[^>]*disabled`).test(v));
  // gõ số và lý do nghỉ của đêm vừa qua, như sáng 05/11
  R(`Object.assign(S.form, { 'tl_${U['Hai']}_2': '6', 'tl_${U['Hai']}_n2_que': '2', 'tl_${U['Dem']}_n2_off': '2' }); ACTIONS.qstlluu()`); await cho();
  ok('lưu được', /Đã lưu/.test(R('S.toast')), R('S.toast'));
  eq('đêm hôm trước: Hai 6 + 2 về quê, Dem 10 + 2 OFF (ghi đủ người nghỉ)', [chep('Hai'), chep('Dem')], [[6, { que: 2 }], [10, { off: 2 }]]);
  eq('số đêm TỐI NAY không bị đổi (Hai 8, không người nghỉ)', [cfg().tl[U['Hai']].s2, cfg().tl[U['Hai']].n2 || {}], [8, {}]);
  eq('báo cáo ca ngày: Hai ghi ca đêm 6 kèm lý do nghỉ ca đêm', await dong(D, 1, 'Hai'), 'Tổ Hai: ca ngày 7/15 cn, ca đêm 6/15 cn, nghỉ 2 cn — ca đêm: 2 về quê');
  eq('báo cáo ca ngày: Dem (làm ca đêm) có lý do nghỉ', await dong(D, 1, 'Dem'), 'Tổ Dem (làm ca đêm): ca đêm 10/12 cn, nghỉ 2 cn — 2 OFF luân phiên');
  eq('báo cáo ca ngày: Ba theo số tổ tự báo', await dong(D, 1, 'Ba'), 'Tổ Ba (làm ca đêm): ca đêm 7/9 cn, nghỉ 2 cn — 2 ốm');
  eq('báo cáo ca đêm hôm trước: cùng số, cùng lý do', await dong(hom, 2, 'Dem'), 'Tổ Dem: ca đêm 10/12 cn, nghỉ 2 cn — 2 OFF luân phiên');
  eq('báo cáo ca đêm tối nay vẫn theo số đêm tối nay (Hai 8)', (await dong(D, 2, 'Hai')).startsWith('Tổ Hai: ca đêm 8/15 cn'), true);
  await R(`slLay('${D}').then((L) => { S.sl = L; slGan(); })`);
  eq('sản lượng: Hai ngày 7 + đêm 6', R(`(() => { const u = S.sl.to.find((x) => x.id === ${U['Hai']}); return [u.ngay.lam, u.dem.lam]; })()`), [7, 6]);
  // mở lại: cột Đêm hiện số vừa ghi
  R(`S.screen = 'baocaoca'; ACTIONS.bctl()`); await cho();
  eq('mở lại: cột Đêm là 6, nghỉ đêm 2 về quê', [String(R(`fv('tl_${U['Hai']}_2', qsTlMacDinh(${U['Hai']}).s2)`)), R(`qsTlNghi(${U['Hai']}, 2).nghi`)], ['6', { que: 2 }]);
  // sửa ngày (không đụng cột Đêm): chỉ đổi số thiết lập ca ngày, không ghi lại đêm hôm trước
  const ts0 = S.one('SELECT ts FROM quan_so_tl WHERE ngay = ? AND ca = 2 AND user_id = ?', hom, U['Hai']).ts;
  R(`S.form['tl_${U['Hai']}_1'] = '5'; ACTIONS.qstlluu()`); await cho();
  eq('sửa ca ngày: số thiết lập ngày 5, đêm tối nay vẫn 8, đêm hôm trước không ghi lại', [cfg().tl[U['Hai']].s1, cfg().tl[U['Hai']].s2, S.one('SELECT ts FROM quan_so_tl WHERE ngay = ? AND ca = 2 AND user_id = ?', hom, U['Hai']).ts], [5, 8, ts0]);
  // mở từ báo cáo ca ĐÊM: cột Đêm là đêm tối nay như cũ
  R(`S.screen = 'more'; S.bcCa = { ngay: '${D}', ca: 2 }; S.bcc = null; go('baocaoca')`); await cho();
  R('ACTIONS.bctl()'); await cho();
  ok('mở từ báo cáo ca đêm: cột Đêm là đêm tối nay', R('vQuanSo()').includes('Làm<br>đêm') && String(R(`fv('tl_${U['Hai']}_2', qsTlMacDinh(${U['Hai']}).s2)`)) === '8');
  // server: người nghỉ quá tổng thì từ chối, nói rõ
  eq('đêm hôm trước đi làm + nghỉ vượt tổng: từ chối', (await S.call('PUT', '/quanso/thietlap', { ds: [], dem_truoc: { ngay: hom, ds: [{ user: U['Dem'], lam: 11, n2: { om: 2 } }] } }, 'CV')).status, 400);

  xong = true;
  const fail = T.filter((x) => x[0] === 'FAIL');
  console.log(T.map((x) => x[0] + ' | ' + x[1] + (x[2] && x[0] === 'FAIL' ? '  [' + x[2] + ']' : '')).join('\n'));
  console.log('\n=== ' + T.length + ' kiểm tra, ' + fail.length + ' lỗi ===');
  process.exit(fail.length ? 1 : 0);
}
main().catch((e) => { console.log('CRASH', e); process.exit(2); });
