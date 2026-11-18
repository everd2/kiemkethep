// Battery of edit sequences expected to pass
import { dung, may, toi, advance, vnDay, eq, ok, ket, tick } from './lib.mjs';
toi(20, 0);
const { S, U } = await dung([['A', 'tieudoi'], ['B', 'tieudoi'], ['E', 'tieudoi'], ['CV', 'cvktht'], ['CV2', 'cvktht']]);
await S.call('PUT', '/quanso/lich', { ca: 1 }, 'A'); await S.call('PUT', '/quanso/thietlap', { user: U.A, ts: 0, ca: 1, tong: 12, s1: 12, s2: 0 }, 'CV');
await S.call('PUT', '/quanso/lich', { ca: 1 }, 'B'); await S.call('PUT', '/quanso/thietlap', { user: U.B, ts: 0, ca: 1, tong: 12, s1: 12, s2: 0 }, 'CV');
await S.call('PUT', '/quanso/lich', { ca: 2 }, 'E'); await S.call('PUT', '/quanso/thietlap', { user: U.E, ts: 0, ca: 2, tong: 10, s1: 0, s2: 10 }, 'CV');
for (let i = 0; i < 22; i++) { advance(864e5); toi(7, 5); await S.cron(); toi(19, 0); await S.cron(); }
const M = await may(S, U, 'CV'), M2 = await may(S, U, 'CV2');
const dd = (n) => vnDay(Date.now() - n * 864e5);
// 1. 20 days back
const D20 = dd(20), H21 = dd(21);
await M.moBc(D20, 1);
await M.sua(U.A, { t: '12', l: '5', n_om: '7' });
await M.sua(U.E, { t: '10', l: '4', n_que: '6' }, `${H21}|2`);
eq('1 20d back: day report', [M.dong('A'), M.dong('E')], ['Tổ A: ca ngày 5/12 cn, nghỉ 7 cn — 7 ốm', 'Tổ E (làm ca đêm): ca đêm 4/10 cn, nghỉ 6 cn — 6 về quê']);
eq('1 20d back: sản lượng', await M.sl(D20), [['A', 5], ['B', 12], ['E', 4]]);
await M.moBc(H21, 2);
eq('1 20d back: night report', M.dong('E'), 'Tổ E: ca đêm 4/10 cn, nghỉ 6 cn — 6 về quê');
// 2. sản lượng saved before edit
const D5 = dd(5);
await M.sl(D5);
M.R(`S.form['slc_${U.B}'] = '3'`); await M.R('slLuuNgam()'); await tick(50);
await M.moBc(D5, 1);
await M.sua(U.A, { t: '12', l: '8', n_om: '4' });
await M.sua(U.B, { t: '12', l: '9', n_om: '3' });
eq('2 saved sản lượng then edit: A follows, B keeps manual 3', await M.sl(D5), [['A', 8], ['B', 3], ['E', 10]]);
// 3. report chép before edit
const D6 = dd(6);
await M.moBc(D6, 1); M.R('bcLuu(bcTao(), null, "ok")'); await M.xong();
await M.sua(U.A, { t: '12', l: '7', n_om: '5' });
await M.moBc(D6, 1);
eq('3 chép then edit: report', M.dong('A'), 'Tổ A: ca ngày 7/12 cn, nghỉ 5 cn — 5 ốm');
eq('3 chép then edit: sản lượng', await M.sl(D6), [['A', 7], ['B', 12], ['E', 10]]);
// 4. nguồn tl + chiTen 1
const D7 = dd(7);
await M.moBc(D7, 1); M.R("S.bcNguon = 'tl'; S.bcChiTen = 1; bcNhap(); bcLuu(bcTao(), null, 'ok')"); await M.xong();
await M.sua(U.E, { t: '10', l: '6', n_om: '4' }, `${dd(8)}|2`);
await M.moBc(D7, 1);
eq('4 nguồn tl + chiTen 1: E line', M.dong('E'), 'Tổ E (làm ca đêm)');
eq('4 nguồn tl: sản lượng uses edited night 6', await M.sl(D7), [['A', 12], ['B', 12], ['E', 6]]);
// 5. khong -> Sửa -> gear dem_truoc -> Sửa
toi(10, 0);
const D1 = vnDay(), H0 = dd(1);
await S.cron();
await M.moBc(H0, 2);
M.R('ask = async () => true');
M.R(`ACTIONS.bcsuaca({ id: '${U.E}' })`); M.R("ACTIONS.bcsuakhong({ v: '1' })"); await M.xong();
await M.sua(U.E, { t: '10', l: '9', n_om: '1' });
const Q = (await S.call('GET', '/quanso', undefined, 'CV')).data;
eq('5 gear dem_truoc E 5', (await S.call('PUT', '/quanso/thietlap', { ds: [], dem_truoc: { ngay: H0, ds: [{ user: U.E, lam: 5, tong: 10, n2: { om: 5 }, ts: (Q.demTr.so[U.E] || {}).ts || 0 }] } }, 'CV')).status, 200);
await M.moBc(D1, 1);
eq('5 khong->Sửa->gear: day report', M.dong('E'), 'Tổ E (làm ca đêm): ca đêm 5/10 cn, nghỉ 5 cn — 5 ốm');
eq('5 sản lượng D1', await M.sl(D1), [['A', 12], ['B', 12], ['E', 5]]);
await M.moBc(H0, 2);
await M.sua(U.E, { t: '10', l: '8', n_om: '2' });
await M.moBc(D1, 1);
eq('5 then Sửa again wins', M.dong('E'), 'Tổ E (làm ca đêm): ca đêm 8/10 cn, nghỉ 2 cn — 2 ốm');
// 6. edit -> lịch change -> edit
await M.sua(U.B, { t: '12', l: '10', n_om: '2' });
await S.call('PUT', '/quanso/thietlap', { ds: [{ user: U.B, ca: 2 }] }, 'CV');
await M.moBc(D1, 1);
eq('6 Sửa then lịch->night: day line keeps Sửa', M.dong('B'), 'Tổ B: ca ngày 10/12 cn, nghỉ 2 cn — 2 ốm');
await M.sua(U.B, { t: '12', l: '11', n_om: '1' });
eq('6 edit again', M.dong('B'), 'Tổ B: ca ngày 11/12 cn, nghỉ 1 cn — 1 ốm');
await S.call('PUT', '/quanso/thietlap', { ds: [{ user: U.B, ca: 1 }] }, 'CV');
// 7. two devices
await M2.moBc(D1, 1);
await M.sua(U.A, { t: '12', l: '4', n_om: '8' });
advance(1000);
await M2.sua(U.A, { t: '12', l: '3', n_om: '9' });
await M.moBc(D1, 1);
eq('7 two devices: last Sửa wins on device 1', M.dong('A'), 'Tổ A: ca ngày 3/12 cn, nghỉ 9 cn — 9 ốm');
eq('7 two devices: sản lượng device 1', (await M.sl(D1))[0], ['A', 3]);
// 8. gear change after Sửa; 18:29 / 18:31 edits; cron
const Q2 = (await S.call('GET', '/quanso', undefined, 'CV')).data;
await S.call('PUT', '/quanso/thietlap', { ds: [{ user: U.A, tong: 12, s1: 1, s2: 0, n1: { om: 11 }, ts: Q2.tl[U.A].ts }] }, 'CV');
toi(18, 29); await M.sua(U.A, { t: '12', l: '2', n_om: '10' });
toi(18, 31); await M.sua(U.A, { t: '12', l: '6', n_om: '6' });
toi(19, 40); await S.cron();
await M.moBc(D1, 1);
eq('8 18:29/18:31 Sửa + cron: day line', M.dong('A'), 'Tổ A: ca ngày 6/12 cn, nghỉ 6 cn — 6 ốm');
// 9. night edits at 00:30, 06:29, 06:31
toi(0, 30); await M.moBc(D1, 2); await M.sua(U.E, { t: '10', l: '2', n_om: '8' });
toi(6, 29); await M.sua(U.E, { t: '10', l: '3', n_om: '7' });
toi(6, 31); await M.moBc(D1, 2); await M.sua(U.E, { t: '10', l: '4', n_om: '6' });
await S.cron();
const D2 = vnDay();
await M.moBc(D2, 1);
eq('9 night edits -> day D2 line', M.dong('E'), 'Tổ E (làm ca đêm): ca đêm 4/10 cn, nghỉ 6 cn — 6 ốm');
eq('9 sản lượng D2: E 4', (await M.sl(D2)).find((x) => x[0] === 'E'), ['E', 4]);
// 10. rename after edit
await S.login('Admin', '0900000001', '2468');
eq('10 rename status', (await S.call('POST', `/users/${U.E}/rename`, { name: 'E moi' }, 'Admin')).status, 200);
await M.moBc(D2, 1);
eq('10 rename after edit', M.dong('E moi'), 'Tổ E moi (làm ca đêm): ca đêm 4/10 cn, nghỉ 6 cn — 6 ốm');
ok('no js errors', !M.loi.length && !M2.loi.length, M.loi.concat(M2.loi).join('|'));
ket();
