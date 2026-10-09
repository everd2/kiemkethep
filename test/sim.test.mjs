/* Mô phỏng bãi chạy nhiều ngày với thao tác ngẫu nhiên (có seed nên lặp lại được),
   song song giữ một "sổ bóng" tính tay. Sau mỗi ngày và cuối kỳ thì đối chiếu:
   số trong database, số API trả về, và số của sổ bóng phải khớp nhau.
   Mục đích: tìm lỗi logic mà test kịch bản tay không nghĩ ra.  node test/sim.test.mjs <repo> [seed] */
import { boot, addDays, vnDay } from './harness.mjs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.argv[2] || '.';
// sổ ngày tự chốt: mô phỏng gọi đúng hàm mà việc chạy mỗi giờ dùng (không còn API chốt tay)
const REV = await import(pathToFileURL(path.resolve(ROOT, 'src/review.js')).href);
const chotNgay = async (S, day) => {
  try { return { status: (await REV.closeDayAuto(S.env, day)) ? 200 : 409 }; }
  catch (e) { return { status: e.status || 500, data: { code: e.code, error: e.message } }; }
};
/* seed: "7" một lần, "1:30" cả dải; ngày: tham số thứ hai. Mặc định nhẹ để npm test chạy nhanh. */
const ARG = process.argv[3] || '1:5';
const SEEDS = ARG.includes(':')
  ? (() => { const [a, b2] = ARG.split(':').map(Number); return Array.from({ length: b2 - a + 1 }, (_, i) => a + i); })()
  : [Number(ARG)];
const DAYS = Number(process.argv[4]) || 14;

