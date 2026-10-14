// Báo cáo ca gửi cấp trên: gom quân số đầu ca + công việc gia công thành một bản chữ theo mẫu của đơn vị.
import { HttpError, bad, json, vnDay } from './core.js';
import { SETTINGS_SQL, auditStmt, batchGuarded, bump, guardStmt, parseSettings, readJson } from './helpers.js';
import { MAU_CO, QS_LY_DO, TO_SX, caGio, caHan, caKe, caKhoa, caLuc, docCfg } from './quanso.js';

/* ========================= BÁO CÁO CA =========================
   Người soạn: CVKTHT trở lên. Server chỉ GOM SỐ LIỆU và LƯU; việc ghép chữ theo mẫu nằm ở máy khách (app.js,
   bcTao), vì người soạn sửa từng mục ngay trên màn hình và phải thấy bản chữ đổi theo lúc đang gõ.
   - Số liệu app chỉ là BẢN ĐIỀN SẴN: mục nào người soạn đã sửa thì lưu nguyên chữ (data.muc[k]), lần mở sau dùng
     chữ đó; mục chưa sửa thì ghép lại từ số mới nhất.
   - MẪU (bc_mau, một dòng): phần đầu (đơn vị, chỉ huy, dự án, khu vực), máy móc thiết bị và các dòng kiểm tra mặc
     định. Phần đầu và máy móc lưu lại mỗi lần chép báo cáo (ca sau dùng tiếp); dòng kiểm tra chỉ đổi khi người soạn
     bấm "đặt làm mẫu", để một nhận xét xấu của hôm nay không tự lặp lại sang hôm sau. */
