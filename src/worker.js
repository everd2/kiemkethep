// Bãi Gia Công - Cloudflare Worker (API) + D1
// Giao diện tĩnh nằm trong /public, mọi đường dẫn /api/* chạy qua file này.
// Điểm vào: định tuyến /api/* và việc Cron. Logic nghiệp vụ nằm ở các module cùng thư mục.
import { HttpError, LAP_PHIEU, ROLES, capOf, json, vnDay } from './core.js';
import { migrate } from './db.js';
import { auth } from './helpers.js';
import { changePin, login, logout, recoverAdmin, setup } from './auth.js';
import { bootstrap } from './bootstrap.js';
import { conflictResolve, conflictView, huyBaoCao, putCounts, submissionsView } from './counts.js';
import { duyetReceipt, postAdjust, postReceipt, postTransfer, postXuat, voidReceipt } from './phieu.js';
import { doitacCreate, doitacUpdate, duyetLoan, loansCsv, loansView, postLoan, voidLoan } from './loans.js';
import { gcCreate, gcDoc, gcList, gcMucAdd, gcMucXoa, gcThuHoi, gcTn, gcTnMoi, gcUpdate, gcViec, gcView } from './giacong.js';
import { qsHan, qsLich, qsPut, qsThietLap, qsThuTu, qsView } from './quanso.js';
import { duyetSv, postSv, svCsv, svView, voidSv } from './satvun.js';
import { bcPut, bcView } from './baocao.js';
import { computeReview, hourly, reopenDay, reviewDuyet } from './review.js';
import { backupData, resetData, restoreData } from './data.js';
import { createUser, khuCreate, khuUpdate, khuUsers, listUsers, phiBulk, phiUpdate, seedPhiApi,
  settingsUpdate, userAction } from './admin.js';
import { auditList, chamCong, dayView, exportCsv, report, usage } from './reports.js';

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
    // tn: bộ đếm tin nhắn gia công (xem gcTn) — đổi thì máy chỉ hỏi lại tin chưa đọc, không tải lại cả dữ liệu
    return json({ rev: u.rev || 0, today: vnDay(), tn: u.tn || 0 });
  }

  const user = await auth(req, env);
  if (r0 === 'me' && method === 'GET') return json({ user: { id: user.id, name: user.name, role: user.role, chuc_danh: user.chuc_danh || null, must_change: user.must_change } });
  if (r0 === 'change-pin' && method === 'POST') return changePin(req, env, user);
  if (user.must_change) throw new HttpError(403, 'Bạn cần đổi PIN trước khi sử dụng');
  const res = await route(req, env, url, user, method, p, r0);
  return method === 'GET' ? res : kemSau(req, env, url, user, r0, res);
}

/* TẢI LẠI KÈM LỆNH GHI. Sau mỗi lần lưu, máy khách phải tải lại dữ liệu chung và màn đang đứng; làm bằng request
   riêng thì mỗi lần lưu là 2–3 vòng mạng nối nhau, mà ngoài bãi sóng yếu mỗi vòng có khi vài giây và màn hình đứng ở
   "Đang lưu..." suốt lúc đó. Nên máy khách gửi kèm lệnh ghi tiêu đề X-Kem: các đường GET nó sắp gọi (tối đa 3, vd
   "/bootstrap,/review"); ghi xong, server chạy luôn các đường đó — QUA ĐÚNG route(), nên quyền hạn kiểm y như một
   lần GET thường — và trả kết quả trong khoá `sau` của câu trả lời. Một lần lưu còn đúng MỘT vòng mạng.
   Phần kèm hỏng (lỗi, hết hạn mức) thì bỏ qua: lệnh ghi đã xong, máy khách không thấy `sau` sẽ tự GET như trước.
   Không kèm cho lệnh ghi vào /users (đổi tên, vai trò của chính người đang gọi thì dòng `user` đọc lúc xác thực đã
   cũ) và /restore (cả bảng tài khoản bị thay). */
