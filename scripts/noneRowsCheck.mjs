// clock: real-ok no date is asserted
// noneRowsCheck (Lane B, Nov 13 2026): the two ops tasks behind "Find still reads 'Not read. No figures are shown for this car yet.' on the 1999 Carrera Coupe": task=noneRows (READ ONLY) lists the stored rows a failed read left in spec_market_cache
// (kind none, the generic refusal line find.none, no not-tracked line, no zero-thin flag), task=noneRowsClear deletes exactly those, only with confirm=1, and a row that stopped matching before its delete (a read rewrote it) stays.
// Runs the real handler over a stateful fake PostgREST that evaluates the same filters the tasks send. MUTANTS (--mutants): the list matches rows with a not-tracked line; the clear needs no confirm; the delete does not re-check the filter; the list writes.
//   node scripts/noneRowsCheck.mjs [--mutants]
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { spawnSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(process.argv.find((a, i) => i > 1 && !a.startsWith("--")) || path.join(here, ".."));
if (process.argv.includes("--mutants")) process.exit(mutants());
process.chdir(root);
process.env.PROBE_KEY = "local-check-key"; process.env.OLDCARSDATA_API_KEY = "unused"; process.env.SUPABASE_URL = "https://stub.invalid"; process.env.SUPABASE_SERVICE_ROLE_KEY = "stub"; process.env.SUPABASE_ANON_KEY = "stub";
const { reasonLine } = await import(pathToFileURL(path.join(root, "lib/reasonWords.js")).href); const NONE = reasonLine("find.none"), CHOICE = reasonLine("find.choice");
const mk = (key, market) => ({ spec_key: key, computed_at: "2026-11-12T10:00:00Z", market });
const bad9 = i => mk(`["Porsche","911","Carrera",${1990 + i},"964",null]`, { v: 1, engineVersion: "e100", kind: "none", notTrackedLine: null, thinZero: false, refusalLine: NONE });
let TABLE = [];
const reset = () => { TABLE = [...Array.from({ length: 5 }, (_, i) => bad9(i)), mk('["Porsche","911","Carrera",1999,"996",null]', { v: 1, engineVersion: "e100", kind: "none", refusalLine: NONE }),   // 6 failed-read rows (one without the null fields)
  mk("nt", { kind: "none", notTrackedLine: "No sale of a Ford Pinto has been tracked yet.", thinZero: false, refusalLine: NONE }), mk("zt", { kind: "none", thinZero: true, refusalLine: NONE, notTrackedLine: null }),
  mk("ch", { kind: "none", refusalLine: CHOICE }), mk("rg", { kind: "range", low: 1, high: 2, count: 9 }), mk("rf", { kind: "none", refusalLine: "No sales on record in the last five years." })]; };
const seen = [], selects = []; let beforeDelete = null, FAIL = false;
const get = (o, p) => String(p).split("->>").reduce((a, k) => a == null ? a : a[k], o);
const test = (row, k, v) => {
  if (k === "or") { const m = /^\((.*)\)$/.exec(v)[1].split(","); return m.some(c => { const [f, op, ...val] = c.split("."); const x = get(row, f); return op === "is" ? x == null : op === "eq" ? String(x) === val.join(".") : false; }); }
  if (k === "spec_key") { const x = row.spec_key; if (v.startsWith("gt.")) return x > decodeURIComponent(v.slice(3)); if (v.startsWith("in.")) { const list = v.slice(4, -1).match(/"(?:[^"\\]|\\.)*"/g).map(s => JSON.parse(s)); return list.includes(x); } return true; }
  if (/^market->>/.test(k)) { const x = get(row, k); if (v === "is.null") return x == null; if (v.startsWith("eq.")) return x != null && String(x) === v.slice(3); if (v.startsWith("not.eq.")) return x != null && String(x) !== v.slice(7); return true; }   // SQL: NOT (NULL = v) is NULL, so a missing field does not match
  return true;
};
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url)), method = (opts.method || "GET").toUpperCase(); seen.push({ method, path: u.pathname });
  if (!/spec_market_cache$/.test(u.pathname)) return new Response("[]", { status: 200 });
  const match = r => [...u.searchParams.entries()].every(([k, v]) => /^(select|order|limit)$/.test(k) || test(r, k, v));
  if (method === "DELETE") { if (beforeDelete) { const f = beforeDelete; beforeDelete = null; f(); } const keep = TABLE.filter(r => !match(r)); TABLE = keep; return new Response("", { status: 204 }); }
  if (method !== "GET") return new Response("", { status: 405 });
  const rows = TABLE.filter(match).sort((a, b) => a.spec_key < b.spec_key ? -1 : 1).slice(0, Number(u.searchParams.get("limit") || 1000));
  const sel = u.searchParams.get("select") || ""; selects.push({ sel, limit: Number(u.searchParams.get("limit") || 0) });
  if (FAIL) return new Response("canceling statement due to statement timeout", { status: 500 });
  const proj = sel.split(",").map(f => f.includes(":") ? f.split(":") : [f, f]);
  const out = rows.map(r => Object.fromEntries(proj.map(([alias, src]) => [alias, src.includes("->>") ? get(r, src) : r[src]])));
  return new Response(JSON.stringify(out), { status: 200, headers: { "content-type": "application/json" } });
};
const { default: handler } = await import(pathToFileURL(path.join(root, "api/usageDashboard.js")).href);
const call = async (task, extra = {}, key = "local-check-key") => { let code = 200, body = null; const query = { view: "ops", task, ...extra }; const res = { statusCode: 200, setHeader() {}, getHeader() {}, status(c) { code = c; return this; }, json(o) { body = o; return this; }, send(o) { body = o; return this; }, end() { return this; } }; await handler({ method: "GET", url: "/api/usageDashboard?" + new URLSearchParams(query), query, headers: key ? { "x-ops-key": key } : {} }, res); return { code, body }; };
let bad = 0; const ok = (c, m, d) => { console.log((c ? "ok   " : "FAIL ") + m + (!c && d !== undefined ? " " + JSON.stringify(d) : "")); if (!c) bad++; };
reset();
ok((await call("noneRows", {}, null)).code === 401 && (await call("noneRowsClear", { confirm: "1" }, null)).code === 401, "no key: both tasks refused (401), nothing deleted");
ok(TABLE.length === 11, "…and the table untouched", TABLE.length);
seen.length = 0; const a = await call("noneRows");
ok(a.code === 200 && a.body.count === 6, "task=noneRows counts exactly the six failed-read rows (not a not-tracked row, a zero-thin row, a question row, a range or a real refusal)", a.body);
ok(seen.length > 0 && seen.every(s => s.method === "GET") && a.body.writes === 0 && a.body.ocdSpend === 0, "noneRows is read only: GET requests only, writes 0, zero OldCarsData", seen.map(s => s.method));
ok(a.body.byYear && a.body.byYear["1999"] === 1 && a.body.examples.length === 6, "by year (the 1999 Carrera rows are named) and examples", a.body.byYear);
// THE DEPLOYED FAILURE (Nov 13 2026): the read asked for the whole market blob of 1,000 rows and the 8 s client abort ended it. Now: no request selects the blob, pages are small, the walk crosses pages, and a failure says why.
ok(selects.length > 0 && selects.every(x => !/(^|,)market(,|$)/.test(x.sel) && x.limit > 0 && x.limit <= 250), "the list never selects the whole market blob and never asks for more than 250 rows a page", selects.slice(0, 2));
{ const keep = TABLE; TABLE = keep.concat(Array.from({ length: 600 }, (_, i) => mk(`["Ford","Mustang","GT",${1965 + (i % 30)},"x${String(i).padStart(4, "0")}",null]`, { kind: "none", notTrackedLine: null, thinZero: false, refusalLine: NONE })));
  const big = await call("noneRows"); ok(big.body.count === 606 && big.body.pages >= 3 && big.body.next === null, "a table of 606 failed-read rows is counted whole across pages", { count: big.body.count, pages: big.body.pages, next: big.body.next }); TABLE = keep; }
{ FAIL = true; const f = await call("noneRows"); FAIL = false; ok(f.body.readFailed === true && /500/.test(String(f.body.why)) && /timeout/.test(String(f.body.why)), "a read that fails says why (status and the database's words), not a bare readFailed", f.body); }
seen.length = 0; const d = await call("noneRowsClear");
ok(d.body.dryRun === true && d.body.wouldClear === 6 && !seen.some(s => s.method !== "GET") && TABLE.length === 11, "task=noneRowsClear without confirm=1 is a dry run: it says how many and deletes nothing", d.body);
// a row a read rewrote between the list and the delete stays
beforeDelete = () => { const r = TABLE.find(x => /1999/.test(x.spec_key)); r.market = { kind: "range", low: 40000, high: 60000, count: 12 }; };
const c = await call("noneRowsClear", { confirm: "1" });
ok(c.body.dryRun === false && c.body.attempted === 6 && !TABLE.some(r => r.market.refusalLine === NONE && r.market.kind === "none" && !r.market.thinZero && !r.market.notTrackedLine), "confirm=1 deletes the failed-read rows", c.body);
ok(TABLE.some(r => /1999/.test(r.spec_key) && r.market.kind === "range"), "…but a row rewritten into a real answer between the list and the delete is NOT deleted (the delete re-checks the filter)");
ok(TABLE.length === 6 && ["nt", "zt", "ch", "rg", "rf"].every(k => TABLE.some(r => r.spec_key === k)), "…and every other row is untouched (not tracked, zero thin, question, range, other refusal)", TABLE.map(r => r.spec_key));
ok((await call("noneRows")).body.count === 0, "afterwards noneRows counts none");
// the line a visitor sees for a FRESH failed read is the engine's, and the card prints it
{ const { readFailedMarket } = await import(pathToFileURL(path.join(root, "lib/live/search.js")).href), m = readFailedMarket();
  ok(m.line === "This one was not read, so open the listing or try again." && m.couldNot === true && m.retry === false, "a fresh failed read answers the card with the engine's line", m); }
