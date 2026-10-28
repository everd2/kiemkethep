// Sao lưu tự động hằng tuần lên R2 (cùng kho ảnh biên bản), và danh sách / tải về các bản đã lưu.
import { HttpError, SYSTEM, json, vnDay } from './core.js';
import { auditStmt } from './helpers.js';
import { BK_LOG, BK_LOG_MAX, BK_STATE } from './data.js';
import { firstAdminId } from './admin.js';

/* ========================= SAO LƯU TỰ ĐỘNG =========================
   Trước đây sao lưu chỉ có nút tải tay: quên tải là không có bản nào, mà Cloudflare chỉ giữ lịch sử khôi phục có hạn.
   - Mỗi tuần một bản, chạy trong lịch mỗi giờ (worker.scheduled) lúc 2h sáng giờ Việt Nam nếu bản mới nhất đã cũ hơn ~6,5 ngày.
     Nằm trong R2 `ANH` dưới thư mục saoluu/, giữ SL_GIU bản mới nhất, bản cũ hơn tự xoá.
   - Bản "Sao lưu ngay" (bấm tay) mang đuôi _tay trong tên và tính RIÊNG: giữ SL_GIU_TAY bản tay mới nhất, không đẩy bản tự động
     nào ra, và không dời lịch tuần. Trước đây cả hai chung một hàng 8 bản: bấm tay vài lần là đẩy hết bản hằng tuần (đường lùi
     xa nhất), còn một bản tay mới làm lịch tuần bỏ qua — bấm tay mỗi 6 ngày là không bao giờ có bản tự động. Bản cũ không có
     đuôi (từ trước khi tách) coi là bản tự động: đa số đúng là do lịch lưu, và giữ thừa vài bản cũ an toàn hơn xoá nhầm.
   - Nội dung y hệt tệp "Tải bản sao toàn bộ" (cùng hàm taoBanSao), nên tải về là nạp lại được bằng đúng chỗ nạp sẵn có.
   - Đọc mọi bảng trong MỘT lượt gọi D1 (batch): lần chạy lịch mỗi giờ của gói miễn phí chỉ được ~50 lượt, còn phải tự chốt sổ và
     chép quân số; đọc từng bảng một (~44 lượt) là vượt.
   - Xem / tải / sao lưu ngay: chỉ admin đầu tiên (như tải bản sao tay). */
export const SL_GIU = 8;
export const SL_GIU_TAY = 5;
const SL_THU_MUC = 'saoluu/';
const TUAN_MS = 6.5 * 864e5;

export async function taoBanSao(env, boi) {
  const stmts = [];
  for (const t of BK_STATE) stmts.push(env.DB.prepare(`SELECT * FROM ${t}`));
  for (const t of BK_LOG) {
    stmts.push(env.DB.prepare(`SELECT COUNT(*) n FROM ${t}`));
    stmts.push(env.DB.prepare(`SELECT * FROM ${t} ORDER BY id DESC LIMIT ${BK_LOG_MAX}`));
  }
  stmts.push(env.DB.prepare("SELECT value FROM meta WHERE key = 'schema'"));
  const res = await env.DB.batch(stmts);
  const out = {}, cut = {};
  BK_STATE.forEach((t, i) => { out[t] = res[i].results; });
  BK_LOG.forEach((t, j) => {
    const n = res[BK_STATE.length + 2 * j].results[0].n, r = res[BK_STATE.length + 2 * j + 1].results;
    out[t] = r.slice().reverse();
    if (n > BK_LOG_MAX) cut[t] = n; // nói rõ đã cắt, đừng để người dùng tưởng là đủ
  });
  const sc = res[res.length - 1].results[0];
  return { app: 'kho-thep', ban: 1, schema: sc ? sc.value : 0, luc: Date.now(), ngay: vnDay(), boi, cat: cut, bang: out };
}

