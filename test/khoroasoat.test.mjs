/* Hồi quy đợt rà soát kho (10/2026): node khoroasoat.test.mjs <đường-dẫn-repo>
   1. Duyệt số đếm của hôm qua lúc vừa qua nửa đêm (trước khi lịch chốt sổ): phiếu duyệt cùng lúc không bị cộng HAI LẦN.
   2. "Duyệt tất cả" không gồm khu chỉ cần xem lại — không làm mất phiếu duyệt sau lần đếm.
   3. Đổi PIN: thử PIN mới quá dễ nhiều lần không khoá tài khoản.
   4. Phi tên lạ ("constructor", "__proto__") không lọt vào sổ; PUT /phi có dòng null là 400. */
import { boot, clock, advance, vnDay } from './harness.mjs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.argv[2] || '.';
const T = [];
const ok = (name, cond, extra) => { T.push([cond ? 'PASS' : 'FAIL', name, extra === undefined ? '' : String(extra)]); };
const eq = (name, a, b) => ok(name + ' = ' + JSON.stringify(b), JSON.stringify(a) === JSON.stringify(b), 'thực tế: ' + JSON.stringify(a));

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
  /* ===== 1. Duyệt lúc 0h01, lịch chốt sổ 0h05 ===== */
  {
    const vnMs = (Date.now() + 7 * 3600e3) % 864e5;
    clock.offset += 20 * 3600e3 - vnMs + (vnMs > 20 * 3600e3 ? 864e5 : 0); // 20h hôm nay
    const S = await moi();
    const ton = async () => (await tonCells(S.env, vnDay(), [{ khu: 'A', phi: 'D16' }], false))['A|D16'];
    await S.call('PUT', '/counts', { khu: 'A', items: S.items({ D16: 50 }) }, 'An');
    await S.call('POST', '/review/duyet', { khu: 'A' }, 'Admin');
    clock.offset += 6 * 3600e3; await S.cron(); // 2h sáng: chốt ngày đầu
    clock.offset += 15 * 3600e3; // 17h
    await S.call('POST', '/receipts', { khu: 'A', lines: [{ phi: 'D16', qty: 100 }] }, 'Cv');
    await S.call('PUT', '/counts', { khu: 'A', items: S.items({ D16: 150 }) }, 'An');
    clock.offset += 7 * 3600e3 + 60e3; // 0h01 hôm sau, lịch chưa chạy
    eq('0h01 duyệt khu (kèm phiếu chờ): tồn 150', [(await S.call('POST', '/review/duyet', { khu: 'A' }, 'Admin')).status, await ton()], [200, 150]);
    clock.offset += 4 * 60e3; await S.cron(); // 0h05: chốt hôm qua
    eq('sau khi lịch chốt sổ hôm qua: tồn vẫn 150, không cộng phiếu hai lần', await ton(), 150);
    eq('màn Duyệt cũng thấy 150', (await S.call('GET', '/review', undefined, 'Admin')).data.khus.find((k) => k.khu === 'A').items.find((x) => x.phi === 'D16').exp, 150);
    clock.offset += 24 * 3600e3; await S.cron();
    eq('qua thêm một lần chốt nữa: vẫn 150', await ton(), 150);
  }
  /* ===== 2. Duyệt tất cả và khu chỉ cần xem lại ===== */
  {
    const S = await moi();
    const ton = async () => (await tonCells(S.env, vnDay(), [{ khu: 'A', phi: 'D16' }], false))['A|D16'];
    await S.call('PUT', '/counts', { khu: 'A', items: S.items({ D16: 100 }) }, 'An');
    advance(1000); await S.call('POST', '/review/duyet', { khu: 'A' }, 'Admin');
    advance(1000);
    const r = await S.call('POST', '/receipts', { khu: 'A', lines: [{ phi: 'D16', qty: 50 }] }, 'Cv');
    await S.call('POST', `/receipts/${r.data.id}/duyet`, {}, 'Trung');
    advance(1000);
    eq('khu A chỉ cần xem lại (phiếu duyệt sau lần đếm)', (await S.call('GET', '/review', undefined, 'Admin')).data.exceptions.map((e) => e.type + ':' + e.khu), ['recheck:A']);
    const d = await S.call('POST', '/review/duyet', { all: true }, 'Admin');
    eq('"Duyệt tất cả" không đụng khu đó, phiếu vẫn trong tồn', [d.status, await ton()], [400, 150]);
    eq('vẫn duyệt lại từng khu được', (await S.call('POST', '/review/duyet', { khu: 'A' }, 'Admin')).status, 200);
  }
  /* ===== 3. Đổi PIN ===== */
  {
    const S = await moi();
    const r = await S.call('POST', '/users', { name: 'Moi', phone: '0900000009', role: 'tieudoi' }, 'Admin');
    await S.login('Moi', '0900000009', r.data.pin);
    for (let i = 0; i < 6; i++) await S.call('POST', '/change-pin', { pin: r.data.pin, newPin: '1234' }, 'Moi');
    eq('thử PIN mới quá dễ 6 lần: vẫn đổi được PIN hợp lệ', (await S.call('POST', '/change-pin', { pin: r.data.pin, newPin: '2580' }, 'Moi')).status, 200);
    eq('và đăng nhập bằng PIN mới', (await S.call('POST', '/login', { phone: '0900000009', pin: '2580' }, 'Moi2')).status, 200);
    let st = 0;
    for (let i = 0; i < 6; i++) st = (await S.call('POST', '/change-pin', { pin: '0000', newPin: '3691' }, 'Moi2')).status;
    eq('đoán sai PIN hiện tại nhiều lần vẫn bị khoá', st, 429);
  }
  /* ===== 4. Dữ liệu lạ ===== */
  {
    const S = await moi();
    const bad = await S.call('PUT', '/counts', { khu: 'A', items: [...S.items({ D16: 5 }), { phi: 'constructor', v: 5, kind: 'dem' }] }, 'An');
    eq('phi "constructor": từ chối, không ghi gì', [bad.status, S.one("SELECT COUNT(*) n FROM counts WHERE phi_id = 'constructor'").n], [400, 0]);
    eq('phi "__proto__": từ chối', (await S.call('PUT', '/counts', { khu: 'A', items: [...S.items({}), { phi: '__proto__', v: 1, kind: 'dem' }] }, 'An')).status, 400);
    eq('PUT /phi có dòng null: 400', (await S.call('PUT', '/phi', { items: [null] }, 'Admin')).status, 400);
    eq('PUT /phi id "toString": 400', (await S.call('PUT', '/phi', { items: [{ id: 'toString', bo_size: 5 }] }, 'Admin')).status, 400);
  }

  const fail = T.filter((x) => x[0] === 'FAIL');
  console.log(T.map((x) => x[0] + ' | ' + x[1] + (x[2] && x[0] === 'FAIL' ? '  [' + x[2] + ']' : '')).join('\n'));
  console.log('\n=== ' + T.length + ' kiểm tra, ' + fail.length + ' lỗi ===');
  process.exit(fail.length ? 1 : 0);
}
main().catch((e) => { console.error('CRASH', e); process.exit(2); });