console.log(bad ? `noneRowsCheck: ${bad} FAIL` : "noneRowsCheck: all pass"); process.exit(bad ? 1 : 0);

function mutants() {
  const M = [
    ["the list matches a not-tracked row", "lib/ops/noneRows.js", s => s.replace("&market->>notTrackedLine=is.null", "").replace("&& !r.nt", ""), "counts exactly the six"],
    ["the clear needs no confirm", "api/usageDashboard.js", s => s.replace('String(req.query?.confirm || "") !== "1"', "false"), "without confirm=1 is a dry run"],
    ["the delete does not re-check the filter", "lib/ops/noneRows.js", s => s.replace("&${FILTER()}`);\n    if (r && r.ok)", "`);\n    if (r && r.ok)"), "NOT deleted"],
    ["the list writes", "lib/ops/noneRows.js", s => s.replace("export async function listNoneRows(env, { after = \"\", maxPages = 400, budgetMs = BUDGET_MS } = {}) {", "export async function listNoneRows(env, { after = \"\", maxPages = 400, budgetMs = BUDGET_MS } = {}) {\n  await supabaseDelete(env, \"spec_market_cache?spec_key=eq.__x\");"), "read only"],
    ["the list asks for the whole blob again", "lib/ops/noneRows.js", s => s.replace('const SELECT = "spec_key,computed_at,', 'const SELECT = "market,spec_key,computed_at,'), "never selects the whole market blob"],
    ["the page is 1,000 rows again", "lib/ops/noneRows.js", s => s.replace("const PAGE = 250", "const PAGE = 1000"), "never asks for more than 250"],
    ["a failed page answers with no reason", "lib/ops/noneRows.js", s => s.replace("return { readFailed: true, why: r.why,", "return { readFailed: true,"), "says why"],
    ["the filter drops a NULL thin flag", "lib/ops/noneRows.js", s => s.replace("&or=(market->>thinZero.is.null,market->>thinZero.eq.false)", "&market->>thinZero=not.eq.true"), "counts exactly the six"]
  ];
  let survived = 0;
  for (const [name, file, fn, expect] of M) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nrc-"));
    for (const d of ["lib", "api", "scripts", "public"]) if (fs.existsSync(path.join(root, d))) fs.cpSync(path.join(root, d), path.join(tmp, d), { recursive: true, filter: s => !/node_modules/.test(s) });
    for (const f of ["vercel.json", "package.json"]) if (fs.existsSync(path.join(root, f))) fs.copyFileSync(path.join(root, f), path.join(tmp, f));
    fs.symlinkSync(path.join(root, "node_modules"), path.join(tmp, "node_modules"));
    const fp = path.join(tmp, file), src = fs.readFileSync(fp, "utf8"), out = fn(src);
    if (out === src) { console.log("MUTANT BROKEN (no change): " + name); survived++; fs.rmSync(tmp, { recursive: true, force: true }); continue; }
    fs.writeFileSync(fp, out);
    const r = spawnSync(process.execPath, [path.join(tmp, "scripts/noneRowsCheck.mjs"), tmp], { encoding: "utf8", timeout: 120000 }), o = (r.stdout || "") + (r.stderr || "");
    const killed = r.status !== 0 && o.split("\n").some(l => l.startsWith("FAIL") && l.includes(expect)); console.log((killed ? "killed   " : "SURVIVED ") + name); if (!killed) survived++;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(survived ? `${survived} mutant(s) survived` : "all mutants killed"); return survived ? 1 : 0;
}
