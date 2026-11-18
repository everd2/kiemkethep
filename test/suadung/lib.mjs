import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { advance, boot, vnDay } from '../../test/harness.mjs';
export { advance, vnDay };
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');
export const T = [];
export const ok = (name, cond, extra) => { T.push([cond ? 'PASS' : 'FAIL', name, extra === undefined ? '' : String(extra)]); };
export const eq = (name, a, b) => ok(name + ' = ' + JSON.stringify(b), JSON.stringify(a) === JSON.stringify(b), 'actual: ' + JSON.stringify(a));
export const tick = async (n = 60) => { for (let i = 0; i < n; i++) await new Promise((z) => setImmediate(z)); };
export const toi = (h, m) => { const cur = ((Date.now() + 7 * 3600e3) % 864e5) / 60e3; advance(((h * 60 + m - cur + 1440) % 1440 || 1440) * 60e3); };
export async function dung(names) {
  const S = await boot(ROOT);
  await S.call('POST', '/setup', { token: 'setup-tok', name: 'Admin', phone: '0900000001', pin: '2468' });
  await S.login('Admin', '0900000001', '2468');
  const U = {}; let i = 2;
  for (const [name, role] of names) {
    const phone = '09000000' + String(i++).padStart(2, '0');
    const r = await S.call('POST', '/users', { name, phone, role }, 'Admin');
    await S.login(name, phone, r.data.pin);
    await S.call('POST', '/change-pin', { pin: r.data.pin, newPin: '1357' }, name);
    U[name] = r.data.id; (S.cred ||= {})[name] = phone;
  }
  return { S, U };
}
export async function may(S, U, who) {
  const store = {};
  const el = () => ({ value: '', dataset: {}, style: {}, click() {}, focus() {}, remove() {}, select() {}, setAttribute() {}, setSelectionRange() {}, querySelector: () => null, querySelectorAll: () => [], appendChild() {}, closest: () => null, getBoundingClientRect: () => ({ left: 0, right: 0 }), set innerHTML(v) {}, get innerHTML() { return ''; } });
  const loi = [];
  const ctx = {
    console: { log() {}, warn() {}, error: (...a) => loi.push(a.map(String).join(' ')) },
    Date, Math, JSON, String, Number, Object, Array, Set, Map, parseInt, parseFloat, isNaN, Promise, RegExp, Error, TypeError, encodeURIComponent,
    setTimeout: () => 0, clearTimeout: () => {},
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; }, key: (n) => Object.keys(store)[n] || null, get length() { return Object.keys(store).length; } },
    navigator: { onLine: true, clipboard: { writeText: async () => {} } },
    history: { state: null, pushState() {}, replaceState() {} },
    document: { activeElement: null, hidden: false, body: { appendChild() {}, removeChild() {} }, createElement: el, getElementById: () => el(), querySelectorAll: () => [], addEventListener() {}, execCommand: () => false },
    window: { addEventListener() {} },
    fetch: async (url, o = {}) => {
      const r = await S.call(o.method || 'GET', String(url).replace(/^\/api/, ''), o.body ? JSON.parse(o.body) : undefined, who);
      return { ok: r.status < 400, status: r.status, json: async () => r.data, headers: { get: () => null } };
    },
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: 'app.js' });
  const R = (src) => vm.runInContext(src, ctx);
  await tick(200);
  let bt0 = await S.call('GET', '/bootstrap', undefined, who); if (bt0.status !== 200) { await S.login(who, S.cred[who], '1357'); bt0 = await S.call('GET', '/bootstrap', undefined, who); } const bt = bt0.data;
  R(`S.boot = ${JSON.stringify(bt)}; indexBoot(S.boot); S.me = ${JSON.stringify({ id: U[who], name: who, role: 'cvktht' })}; S._dataUid = S.me.id; S.form = {};`);
  const cho = async (f) => { for (let i = 0; i < 50000; i++) { await new Promise((z) => setImmediate(z)); if (f()) { await tick(20); return true; } } return false; };
  const reboot = async () => { const b = (await S.call('GET', '/bootstrap', undefined, who)).data; R(`S.boot = ${JSON.stringify(b)}; indexBoot(S.boot);`); };
  const moBc = async (ngay, ca) => { await reboot(); R(`Object.keys(NHO).forEach((k) => delete NHO[k]); S.bcCa = { ngay: '${ngay}', ca: ${ca} }; S.bcc = null; go('baocaoca', true)`); await cho(() => R(`!!(S.bcc && S.bcc.ngay === '${ngay}' && S.bcc.ca === ${ca} && !S.busy)`)); };
  const xong = async () => { await tick(10); await cho(() => !R('S.busy')); };
  // line of tổ in mục 3 AS SHOWN (hand edit wins): bcGet('s3')
  const dong = (ten) => R("bcGet('s3')").split('\n').find((l) => l.includes('Tổ ' + ten));
  const dongApp = (ten) => R("bcAuto(S.bcc, 's3')").split('\n').find((l) => l.includes('Tổ ' + ten));
  const sl = async (ngay) => { R(`Object.keys(NHO).forEach((k) => delete NHO[k])`); await R(`slLay('${ngay}').then((L) => { slDung(L, false); })`); await tick(100); return JSON.parse(R('JSON.stringify(slTinh().dong.map((r) => [r.u.name, r.cong]))')); };
  const sua = async (id, vals, chon) => {
    R(`ACTIONS.bcsuaca({ id: '${id}' })`);
    if (chon) R(`ACTIONS.bcsuachon({ v: '${chon}' })`);
    R(Object.entries(vals).map(([k, v]) => `S.form.bsc_${k} = '${v}';`).join(' ') + ' ACTIONS.bcsualuu()');
    await xong();
    return R('S.toast');
  };
  return { R, moBc, dong, dongApp, loi, xong, sl, sua, reboot, store };
}
export function ket() {
  const fail = T.filter((x) => x[0] === 'FAIL');
  console.log(T.map((x) => x[0] + ' | ' + x[1] + (x[2] && x[0] === 'FAIL' ? '  [' + x[2] + ']' : '')).join('\n'));
  console.log('\n=== ' + T.length + ' checks, ' + fail.length + ' fail ===');
}
