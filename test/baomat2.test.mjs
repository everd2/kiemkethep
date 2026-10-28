/* Vá bảo mật đợt 2: node baomat2.test.mjs <đường-dẫn-repo>
   1. Trần nhập sai PIN theo địa chỉ (IP_FAIL_MAX / giờ) không bị lách bằng yêu cầu song song: giữ chỗ TRƯỚC khi thử PIN.
   2. Trần thử token khôi phục (20 / ngày) cũng vậy.
   3. Nạp lại bản sao không lùi trạng thái bảo mật: PIN đã đặt lại, khoá, xoá giữ như hiện tại; tài khoản chỉ có trong tệp về
      y như tệp (nạp vào bản cài mới sau sự cố); đổi vai trò thì thu hồi phiên; admin đang nạp không tự khoá mình ngoài.
   4. "Sao lưu ngay" không đẩy bản hằng tuần ra, không dời lịch tuần; hai loại giữ riêng (8 tự động + 5 tay). */
import { advance, boot } from './harness.mjs';
import { IP_FAIL_MAX } from '../src/core.js';

const ROOT = process.argv[2] || '.';
const T = [];
const ok = (name, cond, extra) => { T.push([cond ? 'PASS' : 'FAIL', name, extra === undefined ? '' : String(extra)]); };
const eq = (name, a, b) => ok(name + ' = ' + JSON.stringify(b), JSON.stringify(a) === JSON.stringify(b), 'thực tế: ' + JSON.stringify(a));
const datGio = (h, m = 0) => { const cur = ((Date.now() + 7 * 3600e3) % 864e5) / 60e3; let d = h * 60 + m - cur; if (d <= 0) d += 1440; advance(d * 60e3); };

