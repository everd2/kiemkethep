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
  ok('phần đầu còn trống thì mở sẵn để điền; chỉ huy chọn bằng nút, ô gõ tay chỉ khi bấm Khác; phần thiếu báo ngay trên tiêu đề phần đó (không có thẻ "còn thiếu" riêng)', R("S.bcMo === 'dau'") && R('vBaoCaoCa()').includes('data-a="bcpick" data-k="ddt" data-v="Vũ Nhật Tài"')
    && R('vBaoCaoCa()').includes('data-a="bckhac" data-k="ddt"') && !R('vBaoCaoCa()').includes('id="bcd_ddt"') && R('vBaoCaoCa()').includes('6 ô trống') && R('vBaoCaoCa()').includes('chưa có, bấm sửa để điền') && !R('vBaoCaoCa()').includes('Còn thiếu'));
  R(`ACTIONS.bckhac({ k: 'ddt' })`);
  ok('bấm Khác: hiện ô gõ tên chỉ huy ngoài danh sách; chọn lại nút tên thì ô đóng', R('vBaoCaoCa()').includes('id="bcd_ddt"') && !R(`ACTIONS.bcpick({ k: 'ddt', v: 'Vũ Nhật Tài' }); vBaoCaoCa()`).includes('id="bcd_ddt"') && R("S.bcDau.ddt") === 'Vũ Nhật Tài');
  R(`S.bcDau.ddt = ''; bcNhap()`);
  ok('mỗi phần có nút chép riêng và nút sửa nhỏ, một nút chép cả báo cáo; chỉ phần đang mở mới có ô sửa; không còn thanh nút to ở đáy', (R('vBaoCaoCa()').match(/data-a="bcchep" data-k="/g) || []).length === 7 && (R('vBaoCaoCa()').match(/data-a="bcchep">/g) || []).length === 1
    && (R('vBaoCaoCa()').match(/data-a="bcsua"/g) || []).length === 7 && !R('vBaoCaoCa()').includes('<textarea') && !R('vBaoCaoCa()').includes('sendbar') && !R('vBaoCaoCa()').includes('bcchiase'));
  // bộ test chạy theo giờ thật: ca nào bấm được tuỳ ca kế tiếp (S.bcc.ke) lúc chạy
  const keK = R('S.bcc.ke.ngay') + ':' + R('S.bcc.ke.ca'), maiK = vnDay(Date.parse(D) + 864e5) + ':1';
  ok('chọn ca ngay trên màn: lùi ngày, đổi ca cùng ngày; ca chưa tới (sau ca kế tiếp) thì khoá', R('vBaoCaoCa()').includes(`data-a="bcca" data-v="${vnDay(Date.parse(D) - 864e5)}:1"`)
    && R('vBaoCaoCa()').includes(`data-a="bcca" data-v="${D}:2"`) === (D + ':2' <= keK) && R('vBaoCaoCa()').includes(`data-a="bcca" data-v="${maiK}"`) === (maiK <= keK) && !R('vBaoCaoCa()').includes(`data-v="${vnDay(Date.parse(D) + 864e5)}:2"`), keK);
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
  ok('bản gửi không có chữ "thiết lập"; màn soạn nói rõ tổ nào đang lấy số thiết lập (nhãn trên dòng của tổ ở mục 3)', !R('bcTao()').includes('thiết lập') && /Tổ Lê Hải Nam: ca ngày 20\/20 cn<\/span><span class="badge (warn|bad)"[^>]*>Chưa báo · số thiết lập</.test(R('vBaoCaoCa()')));
  R("ACTIONS.bcsua({ k: 's3' })");
  ok('mở mục 3: có ô sửa và nút chọn nguồn Theo tổ báo / Chỉ số thiết lập; các mục khác vẫn đóng', R('vBaoCaoCa()').includes('data-a="bcnguon" data-v="to"') && R('vBaoCaoCa()').includes('data-a="bcnguon" data-v="tl"') && (R('vBaoCaoCa()').match(/<textarea/g) || []).length === 1 && R('vBaoCaoCa()').includes('id="bc_s3"'));
  R(`ACTIONS.bcnguon({ v: 'tl' })`);
  const tl2 = R('bcTao()').split('\n');
  eq('chọn "Chỉ số thiết lập": tổ Khoa (2 ca) đã báo cũng lấy số thiết lập cho cả hai ca; tổ Cơi chưa có số thiết lập thì vẫn lấy số tổ báo', [tl2.find((l) => l.includes('Khoa')), tl2.find((l) => l.includes('Cơi'))],
    ['• Tổ Phạm Văn Khoa: ca ngày 3/21 cn, ca đêm 18/21 cn', '• Tổ Lò Văn Cơi: ca ngày 8/19 cn, ca đêm 9/19 cn, nghỉ 2 cn — ca ngày: 1 ốm; ca đêm: 1 việc gia đình']);
  ok('chọn "Chỉ số thiết lập": tổng quân số cũng theo số thiết lập, các số tổng hợp cộng đúng bằng tổng', R('(() => { const Q = bcQuanSo(S.bcc); return Q.tong === Q.lam + Q.nghi + Q.kiaSo + Q.chuaSo; })()'));
  R(`ACTIONS.bcnguon({ v: 'to' })`);
  /* số thiết lập KHÁC số tổ đã báo (Khoa báo tổng 21, CVKTHT đặt 23): theo tổ báo thì tổng giữ số tổ báo; chọn "Chỉ số
     thiết lập" thì tổng quân số cũng đổi theo số thiết lập, không chỉ dòng của tổ. Trước đây tổng vẫn lấy số tổ báo. */
  {
    const tong = () => R('bcQuanSo(S.bcc).tong'), truoc = tong();
    await S.call('PUT', '/quanso/thietlap', { user: U['Phạm Văn Khoa'], tong: 23, s1: 3, s2: 18, ts: R(`S.bcc.tl[${U['Phạm Văn Khoa']}].ts`) }, CV);
    R(`S.bcc = null; go('baocaoca', true)`); await cho();
    const theoTo = tong();
    R(`ACTIONS.bcnguon({ v: 'tl' })`);
    eq('số thiết lập khác số tổ báo: theo tổ báo giữ tổng, chỉ số thiết lập thì tổng đổi theo', [theoTo - truoc, tong() - truoc, R('(() => { const Q = bcQuanSo(S.bcc); return Q.tong === Q.lam + Q.nghi + Q.kiaSo + Q.chuaSo; })()')], [0, 2, true]);
    R(`ACTIONS.bcnguon({ v: 'to' })`);
  }
  // gỡ số thiết lập để các kiểm tra sau chạy trên số tổ báo như cũ
  S.raw.exec("UPDATE bc_mau SET data = json_remove(data, '$.tl') WHERE id = 1");
  R(`S.bcc = null; go('baocaoca', true)`); await cho();
  R(`Object.assign(S.bcDau, { ddt: 'Vũ Nhật Tài', tdtr: 'Hà Huy Đạt', cbpt: 'Nguyễn Duy Dũng', don_vi: 'Trung đoàn XD 01, Tiểu Đoàn 1.1, Đại đội 1.1.6, Trung đội 1.1.6.1', du_an: 'Khu đô thị thể thao quốc tế OLYMPIC', khu_vuc: 'Bãi gia công trung đoàn' })`);
  ok('tổ chưa báo: thanh trên đếm số tổ, tên tổ chỉ nêu MỘT lần (dòng của tổ ở mục 3, kèm nhãn)', /(Chưa báo|Quá hạn): 1 tổ · Tổ đã báo \d+\/\d+</.test(R('vBaoCaoCa()')) && (R('vBaoCaoCa()').match(/Lê Hải Nam/g) || []).length === 1 && /Tổ Lê Hải Nam: chưa báo quân số ca ngày<\/span><span class="badge (warn|bad)"/.test(R('vBaoCaoCa()')));

  /* GÕ THẬT vào từng ô (sự kiện input qua bộ bắt sự kiện của app, như trên điện thoại): mục phải thành "đã sửa",
     bản sẽ gửi đổi ngay, và bản CHÉP đi mang đúng chữ vừa gõ. Trước đây gán thẳng S.bcM nên không bắt được lỗi
     điều kiện nhận ô bị hỏng: gõ vào mục 3–8 không có tác dụng gì, chép đi vẫn là chữ app tự ghép. */
  const go_ = (model, value) => (nghe.input || []).forEach((fn) => fn({ target: { dataset: { model }, value, id: model } }));
  for (const k of ['s3', 's4', 's5', 's6', 's7', 's8']) {
    const moi = 'Dòng thử ' + k + ' do người soạn gõ';
    go_('bc_' + k, moi);
    ok('gõ vào mục ' + k + ': mục thành đã sửa, bản sẽ gửi đổi ngay', R('S.bcM.' + k) === moi && R('bcTao()').includes(moi) && R(`bcPhan().${k}.join(' ')`).includes(moi), R('bcTao()').slice(0, 120));
    R(`delete S.bcM.${k}`);
  }
  go_('bcd_du_an', 'Dự án gõ tay');
  ok('gõ vào ô phần đầu: bản sẽ gửi đổi ngay', R('bcTao()').includes('• Dự Án: Dự án gõ tay'));
  go_('bcd_du_an', 'Khu đô thị thể thao quốc tế OLYMPIC');
  go_('bc_s7', 'Chờ bản vẽ trục X14');
  R('ACTIONS.bcchep()'); await cho();
  ok('chép sau khi gõ: bản chép đi và bản lưu có đúng chữ vừa gõ', String(chep).includes('7. Các vướng mắc ảnh hưởng đến tiến độ thi công:\n• Chờ bản vẽ trục X14') && S.one('SELECT van_ban FROM bao_cao_ca WHERE ngay = ? AND ca = 1', D).van_ban === chep, String(chep).split('\n').slice(-4).join(' | '));
  // chép RIÊNG một phần: bộ nhớ tạm chỉ có phần đó (đúng chữ sẽ gửi), báo cáo của ca vẫn lưu đủ cả bản
  R("ACTIONS.bcchep({ k: 's7' })"); await cho();
  eq('chép riêng mục 7: chỉ chép mục đó, bản lưu vẫn là cả báo cáo', [chep, S.one('SELECT van_ban FROM bao_cao_ca WHERE ngay = ? AND ca = 1', D).van_ban === R('bcTao()')], ['7. Các vướng mắc ảnh hưởng đến tiến độ thi công:\n• Chờ bản vẽ trục X14', true]);
  R("ACTIONS.bcchep({ k: 'dau' })"); await cho();
  ok('chép riêng phần đầu: từ dòng tiêu đề tới dòng tổng số tổ', String(chep).startsWith('BÁO CÁO QUÂN SỐ CA 1 ') && String(chep).endsWith('• Tổng số tổ: 4 tổ') && !String(chep).includes('3. '), String(chep).slice(-60));
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
  // bước 3 nói rõ bản đang hiện đã chép chưa: nội dung đổi sau lần chép thì cấp trên đang có bản cũ, phải chép lại
  ok('đã chép đúng bản đang hiện: bước 3 thành "Đã chép"; sửa thêm thì thành "Chép lại" và nói rõ nội dung đã đổi', R('vBaoCaoCa()').includes('Đã chép</button>') && !R('vBaoCaoCa()').includes('Nội dung đã đổi')
    && R(`S.bcM.s7 = 'Thêm một vướng mắc'; vBaoCaoCa()`).includes('Chép lại</button>') && R('vBaoCaoCa()').includes('Nội dung đã đổi sau lần chép'));
  R('delete S.bcM.s7');
  ok('các số tổng hợp cộng lại đúng bằng tổng quân số (ca ngày)', R('(() => { const Q = bcQuanSo(S.bcc); return Q.tong > 0 && Q.tong === Q.lam + Q.nghi + Q.kiaSo + Q.chuaSo; })()'), R('JSON.stringify((({ tong, lam, nghi, kiaSo, chuaSo }) => ({ tong, lam, nghi, kiaSo, chuaSo }))(bcQuanSo(S.bcc)))'));
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
  eq('sang ca đêm: phần đầu và máy móc điền sẵn từ mẫu, không mục nào mở, không còn dòng "còn thiếu"', [R('S.bcc.ca'), R('S.bcDau.ddt'), R("bcGet('s5').slice(0, 7)"), R('S.bcMo'), R('vBaoCaoCa()').includes('Còn thiếu')], [2, 'Vũ Nhật Tài', '7 – 3 K', null, false]);
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

  /* Đầu màn có bảng tổng hợp quân số mọi tổ và nút thiết lập: mở thẳng bảng thiết lập (ca, số quân từng tổ, có dòng
     tổng), nút quay lại ở đó về đúng báo cáo của ca đang soạn chứ không nhảy về ca đang diễn ra. */
  ok('không còn khối bước 1 riêng: số tổ đã báo ở thanh trên, nút thiết lập ở mục 3; không còn dải 3 bước', /Tổ đã báo \d+\/\d+</.test(R('vBaoCaoCa()')) && /id="bcb3"[\s\S]*?data-a="bctl"/.test(R('vBaoCaoCa()')) && !R('vBaoCaoCa()').includes('1 · Tổ báo') && !R('vBaoCaoCa()').includes('2 · Soát') && !R('vBaoCaoCa()').includes('eq eq5') && !R('vBaoCaoCa()').includes('data-a="bctomo"'));
  ok('các số tổng hợp cộng lại đúng bằng tổng quân số', R('(() => { const Q = bcQuanSo(S.bcc); return Q.tong > 0 && Q.tong === Q.lam + Q.nghi + Q.kiaSo + Q.chuaSo; })()'), R('JSON.stringify((({ tong, lam, nghi, kiaSo, chuaSo }) => ({ tong, lam, nghi, kiaSo, chuaSo }))(bcQuanSo(S.bcc)))'));
  R('ACTIONS.bctl()'); await cho();
  const tlMan = R('vQuanSo()');
  ok('nút thiết lập mở bảng thiết lập, có dòng tổng mọi tổ, nút quay lại về báo cáo ca', R('S.screen') === 'quanso' && tlMan.includes('data-a="qstlluu"') && tlMan.includes('id="tlS_t"') && tlMan.includes('data-a="nav" data-s="baocaoca"'), R('S.screen'));
  go_(`tl_${U['Lê Hải Nam']}_t`, '25');
  eq('dòng tổng của bảng thiết lập tính theo số đang gõ', R('qsTlTong().tong') >= 25, true);
  R(`delete S.form['tl_${U['Lê Hải Nam']}_t']; ACTIONS.nav({ s: 'baocaoca' })`); await cho();
  eq('quay lại: vẫn là báo cáo của ca đang soạn', [R('S.screen'), R('S.bcc.ngay'), R('S.bcc.ca')], ['baocaoca', D, 2]);

  /* ===== 3b. Một bản dùng chung, nhiều người soạn =====
     Báo cáo của ca và mẫu là một bản cho mọi người; mỗi máy chỉ giữ riêng phần sửa chưa chép. */
  {
    const lay = async (w = CV) => (await S.call('GET', `/baocao?ngay=${D}&ca=2`, undefined, w)).data;
    const rev = () => S.one("SELECT value FROM meta WHERE key = 'rev'").value;
    R(`ACTIONS.bcbo()`);
    eq('bỏ phần sửa chưa chép: về bản chung, nháp trên máy xoá', [R("typeof S.bcM.s7"), R('bcCoKhac(bcKhac())'), Object.keys(store).some((k) => k === `kt:bc:${D}:2`)], ['undefined', false, false]);
    R(`ACTIONS.bcnguon({ v: 'tl' })`);
    ok('phần sửa chưa chép được nói rõ trên màn, kèm nút bỏ', R('vBaoCaoCa()').includes('sửa chưa chép</b>') && R('vBaoCaoCa()').includes('data-a="bcbo"'));
    const r0 = rev();
    R('ACTIONS.bcchep()'); await cho();
    const b1 = await lay('Admin');
    eq('nguồn quân số lưu kèm báo cáo: người khác mở ra cùng một nguồn; lưu thì tăng rev để máy khác tải lại', [b1.bao.nguon, rev() > r0, R('bcCoKhac(bcKhac())')], ['tl', true, false]);
    const r1 = rev();
    R('ACTIONS.bcchep()'); await cho();
    eq('chép lại đúng bản đang lưu: không ghi gì, rev và giờ lưu giữ nguyên', [rev(), (await lay()).bao.ts], [r1, b1.bao.ts]);
    // Admin (máy khác) chép ca này với mục 8 sửa tay và đổi tên dự án, trong lúc CVKTHT đang sửa dở mục 7
    R(`S.bcM.s7 = 'Chờ cẩu'; bcNhap()`);
    const p = await S.call('PUT', '/baocao', { ngay: D, ca: 2, ts: b1.bao.ts, van_ban: 'bản của Admin', muc: { ...b1.bao.muc, s8: 'Tiến độ: đạt' }, dau: { du_an: 'Dự án mới' }, nguon: 'tl' }, 'Admin');
    const b2 = await lay();
    eq('người khác lưu: chỉ ô phần đầu đã gửi đổi, các ô khác giữ theo mẫu', [p.status, b2.mau.dau.du_an, b2.mau.dau.ddt, b2.bao.by_name], [200, 'Dự án mới', 'Vũ Nhật Tài', 'Admin']);
    const cu = await S.call('PUT', '/baocao', { ngay: D, ca: 2, ts: b1.bao.ts, van_ban: 'bản dựa trên bản cũ', muc: {} }, CV);
    eq('lưu dựa trên bản cũ: từ chối, nói rõ ai vừa chép', [cu.status, cu.data.code, String(cu.data.error).startsWith('Admin vừa chép báo cáo ca này')], [409, 'changed', true]);
    R('ACTIONS.bcchep()'); await cho();
    eq('máy đang sửa dở bấm chép: bị từ chối, tải bản mới về và ghép — mục 8 và dự án theo người kia, mục 7 đang sửa vẫn giữ',
      [(await lay()).bao.by_name, R('S.bcM.s8'), R('S.bcDau.du_an'), R('S.bcM.s7'), R('S.toastErr')], ['Admin', 'Tiến độ: đạt', 'Dự án mới', 'Chờ cẩu', true]);
    R('ACTIONS.bcchep()'); await cho();
    const b3 = await lay();
    eq('soát rồi chép lại: lưu được, bản chung có cả hai phần sửa, mẫu không bị đè lại', [b3.bao.by_name, b3.bao.muc.s7, b3.bao.muc.s8, b3.mau.dau.du_an], [CV, 'Chờ cẩu', 'Tiến độ: đạt', 'Dự án mới']);
    // trả mẫu và mục 7 về như trước để các kiểm tra sau không lệch
    await S.call('PUT', '/baocao', { ngay: D, ca: 2, ts: b3.bao.ts, van_ban: b3.bao.van_ban, muc: { ...b3.bao.muc, s7: 'Chờ bản vẽ sửa trục X14' }, dau: { du_an: 'Khu đô thị thể thao quốc tế OLYMPIC' }, nguon: 'to' }, CV);
    R(`S.bcc = null; go('baocaoca', true)`); await cho();
  }

  /* ===== 3c. Người nghỉ theo lý do trong số thiết lập =====
     Tổ không báo kịp thì CVKTHT ghi luôn ai nghỉ, vì sao: báo cáo ca phải có số nghỉ kèm lý do như tổ tự báo. */
  {
    const nam = U['Lê Hải Nam'], tlap = (b) => S.call('PUT', '/quanso/thietlap', { user: nam, ...b }, CV);
    const tl = () => JSON.parse(S.one('SELECT data FROM bc_mau WHERE id = 1').data).tl[nam];
    eq('nghỉ nhiều hơn số người của ca: từ chối', (await tlap({ tong: 20, s1: 3, s2: 0, n1: { om: 4 }, ts: 0 })).status, 400);
    eq('lý do lạ: từ chối', (await tlap({ tong: 20, s1: 20, s2: 0, n1: { choi: 1 }, ts: 0 })).status, 400);
    eq('lý do khác mà không ghi rõ: từ chối', (await tlap({ tong: 20, s1: 20, s2: 0, n1: { khac: 1 }, ts: 0 })).status, 400);
    eq('đặt số thiết lập kèm người nghỉ theo lý do', [(await tlap({ tong: 20, s1: 20, s2: 0, n1: { om: 2, que: 1, khac: 1 }, gc1: 'đi khám nghĩa vụ', ts: 0 })).status, tl().n1, tl().gc1, tl().n2], [200, { om: 2, que: 1, khac: 1 }, 'đi khám nghĩa vụ', undefined]);
    eq('bản app cũ lưu không gửi người nghỉ: giữ người nghỉ đang có', [(await tlap({ tong: 21, s1: 21, s2: 0, ts: tl().ts })).status, tl().tong, tl().n1], [200, 21, { om: 2, que: 1, khac: 1 }]);
    await tlap({ tong: 20, s1: 20, s2: 0, n1: { om: 2, que: 1, khac: 1 }, gc1: 'đi khám nghĩa vụ', ts: tl().ts });
    R(`S.bcCa = { ngay: '${D}', ca: 1 }; S.bcc = null; go('baocaoca', true)`); await cho();
    const s3 = R("bcAuto(S.bcc, 's3')").split('\n');
    eq('báo cáo của tổ chưa báo: đi làm = số người ca − nghỉ, có số nghỉ và lý do từng người', s3.find((l) => l.includes('Hải Nam')), 'Tổ Lê Hải Nam: ca ngày 16/20 cn, nghỉ 4 cn — 2 ốm, 1 về quê, 1 đi khám nghĩa vụ');
    ok('các số tổng hợp vẫn cộng đúng bằng tổng quân số', R('(() => { const Q = bcQuanSo(S.bcc); return Q.tong === Q.lam + Q.nghi + Q.kiaSo + Q.chuaSo; })()'));
    ok('mục 3 có dòng đủ người nghỉ của tổ đang lấy số thiết lập, kèm nhãn', /Tổ Lê Hải Nam: ca ngày 16\/20 cn, nghỉ 4 cn — 2 ốm, 1 về quê, 1 đi khám nghĩa vụ<\/span><span class="badge (warn|bad)"/.test(R('vBaoCaoCa()')));
    // bảng thiết lập: dòng người nghỉ dưới mỗi tổ, mở ra ghi theo lý do, Lưu tất cả gửi kèm
    R('ACTIONS.bctl()'); await cho();
    ok('bảng thiết lập có dòng người nghỉ của từng tổ', R('vQuanSo()').includes('Nghỉ: 4 (2 ốm, 1 về quê, 1 đi khám nghĩa vụ)') && R('vQuanSo()').includes(`data-a="tlnghimo" data-id="${nam}"`));
    R(`ACTIONS.tlnghimo({ id: '${nam}' }); ACTIONS.tlnghi({ id: '${nam}', ca: '1', k: 'phep' }); ACTIONS.tlnghi({ id: '${nam}', ca: '1', k: 'phep' })`);
    ok('mở ô ghi: chạm lý do là thêm 1 người, có ô số bên cạnh', R('vQuanSo()').includes(`id="tl_${nam}_n1_phep"`) && R('vQuanSo()').includes('value="2"'));
    R('ACTIONS.qstlluu()'); await cho();
    eq('Lưu tất cả: người nghỉ vào số thiết lập', tl().n1, { om: 2, phep: 2, que: 1, khac: 1 });
    /* ĐỔI CA của tổ một ca, chỉ chọn lại ô ca, không gõ số: cả tổ sang ca mới. Trước đây ô của ca mới lấy số đã lưu (0),
       Lưu tất cả là tổ thành 0 người — báo cáo ghi "0/20 cn", hết ca chép thành thiếu số. */
    const chonCa = (v) => (nghe.change || []).forEach((fn) => fn({ target: { dataset: { model: `tl_${nam}_c`, change: 'tlca' }, value: String(v) } }));
    const lich = () => JSON.parse(S.one('SELECT data FROM bc_mau WHERE id = 1').data).lich[nam];
    chonCa(2); R('ACTIONS.qstlluu()'); await cho();
    eq('đổi ca ngày → ca đêm, không gõ số: cả tổ sang ca đêm', [lich().ca, tl().s1, tl().s2, tl().n1], [2, 0, 20, undefined]);
    chonCa(1); R(`S.form['tl_${nam}_t'] = '22'`); R('ACTIONS.qstlluu()'); await cho();
    eq('đổi lại ca ngày kèm gõ tổng mới: ca ngày theo tổng mới', [lich().ca, tl().tong, tl().s1, tl().s2], [1, 22, 22, 0]);
    R(`S.bcCa = { ngay: '${D}', ca: 1 }; S.bcc = null; go('baocaoca', true)`); await cho();
    eq('báo cáo ca theo số sau khi đổi ca', R("bcAuto(S.bcc, 's3')").split('\n').find((l) => l.includes('Hải Nam')), 'Tổ Lê Hải Nam: ca ngày 22/22 cn');
    S.raw.exec("UPDATE bc_mau SET data = json_remove(data, '$.tl') WHERE id = 1");
  }

  /* ===== 3d. Mục 4 soạn theo dòng =====
     Chạm −10 / +10 / Xong / × trên từng đơn, thêm việc ngoài app bằng chạm; chỉnh chỉ vào báo cáo, không đổi đơn gia
     công; việc ngoài app chưa xong tự mang sang ca sau. */
  {
    R(`S.bcCa = { ngay: '${D}', ca: 2 }; S.bcc = null; go('baocaoca', true)`); await cho();
    R("ACTIONS.bcsua({ k: 's4' })");
    ok('mở mục 4: soạn theo dòng (nút −10 / +10 / Xong / ×), không phải ô chữ', R('vBaoCaoCa()').includes(`data-a="bcvpct" data-k="d${d1}" data-v="10"`) && R('vBaoCaoCa()').includes(`data-a="bcvxong" data-k="d${d4}"`) && !R('vBaoCaoCa()').includes('id="bc_s4"'));
    const s4 = () => R("bcGet('s4')").split(String.fromCharCode(10));
    R(`ACTIONS.bcvpct({ k: 'd${d1}', v: '10' })`);
    ok('+10 trên đơn 80%: thành 90%', s4().includes('Dầm sàn chéo tầng T7-t8 trục X17-X20: đang gia công 90%'), s4().join(' | '));
    R(`ACTIONS.bcvxong({ k: 'd${d4}' })`);
    eq('Xong: dòng thành hoàn thành, xếp sau các việc đang làm', s4().slice(-1), ['Thang bộ TB12 tầng 2-3 trục 13: hoàn thành']);
    R(`ACTIONS.bcvbo({ k: 'd${d2}' })`);
    ok('×: bỏ dòng khỏi báo cáo, đơn đó thành nút gợi ý để thêm lại', !s4().some((l) => l.startsWith('Vách W1')) && R('vBaoCaoCa()').includes(`data-a="bcvthem" data-v="${d2}"`));
    R(`ACTIONS.bcvthem({ v: '${d2}' })`);
    ok('chạm gợi ý: đơn vào lại báo cáo', s4().includes('Vách W1 cote 18.5-21.5m trục X27-X28 / 13: đang gia công 50%'));
    R(`ACTIONS.bcvmo(); S.form.bcv_ten = 'LK11, LK12 (thấp tầng)'; ACTIONS.bcvmoi({ v: '10' })`);
    const t0 = 't' + R('S.bcV.tu[0].id');
    for (let k = 0; k < 5; k++) R(`ACTIONS.bcvpct({ k: '${t0}', v: '10' })`);
    R(`ACTIONS.bcvmo(); ACTIONS.bcvck({ v: 'Cột' }); S.form.bcv_tang = 'Tầng 3'; S.form.bcv_truc = 'trục A-B'; ACTIONS.bcvmoi({ v: 'xong' })`);
    ok('thêm việc ngoài app: gõ hoặc chạm loại cấu kiện + tầng + trục, đổi % bằng chạm', s4().includes('LK11, LK12 (thấp tầng): đang gia công 60%') && s4().includes('Cột tầng 3 trục A-B: hoàn thành'), s4().join(' | '));
    ok("mục 4 hiện sửa chưa chép và bản sẽ gửi đổi theo", R('vBaoCaoCa()').includes('4. Công việc trong ngày</b> · <b style="color:var(--warn)">sửa chưa chép</b>') && R('bcTao()').includes('• LK11, LK12 (thấp tầng): đang gia công 60%'));
    // mục 8 theo mục 4: Thang bộ TB12 trễ hạn nhưng đã đánh Xong ở mục 4 thì không còn trong mục 8
    ok('đơn đánh Xong ở mục 4 không còn là trễ ở mục 8', !R("bcGet('s8')").includes('Thang bộ TB12'), R("bcGet('s8')"));
    // 10–90%: +10 ở 90 là hoàn thành, −10 không xuống dưới 10
    R(`ACTIONS.bcvpct({ k: 'd${d2}', v: '10' })`); for (let k = 0; k < 4; k++) R(`ACTIONS.bcvpct({ k: 'd${d2}', v: '10' })`);
    ok('+10 ở 90%: thành hoàn thành, không ra "100%"', s4().includes('Vách W1 cote 18.5-21.5m trục X27-X28 / 13: hoàn thành') && !s4().some((l) => l.includes('100%')), s4().join(' | '));
    for (let k = 0; k < 12; k++) R(`ACTIONS.bcvpct({ k: 'd${d2}', v: '-10' })`);
    ok('−10 không xuống dưới 10%', s4().includes('Vách W1 cote 18.5-21.5m trục X27-X28 / 13: đang gia công 10%'), s4().join(' | '));
    R(`ACTIONS.bcvtheo({ k: 'd${d2}' })`);
    R(`ACTIONS.bcvpct({ k: 'd${d2}', v: '-10' })`);
    ok('chỉnh % cố ý khác số đơn: KHÔNG nhắc', !R('vBaoCaoCa()').includes('Đơn đang') && !R('vBaoCaoCa()').includes('dòng khác số đơn'));
    // tổ báo tiến độ mới cho đơn đó sau lúc chỉnh (giả lập số đơn trên màn đổi): nhắc, chạm là lấy theo đơn
    R(`S.bcc.don.find((x) => x.id === ${d2}).pct = 60`);
    ok('đơn đi tiếp sau lúc chỉnh: có nhắc "Đơn đang …", chạm là lấy theo đơn', R('vBaoCaoCa()').includes('Đơn đang 60% · lấy theo đơn') && R('vBaoCaoCa()').includes('1 dòng khác số đơn')
      && (R(`ACTIONS.bcvtheo({ k: 'd${d2}' })`), s4().includes('Vách W1 cote 18.5-21.5m trục X27-X28 / 13: đang gia công 60%')), s4().join(' | '));
    R(`S.bcc.don.find((x) => x.id === ${d2}).pct = 50`);
    // tên việc tự thêm có dấu cách thừa: chuẩn hoá ngay như server, mở lại không bị báo "Chép lại"
    R(`ACTIONS.bcvmo(); S.form.bcv_ten = 'Ram  dốc   B1'; ACTIONS.bcvmoi({ v: '10' })`);
    ok('dấu cách thừa trong tên việc được gộp ngay lúc thêm', s4().includes('Ram dốc B1: đang gia công 10%'));
    R('ACTIONS.bcchep()'); await cho();
    R(`S.bcc = null; go('baocaoca', true)`); await cho();
    ok('mở lại sau khi chép: nút chép vẫn "Đã chép", không báo nhầm "Chép lại"', R('vBaoCaoCa()').includes('Đã chép</button>'), R('vBaoCaoCa()').match(/(Đã chép|Chép lại|Chép báo cáo)<\/button>/));
    const tRam = 't' + R("S.bcV.tu.find((x) => x.ten === 'Ram dốc B1').id");
    R(`ACTIONS.bcvbo({ k: '${tRam}' })`);
    // hai người cùng soạn: người kia vừa thêm một việc và chép; mình (đang chỉnh dòng khác) chép sau → ghép theo từng dòng
    const goc2 = (await S.call('GET', `/baocao?ngay=${D}&ca=2`, undefined, 'Admin')).data;
    R(`ACTIONS.bcvpct({ k: 'd${d1}', v: '-10' })`);
    const khac = await S.call('PUT', '/baocao', { ngay: D, ca: 2, ts: goc2.bao.ts, van_ban: goc2.bao.van_ban + ' (Admin)', muc: goc2.bao.muc, viec: { ...goc2.bao.viec, tu: goc2.bao.viec.tu.concat({ id: 'admin1', ten: 'Cọc khoan nhồi', tt: 20 }) } }, 'Admin');
    eq('người kia chép trước', khac.status, 200);
    R('ACTIONS.bcchep()'); await cho();
    ok('mình chép sau: bị chặn, ghép theo từng dòng — việc người kia vừa thêm VẪN CÒN, dòng mình chỉnh và dòng mình bỏ giữ nguyên', s4().includes('Cọc khoan nhồi: đang gia công 20%') && s4().includes('Dầm sàn chéo tầng T7-t8 trục X17-X20: đang gia công 80%') && !s4().some((l) => l.startsWith('Ram dốc')), s4().join(' | '));
    R('ACTIONS.bcchep()'); await cho();
    const tAdmin = 't' + 'admin1';
    R(`ACTIONS.bcvbo({ k: '${tAdmin}' })`);
    R('ACTIONS.bcchep()'); await cho();
    const luu = JSON.parse(S.one('SELECT data FROM bao_cao_ca WHERE ngay = ? AND ca = 2', D).data).viec;
    eq('chép: phần chỉnh lưu kèm báo cáo; tiến độ đơn gia công KHÔNG đổi', [luu.tu.map(({ ten, tt }) => ({ ten, tt })), S.one('SELECT pct FROM don_gc WHERE id = ?', d1).pct, S.one('SELECT tt FROM don_gc WHERE id = ?', d4).tt],
      [[{ ten: 'LK11, LK12 (thấp tầng)', tt: 60 }, { ten: 'Cột tầng 3 trục A-B', tt: 'xong' }], 80, 'lam']);
    const sau = vnDay(Date.parse(D) + 864e5);
    R(`S.bcCa = { ngay: '${sau}', ca: 1 }; S.bcc = null; go('baocaoca', true)`); await cho();
    ok('ca sau (chưa ai lưu): việc tự thêm chưa xong mang sang, việc đã hoàn thành thì không; đơn theo số của đơn', s4().includes('LK11, LK12 (thấp tầng): đang gia công 60%') && !s4().some((l) => l.startsWith('Cột tầng 3')) && s4().includes('Dầm sàn chéo tầng T7-t8 trục X17-X20: đang gia công 80%'), s4().join(' | '));
    R("ACTIONS.bcsua({ k: 's4' }); ACTIONS.bcvchu()");
    ok('Sửa bằng chữ: ô chữ bắt đầu từ đúng chữ đang hiện, có nút về soạn theo dòng', R('vBaoCaoCa()').includes('id="bc_s4"') && R("S.bcM.s4").includes('LK11') && R('vBaoCaoCa()').includes('data-a="bclay" data-k="s4"'));
    R("ACTIONS.bclay({ k: 's4' })");
    ok('về soạn theo dòng', typeof R('S.bcM.s4') === 'undefined' && R('vBaoCaoCa()').includes('data-a="bcvpct"'));
    const rac = await S.call('PUT', '/baocao', { ngay: sau, ca: 1, ts: 0, van_ban: 'x', muc: {}, viec: { d: { abc: { tt: 5 }, [d1]: { tt: 999 } }, tu: [{ ten: '', tt: 10 }, { ten: 'y', tt: 'gi' }] } }, CV);
    eq('dữ liệu lạ trong phần chỉnh mục 4: server bỏ đi', [rac.status, JSON.parse(S.one('SELECT data FROM bao_cao_ca WHERE ngay = ? AND ca = 1', sau).data).viec], [200, { d: {}, them: [], tu: [] }]);
    S.raw.exec(`DELETE FROM bao_cao_ca WHERE ngay = '${sau}'`);
    // app bản cũ (không gửi phần chỉnh mục 4) chép báo cáo: phần chỉnh đang lưu giữ nguyên, không bị xoá trắng
    const b5 = (await S.call('GET', `/baocao?ngay=${D}&ca=2`, undefined, CV)).data;
    eq('app bản cũ chép (không gửi phần chỉnh mục 4): phần chỉnh đang lưu giữ nguyên', [(await S.call('PUT', '/baocao', { ngay: D, ca: 2, ts: b5.bao.ts, van_ban: b5.bao.van_ban + ' ', muc: b5.bao.muc }, CV)).status,
      JSON.parse(S.one('SELECT data FROM bao_cao_ca WHERE ngay = ? AND ca = 2', D).data).viec.tu.map((x) => x.ten)], [200, ['LK11, LK12 (thấp tầng)', 'Cột tầng 3 trục A-B']]);
    // ca trước chép mục 4 BẰNG CHỮ: không mang việc tự thêm sang (có thể đã bị xoá trong chữ)
    const b6 = (await S.call('GET', `/baocao?ngay=${D}&ca=2`, undefined, CV)).data;
    await S.call('PUT', '/baocao', { ngay: D, ca: 2, ts: b6.bao.ts, van_ban: b6.bao.van_ban, muc: { ...b6.bao.muc, s4: 'Chữ tự gõ' }, viec: b6.bao.viec }, CV);
    eq('ca trước chép mục 4 bằng chữ: không mang việc tự thêm sang', (await S.call('GET', `/baocao?ngay=${sau}&ca=1`, undefined, CV)).data.viecTruoc, []);
    const b7 = (await S.call('GET', `/baocao?ngay=${D}&ca=2`, undefined, CV)).data;
    await S.call('PUT', '/baocao', { ngay: D, ca: 2, ts: b7.bao.ts, van_ban: b7.bao.van_ban, muc: Object.fromEntries(Object.entries(b7.bao.muc).filter(([k]) => k !== 's4')), viec: b7.bao.viec }, CV);
    // chỉ mang từ báo cáo trong 2 ngày
    const xa = vnDay(Date.parse(D) - 4 * 864e5);
    S.raw.prepare('INSERT INTO bao_cao_ca (ngay, ca, data, van_ban, ts, by_id) VALUES (?, 1, ?, ?, 1, ?)').run(xa, JSON.stringify({ muc: {}, viec: { d: {}, them: [], tu: [{ id: 'cu1', ten: 'Việc cũ', tt: 40 }] } }), 'x', U[CV]);
    eq('mang sang chỉ từ báo cáo trong 2 ngày: cách 2 ngày thì có, cách 3 ngày thì không', [(await S.call('GET', `/baocao?ngay=${vnDay(Date.parse(D) - 2 * 864e5)}&ca=1`, undefined, CV)).data.viecTruoc.map((x) => x.ten), (await S.call('GET', `/baocao?ngay=${vnDay(Date.parse(D) - 864e5)}&ca=1`, undefined, CV)).data.viecTruoc],
      [['Việc cũ'], []]);
    S.raw.exec(`DELETE FROM bao_cao_ca WHERE ngay = '${xa}'`);
    // chỉnh trên một đơn không còn trong báo cáo của ca (đã huỷ, hay xong từ ca trước): không làm mục 4 thành "đã chỉnh"
    R(`S.bcc = null; go('baocaoca', true)`); await cho();
    R("S.bcV.d['99999'] = { tt: 40, g: 20 }; S.bcV.them.push(88888)");
    ok('chỉnh trên đơn không còn trong ca: mục 4 không bị gắn nhãn "đã chỉnh", không có nút lấy lại', !R('vBaoCaoCa()').includes('đã chỉnh trên đơn') && !R('vBaoCaoCa()').includes('data-a="bclay" data-k="s4"'));
    R("delete S.bcV.d['99999']; S.bcV.them.pop()");
    R(`S.bcCa = { ngay: '${D}', ca: 2 }; S.bcc = null; go('baocaoca', true)`); await cho();
  }

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
