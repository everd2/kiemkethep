// Đặt lại số liệu thép, sao lưu toàn bộ và nạp lại.
import { HttpError, bad, json, vnDay } from './core.js';
import { RATE_SQL } from './db.js';
import { auditStmt, batchGuarded, bump, guardStmt, readJson } from './helpers.js';
import { J, KHU_X_PHI } from './counts.js';
import { computeReview } from './review.js';
import { firstAdminId } from './admin.js';

/* ========================= ĐẶT LẠI SỐ LIỆU THÉP =========================
   Hai việc khác nhau, cố ý tách làm hai đường vì hậu quả khác nhau một trời một vực.

   1. ĐẶT TỒN VỀ 0 (mode 'zero') — kiểm kê lại. Ghi một mốc "cả bãi = 0" cho hôm nay, giữ nguyên
      toàn bộ lịch sử: báo cáo theo kỳ cũ vẫn xem được, và thống kê tính lại từ mốc này. Hoàn tác
      được bằng chính nút "Mở lại ngày hôm nay" ở màn Duyệt.
      Điểm phải cẩn thận: lượng dùng của ngày đặt lại để TRỐNG (dung = NULL) chứ không ghi số.
      Nếu ghi thì chênh lệch giữa tồn cũ và 0 thành một cú "đã dùng" khổng lồ, nó vào phi_rate và
      kéo theo cảnh báo "dùng nhiều bất thường" sai suốt 28 ngày sau. Để trống là đúng nghĩa:
      ngày kiểm kê lại không nói gì về lượng dùng, y như ngày mở sổ đầu tiên.

   2. XOÁ SẠCH (mode 'wipe') — như bãi mới dựng. Xoá số đếm, tồn chuẩn, phiếu, các ngày đã chốt,
      bảng tổng hợp và tốc độ dùng. Báo cáo theo kỳ cũ mất theo. KHÔNG hoàn tác được.

   Cả hai KHÔNG chạm được hai bảng chỉ-ghi-thêm: nhật ký (audit) và lịch sử đếm (counts_log),
   vì trigger của database từ chối mọi lệnh xoá. Đó là may chứ không phải vướng: dòng nhật ký của
   chính lần đặt lại này ghi kèm TỔNG SỐ THÉP TRƯỚC KHI XOÁ theo từng phi, nên con số cũ còn một
   chỗ đọc lại được mãi mãi, kể cả sau khi xoá sạch. */
export const WIPE_WORD = 'XOA SACH';

