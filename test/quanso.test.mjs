/* Quân số đầu ca, kiểm trên worker thật + SQLite thật. node quanso.test.mjs <đường-dẫn-repo>
   Những điều tính năng này hứa:
   1. Mỗi tổ (Tiểu đội trưởng) báo theo CA; ca đêm vắt qua nửa đêm vẫn thuộc ngày bắt đầu ca.
   2. Số nghỉ là tổng các lý do, phần còn lại sau đi làm + nghỉ là người thuộc ca kia: không có dòng cộng sai.
   3. Tiểu đội trưởng chỉ thấy và chỉ ghi tổ mình, cho ca đang diễn ra hoặc ca kế tiếp.
   4. CVKTHT trở lên thấy mọi tổ, ghi thay và sửa được (lùi 7 ngày), dòng ghi rõ ai ghi. */
import { boot, advance, vnDay } from './harness.mjs';

const ROOT = process.argv[2] || '.';
const T = [];
const ok = (name, cond, extra) => { T.push([cond ? 'PASS' : 'FAIL', name, extra === undefined ? '' : String(extra)]); };
const eq = (name, a, b) => ok(name + ' = ' + JSON.stringify(b), JSON.stringify(a) === JSON.stringify(b), 'thực tế: ' + JSON.stringify(a));
// đưa đồng hồ giả tới giờ Việt Nam kế tiếp có dạng h:m (chỉ đi tới, không lùi)
const datGio = (h, m = 0) => {
  const cur = ((Date.now() + 7 * 3600e3) % 864e5) / 60e3;
  let d = h * 60 + m - cur;
  if (d <= 0) d += 1440;
  advance(d * 60e3);
};
const cong = (d, n) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);

async function dung() {
  const S = await boot(ROOT);
  await S.call('POST', '/setup', { token: 'setup-tok', name: 'Admin', phone: '0900000001', pin: '2468' });
  await S.login('Admin', '0900000001', '2468');
  const U = {};
  for (const [name, phone, role] of [['An', '0900000002', 'tieudoi'], ['Binh', '0900000003', 'tieudoi'], ['Cv', '0900000004', 'cvktht'], ['Trung', '0900000005', 'trungdoi']]) {
    const r = await S.call('POST', '/users', { name, phone, role }, 'Admin');
    await S.login(name, phone, r.data.pin);
    await S.call('POST', '/change-pin', { pin: r.data.pin, newPin: '1357' }, name);
    U[name] = r.data.id;
  }
  return { S, U };
}

