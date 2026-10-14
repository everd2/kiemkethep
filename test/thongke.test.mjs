/* Thống kê quân số, kiểm trên worker thật + SQLite thật + app.js thật. node thongke.test.mjs <đường-dẫn-repo>
   Những điều tính năng này hứa:
   1. Hết ca, tổ làm ca đó mà không báo thì app tự chép số thiết lập lúc đó (có người nghỉ theo lý do); không có số
      thiết lập thì ghi là ca thiếu số. Chép một lần, sửa số thiết lập sau đó không đổi số của ca đã qua.
   2. Đếm theo công; OFF tính là nghỉ; % nghỉ = nghỉ ÷ (đi làm + nghỉ), của toàn bộ thì cộng công rồi mới chia.
   3. Tiểu đội trưởng chỉ thấy tổ mình; CVKTHT trở lên thấy mọi tổ và đổi được ngưỡng tô đỏ. */
import { boot, advance, vnDay } from './harness.mjs';

const ROOT = process.argv[2] || '.';
const T = [];
const ok = (name, cond, extra) => { T.push([cond ? 'PASS' : 'FAIL', name, extra === undefined ? '' : String(extra)]); };
const eq = (name, a, b) => ok(name + ' = ' + JSON.stringify(b), JSON.stringify(a) === JSON.stringify(b), 'thực tế: ' + JSON.stringify(a));
const datGio = (h, m = 0) => {
  const cur = ((Date.now() + 7 * 3600e3) % 864e5) / 60e3;
  let d = h * 60 + m - cur;
  if (d <= 0) d += 1440;
  advance(d * 60e3);
};

