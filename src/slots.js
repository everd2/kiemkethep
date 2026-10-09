// Khung giờ đếm khi admin bắt mỗi khu đếm nhiều lần/ngày (settings.report_slots_per_day).
import { vnDay, vnHour } from './core.js';
import { WORK_DEFAULT, parseSettings } from './helpers.js';

/* KHUNG GIỜ ĐẾM, khi admin bắt mỗi khu đếm nhiều lần/ngày (settings.report_slots_per_day > 1).
   Chia đều GIỜ LÀM VIỆC của bãi (settings.work_from → work_to, admin đặt ở Cài đặt) chứ không chia
   24 giờ: chia cả ngày thì với 3–4 lần, khung đầu rơi vào nửa đêm (0h–8h, 0h–6h) — không ai ra bãi
   đếm giờ đó, và khu nào cũng bị báo thiếu cả ngày.
   Nhãn khung dựng ở ĐÂY rồi gửi xuống máy khách, để Tổng quan và Duyệt nói cùng một câu. Màn Cài
   đặt có bản chép công thức để xem trước lúc đang chọn giờ (slotPreview trong app.js); bộ test
   so hai bản với nhau. */
export const SLOT_MAX = 4;
// "7h", "10h20": giờ làm chia không chẵn (7h–17h chia 3) thì mốc khung có phút
export const fmtGio = (x) => {
  const h = Math.floor(x + 1e-9), m = Math.round((x - h) * 60);
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
};
export function slotDefs(st, n = st.report_slots_per_day) {
  const m = Math.max(1, Math.min(SLOT_MAX, Math.round(Number(n)) || 1));
  // số lưu hỏng (bắt đầu không trước kết thúc) thì về giờ mặc định, không chia ra khung âm
  const ok = st.work_from >= 0 && st.work_to <= 24 && st.work_from < st.work_to;
  const a = ok ? st.work_from : WORK_DEFAULT[0], b = ok ? st.work_to : WORK_DEFAULT[1];
  const len = (b - a) / m;
  return Array.from({ length: m }, (_, i) => {
    const from = a + i * len, to = i === m - 1 ? b : from + len;
    const ten = m === 2 ? (i === 0 ? 'buổi sáng' : 'buổi chiều') : `lần ${i + 1}`;
    return { i, from, to, label: `${ten} (${fmtGio(from)}–${fmtGio(to)})` };
  });
}
// lần đếm lúc `ms` thuộc khung nào: trước giờ làm tính vào khung đầu, sau giờ làm tính vào khung cuối
export function slotOf(ms, st) {
  const defs = slotDefs(st), h = vnHour(ms);
  const d = defs.find((x) => h < x.to);
  return d ? d.i : defs.length - 1;
}
/* Khung nào ĐÃ KẾT THÚC tính tới lúc `now`, tức khung mà khu phải đếm rồi. Khung đang diễn ra
   chưa tính là thiếu: còn thời gian đếm. Ngày đã qua thì mọi khung đều đã kết thúc.
   cuoiNgay: việc tự chốt 23:50 xét như ngày đã hết. Không có cờ này thì giờ làm kết thúc 24h
   có khung cuối kết thúc SAU lúc tự chốt, tức khung đó không bao giờ bị đòi. */
export function slotsDue(day, st, now = Date.now(), cuoiNgay = false) {
  const today = vnDay(now);
  if (day < today || (cuoiNgay && day === today)) return slotDefs(st);
  if (day > today) return [];
  const h = vnHour(now);
  return slotDefs(st).filter((d) => d.to <= h);
}
/* Báo cáo gửi lên muộn hơn lúc đếm quá ngần này (mất mạng rồi tự gửi lại) thì nói ra ở màn Duyệt.
   Khung tính theo LÚC ĐẾM mà máy khai, nên người duyệt phải thấy được chỗ máy khai giờ khác giờ tới. */
export const SLOT_LATE_MS = 15 * 60e3;
/* Khung giờ đếm cho máy khách. Khung nào khu ĐÃ đếm thì server tính (theo giờ Việt Nam); còn
   "bây giờ là khung nào" thì máy tự tính theo `now` của server cộng thời gian đã trôi, chứ không
   theo đồng hồ máy: máy để sai giờ thì mỗi máy sẽ nhắc một kiểu. */
export function slotInfo(settingRows, logRows) {
  const st = parseSettings(settingRows), n = st.report_slots_per_day;
  const done = {};
  if (n > 1) {
    logRows.forEach((r) => {
      const i = slotOf(r.at, st);
      if (!(done[r.khu_id] = done[r.khu_id] || []).includes(i)) done[r.khu_id].push(i);
    });
  }
  return { n, defs: slotDefs(st), done, now: Date.now() };
}
