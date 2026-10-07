// Kho Thép Bãi - Cloudflare Worker (API) + D1
// Giao diện tĩnh nằm trong /public, mọi đường dẫn /api/* chạy qua file này.

class HttpError extends Error {
  constructor(status, msg) { super(msg); this.status = status; }
}
const bad = (m) => new HttpError(400, m);

const enc = new TextEncoder();
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const rand = (n = 32) => toHex(crypto.getRandomValues(new Uint8Array(n)));

async function sha256(s) {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}
async function hmac(key, msg) {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toHex(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
}
function safeEq(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
// PIN chỉ có 4 số nên băm kèm "PEPPER" (bí mật lưu ngoài database): lộ database cũng không dò được PIN
const hashPin = (env, salt, pin) => hmac(env.PEPPER, salt + ':' + pin);

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });

const vnDay = (ms = Date.now()) => new Date(ms + 7 * 3600e3).toISOString().slice(0, 10); // giờ Việt Nam
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const KINDS = ['dem', 'giu', 'zero'];
const ROLES = ['admin', 'thukho', 'nguoidem'];
const SESSION_MS = 30 * 24 * 3600e3;
const LOCK_AFTER = 5;
const LOCK_MS = 15 * 60e3;

function normPhone(p) {
  const d = String(p || '').replace(/\D/g, '');
  if (d.length < 9 || d.length > 11) throw bad('Số điện thoại không hợp lệ');
  return d;
}
function checkPin(p) {
  if (!/^\d{4}$/.test(String(p || ''))) throw bad('PIN phải gồm đúng 4 chữ số');
  if (/^(\d)\1{3}$/.test(p) || ['1234', '4321', '0123'].includes(p)) throw bad('PIN quá dễ đoán, hãy chọn số khác');
}
const genPin = () => {
  for (;;) {
    const n = crypto.getRandomValues(new Uint32Array(1))[0] % 10000;
    const p = String(n).padStart(4, '0');
    try { checkPin(p); return p; } catch (e) { /* thử lại */ }
  }
};
const intIn = (v, min, max, label) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw bad(label + ' không hợp lệ');
  return n;
};

async function readJson(req) {
  try { return await req.json(); } catch (e) { throw bad('Dữ liệu gửi lên không hợp lệ'); }
}

const bump = (env) => env.DB.prepare("UPDATE meta SET value = value + 1 WHERE key = 'rev'");

function auditStmt(env, user, action, detail) {
  return env.DB.prepare('INSERT INTO audit (ts, user_id, user_name, action, detail) VALUES (?,?,?,?,?)')
    .bind(Date.now(), user ? user.id : null, user ? user.name : null, action, detail ? JSON.stringify(detail) : null);
}

async function auth(req, env, roles) {
  const m = (req.headers.get('Cookie') || '').match(/(?:^|;\s*)sid=([a-f0-9]{64})/);
  if (!m) throw new HttpError(401, 'Chưa đăng nhập');
  const th = await sha256(m[1]);
  const row = await env.DB.prepare(
    'SELECT u.id, u.name, u.phone, u.role, u.locked, u.must_change, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?'
  ).bind(th).first();
  if (!row || row.expires_at < Date.now() || row.locked) throw new HttpError(401, 'Phiên đăng nhập hết hạn');
  if (row.expires_at - Date.now() < SESSION_MS / 2) {
    await env.DB.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').bind(Date.now() + SESSION_MS, th).run();
  }
  if (roles && !roles.includes(row.role)) throw new HttpError(403, 'Bạn không có quyền thực hiện việc này');
  return row;
}

