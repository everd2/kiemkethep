/* Báo cáo sản lượng, kiểm trên worker thật + SQLite thật + app.js thật. node sanluong.test.mjs <đường-dẫn-repo>
   Những điều tính năng này hứa:
   1. Chỉ CVKTHT trở lên mở, lưu, đặt thiết lập; Tiểu đội trưởng bị chặn.
   2. MỘT báo cáo gộp ca ngày + ca đêm: mỗi tổ một dòng, quân số = ca ngày của ngày báo cáo và/hoặc ca đêm HÔM TRƯỚC; không có phần nghỉ.
   3. Thiết lập: công chuẩn (158), tỷ lệ giá CHUNG (0,2-1, mặc định 0,2), tỷ lệ gia công RIÊNG TỪNG TỔ (0,5-1, mặc định 0,70-0,80).
   4. Sản lượng tổ = (công x công chuẩn x tỷ lệ gia công của tổ) / tỷ lệ giá, tự tính theo thiết lập; ngày đã lưu giữ thiết lập lúc lưu.
   5. Bản chữ đúng khuôn báo cáo quân số: phần đầu giữ nguyên, mục 2 quân số + công gia công thép, mục 3 sản lượng. */
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
  const ds = [['Phạm Văn Khoa', 'tieudoi'], ['Lò Văn Cơi', 'tieudoi'], ['Lê Hải Nam', 'tieudoi'], ['Nguyễn Duy Dũng', 'cvktht']];
  let i = 2;
  for (const [name, role] of ds) {
    const phone = '09000000' + String(i++).padStart(2, '0');
    const r = await S.call('POST', '/users', { name, phone, role }, 'Admin');
    await S.login(name, phone, r.data.pin);
    await S.call('POST', '/change-pin', { pin: r.data.pin, newPin: '1357' }, name);
    U[name] = r.data.id;
  }
  const CV = 'Nguyễn Duy Dũng', D = vnDay(), hom = vnDay(Date.now() - 864e5);
  const q = (who, body) => S.call('PUT', '/quanso', body, who);
  const ddmm = (d) => d.split('-').reverse().slice(0, 2).join('/');

  // Khoa làm CA NGÀY hôm nay 18/21; Cơi làm CA ĐÊM hôm qua 9/19; Nam báo ca đêm HÔM NAY (thuộc báo cáo ngày mai, không vào báo cáo hôm nay)
  await q(CV, { ngay: D, ca: 1, user: U['Phạm Văn Khoa'], tong: 21, lam: 18, nghi: { om: 3 } });
  await q(CV, { ngay: hom, ca: 2, user: U['Lò Văn Cơi'], tong: 19, lam: 9, nghi: { gd: 1 } });
  await q(CV, { ngay: D, ca: 2, user: U['Lê Hải Nam'], tong: 20, lam: 7, nghi: { om: 1 } });

  /* ===== 1. Quyền ===== */
  eq('Tiểu đội trưởng không mở được báo cáo sản lượng', (await S.call('GET', '/sanluong', undefined, 'Phạm Văn Khoa')).status, 403);
  eq('Tiểu đội trưởng không lưu được', (await S.call('PUT', '/sanluong', { ngay: D, cong: {}, chup: { chuan: 158, gia: 0.2, gc: {} } }, 'Phạm Văn Khoa')).status, 403);
  eq('Tiểu đội trưởng không đặt được thiết lập', (await S.call('PUT', '/sanluong/thietlap', { gia: 0.3 }, 'Phạm Văn Khoa')).status, 403);
  eq('CVKTHT mở được', (await S.call('GET', '/sanluong', undefined, CV)).status, 200);

  /* ===== 2. Quân số gộp: ca ngày hôm nay + ca đêm hôm trước ===== */
  const V = (await S.call('GET', '/sanluong', undefined, CV)).data;
  eq('mặc định là hôm nay', [V.ngay, V.hom], [D, hom]);
  const khoa = V.to.find((t) => t.name === 'Phạm Văn Khoa'), coi = V.to.find((t) => t.name === 'Lò Văn Cơi'), nam = V.to.find((t) => t.name === 'Lê Hải Nam');
  eq('Khoa (ca ngày): 18/21, không có phần nghỉ', [khoa.lam, khoa.tong, khoa.ngay.nghi, khoa.dem], [18, 21, undefined, null]);
  eq('Cơi (ca đêm hôm trước): 9/19', [coi.lam, coi.tong, coi.dem.ngay, coi.ngay], [9, 19, hom, null]);
  eq('Nam báo ca đêm HÔM NAY: chưa vào báo cáo hôm nay', [nam.lam, nam.tong, nam.ngay, nam.dem], [0, 0, null, null]);
  eq('ngày mai chưa tới', (await S.call('GET', '/sanluong?ngay=' + vnDay(Date.now() + 864e5 * 3), undefined, CV)).status, 400);
  eq('ngày không có thật bị từ chối', (await S.call('GET', '/sanluong?ngay=2026-13-45', undefined, CV)).status, 400);
  const Vm = (await S.call('GET', '/sanluong?ngay=' + vnDay(Date.now() + 864e5), undefined, CV));
  eq('báo cáo ngày mai bị từ chối (chưa tới)', Vm.status, 400);

  /* ===== 3. Thiết lập ===== */
  eq('công chuẩn mặc định 158, tỷ lệ giá 0,2', [V.tl.chuan, V.tl.gia], [158, 0.2]);
  eq('khoảng hợp lệ', [V.gioi_han.chuan.min, V.gioi_han.gia.min, V.gioi_han.gia.max, V.gioi_han.gc.min, V.gioi_han.gc.max], [1, 0.2, 1, 0.5, 1]);
  ok('tỷ lệ gia công mặc định từng tổ trong 0,70-0,80', V.to.every((t) => V.tl.gc[t.id] >= 0.7 && V.tl.gc[t.id] <= 0.8), JSON.stringify(V.tl.gc));
  eq('chưa tổ nào được đặt tay', V.tl.da_dat, []);
  eq('mặc định cố định theo tổ: hỏi lại ra cùng số', (await S.call('GET', '/sanluong', undefined, CV)).data.tl.gc, V.tl.gc);
  const tlap = (b, who = CV) => S.call('PUT', '/sanluong/thietlap', b, who);
  eq('công chuẩn 0 bị từ chối', (await tlap({ chuan: 0 })).status, 400);
  eq('công chuẩn quá lớn bị từ chối', (await tlap({ chuan: 5000 })).status, 400);
  eq('tỷ lệ giá dưới 0,2 bị từ chối', (await tlap({ gia: 0.1 })).status, 400);
  eq('tỷ lệ giá trên 1 bị từ chối', (await tlap({ gia: 1.5 })).status, 400);
  eq('tỷ lệ gia công dưới 0,5 bị từ chối', (await tlap({ gc: { [khoa.id]: 0.4 } })).status, 400);
  eq('tỷ lệ gia công trên 1 bị từ chối', (await tlap({ gc: { [khoa.id]: 1.2 } })).status, 400);
  eq('tỷ lệ gia công cho người không phải tổ bị từ chối', (await tlap({ gc: { [U[CV]]: 0.8 } })).status, 400);
  eq('thiết lập rỗng bị từ chối', (await tlap({})).status, 400);
  eq('các lần hỏng không đổi gì', (await S.call('GET', '/sanluong', undefined, CV)).data.tl.gia, 0.2);
  eq('đặt tỷ lệ giá chung + gia công riêng từng tổ', (await tlap({ gia: 0.25, gc: { [khoa.id]: 0.8, [coi.id]: 0.6 } })).status, 200);
  const V1 = (await S.call('GET', '/sanluong', undefined, CV)).data;
  eq('tỷ lệ giá chung 0,25', V1.tl.gia, 0.25);
  eq('Khoa 0,8, Cơi 0,6, Nam vẫn mặc định', [V1.tl.gc[khoa.id], V1.tl.gc[coi.id], V1.tl.gc[nam.id]], [0.8, 0.6, V.tl.gc[nam.id]]);
  eq('hai tổ đã đặt tay', V1.tl.da_dat.sort(), [khoa.id, coi.id].sort());
  eq('đặt thêm công chuẩn không đè tỷ lệ cũ', (await tlap({ chuan: 160 })).status, 200);
  const V1b = (await S.call('GET', '/sanluong', undefined, CV)).data;
  eq('công chuẩn 160, tỷ lệ cũ còn nguyên', [V1b.tl.chuan, V1b.tl.gia, V1b.tl.gc[khoa.id]], [160, 0.25, 0.8]);
  eq('đặt lại về 158', (await tlap({ chuan: 158 })).status, 200);
  eq('thiết lập không làm hỏng phần đầu của mẫu báo cáo ca', (await S.call('GET', `/baocao?ngay=${D}&ca=1`, undefined, CV)).status, 200);
  eq('có nhật ký đặt thiết lập', S.sql("SELECT 1 FROM audit WHERE action = 'sl_thietlap'").length, 3);

  /* ===== 4. Lưu báo cáo + ảnh chụp thiết lập ===== */
  const chup0 = { chuan: 158, gia: 0.25, gc: { [khoa.id]: 0.8, [coi.id]: 0.6, [nam.id]: V.tl.gc[nam.id] } };
  const luu = (b, who = CV) => S.call('PUT', '/sanluong', { ngay: D, cong: {}, chup: chup0, ...b }, who);
  eq('thiếu thiết lập đang dùng bị từ chối', (await luu({ chup: undefined })).status, 400);
  eq('tỷ lệ giá lạ bị từ chối', (await luu({ chup: { ...chup0, gia: 0.1 } })).status, 400);
  eq('công âm bị từ chối', (await luu({ cong: { [khoa.id]: -2 } })).status, 400);
  eq('công lẻ bị từ chối', (await luu({ cong: { [khoa.id]: 2.5 } })).status, 400);
  eq('công quá lớn bị từ chối', (await luu({ cong: { [khoa.id]: 9999 } })).status, 400);
  eq('lưu hợp lệ', (await luu({ cong: { [khoa.id]: 15 } })).status, 200);
  const V2 = (await S.call('GET', '/sanluong', undefined, CV)).data;
  eq('đọc lại: công đã sửa và ảnh chụp thiết lập', [V2.luu.cong[khoa.id], V2.luu.chup.gia, V2.luu.chup.gc[khoa.id], V2.luu.by_name], [15, 0.25, 0.8, CV]);
  eq('có dòng nhật ký lưu', S.sql("SELECT 1 FROM audit WHERE action = 'sl_luu'").length, 1);
  eq('lưu chồng với ts cũ bị từ chối', (await luu({ ts: V2.luu.ts - 5 })).status, 409);
  eq('lưu với ts đúng được', (await luu({ ts: V2.luu.ts, cong: { [khoa.id]: 15 } })).status, 200);
  // đổi thiết lập sau khi đã lưu: báo cáo cũ giữ thiết lập lúc lưu
  eq('đổi tỷ lệ giá sang 0,5', (await tlap({ gia: 0.5 })).status, 200);
  const V3 = (await S.call('GET', '/sanluong', undefined, CV)).data;
  eq('báo cáo đã lưu giữ tỷ lệ giá 0,25, thiết lập hiện tại 0,5', [V3.luu.chup.gia, V3.tl.gia], [0.25, 0.5]);

  /* ===== 5. Giao diện: tính và ghép bản chữ ===== */
  const { readFileSync } = await import('node:fs');
  const vm = (await import('node:vm')).default;
  const path = (await import('node:path')).default;
  let who = CV, chep = null;
  const el = () => ({ value: '', dataset: {}, style: {}, focus() {}, remove() {}, select() {}, setAttribute() {}, setSelectionRange() {}, querySelector: () => null, querySelectorAll: () => [], appendChild() {}, closest: () => null, set innerHTML(v) {}, get innerHTML() { return ''; } });
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
      if (!/^\/api\/(baocao|sanluong|bootstrap|quanso)/.test(String(url))) return new Promise(() => {});
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
  const bt = (await S.call('GET', '/bootstrap', undefined, CV)).data;
  R(`S.boot = ${JSON.stringify(bt)}; indexBoot(S.boot); S.me = ${JSON.stringify({ id: U[CV], name: CV, role: 'cvktht' })}; S.form = {}; S.screen = 'more';`);
  who = CV;
  R(`S.sl = null; ACTIONS.slmo()`); await cho();
  eq('mở màn báo cáo sản lượng', R('S.screen'), 'sanluong');
  eq('màn lấy đúng ngày hôm nay', R('S.sl.ngay'), D);
  ok('menu Thêm của CVKTHT có mục Báo cáo sản lượng', R('vMore()').includes('data-a="slmo"'));
  const kg = (cong, chuan, gc, gia) => Math.round((cong * chuan * gc) / gia);
  // báo cáo đã lưu: dùng ảnh chụp (tỷ lệ giá 0,25), không theo thiết lập hiện tại (0,5)
  // tổ xếp theo tên; lấy theo mã tổ cho khỏi lệ thuộc thứ tự
  const cua = (T, u) => T.dong.find((r) => r.u.id === u.id);
  const T1 = R('slTinh()');
  eq('công: Khoa 15 (đã sửa) + Cơi 9 + Nam 0', [cua(T1, khoa).cong, cua(T1, coi).cong, cua(T1, nam).cong, T1.cong], [15, 9, 0, 24]);
  eq('đi làm / tổng quân số: 27 / 40', [T1.lam, T1.tong], [27, 40]);
  eq('sản lượng từng tổ = (công x 158 x tỷ lệ gia công) / 0,25', [cua(T1, khoa).kg, cua(T1, coi).kg, cua(T1, nam).kg], [kg(15, 158, 0.8, 0.25), kg(9, 158, 0.6, 0.25), 0]);
  eq('tổng bằng cộng các tổ', T1.kg, kg(15, 158, 0.8, 0.25) + kg(9, 158, 0.6, 0.25));
  ok('báo cáo đã lưu khác thiết lập hiện tại: có nút tính lại', R('vSanLuong()').includes('data-a="slai"'));
  R(`ACTIONS.slai()`);
  const T2 = R('slTinh()');
  eq('tính lại theo thiết lập hiện tại (tỷ lệ giá 0,5)', [cua(T2, khoa).kg, cua(T2, coi).kg, cua(T2, nam).kg], [kg(15, 158, 0.8, 0.5), kg(9, 158, 0.6, 0.5), 0]);
  // sửa công của Nam, rồi xem bản chữ
  R(`S.form['slc_${nam.id}'] = '5'`);
  const gcNam = V.tl.gc[nam.id];
  const T3 = R('slTinh()');
  eq('công mới: Nam 5; chỉ ô khác số đi làm được lưu (Khoa 15, Nam 5)', [T3.cong, T3.sua], [29, { [khoa.id]: 15, [nam.id]: 5 }]);
  eq('sản lượng Nam theo tỷ lệ gia công RIÊNG của tổ', cua(T3, nam).kg, kg(5, 158, gcNam, 0.5));
  R(`S.form['slc_${nam.id}'] = '2x'`);
  ok('công gõ sai: báo lỗi nêu tên tổ', R('slTinh()').loi.includes('Lê Hải Nam'));
  R(`S.form['slc_${nam.id}'] = '5'`);
  const chu = R('slTao()'), dong = chu.split('\n');
  ok('tiêu đề đúng khuôn', dong[0] === `BÁO CÁO SẢN LƯỢNG ngày ${D.split('-').reverse().join('/')}`, dong[0]);
  ok('có tổng số tổ ở phần đầu', dong.includes('• Tổng số tổ: 3 tổ'), dong.slice(0, 4).join(' | '));
  ok('mục 2: đi làm / tổng quân số của cả hai ca gộp', dong.includes('2. Quân số đi làm trong ngày là: 27 công nhân / (tổng quân số 40)'), dong.filter((l) => l.startsWith('2.')).join(''));
  ok('Khoa: ca ngày hôm nay, công gia công thép 15', dong.includes('• Tổ Phạm Văn Khoa: ca ngày 18/21; gia công thép 15 công'), chu);
  ok('Cơi: ca đêm hôm trước, công gia công thép 9', dong.includes(`• Tổ Lò Văn Cơi: ca đêm ${ddmm(hom)} 9/19; gia công thép 9 công`), chu);
  ok('Nam: chưa báo quân số nhưng có công 5', dong.includes('• Tổ Lê Hải Nam: chưa báo; gia công thép 5 công'), chu);
  ok('không còn chữ nghỉ hay lý do nghỉ', !/nghỉ|ốm|lý do/i.test(chu), chu);
  ok('có dòng quân số gia công thép được', dong.includes('• Quân số gia công thép được: 29 công'), chu);
  ok('mục 3 nêu công chuẩn và tỷ lệ giá chung (đã tính lại: 0,5)', dong.includes('3. Sản lượng (công chuẩn 158 kg/công; tỷ lệ giá 0,5)'), chu);
  ok('mục 3 nêu phép tính từng tổ với tỷ lệ gia công riêng', dong.some((l) => l === `• Tổ Phạm Văn Khoa: 15 công × 158 kg × 0,8 ÷ 0,5 = ${String(kg(15, 158, 0.8, 0.5)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} kg`), chu);
  ok('có dòng tổng sản lượng kg và tấn', dong.some((l) => /^• Tổng sản lượng: [\d.]+ kg \([\d,]+ tấn\)$/.test(l)), dong[dong.length - 1]);
  // chép: lưu ảnh chụp thiết lập hiện tại (đã bấm tính lại) + các ô công đã sửa
  R(`ACTIONS.slchep()`); await cho();
  ok('đã chép vào bộ nhớ tạm đúng bản chữ', chep === chu, chep && chep.slice(0, 60));
  const luuRow = JSON.parse(S.one('SELECT data FROM san_luong WHERE ngay = ?', D).data);
  eq('lưu: tỷ lệ giá mới, các ô công đã sửa', [luuRow.chup.gia, luuRow.chup.chuan, luuRow.cong], [0.5, 158, { [khoa.id]: 15, [nam.id]: 5 }]);
  eq('sau khi lưu không còn nút tính lại', R('vSanLuong()').includes('data-a="slai"'), false);
  // thiết lập ngay trên màn hình
  R(`ACTIONS.sltlmo()`);
  ok('mở bảng thiết lập: công chuẩn, tỷ lệ giá và từng tổ', ['slt_chuan', 'slt_gia', `slt_gc_${khoa.id}`, `slt_gc_${nam.id}`].every((id) => R('vSanLuong()').includes('id="' + id + '"')));
  R(`S.form.slt_gia = '0,1'`); R(`ACTIONS.sltl()`); await cho();
  eq('tỷ lệ giá ngoài khoảng: không gửi, thiết lập giữ nguyên', R('S.sl.tl.gia'), 0.5);
  R(`S.form.slt_gia = '0,4'; S.form['slt_gc_${nam.id}'] = '0,9'`); R(`ACTIONS.sltl()`); await cho();
  eq('lưu thiết lập từ màn hình: tỷ lệ giá 0,4, Nam 0,9', [R('S.sl.tl.gia'), R('S.sl.tl.gc[' + nam.id + ']')], [0.4, 0.9]);
  eq('Khoa không bị đổi', R('S.sl.tl.gc[' + khoa.id + ']'), 0.8);
  eq('bảng thiết lập đóng sau khi lưu', R('S.slTlMo'), false);
  // đổi ngày
  R(`ACTIONS.slngay({ v: '${hom}' })`); await cho();
  eq('đổi sang hôm qua', R('S.sl.ngay'), hom);
  R(`ACTIONS.slngay({ v: '${vnDay(Date.now() + 864e5)}' })`); await cho();
  eq('không sang được ngày mai', R('S.sl.ngay'), hom);

  /* ===== 6. Sao lưu có bảng mới ===== */
  const bk = (await S.call('GET', '/backup', undefined, 'Admin')).data;
  ok('bản sao lưu có báo cáo sản lượng', Array.isArray(bk.bang.san_luong) && bk.bang.san_luong.length === 1, bk.bang.san_luong && bk.bang.san_luong.length);
  ok('thiết lập sản lượng nằm trong mẫu (bc_mau) nên cũng được sao lưu', JSON.parse(bk.bang.bc_mau[0].data).sl.gia === 0.4);

  const fail = T.filter((x) => x[0] === 'FAIL');
  console.log(T.map((x) => x[0] + ' | ' + x[1] + (x[2] && x[0] === 'FAIL' ? '  [' + x[2] + ']' : '')).join('\n'));
  console.log('\n=== ' + T.length + ' kiểm tra, ' + fail.length + ' lỗi ===');
  process.exit(fail.length ? 1 : 0);
}
main().catch((e) => { console.error('CRASH', e); process.exit(2); });
