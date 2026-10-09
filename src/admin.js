// Quản trị: người dùng, khu, phi, cài đặt.
import { HttpError, PHI_DEFAULTS, ROLES, bad, hashPin, json, rand, seedPhi, vnDay } from './core.js';
import { SETTINGS_SQL, SETTING_RANGE, auditStmt, boWord, bump, genPin, intIn, normPhone,
  parseSettings, qtyWord, readJson, unitWord } from './helpers.js';
import { logout } from './auth.js';
import { KHU_X_PHI_ALL } from './counts.js';

/* ========================= QUẢN TRỊ ========================= */

/* Admin ĐẦU TIÊN = tài khoản do màn Thiết lập tạo ra, tức dòng ADMIN có id nhỏ nhất. Đây là
   "chủ hệ thống": chỉ người này được sửa tên, xoá và khôi phục tài khoản, và chính tài khoản này
   thì không ai khoá, hạ quyền hay xoá được — kể cả một admin khác. Thiếu chốt đó thì hai admin
   có thể khoá lẫn nhau và cả bãi mất đường quản lý người dùng, không sửa được từ trong app. */
export const firstAdminId = async (env) => {
  /* Phải lọc role = 'admin': "id nhỏ nhất" một mình là chưa đủ. Trên database đã dùng từ trước,
     dòng id nhỏ nhất có thể KHÔNG còn là admin (đường đổi vai trò cũ chỉ chặn tự hạ quyền mình),
     và lúc đó cả bãi mất đường quản lý người dùng: sửa tên / xoá / khôi phục tài khoản tắt hẳn
     với mọi người, mà chính dòng đó lại được PROTECT_FIRST che nên cũng không nâng quyền hay khoá
     lại được — khoá cứng, không sửa nổi từ trong app. deleted = 0 lọc thêm vì lý do y như vậy. */
  const r = await env.DB.prepare("SELECT MIN(id) id FROM users WHERE role = 'admin' AND deleted = 0").first();
  return r && r.id != null ? r.id : 0;
};

export async function listUsers(env) {
  // trả cả tài khoản đã xoá: admin đầu tiên cần thấy để khôi phục khi xoá nhầm
  const [uR, fid] = await Promise.all([
    env.DB.prepare('SELECT id, name, phone, role, locked, deleted, must_change, locked_until FROM users ORDER BY id').all(),
    firstAdminId(env),
  ]);
  return json({ users: uR.results, first: fid });
}

export async function createUser(req, env, admin) {
  const b = await readJson(req);
  const name = String(b.name || '').trim().slice(0, 60);
  if (!name) throw bad('Cần nhập tên');
  const phone = normPhone(b.phone);
  const role = String(b.role || 'nguoidem');
  if (!ROLES.includes(role)) throw bad('Vai trò không hợp lệ');
  const exist = await env.DB.prepare('SELECT name, deleted FROM users WHERE phone = ?').bind(phone).first();
  /* Số điện thoại là UNIQUE và dòng của người đã xoá vẫn còn, nên không tạo mới trùng số được.
     Nói rõ đường đi thay vì chỉ "đã có tài khoản": người dùng không nhìn thấy tài khoản đã xoá
     trong danh sách nên sẽ tưởng là lỗi vô lý. */
  if (exist && exist.deleted) throw bad(`Số này thuộc tài khoản đã xoá của ${exist.name}. Hãy khôi phục tài khoản đó, hoặc dùng số khác.`);
  if (exist) throw bad('Số điện thoại này đã có tài khoản');
  const pin = genPin();
  const salt = rand(16);
  const r = await env.DB.prepare('INSERT INTO users (name, phone, role, pin_salt, pin_hash, must_change, created_at) VALUES (?,?,?,?,?,1,?)')
    .bind(name, phone, role, salt, await hashPin(env, salt, pin), Date.now()).run();
  await auditStmt(env, admin, 'user_create', { id: r.meta.last_row_id, name, role }).run();
  return json({ ok: true, id: r.meta.last_row_id, pin });
}

// ba việc quản lý người dùng dành riêng cho admin đầu tiên (xem firstAdminId)
export const OWNER_ONLY = ['rename', 'delete', 'restore'];
// và ba việc KHÔNG được làm với chính admin đầu tiên, kể cả do một admin khác
export const PROTECT_FIRST = ['lock', 'role', 'delete'];
/* Đặt lại PIN của admin đầu tiên thì CHỈ chính người đó làm được. Thiếu chốt này là PROTECT_FIRST
   thành vô nghĩa: một admin thứ hai bấm "Đặt lại PIN" trên thẻ admin đầu tiên, PIN mới hiện ngay
   trên màn hình cho họ đọc, họ đăng nhập vào chính tài khoản chủ hệ thống rồi làm đủ những việc
   vừa bị chặn — đổi tên và xoá bất kỳ ai, kể cả mọi admin khác. */
