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

  // ---- 4a. tổng bãi ở màn Đếm gồm cả khu đã ẩn ----
  r(`S.draft = { cells: {}, added: {}, baseTs: 0 }; var tot = totals(); var HD = demView();`);
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
  // số lẻ đứng một mình phải có đơn vị, trong ngoặc thì bỏ cho gọn
  r(`S.unit = 'bo'`);
  ok('kiểu "bó": số lẻ có chữ cây', /47 bó \+ 0 cây|47 bó/.test(r(`qBo(470, S.boot.phiBy.D10)`)) && /bó \+ 5 cây/.test(r(`qBo(475, S.boot.phiBy.D10)`)), r(`qBo(475, S.boot.phiBy.D10)`));
  r(`S.unit = 'all'`);
  ok('kiểu "tất cả": trong ngoặc bỏ chữ cây cho gọn', /475 cây \(47 bó \+ 5\)/.test(r(`fmtQ(475, S.boot.phiBy.D10)`)), r(`fmtQ(475, S.boot.phiBy.D10)`));

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

  // ---- 3c. nút xám nói rõ lý do, không nhấp nháy "Đang lưu" ----
  r(`S.khu = 'A'; loadDraft(true); S.toast = ''; S.busy = false; ACTIONS.send();`);
  ok('GỬI khi còn phi chưa nhập: nói rõ thiếu phi nào', /phi chưa nhập/.test(r('S.toast')), r('S.toast'));
  ok('GỬI khi còn thiếu: không bật overlay Đang lưu', r('S.busy') === false);
  r(`S.khu = 'A'; loadDraft(true); S.draft.cells['D10'] = { v: 300, kind: 'dem', bo: 30, le: 0 };
     S.toast = ''; S.confirmKeep = false; ACTIONS.keepall();`);
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
  // D10 nặng 0,617 kg/cây: lệch 5 cây = 3 kg, dưới ngưỡng -> không báo
  r(`S.boot.counts = [{ khu_id: 'A', phi_id: 'D10', v: 305, kind: 'dem', user_id: 1, uname: 'A', ts: Date.now() },
                      { khu_id: 'B', phi_id: 'D10', v: 100, kind: 'dem', user_id: 1, uname: 'A', ts: Date.now() }]; indexBoot(S.boot);`);
  ok('lệch nhỏ (3 kg): Tổng quan không báo "đã dùng âm"', !/đã dùng âm/.test(r('vHome()')), r(`JSON.stringify(totals().used)`));
  // lệch 200 cây = 123 kg, vượt ngưỡng -> phải báo
  r(`S.boot.counts[0].v = 500; indexBoot(S.boot);`);
  ok('lệch lớn (123 kg): Tổng quan báo "đã dùng âm"', /đã dùng âm/.test(r('vHome()')));
  // server gửi ngưỡng khác thì app phải đi theo, không dùng số chép cứng
  r(`S.boot.limits.negKg = 500;`);
  ok('đổi ngưỡng ở server thì app đi theo', !/đã dùng âm/.test(r('vHome()')));
  r(`S.boot.limits.negKg = 100; S.boot.counts = []; indexBoot(S.boot);`);
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
