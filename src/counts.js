// Báo cáo đếm của khu, và xử lý khi hai người báo khác số.
import { HttpError, KINDS, bad, fmtDay, json, vnDay } from './core.js';
import { RATE_SQL } from './db.js';
import { IS_CLOSED, SETTINGS_SQL, UNAME, auditStmt, batchGuarded, boWord, bump, closedErr,
  guardStmt, intIn, parseSettings, readJson, unitWord } from './helpers.js';

/* ========================= BÁO CÁO ĐẾM ========================= */

// Gói Free giới hạn khoảng 50 truy vấn D1 mỗi request: ghi cả danh sách bằng MỘT câu lệnh,
// dữ liệu gửi dạng JSON trong một tham số rồi tách bằng json_each (số truy vấn không đổi dù thêm phi).
export const J = (f) => `json_extract(j.value, '$.${f}')`;

/* Số đếm HIỆU LỰC của một ô (khu × phi) = lần báo GẦN NHẤT kể từ sau lần chốt trước, không phải
   chỉ lần báo của đúng ngày đang xét. Quên chốt vài ngày là chuyện thường (mất mạng, nghỉ lễ):
   nếu chỉ đọc counts của ngày chốt thì khu nào hôm đó không báo sẽ bị quay về tồn chuẩn cũ,
   xoá sạch những ngày họ đã báo ở giữa. */
/* MỌI đường đọc tồn đều đi qua đây và đều đòi duyet_v IS NOT NULL: chưa duyệt thì không vào tồn.
   Lấy ngày gần nhất CÓ SỐ ĐÃ DUYỆT, nên khu báo ngày 3 mà chưa ai duyệt thì tồn vẫn là số
   đã duyệt của ngày 2 — đúng câu "tồn của khu tính theo báo cáo mới nhất ĐƯỢC DUYỆT". */
export const EFF_JOIN = (A, B) => `LEFT JOIN counts c
  ON c.khu_id = kx.khu_id AND c.phi_id = kx.phi_id AND c.day > ?${A} AND c.day <= ?${B} AND c.duyet_v IS NOT NULL
  AND c.day = (SELECT MAX(c2.day) FROM counts c2
               WHERE c2.khu_id = kx.khu_id AND c2.phi_id = kx.phi_id AND c2.day > ?${A} AND c2.day <= ?${B}
                 AND c2.duyet_v IS NOT NULL)`;
// ?1 = ngày chốt trước ('' nếu chưa có), ?2 = ngày đang xét
export const EFF_SELECT = `SELECT c.khu_id, c.phi_id, c.duyet_v v, c.duyet_kind kind, c.duyet_at ts, c.day FROM counts c
  WHERE c.day > ?1 AND c.day <= ?2 AND c.duyet_v IS NOT NULL
    AND c.day = (SELECT MAX(c2.day) FROM counts c2
                 WHERE c2.khu_id = c.khu_id AND c2.phi_id = c.phi_id AND c2.day > ?1 AND c2.day <= ?2
                   AND c2.duyet_v IS NOT NULL)`;
// như trên nhưng mốc là ngày có tồn chuẩn gần nhất tính đến ?1 (dùng cho xuất CSV một ngày bất kỳ)
export const EFF_BY_BASELINE = `SELECT c.khu_id, c.phi_id, c.duyet_v v, c.duyet_at ts FROM counts c
  WHERE c.day > (SELECT COALESCE(MAX(day), '') FROM baseline WHERE day <= ?1) AND c.day <= ?1
    AND c.duyet_v IS NOT NULL
    AND c.day = (SELECT MAX(c2.day) FROM counts c2
                 WHERE c2.khu_id = c.khu_id AND c2.phi_id = c.phi_id AND c2.duyet_v IS NOT NULL
                   AND c2.day > (SELECT COALESCE(MAX(day), '') FROM baseline WHERE day <= ?1) AND c2.day <= ?1)`;

/* Thép ĐÃ DUYỆT về SAU lần đếm, tính đến ngày ?1 — tức phần chưa nằm trong số đếm.
   Tồn mà app hiện = số đếm + phần này (xem tonOf ở app.js). Chỗ nào đọc tồn mà bỏ phần này thì
   nói ít hơn chính app, và lệch đúng bằng lượng thép vừa về mà khu chưa kịp đếm.
   Ngày ĐÃ CHỐT thì mốc tồn chuẩn chính là ngày đó nên phiếu duyệt trong ngày không lọt vào đây,
   và kết quả bằng đúng tồn chuẩn — hai cách đọc vẫn khớp. */
