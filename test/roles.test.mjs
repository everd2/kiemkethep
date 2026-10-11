/* Phân quyền theo cấp bậc, kiểm trên worker thật + SQLite thật. node roles.test.mjs <đường-dẫn-repo>
   1. Bảng quyền: MỌI đường API × MỌI vai trò — ai được gọi, ai bị chặn (403).
   2. Mô phỏng ngẫu nhiên nhiều trăm thao tác của nhiều vai trò. Sau MỖI bước, đối chiếu ba nguồn:
      - luật (duyetCap trên cấp người báo / phiếu kho mà màn Duyệt tính ra),
      - server thật (bấm Duyệt khu thật bằng CVKTHT: được hay bị chặn),
      - app.js chạy trong máy ảo với đúng bootstrap của người đó (khuDuyetDuoc, thẻ nhắc ở Tổng
        quan, nút trên màn Duyệt).
      Lệch ở đâu là lỗi: máy nhắc việc người ta không làm được, hoặc giấu việc người ta phải làm. */
import { boot, advance, vnDay } from './harness.mjs';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';

const ROOT = process.argv[2] || '.';
const SEED = Number(process.argv[3] || 20261011);
const CORE = await import(pathToFileURL(path.resolve(ROOT, 'src/core.js')).href);
const T = [];
const ok = (name, cond, extra) => { T.push([cond ? 'PASS' : 'FAIL', name, extra === undefined ? '' : String(extra)]); };
const eq = (name, a, b) => ok(name + ' = ' + JSON.stringify(b), JSON.stringify(a) === JSON.stringify(b), 'thực tế: ' + JSON.stringify(a));

// số ngẫu nhiên có hạt giống: chạy lại cùng hạt giống là cùng chuỗi thao tác, lỗi tái hiện được
let seed = SEED;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = (a) => a[Math.floor(rnd() * a.length)];

const PHI = ['D6', 'D8', 'D10', 'D12', 'D14', 'D16', 'D18', 'D20', 'D22', 'D25', 'D28', 'D32', 'D36'];
const items = (vals) => PHI.map((phi) => (vals[phi] === undefined ? { phi, v: 0, kind: 'zero' } : { phi, v: vals[phi], kind: 'dem', bo: 0, le: vals[phi] }));

/* ---------- app.js trong máy ảo ---------- */
function loadApp() {
  const code = readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');
  const el = () => ({ value: '', dataset: {}, style: {}, focus() {}, remove() {}, setSelectionRange() {}, querySelector: () => null, appendChild() {}, closest: () => null, set innerHTML(v) {}, get innerHTML() { return ''; } });
  const store = {};
  const ctx = {
    console, Date, Math, JSON, String, Number, Object, Array, Set, Map, parseInt, parseFloat, isNaN, Promise, RegExp, Error, TypeError, encodeURIComponent,
    setTimeout: () => 0, clearTimeout: () => {},
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; }, key: () => null, get length() { return 0; } },
    navigator: { onLine: true },
    history: { state: null, pushState() {}, replaceState() {} },
    document: { activeElement: null, body: { appendChild() {}, removeChild() {} }, createElement: el, getElementById: () => el(), querySelectorAll: () => [], addEventListener() {} },
    window: { addEventListener() {} },
    fetch: () => new Promise(() => {}), // app khởi động sẽ gọi /me: để treo, không làm gì
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(code, ctx, { filename: 'app.js' });
  return (src) => vm.runInContext(src, ctx);
}
const R = loadApp();
// dựng màn hình của một người từ bootstrap / review thật của chính người đó
const asUser = (bt, me) => { R(`S.boot = ${JSON.stringify(bt)}; indexBoot(S.boot); S.me = ${JSON.stringify(me)}; S.review = null; S.subs = {}; S.cmp = null; S.screen = 'home';`); };

