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
  settings: { hide_after_zero_days: 3, max_keep_streak: 3, auto_close: 1 },
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
  r(`S.khu = 'A'; loadDraft(true); S.sel = 'D10'; S.bo = ''; S.le = ''; ACTIONS.zero();`);
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
  ok('D8 có nhập/chuyển -> chặn giữ nguyên', /nhập\/chuyển/.test(r(`keepBlock('A', 'D8')`)));

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
     var CT2 = H2.slice(H2.indexOf('Đang có'), H2.indexOf('Tồn theo phi'));`);
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
     var CT3 = H3.slice(H3.indexOf('Đang có'), H3.indexOf('Tồn theo phi'));`);
  ok('duyệt xong thì chi tiết hiện số mới', /250 cây/.test(r('CT3')), (r('CT3').match(/\d+ cây/g) || []).join(','));
  ok('và không còn cột Khu báo', !/Khu báo/.test(r('CT3')));

  // khu không có thép: nói thẳng, đừng để bảng trống
  r(`ACTIONS.khumo({ k: 'A' }); ACTIONS.khumo({ k: 'B' });
     S.boot.counts = []; S.boot.eff = []; S.boot.bm = {}; var H4 = vHome();`);
  ok('khu không có thép thì nói thẳng', /không có thép/.test(r('H4')));
  r(`S.khuMo = {}; S.boot = _boot(); indexBoot(S.boot);`);

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
