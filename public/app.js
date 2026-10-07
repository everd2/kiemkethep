'use strict';
/* Kho Thép Bãi - giao diện (không cần build). Gọi API /api/* trên cùng domain. */

const $app = document.getElementById('app');
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtInt = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const fmtT = (kg) => (kg / 1000).toFixed(2).replace('.', ',');
const two = (n) => String(n).padStart(2, '0');
const hhmm = (ts) => { const d = new Date(ts); return two(d.getHours()) + ':' + two(d.getMinutes()); };
const dmy = (ts) => { const d = new Date(ts); return two(d.getDate()) + '/' + two(d.getMonth() + 1) + ' ' + hhmm(ts); };
const ROLE = { admin: 'Admin', thukho: 'Thủ kho', nguoidem: 'Người đếm' };

const IC = {
  back: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  chev: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
  home: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>',
  count: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9zM9 14l2 2 4-4"/></svg>',
  inn: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 11l5 5 5-5M5 20h14"/></svg>',
  shield: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6l8-3zM8.5 12l2.5 2.5 4.5-5"/></svg>',
  more: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/></svg>',
};

/* ===================== TRẠNG THÁI ===================== */
const S = {
  me: null, boot: null, screen: 'login', khu: null,
  draft: { cells: {}, added: {} }, sel: null, bo: '', le: '', field: 'bo', rep: { bo: false, le: false }, zoomK: null, confirmKeep: false,
  toast: '', toastErr: false, form: {}, err: '',
  review: null, showNormal: false, audit: null, logFilter: 'all', users: null, pinShown: null,
  usage: null, usageDays: 30, statScope: 'all', expand: {},
  nhap: { mode: 'nhap', phi: null, qty: 0, khu: null, from: null, to: null, lines: [], done: null }, scrollSel: null,
  hist: { date: '', data: null }, bc: { from: '', to: '', data: null }, legend: false, draftWarn: null, cmp: null, busy: false,
  stale: null, // thời điểm của số liệu lưu sẵn khi đang mất kết nối
};
const fmtDay = (d) => String(d || '').split('-').reverse().join('/');