function sessionCookie(url, token, maxAge) {
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  return `sid=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

async function getSettings(env) {
  const { results } = await env.DB.prepare('SELECT key, value FROM settings').all();
  const o = { hide_after_zero_days: 3, max_keep_streak: 3 };
  for (const r of results) o[r.key] = Number(r.value);
  return o;
}

async function createSession(env, url, req, userId) {
  const token = rand(32);
  const th = await sha256(token);
  const ua = (req.headers.get('User-Agent') || '').slice(0, 120);
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, device, created_at, expires_at) VALUES (?,?,?,?,?)')
    .bind(th, userId, ua, Date.now(), Date.now() + SESSION_MS).run();
  return sessionCookie(url, token, SESSION_MS / 1000);
}

/* ========================= ĐĂNG NHẬP ========================= */

async function setup(req, env, url) {
  const b = await readJson(req);
  if (!env.SETUP_TOKEN || !env.PEPPER) throw new HttpError(500, 'Chưa cấu hình SETUP_TOKEN và PEPPER');
  const c = await env.DB.prepare('SELECT COUNT(*) n FROM users').first();
  if (c.n > 0) throw new HttpError(403, 'Hệ thống đã được thiết lập');
  if (!safeEq(String(b.token || ''), env.SETUP_TOKEN)) throw new HttpError(403, 'Mã thiết lập sai');
  const phone = normPhone(b.phone);
  checkPin(String(b.pin || ''));
  const name = String(b.name || '').trim().slice(0, 60);
  if (!name) throw bad('Cần nhập tên');
  const salt = rand(16);
  const hash = await hashPin(env, salt, b.pin);
  const r = await env.DB.prepare(
    "INSERT INTO users (name, phone, role, pin_salt, pin_hash, must_change, created_at) VALUES (?,?,'admin',?,?,0,?)"
  ).bind(name, phone, salt, hash, Date.now()).run();
  await auditStmt(env, { id: r.meta.last_row_id, name }, 'setup', null).run();
  return json({ ok: true });
}

async function login(req, env, url) {
  if (!env.PEPPER) throw new HttpError(500, 'Chưa cấu hình PEPPER');
  const b = await readJson(req);
  const phone = String(b.phone || '').replace(/\D/g, '');
  const pin = String(b.pin || '');
  const fail = () => new HttpError(401, 'Sai số điện thoại hoặc PIN');
  const u = await env.DB.prepare('SELECT * FROM users WHERE phone = ?').bind(phone).first();
  if (!u) throw fail();
  if (u.locked) throw new HttpError(403, 'Tài khoản đã bị khóa, liên hệ admin');
  if (u.locked_until > Date.now()) {
    const mins = Math.ceil((u.locked_until - Date.now()) / 60000);
    throw new HttpError(429, `Nhập sai nhiều lần, thử lại sau ${mins} phút`);
  }
  const ok = safeEq(await hashPin(env, u.pin_salt, pin), u.pin_hash);
  if (!ok) {
    const n = u.fail_count + 1;
    if (n >= LOCK_AFTER) {
      await env.DB.batch([
        env.DB.prepare('UPDATE users SET fail_count = 0, locked_until = ? WHERE id = ?').bind(Date.now() + LOCK_MS, u.id),
        auditStmt(env, u, 'login_locked', { phone }),
      ]);
    } else {
      await env.DB.batch([
        env.DB.prepare('UPDATE users SET fail_count = ? WHERE id = ?').bind(n, u.id),
        auditStmt(env, u, 'login_fail', { n, ua: (req.headers.get('User-Agent') || '').slice(0, 80) }),
      ]);
    }
    throw fail();
  }
  const cookie = await createSession(env, url, req, u.id);
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET fail_count = 0, locked_until = 0 WHERE id = ?').bind(u.id),
    auditStmt(env, u, 'login', { ua: (req.headers.get('User-Agent') || '').slice(0, 80) }),
  ]);
  return json({ user: { id: u.id, name: u.name, role: u.role, must_change: u.must_change } }, 200, { 'Set-Cookie': cookie });
}

async function logout(req, env, url) {
  const m = (req.headers.get('Cookie') || '').match(/(?:^|;\s*)sid=([a-f0-9]{64})/);
  if (m) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(m[1])).run();
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(url, '', 0) });
}

async function changePin(req, env, user) {
  const b = await readJson(req);
  const u = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first();
  if (!safeEq(await hashPin(env, u.pin_salt, String(b.pin || '')), u.pin_hash)) throw new HttpError(401, 'PIN hiện tại không đúng');
  const np = String(b.newPin || '');
  checkPin(np);
  if (np === String(b.pin)) throw bad('PIN mới phải khác PIN cũ');
  const salt = rand(16);
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET pin_salt = ?, pin_hash = ?, must_change = 0 WHERE id = ?').bind(salt, await hashPin(env, salt, np), user.id),
    auditStmt(env, user, 'change_pin', null),
  ]);
  return json({ ok: true });
}

/* ========================= DỮ LIỆU CHUNG ========================= */

async function bootstrap(env, user) {
  const day = vnDay();
  const lc = await env.DB.prepare('SELECT day FROM day_close WHERE day < ? ORDER BY day DESC LIMIT 1').bind(day).first();
  const last = lc ? lc.day : '';
  const [phi, khu, khuPhi, counts, baseline, reports, receipts, closed, rev] = await env.DB.batch([
    env.DB.prepare('SELECT id, kg_per_cay, bo_size, min_stock FROM phi ORDER BY sort'),
    env.DB.prepare('SELECT id, name, active FROM khu ORDER BY sort, id'),
    env.DB.prepare('SELECT khu_id, phi_id, active, keep_streak FROM khu_phi'),
    env.DB.prepare('SELECT c.khu_id, c.phi_id, c.v, c.kind, c.bo, c.le, c.user_id, u.name uname, c.ts FROM counts c JOIN users u ON u.id = c.user_id WHERE c.day = ?').bind(day),
    env.DB.prepare('SELECT khu_id, phi_id, v FROM baseline WHERE day = ?').bind(last),
    env.DB.prepare('SELECT r.khu_id, r.user_id, u.name uname, r.ts, r.conflict, r.resolved, r.recount FROM khu_report r JOIN users u ON u.id = r.user_id WHERE r.day = ?').bind(day),
    env.DB.prepare('SELECT r.id, r.phi_id, r.khu_id, r.qty, r.ts, r.user_id, u.name uname FROM receipts r JOIN users u ON u.id = r.user_id WHERE r.day = ? AND r.voided = 0 ORDER BY r.id DESC').bind(day),
    env.DB.prepare('SELECT 1 x FROM day_close WHERE day = ?').bind(day),
    env.DB.prepare("SELECT value FROM meta WHERE key = 'rev'"),
  ]);
  return {
    rev: rev.results[0] ? rev.results[0].value : 0,
    today: day,
    lastClosed: last || null,
    closed: closed.results.length > 0,
    user: { id: user.id, name: user.name, role: user.role },
    phi: phi.results,
    khu: khu.results,
    khuPhi: khuPhi.results,
    counts: counts.results,
    baseline: baseline.results,
    reports: reports.results,
    receipts: receipts.results,
    settings: await getSettings(env),
  };
}

/* ========================= BÁO CÁO ĐẾM ========================= */

async function putCounts(req, env, user) {
  const b = await readJson(req);
  const day = vnDay();
  const closed = await env.DB.prepare('SELECT 1 x FROM day_close WHERE day = ?').bind(day).first();
  if (closed) throw new HttpError(409, 'Ngày hôm nay đã được chốt, không sửa được nữa');
  const khuId = String(b.khu || '');
  const k = await env.DB.prepare('SELECT id, active FROM khu WHERE id = ?').bind(khuId).first();
  if (!k || !k.active) throw bad('Khu không tồn tại hoặc đã ẩn');
  const items = Array.isArray(b.items) ? b.items : [];
  if (!items.length) throw bad('Chưa có số liệu nào');
  const settings = await getSettings(env);

  const [phiR, kpR, prevR] = await env.DB.batch([
    env.DB.prepare('SELECT id FROM phi'),
    env.DB.prepare('SELECT phi_id, active, zero_days, keep_streak FROM khu_phi WHERE khu_id = ?').bind(khuId),
    env.DB.prepare('SELECT phi_id, v, user_id FROM counts WHERE day = ? AND khu_id = ?').bind(day, khuId),
  ]);
  const phiSet = new Set(phiR.results.map((r) => r.id));
  const kp = Object.fromEntries(kpR.results.map((r) => [r.phi_id, r]));
  const prev = Object.fromEntries(prevR.results.map((r) => [r.phi_id, r]));

  const seen = new Set();
  const clean = items.map((it) => {
    const phi = String(it.phi || '');
    if (!phiSet.has(phi)) throw bad('Phi không hợp lệ: ' + phi);
    if (seen.has(phi)) throw bad('Trùng phi: ' + phi);
    seen.add(phi);
    const kind = String(it.kind || 'dem');
    if (!KINDS.includes(kind)) throw bad('Loại số liệu không hợp lệ');
    const v = intIn(it.v, 0, 99999, 'Số cây của ' + phi);
    if (kind === 'zero' && v !== 0) throw bad('Số liệu không khớp ở phi ' + phi);
    const bo = it.bo === undefined || it.bo === null ? null : intIn(it.bo, 0, 999, 'Số bó');
    const le = it.le === undefined || it.le === null ? null : intIn(it.le, 0, 9999, 'Số cây lẻ');
    return { phi, kind, v, bo, le };
  });

  const missing = Object.values(kp).filter((r) => r.active && !seen.has(r.phi_id)).map((r) => r.phi_id);
  if (missing.length) throw bad('Còn phi chưa nhập: ' + missing.join(', '));

  const ts = Date.now();
  const stmts = [];
  const changes = [];
  let conflict = 0;
  for (const it of clean) {
    const old = kp[it.phi];
    const p = prev[it.phi];
    if (it.kind === 'giu' && old && !(p && p.kind === 'giu') && old.keep_streak >= settings.max_keep_streak) {
      throw bad(`Phi ${it.phi} đã giữ nguyên quá ${settings.max_keep_streak} ngày liên tiếp, hãy đếm lại`);
    }
    if (p && p.user_id !== user.id && p.v !== it.v) conflict = 1;
    if (!p || p.v !== it.v) changes.push({ phi: it.phi, from: p ? p.v : null, to: it.v });
    stmts.push(
      env.DB.prepare(
        `INSERT INTO counts (day, khu_id, phi_id, v, kind, bo, le, user_id, ts) VALUES (?,?,?,?,?,?,?,?,?)
         ON CONFLICT(day, khu_id, phi_id) DO UPDATE SET v=excluded.v, kind=excluded.kind, bo=excluded.bo, le=excluded.le, user_id=excluded.user_id, ts=excluded.ts`
      ).bind(day, khuId, it.phi, it.v, it.kind, it.bo, it.le, user.id, ts),
      env.DB.prepare('INSERT INTO counts_log (day, khu_id, phi_id, prev_v, v, kind, user_id, ts) VALUES (?,?,?,?,?,?,?,?)')
        .bind(day, khuId, it.phi, p ? p.v : null, it.v, it.kind, user.id, ts)
    );
    let zero = old ? old.zero_days : 0;
    let keep = old ? old.keep_streak : 0;
    if (!p) { // chỉ tính chuỗi ngày ở lần báo đầu tiên trong ngày
      zero = it.v === 0 ? zero + 1 : 0;
      keep = it.kind === 'giu' ? keep + 1 : 0;
    }
    const active = it.v === 0 && zero >= settings.hide_after_zero_days ? 0 : 1;
    stmts.push(
      env.DB.prepare(
        `INSERT INTO khu_phi (khu_id, phi_id, active, zero_days, keep_streak) VALUES (?,?,?,?,?)
         ON CONFLICT(khu_id, phi_id) DO UPDATE SET active=excluded.active, zero_days=excluded.zero_days, keep_streak=excluded.keep_streak`
      ).bind(khuId, it.phi, active, zero, keep)
    );
  }
  stmts.push(
    env.DB.prepare(
      `INSERT INTO khu_report (day, khu_id, user_id, ts, conflict, resolved, recount) VALUES (?,?,?,?,?,0,0)
       ON CONFLICT(day, khu_id) DO UPDATE SET user_id=excluded.user_id, ts=excluded.ts,
         conflict = CASE WHEN excluded.conflict = 1 THEN 1 ELSE khu_report.conflict END,
         resolved = CASE WHEN excluded.conflict = 1 THEN 0 ELSE khu_report.resolved END,
         recount = 0`
    ).bind(day, khuId, user.id, ts, conflict),
    auditStmt(env, user, 'count', { khu: khuId, n: clean.length, changes: changes.slice(0, 30), conflict: !!conflict }),
    bump(env)
  );
  await env.DB.batch(stmts);
  return json({ ok: true, conflict: !!conflict });
}

/* ========================= NHẬP KHO ========================= */

async function postReceipt(req, env, user) {
  const b = await readJson(req);
  const day = vnDay();
  const closed = await env.DB.prepare('SELECT 1 x FROM day_close WHERE day = ?').bind(day).first();
  if (closed) throw new HttpError(409, 'Ngày hôm nay đã chốt');
  const phi = await env.DB.prepare('SELECT id FROM phi WHERE id = ?').bind(String(b.phi || '')).first();
  const khu = await env.DB.prepare('SELECT id FROM khu WHERE id = ? AND active = 1').bind(String(b.khu || '')).first();
  if (!phi) throw bad('Phi không hợp lệ');
  if (!khu) throw bad('Khu không hợp lệ');
  const qty = intIn(b.qty, 1, 99999, 'Số cây');
  const note = String(b.note || '').slice(0, 200);
  const r = await env.DB.prepare('INSERT INTO receipts (day, phi_id, khu_id, qty, note, user_id, ts) VALUES (?,?,?,?,?,?,?)')
    .bind(day, phi.id, khu.id, qty, note, user.id, Date.now()).run();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO khu_phi (khu_id, phi_id, active, zero_days, keep_streak) VALUES (?,?,1,0,0)
       ON CONFLICT(khu_id, phi_id) DO UPDATE SET active = 1, zero_days = 0`
    ).bind(khu.id, phi.id),
    auditStmt(env, user, 'receipt', { id: r.meta.last_row_id, phi: phi.id, khu: khu.id, qty }),
    bump(env),
  ]);
  return json({ ok: true, id: r.meta.last_row_id });
}

