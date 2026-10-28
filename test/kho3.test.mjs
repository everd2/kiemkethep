/* Hồi quy lõi tính tồn (10/2026, đợt 3 — viết lại theo luật v70): node kho3.test.mjs <đường-dẫn-repo>
   Luật v70 (chủ bãi chốt): tồn bãi = số đếm ĐÃ DUYỆT gần nhất của ô, chưa có thì tồn chuẩn; phiếu kho chỉ là thống kê, không
   cộng / trừ vào tồn, không bị chặn "chỉ còn…". Duyệt khu chỉ duyệt số đếm, phiếu chờ của khu vẫn chờ.
   1. Phiếu lập sau lúc khu đếm (chuyển / xuất / nhập) KHÔNG cộng lên số đếm, kể cả khi duyệt khu và phiếu cùng lúc hay lúc 0h01.
   2. Số đếm chưa duyệt chuyển qua 0h: tồn chuẩn giữ tồn chuẩn cũ (không cộng phiếu), hôm sau CVKTHT duyệt được (không còn capPhieu).
   3. Huỷ phiếu nhập đã duyệt lúc nào cũng được, tồn không đổi.
   4. phi_rate: phi không còn ngày dùng nào trong 28 ngày thì mức dùng TB cũ bị xoá, không treo mãi.
   5. Thẻ màn Duyệt: exp = tồn chuẩn + phiếu đã duyệt (tham chiếu), d = số đếm − exp; không còn dem / sau / cho, bootstrap phieuTs rỗng. */
import { boot, clock, advance, vnDay } from './harness.mjs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.argv[2] || '.';
const T = [];
const ok = (name, cond, extra) => { T.push([cond ? 'PASS' : 'FAIL', name, extra === undefined ? '' : String(extra)]); };
const eq = (name, a, b) => ok(name + ' = ' + JSON.stringify(b), JSON.stringify(a) === JSON.stringify(b), 'thực tế: ' + JSON.stringify(a));

// đặt đồng hồ về h giờ (giờ VN) của hôm nay, hoặc hôm sau nếu đã qua
const veGio = (h) => {
  const vnMs = (Date.now() + 7 * 3600e3) % 864e5;
  clock.offset += h * 3600e3 - vnMs + (vnMs > h * 3600e3 ? 864e5 : 0);
};

async function moi() {
  const S = await boot(ROOT);
  await S.call('POST', '/setup', { token: 'setup-tok', name: 'Admin', phone: '0900000001', pin: '2468' });
  await S.login('Admin', '0900000001', '2468');
  for (const [name, phone, role] of [['An', '0900000002', 'tieudoi'], ['Cv', '0900000004', 'cvktht'], ['Trung', '0900000006', 'trungdoi']]) {
    const r = await S.call('POST', '/users', { name, phone, role }, 'Admin');
    await S.login(name, phone, r.data.pin);
    await S.call('POST', '/change-pin', { pin: r.data.pin, newPin: '1357' }, name);
  }
  S.phi = S.sql('SELECT id FROM phi WHERE active = 1').map((p) => p.id);
  S.items = (vals) => S.phi.map((phi) => (vals[phi] === undefined ? { phi, v: 0, kind: 'zero' } : { phi, v: vals[phi], kind: 'dem' }));
  return S;
}

