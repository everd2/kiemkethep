// Kho Thép Bãi - Cloudflare Worker (API) + D1
// Giao diện tĩnh nằm trong /public, mọi đường dẫn /api/* chạy qua file này.
// Điểm vào: định tuyến /api/* và việc Cron. Logic nghiệp vụ nằm ở các module cùng thư mục.
import { HttpError, bad, json, vnDay } from './core.js';
import { migrate } from './db.js';
import { auditStmt, auth, bump, readJson } from './helpers.js';
import { changePin, login, logout, recoverAdmin, setup } from './auth.js';
import { bootstrap } from './bootstrap.js';
import { conflictResolve, conflictView, putCounts, submissionsView } from './counts.js';
import { duyetReceipt, postAdjust, postReceipt, postTransfer, postXuat, voidReceipt } from './phieu.js';
import { doitacCreate, doitacUpdate, duyetLoan, loansView, postLoan, voidLoan } from './loans.js';
import { computeReview, hourly, reopenDay, reviewDuyet } from './review.js';
import { backupData, resetData, restoreData } from './data.js';
import { createUser, khuCreate, khuUpdate, khuUsers, listUsers, phiBulk, phiUpdate, seedPhiApi,
  settingsUpdate, userAction } from './admin.js';
import { auditList, dayView, exportCsv, report, usage } from './reports.js';

let schemaReady = null;
function ensureSchema(env) {
  if (!schemaReady) schemaReady = migrate(env).catch((e) => { schemaReady = null; throw e; });
  return schemaReady;
}

/* ========================= ĐỊNH TUYẾN ========================= */

