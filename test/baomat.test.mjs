/* Vá bảo mật nhỏ: CSV sổ vay mượn không chạy như công thức, đổi PIN bị đếm sai + thu hồi phiên khác, ảnh không vượt 20/dòng khi gửi dồn.
   node baomat.test.mjs <đường-dẫn-repo> */
import { boot } from './harness.mjs';

const ROOT = process.argv[2] || '.';
const T = [];
const ok = (name, cond, extra) => { T.push([cond ? 'PASS' : 'FAIL', name, extra === undefined ? '' : String(extra)]); };
const eq = (name, a, b) => ok(name + ' = ' + JSON.stringify(b), JSON.stringify(a) === JSON.stringify(b), 'thực tế: ' + JSON.stringify(a));

async function main() {
  const S = await boot(ROOT);
  await S.call('POST', '/setup', { token: 'setup-tok', name: 'Admin', phone: '0900000001', pin: '2468' });
  await S.login('admin', '0900000001', '2468');

  /* ===== 1. CSV sổ vay mượn: tên người ghi bắt đầu bằng "=" ===== */
  const r = await S.call('POST', '/users', { name: '=cmd|calc', phone: '0900000002', role: 'tieudoi' });
  await S.login('x', '0900000002', r.data.pin);
  await S.call('POST', '/change-pin', { pin: r.data.pin, newPin: '1357' }, 'x');
  const dt = (await S.call('POST', '/doitac', { name: 'Cty A' }, 'x')).data.id;
  const g = await S.call('POST', '/loans', { bienban: true, zalo: true, so_bb: 'B1', doitac: dt, kind: 'vay', lines: [{ phi: 'D16', qty: 3 }] }, 'x');
  eq('ghi sổ vay', g.status, 200);
  const csv = (await S.call('GET', '/loans/export', undefined, 'admin')).data;
  ok('CSV có tên người ghi', typeof csv === 'string' && csv.includes('cmd|calc'));
  ok('tên người ghi bắt đầu "=" được bọc thành chữ, không thành công thức', !/;"=cmd/.test(csv) && csv.includes('"=""=cmd|calc"""'));

  /* ===== 2. Đổi PIN ===== */
  const r2 = await S.call('POST', '/users', { name: 'Hai', phone: '0900000003', role: 'tieudoi' });
  await S.login('may1', '0900000003', r2.data.pin);
  await S.login('may2', '0900000003', r2.data.pin);
  const uid = r2.data.id;
  for (let i = 0; i < 4; i++) eq('sai PIN hiện tại lần ' + (i + 1), (await S.call('POST', '/change-pin', { pin: '0000', newPin: '1357' }, 'may1')).status, 401);
  eq('sai lần 5: vẫn 401 nhưng bị khoá', (await S.call('POST', '/change-pin', { pin: '0000', newPin: '1357' }, 'may1')).status, 401);
  ok('tài khoản bị khoá tạm', S.one('SELECT locked_until FROM users WHERE id = ?', uid).locked_until > Date.now());
  eq('đang khoá: đúng PIN cũng không đổi được', (await S.call('POST', '/change-pin', { pin: r2.data.pin, newPin: '1357' }, 'may1')).status, 429);
  S.raw.prepare('UPDATE users SET locked_until = 0, fail_count = 0 WHERE id = ?').run(uid);
  eq('hết khoá, đổi đúng PIN', (await S.call('POST', '/change-pin', { pin: r2.data.pin, newPin: '1357' }, 'may1')).status, 200);
  eq('máy đang đổi vẫn đăng nhập', (await S.call('GET', '/me', undefined, 'may1')).status, 200);
  eq('máy khác bị đăng xuất', (await S.call('GET', '/me', undefined, 'may2')).status, 401);
  eq('chỉ còn 1 phiên của user', S.one('SELECT COUNT(*) n FROM sessions WHERE user_id = ?', uid).n, 1);

  /* ===== 3. Ảnh: gửi dồn không vượt 20 ===== */
  const anh = (n) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, n, 1, 2, 3]);
  const lid = Math.min(...g.data.ids);
  for (let i = 0; i < 19; i++) await S.call('POST', `/anh/loan/${lid}`, anh(i), 'x');
  const rs = await Promise.all([1, 2, 3, 4].map((i) => S.call('POST', `/anh/loan/${lid}`, anh(100 + i), 'x')));
  eq('gửi dồn 4 ảnh vào chỗ trống 1: đúng 20 ảnh trong DB', S.one('SELECT COUNT(*) n FROM anh_bb WHERE entity_id = ?', lid).n, 20);
  eq('đúng 1 ảnh được nhận', rs.filter((x) => x.status === 200).length, 1);
  eq('R2 không giữ ảnh mồ côi', S.env.ANH.obj.size, 20);
  // chặn nguyên tử ở tầng SQL: ngay cả khi kiểm tra trước bị qua mặt
  const gh = await S.call('POST', `/anh/loan/${lid}`, anh(200), 'x');
  eq('ảnh thứ 21 vẫn bị từ chối 400', gh.status, 400);

  const fail = T.filter((x) => x[0] === 'FAIL');
  console.log(T.map((x) => x[0] + ' | ' + x[1] + (x[2] ? '  [' + x[2] + ']' : '')).join('\n'));
  console.log('\n=== ' + T.length + ' kiểm tra, ' + fail.length + ' lỗi ===');
  process.exit(fail.length ? 1 : 0);
}
main().catch((e) => { console.error('CRASH', e); process.exit(2); });
