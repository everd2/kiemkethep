/* Hồi quy đợt sửa lỗi sau rà soát toàn diện: đăng nhập song song, cookie đổi PIN, huỷ phiếu gây âm tồn, phiếu gửi trùng,
   tên phi/khu trùng thuộc tính Object, ngày vay mượn không có thật, mở khoá, khu có người bị khoá, ẩn khu còn phiếu chờ.
   node suaroi.test.mjs <đường-dẫn-repo> */
import { advance, boot, vnDay } from './harness.mjs';

const ROOT = process.argv[2] || '.';
const T = [];
const ok = (name, cond, extra) => { T.push([cond ? 'PASS' : 'FAIL', name, extra === undefined ? '' : String(extra)]); };
const eq = (name, a, b) => ok(name + ' = ' + JSON.stringify(b), JSON.stringify(a) === JSON.stringify(b), 'thực tế: ' + JSON.stringify(a));

async function main() {
  const S = await boot(ROOT);
  await S.call('POST', '/setup', { token: 'setup-tok', name: 'Admin', phone: '0900000001', pin: '2468' });
  await S.login('admin', '0900000001', '2468');
  const mk = async (name, phone, role) => {
    const r = await S.call('POST', '/users', { name, phone, role });
    await S.login(name, phone, r.data.pin);
    await S.call('POST', '/change-pin', { pin: r.data.pin, newPin: '1357' }, name);
    return r.data;
  };
  const an = await mk('An', '0900000002', 'tieudoi');
  const binh = await mk('Binh', '0900000003', 'tieudoi');
  const duyet = (id) => S.call('POST', '/receipts/' + id + '/duyet', {}, 'admin');
  const nhap = async (body) => { const r = await S.call('POST', '/receipts', body, 'admin'); if (r.data && r.data.id) await duyet(r.data.id); return r; };

  // 1. setup lần hai: không tạo được admin thứ hai
  eq('setup lần hai bị từ chối', (await S.call('POST', '/setup', { token: 'setup-tok', name: 'X', phone: '0900000099', pin: '2468' })).status, 403);
  eq('vẫn chỉ một admin', S.sql("SELECT 1 FROM users WHERE role='admin'").length, 1);

  // 2. đăng nhập song song: chỉ 5 lượt được thử, phần dư bị từ chối mà không được thử PIN
  const thu = await Promise.all(Array.from({ length: 30 }, (_, i) => S.call('POST', '/login', { phone: '0900000003', pin: String(2000 + i) }, 'do' + i)));
  const daThu = thu.filter((r) => r.status === 401).length;
  ok('dò PIN song song: không quá 5 lượt được thử', daThu <= 5, daThu);
  ok('yêu cầu dư trả 429', thu.some((r) => r.status === 429), thu.map((r) => r.status).join(','));
  // admin mở khoá phải xoá luôn khoá tạm
  S.raw.prepare('UPDATE users SET locked = 1 WHERE phone = ?').run('0900000003');
  eq('mở khoá', (await S.call('POST', '/users/' + binh.id + '/lock', { locked: 0 })).status, 200);
  const sau = S.one('SELECT locked, fail_count, locked_until, lock_level FROM users WHERE phone = ?', '0900000003');
  eq('mở khoá xoá luôn khoá tạm và số lần sai', [sau.locked, sau.fail_count, sau.locked_until, sau.lock_level], [0, 0, 0, 0]);
  eq('Bình đăng nhập lại được', (await S.call('POST', '/login', { phone: '0900000003', pin: '1357' }, 'Binh2')).status, 200);

  // 3. đổi PIN khi cookie có chỗ trước sid=: không bị xoá luôn phiên đang dùng
  S.jars.Cu = 'a=1; ' + S.jars.An;
  const dd = await S.call('POST', '/change-pin', { pin: '1357', newPin: '8642' }, 'Cu');
  eq('đổi PIN với cookie có tiền tố', dd.status, 200);
  eq('phiên đang dùng còn sống sau khi đổi PIN', (await S.call('GET', '/me', undefined, 'Cu')).status, 200);

  // 4. phi/khu tên trùng thuộc tính của Object
  for (const phi of ['__proto__', 'constructor', 'toString']) {
    eq('nhập phi ' + phi + ' bị từ chối', (await S.call('POST', '/receipts', { khu: 'A', lines: [{ phi, qty: 5 }] })).status, 400);
  }
  for (const khu of ['__proto__', 'constructor']) {
    eq('nhập khu ' + khu + ' bị từ chối', (await S.call('POST', '/receipts', { khu, lines: [{ phi: 'D10', qty: 5 }] })).status, 400);
  }
  eq('không có dòng phiếu rác', S.sql('SELECT 1 FROM receipts WHERE khu_id NOT IN (SELECT id FROM khu)').length, 0);

  // 5. gửi trùng cùng khoá: một phiếu duy nhất
  const khoa1 = 'abcdef0123456789';
  const body = { khu: 'A', lines: [{ phi: 'D10', qty: 40 }], khoa: khoa1 };
  const song = await Promise.all([S.call('POST', '/receipts', body), S.call('POST', '/receipts', body), S.call('POST', '/receipts', body)]);
  ok('gửi trùng khoá: không lần nào lỗi', song.every((r) => r.status === 200), song.map((r) => r.status).join(','));
  eq('chỉ một dòng phiếu cho khoá đó', S.sql('SELECT 1 FROM receipts WHERE grp = ?', khoa1).length, 1);

  // 6. huỷ phiếu nhập đã duyệt khi thép đã chuyển đi: khu không được âm
  const r1 = await nhap({ khu: 'A', lines: [{ phi: 'D12', qty: 100 }] });
  const tr = await S.call('POST', '/transfers', { from: 'A', to: 'B', lines: [{ phi: 'D12', qty: 100 }] });
  await duyet(tr.data.id);
  const v1 = await S.call('DELETE', '/receipts/' + r1.data.id);
  eq('huỷ phiếu nhập khi thép đã chuyển đi bị chặn', v1.status, 400);
  ok('và nói rõ khu nào còn bao nhiêu', /chỉ còn/.test(JSON.stringify(v1.data)), JSON.stringify(v1.data));
  eq('phiếu nhập vẫn còn hiệu lực', S.one('SELECT voided FROM receipts WHERE id = ?', r1.data.id).voided, 0);
  const r2 = await nhap({ khu: 'B', lines: [{ phi: 'D14', qty: 30 }] });
  eq('huỷ phiếu nhập còn nguyên thép vẫn được', (await S.call('DELETE', '/receipts/' + r2.data.id)).status, 200);

  // 7. duyệt hai lần cùng lúc: một lần thành công
  const p3 = await S.call('POST', '/receipts', { khu: 'A', lines: [{ phi: 'D16', qty: 10 }] });
  const hai = await Promise.all([duyet(p3.data.id), duyet(p3.data.id)]);
  eq('duyệt song song: đúng một lần được', hai.filter((r) => r.status === 200).length, 1);

  // 8. sổ vay mượn: ngày không có thật bị từ chối (không phải 500)
  const dt = (await S.call('POST', '/doitac', { name: 'Cty Z' })).data;
  const doitac = dt.id;
  const vay = (ngay, han) => S.call('POST', '/loans', { kind: 'vay', doitac, bienban: true, zalo: true, so_bb: 'BB' + Math.random(), lines: [{ phi: 'D10', qty: 5 }], ngay, ...(han ? { han } : {}) });
  const t = vnDay();
  eq('vay: 2025-13-01 bị từ chối', (await vay('2025-13-01')).status, 400);
  eq('vay: 31/02 bị từ chối', (await vay(t.slice(0, 5) + '02-31')).status, 400);
  eq('vay: hạn trả không có thật bị từ chối', (await vay(t, t.slice(0, 4) + '-13-40')).status, 400);
  eq('vay: ngày thật vẫn ghi được', (await vay(t)).status, 200);
  eq('sắt vụn: tháng 13 là 400, không phải 500', (await S.call('POST', '/satvun', { ngay: '2025-13-01', tan: '1', noi: 'X', so_phieu: 'Q1' })).status, 400);

  // 9. khu có người đã gán nhưng bị khoá: thêm người khác không bị từ chối
  await S.call('PUT', '/khu/A/users', { users: [an.id] });
  S.raw.prepare('UPDATE users SET locked = 1 WHERE id = ?').run(an.id);
  eq('thêm người vào khu có người bị khoá (đã gán sẵn)', (await S.call('PUT', '/khu/A/users', { users: [an.id, binh.id] })).status, 200);
  const moi = await mk('Chi', '0900000005', 'tieudoi');
  S.raw.prepare('UPDATE users SET locked = 1 WHERE id = ?').run(moi.id);
  eq('gán người MỚI đang bị khoá vẫn bị từ chối', (await S.call('PUT', '/khu/A/users', { users: [an.id, binh.id, moi.id] })).status, 400);

  // 10. ẩn khu còn phiếu chờ duyệt
  const cho = await S.call('POST', '/receipts', { khu: 'C', lines: [{ phi: 'D10', qty: 7 }] });
  eq('ẩn khu còn phiếu chờ duyệt bị từ chối', (await S.call('PATCH', '/khu/C', { active: 0 })).status, 400);
  await S.call('DELETE', '/receipts/' + cho.data.id);
  eq('hết phiếu chờ thì ẩn được', (await S.call('PATCH', '/khu/C', { active: 0 })).status, 200);

  // 11. hai admin tạo cùng một số điện thoại: lần sau là 400
  const u1 = await S.call('POST', '/users', { name: 'Dung', phone: '0900000077', role: 'tieudoi' });
  const u2 = await S.call('POST', '/users', { name: 'Dung2', phone: '0900000077', role: 'tieudoi' });
  eq('tạo người trùng số: 200 rồi 400', [u1.status, u2.status], [200, 400]);

  // 12. header bảo vệ trên mọi phản hồi
  const hd = await S.call('GET', '/me');
  eq('API có X-Frame-Options', hd.res.headers.get('X-Frame-Options'), 'DENY');
  eq('API có nosniff', hd.res.headers.get('X-Content-Type-Options'), 'nosniff');
  ok('API có CSP frame-ancestors', /frame-ancestors 'none'/.test(hd.res.headers.get('Content-Security-Policy') || ''), '');
  const st = await S.worker.fetch(new Request('https://test.local/'), S.env);
  eq('trang tĩnh cũng có X-Frame-Options', st.headers.get('X-Frame-Options'), 'DENY');

  // 13. sắt vụn: "1.250" không đoán được là 1,25 hay 1250 tấn -> từ chối; dấu phẩy thì rõ
  const sv = (tan, so) => S.call('POST', '/satvun', { ngay: t, tan, noi: 'Cty', so_phieu: so });
  eq('sắt vụn "1.250" bị từ chối', (await sv('1.250', 'S1')).status, 400);
  eq('sắt vụn "1,250" ghi được', (await sv('1,250', 'S2')).status, 200);
  eq('sắt vụn "2.5" vẫn ghi được', (await sv('2.5', 'S3')).status, 200);

  // 14. hoàn tác đặt lại số liệu: chỉ admin đầu tiên
  const ad2 = await mk('Admin Hai', '0900000008', 'admin');
  eq('admin thứ hai không hoàn tác được', (await S.call('POST', '/reopen', { note: 'thử' }, 'Admin Hai')).status, 403);

  // 15. token khôi phục: thử sai nhiều lần thì bị chặn
  let chan = 0;
  for (let i = 0; i < 25; i++) if ((await S.call('POST', '/recover', { token: 'sai' + i, phone: '0900000001', newPin: '7531' }, 'rec')).status === 429) chan++;
  ok('thử sai token khôi phục quá 20 lần bị chặn', chan >= 4, chan);

  // 16. nhật ký: bốn trigger chỉ-ghi-thêm có mặt
  eq('đủ bốn trigger nhật ký', S.sql("SELECT name FROM sqlite_master WHERE type='trigger' AND name IN ('audit_no_update','audit_no_delete','counts_log_no_update','counts_log_no_delete')").length, 4);

  // 17. ảnh vào dòng sổ đã huỷ bị từ chối
  const dongSo = S.one("SELECT id FROM satvun WHERE so_phieu = 'S2'");
  S.raw.prepare('UPDATE satvun SET voided = 1 WHERE id = ?').run(dongSo.id);
  const anh = await S.call('POST', '/anh/satvun/' + dongSo.id, new Uint8Array([255, 216, 255, 217]), 'admin');
  eq('ảnh vào dòng sổ đã huỷ: 400', anh.status, 400);

  // 18. gửi trùng số biên bản / số phiếu cân CÙNG LÚC (bấm đúp, gửi lại lúc mạng chậm): chỉ một dòng được ghi
  const dt2 = (await S.call('POST', '/doitac', { name: 'Cty Song Song' })).data.id;
  const vay2 = () => S.call('POST', '/loans', { kind: 'vay', doitac: dt2, bienban: true, zalo: true, so_bb: 'BB-SS-01', lines: [{ phi: 'D10', qty: 3 }], ngay: t });
  const hai2 = await Promise.all([vay2(), vay2(), vay2()]);
  eq('vay mượn gửi 3 lần cùng lúc: đúng 1 lần được ghi', hai2.filter((r) => r.status === 200).length, 1);
  ok('các lần sau báo trùng biên bản (để hỏi lại người dùng)', hai2.filter((r) => r.status === 409).every((r) => r.data.code === 'trung_bb'), hai2.map((r) => r.status + ':' + (r.data && r.data.code)).join(','));
  eq('trong sổ chỉ có 1 dòng biên bản đó', S.sql("SELECT 1 FROM loans WHERE so_bb = 'BB-SS-01' AND voided = 0").length, 1);
  eq('xác nhận ghi thêm (trung: true) vẫn được', (await S.call('POST', '/loans', { kind: 'vay', doitac: dt2, bienban: true, zalo: true, so_bb: 'BB-SS-01', trung: true, lines: [{ phi: 'D10', qty: 3 }], ngay: t })).status, 200);
  /* Giả lập đúng khe hở: một người khác ghi CHEN VÀO giữa lúc kiểm "đã có chưa" và lúc ghi. Bọc DB.batch: lần ghi sổ đầu tiên
     thì chèn trước một dòng trùng rồi mới chạy batch. Không có chốt chặn trong batch thì sổ thành hai dòng. */
  const chen = (bang, sql) => {
    const goc = S.DB.batch.bind(S.DB);
    S.DB.batch = async (st) => {
      if (st.some((x) => x.sql && x.sql.includes('INSERT INTO ' + bang + ' '))) { S.DB.batch = goc; S.raw.exec(sql); }
      return goc(st);
    };
  };
  chen('satvun', "INSERT INTO satvun (ngay, khu_id, kg, noi, so_phieu, user_id, ts, cap) VALUES ('" + t + "', NULL, 1500, 'Cty Song Song', 'PC-SS-09', 1, 1, 2)");
  const sv3 = await S.call('POST', '/satvun', { ngay: t, tan: '1,5', noi: 'Cty Song Song', so_phieu: 'PC-SS-09' });
  eq('sắt vụn: người khác ghi chen vào giữa lúc kiểm và lúc ghi -> báo trùng', [sv3.status, sv3.data && sv3.data.code], [409, 'trung_sv']);
  eq('trong sổ chỉ có 1 dòng phiếu cân đó', S.sql("SELECT 1 FROM satvun WHERE so_phieu = 'PC-SS-09' AND voided = 0").length, 1);
  chen('loans', "INSERT INTO loans (doitac_id, phi_id, kind, qty, grp, user_id, ts, ngay, so_bb, cap) VALUES (" + dt2 + ", 'D12', 'vay', 2, 'chen01', 1, 1, '" + t + "', 'BB-SS-02', 2)");
  const vay3 = await S.call('POST', '/loans', { kind: 'vay', doitac: dt2, bienban: true, zalo: true, so_bb: 'BB-SS-02', lines: [{ phi: 'D12', qty: 2 }], ngay: t });
  eq('vay mượn: người khác ghi chen vào -> báo trùng biên bản', [vay3.status, vay3.data && vay3.data.code], [409, 'trung_bb']);
  eq('trong sổ chỉ có 1 dòng biên bản đó', S.sql("SELECT 1 FROM loans WHERE so_bb = 'BB-SS-02' AND voided = 0").length, 1);

  // 19. số phiên bản trong app.js phải trùng CACHE của sw.js (dải "có bản mới" so hai số này)
  const { readFileSync } = await import('node:fs');
  const path = (await import('node:path')).default;
  const ban = /const BAN = '([^']+)'/.exec(readFileSync(path.join(ROOT, 'public/app.js'), 'utf8')), cache = /const CACHE = '([^']+)'/.exec(readFileSync(path.join(ROOT, 'public/sw.js'), 'utf8'));
  eq('BAN trong app.js trùng CACHE trong sw.js', ban && ban[1], cache && cache[1]);

  // 20. Duyệt khu thiếu dấu số liệu (bản app cũ): báo cập nhật app, không duyệt
  const dkMiss = await S.call('POST', '/review/duyet', { all: true, marks: null });
  eq('duyệt thiếu dấu số liệu: 409 old_app (máy khách bật dải có bản mới)', [dkMiss.status, dkMiss.data && dkMiss.data.code], [409, 'old_app']);

  // 21. giới hạn sai PIN theo mạng tính THEO GIỜ: chặn khi vượt, sang giờ sau là mở lại (không chặn cả bãi tới hết ngày)
  let bi = 0, lan = 0;
  for (; lan < 80; lan++) { const r = await S.call('POST', '/login', { phone: '0999999' + String(lan).padStart(3, '0'), pin: '1111' }, 'do-ip'); if (r.status === 429) { bi = lan + 1; break; } }
  ok('nhập sai liên tục từ một mạng: bị chặn trước lần thứ 61', bi > 0 && bi <= 61, 'chặn ở lần ' + bi);
  eq('đang bị chặn thì người đúng PIN cùng mạng cũng phải đợi', (await S.call('POST', '/login', { phone: '0900000001', pin: '2468' }, 'cungmang')).status, 429);
  advance(3600e3);
  eq('sang giờ sau: đăng nhập lại được', (await S.call('POST', '/login', { phone: '0900000001', pin: '2468' }, 'cungmang')).status, 200);

  // 22. số thiết lập sửa NGAY SAU giờ hết ca (trước lượt chép tự động hằng giờ) vẫn được chép cho ca đó, không thành "thiếu số"
  const datGio = (h, m = 0) => { const cur = ((Date.now() + 7 * 3600e3) % 864e5) / 60e3; let dd = h * 60 + m - cur; if (dd <= 0) dd += 1440; advance(dd * 60e3); };
  const toMoi = await mk('Tổ Muộn', '0900000066', 'tieudoi');
  datGio(18, 45); // ca ngày (6h30 - 18h30) vừa hết 15 phút
  const ngayCa = vnDay();
  eq('CVKTHT (admin) đặt thiết lập lúc 18:45', (await S.call('PUT', '/quanso/thietlap', { user: toMoi.id, tong: 10, s1: 8, s2: 0, ts: 0 })).status, 200);
  datGio(19, 5);
  await S.cron();
  const chep = S.one('SELECT lam, tong FROM quan_so_tl WHERE ngay = ? AND ca = 1 AND user_id = ?', ngayCa, toMoi.id);
  eq('lượt chép 19:05 vẫn ghi số cho ca ngày vừa hết (8/10)', chep && [chep.lam, chep.tong], [8, 10]);

  const fail = T.filter((x) => x[0] === 'FAIL');
  console.log(T.map((x) => x[0] + ' | ' + x[1] + (x[2] && x[0] === 'FAIL' ? '  [' + x[2] + ']' : '')).join('\n'));
  console.log('\n=== ' + T.length + ' kiểm tra, ' + fail.length + ' lỗi ===');
  process.exit(fail.length ? 1 : 0);
}
main().catch((e) => { console.error('CRASH', e); process.exit(2); });