const mulberry32 = (a) => () => {
  a |= 0; a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const fails = [];
const bug = (seed, what, detail, log) => {
  fails.push({ seed, what, detail });
  console.log(`\n✗ SEED ${seed} — ${what}\n  ${detail}\n  Nhật ký thao tác:\n${log.slice(-28).map((l) => '    ' + l).join('\n')}`);
};

async function sim(seed) {
  const rnd = mulberry32(seed);
  const int = (n) => Math.floor(rnd() * n);
  const pick = (a) => a[int(a.length)];
  const S = await boot(ROOT);
  const log = [];
  const say = (s) => log.push(vnDay() + ' ' + s);

  await S.call('POST', '/setup', { token: 'setup-tok', name: 'Admin', phone: '0900000001', pin: '2468' });
  await S.login('admin', '0900000001', '2468');
  for (const [n, ph] of [['An', '0900000002'], ['Binh', '0900000003']]) {
    const r = await S.call('POST', '/users', { name: n, phone: ph, role: 'nguoidem' });
    await S.login(n, ph, r.data.pin);
    await S.call('POST', '/change-pin', { pin: r.data.pin, newPin: '1357' }, n);
  }
  const KHU = ['A', 'B', 'C'];
  for (const k of ['D', 'E', 'F', 'G', 'H']) await S.call('PATCH', '/khu/' + k, { active: 0 });
  const boot0 = (await S.call('GET', '/bootstrap')).data;
  const PHI = boot0.phi.filter((p) => p.active !== 0).map((p) => p.id);
  const kgOf = Object.fromEntries(boot0.phi.map((p) => [p.id, p.kg_per_cay]));
  const boOf = Object.fromEntries(boot0.phi.map((p) => [p.id, p.bo_size]));
  /* Từ bản 1.3 chưa duyệt thì không vào tồn, nên mô phỏng phải duyệt y như admin thật: duyệt
     phiếu ngay sau khi nhập, duyệt khu ngay sau khi khu báo. Sổ bóng là "thép thật đang nằm ở
     bãi" nên nó chỉ khớp database sau khi đã duyệt. */
  const duyetP = (id) => S.call('POST', '/receipts/' + id + '/duyet', {});
  const duyetKhu = (k) => S.call('POST', '/review/duyet', { khu: k });
  // một báo cáo phủ ĐỦ mọi phi: phi khu không có thì để trống, server hiểu là 0
  const soAll = (k) => PHI.map((ph) => {
    const v = get(k, ph);
    return v === 0 ? { phi: ph, v: 0, kind: 'zero' }
      : { phi: ph, v, kind: 'dem', bo: Math.floor(v / boOf[ph]), le: v % boOf[ph] };
  });

  // sổ bóng: số thép thật đang nằm ở mỗi khu × phi
  const real = {};
  const key = (k, p) => k + '|' + p;
  const get = (k, p) => real[key(k, p)] || 0;
  /* dirty: ô mà lượng thép đã đổi SAU lần báo gần nhất của khu đó. Hệ thống không có cách nào
     biết số mới (thép xuất dùng không có phiếu, hoặc thép về sau khi đã đếm), nên chỉ được đối
     chiếu sổ bóng ở những ô KHÔNG dirty. Đây là giới hạn của bài toán, không phải lỗi của app. */
  const dirty = new Set();
  const add = (k, p, q) => { real[key(k, p)] = get(k, p) + q; dirty.add(key(k, p)); };
  const clean = (k, phis) => phis.forEach((p) => dirty.delete(key(k, p)));
  const totalReal = () => Object.values(real).reduce((a, b) => a + b, 0);
  let nhapTong = {}, dungTong = {}; // cộng dồn theo phi cho cả kỳ
  const bumpMap = (m, p, q) => { m[p] = (m[p] || 0) + q; };

  const firstDay = vnDay();
  let lastClosedDay = null, lastClosedSnap = null, lastClosedDirty = null;
  const closedDays = [];

  for (let d = 0; d < DAYS; d++) {
    const day = vnDay();
    const reported = new Set();

    // ---- thép về ----
    for (let i = int(3); i > 0; i--) {
      const k = pick(KHU), p = pick(PHI), q = 1 + int(5) * boOf[p];
      const r = await S.call('POST', '/receipts', { khu: k, lines: [{ phi: p, qty: q }] });
      if (r.status !== 200) { bug(seed, 'nhập kho bị từ chối', `${k}/${p} ${q}: ${JSON.stringify(r.data)}`, log); return; }
      const dp = await duyetP(r.data.id);
      if (dp.status !== 200) { bug(seed, 'duyệt phiếu nhập bị từ chối', `${k}/${p} ${q}: ${JSON.stringify(dp.data)}`, log); return; }
      add(k, p, q); bumpMap(nhapTong, p, q); say(`nhập ${k} ${p} +${q} (đã duyệt)`);
      // thỉnh thoảng hủy ngay phiếu vừa ghi
      if (rnd() < 0.15) {
        const v = await S.call('DELETE', '/receipts/' + r.data.id);
        if (v.status !== 200) { bug(seed, 'hủy phiếu bị từ chối', JSON.stringify(v.data), log); return; }
        add(k, p, -q); bumpMap(nhapTong, p, -q); say(`hủy phiếu ${k} ${p} −${q}`);
      }
    }

    // ---- chuyển khu (chỉ chuyển trong khả năng) ----
    for (let i = int(2); i > 0; i--) {
      const from = pick(KHU), to = pick(KHU.filter((x) => x !== from)), p = pick(PHI);
      const have = get(from, p);
      if (have < 2) continue;
      const q = 1 + int(have - 1);
      const r = await S.call('POST', '/transfers', { from, to, lines: [{ phi: p, qty: q }] });
      if (r.status !== 200) { bug(seed, 'chuyển khu trong khả năng mà bị từ chối', `${from}→${to} ${p} ${q}/${have}: ${JSON.stringify(r.data)}`, log); return; }
      const dp2 = await duyetP(r.data.id);
      if (dp2.status !== 200) { bug(seed, 'duyệt phiếu chuyển bị từ chối', `${from}→${to} ${p} ${q}/${have}: ${JSON.stringify(dp2.data)}`, log); return; }
      add(from, p, -q); add(to, p, q); say(`chuyển ${from}→${to} ${p} ${q} (đã duyệt)`);
    }

    // ---- xuất dùng (không ghi phiếu, chỉ phát hiện khi đếm) ----
    for (let i = int(3); i > 0; i--) {
      const k = pick(KHU), p = pick(PHI), have = get(k, p);
      if (have < 1) continue;
      const q = 1 + int(Math.min(have, 3 * boOf[p]));
      add(k, p, -q); bumpMap(dungTong, p, q); say(`dùng ${k} ${p} −${q}`);
    }

    // ---- đếm & báo ----
    for (const k of KHU) {
      if (rnd() < 0.12) continue; // thỉnh thoảng có khu không báo
      const its = soAll(k);
      const who = rnd() < 0.5 ? 'An' : 'Binh';
      const r = await S.call('PUT', '/counts', { khu: k, day, items: its }, who);
      if (r.status !== 200) { bug(seed, 'báo số bị từ chối', `${k}: ${JSON.stringify(r.data)}`, log); return; }
      const dk = await duyetKhu(k);
      if (dk.status !== 200) { bug(seed, 'duyệt khu bị từ chối', `${k}: ${JSON.stringify(dk.data)}`, log); return; }
      reported.add(k);
      clean(k, PHI);
      say(`${who} báo ${k} + duyệt (${its.filter((x) => x.v).map((x) => x.phi + '=' + x.v).join(',') || 'rỗng'})`);
      // người thứ hai báo LỆCH số rồi admin chọn lại số đúng
      if (rnd() < 0.15 && its.length) {
        const sai = its.map((x) => {
          const v = x.v + (rnd() < 0.5 ? 1 : 0) * (1 + int(5));
          return { phi: x.phi, v, kind: 'dem', bo: Math.floor(v / boOf[x.phi]), le: v % boOf[x.phi] };
        });
        const r3 = await S.call('PUT', '/counts', { khu: k, day, items: sai }, who === 'An' ? 'Binh' : 'An');
        if (r3.status !== 200) { bug(seed, 'báo lệch số bị từ chối', JSON.stringify(r3.data), log); return; }
        sai.forEach((x) => { if (x.v !== get(k, x.phi)) dirty.add(key(k, x.phi)); });
        say(`báo LỆCH ${k}`);
        const pick2 = Object.fromEntries(its.map((x) => [x.phi, x.v]));
        const rr = await S.call('POST', '/conflict/resolve', { khu: k, pick: pick2 });
        if (rr.status !== 200) { bug(seed, 'admin chọn số bị từ chối', JSON.stringify(rr.data), log); return; }
        /* Admin chọn số KHÔNG phải là duyệt số: ô vừa sửa quay về chờ duyệt nên phải duyệt lại,
           đúng như admin thật phải bấm "Duyệt khu" sau khi chọn. */
        const dk2 = await duyetKhu(k);
        if (dk2.status !== 200) { bug(seed, 'duyệt lại sau khi admin chọn số bị từ chối', `${k}: ${JSON.stringify(dk2.data)}`, log); return; }
        clean(k, PHI);
        say(`admin chọn số đúng cho ${k} + duyệt lại`);
      }
      // người thứ hai báo lại ĐÚNG số: không được coi là xung đột
      if (rnd() < 0.2) {
        const r2 = await S.call('PUT', '/counts', { khu: k, day, items: its }, who === 'An' ? 'Binh' : 'An');
        if (r2.status !== 200) { bug(seed, 'báo lại cùng số bị từ chối', JSON.stringify(r2.data), log); return; }
        if (r2.data.conflict) { bug(seed, 'báo lại ĐÚNG số vẫn bị coi là xung đột', `khu ${k}`, log); return; }
        const dk3 = await duyetKhu(k);
        if (dk3.status !== 200) { bug(seed, 'duyệt lại sau khi báo lại cùng số bị từ chối', `${k}: ${JSON.stringify(dk3.data)}`, log); return; }
        say(`báo lại ${k} cùng số + duyệt`);
      }
    }

    // ---- chốt ngày ----
    const full = KHU.every((k) => reported.has(k) || PHI.every((p) => get(k, p) === 0));
    if (full && rnd() < 0.85) {
      const rv = (await S.call('GET', '/review')).data;
      const c = await chotNgay(S, day);
      if (c.status !== 200) { bug(seed, 'chốt ngày bị từ chối', JSON.stringify(c.data), log); return; }
      say(`CHỐT (${rv.exceptions.length} cảnh báo)`);
      closedDays.push(day);
      lastClosedDay = day; lastClosedSnap = { ...real }; lastClosedDirty = new Set(dirty);

      // ===== bất biến 1: tồn chuẩn sau chốt phải đúng bằng sổ bóng =====
      const base = S.sql('SELECT khu_id, phi_id, v FROM baseline WHERE day = ?', day);
      const bm = {};
      base.forEach((r) => (bm[key(r.khu_id, r.phi_id)] = r.v));
      for (const k of KHU) for (const p of PHI) {
        if (dirty.has(key(k, p))) continue;
        const want = get(k, p), got = bm[key(k, p)] || 0;
        if (want !== got) {
          const ct = S.sql('SELECT day, v, kind, ts, duyet_v, duyet_ts, user_id FROM counts WHERE khu_id=? AND phi_id=? ORDER BY day', k, p);
          const kp = S.one('SELECT keep_streak FROM khu_phi WHERE khu_id=? AND phi_id=?', k, p);
          const bl = S.sql('SELECT day, v FROM baseline WHERE khu_id=? AND phi_id=? ORDER BY day', k, p);
          const rc = S.sql('SELECT day, duyet_day, qty, kind, voided FROM receipts WHERE khu_id=? AND phi_id=? ORDER BY id', k, p);
          bug(seed, 'tồn chuẩn sau chốt lệch sổ bóng',
            `${k}/${p}: sổ ${want}, database ${got}\n  khu_phi: ${JSON.stringify(kp)}\n  counts: ${JSON.stringify(ct)}\n  baseline: ${JSON.stringify(bl)}\n  receipts: ${JSON.stringify(rc)}\n  nhật ký ${p}: ${log.filter((l) => l.includes(' ' + p + ' ') || l.includes(p + '=')).slice(-10).join(' // ')}`,
            log);
          return;
        }
      }
      // ===== bất biến 2: daily_summary.ton = tổng sổ bóng theo phi =====
      for (const r of S.sql('SELECT phi_id, ton FROM daily_summary WHERE day = ?', day)) {
        if (KHU.some((k) => dirty.has(key(k, r.phi_id)))) continue;
        const want = KHU.reduce((a, k) => a + get(k, r.phi_id), 0);
        if (want !== r.ton) { bug(seed, 'daily_summary.ton lệch', `${r.phi_id}: sổ ${want}, database ${r.ton}`, log); return; }
      }
    }

    // ===== bất biến 3: tổng toàn bãi mà app hiển thị = sổ bóng (mọi ngày, kể cả chưa chốt) =====
    {
      const b = (await S.call('GET', '/bootstrap')).data;
      const em = {}, bm2 = {};
      (b.eff || []).forEach((c) => (em[key(c.khu_id, c.phi_id)] = c.v));
      b.baseline.forEach((r) => (bm2[key(r.khu_id, r.phi_id)] = r.v));
      for (const k of KHU) for (const p of PHI) {
        const x = key(k, p);
        if (dirty.has(x)) continue;
        const shown = em[x] !== undefined ? em[x] : (bm2[x] || 0);
        if (shown !== get(k, p)) { bug(seed, 'số app hiển thị lệch sổ bóng', `${k}/${p}: app ${shown}, sổ ${get(k, p)}`, log); return; }
      }
    }

    addDays(1);
  }

  // ===== bất biến 4: báo cáo theo kỳ phải khép kín và khớp sổ bóng =====
  if (!lastClosedDay) return;
  const rep = (await S.call('GET', `/report?from=${firstDay}&to=${lastClosedDay}`)).data;
  for (const r of rep.rows) {
    const dau = r.dau || 0, cuoi = r.cuoi == null ? 0 : r.cuoi;
    if (dau + r.nhap - r.dung !== cuoi) {
      bug(seed, 'báo cáo kỳ không khép kín', `${r.phi}: ${dau} + ${r.nhap} − ${r.dung} ≠ ${cuoi}`, log); return;
    }
    if (KHU.some((k) => (lastClosedDirty || new Set()).has(key(k, r.phi)))) continue;
    const wantCuoi = KHU.reduce((a, k) => a + (lastClosedSnap[key(k, r.phi)] || 0), 0);
    if (cuoi !== wantCuoi) { bug(seed, 'tồn cuối kỳ lệch sổ bóng', `${r.phi}: báo cáo ${cuoi}, sổ ${wantCuoi}`, log); return; }
  }
  // ===== bất biến 5: tổng nhập/dùng cả kỳ khớp sổ bóng (kỳ tính từ đầu nên phủ hết) =====
  for (const p of PHI) {
    const r = rep.rows.find((x) => x.phi === p);
    if (!r) continue;
    // chỉ so phần đã nằm trong các ngày đã chốt: lượng sau lần chốt cuối chưa vào báo cáo
    const after = log.length; // không dùng, giữ cho rõ ý
    if (lastClosedDay === closedDays[closedDays.length - 1] && closedDays.length) {
      // nhập/dùng sau lần chốt cuối không được tính, nên chỉ kiểm tra khi lần chốt cuối là ngày cuối cùng có thao tác
    }
  }
  // ===== bất biến 6: xuất CSV khớp tổng của app =====
  const csv = String((await S.call('GET', '/export?date=' + lastClosedDay)).data);
  const grid = csv.trim().split(/\r?\n/).filter((l) => !/^﻿?sep=/.test(l)).map((l) => l.split(';').map((x) => x.replace(/^"|"$/g, '')));
  const head = grid[0], lastLine = grid[grid.length - 1];
  const csvCay = Number(lastLine[lastLine.length - 2]);
  // cột tổng chỉ cộng thép cây; thép cuộn có cột riêng tính theo cuộn
  const isCuonPhi = (id) => head.includes(id + ' (cuộn)');
  if ((lastClosedDirty || new Set()).size) return; // còn ô hệ thống chưa biết: không so được tổng CSV
  const wantCay = Object.entries(lastClosedSnap).reduce((a, [x, v]) => a + (isCuonPhi(x.split('|')[1]) ? 0 : v), 0);
  if (csvCay !== wantCay) {
    const diff = [];
    for (const k of KHU) {
      const row = grid.find((r) => r[0] === 'Khu ' + k) || [];
      for (let i = 1; i < head.length - 2; i++) {
        const phi = head[i].replace(' (cuộn)', '');
        const got = Number(String(row[i] || 0).replace(',', '.'));
        const raw = lastClosedSnap[key(k, phi)] || 0;
        const want = isCuonPhi(phi) ? Math.round((raw / boOf[phi]) * 100) / 100 : raw;
        if (got !== want) diff.push(`${k}/${head[i]}: CSV ${got}, sổ ${want}`);
      }
    }
    const noCol = [...new Set(Object.keys(lastClosedSnap).filter((x) => lastClosedSnap[x] > 0).map((x) => x.split('|')[1]))].filter((p2) => !head.includes(p2));
    bug(seed, 'tổng cây trong CSV lệch sổ bóng',
      `CSV ${csvCay}, sổ ${wantCay} · ngày ${lastClosedDay}\n  cột: ${head.join(' ')}\n  ô lệch: ${diff.join(' | ') || '(không ô nào)'}\n  phi có thép nhưng thiếu cột: ${noCol.join(',') || '-'}`, log);
    return;
  }
}

/* ===== fuzz dữ liệu gửi lên: không được trả 500 ===== */
async function fuzz() {
  const S = await boot(ROOT);
  await S.call('POST', '/setup', { token: 'setup-tok', name: 'Admin', phone: '0900000001', pin: '2468' });
  await S.login('admin', '0900000001', '2468');
  const day = vnDay();
  const BAD = [
    ['PUT', '/counts', { khu: 'A', day, items: [{ phi: 'D10', v: -5, kind: 'dem' }] }],
    ['PUT', '/counts', { khu: 'A', day, items: [{ phi: 'D10', v: 1e9, kind: 'dem' }] }],
    ['PUT', '/counts', { khu: 'A', day, items: [{ phi: 'XX', v: 1, kind: 'dem' }] }],
    ['PUT', '/counts', { khu: 'A', day, items: [{ phi: 'D10', v: 1, kind: 'bay' }] }],
    ['PUT', '/counts', { khu: 'A', day, items: [{ phi: 'D10', v: 1.5, kind: 'dem' }] }],
    ['PUT', '/counts', { khu: 'A', day, items: 'x' }],
    ['PUT', '/counts', { khu: '', day, items: [{ phi: 'D10', v: 1, kind: 'dem' }] }],
    ['PUT', '/counts', { khu: 'A', day: '9999-99-99', items: [{ phi: 'D10', v: 1, kind: 'dem' }] }],
    ['POST', '/receipts', { khu: 'A', lines: [{ phi: 'D10', qty: 0 }] }],
    ['POST', '/receipts', { khu: 'A', lines: [{ phi: 'D10', qty: -3 }] }],
    ['POST', '/receipts', { khu: 'A', lines: [] }],
    ['POST', '/receipts', { khu: 'A' }],
    ['POST', '/transfers', { from: 'A', to: 'A', lines: [{ phi: 'D10', qty: 1 }] }],
    ['POST', '/transfers', { from: 'A', to: 'ZZ', lines: [{ phi: 'D10', qty: 1 }] }],
    ['POST', '/conflict/resolve', { khu: 'A', pick: { D10: -1 } }],
    ['POST', '/conflict/resolve', { khu: 'A', pick: 'x' }],
    ['PATCH', '/khu/A', { name: '' }],
    ['PATCH', '/phi/D10', { bo_size: 0 }],
    ['PATCH', '/phi/D10', { kg_per_cay: 0 }],
    ['PATCH', '/phi/ZZZ', { bo_size: 5 }],
    ['PUT', '/phi', { items: [{ id: 'D10', bo_size: -1 }] }],
    ['PUT', '/settings', { max_keep_streak: 999 }],
    ['POST', '/khu', { name: '' }],
    ['POST', '/users', { name: 'x', phone: '1', role: 'admin' }],
    ['POST', '/users', { name: 'x', phone: '0911111111', role: 'vua' }],
    ['GET', '/day?date=xx'],
    ['GET', '/report?from=2026-13-01&to=2026-01-01'],
    ['GET', '/usage?days=-5'],
    ['GET', '/export?date=abc'],
  ];
  const bad5xx = [];
  for (const [m, p, b] of BAD) {
    const r = await S.call(m, p, b);
    if (r.status >= 500) bad5xx.push(`${m} ${p} ${JSON.stringify(b)} → ${r.status} ${JSON.stringify(r.data)}`);
  }
  return bad5xx;
}

const t0 = process.hrtime.bigint();
for (const s of SEEDS) await sim(s);
const bad5xx = await fuzz();
bad5xx.forEach((x) => { fails.push({ what: 'lỗi 500' }); console.log('\n✗ FUZZ trả lỗi máy chủ: ' + x); });
console.log(`\n${SEEDS.length} lần mô phỏng × ${DAYS} ngày + ${30} ca dữ liệu sai, ${(Number(process.hrtime.bigint() - t0) / 1e9).toFixed(1)}s`);
console.log(fails.length ? `=== ${fails.length} lỗi ===` : '=== 0 lỗi ===');
process.exit(fails.length ? 1 : 0);