async function voidReceipt(env, user, id) {
  const r = await env.DB.prepare('SELECT * FROM receipts WHERE id = ? AND voided = 0').bind(id).first();
  if (!r) throw new HttpError(404, 'Không tìm thấy phiếu nhập');
  const closed = await env.DB.prepare('SELECT 1 x FROM day_close WHERE day = ?').bind(r.day).first();
  if (closed) throw new HttpError(409, 'Ngày đã chốt, không hủy được');
  if (user.role !== 'admin' && (r.user_id !== user.id || Date.now() - r.ts > 10 * 60e3)) {
    throw new HttpError(403, 'Chỉ hoàn tác được trong 10 phút sau khi nhập');
  }
  await env.DB.batch([
    env.DB.prepare('UPDATE receipts SET voided = 1 WHERE id = ?').bind(id),
    auditStmt(env, user, 'receipt_void', { id, phi: r.phi_id, khu: r.khu_id, qty: r.qty }),
    bump(env),
  ]);
  return json({ ok: true });
}

/* ========================= DUYỆT / CHỐT NGÀY ========================= */

async function computeReview(env, day) {
  const db = env.DB;
  const lc = await db.prepare('SELECT day FROM day_close WHERE day < ? ORDER BY day DESC LIMIT 1').bind(day).first();
  const last = lc ? lc.day : '';
  const [phiR, khuR, kpR, repR, cntR, baseR, rcR, usedR, closedR] = await db.batch([
    db.prepare('SELECT id, kg_per_cay FROM phi ORDER BY sort'),
    db.prepare('SELECT id, name, active FROM khu ORDER BY sort, id'),
    db.prepare('SELECT khu_id, COUNT(*) n FROM khu_phi WHERE active = 1 GROUP BY khu_id'),
    db.prepare('SELECT r.khu_id, r.user_id, u.name uname, r.ts, r.conflict, r.resolved, r.recount FROM khu_report r JOIN users u ON u.id = r.user_id WHERE r.day = ?').bind(day),
    db.prepare('SELECT khu_id, phi_id, v FROM counts WHERE day = ?').bind(day),
    db.prepare('SELECT khu_id, phi_id, v FROM baseline WHERE day = ?').bind(last),
    db.prepare('SELECT phi_id, khu_id, SUM(qty) q FROM receipts WHERE voided = 0 AND day > ? AND day <= ? GROUP BY phi_id, khu_id').bind(last, day),
    db.prepare('SELECT used_json FROM day_close ORDER BY day DESC LIMIT 7'),
    db.prepare('SELECT 1 x FROM day_close WHERE day = ?').bind(day),
  ]);
  const cnt = {}, base = {}, inn = {};
  cntR.results.forEach((r) => (cnt[r.khu_id + '|' + r.phi_id] = r.v));
  baseR.results.forEach((r) => (base[r.khu_id + '|' + r.phi_id] = r.v));
  rcR.results.forEach((r) => (inn[r.khu_id + '|' + r.phi_id] = r.q));
  const khuAct = khuR.results.filter((k) => k.active);
  const hasBase = !!last;

  const hist = {};
  usedR.results.forEach((r) => {
    try {
      const o = JSON.parse(r.used_json || '{}');
      for (const p in o) (hist[p] = hist[p] || []).push(o[p]);
    } catch (e) { /* bỏ qua */ }
  });

  const rows = phiR.results.map((p) => {
    let old = 0, innT = 0, cn = 0, topKhu = null, topNet = 0;
    for (const k of khuR.results) {
      const key = k.id + '|' + p.id;
      const b = base[key] || 0;
      const i = inn[key] || 0;
      const eff = cnt[key] !== undefined ? cnt[key] : b;
      old += b; innT += i; cn += eff;
      const net = eff - (b + i);
      if (Math.abs(net) > Math.abs(topNet)) { topNet = net; topKhu = k.id; }
    }
    const used = hasBase ? old + innT - cn : null;
    const arr = (hist[p.id] || []).filter((x) => x > 0);
    const avg = arr.length ? arr.reduce((a, c) => a + c, 0) / arr.length : null;
    const neg = used !== null && used < 0;
    const high = used !== null && avg !== null && used > 3 * avg && used > 10;
    return { phi: p.id, kg: p.kg_per_cay, old, inn: innT, cnt: cn, used, avg: avg === null ? null : Math.round(avg * 10) / 10, neg, high, topKhu, topNet };
  });

  const reps = Object.fromEntries(repR.results.map((r) => [r.khu_id, r]));
  const withPhi = new Set(kpR.results.map((r) => r.khu_id));
  const exceptions = [];
  for (const k of khuAct) {
    if (!withPhi.has(k.id)) continue;
    const r = reps[k.id];
    if (!r) exceptions.push({ type: 'khu_missing', khu: k.id, name: k.name });
    else {
      if (r.conflict && !r.resolved) exceptions.push({ type: 'conflict', khu: k.id, name: k.name });
      if (r.recount) exceptions.push({ type: 'recount', khu: k.id, name: k.name });
    }
  }
  rows.forEach((r) => {
    if (r.neg) exceptions.push({ type: 'phi', phi: r.phi, reason: 'neg' });
    else if (r.high) exceptions.push({ type: 'phi', phi: r.phi, reason: 'high' });
  });
  return { day, last: last || null, closed: closedR.results.length > 0, rows, exceptions, reports: repR.results, khu: khuR.results };
}

