-- ===== Kho Thép Bãi: cấu trúc dữ liệu D1 =====
-- KHÔNG đặt chú thích BÊN TRONG khối CREATE TABLE. Giải thích cột thì ghi ngay TRÊN khối CREATE.
-- Lý do: SQLite dựng lại câu CREATE từ chính văn bản này khi chạy ALTER TABLE ... DROP COLUMN.
-- Chú thích cuối dòng làm câu lệnh bị cắt; chú thích TRÊN DÒNG CỘT vẫn đủ làm sập khi cột đó là
-- cột CUỐI của bảng, vì chú thích nằm kẹp giữa dấu phẩy và ")" nên câu dựng lại thành
-- "... ,\n  -- chú thích\n)" và SQLite báo "incomplete input". Đã gặp thật với phi.active.
-- Ngoài ra: drop một cột đang có index thì phải DROP INDEX trước (xem idx_receipts_grp).

-- deleted: tài khoản đã xoá. DÒNG NÀY KHÔNG BAO GIỜ BỊ XOÁ KHỎI BẢNG: mọi số đếm, phiếu, báo cáo
-- khu và lần chốt ngày đều lấy tên người làm bằng cách join users, nên xoá hẳn dòng là toàn bộ
-- lịch sử của người đó hiện "(đã xoá)" — mất dấu ai đã làm gì. Giữ dòng thì tên còn đúng mãi,
-- và khôi phục được tài khoản xoá nhầm mà không phải mở database.
-- Tài khoản có id NHỎ NHẤT là admin đầu tiên (người thiết lập hệ thống): chỉ người này được sửa
-- tên, xoá và khôi phục tài khoản, và không ai khoá/hạ quyền/xoá được tài khoản đó.
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('admin','thukho','nguoidem')),
  pin_salt TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  must_change INTEGER NOT NULL DEFAULT 1,
  locked INTEGER NOT NULL DEFAULT 0,
  fail_count INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0,
  lock_level INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  device TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_exp ON sessions(expires_at);

-- Đếm số lần nhập sai PIN theo IP mỗi ngày (chỉ ghi khi sai)
CREATE TABLE IF NOT EXISTS login_fail (
  ip TEXT NOT NULL,
  day TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ip, day)
);

