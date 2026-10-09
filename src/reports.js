// Xem lại ngày cũ, báo cáo theo kỳ, tệp CSV ngày, nhật ký và thống kê lượng dùng.
import { DAY_RE, bad, daysBetween, fmtDay, json, vnDay } from './core.js';
import { CSV_HEAD, DUYET_JOIN, DUYET_NAME, UNAME, csvDec, csvQty, csvRow, csvUnit, isCuon } from './helpers.js';
import { EFF_BY_BASELINE, MV_CHUA_DEM } from './counts.js';

/* ========================= XEM NGÀY CŨ ========================= */

export async function dayView(env, url) {
  const day = url.searchParams.get('date') || '';
  if (!DAY_RE.test(day) || day > vnDay()) throw bad('Ngày không hợp lệ');
  const db = env.DB;
  const [closeR, cntR, baseR, prevR, rcR, sumR, mvR, repR, lastR] = await db.batch([
    // exc_json: những việc còn treo LÚC CHỐT (khu chưa báo, thiếu lần đếm...), để xem lại biết ngày đó chốt kèm gì
    db.prepare('SELECT dc.day, dc.ts, dc.note, dc.span, dc.exc_json, u.name uname FROM day_close dc LEFT JOIN users u ON u.id = dc.closed_by WHERE dc.day = ?').bind(day),
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
    db.prepare('SELECT phi_id, ton, nhap, dung, span, dc, xuat, vay, kg FROM daily_summary WHERE day = ?').bind(day),
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
// kg/cây của dòng tổng hợp: lấy số lưu LÚC CHỐT, chỉ khi thiếu mới lấy số hiện tại của phi
const KGD = 'COALESCE(d.kg, p.kg_per_cay)';
export async function report(env, url) {
  const today = vnDay();
  let from = url.searchParams.get('from') || today.slice(0, 8) + '01';
  const to = url.searchParams.get('to') || today;
  /* from=dau: từ ngày chốt ĐẦU TIÊN của hệ thống — bản sao CSV "cả kỳ" trước khi xoá sạch. Trước
     đây nút đó gửi từ đầu tháng, tức bản sao được khuyên tải trước khi xoá lại thiếu mọi tháng cũ. */
  const tuDau = from === 'dau';
  if (tuDau) {
    const f0 = await env.DB.prepare('SELECT MIN(day) d FROM daily_summary').first();
    from = (f0 && f0.d) || today;
  }
  if (!DAY_RE.test(from) || !DAY_RE.test(to) || from > to) throw bad('Khoảng ngày không hợp lệ');
  // xem trên màn hình thì tối đa 1 năm; bản sao "từ ngày đầu" thì lấy đủ, kể cả nhiều năm
  if (!tuDau && daysBetween(from, to) > 366) throw bad('Chỉ xem tối đa 1 năm mỗi lần');
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
  const [phiR, openR, sumR, closeR, daysR, kkR, resetR] = await db.batch([
    db.prepare('SELECT id, kg_per_cay, bo_size, unit FROM phi ORDER BY sort'),
    /* Số tấn nhân với kg/cây LÚC CHỐT của từng ngày (d.kg), không phải kg/cây hiện tại: sửa kg/cây
       hôm nay không được viết lại số tấn của ngày đã khoá. Thiếu kg (không thể có sau migration 17,
       nhưng phòng hờ) thì mới lấy kg hiện tại. */
    db.prepare(`SELECT d.day, d.phi_id, d.ton, d.ton * ${KGD} ton_kg FROM daily_summary d JOIN phi p ON p.id = d.phi_id WHERE d.day = ?`).bind(baseDay),
    db.prepare(`SELECT d.phi_id, SUM(d.nhap) nhap, SUM(d.dung) dung, SUM(d.dc) dc, SUM(d.xuat) xuat, SUM(d.vay) vay,
                  SUM(d.nhap * ${KGD}) nhap_kg, SUM(COALESCE(d.dung, 0) * ${KGD}) dung_kg, SUM(d.dc * ${KGD}) dc_kg,
                  SUM(d.xuat * ${KGD}) xuat_kg, SUM(d.vay * ${KGD}) vay_kg
                FROM daily_summary d JOIN phi p ON p.id = d.phi_id WHERE d.day > ? AND d.day <= ? GROUP BY d.phi_id`).bind(baseDay, to),
    db.prepare(`SELECT d.day, d.phi_id, d.ton, d.ton * ${KGD} ton_kg FROM daily_summary d JOIN phi p ON p.id = d.phi_id
                WHERE d.day = (SELECT MAX(day) FROM daily_summary WHERE day >= ? AND day <= ?)`).bind(from, to),
    db.prepare(
      `SELECT d.day, MAX(d.span) span, SUM(d.nhap * ${KGD}) nhap_kg, SUM(COALESCE(d.dung, 0) * ${KGD}) dung_kg, SUM(d.ton * ${KGD}) ton_kg, SUM(d.dc * ${KGD}) dc_kg, SUM(d.xuat * ${KGD}) xuat_kg, SUM(d.vay * ${KGD}) vay_kg
       FROM daily_summary d JOIN phi p ON p.id = d.phi_id WHERE d.day > ? AND d.day <= ? GROUP BY d.day ORDER BY d.day`
    ).bind(baseDay, to),
    /* Ngày ĐẶT TỒN VỀ 0 trong kỳ: tồn ngày đó ghi 0 mà cột Dùng để trống (cố ý, không thì chênh lệch
       thành một cú "đã dùng" khổng lồ, xem resetData). Phần bị đặt về 0 = tồn ngày chốt trước + mọi
       thứ vào/ra trong ngày đó, ghi âm. Không có cột này thì Tồn đầu + Nhập − Dùng lệch khỏi Tồn cuối
       đúng bằng số đó và bảng không nói vì sao. Tính thẳng từ ngày đặt lại chứ không lấy hiệu số của
       đẳng thức: lấy hiệu số là cột này nuốt luôn mọi chỗ lệch khác, đúng thứ cần lộ ra. */
    db.prepare(
      `SELECT d.phi_id, -SUM(COALESCE(pv.ton, 0) + d.nhap + d.dc + d.vay) kk,
         -SUM(COALESCE(pv.ton * COALESCE(pv.kg, p.kg_per_cay), 0) + (d.nhap + d.dc + d.vay) * ${KGD}) kk_kg
       FROM daily_summary d JOIN day_close z ON z.day = d.day AND z.kind = 'reset' JOIN phi p ON p.id = d.phi_id
       LEFT JOIN daily_summary pv ON pv.phi_id = d.phi_id AND pv.day = (SELECT MAX(day) FROM daily_summary WHERE day < d.day)
       WHERE d.day > ? AND d.day <= ? GROUP BY d.phi_id`
    ).bind(baseDay, to),
    db.prepare("SELECT day FROM day_close WHERE kind = 'reset' AND day > ? AND day <= ? ORDER BY day").bind(baseDay, to),
  ]);
  const kkBy = Object.fromEntries(kkR.results.map((r) => [r.phi_id, r]));
  const by = (rs, f) => Object.fromEntries(rs.map((r) => [r.phi_id, r[f]]));
  const open = by(openR.results, 'ton'), close = by(closeR.results, 'ton');
  const nhap = by(sumR.results, 'nhap'), dung = by(sumR.results, 'dung'), dcs = by(sumR.results, 'dc');
  // xuat: phần lượng dùng CÓ PHIẾU. Nằm trong 'dung' chứ không cộng thêm, nên không phá đẳng thức.
  const xus = by(sumR.results, 'xuat'), vays = by(sumR.results, 'vay');
  const hasOpen = openR.results.length > 0, hasClose = closeR.results.length > 0;
  const kgOpen = by(openR.results, 'ton_kg'), kgClose = by(closeR.results, 'ton_kg');
  const kgSum = Object.fromEntries(sumR.results.map((r) => [r.phi_id, r]));
  const rows = phiR.results.map((p) => {
    const o = hasOpen ? open[p.id] || 0 : null;
    const c = hasClose ? close[p.id] || 0 : o;
    const ks = kgSum[p.id] || {};
    /* *_kg: số tấn (theo kg) tính theo kg/cây LÚC CHỐT của từng ngày. Máy khách và tệp CSV cộng
       các số này, không tự nhân lại với kg/cây hiện tại. */
    const cKg = hasClose ? kgClose[p.id] || 0 : hasOpen ? kgOpen[p.id] || 0 : null;
    return {
      phi: p.id, kg: p.kg_per_cay, dau: o, nhap: nhap[p.id] || 0, dc: dcs[p.id] || 0, xuat: xus[p.id] || 0, vay: vays[p.id] || 0,
      dung: dung[p.id] == null ? 0 : dung[p.id], cuoi: c,
      dau_kg: hasOpen ? kgOpen[p.id] || 0 : null, nhap_kg: ks.nhap_kg || 0, dc_kg: ks.dc_kg || 0, xuat_kg: ks.xuat_kg || 0,
      vay_kg: ks.vay_kg || 0, dung_kg: ks.dung_kg || 0, cuoi_kg: cKg,
      // kk: phần bị đặt về 0 (âm). Đẳng thức: đầu + nhập + điều chỉnh + vay mượn + kk − dùng = cuối
      kk: (kkBy[p.id] || {}).kk || 0, kk_kg: (kkBy[p.id] || {}).kk_kg || 0,
    };
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
    // cột "Vay mượn": thép ra/vào theo sổ vay mượn — không phải nhập, không phải dùng
    hasVay: rows.some((r) => r.vay),
    // cột "Đặt về 0": chỉ bày khi kỳ có ngày đặt tồn về 0 làm mất số thật
    hasKk: rows.some((r) => r.kk), resetDays: resetR.results.map((r) => r.day),
  };
  if (url.searchParams.get('format') !== 'csv') return json(out);

  const esc = (x) => '"' + String(x).replace(/"/g, '""') + '"';
  const t = (kg) => (kg == null ? '' : csvDec(kg / 1000, 3));
  const pBy = Object.fromEntries(phiR.results.map((p) => [p.id, p]));
  const lines = [
    esc(`Báo cáo Nhập - Dùng - Tồn từ ${fmtDay(from)} đến ${fmtDay(to)} (${out.closedDays} ngày đã chốt)`),
    csvRow(['Phi', 'Đơn vị', 'Tồn đầu', 'Nhập', 'Điều chỉnh', 'Vay mượn', 'Đặt về 0', 'Dùng', 'Có phiếu xuất', 'Tồn cuối', 'Tồn đầu (tấn)', 'Nhập (tấn)', 'Điều chỉnh (tấn)', 'Vay mượn (tấn)', 'Đặt về 0 (tấn)', 'Dùng (tấn)', 'Có phiếu xuất (tấn)', 'Tồn cuối (tấn)'].map(esc)),
  ];
  const tot = { dau: 0, nhap: 0, dc: 0, vay: 0, kk: 0, xuat: 0, dung: 0, cuoi: 0 };
  for (const r of rows) {
    const p = pBy[r.phi], n = (x) => (x == null ? '' : csvQty(x, p));
    lines.push(csvRow([esc(r.phi), esc(csvUnit(p)), n(r.dau), n(r.nhap), n(r.dc), n(r.vay), n(r.kk), n(r.dung), n(r.xuat), n(r.cuoi),
      t(r.dau_kg), t(r.nhap_kg), t(r.dc_kg), t(r.vay_kg), t(r.kk_kg), t(r.dung_kg), t(r.xuat_kg), t(r.cuoi_kg)]));
    tot.dau += r.dau_kg || 0; tot.nhap += r.nhap_kg; tot.dc += r.dc_kg; tot.vay += r.vay_kg; tot.kk += r.kk_kg;
    tot.xuat += r.xuat_kg; tot.dung += r.dung_kg; tot.cuoi += r.cuoi_kg || 0;
  }
  /* Đúng 18 ô, khớp từng cột với dòng tiêu đề: thiếu một ô rỗng là cả khối số tấn tụt sang trái một
     cột và Excel đọc "tồn đầu" thành "tồn cuối" — sai ngay trên tệp mang đi đối chiếu. Thêm một cột là
     thêm MỘT ô rỗng ở đây nữa: 9 ô rỗng (đứng sau nhãn TỔNG) rồi 8 số tấn, đếm lại chứ đừng đoán. */
  const totCells = ['', '', '', '', '', '', '', '', ''].concat([tot.dau, tot.nhap, tot.dc, tot.vay, tot.kk, tot.dung, tot.xuat, tot.cuoi].map((x) => csvDec(x / 1000, 3)));
  lines.push(csvRow([esc('TỔNG (tấn)'), ...totCells]));
  lines.push('', csvRow(['Ngày', 'Số ngày gộp', 'Nhập (tấn)', 'Điều chỉnh (tấn)', 'Vay mượn (tấn)', 'Dùng (tấn)', 'Có phiếu xuất (tấn)', 'Tồn cuối ngày (tấn)'].map(esc)));
  for (const d of out.days) lines.push(csvRow([esc(fmtDay(d.day)), d.span, csvDec(d.nhap_kg / 1000, 3), csvDec((d.dc_kg || 0) / 1000, 3), csvDec((d.vay_kg || 0) / 1000, 3), csvDec(d.dung_kg / 1000, 3), csvDec((d.xuat_kg || 0) / 1000, 3), csvDec(d.ton_kg / 1000, 3)]));
  return new Response(CSV_HEAD + lines.join('\r\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="bao-cao-${from}-${to}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}

/* Nhật ký: trang 300 dòng, mới nhất trước. Lọc được theo NGÀY (giờ Việt Nam) và theo CHỮ (tên
   người làm hoặc nội dung: tên khu, phi, đối tác, nơi xuất...), và tải tiếp trang cũ hơn bằng
   before = id nhỏ nhất của trang trước. Không lọc thì "tháng này xuất cho công trình nào" chỉ tra
   được nếu nó nằm trong 300 dòng gần nhất. */
export async function auditList(env, url) {
  const q = url.searchParams;
  const limit = Math.min(Number(q.get('limit')) || 150, 500);
  const where = [], bind = [];
  const before = Number(q.get('before'));
  if (before > 0) { where.push('id < ?'); bind.push(before); }
  const ngay = q.get('ngay') || '';
  if (DAY_RE.test(ngay)) {
    const t0 = Date.parse(ngay + 'T00:00:00+07:00');
    where.push('ts >= ? AND ts < ?'); bind.push(t0, t0 + 86400e3);
  }
  const chu = String(q.get('q') || '').trim().slice(0, 60);
  if (chu) {
    const like = '%' + chu.replace(/[\\%_]/g, (c) => '\\' + c) + '%';
    where.push("(user_name LIKE ? ESCAPE '\\' OR detail LIKE ? ESCAPE '\\')"); bind.push(like, like);
  }
  const { results } = await env.DB.prepare(
    `SELECT id, ts, user_name, action, detail FROM audit ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT ?`
  ).bind(...bind, limit).all();
  return json({ items: results, more: results.length === limit });
}

export async function usage(env, url) {
  const days = Math.min(Number(url.searchParams.get('days')) || 30, 180);
  const { results } = await env.DB.prepare('SELECT day, used_json, span FROM day_close ORDER BY day DESC LIMIT ?').bind(days).all();
  /* kg: kg/cây LÚC CHỐT của từng ngày (số tấn không trôi theo kg/cây hiện tại); xuat: phần dùng
     có phiếu xuất, để Thống kê tách được "có phiếu" và "không rõ" như màn Duyệt và báo cáo kỳ. */
  const sumR = results.length ? await env.DB.prepare(`SELECT d.day, d.phi_id, d.xuat, ${KGD} kg FROM daily_summary d JOIN phi p ON p.id = d.phi_id
    WHERE d.day >= ? AND d.day <= ?`).bind(results[results.length - 1].day, results[0].day).all() : { results: [] };
  const kgBy = {}, xBy = {};
  sumR.results.forEach((r) => { (kgBy[r.day] = kgBy[r.day] || {})[r.phi_id] = r.kg; if (r.xuat) (xBy[r.day] = xBy[r.day] || {})[r.phi_id] = r.xuat; });
  return json({ items: results.map((r) => { let used = {}; try { used = JSON.parse(r.used_json || '{}'); } catch (e) { /* bỏ qua */ } return { day: r.day, span: r.span || 1, used, kg: kgBy[r.day] || {}, xuat: xBy[r.day] || {} }; }) });
}

/* ========================= CHẤM CÔNG BÁO CÁO =========================
   Ai báo, ai không báo, khu nào thiếu buổi nào — trên các ngày ĐÃ CHỐT (bảng bao_cao_ngay ghi lúc
   sổ tự chốt; hôm nay chưa chốt nên chưa tính). Mỗi buổi khu phải báo mà không ai báo là một buổi
   THIẾU, tính cho MỌI người phụ trách khu đó lúc chốt (cùng phụ trách thì cùng chịu, có ghi tên người
   cùng phụ trách). Khu không có ai phụ trách thì chỉ hiện ở phần khu, không tính cho ai. */
export async function chamCong(env, url) {
  const today = vnDay();
  const to = DAY_RE.test(url.searchParams.get('to') || '') ? url.searchParams.get('to') : today;
  const from = DAY_RE.test(url.searchParams.get('from') || '') ? url.searchParams.get('from') : to;
  if (from > to) throw bad('Khoảng ngày không hợp lệ');
  const [ngR, userR, khuR] = await env.DB.batch([
    env.DB.prepare('SELECT day, khu_id, phu_trach, khung, phai, bao, thieu FROM bao_cao_ngay WHERE day >= ? AND day <= ? ORDER BY day').bind(from, to),
    env.DB.prepare('SELECT id, name, role, deleted FROM users'),
    env.DB.prepare('SELECT id, name FROM khu ORDER BY sort, id'),
  ]);
  const P = (x) => { try { return JSON.parse(x || '[]'); } catch (e) { return []; } };
  const uName = Object.fromEntries(userR.results.map((u) => [u.id, u.name + (u.deleted ? ' (đã xoá)' : '')]));
  const ng = {}, kh = {};
  const nguoi = (id) => (ng[id] = ng[id] || { id, name: uName[id] || '(đã xoá)', lan: 0, ngay: new Set(), phai: 0, tu: 0, thay: 0, thieu: [] });
  for (const r of ngR.results) {
    const pt = P(r.phu_trach), khung = P(r.khung), bao = P(r.bao), thieu = P(r.thieu);
    // ai báo: mọi lần gửi, kể cả báo khu không phải của mình (báo thay)
    bao.forEach((b) => { const n = nguoi(b.u); n.lan++; n.ngay.add(r.day); });
    const k = (kh[r.khu_id] = kh[r.khu_id] || { khu: r.khu_id, phai: 0, thieu: [], khongPt: 0 });
    k.phai += r.phai;
    if (r.phai && !pt.length) k.khongPt++;
    if (thieu.length) k.thieu.push({ day: r.day, buoi: thieu.map((i) => khung[i] || '?'), pt: pt.map((id) => uName[id] || '(đã xoá)') });
    if (!r.phai) continue;
    // ai không báo: tính trên khu người đó phụ trách
    for (const id of pt) {
      const n = nguoi(id);
      n.phai += r.phai;
      khung.forEach((_, i) => {
        if (thieu.includes(i)) return;
        if (bao.some((b) => b.i === i && b.u === id)) n.tu++;
        else n.thay++;
      });
      if (thieu.length) {
        n.thieu.push({ day: r.day, khu: r.khu_id, buoi: thieu.map((i) => khung[i] || '?'),
          cung: pt.filter((x) => x !== id).map((x) => uName[x] || '(đã xoá)') });
      }
    }
  }
  const khuName = Object.fromEntries(khuR.results.map((k) => [k.id, k.name]));
  return json({
    from, to, today, ngay: new Set(ngR.results.map((r) => r.day)).size,
    nguoi: Object.values(ng).map((n) => ({ ...n, ngay: n.ngay.size, soThieu: n.thieu.reduce((a, t) => a + t.buoi.length, 0) }))
      .sort((a, b) => b.soThieu - a.soThieu || a.name.localeCompare(b.name)),
    khu: Object.values(kh).map((k) => ({ ...k, name: khuName[k.khu] || k.khu, soThieu: k.thieu.reduce((a, t) => a + t.buoi.length, 0) }))
      .sort((a, b) => b.soThieu - a.soThieu),
  });
}

export async function exportCsv(env, url) {
  const day = DAY_RE.test(url.searchParams.get('date') || '') ? url.searchParams.get('date') : vnDay();
  const [phiR, khuR, cntR, baseR, mvR, kgR] = await env.DB.batch([
    env.DB.prepare('SELECT id, kg_per_cay, active, bo_size, unit FROM phi ORDER BY sort'),
    env.DB.prepare('SELECT id, name, active FROM khu ORDER BY sort, id'),
    env.DB.prepare(EFF_BY_BASELINE).bind(day),
    env.DB.prepare('SELECT khu_id, phi_id, v FROM baseline WHERE day = (SELECT MAX(day) FROM baseline WHERE day <= ?)').bind(day),
    env.DB.prepare(MV_CHUA_DEM).bind(day),
    // ngày đã chốt: số tấn theo kg/cây LÚC CHỐT, khớp với báo cáo kỳ và màn Xem lại ngày cũ
    env.DB.prepare('SELECT phi_id, kg FROM daily_summary WHERE day = ? AND kg IS NOT NULL').bind(day),
  ]);
  const kgLuc = Object.fromEntries(kgR.results.map((r) => [r.phi_id, r.kg]));
  const kgOf = (p) => (kgLuc[p.id] != null ? kgLuc[p.id] : p.kg_per_cay);
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
      kg += v * kgOf(p); colV[i] += v;
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
