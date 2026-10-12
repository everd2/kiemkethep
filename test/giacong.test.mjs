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
  const don = (o = {}) => ({ cau_kien: 'Dầm D3', hang_muc: 'Khối A, tầng 5', tang: '5', truc: 'X12-X17 / Y3-Y5', noi_dung: '2,4 tấn', user: U.An, han: mai, buoi: 'chieu', ...o });
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
  eq('thiếu vị trí trục: từ chối', (await S.call('POST', '/giacong', don({ truc: '' }), 'Cv')).status, 400);
  {
    const rt = await S.call('POST', '/giacong', don({ cau_kien: 'Tầng thử', tang: 'tầng 7' }), 'Cv');
    eq('gõ "tầng 7" thì server lưu "7"', S.one('SELECT tang FROM don_gc WHERE id = ?', rt.data.id).tang, '7');
    eq('rồi giao "7" cho cùng việc là đơn trùng (không bị tách đôi vì chữ "Tầng")', (await S.call('POST', '/giacong', don({ cau_kien: 'Tầng thử', tang: '7' }), 'Cv')).data.code, 'trung');
    S.raw.exec('DELETE FROM don_gc WHERE id = ' + rt.data.id);
  }
  eq('không tầng, không cote: từ chối (phải có ít nhất một)', (await S.call('POST', '/giacong', don({ tang: '' }), 'Cv')).status, 400);
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
  eq('tiến độ ngoài nấc 10%: từ chối', [(await viec(id, 'tiendo', { pct: 35 }, 'An')).status, (await viec(id, 'tiendo', { pct: 25 }, 'An')).status], [400, 400]);
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
  eq('mở lại: về đang làm 90%, bỏ giờ xong', [dm.tt, dm.pct, dm.xong_ts], ['lam', 90, null]);
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
  /* --- huỷ = không cần làm nữa: ai huỷ, lúc nào; người giữ đơn bấm "đã biết"; huỷ nhầm thì khôi phục --- */
  {
    const h = (await xem(id2)).don;
    ok('đơn huỷ ghi ai huỷ, lúc nào, và chưa ai biết', h.huy_name === 'Cv' && h.huy_ts > 0 && h.biet_ts === null, JSON.stringify(h));
    const rv = await S.call('POST', '/giacong', don({ cau_kien: 'Lanh tô L1', user: U.Binh }), 'Cv');
    await viec(rv.data.id, 'vuong', { ly_do: 'thiếu thép' }, 'Binh');
    await viec(rv.data.id, 'huy', { ly_do: 'bỏ' }, 'Cv');
    eq('đơn đang vướng mà bị huỷ thì hết cờ vướng', [(await xem(rv.data.id)).don.tt, (await xem(rv.data.id)).don.vuong], ['huy', null]);
    await viec(rv.data.id, 'biet', {}, 'Binh');
    eq('không phải người giữ đơn thì không bấm "đã biết" thay được', [(await viec(id2, 'biet', {}, 'An')).status, (await viec(id2, 'biet', {}, 'Cv')).status], [403, 403]);
    eq('đơn chưa huỷ thì không có gì để "đã biết"', (await viec(id, 'biet', {}, 'Binh')).status, 409);
    eq('bootstrap gửi đơn huỷ CHƯA được biết, kèm tên đơn và lý do', (await S.call('GET', '/bootstrap', undefined, 'Binh')).data.gc.filter((x) => x.tt === 'huy').map((x) => [x.id, x.cau_kien, x.huy_ly_do]), [[id2, 'Cột C2', 'Đổi thiết kế']]);
    eq('Tiểu đội trưởng không khôi phục được đơn', (await viec(id2, 'khoiphuc', { ly_do: 'x' }, 'Binh')).status, 403);
    eq('khôi phục phải có lý do', (await viec(id2, 'khoiphuc', {}, 'Cv')).status, 400);
    eq('đơn chưa huỷ thì không khôi phục được', (await viec(id, 'khoiphuc', { ly_do: 'x' }, 'Cv')).status, 409);
    advance(1000);
    eq('Cv khôi phục đơn huỷ nhầm', (await viec(id2, 'khoiphuc', { ly_do: 'huỷ nhầm đơn' }, 'Cv')).status, 200);
    const k = (await xem(id2)).don;
    eq('khôi phục: về đúng trạng thái trước khi huỷ, hết dấu huỷ, người giữ đơn thấy lý do', [k.tt, k.huy_ly_do, k.huy_ts, k.biet_ts, k.mo_lai], ['moi', null, null, null, 'Khôi phục sau khi huỷ: huỷ nhầm đơn']);
    eq('đơn khôi phục làm tiếp được bình thường', (await viec(id2, 'nhan', {}, 'Binh')).status, 200);
    advance(1000);
    await viec(id2, 'tiendo', { pct: 40 }, 'Binh');
    advance(1000);
    eq('huỷ lại (lần này đúng)', (await viec(id2, 'huy', { ly_do: 'Đổi thiết kế' }, 'Cv')).status, 200);
    eq('đơn huỷ giữ nguyên tiến độ lúc huỷ', (await xem(id2)).don.pct, 40);
    advance(1000);
    eq('Binh bấm đã biết', (await viec(id2, 'biet', {}, 'Binh')).status, 200);
    ok('đơn ghi lúc người giữ đơn đã biết', (await xem(id2)).don.biet_ts > 0);
    eq('bấm đã biết lần hai: từ chối', (await viec(id2, 'biet', {}, 'Binh')).status, 409);
    eq('đã biết rồi thì bootstrap thôi nhắc', (await S.call('GET', '/bootstrap', undefined, 'Binh')).data.gc.filter((x) => x.tt === 'huy').length, 0);
    eq('lịch sử đơn ghi đủ: huỷ, khôi phục, huỷ, đã biết', (await xem(id2)).log.map((l) => l.viec).filter((v) => ['huy', 'khoiphuc', 'biet'].includes(v)).reverse(), ['huy', 'khoiphuc', 'huy', 'biet']);
  }
  eq('bootstrap: không còn đơn mở nào, đơn huỷ đã được biết cũng không còn', (await S.call('GET', '/bootstrap', undefined, 'Cv')).data.gc, []);
  eq('đơn xong và đơn huỷ vẫn nằm trên bảng chung', (await S.call('GET', '/giacong', undefined, 'An')).data.items.map((x) => x.tt).sort(), ['huy', 'huy', 'xong']);

  /* ===== 8. Hai người ghi cùng lúc: lần ghi dựa trên bản cũ bị từ chối =====
     Người giao dời hạn đúng lúc người làm bấm lưu tiến độ. Dựng lại bằng cách để câu đọc đơn trả về
     bản cũ: chèn một lần cập nhật vào giữa lúc đọc và lúc ghi. */
  {
    const r = await S.call('POST', '/giacong', don({ cau_kien: 'Sàn S1' }), 'Cv');
    const id3 = r.data.id;
    await viec(id3, 'nhan', {}, 'An');
    // đơn trùng: An đang giữ "Sàn S1" còn mở, giao thêm một đơn giống hệt (khác hoa/thường) thì dừng lại hỏi
    const n8 = S.one('SELECT COUNT(*) n FROM don_gc').n;
    const tr = await S.call('POST', '/giacong', don({ cau_kien: 'sàn s1' }), 'Trung');
    eq('giao đơn giống hệt một đơn còn mở của cùng người: dừng lại hỏi, chưa ghi', [tr.status, tr.data.code, S.one('SELECT COUNT(*) n FROM don_gc').n], [409, 'trung', n8]);
    ok('câu hỏi nói rõ ai đang giữ đơn nào', /An đang giữ một đơn còn mở giống hệt: sàn s1/.test(tr.data.error), tr.data.error);
    eq('khác trục thì là đơn khác, giao bình thường', (await S.call('POST', '/giacong', don({ cau_kien: 'Sàn S1', truc: 'X20-X21' }), 'Trung')).status, 200);
    eq('cùng nội dung nhưng giao cho người khác: không tính là trùng', (await S.call('POST', '/giacong', don({ cau_kien: 'Sàn S1', user: U.Binh }), 'Trung')).status, 200);
    eq('đã hỏi và người giao vẫn muốn giao thêm: ghi', [(await S.call('POST', '/giacong', { ...don({ cau_kien: 'Sàn S1' }), trung: true }, 'Trung')).status, S.one('SELECT COUNT(*) n FROM don_gc').n], [200, n8 + 3]);
    const goc = S.DB.batch.bind(S.DB);
    let chen = true;
    S.DB.batch = async (stmts) => {
      if (chen) { chen = false; S.raw.exec('UPDATE don_gc SET cap_ts = cap_ts + 5 WHERE id = ' + id3); }
      return goc(stmts);
    };
    const rr = await viec(id3, 'tiendo', { pct: 20 }, 'An');
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
    ok('không còn đơn huỷ nào phải nhắc', !bt2.gc.some((x) => x.tt === 'huy'), JSON.stringify(bt2.gc));
    ok('qua hạn: đơn còn mở vẫn nằm trong bootstrap với hạn đã qua (máy tự tính trễ)', bt2.gc.some((x) => x.han < bt2.today), JSON.stringify(bt2.gc));
    const d = (await S.call('GET', '/giacong', undefined, 'Binh')).data.items.find((x) => x.cau_kien === 'Sàn S1');
    eq('sửa đơn đã trễ mà giữ nguyên hạn cũ: được (chỉ đổi nội dung)', (await S.call('PATCH', '/giacong/' + d.id, { cau_kien: 'Sàn S1', tang: '5', truc: 'X1-X2', user: d.user_id, han: d.han }, 'Cv')).status, 200);
    eq('nhưng đặt hạn MỚI vào ngày đã qua thì không', (await S.call('PATCH', '/giacong/' + d.id, { cau_kien: 'Sàn S1', tang: '5', truc: 'X1-X2', user: d.user_id, han: vnDay(Date.now() - 2 * 864e5) }, 'Cv')).status, 400);
    addDays(6);
    eq('huỷ đã quá 7 ngày: không khôi phục được nữa', (await viec(id2, 'khoiphuc', { ly_do: 'muộn' }, 'Cv')).status, 409);
    addDays(34);
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
    const don3 = () => S3.sql('SELECT cau_kien, truc, phan_khu, tang, hang_muc, user_id, han, tt, pct FROM don_gc ORDER BY id');
    const ngayMai = vnDay(Date.now() + 864e5);

    /* --- danh mục do admin lập trước: phân khu, hạng mục, loại cấu kiện --- */
    id3.Admin = S3.one("SELECT id FROM users WHERE name = 'Admin'").id;
    const g0 = (await S3.call('GET', '/giacong', undefined, 'An')).data;
    eq('cài mới: có sẵn sáu loại cấu kiện, chưa có phân khu / hạng mục', [g0.muc.ck.map((m) => m.ten), g0.muc.khu, g0.muc.hm], [['Dầm', 'Cột', 'Sàn', 'Móng', 'Vách', 'Cầu thang'], [], []]);
    const d3 = (o = {}) => ({ cau_kien: 'Dầm', truc: 'X1-X2', cote: '+3.600', user: id3.An, han: ngayMai3, ...o });
    const ngayMai3 = vnDay(Date.now() + 864e5);
    eq('thiếu vị trí trục: từ chối (trục là bắt buộc)', (await S3.call('POST', '/giacong', d3({ truc: ' ' }), 'Cv')).status, 400);
    const k0 = await S3.call('POST', '/giacong', d3({ cau_kien: 'Sàn S0', hang_muc: 'Phần cũ gõ tay' }), 'Cv');
    eq('chưa lập danh mục phân khu thì chưa đòi phân khu; hạng mục nhận chữ tự do', k0.status, 200);
    eq('CVKTHT không sửa được danh mục', [(await S3.call('POST', '/giacong/muc', { loai: 'khu', ten: 'Khu A' }, 'Cv')).status, (await S3.call('DELETE', '/giacong/muc/1', undefined, 'Cv')).status], [403, 403]);
    eq('loại danh mục lạ / tên trống: từ chối', [(await S3.call('POST', '/giacong/muc', { loai: 'xx', ten: 'A' }, 'Admin')).status, (await S3.call('POST', '/giacong/muc', { loai: 'khu', ten: '  ' }, 'Admin')).status], [400, 400]);
    for (const [loai, ten] of [['khu', 'Khu A'], ['khu', 'Khu B'], ['hm', 'Phần thân']]) eq(`admin thêm ${loai} "${ten}"`, (await S3.call('POST', '/giacong/muc', { loai, ten }, 'Admin')).status, 200);
    eq('trùng tên (khác hoa/thường, có dấu): từ chối', [(await S3.call('POST', '/giacong/muc', { loai: 'khu', ten: 'khu a' }, 'Admin')).status, (await S3.call('POST', '/giacong/muc', { loai: 'hm', ten: 'PHẦN THÂN' }, 'Admin')).status], [400, 400]);
    eq('"Khác" luôn có sẵn, không thêm vào danh mục loại cấu kiện', (await S3.call('POST', '/giacong/muc', { loai: 'ck', ten: 'Khác' }, 'Admin')).status, 400);
    eq('có danh mục phân khu rồi: giao đơn thiếu phân khu bị từ chối', (await S3.call('POST', '/giacong', d3(), 'Cv')).status, 400);
    eq('phân khu / hạng mục ngoài danh mục: từ chối', [(await S3.call('POST', '/giacong', d3({ phan_khu: 'Khu Z' }), 'Cv')).status, (await S3.call('POST', '/giacong', d3({ phan_khu: 'Khu A', hang_muc: 'Lạ' }), 'Cv')).status], [400, 400]);
    const k1 = await S3.call('POST', '/giacong', d3({ phan_khu: 'khu a', tang: ' 5 ', hang_muc: 'phần thân' }), 'Cv');
    eq('giao đủ: phân khu và hạng mục ghi đúng cách viết trong danh mục, tầng được lưu', [k1.status, S3.one('SELECT phan_khu, tang, hang_muc, truc FROM don_gc WHERE id = ?', k1.data.id)], [200, { phan_khu: 'Khu A', tang: '5', hang_muc: 'Phần thân', truc: 'X1-X2' }]);
    eq('cùng cấu kiện, cùng trục nhưng khác tầng: không tính là đơn trùng', (await S3.call('POST', '/giacong', d3({ phan_khu: 'Khu A', tang: '6' }), 'Cv')).status, 200);
    eq('giống hệt cả phân khu, tầng, trục: dừng lại hỏi', (await S3.call('POST', '/giacong', d3({ phan_khu: 'Khu A', tang: '5' }), 'Cv')).data.code, 'trung');
    const idKhuA = (await S3.call('GET', '/giacong', undefined, 'An')).data.muc.khu.find((m) => m.ten === 'Khu A').id;
    eq('admin xoá phân khu "Khu A"', (await S3.call('DELETE', '/giacong/muc/' + idKhuA, undefined, 'Admin')).status, 200);
    eq('đơn đã giao vẫn giữ tên phân khu đã xoá', S3.one('SELECT phan_khu FROM don_gc WHERE id = ?', k1.data.id).phan_khu, 'Khu A');
    eq('sửa đơn đó mà giữ nguyên phân khu cũ: được; đơn MỚI thì không chọn được nữa', [(await S3.call('PATCH', '/giacong/' + k1.data.id, d3({ phan_khu: 'Khu A', tang: '5', hang_muc: 'Phần thân', truc: 'X1-X3' }), 'Cv')).status, (await S3.call('POST', '/giacong', d3({ phan_khu: 'Khu A', truc: 'X9' }), 'Cv')).status], [200, 400]);
    ok('lịch sử đơn ghi trục mới', (await S3.call('GET', '/giacong/' + k1.data.id, undefined, 'An')).data.log[0].note.includes('trục: X1-X3'));
    eq('đơn cũ gõ tay hạng mục (trước khi có danh mục) vẫn sửa được nếu giữ nguyên, chỉ cần bổ sung phân khu', (await S3.call('PATCH', '/giacong/' + k0.data.id, d3({ cau_kien: 'Sàn S0', hang_muc: 'Phần cũ gõ tay', phan_khu: 'Khu B', truc: 'X1-X2' }), 'Cv')).status, 200);
    await S3.call('POST', '/giacong/muc', { loai: 'khu', ten: 'Khu A' }, 'Admin');
    // dọn các đơn vừa tạo để phần giao diện bên dưới bắt đầu từ bảng trống
    S3.raw.exec('DELETE FROM don_gc; DELETE FROM don_gc_log');

    await vao('Cv', 'cvktht');
    ok('CVKTHT thấy nút giao đơn ngay trên bảng, không thấy nút thiết lập (chỉ admin)', R('vGiaCong()').includes('data-a="gcnew"') && !R('vGiaCong()').includes('data-s="gcsetup"'));
    R('ACTIONS.gcnew()'); await cho();
    eq('mở màn soạn đơn: hạn điền sẵn ngày mai', [R('S.screen'), R('S.form.gchan')], ['gcform', ngayMai]);
    const fm = R('vGcForm()');
    ok('nút GIAO đứng yên ở đáy, có cả "giao + đơn tiếp"', /class="sendbar[^"]*">.*data-v="tiep".*GIAO ĐƠN/s.test(fm));
    ok('loại cấu kiện, "Khác" và phân khu là nút bấm lấy từ danh mục', ['data-a="gcckq" data-v="Dầm"', 'data-a="gcckq" data-v="khac"', 'data-a="gckhu" data-v="Khu A"', 'data-a="gchmq" data-v="Phần thân"'].every((x) => fm.includes(x)));
    ok('trục nhập bằng bốn ô số', ['id="gcx1"', 'id="gcx2"', 'id="gcy1"', 'id="gcy2"'].every((x) => fm.includes(x)) && fm.includes('inputmode="numeric"'));
    R(`ACTIONS.gcuser({ v: '${id3.Binh}' }); ACTIONS.gcsave({ v: 'tiep' })`); await cho();
    eq('chưa chọn loại cấu kiện: chưa giao', don3().length, 0);
    R(`ACTIONS.gcckq({ v: 'Dầm' }); ACTIONS.gcsave({ v: 'tiep' })`); await cho();
    eq('chưa nhập trục: chưa giao', don3().length, 0);
    R(`S.form.gcx1 = '1'; S.form.gcx2 = '2';`);
    eq('bốn ô ghép thành chữ trục', [R('gcTrucGhep()'), R(`S.form.gcy1 = '3'; S.form.gcy2 = '5'; gcTrucGhep()`), R(`S.form.gcy1 = ''; S.form.gcy2 = ''; S.form.gcx2 = '1'; gcTrucGhep()`)], ['X1-X2', 'X1-X2 / Y3-Y5', 'X1']);
    R(`S.form.gcx2 = '2'; ACTIONS.gcsave({ v: 'tiep' })`); await cho();
    eq('chưa chọn phân khu: chưa giao', don3().length, 0);
    R(`ACTIONS.gckhu({ v: 'Khu A' }); S.form.gctang = ''; ACTIONS.gcsave({ v: 'tiep' })`); await cho();
    eq('chưa ghi tầng lẫn cote: chưa giao', don3().length, 0);
    ok('màn soạn có ô tầng và ô cote', ['id="gctang"', 'id="gccote"'].every((x) => R('vGcForm()').includes(x)));
    R(`S.form.gctang = '5'; ACTIONS.gcsave({ v: 'tiep' })`); await cho();
    eq('giao + đơn tiếp: đơn đã vào server, đủ cấu kiện, trục, phân khu, tầng', don3(), [{ cau_kien: 'Dầm', truc: 'X1-X2', phan_khu: 'Khu A', tang: '5', hang_muc: null, user_id: id3.Binh, han: ngayMai, tt: 'moi', pct: 0 }]);
    eq('vẫn ở màn soạn; giữ loại cấu kiện, phân khu, tầng, người nhận, hạn; xoá trục', [R('S.screen'), R('S.gcForm.ck'), R('S.gcForm.khu'), R('S.form.gctang'), R('S.gcForm.user'), R('S.form.gchan'), R('gcTrucGhep()')], ['gcform', 'Dầm', 'Khu A', '5', id3.Binh, ngayMai, '']);
    ok('trục vừa dùng thành nút gợi ý', R('vGcForm()').includes('data-a="gctrucq" data-v="X1-X2"'));
    // bấm giao lại đúng đơn vừa giao (mạng chập chờn, hoặc quên sửa trục): app hỏi lại chứ không lặng lẽ sinh đơn trùng
    R(`ACTIONS.gctrucq({ v: 'X1-X2' }); ACTIONS.gcsave({ v: 'tiep' })`); await cho();
    eq('giao trùng: hộp hỏi mở ra, server chưa ghi thêm, trục đang nhập còn nguyên', [!!R('S.ask'), don3().length, R('gcTrucGhep()')], [true, 1, 'X1-X2']);
    R('ACTIONS.askno()'); await cho();
    eq('bấm Quay lại: không có đơn thứ hai', don3().length, 1);
    // cấu kiện ngoài danh mục: chọn Khác rồi ghi tên
    R(`ACTIONS.gcckq({ v: 'khac' }); S.form.gcx1 = '7'; S.form.gcx2 = ''; S.form.gcy1 = '3'; ACTIONS.gcsave({})`); await cho();
    eq('chọn Khác mà chưa ghi tên cấu kiện: chưa giao', don3().length, 1);
    R(`S.form.gcck = 'Bể nước'; ACTIONS.gcsave({})`); await cho();
    eq('cấu kiện Khác: giao được với tên tự ghi', don3().map((d) => [d.cau_kien, d.truc, d.phan_khu, d.tang]), [['Dầm', 'X1-X2', 'Khu A', '5'], ['Bể nước', 'X7 / Y3', 'Khu A', '5']]);
    eq('giao xong về bảng đơn', [R('S.screen'), R('S.gcForm')], ['giacong', null]);
    R('ACTIONS.gcnew()'); await cho(); R('vGcForm()');
    eq('lần giao sau: loại cấu kiện, phân khu, tầng, người nhận điền sẵn theo lần trước', [R('S.gcForm.ck'), R('S.gcForm.khu'), R('S.form.gctang'), R('S.gcForm.user')], ['khac', 'Khu A', '5', id3.Binh]);
    eq('chữ trục có sẵn tách về bốn ô; trục không theo dạng X / Y thì để ô gõ tự do', [R(`gcTrucDat('X12-X17 / Y3-Y5'); [S.form.gcx1, S.form.gcx2, S.form.gcy1, S.form.gcy2, S.gcForm.trucTu].join()`), R(`gcTrucDat('Y4'); [S.form.gcx1 || '', S.form.gcy1, S.gcForm.trucTu].join()`), R(`gcTrucDat('lõi thang T2'); [S.gcForm.trucTu, S.form.gctruc, gcTrucCua()].join()`)], ['12,17,3,5,false', ',4,false', 'true,lõi thang T2,lõi thang T2']);
    // sửa một đơn: loại cấu kiện và số hiệu tách lại đúng từ tên đã lưu
    R(`gcSoan({ id: 99, cau_kien: 'Cầu thang CT2', truc: 'X3-X4', phan_khu: 'Khu B', tang: '2', hang_muc: null, user_id: ${id3.An}, uname: 'An', han: '${ngayMai}', buoi: 'sang' }, true); vGcForm();`);
    eq('mở sửa đơn "Cầu thang CT2": loại = Cầu thang, số hiệu = CT2, trục về ô', [R('S.gcForm.ck'), R('S.form.gcck'), R('gcTrucGhep()'), R('S.gcForm.khu'), R('gcCauKien(S.gcForm)')], ['Cầu thang', 'CT2', 'X3-X4', 'Khu B', 'Cầu thang CT2']);
    R(`S.gcForm = null; S.screen = 'giacong'; S.form.gcq = 'be nuoc';`);
    const bang = R('vGiaCong()').split('data-gctim="1"');
    ok('đang tìm thì danh sách theo mục lọc ẩn, khối kết quả tìm hiện', /data-gcds="1" style="display:none"/.test(bang[0]) && !bang[1].startsWith(' style="display:none"'), bang[1].slice(0, 40));
    const the = bang[1].split('data-gcq="').slice(1);
    eq('tìm không dấu "be nuoc": chỉ còn thẻ Bể nước hiện', the.map((x) => [x.split('"')[0].split(' ').slice(0, 2).join(' '), x.split('>')[0].includes('display:none')]), [['dam x1-x2', true], ['be nuoc', false]]);
    ok('tìm được theo khu và tầng', R(`gcTuKhoa(S.gc.items[0])`).includes('khu a tang 5'));
    /* --- tìm theo từng từ: mã cấu kiện khớp đúng mã, trục khớp theo dải --- */
    const khop = (text, q) => R(`gcKhop(gcKhongDau(${JSON.stringify(text)}), gcKhongDau(${JSON.stringify(q)}))`);
    eq('gõ W23 ra mọi đơn của W23 (kể cả W23a), không ra W2 hay W230', ['Vách W23 · X1', 'Vách W23a', 'Vách W230', 'Vách W2'].map((t) => khop(t, 'W23')), [true, true, false, false]);
    eq('gõ cách hay gạch nối vẫn ra: "w 23", "w-23"', [khop('Vách W23', 'w 23'), khop('Vách W23', 'w-23')], [true, true]);
    eq('mọi từ phải khớp, thứ tự tuỳ ý, không cần dấu', [khop('Vách W23 · Khu A · Tầng 5', 'tang 5 w23'), khop('Vách W23 · Khu A · Tầng 6', 'w23 tang 5')], [true, false]);
    eq('chữ không có số khớp đầu từ: "va" ra Vách', [khop('Vách W23', 'va'), khop('Dầm D3', 'am')], [true, false]);
    eq('d3 không ra D30', [khop('Dầm D3', 'd3'), khop('Dầm D30', 'd3')], [true, false]);
    eq('mã trục khớp theo dải: x14 ra đơn ghi X12-X17, x20 thì không', [khop('X12-X17 / Y3-Y5', 'x14'), khop('X12-X17 / Y3-Y5', 'y4'), khop('X12-X17 / Y3-Y5', 'x20')], [true, true, false]);
    eq('trục 6 tìm bằng "truc 6" hoặc "6"', [khop('Dầm D1 · Trục 6 (A-D)', 'truc 6'), khop('Dầm D1 · Trục 6 (A-D)', '6'), khop('Dầm D1 · Trục 16', 'truc 6')], [true, true, false]);
    /* --- trục: nhập "trên một trục" --- */
    R(`gcSoan(null); S.gcForm.ck = 'Dầm';`);
    R(`ACTIONS.gctruck({ v: 'mot' }); S.form.gctm = '6';`);
    eq('một trục: "Trục 6"; kèm đoạn: "Trục 6 (A-D)"; một đầu đoạn: "Trục C (2)"', [R('gcTrucCua()'), R(`S.form.gctm1 = 'a'; S.form.gctm2 = 'd'; gcTrucCua()`), R(`S.form.gctm = 'c'; S.form.gctm1 = '2'; S.form.gctm2 = ''; gcTrucCua()`)], ['Trục 6', 'Trục 6 (A-D)', 'Trục C (2)']);
    eq('chữ "Trục 6 (A-D)" có sẵn tách về ô một trục', [R(`gcTrucDat('Trục 6 (A-D)')`), R('[S.form.gctm, S.form.gctm1, S.form.gctm2].join()')], ['mot', '6,A,D']);
    eq('đổi sang Dải X / Y mà trục không theo dạng đó: giữ ô cũ, báo lại', [R(`ACTIONS.gctruck({ v: 'xy' }); gcTrucKieu()`), R('gcTrucCua()')], ['mot', 'Trục 6 (A-D)']);
    eq('màn soạn có ba cách nhập trục', ['data-v="xy"', 'data-v="mot"', 'data-v="tu"'].map((x) => R('vGcForm()').includes('data-a="gctruck" ' + x)), [true, true, true]);
    /* --- tầng chỉ cần số, gõ "Tầng 5" cũng thành "5" --- */
    eq('tầng: "tầng 5" → "5", "mái" → "Mái", "B1" giữ nguyên', ['tầng 5', ' Tang  3', 'mái', 'B1', '2'].map((x) => R(`gcTangChu(${JSON.stringify(x)})`)), ['5', '3', 'Mái', 'B1', '2']);
    /* --- gợi ý bỏ được: bỏ trên máy này, quay lại nếu có đơn mới dùng lại --- */
    R(`S.gc.items = [{ truc: 'X1-X2', ts: 1000 }, { truc: 'X9 sai', ts: 2000 }, { truc: 'X3', ts: 3000 }];`);
    eq('gợi ý trục theo đơn mới nhất', R(`gcGoiY(S.gc.items, 'truc', 'truc', 5)`), ['X3', 'X9 sai', 'X1-X2']);
    R(`ACTIONS.gcanq({ l: 'truc', v: 'X9 sai' })`);
    eq('bấm × thì gợi ý biến mất', R(`gcGoiY(S.gc.items, 'truc', 'truc', 5)`), ['X3', 'X1-X2']);
    R(`S.gc.items.push({ truc: 'X9 sai', ts: Date.now() + 5000 })`);
    eq('có đơn MỚI dùng lại đúng giá trị đó thì gợi ý quay lại', R(`gcGoiY(S.gc.items, 'truc', 'truc', 5)`)[0], 'X9 sai');
    ok('chip gợi ý có nút ×', R(`gcChipGoiY('tang', '5', false, 'gctangq')`).includes('data-a="gcanq" data-l="tang" data-v="5"'));
    R(`S.gcForm = null; S.gc = ${JSON.stringify((await S3.call('GET', '/giacong', undefined, 'Cv')).data)};`);
    R(`S.form.gcq = '';`);
    const nhomTen = () => (R('vGiaCong()').split('data-gctim')[0].match(/<h2 class="sec"[^>]*>([^<]*) </g) || []).map((x) => x.replace(/<[^>]+>/g, '').replace(/<$/, '').trim());
    eq('gom theo tổ / theo hạn / theo khu', [R(`ACTIONS.gcxem({ v: 'to' })`) || nhomTen(), R(`ACTIONS.gcxem({ v: 'han' })`) || nhomTen(), R(`ACTIONS.gcxem({ v: 'khu' })`) || nhomTen()], [['Binh'], ['Ngày mai'], ['Khu A']]);
    ok('không gom theo tổ thì thẻ đơn ghi tên người giữ đơn', />X1-X2<\/b> · Khu A · Tầng 5 · Binh</.test(R('vGiaCong()')), (R('vGiaCong()').match(/X1-X2<\/b>[^<]*/) || [''])[0]);
    R(`ACTIONS.gcxem({ v: 'to' })`);
    ok('người giao không có nút làm nhanh trên đơn của người khác', !/data-a="gcq(nhan|pct|xong)"/.test(R('vGiaCong()')));

    // admin thiết lập danh mục ngay trong app
    await vao('Admin', 'admin');
    ok('admin thấy nút thiết lập trên bảng', R('vGiaCong()').includes('data-s="gcsetup"'));
    R(`S.screen = 'gcsetup'; S.form.gcmkhu = 'Khu C'; ACTIONS.gcmucadd({ v: 'khu' })`); await cho();
    eq('thêm phân khu từ màn Thiết lập', [S3.sql("SELECT ten FROM gc_muc WHERE loai = 'khu' ORDER BY sort, id").map((m) => m.ten), R('S.gc.muc.khu.length'), R('S.form.gcmkhu') || ''], [['Khu B', 'Khu A', 'Khu C'], 3, '']);
    const idC3 = S3.one("SELECT id FROM gc_muc WHERE ten = 'Khu C'").id;
    R(`ACTIONS.gcmucxoa({ id: '${idC3}' })`); await cho();
    eq('xoá thì hỏi lại trước', [!!R('S.ask'), S3.sql("SELECT 1 x FROM gc_muc WHERE ten = 'Khu C'").length], [true, 1]);
    R('ACTIONS.askyes()'); await cho();
    eq('đồng ý: mục bị xoá khỏi danh mục', [S3.sql("SELECT 1 x FROM gc_muc WHERE ten = 'Khu C'").length, R('S.gc.muc.khu.length')], [0, 2]);

    await vao('An', 'tieudoi');
    ok('Tiểu đội trưởng khác xem được cả hai đơn nhưng không có nút nào', R('vGiaCong()').split('data-gctim')[0].split('data-a="gcview"').length === 3 && !/data-a="gc(new|qnhan|qpct|qxong|qbiet)"/.test(R('vGiaCong()')));

    await vao('Binh', 'tieudoi');
    const idD = S3.one("SELECT id FROM don_gc WHERE cau_kien = 'Dầm'").id;
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
    ok('thẻ nhắc mở thẳng mục "Của tôi" và bỏ chữ đang tìm dở', (() => { R(`S.gcF = 'dong'; S.form.gcq = 'abc'; ACTIONS.nav({ s: 'more', f: 'toi' })`); return R('vHome()').includes('data-s="giacong" data-f="toi"') && R('S.gcF') === 'toi' && !R('S.form.gcq'); })());
    eq('Tổng quan của Binh: MỘT thẻ, nói đúng còn một đơn chưa nhận', [(R('vHome()').match(/Đơn gia công của bạn/g) || []).length, nhac()], [1, '1 chưa nhận · bấm để xem']);
    // hạn buổi sáng: trước 12h là "hạn hôm nay", từ 12h là trễ. Chỉnh giờ server giả qua độ lệch đồng hồ.
    const idC = S3.one("SELECT id FROM don_gc WHERE cau_kien = 'Bể nước'").id;
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
    eq('đơn bị mở lại được nhắc trong thẻ chung', nhac(), '1 bị mở lại · bấm để xem');
    const tq = R('vHome()');
    ok('đơn vừa bị huỷ có thẻ đỏ RIÊNG gọi đúng tên, bấm là mở thẳng đơn đó', new RegExp('class="alertbtn bad" data-a="nav" data-s="gcdon" data-gid="' + idC + '">.*KHÔNG LÀM NỮA: Bể nước · X7 / Y3.*Lý do: đổi thiết kế', 's').test(tq), (tq.match(/KHÔNG LÀM NỮA[^<]*/) || [''])[0]);
    const bg = R(`S.screen = 'giacong'; S.gcF = 'mo'; vGiaCong()`);
    ok('trên bảng: đơn vừa bị huỷ đứng đầu mục đơn còn mở của người giữ nó, có nút ĐÃ BIẾT', bg.indexOf('Không làm nữa <span') > 0 && bg.indexOf('Không làm nữa <span') < bg.indexOf('data-a="gcview"') && bg.includes(`data-a="gcqbiet" data-id="${idC}"`));
    ok('thẻ đơn huỷ ghi: không làm nữa, lý do, ai huỷ, người giữ đơn chưa xem', ['<b>Không làm nữa:</b> đổi thiết kế', 'Cv huỷ', 'Binh chưa xem'].every((x) => bg.includes(x)), bg.slice(bg.indexOf('Không làm nữa:'), bg.indexOf('Không làm nữa:') + 200));
    // tìm một đơn đã huỷ khi đang ở mục "Đang mở": vẫn phải ra
    eq('tìm "be nuoc" ở mục Đang mở vẫn ra đơn đã huỷ', R(`S.form.gcq = 'be nuoc'; vGiaCong()`).split('data-gctim="1"')[1].split('data-gcq="').slice(1).filter((x) => !x.split('>')[0].includes('display:none')).map((x) => x.split('"')[0].split(' ').slice(0, 2).join(' ')), ['be nuoc']);
    R(`S.form.gcq = ''`);
    await vao('Cv', 'cvktht');
    ok('người giao được nhắc: đơn đã huỷ mà người giữ đơn chưa xem', /1 đơn gia công đã huỷ mà người giữ đơn chưa xem/.test(R('vHome()')));
    R(`S.gcId = ${idC}; S.gcDetail = ${JSON.stringify((await S3.call('GET', '/giacong/' + idC, undefined, 'Cv')).data)}; S.screen = 'gcdon'`);
    ok('màn đơn huỷ: người giao có nút khôi phục, không có nút đã biết', R('vGcDon()').includes('data-a="gckhoiphuc"') && !R('vGcDon()').includes('data-a="gcbiet"') && R('vGcDon()').includes('không cần làm nữa'));
    await vao('Binh', 'tieudoi');
    R(`S.screen = 'giacong'; ACTIONS.gcqbiet({ id: '${idC}' })`); await cho();
    ok('người giữ đơn bấm ĐÃ BIẾT: server ghi giờ, thẻ nhắc và nút biến mất', S3.one('SELECT biet_ts FROM don_gc WHERE id = ?', idC).biet_ts > 0 && !R('vHome()').includes('KHÔNG LÀM NỮA') && !R('vGiaCong()').includes('data-a="gcqbiet"'));
    await vao('Cv', 'cvktht');
    ok('người giao hết bị nhắc, và thấy "đã biết" trên thẻ đơn', !/chưa xem/.test(R('vHome()')) && R(`S.screen = 'giacong'; S.gcF = 'dong'; vGiaCong()`).includes('Binh đã biết'));
    await vao('Binh', 'tieudoi');
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
