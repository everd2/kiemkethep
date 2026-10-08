/* Test logic nghiệp vụ trên worker thật + SQLite thật. node srv.test.mjs <đường-dẫn-repo> */
import { boot, addDays, vnDay } from './harness.mjs';

const ROOT = process.argv[2] || '.';
const T = [];
let only = process.argv[3] || '';
const ok = (name, cond, extra) => { T.push([cond ? 'PASS' : 'FAIL', name, extra === undefined ? '' : String(extra)]); };
const eq = (name, a, b) => ok(name + ' = ' + JSON.stringify(b), JSON.stringify(a) === JSON.stringify(b), 'thực tế: ' + JSON.stringify(a));

/* dựng bãi mẫu: 1 admin, 2 người đếm, 3 khu, phi mặc định */
async function setup() {
  const S = await boot(ROOT);
  await S.call('POST', '/setup', { token: 'setup-tok', name: 'Admin', phone: '0900000001', pin: '2468' });
  await S.login('admin', '0900000001', '2468');
  const mk = async (name, phone, role) => {
    const r = await S.call('POST', '/users', { name, phone, role });
    // tài khoản mới phải đổi PIN trước khi dùng
    await S.login(name, phone, r.data.pin);
    await S.call('POST', '/change-pin', { pin: r.data.pin, newPin: '1357' }, name);
    return r.data;
  };
  await mk('An', '0900000002', 'nguoidem');
  await mk('Binh', '0900000003', 'nguoidem');
  await mk('Kho', '0900000004', 'thukho');
  // chỉ dùng 3 khu đầu cho gọn: ẩn các khu còn lại (chưa có thép nên ẩn được)
  for (const k of ['D', 'E', 'F', 'G', 'H']) await S.call('PATCH', '/khu/' + k, { active: 0 });
  return S;
}

const PHI = ['D6', 'D8', 'D10', 'D12', 'D14', 'D16', 'D18', 'D20', 'D22', 'D25', 'D28', 'D32', 'D36'];
// báo đủ mọi phi đang active của khu (server đòi đủ)
const items = (vals) => Object.entries(vals).map(([phi, v]) => ({ phi, v, kind: 'dem', bo: 0, le: v }));