-- unit:   'cay' = cây nguyên, 'cuon' = dây cuộn (D6/D8)
-- active: 0 = phi bãi không dùng, ẩn khỏi bảng đếm; dữ liệu cũ vẫn giữ
CREATE TABLE IF NOT EXISTS phi (
  id TEXT PRIMARY KEY,
  sort INTEGER NOT NULL,
  kg_per_cay REAL NOT NULL,
  bo_size INTEGER NOT NULL,
  min_stock INTEGER NOT NULL,
  unit TEXT NOT NULL DEFAULT 'cay',
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS khu (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

-- Chỉ còn keep_streak được dùng: số lần "giữ nguyên" liên tiếp, để bắt đếm thật sau vài ngày.
-- active và zero_days là tàn dư của cơ chế "tự ẩn phi khỏi khu sau N ngày đếm 0", đã bỏ ở bản 1.3:
-- nay mọi khu luôn hiện đủ phi, để trống thì mặc định 0. Giữ cột chứ không DROP, xem cảnh báo đầu tệp.
CREATE TABLE IF NOT EXISTS khu_phi (
  khu_id TEXT NOT NULL,
  phi_id TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  zero_days INTEGER NOT NULL DEFAULT 0,
  keep_streak INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (khu_id, phi_id)
);

-- Phân công người phụ trách khu: khu có tên trong bảng này thì CHỈ người được gán (và admin) mới đếm được.
-- Khu không có dòng nào ở đây = chưa phân công, mọi người đều đếm được.
CREATE TABLE IF NOT EXISTS khu_user (
  khu_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  PRIMARY KEY (khu_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_khu_user_u ON khu_user(user_id);

-- Số đếm của từng ô (ngày x khu x phi). Mỗi ô giữ HAI con số:
--   v, kind, ts, user_id = lần báo MỚI NHẤT (chưa chắc đã duyệt)
--   duyet_* = số ĐÃ DUYỆT. Tồn chỉ đọc duyet_v. Chưa duyệt thì không vào tồn.
-- duyet_ts giữ ts CỦA LẦN BÁO ĐÃ ĐƯỢC DUYỆT, nên "ô này đã duyệt" là phép so BẰNG: duyet_ts = ts.
-- Không so >= : hai mốc rơi cùng một milligiây thì không phân định được, mà mặc định sai hướng
-- nghĩa là một lần báo lọt vào tồn mà không ai duyệt. duyet_at là giờ duyệt, chỉ để hiện lên màn hình.
-- Nhờ tách hai cột, khu báo lại lúc 10h không đè mất số đã duyệt lúc 8h: tồn vẫn là số 8h
-- cho tới khi admin duyệt lần báo mới. Ô đang chờ duyệt <=> duyet_ts IS NULL OR duyet_ts <> ts.
-- kind: 'dem' đếm thật (bấm "Hết (0)" cũng là dem với v=0), 'giu' giữ nguyên số hôm qua,
--       'zero' người đếm ĐỂ TRỐNG nên mặc định 0. Phân biệt 'zero' với 'dem' v=0 để màn Duyệt
--       nói được "khu để trống D25 trong khi dự kiến 72 cây", rất khác "khu đếm, D25 hết thật".
CREATE TABLE IF NOT EXISTS counts (
  day TEXT NOT NULL,
  khu_id TEXT NOT NULL,
  phi_id TEXT NOT NULL,
  v INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('dem','giu','zero')),
  bo INTEGER,
  le INTEGER,
  user_id INTEGER NOT NULL,
  ts INTEGER NOT NULL,
  duyet_v INTEGER,
  duyet_kind TEXT,
  duyet_ts INTEGER,
  duyet_at INTEGER,
  duyet_by INTEGER,
  duyet_name TEXT,
  PRIMARY KEY (day, khu_id, phi_id)
);

-- Lịch sử mọi lần báo (chỉ ghi thêm)
CREATE TABLE IF NOT EXISTS counts_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT NOT NULL,
  khu_id TEXT NOT NULL,
  phi_id TEXT NOT NULL,
  prev_v INTEGER,
  v INTEGER NOT NULL,
  kind TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_counts_log_dk ON counts_log(day, khu_id);

CREATE TABLE IF NOT EXISTS khu_report (
  day TEXT NOT NULL,
  khu_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  ts INTEGER NOT NULL,
  conflict INTEGER NOT NULL DEFAULT 0,
  resolved INTEGER NOT NULL DEFAULT 0,
  recount INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, khu_id)
);

-- Một dòng cho MỖI lần khu gửi báo cáo (khu_report chỉ giữ lần mới nhất). Dùng để biết khu đã
-- đếm khung giờ nào khi settings.report_slots_per_day > 1.
-- at: lúc ĐẾM máy khai; khác ts (lúc tới máy chủ) khi báo cáo lưu lúc mất mạng rồi gửi lại.
CREATE TABLE IF NOT EXISTS khu_report_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT NOT NULL,
  khu_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  at INTEGER NOT NULL,
  user_id INTEGER
);
CREATE INDEX IF NOT EXISTS idx_khu_report_log_dk ON khu_report_log(day, khu_id);

-- Báo cáo khu gửi SAU KHI ngày đã chốt: mỗi khu mỗi ngày một dòng, gửi lại thì thay.
-- Chưa phải số đếm: admin "nhận" thì mới ghi vào counts (mở lại, duyệt, chốt lại); không nhận thì
-- xoá hẳn dòng. data: các dòng số đã kiểm như một lần báo thường (phi, kind, v, bo, le, keep).
CREATE TABLE IF NOT EXISTS bao_sau_chot (
  day TEXT NOT NULL,
  khu_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  ts INTEGER NOT NULL,
  at INTEGER NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (day, khu_id)
);

-- kind:      'nhap' thép về, 'chuyen' chuyển khu (dòng âm ở khu đi, dương ở khu đến),
--            'dc' điều chỉnh tồn do admin khai — MỘT dòng có dấu, KHÔNG có dòng đối ứng.
--            Vì không đối ứng nên 'dc' là loại phiếu duy nhất có thể chỉ gồm dòng âm: mọi chỗ
--            hiển thị phiếu phải thôi giả định "phiếu luôn có ít nhất một dòng dương".
--            note của phiếu 'dc' bắt buộc có, mở đầu bằng mã lý do (xem DC_REASONS).
--            'xuat' phiếu xuất (tự nguyện) — cũng MỘT dòng, luôn ÂM, không đối ứng, bắt buộc
--            ghi nơi đến trong note. Khác 'dc' ở chỗ quyết định: xuất là thép đi THẬT nên nó
--            phải nằm trong lượng dùng (xem daily_summary.xuat), còn 'dc' là sửa sổ nên không.
-- grp:       các dòng cùng một phiếu
-- voided_ts: lúc hủy phiếu (cũng là lúc từ chối, phân biệt bằng nhật ký)
-- duyet_day: NGÀY DUYỆT, cũng là ngày phiếu vào tồn. NULL = đang chờ duyệt, chưa tính vào tồn.
--            Khác day (ngày nhập) khi phiếu nằm chờ qua đêm; giữ cả hai để chứng từ ghi rõ
--            "nhập 07/10, duyệt 08/10". Nhờ vậy phiếu treo không cần chặn chốt ngày: nó vào
--            tồn của đúng ngày được duyệt.
CREATE TABLE IF NOT EXISTS receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT NOT NULL,
  phi_id TEXT NOT NULL,
  khu_id TEXT NOT NULL,
  qty INTEGER NOT NULL,
  note TEXT,
  user_id INTEGER NOT NULL,
  ts INTEGER NOT NULL,
  voided INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL DEFAULT 'nhap',
  grp TEXT,
  voided_ts INTEGER,
  duyet_day TEXT,
  duyet_ts INTEGER,
  duyet_by INTEGER,
  duyet_name TEXT
);
CREATE INDEX IF NOT EXISTS idx_receipts_duyet ON receipts(duyet_day);
CREATE INDEX IF NOT EXISTS idx_receipts_day ON receipts(day);
CREATE INDEX IF NOT EXISTS idx_receipts_grp ON receipts(grp);

