// Hàm dùng chung của các API: đọc request, CSV, ghi có chốt chặn, nhật ký, phiên đăng nhập, cài đặt.
import { HttpError, SESSION_MS, bad, json, rand, sha256 } from './core.js';
import { computeReview } from './review.js';
import { settingsUpdate } from './admin.js';

export function normPhone(p) {
  const d = String(p || '').replace(/\D/g, '');
  if (d.length < 9 || d.length > 11) throw bad('Số điện thoại không hợp lệ');
  return d;
}
export function checkPin(p) {
  if (!/^\d{4}$/.test(String(p || ''))) throw bad('PIN phải gồm đúng 4 chữ số');
  if (/^(\d)\1{3}$/.test(p) || ['1234', '4321', '0123'].includes(p)) throw bad('PIN quá dễ đoán, hãy chọn số khác');
}
export const genPin = () => {
  for (;;) {
    const n = crypto.getRandomValues(new Uint32Array(1))[0] % 10000;
    const p = String(n).padStart(4, '0');
    try { checkPin(p); return p; } catch (e) { /* thử lại */ }
  }
};
// D6/D8 lưu theo "phần" (100 phần = 1 cuộn), các phi khác lưu theo cây: thông báo phải gọi đúng tên
export const isCuon = (p) => !!(p && p.unit === 'cuon');
export const unitWord = (p) => (isCuon(p) ? 'phần' : 'cây');
// tệp Excel: thép cuộn quy ra số cuộn (350 phần → 3.5), không để số phần nằm dưới chữ "cây"
export const csvUnit = (p) => (isCuon(p) ? 'cuộn' : 'cây');
/* CSV mở bằng Excel máy Việt Nam: vùng vi-VN tách cột bằng dấu ';' và hiểu '.' là phân cách NGHÌN.
   Xuất kiểu "3.01" ngăn bằng dấu phẩy thì Excel vi-VN dồn hết vào một cột, và "83.43" tấn đọc
   thành 8343 — sai 100 lần trên đúng tệp mang đi đối chiếu. Nên: dòng đầu khai 'sep=;',
   ngăn cột bằng ';', số thập phân viết dấu phẩy. Excel cả vùng Việt lẫn vùng Mỹ đều đọc đúng. */
export const CSV_SEP = ';';
export const CSV_HEAD = '\ufeffsep=;\r\n';
export const csvRow = (cells) => cells.join(CSV_SEP);
export const csvDec = (x, dp) => (x == null || x === '' ? '' : Number(x).toFixed(dp).replace('.', ','));
export const csvQty = (v, p) => (isCuon(p) ? csvDec(Math.round((v / p.bo_size) * 100) / 100, 2) : String(v));
export const boWord = (p) => (isCuon(p) ? 'Số cuộn' : 'Số bó');
export const qtyWord = (v, p) => {
  if (!isCuon(p)) return v + ' cây';
  const c = Math.floor(v / p.bo_size), r = v % p.bo_size;
  return (c ? c + ' cuộn' : '') + (c && r ? ' + ' : '') + (r || !c ? r + ' phần' : '');
};
export const intIn = (v, min, max, label) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw bad(label + ' không hợp lệ');
  return n;
};

export async function readJson(req) {
  try { return await req.json(); } catch (e) { throw bad('Dữ liệu gửi lên không hợp lệ'); }
}

export const bump = (env) => env.DB.prepare("UPDATE meta SET value = value + 1 WHERE key = 'rev'");

// Kiểm tra rồi mới ghi ở hai lượt khác nhau thì có khe hở (vd. vừa kiểm tra xong thì admin chốt ngày).
// Câu chặn đặt đầu batch: điều kiện đúng thì vi phạm NOT NULL, D1 hủy cả batch vì batch là một giao dịch.
export const guardStmt = (env, cond, ...args) =>
  env.DB.prepare(`INSERT INTO meta (key, value) SELECT 'guard', NULL WHERE ${cond}`).bind(...args);
export async function batchGuarded(env, guard, stmts, err) {
  try { return (await env.DB.batch([guard, ...stmts])).slice(1); }
  catch (e) {
    // D1 có thể đổi câu chữ thông báo lỗi: nhận diện rộng, và ghi log khi không khớp để còn biết mà sửa
    const m = String((e && e.message) || '');
    if (/NOT NULL/i.test(m) && /meta/i.test(m)) throw err;
    console.error('batchGuarded: lỗi không nhận ra', m);
    throw e;
  }
}
export const IS_CLOSED = 'EXISTS (SELECT 1 FROM day_close WHERE day = ?)';
export const closedErr = (msg) => new HttpError(409, msg || 'Ngày hôm nay vừa được chốt, không ghi được nữa', 'closed');