// mẫu mặc định: năm dòng kiểm tra, giám sát của đơn vị
export const BC_KT = [
  'Quản lý máy 3 ca: bố trí việc hợp lý, đúng; ký nhật trình đúng',
  'Dọn dẹp cuối ca: tốt; các tổ dọn dẹp cuối giờ, có ảnh báo cáo',
  'Thiết bị nâng hạ không giá kê: không có, đã kê kích đầy đủ',
  'Kiểm soát vật tư: tránh làm hỏng vật tư, thất thoát, lãng phí',
  'Hình ảnh văn hoá CBCNV (túm tụm, trốn việc, đồ bảo hộ sai quy cách): không có',
];
const BC_DAU = ['don_vi', 'ddt', 'tdtr', 'cbpt', 'du_an', 'khu_vuc'];
const BC_MUC = ['s3', 's4', 's5', 's6', 's7', 's8'];
const BC_SUA_NGAY = 7;
const docJ = (s) => { try { const o = JSON.parse(s || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } };
const chu = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
// chữ nhiều dòng (một mục của báo cáo): giữ xuống dòng, bỏ dòng trống thừa
const doan = (v, max) => String(v == null ? '' : v).replace(/\r/g, '').split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n').slice(0, max);
const docMau = (row) => {
  const d = docJ(row && row.data);
  return { dau: Object.fromEntries(BC_DAU.map((k) => [k, chu((d.dau || {})[k], 120)])), mmtb: chu(d.mmtb, 400), kt: Array.isArray(d.kt) && d.kt.length ? d.kt.map((x) => chu(x, 200)).filter(Boolean) : BC_KT,
    // thứ tự tổ do CVKTHT xếp (id Tiểu đội trưởng), dùng cho bảng quân số và mục 3 của báo cáo
    thu_tu: Array.isArray(d.thu_tu) ? d.thu_tu.filter((x) => Number.isInteger(x)) : [] };
};
/* MỤC 4 SOẠN THEO DÒNG (xem bcViec ở app.js): chỉnh của người soạn trên các dòng công việc, lưu kèm báo cáo của ca.
     d."<id đơn>" = { tt: 0–100 | 'xong', g, an: 1 } — g = tiến độ của đơn lúc chỉnh; % hoặc hoàn thành do người soạn đặt cho đơn đó (chỉ trong báo cáo,
       KHÔNG ghi ngược vào đơn gia công), an = bỏ khỏi báo cáo;
     them = [id đơn] — đơn chưa có % mà người soạn chạm để đưa vào báo cáo;
     tu = [{ id, ten, tt }] — việc ngoài app người soạn tự thêm (id để hai người sửa cùng lúc ghép được theo từng dòng);
       việc chưa xong mang sang ca sau (bcView: viecTruoc).
   Chỉ là phần chỉnh: dòng nào không chỉnh vẫn theo số mới nhất của đơn. Đọc lại luôn qua đây để dữ liệu lạ không lọt. */
const ttHop = (v) => (v === 'xong' ? 'xong' : Number.isInteger(v) && v >= 0 && v <= 100 ? v : null);
export function docViec(v) {
  const o = v && typeof v === 'object' && !Array.isArray(v) ? v : {}, d = {};
  for (const [k, x] of Object.entries(o.d && typeof o.d === 'object' ? o.d : {}).slice(0, 300)) {
    if (!/^\d+$/.test(k) || !x || typeof x !== 'object') continue;
    // g: tiến độ của đơn LÚC người soạn chỉnh (để nhắc khi đơn đi tiếp sau đó)
    const tt = ttHop(x.tt), g = tt != null ? ttHop(x.g) : null, m = { ...(tt != null ? { tt } : {}), ...(g != null ? { g } : {}), ...(x.an ? { an: 1 } : {}) };
    if (Object.keys(m).length) d[k] = m;
  }
  const them = Array.isArray(o.them) ? [...new Set(o.them.map(Number).filter((x) => Number.isInteger(x) && x > 0))].slice(0, 300) : [];
  const tu = (Array.isArray(o.tu) ? o.tu : []).map((x, i) => ({ id: x && /^[A-Za-z0-9]{1,16}$/.test(x.id) ? x.id : 't' + i, ten: chu(x && x.ten, 160), tt: ttHop(x && x.tt) }))
    .filter((x) => x.ten && x.tt != null).slice(0, 60);
  return { d, them, tu };
}
/* Việc ngoài app mang từ báo cáo ca trước sang: chỉ việc chưa xong. Ca trước chép mục 4 BẰNG CHỮ thì không mang gì: các
   dòng theo app có thể đã bị xoá trong chữ, mang sang là làm sống lại dòng người soạn đã bỏ. */
function viecTruoc(row) {
  const d = row ? docJ(row.data) : null;
  if (!d || (d.muc && typeof d.muc.s4 === 'string')) return [];
  return docViec(d.viec).tu.filter((x) => x.tt !== 'xong');
}
function docCa(q, st) {
  const hien = caLuc(st);
  if (!q.get('ngay') && !q.get('ca')) return hien;
  const ngay = String(q.get('ngay') || ''), ca = Number(q.get('ca'));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ngay) || (ca !== 1 && ca !== 2)) throw bad('Ca không hợp lệ');
  const c = { ngay, ca };
  if (caKhoa(c) > caKhoa(caKe(hien))) throw bad('Chưa tới ca này');
  return c;
}

/* Số liệu cho một ca: quân số hai ca của ngày đó (tổ chia ca thì dòng ca kia cũng vào báo cáo), lần báo gần nhất
   của từng tổ (tổ chưa báo vẫn vào tổng quân số), đơn gia công đang làm và đơn xong trong giờ ca, các đơn đang
   vướng / trễ, người có thể chọn nhanh làm chỉ huy, mẫu, và báo cáo đã soạn (nếu có). */
