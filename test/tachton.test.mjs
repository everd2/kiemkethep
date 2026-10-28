/* Tách tồn bãi khỏi phiếu kho (v70, chủ bãi chốt 10/2026): node tachton.test.mjs <đường-dẫn-repo>
   Phiếu ở bãi được ghi thất thường, thường ghi muộn, nên giờ ghi phiếu không đáng tin để biết phiếu đã nằm trong số đếm chưa.
   Luật mới:
   1. TỒN BÃI của một ô (khu × phi) = báo cáo đếm ĐÃ DUYỆT gần nhất của ô trong kỳ đang mở; chưa có thì tồn chuẩn lần chốt trước.
      Phiếu kho (nhập, chuyển, xuất, điều chỉnh, vay) không cộng / trừ vào tồn ở bất cứ đâu (tonCells, bootstrap, màn Duyệt, CSV).
   2. Phiếu kho chỉ là THỐNG KÊ: vẫn lập / duyệt / từ chối / huỷ như cũ, nhưng không còn bị chặn "Khu A chỉ còn N cây…".
   3. "Đã dùng" của ngày = tồn chuẩn hôm qua + nhập (phiếu đã duyệt, định nghĩa cũ) − tồn chuẩn hôm nay.
      Tồn chuẩn lúc chốt = số đếm đã duyệt của ô, chưa có thì tồn chuẩn cũ — không có vế phiếu.
   4. Duyệt khu CHỈ duyệt số đếm; phiếu chờ của khu vẫn chờ, duyệt riêng (cấp chỉ huy). CVKTHT duyệt được số đếm của cấp dưới
      dù khu đang có phiếu chờ.
   5. Thẻ màn Duyệt: exp = tồn chuẩn + phiếu đã duyệt trong kỳ (số THAM CHIẾU theo phiếu), d = số đếm − exp. Không còn dem / sau /
      cho, không còn recheck / capPhieu / phieuSau. */
import { boot, clock, advance, addDays, vnDay } from './harness.mjs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.argv[2] || '.';
const T = [];
const ok = (name, cond, extra) => { T.push([cond ? 'PASS' : 'FAIL', name, extra === undefined ? '' : String(extra)]); };
const eq = (name, a, b) => ok(name + ' = ' + JSON.stringify(b), JSON.stringify(a) === JSON.stringify(b), 'thực tế: ' + JSON.stringify(a));

// đặt đồng hồ về h giờ (giờ VN) của hôm nay, hoặc hôm sau nếu đã qua — test không phụ thuộc KT_LECH_PHUT
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
  S.items = (vals) => S.phi.map((phi) => (vals[phi] === undefined ? { phi, v: 0, kind: 'zero' } : typeof vals[phi] === 'object'
    ? { phi, ...vals[phi] } : { phi, v: vals[phi], kind: 'dem' }));
  return S;
}