async function closeDay(req, env, user) {
  const b = await readJson(req);
  const day = vnDay();
  const rv = await computeReview(env, day);
  if (rv.closed) throw new HttpError(409, 'Ngày hôm nay đã được chốt');
  const note = String(b.note || '').trim().slice(0, 500);
  if (rv.exceptions.length && !note) throw bad('Còn việc bất thường, cần ghi chú lý do trước khi chốt');
  const used = {};
  rv.rows.forEach((r) => { if (r.used !== null) used[r.phi] = r.used; });
  await env.DB.batch([
    env.DB.prepare('INSERT INTO day_close (day, closed_by, ts, note, used_json, exc_json) VALUES (?,?,?,?,?,?)')
      .bind(day, user.id, Date.now(), note, JSON.stringify(used), JSON.stringify(rv.exceptions)),
    env.DB.prepare(
      `INSERT OR REPLACE INTO baseline (day, khu_id, phi_id, v)
       SELECT ?1, kp.khu_id, kp.phi_id, COALESCE(c.v, b.v, 0)
       FROM khu_phi kp
       LEFT JOIN counts c ON c.day = ?1 AND c.khu_id = kp.khu_id AND c.phi_id = kp.phi_id
       LEFT JOIN baseline b ON b.day = ?2 AND b.khu_id = kp.khu_id AND b.phi_id = kp.phi_id
       WHERE kp.active = 1 OR COALESCE(c.v, b.v, 0) > 0`
    ).bind(day, rv.last || ''),
    auditStmt(env, user, 'close_day', { day, exceptions: rv.exceptions.length, note }),
    bump(env),
  ]);
  return json({ ok: true });
}

