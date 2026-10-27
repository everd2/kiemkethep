/* Sao lưu tự động hằng tuần lên R2: node saoluu.test.mjs <đường-dẫn-repo>
   Những điều tính năng này hứa:
   1. Lịch mỗi giờ: đúng 2h sáng giờ Việt Nam, bản mới nhất cũ hơn ~6,5 ngày (hoặc chưa có) thì lưu MỘT bản; giờ khác / chưa đủ tuần thì không.
   2. Giữ 8 bản mới nhất, bản cũ hơn tự xoá.
   3. Bản trên kho y hệt "Tải bản sao toàn bộ" và NẠP LẠI được bằng đúng chỗ nạp sẵn có.
   4. Đọc mọi bảng trong MỘT lượt gọi D1 (lịch mỗi giờ gói miễn phí chỉ ~50 lượt mỗi lần chạy).
   5. Xem / tải / sao lưu ngay: chỉ admin đầu tiên. */
import { advance, boot } from './harness.mjs';

const ROOT = process.argv[2] || '.';
const T = [];
const ok = (name, cond, extra) => { T.push([cond ? 'PASS' : 'FAIL', name, extra === undefined ? '' : String(extra)]); };
const eq = (name, a, b) => ok(name + ' = ' + JSON.stringify(b), JSON.stringify(a) === JSON.stringify(b), 'thực tế: ' + JSON.stringify(a));
// đưa đồng hồ tới h:m giờ Việt Nam kế tiếp
const datGio = (h, m = 0) => { const cur = ((Date.now() + 7 * 3600e3) % 864e5) / 60e3; let d = h * 60 + m - cur; if (d <= 0) d += 1440; advance(d * 60e3); };

async function main() {
  const S = await boot(ROOT);
  await S.call('POST', '/setup', { token: 'setup-tok', name: 'Admin', phone: '0900000001', pin: '2468' });
  await S.login('Admin', '0900000001', '2468');
  const r = await S.call('POST', '/users', { name: 'Admin Hai', phone: '0900000002', role: 'admin' }, 'Admin');
  await S.login('Admin Hai', '0900000002', r.data.pin);
  await S.call('POST', '/change-pin', { pin: r.data.pin, newPin: '1357' }, 'Admin Hai');
  await S.call('POST', '/khu', { name: 'Khu thử sao lưu', id: 'SL' }, 'Admin');
  const kho = () => [...S.env.ANH.obj.keys()].filter((k) => k.startsWith('saoluu/')).sort();

  /* ===== 1. Quyền ===== */
  eq('admin thứ hai: không xem danh sách', (await S.call('GET', '/saoluu', undefined, 'Admin Hai')).status, 403);
  eq('admin thứ hai: không sao lưu ngay', (await S.call('POST', '/saoluu', {}, 'Admin Hai')).status, 403);
  eq('chưa có bản nào', (await S.call('GET', '/saoluu', undefined, 'Admin')).data.ds, []);

  /* ===== 2. Sao lưu ngay, tải về, nạp lại ===== */
  const n0 = await S.call('POST', '/saoluu', {}, 'Admin');
  eq('sao lưu ngay lên kho', [n0.status, kho().length], [200, 1]);
  const ds = (await S.call('GET', '/saoluu', undefined, 'Admin')).data;
  eq('danh sách có đúng bản đó, giữ 8 bản', [ds.ds.length, ds.ds[0].ten, ds.giu], [1, n0.data.ten, 8]);
  eq('admin thứ hai không tải được', (await S.call('GET', '/saoluu/' + n0.data.ten, undefined, 'Admin Hai')).status, 403);
  eq('tên lạ: 404', (await S.call('GET', '/saoluu/..%2Fsessions', undefined, 'Admin')).status, 404);
  const tai = await S.call('GET', '/saoluu/' + n0.data.ten, undefined, 'Admin');
  const f = tai.data;
  ok('tệp tải về đúng định dạng bản sao, có khu vừa tạo', f && f.app === 'kho-thep' && f.bang && f.bang.khu.some((k) => k.id === 'SL'), JSON.stringify(f).slice(0, 100));
  const tay = (await S.call('GET', '/backup', undefined, 'Admin')).data;
  eq('cùng bảng với "Tải bản sao toàn bộ"', Object.keys(f.bang).sort(), Object.keys(tay.bang).sort());
  await S.call('PATCH', '/khu/SL', { name: 'Đổi tên sau khi lưu' }, 'Admin');
  eq('nạp lại từ bản trên kho', (await S.call('POST', '/restore', { confirm: 'NAP LAI', file: f }, 'Admin')).status, 200);
  eq('dữ liệu về đúng như lúc lưu', S.one("SELECT name FROM khu WHERE id = 'SL'").name, 'Khu thử sao lưu');

  /* ===== 3. Một lượt gọi D1 ===== */
  let luot = 0;
  const p0 = S.DB.prepare.bind(S.DB), b0 = S.DB.batch.bind(S.DB);
  S.DB.batch = async (st) => { luot++; return b0(st); };
  const P = Object.getPrototypeOf(p0('select 1')), a0 = P.all, r0 = P.run;
  P.all = function (...x) { luot++; return a0.apply(this, x); };
  P.run = function (...x) { luot++; return r0.apply(this, x); };
  luot = 0; await S.call('GET', '/backup', undefined, 'Admin');
  ok('tải bản sao: đọc mọi bảng trong một lượt (cả lượt kiểm phiên + nhật ký: không quá 5)', luot <= 5, luot + ' lượt');
  S.DB.batch = b0; P.all = a0; P.run = r0;

  /* ===== 4. Lịch mỗi giờ ===== */
  datGio(3, 5);
  await S.cron();
  eq('3h sáng: không sao lưu', kho().length, 1);
  datGio(2, 5);
  await S.cron();
  eq('2h sáng nhưng bản mới nhất chưa đủ tuần: không lưu thêm', kho().length, 1);
  for (let i = 0; i < 10; i++) { advance(7 * 864e5); await S.cron(); }
  eq('mỗi tuần 2h sáng: một bản, giữ 8 bản mới nhất', kho().length, 8);
  ok('bản cũ nhất đã bị xoá', !kho().includes('saoluu/' + n0.data.ten), kho()[0]);
  eq('nhật ký ghi lại các lần lưu lên kho', S.sql("SELECT 1 FROM audit WHERE action = 'backup_kho'").length, 11);

  const fail = T.filter((x) => x[0] === 'FAIL');
  console.log(T.map((x) => x[0] + ' | ' + x[1] + (x[2] && x[0] === 'FAIL' ? '  [' + x[2] + ']' : '')).join('\n'));
  console.log('\n=== ' + T.length + ' kiểm tra, ' + fail.length + ' lỗi ===');
  process.exit(fail.length ? 1 : 0);
}
main().catch((e) => { console.error('CRASH', e); process.exit(2); });
