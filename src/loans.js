// Sổ vay mượn thép với đối tác ngoài bãi (không tính vào tồn).
import { HttpError, bad, json, rand } from './core.js';
import { DUYET_JOIN_LOAN, DUYET_NAME_LOAN, UNAME, auditStmt, bump, intIn, readJson, unitWord } from './helpers.js';
import { J } from './counts.js';
import { parseLines, voidReceipt } from './phieu.js';

/* ========================= VAY MƯỢN NGOÀI BÃI =========================
   Sổ công nợ thép với đối tác NGOÀI bãi — KHÔNG đụng tới tồn kho (counts/receipts), xem chú thích
   đầu bảng loans trong schema.sql: thép di chuyển qua cổng thật thì vẫn phải lập phiếu Nhập/Xuất
   như thường, sổ này chỉ nhớ "ai đang giữ thép của ai". Ai cũng GHI được (kể cả người đếm), vì
   mục đích là nhiều người cùng chép lại ngay lúc phát sinh, tránh quên — nhưng admin vẫn phải
   DUYỆT từng lần ghi, như mọi phiếu khác, để số liệu chính thức luôn qua tay admin.
   kind: 'vay' + 'tra_vay' là một cặp (mình nợ đối tác), 'cho_vay' + 'tra_no' là cặp còn lại (đối
   tác nợ mình) — hai cặp tính riêng, vì cùng một đối tác có thể vừa đang vay mình D16 vừa đang
   được mình cho vay D18 cùng lúc. */
export const LOAN_KINDS = ['vay', 'tra_vay', 'cho_vay', 'tra_no'];
export const LOAN_ACTION = { vay: 'loan_vay', tra_vay: 'loan_tra_vay', cho_vay: 'loan_cho_vay', tra_no: 'loan_tra_no' };

export async function doitacCreate(req, env, user) {
  const b = await readJson(req);
  const name = String(b.name || '').trim().slice(0, 60);
  if (!name) throw bad('Cần nhập tên đối tác');
  const dup = await env.DB.prepare('SELECT id FROM doitac WHERE name = ? COLLATE NOCASE').bind(name).first();
  if (dup) throw bad('Đối tác này đã có trong danh sách');
  const res = await env.DB.batch([
    env.DB.prepare('INSERT INTO doitac (name, active) VALUES (?, 1)').bind(name),
    auditStmt(env, user, 'doitac_create', { name }),
    bump(env),
  ]);
  return json({ ok: true, id: res[0].meta.last_row_id });
}

export async function doitacUpdate(req, env, user, id) {
  const d = await env.DB.prepare('SELECT * FROM doitac WHERE id = ?').bind(Number(id)).first();
  if (!d) throw new HttpError(404, 'Không tìm thấy đối tác');
  const b = await readJson(req);
  const name = b.name !== undefined ? String(b.name).trim().slice(0, 60) || d.name : d.name;
  if (name.toLowerCase() !== d.name.toLowerCase()) {
    const dup = await env.DB.prepare('SELECT id FROM doitac WHERE name = ? COLLATE NOCASE AND id <> ?').bind(name, d.id).first();
    if (dup) throw bad('Tên này đã dùng cho một đối tác khác');
  }
  const active = b.active !== undefined ? (b.active ? 1 : 0) : d.active;
  await env.DB.batch([
    env.DB.prepare('UPDATE doitac SET name = ?, active = ? WHERE id = ?').bind(name, active, d.id),
    auditStmt(env, user, 'doitac_update', { id: d.id, name, active }),
    bump(env),
  ]);
  return json({ ok: true });
}

// Đọc danh sách dòng { phi, qty } của một lần ghi — giống parseLines của receipts nhưng không cần ctx.khu
export function parseLoanLines(b, phiBy) {
  const raw = Array.isArray(b.lines) ? b.lines : b.phi !== undefined ? [{ phi: b.phi, qty: b.qty }] : [];
  if (!raw.length) throw bad('Chưa có dòng nào');
  if (raw.length > 30) throw bad('Một lần ghi tối đa 30 dòng');
  const sum = {};
  for (const it of raw) {
    const phi = String((it && it.phi) || '');
    if (!phiBy[phi]) throw bad('Phi không hợp lệ: ' + phi);
    sum[phi] = (sum[phi] || 0) + intIn(it.qty, 1, 99999, 'Số ' + unitWord(phiBy[phi]) + ' của ' + phi);
  }
  return Object.entries(sum).map(([phi, qty]) => ({ phi, qty }));
}

