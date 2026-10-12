/* Gia công cấu kiện, kiểm trên worker thật + SQLite thật. node giacong.test.mjs <đường-dẫn-repo>
   Ba điều tính năng này hứa:
   1. Ai cũng XEM được mọi đơn của mọi Tiểu đội trưởng.
   2. Chỉ người ĐƯỢC GIAO nhận đơn, cập nhật tiến độ, báo vướng và xác nhận xong — cấp trên cũng không làm thay.
   3. Giao, sửa, giao lại, huỷ, mở lại đơn đã xong: từ CVKTHT trở lên. */
import { boot, addDays, advance, vnDay } from './harness.mjs';

const ROOT = process.argv[2] || '.';
const T = [];
const ok = (name, cond, extra) => { T.push([cond ? 'PASS' : 'FAIL', name, extra === undefined ? '' : String(extra)]); };
const eq = (name, a, b) => ok(name + ' = ' + JSON.stringify(b), JSON.stringify(a) === JSON.stringify(b), 'thực tế: ' + JSON.stringify(a));

async function main() {
  const S = await boot(ROOT);
  await S.call('POST', '/setup', { token: 'setup-tok', name: 'Admin', phone: '0900000001', pin: '2468' });
  await S.login('Admin', '0900000001', '2468');
  const U = {};
  const mk = async (name, phone, role) => {
    const r = await S.call('POST', '/users', { name, phone, role }, 'Admin');
    await S.login(name, phone, r.data.pin);
    await S.call('POST', '/change-pin', { pin: r.data.pin, newPin: '1357' }, name);
    U[name] = r.data.id;
  };
  await mk('An', '0900000002', 'tieudoi');
  await mk('Binh', '0900000003', 'tieudoi');
  await mk('Cv', '0900000004', 'cvktht');
  await mk('Trung', '0900000005', 'trungdoi');
  const today = vnDay(), mai = vnDay(Date.now() + 864e5);
  const don = (o = {}) => ({ cau_kien: 'Dầm D3', hang_muc: 'Khối A, tầng 5', truc: 'X12-X17 / Y3-Y5', noi_dung: '2,4 tấn', user: U.An, han: mai, buoi: 'chieu', ...o });
  const viec = (id, v, body, who) => S.call('POST', `/giacong/${id}/${v}`, body || {}, who);
  const xem = async (id, who = 'Admin') => (await S.call('GET', '/giacong/' + id, undefined, who)).data;
  const rev = () => S.one("SELECT value FROM meta WHERE key = 'rev'").value;

  /* ===== 1. Giao đơn ===== */
  eq('Tiểu đội trưởng không giao được đơn', (await S.call('POST', '/giacong', don(), 'An')).status, 403);
  eq('thiếu tên cấu kiện: từ chối', (await S.call('POST', '/giacong', don({ cau_kien: '  ' }), 'Cv')).status, 400);
  eq('hạn trước hôm nay: từ chối', (await S.call('POST', '/giacong', don({ han: vnDay(Date.now() - 864e5) }), 'Cv')).status, 400);
  eq('hạn không phải ngày: từ chối', (await S.call('POST', '/giacong', don({ han: 'mai' }), 'Cv')).status, 400);
  eq('ngày không có thật (31/02): từ chối', (await S.call('POST', '/giacong', don({ han: today.slice(0, 4) - -1 + '-02-31' }), 'Cv')).status, 400);
  eq('hạn xa quá một năm (gõ nhầm năm): từ chối', (await S.call('POST', '/giacong', don({ han: vnDay(Date.now() + 500 * 864e5) }), 'Cv')).status, 400);
  eq('buổi lạ: từ chối', (await S.call('POST', '/giacong', don({ buoi: 'toi' }), 'Cv')).status, 400);
  eq('giao cho CVKTHT: từ chối (chỉ giao cho Tiểu đội trưởng)', (await S.call('POST', '/giacong', don({ user: U.Cv }), 'Cv')).status, 400);
  eq('giao cho người không có: từ chối', (await S.call('POST', '/giacong', don({ user: 99999 }), 'Cv')).status, 400);
  eq('các lần bị từ chối không để lại đơn nào', S.one('SELECT COUNT(*) n FROM don_gc').n, 0);
  const rev0 = rev();
  const r1 = await S.call('POST', '/giacong', don(), 'Cv');
  eq('CVKTHT giao đơn được', r1.status, 200);
  const id = r1.data.id;
  ok('trả về id đơn vừa giao', Number.isInteger(id) && id > 0, JSON.stringify(r1.data));
  ok('giao đơn làm tăng rev (máy khác tự tải lại)', rev() > rev0);
  const d1 = (await xem(id)).don;
  eq('đơn mới: mới giao, 0%, đúng người, đúng người giao', [d1.tt, d1.pct, d1.uname, d1.giao_name, d1.truc, d1.han, d1.buoi], ['moi', 0, 'An', 'Cv', 'X12-X17 / Y3-Y5', mai, 'chieu']);
  eq('nhật ký ghi lần giao', JSON.parse(S.one("SELECT detail FROM audit WHERE action = 'gc_giao'").detail).cho, 'An');

  /* ===== 2. Ai cũng xem được mọi đơn ===== */
  const r2 = await S.call('POST', '/giacong', don({ cau_kien: 'Cột C2', user: U.Binh, han: today, buoi: null }), 'Trung');
  const id2 = r2.data.id;
  for (const who of ['An', 'Binh', 'Cv', 'Trung', 'Admin']) {
    const l = await S.call('GET', '/giacong', undefined, who);
    eq(who + ' thấy đủ đơn của mọi Tiểu đội trưởng', [l.status, l.data.items.map((x) => x.uname).sort()], [200, ['An', 'Binh']]);
  }
  eq('An xem được chi tiết đơn của Binh', (await S.call('GET', '/giacong/' + id2, undefined, 'An')).status, 200);
  eq('danh sách kèm các Tiểu đội trưởng để chọn khi giao', (await S.call('GET', '/giacong', undefined, 'Cv')).data.tdt.map((x) => x.name), ['An', 'Binh']);
  eq('đơn không có: 404', (await S.call('GET', '/giacong/99999', undefined, 'An')).status, 404);
  eq('mã đơn không phải số: 404, không phải lỗi máy chủ', [(await S.call('GET', '/giacong/abc', undefined, 'An')).status, (await S.call('POST', '/giacong/abc/nhan', {}, 'An')).status, (await S.call('PATCH', '/giacong/1.5', don(), 'Cv')).status], [404, 404, 404]);

  /* ===== 3. Chỉ người được giao làm việc trên đơn ===== */
  for (const who of ['Binh', 'Cv', 'Trung', 'Admin']) {
    eq(who + ' không nhận thay đơn của An', (await viec(id, 'nhan', {}, who)).status, 403);
    eq(who + ' không xác nhận xong thay An', (await viec(id, 'xong', {}, who)).status, 403);
  }
  eq('chưa nhận thì chưa cập nhật tiến độ được', (await viec(id, 'tiendo', { pct: 25 }, 'An')).status, 409);
  eq('chưa nhận thì chưa xác nhận xong được', (await viec(id, 'xong', {}, 'An')).status, 409);
  eq('An nhận đơn', (await viec(id, 'nhan', {}, 'An')).status, 200);
  eq('nhận lần hai: từ chối', (await viec(id, 'nhan', {}, 'An')).status, 409);
  eq('đơn thành đã nhận', (await xem(id)).don.tt, 'nhan');
  eq('tiến độ ngoài nấc: từ chối', (await viec(id, 'tiendo', { pct: 30 }, 'An')).status, 400);
  eq('100% không đi đường tiến độ (phải xác nhận xong)', (await viec(id, 'tiendo', { pct: 100 }, 'An')).status, 400);
  eq('tiến độ không đổi và không ghi chú: từ chối', (await viec(id, 'tiendo', { pct: 0 }, 'An')).status, 400);
  advance(1000);
  eq('An báo 50%', (await viec(id, 'tiendo', { pct: 50, note: 'xong đai, đang uốn chủ' }, 'An')).status, 200);
  eq('đơn thành đang làm 50%', [(await xem(id)).don.tt, (await xem(id)).don.pct], ['lam', 50]);
  eq('Cv không sửa tiến độ thay An', (await viec(id, 'tiendo', { pct: 75 }, 'Cv')).status, 403);
  eq('báo vướng phải có lý do', (await viec(id, 'vuong', { ly_do: ' ' }, 'An')).status, 400);
  eq('An báo vướng', (await viec(id, 'vuong', { ly_do: 'Thiếu D16' }, 'An')).status, 200);
  eq('đơn mang cờ vướng, trạng thái và tiến độ giữ nguyên', [(await xem(id)).don.vuong, (await xem(id)).don.tt, (await xem(id)).don.pct], ['Thiếu D16', 'lam', 50]);
  eq('Binh không gỡ vướng thay An', (await viec(id, 'hetvuong', {}, 'Binh')).status, 403);
  eq('An báo hết vướng', (await viec(id, 'hetvuong', {}, 'An')).status, 200);
  eq('hết vướng lần hai: từ chối', (await viec(id, 'hetvuong', {}, 'An')).status, 409);
  eq('việc lạ: 404', (await viec(id, 'xoa', {}, 'An')).status, 404);

  /* ===== 4. Bootstrap: đơn còn mở để Tổng quan nhắc ===== */
  const bt = (await S.call('GET', '/bootstrap', undefined, 'An')).data;
  eq('bootstrap gửi các đơn còn mở', bt.gc.map((x) => [x.user_id, x.tt, x.han]).sort(), [[U.An, 'lam', mai], [U.Binh, 'moi', today]].sort());

  /* ===== 5. Sửa đơn, giao lại ===== */
  eq('Tiểu đội trưởng không sửa được đơn', (await S.call('PATCH', '/giacong/' + id, don(), 'An')).status, 403);
  const n0 = S.one('SELECT COUNT(*) n FROM don_gc_log WHERE don_id = ?', id).n;
  eq('sửa mà không đổi gì: không ghi thêm lịch sử', [(await S.call('PATCH', '/giacong/' + id, don(), 'Cv')).data.doi, S.one('SELECT COUNT(*) n FROM don_gc_log WHERE don_id = ?', id).n], [0, n0]);
  const han2 = vnDay(Date.now() + 3 * 864e5);
  eq('Cv dời hạn', (await S.call('PATCH', '/giacong/' + id, don({ han: han2 }), 'Cv')).status, 200);
  const sua = (await xem(id)).log[0];
  ok('lịch sử ghi rõ hạn cũ và hạn mới', sua.viec === 'sua' && sua.note.includes('→') && sua.uname === 'Cv', JSON.stringify(sua));
  eq('dời hạn không đụng tới tiến độ', [(await xem(id)).don.han, (await xem(id)).don.tt, (await xem(id)).don.pct], [han2, 'lam', 50]);
  eq('Trung giao lại đơn cho Binh', (await S.call('PATCH', '/giacong/' + id, don({ han: han2, user: U.Binh }), 'Trung')).status, 200);
  eq('giao lại: đơn về mới giao, người mới phải tự nhận', [(await xem(id)).don.uname, (await xem(id)).don.tt], ['Binh', 'moi']);
  eq('An không còn làm được gì trên đơn đã giao cho Binh', (await viec(id, 'tiendo', { pct: 75 }, 'An')).status, 403);
  eq('Binh nhận đơn được giao lại', (await viec(id, 'nhan', {}, 'Binh')).status, 200);

  /* ===== 6. Xác nhận xong, mở lại ===== */
  eq('Tiểu đội trưởng không mở lại được đơn', (await viec(id, 'molai', { ly_do: 'x' }, 'Binh')).status, 403);
  eq('đơn chưa xong thì không mở lại được', (await viec(id, 'molai', { ly_do: 'thiếu đai' }, 'Cv')).status, 409);
  advance(1000);
  eq('Binh xác nhận xong', (await viec(id, 'xong', { note: 'đủ 120 thanh' }, 'Binh')).status, 200);
  const dx = (await xem(id)).don;
  ok('đơn xong: 100%, có giờ xong, hết cờ vướng', dx.tt === 'xong' && dx.pct === 100 && dx.xong_ts > 0 && dx.vuong === null, JSON.stringify(dx));
  eq('xong rồi thì không cập nhật tiến độ nữa', (await viec(id, 'tiendo', { pct: 25 }, 'Binh')).status, 409);
  eq('xong rồi thì không sửa được', (await S.call('PATCH', '/giacong/' + id, don(), 'Cv')).status, 409);
  eq('xong rồi thì không huỷ được', (await viec(id, 'huy', { ly_do: 'x' }, 'Cv')).status, 409);
  eq('đơn đã xong không còn trong bootstrap', (await S.call('GET', '/bootstrap', undefined, 'An')).data.gc.length, 1);
  eq('mở lại phải có lý do', (await viec(id, 'molai', {}, 'Cv')).status, 400);
  eq('Cv mở lại đơn', (await viec(id, 'molai', { ly_do: 'thiếu 4 thanh đai trục X14' }, 'Cv')).status, 200);
  const dm = (await xem(id)).don;
  eq('mở lại: về đang làm 75%, bỏ giờ xong', [dm.tt, dm.pct, dm.xong_ts], ['lam', 75, null]);
  eq('lý do mở lại nằm trong lịch sử đơn và nhật ký', [(await xem(id)).log[0].note, JSON.parse(S.one("SELECT detail FROM audit WHERE action = 'gc_molai'").detail).ly_do], ['thiếu 4 thanh đai trục X14', 'thiếu 4 thanh đai trục X14']);
  eq('đơn mang lý do bị mở lại, và bootstrap gửi nó cho người giữ đơn', [dm.mo_lai, (await S.call('GET', '/bootstrap', undefined, 'Binh')).data.gc.find((x) => x.user_id === U.Binh && x.tt === 'lam').mo_lai], ['thiếu 4 thanh đai trục X14', 'thiếu 4 thanh đai trục X14']);
  eq('Binh xác nhận xong lần nữa', (await viec(id, 'xong', {}, 'Binh')).status, 200);
  eq('xong lần nữa thì hết cờ bị mở lại', (await xem(id)).don.mo_lai, null);

  /* ===== 7. Huỷ đơn ===== */
  eq('Tiểu đội trưởng không huỷ được đơn', (await viec(id2, 'huy', { ly_do: 'x' }, 'Binh')).status, 403);
  eq('huỷ phải có lý do', (await viec(id2, 'huy', { ly_do: '' }, 'Cv')).status, 400);
  eq('Cv huỷ đơn', (await viec(id2, 'huy', { ly_do: 'Đổi thiết kế' }, 'Cv')).status, 200);
  eq('đơn đã huỷ giữ lý do', [(await xem(id2)).don.tt, (await xem(id2)).don.huy_ly_do], ['huy', 'Đổi thiết kế']);
  eq('đơn đã huỷ thì người được giao không nhận được nữa', (await viec(id2, 'nhan', {}, 'Binh')).status, 409);
  eq('huỷ lần hai: từ chối', (await viec(id2, 'huy', { ly_do: 'x' }, 'Cv')).status, 409);
  eq('bootstrap: không còn đơn mở nào, chỉ còn đơn vừa huỷ để nhắc người giữ nó', (await S.call('GET', '/bootstrap', undefined, 'Cv')).data.gc.map((x) => [x.user_id, x.tt]), [[U.Binh, 'huy']]);
  eq('đơn xong và đơn huỷ vẫn nằm trên bảng chung', (await S.call('GET', '/giacong', undefined, 'An')).data.items.map((x) => x.tt).sort(), ['huy', 'xong']);

  /* ===== 8. Hai người ghi cùng lúc: lần ghi dựa trên bản cũ bị từ chối =====
     Người giao dời hạn đúng lúc người làm bấm lưu tiến độ. Dựng lại bằng cách để câu đọc đơn trả về
     bản cũ: chèn một lần cập nhật vào giữa lúc đọc và lúc ghi. */
  {
    const r = await S.call('POST', '/giacong', don({ cau_kien: 'Sàn S1' }), 'Cv');
    const id3 = r.data.id;
    await viec(id3, 'nhan', {}, 'An');
    const goc = S.DB.batch.bind(S.DB);
    let chen = true;
    S.DB.batch = async (stmts) => {
      if (chen) { chen = false; S.raw.exec('UPDATE don_gc SET cap_ts = cap_ts + 5 WHERE id = ' + id3); }
      return goc(stmts);
    };
    const rr = await viec(id3, 'tiendo', { pct: 25 }, 'An');
    S.DB.batch = goc;
    eq('đơn vừa đổi giữa lúc đọc và lúc ghi: từ chối, bảo tải lại', [rr.status, rr.data.code], [409, 'changed']);
    eq('và không ghi nửa chừng: tiến độ giữ nguyên, lịch sử không thêm dòng', [(await xem(id3)).don.pct, (await xem(id3)).log.filter((l) => l.viec === 'tiendo').length], [0, 0]);
  }

  /* ===== 9. Người được giao đổi vai trò / bị xoá: đơn không mất ===== */
  {
    const r = await S.call('POST', '/giacong', don({ cau_kien: 'Vách V1' }), 'Cv');
    const id4 = r.data.id;
    await S.call('POST', `/users/${U.An}/role`, { role: 'cvktht', confirm_khu: true }, 'Admin');
    eq('An lên CVKTHT: đơn đang giữ vẫn còn, vẫn đứng tên An', (await xem(id4)).don.uname, 'An');
    eq('sửa hạn mà giữ nguyên An: được', (await S.call('PATCH', '/giacong/' + id4, don({ cau_kien: 'Vách V1', han: vnDay(Date.now() + 5 * 864e5) }), 'Trung')).status, 200);
    eq('giao đơn MỚI cho An (không còn là Tiểu đội trưởng): từ chối', (await S.call('POST', '/giacong', don(), 'Trung')).status, 400);
    eq('An không còn trong danh sách chọn', (await S.call('GET', '/giacong', undefined, 'Cv')).data.tdt.map((x) => x.name), ['Binh']);
    eq('giao lại đơn đó cho Binh: được', (await S.call('PATCH', '/giacong/' + id4, don({ cau_kien: 'Vách V1', user: U.Binh }), 'Trung')).status, 200);
  }

  /* ===== 10. Trễ hạn, và đơn cũ rời bảng chung sau 30 ngày ===== */
  {
    addDays(2);
    advance(60e3);
    const bt2 = (await S.call('GET', '/bootstrap', undefined, 'Binh')).data;
    ok('đơn huỷ quá 2 ngày thì thôi nhắc', !bt2.gc.some((x) => x.tt === 'huy'), JSON.stringify(bt2.gc));
    ok('qua hạn: đơn còn mở vẫn nằm trong bootstrap với hạn đã qua (máy tự tính trễ)', bt2.gc.some((x) => x.han < bt2.today), JSON.stringify(bt2.gc));
    const d = (await S.call('GET', '/giacong', undefined, 'Binh')).data.items.find((x) => x.cau_kien === 'Sàn S1');
    eq('sửa đơn đã trễ mà giữ nguyên hạn cũ: được (chỉ đổi nội dung)', (await S.call('PATCH', '/giacong/' + d.id, { cau_kien: 'Sàn S1', truc: 'X1-X2', user: d.user_id, han: d.han }, 'Cv')).status, 200);
    eq('nhưng đặt hạn MỚI vào ngày đã qua thì không', (await S.call('PATCH', '/giacong/' + d.id, { cau_kien: 'Sàn S1', user: d.user_id, han: vnDay(Date.now() - 2 * 864e5) }, 'Cv')).status, 400);
    addDays(40);
    // phiên đăng nhập sống 30 ngày: qua 40 ngày thì phải đăng nhập lại
    await S.login('Binh', '0900000003', '1357'); await S.login('Admin', '0900000001', '2468');
    const l = (await S.call('GET', '/giacong', undefined, 'Binh')).data.items;
    ok('sau 40 ngày: đơn xong / huỷ đã rời bảng, đơn còn mở vẫn ở lại', l.length > 0 && l.every((x) => ['moi', 'nhan', 'lam'].includes(x.tt)), l.map((x) => x.cau_kien + ':' + x.tt).join(', '));
    eq('đơn cũ vẫn xem lại được theo id (không xoá)', (await xem(id)).don.tt, 'xong');
  }

  /* ===== 11. Sao lưu / nạp lại giữ đơn gia công ===== */
  {
    const bk = await S.call('GET', '/backup', undefined, 'Admin');
    const n = S.one('SELECT COUNT(*) n FROM don_gc').n, nl = S.one('SELECT COUNT(*) n FROM don_gc_log').n;
    eq('bản sao có đủ đơn và lịch sử đơn', [bk.data.bang.don_gc.length, bk.data.bang.don_gc_log.length], [n, nl]);
    S.raw.exec('DELETE FROM don_gc; DELETE FROM don_gc_log');
    eq('nạp lại bản sao', (await S.call('POST', '/restore', { confirm: 'NAP LAI', file: bk.data }, 'Admin')).status, 200);
    eq('đơn và lịch sử đơn trở lại đủ', [S.one('SELECT COUNT(*) n FROM don_gc').n, S.one('SELECT COUNT(*) n FROM don_gc_log').n], [n, nl]);
    const cu = { ...bk.data, bang: { ...bk.data.bang } };
    delete cu.bang.don_gc; delete cu.bang.don_gc_log;
    eq('nạp bản sao CHƯA có bảng đơn gia công', (await S.call('POST', '/restore', { confirm: 'NAP LAI', file: cu }, 'Admin')).status, 200);
    eq('thì đơn đang có được giữ nguyên, không bị xoá sạch', [S.one('SELECT COUNT(*) n FROM don_gc').n, S.one('SELECT COUNT(*) n FROM don_gc_log').n], [n, nl]);
  }

  /* ===== 12. Giao diện thật nối server thật: giao đơn liền tay, làm nhanh trên bảng, tìm không dấu =====
     app.js chạy trong máy ảo, fetch của nó gọi thẳng vào worker. Kiểm đúng những thứ làm cho việc giao
     và theo dõi đơn nhanh: điền sẵn, "giao + đơn tiếp" giữ lại ô dùng chung, nút làm nhanh chỉ hiện cho
     người được giao. */
  {
    const S3 = await boot(ROOT);
    await S3.call('POST', '/setup', { token: 'setup-tok', name: 'Admin', phone: '0900000001', pin: '2468' });
    await S3.login('Admin', '0900000001', '2468');
    const id3 = {};
    for (const [name, phone, role] of [['An', '0900000002', 'tieudoi'], ['Binh', '0900000003', 'tieudoi'], ['Cv', '0900000004', 'cvktht']]) {
      const r = await S3.call('POST', '/users', { name, phone, role }, 'Admin');
      await S3.login(name, phone, r.data.pin);
      await S3.call('POST', '/change-pin', { pin: r.data.pin, newPin: '1357' }, name);
      id3[name] = r.data.id;
    }
    const { readFileSync } = await import('node:fs');
    const vm = (await import('node:vm')).default;
    const path = (await import('node:path')).default;
    let who = 'Cv';
    const el = () => ({ value: '', dataset: {}, style: {}, focus() {}, remove() {}, setSelectionRange() {}, querySelector: () => null, querySelectorAll: () => [], appendChild() {}, closest: () => null, set innerHTML(v) {}, get innerHTML() { return ''; } });
    const store = {};
    const ctx = {
      console, Date, Math, JSON, String, Number, Object, Array, Set, Map, parseInt, parseFloat, isNaN, Promise, RegExp, Error, TypeError, encodeURIComponent,
      setTimeout: () => 0, clearTimeout: () => {},
      localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; }, key: () => null, get length() { return 0; } },
      navigator: { onLine: true },
      history: { state: null, pushState() {}, replaceState() {} },
      document: { activeElement: null, hidden: false, body: { appendChild() {}, removeChild() {} }, createElement: el, getElementById: () => el(), querySelectorAll: () => [], addEventListener() {} },
      window: { addEventListener() {} },
      fetch: async (url, o = {}) => {
        if (!String(url).startsWith('/api/giacong') && !String(url).startsWith('/api/bootstrap')) return new Promise(() => {}); // /me lúc khởi động, /app.js: để treo
        const r = await S3.call(o.method || 'GET', String(url).replace(/^\/api/, ''), o.body ? JSON.parse(o.body) : undefined, who);
        return { ok: r.status < 400, status: r.status, json: async () => r.data, headers: { get: () => null } };
      },
      URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
    };
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(readFileSync(path.join(ROOT, 'public/app.js'), 'utf8'), ctx, { filename: 'app.js' });
    const R = (src) => vm.runInContext(src, ctx);
    const cho = async () => { for (let i = 0; i < 200; i++) { await new Promise((r) => setImmediate(r)); if (!R('S.busy') && i > 5) return; } };
    const vao = async (name, role) => {
      who = name;
      const bt = (await S3.call('GET', '/bootstrap', undefined, name)).data;
      R(`S.boot = ${JSON.stringify(bt)}; indexBoot(S.boot); S.me = ${JSON.stringify({ id: id3[name], name, role })}; S.ask = null; S.form = {}; S.gcF = 'mo'; S.screen = 'giacong';`);
      R(`S.gc = ${JSON.stringify((await S3.call('GET', '/giacong', undefined, name)).data)};`);
    };
    const don3 = () => S3.sql('SELECT cau_kien, truc, hang_muc, user_id, han, tt, pct FROM don_gc ORDER BY id');
    const ngayMai = vnDay(Date.now() + 864e5);

    await vao('Cv', 'cvktht');
    ok('CVKTHT thấy nút giao đơn ngay trên bảng', R('vGiaCong()').includes('data-a="gcnew"'));
    R('ACTIONS.gcnew()'); await cho();
    eq('mở màn soạn đơn: hạn điền sẵn ngày mai', [R('S.screen'), R('S.form.gchan')], ['gcform', ngayMai]);
    ok('nút GIAO đứng yên ở đáy, có cả "giao + đơn tiếp"', /class="sendbar[^"]*">.*data-v="tiep".*GIAO ĐƠN/s.test(R('vGcForm()')));
    R(`ACTIONS.gcckq({ v: 'Dầm' })`);
    eq('bấm loại cấu kiện: điền sẵn chữ đầu', R('S.form.gcck'), 'Dầm ');
    R(`ACTIONS.gcuser({ v: '${id3.Binh}' }); ACTIONS.gcsave({ v: 'tiep' })`); await cho();
    eq('mới có chữ "Dầm" mà chưa ghi cấu kiện nào: chưa giao', don3().length, 0);
    R(`S.form.gcck = 'Dầm D9'; S.form.gctruc = 'X1-X2'; S.form.gchm = 'Khối A'; ACTIONS.gcsave({ v: 'tiep' })`); await cho();
    eq('giao + đơn tiếp: đơn đã vào server', don3(), [{ cau_kien: 'Dầm D9', truc: 'X1-X2', hang_muc: 'Khối A', user_id: id3.Binh, han: ngayMai, tt: 'moi', pct: 0 }]);
    eq('vẫn ở màn soạn, giữ người nhận / hạn / hạng mục, xoá cấu kiện và trục', [R('S.screen'), R('S.gcForm.user'), R('S.form.gchan'), R('S.form.gchm'), R('S.form.gcck') || '', R('S.form.gctruc') || ''], ['gcform', id3.Binh, ngayMai, 'Khối A', '', '']);
    ok('hạng mục vừa dùng thành nút gợi ý', R('vGcForm()').includes('data-a="gchmq" data-v="Khối A"'));
    R(`S.form.gcck = 'Cột C9'; ACTIONS.gcsave({})`); await cho();
    eq('giao đơn thứ hai chỉ gõ thêm tên cấu kiện', don3().map((d) => [d.cau_kien, d.hang_muc, d.user_id]), [['Dầm D9', 'Khối A', id3.Binh], ['Cột C9', 'Khối A', id3.Binh]]);
    eq('giao xong về bảng đơn', [R('S.screen'), R('S.gcForm')], ['giacong', null]);
    R('ACTIONS.gcnew()'); await cho();
    eq('lần giao sau: người nhận và hạng mục điền sẵn theo lần trước', [R('S.gcForm.user'), R('S.form.gchm')], [id3.Binh, 'Khối A']);
    R(`S.screen = 'giacong'; S.form.gcq = 'cot c9';`);
    const the = R('vGiaCong()').split('data-gcq="').slice(1);
    eq('tìm không dấu "cot c9": chỉ còn thẻ Cột C9 hiện', the.map((x) => [x.split('"')[0].split(' ').slice(0, 2).join(' '), x.split('>')[0].includes('display:none')]), [['dam d9', true], ['cot c9', false]]);
    ok('người giao không có nút làm nhanh trên đơn của người khác', !/data-a="gcq(nhan|pct|xong)"/.test(R(`S.form.gcq = ''; vGiaCong()`)));

    await vao('An', 'tieudoi');
    ok('Tiểu đội trưởng khác xem được cả hai đơn nhưng không có nút nào', R('vGiaCong()').split('data-a="gcview"').length === 3 && !/data-a="gc(new|qnhan|qpct|qxong)"/.test(R('vGiaCong()')));

    await vao('Binh', 'tieudoi');
    const idD = S3.one("SELECT id FROM don_gc WHERE cau_kien = 'Dầm D9'").id;
    ok('người được giao thấy nút NHẬN ĐƠN ngay trên bảng', R('vGiaCong()').includes(`data-a="gcqnhan" data-id="${idD}"`));
    R(`ACTIONS.gcqnhan({ id: '${idD}' })`); await cho();
    eq('bấm nhận trên bảng: server ghi đã nhận, bảng tải lại', [S3.one('SELECT tt FROM don_gc WHERE id = ?', idD).tt, R(`S.gc.items.find((x) => x.id === ${idD}).tt`)], ['nhan', 'nhan']);
    R(`ACTIONS.gcqpct({ id: '${idD}', v: '50' })`); await cho();
    eq('bấm 50% trên bảng: một chạm là lưu', [S3.one('SELECT tt, pct FROM don_gc WHERE id = ?', idD), R(`S.gc.items.find((x) => x.id === ${idD}).pct`)], [{ tt: 'lam', pct: 50 }, 50]);
    R(`ACTIONS.gcqxong({ id: '${idD}' })`); await cho();
    eq('bấm XONG thì hỏi lại trước, chưa ghi gì', [!!R('S.ask'), S3.one('SELECT tt FROM don_gc WHERE id = ?', idD).tt], [true, 'lam']);
    R('ACTIONS.askyes()'); await cho();
    eq('đồng ý: đơn xong 100%', S3.one('SELECT tt, pct FROM don_gc WHERE id = ?', idD), { tt: 'xong', pct: 100 });
    await vao('Binh', 'tieudoi');
    const nhac = () => (R('vHome()').match(/<b style="font-size:18px">Đơn gia công của bạn[^<]*<\/b><span class="sm">([^<]*)</) || [])[1] || '';
    eq('Tổng quan của Binh: MỘT thẻ, nói đúng còn một đơn chưa nhận', [(R('vHome()').match(/Đơn gia công của bạn/g) || []).length, nhac()], [1, '1 chưa nhận · bấm để xem']);
    // hạn buổi sáng: trước 12h là "hạn hôm nay", từ 12h là trễ. Chỉnh giờ server giả qua độ lệch đồng hồ.
    const idC = S3.one("SELECT id FROM don_gc WHERE cau_kien = 'Cột C9'").id;
    S3.raw.exec(`UPDATE don_gc SET han = '${vnDay()}', buoi = 'sang', tt = 'nhan' WHERE id = ${idC}`);
    await vao('Binh', 'tieudoi');
    R('S.boot.skew = 0; S.boot.skew = (9 - vnHourNow()) * 3600e3;');
    eq('đơn hạn sáng nay, lúc 9h: chưa trễ', [R(`gcTre(S.gc.items.find((x) => x.id === ${idC}))`), nhac()], [false, '1 hạn hôm nay · bấm để xem']);
    R('S.boot.skew = 0; S.boot.skew = (13 - vnHourNow()) * 3600e3;');
    eq('cũng đơn đó lúc 13h: trễ', [R(`gcTre(S.gc.items.find((x) => x.id === ${idC}))`), nhac()], [true, '1 trễ hạn · bấm để xem']);
    // người giao mở lại đơn đã xong, rồi huỷ đơn kia: người giữ đơn phải thấy cả hai ở Tổng quan
    await S3.call('POST', `/giacong/${idD}/molai`, { ly_do: 'thiếu 2 thanh' }, 'Cv');
    await S3.call('POST', `/giacong/${idC}/huy`, { ly_do: 'đổi thiết kế' }, 'Cv');
    await vao('Binh', 'tieudoi');
    eq('đơn bị mở lại và đơn vừa bị huỷ đều được nhắc cho người giữ đơn', nhac(), '1 bị mở lại · 1 vừa bị huỷ · bấm để xem');
    ok('thẻ đơn trên bảng ghi rõ lý do bị mở lại', R('vGiaCong()').includes('<b>Bị mở lại:</b> thiếu 2 thanh'));
    await vao('An', 'tieudoi');
    eq('người khác không bị nhắc việc không phải của mình', (R('vHome()').match(/Đơn gia công của bạn/g) || []).length, 0);
    await vao('Cv', 'cvktht');
    R('S.boot.skew = 0;');
    // người đang giữ đơn mở thôi làm Tiểu đội trưởng: bảng phải nói các đơn đó cần giao lại
    S3.raw.exec(`UPDATE users SET role = 'cvktht' WHERE id = ${id3.Binh}`);
    await vao('Cv', 'cvktht');
    ok('bảng nói rõ các đơn đó cần giao lại', R('vGiaCong()').includes('cần giao lại cho người khác'));
  }

  const fail = T.filter((x) => x[0] === 'FAIL');
  console.log(T.map((x) => x[0] + ' | ' + x[1] + (x[2] && x[0] === 'FAIL' ? '  [' + x[2] + ']' : '')).join('\n'));
  console.log('\n=== ' + T.length + ' kiểm tra, ' + fail.length + ' lỗi ===');
  process.exit(fail.length ? 1 : 0);
}
main().catch((e) => { console.error('CRASH', e); process.exit(2); });
