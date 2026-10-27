/* Ảnh biên bản (src/anh.js) trên worker thật + SQLite thật + R2 giả trong bộ nhớ. node anh.test.mjs <đường-dẫn-repo>
   Những điều tính năng này hứa:
   1. Ảnh gắn đúng MỘT dòng sổ (vay mượn, sắt vụn, đơn gia công) và hiện kèm ngay trong danh sách của sổ đó, cả ở màn Duyệt.
   2. Chỉ nhận ảnh thật (JPEG/PNG/WebP), không quá 6MB; trả lại đúng bytes, không cho trình duyệt đoán kiểu khác.
   3. Xoá: người tải lên trong 10 phút, hoặc CVKTHT trở lên bất cứ lúc nào; xoá cả dòng lẫn object R2.
   4. R2 lỗi thì không để lại dòng trỏ vào ảnh không có. */
import { boot, advance, vnDay } from './harness.mjs';

const ROOT = process.argv[2] || '.';
const T = [];
const ok = (name, cond, extra) => { T.push([cond ? 'PASS' : 'FAIL', name, extra === undefined ? '' : String(extra)]); };
const eq = (name, a, b) => ok(name + ' = ' + JSON.stringify(b), JSON.stringify(a) === JSON.stringify(b), 'thực tế: ' + JSON.stringify(a));
// "ảnh" giả: đầu JPEG thật (FF D8 FF) + vài byte, đủ để so lại từng byte khi tải về
const anh = (n = 1) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, n, 1, 2, 3, 250, 251]);