export async function bcView(env, url) {
  const st = parseSettings((await env.DB.prepare(SETTINGS_SQL).all()).results);
  const c = docCa(url.searchParams, st), gio = caGio(st, c), hien = caLuc(st);
  const [tdt, qs, qsDem, truoc, don, nguoi, mau, bc, ck, bcTr] = await env.DB.batch([
    env.DB.prepare(`SELECT u.id, u.name FROM users u WHERE u.role = 'tieudoi' AND u.deleted = 0 ORDER BY ${TO_SX}`),
    env.DB.prepare(`SELECT q.ca, q.user_id, q.tong, q.lam, q.ca_kia, q.nghi, q.ghi_chu, COALESCE(u.name, '(đã xoá)') uname
                    FROM quan_so q LEFT JOIN users u ON u.id = q.user_id WHERE q.ngay = ?`).bind(c.ngay),
    // ca đêm của NGÀY HÔM TRƯỚC: báo cáo ca ngày của tổ làm hai ca kèm ca liền trước đó
    env.DB.prepare('SELECT q.ca, q.user_id, q.tong, q.lam, q.ca_kia, q.nghi, q.ghi_chu FROM quan_so q WHERE q.ngay = ? AND q.ca = 2').bind(new Date(Date.parse(c.ngay) - 864e5).toISOString().slice(0, 10)),
    env.DB.prepare(`SELECT q.user_id, q.ca, q.tong, q.lam, q.ca_kia, q.ts FROM users u JOIN quan_so q ON q.rowid = (
                      SELECT x.rowid FROM quan_so x WHERE x.user_id = u.id AND x.ngay < ?1 ORDER BY x.ngay DESC, x.ca DESC LIMIT 1)
                    WHERE u.role = 'tieudoi' AND u.deleted = 0`).bind(c.ngay),
    /* Đơn còn mở, cộng đơn XONG trong giờ ca. UNION ALL để mỗi nửa đi theo index (tt, cap_ts) như gcList. */
    env.DB.prepare(`SELECT * FROM (
                      SELECT id, cau_kien, hang_muc, phan_khu, tang, cote, truc, user_id, han, buoi, tt, pct, vuong, xong_ts FROM don_gc WHERE tt IN ('moi', 'nhan', 'lam')
                      UNION ALL SELECT id, cau_kien, hang_muc, phan_khu, tang, cote, truc, user_id, han, buoi, tt, pct, vuong, xong_ts FROM don_gc
                        WHERE tt = 'xong' AND cap_ts >= ?1 AND xong_ts >= ?1 AND xong_ts < ?2) ORDER BY id`).bind(gio.tu, gio.den),
    // admin mang chức danh (users.chuc_danh) cũng là người chọn được, xếp theo chức danh đó
    env.DB.prepare(`SELECT id, name, CASE role WHEN 'admin' THEN chuc_danh ELSE role END role FROM users
                    WHERE deleted = 0 AND (role IN ('daidoi', 'trungdoi', 'cvktht') OR (role = 'admin' AND chuc_danh IN ('daidoi', 'trungdoi', 'cvktht'))) ORDER BY name`),
    env.DB.prepare('SELECT data FROM bc_mau WHERE id = 1'),
    env.DB.prepare(`SELECT b.data, b.van_ban, b.ts, b.by_id, COALESCE(u.name, '(đã xoá)') by_name FROM bao_cao_ca b LEFT JOIN users u ON u.id = b.by_id
                    WHERE b.ngay = ? AND b.ca = ?`).bind(c.ngay, c.ca),
    // loại cấu kiện trong danh mục gia công: chọn nhanh khi thêm việc ngoài app vào mục 4
    env.DB.prepare("SELECT ten FROM gc_muc WHERE loai = 'ck' ORDER BY sort, id"),
    /* báo cáo đã lưu GẦN NHẤT TRƯỚC ca này, trong 2 ngày: các việc ngoài app chưa xong mang sang ca này. Báo cáo cũ hơn
       thì thôi (nghỉ soạn một tuần không kéo việc của tuần trước về). */
    env.DB.prepare('SELECT data FROM bao_cao_ca WHERE ngay >= ?3 AND (ngay < ?1 OR (ngay = ?1 AND ca < ?2)) ORDER BY ngay DESC, ca DESC LIMIT 1')
      .bind(c.ngay, c.ca, new Date(Date.parse(c.ngay) - 2 * 864e5).toISOString().slice(0, 10)),
  ]);
  const r = bc.results[0];
  return json({
    ngay: c.ngay, ca: c.ca, hien, ke: caKe(hien), gio, han: caHan(st, c), lyDo: QS_LY_DO,
    tdt: tdt.results, qs: qs.results.map((x) => ({ ...x, nghi: docJ(x.nghi) })), truoc: truoc.results,
    // ca đêm của ngày hôm trước (cho báo cáo ca ngày); lịch ca và số thiết lập của các tổ
    qsDemTruoc: qsDem.results.map((x) => ({ ...x, nghi: docJ(x.nghi) })),
    lich: docCfg(mau.results[0]).lich, tl: docCfg(mau.results[0]).tl,
    don: don.results, nguoi: nguoi.results, mau: docMau(mau.results[0]),
    ck: ck.results.map((x) => x.ten),
    viecTruoc: viecTruoc(bcTr.results[0]),
    bao: r ? { muc: docJ(r.data).muc || {}, viec: docViec(docJ(r.data).viec), nguon: docJ(r.data).nguon === 'tl' ? 'tl' : 'to', van_ban: r.van_ban, ts: r.ts, by_id: r.by_id, by_name: r.by_name } : null,
    suaDuoc: c.ngay >= vnDay(Date.now() - BC_SUA_NGAY * 864e5),
  });
}

