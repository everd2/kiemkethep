/* Sổ thép về công trình (đơn hàng, nhà cung cấp, chuyến về), kiểm trên worker thật + SQLite thật + app.js thật.
   node thepve.test.mjs <đường-dẫn-repo>
   Những điều tính năng này hứa:
   1. Ghi: admin đầu tiên và người được admin đầu tiên giao quyền; xem: thêm CVKTHT trở lên; người khác bị chặn.
   2. Mỗi dòng một phi: bó, cây, kg theo phiếu, kg tự tính = (bó × cây/bó + cây) × kg/cây; thống kê dùng kg phiếu, thiếu thì kg tính.
   3. Không đụng tồn bãi. Chống ghi trùng (khoá; số phiếu trùng thì hỏi lại). Huỷ phải có lý do.
   4. Đơn hàng: đặt / đã về / còn thiếu theo phi; đóng, huỷ (chỉ khi chưa có chuyến), mở lại.
   5. Nhập Excel: dán bảng, dòng cùng ngày + NCC + số phiếu gộp một chuyến, gắn đơn theo số đơn, lỗi từng dòng, thử trước rồi mới ghi.
   6. Thống kê theo tháng / NCC / phi, xuất CSV; có trong bản sao lưu. */
import { boot, vnDay } from './harness.mjs';

const ROOT = process.argv[2] || '.';
const T = [];
const ok = (name, cond, extra) => { T.push([cond ? 'PASS' : 'FAIL', name, extra === undefined ? '' : String(extra)]); };
const eq = (name, a, b) => ok(name + ' = ' + JSON.stringify(b), JSON.stringify(a) === JSON.stringify(b), 'thực tế: ' + JSON.stringify(a));

