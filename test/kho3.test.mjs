/* Hồi quy lõi tính tồn (10/2026, đợt 3): node kho3.test.mjs <đường-dẫn-repo>
   1. Phiếu LẬP SAU lúc khu đếm vẫn cộng lên số đếm khi duyệt cả hai cùng lúc (không tự sinh thép: tổng bãi giữ đúng).
   2. Số đếm chưa duyệt chuyển qua 0h: phiếu duyệt sau lúc đếm (hôm trước) vẫn cộng lên số đếm khi duyệt hôm sau, và vẫn cần cấp chỉ huy.
   3. Huỷ phiếu nhập sai đã duyệt sau khi khu đã đếm lại (số đếm đã duyệt nằm SAU phiếu): không đòi khu còn đủ thép.
   4. phi_rate: phi không còn ngày dùng nào trong 28 ngày thì mức dùng TB cũ bị xoá, không treo mãi. */
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
  const ton = async (S, khu, phi = 'D16') => (await tonCells(S.env, vnDay(), [{ khu, phi }], false))[khu + '|' + phi];
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

  /* ===== 1. Phiếu lập sau lúc đếm, duyệt chung với số đếm ===== */
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
    advance(3600e3); // 11h: duyệt khu A — duyệt luôn phiếu
    eq(loai + ': duyệt khu A (số + phiếu)', (await S.call('POST', '/review/duyet', { khu: 'A' }, 'Admin')).status, 200);
    eq(loai + ': khu A còn 10 (đếm 100 lúc 8h, rút 90 lúc 10h)', await ton(S, 'A'), 10);
    if (loai === 'chuyen') eq('chuyen: khu B 90', await ton(S, 'B'), 90);
    const t = await tong(S);
    eq(loai + ': tổng bãi / đã dùng', [t.cnt, t.used], loai === 'chuyen' ? [100, 0] : [10, 90]);
    eq(loai + ': khu A không bị nhắc xem lại', (await rv(S)).khus.find((k) => k.khu === 'A').recheck, false);
    // qua chốt sổ: tồn chuẩn giữ đúng số
    veGio(1); await S.cron();
    eq(loai + ': sau chốt sổ khu A vẫn 10', await ton(S, 'A'), 10);
    if (loai === 'chuyen') eq('chuyen: sau chốt sổ tổng bãi vẫn 100', (await tong(S)).cnt, 100);
  }
  /* phiếu lập TRƯỚC lúc đếm vẫn coi là nằm trong số đếm (khu đếm sau khi thép đã về) */
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
  }
  /* đếm trước nửa đêm, duyệt lúc 0h01 (trước lịch chốt), phiếu lập sau lúc đếm duyệt chung */
  {
    veGio(7);
    const S = await moi();
    await nen(S);
    veGio(22);
    await S.call('PUT', '/counts', { khu: 'A', items: S.items({ D16: 100 }) }, 'An'); // 22h đếm
    advance(3600e3);
    await S.call('POST', '/transfers', { from: 'A', to: 'B', lines: [{ phi: 'D16', qty: 30 }] }, 'Cv'); // 23h
    clock.offset += 3600e3 + 60e3; // 0h01, lịch chưa chốt hôm qua
    eq('0h01 duyệt khu A (số hôm qua + phiếu lập sau lúc đếm)', (await S.call('POST', '/review/duyet', { khu: 'A' }, 'Admin')).status, 200);
    eq('0h01: A 70, B 30', [await ton(S, 'A'), await ton(S, 'B')], [70, 30]);
    clock.offset += 4 * 60e3; await S.cron(); // 0h05 chốt hôm qua
    eq('sau lịch chốt: A 70, B 30', [await ton(S, 'A'), await ton(S, 'B')], [70, 30]);
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
    eq('cùng ngày: phiếu duyệt sau lúc đếm, cần cấp chỉ huy', [k1.phieuSau, k1.capPhieu], [true, 2]);
    veGio(1); await S.cron(); // chốt, số đếm chuyển sang hôm sau
    eq('tồn chuẩn sau chốt 150', S.one("SELECT v FROM baseline WHERE khu_id = 'A' AND phi_id = 'D16' ORDER BY day DESC LIMIT 1").v, 150);
    veGio(8);
    const k2 = (await rv(S)).khus.find((k) => k.khu === 'A');
    eq('hôm sau: vẫn cần cấp chỉ huy', [k2.waiting > 0, k2.phieuSau, k2.capPhieu], [true, true, 2]);
    eq('CVKTHT không duyệt được', (await S.call('POST', '/review/duyet', { khu: 'A' }, 'Cv')).status, 403);
    eq('chỉ huy duyệt', (await S.call('POST', '/review/duyet', { khu: 'A' }, 'Admin')).status, 200);
    eq('tồn 150 (đếm 100 lúc 9h hôm qua + 50 về lúc 14h)', await ton(S, 'A'), 150);
    const t = await tong(S);
    eq('đã dùng 0', [t.cnt, t.used], [150, 0]);
    veGio(1); await S.cron();
    eq('qua thêm một lần chốt: tồn chuẩn 150, ngày đó dùng 0', [S.one("SELECT v FROM baseline WHERE khu_id = 'A' AND phi_id = 'D16' ORDER BY day DESC LIMIT 1").v,
      S.one("SELECT dung FROM daily_summary WHERE phi_id = 'D16' ORDER BY day DESC LIMIT 1").dung], [150, 0]);
  }

  /* ===== 3. Huỷ phiếu nhập sai sau khi khu đã đếm lại ===== */
  {
    veGio(7);
    const S = await moi();
    await nen(S);
    veGio(8);
    const sai = await nhap(S, 'A', 50); // xe không về mà phiếu đã duyệt
    advance(60e3);
    await S.call('PUT', '/counts', { khu: 'A', items: S.items({ D16: 20 }) }, 'An'); // khu đếm thật: 20
    await S.call('POST', '/review/duyet', { khu: 'A' }, 'Admin');
    eq('tồn 20 theo số đếm', await ton(S, 'A'), 20);
    eq('đã dùng 130 (vì còn phiếu sai)', (await tong(S)).used, 130);
    const v = await S.call('DELETE', '/receipts/' + sai, undefined, 'Admin');
    eq('huỷ phiếu sai được', v.status, 200, JSON.stringify(v.data));
    eq('tồn vẫn 20, đã dùng 80', [await ton(S, 'A'), (await tong(S)).used], [20, 80]);
    // phiếu còn "sống" (duyệt sau lần đếm) thì vẫn chặn khi khu không còn đủ thép
    const p2 = await nhap(S, 'A', 50);
    await S.call('POST', '/xuat', { khu: 'A', noi: 'Cầu', lines: [{ phi: 'D16', qty: 60 }] }, 'Cv');
    const x = S.one("SELECT id FROM receipts WHERE kind = 'xuat' ORDER BY id DESC LIMIT 1").id;
    await S.call('POST', `/receipts/${x}/duyet`, {}, 'Trung');
    eq('tồn 10 sau xuất 60', await ton(S, 'A'), 10);
    eq('huỷ phiếu nhập còn trong tồn mà thép đã xuất: chặn', (await S.call('DELETE', '/receipts/' + p2, undefined, 'Admin')).status, 400);
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

  /* ===== 5. Thẻ màn Duyệt nói đúng điều bấm Duyệt sẽ làm (rà soát sau đợt 3) ===== */
  const the = async (S) => { const k = (await rv(S)).khus.find((x) => x.khu === "A"); const i = k.items.find((x) => x.phi === "D16"); return [i.dem, i.cnt, i.d, i.sau, i.cho]; };
  {
    // đếm 100 lúc 8h, 9h về thêm 50 (lập + duyệt): số đếm không gồm 50 đó — thẻ không được báo "hụt 50"
    veGio(7); const S = await moi(); await nen(S);
    veGio(8); await S.call('PUT', '/counts', { khu: 'A', items: S.items({ D16: 100 }) }, 'An');
    advance(3600e3); await nhap(S, 'A', 50); advance(3600e3);
    eq('phiếu đã duyệt lập sau lúc đếm: dự kiến 100, khu báo 100, lệch 0, sau +50', await the(S), [100, 100, 0, 50, 0]);
    await S.call('POST', '/review/duyet', { khu: 'A' }, 'Admin');
    eq('duyệt xong tồn 150 như thẻ nói', await ton(S, 'A'), 150);
  }
  {
    // phiếu ghi muộn: thép về 7h30, khu đếm 150 lúc 8h, 9h mới lập phiếu +50 (chờ duyệt): thẻ phải nói duyệt xong là 200
    veGio(7); const S = await moi(); await nen(S);
    veGio(8); await S.call('PUT', '/counts', { khu: 'A', items: S.items({ D16: 150 }) }, 'An');
    advance(3600e3); await S.call('POST', '/receipts', { khu: 'A', lines: [{ phi: 'D16', qty: 50 }] }, 'Cv'); advance(3600e3);
    eq('phiếu chờ lập sau lúc đếm: lệch +50 và cho +50 (người duyệt thấy sẽ thành 200)', await the(S), [100, 150, 50, 0, 50]);
  }
  {
    // số đếm chuyển qua 0h + phiếu duyệt chiều hôm trước sau lúc đếm: Tổng quan (bootstrap) cũng biết CVKTHT không duyệt được
    veGio(7); const S = await moi(); await nen(S);
    veGio(9); await S.call('PUT', '/counts', { khu: 'A', items: S.items({ D16: 100 }) }, 'An');
    veGio(14); await nhap(S, 'A', 50);
    veGio(1); await S.cron(); veGio(8);
    const bs = (await S.call('GET', '/bootstrap', undefined, 'Cv')).data;
    const subTs = bs.counts.filter((c) => c.khu_id === 'A').reduce((m, c) => Math.max(m, c.ts || 0), 0);
    ok('bootstrap phieuTs gồm phiếu ngày đã chốt sau lúc đếm (khớp phieuSau của màn Duyệt)', ((bs.phieuTs || {}).A || 0) > subTs, JSON.stringify([(bs.phieuTs || {}).A, subTs]));
  }

  const fail = T.filter((x) => x[0] === 'FAIL');
  console.log(T.map((x) => x[0] + ' | ' + x[1] + (x[2] && x[0] === 'FAIL' ? '  [' + x[2] + ']' : '')).join('\n'));
  console.log('\n=== ' + T.length + ' kiểm tra, ' + fail.length + ' lỗi ===');
  process.exit(fail.length ? 1 : 0);
}
main().catch((e) => { console.error('CRASH', e); process.exit(2); });
