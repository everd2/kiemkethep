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
  for (const [name, role] of [['Hai', 'tieudoi'], ['Dem', 'tieudoi'], ['Ba', 'tieudoi'], ['Bon', 'tieudoi'], ['Ngay', 'tieudoi'], ['Moi', 'tieudoi'], ['Tuan', 'tieudoi'], ['Du', 'tieudoi'], ['CV', 'cvktht']]) {
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
  // Bon làm đêm mà chưa có số đi làm (đêm qua chép thành "thiếu số"); Ngay làm ca ngày; Moi chưa có số thiết lập nào
  eq('Bon làm đêm, chưa có số', (await tl('Bon', { ca: 2, tong: 8, s1: 0, s2: 0 })).status, 200);
  eq('Ngay làm ca ngày 10/10', (await tl('Ngay', { ca: 1, tong: 10, s1: 10, s2: 0 })).status, 200);
  // Tuan làm đêm tổng 16, đêm qua 14 đi làm (như tổ Nguyễn Trọng Tuấn 05/11); Du làm đêm đủ cả tổ 16/16
  eq('Tuan làm đêm: tổng 16, đêm 14', (await tl('Tuan', { ca: 2, tong: 16, s1: 0, s2: 14 })).status, 200);
  eq('Du làm đêm: tổng 16, đêm 16', (await tl('Du', { ca: 2, tong: 16, s1: 0, s2: 16 })).status, 200);
  await S.cron(); // lịch mỗi giờ chép số ca đêm vừa hết
  eq('đã chép ca đêm hôm qua (Hai 8, Dem 10, Ba 9, Bon thiếu số, Tuan 14, Du 16)', S.sql('SELECT user_id, lam FROM quan_so_tl WHERE ngay = ? AND ca = 2 ORDER BY user_id', hom).map((r) => r.lam), [8, 10, 9, null, 14, 16]);
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
  const chep = (ten) => { const r = S.one('SELECT lam, nghi FROM quan_so_tl WHERE ngay = ? AND ca = 2 AND user_id = ?', hom, U[ten]); return r ? [r.lam, JSON.parse(r.nghi)] : undefined; };
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
  // ô Đêm app TỰ ĐIỀN (Bon: đêm qua thiếu số, app điền sẵn cả tổ) mà người dùng không gõ: lưu tổ khác không được ghi thành số đêm qua
  eq('Bon không gõ gì: đêm hôm trước vẫn thiếu số', S.one('SELECT lam FROM quan_so_tl WHERE ngay = ? AND ca = 2 AND user_id = ?', hom, U['Bon']).lam, null);
  // đổi tổ Ngay sang làm đêm ngay buổi sáng: đêm TỐI NAY có số cả tổ (như bảng thường), đêm hôm trước không ghi gì
  R(`S.form['tl_${U['Ngay']}_c'] = '2'; ACTIONS.qstlluu()`); await cho();
  eq('Ngay sang ca đêm: đêm tối nay 10, ngày 0, không có số đêm hôm trước', [cfg().lich[U['Ngay']].ca, cfg().tl[U['Ngay']].s2, cfg().tl[U['Ngay']].s1, chep('Ngay')], [2, 10, 0, undefined]);
  // tổ chưa có số thiết lập: số gõ ở cột Đêm vào đêm hôm trước (và làm số đêm tối nay)
  R(`Object.assign(S.form, { 'tl_${U['Moi']}_c': '2', 'tl_${U['Moi']}_t': '6', 'tl_${U['Moi']}_2': '5', 'tl_${U['Moi']}_n2_om': '1' }); ACTIONS.qstlluu()`); await cho();
  eq('Moi (chưa có số): đêm hôm trước 5 + 1 ốm, đêm tối nay 5', [chep('Moi'), cfg().tl[U['Moi']].s2], [[5, { om: 1 }], 5]);
  /* TỔ CÓ THÊM NGƯỜI (06/11: tổ Nguyễn Trọng Tuấn 16 -> 18). Sáng mở bảng từ báo cáo ca ngày, gõ tổng 18 và 4 người nghỉ đêm qua.
     Trước đây cả lần lưu bị từ chối: tổng của đêm hôm trước luôn lấy theo bản đã chép (16), 14 + 4 = 18 > 16. */
  const demTr = (ten) => { const r = S.one('SELECT tong, lam, nghi FROM quan_so_tl WHERE ngay = ? AND ca = 2 AND user_id = ?', hom, U[ten]); return r && [r.tong, r.lam, JSON.parse(r.nghi)]; };
  R(`S.screen = 'baocaoca'; ACTIONS.bctl()`); await cho();
  R(`Object.assign(S.form, { 'tl_${U['Tuan']}_t': '18', 'tl_${U['Tuan']}_n2_que': '2', 'tl_${U['Tuan']}_n2_off': '2' }); ACTIONS.qstlluu()`); await cho();
  ok('Tuan tổng 18 + 4 nghỉ đêm qua: lưu được', /Đã lưu/.test(R('S.toast')), R('S.toast'));
  eq('Tuan: số thiết lập tổng 18', cfg().tl[U['Tuan']].tong, 18);
  eq('Tuan: đêm hôm trước 14 đi làm / tổng 18, 2 về quê 2 OFF', demTr('Tuan'), [18, 14, { que: 2, off: 2 }]);
  eq('báo cáo ca ngày: Tuan theo tổng mới', await dong(D, 1, 'Tuan'), 'Tổ Tuan (làm ca đêm): ca đêm 14/18 cn, nghỉ 4 cn — 2 về quê, 2 OFF luân phiên');
  // chỉ gõ tổng (Du 16 -> 18): ô Đêm hôm trước không tự nhảy thành 18 (đêm qua đã qua), tổng đêm qua theo 18, đêm tối nay cả tổ 18
  R(`S.screen = 'baocaoca'; ACTIONS.bctl()`); await cho();
  R(`S.form['tl_${U['Du']}_t'] = '18'`);
  eq('Du gõ tổng 18: ô Đêm hôm trước vẫn 16', String(R(`fv('tl_${U['Du']}_2', qsTlMacDinh(${U['Du']}).s2)`)), '16');
  R('ACTIONS.qstlluu()'); await cho();
  ok('Du tổng 18: lưu được', /Đã lưu/.test(R('S.toast')), R('S.toast'));
  eq('Du: đêm hôm trước 16/18, đêm tối nay 18', [demTr('Du'), cfg().tl[U['Du']].tong, cfg().tl[U['Du']].s2], [[18, 16, {}], 18, 18]);
  eq('báo cáo ca ngày: Du ghi 2 người chưa ghi lý do', await dong(D, 1, 'Du'), 'Tổ Du (làm ca đêm): ca đêm 16/18 cn, nghỉ 2 cn — 2 chưa ghi lý do');
  // mở từ báo cáo ca ĐÊM: cột Đêm là đêm tối nay như cũ
  R(`S.screen = 'more'; S.bcCa = { ngay: '${D}', ca: 2 }; S.bcc = null; go('baocaoca')`); await cho();
  R('ACTIONS.bctl()'); await cho();
  ok('mở từ báo cáo ca đêm: cột Đêm là đêm tối nay', R('vQuanSo()').includes('Làm<br>đêm') && String(R(`fv('tl_${U['Hai']}_2', qsTlMacDinh(${U['Hai']}).s2)`)) === '8');
  // server: người nghỉ quá tổng thì từ chối, nói rõ
  eq('đêm hôm trước đi làm + nghỉ vượt tổng: từ chối', (await S.call('PUT', '/quanso/thietlap', { ds: [], dem_truoc: { ngay: hom, ds: [{ user: U['Dem'], lam: 11, n2: { om: 2 } }] } }, 'CV')).status, 400);

  /* TUỲ CHỌN "CHỈ GHI TÊN" (06/11): báo cáo ca ngày chỉ kể tổ ca ngày + tổ 2 ca; tổ chỉ làm đêm một dòng "Tổ B (làm ca đêm)". Sản lượng không đổi. */
  R(`S.screen = 'more'; S.bcCa = { ngay: '${D}', ca: 1 }; S.bcc = null; go('baocaoca')`); await cho();
  R(`S.bcMo = null`);
  // nút nằm ngay trên mục 3, không phải bấm Sửa mới thấy
  const v1 = R('vBaoCaoCa()');
  ok('báo cáo ca ngày: hai nút ngay trên mục 3 (không mở Sửa)', /data-v="2">Tất cả tổ/.test(v1) && /data-v="1">Chỉ ca ngày \+ 2 ca/.test(v1));
  R(`ACTIONS.bcchiten({ v: '1' })`);
  const s3 = R('bcPhan().s3');
  if (process.env.IN) console.log(s3.join('\n') + '\n--\n' + R("(S.bcChiTen = 0, bcPhan().s3.join('\\n'))") + R("(S.bcChiTen = 1, '')"));
  ok('chỉ ghi tên: tổ chỉ làm đêm không kèm số', s3.some((l) => /Tổ Dem \(làm ca đêm\)$/.test(l)), JSON.stringify(s3));
  ok('chỉ ghi tên: tổ 2 ca vẫn ghi ca đêm hôm trước', s3.some((l) => l.includes('Tổ Hai: ca ngày') && l.includes('ca đêm 6/15')), JSON.stringify(s3));
  await R(`slLay('${D}').then((L) => { S.sl = L; slGan(); })`);
  eq('chỉ ghi tên: sản lượng vẫn cộng ca đêm của Dem', R(`S.sl.to.find((x) => x.id === ${U['Dem']}).dem.lam`), 10);
  R(`S.screen = 'baocaoca'; bcLuu(bcTao())`); await cho();
  eq('chép lưu tuỳ chọn', JSON.parse(S.one('SELECT data FROM bao_cao_ca WHERE ngay = ? AND ca = 1', D).data).chiTen, 1);
  // hôm sau giữ như hôm trước: lưu báo cáo ca ngày hôm qua có chiTen, ca ngày hôm nay (chưa ai chép) mang sang
  S.sql('DELETE FROM bao_cao_ca WHERE ngay = ? AND ca = 1', D);
  eq('lưu báo cáo ca ngày hôm qua chỉ ghi tên', (await S.call('PUT', '/baocao', { ngay: hom, ca: 1, ts: 0, van_ban: 'x', muc: {}, chiTen: 1 }, 'CV')).status, 200);
  eq('ca ngày hôm nay mang tuỳ chọn từ hôm qua', (await S.call('GET', `/baocao?ngay=${D}&ca=1`, undefined, 'CV')).data.homTruoc.chiTen, 1);
  R(`S.bcCa = { ngay: '${D}', ca: 1 }; S.bcc = null; go('baocaoca')`); await cho();
  eq('mở ca hôm nay: đang chỉ ghi tên', R('S.bcChiTen'), 1);
  R(`ACTIONS.bcchiten({ v: '0' })`);
  ok('bỏ chỉ ghi tên: Dem lại ghi số đêm qua', R('bcPhan().s3').some((l) => l.includes('Tổ Dem (làm ca đêm): ca đêm 10/12')), JSON.stringify([R('S.bcChiTen'), R('bcPhan().s3')]));

  /* HAI NÚT (06/11) "Tất cả tổ" (2) / "Chỉ ca này + 2 ca" (1), cả hai tab. Chỉ đổi chữ: dòng tổng, số tổ, sản lượng giữ nguyên. */
  const dau0 = R('bcPhan().s3[0]'), slDem0 = R(`S.sl.to.map((x) => [x.id, x.lam, x.dem && x.dem.lam])`);
  const v1b = R('vBaoCaoCa()');
  ok('ca ngày chưa chọn: nút Tất cả tổ đang sáng', /class="chip s on"[^>]*data-v="2">Tất cả tổ/.test(v1b) && /data-v="1">Chỉ ca ngày \+ 2 ca/.test(v1b));
  R(`ACTIONS.bcchiten({ v: '1' })`);
  const s3n = R('bcPhan().s3');
  if (process.env.IN) console.log(s3n.join('\n'));
  ok('chỉ ca ngày + 2 ca: tổ đêm chỉ tên, tổ 2 ca đủ số', s3n.includes('• Tổ Dem (làm ca đêm)') && s3n.some((l) => l.includes('Tổ Hai: ca ngày') && l.includes('ca đêm 6/15')), JSON.stringify(s3n));
  eq('dòng tổng quân số không đổi', R('bcPhan().s3[0]'), dau0);
  eq('nhãn trạng thái khớp từng dòng', R('bcQuanSo(S.bcc).hang.length'), s3n.length - 1);
  await R(`slLay('${D}').then((L) => { S.sl = L; slGan(); })`);
  eq('sản lượng không đổi', R(`S.sl.to.map((x) => [x.id, x.lam, x.dem && x.dem.lam])`), slDem0);
  R(`S.screen = 'baocaoca'; bcLuu(bcTao())`); await cho();
  eq('chép: bản đã chép có tên, không có số tổ đêm', /• Tổ Dem \(làm ca đêm\)\n/.test(S.one('SELECT van_ban FROM bao_cao_ca WHERE ngay = ? AND ca = 1', D).van_ban + '\n'), true);
  // ca đêm: mặc định như cũ (tổ ca ngày chỉ tên); chọn Tất cả tổ thì tổ chỉ làm ngày kèm ca ngày cùng ngày
  R(`S.bcCa = { ngay: '${D}', ca: 2 }; S.bcc = null; go('baocaoca')`); await cho();
  eq('Ngay về lại ca ngày 10/10', (await tl('Ngay', { ca: 1, tong: 10, s1: 10, s2: 0, ts: cfg().tl[U['Ngay']].ts })).status, 200);
  R(`S.bcc = null; go('baocaoca')`); await cho();
  const v2 = R('vBaoCaoCa()');
  ok('ca đêm: nút Chỉ ca đêm + 2 ca đang sáng (mặc định cũ)', /class="chip s on"[^>]*data-v="1">Chỉ ca đêm \+ 2 ca/.test(v2), v2.match(/bcchiten[^<]*/g));
  ok('ca đêm mặc định: Ngay một dòng tên', R('bcPhan().s3').includes('• Tổ Ngay (làm ca ngày)'), JSON.stringify(R('bcPhan().s3')));
  R(`ACTIONS.bcchiten({ v: '2' })`);
  const s3d = R('bcPhan().s3');
  if (process.env.IN) console.log(s3d.join('\n'));
  ok('ca đêm tất cả: Ngay kèm ca ngày 10/10, Hai vẫn đủ', s3d.includes('• Tổ Ngay (làm ca ngày): ca ngày 10/10 cn') && s3d.some((l) => l.startsWith('• Tổ Hai: ca đêm')), JSON.stringify(s3d));
  ok('ca đêm tất cả: báo phần sửa chưa chép', R('bcCoKhac(bcKhac())'));
  R(`S.screen = 'baocaoca'; bcLuu(bcTao())`); await cho();
  eq('ca đêm: lưu 2, ca ngày giữ 1', [JSON.parse(S.one('SELECT data FROM bao_cao_ca WHERE ngay = ? AND ca = 2', D).data).chiTen, JSON.parse(S.one('SELECT data FROM bao_cao_ca WHERE ngay = ? AND ca = 1', D).data).chiTen], [2, 1]);
  // báo cáo ca ngày hôm sau đọc ca đêm này: dòng "ca ngày 10/10" của Ngay không bị đọc thành số ca đêm
  eq('ca đêm tất cả: số ca đêm đẩy sang hôm sau không có Ngay', R(`bcDemSo(S.bcc)[${U['Ngay']}]`), undefined);
  R(`S.bcc = null; go('baocaoca')`); await cho();
  eq('mở lại ca đêm: vẫn Tất cả tổ', R('bcCHien(S.bcc, S.bcChiTen)'), 2);
  eq('server: chiTen lạ thành 1', [(await S.call('PUT', '/baocao', { ngay: hom, ca: 2, ts: 0, van_ban: 'y', muc: {}, chiTen: 7 }, 'CV')).status, JSON.parse(S.one('SELECT data FROM bao_cao_ca WHERE ngay = ? AND ca = 2', hom).data).chiTen], [200, 1]);

  xong = true;
  const fail = T.filter((x) => x[0] === 'FAIL');
  console.log(T.map((x) => x[0] + ' | ' + x[1] + (x[2] && x[0] === 'FAIL' ? '  [' + x[2] + ']' : '')).join('\n'));
  console.log('\n=== ' + T.length + ' kiểm tra, ' + fail.length + ' lỗi ===');
  process.exit(fail.length ? 1 : 0);
}
main().catch((e) => { console.log('CRASH', e); process.exit(2); });
