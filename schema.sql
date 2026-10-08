-- ===== Kho Thép Bãi: cấu trúc dữ liệu D1 =====

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
  created_at INTEGER NOT NULL
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

CREATE TABLE IF NOT EXISTS phi (
  id TEXT PRIMARY KEY,
  sort INTEGER NOT NULL,
  kg_per_cay REAL NOT NULL,
  bo_size INTEGER NOT NULL,
  min_stock INTEGER NOT NULL,
  unit TEXT NOT NULL DEFAULT 'cay'  -- 'cay' = cây nguyên, 'cuon' = dây cuộn (D8)
);

CREATE TABLE IF NOT EXISTS khu (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

-- Phi đang có ở từng khu (phi không có thì không hỏi, hệ thống hiểu là 0)
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

-- Số đếm hiệu lực của từng ô (ngày x khu x phi)
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
  kind TEXT NOT NULL DEFAULT 'nhap', -- 'nhap' thép về, 'chuyen' chuyển khu (dòng âm ở khu đi, dương ở khu đến)
  grp TEXT                            -- các dòng cùng một phiếu
);
CREATE INDEX IF NOT EXISTS idx_receipts_day ON receipts(day);
CREATE INDEX IF NOT EXISTS idx_receipts_grp ON receipts(grp);

-- Chốt ngày: khóa số liệu, lưu mức dùng để tính trung bình
CREATE TABLE IF NOT EXISTS day_close (
  day TEXT PRIMARY KEY,
  closed_by INTEGER NOT NULL,
  ts INTEGER NOT NULL,
  note TEXT,
  used_json TEXT,
  exc_json TEXT,
  span INTEGER NOT NULL DEFAULT 1 -- số ngày gộp (quên chốt thì > 1)
);

-- Tổng hợp theo ngày đã chốt x phi: báo cáo theo kỳ đọc bảng này cho nhẹ hạn mức
CREATE TABLE IF NOT EXISTS daily_summary (
  day TEXT NOT NULL,
  phi_id TEXT NOT NULL,
  ton INTEGER NOT NULL,
  nhap INTEGER NOT NULL DEFAULT 0,
  dung INTEGER,
  span INTEGER NOT NULL DEFAULT 1,
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
INSERT OR IGNORE INTO meta (key, value) VALUES ('schema', 6);

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
 ('hide_after_zero_days','3'),
 ('max_keep_streak','3'),
 ('auto_close','1');

-- Nhật ký và lịch sử đếm chỉ được ghi thêm: database từ chối mọi lệnh sửa hoặc xóa
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT, 'Nhat ky chi duoc ghi them'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT, 'Nhat ky chi duoc ghi them'); END;
CREATE TRIGGER IF NOT EXISTS counts_log_no_update BEFORE UPDATE ON counts_log BEGIN SELECT RAISE(ABORT, 'Lich su dem chi duoc ghi them'); END;
CREATE TRIGGER IF NOT EXISTS counts_log_no_delete BEFORE DELETE ON counts_log BEGIN SELECT RAISE(ABORT, 'Lich su dem chi duoc ghi them'); END;
