/* Dọn rác do việc phát triển kho-thep để lại + chuyển thư mục tạm sang ổ của repo (ổ D).
   Tự chạy mỗi lần: npm test, npm run dev, npm run deploy. Chạy tay: npm run donrac (thêm --het để xoá cả rác mới).
   Chỉ xoá những thứ chắc chắn là rác:
   - .kt-tmp/ trong repo (thư mục tạm của test / wrangler) cũ hơn 1 ngày
   - %TEMP%/miniflare-* (wrangler dev để lại) cũ hơn 1 ngày
   - .wrangler/tmp/ (bản đóng gói lúc deploy) cũ hơn 1 ngày
   - worktree trong .claude/worktrees/ không sửa gì, đã nằm trong main, 2 ngày không đụng tới
   Tệp đang mở (bị khoá) thì bỏ qua, không báo lỗi. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const NGAY = 24 * 3600 * 1000;
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const TAM = path.join(ROOT, '.kt-tmp');

// Biến môi trường để node / npm / wrangler ghi tệp tạm vào .kt-tmp thay vì ổ C.
export function envTam(env = process.env) {
  fs.mkdirSync(TAM, { recursive: true });
  return { ...env, TMP: TAM, TEMP: TAM, TMPDIR: TAM };
}

const coLau = (p, ms) => {
  try { return Date.now() - fs.statSync(p).mtimeMs > ms; } catch { return false; }
};
const coDung = (p) => {
  let n = 0;
  try {
    const st = fs.lstatSync(p);
    if (!st.isDirectory()) return st.size;
    for (const c of fs.readdirSync(p)) n += coDung(path.join(p, c));
  } catch {}
  return n;
};

export function donRac({ het = false } = {}) {
  const tuoi = het ? 0 : NGAY;
  let so = 0, byte = 0;
  const xoa = (p) => {
    const n = coDung(p);
    try { fs.rmSync(p, { recursive: true, force: true, maxRetries: 2 }); } catch { return; }
    if (!fs.existsSync(p)) { so++; byte += n; }
  };
  const quet = (dir, loc, ms) => {
    let ds = [];
    try { ds = fs.readdirSync(dir); } catch { return; }
    for (const t of ds) if (loc(t) && coLau(path.join(dir, t), ms)) xoa(path.join(dir, t));
  };

  quet(TAM, () => true, tuoi);
  // %TEMP% thật của máy (không phải .kt-tmp nếu đã chuyển)
  for (const d of new Set([os.tmpdir(), process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Temp')].filter(Boolean)))
    if (path.resolve(d) !== TAM) quet(d, (t) => t.startsWith('miniflare-'), tuoi);
  quet(path.join(ROOT, '.wrangler', 'tmp'), () => true, tuoi);

  // worktree bỏ quên: sạch, đã gộp vào main, lâu không đụng
  const git = (...a) => spawnSync('git', a, { cwd: ROOT, encoding: 'utf8' });
  const wtDir = path.join(ROOT, '.claude', 'worktrees');
  let wts = [];
  try { wts = fs.readdirSync(wtDir); } catch {}
  for (const w of wts) {
    const p = path.join(wtDir, w);
    if (!coLau(p, het ? 0 : 2 * NGAY)) continue;
    const st = spawnSync('git', ['status', '--porcelain'], { cwd: p, encoding: 'utf8' });
    if (st.status !== 0 || st.stdout.trim()) continue;
    const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: p, encoding: 'utf8' }).stdout.trim();
    const daGop = head && (git('merge-base', '--is-ancestor', head, 'main').status === 0 ||
      git('diff', '--quiet', head, 'main').status === 0);
    if (!daGop) continue;
    const n = coDung(p);
    if (git('worktree', 'remove', p).status === 0) { so++; byte += n; }
  }
  if (wts.length) git('worktree', 'prune');

  return { so, mb: Math.round(byte / 1048576 * 10) / 10 };
}

export function baoDon(r) {
  if (r.so) console.log(`(dọn rác: xoá ${r.so} mục, ${r.mb} MB)`);
}

// node scripts/donrac.mjs [--het]            -> chỉ dọn
// node scripts/donrac.mjs wrangler deploy     -> dọn rồi chạy lệnh với thư mục tạm ở .kt-tmp
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const het = args[0] === '--het';
  baoDon(donRac({ het }));
  const lenh = args.filter((a) => a !== '--het');
  if (lenh.length) {
    const p = spawn(lenh.join(' '), { cwd: ROOT, env: envTam(), stdio: 'inherit', shell: true });
    p.on('close', (code) => process.exit(code ?? 1));
  }
}
