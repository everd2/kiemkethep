/* Hồi quy đợt sửa 4: huỷ sắt vụn của người được lên chức, hàng chờ quân số mất sóng bị server từ chối, ô số ở Cài đặt
   ("1.500" kg/cuộn), số thiết lập của ca đã qua trong báo cáo ca / sản lượng (bản chép lúc hết ca, khớp Thống kê).
   node sua4.test.mjs <đường-dẫn-repo> */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { advance, boot, vnDay } from './harness.mjs';

const ROOT = process.argv[2] || '.';
const T = [];
const ok = (name, cond, extra) => { T.push([cond ? 'PASS' : 'FAIL', name, extra === undefined ? '' : String(extra)]); };
const eq = (name, a, b) => ok(name + ' = ' + JSON.stringify(b), JSON.stringify(a) === JSON.stringify(b), 'thực tế: ' + JSON.stringify(a));
// đưa đồng hồ tới h:m giờ VN kế tiếp: số "ca đã qua / đang chạy" không tuỳ giờ chạy test
const datGio = (h, m = 0) => { const cur = ((Date.now() + 7 * 3600e3) % 864e5) / 60e3; let dd = h * 60 + m - cur; if (dd <= 0) dd += 1440; advance(dd * 60e3); };
const cong = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);

async function main() {
  datGio(9);
  const S = await boot(ROOT);
  await S.call('POST', '/setup', { token: 'setup-tok', name: 'Admin', phone: '0900000001', pin: '2468' });
  await S.login('Admin', '0900000001', '2468');
  const U = {};
  let i = 2;
  for (const [name, role] of [['An', 'tieudoi'], ['Binh', 'tieudoi'], ['Cuong', 'tieudoi'], ['Xoa', 'tieudoi'], ['Ghi', 'tieudoi'], ['Cv', 'cvktht'], ['Cv2', 'cvktht']]) {
    const phone = '09000000' + String(i++).padStart(2, '0');
    const r = await S.call('POST', '/users', { name, phone, role }, 'Admin');
    await S.login(name, phone, r.data.pin);
    await S.call('POST', '/change-pin', { pin: r.data.pin, newPin: '1357' }, name);
    U[name] = r.data.id;
  }
  const D = vnDay();

  /* ===== 1. Sắt vụn: người ghi được lên chức không tự huỷ lần đã duyệt ngoài cửa sổ 10 phút (như voidLoan) ===== */
  const sv1 = await S.call('POST', '/satvun', { tan: '2,5', noi: 'Cty Phế Liệu A', so_phieu: 'PC-41', khu: 'A' }, 'Ghi');
  const sv2 = await S.call('POST', '/satvun', { tan: '1,5', noi: 'Cty Phế Liệu A', so_phieu: 'PC-42', khu: 'A' }, 'Ghi');
  eq('Tiểu đội trưởng ghi sắt vụn (cấp 0)', [sv1.status, S.one('SELECT cap FROM satvun WHERE id = ?', sv1.data.id).cap], [200, 0]);
  eq('CVKTHT duyệt cả hai', [(await S.call('POST', `/satvun/${sv1.data.id}/duyet`, {}, 'Cv')).status, (await S.call('POST', `/satvun/${sv2.data.id}/duyet`, {}, 'Cv')).status], [200, 200]);
  S.raw.prepare("UPDATE users SET role = 'cvktht' WHERE id = ?").run(U.Ghi);
  // lần 2: vừa duyệt, trong 10 phút: người ghi (nay là CVKTHT) vẫn tự huỷ được như mọi người ghi
  eq('người ghi lên chức, trong 10 phút sau duyệt: tự huỷ được', (await S.call('DELETE', '/satvun/' + sv2.data.id, { ly_do: 'gõ nhầm' }, 'Ghi')).status, 200);
  advance(20 * 60e3);
  const tu = await S.call('DELETE', '/satvun/' + sv1.data.id, { ly_do: 'sửa sổ' }, 'Ghi');
  eq('người ghi lên chức, quá 10 phút sau duyệt: KHÔNG tự huỷ lần của mình (trước đây được suốt 7 ngày)', tu.status, 403);
  eq('lần xuất vẫn còn hiệu lực', S.one('SELECT voided FROM satvun WHERE id = ?', sv1.data.id).voided, 0);
  eq('CVKTHT khác vẫn huỷ được (kèm lý do)', (await S.call('DELETE', '/satvun/' + sv1.data.id, { ly_do: 'sửa sổ' }, 'Cv2')).status, 200);

  /* ===== 4. Số thiết lập của CA ĐÃ QUA: bản chép lúc hết ca, không phải số đang đặt ===== */
  for (const n of ['An', 'Binh', 'Cuong']) await S.call('PUT', '/quanso/lich', { ca: 1 }, n);
  const tlq = (b) => S.call('PUT', '/quanso/thietlap', b, 'Cv');
  const tsTl = (u) => ((JSON.parse(S.one('SELECT data FROM bc_mau WHERE id = 1').data).tl || {})[u] || {}).ts || 0;
  eq('đặt số thiết lập hiện tại cho An / Binh / Cuong', [(await tlq({ user: U.An, tong: 20, s1: 15, s2: 0, ts: 0 })).status, (await tlq({ user: U.Binh, tong: 10, s1: 9, s2: 0, n1: { phep: 1 }, ts: 0 })).status, (await tlq({ user: U.Cuong, tong: 12, s1: 11, s2: 0, ts: 0 })).status], [200, 200, 200]);
  /* Ca ngày hai hôm trước đã hết. Lịch mỗi giờ đã chép lúc đó: An 17/20 (3 ốm), Binh lúc đó chưa có số thiết lập (ca thiếu số),
     Xoa 6/8 (tổ đã thôi sau đó). Cuong không có bản chép (vd. hết ca trước lúc đặt lịch ca). */
  const D2 = cong(D, -2);
  const chep = S.raw.prepare('INSERT INTO quan_so_tl (ngay, ca, user_id, tong, lam, nghi, ghi_chu, ts) VALUES (?,?,?,?,?,?,?,?)');
  chep.run(D2, 1, U.An, 20, 17, JSON.stringify({ om: 3 }), null, Date.now() - 2 * 864e5);
  chep.run(D2, 1, U.Binh, null, null, '{}', null, Date.now() - 2 * 864e5);
  chep.run(D2, 1, U.Xoa, 8, 6, JSON.stringify({ off: 2 }), null, Date.now() - 2 * 864e5);
  S.raw.prepare('UPDATE users SET deleted = 1 WHERE id = ?').run(U.Xoa);
  const B2 = (await S.call('GET', `/baocao?ngay=${D2}&ca=1`, undefined, 'Cv')).data;
  eq('ca đã qua: server gửi bản chép lúc hết ca (tlCa), cả ca liền trước', [Object.keys(B2.tlCa || {}).sort(), ((B2.tlCa || {})[1] || {})[U.An]?.lam, ((B2.tlCa || {})[1] || {})[U.Binh]?.lam, ((B2.tlCa || {})[1] || {})[U.Cuong], ((B2.tlCa || {})[1] || {})[U.Xoa]?.uname], [['1', '2'], 17, null, undefined, 'Xoa']);
  const B0 = (await S.call('GET', '/baocao', undefined, 'Cv')).data;
  eq('ca đang diễn ra: không có bản chép, dùng số hiện tại (tl)', [B0.ngay, B0.ca, Object.keys((B0.tlCa || {})[1] || {}).length, B0.tl[U.An].s1], [D, 1, 0, 15]);

  /* --- app.js thật trong máy ảo --- */
  let who = 'Cv';
  const store = {}, dom = {};
  const el = () => ({ value: '', dataset: {}, style: {}, focus() {}, remove() {}, setSelectionRange() {}, querySelector: () => null, querySelectorAll: () => [], appendChild() {}, closest: () => null, set innerHTML(v) {}, get innerHTML() { return ''; } });
  const ctx = {
    console, Date, Math, JSON, String, Number, Object, Array, Set, Map, parseInt, parseFloat, isNaN, Promise, RegExp, Error, TypeError, encodeURIComponent,
    setTimeout: () => 0, clearTimeout: () => {},
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; }, key: (n) => Object.keys(store)[n] || null, get length() { return Object.keys(store).length; } },
    navigator: { onLine: true, clipboard: { writeText: async () => {} } },
    history: { state: null, pushState() {}, replaceState() {} },
    // ô số của Cài đặt: chỉ những ô test đặt (dom) là có trên màn
    document: { activeElement: null, hidden: false, body: { appendChild() {}, removeChild() {} }, createElement: el, getElementById: (id) => dom[id] || (/^(bo|kg|kgc|mn)-/.test(id) ? null : el()), querySelectorAll: () => [], addEventListener() {}, execCommand: () => false },
    window: { addEventListener() {} },
    fetch: async (url, o = {}) => {
      if (!/^\/api\/(baocao|sanluong|bootstrap|quanso|phi)/.test(String(url))) return new Promise(() => {});
      const r = await S.call(o.method || 'GET', String(url).replace(/^\/api/, '').replace(/^\/phi\?.*$/, '/phi'), o.body ? JSON.parse(o.body) : undefined, who);
      return { ok: r.status < 400, status: r.status, json: async () => r.data, headers: { get: () => null } };
    },
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(readFileSync(path.join(ROOT, 'public/app.js'), 'utf8'), ctx, { filename: 'app.js' });
  const R = (src) => vm.runInContext(src, ctx);
  const cho = async () => { for (let k = 0; k < 400; k++) { await new Promise((r) => setImmediate(r)); if (!R('S.busy') && k > 40) return; } };
  const vao = async (name, role) => {
    who = name;
    const bt = (await S.call('GET', '/bootstrap', undefined, name)).data;
    R(`S.boot = ${JSON.stringify(bt)}; indexBoot(S.boot); S.me = ${JSON.stringify({ id: U[name], name, role })}; S.ask = null; S.form = {}; S.qsH = null; S.screen = 'home';`);
  };
  await vao('Cv', 'cvktht');
  const hang = (B) => R(`bcQuanSo(${JSON.stringify(B)}, 'to').rows.map((r) => [r.u.name, r.trang, r.lam, r.tong])`);
  const h2 = hang(B2), cua = (h, n) => h.find((x) => x[0] === n);
  eq('báo cáo ca đã qua: An theo bản chép 17/20 (không phải số đang đặt 15)', cua(h2, 'An'), ['An', 'tl', 17, 20]);
  eq('Binh: lúc hết ca thiếu số -> chưa báo (không lấy số đặt sau đó bù vào)', cua(h2, 'Binh').slice(1, 3), ['chua', null]);
  // không có bản chép: như trước, số đang đặt (số CVKTHT điền cho ca chưa có số nào)
  eq('Cuong: không có bản chép -> số đang đặt 11/12 như trước', cua(h2, 'Cuong'), ['Cuong', 'tl', 11, 12]);
  eq('tổ đã thôi (Xoa) có bản chép: vẫn có dòng 6/8', cua(h2, 'Xoa'), ['Xoa', 'tl', 6, 8]);
  ok('chữ mục 3 ghi nghỉ theo bản chép (3 ốm)', R(`bcQuanSo(${JSON.stringify(B2)}, 'to').dong.join('|')`).includes('Tổ An: ca ngày 17/20 cn, nghỉ 3 cn — 3 ốm'), R(`bcQuanSo(${JSON.stringify(B2)}, 'to').dong.join('|')`));
  eq('ca đang diễn ra: An vẫn theo số đang đặt 15/20', cua(hang(B0), 'An'), ['An', 'tl', 15, 20]);
  // Thống kê đọc cùng bản chép: ba nơi ra một số
  const TK = (await S.call('GET', `/quanso/thongke?tu=${D2}&den=${D2}`, undefined, 'Cv')).data;
  const tkLam = (u) => { const r = TK.tl.find((x) => x.u === u && x.ca === 1); return r ? r.lam : undefined; };
  eq('Thống kê cùng số: An 17, Binh thiếu số, Xoa 6, Cuong không có', [tkLam(U.An), tkLam(U.Binh), tkLam(U.Xoa), tkLam(U.Cuong)], [17, null, 6, undefined]);
  // sản lượng của ngày D2: lấy ca ngày D2 + ca đêm hôm trước, tính bằng bcQuanSo
  R(`slLay('${D2}').then((L) => { S.sl = L; S.slNguon = null; slGan(); })`); await cho();
  const slU = (n) => R(`(S.sl.to.find((x) => x.name === '${n}') || {}).lam`);
  eq('sản lượng ngày đã qua: An 17, Binh 0, Xoa 6 (tổ đã thôi vẫn có dòng)', [slU('An'), slU('Binh'), slU('Xoa')], [17, 0, 6]);

  /* Ca vừa hết mà lịch mỗi giờ chưa chép: số đang đặt (đúng cái lịch sắp chép), như số tạm của Thống kê. Chép xong thì sửa số
     thiết lập không đổi báo cáo ca đó nữa. */
  datGio(9); // sang 9h hôm sau: ca ngày hôm D đã hết
  const B1 = (await S.call('GET', `/baocao?ngay=${D}&ca=1`, undefined, 'Cv')).data;
  eq('ca vừa hết, chưa chép: An 15/20 theo số đang đặt', cua(hang(B1), 'An'), ['An', 'tl', 15, 20]);
  const TK1 = (await S.call('GET', `/quanso/thongke?tu=${D}&den=${D}`, undefined, 'Cv')).data;
  eq('Thống kê (số tạm) cùng số', (TK1.tam.find((x) => x.u === U.An && x.ca === 1) || {}).lam, 15);
  await S.cron();
  eq('lịch mỗi giờ chép đúng số đó', S.one('SELECT lam FROM quan_so_tl WHERE ngay = ? AND ca = 1 AND user_id = ?', D, U.An).lam, 15);
  eq('sửa số thiết lập của An thành 12', (await tlq({ user: U.An, tong: 20, s1: 12, s2: 0, ts: tsTl(U.An) })).status, 200);
  const B1b = (await S.call('GET', `/baocao?ngay=${D}&ca=1`, undefined, 'Cv')).data;
  eq('báo cáo ca hôm qua vẫn 15/20 sau khi sửa số thiết lập', cua(hang(B1b), 'An'), ['An', 'tl', 15, 20]);
  eq('ca đang diễn ra dùng số mới 12', cua(hang((await S.call('GET', '/baocao', undefined, 'Cv')).data), 'An'), ['An', 'tl', 12, 20]);

  /* ===== 3. Cài đặt: ô số kiểu Việt ===== */
  eq('numIn: "1.500" là 1500, "1.500,5" là 1500,5', [R('numIn("1.500")'), R('numIn("1.500,5")'), R('numIn("12.345.678")')], [1500, 1500.5, 12345678]);
  eq('numIn: "," là dấu thập phân; "1.5", "0.5" vẫn là số lẻ', [R('numIn("1,5")'), R('numIn("1.5")'), R('numIn("0.5")'), R('numIn("7,22")'), R('numIn(" 2000 ")')], [1.5, 1.5, 0.5, 7.22, 2000]);
  eq('numIn: ô trống / chữ lạ là số sai', [R('Number.isNaN(numIn(""))'), R('Number.isNaN(numIn("12abc"))'), R('Number.isNaN(numIn("1.2.3"))')], [true, true, true]);
  await vao('Admin', 'admin');
  const d6 = S.one("SELECT bo_size, kg_per_cay FROM phi WHERE id = 'D6'");
  eq('ô hiện số đang lưu đọc lại đúng (khứ hồi)', R(`(() => { const p = S.boot.phiBy.D6, q = S.boot.phiBy.D10, f = phiForm(p), g = phiForm(q); return [numIn(f.kgc), numIn(g.kg), numIn(g.mn)]; })()`), [Math.round(d6.kg_per_cay * d6.bo_size), 7.22, 1]);
  dom['kgc-D6'] = { value: '1.500' };
  R('ACTIONS.psaveall()'); await cho();
  const d6b = S.one("SELECT bo_size, kg_per_cay FROM phi WHERE id = 'D6'");
  eq('gõ cuộn D6 "1.500" kg: lưu 1500 kg/cuộn (trước đây 1,5 kg)', Math.round(d6b.kg_per_cay * d6b.bo_size), 1500);
  delete dom['kgc-D6'];

  /* ===== 2. Hàng chờ quân số: server từ chối thì GIỮ lần báo, hiện thẻ đỏ, tổ tự bỏ ===== */
  await vao('An', 'tieudoi');
  const hom = cong(vnDay(), -1);
  const job = { id: 'j1', uid: U.An, body: { ngay: hom, ca: 1, tong: 20, lam: 18, nghi: { om: 2 }, ghi_chu: '' }, at: Date.now() - 864e5 };
  store['kt:qsq'] = JSON.stringify([job]);
  R('qsFlush()'); await cho();
  const q1 = JSON.parse(store['kt:qsq'] || '[]');
  eq('ca đã qua (409 qua): lần báo KHÔNG bị xoá, gắn lỗi', [q1.length, q1[0] && q1[0].ma, !!(q1[0] && q1[0].err)], [1, 'qua', true]);
  eq('server không ghi gì', S.one('SELECT COUNT(*) n FROM quan_so WHERE ngay = ? AND user_id = ?', hom, U.An).n, 0);
  const the = R('qsTheHome()');
  ok('Tổng quan có thẻ đỏ cho ca đã qua: số đã gõ, nhờ CVKTHT, nút Bỏ, không có nút Gửi lại', the.includes('chưa gửi được') && the.includes('Đi làm 18/20') && the.includes('Nhờ CVKTHT') && the.includes('data-a="qsloibo"') && !the.includes('data-a="qsloigui"'), the.slice(0, 600));
  R('qsFlush()'); await cho();
  eq('lần báo có lỗi không tự gửi lại mỗi vòng', JSON.parse(store['kt:qsq']).length, 1);
  // lỗi khác (không phải ca đã qua): có nút Gửi lại
  store['kt:qsq'] = JSON.stringify([job, { id: 'j2', uid: U.An, body: { ngay: vnDay(), ca: 1, tong: 5, lam: 9, nghi: {}, ghi_chu: '' }, at: Date.now() }]);
  R('qsFlush()'); await cho();
  const q2 = JSON.parse(store['kt:qsq']);
  ok('lỗi số liệu: giữ lại, thẻ có nút Gửi lại', q2.length === 2 && q2[1].err && R("typeof qsLoiHtml === 'function' ? qsLoiHtml() : ''").includes('data-a="qsloigui" data-v="j2"'), JSON.stringify(q2));
  ok('lần báo bị từ chối không còn là "chờ gửi": thẻ báo ca mở lại cho ca đang diễn ra', !R('qhCas()').some((x) => x.cho), JSON.stringify(R('qhCas()').map((x) => !!x.cho)));
  R('ask = async () => true;');
  await R("ACTIONS.qsloibo ? ACTIONS.qsloibo({ v: 'j1' }) : 0"); await cho();
  eq('bấm Bỏ: chỉ bỏ đúng lần đó', JSON.parse(store['kt:qsq']).map((x) => x.id), ['j2']);
  // mất sóng thật (lỗi mạng) thì vẫn giữ nguyên, không gắn lỗi
  store['kt:qsq'] = JSON.stringify([{ ...job, id: 'j3', body: { ...job.body, ngay: vnDay() } }]);
  const f0 = ctx.fetch;
  ctx.fetch = async () => { throw new TypeError('Failed to fetch'); };
  R('qsFlush()'); await cho();
  ctx.fetch = f0;
  const q3 = JSON.parse(store['kt:qsq']);
  eq('mất sóng: giữ nguyên, không gắn lỗi', [q3.length, !!q3[0].err], [1, false]);

  const fail = T.filter((x) => x[0] === 'FAIL');
  console.log(T.map((x) => x[0] + ' | ' + x[1] + (x[2] && x[0] === 'FAIL' ? '  [' + x[2] + ']' : '')).join('\n'));
  console.log('\n=== ' + T.length + ' kiểm tra, ' + fail.length + ' lỗi ===');
  process.exit(fail.length ? 1 : 0);
}
main().catch((e) => { console.error('CRASH', e); process.exit(2); });
