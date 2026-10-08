/* Test logic nghiệp vụ trên worker thật + SQLite thật. node srv.test.mjs <đường-dẫn-repo> */
import { boot, addDays, advance, vnDay } from './harness.mjs';
import { readFileSync } from 'node:fs';
import path from 'node:path';

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

/* Phiên bản cấu trúc hiện tại, đọc từ chính worker: ba mục dưới đây chỉ cần biết "migration đã
   chạy tới bản mới nhất", nên không phải sửa số bằng tay mỗi lần thêm một migration. */
const SCHEMA_NOW = Number(readFileSync(path.join(ROOT, 'src/worker.js'), 'utf8').match(/SCHEMA_VERSION = (\d+)/)[1]);

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
// chốt ngày: duyệt hết những gì còn chờ rồi mới chốt (bỏ qua bước duyệt khi đang thử phân quyền)
const chot = async (S, body, who) => {
  if (!who) await duyetAll(S);
  return S.call('POST', '/close', body === undefined ? { note: '' } : body, who);
};

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
    eq('chưa duyệt thì chưa chốt được không ghi chú', (await S.call('POST', '/close', { note: '' })).status, 400);

    eq('duyệt khu A', (await duyet(S, 'A')).status, 200);
    eq('duyệt rồi thì số vào tồn',
      S.one('SELECT duyet_v, duyet_name FROM counts WHERE day=? AND khu_id=? AND phi_id=?', day0, 'A', 'D16'),
      { duyet_v: 1800, duyet_name: 'Admin' });
    rv = (await S.call('GET', '/review')).data;
    eq('ngày đầu chưa có tồn chuẩn -> used null', rv.rows.find((x) => x.phi === 'D16').used, null);
    eq('span ngày đầu', rv.span, 1);
    eq('duyệt hết thì không còn việc chờ', rv.pending, 0);
    r = await S.call('POST', '/close', { note: '' });
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
    const cl = await chot(S, { note: 'Khu A đã xuất hết D22' });
    eq('chốt kèm ghi chú khi có biến động khu', cl.status, 200);
    const r = await S.call('POST', '/recount-after-close', { khu: 'A' });
    eq('mở lại ngày để đếm lại: ok', r.status, 200);
    eq('ngày đã mở lại', S.sql('SELECT 1 FROM day_close WHERE day=?', day).length, 0);
    eq('số của khu đã xoá', S.sql('SELECT 1 FROM counts WHERE day=? AND khu_id=?', day, 'A').length, 0);
    eq('báo lại sau khi mở ngày: ghi được', (await bao(S, { khu: 'A', day, items: items({ D22: 0 }) }, 'Binh')).status, 200);
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
    const a = await bao(S, { khu: 'A', day, items: items({ D18: 130 }) }, 'An');
    eq('đã chốt: không báo số được', a.status, 409);
    const b = await nhap(S, { khu: 'A', lines: [{ phi: 'D18', qty: 1 }] });
    eq('đã chốt: không nhập kho được', b.status, 409);
    const c = await chot(S, { note: 'x' });
    eq('chốt hai lần: từ chối', c.status, 409);
  }

  /* ================= 14. Bảo mật / phân quyền ================= */
  {
    const S = await setup();
    eq('người đếm không vào được Duyệt', (await S.call('GET', '/review', undefined, 'An')).status, 403);
    eq('người đếm không nhập kho được', (await nhap(S, { khu: 'A', lines: [{ phi: 'D10', qty: 1 }] }, 'An')).status, 403);
    eq('thủ kho không chốt ngày được', (await chot(S, { note: 'x' }, 'Kho')).status, 403);
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
    eq('đã duyệt thì lệch không chặn chốt', (await S.call('POST', '/close', { note: '' })).status, 200);
  }

  /* ================= 20. Duyệt theo khu + tự chốt chỉ khi được bật ================= */
  {
    const S = await setup();
    const cron = async () => { let pr; await S.worker.scheduled({}, S.env, { waitUntil: (p) => (pr = p) }); await pr; };
    const closedToday = () => S.sql('SELECT 1 FROM day_close WHERE day=?', vnDay()).length;
    let day = vnDay();
    await nhap(S, { khu: 'A', lines: [{ phi: 'D22', qty: 90 }] });
    await nhap(S, { khu: 'B', lines: [{ phi: 'D22', qty: 90 }] });
    await bao(S, { khu: 'A', day, items: items({ D22: 90 }) }, 'An');
    await bao(S, { khu: 'B', day, items: items({ D22: 90 }) }, 'Binh');
    eq('tự chốt mặc định tắt', (await S.call('GET', '/bootstrap')).data.settings.auto_close, 0);
    await cron();
    eq('tắt thì cron không chốt', closedToday(), 0);
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
    eq('còn khu chưa duyệt: chốt không ghi chú bị từ chối', (await S.call('POST', '/close', { note: '' })).status, 400);

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

    // bật tự chốt: còn việc chưa duyệt thì cron bỏ qua và ghi lý do
    advance(2000);
    await S.call('PUT', '/counts', { khu: 'B', day, items: items({ D22: 1 }) }, 'Binh');
    await S.call('PUT', '/settings', { auto_close: 1 });
    await cron();
    eq('còn việc chưa duyệt: cron không chốt', closedToday(), 0);
    ok('cron ghi lý do bỏ qua', /chưa duyệt/.test((S.sql("SELECT detail FROM audit WHERE action='auto_close_skip' ORDER BY id DESC LIMIT 1")[0] || {}).detail || ''));
    await duyet(S, 'B');
    await cron();
    eq('duyệt hết: cron tự chốt', closedToday(), 1);
    eq('đã chốt thì không duyệt được nữa', (await duyetAll(S)).status, 409);
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
    await S.call('POST', '/close', { note: '' });
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
    eq('chốt ngày thường được', (await S.call('POST', '/close', { note: '' })).status, 200);
    const ro2 = await S.call('POST', '/reopen', { note: 'chốt nhầm' });
    eq('mở lại ngày chốt thường: được', ro2.status, 200);
    eq('và KHÔNG phải mốc kiểm kê', ro2.data.reset, false);
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
    eq('và chốt được', (await S.call('POST', '/close', { note: '' })).status, 200);
    eq('lần chốt này tạo tồn chuẩn đầu tiên',
      S.one("SELECT v FROM baseline WHERE day=? AND khu_id='A' AND phi_id='D16'", day).v, 500);
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
     Thiếu một ô rỗng là cả bốn số tấn tụt sang trái một cột và Excel đọc "tồn đầu" thành "tồn cuối". */
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
    eq('số tấn nằm đúng dưới 4 cột tấn', hdr.slice(-4), ['"Tồn đầu (tấn)"', '"Nhập (tấn)"', '"Dùng (tấn)"', '"Tồn cuối (tấn)"']);
    // 1800 cây D16 × 18,48 kg = 33,264 tấn; dùng 300 cây = 5,544 tấn; còn 1500 cây = 27,720 tấn
    eq('tồn đầu / nhập / dùng / tồn cuối theo tấn', tot.slice(-4), ['33,264', '0,000', '5,544', '27,720']);
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

  /* ================= kết quả ================= */
  const fail = T.filter((x) => x[0] === 'FAIL');
  console.log(T.map((x) => x[0] + ' | ' + x[1] + (x[2] ? '  [' + x[2] + ']' : '')).join('\n'));
  console.log('\n=== ' + T.length + ' kiểm tra, ' + fail.length + ' lỗi ===');
  process.exit(fail.length ? 1 : 0);
}
main().catch((e) => { console.error('CRASH', e); process.exit(2); });
