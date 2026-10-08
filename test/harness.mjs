/* Chạy src/worker.js thật trên SQLite thật (node:sqlite) qua một shim D1.
   Không cần mạng, không cần wrangler. Dùng để test logic nghiệp vụ. */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

/* ---------- đồng hồ giả để nhảy ngày ---------- */
const RealDate = Date;
export const clock = { offset: 0 };
class FakeDate extends RealDate {
  constructor(...a) {
    if (a.length === 0) super(RealDate.now() + clock.offset);
    else super(...a);
  }
  static now() { return RealDate.now() + clock.offset; }
}
globalThis.Date = FakeDate;
export const addDays = (n) => { clock.offset += n * 86400e3; };
/* Nhích đồng hồ vài giây. Cần khi test phụ thuộc thứ tự theo `ts`: bộ test chạy trong bộ nhớ
   nên hai thao tác có thể rơi vào cùng một milligiây, lúc đó so sánh ts không phân định được. */
export const advance = (ms) => { clock.offset += ms; };
export const vnDay = (ms = Date.now()) => new RealDate(ms + 7 * 3600e3).toISOString().slice(0, 10);

/* ---------- shim D1 trên node:sqlite ---------- */
const num = (x) => (typeof x === 'bigint' ? Number(x) : x);

class Stmt {
  constructor(db, sql, params = []) { this.db = db; this.sql = sql; this.params = params; }
  bind(...p) { return new Stmt(this.db, this.sql, p); }
  _st() {
    let s = this.db._cache.get(this.sql);
    if (!s) { s = this.db.raw.prepare(this.sql); this.db._cache.set(this.sql, s); }
    return s;
  }
  async all() {
    this.db.reads++;
    const results = this._st().all(...this.params);
    return { results, success: true, meta: {} };
  }
  async first(col) {
    const { results } = await this.all();
    const r = results[0];
    if (!r) return null;
    return col === undefined ? r : r[col];
  }
  async run() {
    this.db.writes++;
    const r = this._st().run(...this.params);
    return { success: true, results: [], meta: { changes: num(r.changes), last_row_id: num(r.lastInsertRowid) } };
  }
}

class D1 {
  constructor(raw) { this.raw = raw; this._cache = new Map(); this.reads = 0; this.writes = 0; this.batches = 0; }
  prepare(sql) { return new Stmt(this, sql); }
  async batch(stmts) {
    this.batches++;
    this.raw.exec('BEGIN');
    const out = [];
    try {
      for (const s of stmts) {
        const st = s._st();
        // SELECT trả rows, còn lại trả meta; chạy tuần tự như D1
        if (/^\s*(select|with)\b/i.test(s.sql)) out.push({ results: st.all(...s.params), success: true, meta: {} });
        else {
          const r = st.run(...s.params);
          out.push({ results: [], success: true, meta: { changes: num(r.changes), last_row_id: num(r.lastInsertRowid) } });
        }
      }
      this.raw.exec('COMMIT');
    } catch (e) {
      try { this.raw.exec('ROLLBACK'); } catch (e2) { /* đã rollback */ }
      throw e;
    }
    return out;
  }
}

/* ---------- dựng môi trường ---------- */
export async function boot(root) {
  const raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys=OFF');
  raw.exec(readFileSync(path.join(root, 'schema.sql'), 'utf8'));
  const DB = new D1(raw);
  const env = {
    DB, PEPPER: 'pepper-test', SETUP_TOKEN: 'setup-tok', RECOVERY_TOKEN: 'rec-tok',
    ASSETS: { fetch: () => new Response('static') },
  };
  const mod = await import(pathToFileURL(path.join(root, 'src/worker.js')).href + '?t=' + Date.now());
  const worker = mod.default;

  const jars = {};
  const call = async (method, p, body, who = 'admin') => {
    const headers = { Origin: 'https://test.local' };
    if (jars[who]) headers.Cookie = jars[who];
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const req = new Request('https://test.local/api' + p, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });
    const res = await worker.fetch(req, env);
    const sc = res.headers.get('Set-Cookie');
    if (sc) jars[who] = sc.split(';')[0];
    const txt = await res.text();
    let data = null;
    try { data = JSON.parse(txt); } catch (e) { data = txt; }
    return { status: res.status, data, res };
  };
  const login = async (who, phone, pin) => {
    const r = await call('POST', '/login', { phone, pin }, who);
    if (r.status !== 200) throw new Error('login ' + who + ' thất bại: ' + JSON.stringify(r.data));
    return r.data;
  };
  const sql = (q, ...p) => raw.prepare(q).all(...p);
  const one = (q, ...p) => raw.prepare(q).get(...p);
  return { env, DB, raw, worker, call, login, sql, one, jars, cron: () => worker.scheduled({}, env, { waitUntil: (p) => p }) };
}
