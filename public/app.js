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
  nhap: { phi: null, qty: 50, khu: null, done: null }, scrollSel: null,
};

/* ===================== API ===================== */
async function api(method, path, body) {
  let r;
  try {
    r = await fetch('/api' + path, {
      method, credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) { const er = new Error('Không có kết nối mạng'); er.net = true; throw er; }
  let d = {};
  try { d = await r.json(); } catch (e) { /* không phải JSON */ }
  if (!r.ok) {
    const er = new Error(d.error || 'Lỗi ' + r.status);
    er.status = r.status;
    if (r.status === 401 && S.me) { S.me = null; S.screen = 'login'; S.err = 'Phiên đăng nhập đã hết hạn, hãy đăng nhập lại'; render(); }
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
}
async function loadBoot() {
  const b = await api('GET', '/bootstrap');
  indexBoot(b);
  S.boot = b; S.me = b.user;
}
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
  for (const k of b.khuAct) {
    for (const p of b.phi) {
      const v = valOf(k.id, p.id);
      T.perPhi[p.id] += v; T.perKhu[k.id].cay += v; T.perKhu[k.id].kg += v * p.kg_per_cay;
      T.cay += v; T.kg += v * p.kg_per_cay;
    }
  }
  const inn = {};
  b.receipts.forEach((r) => { inn[r.phi_id] = (inn[r.phi_id] || 0) + r.qty; T.inKg += r.qty * b.phiBy[r.phi_id].kg_per_cay; });
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
function loadDraft() {
  let d = null;
  try { d = JSON.parse(localStorage.getItem(draftKey()) || 'null'); } catch (e) { d = null; }
  if (!d || !d.cells) {
    d = { cells: {}, added: {} };
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

function queuePending(job) {
  let q = [];
  try { q = JSON.parse(localStorage.getItem('kt:pending') || '[]'); } catch (e) { q = []; }
  q = q.filter((x) => x.khu !== job.khu).concat([job]);
  localStorage.setItem('kt:pending', JSON.stringify(q));
}
async function flushPending() {
  let q = [];
  try { q = JSON.parse(localStorage.getItem('kt:pending') || '[]'); } catch (e) { q = []; }
  if (!q.length || !S.me) return;
  const rest = [];
  for (const job of q) {
    try { await api('PUT', '/counts', job); }
    catch (e) { if (e.net) rest.push(job); }
  }
  localStorage.setItem('kt:pending', JSON.stringify(rest));
  if (rest.length < q.length) { await loadBoot(); say('Đã tự gửi lại báo cáo lưu khi mất mạng.'); render(); }
}
async function sendCounts() {
  const list = myPhiList();
  if (pendingList().length) return;
  const items = list.map((p) => { const c = S.draft.cells[p.id]; return { phi: p.id, v: c.v, kind: c.kind, bo: c.bo, le: c.le }; });
  const khuName = S.boot.khuBy[S.khu].name;
  try {
    const r = await api('PUT', '/counts', { khu: S.khu, items });
    try { localStorage.removeItem(draftKey()); } catch (e) { /* bỏ qua */ }
    await loadBoot();
    S.sel = null; S.screen = 'home';
    say('Đã gửi báo cáo ' + khuName + (r.conflict ? '. Số khác với người báo trước, admin sẽ xem.' : '. Cảm ơn bạn!'));
  } catch (e) {
    if (e.net) { queuePending({ khu: S.khu, items }); say('Mất mạng: đã lưu báo cáo, sẽ tự gửi khi có mạng.', true); }
    else say(e.message, true);
  }
  render();
}

/* ===================== MÀN HÌNH ===================== */
function head(title, sub, back) {
  return `<div class="top">${back ? `<button class="iconbtn" aria-label="Quay lại" data-a="nav" data-s="${back}">${IC.back}</button>` : ''}<div class="t"><h1>${title}</h1>${sub ? `<small>${sub}</small>` : ''}</div></div>`;
}

function vLogin() {
  return `<div class="login f1 scroll">
    <div class="col gap8"><div class="logo"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg></div>
      <div style="font-size:30px;font-weight:700;line-height:1.2">Kho Thép Bãi</div>
      <div class="muted" style="font-size:18px">Đăng nhập bằng số điện thoại và PIN 4 số</div></div>
    <label class="field">Số điện thoại<input id="phone" type="tel" inputmode="numeric" autocomplete="username" data-enter="login" value="${esc(S.form.phone || '')}"></label>
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
  const note = miss.length ? `Tạm tính: ${miss.length} khu chưa báo${b.lastClosed ? ' nên lấy số hôm qua' : ''}` : 'Đủ ' + b.khuAct.length + '/' + b.khuAct.length + ' khu đã báo hôm nay';
  return `<div class="f1 scroll" id="body">
    <div class="hero">
      <div class="row" style="justify-content:space-between"><span>Tổng quan · ${esc(b.today.split('-').reverse().join('/'))}</span><span class="badge" style="background:#fff;color:var(--pri)">${ROLE[S.me.role]}</span></div>
      <div class="row" style="justify-content:space-between;align-items:flex-end"><div class="col"><span style="font-size:15px">Tồn toàn bãi</span><span class="big">${fmtT(T.kg)} tấn</span></div><span style="font-size:17px;padding-bottom:6px">${fmtInt(T.cay)} cây</span></div>
      <div class="sm" style="color:#D6E0EE">${note}</div>
      <div class="mini"><div><span>Nhập hôm nay</span><b>${fmtT(T.inKg)} tấn</b></div><div><span>Đã dùng hôm nay</span><b>${T.usedKg === null ? '—' : fmtT(T.usedKg) + ' tấn'}</b></div></div>
    </div>
    ${b.closed ? '<div class="toast" style="margin-top:12px">Ngày hôm nay đã được admin chốt.</div>' : ''}
    <div class="pad col gap12">
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
    const ref = refOf(k, p.id);
    const delta = (v) => { if (ref === undefined) return null; const d = v - ref; return { big: ref >= 10 && Math.abs(d) / ref > 0.5, t: d === 0 ? 'không đổi' : d > 0 ? '+' + d : '−' + Math.abs(d) }; };
    let cls, txt, sub = '';
    if (!present) { cls = 'abs'; txt = '·'; }
    else if (isSel) { cls = 'sel'; txt = hasIn ? String(curV(p.id)) : '__'; const dl = hasIn ? delta(curV(p.id)) : null; sub = dl ? dl.t : ''; if (dl && dl.big) cls += ' big'; }
    else if (cell) {
      if (cell.kind === 'giu') { cls = 'giu'; txt = '=' + cell.v; sub = 'giữ nguyên'; }
      else { const dl = delta(cell.v); cls = dl && dl.big ? 'big' : 'okc'; txt = String(cell.v); sub = dl ? dl.t : ''; }
    } else { cls = 'pend'; txt = ref === undefined ? '?' : String(ref); sub = 'hôm qua'; }
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

  const keepable = pend.filter((p) => refOf(k, p.id) !== undefined && !((b.kp[k + '|' + p.id] || {}).keep_streak >= b.settings.max_keep_streak));
  const keepTxt = pend.length === 0 ? 'Đã xử lý hết phi của khu' : S.confirmKeep ? `Bấm lần nữa để giữ nguyên ${keepable.length} phi` : `Giữ nguyên ${keepable.length} phi còn lại`;
  const canSend = pend.length === 0 && list.length > 0;
  const absent = b.phi.filter((p) => !isPresent(k, p.id)).map((p) => p.id);

  let sheet = '';
  if (S.sel) {
    const p = S.sel, ref = refOf(k, p);
    const streakOk = !((b.kp[k + '|' + p] || {}).keep_streak >= b.settings.max_keep_streak) && ref !== undefined;
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Xóa', '0', S.field === 'bo' ? 'Lẻ ›' : '‹ Bó'];
    sheet = `<div class="pad-sheet">
      <div class="row" style="justify-content:space-between;gap:8px"><div class="col"><b style="font-size:16px">${esc(kname)} · ${p}${hasIn ? '  = ' + fmtInt(curV(p)) + ' cây · ' + fmtT(curV(p) * b.phiBy[p].kg_per_cay) + ' tấn' : ''}</b><span class="sm muted">Hôm qua: ${ref === undefined ? 'chưa có' : ref + ' cây'} · 1 bó = ${size(p)} cây</span></div><button class="btn s" style="height:40px" data-a="closesel">Đóng</button></div>
      <div class="row gap6"><button class="boxn ${S.field === 'bo' ? 'on' : ''}" data-a="fld" data-v="bo"><span>Số bó</span><b>${S.bo || '0'}</b></button><span class="sm b" style="white-space:nowrap">× ${size(p)} +</span><button class="boxn ${S.field === 'le' ? 'on' : ''}" data-a="fld" data-v="le"><span>Cây lẻ</span><b>${S.le || '0'}</b></button></div>
      <div class="keys">${keys.map((d, i) => `<button class="key ${d.length > 1 ? 'fn' : ''}" data-a="key" data-d="${i}">${d}</button>`).join('')}</div>
      <div class="acts"><button class="btn ${streakOk ? '' : 'dis'}" data-a="keep">Giữ nguyên</button><button class="btn bad" data-a="zero">Hết (0)</button><button class="btn pri" data-a="next">TIẾP</button></div>
    </div>`;
  }
  const pendingNote = (() => { try { return JSON.parse(localStorage.getItem('kt:pending') || '[]').length; } catch (e) { return 0; } })();

  return `<div class="top" style="padding-bottom:2px"><button class="iconbtn" aria-label="Về tổng quan" data-a="nav" data-s="home">${IC.back}</button><div class="t"><h1>Đếm ${esc(kname)}</h1><small>Bảng toàn bãi, nhập ngay trong bảng</small></div><button class="btn s" data-a="nav" data-s="khu">Đổi khu</button></div>
    <div class="mxhead"><div><span>${esc(kname)} (bạn)</span><b>${fmtT(T.ownKg)} tấn</b></div><div style="text-align:center"><span>Phi chưa nhập</span><b>${pend.length}</b></div><div style="text-align:right"><span>Tổng bãi (tạm tính)</span><b>${fmtT(T.allKg)} tấn</b></div></div>
    ${S.toast ? `<div class="toast ${S.toastErr ? 'err' : ''}">${esc(S.toast)}</div>` : ''}
    ${b.closed ? '<div class="toast err">Ngày hôm nay đã chốt, không sửa được nữa.</div>' : ''}
    ${S.sel ? '' : `<div class="col gap6" style="padding:6px 12px 2px"><button class="btn s full ${pend.length === 0 || !keepable.length ? 'dis' : ''}" data-a="keepall">${keepTxt}</button>
      <div class="sm muted" style="line-height:1.4">Xanh lá: đã đếm · Dấu =: giữ nguyên · Nét đứt vàng: chưa nhập · Vàng đậm: lệch lớn so với hôm qua · Chấm: không có (chạm để thêm phi). Chạm chữ cái khu để phóng to.</div>
      ${absent.length ? `<div class="sm b">Không có: ${absent.join(', ')} (${absent.length} phi)</div>` : ''}</div>`}
    <div class="f1" id="mx"><div class="mxw">
      <div class="mxl"><div class="mxh"><div style="width:40px;padding-left:4px;font-size:13px;font-weight:700">Phi</div><div style="width:72px;text-align:center;font-size:14px;font-weight:700;color:var(--pri);line-height:1.1">${esc(kname)}<br>(bạn)</div><div style="width:52px;text-align:right;padding-right:6px;font-size:13px;font-weight:700">Tổng bãi</div></div>${lrows.join('')}<div class="mxtot"><div style="width:40px;padding-left:4px;font-size:13px;font-weight:700">Cộng</div><div style="width:72px;text-align:center;font-weight:700;color:var(--pri)">${fmtInt(colTot[k])}</div><div style="width:52px;text-align:right;padding-right:6px;font-weight:700">${fmtInt(T.all)}</div></div></div>
      <div class="mxr"><div class="mxh">${hdrs}</div>${rrows.join('')}<div class="mxtot">${tots}</div></div>
    </div></div>
    ${S.sel ? sheet : `<div class="sendbar">${pendingNote ? '<div class="sm b" style="color:var(--bad);margin-bottom:6px">Có báo cáo chờ gửi (mất mạng), sẽ tự gửi khi có mạng.</div>' : ''}<button class="btn full ${canSend && !b.closed ? 'pri' : 'dis'}" data-a="send">${canSend ? 'GỬI BÁO CÁO ' + esc(kname.toUpperCase()) : 'Còn ' + pend.length + ' phi chưa nhập'}</button></div>`}`;
}

/* --- Nhập kho --- */
function vNhap() {
  const b = S.boot, N = S.nhap;
  if (!N.phi) N.phi = b.phi[4] ? b.phi[4].id : b.phi[0].id;
  if (!N.khu) N.khu = S.khu || b.khuAct[0].id;
  const p = b.phiBy[N.phi];
  const recs = b.receipts.map((r) => {
    const can = isAdmin() || (r.user_id === S.me.id && Date.now() - r.ts < 10 * 60e3);
    return `<div class="li"><span><b>${esc(r.phi_id)}</b> · ${fmtInt(r.qty)} cây · ${esc(b.khuBy[r.khu_id] ? b.khuBy[r.khu_id].name : r.khu_id)}<br><span class="sm muted">${esc(r.uname)} · ${hhmm(r.ts)}</span></span>${can ? `<button class="btn s bad" data-a="void" data-id="${r.id}">Hủy</button>` : ''}</div>`;
  }).join('');
  return `${head('Nhập kho', 'Ghi phiếu thép mới về', 'home')}
  <div class="f1 scroll pad col gap12" id="body">
    ${N.done ? `<div class="card ok col gap8"><b style="font-size:18px">Đã lưu phiếu nhập</b><span style="font-size:17px">${esc(N.done.text)}</span><button class="btn s full" data-a="void" data-id="${N.done.id}">HOÀN TÁC</button></div>` : ''}
    <div class="col gap8"><b style="font-size:18px">1. Chọn phi</b><div class="grid4">${b.phi.map((x) => `<button class="chip ${x.id === N.phi ? 'on' : ''}" data-a="nphi" data-v="${x.id}">${x.id}</button>`).join('')}</div></div>
    <div class="col gap8"><b style="font-size:18px">2. Số cây</b>
      <div class="row gap6"><button class="btn s" data-a="nq" data-v="-10">−10</button><button class="btn s" data-a="nq" data-v="-1">−1</button><div class="f1" style="height:60px;border-radius:14px;border:2px solid #8C8678;background:#fff;display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:700">${N.qty}</div><button class="btn s pri" data-a="nq" data-v="1">+1</button><button class="btn s pri" data-a="nq" data-v="10">+10</button></div>
      <span class="muted">= ${fmtInt(N.qty * p.kg_per_cay)} kg (${fmtT(N.qty * p.kg_per_cay)} tấn) · 1 bó = ${p.bo_size} cây</span>
      <div class="row gap6"><button class="btn s" data-a="nq" data-v="bo">+1 bó (${p.bo_size})</button><button class="btn s" data-a="nq" data-v="0">Về 0</button></div></div>
    <div class="col gap8"><b style="font-size:18px">3. Để vào khu</b><div class="grid4">${b.khuAct.map((k) => `<button class="chip ${k.id === N.khu ? 'on' : ''}" data-a="nkhu" data-v="${esc(k.id)}">${esc(k.id)}</button>`).join('')}</div></div>
    <button class="btn pri full" style="height:60px;font-size:20px" data-a="nconfirm">XÁC NHẬN NHẬP KHO</button>
    ${recs ? `<h2 class="sec">Phiếu nhập hôm nay</h2><div class="card" style="padding:0;overflow:hidden">${recs}</div>` : ''}
  </div>`;
}

/* --- Tồn bãi --- */
function vTon() {
  const b = S.boot, T = totals();
  const rows = b.phi.map((p) => {
    const v = T.perPhi[p.id], low = v < p.min_stock, open = S.expand[p.id];
    const det = open ? `<div class="card" style="margin:-4px 0 4px;border-radius:0 0 16px 16px">${b.khuAct.map((k) => { const x = valOf(k.id, p.id); return x ? `<div class="li"><span>${esc(k.name)}</span><b>${fmtInt(x)} cây · ${fmtT(x * p.kg_per_cay)} tấn</b></div>` : ''; }).join('') || '<div class="muted">Không có ở khu nào</div>'}</div>` : '';
    return `<button class="tonrow ${low ? 'low' : ''}" data-a="expand" data-p="${p.id}"><span class="col" style="gap:2px"><b style="font-size:24px">${p.id}</b><span class="sm" style="${low ? 'color:var(--bad);font-weight:700' : 'color:#5F6670'}">${low ? 'Dưới mức tối thiểu (' + p.min_stock + ')' : 'Đủ dùng'}</span></span><span class="col" style="align-items:flex-end"><b style="font-size:30px;line-height:1.1">${fmtInt(v)}</b><span class="sm muted">cây · ${fmtT(v * p.kg_per_cay)} tấn</span></span></button>${det}`;
  }).join('');
  return `${head('Tồn bãi', b.lastClosed ? 'Tồn chuẩn chốt ngày ' + b.lastClosed.split('-').reverse().join('/') : 'Chưa có ngày nào được chốt', 'home')}
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
    if (e.type === 'conflict') { const r = R.reports.find((x) => x.khu_id === e.khu); return `<div class="card warn col gap8"><b style="font-size:18px">${esc(e.name)}: 2 người báo số khác nhau</b><span class="sm">Số đang dùng là của ${esc(r ? r.uname : '')} (báo sau).</span><div class="row gap8"><button class="btn s warnb f1" data-a="resolve" data-k="${esc(e.khu)}">DÙNG SỐ BÁO SAU</button><button class="btn s warnb f1" data-a="recount" data-k="${esc(e.khu)}">ĐẾM LẠI</button></div></div>`; }
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
  const first = !R.last ? `<div class="card col" style="gap:4px"><b>Ngày đầu tiên</b><span class="sm muted">Chưa có tồn chuẩn cũ. Chốt ngày này để số đếm hôm nay trở thành tồn chuẩn đầu tiên.</span></div>` : '';
  const normalHtml = S.showNormal ? `<div class="card" style="padding:0;overflow:hidden">${normal.map((r) => `<div class="li"><b>${r.phi}</b><span class="sm">${R.last ? r.old + ' + ' + r.inn + ' − ' + r.cnt + ' = ' + r.used : 'đếm ' + r.cnt + ' cây'}</span></div>`).join('')}</div>` : '';
  return `${head('Duyệt ngày ' + b.today.split('-').reverse().slice(0, 2).join('/'), 'Chỉ hiện những gì cần xem', 'home')}
  <div class="f1 scroll pad col gap12" id="body">
    ${R.closed ? '<div class="card ok"><b>Đã chốt ngày hôm nay.</b> Số đếm hôm nay là tồn chuẩn mới, ngày này đã khóa.</div>' : verdict}
    ${first}${items}${cards}
    <button class="card b" style="text-align:left;min-height:52px;font-size:16px;border:2px solid #B9B4A8" data-a="toggle-normal">${normal.length} phi bình thường · ${S.showNormal ? 'bấm để ẩn' : 'bấm để xem'}</button>${normalHtml}
    <label class="col gap6" style="font-weight:600">Ghi chú lý do ${allOk ? '(không bắt buộc)' : '(bắt buộc khi còn việc bất thường)'}<input class="inp s" style="height:52px" id="note" data-model="note" placeholder="Ví dụ: nhập sót phiếu D16" value="${esc(S.form.note || '')}"></label>
  </div>
  <div class="sendbar"><button class="btn ${R.closed ? 'dis' : 'ok'} full" style="height:60px;font-size:20px" data-a="close">${allOk ? 'XÁC NHẬN CHỐT NGÀY' : 'DUYỆT & CHỐT NGÀY'}</button></div>`;
}

/* --- Nhật ký (admin) --- */
function fmtAudit(a) {
  let d = {};
  try { d = a.detail ? JSON.parse(a.detail) : {}; } catch (e) { d = {}; }
  const kn = (id) => (S.boot.khuBy[id] ? S.boot.khuBy[id].name : id);
  const M = {
    login: ['đăng nhập', 'login'], login_fail: ['nhập sai PIN (lần ' + d.n + ')', 'flag'], login_locked: ['bị khóa 15 phút do nhập sai PIN nhiều lần', 'flag'],
    change_pin: ['đổi PIN', 'login'], setup: ['thiết lập hệ thống', 'admin'],
    receipt: ['nhập kho ' + d.phi + ': ' + d.qty + ' cây vào ' + kn(d.khu), 'nhap'], receipt_void: ['hủy phiếu nhập ' + d.phi + ' ' + d.qty + ' cây', 'nhap'],
    close_day: ['chốt ngày ' + d.day + (d.note ? ' (' + d.note + ')' : ''), 'admin'], recount: ['yêu cầu ' + kn(d.khu) + ' đếm lại', 'admin'], conflict_resolve: ['chọn số báo sau cho ' + kn(d.khu), 'admin'],
    user_create: ['tạo tài khoản ' + d.name, 'admin'], user_reset_pin: ['đặt lại PIN cho ' + d.name, 'admin'], user_lock: ['khóa ' + d.name, 'admin'], user_unlock: ['mở khóa ' + d.name, 'admin'],
    user_role: ['đổi vai trò ' + d.name + ' thành ' + (ROLE[d.role] || d.role), 'admin'], user_logout: ['đăng xuất mọi máy của ' + d.name, 'admin'],
    khu_create: ['thêm ' + d.name, 'admin'], khu_update: ['sửa ' + d.name + (d.active ? '' : ' (ẩn)'), 'admin'], phi_update: ['sửa cấu hình ' + d.id, 'admin'], settings_update: ['sửa cài đặt', 'admin'],
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
    ${a ? `<button class="menu" data-a="nav" data-s="nhatky">Nhật ký hoạt động</button>
    <button class="menu" data-a="nav" data-s="users">Người dùng và PIN</button>
    <button class="menu" data-a="nav" data-s="settings">Cài đặt khu, phi, quy tắc</button>
    <a class="menu" href="/api/export" download>Xuất Excel (CSV) bảng khu × phi</a>` : ''}
    <button class="menu" data-a="nav" data-s="pin">Đổi PIN của tôi</button>
    <button class="menu" style="color:var(--bad)" data-a="logout">Đăng xuất</button>
    <div class="sm muted" style="text-align:center;padding-top:8px">Kho Thép Bãi · phiên bản 1.0</div>
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
    <div class="row gap6"><label class="f1 sm">Cây/bó<input class="inp s" style="width:100%" id="bo-${p.id}" inputmode="numeric" value="${p.bo_size}"></label><label class="f1 sm">Tối thiểu<input class="inp s" style="width:100%" id="mn-${p.id}" inputmode="numeric" value="${p.min_stock}"></label><label class="f1 sm">kg/cây<input class="inp s" style="width:100%" id="kg-${p.id}" inputmode="decimal" value="${p.kg_per_cay}"></label></div>
    <button class="btn s" data-a="psave" data-p="${p.id}">Lưu ${p.id}</button></div>`).join('');
  const khu = b.khu.map((k) => `<div class="card col gap6" style="${k.active ? '' : 'opacity:.6'}"><div class="row gap6"><b style="width:30px">${esc(k.id)}</b><input class="inp s f1" id="kn-${esc(k.id)}" value="${esc(k.name)}"></div><div class="row gap6"><button class="btn s f1" data-a="ksave" data-k="${esc(k.id)}">Lưu tên</button><button class="btn s f1 ${k.active ? 'bad' : ''}" data-a="khide" data-k="${esc(k.id)}" data-v="${k.active ? 0 : 1}">${k.active ? 'Ẩn khu' : 'Hiện lại'}</button></div></div>`).join('');
  return `${head('Cài đặt', 'Khu, phi và quy tắc', 'more')}<div class="f1 scroll pad col gap12" id="body">
    <h2 class="sec">Quy tắc</h2>
    <div class="card col gap8"><label class="sm">Tự ẩn phi khỏi khu khi đếm bằng 0 liên tiếp (ngày)<input class="inp s" style="width:100%" id="s-zero" inputmode="numeric" value="${b.settings.hide_after_zero_days}"></label>
    <label class="sm">Bắt buộc đếm lại khi "giữ nguyên" quá (ngày)<input class="inp s" style="width:100%" id="s-keep" inputmode="numeric" value="${b.settings.max_keep_streak}"></label><button class="btn s" data-a="ssave">Lưu quy tắc</button></div>
    <h2 class="sec">Khu bãi</h2>${khu}
    <div class="card col gap6"><b>Thêm khu mới</b><input class="inp s" id="newk" placeholder="Tên khu, ví dụ: Khu I" data-model="newk" value="${esc(S.form.newk || '')}"><button class="btn s pri" data-a="kadd">Thêm khu</button></div>
    <h2 class="sec">Phi thép (D8 - D36)</h2>${phi}</div>`;
}

/* ===================== KHUNG CHÍNH ===================== */
function tabsHtml() {
  const on = { home: 'home', ton: 'home', khu: 'dem', dem: 'dem', nhap: 'nhap', duyet: 'duyet', nhatky: 'more', more: 'more', stats: 'more', users: 'more', settings: 'more', pin: 'more' }[S.screen];
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
    case 'stats': body = vStats(); break;
    case 'more': body = vMore(); break;
    case 'pin': body = vPin(); break;
    case 'users': body = vUsers(); break;
    case 'settings': body = vSettings(); break;
    default: body = vHome();
  }
  const showToast = S.toast && S.screen !== 'dem';
  const noTabs = S.screen === 'dem' && S.sel;
  return `${showToast ? `<div class="toast ${S.toastErr ? 'err' : ''}" style="margin-top:calc(8px + env(safe-area-inset-top))">${esc(S.toast)}</div>` : ''}${body}${noTabs ? '' : tabsHtml()}`;
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

async function go(screen) {
  S.err = ''; S.sel = null;
  if (screen === 'dem') {
    const ok = (id) => id && S.boot.khuBy[id] && S.boot.khuBy[id].active;
    const last = localStorage.getItem('kt:lastKhu');
    openDem(ok(S.khu) ? S.khu : ok(last) ? last : S.boot.khuAct[0].id);
  } else S.screen = screen;
  render();
  try {
    if (screen === 'duyet') { S.review = null; render(); S.review = await api('GET', '/review'); }
    else if (screen === 'nhatky') { S.audit = null; render(); S.audit = (await api('GET', '/audit?limit=300')).items; }
    else if (screen === 'users') { S.users = (await api('GET', '/users')).users; }
    else if (screen === 'stats') { S.usage = null; render(); S.usage = (await api('GET', '/usage?days=' + S.usageDays)).items; }
    else if (['home', 'ton', 'khu', 'nhap', 'settings', 'dem'].includes(screen)) { await loadBoot(); }
  } catch (e) { say(e.message, true); }
  render();
}
async function act(fn, okMsg) {
  try { await fn(); if (okMsg) say(okMsg); } catch (e) { say(e.message, true); }
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
    const ref = refOf(S.khu, p);
    const kp = S.boot.kp[S.khu + '|' + p] || {};
    if (ref === undefined) return say('Phi này chưa có số hôm qua, hãy nhập số đếm.', true);
    if (kp.keep_streak >= S.boot.settings.max_keep_streak) return say('Phi này giữ nguyên quá nhiều ngày, hãy đếm lại.', true);
    S.draft.cells[p] = { v: ref, kind: 'giu' };
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
      S.me = r.user; S.err = '';
      if (r.user.must_change) { S.screen = 'home'; return render(); }
      await loadBoot(); S.screen = 'home';
      flushPending();
    } catch (e) { S.err = e.message; S.me = null; S.screen = 'login'; }
    render();
  },
  async logout() { try { await api('POST', '/logout', {}); } catch (e) { /* bỏ qua */ } S.me = null; S.boot = null; S.screen = 'login'; S.form = {}; S.err = ''; render(); },
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
    const pend = pendingList().filter((p) => refOf(S.khu, p.id) !== undefined && !((S.boot.kp[S.khu + '|' + p.id] || {}).keep_streak >= S.boot.settings.max_keep_streak));
    if (!pend.length) return;
    if (!S.confirmKeep) { S.confirmKeep = true; return render(); }
    pend.forEach((p) => { S.draft.cells[p.id] = { v: refOf(S.khu, p.id), kind: 'giu' }; });
    S.confirmKeep = false; saveDraft(); render();
  },
  send() { if (S.boot.closed) return; sendCounts(); },

  nphi(d) { S.nhap.phi = d.v; S.nhap.done = null; render(); },
  nkhu(d) { S.nhap.khu = d.v; S.nhap.done = null; render(); },
  nq(d) {
    const N = S.nhap, v = d.v;
    if (v === 'bo') N.qty += S.boot.phiBy[N.phi].bo_size; else if (v === '0') N.qty = 0; else N.qty = Math.max(0, N.qty + Number(v));
    N.done = null; render();
  },
  nconfirm() {
    const N = S.nhap;
    if (N.qty <= 0) return say('Nhập số cây lớn hơn 0.', true), render();
    act(async () => {
      const r = await api('POST', '/receipts', { phi: N.phi, khu: N.khu, qty: N.qty });
      await loadBoot();
      N.done = { id: r.id, text: `${N.phi} · ${N.qty} cây · ${fmtT(N.qty * S.boot.phiBy[N.phi].kg_per_cay)} tấn · vào ${S.boot.khuBy[N.khu].name}` };
    });
  },
  void(d) { act(async () => { await api('DELETE', '/receipts/' + d.id); S.nhap.done = null; await loadBoot(); }, 'Đã hủy phiếu nhập.'); },
  expand(d) { S.expand[d.p] = !S.expand[d.p]; render(); },

  'toggle-normal'() { S.showNormal = !S.showNormal; render(); },
  resolve(d) { act(async () => { await api('POST', '/conflict/resolve', { khu: d.k }); S.review = await api('GET', '/review'); await loadBoot(); }); },
  recount(d) { act(async () => { await api('POST', '/recount', { khu: d.k }); S.review = await api('GET', '/review'); await loadBoot(); }, 'Đã yêu cầu đếm lại.'); },
  close() {
    const R = S.review; if (!R || R.closed) return;
    const note = val('note'); S.form.note = note;
    if (R.exceptions.length && !note.trim()) return say('Còn việc bất thường, hãy ghi chú lý do trước khi chốt.', true), render();
    if (!confirm('Chốt ngày? Sau khi chốt sẽ khóa số liệu hôm nay.')) return;
    act(async () => { await api('POST', '/close', { note }); S.form.note = ''; S.review = await api('GET', '/review'); await loadBoot(); }, 'Đã chốt ngày. Số đếm hôm nay là tồn chuẩn mới.');
  },
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

  psave(d) { act(async () => { await api('PATCH', '/phi/' + d.p, { bo_size: val('bo-' + d.p), min_stock: val('mn-' + d.p), kg_per_cay: val('kg-' + d.p) }); await loadBoot(); }, 'Đã lưu ' + d.p); },
  ksave(d) { act(async () => { await api('PATCH', '/khu/' + d.k, { name: val('kn-' + d.k) }); await loadBoot(); }, 'Đã lưu tên khu.'); },
  khide(d) { act(async () => { await api('PATCH', '/khu/' + d.k, { active: d.v === '1' }); await loadBoot(); }, d.v === '1' ? 'Đã hiện lại khu.' : 'Đã ẩn khu.'); },
  kadd() { const name = val('newk'); act(async () => { await api('POST', '/khu', { name }); S.form.newk = ''; await loadBoot(); }, 'Đã thêm khu.'); },
  ssave() { act(async () => { await api('PUT', '/settings', { hide_after_zero_days: val('s-zero'), max_keep_streak: val('s-keep') }); await loadBoot(); }, 'Đã lưu quy tắc.'); },
};

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-a]');
  if (!t || !ACTIONS[t.dataset.a]) return;
  ACTIONS[t.dataset.a](t.dataset, e);
});
document.addEventListener('input', (e) => { const m = e.target.dataset && e.target.dataset.model; if (m) S.form[m] = e.target.value; });
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset && t.dataset.change === 'role') {
    act(async () => { await api('POST', `/users/${t.dataset.id}/role`, { role: t.value }); S.users = (await api('GET', '/users')).users; }, 'Đã đổi vai trò.');
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.dataset && e.target.dataset.enter) { e.preventDefault(); ACTIONS[e.target.dataset.enter](); }
});

/* ===================== KHỞI ĐỘNG ===================== */
async function refresh() {
  if (!S.me || document.hidden || S.me.must_change) return;
  if (!['home', 'ton', 'khu'].includes(S.screen)) return;
  try {
    // chỉ hỏi số phiên bản (rất nhẹ), có thay đổi mới tải lại toàn bộ
    const r = await api('GET', '/rev');
    if (!S.boot || r.rev !== S.boot.rev) { await loadBoot(); render(); }
  } catch (e) { /* bỏ qua lỗi mạng khi làm mới ngầm */ }
}
async function start() {
  render();
  try {
    const r = await api('GET', '/me');
    S.me = r.user;
    if (!r.user.must_change) { await loadBoot(); S.screen = 'home'; flushPending(); }
    else S.screen = 'home';
  } catch (e) { S.me = null; S.screen = 'login'; S.err = ''; }
  render();
  setInterval(refresh, 45000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  window.addEventListener('online', flushPending);
}
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
start();