export const MV_CHUA_DEM = `SELECT r.khu_id, r.phi_id, SUM(r.qty) q FROM receipts r
  LEFT JOIN (${EFF_BY_BASELINE}) e ON e.khu_id = r.khu_id AND e.phi_id = r.phi_id
  WHERE r.voided = 0 AND r.duyet_day IS NOT NULL
    AND r.duyet_day > (SELECT COALESCE(MAX(day), '') FROM baseline WHERE day <= ?1)
    AND r.duyet_day <= ?1 AND (e.ts IS NULL OR r.duyet_ts > e.ts)
  GROUP BY r.khu_id, r.phi_id HAVING SUM(r.qty) <> 0`;
/* Mọi (khu x phi) đang dùng. Thay cho khu_phi làm bảng liệt kê: từ bản 1.3 khu nào cũng có đủ phi,
   nên tồn chuẩn thành đặc (8 khu x 13 phi) và bỏ được trường hợp "khu hôm qua không có phi đó". */
export const KHU_X_PHI = `SELECT k.id khu_id, p.id phi_id FROM khu k, phi p WHERE k.active = 1 AND p.active = 1`;
/* Như trên nhưng KHÔNG lọc theo cờ đang dùng. Dùng cho CHỐT CHẶN (đếm thép trước khi cho ẩn khu
   hoặc ẩn phi): chốt chặn phải thấy cả thép nằm ở ô đã bị ẩn, nếu không thì ẩn khu rồi ẩn phi là
   lọt qua cả hai lần kiểm. Hệ thống không cho ẩn khu/phi còn thép, nhưng dữ liệu cũ bị ẩn bằng
   tay trong DB thì vẫn còn (xem mục 9 của bộ test), nên chỗ kiểm phải dè dặt hơn chỗ hiển thị. */
export const KHU_X_PHI_ALL = `SELECT k.id khu_id, p.id phi_id FROM khu k, phi p`;

/* "Có người KHÁC đã báo phi này với số KHÁC" — tính bằng SQL ngay trước khi ghi đè counts.
   So ở JS trên dữ liệu đọc trước đó sẽ bỏ sót khi hai người gửi gần như cùng lúc; còn chỉ so
   "người báo khác nhau" thì hai người báo giống số cũng bị coi là xung đột. */
export const conflictCond = (day, khu, usr, data) =>
  `EXISTS (SELECT 1 FROM counts c, json_each(?${data}) j
     WHERE c.day = ?${day} AND c.khu_id = ?${khu} AND c.phi_id = ${J('phi')}
       AND c.user_id <> ?${usr} AND c.v <> ${J('v')})`;