async function main() {
  const S = await boot(ROOT);
  // gọi thẳng worker kèm địa chỉ mạng riêng (harness không đặt CF-Connecting-IP)
  const goi = async (p, body, ip) => {
    const res = await S.worker.fetch(new Request('https://test.local/api' + p, {
      method: 'POST', headers: { Origin: 'https://test.local', 'Content-Type': 'application/json', 'CF-Connecting-IP': ip }, body: JSON.stringify(body),
    }), S.env);
    return res.status;
  };
  const dem = (ip) => (S.one('SELECT SUM(n) n FROM login_fail WHERE ip = ?', ip) || {}).n || 0;
  await S.call('POST', '/setup', { token: 'setup-tok', name: 'Admin', phone: '0900000001', pin: '2468' });
  await S.login('admin', '0900000001', '2468');

  /* ===== 1. Đăng nhập sai song song ===== */
  const phones = [];
  for (let i = 0; i < 30; i++) {
    const ph = '091' + String(i).padStart(7, '0');
    await S.call('POST', '/users', { name: 'Thử ' + i, phone: ph, role: 'tieudoi' });
    phones.push(ph);
  }
  const rs = await Promise.all(phones.flatMap((ph) => [0, 1, 2, 3, 4].map((k) => goi('/login', { phone: ph, pin: String(1000 + k) }, '10.0.0.1'))));
  eq('150 lần sai song song từ một mạng: chỉ IP_FAIL_MAX lần được thử PIN (401)', rs.filter((s) => s === 401).length, IP_FAIL_MAX);
  eq('phần dư bị chặn 429 mà không thử', rs.filter((s) => s === 429).length, 150 - IP_FAIL_MAX);
  // mạng khác: đúng PIN không tốn chỗ, sai thì tính; tài khoản đang khoá thì không tính
  const r1 = await S.call('POST', '/users', { name: 'Đúng', phone: '0920000001', role: 'tieudoi' });
  eq('mạng khác: sai 2 lần', [await goi('/login', { phone: '0920000001', pin: '0001' }, '10.0.0.2'), await goi('/login', { phone: '0920000001', pin: '0002' }, '10.0.0.2')], [401, 401]);
  eq('đúng PIN: đăng nhập được', await goi('/login', { phone: '0920000001', pin: r1.data.pin }, '10.0.0.2'), 200);
  eq('đúng PIN không bị tính là lần sai (trả lại chỗ)', dem('10.0.0.2'), 2);
  eq('số không có tài khoản vẫn tính', [await goi('/login', { phone: '0999999999', pin: '0001' }, '10.0.0.2'), dem('10.0.0.2')], [401, 3]);
  await S.call('POST', '/users/' + r1.data.id + '/lock', { locked: true });
  eq('tài khoản bị khoá: 403, không tính', [await goi('/login', { phone: '0920000001', pin: '0001' }, '10.0.0.2'), dem('10.0.0.2')], [403, 3]);
  // đúng trần (tuần tự): lần thứ IP_FAIL_MAX + 1 bị chặn, cả đúng PIN
  for (let i = dem('10.0.0.2'); i < IP_FAIL_MAX; i++) await goi('/login', { phone: '0999999999', pin: '0001' }, '10.0.0.2');
  eq('tuần tự tới trần: lần kế tiếp 429', await goi('/login', { phone: '0900000001', pin: '2468' }, '10.0.0.2'), 429);

  /* ===== 2. Token khôi phục sai song song ===== */
  const rr = await Promise.all(Array.from({ length: 40 }, (_, i) => goi('/recover', { token: 'sai-' + i, phone: '0900000001', newPin: '1357' }, '10.0.0.3')));
  eq('40 token sai song song: chỉ 20 lần được so (403)', rr.filter((s) => s === 403).length, 20);
  eq('phần dư 429', rr.filter((s) => s === 429).length, 20);
  eq('hết lượt: token đúng cũng bị chặn hôm nay', await goi('/recover', { token: 'rec-tok', phone: '0900000001', newPin: '1357' }, '10.0.0.3'), 429);
  eq('mạng khác: token sai 1 lần', await goi('/recover', { token: 'sai', phone: '0900000001', newPin: '1357' }, '10.0.0.4'), 403);
  eq('token đúng: khôi phục được, không bị tính', [await goi('/recover', { token: 'rec-tok', phone: '0900000001', newPin: '2468' }, '10.0.0.4'), dem('rec:10.0.0.4')], [200, 1]);
  await S.login('admin', '0900000001', '2468');

  /* ===== 3. Nạp lại bản sao không lùi trạng thái bảo mật ===== */
  const mk = async (name, phone, role = 'tieudoi') => {
    const r = await S.call('POST', '/users', { name, phone, role });
    await S.login(name, phone, r.data.pin);
    await S.call('POST', '/change-pin', { pin: r.data.pin, newPin: '1357' }, name);
    return r.data.id;
  };
  const idLo = await mk('Lộ PIN', '0930000001');
  const idKhoa = await mk('Bị khoá', '0930000002');
  const idXoa = await mk('Đã nghỉ', '0930000003');
  const idVt = await mk('Đổi vai', '0930000004');
  const idGiu = await mk('Giữ nguyên', '0930000005');
  const f = (await S.call('GET', '/backup')).data;
  // sau ngày sao lưu: PIN lộ nên đặt lại, khoá một người, xoá một người, đổi vai trò, admin tự đổi PIN
  const moi = (await S.call('POST', '/users/' + idLo + '/reset-pin', {})).data.pin;
  await S.call('POST', '/users/' + idKhoa + '/lock', { locked: true });
  await S.call('POST', '/users/' + idXoa + '/delete', { confirm_khu: true });
  await S.call('POST', '/users/' + idVt + '/role', { role: 'cvktht' });
  await S.login('Đổi vai', '0930000004', '1357');
  eq('admin đổi PIN sau ngày sao lưu', (await S.call('POST', '/change-pin', { pin: '2468', newPin: '8642' })).status, 200);
  /* tệp mang thêm ba tài khoản không có dòng nào trong database hiện tại (PIN 1357 như trong tệp): một đang dùng (phải đổi PIN),
     một đã xoá, một bị khoá — về y như tệp. Và dòng admin bị sửa thành tieudoi. */
  const goc = f.bang.users.find((u) => u.id === idGiu);
  f.bang.users.push({ ...goc, id: 999, name: 'Chỉ trong tệp', phone: '0930000999', deleted: 0, must_change: 1 },
    { ...goc, id: 998, name: 'Tệp: đã xoá', phone: '0930000998', deleted: 1 }, { ...goc, id: 997, name: 'Tệp: bị khoá', phone: '0930000997', locked: 1 });
  // (người bị khoá thành admin trong tệp để tệp vẫn qua bước kiểm "có admin dùng được")
  f.bang.users = f.bang.users.map((u) => (u.id === 1 ? { ...u, role: 'tieudoi' } : u.id === idKhoa ? { ...u, role: 'admin' } : u));
  const nap = await S.call('POST', '/restore', { confirm: 'NAP LAI', file: f });
  eq('nạp lại được', nap.status === 200 ? 200 : nap.data, 200);
  eq('admin đang nạp: vẫn đăng nhập, vẫn là admin', [(await S.call('GET', '/me')).status, S.one('SELECT role FROM users WHERE id = 1').role], [200, 'admin']);
  eq('admin: PIN mới (đổi sau ngày sao lưu) vẫn dùng được, PIN cũ thì không',
    [await goi('/login', { phone: '0900000001', pin: '2468' }, '10.1.0.1'), await goi('/login', { phone: '0900000001', pin: '8642' }, '10.1.0.1')], [401, 200]);
  eq('PIN đã đặt lại vì lộ: PIN cũ (trong tệp) không vào được', await goi('/login', { phone: '0930000001', pin: '1357' }, '10.1.0.2'), 401);
  eq('PIN đặt lại vẫn dùng được, vẫn phải đổi', [await goi('/login', { phone: '0930000001', pin: moi }, '10.1.0.2'), S.one('SELECT must_change FROM users WHERE id = ?', idLo).must_change], [200, 1]);
  eq('tài khoản bị khoá sau ngày sao lưu: vẫn khoá', [S.one('SELECT locked FROM users WHERE id = ?', idKhoa).locked, await goi('/login', { phone: '0930000002', pin: '1357' }, '10.1.0.3')], [1, 403]);
  eq('tài khoản đã xoá sau ngày sao lưu: vẫn xoá, PIN cũ không vào', [S.one('SELECT deleted FROM users WHERE id = ?', idXoa).deleted, await goi('/login', { phone: '0930000003', pin: '1357' }, '10.1.0.4')], [1, 401]);
  eq('vai trò lấy theo tệp, phiên của người đổi vai trò bị thu hồi', [S.one('SELECT role FROM users WHERE id = ?', idVt).role, (await S.call('GET', '/me', undefined, 'Đổi vai')).status], ['tieudoi', 401]);
  eq('người không đổi gì: giữ phiên', (await S.call('GET', '/me', undefined, 'Giữ nguyên')).status, 200);
  const tep = (id) => S.one('SELECT deleted, locked, must_change FROM users WHERE id = ?', id) || {};
  eq('tài khoản chỉ có trong tệp (đang dùng): về y như tệp, PIN trong tệp vào được, vẫn phải đổi PIN',
    [tep(999), await goi('/login', { phone: '0930000999', pin: '1357' }, '10.1.0.5')], [{ deleted: 0, locked: 0, must_change: 1 }, 200]);
  eq('tài khoản chỉ có trong tệp (đã xoá trong tệp): vẫn xoá, không vào', [tep(998).deleted, await goi('/login', { phone: '0930000998', pin: '1357' }, '10.1.0.5')], [1, 401]);
  eq('tài khoản chỉ có trong tệp (bị khoá trong tệp): vẫn khoá', [tep(997).locked, await goi('/login', { phone: '0930000997', pin: '1357' }, '10.1.0.5')], [1, 403]);
  eq('không còn bản cất tạm trong meta', S.one("SELECT COUNT(*) n FROM meta WHERE key = 'nap_users'").n, 0);
  // tệp không có dòng của admin đang nạp: giữ nguyên dòng của mình
  const f2 = (await S.call('GET', '/backup')).data;
  f2.bang.users = f2.bang.users.filter((u) => u.id !== 1).map((u) => (u.id === idGiu ? { ...u, role: 'admin' } : u));
  eq('tệp thiếu dòng admin đang nạp: vẫn nạp được', (await S.call('POST', '/restore', { confirm: 'NAP LAI', file: f2 })).status, 200);
  eq('admin đang nạp vẫn còn, vẫn đăng nhập', [S.one('SELECT role, deleted FROM users WHERE id = 1'), (await S.call('GET', '/me')).status], [{ role: 'admin', deleted: 0 }, 200]);

  /* ===== 4. Sao lưu ngay tách khỏi bản hằng tuần ===== */
  const kho = () => [...S.env.ANH.obj.keys()].filter((k) => k.startsWith('saoluu/')).sort();
  const tay = () => kho().filter((k) => k.endsWith('_tay.json'));
  // bản cũ chưa có đuôi (trước khi tách) — coi là bản tự động
  datGio(10);
  await S.env.ANH.put('saoluu/2020-01-01_1577836800000.json', JSON.stringify(f2));
  advance(7 * 864e5); datGio(2, 5); await S.cron();
  eq('bản cũ không đuôi + một bản tự động', [kho().length, tay().length], [2, 0]);
  for (let i = 0; i < 7; i++) { advance(3600e3); eq('sao lưu ngay lần ' + (i + 1), (await S.call('POST', '/saoluu', {})).status, 200); }
  eq('sao lưu ngay 7 lần: giữ 5 bản tay, bản tự động không bị đẩy ra', [tay().length, kho().length - tay().length], [5, 2]);
  const ds = (await S.call('GET', '/saoluu')).data;
  eq('danh sách: đánh dấu bản tay, mới trước, báo cả hai mức giữ', [ds.ds.length, ds.ds[0].tay, ds.ds[ds.ds.length - 1].ten, ds.giu, ds.giu_tay], [7, true, '2020-01-01_1577836800000.json', 8, 5]);
  const tai = await S.call('GET', '/saoluu/' + ds.ds[0].ten);
  eq('tải về bản tay được', [tai.status, tai.data && tai.data.app], [200, 'kho-thep']);
  eq('nạp lại từ bản tay', (await S.call('POST', '/restore', { confirm: 'NAP LAI', file: tai.data })).status, 200);
  // bản tay mới không dời lịch tuần: bản tự động gần nhất đã 7 ngày thì lịch vẫn lưu
  datGio(2, 5); for (let i = 0; i < 6; i++) { if (i) advance(864e5); await S.cron(); }
  eq('6 ngày sau: chưa tới tuần, chưa lưu thêm', kho().length - tay().length, 2);
  await S.call('POST', '/saoluu', {});
  advance(864e5); await S.cron();
  eq('đủ tuần: lịch vẫn lưu dù vừa có bản tay hôm qua', kho().length - tay().length, 3);
  for (let i = 0; i < 9; i++) { advance(7 * 864e5); await S.cron(); }
  eq('lâu dài: 8 bản tự động + 5 bản tay', [kho().length - tay().length, tay().length], [8, 5]);
  ok('bản cũ không đuôi đã ra theo hàng tự động', !kho().includes('saoluu/2020-01-01_1577836800000.json'));

  const fail = T.filter((x) => x[0] === 'FAIL');
  console.log(T.map((x) => x[0] + ' | ' + x[1] + (x[2] && x[0] === 'FAIL' ? '  [' + x[2] + ']' : '')).join('\n'));
  console.log('\n=== ' + T.length + ' kiểm tra, ' + fail.length + ' lỗi ===');
  process.exit(fail.length ? 1 : 0);
}
// sập giữa chừng: vẫn in các lỗi đã thấy trước đó (dễ biết sập vì lỗi nào)
main().catch((e) => { console.log(T.filter((x) => x[0] === 'FAIL').map((x) => x.join(' | ')).join('\n')); console.error('CRASH', e); process.exit(2); });