async function dsBanSao(env) {
  if (!env.ANH || typeof env.ANH.list !== 'function') return [];
  const r = await env.ANH.list({ prefix: SL_THU_MUC });
  // xếp theo mốc giờ ghi trong tên (ms lúc lưu), mới trước; tay: bản "Sao lưu ngay" (đuôi _tay), còn lại là bản tự động
  return (r.objects || []).map((o) => {
    const ten = o.key.slice(SL_THU_MUC.length), m = ten.match(/_(\d+)(_tay)?\.json$/);
    return { ten, co: o.size, luc: o.uploaded ? new Date(o.uploaded).getTime() : 0, tay: !!(m && m[2]), ms: m ? Number(m[1]) : 0 };
  }).sort((a, z) => z.ms - a.ms || (a.ten < z.ten ? 1 : -1)).map(({ ms, ...x }) => x);
}
async function luuLenKho(env, user, tay = false) {
  const body = await taoBanSao(env, user.name);
  const ten = `${body.ngay}_${body.luc}${tay ? '_tay' : ''}.json`;
  const chu = JSON.stringify(body);
  await env.ANH.put(SL_THU_MUC + ten, chu, { httpMetadata: { contentType: 'application/json; charset=utf-8' } });
  // giữ SL_GIU bản tự động / SL_GIU_TAY bản tay mới nhất: mỗi loại chỉ xoá bản cũ của RIÊNG loại đó
  const ds = (await dsBanSao(env)).filter((x) => x.tay === tay);
  for (const x of ds.slice(tay ? SL_GIU_TAY : SL_GIU)) await env.ANH.delete(SL_THU_MUC + x.ten);
  await auditStmt(env, user, 'backup_kho', { ten, co: chu.length, tay: tay || undefined, dong: Object.fromEntries(Object.keys(body.bang).map((t) => [t, body.bang[t].length])) }).run();
  return { ten, co: chu.length };
}

/* Lịch mỗi giờ: 2h sáng giờ Việt Nam, bản mới nhất cũ hơn ~6,5 ngày (hoặc chưa có bản nào) thì lưu một bản. Lỗi không chặn việc khác. */
export async function saoLuuTuDong(env, now = Date.now()) {
  if (!env.ANH || typeof env.ANH.list !== 'function') return null;
  const gio = Math.floor(((now + 7 * 3600e3) % 864e5) / 3600e3);
  if (gio !== 2) return null;
  // chỉ bản TỰ ĐỘNG tính lịch tuần: bản bấm tay không dời lịch (xem đầu tệp)
  const ds = (await dsBanSao(env)).filter((x) => !x.tay);
  if (ds.length && now - ds[0].luc < TUAN_MS) return null;
  try { return await luuLenKho(env, SYSTEM); } catch (e) {
    /* Hỏng thì ghi vào nhật ký (mục "Cần chú ý"), không chỉ console: không ai đọc log máy chủ, và giờ sau lịch thử lại vì vẫn
       chưa có bản mới. Ghi nhật ký cũng hỏng thì thôi. */
    await auditStmt(env, SYSTEM, 'backup_kho_loi', { loi: String((e && e.message) || e).slice(0, 200) }).run().catch(() => {});
    throw e;
  }
}

const chiAdminDau = async (env, user) => {
  if (user.id !== await firstAdminId(env)) throw new HttpError(403, 'Chỉ admin đầu tiên (người thiết lập hệ thống) mới xem được bản sao');
};
export async function saoLuuDs(env, user) {
  await chiAdminDau(env, user);
  return json({ ds: await dsBanSao(env), giu: SL_GIU, giu_tay: SL_GIU_TAY });
}
export async function saoLuuNgay(env, user) {
  await chiAdminDau(env, user);
  if (!env.ANH) throw new HttpError(503, 'Chưa cấu hình kho lưu trữ');
  return json({ ok: true, ...(await luuLenKho(env, user, true)) });
}
export async function saoLuuTai(env, user, ten) {
  await chiAdminDau(env, user);
  if (!/^\d{4}-\d{2}-\d{2}_\d+(_tay)?\.json$/.test(ten)) throw new HttpError(404, 'Không tìm thấy bản sao');
  const o = await env.ANH.get(SL_THU_MUC + ten);
  if (!o) throw new HttpError(404, 'Không tìm thấy bản sao');
  await auditStmt(env, user, 'backup', { ngay: ten.slice(0, 10), tu_kho: ten }).run();
  return new Response(o.body, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="kho-thep_sao-luu_${ten}"`, 'Cache-Control': 'no-store' } });
}