/* ========================= QUẢN TRỊ ========================= */

async function listUsers(env) {
  const { results } = await env.DB.prepare('SELECT id, name, phone, role, locked, must_change, locked_until FROM users ORDER BY id').all();
  return json({ users: results });
}

async function createUser(req, env, admin) {
  const b = await readJson(req);
  const name = String(b.name || '').trim().slice(0, 60);
  if (!name) throw bad('Cần nhập tên');
  const phone = normPhone(b.phone);
  const role = String(b.role || 'nguoidem');
  if (!ROLES.includes(role)) throw bad('Vai trò không hợp lệ');
  const exist = await env.DB.prepare('SELECT 1 x FROM users WHERE phone = ?').bind(phone).first();
  if (exist) throw bad('Số điện thoại này đã có tài khoản');
  const pin = genPin();
  const salt = rand(16);
  const r = await env.DB.prepare('INSERT INTO users (name, phone, role, pin_salt, pin_hash, must_change, created_at) VALUES (?,?,?,?,?,1,?)')
    .bind(name, phone, role, salt, await hashPin(env, salt, pin), Date.now()).run();
  await auditStmt(env, admin, 'user_create', { id: r.meta.last_row_id, name, role }).run();
  return json({ ok: true, id: r.meta.last_row_id, pin });
}

