// Hai CVKTHT, hai máy. Máy 2 sửa tay mục 3 ca ngày D rồi chép (server lưu muc.s3). Máy 1 bấm Sửa tổ A (s3 bị bỏ ở server).
// Máy 2 vẫn mở màn báo cáo ca ngày D (chưa tới vòng tự làm mới) bấm Chép lại -> s3 cũ quay lại?
import { dung, may, toi, advance, vnDay, eq, ok, ket } from './lib.mjs';
toi(20, 0);
const { S, U } = await dung([['A', 'tieudoi'], ['CV', 'cvktht'], ['CV2', 'cvktht']]);
await S.call('PUT', '/quanso/lich', { ca: 1 }, 'A');
await S.call('PUT', '/quanso/thietlap', { user: U.A, ts: 0, ca: 1, tong: 12, s1: 12, s2: 0 }, 'CV');
advance(864e5); toi(9, 0);
const D = vnDay();
const M1 = await may(S, U, 'CV'), M2 = await may(S, U, 'CV2');
await M2.moBc(D, 1);
M2.R(`S.bcM.s3 = bcAuto(S.bcc, 's3').replace(/Tổ A: .*/, 'Tổ A: ca ngày 11/12 cn, nghỉ 1 cn — 1 ốm'); bcNhap()`);
M2.R('bcLuu(bcTao(), null, "ok")'); await M2.xong();
ok('server has s3 after máy 2 chép', S.one("SELECT json_type(data,'$.muc.s3') t FROM bao_cao_ca WHERE ngay=? AND ca=1", D).t === 'text');
advance(60e3);
// máy 1: Sửa tổ A = 9
await M1.moBc(D, 1);
await M1.sua(U.A, { t: '12', l: '9', n_om: '3' });
eq('máy 1 report after Sửa', M1.dong('A'), 'Tổ A: ca ngày 9/12 cn, nghỉ 3 cn — 3 ốm');
eq('máy 1 sản lượng after Sửa', await M1.sl(D), [['A', 9]]);
// máy 2 (screen still open, stale) chép lại
advance(60e3);
M2.R('bcLuu(bcTao(), null, "ok")'); await M2.xong();
ok('máy 2 chép accepted? toast', true, M2.R('S.toast'));
await M1.moBc(D, 1);
eq('máy 1 report after máy 2 chép (should still be 9)', M1.dong('A'), 'Tổ A: ca ngày 9/12 cn, nghỉ 3 cn — 3 ốm');
eq('máy 1 sản lượng after máy 2 chép (should still be 9)', await M1.sl(D), [['A', 9]]);

// variant B: máy 2 has an UNSAVED local draft of s3; máy 1 Sửa again -> máy 2's reports
M2.R(`Object.keys(NHO).forEach((k) => delete NHO[k])`);
await M2.moBc(D, 1);
M2.R(`S.bcM.s3 = bcAuto(S.bcc, 's3').replace(/Tổ A: .*/, 'Tổ A: ca ngày 10/12 cn'); bcNhap()`);
advance(60e3);
await M1.moBc(D, 1);
await M1.sua(U.A, { t: '12', l: '8', n_om: '4' });
await M2.moBc(D, 1);
eq('variant B: máy 2 report after máy 1 Sửa 8', M2.dong('A'), 'Tổ A: ca ngày 8/12 cn, nghỉ 4 cn — 4 ốm');
eq('variant B: máy 2 sản lượng after máy 1 Sửa 8', await M2.sl(D), [['A', 8]]);
// nháp chữ sửa tay của máy 2 cũ hơn lần Sửa của máy 1: app bỏ phần chữ đó (bcTayCu) nên số trên máy 2 đã là số mới, không còn gì "chưa chép" để nhắc
ok('variant B: máy 2 không còn theo nháp cũ (không cần nhắc "sửa chưa chép")', !M2.R('bcBan(S.bcc).s3'));
ket();
