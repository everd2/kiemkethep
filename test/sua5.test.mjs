/* Hồi quy đợt sửa 5 (rà soát toàn bộ 2026-11-03): Duyệt khu sau 0h không duyệt luôn số hôm qua chưa chốt, kg phiếu 0 của sổ thép về,
   dán trùng trong một lần nhập Excel, ô Đêm hôm trước không để đi làm + nghỉ > tổng, cookie gia hạn theo phiên, khôi phục PIN admin
   bị khoá, đọc chữ sửa tay "Tổ Khoa 2" / "Tổ 12" không nhầm sang tổ "Khoa" / "1".
   node sua5.test.mjs <đường-dẫn-repo> */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { advance, boot, vnDay } from './harness.mjs';

const ROOT = process.argv[2] || '.';
const T = [];
const ok = (name, cond, extra) => { T.push([cond ? 'PASS' : 'FAIL', name, extra === undefined ? '' : String(extra)]); };
const eq = (name, a, b) => ok(name + ' = ' + JSON.stringify(b), JSON.stringify(a) === JSON.stringify(b), 'thực tế: ' + JSON.stringify(a));
const datGio = (h, m = 0) => { const cur = ((Date.now() + 7 * 3600e3) % 864e5) / 60e3; let dd = h * 60 + m - cur; if (dd <= 0) dd += 1440; advance(dd * 60e3); };
const PHI = ['D6', 'D8', 'D10', 'D12', 'D14', 'D16', 'D18', 'D20', 'D22', 'D25', 'D28', 'D32', 'D36'];
const items = (vals) => PHI.map((phi) => (vals[phi] === undefined ? { phi, v: 0, kind: 'zero' } : { phi, v: vals[phi], kind: 'dem' }));

