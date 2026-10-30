/* Báo cáo sản lượng, kiểm trên worker thật + SQLite thật + app.js thật. node sanluong.test.mjs <đường-dẫn-repo>
   Những điều tính năng này hứa:
   1. Chỉ CVKTHT trở lên mở, lưu, đặt thiết lập; Tiểu đội trưởng bị chặn.
   2. MỘT báo cáo gộp ca ngày + ca đêm: mỗi tổ một dòng, quân số = ca ngày của ngày báo cáo và/hoặc ca đêm HÔM TRƯỚC; không có phần nghỉ.
   3. Thiết lập: công chuẩn (158), tỷ lệ giá CHUNG (0,2-1, mặc định 0,2), tỷ lệ gia công RIÊNG TỪNG TỔ (0,5-1, mặc định 0,70-0,80).
   4. Sản lượng tổ = (công x công chuẩn x tỷ lệ gia công của tổ) / tỷ lệ giá, tự tính theo thiết lập; ngày đã lưu giữ thiết lập lúc lưu.
   5. Bản chữ đúng khuôn báo cáo quân số: phần đầu giữ nguyên, mục 2 quân số + công gia công thép, mục 3 sản lượng. */
import { advance, boot, vnDay } from './harness.mjs';

const ROOT = process.argv[2] || '.';
const T = [];
const ok = (name, cond, extra) => { T.push([cond ? 'PASS' : 'FAIL', name, extra === undefined ? '' : String(extra)]); };
const eq = (name, a, b) => ok(name + ' = ' + JSON.stringify(b), JSON.stringify(a) === JSON.stringify(b), 'thực tế: ' + JSON.stringify(a));

/* Một lời gọi treo mãi (fetch giả trả Promise không bao giờ xong) làm Node thoát mã 0 mà không in gì — run.mjs sẽ tưởng là qua.
   Chưa tới dòng tổng kết mà tiến trình sắp thoát thì báo hỏng. */
let xong = false;
process.on('beforeExit', () => { if (!xong) { console.log('CRASH test dừng giữa chừng (chờ một lời gọi không bao giờ trả về)'); process.exit(2); } });

