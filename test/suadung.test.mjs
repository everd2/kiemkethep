/* SỐ VỪA SỬA LUÔN VÀO BÁO CÁO (rà soát 2026-11-18, agent tìm lỗi độc lập): mỗi kịch bản trong test/suadung/ dựng worker thật + app.js trong vm và
   kiểm báo cáo ca / báo cáo sản lượng sau các chuỗi sửa: tổ hai ca "không làm" một ca, máy thứ hai còn bản cũ bấm Chép, đánh dấu nhầm rồi bỏ dấu,
   bánh răng / lịch đổi khi mục 3 đã sửa tay, tổ bị xoá sau khi sửa, sửa lùi 20 ngày, sản lượng đã lưu trước khi sửa, hai người cùng sửa...
   node suadung.test.mjs <đường-dẫn-repo>   (các kịch bản tự tìm repo theo vị trí tệp) */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'suadung');
const T = [];
for (const f of readdirSync(dir).filter((x) => /^s\d.*\.mjs$/.test(x)).sort()) {
  const r = spawnSync(process.execPath, [path.join(dir, f)], { encoding: 'utf8', env: process.env, timeout: 300000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const hong = out.split('\n').filter((l) => /^FAIL\b|CRASH|Error:/.test(l));
  const qua = out.split('\n').filter((l) => /^PASS\b/.test(l)).length;
  T.push([hong.length || (r.status && r.status !== 0) || !qua ? 'FAIL' : 'PASS', `${f}: ${qua} kiểm tra qua`, hong.slice(0, 3).join(' | ') || (r.status ? 'thoát mã ' + r.status : '')]);
}
const fail = T.filter((x) => x[0] === 'FAIL');
console.log(T.map((x) => x[0] + ' | ' + x[1] + (x[0] === 'FAIL' ? '  [' + x[2] + ']' : '')).join('\n'));
console.log('\n=== ' + T.length + ' kiểm tra, ' + fail.length + ' lỗi ===');
process.exit(fail.length ? 1 : 0);