async function handle(req, env, url) {
  const method = req.method;
  if (method !== 'GET' && method !== 'HEAD') {
    const o = req.headers.get('Origin');
    if (o) {
      let host = null;
      try { host = new URL(o).host; } catch (e) { /* Origin: null hoặc sai định dạng */ }
      if (host !== url.host) throw new HttpError(403, 'Yêu cầu bị từ chối');
    }
  }
  const p = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const r0 = p[0] || '';

  if (method === 'POST' && r0 === 'setup') return setup(req, env, url);
  if (method === 'POST' && r0 === 'login') return login(req, env, url);
  if (method === 'POST' && r0 === 'logout') return logout(req, env, url);
  if (method === 'POST' && r0 === 'recover') return recoverAdmin(req, env);

  // hỏi phiên bản ngầm: nhẹ nhất có thể (không gia hạn phiên, không ghi)
  if (r0 === 'rev' && method === 'GET') {
    const u = await auth(req, env, false);
    if (u.must_change) throw new HttpError(403, 'Bạn cần đổi PIN trước khi sử dụng');
    const r = await env.DB.prepare("SELECT value FROM meta WHERE key = 'rev'").first();
    return json({ rev: r ? r.value : 0, today: vnDay() });
  }

  const user = await auth(req, env);
  if (r0 === 'me' && method === 'GET') return json({ user: { id: user.id, name: user.name, role: user.role, must_change: user.must_change } });
  if (r0 === 'change-pin' && method === 'POST') return changePin(req, env, user);
  if (user.must_change) throw new HttpError(403, 'Bạn cần đổi PIN trước khi sử dụng');

  const ALL = ['admin', 'thukho', 'nguoidem'];
  const need = (roles) => { if (!roles.includes(user.role)) throw new HttpError(403, 'Bạn không có quyền thực hiện việc này'); };

  if (r0 === 'bootstrap' && method === 'GET') return json(await bootstrap(env, user));
  if (r0 === 'counts' && method === 'PUT') { need(ALL); return putCounts(req, env, user); }
  if (r0 === 'usage' && method === 'GET') return usage(env, url);
  if (r0 === 'day' && method === 'GET') return dayView(env, url);

  if (r0 === 'receipts') {
    need(['admin', 'thukho']);
    if (method === 'POST' && p.length === 1) return postReceipt(req, env, user);
    if (method === 'DELETE' && p.length === 2) return voidReceipt(env, user, Number(p[1]));
    // duyệt phiếu: chỉ admin. Mọi phiếu đều phải qua một lần bấm duyệt, kể cả phiếu admin tự nhập.
    if (method === 'POST' && p.length === 3 && p[2] === 'duyet') { need(['admin']); return duyetReceipt(env, user, Number(p[1])); }
  }
  if (r0 === 'transfers' && method === 'POST') { need(['admin', 'thukho']); return postTransfer(req, env, user); }
  /* Điều chỉnh tồn: LẬP được thì admin và thủ kho, vì người phát hiện sổ sai thường là thủ kho và
     phiếu chưa vào tồn cho tới khi được duyệt. DUYỆT thì chỉ admin, như mọi phiếu khác (chốt chặn
     nằm ở nhánh receipts/duyet bên trên). Muốn siết lại chỉ admin được lập thì bỏ 'thukho' ở đây. */
  if (r0 === 'adjust' && method === 'POST') { need(['admin', 'thukho']); return postAdjust(req, env, user); }
  if (r0 === 'xuat' && method === 'POST') { need(['admin', 'thukho']); return postXuat(req, env, user); }
  if (r0 === 'report' && method === 'GET') { need(['admin', 'thukho']); return report(env, url); }
  /* Vay mượn ngoài bãi: GHI và XEM mở cho mọi vai trò (kể cả người đếm), vì mục đích là nhiều
     người cùng chép lại ngay lúc phát sinh. DUYỆT chỉ admin, như mọi phiếu khác. Hủy/rút lại thì
     tự voidLoan kiểm quyền bên trong (người ghi hoặc admin), giống voidReceipt. */
  if (r0 === 'loans') {
    need(ALL);
    if (method === 'GET' && p.length === 1) return loansView(env, url);
    if (method === 'POST' && p.length === 1) return postLoan(req, env, user);
    if (method === 'DELETE' && p.length === 2) return voidLoan(env, user, Number(p[1]));
    if (method === 'POST' && p.length === 3 && p[2] === 'duyet') { need(['admin']); return duyetLoan(env, user, Number(p[1])); }
  }
  // Danh bạ đối tác: tạo mở cho mọi vai trò (thêm tên mới khi cần), sửa tên/ẩn chỉ admin + thủ kho
  if (r0 === 'doitac') {
    need(ALL);
    if (method === 'POST' && p.length === 1) return doitacCreate(req, env, user);
    if (method === 'PATCH' && p.length === 2) { need(['admin', 'thukho']); return doitacUpdate(req, env, user, p[1]); }
  }

  // --- chỉ admin ---
  need(['admin']);
  if (r0 === 'review' && method === 'GET') return json(await computeReview(env, vnDay()));
  if (r0 === 'review' && p[1] === 'duyet' && method === 'POST') return reviewDuyet(req, env, user);
  // không còn chốt tay (sổ tự chốt sau nửa đêm, xem hourly); "mở lại" chỉ còn để hoàn tác đặt lại số liệu
  if (r0 === 'reopen' && method === 'POST') return reopenDay(req, env, user);
  // đặt lại số liệu thép: chỉ admin đầu tiên (chốt chặn thật nằm trong resetData)
  if (r0 === 'reset' && method === 'POST') return resetData(req, env, user);
  // sao lưu / nạp lại: chốt chặn thật nằm trong backupData / restoreData
  if (r0 === 'backup' && method === 'GET') return backupData(env, user);
  if (r0 === 'restore' && method === 'POST') return restoreData(req, env, user);
  if (r0 === 'recount' && method === 'POST') {
    const b = await readJson(req);
    const day = vnDay();
    // ngày đã chốt thì người đếm không gửi số thường được nữa: cờ này chỉ treo một lời nhắc không làm được
    const res = await env.DB.prepare('UPDATE khu_report SET recount = 1 WHERE day = ? AND khu_id = ? AND NOT EXISTS (SELECT 1 FROM day_close WHERE day = ?1)')
      .bind(day, String(b.khu || '')).run();
    if (!res.meta.changes) {
      const closed = await env.DB.prepare('SELECT 1 x FROM day_close WHERE day = ?').bind(day).first();
      if (closed) throw new HttpError(409, 'Ngày đã chốt. Tải lại màn Duyệt rồi dùng "Yêu cầu đếm lại" (mở lại ngày).', 'closed');
      throw bad('Khu này chưa có báo cáo để yêu cầu đếm lại');
    }
    await env.DB.batch([bump(env), auditStmt(env, user, 'recount', { khu: b.khu })]);
    return json({ ok: true });
  }
  if (r0 === 'conflict' && !p[1] && method === 'GET') return conflictView(env, url);
  if (r0 === 'conflict' && p[1] === 'resolve' && method === 'POST') return conflictResolve(req, env, user);
  if (r0 === 'submissions' && method === 'GET') return submissionsView(env, url);
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
    if (method === 'PUT' && p.length === 3 && p[2] === 'users') return khuUsers(req, env, user, p[1]);
  }
  if (r0 === 'phi' && method === 'PATCH' && p.length === 2) return phiUpdate(req, env, user, p[1]);
  if (r0 === 'phi' && method === 'PUT' && p.length === 1) return phiBulk(req, env, user);
  if (r0 === 'phi' && method === 'POST' && p[1] === 'seed') return seedPhiApi(env, user);
  if (r0 === 'settings' && method === 'PUT') return settingsUpdate(req, env, user);

  throw new HttpError(404, 'Không tìm thấy');
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/') && url.pathname !== '/api') return env.ASSETS.fetch(req);
    try {
      await ensureSchema(env);
      return await handle(req, env, url);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message, code: e.code }, e.status);
      console.error(e && e.stack ? e.stack : e);
      return json({ error: 'Lỗi máy chủ, thử lại sau' }, 500);
    }
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(ensureSchema(env).then(() => hourly(env)).catch((e) => console.error(e && e.stack ? e.stack : e)));
  },
};
