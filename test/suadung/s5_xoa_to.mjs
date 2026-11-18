// Tổ bị xoá sau khi sửa: (a) tổ đêm E Sửa đêm H rồi xoá; (b) tổ hai ca C: ca ngày D "không làm", đêm H có số, rồi xoá tổ C
import { dung, may, toi, advance, vnDay, eq, ok, ket } from './lib.mjs';
toi(20, 0);
const { S, U } = await dung([['C', 'tieudoi'], ['E', 'tieudoi'], ['K', 'tieudoi'], ['CV', 'cvktht']]);
await S.call('PUT', '/quanso/lich', { ca: 3 }, 'C'); await S.call('PUT', '/quanso/thietlap', { user: U.C, ts: 0, ca: 3, tong: 16, s1: 8, s2: 8 }, 'CV');
await S.call('PUT', '/quanso/lich', { ca: 2 }, 'E'); await S.call('PUT', '/quanso/thietlap', { user: U.E, ts: 0, ca: 2, tong: 10, s1: 0, s2: 10 }, 'CV');
await S.call('PUT', '/quanso/lich', { ca: 1 }, 'K'); await S.call('PUT', '/quanso/thietlap', { user: U.K, ts: 0, ca: 1, tong: 10, s1: 10, s2: 0 }, 'CV');
advance(864e5); toi(19, 0);
const H = vnDay();
toi(7, 5); await S.cron();
const D = vnDay();
toi(19, 0); await S.cron(); // day D ended & copied
toi(20, 0);
const M = await may(S, U, 'CV');
await M.moBc(H, 2);
await M.sua(U.E, { t: '10', l: '7', n_om: '3' });
await M.moBc(D, 1);
M.R('ask = async () => true');
M.R(`ACTIONS.bcsuaca({ id: '${U.C}' })`); M.R("ACTIONS.bcsuakhong({ v: '1' })"); await M.xong();
await M.sua(U.K, { t: '10', l: '6', n_phep: '4' });
eq('before delete: day D lines', [M.dong('C'), M.dong('E'), M.dong('K')], ['Tổ C: không làm ca ngày, ca đêm 8/16 cn', 'Tổ E (làm ca đêm): ca đêm 7/10 cn, nghỉ 3 cn — 3 ốm', 'Tổ K: ca ngày 6/10 cn, nghỉ 4 cn — 4 nghỉ phép năm']);
const slTruoc = await M.sl(D);
eq('before delete: sản lượng D', slTruoc, [['C', 8], ['E', 7], ['K', 6]]);
for (const t of ['C', 'E', 'K']) eq('delete ' + t, (await S.call('POST', `/users/${U[t]}/delete`, {}, 'Admin')).status, 200);
await M.moBc(D, 1);
eq('after delete: day D lines unchanged', [M.dong('C'), M.dong('E'), M.dong('K')], ['Tổ C: không làm ca ngày, ca đêm 8/16 cn', 'Tổ E (làm ca đêm): ca đêm 7/10 cn, nghỉ 3 cn — 3 ốm', 'Tổ K: ca ngày 6/10 cn, nghỉ 4 cn — 4 nghỉ phép năm']);
eq('after delete: sản lượng D unchanged', await M.sl(D), slTruoc);
// rename (restore not needed): rename a live tổ after edit
ket();
