// Mục 3 ca ngày D (ca đang chạy) đã sửa tay và chép. Sau đó bánh răng đổi số thiết lập (không ai bấm Sửa ca này) / đổi lịch
import { dung, may, toi, advance, vnDay, eq, ok, ket } from './lib.mjs';
toi(20, 0);
const { S, U } = await dung([['A', 'tieudoi'], ['B', 'tieudoi'], ['CV', 'cvktht']]);
for (const t of ['A', 'B']) { await S.call('PUT', '/quanso/lich', { ca: 1 }, t); await S.call('PUT', '/quanso/thietlap', { user: U[t], ts: 0, ca: 1, tong: 12, s1: 12, s2: 0 }, 'CV'); }
advance(864e5); toi(8, 0);
const D = vnDay();
const M = await may(S, U, 'CV');
await M.moBc(D, 1);
// hand edit only the header line (typo fix), keep tổ lines
M.R(`S.bcM.s3 = bcAuto(S.bcc, 's3').replace('Quân số đi làm', 'Quân số ĐI LÀM'); bcNhap()`);
M.R('bcLuu(bcTao(), null, "ok")'); await M.xong();
advance(60e3);
const Q = (await S.call('GET', '/quanso', undefined, 'CV')).data;
eq('gear: A standing day 9 (+3 ốm)', (await S.call('PUT', '/quanso/thietlap', { ds: [{ user: U.A, tong: 12, s1: 9, s2: 0, n1: { om: 3 }, ts: Q.tl[U.A].ts }] }, 'CV')).status, 200);
await M.moBc(D, 1);
eq('app-computed line follows gear', M.dongApp('A'), 'Tổ A: ca ngày 9/12 cn, nghỉ 3 cn — 3 ốm');
eq('shown/sent line of báo cáo ca D (running shift, no Sửa)', M.dong('A'), 'Tổ A: ca ngày 9/12 cn, nghỉ 3 cn — 3 ốm');
eq('sản lượng D', await M.sl(D), [['A', 9], ['B', 12]]);
// lịch: B moves to night
eq('lịch B -> ca đêm', (await S.call('PUT', '/quanso/thietlap', { ds: [{ user: U.B, ca: 2 }] }, 'CV')).status, 200);
await M.moBc(D, 1);
eq('app line B follows lịch', M.dongApp('B'), 'Tổ B (làm ca đêm)');
eq('shown line B', M.dong('B'), 'Tổ B (làm ca đêm)');
ket();