async function main() {
  datGio(8);
  const { S, U } = await dung();
  const D = vnDay();
  const xem = async (who, q = '') => (await S.call('GET', '/quanso' + q, undefined, who)).data;
  const ghi = (who, body) => S.call('PUT', '/quanso', body, who);
  const dong = (uid, ngay = D, ca = 1) => S.one('SELECT tong, lam, ca_kia, nghi, ghi_chu, by_id FROM quan_so WHERE ngay = ? AND ca = ? AND user_id = ?', ngay, ca, uid);
  const rev = () => S.one("SELECT value FROM meta WHERE key = 'rev'").value;

  /* ===== 1. Ca đang diễn ra, ai thấy tổ nào ===== */
  const v0 = await xem('An');
  eq('8h sáng: đang là ca ngày hôm nay, ca kế là ca đêm hôm nay', [v0.hien, v0.ke, v0.ngay, v0.ca], [{ ngay: D, ca: 1 }, { ngay: D, ca: 2 }, D, 1]);
  eq('ca ngày chạy 6h30 → 18h30', [(v0.gio.den - v0.gio.tu) / 3600e3, ((v0.gio.tu + 7 * 3600e3) % 864e5) / 60e3], [12, 390]);
  eq('Tiểu đội trưởng chỉ thấy tổ mình', v0.tdt.map((x) => x.name), ['An']);
  eq('CVKTHT thấy mọi tổ: có bao nhiêu Tiểu đội trưởng là bấy nhiêu tổ', (await xem('Cv')).tdt.map((x) => x.name), ['An', 'Binh']);
  eq('Trung đội trưởng cũng vậy', (await xem('Trung')).tdt.length, 2);

  /* ===== 2. Ghi: số phải khớp nhau ===== */
  const rev0 = rev();
  eq('An báo tổ mình: 21 người, đi làm 16, 5 ốm', (await ghi('An', { ngay: D, ca: 1, tong: 21, lam: 16, nghi: { om: 5 } })).status, 200);
  eq('dòng vào sổ, không ai thuộc ca kia, người ghi là An', dong(U.An), { tong: 21, lam: 16, ca_kia: 0, nghi: '{"om":5}', ghi_chu: null, by_id: U.An });
  ok('báo quân số làm tăng rev (máy khác tự tải lại)', rev() > rev0);
  const a1 = JSON.parse(S.one("SELECT detail FROM audit WHERE action = 'qs_bao' ORDER BY id DESC").detail);
  eq('nhật ký ghi lần báo', [a1.to, a1.ca, a1.lam, a1.tong, a1.nghi, a1.thay], ['An', 1, 16, 21, { om: 5 }, undefined]);
  eq('đi làm + nghỉ nhiều hơn tổng: từ chối', (await ghi('An', { ngay: D, ca: 1, tong: 21, lam: 18, nghi: { om: 5 } })).status, 400);
  eq('lý do nghỉ lạ: từ chối', (await ghi('An', { ngay: D, ca: 1, tong: 21, lam: 16, nghi: { luoi: 5 } })).status, 400);
  eq('số nghỉ âm / không phải số: từ chối', [(await ghi('An', { ngay: D, ca: 1, tong: 21, lam: 16, nghi: { om: -1 } })).status, (await ghi('An', { ngay: D, ca: 1, tong: 21, lam: 16, nghi: { om: 'hai' } })).status], [400, 400]);
  eq('tổng quân số 0 / quá trần: từ chối', [(await ghi('An', { ngay: D, ca: 1, tong: 0, lam: 0 })).status, (await ghi('An', { ngay: D, ca: 1, tong: 9999, lam: 1 })).status], [400, 400]);
  eq('"lý do khác" mà không ghi rõ: từ chối', (await ghi('An', { ngay: D, ca: 1, tong: 21, lam: 20, nghi: { khac: 1 } })).status, 400);
  eq('các lần bị từ chối không đổi dòng đã báo', dong(U.An).lam, 16);
  eq('báo lại là ghi đè: 15 đi làm, 5 ốm, 1 OFF (OFF nằm trong số nghỉ)', (await ghi('An', { ngay: D, ca: 1, tong: 21, lam: 15, nghi: { om: 5, off: 1 }, ghi_chu: '  1 người   đổi lịch off ' })).status, 200);
  eq('vẫn một dòng cho ca đó, số mới, ghi chú gọn lại', [S.one('SELECT COUNT(*) n FROM quan_so').n, dong(U.An)], [1, { tong: 21, lam: 15, ca_kia: 0, nghi: '{"om":5,"off":1}', ghi_chu: '1 người đổi lịch off', by_id: U.An }]);
  eq('"lý do khác" có ghi rõ: được', (await ghi('An', { ngay: D, ca: 1, tong: 21, lam: 15, nghi: { om: 5, khac: 1 }, ghi_chu: 'chăm bố ốm' })).status, 200);

  /* ===== 3. Tổ chia hai ca, và ghi thay ===== */
  eq('An không ghi được cho tổ Binh', (await ghi('An', { ngay: D, ca: 1, user: U.Binh, tong: 19, lam: 8 })).status, 403);
  eq('CVKTHT không chọn tổ: từ chối', (await ghi('Cv', { ngay: D, ca: 1, tong: 19, lam: 8 })).status, 400);
  eq('ghi cho người không phải Tiểu đội trưởng: từ chối', [(await ghi('Cv', { ngay: D, ca: 1, user: U.Trung, tong: 19, lam: 8 })).status, (await ghi('Cv', { ngay: D, ca: 1, user: 99999, tong: 19, lam: 8 })).status], [400, 400]);
  const g = await ghi('Cv', { ngay: D, ca: 1, user: U.Binh, tong: 19, lam: 8, nghi: { om: 1 } });
  eq('Cv ghi thay tổ Binh: 19 người, ca ngày 8, 1 ốm → 10 người thuộc ca đêm', [g.status, g.data.ca_kia, dong(U.Binh)], [200, 10, { tong: 19, lam: 8, ca_kia: 10, nghi: '{"om":1}', ghi_chu: null, by_id: U.Cv }]);
  eq('nhật ký ghi rõ là ghi thay', JSON.parse(S.one("SELECT detail FROM audit WHERE action = 'qs_bao' ORDER BY id DESC").detail).thay, 1);
  const vCv = await xem('Cv');
  eq('Cv thấy dòng của cả hai tổ, kèm tên người ghi', vCv.rows.map((r) => [r.uname, r.lam, r.by_name]), [['An', 15, 'An'], ['Binh', 8, 'Cv']]);
  eq('lý do nghỉ trả về dạng bảng, không phải chuỗi', vCv.rows[0].nghi, { om: 5, khac: 1 });
  eq('An vẫn chỉ thấy dòng của tổ mình', (await xem('An')).rows.map((r) => r.uname), ['An']);
  eq('Binh thấy dòng Cv ghi thay cho tổ mình', (await xem('Binh')).rows.map((r) => [r.uname, r.by_name]), [['Binh', 'Cv']]);
  eq('cả tổ không làm ca này: đi làm 0, không ai nghỉ → cả tổ thuộc ca kia', [(await ghi('Cv', { ngay: D, ca: 1, user: U.Binh, tong: 19, lam: 0, nghi: {} })).data.ca_kia, dong(U.Binh).lam], [19, 0]);
  await ghi('Cv', { ngay: D, ca: 1, user: U.Binh, tong: 19, lam: 8, nghi: { om: 1 } });

  /* ===== 4. Báo theo ca: báo sớm ca kế, không báo xa hơn, ca đã qua thì khoá với Tiểu đội trưởng ===== */
  eq('8h sáng báo sớm ca đêm hôm nay (ca kế): được', (await ghi('Binh', { ngay: D, ca: 2, tong: 19, lam: 9, nghi: { gd: 1 } })).status, 200);
  eq('tổ làm hai ca có hai dòng trong ngày', S.sql('SELECT ca, lam, ca_kia FROM quan_so WHERE user_id = ? ORDER BY ca', U.Binh), [{ ca: 1, lam: 8, ca_kia: 10 }, { ca: 2, lam: 9, ca_kia: 9 }]);
  eq('báo trước hai ca (ca ngày mai): từ chối', [(await ghi('An', { ngay: cong(D, 1), ca: 1, tong: 21, lam: 21 })).status, (await S.call('GET', `/quanso?ngay=${cong(D, 1)}&ca=1`, undefined, 'An')).status], [400, 400]);
  eq('ca lạ / ngày không có thật: từ chối', [(await ghi('An', { ngay: D, ca: 3, tong: 21, lam: 21 })).status, (await ghi('An', { ngay: D.slice(0, 4) + '-02-31', ca: 1, tong: 21, lam: 21 })).status, (await ghi('An', { ngay: 'mai', ca: 1, tong: 21, lam: 21 })).status], [400, 400, 400]);
  eq('xem ca đêm hôm nay: thấy cả dòng ca ngày của tổ để biết ai thuộc ca nào', (await xem('Binh', `?ngay=${D}&ca=2`)).rows.map((r) => r.ca), [1, 2]);

  datGio(19);
  const v19 = await xem('An');
  eq('19h: đang là ca đêm hôm nay, ca kế là ca ngày mai', [v19.hien, v19.ke], [{ ngay: D, ca: 2 }, { ngay: cong(D, 1), ca: 1 }]);
  const q19 = await ghi('An', { ngay: D, ca: 1, tong: 21, lam: 21 });
  eq('ca ngày đã qua: Tiểu đội trưởng không sửa được nữa', [q19.status, q19.data.code, dong(U.An).lam], [409, 'qua', 15]);
  eq('CVKTHT vẫn sửa được ca đã qua', [(await ghi('Cv', { ngay: D, ca: 1, user: U.An, tong: 21, lam: 14, nghi: { om: 6, khac: 1 }, ghi_chu: 'chăm bố ốm' })).status, dong(U.An).lam, dong(U.An).by_id], [200, 14, U.Cv]);

  datGio(2);
  eq('2h sáng hôm sau: vẫn là ca đêm của HÔM TRƯỚC', [vnDay(), (await xem('An')).hien], [cong(D, 1), { ngay: D, ca: 2 }]);
  eq('An báo ca đêm lúc 2h sáng: ghi vào ngày bắt đầu ca', [(await ghi('An', { ngay: D, ca: 2, tong: 21, lam: 0, nghi: {} })).status, dong(U.An, D, 2).ca_kia], [200, 21]);
  const gDem = (await xem('An')).gio;
  eq('giờ ca đêm: 12 tiếng, bắt đầu 18h30', [(gDem.den - gDem.tu) / 3600e3, ((gDem.tu + 7 * 3600e3) % 864e5) / 60e3], [12, 1110]);
  datGio(6, 29);
  eq('6h29: chưa giao ca', (await xem('An')).hien, { ngay: D, ca: 2 });
  datGio(6, 30);
  const D1 = cong(D, 1);
  eq('6h30: sang ca ngày hôm sau', (await xem('An')).hien, { ngay: D1, ca: 1 });

  /* ===== 5. Điền sẵn: lần báo gần nhất trước ca đang xem ===== */
  const v1 = await xem('Cv');
  eq('ca mới chưa ai báo', v1.rows, []);
  eq('lần báo gần nhất của từng tổ để điền sẵn tổng quân số', v1.truoc.map((r) => [r.user_id, r.ngay, r.ca, r.tong]).sort(), [[U.An, D, 2, 21], [U.Binh, D, 2, 19]].sort());
  eq('Tiểu đội trưởng chỉ nhận lần báo trước của tổ mình', (await xem('An')).truoc.map((r) => r.user_id), [U.An]);

  /* ===== 6. Bootstrap: tổ nào đã báo ca đang diễn ra và ca kế ===== */
  const bA = (await S.call('GET', '/bootstrap', undefined, 'An')).data.qs;
  eq('bootstrap của An: ca ngày hôm nay, chỉ tổ mình, chưa báo', [bA.hien, bA.to], [{ ngay: D1, ca: 1 }, [{ id: U.An, name: 'An', da: false, daKe: false, ca: [1], lich: 0 }]]);
  await ghi('An', { ngay: D1, ca: 1, tong: 21, lam: 21 });
  await ghi('Binh', { ngay: D1, ca: 2, tong: 19, lam: 19 });
  const bC = (await S.call('GET', '/bootstrap', undefined, 'Cv')).data.qs;
  eq('bootstrap của Cv: mọi tổ, đúng ai báo ca nào', bC.to, [{ id: U.An, name: 'An', da: true, daKe: false, ca: [1], lich: 0 }, { id: U.Binh, name: 'Binh', da: false, daKe: true, ca: [2], lich: 0 }]);
  const phut = (ms) => ((ms + 7 * 3600e3) % 864e5) / 60e3;
  eq('hạn báo gửi kèm: ca ngày 7h, ca đêm 19h15', [phut(bC.han), phut(bC.hanKe), bC.han < bC.den && bC.hanKe > bC.den], [420, 1155, true]);

  /* ===== 6b. Hạn báo đổi được (CVKTHT trở lên), và hai ca để Tiểu đội trưởng chọn ===== */
  eq('Tiểu đội trưởng không đổi được hạn báo', (await S.call('PUT', '/quanso/han', { ca1: 430, ca2: 1160 }, 'An')).status, 403);
  eq('hạn ca ngày nằm ngoài ca ngày / hạn ca đêm trước giờ vào ca đêm / không phải số: từ chối', [(await S.call('PUT', '/quanso/han', { ca1: 1200, ca2: 1160 }, 'Cv')).status, (await S.call('PUT', '/quanso/han', { ca1: 430, ca2: 1000 }, 'Cv')).status, (await S.call('PUT', '/quanso/han', { ca1: 'bảy giờ', ca2: 1160 }, 'Cv')).status], [400, 400, 400]);
  eq('Cv đổi hạn: ca ngày 7h15, ca đêm 19h30', (await S.call('PUT', '/quanso/han', { ca1: 435, ca2: 1170 }, 'Cv')).status, 200);
  const vH = await xem('An');
  eq('màn Quân số và bootstrap cùng theo hạn mới', [vH.hanPhut, phut(vH.han), phut((await S.call('GET', '/bootstrap', undefined, 'An')).data.qs.han)], [[435, 1170], 435, 435]);
  eq('nhật ký ghi lần đổi hạn', JSON.parse(S.one("SELECT detail FROM audit WHERE action = 'qs_han'").detail), { ca1: 435, ca2: 1170 });
  eq('hai ca để chọn: một ca ngày, một ca đêm, kèm hạn và dòng tổ mình đã báo', vH.chon.map((c) => [c.ngay, c.ca, phut(c.han), c.row ? c.row.lam : null]), [[D1, 1, 435, 21], [D1, 2, 1170, null]]);
  eq('Binh thấy ca đêm mình đã báo sớm', (await xem('Binh')).chon.map((c) => [c.ca, c.row ? c.row.lam : null]), [[1, null], [2, 19]]);
  await S.call('PUT', '/quanso/han', { ca1: 420, ca2: 1155 }, 'Cv');
  eq('mốc hết ca gửi kèm (18h30 hôm nay)', ((bC.den + 7 * 3600e3) % 864e5) / 60e3, 1110);

  /* ===== 7. Sửa lùi: CVKTHT được 7 ngày ===== */
  eq('sửa ca của 3 ngày trước: được', (await ghi('Cv', { ngay: cong(D1, -3), ca: 1, user: U.An, tong: 21, lam: 20, nghi: { phep: 1 } })).status, 200);
  eq('sửa ca của 9 ngày trước: từ chối', (await ghi('Cv', { ngay: cong(D1, -9), ca: 1, user: U.An, tong: 21, lam: 20, nghi: { phep: 1 } })).status, 400);
  eq('nhưng xem lại thì được', (await S.call('GET', `/quanso?ngay=${cong(D1, -9)}&ca=1`, undefined, 'Cv')).status, 200);

  /* ===== 8. Tổ trưởng đổi vai trò: dòng đã báo không mất ===== */
  await S.call('POST', `/users/${U.Binh}/role`, { role: 'cvktht', confirm_khu: true }, 'Admin');
  eq('Binh lên CVKTHT: dòng đã báo vẫn còn', S.one('SELECT COUNT(*) n FROM quan_so WHERE user_id = ?', U.Binh).n, 3);
  eq('không còn là một tổ trong danh sách', (await xem('Cv')).tdt.map((x) => x.name), ['An']);
  eq('sửa dòng tổ đó ĐÃ báo: được', (await ghi('Cv', { ngay: D1, ca: 2, user: U.Binh, tong: 19, lam: 18, nghi: { om: 1 } })).status, 200);
  eq('ghi dòng MỚI cho người không còn là Tiểu đội trưởng: từ chối', (await ghi('Cv', { ngay: D1, ca: 1, user: U.Binh, tong: 19, lam: 18, nghi: { om: 1 } })).status, 400);
  await S.call('POST', `/users/${U.Binh}/role`, { role: 'tieudoi' }, 'Admin');

  /* ===== 9. Giờ ca do cài đặt quyết định ===== */
  eq('ca đêm bắt đầu trước ca ngày: từ chối', (await S.call('PUT', '/settings', { ca1_tu: 1200, ca2_tu: 400 }, 'Admin')).status, 400);
  eq('đổi giờ vào ca ngày thành 7h', (await S.call('PUT', '/settings', { ca1_tu: 420 }, 'Admin')).status, 200);
  eq('lúc 6h30 thì vẫn là ca đêm hôm trước', (await xem('An')).hien, { ngay: D, ca: 2 });
  await S.call('PUT', '/settings', { ca1_tu: 390 }, 'Admin');
  eq('bootstrap gửi giờ ca kèm cài đặt', [(await S.call('GET', '/bootstrap', undefined, 'An')).data.settings.ca1_tu, (await S.call('GET', '/bootstrap', undefined, 'An')).data.settings.ca2_tu], [390, 1110]);

  /* ===== 10. Sao lưu / nạp lại, xoá sạch dữ liệu thép ===== */
  {
    const n = S.one('SELECT COUNT(*) n FROM quan_so').n;
    const bk = await S.call('GET', '/backup', undefined, 'Admin');
    eq('bản sao có đủ quân số', bk.data.bang.quan_so.length, n);
    S.raw.exec('DELETE FROM quan_so');
    eq('nạp lại bản sao', (await S.call('POST', '/restore', { confirm: 'NAP LAI', file: bk.data }, 'Admin')).status, 200);
    eq('quân số trở lại đủ', S.one('SELECT COUNT(*) n FROM quan_so').n, n);
    const cu = { ...bk.data, bang: { ...bk.data.bang } };
    delete cu.bang.quan_so;
    eq('nạp bản sao CHƯA có bảng quân số', (await S.call('POST', '/restore', { confirm: 'NAP LAI', file: cu }, 'Admin')).status, 200);
    eq('thì quân số đang có được giữ nguyên', S.one('SELECT COUNT(*) n FROM quan_so').n, n);
    eq('xoá sạch dữ liệu thép', (await S.call('POST', '/reset', { mode: 'wipe', confirm: 'XOA SACH' }, 'Admin')).status, 200);
    eq('không xoá quân số (không phải số liệu thép)', S.one('SELECT COUNT(*) n FROM quan_so').n, n);
  }

  /* ===== 11. Nâng cấp từ bản 27: bảng quân số tự có ===== */
  {
    const S2 = await boot(ROOT);
    S2.raw.exec("DROP TABLE quan_so; UPDATE meta SET value = 27 WHERE key = 'schema'");
    const S3 = await boot(ROOT, S2.raw);
    await S3.call('POST', '/setup', { token: 'setup-tok', name: 'Admin', phone: '0900000001', pin: '2468' });
    ok('database bản 27 tự nâng cấp: có bảng quân số và index theo tổ', S3.one("SELECT COUNT(*) n FROM sqlite_master WHERE name IN ('quan_so', 'idx_quan_so_u')").n === 2);
  }

  /* ===== 12. Giao diện thật nối server thật =====
     app.js chạy trong máy ảo, fetch của nó gọi thẳng vào worker (như giacong.test.mjs). Kiểm những thứ làm
     cho việc báo nhanh: điền sẵn, số đi làm tự tính, tổ chia hai ca, ghi thay, thẻ nhắc đúng người. */
  {
    datGio(6, 45);
    const { S: S3, U: id3 } = await dung();
    const ngay = vnDay();
    const { readFileSync } = await import('node:fs');
    const vm = (await import('node:vm')).default;
    const path = (await import('node:path')).default;
    let who = 'An';
    const el = () => ({ value: '', dataset: {}, style: {}, focus() {}, remove() {}, setSelectionRange() {}, querySelector: () => null, querySelectorAll: () => [], appendChild() {}, closest: () => null, set innerHTML(v) {}, get innerHTML() { return ''; } });
    const store = {};
    // bộ bắt sự kiện thật của app để phát sự kiện gõ như trên điện thoại; ô tóm tắt của thẻ giữ một đối tượng cố định
    const nghe = {}, prev = { textContent: '', style: {} };
    const go_ = (model, value) => (nghe.input || []).forEach((fn) => fn({ target: { dataset: { model }, value, id: model } }));
    const ctx = {
      console, Date, Math, JSON, String, Number, Object, Array, Set, Map, parseInt, parseFloat, isNaN, Promise, RegExp, Error, TypeError, encodeURIComponent,
      setTimeout: () => 0, clearTimeout: () => {},
      localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; }, key: () => null, get length() { return 0; } },
      navigator: { onLine: true },
      history: { state: null, pushState() {}, replaceState() {} },
      document: { activeElement: null, hidden: false, body: { appendChild() {}, removeChild() {} }, createElement: el, getElementById: (id) => (id === 'qhprev' ? prev : el()), querySelectorAll: () => [], addEventListener(t, fn) { (nghe[t] = nghe[t] || []).push(fn); } },
      window: { addEventListener() {} },
      fetch: async (url, o = {}) => {
        if (!/^\/api\/(quanso|bootstrap|baocao)/.test(String(url))) return new Promise(() => {}); // /me lúc khởi động, /app.js: để treo
        const r = await S3.call(o.method || 'GET', String(url).replace(/^\/api/, ''), o.body ? JSON.parse(o.body) : undefined, who);
        return { ok: r.status < 400, status: r.status, json: async () => r.data, headers: { get: () => null } };
      },
      URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
    };
    ctx.navigator.clipboard = { writeText: async (t) => { ctx.__chep = t; } };
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(readFileSync(path.join(ROOT, 'public/app.js'), 'utf8'), ctx, { filename: 'app.js' });
    const R = (src) => vm.runInContext(src, ctx);
    const cho = async () => { for (let i = 0; i < 200; i++) { await new Promise((r) => setImmediate(r)); if (!R('S.busy') && i > 40) return; } };
    const vao = async (name, role) => {
      who = name;
      const bt = (await S3.call('GET', '/bootstrap', undefined, name)).data;
      R(`S.boot = ${JSON.stringify(bt)}; indexBoot(S.boot); S.me = ${JSON.stringify({ id: id3[name], name, role })}; S.ask = null; S.form = {}; S.qs = null; S.qsH = null; S.screen = 'home';`);
    };
    const nhac = () => (R('vHome()').match(/<b style="font-size:18px">([^<]*quân số[^<]*)<\/b><span class="sm">([^<]*)</) || []).slice(1);
    const the = () => R('qsTheHome()');
    const lich = (ai, body) => S3.call('PUT', '/quanso/lich', body, ai);
    const tlap = (ai, body) => S3.call('PUT', '/quanso/thietlap', body, ai);
    const cfg = () => JSON.parse((S3.one('SELECT data FROM bc_mau WHERE id = 1') || { data: '{}' }).data);
    const dm = (d) => d.slice(8) + '/' + d.slice(5, 7);

    /* ===== A. LỊCH CA: tổ trưởng tự đặt, CVKTHT đặt hộ ===== */
    eq('An đặt ca cho tổ Binh: từ chối', (await lich('An', { user: id3.Binh, ca: 1 })).status, 403);
    eq('ca lạ / ngày kết thúc đã qua / xa quá một năm: từ chối', [(await lich('An', { ca: 4 })).status, (await lich('An', { ca: 1, den: cong(ngay, -1) })).status, (await lich('An', { ca: 1, den: cong(ngay, 500) })).status], [400, 400, 400]);
    eq('đặt ca cho người không phải Tiểu đội trưởng: từ chối', (await lich('Cv', { user: id3.Trung, ca: 1 })).status, 400);
    eq('các lần bị từ chối không để lại lịch nào', Object.keys(cfg().lich || {}).length, 0);

    await vao('An', 'tieudoi');
    ok('chưa đặt ca: thẻ hỏi "Tổ làm ca nào?" với 3 nút ca và 3 thời hạn, CHƯA có nút báo', the().includes('Tổ làm ca nào?') && (the().match(/data-a="qhca"/g) || []).length === 3 && (the().match(/data-a="qhden"/g) || []).length === 3 && !the().includes('data-a="qhgui"'), the().slice(0, 200));
    ok('thẻ khai báo có ô tổng quân số của tổ', the().includes('id="qhkt"'));
    R(`ACTIONS.qhden({ v: '15' }); ACTIONS.qhca({ v: '1' })`); await cho();
    eq('chạm ca mà chưa gõ tổng quân số: chưa lưu, nhắc gõ tổng', [Object.keys(cfg().lich || {}).length, /Gõ tổng quân số/.test(R('S.toast'))], [0, true]);
    // tổ đặt ca từ trước khi có ô tổng (dữ liệu cũ): có ca mà chưa có tổng
    await lich('An', { ca: 1, den: cong(ngay, 15) }); await vao('An', 'tieudoi');
    eq('lịch ca của tổ đã lưu', [cfg().lich[id3.An].ca, cfg().lich[id3.An].den, cfg().lich[id3.An].by], [1, cong(ngay, 15), id3.An]);
    eq('bootstrap mang lịch của tổ, và ca của tổ theo lịch', [R('S.boot.qs.toi.lich'), R('S.boot.qs.to[0].ca')], [{ ca: 1, den: cong(ngay, 15), het: false }, [1]]);
    eq('nhật ký ghi lần đặt ca', JSON.parse(S3.one("SELECT detail FROM audit WHERE action = 'qs_lich' ORDER BY id DESC").detail), { to: 'An', ca: 1, den: cong(ngay, 15) });

    /* ===== B. Thẻ báo: chỉ MỘT nút, của ca tổ đang làm ===== */
    ok('6h45, trước hạn 7h: thẻ vàng "Báo quân số ca ngày", dòng dưới ghi hạn và ca của tổ', /^Báo quân số ca ngày/.test(nhac()[0] || '') && (nhac()[1] || '') === 'Hạn ' + R('hhmm(S.boot.qs.han)') + ' · tổ làm ca ngày, đến ' + dm(cong(ngay, 15)) && the().startsWith('<div class="card warn'), nhac().join(' | '));
    ok('ca của tổ nằm ngay dòng tiêu đề (không tốn dòng riêng), nút Đổi ca ở cạnh', !the().includes('Ca của tổ:') && the().includes('data-a="qhdoica"'));
    ok('chỉ có MỘT nút báo, của ca ngày; không có nút ca đêm', (the().match(/data-a="qhgui"/g) || []).length === 1 && the().includes('>BÁO CA NGÀY ' + dm(ngay) + '<') && !the().includes('CA ĐÊM'), (the().match(/<button class="btn[^>]*qhgui[^>]*>[^<]*/g) || []).join(' | '));
    R('S.boot.skew = 30 * 60e3');
    ok('7h15, quá hạn: thẻ chuyển đỏ', /^Quá hạn báo quân số ca ngày/.test(nhac()[0] || '') && the().startsWith('<div class="card bad'), nhac().join(' | '));
    R('S.boot.skew = 0');
    ok('không còn thẻ nhắc dẫn sang màn khác: báo ngay trên thẻ', !R('vHome()').includes('data-a="nav" data-s="quanso"'));
    ok('chưa gõ tổng: dòng hướng dẫn chữ thường, KHÔNG đỏ', /id="qhprev" style="font-size:17px;font-weight:400">Gõ tổng quân số của tổ rồi bấm báo\./.test(the()), (the().match(/id="qhprev"[^<]*/) || [''])[0]);
    R(`ACTIONS.qhgui({ v: '${ngay}:1' })`); await cho();
    eq('chưa ghi tổng: chưa gửi', S3.one('SELECT COUNT(*) n FROM quan_so').n, 0);
    ok('bấm gửi mà thiếu tổng: lúc đó mới đỏ', /id="qhprev" style="font-size:17px;color:var\(--bad\)">Ghi tổng quân số của tổ\./.test(the()), (the().match(/id="qhprev"[^<]*/) || [''])[0]);
    R(`S.qsH = null; S.form.qhtong = '21'`);
    eq('gõ tổng 21, chưa ai nghỉ: đi làm 21', [R('qhTinh().lam'), R('qhPrevTxt(qhTinh())')], [21, 'Đi làm 21/21 · không ai nghỉ']);
    R(`ACTIONS.qhmo(); ACTIONS.qhnghi({ k: 'om', v: '1' }); ACTIONS.qhnghi({ k: 'off', v: '1' })`);
    ok('lý do đã có người thì có ô gõ số ngay cạnh; ô ghi chú có sẵn', the().includes('id="qhn_om"') && the().includes('id="qhnote"'));
    go_('qhn_om', '5');
    eq('gõ 5 vào ô "Ốm" (không phải chạm 5 lần): nghỉ 6, đi làm 15, dòng tóm tắt đổi ngay', [R('S.qsH.nghi'), R('qhTinh().lam'), prev.textContent], [{ om: 5, off: 1 }, 15, 'Đi làm 15/21 · nghỉ 6: 5 ốm, 1 OFF luân phiên']);
    go_('qhn_off', '0');
    eq('gõ 0 là bỏ lý do đó', R('S.qsH.nghi'), { om: 5 });
    R(`ACTIONS.qhnghi({ k: 'khac', v: '1' }); ACTIONS.qhgui({ v: '${ngay}:1' })`); await cho();
    eq('có "lý do khác" mà chưa ghi rõ: chưa gửi', S3.one('SELECT COUNT(*) n FROM quan_so').n, 0);
    R(`S.form.qhnote = 'chăm bố ốm'; ACTIONS.qhgui({ v: '${ngay}:1' })`); await cho();
    eq('gửi ngay trên Tổng quan: server ghi đúng số, không đổi màn', [S3.one('SELECT tong, lam, ca_kia, nghi, ghi_chu, by_id FROM quan_so WHERE user_id = ?', id3.An), R('S.screen')], [{ tong: 21, lam: 15, ca_kia: 0, nghi: '{"om":5,"khac":1}', ghi_chu: 'chăm bố ốm', by_id: id3.An }, 'home']);
    await vao('An', 'tieudoi');
    ok('báo xong: thẻ thành dòng "đã báo" kèm nút Sửa, không còn nút báo, không mời báo ca đêm', the().includes('Ca ngày ' + dm(ngay) + ': đã báo') && the().includes('data-a="qhsua"') && !the().includes('data-a="qhgui"') && !the().includes('data-a="qhsom"'));
    eq('báo rồi thì thôi nhắc', nhac(), []);
    R(`ACTIONS.qhsua({ v: '${ngay}:1' })`);
    eq('Sửa: điền lại đúng số đã báo, nút thành GỬI LẠI', [R('S.form.qhtong'), R('S.qsH.nghi'), R('S.form.qhnote'), the().includes('>GỬI LẠI CA NGÀY ' + dm(ngay) + '<'), the().includes('data-a="qhthoi"')], ['21', { om: 5, khac: 1 }, 'chăm bố ốm', true, true]);
    go_('qhn_khac', '0');
    R(`S.form.qhnote = ''; ACTIONS.qhgui({ v: '${ngay}:1' })`); await cho();
    eq('gửi lại', S3.one('SELECT lam, nghi, ghi_chu FROM quan_so WHERE user_id = ?', id3.An), { lam: 16, nghi: '{"om":5}', ghi_chu: null });
    await vao('An', 'tieudoi');
    R(`S.boot.skew = S.boot.qs.den - Date.now() + 60e3`);
    eq('sang ca đêm: tổ ca ngày không bị nhắc, thẻ không có nút báo ca đêm', [nhac(), the().includes('data-a="qhgui"')], [[], false]);
    R('S.boot.skew = 0');

    // hôm sau
    advance(864e5);
    const mai = vnDay();
    await vao('An', 'tieudoi');
    ok('hôm sau: tổng quân số điền sẵn 21 trên cùng dòng với số nghỉ, có nút "Như hôm qua"; ngày đủ quân không bày dòng tóm tắt thừa', the().includes('Tổ <b>21</b> người') && the().includes('nghỉ: <b id="qhnt">không ai</b>') && the().includes('Như hôm qua: 5 ốm') && !the().includes('id="qhtong"') && !the().includes('id="qhprev"'));
    eq('"Như hôm qua" KHÔNG điền sẵn', R('qhTinh().nghi'), 0);
    R('ACTIONS.qhnhu()');
    eq('bấm "Như hôm qua": lấy lại 5 người ốm', [R('S.qsH.nghi'), R('qhTinh().lam')], [{ om: 5 }, 16]);
    R(`ACTIONS.qhgui({ v: '${mai}:1' })`); await cho();
    eq('2 chạm là báo xong ngày có người nghỉ như hôm qua', S3.one('SELECT lam, nghi FROM quan_so WHERE user_id = ? AND ngay = ?', id3.An, mai), { lam: 16, nghi: '{"om":5}' });
    advance(864e5);
    const mot = vnDay();
    await vao('An', 'tieudoi');
    R('ACTIONS.qhtong()');
    ok('nút Đổi tổng quân số mở ô gõ ngay trên thẻ, điền sẵn số cũ', the().includes('id="qhtong"') && R('S.form.qhtong') === '21');
    R('ACTIONS.qhthoi()');
    R(`ACTIONS.qhgui({ v: '${mot}:1' })`); await cho();
    eq('ngày đủ quân: MỘT chạm là báo xong', S3.one('SELECT lam, nghi FROM quan_so WHERE user_id = ? AND ngay = ?', id3.An, mot), { lam: 21, nghi: '{}' });

    /* ===== C. Mất sóng lúc bấm báo ===== */
    advance(864e5);
    const ba = vnDay();
    await vao('An', 'tieudoi');
    R('S.__matMang = true');
    R(`(() => { const goc = fetch; globalThis.__fetchGoc = goc; fetch = (u, o) => (S.__matMang && String(u).startsWith('/api/quanso') ? Promise.reject(new TypeError('Failed to fetch')) : goc(u, o)); })()`);
    R(`ACTIONS.qhgui({ v: '${ba}:1' })`); await cho();
    eq('mất sóng: chưa tới máy chủ, đã lưu trên máy', [S3.one('SELECT COUNT(*) n FROM quan_so WHERE ngay = ?', ba).n, R('qsHangDoi().length')], [0, 1]);
    ok('thẻ ghi "chờ gửi (mất sóng)", không giục báo lại', the().includes('chờ gửi (mất sóng)') && !the().includes('data-a="qhgui"') && nhac().length === 0);
    R('S.__matMang = false'); R('qsFlush()'); await cho(); await cho();
    eq('có mạng: tự gửi, hàng chờ trống', [S3.one('SELECT lam FROM quan_so WHERE user_id = ? AND ngay = ?', id3.An, ba).lam, R('qsHangDoi().length')], [21, 0]);
    R('fetch = globalThis.__fetchGoc');

    /* ===== D. Tổ ca đêm, tổ 2 ca, đổi ca, hết hạn ===== */
    await vao('Binh', 'tieudoi');
    go_('qhkt', '19');
    R(`ACTIONS.qhca({ v: '2' })`); await cho();
    eq('Binh tự khai báo: tổ 19 người, làm Ca đêm, đến khi đổi', [cfg().lich[id3.Binh].ca, cfg().lich[id3.Binh].den, cfg().lich[id3.Binh].tong, cfg().lich[id3.Binh].by], [2, null, 19, id3.Binh]);
    eq('tổng quân số tổ tự khai vào thẳng thẻ báo, không phải gõ lại', [R('S.boot.qs.toi.tong'), R('S.boot.qs.toi.lich.tong')], [19, 19]);
    ok('6h45, tổ ca đêm: không bị nhắc ca ngày, không có nút báo; thẻ nói ca đêm mở báo từ mấy giờ, có lối báo sớm', nhac().length === 0 && !the().includes('data-a="qhgui"') && the().includes('Ca đêm ' + dm(ba) + ': mở báo từ') && the().includes('data-a="qhsom"') && the().includes('Tổ làm ca đêm'), the().slice(0, 300));
    R('ACTIONS.qhsom()');
    ok('bấm Báo sớm: có nút BÁO CA ĐÊM', the().includes('>BÁO CA ĐÊM ' + dm(ba) + '<'));
    R('ACTIONS.qhthoi()');
    R(`S.boot.skew = S.boot.qs.den - Date.now() - 30 * 60e3`);
    ok('18h, một tiếng trước giờ vào ca: thẻ tự mở nút báo ca đêm và nhắc', /^Báo quân số ca đêm/.test(nhac()[0] || '') && the().includes('>BÁO CA ĐÊM ' + dm(ba) + '<'), nhac().join(' | '));
    R(`S.form.qhtong = '19'; ACTIONS.qhgui({ v: '${ba}:2' })`); await cho();
    eq('báo ca đêm: ghi vào đúng ca đêm', S3.one('SELECT ca, tong, lam, ca_kia FROM quan_so WHERE user_id = ? AND ngay = ?', id3.Binh, ba), { ca: 2, tong: 19, lam: 19, ca_kia: 0 });
    R('S.boot.skew = 0');

    // tổ làm cả 2 ca: báo từng ca một, mỗi ca ghi số người của tổ thuộc ca đó
    {
      const r0 = await S3.call('POST', '/users', { name: 'Em', phone: '0900000019', role: 'tieudoi' }, 'Admin');
      await S3.login('Em', '0900000019', r0.data.pin); await S3.call('POST', '/change-pin', { pin: r0.data.pin, newPin: '1357' }, 'Em');
      id3.Em = r0.data.id;
      const em = (n, ca) => S3.one('SELECT tong, lam, ca_kia, nghi FROM quan_so WHERE ngay = ? AND ca = ? AND user_id = ?', n, ca, id3.Em);
      await vao('Em', 'tieudoi');
      go_('qhkt', '19');
      R(`ACTIONS.qhca({ v: '3' })`); await cho();
      ok('tổ 2 ca, buổi sáng: MỘT nút báo ca ngày, có ô "Người của tổ làm ca ngày"', (the().match(/data-a="qhgui"/g) || []).length === 1 && the().includes('>BÁO CA NGÀY ' + dm(ba) + '<') && the().includes('Người của tổ làm ca ngày') && the().includes('id="qhbc"'), the().slice(0, 300));
      R(`S.form.qhtong = '19'`);
      ok('chưa ghi số người của ca: hướng dẫn, chưa gửi được', R('qhTinh().loi') === 'Ghi số người của tổ thuộc ca này.');
      R(`S.form.qhbc = '25'`);
      ok('số người của ca nhiều hơn tổng: báo lỗi', /nhiều hơn tổng quân số 19/.test(R('qhTinh().loi')));
      R(`S.form.qhbc = '9'; ACTIONS.qhmo(); ACTIONS.qhnghi({ k: 'om', v: '1' })`);
      eq('19 người, ca ngày 9, 1 ốm → đi làm 8', [R('qhTinh().lam'), R('qhPrevTxt(qhTinh())')], [8, 'Đi làm 8/9 · nghỉ 1: 1 ốm']);
      R(`ACTIONS.qhgui({ v: '${ba}:1' })`); await cho();
      eq('báo ca ngày của tổ 2 ca: 10 người còn lại thuộc ca đêm', em(ba, 1), { tong: 19, lam: 8, ca_kia: 10, nghi: '{"om":1}' });
      await vao('Em', 'tieudoi');
      ok('báo xong ca ngày: thẻ nói ca đêm mở báo lúc nào, chưa bày nút', the().includes('Ca ngày ' + dm(ba) + ': đã báo') && the().includes('Ca đêm ' + dm(ba) + ': mở báo từ') && !the().includes('data-a="qhgui"'));
      R(`S.boot.skew = S.boot.qs.den - Date.now() - 30 * 60e3`);
      ok('18h: thẻ mở nút báo ca đêm, hỏi số người ca đêm', the().includes('>BÁO CA ĐÊM ' + dm(ba) + '<') && the().includes('Người của tổ làm ca đêm'));
      R(`S.form.qhbc = '10'; ACTIONS.qhmo(); ACTIONS.qhnghi({ k: 'gd', v: '1' }); ACTIONS.qhgui({ v: '${ba}:2' })`); await cho();
      eq('báo ca đêm của tổ 2 ca', em(ba, 2), { tong: 19, lam: 9, ca_kia: 9, nghi: '{"gd":1}' });
      R('S.boot.skew = 0');
      advance(864e5);
      await vao('Em', 'tieudoi');
      eq('hôm sau: số người ca ngày điền sẵn 9 như lần trước, đủ quân là 1 chạm', [R('qhTinh().bc'), R('qhTinh().lam')], [9, 9]);
      advance(-864e5);
    }

    // đổi ca, và lịch hết hạn
    await vao('An', 'tieudoi');
    R('ACTIONS.qhdoica()');
    ok('Đổi ca: ba nút ca, ca đang làm tô đậm, có nút Thôi', the().includes('Đổi ca của tổ') && /class="btn pri"[^>]*data-a="qhca" data-v="1"/.test(the()) && the().includes('data-a="qhthoi"'));
    R(`ACTIONS.qhca({ v: '2' })`); await cho();
    eq('An đổi sang ca đêm, đến khi đổi', [cfg().lich[id3.An].ca, cfg().lich[id3.An].den, R('S.boot.qs.to[0].ca')], [2, null, [2]]);
    await lich('An', { ca: 1, den: cong(ba, 2) });
    advance(3 * 864e5);
    await vao('An', 'tieudoi');
    ok('lịch ca hết hạn: thẻ hỏi lại ca', R('S.boot.qs.toi.lich.het') === true && the().includes('Lịch ca đã hết hạn. Tổ làm ca nào?'));
    advance(-3 * 864e5);
    await lich('An', { ca: 1 });

    /* ===== E. SỐ THIẾT LẬP: CVKTHT trở lên, chặn hai người ghi đè nhau ===== */
    eq('Tiểu đội trưởng không đặt được số thiết lập', (await tlap('An', { user: id3.An, tong: 21, s1: 21, s2: 0, ts: 0 })).status, 403);
    eq('ca ngày + ca đêm nhiều hơn tổng / tổ không có: từ chối', [(await tlap('Cv', { user: id3.An, tong: 21, s1: 15, s2: 10, ts: 0 })).status, (await tlap('Cv', { user: 99999, tong: 21, s1: 21, ts: 0 })).status], [400, 400]);
    const t1 = await tlap('Cv', { user: id3.An, tong: 21, s1: 21, s2: 0, ts: 0 });
    eq('Cv đặt số thiết lập tổ An', [t1.status, cfg().tl[id3.An].tong, cfg().tl[id3.An].s1, cfg().tl[id3.An].by], [200, 21, 21, id3.Cv]);
    const t2 = await tlap('Trung', { user: id3.An, tong: 25, s1: 25, s2: 0, ts: 0 });
    eq('Trung lưu dựa trên bản cũ (chưa thấy số Cv vừa đặt): từ chối', [t2.status, t2.data.code, cfg().tl[id3.An].tong], [409, 'changed', 21]);
    ok('và được báo rõ ai vừa sửa, số mới là gì', /^Cv vừa sửa số thiết lập tổ An: tổng 21, ca ngày 21, ca đêm 0\./.test(t2.data.error), t2.data.error);
    eq('Trung lưu lại sau khi đã thấy số của Cv: được', (await tlap('Trung', { user: id3.An, tong: 22, s1: 22, s2: 0, ts: t1.data.ts })).status, 200);
    eq('hai người đặt HAI tổ khác nhau không đè nhau; lịch ca vẫn còn nguyên', [(await tlap('Cv', { user: id3.Binh, tong: 19, s1: 0, s2: 19, ts: 0 })).status, cfg().tl[id3.An].tong, cfg().tl[id3.Binh].s2, cfg().lich[id3.An].ca, cfg().lich[id3.Binh].ca], [200, 22, 19, 1, 2]);
    // CẢ BẢNG trong MỘT request (nút Lưu tất cả): hoặc ghi hết, hoặc không ghi gì
    const tsTl = (ten) => cfg().tl[id3[ten]].ts;
    const nhieu = await tlap('Cv', { ds: [{ user: id3.An, tong: 23, s1: 23, s2: 0, ts: tsTl('An') }, { user: id3.Binh, tong: 20, s1: 0, s2: 20, ts: tsTl('Binh') }] });
    eq('lưu hai tổ trong một request', [nhieu.status, nhieu.data.n, cfg().tl[id3.An].tong, cfg().tl[id3.Binh].tong], [200, 2, 23, 20]);
    const hong = await tlap('Cv', { ds: [{ user: id3.An, tong: 24, s1: 24, s2: 0, ts: tsTl('An') }, { user: id3.Binh, tong: 21, s1: 0, s2: 21, ts: 1 }] });
    eq('một tổ đã bị người khác sửa trước: từ chối CẢ lần lưu, nói rõ tổ nào, không ghi dở tổ nào', [hong.status, /sửa số thiết lập tổ Binh/.test(hong.data.error), cfg().tl[id3.An].tong, cfg().tl[id3.Binh].tong], [409, true, 23, 20]);
    eq('một mục sai số (ca ngày + ca đêm > tổng): từ chối cả lần lưu', [(await tlap('Cv', { ds: [{ user: id3.An, tong: 25, s1: 25, s2: 0, ts: tsTl('An') }, { user: id3.Binh, tong: 20, s1: 15, s2: 10, ts: tsTl('Binh') }] })).status, cfg().tl[id3.An].tong], [400, 23]);
    eq('đặt ca hộ trong cùng request: giữ nguyên tổng tổ tự khai; danh sách rỗng thì từ chối', [(await tlap('Cv', { ds: [{ user: id3.Binh, ca: 2 }] })).status, cfg().lich[id3.Binh].ca, cfg().lich[id3.Binh].tong, cfg().lich[id3.Binh].by, (await tlap('Cv', { ds: [] })).status], [200, 2, 19, id3.Cv, 400]);
    // trả lại số như trước cho các kiểm tra sau
    await tlap('Cv', { ds: [{ user: id3.An, tong: 22, s1: 22, s2: 0, ts: tsTl('An') }, { user: id3.Binh, tong: 19, s1: 0, s2: 19, ts: tsTl('Binh') }] });

    /* ===== F. CVKTHT: hai thẻ Tổ báo / Thiết lập ===== */
    S3.raw.exec(`DELETE FROM quan_so WHERE ngay >= '${ba}'`);
    await S3.call('PUT', '/quanso', { ngay: ba, ca: 1, tong: 21, lam: 19, nghi: { om: 2 } }, 'An');
    await vao('Cv', 'cvktht');
    eq('Tổng quan của Cv chỉ đếm tổ làm ca ngày: An đã báo, Em (2 ca) chưa báo; Binh ca đêm không tính', nhac(), ['1/2 tổ chưa báo quân số ca ngày ' + dm(ba), 'Em · hạn báo ' + R('hhmm(S.boot.qs.han)') + ' · bấm để nhắc']);
    ok('thẻ nhắc tổ chưa báo mở màn báo cáo ca (bước 1 ở đó); Thêm của CVKTHT chỉ còn một mục', R('vHome()').includes('data-a="nav" data-s="baocaoca"') && R('vMore()').includes('data-s="baocaoca"') && !R('vMore()').includes('data-s="quanso"'));
    R(`ACTIONS.nav({ s: 'baocaoca' })`); await cho();
    const b1 = R('vBaoCaoCa()');
    ok('một màn đọc từ trên xuống: thanh trên có số tổ đã báo (chạm tới mục 3) và MỘT nút chép cả báo cáo; không dải bước, không thẻ Tổ báo / Thiết lập riêng', /data-a="bcden" data-v="3">[^<]*Tổ đã báo 1\/2</.test(b1) && (b1.match(/data-a="bcchep">/g) || []).length === 1 && !b1.includes('1 · Tổ báo') && !b1.includes('data-a="qstab"'));
    ok('bước 1 chỉ xem — không có nút ghi thay, không mở ô ghi của tổ', !b1.includes('data-a="qsmo"') && !b1.includes('data-a="qsnhanh"'));
    ok('tổng hợp và số tổ đã báo chỉ tính tổ làm ca này', R('bcQuanSo(S.bcc).lam') === 19 && b1.includes('Tổ đã báo 1/2<'));
    ok('từng tổ chỉ nằm ở mục 3, mỗi dòng kèm nhãn: An đã báo, Em chưa báo, Binh (làm ca đêm) xuống cuối không nhãn; không có thanh nút ở đáy', /Tổ An: [^<]*<\/span><span class="badge ok"[^>]*>Đã báo</.test(b1) && /Tổ Em: chưa báo quân số ca ngày<\/span><span class="badge (warn|bad)"/.test(b1) && /Tổ Binh \(làm ca đêm\)<\/span><\/div>/.test(b1) && b1.indexOf('Tổ Em:') < b1.indexOf('Tổ Binh (làm ca đêm)') && !b1.includes('sendbar'));
    ok('tổ chưa báo: thanh trên đếm, tên tổ nêu ở dòng của tổ trong mục 3 kèm nhãn', /(Chưa báo|Quá hạn): 1 tổ · /.test(b1) && /Tổ Em[^<]*<\/span><span class="badge (warn|bad)"/.test(b1));
    // năm số của bước 1 cộng lại đúng bằng tổng: An 19 đi làm + 2 nghỉ, Binh 19 người ca đêm, Em 19 người (tổ tự khai) chưa báo
    ok('tổng hợp cộng đủ: Tổng 59 = Đi làm 19 + Nghỉ 2 + Ca đêm 19 + Chưa báo 19', R('JSON.stringify((({ tong, lam, nghi, kiaSo, chuaSo }) => [tong, lam, nghi, kiaSo, chuaSo])(bcQuanSo(S.bcc)))') === '[59,19,2,19,19]', R('JSON.stringify(bcQuanSo(S.bcc))'));
    ok('nút nhắc tổ chưa báo nằm ở mục 3 (ca đang diễn ra)', /id="bcb3"[\s\S]*?data-a="bcnhac"/.test(b1));
    R('ACTIONS.bcnhac()'); await cho();
    ok('chép tin nhắc: chỉ nhắc tổ làm ca này mà chưa báo', new RegExp('^Các tổ chưa báo quân số ca ngày ' + dm(ba) + ' \\(hạn 07:00\\):\\n• Tổ Em\\nTổ trưởng mở app').test(String(R('__chep'))), String(R('__chep')));
    R('ACTIONS.bctl()'); await cho();
    const b2 = R('vQuanSo()');
    ok('nút bánh răng mở bảng Thiết lập (không còn thẻ Tổ báo ở đây), nút quay lại về báo cáo ca', R('S.screen') === 'quanso' && !b2.includes('data-a="qstab"') && b2.includes('data-a="nav" data-s="baocaoca"'));
    ok('thẻ Thiết lập là bảng gọn: mỗi tổ một dòng có ô chọn ca và ô số, MỘT nút Lưu tất cả ở đáy, ghi ai sửa gần nhất', b2.includes('id="tl_' + id3.An + '_c"') && b2.includes('id="tl_' + id3.An + '_t"') && (b2.match(/data-a="qstlluu"/g) || []).length === 1 && /class="sendbar"><button[^>]*data-a="qstlluu"/.test(b2) && /Sửa gần nhất: (Cv · tổ (Binh|An)|Trung · tổ An)/.test(b2), (b2.match(/Sửa gần nhất[^<]*/) || [''])[0]);
    ok('ô của ca tổ không làm thì khoá: tổ ca ngày khoá ô Đêm, tổ ca đêm khoá ô Ngày, tổ 2 ca mở cả hai', new RegExp('id="tl_' + id3.An + '_2"[^>]*disabled').test(b2) && !new RegExp('id="tl_' + id3.An + '_1"[^>]*disabled').test(b2) && new RegExp('id="tl_' + id3.Binh + '_1"[^>]*disabled').test(b2) && !new RegExp('id="tl_' + id3.Em + '_[12]"[^>]*disabled').test(b2));
    R(`S.form['tl_${id3.Em}_t'] = '19'; S.form['tl_${id3.Em}_1'] = '9'; S.form['tl_${id3.Em}_2'] = '10'; ACTIONS.qstlluu()`); await cho();
    eq('Cv lưu số thiết lập tổ Em trên màn hình', [cfg().tl[id3.Em].tong, cfg().tl[id3.Em].s1, cfg().tl[id3.Em].s2], [19, 9, 10]);
    // người khác sửa tổ An trong lúc Cv đang mở màn: Cv lưu thì bị từ chối, màn hình tải số mới
    await tlap('Trung', { user: id3.An, tong: 30, s1: 30, s2: 0, ts: cfg().tl[id3.An].ts });
    R(`S.form['tl_${id3.An}_t'] = '24'; ACTIONS.qstlluu()`); await cho();
    eq('Cv lưu đè số Trung vừa đặt: từ chối, giữ số của Trung, màn hình tải lại số mới', [cfg().tl[id3.An].tong, R(`S.qs.tl[${id3.An}].tong`), R(`S.form['tl_${id3.An}_t']`), /Trung vừa sửa số thiết lập tổ An/.test(R('S.toast'))], [30, 30, undefined, true]);
    R(`S.form['tl_${id3.Em}_c'] = '1'; ACTIONS.qstlluu()`); await cho();
    // tổ đang chia hai ca (9 / 10) chuyển sang chỉ ca ngày: cả tổ làm ca ngày, không để 10 người không thuộc ca nào
    eq('Cv đổi ca tổ Em trong bảng rồi Lưu tất cả: đặt ca hộ, cả tổ sang ca ngày, ô ca đêm về 0', [cfg().lich[id3.Em].ca, cfg().lich[id3.Em].by, cfg().tl[id3.Em].s1, cfg().tl[id3.Em].s2], [1, id3.Cv, 19, 0]);
    await tlap('Cv', { user: id3.Em, tong: 19, s1: 9, s2: 10, ts: cfg().tl[id3.Em].ts });
    R('ACTIONS.qstlluu()'); await cho();
    ok('không sửa gì mà bấm Lưu tất cả: báo không có gì thay đổi', /Không có gì thay đổi/.test(R('S.toast')), R('S.toast'));
    await lich('Cv', { user: id3.Em, ca: 3 });
    ok('hạn báo thu gọn thành một dòng ở thẻ Thiết lập', R('vQuanSo()').includes('Hạn báo: ca ngày trước 07:00, ca đêm trước 19:15') && !R('vQuanSo()').includes('id="qsh1"'));
    R('ACTIONS.qshanmo()');
    ok('bấm Đổi mới hiện ô giờ', /id="qsh1"[^>]*value="07:00"/.test(R('vQuanSo()')));
    R(`S.form.qsh1 = '07:15'; S.form.qsh2 = '19:30'; ACTIONS.qshan()`); await cho();
    eq('lưu hạn báo mới', R('S.qs.hanPhut'), [435, 1170]);
    await S3.call('PUT', '/quanso/han', { ca1: 420, ca2: 1155 }, 'Cv');
    // xếp thứ tự tổ
    R(`ACTIONS.nav({ s: 'quanso' })`); await cho();
    R(`ACTIONS.qssxmo()`);
    ok('xếp thứ tự: mỗi tổ có nút Lên / Xuống', R('vQuanSo()').includes('data-a="qssx"') && R('vQuanSo()').includes('data-a="qssxluu"'));
    R(`ACTIONS.qssx({ id: '${id3.Em}', v: '-1' }); ACTIONS.qssx({ id: '${id3.Em}', v: '-1' }); ACTIONS.qssxluu()`); await cho();
    eq('lưu thứ tự: Em lên đầu; lịch ca và số thiết lập không bị đè', [R('S.qs.tdt.map((u) => u.name)'), cfg().lich[id3.An].ca, cfg().tl[id3.An].tong], [['Em', 'An', 'Binh'], 1, 30]);
    eq('Tiểu đội trưởng không xếp được thứ tự', (await S3.call('PUT', '/quanso/thutu', { ids: [id3.An] }, 'An')).status, 403);
    // qua hạn báo mà chưa chép báo cáo ca: thẻ nhắc soạn báo cáo ở Tổng quan
    await vao('Cv', 'cvktht');
    R('S.boot.skew = 30 * 60e3');
    ok('qua hạn báo, còn tổ chưa báo: MỘT thẻ quân số (không tách thẻ soạn báo cáo riêng), mời nhắc hoặc soạn báo cáo', (R('vHome()').match(/quân số/g) || []).length === 1 && /1\/2 tổ chưa báo quân số ca ngày [^<]*, đã quá hạn/.test(R('vHome()')) && R('vHome()').includes('bấm để nhắc hoặc soạn báo cáo ca') && !R('vHome()').includes('ghi thay'), (R('vHome()').match(/<b style="font-size:18px">[^<]*quân số[^<]*/g) || []).join(' | '));
    await S3.call('PUT', '/baocao', { ngay: ba, ca: 1, van_ban: 'x' }, 'Cv');
    eq('chép báo cáo ca không đè lịch ca, số thiết lập, thứ tự tổ', [cfg().lich[id3.An].ca, cfg().tl[id3.Em].s2, cfg().thu_tu[0]], [1, 10, id3.Em]);
    await vao('Cv', 'cvktht');
    R('S.boot.skew = 30 * 60e3');
    ok('đã chép báo cáo ca thì thẻ thôi mời soạn', !R('vHome()').includes('soạn báo cáo ca'));
    R('S.boot.skew = 0');
    await vao('Trung', 'trungdoi');
    eq('cấp chỉ huy không bị nhắc việc gom quân số', nhac(), []);
    // nhật ký
    const a = S3.one("SELECT ts, user_name, action, detail FROM audit WHERE action = 'qs_thietlap' ORDER BY id DESC");
    eq('nhật ký đọc được lần đặt số thiết lập và lần đặt ca', [R(`fmtAudit(${JSON.stringify(a)}).text`), /^đặt ca cho tổ Em: cả 2 ca, đến khi đổi$/.test(R(`fmtAudit(${JSON.stringify(S3.one("SELECT ts, user_name, action, detail FROM audit WHERE action = 'qs_lich' ORDER BY id DESC"))}).text`))],
      ['đặt số thiết lập tổ Em: tổng 19, ca ngày 9, ca đêm 10', true]);
  }

  const fail = T.filter((x) => x[0] === 'FAIL');
  console.log(T.map((x) => x[0] + ' | ' + x[1] + (x[2] && x[0] === 'FAIL' ? '  [' + x[2] + ']' : '')).join('\n'));
  console.log('\n=== ' + T.length + ' kiểm tra, ' + fail.length + ' lỗi ===');
  process.exit(fail.length ? 1 : 0);
}
main().catch((e) => { console.error('CRASH', e); process.exit(2); });