const KEM_DUOC = ['bootstrap', 'review', 'giacong', 'quanso', 'satvun', 'loans'];
async function kemSau(req, env, url, user, r0, res) {
  const h = req.headers.get('X-Kem');
  if (!h || !res.ok || r0 === 'users' || r0 === 'restore') return res;
  if (!(res.headers.get('Content-Type') || '').startsWith('application/json')) return res;
  let d;
  try { d = await res.clone().json(); } catch (e) { return res; }
  if (!d || typeof d !== 'object' || Array.isArray(d)) return res;
  const paths = [...new Set(h.split(',').map((s) => s.trim()).filter((s) => s.startsWith('/')))].slice(0, 3);
  const sau = {};
  await Promise.all(paths.map(async (path) => {
    try {
      const u = new URL('/api' + path, url.origin);
      const pp = u.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
      if (!KEM_DUOC.includes(pp[0]) || pp.includes('export')) return;
      const r = await route(new Request(u, { method: 'GET' }), env, u, user, 'GET', pp, pp[0]);
      if (r.ok) sau[path] = await r.json();
    } catch (e) {
      if (!(e instanceof HttpError)) console.error('kemSau', path, e && e.stack ? e.stack : e);
    }
  }));
  return json({ ...d, sau });
}

async function route(req, env, url, user, method, p, r0) {
  const ALL = ROLES;
  const need = (roles) => { if (!roles.includes(user.role)) throw new HttpError(403, 'Bạn không có quyền thực hiện việc này'); };
  // cấp duyệt tối thiểu (xem CAP ở core.js). Duyệt được việc CỦA AI thì từng hàm tự kiểm theo người báo.
  const needCap = (n) => { if (capOf(user.role) < n) throw new HttpError(403, 'Bạn không có quyền thực hiện việc này'); };

  if (r0 === 'bootstrap' && method === 'GET') return json(await bootstrap(env, user));
  if (r0 === 'counts' && method === 'PUT') { need(ALL); return putCounts(req, env, user); }
  if (r0 === 'usage' && method === 'GET') return usage(env, url);
  if (r0 === 'day' && method === 'GET') return dayView(env, url);

  if (r0 === 'receipts') {
    need(LAP_PHIEU);
    if (method === 'POST' && p.length === 1) return postReceipt(req, env, user);
    if (method === 'DELETE' && p.length === 2) return voidReceipt(env, user, Number(p[1]));
    /* Duyệt phiếu kho: chỉ cấp chỉ huy (Trung đội trưởng, Đại đội trưởng, admin). Mọi phiếu đều phải
       qua một lần bấm duyệt, kể cả phiếu cấp chỉ huy tự nhập. */
    if (method === 'POST' && p.length === 3 && p[2] === 'duyet') { needCap(2); return duyetReceipt(env, user, Number(p[1])); }
  }
  if (r0 === 'transfers' && method === 'POST') { need(LAP_PHIEU); return postTransfer(req, env, user); }
  /* Điều chỉnh tồn: LẬP được thì mọi vai trò lập phiếu, vì người phát hiện sổ sai thường là
     CVKTHT và phiếu chưa vào tồn cho tới khi được duyệt. DUYỆT thì chỉ cấp chỉ huy, như mọi phiếu
     khác (chốt chặn nằm ở nhánh receipts/duyet bên trên). */
  if (r0 === 'adjust' && method === 'POST') { need(LAP_PHIEU); return postAdjust(req, env, user); }
  if (r0 === 'xuat' && method === 'POST') { need(LAP_PHIEU); return postXuat(req, env, user); }
  if (r0 === 'report' && method === 'GET') { need(LAP_PHIEU); return report(env, url); }
  /* Vay mượn ngoài bãi: GHI và XEM mở cho mọi vai trò (kể cả Tiểu đội trưởng), vì mục đích là nhiều
     người cùng chép lại ngay lúc phát sinh. DUYỆT theo cấp bậc, như mọi phiếu khác. Huỷ/rút lại thì
     tự voidLoan kiểm quyền bên trong (người ghi hoặc người duyệt được), giống voidReceipt. */
  if (r0 === 'loans') {
    need(ALL);
    if (method === 'GET' && p.length === 1) return loansView(env, url);
    // tệp Excel của cả sổ: cho người đi đối chiếu công nợ với đối tác (từ CVKTHT, như báo cáo kỳ)
    if (method === 'GET' && p.length === 2 && p[1] === 'export') { need(LAP_PHIEU); return loansCsv(env); }
    if (method === 'POST' && p.length === 1) return postLoan(req, env, user);
    if (method === 'DELETE' && p.length === 2) return voidLoan(req, env, user, Number(p[1]));
    if (method === 'POST' && p.length === 3 && p[2] === 'duyet') { needCap(1); return duyetLoan(env, user, Number(p[1])); }
  }
  /* Sổ xuất sắt vụn: như sổ vay mượn — ai cũng ghi và xem được, duyệt theo cấp bậc, tệp Excel từ CVKTHT. */
  if (r0 === 'satvun') {
    need(ALL);
    if (method === 'GET' && p.length === 1) return svView(env, url);
    if (method === 'GET' && p.length === 2 && p[1] === 'export') { need(LAP_PHIEU); return svCsv(env); }
    if (method === 'POST' && p.length === 1) return postSv(req, env, user);
    if (method === 'DELETE' && p.length === 2) return voidSv(req, env, user, Number(p[1]));
    if (method === 'POST' && p.length === 3 && p[2] === 'duyet') { needCap(1); return duyetSv(env, user, Number(p[1])); }
  }
  // Danh bạ đối tác: tạo mở cho mọi vai trò (thêm tên mới khi cần), sửa tên/ẩn thì trừ Tiểu đội trưởng
  if (r0 === 'doitac') {
    need(ALL);
    if (method === 'POST' && p.length === 1) return doitacCreate(req, env, user);
    if (method === 'PATCH' && p.length === 2) { need(LAP_PHIEU); return doitacUpdate(req, env, user, p[1]); }
  }
  /* Gia công cấu kiện: XEM mở cho mọi vai trò (bảng đơn là bảng chung của cả đơn vị). GIAO và SỬA đơn
     từ CVKTHT trở lên. Việc trên từng đơn thì gcViec tự kiểm: người được giao (nhận, tiến độ, vướng,
     xong) hoặc CVKTHT trở lên (huỷ, mở lại). */
  if (r0 === 'giacong') {
    need(ALL);
    // danh mục chọn nhanh (phân khu, hạng mục, loại cấu kiện): admin lập trước, mọi người nhận kèm trong gcList
    if (p[1] === 'muc') {
      need(['admin']);
      if (method === 'POST' && p.length === 2) return gcMucAdd(req, env, user);
      if (method === 'DELETE' && p.length === 3) return gcMucXoa(env, user, Number(p[2]));
      throw new HttpError(404, 'Không tìm thấy');
    }
    if (method === 'GET' && p.length === 1) return gcList(env);
    // trao đổi trên đơn: ai viết được thì gcTn tự kiểm (người trong đơn hoặc CVKTHT trở lên)
    if (method === 'GET' && p.length === 2 && p[1] === 'tnmoi') return gcTnMoi(env, user);
    if (method === 'POST' && p.length === 3 && p[2] === 'tn') return gcTn(req, env, user, Number(p[1]));
    if (method === 'POST' && p.length === 5 && p[2] === 'tn' && p[4] === 'thuhoi') return gcThuHoi(env, user, Number(p[1]), Number(p[3]));
    if (method === 'POST' && p.length === 3 && p[2] === 'doc') return gcDoc(req, env, user, Number(p[1]));
    if (method === 'GET' && p.length === 2) return gcView(env, Number(p[1]), user);
    if (method === 'POST' && p.length === 1) { needCap(1); return gcCreate(req, env, user); }
    if (method === 'PATCH' && p.length === 2) { needCap(1); return gcUpdate(req, env, user, Number(p[1])); }
    if (method === 'POST' && p.length === 3) return gcViec(req, env, user, Number(p[1]), p[2]);
  }
  /* Quân số đầu ca: mọi vai trò vào được, nhưng Tiểu đội trưởng chỉ xem và ghi tổ mình; CVKTHT trở lên xem
     mọi tổ và ghi thay được. qsView / qsPut tự kiểm (theo người, theo ca). */
  if (r0 === 'quanso') {
    need(ALL);
    if (method === 'GET' && p.length === 1) return qsView(env, user, url);
    if (method === 'PUT' && p.length === 1) return qsPut(req, env, user);
    // hạn báo của hai ca: người gom quân số (CVKTHT trở lên) tự đặt, không phải chờ admin
    if (method === 'PUT' && p.length === 2 && p[1] === 'han') { needCap(1); return qsHan(req, env, user); }
    // thứ tự tổ trên bảng quân số và báo cáo ca: CVKTHT trở lên xếp
    if (method === 'PUT' && p.length === 2 && p[1] === 'thutu') { needCap(1); return qsThuTu(req, env, user); }
    // lịch ca: tổ trưởng đặt cho tổ mình, CVKTHT đặt hộ (qsLich tự kiểm); số thiết lập: CVKTHT trở lên
    if (method === 'PUT' && p.length === 2 && p[1] === 'lich') return qsLich(req, env, user);
    if (method === 'PUT' && p.length === 2 && p[1] === 'thietlap') { needCap(1); return qsThietLap(req, env, user); }
  }

  /* --- DUYỆT và GIÁM SÁT: từ CVKTHT trở lên ---
     Vào được màn Duyệt chưa có nghĩa là duyệt được mọi thứ trên đó: reviewDuyet và huyBaoCao kiểm
     tiếp theo người báo (CVKTHT chỉ duyệt/huỷ báo cáo của cấp dưới). */
  needCap(1);
  if (r0 === 'review' && method === 'GET') return json(await computeReview(env, vnDay()));
  // báo cáo ca gửi cấp trên: CVKTHT trở lên soạn (gom quân số đầu ca + gia công theo mẫu), xem src/baocao.js
  if (r0 === 'baocao' && !p[1] && method === 'GET') return bcView(env, url);
  if (r0 === 'baocao' && !p[1] && method === 'PUT') return bcPut(req, env, user);
  if (r0 === 'review' && p[1] === 'duyet' && method === 'POST') return reviewDuyet(req, env, user);
  // huỷ báo cáo đang chờ duyệt của một khu, kèm lý do. Giữ đường dẫn /recount: bản app cũ còn trong
  // cache gọi tới sẽ bị đòi lý do (400) thay vì lặng lẽ treo một lá cờ không còn ai đọc.
  if (r0 === 'recount' && method === 'POST') return huyBaoCao(req, env, user);
  if (r0 === 'conflict' && !p[1] && method === 'GET') return conflictView(env, url);
  if (r0 === 'conflict' && p[1] === 'resolve' && method === 'POST') return conflictResolve(req, env, user);
  if (r0 === 'submissions' && method === 'GET') return submissionsView(env, url);
  if (r0 === 'audit' && method === 'GET') return auditList(env, url);
  // chấm công báo cáo: ai báo, ai không báo, khu thiếu buổi nào
  if (r0 === 'cham-cong' && method === 'GET') return chamCong(env, url);
  if (r0 === 'export' && method === 'GET') return exportCsv(env, url);

  /* --- HỆ THỐNG: chỉ vai trò admin (việc của người quản lý app, như IT) ---
     Tài khoản, khu và phân công, phi, quy tắc, dữ liệu. Cấp chỉ huy duyệt được hết nhưng không
     đụng tới phần này. */
  need(['admin']);
  // không còn chốt tay (sổ tự chốt sau nửa đêm, xem hourly); "mở lại" chỉ còn để hoàn tác đặt lại số liệu
  if (r0 === 'reopen' && method === 'POST') return reopenDay(req, env, user);
  // đặt lại số liệu thép: chỉ admin đầu tiên (chốt chặn thật nằm trong resetData)
  if (r0 === 'reset' && method === 'POST') return resetData(req, env, user);
  // sao lưu / nạp lại: chốt chặn thật nằm trong backupData / restoreData
  if (r0 === 'backup' && method === 'GET') return backupData(env, user);
  if (r0 === 'restore' && method === 'POST') return restoreData(req, env, user);
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
