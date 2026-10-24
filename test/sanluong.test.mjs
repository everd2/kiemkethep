/* Báo cáo sản lượng, kiểm trên worker thật + SQLite thật + app.js thật. node sanluong.test.mjs <đường-dẫn-repo>
   Những điều tính năng này hứa:
   1. Chỉ CVKTHT trở lên mở và lưu; Tiểu đội trưởng bị chặn.
   2. Quân số lấy nguyên số tổ đã báo (không có phần nghỉ); số công gia công thép mặc định = số đi làm, sửa được từng tổ từng ca.
   3. Sản lượng = (công x 158 kg x tỷ lệ gia công) / tỷ lệ giá; tỷ lệ giá 0,2-1 (mặc định 0,2), tỷ lệ gia công 0,5-1 (mặc định ngẫu nhiên 0,70-0,80
      cố định theo ngày); ngoài khoảng thì từ chối.
   4. Bản chữ đúng khuôn báo cáo quân số: phần đầu giữ nguyên, mục 2 quân số + công gia công thép, mục 3 sản lượng. */
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

  // quân số hôm qua: Khoa ca ngày 18/21 (nghỉ 3), Cơi ca ngày 8/19 và ca đêm 9/19; Nam không báo gì
  await q(CV, { ngay: hom, ca: 1, user: U['Phạm Văn Khoa'], tong: 21, lam: 18, nghi: { om: 3 } });
  await q(CV, { ngay: hom, ca: 1, user: U['Lò Văn Cơi'], tong: 19, lam: 8, nghi: { om: 1 } });
  await q(CV, { ngay: hom, ca: 2, user: U['Lò Văn Cơi'], tong: 19, lam: 9, nghi: { gd: 1 } });

  /* ===== 1. Quyền ===== */
  eq('Tiểu đội trưởng không mở được báo cáo sản lượng', (await S.call('GET', '/sanluong', undefined, 'Phạm Văn Khoa')).status, 403);
  eq('Tiểu đội trưởng không lưu được', (await S.call('PUT', '/sanluong', { ngay: hom, gia: 0.2, gc: 0.75, cong: {} }, 'Phạm Văn Khoa')).status, 403);
  eq('CVKTHT mở được', (await S.call('GET', '/sanluong', undefined, CV)).status, 200);

  /* ===== 2. Số liệu ===== */
  const V = (await S.call('GET', '/sanluong', undefined, CV)).data;
  eq('mặc định là hôm qua', V.ngay, hom);
  eq('công chuẩn 158 kg/công', V.chuan, 158);
  eq('tỷ lệ giá mặc định 0,2, khoảng 0,2-1', [V.mac_dinh.gia, V.gia_lim.min, V.gia_lim.max], [0.2, 0.2, 1]);
  ok('tỷ lệ gia công mặc định trong 0,70-0,80', V.mac_dinh.gc >= 0.7 && V.mac_dinh.gc <= 0.8, V.mac_dinh.gc);
  eq('khoảng tỷ lệ gia công 0,5-1', [V.gc_lim.min, V.gc_lim.max], [0.5, 1]);
  eq('mặc định cố định theo ngày: hỏi lại ra cùng số', (await S.call('GET', '/sanluong', undefined, CV)).data.mac_dinh.gc, V.mac_dinh.gc);
  const khoa = V.to.find((t) => t.name === 'Phạm Văn Khoa'), coi = V.to.find((t) => t.name === 'Lò Văn Cơi'), nam = V.to.find((t) => t.name === 'Lê Hải Nam');
  eq('Khoa: đi làm và tổng của ca ngày, không có phần nghỉ', [khoa.ca[1].lam, khoa.ca[1].tong, khoa.ca[1].nghi, khoa.ca[2]], [18, 21, undefined, null]);
  eq('Cơi báo cả hai ca', [coi.ca[1].lam, coi.ca[2].lam], [8, 9]);
  eq('Nam không báo: không có dòng nào', [nam.ca[1], nam.ca[2]], [null, null]);
  eq('chưa lưu lần nào', V.luu, null);
  eq('ngày tương lai bị từ chối', (await S.call('GET', '/sanluong?ngay=' + vnDay(Date.now() + 864e5 * 3), undefined, CV)).status, 400);
  eq('ngày không có thật bị từ chối', (await S.call('GET', '/sanluong?ngay=2026-13-45', undefined, CV)).status, 400);

  /* ===== 3. Lưu và kiểm khoảng ===== */
  const luu = (b, who = CV) => S.call('PUT', '/sanluong', { ngay: hom, gia: 0.2, gc: 0.75, cong: {}, ...b }, who);
  eq('tỷ lệ giá dưới 0,2 bị từ chối', (await luu({ gia: 0.1 })).status, 400);
  eq('tỷ lệ giá trên 1 bị từ chối', (await luu({ gia: 1.5 })).status, 400);
  eq('tỷ lệ gia công dưới 0,5 bị từ chối', (await luu({ gc: 0.4 })).status, 400);
  eq('tỷ lệ gia công trên 1 bị từ chối', (await luu({ gc: 1.2 })).status, 400);
  eq('tỷ lệ chữ bị từ chối', (await luu({ gia: 'abc' })).status, 400);
  eq('công âm bị từ chối', (await luu({ cong: { [khoa.id]: { 1: -2 } } })).status, 400);
  eq('công lẻ bị từ chối', (await luu({ cong: { [khoa.id]: { 1: 2.5 } } })).status, 400);
  eq('công quá lớn bị từ chối', (await luu({ cong: { [khoa.id]: { 1: 9999 } } })).status, 400);
  const l1 = await luu({ gia: 0.25, gc: 0.8, cong: { [khoa.id]: { 1: 15 } } });
  eq('lưu hợp lệ', l1.status, 200);
  const V2 = (await S.call('GET', '/sanluong', undefined, CV)).data;
  eq('đọc lại đúng tỷ lệ và công đã sửa', [V2.luu.gia, V2.luu.gc, V2.luu.cong[khoa.id][1], V2.luu.by_name], [0.25, 0.8, 15, CV]);
  eq('có dòng nhật ký', S.sql("SELECT 1 FROM audit WHERE action = 'sl_luu'").length, 1);
  eq('lưu chồng với ts cũ bị từ chối (người khác đã lưu)', (await luu({ ts: V2.luu.ts - 5 })).status, 409);
  eq('lưu với ts đúng được', (await luu({ ts: V2.luu.ts, gia: 0.25, gc: 0.8 })).status, 200);
  eq('Admin cũng lưu được', (await luu({ gia: 0.3, gc: 0.8, cong: { [khoa.id]: { 1: 15 } } }, 'Admin')).status, 200);

  /* ===== 4. Giao diện: tính và ghép bản chữ ===== */
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
  eq('màn lấy đúng ngày hôm qua', R('S.sl.ngay'), hom);
  ok('menu Thêm của CVKTHT có mục Báo cáo sản lượng', R('vMore()').includes('data-a="slmo"'));
  // lần lưu cuối của Admin: tỷ lệ giá 0,3, tỷ lệ gia công 0,8, công Khoa ca ngày 15 (đã lưu), còn lại theo số đi làm
  const T1 = R('slTinh()');
  eq('công ca ngày = Khoa 15 + Cơi 8 = 23; ca đêm = Cơi 9', [T1.ca[1].cong, T1.ca[2].cong], [23, 9]);
  eq('đi làm đúng số tổ báo (Khoa 18 + Cơi 8 | Cơi 9)', [T1.ca[1].lam, T1.ca[2].lam, T1.lam, T1.tong], [26, 9, 35, 40 + 19]);
  eq('sản lượng ca ngày = (23 x 158 x 0,8) / 0,3', T1.ca[1].kg, Math.round((23 * 158 * 0.8) / 0.3));
  eq('sản lượng ca đêm = (9 x 158 x 0,8) / 0,3', T1.ca[2].kg, Math.round((9 * 158 * 0.8) / 0.3));
  eq('tổng bằng hai ca cộng lại', T1.kg, T1.ca[1].kg + T1.ca[2].kg);
  // sửa ô: tỷ lệ về mặc định 0,2 / 0,75 và công của Nam ca đêm 5
  R(`S.form.slgia = '0,2'; S.form.slgc = '0,75'; S.form['slc_${nam.id}_2'] = '5'; S.form['slc_${khoa.id}_1'] = '18'`);
  const T2 = R('slTinh()');
  eq('công mới: ca ngày 26, ca đêm 14', [T2.ca[1].cong, T2.ca[2].cong], [26, 14]);
  eq('chỉ ô khác số đi làm mới được lưu (Nam ca đêm)', T2.sua, { [nam.id]: { 2: 5 } });
  eq('sản lượng theo tỷ lệ mới', T2.kg, Math.round((26 * 158 * 0.75) / 0.2) + Math.round((14 * 158 * 0.75) / 0.2));
  R(`S.form.slgia = '0,1'`);
  ok('tỷ lệ giá ngoài khoảng: báo lỗi, sản lượng 0', R('slTinh()').loi.includes('Tỷ lệ giá') && R('slTinh().kg') === 0);
  R(`S.form.slgia = '0,2'; S.form.slgc = '1,4'`);
  ok('tỷ lệ gia công ngoài khoảng: báo lỗi', R('slTinh()').loi.includes('Tỷ lệ gia công'));
  R(`S.form.slgc = '0,75'; S.form['slc_${khoa.id}_1'] = '2x'`);
  ok('công gõ sai: báo lỗi nêu tên tổ', R('slTinh()').loi.includes('Phạm Văn Khoa'));
  R(`S.form['slc_${khoa.id}_1'] = '18'`);
  const chu = R('slTao()');
  const dong = chu.split('\n');
  ok('tiêu đề đúng khuôn', dong[0] === `BÁO CÁO SẢN LƯỢNG ngày ${hom.split('-').reverse().join('/')}`, dong[0]);
  ok('có tổng số tổ ở phần đầu', dong.includes('• Tổng số tổ: 3 tổ'), dong.slice(0, 4).join(' | '));
  ok('mục 2 quân số đi làm / tổng quân số', dong.some((l) => l.startsWith('2. Quân số đi làm trong ngày là: 35 công nhân / (tổng quân số 59)')), dong.filter((l) => l.startsWith('2.')).join(''));
  ok('không còn chữ nghỉ hay lý do nghỉ', !/nghỉ|ốm|lý do/i.test(chu), chu);
  ok('có dòng quân số gia công thép được', dong.some((l) => l.startsWith('• Quân số gia công thép được: 40 công (ca ngày 26, ca đêm 14)')), chu);
  ok('dòng tổ Khoa nêu đi làm và công gia công', dong.some((l) => l.startsWith('• Tổ Phạm Văn Khoa ca ngày: 18/21 người, gia công thép 18 công')), chu);
  ok('mục 3 nêu công chuẩn và hai tỷ lệ', dong.some((l) => l === '3. Sản lượng (công chuẩn 158 kg/công; tỷ lệ giá 0,2; tỷ lệ gia công 0,75)'), chu);
  ok('có dòng tổng sản lượng bằng kg và tấn', dong.some((l) => /^• Tổng sản lượng: [\d.]+ kg \([\d,]+ tấn\)$/.test(l)), dong[dong.length - 1]);
  // chép: gửi lên máy chủ đúng phần khác mặc định, rồi đọc lại khớp
  R(`ACTIONS.slchep()`); await cho();
  ok('đã chép vào bộ nhớ tạm đúng bản chữ', chep === chu, chep && chep.slice(0, 60));
  const luuRow = JSON.parse(S.one('SELECT data FROM san_luong WHERE ngay = ?', hom).data);
  eq('lưu đúng tỷ lệ và chỉ ô khác số đi làm', [luuRow.gia, luuRow.gc, luuRow.cong], [0.2, 0.75, { [nam.id]: { 2: 5 } }]);
  // đổi ngày
  R(`ACTIONS.slngay({ v: '${D}' })`); await cho();
  eq('đổi sang hôm nay', R('S.sl.ngay'), D);
  R(`ACTIONS.slngay({ v: '${vnDay(Date.now() + 864e5)}' })`); await cho();
  eq('không sang được ngày mai', R('S.sl.ngay'), D);

  /* ===== 5. Sao lưu có bảng mới ===== */
  const bk = (await S.call('GET', '/backup', undefined, 'Admin')).data;
  ok('bản sao lưu có báo cáo sản lượng', Array.isArray(bk.bang.san_luong) && bk.bang.san_luong.length === 1, bk.bang.san_luong && bk.bang.san_luong.length);

  const fail = T.filter((x) => x[0] === 'FAIL');
  console.log(T.map((x) => x[0] + ' | ' + x[1] + (x[2] && x[0] === 'FAIL' ? '  [' + x[2] + ']' : '')).join('\n'));
  console.log('\n=== ' + T.length + ' kiểm tra, ' + fail.length + ' lỗi ===');
  process.exit(fail.length ? 1 : 0);
}
main().catch((e) => { console.error('CRASH', e); process.exit(2); });
