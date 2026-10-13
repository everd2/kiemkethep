/* Báo cáo ca gửi cấp trên, kiểm trên worker thật + SQLite thật + app.js thật. node baocao.test.mjs <đường-dẫn-repo>
   Những điều tính năng này hứa:
   1. Chỉ CVKTHT trở lên soạn và lưu.
   2. Bản chữ đúng mẫu của đơn vị: phần đầu, quân số từng tổ (tổ chia ca, tổ làm ca kia, tổ chưa báo), công việc từ
      gia công, máy móc, kiểm tra, vướng mắc, tiến độ.
   3. Mục đã sửa tay giữ nguyên chữ của người soạn; phần đầu và máy móc thành mẫu cho ca sau; dòng kiểm tra chỉ thành
      mẫu khi bấm đặt làm mẫu. */
import { boot, advance, vnDay } from './harness.mjs';

const ROOT = process.argv[2] || '.';
const T = [];
const ok = (name, cond, extra) => { T.push([cond ? 'PASS' : 'FAIL', name, extra === undefined ? '' : String(extra)]); };
const eq = (name, a, b) => ok(name + ' = ' + JSON.stringify(b), JSON.stringify(a) === JSON.stringify(b), 'thực tế: ' + JSON.stringify(a));
const datGio = (h, m = 0) => {
  const cur = ((Date.now() + 7 * 3600e3) % 864e5) / 60e3;
  let d = h * 60 + m - cur;
  if (d <= 0) d += 1440;
  advance(d * 60e3);
};