async function main() {
  datGio(9);
  const S = await boot(ROOT);
  await S.call('POST', '/setup', { token: 'setup-tok', name: 'Admin', phone: '0900000001', pin: '2468' });
  await S.login('Admin', '0900000001', '2468');
  const U = {};
  let i = 2;
  for (const [name, role] of [['An', 'tieudoi'], ['Binh', 'tieudoi'], ['Cuong', 'tieudoi'], ['Dung', 'tieudoi'], ['Cv', 'cvktht']]) {
    const phone = '09000000' + String(i++).padStart(2, '0');
    const r = await S.call('POST', '/users', { name, phone, role }, 'Admin');
    await S.login(name, phone, r.data.pin);
    await S.call('POST', '/change-pin', { pin: r.data.pin, newPin: '1357' }, name);
    U[name] = r.data.id;
  }
  const D = vnDay();
  const tl = (b) => S.call('PUT', '/quanso/thietlap', b, 'Cv');

  /* ===== 1. Chép số của ca tổ không báo lúc hết ca ===== */
  // An làm ca ngày, tự báo: 20 người, đi làm 16, nghỉ 2 ốm + 2 OFF
  await S.call('PUT', '/quanso/lich', { ca: 1 }, 'An');
  eq('An tự báo ca ngày', (await S.call('PUT', '/quanso', { ngay: D, ca: 1, tong: 20, lam: 16, nghi: { om: 2, off: 2 } }, 'An')).status, 200);
  // Binh làm ca ngày, không báo; CVKTHT đã đặt số thiết lập: 10 người ca ngày, 1 nghỉ phép
  await S.call('PUT', '/quanso/lich', { ca: 1 }, 'Binh');
  eq('số thiết lập của Binh', (await tl({ user: U.Binh, tong: 10, s1: 10, s2: 0, n1: { phep: 1 }, ts: 0 })).status, 200);
  // Cuong làm ca ngày, không báo, không có số thiết lập → ca thiếu số
  await S.call('PUT', '/quanso/lich', { ca: 1 }, 'Cuong');
  // Dung làm ca đêm: ca ngày không phải ca của tổ, không được tính là thiếu
  await S.call('PUT', '/quanso/lich', { ca: 2 }, 'Dung');
  await S.cron();
  eq('ca ngày chưa hết: chưa chép gì cho ca ngày hôm nay', S.one('SELECT COUNT(*) n FROM quan_so_tl WHERE ngay = ? AND ca = 1', D).n, 0);
  datGio(19, 30);
  await S.cron();
  const hom = (u) => S.one('SELECT tong, lam, nghi, ghi_chu FROM quan_so_tl WHERE ngay = ? AND ca = 1 AND user_id = ?', D, u);
  eq('hết ca ngày: Binh không báo → chép số thiết lập, đi làm = số người ca − nghỉ', hom(U.Binh), { tong: 10, lam: 9, nghi: '{"phep":1}', ghi_chu: null });
  eq('Cuong không báo, không có số thiết lập → ca thiếu số', hom(U.Cuong), { tong: null, lam: null, nghi: '{}', ghi_chu: null });
  eq('An đã tự báo, Dung làm ca đêm: không chép', [hom(U.An), hom(U.Dung)], [undefined, undefined]);
  eq('ca hết TRƯỚC lúc đặt lịch ca (hôm qua): không chép ngược', S.one('SELECT COUNT(*) n FROM quan_so_tl WHERE ngay < ?', D).n, 0);
  const n0 = S.one('SELECT COUNT(*) n FROM quan_so_tl').n;
  await tl({ user: U.Binh, tong: 12, s1: 12, s2: 0, n1: {}, ts: JSON.parse(S.one('SELECT data FROM bc_mau WHERE id = 1').data).tl[U.Binh].ts });
  await S.cron();
  eq('chạy lại sau khi sửa số thiết lập: không chép thêm, số ca đã qua giữ nguyên', [S.one('SELECT COUNT(*) n FROM quan_so_tl').n, hom(U.Binh).lam], [n0, 9]);

  /* ===== 2. Số liệu thống kê, quyền ===== */
  const tu = D.slice(0, 7) + '-01';
  const cv = (await S.call('GET', `/quanso/thongke?tu=${tu}&den=${D}`, undefined, 'Cv')).data;
  ok('CVKTHT: đủ các tổ, dòng tổ báo và dòng chép lúc hết ca', ['An', 'Binh', 'Cuong', 'Dung'].every((n) => cv.to.some((t) => t.name === n)) && cv.qs.some((r) => r.u === U.An) && cv.tl.some((r) => r.u === U.Binh), JSON.stringify(cv.to));
  eq('ngưỡng mặc định 15%', cv.nguong, 15);
  // số tạm: ca đang diễn ra (ca đêm hôm nay), Dung làm ca đêm chưa báo, có số thiết lập → gửi kèm số tạm như báo cáo ca
  eq('ca đang diễn ra, tổ chưa báo, chưa có số thiết lập: không có số tạm', cv.tam.filter((r) => r.u === U.Dung), []);
  await tl({ user: U.Dung, tong: 15, s1: 0, s2: 15, n2: { om: 3 }, ts: 0 });
  const tam = (await S.call('GET', `/quanso/thongke?tu=${tu}&den=${D}`, undefined, 'Cv')).data.tam.filter((r) => r.u === U.Dung);
  eq('có số thiết lập: số tạm của ca đang diễn ra (đi làm 12, nghỉ 3 ốm)', tam.map(({ ngay, ca, lam, tong, nghi, tam: t }) => ({ ngay, ca, lam, tong, nghi, t })), [{ ngay: D, ca: 2, lam: 12, tong: 15, nghi: { om: 3 }, t: 1 }]);
  eq('số tạm chỉ gửi kèm, không ghi vào bảng', S.one('SELECT COUNT(*) n FROM quan_so_tl WHERE user_id = ?', U.Dung).n, 0);
  S.raw.exec(`UPDATE bc_mau SET data = json_remove(data, '$.tl."${U.Dung}"') WHERE id = 1`);
  const an = (await S.call('GET', `/quanso/thongke?tu=${tu}&den=${D}`, undefined, 'An')).data;
  eq('Tiểu đội trưởng chỉ thấy tổ mình', [an.to.map((t) => t.name), an.qs.every((r) => r.u === U.An), an.tl.length], [['An'], true, 0]);
  eq('xem 4 tháng (tháng đang xem + 3 tháng trước để so sánh): được', (await S.call('GET', `/quanso/thongke?tu=2026-01-01&den=2026-04-30`, undefined, 'Cv')).status, 200);
  eq('xem quá 124 ngày: từ chối', (await S.call('GET', `/quanso/thongke?tu=2026-01-01&den=2026-06-01`, undefined, 'Cv')).status, 400);
  eq('Tiểu đội trưởng không đổi được ngưỡng', (await S.call('PUT', '/quanso/nguong', { pct: 20 }, 'An')).status, 403);
  eq('ngưỡng ngoài 1–100: từ chối', (await S.call('PUT', '/quanso/nguong', { pct: 0 }, 'Cv')).status, 400);

  /* ===== 3. Màn thống kê (app.js thật) ===== */
  const { readFileSync } = await import('node:fs');
  const vm = (await import('node:vm')).default;
  const path = (await import('node:path')).default;
  let who = 'Cv', chep = null;
  const el = () => ({ value: '', dataset: {}, style: {}, focus() {}, remove() {}, select() {}, setAttribute() {}, setSelectionRange() {}, querySelector: () => null, querySelectorAll: () => [], appendChild() {}, closest: () => null, set innerHTML(v) {}, get innerHTML() { return ''; } });
  const store = {};
  const ctx = {
    console, Date, Math, JSON, String, Number, Object, Array, Set, Map, parseInt, parseFloat, isNaN, Promise, RegExp, Error, TypeError, encodeURIComponent,
    setTimeout: () => 0, clearTimeout: () => {},
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; }, key: (n) => Object.keys(store)[n] || null, get length() { return Object.keys(store).length; } },
    navigator: { onLine: true, clipboard: { writeText: async (t) => { chep = t; } } },
    history: { state: null, pushState() {}, replaceState() {} },
    document: { activeElement: null, hidden: false, body: { appendChild() {}, removeChild() {} }, createElement: el, getElementById: () => el(), querySelectorAll: () => [], addEventListener() {}, execCommand: () => false },
    window: { addEventListener() {} },
    fetch: async (url, o = {}) => {
      if (!/^\/api\/(quanso|bootstrap)/.test(String(url))) return new Promise(() => {});
      const r = await S.call(o.method || 'GET', String(url).replace(/^\/api/, ''), o.body ? JSON.parse(o.body) : undefined, who);
      return { ok: r.status < 400, status: r.status, json: async () => r.data, headers: { get: () => null } };
    },
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(readFileSync(path.join(ROOT, 'public/app.js'), 'utf8'), ctx, { filename: 'app.js' });
  const R = (src) => vm.runInContext(src, ctx);
  const cho = async () => { for (let k = 0; k < 300; k++) { await new Promise((r) => setImmediate(r)); if (!R('S.busy') && k > 40) return; } };
  const vao = async (ten, role) => {
    who = ten;
    const bt = (await S.call('GET', '/bootstrap', undefined, ten)).data;
    R(`S.boot = ${JSON.stringify(bt)}; indexBoot(S.boot); S.me = ${JSON.stringify({ id: U[ten], name: ten, role })}; S.form = {}; S.screen = 'more';`);
  };
  await vao('Cv', 'cvktht');
  ok('Thêm có mục Thống kê quân số', R('vMore()').includes('data-s="qstk"'));
  R(`ACTIONS.nav({ s: 'qstk' })`); await cho();
  eq('mở màn thống kê: mặc định xem theo tháng; xem theo ngày thì mặc định hôm qua', [R('S.screen'), R('tkChe()'), R('tkNgayCua()'), R('tkThangCua()')], ['qstk', 'thang', vnDay(Date.parse(D) - 864e5), D.slice(0, 7)]);
  eq('tải đủ tháng đang xem và ba tháng trước', [R('S.tk.tu'), R('S.tk.den')], [R('tkCan().tu'), R('tkCan().den')]);
  R(`ACTIONS.tkche({ v: 'thang' })`); await cho();
  eq('chuyển sang xem theo tháng (không tải lại vì đã đủ số)', [R('tkChe()'), R('tkThangCua()'), R('!!S.tk')], ['thang', D.slice(0, 7), true]);
  // toàn bộ ca ngày hôm nay: An 16 làm + 4 nghỉ, Binh 9 làm + 1 nghỉ (số thiết lập), Cuong thiếu số
  const tong = R(`JSON.stringify((({ lam, nghi, to, tl, thieu, ly }) => ({ lam, nghi, to, tl, thieu, ly }))(tkTinh(S.tk, tkThangCua(), 1).tong))`);
  eq('ca ngày: cộng công mọi tổ; OFF tính là nghỉ; ca thiếu số đếm riêng', JSON.parse(tong), { lam: 25, nghi: 5, to: 1, tl: 1, thieu: 1, ly: { om: 2, off: 2, phep: 1 } });
  eq('% nghỉ toàn bộ = 5 / 30 (cộng công rồi mới chia, không lấy trung bình % các tổ)', R('tkPct(tkTinh(S.tk, tkThangCua(), 1).tong.pct)'), '16,7%');
  const man = R('vThongKeQs()');
  ok('màn hình: bốn khối (thẻ đầu, bảng các tổ, bảng màu, lý do), cùng cách đếm tổ; không còn biểu đồ, khối quân số lặp', ['Nghỉ 16,7%', 'Toàn bộ · 3/4 tổ có số', 'Bảng các tổ', '% nghỉ 4 tháng gần đây', 'Nghỉ theo lý do', '1 ca thiếu số', 'tổ tự báo'].every((x) => man.includes(x))
    && !man.includes('% nghỉ theo ngày') && !man.includes('Đi làm / quân số') && !man.includes('Tổng các tổ') && !man.includes('Một <b>công</b>') && man.includes('data-a="tkcach"'), man.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 400));
  ok('Cách tính: thu gọn, chạm thì mở', R('ACTIONS.tkcach(), vThongKeQs()').includes('Một <b>công</b> là một người trong một ca') && (R('ACTIONS.tkcach()'), true));
  ok('tổ An (20%) từ ngưỡng 15% trở lên: ô % nghỉ tô đỏ; Binh (10%) không', /An<\/span>(?:(?!<button)[\s\S])*?var\(--badbg\);color:var\(--bad\)\">20,0%/.test(man) && /Binh<\/span>(?:(?!<button)[\s\S])*?background:#ECE9E1\">10,0%/.test(man));
  R(`ACTIONS.tkto({ v: '${U.Cuong}' })`);
  ok('chi tiết tổ thiếu số: lịch tháng có ô "?"', R('vThongKeQs()').includes('Tất cả các tổ') && R('vThongKeQs()').includes('>?</b>'));
  R(`ACTIONS.tkto({ v: '' })`);
  R(`ACTIONS.tkca({ v: '2' })`);
  ok('lọc ca đêm: không có số', R('vThongKeQs()').includes('Chưa có số quân số nào trong tháng này'));
  R(`ACTIONS.tkca({ v: '0' })`);
  R('ACTIONS.tkchep()'); await cho();
  ok('chép tóm tắt tháng', String(chep).startsWith(`THỐNG KÊ QUÂN SỐ THÁNG ${Number(D.slice(5, 7))}/${D.slice(0, 4)}`) && String(chep).includes('• Tổ An: nghỉ 20,0% (4/20 công) — 2 ốm, 2 OFF luân phiên'), chep);
  R(`ACTIONS.tkngmo(); S.form.tkng = '25'; ACTIONS.tkngluu()`); await cho();
  eq('CVKTHT đổi ngưỡng: lưu và màn hình theo ngưỡng mới', [R('S.tk.nguong'), /An<\/span>(?:(?!<button)[\s\S])*?background:#ECE9E1\">20,0%/.test(R('vThongKeQs()'))], [25, true]);
  R(`ACTIONS.tkthang({ v: '-1' })`); await cho();
  eq('lùi một tháng', R('tkThangCua()'), new Date(Date.UTC(Number(D.slice(0, 4)), Number(D.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7));
  ok('tháng đang chạy thì không bấm sang tháng sau được', R(`S.tkThang = null; vThongKeQs()`).includes('aria-label="Tháng sau"') && !R('vThongKeQs()').includes('data-a="tkdi" data-v="1"'));

  /* --- xem theo ngày: so với 3 ngày liền trước và TB tháng --- */
  // An ca ngày ba hôm trước: 18 + 2 ốm (10%), 20 + 0 (0%), 19 + 1 phép (5%) → TB 3 ngày trước = 3 / 60 = 5,0%
  const qd = (n) => new Date(Date.parse(D) - n * 864e5).toISOString().slice(0, 10);
  for (const [n, lam, nghi] of [[1, 18, '{"om":2}'], [2, 20, '{}'], [3, 19, '{"phep":1}']]) {
    S.raw.prepare('INSERT INTO quan_so (ngay, ca, user_id, tong, lam, ca_kia, nghi, ghi_chu, ts, by_id) VALUES (?,1,?,20,?,0,?,NULL,?,?)').run(qd(n), U.An, lam, nghi, Date.now(), U.An);
  }
  R(`S.tk = null; ACTIONS.tkxemngay({ v: '${D}' })`); await cho();
  eq('chạm một ngày ở biểu đồ tháng: sang xem ngày đó', [R('tkChe()'), R('tkNgayCua()')], ['ngay', D]);
  const ky = JSON.parse(R('JSON.stringify(tkKy())'));
  eq('ba ngày liền trước, mốc TB 3 ngày và TB tháng', [ky.truoc, ky.aTu, ky.aDen, ky.bTu], [[qd(3), qd(2), qd(1)], qd(3), qd(1), D.slice(0, 7) + '-01']);
  R(`S.tkCa = 1`);
  const ngMan = R('vThongKeQs()');
  const ngChu = ngMan.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  ok('màn ngày (hôm nay): một dòng so với TB 3 ngày trước, lối sang báo cáo ca, bảng màu có các ngày trước', ['Nghỉ 16,7%', '▲ 11,7 điểm so với TB 3 ngày trước (5,0%)', 'Hôm nay đang diễn ra', 'Báo cáo ca ›'].every((x) => ngChu.includes(x)) && ngMan.includes(`data-v="${qd(1)}"`) && ngMan.includes('data-a="nav" data-s="baocaoca"'), ngChu.slice(0, 500));
  ok('từng tổ có chênh với 3 ngày trước của tổ: An ▲ 15,0', /An<\/span>[\s\S]*?20,0%[\s\S]*?▲ 15,0/.test(ngMan));
  ok('tổ không có số ngày này vẫn có dòng trong bảng', /Dung<\/span>[\s\S]*?không có số/.test(ngMan));
  // quân số theo người, cả hai ca: An 20 người (16 làm, 4 nghỉ), Binh 10 (9 làm, 1 nghỉ); Cuong thiếu số → không tính
  const qsHom = JSON.parse(R(`JSON.stringify((({ sTong, sLam, sNghi, soNgay }) => ({ sTong, sLam, sNghi, soNgay }))(tkQs(S.tk, '${D}', '${D}', null).tong))`));
  eq('quân số hôm nay: tổng các tổ 30 người, đi làm 25, nghỉ 5', qsHom, { sTong: 30, sLam: 25, sNghi: 5, soNgay: 1 });
  ok('màn ngày: bảng các tổ (quân số dưới tên tổ, đi làm, nghỉ) và bảng màu 7 ngày', ngMan.includes('Bảng các tổ') && ngMan.includes('% nghỉ 7 ngày gần đây') && /An<\/span>[\s\S]*?quân số 20[\s\S]*?>16<\/span>[\s\S]*?>4<\/span>/.test(ngMan) && !ngMan.includes('Đi làm / quân số'), ngMan.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 600));
  // Dung tổng 12 người, ca đêm chưa báo, mới có số ca ngày: 0 đi làm (cả tổ ở ca đêm) → bỏ; tự báo ca đêm 7 làm, 1 nghỉ → còn 4 chưa có số
  S.raw.prepare('INSERT INTO quan_so (ngay, ca, user_id, tong, lam, ca_kia, nghi, ghi_chu, ts, by_id) VALUES (?,2,?,12,7,4,?,NULL,?,?)').run(D, U.Dung, '{"om":1}', Date.now(), U.Dung);
  R(`S.tk = null`); R(`ACTIONS.tkxemngay({ v: '${D}' })`); await cho();
  const dung = JSON.parse(R(`JSON.stringify(tkQs(S.tk, '${D}', '${D}', ${U.Dung}).tong)`));
  eq('tổ còn người chưa có số: quân số 12, đi làm 7, nghỉ 1 (4 người còn lại)', [dung.sTong, dung.sLam, dung.sNghi], [12, 7, 1]);
  ok('bảng các tổ nói rõ người chưa có số (thay cho tỷ lệ đi làm / quân số thấp giả)', R('S.tkCa = 0, vThongKeQs()').includes('còn 4 người chưa có số'));
  R('S.tkCa = 1');
  S.raw.prepare('DELETE FROM quan_so WHERE user_id = ? AND ngay = ? AND ca = 2').run(U.Dung, D);
  R(`S.tk = null`); R(`ACTIONS.tkxemngay({ v: '${D}' })`); await cho();
  R(`ACTIONS.tkdi({ v: '-1' })`); await cho();
  eq('lùi một ngày', R('tkNgayCua()'), qd(1));
  R(`ACTIONS.tkdi({ v: '5' })`); await cho();
  eq('tới quá hôm nay: dừng ở hôm nay', R('tkNgayCua()'), D);
  R('ACTIONS.tkchep()'); await cho();
  ok('tóm tắt ngày có dòng quân số', String(chep).includes('Quân số: 30 người · đi làm 25 · nghỉ 5'), chep);
  ok('chép tóm tắt ngày kèm so sánh', String(chep).startsWith(`QUÂN SỐ NGÀY ${D.split('-').reverse().join('/')} (ca ngày)`) && String(chep).includes('So với TB 3 ngày trước: 5,0% (tăng 11,7 điểm)'), chep);
  R(`ACTIONS.tkto({ v: '${U.An}' })`);
  const anNgay = R('vThongKeQs()');
  ok('một tổ, xem theo ngày: so với 3 ngày trước của chính tổ (5,0% → 20,0%)', anNgay.includes('Tổ An') && anNgay.includes('Nghỉ 20,0%') && anNgay.includes('▲ 15,0 điểm'), anNgay.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 400));
  R(`ACTIONS.tkto({ v: '' }); S.tkCa = 0`);
  R(`ACTIONS.tkche({ v: 'thang' })`); await cho();
  const thMan = R('vThongKeQs()');
  ok('màn tháng: một dòng so với tháng trước, bảng màu 4 tháng (chạm để sang tháng đó)', (R('tkTinh(S.tk, tkKy().aTu, 0, tkKy().aDen).tong.pct') == null || thMan.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').includes('so với ' + R('tkKy().aTen'))) && !thMan.includes('% nghỉ theo ngày') && thMan.includes('% nghỉ 4 tháng gần đây') && thMan.includes('data-a="tkden"'), thMan.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 400));

  await vao('An', 'tieudoi');
  R(`ACTIONS.nav({ s: 'qstk' })`); await cho();
  const anMan = R('vThongKeQs()');
  ok('Tiểu đội trưởng: thấy thẳng chi tiết tổ mình, không có ngưỡng để đổi, không thấy tổ khác', anMan.includes('Tổ An') && anMan.includes('Từng ngày') && !anMan.includes('data-a="tkngmo"') && !anMan.includes('Binh'), anMan.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 300));

  /* ===== 4. Sao lưu ===== */
  const bk = await S.call('GET', '/backup', undefined, 'Admin');
  eq('bản sao có bảng số của ca tổ không báo', bk.data.bang.quan_so_tl.length, n0);

  const fail = T.filter((x) => x[0] === 'FAIL');
  console.log(T.map((x) => x[0] + ' | ' + x[1] + (x[2] && x[0] === 'FAIL' ? '  [' + x[2] + ']' : '')).join('\n'));
  console.log('\n=== ' + T.length + ' kiểm tra, ' + fail.length + ' lỗi ===');
  process.exit(fail.length ? 1 : 0);
}
main().catch((e) => { console.error('CRASH', e); process.exit(2); });
