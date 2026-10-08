// Kho Thép Bãi - Cloudflare Worker (API) + D1
// Giao diện tĩnh nằm trong /public, mọi đường dẫn /api/* chạy qua file này.

class HttpError extends Error {
  constructor(status, msg, code) { super(msg); this.status = status; this.code = code; }
}
const bad = (m) => new HttpError(400, m);

const enc = new TextEncoder();
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const rand = (n = 32) => toHex(crypto.getRandomValues(new Uint8Array(n)));

async function sha256(s) {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}
async function hmac(key, msg) {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toHex(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
}
function safeEq(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
// PIN chỉ có 4 số nên băm kèm "PEPPER" (bí mật lưu ngoài database): lộ database cũng không dò được PIN
const hashPin = (env, salt, pin) => hmac(env.PEPPER, salt + ':' + pin);

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });

const vnDay = (ms = Date.now()) => new Date(ms + 7 * 3600e3).toISOString().slice(0, 10); // giờ Việt Nam
const fmtDay = (d) => String(d).split('-').reverse().join('/');
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400e3);
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const KINDS = ['dem', 'giu', 'zero'];
const ROLES = ['admin', 'thukho', 'nguoidem'];
const SESSION_MS = 30 * 24 * 3600e3;
const LOCK_AFTER = 5;
const LOCK_STEPS = [15 * 60e3, 60 * 60e3, 24 * 3600e3]; // sai nhiều đợt liên tiếp thì khóa lâu dần
// số lần sai PIN tối đa mỗi ngày từ một địa chỉ IP; cả bãi dùng chung Wi-Fi/4G (chung IP) nên để cao,
// việc chặn dò PIN từng tài khoản đã do LOCK_AFTER/LOCK_STEPS đảm nhận
const IP_FAIL_MAX = 300;
const SYSTEM = { id: 0, name: 'Hệ thống' };
/* Ngưỡng cảnh báo tính theo KHỐI LƯỢNG, không theo số "cây": 10 cây D10 là 72 kg còn 10 phần D6 là 200 kg,
   nên một mốc đếm chung sẽ nhạy khác nhau cả chục lần giữa các phi. */
const HIGH_KG = 500;  // "dùng nhiều bất thường" chỉ xét khi lượng dùng vượt 500 kg
const NEG_KG = 100;   // "dùng âm" dưới 100 kg coi là sai số đếm, không báo động
const RATE_K = 3;     // và phải gấp 3 lần mức dùng trung bình mỗi ngày
const PEAK_K = 1.5;   // và hơn 1,5 lần ngày dùng nhiều nhất từng ghi nhận (phi dùng thưa không bị báo oan)
const MIN_RATE_DAYS = 5; // dưới 5 ngày dữ liệu thì chưa dự báo "còn đủ dùng bao lâu"
/* Soi riêng từng khu (xem computeReview). Ba mốc này CHỈ để tô đậm dòng lệch cho người duyệt
   dễ thấy; chúng KHÔNG quyết định khu có được duyệt hay không. Mọi khu đã báo đều duyệt được,
   lệch hay không lệch, vì người duyệt mới là người quyết định — màn Duyệt chỉ có việc bày số ra. */
const KHU_UP_KG = 100;    // đếm dư quá 100 kg thì tô đậm
const KHU_DOWN_KG = 300;  // hụt quá 300 kg
const KHU_DOWN_PCT = 0.5; // và quá nửa số dự kiến thì tô đậm

/* ========================= DỮ LIỆU MẶC ĐỊNH PHI =========================
   Thông số chuẩn; admin sửa riêng trong Cài đặt. INSERT OR IGNORE không ghi đè số admin đã sửa.
   - Thép cây: kg/cây 11,7 m theo TCVN 1651-2 (0,00617 × D²), giống nhau giữa các nhà máy.
     Cây/bó theo bó nhà máy Hòa Phát (~3,2–3,3 tấn/bó); bó Việt Ý hoặc bó tách ở bãi thì sửa riêng.
   - Thép cuộn: 1 cuộn lưu thành `bo` phần (100 phần = 1 cuộn), kg = kg mỗi phần.
     Cuộn Hòa Phát / Việt Ý ~2.000 kg → 20 kg/phần.
   - min: mức báo động (đơn vị lưu: cây hoặc phần cuộn) = 1 bó, ½ bó với phi lớn, 2 cuộn với D6/D8. */
const PHI_DEFAULTS = [
  { id: 'D6',  sort: 0,  kg: 20,    bo: 100, min: 200, unit: 'cuon' },
  { id: 'D8',  sort: 1,  kg: 20,    bo: 100, min: 200, unit: 'cuon' },
  { id: 'D10', sort: 2,  kg: 7.22,  bo: 440, min: 440, unit: 'cay'  },
  { id: 'D12', sort: 3,  kg: 10.40, bo: 320, min: 320, unit: 'cay'  },
  { id: 'D14', sort: 4,  kg: 14.15, bo: 222, min: 222, unit: 'cay'  },
  { id: 'D16', sort: 5,  kg: 18.48, bo: 180, min: 180, unit: 'cay'  },
  { id: 'D18', sort: 6,  kg: 23.39, bo: 138, min: 138, unit: 'cay'  },
  { id: 'D20', sort: 7,  kg: 28.88, bo: 114, min: 114, unit: 'cay'  },
  { id: 'D22', sort: 8,  kg: 34.94, bo: 90,  min: 90,  unit: 'cay'  },
  { id: 'D25', sort: 9,  kg: 45.11, bo: 72,  min: 36,  unit: 'cay'  },
  { id: 'D28', sort: 10, kg: 56.60, bo: 57,  min: 29,  unit: 'cay'  },
  { id: 'D32', sort: 11, kg: 73.92, bo: 45,  min: 23,  unit: 'cay'  },
  { id: 'D36', sort: 12, kg: 93.55, bo: 35,  min: 18,  unit: 'cay'  },
];
function seedPhi(env) {
  return env.DB.batch(PHI_DEFAULTS.map((p) =>
    env.DB.prepare('INSERT OR IGNORE INTO phi (id, sort, kg_per_cay, bo_size, min_stock, unit) VALUES (?,?,?,?,?,?)')
      .bind(p.id, p.sort, p.kg, p.bo, p.min, p.unit)
  ));
}

/* ========================= TỰ NÂNG CẤP DATABASE =========================
   Deploy qua GitHub không chạy lại schema.sql, nên Worker tự áp dụng các thay đổi cấu trúc
   một lần (ghi số phiên bản vào meta.schema). Mỗi isolate chỉ tốn 1 truy vấn đọc để kiểm tra. */
const SCHEMA_VERSION = 14;
const MIGRATIONS = {
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
  13: [
    'ALTER TABLE daily_summary ADD COLUMN dc INTEGER NOT NULL DEFAULT 0',
  ],
};
const RATE_SQL = `INSERT OR REPLACE INTO phi_rate (phi_id, per_day, days)
  SELECT phi_id, SUM(dung) * 1.0 / SUM(span), SUM(span) FROM daily_summary
  WHERE dung IS NOT NULL AND day > date(?1, '-28 days') AND day <= ?1 GROUP BY phi_id`;
let schemaReady = null;
function ensureSchema(env) {
  if (!schemaReady) schemaReady = migrate(env).catch((e) => { schemaReady = null; throw e; });
  return schemaReady;
}
async function migrate(env) {
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

function normPhone(p) {
  const d = String(p || '').replace(/\D/g, '');
  if (d.length < 9 || d.length > 11) throw bad('Số điện thoại không hợp lệ');
  return d;
}
function checkPin(p) {
  if (!/^\d{4}$/.test(String(p || ''))) throw bad('PIN phải gồm đúng 4 chữ số');
  if (/^(\d)\1{3}$/.test(p) || ['1234', '4321', '0123'].includes(p)) throw bad('PIN quá dễ đoán, hãy chọn số khác');
}
const genPin = () => {
  for (;;) {
    const n = crypto.getRandomValues(new Uint32Array(1))[0] % 10000;
    const p = String(n).padStart(4, '0');
    try { checkPin(p); return p; } catch (e) { /* thử lại */ }
  }
};
// D6/D8 lưu theo "phần" (100 phần = 1 cuộn), các phi khác lưu theo cây: thông báo phải gọi đúng tên
const isCuon = (p) => !!(p && p.unit === 'cuon');
const unitWord = (p) => (isCuon(p) ? 'phần' : 'cây');
// tệp Excel: thép cuộn quy ra số cuộn (350 phần → 3.5), không để số phần nằm dưới chữ "cây"
const csvUnit = (p) => (isCuon(p) ? 'cuộn' : 'cây');
/* CSV mở bằng Excel máy Việt Nam: vùng vi-VN tách cột bằng dấu ';' và hiểu '.' là phân cách NGHÌN.
   Xuất kiểu "3.01" ngăn bằng dấu phẩy thì Excel vi-VN dồn hết vào một cột, và "83.43" tấn đọc
   thành 8343 — sai 100 lần trên đúng tệp mang đi đối chiếu. Nên: dòng đầu khai 'sep=;',
   ngăn cột bằng ';', số thập phân viết dấu phẩy. Excel cả vùng Việt lẫn vùng Mỹ đều đọc đúng. */
const CSV_SEP = ';';
const CSV_HEAD = '\ufeffsep=;\r\n';
const csvRow = (cells) => cells.join(CSV_SEP);
const csvDec = (x, dp) => (x == null || x === '' ? '' : Number(x).toFixed(dp).replace('.', ','));
const csvQty = (v, p) => (isCuon(p) ? csvDec(Math.round((v / p.bo_size) * 100) / 100, 2) : String(v));
const boWord = (p) => (isCuon(p) ? 'Số cuộn' : 'Số bó');
const qtyWord = (v, p) => {
  if (!isCuon(p)) return v + ' cây';
  const c = Math.floor(v / p.bo_size), r = v % p.bo_size;
  return (c ? c + ' cuộn' : '') + (c && r ? ' + ' : '') + (r || !c ? r + ' phần' : '');
};
const intIn = (v, min, max, label) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw bad(label + ' không hợp lệ');
  return n;
};

async function readJson(req) {
  try { return await req.json(); } catch (e) { throw bad('Dữ liệu gửi lên không hợp lệ'); }
}

const bump = (env) => env.DB.prepare("UPDATE meta SET value = value + 1 WHERE key = 'rev'");

// Kiểm tra rồi mới ghi ở hai lượt khác nhau thì có khe hở (vd. vừa kiểm tra xong thì admin chốt ngày).
// Câu chặn đặt đầu batch: điều kiện đúng thì vi phạm NOT NULL, D1 hủy cả batch vì batch là một giao dịch.
const guardStmt = (env, cond, ...args) =>
  env.DB.prepare(`INSERT INTO meta (key, value) SELECT 'guard', NULL WHERE ${cond}`).bind(...args);
async function batchGuarded(env, guard, stmts, err) {
  try { return (await env.DB.batch([guard, ...stmts])).slice(1); }
  catch (e) {
    // D1 có thể đổi câu chữ thông báo lỗi: nhận diện rộng, và ghi log khi không khớp để còn biết mà sửa
    const m = String((e && e.message) || '');
    if (/NOT NULL/i.test(m) && /meta/i.test(m)) throw err;
    console.error('batchGuarded: lỗi không nhận ra', m);
    throw e;
  }
}
const IS_CLOSED = 'EXISTS (SELECT 1 FROM day_close WHERE day = ?)';
const closedErr = (msg) => new HttpError(409, msg || 'Ngày hôm nay vừa được chốt, không ghi được nữa', 'closed');

function auditStmt(env, user, action, detail) {
  return env.DB.prepare('INSERT INTO audit (ts, user_id, user_name, action, detail) VALUES (?,?,?,?,?)')
    .bind(Date.now(), user ? user.id : null, user ? user.name : null, action, detail ? JSON.stringify(detail) : null);
}

// renew = false cho các lần hỏi ngầm (/rev) để không phát sinh lượt ghi
async function auth(req, env, renew = true) {
  const m = (req.headers.get('Cookie') || '').match(/(?:^|;\s*)sid=([a-f0-9]{64})/);
  if (!m) throw new HttpError(401, 'Chưa đăng nhập');
  const th = await sha256(m[1]);
  const row = await env.DB.prepare(
    'SELECT u.id, u.name, u.phone, u.role, u.locked, u.deleted, u.must_change, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?'
  ).bind(th).first();
  // xoá tài khoản đã thu hồi mọi phiên, nhưng vẫn kiểm ở đây: phiên là thứ dùng để vào hệ thống
  if (!row || row.expires_at < Date.now() || row.locked || row.deleted) throw new HttpError(401, 'Phiên đăng nhập hết hạn');
  if (renew && row.expires_at - Date.now() < SESSION_MS / 2) {
    await env.DB.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').bind(Date.now() + SESSION_MS, th).run();
  }
  return row;
}