export async function putCounts(req, env, user) {
  const b = await readJson(req);
  const day = vnDay();
  if (b.day !== undefined && String(b.day) !== day) {
    throw new HttpError(409, `Báo cáo này đếm ngày ${fmtDay(b.day)}, nay đã sang ngày mới nên không ghi vào ngày cũ được`, 'stale_day');
  }
  const khuId = String(b.khu || '');
  const items = Array.isArray(b.items) ? b.items : [];
  if (!items.length) throw bad('Chưa có số liệu nào');
  if (items.length > 100) throw bad('Quá nhiều dòng số liệu');

  const [closedR, khuR, setR, phiR, kpR, prevR, innR, asgR] = await env.DB.batch([
    env.DB.prepare('SELECT 1 x FROM day_close WHERE day = ?').bind(day),
    env.DB.prepare('SELECT id, name, active FROM khu WHERE id = ?').bind(khuId),
    env.DB.prepare(SETTINGS_SQL),
    env.DB.prepare('SELECT id, bo_size, unit FROM phi WHERE active = 1'),
    env.DB.prepare('SELECT phi_id, keep_streak FROM khu_phi WHERE khu_id = ?').bind(khuId),
    env.DB.prepare('SELECT phi_id, v, kind, user_id, ts, duyet_at FROM counts WHERE day = ? AND khu_id = ?').bind(day, khuId),
    /* Thép ĐÃ DUYỆT về khu này sau lần đếm đã duyệt: chỉ phần này là chưa nằm trong số đếm.
       Thép đã về trước lần đếm thì số đếm đã bao gồm, "giữ nguyên" vẫn hợp lệ.
       Mốc hai bên đều là lúc DUYỆT (duyet_ts/duyet_day), không phải lúc nhập hay lúc báo:
       từ bản 1.3 một con số chỉ tác động tới tồn kể từ khi được duyệt. */
    env.DB.prepare(
      `SELECT r.phi_id, SUM(r.qty) q FROM receipts r
       LEFT JOIN (SELECT c.phi_id, c.duyet_at ts FROM counts c
                  WHERE c.khu_id = ?1 AND c.duyet_v IS NOT NULL
                    AND c.day > (SELECT COALESCE(MAX(day), '') FROM day_close WHERE day < ?2) AND c.day <= ?2
                    AND c.day = (SELECT MAX(c2.day) FROM counts c2 WHERE c2.khu_id = ?1 AND c2.phi_id = c.phi_id
                                 AND c2.duyet_v IS NOT NULL
                                 AND c2.day > (SELECT COALESCE(MAX(day), '') FROM day_close WHERE day < ?2) AND c2.day <= ?2)
                 ) e ON e.phi_id = r.phi_id
       WHERE r.voided = 0 AND r.duyet_day IS NOT NULL AND r.khu_id = ?1 AND (e.ts IS NULL OR r.duyet_ts > e.ts)
         AND r.duyet_day > (SELECT COALESCE(MAX(day), '') FROM day_close WHERE day < ?2) AND r.duyet_day <= ?2
       GROUP BY r.phi_id HAVING SUM(r.qty) <> 0`
    ).bind(khuId, day),
    env.DB.prepare('SELECT user_id FROM khu_user WHERE khu_id = ?').bind(khuId),
  ]);
  const moved = Object.fromEntries(innR.results.map((r) => [r.phi_id, r.q]));
  if (closedR.results.length) throw new HttpError(409, 'Ngày hôm nay đã được chốt, không sửa được nữa', 'closed');
  const k = khuR.results[0];
  if (!k || !k.active) throw bad('Khu không tồn tại hoặc đã ẩn');
  // Khu đã phân công thì chỉ người phụ trách mới đếm được; admin luôn đếm được để xử lý khi có người nghỉ
  const asg = asgR.results;
  if (asg.length && user.role !== 'admin' && !asg.some((r) => r.user_id === user.id)) {
    throw new HttpError(403, `Bạn không phụ trách ${k.name}. Nhờ admin gán quyền nếu cần đếm khu này.`, 'not_assigned');
  }
  const settings = parseSettings(setR.results);
  const phiBy = Object.fromEntries(phiR.results.map((r) => [r.id, r]));
  const kp = Object.fromEntries(kpR.results.map((r) => [r.phi_id, r]));
  const prev = Object.fromEntries(prevR.results.map((r) => [r.phi_id, r]));

  const seen = new Set();
  const clean = items.map((it) => {
    const phi = String((it && it.phi) || '');
    const pi = phiBy[phi];
    if (!pi) throw bad('Phi không hợp lệ: ' + phi);
    if (seen.has(phi)) throw bad('Trùng phi: ' + phi);
    seen.add(phi);
    const kind = String(it.kind || 'dem');
    if (!KINDS.includes(kind)) throw bad('Loại số liệu không hợp lệ');
    const v = intIn(it.v, 0, 99999, 'Số ' + unitWord(pi) + ' của ' + phi);
    if (kind === 'zero' && v !== 0) throw bad('Số liệu không khớp ở phi ' + phi);
    const bo = it.bo === undefined || it.bo === null ? null : intIn(it.bo, 0, 999, boWord(pi) + ' của ' + phi);
    const le = it.le === undefined || it.le === null ? null : intIn(it.le, 0, 9999, 'Số ' + unitWord(pi) + ' lẻ của ' + phi);
    // bo/le gửi lên độc lập với v: không kiểm chéo thì database giữ luôn cặp số mâu thuẫn
    if (kind === 'dem' && bo !== null && le !== null && bo * pi.bo_size + le !== v) {
      throw bad(`Số liệu phi ${phi} không khớp: ${bo} × ${pi.bo_size} + ${le} khác ${v}`);
    }
    return { phi, kind, v, bo, le };
  });

  /* Người đếm KHÔNG phải điền 0 cho phi khu không có: để trống là mặc định 0 (kind 'zero').
     Nhưng việc điền 0 đó do MÁY KHÁCH làm trước khi gửi, còn server vẫn đòi báo cáo đủ mọi phi
     đang bật. Lý do không để server tự điền 0 phần thiếu: một bản app cũ còn trong cache chỉ gửi
     các phi mà nó tưởng là "khu đang có", server điền 0 cho phần còn lại là XOÁ SẠCH tồn những
     phi nó không biết. Thà báo lỗi đòi tải lại trang. */
  const missing = phiR.results.filter((r) => !seen.has(r.id)).map((r) => r.id);
  if (missing.length) {
    throw new HttpError(409, `Báo cáo thiếu phi ${missing.join(', ')}. Bản ứng dụng trên máy đã cũ, hãy tải lại trang rồi báo lại.`, 'need_all');
  }

  /* Mốc của lần báo này phải LỚN HƠN mọi mốc đã có của khu trong ngày, kể cả mốc duyệt.
     "Ô đã duyệt" là phép so duyet_ts = ts, nên nếu một lần báo mới rơi đúng milligiây mà admin
     vừa duyệt thì nó trùng mốc và bị coi như đã duyệt — một con số vào tồn mà không ai duyệt,
     đúng cái mà cả cơ chế này dựng ra để chặn. Hai người bấm trong cùng một milligiây là gần như
     không thể, nhưng hậu quả đủ nặng để không dựa vào xác suất. */
  const prevTs = prevR.results.reduce((m, r) => Math.max(m, r.ts || 0, r.duyet_at || 0), 0);
  const ts = Math.max(Date.now(), prevTs + 1);
  /* Lúc ĐẾM: báo cáo lưu khi mất mạng có thể tới máy chủ sau cả tiếng, mà khung giờ phải tính
     theo lúc khu ra bãi đếm chứ không phải lúc có mạng lại. Máy gửi b.tuoi = số mili-giây ĐÃ TRÔI
     từ lúc bấm gửi lần đầu, server lấy giờ của chính nó trừ đi. Hiệu hai mốc trên cùng một máy
     vẫn đúng dù đồng hồ máy chạy sai giờ — gửi thẳng giờ máy (b.at, bản app cũ) thì máy chậm một
     tiếng là lần đếm rơi sang khung trước. Chỉ nhận mốc trong đúng ngày đếm và không ở tương lai;
     lệch giờ tới quá SLOT_LATE_MS thì màn Duyệt nói ra. */
  const tuoi = Number(b.tuoi);
  const atIn = Number.isFinite(tuoi) && tuoi >= 0 ? ts - tuoi : Number(b.at);
  const at = Number.isFinite(atIn) && atIn <= ts && vnDay(atIn) === day ? Math.round(atIn) : ts;
  const changes = [];
  let conflict = 0;
  const rows = clean.map((it) => {
    const old = kp[it.phi];
    const p = prev[it.phi];
    /* Chuỗi "giữ nguyên" tính trên trạng thái TRƯỚC lần báo đầu tiên của hôm nay. Lấy nguyên số
       trong khu_phi thì sửa lại số trong ngày sẽ để lại chuỗi đã cộng (bắt đếm lại sớm hơn thực tế).
       Chuỗi này vẫn cộng lúc GỬI chứ không lúc duyệt: nó đo hành vi của người đếm (bấm "giữ nguyên"
       bao nhiêu ngày liền), mà cái bấm đó đã xảy ra rồi, duyệt hay không không đổi được. */
    let keep0 = old ? old.keep_streak : 0;
    if (p && p.kind === 'giu') keep0 = Math.max(0, keep0 - 1);
    if (it.kind === 'giu' && keep0 >= settings.max_keep_streak) {
      throw bad(`Phi ${it.phi} đã giữ nguyên quá ${settings.max_keep_streak} ngày liên tiếp, hãy đếm lại`);
    }
    if (it.kind === 'giu' && moved[it.phi]) {
      /* Phiếu điều chỉnh cũng rơi vào đây, và đó là điều MONG MUỐN: admin vừa sửa tồn phi này
         thì khu phải ra đếm thật để xác minh, không được bấm "giữ nguyên" lấy lại số cũ. Chỉ lời
         nhắc phải nói đúng việc, chứ bảo "có thép chuyển đi" khi thực ra là sổ vừa được sửa thì
         người đếm đi tìm một chuyến xe không tồn tại. */
      throw bad(`Phi ${it.phi} có thay đổi tồn (nhập, chuyển khu hoặc điều chỉnh) ở khu này từ lần chốt trước, không giữ nguyên được, hãy đếm thực tế`);
    }
    if (p && p.user_id !== user.id && p.v !== it.v) conflict = 1;
    if (!p || p.v !== it.v) changes.push({ phi: it.phi, from: p ? p.v : null, to: it.v });
    const keep = it.kind === 'giu' ? keep0 + 1 : 0;
    return { ...it, prev: p ? p.v : null, keep };
  });
  const data = JSON.stringify(rows);

  const res = await batchGuarded(env, guardStmt(env, IS_CLOSED, day), [
    // chạy TRƯỚC khi ghi counts: cờ này nói "lần gửi NÀY lệch với người khác", để trả lời người gửi
    env.DB.prepare(`SELECT ${conflictCond(1, 2, 3, 4)} conflict`).bind(day, khuId, user.id, data),
    env.DB.prepare(
      `INSERT INTO khu_report (day, khu_id, user_id, ts, conflict, resolved, recount)
       SELECT ?1, ?2, ?3, ?4, CASE WHEN ${conflictCond(1, 2, 3, 5)} THEN 1 ELSE 0 END, 0, 0
       WHERE 1
       ON CONFLICT(day, khu_id) DO UPDATE SET user_id = excluded.user_id, ts = excluded.ts,
         conflict = CASE WHEN excluded.conflict = 1 THEN 1 ELSE khu_report.conflict END,
         resolved = CASE WHEN excluded.conflict = 1 THEN 0 ELSE khu_report.resolved END,
         recount = 0`
    ).bind(day, khuId, user.id, ts, data),
    /* Ghi LẦN BÁO MỚI, cố ý KHÔNG chạm tới duyet_*: số mới ở trạng thái chờ duyệt, còn số đã
       duyệt trước đó vẫn nguyên và vẫn là số mà tồn đang dùng. Ô thành chờ duyệt một cách tự
       nhiên vì ts vừa nhảy lên lớn hơn duyet_ts — không cần cờ, không cần dấu số liệu. */
    env.DB.prepare(
      `INSERT INTO counts (day, khu_id, phi_id, v, kind, bo, le, user_id, ts)
       SELECT ?1, ?2, ${J('phi')}, ${J('v')}, ${J('kind')}, ${J('bo')}, ${J('le')}, ?3, ?4 FROM json_each(?5) j WHERE 1
       ON CONFLICT(day, khu_id, phi_id) DO UPDATE SET v=excluded.v, kind=excluded.kind, bo=excluded.bo, le=excluded.le, user_id=excluded.user_id, ts=excluded.ts`
    ).bind(day, khuId, user.id, ts, data),
    env.DB.prepare(
      `INSERT INTO counts_log (day, khu_id, phi_id, prev_v, v, kind, user_id, ts)
       SELECT ?1, ?2, ${J('phi')}, ${J('prev')}, ${J('v')}, ${J('kind')}, ?3, ?4 FROM json_each(?5) j`
    ).bind(day, khuId, user.id, ts, data),
    // một dòng cho mỗi lần GỬI: dùng để biết khu đã đếm khung giờ nào (xem migration 15)
    env.DB.prepare('INSERT INTO khu_report_log (day, khu_id, ts, at, user_id) VALUES (?,?,?,?,?)').bind(day, khuId, ts, at, user.id),
    env.DB.prepare(
      `INSERT INTO khu_phi (khu_id, phi_id, active, zero_days, keep_streak)
       SELECT ?1, ${J('phi')}, 1, 0, ${J('keep')} FROM json_each(?2) j WHERE 1
       ON CONFLICT(khu_id, phi_id) DO UPDATE SET keep_streak = excluded.keep_streak`
    ).bind(khuId, data),
    auditStmt(env, user, 'count', { khu: khuId, n: clean.length, changes: changes.slice(0, 30), conflict: !!conflict }),
    bump(env),
  ], closedErr());
  // cờ do database tính, đúng cả khi hai người gửi cùng lúc (cờ tính ở JS chỉ dùng cho nhật ký)
  const probe = res[0].results[0];
  return json({ ok: true, conflict: !!(probe && probe.conflict) });
}

