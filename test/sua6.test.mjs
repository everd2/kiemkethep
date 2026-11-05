/* Hồi quy đợt sửa 6 (rà soát báo cáo sản lượng / báo cáo quân số, chống tính lặp, 2026-11-04):
   - hai tổ cùng tên: server chặn tạo / đổi tên / đổi vai trò thành tổ trùng tên; dữ liệu cũ còn trùng thì báo cáo sản lượng không đọc
     chung một dòng sửa tay cho cả hai tổ (số một tổ tính hai lần);
   - tổ làm hai ca: số người ca đang báo cộng ca liền kề đã báo vượt tổng quân số thì thẻ báo nhắc (một người bị tính ở cả hai ca).
   node sua6.test.mjs <đường-dẫn-repo> */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { advance, boot, vnDay } from './harness.mjs';

const ROOT = process.argv[2] || '.';
const T = [];
const ok = (name, cond, extra) => { T.push([cond ? 'PASS' : 'FAIL', name, extra === undefined ? '' : String(extra)]); };
const eq = (name, a, b) => ok(name + ' = ' + JSON.stringify(b), JSON.stringify(a) === JSON.stringify(b), 'thực tế: ' + JSON.stringify(a));

async function main() {
  // 9h sáng: ca đêm hôm qua đã hết, ca ngày hôm nay đang chạy
  const cur = ((Date.now() + 7 * 3600e3) % 864e5) / 60e3;
  advance(((9 * 60 - cur + 1440) % 1440 || 1440) * 60e3);
  const S = await boot(ROOT);
  await S.call('POST', '/setup', { token: 'setup-tok', name: 'Admin', phone: '0900000001', pin: '2468' });
  await S.login('Admin', '0900000001', '2468');
  const U = {};
  let i = 2;
  const tao = async (name, role) => S.call('POST', '/users', { name, phone: '09000000' + String(i++).padStart(2, '0'), role }, 'Admin');
  for (const [name, role] of [['Hùng', 'tieudoi'], ['Lan', 'tieudoi'], ['Hai', 'tieudoi'], ['CV', 'cvktht']]) {
    const r = await tao(name, role);
    await S.login(name, r.data && S.one('SELECT phone FROM users WHERE id = ?', r.data.id).phone, r.data.pin);
    await S.call('POST', '/change-pin', { pin: r.data.pin, newPin: '1357' }, name);
    U[name] = r.data.id;
  }

  /* ===== 1. Server chặn tổ trùng tên ===== */
  const t1 = await tao('  hung ', 'tieudoi');
  ok('tạo Tiểu đội trưởng "hung" khi đã có tổ "Hùng": từ chối, nói rõ', t1.status === 400 && /Hùng/.test(t1.data.error || ''), JSON.stringify(t1.data));
  const cv2 = await tao('Hùng', 'cvktht');
  eq('tạo CVKTHT tên "Hùng": được (không phải tổ)', cv2.status, 200);
  eq('đổi CVKTHT "Hùng" thành Tiểu đội trưởng: từ chối', (await S.call('POST', `/users/${cv2.data.id}/role`, { role: 'tieudoi' }, 'Admin')).status, 400);
  eq('đổi tên tổ Lan thành "HÙNG": từ chối', (await S.call('POST', `/users/${U.Lan}/rename`, { name: 'HÙNG' }, 'Admin')).status, 400);
  eq('đổi tên tổ Lan thành "Hùng 2": được', (await S.call('POST', `/users/${U.Lan}/rename`, { name: 'Hùng 2' }, 'Admin')).status, 200);
  eq('đổi tên tổ Hùng thành "Hùng A" (chính nó, không trùng ai): được', (await S.call('POST', `/users/${U['Hùng']}/rename`, { name: 'Hùng A' }, 'Admin')).status, 200);
  await S.call('POST', `/users/${U['Hùng']}/rename`, { name: 'Hùng' }, 'Admin');

  /* ===== 2. Dữ liệu cũ còn hai tổ trùng tên: sản lượng không đọc chung một dòng sửa tay ===== */
  S.raw.prepare('UPDATE users SET name = ? WHERE id = ?').run('Hùng', U.Lan);
  const D = vnDay();
  eq('tổ Hùng báo ca ngày 10/20', (await S.call('PUT', '/quanso', { ngay: D, ca: 1, user: U['Hùng'], tong: 20, lam: 10, nghi: { off: 10 } }, 'CV')).status, 200);
  eq('tổ Hùng (thứ hai) báo ca ngày 5/20', (await S.call('PUT', '/quanso', { ngay: D, ca: 1, user: U.Lan, tong: 20, lam: 5, nghi: { off: 15 } }, 'CV')).status, 200);

  const store = {};
  const el = () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, appendChild() {}, remove() {}, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} });
  let ai = 'CV';
  const ctx = {
    console, Date, Math, JSON, String, Number, Object, Array, Set, Map, parseInt, parseFloat, isNaN, Promise, RegExp, Error, TypeError, encodeURIComponent,
    setTimeout: () => 0, clearTimeout: () => {},
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; }, key: (n) => Object.keys(store)[n] || null, get length() { return Object.keys(store).length; } },
    navigator: { onLine: true, clipboard: { writeText: async () => {} } },
    history: { state: null, pushState() {}, replaceState() {} },
    document: { activeElement: null, hidden: false, body: { appendChild() {}, removeChild() {} }, createElement: el, getElementById: () => el(), querySelectorAll: () => [], addEventListener() {}, execCommand: () => false },
    window: { addEventListener() {} },
    fetch: async (url, o = {}) => {
      if (!/^\/api\/(baocao|sanluong|bootstrap|quanso|rev)/.test(String(url))) return new Promise(() => {});
      const r = await S.call(o.method || 'GET', String(url).replace(/^\/api/, ''), o.body ? JSON.parse(o.body) : undefined, ai);
      return { ok: r.status < 400, status: r.status, json: async () => r.data, headers: { get: () => null } };
    },
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(readFileSync(path.join(ROOT, 'public/app.js'), 'utf8'), ctx, { filename: 'app.js' });
  const R = (src) => vm.runInContext(src, ctx);
  const vao = async (ten, role) => {
    ai = ten;
    const bt = (await S.call('GET', '/bootstrap', undefined, ten)).data;
    R(`S.boot = ${JSON.stringify(bt)}; indexBoot(S.boot); S.me = ${JSON.stringify({ id: U[ten], name: ten, role })}; S.form = {}; S.qsH = null;`);
  };
  await vao('CV', 'cvktht');
  R(`S.screen = 'sanluong'`);
  await R(`slLay('${D}').then((L) => { slDung(L, false); })`);
  const so = () => JSON.parse(R(`JSON.stringify(S.sl.to.filter((u) => u.name === 'Hùng').map((u) => [u.id, u.lam]))`));
  eq('chưa sửa tay: mỗi tổ số của mình', so(), [[U['Hùng'], 10], [U.Lan, 5]]);
  R(`localStorage.setItem(bcKey(S.sl.bc), ${JSON.stringify(JSON.stringify({ v: 2, muc: { s3: 'Quân số\nTổ Hùng: ca ngày 12/20 cn' }, dau: {}, ts: Date.now() + 1 }))}); slGan()`);
  eq('mục 3 sửa tay một dòng "Tổ Hùng": không cộng 12 cho cả hai tổ, theo số app', so(), [[U['Hùng'], 10], [U.Lan, 5]]);
  eq('báo trùng tên trên màn sản lượng', R('S.sl.trung.length'), 2);
  ok('màn sản lượng có cảnh báo trùng tên', R('vSanLuong()').includes('Có tổ trùng tên'));
  ok('tổ không trùng tên vẫn đọc chữ sửa tay', (() => {
    R(`localStorage.setItem(bcKey(S.sl.bc), ${JSON.stringify(JSON.stringify({ v: 2, muc: { s3: 'Quân số\nTổ Hai: ca ngày 7/20 cn' }, dau: {}, ts: Date.now() + 2 }))}); slGan()`);
    return R(`S.sl.to.find((u) => u.name === 'Hai').lam`) === 7;
  })());
  S.raw.prepare('UPDATE users SET name = ? WHERE id = ?').run('Lan', U.Lan);

  /* ===== 3. Tổ làm hai ca: ca liền kề đã báo, cộng ca này vượt tổng thì thẻ nhắc ===== */
  const hom = vnDay(Date.now() - 864e5);
  eq('tổ Hai đặt lịch cả hai ca', (await S.call('PUT', '/quanso/lich', { ca: 3, tong: 20 }, 'Hai')).status, 200);
  eq('ca đêm hôm qua tổ Hai: 10 đi làm + 1 ốm (11 người ca đêm)', (await S.call('PUT', '/quanso', { ngay: hom, ca: 2, user: U.Hai, tong: 20, lam: 10, nghi: { om: 1 } }, 'CV')).status, 200);
  await vao('Hai', 'tieudoi');
  const canh = (bc) => { R(`S.form.qhbc = '${bc}'`); return R('qhTinh().canh'); };
  ok('ca ngày 12 người: 12 + 11 = 23 > 20, nhắc', /23, nhiều hơn tổng 20/.test(canh(12)), canh(12));
  eq('ca ngày 9 người: 9 + 11 = 20, không nhắc', canh(9), '');
  ok('chỉ nhắc, không chặn gửi (không phải lỗi)', R(`(S.form.qhbc = '12', qhTinh().loi)`) === '');
  ok('thẻ Tổng quan hiện dòng nhắc', R(`(S.form.qhbc = '12', qsTheHome())`).includes('Một người chỉ thuộc một ca'));
  eq('tổ Hai báo ca ngày 12 người (vẫn gửi được)', (await S.call('PUT', '/quanso', { ngay: D, ca: 1, tong: 20, lam: 12 }, 'Hai')).status, 200);

  const fail = T.filter((x) => x[0] === 'FAIL');
  console.log(T.map((x) => x[0] + ' | ' + x[1] + (x[2] && x[0] === 'FAIL' ? '  [' + x[2] + ']' : '')).join('\n'));
  console.log('\n=== ' + T.length + ' kiểm tra, ' + fail.length + ' lỗi ===');
  process.exit(fail.length ? 1 : 0);
}
main().catch((e) => { console.error('CRASH', e); process.exit(2); });