export const FIRST_SELF_ONLY = ['reset-pin'];

export async function userAction(req, env, admin, id, action) {
  const u = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
  if (!u) throw new HttpError(404, 'Không tìm thấy người dùng');
  const first = await firstAdminId(env);
  if (OWNER_ONLY.includes(action) && admin.id !== first) {
    throw new HttpError(403, 'Chỉ admin đầu tiên (người thiết lập hệ thống) mới sửa tên, xoá hoặc khôi phục tài khoản');
  }
  if (FIRST_SELF_ONLY.includes(action) && id === first && admin.id !== first) {
    throw new HttpError(403, 'PIN của admin đầu tiên chỉ chính người đó đặt lại được — admin khác không làm thay');
  }
  if (PROTECT_FIRST.includes(action) && id === first) {
    throw bad('Không thể khóa, hạ quyền hay xoá admin đầu tiên — đó là tài khoản quản lý hệ thống');
  }
  /* Tài khoản đã xoá thì chỉ còn khôi phục được. Cho đặt lại PIN hay đổi vai trò một tài khoản
     đã xoá chỉ sinh ra trạng thái nửa vời mà không ai dùng được, và PIN mới hiện ra màn hình
     cho một người đã rời bãi. */
  if (u.deleted && action !== 'restore') throw bad(`Tài khoản ${u.name} đã bị xoá. Khôi phục trước nếu cần dùng lại.`);
  const b = req.method === 'POST' ? await readJson(req) : {};
  if (action === 'reset-pin') {
    const pin = genPin();
    const salt = rand(16);
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET pin_salt = ?, pin_hash = ?, must_change = 1, fail_count = 0, locked_until = 0, lock_level = 0 WHERE id = ?').bind(salt, await hashPin(env, salt, pin), id),
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
  /* Sửa tên. Lý do có việc này: tên đặt lúc tạo tài khoản trước đây không sửa được, nên một tài
     khoản đặt tên theo chức danh ("admin") sẽ ghi "admin" lên mọi hoạt động về sau và không ai
     biết người thật là ai. Số đếm, phiếu và báo cáo khu lấy tên bằng cách join users nên đổi tên
     là chúng hiện tên mới NGAY, cả dữ liệu cũ.
     Riêng NHẬT KÝ thì không: bảng audit lưu sẵn tên vào từng dòng và database từ chối mọi lệnh
     sửa (trigger audit_no_update), cố ý như vậy để nhật ký không viết lại được. Nên dòng nhật ký
     cũ giữ tên cũ — và chính dòng "đổi tên X thành Y" dưới đây là cái nối hai tên đó lại. */
  if (action === 'rename') {
    const name = String(b.name || '').trim().slice(0, 60);
    if (!name) throw bad('Cần nhập tên');
    if (name === u.name) throw bad('Tên mới trùng tên cũ');
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET name = ? WHERE id = ?').bind(name, id),
      auditStmt(env, admin, 'user_rename', { id, from: u.name, to: name }),
      bump(env),
    ]);
    return json({ ok: true, name });
  }
  /* Xoá: đánh dấu deleted, KHÔNG xoá dòng users — xem migration 11. Thu hồi mọi phiên và bỏ phân
     công khu, vì khu đã gán cho người này sẽ không ai đếm được nữa (chỉ người phụ trách và admin
     đếm được). Số đếm, phiếu, báo cáo người này đã làm thì giữ nguyên, kèm nguyên tên. */
  if (action === 'delete') {
    if (id === admin.id) throw bad('Không thể tự xoá chính mình');
    /* Bỏ phân công khu là chỗ có hậu quả ngầm: khu KHÔNG còn ai phụ trách nghĩa là MỌI người đếm
       đều đếm được khu đó (xem putCounts), nên xoá người phụ trách duy nhất của một khu là âm thầm
       mở khu đó ra cho cả bãi — ngược hẳn ý của người vừa bấm "xoá tài khoản". Vì vậy phải hỏi lại
       một lần, và mỗi khu bị đổi phân công để lại một dòng nhật ký y như lúc sửa phân công tay. */
    const asg = await env.DB.prepare(
      `SELECT ku.khu_id khu, k.name, ku.user_id uid FROM khu_user ku JOIN khu k ON k.id = ku.khu_id
       WHERE ku.khu_id IN (SELECT khu_id FROM khu_user WHERE user_id = ?1)`).bind(id).all();
    const byKhu = new Map();
    for (const r of asg.results) {
      if (!byKhu.has(r.khu)) byKhu.set(r.khu, { khu: r.khu, name: r.name, users: [] });
      byKhu.get(r.khu).users.push(r.uid);
    }
    const khus = [...byKhu.values()].map((k) => ({ ...k, users: k.users.filter((x) => x !== id) }));
    const solo = khus.filter((k) => !k.users.length);
    if (solo.length && !b.confirm_khu) {
      throw new HttpError(409,
        `${u.name} là người phụ trách duy nhất của ${solo.map((k) => k.khu + ' ' + k.name).join(', ')}. `
        + 'Xoá xong thì khu đó không còn ai phụ trách, tức là MỌI người đếm đều đếm được khu đó. '
        + 'Hãy gán người phụ trách khác trước, hoặc xác nhận lại để tiếp tục.', 'khu_open');
    }
    /* locked GIỮ NGUYÊN, không xoá về 0: một tài khoản bị khoá có chủ đích mà đi qua một vòng xoá
       rồi khôi phục thì phải quay về đúng trạng thái bị khoá, chứ không được tự mở khoá dọc đường
       mà không dòng nhật ký nào nói. fail_count/locked_until thì xoá, đó chỉ là số lần nhập sai
       PIN — giữ lại chỉ làm người được khôi phục bị chặn oan. */
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET deleted = 1, fail_count = 0, locked_until = 0 WHERE id = ?').bind(id),
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id),
      env.DB.prepare('DELETE FROM khu_user WHERE user_id = ?').bind(id),
      ...khus.map((k) => auditStmt(env, admin, 'khu_users', { khu: k.khu, n: k.users.length, users: k.users })),
      auditStmt(env, admin, 'user_delete', { id, name: u.name, role: u.role, phone: u.phone, locked: u.locked, mo: solo.map((k) => k.khu) }),
      bump(env),
    ]);
    return json({ ok: true, mo: solo.map((k) => k.khu) });
  }
  /* Khôi phục tài khoản xoá nhầm — và cấp luôn PIN MỚI. must_change một mình là không đủ: nó chỉ
     có tác dụng SAU khi đăng nhập được, nên để nguyên PIN cũ là mở lại đúng cánh cửa vừa đóng —
     người đã rời bãi mà còn nhớ PIN vẫn vào được, rồi tự đặt PIN mới và ở lại trong hệ thống.
     Suốt thời gian tài khoản bị xoá, PIN cũ nằm ngoài tầm kiểm soát nên phải coi như đã mất. */
  if (action === 'restore') {
    if (!u.deleted) throw bad('Tài khoản này chưa bị xoá');
    const pin = genPin();
    const salt = rand(16);
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET deleted = 0, must_change = 1, pin_salt = ?, pin_hash = ?, fail_count = 0, locked_until = 0, lock_level = 0 WHERE id = ?')
        .bind(salt, await hashPin(env, salt, pin), id),
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id),
      auditStmt(env, admin, 'user_restore', { id, name: u.name, locked: u.locked }),
      bump(env),
    ]);
    // locked giữ từ lúc xoá: trả về để màn hình nhắc mở khoá, không thì admin tưởng đã xong
    return json({ ok: true, pin, locked: u.locked ? 1 : 0 });
  }
  throw new HttpError(404, 'Không có thao tác này');
}

