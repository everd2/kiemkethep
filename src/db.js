// Tự nâng cấp cấu trúc database (migration) khi deploy bản mới.
import { seedPhi } from './core.js';

/* ========================= TỰ NÂNG CẤP DATABASE =========================
   Deploy qua GitHub không chạy lại schema.sql, nên Worker tự áp dụng các thay đổi cấu trúc
   một lần (ghi số phiên bản vào meta.schema). Mỗi isolate chỉ tốn 1 truy vấn đọc để kiểm tra. */
export const SCHEMA_VERSION = 16;
export const MIGRATIONS = {
  2: [
    'ALTER TABLE day_close ADD COLUMN span INTEGER NOT NULL DEFAULT 1',
    'ALTER TABLE users ADD COLUMN lock_level INTEGER NOT NULL DEFAULT 0',
    `CREATE TABLE IF NOT EXISTS daily_summary (
       day TEXT NOT NULL, phi_id TEXT NOT NULL, ton INTEGER NOT NULL, nhap INTEGER NOT NULL DEFAULT 0,
       dung INTEGER, span INTEGER NOT NULL DEFAULT 1, PRIMARY KEY (day, phi_id))`,
    'CREATE TABLE IF NOT EXISTS login_fail (ip TEXT NOT NULL, day TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (ip, day))',
    'CREATE INDEX IF NOT EXISTS idx_sessions_exp ON sessions(expires_at)',
    "INSERT OR IGNORE INTO settings (key, value) VALUES ('auto_close', '1')",
    // dựng lại bảng tổng hợp từ các ngày đã chốt trước đây
    'INSERT OR IGNORE INTO daily_summary (day, phi_id, ton, nhap, dung, span) SELECT day, phi_id, SUM(v), 0, NULL, 1 FROM baseline GROUP BY day, phi_id',
    "UPDATE daily_summary SET dung = (SELECT json_extract(dc.used_json, '$.' || daily_summary.phi_id) FROM day_close dc WHERE dc.day = daily_summary.day)",
    'UPDATE daily_summary SET nhap = COALESCE((SELECT SUM(qty) FROM receipts r WHERE r.voided = 0 AND r.day = daily_summary.day AND r.phi_id = daily_summary.phi_id), 0)',
  ],
  3: [
    // kind: 'nhap' (thép về) hoặc 'chuyen' (chuyển khu: một dòng âm ở khu đi, một dòng dương ở khu đến)
    "ALTER TABLE receipts ADD COLUMN kind TEXT NOT NULL DEFAULT 'nhap'",
    // grp: các dòng cùng một phiếu (nhiều phi, hoặc cặp chuyển khu) để hoàn tác cả phiếu
    'ALTER TABLE receipts ADD COLUMN grp TEXT',
    'CREATE INDEX IF NOT EXISTS idx_receipts_grp ON receipts(grp)',
    'CREATE INDEX IF NOT EXISTS idx_counts_log_dk ON counts_log(day, khu_id)',
    // tốc độ dùng trung bình/ngày của từng phi (28 ngày gần nhất), cập nhật khi chốt ngày
    'CREATE TABLE IF NOT EXISTS phi_rate (phi_id TEXT PRIMARY KEY, per_day REAL NOT NULL, days INTEGER NOT NULL)',
    `INSERT OR REPLACE INTO phi_rate (phi_id, per_day, days)
     SELECT phi_id, SUM(dung) * 1.0 / SUM(span), SUM(span) FROM daily_summary
     WHERE dung IS NOT NULL AND day > date((SELECT MAX(day) FROM daily_summary), '-28 days') GROUP BY phi_id`,
  ],
  4: [
    // unit: 'cay' = cây nguyên (D10-D36), 'cuon' = dây cuộn (D8); thống kê hiển thị khác nhau
    "ALTER TABLE phi ADD COLUMN unit TEXT NOT NULL DEFAULT 'cay'",
    "UPDATE phi SET unit = 'cuon' WHERE id = 'D8'",
  ],
  5: [
    // thêm D6 (thép cuộn ~2.000 kg = 100 phần × 20 kg); INSERT OR IGNORE: an toàn nếu D6 đã có
    "INSERT OR IGNORE INTO phi (id, sort, kg_per_cay, bo_size, min_stock, unit) VALUES ('D6', 0, 20, 100, 200, 'cuon')",
  ],
  6: [
    // phân công người phụ trách khu; khu chưa gán ai thì mọi người vẫn đếm được như trước
    'CREATE TABLE IF NOT EXISTS khu_user (khu_id TEXT NOT NULL, user_id INTEGER NOT NULL, PRIMARY KEY (khu_id, user_id))',
    'CREATE INDEX IF NOT EXISTS idx_khu_user_u ON khu_user(user_id)',
  ],
  7: [
    // cờ ẩn phi: bãi không dùng phi nào thì tắt đi cho bảng đếm gọn, dữ liệu cũ vẫn giữ nguyên
    "ALTER TABLE phi ADD COLUMN active INTEGER NOT NULL DEFAULT 1",
  ],
  8: [
    // admin duyệt cảnh báo lệch theo khu; sig = số liệu lúc duyệt, khu báo lại số khác thì duyệt hết hiệu lực
    `CREATE TABLE IF NOT EXISTS review_ack (day TEXT NOT NULL, khu_id TEXT NOT NULL, sig TEXT NOT NULL,
       user_id INTEGER NOT NULL, user_name TEXT, ts INTEGER NOT NULL, PRIMARY KEY (day, khu_id))`,
    // tự chốt chỉ chạy khi admin chủ động bật: tắt nếu admin chưa từng tự chỉnh mục này
    `UPDATE settings SET value = '0' WHERE key = 'auto_close'
       AND NOT EXISTS (SELECT 1 FROM audit WHERE action = 'settings_update' AND detail LIKE '%"auto_close"%')`,
  ],
  9: [
    // voided_ts: lúc hủy phiếu. Hủy phiếu sau khi khu đã báo làm số dự kiến của khu đổi y như
    // nhập muộn, nên màn Duyệt phải biết thời điểm hủy mới cảnh báo được (xem exception 'late').
    'ALTER TABLE receipts ADD COLUMN voided_ts INTEGER',
    // phiếu đã hủy từ trước: lấy ts của phiếu làm mốc, coi như hủy ngay lúc nhập (không cảnh báo lùi)
    'UPDATE receipts SET voided_ts = ts WHERE voided = 1 AND voided_ts IS NULL',
  ],
  /* Bản 1.3 — DUYỆT THEO KHU, và bỏ cơ chế tự ẩn phi khỏi khu.
     Một quy tắc duy nhất: chưa duyệt thì không vào tồn. Áp cho cả báo cáo đếm lẫn phiếu nhập/chuyển. */
  10: [
    /* counts giữ HAI con số cho mỗi ô: v = lần báo mới nhất, duyet_v = số ĐÃ DUYỆT.
       Tồn đọc duyet_v, nên khu báo lại lúc 10h không đè mất số đã duyệt lúc 8h: tồn vẫn là
       số 8h cho tới khi admin duyệt lần báo mới. Đây là chỗ cấu trúc cũ không làm được —
       counts bị ghi đè tại chỗ nên số đã duyệt trước đó không còn đường lấy lại. */
    'ALTER TABLE counts ADD COLUMN duyet_v INTEGER',
    'ALTER TABLE counts ADD COLUMN duyet_kind TEXT',
    /* duyet_ts giữ ts CỦA LẦN BÁO ĐÃ ĐƯỢC DUYỆT, nên "ô này đã duyệt" là phép so BẰNG với ts.
        Lúc đầu cột này giữ giờ duyệt rồi so duyet_ts >= ts, nhưng hai mốc rơi cùng một milligiây
        thì không phân định được, và mặc định sai hướng (coi là đã duyệt) nghĩa là một lần báo
        lọt vào tồn mà không ai duyệt. duyet_at mới là giờ duyệt, chỉ dùng để hiện lên màn hình. */
    'ALTER TABLE counts ADD COLUMN duyet_ts INTEGER',
    'ALTER TABLE counts ADD COLUMN duyet_at INTEGER',
    'ALTER TABLE counts ADD COLUMN duyet_by INTEGER',
    'ALTER TABLE counts ADD COLUMN duyet_name TEXT',
    /* duyet_day: NGÀY DUYỆT phiếu, cũng là ngày phiếu vào tồn. Khác day (ngày nhập) khi phiếu
       nằm chờ qua đêm. Giữ cả hai để chứng từ ghi rõ "nhập 07/10, duyệt 08/10", và nhờ vậy
       không cần chặn chốt ngày vì phiếu treo: nó đơn giản vào tồn của ngày được duyệt. */
    'ALTER TABLE receipts ADD COLUMN duyet_day TEXT',
    'ALTER TABLE receipts ADD COLUMN duyet_ts INTEGER',
    'ALTER TABLE receipts ADD COLUMN duyet_by INTEGER',
    'ALTER TABLE receipts ADD COLUMN duyet_name TEXT',
    /* Dữ liệu đang chạy phải coi như ĐÃ DUYỆT. Thiếu hai câu này là tồn toàn bãi về 0 ngay
       lúc nâng cấp, vì mọi đường đọc tồn sau bản này đều đòi duyet_v/duyet_day.

       Câu đầu đổi luôn kind, vì 'zero' ĐẢO NGHĨA ở bản này: nay nó là "người đếm ĐỂ TRỐNG, hệ
       thống mặc định 0", còn bấm "Hết (0)" ghi 'dem' với v = 0 (đếm thật, xác nhận hết thép).
       Phải phân biệt được hai cái đó để màn Duyệt nói được "khu để trống D25 trong khi dự kiến
       72 cây" — rất khác "khu đã đếm và D25 hết thật". Dòng 'zero' của bản cũ mang nghĩa bấm
       "Hết (0)" nên đổi về 'dem'. Không thêm loại mới vào KINDS vì counts.kind có CHECK, mà đổi
       CHECK thì phải dựng lại bảng — đúng thao tác mà đầu schema.sql cảnh báo.

       Phép đổi kind nằm TRONG câu backfill, dùng chung điều kiện duyet_v IS NULL, chứ không
       tách thành câu riêng: tách ra thì chạy lại migration lần hai (ai đó hạ meta.schema khi
       deploy lỗi) sẽ biến mọi ô "để trống" của dữ liệu MỚI thành "đã đếm ra 0" — xoá sạch đúng
       cái phân biệt vừa dựng. Gộp vào đây thì nó chỉ chạm dữ liệu từ trước bản 1.3. */
    `UPDATE counts SET
       kind = CASE WHEN kind = 'zero' THEN 'dem' ELSE kind END,
       duyet_v = v,
       duyet_kind = CASE WHEN kind = 'zero' THEN 'dem' ELSE kind END,
       duyet_ts = ts, duyet_at = ts, duyet_by = user_id
     WHERE duyet_v IS NULL`,
    'UPDATE receipts SET duyet_day = day, duyet_ts = ts, duyet_by = user_id WHERE duyet_day IS NULL AND voided = 0',
    /* Bỏ tự ẩn phi khỏi khu: mọi khu luôn hiện đủ phi, để trống thì mặc định 0. Mở khoá lại
       mọi ô đang bị ẩn. khu_phi.active và zero_days thành vô dụng nhưng GIỮ CỘT, không DROP:
       xem lời cảnh báo đầu schema.sql, ALTER TABLE ... DROP COLUMN trên SQLite dựng lại câu
       CREATE từ văn bản và đã sập thật một lần. Chỉ còn keep_streak được dùng. */
    'UPDATE khu_phi SET active = 1, zero_days = 0',
    "DELETE FROM settings WHERE key = 'hide_after_zero_days'",
    // review_ack chỉ chứa cờ duyệt cảnh báo trong ngày, nay thay bằng duyet_* trên chính dòng số liệu
    'DROP TABLE IF EXISTS review_ack',
  ],
  /* Xoá tài khoản, nhưng KHÔNG xoá dòng users.
     Mọi số đếm, phiếu, báo cáo khu và lần chốt ngày đều lấy tên người làm bằng cách join users
     (xem UNAME). Xoá hẳn dòng đó là toàn bộ lịch sử của người ấy hiện "(đã xoá)" — mất dấu ai
     đã làm gì, đúng cái không được phép mất. Giữ dòng lại thì mọi tên vẫn đúng mãi mãi, và
     khôi phục được tài khoản xoá nhầm mà không cần mở database. */
  11: [
    'ALTER TABLE users ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0',
  ],
  /* kind: 'reset' = ngày này là MỐC KIỂM KÊ LẠI (đặt tồn cả bãi về 0), NULL = chốt ngày thường.
     Cần phân biệt vì "Mở lại ngày" phải hoàn tác hai thứ khác nhau: chốt thường thì chỉ bỏ mốc
     chốt, còn mốc kiểm kê thì phải bỏ luôn các số 0 mà nó đã ghi vào số đếm — không thì mở lại
     ngày xong tồn vẫn bằng 0 và lần đặt lại coi như không hoàn tác được. */
  12: [
    'ALTER TABLE day_close ADD COLUMN kind TEXT',
    /* undo_json: ảnh chụp số đếm và dấu "khu đã báo" của ngày đó NGAY TRƯỚC khi mốc kiểm kê ghi
       đè lên. Chỉ mốc kiểm kê dùng cột này.
       Lý do phải chụp: mốc kiểm kê ghi 0 vào số đếm của mọi ô, nên "Mở lại ngày" buộc phải xoá
       các số 0 đó — mà xoá xong thì lùi về đâu? Nếu ngày đó CHƯA có lần chốt nào trước (bãi mới
       dùng, hoặc vừa xoá sạch) thì không có tồn chuẩn nào để lùi, và số liệu gốc mất hẳn: nó chỉ
       còn trong lịch sử đếm, không đường nào dựng lại. Có ảnh chụp thì hoàn tác là trả về đúng
       từng ô như trước, không phụ thuộc có tồn chuẩn cũ hay không. */
    'ALTER TABLE day_close ADD COLUMN undo_json TEXT',
  ],
  /* ĐIỀU CHỈNH TỒN: phiếu kind 'dc' — một dòng receipts có dấu, KHÔNG có dòng đối ứng.
     Không cần đổi gì ở receipts: cột kind đã có từ bản 3 và mọi đường đọc tồn (stockOf,
     MV_CHUA_DEM, inn ở màn Duyệt) cộng receipts KHÔNG lọc theo kind, nên dòng mới tự vào đúng
     chỗ. Chỉ bảng tổng hợp phải thêm cột, vì đó là chỗ duy nhất phân biệt được "thép về" với
     "sửa sổ" khi báo cáo kỳ đọc lại sau này.
     Không backfill: trước bản này chưa có phiếu 'dc' nào, nên dc = 0 ở mọi ngày đã chốt là đúng,
     và cột nhap của những ngày đó vẫn mang đúng nghĩa cũ (nhập thật, chuyển khu đã triệt tiêu). */
  /* PHIẾU XUẤT: thép thật rời bãi, có nơi đến. Khác hẳn 'dc' (sửa sổ, không có xe nào chạy).
     daily_summary.xuat giữ riêng phần xuất CÓ PHIẾU để báo cáo kỳ tách được "đã dùng" thành
     "có phiếu" và "không rõ". Không backfill: trước bản này chưa có phiếu xuất nào nên xuat = 0
     ở mọi ngày đã chốt là đúng. */
  14: [
    'ALTER TABLE daily_summary ADD COLUMN xuat INTEGER NOT NULL DEFAULT 0',
  ],
  /* ĐẾM NHIỀU LẦN/NGÀY: mỗi lần khu GỬI báo cáo ghi một dòng, để biết khu đã đếm khung giờ nào.
     khu_report không dùng được vì nó chỉ giữ lần mới nhất. counts_log cũng không: lần admin chọn
     số khi hai người báo khác nhau và mốc "đặt tồn về 0" cũng ghi vào đó, tức khu sẽ được tính là
     đã đếm một khung mà không ai ra bãi. `at` là lúc ĐẾM máy khai (khác ts khi gửi lại sau mất mạng).
     Điền lại hai ngày gần nhất từ counts_log để ngày nâng cấp không báo oan khu đã đếm sáng nay. */
  15: [
    `CREATE TABLE IF NOT EXISTS khu_report_log (
       id INTEGER PRIMARY KEY AUTOINCREMENT, day TEXT NOT NULL, khu_id TEXT NOT NULL,
       ts INTEGER NOT NULL, at INTEGER NOT NULL, user_id INTEGER)`,
    'CREATE INDEX IF NOT EXISTS idx_khu_report_log_dk ON khu_report_log(day, khu_id)',
    `INSERT INTO khu_report_log (day, khu_id, ts, at, user_id)
     SELECT day, khu_id, ts, ts, MIN(user_id) FROM counts_log
     WHERE day >= date('now', '+7 hours', '-1 day') GROUP BY day, khu_id, ts`,
  ],
  13: [
    'ALTER TABLE daily_summary ADD COLUMN dc INTEGER NOT NULL DEFAULT 0',
  ],
  /* VAY MƯỢN NGOÀI BÃI: sổ công nợ thép với đối tác ngoài, tách hẳn khỏi tồn kho (xem đầu bảng
     loans trong schema.sql). Hai bảng mới, không đổi bảng cũ nào nên không cần backfill gì. */
  16: [
    `CREATE TABLE IF NOT EXISTS doitac (
       id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1)`,
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_doitac_name ON doitac(name COLLATE NOCASE)',
    `CREATE TABLE IF NOT EXISTS loans (
       id INTEGER PRIMARY KEY AUTOINCREMENT, doitac_id INTEGER NOT NULL, phi_id TEXT NOT NULL,
       kind TEXT NOT NULL CHECK (kind IN ('vay','tra_vay','cho_vay','tra_no')), qty INTEGER NOT NULL,
       note TEXT, grp TEXT, user_id INTEGER NOT NULL, ts INTEGER NOT NULL, voided INTEGER NOT NULL DEFAULT 0,
       voided_ts INTEGER, duyet_ts INTEGER, duyet_by INTEGER, duyet_name TEXT)`,
    'CREATE INDEX IF NOT EXISTS idx_loans_doitac ON loans(doitac_id)',
    'CREATE INDEX IF NOT EXISTS idx_loans_grp ON loans(grp)',
  ],
};
export const RATE_SQL = `INSERT OR REPLACE INTO phi_rate (phi_id, per_day, days)
  SELECT phi_id, SUM(dung) * 1.0 / SUM(span), SUM(span) FROM daily_summary
  WHERE dung IS NOT NULL AND day > date(?1, '-28 days') AND day <= ?1 GROUP BY phi_id`;
export async function migrate(env) {
  const r = await env.DB.prepare("SELECT value FROM meta WHERE key = 'schema'").first();
  for (let n = (r ? r.value : 1) + 1; n <= SCHEMA_VERSION; n++) {
    for (const sql of MIGRATIONS[n]) {
      // hai isolate có thể cùng nâng cấp: bỏ qua lỗi "cột đã tồn tại"
      try { await env.DB.prepare(sql).run(); } catch (e) { if (!/duplicate column/i.test(String(e && e.message))) throw e; }
    }
    await env.DB.prepare("INSERT INTO meta (key, value) VALUES ('schema', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(n).run();
  }
  // Chỉ nạp phi mặc định khi bảng phi trống. Trước đây chạy mỗi lần Worker khởi động nguội:
  // tốn 13 câu lệnh cho request đầu tiên và làm phi đã ẩn/đã xoá sống lại.
  const n = await env.DB.prepare('SELECT COUNT(*) n FROM phi').first('n');
  if (!n) await seedPhi(env);
}