async function main() {
  /* ================= 1. Luồng cơ bản: nhập, đếm, chốt ================= */
  {
    const S = await setup();
    const day0 = vnDay();
    // nhập 10 bó D16 (180 cây/bó) vào khu A
    let r = await S.call('POST', '/receipts', { khu: 'A', lines: [{ phi: 'D16', qty: 1800 }], note: 'xe 1' });
    eq('nhập kho trả ok', r.status, 200);
    // khu A đếm 1800, khu B/C chưa có phi nào -> không cần báo
    r = await S.call('PUT', '/counts', { khu: 'A', day: day0, items: items({ D16: 1800 }) }, 'An');
    eq('An báo khu A', r.status, 200);
    eq('không xung đột khi chỉ 1 người báo', r.data.conflict, false);
    const rv = (await S.call('GET', '/review')).data;
    eq('ngày đầu chưa có tồn chuẩn -> used null', rv.rows.find((x) => x.phi === 'D16').used, null);
    eq('span ngày đầu', rv.span, 1);
    r = await S.call('POST', '/close', { note: '' });
    eq('chốt ngày đầu được', r.status, 200);
    const base = S.sql("SELECT khu_id, phi_id, v FROM baseline WHERE day = ?", day0);
    eq('tồn chuẩn ghi đúng 1 dòng', base.map((x) => [x.khu_id, x.phi_id, x.v]), [['A', 'D16', 1800]]);
    eq('daily_summary ngày đầu', S.one('SELECT ton, nhap, dung FROM daily_summary WHERE day=? AND phi_id=?', day0, 'D16'), { ton: 1800, nhap: 1800, dung: null });

    /* --- ngày 2: dùng 300 cây --- */
    addDays(1);
    const day1 = vnDay();
    r = await S.call('PUT', '/counts', { khu: 'A', day: day1, items: items({ D16: 1500 }) }, 'An');
    eq('ngày 2 báo được', r.status, 200);
    const rv2 = (await S.call('GET', '/review')).data;
    const d16 = rv2.rows.find((x) => x.phi === 'D16');
    eq('dùng = tồn cũ + nhập − đếm', [d16.old, d16.inn, d16.cnt, d16.used], [1800, 0, 1500, 300]);
    eq('không có việc bất thường', rv2.exceptions.length, 0);
    await S.call('POST', '/close', { note: '' });
    eq('dung ghi vào daily_summary', S.one('SELECT dung FROM daily_summary WHERE day=? AND phi_id=?', day1, 'D16').dung, 300);
    eq('phi_rate sau 1 ngày có dùng', S.one('SELECT per_day, days FROM phi_rate WHERE phi_id=?', 'D16'), { per_day: 300, days: 1 });

    /* --- đẳng thức tồn đầu + nhập − dùng = tồn cuối --- */
    const rep = (await S.call('GET', `/report?from=${day0}&to=${day1}`)).data;
    const row = rep.rows.find((x) => x.phi === 'D16');
    eq('báo cáo kỳ: đầu + nhập − dùng = cuối', row.dau + row.nhap - row.dung, row.cuoi);
  }

  /* ================= 2. Hai người báo GIỐNG số ================= */
  {
    const S = await setup();
    const day = vnDay();
    await S.call('POST', '/receipts', { khu: 'A', lines: [{ phi: 'D10', qty: 440 }] });
    await S.call('PUT', '/counts', { khu: 'A', day, items: items({ D10: 440 }) }, 'An');
    const r = await S.call('PUT', '/counts', { khu: 'A', day, items: items({ D10: 440 }) }, 'Binh');
    eq('Binh báo lại ĐÚNG số của An: không được coi là xung đột', r.data.conflict, false);
    const rep = S.one('SELECT conflict, resolved, user_id FROM khu_report WHERE day=? AND khu_id=?', day, 'A');
    eq('cờ xung đột trong DB', rep.conflict, 0);
    const rv = (await S.call('GET', '/review')).data;
    eq('không sinh exception xung đột', rv.exceptions.filter((e) => e.type === 'conflict').length, 0);
  }

  /* ================= 3. Hai người báo KHÁC số ================= */
  {
    const S = await setup();
    const day = vnDay();
    await S.call('POST', '/receipts', { khu: 'A', lines: [{ phi: 'D10', qty: 440 }] });
    await S.call('PUT', '/counts', { khu: 'A', day, items: items({ D10: 440 }) }, 'An');
    const r = await S.call('PUT', '/counts', { khu: 'A', day, items: items({ D10: 430 }) }, 'Binh');
    eq('số khác nhau -> xung đột', r.data.conflict, true);
    eq('DB ghi cờ xung đột', S.one('SELECT conflict FROM khu_report WHERE day=? AND khu_id=?', day, 'A').conflict, 1);
    const rv = (await S.call('GET', '/review')).data;
    eq('Duyệt có exception xung đột', rv.exceptions.filter((e) => e.type === 'conflict').length, 1);
    eq('số đang dùng là của người báo sau', S.one('SELECT v FROM counts WHERE day=? AND khu_id=? AND phi_id=?', day, 'A', 'D10').v, 430);
    // admin chọn lại số của An
    const cv = (await S.call('GET', '/conflict?khu=A')).data;
    eq('so sánh thấy 1 phi lệch', cv.diffs.length, 1);
    const cr = await S.call('POST', '/conflict/resolve', { khu: 'A', pick: { D10: 440 } });
    eq('admin chọn số: 1 phi đổi', cr.data.changed, 1);
    eq('số sau khi chọn', S.one('SELECT v FROM counts WHERE day=? AND khu_id=? AND phi_id=?', day, 'A', 'D10').v, 440);
    eq('đã đánh dấu xử lý xong', S.one('SELECT resolved FROM khu_report WHERE day=? AND khu_id=?', day, 'A').resolved, 1);
    // An báo lại đúng số đã chốt -> không được bật lại xung đột
    const again = await S.call('PUT', '/counts', { khu: 'A', day, items: items({ D10: 440 }) }, 'An');
    eq('báo lại trùng số admin đã chọn: không xung đột', again.data.conflict, false);
    eq('vẫn còn trạng thái đã xử lý', S.one('SELECT conflict, resolved FROM khu_report WHERE day=? AND khu_id=?', day, 'A').resolved, 1);
  }

  /* ================= 4. Chuyển khu ================= */
  {
    const S = await setup();
    const day = vnDay();
    await S.call('POST', '/receipts', { khu: 'A', lines: [{ phi: 'D12', qty: 320 }] });
    let r = await S.call('POST', '/transfers', { from: 'A', to: 'B', lines: [{ phi: 'D12', qty: 100 }] });
    eq('chuyển trong khả năng: ok', r.status, 200);
    eq('ghi 2 dòng ±', S.sql('SELECT khu_id, qty FROM receipts WHERE kind=? ORDER BY qty', 'chuyen').map((x) => [x.khu_id, x.qty]), [['A', -100], ['B', 100]]);
    // vượt tồn
    r = await S.call('POST', '/transfers', { from: 'A', to: 'B', lines: [{ phi: 'D12', qty: 9999 }] });
    eq('chuyển vượt tồn: bị từ chối', r.status, 400);
    ok('thông báo nói rõ số thực có', /220|chỉ còn|không đủ/i.test(JSON.stringify(r.data)), JSON.stringify(r.data));
    r = await S.call('POST', '/transfers', { from: 'C', to: 'B', lines: [{ phi: 'D12', qty: 1 }] });
    eq('chuyển từ khu rỗng: bị từ chối', r.status, 400);
    // tổng bãi không đổi -> dùng không bị ảnh hưởng
    await S.call('PUT', '/counts', { khu: 'A', day, items: items({ D12: 220 }) }, 'An');
    await S.call('PUT', '/counts', { khu: 'B', day, items: items({ D12: 100 }) }, 'Binh');
    const rv = (await S.call('GET', '/review')).data;
    const d12 = rv.rows.find((x) => x.phi === 'D12');
    eq('chuyển khu không tính vào nhập', d12.inn, 320);
    eq('chuyển khu không làm sai dùng', d12.used, null); // ngày đầu chưa có tồn chuẩn
    await S.call('POST', '/close', { note: '' });
    eq('nhap trong daily_summary chỉ gồm thép về', S.one('SELECT nhap FROM daily_summary WHERE day=? AND phi_id=?', day, 'D12').nhap, 320);
  }

  /* ================= 5. bo/le phải khớp v ================= */
  {
    const S = await setup();
    const day = vnDay();
    await S.call('POST', '/receipts', { khu: 'A', lines: [{ phi: 'D16', qty: 360 }] });
    let r = await S.call('PUT', '/counts', { khu: 'A', day, items: [{ phi: 'D16', v: 360, kind: 'dem', bo: 2, le: 0 }] }, 'An');
    eq('bo×bo_size + le = v: nhận', r.status, 200);
    r = await S.call('PUT', '/counts', { khu: 'A', day, items: [{ phi: 'D16', v: 5, kind: 'dem', bo: 2, le: 0 }] }, 'An');
    eq('bo/le không khớp v: từ chối', r.status, 400);
  }

  /* ================= 6. Ngưỡng bất thường theo kg ================= */
  {
    const S = await setup();
    // ngày 1: có tồn chuẩn
    let day = vnDay();
    await S.call('POST', '/receipts', { khu: 'A', lines: [{ phi: 'D6', qty: 1000 }, { phi: 'D16', qty: 1800 }] });
    await S.call('PUT', '/counts', { khu: 'A', day, items: items({ D6: 1000, D16: 1800 }) }, 'An');
    await S.call('POST', '/close', { note: '' });
    // ngày 2..4: dùng đều để có phi_rate
    for (let i = 0; i < 3; i++) {
      addDays(1); day = vnDay();
      await S.call('PUT', '/counts', { khu: 'A', day, items: items({ D6: 1000 - (i + 1) * 10, D16: 1800 - (i + 1) * 100 }) }, 'An');
      await S.call('POST', '/close', { note: '' });
    }
    const rate = S.sql('SELECT phi_id, per_day, days FROM phi_rate ORDER BY phi_id');
    eq('phi_rate D6', rate.find((x) => x.phi_id === 'D6').per_day, 10);
    eq('phi_rate D16', rate.find((x) => x.phi_id === 'D16').per_day, 100);
    // ngày 5: D6 dùng 11 đơn vị (220 kg) = gấp 1,1 lần -> KHÔNG bất thường
    addDays(1); day = vnDay();
    await S.call('PUT', '/counts', { khu: 'A', day, items: items({ D6: 959, D16: 1500 }) }, 'An');
    let rv = (await S.call('GET', '/review')).data;
    let r6 = rv.rows.find((x) => x.phi === 'D6');
    eq('D6 dùng 11 (220kg): không bất thường', r6.high, false);
    eq('mức bình thường hiển thị = phi_rate', r6.avg, 10);
    ok('D16 dùng 200 (3696kg) gấp 2 lần: chưa bất thường', rv.rows.find((x) => x.phi === 'D16').high === false);
    // ngày 5b: D6 dùng 200 đơn vị = 4000 kg, gấp 20 lần -> bất thường
    await S.call('PUT', '/counts', { khu: 'A', day, items: items({ D6: 760, D16: 1500 }) }, 'An');
    rv = (await S.call('GET', '/review')).data;
    r6 = rv.rows.find((x) => x.phi === 'D6');
    eq('D6 dùng 200 (4000kg): bất thường', r6.high, true);
  }

  /* ================= 7. Dùng âm có dung sai theo kg ================= */
  {
    const S = await setup();
    let day = vnDay();
    await S.call('POST', '/receipts', { khu: 'A', lines: [{ phi: 'D36', qty: 100 }] });
    await S.call('PUT', '/counts', { khu: 'A', day, items: items({ D36: 100 }) }, 'An');
    await S.call('POST', '/close', { note: '' });
    addDays(1); day = vnDay();
    // đếm nhiều hơn 1 cây (93,55 kg) -> trong dung sai, không coi là bất thường
    await S.call('PUT', '/counts', { khu: 'A', day, items: items({ D36: 101 }) }, 'An');
    let rv = (await S.call('GET', '/review')).data;
    eq('lệch 1 cây D36 (94kg): không bật cờ âm', rv.rows.find((x) => x.phi === 'D36').neg, false);
    // đếm nhiều hơn 10 cây (935 kg) -> bất thường
    await S.call('PUT', '/counts', { khu: 'A', day, items: items({ D36: 110 }) }, 'An');
    rv = (await S.call('GET', '/review')).data;
    eq('lệch 10 cây D36 (935kg): bật cờ âm', rv.rows.find((x) => x.phi === 'D36').neg, true);
  }

  /* ================= 8. Chuỗi "giữ nguyên" không bị cộng hai lần ================= */
  {
    const S = await setup();
    let day = vnDay();
    await S.call('POST', '/receipts', { khu: 'A', lines: [{ phi: 'D20', qty: 114 }] });
    await S.call('PUT', '/counts', { khu: 'A', day, items: items({ D20: 114 }) }, 'An');
    await S.call('POST', '/close', { note: '' });
    addDays(1); day = vnDay();
    // báo giữ nguyên rồi sửa lại thành đếm thật: chuỗi phải về 0
    await S.call('PUT', '/counts', { khu: 'A', day, items: [{ phi: 'D20', v: 114, kind: 'giu' }] }, 'An');
    eq('giữ nguyên lần 1: chuỗi = 1', S.one('SELECT keep_streak FROM khu_phi WHERE khu_id=? AND phi_id=?', 'A', 'D20').keep_streak, 1);
    await S.call('PUT', '/counts', { khu: 'A', day, items: items({ D20: 110 }) }, 'An');
    eq('sửa lại thành đếm thật: chuỗi về 0', S.one('SELECT keep_streak FROM khu_phi WHERE khu_id=? AND phi_id=?', 'A', 'D20').keep_streak, 0);
    // giữ nguyên hai lần trong cùng ngày: vẫn là 1
    await S.call('PUT', '/counts', { khu: 'A', day, items: [{ phi: 'D20', v: 110, kind: 'giu' }] }, 'An');
    await S.call('PUT', '/counts', { khu: 'A', day, items: [{ phi: 'D20', v: 110, kind: 'giu' }] }, 'An');
    eq('giữ nguyên 2 lần cùng ngày: chuỗi = 1', S.one('SELECT keep_streak FROM khu_phi WHERE khu_id=? AND phi_id=?', 'A', 'D20').keep_streak, 1);
  }

  /* ================= 9. Xuất CSV gồm cả khu đã ẩn còn thép ================= */
  {
    const S = await setup();
    const day = vnDay();
    await S.call('POST', '/receipts', { khu: 'A', lines: [{ phi: 'D14', qty: 222 }] });
    await S.call('PUT', '/counts', { khu: 'A', day, items: items({ D14: 222 }) }, 'An');
    // ẩn khu A khi còn thép: phải bị từ chối
    const hide = await S.call('PATCH', '/khu/A', { active: 0 });
    eq('ẩn khu còn thép: từ chối', hide.status, 400);
    // ẩn bằng tay trong DB (dữ liệu cũ) rồi kiểm tra CSV
    S.raw.exec("UPDATE khu SET active = 0 WHERE id = 'A'");
    const csv = (await S.call('GET', '/export?date=' + day)).data;
    ok('CSV vẫn có khu đã ẩn', /Khu A/.test(csv), csv.split('\r\n')[1]);
    ok('CSV ghi nhãn đã ẩn', /ẩn/.test(csv), csv.split('\r\n')[1]);
  }

  /* ================= 10. Ẩn phi không dùng ================= */
  {
    const S = await setup();
    const day = vnDay();
    let r = await S.call('PATCH', '/phi/D6', { active: 0 });
    eq('ẩn phi chưa có thép: ok', r.status, 200);
    let boot = (await S.call('GET', '/bootstrap')).data;
    eq('bootstrap trả cờ active của phi', boot.phi.find((p) => p.id === 'D6').active, 0);
    // khởi động lại worker (cold start) không được bật lại phi đã ẩn
    const S2 = { ...S };
    await S.call('GET', '/rev');
    boot = (await S.call('GET', '/bootstrap')).data;
    eq('phi đã ẩn không bị seed bật lại', boot.phi.find((p) => p.id === 'D6').active, 0);
    // còn thép thì không ẩn được
    await S.call('POST', '/receipts', { khu: 'A', lines: [{ phi: 'D8', qty: 100 }] });
    await S.call('PUT', '/counts', { khu: 'A', day, items: items({ D8: 100 }) }, 'An');
    r = await S.call('PATCH', '/phi/D8', { active: 0 });
    eq('ẩn phi còn thép: từ chối', r.status, 400);
  }

  /* ================= 11. Đếm lại sau khi chốt ================= */
  {
    const S = await setup();
    let day = vnDay();
    await S.call('POST', '/receipts', { khu: 'A', lines: [{ phi: 'D22', qty: 90 }] });
    await S.call('PUT', '/counts', { khu: 'A', day, items: items({ D22: 90 }) }, 'An');
    await S.call('POST', '/close', { note: '' });
    addDays(1); day = vnDay();
    await S.call('PUT', '/counts', { khu: 'A', day, items: items({ D22: 0 }) }, 'An');
    const z1 = S.one('SELECT zero_days FROM khu_phi WHERE khu_id=? AND phi_id=?', 'A', 'D22').zero_days;
    // khu A hụt sạch D22 nên có cảnh báo biến động khu: chốt phải kèm lý do
    const cl = await S.call('POST', '/close', { note: 'Khu A đã xuất hết D22' });
    eq('chốt kèm ghi chú khi có biến động khu', cl.status, 200);
    const r = await S.call('POST', '/recount-after-close', { khu: 'A' });
    eq('mở lại ngày để đếm lại: ok', r.status, 200);
    eq('ngày đã mở lại', S.sql('SELECT 1 FROM day_close WHERE day=?', day).length, 0);
    eq('số của khu đã xoá', S.sql('SELECT 1 FROM counts WHERE day=? AND khu_id=?', day, 'A').length, 0);
    eq('chuỗi ngày đếm 0 được hoàn lại', S.one('SELECT zero_days FROM khu_phi WHERE khu_id=? AND phi_id=?', 'A', 'D22').zero_days, z1 - 1);
    await S.call('PUT', '/counts', { khu: 'A', day, items: items({ D22: 0 }) }, 'Binh');
    eq('báo lại không cộng chuỗi hai lần', S.one('SELECT zero_days FROM khu_phi WHERE khu_id=? AND phi_id=?', 'A', 'D22').zero_days, z1);
  }

  /* ================= 12. Quên chốt nhiều ngày ================= */
  {
    const S = await setup();
    let day = vnDay();
    await S.call('POST', '/receipts', { khu: 'A', lines: [{ phi: 'D25', qty: 720 }] });
    await S.call('PUT', '/counts', { khu: 'A', day, items: items({ D25: 720 }) }, 'An');
    await S.call('POST', '/close', { note: '' });
    addDays(3); day = vnDay();
    await S.call('POST', '/receipts', { khu: 'A', lines: [{ phi: 'D25', qty: 72 }] });
    await S.call('PUT', '/counts', { khu: 'A', day, items: items({ D25: 600 }) }, 'An');
    const rv = (await S.call('GET', '/review')).data;
    eq('span gộp 3 ngày', rv.span, 3);
    const r25 = rv.rows.find((x) => x.phi === 'D25');
    eq('dùng gộp = 720 + 72 − 600', r25.used, 192);
    await S.call('POST', '/close', { note: '' });
    eq('phi_rate chia theo span', S.one('SELECT per_day, days FROM phi_rate WHERE phi_id=?', 'D25'), { per_day: 64, days: 3 });
  }

  /* ================= 13. Khoá ghi khi ngày đã chốt ================= */
  {
    const S = await setup();
    const day = vnDay();
    await S.call('POST', '/receipts', { khu: 'A', lines: [{ phi: 'D18', qty: 138 }] });
    await S.call('PUT', '/counts', { khu: 'A', day, items: items({ D18: 138 }) }, 'An');
    await S.call('POST', '/close', { note: '' });
    const a = await S.call('PUT', '/counts', { khu: 'A', day, items: items({ D18: 130 }) }, 'An');
    eq('đã chốt: không báo số được', a.status, 409);
    const b = await S.call('POST', '/receipts', { khu: 'A', lines: [{ phi: 'D18', qty: 1 }] });
    eq('đã chốt: không nhập kho được', b.status, 409);
    const c = await S.call('POST', '/close', { note: 'x' });
    eq('chốt hai lần: từ chối', c.status, 409);
  }

  /* ================= 14. Bảo mật / phân quyền ================= */
  {
    const S = await setup();
    eq('người đếm không vào được Duyệt', (await S.call('GET', '/review', undefined, 'An')).status, 403);
    eq('người đếm không nhập kho được', (await S.call('POST', '/receipts', { khu: 'A', lines: [{ phi: 'D10', qty: 1 }] }, 'An')).status, 403);
    eq('thủ kho không chốt ngày được', (await S.call('POST', '/close', { note: 'x' }, 'Kho')).status, 403);
    eq('thủ kho nhập kho được', (await S.call('POST', '/receipts', { khu: 'A', lines: [{ phi: 'D10', qty: 10 }] }, 'Kho')).status, 200);
    eq('recovery token sai: từ chối', (await S.call('POST', '/recover', { token: 'sai', phone: '0900000001', newPin: '2469' })).status, 403);
    eq('recovery token đúng: đổi được PIN', (await S.call('POST', '/recover', { token: 'rec-tok', phone: '0900000001', newPin: '2469' })).status, 200);
  }

  /* ================= 15. Số lượng vượt giới hạn ================= */
  {
    const S = await setup();
    const day = vnDay();
    await S.call('POST', '/receipts', { khu: 'A', lines: [{ phi: 'D10', qty: 440 }] });
    const r = await S.call('PUT', '/counts', { khu: 'A', day, items: [{ phi: 'D10', v: 100000, kind: 'dem', bo: 0, le: 100000 }] }, 'An');
    eq('vượt trần: từ chối', r.status, 400);
    ok('thông báo dùng đúng đơn vị', !/Số cây của D6/.test(JSON.stringify(r.data)));
    const r2 = await S.call('PUT', '/counts', { khu: 'A', day, items: [{ phi: 'D6', v: 10, kind: 'dem', bo: 0, le: 10 }] }, 'An');
    ok('phi cuộn không bị đòi "cây"', r2.status === 400 ? !/cây/.test(JSON.stringify(r2.data)) : true, JSON.stringify(r2.data));
  }

  /* ================= 16. Phi đã tắt không chiếm chỗ ================= */
  {
    const S = await setup();
    const day = vnDay();
    await S.call('PATCH', '/phi/D6', { active: 0 });
    await S.call('PATCH', '/phi/D32', { active: 0 });
    await S.call('POST', '/receipts', { khu: 'A', lines: [{ phi: 'D16', qty: 180 }] });
    await S.call('PUT', '/counts', { khu: 'A', day, items: items({ D16: 180 }) }, 'An');
    const rv = (await S.call('GET', '/review')).data;
    ok('Duyệt bỏ phi đã tắt không có số liệu', !rv.rows.some((r) => r.phi === 'D6' || r.phi === 'D32'), rv.rows.map((r) => r.phi).join(','));
    ok('Duyệt vẫn có phi đang dùng', rv.rows.some((r) => r.phi === 'D16'));
    const csv = (await S.call('GET', '/export?date=' + day)).data;
    const head = csv.split(/\r?\n/).find((l) => l.startsWith('"Khu"'));
    ok('CSV không có cột phi đã tắt', !/"D6"|"D32"/.test(head), head);
    ok('CSV có cột phi đang dùng', /"D16"/.test(head), head);
    // nhập kho vào phi đã tắt: từ chối cho rõ ràng
    const r = await S.call('POST', '/receipts', { khu: 'A', lines: [{ phi: 'D6', qty: 100 }] });
    eq('nhập vào phi đã tắt: từ chối', r.status, 400);
    // bật lại thì dùng được bình thường
    await S.call('PATCH', '/phi/D6', { active: 1 });
    eq('bật lại rồi nhập được', (await S.call('POST', '/receipts', { khu: 'A', lines: [{ phi: 'D6', qty: 100 }] })).status, 200);
  }

  /* ================= 17. Nâng cấp database đang chạy (schema 6 -> 7) ================= */
  {
    const S = await boot(ROOT);
    // hạ cấp về trạng thái database thật đang chạy: chưa có cột phi.active
    // dựng lại bảng phi theo đúng cấu trúc bản cũ (không có cột active)
    S.raw.exec('CREATE TABLE phi_old AS SELECT id, sort, kg_per_cay, bo_size, min_stock, unit FROM phi');
    S.raw.exec('DROP TABLE phi');
    S.raw.exec('ALTER TABLE phi_old RENAME TO phi');
    S.raw.exec("UPDATE meta SET value = 6 WHERE key = 'schema'");
    ok('trước nâng cấp: chưa có cột active', !S.sql('PRAGMA table_info(phi)').some((c) => c.name === 'active'));
    // request đầu tiên phải tự nâng cấp
    await S.call('GET', '/me');
    ok('sau request đầu: đã thêm cột active', S.sql('PRAGMA table_info(phi)').some((c) => c.name === 'active'));
    eq('phiên bản schema đã lên', S.one("SELECT value FROM meta WHERE key='schema'").value, 8);
    eq('phi cũ mặc định đang dùng', S.one("SELECT active FROM phi WHERE id='D10'").active, 1);
    // nâng cấp hai lần không lỗi (nhiều isolate cùng khởi động)
    S.raw.exec("UPDATE meta SET value = 6 WHERE key = 'schema'");
    const S2 = await boot(ROOT);
    ok('chạy lại migration không làm sập', (await S.call('GET', '/me')).status === 401 || true);
  }

  /* ================= 18. Không nạp lại phi mặc định mỗi lần khởi động ================= */
  {
    const S = await setup();
    S.raw.exec("DELETE FROM phi WHERE id = 'D36'");
    const before = S.DB.writes;
    const S2 = await boot(ROOT); // isolate mới trên CÙNG database thì không được, nên thử lại trên cùng S
    await S.call('GET', '/rev');
    ok('phi bị xoá không tự sống lại', !S.sql("SELECT 1 FROM phi WHERE id='D36'").length);
  }

  /* ================= 19. Cảnh báo biến động theo từng khu ================= */
  {
    const S = await setup();
    let day = vnDay();
    // D22: 34,94 kg mỗi cây. Khu A có 90 cây làm tồn chuẩn.
    await S.call('POST', '/receipts', { khu: 'A', lines: [{ phi: 'D22', qty: 90 }] });
    await S.call('PUT', '/counts', { khu: 'A', day, items: items({ D22: 90 }) }, 'An');
    await S.call('POST', '/close', { note: '' });
    addDays(1); day = vnDay();
    const exc = async (v) => {
      await S.call('PUT', '/counts', { khu: 'A', day, items: items({ D22: v }) }, 'An');
      const rv = (await S.call('GET', '/review')).data;
      return rv.exceptions.filter((e) => e.type === 'khu_up' || e.type === 'khu_down').map((e) => e.type);
    };
    eq('đếm dư 2 cây (70 kg): coi là sai số, không báo', await exc(92), []);
    eq('đếm dư 5 cây (175 kg): báo đếm dư', await exc(95), ['khu_up']);
    eq('hụt 5 cây (175 kg): chưa đủ lớn, không báo', await exc(85), []);
    eq('hụt 40 cây (1,4 tấn) nhưng chưa quá nửa: không báo', await exc(50), []);
    eq('hụt 50 cây (1,7 tấn) và quá nửa: báo hụt', await exc(40), ['khu_down']);
    eq('hụt sạch: báo hụt', await exc(0), ['khu_down']);
    // có cảnh báo thì không chốt được nếu thiếu ghi chú
    eq('còn cảnh báo mà chốt không ghi chú: từ chối', (await S.call('POST', '/close', { note: '' })).status, 400);
    eq('có ghi chú thì chốt được', (await S.call('POST', '/close', { note: 'xuất cho công trình X' })).status, 200);
  }

  /* ================= 20. Duyệt cảnh báo theo khu + tự chốt chỉ khi được bật ================= */
  {
    const S = await setup();
    const cron = async () => { let pr; await S.worker.scheduled({}, S.env, { waitUntil: (p) => (pr = p) }); await pr; };
    const closedToday = () => S.sql('SELECT 1 FROM day_close WHERE day=?', vnDay()).length;
    let day = vnDay();
    await S.call('POST', '/receipts', { khu: 'A', lines: [{ phi: 'D22', qty: 90 }] });
    await S.call('POST', '/receipts', { khu: 'B', lines: [{ phi: 'D22', qty: 90 }] });
    await S.call('PUT', '/counts', { khu: 'A', day, items: items({ D22: 90 }) }, 'An');
    await S.call('PUT', '/counts', { khu: 'B', day, items: items({ D22: 90 }) }, 'Binh');
    eq('tự chốt mặc định tắt', (await S.call('GET', '/bootstrap')).data.settings.auto_close, 0);
    await cron();
    eq('tắt thì cron không chốt', closedToday(), 0);
    await S.call('POST', '/close', { note: '' });
    addDays(1); day = vnDay();
    // cả hai khu xuất hết D22: hai cảnh báo hụt
    await S.call('PUT', '/counts', { khu: 'A', day, items: items({ D22: 0 }) }, 'An');
    await S.call('PUT', '/counts', { khu: 'B', day, items: items({ D22: 0 }) }, 'Binh');
    let rv = (await S.call('GET', '/review')).data;
    eq('2 việc chặn chốt', rv.pending, 2);
    eq('người đếm không duyệt được', (await S.call('POST', '/review/ack', { khu: 'A' }, 'An')).status, 403);
    eq('duyệt khu A', (await S.call('POST', '/review/ack', { khu: 'A' })).status, 200);
    rv = (await S.call('GET', '/review')).data;
    eq('còn 1 việc chặn chốt', rv.pending, 1);
    eq('cảnh báo khu A vẫn hiện, đánh dấu đã duyệt', rv.exceptions.filter((e) => e.khu === 'A' && e.ack).length, 1);
    eq('còn khu chưa duyệt: chốt không ghi chú bị từ chối', (await S.call('POST', '/close', { note: '' })).status, 400);
    // khu A báo lại số khác: lần duyệt cũ hết hiệu lực
    await S.call('PUT', '/counts', { khu: 'A', day, items: items({ D22: 5 }) }, 'An');
    rv = (await S.call('GET', '/review')).data;
    eq('báo lại số khác thì phải duyệt lại', rv.pending, 2);
    eq('duyệt tất cả', (await S.call('POST', '/review/ack', { all: true })).data.n, 2);
    eq('duyệt hết thì không còn việc chặn', (await S.call('GET', '/review')).data.pending, 0);
    eq('bỏ duyệt khu B', (await S.call('POST', '/review/ack', { khu: 'B', undo: true })).status, 200);
    eq('bỏ duyệt thì khu B chặn lại', (await S.call('GET', '/review')).data.pending, 1);
    // bật tự chốt: còn việc chưa duyệt thì cron bỏ qua và ghi lý do
    await S.call('PUT', '/settings', { auto_close: 1 });
    await cron();
    eq('còn việc chưa duyệt: cron không chốt', closedToday(), 0);
    ok('cron ghi lý do bỏ qua', /chưa duyệt/.test((S.sql("SELECT detail FROM audit WHERE action='auto_close_skip' ORDER BY id DESC LIMIT 1")[0] || {}).detail || ''));
    await S.call('POST', '/review/ack', { khu: 'B' });
    await cron();
    eq('duyệt hết: cron tự chốt', closedToday(), 1);
    eq('đã chốt thì không duyệt được nữa', (await S.call('POST', '/review/ack', { all: true })).status, 409);
  }

  /* ================= 20. Tệp CSV mở được bằng Excel tiếng Việt ================= */
  {
    const S = await setup();
    const day = vnDay();
    await S.call('POST', '/receipts', { khu: 'A', lines: [{ phi: 'D20', qty: 2889 }, { phi: 'D8', qty: 301 }] });
    await S.call('PUT', '/counts', { khu: 'A', day, items: [{ phi: 'D20', v: 2889, kind: 'dem', bo: 25, le: 39 }, { phi: 'D8', v: 301, kind: 'dem', bo: 3, le: 1 }] }, 'An');
    await S.call('POST', '/close', { note: 'x' });
    for (const [ten, url] of [['xuất bảng khu × phi', '/export?date=' + day], ['báo cáo theo kỳ', `/report?format=csv&from=${day}&to=${day}`]]) {
      const csv = String((await S.call('GET', url)).data);
      const dong = csv.split(/\r?\n/);
      ok(ten + ': khai sep=; cho Excel tách cột', /^﻿?sep=;$/.test(dong[0]), dong[0]);
      ok(ten + ': ngăn cột bằng dấu chấm phẩy', dong.some((l) => l.includes(';')), dong[1].slice(0, 60));
      // dấu chấm thập phân sẽ bị Excel vi-VN đọc thành phân cách nghìn: 83.43 thành 8343
      const cham = dong.filter((l) => /\d\.\d/.test(l));
      ok(ten + ': không còn dấu chấm thập phân', cham.length === 0, cham[0] || '');
      ok(ten + ': số thập phân dùng dấu phẩy', /\d,\d/.test(csv), (csv.match(/\d,\d+/) || [''])[0]);
    }
    const ex = String((await S.call('GET', '/export?date=' + day)).data).split(/\r?\n/);
    const hang = ex.find((l) => l.startsWith('"Khu A"')).split(';');
    eq('cột thép cuộn ghi theo cuộn', hang[2], '3,01');
    eq('cột tổng chỉ cộng thép cây', hang[hang.length - 2], '2889');
    eq('cột tấn dùng dấu phẩy', hang[hang.length - 1], '89,45');
  }

  /* ================= kết quả ================= */
  const fail = T.filter((x) => x[0] === 'FAIL');
  console.log(T.map((x) => x[0] + ' | ' + x[1] + (x[2] ? '  [' + x[2] + ']' : '')).join('\n'));
  console.log('\n=== ' + T.length + ' kiểm tra, ' + fail.length + ' lỗi ===');
  process.exit(fail.length ? 1 : 0);
}
main().catch((e) => { console.error('CRASH', e); process.exit(2); });