export async function resetData(req, env, user) {
  const b = await readJson(req);
  const mode = String(b.mode || '');
  if (mode !== 'zero' && mode !== 'wipe') throw bad('Kiểu đặt lại không hợp lệ');
  const first = await firstAdminId(env);
  if (user.id !== first) {
    throw new HttpError(403, 'Chỉ admin đầu tiên (người thiết lập hệ thống) mới đặt lại số liệu thép');
  }
  const day = vnDay();
  const rv = await computeReview(env, day);

  /* Tổng thép đang có theo từng phi, tính TRƯỚC khi xoá, để ghi vào nhật ký. rv.rows[].cnt là số
     đã duyệt cộng toàn bãi (gồm cả khu đã ẩn còn thép), đúng con số màn Tồn bãi đang hiện. */
  const truoc = rv.rows.filter((r) => r.cnt).map((r) => ({ phi: r.phi, v: r.cnt, kg: Math.round(r.cnt * r.kg) }));
  const tanTruoc = Math.round(truoc.reduce((a, x) => a + x.kg, 0) / 1000 * 100) / 100;

  if (mode === 'wipe') {
    if (String(b.confirm || '').trim().toUpperCase() !== WIPE_WORD) {
      throw new HttpError(409, `Chưa xác nhận. Hãy gõ đúng "${WIPE_WORD}" để xoá sạch số liệu thép.`, 'need_confirm');
    }
    await env.DB.batch([
      env.DB.prepare('DELETE FROM counts'),
      env.DB.prepare('DELETE FROM khu_report'),
      env.DB.prepare('DELETE FROM khu_report_log'),
      env.DB.prepare('DELETE FROM receipts'),
      env.DB.prepare('DELETE FROM day_close'),
      env.DB.prepare('DELETE FROM baseline'),
      env.DB.prepare('DELETE FROM daily_summary'),
      env.DB.prepare('DELETE FROM phi_rate'),
      // chuỗi "giữ nguyên" cũng phải về 0, không thì người đếm bị bắt đếm thật vì chuỗi của bãi cũ
      env.DB.prepare('UPDATE khu_phi SET keep_streak = 0, zero_days = 0, active = 1'),
      auditStmt(env, user, 'reset_wipe', { day, tan: tanTruoc, truoc }),
      bump(env),
    ]);
    return json({ ok: true, mode, tan: tanTruoc });
  }

  // mode 'zero'
  if (rv.closed) {
    throw new HttpError(409, 'Hôm nay đã chốt. Hãy mở lại ngày hôm nay ở màn Duyệt rồi đặt tồn về 0.', 'closed');
  }
  const last = rv.last || '';
  const ts = Date.now();
  const note = 'Đặt tồn về 0 (kiểm kê lại từ đầu)';
  /* Chụp số đếm và dấu "khu đã báo" của hôm nay TRƯỚC khi ghi đè, để "Mở lại ngày" trả về đúng
     từng ô. Không có ảnh chụp thì hoàn tác chỉ còn cách lùi về tồn chuẩn cũ — và ngày chưa có
     lần chốt nào trước đó thì không có tồn chuẩn nào, số liệu gốc mất hẳn. */
  const [snapC, snapR] = await env.DB.batch([
    env.DB.prepare(`SELECT khu_id, phi_id, v, kind, bo, le, user_id, ts, duyet_v, duyet_kind, duyet_ts, duyet_at, duyet_by, duyet_name
                    FROM counts WHERE day = ?`).bind(day),
    env.DB.prepare('SELECT khu_id, user_id, ts, conflict, resolved, recount FROM khu_report WHERE day = ?').bind(day),
  ]);
  const undo = JSON.stringify({ counts: snapC.results, reports: snapR.results });
  /* Mốc kiểm kê = một lần chốt ngày với mọi số bằng 0. Nhờ đi qua đúng cơ chế chốt ngày mà mọi
     thứ sau đó tự đúng: ngày mai lấy tồn chuẩn này (= 0) làm số dự kiến, số đếm và phiếu của
     hôm nay rơi ra khỏi cửa sổ tính (vì cửa sổ là "sau lần chốt gần nhất"), nên không còn việc
     nào treo lại. used_json để rỗng nên phi_rate không bị cú dùng giả kéo lệch. */
  await batchGuarded(
    env,
    guardStmt(env, "(SELECT value FROM meta WHERE key = 'rev') <> ?1 OR EXISTS (SELECT 1 FROM day_close WHERE day = ?2)", rv.rev, day),
    [
      /* GHI SỐ ĐẾM = 0 CHO MỌI Ô, đã duyệt luôn. Không có bước này thì bấm nút xong màn Tồn bãi
         VẪN hiện số cũ: tồn đọc theo số đếm hiệu lực, còn tồn chuẩn chỉ có tác dụng từ ngày mai.
         Người dùng bấm "Đặt tồn về 0" mà không thấy gì đổi là hỏng hẳn ý nghĩa của nút.
         kind 'dem' vì đây là một lần KIỂM KÊ THẬT do admin khai, không phải ô để trống. */
      env.DB.prepare(
        `INSERT INTO counts (day, khu_id, phi_id, v, kind, bo, le, user_id, ts, duyet_v, duyet_kind, duyet_ts, duyet_at, duyet_by, duyet_name)
         SELECT ?1, kx.khu_id, kx.phi_id, 0, 'dem', 0, 0, ?2, ?3, 0, 'dem', ?3, ?3, ?2, ?4
         FROM (${KHU_X_PHI}
               UNION SELECT khu_id, phi_id FROM baseline WHERE day = ?5
               UNION SELECT khu_id, phi_id FROM counts WHERE day > ?5 AND day <= ?1) kx
         WHERE 1
         ON CONFLICT(day, khu_id, phi_id) DO UPDATE SET
           v = 0, kind = 'dem', bo = 0, le = 0, user_id = ?2, ts = ?3,
           duyet_v = 0, duyet_kind = 'dem', duyet_ts = ?3, duyet_at = ?3, duyet_by = ?2, duyet_name = ?4`
      ).bind(day, user.id, ts, user.name, last),
      /* Đánh dấu MỌI KHU đã báo, do chính admin: lần đặt lại là một cuộc kiểm kê toàn bãi, admin
         khai số cho từng khu. Thiếu dòng này thì các khu chưa báo hôm nay vẫn hiện "Chưa báo"
         ngay sau khi kiểm kê xong, và màn Duyệt đòi họ báo lại một con số admin vừa khai. */
      env.DB.prepare(
        `INSERT INTO khu_report (day, khu_id, user_id, ts, conflict, resolved, recount)
         SELECT ?1, k.id, ?2, ?3, 0, 0, 0 FROM khu k WHERE k.active = 1
         ON CONFLICT(day, khu_id) DO UPDATE SET user_id = ?2, ts = ?3, conflict = 0, resolved = 0, recount = 0`
      ).bind(day, user.id, ts),
      // lịch sử đếm là bảng chỉ-ghi-thêm: lần kiểm kê này cũng phải để lại dấu ở đó
      env.DB.prepare(
        `INSERT INTO counts_log (day, khu_id, phi_id, prev_v, v, kind, user_id, ts)
         SELECT ?1, kx.khu_id, kx.phi_id, NULL, 0, 'dem', ?2, ?3
         FROM (${KHU_X_PHI}
               UNION SELECT khu_id, phi_id FROM baseline WHERE day = ?4) kx`
      ).bind(day, user.id, ts, last),
      env.DB.prepare("INSERT INTO day_close (day, closed_by, ts, note, used_json, exc_json, span, kind, undo_json) VALUES (?,?,?,?,?,?,?,'reset',?)")
        .bind(day, user.id, ts, note, '{}', '[]', 1, undo),
      env.DB.prepare(
        // như lúc chốt thường: nhap là thép thật về, phần điều chỉnh đứng riêng ở cột dc
        `INSERT OR REPLACE INTO daily_summary (day, phi_id, ton, nhap, dung, span, dc, xuat)
         SELECT ?1, ${J('phi')}, 0, ${J('inn')} - ${J('dc')} + ${J('xuat')}, NULL, 1, ${J('dc')}, ${J('xuat')} FROM json_each(?2) j`
      ).bind(day, JSON.stringify(rv.rows.map((r) => ({ phi: r.phi, inn: r.inn, dc: r.dc || 0, xuat: r.xuat || 0 })))),
      env.DB.prepare(RATE_SQL).bind(day),
      // tồn chuẩn hôm nay = 0 ở MỌI ô từng có số, kể cả ô thuộc khu/phi đã bị ẩn mà còn thép
      env.DB.prepare(
        `INSERT OR REPLACE INTO baseline (day, khu_id, phi_id, v)
         SELECT ?1, kx.khu_id, kx.phi_id, 0
         FROM (${KHU_X_PHI}
               UNION SELECT khu_id, phi_id FROM baseline WHERE day = ?2
               UNION SELECT khu_id, phi_id FROM counts WHERE duyet_v IS NOT NULL AND day > ?2 AND day <= ?1) kx`
      ).bind(day, last),
      auditStmt(env, user, 'reset_zero', { day, tan: tanTruoc, truoc }),
      bump(env),
    ],
    new HttpError(409, 'Vừa có số liệu mới hoặc ngày đã được chốt. Hãy tải lại trang rồi làm lại.', 'changed')
  );
  return json({ ok: true, mode, tan: tanTruoc });
}