async function main() {
  const { tonCells } = await import(pathToFileURL(path.join(ROOT, 'src/phieu.js')).href);
  const ton = async (S, khu, phi = 'D16') => (await tonCells(S.env, vnDay(), [{ khu, phi }]))[khu + '|' + phi];
  const rv = async (S) => (await S.call('GET', '/review', undefined, 'Admin')).data;
  const tong = async (S, phi = 'D16') => (await rv(S)).rows.find((x) => x.phi === phi);
  const nhap = async (S, khu, qty, ai = 'Cv') => {
    const r = await S.call('POST', '/receipts', { khu, lines: [{ phi: 'D16', qty }] }, ai);
    await S.call('POST', `/receipts/${r.data.id}/duyet`, {}, 'Trung');
    return r.data.id;
  };
  // ngày đầu: khu A có 100 cây D16 (đã duyệt), rồi chốt sổ
  const nen = async (S) => {
    await nhap(S, 'A', 100);
    advance(1000);
    await S.call('PUT', '/counts', { khu: 'A', items: S.items({ D16: 100 }) }, 'An');
    await S.call('POST', '/review/duyet', { khu: 'A' }, 'Admin');
    veGio(1); await S.cron(); // 1h hôm sau: chốt ngày đầu
  };

  /* ===== 1. Phiếu lập sau lúc đếm: không cộng lên số đếm (v70) ===== */
  for (const loai of ['chuyen', 'xuat']) {
    veGio(7);
    const S = await moi();
    await nen(S);
    veGio(8);
    await S.call('PUT', '/counts', { khu: 'A', items: S.items({ D16: 100 }) }, 'An'); // 8h: đếm 100, chờ duyệt
    advance(2 * 3600e3); // 10h: rút 90 khỏi A (chờ duyệt)
    const p = loai === 'chuyen'
      ? await S.call('POST', '/transfers', { from: 'A', to: 'B', lines: [{ phi: 'D16', qty: 90 }] }, 'Cv')
      : await S.call('POST', '/xuat', { khu: 'A', noi: 'Cầu', lines: [{ phi: 'D16', qty: 90 }] }, 'Cv');
    ok(loai + ': lập phiếu rút 90', p.status === 200, JSON.stringify(p.data));
    advance(3600e3); // 11h: duyệt khu A — CHỈ duyệt số đếm
    eq(loai + ': duyệt khu A (chỉ số đếm)', (await S.call('POST', '/review/duyet', { khu: 'A' }, 'Admin')).status, 200);
    eq(loai + ': phiếu vẫn chờ duyệt sau Duyệt khu', S.sql('SELECT 1 FROM receipts WHERE duyet_day IS NULL').length > 0, true);
    eq(loai + ': khu A = số đếm 100, phiếu không trừ', await ton(S, 'A'), 100);
    if (loai === 'chuyen') eq('chuyen: khu B vẫn 0 (phiếu chuyển không cộng)', await ton(S, 'B'), 0);
    eq(loai + ': duyệt riêng phiếu được', (await S.call('POST', `/receipts/${p.data.id}/duyet`, {}, 'Trung')).status, 200);
    eq(loai + ': duyệt phiếu xong A vẫn 100', await ton(S, 'A'), 100);
    const t = await tong(S);
    // used = tồn cũ 100 + (inn − phần xuất) − 100: chuyển tự triệt tiêu, xuất được cộng lại → 0 cả hai
    eq(loai + ': tổng bãi / đã dùng', [t.cnt, t.used], [100, 0]);
    const kA = (await rv(S)).khus.find((k) => k.khu === 'A');
    ok(loai + ': thẻ khu không còn recheck / capPhieu / phieuSau', !['recheck', 'capPhieu', 'phieuSau'].some((f) => f in kA));
    veGio(1); await S.cron();
    eq(loai + ': sau chốt sổ khu A vẫn 100', await ton(S, 'A'), 100);
    if (loai === 'chuyen') eq('chuyen: sau chốt sổ tổng bãi vẫn 100', (await tong(S)).cnt, 100);
  }
  /* phiếu lập TRƯỚC lúc đếm: tồn vẫn đúng số đếm (không cộng hai lần), phiếu vẫn chờ */
  {
    veGio(7);
    const S = await moi();
    await nen(S);
    veGio(8);
    await S.call('POST', '/receipts', { khu: 'A', lines: [{ phi: 'D16', qty: 50 }] }, 'Cv'); // 8h: xe về, phiếu chờ
    advance(3600e3);
    await S.call('PUT', '/counts', { khu: 'A', items: S.items({ D16: 150 }) }, 'An'); // 9h: đếm cả 50 mới về
    advance(3600e3);
    eq('phiếu lập trước lúc đếm: duyệt khu', (await S.call('POST', '/review/duyet', { khu: 'A' }, 'Admin')).status, 200);
    eq('phiếu lập trước lúc đếm: tồn 150 (không cộng hai lần)', await ton(S, 'A'), 150);
    eq('phiếu nhập vẫn chờ duyệt', S.sql('SELECT 1 FROM receipts WHERE duyet_day IS NULL').length, 1);
    await S.call('POST', `/receipts/${S.one('SELECT id FROM receipts WHERE duyet_day IS NULL').id}/duyet`, {}, 'Trung');
    eq('phiếu ghi muộn duyệt sau: tồn vẫn 150', await ton(S, 'A'), 150);
  }
  /* đếm trước nửa đêm, duyệt lúc 0h01 (trước lịch chốt), phiếu lập sau lúc đếm */
  {
    veGio(7);
    const S = await moi();
    await nen(S);
    veGio(22);
    await S.call('PUT', '/counts', { khu: 'A', items: S.items({ D16: 100 }) }, 'An'); // 22h đếm
    advance(3600e3);
    await S.call('POST', '/transfers', { from: 'A', to: 'B', lines: [{ phi: 'D16', qty: 30 }] }, 'Cv'); // 23h
    clock.offset += 3600e3 + 60e3; // 0h01, lịch chưa chốt hôm qua
    eq('0h01 duyệt khu A (số hôm qua)', (await S.call('POST', '/review/duyet', { khu: 'A' }, 'Admin')).status, 200);
    eq('0h01: A 100, B 0 (phiếu chuyển không đổi tồn)', [await ton(S, 'A'), await ton(S, 'B')], [100, 0]);
    clock.offset += 4 * 60e3; await S.cron(); // 0h05 chốt hôm qua
    eq('sau lịch chốt: A 100, B 0', [await ton(S, 'A'), await ton(S, 'B')], [100, 0]);
    eq('sau lịch chốt: tổng bãi 100', (await tong(S)).cnt, 100);
  }

  /* ===== 2. Số đếm chưa duyệt chuyển qua 0h ===== */
  {
    veGio(7);
    const S = await moi();
    await nen(S);
    veGio(9);
    await S.call('PUT', '/counts', { khu: 'A', items: S.items({ D16: 100 }) }, 'An'); // 9h đếm 100, để đó
    veGio(14);
    await nhap(S, 'A', 50); // 14h: nhập 50, duyệt
    const k1 = (await rv(S)).khus.find((k) => k.khu === 'A');
    eq('cùng ngày: phiếu duyệt sau lúc đếm không đổi cấp duyệt khu', [k1.capBao, 'phieuSau' in k1, 'capPhieu' in k1], [0, false, false]);
    eq('cùng ngày: tồn vẫn tồn chuẩn 100 (số đếm chưa duyệt, phiếu không cộng)', await ton(S, 'A'), 100);
    veGio(1); await S.cron(); // chốt, số đếm chuyển sang hôm sau
    eq('tồn chuẩn sau chốt = tồn chuẩn cũ 100 (không cộng phiếu)', S.one("SELECT v FROM baseline WHERE khu_id = 'A' AND phi_id = 'D16' ORDER BY day DESC LIMIT 1").v, 100);
    // đã dùng = 100 + nhập 50 − 100: thép về mà chưa có số đếm duyệt thì thành "đã dùng" (cái giá của việc không tin giờ phiếu)
    eq('ngày đó: nhập 50, đã dùng 50', [S.one("SELECT nhap FROM daily_summary WHERE phi_id = 'D16' ORDER BY day DESC LIMIT 1").nhap,
      S.one("SELECT dung FROM daily_summary WHERE phi_id = 'D16' ORDER BY day DESC LIMIT 1").dung], [50, 50]);
    veGio(8);
    const k2 = (await rv(S)).khus.find((k) => k.khu === 'A');
    eq('hôm sau: số chuyển qua vẫn chờ, không cần cấp chỉ huy', [k2.waiting > 0, k2.capBao], [true, 0]);
    eq('CVKTHT duyệt được', (await S.call('POST', '/review/duyet', { khu: 'A' }, 'Cv')).status, 200);
    eq('tồn 100 = số đếm 9h hôm qua', await ton(S, 'A'), 100);
    const t = await tong(S);
    eq('đã dùng 0', [t.cnt, t.used], [100, 0]);
    veGio(1); await S.cron();
    eq('qua thêm một lần chốt: tồn chuẩn 100, ngày đó dùng 0', [S.one("SELECT v FROM baseline WHERE khu_id = 'A' AND phi_id = 'D16' ORDER BY day DESC LIMIT 1").v,
      S.one("SELECT dung FROM daily_summary WHERE phi_id = 'D16' ORDER BY day DESC LIMIT 1").dung], [100, 0]);
  }

  /* ===== 3. Huỷ phiếu nhập đã duyệt: luôn được, tồn không đổi ===== */
  {
    veGio(7);
    const S = await moi();
    await nen(S);
    veGio(8);
    const sai = await nhap(S, 'A', 50); // xe không về mà phiếu đã duyệt
    eq('phiếu nhập đã duyệt không cộng tồn', await ton(S, 'A'), 100);
    advance(60e3);
    await S.call('PUT', '/counts', { khu: 'A', items: S.items({ D16: 20 }) }, 'An'); // khu đếm thật: 20
    await S.call('POST', '/review/duyet', { khu: 'A' }, 'Admin');
    eq('tồn 20 theo số đếm', await ton(S, 'A'), 20);
    eq('đã dùng 130 (vì còn phiếu sai)', (await tong(S)).used, 130);
    const v = await S.call('DELETE', '/receipts/' + sai, undefined, 'Admin');
    eq('huỷ phiếu sai được', v.status, 200, JSON.stringify(v.data));
    eq('tồn vẫn 20, đã dùng 80', [await ton(S, 'A'), (await tong(S)).used], [20, 80]);
    // phiếu nhập rồi xuất quá số đếm: không bị chặn, tồn vẫn theo số đếm
    const p2 = await nhap(S, 'A', 50);
    const xr = await S.call('POST', '/xuat', { khu: 'A', noi: 'Cầu', lines: [{ phi: 'D16', qty: 60 }] }, 'Cv');
    eq('xuất 60 khi số đếm chỉ 20: không chặn', xr.status, 200);
    eq('duyệt phiếu xuất được', (await S.call('POST', `/receipts/${xr.data.id}/duyet`, {}, 'Trung')).status, 200);
    eq('tồn vẫn 20 sau xuất 60', await ton(S, 'A'), 20);
    eq('huỷ phiếu nhập sau khi đã xuất: được, không còn chặn tồn', (await S.call('DELETE', '/receipts/' + p2, undefined, 'Admin')).status, 200);
    eq('và tồn vẫn 20', await ton(S, 'A'), 20);
  }

  /* ===== 4. phi_rate không treo số cũ ===== */
  {
    veGio(7);
    const S = await moi();
    await nen(S);
    S.raw.prepare("INSERT OR REPLACE INTO phi_rate (phi_id, per_day, days) VALUES ('D36', 42, 20)").run(); // số cũ từ hơn 28 ngày trước
    S.raw.prepare("UPDATE daily_summary SET dung = NULL WHERE phi_id = 'D36'").run(); // ngày cũ của D36: không hợp lệ (vd. mốc đặt lại)
    S.raw.prepare("UPDATE phi SET active = 0 WHERE id = 'D36'").run(); // phi đã tắt, hết thép: lần chốt sau không ghi dòng nào cho nó
    veGio(1); await S.cron();
    eq('phi không có ngày dùng nào trong 28 ngày: xoá mức dùng cũ', S.one("SELECT COUNT(*) n FROM phi_rate WHERE phi_id = 'D36'").n, 0);
    ok('phi có ngày dùng vẫn có mức dùng', S.one("SELECT COUNT(*) n FROM phi_rate WHERE phi_id = 'D16'").n === 1);
  }

  /* ===== 5. Thẻ màn Duyệt: số "theo phiếu" chỉ để tham chiếu (v70) ===== */
  const the = async (S) => { const k = (await rv(S)).khus.find((x) => x.khu === "A"); const i = k.items.find((x) => x.phi === "D16"); return [i.exp, i.cnt, i.d, 'dem' in i || 'sau' in i || 'cho' in i]; };
  {
    // đếm 100 lúc 8h, 9h về thêm 50 (lập + duyệt): tham chiếu 150, khu báo 100, lệch −50 — duyệt xong tồn đúng 100
    veGio(7); const S = await moi(); await nen(S);
    veGio(8); await S.call('PUT', '/counts', { khu: 'A', items: S.items({ D16: 100 }) }, 'An');
    advance(3600e3); await nhap(S, 'A', 50); advance(3600e3);
    eq('phiếu đã duyệt sau lúc đếm: tham chiếu 150, khu báo 100, lệch −50, không còn dem/sau/cho', await the(S), [150, 100, -50, false]);
    await S.call('POST', '/review/duyet', { khu: 'A' }, 'Admin');
    eq('duyệt xong tồn = số khu báo 100', await ton(S, 'A'), 100);
  }
  {
    // phiếu ghi muộn chờ duyệt: không vào tham chiếu, không vào tồn
    veGio(7); const S = await moi(); await nen(S);
    veGio(8); await S.call('PUT', '/counts', { khu: 'A', items: S.items({ D16: 150 }) }, 'An');
    advance(3600e3); await S.call('POST', '/receipts', { khu: 'A', lines: [{ phi: 'D16', qty: 50 }] }, 'Cv'); advance(3600e3);
    eq('phiếu chờ: tham chiếu 100, khu báo 150, lệch +50', await the(S), [100, 150, 50, false]);
    await S.call('POST', '/review/duyet', { khu: 'A' }, 'Admin');
    eq('duyệt khu: tồn 150, phiếu vẫn chờ', [await ton(S, 'A'), S.sql('SELECT 1 FROM receipts WHERE duyet_day IS NULL').length], [150, 1]);
  }
  {
    // bootstrap không còn mốc phiếu (phieuTs) hay phần phiếu cộng lên số đếm (mvNew): luôn rỗng cho bản app cũ
    veGio(7); const S = await moi(); await nen(S);
    veGio(9); await S.call('PUT', '/counts', { khu: 'A', items: S.items({ D16: 100 }) }, 'An');
    veGio(14); await nhap(S, 'A', 50);
    veGio(1); await S.cron(); veGio(8);
    const bs = (await S.call('GET', '/bootstrap', undefined, 'Cv')).data;
    eq('bootstrap phieuTs / mvNew rỗng', [bs.phieuTs, bs.mvNew], [{}, []]);
  }

  const fail = T.filter((x) => x[0] === 'FAIL');
  console.log(T.map((x) => x[0] + ' | ' + x[1] + (x[2] && x[0] === 'FAIL' ? '  [' + x[2] + ']' : '')).join('\n'));
  console.log('\n=== ' + T.length + ' kiểm tra, ' + fail.length + ' lỗi ===');
  process.exit(fail.length ? 1 : 0);
}
main().catch((e) => { console.error('CRASH', e); process.exit(2); });