export async function postLoan(req, env, user) {
  const b = await readJson(req);
  const kind = String(b.kind || '');
  if (!LOAN_KINDS.includes(kind)) throw bad('Chưa chọn loại vay/mượn hợp lệ');
  const doitacId = intIn(b.doitac, 1, 1e9, 'Đối tác');
  const [dR, phiR] = await env.DB.batch([
    env.DB.prepare('SELECT id, name, active FROM doitac WHERE id = ?').bind(doitacId),
    env.DB.prepare('SELECT id, bo_size, unit FROM phi WHERE active = 1'),
  ]);
  const d = dR.results[0];
  if (!d) throw bad('Đối tác không hợp lệ');
  if (!d.active) throw bad('Đối tác này đã ẩn, không ghi thêm được. Hãy hiện lại ở màn Vay mượn trước');
  const phiBy = Object.fromEntries(phiR.results.map((r) => [r.id, r]));
  const lines = parseLoanLines(b, phiBy);
  const note = String(b.note || '').trim().slice(0, 200);
  const grp = rand(8);
  const ts = Date.now();
  const data = JSON.stringify(lines);
  const res = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO loans (doitac_id, phi_id, kind, qty, note, grp, user_id, ts)
       SELECT ?1, ${J('phi')}, ?2, ${J('qty')}, ?3, ?4, ?5, ?6 FROM json_each(?7) j`
    ).bind(doitacId, kind, note, grp, user.id, ts, data),
    auditStmt(env, user, LOAN_ACTION[kind], { doitac: d.name, lines, note, grp }),
    bump(env),
    env.DB.prepare('SELECT id FROM loans WHERE grp = ?').bind(grp),
  ]);
  const ids = res[3].results.map((r) => r.id);
  return json({ ok: true, grp, ids });
}

export async function duyetLoan(env, user, id) {
  const r = await env.DB.prepare('SELECT * FROM loans WHERE id = ?').bind(id).first();
  if (!r) throw new HttpError(404, 'Không tìm thấy dòng vay/mượn');
  if (r.voided) throw bad('Dòng này đã bị hủy, không duyệt được');
  if (r.duyet_ts) throw bad('Dòng này đã được duyệt');
  const ts = Date.now();
  await env.DB.batch([
    r.grp
      ? env.DB.prepare('UPDATE loans SET duyet_ts = ?, duyet_by = ?, duyet_name = ? WHERE grp = ? AND voided = 0 AND duyet_ts IS NULL')
        .bind(ts, user.id, user.name, r.grp)
      : env.DB.prepare('UPDATE loans SET duyet_ts = ?, duyet_by = ?, duyet_name = ? WHERE id = ?')
        .bind(ts, user.id, user.name, id),
    auditStmt(env, user, 'loan_duyet', { id, grp: r.grp, kind: r.kind, doitac_id: r.doitac_id }),
    bump(env),
  ]);
  return json({ ok: true });
}

// Hủy theo nhóm (grp), giống voidReceipt: chờ duyệt thì người ghi rút lại bất cứ lúc nào, đã
// duyệt thì chỉ trong 10 phút kể từ lúc duyệt, sau đó nhờ admin. Không có khái niệm "ngày chốt"
// ở đây nên không cần chốt chặn theo ngày như receipts.
export async function voidLoan(env, user, id) {
  const r = await env.DB.prepare('SELECT * FROM loans WHERE id = ? AND voided = 0').bind(id).first();
  if (!r) throw new HttpError(404, 'Không tìm thấy dòng vay/mượn');
  const pending = !r.duyet_ts;
  if (user.role !== 'admin') {
    if (r.user_id !== user.id) throw new HttpError(403, 'Chỉ người ghi hoặc admin mới hủy được');
    if (!pending && Date.now() - r.duyet_ts > 10 * 60e3) {
      throw new HttpError(403, 'Dòng đã duyệt quá 10 phút, nhờ admin hủy');
    }
  }
  await env.DB.batch([
    r.grp
      ? env.DB.prepare('UPDATE loans SET voided = 1, voided_ts = ? WHERE grp = ? AND voided = 0').bind(Date.now(), r.grp)
      : env.DB.prepare('UPDATE loans SET voided = 1, voided_ts = ? WHERE id = ?').bind(Date.now(), id),
    auditStmt(env, user, pending ? 'loan_reject' : 'loan_void', { id, kind: r.kind, doitac_id: r.doitac_id, grp: r.grp }),
    bump(env),
  ]);
  return json({ ok: true, pending });
}

/* Màn Vay mượn: danh sách MỌI đối tác (cả đã ẩn, để admin quản lý), lịch sử gần đây (đủ cho màn
   hình, không tải hết — giống /users không tải hết nhật ký) và số dư nợ từng (đối tác × phi),
   tính trên MỌI dòng ĐÃ DUYỆT từ trước tới nay bằng SUM ở database, không phụ thuộc `items` có
   tải đủ hay không. agg trả về thô theo kind; cộng/trừ đúng cặp (vay/tra_vay, cho_vay/tra_no)
   làm ở app.js, để server khỏi phải biết màn hình trình bày thế nào. */
export async function loansView(env) {
  const [dR, itemR, aggR] = await env.DB.batch([
    env.DB.prepare('SELECT id, name, active FROM doitac ORDER BY name'),
    env.DB.prepare(
      `SELECT l.id, l.doitac_id, d.name doitac_name, l.phi_id, l.kind, l.qty, l.note, l.grp,
         l.user_id, ${UNAME}, l.ts, l.duyet_ts, l.duyet_by, ${DUYET_NAME_LOAN}
       FROM loans l LEFT JOIN users u ON u.id = l.user_id LEFT JOIN doitac d ON d.id = l.doitac_id
         ${DUYET_JOIN_LOAN}
       WHERE l.voided = 0 ORDER BY l.id DESC LIMIT 300`
    ),
    env.DB.prepare('SELECT doitac_id, phi_id, kind, SUM(qty) q FROM loans WHERE voided = 0 AND duyet_ts IS NOT NULL GROUP BY doitac_id, phi_id, kind'),
  ]);
  return json({ doitac: dR.results, items: itemR.results, agg: aggR.results });
}
