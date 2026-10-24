/* Chạy mọi bộ test: npm test
   Không cần mạng, không cần wrangler, không thêm thư viện nào (dùng node:sqlite có sẵn trong Node 22+). */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const SUITES = [
  ['Logic nghiệp vụ (worker thật + SQLite thật)', 'server.test.mjs'],
  ['Giao diện: mọi màn hình render được', 'ui-render.test.js'],
  ['Giao diện: bố cục cuộn từng màn', 'layout.test.js'],
  ['Giao diện: hành vi các thao tác', 'ui-logic.test.js'],
  ['Mô phỏng bãi nhiều ngày + dữ liệu sai', 'sim.test.mjs'],
  ['Gia công cấu kiện: giao đơn, tiến độ, quyền từng việc', 'giacong.test.mjs'],
  ['Quân số đầu ca: báo theo ca, ca đêm vắt ngày, ghi thay, quyền', 'quanso.test.mjs'],
  ['Báo cáo ca: ghép đúng mẫu, sửa tay, mẫu, chép', 'baocao.test.mjs'],
  ['Thống kê quân số: chép số ca tổ không báo, % nghỉ, quyền', 'thongke.test.mjs'],
  ['Phân quyền: bảng quyền + mô phỏng ngẫu nhiên đối chiếu máy/server', 'roles.test.mjs'],
  ['Tải lại kèm lệnh ghi (một vòng mạng mỗi lần lưu) + hạn chờ lời gọi', 'kem.test.mjs'],
  ['Ảnh biên bản: tải lên, xem, xoá, quyền, R2 lỗi', 'anh.test.mjs'],
  ['Vá bảo mật: CSV công thức, đổi PIN, ảnh gửi dồn', 'baomat.test.mjs'],
  ['Rà soát: LIMIT âm, ngày không có thật', 'roasoat.test.mjs'],
  ['Báo cáo sản lượng: quyền, công x 158 kg / (tỷ lệ giá x tỷ lệ gia công), khoảng tỷ lệ, bản chữ', 'sanluong.test.mjs'],
  ['Sửa lỗi sau rà soát: đăng nhập song song, huỷ phiếu âm tồn, gửi trùng, ngày vay mượn', 'suaroi.test.mjs'],
];

const run = (file) =>
  new Promise((resolve) => {
    const p = spawn(process.execPath, ['--no-warnings', path.join(here, file), root], { cwd: root });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('close', (code) => resolve({ code, out }));
  });

let bad = 0;
for (const [name, file] of SUITES) {
  const { code, out } = await run(file);
  const tail = out.trim().split('\n').slice(-1)[0];
  console.log((code ? '✗' : '✓') + ' ' + name + '\n  ' + tail.replace(/^=== | ===$/g, ''));
  if (code) {
    bad++;
    console.log(out.split('\n').filter((l) => /^FAIL|BAD|CRASH|Error/.test(l)).map((l) => '  ' + l).join('\n'));
  }
}
console.log(bad ? '\n' + bad + '/' + SUITES.length + ' bộ test có lỗi' : '\nTất cả bộ test đã qua');
process.exit(bad ? 1 : 0);