async function main() {
  const S = await boot(ROOT);
  await S.call('POST', '/setup', { token: 'setup-tok', name: 'Admin', phone: '0900000001', pin: '2468' });
  await S.login('Admin', '0900000001', '2468');
  const U = {};
  const ds = [['Thủ Kho Lan', 'tieudoi'], ['Nguyễn Duy Dũng', 'cvktht'], ['Admin Hai', 'admin'], ['Tổ Trưởng Ba', 'tieudoi']];
  let i = 2;
  for (const [name, role] of ds) {
    const phone = '09000000' + String(i++).padStart(2, '0');
    const r = await S.call('POST', '/users', { name, phone, role }, 'Admin');
    await S.login(name, phone, r.data.pin);
    await S.call('POST', '/change-pin', { pin: r.data.pin, newPin: '1357' }, name);
    U[name] = r.data.id;
  }
  const CV = 'Nguyễn Duy Dũng', LAN = 'Thủ Kho Lan', D = vnDay(), hom = vnDay(Date.now() - 864e5), nam = D.slice(0, 4);
  const kgD16 = 1.58, boD16 = S.one("SELECT bo_size FROM phi WHERE id = 'D16'").bo_size, kgCay = S.one("SELECT kg_per_cay FROM phi WHERE id = 'D16'").kg_per_cay;

  /* ===== 1. Quyền ===== */
  const chuyen = (b, who) => S.call('POST', '/thepve', { ngay: D, ncc: 'Hòa Phát', lines: [{ phi: 'D16', bo: 2, cay: 10, kg: '' }], ...b }, who);
  eq('Tiểu đội trưởng chưa được giao quyền: không xem', (await S.call('GET', '/thepve', undefined, LAN)).status, 403);
  eq('... và không ghi', (await chuyen({}, LAN)).status, 403);
  eq('CVKTHT xem được', (await S.call('GET', '/thepve', undefined, CV)).status, 200);
  eq('CVKTHT không ghi được (chưa giao quyền)', (await chuyen({}, CV)).status, 403);
  eq('admin thứ hai không ghi được (chưa giao quyền)', (await chuyen({}, 'Admin Hai')).status, 403);
  eq('admin thứ hai không giao quyền được', (await S.call('POST', `/users/${U[LAN]}/thep-ve`, { co: true }, 'Admin Hai')).status, 403);
  eq('admin đầu tiên giao quyền cho Lan', (await S.call('POST', `/users/${U[LAN]}/thep-ve`, { co: true }, 'Admin')).status, 200);
  const bt = (await S.call('GET', '/bootstrap', undefined, LAN)).data;
  eq('bootstrap của Lan mang quyền', bt.user.thep_ve, 1);
  eq('quyền hiện trong danh sách người dùng', (await S.call('GET', '/users', undefined, 'Admin')).data.users.find((u) => u.id === U[LAN]).thep_ve, 1);
  eq('Lan xem được, có quyền ghi', (await S.call('GET', '/thepve', undefined, LAN)).data.quyen.ghi, true);

  /* ===== 2. Ghi chuyến ===== */
  const c1 = await chuyen({ so_phieu: 'PX-001', bien_so: '29C-123.45', lines: [{ phi: 'D16', bo: 2, cay: 10 }, { phi: 'D10', kg: '12.500' }] }, LAN);
  eq('Lan ghi chuyến', c1.status, 200);
  const dong = S.sql('SELECT phi_id, bo, cay, kg, kg_tinh FROM thep_ve_dong WHERE ve_id = ? ORDER BY id', c1.data.id);
  eq('kg tự tính = (bó × cây/bó + cây) × kg/cây', dong[0].kg_tinh, Math.round((2 * boD16 + 10) * kgCay));
  eq('kg gõ "12.500" (dấu chấm nghìn) = 12500 kg, không tự tính', [dong[1].kg, dong[1].kg_tinh], [12500, null]);
  eq('không đụng tồn bãi: không có phiếu kho nào', S.sql('SELECT 1 FROM receipts').length, 0);
  eq('nhà cung cấp tự tạo', S.sql("SELECT name FROM thep_ncc").map((x) => x.name), ['Hòa Phát']);
  const tr = await chuyen({ so_phieu: 'px 001', lines: [{ phi: 'D16', bo: 1 }] }, LAN);
  eq('cùng NCC + số phiếu (viết khác kiểu): hỏi lại', [tr.status, tr.data.code], [409, 'trung_tv']);
  eq('xác nhận ghi thêm được', (await chuyen({ so_phieu: 'px 001', trung: true, lines: [{ phi: 'D16', bo: 1 }] }, LAN)).status, 200);
  const khoa = 'abcdef0123456789';
  const k1 = await chuyen({ khoa, so_phieu: 'PX-002' }, LAN), k2 = await chuyen({ khoa, so_phieu: 'PX-002' }, LAN);
  eq('gửi lại cùng khoá: không ghi thêm', [k1.status, k2.status, k2.data.trung, S.sql("SELECT 1 FROM thep_ve WHERE so_phieu = 'PX-002'").length], [200, 200, true, 1]);
  for (const [nhan, b] of [['ngày mai', { ngay: vnDay(Date.now() + 864e5) }], ['ngày không có thật', { ngay: nam + '-02-31' }], ['thiếu NCC', { ncc: '' }], ['phi lạ', { lines: [{ phi: 'D99', bo: 1 }] }],
    ['phi __proto__', { lines: [{ phi: '__proto__', bo: 1 }] }], ['dòng trống', { lines: [{ phi: 'D16' }] }], ['bó âm', { lines: [{ phi: 'D16', bo: -1 }] }], ['kg quá lớn', { lines: [{ phi: 'D16', kg: 900000 }] }], ['không dòng nào', { lines: [] }]]) {
    eq('từ chối: ' + nhan, (await chuyen(b, LAN)).status, 400);
  }
  eq('huỷ không lý do: từ chối', (await S.call('POST', `/thepve/${c1.data.id}/huy`, {}, LAN)).status, 400);

  /* ===== 3. Đơn hàng ===== */
  const don = (b, who = LAN) => S.call('POST', '/thepve/don', { ncc: 'Việt Úc', so_don: 'DH-01', ngay_dat: hom, lines: [{ phi: 'D16', kg: '50000' }, { phi: 'D20', kg: 30000 }], ...b }, who);
  const d1 = await don({});
  eq('lập đơn', d1.status, 200);
  eq('trùng số đơn cùng NCC: từ chối', (await don({})).status, 400);
  eq('CVKTHT không lập đơn được', (await don({ so_don: 'DH-09' }, CV)).status, 403);
  eq('chuyến khác NCC gắn vào đơn: từ chối', (await chuyen({ don_id: d1.data.id }, LAN)).status, 400);
  eq('chuyến gắn đơn', (await chuyen({ ncc: 'việt úc', don_id: d1.data.id, so_phieu: 'VU-1', lines: [{ phi: 'D16', kg: 20000 }, { phi: 'D25', kg: 3000 }] }, LAN)).status, 200);
  const V1 = (await S.call('GET', '/thepve', undefined, CV)).data;
  const dd = V1.don.find((x) => x.id === d1.data.id);
  eq('tiến độ đơn: đã về theo phi (cả phi ngoài đơn)', dd.da_ve, { D16: 20000, D25: 3000 });
  eq('dòng đặt của đơn', dd.dong.map((l) => [l.phi, l.kg]), [['D16', 50000], ['D20', 30000]]);
  eq('huỷ đơn đã có chuyến: từ chối (phải đóng)', (await S.call('POST', `/thepve/don/${d1.data.id}/huy`, { ly_do: 'x' }, LAN)).status, 400);
  eq('đóng đơn', (await S.call('POST', `/thepve/don/${d1.data.id}/dong`, {}, LAN)).status, 200);
  eq('mở lại đơn', (await S.call('POST', `/thepve/don/${d1.data.id}/molai`, {}, LAN)).status, 200);
  const d2 = await don({ so_don: 'DH-02' });
  eq('huỷ đơn chưa có chuyến (có lý do)', (await S.call('POST', `/thepve/don/${d2.data.id}/huy`, { ly_do: 'lập nhầm' }, LAN)).status, 200);

  /* ===== 4. Nhập Excel ===== */
  const rows = [
    { ngay: nam + '-01-05', ncc: 'Hòa Phát', so_phieu: 'HP-100', phi: 'D16', bo: '3', cay: '', kg: '' },
    { ngay: nam + '-01-05', ncc: 'Hòa Phát', so_phieu: 'HP-100', phi: 'D20', bo: '', cay: '', kg: '8.240' },
    { ngay: nam + '-02-10', ncc: 'Việt Úc', so_don: 'DH-01', so_phieu: 'VU-7', phi: 'D20', kg: '25000' },
    { ngay: nam + '-03-01', ncc: 'Pomina', so_phieu: '', phi: 'D25', kg: '18000' },
  ];
  const t1 = await S.call('POST', '/thepve/nhap', { rows, thu: true }, LAN);
  eq('thử: 4 dòng -> 3 chuyến, 3 NCC, 1 chuyến gắn đơn, chưa ghi', [t1.data.ok, t1.data.dong, t1.data.chuyen, t1.data.ncc, t1.data.gan_don, S.sql("SELECT 1 FROM thep_ve WHERE nguon = 'excel'").length], [true, 4, 3, 3, 1, 0]);
  const loiRows = [...rows, { ngay: '31/02/2026', ncc: 'X', phi: 'D16', kg: '1' }, { ngay: nam + '-01-01', ncc: '', phi: 'D16', kg: '1' }, { ngay: nam + '-01-01', ncc: 'X', phi: 'D77', kg: '1' }];
  const t2 = await S.call('POST', '/thepve/nhap', { rows: loiRows }, LAN);
  eq('có dòng lỗi: không ghi gì, báo đúng 3 dòng lỗi', [t2.data.ok, t2.data.so_loi, t2.data.loi.map((x) => x.dong), S.sql("SELECT 1 FROM thep_ve WHERE nguon = 'excel'").length], [false, 3, [5, 6, 7], 0]);
  const t3 = await S.call('POST', '/thepve/nhap', { rows }, LAN);
  eq('nhập thật', [t3.status, t3.data.chuyen], [200, 3]);
  const hp = S.one("SELECT id, don_id FROM thep_ve WHERE so_phieu = 'HP-100'");
  eq('hai dòng cùng phiếu gộp một chuyến', S.sql('SELECT phi_id FROM thep_ve_dong WHERE ve_id = ? ORDER BY id', hp.id).map((x) => x.phi_id), ['D16', 'D20']);
  eq('chuyến có số đơn gắn đúng đơn đã lập', S.one("SELECT don_id FROM thep_ve WHERE so_phieu = 'VU-7'").don_id, d1.data.id);
  eq('nhập lại cùng file: báo phiếu đã có', (await S.call('POST', '/thepve/nhap', { rows, thu: true }, LAN)).data.so_loi, 3);
  // số kiểu Excel tiếng Anh (dấu phẩy ngăn nghìn) và cảnh báo nghi ghi tấn vào cột kg
  const my = await S.call('POST', '/thepve/nhap', { thu: true, rows: [
    { ngay: nam + '-01-07', ncc: 'Tung Ho', so_phieu: 'TH-1', phi: 'D16', kg: '25,340' },
    { ngay: nam + '-01-07', ncc: 'Tung Ho', so_phieu: 'TH-1', phi: 'D20', cay: '1,250' },
    { ngay: nam + '-01-08', ncc: 'Tung Ho', so_phieu: 'TH-2', phi: 'D25', kg: '25,34' }] }, LAN);
  eq('"25,340" kg = 25340; "1,250" cây = 1250; "25,34" (nghi là tấn) = 25 kg kèm cảnh báo', [my.data.ok, my.data.so_canh, my.data.canh[0].kg, my.data.tu, my.data.den],
    [true, 1, 25, nam + '-01-07', nam + '-01-08']);
  eq('tổng kg của bản thử đúng (25340 + 1250 cây D20 + 25)', my.data.kg, 25340 + Math.round(1250 * S.one("SELECT kg_per_cay FROM phi WHERE id = 'D20'").kg_per_cay) + 25);

  /* ===== 5. Thống kê, CSV, huỷ, sao lưu ===== */
  const V2 = (await S.call('GET', `/thepve?tu=${nam}-01-01&den=${D}`, undefined, CV)).data;
  ok('xem cả năm có đủ chuyến nhập từ Excel', V2.ve.filter((v) => v.nguon === 'excel').length === 3, V2.ve.length);
  // tối ưu: danh sách theo trang, thống kê cộng sẵn trên máy chủ (không phụ thuộc trang)
  const tongSql = S.one(`SELECT COUNT(DISTINCT v.id) n, SUM(COALESCE(d.kg, d.kg_tinh, 0)) kg FROM thep_ve v JOIN thep_ve_dong d ON d.ve_id = v.id WHERE v.voided = 0 AND v.ngay >= ? AND v.ngay <= ?`, nam + '-01-01', D);
  const p1 = (await S.call('GET', `/thepve?tu=${nam}-01-01&den=${D}&so=2`, undefined, CV)).data;
  eq('trang 1: 2 chuyến mới nhất, biết tổng số chuyến của kỳ', [p1.ve.length, p1.trang.tong], [2, tongSql.n]);
  eq('thống kê của kỳ = cộng mọi dòng (không chỉ trang đang tải)', [p1.tk.tong.chuyen, p1.tk.tong.kg], [tongSql.n, tongSql.kg]);
  eq('thống kê theo tháng / NCC / phi / bảng chéo cộng lại bằng tổng', [p1.tk.thang, p1.tk.ncc, p1.tk.phi, p1.tk.cheo].map((ds) => ds.reduce((a, r) => a + r.kg, 0)), [tongSql.kg, tongSql.kg, tongSql.kg, tongSql.kg]);
  const p2 = (await S.call('GET', `/thepve?tu=${nam}-01-01&den=${D}&so=2&bo_qua=2`, undefined, CV)).data;
  eq('trang 2 tiếp nối, không trùng chuyến của trang 1', p2.ve.some((v) => p1.ve.some((x) => x.id === v.id)), false);
  ok('mỗi chuyến trong trang có đủ dòng phi của nó', p1.ve.every((v) => v.dong.length === S.one('SELECT COUNT(*) n FROM thep_ve_dong WHERE ve_id = ?', v.id).n));
  const csv = (await S.call('GET', `/thepve/csv?tu=${nam}-01-01&den=${D}`, undefined, CV)).data;
  ok('CSV có tiêu đề và dòng HP-100', /Kg tự tính/.test(csv) && /HP-100/.test(csv), String(csv).slice(0, 120));
  eq('huỷ chuyến có lý do', (await S.call('POST', `/thepve/${c1.data.id}/huy`, { ly_do: 'ghi nhầm' }, LAN)).status, 200);
  eq('chuyến đã huỷ không còn trong danh sách', (await S.call('GET', '/thepve', undefined, CV)).data.ve.some((v) => v.id === c1.data.id), false);
  eq('admin bỏ quyền của Lan', (await S.call('POST', `/users/${U[LAN]}/thep-ve`, { co: false }, 'Admin')).status, 200);
  eq('bỏ quyền rồi thì không ghi được nữa', (await chuyen({}, LAN)).status, 403);
  await S.call('POST', `/users/${U[LAN]}/thep-ve`, { co: true }, 'Admin');
  const bk = (await S.call('GET', '/backup', undefined, 'Admin')).data;
  ok('bản sao lưu có đủ bảng sổ thép về', ['thep_ncc', 'thep_don', 'thep_don_dong', 'thep_ve', 'thep_ve_dong'].every((b) => Array.isArray(bk.bang[b]) && bk.bang[b].length), Object.keys(bk.bang).join(','));
  eq('nhật ký có các việc của sổ', ['tv_ghi', 'tv_huy', 'tv_don', 'tv_nhap', 'user_thep_ve'].map((a) => S.sql('SELECT 1 FROM audit WHERE action = ?', a).length > 0), [true, true, true, true, true]);

  /* ===== 6. Giao diện ===== */
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
      if (!/^\/api\/(baocao|thepve|users|bootstrap|quanso)/.test(String(url))) return new Promise(() => {});
      const r = await S.call(o.method || 'GET', String(url).replace(/^\/api/, ''), o.body ? JSON.parse(o.body) : undefined, who);
      return { ok: r.status < 400, status: r.status, json: async () => r.data, headers: { get: () => null } };
    },
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(readFileSync(path.join(ROOT, 'public/app.js'), 'utf8'), ctx, { filename: 'app.js' });
  const R = (src) => vm.runInContext(src, ctx);
  /* go() không bật S.busy (chỉ act() bật), nên chỉ nhìn S.busy thì cho() chỉ chờ đủ 40 vòng rồi đi tiếp dù go() chưa
     nạp xong — đọc S.bcc lúc đó ra null, test hỏng ngẫu nhiên tuỳ máy nhanh chậm. Bọc go() để đếm số lần chuyển màn
     đang chạy dở, cho() chờ tới khi về 0 thật. */
  let dangGo = 0;
  const go0 = ctx.go;
  ctx.go = (...a) => { dangGo++; return Promise.resolve(go0(...a)).finally(() => { dangGo--; }); };
  const cho = async () => { for (let k = 0; k < 3000; k++) { await new Promise((r) => setImmediate(r)); if (!R('S.busy') && !dangGo && k > 40) return; } };
  const bt0 = (await S.call('GET', '/bootstrap', undefined, LAN)).data;
  R(`S.boot = ${JSON.stringify(bt0)}; indexBoot(S.boot); S.me = ${JSON.stringify({ id: U[CV], name: CV, role: 'cvktht' })}; S.form = {}; S.screen = 'more';`);
  who = LAN;
  R(`S.me = ${JSON.stringify({ id: U[LAN], name: LAN, role: 'tieudoi', thep_ve: 1 })}; S.screen = 'more';`);
  ok('menu Thêm của người được giao quyền có Thép về', R('vMore()').includes('data-s="thepve"'));
  R(`ACTIONS.nav({ s: 'thepve' })`); await cho();
  eq('mở màn sổ thép về', [R('S.screen'), R('!!S.tv'), R('S.tv.quyen.ghi')], ['thepve', true, true]);
  // ghi một chuyến từ form
  R(`ACTIONS.tvmo({ v: 've' })`);
  R(`S.form.tvf_ncc = 'Hòa Phát'; S.form.tvf_sp = 'GUI-01'; S.form.tvp_0 = 'D16'; S.form.tvb_0 = '1'; S.form.tvc_0 = '5'; S.form.tvk_0 = '1.000'`);
  const l0 = R('tvDong("v")[0]');
  eq('form: kg tự tính chạy theo bó / cây', l0.kg_tinh, Math.round((boD16 + 5) * kgCay));
  ok('form hiện chênh lệch kg phiếu và kg tính', R('vThepVe()').includes('chênh'));
  R(`ACTIONS.tvthemdong()`); R(`S.form.tvp_1 = 'D10'; S.form.tvk_1 = '2500'`);
  R(`ACTIONS.tvluu()`); await cho();
  const g = S.one("SELECT id FROM thep_ve WHERE so_phieu = 'GUI-01'");
  ok('lưu chuyến từ form', !!g, '');
  eq('đủ hai dòng, kg theo phiếu "1.000" = 1000', g && S.sql('SELECT phi_id, kg FROM thep_ve_dong WHERE ve_id = ? ORDER BY id', g.id).map((x) => [x.phi_id, x.kg]), [['D16', 1000], ['D10', 2500]]);
  eq('form đóng sau khi lưu', R('S.tvMo'), null);
  // thống kê
  R(`ACTIONS.tvky({ tu: '${nam}-01-01', den: '${D}' })`); await cho();
  R(`ACTIONS.tvtab({ v: 'tk' })`);
  const TK = R('tvThongKe()');
  ok('thống kê có đủ ba nhà cung cấp và theo tháng', Object.keys(TK.ncc).length >= 3 && Object.keys(TK.thang).length >= 3, JSON.stringify(Object.keys(TK.ncc)));
  eq('tổng thống kê = cộng kg (phiếu, thiếu thì tính) mọi dòng còn hiệu lực', TK.tong, S.one('SELECT SUM(COALESCE(d.kg, d.kg_tinh, 0)) s FROM thep_ve v JOIN thep_ve_dong d ON d.ve_id = v.id WHERE v.voided = 0 AND v.ngay >= ? AND v.ngay <= ?', nam + '-01-01', D).s);
  ok('thẻ thống kê vẽ được (theo tháng, NCC, phi, nút xuất)', ['Theo tháng', 'Theo nhà cung cấp', 'Theo phi', 'data-a="tvcsv"'].every((x) => R('vThepVe()').includes(x)));
  ok('thống kê dạng bảng: có bảng theo tháng / NCC / phi, bảng chéo NCC × phi, dòng TỔNG', ['<table class="bang"', 'Nhà cung cấp × phi', '% tổng', 'TỔNG'].every((x) => R('vThepVe()').includes(x)));
  R(`ACTIONS.tvtab({ v: 've' })`);
  const bv = R('vThepVe()');
  ok('chuyến về: mỗi chuyến một thẻ, bảng nhỏ vừa điện thoại Phi | Bó | Cây | Kg phiếu | Kg tính, dòng TỔNG', ['<table class="bang nho"', '<th>Phi</th>', 'Kg phiếu', 'Kg tính', 'TỔNG'].every((x) => bv.includes(x)) && !bv.includes('Chênh kg'));
  const kyN = S.one('SELECT COUNT(DISTINCT v.id) c, COUNT(*) n FROM thep_ve v JOIN thep_ve_dong d ON d.ve_id = v.id WHERE v.voided = 0 AND v.ngay >= ? AND v.ngay <= ?', nam + '-01-01', D);
  eq('thẻ chuyến về: mỗi phi một hàng (số hàng = số chuyến (tiêu đề) + số dòng phi trong kỳ)', (bv.match(/<tr/g) || []).length, kyN.c + kyN.n);
  // nhập Excel bằng dán bảng
  R(`ACTIONS.tvtab({ v: 'nhap' })`);
  const dan = ['Ngày\tNhà cung cấp\tSố phiếu\tPhi\tSố bó\tTấn', `03/04/${nam}\tHòa Phát\tHP-300\tphi 18\t2\t`, `03/04/${nam}\tHòa Phát\tHP-300\tØ22\t\t12,5`].join('\n');
  const doc = R(`tvDocDan(${JSON.stringify(dan)})`);
  eq('đọc bảng dán: ngày dd/mm/yyyy, phi "phi 18" / "Ø22", tấn 12,5 -> 12500 kg', doc.rows.map((r) => [r.ngay, r.phi, r.bo, r.kg]), [[nam + '-04-03', 'D18', '2', ''], [nam + '-04-03', 'D22', '', '12500']]);
  // ngày kiểu Excel tiếng Anh (tháng/ngày): có ô 1/25 thì đọc cả cột theo tháng/ngày
  const danMy = ['Date\tSupplier NCC\tPhi\tKg', `1/25/${nam}\tTung Ho\tD16\t25,340`, `2/3/${nam}\tTung Ho\tD20\t8,000`].join('\n').replace('Supplier NCC', 'NCC');
  const dm = R(`tvDocDan(${JSON.stringify(danMy)})`);
  eq('Excel kiểu Mỹ: 1/25 là 25 tháng 1, 2/3 là 3 tháng 2', [dm.kieuMy, dm.rows.map((r) => r.ngay)], [true, [nam + '-01-25', nam + '-02-03']]);
  const dv = R(`tvDocDan(${JSON.stringify(['Ngày\tNCC\tPhi\tKg', `25/01/${nam}\tA\tD16\t1`, `03/02/${nam}\tA\tD16\t1`].join('\n'))})`);
  eq('Excel tiếng Việt: 03/02 là 3 tháng 2', [dv.kieuMy, dv.rows.map((r) => r.ngay)], [false, [nam + '-01-25', nam + '-02-03']]);
  eq('tên cột "Số lượng (kg)" / "SL cây" được nhận', R(`(() => { const x = tvDocDan('Ngày\\tNhà cung cấp\\tPhi\\tSL cây\\tSố lượng (kg)\\n01/01/${nam}\\tA\\tD16\\t10\\t500'); return [x.loi, x.rows[0].cay, x.rows[0].kg]; })()`), ['', '10', '500']);
  eq('ô Kg phiếu hiểu "25,340" và "25.340" như máy chủ', [R("tvKgPhieu('25,340')"), R("tvKgPhieu('25.340')"), R("tvKgPhieu('12,5')")], [25340, 25340, 13]);
  R(`S.form.tvdan = ${JSON.stringify(dan)}`);
  R(`ACTIONS.tvnhap({ v: 'thu' })`); await cho();
  eq('kiểm tra: 1 chuyến, không lỗi, chưa ghi', [R('S.tvNhapKq.chuyen'), R('S.tvNhapKq.so_loi'), S.sql("SELECT 1 FROM thep_ve WHERE so_phieu = 'HP-300'").length], [1, 0, 0]);
  ok('hiện nút NHẬP sau khi kiểm tra sạch', R('vThepVe()').includes('NHẬP 1 CHUYẾN'));
  R(`ACTIONS.tvnhap({ v: 'ghi' })`); await cho();
  eq('nhập thật từ màn hình', S.sql("SELECT 1 FROM thep_ve WHERE so_phieu = 'HP-300'").length, 1);
  eq('bảng dán thiếu cột bắt buộc: báo lỗi, không gửi', R(`tvDocDan('Ngày\\tPhi\\n01/01/2026\\tD16').loi.length > 0`), true);
  // đơn hàng
  R(`ACTIONS.tvtab({ v: 'don' })`);
  ok('đơn hàng: mỗi đơn một thẻ, bảng nhỏ Đặt / Đã về / Còn thiếu, nút ghi chuyến theo đơn', ['<table class="bang nho"', 'Đặt (tấn)', 'Đã về', 'Còn thiếu', 'thiếu', 'data-a="tvghidon"'].every((x) => R('vThepVe()').includes(x)));
  // ghi chuyến theo đơn: mở form, điền sẵn đơn, nhà cung cấp và các phi của đơn
  const dn = JSON.parse(R(`JSON.stringify(S.tv.don.find((d) => d.tt === 'mo'))`));
  R(`ACTIONS.tvghidon({ id: '${dn.id}' })`);
  eq('ghi theo đơn: form mở ở tab chuyến, đơn + NCC + phi điền sẵn', R(`JSON.stringify([S.tvTab, S.tvMo, S.form.tvf_don, S.form.tvf_ncc, tvDong('v').map((l) => l.phi)])`), JSON.stringify(['ve', 've', String(dn.id), R(`tvNcc(${dn.ncc_id})`), dn.dong.map((l) => l.phi)]));
  ok('form theo đơn: mỗi phi hiện "đơn còn thiếu"', R('vThepVe()').includes('đơn còn thiếu'));
  R(`S.form.tvb_0 = '3'; tvApDon('')`);
  eq('bỏ chọn đơn: giữ nguyên số đã gõ', R(`S.form.tvb_0 + '|' + S.form.tvp_0`), '3|' + dn.dong[0].phi);
  R(`ACTIONS.tvdong(); for (const k of Object.keys(S.form)) if (/^tv[fpbck]/.test(k)) delete S.form[k]; S.tvSoDong = 1; ACTIONS.tvtab({ v: 'don' })`);
  // CVKTHT chỉ xem: không có nút ghi
  who = CV;
  R(`S.me = ${JSON.stringify({ id: U[CV], name: CV, role: 'cvktht' })}; S.tv = null; S.tvTab = 've'; delete NHO['tv:' + tvKy().tu + ':' + tvKy().den]`);
  R(`ACTIONS.nav({ s: 'thepve' })`); await cho();
  eq('CVKTHT: xem được, không có nút ghi / nhập', [R('!!S.tv'), R('vThepVe()').includes('data-a="tvmo"'), R('vThepVe()').includes('Nhập Excel')], [true, false, false]);
  // admin đầu tiên: nút giao quyền trên màn Người dùng
  who = 'Admin';
  R(`S.me = ${JSON.stringify({ id: 1, name: 'Admin', role: 'admin' })}; S.uFirst = 1;`);
  R(`go('users')`); await cho();
  ok('màn Người dùng của admin đầu tiên có nút giao / bỏ quyền ghi sổ thép về', R('vMain()').includes('data-a="uthepve"'));

  /* ===== Hoàn thiện: tìm chuyến, sửa đơn, gắn chuyến vào đơn, huỷ cả lần nhập ===== */
  const tim = async (q) => (await S.call('GET', `/thepve?tu=2000-01-01&den=${D}&q=${encodeURIComponent(q)}`, undefined, LAN)).data;
  const tm1 = await tim('vu-1');
  eq('tìm theo số phiếu: đúng chuyến, đếm theo ô tìm', [tm1.ve.map((v) => v.so_phieu), tm1.trang.tong], [['VU-1'], 1]);
  ok('tìm theo phi D10: chỉ chuyến có D10', (await tim('d10')).ve.every((v) => v.dong.some((l) => l.phi === 'D10')) && (await tim('d10')).ve.length > 0);
  const tUc = await tim('úc'), idUc = tUc.ncc.filter((n) => /úc/i.test(n.name)).map((n) => n.id);
  ok('tìm theo tên nhà cung cấp (một phần)', tUc.ve.length > 0 && tUc.ve.every((v) => idUc.includes(v.ncc_id)));
  eq('tìm có ký tự % không làm lộ hết', (await tim('%')).trang.tong, 0);
  ok('tìm không đổi thống kê của kỳ', (await tim('vu-1')).tk.tong.chuyen > 1);
  // sửa đơn
  const dn2 = (await S.call('POST', '/thepve/don', { ncc: 'Hòa Phát', so_don: 'HP-SUA', ngay_dat: D, lines: [{ phi: 'D16', kg: '10000' }] }, LAN)).data.id;
  eq('sửa đơn: thêm phi, đổi số lượng, đặt hạn', (await S.call('PATCH', '/thepve/don/' + dn2, { han: D, lines: [{ phi: 'D16', kg: '12000' }, { phi: 'D20', kg: '5000' }] }, LAN)).status, 200);
  eq('đơn sau khi sửa', S.sql('SELECT phi_id, kg FROM thep_don_dong WHERE don_id = ? ORDER BY phi_id', dn2).map((x) => [x.phi_id, x.kg]), [['D16', 12000], ['D20', 5000]]);
  eq('sửa đơn: hạn trước ngày đặt bị từ chối', (await S.call('PATCH', '/thepve/don/' + dn2, { han: '2000-01-01', lines: [{ phi: 'D16', kg: '1' }] }, LAN)).status, 400);
  eq('CVKTHT (chỉ xem) không sửa đơn được', (await S.call('PATCH', '/thepve/don/' + dn2, { lines: [{ phi: 'D16', kg: '1' }] }, CV)).status, 403);
  // gắn chuyến đã ghi vào đơn lập sau
  const c9 = (await chuyen({ so_phieu: 'GAN-01', bien_so: '51D-999.88', lines: [{ phi: 'D16', kg: '3000' }] }, LAN)).data.id;
  ok('tìm theo biển số (một phần)', (await tim('999.8')).ve.some((v) => v.id === c9));
  eq('gắn chuyến vào đơn lập sau', (await S.call('POST', `/thepve/${c9}/don`, { don_id: dn2 }, LAN)).status, 200);
  eq('tiến độ đơn tính cả chuyến vừa gắn', (await S.call('GET', '/thepve', undefined, LAN)).data.don.find((d) => d.id === dn2).da_ve.D16, 3000);
  const dnKhac = (await S.call('POST', '/thepve/don', { ncc: 'Việt Úc Gắn', so_don: 'VU-G', ngay_dat: D, lines: [{ phi: 'D16', kg: '1000' }] }, LAN)).data.id;
  eq('gắn vào đơn của nhà cung cấp khác: từ chối', (await S.call('POST', `/thepve/${c9}/don`, { don_id: dnKhac }, LAN)).status, 400);
  eq('bỏ gắn đơn', [(await S.call('POST', `/thepve/${c9}/don`, { don_id: null }, LAN)).status, S.one('SELECT don_id FROM thep_ve WHERE id = ?', c9).don_id], [200, null]);
  // huỷ cả lần nhập Excel
  const nh = await S.call('POST', '/thepve/nhap', { rows: [{ ngay: D, ncc: 'NCC Nhập Nhầm', so_phieu: 'NN1', phi: 'D16', kg: '1000' }, { ngay: D, ncc: 'NCC Nhập Nhầm', so_phieu: 'NN2', phi: 'D18', kg: '2000' }] }, LAN);
  const lo = (await S.call('GET', '/thepve', undefined, LAN)).data.lo_nhap.find((x) => x.chuyen === 2);
  ok('danh sách lần nhập gần đây có lần vừa nhập', nh.status === 200 && lo && /^n[0-9a-z]+$/.test(lo.lo), JSON.stringify(lo));
  eq('huỷ cả lần nhập: cần lý do', (await S.call('POST', `/thepve/nhap/${lo.lo}/huy`, {}, LAN)).status, 400);
  const hu = await S.call('POST', `/thepve/nhap/${lo.lo}/huy`, { ly_do: 'dán nhầm file' }, LAN);
  eq('huỷ cả lần nhập: 2 chuyến, không còn trong sổ', [hu.status, hu.data.chuyen, S.one("SELECT COUNT(*) n FROM thep_ve v JOIN thep_ncc n ON n.id = v.ncc_id WHERE n.name = 'NCC Nhập Nhầm' AND v.voided = 0").n], [200, 2, 0]);
  eq('huỷ lại lần đó: không còn gì', (await S.call('POST', `/thepve/nhap/${lo.lo}/huy`, { ly_do: 'x' }, LAN)).status, 404);
  eq('lô lạ: 404', (await S.call('POST', '/thepve/nhap/abc%25/huy', { ly_do: 'x' }, LAN)).status, 404);
  // giao diện
  who = LAN;
  R(`S.me = ${JSON.stringify({ id: U[LAN], name: LAN, role: 'tieudoi', thep_ve: 1 })}; S.tv = null; S.tvTab = 've'; S.tvTim = ''`);
  R(`ACTIONS.nav({ s: 'thepve' })`); await cho();
  R(`ACTIONS.tvky({ tu: '2000-01-01', den: '${D}' })`); await cho();
  R(`S.form.tvtim = 'GAN-01'; ACTIONS.tvtim()`); await cho();
  ok('ô tìm: chỉ hiện chuyến khớp, có dòng đếm', R('S.tv.ve.length') === 1 && R('vThepVe()').includes('chuyến khớp'));
  R(`ACTIONS.tvtimbo()`); await cho();
  ok('bỏ tìm: hiện lại cả kỳ', R('S.tv.ve.length') > 1);
  R(`ACTIONS.tvgan({ id: '${c9}' })`);
  ok('thẻ chuyến: hộp gắn đơn chỉ đơn cùng NCC', R('vThepVe()').includes('HP-SUA') && !R('vThepVe()').includes('VU-G'));
  R(`ACTIONS.tvganbo(); ACTIONS.tvtab({ v: 'don' }); ACTIONS.tvsuadon({ id: '${dn2}' })`);
  eq('sửa đơn: form điền sẵn các phi', R(`JSON.stringify([S.tvMo, S.tvSuaDon, tvDong('d').map((l) => l.phi), S.form.tdk_1])`), JSON.stringify(['don', dn2, ['D16', 'D20'], '5000']));
  ok('form sửa đơn: tiêu đề Sửa đơn, nút LƯU SỬA ĐƠN', R('vThepVe()').includes('Sửa đơn HP-SUA') && R('vThepVe()').includes('LƯU SỬA ĐƠN'));
  R(`ACTIONS.tvdong()`);

  const fail = T.filter((x) => x[0] === 'FAIL');
  console.log(T.map((x) => x[0] + ' | ' + x[1] + (x[2] && x[0] === 'FAIL' ? '  [' + x[2] + ']' : '')).join('\n'));
  console.log('\n=== ' + T.length + ' kiểm tra, ' + fail.length + ' lỗi ===');
  process.exit(fail.length ? 1 : 0);
}
main().catch((e) => { console.error('CRASH', e); process.exit(2); });
