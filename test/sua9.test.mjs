/* Hồi quy đợt sửa 9 (5 agent chạy tình huống song song, 2026-11-08):
   A. Máy khách: đăng xuất lúc vòng làm mới đang tải /bootstrap không hồi sinh phiên cũ; hàng chờ quân số không gửi lần báo của An dưới
      phiên Bình; bản tải ngầm cũ về sau một lần lưu không đè số mới; bảng dán Excel hiểu ô có dấu nháy / xuống dòng.
   B. Máy chủ: danh mục gia công "toString" không làm sập; tiến độ trống không về 0%; thu hồi tin tính lại "chờ trả lời"; hai người sửa
      cùng đơn gia công; tuoi khổng lồ không 500; "0x10" / "1e3" không thành số; CSV thép về giữ số phiếu dạng chữ; ẩn khu còn số chờ duyệt.
   C. Quân số: đổi lịch ca sau giờ hết ca đêm không làm mất ca đêm vừa làm; lưu số đêm hôm trước trước lượt chép không 409 giả.
   node sua9.test.mjs <đường-dẫn-repo> */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { advance, boot, vnDay } from './harness.mjs';

const ROOT = process.argv[2] || '.';
const SRC = readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');
const T = [];
const ok = (name, cond, extra) => { T.push([cond ? 'PASS' : 'FAIL', name, extra === undefined ? '' : String(extra)]); };
const eq = (name, a, b) => ok(name + ' = ' + JSON.stringify(b), JSON.stringify(a) === JSON.stringify(b), 'thực tế: ' + JSON.stringify(a));
const tick = async (n = 50) => { for (let i = 0; i < n; i++) await new Promise((z) => setImmediate(z)); };
const defer = () => { let res; const p = new Promise((r) => { res = r; }); return { p, res }; };
// đặt đồng hồ giả tới hh:mm giờ Việt Nam (lần tới gần nhất)
const toi = (h, m) => { const cur = ((Date.now() + 7 * 3600e3) % 864e5) / 60e3; advance(((h * 60 + m - cur + 1440) % 1440 || 1440) * 60e3); };

/* Một "máy": app.js trong vm, fetch đi tới worker thật bằng cookie của `who`; hook(method, path) trả { post: promise } để giữ câu trả lời. */
function may(S, who, opts = {}) {
  const el = () => ({ value: '', dataset: {}, style: {}, click() {}, focus() {}, remove() {}, select() {}, setAttribute() {}, setSelectionRange() {}, querySelector: () => null, querySelectorAll: () => [], appendChild() {}, closest: () => null, getBoundingClientRect: () => ({ left: 0, right: 0 }), set innerHTML(v) {}, get innerHTML() { return ''; } });
  const store = opts.store || {};
  const dev = { who, store, errors: [], hook: opts.hook || null };
  const ctx = {
    console: { log() {}, warn() {}, error: (...a) => dev.errors.push(a.map(String).join(' ')) },
    Date, Math, JSON, String, Number, Object, Array, Set, Map, parseInt, parseFloat, isNaN, Promise, RegExp, Error, TypeError, encodeURIComponent, decodeURIComponent,
    setTimeout: () => 0, clearTimeout: () => {},
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; }, key: (n) => Object.keys(store)[n] || null, get length() { return Object.keys(store).length; } },
    navigator: { onLine: true, clipboard: { writeText: async () => {} } },
    history: { state: null, pushState() {}, replaceState() {} },
    location: { reload() {} },
    document: { activeElement: null, hidden: false, body: { appendChild() {}, removeChild() {} }, createElement: el, getElementById: () => el(), querySelectorAll: () => [], addEventListener() {}, execCommand: () => false },
    window: { addEventListener() {} },
    fetch: async (url, o = {}) => {
      const u = String(url);
      if (!u.startsWith('/api')) return { ok: false, status: 404, json: async () => ({}), text: async () => '', headers: { get: () => null } };
      const p = u.replace(/^\/api/, ''), m = o.method || 'GET';
      const h = dev.hook ? dev.hook(m, p) : null;
      if (h === 'fail') throw new TypeError('Failed to fetch');
      const headers = { Origin: 'https://test.local' };
      if (S.jars[dev.who]) headers.Cookie = S.jars[dev.who];
      if (o.body) headers['Content-Type'] = 'application/json';
      if (o.headers && o.headers['X-Kem']) headers['X-Kem'] = o.headers['X-Kem'];
      const res = await S.worker.fetch(new Request('https://test.local/api' + p, { method: m, headers, body: o.body }), S.env);
      const sc = res.headers.get('Set-Cookie'); if (sc) S.jars[dev.who] = sc.split(';')[0];
      const txt = await res.text(); let data = null; try { data = JSON.parse(txt); } catch (e) { data = txt; }
      if (h && h.post) await h.post;
      return { ok: res.status < 400, status: res.status, json: async () => data, headers: { get: () => null } };
    },
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: 'app.js' });
  dev.R = (s) => vm.runInContext(s, ctx);
  return dev;
}

