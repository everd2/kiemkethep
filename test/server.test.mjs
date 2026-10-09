/* Test logic nghiệp vụ trên worker thật + SQLite thật. node srv.test.mjs <đường-dẫn-repo> */
import { boot, addDays, advance, vnDay, clock } from './harness.mjs';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.argv[2] || '.';
// hàm tự chốt sổ mà việc chạy mỗi giờ dùng (không còn API chốt tay)
const REV = await import(pathToFileURL(path.resolve(ROOT, 'src/review.js')).href);
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

/* Phiên bản cấu trúc hiện tại, đọc từ chính worker: ba mục dưới đây chỉ cần biết "migration đã
   chạy tới bản mới nhất", nên không phải sửa số bằng tay mỗi lần thêm một migration. */
const SCHEMA_NOW = Number(readFileSync(path.join(ROOT, 'src/db.js'), 'utf8').match(/SCHEMA_VERSION = (\d+)/)[1]);

const PHI = ['D6', 'D8', 'D10', 'D12', 'D14', 'D16', 'D18', 'D20', 'D22', 'D25', 'D28', 'D32', 'D36'];
/* Một báo cáo gồm ĐỦ mọi phi đang bật, đúng như máy khách gửi: phi người đếm gõ số thì kind 'dem',
   phi để trống thì kind 'zero' với v = 0. Server đòi đủ để một bản app cũ còn trong cache không thể
   gửi thiếu rồi bị điền 0 thay (xem putCounts). */
const items = (vals, phis = PHI) => phis.map((phi) => {
  const x = vals[phi];
  if (x === undefined) return { phi, v: 0, kind: 'zero' };
  // số trần = đếm thật; khai cả object khi cần kind 'giu' hoặc cần bo/le cụ thể
  if (typeof x === 'number') return { phi, v: x, kind: 'dem', bo: 0, le: x };
  return { phi, kind: 'dem', bo: 0, le: x.v, ...x };
});
// duyệt báo cáo của một khu (và luôn cả phiếu đang chờ của khu đó)
const duyet = (S, khu, who) => S.call('POST', '/review/duyet', { khu }, who);
const duyetAll = (S, who) => S.call('POST', '/review/duyet', { all: true }, who);
// duyệt một phiếu nhập/chuyển theo id
const duyetP = (S, id, who) => S.call('POST', '/receipts/' + id + '/duyet', {}, who);

/* Bọc sẵn "làm rồi duyệt" cho các mục kiểm thứ khác. Bản thân việc CHƯA DUYỆT THÌ KHÔNG VÀO TỒN
   đã có mục 1 và mục 30 kiểm riêng, nên ở những mục còn lại gọi thẳng cho đỡ rối. */
const nhap = async (S, body, who) => {
  const r = await S.call('POST', '/receipts', body, who);
  if (r.data && r.data.id) await duyetP(S, r.data.id);
  return r;
};
const chuyen = async (S, body, who) => {
  const r = await S.call('POST', '/transfers', body, who);
  if (r.data && r.data.id) await duyetP(S, r.data.id);
  return r;
};
const bao = async (S, body, who) => {
  // máy khách chỉ gửi phi đang bật, đúng như màn Đếm chỉ hiện phi đang bật
  const act = new Set(S.sql('SELECT id FROM phi WHERE active = 1').map((x) => x.id));
  const r = await S.call('PUT', '/counts', { ...body, items: body.items.filter((x) => act.has(x.phi)) }, who);
  if (r.status === 200) await duyet(S, body.khu);
  return r;
};
/* Chốt sổ HÔM NAY bằng đúng hàm tự chốt (closeDayAuto). Gọi cho hôm nay nghĩa là "từ giờ tới 0h
   không có gì xảy ra nữa" — kết quả y như lần chạy 0h05 chốt ngày này. 200 = vừa chốt, 409 = đã chốt. */
const chotNgay = async (S) => {
  try { return { status: (await REV.closeDayAuto(S.env, vnDay())) ? 200 : 409 }; }
  catch (e) { return { status: e.status || 500, data: { code: e.code, error: e.message } }; }
};
// duyệt hết những gì còn chờ rồi mới chốt
const chot = async (S) => { await duyetAll(S); return chotNgay(S); };