async function main() {
  const { tonCells } = await import(pathToFileURL(path.join(ROOT, 'src/phieu.js')).href);
  const { closeDayAuto } = await import(pathToFileURL(path.join(ROOT, 'src/review.js')).href);
  const ton = async (S, khu, phi = 'D16') => (await tonCells(S.env, vnDay(), [{ khu, phi }]))[khu + '|' + phi];
  const rv = async (S, ai = 'Admin') => (await S.call('GET', '/review', undefined, ai)).data;
  const hang = async (S, phi = 'D16') => (await rv(S)).rows.find((x) => x.phi === phi);
  const muc = async (S, khu, phi = 'D16') => ((await rv(S)).khus.find((k) => k.khu === khu).items.find((i) => i.phi === phi)) || null;
  const pduyet = (S, id) => S.call('POST', `/receipts/${id}/duyet`, {}, 'Trung');
  const nhap = async (S, khu, qty, duyet = true) => {
    const r = await S.call('POST', '/receipts', { khu, lines: [{ phi: 'D16', qty }] }, 'Cv');
    if (duyet) await pduyet(S, r.data.id);
    return r.data.id;
  };
  const dem = (S, khu, v, ai = 'An') => S.call('PUT', '/counts', { khu, items: S.items({ D16: v }) }, ai);
  const dkhu = (S, khu, ai = 'Admin') => S.call('POST', '/review/duyet', { khu }, ai);
  // tồn mà Tổng quan / Tồn bãi hiện (bootstrap): số đếm hiệu lực, chưa có thì tồn chuẩn; mvNew phải luôn rỗng
  const tonBoot = async (S, khu, phi = 'D16') => {
    const b = (await S.call('GET', '/bootstrap', undefined, 'Admin')).data;
    const f = (arr) => (arr.find((x) => x.khu_id === khu && x.phi_id === phi) || {}).v;
    const e = f(b.eff);
    return { v: e === undefined ? f(b.baseline) || 0 : e, mvNew: b.mvNew, phieuTs: b.phieuTs };
  };
  const cotCsv = async (S, khu = 'Khu A', phi = 'D16') => {
    const d = String((await S.call('GET', '/export?date=' + vnDay(), undefined, 'Admin')).data).split(/\r?\n/);
    const i = (d.find((l) => l.startsWith('"Khu"')) || '').split(';').findIndex((x) => x === '"' + phi + '"');
    return Number((d.find((l) => l.startsWith('"' + khu + '"')) || '').split(';')[i]);
  };
  // chốt sổ HÔM NAY bằng đúng hàm tự chốt, rồi sang ngày mai 9h; trả về [tồn chuẩn A/D16, daily_summary nhap, dung]
  const chot = async (S) => {
    const d = vnDay();
    await closeDayAuto(S.env, d);
    const b = S.one("SELECT v FROM baseline WHERE day = ? AND khu_id = 'A' AND phi_id = 'D16'", d);
    const sm = S.one("SELECT nhap, dung FROM daily_summary WHERE day = ? AND phi_id = 'D16'", d) || {};
    addDays(1); veGio(9);
    return [b ? b.v : null, sm.nhap, sm.dung];
  };
  // ngày đầu: khu A đếm 100 cây D16, duyệt, chốt — tồn chuẩn 100
  const nen = async () => {
    veGio(9);
    const S = await moi();
    await dem(S, 'A', 100); advance(1000);
    await dkhu(S, 'A'); advance(1000);
    await chot(S);
    return S;
  };

  /* ===== 1. Tồn chỉ theo số đếm: phiếu nhập đã duyệt mà khu chưa đếm KHÔNG vào tồn ===== */
  {
    const S = await nen();
    eq('1: tồn chuẩn 100', await ton(S, 'A'), 100);
    await nhap(S, 'A', 50); advance(60e3);
    eq('1: phiếu +50 đã duyệt, khu chưa đếm: tonCells vẫn 100', await ton(S, 'A'), 100);
    const tb = await tonBoot(S, 'A');
    eq('1: bootstrap (Tổng quan) vẫn 100, mvNew rỗng, phieuTs rỗng', [tb.v, tb.mvNew, tb.phieuTs], [100, [], {}]);
    eq('1: màn Duyệt: tổng bãi 100', (await hang(S)).cnt, 100);
    eq('1: CSV tồn kho: 100', await cotCsv(S), 100);
    // tham chiếu theo phiếu vẫn thấy phiếu: tồn chuẩn 100 + 50
    const it = await muc(S, 'A');
    eq('1: thẻ khu A: tham chiếu 150 (tồn chuẩn + phiếu), chưa báo', [it.ref, it.mv, it.exp, it.cnt], [100, 50, 150, null]);
    // khu đếm thật 150 rồi được duyệt: tồn = 150
    await dem(S, 'A', 150); advance(60e3);
    eq('1: số 150 chưa duyệt: tồn vẫn 100', await ton(S, 'A'), 100);
    await dkhu(S, 'A'); advance(60e3);
    eq('1: duyệt số 150: tồn 150 ở mọi cửa', [await ton(S, 'A'), (await tonBoot(S, 'A')).v, (await hang(S)).cnt, await cotCsv(S)], [150, 150, 150, 150]);
  }

  /* ===== 2. Phiếu lập / duyệt TRƯỚC hay SAU lúc đếm đều không đổi tồn ===== */
  for (const truoc of [true, false]) {
    const ten = truoc ? '2a (phiếu lập trước lúc đếm)' : '2b (phiếu lập sau lúc đếm)';
    const S = await nen();
    let id = null;
    if (truoc) { id = await nhap(S, 'A', 40, false); advance(60e3); }
    await dem(S, 'A', 120); advance(60e3);
    if (!truoc) { id = await nhap(S, 'A', 40, false); advance(60e3); }
    eq(ten + ': duyệt khu A', (await dkhu(S, 'A')).status, 200);
    eq(ten + ': tồn = số đếm 120', await ton(S, 'A'), 120);
    eq(ten + ': phiếu vẫn chờ duyệt sau Duyệt khu', S.one('SELECT duyet_day d FROM receipts WHERE id = ?', id).d, null);
    advance(60e3);
    eq(ten + ': duyệt riêng phiếu', (await pduyet(S, id)).status, 200);
    eq(ten + ': duyệt phiếu xong tồn vẫn 120', [await ton(S, 'A'), (await tonBoot(S, 'A')).v, (await hang(S)).cnt], [120, 120, 120]);
    advance(60e3);
    eq(ten + ': huỷ phiếu đã duyệt được', (await S.call('DELETE', '/receipts/' + id, undefined, 'Trung')).status, 200);
    eq(ten + ': huỷ xong tồn vẫn 120', await ton(S, 'A'), 120);
    // tồn chuẩn lúc chốt = số đếm; phiếu đã huỷ nên nhập 0, dùng = 100 + 0 − 120 = −20
    eq(ten + ': chốt: tồn chuẩn 120, nhập 0, dùng −20', await chot(S), [120, 0, -20]);
  }

  /* ===== 3. Phiếu ghi MUỘN không bị cộng hai lần =====
     Xe về 8h với 50 cây, khu đếm 10h thấy 150 (đã gồm xe), 15h mới có người ghi phiếu nhập +50 và duyệt. Luật v69 cộng phiếu
     lập sau lúc đếm lên số đếm → tồn 200 (thép tự sinh 50). Nay tồn = 150, và đã dùng = 100 + 50 − 150 = 0. */
  {
    const S = await nen();
    veGio(10);
    await dem(S, 'A', 150); advance(60e3);
    await dkhu(S, 'A');
    veGio(15);
    await nhap(S, 'A', 50); advance(60e3);
    eq('3: phiếu ghi muộn: tồn vẫn 150 (không 200)', [await ton(S, 'A'), (await tonBoot(S, 'A')).v, (await hang(S)).cnt, await cotCsv(S)], [150, 150, 150, 150]);
    const it = await muc(S, 'A');
    eq('3: thẻ khu: tham chiếu 150, khu báo 150, lệch 0', [it.exp, it.cnt, it.d], [150, 150, 0]);
    ok('3: thẻ không còn dem / sau / cho', !['dem', 'sau', 'cho'].some((f) => f in it), JSON.stringify(it));
    eq('3: đã dùng hôm nay 0', (await hang(S)).used, 0);
    eq('3: chốt: tồn chuẩn 150, nhập 50, dùng 0', await chot(S), [150, 50, 0]);
    eq('3: hôm sau tồn 150', await ton(S, 'A'), 150);
  }

  /* ===== 4. Chuyển / xuất / điều chỉnh giảm / cho vay / huỷ phiếu nhập: không bao giờ bị chặn theo tồn ===== */
  {
    const S = await nen();
    // khu C chưa từng có thép (tồn 0): mọi phiếu rút thép vẫn lập và duyệt được
    const tr = await S.call('POST', '/transfers', { from: 'C', to: 'B', lines: [{ phi: 'D16', qty: 500 }] }, 'Cv');
    eq('4: chuyển 500 từ khu trống: lập được', tr.status, 200);
    ok('4: không còn lời "chỉ còn"', !/chỉ còn/.test(JSON.stringify(tr.data)), JSON.stringify(tr.data));
    eq('4: duyệt phiếu chuyển được', (await pduyet(S, tr.data.id)).status, 200);
    const xu = await S.call('POST', '/xuat', { khu: 'A', noi: 'Cầu 3', lines: [{ phi: 'D16', qty: 300 }] }, 'Cv');
    eq('4: xuất 300 khi khu chỉ có 100: lập được', xu.status, 200);
    eq('4: duyệt phiếu xuất được', (await pduyet(S, xu.data.id)).status, 200);
    const dc = await S.call('POST', '/adjust', { khu: 'A', dir: 'giam', reason: 'dem_sai', lines: [{ phi: 'D16', qty: 400 }] }, 'Cv');
    eq('4: điều chỉnh giảm 400 khi khu có 100: lập được', dc.status, 200);
    eq('4: duyệt điều chỉnh được', (await pduyet(S, dc.data.id)).status, 200);
    const dt = (await S.call('POST', '/doitac', { name: 'Cty Bắc Hà' }, 'Admin')).data.id;
    const ln = await S.call('POST', '/loans', { bienban: true, zalo: true, so_bb: 'BB-9', doitac: dt, kind: 'cho_vay', khu: 'A', lines: [{ phi: 'D16', qty: 900 }] }, 'Cv');
    eq('4: cho vay 900 qua bãi khi khu có 100: ghi được', ln.status, 200);
    eq('4: duyệt lần cho vay (kèm phiếu kho) được', (await S.call('POST', '/loans/' + ln.data.ids[0] + '/duyet', {}, 'Trung')).status, 200);
    const nid = await nhap(S, 'A', 70);
    eq('4: huỷ phiếu nhập đã duyệt sau khi đã xuất / chuyển: được', (await S.call('DELETE', '/receipts/' + nid, undefined, 'Trung')).status, 200);
    eq('4: tồn mọi khu không đổi (A 100, B 0, C 0)', [await ton(S, 'A'), await ton(S, 'B'), await ton(S, 'C')], [100, 0, 0]);
    // tham chiếu theo phiếu của khu A: 100 − 300 − 400 − 900 = −1500 (chỉ để soi, không phải tồn)
    eq('4: thẻ khu A: tham chiếu theo phiếu −1500', (await muc(S, 'A')).exp, -1500);
    // "giữ nguyên" vẫn được sau khi ô có phiếu (bản cũ cấm)
    eq('4: giữ nguyên 100 sau các phiếu: nhận', (await dem(S, 'A', { v: 100, kind: 'giu' })).status, 200);
  }

  /* ===== 5. Đã dùng = tồn chuẩn hôm qua + nhập − tồn chuẩn hôm nay; tồn chuẩn = số đếm, không có thì tồn chuẩn cũ ===== */
  {
    const S = await nen();
    await nhap(S, 'A', 80); advance(60e3);
    await nhap(S, 'B', 30); advance(60e3);
    await dem(S, 'A', 130); advance(60e3);
    await dkhu(S, 'A'); advance(60e3);
    // khu B có phiếu +30 nhưng không đếm: tồn B vẫn 0, tồn chuẩn B giữ 0
    const h = await hang(S);
    // tồn cũ 100 + nhập (80 + 30) − tồn (A 130 + B 0) = 80
    eq('5: màn Duyệt: tồn cũ 100, nhập 110, tồn 130, đã dùng 80', [h.old, h.inn, h.cnt, h.used], [100, 110, 130, 80]);
    const d = vnDay();
    eq('5: chốt: tồn chuẩn A 130, nhập 110, dùng 80', await chot(S), [130, 110, 80]);
    eq('5: tồn chuẩn B = tồn chuẩn cũ 0 (phiếu không vào tồn chuẩn)', S.one("SELECT v FROM baseline WHERE day = ? AND khu_id = 'B' AND phi_id = 'D16'", d).v, 0);
    // hôm sau khu B đếm được 30 (thép xe hôm qua): tồn 30, đã dùng hôm nay = 130 + 0 − 160 = −30 (bù lại hôm qua)
    await dem(S, 'B', 30); advance(60e3);
    await dkhu(S, 'B'); advance(60e3);
    eq('5: hôm sau B đếm 30: tồn B 30, đã dùng −30', [await ton(S, 'B'), (await hang(S)).used], [30, -30]);
    // ô không có số đếm nào thì tồn chuẩn được giữ nguyên qua nhiều lần chốt
    await chot(S);
    eq('5: A không báo hôm nay: tồn chuẩn A giữ 130', S.one("SELECT v FROM baseline WHERE day = ? AND khu_id = 'A' AND phi_id = 'D16'", (await rv(S)).last).v, 130);
  }

  /* ===== 6. Duyệt khu để nguyên phiếu chờ; CVKTHT duyệt được số đếm dù khu còn phiếu chờ ===== */
  {
    const S = await nen();
    const pid = await nhap(S, 'A', 60, false); advance(60e3);
    await dem(S, 'A', 160); advance(60e3);
    const k = (await rv(S, 'Cv')).khus.find((x) => x.khu === 'A');
    ok('6: thẻ khu không còn capPhieu / phieuSau / recheck', !['capPhieu', 'phieuSau', 'recheck'].some((f) => f in k), JSON.stringify(Object.keys(k)));
    eq('6: thẻ khu vẫn nhắc phiếu chờ của khu', k.phieu.length, 1);
    const r = await dkhu(S, 'A', 'Cv');
    eq('6: CVKTHT duyệt khu có phiếu chờ: được', r.status, 200);
    ok('6: trả lời không còn phần "phieu"', !('phieu' in r.data), JSON.stringify(r.data));
    eq('6: phiếu vẫn chờ duyệt', S.one('SELECT duyet_day d FROM receipts WHERE id = ?', pid).d, null);
    eq('6: tồn = số đếm 160', await ton(S, 'A'), 160);
    eq('6: CVKTHT không duyệt được phiếu kho (như cũ)', (await S.call('POST', `/receipts/${pid}/duyet`, {}, 'Cv')).status, 403);
    // khu không còn số đếm nào chờ: Duyệt khu không có gì để làm (phiếu chờ không tính)
    eq('6: Duyệt khu lần nữa: không có gì chờ', (await dkhu(S, 'A')).status, 400);
    eq('6: Duyệt tất cả: không có gì chờ', (await S.call('POST', '/review/duyet', { all: true }, 'Admin')).status, 400);
    const ex = (await rv(S)).exceptions.map((e) => e.type);
    ok('6: việc treo còn phiếu chờ, không có recheck', ex.includes('receipt_pending') && !ex.includes('recheck'), JSON.stringify(ex));
    eq('6: cấp chỉ huy duyệt phiếu riêng', (await pduyet(S, pid)).status, 200);
    eq('6: tồn vẫn 160', await ton(S, 'A'), 160);
  }

  /* ===== 7. Thẻ màn Duyệt: tham chiếu theo phiếu và lệch ===== */
  {
    const S = await nen();
    await nhap(S, 'A', 50); advance(60e3);
    await S.call('POST', '/xuat', { khu: 'A', noi: 'Cầu', lines: [{ phi: 'D16', qty: 20 }] }, 'Cv').then((x) => pduyet(S, x.data.id));
    advance(60e3);
    await dem(S, 'A', 120); advance(60e3);
    let it = await muc(S, 'A');
    // tồn chuẩn 100 + 50 − 20 = 130; khu báo 120 → lệch −10
    eq('7: [ref, mv, exp, cnt, d] = [100, 30, 130, 120, −10]', [it.ref, it.mv, it.exp, it.cnt, it.d], [100, 30, 130, 120, -10]);
    eq('7: chưa duyệt', it.duyet, false);
    eq('7: tồn trước khi duyệt vẫn tồn chuẩn 100', await ton(S, 'A'), 100);
    await dkhu(S, 'A'); advance(60e3);
    it = await muc(S, 'A');
    eq('7: duyệt xong: tồn đúng bằng số khu báo 120 (không cộng phiếu)', [await ton(S, 'A'), it.duyet], [120, true]);
    // used = 100 + (30 − (−20)) − 120 = 30: xuất 20 có phiếu + 10 không rõ
    const h = await hang(S);
    eq('7: đã dùng 30, trong đó xuất có phiếu 20', [h.used, h.xuat], [30, 20]);
  }

  const fails = T.filter((t) => t[0] === 'FAIL');
  T.forEach((t) => console.log(t[0] + ' | ' + t[1] + (t[0] === 'FAIL' && t[2] ? '  [' + t[2] + ']' : '')));
  console.log(`=== ${T.length} kiểm tra, ${fails.length} lỗi ===`);
  process.exit(fails.length ? 1 : 0);
}
// vỡ giữa chừng thì vẫn in các kiểm tra đã chạy, để biết vỡ ở đâu
main().catch((e) => { T.filter((t) => t[0] === 'FAIL').forEach((t) => console.log('FAIL | ' + t[1] + '  [' + t[2] + ']')); console.log('CRASH ' + (e && e.stack || e)); process.exit(1); });
