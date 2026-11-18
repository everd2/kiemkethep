// Đánh dấu nhầm "không làm" rồi bỏ dấu: số đã chép (quan_so_tl) của ca đó có quay lại không?
import { dung, may, toi, advance, vnDay, eq, ok, ket } from './lib.mjs';
toi(9, 0);
const { S, U } = await dung([['A', 'tieudoi'], ['CV', 'cvktht']]);
await S.call('PUT', '/quanso/lich', { ca: 1 }, 'A');
await S.call('PUT', '/quanso/thietlap', { user: U.A, ts: 0, ca: 1, tong: 12, s1: 11, s2: 0, n1: { om: 1 } }, 'CV');
advance(864e5); toi(19, 0); await S.cron();
const D = vnDay();
eq('copied day D', S.sql('SELECT lam FROM quan_so_tl WHERE ngay=? AND ca=1', D).map((r) => r.lam), [11]);
// a) unmark while shift still within the last-3-shifts window, standing numbers unchanged
const M = await may(S, U, 'CV');
toi(20, 0);
await M.moBc(D, 1);
M.R('ask = async () => true');
M.R(`ACTIONS.bcsuaca({ id: '${U.A}' })`); M.R("ACTIONS.bcsuakhong({ v: '1' })"); await M.xong();
M.R(`ACTIONS.bcsuaca({ id: '${U.A}' })`); M.R("ACTIONS.bcsuakhong({ v: '0' })"); await M.xong();
eq('a) after mark+unmark (standing unchanged): report day D', M.dong('A'), 'Tổ A: ca ngày 11/12 cn, nghỉ 1 cn — 1 ốm');
// b) standing changed later (normal: new numbers for coming days), then mark+unmark day D by mistake
const Q = (await S.call('GET', '/quanso', undefined, 'CV')).data;
advance(60e3);
await S.call('PUT', '/quanso/thietlap', { ds: [{ user: U.A, tong: 12, s1: 6, s2: 0, n1: { phep: 6 }, ts: Q.tl[U.A].ts }] }, 'CV');
await M.moBc(D, 1);
eq('b) standing changed after day D: day D report still the copy 11', M.dong('A'), 'Tổ A: ca ngày 11/12 cn, nghỉ 1 cn — 1 ốm');
M.R(`ACTIONS.bcsuaca({ id: '${U.A}' })`); M.R("ACTIONS.bcsuakhong({ v: '1' })"); await M.xong();
M.R(`ACTIONS.bcsuaca({ id: '${U.A}' })`); M.R("ACTIONS.bcsuakhong({ v: '0' })"); await M.xong();
await S.cron();
await M.moBc(D, 1);
eq('b) after mark+unmark: day D back to 11 (original copy)', M.dong('A'), 'Tổ A: ca ngày 11/12 cn, nghỉ 1 cn — 1 ốm');
eq('b) sản lượng D', await M.sl(D), [['A', 11]]);
ket();
