// Phiếu nhập kho, chuyển khu, xuất kho và điều chỉnh tồn.
import { HttpError, bad, json, rand, vnDay } from './core.js';
import { IS_CLOSED, auditStmt, batchGuarded, bump, closedErr, guardStmt, intIn, qtyWord, readJson,
  unitWord } from './helpers.js';
import { EFF_SELECT, J } from './counts.js';

/* ========================= NHẬP KHO ========================= */

// Đọc danh sách dòng { phi, qty } của một phiếu; gộp các dòng trùng phi
export function parseLines(b, ctx) {
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

export async function receiptCtx(env, khuIds) {
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
export async function stockOf(env, day, khuId, phis) {
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
export async function writeReceipt(env, user, ctx, rows, kind, note, audit) {
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
export async function checkTransferStock(env, day, lines, opt) {
  const out = lines.filter((x) => x.qty < 0);
  if (!out.length) return;
  const o = opt || {};
  const dc = o.kind === 'dc';
  const dau = o.duyet === false ? '' : 'Không duyệt được: ';
  const viec = { dc: 'điều chỉnh giảm', xuat: 'phiếu xuất', vay: 'phiếu vay mượn' }[o.kind] || 'phiếu chuyển';
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
export async function duyetReceipt(env, user, id) {
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
  await checkTransferStock(env, day, ['chuyen', 'dc', 'xuat', 'vay'].includes(rk) ? list : [], { kind: rk });
  const ts = Date.now();
  await batchGuarded(env, guardStmt(env, IS_CLOSED, day), [
    r.grp
      ? env.DB.prepare('UPDATE receipts SET duyet_day = ?, duyet_ts = ?, duyet_by = ?, duyet_name = ? WHERE grp = ? AND voided = 0 AND duyet_day IS NULL')
        .bind(day, ts, user.id, user.name, r.grp)
      : env.DB.prepare('UPDATE receipts SET duyet_day = ?, duyet_ts = ?, duyet_by = ?, duyet_name = ? WHERE id = ?')
        .bind(day, ts, user.id, user.name, id),
    // phiếu kho của sổ vay mượn: duyệt phiếu là duyệt luôn lần ghi sổ đi kèm (cùng grp)
    ...(rk === 'vay' && r.grp ? [env.DB.prepare('UPDATE loans SET duyet_ts = ?, duyet_by = ?, duyet_name = ? WHERE grp = ? AND voided = 0 AND duyet_ts IS NULL')
      .bind(ts, user.id, user.name, r.grp)] : []),
    auditStmt(env, user, 'receipt_duyet', { id, grp: r.grp, kind: r.kind || 'nhap', day: r.day, duyet_day: day,
      lines: list.map((x) => ({ phi: x.phi_id, khu: x.khu_id, qty: x.qty })) }),
    bump(env),
  ], closedErr('Ngày hôm nay đã chốt, không duyệt được phiếu'));
  return json({ ok: true, duyet_day: day });
}

export async function postReceipt(req, env, user) {
  const b = await readJson(req);
  const khuId = String(b.khu || '');
  const ctx = await receiptCtx(env, [khuId]);
  const lines = parseLines(b, ctx);
  const note = String(b.note || '').trim().slice(0, 200);
  return writeReceipt(env, user, ctx, lines.map((l) => ({ ...l, khu: khuId })), 'nhap', note, { khu: khuId, lines });
}

// Chuyển khu: một dòng âm ở khu đi, một dòng dương ở khu đến. Tổng toàn bãi không đổi nên lượng dùng không bị ảnh hưởng,
// nhưng số "dự kiến" của từng khu và cảnh báo khu biến động đúng hơn.
export async function postTransfer(req, env, user) {
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
export const DC_REASONS = {
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
export const DC_BIG_KG = 20000;
export const DC_WORD = 'DONG Y';

/* PHIẾU XUẤT — tự nguyện, không bắt buộc.
   Nguyên tắc "không ai phải nhập phiếu xuất" giữ nguyên: lượng dùng VẪN suy ra như cũ từ
   tồn cũ + nhập − đếm. Phiếu xuất không thay phép tính đó, nó chỉ GIẢI THÍCH được bao nhiêu
   phần trong đó. Ghi được bao nhiêu thì phần "không rõ" co lại bấy nhiêu, và chính phần không rõ
   mới là con số đáng đi hỏi. Không ghi gì thì app chạy y như trước.

   Vì sao vẫn đi qua duyệt như mọi phiếu: một phiếu xuất làm số dự kiến của khu tụt xuống, tức
   nó đổi cái thước mà người duyệt dùng để soi khu đó. Thứ gì đổi được thước thì phải có người
   duyệt, không thì tự ghi phiếu xuất là tự xoá dấu vết hụt thép. */
export async function postXuat(req, env, user) {
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

export async function postAdjust(req, env, user) {
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
export async function voidReceipt(env, user, id) {
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
    // phiếu kho của sổ vay mượn: huỷ phiếu là huỷ luôn lần ghi sổ đi kèm, không để sổ và kho lệch nhau
    ...(r.kind === 'vay' && r.grp ? [env.DB.prepare('UPDATE loans SET voided = 1, voided_ts = ? WHERE grp = ? AND voided = 0').bind(Date.now(), r.grp)] : []),
    auditStmt(env, user, pending ? 'receipt_reject' : 'receipt_void', { id, kind: r.kind || 'nhap',
      lines: rows.map((x) => ({ phi: x.phi_id, khu: x.khu_id, qty: x.qty })) }),
    bump(env),
  ], closedErr(pending ? 'Ngày hôm nay đã chốt' : 'Ngày duyệt phiếu đã chốt, không hủy được'));
  return json({ ok: true, pending });
}