/* ========================= SAO LƯU / NẠP LẠI =========================
   Lý do có phần này: app đã có nút "Xoá sạch dữ liệu thép", mà bản sao duy nhất trước đây là hai
   tệp CSV — không chứa phiếu, không chứa tài khoản, và quan trọng nhất là KHÔNG NẠP LẠI ĐƯỢC.
   Một lần bấm nhầm là mất, không có đường lùi. Đây là cái bao cho con dao đó.

   Hai bảng CHỈ-GHI-THÊM (audit, counts_log) được chép vào bản sao để còn đọc lại, nhưng khi nạp
   lại thì KHÔNG đụng tới: trigger của database từ chối xoá chúng, nên nạp lại chỉ có thể cộng
   thêm bản sao vào những dòng đang có, tức nhân đôi lịch sử. Thà để nguyên và ghi một dòng nhật
   ký nói rõ vừa nạp lại từ bản sao. */

// Bảng dựng nên TRẠNG THÁI của bãi: nạp lại là thay sạch những bảng này.
export const BK_STATE = ['phi', 'khu', 'khu_phi', 'khu_user', 'users', 'counts', 'khu_report', 'khu_report_log',
  'receipts', 'day_close', 'daily_summary', 'phi_rate', 'baseline', 'settings', 'doitac', 'loans'];