export async function khuCreate(req, env, admin) {
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

// Thay toàn bộ danh sách người phụ trách của một khu. Mảng rỗng = bỏ phân công (ai cũng đếm được).
export async function khuUsers(req, env, admin, id) {
  const b = await readJson(req);
  const k = await env.DB.prepare('SELECT id, name FROM khu WHERE id = ?').bind(id).first();
  if (!k) throw new HttpError(404, 'Không tìm thấy khu');
  const raw = Array.isArray(b.users) ? b.users : [];
  if (raw.length > 50) throw bad('Quá nhiều người trong một khu');
  const ids = [...new Set(raw.map((x) => intIn(x, 1, 1e9, 'Mã tài khoản')))];
  if (ids.length) {
    // tài khoản đã xoá không gán được: khu gán cho người đã rời bãi thì không ai đếm được nữa
    const have = await env.DB.prepare('SELECT id FROM users WHERE deleted = 0 AND id IN (SELECT value FROM json_each(?))')
      .bind(JSON.stringify(ids)).all();
    if (have.results.length !== ids.length) throw bad('Có tài khoản không tồn tại hoặc đã bị xoá');
  }
  const stmts = [env.DB.prepare('DELETE FROM khu_user WHERE khu_id = ?').bind(id)];
  if (ids.length) {
    stmts.push(env.DB.prepare('INSERT INTO khu_user (khu_id, user_id) SELECT ?1, value FROM json_each(?2)')
      .bind(id, JSON.stringify(ids)));
  }
  stmts.push(auditStmt(env, admin, 'khu_users', { khu: id, n: ids.length, users: ids }), bump(env));
  await env.DB.batch(stmts);
  return json({ ok: true });
}

export async function khuUpdate(req, env, admin, id) {
  const b = await readJson(req);
  const k = await env.DB.prepare('SELECT * FROM khu WHERE id = ?').bind(id).first();
  if (!k) throw new HttpError(404, 'Không tìm thấy khu');
  const name = b.name !== undefined ? String(b.name).trim().slice(0, 40) || k.name : k.name;
  const active = b.active !== undefined ? (b.active ? 1 : 0) : k.active;
  if (k.active && !active) {
    // khu ẩn thì không ai đếm được nữa: còn thép mà ẩn sẽ làm số tồn "đóng băng"
    const day = vnDay();
    const st = await env.DB.prepare(
      `SELECT COALESCE(SUM(COALESCE(c.duyet_v, b.v, 0)), 0) n FROM (${KHU_X_PHI_ALL}) kx
       LEFT JOIN counts c ON c.day = ?2 AND c.khu_id = kx.khu_id AND c.phi_id = kx.phi_id
       LEFT JOIN baseline b ON b.day = (SELECT COALESCE(MAX(day), '') FROM day_close WHERE day < ?2) AND b.khu_id = kx.khu_id AND b.phi_id = kx.phi_id
       WHERE kx.khu_id = ?1`
    ).bind(id, day).first();
    if (st && st.n > 0) throw bad(`${k.name} còn ${st.n} cây. Hãy chuyển thép sang khu khác (Nhập → Chuyển khu) hoặc đếm về 0 trước khi ẩn`);
  }
  await env.DB.batch([
    env.DB.prepare('UPDATE khu SET name = ?, active = ? WHERE id = ?').bind(name, active, id),
    auditStmt(env, admin, 'khu_update', { id, name, active }),
    bump(env),
  ]);
  return json({ ok: true });
}

export async function phiUpdate(req, env, admin, id) {
  const b = await readJson(req);
  const p = await env.DB.prepare('SELECT * FROM phi WHERE id = ?').bind(id).first();
  if (!p) throw new HttpError(404, 'Không tìm thấy phi');
  const bo = intIn(b.bo_size ?? p.bo_size, 1, 9999, boWord(p) + ' mỗi bó');
  const min = intIn(b.min_stock ?? p.min_stock, 0, 99999, 'Mức tối thiểu');
  const kg = Number(b.kg_per_cay ?? p.kg_per_cay);
  if (!(kg > 0 && kg < 1000)) throw bad('Khối lượng mỗi ' + unitWord(p) + ' không hợp lệ');
  const active = b.active === undefined ? p.active : (b.active ? 1 : 0);
  const stmts = [];
  if (p.active && !active) {
    // ẩn phi còn thép sẽ làm số tồn "đóng băng" đúng như trường hợp ẩn khu
    const day = vnDay();
    const st = await env.DB.prepare(
      `SELECT COALESCE(SUM(COALESCE(c.duyet_v, b.v, 0)), 0) n FROM (${KHU_X_PHI_ALL}) kx
       LEFT JOIN counts c ON c.day = ?2 AND c.khu_id = kx.khu_id AND c.phi_id = kx.phi_id
       LEFT JOIN baseline b ON b.day = (SELECT COALESCE(MAX(day), '') FROM day_close WHERE day < ?2) AND b.khu_id = kx.khu_id AND b.phi_id = kx.phi_id
       WHERE kx.phi_id = ?1`
    ).bind(id, day).first();
    if (st && st.n > 0) throw bad(`Phi ${id} còn ${qtyWord(st.n, p)} trong bãi. Hãy đếm về 0 hoặc dùng hết trước khi ẩn`);
  }
  /* Không còn gì phải làm với khu_phi khi bật/tắt một phi: từ bản 1.3 khu nào cũng hiện đủ phi
     đang bật, nên tắt phi là mọi khu thôi báo nó, bật lại là mọi khu hiện lại — tự động. Bản cũ
     phải bật/tắt từng dòng khu_phi và còn phải phân biệt khu bị ẩn do "đếm 0 nhiều ngày" với khu
     bị tắt cùng lúc với phi, nếu không admin bật phi mà bảng đếm vẫn trống. Cả lớp lỗi đó hết. */
  await env.DB.batch([
    env.DB.prepare('UPDATE phi SET bo_size = ?, min_stock = ?, kg_per_cay = ?, active = ? WHERE id = ?').bind(bo, min, kg, active, id),
    ...stmts,
    auditStmt(env, admin, 'phi_update', { id, bo, min, kg, active }),
    bump(env),
  ]);
  return json({ ok: true });
}

export async function seedPhiApi(env, user) {
  await seedPhi(env);
  await env.DB.batch([auditStmt(env, user, 'phi_seed', null), bump(env)]);
  return json({ ok: true, n: PHI_DEFAULTS.length });
}

export async function phiBulk(req, env, admin) {
  const b = await readJson(req);
  const items = Array.isArray(b.items) ? b.items : [];
  if (!items.length) throw bad('Không có gì để lưu');
  const { results } = await env.DB.prepare('SELECT * FROM phi').all();
  const by = Object.fromEntries(results.map((p) => [p.id, p]));
  const stmts = [], log = [];
  for (const it of items.slice(0, 50)) {
    const p = by[String(it.id || '')];
    if (!p) throw bad('Phi không hợp lệ: ' + it.id);
    const bo = intIn(it.bo_size ?? p.bo_size, 1, 9999, 'Số cây mỗi bó của ' + p.id);
    const min = intIn(it.min_stock ?? p.min_stock, 0, 99999, 'Mức tối thiểu của ' + p.id);
    const kg = Number(String(it.kg_per_cay ?? p.kg_per_cay).replace(',', '.'));
    if (!(kg > 0 && kg < 1000)) throw bad('Khối lượng mỗi cây của ' + p.id + ' không hợp lệ');
    if (bo === p.bo_size && min === p.min_stock && kg === p.kg_per_cay) continue;
    stmts.push(env.DB.prepare('UPDATE phi SET bo_size = ?, min_stock = ?, kg_per_cay = ? WHERE id = ?').bind(bo, min, kg, p.id));
    log.push({ id: p.id, bo, min, kg });
  }
  if (!stmts.length) return json({ ok: true, n: 0 });
  stmts.push(auditStmt(env, admin, 'phi_update', { items: log }), bump(env));
  await env.DB.batch(stmts);
  return json({ ok: true, n: log.length });
}

export const SETTING_NAME = { work_from: 'Giờ bắt đầu làm việc', work_to: 'Giờ kết thúc làm việc', report_slots_per_day: 'Số lần đếm mỗi ngày' };
export async function settingsUpdate(req, env, admin) {
  const b = await readJson(req);
  const stmts = [];
  // số sau khi lưu = số đang lưu, đè bằng những gì vừa gửi: để kiểm điều kiện giữa các số
  const sau = parseSettings((await env.DB.prepare(SETTINGS_SQL).all()).results);
  for (const key of Object.keys(SETTING_RANGE)) {
    if (b[key] !== undefined) sau[key] = intIn(b[key], SETTING_RANGE[key][0], SETTING_RANGE[key][1], SETTING_NAME[key] || key);
  }
  if (sau.work_from >= sau.work_to) throw bad('Giờ kết thúc làm việc phải sau giờ bắt đầu');
  /* Mỗi khung đếm ít nhất 1 tiếng. Giờ làm 3 tiếng mà đòi đếm 4 lần thì khung chỉ 45 phút: vừa
     đếm xong khu này đã sang khung sau, khu nào cũng thành thiếu. */
  if (sau.work_to - sau.work_from < sau.report_slots_per_day) {
    throw bad(`Giờ làm ${sau.work_to - sau.work_from} tiếng không đủ cho ${sau.report_slots_per_day} lần đếm (mỗi lần cần ít nhất 1 tiếng)`);
  }
  for (const key of Object.keys(SETTING_RANGE)) {
    if (b[key] !== undefined) {
      const v = sau[key];
      stmts.push(env.DB.prepare('INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(key, String(v)));
    }
  }
  if (!stmts.length) throw bad('Không có gì để lưu');
  stmts.push(auditStmt(env, admin, 'settings_update', Object.fromEntries(Object.keys(SETTING_RANGE).filter((k) => b[k] !== undefined).map((k) => [k, b[k]]))), bump(env));
  await env.DB.batch(stmts);
  return json({ ok: true });
}