/* ========================= HAI NGƯỜI BÁO KHÁC SỐ ========================= */

// So sánh lần báo mới nhất với lần báo gần nhất của NGƯỜI KHÁC trong ngày (lấy từ lịch sử đếm)
export async function conflictView(env, url) {
  const khu = String(url.searchParams.get('khu') || '');
  const day = vnDay();
  const { results } = await env.DB.prepare(
    `SELECT l.phi_id, l.v, l.kind, l.user_id, l.ts, ${UNAME} FROM counts_log l LEFT JOIN users u ON u.id = l.user_id WHERE l.day = ? AND l.khu_id = ? ORDER BY l.id`
  ).bind(day, khu).all();
  const subs = [];
  for (const r of results) {
    let s = subs[subs.length - 1];
    if (!s || s.user_id !== r.user_id || s.ts !== r.ts) { s = { user_id: r.user_id, uname: r.uname, ts: r.ts, vals: {} }; subs.push(s); }
    s.vals[r.phi_id] = r.v;
  }
  const b = subs[subs.length - 1];
  let a = null;
  for (let i = subs.length - 2; i >= 0; i--) if (b && subs[i].user_id !== b.user_id) { a = subs[i]; break; }
  if (!a || !b) return json({ khu, a: null, b: null, diffs: [] });
  const phis = [...new Set([...Object.keys(a.vals), ...Object.keys(b.vals)])];
  const diffs = phis.filter((p) => a.vals[p] !== b.vals[p]).map((p) => ({ phi: p, a: a.vals[p] ?? null, b: b.vals[p] ?? null }));
  const strip = (x) => ({ uname: x.uname, ts: x.ts });
  return json({ khu, a: strip(a), b: strip(b), diffs });
}