async function userAction(req, env, admin, id, action) {
  const u = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
  if (!u) throw new HttpError(404, 'Không tìm thấy người dùng');
  const b = req.method === 'POST' ? await readJson(req) : {};
  if (action === 'reset-pin') {
    const pin = genPin();
    const salt = rand(16);
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET pin_salt = ?, pin_hash = ?, must_change = 1, fail_count = 0, locked_until = 0 WHERE id = ?').bind(salt, await hashPin(env, salt, pin), id),
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id),
      auditStmt(env, admin, 'user_reset_pin', { id, name: u.name }),
    ]);
    return json({ ok: true, pin });
  }
  if (action === 'lock') {
    if (id === admin.id) throw bad('Không thể tự khóa chính mình');
    const lock = b.locked ? 1 : 0;
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET locked = ? WHERE id = ?').bind(lock, id),
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(lock ? id : -1),
      auditStmt(env, admin, lock ? 'user_lock' : 'user_unlock', { id, name: u.name }),
    ]);
    return json({ ok: true });
  }
  if (action === 'role') {
    const role = String(b.role || '');
    if (!ROLES.includes(role)) throw bad('Vai trò không hợp lệ');
    if (id === admin.id && role !== 'admin') throw bad('Không thể tự bỏ quyền admin của mình');
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET role = ? WHERE id = ?').bind(role, id),
      auditStmt(env, admin, 'user_role', { id, name: u.name, role }),
    ]);
    return json({ ok: true });
  }
  if (action === 'logout') {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id),
      auditStmt(env, admin, 'user_logout', { id, name: u.name }),
    ]);
    return json({ ok: true });
  }
  throw new HttpError(404, 'Không có thao tác này');
}

