/* Kiểm tra hành vi các chỗ đã sửa: đơn vị D8, tổng bãi gồm khu ẩn, TIẾP khi trống,
   hàng chờ gửi, cấu hình phi, hộp xác nhận, tải tệp. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = process.argv[2] || '.';
const code = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');

const EL = {};
const mkEl = (id) => ({
  id, tagName: 'INPUT', value: '', scrollTop: 0, dataset: {}, style: {},
  selectionStart: 0, selectionEnd: 0, _removed: 0,
  focus() {}, remove() { this._removed++; }, click() { this.clicked = true; },
  setSelectionRange() {}, querySelector: () => null, appendChild() {}, closest: () => null,
  set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html || ''; },
});
const appEl = mkEl('app');
const store = {};
const calls = [];
let toastNodes = [];

const ctx = {
  console, Date, Math, JSON, String, Number, Object, Array, Set, Map, parseInt, parseFloat, isNaN,
  Promise, RegExp, Error, TypeError, encodeURIComponent, URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
  setTimeout: (fn) => { if (typeof fn === 'function') ctx._timers.push(fn); return 0; },
  clearTimeout: () => {}, _timers: [],
  localStorage: {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    key: (i) => Object.keys(store)[i] || null,
    get length() { return Object.keys(store).length; },
  },
  navigator: { onLine: true },
  history: { state: null, pushState(s) { this.state = s; }, replaceState(s) { this.state = s; } },
  document: {
    activeElement: null,
    body: { appendChild() {}, removeChild() {} },
    createElement: () => mkEl('tmp'),
    getElementById: (id) => (id === 'app' ? appEl : (EL[id] || null)),
    querySelectorAll: (sel) => (sel === '[data-toast]' ? toastNodes : []),
    addEventListener() {},
  },
  window: { addEventListener() {} },
};
ctx.fetch = (url, opt) => {
  calls.push({ url, method: (opt && opt.method) || 'GET', body: opt && opt.body ? JSON.parse(opt.body) : null });
  const p = String(url);
  const reply = (o) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(o), blob: () => Promise.resolve({ size: 9 }) });
  if (p.indexOf('/api/bootstrap') === 0) return reply(ctx._boot());
  if (p.indexOf('/api/phi') === 0) return reply({ ok: true, n: 1 });
  if (p.indexOf('/api/counts') === 0) return reply({ ok: true, conflict: false });
  if (p.indexOf('/api/receipts') === 0) return reply({ ok: true, id: 77 });
  if (p.indexOf('/api/report') === 0) return reply({ ok: true });
  return reply({ ok: true });
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(code, ctx, { filename: 'app.js' });

const today = new Date().toISOString().slice(0, 10);
const yday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
const boot = {
  rev: 7, today, lastClosed: yday, closed: false,
  user: { id: 1, name: 'A', role: 'admin' },
  phi: [
    { id: 'D8', kg_per_cay: 0.395, bo_size: 11, min_stock: 110, unit: 'cuon' },
    { id: 'D10', kg_per_cay: 0.617, bo_size: 10, min_stock: 100, unit: 'cay' },
    { id: 'D12', kg_per_cay: 0.888, bo_size: 8, min_stock: 80, unit: 'cay' },
  ],
  khu: [{ id: 'A', name: 'Khu A', active: 1 }, { id: 'B', name: 'Khu B', active: 1 }, { id: 'Z', name: 'Khu Z', active: 0 }],
  khuPhi: [
    { khu_id: 'A', phi_id: 'D8', active: 1, keep_streak: 0 },
    { khu_id: 'A', phi_id: 'D10', active: 1, keep_streak: 0 },
    { khu_id: 'A', phi_id: 'D12', active: 1, keep_streak: 9 },
    { khu_id: 'B', phi_id: 'D10', active: 1, keep_streak: 0 },
  ],
  counts: [], baseline: [
    { khu_id: 'A', phi_id: 'D8', v: 220 }, { khu_id: 'A', phi_id: 'D10', v: 300 },
    { khu_id: 'A', phi_id: 'D12', v: 40 }, { khu_id: 'B', phi_id: 'D10', v: 100 },
    { khu_id: 'Z', phi_id: 'D10', v: 70 },
  ],
  reports: [], receipts: [],
  innKhu: [{ khu_id: 'A', phi_id: 'D8', q: 33 }],
  eff: [], // chưa khu nào đếm trong kỳ: mốc là tồn chuẩn
  mvNew: [{ khu_id: 'A', phi_id: 'D8', q: 33 }], // chưa đếm nên toàn bộ lượng nhập là "chưa được đếm"
  rates: [{ phi_id: 'D8', per_day: 33, days: 28 }],
  settings: { hide_after_zero_days: 3, max_keep_streak: 3, auto_close: 1, report_slots_per_day: 1 },
};
ctx._boot = () => JSON.parse(JSON.stringify(boot));
// dựng một ô nhập có sẵn nội dung, như lúc màn hình vừa vẽ xong
ctx._mk = (id, v) => { EL[id] = mkEl(id); EL[id].value = String(v); return EL[id]; };

const T = [];
const ok = (name, cond, extra) => T.push([cond ? 'PASS' : 'FAIL', name, extra === undefined ? '' : String(extra)]);

const run = async () => {
  const r = (src) => vm.runInContext(src, ctx, { filename: 't' });
  r(`S.me = ${JSON.stringify(boot.user)}; const B = ${JSON.stringify(boot)}; indexBoot(B); S.boot = B; S.screen = 'home';`);

  // ---- 1a. Nhập kho D8: gõ 10 = 10 cuộn = 110 cây ----
  EL.nqty = mkEl('nqty'); EL.nqty.value = '10';
  r(`S.nhap.phi = 'D8'; S.nhap.mode = 'nhap'; S.nhap.khu = 'A'; S.nhap.lines = []; syncQty();`);
  ok('D8: gõ 10 -> state 10 (cuộn)', r('S.nhap.qty') === 10, r('S.nhap.qty'));
  r(`ACTIONS.nadd()`);
  ok('D8: 10 cuộn -> dòng phiếu 110 cây', JSON.stringify(r('S.nhap.lines')) === '[{"phi":"D8","qty":110}]', JSON.stringify(r('S.nhap.lines')));
  ok('D8: nhãn ô nhập ghi "Số cuộn D8"', /Số cuộn D8/.test(r('vNhap()')));
  ok('D8: không còn nút "+1 cuộn" gây nhầm', !/\+1 cuộn/.test(r('vNhap()')));
  ok('D10: vẫn có nút "+1 bó"', (r(`S.nhap.phi='D10'; S.nhap.qty=0; vNhap()`), /\+1 bó \(10\)/.test(r('vNhap()'))));

  // trần theo giới hạn 99999 cây của server
  EL.nqty.value = '99999';
  r(`S.nhap.phi = 'D8'; syncQty();`);
  ok('D8: trần = 9090 cuộn (99999/11)', r('S.nhap.qty') === 9090, r('S.nhap.qty'));

  // đổi phi khác đơn vị thì không giữ số cũ
  EL.nqty.value = '7';
  r(`S.nhap.phi = 'D8'; syncQty(); ACTIONS.nphi({ v: 'D10' });`);
  ok('đổi D8 -> D10 thì xoá số đang gõ', r('S.nhap.qty') === 0, r('S.nhap.qty'));
  EL.nqty.value = '5';
  r(`S.nhap.phi = 'D10'; ACTIONS.nphi({ v: 'D12' });`);
  ok('đổi D10 -> D12 (cùng đơn vị cây) thì giữ số', r('S.nhap.qty') === 5, r('S.nhap.qty'));

  // ---- 1b. lệch trong bảng đếm hiện theo cuộn ----
  r(`S.khu = 'A'; loadDraft(true); S.sel = null;`);
  r(`S.draft.cells['D8'] = { v: 220, kind: 'dem', bo: 20, le: 0 }; var H = demView();`);
  ok('D8 lệch −33 cây hiện "−3 cuộn"', /−3 cuộn/.test(r('H')), (r('H').match(/.{0,18}cuộn.{0,8}/) || [''])[0]);
  r(`S.draft.cells['D8'] = { v: 248, kind: 'dem', bo: 22, le: 6 }; var H2 = demView();`);
  ok('lệch lẻ hiện theo cuộn thập phân', /−0,45 cuộn/.test(r('H2')), (r('H2').match(/<i>[^<]*<\/i>/) || [''])[0]);

  /* ---- 1c. "Hết (0)" là ĐẾM THẬT, để trống mới là 'zero' ----
     Hai cái đều ra số 0 nhưng mang nghĩa trái nhau, và màn Duyệt dựa vào kind để nói
     "khu để trống phi này" hay "khu đã đếm, phi này hết thật". Ghi sai kind là người duyệt
     bị bày sai thông tin ở đúng chỗ dễ mất thép nhất. */
  /* D10 khu A đang có thép (tồn chuẩn 300), nên "Hết (0)" phải HỎI LẠI trước: nút này nằm sát TIẾP,
     bấm nhầm là ghi 0 cho phi đang có thép. Chưa trả lời thì chưa ghi gì. */
  r(`S.khu = 'A'; loadDraft(true); S.sel = 'D10'; S.bo = ''; S.le = ''; ACTIONS.zero();`);
  ok('"Hết (0)" trên phi đang có thép: hỏi lại', /D10: ghi HẾT \(0\)/.test(r('S.ask ? S.ask.msg : ""')), r('S.ask ? S.ask.msg : ""'));
  ok('chưa trả lời thì chưa ghi gì', r("S.draft.cells['D10'] === undefined"));
  r(`ACTIONS.askyes()`);
  await new Promise((res) => setImmediate(res));
  // nhường lượt là để start() của app chạy tiếp và ghi đè S.me bằng /api/me giả: đặt lại
  r(`S.me = ${JSON.stringify(boot.user)};`);
  ok('bấm "Hết (0)": ghi kind dem với v = 0 (đã đếm, xác nhận hết)',
    r("JSON.stringify(S.draft.cells['D10'])") === JSON.stringify({ v: 0, kind: 'dem', bo: 0, le: 0 }),
    r("JSON.stringify(S.draft.cells['D10'])"));
  // ô không chạm tới thì chính lúc GỬI mới điền kind 'zero' (để trống)
  r(`S.khu = 'A'; loadDraft(true); S.draft.cells = {}; var its = myPhiList().map((p) => { const c = S.draft.cells[p.id]; return c ? { phi: p.id, v: c.v, kind: c.kind } : { phi: p.id, v: 0, kind: 'zero' }; });`);
  ok('ô để trống gửi lên kind zero', r("its.every((x) => x.kind === 'zero' && x.v === 0)"), r('JSON.stringify(its.slice(0,2))'));
  ok('và gửi ĐỦ mọi phi đang bật, không gửi thiếu', r('its.length') === r('S.boot.phiAct.length'), r('its.length') + '/' + r('S.boot.phiAct.length'));
  // ô đã gửi ở trạng thái để trống: bảng đếm phải nói "để trống", không để người đếm tưởng mình đã đếm ra 0
  r(`S.sel = null; S.draft.cells['D10'] = { v: 0, kind: 'zero', bo: 0, le: 0 }; var HZ = demView();`);
  ok('bảng đếm ghi rõ ô đó là "để trống"', /để trống/.test(r('HZ')), (r('HZ').match(/.{0,30}để trống.{0,10}/) || [''])[0]);

  /* ---- 1d. Đặt lại số liệu thép: chỉ admin đầu tiên thấy, và nút xoá sạch phải khoá ----
     Đây là hai nút phá dữ liệu, một trong hai không hoàn tác được, nên chốt chặn phải chắc ở cả
     hai phía. Server là chỗ chặn thật; phần này giữ cho nút không bày ra sai người và không bấm
     được khi chưa gõ câu xác nhận. */
  r(`S.uFirst = 1; S.screen = 'settings'; var HS = vSettings();`);
  ok('admin đầu tiên thấy mục Dữ liệu thép', /Dữ liệu thép/.test(r('HS')));
  ok('có nút đặt tồn về 0', /data-a="resetzero"/.test(r('HS')));
  ok('và nhắc tải bản sao trước', /Tải tồn theo khu|Tải cả kỳ/.test(r('HS')));
  ok('nút xoá sạch bị khoá khi chưa gõ câu xác nhận', /data-a="resetwipe"/.test(r('HS')) && /dis" data-a="resetwipe"/.test(r('HS')),
    (r('HS').match(/class="[^"]*" data-a="resetwipe"/) || [''])[0]);
  r(`S.form.wipeword = ' xoa sach '; var HS2 = vSettings();`);
  ok('gõ đúng (kể cả chữ thường, có khoảng trắng) thì nút mở', /bad" data-a="resetwipe"/.test(r('HS2')),
    (r('HS2').match(/class="[^"]*" data-a="resetwipe"/) || [''])[0]);
  r(`S.form.wipeword = ''; S.uFirst = 99; var HS3 = vSettings();`);
  ok('admin KHÔNG phải người đầu tiên thì không thấy mục này', !/Dữ liệu thép/.test(r('HS3')));
  ok('và không thấy nút xoá sạch', !/resetwipe/.test(r('HS3')));
  r(`S.uFirst = 1; S.screen = 'home';`);

  // ---- 4a. tổng bãi ở màn Đếm gồm cả khu đã ẩn ----
  r(`S.draft = { cells: {}, baseTs: 0 }; var tot = totals(); var HD = demView();`);
  ok('totals(): tách riêng kg của khu ẩn', r('tot.hidKg') > 0, r('tot.hidKg'));
  ok('Đếm: "Tổng bãi" khớp Tổng quan', r('HD').indexOf(r('fmtT(tot.kg)')) > 0, r('fmtT(tot.kg)'));
  ok('Tổng quan: nói rõ phần thép ở khu ẩn', /khu đã ẩn/.test(r('vHome()')));

  // ---- bốn kiểu hiện số lượng ----
  for (const [mode, want, nope] of [
    ['cay', /470 cây/, /47 bó/],
    ['bo', /47 bó/, /470 cây/],
    ['kg', /tấn/, /47 bó/],
  ]) {
    r(`S.unit = '${mode}'; var HM = vTon();`);
    ok('kiểu "' + mode + '": Tồn bãi hiện đúng đơn vị', want.test(r('HM')) && !nope.test(r('HM')), (r('HM').match(/<b style="font-size:24px;[^>]*>[^<]*/) || [''])[0]);
  }
  // số lẻ LUÔN có đơn vị, kể cả trong ngoặc: "47 bó + 5" không nói 5 cái gì
  r(`S.unit = 'bo'`);
  ok('kiểu "bó": số lẻ có chữ cây', /47 bó \+ 0 cây|47 bó/.test(r(`qBo(470, S.boot.phiBy.D10)`)) && /bó \+ 5 cây/.test(r(`qBo(475, S.boot.phiBy.D10)`)), r(`qBo(475, S.boot.phiBy.D10)`));
  r(`S.unit = 'all'`);
  ok('kiểu "tất cả": số lẻ trong ngoặc cũng có đơn vị', /475 cây \(47 bó \+ 5 cây\)/.test(r(`fmtQ(475, S.boot.phiBy.D10)`)), r(`fmtQ(475, S.boot.phiBy.D10)`));

  /* Cặp "còn bao nhiêu / mức báo động" phải cùng đơn vị mới so được bằng mắt.
     Tồn dưới mức báo động thì gần như luôn dưới một bó, nên đây là trường hợp thường gặp
     chứ không phải ngoại lệ: trước đây ra "Còn 40 cây, báo động 1 bó". */
  // tồn 4 cây / báo động 10 cây (1 bó D10): số tồn chưa đủ một bó nên cả hai phải ra "cây"
  r(`S.unit = 'all'; var QP = qPair(4, S.boot.phiBy.D10.bo_size, S.boot.phiBy.D10);`);
  ok('cặp số so sánh: cùng đơn vị khi một số chưa đủ một bó', /cây/.test(r('QP[0]')) && /cây/.test(r('QP[1]')) && !/bó/.test(r('QP[1]')), r('QP').join(' | '));
  r(`var QP2 = qPair(95, S.boot.phiBy.D10.min_stock, S.boot.phiBy.D10);`);
  ok('cặp số so sánh: cả hai đủ một bó thì vẫn hiện theo bó', /bó/.test(r('QP2[0]')) && /bó/.test(r('QP2[1]')), r('QP2').join(' | '));

  // dấu thập phân tiếng Việt ở MỌI chỗ hiện mức dùng trung bình (Tổng quan / Tồn bãi / Duyệt)
  r(`S.unit = 'all'; S.expand = { D8: true }; var HR = vTon() + vHome() + vDuyet(); S.expand = {};`);
  ok('mức dùng trung bình: không lọt dấu chấm thập phân', !/\d\.\d+ (cuộn|cây)\/ngày/.test(r('HR')), (r('HR').match(/[\d.,]+ (cuộn|cây)\/ngày/g) || []).join(' | '));

  // ---- Tồn bãi: bó (+ cây lẻ) đứng trước, rồi số cây, rồi tấn ----
  r(`S.screen = 'ton'; var HT = vTon();`);
  const ht = r('HT');
  const iBo = ht.indexOf('47 bó'), iCay = ht.indexOf('470 cây'), iTan = ht.indexOf('tấn');
  ok('Tồn bãi hiện "47 bó" trước số cây', iBo > 0 && iCay > iBo, 'bó@' + iBo + ' cây@' + iCay);
  ok('Tồn bãi vẫn có số cây và số tấn', iCay > 0 && iTan > 0);
  ok('phi dưới 1 bó không lặp lại số cây', !/40 cây<\/b><span class="sm muted">40 cây/.test(ht));

  // ---- 2c. TIẾP khi chưa gõ gì ----
  r(`S.sel = 'D10'; S.bo = ''; S.le = ''; S.toast = ''; settle('next');`);
  ok('TIẾP khi trống: đứng lại ở D10', r('S.sel') === 'D10', r('S.sel'));
  ok('TIẾP khi trống: có cảnh báo', /Gõ số/.test(r('S.toast')), r('S.toast'));
  r(`S.sel = 'D10'; S.bo = '12'; S.le = '3'; settle('next');`);
  ok('TIẾP khi có số: ghi 123 cây và sang phi kế', r('S.draft.cells.D10.v') === 123 && r('S.sel') === 'D12', r('S.draft.cells.D10.v') + '/' + r('S.sel'));

  // ---- keepBlock: phi giữ nguyên quá nhiều ngày ----
  ok('D12 giữ nguyên quá hạn -> chặn', /quá nhiều ngày/.test(r(`keepBlock('A', 'D12')`)), r(`keepBlock('A','D12')`));
  /* Lời nhắc phải kể CẢ BA nguyên nhân (nhập, chuyển khu, điều chỉnh), vì phiếu điều chỉnh cũng
     chặn "giữ nguyên" — mà bảo người đếm là "có thép chuyển đi" khi thực ra admin vừa sửa sổ thì
     họ đi tìm một chuyến xe không tồn tại. */
  ok('D8 có thay đổi tồn -> chặn giữ nguyên', /thay đổi tồn/.test(r(`keepBlock('A', 'D8')`)), r(`keepBlock('A','D8')`));
  ok('lời nhắc kể cả điều chỉnh', /điều chỉnh/.test(r(`keepBlock('A', 'D8')`)), r(`keepBlock('A','D8')`));

  // ---- 2d. hàng chờ gửi khoá theo khu+ngày+giờ ----
  r(`writePending([
    { khu: 'A', day: '${yday}', items: [], ts: 111, err: 'Đã sang ngày mới' },
    { khu: 'B', day: '${today}', items: [], ts: 222 },
  ]);`);
  const html = r('pendingHtml()');
  ok('hàng chờ: nút dùng khoá nhận dạng, không dùng vị trí', /data-j="A\|/.test(html) && !/data-i=/.test(html));
  r(`S.ask = null; ACTIONS.pendrm({ j: 'A|${yday}|111' });`);
  r(`if (S.ask) { const a = S.ask; S.ask = null; a.resolve(true); }`);
  await new Promise((res) => setImmediate(res));
  ok('hàng chờ: bỏ đúng báo cáo theo khoá', r('readPending().length') === 1 && r('readPending()[0].khu') === 'B', JSON.stringify(r('readPending()')));

  // ---- 6d. ask(): huỷ thì không làm gì ----
  r(`S.ask = null; ACTIONS.pendrm({ j: 'B|${today}|222' });`);
  ok('ask(): hiện hộp xác nhận trong app', !!r('S.ask') && /Bỏ báo cáo/.test(r('S.ask.msg')));
  r(`if (S.ask) { const a = S.ask; S.ask = null; a.resolve(false); }`);
  await new Promise((res) => setImmediate(res));
  ok('ask(): bấm "Để sau" thì giữ nguyên dữ liệu', r('readPending().length') === 1);
  r(`writePending([]);`);

  // ---- 1c. Cài đặt phi: đổi cây/cuộn và tối thiểu cùng lúc ----
  // phi cuộn nhập theo "1 cuộn nặng (kg)", phi cây nhập theo bó / kg / báo động
  EL['kgc-D8'] = mkEl('kgc-D8'); EL['kgc-D8'].value = '2200';
  EL['mn-D8'] = mkEl('mn-D8'); EL['mn-D8'].value = '2';
  for (const p of ['D10', 'D12']) {
    EL['bo-' + p] = mkEl('b'); EL['bo-' + p].value = '12';
    EL['mn-' + p] = mkEl('m'); EL['mn-' + p].value = '20';
    EL['kg-' + p] = mkEl('k'); EL['kg-' + p].value = '0,617';
  }
  calls.length = 0;
  r(`ACTIONS.psaveall()`);
  await new Promise((res) => setTimeout(res, 30));
  const put = calls.find((c) => c.method === 'PUT' && /\/phi$/.test(c.url));
  const d10 = put && put.body.items.find((x) => x.id === 'D10');
  ok('min_stock quy đổi theo số cây/bó MỚI (20 bó × 12 = 240)', !!d10 && d10.min_stock === 240 && d10.bo_size === 12, d10 && JSON.stringify(d10));
  const d8b = put && put.body.items.find((x) => x.id === 'D8');
  ok('phi cuộn: kg mỗi phần = kg cuộn / số phần', !!d8b && Math.abs(d8b.kg_per_cay - 2200 / 11) < 0.01, d8b && JSON.stringify(d8b));

  // phi đã tắt không có ô nhập trên màn hình: không được chặn việc lưu các phi còn lại
  r(`S.boot.phi[0].active = 0; indexBoot(S.boot);`);
  calls.length = 0;
  r(`ACTIONS.psaveall()`);
  await new Promise((res) => setTimeout(res, 30));
  const put2 = calls.find((c) => c.method === 'PUT' && /\/phi$/.test(c.url));
  ok('có phi đã tắt vẫn lưu được cấu hình', !!put2 && !put2.body.items.some((x) => x.id === 'D8'), put2 && JSON.stringify(put2.body.items.map((x) => x.id)));
  r(`S.boot.phi[0].active = 1; indexBoot(S.boot);`);

  // ---- 2b. ô đang gõ không bị xoá khi vẽ lại ----
  r(`S.form['kn-A'] = 'Khu A sửa dở'; var HS = vSettings();`);
  ok('Cài đặt: giữ tên khu đang gõ qua lần vẽ lại', /Khu A sửa dở/.test(r('HS')));
  ok('Cài đặt: các ô đều có data-model', (r('HS').match(/data-model="(bo|mn|kg|kn)-/g) || []).length >= 10);

  // ---- 2a. hết 5 giây thì chỉ bỏ thẻ thông báo ----
  toastNodes = [mkEl('t1')];
  r(`say('xong'); hideToast();`);
  ok('toast: bỏ đúng thẻ, không vẽ lại cả màn hình', toastNodes[0]._removed === 1 && r('S.toast') === '');
  toastNodes = [];

  /* ---- 3c. GỬI khi để trống phi ĐANG CÓ THÉP: phải hỏi lại ----
     Từ bản 1.3 ô để trống là 0 nên không còn chặn gửi. Nhưng để trống một phi đang có thép là
     xoá vài tấn khỏi giấy tờ bằng một lần quên gõ, nên phải hiện hộp xác nhận ở đúng đây. */
  r(`S.khu = 'A'; loadDraft(true); S.toast = ''; S.busy = false; S.ask = null; ACTIONS.send();`);
  ok('GỬI khi để trống phi đang có thép: hỏi lại trước khi ghi 0', !!r('S.ask'), JSON.stringify(r('S.ask && S.ask.msg')));
  ok('hộp hỏi nói rõ phi nào và đang có bao nhiêu', /D8|D10/.test(r('(S.ask && S.ask.msg) || ""')), r('(S.ask && S.ask.msg) || ""'));
  ok('và nói rõ gửi là ghi 0', /ghi 0/.test(r('(S.ask && S.ask.msg) || ""')), r('(S.ask && S.ask.msg) || ""'));
  // khu không có thép: để trống hết cũng không có gì phải hỏi (đây mới là trường hợp thường ngày)
  r(`S.ask = null; S.khu = 'B'; S.boot.bm = {}; S.boot.mv = {}; S.boot.mvn = {}; loadDraft(true);`);
  ok('khu không có thép: không phi nào bị hỏi lại', r('blankWithStock().length') === 0, r('blankWithStock().length'));
  ok('GỬI khi còn thiếu: không bật overlay Đang lưu', r('S.busy') === false);
  r(`S.khu = 'A'; loadDraft(true); S.draft.cells['D10'] = { v: 300, kind: 'dem', bo: 30, le: 0 };
     S.toast = ''; ACTIONS.keepall();`);
  ok('Giữ nguyên khi không phi nào đủ điều kiện: nói rõ', /đếm thực tế|hết phi/.test(r('S.toast')), r('S.toast'));

  // ---- 6a. nút Back của điện thoại ----
  r(`history.state = null; S.screen = 'home'; S.khu = 'A'; go('ton');`);
  await new Promise((res) => setTimeout(res, 20));
  ok('điều hướng: đẩy lịch sử để Back không thoát app', !!r('history.state') && r('history.state.s') === 'ton', JSON.stringify(r('history.state')));

  // ---- 6c. tải CSV bằng blob, không điều hướng ----
  calls.length = 0;
  r(`S.bc.from = '${yday}'; S.bc.to = '${today}'; ACTIONS.rcsv();`);
  await new Promise((res) => setTimeout(res, 30));
  ok('CSV: tải bằng fetch, không rời app', calls.some((c) => /\/api\/report\?format=csv/.test(c.url)), calls.map((c) => c.url).join(','));

  /* ---- 7a. Ngưỡng "đã dùng âm" ở Tổng quan phải trùng màn Duyệt ----
     Trước đây Tổng quan báo đỏ ngay khi lệch 1 cây còn Duyệt chỉ báo từ 100 kg, nên bấm thẻ đỏ
     sang Duyệt rồi không có việc gì để xử lý và người dùng mất tin vào cảnh báo. */
  r(`S.boot.limits = { negKg: 100, highKg: 500, rateDays: 5 };`);
  // tồn chuẩn D10: A 300 + B 100 + Z 70 = 470. D10 nặng 0,617 kg/cây.
  // đếm được 475 -> "đã dùng" −5 cây = −3 kg: sai số đếm thường ngày, không được báo đỏ
  r(`S.boot.eff = [{ khu_id: 'A', phi_id: 'D10', v: 305 }, { khu_id: 'B', phi_id: 'D10', v: 100 }]; indexBoot(S.boot);`);
  ok('lệch nhỏ (3 kg): Tổng quan không báo "đã dùng âm"', !/đã dùng âm/.test(r('vHome()')), r(`JSON.stringify(totals().used)`));
  // đếm được 670 -> "đã dùng" −200 cây = −123 kg: vượt ngưỡng, phải báo
  r(`S.boot.eff[0].v = 500; indexBoot(S.boot);`);
  ok('lệch lớn (123 kg): Tổng quan báo "đã dùng âm"', /đã dùng âm/.test(r('vHome()')), r(`JSON.stringify(totals().used)`));
  // server gửi ngưỡng khác thì app phải đi theo, không dùng số chép cứng
  r(`S.boot.limits.negKg = 500;`);
  ok('đổi ngưỡng ở server thì app đi theo', !/đã dùng âm/.test(r('vHome()')));
  r(`S.boot.limits.negKg = 100; S.boot.eff = []; indexBoot(S.boot);`);
  ok('ngưỡng số ngày dữ liệu cũng lấy từ server', r('S.boot.limits.rateDays = 9, minRateDays()') === 9);
  r(`delete S.boot.limits;`);
  ok('bản cache cũ không có limits: vẫn chạy bằng số dự phòng', r('LIM("negKg")') === 100 && r('minRateDays()') === 5);

  /* ---- 7b. Mở Cài đặt rồi bấm LƯU mà không sửa gì thì không được đổi số ----
     Ô "Báo động (bó)" và "kg / 1 cuộn" chỉ hiện số đã làm tròn. Nếu lượt lưu nào cũng quy đổi ngược
     từ ô hiển thị thì min_stock 110 của D8 (11 phần/cuộn) hiện "10 cuộn" rồi lưu lại vẫn ra 110,
     nhưng số nào không chia hết sẽ bị kéo lệch. Ở đây: không sửa ô nào thì phải gửi y số đang lưu. */
  r(`S.boot.phi.forEach((p) => { p.active = 1; }); S.form = {};`);
  // bó to thì 0,1 bó đã hơn nửa cây: 30 / 57 = 0,526 -> ô hiện "0,5" -> quy đổi ngược ra 29, lệch 1 cây
  r(`const p12 = S.boot.phi.find((p) => p.id === 'D12'); p12.bo_size = 57; p12.min_stock = 30;`);
  // phi cuộn: 115 / 11 = 10,45 -> ô hiện "10,5" -> quy đổi ngược ra 116
  r(`S.boot.phi.find((p) => p.id === 'D8').min_stock = 115;`);
  r(`indexBoot(S.boot);`);
  for (const p of ['D8', 'D10', 'D12']) {
    for (const k of ['bo', 'kg', 'kgc', 'mn']) delete EL[k + '-' + p];
  }
  // ô nhập hiện đúng những gì phiForm() dựng ra, giống lúc màn hình vừa mở
  r(`['D8','D10','D12'].forEach((id) => { const p = S.boot.phiBy[id], f = phiForm(p);
       Object.keys(f).forEach((k) => { _mk(k + '-' + id, f[k]); }); });`);
  calls.length = 0;
  r(`ACTIONS.psaveall()`);
  await new Promise((res) => setTimeout(res, 30));
  const putSame = calls.find((c) => c.method === 'PUT' && /\/phi$/.test(c.url));
  const d12 = putSame && putSame.body.items.find((x) => x.id === 'D12');
  ok('không sửa gì: mức báo động giữ nguyên 30 cây, không bị kéo về 29', !!d12 && d12.min_stock === 30, d12 && JSON.stringify(d12));
  const d8same = putSame && putSame.body.items.find((x) => x.id === 'D8');
  ok('không sửa gì: phi cuộn giữ nguyên báo động 115 phần', !!d8same && d8same.min_stock === 115, d8same && JSON.stringify(d8same));
  ok('không sửa gì: kg mỗi phần của phi cuộn giữ nguyên', !!d8same && d8same.kg_per_cay === 0.395, d8same && JSON.stringify(d8same));
  // sửa thật một ô thì phải tính lại đúng ô đó
  EL['mn-D12'].value = '20';
  calls.length = 0;
  r(`ACTIONS.psaveall()`);
  await new Promise((res) => setTimeout(res, 30));
  const putEd = calls.find((c) => c.method === 'PUT' && /\/phi$/.test(c.url));
  const d12b = putEd && putEd.body.items.find((x) => x.id === 'D12');
  ok('sửa ô báo động: quy đổi theo bó (20 × 57 = 1.140)', !!d12b && d12b.min_stock === 1140, d12b && JSON.stringify(d12b));
  r(`S.form = {};`);

  /* ---- 7c. Bàn đếm chặn số vượt trần ngay lúc gõ ----
     Server chặn 99.999 cây mỗi phi. Trước đây bàn số cho gõ tới 999 bó (D10 là 439.560 cây),
     người đếm nhập xong cả khu rồi mới bị từ chối lúc bấm GỬI và không rõ phi nào sai. */
  r(`S.khu = 'A'; S.sel = 'D10'; S.bo = ''; S.le = ''; S.field = 'bo'; S.rep = { bo: false, le: false }; S.toast = '';`);
  r(`S.boot.phiBy.D10.bo_size = 440;`); // 99.999 / 440 = 227 bó
  r(`pressKey(1); pressKey(1); pressKey(1);`); // gõ 2,2,2 -> 222 bó, vẫn trong trần
  ok('gõ 222 bó D10 (97.680 cây): nhận', r('S.bo') === '222', r('S.bo'));
  r(`S.bo = ''; S.toast = ''; pressKey(8); pressKey(8); pressKey(8);`); // 999 bó -> vượt trần
  ok('gõ tới 999 bó: chặn ngay ở chữ số thứ ba', r('S.bo') === '99', r('S.bo'));
  ok('nói rõ lý do ngay tại bàn số', /quá lớn/.test(r('S.toast')), r('S.toast'));
  r(`S.sel = null; S.bo = ''; S.le = ''; S.toast = '';`);

  /* ---- 1f. Màn Người dùng và bảng chọn người phụ trách: nút phải bày đúng người ----
     Hai chỗ sai ngược nhau: một chỗ ẩn nút đúng người cần nó nhất, một chỗ bày ra lựa chọn mà
     server chắc chắn từ chối. Server vẫn là chỗ chặn thật; phần này giữ cho màn hình không tự
     tay vô hiệu hoá một tính năng và không dẫn người bấm vào một lỗi 400. */
  r(`S.me = { id: 1, name: 'admin', role: 'admin' }; S.uFirst = 1; S.screen = 'users'; S.pinShown = null; S.uRename = null;
     S.users = [
       { id: 1, name: 'admin', phone: '0900000001', role: 'admin', locked: 0, deleted: 0, must_change: 0 },
       { id: 2, name: 'An', phone: '0900000002', role: 'nguoidem', locked: 0, deleted: 0, must_change: 0 },
       { id: 3, name: 'Cu', phone: '0900000003', role: 'nguoidem', locked: 1, deleted: 1, must_change: 0 },
     ];
     var HU = vUsers();`);
  ok('chủ hệ thống sửa được tên CHÍNH MÌNH (tài khoản hay đặt theo chức danh)', /data-a="urename" data-id="1"/.test(r('HU')),
    (r('HU').match(/data-a="urename" data-id="\d+"/g) || []).join(','));
  ok('và vẫn sửa được tên người khác', /data-a="urename" data-id="2"/.test(r('HU')));
  ok('tài khoản đã xoá mà đang khoá: nói rõ khôi phục xong vẫn còn khoá', /vẫn còn khóa/.test(r('HU')));

  r(`S.me = { id: 2, name: 'Admin Hai', role: 'admin' }; S.users[1].role = 'admin'; var HU2 = vUsers();`);
  ok('admin khác KHÔNG thấy nút đặt lại PIN của admin đầu tiên', !/data-a="ureset" data-id="1"/.test(r('HU2')),
    (r('HU2').match(/data-a="ureset" data-id="\d+"/g) || []).join(','));
  ok('nhưng vẫn đặt lại được PIN của người khác', /data-a="ureset" data-id="2"/.test(r('HU2')));
  ok('và không thấy nút sửa tên của bất kỳ ai', !/data-a="urename"/.test(r('HU2')));

  // hộp xác nhận xoá phải nói ra khu sẽ không còn ai phụ trách, trước khi bấm
  r(`S.me = { id: 1, name: 'admin', role: 'admin' }; S.users[1].role = 'nguoidem';
     S.boot.khuUser = [{ khu_id: 'A', user_id: 2 }, { khu_id: 'B', user_id: 2 }, { khu_id: 'B', user_id: 4 }];
     indexBoot(S.boot); S.ask = null; S.busy = false; ACTIONS.udelete({ id: '2' });`);
  ok('hộp xác nhận xoá nói rõ khu sẽ mở ra cho cả bãi', /phụ trách DUY NHẤT của A/.test(r('(S.ask && S.ask.msg) || ""')),
    r('(S.ask && S.ask.msg) || ""'));
  ok('và chỉ kể khu không còn ai, không kể khu còn người khác', !/B Khu B/.test(r('(S.ask && S.ask.msg) || ""')));
  r(`if (S.ask) { const a = S.ask; S.ask = null; a.resolve(false); }`);

  // bảng chọn người phụ trách khu: tài khoản đã xoá không gán được, đừng bày ra
  r(`S.kuEdit = 'A'; S.kuPick = []; S.screen = 'settings'; var HK = vSettings();`);
  ok('bảng chọn KHÔNG bày tài khoản đã xoá', !/data-a="kupick" data-v="3"/.test(r('HK')),
    (r('HK').match(/data-a="kupick" data-v="\d+"/g) || []).join(','));
  ok('vẫn bày người đếm còn dùng', /data-a="kupick" data-v="2"/.test(r('HK')));
  r(`S.kuEdit = null; S.screen = 'home';`);

  /* ---- 1h. Thép ĐANG CÓ phải gồm phiếu đã duyệt mà khu chưa kịp đếm ----
     Quy tắc trung tâm của bản này là "chưa duyệt thì không vào tồn", tức đã duyệt là PHẢI vào.
     Trước đây Tổng quan chỉ lấy số đếm, nên một khu vừa nhận thép đã duyệt mà chưa kịp đếm vẫn
     hiện số cũ, trong khi màn Đếm lại ghi dự kiến đã gồm lượng đó — hai màn hình nói hai số cho
     cùng một khu. Fixture: khu A có tồn chuẩn D8 = 220 và một phiếu 33 đã duyệt chưa ai đếm. */
  r(`S.boot = _boot(); indexBoot(S.boot); S.khuMo = {}; S.draft = { cells: {}, baseTs: 0 };`);
  ok('số ĐẾM của ô vẫn là 220 (chưa ai đếm lại)', r("valOf('A','D8')") === 220, r("valOf('A','D8')"));
  ok('nhưng thép ĐANG CÓ là 253 (gồm phiếu đã duyệt)', r("tonOf('A','D8')") === 253, r("tonOf('A','D8')"));
  ok('tổng theo phi ở Tổng quan lấy số đang có', r('totals().perPhi.D8') === 253, r('totals().perPhi.D8'));
  ok('tổng của riêng khu A cũng vậy', r("Math.round(totals().perKhu.A.kg)") === Math.round(253 * 0.395 + 300 * 0.617 + 40 * 0.888),
    r('totals().perKhu.A.kg'));

  /* Nhưng phép "đã dùng" thì CỐ Ý vẫn lấy số đếm: công thức là "tồn cũ + nhập − đếm", mà phần
     nhập đã nằm ở vế nhập rồi. Lấy số đang có thì lượng nhập bị cộng hai lần và "đã dùng" ra 0
     trong khi đúng ra là 33. Server tính y hệt, hai bên không được lệch nhau. */
  ok('"đã dùng" KHÔNG cộng trùng lượng nhập', r('totals().used.D8') === 33, r('totals().used.D8'));

  // khu đã đếm SAU khi thép về: server không còn kể lượng đó nữa, nên không cộng trùng
  r(`S.boot.eff = [{ khu_id: 'A', phi_id: 'D8', v: 250 }]; S.boot.mvNew = []; indexBoot(S.boot);`);
  ok('khu đếm rồi thì đang có = đúng số vừa đếm', r("tonOf('A','D8')") === 250, r("tonOf('A','D8')"));
  ok('và không cộng thêm phiếu một lần nữa', r('totals().perPhi.D8') === 250, r('totals().perPhi.D8'));
  r(`S.boot = _boot(); indexBoot(S.boot);`);

  /* ---- 1g. Chạm thẻ khu ở Tổng quan: mở chi tiết thép trong khu ----
     Điều quan trọng nhất ở đây là số nào được hiện. Tồn của khu là số ĐÃ DUYỆT, nên chi tiết
     phải hiện đúng số đó — tức số liệu TRƯỚC báo cáo đang chờ — và tự đổi sang số mới khi báo
     cáo được duyệt. Hiện nhầm số đang chờ duyệt là nói với người xem rằng thép đã về/đã đi trong
     khi sổ sách chưa ghi nhận. */
  r(`S.me = { id: 1, name: 'A', role: 'admin' }; S.screen = 'home'; S.khuMo = {}; var H0 = vHome();`);
  ok('thẻ khu bấm được để mở chi tiết', /data-a="khumo" data-k="A"/.test(r('H0')));
  ok('chưa mở thì chưa có bảng chi tiết', !/Đang có/.test(r('H0')));

  r(`ACTIONS.khumo({ k: 'A' }); var H1 = vHome();`);
  ok('mở ra bảng chi tiết của đúng khu đó', /Đang có/.test(r('H1')));
  ok('và liệt kê phi đang có thép', /D8/.test(r('H1')) && /D10/.test(r('H1')));
  ok('phi không có thép thì không bày', !/>D14</.test(r('H1')), (r('H1').match(/>D\d+</g) || []).join(','));
  ok('chưa có báo cáo chờ thì nói rõ đây là số đã duyệt', /số đã duyệt/.test(r('H1')));
  ok('không bày cột "Khu báo" khi không có gì đang chờ', !/Khu báo/.test(r('H1')));

  /* Khu A báo số mới nhưng CHƯA được duyệt: tồn phải giữ nguyên số cũ, và bày thêm số khu báo
     đặt cạnh để thấy ngay sẽ đổi thành bao nhiêu. */
  r(`S.boot.counts = [
       { khu_id: 'A', phi_id: 'D10', v: 250, kind: 'dem', ts: 2000, duyet_v: null, duyet_ts: null },
       { khu_id: 'A', phi_id: 'D12', v: 0, kind: 'zero', ts: 2000, duyet_v: null, duyet_ts: null }
     ]; var H2 = vHome();
     // chỉ lấy riêng khối chi tiết của khu A, để khỏi khớp nhầm số ở phần khác của màn hình
     var CT2 = H2.slice(H2.indexOf('Đang có'), H2.indexOf('Tồn theo đường kính'));`);
  ok('có báo cáo chờ duyệt thì bày thêm cột Khu báo', /Khu báo/.test(r('CT2')));
  ok('tồn vẫn là số ĐÃ DUYỆT (300), chưa nhận số đang chờ (250)',
    /300 cây/.test(r('CT2')), (r('CT2').match(/\d+ cây/g) || []).join(','));
  ok('số khu báo và phần lệch bày ngay cạnh', /250 cây/.test(r('CT2')) && /−50 cây/.test(r('CT2')),
    (r('CT2').match(/\d+ cây[^<]*/g) || []).join(' | '));
  ok('và nói rõ số bên trái chưa tính báo cáo mới', /chưa tính báo cáo mới/.test(r('CT2')));
  ok('ô người đếm để trống thì ghi "để trống", không ghi 0 trơ', /để trống/.test(r('CT2')));

  // duyệt rồi: chi tiết tự hiện số mới, không còn cột chờ
  r(`S.boot.counts = S.boot.counts.map((c) => ({ ...c, duyet_v: c.v, duyet_ts: c.ts }));
     S.boot.eff = [{ khu_id: 'A', phi_id: 'D10', v: 250 }];
     indexBoot(S.boot); var H3 = vHome();
     var CT3 = H3.slice(H3.indexOf('Đang có'), H3.indexOf('Tồn theo đường kính'));`);
  ok('duyệt xong thì chi tiết hiện số mới', /250 cây/.test(r('CT3')), (r('CT3').match(/\d+ cây/g) || []).join(','));
  ok('và không còn cột Khu báo', !/Khu báo/.test(r('CT3')));

  /* khu không có thép: vẫn bày ĐỦ mọi đường kính, mỗi phi ghi 0 — người xem đối chiếu được từng
     dòng, không phải đoán "không thấy phi này là hết hay là quên" */
  r(`ACTIONS.khumo({ k: 'A' }); ACTIONS.khumo({ k: 'B' });
     S.boot.counts = []; S.boot.eff = []; S.boot.bm = {}; S.boot.mvn = {}; var H4 = vHome();`);
  ok('khu không có thép: vẫn bày đủ phi, ghi 0', /0\/3 phi có thép/.test(r('H4')) && (r('H4').match(/<span class="f1 sm">0<\/span>/g) || []).length >= 3, (r('H4').match(/\d+\/\d+ phi có thép/) || [''])[0]);
  r(`S.khuMo = {}; S.boot = _boot(); indexBoot(S.boot);`);

  /* ---- 1d-dc. ĐIỀU CHỈNH TỒN ----
     Phiếu điều chỉnh là loại đầu tiên có thể CHỈ GỒM DÒNG ÂM, nên mọi chỗ bày phiếu phải thôi
     giả định "phiếu luôn có ít nhất một dòng dương". Chỗ lọc qty > 0 rồi đọc pos[0] cho ra tiêu
     đề "Nhập vào undefined" với phần mô tả rỗng — phiếu hiện ra mà không ai biết nó là gì. */
  r(`S.boot = _boot(); indexBoot(S.boot);
     S.boot.receipts = [
       { id: 21, phi_id: 'D12', khu_id: 'A', qty: -30, note: 'Đếm sai kỳ trước', kind: 'dc', grp: 'x1', ts: Date.now(), user_id: 1, uname: 'A' },
       { id: 22, phi_id: 'D10', khu_id: 'B', qty: 25, note: 'Ghi nhầm phiếu', kind: 'dc', grp: 'x2', ts: Date.now(), user_id: 1, uname: 'A' },
     ];
     var G = receiptGroups(S.boot.receipts);`);
  ok('phiếu giảm có tiêu đề riêng, không gọi là "Nhập vào"', /Điều chỉnh/.test(r('G[0].title')) && !/Nhập vào/.test(r('G[0].title')), r('G[0].title'));
  ok('phiếu giảm không ra tiêu đề undefined', !/undefined/.test(r('G[0].title')), r('G[0].title'));
  ok('phiếu giảm có mô tả kèm dấu trừ', /−/.test(r('G[0].what')), r('G[0].what'));
  ok('phiếu tăng có mô tả kèm dấu cộng', /\+/.test(r('G[1].what')), r('G[1].what'));
  ok('khối lượng phiếu giảm là số âm', r('G[0].kg') < 0, r('G[0].kg'));
  ok('cờ dc được đặt', r('G[0].dc') === true && r('G[1].dc') === true);
  ok('màn Nhập vẽ được danh sách có phiếu điều chỉnh', /Điều chỉnh Khu A/.test(r(`S.nhap.mode='nhap'; vNhap()`)));

  // "đang có X → còn Y": chạy theo từng chữ số vừa gõ, nên phải đúng ở cả ba trạng thái
  ok('chưa gõ số: chỉ nói đang có bao nhiêu',
    /đang có/.test(r(`dcSauText(0, 40, 'giam', S.boot.phiBy.D12, 'D12')`)), r(`dcSauText(0, 40, 'giam', S.boot.phiBy.D12, 'D12')`));
  ok('giảm trong tầm: 40 → 10', /40 cây → 10 cây/.test(r(`dcSauText(30, 40, 'giam', S.boot.phiBy.D12, 'D12')`)), r(`dcSauText(30, 40, 'giam', S.boot.phiBy.D12, 'D12')`));
  ok('tăng: 40 → 70', /40 cây → 70 cây/.test(r(`dcSauText(30, 40, 'tang', S.boot.phiBy.D12, 'D12')`)), r(`dcSauText(30, 40, 'tang', S.boot.phiBy.D12, 'D12')`));
  ok('giảm quá số đang có: báo trước sẽ bị từ chối',
    /bị từ chối/.test(r(`dcSauText(90, 40, 'giam', S.boot.phiBy.D12, 'D12')`)), r(`dcSauText(90, 40, 'giam', S.boot.phiBy.D12, 'D12')`));

  /* Ba chế độ dùng CHUNG N.lines, nên đổi chế độ phải xoá các dòng đã gõ: một dòng gõ cho phiếu
     nhập mang nghĩa trái ngược khi nó nằm trong phiếu điều chỉnh giảm. Giữ lại là người dùng bấm
     sang "Điều chỉnh" rồi lưu luôn mấy dòng vừa gõ cho phiếu nhập, thành sửa sổ ngoài ý muốn. */
  EL.nqty = mkEl('nqty'); EL.nqty.value = '';
  r(`S.nhap.mode = 'nhap'; S.nhap.phi = 'D10'; S.nhap.lines = [{ phi: 'D10', qty: 50 }]; S.nhap.reason = null;
     ACTIONS.nmode({ v: 'dc' });`);
  ok('đổi sang Điều chỉnh thì xoá các dòng đã gõ', r('S.nhap.lines.length') === 0, JSON.stringify(r('S.nhap.lines')));
  ok('và đặt lại lý do', r('S.nhap.reason') === null);
  r(`S.nhap.lines = [{ phi: 'D10', qty: 7 }]; ACTIONS.nmode({ v: 'dc' });`);
  ok('bấm lại đúng chế độ đang mở thì KHÔNG xoá dòng', r('S.nhap.lines.length') === 1, JSON.stringify(r('S.nhap.lines')));

  // màn Điều chỉnh phải nói thẳng nó sửa sổ, và bày đủ bốn lý do
  r(`S.nhap.mode = 'dc'; S.nhap.khu = 'A'; S.nhap.phi = 'D12'; S.nhap.qty = 0; S.nhap.lines = []; var V = vNhap();`);
  ok('màn Điều chỉnh nói rõ là SỬA SỔ', /SỬA SỔ/.test(r('V')));
  ok('có bước chọn tăng/giảm', /Tăng tồn/.test(r('V')) && /Giảm tồn/.test(r('V')));
  ok('bày đủ bốn lý do', ['Đếm sai kỳ trước', 'Ghi nhầm phiếu', 'Hao hụt', 'Lý do khác'].every((x) => r('V').includes(x)));
  ok('nói khu đang có bao nhiêu để biết sửa từ đâu', /đang có/.test(r('V')));
  ok('nút lưu đổi chữ', /XÁC NHẬN ĐIỀU CHỈNH/.test(r('V')));

  /* Thiếu lý do thì chặn ngay trên máy, khỏi phải chờ một vòng mạng mới biết. Server vẫn kiểm
     lại — chỗ này chỉ cho nhanh, không phải chốt chặn. */
  EL.nqty.value = '5'; EL.nnote = mkEl('nnote'); EL.nnote.value = '';
  r(`S.nhap.reason = null; S.nhap.lines = []; S.toast = ''; ACTIONS.nconfirm();`);
  ok('chưa chọn lý do: chặn và nhắc', /lý do/i.test(r('S.toast')), r('S.toast'));
  r(`S.nhap.reason = 'khac'; S.nhap.lines = [{ phi: 'D12', qty: 5 }]; S.toast = ''; ACTIONS.nconfirm();`);
  ok('"Lý do khác" mà bỏ trống ghi chú: chặn', /ghi rõ/i.test(r('S.toast')), r('S.toast'));

  // Báo cáo kỳ: cột Điều chỉnh chỉ hiện khi kỳ đó thật có điều chỉnh
  r(`S.bc = { from: '${yday}', to: '${today}', data: { rows: [{ phi: 'D10', dau: 100, nhap: 0, dc: -30, dung: 20, cuoi: 50 }],
       days: [], closedDays: 1, openDay: '${yday}', closeDay: '${today}', hasDc: true } }; var R1 = vBaoCao();`);
  ok('kỳ có điều chỉnh: hiện cột Điều chỉnh', /Điều chỉnh/.test(r('R1')));
  ok('và số âm hiện kèm dấu trừ', /−30/.test(r('R1')), (r('R1').match(/.{0,20}30.{0,20}/) || [''])[0]);
  ok('nói rõ điều chỉnh không nằm trong Nhập và không tính vào Dùng', /không nằm trong cột Nhập/.test(r('R1')));
  r(`S.bc.data.hasDc = false; S.bc.data.rows[0].dc = 0; var R2 = vBaoCao();`);
  ok('kỳ không có điều chỉnh: bỏ hẳn cột cho đỡ chật', !/Điều chỉnh/.test(r('R2')));

  /* Phép tính trên màn Duyệt: r.inn là TỔNG (gồm điều chỉnh), nên in nguyên nó dưới chữ "Nhập" là
     nhãn nói sai — "+ Nhập −20" trong khi không có xe thép nào. Phải tách thành nhập thật và phần
     điều chỉnh, và tổng vẫn phải khớp đúng con số "Đã dùng". */
  r(`S.review = { day: '${today}', last: '${yday}', span: 1, closed: false,
       rows: [{ phi: 'D10', old: 560, inn: -20, dc: -20, cnt: 540, used: 0, neg: false, high: false, avg: 1, peak: 0, rateDays: 9, topKhu: 'A', topNet: 0 }],
       exceptions: [], khus: [], phieu: [], pending: 0, reports: [], khu: S.boot.khu };
     S.showNormal = true; var DV = vDuyet();`);
  ok('phép tính tách riêng hạng điều chỉnh', /\(đc\)/.test(r('DV')), (r('DV').match(/.{0,60}\(đc\).{0,20}/) || [''])[0]);
  /* Hạng "Nhập" phải là nhập THẬT = inn − dc = 0, không phải tổng −20. Và cả dòng phải còn đúng
     về số học: 560 + 0 − 20(đc) − 540 = 0. */
  ok('hạng "Nhập" hiện số nhập THẬT (0), không phải tổng −20',
    /560 cây \+ 0 cây − 20 cây\(đc\) − 540 cây = 0 cây/.test(r('DV').replace(/<[^>]*>/g, '')),
    (r('DV').replace(/<[^>]*>/g, '').match(/.{0,40}\(đc\).{0,20}/) || [''])[0]);
  r(`S.review.rows[0].dc = 0; S.review.rows[0].inn = 0; S.review.rows[0].cnt = 560; var DV2 = vDuyet();`);
  ok('phi không bị sửa sổ: dòng vẫn gọn như trước, không có hạng thêm', !/\(đc\)/.test(r('DV2')));
  // thẻ đỏ của phi bất thường cũng phải tách, và lưới đổi sang 5 ô cho khỏi tràn
  r(`S.review.rows[0] = { phi: 'D10', old: 560, inn: -20, dc: -20, cnt: 600, used: -40, neg: true, high: false, avg: 1, peak: 0, rateDays: 9, topKhu: 'A', topNet: 40 };
     var DV3 = vDuyet();`);
  ok('thẻ phi bất thường: có ô Điều chỉnh', /Điều chỉnh/.test(r('DV3')));
  ok('và lưới phép tính chuyển sang 5 ô', /class="eq eq5"/.test(r('DV3')));
  r(`S.showNormal = false; S.review = null;`);

  // Nhật ký: điều chỉnh là nhóm riêng, không gộp vào "Nhập kho"
  r(`var A1 = fmtAudit({ action: 'adjust', ts: Date.now(), user_name: 'A',
       detail: JSON.stringify({ khu: 'A', dir: 'giam', reason: 'dem_sai', note: 'kiểm kê lại', lines: [{ phi: 'D12', qty: -30 }] }) });`);
  ok('nhật ký nói rõ GIẢM', /GIẢM/.test(r('A1.text')), r('A1.text'));
  ok('và kèm lý do', /kiểm kê lại/.test(r('A1.text')), r('A1.text'));
  ok('xếp vào nhóm riêng "dc"', r('A1.type') === 'dc', r('A1.type'));
  /* Hủy phiếu điều chỉnh: dòng nhật ký phải kể ĐỦ CẢ DẤU. Lọc qty > 0 như phiếu nhập/chuyển là
     dòng ghi "hủy phiếu điều chỉnh tồn đã duyệt: " rồi hết — không nói được nó hoàn tác cái gì,
     mà nhật ký thì không ai sửa lại được. */
  r(`var A2 = fmtAudit({ action: 'receipt_void', ts: Date.now(), user_name: 'A',
       detail: JSON.stringify({ id: 9, kind: 'dc', lines: [{ phi: 'D12', khu: 'A', qty: -30 }] }) });`);
  ok('hủy phiếu điều chỉnh: gọi đúng tên', /điều chỉnh tồn/.test(r('A2.text')), r('A2.text'));
  ok('và vẫn kể được dòng âm', /D12/.test(r('A2.text')), r('A2.text'));
  r(`var A3 = fmtAudit({ action: 'receipt_void', ts: Date.now(), user_name: 'A',
       detail: JSON.stringify({ id: 9, kind: 'chuyen', lines: [{ phi: 'D12', khu: 'A', qty: -30 }, { phi: 'D12', khu: 'B', qty: 30 }] }) });`);
  ok('phiếu chuyển vẫn chỉ kể nửa dương, không nhân đôi khối lượng',
    (r('A3.text').match(/D12/g) || []).length === 1, r('A3.text'));
  r(`S.boot = _boot(); indexBoot(S.boot);`);

  /* ---- 1d-xuat. PHIẾU XUẤT (tự nguyện) ----
     Phiếu xuất cũng chỉ gồm dòng ÂM như phiếu điều chỉnh giảm, nên mọi chỗ bày phiếu phải thôi
     giả định "phiếu luôn có ít nhất một dòng dương". Nhưng khác điều chỉnh ở một điểm quyết định:
     xuất là thép ĐI THẬT, tức ĐÃ DÙNG, nên nó phải bị trừ ra khỏi vế "nhập" của phép tính
     "đã dùng". Để nguyên trong vế nhập thì nó tự triệt tiêu với phần khu đếm hụt và "đã dùng"
     tụt xuống chỉ còn phần không có phiếu — càng ghi phiếu đầy đủ thì con số càng sai. */
  r(`S.boot = _boot(); indexBoot(S.boot);
     S.boot.receipts = [
       { id: 31, phi_id: 'D12', khu_id: 'A', qty: -30, note: 'Xuất cho Công trình Nam Hà', kind: 'xuat', grp: 'y1', ts: Date.now(), user_id: 1, uname: 'A' },
     ];
     var GX = receiptGroups(S.boot.receipts);`);
  ok('phiếu xuất có tiêu đề riêng, không gọi là "Nhập vào"',
    /Xuất từ Khu A/.test(r('GX[0].title')) && !/Nhập vào/.test(r('GX[0].title')), r('GX[0].title'));
  ok('phiếu xuất không ra tiêu đề undefined', !/undefined/.test(r('GX[0].title')), r('GX[0].title'));
  ok('mô tả phiếu xuất kèm dấu trừ', /−/.test(r('GX[0].what')), r('GX[0].what'));
  ok('cờ xuat được đặt, và không nhận nhầm là dc', r('GX[0].xuat') === true && r('GX[0].dc') === false);
  ok('màn Nhập vẽ được danh sách có phiếu xuất', /Xuất từ Khu A/.test(r(`S.nhap.mode='nhap'; vNhap()`)));

  // màn Xuất kho: nói rõ là tuỳ chọn, và bắt buộc ghi nơi đến
  r(`S.nhap.mode = 'xuat'; S.nhap.khu = 'A'; S.nhap.phi = 'D12'; S.nhap.qty = 0; S.nhap.lines = []; var VX = vNhap();`);
  ok('màn Xuất kho nói rõ ghi phiếu là tuỳ chọn', /tuỳ bạn/.test(r('VX')));
  ok('có ô ghi xuất cho ai / công trình nào', /id="nnoi"/.test(r('VX')));
  ok('nói khu đang có bao nhiêu để biết xuất từ đâu', /đang có/.test(r('VX')));
  ok('nút lưu đổi chữ', /GHI PHIẾU XUẤT/.test(r('VX')));
  ok('không bày bước tăng/giảm của điều chỉnh', !/Tăng tồn/.test(r('VX')));
  // các bước phải đánh số liên tục, không nhảy số và không trùng số
  ok('các bước đánh số liên tục 1-2-3-4',
    ['1. Lấy thép từ khu', '2. Xuất cho ai', '3. Chọn phi', '4. Số cây xuất đi'].every((x) => r('VX').includes(x)),
    (r('VX').match(/\d\. [^<]{0,24}/g) || []).join(' | '));

  /* Bỏ trống nơi đến thì chặn ngay trên máy. Server vẫn kiểm lại — nhưng phiếu xuất không nói
     thép đi đâu thì không thêm được gì so với con số "đã dùng" app đã tự suy ra sẵn, tức nó là
     phiếu vô nghĩa, nên chặn sớm cho người gõ biết liền. */
  EL.nqty = mkEl('nqty'); EL.nqty.value = '5';
  EL.nnote = mkEl('nnote'); EL.nnote.value = '';
  EL.nnoi = mkEl('nnoi'); EL.nnoi.value = '';
  r(`S.nhap.lines = [{ phi: 'D12', qty: 5 }]; S.toast = ''; ACTIONS.nconfirm();`);
  ok('bỏ trống nơi đến: chặn và nhắc', /xuất cho ai/i.test(r('S.toast')), r('S.toast'));

  // đổi chế độ phải bỏ luôn nơi đến đã gõ, không để nó dính sang phiếu sau
  r(`S.form.nnoi = 'Công trình cũ'; ACTIONS.nmode({ v: 'nhap' });`);
  ok('đổi chế độ thì bỏ luôn nơi đến đã gõ', r('S.form.nnoi') === '', r('S.form.nnoi'));

  // thẻ phiếu chờ duyệt: phiếu xuất chỉ có dòng âm, lọc qty > 0 là thẻ hiện ra trống trơn
  r(`S.review = { day: '${today}', last: '${yday}', span: 1, closed: false, rows: [], exceptions: [],
       khus: [], pending: 1, reports: [], khu: S.boot.khu,
       phieu: [{ key: 'p31', id: 31, kind: 'xuat', day: '${today}', ts: Date.now(), uname: 'A',
                 note: 'Xuất cho Công trình Nam Hà', lines: [{ phi: 'D12', khu: 'A', qty: -30 }] }] };
     var DX = vDuyet();`);
  ok('thẻ phiếu xuất hiện đúng tên khu', /Xuất từ Khu A/.test(r('DX')), (r('DX').match(/Xuất từ[^<]*/) || [''])[0]);
  ok('và không hiện ra trống (vẫn kể được dòng âm)', /D12/.test(r('DX')));
  ok('nói thẳng duyệt là thép rời bãi', /rời bãi/.test(r('DX')));

  /* Phép tính trên màn Duyệt: r.inn là TỔNG, gồm cả phiếu xuất với dấu ÂM. In nguyên nó dưới chữ
     "Nhập" là hiện "+ Nhập −200" trong khi không có xe thép nào, mà phép tính cũng không cộng
     ra đúng số "Đã dùng" bên cạnh. Hạng Nhập phải là nhập THẬT, và phần có phiếu để riêng. */
  r(`S.review = { day: '${today}', last: '${yday}', span: 1, closed: false,
       rows: [{ phi: 'D10', old: 300, inn: -200, dc: 0, xuat: 200, cnt: 60, used: 240, neg: false, high: false, avg: 1, peak: 0, rateDays: 9, topKhu: 'A', topNet: 0 }],
       exceptions: [], khus: [], phieu: [], pending: 0, reports: [], khu: S.boot.khu };
     S.showNormal = true; var DX2 = vDuyet().replace(/<[^>]*>/g, '');`);
  ok('hạng "Nhập" hiện nhập THẬT (0), không phải tổng −200, và phép tính vẫn cộng ra 240',
    /300 cây \+ 0 cây − 60 cây = 240 cây/.test(r('DX2')), (r('DX2').match(/300 cây[^=]*= [^ ]+ cây[^|]{0,30}/) || [''])[0]);
  ok('và nêu riêng phần có phiếu xuất', /\(có phiếu 200 cây\)/.test(r('DX2')), (r('DX2').match(/\(có phiếu[^)]*\)/) || [''])[0]);
  r(`S.review.rows[0].xuat = 0; S.review.rows[0].inn = 0; var DX3 = vDuyet();`);
  ok('kỳ không có phiếu xuất: dòng vẫn gọn như trước', !/có phiếu/.test(r('DX3')));
  // thẻ đỏ phi bất thường: tách "có phiếu" và "không rõ", vì phần không rõ mới là chỗ đáng đi hỏi
  r(`S.review.rows[0] = { phi: 'D10', old: 300, inn: -200, dc: 0, xuat: 200, cnt: 60, used: 240, neg: false, high: true, avg: 1, peak: 0, rateDays: 9, topKhu: 'A', topNet: 0 };
     var DX4 = vDuyet().replace(/<[^>]*>/g, '');`);
  ok('thẻ phi bất thường tách phần có phiếu và phần không rõ',
    /200 cây có phiếu xuất, 40 cây không rõ đi đâu/.test(r('DX4')), (r('DX4').match(/Trong số đó[^.]*\./) || [''])[0]);
  r(`S.showNormal = false; S.review = null;`);

  /* Tổng quan cũng tự tính "đã dùng", nên nó phải trừ phần xuất ra khỏi vế nhập ĐÚNG NHƯ SERVER.
     Hai bên lệch nhau là hai màn hình nói hai con số khác nhau cho cùng một ngày. */
  r(`S.boot = _boot();
     S.boot.innKhu = [{ khu_id: 'A', phi_id: 'D10', kind: 'xuat', q: -50 }];
     S.boot.mvNew = [{ khu_id: 'A', phi_id: 'D10', q: -50 }];
     S.boot.eff = [{ khu_id: 'A', phi_id: 'D10', v: 250, day: '${today}', ts: Date.now() }];
     indexBoot(S.boot); var TT = totals();`);
  // tồn chuẩn A+B+Z của D10 = 300+100+70 = 470; đếm còn 250+100+70 = 420; có phiếu xuất 50
  ok('đã dùng ở Tổng quan là TỔNG lượng dùng (50), không phải phần không rõ (0)',
    r('TT.used.D10') === 50, r('TT.used.D10'));
  ok('và "Nhập hôm nay" không bị phiếu xuất kéo xuống âm', r('TT.inKg') === 0, r('TT.inKg'));
  r(`S.boot = _boot(); indexBoot(S.boot);`);

  // Báo cáo kỳ: cột "Có phiếu" chỉ hiện khi kỳ đó thật có phiếu xuất
  r(`S.bc = { from: '${yday}', to: '${today}', data: { rows: [{ phi: 'D10', dau: 100, nhap: 0, dc: 0, xuat: 12, dung: 20, cuoi: 80 }],
       days: [], closedDays: 1, openDay: '${yday}', closeDay: '${today}', hasXuat: true } }; var RX1 = vBaoCao();`);
  ok('kỳ có phiếu xuất: hiện cột Có phiếu', /Có phiếu/.test(r('RX1')));
  ok('nói rõ cột đó nằm TRONG cột Dùng, không cộng thêm', /nằm TRONG cột Dùng/.test(r('RX1')));
  r(`S.bc.data.hasXuat = false; S.bc.data.rows[0].xuat = 0; var RX2 = vBaoCao();`);
  ok('kỳ không ai ghi phiếu xuất: bỏ hẳn cột cho đỡ chật', !/Có phiếu/.test(r('RX2')));

  // Nhật ký: phải nói được thép đi đâu, vì đó là giá trị duy nhất của phiếu xuất
  r(`var AX = fmtAudit({ action: 'issue', ts: Date.now(), user_name: 'A',
       detail: JSON.stringify({ khu: 'A', noi: 'Công trình Nam Hà', ghi: 'xe 29C', note: 'Xuất cho Công trình Nam Hà: xe 29C', lines: [{ phi: 'D12', qty: 30 }] }) });`);
  ok('nhật ký nói rõ xuất cho đâu', /Công trình Nam Hà/.test(r('AX.text')), r('AX.text'));
  ok('và kèm ghi chú xe', /29C/.test(r('AX.text')), r('AX.text'));
  // nơi đến chỉ được nhắc MỘT lần: note của phiếu đã chứa sẵn nó nên không được in thêm
  ok('không nhắc nơi đến hai lần trong một dòng',
    (r('AX.text').match(/Nam Hà/g) || []).length === 1, r('AX.text'));
  r(`var AX2 = fmtAudit({ action: 'receipt_void', ts: Date.now(), user_name: 'A',
       detail: JSON.stringify({ id: 31, kind: 'xuat', lines: [{ phi: 'D12', khu: 'A', qty: -30 }] }) });`);
  ok('hủy phiếu xuất: gọi đúng tên', /xuất kho/.test(r('AX2.text')), r('AX2.text'));
  ok('và vẫn kể được dòng âm', /D12/.test(r('AX2.text')), r('AX2.text'));
  r(`S.boot = _boot(); indexBoot(S.boot); S.nhap.mode = 'nhap'; S.nhap.lines = []; S.form.nnoi = '';`);

  /* ---- 1f. KHÔNG CÒN MỞ LẠI NGÀY ĐÃ CHỐT ----
     Sổ tự chốt sau 0h: mở một ngày đã qua thì giờ sau hệ thống chốt lại ngay, nên màn Xem lại ngày
     cũ không còn nút mở lại. Sai số của ngày đã qua thì lập phiếu Điều chỉnh tồn. */
  const hist = (over) => `S.hist = { date: '${yday}', data: Object.assign({
      day: '${yday}', close: { uname: 'A', ts: Date.now(), note: '', span: 1 }, lastClose: '${yday}',
      counts: [{ khu_id: 'A', phi_id: 'D10', v: 300 }], baseline: [], prevBaseline: [],
      summary: [{ phi_id: 'D10', nhap: 0, dung: 20, dc: 0, xuat: 12 }],
      reports: [], receipts: [] }, ${over}) };`;
  r(`S.me = { id: 1, name: 'A', role: 'admin' }; S.uFirst = 1; ${hist('{}')} var L1 = vLichSu();`);
  ok('lịch sử: không còn nút mở lại ngày', !/data-a="hreopen"/.test(r('L1')) && !/MỞ LẠI NGÀY/.test(r('L1')));
  ok('nói luôn phần đã dùng có phiếu xuất', /có phiếu xuất/.test(r('L1')));
  ok('không còn thao tác mở lại ngày cũ', typeof r('ACTIONS.hreopen') === 'undefined');

  /* Bootstrap gửi sẵn id admin đầu tiên. Trước đây chỉ /users gửi, mà /users chỉ nạp khi vào đúng
     màn Người dùng — nên nút dành riêng cho chủ hệ thống biến mất ở những màn khác. */
  r(`S.uFirst = null; var BB = _boot(); BB.uFirst = 7; indexBoot(BB);`);
  ok('indexBoot nhận uFirst từ bootstrap', r('S.uFirst') === 7, r('S.uFirst'));
  r(`S.uFirst = 7; var BC = _boot(); delete BC.uFirst; indexBoot(BC);`);
  ok('bootstrap không gửi thì không xoá trắng giá trị đang có', r('S.uFirst') === 7, r('S.uFirst'));
  r(`S.hist = { date: '${yday}', data: null }; S.uFirst = 1; S.boot = _boot(); indexBoot(S.boot);`);

  // ---- 1d2. Đếm nhiều lần/ngày là BẮT BUỘC ----
  /* "Bây giờ là mấy giờ" lấy theo đồng hồ server (slot.now) chứ không theo máy: đặt now = 19h giờ
     Việt Nam rồi xem máy có nói thiếu buổi chiều không, bất kể đồng hồ của máy chạy test. */
  const slotBoot = (done, extra) => `var SB = _boot(); SB.slot = { n: 2, done: ${JSON.stringify(done)},
    now: Date.parse(SB.today + 'T19:00:00+07:00'),
    defs: [{ i: 0, from: 6, to: 12, label: 'buổi sáng (6h–12h)' }, { i: 1, from: 12, to: 18, label: 'buổi chiều (12h–18h)' }] };
    SB.settings.report_slots_per_day = 2;
    SB.reports = [{ khu_id: 'A', user_id: 2, uname: 'An', ts: Date.now(), conflict: 0, resolved: 0, recount: 0 }];
    ${extra || ''}
    indexBoot(SB); S.boot = SB; S.me = { id: 1, name: 'A', role: 'admin' };`;
  r(`${slotBoot({ A: [0] })} var H1 = vHome();`);
  ok('Tổng quan: khu thiếu buổi chiều có thẻ đỏ, câu ngắn', /Khu A thiếu buổi chiều<\/b>/.test(r('H1')), (r('H1').match(/thiếu buổi.{0,80}/) || [''])[0]);
  ok('thẻ nói lần đếm sau không bù được', /Không bù được/.test(r('H1')));
  ok('khu chưa báo hôm nay không bị nhắc trùng với thẻ "chưa báo"', !/Khu B thiếu buổi/.test(r('H1')));
  ok('nhãn khu đổi thành Thiếu lần đếm, không mang nhãn xanh', r('khuStatus(S.boot.khuBy.A).label') === 'Thiếu lần đếm', r('khuStatus(S.boot.khuBy.A).label'));
  r(`${slotBoot({ A: [0, 1] })} var H2 = vHome();`);
  ok('đủ hai khung: không nhắc', !/thiếu buổi/.test(r('H2')));
  r(`${slotBoot({ A: [0] }, 'SB.closed = true;')} var H3 = vHome();`);
  ok('ngày đã chốt: không nhắc nữa (không còn gửi số được)', !/thiếu buổi/.test(r('H3')));
  r(`${slotBoot({ A: [0] }, "SB.baseline = SB.baseline.filter((x) => x.khu_id !== 'A'); SB.innKhu = []; SB.mvNew = [];")} var H4 = vHome();`);
  ok('khu trống không bị đòi đếm', !/Khu A thiếu buổi/.test(r('H4')));
  r(`${slotBoot({ A: [0] }, 'SB.slot.now = Date.parse(SB.today + "T14:00:00+07:00");')} var H5 = vHome();`);
  ok('14h: buổi chiều chưa hết giờ nên chưa thiếu', !/thiếu buổi/.test(r('H5')));
  ok('màn chọn khu nói đang ở khung nào', /Đang buổi chiều \(12h–18h\): đã đếm 0\/2/.test(r('vKhu()')), r('vKhu()').slice(0, 300));
  r(`${slotBoot({ A: [0] })}`);
  ok('cài đặt nói rõ là bắt buộc', /bắt buộc/.test(r('vSettings()')));
  ok('cài đặt có chọn giờ làm', /id="s-from"/.test(r('vSettings()')) && /id="s-to"/.test(r('vSettings()')));
  ok('xem trước khung theo giờ đã lưu', /buổi sáng \(6h–12h\) · buổi chiều \(12h–18h\)/.test(r('slotPrevTxt()')), r('slotPrevTxt()'));
  // đang chọn (chưa lưu): xem trước đổi theo ngay
  r(`S.form.sfrom = '7'; S.form.sto = '17'; S.form.sslots = '3';`);
  ok('xem trước theo giờ đang chọn, chưa lưu', r('slotPrevTxt()').includes('lần 2 (10h20–13h40)'), r('slotPrevTxt()'));
  r(`S.form.sto = '9';`);
  ok('giờ làm không đủ: báo trước khi lưu', /không đủ cho 3 lần/.test(r('slotPrevTxt()')) && r('slotBad()') === true);
  calls.length = 0; r(`ACTIONS.ssave()`);
  ok('và không gửi lên server', !calls.some((c) => /\/api\/settings/.test(c.url)));
  r(`S.form.sto = '6';`);
  ok('giờ kết thúc trước giờ bắt đầu: báo lỗi', /phải sau giờ bắt đầu/.test(r('slotPrevTxt()')));
  r(`delete S.form.sfrom; delete S.form.sto; delete S.form.sslots;`);
  /* Bản chép công thức ở máy phải ra ĐÚNG nhãn server dựng: server là nơi tính khu thiếu khung
     nào, máy chỉ xem trước. Nhãn mẫu dưới đây chép từ kết quả server (mục 48 bộ test server). */
  ok('xem trước khớp công thức server: 7h–17h chia 3',
    JSON.stringify(r('slotPreview(3, 7, 17)')) === JSON.stringify(['lần 1 (7h–10h20)', 'lần 2 (10h20–13h40)', 'lần 3 (13h40–17h)']), JSON.stringify(r('slotPreview(3, 7, 17)')));
  ok('xem trước khớp công thức server: 6h–18h chia 2',
    JSON.stringify(r('slotPreview(2, 6, 18)')) === JSON.stringify(['buổi sáng (6h–12h)', 'buổi chiều (12h–18h)']));
  // bản cache cũ không có slot: coi như 1 lần/ngày, không nhắc gì và không vỡ
  r(`var SO = _boot(); delete SO.slot; indexBoot(SO); S.boot = SO;`);
  ok('bản cache cũ: không có khung nào', r('S.boot.nSlot') === 1 && r('slotNow()') === null);
  r(`S.boot = _boot(); indexBoot(S.boot); S.me = ${JSON.stringify(boot.user)};`);

  // ---- 1d3. Sổ vay mượn ngoài bãi ----
  r(`S.boot = _boot(); indexBoot(S.boot); S.me = { id: 1, name: 'A', role: 'admin' };
    S.loan = { doitac: null, kind: 'vay', phi: null, qty: 0, done: null, lines: [] };
    S.loans = {
      doitac: [{ id: 5, name: 'Cty Hoà Bình', active: 1 }, { id: 6, name: 'Cty Cũ', active: 0 }],
      items: [
        { id: 11, doitac_id: 5, doitac_name: 'Cty Hoà Bình', phi_id: 'D10', kind: 'vay', qty: 30, grp: 'g1', user_id: 2, uname: 'An', ts: Date.now(), duyet_ts: null },
        { id: 12, doitac_id: 5, doitac_name: 'Cty Hoà Bình', phi_id: 'D12', kind: 'vay', qty: 8, grp: 'g1', user_id: 2, uname: 'An', ts: Date.now(), duyet_ts: null },
        { id: 9, doitac_id: 5, doitac_name: 'Cty Hoà Bình', phi_id: 'D10', kind: 'cho_vay', qty: 20, grp: 'g0', user_id: 1, uname: 'A', ts: Date.now() - 864e5, duyet_ts: Date.now() - 864e5, duyet_uname: 'A' },
      ],
      agg: [{ doitac_id: 5, phi_id: 'D10', kind: 'vay', q: 100 }, { doitac_id: 5, phi_id: 'D10', kind: 'tra_vay', q: 40 }, { doitac_id: 5, phi_id: 'D10', kind: 'cho_vay', q: 20 }],
    }; S.screen = 'vaymuon';`);
  const VM = r('vVayMuon()');
  ok('vay mượn: dư nợ tính theo cặp (100 − 40 = 60 cây mình nợ)', /Mình nợ họ/.test(VM) && /D10 60 cây/.test(VM), (VM.match(/Mình nợ họ.{0,200}/) || [''])[0]);
  ok('vay mượn: họ nợ mình tính riêng', /Họ nợ mình/.test(VM) && /D10 20 cây/.test(VM));
  ok('vay mượn: ô tổng bãi đang nợ / đối tác đang giữ', /Bãi đang nợ đối tác/.test(VM) && /Đối tác đang giữ của bãi/.test(VM));
  ok('vay mượn: thẻ đối tác bấm được để xem chi tiết', /data-a="ldtview" data-id="5"/.test(VM));
  ok('vay mượn: một lần ghi hai phi gom thành MỘT dòng chờ duyệt', /Chờ duyệt \(1\)/.test(VM));
  ok('admin thấy nút duyệt', /data-a="lduyet"/.test(VM));
  ok('đối tác đã ẩn không có trong ô chọn để ghi', !/data-a="ldt" data-v="6"/.test(VM) && /data-a="ldt" data-v="5"/.test(VM));
  ok('thủ kho/admin: chọn được "thép qua bãi" (lập phiếu kho)', /data-a="lkho" data-v="1"/.test(VM) && /không<\/b> tính là nhập hay dùng/.test(VM));
  r(`S.me = { id: 2, name: 'An', role: 'nguoidem' };`);
  const VM2 = r('vVayMuon()');
  ok('người đếm: không có nút duyệt', !/data-a="lduyet"/.test(VM2));
  ok('người đếm: rút lại được lần ghi của mình', /data-a="lvoid" data-id="11">Rút lại/.test(VM2));
  ok('người đếm: không thấy danh bạ sửa/ẩn đối tác', !/data-a="ldthide"/.test(VM2));
  // ghi sổ: thép cuộn gõ theo cuộn, sổ lưu theo phần (bo_size phần = 1 cuộn)
  r(`S.me = { id: 1, name: 'A', role: 'admin' }; S.loan.doitac = 5; S.loan.kind = 'tra_vay'; S.loan.phi = 'D8'; S.loan.kho = false;`);
  // chưa tick hai ô xác nhận chứng từ: không cho ghi
  ctx._mk('lqty', '2'); ctx._mk('lnote', 'xe 15C');
  r(`S.ask = null; S.toast = ''; ACTIONS.lsave()`);
  ok('chưa tick biên bản + Zalo: không ghi, nhắc tick', !r('S.ask') && /biên bản giao nhận/.test(r('S.toast')), r('S.toast'));
  r(`ACTIONS.ltick({ v: 'bb' }); ACTIONS.ltick({ v: 'zl' });`);
  ok('tick đủ: nút ghi sổ sáng lên', /btn pri full" style="min-height:56px;font-size:18px" data-a="lsave"/.test(r('vVayMuon()')));
  ctx._mk('lqty', '2'); ctx._mk('lnote', 'xe 15C');
  calls.length = 0;
  r(`ACTIONS.lsave()`);
  ok('trả vượt số đang nợ: hộp xác nhận nhắc', /trả nhiều hơn số đang nợ/.test(r('S.ask ? S.ask.msg : ""')), r('S.ask ? S.ask.msg : ""'));
  r(`ACTIONS.askyes()`);
  await new Promise((res) => setImmediate(res));
  const post = calls.find((c) => c.url === '/api/loans' && c.method === 'POST');
  ok('gửi đúng đối tác, loại và đổi cuộn sang phần', post && post.body.doitac === 5 && post.body.kind === 'tra_vay' && JSON.stringify(post.body.lines) === JSON.stringify([{ phi: 'D8', qty: 22 }]) && post.body.note === 'xe 15C', JSON.stringify(post && post.body));
  ok('gửi kèm hai xác nhận chứng từ', post && post.body.bienban === true && post.body.zalo === true);
  ok('ghi xong: hai ô xác nhận về chưa tick (lần sau tick lại cho biên bản mới)', !r('S.loan.bb') && !r('S.loan.zl'));
  ok('nhật ký: dòng vay mượn có chữ, không hiện mã', /vay của Cty Hoà Bình: D10/.test(r(`fmtAudit({ action: 'loan_vay', detail: JSON.stringify({ doitac: 'Cty Hoà Bình', lines: [{ phi: 'D10', qty: 30 }] }) }).text`)));
  ok('nhật ký: có chip lọc Vay mượn', /data-v="vay">Vay mượn/.test(r('vNhatKy()')));
  r(`S.loans = null; S.boot = _boot(); indexBoot(S.boot); S.me = ${JSON.stringify(boot.user)}; S.screen = 'home';`);

  // ---- 1d4. Các lỗi giao diện cũ (lần rà soát đầu) ----
  const rc = (o) => JSON.stringify({ id: 1, phi_id: 'D10', khu_id: 'A', qty: 100, kind: 'nhap', grp: null, ts: Date.now(), user_id: 2, uname: 'Kho', day: today, duyet_day: null, duyet_ts: null, voided: 0, ...o });
  // B2: "Nhập hôm nay" chỉ tính phiếu nhập đã duyệt hôm nay
  r(`var RB = _boot(); RB.receipts = [${rc({ id: 1, qty: 100 })}, ${rc({ id: 2, qty: 50, duyet_day: today, duyet_ts: Date.now() })}, ${rc({ id: 3, qty: 70, day: yday })}];
    indexBoot(RB); S.boot = RB; S.me = { id: 1, name: 'A', role: 'admin' };`);
  ok('Nhập hôm nay: bỏ phiếu chờ duyệt, chỉ tính phiếu đã duyệt', Math.abs(r('totals().inKg') - 50 * 0.617) < 1e-6, r('totals().inKg'));
  // B3: người đếm không bị dẫn vào màn Nhập kho
  r(`S.me = { id: 9, name: 'B', role: 'nguoidem' };`);
  ok('người đếm: không thấy thẻ phiếu chờ (không lập, không duyệt phiếu)', !/data-s="nhap"/.test(r('vHome()')) && !/phiếu chờ duyệt/.test(r('vHome()')), (r('vHome()').match(/phiếu chờ duyệt.{0,80}/) || [''])[0]);
  ok('người đếm vào màn Nhập (Back, link cũ): chỉ thấy lời nhắc, không có form', /Chỉ thủ kho và admin/.test(r('vNhap()')) && !/data-a="nconfirm"/.test(r('vNhap()')));
  // B5: phiếu chờ duyệt của người KHÁC không phải "quá 10 phút"
  r(`S.me = { id: 7, name: 'Kho 2', role: 'thukho' };`);
  ok('thủ kho xem phiếu chờ của người khác: "chờ admin duyệt"', /chờ admin duyệt/.test(r('vNhap()')) && !/quá 10 phút/.test(r('vNhap()')));
  // B6: "còn lấy được" trừ phiếu rút thép đang chờ; xuất cũng báo đỏ khi vượt
  r(`var RX = _boot(); RX.receipts = [${rc({ id: 4, phi_id: 'D10', qty: -250, kind: 'xuat' })}]; indexBoot(RX); S.boot = RX; S.me = { id: 1, name: 'A', role: 'admin' };
    S.nhap.mode = 'xuat'; S.nhap.khu = 'A'; S.nhap.phi = 'D10'; S.nhap.lines = []; S.nhap.qty = 60;`);
  ok('còn lấy được = có 300 − 250 đang chờ xuất = 50', r("conLay('A', 'D10')") === 50, r("conLay('A', 'D10')"));
  const VX = r('vNhap()');
  ok('màn Xuất nói đã trừ phiếu khác đang chờ', /còn lấy được <b>50 cây<\/b>/.test(VX) && /đã trừ 250 cây phiếu khác đang chờ duyệt/.test(VX));
  ok('xuất vượt số còn lấy được: báo đỏ trước khi lưu', /quá số đang có/.test(VX));
  r(`S.nhap.mode = 'nhap'; S.nhap.qty = 0; S.boot = _boot(); indexBoot(S.boot);`);
  // B4: hộp xác nhận ẩn khu nói đúng luật
  r(`ACTIONS.khide({ k: 'A', v: '0' })`);
  ok('ẩn khu: nói trước là phải hết thép', /Chỉ ẩn được khi khu đã hết thép/.test(r('S.ask ? S.ask.msg : ""')));
  r(`ACTIONS.askno()`);
  // C1: số phiên bản
  ok('phiên bản 1.3', /phiên bản 1\.3/.test(r('vMore()')));

  // ---- 1d5. Rà soát sau bản 1.3 ----
  r(`S.boot = _boot(); indexBoot(S.boot); S.me = { id: 1, name: 'A', role: 'admin' };`);
  // A1: điều chỉnh TĂNG nói "đang có", giảm/xuất nói "còn lấy được"
  r(`S.nhap.mode = 'dc'; S.nhap.dir = 'tang'; S.nhap.khu = 'A'; S.nhap.phi = 'D10'; S.nhap.lines = []; S.nhap.qty = 0;`);
  ok('điều chỉnh tăng: nói "đang có", không nói "còn lấy được"', /A đang có <b>|Khu A đang có <b>/.test(r('vNhap()')) && !/còn lấy được/.test(r('vNhap()')));
  r(`S.nhap.dir = 'giam';`);
  ok('điều chỉnh giảm: "còn lấy được"', /còn lấy được/.test(r('vNhap()')));
  r(`S.nhap.mode = 'nhap';`);
  // A3: nhật ký duyệt sổ vay nói của ai, bao nhiêu; dòng cũ (chưa có đối tác) vẫn đọc được
  ok('nhật ký duyệt sổ vay: có đối tác và dòng', /duyệt sổ vay mượn: Cho Cty A vay: D10/.test(r(`fmtAudit({ action: 'loan_duyet', detail: JSON.stringify({ kind: 'cho_vay', doitac: 'Cty A', lines: [{ phi: 'D10', qty: 20 }] }) }).text`)));
  ok('dòng nhật ký cũ không có đối tác: vẫn đọc được', /duyệt sổ vay mượn: Mình vay$/.test(r(`fmtAudit({ action: 'loan_duyet', detail: JSON.stringify({ kind: 'vay' }) }).text`)));
  // A4: vào lại Cài đặt thì bỏ lựa chọn khung giờ chưa lưu
  r(`S.form.sslots = '3'; S.form.sfrom = '7';`);
  r(`go('settings')`);
  ok('vào lại Cài đặt: bỏ lựa chọn khung giờ chưa lưu', r('S.form.sslots') === undefined && r('S.form.sfrom') === undefined);
  // A5: màn Vay mượn tự cập nhật khi có thay đổi (rev khác)
  r(`S.screen = 'vaymuon'; S.loans = { doitac: [], items: [], agg: [] };`);
  calls.length = 0;
  await r('refresh()');
  ok('màn Vay mượn tự tải lại khi số liệu đổi', calls.some((c) => c.url === '/api/loans'), calls.map((c) => c.url).join(' '));
  r(`S.screen = 'home'; S.loans = null;`);
  // B2 (bảng so sánh hai người báo theo đơn vị) kiểm ở ui-render: duyet+so-sanh
  // B3: phụ đề Tồn bãi nói đúng con số đang hiện
  ok('Tồn bãi: phụ đề là tồn hiện tại, không phải tồn chuẩn', /Tồn hiện tại \(số đã duyệt\)/.test(r('vTon()')) && !/Tồn chuẩn chốt ngày/.test(r('vTon()')));
  // B4: bản sao CSV từ ngày đầu
  calls.length = 0;
  await r('ACTIONS.dlall()');
  ok('tải báo cáo từ ngày đầu: gửi from=dau', calls.some((c) => /\/api\/report\?format=csv&from=dau&to=/.test(c.url)), calls.map((c) => c.url).join(' '));
  // B5: nhật ký lọc theo ngày/chữ và tải thêm
  r(`S.auditF = { ngay: '${today}', q: 'Cty Á' }; S.audit = [{ id: 50 }, { id: 40 }];`);
  calls.length = 0;
  await r('loadAudit(true)');
  const au = calls.find((c) => c.url.indexOf('/api/audit?') === 0);
  ok('nhật ký: gửi ngày, chữ và trang cũ hơn', au && au.url.includes('ngay=${today}') === false && au.url.includes('ngay=' + today) && au.url.includes('q=' + encodeURIComponent('Cty Á')) && au.url.includes('before=40'), au && au.url);
  r(`S.audit = []; S.auditMore = false; S.screen = 'nhatky';`);
  ok('nhật ký: có ô ngày và ô tìm', /id="logday"/.test(r('vNhatKy()')) && /id="logq"/.test(r('vNhatKy()')));
  ok('nhật ký: nói đang lọc và cho bỏ lọc', /Đang lọc/.test(r('vNhatKy()')) && /data-a="logclear"/.test(r('vNhatKy()')));
  r(`S.auditF = { ngay: '', q: '' }; S.audit = null; S.screen = 'home';`);
  // B6: chỉ nhắc "Duyệt tất cả" khi nút đó có mặt (từ 2 khu chờ trở lên)
  ok('màn Duyệt không nhắc nút Duyệt tất cả khi nó không hiện', code.includes(`.length > 1 ? ', hoặc "Duyệt tất cả"' : ''`));
  // B7: ngưỡng dự phòng khớp server
  ok('ngưỡng điều chỉnh lớn dự phòng = 20 tấn như server', !code.includes("LIM('dcBigKg', 5000)"));

  // ---- 1d6. Nhắc đúng người, đúng lúc; sổ vay kèm phiếu kho; số liệu theo lúc chốt ----
  // khung ĐANG DIỄN RA (13h, buổi chiều) mà khu đã báo sáng chưa đếm chiều: nhắc, bấm mở thẳng khu đó
  r(`${slotBoot({ A: [0] }, 'SB.slot.now = Date.parse(SB.today + "T13:00:00+07:00");')} S.me = { id: 2, name: 'An', role: 'nguoidem' };`);
  const HN = r('vHome()');
  ok('người đếm: nhắc khung đang diễn ra', /Khu A chưa đếm buổi chiều<\/b><span class="sm">Còn tới 18h</.test(HN), (HN.match(/chưa đếm.{0,60}/) || [''])[0]);
  ok('thẻ nhắc mở thẳng khu đó', /data-s="dem" data-k="A"/.test(HN));
  r(`ACTIONS.nav({ s: 'dem', k: 'A' })`);
  ok('bấm thẻ: mở màn Đếm của đúng khu', r('S.khu') === 'A' && r('S.screen') === 'dem');
  ok('màn Đếm nói khu này chưa đếm khung đang diễn ra', /khu này chưa đếm/.test(r('demView()')));
  // khung ĐÃ HẾT mà thiếu: người đếm không làm gì được, nên không thấy thẻ đỏ; admin thì thấy
  r(`${slotBoot({ A: [0] })} S.me = { id: 2, name: 'An', role: 'nguoidem' };`);
  ok('người đếm: không thấy thẻ đỏ thiếu khung đã qua', !/thiếu buổi/.test(r('vHome()')));
  r(`S.me = { id: 1, name: 'A', role: 'admin' };`);
  ok('admin: vẫn thấy thẻ thiếu khung', /Khu A thiếu buổi/.test(r('vHome()')));
  r(`S.screen = 'home'; S.boot = _boot(); indexBoot(S.boot);`);

  // Cài đặt: 1 lần/ngày thì không bày ô giờ làm; khi đó lưu không gửi giờ làm
  r(`S.form.sslots = '1';`);
  ok('1 lần/ngày: không có ô giờ làm', !/id="s-from"/.test(r('vSettings()')));
  r(`S.form.sslots = '2';`);
  ok('2 lần/ngày: có ô giờ làm', /id="s-from"/.test(r('vSettings()')));
  r(`delete S.form.sslots;`);

  // sổ vay: thủ kho chọn "thép qua bãi" + khu, gửi kèm khu; người đếm thì chỉ ghi sổ
  r(`S.me = { id: 7, name: 'Kho', role: 'thukho' }; S.screen = 'vaymuon';
    S.loan = { doitac: 5, kind: 'cho_vay', phi: 'D10', qty: 0, done: null, lines: [], kho: true, khu: 'A', bb: true, zl: true };
    S.loans = { doitac: [{ id: 5, name: 'Cty A', active: 1 }], items: [], agg: [] };`);
  const VK = r('vVayMuon()');
  ok('thủ kho: có lựa chọn thép qua bãi và chọn khu', /data-a="lkho"/.test(VK) && /data-a="lkhu" data-v="A"/.test(VK));
  ok('cho vay qua bãi: nói còn lấy được bao nhiêu', /còn lấy được 300 cây D10/.test(VK), (VK.match(/còn lấy được.{0,30}/) || [''])[0]);
  ctx._mk('lqty', '30'); ctx._mk('lnote', '');
  calls.length = 0;
  r(`ACTIONS.lsave()`);
  ok('hộp xác nhận nói kèm phiếu kho', /Kèm phiếu kho: thép rời Khu A/.test(r('S.ask ? S.ask.msg : ""')));
  r(`ACTIONS.askyes()`);
  await new Promise((res) => setImmediate(res));
  r(`S.me = { id: 7, name: 'Kho', role: 'thukho' };`);
  const pl = calls.find((c) => c.url === '/api/loans' && c.method === 'POST');
  ok('gửi kèm khu', pl && pl.body.khu === 'A' && pl.body.kind === 'cho_vay', JSON.stringify(pl && pl.body));
  r(`S.me = { id: 2, name: 'An', role: 'nguoidem' };`);
  ok('người đếm: không có lựa chọn phiếu kho', !/data-a="lkho"/.test(r('vVayMuon()')));
  // dư nợ âm (trả dư) nói đúng nghĩa
  r(`S.loans = { doitac: [{ id: 5, name: 'Cty A', active: 1 }], items: [], agg: [{ doitac_id: 5, phi_id: 'D10', kind: 'tra_vay', q: 10 }] };`);
  ok('trả dư: nói là trả dư, không nói "mình nợ họ" số âm', /Mình trả dư/.test(r('vVayMuon()')) && !/Mình nợ họ/.test(r('vVayMuon()')), (r('vVayMuon()').match(/.{0,80}(Mình nợ họ|trả dư).{0,80}/g) || []).join(' || '));
  // quá 7 ngày sau duyệt: admin không còn nút huỷ, có lời giải thích
  r(`S.me = { id: 1, name: 'A', role: 'admin' }; S.loans.items = [{ id: 3, doitac_id: 5, doitac_name: 'Cty A', phi_id: 'D10', kind: 'vay', qty: 5, grp: 'g9', user_id: 2, uname: 'An', ts: Date.now() - 9 * 864e5, duyet_ts: Date.now() - 8 * 864e5, kho: 'A' }];`);
  const V7 = r('vVayMuon()');
  ok('quá 7 ngày: không còn nút huỷ', !/data-a="lvoid" data-id="3"/.test(V7) && /quá 7 ngày/.test(V7));
  ok('thẻ lần ghi nói kèm phiếu kho', /kèm phiếu kho Khu A/.test(V7));
  r(`S.loans = null; S.screen = 'home'; S.loan = { doitac: null, kind: 'vay', phi: null, qty: 0, done: null };`);

  // màn Nhập có lối tắt sang sổ vay
  ok('màn Nhập: lối tắt sang Vay mượn', /data-s="vaymuon"/.test(r('vNhap()')));
  // Xem lại ngày cũ: ngày chốt kèm việc còn treo thì nói ra
  ok('xem lại ngày cũ: nói việc còn treo lúc chốt', /Lúc chốt còn: Khu A thiếu lần đếm buổi chiều/.test(r(`treoTxt(JSON.stringify([{ type: 'slot_missing', khu: 'A', missing: ['buổi chiều (12h–18h)'] }]))`)));
  // Thống kê: số tấn theo kg lúc chốt, và tách phần có phiếu xuất
  r(`S.usage = [{ day: '${yday}', span: 1, used: { D10: 100 }, kg: { D10: 1 }, xuat: { D10: 40 } }]; S.screen = 'stats';`);
  const ST = r('vStats()');
  ok('thống kê: tấn theo kg lúc chốt (100 cây × 1 kg)', /Tổng dùng<\/b><b>0,10 tấn/.test(ST), (ST.match(/Tổng dùng.{0,40}/) || [''])[0]);
  ok('thống kê: tách phần có phiếu xuất', /trong đó 40 cây có phiếu xuất/.test(ST));
  r(`S.usage = null; S.screen = 'home';`);

  // ---- 1d7. Nhiều người dùng chung một điện thoại ----
  /* Hàng chờ gửi lại và nháp đếm dở là của NGƯỜI ĐÃ ĐẾM, không phải của máy. App chỉ tự gửi báo cáo
     của người đang đăng nhập; báo cáo của người khác nằm chờ chính người đó, không gửi dưới tên
     người khác, và người khác cũng không xoá được. */
  r(`S.boot = _boot(); indexBoot(S.boot); S.me = { id: 1, name: 'A', role: 'admin' }; S.screen = 'home';
    writePending([
      { khu: 'A', day: S.boot.today, items: [], ts: 501, uid: 2, uname: 'An' },
      { khu: 'B', day: S.boot.today, items: [], ts: 502, uid: 1, uname: 'A' },
    ]);`);
  calls.length = 0;
  await r('flushPending()');
  r(`S.me = { id: 1, name: 'A', role: 'admin' };`);
  const gui = calls.filter((c) => c.url === '/api/counts');
  ok('chỉ tự gửi báo cáo của người đang đăng nhập', gui.length === 1 && gui[0].body.khu === 'B', JSON.stringify(gui.map((c) => c.body.khu)));
  ok('báo cáo của người khác vẫn nằm trong hàng chờ', r('readPending().length') === 1 && r('readPending()[0].uid') === 2);
  const PH = r('pendingHtml()');
  ok('báo cáo của người khác: nói đang chờ chính người đó', /Báo cáo Khu A của An/.test(PH) && /Chờ An đăng nhập lại/.test(PH), PH.slice(0, 200));
  ok('và không có nút gửi hay bỏ cho người đang đăng nhập', !/data-a="pendsend"/.test(PH) && !/data-a="pendrm"/.test(PH));
  r(`S.ask = null; ACTIONS.pendrm({ j: 'A|${today}|501' });`);
  ok('không bỏ được báo cáo người khác bằng khoá của nó', !r('S.ask') && r('readPending().length') === 1);
  // An đăng nhập lại: báo cáo của An tự gửi
  r(`S.me = { id: 2, name: 'An', role: 'nguoidem' };`);
  calls.length = 0;
  await r('flushPending()');
  r(`S.me = { id: 2, name: 'An', role: 'nguoidem' };`);
  ok('đúng người đăng nhập lại thì tự gửi', calls.some((c) => c.url === '/api/counts' && c.body.khu === 'A') && r('readPending().length') === 0);
  // báo cáo lưu từ bản cũ (chưa có uid): giữ cách cũ, coi là của người đang đăng nhập
  r(`writePending([{ khu: 'A', day: S.boot.today, items: [], ts: 503 }]);`);
  ok('báo cáo bản cũ chưa có người đếm: vẫn gửi được như trước', r('readPending().filter(ofMe).length') === 1);
  r(`writePending([]);`);

  // nháp đếm dở tách theo người
  r(`S.me = { id: 2, name: 'An', role: 'nguoidem' }; S.khu = 'A'; S.draft = { cells: { D10: { v: 77, kind: 'dem', bo: 7, le: 7 } }, baseTs: 0 }; saveDraft();`);
  r(`S.me = { id: 3, name: 'Bình', role: 'nguoidem' }; S.khu = 'A'; loadDraft();`);
  ok('người sau mở cùng khu: không thấy nháp của người trước', r("S.draft.cells.D10 === undefined"), r('JSON.stringify(S.draft.cells)'));
  r(`S.me = { id: 2, name: 'An', role: 'nguoidem' }; loadDraft();`);
  ok('đúng người mở lại: nháp còn nguyên', r("S.draft.cells.D10 && S.draft.cells.D10.v") === 77);
  ok('khu mở lần trước cũng nhớ theo người', r('lastKhuKey()') === 'kt:lastKhu:2');

  // thẻ "chưa báo": người đếm chỉ thấy khu mình đếm được; admin thấy cả bãi
  r(`var SK = _boot(); SK.khuUser = [{ khu_id: 'B', user_id: 99 }]; indexBoot(SK); S.boot = SK; S.me = { id: 2, name: 'An', role: 'nguoidem' };`);
  const HK = r('vHome()');
  ok('người đếm: thẻ chưa báo chỉ có khu mình', /Khu A chưa báo/.test(HK) && !/Khu B/.test((HK.match(/chưa báo<\/b><span class="sm">[^<]*/) || [''])[0]), (HK.match(/<b[^>]*>[^<]*chưa báo<\/b><span class="sm">[^<]*/) || [''])[0]);
  r(`S.me = { id: 1, name: 'A', role: 'admin' };`);
  ok('admin: thẻ chưa báo có cả bãi', /2 khu chưa báo/.test(r('vHome()')));

  // admin không đi đếm: không nhận lời nhắc "chưa đếm khung đang diễn ra", trừ khu chính họ được gán
  r(`${slotBoot({ A: [0] }, 'SB.slot.now = Date.parse(SB.today + "T13:00:00+07:00");')} S.me = { id: 1, name: 'A', role: 'admin' };`);
  ok('admin: không bị nhắc đếm khu không gán cho mình', !/chưa đếm buổi chiều/.test(r('vHome()')));
  r(`${slotBoot({ A: [0] }, 'SB.slot.now = Date.parse(SB.today + "T13:00:00+07:00"); SB.khuUser = [{ khu_id: "A", user_id: 1 }];')} S.me = { id: 1, name: 'A', role: 'admin' };`);
  ok('admin được gán khu A: có nhắc', /Khu A chưa đếm buổi chiều/.test(r('vHome()')));

  // bảng gán người phụ trách không bày tài khoản đang khoá
  r(`S.boot = _boot(); indexBoot(S.boot); S.me = { id: 1, name: 'A', role: 'admin' };
    S.users = [{ id: 2, name: 'An', role: 'nguoidem', locked: 0, deleted: 0 }, { id: 4, name: 'Đã Khoá', role: 'nguoidem', locked: 1, deleted: 0 }];
    S.kuEdit = 'A'; S.kuPick = [];`);
  const KP = r('vSettings()');
  ok('gán khu: không có tài khoản đang khoá', /data-a="kupick" data-v="2"/.test(KP) && !/data-a="kupick" data-v="4"/.test(KP));
  r(`S.kuEdit = null; S.users = null; S.screen = 'home';`);

  // ---- 1d8. Thẻ khu ở Tổng quan; chi tiết công nợ một đối tác ----
  // thẻ khu: đủ mọi đường kính (kể cả 0), và nút đếm/báo cáo cho người đếm được khu đó
  r(`S.boot = _boot(); indexBoot(S.boot); S.me = { id: 2, name: 'An', role: 'nguoidem' }; S.khuMo = { A: true }; S.screen = 'home';`);
  const HKA = r('vHome()');
  ok('thẻ khu: bày đủ mọi phi', ['D8', 'D10', 'D12'].every((ph) => new RegExp('<b style="width:44px">' + ph + '</b>').test(HKA)));
  ok('thẻ khu: có nút báo cáo, mở thẳng khu đó', /data-s="dem" data-k="A">BÁO CÁO/.test(HKA));
  r(`S.boot.closed = true;`);
  ok('ngày đã khoá: không có nút báo cáo', !/data-s="dem" data-k="A">BÁO CÁO/.test(r('vHome()')));
  r(`S.boot.closed = false; S.boot.ku = { A: [99] };`);
  ok('khu người khác phụ trách: không có nút báo cáo', !/data-s="dem" data-k="A">BÁO CÁO/.test(r('vHome()')));
  r(`S.boot = _boot(); indexBoot(S.boot); S.khuMo = {};`);

  // chi tiết một đối tác
  calls.length = 0;
  r(`S.me = { id: 1, name: 'A', role: 'admin' }; ACTIONS.ldtview({ id: '5' });`);
  ok('bấm thẻ đối tác: mở màn chi tiết và tải đúng đối tác', r('S.screen') === 'vaychitiet' && r('S.loanDt') === 5 && calls.some((c) => c.url === '/api/loans?doitac=5'), calls.map((c) => c.url).join(' '));
  await new Promise((res) => setImmediate(res));
  r(`S.me = { id: 1, name: 'A', role: 'admin' }; S.screen = 'vaychitiet'; S.loanDt = 5;
    S.loanDetail = { chiTiet: true, doitac: [{ id: 5, name: 'Cty Hoà Bình', active: 1 }],
      agg: [{ phi_id: 'D10', kind: 'vay', q: 100 }, { phi_id: 'D10', kind: 'tra_vay', q: 40 }, { phi_id: 'D12', kind: 'cho_vay', q: 16 }],
      items: [
        { id: 21, doitac_id: 5, doitac_name: 'Cty Hoà Bình', phi_id: 'D10', kind: 'tra_vay', qty: 40, grp: 'b2', user_id: 2, uname: 'An', ts: Date.now(), duyet_ts: null, voided: 0 },
        { id: 20, doitac_id: 5, doitac_name: 'Cty Hoà Bình', phi_id: 'D10', kind: 'vay', qty: 5, grp: 'b1', user_id: 2, uname: 'An', ts: Date.now() - 864e5, duyet_ts: null, voided: 1 },
        { id: 19, doitac_id: 5, doitac_name: 'Cty Hoà Bình', phi_id: 'D10', kind: 'vay', qty: 100, grp: 'b0', user_id: 2, uname: 'An', ts: Date.now() - 2 * 864e5, duyet_ts: Date.now() - 2 * 864e5, voided: 0 },
      ] };`);
  const CT = r('vVayChiTiet()');
  ok('chi tiết: bảng mình vay (đã vay / đã trả / còn nợ)', /Mình vay của họ/.test(CT) && /<td>100 cây<\/td><td>40 cây<\/td><td><b[^>]*>60 cây/.test(CT), (CT.match(/Mình vay của họ.{0,300}/) || [''])[0]);
  ok('chi tiết: bảng họ mượn của mình', /Họ mượn của mình/.test(CT) && /D12/.test(CT));
  ok('chi tiết: lần ghi chờ duyệt có nút duyệt', /Chờ duyệt \(1\)/.test(CT) && /data-a="lduyet" data-id="21"/.test(CT));
  ok('chi tiết: lịch sử có cả lần đã huỷ, gạch ngang, không có nút', /Đã huỷ/.test(CT) && /1 đã huỷ/.test(CT) && !/data-id="20"/.test(CT));
  ok('chi tiết: nút ghi sổ với đối tác này', /data-a="ldtghi" data-id="5"/.test(CT));
  r(`ACTIONS.ldtghi({ id: '5' });`);
  ok('ghi sổ với đối tác này: về form, chọn sẵn đối tác', r('S.screen') === 'vaymuon' && r('S.loan.doitac') === 5);
  await new Promise((res) => setImmediate(res));
  r(`S.me = { id: 1, name: 'A', role: 'admin' }; S.loans = null; S.loanDetail = null; S.screen = 'home'; S.boot = _boot(); indexBoot(S.boot);`);

  // ---- 1d9. Biết khi có bản app mới; ô số lượng vay mượn giống màn Nhập ----
  {
    // dấu (ETag) của /app.js: lần đầu ghi lại, lần sau khác thì bật dải "có bản mới"
    const goc = ctx.fetch;
    let tag = '"a1"';
    ctx.fetch = (url, opt) => (url === '/app.js' && opt && opt.method === 'HEAD'
      ? Promise.resolve({ ok: true, headers: { get: (h) => (h === 'ETag' ? tag : null) } })
      : goc(url, opt));
    r(`S.boot = _boot(); indexBoot(S.boot); S.me = { id: 1, name: 'A', role: 'admin' }; S.screen = 'home'; S.newVer = false; appTag = null;`);
    await r('checkVer(0)');
    ok('lần hỏi đầu: chỉ ghi dấu, không báo', !r('S.newVer'));
    await r('checkVer(0)');
    ok('cùng dấu: không báo', !r('S.newVer'));
    tag = '"b2"';
    await r('checkVer()');
    ok('chưa đủ 5 phút: không hỏi lại', !r('S.newVer'));
    await r('checkVer(0)');
    ok('dấu khác: bật dải có bản mới', r('S.newVer') === true);
    r(`S.me = { id: 1, name: 'A', role: 'admin' };`);
    ok('dải có bản mới hiện trên mọi màn, bấm để tải lại', /data-a="reloadapp"[^>]*>Có bản mới của app/.test(r('vMain()')), r('vMain()').slice(0, 300));
    ctx.fetch = goc;
    r(`S.newVer = false; appTag = null;`);
  }
  // server báo máy đang dùng bản cũ (old_app): bật dải ngay
  {
    const goc = ctx.fetch;
    ctx.fetch = (url, opt) => (String(url).indexOf('/api/loans') === 0
      ? Promise.resolve({ ok: false, status: 409, json: () => Promise.resolve({ error: 'Bản app trên máy đã cũ', code: 'old_app' }) })
      : goc(url, opt));
    r(`S.newVer = false;`);
    await r(`api('POST', '/loans', {}).catch(() => {})`);
    ok('server trả old_app: bật dải có bản mới', r('S.newVer') === true);
    ctx.fetch = goc;
    r(`S.newVer = false;`);
  }
  // ô số lượng ở màn Vay mượn: bộ nút giống màn Nhập kho, có dòng quy đổi kg/tấn
  r(`S.me = { id: 7, name: 'Kho', role: 'thukho' }; S.screen = 'vaymuon'; S.form.lqty = '';
    S.loan = { doitac: 5, kind: 'vay', phi: 'D10', qty: 0, done: null, lines: [], kho: false };
    S.loans = { doitac: [{ id: 5, name: 'Cty A', active: 1 }, { id: 6, name: 'Cty Đã Xong', active: 1 }], items: [], agg: [{ doitac_id: 5, phi_id: 'D10', kind: 'vay', q: 10 }] };`);
  const VQ = r('vVayMuon()');
  ok('vay mượn: có đủ −10 −1 +1 +10 như màn Nhập', ['-10', '-1', '1', '10'].every((v) => VQ.includes(`data-a="lq" data-v="${v}"`)));
  ok('vay mượn: có +1 bó và dòng quy đổi kg', /data-a="lq" data-v="bo">\+1 bó \(10\)/.test(VQ) && /id="lkg"/.test(VQ));
  ctx._mk('lqty', '5');
  r(`ACTIONS.lq({ v: '10' })`);
  ok('+10: cộng vào số đang gõ', r('S.form.lqty') === '15', r('S.form.lqty'));
  ctx._mk('lqty', r('S.form.lqty'));
  r(`ACTIONS.lq({ v: 'bo' })`);
  ok('+1 bó: cộng đúng số cây một bó', r('S.form.lqty') === '25', r('S.form.lqty'));
  ctx._mk('lqty', '3');
  r(`ACTIONS.lq({ v: '-10' })`);
  ok('−10 khi đang 3: về 0, không âm', r('S.form.lqty') === '', r('S.form.lqty'));
  r(`S.form.lqty = '';`);
  // đối tác đã tất toán: vẫn là dòng bấm được, ghi rõ "Xem chi tiết"
  ok('đối tác đã tất toán: dòng có "Xem chi tiết"', /data-a="ldtview" data-id="6"><span>Cty Đã Xong<\/span><span[^>]*>Xem chi tiết ›/.test(VQ), (VQ.match(/data-id="6".{0,160}/) || [''])[0]);
  r(`S.loans = null; S.screen = 'home'; S.loan = { doitac: null, kind: 'vay', phi: null, qty: 0, done: null };`);

  // ---- 1d10. Nhắc ĐÚNG NGƯỜI phụ trách ----
  /* Khu A giao cho An (id 2). Khu B chưa giao ai, nên ai cũng đếm được, ai cũng được nhắc. Bình (id 3)
     không phụ trách A thì không được nhắc gì về A. */
  const nhacBoot = (extra) => `var NB = _boot(); NB.khuUser = [{ khu_id: 'A', user_id: 2, name: 'An' }];
    NB.lastClosed = '${yday}'; ${extra || ''} indexBoot(NB); S.boot = NB; S.screen = 'home';`;
  const theNhac = (h) => (h.match(/<b style="font-size:17px">[^<]*<\/b><span class="sm">[^<]*/g) || []).join(' || ');
  r(`${nhacBoot()} S.me = { id: 2, name: 'An', role: 'nguoidem' };`);
  ok('An (phụ trách A): được nhắc A, và B vì B chưa giao ai', /2 khu chưa báo<\/b><span class="sm">Khu A, Khu B/.test(r('vHome()')), theNhac(r('vHome()')));
  r(`S.me = { id: 3, name: 'Bình', role: 'nguoidem' };`);
  const HB = r('vHome()');
  ok('Bình (không phụ trách A): không bị nhắc A', /Khu B chưa báo/.test(HB) && !/Khu A/.test(theNhac(HB)), theNhac(HB));
  ok('một khu chưa báo: bấm mở thẳng khu đó', /data-s="dem" data-k="B"/.test(HB));
  r(`S.me = { id: 1, name: 'A', role: 'admin' };`);
  const HA = r('vHome()');
  ok('admin: thẻ chưa báo nói ai phụ trách từng khu', /Khu A \(An\) · Khu B \(chưa giao ai\)/.test(HA), theNhac(HA));
  ok('admin: được nhắc có khu chưa giao người phụ trách', /1 khu chưa giao người phụ trách<\/b><span class="sm">Khu B/.test(HA) && /data-s="settings"/.test(HA));
  // khu trống (không tồn, không phiếu, chưa đếm ra gì) thì không bị nhắc báo — khớp với server
  r(`${nhacBoot("NB.baseline = NB.baseline.filter((x) => x.khu_id !== 'B');")} S.me = { id: 1, name: 'A', role: 'admin' };`);
  ok('khu trống: không bị nhắc chưa báo', !/Khu B \(/.test(r('vHome()')) && /Khu A chưa báo/.test(r('vHome()')), theNhac(r('vHome()')));
  // ngày đầu tiên (chưa có tồn chuẩn nào): khu nào cũng phải báo để lập sổ
  r(`${nhacBoot("NB.baseline = []; NB.innKhu = []; NB.mvNew = [];")} NB.lastClosed = null; S.me = { id: 1, name: 'A', role: 'admin' };`);
  ok('ngày đầu tiên: nhắc mọi khu', /2 khu chưa báo/.test(r('vHome()')), theNhac(r('vHome()')));

  // yêu cầu đếm lại / hai người báo khác số: chỉ người liên quan thấy; đếm lại mở thẳng khu
  const repA = (o) => `NB.reports = [{ khu_id: 'A', user_id: 2, uname: 'An', ts: Date.now(), conflict: 0, resolved: 0, recount: 0, ...${o} }];`;
  r(`${nhacBoot(repA('{ recount: 1 }'))} S.me = { id: 3, name: 'Bình', role: 'nguoidem' };`);
  ok('đếm lại khu A: Bình không thấy', !/cần đếm lại/.test(r('vHome()')));
  r(`S.me = { id: 2, name: 'An', role: 'nguoidem' };`);
  ok('đếm lại khu A: An thấy, bấm mở thẳng khu A', /Khu A cần đếm lại/.test(r('vHome()')) && /data-s="dem" data-k="A"><span class="f1 col" style="gap:2px"><b style="font-size:17px">Khu A cần đếm lại/.test(r('vHome()')));
  r(`${nhacBoot(repA('{ conflict: 1 }'))} S.me = { id: 3, name: 'Bình', role: 'nguoidem' };`);
  // (thẻ KHU bên dưới vẫn ghi trạng thái cho mọi người xem — đó là thông tin; ở đây chỉ xét THẺ NHẮC)
  ok('hai người báo khác số ở A: Bình không bị nhắc', !/2 người báo số khác nhau/.test(theNhac(r('vHome()'))), theNhac(r('vHome()')));

  // báo cáo chưa duyệt CHUYỂN từ hôm qua: chỉ là "chưa báo hôm nay", không nhắc trùng thiếu khung
  r(`${slotBoot({}, 'SB.slot.now = Date.parse(SB.today + "T13:00:00+07:00"); SB.reports = [{ khu_id: "A", user_id: 2, uname: "An", ts: Date.now() - 864e5, conflict: 0, resolved: 0, recount: 0 }];')} S.me = { id: 1, name: 'A', role: 'admin' };`);
  const HC = r('vHome()');
  ok('báo cáo chuyển từ hôm qua: không nhắc thiếu khung trùng với "chưa báo"', /Khu A/.test(theNhac(HC)) && !/Khu A thiếu buổi/.test(HC) && !/Khu A chưa đếm buổi/.test(HC), theNhac(HC));
  ok('và không tính là đã báo hôm nay', r(`daBaoHomNay('A')`) === false);

  // sổ vay chờ duyệt: admin MỘT thẻ (không trùng); người khác không thấy số của cả bãi
  r(`${nhacBoot('NB.loanPending = 2;')} S.me = { id: 1, name: 'A', role: 'admin' };`);
  ok('admin: một thẻ sổ vay chờ duyệt, không trùng', (r('vHome()').match(/vay mượn chờ duyệt|vay\/mượn chờ duyệt/g) || []).length === 1);
  r(`S.me = { id: 2, name: 'An', role: 'nguoidem' };`);
  ok('người đếm: không thấy số sổ vay chờ duyệt của cả bãi', !/vay mượn chờ duyệt|vay\/mượn chờ duyệt/.test(r('vHome()')));
  r(`S.boot = _boot(); indexBoot(S.boot); S.me = { id: 1, name: 'A', role: 'admin' };`);

  // ---- 1d11. Trang Thống kê ----
  r(`S.boot = _boot(); indexBoot(S.boot); S.me = { id: 1, name: 'A', role: 'admin' }; S.screen = 'stats'; S.statScope = 'B'; S.usage = [];`);
  const TK = r('vStats()');
  ok('chọn một khu: vẫn bày đủ mọi phi, phi trống ghi 0', ['D8', 'D10', 'D12'].every((ph) => TK.includes('<b>' + ph + '</b>')) && /<span>0<\/span>/.test(TK), (TK.match(/Tồn hiện tại.{0,400}/) || [''])[0]);
  ok('và đếm số phi có thép', /Cộng · 1\/3 phi có thép/.test(TK));
  ok('tiêu đề bảng tồn ghi khu đang chọn', /Tồn hiện tại · Khu B/.test(TK));
  ok('nói rõ lượng dùng luôn tính cả bãi', /Thép đã dùng · toàn bãi/.test(TK));
  r(`S.boot.lastClosed = null;`);
  ok('sổ chưa chốt ngày nào: nói vì sao trống và khi nào có số', /Sổ chưa chốt ngày nào/.test(r('vStats()')) && /tự chốt sau 0h/.test(r('vStats()')));
  // ngày mở sổ (used rỗng): không được hiện "0,00 tấn" như thể không dùng gì
  r(`S.boot = _boot(); indexBoot(S.boot); S.usage = [{ day: '${today}', span: 1, used: { D10: 50 }, kg: { D10: 1 }, xuat: {} }, { day: '${yday}', span: 1, used: {}, kg: {}, xuat: {} }];`);
  const TK2 = r('vStats()');
  ok('ngày mở sổ: ghi "mở sổ · chưa tính dùng", không ghi 0 tấn', /mở sổ · chưa tính dùng/.test(TK2) && (TK2.match(/0,00 tấn/g) || []).length === 0, (TK2.match(/Theo ngày.{0,300}/) || [''])[0]);
  r(`S.usage = [{ day: '${yday}', span: 1, used: {}, kg: {}, xuat: {} }];`);
  ok('chỉ có ngày mở sổ: giải thích lượng dùng có từ lần chốt sau', /Lượng dùng bắt đầu có từ lần chốt kế tiếp/.test(r('vStats()')));
  r(`S.usage = null; S.statScope = 'all'; S.screen = 'home';`);

  // ---- 1d12. Khung giờ ở màn Duyệt: mỗi khung một dòng ✓/✗, không câu dài ----
  r(`${slotBoot({ A: [0] })}`);
  const SB2 = r(`slotBang(S.boot.slotDefs, [0], [1], { 0: Date.parse(S.boot.today + 'T09:15:00+07:00') })`);
  ok('dòng ✓: tên ngắn, giờ khung, giờ đếm thật', /✓<\/b><b>Sáng<\/b> <span class="muted">6h–12h<\/span><\/span><span[^>]*>09:15</.test(SB2), SB2);
  ok('dòng ✗: ghi "thiếu"', /✗<\/b><b>Chiều<\/b>.*thiếu</.test(SB2));
  ok('không còn câu "Lần đếm hôm nay"', !/Lần đếm hôm nay/.test(SB2));
  ok('đếm 1 lần/ngày: không bày bảng khung', r(`slotBang([{ i: 0, from: 6, to: 18, label: 'x' }], [], [], {})`) === '');
  r(`S.boot = _boot(); indexBoot(S.boot);`);

  // ---- 1e. không còn lỗi chính tả "cuọn" ----
  ok('không còn chữ "cuọn" sai chính tả', !/cuọn/.test(code));
  const codeNoComment = code.split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join(' ');
  ok('không còn confirm() của hệ điều hành', !/[^.\w]confirm\(/.test(codeNoComment.replace(/nconfirm\(/g, 'X(')));

  const fail = T.filter((x) => x[0] === 'FAIL');
  console.log(T.map((x) => x[0] + ' | ' + x[1] + (x[2] ? ' | ' + x[2] : '')).join('\n'));
  console.log('\n=== ' + T.length + ' kiểm tra, ' + fail.length + ' lỗi ===');
  process.exit(fail.length ? 1 : 0);
};
run().catch((e) => { console.error('CRASH', e); process.exit(2); });