// pick: { D16: 120, ... } số admin chọn cho từng phi (không gửi pick = giữ số báo sau)
export async function conflictResolve(req, env, user) {
  const b = await readJson(req);
  const khu = String(b.khu || '');
  const day = vnDay();
  const [closedR, curR, repR] = await env.DB.batch([
    env.DB.prepare('SELECT 1 x FROM day_close WHERE day = ?').bind(day),
    env.DB.prepare('SELECT phi_id, v, kind, ts, duyet_at FROM counts WHERE day = ? AND khu_id = ?').bind(day, khu),
    env.DB.prepare('SELECT 1 x FROM khu_report WHERE day = ? AND khu_id = ?').bind(day, khu),
  ]);
  if (closedR.results.length) throw new HttpError(409, 'Ngày hôm nay đã chốt', 'closed');
  if (!repR.results.length) throw bad('Không có khu cần xử lý');
  const cur = Object.fromEntries(curR.results.map((r) => [r.phi_id, r]));
  const pick = b.pick && typeof b.pick === 'object' ? b.pick : {};
  const changes = [];
  for (const phi of Object.keys(pick)) {
    if (!(phi in cur)) throw bad('Phi không có trong báo cáo: ' + phi);
    const v = intIn(pick[phi], 0, 99999, 'Số đếm của ' + phi);
    if (v !== cur[phi].v) changes.push({ phi, prev: cur[phi].v, v });
  }
  // mốc phải vượt mọi mốc cũ của khu, cùng lý do như putCounts
  const ts = Math.max(Date.now(), curR.results.reduce((m, r) => Math.max(m, r.ts || 0, r.duyet_at || 0), 0) + 1);
  const data = JSON.stringify(changes);
  const stmts = [];
  if (changes.length) {
    /* Số admin chọn phải để lại cùng dấu vết như một lần báo thường: kind thành 'dem' nên chuỗi
       "giữ nguyên" về 0, nếu không người đếm bị bắt đếm lại sớm hơn thực tế.
       ts nhảy lên hiện tại, nên ô vừa bị sửa tự quay về trạng thái CHỜ DUYỆT — admin chọn số
       không phải là duyệt số: vẫn phải bấm "Duyệt khu" để nó thành tồn. */
    stmts.push(
      env.DB.prepare(
        `UPDATE counts SET v = (SELECT ${J('v')} FROM json_each(?3) j WHERE ${J('phi')} = counts.phi_id),
           kind = 'dem', bo = NULL, le = NULL, user_id = ?4, ts = ?5
         WHERE day = ?1 AND khu_id = ?2 AND phi_id IN (SELECT ${J('phi')} FROM json_each(?3) j)`
      ).bind(day, khu, data, user.id, ts),
      env.DB.prepare(
        `INSERT INTO counts_log (day, khu_id, phi_id, prev_v, v, kind, user_id, ts)
         SELECT ?1, ?2, ${J('phi')}, ${J('prev')}, ${J('v')}, 'dem', ?3, ?4 FROM json_each(?5) j`
      ).bind(day, khu, user.id, ts, data),
      env.DB.prepare(
        `INSERT INTO khu_phi (khu_id, phi_id, active, zero_days, keep_streak)
         SELECT ?1, ${J('phi')}, 1, 0, 0 FROM json_each(?2) j WHERE 1
         ON CONFLICT(khu_id, phi_id) DO UPDATE SET keep_streak = 0`
      ).bind(khu, data)
    );
  }
  stmts.push(
    env.DB.prepare('UPDATE khu_report SET resolved = 1 WHERE day = ? AND khu_id = ?').bind(day, khu),
    auditStmt(env, user, 'conflict_resolve', { khu, changes: changes.map((c) => ({ phi: c.phi, from: c.prev, to: c.v })) }),
    bump(env)
  );
  await batchGuarded(env, guardStmt(env, IS_CLOSED, day), stmts, closedErr());
  return json({ ok: true, changed: changes.length });
}

