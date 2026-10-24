/* Hồi quy đợt rà soát: LIMIT âm ở /audit và /usage, ngày không có thật ở sắt vụn và báo cáo ca, đổi thứ tự người phụ ở đơn gia công.
   node roasoat.test.mjs <đường-dẫn-repo> */
import { boot, vnDay } from './harness.mjs';

const ROOT = process.argv[2] || '.';
const T = [];
const ok = (name, cond, extra) => { T.push([cond ? 'PASS' : 'FAIL', name, extra === undefined ? '' : String(extra)]); };
const eq = (name, a, b) => ok(name + ' = ' + JSON.stringify(b), JSON.stringify(a) === JSON.stringify(b), 'thực tế: ' + JSON.stringify(a));

async function main() {
  const S = await boot(ROOT);
  await S.call('POST', '/setup', { token: 'setup-tok', name: 'Admin', phone: '0900000001', pin: '2468' });
  await S.login('Admin', '0900000001', '2468');

  // 1. limit/days âm hoặc lẻ không được thành "không giới hạn"
  for (let i = 0; i < 20; i++) S.raw.prepare("INSERT INTO audit (ts, user_id, user_name, action, detail) VALUES (?,?,?,?,?)").run(Date.now() + i, 1, 'Admin', 'x', '{}');
  const a1 = await S.call('GET', '/audit?limit=-1', undefined, 'Admin');
  eq('audit?limit=-1 vẫn 200', a1.status, 200);
  ok('audit?limit=-1 không trả cả nhật ký', a1.data.items.length <= 1, a1.data.items.length);
  const a2 = await S.call('GET', '/audit?limit=2.5', undefined, 'Admin');
  eq('audit?limit=2.5 trả 2 dòng', a2.data.items.length, 2);
  for (let i = 1; i <= 3; i++) S.raw.prepare("INSERT INTO day_close (day, closed_by, ts, note, used_json, exc_json, span) VALUES (?,?,?,?,?,?,?)").run('2026-01-0' + i, 1, Date.now(), '', '{}', '[]', 1);
  const u1 = await S.call('GET', '/usage?days=-1', undefined, 'Admin');
  eq('usage?days=-1 chỉ 1 ngày', u1.data.items.length, 1);
  const u2 = await S.call('GET', '/usage?days=1.5', undefined, 'Admin');
  eq('usage?days=1.5 chỉ 1 ngày', [u2.status, u2.data.items.length], [200, 1]);

  // 2. sắt vụn: ngày không có thật bị từ chối
  const sv = (ngay) => S.call('POST', '/satvun', { ngay, tan: '1', noi: 'Cty A', so_phieu: 'P' + ngay }, 'Admin');
  const t = vnDay();
  eq('sắt vụn: 31/02 bị từ chối', (await sv(t.slice(0, 5) + '02-31')).status, 400);
  eq('sắt vụn: ngày thật vẫn ghi được', (await sv(t)).status, 200);

  // 3. báo cáo ca: ngày không có thật không làm sập
  eq('báo cáo ca: 0000-00-00 là 400, không phải 500', (await S.call('GET', '/baocao?ngay=0000-00-00&ca=1', undefined, 'Admin')).status, 400);
  eq('báo cáo ca: 2026-02-31 là 400', (await S.call('GET', '/baocao?ngay=2026-02-31&ca=1', undefined, 'Admin')).status, 400);

  // 4. phi: kg_per_cay phải là số; đổi bo_size khi còn thép bị từ chối
  eq('phi: kg_per_cay = true bị từ chối', (await S.call('PATCH', '/phi/D6', { kg_per_cay: true }, 'Admin')).status, 400);
  eq('phi: kg_per_cay là số vẫn lưu', (await S.call('PATCH', '/phi/D6', { kg_per_cay: 21 }, 'Admin')).status, 200);
  const khu = S.one('SELECT id FROM khu LIMIT 1');
  if (khu) {
    S.raw.prepare("INSERT INTO baseline (day, khu_id, phi_id, v) VALUES ('2026-01-03', ?, 'D6', 5)").run(khu.id);
    eq('phi còn thép: đổi bo_size bị từ chối', (await S.call('PATCH', '/phi/D6', { bo_size: 50 }, 'Admin')).status, 400);
  }

  // 5. CSV: tên khu và tên người bắt đầu bằng = không thành công thức
  await S.call('POST', '/khu', { name: '=HYPERLINK("x")' }, 'Admin');
  const cs = await S.call('GET', '/export', undefined, 'Admin');
  ok('export tồn: tên khu công thức được bọc', cs.data.includes('"=""=HYPERLINK'), '');

  const fail = T.filter((x) => x[0] === 'FAIL');
  console.log(T.map((x) => x[0] + ' | ' + x[1] + (x[2] && x[0] === 'FAIL' ? '  [' + x[2] + ']' : '')).join('\n'));
  console.log('\n=== ' + T.length + ' kiểm tra, ' + fail.length + ' lỗi ===');
  process.exit(fail.length ? 1 : 0);
}
main().catch((e) => { console.error('CRASH', e); process.exit(2); });
