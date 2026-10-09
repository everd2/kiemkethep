// Đăng nhập, đổi PIN, thiết lập admin đầu tiên.
import { HttpError, IP_FAIL_MAX, LOCK_AFTER, LOCK_STEPS, bad, hashPin, json, rand, safeEq, sha256,
  vnDay } from './core.js';
import { auditStmt, checkPin, createSession, normPhone, readJson, sessionCookie } from './helpers.js';

/* ========================= ĐĂNG NHẬP ========================= */

export async function setup(req, env, url) {
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

export async function login(req, env, url) {
  if (!env.PEPPER) throw new HttpError(500, 'Chưa cấu hình PEPPER');
  const b = await readJson(req);
  const phone = String(b.phone || '').replace(/\D/g, '');
  const pin = String(b.pin || '');
  const fail = () => new HttpError(401, 'Sai số điện thoại hoặc PIN');
  const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
  const today = vnDay();
  const [uR, ipR] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM users WHERE phone = ?').bind(phone),
    env.DB.prepare('SELECT n FROM login_fail WHERE ip = ? AND day = ?').bind(ip, today),
  ]);
  if (ipR.results[0] && ipR.results[0].n >= IP_FAIL_MAX) throw new HttpError(429, 'Thiết bị này nhập sai quá nhiều lần hôm nay, hãy thử lại vào ngày mai hoặc báo admin');
  // chỉ ghi khi nhập sai, đăng nhập đúng không tốn lượt ghi
  const ipFail = env.DB.prepare('INSERT INTO login_fail (ip, day, n) VALUES (?,?,1) ON CONFLICT(ip, day) DO UPDATE SET n = n + 1').bind(ip, today);
  const u = uR.results[0];
  if (!u) { await ipFail.run(); throw fail(); }
  /* Tài khoản đã xoá: trả lời y như sai PIN, không nói "tài khoản đã xoá". Nói rõ là tiết lộ
     số điện thoại nào từng có tài khoản cho người đang dò. Người bị xoá thật thì hỏi admin. */
  if (u.deleted) { await ipFail.run(); throw fail(); }
  if (u.locked) throw new HttpError(403, 'Tài khoản đã bị khóa, liên hệ admin');
  if (u.locked_until > Date.now()) {
    const mins = Math.ceil((u.locked_until - Date.now()) / 60000);
    throw new HttpError(429, `Nhập sai nhiều lần, thử lại sau ${mins >= 120 ? Math.ceil(mins / 60) + ' giờ' : mins + ' phút'}`);
  }
  const ok = safeEq(await hashPin(env, u.pin_salt, pin), u.pin_hash);
  if (!ok) {
    const n = u.fail_count + 1;
    const ua = (req.headers.get('User-Agent') || '').slice(0, 80);
    if (n >= LOCK_AFTER) {
      const level = u.lock_level || 0;
      const ms = LOCK_STEPS[Math.min(level, LOCK_STEPS.length - 1)];
      await env.DB.batch([
        env.DB.prepare('UPDATE users SET fail_count = 0, locked_until = ?, lock_level = ? WHERE id = ?').bind(Date.now() + ms, level + 1, u.id),
        auditStmt(env, u, 'login_locked', { phone, mins: ms / 60e3, ip }),
        ipFail,
      ]);
    } else {
      await env.DB.batch([
        env.DB.prepare('UPDATE users SET fail_count = ? WHERE id = ?').bind(n, u.id),
        auditStmt(env, u, 'login_fail', { n, ua, ip }),
        ipFail,
      ]);
    }
    throw fail();
  }
  const cookie = await createSession(env, url, req, u.id);
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET fail_count = 0, locked_until = 0, lock_level = 0 WHERE id = ?').bind(u.id),
    auditStmt(env, u, 'login', { ua: (req.headers.get('User-Agent') || '').slice(0, 80) }),
  ]);
  return json({ user: { id: u.id, name: u.name, role: u.role, must_change: u.must_change } }, 200, { 'Set-Cookie': cookie });
}

export async function logout(req, env, url) {
  const m = (req.headers.get('Cookie') || '').match(/(?:^|;\s*)sid=([a-f0-9]{64})/);
  if (m) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(m[1])).run();
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(url, '', 0) });
}

export async function recoverAdmin(req, env) {
  if (!env.RECOVERY_TOKEN || !env.PEPPER) throw new HttpError(503, 'Chưa cấu hình recovery');
  const b = await readJson(req);
  if (!b.token || !safeEq(String(b.token), env.RECOVERY_TOKEN)) throw new HttpError(403, 'Token không đúng');
  const phone = String(b.phone || '').replace(/\D/g, '');
  if (!phone) throw bad('Thiếu số điện thoại');
  const np = String(b.newPin || '');
  checkPin(np);
  const u = await env.DB.prepare('SELECT * FROM users WHERE phone = ? AND role = ? AND deleted = 0').bind(phone, 'admin').first();
  if (!u) throw new HttpError(404, 'Không tìm thấy tài khoản admin với số điện thoại này');
  const salt = rand(16);
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET pin_salt=?, pin_hash=?, must_change=0, fail_count=0, locked_until=0, lock_level=0 WHERE id=?').bind(salt, await hashPin(env, salt, np), u.id),
    env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(u.id),
    auditStmt(env, u, 'recover_pin', { ip: req.headers.get('CF-Connecting-IP') || 'unknown' }),
  ]);
  return json({ ok: true, name: u.name });
}

export async function changePin(req, env, user) {
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
