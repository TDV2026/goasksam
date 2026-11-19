// Read retry check (Lane B, Nov 2 2026, job lane-b-archiveread, step b). No database, no network: a fake PostgREST fails chosen pages. THE CLASS:
// supabaseSelectAll retried EVERY failed page twice more, and let the other parallel pages run on. A page that hit the statement timeout (Postgres 57014)
// is the same query that just cost 8 s of database CPU; sending it three times, six pages at a time, is the burst of ~10 "canceling statement due to
// statement timeout" in one second. Must hold:
//  (1) a page answered 57014 (HTTP 500 with that code) is requested ONCE, the read returns null, and the pages still in flight are aborted;
//  (2) a gateway timeout (504, 544, 408) is never retried either;
//  (3) our own 8 s client abort (SUPABASE_FETCH_MS) is never retried;
//  (4) the read stops at the first timeout: no later batch of pages is started;
//  (5) a failure that says nothing about the query is still retried: a dropped connection (twice, then served) and a 503 (once, then served).
//   node scripts/readRetryCheck.mjs          (LIB_ROOT=<dir holding lib/> runs it against another tree, e.g. the base commit, to show it fails)
import path from "node:path";
import { pathToFileURL } from "node:url";

process.env.SUPABASE_FETCH_MS = "1000";   // the smallest abort the module allows, so the client-abort case takes one second
const ROOT = process.env.LIB_ROOT ? path.resolve(process.env.LIB_ROOT) : path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SB = await import(pathToFileURL(path.join(ROOT, "lib/_supabase.js")).href);
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };

const row = i => ({ id: i, v: "x" });
const TOTAL = 12000;
const log = { req: new Map(), aborted: new Set(), completed: new Set() };
let script = () => ({ kind: "ok" });
const delay = (ms, signal) => new Promise((res, rej) => {
  const t = setTimeout(res, ms);
  if (signal) signal.addEventListener("abort", () => { clearTimeout(t); rej(Object.assign(new Error("aborted"), { name: "AbortError" })); }, { once: true });
});
globalThis.fetch = async (url, init = {}) => {
  const range = (init.headers || {}).Range || "0-999"; const [from, to] = range.split("-").map(Number);
  log.req.set(from, (log.req.get(from) || 0) + 1);
  const attempt = log.req.get(from);
  const a = script(from, attempt);
  try {
    if (a.kind === "hang") { await delay(60000, init.signal); }
    await delay(a.ms ?? 20, init.signal);
  } catch (e) { log.aborted.add(from); throw e; }
  if (a.kind === "throw") throw new TypeError("fetch failed");
  if (a.kind === "http") return new Response(a.body || "{}", { status: a.status });
  log.completed.add(from);
  const rows = []; for (let i = from; i <= Math.min(to, TOTAL - 1); i++) rows.push(row(i));
  return new Response(JSON.stringify(rows), { status: from + rows.length < TOTAL ? 206 : 200 });
};
const env = { supabaseUrl: "https://fake.example", supabaseKey: "k" };
const reset = fn => { log.req = new Map(); log.aborted = new Set(); log.completed = new Set(); script = fn; };
const T57014 = JSON.stringify({ code: "57014", message: "canceling statement due to statement timeout" });

// (1) + (4): page 3 of the first parallel batch times out; its siblings are slow, so they are still in flight when it fails
reset((from) => from === 2000 ? { kind: "http", status: 500, body: T57014, ms: 30 } : { kind: "ok", ms: 400 });
{ const got = await SB.supabaseSelectAll(env, "sales_archive?select=id&order=id.asc");
  ok("a page answered 57014 is requested once, not three times", log.req.get(2000) === 1, `requests for that page: ${log.req.get(2000)}`);
  ok("the read returns null (a failed read), never the pages that did arrive", got === null);
  ok("the pages still in flight when it timed out are aborted, not left to finish", [...log.aborted].some(o => o !== 2000) && ![...log.completed].some(o => o >= 3000), `aborted: ${[...log.aborted].join(",") || "none"} completed: ${[...log.completed].join(",") || "none"}`);
  ok("the read stops at the first timeout: no later batch of pages is started", ![...log.req.keys()].some(o => o >= 7000), `offsets requested: ${[...log.req.keys()].join(",")}`); }

// (2) gateway timeouts
for (const st of [504, 544, 408]) {
  reset((from) => from === 0 ? { kind: "http", status: st } : { kind: "ok" });
  const got = await SB.supabaseSelectAll(env, "sales_archive?select=id&order=id.asc");
  ok(`HTTP ${st} is a timeout: requested once`, log.req.get(0) === 1 && got === null, `requests: ${log.req.get(0)}`);
}

// (3) our own client abort
reset((from) => from === 0 ? { kind: "hang" } : { kind: "ok" });
{ const t0 = Date.now(); const got = await SB.supabaseSelectAll(env, "sales_archive?select=id&order=id.asc");
  ok("our own 8 s client abort is never retried", log.req.get(0) === 1 && got === null, `requests: ${log.req.get(0)} after ${Date.now() - t0} ms`); }

// (5) failures that say nothing about the query are still retried
reset((from, attempt) => from === 0 && attempt <= 2 ? { kind: "throw" } : { kind: "ok" });
{ const got = await SB.supabaseSelectAll(env, "sales_archive?select=id&order=id.asc", 20000);
  ok("a dropped connection (twice) is retried and the read is served", Array.isArray(got) && got.length === TOTAL && log.req.get(0) === 3, `requests: ${log.req.get(0)} rows: ${got && got.length}`); }
reset((from, attempt) => from === 0 && attempt === 1 ? { kind: "http", status: 503 } : { kind: "ok" });
{ const got = await SB.supabaseSelectAll(env, "sales_archive?select=id&order=id.asc", 20000);
  ok("a 503 is retried once and the read is served", Array.isArray(got) && log.req.get(0) === 2, `requests: ${log.req.get(0)}`); }

// the classifier itself
ok("isTimeoutResponse reads the 57014 code, and a 504, 544, 408", typeof SB.isTimeoutResponse === "function" && SB.isTimeoutResponse(500, T57014) === true && SB.isTimeoutResponse(504, "") === true && SB.isTimeoutResponse(544, "") === true && SB.isTimeoutResponse(408, "") === true);
ok("isTimeoutResponse leaves a 500 without the code, a 503 and a 429 alone", typeof SB.isTimeoutResponse === "function" && SB.isTimeoutResponse(500, "{}") === false && SB.isTimeoutResponse(503, "") === false && SB.isTimeoutResponse(429, "") === false);

console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