function sessionCookie(url, token, maxAge) {
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  return `sid=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

/* Tên người báo. Dùng LEFT JOIN + dự phòng tên: nếu một dòng users biến mất thì INNER JOIN
   sẽ làm cả số đếm/phiếu của người đó biến khỏi màn hình trong khi vẫn nạm trong database và vẫn
   được computeReview/baseline tính — hai màn hình lệch nhau mà không ai hiểu tại sao. */
const UNAME = "COALESCE(u.name, '(đã xoá)') uname";
/* Tên NGƯỜI DUYỆT: lấy từ bảng users qua duyet_by, không dùng duyet_name đã lưu cứng trong dòng
   số liệu. Lý do: sửa tên phải lan tới mọi chỗ hiện hoạt động, mà tài khoản hay mang tên theo
   chức danh ("admin") lại chính là tài khoản đi duyệt gần như mọi thứ — để tên cứng thì sửa tên
   xong màn Xem lại ngày cũ vẫn ghi "admin". duyet_name giữ lại làm bản lưu tên LÚC DUYỆT, và là
   đường rơi về nếu dòng users biến mất (dữ liệu cũ bị xoá tay trong database). */
const DUYET_NAME = "COALESCE(ud.name, c.duyet_name) duyet_uname";
const DUYET_JOIN = 'LEFT JOIN users ud ON ud.id = c.duyet_by';
const SETTINGS_SQL = 'SELECT key, value FROM settings';
const SETTING_RANGE = { max_keep_streak: [1, 30], auto_close: [0, 1] };
function parseSettings(rows) {
  const o = { max_keep_streak: 3, auto_close: 0 };
  for (const r of rows) o[r.key] = Number(r.value);
  return o;
}

async function createSession(env, url, req, userId) {
  const token = rand(32);
  const th = await sha256(token);
  const ua = (req.headers.get('User-Agent') || '').slice(0, 120);
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, device, created_at, expires_at) VALUES (?,?,?,?,?)')
    .bind(th, userId, ua, Date.now(), Date.now() + SESSION_MS).run();
  return sessionCookie(url, token, SESSION_MS / 1000);
}

/* ========================= ĐĂNG NHẬP ========================= */

async function setup(req, env, url) {
  const b = await readJson(req);
  if (!env.SETUP_TOKEN || !env.PEPPER) throw new HttpError(500, 'Chưa cấu hình SETUP_TOKEN và PEPPER');
  const c = await env.DB.prepare('SELECT COUNT(*) n FROM users').first();
  if (c.n > 0) throw new HttpError(403, 'Hệ thống đã được thiết lập');
  if (!safeEq(String(b.token || ''), env.SETUP_TOKEN)) throw new HttpError(403, 'Mã thiết lập sai');
  const phone = normPhone(b.phone);
  checkPin(String(b.pin || ''));
  const name = String(b.name || '').trim().slice(0, 60);
  if (!name) throw bad('Cần nhập tên');
  const salt = rand(16);
  const hash = await hashPin(env, salt, b.pin);
  const r = await env.DB.prepare(
    "INSERT INTO users (name, phone, role, pin_salt, pin_hash, must_change, created_at) VALUES (?,?,'admin',?,?,0,?)"
  ).bind(name, phone, salt, hash, Date.now()).run();
  await auditStmt(env, { id: r.meta.last_row_id, name }, 'setup', null).run();
  return json({ ok: true });
}

async function login(req, env, url) {
  if (!env.PEPPER) throw new HttpError(500, 'Chưa cấu hình PEPPER');
  const b = await readJson(req);
  const phone = String(b.phone || '').replace(/\D/g, '');
  const pin = String(b.pin || '');
  const fail = () => new HttpError(401, 'Sai số điện thoại hoặc PIN');
  const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
  const today = vnDay();
  const [uR, ipR] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM users WHERE phone = ?').bind(phone),
    env.DB.prepare('SELECT n FROM login_fail WHERE ip = ? AND day = ?').bind(ip, today),
  ]);
  if (ipR.results[0] && ipR.results[0].n >= IP_FAIL_MAX) throw new HttpError(429, 'Thiết bị này nhập sai quá nhiều lần hôm nay, hãy thử lại vào ngày mai hoặc báo admin');
  // chỉ ghi khi nhập sai, đăng nhập đúng không tốn lượt ghi
  const ipFail = env.DB.prepare('INSERT INTO login_fail (ip, day, n) VALUES (?,?,1) ON CONFLICT(ip, day) DO UPDATE SET n = n + 1').bind(ip, today);
  const u = uR.results[0];
  if (!u) { await ipFail.run(); throw fail(); }
  /* Tài khoản đã xoá: trả lời y như sai PIN, không nói "tài khoản đã xoá". Nói rõ là tiết lộ
     số điện thoại nào từng có tài khoản cho người đang dò. Người bị xoá thật thì hỏi admin. */
  if (u.deleted) { await ipFail.run(); throw fail(); }
  if (u.locked) throw new HttpError(403, 'Tài khoản đã bị khóa, liên hệ admin');
  if (u.locked_until > Date.now()) {
    const mins = Math.ceil((u.locked_until - Date.now()) / 60000);
    throw new HttpError(429, `Nhập sai nhiều lần, thử lại sau ${mins >= 120 ? Math.ceil(mins / 60) + ' giờ' : mins + ' phút'}`);
  }
  const ok = safeEq(await hashPin(env, u.pin_salt, pin), u.pin_hash);
  if (!ok) {
    const n = u.fail_count + 1;
    const ua = (req.headers.get('User-Agent') || '').slice(0, 80);
    if (n >= LOCK_AFTER) {
      const level = u.lock_level || 0;
      const ms = LOCK_STEPS[Math.min(level, LOCK_STEPS.length - 1)];
      await env.DB.batch([
        env.DB.prepare('UPDATE users SET fail_count = 0, locked_until = ?, lock_level = ? WHERE id = ?').bind(Date.now() + ms, level + 1, u.id),
        auditStmt(env, u, 'login_locked', { phone, mins: ms / 60e3, ip }),
        ipFail,
      ]);
    } else {
      await env.DB.batch([
        env.DB.prepare('UPDATE users SET fail_count = ? WHERE id = ?').bind(n, u.id),
        auditStmt(env, u, 'login_fail', { n, ua, ip }),
        ipFail,
      ]);
    }
    throw fail();
  }
  const cookie = await createSession(env, url, req, u.id);
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET fail_count = 0, locked_until = 0, lock_level = 0 WHERE id = ?').bind(u.id),
    auditStmt(env, u, 'login', { ua: (req.headers.get('User-Agent') || '').slice(0, 80) }),
  ]);
  return json({ user: { id: u.id, name: u.name, role: u.role, must_change: u.must_change } }, 200, { 'Set-Cookie': cookie });
}

async function logout(req, env, url) {
  const m = (req.headers.get('Cookie') || '').match(/(?:^|;\s*)sid=([a-f0-9]{64})/);
  if (m) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(m[1])).run();
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(url, '', 0) });
}

async function recoverAdmin(req, env) {
  if (!env.RECOVERY_TOKEN || !env.PEPPER) throw new HttpError(503, 'Chưa cấu hình recovery');
  const b = await readJson(req);
  if (!b.token || !safeEq(String(b.token), env.RECOVERY_TOKEN)) throw new HttpError(403, 'Token không đúng');
  const phone = String(b.phone || '').replace(/\D/g, '');
  if (!phone) throw bad('Thiếu số điện thoại');
  const np = String(b.newPin || '');
  checkPin(np);
  const u = await env.DB.prepare('SELECT * FROM users WHERE phone = ? AND role = ? AND deleted = 0').bind(phone, 'admin').first();
  if (!u) throw new HttpError(404, 'Không tìm thấy tài khoản admin với số điện thoại này');
  const salt = rand(16);
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET pin_salt=?, pin_hash=?, must_change=0, fail_count=0, locked_until=0, lock_level=0 WHERE id=?').bind(salt, await hashPin(env, salt, np), u.id),
    env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(u.id),
    auditStmt(env, u, 'recover_pin', { ip: req.headers.get('CF-Connecting-IP') || 'unknown' }),
  ]);
  return json({ ok: true, name: u.name });
}

async function changePin(req, env, user) {
  const b = await readJson(req);
  const u = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first();
  if (!safeEq(await hashPin(env, u.pin_salt, String(b.pin || '')), u.pin_hash)) throw new HttpError(401, 'PIN hiện tại không đúng');
  const np = String(b.newPin || '');
  checkPin(np);
  if (np === String(b.pin)) throw bad('PIN mới phải khác PIN cũ');
  const salt = rand(16);
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET pin_salt = ?, pin_hash = ?, must_change = 0 WHERE id = ?').bind(salt, await hashPin(env, salt, np), user.id),
    auditStmt(env, user, 'change_pin', null),
  ]);
  return json({ ok: true });
}

/* ========================= DỮ LIỆU CHUNG ========================= */

async function bootstrap(env, user) {
  const day = vnDay();
  const lc = await env.DB.prepare('SELECT day FROM day_close WHERE day < ? ORDER BY day DESC LIMIT 1').bind(day).first();
  const last = lc ? lc.day : '';
  const [phi, khu, khuPhi, counts, baseline, reports, receipts, closed, rev, innKhu, eff, mvNew, settings, rates, khuUser, uFirst] = await env.DB.batch([
    env.DB.prepare('SELECT id, kg_per_cay, bo_size, min_stock, unit, active FROM phi ORDER BY sort'),
    env.DB.prepare('SELECT id, name, active FROM khu ORDER BY sort, id'),
    env.DB.prepare('SELECT khu_id, phi_id, keep_streak FROM khu_phi'),
    env.DB.prepare(`SELECT c.khu_id, c.phi_id, c.v, c.kind, c.bo, c.le, c.user_id, ${UNAME}, c.ts,
                      c.duyet_v, c.duyet_ts, c.duyet_at, ${DUYET_NAME}
                    FROM counts c LEFT JOIN users u ON u.id = c.user_id ${DUYET_JOIN} WHERE c.day = ?`).bind(day),
    env.DB.prepare('SELECT khu_id, phi_id, v FROM baseline WHERE day = ?').bind(last),
    env.DB.prepare(`SELECT r.khu_id, r.user_id, ${UNAME}, r.ts, r.conflict, r.resolved, r.recount FROM khu_report r LEFT JOIN users u ON u.id = r.user_id WHERE r.day = ?`).bind(day),
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
  };
}

/* ========================= BÁO CÁO ĐẾM ========================= */

// Gói Free giới hạn khoảng 50 truy vấn D1 mỗi request: ghi cả danh sách bằng MỘT câu lệnh,
// dữ liệu gửi dạng JSON trong một tham số rồi tách bằng json_each (số truy vấn không đổi dù thêm phi).
const J = (f) => `json_extract(j.value, '$.${f}')`;

/* Số đếm HIỆU LỰC của một ô (khu × phi) = lần báo GẦN NHẤT kể từ sau lần chốt trước, không phải
   chỉ lần báo của đúng ngày đang xét. Quên chốt vài ngày là chuyện thường (mất mạng, nghỉ lễ):
   nếu chỉ đọc counts của ngày chốt thì khu nào hôm đó không báo sẽ bị quay về tồn chuẩn cũ,
   xoá sạch những ngày họ đã báo ở giữa. */
/* MỌI đường đọc tồn đều đi qua đây và đều đòi duyet_v IS NOT NULL: chưa duyệt thì không vào tồn.
   Lấy ngày gần nhất CÓ SỐ ĐÃ DUYỆT, nên khu báo ngày 3 mà chưa ai duyệt thì tồn vẫn là số
   đã duyệt của ngày 2 — đúng câu "tồn của khu tính theo báo cáo mới nhất ĐƯỢC DUYỆT". */
const EFF_JOIN = (A, B) => `LEFT JOIN counts c
  ON c.khu_id = kx.khu_id AND c.phi_id = kx.phi_id AND c.day > ?${A} AND c.day <= ?${B} AND c.duyet_v IS NOT NULL
  AND c.day = (SELECT MAX(c2.day) FROM counts c2
               WHERE c2.khu_id = kx.khu_id AND c2.phi_id = kx.phi_id AND c2.day > ?${A} AND c2.day <= ?${B}
                 AND c2.duyet_v IS NOT NULL)`;
// ?1 = ngày chốt trước ('' nếu chưa có), ?2 = ngày đang xét
const EFF_SELECT = `SELECT c.khu_id, c.phi_id, c.duyet_v v, c.duyet_kind kind, c.duyet_at ts, c.day FROM counts c
  WHERE c.day > ?1 AND c.day <= ?2 AND c.duyet_v IS NOT NULL
    AND c.day = (SELECT MAX(c2.day) FROM counts c2
                 WHERE c2.khu_id = c.khu_id AND c2.phi_id = c.phi_id AND c2.day > ?1 AND c2.day <= ?2
                   AND c2.duyet_v IS NOT NULL)`;
// như trên nhưng mốc là ngày có tồn chuẩn gần nhất tính đến ?1 (dùng cho xuất CSV một ngày bất kỳ)
const EFF_BY_BASELINE = `SELECT c.khu_id, c.phi_id, c.duyet_v v, c.duyet_at ts FROM counts c
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
const MV_CHUA_DEM = `SELECT r.khu_id, r.phi_id, SUM(r.qty) q FROM receipts r
  LEFT JOIN (${EFF_BY_BASELINE}) e ON e.khu_id = r.khu_id AND e.phi_id = r.phi_id
  WHERE r.voided = 0 AND r.duyet_day IS NOT NULL
    AND r.duyet_day > (SELECT COALESCE(MAX(day), '') FROM baseline WHERE day <= ?1)
    AND r.duyet_day <= ?1 AND (e.ts IS NULL OR r.duyet_ts > e.ts)
  GROUP BY r.khu_id, r.phi_id HAVING SUM(r.qty) <> 0`;
/* Mọi (khu x phi) đang dùng. Thay cho khu_phi làm bảng liệt kê: từ bản 1.3 khu nào cũng có đủ phi,
   nên tồn chuẩn thành đặc (8 khu x 13 phi) và bỏ được trường hợp "khu hôm qua không có phi đó". */
const KHU_X_PHI = `SELECT k.id khu_id, p.id phi_id FROM khu k, phi p WHERE k.active = 1 AND p.active = 1`;
/* Như trên nhưng KHÔNG lọc theo cờ đang dùng. Dùng cho CHỐT CHẶN (đếm thép trước khi cho ẩn khu
   hoặc ẩn phi): chốt chặn phải thấy cả thép nằm ở ô đã bị ẩn, nếu không thì ẩn khu rồi ẩn phi là
   lọt qua cả hai lần kiểm. Hệ thống không cho ẩn khu/phi còn thép, nhưng dữ liệu cũ bị ẩn bằng
   tay trong DB thì vẫn còn (xem mục 9 của bộ test), nên chỗ kiểm phải dè dặt hơn chỗ hiển thị. */
const KHU_X_PHI_ALL = `SELECT k.id khu_id, p.id phi_id FROM khu k, phi p`;

/* "Có người KHÁC đã báo phi này với số KHÁC" — tính bằng SQL ngay trước khi ghi đè counts.
   So ở JS trên dữ liệu đọc trước đó sẽ bỏ sót khi hai người gửi gần như cùng lúc; còn chỉ so
   "người báo khác nhau" thì hai người báo giống số cũng bị coi là xung đột. */
const conflictCond = (day, khu, usr, data) =>
  `EXISTS (SELECT 1 FROM counts c, json_each(?${data}) j
     WHERE c.day = ?${day} AND c.khu_id = ?${khu} AND c.phi_id = ${J('phi')}
       AND c.user_id <> ?${usr} AND c.v <> ${J('v')})`;

async function putCounts(req, env, user) {
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

/* ========================= NHẬP KHO ========================= */

// Đọc danh sách dòng { phi, qty } của một phiếu; gộp các dòng trùng phi
function parseLines(b, ctx) {
  const phiBy = ctx.phiBy || {};
  const raw = Array.isArray(b.lines) ? b.lines : b.phi !== undefined ? [{ phi: b.phi, qty: b.qty }] : [];
  if (!raw.length) throw bad('Phiếu chưa có dòng nào');
  if (raw.length > 30) throw bad('Một phiếu tối đa 30 dòng');
  const sum = {};
  for (const it of raw) {
    const phi = String((it && it.phi) || '');
    if (!phiBy[phi]) throw bad('Phi không hợp lệ: ' + phi);
    sum[phi] = (sum[phi] || 0) + intIn(it.qty, 1, 99999, 'Số ' + unitWord(phiBy[phi]) + ' của ' + phi);
  }
  return Object.entries(sum).map(([phi, qty]) => {
    if (qty > 99999) throw bad('Số ' + unitWord(phiBy[phi]) + ' của ' + phi + ' quá lớn');
    return { phi, qty };
  });
}

async function receiptCtx(env, khuIds) {
  const day = vnDay();
  const [closedR, phiR, khuR] = await env.DB.batch([
    env.DB.prepare('SELECT 1 x FROM day_close WHERE day = ?').bind(day),
    /* kg_per_cay phải có ở đây: postAdjust cân ngưỡng "điều chỉnh rất lớn" theo KHỐI LƯỢNG, và
       thiếu cột thì phép nhân ra NaN, mọi phép so với ngưỡng thành false — chốt chặn im lặng
       không chạy lần nào, đúng kiểu lỗi không ai nhìn thấy cho tới lúc cần nó nhất. */
    env.DB.prepare('SELECT id, bo_size, unit, kg_per_cay FROM phi WHERE active = 1'),
    env.DB.prepare('SELECT id, name FROM khu WHERE active = 1'),
  ]);
  if (closedR.results.length) throw new HttpError(409, 'Ngày hôm nay đã chốt', 'closed');
  const khu = Object.fromEntries(khuR.results.map((k) => [k.id, k]));
  for (const id of khuIds) if (!khu[id]) throw bad('Khu không hợp lệ');
  return {
    day, khu,
    phiBy: Object.fromEntries(phiR.results.map((r) => [r.id, r])),
  };
}

/* Tồn thực có của một khu theo từng phi, dùng để chặn chuyển quá số đang có.
   Ba điểm phải đúng, mỗi điểm từng là một lỗi thật:

   1. Số đếm lấy theo EFF (lần đếm ĐÃ DUYỆT gần nhất kể từ lần chốt trước), không phải counts của
      riêng hôm nay. Bản cũ join 'c.day = hôm nay' nên gặp ngày quên chốt là tính sai: tồn chuẩn
      ngày 1 có 100, khu đếm còn 60 ngày 2, ngày 3 chuyển đi thì chốt chặn thấy 100 và cho chuyển
      cả 100 ra khỏi khu đang thực có 60.
   2. Chỉ cộng phiếu ĐÃ DUYỆT, vì chỉ phiếu đã duyệt mới vào tồn.
   3. Nhưng phải TRỪ cả phiếu chuyển đi ĐANG CHỜ DUYỆT (qty < 0). Không trừ thì hai phiếu chờ
      duyệt cùng rút một lô thép đều qua được chốt chặn, duyệt cả hai là khu âm. */
async function stockOf(env, day, khuId, phis) {
  const data = JSON.stringify(phis.map((p) => ({ phi: p })));
  const LAST = "(SELECT COALESCE(MAX(day), '') FROM day_close WHERE day < ?1)";
  const { results } = await env.DB.prepare(
    `SELECT ${J('phi')} phi,
       CASE WHEN e.v IS NOT NULL
         THEN e.v + COALESCE((SELECT SUM(qty) FROM receipts rr WHERE rr.voided = 0 AND rr.khu_id = ?2
                               AND rr.phi_id = ${J('phi')} AND rr.duyet_day IS NOT NULL
                               AND rr.duyet_day <= ?1 AND rr.duyet_ts > e.ts), 0)
         ELSE COALESCE(b.v, 0) + COALESCE((SELECT SUM(qty) FROM receipts rr WHERE rr.voided = 0 AND rr.khu_id = ?2
                               AND rr.phi_id = ${J('phi')} AND rr.duyet_day IS NOT NULL
                               AND rr.duyet_day <= ?1 AND rr.duyet_day > ${LAST}), 0)
       END
       + COALESCE((SELECT SUM(qty) FROM receipts rr WHERE rr.voided = 0 AND rr.duyet_day IS NULL
                    AND rr.khu_id = ?2 AND rr.phi_id = ${J('phi')} AND rr.qty < 0), 0) have
     FROM json_each(?3) j
     LEFT JOIN (${EFF_SELECT.replace('?1', LAST).replace('?2', '?1')}) e
       ON e.khu_id = ?2 AND e.phi_id = ${J('phi')}
     LEFT JOIN baseline b ON b.day = ${LAST} AND b.khu_id = ?2 AND b.phi_id = ${J('phi')}`
  ).bind(day, khuId, data).all();
  return Object.fromEntries(results.map((r) => [r.phi, r.have || 0]));
}

/* Ghi các dòng (đã có khu và qty có dấu) trong MỘT batch. Phiếu ra đời ở trạng thái CHỜ DUYỆT
   (duyet_day NULL) nên chưa tác động gì tới tồn — kể cả phiếu do admin tự nhập, vì mọi phiếu
   đều phải có một lần bấm duyệt để chứng từ nào cũng có dấu vết duyệt như nhau. */
async function writeReceipt(env, user, ctx, rows, kind, note, audit) {
  const grp = rand(8);
  const ts = Date.now();
  const data = JSON.stringify(rows);
  const res = await batchGuarded(env, guardStmt(env, IS_CLOSED, ctx.day), [
    env.DB.prepare(
      `INSERT INTO receipts (day, phi_id, khu_id, qty, note, user_id, ts, kind, grp)
       SELECT ?1, ${J('phi')}, ${J('khu')}, ${J('qty')}, ?2, ?3, ?4, ?5, ?6 FROM json_each(?7) j`
    ).bind(ctx.day, note, user.id, ts, kind, grp, data),
    auditStmt(env, user, { chuyen: 'transfer', dc: 'adjust', xuat: 'issue' }[kind] || 'receipt', { ...audit, grp, note }),
    bump(env),
    env.DB.prepare('SELECT id FROM receipts WHERE grp = ?').bind(grp),
  ], closedErr());
  const ids = res[3].results.map((r) => r.id);
  return json({ ok: true, grp, ids, id: ids[0] === undefined ? null : ids[0] });
}

/* Mọi phiếu RÚT THÉP KHỎI MỘT KHU (chuyển đi, điều chỉnh giảm) phải kiểm lại tồn khu nguồn
   ĐÚNG LÚC DUYỆT. Lúc lập phiếu còn đủ thép không có nghĩa là lúc duyệt còn đủ — ở giữa khu có
   thể đã đếm xuống, hoặc một phiếu rút khác đã được duyệt trước. Không kiểm lại thì số "đang có"
   của khu nguồn thành âm.
   Dùng CHUNG cho ba đường: duyệt riêng một phiếu, duyệt khu (gộp cả phiếu đang chờ của khu đó),
   và lúc LẬP phiếu điều chỉnh giảm. Trước đây chỉ đường thứ nhất kiểm, nên cùng một việc mà hai
   nút cho hai kết quả khác nhau — bấm "Duyệt khu" là lọt qua đúng cái chốt chặn mà "Duyệt phiếu"
   dựng ra.
   `lines`: các dòng của phiếu (rỗng = không có gì phải kiểm).
   `opt.duyet === false`: đang LẬP phiếu, không phải duyệt — đổi lời báo lỗi cho khỏi nói "không
   duyệt được" vào mặt người vừa bấm lưu. */
async function checkTransferStock(env, day, lines, opt) {
  const out = lines.filter((x) => x.qty < 0);
  if (!out.length) return;
  const o = opt || {};
  const dc = o.kind === 'dc';
  const dau = o.duyet === false ? '' : 'Không duyệt được: ';
  const viec = { dc: 'điều chỉnh giảm', xuat: 'phiếu xuất' }[o.kind] || 'phiếu chuyển';
  const byKhu = {};
  out.forEach((x) => { (byKhu[x.khu_id] = byKhu[x.khu_id] || []).push(x); });
  const phiR = await env.DB.prepare('SELECT id, bo_size, unit FROM phi').all();
  const phiBy = Object.fromEntries(phiR.results.map((x) => [x.id, x]));
  const khuR = await env.DB.prepare('SELECT id, name FROM khu').all();
  const nameOf = Object.fromEntries(khuR.results.map((x) => [x.id, x.name]));
  for (const khuId of Object.keys(byKhu)) {
    const have = await stockOf(env, day, khuId, byKhu[khuId].map((x) => x.phi_id));
    for (const x of byKhu[khuId]) {
      /* stockOf đã trừ MỌI phiếu rút đang chờ duyệt. Lúc DUYỆT thì phiếu đang xét nằm trong số
         bị trừ đó, nên phải cộng ngược phần của chính nó vào trước khi so, không thì phiếu nào
         cũng tự thấy thiếu.
         Lúc LẬP thì ngược lại: phiếu chưa có trong database nên stockOf chưa trừ nó, cộng ngược
         là cộng thêm một lượng chưa ai trừ — chốt chặn thành `|qty| > have + |qty|`, VĨNH VIỄN
         SAI, tức là lập phiếu giảm bao nhiêu cũng qua. Vì vậy hai trường hợp phải tách. */
      const self = o.duyet === false ? 0 : x.qty;
      const h = (have[x.phi_id] || 0) - self;
      if (-x.qty > h) {
        throw bad(`${dau}${nameOf[khuId] || khuId} chỉ còn ${qtyWord(h, phiBy[x.phi_id])} ${x.phi_id}, ${viec} ${qtyWord(-x.qty, phiBy[x.phi_id])}`);
      }
    }
  }
}

/* Duyệt một phiếu (cả grp). duyet_day là NGÀY HÔM NAY, không phải ngày nhập: phiếu vào tồn kể từ
   lúc được duyệt, nên nó thuộc về ngày duyệt. Phiếu nhập chiều ngày 7 mà duyệt sáng ngày 8 sẽ
   nằm trong số liệu ngày 8, còn chứng từ vẫn ghi đủ "nhập 07/10, duyệt 08/10". Nhờ vậy phiếu
   treo qua đêm không cần chặn chốt ngày và không bao giờ phải ghi lùi vào ngày đã chốt. */
async function duyetReceipt(env, user, id) {
  const day = vnDay();
  const r = await env.DB.prepare('SELECT * FROM receipts WHERE id = ?').bind(id).first();
  if (!r) throw new HttpError(404, 'Không tìm thấy phiếu');
  if (r.voided) throw bad('Phiếu đã bị hủy, không duyệt được');
  if (r.duyet_day) throw bad('Phiếu này đã được duyệt');
  const rows = (await env.DB.prepare('SELECT phi_id, khu_id, qty FROM receipts WHERE grp = ? AND voided = 0 AND duyet_day IS NULL')
    .bind(r.grp || '').all()).results;
  const list = r.grp && rows.length ? rows : [{ phi_id: r.phi_id, khu_id: r.khu_id, qty: r.qty }];
  // chuyển khu và điều chỉnh giảm đều RÚT thép khỏi một khu, nên cùng phải kiểm lại tồn lúc duyệt
  const rk = r.kind || 'nhap';
  await checkTransferStock(env, day, ['chuyen', 'dc', 'xuat'].includes(rk) ? list : [], { kind: rk });
  const ts = Date.now();
  await batchGuarded(env, guardStmt(env, IS_CLOSED, day), [
    r.grp
      ? env.DB.prepare('UPDATE receipts SET duyet_day = ?, duyet_ts = ?, duyet_by = ?, duyet_name = ? WHERE grp = ? AND voided = 0 AND duyet_day IS NULL')
        .bind(day, ts, user.id, user.name, r.grp)
      : env.DB.prepare('UPDATE receipts SET duyet_day = ?, duyet_ts = ?, duyet_by = ?, duyet_name = ? WHERE id = ?')
        .bind(day, ts, user.id, user.name, id),
    auditStmt(env, user, 'receipt_duyet', { id, grp: r.grp, kind: r.kind || 'nhap', day: r.day, duyet_day: day,
      lines: list.map((x) => ({ phi: x.phi_id, khu: x.khu_id, qty: x.qty })) }),
    bump(env),
  ], closedErr('Ngày hôm nay đã chốt, không duyệt được phiếu'));
  return json({ ok: true, duyet_day: day });
}

async function postReceipt(req, env, user) {
  const b = await readJson(req);
  const khuId = String(b.khu || '');
  const ctx = await receiptCtx(env, [khuId]);
  const lines = parseLines(b, ctx);
  const note = String(b.note || '').trim().slice(0, 200);
  return writeReceipt(env, user, ctx, lines.map((l) => ({ ...l, khu: khuId })), 'nhap', note, { khu: khuId, lines });
}

// Chuyển khu: một dòng âm ở khu đi, một dòng dương ở khu đến. Tổng toàn bãi không đổi nên lượng dùng không bị ảnh hưởng,
// nhưng số "dự kiến" của từng khu và cảnh báo khu biến động đúng hơn.
async function postTransfer(req, env, user) {
  const b = await readJson(req);
  const from = String(b.from || ''), to = String(b.to || '');
  if (from === to) throw bad('Khu đi và khu đến phải khác nhau');
  const ctx = await receiptCtx(env, [from, to]);
  const lines = parseLines(b, ctx);
  const note = String(b.note || '').trim().slice(0, 200);
  // Chuyển quá số thực có làm tồn khu nguồn âm, số "dự kiến" khi đếm sai theo, và che lỗi gõ ngược chiều
  const have = await stockOf(env, ctx.day, from, lines.map((l) => l.phi));
  for (const l of lines) {
    const h = have[l.phi] || 0;
    if (l.qty > h) {
      throw bad(`${ctx.khu[from].name} chỉ còn ${qtyWord(h, ctx.phiBy[l.phi])} ${l.phi}, không chuyển được ${qtyWord(l.qty, ctx.phiBy[l.phi])}`);
    }
  }
  const rows = [];
  lines.forEach((l) => { rows.push({ phi: l.phi, khu: from, qty: -l.qty }, { phi: l.phi, khu: to, qty: l.qty }); });
  return writeReceipt(env, user, ctx, rows, 'chuyen', note, { from, to, lines });
}

/* ========================= ĐIỀU CHỈNH TỒN =========================
   Sửa tồn MỘT ô (khu × phi) khi SỔ SAI, không phải khi thép thật đi hay về. Ba đường cũ đều
   không làm được việc này: phiếu nhập chỉ cộng và nói sai bản chất ("thép về"), chuyển khu giữ
   nguyên tổng bãi, còn "Đặt tồn về 0" thì cả bãi.

   Vì sao là một dòng RECEIPTS mà không phải sửa trực tiếp số đếm — đây là điểm cốt tử, không
   phải chuyện gọn code. Lượng dùng tính bằng `used = tồn chuẩn + inn − tổng đếm`:
   - Sửa trực tiếp số đếm (duyet_v, hoặc ghi counts như resetData làm): tổng đếm tụt mà inn không
     đổi, nên phần sửa biến thành MỘT CÚ "ĐÃ DÙNG" GIẢ. Nó vào phi_rate và kéo cảnh báo "dùng
     nhiều bất thường" sai suốt 28 ngày sau — đúng cái bẫy mà mục "Đặt tồn về 0" đã phải tránh
     bằng cách để dung = NULL.
   - Dòng receipts: inn giảm 50, khu đếm lại còn 50, tổng đếm giảm 50 → used = 0. Lượng dùng
     TRUNG TÍNH, đúng nghĩa "sửa sổ, không phải dùng thép". Và đẳng thức của báo cáo kỳ
     (Tồn đầu + Nhập − Dùng = Tồn cuối) vẫn khép kín, không phải sửa lại.
   Thêm một cái được không mất công: dòng 'dc' làm `moved` ở putCounts khác 0, nên khu BỊ BẮT
   đếm thật, không "giữ nguyên" được — hệ thống tự đòi xác minh thực địa sau mỗi lần điều chỉnh.

   Giá phải trả: 'dc' chảy vào `inn` nên nếu để nguyên thì báo cáo kỳ ghi một lần sửa sổ thành
   "nhập", và tính năng này thành chỗ GIẤU CHÊNH LỆCH. Vì vậy inn giữ nguyên tổng cho mọi phép
   tính tồn/dự kiến/lượng dùng, còn phần 'dc' được tách ra một cột riêng chỉ để HIỂN THỊ
   (xem dcOnly ở computeReview và cột dc của daily_summary). */
const DC_REASONS = {
  dem_sai:  'Đếm sai kỳ trước',
  ghi_nham: 'Ghi nhầm phiếu',
  hao_hut:  'Hao hụt / mất',
  khac:     'Lý do khác',
};
/* Điều chỉnh lớn phải gõ tay đúng chữ này mới lưu được, theo đúng kiểu WIPE_WORD. Một con số
   bốn chữ số gõ lệch một phím là cả tấn thép xuất hiện hoặc biến mất khỏi sổ mà không ai đụng
   vào bãi, nên chỗ này cố ý làm chậm lại.
   Ngưỡng phải đọc theo thang của bãi thép, đừng lấy theo mấy mốc cảnh báo ở đầu tệp: KHU_UP_KG
   và HIGH_KG chỉ để TÔ ĐẬM nên đặt rất thấp (100 kg, 500 kg), còn đây là một cái cổng chặn.
   Một bó D16 đã là 3,3 tấn, nên mốc 5 tấn làm gần như mọi lần sửa sổ bình thường (một hai bó)
   đều bị đòi gõ tay — cổng nào cũng kêu thì người dùng gõ cho xong, hết tác dụng. 20 tấn là
   khoảng sáu bó, dưới một xe thép: đủ lớn để đáng dừng lại, đủ cao để không kêu oan. */
const DC_BIG_KG = 20000;
const DC_WORD = 'DONG Y';

/* PHIẾU XUẤT — tự nguyện, không bắt buộc.
   Nguyên tắc "không ai phải nhập phiếu xuất" giữ nguyên: lượng dùng VẪN suy ra như cũ từ
   tồn cũ + nhập − đếm. Phiếu xuất không thay phép tính đó, nó chỉ GIẢI THÍCH được bao nhiêu
   phần trong đó. Ghi được bao nhiêu thì phần "không rõ" co lại bấy nhiêu, và chính phần không rõ
   mới là con số đáng đi hỏi. Không ghi gì thì app chạy y như trước.

   Vì sao vẫn đi qua duyệt như mọi phiếu: một phiếu xuất làm số dự kiến của khu tụt xuống, tức
   nó đổi cái thước mà người duyệt dùng để soi khu đó. Thứ gì đổi được thước thì phải có người
   duyệt, không thì tự ghi phiếu xuất là tự xoá dấu vết hụt thép. */
async function postXuat(req, env, user) {
  const b = await readJson(req);
  const khuId = String(b.khu || '');
  const ctx = await receiptCtx(env, [khuId]);
  const lines = parseLines(b, ctx);
  /* Nơi đến là BẮT BUỘC. Phiếu xuất mà không nói đi đâu thì chỉ là một lần trừ kho không lý do —
     đúng bằng cái mà con số "đã dùng" suy ra sẵn đã nói, tức không thêm được gì. Giá trị duy nhất
     của phiếu xuất nằm ở chỗ nó trả lời "thép đi đâu". */
  const noi = String(b.noi || '').trim().slice(0, 120);
  if (!noi) throw bad('Phải ghi rõ xuất cho ai hoặc cho công trình nào');
  const free = String(b.note || '').trim().slice(0, 160);
  const rows = lines.map((l) => ({ phi: l.phi, khu: khuId, qty: -l.qty }));
  /* Xuất quá số khu đang thực có thì tồn khu thành âm. Dùng CHUNG chốt chặn với chuyển khu và
     điều chỉnh: stockOf đã trừ sẵn mọi phiếu âm đang chờ duyệt nên hai phiếu xuất cùng rút một
     lô thép không lọt được cả hai. Kiểm lại lần nữa lúc duyệt, vì lúc lập còn đủ không có nghĩa
     lúc duyệt còn đủ. */
  await checkTransferStock(env, ctx.day, rows.map((r) => ({ phi_id: r.phi, khu_id: r.khu, qty: r.qty })), { kind: 'xuat', duyet: false });
  const note = 'Xuất cho ' + noi + (free ? ': ' + free : '');
  /* Ghi chú rời để khóa riêng (ghi) chứ không phải note: writeReceipt luôn ghi đè note bằng nội
     dung của phiếu, mà nội dung đó đã chứa sẵn nơi đến — để nguyên thì dòng nhật ký nhắc nơi
     đến hai lần trong cùng một câu. */
  return writeReceipt(env, user, ctx, rows, 'xuat', note, { khu: khuId, noi, ghi: free, lines });
}

async function postAdjust(req, env, user) {
  const b = await readJson(req);
  const khuId = String(b.khu || '');
  const dir = String(b.dir || '');
  if (dir !== 'tang' && dir !== 'giam') throw bad('Chưa chọn tăng hay giảm tồn');
  const reason = String(b.reason || '');
  if (!DC_REASONS[reason]) throw bad('Chưa chọn lý do điều chỉnh');
  const ctx = await receiptCtx(env, [khuId]);
  /* Số gửi lên luôn DƯƠNG, chiều do `dir` quyết định. Để người dùng tự gõ dấu trừ trên bàn phím
     số của điện thoại là mời lỗi: thiếu một dấu là điều chỉnh lộn ngược chiều, mà hai chiều lệch
     nhau gấp đôi lượng điều chỉnh. */
  const lines = parseLines(b, ctx);
  const sign = dir === 'tang' ? 1 : -1;
  const free = String(b.note || '').trim().slice(0, 160);
  // "Lý do khác" mà để trống thì dòng điều chỉnh không nói được gì — chính cái nó phải nói
  if (reason === 'khac' && !free) throw bad('Chọn "Lý do khác" thì phải ghi rõ lý do');
  const note = DC_REASONS[reason] + (free ? ': ' + free : '');

  const rows = lines.map((l) => ({ phi: l.phi, khu: khuId, qty: sign * l.qty }));
  /* Giảm quá số khu đang thực có thì tồn khu thành âm. Dùng CHUNG chốt chặn với chuyển khu:
     stockOf đã trừ sẵn mọi phiếu âm đang chờ duyệt, nên hai phiếu giảm cùng rút một lô thép
     không lọt được cả hai. Kiểm lại lần nữa lúc duyệt (xem duyetReceipt/reviewDuyet), vì lúc
     lập còn đủ không có nghĩa lúc duyệt còn đủ.
     Kiểm TRƯỚC cổng "gõ xác nhận" bên dưới, dù cổng đó rẻ hơn: phiếu không thể nào lưu được thì
     bắt người ta gõ DONG Y rồi mới nói "khu chỉ còn 40 cây" là bắt làm một việc vô ích, trong khi
     câu cần nói ngay chính là khu còn bao nhiêu. */
  await checkTransferStock(env, ctx.day, rows.map((r) => ({ phi_id: r.phi, khu_id: r.khu, qty: r.qty })), { kind: 'dc', duyet: false });

  const kg = lines.reduce((a, l) => a + l.qty * ctx.phiBy[l.phi].kg_per_cay, 0);
  if (kg > DC_BIG_KG && String(b.confirm || '').trim().toUpperCase() !== DC_WORD) {
    throw new HttpError(409, `Điều chỉnh ${Math.round(kg / 1000 * 10) / 10} tấn là rất lớn. Hãy gõ đúng "${DC_WORD}" để xác nhận.`, 'need_confirm');
  }
  return writeReceipt(env, user, ctx, rows, 'dc', note, { khu: khuId, dir, reason, note: free, lines });
}

/* Hủy theo phiếu: hủy cả các dòng cùng phiếu (nhiều phi, hoặc cả cặp chuyển khu).
   Cùng một đường dùng cho hai việc, phân biệt bằng nhật ký:
   - TỪ CHỐI phiếu đang chờ duyệt (admin). Phiếu chưa vào tồn nên không có gì phải lùi,
     và người lập cũng rút lại phiếu của mình bất cứ lúc nào trước khi được duyệt.
   - HỦY phiếu đã duyệt. Phiếu đã nằm trong tồn nên chỉ hủy được khi NGÀY DUYỆT chưa chốt
     (không phải ngày nhập: phiếu nhập ngày 7 duyệt ngày 8 thì nó là số liệu của ngày 8). */
async function voidReceipt(env, user, id) {
  const r = await env.DB.prepare('SELECT * FROM receipts WHERE id = ? AND voided = 0').bind(id).first();
  if (!r) throw new HttpError(404, 'Không tìm thấy phiếu');
  const pending = !r.duyet_day;
  const dayOf = pending ? vnDay() : r.duyet_day;
  if (!pending) {
    const closed = await env.DB.prepare('SELECT 1 x FROM day_close WHERE day = ?').bind(r.duyet_day).first();
    if (closed) throw new HttpError(409, 'Ngày duyệt phiếu đã chốt, không hủy được', 'closed');
  }
  /* Phiếu chờ duyệt: người lập rút lại được không giới hạn thời gian, vì chưa ảnh hưởng số liệu.
     Phiếu đã duyệt: người lập chỉ hoàn tác trong 10 phút kể từ LÚC DUYỆT (lúc nó vào tồn),
     sau đó phải nhờ admin. Mốc trước đây là lúc nhập, nay phiếu có thể được duyệt sau hàng giờ
     nên lấy mốc nhập sẽ làm người lập không bao giờ kịp hoàn tác. */
  if (user.role !== 'admin') {
    if (r.user_id !== user.id) throw new HttpError(403, 'Chỉ người lập phiếu hoặc admin mới hủy được');
    if (!pending && Date.now() - r.duyet_ts > 10 * 60e3) {
      throw new HttpError(403, 'Phiếu đã duyệt quá 10 phút, nhờ admin hủy');
    }
  }
  const rows = r.grp
    ? (await env.DB.prepare('SELECT phi_id, khu_id, qty FROM receipts WHERE grp = ? AND voided = 0').bind(r.grp).all()).results
    : [r];
  await batchGuarded(env, guardStmt(env, IS_CLOSED, dayOf), [
    r.grp
      ? env.DB.prepare('UPDATE receipts SET voided = 1, voided_ts = ? WHERE grp = ? AND voided = 0').bind(Date.now(), r.grp)
      : env.DB.prepare('UPDATE receipts SET voided = 1, voided_ts = ? WHERE id = ?').bind(Date.now(), id),
    auditStmt(env, user, pending ? 'receipt_reject' : 'receipt_void', { id, kind: r.kind || 'nhap',
      lines: rows.map((x) => ({ phi: x.phi_id, khu: x.khu_id, qty: x.qty })) }),
    bump(env),
  ], closedErr(pending ? 'Ngày hôm nay đã chốt' : 'Ngày duyệt phiếu đã chốt, không hủy được'));
  return json({ ok: true, pending });
}

/* ========================= DUYỆT / CHỐT NGÀY =========================
   Một quy tắc duy nhất: chưa duyệt thì không vào tồn. Màn Duyệt vì thế không còn là màn
   "cảnh báo" mà là màn LÀM VIỆC: với từng khu nó bày số dự kiến đặt cạnh số khu báo và phần
   lệch, rồi để người duyệt quyết định. Lệch to hay nhỏ chỉ đổi màu chữ, KHÔNG đổi việc khu có
   duyệt được hay không — mọi khu đã báo đều duyệt được, riêng từng khu, không liên quan khu
   khác. Nhờ vậy biến mất cả ba cơ chế cũ: dấu số liệu (sig), hai loại cảnh báo khu_up/khu_down,
   và phép tính "nhập muộn" dựa trên giờ nhập/giờ hủy phiếu. */

// tên người duyệt gần nhất của một khu (lấy ở ô có duyet_ts lớn nhất)
function lastDuyetBy(subRows, khuId) {
  let best = null;
  for (const r of subRows) {
    if (r.khu_id !== khuId || !r.duyet_at) continue;
    if (!best || r.duyet_at > best.duyet_at) best = r;
  }
  return best ? best.duyet_uname : null;
}

async function computeReview(env, day) {
  const db = env.DB;
  const lc = await db.prepare('SELECT day FROM day_close WHERE day < ? ORDER BY day DESC LIMIT 1').bind(day).first();
  const last = lc ? lc.day : '';
  const [phiR, khuR, repR, effR, subR, baseR, rcR, mvTsR, pendR, usedR, rateR, closedR, revR] = await db.batch([
    db.prepare('SELECT id, kg_per_cay, active FROM phi ORDER BY sort'),
    db.prepare('SELECT id, name, active FROM khu ORDER BY sort, id'),
    /* Mọi lần báo kể từ lần chốt trước, không chỉ của hôm nay. Bản cũ chỉ đọc khu_report của hôm
       nay nên gặp ngày quên chốt là mù: khu báo sai ngày 2, ngày 3 không báo thì cảnh báo lệch
       biến mất sạch, trong khi số sai của ngày 2 vẫn đang là tồn và sẽ thành tồn chuẩn lúc chốt. */
    db.prepare(`SELECT r.day, r.khu_id, r.user_id, ${UNAME}, r.ts, r.conflict, r.resolved, r.recount
                FROM khu_report r LEFT JOIN users u ON u.id = r.user_id
                WHERE r.day > ? AND r.day <= ? ORDER BY r.day`).bind(last, day),
    // số ĐÃ DUYỆT đang được dùng làm tồn (có thể là của một ngày trước đó)
    db.prepare(EFF_SELECT).bind(last, day),
    /* Lần báo MỚI NHẤT của từng ô, kèm trạng thái duyệt. Đây là số người duyệt đang phải quyết,
       khác số ở effR khi lần báo mới chưa được duyệt. */
    db.prepare(`SELECT c.khu_id, c.phi_id, c.v, c.kind, c.ts, c.day, c.duyet_v, c.duyet_ts, c.duyet_at, ${DUYET_NAME}, ${UNAME}
                FROM counts c LEFT JOIN users u ON u.id = c.user_id ${DUYET_JOIN}
                WHERE c.day > ?1 AND c.day <= ?2
                  AND c.day = (SELECT MAX(c2.day) FROM counts c2
                               WHERE c2.khu_id = c.khu_id AND c2.phi_id = c.phi_id
                                 AND c2.day > ?1 AND c2.day <= ?2)`).bind(last, day),
    db.prepare('SELECT khu_id, phi_id, v FROM baseline WHERE day = ?').bind(last),
    /* Chỉ phiếu ĐÃ DUYỆT và chưa bị hủy mới vào dự kiến, tính theo NGÀY DUYỆT.
       Lấy kèm kind để tách được phần ĐIỀU CHỈNH ra khỏi phần NHẬP THẬT. Tách chỉ để hiển thị:
       mọi phép tính tồn, dự kiến và lượng dùng vẫn dùng TỔNG (xem inn bên dưới), vì điều chỉnh
       cũng là thép vào/ra sổ thật sự. Nhưng cột "Nhập" của báo cáo kỳ thì không được gộp, nếu
       không thì một lần sửa sổ hiện ra thành "thép về" — và tính năng điều chỉnh thành chỗ giấu
       chênh lệch thay vì chỗ phơi nó ra. */
    db.prepare(`SELECT phi_id, khu_id, kind, SUM(qty) q FROM receipts
                WHERE voided = 0 AND duyet_day IS NOT NULL AND duyet_day > ? AND duyet_day <= ?
                GROUP BY phi_id, khu_id, kind`).bind(last, day),
    /* Mốc "lần gần nhất dự kiến của khu bị phiếu làm đổi". Phải gồm CẢ HAI chiều:
       - duyet_ts: lúc một phiếu được duyệt (thép cộng vào dự kiến)
       - voided_ts: lúc một phiếu ĐÃ DUYỆT bị hủy (thép rút khỏi dự kiến)
       Thiếu chiều thứ hai thì hủy phiếu lại LÀM GIẢM mốc này nên cảnh báo im lặng, trong khi
       khu vẫn mang nhãn "Đã duyệt" mà số đã duyệt không còn khớp dự kiến — đúng cái bản 1.2 bắt
       được bằng exception 'late' với q < 0. Chỉ xét phiếu từng được duyệt: phiếu lập rồi từ chối
       luôn chưa bao giờ vào tồn nên không làm dự kiến đổi. */
    db.prepare(`SELECT khu_id, MAX(duyet_ts) a, MAX(CASE WHEN voided = 1 THEN voided_ts END) b
                FROM receipts
                WHERE duyet_day IS NOT NULL AND duyet_day > ? AND duyet_day <= ?
                GROUP BY khu_id`).bind(last, day),
    /* Phiếu đang chờ duyệt, của BẤT KỲ ngày nào: phiếu lập hôm qua chưa ai duyệt thì hôm nay vẫn
       phải nằm trên màn Duyệt, không được rơi khỏi màn hình chỉ vì sang ngày mới. */
    db.prepare(`SELECT r.id, r.grp, r.day, r.phi_id, r.khu_id, r.qty, r.kind, r.note, r.ts, ${UNAME}
                FROM receipts r LEFT JOIN users u ON u.id = r.user_id
                WHERE r.voided = 0 AND r.duyet_day IS NULL ORDER BY r.id`),
    db.prepare('SELECT used_json, span FROM day_close ORDER BY day DESC LIMIT 7'),
    db.prepare('SELECT phi_id, per_day, days FROM phi_rate'),
    db.prepare('SELECT 1 x FROM day_close WHERE day = ?').bind(day),
    db.prepare("SELECT value FROM meta WHERE key = 'rev'"),
  ]);

  const eff = {}, sub = {}, base = {}, inn = {}, dcc = {}, xc = {}, rcTs = {};
  effR.results.forEach((r) => (eff[r.khu_id + '|' + r.phi_id] = r.v));
  subR.results.forEach((r) => (sub[r.khu_id + '|' + r.phi_id] = r));
  baseR.results.forEach((r) => (base[r.khu_id + '|' + r.phi_id] = r.v));
  /* PHẢI CỘNG DỒN, không gán: từ khi câu truy vấn gộp thêm kind, một ô (khu × phi) có thể trả về
     nhiều dòng — nhập thật một dòng, điều chỉnh một dòng. Gán như trước là dòng sau đè dòng
     trước, tức mất hẳn phần nhập hoặc phần điều chỉnh khỏi dự kiến và khỏi lượng dùng.
     inn = TỔNG mọi loại (dùng cho tồn và dự kiến). dcc = riêng điều chỉnh, xc = riêng xuất. */
  rcR.results.forEach((r) => {
    const key = r.khu_id + '|' + r.phi_id;
    inn[key] = (inn[key] || 0) + r.q;
    if (r.kind === 'dc') dcc[key] = (dcc[key] || 0) + r.q;
    if (r.kind === 'xuat') xc[key] = (xc[key] || 0) + r.q;
  });
  mvTsR.results.forEach((r) => (rcTs[r.khu_id] = Math.max(r.a || 0, r.b || 0)));
  const khuAct = khuR.results.filter((k) => k.active);
  const hasBase = !!last;
  // quên chốt N ngày thì lượng dùng là của cả N ngày: chia đều khi so với mức bình thường
  const span = hasBase ? Math.max(1, daysBetween(last, day)) : 1;

  // lần báo gần nhất của mỗi khu (có thể là của ngày trước, nếu quên chốt)
  const reps = {};
  repR.results.forEach((r) => { if (!reps[r.khu_id] || r.day > reps[r.khu_id].day) reps[r.khu_id] = r; });

  // lượng dùng mỗi ngày của 7 lần chốt gần nhất, dùng để biết "ngày dùng nhiều nhất" của từng phi
  const hist = {};
  usedR.results.forEach((r) => {
    try {
      const o = JSON.parse(r.used_json || '{}');
      for (const p in o) (hist[p] = hist[p] || []).push(o[p] / Math.max(1, r.span || 1));
    } catch (e) { /* bỏ qua */ }
  });
  /* "mức dùng bình thường" chỉ còn MỘT định nghĩa: phi_rate (trung bình 28 ngày, tính cả ngày
     không dùng), đúng con số mà màn Tồn bãi dùng để nói "còn đủ dùng bao nhiêu ngày". */
  const rate = Object.fromEntries(rateR.results.map((r) => [r.phi_id, r]));

  const rows = phiR.results.map((p) => {
    const phiOff = p.active === 0;
    let old = 0, innT = 0, dcT = 0, xT = 0, cn = 0, topKhu = null, topNet = 0;
    for (const k of khuR.results) {
      const key = k.id + '|' + p.id;
      const b = base[key] || 0;
      const i = inn[key] || 0;
      const e = eff[key] !== undefined ? eff[key] : b;
      old += b; innT += i; dcT += dcc[key] || 0; xT += xc[key] || 0; cn += e;
      const net = e - (b + i);
      if (Math.abs(net) > Math.abs(topNet)) { topNet = net; topKhu = k.id; }
    }
    /* Lượng dùng tính trên innT — TỔNG, gồm cả điều chỉnh. Đây là chỗ cả thiết kế đứng hoặc đổ:
       trừ phần điều chỉnh ra khỏi vế này thì sửa sổ giảm 50 cây lập tức thành 50 cây "đã dùng",
       nó vào phi_rate và kéo cảnh báo "dùng nhiều bất thường" sai suốt 28 ngày — đúng cái bẫy mà
       mục "Đặt tồn về 0" phải tránh bằng cách để dung = NULL. Gộp vào thì used về 0 sau khi khu
       đếm lại, tức "sửa sổ không phải dùng thép", và đẳng thức báo cáo kỳ vẫn khép kín. */
    /* Phần XUẤT thì ngược hẳn với điều chỉnh: phải TRỪ nó ra khỏi vế này. Xuất là thép ra khỏi
       bãi, tức ĐÃ DÙNG thật — để nguyên trong innT thì nó tự triệt tiêu với phần khu đếm hụt, và
       "đã dùng" tụt xuống chỉ còn phần KHÔNG có phiếu. Hậu quả không nằm ở con số hiển thị mà ở
       phi_rate: mức dùng trung bình thành thấp hơn thực tế, rồi "còn đủ dùng bao nhiêu ngày" nói
       dư ra — càng ghi phiếu xuất đầy đủ thì dự báo càng sai, đúng chiều ngược với ý định.
       Giữ used = TỔNG lượng dùng, rồi tách riêng phần có phiếu để đối chiếu. */
    const used = hasBase ? old + (innT - xT) - cn : null;
    const perDay = used === null ? null : used / span;
    const arr = hist[p.id] || [];
    const peak = arr.length ? Math.max(...arr) : 0;
    const rt = rate[p.id] ? rate[p.id].per_day : null;
    const rtDays = rate[p.id] ? rate[p.id].days : 0;
    const kgOf = (x) => x * p.kg_per_cay;
    const neg = used !== null && kgOf(used) < -NEG_KG;
    /* Phải thỏa cả bốn: đủ ngày dữ liệu để có "mức bình thường", gấp 3 lần mức trung bình,
       hơn 1,5 lần ngày dùng nhiều nhất, và đủ lớn tính theo kg. */
    const high = perDay !== null && rt > 0 && rtDays >= MIN_RATE_DAYS
      && perDay > RATE_K * rt && perDay > PEAK_K * peak && kgOf(used) > HIGH_KG;
    return {
      // inn = tổng (dùng cho mọi phép tính), dc = riêng phần điều chỉnh, nhap = inn − dc (chỉ hiển thị)
      // xuat: phần đã dùng CÓ PHIẾU (số dương); used − xuat là phần không rõ
      phi: p.id, kg: p.kg_per_cay, old, inn: innT, dc: dcT, xuat: -xT, cnt: cn, used,
      avg: rt === null ? null : Math.round(rt * 10) / 10,
      peak: Math.round(peak * 10) / 10,
      rateDays: rtDays,
      neg, high, topKhu, topNet, off: phiOff,
    };
  })
    // phi admin đã tắt và không còn số liệu nào thì không bày ra màn Duyệt cho rối
    .filter((r) => !r.off || r.old || r.inn || r.cnt);

  // phiếu chờ duyệt, gom theo phiếu (grp) để duyệt/từ chối cả phiếu như lúc nhập
  const pendBy = {}, pendOrder = [];
  pendR.results.forEach((r) => {
    const g = r.grp || 'id' + r.id;
    if (!pendBy[g]) {
      pendBy[g] = { key: g, grp: r.grp, id: r.id, day: r.day, ts: r.ts, uname: r.uname, kind: r.kind || 'nhap', note: r.note, lines: [] };
      pendOrder.push(g);
    }
    pendBy[g].lines.push({ phi: r.phi_id, khu: r.khu_id, qty: r.qty });
  });
  const phieu = pendOrder.map((g) => pendBy[g]);
  /* Một phiếu nhiều phi có NHIỀU dòng cùng một khu, nên phải lọc trùng: không lọc thì thẻ khu
     báo "còn 3 phiếu chờ duyệt" trong khi thực tế là một phiếu ba phi, và con số "việc cần xử lý"
     cũng phồng theo. Phiếu chuyển khu nằm ở cả hai khu là đúng — nó là một chứng từ của hai khu. */
  const pendKhu = {};
  phieu.forEach((v) => {
    const seenK = new Set();
    v.lines.forEach((l) => {
      if (seenK.has(l.khu)) return;
      seenK.add(l.khu);
      (pendKhu[l.khu] = pendKhu[l.khu] || []).push(v.key);
    });
  });

  /* MỘT thẻ cho MỖI khu đang dùng, nội dung như nhau dù lệch hay không — đây là chỗ thay cho
     khu_up/khu_down. Chỉ bày phi có số để nói (dự kiến khác 0, hoặc khu báo khác 0), nếu không
     mỗi khu là 13 dòng mà 10 dòng toàn số 0. */
  const kgBy = Object.fromEntries(phiR.results.map((p) => [p.id, p.kg_per_cay]));
  const khus = khuAct.map((k) => {
    const r = reps[k.id];
    const items = [];
    let waiting = 0, blank = 0, lastDuyet = 0;
    for (const p of phiR.results) {
      const key = k.id + '|' + p.id;
      const sr = sub[key];
      const ref = base[key] === undefined ? 0 : base[key];
      const mv = inn[key] || 0;
      const exp = ref + mv;
      // chưa báo lần nào kể từ lần chốt trước: dự kiến giữ nguyên, không có gì để duyệt
      if (!sr) {
        if (exp !== 0) items.push({ phi: p.id, ref, mv, exp, cnt: null, d: null, kind: null, duyet: null });
        continue;
      }
      const ok = sr.duyet_ts != null && sr.duyet_ts === sr.ts;
      if (!ok) waiting++;
      if (sr.duyet_at) lastDuyet = Math.max(lastDuyet, sr.duyet_at);
      const d = sr.v - exp;
      const kg = Math.abs(d) * kgBy[p.id];
      /* Ngưỡng CHỈ để tô đậm. Đếm dư thì thép không tự sinh ra nên nhạy hơn; hụt thì có thể là
         xuất dùng thật nên phải vừa lớn theo kg vừa quá nửa dự kiến mới tô. */
      const big = d > 0 ? kg > KHU_UP_KG : d < 0 && kg > KHU_DOWN_KG && -d > Math.max(0, exp) * KHU_DOWN_PCT;
      /* Để trống trong khi phi đang có thép: lỗi dễ xảy ra nhất của quy tắc "không điền = 0",
         nên nêu riêng cho người duyệt thấy, không trộn vào đám lệch. Phân biệt được nhờ kind:
         'zero' là để trống, còn bấm "Hết (0)" ghi 'dem' với v = 0. */
      const left = sr.kind === 'zero' && exp > 0;
      if (left) blank++;
      if (exp !== 0 || sr.v !== 0) {
        items.push({ phi: p.id, ref, mv, exp, cnt: sr.v, d, kind: sr.kind, big: !!big, blank: left, duyet: ok });
      }
    }
    return {
      khu: k.id, name: k.name, items, waiting, blank,
      rep: r ? { uname: r.uname, ts: r.ts, day: r.day, conflict: r.conflict, resolved: r.resolved, recount: r.recount } : null,
      /* Phiếu của khu được duyệt SAU số của khu: số đếm không gồm phần thép đó nên dự kiến vừa
         đổi, số đã duyệt của khu không còn khớp. Thay cho cảnh báo 'late' cũ, và quan trọng là
         GỠ ĐƯỢC: admin duyệt lại khu là lastDuyet nhảy lên, cảnh báo tự hết. Bản cũ không có
         đường nào xoá nó, ngày đó bắt buộc chốt kèm ghi chú. */
      recheck: !!(lastDuyet && rcTs[k.id] && rcTs[k.id] > lastDuyet),
      phieu: pendKhu[k.id] || [],
      duyet: r && !waiting && lastDuyet ? { by: lastDuyetBy(subR.results, k.id), ts: lastDuyet } : null,
    };
  });

  const exceptions = [];
  for (const k of khus) {
    /* "Chưa báo" chỉ tính khu CÓ GÌ ĐỂ ĐẾM: còn tồn chuẩn, hoặc vừa có phiếu đã duyệt, hoặc đã
       từng báo (items rỗng nghĩa là mọi phi đều dự kiến 0 và chưa báo gì). Khu trống trơn thì
       không ai phải ra đó đếm 13 số 0, và nhất là không được chặn chốt ngày vì nó. Bản cũ dựa
       vào khu_phi để biết điều này; nay mọi khu đều có đủ phi nên phải dựa vào SỐ THỰC. */
    if (!k.rep) {
      if (k.items.length) exceptions.push({ type: 'khu_missing', khu: k.khu, name: k.name });
      continue;
    }
    if (k.waiting) exceptions.push({ type: 'khu_pending', khu: k.khu, name: k.name, n: k.waiting, blank: k.blank });
    if (k.rep.conflict && !k.rep.resolved) exceptions.push({ type: 'conflict', khu: k.khu, name: k.name });
    if (k.rep.recount) exceptions.push({ type: 'recount', khu: k.khu, name: k.name });
    if (k.recheck) exceptions.push({ type: 'recheck', khu: k.khu, name: k.name });
  }
  phieu.forEach((v) => exceptions.push({ type: 'receipt_pending', key: v.key, id: v.id, kind: v.kind, day: v.day }));
  rows.forEach((r) => {
    if (r.neg) exceptions.push({ type: 'phi', phi: r.phi, reason: 'neg' });
    else if (r.high) exceptions.push({ type: 'phi', phi: r.phi, reason: 'high' });
  });

  const rev = revR.results[0] ? revR.results[0].value : 0;
  /* pending = số việc admin còn phải ra tay, đếm theo LẦN BẤM chứ không theo số phần tử trong
     mảng: một khu vừa chờ duyệt vừa đang lệch vẫn chỉ là một nút "Duyệt khu". Con số này phải
     đối chiếu được với những gì admin đang thấy, nếu không bấm một lần mà nó tụt ba đơn vị thì
     không ai hiểu còn lại là gì. */
  const pending = new Set(exceptions.map((e) => {
    if (e.type === 'receipt_pending') return 'phieu|' + e.key;
    /* "Chờ duyệt" và "cần xem lại" của cùng một khu dùng CHUNG một nút Duyệt khu, nên là một
       việc. Xung đột hai người báo thì khác: admin phải chọn số trước, rồi mới duyệt được. */
    if (e.type === 'khu_pending' || e.type === 'recheck') return 'khu|' + e.khu;
    return e.type + '|' + (e.khu || e.phi);
  })).size;
  return {
    day, last: last || null, span, rev, closed: closedR.results.length > 0,
    rows, khus, phieu, exceptions, pending,
    reports: repR.results.filter((r) => r.day === day), khu: khuR.results,
  };
}

async function closeDay(req, env, user) {
  const b = await readJson(req);
  const rv = await computeReview(env, vnDay());
  if (rv.closed) throw new HttpError(409, 'Ngày hôm nay đã được chốt', 'closed');
  const note = String(b.note || '').trim().slice(0, 500);
  if (rv.pending && !note) throw bad('Còn ' + rv.pending + ' việc chưa xử lý, hãy duyệt hoặc ghi chú lý do trước khi chốt');
  await doClose(env, user, rv, note, 'close_day');
  return json({ ok: true });
}

async function doClose(env, user, rv, note, action) {
  const day = rv.day;
  const used = {};
  rv.rows.forEach((r) => { if (r.used !== null) used[r.phi] = r.used; });
  // số liệu đổi sau lúc tính duyệt (có người vừa gửi số/phiếu) hoặc người khác vừa chốt: không chốt bằng số cũ
  const guard = guardStmt(env, "(SELECT value FROM meta WHERE key = 'rev') <> ?1 OR EXISTS (SELECT 1 FROM day_close WHERE day = ?2)", rv.rev, day);
  await batchGuarded(env, guard, [
    env.DB.prepare('INSERT INTO day_close (day, closed_by, ts, note, used_json, exc_json, span) VALUES (?,?,?,?,?,?,?)')
      .bind(day, user.id, Date.now(), note, JSON.stringify(used), JSON.stringify(rv.exceptions), rv.span),
    // bảng tổng hợp theo ngày × phi: báo cáo theo kỳ chỉ đọc 12 dòng/ngày, không phải tính lại
    env.DB.prepare(
      /* nhap = inn − dc: cột này mang nghĩa THÉP THẬT VỀ, nên phải trừ phần điều chỉnh ra.
         dung thì vẫn tính từ TỔNG (rv.rows[].used đã dùng inn đầy đủ), nhờ vậy đẳng thức của
         báo cáo kỳ là `Tồn đầu + Nhập + Điều chỉnh − Dùng = Tồn cuối` và vẫn khép kín. */
      `INSERT OR REPLACE INTO daily_summary (day, phi_id, ton, nhap, dung, span, dc, xuat)
       SELECT ?1, ${J('phi')}, ${J('cnt')}, ${J('inn')} - ${J('dc')} + ${J('xuat')}, ${J('used')}, ?2, ${J('dc')}, ${J('xuat')} FROM json_each(?3) j`
    ).bind(day, rv.span, JSON.stringify(rv.rows.map((r) => ({ phi: r.phi, cnt: r.cnt, inn: r.inn, dc: r.dc || 0, xuat: r.xuat || 0, used: r.used })))),
    env.DB.prepare(RATE_SQL).bind(day),
    /* Tồn chuẩn chốt theo số ĐÃ DUYỆT (EFF_JOIN đã lọc duyet_v IS NOT NULL): báo cáo chưa duyệt
       không bao giờ thành tồn chuẩn. Liệt kê theo khu x phi chứ không theo khu_phi nữa, nên tồn
       chuẩn thành ĐẶC — mọi ô đều có dòng. Nhờ vậy ngày sau không còn trường hợp "khu này hôm
       qua không có phi đó" phải đoán xem dự kiến là 0 hay là không biết. */
    /* Liệt kê các ô ĐANG DÙNG, CỘNG mọi ô còn số liệu khác 0 dù khu hoặc phi đã bị ẩn.
       Phần UNION không phải cho đẹp: hệ thống từ chối ẩn khu/phi còn thép, nhưng dữ liệu cũ bị
       ẩn bằng tay trong DB thì vẫn còn (mục 9 của bộ test dựng đúng cảnh đó). Thiếu nó thì một
       lần chốt là xoá sạch số thép ở những ô ấy khỏi tồn chuẩn, im lặng, không cảnh báo gì —
       và ngày sau mọi phép tính đều lệch mà không ai biết tại sao. */
    env.DB.prepare(
      `INSERT OR REPLACE INTO baseline (day, khu_id, phi_id, v)
       SELECT ?1, kx.khu_id, kx.phi_id, COALESCE(c.duyet_v, b.v, 0)
       FROM (${KHU_X_PHI}
             UNION SELECT khu_id, phi_id FROM baseline WHERE day = ?2 AND v <> 0
             UNION SELECT khu_id, phi_id FROM counts
                   WHERE duyet_v IS NOT NULL AND duyet_v <> 0 AND day > ?2 AND day <= ?1) kx
       ${EFF_JOIN(2, 1)}
       LEFT JOIN baseline b ON b.day = ?2 AND b.khu_id = kx.khu_id AND b.phi_id = kx.phi_id`
    ).bind(day, rv.last || ''),
    auditStmt(env, user, action, { day, exceptions: rv.exceptions.length, acked: rv.exceptions.length - rv.pending, note }),
    bump(env),
  ], new HttpError(409, 'Vừa có số liệu mới hoặc ngày đã được chốt. Hãy tải lại màn Duyệt rồi chốt.', 'changed'));
}

/* MỞ LẠI NGÀY ĐÃ CHỐT — chỉ LẦN CHỐT GẦN NHẤT, không phải ngày bất kỳ.
   Vì sao chỉ lần gần nhất: tồn chuẩn của một ngày là điểm xuất phát của MỌI ngày sau nó. Mở lại
   một ngày ở giữa là mọi lần chốt sau đó vẫn giữ con số tính từ mốc cũ, và từ đó trở đi không có
   ngày nào còn khớp với ngày trước nó — sai mà không chỗ nào báo. Mở lần chốt gần nhất thì sau nó
   chưa có gì phái sinh, nên app chỉ quay về đúng trạng thái "chưa chốt" mà nó vốn đã biết xử lý
   (kể cả trường hợp quên chốt nhiều ngày: span > 1).
   Sổ đã chốt hôm qua mà hôm nay phát hiện sai THÌ KHÔNG NÊN mở lại: cách đúng là lập phiếu
   Điều chỉnh tồn, sửa số hiện tại và để lại dấu vết. Mở lại dành cho trường hợp vừa chốt nhầm. */
async function reopenDay(req, env, user) {
  const b = await readJson(req);
  const today = vnDay();
  const day = String(b.day || today);
  if (!DAY_RE.test(day) || day > today) throw bad('Ngày không hợp lệ');
  const note = String(b.note || '').trim().slice(0, 500);
  if (!note) throw bad('Cần ghi lý do mở lại ngày');
  /* Mở lại NGÀY CŨ thì chỉ admin đầu tiên, giống như đặt lại số liệu: nó dời tồn chuẩn mà cả bãi
     đang dựa vào, và làm mất bảng tổng hợp của ngày đó. Chốt nhầm trong hôm nay thì admin nào
     cũng sửa được, vì ngày hôm nay chưa là mốc của ngày nào cả. */
  if (day !== today) {
    const first = await firstAdminId(env);
    if (user.id !== first) {
      throw new HttpError(403, 'Chỉ admin đầu tiên (người thiết lập hệ thống) mới mở lại ngày đã qua');
    }
  }
  const c = await env.DB.prepare('SELECT kind, undo_json FROM day_close WHERE day = ?').bind(day).first();
  if (!c) throw bad(day === today ? 'Hôm nay chưa chốt, không cần mở lại' : 'Ngày này chưa chốt, không có gì để mở lại');
  const maxR = await env.DB.prepare('SELECT MAX(day) d FROM day_close').first();
  if (maxR && maxR.d && maxR.d !== day) {
    throw bad('Chỉ mở lại được lần chốt gần nhất (ngày ' + fmtDay(maxR.d) + '). Ngày cũ hơn thì dùng phiếu Điều chỉnh tồn.');
  }
  const laReset = c.kind === 'reset';
  let snap = { counts: [], reports: [] };
  if (laReset && c.undo_json) { try { snap = JSON.parse(c.undo_json); } catch (e) { /* ảnh chụp lỗi: coi như rỗng */ } }
  /* Mốc kiểm kê lại đã GHI SỐ 0 vào số đếm của mọi ô, nên mở lại ngày phải bỏ luôn các số đó;
     chỉ bỏ mốc chốt thì tồn vẫn bằng 0 và lần đặt lại thành không hoàn tác được.
     Bỏ cả khu_report của hôm nay: số đếm đã mất thì để lại dấu "khu đã báo" chỉ sinh ra một khu
     mang nhãn đã báo mà không có số nào. Các khu báo trước lúc đặt lại sẽ phải báo lại — số cũ
     của họ đã bị mốc kiểm kê ghi đè lên, chỉ còn trong lịch sử đếm (bảng chỉ-ghi-thêm). */
  const stmts = [
    env.DB.prepare('DELETE FROM day_close WHERE day = ?').bind(day),
    env.DB.prepare('DELETE FROM baseline WHERE day = ?').bind(day),
    env.DB.prepare('DELETE FROM daily_summary WHERE day = ?').bind(day),
  ];
  if (laReset) {
    // bỏ các số 0 mà mốc kiểm kê ghi, rồi DỰNG LẠI đúng những gì có trước đó từ ảnh chụp
    stmts.push(
      env.DB.prepare('DELETE FROM counts WHERE day = ?').bind(day),
      env.DB.prepare('DELETE FROM khu_report WHERE day = ?').bind(day),
      env.DB.prepare('UPDATE khu_phi SET keep_streak = 0')
    );
    if (snap.counts && snap.counts.length) {
      stmts.push(env.DB.prepare(
        `INSERT INTO counts (day, khu_id, phi_id, v, kind, bo, le, user_id, ts, duyet_v, duyet_kind, duyet_ts, duyet_at, duyet_by, duyet_name)
         SELECT ?1, ${J('khu_id')}, ${J('phi_id')}, ${J('v')}, ${J('kind')}, ${J('bo')}, ${J('le')}, ${J('user_id')}, ${J('ts')},
                ${J('duyet_v')}, ${J('duyet_kind')}, ${J('duyet_ts')}, ${J('duyet_at')}, ${J('duyet_by')}, ${J('duyet_name')}
         FROM json_each(?2) j`
      ).bind(day, JSON.stringify(snap.counts)));
    }
    if (snap.reports && snap.reports.length) {
      stmts.push(env.DB.prepare(
        `INSERT INTO khu_report (day, khu_id, user_id, ts, conflict, resolved, recount)
         SELECT ?1, ${J('khu_id')}, ${J('user_id')}, ${J('ts')}, ${J('conflict')}, ${J('resolved')}, ${J('recount')}
         FROM json_each(?2) j`
      ).bind(day, JSON.stringify(snap.reports)));
    }
  }
  stmts.push(
    env.DB.prepare(RATE_SQL).bind(day),
    auditStmt(env, user, 'reopen_day', { day, note, reset: laReset || undefined, cu: day !== today || undefined }),
    bump(env)
  );
  await env.DB.batch(stmts);
  return json({ ok: true, reset: laReset, day });
}

/* Duyệt báo cáo đếm của MỘT khu (hoặc all = mọi khu đang chờ). Duyệt là chuyển số của lần báo
   mới nhất sang cột duyet_v — kể từ lúc đó, và chỉ từ lúc đó, nó mới là tồn.

   Ba điểm đáng nói:
   - Duyệt theo khu, độc lập hoàn toàn: câu UPDATE chỉ đụng đúng các ô của khu đó.
   - Duyệt cả những ô của NGÀY TRƯỚC còn treo (day > lần chốt trước), không chỉ ô của hôm nay.
     Quên chốt là chuyện thường, báo cáo treo qua đêm không được biến mất khỏi tầm tay admin.
   - Duyệt luôn phiếu đang chờ của khu đó trong CÙNG một lần ghi. Nếu để admin duyệt số trước rồi
     duyệt phiếu sau, giữa hai cái đó số dự kiến của khu đã đổi mà số vừa duyệt thì không —
     đúng cái tình huống mà cảnh báo 'recheck' phải bắt. Gộp lại thì không có khe hở nào.

   Không còn tham số sig: duyệt gắn vào đúng lần báo qua mốc ts, nên khu báo lại trong lúc admin
   đang xem thì ô đó tự thành chờ duyệt lại, không cần đối chiếu dấu số liệu. */
async function reviewDuyet(req, env, user) {
  const b = await readJson(req);
  const day = vnDay();
  const rv = await computeReview(env, day);
  if (rv.closed) throw new HttpError(409, 'Ngày hôm nay đã chốt', 'closed');
  const all = !!b.all, khu = String(b.khu || '');
  /* Nhận cả khu đang bị nhắc "xem lại" (recheck) dù nó không có ô nào chờ duyệt: khi một phiếu
     được duyệt hoặc bị hủy SAU lúc số của khu đã duyệt, số dự kiến đổi mà số đã duyệt thì không,
     và đường gỡ chính là admin xem bảng lệch mới rồi DUYỆT LẠI. Không nhận thì nút "Duyệt lại"
     bị từ chối và cảnh báo treo vĩnh viễn — đúng cái bệnh của exception 'late' bản cũ. */
  const list = rv.khus.filter((k) => (all || k.khu === khu) && (k.waiting || k.phieu.length || k.recheck));
  if (!list.length) {
    throw bad(all ? 'Không còn khu nào chờ duyệt' : rv.khus.some((k) => k.khu === khu) ? 'Khu này không có gì chờ duyệt' : 'Khu không hợp lệ');
  }
  const last = rv.last || '';
  const ts = Date.now();
  const stmts = [];
  for (const k of list) {
    /* Cố ý KHÔNG lọc "duyet_ts <> ts": câu này phục vụ cả hai việc.
       - Ô đang chờ duyệt: duyet_v = v, duyet_ts = ts là duyệt số mới.
       - Ô đã duyệt rồi: hai phép trên là vô tác dụng (duyet_v đã bằng v, duyet_ts đã bằng ts),
         chỉ còn duyet_at nhảy lên — tức "admin vừa xem lại và vẫn chấp nhận số này".
       Chính nhờ duyet_at nhảy lên mà cảnh báo recheck gỡ được: nó so duyet_at với mốc phiếu. */
    stmts.push(env.DB.prepare(
      `UPDATE counts SET duyet_v = v, duyet_kind = kind, duyet_ts = ts, duyet_at = ?1, duyet_by = ?2, duyet_name = ?3
       WHERE khu_id = ?4 AND day > ?5 AND day <= ?6`
    ).bind(ts, user.id, user.name, k.khu, last, day));
  }
  // phiếu chờ duyệt có dòng thuộc các khu đang duyệt; phiếu chuyển khu nằm ở cả hai khu nên
  // duyệt từ phía nào cũng là duyệt cả phiếu, đúng như nó là một chứng từ
  const keys = new Set();
  list.forEach((k) => k.phieu.forEach((g) => keys.add(g)));
  const phieu = rv.phieu.filter((v) => keys.has(v.key));
  /* Phiếu chuyển và phiếu điều chỉnh giảm bị gộp vào đây cũng phải qua đúng chốt chặn như khi
     duyệt riêng từng phiếu.
     Kiểm TRƯỚC khi dựng batch: thà từ chối cả lần bấm còn hơn duyệt số của khu rồi mới phát hiện
     phiếu không duyệt được, vì lúc đó admin không biết nửa nào đã vào. */
  for (const v of phieu) {
    // mọi loại phiếu RÚT thép khỏi khu đều phải qua cùng một chốt chặn âm tồn
    if (v.kind === 'chuyen' || v.kind === 'dc' || v.kind === 'xuat') {
      await checkTransferStock(env, day, v.lines.map((l) => ({ phi_id: l.phi, khu_id: l.khu, qty: l.qty })), { kind: v.kind });
    }
  }
  for (const v of phieu) {
    stmts.push(v.grp
      ? env.DB.prepare('UPDATE receipts SET duyet_day = ?1, duyet_ts = ?2, duyet_by = ?3, duyet_name = ?4 WHERE grp = ?5 AND voided = 0 AND duyet_day IS NULL')
        .bind(day, ts, user.id, user.name, v.grp)
      : env.DB.prepare('UPDATE receipts SET duyet_day = ?1, duyet_ts = ?2, duyet_by = ?3, duyet_name = ?4 WHERE id = ?5 AND voided = 0 AND duyet_day IS NULL')
        .bind(day, ts, user.id, user.name, v.id));
  }
  stmts.push(
    auditStmt(env, user, 'khu_duyet', {
      day, khu: list.map((k) => k.khu), names: list.map((k) => k.name),
      so: list.map((k) => k.waiting).reduce((a, x) => a + x, 0),
      phieu: phieu.map((v) => v.key),
      lech: list.flatMap((k) => k.items.filter((i) => i.d).map((i) => `${k.khu}/${i.phi}=${i.d > 0 ? '+' : ''}${i.d}`)).slice(0, 40),
    }),
    bump(env)
  );
  await batchGuarded(env, guardStmt(env, IS_CLOSED, day), stmts, closedErr());
  return json({ ok: true, khu: list.length, phieu: phieu.length });
}

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
const WIPE_WORD = 'XOA SACH';

async function resetData(req, env, user) {
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
const BK_STATE = ['phi', 'khu', 'khu_phi', 'khu_user', 'users', 'counts', 'khu_report',
  'receipts', 'day_close', 'daily_summary', 'phi_rate', 'baseline', 'settings'];
/* Bảng chỉ-ghi-thêm: chép ra để đọc, không nạp lại. Nhật ký và lịch sử đếm dài vô hạn theo thời
   gian nên phải chặn trần, không thì một ngày nào đó bản sao to tới mức Worker không dựng nổi và
   nút sao lưu hỏng đúng lúc cần nhất. Lấy phần MỚI NHẤT vì đó là phần hay phải tra. */
const BK_LOG = ['audit', 'counts_log'];
const BK_LOG_MAX = 20000;
// sessions và login_fail cố ý bỏ: phiên đăng nhập và số lần nhập sai PIN không phải số liệu bãi

const bkCols = async (env, t) => {
  const { results } = await env.DB.prepare(`SELECT name FROM pragma_table_info('${t}')`).all();
  return results.map((r) => r.name);
};

async function backupData(env, user) {
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
async function restoreData(req, env, user) {
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
  if (Number(f.schema) !== now) {
    throw bad(`Bản sao thuộc cấu trúc ${f.schema}, hệ thống đang ở ${now}. Không nạp được bản sao khác phiên bản cấu trúc.`);
  }
  /* Tài khoản nằm trong bản sao kèm PIN đã băm. Băm đó vô dụng nếu không có PEPPER, mà PEPPER
     chỉ nằm trên máy chủ chứ không nằm trong tệp — nên tệp rơi ra ngoài cũng không mở được tài
     khoản nào. Nhưng đổi PEPPER rồi nạp lại bản sao cũ thì mọi PIN cũ thành sai: phải đặt lại. */
  const stmts = [];
  const dem = {};
  for (const t of BK_STATE) {
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
    auditStmt(env, user, 'restore', { ngay: f.ngay, luc: f.luc, boi: f.boi, dong: dem }),
    bump(env)
  );
  await env.DB.batch(stmts);
  return json({ ok: true, dong: dem });
}

/* ========================= VIỆC TỰ ĐỘNG (CRON) =========================
   Một Cron mỗi ngày lúc 23:50 giờ VN (16:50 UTC), chỉ dùng 1/5 Cron của gói Free. */
async function nightly(env) {
  const day = vnDay();
  const [setR] = await env.DB.batch([env.DB.prepare(SETTINGS_SQL)]);
  if (parseSettings(setR.results).auto_close) {
    const rv = await computeReview(env, day);
    if (!rv.closed) {
      const reasons = [];
      if (!rv.reports.length) reasons.push('chưa khu nào báo');
      // việc admin đã duyệt (cảnh báo lệch khu) không chặn tự chốt
      if (rv.pending) reasons.push(rv.pending + ' việc chưa duyệt');
      if (reasons.length) await auditStmt(env, SYSTEM, 'auto_close_skip', { day, reason: reasons.join(', ') }).run();
      else {
        const note = 'Tự chốt: mọi khu đã duyệt, không còn việc chờ';
        try { await doClose(env, SYSTEM, rv, note, 'auto_close'); }
        catch (e) { if (!(e instanceof HttpError)) throw e; await auditStmt(env, SYSTEM, 'auto_close_skip', { day, reason: e.message }).run(); }
      }
    }
  }
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(Date.now()),
    env.DB.prepare('DELETE FROM login_fail WHERE day < ?').bind(day),
  ]);
}

/* ========================= QUẢN TRỊ ========================= */

/* Admin ĐẦU TIÊN = tài khoản do màn Thiết lập tạo ra, tức dòng ADMIN có id nhỏ nhất. Đây là
   "chủ hệ thống": chỉ người này được sửa tên, xoá và khôi phục tài khoản, và chính tài khoản này
   thì không ai khoá, hạ quyền hay xoá được — kể cả một admin khác. Thiếu chốt đó thì hai admin
   có thể khoá lẫn nhau và cả bãi mất đường quản lý người dùng, không sửa được từ trong app. */
const firstAdminId = async (env) => {
  /* Phải lọc role = 'admin': "id nhỏ nhất" một mình là chưa đủ. Trên database đã dùng từ trước,
     dòng id nhỏ nhất có thể KHÔNG còn là admin (đường đổi vai trò cũ chỉ chặn tự hạ quyền mình),
     và lúc đó cả bãi mất đường quản lý người dùng: sửa tên / xoá / khôi phục tài khoản tắt hẳn
     với mọi người, mà chính dòng đó lại được PROTECT_FIRST che nên cũng không nâng quyền hay khoá
     lại được — khoá cứng, không sửa nổi từ trong app. deleted = 0 lọc thêm vì lý do y như vậy. */
  const r = await env.DB.prepare("SELECT MIN(id) id FROM users WHERE role = 'admin' AND deleted = 0").first();
  return r && r.id != null ? r.id : 0;
};

async function listUsers(env) {
  // trả cả tài khoản đã xoá: admin đầu tiên cần thấy để khôi phục khi xoá nhầm
  const [uR, fid] = await Promise.all([
    env.DB.prepare('SELECT id, name, phone, role, locked, deleted, must_change, locked_until FROM users ORDER BY id').all(),
    firstAdminId(env),
  ]);
  return json({ users: uR.results, first: fid });
}

async function createUser(req, env, admin) {
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
const OWNER_ONLY = ['rename', 'delete', 'restore'];
// và ba việc KHÔNG được làm với chính admin đầu tiên, kể cả do một admin khác
const PROTECT_FIRST = ['lock', 'role', 'delete'];
/* Đặt lại PIN của admin đầu tiên thì CHỈ chính người đó làm được. Thiếu chốt này là PROTECT_FIRST
   thành vô nghĩa: một admin thứ hai bấm "Đặt lại PIN" trên thẻ admin đầu tiên, PIN mới hiện ngay
   trên màn hình cho họ đọc, họ đăng nhập vào chính tài khoản chủ hệ thống rồi làm đủ những việc
   vừa bị chặn — đổi tên và xoá bất kỳ ai, kể cả mọi admin khác. */
const FIRST_SELF_ONLY = ['reset-pin'];

async function userAction(req, env, admin, id, action) {
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

async function khuCreate(req, env, admin) {
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
async function khuUsers(req, env, admin, id) {
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

async function khuUpdate(req, env, admin, id) {
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

async function phiUpdate(req, env, admin, id) {
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

async function seedPhiApi(env, user) {
  await seedPhi(env);
  await env.DB.batch([auditStmt(env, user, 'phi_seed', null), bump(env)]);
  return json({ ok: true, n: PHI_DEFAULTS.length });
}

async function phiBulk(req, env, admin) {
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

async function settingsUpdate(req, env, admin) {
  const b = await readJson(req);
  const stmts = [];
  for (const key of Object.keys(SETTING_RANGE)) {
    if (b[key] !== undefined) {
      const v = intIn(b[key], SETTING_RANGE[key][0], SETTING_RANGE[key][1], key);
      stmts.push(env.DB.prepare('INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(key, String(v)));
    }
  }
  if (!stmts.length) throw bad('Không có gì để lưu');
  stmts.push(auditStmt(env, admin, 'settings_update', Object.fromEntries(Object.keys(SETTING_RANGE).filter((k) => b[k] !== undefined).map((k) => [k, b[k]]))), bump(env));
  await env.DB.batch(stmts);
  return json({ ok: true });
}

/* ========================= XEM NGÀY CŨ ========================= */

async function dayView(env, url) {
  const day = url.searchParams.get('date') || '';
  if (!DAY_RE.test(day) || day > vnDay()) throw bad('Ngày không hợp lệ');
  const db = env.DB;
  const [closeR, cntR, baseR, prevR, rcR, sumR, mvR, repR, lastR] = await db.batch([
    db.prepare('SELECT dc.day, dc.ts, dc.note, dc.span, u.name uname FROM day_close dc LEFT JOIN users u ON u.id = dc.closed_by WHERE dc.day = ?').bind(day),
    /* Xem lại một ngày là xem số ĐÃ DUYỆT của ngày đó: đó mới là số liệu chính thức.
       Lần báo chưa duyệt (nếu còn) không phải số liệu của ngày, nên không lấy ra đây. */
    db.prepare(`SELECT c.khu_id, c.phi_id, c.duyet_v v, c.duyet_kind kind, c.duyet_at ts, ${DUYET_NAME.replace('duyet_uname', 'uname')}
                FROM counts c ${DUYET_JOIN} WHERE c.day = ? AND c.duyet_v IS NOT NULL`).bind(day),
    db.prepare('SELECT khu_id, phi_id, v FROM baseline WHERE day = ?').bind(day),
    // ngày chưa chốt: khu không báo thì tạm lấy tồn chuẩn trước đó (giống màn Tổng quan)
    db.prepare("SELECT khu_id, phi_id, v FROM baseline WHERE day = (SELECT COALESCE(MAX(day), '') FROM day_close WHERE day < ?)").bind(day),
    db.prepare(`SELECT r.id, r.phi_id, r.khu_id, r.qty, r.note, r.kind, r.grp, r.ts, r.voided, r.day, r.duyet_day, ${UNAME}
                FROM receipts r LEFT JOIN users u ON u.id = r.user_id
                WHERE (r.duyet_day = ?1 OR (r.duyet_day IS NULL AND r.day = ?1)) ORDER BY r.id`).bind(day),
    // dc đi kèm nhap: màn Lịch sử phải nói được "ngày đó sổ bị sửa bao nhiêu", y như báo cáo kỳ
    db.prepare('SELECT phi_id, ton, nhap, dung, span, dc, xuat FROM daily_summary WHERE day = ?').bind(day),
    // ngày CHƯA chốt thì tồn còn phải cộng phần thép đã duyệt mà khu chưa kịp đếm, y như Tồn bãi
    db.prepare(MV_CHUA_DEM).bind(day),
    db.prepare(`SELECT r.khu_id, r.ts, ${UNAME} FROM khu_report r LEFT JOIN users u ON u.id = r.user_id WHERE r.day = ?`).bind(day),
    // lần chốt gần nhất: chỉ ngày đó mở lại được, nên giao diện mới biết có bày nút hay không
    db.prepare('SELECT MAX(day) d FROM day_close'),
  ]);
  return json({
    day, close: closeR.results[0] || null, counts: cntR.results, baseline: baseR.results, prevBaseline: prevR.results,
    receipts: rcR.results, summary: sumR.results, mvNew: mvR.results, reports: repR.results,
    lastClose: (lastR.results[0] || {}).d || null,
  });
}

/* ========================= BÁO CÁO THEO KỲ =========================
   Đọc bảng tổng hợp daily_summary (12 dòng/ngày) nên cả năm cũng chỉ vài nghìn dòng. */
async function report(env, url) {
  const today = vnDay();
  const from = url.searchParams.get('from') || today.slice(0, 8) + '01';
  const to = url.searchParams.get('to') || today;
  if (!DAY_RE.test(from) || !DAY_RE.test(to) || from > to) throw bad('Khoảng ngày không hợp lệ');
  if (daysBetween(from, to) > 366) throw bad('Chỉ xem tối đa 1 năm mỗi lần');
  const db = env.DB;
  /* Mốc tồn đầu kỳ: lần chốt gần nhất TRƯỚC kỳ. Nếu kỳ bao gồm cả lần chốt đầu tiên của hệ thống
     thì lấy chính ngày đó làm mốc (nó là buổi kiểm kê mở sổ: lượng nhập/dùng trước nó không thể
     biết được nên `dung` để trống). Trước đây mốc là null mà vẫn cộng nhập/dùng của ngày mở sổ,
     nên báo cáo không khép kín: Tồn đầu − + Nhập − Dùng ra số khác Tồn cuối. */
  const baseR = await db.batch([
    db.prepare('SELECT MAX(day) d FROM daily_summary WHERE day < ?').bind(from),
    db.prepare('SELECT MIN(day) d FROM daily_summary WHERE day >= ? AND day <= ?').bind(from, to),
  ]);
  const before = baseR[0].results[0] && baseR[0].results[0].d;
  const firstIn = baseR[1].results[0] && baseR[1].results[0].d;
  const baseDay = before || firstIn || '';
  const openStock = !before && !!firstIn; // mốc là buổi kiểm kê mở sổ nằm trong kỳ
  const [phiR, openR, sumR, closeR, daysR] = await db.batch([
    db.prepare('SELECT id, kg_per_cay, bo_size, unit FROM phi ORDER BY sort'),
    db.prepare('SELECT day, phi_id, ton FROM daily_summary WHERE day = ?').bind(baseDay),
    db.prepare('SELECT phi_id, SUM(nhap) nhap, SUM(dung) dung, SUM(dc) dc, SUM(xuat) xuat FROM daily_summary WHERE day > ? AND day <= ? GROUP BY phi_id').bind(baseDay, to),
    db.prepare('SELECT day, phi_id, ton FROM daily_summary WHERE day = (SELECT MAX(day) FROM daily_summary WHERE day >= ? AND day <= ?)').bind(from, to),
    db.prepare(
      `SELECT d.day, MAX(d.span) span, SUM(d.nhap * p.kg_per_cay) nhap_kg, SUM(COALESCE(d.dung, 0) * p.kg_per_cay) dung_kg, SUM(d.ton * p.kg_per_cay) ton_kg, SUM(d.dc * p.kg_per_cay) dc_kg, SUM(d.xuat * p.kg_per_cay) xuat_kg
       FROM daily_summary d JOIN phi p ON p.id = d.phi_id WHERE d.day > ? AND d.day <= ? GROUP BY d.day ORDER BY d.day`
    ).bind(baseDay, to),
  ]);
  const by = (rs, f) => Object.fromEntries(rs.map((r) => [r.phi_id, r[f]]));
  const open = by(openR.results, 'ton'), close = by(closeR.results, 'ton');
  const nhap = by(sumR.results, 'nhap'), dung = by(sumR.results, 'dung'), dcs = by(sumR.results, 'dc');
  // xuat: phần lượng dùng CÓ PHIẾU. Nằm trong 'dung' chứ không cộng thêm, nên không phá đẳng thức.
  const xus = by(sumR.results, 'xuat');
  const hasOpen = openR.results.length > 0, hasClose = closeR.results.length > 0;
  const rows = phiR.results.map((p) => {
    const o = hasOpen ? open[p.id] || 0 : null;
    const c = hasClose ? close[p.id] || 0 : o;
    return { phi: p.id, kg: p.kg_per_cay, dau: o, nhap: nhap[p.id] || 0, dc: dcs[p.id] || 0, xuat: xus[p.id] || 0, dung: dung[p.id] == null ? 0 : dung[p.id], cuoi: c };
  });
  const out = {
    from, to, openDay: hasOpen ? baseDay : null, closeDay: hasClose ? closeR.results[0].day : null,
    openStock, closedDays: daysR.results.length, rows, days: daysR.results,
    /* Kỳ nào không có lần điều chỉnh nào thì giao diện bỏ hẳn cột, khỏi bày một cột toàn số 0 trên
       màn hình điện thoại đã chật. Cột trong CSV thì LUÔN có: tệp mang đi đối chiếu phải cùng một
       bộ cột ở mọi kỳ, không thì mỗi lần xuất lại lệch đầu cột. */
    hasDc: rows.some((r) => r.dc),
    // cột "có phiếu xuất" cũng theo lệ đó: kỳ nào không ai ghi phiếu xuất thì không bày cột rỗng
    hasXuat: rows.some((r) => r.xuat),
  };
  if (url.searchParams.get('format') !== 'csv') return json(out);

  const esc = (x) => '"' + String(x).replace(/"/g, '""') + '"';
  const t = (x, kg) => (x == null ? '' : csvDec((x * kg) / 1000, 3));
  const pBy = Object.fromEntries(phiR.results.map((p) => [p.id, p]));
  const lines = [
    esc(`Báo cáo Nhập - Dùng - Tồn từ ${fmtDay(from)} đến ${fmtDay(to)} (${out.closedDays} ngày đã chốt)`),
    csvRow(['Phi', 'Đơn vị', 'Tồn đầu', 'Nhập', 'Điều chỉnh', 'Dùng', 'Có phiếu xuất', 'Tồn cuối', 'Tồn đầu (tấn)', 'Nhập (tấn)', 'Điều chỉnh (tấn)', 'Dùng (tấn)', 'Có phiếu xuất (tấn)', 'Tồn cuối (tấn)'].map(esc)),
  ];
  const tot = { dau: 0, nhap: 0, dc: 0, xuat: 0, dung: 0, cuoi: 0 };
  for (const r of rows) {
    const p = pBy[r.phi], n = (x) => (x == null ? '' : csvQty(x, p));
    lines.push(csvRow([esc(r.phi), esc(csvUnit(p)), n(r.dau), n(r.nhap), n(r.dc), n(r.dung), n(r.xuat), n(r.cuoi),
      t(r.dau, r.kg), t(r.nhap, r.kg), t(r.dc, r.kg), t(r.dung, r.kg), t(r.xuat, r.kg), t(r.cuoi, r.kg)]));
    tot.dau += (r.dau || 0) * r.kg; tot.nhap += r.nhap * r.kg; tot.dc += r.dc * r.kg;
    tot.xuat += r.xuat * r.kg; tot.dung += r.dung * r.kg; tot.cuoi += (r.cuoi || 0) * r.kg;
  }
  /* Đúng 14 ô, khớp từng cột với dòng tiêu đề: thiếu một ô rỗng là cả khối số tấn tụt sang trái một
     cột và Excel đọc "tồn đầu" thành "tồn cuối" — sai ngay trên tệp mang đi đối chiếu. Thêm một cột là
     thêm MỘT ô rỗng ở đây nữa: 7 ô rỗng (đứng sau nhãn TỔNG) rồi 6 số tấn, đếm lại chứ đừng đoán. */
  const totCells = ['', '', '', '', '', '', ''].concat([tot.dau, tot.nhap, tot.dc, tot.dung, tot.xuat, tot.cuoi].map((x) => csvDec(x / 1000, 3)));
  lines.push(csvRow([esc('TỔNG (tấn)'), ...totCells]));
  lines.push('', csvRow(['Ngày', 'Số ngày gộp', 'Nhập (tấn)', 'Điều chỉnh (tấn)', 'Dùng (tấn)', 'Có phiếu xuất (tấn)', 'Tồn cuối ngày (tấn)'].map(esc)));
  for (const d of out.days) lines.push(csvRow([esc(fmtDay(d.day)), d.span, csvDec(d.nhap_kg / 1000, 3), csvDec((d.dc_kg || 0) / 1000, 3), csvDec(d.dung_kg / 1000, 3), csvDec((d.xuat_kg || 0) / 1000, 3), csvDec(d.ton_kg / 1000, 3)]));
  return new Response(CSV_HEAD + lines.join('\r\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="bao-cao-${from}-${to}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}

/* ========================= HAI NGƯỜI BÁO KHÁC SỐ ========================= */

// So sánh lần báo mới nhất với lần báo gần nhất của NGƯỜI KHÁC trong ngày (lấy từ lịch sử đếm)
async function conflictView(env, url) {
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
async function conflictResolve(req, env, user) {
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
async function submissionsView(env, url) {
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
async function recountAfterClose(req, env, user) {
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
    env.DB.prepare('UPDATE khu_report SET recount = 1, resolved = 0 WHERE day = ? AND khu_id = ?').bind(day, khu),
    auditStmt(env, user, 'recount_after_close', { day, khu }),
    bump(env),
  ]);
  return json({ ok: true });
}

async function auditList(env, url) {
  const limit = Math.min(Number(url.searchParams.get('limit')) || 150, 500);
  const { results } = await env.DB.prepare('SELECT id, ts, user_name, action, detail FROM audit ORDER BY id DESC LIMIT ?').bind(limit).all();
  return json({ items: results });
}

async function usage(env, url) {
  const days = Math.min(Number(url.searchParams.get('days')) || 30, 180);
  const { results } = await env.DB.prepare('SELECT day, used_json, span FROM day_close ORDER BY day DESC LIMIT ?').bind(days).all();
  return json({ items: results.map((r) => { let used = {}; try { used = JSON.parse(r.used_json || '{}'); } catch (e) { /* bỏ qua */ } return { day: r.day, span: r.span || 1, used }; }) });
}

async function exportCsv(env, url) {
  const day = DAY_RE.test(url.searchParams.get('date') || '') ? url.searchParams.get('date') : vnDay();
  const [phiR, khuR, cntR, baseR, mvR] = await env.DB.batch([
    env.DB.prepare('SELECT id, kg_per_cay, active, bo_size, unit FROM phi ORDER BY sort'),
    env.DB.prepare('SELECT id, name, active FROM khu ORDER BY sort, id'),
    env.DB.prepare(EFF_BY_BASELINE).bind(day),
    env.DB.prepare('SELECT khu_id, phi_id, v FROM baseline WHERE day = (SELECT MAX(day) FROM baseline WHERE day <= ?)').bind(day),
    env.DB.prepare(MV_CHUA_DEM).bind(day),
  ]);
  const c = {}, b = {}, mv = {};
  cntR.results.forEach((r) => (c[r.khu_id + '|' + r.phi_id] = r.v));
  baseR.results.forEach((r) => (b[r.khu_id + '|' + r.phi_id] = r.v));
  mvR.results.forEach((r) => (mv[r.khu_id + '|' + r.phi_id] = r.q));
  const hasData = new Set();
  Object.keys(c).concat(Object.keys(b), Object.keys(mv)).forEach((key) => {
    if (((c[key] !== undefined ? c[key] : (b[key] || 0)) + (mv[key] || 0)) > 0) hasData.add(key.split('|')[1]);
  });
  const phis = phiR.results.filter((p) => p.active !== 0 || hasData.has(p.id));
  const esc = (s) => '"' + String(s).replace(/"/g, '""') + '"';
  // cột thép cuộn ghi số cuộn; "Tổng (cây)" chỉ cộng thép cây, không lẫn số phần của cuộn
  const head = ['Khu', ...phis.map((p) => (isCuon(p) ? p.id + ' (cuộn)' : p.id)), 'Tổng thép cây (cây)', 'Tổng (tấn)'];
  const lines = [csvRow(head.map(esc))];
  const colV = phis.map(() => 0);
  let allKg = 0;
  for (const k of khuR.results) {
    let sum = 0, kg = 0;
    const cells = phis.map((p, i) => {
      const key = k.id + '|' + p.id;
      const v = (c[key] !== undefined ? c[key] : (b[key] || 0)) + (mv[key] || 0);
      if (!isCuon(p)) sum += v;
      kg += v * p.kg_per_cay; colV[i] += v;
      return csvQty(v, p);
    });
    allKg += kg;
    // khu đã ẩn mà còn thép vẫn nằm trong tổng của app, nên tệp xuất ra phải có để khớp số
    lines.push(csvRow([esc(k.name + (k.active ? '' : ' (đã ẩn)')), ...cells, sum, csvDec(kg / 1000, 2)]));
  }
  const sumCay = phis.reduce((a, p, i) => a + (isCuon(p) ? 0 : colV[i]), 0);
  lines.push(csvRow([esc('TỔNG'), ...colV.map((v, i) => csvQty(v, phis[i])), sumCay, csvDec(allKg / 1000, 2)]));
  return new Response(CSV_HEAD + lines.join('\r\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="ton-kho-${day}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}

/* ========================= ĐỊNH TUYẾN ========================= */

async function handle(req, env, url) {
  const method = req.method;
  if (method !== 'GET' && method !== 'HEAD') {
    const o = req.headers.get('Origin');
    if (o) {
      let host = null;
      try { host = new URL(o).host; } catch (e) { /* Origin: null hoặc sai định dạng */ }
      if (host !== url.host) throw new HttpError(403, 'Yêu cầu bị từ chối');
    }
  }
  const p = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const r0 = p[0] || '';

  if (method === 'POST' && r0 === 'setup') return setup(req, env, url);
  if (method === 'POST' && r0 === 'login') return login(req, env, url);
  if (method === 'POST' && r0 === 'logout') return logout(req, env, url);
  if (method === 'POST' && r0 === 'recover') return recoverAdmin(req, env);

  // hỏi phiên bản ngầm: nhẹ nhất có thể (không gia hạn phiên, không ghi)
  if (r0 === 'rev' && method === 'GET') {
    const u = await auth(req, env, false);
    if (u.must_change) throw new HttpError(403, 'Bạn cần đổi PIN trước khi sử dụng');
    const r = await env.DB.prepare("SELECT value FROM meta WHERE key = 'rev'").first();
    return json({ rev: r ? r.value : 0, today: vnDay() });
  }

  const user = await auth(req, env);
  if (r0 === 'me' && method === 'GET') return json({ user: { id: user.id, name: user.name, role: user.role, must_change: user.must_change } });
  if (r0 === 'change-pin' && method === 'POST') return changePin(req, env, user);
  if (user.must_change) throw new HttpError(403, 'Bạn cần đổi PIN trước khi sử dụng');

  const ALL = ['admin', 'thukho', 'nguoidem'];
  const need = (roles) => { if (!roles.includes(user.role)) throw new HttpError(403, 'Bạn không có quyền thực hiện việc này'); };

  if (r0 === 'bootstrap' && method === 'GET') return json(await bootstrap(env, user));
  if (r0 === 'counts' && method === 'PUT') { need(ALL); return putCounts(req, env, user); }
  if (r0 === 'usage' && method === 'GET') return usage(env, url);
  if (r0 === 'day' && method === 'GET') return dayView(env, url);

  if (r0 === 'receipts') {
    need(['admin', 'thukho']);
    if (method === 'POST' && p.length === 1) return postReceipt(req, env, user);
    if (method === 'DELETE' && p.length === 2) return voidReceipt(env, user, Number(p[1]));
    // duyệt phiếu: chỉ admin. Mọi phiếu đều phải qua một lần bấm duyệt, kể cả phiếu admin tự nhập.
    if (method === 'POST' && p.length === 3 && p[2] === 'duyet') { need(['admin']); return duyetReceipt(env, user, Number(p[1])); }
  }
  if (r0 === 'transfers' && method === 'POST') { need(['admin', 'thukho']); return postTransfer(req, env, user); }
  /* Điều chỉnh tồn: LẬP được thì admin và thủ kho, vì người phát hiện sổ sai thường là thủ kho và
     phiếu chưa vào tồn cho tới khi được duyệt. DUYỆT thì chỉ admin, như mọi phiếu khác (chốt chặn
     nằm ở nhánh receipts/duyet bên trên). Muốn siết lại chỉ admin được lập thì bỏ 'thukho' ở đây. */
  if (r0 === 'adjust' && method === 'POST') { need(['admin', 'thukho']); return postAdjust(req, env, user); }
  if (r0 === 'xuat' && method === 'POST') { need(['admin', 'thukho']); return postXuat(req, env, user); }
  if (r0 === 'report' && method === 'GET') { need(['admin', 'thukho']); return report(env, url); }

  // --- chỉ admin ---
  need(['admin']);
  if (r0 === 'review' && method === 'GET') return json(await computeReview(env, vnDay()));
  if (r0 === 'review' && p[1] === 'duyet' && method === 'POST') return reviewDuyet(req, env, user);
  if (r0 === 'close' && method === 'POST') return closeDay(req, env, user);
  if (r0 === 'reopen' && method === 'POST') return reopenDay(req, env, user);
  // đặt lại số liệu thép: chỉ admin đầu tiên (chốt chặn thật nằm trong resetData)
  if (r0 === 'reset' && method === 'POST') return resetData(req, env, user);
  // sao lưu / nạp lại: chốt chặn thật nằm trong backupData / restoreData
  if (r0 === 'backup' && method === 'GET') return backupData(env, user);
  if (r0 === 'restore' && method === 'POST') return restoreData(req, env, user);
  if (r0 === 'recount' && method === 'POST') {
    const b = await readJson(req);
    const day = vnDay();
    const res = await env.DB.prepare('UPDATE khu_report SET recount = 1 WHERE day = ? AND khu_id = ?').bind(day, String(b.khu || '')).run();
    if (!res.meta.changes) throw bad('Khu này chưa có báo cáo để yêu cầu đếm lại');
    await env.DB.batch([bump(env), auditStmt(env, user, 'recount', { khu: b.khu })]);
    return json({ ok: true });
  }
  if (r0 === 'conflict' && !p[1] && method === 'GET') return conflictView(env, url);
  if (r0 === 'conflict' && p[1] === 'resolve' && method === 'POST') return conflictResolve(req, env, user);
  if (r0 === 'submissions' && method === 'GET') return submissionsView(env, url);
  if (r0 === 'recount-after-close' && method === 'POST') return recountAfterClose(req, env, user);
  if (r0 === 'audit' && method === 'GET') return auditList(env, url);
  if (r0 === 'export' && method === 'GET') return exportCsv(env, url);
  if (r0 === 'users') {
    if (method === 'GET' && p.length === 1) return listUsers(env);
    if (method === 'POST' && p.length === 1) return createUser(req, env, user);
    if (method === 'POST' && p.length === 3) return userAction(req, env, user, Number(p[1]), p[2]);
  }
  if (r0 === 'khu') {
    if (method === 'POST' && p.length === 1) return khuCreate(req, env, user);
    if (method === 'PATCH' && p.length === 2) return khuUpdate(req, env, user, p[1]);
    if (method === 'PUT' && p.length === 3 && p[2] === 'users') return khuUsers(req, env, user, p[1]);
  }
  if (r0 === 'phi' && method === 'PATCH' && p.length === 2) return phiUpdate(req, env, user, p[1]);
  if (r0 === 'phi' && method === 'PUT' && p.length === 1) return phiBulk(req, env, user);
  if (r0 === 'phi' && method === 'POST' && p[1] === 'seed') return seedPhiApi(env, user);
  if (r0 === 'settings' && method === 'PUT') return settingsUpdate(req, env, user);

  throw new HttpError(404, 'Không tìm thấy');
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/') && url.pathname !== '/api') return env.ASSETS.fetch(req);
    try {
      await ensureSchema(env);
      return await handle(req, env, url);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message, code: e.code }, e.status);
      console.error(e && e.stack ? e.stack : e);
      return json({ error: 'Lỗi máy chủ, thử lại sau' }, 500);
    }
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(ensureSchema(env).then(() => nightly(env)).catch((e) => console.error(e && e.stack ? e.stack : e)));
  },
};