/* Bản sao của cấu trúc cũ vẫn nạp được khi cấu trúc mới CHỈ THÊM BẢNG: nạp lại đã chỉ lấy cột
   bảng hiện tại có, và bảng tệp không có thì để trống. Chỉ lùi ĐÚNG MỘT bản (ngay trước), không
   lùi xa hơn: mỗi bản chỉ được kiểm "chỉ thêm bảng" so với bản liền trước nó lúc viết, lùi hai
   bản là cộng dồn hai lần đổi mà không ai soát lại cả hai cùng lúc. Bản 15 chỉ thêm khu_report_log
   (dấu khung giờ đã đếm); bản 16 chỉ thêm doitac/loans (sổ vay mượn, tách khỏi tồn kho).
   Đổi cột hay đổi nghĩa bảng cũ thì KHÔNG được thêm vào đây. */
export const BK_GIU_NEU_THIEU = ['doitac', 'loans'];
export const BK_COMPAT = { 15: [14], 16: [15] };
/* Bảng chỉ-ghi-thêm: chép ra để đọc, không nạp lại. Nhật ký và lịch sử đếm dài vô hạn theo thời
   gian nên phải chặn trần, không thì một ngày nào đó bản sao to tới mức Worker không dựng nổi và
   nút sao lưu hỏng đúng lúc cần nhất. Lấy phần MỚI NHẤT vì đó là phần hay phải tra. */
export const BK_LOG = ['audit', 'counts_log'];
export const BK_LOG_MAX = 20000;
// sessions và login_fail cố ý bỏ: phiên đăng nhập và số lần nhập sai PIN không phải số liệu bãi

export const bkCols = async (env, t) => {
  const { results } = await env.DB.prepare(`SELECT name FROM pragma_table_info('${t}')`).all();
  return results.map((r) => r.name);
};