async function main() {
  const S = await boot(ROOT);
  await S.call('POST', '/setup', { token: 'setup-tok', name: 'Admin', phone: '0900000001', pin: '2468' });
  await S.login('admin', '0900000001', '2468');
  const U = {};
  for (const [name, phone, role] of [['An', '0900000002', 'tieudoi'], ['Binh', '0900000003', 'tieudoi'], ['Kho', '0900000004', 'cvktht']]) {
    const r = await S.call('POST', '/users', { name, phone, role });
    await S.login(name, phone, r.data.pin);
    await S.call('POST', '/change-pin', { pin: r.data.pin, newPin: '1357' }, name);
    U[name] = r.data.id;
  }
  const len = (loai, id, file, who = 'An', type) => S.call('POST', `/anh/${loai}/${id}`, file, who, type);
  const soObj = () => S.env.ANH.obj.size;

  /* ===== 1. Sổ vay mượn: lần ghi hai phi, ảnh gắn vào dòng id nhỏ nhất (đúng id máy khách gửi) ===== */
  const dt = (await S.call('POST', '/doitac', { name: 'Cty Hoà Bình' }, 'An')).data.id;
  const g = await S.call('POST', '/loans', { bienban: true, zalo: true, so_bb: 'BB-01', doitac: dt, kind: 'vay', lines: [{ phi: 'D16', qty: 10 }, { phi: 'D18', qty: 5 }] }, 'An');
  const lid = Math.min(...g.data.ids);
  const a1 = await len('loan', lid, anh(1));
  eq('Tiểu đội trưởng thêm ảnh vào lần ghi của mình', [a1.status, a1.data.user_name, a1.data.kich_thuoc], [200, 'An', 10]);
  eq('ảnh nằm trên R2, dòng anh_bb trỏ đúng dòng sổ', [soObj(), S.one('SELECT loai, entity_id FROM anh_bb WHERE id = ?', a1.data.id)], [1, { loai: 'loan', entity_id: lid }]);
  const items = (await S.call('GET', '/loans', undefined, 'Binh')).data.items;
  eq('danh sách sổ vay kèm sẵn ảnh ở đúng dòng, dòng kia rỗng', items.filter((r) => r.grp === items.find((x) => x.id === lid).grp).map((r) => [r.id === lid, r.anh.map((x) => x.id)]).sort(),
    [[false, []], [true, [a1.data.id]]].sort());
  ok('không còn cột anh_json thô trong trả lời', items.every((r) => !('anh_json' in r)));
  eq('màn chi tiết đối tác cũng kèm ảnh', (await S.call('GET', '/loans?doitac=' + dt, undefined, 'Kho')).data.items.find((r) => r.id === lid).anh.length, 1);
  eq('màn Duyệt: lần ghi chờ duyệt kèm ảnh để đối chiếu biên bản', (await S.call('GET', '/review', undefined, 'Kho')).data.loans.find((r) => r.id === lid).anh.map((x) => x.id), [a1.data.id]);

  /* ===== 2. Tải về ===== */
  const t1 = await S.call('GET', '/anh/' + a1.data.id, undefined, 'Binh');
  eq('ai đăng nhập cũng xem được, đúng từng byte', [t1.status, Array.from(t1.bytes)], [200, Array.from(anh(1))]);
  eq('kiểu ảnh, nosniff, cache lâu', [t1.res.headers.get('Content-Type'), t1.res.headers.get('X-Content-Type-Options'), /max-age=31536000/.test(t1.res.headers.get('Cache-Control') || '')], ['image/jpeg', 'nosniff', true]);
  ok('xem trong app: không ép tải xuống', !t1.res.headers.get('Content-Disposition'));
  ok('?dl=1: tải xuống, tên tệp nói rõ ảnh của sổ nào', /^attachment; filename="bien-ban-loan-\d+-\d+\.jpg"$/.test((await S.call('GET', `/anh/${a1.data.id}?dl=1`)).res.headers.get('Content-Disposition') || ''));
  eq('danh sách ảnh của một dòng', (await S.call('GET', `/anh/loan/${lid}`, undefined, 'Binh')).data.items.map((x) => [x.id, x.user_name]), [[a1.data.id, 'An']]);
  eq('chưa đăng nhập: không xem được', (await S.call('GET', '/anh/' + a1.data.id, undefined, 'khach')).status, 401);
  eq('chưa đăng nhập: không tải lên được', (await len('loan', lid, anh(), 'khach')).status, 401);

  /* ===== 3. Chặn dữ liệu sai ===== */
  eq('không phải ảnh (HTML): từ chối', (await len('loan', lid, new TextEncoder().encode('<script>alert(1)</script>'), 'An', 'text/html')).status, 400);
  eq('SVG (chạy được script): từ chối', (await len('loan', lid, new TextEncoder().encode('<svg/>'), 'An', 'image/svg+xml')).status, 400);
  eq('ảnh trống: từ chối', (await len('loan', lid, new Uint8Array(0))).status, 400);
  eq('quá 6MB: từ chối', (await len('loan', lid, new Uint8Array(6 * 1024 * 1024 + 1))).status, 400);
  eq('PNG nhận được, giữ đúng kiểu khi trả lại', await (async () => { const r = await len('loan', lid, anh(9), 'An', 'image/png'); const x = await S.call('GET', '/anh/' + r.data.id); await S.call('DELETE', '/anh/' + r.data.id, undefined, 'An'); return [r.status, x.res.headers.get('Content-Type')]; })(), [200, 'image/png']);
  eq('loại sổ lạ: không có', (await len('phieu', lid, anh())).status, 404);
  eq('dòng sổ không có: không có', (await len('loan', 999999, anh())).status, 404);
  eq('id không phải số: không có', [(await len('loan', 'abc', anh())).status, (await S.call('GET', '/anh/abc')).status, (await S.call('DELETE', '/anh/abc')).status], [404, 404, 404]);
  eq('ảnh không có: không có', (await S.call('GET', '/anh/999999')).status, 404);
  eq('bị từ chối thì không có gì nằm lại trên R2 hay trong bảng', [soObj(), S.one('SELECT COUNT(*) n FROM anh_bb').n], [1, 1]);

  /* ===== 4. Xoá ===== */
  eq('Tiểu đội trưởng khác không xoá được ảnh của người khác', (await S.call('DELETE', '/anh/' + a1.data.id, undefined, 'Binh')).status, 403);
  eq('người tải lên xoá được trong 10 phút: mất cả dòng lẫn object', [(await S.call('DELETE', '/anh/' + a1.data.id, undefined, 'An')).status, soObj(), S.one('SELECT COUNT(*) n FROM anh_bb').n], [200, 0, 0]);
  eq('xoá rồi thì xem ra không có', (await S.call('GET', '/anh/' + a1.data.id)).status, 404);
  const a2 = await len('loan', lid, anh(2));
  advance(11 * 60e3);
  const qua = await S.call('DELETE', '/anh/' + a2.data.id, undefined, 'An');
  eq('quá 10 phút: người tải lên không tự xoá được, được bảo nhờ ai', [qua.status, /CVKTHT/.test(qua.data.error)], [403, true]);
  eq('CVKTHT xoá được bất cứ lúc nào', (await S.call('DELETE', '/anh/' + a2.data.id, undefined, 'Kho')).status, 200);
  eq('nhật ký ghi lần thêm và lần xoá', S.sql("SELECT action, COUNT(*) n FROM audit WHERE action LIKE 'anh_bb_%' GROUP BY action ORDER BY action").map((x) => [x.action, x.n]),
    [['anh_bb_add', 3], ['anh_bb_xoa', 3]]);
  const nk = JSON.parse(S.one("SELECT detail FROM audit WHERE action = 'anh_bb_xoa' ORDER BY id DESC LIMIT 1").detail);
  eq('nhật ký nói rõ ảnh của biên bản nào, ảnh ai tải (dòng sổ có bị huỷ sau này vẫn đọc được)', [nk.loai, nk.so_bb, nk.ten, nk.cua], ['loan', 'BB-01', 'Cty Hoà Bình', 'An']);

  /* ===== 4b. Giới hạn 20 ảnh mỗi dòng sổ: lỡ chọn cả thư viện ảnh thì không đẩy hàng trăm ảnh lên R2 ===== */
  for (let i = 0; i < 20; i++) await len('loan', lid, anh(i));
  const thua = await len('loan', lid, anh(99));
  eq('ảnh thứ 21: từ chối, nói rõ giới hạn', [thua.status, /20 ảnh/.test(thua.data.error), S.one("SELECT COUNT(*) n FROM anh_bb WHERE loai = 'loan' AND entity_id = ?", lid).n], [400, true, 20]);
  for (const x of S.sql("SELECT id FROM anh_bb WHERE loai = 'loan'")) await S.call('DELETE', '/anh/' + x.id, undefined, 'Kho');
  eq('dọn xong', [S.one('SELECT COUNT(*) n FROM anh_bb').n, soObj()], [0, 0]);

  /* ===== 4c. Lần ghi vay mượn KÈM PHIẾU KHO: không nằm ở mục sổ vay chờ duyệt mà ở Phiếu chờ duyệt — ảnh phải theo thẻ phiếu ===== */
  const gk = await S.call('POST', '/loans', { bienban: true, zalo: true, so_bb: 'BB-K1', doitac: dt, kind: 'vay', khu: 'A', lines: [{ phi: 'D20', qty: 4 }, { phi: 'D22', qty: 2 }] }, 'Kho');
  const kid = Math.min(...gk.data.ids);
  const ka = await len('loan', kid, anh(5), 'Kho');
  const rv = (await S.call('GET', '/review')).data;
  const pv = rv.phieu.find((v) => v.kind === 'vay');
  eq('thẻ phiếu kho vay mượn ở màn Duyệt kèm ảnh, trỏ đúng lần ghi sổ', [gk.status, pv && pv.loan_id, pv && pv.anh.map((x) => x.id), rv.loans.some((r) => r.id === kid)], [200, kid, [ka.data.id], false]);
  ok('phiếu không phải vay mượn thì không có trường ảnh', rv.phieu.filter((v) => v.kind !== 'vay').every((v) => !('anh' in v)));
  await S.call('DELETE', '/anh/' + ka.data.id, undefined, 'Kho');

  /* ===== 5. Sắt vụn ===== */
  const sv = await S.call('POST', '/satvun', { tan: '2,5', noi: 'Cty Phế Liệu A', so_phieu: 'PC-1', khu: 'A' }, 'An');
  const s1 = await len('satvun', sv.data.id, anh(3));
  eq('sắt vụn: thêm ảnh phiếu cân', s1.status, 200);
  eq('sổ sắt vụn kèm ảnh', (await S.call('GET', '/satvun', undefined, 'Binh')).data.items.find((r) => r.id === sv.data.id).anh.map((x) => x.id), [s1.data.id]);
  eq('màn Duyệt: sắt vụn chờ duyệt kèm ảnh', (await S.call('GET', '/review', undefined, 'Kho')).data.satvun.find((r) => r.id === sv.data.id).anh.map((x) => x.id), [s1.data.id]);

  /* ===== 6. Đơn gia công: ảnh hiện ở màn chi tiết đơn, đúng đơn =====
     Nhiều ảnh, nhiều đơn, để id ảnh và id đơn lệch nhau: câu truy vấn so nhầm cột (a.entity_id = a.id) sẽ lộ ra. */
  const mai = vnDay(Date.now() + 864e5);
  const giao = async (truc) => (await S.call('POST', '/giacong', { cau_kien: 'Dầm D1', truc, tang: '1', users: [U.An], han: mai }, 'Kho')).data.id;
  const d1 = await giao('X1-X2'), d2 = await giao('X3-X4'), d3 = await giao('X5-X6');
  const ga = [];
  for (let i = 0; i < 3; i++) ga.push((await len('gc', d2, anh(10 + i))).data.id);
  eq('màn chi tiết đơn có đủ ảnh của đơn đó', (await S.call('GET', '/giacong/' + d2, undefined, 'Binh')).data.don.anh.map((x) => x.id), ga);
  eq('đơn khác không dính ảnh của đơn này', [(await S.call('GET', '/giacong/' + d1)).data.don.anh, (await S.call('GET', '/giacong/' + d3)).data.don.anh], [[], []]);
  ok('bảng chung gia công không tốn truy vấn ảnh (luôn rỗng, chỉ màn chi tiết mới có)', (await S.call('GET', '/giacong')).data.items.every((d) => Array.isArray(d.anh) && !d.anh.length));

  /* ===== 7. R2 lỗi: không để lại dòng trỏ vào ảnh không có ===== */
  const truoc = S.one('SELECT COUNT(*) n FROM anh_bb').n;
  S.env.ANH.hong = true;
  const hong = await len('loan', lid, anh(4));
  S.env.ANH.hong = false;
  eq('R2 lỗi: báo lỗi, bảng không thêm dòng', [hong.status >= 500, S.one('SELECT COUNT(*) n FROM anh_bb').n], [true, truoc]);

  /* ===== 8. Bản sao toàn bộ có bảng ảnh ===== */
  const bk = (await S.call('GET', '/backup')).data;
  eq('bản sao có metadata ảnh', bk.bang.anh_bb.length, truoc);

  /* ===== 9. Giao diện (app.js thật trong máy ảo) ===== */
  const { readFileSync } = await import('node:fs');
  const vm = (await import('node:vm')).default;
  const path = (await import('node:path')).default;
  const tao = [];
  const el = () => ({ value: '', dataset: {}, style: {}, focus() {}, remove() { this.go = true; }, click() { this.bam = true; }, setAttribute() {}, querySelector: () => null, querySelectorAll: () => [], appendChild() {}, closest: () => null, set innerHTML(v) {}, get innerHTML() { return ''; } });
  const ctx = {
    console, Date, Math, JSON, String, Number, Object, Array, Set, Map, parseInt, parseFloat, isNaN, Promise, RegExp, Error, TypeError, encodeURIComponent,
    setTimeout: () => 0, clearTimeout: () => {},
    localStorage: { getItem: () => null, setItem() {}, removeItem() {}, key: () => null, length: 0 },
    navigator: { onLine: true }, history: { state: null, pushState() {}, replaceState() {} },
    document: { activeElement: null, hidden: false, body: { appendChild(x) { tao.push(x); }, removeChild() {} }, createElement: () => el(), getElementById: () => el(), querySelectorAll: () => [], addEventListener() {} },
    window: { addEventListener() {} }, fetch: () => new Promise(() => {}), URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(readFileSync(path.join(ROOT, 'public/app.js'), 'utf8'), ctx, { filename: 'app.js' });
  const R = (src) => vm.runInContext(src, ctx);
  const dangXem = () => (R('anhXemHtml()').match(/\/api\/anh\/(\d+)/) || [])[1];
  const s0 = R("anhStrip('loan', 7, [])");
  ok('chưa có ảnh: nút thêm, không có ô chọn tệp trong HTML vẽ lại', s0.includes('data-a="anhpick" data-loai="loan" data-eid="7"') && !s0.includes('type="file"'), s0);
  ok('dòng đã huỷ: không có nút thêm, ảnh cũ vẫn xem được', R("anhStrip('loan', 7, [], false)") === '' && !R("anhStrip('loan', 7, [{id:1}], false)").includes('anhpick') && R("anhStrip('loan', 7, [{id:1}], false)").includes('/api/anh/1'));
  eq('lần ghi nhiều phi: ảnh lấy ở dòng id nhỏ nhất, không phải dòng đầu', R("loanAnh([{id:9,anh:[]},{id:5,anh:[{id:1}]}], 5)").map((x) => x.id), [1]);
  R("S.ask = null; S.screen = 'gcdon'; S.gc = { items: [{ id: 4, anh: [] }] }; S.gcDetail = { don: { id: 4, anh: [{ id: 9, ts: 1 }] } }; ACTIONS.anhxem({ loai: 'gc', eid: '4', i: '0' })");
  eq('đơn gia công: bấm ảnh mở được (không dò nhầm bảng chung, nơi ảnh luôn rỗng)', dangXem(), '9');
  R("S.screen = 'vaychitiet'; S.loans = { items: [{ id: 5, anh: [{ id: 1 }] }] }; S.loanDetail = { items: [{ id: 5, anh: [{ id: 1 }, { id: 2 }] }] }; ACTIONS.anhxem({ loai: 'loan', eid: '5', i: '1' })");
  eq('chi tiết đối tác: đọc bản của màn đang mở, không phải S.loans cũ', dangXem(), '2');
  R("ACTIONS.anhnav({ d: '-1' })");
  eq('Trước ‹', dangXem(), '1');
  R('ACTIONS.anhto()');
  ok('chạm ảnh: hiện cỡ thật để đọc chữ, có lời chỉ cách thu nhỏ', /data-a="anhto"[^>]*max-width:none/.test(R('anhXemHtml()')) && R('anhXemHtml()').includes('thu nhỏ'));
  R("ACTIONS.anhnav({ d: '1' })");
  ok('sang ảnh khác thì về cỡ vừa màn', !/max-width:none/.test(R('anhXemHtml()')));
  R("S.screen = 'duyet'; S.review = { loans: [], satvun: [{ id: 3, anh: [{ id: 40 }] }], phieu: [{ kind: 'vay', loan_id: 7, anh: [{ id: 31 }] }] }; ACTIONS.anhxem({ loai: 'loan', eid: '7', i: '0' })");
  eq('màn Duyệt: ảnh theo thẻ phiếu kho vay mượn', dangXem(), '31');
  R("ACTIONS.anhxem({ loai: 'satvun', eid: '3', i: '0' })");
  eq('màn Duyệt: ảnh sắt vụn chờ duyệt', dangXem(), '40');
  R("S.ask = { msg: 'x' }"); ok('hộp xác nhận đang mở thì hộp ảnh nhường chỗ', R('anhXemHtml()') === '');
  R('S.ask = null; ACTIONS.anhdong()'); ok('Đóng', R('anhXemHtml()') === '');
  R("ACTIONS.anhpick({ loai: 'gc', eid: '4' })");
  const o1 = tao[tao.length - 1];
  ok('Thêm ảnh: ô chọn tệp riêng ngoài vùng vẽ lại, nhiều ảnh, không ép camera, không display:none', o1 && o1.type === 'file' && o1.accept === 'image/*' && o1.multiple && o1.bam && !('capture' in o1) && !/display:\s*none/.test(o1.style.cssText || ''));
  R("ACTIONS.anhpick({ loai: 'gc', eid: '4' })");
  ok('mở lần nữa (lần trước bấm huỷ): ô cũ được gỡ', o1.go === true);
  /* quy trình: người ghi chụp/chọn ảnh NGAY TRONG FORM ghi sổ, bấm GHI SỔ là gửi luôn; người duyệt chỉ xem lại */
  const f1 = { name: 'a.jpg' }, f2 = { name: 'b.jpg' };
  ctx.__f = [f1, f2];
  R("ACTIONS.anhchothem({ loai: 'loan' })");
  const o3 = tao[tao.length - 1];
  o3.files = ctx.__f; o3.onchange();
  eq('form ghi sổ: chọn 2 ảnh, giữ trên máy chờ GHI SỔ (chưa gửi gì)', R("anhCho('loan').length"), 2);
  ok('form: hiện xem trước, nút bỏ từng ảnh, nút thêm ảnh', (() => { const h = R("anhChoHtml('loan')"); return (h.match(/data-a="anhchobo"/g) || []).length === 2 && h.includes('+ Thêm ảnh') && h.includes('không bắt buộc'); })());
  ok('hộp xác nhận GHI SỔ nói kèm bao nhiêu ảnh', R("anhNhac('loan')").includes('Gửi kèm 2 ảnh'));
  R("ACTIONS.anhchobo({ loai: 'loan', i: '0' })");
  eq('bỏ một ảnh', R("anhCho('loan').length"), 1);
  R("anhChoBo('loan')");
  ok('chưa có ảnh: vẫn ghi được, nhưng hộp xác nhận nhắc thẳng', R("anhNhac('loan')").includes('CHƯA CÓ ẢNH'));
  R("ACTIONS.anhchothem({ loai: 'satvun' })");
  const o4 = tao[tao.length - 1]; o4.files = Array.from({ length: 25 }, (_, i) => ({ name: i + '.jpg' })); o4.onchange();
  eq('chọn quá 20 ảnh: chỉ giữ 20, có báo', [R("anhCho('satvun').length"), R('S.toastErr')], [20, true]);
  R("anhChoBo('satvun')");
  ok('màn Duyệt: không có nút thêm, lần ghi chưa có ảnh thì báo rõ', R("anhStrip('loan', 7, [], false, true)").includes('Chưa có ảnh biên bản') && !R("anhStrip('loan', 7, [{id:1}], false, true)").includes('anhpick'));
  R("S.screen = 'duyet'; S.review = { loans: [{ id: 7, anh: [{ id: 3 }] }], satvun: [], phieu: [] }; ACTIONS.anhxem({ loai: 'loan', eid: '7', i: '0' })");
  ok('màn Duyệt: hộp xem lớn chỉ xem / tải xuống, không có Xoá', R('anhXemHtml()').includes('anhtaixuong') && !R('anhXemHtml()').includes('anhxoa'));
  R('ACTIONS.anhdong()');
  R("S.anhLoi = []; anhLoiGiu('satvun', 4, [{}, {}])");
  ok('ảnh chưa gửi được: thẻ báo + nút gửi lại, chỉ ở đúng sổ', R("anhLoiHtml('satvun')").includes('2 ảnh biên bản chưa gửi được') && R("anhLoiHtml('satvun')").includes('anhguilai') && R("anhLoiHtml('loan')") === '');
  R("anhLoiGiu('loan', 9, [{}]); anhLoiGiu('satvun', 4, [{}])");
  eq('lần ghi sau cũng rớt mạng: ảnh lần trước vẫn giữ, cùng lần ghi thì gộp', R("JSON.stringify([anhLoiHtml('satvun').includes('3 ảnh'), anhLoiHtml('loan').includes('1 ảnh'), S.anhLoi.length])"), '[true,true,2]');
  R("S.anhLoi = []; S.anhCho = { gc: [{ f: {}, u: 'x' }] }; S.anhChoGc = 5; gcXuatMo(5)");
  eq('mở lại hộp XUẤT cùng đơn: giữ ảnh đã chọn', R("anhCho('gc').length"), 1);
  R('gcXuatMo(6)');
  eq('mở hộp XUẤT đơn khác: bỏ ảnh của đơn trước', R("anhCho('gc').length"), 0);
  R("S.gcXu = null; S.boot = { khuBy: {}, phiBy: {} }");
  eq('nhật ký: thêm ảnh nói rõ biên bản nào, chip Vay mượn', R(`(() => { const f = fmtAudit({ action: 'anh_bb_add', detail: JSON.stringify({ loai: 'loan', ngay: '2026-10-21', so_bb: 'BB-01', ten: 'Cty Hoà Bình' }) }); return [f.text, f.type]; })()`),
    ['thêm ảnh biên bản sổ vay 21/10/2026 · BB BB-01 · Cty Hoà Bình', 'vay']);
  eq('nhật ký: xoá ảnh vào "Cần chú ý"', R(`fmtAudit({ action: 'anh_bb_xoa', detail: JSON.stringify({ loai: 'gc', ten: 'Dầm D1 · X1-X2', cua: 'An' }) }).flag`), true);

  /* ===== Rà soát: quyền thêm ảnh, key lạ không trỏ ra ngoài thư mục ảnh ===== */
  eq('người khác (Tiểu đội trưởng) không thêm ảnh vào lần ghi của An', (await len('loan', lid, anh(), 'Binh')).status, 403);
  eq('CVKTHT thêm được ảnh vào lần ghi của người khác', await (async () => { const r = await len('loan', lid, anh(7), 'Kho'); await S.call('DELETE', '/anh/' + r.data.id, undefined, 'Kho'); return r.status; })(), 200);
  await S.env.ANH.put('saoluu/2026-01-01_1.json', '{"bang":{"users":[]}}');
  S.raw.prepare("INSERT INTO anh_bb (id, loai, entity_id, r2_key, kich_thuoc, user_id, user_name, ts) VALUES (9999, 'loan', ?, 'saoluu/2026-01-01_1.json', 10, ?, 'An', ?)").run(lid, U.An, Date.now());
  eq('dòng ảnh trỏ vào bản sao lưu (tệp nạp bị sửa): không đọc được', (await S.call('GET', '/anh/9999', undefined, 'Binh')).status, 404);
  eq('xoá dòng ảnh lạ đó: bản sao lưu trên kho vẫn còn', [(await S.call('DELETE', '/anh/9999', undefined, 'An')).status, S.env.ANH.obj.has('saoluu/2026-01-01_1.json')], [200, true]);

  const fail = T.filter((x) => x[0] === 'FAIL');
  console.log(T.map((x) => x[0] + ' | ' + x[1] + (x[2] ? '  [' + x[2] + ']' : '')).join('\n'));
  console.log('\n=== ' + T.length + ' kiểm tra, ' + fail.length + ' lỗi ===');
  process.exit(fail.length ? 1 : 0);
}
main().catch((e) => { console.error('CRASH', e); process.exit(2); });
