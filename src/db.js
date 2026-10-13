// Tự nâng cấp cấu trúc database (migration) khi deploy bản mới.
import { seedPhi } from './core.js';

/* ========================= TỰ NÂNG CẤP DATABASE =========================
   Deploy qua GitHub không chạy lại schema.sql, nên Worker tự áp dụng các thay đổi cấu trúc
   một lần (ghi số phiên bản vào meta.schema). Mỗi isolate chỉ tốn 1 truy vấn đọc để kiểm tra. */
export const SCHEMA_VERSION = 33;
// giữ khớp với hai trigger loans_* cuối schema.sql
export const LOAN_TRIGGERS = [
  `CREATE TRIGGER IF NOT EXISTS loans_chk_insert BEFORE INSERT ON loans
   WHEN NEW.qty IS NULL OR NEW.qty <= 0 OR NEW.ngay IS NULL OR NOT EXISTS (SELECT 1 FROM doitac WHERE id = NEW.doitac_id)
   BEGIN SELECT RAISE(ABORT, 'So vay: dong khong hop le'); END`,
  `CREATE TRIGGER IF NOT EXISTS loans_no_edit BEFORE UPDATE OF doitac_id, phi_id, kind, qty, ngay ON loans
   BEGIN SELECT RAISE(ABORT, 'So vay: khong sua noi dung dong da ghi'); END`,
];
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
    // voided_ts: lúc huỷ phiếu. Huỷ phiếu sau khi khu đã báo làm số dự kiến của khu đổi y như
    // nhập muộn, nên màn Duyệt phải biết thời điểm huỷ mới cảnh báo được (xem exception 'late').
    'ALTER TABLE receipts ADD COLUMN voided_ts INTEGER',
    // phiếu đã huỷ từ trước: lấy ts của phiếu làm mốc, coi như huỷ ngay lúc nhập (không cảnh báo lùi)
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
  /* KHOÁ SỐ TẤN NGÀY ĐÃ CHỐT + PHIẾU KHO CỦA SỔ VAY MƯỢN.
     - kg: kg/cây của phi TẠI LÚC CHỐT. Báo cáo, xem lại ngày cũ, thống kê nhân với số này chứ không
       với kg/cây hiện tại — không thì sửa kg/cây hôm nay là viết lại số tấn của mọi ngày cũ mà
       không chỗ nào báo. Ngày chốt trước bản này không biết kg lúc đó là bao nhiêu, nên điền bằng
       số hiện tại: đúng như cách chúng vẫn đang hiện, chỉ là từ nay không trôi theo nữa.
     - vay: thép ra/vào bãi theo sổ vay mượn (phiếu kho kind 'vay'), số có dấu. Tách khỏi cột nhap
       như dc và xuat, vì thép cho vay/đi vay không phải thép về và cũng không phải thép dùng. */
  17: [
    'ALTER TABLE daily_summary ADD COLUMN kg REAL',
    'ALTER TABLE daily_summary ADD COLUMN vay INTEGER NOT NULL DEFAULT 0',
    'UPDATE daily_summary SET kg = (SELECT kg_per_cay FROM phi WHERE phi.id = daily_summary.phi_id) WHERE kg IS NULL',
  ],
  /* BÁO CÁO GỬI SAU KHI CHỐT: ngày đã chốt mà khu vẫn gửi số thì số đó nằm riêng ở đây, không đụng
     counts. Admin nhận thì mới thành số đếm; không nhận thì xoá hẳn dòng (không giữ rác). */
  18: [
    `CREATE TABLE IF NOT EXISTS bao_sau_chot (
       day TEXT NOT NULL, khu_id TEXT NOT NULL, user_id INTEGER NOT NULL, ts INTEGER NOT NULL,
       at INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (day, khu_id))`,
  ],
  /* SỔ NGÀY TỰ CHỐT (bỏ chốt tay):
     - bt: phi có ngày BẤT THƯỜNG (dùng âm / dùng cao) — vẫn chốt, nhưng không vào mức dùng TB.
     - bao_sau_chot bỏ: ngày D chỉ chốt sau nửa đêm nên không còn báo cáo nào gửi "sau chốt". */
  19: [
    'ALTER TABLE daily_summary ADD COLUMN bt INTEGER NOT NULL DEFAULT 0',
    'DROP TABLE IF EXISTS bao_sau_chot',
  ],
  /* SỔ VAY MƯỢN ĐỦ CHỨNG TỪ:
     - ngay: ngày GIAO NHẬN thật (ghi bù được), khác ts là lúc bấm ghi sổ.
     - han: hạn trả (tuỳ chọn, chỉ lần vay / cho vay) — để biết khoản nào quá hạn.
     - so_bb: số biên bản giao nhận, đầu mối tra ngược sang giấy tờ.
     - nguoi, bien_so: người giao/nhận bên đối tác, biển số xe.
     Dòng cũ lấy ngày giao nhận = ngày đã ghi sổ (giờ Việt Nam). */
  20: [
    'ALTER TABLE loans ADD COLUMN ngay TEXT',
    'ALTER TABLE loans ADD COLUMN han TEXT',
    'ALTER TABLE loans ADD COLUMN so_bb TEXT',
    'ALTER TABLE loans ADD COLUMN nguoi TEXT',
    'ALTER TABLE loans ADD COLUMN bien_so TEXT',
    "UPDATE loans SET ngay = date(ts / 1000, 'unixepoch', '+7 hours') WHERE ngay IS NULL",
  ],
  /* CHẤM CÔNG BÁO CÁO: lúc sổ tự chốt, lưu kết quả báo cáo của từng khu trong ngày đó — ai đang phụ
     trách, phải báo mấy buổi, ai báo buổi nào, buổi nào thiếu. Lưu NGAY LÚC CHỐT vì phân công
     (khu_user) chỉ giữ hiện tại: tính lại về sau thì đổi phân công là đổ lỗi ngày cũ sang người mới. */
  21: [
    `CREATE TABLE IF NOT EXISTS bao_cao_ngay (
       day TEXT NOT NULL, khu_id TEXT NOT NULL, phu_trach TEXT NOT NULL DEFAULT '[]',
       khung TEXT NOT NULL DEFAULT '[]', phai INTEGER NOT NULL DEFAULT 0,
       bao TEXT NOT NULL DEFAULT '[]', thieu TEXT NOT NULL DEFAULT '[]',
       PRIMARY KEY (day, khu_id))`,
  ],
  /* HUỶ BÁO CÁO: admin huỷ một báo cáo đếm đang chờ duyệt, kèm lý do. Trước đây chỉ có "yêu cầu
     đếm lại" — một lá cờ nhắc: số sai vẫn nằm chờ duyệt (vẫn bấm Duyệt được), người đếm không biết
     vì sao, gửi lại y nguyên số cũ là cờ tắt, và qua 0h cờ mất. Nay số bị huỷ rời hẳn counts; bảng
     này giữ thông báo cho người báo. */
  22: [
    `CREATE TABLE IF NOT EXISTS bao_cao_huy (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day TEXT NOT NULL,
      khu_id TEXT NOT NULL,
      user_id INTEGER,
      rep_ts INTEGER NOT NULL,
      ly_do TEXT NOT NULL,
      huy_by INTEGER,
      huy_name TEXT,
      ts INTEGER NOT NULL
    )`,
    'CREATE INDEX IF NOT EXISTS idx_bao_cao_huy_dk ON bao_cao_huy(day, khu_id)',
  ],
  /* VAI TRÒ THEO CẤP BẬC (xem CAP ở core.js).
     1. users.role nhận bộ vai trò mới. Cột có CHECK, mà SQLite không sửa được CHECK tại chỗ, nên phải
        dựng lại bảng. Cả cụm nằm trong MỘT mảng con = một batch = một giao dịch: hỏng giữa chừng thì
        lùi hết, không bao giờ có lúc database thiếu bảng users. Liệt kê tên cột vì database nâng cấp
        dần có thứ tự cột khác schema.sql. Hai mã cũ được đổi ngay lúc chép: 'nguoidem' thành
        'tieudoi' (Tiểu đội trưởng), 'thukho' thành 'cvktht' (vai trò Thủ kho đã bỏ). Tài khoản
        'admin' giữ nguyên. Chạy lại lần hai (hai isolate cùng nâng cấp) chỉ là chép thêm một lượt.
     2. cap: cấp của người báo, ghi vào dòng lúc báo (counts, counts_log, loans). Dòng đang có thì
        điền theo vai trò hiện tại của người báo; counts_log là bảng chỉ-ghi-thêm nên để mặc định 2.
     3. khu_user chỉ còn Tiểu đội trưởng: gỡ mọi phân công của người không phải Tiểu đội trưởng. */
  23: [
    [
      'DROP TABLE IF EXISTS users_new',
      `CREATE TABLE users_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL CHECK (role IN ('admin','daidoi','trungdoi','cvktht','tieudoi')),
        pin_salt TEXT NOT NULL,
        pin_hash TEXT NOT NULL,
        must_change INTEGER NOT NULL DEFAULT 1,
        locked INTEGER NOT NULL DEFAULT 0,
        fail_count INTEGER NOT NULL DEFAULT 0,
        locked_until INTEGER NOT NULL DEFAULT 0,
        lock_level INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        deleted INTEGER NOT NULL DEFAULT 0
      )`,
      `INSERT INTO users_new (id, name, phone, role, pin_salt, pin_hash, must_change, locked, fail_count, locked_until, lock_level, created_at, deleted)
       SELECT id, name, phone, CASE role WHEN 'nguoidem' THEN 'tieudoi' WHEN 'thukho' THEN 'cvktht' ELSE role END,
              pin_salt, pin_hash, must_change, locked, fail_count, locked_until, lock_level, created_at, deleted FROM users`,
      /* Giữ bộ đếm id: bảng mới chỉ biết id lớn nhất CÒN TRONG BẢNG. Nếu id cao nhất từng cấp đã không
         còn dòng, tài khoản tạo sau đó sẽ nhận lại id ấy và mọi số đếm, phiếu cũ của người trước hiện
         ra dưới tên người mới. */
      `UPDATE sqlite_sequence SET seq = MAX(seq, COALESCE((SELECT seq FROM sqlite_sequence WHERE name = 'users'), 0))
       WHERE name = 'users_new'`,
      'DROP TABLE users',
      'ALTER TABLE users_new RENAME TO users',
    ],
    'ALTER TABLE counts ADD COLUMN cap INTEGER NOT NULL DEFAULT 2',
    'ALTER TABLE counts_log ADD COLUMN cap INTEGER NOT NULL DEFAULT 2',
    'ALTER TABLE loans ADD COLUMN cap INTEGER NOT NULL DEFAULT 2',
    `UPDATE counts SET cap = COALESCE((SELECT CASE u.role WHEN 'tieudoi' THEN 0 WHEN 'cvktht' THEN 1 ELSE 2 END FROM users u WHERE u.id = counts.user_id), 2)`,
    `UPDATE loans SET cap = COALESCE((SELECT CASE u.role WHEN 'tieudoi' THEN 0 WHEN 'cvktht' THEN 1 ELSE 2 END FROM users u WHERE u.id = loans.user_id), 2)`,
    "DELETE FROM khu_user WHERE user_id NOT IN (SELECT id FROM users WHERE role = 'tieudoi' AND deleted = 0)",
  ],
  /* INDEX THEO Ô (khu × phi). Mọi đường đọc tồn đều hỏi "lần gần nhất của Ô NÀY" (xem EFF_SELECT, MV_NEW,
     tonCells), mà khoá chính của counts mở đầu bằng day và receipts chỉ có index theo duyet_day: mỗi ô
     phải quét cả kỳ. Đo trên D1: một lần tải /bootstrap đọc ~13.800 dòng, có hai index này còn ~900 —
     hạn mức gói Free là 5 triệu dòng/ngày và mỗi lần số liệu đổi thì mọi máy đang mở đều tải lại. */
  24: [
    'CREATE INDEX IF NOT EXISTS idx_counts_cell ON counts(khu_id, phi_id, day)',
    'CREATE INDEX IF NOT EXISTS idx_receipts_cell ON receipts(khu_id, phi_id, duyet_day)',
  ],
  /* Hai index của bản 24 mở đầu bằng khu_id, và đó là cái bẫy: câu nào lọc "khu_id = một khu, trong kỳ
     (day > lần chốt trước)" — gửi báo cáo, duyệt khu, huỷ báo cáo — bị SQLite chọn index này thay cho
     khoá chính, tức quét MỌI ngày từ trước tới nay của khu đó: gửi một báo cáo đọc 1.500 dòng sau 3
     tháng, 16.500 dòng sau 3 năm. Đặt phi_id lên đầu thì câu chỉ lọc theo khu không dùng được index
     nữa và quay về khoá chính (chỉ đọc kỳ đang mở), còn câu hỏi theo Ô (đủ khu và phi) vẫn tìm thẳng. */
  25: [
    'DROP INDEX IF EXISTS idx_counts_cell',
    'DROP INDEX IF EXISTS idx_receipts_cell',
    'CREATE INDEX IF NOT EXISTS idx_counts_o ON counts(phi_id, khu_id, day)',
    'CREATE INDEX IF NOT EXISTS idx_receipts_o ON receipts(phi_id, khu_id, duyet_day)',
    // hai bảng chỉ dài ra: lần ghi sổ vay CHỜ DUYỆT (hỏi ở mỗi lần tải) và lọc nhật ký theo ngày
    'CREATE INDEX IF NOT EXISTS idx_loans_duyet ON loans(duyet_ts)',
    'CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit(ts)',
  ],
  /* SỔ VAY MƯỢN GIỮ ĐƯỢC LÂU DÀI:
     - voided_by / voided_name / voided_note: AI huỷ (hoặc từ chối) và VÌ SAO, ghi ngay trong dòng. Trước
       đây chỉ nhật ký biết, mà nhật ký bị cắt còn phần mới nhất trong bản sao và không nạp lại được.
     - Hai trigger: sổ công nợ không nhận dòng hỏng (số lượng <= 0, thiếu ngày giao nhận, đối tác không
       có), và NỘI DUNG một dòng đã ghi thì không sửa được nữa — sai thì huỷ rồi ghi lại, như mọi phiếu.
       Code server vốn đã giữ đúng các điều này; trigger là lớp chặn của chính database. */
  26: [
    'ALTER TABLE loans ADD COLUMN voided_by INTEGER',
    'ALTER TABLE loans ADD COLUMN voided_name TEXT',
    'ALTER TABLE loans ADD COLUMN voided_note TEXT',
    ...LOAN_TRIGGERS,
  ],
  /* GIA CÔNG CẤU KIỆN: đơn giao cho Tiểu đội trưởng và lịch sử cập nhật của từng đơn (xem src/giacong.js).
     Hai bảng mới, tách hẳn khỏi tồn kho, không đổi bảng cũ nào nên không cần backfill gì. */
  27: [
    `CREATE TABLE IF NOT EXISTS don_gc (
       id INTEGER PRIMARY KEY AUTOINCREMENT, cau_kien TEXT NOT NULL, hang_muc TEXT, truc TEXT, noi_dung TEXT,
       user_id INTEGER NOT NULL, han TEXT NOT NULL, buoi TEXT, tt TEXT NOT NULL DEFAULT 'moi',
       pct INTEGER NOT NULL DEFAULT 0, vuong TEXT, giao_by INTEGER NOT NULL, ts INTEGER NOT NULL,
       cap_ts INTEGER NOT NULL, xong_ts INTEGER, huy_ly_do TEXT, mo_lai TEXT)`,
    // (tt, cap_ts): đơn còn mở tìm theo tt; đơn xong / huỷ gần đây tìm theo tt rồi cap_ts — không câu nào phải quét cả bảng
    'CREATE INDEX IF NOT EXISTS idx_don_gc_tt ON don_gc(tt, cap_ts)',
    `CREATE TABLE IF NOT EXISTS don_gc_log (
       id INTEGER PRIMARY KEY AUTOINCREMENT, don_id INTEGER NOT NULL, ts INTEGER NOT NULL, user_id INTEGER,
       viec TEXT NOT NULL, pct INTEGER NOT NULL DEFAULT 0, note TEXT)`,
    'CREATE INDEX IF NOT EXISTS idx_don_gc_log_don ON don_gc_log(don_id)',
  ],
  /* QUÂN SỐ ĐẦU CA: mỗi tổ báo quân số ở đầu mỗi ca (xem src/quanso.js). Một bảng mới, tách khỏi tồn kho.
     Nấc tiến độ gia công đổi từ 25% sang 10% ở cùng bản này nhưng không đổi dữ liệu: đơn cũ đang 25% / 75%
     giữ nguyên số cho tới lần cập nhật sau. */
  28: [
    `CREATE TABLE IF NOT EXISTS quan_so (
       ngay TEXT NOT NULL, ca INTEGER NOT NULL, user_id INTEGER NOT NULL, tong INTEGER NOT NULL, lam INTEGER NOT NULL,
       ca_kia INTEGER NOT NULL DEFAULT 0, nghi TEXT NOT NULL DEFAULT '{}', ghi_chu TEXT, ts INTEGER NOT NULL,
       by_id INTEGER NOT NULL, PRIMARY KEY (ngay, ca, user_id))`,
    'CREATE INDEX IF NOT EXISTS idx_quan_so_u ON quan_so(user_id, ngay, ca)',
  ],
  /* GIA CÔNG: vị trí của đơn tách thành phân khu + tầng + trục (trục thành bắt buộc), và DANH MỤC do admin
     lập trước để chọn nhanh — phân khu ('khu'), hạng mục ('hm'), loại cấu kiện ('ck'). Đơn lưu TÊN của mục
     chứ không lưu id, nên xoá một mục không đụng tới đơn đã giao. Nạp sẵn sáu loại bằng json_each chứ không
     UNION ALL: D1 chỉ cho 5 vế trong một câu SELECT ghép (bản đầu dùng 6 vế đã làm hỏng lần nâng cấp trên máy thật;
     SQLite của bộ test cho tới 500 vế nên không bắt được). Sáu loại cấu kiện thường gặp nạp sẵn; đơn
     cũ không có phân khu / tầng thì để trống. */
  29: [
    'ALTER TABLE don_gc ADD COLUMN phan_khu TEXT',
    'ALTER TABLE don_gc ADD COLUMN tang TEXT',
    'ALTER TABLE don_gc ADD COLUMN cote TEXT',
    /* Huỷ = "không cần làm nữa": ai huỷ, lúc nào, đơn đang ở trạng thái gì lúc huỷ (để khôi phục về đúng chỗ),
       và lúc người giữ đơn bấm "đã biết". Đơn đã huỷ từ trước bản này coi như đã được biết, không nhắc lùi. */
    'ALTER TABLE don_gc ADD COLUMN huy_by INTEGER',
    'ALTER TABLE don_gc ADD COLUMN huy_ts INTEGER',
    'ALTER TABLE don_gc ADD COLUMN huy_tt TEXT',
    'ALTER TABLE don_gc ADD COLUMN biet_ts INTEGER',
    "UPDATE don_gc SET huy_ts = cap_ts, biet_ts = cap_ts WHERE tt = 'huy' AND huy_ts IS NULL",
    `CREATE TABLE IF NOT EXISTS gc_muc (
       id INTEGER PRIMARY KEY AUTOINCREMENT, loai TEXT NOT NULL, ten TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0)`,
    `INSERT INTO gc_muc (loai, ten, sort) SELECT 'ck', j.value, j.key + 1 FROM json_each('["Dầm","Cột","Sàn","Móng","Vách","Cầu thang"]') j
     WHERE NOT EXISTS (SELECT 1 FROM gc_muc WHERE loai = 'ck')`,
  ],
  /* GIA CÔNG: báo vướng nhanh và theo dõi đơn đứng yên.
     vuong_loai: lý do chọn trong danh mục (gc_muc loại 'vg', nạp sẵn sáu lý do hay gặp), vuong_dung: 1 = tổ dừng hẳn,
     vuong_ts: lúc báo, vuong_xem_by / vuong_xem_ts: người giao bấm "đã xem, đang xử lý".
     lam_ts: lần cuối người làm động tới đơn (nhận, tiến độ, vướng, xong); đơn cũ lấy theo lần cập nhật gần nhất.
     Nạp danh mục bằng json_each, không UNION ALL (D1 chỉ cho 5 vế, xem bản 29). */
  30: [
    'ALTER TABLE don_gc ADD COLUMN vuong_loai TEXT',
    'ALTER TABLE don_gc ADD COLUMN vuong_dung INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE don_gc ADD COLUMN vuong_ts INTEGER',
    'ALTER TABLE don_gc ADD COLUMN vuong_xem_by INTEGER',
    'ALTER TABLE don_gc ADD COLUMN vuong_xem_ts INTEGER',
    'ALTER TABLE don_gc ADD COLUMN lam_ts INTEGER',
    'UPDATE don_gc SET lam_ts = cap_ts WHERE lam_ts IS NULL',
    'UPDATE don_gc SET vuong_ts = cap_ts WHERE vuong IS NOT NULL AND vuong_ts IS NULL',
    `INSERT INTO gc_muc (loai, ten, sort) SELECT 'vg', j.value, j.key + 1 FROM json_each('["Thiếu thép","Chưa có bản vẽ","Bản vẽ sai","Máy hỏng","Thiếu người","Chờ mặt bằng"]') j
     WHERE NOT EXISTS (SELECT 1 FROM gc_muc WHERE loai = 'vg')`,
  ],
  /* BÁO CÁO CA gửi cấp trên (xem src/baocao.js): báo cáo đã soạn của từng ca, và mẫu (phần đầu, máy móc, kiểm tra).
     Hai bảng mới, không đổi bảng cũ. */
  31: [
    `CREATE TABLE IF NOT EXISTS bao_cao_ca (
       ngay TEXT NOT NULL, ca INTEGER NOT NULL, data TEXT NOT NULL DEFAULT '{}', van_ban TEXT, ts INTEGER NOT NULL,
       by_id INTEGER NOT NULL, PRIMARY KEY (ngay, ca))`,
    "CREATE TABLE IF NOT EXISTS bc_mau (id INTEGER PRIMARY KEY, data TEXT NOT NULL DEFAULT '{}', ts INTEGER NOT NULL, by_id INTEGER)",
  ],
  /* GIA CÔNG: nhiều Tiểu đội trưởng cùng làm một đơn (tổ ca ngày + tổ ca đêm), tối đa 4. Mỗi người một dòng, kèm lúc
     người đó bấm "đã biết" khi đơn bị huỷ. Đơn cũ: người phụ trách hiện tại thành dòng đầu tiên. */
  32: [
    'CREATE TABLE IF NOT EXISTS don_gc_nguoi (don_id INTEGER NOT NULL, user_id INTEGER NOT NULL, biet_ts INTEGER, PRIMARY KEY (don_id, user_id))',
    'CREATE INDEX IF NOT EXISTS idx_don_gc_nguoi_u ON don_gc_nguoi(user_id)',
    'INSERT OR IGNORE INTO don_gc_nguoi (don_id, user_id, biet_ts) SELECT id, user_id, biet_ts FROM don_gc',
  ],
  /* CHỨC DANH của tài khoản admin: quyền hệ thống (role = 'admin') và chức danh thật ở đơn vị là hai thứ khác nhau.
     Người lập app là admin nhưng làm CVKTHT, nên báo cáo ca phải biết họ là CVKTHT để điền sẵn ô CBPT. Chỉ dùng
     cho admin ('daidoi', 'trungdoi', 'cvktht' hoặc NULL); tài khoản khác thì vai trò chính là chức danh. Không đổi
     quyền: admin vẫn duyệt được hết. */
  33: [
    'ALTER TABLE users ADD COLUMN chuc_danh TEXT',
  ],
};
export const RATE_SQL = `INSERT OR REPLACE INTO phi_rate (phi_id, per_day, days)
  SELECT phi_id, SUM(dung) * 1.0 / SUM(span), SUM(span) FROM daily_summary
  WHERE dung IS NOT NULL AND bt = 0 AND day > date(?1, '-28 days') AND day <= ?1 GROUP BY phi_id`;
export async function migrate(env) {
  const r = await env.DB.prepare("SELECT value FROM meta WHERE key = 'schema'").first();
  for (let n = (r ? r.value : 1) + 1; n <= SCHEMA_VERSION; n++) {
    for (const sql of MIGRATIONS[n]) {
      // mảng con = các câu phải chạy trọn trong một giao dịch (dựng lại bảng)
      if (Array.isArray(sql)) { await env.DB.batch(sql.map((s) => env.DB.prepare(s))); continue; }
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