// Tất cả lần báo của một khu trong ngày hôm nay (gom theo user + ts)
export async function submissionsView(env, url) {
  const khu = String(url.searchParams.get('khu') || '');
  const day = vnDay();
  const { results } = await env.DB.prepare(
    `SELECT l.phi_id, l.v, l.user_id, l.ts, ${UNAME} FROM counts_log l LEFT JOIN users u ON u.id = l.user_id WHERE l.day = ? AND l.khu_id = ? ORDER BY l.id`
  ).bind(day, khu).all();
  const subs = [];
  for (const r of results) {
    let s = subs[subs.length - 1];
    if (!s || s.user_id !== r.user_id || s.ts !== r.ts) { s = { user_id: r.user_id, uname: r.uname, ts: r.ts, vals: {} }; subs.push(s); }
    s.vals[r.phi_id] = r.v;
  }
  return json({ khu, subs: subs.map((s) => ({ uname: s.uname, ts: s.ts, vals: s.vals })) });
}

// Mở lại ngày và xoá số đếm của một khu để yêu cầu đếm lại sau khi đã chốt
export async function recountAfterClose(req, env, user) {
  const b = await readJson(req);
  const khu = String(b.khu || '');
  const day = vnDay();
  const [closedR, repR] = await env.DB.batch([
    env.DB.prepare('SELECT 1 x FROM day_close WHERE day = ?').bind(day),
    env.DB.prepare('SELECT 1 x FROM khu_report WHERE day = ? AND khu_id = ?').bind(day, khu),
  ]);
  if (!closedR.results[0]) throw bad('Ngày chưa chốt, dùng nút đếm lại thông thường');
  if (!repR.results[0]) throw bad('Khu này chưa có báo cáo');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM day_close WHERE day = ?').bind(day),
    env.DB.prepare('DELETE FROM baseline WHERE day = ?').bind(day),
    env.DB.prepare('DELETE FROM daily_summary WHERE day = ?').bind(day),
    env.DB.prepare(RATE_SQL).bind(day),
    // hoàn lại chuỗi "giữ nguyên" mà lần báo bị xoá đã cộng, để lần báo mới không cộng hai lần
    env.DB.prepare(
      `UPDATE khu_phi SET
         keep_streak = MAX(0, keep_streak - (SELECT CASE WHEN c.kind = 'giu' THEN 1 ELSE 0 END FROM counts c WHERE c.day = ?1 AND c.khu_id = ?2 AND c.phi_id = khu_phi.phi_id))
       WHERE khu_id = ?2 AND EXISTS (SELECT 1 FROM counts c WHERE c.day = ?1 AND c.khu_id = ?2 AND c.phi_id = khu_phi.phi_id)`
    ).bind(day, khu),
    env.DB.prepare('DELETE FROM counts WHERE day = ? AND khu_id = ?').bind(day, khu),
    // số đếm bị bỏ thì dấu "đã đếm khung" của khu cũng bỏ: không thì khu bị bắt đếm lại vẫn hiện ✓
    env.DB.prepare('DELETE FROM khu_report_log WHERE day = ? AND khu_id = ?').bind(day, khu),
    env.DB.prepare('UPDATE khu_report SET recount = 1, resolved = 0 WHERE day = ? AND khu_id = ?').bind(day, khu),
    auditStmt(env, user, 'recount_after_close', { day, khu }),
    bump(env),
  ]);
  return json({ ok: true });
}