/* Lưu báo cáo của một ca (lúc người soạn bấm chép / chia sẻ): các mục đã sửa, nguồn quân số và bản chữ đã gửi. Cùng
   lúc lưu phần đầu và máy móc vào mẫu để ca sau điền sẵn; dòng kiểm tra chỉ vào mẫu khi gửi kèm kt_mau = true.
   BÁO CÁO VÀ MẪU LÀ MỘT BẢN DÙNG CHUNG cho mọi người soạn, nên:
   - body.ts là lần lưu của ca này mà người soạn đang nhìn thấy (0 = chưa ai lưu). Người khác đã lưu sau đó thì TỪ CHỐI
     (409 'changed', nói rõ ai, lúc nào): máy khách tải bản mới, ghép phần đang sửa dở vào rồi mới chép lại. Bản app
     cũ không gửi ts thì ghi như trước.
   - body.dau chỉ cần mang các ô phần đầu người soạn ĐÃ SỬA, ô không gửi giữ theo mẫu đang có; body.mmtb chỉ gửi khi
     mục máy móc được sửa. Máy mở màn từ lâu không đè lại tên dự án / chỉ huy người khác vừa đổi.
   - Nội dung y như bản đang lưu thì chỉ ghi nhật ký (chép lại nhiều lần không làm mọi máy tải lại); có ghi thì tăng rev
     để máy khác đang mở báo cáo thấy bản mới. */