-- Chốt ngày: khóa số liệu, lưu mức dùng để tính trung bình
-- span: số ngày gộp (quên chốt thì > 1)
-- kind: 'reset' = ngày này là MỐC KIỂM KÊ LẠI (đặt tồn cả bãi về 0), NULL = chốt ngày thường.
--       "Mở lại ngày" phải hoàn tác hai thứ khác nhau: chốt thường chỉ bỏ mốc chốt, còn mốc kiểm
--       kê thì phải bỏ luôn các số 0 nó đã ghi vào số đếm, không thì tồn vẫn bằng 0 sau khi mở lại.
-- undo_json: ảnh chụp số đếm và dấu "khu đã báo" của ngày đó NGAY TRƯỚC khi mốc kiểm kê ghi đè.
--       Chỉ mốc kiểm kê dùng cột này. Thiếu nó thì hoàn tác chỉ còn cách lùi về tồn chuẩn cũ, mà
--       ngày chưa có lần chốt nào trước đó thì không có tồn chuẩn nào để lùi: số liệu gốc mất hẳn,
--       chỉ còn trong lịch sử đếm và không đường nào dựng lại.
CREATE TABLE IF NOT EXISTS day_close (
  day TEXT PRIMARY KEY,
  closed_by INTEGER NOT NULL,
  ts INTEGER NOT NULL,
  note TEXT,
  used_json TEXT,
  exc_json TEXT,
  span INTEGER NOT NULL DEFAULT 1,
  kind TEXT,
  undo_json TEXT
);

