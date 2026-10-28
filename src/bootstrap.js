// Dữ liệu chung một lần tải cho máy khách (/bootstrap).
import { HIGH_KG, MIN_RATE_DAYS, NEG_KG, PHI_DEFAULTS, capOf, duyetCuaNguoi, duyetPhieuDuoc, vnDay } from './core.js';
import { slotInfo } from './slots.js';
import { DUYET_JOIN, DUYET_NAME, SETTINGS_SQL, UNAME, parseSettings } from './helpers.js';
import { EFF_SELECT, MV_NEW } from './counts.js';
import { DC_BIG_KG, DC_REASONS, DC_WORD } from './phieu.js';
import { LOAN_LOT_SQL, loanLots } from './loans.js';
import { GC_BAO_HUY_MS, GC_CHUA_XUAT, GC_CHUA_XUAT_IDX, tnMoi, tnMoiStmt } from './giacong.js';
import { bcDaStmt, qsBoot, qsBootStmt, qsToiStmt } from './quanso.js';

/* ========================= DỮ LIỆU CHUNG ========================= */

export async function bootstrap(env, user) {
  const day = vnDay();
  /* Ngày chốt gần nhất nằm NGAY TRONG từng câu (câu con LAST) chứ không hỏi trước bằng một lượt riêng:
     đây là request nặng chạy nhiều nhất, mỗi lượt gọi D1 là một vòng mạng mà máy ngoài bãi phải chờ.
     ?1 luôn là hôm nay. kyNay đổi câu dùng chung (?1 = ngày chốt trước, ?2 = ngày đang xét) sang dạng đó. */
  const LAST = "(SELECT COALESCE(MAX(day), '') FROM day_close WHERE day < ?1)";
  const kyNay = (sql) => sql.replace(/\?1/g, LAST).replace(/\?2/g, '?1');
  const [phi, khu, khuPhi, counts, baseline, reports, reportTimes, receipts, closed, rev, innKhu, eff, mvNew, settings, rates, khuUser, uFirst, doitacAct, loanPending, loanLotR, huyR, phieuTsR, lastR, gcR, qsR, qsToiR, bcDaR, cfgR, gcTnR, tnR, svR] = await env.DB.batch([
    env.DB.prepare('SELECT id, kg_per_cay, bo_size, min_stock, unit, active FROM phi ORDER BY sort'),
    env.DB.prepare('SELECT id, name, active FROM khu ORDER BY sort, id'),
    env.DB.prepare('SELECT khu_id, phi_id, keep_streak FROM khu_phi'),
    env.DB.prepare(`SELECT c.khu_id, c.phi_id, c.v, c.kind, c.bo, c.le, c.user_id, ${UNAME}, c.ts, c.cap,
                      c.duyet_v, c.duyet_ts, c.duyet_at, ${DUYET_NAME}
                    FROM counts c LEFT JOIN users u ON u.id = c.user_id ${DUYET_JOIN} WHERE c.day = ?`).bind(day),
    env.DB.prepare(`SELECT khu_id, phi_id, v FROM baseline WHERE day = ${LAST}`).bind(day),
    env.DB.prepare(`SELECT r.khu_id, r.user_id, ${UNAME}, r.ts, r.conflict, r.resolved FROM khu_report r LEFT JOIN users u ON u.id = r.user_id WHERE r.day = ?`).bind(day),
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
    env.DB.prepare('SELECT kind FROM day_close WHERE day = ?').bind(day),
    env.DB.prepare("SELECT value FROM meta WHERE key = 'rev'"),
    /* Nhập/chuyển/xuất ĐÃ DUYỆT kể từ lần chốt gần nhất theo khu × phi × LOẠI (gồm cả ngày
       quên chốt). Lọc theo duyet_day chứ không phải day: phiếu chỉ tác động tới tồn kể từ ngày được
       duyệt. Phải tách theo kind vì màn Tổng quan cũng tính "đã dùng", và phần XUẤT phải bị trừ
       ra khỏi vế nhập đúng như server làm — hai bên lệch nhau là hai màn nói hai con số khác nhau. */
    env.DB.prepare(`SELECT khu_id, phi_id, kind, SUM(qty) q FROM receipts WHERE voided = 0 AND duyet_day IS NOT NULL AND duyet_day > ${LAST} AND duyet_day <= ?1 GROUP BY khu_id, phi_id, kind`).bind(day),
    // số đếm hiệu lực của từng ô: khu báo hôm qua mà hôm nay chưa báo thì vẫn phải lấy số hôm qua,
    // không được quay về tồn chuẩn cũ (xem EFF_SELECT)
    env.DB.prepare(kyNay(EFF_SELECT)).bind(day),
    // lượng nhập/chuyển xảy ra SAU lần đếm hiệu lực: đây mới là phần chưa nằm trong số đếm
    env.DB.prepare(kyNay(MV_NEW)).bind(day),
    env.DB.prepare(SETTINGS_SQL),
    env.DB.prepare('SELECT phi_id, per_day, days FROM phi_rate'),
    // kèm tên: Tổng quan của admin nói được khu chưa báo là của ai, để biết nhắc ai
    env.DB.prepare('SELECT ku.khu_id, ku.user_id, u.name FROM khu_user ku JOIN users u ON u.id = ku.user_id WHERE u.deleted = 0'),
    /* Id admin ĐẦU TIÊN (xem firstAdminId). Gửi trong bootstrap chứ không chỉ trong /users: những
       việc dành riêng cho chủ hệ thống nằm rải ở nhiều màn (đặt lại số liệu, mở lại ngày đã qua),
       mà /users chỉ nạp khi vào đúng màn Người dùng — thiếu nó thì nút biến mất đúng lúc cần. */
    env.DB.prepare("SELECT MIN(id) id FROM users WHERE role = 'admin' AND deleted = 0"),
    // danh sách đối tác đang hiện, cho ô chọn khi ghi vay/mượn (xem màn Vay mượn, nạp đầy đủ riêng ở /loans)
    env.DB.prepare('SELECT id, name FROM doitac WHERE active = 1 ORDER BY name'),
    // đếm nhanh để nhắc ở Tổng quan; chi tiết nạp khi vào đúng màn Vay mượn, như /users
    // đếm theo LẦN GHI (grp) chứ không theo dòng: ghi một lần ba phi là MỘT việc admin phải duyệt
    // kèm cấp người ghi và có phiếu kho hay không, để đếm riêng những lần ghi NGƯỜI NÀY duyệt được
    env.DB.prepare(`SELECT MAX(l.cap) cap, MIN(l.user_id) uid,
                      EXISTS (SELECT 1 FROM receipts r WHERE r.grp = l.grp AND r.kind = 'vay' AND r.voided = 0) kho
                    FROM loans l WHERE l.voided = 0 AND l.duyet_ts IS NULL GROUP BY COALESCE(l.grp, l.id)`),
    // các dòng vay mượn đã duyệt: tính phần còn nợ theo từng lần vay để biết khoản nào QUÁ HẠN
    /* Câu này đọc MỌI dòng đã duyệt của sổ vay, dài dần theo năm. Thẻ "quá hạn" chỉ hiện cho người lập
       phiếu được (CVKTHT trở lên), nên Tiểu đội trưởng — phần đông số máy đang mở — không phải trả giá đó. */
    env.DB.prepare(capOf(user.role) >= 1 ? LOAN_LOT_SQL : 'SELECT id FROM loans WHERE 0'),
    /* Báo cáo bị admin huỷ HÔM NAY: máy khách bày thông báo + lý do cho người đã gửi (và người đếm
       được khu đó) cho tới khi khu báo lại. Chỉ lấy lần huỷ mới nhất của mỗi khu. */
    env.DB.prepare(
      `SELECT h.khu_id, h.user_id, ${UNAME}, h.rep_ts, h.ly_do, h.huy_name, h.ts FROM bao_cao_huy h
       LEFT JOIN users u ON u.id = h.user_id
       WHERE h.day = ?1 AND h.id = (SELECT MAX(h2.id) FROM bao_cao_huy h2 WHERE h2.day = ?1 AND h2.khu_id = h.khu_id)`
    ).bind(day),
    /* Lần gần nhất một phiếu kho của khu được duyệt hoặc (đã duyệt rồi) bị huỷ — đúng câu mvTsR của màn
       Duyệt. Tổng quan dùng nó để biết khu nào đếm TRƯỚC lúc có phiếu kho mới (phieuSau), tức CVKTHT
       không duyệt được, mà không phải đoán. */
    // gồm cả phiếu duyệt ở ngày đã chốt sau lần báo cũ nhất còn trong kỳ (báo cáo chuyển qua 0h) — y câu mvTsR, xem đó
    env.DB.prepare(`WITH l AS (SELECT ${LAST} d), m AS (SELECT MIN(ts) t FROM counts, l WHERE day > l.d AND day <= ?1)
                    SELECT khu_id, MAX(duyet_ts) a, MAX(CASE WHEN voided = 1 THEN voided_ts END) b FROM receipts, l, m
                    WHERE duyet_day IS NOT NULL AND duyet_day <= ?1
                      AND duyet_day >= MIN(l.d, COALESCE(date(m.t / 1000 + 25200, 'unixepoch'), l.d))
                      AND (duyet_day > l.d OR duyet_ts > m.t)
                    GROUP BY khu_id`).bind(day),
    env.DB.prepare(`SELECT ${LAST} d`).bind(day),
    /* Đơn gia công CÒN MỞ, chỉ mấy cột đủ để Tổng quan nhắc (đơn mới chưa nhận, trễ hạn, đang vướng, bị mở lại).
       Bảng đơn đầy đủ nạp riêng khi vào tab Gia công, như sổ vay mượn. */
    /* Kèm đơn bị HUỶ mà người giữ đơn CHƯA bấm "đã biết" (tối đa 30 ngày): họ phải thấy để thôi làm, người giao
       thấy để biết bên kia chưa xem. Kèm tên đơn và lý do để thẻ nhắc gọi đúng tên. UNION ALL để cả hai nửa đi
       theo index (tt, cap_ts). */
    env.DB.prepare(`SELECT id, user_id, tt, han, buoi, vuong, vuong_dung, vuong_xem_ts, lam_ts, ts, mo_lai, cau_kien, truc, huy_ly_do, cho_tl, xuat_tt, xong_ts,
                      (SELECT group_concat(user_id) FROM don_gc_nguoi n WHERE n.don_id = don_gc.id) ids,
                      (SELECT group_concat(user_id) FROM don_gc_nguoi n WHERE n.don_id = don_gc.id AND n.biet_ts IS NULL) chua_biet FROM don_gc WHERE tt IN ('moi', 'nhan', 'lam')
                    UNION ALL SELECT id, user_id, tt, han, buoi, vuong, vuong_dung, vuong_xem_ts, lam_ts, ts, mo_lai, cau_kien, truc, huy_ly_do, cho_tl, xuat_tt, xong_ts,
                      (SELECT group_concat(user_id) FROM don_gc_nguoi n WHERE n.don_id = don_gc.id) ids,
                      (SELECT group_concat(user_id) FROM don_gc_nguoi n WHERE n.don_id = don_gc.id AND n.biet_ts IS NULL) chua_biet FROM don_gc
                      WHERE tt = 'huy' AND cap_ts > ? AND biet_ts IS NULL
                    UNION ALL SELECT id, user_id, tt, han, buoi, vuong, vuong_dung, vuong_xem_ts, lam_ts, ts, mo_lai, cau_kien, truc, huy_ly_do, cho_tl, xuat_tt, xong_ts,
                      (SELECT group_concat(user_id) FROM don_gc_nguoi n WHERE n.don_id = don_gc.id) ids, NULL chua_biet FROM don_gc ${GC_CHUA_XUAT_IDX}
                      WHERE ${GC_CHUA_XUAT}`).bind(Date.now() - GC_BAO_HUY_MS),
    // quân số đầu ca: tổ nào đã báo ca đang diễn ra và ca kế tiếp (xem qsBoot)
    qsBootStmt(env),
    // và mấy lần báo gần nhất của chính người đang xem, cho thẻ báo quân số trên Tổng quan (xem qsToiStmt)
    qsToiStmt(env, user),
    bcDaStmt(env),
    // lịch ca và số thiết lập của các tổ (mẫu báo cáo, xem docCfg)
    env.DB.prepare('SELECT data FROM bc_mau WHERE id = 1'),
    // trao đổi trên đơn gia công: đơn liên quan tới người này có tin chưa đọc, và bộ đếm tin hiện tại (xem gcTn)
    tnMoiStmt(env, user),
    env.DB.prepare("SELECT value FROM meta WHERE key = 'tn'"),
    // lần xuất sắt vụn chờ duyệt: chỉ cấp và người ghi, để đếm đúng số lần NGƯỜI NÀY duyệt được (xem duyetSv)
    env.DB.prepare('SELECT cap, user_id uid FROM satvun WHERE voided = 0 AND duyet_ts IS NULL'),
  ]);
  const last = (lastR.results[0] || {}).d || '';
  return {
    rev: rev.results[0] ? rev.results[0].value : 0,
    today: day,
    lastClosed: last || null,
    closed: closed.results.length > 0,
    // hôm nay là mốc đặt lại số liệu (cách duy nhất để ngày hôm nay bị khoá, xem putCounts)
    closedReset: !!(closed.results[0] && closed.results[0].kind === 'reset'),
    user: { id: user.id, name: user.name, role: user.role, chuc_danh: user.chuc_danh || null, thep_ve: user.thep_ve ? 1 : 0 },
    uFirst: (uFirst.results[0] || {}).id || 0,
    phi: phi.results,
    khu: khu.results,
    khuPhi: khuPhi.results,
    counts: counts.results,
    baseline: baseline.results,
    reports: reports.results,
    huy: huyR.results,
    phieuTs: Object.fromEntries(phieuTsR.results.map((r) => [r.khu_id, Math.max(r.a || 0, r.b || 0)])),
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
    gc: gcR.results,
    gcTn: tnMoi(gcTnR.results),
    tn: (tnR.results[0] || {}).value || 0,
    qs: qsBoot(qsR.results, parseSettings(settings.results), user, qsToiR.results, bcDaR.results, cfgR.results[0]),
    svPending: svR.results.length,
    svDuyet: svR.results.filter((x) => duyetCuaNguoi(user, x.cap, [x.uid])).length,
    loanPending: loanPending.results.length,
    /* Trong đó, số lần ghi người đang xem DUYỆT ĐƯỢC (cùng luật với duyetLoan): thẻ nhắc ở Tổng quan
       dùng số này, không thì CVKTHT bị nhắc cả những lần ghi phải chờ cấp trên. */
    loanDuyet: loanPending.results.filter((x) => (x.kho ? duyetPhieuDuoc(user.role) : duyetCuaNguoi(user, x.cap, [x.uid]))).length,
    // số khoản (lần vay còn nợ) đã quá hạn trả, theo hai chiều: mình nợ đối tác / đối tác nợ mình
    loanQuaHan: (() => { const l = loanLots(loanLotR.results, day).filter((x) => x.quaHan); return { no: l.filter((x) => x.chieu === 'no').length, co: l.filter((x) => x.chieu === 'co').length }; })(),
  };
}
