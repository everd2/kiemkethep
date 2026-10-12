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
  eq('màn hình cũng biết để khỏi bày nút gửi', (await xem('An', `?ngay=${D}&ca=1`)).suaDuoc, false);
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
  eq('bootstrap của An: ca ngày hôm nay, chỉ tổ mình, chưa báo', [bA.hien, bA.to], [{ ngay: D1, ca: 1 }, [{ id: U.An, name: 'An', da: false, daKe: false, ca: [1] }]]);
  await ghi('An', { ngay: D1, ca: 1, tong: 21, lam: 21 });
  await ghi('Binh', { ngay: D1, ca: 2, tong: 19, lam: 19 });
  const bC = (await S.call('GET', '/bootstrap', undefined, 'Cv')).data.qs;
  eq('bootstrap của Cv: mọi tổ, đúng ai báo ca nào', bC.to, [{ id: U.An, name: 'An', da: true, daKe: false, ca: [1] }, { id: U.Binh, name: 'Binh', da: false, daKe: true, ca: [2] }]);
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
  eq('nhưng xem lại thì được, và nói rõ chỉ xem', [(await S.call('GET', `/quanso?ngay=${cong(D1, -9)}&ca=1`, undefined, 'Cv')).status, (await xem('Cv', `?ngay=${cong(D1, -9)}&ca=1`)).suaDuoc], [200, false]);

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
    const ctx = {
      console, Date, Math, JSON, String, Number, Object, Array, Set, Map, parseInt, parseFloat, isNaN, Promise, RegExp, Error, TypeError, encodeURIComponent,
      setTimeout: () => 0, clearTimeout: () => {},
      localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; }, key: () => null, get length() { return 0; } },
      navigator: { onLine: true },
      history: { state: null, pushState() {}, replaceState() {} },
      document: { activeElement: null, hidden: false, body: { appendChild() {}, removeChild() {} }, createElement: el, getElementById: () => el(), querySelectorAll: () => [], addEventListener() {} },
      window: { addEventListener() {} },
      fetch: async (url, o = {}) => {
        if (!String(url).startsWith('/api/quanso') && !String(url).startsWith('/api/bootstrap')) return new Promise(() => {}); // /me lúc khởi động, /app.js: để treo
        const r = await S3.call(o.method || 'GET', String(url).replace(/^\/api/, ''), o.body ? JSON.parse(o.body) : undefined, who);
        return { ok: r.status < 400, status: r.status, json: async () => r.data, headers: { get: () => null } };
      },
      URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
    };
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(readFileSync(path.join(ROOT, 'public/app.js'), 'utf8'), ctx, { filename: 'app.js' });
    const R = (src) => vm.runInContext(src, ctx);
    const cho = async () => { for (let i = 0; i < 200; i++) { await new Promise((r) => setImmediate(r)); if (!R('S.busy') && i > 40) return; } };
    const vao = async (name, role) => {
      who = name;
      const bt = (await S3.call('GET', '/bootstrap', undefined, name)).data;
      R(`S.boot = ${JSON.stringify(bt)}; indexBoot(S.boot); S.me = ${JSON.stringify({ id: id3[name], name, role })}; S.ask = null; S.form = {}; S.qs = null; S.qsCa = null; S.qsF = null; S.screen = 'home';`);
    };
    const nhac = () => (R('vHome()').match(/<b style="font-size:18px">([^<]*quân số[^<]*)<\/b><span class="sm">([^<]*)</) || []).slice(1);
    const cua = (uid, ca = 1) => S3.one('SELECT tong, lam, ca_kia, nghi, by_id FROM quan_so WHERE ngay = ? AND ca = ? AND user_id = ?', ngay, ca, uid);

    await vao('An', 'tieudoi');
    ok('6h45, trước hạn 7h: Tổng quan của An nhắc vàng chưa báo quân số ca ngày, có giờ hạn', /^Chưa báo quân số ca ngày/.test(nhac()[0] || '') && (nhac()[1] || '').startsWith('Hạn báo ' + R('hhmm(S.boot.qs.han)')) && /class="alertbtn warn"[^>]*data-s="quanso"/.test(R('vHome()')), nhac().join(' | '));
    R('S.boot.skew = 30 * 60e3');
    ok('7h15, quá hạn: thẻ chuyển đỏ', /^Quá hạn báo quân số ca ngày/.test(nhac()[0] || '') && /class="alertbtn bad"[^>]*data-s="quanso"/.test(R('vHome()')), nhac().join(' | '));
    R('S.boot.skew = 0');
    ok('thẻ nhắc mở màn Quân số', R('vHome()').includes('data-a="nav" data-s="quanso"'));
    R(`ACTIONS.nav({ s: 'quanso' })`); await cho();
    eq('vào màn Quân số: PHẢI chọn ca trước, app không tự mở ô ghi', [R('S.screen'), R('S.qsF'), R('S.qsCa')], ['quanso', null, null]);
    const chon = R('vQuanSo()');
    ok('màn chọn ca: hai thẻ ca ngày và ca đêm, ca ngày đứng trên, có hạn báo, chưa có nút gửi', chon.split('data-a="qsca"').length === 3 && chon.indexOf('Ca ngày') < chon.indexOf('Ca đêm') && chon.includes('báo trước ' + R('hhmm(S.qs.chon[0].han)')) && !chon.includes('data-a="qsgui"'), chon.slice(0, 300));
    R(`ACTIONS.qsca({ v: '${ngay}:1' })`); await cho();
    eq('chọn ca ngày: mở ô ghi của tổ mình', [R('S.screen'), R('S.qsF.uid'), R('S.qs.ca'), R('S.form.qstong')], ['quanso', id3.An, 1, '']);
    ok('có nút gửi đứng yên ở đáy và nút cả tổ không làm ca này', /class="sendbar">.*data-a="qsgui"/s.test(R('vQuanSo()')) && R('vQuanSo()').includes('data-a="qskhong"'));
    R('ACTIONS.qsgui()'); await cho();
    eq('chưa ghi tổng quân số: chưa gửi', S3.one('SELECT COUNT(*) n FROM quan_so').n, 0);
    R(`S.form.qstong = '21'`);
    eq('gõ tổng 21, chưa ai nghỉ: đi làm tự ra 21', R('qsTinh()'), { tong: 21, nghi: 0, lam: 21, kia: 0, loi: '' });
    R(`ACTIONS.qsnghi({ k: 'om', v: '1' }); ACTIONS.qsnghi({ k: 'om', v: '1' }); ACTIONS.qsnghi({ k: 'off', v: '1' }); ACTIONS.qsnghi({ k: 'que', v: '1' }); ACTIONS.qsnghi({ k: 'que', v: '-1' }); ACTIONS.qsnghi({ k: 'que', v: '-1' })`);
    eq('bấm + / − theo lý do: số nghỉ là tổng các lý do, đi làm giảm theo', [R('S.qsF.nghi'), R('qsTinh().lam'), R('qsPrevTxt(qsTinh())')], [{ om: 2, off: 1 }, 18, 'Đi làm ca ngày 18/21 · nghỉ 3']);
    R(`ACTIONS.qsnghi({ k: 'khac', v: '1' }); ACTIONS.qsgui()`); await cho();
    eq('có "lý do khác" mà chưa ghi rõ: chưa gửi', S3.one('SELECT COUNT(*) n FROM quan_so').n, 0);
    R(`ACTIONS.qsnghi({ k: 'khac', v: '-1' }); ACTIONS.qsgui()`); await cho();
    eq('gửi: server ghi đúng số', cua(id3.An), { tong: 21, lam: 18, ca_kia: 0, nghi: '{"om":2,"off":1}', by_id: id3.An });
    ok('gửi xong ở lại màn, báo đã báo lúc mấy giờ, nút thành gửi lại', R('S.screen') === 'quanso' && R('vQuanSo()').includes('Đã báo lúc') && R('vQuanSo()').includes('GỬI LẠI QUÂN SỐ'));
    eq('ô ghi điền lại đúng số vừa báo', [R('S.form.qstong'), R('S.qsF.nghi'), R('qsTinh().lam')], ['21', { om: 2, off: 1 }, 18]);
    await vao('An', 'tieudoi');
    eq('báo rồi thì Tổng quan thôi nhắc', nhac(), []);
    eq('bootstrap biết tổ An đang làm ca ngày (theo lần báo gần nhất)', R('S.boot.qs.to[0].ca'), [1]);
    R(`S.boot.skew = S.boot.qs.den - Date.now() + 60e3`);
    eq('sang ca đêm: tổ ca ngày KHÔNG bị nhắc báo ca đêm', nhac(), []);
    R('S.boot.skew = 0');
    await vao('Binh', 'tieudoi');
    R(`S.boot.skew = S.boot.qs.den - Date.now() - 30 * 60e3`);
    const hai = R('vHome()').match(/<b style="font-size:18px">[^<]*quân số[^<]*<\/b>/g) || [];
    ok('tổ chưa báo lần nào, 18h: nhắc cả ca ngày (quá hạn) lẫn ca đêm sắp tới', hai.length === 2 && /Quá hạn báo quân số ca ngày/.test(hai[0]) && /Chưa báo quân số ca đêm/.test(hai[1]), hai.join(' | '));
    R(`S.boot.skew = S.boot.qs.den - Date.now() + 60e3`);
    ok('app nằm mở qua giờ giao ca: nhắc theo ca đêm, không theo ca cũ', /^Chưa báo quân số ca đêm/.test(nhac()[0] || ''), nhac().join(' | '));
    R('S.boot.skew = 0');

    // tổ chia hai ca: Binh gõ đè số đi làm ca ngày, phần còn lại là người của ca đêm
    await vao('Binh', 'tieudoi');
    R(`ACTIONS.nav({ s: 'quanso' })`); await cho();
    R(`ACTIONS.qsca({ v: '${ngay}:1' })`); await cho();
    R(`S.form.qstong = '19'; ACTIONS.qsnghi({ k: 'om', v: '1' }); S.qsF.lamTay = true; S.form.qslam = '8'`);
    eq('gõ đè đi làm 8: còn lại 10 người thuộc ca đêm', [R('qsTinh()'), R('qsPrevTxt(qsTinh())')], [{ tong: 19, nghi: 1, lam: 8, kia: 10, loi: '' }, 'Đi làm ca ngày 8/19 · nghỉ 1 · ca đêm 10']);
    R(`ACTIONS.qsnghi({ k: 'gd', v: '1' })`);
    eq('bấm thêm một người nghỉ: đi làm giảm còn 7, ca đêm giữ 10', [R('qsTinh().lam'), R('qsTinh().kia'), R('S.form.qslam')], [7, 10, undefined]);
    R(`ACTIONS.qsnghi({ k: 'gd', v: '-1' }); S.qsF.lamTay = true; S.form.qslam = '25'`);
    ok('gõ đi làm nhiều hơn tổng: báo lỗi, không gửi', /nhiều hơn tổng quân số 19/.test(R('qsTinh().loi')));
    R('ACTIONS.qsgui()'); await cho();
    eq('server chưa nhận gì của Binh', S3.one('SELECT COUNT(*) n FROM quan_so WHERE user_id = ?', id3.Binh).n, 0);
    R(`S.form.qslam = '8'; ACTIONS.qsgui()`); await cho();
    eq('gửi ca ngày của tổ chia ca', cua(id3.Binh), { tong: 19, lam: 8, ca_kia: 10, nghi: '{"om":1}', by_id: id3.Binh });
    R(`ACTIONS.qsca({ v: '${ngay}:2' })`); await cho();
    eq('chuyển sang báo ca đêm: tổng và số người thuộc ca đêm điền sẵn theo dòng ca ngày', [R('S.qs.ca'), R('S.form.qstong'), R('qsTinh()')], [2, '19', { tong: 19, nghi: 0, lam: 10, kia: 9, loi: '' }]);
    R(`ACTIONS.qsnghi({ k: 'gd', v: '1' }); ACTIONS.qsgui()`); await cho();
    eq('báo ca đêm: 9 đi làm, 1 việc gia đình', cua(id3.Binh, 2), { tong: 19, lam: 9, ca_kia: 9, nghi: '{"gd":1}', by_id: id3.Binh });
    ok('Tiểu đội trưởng không có nút lùi ca trước, không thấy tổ khác', !R('vQuanSo()').includes('Ca trước') && !R('vQuanSo()').includes('data-a="qsmo"'));

    // CVKTHT: bảng mọi tổ, dòng tổng, ghi thay
    S3.raw.exec(`DELETE FROM quan_so WHERE user_id = ${id3.Binh}`);
    await vao('Cv', 'cvktht');
    eq('Tổng quan của Cv: 1/2 tổ chưa báo, kèm tên và hạn báo', nhac(), ['1/2 tổ chưa báo quân số ca ngày ' + ngay.slice(8) + '/' + ngay.slice(5, 7), 'Binh · hạn báo ' + R('hhmm(S.boot.qs.han)') + ' · bấm để xem hoặc ghi thay']);
    R('S.boot.skew = 30 * 60e3');
    ok('quá hạn: thẻ của Cv chuyển đỏ và nói đã quá hạn', / đã quá hạn$/.test(nhac()[0] || '') && /class="alertbtn bad"[^>]*data-s="quanso"/.test(R('vHome()')), nhac().join(' | '));
    R('S.boot.skew = 0');
    R(`ACTIONS.nav({ s: 'quanso' })`); await cho();
    const bang = R('vQuanSo()');
    ok('bảng quân số: dòng tổng đi làm / tổng quân số, số tổ đã báo', bang.includes('Đi làm ca ngày: 18 / 21 công nhân') && bang.includes('1/2 tổ đã báo'), (bang.match(/Đi làm ca ngày[^<]*/) || [''])[0]);
    ok('mỗi tổ một thẻ: tổ đã báo đọc thành câu, tổ chưa báo có nhãn', bang.includes('Đi làm 18/21 · nghỉ 3: 2 ốm, 1 OFF luân phiên') && bang.includes('Chưa báo') && bang.includes('Tổ Binh'));
    R(`ACTIONS.qsmo({ id: '${id3.Binh}' })`); await cho();
    eq('chạm tổ Binh: mở ô ghi thay', [R('S.screen'), R('S.qsF.uid')], ['qsform', id3.Binh]);
    ok('ô ghi thay ghi rõ tên tổ', R('vQsForm()').includes('<h1>Tổ Binh</h1>'));
    R(`S.form.qstong = '19'; ACTIONS.qskhong()`); await cho();
    eq('bấm "cả tổ không làm ca này": ghi luôn, người ghi là Cv', cua(id3.Binh), { tong: 19, lam: 0, ca_kia: 19, nghi: '{}', by_id: id3.Cv });
    eq('ghi xong về lại bảng', [R('S.screen'), R('S.qsF')], ['quanso', null]);
    const bang2 = R('vQuanSo()');
    ok('bảng: tổ Binh làm ca đêm, có ghi ai ghi thay; tổng quân số gồm cả tổ đó', bang2.includes('Làm ca đêm') && bang2.includes('Cv ghi thay') && bang2.includes('Đi làm ca ngày: 18 / 40 công nhân') && bang2.includes('2/2 tổ đã báo'), (bang2.match(/Đi làm ca ngày[^<]*/) || [''])[0]);
    R(`ACTIONS.qsmo({ id: '${id3.An}' })`); await cho();
    R(`ACTIONS.qskhong()`); await cho();
    eq('tổ đã báo có người đi làm: bấm "cả tổ không làm" thì hỏi lại, chưa ghi', [!!R('S.ask'), cua(id3.An).lam], [true, 18]);
    R('ACTIONS.askno()'); await cho();
    eq('bấm Quay lại: số đã báo giữ nguyên', cua(id3.An).lam, 18);
    R(`go('quanso')`); await cho();
    R(`ACTIONS.qsca({ v: '${cong(ngay, -1)}:2' })`); await cho();
    eq('Cv lùi về ca đêm hôm trước', [R('S.qs.ngay'), R('S.qs.ca'), R('S.qs.suaDuoc')], [cong(ngay, -1), 2, true]);
    await vao('Cv', 'cvktht');
    eq('mọi tổ đã báo: Tổng quan của Cv thôi nhắc', nhac(), []);
    /* Tổ làm cố định ca đêm: hôm qua Binh báo ca đêm, hôm nay chưa báo gì. Tổ đó không có việc phải báo ở ca
       ngày: Cv không bị nhắc, bảng ghi "làm ca đêm" chứ không ghi "chưa báo". */
    S3.raw.exec(`DELETE FROM quan_so WHERE user_id = ${id3.Binh}`);
    await S3.call('PUT', '/quanso', { ngay: cong(ngay, -1), ca: 2, user: id3.Binh, tong: 19, lam: 18, nghi: { om: 1 } }, 'Cv');
    await vao('Cv', 'cvktht');
    eq('tổ ca đêm chưa báo ca ngày: bootstrap biết tổ làm ca đêm, Cv không bị nhắc', [R('S.boot.qs.to.map((t) => t.ca)'), nhac()], [[[1], [2]], []]);
    R(`ACTIONS.nav({ s: 'quanso' })`); await cho();
    const bang3 = R('vQuanSo()');
    ok('bảng ca ngày: tổ Binh mang nhãn làm ca đêm, không tính là chưa báo', bang3.includes('Làm ca đêm') && !bang3.includes('>Chưa báo<') && bang3.includes('1/1 tổ đã báo · 1 tổ làm ca đêm') && bang3.includes('Đi làm ca ngày: 18 / 40 công nhân'), (bang3.match(/\d+\/\d+ tổ đã báo[^<]*/) || [''])[0]);
    await vao('Binh', 'tieudoi');
    eq('và chính tổ ca đêm cũng không bị nhắc báo ca ngày', nhac(), []);
    R(`ACTIONS.nav({ s: 'quanso' })`); await cho();
    ok('màn chọn ca của Binh nhắc lần báo gần nhất là ca đêm', R('vQuanSo()').includes('Lần báo gần nhất của tổ: ca đêm'));
    // hạn báo: Cv đổi ngay trên bảng quân số
    await vao('Cv', 'cvktht');
    R(`ACTIONS.nav({ s: 'quanso' })`); await cho();
    ok('bảng của Cv có ô đổi hạn báo, điền sẵn 07:00 và 19:15', /id="qsh1"[^>]*value="07:00"/.test(R('vQuanSo()')) && /id="qsh2"[^>]*value="19:15"/.test(R('vQuanSo()')));
    R(`S.form.qsh1 = '07:15'; S.form.qsh2 = '19:30'; ACTIONS.qshan()`); await cho();
    eq('lưu hạn báo mới', [S3.sql("SELECT key, value FROM settings WHERE key LIKE 'qs_han%' ORDER BY key"), R('S.qs.hanPhut')], [[{ key: 'qs_han1', value: '435' }, { key: 'qs_han2', value: '1170' }], [435, 1170]]);
    await vao('Trung', 'trungdoi');
    S3.raw.exec('DELETE FROM quan_so');
    await vao('Trung', 'trungdoi');
    eq('cấp chỉ huy không bị nhắc việc gom quân số', nhac(), []);
    ok('nhưng vào xem và ghi thay được', (() => { R(`ACTIONS.nav({ s: 'quanso' })`); return true; })());
    await cho();
    ok('bảng của Trung đội trưởng có đủ tổ', R('vQuanSo()').split('data-a="qsmo"').length === 3);
    // nhật ký đọc được dòng quân số
    await S3.call('PUT', '/quanso', { ngay, ca: 1, user: id3.An, tong: 21, lam: 8, nghi: { om: 2, khac: 1 }, ghi_chu: 'chăm bố ốm' }, 'Cv');
    const a = S3.one("SELECT ts, user_name, action, detail FROM audit WHERE action = 'qs_bao' ORDER BY id DESC");
    eq('nhật ký đọc dòng quân số thành câu, có chip lọc riêng', [R(`fmtAudit(${JSON.stringify(a)})`), R('vNhatKy()').includes('data-v="qs">Quân số')],
      [{ text: `ghi thay quân số tổ An, ca ngày ${ngay.split('-').reverse().join('/')}: đi làm 8/21, ca đêm 10, nghỉ 3 (2 ốm, 1 lý do khác) — chăm bố ốm`, type: 'qs', flag: false }, true]);
  }

  const fail = T.filter((x) => x[0] === 'FAIL');
  console.log(T.map((x) => x[0] + ' | ' + x[1] + (x[2] && x[0] === 'FAIL' ? '  [' + x[2] + ']' : '')).join('\n'));
  console.log('\n=== ' + T.length + ' kiểm tra, ' + fail.length + ' lỗi ===');
  process.exit(fail.length ? 1 : 0);
}
main().catch((e) => { console.error('CRASH', e); process.exit(2); });
