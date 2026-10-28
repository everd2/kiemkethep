// Đăng nhập, đổi PIN, thiết lập admin đầu tiên.
import { HttpError, IP_FAIL_MAX, LOCK_AFTER, LOCK_STEPS, bad, gioVN, hashPin, json, rand, safeEq, sha256,
  vnDay } from './core.js';
import { auditStmt, checkPin, createSession, normPhone, readJson, sessionCookie } from './helpers.js';

/* ========================= ĐĂNG NHẬP ========================= */

const REC_FAIL_MAX = 20; // số lần thử sai token khôi phục tối đa mỗi địa chỉ mỗi ngày

/* Tính lượt thử TRƯỚC khi băm PIN, bằng một câu nguyên tử: gửi hàng loạt yêu cầu song song cũng chỉ
   được đúng LOCK_AFTER lượt, mọi lượt dư bị từ chối mà không được thử PIN. Trả null nếu tài khoản
   đã khoá hoặc hết lượt (người gọi trả 429). Đúng PIN thì người gọi đặt lại về 0. */
async function lanThu(env, uid) {
  const r = await env.DB.prepare('UPDATE users SET fail_count = fail_count + 1 WHERE id = ? AND locked_until <= ? AND fail_count < ? RETURNING fail_count')
    .bind(uid, Date.now(), LOCK_AFTER).first();
  return r ? r.fail_count : null;
}
const khoaTxt = (u) => {
  const mins = Math.max(1, Math.ceil((u.locked_until - Date.now()) / 60000));
  return `Nhập sai nhiều lần, thử lại sau ${mins >= 120 ? Math.ceil(mins / 60) + ' giờ' : mins + ' phút'}`;
};

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
  // một câu duy nhất: hai yêu cầu thiết lập cùng lúc thì chỉ một người thành admin
  const r = await env.DB.prepare(
    "INSERT INTO users (name, phone, role, pin_salt, pin_hash, must_change, created_at) SELECT ?,?,'admin',?,?,0,? WHERE NOT EXISTS (SELECT 1 FROM users)"
  ).bind(name, phone, salt, hash, Date.now()).run();
  if (!r.meta.changes) throw new HttpError(403, 'Hệ thống đã được thiết lập');
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
  const today = gioVN(); // đếm theo giờ (xem IP_FAIL_MAX)
  /* GIỮ CHỖ một lượt của địa chỉ TRƯỚC khi thử PIN, cộng rồi đọc trong cùng một batch (một giao dịch). Trước đây đọc số đếm
     lúc đầu rồi chỉ cộng SAU khi băm PIN: 150 yêu cầu song song đều đọc thấy "chưa tới 60" và đều được thử (30 máy, mỗi máy
     dưới ngưỡng khoá riêng = 150 PIN). Nay lượt thứ IP_FAIL_MAX + 1 trở đi thấy n vượt trần ngay, bị từ chối mà không băm.
     Lượt không phải đoán PIN (đúng PIN, tài khoản đang khoá) TRẢ LẠI chỗ đã giữ (traIp), nên trần vẫn chỉ đếm lần sai. Đăng
     nhập đúng không thêm lượt gọi D1 nào: giữ chỗ đi chung batch đọc tài khoản, trả lại đi chung batch ghi đăng nhập. */
  const [, uR, ipR] = await env.DB.batch([
    env.DB.prepare('INSERT INTO login_fail (ip, day, n) VALUES (?,?,1) ON CONFLICT(ip, day) DO UPDATE SET n = n + 1').bind(ip, today),
    env.DB.prepare('SELECT * FROM users WHERE phone = ?').bind(phone),
    env.DB.prepare('SELECT n FROM login_fail WHERE ip = ? AND day = ?').bind(ip, today),
  ]);
  // vượt trần: chỗ vừa giữ để nguyên (đằng nào cũng bị chặn tới hết giờ), không trả lại để khỏi mở thêm chỗ cho lượt khác
  if (ipR.results[0] && ipR.results[0].n > IP_FAIL_MAX) throw new HttpError(429, 'Mạng này vừa nhập sai PIN quá nhiều lần, hãy thử lại sau ít phút (tối đa một giờ) hoặc báo admin');
  const traIp = env.DB.prepare('UPDATE login_fail SET n = n - 1 WHERE ip = ? AND day = ? AND n > 0').bind(ip, today);
  const u = uR.results[0];
  if (!u) throw fail(); // số không có tài khoản: chỗ đã giữ tính là một lần sai
  /* Tài khoản đã xoá: trả lời y như sai PIN, không nói "tài khoản đã xoá". Nói rõ là tiết lộ
     số điện thoại nào từng có tài khoản cho người đang dò. Người bị xoá thật thì hỏi admin. */
  if (u.deleted) throw fail();
  if (u.locked) { await traIp.run(); throw new HttpError(403, 'Tài khoản đã bị khoá, liên hệ admin'); }
  if (u.locked_until > Date.now()) {
    await traIp.run();
    const mins = Math.ceil((u.locked_until - Date.now()) / 60000);
    throw new HttpError(429, `Nhập sai nhiều lần, thử lại sau ${mins >= 120 ? Math.ceil(mins / 60) + ' giờ' : mins + ' phút'}`);
  }
  const n = await lanThu(env, u.id);
  if (n === null) { await traIp.run(); throw new HttpError(429, 'Đang có quá nhiều lượt thử, hãy đợi một lát rồi thử lại'); }
  const ok = safeEq(await hashPin(env, u.pin_salt, pin), u.pin_hash);
  if (!ok) {
    const ua = (req.headers.get('User-Agent') || '').slice(0, 80);
    if (n >= LOCK_AFTER) {
      const level = u.lock_level || 0;
      const ms = LOCK_STEPS[Math.min(level, LOCK_STEPS.length - 1)];
      await env.DB.batch([
        env.DB.prepare('UPDATE users SET fail_count = 0, locked_until = ?, lock_level = ? WHERE id = ?').bind(Date.now() + ms, level + 1, u.id),
        auditStmt(env, u, 'login_locked', { phone, mins: ms / 60e3, ip }),
      ]);
    } else {
      await auditStmt(env, u, 'login_fail', { n, ua, ip }).run();
    }
    throw fail(); // sai PIN: chỗ đã giữ ở login_fail chính là lần sai này
  }
  const cookie = await createSession(env, url, req, u.id);
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET fail_count = 0, locked_until = 0, lock_level = 0 WHERE id = ?').bind(u.id),
    auditStmt(env, u, 'login', { ua: (req.headers.get('User-Agent') || '').slice(0, 80) }),
    traIp,
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
  /* Thử token khôi phục cũng có trần theo địa chỉ mỗi ngày (dùng chung bảng login_fail, khoá riêng 'rec:'): token dài nên
     khó đoán, nhưng thử sai không được là miễn phí và không để lại dấu vết nào. */
  const ip = 'rec:' + (req.headers.get('CF-Connecting-IP') || 'unknown'), today = vnDay();
  /* Giữ chỗ TRƯỚC khi so token, cộng rồi đọc trong một batch — y như đăng nhập (xem login): đọc trước rồi chỉ cộng khi sai
     thì gửi song song hàng trăm token cùng lúc đều đọc thấy "chưa tới trần" và đều được so. Token đúng thì trả lại chỗ. */
  const [, demR] = await env.DB.batch([
    env.DB.prepare('INSERT INTO login_fail (ip, day, n) VALUES (?,?,1) ON CONFLICT(ip, day) DO UPDATE SET n = n + 1').bind(ip, today),
    env.DB.prepare('SELECT n FROM login_fail WHERE ip = ? AND day = ?').bind(ip, today),
  ]);
  if (demR.results[0] && demR.results[0].n > REC_FAIL_MAX) throw new HttpError(429, 'Thử token sai quá nhiều lần hôm nay, hãy thử lại vào ngày mai');
  if (!b.token || !safeEq(String(b.token), env.RECOVERY_TOKEN)) throw new HttpError(403, 'Token không đúng');
  // token đúng: không phải lần thử sai, trả lại chỗ (lần khôi phục rất hiếm, thêm một lượt ghi không đáng kể)
  await env.DB.prepare('UPDATE login_fail SET n = n - 1 WHERE ip = ? AND day = ? AND n > 0').bind(ip, today).run();
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
  /* Nhập sai "PIN hiện tại" tính vào đúng bộ đếm / khoá của đăng nhập (fail_count, locked_until): không thì ai cầm máy
     đang mở sẵn dò được PIN không giới hạn. Đang bị khoá thì không cho thử. */
  if (u.locked_until > Date.now()) throw new HttpError(429, khoaTxt(u));
  /* PIN MỚI sai luật (quá dễ, trùng PIN cũ) kiểm TRƯỚC khi đếm lượt thử: đó không phải đoán PIN. Trước đây kiểm sau, người mới
     thử 1234 / 1111 năm lần là bộ đếm đầy mà không gì đặt lại — tài khoản bị khoá luôn, cả đăng nhập. */
  const np = String(b.newPin || '');
  checkPin(np);
  if (np === String(b.pin)) throw bad('PIN mới phải khác PIN cũ');
  const n = await lanThu(env, u.id);
  if (n === null) throw new HttpError(429, 'Đang có quá nhiều lượt thử, hãy đợi một lát rồi thử lại');
  if (!safeEq(await hashPin(env, u.pin_salt, String(b.pin || '')), u.pin_hash)) {
    if (n >= LOCK_AFTER) {
      const level = u.lock_level || 0;
      const ms = LOCK_STEPS[Math.min(level, LOCK_STEPS.length - 1)];
      await env.DB.batch([
        env.DB.prepare('UPDATE users SET fail_count = 0, locked_until = ?, lock_level = ? WHERE id = ?').bind(Date.now() + ms, level + 1, u.id),
        auditStmt(env, u, 'login_locked', { phone: u.phone, mins: ms / 60e3, ip: req.headers.get('CF-Connecting-IP') || 'unknown', qua: 'change_pin' }),
      ]);
    } else {
      await auditStmt(env, u, 'login_fail', { n, qua: 'change_pin' }).run();
    }
    throw new HttpError(401, 'PIN hiện tại không đúng');
  }
  const salt = rand(16);
  // PIN đổi thì các máy khác đang đăng nhập bằng PIN cũ phải đăng nhập lại; giữ phiên của máy đang đổi
  const m = (req.headers.get('Cookie') || '').match(/(?:^|;\s*)sid=([a-f0-9]{64})/);
  const giu = m ? await sha256(m[1]) : '';
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET pin_salt = ?, pin_hash = ?, must_change = 0, fail_count = 0 WHERE id = ?').bind(salt, await hashPin(env, salt, np), user.id),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?').bind(user.id, giu),
    auditStmt(env, user, 'change_pin', null),
  ]);
  return json({ ok: true });
}