export function auditStmt(env, user, action, detail) {
  return env.DB.prepare('INSERT INTO audit (ts, user_id, user_name, action, detail) VALUES (?,?,?,?,?)')
    .bind(Date.now(), user ? user.id : null, user ? user.name : null, action, detail ? JSON.stringify(detail) : null);
}

// renew = false cho các lần hỏi ngầm (/rev) để không phát sinh lượt ghi
export async function auth(req, env, renew = true) {
  const m = (req.headers.get('Cookie') || '').match(/(?:^|;\s*)sid=([a-f0-9]{64})/);
  if (!m) throw new HttpError(401, 'Chưa đăng nhập');
  const th = await sha256(m[1]);
  const row = await env.DB.prepare(
    'SELECT u.id, u.name, u.phone, u.role, u.locked, u.deleted, u.must_change, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?'
  ).bind(th).first();
  // xoá tài khoản đã thu hồi mọi phiên, nhưng vẫn kiểm ở đây: phiên là thứ dùng để vào hệ thống
  if (!row || row.expires_at < Date.now() || row.locked || row.deleted) throw new HttpError(401, 'Phiên đăng nhập hết hạn');
  if (renew && row.expires_at - Date.now() < SESSION_MS / 2) {
    await env.DB.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').bind(Date.now() + SESSION_MS, th).run();
  }
  return row;
}

export function sessionCookie(url, token, maxAge) {
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  return `sid=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

/* Tên người báo. Dùng LEFT JOIN + dự phòng tên: nếu một dòng users biến mất thì INNER JOIN
   sẽ làm cả số đếm/phiếu của người đó biến khỏi màn hình trong khi vẫn nạm trong database và vẫn
   được computeReview/baseline tính — hai màn hình lệch nhau mà không ai hiểu tại sao. */
export const UNAME = "COALESCE(u.name, '(đã xoá)') uname";
/* Tên NGƯỜI DUYỆT: lấy từ bảng users qua duyet_by, không dùng duyet_name đã lưu cứng trong dòng
   số liệu. Lý do: sửa tên phải lan tới mọi chỗ hiện hoạt động, mà tài khoản hay mang tên theo
   chức danh ("admin") lại chính là tài khoản đi duyệt gần như mọi thứ — để tên cứng thì sửa tên
   xong màn Xem lại ngày cũ vẫn ghi "admin". duyet_name giữ lại làm bản lưu tên LÚC DUYỆT, và là
   đường rơi về nếu dòng users biến mất (dữ liệu cũ bị xoá tay trong database). */
export const DUYET_NAME = "COALESCE(ud.name, c.duyet_name) duyet_uname";
export const DUYET_JOIN = 'LEFT JOIN users ud ON ud.id = c.duyet_by';
// Như DUYET_NAME/DUYET_JOIN nhưng cho bảng loans (alias l), dùng ở màn Vay mượn
export const DUYET_NAME_LOAN = "COALESCE(ud.name, l.duyet_name) duyet_uname";
export const DUYET_JOIN_LOAN = 'LEFT JOIN users ud ON ud.id = l.duyet_by';
export const SETTINGS_SQL = 'SELECT key, value FROM settings';
/* work_from / work_to: giờ làm việc của bãi (giờ Việt Nam, giờ chẵn), dùng để chia khung đếm.
   Mỗi số chỉ kiểm được phạm vi riêng ở đây; điều kiện giữa hai số (bắt đầu trước kết thúc, đủ
   chỗ cho số lần đếm) kiểm trong settingsUpdate vì phải xét cả số đang lưu. */
export const WORK_DEFAULT = [6, 18];
export const SETTING_RANGE = { max_keep_streak: [1, 30], auto_close: [0, 1], report_slots_per_day: [1, 4], work_from: [0, 23], work_to: [1, 24] };
export function parseSettings(rows) {
  const o = { max_keep_streak: 3, auto_close: 0, report_slots_per_day: 1, work_from: WORK_DEFAULT[0], work_to: WORK_DEFAULT[1] };
  for (const r of rows) o[r.key] = Number(r.value);
  return o;
}

export async function createSession(env, url, req, userId) {
  const token = rand(32);
  const th = await sha256(token);
  const ua = (req.headers.get('User-Agent') || '').slice(0, 120);
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, device, created_at, expires_at) VALUES (?,?,?,?,?)')
    .bind(th, userId, ua, Date.now(), Date.now() + SESSION_MS).run();
  return sessionCookie(url, token, SESSION_MS / 1000);
}