export async function backupData(env, user) {
  const first = await firstAdminId(env);
  if (user.id !== first) {
    throw new HttpError(403, 'Chỉ admin đầu tiên (người thiết lập hệ thống) mới tải được bản sao');
  }
  const out = {};
  const cut = {};
  for (const t of BK_STATE) {
    out[t] = (await env.DB.prepare(`SELECT * FROM ${t}`).all()).results;
  }
  for (const t of BK_LOG) {
    const n = await env.DB.prepare(`SELECT COUNT(*) n FROM ${t}`).first();
    const r = await env.DB.prepare(`SELECT * FROM ${t} ORDER BY id DESC LIMIT ${BK_LOG_MAX}`).all();
    out[t] = r.results.reverse();
    if (n.n > BK_LOG_MAX) cut[t] = n.n; // nói rõ đã cắt, đừng để người dùng tưởng là đủ
  }
  const sc = await env.DB.prepare("SELECT value FROM meta WHERE key = 'schema'").first();
  const body = {
    app: 'kho-thep',
    ban: 1,
    schema: sc ? sc.value : 0,
    luc: Date.now(),
    ngay: vnDay(),
    boi: user.name,
    cat: cut,
    bang: out,
  };
  await auditStmt(env, user, 'backup', {
    ngay: body.ngay,
    dong: Object.fromEntries(Object.keys(out).map((t) => [t, out[t].length])),
  }).run();
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="kho-thep_sao-luu_${body.ngay}.json"`,
      'Cache-Control': 'no-store',
    },
  });
}

/* Nạp lại từ bản sao. Thay SẠCH các bảng trạng thái rồi ghi lại từ tệp — không trộn, vì trộn thì
   không ai nói được cuối cùng số nào thắng. Chặn chặt hơn cả nút xoá sạch: phải đúng admin đầu
   tiên, phải gõ câu xác nhận, và phải CÙNG PHIÊN BẢN CẤU TRÚC. Khác phiên bản mà vẫn nạp là ghi
   dữ liệu cũ vào bảng đã đổi cột — hỏng kiểu không sửa được, nên thà từ chối. */
export async function restoreData(req, env, user) {
  const first = await firstAdminId(env);
  if (user.id !== first) {
    throw new HttpError(403, 'Chỉ admin đầu tiên (người thiết lập hệ thống) mới nạp lại bản sao');
  }
  const b = await readJson(req);
  if (String(b.confirm || '').trim().toUpperCase() !== 'NAP LAI') {
    throw new HttpError(409, 'Chưa xác nhận. Hãy gõ đúng "NAP LAI" để nạp lại từ bản sao.', 'need_confirm');
  }
  const f = b.file;
  if (!f || f.app !== 'kho-thep' || !f.bang) throw bad('Tệp không phải bản sao của ứng dụng này');
  const sc = await env.DB.prepare("SELECT value FROM meta WHERE key = 'schema'").first();
  const now = sc ? sc.value : 0;
  if (Number(f.schema) !== now && !(BK_COMPAT[now] || []).includes(Number(f.schema))) {
    throw bad(`Bản sao thuộc cấu trúc ${f.schema}, hệ thống đang ở ${now}. Không nạp được bản sao khác phiên bản cấu trúc.`);
  }
  /* Tài khoản nằm trong bản sao kèm PIN đã băm. Băm đó vô dụng nếu không có PEPPER, mà PEPPER
     chỉ nằm trên máy chủ chứ không nằm trong tệp — nên tệp rơi ra ngoài cũng không mở được tài
     khoản nào. Nhưng đổi PEPPER rồi nạp lại bản sao cũ thì mọi PIN cũ thành sai: phải đặt lại. */
  const stmts = [];
  const dem = {}, giu = [];
  for (const t of BK_STATE) {
    /* Sổ vay mượn là công nợ với bên NGOÀI, không phải trạng thái của bãi: bản sao cũ chưa có bảng
       đó (bản 14, 15) thì GIỮ NGUYÊN sổ đang có. Không giữ thì nạp một bản sao cũ là xoá sạch công
       nợ đang theo dõi mà không ai hay — tệp không có bảng nghĩa là "không biết", không phải "rỗng". */
    if (BK_GIU_NEU_THIEU.includes(t) && !Array.isArray(f.bang[t])) { giu.push(t); continue; }
    const rows = Array.isArray(f.bang[t]) ? f.bang[t] : [];
    dem[t] = rows.length;
    stmts.push(env.DB.prepare(`DELETE FROM ${t}`));
    if (!rows.length) continue;
    const cols = await bkCols(env, t);
    // chỉ lấy cột mà bảng HIỆN TẠI có; cột lạ trong tệp thì bỏ, thiếu cột thì để mặc định
    const use = cols.filter((c) => rows.some((r) => r[c] !== undefined));
    if (!use.length) continue;
    const sel = use.map((c) => `json_extract(j.value, '$.${c}')`).join(', ');
    stmts.push(env.DB.prepare(
      `INSERT INTO ${t} (${use.join(', ')}) SELECT ${sel} FROM json_each(?1) j`
    ).bind(JSON.stringify(rows)));
  }
  stmts.push(
    auditStmt(env, user, 'restore', { ngay: f.ngay, luc: f.luc, boi: f.boi, dong: dem, giu }),
    bump(env)
  );
  await env.DB.batch(stmts);
  return json({ ok: true, dong: dem, giu });
}