/* ===================== API ===================== */
async function api(method, path, body) {
  let r;
  try {
    r = await fetch('/api' + path, {
      method, credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) { const er = new Error('Không có kết nối mạng'); er.net = true; er.retry = true; throw er; }
  let d = {};
  try { d = await r.json(); } catch (e) { /* không phải JSON */ }
  if (!r.ok) {
    // 429 không có JSON là Cloudflare chặn (thường do hết hạn mức miễn phí trong ngày, tự phục hồi 7:00 sáng)
    const quota = r.status === 429 && !d.error;
    const er = new Error(d.error || (quota ? 'Hệ thống tạm quá tải hoặc hết hạn mức trong ngày, sẽ tự hoạt động lại (muộn nhất 7:00 sáng)' : 'Lỗi ' + r.status));
    er.status = r.status; er.code = d.code; er.retry = quota || r.status >= 500;
    if (r.status === 401 && S.me) { S.me = null; S.boot = null; S.screen = 'login'; S.err = 'Phiên đăng nhập đã hết hạn, hãy đăng nhập lại'; forgetBoot(); render(); }
    throw er;
  }
  return d;
}

function indexBoot(b) {
  b.phiBy = {}; b.phi.forEach((p) => (b.phiBy[p.id] = p));
  b.khuBy = {}; b.khu.forEach((k) => (b.khuBy[k.id] = k));
  b.khuAct = b.khu.filter((k) => k.active);
  b.kp = {}; b.khuPhi.forEach((r) => (b.kp[r.khu_id + '|' + r.phi_id] = r));
  b.cm = {}; b.counts.forEach((c) => (b.cm[c.khu_id + '|' + c.phi_id] = c));
  b.bm = {}; b.baseline.forEach((r) => (b.bm[r.khu_id + '|' + r.phi_id] = r.v));
  b.rm = {}; b.reports.forEach((r) => (b.rm[r.khu_id] = r));
  // nhập/chuyển kể từ lần chốt trước theo khu × phi, và cộng theo phi
  b.mv = {}; b.innPhi = {};
  (b.innKhu || []).forEach((r) => { b.mv[r.khu_id + '|' + r.phi_id] = r.q; b.innPhi[r.phi_id] = (b.innPhi[r.phi_id] || 0) + r.q; });
  b.rate = {}; (b.rates || []).forEach((r) => (b.rate[r.phi_id] = r.per_day));
}
async function loadBoot() {
  const b = await api('GET', '/bootstrap');
  try { localStorage.setItem('kt:boot', JSON.stringify({ at: Date.now(), b })); } catch (e) { /* đầy bộ nhớ */ }
  indexBoot(b);
  S.boot = b; S.me = b.user; S.stale = null;
}
// Mất mạng hoặc hết hạn mức: vẫn mở được app với số liệu lần tải gần nhất (chỉ xem)
function useCachedBoot() {
  let c = null;
  try { c = JSON.parse(localStorage.getItem('kt:boot') || 'null'); } catch (e) { c = null; }
  if (!c || !c.b || !c.b.user) return false;
  indexBoot(c.b);
  S.boot = c.b; S.me = c.b.user; S.stale = c.at;
  return true;
}
function forgetBoot() { try { localStorage.removeItem('kt:boot'); } catch (e) { /* bỏ qua */ } }
const isAdmin = () => S.me && S.me.role === 'admin';
const canIn = () => S.me && (S.me.role === 'admin' || S.me.role === 'thukho');

function say(msg, err) {
  S.toast = msg; S.toastErr = !!err;
  clearTimeout(say.t);
  say.t = setTimeout(() => { S.toast = ''; render(); }, 5000);
}

/* ===================== TÍNH TOÁN ===================== */
const isPresent = (k, p) => {
  const b = S.boot;
  const kp = b.kp[k + '|' + p];
  if (kp && kp.active) return true;
  const c = b.cm[k + '|' + p];
  if (c && c.v > 0) return true;
  return k === S.khu && !!S.draft.added[p];
};
const refOf = (k, p) => S.boot.bm[k + '|' + p]; // undefined nếu chưa có tồn chuẩn
const movedOf = (k, p) => S.boot.mv[k + '|' + p] || 0; // nhập/chuyển vào (+) hoặc ra (−) khu từ lần chốt trước
// số dự kiến = tồn chuẩn hôm qua + nhập/chuyển; dùng để so lệch khi đếm
const expOf = (k, p) => { const r = refOf(k, p), m = movedOf(k, p); return r === undefined ? (m ? m : undefined) : r + m; };
// chỉ cho "giữ nguyên" khi có số hôm qua, khu không có thép nhập/chuyển, và chưa giữ nguyên quá số ngày cho phép
function keepBlock(k, p) {
  if (refOf(k, p) === undefined) return 'Phi này chưa có số hôm qua, hãy nhập số đếm.';
  if (movedOf(k, p)) return 'Khu có thép nhập/chuyển phi này từ lần chốt trước, hãy đếm thực tế.';
  if ((S.boot.kp[k + '|' + p] || {}).keep_streak >= S.boot.settings.max_keep_streak) return 'Phi này giữ nguyên quá nhiều ngày, hãy đếm lại.';
  return '';
}
function valOf(k, p, useDraft) {
  const b = S.boot;
  if (useDraft && k === S.khu && S.draft.cells[p]) return S.draft.cells[p].v;
  const c = b.cm[k + '|' + p];
  if (c) return c.v;
  const r = b.bm[k + '|' + p];
  return r === undefined ? 0 : r;
}
function totals() {
  const b = S.boot;
  const T = { cay: 0, kg: 0, perPhi: {}, perKhu: {}, used: {}, usedKg: null, inKg: 0 };
  b.phi.forEach((p) => (T.perPhi[p.id] = 0));
  b.khuAct.forEach((k) => (T.perKhu[k.id] = { cay: 0, kg: 0 }));
  // cộng cả khu đang ẩn (nếu còn thép) để tổng khớp với màn Duyệt
  for (const k of b.khu) {
    for (const p of b.phi) {
      const v = valOf(k.id, p.id);
      T.perPhi[p.id] += v; T.cay += v; T.kg += v * p.kg_per_cay;
      if (T.perKhu[k.id]) { T.perKhu[k.id].cay += v; T.perKhu[k.id].kg += v * p.kg_per_cay; }
    }
  }
  // "Nhập hôm nay" chỉ tính thép về, không tính chuyển khu
  b.receipts.forEach((r) => { const p = b.phiBy[r.phi_id]; if (p && r.kind !== 'chuyen') T.inKg += r.qty * p.kg_per_cay; });
  // nhập kể từ lần chốt gần nhất (gồm ngày quên chốt), giống cách server tính; chuyển khu tự triệt tiêu
  const inn = b.innPhi;
  if (b.lastClosed) {
    T.usedKg = 0;
    for (const p of b.phi) {
      let old = 0;
      for (const k of b.khu) old += b.bm[k.id + '|' + p.id] || 0;
      let cnt = 0;
      for (const k of b.khu) cnt += valOf(k.id, p.id);
      const u = old + (inn[p.id] || 0) - cnt;
      T.used[p.id] = u; T.usedKg += u * p.kg_per_cay;
    }
  }
  return T;
}
function khuStatus(k) {
  const r = S.boot.rm[k.id];
  const hasPhi = S.boot.khuPhi.some((x) => x.khu_id === k.id && x.active);
  if (!r) return hasPhi || !S.boot.lastClosed ? { cls: 'idle', label: 'Chưa báo', who: 'Chưa có ai báo' } : { cls: 'idle', label: 'Chưa báo', who: 'Chưa có ai báo' };
  const who = r.uname + ' · ' + hhmm(r.ts);
  if (r.conflict && !r.resolved) return { cls: 'warn', label: 'Cần xem', who: '2 người báo số khác nhau' };
  if (r.recount) return { cls: 'warn', label: 'Đếm lại', who: 'Admin yêu cầu đếm lại' };
  return { cls: 'ok', label: 'Đã báo', who };
}
const reportedCount = () => S.boot.khuAct.filter((k) => S.boot.rm[k.id]).length;

/* ===================== NHÁP & GỬI BÁO CÁO ===================== */
const draftKey = () => 'kt:' + S.boot.today + ':' + S.khu;
function saveDraft() { try { localStorage.setItem(draftKey(), JSON.stringify(S.draft)); } catch (e) { /* đầy bộ nhớ */ } }
function loadDraft(fresh) {
  let d = null;
  if (!fresh) { try { d = JSON.parse(localStorage.getItem(draftKey()) || 'null'); } catch (e) { d = null; } }
  const rep = S.boot.rm[S.khu];
  S.draftWarn = null;
  // nháp cũ trên máy, nhưng sau đó người khác đã gửi báo cáo khu này: hỏi dùng số nào
  if (d && d.cells && rep && rep.user_id !== S.me.id && rep.ts > (d.baseTs || 0) && Object.keys(d.cells).length) S.draftWarn = { uname: rep.uname, ts: rep.ts };
  if (!d || !d.cells) {
    d = { cells: {}, added: {}, baseTs: rep ? rep.ts : 0 };
    for (const c of S.boot.counts) {
      if (c.khu_id === S.khu) d.cells[c.phi_id] = { v: c.v, kind: c.kind, bo: c.bo == null ? undefined : c.bo, le: c.le == null ? undefined : c.le };
    }
  }
  S.draft = d;
}
function openDem(k) {
  S.khu = k; S.sel = null; S.bo = ''; S.le = ''; S.zoomK = null; S.confirmKeep = false;
  try { localStorage.setItem('kt:lastKhu', k); } catch (e) { /* bỏ qua */ }
  loadDraft();
  S.screen = 'dem';
}
function myPhiList() { return S.boot.phi.filter((p) => isPresent(S.khu, p.id)); }
function pendingList() { return myPhiList().filter((p) => !S.draft.cells[p.id]); }

/* Hàng chờ báo cáo: mỗi báo cáo ghi kèm NGÀY ĐẾM. Server từ chối nếu đã sang ngày khác,
   khi đó báo cáo nằm lại kèm lý do để người dùng tự chọn "gửi làm số hôm nay" hoặc "bỏ". */
const PKEY = 'kt:pending';
function readPending() {
  try { const q = JSON.parse(localStorage.getItem(PKEY) || '[]'); return Array.isArray(q) ? q : []; } catch (e) { return []; }
}
function writePending(q) { try { localStorage.setItem(PKEY, JSON.stringify(q)); } catch (e) { /* đầy bộ nhớ */ } }
const sameJob = (a, b) => a.khu === b.khu && a.day === b.day && a.ts === b.ts;
function queuePending(job) {
  writePending(readPending().filter((x) => !(x.khu === job.khu && x.day === job.day)).concat([job]));
}
let flushing = false;
async function flushPending() {
  if (flushing || !S.me || S.me.must_change) return;
  const q = readPending();
  if (!q.some((j) => !j.err)) return;
  flushing = true;
  const rest = [];
  let sent = 0, failed = 0;
  try {
    for (const job of q) {
      if (job.err) { rest.push(job); continue; }
      if (!job.day) { rest.push({ ...job, err: 'Báo cáo lưu từ bản cũ, không rõ ngày đếm' }); failed++; continue; }
      try { await api('PUT', '/counts', { khu: job.khu, day: job.day, items: job.items }); sent++; }
      catch (e) { if (e.retry) rest.push(job); else { rest.push({ ...job, err: e.message }); failed++; } }
    }
  } finally {
    // giữ các báo cáo mới được thêm trong lúc đang gửi
    writePending(rest.concat(readPending().filter((x) => !q.some((j) => sameJob(j, x)))));
    flushing = false;
  }
  if (sent || failed) {
    try { await loadBoot(); } catch (e) { /* bỏ qua */ }
    if (sent) say('Đã tự gửi ' + sent + ' báo cáo lưu khi mất mạng.' + (failed ? ' Có báo cáo không gửi được, xem ở Tổng quan.' : ''), !!failed);
    else say('Có báo cáo lưu khi mất mạng không gửi được, xem ở Tổng quan.', true);
    render();
  }
}
async function sendCounts() {
  if (S.busy) return;
  S.busy = true; render();
  try { await sendCountsInner(); } finally { S.busy = false; }
  render();
}
async function sendCountsInner() {
  const list = myPhiList();
  if (pendingList().length) return;
  const items = list.map((p) => { const c = S.draft.cells[p.id]; return { phi: p.id, v: c.v, kind: c.kind, bo: c.bo, le: c.le }; });
  const khuName = S.boot.khuBy[S.khu].name;
  const job = { khu: S.khu, day: S.boot.today, items, ts: Date.now() };
  try {
    const r = await api('PUT', '/counts', { khu: job.khu, day: job.day, items });
    try { localStorage.removeItem(draftKey()); } catch (e) { /* bỏ qua */ }
    await loadBoot();
    S.sel = null; S.screen = 'home';
    say('Đã gửi báo cáo ' + khuName + (r.conflict ? '. Số khác với người báo trước, admin sẽ xem.' : '. Cảm ơn bạn!'));
  } catch (e) {
    if (e.retry) { queuePending(job); say('Chưa gửi được (' + e.message + '). Đã lưu báo cáo, sẽ tự gửi lại.', true); }
    else if (e.code === 'stale_day') {
      queuePending({ ...job, err: e.message });
      S.sel = null; S.screen = 'home';
      try { await loadBoot(); } catch (er) { /* bỏ qua */ }
      say('Đã sang ngày mới. Báo cáo được giữ lại ở Tổng quan để bạn quyết định.', true);
    } else say(e.message, true);
  }
}
function pendingHtml() {
  const q = readPending();
  if (!q.length) return '';
  const kn = (id) => (S.boot && S.boot.khuBy[id] ? S.boot.khuBy[id].name : id);
  const waiting = q.filter((j) => !j.err).length;
  return (waiting ? `<div class="card warn sm b">${waiting} báo cáo đang chờ gửi (mất mạng), sẽ tự gửi khi có mạng.</div>` : '') +
    q.map((j, i) => (j.err ? `<div class="card bad col gap8"><b style="font-size:17px">Báo cáo ${esc(kn(j.khu))}${j.day ? ' đếm ngày ' + esc(fmtDay(j.day)) : ''} chưa gửi được</b>
      <span class="sm">${esc(j.err)}</span>
      <div class="row gap6"><button class="btn s f1" data-a="pendsend" data-i="${i}">Gửi làm số hôm nay</button><button class="btn s bad f1" data-a="pendrm" data-i="${i}">Bỏ báo cáo</button></div></div>` : '')).join('');
}


/* ===================== MÀN HÌNH ===================== */
function head(title, sub, back) {
  return `<div class="top">${back ? `<button class="iconbtn" aria-label="Quay lại" data-a="nav" data-s="${back}">${IC.back}</button>` : ''}<div class="t"><h1>${title}</h1>${sub ? `<small>${sub}</small>` : ''}</div></div>`;
}

function lastPhone() { try { return localStorage.getItem('kt:phone') || ''; } catch (e) { return ''; } }
function vLogin() {
  return `<div class="login f1 scroll">
    <div class="col gap8"><div class="logo"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg></div>
      <div style="font-size:30px;font-weight:700;line-height:1.2">Kho Thép Bãi</div>
      <div class="muted" style="font-size:18px">Đăng nhập bằng số điện thoại và PIN 4 số</div></div>
    <label class="field">Số điện thoại<input id="phone" type="tel" inputmode="numeric" autocomplete="username" data-enter="login" value="${esc(S.form.phone || lastPhone())}"></label>
    <label class="field">PIN 4 số<input id="pin" type="password" inputmode="numeric" maxlength="4" autocomplete="current-password" data-enter="login"></label>
    <div class="err" id="err">${esc(S.err)}</div>
    <button class="btn pri full" style="height:60px;font-size:20px" data-a="login">ĐĂNG NHẬP</button>
    <div class="muted" style="text-align:center;line-height:1.5">Máy sẽ nhớ đăng nhập 30 ngày.<br>Quên PIN: báo admin để đặt lại.</div>
  </div>`;
}
function vForcePin() {
  return `<div class="login f1 scroll">
    <div style="font-size:26px;font-weight:700">Đổi PIN lần đầu</div>
    <div class="muted" style="font-size:17px;line-height:1.5">Chào ${esc(S.me.name)}. Hãy tự chọn PIN 4 số mới (không dùng 1234, 0000...).</div>
    <label class="field">PIN hiện tại (admin đã đưa)<input id="pin0" type="password" inputmode="numeric" maxlength="4"></label>
    <label class="field">PIN mới<input id="pin1" type="password" inputmode="numeric" maxlength="4"></label>
    <label class="field">Nhập lại PIN mới<input id="pin2" type="password" inputmode="numeric" maxlength="4" data-enter="changepin"></label>
    <div class="err" id="err">${esc(S.err)}</div>
    <button class="btn pri full" style="height:60px;font-size:20px" data-a="changepin">LƯU PIN MỚI</button>
    <button class="btn full" data-a="logout">Đăng xuất</button>
  </div>`;
}

/* --- Tổng quan --- */
function vHome() {
  const b = S.boot, T = totals();
  const alerts = [];
  const miss = b.khuAct.filter((k) => !b.rm[k.id]);
  if (miss.length) alerts.push({ bad: false, t: (miss.length === 1 ? miss[0].name : miss.length + ' khu') + ' chưa báo', s: miss.map((k) => k.name).join(', '), to: 'dem' });
  b.reports.forEach((r) => {
    const k = b.khuBy[r.khu_id];
    if (!k || !k.active) return;
    if (r.conflict && !r.resolved) alerts.push({ bad: false, t: k.name + ': 2 người báo số khác nhau', s: isAdmin() ? 'Vào Duyệt để chọn số' : 'Admin đang xem', to: isAdmin() ? 'duyet' : 'home' });
    if (r.recount) alerts.push({ bad: false, t: k.name + ' cần đếm lại', s: 'Admin yêu cầu đếm lại', to: 'dem' });
  });
  b.phi.forEach((p) => {
    if (b.lastClosed && T.used[p.id] < 0) alerts.push({ bad: true, t: p.id + ' đã dùng âm (' + T.used[p.id] + ' cây)', s: 'Nhập sót phiếu hoặc đếm sai?', to: isAdmin() ? 'duyet' : 'home' });
    const dl = daysLeft(p.id, T.perPhi[p.id]);
    if (T.perPhi[p.id] >= p.min_stock && dl !== null && dl < 3) alerts.push({ bad: false, t: p.id + ' chỉ còn đủ dùng ' + daysTxt(dl), s: 'Còn ' + fmtInt(T.perPhi[p.id]) + ' cây, dùng trung bình ' + fmtInt(b.rate[p.id]) + ' cây/ngày', to: 'ton' });
    if (T.perPhi[p.id] < p.min_stock) alerts.push({ bad: true, t: p.id + ' dưới mức tối thiểu', s: 'Còn ' + fmtInt(T.perPhi[p.id]) + ' cây, tối thiểu ' + p.min_stock, to: 'ton' });
  });
  const maxKhu = Math.max(1, ...b.khuAct.map((k) => T.perKhu[k.id].kg));
  const maxCay = Math.max(1, ...b.phi.map((p) => T.perPhi[p.id]), ...b.phi.map((p) => p.min_stock));
  const khuCards = b.khuAct.map((k) => {
    const st = khuStatus(k), tk = T.perKhu[k.id];
    const unrep = !b.rm[k.id];
    return `<div class="card col gap8" style="${st.cls === 'warn' ? 'background:var(--warnbg);border:2px solid var(--warn)' : ''}">
      <div class="row" style="justify-content:space-between"><b style="font-size:20px">${esc(k.name)}</b><b style="font-size:20px">${fmtT(tk.kg)} tấn</b></div>
      <div class="bar"><i style="width:${Math.round(tk.kg / maxKhu * 100)}%"></i></div>
      <div class="row" style="justify-content:space-between;gap:8px"><span class="sm">${esc(st.who)}${unrep && b.lastClosed ? ' · tạm lấy số hôm qua' : ''}</span><span class="badge ${st.cls}">${st.label}</span></div>
    </div>`;
  }).join('');
  const bars = b.phi.map((p) => {
    const v = T.perPhi[p.id], low = v < p.min_stock;
    return `<div class="r"><span class="l">${p.id}</span><div class="t"><i class="${low ? 'low' : ''}" style="width:${Math.max(2, Math.round(v / maxCay * 100))}%"></i><u style="left:${Math.round(p.min_stock / maxCay * 100)}%"></u></div><span class="v ${low ? 'low' : ''}">${fmtInt(v)}</span></div>`;
  }).join('');
  // quên chốt ngày trước thì "đã dùng" là lượng dùng gộp từ sau ngày chốt gần nhất
  const yday = new Date(Date.parse(b.today) - 864e5).toISOString().slice(0, 10);
  const usedLabel = b.lastClosed && b.lastClosed < yday ? 'Đã dùng từ sau ' + fmtDay(b.lastClosed).slice(0, 5) : 'Đã dùng hôm nay';
  const note = miss.length ? `Tạm tính: ${miss.length} khu chưa báo${b.lastClosed ? ' nên lấy số hôm qua' : ''}` : 'Đủ ' + b.khuAct.length + '/' + b.khuAct.length + ' khu đã báo hôm nay';
  return `<div class="f1 scroll" id="body">
    <div class="hero">
      <div class="row" style="justify-content:space-between"><span>Tổng quan · ${esc(b.today.split('-').reverse().join('/'))}</span><span class="badge" style="background:#fff;color:var(--pri)">${ROLE[S.me.role]}</span></div>
      <div class="row" style="justify-content:space-between;align-items:flex-end"><div class="col"><span style="font-size:15px">Tồn toàn bãi</span><span class="big">${fmtT(T.kg)} tấn</span></div><span style="font-size:17px;padding-bottom:6px">${fmtInt(T.cay)} cây</span></div>
      <div class="sm" style="color:#D6E0EE">${note}</div>
      <div class="mini"><div><span>Nhập hôm nay</span><b>${fmtT(T.inKg)} tấn</b></div><div><span>${usedLabel}</span><b>${T.usedKg === null ? '—' : fmtT(T.usedKg) + ' tấn'}</b></div></div>
    </div>
    ${b.closed ? '<div class="toast" style="margin-top:12px">Ngày hôm nay đã được admin chốt.</div>' : ''}
    <div class="pad col gap12">
      ${pendingHtml()}
      ${alerts.length ? `<h2 class="sec">Cần xử lý (${alerts.length})</h2>` + alerts.map((a) => `<button class="alertbtn ${a.bad ? 'bad' : 'warn'}" data-a="nav" data-s="${a.to}"><span class="f1 col" style="gap:2px"><b style="font-size:17px">${esc(a.t)}</b><span class="sm">${esc(a.s)}</span></span>${IC.chev}</button>`).join('') : ''}
      <div class="row" style="justify-content:space-between;align-items:baseline"><h2 class="sec">Tồn theo khu và người báo</h2><span class="sm muted">${reportedCount()}/${b.khuAct.length} khu đã báo</span></div>
      ${khuCards}
      <div class="row" style="justify-content:space-between;align-items:baseline"><h2 class="sec">Tồn theo phi</h2><button class="b" style="border:0;background:transparent;color:var(--pri);text-decoration:underline;font-size:15px;padding:8px 0" data-a="nav" data-s="ton">Xem chi tiết</button></div>
      <div class="sm muted">Vạch đen là mức tối thiểu. Thanh đỏ là dưới mức tối thiểu.</div>
      <div class="bars">${bars}</div>
    </div></div>`;
}

/* --- Chọn khu --- */
function vKhu() {
  const b = S.boot;
  const cards = b.khuAct.map((k) => {
    const st = khuStatus(k);
    const cls = st.cls === 'ok' ? 'background:var(--okbg);border:2px solid var(--ok)' : st.cls === 'warn' ? 'background:var(--warnbg);border:2px solid var(--warn)' : 'background:#ECEAE4;border:2px solid #8C8678';
    return `<button class="col gap8" style="${cls};min-height:104px;padding:14px;border-radius:16px;text-align:left;align-items:flex-start" data-a="khuopen" data-k="${esc(k.id)}">
      <span class="row" style="justify-content:space-between;width:100%"><b style="font-size:22px">${esc(k.name)}</b><span class="badge ${st.cls}">${st.label}</span></span><span class="sm">${esc(st.who)}</span></button>`;
  }).join('');
  return `${head('Chọn khu để đếm', 'Đã báo ' + reportedCount() + '/' + b.khuAct.length + ' khu hôm nay', S.khu ? 'dem' : 'home')}
    <div class="f1 scroll pad" id="body"><div class="grid2">${cards}</div></div>`;
}

/* --- Bảng đếm toàn bãi --- */
function demView() {
  const b = S.boot, k = S.khu, kname = b.khuBy[k].name;
  const zk = S.zoomK && S.zoomK !== k ? S.zoomK : null;
  const others = b.khuAct.filter((x) => x.id !== k);
  const shown = zk ? others.filter((x) => x.id === zk) : others;
  const n = Math.max(1, shown.length);
  const cwStyle = zk ? 'flex:1' : `width:${Math.max(24, Math.floor(226 / n))}px;flex:1 1 0`;
  const size = (p) => b.phiBy[p].bo_size;
  const boN = parseInt(S.bo || '0', 10), leN = parseInt(S.le || '0', 10);
  const hasIn = S.bo !== '' || S.le !== '';
  const curV = (p) => boN * size(p) + leN;
  const list = myPhiList(), pend = pendingList();
  const T = { own: 0, ownKg: 0, all: 0, allKg: 0 };
  const colTot = {};
  b.khuAct.forEach((x) => (colTot[x.id] = 0));

  const lrows = [], rrows = [];
  b.phi.forEach((p, idx) => {
    const present = isPresent(k, p.id);
    const cell = S.draft.cells[p.id];
    const isSel = S.sel === p.id;
    const ref = expOf(k, p.id), mv = movedOf(k, p.id);
    // so với số dự kiến (hôm qua + nhập/chuyển), không phải số hôm qua
    const delta = (v) => { if (ref === undefined) return null; const d = v - ref; return { big: ref >= 10 && Math.abs(d) / ref > 0.5, t: d === 0 ? 'đúng dự kiến' : d > 0 ? '+' + d : '−' + Math.abs(d) }; };
    let cls, txt, sub = '';
    if (!present) { cls = 'abs'; txt = '·'; }
    else if (isSel) { cls = 'sel'; txt = hasIn ? String(curV(p.id)) : '__'; const dl = hasIn ? delta(curV(p.id)) : null; sub = dl ? dl.t : ''; if (dl && dl.big) cls += ' big'; }
    else if (cell) {
      if (cell.kind === 'giu') { cls = 'giu'; txt = '=' + cell.v; sub = 'giữ nguyên'; }
      else { const dl = delta(cell.v); cls = dl && dl.big ? 'big' : 'okc'; txt = String(cell.v); sub = dl ? dl.t : ''; }
    } else { cls = 'pend'; txt = ref === undefined ? '?' : String(ref); sub = mv ? 'dự kiến' : 'hôm qua'; }
    let total = 0;
    b.khuAct.forEach((x) => {
      let v;
      if (x.id === k) v = isSel && hasIn ? curV(p.id) : (cell ? cell.v : valOf(k, p.id));
      else v = valOf(x.id, p.id);
      colTot[x.id] += v; total += v;
      T.all += v; T.allKg += v * p.kg_per_cay;
      if (x.id === k) { T.own += v; T.ownKg += v * p.kg_per_cay; }
    });
    const bg = isSel ? ' sel' : idx % 2 ? ' alt' : '';
    lrows.push(`<div class="mxrow${bg}"><div style="width:40px;padding-left:4px;font-weight:700">${p.id}</div><div style="width:72px;display:flex;justify-content:center"><button class="own ${cls}" aria-label="Nhập ${p.id}" data-a="cell" data-p="${p.id}"><b>${txt}</b><i>${sub}</i></button></div><div style="width:52px;text-align:right;padding-right:6px;font-weight:700">${fmtInt(total)}</div></div>`);
    rrows.push(`<div class="mxrow${bg}">${shown.map((x) => {
      const st = khuStatus(x);
      const has = S.boot.cm[x.id + '|' + p.id] || S.boot.bm[x.id + '|' + p.id] !== undefined || (S.boot.kp[x.id + '|' + p.id] && S.boot.kp[x.id + '|' + p.id].active);
      const v = valOf(x.id, p.id);
      const unrep = !b.rm[x.id];
      return `<div class="oc" style="${cwStyle};font-size:${zk ? 20 : 13}px;color:${has ? (unrep ? '#6B6F76' : '#1C1F22') : '#B9B4A8'};background:${st.cls === 'warn' ? '#FFF3D6' : unrep ? '#F0EEE8' : 'transparent'}">${has ? v : '·'}</div>`;
    }).join('')}</div>`);
  });
  const hdrs = shown.map((x) => `<button class="khh" aria-label="Phóng to ${esc(x.name)}" data-a="zoom" data-k="${esc(x.id)}" style="${cwStyle};font-size:${zk ? 15 : 14}px">${zk ? esc(x.name) + ' (chạm để thu nhỏ)' : esc(x.id)}</button>`).join('');
  const tots = shown.map((x) => `<div class="oc" style="${cwStyle};font-size:${zk ? 16 : 12}px;font-weight:700;height:40px">${fmtInt(colTot[x.id])}</div>`).join('');

  const keepable = pend.filter((p) => !keepBlock(k, p.id));
  const keepTxt = pend.length === 0 ? 'Đã xử lý hết phi của khu' : S.confirmKeep ? `Bấm lần nữa để giữ nguyên ${keepable.length} phi` : `Giữ nguyên ${keepable.length} phi còn lại`;
  const canSend = pend.length === 0 && list.length > 0;
  const absent = b.phi.filter((p) => !isPresent(k, p.id)).map((p) => p.id);

  let sheet = '';
  if (S.sel) {
    const p = S.sel, ref = refOf(k, p), mv = movedOf(k, p), ex = expOf(k, p);
    const streakOk = !keepBlock(k, p);
    const refTxt = 'Hôm qua: ' + (ref === undefined ? 'chưa có' : ref + ' cây') + (mv ? ` · ${mv > 0 ? 'nhập/chuyển vào +' + mv : 'chuyển đi −' + Math.abs(mv)} · <b>dự kiến ${ex}</b>` : '');
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Xóa', '0', S.field === 'bo' ? 'Lẻ ›' : '‹ Bó'];
    sheet = `<div class="pad-sheet">
      <div class="row" style="justify-content:space-between;gap:8px"><div class="col"><b style="font-size:16px">${esc(kname)} · ${p}${hasIn ? '  = ' + fmtInt(curV(p)) + ' cây · ' + fmtT(curV(p) * b.phiBy[p].kg_per_cay) + ' tấn' : ''}</b><span class="sm muted">${refTxt} · 1 bó = ${size(p)} cây</span></div><button class="btn s" style="height:40px" data-a="closesel">Đóng</button></div>
      <div class="row gap6"><button class="boxn ${S.field === 'bo' ? 'on' : ''}" data-a="fld" data-v="bo"><span>Số bó</span><b>${S.bo || '0'}</b></button><span class="sm b" style="white-space:nowrap">× ${size(p)} +</span><button class="boxn ${S.field === 'le' ? 'on' : ''}" data-a="fld" data-v="le"><span>Cây lẻ</span><b>${S.le || '0'}</b></button></div>
      <div class="keys">${keys.map((d, i) => `<button class="key ${d.length > 1 ? 'fn' : ''}" data-a="key" data-d="${i}">${d}</button>`).join('')}</div>
      <div class="acts"><button class="btn ${streakOk ? '' : 'dis'}" data-a="keep">Giữ nguyên</button><button class="btn bad" data-a="zero">Hết (0)</button><button class="btn pri" data-a="next">TIẾP</button></div>
    </div>`;
  }
  const pendingNote = readPending().length;

  return `<div class="top" style="padding-bottom:2px"><button class="iconbtn" aria-label="Về tổng quan" data-a="nav" data-s="home">${IC.back}</button><div class="t"><h1>Đếm ${esc(kname)}</h1><small>Bảng toàn bãi, nhập ngay trong bảng</small></div><button class="btn s" data-a="nav" data-s="khu">Đổi khu</button></div>
    <div class="mxhead"><div><span>${esc(kname)} (bạn)</span><b>${fmtT(T.ownKg)} tấn</b></div><div style="text-align:center"><span>Phi chưa nhập</span><b>${pend.length}</b></div><div style="text-align:right"><span>Tổng bãi (tạm tính)</span><b>${fmtT(T.allKg)} tấn</b></div></div>
    ${S.toast ? `<div class="toast ${S.toastErr ? 'err' : ''}">${esc(S.toast)}</div>` : ''}
    ${b.closed ? '<div class="toast err">Ngày hôm nay đã chốt, không sửa được nữa.</div>' : ''}
    ${S.sel ? '' : `<div class="col gap6" style="padding:6px 12px 2px"><button class="btn s full ${pend.length === 0 || !keepable.length ? 'dis' : ''}" data-a="keepall">${keepTxt}</button>
      ${S.draftWarn ? `<div class="card warn col gap6"><b>${esc(S.draftWarn.uname)} đã gửi báo cáo khu này lúc ${hhmm(S.draftWarn.ts)}, sau khi bạn bắt đầu nháp.</b><div class="row gap6"><button class="btn s f1" data-a="draftnew">Dùng số mới</button><button class="btn s f1" data-a="draftkeep">Giữ nháp của tôi</button></div></div>` : ''}
      <button class="sm" style="border:0;background:transparent;color:var(--pri);text-align:left;padding:4px 0;text-decoration:underline" data-a="legend">${S.legend ? 'Ẩn chú thích' : 'ⓘ Chú thích màu'}</button>
      ${S.legend ? '<div class="sm muted" style="line-height:1.4">Xanh lá: đã đếm · Dấu =: giữ nguyên · Nét đứt vàng: chưa nhập (số mờ là số dự kiến) · Vàng đậm: lệch lớn so với dự kiến · Chấm: không có (chạm để thêm phi). Chạm chữ cái khu để phóng to.</div>' : ''}
      ${absent.length ? `<div class="sm b">Không có: ${absent.join(', ')} (${absent.length} phi)</div>` : ''}</div>`}
    <div class="f1" id="mx"><div class="mxw">
      <div class="mxl"><div class="mxh"><div style="width:40px;padding-left:4px;font-size:13px;font-weight:700">Phi</div><div style="width:72px;text-align:center;font-size:14px;font-weight:700;color:var(--pri);line-height:1.1">${esc(kname)}<br>(bạn)</div><div style="width:52px;text-align:right;padding-right:6px;font-size:13px;font-weight:700">Tổng bãi</div></div>${lrows.join('')}<div class="mxtot"><div style="width:40px;padding-left:4px;font-size:13px;font-weight:700">Cộng</div><div style="width:72px;text-align:center;font-weight:700;color:var(--pri)">${fmtInt(colTot[k])}</div><div style="width:52px;text-align:right;padding-right:6px;font-weight:700">${fmtInt(T.all)}</div></div></div>
      <div class="mxr"><div class="mxh">${hdrs}</div>${rrows.join('')}<div class="mxtot">${tots}</div></div>
    </div></div>
    ${S.sel ? sheet : `<div class="sendbar">${pendingNote ? '<div class="sm b" style="color:var(--bad);margin-bottom:6px">Có báo cáo chưa gửi được, xem ở Tổng quan.</div>' : ''}<button class="btn full ${canSend && !b.closed ? 'pri' : 'dis'}" data-a="send">${canSend ? 'GỬI BÁO CÁO ' + esc(kname.toUpperCase()) : 'Còn ' + pend.length + ' phi chưa nhập'}</button></div>`}`;
}

/* --- Nhập kho / chuyển khu --- */
const nkgText = (qty, p) => `= ${fmtInt(qty * p.kg_per_cay)} kg (${fmtT(qty * p.kg_per_cay)} tấn) · 1 bó = ${p.bo_size} cây`;
const kName = (id) => (S.boot.khuBy[id] ? S.boot.khuBy[id].name : id);
// Gom các dòng cùng phiếu (grp) để hiện và hoàn tác cả phiếu
function receiptGroups(list) {
  const by = {}, order = [];
  list.forEach((r) => { const g = r.grp || 'id' + r.id; if (!by[g]) { by[g] = []; order.push(g); } by[g].push(r); });
  return order.map((g) => {
    const rows = by[g], r0 = rows[0];
    const chuyen = r0.kind === 'chuyen';
    const pos = rows.filter((r) => r.qty > 0);
    const from = chuyen ? (rows.find((r) => r.qty < 0) || {}).khu_id : null;
    const kg = pos.reduce((a, r) => a + r.qty * (S.boot.phiBy[r.phi_id] ? S.boot.phiBy[r.phi_id].kg_per_cay : 0), 0);
    const what = pos.map((r) => `${r.phi_id} ${fmtInt(r.qty)}`).join(' · ') + ' cây';
    const title = chuyen ? `Chuyển ${esc(kName(from))} → ${esc(kName(pos[0] ? pos[0].khu_id : ''))}` : `Nhập vào ${esc(kName(r0.khu_id))}`;
    return { id: Math.min(...rows.map((r) => r.id)), r0, chuyen, title, what, kg, voided: !!r0.voided };
  });
}
function vNhap() {
  const b = S.boot, N = S.nhap;
  if (!b.khuAct.length) return `${head('Nhập kho', '', 'home')}<div class="pad muted">Chưa có khu nào đang dùng. Admin vào Thêm → Cài đặt để thêm khu.</div>`;
  const okKhu = (id) => id && b.khuBy[id] && b.khuBy[id].active;
  if (!okKhu(N.khu)) N.khu = okKhu(S.khu) ? S.khu : b.khuAct[0].id;
  if (!okKhu(N.from)) N.from = b.khuAct[0].id;
  if (!okKhu(N.to) || N.to === N.from) N.to = (b.khuAct.find((k) => k.id !== N.from) || {}).id || null;
  if (!b.phiBy[N.phi]) N.phi = b.phi[0].id;
  const p = b.phiBy[N.phi];
  const chuyen = N.mode === 'chuyen';
  const khuChips = (sel, f, skip) => `<div class="wrap">${b.khuAct.filter((k) => k.id !== skip).map((k) => `<button class="chip s ${k.id === sel ? 'on' : ''}" data-a="nkhu" data-f="${f}" data-v="${esc(k.id)}">${esc(k.name)}</button>`).join('')}</div>`;
  const lineKg = N.lines.reduce((a, l) => a + l.qty * b.phiBy[l.phi].kg_per_cay, 0);
  const lines = N.lines.length ? `<div class="card" style="padding:0;overflow:hidden">${N.lines.map((l, i) => `<div class="li"><span><b>${l.phi}</b> · ${fmtInt(l.qty)} cây · ${fmtT(l.qty * b.phiBy[l.phi].kg_per_cay)} tấn</span><button class="btn s bad" data-a="nrm" data-i="${i}">Xóa</button></div>`).join('')}<div class="li" style="background:#E8EEF6"><b>${N.lines.length} dòng</b><b>${fmtT(lineKg)} tấn</b></div></div>` : '';
  const groups = receiptGroups(b.receipts);
  const recs = groups.map((g) => {
    const can = isAdmin() || (g.r0.user_id === S.me.id && Date.now() - g.r0.ts < 10 * 60e3);
    return `<div class="li"><span><b>${g.title}</b><br>${esc(g.what)} · ${fmtT(g.kg)} tấn<br><span class="sm muted">${esc(g.r0.uname)} · ${hhmm(g.r0.ts)}${g.r0.note ? ' · ' + esc(g.r0.note) : ''}</span></span>${can ? `<button class="btn s bad" data-a="void" data-id="${g.id}">Hủy</button>` : ''}</div>`;
  }).join('');
  const saveLbl = chuyen ? 'XÁC NHẬN CHUYỂN KHU' : 'XÁC NHẬN NHẬP KHO';
  return `${head(chuyen ? 'Chuyển khu' : 'Nhập kho', chuyen ? 'Dời thép giữa các khu, tổng bãi không đổi' : 'Ghi phiếu thép mới về', 'home')}
  <div class="f1 scroll pad col gap12" id="body">
    <div class="row gap6"><button class="chip s f1 ${chuyen ? '' : 'on'}" data-a="nmode" data-v="nhap">Nhập thép về</button><button class="chip s f1 ${chuyen ? 'on' : ''}" data-a="nmode" data-v="chuyen">Chuyển khu</button></div>
    ${N.done ? `<div class="card ok col gap8"><b style="font-size:18px">Đã lưu phiếu</b><span style="font-size:17px">${esc(N.done.text)}</span><button class="btn s full" data-a="void" data-id="${N.done.id}">HOÀN TÁC CẢ PHIẾU</button></div>` : ''}
    ${chuyen
      ? `<div class="col gap8"><b style="font-size:18px">1. Từ khu</b>${khuChips(N.from, 'from')}</div><div class="col gap8"><b style="font-size:18px">2. Sang khu</b>${khuChips(N.to, 'to', N.from)}</div>`
      : `<div class="col gap8"><b style="font-size:18px">1. Để vào khu</b>${khuChips(N.khu, 'khu')}</div>`}
    <div class="col gap8"><b style="font-size:18px">${chuyen ? 3 : 2}. Chọn phi</b><div class="grid4">${b.phi.map((x) => `<button class="chip ${x.id === N.phi ? 'on' : ''}" data-a="nphi" data-v="${x.id}">${x.id}</button>`).join('')}</div></div>
    <div class="col gap8"><b style="font-size:18px">${chuyen ? 4 : 3}. Số cây ${N.phi}</b>
      <div class="row gap6"><button class="btn s" data-a="nq" data-v="-10">−10</button><button class="btn s" data-a="nq" data-v="-1">−1</button><input class="f1" id="nqty" type="text" inputmode="numeric" pattern="[0-9]*" aria-label="Số cây" placeholder="0" value="${N.qty || ''}" style="min-width:0;width:100%;height:60px;border-radius:14px;border:2px solid #8C8678;background:#fff;text-align:center;font-size:32px;font-weight:700"><button class="btn s pri" data-a="nq" data-v="1">+1</button><button class="btn s pri" data-a="nq" data-v="10">+10</button></div>
      <span class="muted" id="nkg">${nkgText(N.qty, p)}</span>
      <div class="row gap6"><button class="btn s f1" data-a="nq" data-v="bo">+1 bó (${p.bo_size})</button><button class="btn s f1" data-a="nadd">+ Thêm phi khác</button></div></div>
    ${lines}
    <input class="inp s" id="nnote" maxlength="200" placeholder="Ghi chú: số phiếu, biển số xe... (không bắt buộc)" data-model="nnote" value="${esc(S.form.nnote || '')}">
    <button class="btn pri full" style="height:60px;font-size:20px" data-a="nconfirm">${saveLbl}</button>
    ${recs ? `<h2 class="sec">Phiếu hôm nay</h2><div class="card" style="padding:0;overflow:hidden">${recs}</div>` : ''}
  </div>`;
}

/* --- Tồn bãi --- */
// số ngày còn đủ dùng = tồn / lượng dùng trung bình mỗi ngày (28 ngày gần nhất, tính khi chốt ngày)
function daysLeft(phi, v) {
  const r = S.boot.rate[phi];
  return r && r > 0 ? v / r : null;
}
const daysTxt = (d) => (d < 1 ? 'dưới 1 ngày' : '~' + Math.floor(d) + ' ngày');
function vTon() {
  const b = S.boot, T = totals();
  const rows = b.phi.map((p) => {
    const v = T.perPhi[p.id], low = v < p.min_stock, open = S.expand[p.id];
    const dl = daysLeft(p.id, v), short = dl !== null && dl < 3;
    const det = open ? `<div class="card" style="margin:-4px 0 4px;border-radius:0 0 16px 16px">${b.khu.map((k) => { const x = valOf(k.id, p.id); return x ? `<div class="li"><span>${esc(k.name)}${k.active ? '' : ' (ẩn)'}</span><b>${fmtInt(x)} cây · ${fmtT(x * p.kg_per_cay)} tấn</b></div>` : ''; }).join('') || '<div class="muted">Không có ở khu nào</div>'}${b.rate[p.id] ? `<div class="li"><span class="sm muted">Dùng trung bình</span><span class="sm">${fmtInt(b.rate[p.id])} cây/ngày</span></div>` : ''}</div>` : '';
    const sub = low ? 'Dưới mức tối thiểu (' + p.min_stock + ')' + (dl !== null ? ' · còn ' + daysTxt(dl) : '') : dl !== null ? 'Còn đủ dùng ' + daysTxt(dl) : 'Đủ dùng';
    return `<button class="tonrow ${low ? 'low' : ''}" data-a="expand" data-p="${p.id}"><span class="col" style="gap:2px"><b style="font-size:24px">${p.id}</b><span class="sm" style="${low ? 'color:var(--bad);font-weight:700' : short ? 'color:var(--warn);font-weight:700' : 'color:#5F6670'}">${sub}</span></span><span class="col" style="align-items:flex-end"><b style="font-size:30px;line-height:1.1">${fmtInt(v)}</b><span class="sm muted">cây · ${fmtT(v * p.kg_per_cay)} tấn</span></span></button>${det}`;
  }).join('');
  return `${head('Tồn bãi', b.lastClosed ? 'Tồn chuẩn chốt ngày ' + fmtDay(b.lastClosed) + ' · chạm phi để xem từng khu' : 'Chưa có ngày nào được chốt', 'home')}
    <div class="hero" style="margin:4px 16px;border-radius:14px;padding:14px 16px"><div class="row" style="justify-content:space-between"><div class="col"><span style="font-size:15px">Tổng toàn bãi</span><span style="font-size:30px;font-weight:700">${fmtT(T.kg)} tấn</span></div><span style="font-size:17px">${fmtInt(T.cay)} cây</span></div></div>
    <div class="f1 scroll pad col gap8" id="body">${rows}</div>`;
}

/* --- Duyệt (admin) --- */
function vDuyet() {
  const b = S.boot, R = S.review;
  if (!R) return `${head('Duyệt số liệu', 'Đang tải...', 'home')}<div class="pad muted">Đang tải...</div>`;
  const exc = [], badRows = R.rows.filter((r) => r.neg || r.high), normal = R.rows.filter((r) => !(r.neg || r.high));
  let nExc = 0;
  const kname = (id) => (b.khuBy[id] ? b.khuBy[id].name : id);
  const items = R.exceptions.filter((e) => e.type !== 'phi').map((e) => {
    nExc++;
    if (e.type === 'khu_missing') return `<div class="card warn col gap8"><b style="font-size:18px">${esc(e.name)} chưa báo</b><span class="sm">Chưa có ai báo hôm nay. Hãy nhắc người phụ trách, hoặc tự đếm khu này ở tab Đếm.</span></div>`;
    if (e.type === 'conflict') {
      const r = R.reports.find((x) => x.khu_id === e.khu);
      const C = S.cmp && S.cmp.khu === e.khu ? S.cmp : null;
      let cmp = '';
      if (C && !C.data) cmp = '<span class="sm">Đang tải...</span>';
      else if (C && C.data && C.data.diffs.length) {
        const A = C.data.a, B = C.data.b;
        cmp = `<div class="card" style="padding:0;overflow:hidden;color:var(--ink)"><div class="li sm b"><span style="width:44px">Phi</span><span class="f1" style="text-align:center">${esc(A.uname)} ${hhmm(A.ts)}</span><span class="f1" style="text-align:center">${esc(B.uname)} ${hhmm(B.ts)}</span></div>${C.data.diffs.map((x) => {
          const pickB = C.pick[x.phi] !== 'a';
          return `<div class="li"><b style="width:44px">${x.phi}</b><button class="chip s f1 ${pickB ? '' : 'on'}" data-a="cpick" data-p="${x.phi}" data-v="a">${x.a == null ? '—' : x.a}</button><button class="chip s f1 ${pickB ? 'on' : ''}" data-a="cpick" data-p="${x.phi}" data-v="b">${x.b == null ? '—' : x.b}</button></div>`;
        }).join('')}</div><span class="sm">Chạm số đúng cho từng phi (đang chọn: ô đậm), rồi lưu.</span>
        <div class="row gap8"><button class="btn s warnb f1" data-a="cresolve" data-k="${esc(e.khu)}">LƯU LỰA CHỌN</button><button class="btn s warnb f1" data-a="recount" data-k="${esc(e.khu)}">ĐẾM LẠI</button></div>`;
      } else if (C && C.data) cmp = '<span class="sm">Không tìm thấy khác biệt trong lịch sử, có thể giữ số báo sau.</span>';
      return `<div class="card warn col gap8"><b style="font-size:18px">${esc(e.name)}: 2 người báo số khác nhau</b><span class="sm">Số đang dùng là của ${esc(r ? r.uname : '')} (báo sau).</span>
        ${cmp || `<div class="row gap8"><button class="btn s warnb f1" data-a="cview" data-k="${esc(e.khu)}">SO SÁNH 2 SỐ</button><button class="btn s warnb f1" data-a="resolve" data-k="${esc(e.khu)}">DÙNG SỐ BÁO SAU</button></div><button class="btn s warnb full" data-a="recount" data-k="${esc(e.khu)}">YÊU CẦU ĐẾM LẠI</button>`}
        ${C && C.data && !C.data.diffs.length ? `<button class="btn s warnb full" data-a="resolve" data-k="${esc(e.khu)}">DÙNG SỐ BÁO SAU</button>` : ''}</div>`;
    }
    if (e.type === 'late') return `<div class="card warn col gap8"><b style="font-size:18px">${esc(e.name)}: có thép nhập/chuyển sau khi khu báo (${hhmm(e.reportTs)})</b><span class="sm">${e.items.map((x) => esc(x.phi) + ' ' + (x.q > 0 ? '+' : '−') + fmtInt(Math.abs(x.q)) + ' cây').join(' · ')}. Số đếm của khu chưa gồm lượng này nên tính "đã dùng" sẽ sai.</span><button class="btn s warnb full" data-a="recount" data-k="${esc(e.khu)}">YÊU CẦU ${esc(e.name.toUpperCase())} ĐẾM LẠI</button></div>`;
    if (e.type === 'recount') return `<div class="card warn col gap8"><b style="font-size:18px">${esc(e.name)} đang chờ đếm lại</b><span class="sm">Đã yêu cầu, chưa có số mới.</span></div>`;
    return '';
  }).join('');
  const cards = badRows.map((r) => {
    nExc++;
    const sign = r.topNet > 0 ? '+' + r.topNet : '−' + Math.abs(r.topNet);
    const canRe = r.topKhu && R.reports.some((x) => x.khu_id === r.topKhu);
    return `<div class="card bad col gap8"><div class="row" style="justify-content:space-between"><b style="font-size:24px">${r.phi}</b><span class="badge bad">Bất thường</span></div>
      <div class="eq"><div><span>Tồn cũ</span><b>${r.old}</b></div><div><span>+ Nhập</span><b>${r.inn}</b></div><div><span>− Đếm mới</span><b>${r.cnt}</b></div><div><span>= Đã dùng</span><b style="color:var(--bad)">${r.used}</b></div></div>
      <b style="font-size:16px">${r.neg ? 'Đã dùng âm: có thể nhập sót phiếu hoặc đếm sai.' : 'Dùng gấp hơn 3 lần mức bình thường (' + r.avg + ' cây/ngày).'}</b>
      ${r.topKhu ? `<span class="sm">Khu biến động lớn nhất: <b>${esc(kname(r.topKhu))}</b> (${sign} cây)</span>` : ''}
      ${canRe ? `<button class="btn s bad full" data-a="recount" data-k="${esc(r.topKhu)}">YÊU CẦU ${esc(kname(r.topKhu).toUpperCase())} ĐẾM LẠI</button>` : ''}</div>`;
  }).join('');
  const allOk = R.exceptions.length === 0;
  const verdict = allOk
    ? `<div class="card ok col" style="gap:4px"><b style="font-size:19px">Ngày bình thường, đề xuất chốt</b><span style="font-size:16px;line-height:1.4">Đủ khu đã báo, không phi nào dùng âm hay bất thường. Bạn chỉ cần xác nhận một lần.</span></div>`
    : `<div class="card warn col" style="gap:4px"><b style="font-size:19px">Có ${R.exceptions.length} việc cần xem trước khi chốt</b><span class="sm" style="line-height:1.4">Tự đề xuất chốt khi: đủ khu, không phi dùng âm, không phi dùng quá 3 lần mức bình thường.</span></div>`;
  const gap = R.span > 1 && !R.closed ? `<div class="card warn col" style="gap:4px"><b>Có ${R.span - 1} ngày chưa chốt</b><span class="sm" style="line-height:1.4">Lượng dùng dưới đây gộp ${R.span} ngày kể từ ngày chốt ${esc(fmtDay(R.last))}. Cảnh báo "dùng nhiều" đã chia theo số ngày.</span></div>` : '';
  const first = !R.last ? `<div class="card col" style="gap:4px"><b>Ngày đầu tiên</b><span class="sm muted">Chưa có tồn chuẩn cũ. Chốt ngày này để số đếm hôm nay trở thành tồn chuẩn đầu tiên.</span></div>` : '';
  const normalHtml = S.showNormal ? `<div class="card" style="padding:0;overflow:hidden">${normal.map((r) => `<div class="li"><b>${r.phi}</b><span class="sm">${R.last ? r.old + ' + ' + r.inn + ' − ' + r.cnt + ' = ' + r.used : 'đếm ' + r.cnt + ' cây'}</span></div>`).join('')}</div>` : '';
  return `${head('Duyệt ngày ' + b.today.split('-').reverse().slice(0, 2).join('/'), 'Chỉ hiện những gì cần xem', 'home')}
  <div class="f1 scroll pad col gap12" id="body">
    ${R.closed ? '<div class="card ok"><b>Đã chốt ngày hôm nay.</b> Số đếm hôm nay là tồn chuẩn mới, ngày này đã khóa.</div>' : verdict}
    ${R.closed ? `<div class="card col gap6"><b>Chốt nhầm?</b><input class="inp s" id="reopenNote" placeholder="Lý do mở lại (bắt buộc)" data-model="reopenNote" value="${esc(S.form.reopenNote || '')}"><button class="btn s bad full" data-a="reopen">MỞ LẠI NGÀY HÔM NAY</button></div>` : ''}
    ${gap}${first}${items}${cards}
    <button class="card b" style="text-align:left;min-height:52px;font-size:16px;border:2px solid #B9B4A8" data-a="toggle-normal">${normal.length} phi bình thường · ${S.showNormal ? 'bấm để ẩn' : 'bấm để xem'}</button>${normalHtml}
    <label class="col gap6" style="font-weight:600">Ghi chú lý do ${allOk ? '(không bắt buộc)' : '(bắt buộc khi còn việc bất thường)'}<input class="inp s" style="height:52px" id="note" data-model="note" placeholder="Ví dụ: nhập sót phiếu D16" value="${esc(S.form.note || '')}"></label>
  </div>
  <div class="sendbar"><button class="btn ${R.closed ? 'dis' : 'ok'} full" style="height:60px;font-size:20px" data-a="close">${allOk ? 'XÁC NHẬN CHỐT NGÀY' : 'DUYỆT & CHỐT NGÀY'}</button></div>`;
}

/* --- Xem lại ngày cũ --- */
const ydayOf = (d) => new Date(Date.parse(d) - 864e5).toISOString().slice(0, 10);
function vLichSu() {
  const b = S.boot, H = S.hist, D = H.data;
  const top = `${head('Xem lại ngày cũ', 'Số liệu tồn, nhập, dùng của một ngày', 'more')}
    <div class="row gap8" style="padding:4px 16px"><input class="inp s f1" type="date" id="hdate" max="${b.today}" value="${H.date}" data-change="hdate"><button class="btn s" data-a="hprev">‹ Trước</button><button class="btn s ${H.date >= b.today ? 'dis' : ''}" data-a="hnext">Sau ›</button></div>`;
  if (!D) return `${top}<div class="pad muted">Đang tải...</div>`;
  const key = (r) => r.khu_id + '|' + r.phi_id;
  const cm = {}, bm = {}, pm = {};
  D.counts.forEach((r) => (cm[key(r)] = r.v));
  D.baseline.forEach((r) => (bm[key(r)] = r.v));
  D.prevBaseline.forEach((r) => (pm[key(r)] = r.v));
  const closed = !!D.close;
  const val = (k, p) => { const x = k + '|' + p; return closed ? bm[x] || 0 : cm[x] !== undefined ? cm[x] : pm[x] || 0; };
  const sum = Object.fromEntries(D.summary.map((r) => [r.phi_id, r]));
  let totKg = 0, totIn = 0, totUse = 0;
  const rows = b.phi.map((p) => {
    let v = 0;
    b.khu.forEach((k) => (v += val(k.id, p.id)));
    const s = sum[p.id];
    totKg += v * p.kg_per_cay;
    if (s) { totIn += s.nhap * p.kg_per_cay; totUse += (s.dung || 0) * p.kg_per_cay; }
    const open = S.expand['h' + p.id];
    const det = open ? b.khu.map((k) => { const x = val(k.id, p.id); return x ? `<div class="li" style="padding-left:28px"><span class="sm">${esc(k.name)}</span><span class="sm">${fmtInt(x)} cây</span></div>` : ''; }).join('') : '';
    return `<button class="li" style="width:100%;background:#fff;border:0;border-bottom:1px solid var(--line);text-align:left" data-a="expand" data-p="h${p.id}"><b style="width:44px">${p.id}</b><span class="sm" style="flex:1;text-align:right">${fmtInt(v)} cây${s ? ` · nhập ${fmtInt(s.nhap)} · dùng ${s.dung == null ? '—' : fmtInt(s.dung)}` : ''}</span></button>${det}`;
  }).join('');
  const reps = D.reports.map((r) => `${esc(kName(r.khu_id))}: ${esc(r.uname)} ${hhmm(r.ts)}`).join(' · ');
  const groups = receiptGroups(D.receipts.slice().reverse());
  const recs = groups.map((g) => `<div class="li" style="${g.voided ? 'opacity:.55;text-decoration:line-through' : ''}"><span><b>${g.title}</b>${g.voided ? ' (đã hủy)' : ''}<br>${esc(g.what)} · ${fmtT(g.kg)} tấn<br><span class="sm muted">${esc(g.r0.uname)} · ${hhmm(g.r0.ts)}${g.r0.note ? ' · ' + esc(g.r0.note) : ''}</span></span></div>`).join('');
  const status = closed
    ? `<div class="card ok col" style="gap:4px"><b>Đã chốt${D.close.uname ? ' bởi ' + esc(D.close.uname) : ' tự động'} lúc ${dmy(D.close.ts)}</b>${D.close.span > 1 ? `<span class="sm">Gộp ${D.close.span} ngày (các ngày trước đó chưa chốt)</span>` : ''}${D.close.note ? `<span class="sm">Ghi chú: ${esc(D.close.note)}</span>` : ''}</div>`
    : `<div class="card warn col" style="gap:4px"><b>Ngày này chưa chốt</b><span class="sm">Số tồn lấy theo báo cáo đếm trong ngày; khu không báo tạm lấy tồn chuẩn trước đó.</span></div>`;
  return `${top}<div class="f1 scroll pad col gap12" id="body">
    ${status}
    <div class="hero" style="border-radius:14px;padding:14px 16px"><div class="row" style="justify-content:space-between"><div class="col"><span style="font-size:15px">Tồn cuối ngày ${esc(fmtDay(D.day))}</span><span style="font-size:28px;font-weight:700">${fmtT(totKg)} tấn</span></div>${closed ? `<div class="col" style="align-items:flex-end;font-size:15px"><span>Nhập ${fmtT(totIn)} tấn</span><span>Dùng ${fmtT(totUse)} tấn</span></div>` : ''}</div></div>
    <h2 class="sec">Theo phi (chạm để xem từng khu)</h2>
    <div class="card" style="padding:0;overflow:hidden">${rows}</div>
    <h2 class="sec">Người báo</h2><div class="sm">${reps || '<span class="muted">Không có báo cáo đếm</span>'}</div>
    <h2 class="sec">Phiếu nhập / chuyển</h2>${recs ? `<div class="card" style="padding:0;overflow:hidden">${recs}</div>` : '<div class="muted">Không có phiếu</div>'}
  </div>`;
}
async function loadHist(date) {
  S.hist = { date, data: null }; render();
  try { const d = await api('GET', '/day?date=' + date); if (S.hist.date === date) S.hist.data = d; }
  catch (e) { say(e.message, true); }
  render();
}

/* --- Báo cáo theo kỳ --- */
function vBaoCao() {
  const b = S.boot, R = S.bc, D = R.data;
  const top = `${head('Báo cáo Nhập – Dùng – Tồn', 'Theo các ngày đã chốt', 'more')}
    <div class="col gap8" style="padding:4px 16px">
      <div class="row gap8"><label class="f1 sm">Từ ngày<input class="inp s" style="width:100%" type="date" id="rfrom" max="${b.today}" value="${R.from}"></label><label class="f1 sm">Đến ngày<input class="inp s" style="width:100%" type="date" id="rto" max="${b.today}" value="${R.to}"></label></div>
      <div class="wrap"><button class="chip s" data-a="rquick" data-v="week">7 ngày</button><button class="chip s" data-a="rquick" data-v="month">Tháng này</button><button class="chip s" data-a="rquick" data-v="last">Tháng trước</button></div>
      <div class="row gap8"><button class="btn s pri f1" data-a="rload">XEM</button><button class="btn s f1" data-a="rcsv">Tải Excel (CSV)</button></div></div>`;
  if (!D) return `${top}<div class="pad muted">Đang tải...</div>`;
  const kgOf = (id) => (b.phiBy[id] ? b.phiBy[id].kg_per_cay : 0);
  const t = { dau: 0, nhap: 0, dung: 0, cuoi: 0 };
  const rows = D.rows.map((r) => {
    const kg = kgOf(r.phi);
    t.dau += (r.dau || 0) * kg; t.nhap += r.nhap * kg; t.dung += r.dung * kg; t.cuoi += (r.cuoi || 0) * kg;
    const dash = (x) => (x == null ? '—' : fmtInt(x));
    return `<tr><th>${r.phi}</th><td>${dash(r.dau)}</td><td>${fmtInt(r.nhap)}</td><td>${fmtInt(r.dung)}</td><td><b>${dash(r.cuoi)}</b></td></tr>`;
  }).join('');
  const days = D.days.slice().reverse().map((d) => `<div class="li"><span>${fmtDay(d.day)}${d.span > 1 ? ` <span class="sm muted">(gộp ${d.span} ngày)</span>` : ''}</span><span class="sm">nhập ${fmtT(d.nhap_kg)} · dùng ${fmtT(d.dung_kg)} · tồn <b>${fmtT(d.ton_kg)}</b> tấn</span></div>`).join('');
  return `${top}<div class="f1 scroll pad col gap12" id="body">
    ${D.closedDays ? '' : '<div class="card warn">Không có ngày nào được chốt trong khoảng này.</div>'}
    ${D.openDay ? '' : '<div class="sm muted">Chưa có ngày chốt trước kỳ nên không có số tồn đầu kỳ.</div>'}
    <div class="card" style="padding:0;overflow-x:auto"><table class="tbl"><thead><tr><th>Phi</th><th>Tồn đầu</th><th>Nhập</th><th>Dùng</th><th>Tồn cuối</th></tr></thead><tbody>${rows}</tbody>
      <tfoot><tr><th>Tấn</th><td>${fmtT(t.dau)}</td><td>${fmtT(t.nhap)}</td><td>${fmtT(t.dung)}</td><td><b>${fmtT(t.cuoi)}</b></td></tr></tfoot></table></div>
    <div class="sm muted">Đơn vị: cây (dòng cuối: tấn). Tồn đầu là ngày chốt ${D.openDay ? fmtDay(D.openDay) : '—'}, tồn cuối là ngày chốt ${D.closeDay ? fmtDay(D.closeDay) : '—'}. Chuyển khu không tính vào nhập.</div>
    ${days ? `<h2 class="sec">Theo ngày (${D.closedDays} ngày đã chốt)</h2><div class="card" style="padding:0;overflow:hidden">${days}</div>` : ''}
  </div>`;
}
function repRange(kind) {
  const today = S.boot.today;
  if (kind === 'week') return [new Date(Date.parse(today) - 6 * 864e5).toISOString().slice(0, 10), today];
  if (kind === 'last') {
    const first = today.slice(0, 8) + '01';
    const end = ydayOf(first);
    return [end.slice(0, 8) + '01', end];
  }
  return [today.slice(0, 8) + '01', today];
}
async function loadRep() {
  const R = S.bc;
  R.data = null; render();
  try { R.data = await api('GET', `/report?from=${R.from}&to=${R.to}`); } catch (e) { say(e.message, true); }
  render();
}

/* --- Nhật ký (admin) --- */
// dòng phiếu trong nhật ký: bản mới có lines, bản cũ có phi/qty
const lineTxt = (d) => (d.lines ? d.lines.map((l) => l.phi + ' ' + l.qty).join(', ') : (d.phi || '') + ' ' + (d.qty || '')) + ' cây';
function fmtAudit(a) {
  let d = {};
  try { d = a.detail ? JSON.parse(a.detail) : {}; } catch (e) { d = {}; }
  const kn = (id) => (S.boot.khuBy[id] ? S.boot.khuBy[id].name : id);
  const M = {
    login: ['đăng nhập', 'login'], login_fail: ['nhập sai PIN (lần ' + d.n + ')', 'flag'], login_locked: ['bị khóa ' + (d.mins >= 60 ? d.mins / 60 + ' giờ' : (d.mins || 15) + ' phút') + ' do nhập sai PIN nhiều lần', 'flag'],
    change_pin: ['đổi PIN', 'login'], setup: ['thiết lập hệ thống', 'admin'],
    receipt: ['nhập kho vào ' + kn(d.khu) + ': ' + lineTxt(d) + (d.note ? ' (' + d.note + ')' : ''), 'nhap'],
    transfer: ['chuyển ' + kn(d.from) + ' → ' + kn(d.to) + ': ' + lineTxt(d) + (d.note ? ' (' + d.note + ')' : ''), 'nhap'],
    receipt_void: ['hủy phiếu ' + (d.kind === 'chuyen' ? 'chuyển khu' : 'nhập') + ': ' + lineTxt({ ...d, lines: (d.lines || []).filter((l) => l.qty > 0) }), 'nhap'],
    close_day: ['chốt ngày ' + fmtDay(d.day) + (d.note ? ' (' + d.note + ')' : ''), 'admin'],
    auto_close: ['tự chốt ngày ' + fmtDay(d.day) + ' (ngày bình thường)', 'admin'],
    auto_close_skip: ['không tự chốt ngày ' + fmtDay(d.day) + ': ' + d.reason, 'flag'],
    reopen_day: ['mở lại ngày ' + fmtDay(d.day) + ' (' + d.note + ')', 'flag'], recount: ['yêu cầu ' + kn(d.khu) + ' đếm lại', 'admin'], conflict_resolve: [(d.changes && d.changes.length ? 'chọn số cho ' + kn(d.khu) + ': ' + d.changes.map((c) => c.phi + ' ' + c.from + ' → ' + c.to).join('; ') : 'chọn số báo sau cho ' + kn(d.khu)), 'admin'],
    user_create: ['tạo tài khoản ' + d.name, 'admin'], user_reset_pin: ['đặt lại PIN cho ' + d.name, 'admin'], user_lock: ['khóa ' + d.name, 'admin'], user_unlock: ['mở khóa ' + d.name, 'admin'],
    user_role: ['đổi vai trò ' + d.name + ' thành ' + (ROLE[d.role] || d.role), 'admin'], user_logout: ['đăng xuất mọi máy của ' + d.name, 'admin'],
    khu_create: ['thêm ' + d.name, 'admin'], khu_update: ['sửa ' + d.name + (d.active ? '' : ' (ẩn)'), 'admin'], phi_update: ['sửa cấu hình ' + (d.items ? d.items.map((x) => x.id).join(', ') : d.id), 'admin'], settings_update: ['sửa cài đặt', 'admin'],
  };
  if (a.action === 'count') {
    const ch = (d.changes || []).map((c) => c.phi + ': ' + (c.from == null ? 'mới' : c.from) + ' → ' + c.to).join('; ');
    return { text: 'báo ' + kn(d.khu) + (ch ? ' (' + ch + ')' : ' (không đổi)'), type: 'dem', flag: !!d.conflict };
  }
  const m = M[a.action] || [a.action, 'admin'];
  return { text: m[0], type: m[1] === 'flag' ? 'login' : m[1], flag: m[1] === 'flag' };
}
function vNhatKy() {
  const F = [['all', 'Tất cả'], ['dem', 'Báo đếm'], ['nhap', 'Nhập kho'], ['admin', 'Admin'], ['flag', 'Cần chú ý']];
  const rows = (S.audit || []).map((a) => ({ a, f: fmtAudit(a) })).filter((x) => S.logFilter === 'all' || (S.logFilter === 'flag' ? x.f.flag : x.f.type === S.logFilter));
  return `${head('Nhật ký hoạt động', 'Không ai xóa hoặc sửa được', 'more')}
  <div class="wrap" style="padding:6px 16px">${F.map((f) => `<button class="chip s ${S.logFilter === f[0] ? 'on' : ''}" data-a="logf" data-v="${f[0]}">${f[1]}</button>`).join('')}</div>
  <div class="f1 scroll pad col gap8" id="body">${S.audit ? (rows.map((x) => `<div class="logrow ${x.f.flag ? 'flag' : ''}"><div class="row" style="justify-content:space-between"><b>${esc(x.a.user_name || 'Hệ thống')}</b><span class="sm muted">${dmy(x.a.ts)}</span></div><div style="font-size:16px;line-height:1.4">${esc(x.f.text)}</div>${x.f.flag ? '<span class="badge bad" style="align-self:flex-start">Cần chú ý</span>' : ''}</div>`).join('') || '<div class="muted">Chưa có dữ liệu</div>') : '<div class="muted">Đang tải...</div>'}</div>`;
}

/* --- Thống kê --- */
function vStats() {
  const b = S.boot, T = totals();
  const scope = S.statScope;
  const chips = [['all', 'Toàn bãi']].concat(b.khuAct.map((k) => [k.id, k.name]));
  const rows = b.phi.map((p) => {
    const v = scope === 'all' ? T.perPhi[p.id] : valOf(scope, p.id);
    return { p, v };
  }).filter((r) => scope === 'all' || r.v > 0 || isPresent(scope, r.p.id));
  const sumCay = rows.reduce((a, r) => a + r.v, 0), sumKg = rows.reduce((a, r) => a + r.v * r.p.kg_per_cay, 0);
  let usageHtml = '<div class="muted">Đang tải...</div>';
  if (S.usage) {
    const per = {}; let tot = 0;
    S.usage.forEach((d) => { let dayKg = 0; for (const p in d.used) { per[p] = (per[p] || 0) + d.used[p]; const ph = b.phiBy[p]; if (ph) dayKg += d.used[p] * ph.kg_per_cay; } d.kg = dayKg; tot += dayKg; });
    usageHtml = S.usage.length ? `<div class="card" style="padding:0;overflow:hidden">${b.phi.filter((p) => per[p.id]).map((p) => `<div class="li"><b>${p.id}</b><span>${fmtInt(per[p.id])} cây · ${fmtT(per[p.id] * p.kg_per_cay)} tấn</span></div>`).join('')}<div class="li" style="background:#E8EEF6"><b>Tổng dùng</b><b>${fmtT(tot)} tấn</b></div></div>
      <h2 class="sec">Theo ngày</h2><div class="card" style="padding:0;overflow:hidden">${S.usage.map((d) => `<div class="li"><span>${d.day.split('-').reverse().join('/')}</span><b>${fmtT(d.kg)} tấn</b></div>`).join('')}</div>` : '<div class="muted">Chưa có ngày nào được chốt trong khoảng này.</div>';
  }
  return `${head('Thống kê', 'Theo khu hoặc toàn bãi', 'more')}
  <div class="f1 scroll pad col gap12" id="body">
    <h2 class="sec">Tồn hiện tại</h2>
    <div class="wrap">${chips.map((c) => `<button class="chip s ${scope === c[0] ? 'on' : ''}" data-a="sscope" data-v="${esc(c[0])}">${esc(c[1])}</button>`).join('')}</div>
    <div class="card" style="padding:0;overflow:hidden">${rows.map((r) => `<div class="li"><b>${r.p.id}</b><span>${fmtInt(r.v)} cây · ${fmtT(r.v * r.p.kg_per_cay)} tấn</span></div>`).join('')}<div class="li" style="background:#E8EEF6"><b>Cộng</b><b>${fmtInt(sumCay)} cây · ${fmtT(sumKg)} tấn</b></div></div>
    <div class="row" style="justify-content:space-between"><h2 class="sec">Thép đã dùng (toàn bãi)</h2></div>
    <div class="wrap">${[7, 30, 90].map((d) => `<button class="chip s ${S.usageDays === d ? 'on' : ''}" data-a="sdays" data-v="${d}">${d} ngày</button>`).join('')}</div>
    ${usageHtml}
  </div>`;
}

/* --- Thêm --- */
function vMore() {
  const a = isAdmin();
  return `${head('Thêm', esc(S.me.name) + ' · ' + ROLE[S.me.role])}
  <div class="f1 scroll pad col gap8" id="body">
    <button class="menu" data-a="nav" data-s="stats">Thống kê theo khu / toàn bãi</button>
    <button class="menu" data-a="nav" data-s="ton">Tồn bãi theo phi</button>
    <button class="menu" data-a="nav" data-s="lichsu">Xem lại ngày cũ</button>
    ${canIn() ? '<button class="menu" data-a="nav" data-s="baocao">Báo cáo Nhập – Dùng – Tồn theo kỳ</button>' : ''}
    ${a ? `<button class="menu" data-a="nav" data-s="nhatky">Nhật ký hoạt động</button>
    <button class="menu" data-a="nav" data-s="users">Người dùng và PIN</button>
    <button class="menu" data-a="nav" data-s="settings">Cài đặt khu, phi, quy tắc</button>
    <div class="card col gap6"><b>Xuất Excel (CSV) bảng khu × phi</b><div class="row gap6"><input class="inp s f1" type="date" id="exday" max="${S.boot.today}" value="${S.boot.today}"><button class="btn s" data-a="exportday">Tải về</button></div></div>` : ''}
    <button class="menu" data-a="nav" data-s="pin">Đổi PIN của tôi</button>
    <button class="menu" style="color:var(--bad)" data-a="logout">Đăng xuất</button>
    <div class="sm muted" style="text-align:center;padding-top:8px">Kho Thép Bãi · phiên bản 1.2</div>
  </div>`;
}
function vPin() {
  return `${head('Đổi PIN', '', 'more')}<div class="f1 scroll pad col gap12" id="body">
    <label class="field">PIN hiện tại<input id="pin0" type="password" inputmode="numeric" maxlength="4"></label>
    <label class="field">PIN mới<input id="pin1" type="password" inputmode="numeric" maxlength="4"></label>
    <label class="field">Nhập lại PIN mới<input id="pin2" type="password" inputmode="numeric" maxlength="4" data-enter="changepin"></label>
    <div class="err" id="err">${esc(S.err)}</div><button class="btn pri full" data-a="changepin">LƯU PIN MỚI</button></div>`;
}

/* --- Người dùng (admin) --- */
function vUsers() {
  const list = (S.users || []).map((u) => `<div class="card col gap8" style="${u.locked ? 'opacity:.7' : ''}">
    <div class="row" style="justify-content:space-between;gap:8px"><div class="col"><b style="font-size:18px">${esc(u.name)}</b><span class="sm muted">${esc(u.phone)}${u.locked ? ' · ĐÃ KHÓA' : ''}${u.must_change ? ' · chưa đổi PIN' : ''}</span></div>
    <select class="inp s" style="width:130px;font-size:15px" data-change="role" data-id="${u.id}">${Object.keys(ROLE).map((r) => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${ROLE[r]}</option>`).join('')}</select></div>
    <div class="row gap6"><button class="btn s f1" data-a="ureset" data-id="${u.id}">Đặt lại PIN</button><button class="btn s f1 ${u.locked ? '' : 'bad'}" data-a="ulock" data-id="${u.id}" data-v="${u.locked ? 0 : 1}">${u.locked ? 'Mở khóa' : 'Khóa'}</button><button class="btn s f1" data-a="ulogout" data-id="${u.id}">Đăng xuất máy</button></div></div>`).join('');
  return `${head('Người dùng', 'Admin tạo tài khoản và PIN', 'more')}<div class="f1 scroll pad col gap12" id="body">
    ${S.pinShown ? `<div class="card ok col gap8"><b style="font-size:18px">PIN của ${esc(S.pinShown.name)}</b><b style="font-size:40px;letter-spacing:8px">${esc(S.pinShown.pin)}</b><span class="sm">Đưa PIN này cho người dùng (chỉ hiện một lần). Họ sẽ phải đổi PIN khi đăng nhập lần đầu.</span><button class="btn s full" data-a="pinok">Đã ghi lại</button></div>` : ''}
    <div class="card col gap8"><b style="font-size:18px">Thêm người dùng</b>
      <input class="inp s" id="un" placeholder="Họ tên" value="${esc(S.form.un || '')}" data-model="un"><input class="inp s" id="up" type="tel" inputmode="numeric" placeholder="Số điện thoại" value="${esc(S.form.up || '')}" data-model="up">
      <select class="inp s" id="ur" data-model="ur">${Object.keys(ROLE).reverse().map((r) => `<option value="${r}" ${(S.form.ur || 'nguoidem') === r ? 'selected' : ''}>${ROLE[r]}</option>`).join('')}</select>
      <div class="err" id="err">${esc(S.err)}</div><button class="btn pri full" data-a="ucreate">TẠO TÀI KHOẢN</button></div>
    ${list || '<div class="muted">Đang tải...</div>'}</div>`;
}

/* --- Cài đặt (admin) --- */
function vSettings() {
  const b = S.boot;
  const phi = b.phi.map((p) => `<div class="card col gap6"><b style="font-size:18px">${p.id}</b>
    <div class="row gap6"><label class="f1 sm">Cây/bó<input class="inp s" style="width:100%" id="bo-${p.id}" inputmode="numeric" value="${p.bo_size}"></label><label class="f1 sm">Tối thiểu<input class="inp s" style="width:100%" id="mn-${p.id}" inputmode="numeric" value="${p.min_stock}"></label><label class="f1 sm">kg/cây<input class="inp s" style="width:100%" id="kg-${p.id}" inputmode="decimal" value="${String(p.kg_per_cay).replace('.', ',')}"></label></div></div>`).join('');
  const khu = b.khu.map((k) => `<div class="card col gap6" style="${k.active ? '' : 'opacity:.6'}"><div class="row gap6"><b style="width:30px">${esc(k.id)}</b><input class="inp s f1" id="kn-${esc(k.id)}" value="${esc(k.name)}"></div><div class="row gap6"><button class="btn s f1" data-a="ksave" data-k="${esc(k.id)}">Lưu tên</button><button class="btn s f1 ${k.active ? 'bad' : ''}" data-a="khide" data-k="${esc(k.id)}" data-v="${k.active ? 0 : 1}">${k.active ? 'Ẩn khu' : 'Hiện lại'}</button></div></div>`).join('');
  return `${head('Cài đặt', 'Khu, phi và quy tắc', 'more')}<div class="f1 scroll pad col gap12" id="body">
    <h2 class="sec">Quy tắc</h2>
    <div class="card col gap8"><label class="sm">Tự ẩn phi khỏi khu khi đếm bằng 0 liên tiếp (ngày)<input class="inp s" style="width:100%" id="s-zero" inputmode="numeric" value="${b.settings.hide_after_zero_days}"></label>
    <label class="sm">Bắt buộc đếm lại khi "giữ nguyên" quá (ngày)<input class="inp s" style="width:100%" id="s-keep" inputmode="numeric" value="${b.settings.max_keep_streak}"></label>
    <label class="sm">Tự chốt lúc 23:50 nếu ngày bình thường (đủ khu, không bất thường)<select class="inp s" style="width:100%" id="s-auto"><option value="1" ${b.settings.auto_close ? 'selected' : ''}>Bật</option><option value="0" ${b.settings.auto_close ? '' : 'selected'}>Tắt</option></select></label><button class="btn s" data-a="ssave">Lưu quy tắc</button></div>
    <h2 class="sec">Khu bãi</h2>${khu}
    <div class="card col gap6"><b>Thêm khu mới</b><input class="inp s" id="newk" placeholder="Tên khu, ví dụ: Khu I" data-model="newk" value="${esc(S.form.newk || '')}"><button class="btn s pri" data-a="kadd">Thêm khu</button></div>
    <h2 class="sec">Phi thép (D8 - D36)</h2><div class="sm muted">kg/cây gõ được cả dấu phẩy (4,62) hoặc dấu chấm.</div>${phi}
    <button class="btn pri full" data-a="psaveall">LƯU CẤU HÌNH PHI</button></div>`;
}

/* ===================== KHUNG CHÍNH ===================== */
function tabsHtml() {
  const on = { home: 'home', ton: 'home', khu: 'dem', dem: 'dem', nhap: 'nhap', duyet: 'duyet', nhatky: 'more', lichsu: 'more', baocao: 'more', more: 'more', stats: 'more', users: 'more', settings: 'more', pin: 'more' }[S.screen];
  const T = [['home', 'Tổng quan', IC.home, true], ['dem', 'Đếm', IC.count, true], ['nhap', 'Nhập', IC.inn, canIn()], ['duyet', 'Duyệt', IC.shield, isAdmin()], ['more', 'Thêm', IC.more, true]].filter((t) => t[3]);
  return `<nav class="tabs">${T.map((t) => `<button class="tab ${on === t[0] ? 'on' : ''}" data-a="nav" data-s="${t[0]}">${t[2]}${t[1]}</button>`).join('')}</nav>`;
}

function vMain() {
  let body = '';
  switch (S.screen) {
    case 'home': body = vHome(); break;
    case 'khu': body = vKhu(); break;
    case 'dem': body = demView(); break;
    case 'nhap': body = vNhap(); break;
    case 'ton': body = vTon(); break;
    case 'duyet': body = vDuyet(); break;
    case 'nhatky': body = vNhatKy(); break;
    case 'lichsu': body = vLichSu(); break;
    case 'baocao': body = vBaoCao(); break;
    case 'stats': body = vStats(); break;
    case 'more': body = vMore(); break;
    case 'pin': body = vPin(); break;
    case 'users': body = vUsers(); break;
    case 'settings': body = vSettings(); break;
    default: body = vHome();
  }
  const showToast = S.toast && S.screen !== 'dem';
  const noTabs = S.screen === 'dem' && S.sel;
  const staleBar = S.stale ? `<div class="toast err" style="margin-top:calc(8px + env(safe-area-inset-top))">Mất kết nối: đang xem số liệu lưu lúc ${dmy(S.stale)}. Tự cập nhật khi có mạng.</div>` : '';
  const busyBar = S.busy ? '<div class="busy"><span>Đang lưu...</span></div>' : '';
  return `${busyBar}${staleBar}${showToast ? `<div class="toast ${S.toastErr ? 'err' : ''}" style="margin-top:calc(8px + env(safe-area-inset-top))">${esc(S.toast)}</div>` : ''}${body}${noTabs ? '' : tabsHtml()}`;
}

function render() {
  const body = document.getElementById('body');
  const mx = document.getElementById('mx');
  const keep = { screen: S._last, b: body ? body.scrollTop : 0, m: mx ? mx.scrollTop : 0 };
  const act = document.activeElement;
  const focusId = act && act.id && (act.tagName === 'INPUT' || act.tagName === 'SELECT') ? act.id : null;
  let html;
  if (!S.me || S.screen === 'login') html = vLogin();
  else if (S.me.must_change) html = vForcePin();
  else html = vMain();
  $app.innerHTML = html;
  const nb = document.getElementById('body'), nm = document.getElementById('mx');
  if (keep.screen === S.screen) { if (nb) nb.scrollTop = keep.b; if (nm) nm.scrollTop = keep.m; }
  if (S.scrollSel && nm) {
    const idx = S.boot.phi.findIndex((p) => p.id === S.scrollSel);
    nm.scrollTop = Math.max(0, 44 + idx * 44 - 110);
    S.scrollSel = null;
  }
  if (focusId) { const el = document.getElementById(focusId); if (el && el.tagName === 'INPUT') { el.focus(); } }
  S._last = S.screen;
}

/* ===================== HÀNH ĐỘNG ===================== */
const val = (id) => { const e = document.getElementById(id); return e ? e.value : ''; };
function addLine(phi, qty) {
  const l = S.nhap.lines.find((x) => x.phi === phi);
  if (l) l.qty += qty; else S.nhap.lines.push({ phi, qty });
}
// số cây nhập kho gõ trực tiếp: đọc từ ô trước mỗi thao tác
function syncQty() {
  const e = document.getElementById('nqty');
  if (e) S.nhap.qty = Math.min(99999, parseInt(e.value.replace(/\D/g, '') || '0', 10));
}

async function go(screen) {
  S.err = ''; S.sel = null;
  if (screen === 'dem') {
    const ok = (id) => id && S.boot.khuBy[id] && S.boot.khuBy[id].active;
    if (!S.boot.khuAct.length) { say('Chưa có khu nào đang dùng. Admin vào Thêm → Cài đặt để thêm khu.', true); S.screen = 'home'; return render(); }
    let last = null;
    try { last = localStorage.getItem('kt:lastKhu'); } catch (e) { /* bỏ qua */ }
    openDem(ok(S.khu) ? S.khu : ok(last) ? last : S.boot.khuAct[0].id);
  } else S.screen = screen;
  render();
  try {
    if (screen === 'duyet') { S.review = null; render(); S.review = await api('GET', '/review'); }
    else if (screen === 'nhatky') { S.audit = null; render(); S.audit = (await api('GET', '/audit?limit=300')).items; }
    else if (screen === 'users') { S.users = (await api('GET', '/users')).users; }
    else if (screen === 'lichsu') { await loadHist(S.hist.date || ydayOf(S.boot.today)); }
    else if (screen === 'baocao') { if (!S.bc.from) [S.bc.from, S.bc.to] = repRange('month'); await loadRep(); }
    else if (screen === 'stats') { S.usage = null; render(); S.usage = (await api('GET', '/usage?days=' + S.usageDays)).items; }
    else if (['home', 'ton', 'khu', 'nhap', 'settings', 'dem'].includes(screen)) { await loadBoot(); }
  } catch (e) { say(e.message, true); }
  render();
}
// Một thao tác ghi tại một thời điểm: bấm đúp hay mạng chậm cũng không gửi trùng (ví dụ 2 phiếu nhập)
async function act(fn, okMsg) {
  if (S.busy) return;
  S.busy = true; render();
  try { await fn(); if (okMsg) say(okMsg); } catch (e) { say(e.message, true); }
  finally { S.busy = false; }
  render();
}

function pressKey(i) {
  const f = S.field;
  if (i === 11) { S.field = f === 'bo' ? 'le' : 'bo'; }
  else if (i === 9) { S.rep[f] = false; S[f] = S[f].slice(0, -1); }
  else {
    const d = String(i === 10 ? 0 : i + 1);
    if (S.rep[f]) { S[f] = ''; S.rep[f] = false; } // ô đang hiện số cũ: gõ số mới sẽ thay thế
    S[f] = (S[f] === '0' ? d : S[f] + d).slice(0, f === 'bo' ? 3 : 4);
  }
}
function nextPhi(p) {
  const ids = S.boot.phi.map((x) => x.id).filter((id) => isPresent(S.khu, id));
  const i = ids.indexOf(p);
  return i >= 0 && i < ids.length - 1 ? ids[i + 1] : null;
}
function fillSel(p) {
  const c = p ? S.draft.cells[p] : null;
  if (c && c.bo != null && c.le != null && c.kind === 'dem') { S.bo = String(c.bo); S.le = String(c.le); }
  else if (c) { S.bo = ''; S.le = String(c.v); }
  else { S.bo = ''; S.le = ''; }
  S.rep = { bo: S.bo !== '', le: S.le !== '' };
  S.field = 'bo';
}
function settle(kind) {
  const p = S.sel; if (!p) return;
  const size = S.boot.phiBy[p].bo_size;
  const boN = parseInt(S.bo || '0', 10), leN = parseInt(S.le || '0', 10);
  if (kind === 'keep') {
    const why = keepBlock(S.khu, p);
    if (why) return say(why, true);
    S.draft.cells[p] = { v: refOf(S.khu, p), kind: 'giu' };
  } else if (kind === 'zero') S.draft.cells[p] = { v: 0, kind: 'zero', bo: 0, le: 0 };
  else if (S.bo !== '' || S.le !== '') S.draft.cells[p] = { v: boN * size + leN, kind: 'dem', bo: boN, le: leN };
  saveDraft();
  const nx = nextPhi(p);
  S.sel = nx; fillSel(nx); S.scrollSel = nx; S.confirmKeep = false;
}

const ACTIONS = {
  async login() {
    const phone = val('phone'), pin = val('pin');
    S.form.phone = phone;
    if (!phone || pin.length !== 4) { S.err = 'Nhập số điện thoại và PIN 4 số'; return render(); }
    try {
      const r = await api('POST', '/login', { phone, pin });
      try { localStorage.setItem('kt:phone', phone); } catch (e) { /* bỏ qua */ }
      S.me = r.user; S.err = '';
      if (r.user.must_change) { S.screen = 'home'; return render(); }
      await loadBoot(); S.screen = 'home';
      flushPending();
    } catch (e) { S.err = e.message; S.me = null; S.screen = 'login'; }
    render();
  },
  async logout() { try { await api('POST', '/logout', {}); } catch (e) { /* bỏ qua */ } forgetBoot(); S.me = null; S.stale = null; S.boot = null; S.screen = 'login'; S.form = {}; S.err = ''; render(); },
  async changepin() {
    const a = val('pin0'), n1 = val('pin1'), n2 = val('pin2');
    if (n1 !== n2) { S.err = 'Hai lần nhập PIN mới không giống nhau'; return render(); }
    try { await api('POST', '/change-pin', { pin: a, newPin: n1 }); S.err = ''; S.me.must_change = 0; await loadBoot(); S.screen = 'home'; say('Đã đổi PIN.'); }
    catch (e) { S.err = e.message; }
    render();
  },
  nav(d) { go(d.s); },
  khuopen(d) { openDem(d.k); render(); },
  zoom(d) { S.zoomK = S.zoomK === d.k ? null : d.k; render(); },
  cell(d) {
    const p = d.p;
    if (S.boot.closed) return say('Ngày hôm nay đã chốt, không sửa được nữa.', true), render();
    if (!isPresent(S.khu, p)) S.draft.added[p] = true;
    S.sel = p; fillSel(p); S.scrollSel = p; render();
  },
  key(d) { pressKey(Number(d.d)); render(); },
  fld(d) { S.field = d.v; render(); },
  next() { settle('next'); render(); },
  keep() { settle('keep'); render(); },
  zero() { settle('zero'); render(); },
  closesel() {
    const p = S.sel;
    if (p && (S.bo !== '' || S.le !== '')) {
      const size = S.boot.phiBy[p].bo_size, boN = parseInt(S.bo || '0', 10), leN = parseInt(S.le || '0', 10);
      S.draft.cells[p] = { v: boN * size + leN, kind: 'dem', bo: boN, le: leN }; saveDraft();
    }
    S.sel = null; S.bo = ''; S.le = ''; render();
  },
  keepall() {
    const pend = pendingList().filter((p) => !keepBlock(S.khu, p.id));
    if (!pend.length) return;
    if (!S.confirmKeep) { S.confirmKeep = true; return render(); }
    pend.forEach((p) => { S.draft.cells[p.id] = { v: refOf(S.khu, p.id), kind: 'giu' }; });
    S.confirmKeep = false; saveDraft(); render();
  },
  send() { if (S.boot.closed) return; sendCounts(); },
  legend() { S.legend = !S.legend; render(); },
  draftnew() { try { localStorage.removeItem(draftKey()); } catch (e) { /* bỏ qua */ } loadDraft(true); render(); },
  draftkeep() { const r = S.boot.rm[S.khu]; S.draft.baseTs = r ? r.ts : Date.now(); S.draftWarn = null; saveDraft(); render(); },
  pendsend(d) {
    const q = readPending(), j = q[Number(d.i)];
    if (!j) return;
    if (!confirm('Gửi báo cáo này làm số đếm của HÔM NAY? Chỉ chọn khi số liệu vẫn đúng với thực tế hôm nay.')) return;
    q[Number(d.i)] = { khu: j.khu, items: j.items, day: S.boot.today, ts: Date.now() };
    writePending(q); flushPending(); render();
  },
  pendrm(d) {
    const q = readPending();
    if (!q[Number(d.i)] || !confirm('Bỏ báo cáo này? Số liệu trong báo cáo sẽ mất.')) return;
    q.splice(Number(d.i), 1); writePending(q); render();
  },

  nmode(d) { syncQty(); S.nhap.mode = d.v; S.nhap.done = null; render(); },
  nphi(d) { syncQty(); S.nhap.phi = d.v; S.nhap.done = null; render(); },
  nkhu(d) { syncQty(); S.nhap[d.f || 'khu'] = d.v; S.nhap.done = null; render(); },
  nq(d) {
    const N = S.nhap, v = d.v;
    syncQty();
    if (v === 'bo') N.qty += S.boot.phiBy[N.phi].bo_size; else N.qty = Math.max(0, N.qty + Number(v));
    N.done = null; render();
  },
  nadd() {
    const N = S.nhap;
    syncQty();
    if (N.qty <= 0) return say('Nhập số cây của ' + N.phi + ' trước khi thêm phi khác.', true), render();
    addLine(N.phi, N.qty); N.qty = 0; N.done = null;
    render();
  },
  nrm(d) { S.nhap.lines.splice(Number(d.i), 1); render(); },
  nconfirm() {
    const N = S.nhap, b = S.boot;
    syncQty();
    if (N.qty > 0) { addLine(N.phi, N.qty); N.qty = 0; } // số đang gõ dở cũng được tính vào phiếu
    if (!N.lines.length) return say('Nhập số cây lớn hơn 0.', true), render();
    const chuyen = N.mode === 'chuyen';
    if (chuyen && (!N.to || N.from === N.to)) return say('Chọn khu đi và khu đến khác nhau.', true), render();
    const note = val('nnote').trim();
    const kg = N.lines.reduce((a, l) => a + l.qty * b.phiBy[l.phi].kg_per_cay, 0);
    const where = chuyen ? `từ ${kName(N.from)} sang ${kName(N.to)}` : `vào ${kName(N.khu)}`;
    const list = N.lines.map((l) => `  ${l.phi}: ${fmtInt(l.qty)} cây`).join('\n');
    render();
    if (!confirm(`${chuyen ? 'Chuyển khu' : 'Nhập kho'} ${where}:\n${list}\nTổng ${fmtT(kg)} tấn\n\nĐúng chưa?`)) return;
    const lines = N.lines.slice();
    act(async () => {
      const r = chuyen
        ? await api('POST', '/transfers', { from: N.from, to: N.to, lines, note })
        : await api('POST', '/receipts', { khu: N.khu, lines, note });
      N.lines = []; S.form.nnote = '';
      N.done = { id: r.id, text: `${lines.map((l) => l.phi + ' ' + fmtInt(l.qty)).join(' · ')} cây · ${fmtT(kg)} tấn · ${where}` };
      await loadBoot();
    });
  },
  void(d) { if (!confirm('Hủy cả phiếu này?')) return; act(async () => { await api('DELETE', '/receipts/' + d.id); S.nhap.done = null; await loadBoot(); }, 'Đã hủy phiếu.'); },
  expand(d) { S.expand[d.p] = !S.expand[d.p]; render(); },

  'toggle-normal'() { S.showNormal = !S.showNormal; render(); },
  resolve(d) { act(async () => { await api('POST', '/conflict/resolve', { khu: d.k }); S.cmp = null; S.review = await api('GET', '/review'); await loadBoot(); }, 'Đã giữ số báo sau.'); },
  async cview(d) {
    S.cmp = { khu: d.k, data: null, pick: {} }; render();
    try { const r = await api('GET', '/conflict?khu=' + encodeURIComponent(d.k)); if (S.cmp && S.cmp.khu === d.k) S.cmp.data = r; }
    catch (e) { S.cmp = null; say(e.message, true); }
    render();
  },
  cpick(d) { if (S.cmp) { S.cmp.pick[d.p] = d.v; render(); } },
  cresolve(d) {
    const C = S.cmp; if (!C || !C.data) return;
    const pick = {};
    C.data.diffs.forEach((x) => { const v = C.pick[x.phi] === 'a' ? x.a : x.b; if (v != null) pick[x.phi] = v; });
    act(async () => { const r = await api('POST', '/conflict/resolve', { khu: d.k, pick }); S.cmp = null; S.review = await api('GET', '/review'); await loadBoot(); say('Đã lưu lựa chọn' + (r.changed ? ' (' + r.changed + ' phi đổi số).' : '.')); });
  },
  recount(d) { act(async () => { await api('POST', '/recount', { khu: d.k }); S.review = await api('GET', '/review'); await loadBoot(); }, 'Đã yêu cầu đếm lại.'); },
  close() {
    const R = S.review; if (!R || R.closed) return;
    const note = val('note'); S.form.note = note;
    if (R.exceptions.length && !note.trim()) return say('Còn việc bất thường, hãy ghi chú lý do trước khi chốt.', true), render();
    if (!confirm('Chốt ngày? Sau khi chốt sẽ khóa số liệu hôm nay.')) return;
    act(async () => { await api('POST', '/close', { note }); S.form.note = ''; S.review = await api('GET', '/review'); await loadBoot(); }, 'Đã chốt ngày. Số đếm hôm nay là tồn chuẩn mới.');
  },
  reopen() {
    const note = val('reopenNote').trim();
    if (!note) return say('Ghi lý do mở lại ngày vào ô phía trên.', true), render();
    if (!confirm('Mở lại ngày hôm nay? Số đếm sẽ được sửa được và cần chốt lại.')) return;
    act(async () => { await api('POST', '/reopen', { note }); S.form.reopenNote = ''; S.review = await api('GET', '/review'); await loadBoot(); }, 'Đã mở lại ngày. Có thể sửa số và chốt lại.');
  },
  hprev() { loadHist(ydayOf(S.hist.date)); },
  hnext() { const n = new Date(Date.parse(S.hist.date) + 864e5).toISOString().slice(0, 10); if (n <= S.boot.today) loadHist(n); },
  rquick(d) { [S.bc.from, S.bc.to] = repRange(d.v); loadRep(); },
  rload() { const a = val('rfrom'), z = val('rto'); if (!a || !z || a > z) return say('Chọn khoảng ngày hợp lệ.', true), render(); S.bc.from = a; S.bc.to = z; loadRep(); },
  rcsv() { const a = val('rfrom') || S.bc.from, z = val('rto') || S.bc.to; location.href = `/api/report?format=csv&from=${a}&to=${z}`; },
  exportday() { location.href = '/api/export?date=' + (val('exday') || S.boot.today); },
  logf(d) { S.logFilter = d.v; render(); },
  sscope(d) { S.statScope = d.v; render(); },
  sdays(d) { S.usageDays = Number(d.v); go('stats'); },

  ucreate() {
    const name = val('un'), phone = val('up'), role = val('ur');
    S.form.un = name; S.form.up = phone; S.form.ur = role;
    act(async () => {
      try { const r = await api('POST', '/users', { name, phone, role }); S.pinShown = { name, pin: r.pin }; S.form.un = ''; S.form.up = ''; S.err = ''; S.users = (await api('GET', '/users')).users; }
      catch (e) { S.err = e.message; }
    });
  },
  pinok() { S.pinShown = null; render(); },
  ureset(d) { const u = S.users.find((x) => x.id === Number(d.id)); if (!confirm('Đặt lại PIN cho ' + u.name + '? Họ sẽ bị đăng xuất khỏi mọi máy.')) return; act(async () => { const r = await api('POST', `/users/${d.id}/reset-pin`, {}); S.pinShown = { name: u.name, pin: r.pin }; S.users = (await api('GET', '/users')).users; }); },
  ulock(d) { act(async () => { await api('POST', `/users/${d.id}/lock`, { locked: d.v === '1' }); S.users = (await api('GET', '/users')).users; }); },
  ulogout(d) { act(async () => { await api('POST', `/users/${d.id}/logout`, {}); }, 'Đã đăng xuất người dùng khỏi mọi máy.'); },

  psaveall() {
    const items = S.boot.phi.map((p) => ({ id: p.id, bo_size: val('bo-' + p.id), min_stock: val('mn-' + p.id), kg_per_cay: val('kg-' + p.id).replace(',', '.') }));
    act(async () => { const r = await api('PUT', '/phi', { items }); await loadBoot(); say(r.n ? 'Đã lưu ' + r.n + ' phi.' : 'Không có thay đổi.'); });
  },
  ksave(d) { act(async () => { await api('PATCH', '/khu/' + d.k, { name: val('kn-' + d.k) }); await loadBoot(); }, 'Đã lưu tên khu.'); },
  khide(d) { if (d.v !== '1' && !confirm('Ẩn khu này? Khu ẩn sẽ không còn trong danh sách đếm.')) return; act(async () => { await api('PATCH', '/khu/' + d.k, { active: d.v === '1' }); await loadBoot(); }, d.v === '1' ? 'Đã hiện lại khu.' : 'Đã ẩn khu.'); },
  kadd() { const name = val('newk'); act(async () => { await api('POST', '/khu', { name }); S.form.newk = ''; await loadBoot(); }, 'Đã thêm khu.'); },
  ssave() { act(async () => { await api('PUT', '/settings', { hide_after_zero_days: val('s-zero'), max_keep_streak: val('s-keep'), auto_close: val('s-auto') }); await loadBoot(); }, 'Đã lưu quy tắc.'); },
};

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-a]');
  if (!t || !ACTIONS[t.dataset.a]) return;
  ACTIONS[t.dataset.a](t.dataset, e);
});
document.addEventListener('input', (e) => {
  const m = e.target.dataset && e.target.dataset.model;
  if (m) S.form[m] = e.target.value;
  if (e.target.id === 'nqty' && S.boot) { // cập nhật số kg ngay, không vẽ lại cả màn hình khi đang gõ
    syncQty(); S.nhap.done = null;
    const k = document.getElementById('nkg'), p = S.boot.phiBy[S.nhap.phi];
    if (k && p) k.textContent = nkgText(S.nhap.qty, p);
  }
});
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset && t.dataset.change === 'hdate') { if (t.value) loadHist(t.value > S.boot.today ? S.boot.today : t.value); return; }
  if (t.dataset && t.dataset.change === 'role') {
    const u = (S.users || []).find((x) => x.id === Number(t.dataset.id));
    if (!confirm(`Đổi vai trò ${u ? u.name : ''} thành ${ROLE[t.value]}?`)) return render();
    act(async () => { await api('POST', `/users/${t.dataset.id}/role`, { role: t.value }); S.users = (await api('GET', '/users')).users; }, 'Đã đổi vai trò.');
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.dataset && e.target.dataset.enter) { e.preventDefault(); ACTIONS[e.target.dataset.enter](); }
});

/* ===================== KHỞI ĐỘNG ===================== */
/* Làm mới thích ứng để tiết kiệm hạn mức miễn phí:
   - đang thao tác: hỏi phiên bản mỗi 60 giây; để yên quá 5 phút: mỗi 5 phút
   - ngoài giờ làm (20:00 - 6:00): mỗi 15 phút; app chạy nền: không hỏi */
let lastAct = Date.now(), lastPoll = 0;
['click', 'keydown', 'touchstart'].forEach((ev) => document.addEventListener(ev, () => { lastAct = Date.now(); }, { passive: true }));
function pollEvery() {
  const h = new Date().getHours();
  if (h < 6 || h >= 20) return 15 * 60e3;
  return Date.now() - lastAct > 5 * 60e3 ? 5 * 60e3 : 60e3;
}
async function refresh() {
  if (!S.me || document.hidden || S.me.must_change) return;
  lastPoll = Date.now();
  try {
    // chỉ hỏi số phiên bản (rất nhẹ), có thay đổi hoặc sang ngày mới mới tải lại toàn bộ
    const r = await api('GET', '/rev');
    if (readPending().some((j) => !j.err)) flushPending();
    if (S.boot && r.today !== S.boot.today && S.screen === 'dem') {
      // nháp đang đếm thuộc ngày cũ: không để lẫn sang ngày mới
      S.screen = 'home'; S.sel = null;
      say('Đã sang ngày mới, hãy mở lại màn Đếm để đếm cho hôm nay.', true);
    }
    const changed = !S.boot || S.stale || r.rev !== S.boot.rev || r.today !== S.boot.today;
    // đang nhập số ở màn Đếm thì không vẽ lại giữa chừng (trừ khi sang ngày mới)
    const busy = S.screen === 'dem' && S.sel && S.boot && r.today === S.boot.today;
    if (changed && !busy && ['home', 'ton', 'khu', 'nhap', 'dem', 'stats'].includes(S.screen)) { await loadBoot(); render(); }
  } catch (e) { /* bỏ qua lỗi mạng khi làm mới ngầm */ }
}
function tick() {
  if (Date.now() - lastPoll >= pollEvery()) refresh();
  setTimeout(tick, 15000);
}
// xóa nháp đếm của các ngày trước để localStorage không phình mãi
function cleanDrafts(today) {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const m = /^kt:(\d{4}-\d{2}-\d{2}):/.exec(localStorage.key(i) || '');
      if (m && m[1] < today) localStorage.removeItem(localStorage.key(i));
    }
  } catch (e) { /* bỏ qua */ }
}
async function start() {
  render();
  try {
    const r = await api('GET', '/me');
    S.me = r.user;
    if (!r.user.must_change) { await loadBoot(); cleanDrafts(S.boot.today); flushPending(); }
    S.screen = 'home';
  } catch (e) {
    if (e.retry && useCachedBoot()) S.screen = 'home';
    else { S.me = null; S.screen = 'login'; S.err = e.retry ? e.message : ''; }
  }
  render();
  lastPoll = Date.now();
  setTimeout(tick, 15000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - lastPoll > 30e3) refresh(); });
  window.addEventListener('online', () => { refresh(); flushPending(); });
}
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
start();
