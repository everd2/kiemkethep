// Dữ liệu chung một lần tải cho máy khách (/bootstrap).
import { HIGH_KG, MIN_RATE_DAYS, NEG_KG, PHI_DEFAULTS, vnDay } from './core.js';
import { slotInfo } from './slots.js';
import { DUYET_JOIN, DUYET_NAME, SETTINGS_SQL, UNAME, parseSettings } from './helpers.js';
import { EFF_SELECT } from './counts.js';
import { DC_BIG_KG, DC_REASONS, DC_WORD } from './phieu.js';

/* ========================= DỮ LIỆU CHUNG ========================= */

export async function bootstrap(env, user) {
  const day = vnDay();
  const lc = await env.DB.prepare('SELECT day FROM day_close WHERE day < ? ORDER BY day DESC LIMIT 1').bind(day).first();
  const last = lc ? lc.day : '';
  const [phi, khu, khuPhi, counts, baseline, reports, reportTimes, receipts, closed, rev, innKhu, eff, mvNew, settings, rates, khuUser, uFirst, doitacAct, loanPending] = await env.DB.batch([
    env.DB.prepare('SELECT id, kg_per_cay, bo_size, min_stock, unit, active FROM phi ORDER BY sort'),
    env.DB.prepare('SELECT id, name, active FROM khu ORDER BY sort, id'),
    env.DB.prepare('SELECT khu_id, phi_id, keep_streak FROM khu_phi'),
    env.DB.prepare(`SELECT c.khu_id, c.phi_id, c.v, c.kind, c.bo, c.le, c.user_id, ${UNAME}, c.ts,
                      c.duyet_v, c.duyet_ts, c.duyet_at, ${DUYET_NAME}
                    FROM counts c LEFT JOIN users u ON u.id = c.user_id ${DUYET_JOIN} WHERE c.day = ?`).bind(day),
    env.DB.prepare('SELECT khu_id, phi_id, v FROM baseline WHERE day = ?').bind(last),
    env.DB.prepare(`SELECT r.khu_id, r.user_id, ${UNAME}, r.ts, r.conflict, r.resolved, r.recount FROM khu_report r LEFT JOIN users u ON u.id = r.user_id WHERE r.day = ?`).bind(day),
    /* Mọi lần khu GỬI báo cáo hôm nay (khu_report chỉ giữ lần mới nhất), để biết khu đã đếm
       khung giờ nào khi admin bắt đếm nhiều lần/ngày. Xem khu_report_log ở migration 15. */
    env.DB.prepare('SELECT khu_id, at FROM khu_report_log WHERE day = ?').bind(day),
    /* Phiếu để hiện danh sách: của hôm nay, CỘNG mọi phiếu còn chờ duyệt của ngày trước.
       Phiếu lập hôm qua chưa ai duyệt vẫn phải nhìn thấy được, không thì nó biến mất khỏi
       màn Nhập kho mà vẫn chưa vào tồn — không ai biết nó còn tồn tại. */
    env.DB.prepare(`SELECT r.id, r.phi_id, r.khu_id, r.qty, r.note, r.kind, r.grp, r.ts, r.user_id, ${UNAME},
                      r.day, r.duyet_day, r.duyet_ts, COALESCE(ud.name, r.duyet_name) duyet_name
                    FROM receipts r LEFT JOIN users u ON u.id = r.user_id LEFT JOIN users ud ON ud.id = r.duyet_by
                    WHERE r.voided = 0 AND (r.day = ?1 OR r.duyet_day IS NULL OR r.duyet_day = ?1) ORDER BY r.id DESC`).bind(day),
    env.DB.prepare('SELECT 1 x FROM day_close WHERE day = ?').bind(day),
    env.DB.prepare("SELECT value FROM meta WHERE key = 'rev'"),
    /* Nhập/chuyển/xuất ĐÃ DUYỆT kể từ lần chốt gần nhất theo khu × phi × LOẠI (gồm cả ngày
       quên chốt). Lọc theo duyet_day chứ không phải day: phiếu chỉ tác động tới tồn kể từ ngày được
       duyệt. Phải tách theo kind vì màn Tổng quan cũng tính "đã dùng", và phần XUẤT phải bị trừ
       ra khỏi vế nhập đúng như server làm — hai bên lệch nhau là hai màn nói hai con số khác nhau. */
    env.DB.prepare('SELECT khu_id, phi_id, kind, SUM(qty) q FROM receipts WHERE voided = 0 AND duyet_day IS NOT NULL AND duyet_day > ? AND duyet_day <= ? GROUP BY khu_id, phi_id, kind').bind(last, day),
    // số đếm hiệu lực của từng ô: khu báo hôm qua mà hôm nay chưa báo thì vẫn phải lấy số hôm qua,
    // không được quay về tồn chuẩn cũ (xem EFF_SELECT)
    env.DB.prepare(EFF_SELECT).bind(last, day),
    // lượng nhập/chuyển xảy ra SAU lần đếm hiệu lực: đây mới là phần chưa nằm trong số đếm
    env.DB.prepare(
      `SELECT r.khu_id, r.phi_id, SUM(r.qty) q FROM receipts r
       LEFT JOIN (${EFF_SELECT}) e ON e.khu_id = r.khu_id AND e.phi_id = r.phi_id
       WHERE r.voided = 0 AND r.duyet_day IS NOT NULL AND r.duyet_day > ?1 AND r.duyet_day <= ?2
         AND (e.ts IS NULL OR r.duyet_ts > e.ts)
       GROUP BY r.khu_id, r.phi_id HAVING SUM(r.qty) <> 0`
    ).bind(last, day),
    env.DB.prepare(SETTINGS_SQL),
    env.DB.prepare('SELECT phi_id, per_day, days FROM phi_rate'),
    env.DB.prepare('SELECT khu_id, user_id FROM khu_user'),
    /* Id admin ĐẦU TIÊN (xem firstAdminId). Gửi trong bootstrap chứ không chỉ trong /users: những
       việc dành riêng cho chủ hệ thống nằm rải ở nhiều màn (đặt lại số liệu, mở lại ngày đã qua),
       mà /users chỉ nạp khi vào đúng màn Người dùng — thiếu nó thì nút biến mất đúng lúc cần. */
    env.DB.prepare("SELECT MIN(id) id FROM users WHERE role = 'admin' AND deleted = 0"),
    // danh sách đối tác đang hiện, cho ô chọn khi ghi vay/mượn (xem màn Vay mượn, nạp đầy đủ riêng ở /loans)
    env.DB.prepare('SELECT id, name FROM doitac WHERE active = 1 ORDER BY name'),
    // đếm nhanh để nhắc ở Tổng quan; chi tiết nạp khi vào đúng màn Vay mượn, như /users
    // đếm theo LẦN GHI (grp) chứ không theo dòng: ghi một lần ba phi là MỘT việc admin phải duyệt
    env.DB.prepare('SELECT COUNT(DISTINCT COALESCE(grp, id)) n FROM loans WHERE voided = 0 AND duyet_ts IS NULL'),
  ]);
  return {
    rev: rev.results[0] ? rev.results[0].value : 0,
    today: day,
    lastClosed: last || null,
    closed: closed.results.length > 0,
    user: { id: user.id, name: user.name, role: user.role },
    uFirst: (uFirst.results[0] || {}).id || 0,
    phi: phi.results,
    khu: khu.results,
    khuPhi: khuPhi.results,
    counts: counts.results,
    baseline: baseline.results,
    reports: reports.results,
    slot: slotInfo(settings.results, reportTimes.results),
    receipts: receipts.results,
    innKhu: innKhu.results,
    eff: eff.results,
    mvNew: mvNew.results,
    rates: rates.results,
    khuUser: khuUser.results,
    settings: parseSettings(settings.results),
    /* Ngưỡng cảnh báo gửi xuống máy khách thay vì chép hằng số sang app.js: trước đây màn Tổng quan
       báo "đã dùng âm" ở mức lệch 1 cây còn màn Duyệt chỉ báo từ 100 kg, nên thẻ đỏ dẫn sang Duyệt
       rồi không có gì để xử lý. Một nguồn số thì hai màn hình không thể lệch nhau nữa. */
    limits: { negKg: NEG_KG, highKg: HIGH_KG, rateDays: MIN_RATE_DAYS, dcBigKg: DC_BIG_KG, dcWord: DC_WORD },
    // nhãn lý do điều chỉnh: gửi xuống thay vì chép sang app.js, để hai bên không bao giờ lệch mã lý do
    dcReasons: Object.entries(DC_REASONS).map(([id, name]) => ({ id, name })),
    phiStd: PHI_DEFAULTS.map((p) => ({ id: p.id, kg_per_cay: p.kg, bo_size: p.bo, min_stock: p.min, unit: p.unit })),
    doitacAct: doitacAct.results,
    loanPending: loanPending.results[0] ? loanPending.results[0].n : 0,
  };
}