async function khuCreate(req, env, admin) {
  const b = await readJson(req);
  const name = String(b.name || '').trim().slice(0, 40);
  if (!name) throw bad('Cần nhập tên khu');
  const all = await env.DB.prepare('SELECT id, sort FROM khu').all();
  let id = String(b.id || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  if (!id) { // tự đặt mã: chữ cái tiếp theo còn trống
    const used = new Set(all.results.map((r) => r.id));
    for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') { if (!used.has(c)) { id = c; break; } }
  }
  if (!id) throw bad('Không tạo được mã khu');
  if (all.results.some((r) => r.id === id)) throw bad('Mã khu đã tồn tại');
  const sort = all.results.reduce((m, r) => Math.max(m, r.sort), 0) + 1;
  await env.DB.batch([
    env.DB.prepare('INSERT INTO khu (id, name, sort, active) VALUES (?,?,?,1)').bind(id, name, sort),
    auditStmt(env, admin, 'khu_create', { id, name }),
    bump(env),
  ]);
  return json({ ok: true, id });
}

async function khuUpdate(req, env, admin, id) {
  const b = await readJson(req);
  const k = await env.DB.prepare('SELECT * FROM khu WHERE id = ?').bind(id).first();
  if (!k) throw new HttpError(404, 'Không tìm thấy khu');
  const name = b.name !== undefined ? String(b.name).trim().slice(0, 40) || k.name : k.name;
  const active = b.active !== undefined ? (b.active ? 1 : 0) : k.active;
  await env.DB.batch([
    env.DB.prepare('UPDATE khu SET name = ?, active = ? WHERE id = ?').bind(name, active, id),
    auditStmt(env, admin, 'khu_update', { id, name, active }),
    bump(env),
  ]);
  return json({ ok: true });
}

async function phiUpdate(req, env, admin, id) {
  const b = await readJson(req);
  const p = await env.DB.prepare('SELECT * FROM phi WHERE id = ?').bind(id).first();
  if (!p) throw new HttpError(404, 'Không tìm thấy phi');
  const bo = intIn(b.bo_size ?? p.bo_size, 1, 9999, 'Số cây mỗi bó');
  const min = intIn(b.min_stock ?? p.min_stock, 0, 99999, 'Mức tối thiểu');
  const kg = Number(b.kg_per_cay ?? p.kg_per_cay);
  if (!(kg > 0 && kg < 1000)) throw bad('Khối lượng mỗi cây không hợp lệ');
  await env.DB.batch([
    env.DB.prepare('UPDATE phi SET bo_size = ?, min_stock = ?, kg_per_cay = ? WHERE id = ?').bind(bo, min, kg, id),
    auditStmt(env, admin, 'phi_update', { id, bo, min, kg }),
    bump(env),
  ]);
  return json({ ok: true });
}

async function settingsUpdate(req, env, admin) {
  const b = await readJson(req);
  const stmts = [];
  for (const key of ['hide_after_zero_days', 'max_keep_streak']) {
    if (b[key] !== undefined) {
      const v = intIn(b[key], 1, 30, key);
      stmts.push(env.DB.prepare('INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(key, String(v)));
    }
  }
  if (!stmts.length) throw bad('Không có gì để lưu');
  stmts.push(auditStmt(env, admin, 'settings_update', b), bump(env));
  await env.DB.batch(stmts);
  return json({ ok: true });
}

async function auditList(env, url) {
  const limit = Math.min(Number(url.searchParams.get('limit')) || 150, 500);
  const { results } = await env.DB.prepare('SELECT id, ts, user_name, action, detail FROM audit ORDER BY id DESC LIMIT ?').bind(limit).all();
  return json({ items: results });
}

async function usage(env, url) {
  const days = Math.min(Number(url.searchParams.get('days')) || 30, 180);
  const { results } = await env.DB.prepare('SELECT day, used_json FROM day_close ORDER BY day DESC LIMIT ?').bind(days).all();
  return json({ items: results.map((r) => ({ day: r.day, used: JSON.parse(r.used_json || '{}') })) });
}

async function exportCsv(env, url) {
  const day = DAY_RE.test(url.searchParams.get('date') || '') ? url.searchParams.get('date') : vnDay();
  const [phiR, khuR, cntR, baseR] = await env.DB.batch([
    env.DB.prepare('SELECT id, kg_per_cay FROM phi ORDER BY sort'),
    env.DB.prepare('SELECT id, name FROM khu WHERE active = 1 ORDER BY sort, id'),
    env.DB.prepare('SELECT khu_id, phi_id, v FROM counts WHERE day = ?').bind(day),
    env.DB.prepare('SELECT khu_id, phi_id, v FROM baseline WHERE day = (SELECT MAX(day) FROM baseline WHERE day <= ?)').bind(day),
  ]);
  const c = {}, b = {};
  cntR.results.forEach((r) => (c[r.khu_id + '|' + r.phi_id] = r.v));
  baseR.results.forEach((r) => (b[r.khu_id + '|' + r.phi_id] = r.v));
  const esc = (s) => '"' + String(s).replace(/"/g, '""') + '"';
  const head = ['Khu', ...phiR.results.map((p) => p.id), 'Tổng (cây)', 'Tổng (tấn)'];
  const lines = [head.map(esc).join(',')];
  const colCay = phiR.results.map(() => 0);
  let allKg = 0;
  for (const k of khuR.results) {
    let sum = 0, kg = 0;
    const cells = phiR.results.map((p, i) => {
      const key = k.id + '|' + p.id;
      const v = c[key] !== undefined ? c[key] : (b[key] || 0);
      sum += v; kg += v * p.kg_per_cay; colCay[i] += v;
      return v;
    });
    allKg += kg;
    lines.push([esc(k.name), ...cells, sum, (kg / 1000).toFixed(2)].join(','));
  }
  lines.push([esc('TỔNG'), ...colCay, colCay.reduce((a, x) => a + x, 0), (allKg / 1000).toFixed(2)].join(','));
  return new Response('\ufeff' + lines.join('\r\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="ton-kho-${day}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}

/* ========================= ĐỊNH TUYẾN ========================= */

async function handle(req, env, url) {
  const method = req.method;
  if (method !== 'GET' && method !== 'HEAD') {
    const o = req.headers.get('Origin');
    if (o && new URL(o).host !== url.host) throw new HttpError(403, 'Yêu cầu bị từ chối');
  }
  const p = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const r0 = p[0] || '';

  if (method === 'POST' && r0 === 'setup') return setup(req, env, url);
  if (method === 'POST' && r0 === 'login') return login(req, env, url);
  if (method === 'POST' && r0 === 'logout') return logout(req, env, url);

  const user = await auth(req, env);
  if (r0 === 'me' && method === 'GET') return json({ user: { id: user.id, name: user.name, role: user.role, must_change: user.must_change } });
  if (r0 === 'change-pin' && method === 'POST') return changePin(req, env, user);
  if (user.must_change) throw new HttpError(403, 'Bạn cần đổi PIN trước khi sử dụng');

  const ALL = ['admin', 'thukho', 'nguoidem'];
  const need = (roles) => { if (!roles.includes(user.role)) throw new HttpError(403, 'Bạn không có quyền thực hiện việc này'); };

  if (r0 === 'rev' && method === 'GET') { const r = await env.DB.prepare("SELECT value FROM meta WHERE key = 'rev'").first(); return json({ rev: r ? r.value : 0 }); }
  if (r0 === 'bootstrap' && method === 'GET') return json(await bootstrap(env, user));
  if (r0 === 'counts' && method === 'PUT') { need(ALL); return putCounts(req, env, user); }
  if (r0 === 'usage' && method === 'GET') return usage(env, url);

  if (r0 === 'receipts') {
    need(['admin', 'thukho']);
    if (method === 'POST' && p.length === 1) return postReceipt(req, env, user);
    if (method === 'DELETE' && p.length === 2) return voidReceipt(env, user, Number(p[1]));
  }

  // --- chỉ admin ---
  need(['admin']);
  if (r0 === 'review' && method === 'GET') return json(await computeReview(env, vnDay()));
  if (r0 === 'close' && method === 'POST') return closeDay(req, env, user);
  if (r0 === 'recount' && method === 'POST') {
    const b = await readJson(req);
    const day = vnDay();
    const res = await env.DB.prepare('UPDATE khu_report SET recount = 1 WHERE day = ? AND khu_id = ?').bind(day, String(b.khu || '')).run();
    if (!res.meta.changes) throw bad('Khu này chưa có báo cáo để yêu cầu đếm lại');
    await env.DB.batch([bump(env), auditStmt(env, user, 'recount', { khu: b.khu })]);
    return json({ ok: true });
  }
  if (r0 === 'conflict' && p[1] === 'resolve' && method === 'POST') {
    const b = await readJson(req);
    const res = await env.DB.prepare('UPDATE khu_report SET resolved = 1 WHERE day = ? AND khu_id = ?').bind(vnDay(), String(b.khu || '')).run();
    if (!res.meta.changes) throw bad('Không có khu cần xử lý');
    await env.DB.batch([bump(env), auditStmt(env, user, 'conflict_resolve', { khu: b.khu })]);
    return json({ ok: true });
  }
  if (r0 === 'audit' && method === 'GET') return auditList(env, url);
  if (r0 === 'export' && method === 'GET') return exportCsv(env, url);
  if (r0 === 'users') {
    if (method === 'GET' && p.length === 1) return listUsers(env);
    if (method === 'POST' && p.length === 1) return createUser(req, env, user);
    if (method === 'POST' && p.length === 3) return userAction(req, env, user, Number(p[1]), p[2]);
  }
  if (r0 === 'khu') {
    if (method === 'POST' && p.length === 1) return khuCreate(req, env, user);
    if (method === 'PATCH' && p.length === 2) return khuUpdate(req, env, user, p[1]);
  }
  if (r0 === 'phi' && method === 'PATCH' && p.length === 2) return phiUpdate(req, env, user, p[1]);
  if (r0 === 'settings' && method === 'PUT') return settingsUpdate(req, env, user);

  throw new HttpError(404, 'Không tìm thấy');
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/') && url.pathname !== '/api') return env.ASSETS.fetch(req);
    try {
      return await handle(req, env, url);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e && e.stack ? e.stack : e);
      return json({ error: 'Lỗi máy chủ, thử lại sau' }, 500);
    }
  },
};
