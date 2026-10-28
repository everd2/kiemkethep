/* Chạy mọi bộ test: npm test
   Không cần mạng, không cần wrangler, không thêm thư viện nào (dùng node:sqlite có sẵn trong Node 22+). */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { donRac, baoDon, envTam } from '../scripts/donrac.mjs';

// dọn rác cũ trước, rồi cho mọi bộ test ghi tệp tạm vào .kt-tmp/ trong repo (ổ D) thay vì ổ C
baoDon(donRac());
const ENV = envTam();

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
  ['Rà soát kho: duyệt lúc nửa đêm tồn đúng số đếm, phiếu duyệt sau lần đếm không sinh việc xem lại, đổi PIN không tự khoá, phi tên lạ', 'khoroasoat.test.mjs'],
  ['Lõi tính tồn (v70): phiếu không cộng lên số đếm, số đếm chuyển qua 0h, huỷ phiếu luôn được, thẻ Duyệt tham chiếu, phi_rate cũ', 'kho3.test.mjs'],
  ['Báo cáo sản lượng: quyền, quân số lấy từ báo cáo ca, (công x 158 x tỷ lệ gia công) / tỷ lệ giá, bản chữ', 'sanluong.test.mjs'],
  ['Bấm loạn: mọi nút trên mọi màn, hai lượt (Quay lại / Đồng ý), không lỗi JavaScript, không bị khoá ngoài', 'bam.test.mjs'],
  ['Chuyển màn không chờ trắng: mở lại mọi màn hiện ngay, tải sẵn màn hay dùng, mỗi lần mở <= 3 lượt gọi', 'chuyenman.test.mjs'],
  ['Sổ thép về công trình: quyền giao bởi admin đầu tiên, chuyến về, đơn hàng, nhập Excel, thống kê', 'thepve.test.mjs'],
  ['Sao lưu tự động hằng tuần lên R2: lịch 2h sáng, giữ 8 bản, nạp lại được, một lượt gọi D1, chỉ admin đầu tiên', 'saoluu.test.mjs'],
  ['Sửa lỗi sau rà soát: đăng nhập song song, huỷ phiếu không chặn tồn, gửi trùng, ngày vay mượn', 'suaroi.test.mjs'],
  ['Vá bảo mật đợt 2: trần sai PIN / token theo mạng khi gửi song song, nạp bản sao không lùi PIN / khoá / xoá, sao lưu tay tách bản tuần', 'baomat2.test.mjs'],
  ['Sửa đợt 4: huỷ sắt vụn khi lên chức, quân số mất sóng bị từ chối, ô số "1.500", số thiết lập ca đã qua', 'sua4.test.mjs'],
  ['Tách tồn khỏi phiếu (v70): tồn = số đếm đã duyệt, phiếu chỉ thống kê, không chặn, Duyệt khu chỉ duyệt số đếm', 'tachton.test.mjs'],
];

const run = (file) =>
  new Promise((resolve) => {
    const p = spawn(process.execPath, ['--no-warnings', path.join(here, file), root], { cwd: root, env: ENV });
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
