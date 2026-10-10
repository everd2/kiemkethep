// Báo cáo đếm của khu, và xử lý khi hai người báo khác số.
import { HttpError, KINDS, bad, fmtDay, json, vnDay } from './core.js';
import { computeReview } from './review.js';
import { slotDefs, slotOf } from './slots.js';
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
   "người báo khác nhau" thì hai người báo giống số cũng bị coi là xung đột.
   t0 = 0h hôm nay (ms): chỉ so với lần báo ĐẾM TRONG HÔM NAY. Báo cáo chưa duyệt của hôm qua được
   chuyển sang hôm nay (xem carryStmts) — số hôm nay khác số hôm qua là chuyện thường, không phải
   hai người báo khác nhau. */
export const conflictCond = (day, khu, usr, data, t0) =>
  `EXISTS (SELECT 1 FROM counts c, json_each(?${data}) j
     WHERE c.day = ?${day} AND c.khu_id = ?${khu} AND c.phi_id = ${J('phi')}
       AND c.user_id <> ?${usr} AND c.v <> ${J('v')} AND c.ts >= ?${t0})`;
// 0h giờ Việt Nam của một ngày, tính bằng mili-giây
export const dayStart = (day) => Date.parse(day + 'T00:00:00+07:00');

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

  const [closedR, khuR, setR, phiR, kpR, prevR, innR, asgR, rcR, refR] = await env.DB.batch([
    env.DB.prepare('SELECT kind FROM day_close WHERE day = ?').bind(day),
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
    env.DB.prepare('SELECT recount FROM khu_report WHERE day = ? AND khu_id = ?').bind(day, khuId),
    /* Số MỐC của từng phi, đúng con số máy khách gọi là "số hôm qua" (refOf ở app.js): lần đếm đã
       duyệt gần nhất kể từ lần chốt trước (eff = 1), chưa có thì tồn chuẩn của lần chốt đó. Dùng để
       kiểm ô "giữ nguyên" — xem chỗ dùng refBy bên dưới. */
    env.DB.prepare(
      `SELECT c.phi_id, c.duyet_v v, 1 eff FROM counts c
       WHERE c.khu_id = ?1 AND c.duyet_v IS NOT NULL
         AND c.day > (SELECT COALESCE(MAX(day), '') FROM day_close WHERE day < ?2) AND c.day <= ?2
         AND c.day = (SELECT MAX(c2.day) FROM counts c2 WHERE c2.khu_id = ?1 AND c2.phi_id = c.phi_id
                      AND c2.duyet_v IS NOT NULL
                      AND c2.day > (SELECT COALESCE(MAX(day), '') FROM day_close WHERE day < ?2) AND c2.day <= ?2)
       UNION ALL
       SELECT b.phi_id, b.v, 0 eff FROM baseline b
       WHERE b.khu_id = ?1 AND b.day = (SELECT COALESCE(MAX(day), '') FROM day_close WHERE day < ?2)`
    ).bind(khuId, day),
  ]);
  const refBy = {};
  refR.results.forEach((r) => { if (r.eff || !(r.phi_id in refBy)) refBy[r.phi_id] = r.v; });
  /* Admin đã yêu cầu đếm lại: lần báo này là để THAY số cũ, nên khác số người trước không phải là
     xung đột — không thì mọi lần đếm lại sau một xung đột đều tự bật ra xung đột mới. */
  const demLai = !!(rcR.results[0] && rcR.results[0].recount);
  const moved = Object.fromEntries(innR.results.map((r) => [r.phi_id, r.q]));
  /* Sổ ngày tự chốt sau nửa đêm, nên ngày HÔM NAY chỉ bị khoá khi admin vừa đặt lại số liệu (mốc
     kiểm kê khoá luôn hôm đó) — hoặc ngày deploy bản này mà admin đã lỡ chốt tay từ trước. */
  if (closedR.results.length) {
    throw new HttpError(409, closedR.results[0].kind === 'reset' ? 'Hôm nay vừa đặt lại số liệu, ngày đã khoá. Ngày mai hãy báo số như thường.'
      : 'Sổ hôm nay đã chốt. Ngày mai hãy báo số như thường.', 'closed');
  }
  const t0 = dayStart(day);
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
  /* Mốc để so XUNG ĐỘT: chỉ lần báo của người khác TRONG CÙNG KHUNG GIỜ mới đem so. Bắt đếm 2 lần/ngày
     thì số buổi chiều khác buổi sáng là chuyện thường (thép dùng, thép về giữa hai buổi) — coi là
     "hai người báo khác số" thì ngày nào khu cũng bị bắt chọn số, và nút chọn lại mời admin lấy số
     buổi sáng đè số buổi chiều. Khung đầu tính từ 0h (đếm trước giờ làm cũng thuộc khung đầu). */
  let tXd = t0;
  if (settings.report_slots_per_day > 1) {
    const i = slotOf(at, settings);
    if (i > 0) tXd = t0 + Math.round(slotDefs(settings)[i].from * 3600e3);
  }
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
    // chỉ lần báo ĐẾM HÔM NAY mới đã cộng chuỗi hôm nay; số chuyển từ hôm qua đã cộng vào ngày hôm qua
    if (p && p.kind === 'giu' && p.ts >= t0) keep0 = Math.max(0, keep0 - 1);
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
    /* "Giữ nguyên" là LẤY LẠI số mốc, nên con số đi kèm phải đúng là số mốc. Máy khách chép số mốc
       vào nháp lúc bấm nút; nháp nằm trên máy cả buổi, trong lúc đó admin duyệt một báo cáo khác là
       số mốc đổi mà nháp thì không. Nhận nguyên con số cũ đó là ghi vào sổ một ô mang nhãn "giữ
       nguyên" với số không phải số đang giữ. Từ chối kèm mã riêng để máy tải lại số mốc mới. */
    if (it.kind === 'giu' && refBy[it.phi] !== it.v) {
      throw new HttpError(409, refBy[it.phi] === undefined
        ? `Phi ${it.phi} chưa có số đã duyệt nào để giữ nguyên, hãy đếm thực tế`
        : `Phi ${it.phi}: số đã duyệt gần nhất nay là ${refBy[it.phi]}, không còn là ${it.v} như lúc bạn bấm "Giữ nguyên". Hãy xem lại phi này rồi gửi lại.`, 'giu_lech');
    }
    if (!demLai && p && p.ts >= tXd && p.user_id !== user.id && p.v !== it.v) conflict = 1;
    if (!p || p.v !== it.v) changes.push({ phi: it.phi, from: p ? p.v : null, to: it.v });
    const keep = it.kind === 'giu' ? keep0 + 1 : 0;
    return { ...it, prev: p ? p.v : null, keep };
  });
  const data = JSON.stringify(rows);

  const res = await batchGuarded(env, guardStmt(env, IS_CLOSED, day), [
    // chạy TRƯỚC khi ghi counts: cờ này nói "lần gửi NÀY lệch với người khác", để trả lời người gửi
    env.DB.prepare(`SELECT ${conflictCond(1, 2, 3, 4, 5)} AND NOT EXISTS (SELECT 1 FROM khu_report WHERE day = ?1 AND khu_id = ?2 AND recount = 1) conflict`).bind(day, khuId, user.id, data, tXd),
    env.DB.prepare(
      `INSERT INTO khu_report (day, khu_id, user_id, ts, conflict, resolved, recount)
       SELECT ?1, ?2, ?3, ?4, CASE WHEN ${conflictCond(1, 2, 3, 5, 6)} THEN 1 ELSE 0 END, 0, 0
       WHERE 1
       ON CONFLICT(day, khu_id) DO UPDATE SET user_id = excluded.user_id, ts = excluded.ts,
         conflict = CASE WHEN khu_report.recount = 1 THEN 0 WHEN excluded.conflict = 1 THEN 1 ELSE khu_report.conflict END,
         resolved = CASE WHEN khu_report.recount = 1 THEN 0 WHEN excluded.conflict = 1 THEN 0 ELSE khu_report.resolved END,
         recount = 0`
    ).bind(day, khuId, user.id, ts, data, tXd),
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
/* mark: dấu của khu lúc admin tải màn Duyệt (xem computeReview). Khu báo lại sau lúc đó thì số
   admin chọn là chọn trên bảng so sánh đã cũ — ghi vào là đè mất lần báo mới mà không ai thấy. */
export async function conflictResolve(req, env, user) {
  const b = await readJson(req);
  const khu = String(b.khu || '');
  const day = vnDay();
  if (b.mark !== undefined) {
    const k = (await computeReview(env, day)).khus.find((x) => x.khu === khu);
    if (!k || k.mark !== b.mark) throw new HttpError(409, 'Khu vừa báo lại số khác. Màn Duyệt đã tải lại, hãy so sánh lại rồi chọn.', 'changed');
  }
  const [closedR, curR, repR] = await env.DB.batch([
    env.DB.prepare('SELECT 1 x FROM day_close WHERE day = ?').bind(day),
    env.DB.prepare('SELECT phi_id, v, kind, ts, duyet_at FROM counts WHERE day = ? AND khu_id = ?').bind(day, khu),
    env.DB.prepare('SELECT 1 x FROM khu_report WHERE day = ? AND khu_id = ?').bind(day, khu),
  ]);
  if (closedR.results.length) throw new HttpError(409, 'Ngày hôm nay đã chốt', 'closed');
  if (!repR.results.length) throw bad('Không có khu cần xử lý');
  const cur = Object.fromEntries(curR.results.map((r) => [r.phi_id, r]));
  const pick = b.pick && typeof b.pick === 'object' ? b.pick : {};
  /* from: lần báo (ts) mà số được chọn lấy ra — một số cho cả lần báo, hoặc { phi: ts } khi chọn từng
     phi giữa hai người. Dùng để giữ LOẠI của ô: chọn lại một lần báo mà ô đó "để trống" thì nó vẫn là
     để trống, không thành "admin xác nhận đếm = 0" — nếu không thì cảnh báo "để trống phi đang có
     thép" ở màn Duyệt biến mất đúng lúc nó cần nhất. */
  const from = b.from;
  const srcTs = (phi) => Number(from && typeof from === 'object' ? from[phi] : from) || 0;
  const tsList = [...new Set(Object.keys(pick).map(srcTs).filter(Boolean))];
  const logKind = {};
  if (tsList.length) {
    const lg = await env.DB.prepare(
      `SELECT phi_id, ts, kind FROM counts_log WHERE day = ?1 AND khu_id = ?2 AND ts IN (SELECT value FROM json_each(?3))`
    ).bind(day, khu, JSON.stringify(tsList)).all();
    lg.results.forEach((r) => (logKind[r.ts + '|' + r.phi_id] = r.kind));
  }
  const changes = [];
  for (const phi of Object.keys(pick)) {
    if (!(phi in cur)) throw bad('Phi không có trong báo cáo: ' + phi);
    const v = intIn(pick[phi], 0, 99999, 'Số đếm của ' + phi);
    const kind = v === 0 && logKind[srcTs(phi) + '|' + phi] === 'zero' ? 'zero' : 'dem';
    if (v !== cur[phi].v || kind !== cur[phi].kind) changes.push({ phi, prev: cur[phi].v, v, kind });
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
           kind = (SELECT ${J('kind')} FROM json_each(?3) j WHERE ${J('phi')} = counts.phi_id),
           bo = NULL, le = NULL, user_id = ?4, ts = ?5
         WHERE day = ?1 AND khu_id = ?2 AND phi_id IN (SELECT ${J('phi')} FROM json_each(?3) j)`
      ).bind(day, khu, data, user.id, ts),
      env.DB.prepare(
        `INSERT INTO counts_log (day, khu_id, phi_id, prev_v, v, kind, user_id, ts)
         SELECT ?1, ?2, ${J('phi')}, ${J('prev')}, ${J('v')}, ${J('kind')}, ?3, ?4 FROM json_each(?5) j`
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

/* ========================= HUỶ BÁO CÁO =========================
   Admin thấy báo cáo của khu sai thì HUỶ nó, kèm lý do. Huỷ là gỡ hẳn số đang chờ duyệt:
   - ô chưa từng được duyệt trong kỳ: xoá dòng, khu trở về "chưa báo";
   - ô đã có một lần báo ĐƯỢC DUYỆT trước đó (báo sáng đã duyệt, báo lại chiều bị huỷ): trả ô về
     đúng lần đã duyệt — số đã duyệt vẫn là tồn, huỷ không đụng tới nó.
   Tồn không đổi: báo cáo bị huỷ chưa bao giờ vào tồn (chưa duyệt thì không vào tồn).
   Chỉ huỷ được báo cáo ĐANG CHỜ DUYỆT. Báo cáo đã duyệt thì số đã là tồn; muốn sửa thì khu báo
   lại, hoặc lập phiếu Điều chỉnh tồn — không có đường "huỷ" làm tồn lặng lẽ lùi về số cũ.

   Người gửi báo cáo thấy thông báo "báo cáo bị huỷ" kèm lý do (bảng bao_cao_huy, gửi xuống qua
   bootstrap) cho tới khi khu báo lại. Dấu khung giờ đã đếm của lần báo bị huỷ cũng gỡ: báo cáo bị
   huỷ không tính là đã đếm buổi đó.
   mark: dấu của khu lúc admin tải màn Duyệt (xem computeReview) — khu vừa báo lại thì không huỷ
   nhầm một báo cáo admin chưa nhìn thấy. */
export async function huyBaoCao(req, env, user) {
  const b = await readJson(req);
  const khu = String(b.khu || '');
  const lyDo = String(b.ly_do || '').trim().slice(0, 300);
  if (!lyDo) throw bad('Phải ghi lý do huỷ báo cáo, để người đếm biết cần đếm lại chỗ nào');
  const day = vnDay();
  const rv = await computeReview(env, day);
  if (rv.closed) throw new HttpError(409, 'Ngày hôm nay đã chốt', 'closed');
  const k = rv.khus.find((x) => x.khu === khu);
  if (!k) throw bad('Khu không hợp lệ');
  if (b.mark !== undefined && k.mark !== b.mark) {
    throw new HttpError(409, k.name + ' vừa có số hoặc phiếu mới. Màn Duyệt đã tải lại, hãy xem rồi quyết định.', 'changed');
  }
  if (!k.waiting) throw bad(k.rep ? 'Báo cáo của khu này đã duyệt, số đã vào tồn. Muốn sửa thì để khu báo lại, hoặc lập phiếu Điều chỉnh tồn.' : 'Khu này chưa có báo cáo nào để huỷ');
  const last = rv.last || '';
  const CHO = 'NOT (duyet_ts IS NOT NULL AND duyet_ts = ts)';
  const { results: cho } = await env.DB.prepare(
    `SELECT c.phi_id, c.v, c.kind, c.user_id, c.ts, ${UNAME} FROM counts c LEFT JOIN users u ON u.id = c.user_id
     WHERE c.khu_id = ?1 AND c.day > ?2 AND c.day <= ?3 AND NOT (c.duyet_ts IS NOT NULL AND c.duyet_ts = c.ts)`
  ).bind(khu, last, day).all();
  if (!cho.length) throw new HttpError(409, 'Báo cáo vừa đổi. Màn Duyệt đã tải lại, hãy xem rồi quyết định.', 'changed');
  const moi = cho.reduce((m, r) => (r.ts > m.ts ? r : m), cho[0]); // lần gửi mới nhất = báo cáo bị huỷ
  const tsList = JSON.stringify([...new Set(cho.map((r) => r.ts))]);
  const t0 = dayStart(day);
  const ts = Date.now();
  const so = cho.filter((r) => r.v !== 0).map((r) => ({ phi: r.phi_id, v: r.v })).slice(0, 30);
  try {
    await batchGuarded(env, guardStmt(env, `${IS_CLOSED} OR (SELECT value FROM meta WHERE key = 'rev') <> ?2`, day, rv.rev), [
      /* Chuỗi "giữ nguyên" đã cộng lúc GỬI báo cáo này: huỷ thì trả lại, không thì người đếm bị bắt
         đếm thật sớm một ngày vì một lần bấm đã bị huỷ. Không trừ khi lần đã duyệt mà ô quay về
         cũng là "giữ nguyên" của hôm nay (chuỗi hôm nay vốn đã tính một lần cho lần đó). */
      env.DB.prepare(
        `UPDATE khu_phi SET keep_streak = MAX(0, keep_streak - 1)
         WHERE khu_id = ?1 AND phi_id IN (SELECT phi_id FROM counts WHERE khu_id = ?1 AND day > ?2 AND day <= ?3 AND ${CHO}
           AND kind = 'giu' AND ts >= ?4 AND NOT (duyet_v IS NOT NULL AND duyet_kind = 'giu' AND duyet_ts >= ?4))`
      ).bind(khu, last, day, t0),
      env.DB.prepare('DELETE FROM khu_report_log WHERE day = ?1 AND khu_id = ?2 AND ts IN (SELECT value FROM json_each(?3))').bind(day, khu, tsList),
      // ô có lần báo đã duyệt trước đó: quay về đúng lần đó (người báo lấy lại từ lịch sử đếm)
      env.DB.prepare(
        `UPDATE counts SET v = duyet_v, kind = duyet_kind, ts = duyet_ts, bo = NULL, le = NULL,
           user_id = COALESCE((SELECT l.user_id FROM counts_log l WHERE l.day = counts.day AND l.khu_id = counts.khu_id
                               AND l.phi_id = counts.phi_id AND l.ts = counts.duyet_ts ORDER BY l.id DESC LIMIT 1), user_id)
         WHERE khu_id = ?1 AND day > ?2 AND day <= ?3 AND ${CHO} AND duyet_v IS NOT NULL`
      ).bind(khu, last, day),
      // ô chưa từng được duyệt: sau câu trên, mọi ô còn duyet_v NULL đều là ô đang chờ
      env.DB.prepare('DELETE FROM counts WHERE khu_id = ?1 AND day > ?2 AND day <= ?3 AND duyet_v IS NULL').bind(khu, last, day),
      // dấu "khu đã báo": không còn ô nào thì khu là CHƯA BÁO; còn (lần đã duyệt) thì trỏ lại lần đó
      env.DB.prepare(
        `DELETE FROM khu_report WHERE khu_id = ?1 AND day > ?2 AND day <= ?3
           AND NOT EXISTS (SELECT 1 FROM counts c WHERE c.day = khu_report.day AND c.khu_id = khu_report.khu_id)`
      ).bind(khu, last, day),
      env.DB.prepare(
        `UPDATE khu_report SET conflict = 0, resolved = 0, recount = 0,
           ts = (SELECT MAX(c.ts) FROM counts c WHERE c.day = khu_report.day AND c.khu_id = khu_report.khu_id),
           user_id = (SELECT c.user_id FROM counts c WHERE c.day = khu_report.day AND c.khu_id = khu_report.khu_id ORDER BY c.ts DESC LIMIT 1)
         WHERE khu_id = ?1 AND day > ?2 AND day <= ?3`
      ).bind(khu, last, day),
      env.DB.prepare('INSERT INTO bao_cao_huy (day, khu_id, user_id, rep_ts, ly_do, huy_by, huy_name, ts) VALUES (?,?,?,?,?,?,?,?)')
        .bind(day, khu, moi.user_id, moi.ts, lyDo, user.id, user.name, ts),
      auditStmt(env, user, 'report_cancel', { khu, ly_do: lyDo, nguoi_bao: moi.uname, luc_bao: moi.ts, so }),
      bump(env),
    ], closedErr());
  } catch (e) {
    if (!(e instanceof HttpError) || e.code !== 'closed') throw e;
    if (await env.DB.prepare('SELECT 1 x FROM day_close WHERE day = ?').bind(day).first()) throw e;
    throw new HttpError(409, 'Vừa có số liệu mới. Màn Duyệt đã tải lại, hãy xem rồi quyết định.', 'changed');
  }
  return json({ ok: true, nguoi_bao: moi.uname });
}