async function main() {
  datGio(9);
  const S = await boot(ROOT);
  await S.call('POST', '/setup', { token: 'setup-tok', name: 'Admin', phone: '0900000001', pin: '2468' });
  await S.login('Admin', '0900000001', '2468');
  const U = {};
  const ds = [['Phạm Văn Khoa', 'tieudoi'], ['Lò Văn Cơi', 'tieudoi'], ['Lê Anh Tuấn', 'tieudoi'], ['Lê Hải Nam', 'tieudoi'],
    ['Nguyễn Duy Dũng', 'cvktht'], ['Hà Huy Đạt', 'trungdoi'], ['Vũ Nhật Tài', 'daidoi']];
  let i = 2;
  for (const [name, role] of ds) {
    const phone = '09000000' + String(i++).padStart(2, '0');
    const r = await S.call('POST', '/users', { name, phone, role }, 'Admin');
    await S.login(name, phone, r.data.pin);
    await S.call('POST', '/change-pin', { pin: r.data.pin, newPin: '1357' }, name);
    U[name] = r.data.id;
  }
  const D = vnDay(), hom = vnDay(Date.now() - 864e5);
  const CV = 'Nguyễn Duy Dũng';

  /* ===== 1. Quyền ===== */
  for (const who of ['Phạm Văn Khoa']) {
    eq(who + ' (Tiểu đội trưởng) không mở được báo cáo ca', (await S.call('GET', '/baocao', undefined, who)).status, 403);
    eq(who + ' không lưu được báo cáo ca', (await S.call('PUT', '/baocao', { ngay: D, ca: 1, van_ban: 'x' }, who)).status, 403);
  }
  for (const who of [CV, 'Hà Huy Đạt', 'Vũ Nhật Tài', 'Admin']) eq(who + ' mở được báo cáo ca', (await S.call('GET', '/baocao', undefined, who)).status, 200);

  /* ===== 2. Dựng một ca giống mẫu ===== */
  const q = (who, body) => S.call('PUT', '/quanso', { ngay: D, ...body }, who);
  // Khoa: 21 người, ca ngày 1, nghỉ 2 (1 phép, 1 về quê) → 18 người làm ca đêm
  await q('Phạm Văn Khoa', { ca: 1, tong: 21, lam: 1, nghi: { phep: 1, que: 1 } });
  // Cơi: chia hai ca — ca ngày 8 (1 ốm), ca đêm 9 (1 việc gia đình), báo sớm ca đêm
  await q('Lò Văn Cơi', { ca: 1, tong: 19, lam: 8, nghi: { om: 1 } });
  await q('Lò Văn Cơi', { ca: 2, tong: 19, lam: 9, nghi: { gd: 1 } });
  // Cơi đặt lịch cả 2 ca; ĐÊM HÔM TRƯỚC tổ có 9 người làm, 1 nghỉ việc gia đình — báo cáo ca ngày phải lấy ca đêm này
  await S.call('PUT', '/quanso/lich', { ca: 3 }, 'Lò Văn Cơi');
  await S.call('PUT', '/quanso', { ngay: hom, ca: 2, user: U['Lò Văn Cơi'], tong: 19, lam: 9, nghi: { gd: 1 } }, CV);
  // Tuấn: làm ca đêm cố định (tự đặt lịch), hôm qua báo ca đêm, hôm nay chưa báo gì
  await S.call('PUT', '/quanso/lich', { ca: 2 }, 'Lê Anh Tuấn');
  await S.call('PUT', '/quanso', { ngay: hom, ca: 2, user: U['Lê Anh Tuấn'], tong: 20, lam: 20 }, CV);
  // Nam: chưa báo lần nào
  // gia công: một đơn đang làm 80%, một đơn xong trong ca, một đơn đang vướng, một đơn trễ hạn
  const mai = vnDay(Date.now() + 864e5);
  const giao = async (o) => (await S.call('POST', '/giacong', { cau_kien: 'Dầm', tang: '7', truc: 'X17-X20', user: U['Phạm Văn Khoa'], han: mai, ...o }, CV)).data.id;
  const d1 = await giao({ cau_kien: 'Dầm sàn chéo', tang: 't7-t8', truc: 'X17-X20' });
  const d2 = await giao({ cau_kien: 'Vách W1', tang: '', cote: '18.5-21.5m', truc: 'X27-X28 / 13' });
  const d3 = await giao({ cau_kien: 'Sàn', tang: '4', truc: '5-7' });
  const d4 = await giao({ cau_kien: 'Thang bộ TB12', tang: '2-3', truc: '13', han: D });
  ok('đã giao đủ 4 đơn', [d1, d2, d3, d4].every((x) => Number.isInteger(x)), [d1, d2, d3, d4].join(','));
  const lam = (id, v, b = {}) => S.call('POST', `/giacong/${id}/${v}`, b, 'Phạm Văn Khoa');
  for (const id of [d1, d2, d3, d4]) await lam(id, 'nhan');
  await lam(d1, 'tiendo', { pct: 80 }); await lam(d2, 'tiendo', { pct: 50 }); await lam(d4, 'tiendo', { pct: 30 });
  const vg = await lam(d2, 'vuong', { ly_do: 'D16 chưa về', loai: 'Thiếu thép' });
  ok('báo vướng được', vg.status === 200, JSON.stringify(vg.data));
  await lam(d3, 'xong');
  datGio(20);
  datGio(9);
  // sang ngày mới thì d4 (hạn hôm qua) trễ; báo cáo lấy ca ngày của hôm qua để có đủ số liệu
  const B = (await S.call('GET', `/baocao?ngay=${D}&ca=1`, undefined, CV)).data;
  eq('số liệu ca ngày: đúng ngày / ca, quân số hai ca của ngày', [B.ngay, B.ca, B.qs.length], [D, 1, 3]);
  eq('đơn xong trong giờ ca vào báo cáo, kèm đơn còn mở', B.don.map((d) => [d.id, d.tt]).sort(), [[d1, 'lam'], [d2, 'lam'], [d3, 'xong'], [d4, 'lam']].sort());
  eq('người chọn nhanh làm chỉ huy: Đại đội trưởng, Trung đội trưởng, CVKTHT', B.nguoi.map((u) => [u.name, u.role]), [['Hà Huy Đạt', 'trungdoi'], ['Nguyễn Duy Dũng', 'cvktht'], ['Vũ Nhật Tài', 'daidoi']]);
  /* Admin mang chức danh: người lập app là admin nhưng làm CVKTHT, phải hiện trong danh sách CBPT mà không mất quyền admin */
  const adminId = S.one("SELECT id FROM users WHERE name = 'Admin'").id;
  eq('không gắn chức danh cho tài khoản không phải admin', (await S.call('POST', `/users/${U[CV]}/chuc-danh`, { chuc_danh: 'daidoi' }, 'Admin')).status, 400);
  eq('chức danh lạ: từ chối', (await S.call('POST', `/users/${adminId}/chuc-danh`, { chuc_danh: 'tieudoi' }, 'Admin')).status, 400);
  eq('CVKTHT không gắn được chức danh (việc của admin)', (await S.call('POST', `/users/${adminId}/chuc-danh`, { chuc_danh: 'cvktht' }, CV)).status, 403);
  eq('admin đầu tiên tự gắn chức danh CVKTHT cho mình', (await S.call('POST', `/users/${adminId}/chuc-danh`, { chuc_danh: 'cvktht' }, 'Admin')).status, 200);
  const B2 = (await S.call('GET', `/baocao?ngay=${D}&ca=1`, undefined, 'Admin')).data;
  eq('admin gắn CVKTHT vào danh sách chọn CBPT', B2.nguoi.map((u) => [u.name, u.role]), [['Admin', 'cvktht'], ['Hà Huy Đạt', 'trungdoi'], ['Nguyễn Duy Dũng', 'cvktht'], ['Vũ Nhật Tài', 'daidoi']]);
  const me = (await S.call('GET', '/bootstrap', undefined, 'Admin')).data.user;
  eq('vẫn là admin, kèm chức danh', [me.role, me.chuc_danh], ['admin', 'cvktht']);
  eq('admin mang chức danh vẫn vào được quản lý tài khoản', (await S.call('GET', '/users', undefined, 'Admin')).status, 200);
  eq('bỏ chức danh', (await S.call('POST', `/users/${adminId}/chuc-danh`, { chuc_danh: null }, 'Admin')).status, 200);
  eq('bỏ chức danh thì không còn trong danh sách chọn', (await S.call('GET', `/baocao?ngay=${D}&ca=1`, undefined, 'Admin')).data.nguoi.some((u) => u.name === 'Admin'), false);
  eq('mẫu chưa có: phần đầu trống, năm dòng kiểm tra mặc định', [B.mau.dau.don_vi, B.mau.kt.length], ['', 5]);
  eq('ca đã qua vẫn soạn được (trong 7 ngày)', B.suaDuoc, true);

  /* ===== 3. Giao diện: ghép bản chữ ===== */
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
      if (!/^\/api\/(baocao|bootstrap|quanso)/.test(String(url))) return new Promise(() => {});
      const r = await S.call(o.method || 'GET', String(url).replace(/^\/api/, ''), o.body ? JSON.parse(o.body) : undefined, who);
      return { ok: r.status < 400, status: r.status, json: async () => r.data, headers: { get: () => null } };
    },
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(readFileSync(path.join(ROOT, 'public/app.js'), 'utf8'), ctx, { filename: 'app.js' });
  const R = (src) => vm.runInContext(src, ctx);
  const cho = async () => { for (let k = 0; k < 300; k++) { await new Promise((r) => setImmediate(r)); if (!R('S.busy') && k > 40) return; } };
  const bt = (await S.call('GET', '/bootstrap', undefined, CV)).data;
  R(`S.boot = ${JSON.stringify(bt)}; indexBoot(S.boot); S.me = ${JSON.stringify({ id: U[CV], name: CV, role: 'cvktht' })}; S.form = {}; S.screen = 'more';`);
  ok('Thêm của CVKTHT có mục Báo cáo ca', R('vMore()').includes('data-s="baocaoca"'));
  R(`S.bcCa = { ngay: '${D}', ca: 1 }; go('baocaoca')`); await cho();
  eq('mở màn báo cáo ca đúng ca đã chọn', [R('S.screen'), R('S.bcc.ngay'), R('S.bcc.ca')], ['baocaoca', D, 1]);
  ok('phần đầu còn trống thì mở sẵn để điền, có nút chọn nhanh chỉ huy', R('S.bcDauMo') && R('vBaoCaoCa()').includes('data-a="bcpick" data-k="ddt" data-v="Vũ Nhật Tài"'));
  R(`ACTIONS.bcpick({ k: 'ddt', v: 'Vũ Nhật Tài' }); ACTIONS.bcpick({ k: 'tdtr', v: 'Hà Huy Đạt' }); ACTIONS.bcpick({ k: 'cbpt', v: 'Nguyễn Duy Dũng' });
     Object.assign(S.bcDau, { don_vi: 'Trung đoàn XD 01, Tiểu Đoàn 1.1, Đại đội 1.1.6, Trung đội 1.1.6.1', du_an: 'Khu đô thị thể thao quốc tế OLYMPIC', khu_vuc: 'Bãi gia công trung đoàn' });`);
  const txt = R('bcTao()');
  const dd = D.split('-').reverse().join('/');
  const mong = [
    `BÁO CÁO QUÂN SỐ CA 1 Từ 6h30 đến 18h30 ngày ${dd}`,
    '• Trung đoàn XD 01, Tiểu Đoàn 1.1, Đại đội 1.1.6, Trung đội 1.1.6.1',
    '• Đại đội trưởng: Vũ Nhật Tài',
    '• Trung Đội trưởng: Hà Huy Đạt',
    '• CBPT: Nguyễn Duy Dũng',
    '• Dự Án: Khu đô thị thể thao quốc tế OLYMPIC',
    '• Khu vực thi công: Bãi gia công trung đoàn',
    '• Tổng số tổ: 4 tổ',
    '3. Quân số đi làm trong ca 1 là: 9 công nhân / (tổng quân số 60)',
    '• Tổ Lê Hải Nam: chưa báo quân số ca ngày',
    '• Tổ Lò Văn Cơi: ca ngày 8/19 cn, ca đêm 9/19 cn, nghỉ 2 cn — ca ngày: 1 ốm; ca đêm: 1 việc gia đình',
    '• Tổ Phạm Văn Khoa: ca ngày 1/21 cn, ca đêm 18/21 cn, nghỉ 2 cn — 1 nghỉ phép năm, 1 về quê',
    '• Tổ Lê Anh Tuấn (làm ca đêm)',
    '4. Nội dung công việc thực hiện trong ngày',
    '• Dầm sàn chéo tầng T7-t8 trục X17-X20: đang gia công 80%',
    '• Vách W1 cote 18.5-21.5m trục X27-X28 / 13: đang gia công 50%',
    '• Thang bộ TB12 tầng 2-3 trục 13: đang gia công 30%',
    '• Sàn tầng 4 trục 5-7: hoàn thành',
    '5. Tổng hợp MMTB:',
    '6. Kiểm tra, giám sát',
    '• Quản lý máy 3 ca: bố trí việc hợp lý, đúng; ký nhật trình đúng',
    '• Dọn dẹp cuối ca: tốt; các tổ dọn dẹp cuối giờ, có ảnh báo cáo',
    '• Thiết bị nâng hạ không giá kê: không có, đã kê kích đầy đủ',
    '• Kiểm soát vật tư: tránh làm hỏng vật tư, thất thoát, lãng phí',
    '• Hình ảnh văn hoá CBCNV (túm tụm, trốn việc, đồ bảo hộ sai quy cách): không có',
    '7. Các vướng mắc ảnh hưởng đến tiến độ thi công:',
    '• Vách W1 cote 18.5-21.5m trục X27-X28 / 13: Thiếu thép: D16 chưa về',
    '8. Đánh giá tiến độ',
    '• Nguy cơ chậm tiến độ: Không có',
  ];
  const thuc = txt.split('\n');
  mong.forEach((l, n) => { if (thuc[n] !== l) ok(`dòng ${n + 1} đúng mẫu`, false, `mong: ${l}\n    thực: ${thuc[n]}`); });
  eq('bản chữ đúng số dòng của mẫu', thuc.length, mong.length);
  eq('server gửi kèm ca đêm của ngày hôm trước, lịch ca và số thiết lập', [R('S.bcc.qsDemTruoc.length'), R(`S.bcc.lich[${U['Lò Văn Cơi']}].ca`), R(`S.bcc.lich[${U['Lê Anh Tuấn']}].ca`)], [2, 3, 2]);
  /* SỐ THIẾT LẬP: tổ chưa báo thì báo cáo lấy số CVKTHT đã đặt, viết y như dòng thường (không ghi chú gì thêm);
     màn soạn thì nói rõ tổ nào đang lấy số thiết lập. Chọn "Chỉ số thiết lập" thì tổ đã báo cũng lấy số thiết lập. */
  await S.call('PUT', '/quanso/thietlap', { user: U['Lê Hải Nam'], tong: 20, s1: 20, s2: 0, ts: 0 }, CV);
  await S.call('PUT', '/quanso/thietlap', { user: U['Phạm Văn Khoa'], tong: 21, s1: 3, s2: 18, ts: 0 }, CV);
  R(`S.bcc = null; go('baocaoca', true)`); await cho();
  R(`Object.assign(S.bcDau, { ddt: 'Vũ Nhật Tài', tdtr: 'Hà Huy Đạt', cbpt: 'Nguyễn Duy Dũng', don_vi: 'Trung đoàn XD 01, Tiểu Đoàn 1.1, Đại đội 1.1.6, Trung đội 1.1.6.1', du_an: 'Khu đô thị thể thao quốc tế OLYMPIC', khu_vuc: 'Bãi gia công trung đoàn' })`);
  const tl1 = R('bcTao()').split('\n');
  eq('tổ chưa báo lấy số thiết lập, viết như dòng thường; tổng cộng thêm tổ đó', [tl1.find((l) => l.includes('Hải Nam')), tl1.find((l) => l.startsWith('3. '))], ['• Tổ Lê Hải Nam: ca ngày 20/20 cn', '3. Quân số đi làm trong ca 1 là: 29 công nhân / (tổng quân số 80)']);
  ok('bản gửi không có chữ "thiết lập"; màn soạn thì nói rõ đang lấy số thiết lập cho tổ nào', !R('bcTao()').includes('thiết lập') && R('vBaoCaoCa()').includes('Đang lấy số thiết lập cho: Lê Hải Nam.'));
  ok('mục 3 có nút chọn nguồn: Theo tổ báo / Chỉ số thiết lập', R('vBaoCaoCa()').includes('data-a="bcnguon" data-v="to"') && R('vBaoCaoCa()').includes('data-a="bcnguon" data-v="tl"'));
  R(`ACTIONS.bcnguon({ v: 'tl' })`);
  const tl2 = R('bcTao()').split('\n');
  eq('chọn "Chỉ số thiết lập": tổ Khoa (2 ca) đã báo cũng lấy số thiết lập cho cả hai ca; tổ Cơi chưa có số thiết lập thì vẫn lấy số tổ báo', [tl2.find((l) => l.includes('Khoa')), tl2.find((l) => l.includes('Cơi'))],
    ['• Tổ Phạm Văn Khoa: ca ngày 3/21 cn, ca đêm 18/21 cn', '• Tổ Lò Văn Cơi: ca ngày 8/19 cn, ca đêm 9/19 cn, nghỉ 2 cn — ca ngày: 1 ốm; ca đêm: 1 việc gia đình']);
  R(`ACTIONS.bcnguon({ v: 'to' })`);
  // gỡ số thiết lập để các kiểm tra sau chạy trên số tổ báo như cũ
  S.raw.exec("UPDATE bc_mau SET data = json_remove(data, '$.tl') WHERE id = 1");
  R(`S.bcc = null; go('baocaoca', true)`); await cho();
  R(`Object.assign(S.bcDau, { ddt: 'Vũ Nhật Tài', tdtr: 'Hà Huy Đạt', cbpt: 'Nguyễn Duy Dũng', don_vi: 'Trung đoàn XD 01, Tiểu Đoàn 1.1, Đại đội 1.1.6, Trung đội 1.1.6.1', du_an: 'Khu đô thị thể thao quốc tế OLYMPIC', khu_vuc: 'Bãi gia công trung đoàn' })`);
  ok('tổ chưa báo được nêu tên ở đầu màn để nhắc', R('vBaoCaoCa()').includes('1 tổ chưa báo quân số ca ngày: Lê Hải Nam'));

  /* GÕ THẬT vào từng ô (sự kiện input qua bộ bắt sự kiện của app, như trên điện thoại): mục phải thành "đã sửa",
     bản sẽ gửi đổi ngay, và bản CHÉP đi mang đúng chữ vừa gõ. Trước đây gán thẳng S.bcM nên không bắt được lỗi
     điều kiện nhận ô bị hỏng: gõ vào mục 3–8 không có tác dụng gì, chép đi vẫn là chữ app tự ghép. */
  const go_ = (model, value) => (nghe.input || []).forEach((fn) => fn({ target: { dataset: { model }, value, id: model } }));
  for (const k of ['s3', 's4', 's5', 's6', 's7', 's8']) {
    const moi = 'Dòng thử ' + k + ' do người soạn gõ';
    go_('bc_' + k, moi);
    ok('gõ vào mục ' + k + ': mục thành đã sửa, bản sẽ gửi đổi ngay', R('S.bcM.' + k) === moi && prev.textContent.includes(moi) && prev.textContent === R('bcTao()'), prev.textContent.slice(0, 120));
    R(`delete S.bcM.${k}`);
  }
  go_('bcd_du_an', 'Dự án gõ tay');
  ok('gõ vào ô phần đầu: bản sẽ gửi đổi ngay', prev.textContent.includes('• Dự Án: Dự án gõ tay'));
  go_('bcd_du_an', 'Khu đô thị thể thao quốc tế OLYMPIC');
  go_('bc_s7', 'Chờ bản vẽ trục X14');
  R('ACTIONS.bcchep()'); await cho();
  ok('chép sau khi gõ: bản chép đi và bản lưu có đúng chữ vừa gõ', String(chep).includes('7. Các vướng mắc ảnh hưởng đến tiến độ thi công:\n• Chờ bản vẽ trục X14') && S.one('SELECT van_ban FROM bao_cao_ca WHERE ngay = ? AND ca = 1', D).van_ban === chep, String(chep).split('\n').slice(-4).join(' | '));
  R("delete S.bcM.s7");

  // sửa tay: mục 5 máy móc, mục 4 thêm một dòng; số liệu đổi sau đó thì mục đã sửa giữ nguyên
  R(`S.bcM.s5 = '7 – 3 Kato TMC 0221, TMC 0235, TMC 0280 – 4 cẩu thùng TXC 0443, TXC 0209, TXC 0259, TXC 0003'`);
  R(`S.bcM.s4 = bcGet('s4') + '\\n• LK11, LK12 (thấp tầng): hoàn thành'`);
  ok('dòng tự gõ "• " không bị thành hai gạch đầu dòng', R('bcTao()').includes('\n• LK11, LK12 (thấp tầng): hoàn thành') && !R('bcTao()').includes('• •'));
  ok('mục 5 ra một dòng sau "Tổng hợp MMTB:"', R('bcTao()').includes('5. Tổng hợp MMTB: 7 – 3 Kato TMC 0221'));
  ok('mục đã sửa có nút lấy lại từ app', R('vBaoCaoCa()').includes('data-a="bclay" data-k="s4"'));
  // chép
  R('ACTIONS.bcchep()'); await cho();
  ok('bấm CHÉP: chữ vào bộ nhớ tạm đúng bản đang xem', chep === R('bcTao()'), String(chep).slice(0, 80));
  const row = S.one('SELECT data, van_ban, by_id FROM bao_cao_ca WHERE ngay = ? AND ca = 1', D);
  eq('và lưu báo cáo của ca, người lưu là CVKTHT', [row && row.van_ban === chep, row && row.by_id], [true, U[CV]]);
  const mau = JSON.parse(S.one('SELECT data FROM bc_mau WHERE id = 1').data);
  eq('phần đầu và máy móc thành mẫu', [mau.dau.ddt, mau.dau.du_an, mau.mmtb.slice(0, 12)], ['Vũ Nhật Tài', 'Khu đô thị thể thao quốc tế OLYMPIC', '7 – 3 Kato T']);
  eq('nhật ký ghi lần chép', JSON.parse(S.one("SELECT detail FROM audit WHERE action = 'bc_luu'").detail), { ngay: D, ca: 1 });

  // mở lại ca đó: mục đã sửa còn nguyên; ca khác: phần đầu và máy móc điền sẵn theo mẫu
  R(`S.bcc = null; S.bcM = {}; go('baocaoca', true)`); await cho();
  ok('mở lại ca đã chép: mục 4 giữ dòng tự gõ, có dòng "đã chép lúc"', R('bcTao()').includes('LK11, LK12') && R('vBaoCaoCa()').includes('Đã chép lúc'));
  R(`ACTIONS.bclay({ k: 's4' })`);
  ok('lấy lại từ app: mục 4 về số của app', !R('bcTao()').includes('LK11'));
  R(`ACTIONS.bcca({ v: '${D}:2' })`); await cho();
  eq('sang ca đêm: phần đầu và máy móc điền sẵn từ mẫu, phần đầu thu gọn', [R('S.bcc.ca'), R('S.bcDau.ddt'), R("bcGet('s5').slice(0, 7)"), R('S.bcDauMo')], [2, 'Vũ Nhật Tài', '7 – 3 K', false]);
  const dem = R('bcTao()').split('\n');
  eq('ca đêm: tiêu đề và quân số theo ca đêm', [dem[0], dem.find((l) => l.startsWith('3. '))], [`BÁO CÁO QUÂN SỐ CA 2 Từ 18h30 đến 6h30 ngày ${dd}`, '3. Quân số đi làm trong ca 2 là: 9 công nhân / (tổng quân số 60)']);
  ok('ca đêm: tổ chia ca chưa báo ca đêm thì ghi chưa báo (không cộng số dự kiến), tổ chia ca đã báo thì có cả hai ca', dem.includes('• Tổ Phạm Văn Khoa: chưa báo quân số ca đêm') && dem.includes('• Tổ Lê Anh Tuấn: chưa báo quân số ca đêm') && dem.includes('• Tổ Lò Văn Cơi: ca đêm 9/19 cn, ca ngày 8/19 cn, nghỉ 2 cn — ca đêm: 1 việc gia đình; ca ngày: 1 ốm'), dem.filter((l) => /Khoa|Tuấn/.test(l)).join(' | '));
  ok('ca đêm: đơn trễ hạn (hạn hôm nay, ca đêm) vào mục 8', dem.some((l) => l === '• Nguy cơ chậm tiến độ: 1 đơn trễ hạn') && dem.some((l) => l.startsWith('• Thang bộ TB12')), dem.slice(-3).join(' | '));
  // dòng kiểm tra: sửa một ca không thành mẫu, trừ khi bấm đặt làm mẫu
  R(`S.bcM.s6 = 'Dọn dẹp cuối ca: tổ Nam chưa dọn'; ACTIONS.bcchep()`); await cho();
  eq('sửa dòng kiểm tra rồi chép: mẫu kiểm tra KHÔNG đổi', JSON.parse(S.one('SELECT data FROM bc_mau WHERE id = 1').data).kt.length, 5);
  R(`S.bcM.s6 = 'Quản lý máy: tốt\\nDọn dẹp: tốt'; ACTIONS.bcktmau()`); await cho();
  eq('bấm đặt làm mẫu: mẫu kiểm tra thành hai dòng mới', JSON.parse(S.one('SELECT data FROM bc_mau WHERE id = 1').data).kt, ['Quản lý máy: tốt', 'Dọn dẹp: tốt']);

  // nháp trên máy: gõ dở rồi thoát, mở lại vẫn còn
  R(`S.bcM.s7 = 'Chờ bản vẽ sửa trục X14'; bcNhap(); S.bcc = null; S.bcM = {}; go('baocaoca', true)`); await cho();
  eq('gõ dở rồi thoát: mở lại vẫn còn chữ đang gõ (nháp trên máy)', R("bcGet('s7')"), 'Chờ bản vẽ sửa trục X14');

  /* ===== 4. Lưu: kiểm dữ liệu ===== */
  eq('báo cáo trống: từ chối', (await S.call('PUT', '/baocao', { ngay: D, ca: 1, van_ban: '  ' }, CV)).status, 400);
  eq('ca lạ: từ chối', (await S.call('PUT', '/baocao', { ngay: D, ca: 3, van_ban: 'x' }, CV)).status, 400);
  eq('quá 7 ngày: từ chối', (await S.call('PUT', '/baocao', { ngay: vnDay(Date.now() - 9 * 864e5), ca: 1, van_ban: 'x' }, CV)).status, 400);
  eq('ca chưa tới (ngày kia): từ chối', (await S.call('GET', `/baocao?ngay=${vnDay(Date.now() + 2 * 864e5)}&ca=1`, undefined, CV)).status, 400);

  /* ===== 5. Sao lưu / nạp lại ===== */
  {
    const bk = await S.call('GET', '/backup', undefined, 'Admin');
    eq('bản sao có báo cáo ca và mẫu', [bk.data.bang.bao_cao_ca.length, bk.data.bang.bc_mau.length], [2, 1]);
    const cu = { ...bk.data, bang: { ...bk.data.bang } };
    delete cu.bang.bao_cao_ca; delete cu.bang.bc_mau;
    eq('nạp bản sao chưa có hai bảng này', (await S.call('POST', '/restore', { confirm: 'NAP LAI', file: cu }, 'Admin')).status, 200);
    eq('thì báo cáo và mẫu đang có được giữ', [S.one('SELECT COUNT(*) n FROM bao_cao_ca').n, S.one('SELECT COUNT(*) n FROM bc_mau').n], [2, 1]);
  }

  const fail = T.filter((x) => x[0] === 'FAIL');
  console.log(T.map((x) => x[0] + ' | ' + x[1] + (x[2] && x[0] === 'FAIL' ? '  [' + x[2] + ']' : '')).join('\n'));
  console.log('\n=== ' + T.length + ' kiểm tra, ' + fail.length + ' lỗi ===');
  process.exit(fail.length ? 1 : 0);
}
main().catch((e) => { console.error('CRASH', e); process.exit(2); });
