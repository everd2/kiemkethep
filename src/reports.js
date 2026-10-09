// Xem lại ngày cũ, báo cáo theo kỳ và tệp CSV.
import { DAY_RE, bad, daysBetween, fmtDay, json, vnDay } from './core.js';
import { CSV_HEAD, DUYET_JOIN, DUYET_NAME, UNAME, csvDec, csvQty, csvRow, csvUnit } from './helpers.js';
import { MV_CHUA_DEM } from './counts.js';
import { closeDay } from './review.js';

/* ========================= XEM NGÀY CŨ ========================= */

export async function dayView(env, url) {
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
export async function report(env, url) {
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