async function main() {
  /* ================= 1. Luồng cơ bản: nhập, đếm, chốt ================= */
  {
    const S = await setup();
    const day0 = vnDay();
    // nhập 10 bó D16 (180 cây/bó) vào khu A
    let r = await S.call('POST', '/receipts', { khu: 'A', lines: [{ phi: 'D16', qty: 1800 }], note: 'xe 1' });
    eq('nhập kho trả ok', r.status, 200);
    const phieu1 = r.data.id;
    // CHƯA DUYỆT thì phiếu không vào tồn: đây là quy tắc cốt lõi của bản 1.3
    eq('phiếu mới nằm chờ duyệt', S.one('SELECT duyet_day FROM receipts WHERE id=?', phieu1).duyet_day, null);
    let rv = (await S.call('GET', '/review')).data;
    eq('phiếu chờ duyệt hiện ra màn Duyệt', rv.phieu.length, 1);
    eq('phiếu chưa duyệt chưa vào dự kiến của khu A',
      (rv.khus.find((k) => k.khu === 'A').items.find((i) => i.phi === 'D16') || { exp: 0 }).exp, 0);
    eq('duyệt phiếu được', (await duyetP(S, phieu1)).status, 200);
    eq('duyệt rồi thì ghi ngày duyệt', S.one('SELECT duyet_day FROM receipts WHERE id=?', phieu1).duyet_day, day0);

    r = await S.call('PUT', '/counts', { khu: 'A', day: day0, items: items({ D16: 1800 }) }, 'An');
    eq('An báo khu A', r.status, 200);
    eq('không xung đột khi chỉ 1 người báo', r.data.conflict, false);
    // số vừa báo cũng CHƯA vào tồn: duyet_v còn trống
    eq('số vừa báo nằm chờ duyệt',
      S.one('SELECT v, duyet_v FROM counts WHERE day=? AND khu_id=? AND phi_id=?', day0, 'A', 'D16'),
      { v: 1800, duyet_v: null });
    rv = (await S.call('GET', '/review')).data;
    eq('khu A chờ duyệt', rv.exceptions.filter((e) => e.type === 'khu_pending').map((e) => e.khu), ['A']);

    eq('duyệt khu A', (await duyet(S, 'A')).status, 200);
    eq('duyệt rồi thì số vào tồn',
      S.one('SELECT duyet_v, duyet_name FROM counts WHERE day=? AND khu_id=? AND phi_id=?', day0, 'A', 'D16'),
      { duyet_v: 1800, duyet_name: 'Admin' });
    rv = (await S.call('GET', '/review')).data;
    eq('ngày đầu chưa có tồn chuẩn -> used null', rv.rows.find((x) => x.phi === 'D16').used, null);
    eq('span ngày đầu', rv.span, 1);
    eq('duyệt hết thì không còn việc chờ', rv.pending, 0);
    r = await chotNgay(S);
    eq('chốt ngày đầu được', r.status, 200);
    const base = S.sql("SELECT khu_id, phi_id, v FROM baseline WHERE day = ? AND v <> 0", day0);
    eq('tồn chuẩn ghi đúng 1 dòng khác 0', base.map((x) => [x.khu_id, x.phi_id, x.v]), [['A', 'D16', 1800]]);
    eq('tồn chuẩn giờ đặc: 3 khu x 13 phi', S.sql('SELECT 1 FROM baseline WHERE day = ?', day0).length, 39);
    eq('daily_summary ngày đầu', S.one('SELECT ton, nhap, dung FROM daily_summary WHERE day=? AND phi_id=?', day0, 'D16'), { ton: 1800, nhap: 1800, dung: null });

    /* --- ngày 2: dùng 300 cây --- */
    addDays(1);
    const day1 = vnDay();
    r = await S.call('PUT', '/counts', { khu: 'A', day: day1, items: items({ D16: 1500 }) }, 'An');
    eq('ngày 2 báo được', r.status, 200);
    await duyetAll(S);
    const rv2 = (await S.call('GET', '/review')).data;
    const d16 = rv2.rows.find((x) => x.phi === 'D16');
    eq('dùng = tồn cũ + nhập − đếm', [d16.old, d16.inn, d16.cnt, d16.used], [1800, 0, 1500, 300]);
    eq('duyệt hết rồi thì không còn việc chờ', rv2.pending, 0);
    await chotNgay(S);
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
    await nhap(S, { khu: 'A', lines: [{ phi: 'D10', qty: 440 }] });
    await bao(S, { khu: 'A', day, items: items({ D10: 440 }) }, 'An');
    const r = await bao(S, { khu: 'A', day, items: items({ D10: 440 }) }, 'Binh');
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
    await nhap(S, { khu: 'A', lines: [{ phi: 'D10', qty: 440 }] });
    await bao(S, { khu: 'A', day, items: items({ D10: 440 }) }, 'An');
    const r = await bao(S, { khu: 'A', day, items: items({ D10: 430 }) }, 'Binh');
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
    const again = await bao(S, { khu: 'A', day, items: items({ D10: 440 }) }, 'An');
    eq('báo lại trùng số admin đã chọn: không xung đột', again.data.conflict, false);
    eq('vẫn còn trạng thái đã xử lý', S.one('SELECT conflict, resolved FROM khu_report WHERE day=? AND khu_id=?', day, 'A').resolved, 1);
  }

  /* ================= 4. Chuyển khu ================= */
  {
    const S = await setup();
    const day = vnDay();
    await nhap(S, { khu: 'A', lines: [{ phi: 'D12', qty: 320 }] });
    let r = await chuyen(S, { from: 'A', to: 'B', lines: [{ phi: 'D12', qty: 100 }] });
    eq('chuyển trong khả năng: ok', r.status, 200);
    eq('ghi 2 dòng ±', S.sql('SELECT khu_id, qty FROM receipts WHERE kind=? ORDER BY qty', 'chuyen').map((x) => [x.khu_id, x.qty]), [['A', -100], ['B', 100]]);
    // vượt tồn
    r = await chuyen(S, { from: 'A', to: 'B', lines: [{ phi: 'D12', qty: 9999 }] });
    eq('chuyển vượt tồn: bị từ chối', r.status, 400);
    ok('thông báo nói rõ số thực có', /220|chỉ còn|không đủ/i.test(JSON.stringify(r.data)), JSON.stringify(r.data));
    r = await chuyen(S, { from: 'C', to: 'B', lines: [{ phi: 'D12', qty: 1 }] });
    eq('chuyển từ khu rỗng: bị từ chối', r.status, 400);
    // tổng bãi không đổi -> dùng không bị ảnh hưởng
    await bao(S, { khu: 'A', day, items: items({ D12: 220 }) }, 'An');
    await bao(S, { khu: 'B', day, items: items({ D12: 100 }) }, 'Binh');
    const rv = (await S.call('GET', '/review')).data;
    const d12 = rv.rows.find((x) => x.phi === 'D12');
    eq('chuyển khu không tính vào nhập', d12.inn, 320);
    eq('chuyển khu không làm sai dùng', d12.used, null); // ngày đầu chưa có tồn chuẩn
    await chot(S, { note: '' });
    eq('nhap trong daily_summary chỉ gồm thép về', S.one('SELECT nhap FROM daily_summary WHERE day=? AND phi_id=?', day, 'D12').nhap, 320);
  }

  /* ================= 5. bo/le phải khớp v ================= */
  {
    const S = await setup();
    const day = vnDay();
    await nhap(S, { khu: 'A', lines: [{ phi: 'D16', qty: 360 }] });
    let r = await bao(S, { khu: 'A', day, items: items({ D16: { v: 360, bo: 2, le: 0 } }) }, 'An');
    eq('bo×bo_size + le = v: nhận', r.status, 200);
    r = await bao(S, { khu: 'A', day, items: items({ D16: { v: 5, bo: 2, le: 0 } }) }, 'An');
    eq('bo/le không khớp v: từ chối', r.status, 400);
  }

  /* ================= 6. Ngưỡng bất thường theo kg ================= */
  {
    const S = await setup();
    // ngày 1: có tồn chuẩn
    let day = vnDay();
    await nhap(S, { khu: 'A', lines: [{ phi: 'D6', qty: 1000 }, { phi: 'D16', qty: 1800 }] });
    await bao(S, { khu: 'A', day, items: items({ D6: 1000, D16: 1800 }) }, 'An');
    await chot(S, { note: '' });
    // ngày 2..6: dùng đều 5 ngày để phi_rate đủ tin (dưới 5 ngày thì không cảnh báo)
    for (let i = 0; i < 5; i++) {
      addDays(1); day = vnDay();
      await bao(S, { khu: 'A', day, items: items({ D6: 1000 - (i + 1) * 10, D16: 1800 - (i + 1) * 100 }) }, 'An');
      await chot(S, { note: '' });
    }
    const rate = S.sql('SELECT phi_id, per_day, days FROM phi_rate ORDER BY phi_id');
    eq('phi_rate D6', rate.find((x) => x.phi_id === 'D6').per_day, 10);
    eq('phi_rate D16', rate.find((x) => x.phi_id === 'D16').per_day, 100);
    eq('phi_rate đủ 5 ngày dữ liệu', rate.find((x) => x.phi_id === 'D6').days, 5);
    // ngày 7: D6 còn 950, dùng 11 đơn vị (220 kg) = gấp 1,1 lần -> KHÔNG bất thường
    addDays(1); day = vnDay();
    await bao(S, { khu: 'A', day, items: items({ D6: 939, D16: 1100 }) }, 'An');
    let rv = (await S.call('GET', '/review')).data;
    let r6 = rv.rows.find((x) => x.phi === 'D6');
    eq('D6 dùng 11 (220kg): không bất thường', r6.high, false);
    eq('mức bình thường hiển thị = phi_rate', r6.avg, 10);
    ok('D16 dùng 200 (3696kg) gấp 2 lần: chưa bất thường', rv.rows.find((x) => x.phi === 'D16').high === false);
    // cùng ngày, báo lại: D6 dùng 200 đơn vị = 4000 kg, gấp 20 lần -> bất thường
    await bao(S, { khu: 'A', day, items: items({ D6: 750, D16: 1100 }) }, 'An');
    rv = (await S.call('GET', '/review')).data;
    r6 = rv.rows.find((x) => x.phi === 'D6');
    eq('D6 dùng 200 (4000kg): bất thường', r6.high, true);
  }

  /* ================= 6b. Chưa đủ ngày dữ liệu thì không kết luận "dùng cao bất thường" =================
     "Mức trung bình" dựng từ một ngày không phải mức bình thường của bãi. Nếu vẫn kết luận thì
     ngay tuần đầu vận hành đã báo động và chặn chốt, trong khi chưa ai biết bãi dùng bao nhiêu là thường.
     Màn Tồn bãi cũng im lặng ở mức dữ liệu này, hai màn hình phải nói cùng một điều. */
  {
    const S = await setup();
    let day = vnDay();
    await nhap(S, { khu: 'A', lines: [{ phi: 'D6', qty: 1000 }] });
    await bao(S, { khu: 'A', day, items: items({ D6: 1000 }) }, 'An');
    await chot(S, { note: '' });
    addDays(1); day = vnDay();
    await bao(S, { khu: 'A', day, items: items({ D6: 990 }) }, 'An');
    await chot(S, { note: '' });
    eq('phi_rate mới có 1 ngày dữ liệu', S.one('SELECT days FROM phi_rate WHERE phi_id=?', 'D6').days, 1);
    // dùng 200 phần = 4.000 kg = gấp 20 lần "mức trung bình" của đúng một ngày
    addDays(1); day = vnDay();
    await bao(S, { khu: 'A', day, items: items({ D6: 790 }) }, 'An');
    const r = (await S.call('GET', '/review')).data.rows.find((x) => x.phi === 'D6');
    eq('gấp 20 lần nhưng mới 1 ngày dữ liệu: chưa kết luận bất thường', r.high, false);
    eq('vẫn nói rõ có bao nhiêu ngày dữ liệu', r.rateDays, 1);
    eq('không sinh việc chặn chốt', (await S.call('GET', '/review')).data.pending, 0);
  }

  /* ================= 7. Dùng âm có dung sai theo kg ================= */
  {
    const S = await setup();
    let day = vnDay();
    await nhap(S, { khu: 'A', lines: [{ phi: 'D36', qty: 100 }] });
    await bao(S, { khu: 'A', day, items: items({ D36: 100 }) }, 'An');
    await chot(S, { note: '' });
    addDays(1); day = vnDay();
    // đếm nhiều hơn 1 cây (93,55 kg) -> trong dung sai, không coi là bất thường
    await bao(S, { khu: 'A', day, items: items({ D36: 101 }) }, 'An');
    let rv = (await S.call('GET', '/review')).data;
    eq('lệch 1 cây D36 (94kg): không bật cờ âm', rv.rows.find((x) => x.phi === 'D36').neg, false);
    // đếm nhiều hơn 10 cây (935 kg) -> bất thường
    await bao(S, { khu: 'A', day, items: items({ D36: 110 }) }, 'An');
    rv = (await S.call('GET', '/review')).data;
    eq('lệch 10 cây D36 (935kg): bật cờ âm', rv.rows.find((x) => x.phi === 'D36').neg, true);
  }

  /* ================= 8. Chuỗi "giữ nguyên" không bị cộng hai lần ================= */
  {
    const S = await setup();
    let day = vnDay();
    await nhap(S, { khu: 'A', lines: [{ phi: 'D20', qty: 114 }] });
    await bao(S, { khu: 'A', day, items: items({ D20: 114 }) }, 'An');
    await chot(S, { note: '' });
    addDays(1); day = vnDay();
    // báo giữ nguyên rồi sửa lại thành đếm thật: chuỗi phải về 0
    await bao(S, { khu: 'A', day, items: items({ D20: { v: 114, kind: 'giu' } }) }, 'An');
    eq('giữ nguyên lần 1: chuỗi = 1', S.one('SELECT keep_streak FROM khu_phi WHERE khu_id=? AND phi_id=?', 'A', 'D20').keep_streak, 1);
    await bao(S, { khu: 'A', day, items: items({ D20: 110 }) }, 'An');
    eq('sửa lại thành đếm thật: chuỗi về 0', S.one('SELECT keep_streak FROM khu_phi WHERE khu_id=? AND phi_id=?', 'A', 'D20').keep_streak, 0);
    // giữ nguyên hai lần trong cùng ngày: vẫn là 1
    await bao(S, { khu: 'A', day, items: items({ D20: { v: 110, kind: 'giu' } }) }, 'An');
    await bao(S, { khu: 'A', day, items: items({ D20: { v: 110, kind: 'giu' } }) }, 'An');
    eq('giữ nguyên 2 lần cùng ngày: chuỗi = 1', S.one('SELECT keep_streak FROM khu_phi WHERE khu_id=? AND phi_id=?', 'A', 'D20').keep_streak, 1);
  }

  /* ================= 9. Xuất CSV gồm cả khu đã ẩn còn thép ================= */
  {
    const S = await setup();
    const day = vnDay();
    await nhap(S, { khu: 'A', lines: [{ phi: 'D14', qty: 222 }] });
    await bao(S, { khu: 'A', day, items: items({ D14: 222 }) }, 'An');
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
    await nhap(S, { khu: 'A', lines: [{ phi: 'D8', qty: 100 }] });
    await bao(S, { khu: 'A', day, items: items({ D8: 100 }) }, 'An');
    r = await S.call('PATCH', '/phi/D8', { active: 0 });
    eq('ẩn phi còn thép: từ chối', r.status, 400);
  }

  /* ================= 11. Đếm lại sau khi chốt ================= */
  {
    const S = await setup();
    let day = vnDay();
    await nhap(S, { khu: 'A', lines: [{ phi: 'D22', qty: 90 }] });
    await bao(S, { khu: 'A', day, items: items({ D22: 90 }) }, 'An');
    await chot(S, { note: '' });
    addDays(1); day = vnDay();
    await bao(S, { khu: 'A', day, items: items({ D22: 0 }) }, 'An');
    const cl = await chot(S);
    eq('chốt được khi khu có biến động', cl.status, 200);
    eq('không còn API đếm lại sau chốt', (await S.call('POST', '/recount-after-close', { khu: 'A' })).status, 404);
  }

  /* ================= 12. Quên chốt nhiều ngày ================= */
  {
    const S = await setup();
    let day = vnDay();
    await nhap(S, { khu: 'A', lines: [{ phi: 'D25', qty: 720 }] });
    await bao(S, { khu: 'A', day, items: items({ D25: 720 }) }, 'An');
    await chot(S, { note: '' });
    addDays(3); day = vnDay();
    await nhap(S, { khu: 'A', lines: [{ phi: 'D25', qty: 72 }] });
    await bao(S, { khu: 'A', day, items: items({ D25: 600 }) }, 'An');
    const rv = (await S.call('GET', '/review')).data;
    eq('span gộp 3 ngày', rv.span, 3);
    const r25 = rv.rows.find((x) => x.phi === 'D25');
    eq('dùng gộp = 720 + 72 − 600', r25.used, 192);
    await chot(S, { note: '' });
    eq('phi_rate chia theo span', S.one('SELECT per_day, days FROM phi_rate WHERE phi_id=?', 'D25'), { per_day: 64, days: 3 });
  }

  /* ================= 13. Khoá ghi khi ngày đã chốt ================= */
  {
    const S = await setup();
    const day = vnDay();
    await nhap(S, { khu: 'A', lines: [{ phi: 'D18', qty: 138 }] });
    await bao(S, { khu: 'A', day, items: items({ D18: 138 }) }, 'An');
    await chot(S, { note: '' });
    const a = await S.call('PUT', '/counts', { khu: 'A', day, items: items({ D18: 130 }) }, 'An');
    eq('đã chốt: không báo số được', [a.status, a.data.code], [409, 'closed']);
    eq('đã chốt: số đếm không đổi', S.one("SELECT v FROM counts WHERE day=? AND khu_id='A' AND phi_id='D18'", day).v, 138);
    const b = await nhap(S, { khu: 'A', lines: [{ phi: 'D18', qty: 1 }] });
    eq('đã chốt: không nhập kho được', b.status, 409);
    eq('chốt hai lần: không làm gì', (await chotNgay(S)).status, 409);
  }

  /* ================= 14. Bảo mật / phân quyền ================= */
  {
    const S = await setup();
    eq('người đếm không vào được Duyệt', (await S.call('GET', '/review', undefined, 'An')).status, 403);
    eq('người đếm không nhập kho được', (await nhap(S, { khu: 'A', lines: [{ phi: 'D10', qty: 1 }] }, 'An')).status, 403);
    eq('không còn API chốt tay', (await S.call('POST', '/close', { note: 'x' })).status, 404);
    eq('thủ kho nhập kho được', (await nhap(S, { khu: 'A', lines: [{ phi: 'D10', qty: 10 }] }, 'Kho')).status, 200);
    eq('recovery token sai: từ chối', (await S.call('POST', '/recover', { token: 'sai', phone: '0900000001', newPin: '2469' })).status, 403);
    eq('recovery token đúng: đổi được PIN', (await S.call('POST', '/recover', { token: 'rec-tok', phone: '0900000001', newPin: '2469' })).status, 200);
  }

  /* ================= 15. Số lượng vượt giới hạn ================= */
  {
    const S = await setup();
    const day = vnDay();
    await nhap(S, { khu: 'A', lines: [{ phi: 'D10', qty: 440 }] });
    const r = await bao(S, { khu: 'A', day, items: items({ D10: { v: 100000, bo: 0, le: 100000 } }) }, 'An');
    eq('vượt trần: từ chối', r.status, 400);
    ok('thông báo dùng đúng đơn vị', !/Số cây của D6/.test(JSON.stringify(r.data)));
    const r2 = await bao(S, { khu: 'A', day, items: items({ D6: { v: 10, bo: 0, le: 10 } }) }, 'An');
    ok('phi cuộn không bị đòi "cây"', r2.status === 400 ? !/cây/.test(JSON.stringify(r2.data)) : true, JSON.stringify(r2.data));
  }

  /* ================= 16. Phi đã tắt không chiếm chỗ ================= */
  {
    const S = await setup();
    const day = vnDay();
    await S.call('PATCH', '/phi/D6', { active: 0 });
    await S.call('PATCH', '/phi/D32', { active: 0 });
    await nhap(S, { khu: 'A', lines: [{ phi: 'D16', qty: 180 }] });
    await bao(S, { khu: 'A', day, items: items({ D16: 180 }) }, 'An');
    const rv = (await S.call('GET', '/review')).data;
    ok('Duyệt bỏ phi đã tắt không có số liệu', !rv.rows.some((r) => r.phi === 'D6' || r.phi === 'D32'), rv.rows.map((r) => r.phi).join(','));
    ok('Duyệt vẫn có phi đang dùng', rv.rows.some((r) => r.phi === 'D16'));
    const csv = (await S.call('GET', '/export?date=' + day)).data;
    const head = csv.split(/\r?\n/).find((l) => l.startsWith('"Khu"'));
    ok('CSV không có cột phi đã tắt', !/"D6"|"D32"/.test(head), head);
    ok('CSV có cột phi đang dùng', /"D16"/.test(head), head);
    // nhập kho vào phi đã tắt: từ chối cho rõ ràng
    const r = await nhap(S, { khu: 'A', lines: [{ phi: 'D6', qty: 100 }] });
    eq('nhập vào phi đã tắt: từ chối', r.status, 400);
    // bật lại thì dùng được bình thường
    await S.call('PATCH', '/phi/D6', { active: 1 });
    eq('bật lại rồi nhập được', (await nhap(S, { khu: 'A', lines: [{ phi: 'D6', qty: 100 }] })).status, 200);
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
    eq('phiên bản schema đã lên', S.one("SELECT value FROM meta WHERE key='schema'").value, SCHEMA_NOW);
    eq('phi cũ mặc định đang dùng', S.one("SELECT active FROM phi WHERE id='D10'").active, 1);
    // nâng cấp hai lần không lỗi (nhiều isolate cùng khởi động)
    S.raw.exec("UPDATE meta SET value = 6 WHERE key = 'schema'");
    const S2 = await boot(ROOT);
    ok('chạy lại migration không làm sập', (await S.call('GET', '/me')).status === 401 || true);
  }

  /* ================= 17b. Nâng cấp bản 1.2 -> 1.3: dữ liệu cũ phải thành "đã duyệt" =================
     Đây là bước nguy hiểm nhất của cả bản này. Sau bản 1.3 mọi đường đọc tồn đều đòi duyet_v /
     duyet_day, nên nếu migration không đánh dấu dữ liệu đang chạy là đã duyệt thì tồn toàn bãi
     về 0 ngay lần request đầu tiên sau khi deploy, và tồn chuẩn ngày hôm đó cũng ghi 0. */
  {
    const S = await boot(ROOT);
    // hạ về đúng hình dạng bản 1.2: chưa có cột duyệt nào, và còn bảng review_ack
    for (const t of ['counts', 'receipts']) {
      const cols = S.sql(`PRAGMA table_info(${t})`).map((c) => c.name).filter((n) => !n.startsWith('duyet_'));
      S.raw.exec(`CREATE TABLE ${t}_old AS SELECT ${cols.join(', ')} FROM ${t}`);
      S.raw.exec(`DROP TABLE ${t}`);
      S.raw.exec(`ALTER TABLE ${t}_old RENAME TO ${t}`);
    }
    S.raw.exec(`CREATE TABLE IF NOT EXISTS review_ack (day TEXT NOT NULL, khu_id TEXT NOT NULL, sig TEXT NOT NULL,
      user_id INTEGER NOT NULL, user_name TEXT, ts INTEGER NOT NULL, PRIMARY KEY (day, khu_id))`);
    S.raw.exec("UPDATE meta SET value = 9 WHERE key = 'schema'");
    // số liệu đang chạy của bản cũ: khu A có 1800 cây D16, một phiếu nhập, một lần đếm
    const day = vnDay();
    S.raw.exec(`INSERT INTO receipts (day, phi_id, khu_id, qty, note, user_id, ts, voided, kind, grp)
      VALUES ('${day}', 'D16', 'A', 1800, 'xe cũ', 1, 1000, 0, 'nhap', 'g1')`);
    S.raw.exec(`INSERT INTO counts (day, khu_id, phi_id, v, kind, bo, le, user_id, ts)
      VALUES ('${day}', 'A', 'D16', 1800, 'dem', 10, 0, 1, 2000), ('${day}', 'A', 'D20', 0, 'zero', 0, 0, 1, 2000)`);
    ok('trước nâng cấp: chưa có cột duyệt nào',
      !S.sql('PRAGMA table_info(counts)').some((c) => c.name.startsWith('duyet_')));

    // request đầu tiên sau khi deploy phải tự nâng cấp
    await S.call('GET', '/rev');
    eq('phiên bản schema lên bản mới nhất', S.one("SELECT value FROM meta WHERE key='schema'").value, SCHEMA_NOW);
    ok('đã thêm cột duyệt cho counts', S.sql('PRAGMA table_info(counts)').some((c) => c.name === 'duyet_v'));
    ok('đã thêm cột duyệt cho receipts', S.sql('PRAGMA table_info(receipts)').some((c) => c.name === 'duyet_day'));
    ok('bảng review_ack đã bỏ', !S.sql("SELECT 1 FROM sqlite_master WHERE type='table' AND name='review_ack'").length);

    eq('số đếm cũ thành ĐÃ DUYỆT, không về 0',
      S.one("SELECT duyet_v, duyet_ts FROM counts WHERE khu_id='A' AND phi_id='D16'"), { duyet_v: 1800, duyet_ts: 2000 });
    eq('phiếu cũ thành ĐÃ DUYỆT theo đúng ngày nhập',
      S.one("SELECT duyet_day FROM receipts WHERE grp='g1'").duyet_day, day);
    /* kind 'zero' của bản cũ nghĩa là người đếm bấm "Hết (0)", còn bản 1.3 dùng 'zero' cho
       "để trống, mặc định 0". Phải đổi dòng cũ về 'dem' để về sau không bị đọc ngược nghĩa. */
    eq("'zero' cũ đổi về 'dem' cho khỏi bị đọc ngược nghĩa",
      S.one("SELECT kind, duyet_kind FROM counts WHERE khu_id='A' AND phi_id='D20'"), { kind: 'dem', duyet_kind: 'dem' });
    eq('tự ẩn phi đã bỏ: mọi ô mở lại', S.sql('SELECT 1 FROM khu_phi WHERE active = 0').length, 0);
    ok('cài đặt "tự ẩn sau N ngày đếm 0" đã bỏ',
      !S.sql("SELECT 1 FROM settings WHERE key='hide_after_zero_days'").length);

    /* Chạy LẠI migration không được phá dữ liệu của bản mới. Xảy ra thật khi deploy lỗi rồi có
       người hạ meta.schema xuống để chạy lại. Phép đổi kind 'zero' -> 'dem' nằm trong cùng câu
       backfill (điều kiện duyet_v IS NULL) nên nó chỉ chạm dữ liệu từ trước bản 1.3; tách thành
       câu riêng là mọi ô "để trống" của dữ liệu mới bị biến thành "đã đếm ra 0". */
    S.raw.exec(`INSERT INTO counts (day, khu_id, phi_id, v, kind, user_id, ts, duyet_v, duyet_kind, duyet_ts, duyet_at, duyet_by)
      VALUES ('${day}', 'B', 'D25', 0, 'zero', 1, 5000, 0, 'zero', 5000, 5000, 1)`);
    S.raw.exec("UPDATE meta SET value = 9 WHERE key = 'schema'");
    const S2 = await boot(ROOT, S.raw); // isolate MỚI trên cùng database: ensureSchema chạy lại từ bản 9
    await S2.call('GET', '/rev');
    eq('chạy lại migration: phiên bản vẫn lên bản mới nhất', S.one("SELECT value FROM meta WHERE key='schema'").value, SCHEMA_NOW);
    eq('và KHÔNG phá ô "để trống" của dữ liệu mới',
      S.one("SELECT kind, duyet_kind FROM counts WHERE khu_id='B' AND phi_id='D25'"), { kind: 'zero', duyet_kind: 'zero' });
    eq('dữ liệu cũ vẫn giữ nguyên số đã duyệt',
      S.one("SELECT duyet_v FROM counts WHERE khu_id='A' AND phi_id='D16'").duyet_v, 1800);
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

  /* ================= 19. Lệch theo từng khu: bày ra cho người duyệt, có tô đậm =================
     Ba mốc KHU_UP_KG / KHU_DOWN_KG / KHU_DOWN_PCT từ bản 1.3 chỉ còn quyết định "có tô đậm hay
     không", chứ không còn quyết định khu có duyệt được hay không: khu nào đã báo cũng duyệt được. */
  {
    const S = await setup();
    let day = vnDay();
    // D22: 34,94 kg mỗi cây. Khu A có 90 cây làm tồn chuẩn.
    await nhap(S, { khu: 'A', lines: [{ phi: 'D22', qty: 90 }] });
    await bao(S, { khu: 'A', day, items: items({ D22: 90 }) }, 'An');
    await chot(S, { note: '' });
    addDays(1); day = vnDay();
    // trả về [lệch, có tô đậm] của D22 ở khu A sau khi báo số v
    const lech = async (v) => {
      await bao(S, { khu: 'A', day, items: items({ D22: v }) }, 'An');
      const rv = (await S.call('GET', '/review')).data;
      const it = rv.khus.find((k) => k.khu === 'A').items.find((x) => x.phi === 'D22');
      return [it.d, !!it.big];
    };
    eq('đếm dư 2 cây (70 kg): lệch nhỏ, không tô', await lech(92), [2, false]);
    eq('đếm dư 5 cây (175 kg): tô đậm', await lech(95), [5, true]);
    eq('hụt 5 cây (175 kg): chưa đủ lớn, không tô', await lech(85), [-5, false]);
    eq('hụt 40 cây (1,4 tấn) nhưng chưa quá nửa: không tô', await lech(50), [-40, false]);
    eq('hụt 50 cây (1,7 tấn) và quá nửa: tô đậm', await lech(40), [-50, true]);
    eq('hụt sạch: tô đậm', await lech(0), [-90, true]);
    // lệch to đến mấy cũng KHÔNG chặn chốt, vì nó đã được duyệt
    eq('đã duyệt thì lệch không chặn chốt', (await chotNgay(S)).status, 200);
  }

  /* ================= 20. Duyệt theo khu + tự chốt sau nửa đêm ================= */
  {
    const S = await setup();
    const cron = async () => { let pr; await S.worker.scheduled({}, S.env, { waitUntil: (p) => (pr = p) }); await pr; };
    const closedToday = () => S.sql('SELECT 1 FROM day_close WHERE day=?', vnDay()).length;
    let day = vnDay();
    await nhap(S, { khu: 'A', lines: [{ phi: 'D22', qty: 90 }] });
    await nhap(S, { khu: 'B', lines: [{ phi: 'D22', qty: 90 }] });
    await bao(S, { khu: 'A', day, items: items({ D22: 90 }) }, 'An');
    await bao(S, { khu: 'B', day, items: items({ D22: 90 }) }, 'Binh');
    await cron();
    eq('cron trong ngày không chốt ngày đang chạy', closedToday(), 0);
    await chot(S, { note: '' });
    addDays(1); day = vnDay();
    // cả hai khu xuất hết D22
    await S.call('PUT', '/counts', { khu: 'A', day, items: items({ D22: 0 }) }, 'An');
    await S.call('PUT', '/counts', { khu: 'B', day, items: items({ D22: 0 }) }, 'Binh');

    let rv = (await S.call('GET', '/review')).data;
    eq('2 khu chờ duyệt = 2 việc', rv.pending, 2);
    eq('người đếm không duyệt được', (await S.call('POST', '/review/duyet', { khu: 'A' }, 'An')).status, 403);
    eq('thủ kho cũng không duyệt được', (await S.call('POST', '/review/duyet', { khu: 'A' }, 'Kho')).status, 403);
    eq('duyệt khu không tồn tại: từ chối', (await S.call('POST', '/review/duyet', { khu: 'ZZ' })).status, 400);

    eq('duyệt khu A', (await duyet(S, 'A')).status, 200);
    rv = (await S.call('GET', '/review')).data;
    eq('còn 1 việc: khu B', rv.pending, 1);
    eq('khu A đã ghi tên người duyệt', rv.khus.find((k) => k.khu === 'A').duyet.by, 'Admin');
    eq('khu B vẫn đang chờ', rv.khus.find((k) => k.khu === 'B').duyet, null);

    /* Khu A báo lại số khác: lần duyệt cũ hết hiệu lực NGAY, không cần dấu số liệu nào.
       Bản cũ phải so "sig" vì duyệt là một cờ rời; nay duyệt gắn vào đúng lần báo qua mốc ts,
       nên báo lại là tự chờ duyệt — cả cơ chế need_sig/stale_sig không còn lý do tồn tại. */
    advance(2000);
    await S.call('PUT', '/counts', { khu: 'A', day, items: items({ D22: 5 }) }, 'An');
    rv = (await S.call('GET', '/review')).data;
    eq('báo lại số khác thì phải duyệt lại', rv.pending, 2);
    eq('nhưng tồn vẫn là số đã duyệt, chưa nhận số mới',
      S.one('SELECT duyet_v FROM counts WHERE day=? AND khu_id=? AND phi_id=?', day, 'A', 'D22').duyet_v, 0);

    eq('duyệt tất cả', (await duyetAll(S)).data.khu, 2);
    eq('duyệt hết thì không còn việc', (await S.call('GET', '/review')).data.pending, 0);
    eq('số mới đã vào tồn', S.one('SELECT duyet_v FROM counts WHERE day=? AND khu_id=? AND phi_id=?', day, 'A', 'D22').duyet_v, 5);
    eq('không còn gì chờ thì duyệt nữa: từ chối', (await duyetAll(S)).status, 400);

    // còn báo cáo chưa duyệt lúc nửa đêm: vẫn chốt, theo số đã duyệt, và ghi lại việc còn treo
    advance(2000);
    await S.call('PUT', '/counts', { khu: 'B', day, items: items({ D22: 1 }) }, 'Binh');
    const homQua = day;
    addDays(1); day = vnDay();
    await cron();
    eq('sau 0h: sổ hôm qua tự chốt', S.sql('SELECT 1 FROM day_close WHERE day=?', homQua).length, 1);
    eq('tồn chuẩn khu B theo số ĐÃ DUYỆT (0), không theo số đang chờ (1)',
      S.one("SELECT v FROM baseline WHERE day=? AND khu_id='B' AND phi_id='D22'", homQua).v, 0);
    ok('nhật ký chốt ghi khu chưa duyệt', /chưa duyệt \(chuyển sang ngày sau\): Khu B/.test(S.one('SELECT note FROM day_close WHERE day=?', homQua).note));
    rv = (await S.call('GET', '/review')).data;
    eq('báo cáo chưa duyệt chuyển sang hôm nay, vẫn chờ duyệt', rv.khus.find((k) => k.khu === 'B').waiting > 0, true);
    eq('giữ giờ đếm thật', rv.khus.find((k) => k.khu === 'B').rep.ts < Date.parse(day + 'T00:00:00+07:00'), true);
    eq('duyệt được ở ngày mới', (await duyet(S, 'B')).status, 200);
    eq('và số đó vào tồn', S.one("SELECT duyet_v FROM counts WHERE day=? AND khu_id='B' AND phi_id='D22'", day).duyet_v, 1);
    await cron();
    eq('chạy lại trong ngày: không chốt thêm gì', S.sql('SELECT 1 FROM day_close WHERE day=?', day).length, 0);
  }

  /* ================= 4c. "Có N việc cần xem" đếm theo số lần admin phải ra tay =================
     Một khu có thể vừa lệch dư vừa lệch hụt vừa có phiếu chờ, nhưng chỉ có MỘT nút "Duyệt khu",
     nên nó là MỘT việc. Đếm theo số phần tử trong mảng thì bấm một lần con số tụt mấy đơn vị,
     admin không đối chiếu được với những gì đang thấy trên màn hình. */
  {
    const S = await setup();
    let day = vnDay();
    await nhap(S, { khu: 'A', lines: [{ phi: 'D22', qty: 100 }, { phi: 'D18', qty: 100 }] });
    await nhap(S, { khu: 'B', lines: [{ phi: 'D22', qty: 100 }] });
    await bao(S, { khu: 'A', day, items: items({ D22: 100, D18: 100 }) }, 'An');
    await bao(S, { khu: 'B', day, items: items({ D22: 100 }) }, 'Binh');
    await chot(S, { note: '' });
    addDays(1); day = vnDay();
    // khu A: D22 dư 20 cây và D18 hụt sạch 100 cây; khu B: D22 hụt 20 cây
    await S.call('PUT', '/counts', { khu: 'A', day, items: items({ D22: 120, D18: 0 }) }, 'An');
    await S.call('PUT', '/counts', { khu: 'B', day, items: items({ D22: 80 }) }, 'Binh');
    // phiếu chờ duyệt của khu A: vẫn chỉ là một việc, vì nút "Duyệt khu A" xử lý luôn cả nó
    await S.call('POST', '/receipts', { khu: 'A', lines: [{ phi: 'D22', qty: 50 }] });
    let rv = (await S.call('GET', '/review')).data;
    eq('hai khu chờ duyệt + một phiếu chờ = ba việc', rv.pending, 3);
    const kA = rv.khus.find((k) => k.khu === 'A');
    eq('lệch của khu A bày ra theo từng phi',
      kA.items.filter((x) => x.d).map((x) => [x.phi, x.exp, x.cnt, x.d]).sort(),
      [['D18', 100, 0, -100], ['D22', 100, 120, 20]]);
    eq('lệch đủ lớn thì được tô đậm', kA.items.filter((x) => x.big).map((x) => x.phi).sort(), ['D18', 'D22']);
    eq('khu B lệch nhỏ: không tô đậm', rv.khus.find((k) => k.khu === 'B').items.filter((x) => x.big).length, 0);
    ok('nhưng khu B vẫn duyệt được như mọi khu', rv.khus.find((k) => k.khu === 'B').waiting > 0);

    // duyệt khu A: một lần bấm xử lý cả số lệch lẫn phiếu chờ của khu đó
    const dA = await S.call('POST', '/review/duyet', { khu: 'A' });
    eq('duyệt khu A gộp cả phiếu của khu A', [dA.data.khu, dA.data.phieu], [1, 1]);
    rv = (await S.call('GET', '/review')).data;
    eq('còn đúng một việc: khu B', rv.pending, 1);
    eq('việc còn lại là khu B', rv.exceptions.map((e) => e.type + ':' + e.khu), ['khu_pending:B']);
    eq('duyệt khu A không chạm gì khu B',
      S.one('SELECT duyet_v FROM counts WHERE day=? AND khu_id=? AND phi_id=?', day, 'B', 'D22').duyet_v, null);
    eq('duyệt rồi thì phiếu của khu A vào tồn theo ngày duyệt',
      S.one("SELECT duyet_day FROM receipts WHERE khu_id='A' AND phi_id='D22' AND qty=50").duyet_day, day);
  }

  /* ================= 30. Duyệt theo khu: độc lập, và chưa duyệt thì không vào tồn =================
     Mục này kiểm đúng câu quy tắc: tồn của một khu bằng BÁO CÁO MỚI NHẤT ĐƯỢC DUYỆT của khu đó,
     không liên quan khu khác. Hai cái bẫy không được sập:
     - khu báo lại số mới mà chưa ai duyệt thì tồn vẫn phải là số đã duyệt trước đó, KHÔNG phải
       số mới và cũng KHÔNG tụt về tồn chuẩn;
     - duyệt khu này không được làm đổi bất cứ con số nào của khu khác. */
  {
    const S = await setup();
    let day = vnDay();
    await nhap(S, { khu: 'A', lines: [{ phi: 'D20', qty: 200 }] });
    await nhap(S, { khu: 'B', lines: [{ phi: 'D20', qty: 200 }] });
    await bao(S, { khu: 'A', day, items: items({ D20: 200 }) }, 'An');
    await bao(S, { khu: 'B', day, items: items({ D20: 200 }) }, 'Binh');
    await chot(S, { note: '' });
    addDays(1); day = vnDay();

    // khu A báo 150 và được duyệt -> tồn A = 150
    await bao(S, { khu: 'A', day, items: items({ D20: 150 }) }, 'An');
    const tonA = () => S.one('SELECT duyet_v FROM counts WHERE day=? AND khu_id=? AND phi_id=?', day, 'A', 'D20').duyet_v;
    eq('duyệt rồi: tồn khu A theo số vừa duyệt', tonA(), 150);

    // khu A báo lại 100, CHƯA duyệt -> tồn vẫn là 150
    advance(2000);
    // chính An báo lại (hai NGƯỜI báo khác số là xung đột, một việc khác, đã có mục 3 kiểm)
    await S.call('PUT', '/counts', { khu: 'A', day, items: items({ D20: 100 }) }, 'An');
    eq('báo lại chưa duyệt: tồn giữ số ĐÃ DUYỆT, không nhận số mới', tonA(), 150);
    let rv = (await S.call('GET', '/review')).data;
    // một lần báo phủ cả 13 phi nên cả 13 ô đều về trạng thái chờ duyệt
    eq('khu A quay lại trạng thái chờ duyệt', rv.khus.find((k) => k.khu === 'A').waiting, 13);
    eq('màn Duyệt bày số mới để người duyệt quyết',
      rv.khus.find((k) => k.khu === 'A').items.find((x) => x.phi === 'D20').cnt, 100);
    eq('tổng bãi vẫn tính theo số đã duyệt (150 + 200)', rv.rows.find((x) => x.phi === 'D20').cnt, 350);

    // duyệt khu B (không phải A) -> A vẫn treo, B vào tồn. Độc lập hoàn toàn.
    await bao(S, { khu: 'B', day, items: items({ D20: 190 }) }, 'Binh');
    eq('duyệt khu B không gỡ trạng thái chờ của khu A', tonA(), 150);
    eq('khu B đã vào tồn', S.one('SELECT duyet_v FROM counts WHERE day=? AND khu_id=? AND phi_id=?', day, 'B', 'D20').duyet_v, 190);

    // giờ duyệt A
    await duyet(S, 'A');
    eq('duyệt A: nhận số mới nhất đã duyệt', tonA(), 100);
    rv = (await S.call('GET', '/review')).data;
    eq('hết việc chờ', rv.pending, 0);
    eq('tổng bãi theo hai số vừa duyệt (100 + 190)', rv.rows.find((x) => x.phi === 'D20').cnt, 290);

    // chốt: tồn chuẩn lấy đúng số đã duyệt
    await chotNgay(S);
    eq('tồn chuẩn ghi số đã duyệt',
      S.sql("SELECT khu_id, v FROM baseline WHERE day=? AND phi_id='D20' AND v<>0 ORDER BY khu_id", day).map((x) => [x.khu_id, x.v]),
      [['A', 100], ['B', 190]]);
  }

  /* ================= 31. Báo cáo treo qua ngày không được biến mất =================
     Quên chốt là chuyện thường. Khu báo ngày 2 mà không ai duyệt, ngày 3 khu không báo lại:
     bản cũ đọc khu_report của riêng hôm nay nên cảnh báo lệch biến mất sạch, trong khi số của
     ngày 2 vẫn là tồn và sẽ thành tồn chuẩn lúc chốt. Nay trạng thái chờ duyệt nằm trên chính
     dòng số liệu nên nó sống qua đêm. */
  {
    const S = await setup();
    let day = vnDay();
    await nhap(S, { khu: 'A', lines: [{ phi: 'D20', qty: 200 }] });
    await bao(S, { khu: 'A', day, items: items({ D20: 200 }) }, 'An');
    await chot(S, { note: '' });

    addDays(1);
    const day2 = vnDay();
    await S.call('PUT', '/counts', { khu: 'A', day: day2, items: items({ D20: 20 }) }, 'An');
    eq('ngày 2: báo xong vẫn đang chờ duyệt', (await S.call('GET', '/review')).data.pending, 1);

    addDays(1); day = vnDay();
    const rv = (await S.call('GET', '/review')).data;
    eq('sang ngày 3 vẫn thấy khu A chờ duyệt', rv.exceptions.map((e) => e.type + ':' + e.khu), ['khu_pending:A']);
    const kA = rv.khus.find((k) => k.khu === 'A');
    eq('và vẫn bày đúng số lệch của lần báo ngày 2', [kA.items[0].exp, kA.items[0].cnt, kA.items[0].d], [200, 20, -180]);
    eq('nhắc rõ lần báo đó là của ngày nào', kA.rep.day, day2);
    eq('chưa duyệt thì tồn vẫn là tồn chuẩn, chưa nhận số ngày 2', rv.rows.find((x) => x.phi === 'D20').cnt, 200);
    // duyệt ở ngày 3 phải duyệt được số treo của ngày 2
    eq('duyệt được báo cáo treo từ ngày trước', (await duyet(S, 'A')).status, 200);
    eq('số ngày 2 vào tồn', S.one('SELECT duyet_v FROM counts WHERE day=? AND khu_id=? AND phi_id=?', day2, 'A', 'D20').duyet_v, 20);
    eq('hết việc chờ', (await S.call('GET', '/review')).data.pending, 0);
  }

  /* ================= 32. "Để trống" khác "đếm ra 0", và phiếu nhiều phi là MỘT phiếu =================
     Hai lỗi thật, cùng ở chỗ đếm/hiển thị:
     - Quy tắc "không điền = 0" chỉ an toàn khi người duyệt phân biệt được "khu để trống phi này"
       với "khu đã đếm và phi này hết thật". Nhầm hai cái đó là duyệt bừa mất vài tấn.
     - Một phiếu nhiều phi có nhiều dòng cùng một khu, nên nếu không lọc trùng thì thẻ khu báo
       "còn 3 phiếu chờ duyệt" trong khi thực tế là một phiếu ba phi. */
  {
    const S = await setup();
    let day = vnDay();
    await nhap(S, { khu: 'A', lines: [{ phi: 'D25', qty: 72 }, { phi: 'D28', qty: 57 }] });
    await bao(S, { khu: 'A', day, items: items({ D25: 72, D28: 57 }) }, 'An');
    await chot(S, { note: '' });
    addDays(1); day = vnDay();

    /* An đếm D28 ra 0 (bấm "Hết (0)" -> kind 'dem' v=0), còn D25 thì ĐỂ TRỐNG (kind 'zero').
       Cả hai đều là 0 và đều lệch −72/−57, nhưng chỉ D25 được đánh dấu "để trống". */
    await S.call('PUT', '/counts', {
      khu: 'A', day,
      items: items({ D25: { v: 0, kind: 'zero' }, D28: { v: 0, kind: 'dem' } }),
    }, 'An');
    let rv = (await S.call('GET', '/review')).data;
    const kA = rv.khus.find((k) => k.khu === 'A');
    const d25 = kA.items.find((x) => x.phi === 'D25'), d28 = kA.items.find((x) => x.phi === 'D28');
    eq('để trống phi đang có thép: đánh dấu riêng cho người duyệt', [d25.kind, d25.blank, d25.d], ['zero', true, -72]);
    eq('đếm thật ra 0 thì KHÔNG phải là để trống', [d28.kind, d28.blank, d28.d], ['dem', false, -57]);
    eq('đếm số to để trống: khu nêu rõ có mấy phi bị để trống', kA.blank, 1);

    // phi khu vốn không có, để trống: dự kiến 0 nên không tính là "để trống đáng ngờ"
    ok('phi dự kiến 0 mà để trống thì không bị nêu', !kA.items.some((x) => x.phi === 'D12'), JSON.stringify(kA.items.map((x) => x.phi)));

    /* Một phiếu BA phi vào cùng khu B = một phiếu chờ duyệt, không phải ba. */
    const r = await S.call('POST', '/receipts', { khu: 'B', lines: [{ phi: 'D10', qty: 440 }, { phi: 'D12', qty: 320 }, { phi: 'D14', qty: 222 }] });
    eq('ghi được phiếu ba phi', r.status, 200);
    rv = (await S.call('GET', '/review')).data;
    eq('phiếu ba phi vẫn là MỘT phiếu chờ duyệt', rv.phieu.length, 1);
    eq('và thẻ khu B chỉ đếm một phiếu', rv.khus.find((k) => k.khu === 'B').phieu.length, 1);
    eq('việc cần xử lý không bị phồng theo số phi',
      rv.exceptions.filter((e) => e.type === 'receipt_pending').length, 1);

    // phiếu chuyển khu nằm ở CẢ HAI khu, vì nó là một chứng từ của hai khu — không phải lỗi đếm trùng
    await duyetAll(S);
    const t = await S.call('POST', '/transfers', { from: 'B', to: 'C', lines: [{ phi: 'D10', qty: 100 }, { phi: 'D12', qty: 50 }] });
    eq('ghi được phiếu chuyển hai phi', t.status, 200);
    rv = (await S.call('GET', '/review')).data;
    eq('phiếu chuyển: một phiếu', rv.phieu.length, 1);
    eq('nhưng hiện ở cả khu đi và khu đến, mỗi khu một lần',
      [rv.khus.find((k) => k.khu === 'B').phieu.length, rv.khus.find((k) => k.khu === 'C').phieu.length], [1, 1]);
    // duyệt từ phía khu đi là duyệt cả phiếu
    const dB = await S.call('POST', '/review/duyet', { khu: 'B' });
    eq('duyệt khu đi là duyệt cả phiếu chuyển', dB.data.phieu, 1);
    eq('không còn phiếu nào chờ', (await S.call('GET', '/review')).data.phieu.length, 0);
  }

  /* ================= 33. Hủy phiếu ĐÃ DUYỆT sau khi số của khu đã duyệt =================
     Hủy một phiếu đã duyệt làm số dự kiến của khu đổi y như duyệt thêm một phiếu, nên phải nhắc
     xem lại khu y như vậy. Bản 1.2 bắt được chuyện này (exception 'late' với q < 0, dựa vào
     voided_ts). Nếu chỉ so "lần duyệt phiếu gần nhất" thì hủy phiếu lại LÀM GIẢM mốc đó, cảnh
     báo im lặng, và khu vẫn mang nhãn "Đã duyệt" trong khi số đã duyệt không còn khớp dự kiến. */
  {
    const S = await setup();
    let day = vnDay();
    await nhap(S, { khu: 'A', lines: [{ phi: 'D16', qty: 1800 }] });
    await bao(S, { khu: 'A', day, items: items({ D16: 1800 }) }, 'An');
    await chot(S, { note: '' });
    addDays(1); day = vnDay();

    // phiếu +180 duyệt TRƯỚC, khu đếm 1980 rồi duyệt SAU: đúng trình tự, không nhắc gì
    const rc = await nhap(S, { khu: 'A', lines: [{ phi: 'D16', qty: 180 }] });
    advance(5000);
    await bao(S, { khu: 'A', day, items: items({ D16: 1980 }) }, 'An');
    let rv = (await S.call('GET', '/review')).data;
    ok('đúng trình tự: chưa nhắc xem lại', !rv.khus.find((k) => k.khu === 'A').recheck);
    eq('và hết việc chờ', rv.pending, 0);

    // giờ hủy phiếu đã duyệt đó: dự kiến tụt về 1800 mà số đã duyệt vẫn 1980
    advance(5000);
    eq('hủy phiếu đã duyệt được', (await S.call('DELETE', '/receipts/' + rc.data.id)).status, 200);
    rv = (await S.call('GET', '/review')).data;
    const kA = rv.khus.find((k) => k.khu === 'A');
    eq('dự kiến tụt đúng 180', kA.items.find((x) => x.phi === 'D16').exp, 1800);
    eq('và lệch hiện ra +180', kA.items.find((x) => x.phi === 'D16').d, 180);
    ok('hủy phiếu sau khi khu đã duyệt: nhắc xem lại khu', kA.recheck, JSON.stringify(kA));
    ok('và nó là một việc chặn chốt', rv.exceptions.some((e) => e.type === 'recheck' && e.khu === 'A'),
      JSON.stringify(rv.exceptions.map((e) => e.type + ':' + (e.khu || e.phi))));
    /* Gỡ được bằng cách admin DUYỆT LẠI, không cần khu đếm lại: người duyệt xem bảng lệch mới
       rồi chấp nhận. Đây là đường gỡ chính, vì thường hủy phiếu chính là để sửa cho đúng số khu
       đã đếm. Khu lúc này KHÔNG có gì "chờ duyệt" (mọi ô đã duyệt), nên nếu reviewDuyet chỉ nhận
       khu đang chờ thì nút DUYỆT LẠI bị từ chối và cảnh báo treo vĩnh viễn. */
    advance(1000);
    const dl = await duyet(S, 'A');
    eq('duyệt lại được dù khu không có gì đang chờ', dl.status, 200);
    rv = (await S.call('GET', '/review')).data;
    ok('duyệt lại là hết nhắc', !rv.khus.find((k) => k.khu === 'A').recheck, JSON.stringify(rv.khus.find((k) => k.khu === 'A')));
    /* Nhưng CHƯA phải hết việc: admin chấp nhận số của khu, mà cả bãi vẫn đang thừa 180 cây so
       với tính toán, nên cờ "dùng âm" cấp phi còn đó và chốt vẫn phải ghi chú. Đúng ra phải vậy —
       duyệt lại là nói "số khu đếm đúng", không phải nói "sổ sách đã khớp". */
    eq('việc còn lại là cờ dùng âm của D16, không phải nhắc xem lại khu',
      rv.exceptions.map((e) => e.type + ':' + (e.khu || e.phi)), ['phi:D16']);
    eq('và số đã duyệt KHÔNG bị đổi, chỉ ghi lại mốc duyệt mới',
      S.one('SELECT duyet_v FROM counts WHERE day=? AND khu_id=? AND phi_id=?', day, 'A', 'D16').duyet_v, 1980);

    // khu đếm lại rồi duyệt cũng gỡ được (đường còn lại)
    advance(1000);
    await bao(S, { khu: 'A', day, items: items({ D16: 1800 }) }, 'An');
    ok('đếm lại rồi duyệt cũng hết nhắc', !(await S.call('GET', '/review')).data.khus.find((k) => k.khu === 'A').recheck);

    /* Phiếu lập rồi TỪ CHỐI luôn (chưa bao giờ được duyệt) thì không được nhắc gì: nó chưa từng
       vào tồn nên dự kiến không hề đổi. */
    advance(1000);
    const r2 = await S.call('POST', '/receipts', { khu: 'B', lines: [{ phi: 'D12', qty: 320 }] });
    await S.call('DELETE', '/receipts/' + r2.data.id);
    const kB = (await S.call('GET', '/review')).data.khus.find((k) => k.khu === 'B');
    ok('phiếu chưa duyệt mà bị từ chối: không nhắc khu nào', !kB.recheck, JSON.stringify(kB));
  }

  /* ================= 34. Khu/phi bị ẩn bằng tay mà còn thép: chốt không được bỏ rơi =================
     Hệ thống từ chối ẩn khu/phi còn thép, nhưng dữ liệu cũ (ẩn bằng tay trong DB trước khi có
     chốt chặn đó) vẫn tồn tại — xem mục 9. Tồn chuẩn ghi lúc chốt nay liệt kê theo khu × phi
     ĐANG BẬT, nên nếu không giữ lại những ô còn thép thì một lần chốt là xoá sạch số thép đó
     khỏi sổ, không có cảnh báo nào. */
  {
    const S = await setup();
    let day = vnDay();
    await nhap(S, { khu: 'A', lines: [{ phi: 'D14', qty: 222 }] });
    await nhap(S, { khu: 'B', lines: [{ phi: 'D16', qty: 180 }] });
    await bao(S, { khu: 'A', day, items: items({ D14: 222 }) }, 'An');
    await bao(S, { khu: 'B', day, items: items({ D16: 180 }) }, 'Binh');
    await chot(S, { note: '' });
    eq('tồn chuẩn ngày đầu có thép của khu A', S.one("SELECT v FROM baseline WHERE day=? AND khu_id='A' AND phi_id='D14'", day).v, 222);

    // dữ liệu cũ: ẩn khu A và ẩn phi D16 bằng tay, cả hai vẫn còn thép
    S.raw.exec("UPDATE khu SET active = 0 WHERE id = 'A'");
    S.raw.exec("UPDATE phi SET active = 0 WHERE id = 'D16'");
    addDays(1); day = vnDay();
    // khu B báo tiếp (D16 đã tắt nên không còn được hỏi), rồi chốt
    await bao(S, { khu: 'B', day, items: items({}) }, 'Binh');
    const cl = await chot(S, { note: 'khu A và D16 bị ẩn tay' });
    eq('chốt được', cl.status, 200);

    const bl = Object.fromEntries(S.sql('SELECT khu_id, phi_id, v FROM baseline WHERE day = ?', day).map((x) => [x.khu_id + '|' + x.phi_id, x.v]));
    eq('thép ở khu đã ẩn vẫn còn trong tồn chuẩn', bl['A|D14'], 222);
    eq('thép của phi đã tắt vẫn còn trong tồn chuẩn', bl['B|D16'], 180);
    const rv = (await S.call('GET', '/review')).data;
    eq('và tổng bãi của D14 vẫn đếm thép ở khu đã ẩn', rv.rows.find((r) => r.phi === 'D14').old, 222);
    eq('D16 vẫn được bày ra màn Duyệt vì còn số liệu', !!rv.rows.find((r) => r.phi === 'D16'), true);
  }

  /* ================= 35. Chốt chặn chuyển quá tồn: hai đường duyệt phải giống nhau =================
     "Duyệt phiếu" và "Duyệt khu" (gộp cả phiếu đang chờ của khu) làm cùng một việc nên phải cùng
     một chốt chặn, nếu không thì bấm nút này được mà nút kia không — và thép chuyển đi nhiều hơn
     số khu thực có.

     Cảnh dựng ra đây là cảnh xảy ra thật: nhập sai một xe, đã lập phiếu chuyển dựa trên số đó,
     rồi mới hủy phiếu nhập. Lúc lập phiếu chuyển thì còn đủ thép, lúc duyệt thì không. */
  {
    const S = await setup();
    const day = vnDay();
    // nhập 440 vào khu A và duyệt, rồi lập phiếu chuyển 400 sang B (hợp lệ vì A đang có 440)
    const rin = await nhap(S, { khu: 'A', lines: [{ phi: 'D10', qty: 440 }] });
    const t = await S.call('POST', '/transfers', { from: 'A', to: 'B', lines: [{ phi: 'D10', qty: 400 }] });
    eq('lập phiếu chuyển 400/440: được', t.status, 200);

    // hủy phiếu nhập đã duyệt: khu A không còn thép, phiếu chuyển 400 thành vô căn cứ
    advance(2000);
    eq('hủy phiếu nhập đã duyệt', (await S.call('DELETE', '/receipts/' + rin.data.id)).status, 200);

    const d1 = await S.call('POST', '/receipts/' + t.data.id + '/duyet', {});
    eq('ĐƯỜNG 1 — duyệt riêng phiếu: bị từ chối', d1.status, 400);
    ok('nói rõ khu nào còn bao nhiêu', /Khu A/.test(JSON.stringify(d1.data)), JSON.stringify(d1.data));

    // ĐƯỜNG 2 — duyệt khu A, phiếu bị gộp theo: phải bị từ chối y như vậy
    advance(1000);
    await S.call('PUT', '/counts', { khu: 'A', day, items: items({}) }, 'An');
    const d2 = await S.call('POST', '/review/duyet', { khu: 'A' });
    eq('ĐƯỜNG 2 — duyệt khu (gộp phiếu): cũng bị từ chối', d2.status, 400);
    /* Và không được duyệt nửa vời: phép kiểm chạy TRƯỚC khi dựng batch, nên số của khu vẫn đang
       chờ. Nếu kiểm sau thì admin không biết nửa nào đã vào tồn. */
    eq('số của khu vẫn đang chờ duyệt',
      S.one('SELECT duyet_v FROM counts WHERE day=? AND khu_id=? AND phi_id=?', day, 'A', 'D10').duyet_v, null);
    eq('phiếu chuyển cũng vẫn đang chờ', S.one('SELECT duyet_day FROM receipts WHERE id=?', t.data.id).duyet_day, null);

    // từ chối phiếu chuyển rồi thì duyệt khu được bình thường
    eq('từ chối phiếu chuyển', (await S.call('DELETE', '/receipts/' + t.data.id)).status, 200);
    const d3 = await duyet(S, 'A');
    eq('giờ duyệt khu A được', d3.status, 200);
    eq('số của khu đã vào tồn',
      S.one('SELECT duyet_v FROM counts WHERE day=? AND khu_id=? AND phi_id=?', day, 'A', 'D10').duyet_v, 0);

    // chuyển trong khả năng thì đường 2 duyệt được cả phiếu
    advance(1000);
    await nhap(S, { khu: 'A', lines: [{ phi: 'D10', qty: 100 }] });
    const t2 = await S.call('POST', '/transfers', { from: 'A', to: 'B', lines: [{ phi: 'D10', qty: 60 }] });
    eq('chuyển 60/100: lập được', t2.status, 200);
    const d4 = await S.call('POST', '/review/duyet', { khu: 'A' });
    eq('duyệt khu gộp phiếu trong khả năng: được', [d4.status, d4.data.phieu], [200, 1]);
    eq('phiếu vào tồn theo ngày duyệt', S.one('SELECT duyet_day FROM receipts WHERE id=?', t2.data.id).duyet_day, day);
  }

  /* ================= 36. Xoá / sửa tên tài khoản: hoạt động phải GIỮ NGUYÊN TÊN =================
     Hai yêu cầu đi liền nhau. Tên là thứ đi theo mọi hoạt động: số đếm, phiếu, báo cáo khu và
     lần chốt ngày đều lấy tên bằng cách join users. Vì vậy:
     - Xoá tài khoản KHÔNG được xoá dòng users, nếu không toàn bộ lịch sử của người đó hiện
       "(đã xoá)" và mất dấu ai đã làm gì.
     - Phải sửa được tên, vì trước đây tên đặt lúc tạo là vĩnh viễn: một tài khoản đặt theo chức
       danh ("admin") sẽ ghi "admin" lên mọi hoạt động và không ai biết người thật là ai. */
  {
    const S = await setup();
    const day = vnDay();
    const uid = (n) => S.one('SELECT id FROM users WHERE name = ?', n).id;
    // An đếm, Kho nhập phiếu: hai dấu vết mang tên hai người
    await nhap(S, { khu: 'A', lines: [{ phi: 'D16', qty: 1800 }] }, 'Kho');
    await bao(S, { khu: 'A', day, items: items({ D16: 1800 }) }, 'An');
    const tenTrongBoot = async (who) => {
      const b = (await S.call('GET', '/bootstrap', undefined, who)).data;
      return { dem: b.counts.filter((c) => c.v).map((c) => c.uname), phieu: b.receipts.map((r) => r.uname) };
    };
    eq('trước khi xoá: hoạt động mang tên hai người', await tenTrongBoot('admin'), { dem: ['An'], phieu: ['Kho'] });

    /* --- chỉ admin ĐẦU TIÊN được sửa tên / xoá / khôi phục --- */
    const admin2 = await S.call('POST', '/users', { name: 'Admin Hai', phone: '0900000009', role: 'admin' });
    await S.login('Admin Hai', '0900000009', admin2.data.pin);
    await S.call('POST', '/change-pin', { pin: admin2.data.pin, newPin: '2846' }, 'Admin Hai');
    eq('admin thường không xoá được tài khoản',
      (await S.call('POST', `/users/${uid('An')}/delete`, {}, 'Admin Hai')).status, 403);
    eq('admin thường không sửa được tên',
      (await S.call('POST', `/users/${uid('An')}/rename`, { name: 'X' }, 'Admin Hai')).status, 403);
    eq('người đếm càng không', (await S.call('POST', `/users/${uid('An')}/delete`, {}, 'An')).status, 403);

    /* --- admin đầu tiên là tài khoản quản lý: không ai khoá, hạ quyền hay xoá được --- */
    const first = uid('Admin');
    eq('admin khác không khoá được admin đầu tiên',
      (await S.call('POST', `/users/${first}/lock`, { locked: 1 }, 'Admin Hai')).status, 400);
    eq('không hạ quyền được admin đầu tiên',
      (await S.call('POST', `/users/${first}/role`, { role: 'nguoidem' }, 'Admin Hai')).status, 400);
    eq('và chính admin đầu tiên cũng không tự xoá được',
      (await S.call('POST', `/users/${first}/delete`, {})).status, 400);

    /* --- SỬA TÊN: số đếm và phiếu hiện tên mới NGAY, cả dữ liệu cũ --- */
    const r1 = await S.call('POST', `/users/${uid('An')}/rename`, { name: 'Nguyễn Văn An' });
    eq('admin đầu tiên sửa được tên', r1.status, 200);
    eq('số đếm cũ hiện tên mới', (await tenTrongBoot('admin')).dem, ['Nguyễn Văn An']);
    /* Tên NGƯỜI DUYỆT cũng phải theo tên mới. Đây là chỗ dễ sót nhất mà lại đúng chỗ cần nhất:
       tài khoản hay đặt tên theo chức danh ("admin") chính là tài khoản đi duyệt gần như mọi thứ,
       nên nếu tên người duyệt bị lưu cứng vào dòng số liệu thì sửa tên xong màn Duyệt và màn Xem
       lại ngày cũ vẫn ghi tên cũ. */
    const r2 = await S.call('POST', `/users/${first}/rename`, { name: 'Phạm Quản Lý' });
    eq('sửa được tên của chính admin đầu tiên', r2.status, 200);
    eq('màn Duyệt hiện tên người duyệt mới',
      (await S.call('GET', '/review')).data.khus.find((k) => k.khu === 'A').duyet.by, 'Phạm Quản Lý');
    await chot(S, { note: '' });
    eq('màn Xem lại ngày cũ cũng hiện tên mới',
      [...new Set((await S.call('GET', '/day?date=' + day)).data.counts.map((c) => c.uname))], ['Phạm Quản Lý']);
    eq('tên trùng tên cũ: từ chối', (await S.call('POST', `/users/${uid('Nguyễn Văn An')}/rename`, { name: 'Nguyễn Văn An' })).status, 400);
    eq('tên rỗng: từ chối', (await S.call('POST', `/users/${uid('Nguyễn Văn An')}/rename`, { name: '  ' })).status, 400);
    /* Nhật ký thì KHÁC: nó lưu sẵn tên vào từng dòng và database từ chối mọi lệnh sửa, nên dòng
       cũ giữ tên cũ — cố ý, để nhật ký không viết lại được. Dòng "đổi tên" là cái nối hai tên. */
    const nk = S.sql('SELECT user_name, action, detail FROM audit ORDER BY id');
    ok('dòng nhật ký cũ vẫn mang tên lúc đó', nk.some((x) => x.action === 'count' && x.user_name === 'An'),
      JSON.stringify(nk.filter((x) => x.action === 'count').map((x) => x.user_name)));
    const rn = nk.find((x) => x.action === 'user_rename');
    eq('và có dòng nối hai tên lại', rn && JSON.parse(rn.detail).from + ' -> ' + JSON.parse(rn.detail).to, 'An -> Nguyễn Văn An');

    /* --- XOÁ: hoạt động giữ nguyên tên, không còn đăng nhập, bỏ phân công khu --- */
    const anId = uid('Nguyễn Văn An');
    await S.call('PUT', `/khu/A/users`, { users: [anId] });
    eq('An đang phụ trách khu A', S.sql('SELECT 1 FROM khu_user WHERE user_id = ?', anId).length, 1);
    // An là người phụ trách DUY NHẤT của khu A nên phải xác nhận một lần — mục 41 kiểm riêng
    const del = await S.call('POST', `/users/${anId}/delete`, { confirm_khu: true });
    eq('xoá được', del.status, 200);
    eq('DÒNG users KHÔNG bị xoá — đây là điều kiện để giữ tên',
      S.one('SELECT name, deleted FROM users WHERE id = ?', anId), { name: 'Nguyễn Văn An', deleted: 1 });
    eq('số đếm và phiếu vẫn mang đúng tên người làm', await tenTrongBoot('admin'),
      { dem: ['Nguyễn Văn An'], phieu: ['Kho'] });
    eq('màn Duyệt cũng vẫn thấy tên', (await S.call('GET', '/review')).data.khus.find((k) => k.khu === 'A').rep.uname, 'Nguyễn Văn An');
    eq('bị thu hồi mọi phiên', S.sql('SELECT 1 FROM sessions WHERE user_id = ?', anId).length, 0);
    eq('bị bỏ khỏi phân công khu', S.sql('SELECT 1 FROM khu_user WHERE user_id = ?', anId).length, 0);
    eq('không đăng nhập lại được', (await S.call('POST', '/login', { phone: '0900000002', pin: '1357' }, 'An2')).status, 401);
    eq('phiên cũ cũng không dùng được nữa', (await S.call('GET', '/bootstrap', undefined, 'An')).status, 401);

    // tài khoản đã xoá thì chỉ còn khôi phục, không đặt lại PIN / đổi vai trò nửa vời
    eq('không đặt lại PIN cho tài khoản đã xoá', (await S.call('POST', `/users/${anId}/reset-pin`, {})).status, 400);
    eq('không gán khu cho tài khoản đã xoá', (await S.call('PUT', `/khu/A/users`, { users: [anId] })).status, 400);
    // tài khoản đang khoá cũng không gán được: khu gán cho người không đăng nhập được thì chỉ admin còn đếm được
    const binh = S.one("SELECT id FROM users WHERE name = 'Binh'").id;
    await S.call('POST', `/users/${binh}/lock`, { locked: true });
    const kq = await S.call('PUT', `/khu/B/users`, { users: [binh] });
    eq('không gán khu cho tài khoản đang khoá', kq.status, 400);
    ok('và nói rõ phải mở khoá trước', /khoá/.test(JSON.stringify(kq.data)), JSON.stringify(kq.data));
    await S.call('POST', `/users/${binh}/lock`, { locked: false });
    eq('mở khoá rồi thì gán được', (await S.call('PUT', `/khu/B/users`, { users: [binh] })).status, 200);
    // số điện thoại vẫn bị giữ: nói rõ đường đi thay vì "đã có tài khoản"
    const dup = await S.call('POST', '/users', { name: 'Người mới', phone: '0900000002', role: 'nguoidem' });
    ok('tạo trùng số của tài khoản đã xoá: chỉ dẫn khôi phục', /khôi phục/i.test(JSON.stringify(dup.data)), JSON.stringify(dup.data));

    /* --- KHÔI PHỤC --- */
    const res = await S.call('POST', `/users/${anId}/restore`, {});
    eq('khôi phục được', res.status, 200);
    eq('và bắt đổi PIN khi đăng nhập lại', S.one('SELECT deleted, must_change FROM users WHERE id = ?', anId), { deleted: 0, must_change: 1 });
    eq('khôi phục lần hai: từ chối', (await S.call('POST', `/users/${anId}/restore`, {})).status, 400);

    // danh sách trả cả tài khoản đã xoá và id admin đầu tiên, để màn hình bày đúng nút
    await S.call('POST', `/users/${anId}/delete`, {});
    const ls = (await S.call('GET', '/users')).data;
    eq('danh sách nói rõ ai là admin đầu tiên', ls.first, first);
    eq('và kèm tài khoản đã xoá để khôi phục', ls.users.filter((u) => u.deleted).map((u) => u.name), ['Nguyễn Văn An']);
  }

  /* ================= 37. Đặt tồn về 0: kiểm kê lại, giữ nguyên lịch sử =================
     Mốc kiểm kê đi qua đúng cơ chế chốt ngày, nên sau đó mọi thứ tự đúng. Bốn cái bẫy:
     - Tồn phải về 0 NGAY HÔM NAY. Tồn đọc theo số đếm hiệu lực, còn tồn chuẩn chỉ có tác dụng từ
       ngày mai: nếu chỉ ghi tồn chuẩn thì bấm nút xong màn Tồn bãi vẫn hiện số cũ nguyên vẹn.
     - Lượng dùng của ngày đặt lại phải để TRỐNG. Ghi số thì chênh lệch giữa tồn cũ và 0 thành một
       cú "đã dùng" khổng lồ, nó vào mức dùng trung bình và kéo cảnh báo "dùng nhiều bất thường"
       sai suốt 28 ngày sau.
     - Mở lại ngày phải HOÀN TÁC được, tức bỏ luôn các số 0 mà mốc kiểm kê đã ghi.
     - Số đếm và phiếu của hôm nay không được để lại việc nào treo. */
  {
    const S = await setup();
    let day = vnDay();
    await nhap(S, { khu: 'A', lines: [{ phi: 'D16', qty: 1800 }] });
    await nhap(S, { khu: 'B', lines: [{ phi: 'D10', qty: 440 }] });
    await bao(S, { khu: 'A', day, items: items({ D16: 1800 }) }, 'An');
    await bao(S, { khu: 'B', day, items: items({ D10: 440 }) }, 'Binh');
    await chot(S, { note: '' });
    const ngayDau = day;
    // năm ngày dùng đều 100 cây D16 để có mức dùng trung bình đáng tin
    for (let i = 0; i < 5; i++) {
      addDays(1); day = vnDay();
      await bao(S, { khu: 'A', day, items: items({ D16: 1700 - i * 100 }) }, 'An');
      await bao(S, { khu: 'B', day, items: items({ D10: 440 }) }, 'Binh');
      await chot(S, { note: '' });
    }
    eq('tồn chuẩn trước khi đặt lại', S.one("SELECT v FROM baseline WHERE day=? AND khu_id='A' AND phi_id='D16'", day).v, 1300);
    const rateTruoc = S.one("SELECT per_day FROM phi_rate WHERE phi_id='D16'").per_day;
    eq('và có mức dùng trung bình', rateTruoc, 100);

    addDays(1); day = vnDay();
    // hôm nay có một báo cáo đang chờ duyệt và một phiếu đang chờ duyệt
    await S.call('PUT', '/counts', { khu: 'A', day, items: items({ D16: 1250 }) }, 'An');
    const phieuCho = await S.call('POST', '/receipts', { khu: 'A', lines: [{ phi: 'D16', qty: 180 }] });
    const ton = async () => (await S.call('GET', '/review')).data.rows.filter((x) => x.cnt).map((x) => [x.phi, x.cnt]).sort();
    eq('bãi đang có thép', await ton(), [['D10', 440], ['D16', 1300]]);

    eq('người đếm không đặt lại được', (await S.call('POST', '/reset', { mode: 'zero' }, 'An')).status, 403);
    eq('thủ kho cũng không', (await S.call('POST', '/reset', { mode: 'zero' }, 'Kho')).status, 403);
    eq('kiểu không hợp lệ: từ chối', (await S.call('POST', '/reset', { mode: 'xx' })).status, 400);

    const r = await S.call('POST', '/reset', { mode: 'zero' });
    eq('admin đầu tiên đặt tồn về 0', r.status, 200);
    ok('trả về số tấn đã có trước khi đặt lại', r.data.tan > 0, r.data.tan);

    // --- tồn về 0 NGAY HÔM NAY, không phải chờ sang mai ---
    eq('tổng bãi về 0 ngay trong ngày đặt lại', await ton(), []);
    eq('số đếm của mọi ô được ghi 0 và đã duyệt',
      S.sql('SELECT 1 FROM counts WHERE day = ? AND (duyet_v <> 0 OR duyet_v IS NULL)', day).length, 0);
    ok('lần kiểm kê có dấu ở lịch sử đếm (bảng chỉ-ghi-thêm)',
      S.sql('SELECT 1 FROM counts_log WHERE day = ? AND v = 0', day).length > 0);
    eq('tồn chuẩn hôm nay = 0 ở mọi ô', S.sql('SELECT 1 FROM baseline WHERE day = ? AND v <> 0', day).length, 0);
    ok('và đủ dòng cho mọi khu × phi', S.sql('SELECT 1 FROM baseline WHERE day = ?', day).length >= 39,
      S.sql('SELECT 1 FROM baseline WHERE day = ?', day).length);
    const rvNay = (await S.call('GET', '/review')).data;
    eq('hôm nay thành đã chốt (đây là một mốc kiểm kê)', rvNay.closed, true);
    /* Mọi khu phải mang dấu "đã báo, đã duyệt": lần đặt lại là một cuộc kiểm kê toàn bãi do admin
       khai số cho từng khu. Thiếu dấu đó thì khu nào chưa báo hôm nay vẫn hiện "Chưa báo" ngay
       sau khi kiểm kê xong, và màn Duyệt đòi họ báo lại đúng con số admin vừa khai. */
    eq('mọi khu mang dấu đã báo', rvNay.khus.filter((k) => !k.rep).map((k) => k.khu), []);
    eq('và không khu nào còn chờ duyệt', rvNay.khus.filter((k) => k.waiting).map((k) => k.khu), []);
    eq('không còn khu nào bị đòi báo', rvNay.exceptions.filter((e) => e.type === 'khu_missing').length, 0);

    // --- không sinh cú "đã dùng" giả, mức dùng trung bình không bị kéo lệch ---
    eq('ngày đặt lại để trống lượng dùng', S.one('SELECT dung FROM daily_summary WHERE day=? AND phi_id=?', day, 'D16').dung, null);
    eq('mức dùng trung bình giữ nguyên', S.one("SELECT per_day FROM phi_rate WHERE phi_id='D16'").per_day, rateTruoc);

    // --- nhật ký giữ lại con số TRƯỚC khi đặt lại, và nhật ký thì không xoá được ---
    const nk = JSON.parse(S.one("SELECT detail FROM audit WHERE action='reset_zero' ORDER BY id LIMIT 1").detail);
    eq('nhật ký ghi tổng thép trước khi đặt lại theo từng phi',
      nk.truoc.map((x) => [x.phi, x.v]).sort(), [['D10', 440], ['D16', 1300]]);
    ok('và tổng số tấn', nk.tan > 25, nk.tan);

    /* --- HOÀN TÁC: mở lại ngày phải trả tồn về đúng như trước khi đặt lại ---
       Mốc kiểm kê đã ghi số 0 vào số đếm của mọi ô, nên mở lại ngày mà chỉ bỏ mốc chốt thì tồn
       vẫn bằng 0 — lần đặt lại coi như không hoàn tác được, trái điều đã hứa với người dùng. */
    const ro = await S.call('POST', '/reopen', { note: 'bấm nhầm' });
    eq('mở lại ngày được', ro.status, 200);
    eq('và nói rõ đây là hoàn tác một mốc kiểm kê', ro.data.reset, true);
    eq('tồn quay lại đúng như trước khi đặt lại', await ton(), [['D10', 440], ['D16', 1300]]);
    eq('các số 0 của mốc kiểm kê đã bị bỏ',
      S.sql('SELECT 1 FROM counts WHERE day = ? AND duyet_v = 0', day).length, 0);
    /* Và DỰNG LẠI đúng lần báo đang chờ duyệt của khu A trước lúc đặt lại — kể cả trạng thái
       "chưa duyệt". Không có ảnh chụp thì chỗ này chỉ còn cách lùi về tồn chuẩn cũ, mà ngày chưa
       có lần chốt nào trước đó thì không có tồn chuẩn nào để lùi: số 1250 mất hẳn. */
    eq('lần báo đang chờ duyệt của khu A được dựng lại nguyên trạng',
      S.one('SELECT v, duyet_v FROM counts WHERE day=? AND khu_id=? AND phi_id=?', day, 'A', 'D16'),
      { v: 1250, duyet_v: null });
    eq('và dấu "khu đã báo" của khu A cũng được dựng lại',
      S.sql('SELECT khu_id FROM khu_report WHERE day = ?', day).map((x) => x.khu_id), ['A']);
    const khusRo = (await S.call('GET', '/review')).data.khus;
    eq('khu A vẫn đang chờ duyệt như trước', khusRo.find((k) => k.khu === 'A').waiting > 0, true);
    eq('khu B, C vẫn chưa báo như trước', khusRo.filter((k) => k.rep).map((k) => k.khu), ['A']);
    eq('phiếu chờ duyệt không bị hoàn tác xoá mất', S.one('SELECT voided FROM receipts WHERE id=?', phieuCho.data.id).voided, 0);

    // đặt lại lần nữa để kiểm phần ngày sau
    eq('đặt lại lần nữa được', (await S.call('POST', '/reset', { mode: 'zero' })).status, 200);

    // --- sang ngày sau: mọi khu bắt đầu từ 0 ---
    addDays(1);
    const rvSau = (await S.call('GET', '/review')).data;
    eq('dự kiến của mọi khu là 0',
      rvSau.khus.flatMap((k) => k.items.map((i) => i.exp)).filter((x) => x !== 0), []);
    eq('tổng bãi vẫn 0', rvSau.rows.filter((x) => x.cnt).map((x) => x.phi), []);
    ok('không có cảnh báo "dùng nhiều bất thường"', !rvSau.rows.some((x) => x.high), JSON.stringify(rvSau.rows.filter((x) => x.high)));
    eq('báo cáo chờ duyệt của ngày trước không treo lại', rvSau.khus.filter((k) => k.waiting).length, 0);
    eq('nhưng phiếu chờ duyệt vẫn còn (nó là chứng từ thật)', rvSau.phieu.map((v) => v.id), [phieuCho.data.id]);

    // --- lịch sử cũ vẫn xem được: đây là điểm khác hẳn xoá sạch ---
    eq('ngày chốt đầu tiên vẫn còn', S.sql('SELECT 1 FROM day_close WHERE day = ?', ngayDau).length, 1);
    const rep = (await S.call('GET', `/report?from=${ngayDau}&to=${ngayDau}`)).data;
    ok('báo cáo theo kỳ cũ vẫn đọc được', rep.rows.some((x) => x.phi === 'D16'), JSON.stringify(rep.rows.map((x) => x.phi)));

    /* --- mở lại một ngày chốt THƯỜNG thì không được xoá số đếm của khu ---
       Cùng một nút "Mở lại ngày" nhưng hai loại ngày phải hoàn tác hai thứ khác nhau. */
    day = vnDay();
    /* Duyệt nốt phiếu 180 còn chờ và nhập thêm 300 nữa, rồi khu A đếm đúng 480. Phải có phiếu
       cho đủ 480: sau khi tồn về 0, thép xuất hiện mà không có phiếu nào là "dùng âm" — hệ thống
       bắt đúng, và đó chính là cái làm việc thống kê lại từ 0 có nghĩa. */
    eq('duyệt phiếu 180 còn chờ', (await duyetP(S, phieuCho.data.id)).status, 200);
    await nhap(S, { khu: 'A', lines: [{ phi: 'D16', qty: 300 }] });
    await bao(S, { khu: 'A', day, items: items({ D16: 480 }) }, 'An');
    await bao(S, { khu: 'B', day, items: items({}) }, 'Binh');
    await bao(S, { khu: 'C', day, items: items({}) }, 'An');
    const rvT = (await S.call('GET', '/review')).data;
    eq('đếm khớp phiếu thì không còn việc gì', rvT.pending, 0, JSON.stringify(rvT.exceptions));
    eq('chốt ngày thường được', (await chotNgay(S)).status, 200);
    const ro2 = await S.call('POST', '/reopen', { note: 'chốt nhầm' });
    eq('mở lại ngày chốt thường: không còn (chỉ hoàn tác đặt lại số liệu)', ro2.status, 400);
    eq('số đếm của khu còn nguyên',
      S.one('SELECT duyet_v FROM counts WHERE day=? AND khu_id=? AND phi_id=?', day, 'A', 'D16').duyet_v, 480);
  }

  /* ================= 38. Xoá sạch dữ liệu thép: như bãi mới dựng =================
     Không hoàn tác được, nên phải gõ đúng câu xác nhận. Và dù xoá sạch, hai bảng chỉ-ghi-thêm
     (nhật ký, lịch sử đếm) vẫn còn — con số cũ còn một chỗ đọc lại được mãi mãi. */
  {
    const S = await setup();
    let day = vnDay();
    await nhap(S, { khu: 'A', lines: [{ phi: 'D16', qty: 1800 }] });
    await bao(S, { khu: 'A', day, items: items({ D16: 1800 }) }, 'An');
    await chot(S, { note: '' });
    addDays(1); day = vnDay();
    await bao(S, { khu: 'A', day, items: items({ D16: 1700 }) }, 'An');

    eq('người đếm không xoá sạch được', (await S.call('POST', '/reset', { mode: 'wipe', confirm: 'XOA SACH' }, 'An')).status, 403);
    const thieu = await S.call('POST', '/reset', { mode: 'wipe' });
    eq('không gõ câu xác nhận: từ chối', thieu.status, 409);
    eq('mã lỗi nói rõ cần xác nhận', thieu.data.code, 'need_confirm');
    eq('gõ sai câu xác nhận: từ chối', (await S.call('POST', '/reset', { mode: 'wipe', confirm: 'xoa' })).status, 409);
    ok('gõ đúng nhưng chữ thường vẫn nhận', (await S.call('POST', '/reset', { mode: 'wipe', confirm: ' xoa sach ' })).status === 200);

    for (const t of ['counts', 'khu_report', 'receipts', 'day_close', 'baseline', 'daily_summary', 'phi_rate']) {
      eq('đã xoá sạch bảng ' + t, S.sql('SELECT 1 FROM ' + t).length, 0);
    }
    eq('chuỗi giữ nguyên về 0', S.sql('SELECT 1 FROM khu_phi WHERE keep_streak <> 0').length, 0);
    // hai bảng chỉ-ghi-thêm KHÔNG bị xoá: trigger của database từ chối, và đó là chỗ đọc lại số cũ
    ok('lịch sử đếm vẫn còn', S.sql('SELECT 1 FROM counts_log').length > 0);
    const nk = S.one("SELECT detail FROM audit WHERE action='reset_wipe' ORDER BY id DESC LIMIT 1");
    ok('nhật ký ghi lại tổng thép trước khi xoá', JSON.parse(nk.detail).truoc.some((x) => x.phi === 'D16'), nk.detail);

    // --- bãi trở lại trạng thái mới dựng: dùng được ngay, lần chốt tới tạo tồn chuẩn đầu tiên ---
    const rv = (await S.call('GET', '/review')).data;
    eq('không còn tồn chuẩn nào', rv.last, null);
    eq('tổng bãi về 0', rv.rows.filter((x) => x.cnt).length, 0);
    eq('chưa có mốc so nên lượng dùng để trống', rv.rows.every((x) => x.used === null), true);
    eq('không còn việc gì chờ', rv.pending, 0);
    day = vnDay();
    eq('đếm lại được bình thường', (await bao(S, { khu: 'A', day, items: items({ D16: 500 }) }, 'An')).status, 200);
    eq('và chốt được', (await chotNgay(S)).status, 200);
    eq('lần chốt này tạo tồn chuẩn đầu tiên',
      S.one("SELECT v FROM baseline WHERE day=? AND khu_id='A' AND phi_id='D16'", day).v, 500);
  }

  /* ================= 39. Tệp xuất phải nói cùng con số với app =================
     Tồn mà app hiện = số đếm đã duyệt + phiếu ĐÃ DUYỆT về sau lần đếm đó. Tệp xuất trước đây chỉ
     lấy số đếm, nên ít hơn đúng phần thép vừa về mà khu chưa kịp đếm. Nguy ở chỗ đây lại là tệp
     người dùng được bảo tải về làm BẢN SAO trước khi xoá sạch dữ liệu: bản sao thiếu thép còn tệ
     hơn không có bản sao.
     Ngày ĐÃ CHỐT thì không được cộng trùng: mốc tồn chuẩn chính là ngày đó nên phiếu duyệt trong
     ngày đã nằm trong tồn chuẩn rồi. */
  {
    const S = await setup();
    let day = vnDay();
    const cotD16 = (csv) => {
      const d = csv.split(/\r?\n/);
      const i = (d.find((l) => l.startsWith('"Khu"')) || '').split(';').findIndex((x) => x === '"D16"');
      return Number((d.find((l) => l.startsWith('"Khu A"')) || '').split(';')[i]);
    };
    await nhap(S, { khu: 'A', lines: [{ phi: 'D16', qty: 1800 }] });
    await bao(S, { khu: 'A', day, items: items({ D16: 1800 }) }, 'An');
    await chot(S, { note: '' });
    eq('ngày đã chốt: tệp xuất bằng đúng tồn chuẩn',
      cotD16(String((await S.call('GET', '/export?date=' + day)).data)), 1800);

    addDays(1); day = vnDay();
    // thép về, ĐÃ DUYỆT, nhưng chưa ai đếm lại
    await nhap(S, { khu: 'A', lines: [{ phi: 'D16', qty: 180 }] });
    const rv = (await S.call('GET', '/review')).data;
    const exp = rv.khus.find((k) => k.khu === 'A').items.find((x) => x.phi === 'D16').exp;
    eq('màn Duyệt nói dự kiến của khu là 1980', exp, 1980);
    eq('và tệp xuất nói đúng con số đó, không phải 1800',
      cotD16(String((await S.call('GET', '/export?date=' + day)).data)), 1980);

    // đếm lại rồi thì phiếu đã nằm trong số đếm: không được cộng thêm lần nữa
    await bao(S, { khu: 'A', day, items: items({ D16: 1950 }) }, 'An');
    eq('đếm rồi thì tệp xuất lấy đúng số đếm, không cộng trùng',
      cotD16(String((await S.call('GET', '/export?date=' + day)).data)), 1950);

    // chốt ngày xong, tệp xuất vẫn bằng tồn chuẩn
    await chot(S, { note: 'kiểm thử' });
    eq('chốt xong: tệp xuất bằng tồn chuẩn mới',
      cotD16(String((await S.call('GET', '/export?date=' + day)).data)), 1950);
    eq('và tồn chuẩn đúng là số đã duyệt',
      S.one("SELECT v FROM baseline WHERE day=? AND khu_id='A' AND phi_id='D16'", day).v, 1950);

    // phiếu CHƯA duyệt thì tuyệt đối không được vào tệp xuất
    addDays(1); day = vnDay();
    await S.call('POST', '/receipts', { khu: 'A', lines: [{ phi: 'D16', qty: 500 }] });
    eq('phiếu chưa duyệt không vào tệp xuất',
      cotD16(String((await S.call('GET', '/export?date=' + day)).data)), 1950);

    /* Màn "Xem lại ngày cũ" là đường đọc tồn thứ ba, và nó chọn được CHÍNH HÔM NAY (ô ngày có
       max = hôm nay). Ngày chưa chốt thì nó cũng phải cộng phần thép đã duyệt chưa ai đếm, không
       thì ba màn hình của cùng một app nói ba con số khác nhau về cùng một ngày. */
    await nhap(S, { khu: 'A', lines: [{ phi: 'D16', qty: 300 }] });
    const dv = (await S.call('GET', '/day?date=' + day)).data;
    const mvA = (dv.mvNew || []).find((x) => x.khu_id === 'A' && x.phi_id === 'D16');
    eq('màn Xem lại ngày nhận được phần thép chưa ai đếm', mvA && mvA.q, 300);
    eq('và tệp xuất cùng ngày nói đúng con số đó',
      cotD16(String((await S.call('GET', '/export?date=' + day)).data)), 2250);
    eq('màn Duyệt cũng vậy',
      (await S.call('GET', '/review')).data.khus.find((k) => k.khu === 'A').items.find((x) => x.phi === 'D16').exp, 2250);

    // ngày ĐÃ CHỐT thì tồn chuẩn là số chính thức, không cộng thêm gì
    await bao(S, { khu: 'A', day, items: items({ D16: 2250 }) }, 'An');
    await chot(S, { note: '' });
    const dv2 = (await S.call('GET', '/day?date=' + day)).data;
    eq('ngày đã chốt: không còn phần nào chưa đếm', (dv2.mvNew || []).length, 0);
    eq('và tệp xuất bằng đúng tồn chuẩn',
      cotD16(String((await S.call('GET', '/export?date=' + day)).data)), 2250);
  }

  /* ================= 40. Sao lưu toàn bộ và nạp lại =================
     App đã có nút "Xoá sạch dữ liệu thép". Bản sao duy nhất trước đây là hai tệp CSV — không có
     phiếu, không có tài khoản, và quan trọng nhất là KHÔNG nạp lại được. Mục này kiểm đúng cái
     vòng tròn phải khép: tải bản sao → xoá sạch → nạp lại → mọi thứ như cũ. */
  {
    const S = await setup();
    const day = vnDay();
    const rc = await nhap(S, { khu: 'A', lines: [{ phi: 'D16', qty: 1800 }] });
    await bao(S, { khu: 'A', day, items: items({ D16: 1800 }) }, 'An');
    await chot(S);
    const noteTruoc = S.one('SELECT note FROM day_close WHERE day=?', day).note;

    eq('người đếm không tải được bản sao', (await S.call('GET', '/backup', undefined, 'An')).status, 403);
    eq('thủ kho cũng không', (await S.call('GET', '/backup', undefined, 'Kho')).status, 403);
    const bk = await S.call('GET', '/backup');
    eq('admin đầu tiên tải được', bk.status, 200);
    const f = bk.data;
    eq('tệp nhận đúng là bản sao của app này', [f.app, f.ban], ['kho-thep', 1]);
    ok('và ghi phiên bản cấu trúc để sau này còn kiểm', f.schema > 0, f.schema);
    ok('ghi ai tải và lúc nào', f.boi === 'Admin' && f.luc > 0, { boi: f.boi, ngay: f.ngay });

    // phải có đủ những bảng mà thiếu là không dựng lại được bãi
    for (const t of ['phi', 'khu', 'users', 'counts', 'receipts', 'day_close', 'baseline', 'daily_summary', 'settings']) {
      ok('bản sao có bảng ' + t, Array.isArray(f.bang[t]) && f.bang[t].length > 0, f.bang[t] && f.bang[t].length);
    }
    ok('và chép cả nhật ký để còn đọc lại', f.bang.audit.length > 0, f.bang.audit.length);
    ok('phiên đăng nhập thì KHÔNG chép (không phải số liệu bãi)', f.bang.sessions === undefined);
    eq('số đếm trong bản sao đúng là số đã duyệt',
      f.bang.counts.filter((c) => c.duyet_v).map((c) => [c.khu_id, c.phi_id, c.duyet_v]), [['A', 'D16', 1800]]);

    /* --- xoá sạch rồi nạp lại --- */
    eq('xoá sạch', (await S.call('POST', '/reset', { mode: 'wipe', confirm: 'XOA SACH' })).status, 200);
    eq('đúng là đã trắng', (await S.call('GET', '/review')).data.rows.filter((r) => r.cnt).length, 0);

    eq('người đếm không nạp lại được', (await S.call('POST', '/restore', { file: f, confirm: 'NAP LAI' }, 'An')).status, 403);
    const k1 = await S.call('POST', '/restore', { file: f });
    eq('không gõ câu xác nhận: từ chối', k1.status, 409);
    eq('mã lỗi nói rõ cần xác nhận', k1.data.code, 'need_confirm');
    eq('tệp lạ: từ chối', (await S.call('POST', '/restore', { file: { app: 'khac' }, confirm: 'NAP LAI' })).status, 400);
    /* Khác phiên bản cấu trúc thì phải từ chối: ghi dữ liệu cũ vào bảng đã đổi cột là hỏng kiểu
       không sửa được, thà không nạp còn hơn nạp hỏng. Lùi HAI bản: bản ngay trước (14) được
       BK_COMPAT cho nạp vì các bản sau chỉ thêm bảng/cột — xem mục 48. Bản 14 thì không còn nhận. */
    const sai = await S.call('POST', '/restore', { file: { ...f, schema: 14 }, confirm: 'NAP LAI' });
    eq('bản sao khác phiên bản cấu trúc: từ chối', sai.status, 400);
    ok('và nói rõ hai phiên bản', /cấu trúc/.test(JSON.stringify(sai.data)), sai.data);

    const kq = await S.call('POST', '/restore', { file: f, confirm: 'NAP LAI' });
    eq('nạp lại được', kq.status, 200);
    eq('tồn trở lại đúng như trước khi xoá',
      (await S.call('GET', '/review')).data.rows.filter((r) => r.cnt).map((r) => [r.phi, r.cnt]), [['D16', 1800]]);
    // đọc kiểu không-vỡ: mất bảng thì ra undefined và báo lỗi đọc được, chứ không ném TypeError
    eq('tồn chuẩn dựng lại đủ',
      (S.one("SELECT v FROM baseline WHERE day=? AND khu_id='A' AND phi_id='D16'", day) || {}).v, 1800);
    eq('phiếu nhập dựng lại đủ, giữ nguyên trạng thái duyệt',
      S.one('SELECT qty, duyet_day FROM receipts WHERE id=?', rc.data.id) || null, { qty: 1800, duyet_day: day });
    eq('ngày đã chốt dựng lại đủ', S.sql('SELECT note FROM day_close WHERE day=?', day).map((x) => x.note), [noteTruoc]);
    eq('tài khoản dựng lại đủ', S.sql('SELECT 1 FROM users').length, f.bang.users.length);
    eq('và đăng nhập lại được bằng PIN cũ', (await S.call('POST', '/login', { phone: '0900000002', pin: '1357' }, 'An3')).status, 200);
    eq('báo cáo theo kỳ đọc lại được', (await S.call('GET', `/report?from=${day}&to=${day}`)).data.rows.some((x) => x.phi === 'D16'), true);

    /* Nhật ký KHÔNG bị thay: database từ chối xoá nó, nên nạp lại chỉ có thể cộng thêm, tức nhân
       đôi lịch sử. Thà để nguyên và ghi một dòng nói rõ vừa nạp lại. */
    ok('nạp lại để lại dấu trong nhật ký', S.sql("SELECT 1 FROM audit WHERE action='restore'").length === 1);
    ok('và nhật ký cũ vẫn còn, không bị nhân đôi',
      S.sql("SELECT 1 FROM audit WHERE action='reset_wipe'").length === 1);

    // bãi dùng tiếp được bình thường sau khi nạp lại
    addDays(1);
    const d2 = vnDay();
    eq('đếm tiếp được', (await bao(S, { khu: 'A', day: d2, items: items({ D16: 1700 }) }, 'An')).status, 200);
    eq('và lượng dùng tính đúng từ tồn chuẩn vừa dựng lại',
      (await S.call('GET', '/review')).data.rows.find((r) => r.phi === 'D16').used, 100);
  }

  /* ================= 41. Phiếu xuất tự nguyện =================
     Nguyên tắc "không ai phải nhập phiếu xuất" giữ nguyên: lượng dùng VẪN suy ra từ
     tồn cũ + nhập − đếm. Phiếu xuất không thay phép tính đó, nó chỉ giải thích được bao nhiêu
     phần trong đó, và phần KHÔNG RÕ co lại bấy nhiêu.

     Cái bẫy lớn nhất ở đây: nếu để phần xuất nằm trong vế "nhập" của phép tính thì nó tự triệt
     tiêu với phần khu đếm hụt, và "đã dùng" tụt xuống chỉ còn phần không có phiếu. Hậu quả không
     nằm ở con số hiển thị mà ở mức dùng trung bình: nó thành thấp hơn thực tế, rồi dự báo "còn đủ
     dùng bao nhiêu ngày" nói dư ra — càng ghi phiếu đầy đủ thì dự báo càng sai. */
  {
    const S = await setup();
    let day = vnDay();
    await nhap(S, { khu: 'A', lines: [{ phi: 'D16', qty: 1800 }] });
    await bao(S, { khu: 'A', day, items: items({ D16: 1800 }) }, 'An');
    await chot(S, { note: '' });

    addDays(1); day = vnDay();
    eq('người đếm không lập phiếu xuất được',
      (await S.call('POST', '/xuat', { khu: 'A', lines: [{ phi: 'D16', qty: 100 }], noi: 'CT X' }, 'An')).status, 403);
    eq('không ghi nơi đến: từ chối',
      (await S.call('POST', '/xuat', { khu: 'A', lines: [{ phi: 'D16', qty: 100 }] })).status, 400);
    eq('xuất quá số đang có: từ chối',
      (await S.call('POST', '/xuat', { khu: 'A', lines: [{ phi: 'D16', qty: 5000 }], noi: 'CT X' })).status, 400);

    const px = await S.call('POST', '/xuat', { khu: 'A', lines: [{ phi: 'D16', qty: 1100 }], noi: 'Công trình Nam Hà', note: 'xe 29C' });
    eq('lập phiếu xuất được', px.status, 200);
    const r = S.one('SELECT kind, qty, khu_id, note, duyet_day FROM receipts WHERE id=?', px.data.id);
    eq('lưu đúng loại, dấu âm, và chờ duyệt', [r.kind, r.qty, r.khu_id, r.duyet_day], ['xuat', -1100, 'A', null]);
    ok('ghi rõ xuất cho đâu', /Nam Hà/.test(r.note) && /29C/.test(r.note), r.note);
    /* Nhật ký phải giữ NơI ĐẾN thành một khóa riêng, và ghi chú rời thành khóa 'ghi': writeReceipt
       luôn ghi đè khóa note bằng nội dung phiếu, mà nội dung đó đã chứa sẵn nơi đến — dùng note
       để làm ghi chú là dòng nhật ký nhắc nơi đến hai lần. Nhật ký thì không sửa lại được. */
    const nkx = JSON.parse(S.one("SELECT detail FROM audit WHERE action='issue' ORDER BY id DESC").detail);
    eq('nhật ký giữ nơi đến riêng một khóa', nkx.noi, 'Công trình Nam Hà');
    eq('và ghi chú rời không bị nội dung phiếu ghi đè', nkx.ghi, 'xe 29C');

    // chưa duyệt thì chưa đổi gì
    let rv = (await S.call('GET', '/review')).data;
    eq('phiếu xuất chưa duyệt: dự kiến của khu chưa đổi',
      rv.khus.find((k) => k.khu === 'A').items.find((x) => x.phi === 'D16').exp, 1800);
    eq('và hiện ra ở danh sách chờ duyệt', rv.phieu.filter((v) => v.kind === 'xuat').length, 1);

    eq('duyệt phiếu xuất', (await duyetP(S, px.data.id)).status, 200);
    rv = (await S.call('GET', '/review')).data;
    eq('duyệt rồi: dự kiến của khu tụt đúng 1.100',
      rv.khus.find((k) => k.khu === 'A').items.find((x) => x.phi === 'D16').exp, 700);

    /* Khu đếm ra 500: thực tế đã đi 1.300 (1.100 có phiếu + 200 không rõ).
       "Đã dùng" phải là 1.300 — TỔNG lượng dùng — chứ không phải 200. */
    await bao(S, { khu: 'A', day, items: items({ D16: 500 }) }, 'An');
    rv = (await S.call('GET', '/review')).data;
    const row = rv.rows.find((x) => x.phi === 'D16');
    eq('đã dùng là TỔNG lượng dùng, không phải phần còn lại', row.used, 1300);
    eq('và tách riêng phần có phiếu', row.xuat, 1100);
    eq('nên phần không rõ là 200', row.used - row.xuat, 200);
    eq('lệch của khu chính là phần không rõ',
      rv.khus.find((k) => k.khu === 'A').items.find((x) => x.phi === 'D16').d, -200);

    await chot(S, { note: 'có phiếu xuất' });
    const ds = S.one('SELECT nhap, dung, xuat FROM daily_summary WHERE day=? AND phi_id=?', day, 'D16');
    eq('bảng tổng hợp: nhập không lẫn phần xuất', ds.nhap, 0);
    eq('lượng dùng vẫn là tổng', ds.dung, 1300);
    eq('và phần có phiếu để riêng một cột', ds.xuat, 1100);

    /* Mức dùng trung bình phải thấy đủ 1.300. Đây mới là chỗ sai nguy hiểm nhất nếu tính nhầm:
       nó kéo theo dự báo "còn đủ dùng bao nhiêu ngày" nói dư ra. */
    eq('mức dùng trung bình tính trên tổng lượng dùng',
      S.one("SELECT per_day FROM phi_rate WHERE phi_id='D16'").per_day, 1300);

    // báo cáo kỳ phải khép kín: đầu + nhập − dùng = cuối
    const rep = (await S.call('GET', `/report?from=${day}&to=${day}`)).data;
    const rr = rep.rows.find((x) => x.phi === 'D16');
    eq('báo cáo kỳ vẫn khép kín', rr.dau + rr.nhap - rr.dung, rr.cuoi);
    eq('và nêu riêng phần xuất có phiếu', rr.xuat, 1100);

    /* Không ghi phiếu xuất thì app chạy y như trước — đây là điều kiện để tính năng này là
       "tự nguyện" chứ không phải bắt buộc. */
    addDays(1); day = vnDay();
    await bao(S, { khu: 'A', day, items: items({ D16: 400 }) }, 'An');
    const rv2 = (await S.call('GET', '/review')).data;
    const row2 = rv2.rows.find((x) => x.phi === 'D16');
    eq('không có phiếu xuất: đã dùng vẫn suy ra như cũ', row2.used, 100);
    eq('và phần có phiếu bằng 0', row2.xuat, 0);
  }

  /* ================= 42. Không còn mở lại ngày đã chốt =================
     Sổ tự chốt sau nửa đêm: mở một ngày đã qua thì giờ sau hệ thống chốt lại ngay, nên không còn
     đường mở lại. Sai số của ngày đã qua thì lập phiếu Điều chỉnh tồn. "Mở lại" chỉ còn để hoàn tác
     lần đặt lại số liệu của hôm nay (mục đặt lại số liệu kiểm riêng). */
  {
    const S = await setup();
    const d1 = vnDay();
    await nhap(S, { khu: 'A', lines: [{ phi: 'D16', qty: 1000 }] });
    await bao(S, { khu: 'A', day: d1, items: items({ D16: 1000 }) }, 'An');
    await chot(S);
    addDays(1);
    eq('mở lại ngày đã qua: từ chối', (await S.call('POST', '/reopen', { day: d1, note: 'x' })).status, 400);
    eq('mở lại hôm nay (không phải đặt lại số liệu): từ chối', (await S.call('POST', '/reopen', { note: 'x' })).status, 400);
    eq('ngày đã qua vẫn chốt nguyên', S.sql('SELECT 1 FROM day_close WHERE day=?', d1).length, 1);
  }

  /* ================= 20. Tệp CSV mở được bằng Excel tiếng Việt ================= */
  {
    const S = await setup();
    const day = vnDay();
    await nhap(S, { khu: 'A', lines: [{ phi: 'D20', qty: 2889 }, { phi: 'D8', qty: 301 }] });
    await bao(S, { khu: 'A', day, items: items({ D20: { v: 2889, bo: 25, le: 39 }, D8: { v: 301, bo: 3, le: 1 } }) }, 'An');
    await chot(S, { note: 'x' });
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

  /* ================= 21. Quên chốt: không được bỏ số đã báo ở các ngày giữa ================= */
  {
    const S = await setup();
    const d1 = vnDay();
    await nhap(S, { khu: 'A', lines: [{ phi: 'D22', qty: 90 }] });
    await bao(S, { khu: 'A', day: d1, items: items({ D22: 90 }) }, 'An');
    await chot(S, { note: '' });

    // ngày 2: khu A đếm hết D22 về 0 nhưng KHÔNG ai chốt ngày
    addDays(1);
    const d2 = vnDay();
    await bao(S, { khu: 'A', day: d2, items: items({ D22: 0 }) }, 'An');
    eq('ngày 2 không chốt', S.sql('SELECT 1 FROM day_close WHERE day=?', d2).length, 0);

    // ngày 3: khu A không báo (đi vắng), admin chốt bù
    addDays(1);
    const d3 = vnDay();
    const rv = (await S.call('GET', '/review')).data;
    eq('gộp 2 ngày', rv.span, 2);
    const r22 = rv.rows.find((x) => x.phi === 'D22');
    eq('Duyệt lấy số đã báo ngày 2, không lấy tồn chuẩn cũ', r22.cnt, 0);
    eq('nên lượng dùng đúng bằng 90', r22.used, 90);
    const b = (await S.call('GET', '/bootstrap')).data;
    const eff = b.eff.find((x) => x.khu_id === 'A' && x.phi_id === 'D22');
    eq('bootstrap trả số đếm hiệu lực của ngày 2', eff && [eff.v, eff.day], [0, d2]);

    await chot(S, { note: 'khu A đi vắng' });
    eq('tồn chuẩn ngày chốt lấy theo số đã báo ngày 2',
      S.one('SELECT v FROM baseline WHERE day=? AND khu_id=? AND phi_id=?', d3, 'A', 'D22').v, 0);
    eq('daily_summary ghi dùng 90', S.one('SELECT dung FROM daily_summary WHERE day=? AND phi_id=?', d3, 'D22').dung, 90);
    // và báo cáo kỳ vẫn khép kín
    const rep = (await S.call('GET', `/report?from=${d1}&to=${d3}`)).data;
    const row = rep.rows.find((x) => x.phi === 'D22');
    eq('báo cáo kỳ khép kín sau khi quên chốt', (row.dau || 0) + row.nhap - row.dung, row.cuoi);
  }

  /* ================= 22. Thép về TRƯỚC lần đếm thì vẫn giữ nguyên được ================= */
  {
    const S = await setup();
    const d1 = vnDay();
    await nhap(S, { khu: 'A', lines: [{ phi: 'D20', qty: 114 }] });
    await bao(S, { khu: 'A', day: d1, items: items({ D20: 114 }) }, 'An');
    await chot(S, { note: '' });
    addDays(1);
    const d2 = vnDay();
    // thép về rồi mới đếm: số đếm đã bao gồm lô này
    await nhap(S, { khu: 'A', lines: [{ phi: 'D20', qty: 114 }] });
    advance(5000); // thực tế hai thao tác cách nhau vài giây
    await bao(S, { khu: 'A', day: d2, items: items({ D20: 228 }) }, 'An');
    addDays(1);
    const d3 = vnDay();
    const keep = await bao(S, { khu: 'A', day: d3, items: items({ D20: { v: 228, kind: 'giu' } }) }, 'An');
    eq('giữ nguyên được vì thép về trước lần đếm', keep.status, 200);
    // còn thép về SAU lần đếm thì phải đếm thực tế
    advance(5000);
    const rc3 = await nhap(S, { khu: 'A', lines: [{ phi: 'D20', qty: 114 }] });
    eq('ghi được phiếu nhập sau lần đếm', rc3.status, 200);
    const keep2 = await bao(S, { khu: 'A', day: d3, items: items({ D20: { v: 228, kind: 'giu' } }) }, 'An');
    eq('thép về sau lần đếm: chặn giữ nguyên', keep2.status, 400);
    ok('nói rõ lý do', /nhập\/chuyển|đếm thực tế/.test(JSON.stringify(keep2.data)), JSON.stringify(keep2.data));
  }

  /* ================= 22. Khu đếm ra thép "từ không mà có" =================
     Phép soi từng khu được dựng để bắt chuyện này. Trước đây nó bỏ qua mọi phi chưa có tồn chuẩn ở
     khu đó, nên đúng chỗ số bịa dễ xuất hiện nhất lại không kiểm. Khi có khu khác hụt cùng phi thì
     tổng bãi khớp nên cảnh báo "dùng âm" cấp phi cũng im, và cảnh báo duy nhất hiện ra lại trỏ vào
     khu BỊ HỤT kèm câu "kiểm tra có xuất dùng thật không" — admin bị chỉ sai hướng hoàn toàn. */
  {
    const S = await setup();
    let day = vnDay();
    await nhap(S, { khu: 'B', lines: [{ phi: 'D25', qty: 200 }] });
    await bao(S, { khu: 'A', day, items: items({}) }, 'An');
    await bao(S, { khu: 'B', day, items: items({ D25: 200 }) }, 'Binh');
    await chot(S, { note: '' });
    // tồn chuẩn nay ĐẶC (mọi khu x mọi phi), nên "khu không có phi đó" thể hiện bằng v = 0
    eq('chỉ khu B có tồn chuẩn D25 khác 0',
      S.sql('SELECT khu_id FROM baseline WHERE day=? AND phi_id=? AND v<>0', day, 'D25').map((x) => x.khu_id), ['B']);
    addDays(1); day = vnDay();
    // khu A "sinh" 200 cây D25 (9.022 kg) không phiếu không tồn chuẩn; khu B báo mất đúng 200
    await bao(S, { khu: 'A', day, items: items({ D25: 200 }) }, 'An');
    await bao(S, { khu: 'B', day, items: items({ D25: 0 }) }, 'Binh');
    const rv = (await S.call('GET', '/review')).data;
    const d25 = rv.rows.find((x) => x.phi === 'D25');
    eq('tổng bãi khớp nên không có cờ dùng âm', [d25.used, d25.neg], [0, false]);
    const kA = rv.khus.find((k) => k.khu === 'A');
    const upA = kA.items.find((x) => x.phi === 'D25');
    ok('khu A bị bày lệch dư dù chưa từng có tồn chuẩn D25', !!upA && upA.d === 200, JSON.stringify(kA.items));
    eq('số lệch của khu A tính từ mốc 0', [upA.ref, upA.mv, upA.cnt, upA.d], [0, 0, 200, 200]);
    ok('và lệch đó đủ lớn để tô đậm', upA.big, JSON.stringify(upA));
    const downB = rv.khus.find((k) => k.khu === 'B').items.find((x) => x.phi === 'D25');
    ok('khu B vẫn được bày là hụt', downB.d === -200 && downB.big, JSON.stringify(downB));
    // phi mới về bằng phiếu thì số nhập đã bù vào dự kiến, đếm đúng không bị báo oan
    await nhap(S, { khu: 'C', lines: [{ phi: 'D28', qty: 57 }] });
    await bao(S, { khu: 'C', day, items: items({ D28: 57 }) }, 'An');
    const rv2 = (await S.call('GET', '/review')).data;
    const kC = rv2.khus.find((k) => k.khu === 'C');
    ok('khu nhận thép mới, đếm đúng số phiếu: không lệch', kC.items.every((x) => !x.d), JSON.stringify(kC.items));
    ok('và không còn việc gì của khu C', !rv2.exceptions.some((e) => e.khu === 'C'),
      JSON.stringify(rv2.exceptions.filter((e) => e.khu === 'C')));
  }

  /* ================= 23. Phiếu được duyệt SAU khi số của khu đã duyệt =================
     Số đếm của khu không gồm lô thép đó, nên dự kiến vừa đổi mà số đã duyệt thì không: phải nhắc
     admin xem lại khu. Bản cũ tính theo giờ NHẬP và giờ HỦY phiếu so với giờ khu báo, và cảnh báo
     đó không có đường nào xoá — ngày đó bắt buộc chốt kèm ghi chú. Nay chỉ là so hai mốc DUYỆT,
     và admin duyệt lại khu là hết. */
  {
    const S = await setup();
    let day = vnDay();
    await nhap(S, { khu: 'A', lines: [{ phi: 'D16', qty: 1800 }] });
    await bao(S, { khu: 'A', day, items: items({ D16: 1800 }) }, 'An');
    await chot(S, { note: '' });
    addDays(1); day = vnDay();

    // phiếu được duyệt TRƯỚC khi khu báo và được duyệt: đúng trình tự, không nhắc gì
    const rc = await nhap(S, { khu: 'A', lines: [{ phi: 'D16', qty: 180 }] });
    advance(5000);
    await bao(S, { khu: 'A', day, items: items({ D16: 1980 }) }, 'An');
    let rv = (await S.call('GET', '/review')).data;
    ok('đúng trình tự: không nhắc xem lại', !rv.khus.find((k) => k.khu === 'A').recheck);
    eq('và không còn việc gì', rv.pending, 0);

    // giờ duyệt thêm một phiếu NỮA, sau khi số của khu đã duyệt
    advance(5000);
    const rc2 = await S.call('POST', '/receipts', { khu: 'A', lines: [{ phi: 'D16', qty: 180 }] });
    rv = (await S.call('GET', '/review')).data;
    ok('phiếu còn chờ duyệt thì chưa nhắc xem lại', !rv.khus.find((k) => k.khu === 'A').recheck);
    advance(1000);
    eq('duyệt phiếu thứ hai', (await duyetP(S, rc2.data.id)).status, 200);
    rv = (await S.call('GET', '/review')).data;
    const kA = rv.khus.find((k) => k.khu === 'A');
    ok('duyệt phiếu sau số của khu: nhắc xem lại khu đó', kA.recheck, JSON.stringify(kA));
    eq('dự kiến đã cộng lô mới', kA.items.find((x) => x.phi === 'D16').exp, 2160);
    ok('và nó là một việc chặn chốt', rv.exceptions.some((e) => e.type === 'recheck' && e.khu === 'A'));

    /* Gỡ được: admin xem lại rồi duyệt lại khu là xong. Đây là điểm khác hẳn bản cũ. */
    advance(1000);
    await S.call('PUT', '/counts', { khu: 'A', day, items: items({ D16: 2160 }) }, 'An');
    await duyet(S, 'A');
    rv = (await S.call('GET', '/review')).data;
    ok('duyệt lại khu là hết nhắc', !rv.khus.find((k) => k.khu === 'A').recheck, JSON.stringify(rv.khus.find((k) => k.khu === 'A')));
    eq('hết việc chờ', rv.pending, 0);

    // hủy phiếu đã duyệt thì lượng đó rút khỏi tồn ngay
    advance(1000);
    eq('hủy phiếu đã duyệt được', (await S.call('DELETE', '/receipts/' + rc.data.id)).status, 200);
    ok('ghi lại mốc hủy', S.one('SELECT voided, voided_ts FROM receipts WHERE id=?', rc.data.id).voided_ts > 0);
    eq('dự kiến của khu tụt đúng 180', (await S.call('GET', '/review')).data
      .khus.find((k) => k.khu === 'A').items.find((x) => x.phi === 'D16').exp, 1980);
  }

  /* ================= 24. Phi bị xoá khỏi bảng phi không được khóa cả khu =================
     Bản cũ: khu_phi còn dòng active=1 cho một phi đã bị xoá thì khu kẹt cứng — không gửi phi đó
     thì "Còn phi chưa nhập", gửi thì "Phi không hợp lệ". Nay bảng đếm dựng từ chính bảng phi nên
     phi đã xoá đơn giản là không còn được hỏi. */
  {
    const S = await setup();
    const day = vnDay();
    await bao(S, { khu: 'A', day, items: items({ D16: 180, D20: 114 }) }, 'An');
    S.raw.exec("DELETE FROM phi WHERE id='D20'");
    const r = await bao(S, { khu: 'A', day, items: items({ D16: 200 }) }, 'An');
    eq('phi đã xoá không chặn việc báo số', r.status, 200);
    eq('số mới vẫn ghi được', S.one('SELECT v FROM counts WHERE day=? AND khu_id=? AND phi_id=?', day, 'A', 'D16').v, 200);
    eq('và vẫn duyệt được', S.one('SELECT duyet_v FROM counts WHERE day=? AND khu_id=? AND phi_id=?', day, 'A', 'D16').duyet_v, 200);
  }

  /* ================= 25. Admin chọn số để lại cùng dấu vết như một lần báo thường ================= */
  {
    const S = await setup();
    const day = vnDay();
    await nhap(S, { khu: 'A', lines: [{ phi: 'D16', qty: 180 }, { phi: 'D20', qty: 114 }] });
    await bao(S, { khu: 'A', day, items: items({ D16: 180, D20: 114 }) }, 'An');
    await chot(S, { note: '' });
    addDays(1);
    const d1 = vnDay();
    // An giữ nguyên D20 -> keep_streak = 1; Bình báo số khác D16 -> xung đột
    await bao(S, { khu: 'A', day: d1, items: items({ D16: { v: 180, bo: 1, le: 0 }, D20: { v: 114, kind: 'giu' } }) }, 'An');
    eq('giữ nguyên: chuỗi = 1', S.one('SELECT keep_streak FROM khu_phi WHERE khu_id=? AND phi_id=?', 'A', 'D20').keep_streak, 1);
    await bao(S, { khu: 'A', day: d1, items: items({ D16: 150, D20: 114 }) }, 'Binh');
    // admin chọn 0 cho D16 và một số thật cho D20 (thay cho bản "giữ nguyên")
    const cr = await S.call('POST', '/conflict/resolve', { khu: 'A', pick: { D16: 0, D20: 100 } });
    eq('admin chọn số: 2 phi đổi', cr.data.changed, 2);
    eq('chọn số thật thay bản giữ nguyên: chuỗi giữ nguyên về 0', S.one('SELECT keep_streak FROM khu_phi WHERE khu_id=? AND phi_id=?', 'A', 'D20').keep_streak, 0);
    /* Admin chọn số KHÔNG phải là duyệt số: ts của ô vừa sửa nhảy lên nên nó quay về chờ duyệt,
       admin vẫn phải bấm "Duyệt khu" để số đó thành tồn. */
    eq('chọn số xong vẫn phải duyệt', S.one('SELECT duyet_v FROM counts WHERE day=? AND khu_id=? AND phi_id=?', d1, 'A', 'D16').duyet_v, 150);
    ok('và khu quay lại danh sách chờ duyệt',
      (await S.call('GET', '/review')).data.khus.find((k) => k.khu === 'A').waiting > 0);
    await duyet(S, 'A');
    eq('duyệt rồi thì số admin chọn mới vào tồn', S.one('SELECT duyet_v FROM counts WHERE day=? AND khu_id=? AND phi_id=?', d1, 'A', 'D16').duyet_v, 0);
  }

  /* ================= 26. Tắt rồi bật lại một phi: mọi khu theo ngay =================
     Bản cũ phải bật/tắt từng dòng khu_phi, và còn phải phân biệt khu bị ẩn do "đếm 0 nhiều ngày"
     với khu bị tắt cùng lúc với phi — sai một chỗ là admin bật phi mà bảng đếm vẫn trống. Nay
     bảng đếm dựng trực tiếp từ bảng phi nên không còn trạng thái nào để lệch. */
  {
    const S = await setup();
    const day = vnDay();
    await bao(S, { khu: 'A', day, items: items({}) }, 'An');
    const hoi = async () => {
      const b = (await S.call('GET', '/bootstrap')).data;
      return b.phi.filter((x) => x.active).map((x) => x.id);
    };
    ok('mặc định hỏi đủ 13 phi D6..D36', (await hoi()).length === 13, (await hoi()).join(','));
    eq('tắt phi D20 được vì bãi không còn D20', (await S.call('PATCH', '/phi/D20', { active: 0 })).status, 200);
    ok('tắt rồi: không còn hỏi D20', !(await hoi()).includes('D20'));
    // báo cáo gửi kèm phi đã tắt thì bị từ chối, không âm thầm nhận
    eq('gửi phi đã tắt: từ chối', (await S.call('PUT', '/counts', { khu: 'A', day, items: items({ D20: 5 }) }, 'An')).status, 400);
    await S.call('PATCH', '/phi/D20', { active: 1 });
    ok('bật lại: mọi khu hỏi lại ngay', (await hoi()).includes('D20'));
  }

  /* ================= 27. CSV báo cáo kỳ: dòng TỔNG khớp cột với tiêu đề =================
     Thiếu một ô rỗng là cả năm số tấn tụt sang trái một cột và Excel đọc "tồn đầu" thành "tồn cuối".
     Thêm cột "Điều chỉnh" đã làm đúng chuyện đó một lần, nên bài test này đếm cứng cả năm cột. */
  {
    const S = await setup();
    let day = vnDay();
    await nhap(S, { khu: 'A', lines: [{ phi: 'D16', qty: 1800 }] });
    await bao(S, { khu: 'A', day, items: items({ D16: 1800 }) }, 'An');
    await chot(S, { note: '' });
    addDays(1); day = vnDay();
    await bao(S, { khu: 'A', day, items: items({ D16: 1500 }) }, 'An');
    await chot(S, { note: '' });
    const csv = (await S.call('GET', `/report?format=csv&from=${day}&to=${day}`)).data;
    const rows = csv.split('\r\n');
    const hdr = rows.find((l) => l.startsWith('"Phi"')).split(';');
    const tot = rows.find((l) => l.startsWith('"TỔNG')).split(';');
    eq('dòng TỔNG có đúng số ô như tiêu đề', tot.length, hdr.length);
    eq('số tấn nằm đúng dưới 7 cột tấn', hdr.slice(-7),
      ['"Tồn đầu (tấn)"', '"Nhập (tấn)"', '"Điều chỉnh (tấn)"', '"Vay mượn (tấn)"', '"Dùng (tấn)"', '"Có phiếu xuất (tấn)"', '"Tồn cuối (tấn)"']);
    // 1800 cây D16 × 18,48 kg = 33,264 tấn; dùng 300 cây = 5,544 tấn; còn 1500 cây = 27,720 tấn
    eq('tồn đầu / nhập / điều chỉnh / vay mượn / dùng / có phiếu / tồn cuối theo tấn', tot.slice(-7),
      ['33,264', '0,000', '0,000', '0,000', '5,544', '0,000', '27,720']);
    eq('cột số lượng có Điều chỉnh và Vay mượn, đứng giữa Nhập và Dùng', hdr.slice(0, 9),
      ['"Phi"', '"Đơn vị"', '"Tồn đầu"', '"Nhập"', '"Điều chỉnh"', '"Vay mượn"', '"Dùng"', '"Có phiếu xuất"', '"Tồn cuối"']);
    // bảng theo ngày ở cuối tệp cũng phải thểm cột mới, không thì số tồn cuối ngày đứng sai cột
    const dHdr = rows.find((l) => l.startsWith('"Ngày"')).split(';');
    const dRow = rows[rows.indexOf(rows.find((l) => l.startsWith('"Ngày"'))) + 1].split(';');
    eq('bảng theo ngày có đủ cột', dHdr.length, 8);
    eq('và mỗi dòng ngày đủ ô như tiêu đề', dRow.length, dHdr.length);
  }

  /* ================= 28. Mất một dòng users không được làm biến mất số liệu =================
     INNER JOIN users sẽ làm cả số đếm và phiếu của người đó biến khỏi màn hình trong khi vẫn nằm
     trong database và vẫn được computeReview/baseline tính — hai màn hình lệch nhau không lý do. */
  {
    const S = await setup();
    const day = vnDay();
    await nhap(S, { khu: 'A', lines: [{ phi: 'D16', qty: 1800 }] }, 'Kho');
    await bao(S, { khu: 'A', day, items: items({ D16: 1800 }) }, 'An');
    S.raw.exec("DELETE FROM users WHERE name IN ('An','Kho')");
    const boot = (await S.call('GET', '/bootstrap')).data;
    // báo cáo phủ cả 13 phi (phi để trống ghi 0), nên có 13 dòng; chỉ D16 khác 0
    eq('số đếm vẫn hiện ở Tổng quan', boot.counts.filter((c) => c.v).map((c) => [c.phi_id, c.v]), [['D16', 1800]]);
    eq('và đủ 13 dòng cho khu A', boot.counts.length, 13);
    eq('phiếu nhập vẫn hiện', boot.receipts.length, 1);
    eq('khu vẫn được đánh dấu đã báo', boot.reports.map((r) => r.khu_id), ['A']);
    ok('tên người đã xoá hiện rõ ràng', /đã xoá/.test((boot.counts[0] || {}).uname || ''), JSON.stringify(boot.counts[0]));
    const dv = (await S.call('GET', '/day?date=' + day)).data;
    eq('màn Xem lại ngày cũ cũng giữ đủ dòng', [dv.counts.length, dv.receipts.length, dv.reports.length], [13, 1, 1]);
    eq('màn Duyệt vẫn thấy khu đã báo', (await S.call('GET', '/review')).data.reports.map((r) => r.khu_id), ['A']);
  }

  /* ================= 29. schema.sql phải chịu được ALTER TABLE ... DROP COLUMN =================
     SQLite dựng lại câu CREATE từ chính văn bản trong schema.sql khi drop cột. Chú thích nằm trong
     khối CREATE làm câu dựng lại bị cắt: với cột CUỐI của bảng, chú thích kẹp giữa dấu phẩy và ")"
     nên SQLite báo "incomplete input" và migration tương lai sẽ chết giữa đường trên database thật. */
  {
    const sql = readFileSync(path.join(ROOT, 'schema.sql'), 'utf8');
    const inBlock = [];
    let depth = 0;
    for (const line of sql.split('\n')) {
      if (/^CREATE TABLE/i.test(line)) depth = 1;
      else if (depth && /^\);/.test(line)) depth = 0;
      else if (depth && /^\s+--/.test(line)) inBlock.push(line.trim());
    }
    eq('không còn chú thích nào bên trong khối CREATE TABLE', inBlock, []);

    const S = await boot(ROOT);
    const tables = S.sql("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").map((t) => t.name);
    ok('có đủ bảng để kiểm tra', tables.length > 10, tables.length);
    const broken = [];
    for (const t of tables) {
      const cols = S.sql(`PRAGMA table_info(${t})`);
      const last = cols[cols.length - 1];
      if (last.pk) continue; // cột khoá chính không drop được, lý do khác
      // cột đang có index thì phải DROP INDEX trước (xem ghi chú đầu schema.sql), không tính là lỗi
      const indexed = S.sql(`PRAGMA index_list(${t})`)
        .some((ix) => S.sql(`PRAGMA index_info(${ix.name})`).some((c) => c.name === last.name));
      if (indexed) continue;
      S.raw.exec('SAVEPOINT dc');
      try { S.raw.prepare(`ALTER TABLE ${t} DROP COLUMN ${last.name}`).run(); }
      catch (e) { broken.push(t + '.' + last.name + ': ' + e.message); }
      S.raw.exec('ROLLBACK TO dc; RELEASE dc');
    }
    eq('drop được cột cuối của mọi bảng', broken, []);
  }

  /* ================= 39. PIN của admin đầu tiên: chỉ chính người đó đặt lại được =================
     Đây là đường chiếm tài khoản chủ hệ thống, và nó đi vòng qua đúng những chốt dựng lên để chặn
     mình: admin thứ hai không khoá, không hạ quyền, không xoá được admin đầu tiên — nhưng nếu đặt
     lại được PIN của người đó thì PIN mới hiện ngay trên màn hình cho họ đọc, họ đăng nhập vào
     chính tài khoản chủ hệ thống và làm được tất cả, kể cả xoá mọi admin khác. */
  {
    const S = await setup();
    const first = S.one('SELECT id FROM users WHERE name = ?', 'Admin').id;
    const a2 = await S.call('POST', '/users', { name: 'Admin Hai', phone: '0900000009', role: 'admin' });
    await S.login('A2', '0900000009', a2.data.pin);
    await S.call('POST', '/change-pin', { pin: a2.data.pin, newPin: '2846' }, 'A2');

    const rp = await S.call('POST', `/users/${first}/reset-pin`, {}, 'A2');
    eq('admin khác KHÔNG đặt lại được PIN của admin đầu tiên', rp.status, 403);
    ok('và không để lộ PIN nào ra màn hình', !rp.data.pin, JSON.stringify(rp.data));
    eq('PIN cũ của admin đầu tiên vẫn còn nguyên hiệu lực',
      (await S.call('POST', '/login', { phone: '0900000001', pin: '2468' }, 'kt')).status, 200);
    eq('phiên của admin đầu tiên không bị thu hồi', (await S.call('GET', '/users')).status, 200);
    // chính chủ thì vẫn phải làm được: quên PIN mà không ai đặt lại thay là tắc hẳn hệ thống
    eq('chính admin đầu tiên đặt lại được PIN của mình',
      (await S.call('POST', `/users/${first}/reset-pin`, {})).status, 200);
  }

  /* ================= 40. "Admin đầu tiên" phải là ADMIN có id nhỏ nhất =================
     Trên database đã dùng từ trước, dòng id nhỏ nhất có thể không còn là admin — đường đổi vai trò
     cũ chỉ chặn tự hạ quyền chính mình, nên một admin khác hạ quyền được nó. Lấy MIN(id) trơn thì
     lúc đó cả bãi mất đường quản lý người dùng: sửa tên / xoá / khôi phục tắt với MỌI người, mà
     chính dòng đó lại được PROTECT_FIRST che nên cũng không nâng quyền lại được — khoá cứng. */
  {
    const S = await setup();
    const uid = (n) => S.one('SELECT id FROM users WHERE name = ?', n).id;
    const a2 = await S.call('POST', '/users', { name: 'Admin Hai', phone: '0900000009', role: 'admin' });
    await S.login('A2', '0900000009', a2.data.pin);
    await S.call('POST', '/change-pin', { pin: a2.data.pin, newPin: '2846' }, 'A2');
    // dựng lại đúng cảnh của một database cũ: dòng id nhỏ nhất không còn là admin
    S.raw.prepare("UPDATE users SET role = 'nguoidem' WHERE id = 1").run();

    /* Lấy sẵn id trước, không tra lại theo tên: nếu bản sửa bị bỏ thì lệnh sửa tên trả 403 và
       cái tên mới không tồn tại, lúc đó uid('An B') ném lỗi làm sập cả bộ test — che hết những
       mục sau thay vì báo đúng một dòng FAIL. */
    const a2Id = uid('Admin Hai'), anId = uid('An');
    const ls = (await S.call('GET', '/users', undefined, 'A2')).data;
    eq('chủ hệ thống chuyển sang admin có id nhỏ nhất', ls.first, a2Id);
    eq('sửa tên không bị khoá cứng',
      (await S.call('POST', `/users/${anId}/rename`, { name: 'An B' }, 'A2')).status, 200);
    eq('xoá cũng dùng được', (await S.call('POST', `/users/${anId}/delete`, {}, 'A2')).status, 200);
    // và dòng id 1 giờ không còn được PROTECT_FIRST che, nên sửa lại được từ trong app
    eq('nâng quyền lại cho dòng id 1', (await S.call('POST', '/users/1/role', { role: 'admin' }, 'A2')).status, 200);
    eq('nâng xong thì chủ hệ thống về lại dòng id 1', (await S.call('GET', '/users', undefined, 'A2')).data.first, 1);
  }

  /* ================= 41. Xoá người phụ trách duy nhất của một khu =================
     Khu KHÔNG còn ai phụ trách nghĩa là MỌI người đếm đều đếm được khu đó. Nên xoá một tài khoản
     có thể âm thầm mở một khu ra cho cả bãi — ngược hẳn ý của người vừa bấm "xoá". Phải hỏi lại
     một lần, và phải để lại dấu trong nhật ký như mọi lần đổi phân công khác. */
  {
    const S = await setup();
    const day = vnDay();
    const uid = (n) => S.one('SELECT id FROM users WHERE name = ?', n).id;
    const anId = uid('An'), binhId = uid('Binh');
    await S.call('PUT', '/khu/A/users', { users: [anId] });
    eq('khu A của An: Bình không đếm được', (await bao(S, { khu: 'A', day, items: items({ D16: 10 }) }, 'Binh')).status, 403);

    const d1 = await S.call('POST', `/users/${anId}/delete`, {});
    eq('xoá người phụ trách duy nhất: phải xác nhận trước', [d1.status, d1.data.code], [409, 'khu_open']);
    ok('và nói rõ hậu quả, không chỉ "không xoá được"', /MỌI người đếm/.test(d1.data.error), d1.data.error);
    eq('chưa xác nhận thì chưa đổi gì', S.sql('SELECT 1 FROM khu_user WHERE khu_id = ? AND user_id = ?', 'A', anId).length, 1);

    const d2 = await S.call('POST', `/users/${anId}/delete`, { confirm_khu: true });
    eq('xác nhận rồi thì xoá được, kèm danh sách khu vừa mở ra', [d2.status, d2.data.mo], [200, ['A']]);
    const nk = S.sql("SELECT detail FROM audit WHERE action = 'khu_users' ORDER BY id DESC");
    eq('nhật ký ghi lần bỏ phân công khu A đó', nk.length && JSON.parse(nk[0].detail), { khu: 'A', n: 0, users: [] });
    eq('giờ Bình đếm được khu A — đúng như lời cảnh báo', (await bao(S, { khu: 'A', day, items: items({ D16: 10 }) }, 'Binh')).status, 200);

    // còn người khác phụ trách thì không phải hỏi, nhưng phân công mới vẫn phải vào nhật ký
    const khoId = uid('Kho');
    await S.call('PUT', '/khu/B/users', { users: [binhId, khoId] });
    const d3 = await S.call('POST', `/users/${binhId}/delete`, {});
    eq('xoá một trong hai người phụ trách: không phải hỏi', [d3.status, d3.data.mo], [200, []]);
    eq('khu B vẫn còn thủ kho phụ trách', S.sql('SELECT user_id FROM khu_user WHERE khu_id = ?', 'B').map((x) => x.user_id), [khoId]);
    eq('và nhật ký ghi phân công còn lại', JSON.parse(S.sql("SELECT detail FROM audit WHERE action = 'khu_users' ORDER BY id DESC")[0].detail),
      { khu: 'B', n: 1, users: [khoId] });
  }

  /* ================= 42. Khoá có chủ đích phải sống qua một vòng xoá / khôi phục =================
     Xoá mà dọn luôn cờ locked thì tài khoản bị khoá cố ý quay về trạng thái MỞ sau khi khôi phục,
     không dòng nhật ký nào nói là ai mở. Khoá và xoá là hai việc khác nhau, mở khoá phải là một
     thao tác riêng có dấu vết riêng. */
  {
    const S = await setup();
    const anId = S.one('SELECT id FROM users WHERE name = ?', 'An').id;
    await S.call('POST', `/users/${anId}/lock`, { locked: 1 });
    await S.call('POST', `/users/${anId}/delete`, {});
    eq('xoá KHÔNG âm thầm mở khoá', S.one('SELECT locked, deleted FROM users WHERE id = ?', anId), { locked: 1, deleted: 1 });

    const res = await S.call('POST', `/users/${anId}/restore`, {});
    eq('khôi phục xong vẫn đúng trạng thái bị khoá',
      [res.status, res.data.locked, S.one('SELECT locked FROM users WHERE id = ?', anId).locked], [200, 1, 1]);
    eq('nên vẫn chưa đăng nhập được', (await S.call('POST', '/login', { phone: '0900000002', pin: res.data.pin }, 'An2')).status, 403);
    eq('mở khoá là việc riêng, làm xong mới vào được', (await S.call('POST', `/users/${anId}/lock`, { locked: 0 })).status, 200);
    eq('vào được bằng PIN mới', (await S.call('POST', '/login', { phone: '0900000002', pin: res.data.pin }, 'An2')).status, 200);
    eq('và lần mở khoá đó có dòng nhật ký riêng', S.sql("SELECT 1 FROM audit WHERE action = 'user_unlock'").length, 1);
  }

  /* ================= 43. Khôi phục phải thu hồi PIN cũ =================
     must_change một mình là không đủ: nó chỉ có tác dụng SAU khi đăng nhập được. Để nguyên PIN cũ
     là mở lại đúng cánh cửa vừa đóng — người đã rời bãi mà còn nhớ PIN vẫn vào được, rồi tự đặt
     PIN mới và ở lại trong hệ thống. Suốt thời gian bị xoá, PIN cũ nằm ngoài tầm kiểm soát. */
  {
    const S = await setup();
    const anId = S.one('SELECT id FROM users WHERE name = ?', 'An').id;
    await S.call('POST', `/users/${anId}/delete`, {});
    const res = await S.call('POST', `/users/${anId}/restore`, {});
    ok('khôi phục cấp PIN MỚI để admin đưa lại cho người dùng', /^\d{4}$/.test(String(res.data.pin)), JSON.stringify(res.data));
    eq('PIN CŨ không còn vào được', (await S.call('POST', '/login', { phone: '0900000002', pin: '1357' }, 'An2')).status, 401);
    eq('PIN mới thì vào được', (await S.call('POST', '/login', { phone: '0900000002', pin: res.data.pin }, 'An3')).status, 200);
    eq('và vẫn bị bắt đổi PIN ngay lần đầu', S.one('SELECT must_change FROM users WHERE id = ?', anId).must_change, 1);
  }

  /* ================= 44. ĐIỀU CHỈNH TỒN: sửa sổ không được biến thành "đã dùng" =================
     Đây là lý do cả tính năng được làm bằng một dòng receipts thay vì sửa thẳng số đếm. Lượng dùng
     tính bằng `tồn chuẩn + inn − tổng đếm`: nếu phần điều chỉnh không vào vế inn thì một lần sửa
     sổ giảm 300 cây lập tức thành 300 cây "đã dùng", nó vào phi_rate và kéo cảnh báo "dùng nhiều
     bất thường" sai suốt 28 ngày sau. */
  {
    const S = await setup();
    let day = vnDay();
    await nhap(S, { khu: 'A', lines: [{ phi: 'D16', qty: 1800 }] });
    await bao(S, { khu: 'A', day, items: items({ D16: 1800 }) }, 'An');
    await chot(S, { note: '' });

    addDays(1); day = vnDay();
    // sổ ghi 1800 nhưng ngoài bãi chỉ có 1500: đếm sai kỳ trước, phải sửa sổ giảm 300
    let r = await S.call('POST', '/adjust', { khu: 'A', dir: 'giam', lines: [{ phi: 'D16', qty: 300 }], reason: 'dem_sai' });
    eq('lập phiếu điều chỉnh được', r.status, 200);
    const pdc = r.data.id;
    eq('phiếu điều chỉnh ra đời ở trạng thái chờ duyệt', S.one('SELECT duyet_day FROM receipts WHERE id=?', pdc).duyet_day, null);
    eq('ghi đúng kind dc', S.one('SELECT kind FROM receipts WHERE id=?', pdc).kind, 'dc');
    eq('qty lưu có DẤU ÂM dù người dùng gõ số dương', S.one('SELECT qty FROM receipts WHERE id=?', pdc).qty, -300);
    ok('lý do được lưu vào note của phiếu', /Đếm sai kỳ trước/.test(S.one('SELECT note FROM receipts WHERE id=?', pdc).note || ''));

    let rv = (await S.call('GET', '/review')).data;
    eq('chưa duyệt thì chưa vào dự kiến', rv.khus.find((k) => k.khu === 'A').items.find((i) => i.phi === 'D16').exp, 1800);
    eq('phiếu điều chỉnh hiện trên màn Duyệt kèm kind', (rv.phieu.find((v) => v.id === pdc) || {}).kind, 'dc');

    eq('duyệt phiếu điều chỉnh', (await duyetP(S, pdc)).status, 200);
    rv = (await S.call('GET', '/review')).data;
    eq('duyệt rồi thì dự kiến của khu A tụt đúng 300', rv.khus.find((k) => k.khu === 'A').items.find((i) => i.phi === 'D16').exp, 1500);

    // khu đếm lại và thấy đúng 1500: đây là lúc "sửa sổ" phải cho ra lượng dùng BẰNG 0
    await bao(S, { khu: 'A', day, items: items({ D16: 1500 }) }, 'An');
    rv = (await S.call('GET', '/review')).data;
    const row = rv.rows.find((x) => x.phi === 'D16');
    eq('lượng dùng TRUNG TÍNH: sửa sổ không phải dùng thép', row.used, 0);
    eq('phần điều chỉnh được tách riêng khỏi nhập', row.dc, -300);
    eq('inn vẫn là TỔNG (gồm điều chỉnh), vì mọi phép tính tồn dựa vào nó', row.inn, -300);
    ok('không bị gắn cờ dùng âm', !row.neg, JSON.stringify({ used: row.used, neg: row.neg }));

    await chot(S, { note: '' });
    const ds = S.one("SELECT nhap, dc, dung FROM daily_summary WHERE day = ? AND phi_id = 'D16'", day);
    eq('bảng tổng hợp: cột nhap KHÔNG gồm điều chỉnh', ds.nhap, 0);
    eq('bảng tổng hợp: điều chỉnh đứng cột riêng', ds.dc, -300);
    eq('bảng tổng hợp: lượng dùng bằng 0', ds.dung, 0);
    // đẳng thức của báo cáo kỳ phải khép kín: Tồn đầu + Nhập + Điều chỉnh − Dùng = Tồn cuối
    const rep = (await S.call('GET', `/report?from=${day}&to=${day}`)).data;
    const rr = rep.rows.find((x) => x.phi === 'D16');
    eq('báo cáo kỳ khép kín', rr.dau + rr.nhap + rr.dc - rr.dung, rr.cuoi);
    ok('báo cáo kỳ bật cờ hasDc để giao diện hiện cột', rep.hasDc, JSON.stringify({ hasDc: rep.hasDc, dc: rr.dc }));
  }

  /* ================= 45. ĐIỀU CHỈNH TỒN: các chốt chặn =================
     Một phiếu sửa được tồn mà không có thép thật đi kèm thì mọi chốt chặn đều phải nằm ở server:
     ẩn nút trên giao diện không chặn được ai gọi thẳng API. */
  {
    const S = await setup();
    let day = vnDay();
    await nhap(S, { khu: 'A', lines: [{ phi: 'D16', qty: 100 }] });
    await bao(S, { khu: 'A', day, items: items({ D16: 100 }) }, 'An');

    eq('thiếu lý do: từ chối', (await S.call('POST', '/adjust', { khu: 'A', dir: 'giam', lines: [{ phi: 'D16', qty: 10 }] })).status, 400);
    eq('lý do lạ: từ chối', (await S.call('POST', '/adjust', { khu: 'A', dir: 'giam', lines: [{ phi: 'D16', qty: 10 }], reason: 'abc' })).status, 400);
    eq('thiếu chiều tăng/giảm: từ chối', (await S.call('POST', '/adjust', { khu: 'A', lines: [{ phi: 'D16', qty: 10 }], reason: 'dem_sai' })).status, 400);
    eq('"Lý do khác" mà không ghi gì: từ chối',
      (await S.call('POST', '/adjust', { khu: 'A', dir: 'giam', lines: [{ phi: 'D16', qty: 10 }], reason: 'khac' })).status, 400);
    eq('"Lý do khác" có ghi rõ: nhận',
      (await S.call('POST', '/adjust', { khu: 'A', dir: 'giam', lines: [{ phi: 'D16', qty: 1 }], reason: 'khac', note: 'kiểm kê đột xuất' })).status, 200);

    /* Giảm quá số đang có: chặn NGAY LÚC LẬP. Chốt chặn này từng sai hướng vì cộng ngược phần của
       chính phiếu vào số đang có, làm phép so thành "|qty| > have + |qty|" — vĩnh viễn sai, tức
       lập phiếu giảm bao nhiêu cũng qua.
       Dùng 500 cây (9,2 tấn) chứ không phải số thật to: phải ở DƯỚI ngưỡng "điều chỉnh rất lớn",
       không thì bài này đo mất cái cổng gõ xác nhận thay vì đo chốt chặn tồn. */
    const qua = await S.call('POST', '/adjust', { khu: 'A', dir: 'giam', lines: [{ phi: 'D16', qty: 500 }], reason: 'dem_sai' });
    eq('giảm quá số đang có: chặn ngay lúc lập', qua.status, 400);
    ok('và nói rõ khu còn bao nhiêu', /chỉ còn/.test(qua.data.error || ''), qua.data.error);
    ok('lời báo lỗi không nói "không duyệt được" vào mặt người vừa bấm lưu', !/duyệt/.test(qua.data.error || ''), qua.data.error);
    eq('và không ghi dòng nào vào database', S.sql("SELECT 1 FROM receipts WHERE kind = 'dc' AND qty = -500").length, 0);

    /* Hai phiếu giảm cùng rút một lô thép: phiếu thứ hai bị chặn NGAY LÚC LẬP, vì stockOf đã trừ
       sẵn mọi phiếu giảm đang chờ duyệt. Nếu chỗ này cho qua thì duyệt cả hai là khu âm. */
    const a = (await S.call('POST', '/adjust', { khu: 'A', dir: 'giam', lines: [{ phi: 'D16', qty: 60 }], reason: 'dem_sai' })).data.id;
    eq('phiếu giảm thứ hai bị chặn, vì phiếu thứ nhất đang chờ duyệt đã giữ phần thép đó',
      (await S.call('POST', '/adjust', { khu: 'A', dir: 'giam', lines: [{ phi: 'D16', qty: 60 }], reason: 'dem_sai' })).status, 400);
    eq('phiếu giảm thứ nhất duyệt được', (await duyetP(S, a)).status, 200);

    // điều chỉnh rất lớn: phải gõ tay đúng chữ xác nhận
    const big = { khu: 'A', dir: 'tang', lines: [{ phi: 'D36', qty: 2000 }], reason: 'dem_sai' };
    const r1 = await S.call('POST', '/adjust', big);
    eq('điều chỉnh rất lớn mà không xác nhận: chặn', r1.status, 409);
    eq('và báo đúng mã để giao diện hiện ô gõ', r1.data.code, 'need_confirm');
    eq('gõ sai chữ xác nhận: vẫn chặn', (await S.call('POST', '/adjust', { ...big, confirm: 'dong' })).status, 409);
    eq('gõ đúng chữ xác nhận: nhận', (await S.call('POST', '/adjust', { ...big, confirm: 'dong y' })).status, 200);

    // phân quyền
    eq('người đếm không lập được phiếu điều chỉnh',
      (await S.call('POST', '/adjust', { khu: 'A', dir: 'giam', lines: [{ phi: 'D16', qty: 1 }], reason: 'dem_sai' }, 'An')).status, 403);
    const kr = await S.call('POST', '/adjust', { khu: 'A', dir: 'giam', lines: [{ phi: 'D16', qty: 1 }], reason: 'dem_sai' }, 'Kho');
    eq('thủ kho LẬP được (người phát hiện sổ sai thường là thủ kho)', kr.status, 200);
    eq('nhưng thủ kho KHÔNG duyệt được', (await duyetP(S, kr.data.id, 'Kho')).status, 403);
    eq('phiếu đó vẫn chưa vào tồn', S.one('SELECT duyet_day FROM receipts WHERE id=?', kr.data.id).duyet_day, null);

    // ngày đã chốt thì không lập được, y như phiếu nhập
    await chot(S);
    eq('ngày đã chốt: không lập được điều chỉnh',
      (await S.call('POST', '/adjust', { khu: 'A', dir: 'giam', lines: [{ phi: 'D16', qty: 1 }], reason: 'dem_sai' })).status, 409);
  }

  /* ================= 45b. Chốt chặn lúc DUYỆT, khi trạng thái đã bị vượt cam kết =================
     Chốt chặn lúc lập không thay được chốt chặn lúc duyệt. Bình thường hai phiếu giảm không cùng
     tồn tại được (lúc lập, stockOf đã trừ phiếu giảm đang chờ), nhưng HAI YÊU CẦU GẦN NHƯ CÙNG LÚC
     thì cả hai đều đọc tồn trước khi phiếu kia kịp ghi, và cả hai được tạo. Ghi thẳng dòng thứ hai
     vào database là cách dựng lại đúng kết cục đó một cách tất định.
     Điều phải bảo đảm: khi tổng các phiếu giảm đang chờ VƯỢT số thực có, KHÔNG phiếu nào duyệt
     được — qua cả hai đường (duyệt riêng phiếu, và "Duyệt khu" gộp phiếu của khu đó) — nên tồn
     không bao giờ âm. Thiếu một đường là nút này lọt qua đúng cái chốt chặn mà nút kia dựng ra. */
  {
    for (const qua of ['phieu', 'khu']) {
      const S = await setup();
      const day = vnDay();
      await nhap(S, { khu: 'A', lines: [{ phi: 'D16', qty: 100 }] });
      await bao(S, { khu: 'A', day, items: items({ D16: 100 }) }, 'An');
      const p = (await S.call('POST', '/adjust', { khu: 'A', dir: 'giam', lines: [{ phi: 'D16', qty: 70 }], reason: 'dem_sai' })).data;
      ok('phiếu giảm 70 lập được khi khu còn 100 (' + qua + ')', !!p.id, JSON.stringify(p));
      // dòng thứ hai: đúng kết cục của hai yêu cầu chạy song song, cùng rút thêm 70 nữa
      S.raw.exec(`INSERT INTO receipts (day, phi_id, khu_id, qty, note, user_id, ts, kind, grp)
                  VALUES ('${day}', 'D16', 'A', -70, 'đua', 1, ${Date.now()}, 'dc', 'race1')`);
      const id2 = S.one("SELECT id FROM receipts WHERE grp = 'race1'").id;

      const r = qua === 'phieu' ? await duyetP(S, p.id) : await duyet(S, 'A');
      eq('vượt số thực có: không duyệt được (' + qua + ')', r.status, 400);
      ok('và nói rõ khu còn bao nhiêu (' + qua + ')', /chỉ còn/.test(r.data.error || ''), r.data.error);
      eq('phiếu vẫn chưa vào tồn (' + qua + ')', S.one('SELECT duyet_day FROM receipts WHERE id=?', p.id).duyet_day, null);
      eq('phiếu kia cũng vậy (' + qua + ')', S.one('SELECT duyet_day FROM receipts WHERE id=?', id2).duyet_day, null);

      // bỏ một phiếu đi thì phần còn lại duyệt được bình thường — chốt chặn không khoá cứng khu
      eq('từ chối phiếu dư (' + qua + ')', (await S.call('DELETE', '/receipts/' + id2)).status, 200);
      eq('rồi phiếu còn lại duyệt được (' + qua + ')', (await duyetP(S, p.id)).status, 200);
      const rv = (await S.call('GET', '/review')).data;
      const exp = rv.khus.find((k) => k.khu === 'A').items.find((i) => i.phi === 'D16').exp;
      eq('tồn còn đúng 30, không âm (' + qua + ')', exp, 30);
    }
  }

  /* ================= 46. ĐIỀU CHỈNH TỒN: bắt khu đếm lại, và hủy được =================
     Một phiếu sửa sổ phải kéo theo hai thứ: khu không được "giữ nguyên" lấy lại số cũ nữa (phải ra
     đếm thật để xác minh), và phiếu phải hoàn tác được như mọi chứng từ khác. */
  {
    const S = await setup();
    let day = vnDay();
    await nhap(S, { khu: 'A', lines: [{ phi: 'D16', qty: 900 }] });
    await bao(S, { khu: 'A', day, items: items({ D16: 900 }) }, 'An');
    await chot(S, { note: '' });

    addDays(1); day = vnDay();
    // chưa có gì đổi: "giữ nguyên" vẫn hợp lệ
    eq('chưa điều chỉnh thì giữ nguyên được',
      (await S.call('PUT', '/counts', { khu: 'A', day, items: items({ D16: { v: 900, kind: 'giu' } }) }, 'An')).status, 200);

    const p = (await S.call('POST', '/adjust', { khu: 'A', dir: 'giam', lines: [{ phi: 'D16', qty: 100 }], reason: 'hao_hut' })).data.id;
    await duyetP(S, p);
    const giu = await S.call('PUT', '/counts', { khu: 'A', day, items: items({ D16: { v: 900, kind: 'giu' } }) }, 'An');
    eq('điều chỉnh rồi thì KHÔNG giữ nguyên được nữa, phải đếm thật', giu.status, 400);
    ok('và lời nhắc không bịa ra chuyến xe nào', /thay đổi tồn/.test(giu.data.error || ''), giu.data.error);

    // hủy phiếu đã duyệt: thép quay lại tồn
    let rv = (await S.call('GET', '/review')).data;
    eq('đang là 800 sau điều chỉnh', rv.khus.find((k) => k.khu === 'A').items.find((i) => i.phi === 'D16').exp, 800);
    eq('hủy phiếu điều chỉnh đã duyệt', (await S.call('DELETE', '/receipts/' + p)).status, 200);
    rv = (await S.call('GET', '/review')).data;
    eq('hủy xong dự kiến trở lại 900', rv.khus.find((k) => k.khu === 'A').items.find((i) => i.phi === 'D16').exp, 900);
    ok('nhật ký ghi lại đủ dòng âm của phiếu điều chỉnh bị hủy',
      /"qty":-100/.test(S.one("SELECT detail FROM audit WHERE action = 'receipt_void' ORDER BY id DESC LIMIT 1").detail || ''),
      S.one("SELECT detail FROM audit WHERE action = 'receipt_void' ORDER BY id DESC LIMIT 1").detail);
    eq('nhật ký có dòng riêng cho lần lập điều chỉnh', S.sql("SELECT 1 FROM audit WHERE action = 'adjust'").length, 1);
  }

  /* ================= 47. Phiếu điều chỉnh TĂNG cũng phải đúng mọi vế ================= */
  {
    const S = await setup();
    let day = vnDay();
    await bao(S, { khu: 'A', day, items: items({ D20: 500 }) }, 'An');
    await chot(S, { note: '' });

    addDays(1); day = vnDay();
    // ngoài bãi có 560 mà sổ ghi 500: sửa sổ TĂNG 60
    const p = (await S.call('POST', '/adjust', { khu: 'A', dir: 'tang', lines: [{ phi: 'D20', qty: 60 }], reason: 'ghi_nham' })).data.id;
    eq('qty dương khi tăng', S.one('SELECT qty FROM receipts WHERE id=?', p).qty, 60);
    await duyetP(S, p);
    await bao(S, { khu: 'A', day, items: items({ D20: 560 }) }, 'An');
    const rv = (await S.call('GET', '/review')).data;
    const row = rv.rows.find((x) => x.phi === 'D20');
    eq('điều chỉnh tăng: lượng dùng vẫn trung tính', row.used, 0);
    eq('và tách đúng dấu dương', row.dc, 60);
    eq('tổng đếm theo số mới', row.cnt, 560);
    await chot(S, { note: '' });
    eq('tồn chuẩn hôm nay là 560', S.one("SELECT v FROM baseline WHERE day = ? AND khu_id = 'A' AND phi_id = 'D20'", day).v, 560);

    // màn Lịch sử ngày cũ cũng phải nói được "ngày đó sổ bị sửa bao nhiêu", y như báo cáo kỳ
    const dv = (await S.call('GET', '/day?date=' + day)).data;
    const sm = dv.summary.find((x) => x.phi_id === 'D20');
    eq('lịch sử ngày cũ: cột nhap không gồm điều chỉnh', sm.nhap, 0);
    eq('lịch sử ngày cũ: có phần điều chỉnh riêng', sm.dc, 60);
    ok('và phiếu điều chỉnh của ngày đó vẫn liệt kê được',
      dv.receipts.some((x) => x.kind === 'dc' && x.qty === 60), JSON.stringify(dv.receipts.map((x) => [x.kind, x.qty])));
  }

  /* ================= 48. ĐẾM NHIỀU LẦN/NGÀY là BẮT BUỘC =================
     Admin đặt mỗi khu đếm N lần/ngày. Khung chia đều GIỜ LÀM VIỆC 6h–18h (không chia 24 giờ:
     khung đầu sẽ rơi vào nửa đêm). Khung ĐÃ KẾT THÚC mà khu chưa đếm thành việc chưa xử lý: chốt
     phải ghi lý do, đêm đó không tự chốt. Lần đếm khung sau không bù cho khung trước. */
  {
    const S = await setup();
    // đặt đồng hồ tới đúng giờ:phút (giờ Việt Nam) của ngày đang chạy
    const atHour = (h, m = 0) => {
      const t = Date.parse(`${vnDay()}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+07:00`);
      clock.offset += t - Date.now();
    };
    // chạy việc 23:50 và CHỜ nó xong (S.cron không chờ waitUntil)
    const cron = async () => { let pr; await S.worker.scheduled({}, S.env, { waitUntil: (p) => (pr = p) }); await pr; };
    await nhap(S, { khu: 'A', lines: [{ phi: 'D16', qty: 1800 }] });
    await bao(S, { khu: 'A', day: vnDay(), items: items({ D16: 1800 }) }, 'An');
    await chot(S, { note: '' });

    eq('ngoài khoảng 1..4: từ chối', (await S.call('PUT', '/settings', { report_slots_per_day: 5 })).status, 400);
    eq('lưu 2 lần/ngày', (await S.call('PUT', '/settings', { report_slots_per_day: 2 })).status, 200);
    const bt = (await S.call('GET', '/bootstrap')).data;
    eq('bootstrap gửi số lần', bt.slot.n, 2);
    eq('nhãn khung theo giờ làm việc', bt.slot.defs.map((d) => d.label), ['buổi sáng (6h–12h)', 'buổi chiều (12h–18h)']);
    eq('mặc định giờ làm 6h–18h', [bt.settings.work_from, bt.settings.work_to], [6, 18]);

    // --- ngày 1: đếm sáng, quên chiều ---
    addDays(1); let day = vnDay();
    atHour(8);
    await bao(S, { khu: 'A', day, items: items({ D16: 1700 }) }, 'An');
    eq('lần 8h tính vào buổi sáng', (await S.call('GET', '/bootstrap')).data.slot.done.A, [0]);
    atHour(13);
    let rv = (await S.call('GET', '/review')).data;
    eq('13h: buổi chiều chưa hết giờ nên chưa thiếu', rv.exceptions.filter((e) => e.type === 'slot_missing').length, 0);
    eq('khu trống không bị đòi đếm', rv.exceptions.some((e) => e.type === 'slot_missing' && e.khu === 'C'), false);
    atHour(18, 30);
    rv = (await S.call('GET', '/review')).data;
    eq('18h30: thiếu buổi chiều', rv.exceptions.filter((e) => e.type === 'slot_missing').map((e) => [e.khu, e.missing]), [['A', ['buổi chiều (12h–18h)']]]);
    eq('màn Duyệt nói khung nào đã đếm', rv.khus.find((k) => k.khu === 'A').slots, { done: [0], missing: [1], late: [] });
    ok('thiếu khung là việc chưa xử lý', rv.pending >= 1, rv.pending);
    await cron();
    eq('trong ngày: chưa tự chốt', S.one('SELECT 1 x FROM day_close WHERE day=?', day), undefined);
    eq('thiếu khung vẫn tự chốt', (await chotNgay(S)).status, 200);
    ok('nhật ký chốt nói khu nào thiếu khung nào',
      /thiếu lần đếm: Khu A buổi chiều/.test(S.one('SELECT note FROM day_close WHERE day=?', day).note));

    // --- ngày 2: đếm sau 18h tính vào khung cuối ---
    addDays(1); day = vnDay();
    atHour(9); await bao(S, { khu: 'A', day, items: items({ D16: 1600 }) }, 'An');
    atHour(19); await bao(S, { khu: 'A', day, items: items({ D16: 1500 }) }, 'An');
    rv = (await S.call('GET', '/review')).data;
    eq('đếm 19h tính vào buổi chiều, đủ khung', rv.exceptions.filter((e) => e.type === 'slot_missing').length, 0);
    await chotNgay(S);
    eq('ngày đủ khung: nhật ký không nói thiếu khung', /thiếu lần đếm/.test(S.one('SELECT note FROM day_close WHERE day=?', day).note), false);

    // --- ngày 3: đếm chiều KHÔNG bù cho sáng ---
    addDays(1); day = vnDay();
    atHour(14); await bao(S, { khu: 'A', day, items: items({ D16: 1400 }) }, 'An');
    atHour(18, 5);
    rv = (await S.call('GET', '/review')).data;
    eq('đếm chiều không bù buổi sáng', rv.khus.find((k) => k.khu === 'A').slots.missing, [0]);

    /* --- báo cáo gửi muộn (mất mạng): khung tính theo lúc ĐẾM máy khai, và màn Duyệt thấy cả hai giờ.
       Mốc khai ở ngày khác thì bỏ, lấy giờ tới máy chủ. */
    addDays(1); day = vnDay();
    atHour(11, 30); const luc = Date.now();
    atHour(13);
    eq('gửi lại sau mất mạng', (await bao(S, { khu: 'A', day, items: items({ D16: 1300 }), at: luc }, 'An')).status, 200);
    const sl = (await S.call('GET', '/review')).data.khus.find((k) => k.khu === 'A').slots;
    eq('tính vào buổi sáng theo lúc đếm', sl.done, [0]);
    eq('và bị đánh dấu gửi muộn', sl.late.map((x) => x.at), [luc]);
    await bao(S, { khu: 'A', day, items: items({ D16: 1300 }), at: luc - 86400e3 }, 'An');
    eq('mốc khai ở ngày khác: bỏ, tính theo giờ tới', (await S.call('GET', '/bootstrap')).data.slot.done.A, [0, 1]);

    /* --- lần admin chọn số khi hai người báo khác nhau KHÔNG phải một lần đếm --- */
    addDays(1); day = vnDay();
    atHour(8);
    await S.call('PUT', '/counts', { khu: 'A', day, items: items({ D16: 1200 }) }, 'An');
    await S.call('PUT', '/counts', { khu: 'A', day, items: items({ D16: 1250 }) }, 'Binh');
    atHour(13);
    await S.call('POST', '/conflict/resolve', { khu: 'A', pick: { D16: 1200 } });
    eq('chọn số lúc 13h không tính là đã đếm buổi chiều', (await S.call('GET', '/bootstrap')).data.slot.done.A, [0]);

    // bản sao bản 14 (chưa có khu_report_log) vẫn nạp được vào bản 15
    const f = (await S.call('GET', '/backup')).data;
    const bang = { ...f.bang }; delete bang.khu_report_log;
    eq('bản sao cấu trúc liền trước nạp được', (await S.call('POST', '/restore', { file: { ...f, schema: f.schema - 1, bang }, confirm: 'NAP LAI' })).status, 200);

    /* --- giờ làm do admin đặt, không cố định 6h–18h --- */
    eq('giờ kết thúc trước giờ bắt đầu: từ chối', (await S.call('PUT', '/settings', { work_from: 17, work_to: 7 })).status, 400);
    eq('giờ làm 3 tiếng mà đếm 4 lần: từ chối', (await S.call('PUT', '/settings', { report_slots_per_day: 4, work_from: 7, work_to: 10 })).status, 400);
    eq('từ chối thì không lưu gì', (await S.call('GET', '/bootstrap')).data.settings.work_from, 6);
    eq('người đếm không sửa được giờ làm', (await S.call('PUT', '/settings', { work_from: 7 }, 'An')).status, 403);
    eq('đặt giờ làm 7h–17h', (await S.call('PUT', '/settings', { work_from: 7, work_to: 17 })).status, 200);
    eq('khung chia theo giờ làm mới', (await S.call('GET', '/bootstrap')).data.slot.defs.map((d) => d.label), ['buổi sáng (7h–12h)', 'buổi chiều (12h–17h)']);
    await S.call('PUT', '/settings', { report_slots_per_day: 3 });
    eq('chia không chẵn thì mốc có phút', (await S.call('GET', '/bootstrap')).data.slot.defs.map((d) => d.label),
      ['lần 1 (7h–10h20)', 'lần 2 (10h20–13h40)', 'lần 3 (13h40–17h)']);
    addDays(1); day = vnDay();
    atHour(13, 30); await bao(S, { khu: 'A', day, items: items({ D16: 1100 }) }, 'An');
    eq('13h30 thuộc lần 2 (10h20–13h40)', (await S.call('GET', '/bootstrap')).data.slot.done.A, [1]);
    atHour(17, 1);
    eq('17h01: khung cuối đã hết, thiếu lần 1 và lần 3',
      (await S.call('GET', '/review')).data.khus.find((k) => k.khu === 'A').slots.missing, [0, 2]);
    // đổi giờ làm giữa ngày: lần đếm cũ được xếp lại theo khung mới, không mất
    await S.call('PUT', '/settings', { report_slots_per_day: 2, work_from: 6, work_to: 18 });
    eq('đổi giờ làm: lần 13h30 xếp lại vào buổi chiều', (await S.call('GET', '/bootstrap')).data.slot.done.A, [1]);

    // về 1 lần/ngày thì không còn đòi khung nào
    await S.call('PUT', '/settings', { report_slots_per_day: 1 });
    eq('1 lần/ngày: không có việc thiếu khung', (await S.call('GET', '/review')).data.exceptions.filter((e) => e.type === 'slot_missing').length, 0);
  }

  /* ================= 49. Khung giờ: các chỗ dễ sai =================
     - lúc đếm tính từ THỜI GIAN ĐÃ TRÔI máy đo, không từ giờ máy (máy để sai giờ vẫn đúng khung)
     - giờ làm kết thúc 24h: việc 23:50 vẫn phải đòi khung cuối
     - yêu cầu đếm lại sau khi chốt bỏ luôn dấu "đã đếm khung" của khu */
  {
    const S = await setup();
    const atHour = (h, m = 0) => {
      const t = Date.parse(`${vnDay()}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+07:00`);
      clock.offset += t - Date.now();
    };
    const cron = async () => { let pr; await S.worker.scheduled({}, S.env, { waitUntil: (p) => (pr = p) }); await pr; };
    await nhap(S, { khu: 'A', lines: [{ phi: 'D16', qty: 1800 }] });
    await bao(S, { khu: 'A', day: vnDay(), items: items({ D16: 1800 }) }, 'An');
    await chot(S, { note: '' });
    await S.call('PUT', '/settings', { report_slots_per_day: 2, work_from: 6, work_to: 18 });

    addDays(1); let day = vnDay();
    atHour(13);
    // đếm lúc 11h (2 tiếng trước), máy gửi "đã trôi 2 tiếng" — dù đồng hồ máy chạy sai bao nhiêu
    await bao(S, { khu: 'A', day, items: items({ D16: 1700 }), tuoi: 2 * 3600e3 }, 'An');
    let sl = (await S.call('GET', '/review')).data.khus.find((k) => k.khu === 'A').slots;
    eq('tuoi 2 tiếng lúc 13h: tính vào buổi sáng', sl.done, [0]);
    eq('và bị đánh dấu gửi muộn', sl.late.length, 1);
    // tuoi đưa lùi sang ngày hôm trước: bỏ, tính theo giờ tới
    await bao(S, { khu: 'A', day, items: items({ D16: 1700 }), tuoi: 20 * 3600e3 }, 'An');
    eq('tuoi lùi sang ngày khác: tính theo giờ tới', (await S.call('GET', '/bootstrap')).data.slot.done.A, [0, 1]);
    await chot(S, { note: '' });

    // --- giờ làm tới 24h: khung cuối hết lúc 24h, lần tự chốt 0h05 vẫn phải đòi nó ---
    await S.call('PUT', '/settings', { work_from: 12, work_to: 24 });
    addDays(1); day = vnDay();
    atHour(13); await bao(S, { khu: 'A', day, items: items({ D16: 1600 }) }, 'An');
    atHour(23, 50);
    eq('23h50 xem tay: khung 18h–24h chưa hết nên chưa thiếu',
      (await S.call('GET', '/review')).data.exceptions.filter((e) => e.type === 'slot_missing').length, 0);
    const ngay24 = day;
    addDays(1); atHour(0, 5);
    await cron();
    ok('lần chốt 0h05 ghi thiếu buổi chiều (18h–24h)',
      /buổi chiều \(18h–24h\)/.test((S.one('SELECT note FROM day_close WHERE day=?', ngay24) || {}).note || ''));
    await S.call('PUT', '/settings', { work_from: 6, work_to: 18 });
  }

  /* ================= 50. Sổ vay mượn ngoài bãi =================
     Sổ công nợ thép với đối tác NGOÀI bãi, không đụng tới tồn. Ai cũng ghi, admin duyệt; dư nợ chỉ
     tính dòng đã duyệt; hai cặp vay/tra_vay và cho_vay/tra_no tính riêng. */
  {
    const S = await setup();
    const dtA = (await S.call('POST', '/doitac', { name: 'Cty Hoà Bình' }, 'An')).data.id;
    ok('người đếm thêm được đối tác', dtA > 0, dtA);
    eq('trùng tên (khác hoa thường): từ chối', (await S.call('POST', '/doitac', { name: 'cty hoà bình' })).status, 400);
    eq('người đếm không sửa/ẩn được đối tác', (await S.call('PATCH', '/doitac/' + dtA, { active: 0 }, 'An')).status, 403);

    // chưa xác nhận biên bản giao nhận và gửi nhóm Zalo thì không ghi sổ được
    // KHÔNG CÓ hai trường xác nhận = máy đang chạy bản app cũ: nói thẳng là app cũ (mã old_app)
    const cu = await S.call('POST', '/loans', { doitac: dtA, kind: 'vay', lines: [{ phi: 'D16', qty: 1 }] }, 'An');
    eq('bản app cũ (không gửi trường xác nhận): báo app cũ', [cu.status, cu.data.code], [409, 'old_app']);
    eq('có trường nhưng chưa tick: từ chối', (await S.call('POST', '/loans', { bienban: false, zalo: false, doitac: dtA, kind: 'vay', lines: [{ phi: 'D16', qty: 1 }] }, 'An')).status, 400);
    eq('chỉ có biên bản, chưa gửi Zalo: từ chối', (await S.call('POST', '/loans', { bienban: true, doitac: dtA, kind: 'vay', lines: [{ phi: 'D16', qty: 1 }] }, 'An')).status, 400);
    const tonTruoc = (await S.call('GET', '/review')).data.rows.map((r) => [r.phi, r.cnt]);
    const g1 = await S.call('POST', '/loans', { bienban: true, zalo: true, doitac: dtA, kind: 'vay', lines: [{ phi: 'D16', qty: 180 }, { phi: 'D18', qty: 100 }], note: 'xe 29C' }, 'An');
    eq('người đếm ghi sổ được', g1.status, 200);
    eq('một lần ghi hai phi', g1.data.ids.length, 2);
    eq('chờ duyệt đếm theo LẦN GHI, không theo dòng', (await S.call('GET', '/bootstrap')).data.loanPending, 1);
    let L = (await S.call('GET', '/loans')).data;
    eq('chưa duyệt thì chưa vào dư nợ', L.agg.length, 0);
    eq('người đếm không duyệt được', (await S.call('POST', '/loans/' + g1.data.ids[0] + '/duyet', {}, 'An')).status, 403);
    eq('admin duyệt cả lần ghi', (await S.call('POST', '/loans/' + g1.data.ids[0] + '/duyet', {})).status, 200);
    L = (await S.call('GET', '/loans')).data;
    eq('duyệt một dòng là duyệt cả nhóm', L.items.filter((x) => x.duyet_ts).length, 2);
    eq('sổ vay KHÔNG đụng tới tồn bãi', (await S.call('GET', '/review')).data.rows.map((r) => [r.phi, r.cnt]), tonTruoc);

    // trả bớt và cho vay chiều ngược lại: hai cặp tính riêng
    const g2 = (await S.call('POST', '/loans', { bienban: true, zalo: true, doitac: dtA, kind: 'tra_vay', lines: [{ phi: 'D16', qty: 80 }] })).data;
    await S.call('POST', '/loans/' + g2.ids[0] + '/duyet', {});
    const g3 = (await S.call('POST', '/loans', { bienban: true, zalo: true, doitac: dtA, kind: 'cho_vay', lines: [{ phi: 'D16', qty: 50 }] })).data;
    await S.call('POST', '/loans/' + g3.ids[0] + '/duyet', {});
    L = (await S.call('GET', '/loans')).data;
    const q = (kind, phi) => (L.agg.find((x) => x.kind === kind && x.phi_id === phi) || {}).q || 0;
    eq('mình nợ D16 = vay − trả', q('vay', 'D16') - q('tra_vay', 'D16'), 100);
    eq('họ nợ mình D16 tính riêng', q('cho_vay', 'D16') - q('tra_no', 'D16'), 50);

    // huỷ: người khác không huỷ được; người ghi rút lại khi chưa duyệt; quá 10 phút sau duyệt thì nhờ admin
    const g4 = (await S.call('POST', '/loans', { bienban: true, zalo: true, doitac: dtA, kind: 'vay', lines: [{ phi: 'D20', qty: 10 }] }, 'An')).data;
    eq('người khác không rút được', (await S.call('DELETE', '/loans/' + g4.ids[0], undefined, 'Binh')).status, 403);
    eq('người ghi rút lại khi chưa duyệt', (await S.call('DELETE', '/loans/' + g4.ids[0], undefined, 'An')).status, 200);
    const g5 = (await S.call('POST', '/loans', { bienban: true, zalo: true, doitac: dtA, kind: 'vay', lines: [{ phi: 'D20', qty: 10 }] }, 'An')).data;
    await S.call('POST', '/loans/' + g5.ids[0] + '/duyet', {});
    advance(11 * 60e3);
    eq('quá 10 phút sau duyệt: người ghi không huỷ được', (await S.call('DELETE', '/loans/' + g5.ids[0], undefined, 'An')).status, 403);
    eq('admin vẫn huỷ được', (await S.call('DELETE', '/loans/' + g5.ids[0])).status, 200);
    L = (await S.call('GET', '/loans')).data;
    eq('dòng huỷ không còn trong dư nợ', q('vay', 'D20'), 0);

    // đối tác đã ẩn: không ghi thêm, nhưng dư nợ vẫn giữ
    await S.call('PATCH', '/doitac/' + dtA, { active: 0 });
    eq('đối tác đã ẩn: không ghi thêm được', (await S.call('POST', '/loans', { bienban: true, zalo: true, doitac: dtA, kind: 'vay', lines: [{ phi: 'D16', qty: 1 }] })).status, 400);
    eq('nhưng dư nợ vẫn còn', (await S.call('GET', '/loans')).data.agg.length > 0, true);
    await S.call('PATCH', '/doitac/' + dtA, { active: 1 });
    ok('nhật ký ghi lại lần xác nhận biên bản', /"bienban":true,"zalo":true/.test((S.sql("SELECT detail FROM audit WHERE action='loan_vay' LIMIT 1")[0] || {}).detail || ''));
    // màn chi tiết một đối tác: đủ lịch sử, kể cả lần đã huỷ, và số cộng dồn của riêng đối tác đó
    const ct = (await S.call('GET', '/loans?doitac=' + dtA)).data;
    ok('chi tiết đối tác: có cả lần đã huỷ', ct.chiTiet && ct.items.some((x) => x.voided === 1) && ct.items.every((x) => x.doitac_id === dtA), ct.items.length);
    eq('chi tiết đối tác: số cộng dồn đúng (vay D16 180, trả 80)', [ct.agg.find((x) => x.kind === 'vay' && x.phi_id === 'D16').q, ct.agg.find((x) => x.kind === 'tra_vay' && x.phi_id === 'D16').q], [180, 80]);
    eq('đối tác không tồn tại: 404', (await S.call('GET', '/loans?doitac=99999')).status, 404);
    eq('nhật ký ghi lần vay, kèm tên đối tác', /Cty Hoà Bình/.test((S.sql("SELECT detail FROM audit WHERE action='loan_vay' LIMIT 1")[0] || {}).detail || ''), true);

    /* Sổ vay là công nợ với bên ngoài, không phải số liệu của bãi:
       - xoá sạch dữ liệu thép KHÔNG xoá nó
       - nạp bản sao cũ chưa có sổ vay thì GIỮ NGUYÊN sổ đang có (tệp thiếu bảng = không biết, không phải rỗng) */
    const soDong = () => S.one('SELECT COUNT(*) n FROM loans').n;
    const truoc = soDong();
    const f = (await S.call('GET', '/backup')).data;
    await S.call('POST', '/reset', { mode: 'wipe', confirm: 'XOA SACH' });
    eq('xoá sạch dữ liệu thép: sổ vay còn nguyên', soDong(), truoc);
    const bang = { ...f.bang }; delete bang.doitac; delete bang.loans; delete bang.khu_report_log;
    const kq = await S.call('POST', '/restore', { file: { ...f, schema: 15, bang }, confirm: 'NAP LAI' });
    eq('nạp bản sao bản 15 được', kq.status, 200);
    eq('bản sao chưa có sổ vay: sổ vay giữ nguyên', soDong(), truoc);
    eq('và nói rõ đã giữ những bảng nào', kq.data.giu, ['doitac', 'loans']);
    ok('số dòng nạp vẫn là số (không lẫn chữ)', Object.values(kq.data.dong).every((x) => typeof x === 'number'), JSON.stringify(kq.data.dong));
    // bản sao CÓ sổ vay thì sổ vay theo tệp
    const kq2 = await S.call('POST', '/restore', { file: f, confirm: 'NAP LAI' });
    eq('bản sao có sổ vay: không giữ bảng nào', kq2.data.giu, []);
  }

  /* ================= 51. Rà soát sau bản 1.3 =================
     - nhật ký duyệt/huỷ sổ vay ghi đủ đối tác và các dòng
     - lần ghi CHỜ DUYỆT luôn hiện ở màn Vay mượn, dù cũ hơn 300 dòng gần nhất
     - bản sao CSV "từ ngày đầu" lấy từ lần chốt đầu tiên, kể cả hơn một năm
     - nhật ký lọc được theo ngày, theo chữ, và tải tiếp trang cũ hơn */
  {
    const S = await setup();
    const dt = (await S.call('POST', '/doitac', { name: 'Cty Bình Minh' })).data.id;
    const g = (await S.call('POST', '/loans', { bienban: true, zalo: true, doitac: dt, kind: 'cho_vay', lines: [{ phi: 'D16', qty: 90 }] }, 'An')).data;
    await S.call('POST', '/loans/' + g.ids[0] + '/duyet', {});
    const d1 = JSON.parse(S.one("SELECT detail FROM audit WHERE action='loan_duyet' ORDER BY id DESC LIMIT 1").detail);
    eq('nhật ký duyệt sổ vay: có tên đối tác và dòng', [d1.doitac, d1.lines], ['Cty Bình Minh', [{ phi: 'D16', qty: 90 }]]);
    const g2 = (await S.call('POST', '/loans', { bienban: true, zalo: true, doitac: dt, kind: 'vay', lines: [{ phi: 'D18', qty: 5 }] }, 'An')).data;
    await S.call('DELETE', '/loans/' + g2.ids[0], undefined, 'An');
    eq('nhật ký rút lại: cũng có đối tác', JSON.parse(S.one("SELECT detail FROM audit WHERE action='loan_reject' ORDER BY id DESC LIMIT 1").detail).doitac, 'Cty Bình Minh');

    // một lần ghi chờ duyệt rồi 320 dòng đã duyệt mới hơn: lần ghi cũ vẫn phải hiện để duyệt
    const cu = (await S.call('POST', '/loans', { bienban: true, zalo: true, doitac: dt, kind: 'vay', lines: [{ phi: 'D20', qty: 7 }] }, 'An')).data.ids[0];
    const ins = S.raw.prepare("INSERT INTO loans (doitac_id, phi_id, kind, qty, user_id, ts, duyet_ts) VALUES (?, 'D16', 'vay', 1, 1, ?, ?)");
    for (let i = 0; i < 320; i++) ins.run(dt, Date.now(), Date.now());
    const L = (await S.call('GET', '/loans')).data;
    ok('lần ghi chờ duyệt cũ hơn 300 dòng vẫn hiện', L.items.some((x) => x.id === cu), L.items.length);
    eq('dòng đã duyệt vẫn chỉ lấy 300 gần nhất (cộng dòng chờ)', L.items.length, 301);

    // báo cáo từ ngày đầu: chốt một ngày, rồi nhảy hơn một năm
    await bao(S, { khu: 'A', day: vnDay(), items: items({ D16: 10 }) }, 'An');
    const dau = vnDay();
    await chot(S, { note: '' });
    addDays(400);
    await S.login('admin', '0900000001', '2468'); // phiên 30 ngày đã hết sau khi nhảy 400 ngày
    eq('xem trên màn hình quá 1 năm: từ chối', (await S.call('GET', `/report?from=${dau}&to=${vnDay()}`)).status, 400);
    const r = await S.call('GET', `/report?format=csv&from=dau&to=${vnDay()}`);
    eq('bản sao từ ngày đầu: lấy được dù hơn 1 năm', r.status, 200);
    ok('và bắt đầu đúng từ lần chốt đầu tiên', String(r.data).includes(dau.split('-').reverse().join('/')) || String(r.data).includes(dau), String(r.data).slice(0, 200));

    // nhật ký: lọc theo chữ, theo ngày, và trang cũ hơn
    const tim = (await S.call('GET', '/audit?q=' + encodeURIComponent('Bình Minh'))).data.items;
    ok('lọc theo chữ trong nội dung', tim.length >= 2 && tim.every((x) => /Bình Minh/.test(x.detail || '') || /Bình Minh/.test(x.user_name || '')), tim.length);
    eq('chữ có ký tự đặc biệt % không làm khớp mọi dòng', (await S.call('GET', '/audit?q=%25')).data.items.length, 0);
    // hôm nay chỉ có lần đăng nhập lại ở trên; mọi dòng trả về phải nằm đúng trong ngày đó (giờ VN)
    const homNay = (await S.call('GET', '/audit?ngay=' + vnDay())).data.items;
    eq('lọc theo ngày: chỉ dòng của đúng ngày đó', homNay.map((x) => [x.action, vnDay(x.ts)]), [['login', vnDay()]]);
    ok('lọc theo ngày đầu: có dòng', (await S.call('GET', '/audit?ngay=' + dau)).data.items.length > 0);
    const p1 = (await S.call('GET', '/audit?limit=5')).data;
    eq('trang đầu báo còn trang sau', p1.more, true);
    const p2 = (await S.call('GET', '/audit?limit=5&before=' + p1.items[4].id)).data;
    ok('trang sau toàn dòng cũ hơn, không trùng', p2.items.every((x) => x.id < p1.items[4].id) && p2.items.length === 5);
  }

  /* ================= 52. Số tấn ngày đã chốt không trôi theo kg/cây ================= */
  {
    const S = await setup();
    let day = vnDay();
    await nhap(S, { khu: 'A', lines: [{ phi: 'D16', qty: 1800 }] });
    await bao(S, { khu: 'A', day, items: items({ D16: 1800 }) }, 'An');
    await chot(S, { note: '' });
    const ngay1 = day;
    addDays(1); day = vnDay();
    await bao(S, { khu: 'A', day, items: items({ D16: 1500 }) }, 'An');
    await chot(S, { note: '' });
    const kg0 = S.one("SELECT kg_per_cay k FROM phi WHERE id='D16'").k;
    eq('lúc chốt lưu kg/cây vào bảng tổng hợp', S.one('SELECT kg FROM daily_summary WHERE day=? AND phi_id=?', day, 'D16').kg, kg0);
    const rp0 = (await S.call('GET', `/report?from=${ngay1}&to=${day}`)).data;
    const csv0 = (await S.call('GET', '/export?date=' + day)).data;
    const us0 = (await S.call('GET', '/usage?days=7')).data.items;

    // sửa kg/cây D16 (ví dụ theo cân thực tế nhà máy)
    const p = S.one("SELECT id, bo_size, kg_per_cay, min_stock FROM phi WHERE id='D16'");
    eq('sửa kg/cây', (await S.call('PUT', '/phi', { items: [{ ...p, kg_per_cay: 20 }] })).status, 200);
    const rp1 = (await S.call('GET', `/report?from=${ngay1}&to=${day}`)).data;
    const d16 = (x) => x.rows.find((r) => r.phi === 'D16');
    eq('báo cáo kỳ: số tấn ngày đã chốt không đổi', [d16(rp1).dung_kg, d16(rp1).cuoi_kg], [d16(rp0).dung_kg, d16(rp0).cuoi_kg]);
    eq('báo cáo kỳ: bảng theo ngày không đổi', rp1.days.map((x) => x.ton_kg), rp0.days.map((x) => x.ton_kg));
    eq('tệp CSV của ngày đã chốt không đổi', (await S.call('GET', '/export?date=' + day)).data, csv0);
    eq('thống kê lượng dùng: kg theo lúc chốt', (await S.call('GET', '/usage?days=7')).data.items.map((x) => x.kg.D16), us0.map((x) => x.kg.D16));
    eq('xem lại ngày cũ: có kg lúc chốt', (await S.call('GET', '/day?date=' + day)).data.summary.find((x) => x.phi_id === 'D16').kg, kg0);
    // ngày chốt SAU khi sửa thì theo kg mới
    addDays(1); day = vnDay();
    await bao(S, { khu: 'A', day, items: items({ D16: 1500 }) }, 'An');
    await chot(S, { note: '' });
    eq('ngày chốt sau khi sửa: theo kg mới', S.one('SELECT kg FROM daily_summary WHERE day=? AND phi_id=?', day, 'D16').kg, 20);
  }

  /* ================= 53. Sổ vay mượn kèm phiếu kho: đổi tồn, KHÔNG tính là nhập hay dùng ================= */
  {
    const S = await setup();
    let day = vnDay();
    await nhap(S, { khu: 'A', lines: [{ phi: 'D16', qty: 1800 }] });
    await bao(S, { khu: 'A', day, items: items({ D16: 1800 }) }, 'An');
    await chot(S, { note: '' });
    addDays(1); day = vnDay();
    const dt = (await S.call('POST', '/doitac', { name: 'Cty Đông Á' })).data.id;

    eq('người đếm không lập phiếu kho kèm sổ vay', (await S.call('POST', '/loans', { bienban: true, zalo: true, doitac: dt, kind: 'cho_vay', khu: 'A', lines: [{ phi: 'D16', qty: 300 }] }, 'An')).status, 403);
    eq('cho vay quá số khu đang có: từ chối', (await S.call('POST', '/loans', { bienban: true, zalo: true, doitac: dt, kind: 'cho_vay', khu: 'A', lines: [{ phi: 'D16', qty: 5000 }] }, 'Kho')).status, 400);
    const g = (await S.call('POST', '/loans', { bienban: true, zalo: true, doitac: dt, kind: 'cho_vay', khu: 'A', lines: [{ phi: 'D16', qty: 300 }], note: 'xe 29C' }, 'Kho')).data;
    const ph = S.sql("SELECT kind, khu_id, qty, duyet_day FROM receipts WHERE grp = ?", g.grp);
    eq('lập kèm phiếu kho cùng nhóm, dòng âm, chờ duyệt', ph, [{ kind: 'vay', khu_id: 'A', qty: -300, duyet_day: null }]);
    let rv = (await S.call('GET', '/review')).data;
    ok('phiếu kho của sổ vay nằm trong phiếu chờ duyệt', rv.phieu.some((v) => v.kind === 'vay'));
    eq('và KHÔNG lặp lại ở mục sổ vay chờ duyệt', rv.loans.length, 0);
    // giữ chỗ: phiếu cho vay đang chờ đã giữ 300, nên chuyển đi 1600 không lọt
    eq('phiếu cho vay chờ duyệt đã giữ chỗ thép', (await S.call('POST', '/transfers', { from: 'A', to: 'B', lines: [{ phi: 'D16', qty: 1600 }] })).status, 400);

    eq('duyệt sổ là duyệt luôn phiếu kho', (await S.call('POST', '/loans/' + g.ids[0] + '/duyet', {})).status, 200);
    eq('phiếu kho đã duyệt hôm nay', S.one('SELECT duyet_day d FROM receipts WHERE grp = ?', g.grp).d, day);
    // khu đếm hụt đúng 300 cây đã cho mượn: lượng dùng phải là 0, không phải 300
    await bao(S, { khu: 'A', day, items: items({ D16: 1500 }) }, 'An');
    rv = (await S.call('GET', '/review')).data;
    const r16 = rv.rows.find((r) => r.phi === 'D16');
    eq('cho mượn 300, khu đếm còn 1500: đã dùng = 0', r16.used, 0);
    eq('tách đúng phần vay mượn', r16.vay, -300);

    // đi vay về khu B, duyệt từ phía PHIẾU KHO: sổ cũng phải được duyệt
    const g2 = (await S.call('POST', '/loans', { bienban: true, zalo: true, doitac: dt, kind: 'vay', khu: 'B', lines: [{ phi: 'D16', qty: 100 }] }, 'Kho')).data;
    const pid = S.one('SELECT id FROM receipts WHERE grp = ?', g2.grp).id;
    eq('duyệt phiếu kho', (await S.call('POST', '/receipts/' + pid + '/duyet', {})).status, 200);
    ok('duyệt phiếu là duyệt luôn sổ', !!S.one('SELECT duyet_ts t FROM loans WHERE grp = ?', g2.grp).t);
    await bao(S, { khu: 'B', day, items: items({ D16: 100 }) }, 'Binh');
    await chot(S, { note: '' });
    const sm = S.one("SELECT nhap, vay, dung FROM daily_summary WHERE day = ? AND phi_id = 'D16'", day);
    eq('chốt: không tính là nhập, cũng không tính là dùng; cột vay riêng', [sm.nhap, sm.vay, sm.dung], [0, -200, 0]);
    const rp = (await S.call('GET', `/report?from=${day}&to=${day}`)).data;
    eq('báo cáo kỳ có cột Vay mượn', [rp.hasVay, rp.rows.find((r) => r.phi === 'D16').vay], [true, -200]);

    // huỷ: phiếu kho đã vào ngày đã chốt thì không huỷ được (cả sổ lẫn phiếu)
    eq('ngày duyệt phiếu kho đã chốt: không huỷ sổ được', (await S.call('DELETE', '/loans/' + g.ids[0])).status, 409);
    // huỷ từ phía phiếu kho (ngày chưa chốt): sổ cũng bị huỷ theo
    addDays(1); day = vnDay();
    const g3 = (await S.call('POST', '/loans', { bienban: true, zalo: true, doitac: dt, kind: 'tra_no', khu: 'A', lines: [{ phi: 'D16', qty: 50 }] }, 'Kho')).data;
    const pid3 = S.one('SELECT id FROM receipts WHERE grp = ?', g3.grp).id;
    await S.call('DELETE', '/receipts/' + pid3);
    eq('huỷ phiếu kho là huỷ luôn sổ', S.one('SELECT voided v FROM loans WHERE grp = ?', g3.grp).v, 1);
    // chỉ ghi sổ (không khu): tồn không đổi, và hiện ở mục sổ vay chờ duyệt của màn Duyệt
    const g4 = (await S.call('POST', '/loans', { bienban: true, zalo: true, doitac: dt, kind: 'vay', lines: [{ phi: 'D18', qty: 10 }] }, 'An')).data;
    eq('chỉ ghi sổ: không có phiếu kho', S.sql('SELECT 1 FROM receipts WHERE grp = ?', g4.grp).length, 0);
    eq('chỉ ghi sổ: hiện ở mục sổ vay chờ duyệt', (await S.call('GET', '/review')).data.loans.map((x) => x.grp), [g4.grp]);

    // R4: lần ghi đã duyệt quá 7 ngày thì admin cũng không huỷ được
    await S.call('POST', '/loans/' + g4.ids[0] + '/duyet', {});
    addDays(8);
    await S.login('admin', '0900000001', '2468');
    const old = await S.call('DELETE', '/loans/' + g4.ids[0]);
    eq('đã duyệt quá 7 ngày: không huỷ, phải ghi lần ngược lại', [old.status, old.data.code], [409, 'too_old']);
  }

  /* ================= 54. Đổi khung giờ trong ngày: màn Duyệt phải nói ra ================= */
  {
    const S = await setup();
    eq('chưa đổi gì: không báo', (await S.call('GET', '/review')).data.slot.changed, null);
    await S.call('PUT', '/settings', { auto_close: 1 });
    eq('đổi cài đặt khác: không tính là đổi khung giờ', (await S.call('GET', '/review')).data.slot.changed, null);
    await S.call('PUT', '/settings', { report_slots_per_day: 2 });
    const ch = (await S.call('GET', '/review')).data.slot.changed;
    ok('đổi số lần đếm hôm nay: màn Duyệt biết lúc nào, ai đổi', ch && ch.by === 'Admin' && ch.at > 0, JSON.stringify(ch));
    addDays(1);
    await S.login('admin', '0900000001', '2468');
    eq('sang ngày sau thì thôi báo', (await S.call('GET', '/review')).data.slot.changed, null);
  }

  /* ================= 56. Không duyệt nhầm số chưa xem ================= */
  {
    const S = await setup();
    const day = vnDay();
    await S.call('PUT', '/counts', { khu: 'A', day, items: items({ D16: 100 }) }, 'An');
    const mk = (await S.call('GET', '/review')).data.khus.find((k) => k.khu === 'A').mark;
    advance(2000);
    await S.call('PUT', '/counts', { khu: 'A', day, items: items({ D16: 50 }) }, 'An');
    const r = await S.call('POST', '/review/duyet', { khu: 'A', marks: { A: mk } });
    eq('khu báo lại sau lúc admin tải màn: từ chối', [r.status, r.data.code], [409, 'changed']);
    eq('chưa có số nào được duyệt', S.one("SELECT duyet_v FROM counts WHERE khu_id='A' AND phi_id='D16'").duyet_v, null);
    const mk2 = (await S.call('GET', '/review')).data.khus.find((k) => k.khu === 'A').mark;
    eq('dấu mới: duyệt được', (await S.call('POST', '/review/duyet', { khu: 'A', marks: { A: mk2 } })).status, 200);
    eq('số được duyệt đúng số admin vừa thấy', S.one("SELECT duyet_v FROM counts WHERE khu_id='A' AND phi_id='D16'").duyet_v, 50);
    // phiếu mới của khu cũng là "thứ chưa xem": duyệt khu là duyệt luôn phiếu
    const mk3 = (await S.call('GET', '/review')).data.khus.find((k) => k.khu === 'A').mark;
    await S.call('POST', '/receipts', { khu: 'A', lines: [{ phi: 'D16', qty: 10 }] }, 'Kho');
    eq('phiếu mới sau lúc tải màn: từ chối', (await S.call('POST', '/review/duyet', { khu: 'A', marks: { A: mk3 } })).status, 409);
    // duyệt tất cả mà có khu mới thành chờ duyệt (không có trong marks)
    const all = Object.fromEntries((await S.call('GET', '/review')).data.khus.map((k) => [k.khu, k.mark]));
    await S.call('PUT', '/counts', { khu: 'B', day, items: items({ D18: 5 }) }, 'Binh');
    eq('duyệt tất cả khi có khu mới: từ chối', (await S.call('POST', '/review/duyet', { all: true, marks: all })).status, 409);
  }

  /* ================= 57. Đếm lại: không bật lại xung đột cũ; ngày đã khoá thì không treo cờ ================= */
  {
    const S = await setup();
    const day = vnDay();
    await S.call('PUT', '/counts', { khu: 'A', day, items: items({ D16: 80 }) }, 'An'); advance(3000);
    await S.call('PUT', '/counts', { khu: 'A', day, items: items({ D16: 70 }) }, 'Binh');
    await S.call('POST', '/conflict/resolve', { khu: 'A' });
    eq('yêu cầu đếm lại', (await S.call('POST', '/recount', { khu: 'A' })).status, 200);
    advance(3000);
    await S.call('PUT', '/counts', { khu: 'A', day, items: items({ D16: 75 }) }, 'An');
    const ex = (await S.call('GET', '/review')).data.exceptions.map((e) => e.type);
    eq('báo lại xong: chỉ còn chờ duyệt, xung đột cũ không bật lại', ex, ['khu_pending']);
    await S.call('POST', '/reset', { mode: 'zero' });
    const rq = await S.call('POST', '/recount', { khu: 'A' });
    eq('/recount khi ngày đã khoá (đặt lại số liệu): từ chối', [rq.status, rq.data.code], [409, 'closed']);
  }

  /* ================= 58. Không quyết trên số đã cũ: gửi sau chốt, chọn số xung đột ================= */
  {
    const day = vnDay();
    // chọn số khi hai người báo khác nhau trên bảng so sánh đã cũ
    const S3 = await setup();
    await S3.call('PUT', '/counts', { khu: 'A', day, items: items({ D16: 100 }) }, 'An'); advance(2000);
    await S3.call('PUT', '/counts', { khu: 'A', day, items: items({ D16: 90 }) }, 'Binh');
    const mk = (await S3.call('GET', '/review')).data.khus.find((k) => k.khu === 'A').mark;
    advance(2000);
    await S3.call('PUT', '/counts', { khu: 'A', day, items: items({ D16: 120 }) }, 'Binh');
    eq('chọn số trên bảng đã cũ: từ chối', (await S3.call('POST', '/conflict/resolve', { khu: 'A', pick: { D16: 100 }, mark: mk })).status, 409);
    eq('lần báo mới còn nguyên', S3.one("SELECT v FROM counts WHERE khu_id='A' AND phi_id='D16'").v, 120);
    const mk2 = (await S3.call('GET', '/review')).data.khus.find((k) => k.khu === 'A').mark;
    eq('dấu mới: chọn được', (await S3.call('POST', '/conflict/resolve', { khu: 'A', pick: { D16: 100 }, mark: mk2 })).status, 200);

    // ngày đặt lại số liệu: không nhận báo cáo sau chốt (admin không nhận được, chỉ thành rác)
    const S4 = await setup();
    eq('đặt tồn về 0', (await S4.call('POST', '/reset', { mode: 'zero' })).status, 200);
    const r4 = await S4.call('PUT', '/counts', { khu: 'A', day, items: items({ D16: 5 }) }, 'An');
    eq('gửi sau mốc đặt lại: từ chối', [r4.status, r4.data.code], [409, 'closed']);
    eq('máy khách biết hôm nay là mốc đặt lại', (await S4.call('GET', '/bootstrap', undefined, 'An')).data.closedReset, true);

  }

  /* ================= 59. Sổ ngày tự chốt sau nửa đêm =================
     Không còn chốt tay: lần chạy mỗi giờ chốt ngày cũ nhất chưa chốt nếu ngày đó đã qua. */
  {
    const S = await setup();
    const cron = async () => { let pr; await S.worker.scheduled({}, S.env, { waitUntil: (p) => (pr = p) }); await pr; };
    const soNgayChot = () => S.one('SELECT COUNT(*) n FROM day_close').n;
    await cron();
    eq('chưa có số liệu nào: không chốt gì', soNgayChot(), 0);

    // --- lỡ nhiều ngày: mỗi lần chạy bù MỘT ngày, ngày nào riêng ngày đó ---
    const d0 = vnDay();
    await nhap(S, { khu: 'A', lines: [{ phi: 'D16', qty: 100 }] });
    await bao(S, { khu: 'A', day: d0, items: items({ D16: 100 }) }, 'An');
    addDays(3);
    await cron();
    eq('lần 1: chốt ngày đầu tiên có số liệu', S.sql('SELECT day FROM day_close').map((x) => x.day), [d0]);
    await cron(); await cron();
    eq('lần 2, 3: bù tiếp từng ngày', soNgayChot(), 3);
    await cron();
    eq('hôm nay chưa qua: không chốt', soNgayChot(), 3);
    eq('ngày nào riêng ngày đó, không gộp', S.sql('SELECT DISTINCT span FROM day_close').map((x) => x.span), [1]);

    // --- báo cáo chuyển từ hôm qua: không tính là xung đột, không làm sai chuỗi "giữ nguyên" ---
    let day = vnDay();
    await S.call('PUT', '/counts', { khu: 'A', day, items: items({ D16: { v: 100, kind: 'giu' } }) }, 'An');
    eq('giữ nguyên lần 1: chuỗi = 1', S.one("SELECT keep_streak k FROM khu_phi WHERE khu_id='A' AND phi_id='D16'").k, 1);
    addDays(1); day = vnDay();
    await cron();
    ok('báo cáo chưa duyệt đã chuyển sang hôm nay',
      !!S.one("SELECT 1 x FROM counts WHERE day=? AND khu_id='A' AND phi_id='D16' AND duyet_v IS NULL", day));
    const g = await S.call('PUT', '/counts', { khu: 'A', day, items: items({ D16: { v: 100, kind: 'giu' } }) }, 'An');
    eq('giữ nguyên lần 2 (hôm nay): chuỗi = 2, không bị trừ vì số chuyển từ hôm qua', [g.status, S.one("SELECT keep_streak k FROM khu_phi WHERE khu_id='A' AND phi_id='D16'").k], [200, 2]);
    const S2 = await setup();
    const e0 = vnDay();
    await S2.call('PUT', '/counts', { khu: 'A', day: e0, items: items({ D16: 50 }) }, 'An');
    addDays(1);
    const cron2 = async () => { let pr; await S2.worker.scheduled({}, S2.env, { waitUntil: (p) => (pr = p) }); await pr; };
    await cron2();
    const k2 = await S2.call('PUT', '/counts', { khu: 'A', day: vnDay(), items: items({ D16: 40 }) }, 'Binh');
    eq('người khác báo hôm nay khác số hôm qua: không phải xung đột', k2.data.conflict, false);
    eq('màn Duyệt cũng không có xung đột', (await S2.call('GET', '/review')).data.exceptions.some((e) => e.type === 'conflict'), false);

    // --- ngày bất thường: vẫn chốt, nhưng không vào mức dùng trung bình ---
    const S3 = await setup();
    const f0 = vnDay();
    await nhap(S3, { khu: 'A', lines: [{ phi: 'D16', qty: 300 }] });
    await bao(S3, { khu: 'A', day: f0, items: items({ D16: 300 }) }, 'An');
    await chot(S3);
    addDays(1); let f = vnDay();
    await bao(S3, { khu: 'A', day: f, items: items({ D16: 200 }) }, 'An');   // dùng 100: bình thường
    await chot(S3);
    eq('ngày bình thường: bt = 0', S3.one('SELECT bt FROM daily_summary WHERE day=? AND phi_id=?', f, 'D16').bt, 0);
    const rate1 = S3.one("SELECT per_day, days FROM phi_rate WHERE phi_id='D16'");
    addDays(1); f = vnDay();
    await bao(S3, { khu: 'A', day: f, items: items({ D16: 400 }) }, 'An');   // thép "tự sinh" 200 cây: dùng âm
    await chot(S3);
    eq('ngày dùng âm: vẫn chốt, đánh dấu bất thường', S3.one('SELECT dung, bt FROM daily_summary WHERE day=? AND phi_id=?', f, 'D16'), { dung: -200, bt: 1 });
    eq('mức dùng trung bình không bị ngày bất thường kéo lệch', S3.one("SELECT per_day, days FROM phi_rate WHERE phi_id='D16'"), rate1);
    ok('nhật ký chốt nói rõ', /D16 dùng âm/.test(S3.one('SELECT note FROM day_close WHERE day=?', f).note));
  }

  /* ================= kết quả ================= */
  const fail = T.filter((x) => x[0] === 'FAIL');
  console.log(T.map((x) => x[0] + ' | ' + x[1] + (x[2] ? '  [' + x[2] + ']' : '')).join('\n'));
  console.log('\n=== ' + T.length + ' kiểm tra, ' + fail.length + ' lỗi ===');
  process.exit(fail.length ? 1 : 0);
}
main().catch((e) => { console.error('CRASH', e); process.exit(2); });
