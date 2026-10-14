/* Tải lại kèm lệnh ghi (X-Kem) và hạn chờ của lời gọi mạng. node kem.test.mjs <đường-dẫn-repo>
   Những điều phần này hứa:
   1. Lệnh ghi gửi kèm X-Kem thì câu trả lời mang luôn kết quả các đường GET đó (khoá `sau`), ĐÃ GỒM lần ghi vừa xong
      và giống hệt một lần GET riêng — máy khách khỏi phải gọi thêm vòng mạng nào.
   2. Phần kèm đi qua đúng cổng quyền của GET thường: không lấy được thứ mình không GET được.
   3. Không xin thì không kèm; lệnh ghi hỏng thì không kèm; phần kèm hỏng không làm hỏng lệnh ghi.
   4. Máy khách: GET ngay sau lấy bản kèm, không đi mạng; lời gọi treo thì quá hạn là bỏ, báo như mất mạng. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
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
  for (const [name, phone, role] of [['An', '0900000002', 'tieudoi'], ['Cv', '0900000004', 'cvktht'], ['Trung', '0900000005', 'trungdoi']]) {
    const r = await S.call('POST', '/users', { name, phone, role }, 'Admin');
    await S.login(name, phone, r.data.pin);
    await S.call('POST', '/change-pin', { pin: r.data.pin, newPin: '1357' }, name);
    U[name] = r.data.id;
  }
  // gọi kèm tiêu đề X-Kem (harness.call không nhận tiêu đề riêng)
  const goi = async (who, method, p, body, kem) => {
    const headers = { Origin: 'https://test.local', Cookie: S.jars[who] };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (kem) headers['X-Kem'] = kem;
    const res = await S.worker.fetch(new Request('https://test.local/api' + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), S.env);
    return { status: res.status, data: await res.json() };
  };
  const rt = () => S.DB.reads + S.DB.writes + S.DB.batches;
  const boSlotNow = (b) => { const c = JSON.parse(JSON.stringify(b)); if (c.slot) delete c.slot.now; return c; };
  const D = vnDay();
  const ca = (await S.call('GET', '/quanso', undefined, 'An')).data.hien;

  /* ===== 1. Kèm dữ liệu chung: đã gồm lần ghi, giống hệt GET riêng ===== */
  const rev0 = S.one("SELECT value FROM meta WHERE key = 'rev'").value;
  const a0 = rt();
  const w1 = await goi('An', 'PUT', '/quanso', { ...ca, tong: 20, lam: 18, nghi: { om: 2 } }, '/bootstrap');
  const luot1 = rt() - a0;
  eq('báo quân số kèm /bootstrap: ghi được', w1.status, 200);
  ok('câu trả lời có sau["/bootstrap"]', !!(w1.data.sau && w1.data.sau['/bootstrap']));
  eq('câu trả lời của lệnh ghi còn nguyên', [w1.data.ok, w1.data.tong, w1.data.lam], [true, 20, 18]);
  const kb = w1.data.sau['/bootstrap'];
  ok('bản kèm ĐÃ gồm lần ghi: rev mới', kb.rev > rev0, kb.rev + ' so với ' + rev0);
  ok('bản kèm thấy lần báo vừa ghi', !!(kb.qs && kb.qs.toi && kb.qs.toi.hien && kb.qs.toi.hien.lam === 18));
  const g1 = await S.call('GET', '/bootstrap', undefined, 'An');
  eq('bản kèm giống hệt một lần GET /bootstrap riêng', boSlotNow(kb), boSlotNow(g1.data));
  eq('bản kèm là của đúng người gọi', kb.user.id, U.An);
  // trước đây: PUT (xác thực + ...) rồi GET /bootstrap (xác thực + 1 batch). Nay bớt hẳn một request và một lần xác thực.
  const b0 = rt(); await S.call('PUT', '/quanso', { ...ca, tong: 20, lam: 18, nghi: { om: 2 } }, 'An'); const ghiRieng = rt() - b0;
  eq('kèm /bootstrap chỉ tốn thêm đúng 1 lượt gọi D1 so với lệnh ghi trần', luot1 - ghiRieng, 1);

  /* ===== 2. Không xin thì không kèm ===== */
  const w2 = await goi('An', 'PUT', '/quanso', { ...ca, tong: 20, lam: 19, nghi: { om: 1 } });
  eq('không gửi X-Kem: câu trả lời không có khoá sau', 'sau' in w2.data, false);

  /* ===== 3. Phần kèm đi qua cổng quyền ===== */
  const w3 = await goi('An', 'PUT', '/quanso', { ...ca, tong: 20, lam: 20, nghi: {} }, '/review,/bootstrap');
  eq('Tiểu đội trưởng xin kèm /review: lệnh ghi vẫn xong', w3.status, 200);
  eq('…nhưng không nhận được /review (không có quyền GET), chỉ có /bootstrap', Object.keys(w3.data.sau), ['/bootstrap']);
  const w4 = await goi('Cv', 'PUT', '/quanso', { ...ca, user: U.An, tong: 20, lam: 20, nghi: {} }, '/review,/bootstrap,/quanso');
  eq('CVKTHT xin kèm ba đường: nhận đủ cả ba', Object.keys(w4.data.sau).sort(), ['/bootstrap', '/quanso', '/review']);
  const g4 = await S.call('GET', '/review', undefined, 'Cv');
  eq('bản kèm /review giống GET riêng (cùng rev)', w4.data.sau['/review'].rev, g4.data.rev);

  /* ===== 4. Chỉ kèm đường đọc cho phép, tối đa 3 ===== */
  const w5 = await goi('Admin', 'PUT', '/quanso', { ...ca, user: U.An, tong: 21, lam: 21, nghi: {} }, '/backup,/users,/loans/export,/audit,bootstrap,/khong-co');
  eq('đường không cho kèm (sao lưu, tài khoản, tệp xuất, nhật ký…): bỏ qua hết, lệnh ghi vẫn xong', [w5.status, Object.keys(w5.data.sau)], [200, []]);
  const w6 = await goi('Admin', 'PUT', '/quanso', { ...ca, user: U.An, tong: 21, lam: 21, nghi: {} }, '/bootstrap,/loans,/satvun,/giacong,/review');
  eq('xin 5 đường: chỉ chạy 3 đường đầu', Object.keys(w6.data.sau).sort(), ['/bootstrap', '/loans', '/satvun']);

  /* ===== 5. Lệnh ghi hỏng thì không kèm; lệnh ghi vào /users không kèm ===== */
  const w7 = await goi('An', 'PUT', '/quanso', { ...ca, tong: 5, lam: 9, nghi: {} }, '/bootstrap');
  eq('lệnh ghi bị từ chối: trả lỗi, không kèm gì', [w7.status, 'sau' in w7.data, !!w7.data.error], [400, false, true]);
  const w8 = await goi('Admin', 'POST', `/users/${U.Admin || 1}/rename`, { name: 'Admin Moi' }, '/bootstrap');
  eq('lệnh ghi vào /users: không kèm (dòng tài khoản đọc lúc xác thực đã cũ)', [w8.status, 'sau' in w8.data], [200, false]);
  const w9 = await goi('An', 'GET', '/rev', undefined, '/bootstrap');
  eq('GET mang X-Kem: không kèm', 'sau' in w9.data, false);

  /* ===== 6. Gia công: kèm bảng đơn và đơn đang mở ===== */
  const g = await goi('Cv', 'POST', '/giacong', { cau_kien: 'Dầm D1', truc: 'X1-X2', tang: '1', users: [U.An], han: D }, '/bootstrap,/giacong');
  eq('giao đơn kèm bảng đơn: đơn vừa giao có trong bảng kèm', [g.status, g.data.sau['/giacong'].items.some((x) => x.id === g.data.id)], [200, true]);
  const n = await goi('An', 'POST', `/giacong/${g.data.id}/nhan`, {}, `/bootstrap,/giacong/${g.data.id}`);
  eq('nhận đơn kèm đơn đang mở: trạng thái mới', n.data.sau[`/giacong/${g.data.id}`].don.tt, 'nhan');
  const t = await goi('An', 'POST', `/giacong/${g.data.id}/tn`, { noi_dung: 'Đã rõ' }, `/giacong/${g.data.id}`);
  eq('gửi tin kèm đơn: tin vừa gửi có trong bản kèm', t.data.sau[`/giacong/${g.data.id}`].tn.map((x) => x.noi_dung), ['Đã rõ']);

  /* ===== 6b. Khoá chống ghi trùng của phiếu kho: bấm lưu lại (mạng chậm, mất câu trả lời) không sinh phiếu thứ hai ===== */
  await S.call('POST', '/khu', { name: 'Khu A' }, 'Admin');
  const bt = (await S.call('GET', '/bootstrap', undefined, 'Cv')).data;
  const khu = bt.khu[0].id, phi = bt.phi[2].id;
  const soPhieu = () => S.one('SELECT COUNT(DISTINCT grp) n FROM receipts').n;
  const K1 = 'a1b2c3d4e5f60718';
  const p1 = await S.call('POST', '/receipts', { khu, lines: [{ phi, qty: 100 }], note: '', khoa: K1 }, 'Cv');
  const p2 = await S.call('POST', '/receipts', { khu, lines: [{ phi, qty: 100 }], note: '', khoa: K1 }, 'Cv');
  eq('nhập kho gửi lại cùng khoá: nhận về đúng phiếu đã ghi', [p1.status, p2.status, p2.data.id, p2.data.trung], [200, 200, p1.data.id, true]);
  eq('…sổ chỉ có một phiếu', [soPhieu(), S.one('SELECT COUNT(*) n FROM receipts').n], [1, 1]);
  eq('khoá của người khác: từ chối, không lộ phiếu', (await S.call('POST', '/receipts', { khu, lines: [{ phi, qty: 100 }], khoa: K1 }, 'Trung')).status, 400);
  await S.call('POST', `/receipts/${p1.data.id}/duyet`, {}, 'Trung');
  const K2 = '00112233445566ff';
  const x1 = await S.call('POST', '/xuat', { khu, lines: [{ phi, qty: 100 }], noi: 'Công trình B', khoa: K2 }, 'Cv');
  const x2 = await S.call('POST', '/xuat', { khu, lines: [{ phi, qty: 100 }], noi: 'Công trình B', khoa: K2 }, 'Cv');
  eq('xuất hết tồn rồi gửi lại cùng khoá: vẫn là phiếu cũ, không bị báo "khu chỉ còn…"', [x1.status, x2.status, x2.data.id === x1.data.id], [200, 200, true]);
  eq('…không có khoá thì lần hai bị chặn vì phiếu đầu đang giữ chỗ (như trước)', (await S.call('POST', '/xuat', { khu, lines: [{ phi, qty: 100 }], noi: 'Công trình B' }, 'Cv')).status, 400);
  const n0 = soPhieu();
  await S.call('POST', '/receipts', { khu, lines: [{ phi, qty: 5 }], khoa: 'khong-hop-le' }, 'Cv');
  await S.call('POST', '/receipts', { khu, lines: [{ phi, qty: 5 }], khoa: 'khong-hop-le' }, 'Cv');
  eq('khoá sai dạng thì bỏ qua: ghi như bản app cũ (hai phiếu)', soPhieu() - n0, 2);
  const tr = await S.call('POST', '/transfers', { from: khu, to: khu, lines: [{ phi, qty: 1 }], khoa: 'ffffffffffffffff' }, 'Cv');
  eq('phiếu sai (khu đi trùng khu đến) vẫn bị từ chối dù có khoá', tr.status, 400);

  /* ===== 7. Máy khách: GET ngay sau lấy bản kèm, không đi mạng; quá hạn thì bỏ ===== */
  const src = readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');
  const a = src.indexOf('const API_CHO_MS'), z = src.indexOf('// Một dải duy nhất');
  ok('tìm được khối api() trong app.js', a > 0 && z > a);
  const St = { me: { id: 7 }, boot: {}, screen: 'duyet' };
  const calls = [];
  let tra = () => ({});
  const fetchGia = (url, o) => { calls.push({ url, m: o.method, kem: o.headers['X-Kem'] }); return tra(url, o); };
  const api = new Function('S', 'fetch', 'forgetBoot', 'render', src.slice(a, z) + '; return api;')(St, fetchGia, () => {}, () => {});
  const tl = (o) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(o) });
  tra = (url) => (url === '/api/review/duyet' ? tl({ ok: true, phieu: 0, sau: { '/bootstrap': { rev: 9 }, '/review': { rev: 9, khus: [] } } }) : tl({ rev: 1 }));
  const r1 = await api('POST', '/review/duyet', { khu: 'A' });
  eq('màn Duyệt: lệnh ghi xin kèm dữ liệu chung và màn Duyệt', calls[0].kem, '/bootstrap,/review');
  eq('khoá sau không lọt ra chỗ gọi', r1, { ok: true, phieu: 0 });
  eq('GET /review và /bootstrap ngay sau: lấy bản kèm', [(await api('GET', '/review')).rev, (await api('GET', '/bootstrap')).rev], [9, 9]);
  eq('…không đi mạng thêm lần nào', calls.length, 1);
  eq('bản kèm chỉ dùng MỘT lần: GET lần nữa đi mạng', [(await api('GET', '/bootstrap')).rev, calls.length], [1, 2]);
  await api('POST', '/review/duyet', { khu: 'A' });
  St.me = { id: 8 };
  eq('người khác đăng nhập trên cùng máy: không nhận bản kèm của người trước', (await api('GET', '/bootstrap')).rev, 1);
  St.me = { id: 7 };
  calls.length = 0;
  await api('POST', '/giacong/3/doc', { den: 5 }, 0, false);
  await api('GET', '/rev');
  eq('kem = false và GET: không gửi X-Kem', calls.map((c) => c.kem), [undefined, undefined]);
  St.screen = 'gcdon'; St.gcId = 3;
  await api('POST', '/giacong/3/tiendo', { pct: 50 });
  eq('màn một đơn gia công: xin kèm đúng đơn đang mở', calls[2].kem, '/bootstrap,/giacong/3');
  // server bản cũ không kèm: GET đi mạng như trước
  tra = () => tl({ ok: true });
  calls.length = 0;
  await api('POST', '/giacong/3/nhan', {}); await api('GET', '/bootstrap');
  eq('server không kèm: GET sau đó vẫn đi mạng', calls.map((c) => c.m), ['POST', 'GET']);
  // lời gọi treo: quá hạn thì bỏ, báo như mất mạng để hàng chờ gửi lại
  tra = (url, o) => new Promise((_, rej) => o.signal.addEventListener('abort', () => rej(new Error('abort'))));
  let loi = null; const t0 = Date.now();
  try { await api('PUT', '/counts', {}, 60); } catch (e) { loi = e; }
  ok('lời gọi treo: bỏ sau hạn chờ chứ không treo mãi', !!loi && Date.now() - t0 < 2000);
  eq('…báo như mất mạng (net, retry) kèm dấu mạng chậm', loi && [!!loi.net, !!loi.retry, !!loi.cham], [true, true, true]);
  tra = (url, o) => Promise.resolve({ ok: true, status: 200, json: () => new Promise((_, rej) => o.signal.addEventListener('abort', () => rej(new Error('abort')))) });
  loi = null;
  try { await api('GET', '/bootstrap', undefined, 60); } catch (e) { loi = e; }
  ok('treo giữa lúc đọc thân trả lời: là lỗi, không trả {} như thành công', !!loi && !!loi.cham);
}

main().catch((e) => { T.push(['CRASH', e.stack || String(e), '']); }).finally(() => {
  const bad = T.filter((t) => t[0] !== 'PASS');
  for (const t of bad) console.log(t[0], t[1], t[2]);
  console.log(`=== ${T.length} kiểm tra, ${bad.length} lỗi ===`);
  process.exit(bad.length ? 1 : 0);
});