async function main() {
  datGio(12);
  const S = await boot(ROOT);
  await S.call('POST', '/setup', { token: 'setup-tok', name: 'Admin', phone: '0900000001', pin: '2468' });
  await S.login('Admin', '0900000001', '2468');
  const U = {};
  let i = 2;
  for (const [name, role] of [['An', 'tieudoi'], ['Kho', 'cvktht'], ['Ad2', 'admin'], ['Ad3', 'admin']]) {
    const phone = '09000000' + String(i++).padStart(2, '0');
    const r = await S.call('POST', '/users', { name, phone, role }, 'Admin');
    await S.login(name, phone, r.data.pin);
    await S.call('POST', '/change-pin', { pin: r.data.pin, newPin: '1357' }, name);
    U[name] = { id: r.data.id, phone };
  }

  /* ===== 1. Duyệt khu sau 0h, trước lúc sổ hôm qua tự chốt: chỉ duyệt số đang hiện (dòng ngày mới nhất mỗi ô) ===== */
  await S.call('PUT', '/counts', { khu: 'A', items: items({ D16: 50 }) }, 'An');
  eq('admin duyệt số đầu', (await S.call('POST', '/review/duyet', { khu: 'A' }, 'Admin')).status, 200);
  datGio(12); await S.cron();
  datGio(23);
  const D = vnDay();
  eq('23h: CVKTHT báo D16 = 500, chưa ai duyệt', (await S.call('PUT', '/counts', { khu: 'A', items: items({ D16: 500 }) }, 'Kho')).status, 200);
  advance(62 * 60e3);
  ok('đã qua 0h, sổ hôm qua chưa chốt', vnDay() !== D && !S.one('SELECT 1 x FROM day_close WHERE day = ?', D));
  eq('0h02: Tiểu đội trưởng báo D16 = 100', (await S.call('PUT', '/counts', { khu: 'A', items: items({ D16: 100 }) }, 'An')).status, 200);
  eq('CVKTHT duyệt khu A (số đang hiện là của Tiểu đội trưởng)', (await S.call('POST', '/review/duyet', { khu: 'A' }, 'Kho')).status, 200);
  const dong = S.sql("SELECT day, v, duyet_v FROM counts WHERE khu_id = 'A' AND phi_id = 'D16' ORDER BY day").map((r) => [r.day, r.v, r.duyet_v]);
  eq('dòng hôm qua (số của chính CVKTHT, không hiện trên màn Duyệt) vẫn chưa duyệt', dong.find((r) => r[0] === D), [D, 500, null]);
  eq('dòng hôm nay đã duyệt', dong[dong.length - 1].slice(1), [100, 100]);
  await S.cron();
  eq('chốt sổ hôm qua: tồn chuẩn giữ số đã duyệt 50, không thành 500', S.one("SELECT v FROM baseline WHERE day = ? AND khu_id = 'A' AND phi_id = 'D16'", D).v, 50);

  /* ===== 2. Sổ thép về: kg phiếu 0 (ô Excel để trống) mà có bó / cây = chưa ghi kg phiếu ===== */
  const ve = await S.call('POST', '/thepve', { ngay: vnDay(), ncc: 'Hòa Phát', lines: [{ phi: 'D16', bo: 2, cay: 0, kg: '0' }] }, 'Admin');
  eq('ghi chuyến kg "0", 2 bó', ve.status, 200);
  const dv = S.one('SELECT kg, kg_tinh FROM thep_ve_dong ORDER BY id DESC LIMIT 1');
  ok('lưu kg phiếu trống, giữ kg tính', dv.kg === null && dv.kg_tinh > 0, JSON.stringify(dv));
  const tk = (await S.call('GET', '/thepve', undefined, 'Admin')).data;
  ok('thống kê kỳ lấy kg tính, không ra 0 kg', JSON.stringify(tk).includes(String(dv.kg_tinh)), JSON.stringify(tk).slice(0, 300));
  eq('chỉ ghi kg 0, không bó / cây: vẫn bị từ chối', (await S.call('POST', '/thepve', { ngay: vnDay(), ncc: 'Hòa Phát', lines: [{ phi: 'D16', kg: '0' }] }, 'Admin')).status, 400);

  /* ===== 3. Nhập Excel: dán trùng trong cùng một lần ===== */
  const h = vnDay();
  const r1 = { ngay: h, ncc: 'Việt Úc', so_phieu: 'P9', phi: 'D10', kg: '1000' }, r2 = { ngay: h, ncc: 'Việt Úc', phi: 'D12', kg: '500' };
  const thu = await S.call('POST', '/thepve/nhap', { rows: [r1, r1], thu: true }, 'Admin');
  eq('cùng phiếu, hai dòng cùng phi: báo lỗi, không cộng đôi', [thu.data.so_loi, (thu.data.loi[0] || {}).dong], [1, 2]);
  const thu2 = await S.call('POST', '/thepve/nhap', { rows: [r2, r2], thu: true }, 'Admin');
  eq('không số phiếu, hai dòng giống hệt: không chặn, chỉ cảnh báo', [thu2.data.so_loi, thu2.data.so_trung, thu2.data.trung], [0, 1, [{ dong: 2, giong: 1 }]]);
  const r3 = { ngay: h, ncc: 'Việt Úc', so_phieu: 'P10', phi: 'D10', kg: '1000' };
  eq('cùng phiếu, khác phi: vẫn gộp một chuyến', (await S.call('POST', '/thepve/nhap', { rows: [r3, { ...r3, phi: 'D12' }], thu: true }, 'Admin')).data.chuyen, 1);

  /* ===== 4. Ô Đêm hôm trước: không để đi làm + nghỉ > tổng, không lấy tổng mới của hôm nay đè lên ca đã hết ===== */
  datGio(9);
  const hom = vnDay(Date.now() - 864e5);
  S.raw.prepare('INSERT INTO quan_so_tl (ngay, ca, user_id, tong, lam, nghi, ghi_chu, ts) VALUES (?,?,?,?,?,?,?,?)').run(hom, 2, U.An.id, 12, 10, JSON.stringify({ om: 2 }), null, Date.now() - 6 * 3600e3);
  const demTr = (lam, ds = []) => S.call('PUT', '/quanso/thietlap', { ds, dem_truoc: { ngay: hom, ds: [{ user: U.An.id, lam }] } }, 'Kho');
  const tlr = () => { const r = S.one('SELECT tong, lam, nghi FROM quan_so_tl WHERE ngay = ? AND ca = 2 AND user_id = ?', hom, U.An.id); return [r.tong, r.lam, JSON.parse(r.nghi)]; };
  eq('đêm hôm trước 9 (9 + 2 nghỉ <= 12): giữ người nghỉ đã chép', [(await demTr(9)).status, ...tlr()], [200, 12, 9, { om: 2 }]);
  eq('đêm hôm trước 12 (12 + 2 nghỉ > 12): bỏ người nghỉ, không để 14/12', [(await demTr(12)).status, ...tlr()], [200, 12, 12, {}]);
  const kem = await demTr(11, [{ user: U.An.id, tong: 30, s1: 20, s2: 0, ts: 0 }]);
  eq('cùng lần lưu đổi tổng hôm nay thành 30: tổng đêm qua vẫn 12', [kem.status, tlr()[0]], [200, 12]);

  /* ===== 5. Cookie gia hạn theo phiên: không bị đăng xuất đúng 30 ngày sau lần đăng nhập ===== */
  advance(20 * 864e5);
  const goi = async (p) => S.worker.fetch(new Request('https://test.local/api' + p, { headers: { Cookie: S.jars.An, Origin: 'https://test.local' } }), S.env);
  const res = await goi('/bootstrap');
  const sc = res.headers.get('Set-Cookie') || '', ma = Number((sc.match(/Max-Age=(\d+)/) || [])[1]);
  eq('ngày 20 sau đăng nhập: vẫn vào được', res.status, 200);
  ok('cookie đặt lại với hạn ~30 ngày từ bây giờ (phiên vừa gia hạn)', ma > 29 * 86400 && ma <= 30 * 86400, sc);
  ok('cookie vẫn HttpOnly, SameSite=Strict', /HttpOnly/.test(sc) && /SameSite=Strict/.test(sc), sc);
  const ex = S.one('SELECT expires_at FROM sessions WHERE user_id = ?', U.An.id).expires_at;
  ok('Max-Age khớp hạn phiên ở server', Math.abs(ex - Date.now() - ma * 1000) < 2000, ex - Date.now() + ' / ' + ma);
  const rev = await goi('/rev');
  eq('lần hỏi ngầm /rev không đặt cookie', rev.headers.get('Set-Cookie'), null);

  /* ===== 6. Khôi phục PIN cho admin đang bị khoá: báo rõ, không báo "đã đặt lại" ===== */
  eq('Ad2 khoá Ad3', (await S.call('POST', '/users/' + U.Ad3.id + '/lock', { locked: true }, 'Ad2')).status, 200);
  const rec = await S.call('POST', '/recover', { token: 'rec-tok', phone: U.Ad3.phone, newPin: '8642' });
  ok('khôi phục bị từ chối, nói rõ đang bị khoá', rec.status === 403 && /khoá/.test(rec.data.error || ''), JSON.stringify(rec.data));
  eq('PIN cũ không bị đổi', (await S.call('POST', '/login', { phone: U.Ad3.phone, pin: '1357' }, 'x')).status, 403);
  await S.call('POST', '/users/' + U.Ad3.id + '/lock', { locked: false }, 'Ad2');
  eq('mở khoá rồi khôi phục được', (await S.call('POST', '/recover', { token: 'rec-tok', phone: U.Ad3.phone, newPin: '8642' })).status, 200);

  /* ===== 7. Đọc chữ sửa tay mục 3: tên tổ là đầu tên tổ khác ===== */
  const src = readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');
  const lay = (re) => { const m = src.match(re); if (!m) throw new Error('không thấy ' + re); return m[0]; };
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext([lay(/^const CA_TEN = .*$/m), lay(/^const bcDong = .*$/m), lay(/^const bcChuTen = .*$/m), lay(/^function bcS3Cua\([\s\S]*?\n\}/m), 'this.f = bcS3Cua;'].join('\n'), ctx);
  const txt = '• Tổ Khoa 2: ca ngày 10/20 cn\n• Tổ Khoa: ca ngày 12/21 cn\n• Tổ 12: ca ngày 7/9 cn\n• Tổ 1 5/6 cn';
  eq('"Tổ Khoa 2" đứng trước không bị nhận là tổ "Khoa"', ctx.f(txt, 'Khoa', 1), { lam: 12, tong: 21 });
  eq('tổ "Khoa 2" vẫn đọc đúng', ctx.f(txt, 'Khoa 2', 1), { lam: 10, tong: 20 });
  eq('"Tổ 12" không bị nhận là tổ "1"; "Tổ 1 5/6" (không dấu hai chấm) vẫn đọc được', ctx.f(txt, '1', 1), { lam: 5, tong: 6 });
  eq('tổ "12"', ctx.f(txt, '12', 1), { lam: 7, tong: 9 });

  // các ngày bị bỏ qua lúc tua đồng hồ ở trên: chốt bù cho sổ khỏi kẹt
  datGio(0, 30); for (let h = 0; h < 30; h++) { await S.cron(); advance(60e3); }
  const nay = vnDay();

  /* ===== 8. Báo số đếm có khoá chống gửi trùng: gửi lại sau khi hết giờ chờ (máy chủ đã ghi) không thành lần báo mới ===== */
  const K = 'aaaaaaaaaaaaaaaa';
  eq('An báo khu B (có khoá)', (await S.call('PUT', '/counts', { khu: 'B', day: nay, items: items({ D10: 5 }), khoa: K }, 'An')).status, 200);
  eq('admin duyệt khu B', (await S.call('POST', '/review/duyet', { khu: 'B' }, 'Admin')).status, 200);
  const lai = await S.call('PUT', '/counts', { khu: 'B', day: nay, items: items({ D10: 5 }), khoa: K }, 'An');
  eq('gửi lại cùng khoá: trả như đã gửi', [lai.status, lai.data.da_gui], [200, true]);
  const b10 = S.one("SELECT duyet_ts = ts ok FROM counts WHERE day = ? AND khu_id = 'B' AND phi_id = 'D10'", nay);
  eq('khu B vẫn đã duyệt (không quay về Chờ duyệt)', b10.ok, 1);
  eq('lịch sử đếm không có dòng trùng', S.sql("SELECT 1 FROM counts_log WHERE day = ? AND khu_id = 'B' AND phi_id = 'D10'", nay).length, 1);
  eq('gửi lại cùng khoá sau nửa đêm (đã vào sổ hôm qua): không báo "chưa gửi được"', (await S.call('PUT', '/counts', { khu: 'B', day: vnDay(Date.now() - 864e5), items: items({ D10: 5 }), khoa: K }, 'An')).status, 200);
  eq('khoá khác vẫn là lần báo mới', (await S.call('PUT', '/counts', { khu: 'B', day: nay, items: items({ D10: 6 }), khoa: 'bbbbbbbbbbbbbbbb' }, 'An')).status, 200);
  eq('khoá của người khác không được tính là của mình', (await S.call('PUT', '/counts', { khu: 'B', day: nay, items: items({ D10: 7 }), khoa: K }, 'Kho')).data.da_gui, undefined);

  /* ===== 9. Nhập Excel có khoá chống ghi đôi ===== */
  const KX = '0123456789abcdef', dongX = [{ ngay: nay, ncc: 'Khoá Thử', phi: 'D12', kg: '500' }];
  eq('nhập Excel lần đầu', (await S.call('POST', '/thepve/nhap', { rows: dongX, khoa: KX }, 'Admin')).data.chuyen, 1);
  const nx = await S.call('POST', '/thepve/nhap', { rows: dongX, khoa: KX }, 'Admin');
  eq('bấm Nhập lại cùng khoá: trả lần đã nhập, không ghi thêm', [nx.status, nx.data.da_nhap, nx.data.chuyen], [200, true, 1]);
  eq('sổ chỉ có một chuyến', S.sql("SELECT 1 FROM thep_ve v JOIN thep_ncc n ON n.id = v.ncc_id WHERE n.name = 'Khoá Thử'").length, 1);
  const lo = S.one("SELECT substr(v.khoa, 1, instr(v.khoa, '-') - 1) lo FROM thep_ve v JOIN thep_ncc n ON n.id = v.ncc_id WHERE n.name = 'Khoá Thử'").lo;
  eq('lần nhập có khoá vẫn huỷ cả lần được', (await S.call('POST', `/thepve/nhap/${lo}/huy`, { ly_do: 'thử' }, 'Admin')).status, 200);

  /* ===== 10. Số đơn "PO-01" và "PO 01" của cùng NCC là một đơn ===== */
  const donX = (so) => S.call('POST', '/thepve/don', { ncc: 'Việt Úc', so_don: so, ngay_dat: nay, lines: [{ phi: 'D16', kg: '1000' }] }, 'Admin');
  eq('lập đơn PO-01', (await donX('PO-01')).status, 200);
  eq('lập đơn "PO 01": báo đã có', (await donX('PO 01')).status, 400);

  /* ===== 11. Huỷ báo cáo trả lại đúng chuỗi "giữ nguyên" ===== */
  const giu = (v) => PHI.map((phi) => (phi === 'D16' ? { phi, v, kind: 'giu' } : { phi, v: 0, kind: 'zero' }));
  const chuoi = () => S.one("SELECT keep_streak FROM khu_phi WHERE khu_id = 'C' AND phi_id = 'D16'").keep_streak;
  await S.call('PUT', '/counts', { khu: 'C', day: nay, items: items({ D16: 10 }) }, 'An');
  await S.call('POST', '/review/duyet', { khu: 'C' }, 'Admin');
  eq('"giữ nguyên" D16, được duyệt: chuỗi 1', [(await S.call('PUT', '/counts', { khu: 'C', day: nay, items: giu(10) }, 'An')).status, (await S.call('POST', '/review/duyet', { khu: 'C' }, 'Admin')).status, chuoi()], [200, 200, 1]);
  eq('báo lại bằng số đếm: chuỗi 0', [(await S.call('PUT', '/counts', { khu: 'C', day: nay, items: items({ D16: 12 }) }, 'An')).status, chuoi()], [200, 0]);
  eq('huỷ báo cáo đó: ô quay về "giữ nguyên" đã duyệt, chuỗi về 1', [(await S.call('POST', '/recount', { khu: 'C', ly_do: 'đếm sai' }, 'Admin')).status, chuoi()], [200, 1]);

  /* ===== 12. Hoàn tác đặt lại số liệu: không để lại "lần báo" toàn số 0 của admin, không xoá chuỗi "giữ nguyên" ===== */
  const rs = await S.call('POST', '/reset', { mode: 'zero' }, 'Admin');
  eq('đặt tồn về 0', [rs.status, rs.data.error], [200, undefined]);
  eq('hoàn tác', (await S.call('POST', '/reopen', { note: 'bấm nhầm' }, 'Admin')).status, 200);
  const subs = (await S.call('GET', '/submissions?khu=C', undefined, 'Admin')).data.subs;
  ok('lịch sử báo của khu C không có lần báo toàn số 0 của lần đặt lại', subs.length && subs.every((x) => x.uname !== 'Admin'), JSON.stringify(subs.map((x) => x.uname)));
  eq('chuỗi "giữ nguyên" giữ nguyên sau hoàn tác', chuoi(), 1);

  const fail = T.filter((x) => x[0] === 'FAIL');
  console.log(T.map((x) => x[0] + ' | ' + x[1] + (x[2] && x[0] === 'FAIL' ? '  [' + x[2] + ']' : '')).join('\n'));
  console.log('\n=== ' + T.length + ' kiểm tra, ' + fail.length + ' lỗi ===');
  process.exit(fail.length ? 1 : 0);
}
main().catch((e) => { console.error('CRASH', e); process.exit(2); });