export async function bcPut(req, env, user) {
  const b = await readJson(req);
  const ngayCa = [String(b.ngay || ''), Number(b.ca) || 0];
  // cài đặt (giờ ca), mẫu và báo cáo đang có của ca: MỘT lượt D1
  const [stR, mauR, cuR] = await env.DB.batch([
    env.DB.prepare(SETTINGS_SQL), env.DB.prepare('SELECT data FROM bc_mau WHERE id = 1'),
    env.DB.prepare("SELECT b.data, b.van_ban, b.ts, COALESCE(u.name, '(đã xoá)') by_name FROM bao_cao_ca b LEFT JOIN users u ON u.id = b.by_id WHERE b.ngay = ? AND b.ca = ?").bind(...ngayCa),
  ]);
  const st = parseSettings(stR.results);
  const q = new URLSearchParams({ ngay: String(b.ngay || ''), ca: String(b.ca || '') });
  const c = docCa(q, st);
  if (c.ngay < vnDay(Date.now() - BC_SUA_NGAY * 864e5)) throw bad(`Chỉ lưu được báo cáo trong ${BC_SUA_NGAY} ngày gần đây`);
  const van_ban = doan(b.van_ban, 20000);
  if (!van_ban) throw bad('Báo cáo trống');
  const vao = b.muc && typeof b.muc === 'object' ? b.muc : {};
  const muc = {};
  for (const k of BC_MUC) if (typeof vao[k] === 'string') muc[k] = doan(vao[k], 8000);
  const bao = cuR.results[0] || null, biet = b.ts == null ? null : Number(b.ts) || 0;
  if (biet != null && bao && bao.ts !== biet) throw daDoi(bao);
  const cu = docMau(mauR.results[0]);
  const dau = b.dau && typeof b.dau === 'object' ? Object.fromEntries(BC_DAU.map((k) => [k, b.dau[k] == null ? cu.dau[k] : chu(b.dau[k], 120)])) : cu.dau;
  const mau = { dau, mmtb: b.mmtb != null ? chu(b.mmtb, 400) : cu.mmtb, kt: cu.kt, thu_tu: cu.thu_tu };
  if (b.kt_mau && typeof muc.s6 === 'string') mau.kt = muc.s6.split('\n').map((x) => chu(x, 200)).filter(Boolean);
  /* phần chỉnh mục 4: máy không gửi (app bản cũ) thì GIỮ phần đang lưu, không xoá trắng các dòng người khác đã chỉnh */
  const viecCu = bao ? docJ(bao.data).viec : undefined;
  const data = JSON.stringify({ muc, viec: b.viec ? docViec(b.viec) : viecCu ? docViec(viecCu) : undefined, nguon: b.nguon === 'tl' ? 'tl' : undefined });
  const mauDoi = JSON.stringify([mau.dau, mau.mmtb, mau.kt]) !== JSON.stringify([cu.dau, cu.mmtb, cu.kt]);
  if (bao && !mauDoi && bao.van_ban === van_ban && JSON.stringify(docJ(bao.data)) === data) {
    // lần chép nào cũng vào nhật ký, kể cả khi không có gì mới để lưu
    await auditStmt(env, user, 'bc_luu', { ngay: c.ngay, ca: c.ca, lai: 1 }).run();
    return json({ ok: true, ngay: c.ngay, ca: c.ca, ts: bao.ts, by_name: bao.by_name });
  }
  const ts = Math.max(Date.now(), bao ? bao.ts + 1 : 0);
  const ghi = [
    env.DB.prepare(`INSERT INTO bao_cao_ca (ngay, ca, data, van_ban, ts, by_id) VALUES (?,?,?,?,?,?)
                    ON CONFLICT(ngay, ca) DO UPDATE SET data = excluded.data, van_ban = excluded.van_ban, ts = excluded.ts, by_id = excluded.by_id`)
      .bind(c.ngay, c.ca, data, van_ban, ts, user.id),
    // ghi từng nhánh của mẫu: không đè lịch ca / số thiết lập / thứ tự tổ người khác vừa sửa
    env.DB.prepare(MAU_CO),
    ...(mauDoi ? [env.DB.prepare("UPDATE bc_mau SET data = json_set(COALESCE(data, '{}'), '$.dau', json(?), '$.mmtb', ?, '$.kt', json(?)), ts = ?, by_id = ? WHERE id = 1")
      .bind(JSON.stringify(mau.dau), mau.mmtb, JSON.stringify(mau.kt), ts, user.id)] : []),
    auditStmt(env, user, 'bc_luu', { ngay: c.ngay, ca: c.ca, kt_mau: b.kt_mau ? 1 : undefined }),
    bump(env),
  ];
  if (biet == null) await env.DB.batch(ghi);
  else {
    // chặn lần nữa ngay trong batch: giữa lượt đọc ở trên và lượt ghi vẫn có thể có người khác lưu
    const chan = guardStmt(env, 'EXISTS (SELECT 1 FROM bao_cao_ca WHERE ngay = ?1 AND ca = ?2 AND ts <> ?3)', c.ngay, c.ca, bao ? bao.ts : 0);
    try { await batchGuarded(env, chan, ghi, new HttpError(409, 'doi', 'doi')); }
    catch (e) {
      if (!(e instanceof HttpError) || e.code !== 'doi') throw e;
      throw daDoi(await env.DB.prepare("SELECT b.ts, COALESCE(u.name, '(đã xoá)') by_name FROM bao_cao_ca b LEFT JOIN users u ON u.id = b.by_id WHERE b.ngay = ? AND b.ca = ?").bind(c.ngay, c.ca).first());
    }
  }
  return json({ ok: true, ngay: c.ngay, ca: c.ca, ts, by_name: user.name });
}
// lời từ chối khi báo cáo của ca đã có người khác lưu sau bản người soạn đang nhìn
const daDoi = (r) => {
  const m = r ? Math.floor(((r.ts + 7 * 3600e3) % 864e5) / 60e3) : 0;
  return new HttpError(409, `${(r && r.by_name) || 'Người khác'} vừa chép báo cáo ca này${r ? ` lúc ${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : ''}. Màn hình đã tải bản đó, phần bạn đang sửa vẫn giữ. Soát lại rồi bấm chép lần nữa.`, 'changed');
};