-- Tổng hợp theo ngày đã chốt x phi: báo cáo theo kỳ đọc bảng này cho nhẹ hạn mức
-- nhap: chỉ thép THẬT về (phiếu kind 'nhap'). Chuyển khu không vào đây vì nó cộng trừ triệt tiêu
--       ở cấp phi, còn điều chỉnh tách riêng sang cột dc.
-- dc:   phần ĐIỀU CHỈNH TỒN do admin khai (phiếu kind 'dc'), có dấu. Phải tách khỏi nhap, nếu
--       không thì báo cáo kỳ nói "nhập 50 cây" cho một lần sửa sổ — thép không về mà sổ ghi về,
--       và tính năng điều chỉnh thành chỗ giấu chênh lệch. Lượng dùng thì vẫn tính trên TỔNG
--       (nhap + dc + chuyen), nhờ vậy sửa sổ không biến thành một cú "đã dùng" giả:
--       dung = ton_truoc + (nhap + dc) - ton_nay.
-- xuat: phần lượng dùng CÓ PHIẾU XUẤT (phiếu kind 'xuat', lưu số dương ở đây). Nó NẰM TRONG
--       cột dung chứ không cộng thêm, nên đẳng thức trên không đổi: ghi phiếu xuất là tự nguyện
--       và chỉ để tách "đã dùng" thành phần có phiếu và phần không rõ. Ngược chiều với dc: xuất
--       là thép đi THẬT nên phải nằm trong lượng dùng, còn dc là sửa sổ nên không.
CREATE TABLE IF NOT EXISTS daily_summary (
  day TEXT NOT NULL,
  phi_id TEXT NOT NULL,
  ton INTEGER NOT NULL,
  nhap INTEGER NOT NULL DEFAULT 0,
  dung INTEGER,
  span INTEGER NOT NULL DEFAULT 1,
  dc INTEGER NOT NULL DEFAULT 0,
  xuat INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, phi_id)
);

-- Tốc độ dùng trung bình mỗi ngày của từng phi (28 ngày gần nhất), cập nhật khi chốt ngày
CREATE TABLE IF NOT EXISTS phi_rate (
  phi_id TEXT PRIMARY KEY,
  per_day REAL NOT NULL,
  days INTEGER NOT NULL
);

-- Tồn chuẩn theo từng ngày đã chốt (khu x phi)
CREATE TABLE IF NOT EXISTS baseline (
  day TEXT NOT NULL,
  khu_id TEXT NOT NULL,
  phi_id TEXT NOT NULL,
  v INTEGER NOT NULL,
  PRIMARY KEY (day, khu_id, phi_id)
);

-- Đối tác bên ngoài để vay/cho vay thép — KHÔNG phải tài khoản đăng nhập, chỉ là một cái tên
-- để chọn khi ghi sổ vay mượn (xem bảng loans). Trùng tên (không phân hoa/thường) bị chặn ở
-- index dưới, để "Cty A" và "cty a" không tách thành hai đối tác khác nhau trong báo cáo.
CREATE TABLE IF NOT EXISTS doitac (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_doitac_name ON doitac(name COLLATE NOCASE);

-- Sổ vay/mượn thép với đối tác NGOÀI bãi. KHÔNG đụng tới tồn kho/số đếm của bãi (xem counts,
-- receipts): đây chỉ là sổ ghi nhớ công nợ thép với bên ngoài, để nhiều người cùng ghi lại dần mà
-- không thất lạc, KHÔNG phải một đường nhập/xuất thứ hai. Thép có di chuyển qua cổng thật thì vẫn
-- phải lập phiếu Nhập/Xuất (receipts) như thường để tồn đúng; sổ này chỉ trả lời "ai đang giữ thép
-- của ai, bao nhiêu, loại nào", không trả lời "bãi còn bao nhiêu thép".
-- kind: 'vay'      bãi mình vay THÊM của đối tác (đối tác đưa thép, mình đang NỢ đối tác)
--       'tra_vay'  mình TRẢ LẠI đối tác phần đã vay (GIẢM nợ mình nợ đối tác)
--       'cho_vay'  mình CHO đối tác vay (mình đưa thép, đối tác đang NỢ mình)
--       'tra_no'   đối tác TRẢ LẠI mình (GIẢM nợ đối tác nợ mình)
-- Dư nợ MÌNH NỢ đối tác (theo từng phi) = SUM(vay) − SUM(tra_vay) của các dòng ĐÃ DUYỆT.
-- Dư nợ ĐỐI TÁC NỢ MÌNH (theo từng phi) = SUM(cho_vay) − SUM(tra_no) của các dòng ĐÃ DUYỆT.
-- Giống receipts: dòng mới sinh ra ở trạng thái CHỜ DUYỆT (duyet_ts NULL), chưa tính vào dư nợ,
-- để admin luôn nắm được số liệu trước khi nó thành chính thức.
-- grp: các dòng cùng MỘT lần ghi (vd cho A vay cả D16 và D18 một lượt), để huỷ/duyệt cùng lúc
-- như một phiếu, giống receipts.grp.
CREATE TABLE IF NOT EXISTS loans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doitac_id INTEGER NOT NULL,
  phi_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('vay','tra_vay','cho_vay','tra_no')),
  qty INTEGER NOT NULL,
  note TEXT,
  grp TEXT,
  user_id INTEGER NOT NULL,
  ts INTEGER NOT NULL,
  voided INTEGER NOT NULL DEFAULT 0,
  voided_ts INTEGER,
  duyet_ts INTEGER,
  duyet_by INTEGER,
  duyet_name TEXT
);
CREATE INDEX IF NOT EXISTS idx_loans_doitac ON loans(doitac_id);
CREATE INDEX IF NOT EXISTS idx_loans_grp ON loans(grp);

CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  user_id INTEGER,
  user_name TEXT,
  action TEXT NOT NULL,
  detail TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Bộ đếm phiên bản: tăng mỗi khi dữ liệu đổi, để máy khách chỉ tải lại khi cần (tiết kiệm hạn mức miễn phí)
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);
INSERT OR IGNORE INTO meta (key, value) VALUES ('rev', 1);
-- Phiên bản cấu trúc: Worker tự nâng cấp khi số này nhỏ hơn bản trong code
INSERT OR IGNORE INTO meta (key, value) VALUES ('schema', 16);

-- Dữ liệu mặc định, giữ khớp với PHI_DEFAULTS trong src/worker.js
-- Thép cây: kg/cây 11,7 m = 0,00617 x D x D x 11,7; cây/bó theo bó Hòa Phát
-- Thép cuộn: 100 phần = 1 cuộn ~2.000 kg -> 20 kg/phần
INSERT OR IGNORE INTO phi (id, sort, kg_per_cay, bo_size, min_stock, unit) VALUES
 ('D6',  0, 20,    100, 200, 'cuon'),
 ('D8',  1, 20,    100, 200, 'cuon'),
 ('D10', 2, 7.22,  440, 440, 'cay'),
 ('D12', 3, 10.40, 320, 320, 'cay'),
 ('D14', 4, 14.15, 222, 222, 'cay'),
 ('D16', 5, 18.48, 180, 180, 'cay'),
 ('D18', 6, 23.39, 138, 138, 'cay'),
 ('D20', 7, 28.88, 114, 114, 'cay'),
 ('D22', 8, 34.94, 90,  90,  'cay'),
 ('D25', 9, 45.11, 72,  36,  'cay'),
 ('D28', 10, 56.60, 57, 29,  'cay'),
 ('D32', 11, 73.92, 45, 23,  'cay'),
 ('D36', 12, 93.55, 35, 18,  'cay');

INSERT OR IGNORE INTO khu (id, name, sort, active) VALUES
 ('A','Khu A',1,1),('B','Khu B',2,1),('C','Khu C',3,1),('D','Khu D',4,1),
 ('E','Khu E',5,1),('F','Khu F',6,1),('G','Khu G',7,1),('H','Khu H',8,1);

INSERT OR IGNORE INTO settings (key, value) VALUES
 ('max_keep_streak','3'),
 ('auto_close','0'),
 ('report_slots_per_day','1'),
 ('work_from','6'),
 ('work_to','18');

-- Nhật ký và lịch sử đếm chỉ được ghi thêm: database từ chối mọi lệnh sửa hoặc xóa
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT, 'Nhat ky chi duoc ghi them'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT, 'Nhat ky chi duoc ghi them'); END;
CREATE TRIGGER IF NOT EXISTS counts_log_no_update BEFORE UPDATE ON counts_log BEGIN SELECT RAISE(ABORT, 'Lich su dem chi duoc ghi them'); END;
CREATE TRIGGER IF NOT EXISTS counts_log_no_delete BEFORE DELETE ON counts_log BEGIN SELECT RAISE(ABORT, 'Lich su dem chi duoc ghi them'); END;