async function main() {
  /* 9h sáng: ca ngày hôm nay ĐANG chạy (Hoàng theo số thiết lập hiện tại), ca đêm hôm qua ĐÃ hết (Sơn theo bản chép lúc hết ca,
     xem bên dưới). Không ghim giờ thì kết quả tuỳ lúc chạy test: chạy sau 18h30 ca ngày đã hết, chạy trước 6h30 ca đêm chưa hết. */
  const cur = ((Date.now() + 7 * 3600e3) % 864e5) / 60e3;
  advance(((9 * 60 - cur + 1440) % 1440 || 1440) * 60e3);
  const S = await boot(ROOT);
  await S.call('POST', '/setup', { token: 'setup-tok', name: 'Admin', phone: '0900000001', pin: '2468' });
  await S.login('Admin', '0900000001', '2468');
  const U = {};
  const ds = [['Phạm Văn Khoa', 'tieudoi'], ['Lò Văn Cơi', 'tieudoi'], ['Lê Hải Nam', 'tieudoi'], ['Nguyễn Văn Hoàng', 'tieudoi'], ['Nguyễn Đức Sơn', 'tieudoi'], ['Lý Đình Trường', 'tieudoi'], ['Nguyễn Duy Dũng', 'cvktht']];
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
  // Trường làm CẢ HAI ca: ca ngày hôm nay 7/19 và ca đêm hôm qua 7/19 (tổng 19 => nghỉ 5)
  await q(CV, { ngay: D, ca: 1, user: U['Lý Đình Trường'], tong: 19, lam: 7 });
  await q(CV, { ngay: hom, ca: 2, user: U['Lý Đình Trường'], tong: 19, lam: 7 });
  // Hoàng và Sơn KHÔNG báo gì, chỉ có "Thiết lập quân số" do CVKTHT đặt: Hoàng làm ca ngày 12/15, Sơn làm ca đêm 17/19
  const tlq = (b) => S.call('PUT', '/quanso/thietlap', b, CV);
  eq('đặt thiết lập quân số cho Hoàng (ca ngày)', (await tlq({ user: U['Nguyễn Văn Hoàng'], tong: 15, s1: 12, s2: 0, ts: 0 })).status, 200);
  /* Ca đêm hôm qua ĐÃ HẾT: theo README (Thống kê quân số: "sửa số thiết lập sau đó không đổi số của ca đã qua"), báo cáo ca và
     sản lượng của ca đã qua lấy số thiết lập ĐÃ CHÉP LÚC HẾT CA (quan_so_tl, lịch mỗi giờ ghi), không lấy số đang đặt. Trước đây
     test này chỉ có số đang đặt và mong báo cáo hôm qua đọc thẳng số đó — đúng cái lỗi đã sửa (CVKTHT sửa số hôm nay là báo cáo
     hôm qua đổi theo, lệch với Thống kê). Nay dựng đúng như thật: lúc hết ca đêm Sơn có số 17/19 và lịch đã chép dòng này; sáng
     nay CVKTHT sửa số đang đặt thành 16 (cho các ca sau) — báo cáo hôm qua vẫn phải là 17/19. */
  eq('đặt thiết lập quân số cho Sơn (ca đêm), sửa sau giờ hết ca', (await tlq({ user: U['Nguyễn Đức Sơn'], tong: 19, s1: 0, s2: 16, ts: 0 })).status, 200);
  S.raw.prepare('INSERT INTO quan_so_tl (ngay, ca, user_id, tong, lam, nghi, ghi_chu, ts) VALUES (?, 2, ?, 19, 17, ?, NULL, ?)').run(hom, U['Nguyễn Đức Sơn'], '{}', Date.now());

  /* ===== 1. Quyền ===== */
  eq('Tiểu đội trưởng không mở được báo cáo sản lượng', (await S.call('GET', '/sanluong', undefined, 'Phạm Văn Khoa')).status, 403);
  eq('Tiểu đội trưởng không lưu được', (await S.call('PUT', '/sanluong', { ngay: D, cong: {}, chup: { chuan: 158, gia: 0.2, gc: {} } }, 'Phạm Văn Khoa')).status, 403);
  eq('Tiểu đội trưởng không đặt được thiết lập', (await S.call('PUT', '/sanluong/thietlap', { gia: 0.3 }, 'Phạm Văn Khoa')).status, 403);
  eq('CVKTHT mở được', (await S.call('GET', '/sanluong', undefined, CV)).status, 200);

  /* ===== 2. Quân số gộp: ca ngày hôm nay + ca đêm hôm trước ===== */
  const V = (await S.call('GET', '/sanluong', undefined, CV)).data;
  eq('mặc định là hôm nay', [V.ngay, V.hom], [D, hom]);
  const khoa = V.to.find((t) => t.name === 'Phạm Văn Khoa'), coi = V.to.find((t) => t.name === 'Lò Văn Cơi'), nam = V.to.find((t) => t.name === 'Lê Hải Nam');
  eq('server chỉ trả danh sách tổ (quân số lấy từ báo cáo ca, không tính ở server)', Object.keys(khoa).sort(), ['id', 'name']);
  const hoang = V.to.find((t) => t.name === 'Nguyễn Văn Hoàng'), son = V.to.find((t) => t.name === 'Nguyễn Đức Sơn'), truong = V.to.find((t) => t.name === 'Lý Đình Trường');
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
      if (!/^\/api\/(baocao|sanluong|bootstrap|quanso|rev)/.test(String(url))) return new Promise(() => {});
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
  /* ===== QUÂN SỐ LÀ CỦA BÁO CÁO CA: một nơi tính duy nhất (bcQuanSo) ===== */
  const Bngay = R('S.sl.bc[0]'), Bdem = R('S.sl.bc[1]');
  eq('lấy báo cáo ca của CA NGÀY hôm nay và CA ĐÊM hôm trước', [Bngay.ngay, Bngay.ca, Bdem.ngay, Bdem.ca], [D, 1, hom, 2]);
  const hangBc = (idx, ng) => R(`bcQuanSo(S.sl.bc[${idx}], ${ng ? "'" + ng + "'" : `bcNGoc(S.sl.bc[${idx}])`}).rows.map((r) => [r.u.id, r.trang, r.lam, r.tong])`);
  const khop = (nhan, idx, truong, ng) => {
    for (const [uid, trang, lam, tong] of hangBc(idx, ng)) {
      const u = R(`S.sl.to.find((x) => x.id === ${uid})`);
      if (!u) continue;
      const mong = trang === 'da' || trang === 'tl' || trang === 'tlda' ? [lam, tong] : null;
      const co = u[truong] ? [u[truong].lam, u[truong].tong] : null;
      if (JSON.stringify(co) !== JSON.stringify(mong)) { ok(`${nhan}: tổ ${u.name} khớp báo cáo ca`, false, `báo cáo ca ${JSON.stringify(mong)} <> sản lượng ${JSON.stringify(co)}`); return; }
    }
    ok(`${nhan}: mọi tổ khớp đúng số của báo cáo ca`, true);
  };
  khop('ca ngày', 0, 'ngay');
  khop('ca đêm hôm trước', 1, 'dem');
  const dongBc = R(`bcQuanSo(S.sl.bc[0], bcNGoc(S.sl.bc[0])).dong.join('|')`) + '|' + R(`bcQuanSo(S.sl.bc[1], bcNGoc(S.sl.bc[1])).dong.join('|')`);
  ok('chữ của báo cáo ca có đúng các số mà sản lượng dùng (Khoa 18/21, Hoàng 12/15, Trường 7/19, Cơi 9/19, Sơn 17/19)', ['Phạm Văn Khoa: ca ngày 18/21 cn', 'Nguyễn Văn Hoàng: ca ngày 12/15 cn', 'Lý Đình Trường: ca ngày 7/19 cn', 'Lò Văn Cơi: ca đêm 9/19 cn', 'Nguyễn Đức Sơn: ca đêm 17/19 cn'].every((x) => dongBc.includes(x)), dongBc);
  const uOf = (u) => R(`S.sl.to.find((x) => x.id === ${u.id})`);
  eq('Khoa: ca ngày 18/21, nguồn tổ báo', [uOf(khoa).lam, uOf(khoa).tong, uOf(khoa).ngay.nguon, uOf(khoa).dem], [18, 21, 'bao', null]);
  eq('Cơi: ca đêm hôm trước 9/19', [uOf(coi).lam, uOf(coi).tong, uOf(coi).dem.ngay, uOf(coi).ngay], [9, 19, hom, null]);
  eq('Nam báo ca đêm HÔM NAY: chưa vào báo cáo hôm nay', [uOf(nam).lam, uOf(nam).ngay, uOf(nam).dem], [0, null, null]);
  eq('Hoàng chỉ có thiết lập quân số: 12/15 (nguồn thiết lập)', [uOf(hoang).lam, uOf(hoang).tong, uOf(hoang).ngay.nguon], [12, 15, 'tl']);
  eq('Sơn chỉ có thiết lập quân số ca đêm: 17/19 ở ca đêm hôm trước', [uOf(son).lam, uOf(son).tong, uOf(son).dem.nguon, uOf(son).ngay], [17, 19, 'tl', null]);
  eq('Trường làm cả hai ca: 7 + 7, tổng 19', [uOf(truong).ngay.lam, uOf(truong).dem.lam, uOf(truong).lam, uOf(truong).tong], [7, 7, 14, 19]);
  const kg = (cong, chuan, gc, gia) => Math.round((cong * chuan * gc) / gia);
  const cua = (T, u) => T.dong.find((r) => r.u.id === u.id);
  // báo cáo đã lưu: dùng ảnh chụp (tỷ lệ giá 0,25), không theo thiết lập hiện tại (0,5)
  const T1 = R('slTinh()');
  eq('công: Khoa 15 (đã sửa), Cơi 9, Hoàng 12 (thiết lập), Sơn 17 (thiết lập), Trường 14, Nam 0', [khoa, coi, hoang, son, truong, nam].map((u) => cua(T1, u).cong), [15, 9, 12, 17, 14, 0]);
  eq('đi làm / tổng quân số', [T1.lam, T1.tong], [18 + 9 + 12 + 17 + 14, 21 + 19 + 15 + 19 + 19]);
  const gcCh = (u) => R('slGcCua(slCS(), ' + u.id + ')');
  eq('sản lượng từng tổ = (công x 158 x tỷ lệ gia công) / 0,25', [khoa, coi, hoang].map((u) => cua(T1, u).kg), [kg(15, 158, 0.8, 0.25), kg(9, 158, 0.6, 0.25), kg(12, 158, gcCh(hoang), 0.25)]);
  ok('báo cáo đã lưu khác thiết lập hiện tại: có nút tính lại', R('vSanLuong()').includes('data-a="slai"'));
  R(`ACTIONS.slai()`);
  const T2 = R('slTinh()');
  eq('tính lại theo thiết lập hiện tại (tỷ lệ giá 0,5)', [khoa, coi].map((u) => cua(T2, u).kg), [kg(15, 158, 0.8, 0.5), kg(9, 158, 0.6, 0.5)]);
  // sửa công của Nam, rồi xem bản chữ
  R(`S.form['slc_${nam.id}'] = '5'`);
  const T3 = R('slTinh()');
  eq('chỉ ô khác số đi làm được lưu (Khoa 15, Nam 5)', T3.sua, { [khoa.id]: 15, [nam.id]: 5 });
  eq('sản lượng Nam theo tỷ lệ gia công RIÊNG của tổ', cua(T3, nam).kg, kg(5, 158, V.tl.gc[nam.id], 0.5));
  R(`S.form['slc_${nam.id}'] = '2x'`);
  ok('công gõ sai: báo lỗi nêu tên tổ', R('slTinh()').loi.includes('Lê Hải Nam'));
  R(`S.form['slc_${nam.id}'] = '5'`);
  const chu = R('slTao()'), dong = chu.split('\n'), kgv = (u) => cua(R('slTinh()'), u).kg;
  eq('đúng mẫu: tiêu đề + phần đầu + mỗi tổ một dòng, không mục 2/3, không dòng tổng', dong.length, 1 + 1 + 6);
  ok('tiêu đề đúng khuôn', dong[0] === `BÁO CÁO SẢN LƯỢNG ngày ${D.split('-').reverse().join('/')}`, dong[0]);
  ok('có tổng số tổ ở phần đầu', dong[1] === '• Tổng số tổ: 6 tổ', dong[1]);
  const tu = dong.slice(2);
  eq('tổ ca ngày: dòng đúng mẫu', tu.find((l) => l.includes('Khoa')), `• Tổ Phạm Văn Khoa: ca ngày 18/21 cn gia công thép ${kgv(khoa)} kg`);
  eq('Hoàng (chỉ thiết lập quân số): ca ngày 12/15', tu.find((l) => l.includes('Hoàng')), `• Tổ Nguyễn Văn Hoàng: ca ngày 12/15 cn gia công thép ${kgv(hoang)} kg`);
  eq('Trường làm hai ca: ca ngày + ca đêm, không ghi số nghỉ', tu.find((l) => l.includes('Trường')), `• Tổ Lý Đình Trường: ca ngày 7/19 cn, ca đêm 7/19 cn gia công thép ${kgv(truong)} kg`);
  eq('Cơi chỉ làm đêm: (làm ca đêm) 9/19', tu.find((l) => l.includes('Cơi')), `• Tổ Lò Văn Cơi (làm ca đêm) 9/19 cn gia công thép ${kgv(coi)} kg`);
  eq('Sơn (chỉ thiết lập quân số) làm đêm: 17/19', tu.find((l) => l.includes('Sơn')), `• Tổ Nguyễn Đức Sơn (làm ca đêm) 17/19 cn gia công thép ${kgv(son)} kg`);
  eq('Nam chưa báo nhưng có công 5: vẫn có dòng, xếp cuối', tu[tu.length - 1], `• Tổ Lê Hải Nam: chưa báo quân số — gia công thép ${kgv(nam)} kg`);
  ok('tổ ca ngày xếp trước, tổ chỉ làm đêm sau, tổ chưa báo cuối', tu.findIndex((l) => l.includes('(làm ca đêm)')) > tu.findIndex((l) => l.includes('Trường')) && tu.findIndex((l) => l.includes('chưa báo')) === tu.length - 1, tu.join(' | '));
  ok('không còn chữ nghỉ hay lý do nghỉ ở dòng nào', !/nghỉ|ốm|lý do/i.test(chu), chu);
  ok('kg là số nguyên trơn (không dấu chấm nghìn)', tu.every((l) => /\d+ kg$/.test(l) && !/\d\.\d{3} kg$/.test(l)), tu.join(' | '));
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
  // nguồn quân số "Chỉ số thiết lập" (cùng nút với báo cáo ca): Khoa đã báo 18/21 nhưng thiết lập là 10/21
  eq('đặt thiết lập quân số cho Khoa: đi làm ca ngày 10', (await S.call('PUT', '/quanso/thietlap', { user: khoa.id, tong: 21, s1: 10, s2: 0, ts: 0 }, CV)).status, 200);
  await R('slTai(undefined, true)'); await cho();
  eq('mặc định theo báo cáo ca (Theo tổ báo): Khoa vẫn 18', [uOf(khoa).lam, uOf(khoa).ngay.nguon], [18, 'bao']);
  ok('có hai nút nguồn như báo cáo ca', R('vSanLuong()').includes('data-a="slnguon" data-v="tl"') && R('vSanLuong()').includes('data-a="slnguon" data-v="to"'));
  R(`ACTIONS.slnguon({ v: 'tl' })`);
  eq('đổi sang Chỉ số thiết lập: Khoa 10/21 (nguồn thiết lập)', [uOf(khoa).lam, uOf(khoa).tong, uOf(khoa).ngay.nguon], [10, 21, 'tl']);
  khop('ca ngày (sau khi đổi nguồn)', 0, 'ngay', 'tl');
  eq('Hoàng, Sơn vẫn đúng số thiết lập', [uOf(hoang).lam, uOf(son).lam], [12, 17]);
  const congKhoa = cua(R('slTinh()'), khoa);
  eq('công gia công thép của Khoa theo số mới (10), công đã sửa tay 15 thì giữ 15', congKhoa.cong, 15);
  R(`ACTIONS.slchep()`); await cho();
  eq('lưu kèm nguồn quân số đã chọn', JSON.parse(S.one('SELECT data FROM san_luong WHERE ngay = ?', D).data).nguon, 'tl');
  await R('slTai()'); await cho();
  eq('mở lại: nhớ nguồn đã chọn', [R('S.slNguon'), uOf(khoa).lam], ['tl', 10]);
  R(`ACTIONS.slnguon({ v: 'to' })`);
  eq('đổi lại Theo tổ báo: Khoa 18', uOf(khoa).lam, 18);
  // đổi ngày
  R(`ACTIONS.slngay({ v: '${hom}' })`); await cho();
  eq('đổi sang hôm qua', R('S.sl.ngay'), hom);
  R(`ACTIONS.slngay({ v: '${vnDay(Date.now() + 864e5)}' })`); await cho();
  eq('không sang được ngày mai', R('S.sl.ngay'), hom);

  // dòng tự gõ của báo cáo ca: bỏ dấu đầu dòng, nhưng giữ dấu của số (+84..., -5 độ)
  eq('bcDong bỏ gạch đầu dòng, giữ dấu của số', R(`bcDong('- Việc A\\n-Việc B\\n+84 912 345\\n-5 độ C\\n• Việc D\\n* Việc E')`), ['Việc A', 'Việc B', '+84 912 345', '-5 độ C', 'Việc D', 'Việc E']);

  // mở lại màn: hiện NGAY bản đã tải gần đây (không chờ mạng), bản mới tải ở nền rồi thay vào
  R(`S.screen = 'more'`);
  R(`ACTIONS.slngay({ v: '${D}' })`); await cho();
  eq('mở lại báo cáo sản lượng: có số ngay khi bấm, chưa cần chờ mạng', R(`S.sl = null; ACTIONS.slmo(); !!(S.sl && S.sl.to && S.sl.to.length)`), true);
  await cho();
  eq('sau khi bản mới về: vẫn đúng ngày, đúng số (nguồn đã lưu: Chỉ số thiết lập -> Khoa 10)', [R('S.sl.ngay'), R('S.slNguon'), R(`S.sl.to.find((x) => x.id === ${khoa.id}).lam`)], [D, 'tl', 10]);
  R(`S.bcCa = { ngay: '${D}', ca: 1 }; S.bcc = null; go('baocaoca')`); await cho();
  eq('mở lại báo cáo ca cùng ca: có số ngay khi bấm', R(`S.screen = 'more'; S.bcc = null; go('baocaoca'); !!S.bcc`), true);
  await cho();
  eq('báo cáo ca sau khi bản mới về vẫn đúng ca', [R('S.bcc.ngay'), R('S.bcc.ca')], [D, 1]);

  /* Màn sản lượng đang mở mà tổ báo thêm / người khác lưu: vòng tự làm mới phải theo số mới như màn báo cáo ca (trước đây màn
     này không nằm trong vòng làm mới: đứng yên số cũ tới khi mở lại màn). */
  R(`S.sl = null; ACTIONS.slmo()`); await cho();
  R(`ACTIONS.slnguon({ v: 'to' })`);
  eq('trước khi Hoàng báo: Hoàng theo số thiết lập 12', [uOf(hoang).lam, uOf(hoang).ngay.nguon], [12, 'tl']);
  R(`S.form['slc_' + ${khoa.id}] = '20'`);
  await q(CV, { ngay: D, ca: 1, user: hoang.id, tong: 15, lam: 13 });
  await R('refresh()'); await cho();
  eq('Hoàng vừa báo 13/15: màn sản lượng tự cập nhật, không cần mở lại', [uOf(hoang).lam, uOf(hoang).tong, uOf(hoang).ngay.nguon], [13, 15, 'bao']);
  eq('ô công đang gõ của Khoa giữ nguyên, nguồn đang chọn giữ nguyên', [R(`S.form['slc_' + ${khoa.id}]`), R('S.slNguon')], ['20', 'to']);
  eq('khớp với báo cáo ca ngay lúc đó', R(`bcQuanSo(S.sl.bc[0], 'to').rows.find((r) => r.u.id === ${hoang.id}).lam`), 13);
  R(`S.slTlMo = true`);
  await q(CV, { ngay: D, ca: 1, user: hoang.id, tong: 15, lam: 14 });
  await R('refresh()'); await cho();
  eq('đang mở bảng thiết lập: chưa vẽ lại (giữ số cũ)', uOf(hoang).lam, 13);
  R(`S.slTlMo = false`);
  await R('refresh()'); await cho();
  eq('đóng bảng thiết lập: vòng sau lấy số mới', uOf(hoang).lam, 14);
  // người khác lưu báo cáo sản lượng: chưa gõ gì thì lấy hẳn bản đó và nói rõ
  R(`delete S.form['slc_' + ${khoa.id}]; S.toast = ''`);
  eq('Admin lưu báo cáo sản lượng hôm nay', (await S.call('PUT', '/sanluong', { ngay: D, cong: { [khoa.id]: 3 }, chup: { chuan: 158, gia: 0.4, gc: {} }, nguon: 'to' }, 'Admin')).status, 200);
  await R('refresh()'); await cho();
  ok('người khác vừa lưu: màn lấy bản đó và nói rõ', R('S.sl.luu.cong[' + khoa.id + ']') === 3 && /Admin vừa lưu báo cáo sản lượng/.test(R('S.toast')), R('S.toast'));

  /* Mục 3 của báo cáo ca SỬA TAY: sản lượng theo chữ đã sửa. Chưa sửa thì theo số app tính (như trên). Nháp trên máy đang soạn
     thắng (thấy ngay), máy khác thấy khi bản sửa đã chép lên máy chủ. Tổ không có dòng trong chữ đã sửa vẫn theo số app. */
  const s3Nhap = (s3) => R(`localStorage.setItem(bcKey(S.sl.bc[0]), ${JSON.stringify(JSON.stringify({ v: 2, muc: { s3 }, dau: {}, ts: Date.now() + 1 }))})`);
  s3Nhap('Quân số đi làm trong ca 1 là: 9 công nhân / (tổng quân số 30)\n• Tổ Nguyễn Văn Hoàng: ca ngày 9/15 cn, nghỉ 6 cn\n• Tổ Phạm Văn Khoa: chưa báo quân số ca ngày');
  R('slGan()');
  eq('nháp sửa tay trên máy: Hoàng theo chữ đã sửa 9/15', [uOf(hoang).lam, uOf(hoang).tong, uOf(hoang).ngay.nguon], [9, 15, 'tay']);
  eq('dòng "chưa báo" đã sửa tay: Khoa không có số ca ngày', uOf(khoa).ngay, null);
  eq('tổ không có dòng trong chữ đã sửa (Trường): vẫn theo số app', [uOf(truong).ngay.lam, uOf(truong).ngay.nguon], [7, 'bao']);
  ok('bản chữ sản lượng mang số đã sửa', R('slTao()').includes('Tổ Nguyễn Văn Hoàng: ca ngày 9/15 cn'), R('slTao()'));
  ok('màn hình nói rõ mục quân số đã sửa tay', /đã sửa tay: sản lượng theo số đã sửa/.test(R('vSanLuong()')) && R('vSanLuong()').includes('(đã sửa tay ở báo cáo ca)'));
  R(`localStorage.removeItem(bcKey(S.sl.bc[0])); slGan()`);
  eq('bỏ nháp: Hoàng về số app 14', uOf(hoang).lam, 14);
  // máy KHÁC (Admin) chép báo cáo ca có mục 3 sửa tay: màn sản lượng đang mở tự lấy số đó
  const bcH = (await S.call('GET', `/baocao?ngay=${D}&ca=1`, undefined, 'Admin')).data;
  eq('Admin chép báo cáo ca, mục 3 sửa tay Hoàng 11/15', (await S.call('PUT', '/baocao', { ngay: D, ca: 1, ts: bcH.bao ? bcH.bao.ts : 0, van_ban: 'x', muc: { s3: 'Quân số\nTổ Nguyễn Văn Hoàng: ca ngày 11/15 cn' } }, 'Admin')).status, 200);
  await R('refresh()'); await cho();
  eq('đã chép ở máy khác: sản lượng tự cập nhật theo số sửa tay', [uOf(hoang).lam, uOf(hoang).ngay.nguon], [11, 'tay']);
  // máy này bấm "Lấy lại số từ app" (nháp: s3 = null) thì về số app dù bản đã chép có sửa tay
  s3Nhap(null); R('slGan()');
  eq('nháp "lấy lại số từ app": Hoàng về số app 14', [uOf(hoang).lam, uOf(hoang).ngay.nguon], [14, 'bao']);
  R(`localStorage.removeItem(bcKey(S.sl.bc[0])); slGan()`);
  // đọc tên tổ đúng dòng: "Tổ Nam" không ăn nhầm dòng "Tổ Nam Anh"; dòng không ghi ca coi là số ca đó
  eq('tên tổ là đầu của tên khác: lấy đúng dòng', R(`JSON.stringify([bcS3Cua('Tổ Nam Anh: ca ngày 5/9 cn\\nTổ Nam: ca đêm 3/4 cn', 'Nam', 2), bcS3Cua('Tổ Nam Anh: ca ngày 5/9 cn\\nTổ Nam: ca đêm 3/4 cn', 'Nam', 1), bcS3Cua('- tổ  nam:  12 / 20 cn', 'Nam', 1), bcS3Cua('Tổ Khác: 1/2', 'Nam', 1)])`), JSON.stringify([{ lam: 3, tong: 4 }, 'khong', { lam: 12, tong: 20 }, null]));

  // tự dùng bản mới nhất: có bản mới mà không làm dở việc gì thì tải lại; đang làm dở thì chờ
  R(`globalThis.__tai = 0; globalThis.location = { reload() { globalThis.__tai++; } }; S.newVer = true; S.sel = null; S.ask = null; S.busy = false; S.slTlMo = false; S.nhap.lines = []; S.screen = 'sanluong';`);
  eq('ô sửa của màn báo cáo ca còn mở nhưng đã rời màn đó: không coi là việc dở', R(`S.bcMo = 'dau'; coViecDo()`), false);
  eq('có bản mới, không việc dở: tự tải lại', [R('tuCapNhat()'), R('globalThis.__tai')], [true, 1]);
  R(`S.slTlMo = true`);
  eq('đang mở bảng thiết lập (việc dở): chưa tải lại', [R('tuCapNhat()'), R('globalThis.__tai')], [false, 1]);
  R(`S.slTlMo = false; S.nhap.lines = [{ phi: 'D10', qty: 5 }]`);
  eq('đang lập phiếu nhập dở: chưa tải lại', R('tuCapNhat()'), false);
  R(`S.nhap.lines = []; S.newVer = false`);
  eq('không có bản mới: không tải lại', R('tuCapNhat()'), false);
  R(`delete globalThis.location`);

  /* ===== 6. Sao lưu có bảng mới ===== */
  const bk = (await S.call('GET', '/backup', undefined, 'Admin')).data;
  ok('bản sao lưu có báo cáo sản lượng', Array.isArray(bk.bang.san_luong) && bk.bang.san_luong.length === 1, bk.bang.san_luong && bk.bang.san_luong.length);
  ok('thiết lập sản lượng nằm trong mẫu (bc_mau) nên cũng được sao lưu', JSON.parse(bk.bang.bc_mau[0].data).sl.gia === 0.4);

  xong = true;
  const fail = T.filter((x) => x[0] === 'FAIL');
  console.log(T.map((x) => x[0] + ' | ' + x[1] + (x[2] && x[0] === 'FAIL' ? '  [' + x[2] + ']' : '')).join('\n'));
  console.log('\n=== ' + T.length + ' kiểm tra, ' + fail.length + ' lỗi ===');
  process.exit(fail.length ? 1 : 0);
}
main().catch((e) => { console.error('CRASH', e); process.exit(2); });