async function dung(names) {
  const S = await boot(ROOT);
  await S.call('POST', '/setup', { token: 'setup-tok', name: 'Admin', phone: '0900000001', pin: '2468' });
  await S.login('Admin', '0900000001', '2468');
  const U = { Admin: 1 }, P = {};
  let i = 2;
  for (const [name, role] of names) {
    const phone = '09000000' + String(i++).padStart(2, '0');
    const r = await S.call('POST', '/users', { name, phone, role }, 'Admin');
    await S.login(name, phone, r.data.pin);
    await S.call('POST', '/change-pin', { pin: r.data.pin, newPin: '1357' }, name);
    U[name] = r.data.id; P[name] = phone;
  }
  return { S, U, P };
}
// có người khác ghi một lần quân số để rev đổi (vòng làm mới mới tải lại)
const doiRev = async (S) => S.call('PUT', '/quanso', { ...(await S.call('GET', '/quanso', undefined, 'Binh')).data.hien, tong: 10, lam: 10, nghi: {} }, 'Binh');

async function main() {
  // 9h sáng: giữa ca ngày, không ai đứng ở ranh giới ca
  toi(9, 0);
  const { S, U, P } = await dung([['An', 'tieudoi'], ['Binh', 'tieudoi'], ['Cv', 'cvktht'], ['Trung', 'trungdoi']]);
  const D = vnDay();

  /* ===== A1. Đăng xuất giữa lúc vòng làm mới đang tải /bootstrap ===== */
  {
    const A = may(S, 'Cv');
    await tick(200);
    await doiRev(S);
    const giu = defer(); let dangGiu = false;
    A.hook = (m, p) => { if (m === 'GET' && p === '/bootstrap' && !dangGiu) { dangGiu = true; return { post: giu.p }; } return null; };
    const rf = A.R('refresh()'); await tick(200);
    ok('A1: vòng làm mới đang chờ /bootstrap', dangGiu);
    A.hook = null;
    await A.R('ACTIONS.logout()'); await tick(50);
    giu.res(); await rf; await tick(100);
    ok('A1: bản /bootstrap về muộn không hồi sinh phiên người vừa đăng xuất', A.R('S.me') === null, A.R('S.me && S.me.name'));
    ok('A1: …và không ghi lại kt:boot (người sau mở app mất mạng không vào bằng phiên cũ)', !('kt:boot' in A.store));
  }

  /* ===== A2. Hàng chờ quân số: An đăng xuất, Bình đăng nhập trong lúc đang gửi ===== */
  {
    const Q = (await S.call('GET', '/quanso', undefined, 'An')).data;
    S.jars.phone = S.jars.An;
    const store = { 'kt:qsq': JSON.stringify([
      { id: 'j1', uid: U.An, body: { ngay: Q.hien.ngay, ca: Q.hien.ca, tong: 12, lam: 12, nghi: {}, ghi_chu: '' }, at: Date.now() },
      { id: 'j2', uid: U.An, body: { ngay: Q.ke.ngay, ca: Q.ke.ca, tong: 12, lam: 11, nghi: { om: 1 }, ghi_chu: '' }, at: Date.now() },
    ]) };
    const giu = defer(); let dangGiu = false;
    const A = may(S, 'phone', { store, hook: (m, p) => { if (m === 'PUT' && p === '/quanso' && !dangGiu) { dangGiu = true; return { post: giu.p }; } return null; } });
    await tick(300);
    ok('A2: hàng chờ đang gửi lần báo thứ nhất', dangGiu);
    A.hook = null;
    await A.R('ACTIONS.logout()'); await tick(50);
    await A.R(`api('POST', '/login', { phone: '${P.Binh}', pin: '1357' }).then((r) => { S.me = r.user; return loadBoot(); })`); await tick(50);
    giu.res(); await tick(400);
    const rows = S.sql('SELECT user_id FROM quan_so WHERE ngay = ? AND ca = ?', Q.ke.ngay, Q.ke.ca);
    ok('A2: lần báo thứ hai của An không bị ghi vào tổ Bình', !rows.some((r) => r.user_id === U.Binh), JSON.stringify(rows));
    ok('A2: …và vẫn nằm trong hàng chờ cho An', JSON.parse(store['kt:qsq'] || '[]').some((j) => j.id === 'j2'));
  }

  // A1 / A2 đăng xuất thật (máy chủ thu hồi phiên của Cv, và của An vì máy "phone" dùng chung cookie của An): đăng nhập lại
  await S.login('Cv', P.Cv, '1357'); await S.login('An', P.An, '1357');

  /* ===== A3. Bản tải ngầm cũ (gia công) về SAU lần "Nhận đơn" ===== */
  {
    const g = await S.call('POST', '/giacong', { cau_kien: 'Dầm D1', truc: 'X1', tang: '1', users: [U.An], user: U.An, han: D }, 'Cv');
    const id = g.data.id;
    const A = may(S, 'An');
    await tick(200);
    await A.R("go('giacong')"); await tick();
    await doiRev(S);
    const giu = defer(); let dangGiu = false;
    A.hook = (m, p) => { if (m === 'GET' && p === '/giacong' && !dangGiu) { dangGiu = true; return { post: giu.p }; } return null; };
    const rf = A.R('refresh()'); await tick(200);
    A.hook = null;
    A.R(`ACTIONS.gcqnhan({ id: ${id} })`); await tick(300);
    giu.res(); await rf; await tick(100);
    eq('A3: bản cũ về sau không đè: đơn vẫn "đã nhận" trên màn hình', A.R(`S.gc.items.find((x) => x.id === ${id}).tt`), 'nhan');
    ok('A3: không có lỗi JavaScript', !A.errors.length, A.errors.join(' | '));
  }

  /* ===== A4. Bảng dán Excel: ô có xuống dòng (Alt+Enter) / dấu nháy ===== */
  {
    const A = may(S, 'Admin');
    const dan = 'Ngày\tNhà cung cấp\tPhi\tKg\tGhi chú\n05/11/2026\t"Cty ""ABC"""\tD16\t1000\t"dòng 1\ndòng 2"\n06/11/2026\tHòa Phát\tD10\t500\t\n';
    A.R(`S.boot = { phi: [{ id: 'D10' }, { id: 'D16' }] }; S.tv = null;`);
    const r = JSON.parse(A.R(`JSON.stringify(tvDocDan(${JSON.stringify(dan)}))`));
    eq('A4: ô ghi chú hai dòng không tách thành hàng giả: 2 hàng', r.rows.length, 2);
    eq('A4: dấu nháy kép trong ô được bỏ đúng kiểu Excel', r.rows[0].ncc, 'Cty "ABC"');
    eq('A4: ghi chú giữ xuống dòng', r.rows[0].ghi_chu, 'dòng 1\ndòng 2');
    eq('A4: số dòng thật của hàng thứ hai (sau ô hai dòng)', r.dongGoc, [2, 4]);
  }

  /* ===== B1. Danh mục gia công loại "toString" ===== */
  {
    eq('B1: thêm danh mục loại "toString": từ chối', (await S.call('POST', '/giacong/muc', { loai: 'toString', ten: 'x' }, 'Admin')).status, 400);
    eq('B1: thêm danh mục loại "__proto__": từ chối', (await S.call('POST', '/giacong/muc', { loai: '__proto__', ten: 'x' }, 'Admin')).status, 400);
    S.raw.exec("INSERT INTO gc_muc (loai, ten, sort) VALUES ('toString', 'cũ', 1)"); // dòng lạ từ trước
    eq('B1: có dòng danh mục lạ: bảng gia công vẫn mở được', (await S.call('GET', '/giacong', undefined, 'Cv')).status, 200);
    S.raw.exec("DELETE FROM gc_muc WHERE loai = 'toString'");
  }

  /* ===== B2. Tiến độ trống / thiếu ===== */
  const g2 = (await S.call('POST', '/giacong', { cau_kien: 'Cột C2', truc: 'Y2', tang: '2', users: [U.An], user: U.An, han: D }, 'Cv')).data.id;
  await S.call('POST', `/giacong/${g2}/nhan`, {}, 'An');
  await S.call('POST', `/giacong/${g2}/tiendo`, { pct: 60 }, 'An');
  for (const v of [null, '', false, [], '  ']) eq(`B2: tiến độ ${JSON.stringify(v)}: từ chối`, (await S.call('POST', `/giacong/${g2}/tiendo`, { pct: v }, 'An')).status, 400);
  eq('B2: đơn vẫn 60%', S.one('SELECT pct FROM don_gc WHERE id = ?', g2).pct, 60);

  /* ===== B3. Thu hồi tin: tính lại "chờ trả lời" ===== */
  {
    const hoi = (await S.call('POST', `/giacong/${g2}/tn`, { noi_dung: 'Chiều xong không?', can_tl: true }, 'Cv')).data.id;
    const tl = (await S.call('POST', `/giacong/${g2}/tn`, { noi_dung: 'Xong', can_tl: false }, 'An')).data.id;
    eq('B3: tổ trả lời: hết chờ', S.one('SELECT cho_tl FROM don_gc WHERE id = ?', g2).cho_tl, null);
    await S.call('POST', `/giacong/${g2}/tn/${tl}/thuhoi`, {}, 'An');
    eq('B3: tổ thu hồi câu trả lời: câu hỏi lại chờ trả lời', S.one('SELECT cho_tl FROM don_gc WHERE id = ?', g2).cho_tl, hoi);
    const q2 = (await S.call('POST', `/giacong/${g2}/tn`, { noi_dung: 'Thêm câu nữa', can_tl: true }, 'Trung')).data.id;
    await S.call('POST', `/giacong/${g2}/tn/${q2}/thuhoi`, {}, 'Trung');
    eq('B3: thu hồi câu hỏi thứ hai: câu hỏi thứ nhất vẫn chờ', S.one('SELECT cho_tl FROM don_gc WHERE id = ?', g2).cho_tl, hoi);
    const cut = (await S.call('POST', '/giacong', { cau_kien: 'a' + '😀'.repeat(60), truc: 'Z9', tang: '3', users: [U.An], user: U.An, han: D }, 'Cv')).data.id;
    ok('B3: cắt chữ dài không để nửa emoji (không có "\\uFFFD" / ký tự lẻ)', !/[\uD800-\uDFFF]/.test(S.one('SELECT cau_kien FROM don_gc WHERE id = ?', cut).cau_kien.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '')));
  }

  /* ===== B4. Hai người cùng sửa một đơn gia công ===== */
  {
    const d0 = (await S.call('GET', '/giacong/' + g2, undefined, 'Cv')).data.don;
    const form = (d, them) => ({ cau_kien: d.cau_kien, truc: d.truc, phan_khu: d.phan_khu || '', tang: d.tang || '', cote: d.cote || '', hang_muc: d.hang_muc || '', noi_dung: d.noi_dung || '',
      od_nguoi: d.od_nguoi || '', od_dd: d.od_dd || '', users: [U.An], user: U.An, han: d.han, buoi: d.buoi || null, ver: d.sua_ver, ...them });
    eq('B4: Cv lưu trục mới', (await S.call('PATCH', '/giacong/' + g2, form(d0, { truc: 'X5-X6' }), 'Cv')).status, 200);
    const r = await S.call('PATCH', '/giacong/' + g2, form(d0, { noi_dung: 'thêm thép đai' }), 'Admin');
    eq('B4: Admin (mở form trước lần lưu của Cv) lưu: 409 changed', [r.status, r.data.code], [409, 'changed']);
    eq('B4: trục của Cv còn nguyên', S.one('SELECT truc FROM don_gc WHERE id = ?', g2).truc, 'X5-X6');
    const d1 = (await S.call('GET', '/giacong/' + g2, undefined, 'Cv')).data.don;
    await S.call('POST', `/giacong/${g2}/tiendo`, { pct: 80 }, 'An');
    eq('B4: tổ cập nhật tiến độ trong lúc Cv sửa: không tính là xung đột', (await S.call('PATCH', '/giacong/' + g2, form(d1, { noi_dung: 'sửa sau' }), 'Cv')).status, 200);
    const cu = { ...form(d1, { noi_dung: 'app cũ' }) }; delete cu.ver;
    eq('B4: app cũ không gửi dấu: vẫn sửa được', (await S.call('PATCH', '/giacong/' + g2, cu, 'Cv')).status, 200);
  }

  /* ===== B5. Báo số đếm: số lạ không 500, không nhận "0x10" ===== */
  {
    const B = (await S.call('GET', '/bootstrap', undefined, 'Admin')).data;
    const khu = B.khu.find((k) => k.active).id, phi = B.phi.filter((p) => p.active).map((p) => p.id);
    const items = (v) => phi.map((p) => ({ phi: p, v, kind: 'dem' }));
    eq('B5: tuoi 1e308: không lỗi máy chủ', (await S.call('PUT', '/counts', { khu, day: D, tuoi: 1e308, items: items(5) }, 'Admin')).status, 200);
    eq('B5: at -1e16: không lỗi máy chủ', (await S.call('PUT', '/counts', { khu, day: D, at: -1e16, items: items(5) }, 'Admin')).status, 200);
    eq('B5: số đếm "0x10": từ chối', (await S.call('PUT', '/counts', { khu, day: D, items: items('0x10') }, 'Admin')).status, 400);
    eq('B5: số đếm "1e3": từ chối', (await S.call('PUT', '/counts', { khu, day: D, items: items('1e3') }, 'Admin')).status, 400);
    eq('B5: số đếm " 12 " (có dấu cách): vẫn nhận', (await S.call('PUT', '/counts', { khu, day: D, items: items(' 12 ') }, 'Admin')).status, 200);
    // ẩn khu còn số báo chờ duyệt khác 0 (tồn đã duyệt = 0)
    const k2 = (await S.call('POST', '/khu', { name: 'Khu Mới' }, 'Admin')).data;
    const k2id = (k2 && (k2.id || (k2.khu && k2.khu.id))) || S.one("SELECT id FROM khu WHERE name = 'Khu Mới'").id;
    await S.call('PUT', '/counts', { khu: k2id, day: D, items: items(7) }, 'Admin');
    const an = await S.call('PATCH', '/khu/' + k2id, { active: false }, 'Admin');
    ok('B5: ẩn khu còn số báo chờ duyệt: từ chối, nói rõ', an.status === 400 && /chờ duyệt/.test(an.data.error || ''), JSON.stringify(an.data));
  }

  /* ===== B6. CSV thép về: số phiếu / số đơn chỉ có số giữ dạng chữ ===== */
  {
    await S.call('POST', `/users/${U.Admin}/thepve`, { co: true }, 'Admin');
    await S.call('POST', '/thepve', { ngay: D, ncc: 'Z', so_phieu: '01/10', so_don: '0123', lines: [{ phi: 'D16', bo: 1 }] }, 'Admin');
    const csv = (await S.call('GET', `/thepve/csv?tu=${D}&den=${D}`, undefined, 'Admin')).data;
    ok('B6: số phiếu "01/10" ghi dạng ="01/10" (Excel không đổi thành ngày)', String(csv).includes('"=""01/10"""'), String(csv).split('\r\n').find((l) => l.includes('01/10')));
    ok('B6: số đơn "0123" giữ số 0 đầu', String(csv).includes('"=""0123"""'));
  }

  /* ===== C1. Đổi lịch ca sáng hôm sau đêm cuối: ca đêm vừa làm không mất ===== */
  {
    toi(20, 0);
    const { S: S2, U: U2 } = await dung([['A', 'tieudoi'], ['B', 'tieudoi'], ['C', 'tieudoi'], ['CV', 'cvktht']]);
    for (const t of ['A', 'B', 'C']) await S2.call('PUT', '/quanso/thietlap', { user: U2[t], ts: 0, ca: 2, tong: 10, s1: 0, s2: 9, n2: { om: 1 } }, 'CV');
    toi(6, 45);
    const hom = vnDay(Date.now() - 864e5);
    eq('C1: tổ A tự đổi lịch sang ca ngày lúc 6h45', (await S2.call('PUT', '/quanso/lich', { ca: 1 }, 'A')).status, 200);
    eq('C1: CVKTHT đổi ca hộ tổ B (chỉ đổi ca)', (await S2.call('PUT', '/quanso/thietlap', { ds: [{ user: U2.B, ca: 1 }] }, 'CV')).status, 200);
    toi(7, 0); await S2.cron();
    eq('C1: số ca đêm vừa qua của cả ba tổ vẫn được chép', S2.sql('SELECT user_id, lam FROM quan_so_tl WHERE ngay = ? AND ca = 2 ORDER BY user_id', hom).map((r) => [r.user_id, r.lam]), [[U2.A, 9], [U2.B, 9], [U2.C, 9]]);
  }

  /* ===== C2. Lưu số đêm hôm trước + đổi tổng trước lượt chép mỗi giờ: không 409 giả ===== */
  {
    toi(20, 0);
    const { S: S3, U: U3 } = await dung([['A', 'tieudoi'], ['CV', 'cvktht']]);
    await S3.call('PUT', '/quanso/thietlap', { user: U3.A, ts: 0, ca: 2, tong: 10, s1: 0, s2: 10 }, 'CV');
    toi(6, 40);
    const hom = vnDay(Date.now() - 864e5);
    const Q = (await S3.call('GET', '/quanso', undefined, 'CV')).data;
    const r = await S3.call('PUT', '/quanso/thietlap', { ds: [{ user: U3.A, tong: 12, s1: 0, s2: 10, ts: Q.tl[U3.A].ts }],
      dem_truoc: { ngay: hom, ds: [{ user: U3.A, lam: 9, tong: 12, n2: { om: 1 }, ts: (Q.demTr.so[U3.A] || {}).ts || 0 }] } }, 'CV');
    eq('C2: lưu được (dòng do chính lần lưu chép không phải "người khác vừa sửa")', [r.status, r.data.code || null], [200, null]);
    eq('C2: số đêm hôm trước là số vừa gõ', S3.one('SELECT lam FROM quan_so_tl WHERE ngay = ? AND ca = 2 AND user_id = ?', hom, U3.A).lam, 9);
    const r2 = await S3.call('PUT', '/quanso/thietlap', { ds: [], dem_truoc: { ngay: hom, ds: [{ user: U3.A, lam: 8, tong: 12, n2: { om: 2 }, ts: 0 }] } }, 'CV');
    eq('C2: máy khác vẫn thấy "chưa có dòng" (ts 0) mà dòng đã có người ghi: vẫn chặn', r2.status, 409);
  }

  const fail = T.filter((x) => x[0] === 'FAIL');
  console.log(T.map((x) => x[0] + ' | ' + x[1] + (x[2] && x[0] === 'FAIL' ? '  [' + x[2] + ']' : '')).join('\n'));
  console.log('\n=== ' + T.length + ' kiểm tra, ' + fail.length + ' lỗi ===');
  process.exit(fail.length ? 1 : 0);
}
main().catch((e) => { console.error('CRASH', e); process.exit(2); });