async function main() {
  const S = await boot(ROOT);
  await S.call('POST', '/setup', { token: 'setup-tok', name: 'Admin', phone: '0900000001', pin: '2468' });
  await S.login('Admin', '0900000001', '2468');
  const U = {};
  const mk = async (name, phone, role) => {
    const r = await S.call('POST', '/users', { name, phone, role }, 'Admin');
    await S.login(name, phone, r.data.pin);
    await S.call('POST', '/change-pin', { pin: r.data.pin, newPin: '1357' }, name);
    U[name] = { id: r.data.id, name, role };
  };
  U.Admin = { id: S.one("SELECT id FROM users WHERE name = 'Admin'").id, name: 'Admin', role: 'admin' };
  await mk('An', '0900000002', 'tieudoi');
  await mk('Binh', '0900000003', 'tieudoi');
  await mk('Cv', '0900000004', 'cvktht');
  await mk('Cv2', '0900000005', 'cvktht');
  await mk('Trung', '0900000006', 'trungdoi');
  await mk('Dai', '0900000007', 'daidoi');
  for (const k of ['E', 'F', 'G', 'H']) await S.call('PATCH', '/khu/' + k, { active: 0 }, 'Admin');
  await S.call('PUT', '/khu/A/users', { users: [U.An.id] }, 'Admin');
  await S.call('PUT', '/khu/B/users', { users: [U.Binh.id] }, 'Admin');
  // C, D chưa giao ai

  /* ================= 1. Bảng quyền ================= */
  {
    const ALL = ['An', 'Cv', 'Trung', 'Dai', 'Admin'];
    const LAP = ['Cv', 'Trung', 'Dai', 'Admin'];
    const C1 = ['Cv', 'Trung', 'Dai', 'Admin'];
    const C2 = ['Trung', 'Dai', 'Admin'];
    const AD = ['Admin'];
    /* Thân yêu cầu cố ý SAI hoặc trỏ tới thứ không có: người có quyền nhận 400/404/409 mà không đổi
       gì trong database, người không có quyền nhận 403. Chỉ cần phân biệt "bị chặn" với "lọt qua". */
    const ROUTES = [
      ['GET', '/bootstrap', null, ALL], ['GET', '/usage?days=7', null, ALL], ['GET', '/day?date=' + vnDay(), null, ALL],
      ['PUT', '/counts', {}, ALL],
      ['GET', '/loans', null, ALL], ['POST', '/loans', {}, ALL], ['DELETE', '/loans/99999', null, ALL],
      ['POST', '/doitac', {}, ALL],
      ['POST', '/receipts', {}, LAP], ['DELETE', '/receipts/99999', null, LAP], ['POST', '/transfers', {}, LAP],
      ['POST', '/adjust', {}, LAP], ['POST', '/xuat', {}, LAP], ['GET', '/report?from=2020-01-01&to=2020-01-02', null, LAP],
      ['PATCH', '/doitac/99999', {}, LAP],
      ['POST', '/receipts/99999/duyet', {}, C2],
      ['POST', '/loans/99999/duyet', {}, C1],
      ['GET', '/review', null, C1], ['POST', '/review/duyet', { khu: 'ZZ' }, C1], ['POST', '/recount', { khu: 'ZZ' }, C1],
      ['GET', '/conflict?khu=A', null, C1], ['POST', '/conflict/resolve', { khu: 'ZZ' }, C1], ['GET', '/submissions?khu=A', null, C1],
      ['GET', '/audit', null, C1], ['GET', '/cham-cong', null, C1], ['GET', '/export?day=' + vnDay(), null, C1],
      ['POST', '/reopen', {}, AD], ['POST', '/reset', { mode: 'x' }, AD], ['GET', '/backup', null, AD], ['POST', '/restore', {}, AD],
      ['GET', '/users', null, AD], ['POST', '/users', {}, AD], ['POST', `/users/${U.Admin.id}/lock`, { locked: 1 }, AD],
      ['PUT', '/khu/A/users', { users: [99999] }, AD], ['POST', '/khu', {}, AD], ['PATCH', '/khu/ZZ', {}, AD],
      ['PATCH', '/phi/ZZ', {}, AD], ['PUT', '/phi', {}, AD], ['PUT', '/settings', {}, AD],
    ];
    const rev0 = S.one("SELECT value FROM meta WHERE key = 'rev'").value;
    for (const [m, p, body, allow] of ROUTES) {
      for (const who of ALL) {
        const st = (await S.call(m, p, body === null ? undefined : body, who)).status;
        const duoc = allow.includes(who);
        ok(`${who} (${U[who].role}) ${m} ${p}: ${duoc ? 'được gọi' : 'bị chặn'}`, duoc ? st !== 403 && st !== 401 && st < 500 : st === 403, 'HTTP ' + st);
      }
    }
    eq('bảng quyền không làm đổi số liệu (mọi lần gọi đều bị từ chối hoặc chỉ đọc)', S.one("SELECT value FROM meta WHERE key = 'rev'").value, rev0);
  }

  /* ================= 2. Mô phỏng ngẫu nhiên, đối chiếu luật / server / máy ================= */
  const STEPS = 400;
  const KHU = ['A', 'B', 'C', 'D'];
  const log = [];
  let lech = 0, buoc = 0, thuDuyet = 0, thuDuyetDung = 0;
  const loi = (msg) => { lech++; if (lech <= 12) ok(`[hạt giống ${SEED}, bước ${buoc}] ${msg}`, false, log.slice(-6).join(' | ')); };
  const review = async (who) => (await S.call('GET', '/review', undefined, who)).data;
  const canViec = (k) => k.waiting || k.phieu.length || k.recheck;

  async function doiChieu() {
    const rv = await review('Dai');
    const rvKhuTen = new Set(rv.khus.map((k) => k.name));
    for (const who of ['Cv', 'Trung', 'An']) {
      const u = U[who];
      const bt = (await S.call('GET', '/bootstrap', undefined, who)).data;
      asUser(bt, { id: u.id, name: u.name, role: u.role });
      const home = R('vHome()');
      const choBan = new Set();
      const m = home.match(/<b style="font-size:17px">([^<]*) chờ bạn duyệt<\/b>/g) || [];
      for (const x of m) {
        const t = x.replace(/<[^>]+>/g, '').replace(' chờ bạn duyệt', '');
        // chỉ thẻ KHU chờ duyệt (thẻ phiếu kho, sổ vay là thẻ khác)
        if (/^\d+ khu$/.test(t)) choBan.add('*' + t);
        else if (rvKhuTen.has(t)) choBan.add(t);
      }
      for (const k of rv.khus) {
        const luat = CORE.duyetCap(u.role, Math.max(k.capBao, k.capPhieu));
        // 2a. máy và luật phải khớp với MỌI khu đang có báo cáo chờ duyệt
        const choMay = R(`!!(S.boot.rm[${JSON.stringify(k.khu)}] && khuWaiting(${JSON.stringify(k.khu)}))`);
        if (choMay !== !!(k.waiting && k.rep && k.rep.day === bt.today)) {
          // báo cáo chuyển từ hôm trước không có ở bootstrap hôm nay: không có trong mô phỏng một ngày
          loi(`${who}: máy nói khu ${k.khu} ${choMay ? '' : 'không '}chờ duyệt, server nói waiting=${k.waiting}`);
        }
        if (choMay && R(`khuDuyetDuoc(${JSON.stringify(k.khu)})`) !== luat) {
          loi(`${who}: máy tính khu ${k.khu} ${luat ? 'KHÔNG ' : ''}duyệt được, luật nói ${luat ? 'được' : 'không'} (capBao ${k.capBao}, capPhieu ${k.capPhieu}, phieuSau ${k.phieuSau})`);
        }
      }
      // 2b. thẻ "chờ bạn duyệt" ở Tổng quan: đúng những khu chờ duyệt mà người này duyệt được
      const nen = rv.khus.filter((k) => k.waiting && CORE.capOf(u.role) >= 1 && CORE.duyetCap(u.role, Math.max(k.capBao, k.capPhieu)));
      const thay = nen.length === 0 ? new Set() : nen.length === 1 ? new Set([nen[0].name]) : new Set(['*' + nen.length + ' khu']);
      if ([...thay].sort().join() !== [...choBan].sort().join()) loi(`${who}: thẻ "chờ bạn duyệt" là [${[...choBan]}], đúng phải là [${[...thay]}]`);
      // 2c. màn Duyệt: nút Duyệt khu đúng ở những khu người này duyệt được
      if (CORE.capOf(u.role) >= 1) {
        const rvU = await review(who);
        R(`S.review = ${JSON.stringify(rvU)}; S.screen = 'duyet';`);
        const dv = R('vDuyet()');
        for (const k of rvU.khus) {
          const coNut = new RegExp(`data-a="khuduyet" data-k="${k.khu}"`).test(dv);
          const nen2 = !!canViec(k) && CORE.duyetCap(u.role, Math.max(k.capBao, k.capPhieu));
          if (coNut !== nen2) loi(`${who}: màn Duyệt ${coNut ? 'có' : 'thiếu'} nút duyệt khu ${k.khu} (luật: ${nen2 ? 'được' : 'không'})`);
          const nutHuy = new RegExp(`data-a="recount" data-k="${k.khu}"`).test(dv);
          if (nutHuy && !CORE.duyetCap(u.role, k.capBao)) loi(`${who}: màn Duyệt có nút huỷ báo cáo khu ${k.khu} mà không đủ cấp`);
        }
        // phiếu kho: nút chỉ có ở cấp chỉ huy
        if (/data-a="pduyet"/.test(dv) !== (rvU.phieu.length > 0 && CORE.capOf(u.role) >= 2)) loi(`${who}: nút duyệt phiếu kho hiện sai`);
      }
    }
  }

  const reportBy = ['An', 'Binh', 'Cv', 'Trung'];
  for (buoc = 1; buoc <= STEPS; buoc++) {
    advance(Math.floor(rnd() * 5000) + 1);
    const x = rnd();
    const khu = pick(KHU);
    if (x < 0.30) {
      const who = pick(reportBy);
      const r = await S.call('PUT', '/counts', { khu, items: items({ D16: Math.floor(rnd() * 300), D20: Math.floor(rnd() * 50) }) }, who);
      log.push(`${who} báo ${khu}: ${r.status}`);
      // quyền đếm: khu đã giao thì tiểu đội trưởng khác bị chặn; CVKTHT trở lên đếm mọi khu
      const giao = { A: 'An', B: 'Binh' }[khu];
      const nen = !(U[who].role === 'tieudoi' && giao && giao !== who);
      if ((r.status === 200) !== nen) loi(`${who} báo khu ${khu}: HTTP ${r.status}, luật nói ${nen ? 'được' : 'bị chặn'}`);
    } else if (x < 0.45) {
      const who = pick(['Cv', 'Trung']);
      const r = await S.call('POST', '/receipts', { khu, lines: [{ phi: 'D16', qty: Math.floor(rnd() * 40) + 1 }] }, who);
      log.push(`${who} lập phiếu ${khu}: ${r.status}`);
    } else if (x < 0.55) {
      const p = S.sql('SELECT id FROM receipts WHERE voided = 0 AND duyet_day IS NULL');
      if (p.length) {
        const id = pick(p).id;
        const cv = await S.call('POST', `/receipts/${id}/duyet`, {}, 'Cv');
        if (cv.status !== 403) loi(`CVKTHT duyệt được phiếu kho ${id}: HTTP ${cv.status}`);
        const r = await S.call('POST', `/receipts/${id}/duyet`, {}, 'Trung');
        log.push(`Trung duyệt phiếu ${id}: ${r.status}`);
      }
    } else if (x < 0.60) {
      const p = S.sql('SELECT id FROM receipts WHERE voided = 0 AND duyet_day IS NOT NULL');
      if (p.length) { const id = pick(p).id; const r = await S.call('DELETE', `/receipts/${id}`, undefined, 'Dai'); log.push(`Dai huỷ phiếu ${id}: ${r.status}`); }
    } else if (x < 0.80) {
      // bấm Duyệt khu thật bằng CVKTHT, so với dự đoán từ màn Duyệt vừa tải
      const rv = await review('Cv');
      const k = rv.khus.find((y) => y.khu === khu);
      if (k && canViec(k)) {
        const du = CORE.duyetCap('cvktht', Math.max(k.capBao, k.capPhieu));
        const r = await S.call('POST', '/review/duyet', { khu, marks: { [khu]: k.mark } }, 'Cv');
        thuDuyet++;
        log.push(`Cv duyệt ${khu}: ${r.status} (dự đoán ${du ? 200 : 403})`);
        if ((r.status === 200) !== du || (!du && r.status !== 403)) loi(`CVKTHT duyệt khu ${khu}: HTTP ${r.status}, dự đoán ${du ? 200 : 403} (capBao ${k.capBao}, capPhieu ${k.capPhieu})`);
        else thuDuyetDung++;
      }
    } else if (x < 0.88) {
      const rv = await review('Trung');
      const k = rv.khus.find((y) => y.khu === khu);
      if (k && canViec(k)) { const r = await S.call('POST', '/review/duyet', { khu, marks: { [khu]: k.mark } }, 'Trung'); log.push(`Trung duyệt ${khu}: ${r.status}`); if (r.status !== 200) loi(`trung đội trưởng duyệt khu ${khu} bị từ chối: ${JSON.stringify(r.data)}`); }
    } else if (x < 0.94) {
      const rv = await review('Cv');
      const k = rv.khus.find((y) => y.khu === khu);
      if (k && k.waiting) {
        const du = CORE.duyetCap('cvktht', k.capBao);
        const r = await S.call('POST', '/recount', { khu, ly_do: 'thử', mark: k.mark }, 'Cv');
        log.push(`Cv huỷ ${khu}: ${r.status}`);
        if ((r.status === 200) !== du) loi(`CVKTHT huỷ báo cáo khu ${khu}: HTTP ${r.status}, dự đoán ${du ? 200 : 403}`);
      }
    } else {
      const r = await S.call('POST', '/conflict/resolve', { khu, pick: { D16: Math.floor(rnd() * 300) } }, 'Cv');
      log.push(`Cv chọn số ${khu}: ${r.status}`);
    }
    await doiChieu();
  }
  ok(`mô phỏng ${STEPS} bước (hạt giống ${SEED}): máy, server và luật khớp nhau ở mọi bước`, lech === 0, lech + ' chỗ lệch');
  ok(`đã bấm Duyệt khu thật bằng CVKTHT nhiều lần, đủ cả hai kết quả`, thuDuyet >= 20, thuDuyet + ' lần, ' + thuDuyetDung + ' đúng dự đoán');
  const kq = S.sql("SELECT COUNT(*) n FROM audit WHERE action = 'khu_duyet' AND user_id = ?", U.Cv.id)[0].n;
  ok('trong đó có lần CVKTHT duyệt được thật', kq > 0, kq);

  const fail = T.filter((x) => x[0] === 'FAIL');
  console.log(T.filter((x) => x[0] === 'FAIL' || process.env.VERBOSE).map((x) => x[0] + ' | ' + x[1] + (x[2] ? '  [' + x[2] + ']' : '')).join('\n'));
  console.log('\n=== ' + T.length + ' kiểm tra, ' + fail.length + ' lỗi ===');
  process.exit(fail.length ? 1 : 0);
}
main().catch((e) => { console.error('CRASH', e); process.exit(2); });
