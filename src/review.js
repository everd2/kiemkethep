// Màn Duyệt: tính tồn, lượng dùng, cảnh báo; duyệt khu, chốt và mở lại ngày; việc tự động 23:50.
import { DAY_RE, HIGH_KG, HttpError, KHU_DOWN_KG, KHU_DOWN_PCT, KHU_UP_KG, MIN_RATE_DAYS, NEG_KG,
  PEAK_K, RATE_K, SYSTEM, bad, daysBetween, fmtDay, json, vnDay } from './core.js';
import { SLOT_LATE_MS, slotDefs, slotOf, slotsDue } from './slots.js';
import { RATE_SQL } from './db.js';
import { DUYET_JOIN, DUYET_NAME, IS_CLOSED, SETTINGS_SQL, UNAME, auditStmt, batchGuarded, bump,
  closedErr, guardStmt, parseSettings, readJson } from './helpers.js';
import { EFF_JOIN, EFF_SELECT, J, KHU_X_PHI } from './counts.js';
import { checkTransferStock } from './phieu.js';
import { firstAdminId } from './admin.js';

/* ========================= DUYỆT / CHỐT NGÀY =========================
   Một quy tắc duy nhất: chưa duyệt thì không vào tồn. Màn Duyệt vì thế không còn là màn
   "cảnh báo" mà là màn LÀM VIỆC: với từng khu nó bày số dự kiến đặt cạnh số khu báo và phần
   lệch, rồi để người duyệt quyết định. Lệch to hay nhỏ chỉ đổi màu chữ, KHÔNG đổi việc khu có
   duyệt được hay không — mọi khu đã báo đều duyệt được, riêng từng khu, không liên quan khu
   khác. Nhờ vậy biến mất cả ba cơ chế cũ: dấu số liệu (sig), hai loại cảnh báo khu_up/khu_down,
   và phép tính "nhập muộn" dựa trên giờ nhập/giờ hủy phiếu. */

// tên người duyệt gần nhất của một khu (lấy ở ô có duyet_ts lớn nhất)
export function lastDuyetBy(subRows, khuId) {
  let best = null;
  for (const r of subRows) {
    if (r.khu_id !== khuId || !r.duyet_at) continue;
    if (!best || r.duyet_at > best.duyet_at) best = r;
  }
  return best ? best.duyet_uname : null;
}

export async function computeReview(env, day, opt = {}) {
  const db = env.DB;
  const lc = await db.prepare('SELECT day FROM day_close WHERE day < ? ORDER BY day DESC LIMIT 1').bind(day).first();
  const last = lc ? lc.day : '';
  const [phiR, khuR, repR, effR, subR, baseR, rcR, mvTsR, pendR, usedR, rateR, closedR, revR, setR, slotR] = await db.batch([
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
    db.prepare(SETTINGS_SQL),
    // các lần khu gửi báo cáo trong ngày đang duyệt: khung giờ nào đã đếm (xem migration 15)
    db.prepare('SELECT khu_id, ts, at FROM khu_report_log WHERE day = ? ORDER BY id').bind(day),
  ]);

  /* Khung giờ đếm bắt buộc. Chỉ xét ngày đang duyệt (ngày quên chốt trước đó thì không ai đếm bù
     được nữa). Khung ĐÃ KẾT THÚC mà khu chưa đếm thành việc cần xử lý; lần đếm khung sau KHÔNG bù
     cho khung trước, vì đòi đếm nhiều lần/ngày là để có số ở từng buổi — nên cách gỡ duy nhất là
     admin ghi lý do lúc chốt, giống khu không báo. */
  const slotSt = parseSettings(setR.results), nSlot = slotSt.report_slots_per_day;
  const slotDone = {}, slotLate = {};
  if (nSlot > 1) {
    slotR.results.forEach((r) => {
      (slotDone[r.khu_id] = slotDone[r.khu_id] || new Set()).add(slotOf(r.at, slotSt));
      if (r.ts - r.at > SLOT_LATE_MS) (slotLate[r.khu_id] = slotLate[r.khu_id] || []).push({ at: r.at, ts: r.ts });
    });
  }
  const due = nSlot > 1 ? slotsDue(day, slotSt, Date.now(), !!opt.cuoiNgay) : [];

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
      slots: nSlot > 1 ? {
        done: [...(slotDone[k.id] || [])].sort(),
        missing: due.filter((d) => !(slotDone[k.id] && slotDone[k.id].has(d.i))).map((d) => d.i),
        late: slotLate[k.id] || [],
      } : null,
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
    /* Thiếu khung đếm. Khu chưa báo lần nào đã nằm ở khu_missing phía trên (nhánh continue), nên
       không bị tính hai việc. Khu trống trơn (items rỗng) không bị đòi, như với khu_missing. */
    if (k.slots && k.slots.missing.length && k.items.length) {
      const defs = slotDefs(slotSt);
      exceptions.push({ type: 'slot_missing', khu: k.khu, name: k.name, missing: k.slots.missing.map((i) => defs[i].label) });
    }
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
    rows, khus, phieu, exceptions, pending, slot: { n: nSlot, defs: slotDefs(slotSt) },
    reports: repR.results.filter((r) => r.day === day), khu: khuR.results,
  };
}

export async function closeDay(req, env, user) {
  const b = await readJson(req);
  const rv = await computeReview(env, vnDay());
  if (rv.closed) throw new HttpError(409, 'Ngày hôm nay đã được chốt', 'closed');
  const note = String(b.note || '').trim().slice(0, 500);
  if (rv.pending && !note) throw bad('Còn ' + rv.pending + ' việc chưa xử lý, hãy duyệt hoặc ghi chú lý do trước khi chốt');
  await doClose(env, user, rv, note, 'close_day');
  return json({ ok: true });
}

export async function doClose(env, user, rv, note, action) {
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
export async function reopenDay(req, env, user) {
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
export async function reviewDuyet(req, env, user) {
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

/* ========================= VIỆC TỰ ĐỘNG (CRON) =========================
   Một Cron mỗi ngày lúc 23:50 giờ VN (16:50 UTC), chỉ dùng 1/5 Cron của gói Free. */
export async function nightly(env) {
  const day = vnDay();
  const [setR] = await env.DB.batch([env.DB.prepare(SETTINGS_SQL)]);
  if (parseSettings(setR.results).auto_close) {
    const rv = await computeReview(env, day, { cuoiNgay: true });
    if (!rv.closed) {
      const reasons = [];
      if (!rv.reports.length) reasons.push('chưa khu nào báo');
      // việc admin đã duyệt (cảnh báo lệch khu) không chặn tự chốt
      if (rv.pending) reasons.push(rv.pending + ' việc chưa duyệt');
      // nói rõ khu nào thiếu khung nào: "3 việc chưa duyệt" không cho admin biết sáng mai hỏi ai
      const thieu = rv.exceptions.filter((e) => e.type === 'slot_missing');
      if (thieu.length) reasons.push('thiếu lần đếm: ' + thieu.map((e) => e.name + ' ' + e.missing.join(', ')).join('; '));
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
