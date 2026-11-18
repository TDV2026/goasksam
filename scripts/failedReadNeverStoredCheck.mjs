// clock: real-ok the live rows end relative to the real now in this process; no calendar date is asserted
// A FAILED READ IS NEVER STORED (Lane B, Nov 15 2026). Lane C counted 145 stored "No figures are shown for this car yet." rows (noneRows) with e99 and e100 stamps. The Nov 13 fix stopped walkLadder taking a failed pool read (tier read_failed or unavailable,
// still reading, a lost leg) for a ladder with no core, but the row was still built by ONE place (refreshSpec) from whatever the walk left, and a row's only record of WHY it was a none was its words. Two gaps: (1) engineAnswer turns a QUESTION (a *_choice tier)
// into null, so the walk saw no tier at all and wrote the generic none line for it (the none line, not the question line, for 3-Series, Challenger, Corvette asks); (2) nothing at the writer refused a row that says nothing about the car.
// FIX: the none row carries the tier of the engine answer it was made from (answeredTier); persistCore, the writer of every market row, refuses a none row with no answeredTier (and no not-tracked line or zero-thin flag), a stored answer the store guard rejects
// (answerCacheable) and a row that says readFailed or stillReading; a walk with no engine answer at all returns undefined, stores and remembers nothing.
// CLASS: (A) every direct write to spec_market_cache in api, lib and scripts is named below with what it stores; a new write site that is not named FAILS this check until someone says what it stores and why a failed read cannot reach it. (B) persistCore refuses
// each kind of failed-read row and still stores every real answer. (C) a Find search over a failing archive stores no row at all that says nothing; the same search over a working archive stores only real answers.
//   node scripts/failedReadNeverStoredCheck.mjs [repo root]   (run it against origin/main: B fails); --mutants breaks one rule at a time.
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { spawnSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
import { SPEC_V } from "../lib/live/search.js";   // a stored core carries the engine's own SPEC_V, never a number of its own (scripts/specVersionFixtureCheck.mjs)
const args = process.argv.slice(2), here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(args.find(a => !a.startsWith("--")) || path.join(here, ".."));
if (args.includes("--mutants")) process.exit(mutants());
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.LAUNCH_STAGE = "2"; process.env.OLDCARSDATA_API_KEY = "unused"; process.env.ANTHROPIC_API_KEY = "unused"; process.env.FAILED_READ_MS = "2500";
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) pass++; else { fail++; console.log("FAIL " + n + (d !== undefined ? " " + JSON.stringify(d) : "")); } };
// (A) THE WRITE SITES. file -> [how many direct writes, what it stores, why a failed read cannot be stored by it]
const SITES = {
  "lib/live/search.js": [5, "persistCore (every market row: Find, Buy, Tasks, warm answers, question rows, markers), markRecomputing (a PATCH of a row already stored), the computing marker, the stored-row delete", "persistCore refuses a failed-read row (B); the others store a marker or change a row that exists"],
  "lib/onebox.js": [3, "the eligibility record (kind qelig), the missed-question queue (kind qelig_miss), the delete of a stale eligibility row", "none stores a market answer; an eligibility record is made from answers that already finished"],
  "lib/sell/sellBlock.js": [1, "the Sell block (writeBlock)", "its caller returns why:failed_read before writing; a block with no epoch is refused"],
  "lib/sell/sellFacts.js": [1, "the Sell facts row", "only when places.total is above zero (an empty result may be a read that did not come back)"],
  "lib/sell/sellExample.js": [1, "the Sell landing example", "stores an example it built, never a null"],
  "lib/live/buyExample.js": [1, "the Find landing example", "a build that did not qualify never overwrites (data null is returned before the write)"],
  "lib/live/deskExample.js": [1, "the Desk landing example", "stores a built example only"],
  "lib/live/marketCheckExample.js": [1, "the Market Check landing example", "stores a built example only"],
  "lib/_staleMark.js": [1, "marks a stored row stale (staleSince), never writes a new answer", "changes a row that exists, adds no row"],
  "lib/ops/noneRows.js": [1, "the clear task's delete (only with confirm=1, filter repeated on the delete)", "removes rows, stores none"],
  "api/usageDashboard.js": [1, "task=warmStale, a test that re-stamps the epoch of a stored warm answer", "re-stores a row already stored, crew key only"],
};
const found = {}; const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (["node_modules", ".git", "proofs"].includes(e.name)) continue; const p = path.join(d, e.name);
  if (e.isDirectory()) walk(p); else if (/\.(js|mjs)$/.test(e.name) && !/Check\.(mjs|js)$/.test(e.name)) { const s = fs.readFileSync(p, "utf8"); if (!s.includes("spec_market_cache")) continue; const lines = s.split("\n");
    lines.forEach((l, i) => { const w = lines.slice(i, i + 3).join(" "); if (l.includes("spec_market_cache") && /method:\s*"(POST|PATCH|DELETE|PUT)"|supabaseInsert\(\s*["']spec_market_cache|supabaseUpsert\(\s*["']spec_market_cache|supabaseDelete|supabasePatch/.test(w)) found[path.relative(root, p)] = (found[path.relative(root, p)] || 0) + 1; }); } } };
for (const d of ["api", "lib", "scripts"]) walk(path.join(root, d));
for (const [f, n] of Object.entries(found)) ok(`(A) write site named: ${f} (${n})`, SITES[f] && SITES[f][0] === n, { found: n, named: SITES[f] && SITES[f][0] });
for (const f of Object.keys(SITES)) ok(`(A) named write site still exists: ${f}`, found[f] > 0, null);
const imp = f => import(pathToFileURL(path.join(root, f)).href);
const S = await imp("lib/live/search.js"), { reasonLine } = await imp("lib/reasonWords.js"), NONE = reasonLine("find.none");
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
// (B) THE WRITER
const WRITES = []; const rows = [];
globalThis.fetch = async (url, init = {}) => { const u = String(url), method = (init.method || "GET").toUpperCase();
  if (/api\.anthropic\.com/.test(u)) return new Response("{}", { status: 500 });
  if (/\/rest\/v1\/spec_market_cache/.test(u) && method !== "GET") { let b = null; try { b = JSON.parse(init.body || "null"); } catch { /* none */ } WRITES.push({ method, rows: Array.isArray(b) ? b : [b] }); return new Response("", { status: 201 }); }
  if (FAIL.archive && /\/rest\/v1\/(sales_archive|vehicle_market_records)/.test(u)) return new Response("upstream timeout", { status: 500 });
  return new Response(JSON.stringify(/\/rest\/v1\/live_listings/.test(u) ? rows : []), { status: 200 }); };
const FAIL = { archive: false };
const stored = async core => { WRITES.length = 0; const r = await S.persistCore(env, "KEY", core); return WRITES.some(w => w.rows.some(x => x && x.spec_key === "KEY")) && r !== false; };
const failedNone = { v: SPEC_V, engineVersion: "e100", kind: "none", notTrackedLine: null, thinZero: false, refusalLine: NONE };
ok("(B) a none row that is only the generic line (what a failed read left) is refused", !(await stored(failedNone)));
ok("(B) …the same row with a null answeredTier is refused", !(await stored({ ...failedNone, answeredTier: null })));
ok("(B) a row that says readFailed is refused", !(await stored({ kind: "pending", readFailed: true })) && !(await stored({ kind: "pending", stillReading: true })));
ok("(B) a stored answer of a read_failed tier is refused (warm answer row)", !(await stored({ raw: { tier: "read_failed" }, engineVersion: "e1", warmEpoch: "x" })));
ok("(B) …an unavailable tier, a still-reading answer, and an answer carrying a failed pool read are refused", !(await stored({ raw: { tier: "unavailable" } })) && !(await stored({ raw: { tier: "result", stillReading: true } })) && !(await stored({ raw: { tier: "result", dedup: { queryError: true } } })));
ok("(B) a none row made from an engine answer (answeredTier) is stored", await stored({ ...failedNone, answeredTier: "refusal" }));
ok("(B) a none row with a not-tracked line, or a zero-thin flag, is stored", await stored({ kind: "none", notTrackedLine: "No sale of a Ford Pinto has been tracked yet.", refusalLine: NONE }) && await stored({ kind: "none", thinZero: true, refusalLine: NONE }));
ok("(B) a range, a count, a marker and a null warm answer are stored", await stored({ kind: "range", low: 1, high: 2, count: 9 }) && await stored({ kind: "count", count: 3 }) && await stored({ computingSince: "x", engineVersion: "e1" }) && await stored({ kind: "question", raw: null, engineVersion: "e1" }));
// (C) A FIND SEARCH
const { default: bs } = await imp("api/buySearch.js");
const base = { source: "bringatrailer", mileage_unit: "mi", country: "US", currency: "USD", status: "live", body: "coupe", transmission: "Manual", location: "Austin, TX", exterior_color: "Red", description: "" };
const NOW = Date.now(); const T = ["GT", "GT", "Mach 1", "Boss 302", "GT", "Shelby GT350", "GT", "Cobra", "GT", "GT", "Mach 1", "GT"];
rows.push(...Array.from({ length: 12 }, (_, i) => { const y = 1965 + i * 3; return { ...base, id: 500 + i, source_listing_id: "w" + i, url: "https://auction.test/w/" + i, listing_title: `${y} Ford Mustang ${T[i]}`, make: "Ford", model: "Mustang", year: y, vin_norm: null, mileage: 30000 + i * 1500, current_bid: 30000 + i * 3000, current_bid_usd: 30000 + i * 3000, end_time: new Date(NOW + (1 + i) * 3600e3 * 7).toISOString(), photo_url: "https://img.test/w" + i + ".jpg", bid_at: new Date(NOW - 3600e3).toISOString(), last_seen: new Date(NOW).toISOString(), first_seen: new Date(NOW - 5 * 864e5).toISOString() }; }));
const ids = rows.map(r => r.id);
const ask = async () => { let out = null; const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, getHeader() {}, status(c) { this.statusCode = c; return this; }, json(o) { out = o; return this; }, send(o) { out = o; return this; }, end() { return this; } }; await bs({ method: "POST", headers: { cookie: "", host: "x", "x-forwarded-for": "203.0.113." + Math.floor(Math.random() * 200) }, query: {}, body: { action: "enrich", ids }, url: "/api/buySearch" }, res); return out || {}; };
const marketRows = () => WRITES.flatMap(w => w.rows).filter(x => x && x.market && typeof x.market === "object");
const sayless = m => m.kind === "none" && !m.answeredTier && !m.notTrackedLine && m.thinZero !== true;
WRITES.length = 0; FAIL.archive = true; await ask(); await new Promise(r => setTimeout(r, 600)); await ask();
ok("(C) a Find search over a failing archive stores no row that says nothing (no none row without an answer, no failed-read answer)", !marketRows().some(x => sayless(x.market) || x.market.readFailed || (x.market.raw && /^(read_failed|unavailable)$/.test(String(x.market.raw.tier)))), marketRows().filter(x => sayless(x.market)).slice(0, 2).map(x => x.market));
FAIL.archive = false; WRITES.length = 0; await new Promise(r => setTimeout(r, 2800)); for (let i = 0; i < 4; i++) { await ask(); await new Promise(r => setTimeout(r, 500)); }
ok("(C) the same search over a working archive stores real answers, none of them saying nothing", marketRows().length > 0 && !marketRows().some(x => sayless(x.market)), { rows: marketRows().length });
ok("(C) every none row it stores names the tier of the engine answer it was made from (answeredTier)", marketRows().filter(x => x.market.kind === "none").length > 0 && marketRows().filter(x => x.market.kind === "none").every(x => typeof x.market.answeredTier === "string" && x.market.answeredTier), marketRows().filter(x => x.market.kind === "none").slice(0, 2).map(x => x.market));
if (process.env.SHOWKINDS) console.log(marketRows().map(x => x.market.kind + ":" + (x.market.answeredTier || "-")).join(" "));
console.log(`failedReadNeverStoredCheck: ${fail ? fail + " FAIL" : "all pass"} (${pass})`); process.exit(fail ? 1 : 0);

function mutants() {
  const me = fileURLToPath(import.meta.url), R = path.resolve(args.find(a => !a.startsWith("--")) || path.join(path.dirname(me), ".."));
  const M = [
    ["the writer stores a none row with no answer", "lib/live/search.js", s => s.replace('if (core.kind === "none" && !core.answeredTier && !core.notTrackedLine && core.thinZero !== true) return "none_without_answer";', ""), "generic line"],
    ["the writer stores a read_failed answer", "lib/live/search.js", s => s.replace('if (core.raw !== undefined && core.raw !== null && !answerCacheable(core.raw)) return "raw_not_cacheable";', ""), "read_failed tier"],
    ["the writer stores a row that says readFailed", "lib/live/search.js", s => s.replace('if (core.readFailed === true || core.stillReading === true) return "read_failed";', ""), "readFailed"],
    ["the writer is not asked at all", "lib/live/search.js", s => s.replace("  const why = storeRefusalReason(core);\n  if (why) {", "  const why = null;\n  if (why) {"), "refused"],
    ["the none row forgets its answeredTier", "lib/live/search.js", s => s.replace('kind: "none", answeredTier: answeredTierMem.get(spec.key) || null,', 'kind: "none",'), "names the tier"],
    ["a new direct write site appears unnamed", "lib/live/findExamples.js", s => s + '\nexport async function __leak(env, key, m) { await fetch(`${env.supabaseUrl}/rest/v1/spec_market_cache?on_conflict=spec_key`, { method: "POST", body: JSON.stringify([{ spec_key: key, market: m }]) }); }\n', "write site named"],
    ["a named write site is dropped from the tree", "lib/live/deskExample.js", s => s.replace('supabaseInsert("spec_market_cache"', 'supabaseInsert("other_table"'), "still exists"],
  ];
  let survived = 0;
  for (const [name, file, fn, expect] of M) {
    const tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "frns-")); try {
      for (const d of ["lib", "api", "scripts", "public"]) if (fs.existsSync(path.join(R, d))) fs.cpSync(path.join(R, d), path.join(tmp, d), { recursive: true, filter: s => !/node_modules/.test(s) });
      for (const f of ["vercel.json", "package.json"]) if (fs.existsSync(path.join(R, f))) fs.copyFileSync(path.join(R, f), path.join(tmp, f));
      fs.symlinkSync(path.join(R, "node_modules"), path.join(tmp, "node_modules"));
      const fp = path.join(tmp, file), src = fs.readFileSync(fp, "utf8"), out = fn(src); if (out === src) { console.log("MUTANT BROKEN (no change): " + name); survived++; continue; }
      fs.writeFileSync(fp, out);
      const r = spawnSync(process.execPath, [path.join(tmp, "scripts/failedReadNeverStoredCheck.mjs"), tmp], { encoding: "utf8", timeout: 180000 }), o = (r.stdout || "") + (r.stderr || "");
      const killed = r.status !== 0 && o.split("\n").some(l => l.startsWith("FAIL") && l.includes(expect)); console.log((killed ? "killed   " : "SURVIVED ") + name); if (!killed) survived++;
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }
  console.log(survived ? `${survived} mutant(s) survived` : "all mutants killed"); return survived ? 1 : 0;
}
