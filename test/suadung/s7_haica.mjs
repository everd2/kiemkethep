// Tổ hai ca (lịch 3): Sửa từng ca; mục 3 báo cáo ca ĐÊM D đã sửa tay (dòng có cả phần ca ngày D) rồi Sửa ca ngày D
import { dung, may, toi, advance, vnDay, eq, ok, ket } from './lib.mjs';
toi(20, 0);
const { S, U } = await dung([['C', 'tieudoi'], ['CV', 'cvktht']]);
await S.call('PUT', '/quanso/lich', { ca: 3 }, 'C');
await S.call('PUT', '/quanso/thietlap', { user: U.C, ts: 0, ca: 3, tong: 16, s1: 8, s2: 8 }, 'CV');
advance(864e5); toi(19, 0); const H = vnDay();
toi(7, 5); await S.cron(); const D = vnDay();
toi(19, 0); await S.cron();
toi(21, 0);
const M = await may(S, U, 'CV');
// a) plain Sửa of each shift
await M.moBc(H, 2); await M.sua(U.C, { t: '16', l: '7', n_om: '1' });
await M.moBc(D, 1); await M.sua(U.C, { t: '16', l: '6', n_om: '2' });
eq('a) day D line', M.dong('C'), 'Tổ C: ca ngày 6/16 cn, ca đêm 7/16 cn, nghỉ 3 cn — ca ngày: 2 ốm; ca đêm: 1 ốm');
eq('a) sản lượng D', await M.sl(D), [['C', 13]]);
// b) night D report hand-edited (header only) + chép, then Sửa day D
await M.moBc(D, 2);
const truoc = M.dong('C');
M.R(`S.bcM.s3 = bcAuto(S.bcc, 's3').replace('Quân số đi làm', 'Quân số ĐI LÀM'); bcNhap(); bcLuu(bcTao(), null, 'ok')`); await M.xong();
await M.moBc(D, 1); await M.sua(U.C, { t: '16', l: '5', n_om: '3' });
await M.moBc(D, 2);
ok('b) night D line before', true, truoc);
eq('b) night D report shows the new ca ngày D number', M.dong('C'), M.dongApp('C'));
ket();
