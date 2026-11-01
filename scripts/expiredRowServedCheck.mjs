// clock: real-ok every row is stamped relative to now (hours and days old), so no calendar date is asserted (Lane B, Nov 1 2026)
// AN EXPIRED STORED ROW IS SERVED, AND REFRESHED BEHIND THE RESPONSE (Lane B, Nov 1 2026; Sam's ruling after the live reads: 121 of the 145 common texts typed in 14 days had a stored row past the 24 hour limit, so each reader's request computed the car cold, a Mustang took 7 s).
// RULE: a stored row with the live engine stamp and the live sales epoch, under 7 days old, is served at once; over 24 hours old it is also marked stale, so the caller recomputes it behind the response. A different stamp, a different or unknown epoch, 7 days or older, or no row: computed as before.
// ONE REFRESH PER ROW, A FEW AT ONCE (lib/refreshGate.js): many readers of one car start one refresh; an instance runs at most REFRESH_CAP (default 3), a refused row is served as stored. Questions store no row (unchanged).
// WHO: every car with a stored row on every page that reads it (Market Check, Find, Sell, VIN history); only a Market Check read starts the refresh. Fails without the fix.
//   node scripts/expiredRowServedCheck.mjs [repo root]
import fs from "node:fs";
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
const EPOCH = "2026-10-28T19:34:12.871Z";
let ROW = null, reads = 0;
globalThis.fetch = async (url) => { const u = new URL(String(url)); if (u.hostname !== "fake.supabase.test") throw new Error("offline"); const p = u.pathname;
  if (p.endsWith("/app_config")) return new Response(JSON.stringify([{ value: EPOCH }]), { status: 200 });
  if (p.endsWith("/spec_market_cache")) { reads++; return new Response(JSON.stringify(ROW ? [ROW] : []), { status: 200 }); }
  return new Response("[]", { status: 200 }); };
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const imp = f => import(pathToFileURL(path.join(root, f)).href);
const E = await imp("lib/onebox.js"), S = await imp("lib/live/search.js"), G = await imp("lib/refreshGate.js").catch(() => null);
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
const H = 3600e3, D = 24 * H, ago = ms => new Date(Date.now() - ms).toISOString();
const row = (raw, ageMs, over = {}) => ({ computed_at: ago(ageMs), market: { raw, engineVersion: E.ENGINE_VERSION, warmEpoch: EPOCH, ...over } });
const RAW = { tier: "result", poolN: 14, rawPool: [{ id: "a" }], cluster: [1, 2], resolvedCar: { year: 2004, make: "BMW", model: "M3" } };
const read = async (r) => { ROW = r; return S.readWarmAnswerDetailed(env, "MCWARM:x"); };
// 1. the band
let d = await read(row(RAW, 3 * H)); ok("a row 3 hours old is served fresh (unchanged)", !!d.raw && d.stale === false, d.reason);
d = await read(row(RAW, 30 * H)); ok("a row 30 hours old, stamp and epoch matching, is served at once and marked stale", !!d.raw && d.stale === true && d.reason === "expired_over_24h", d.reason);
d = await read(row(RAW, 6.9 * D)); ok("a row 6.9 days old is served and marked stale", !!d.raw && d.stale === true, d.reason);
d = await read(row(RAW, 7 * D + 60e3)); ok("a row 7 days old computes cold (no row served)", d.raw === null && d.reason === "ttl_expired", d.reason);
d = await read(row(RAW, 30 * H, { engineVersion: "old-stamp" })); ok("a row 30 hours old with another engine stamp computes cold", d.raw === null, d.reason);
d = await read(row(RAW, 30 * H, { warmEpoch: "2026-10-01T00:00:00.000Z" })); ok("a row 30 hours old with another sales epoch computes cold", d.raw === null && d.reason === "ttl_expired", d.reason);
d = await read(row(RAW, 30 * H, { warmEpoch: null })); ok("a row 30 hours old with no epoch to confirm computes cold", d.raw === null, d.reason);
d = await read(null); ok("no row computes cold", d.raw === null && d.reason === "no_row", d.reason);
d = await read(row(RAW, 3 * H, { warmEpoch: "2026-10-01T00:00:00.000Z" })); ok("a row under 24 hours with another epoch is served stale as before", !!d.raw && d.stale === true && d.reason === "epoch_mismatch", d.reason);
d = await read(row({ tier: "refusal", refusal: { kind: "invariant_failed", failedChecks: ["x"] }, poolN: 3 }, 30 * H)); ok("an expired invariant refusal is still never served", d.raw === null, d.reason);
// 2. the served output equals a fresh row's, for three cars (answer fields; the stale marker, dated line and snapshot id are the wire's, not the answer's)
for (const f of ["answer-325i.json", "answer-diablo.json", "answer-stag.json"]) {
  const a = JSON.parse(fs.readFileSync(path.join("scripts/fixtures", f), "utf8")), raw = a.raw || a, car = { year: raw.resolvedCar && raw.resolvedCar.year || 2000 };
  const exp = await read(row(raw, 30 * H)), fresh = await read(row(raw, 1 * H));
  const out = x => JSON.stringify(E.withReadFields(JSON.parse(JSON.stringify(x.raw)), "x", car));
  ok(`${f}: the expired row serves the answer a fresh row serves (bid line, time left, updatedLine, chart, options)`, !!exp.raw && !!fresh.raw && out(exp) === out(fresh) && exp.stale && !fresh.stale);
}
// 3. one refresh per row, a few at once
ok("lib/refreshGate.js exists", !!G);
if (G) {
  process.env.REFRESH_CAP = "3"; let runs = 0, release; const hold = new Promise(r => { release = r; });
  const job = () => { runs++; return hold; };
  const same = Array.from({ length: 20 }, () => G.tryRefresh("MCWARM:one", job));
  await Promise.resolve(); await Promise.resolve();
  ok("twenty readers of one expired row start one refresh", same.filter(x => x.state === "started").length === 1 && same.filter(x => x.state === "inflight").length === 19 && runs === 1);
  const others = ["a", "b", "c", "d", "e"].map(k => G.tryRefresh("MCWARM:" + k, job));
  ok("a burst of expired rows starts at most the cap (3 running, the first row counts), the rest are served as stored", others.filter(x => x.state === "started").length === 2 && others.filter(x => x.state === "capped").length === 3 && G.refreshesRunning() === 3, JSON.stringify(others.map(x => x.state)));
  release(); await Promise.all([...same, ...others].filter(x => x.promise).map(x => x.promise));
  ok("when the refreshes finish the slots are free again", G.refreshesRunning() === 0 && G.tryRefresh("MCWARM:z", async () => {}).state === "started");
  process.env.REFRESH_CAP = "0"; ok("a cap of 0 starts none", G.tryRefresh("MCWARM:q", job).state === "capped"); delete process.env.REFRESH_CAP;
}
// 4. the handler: the refresh goes through the gate, behind the response, never when another refresh runs, and a question stores no row
const sd = fs.readFileSync("api/sellerDecision.js", "utf8").replace(/\/\/[^\n]*/g, ""), at = sd.indexOf("const recomputeNow = async");
const blk = sd.slice(at, at + 2600);
ok("the handler starts the refresh through tryRefresh, under waitUntil, and not while a marker younger than 90 s says one runs", /tryRefresh\(warmKey, recomputeNow\)/.test(blk) && /waitUntil\(g\.promise\)/.test(blk) && /running_elsewhere/.test(blk) && !/waitUntil\(recomputeNow\(\)\)/.test(blk));
ok("the refresh stores only a cacheable answer that is not a question", /answerCacheable\(fr\) && !\/_choice\$\/\.test\(String\(fr\.tier/.test(blk));
console.log(fail ? `expiredRowServedCheck: ${fail} failure(s)` : "expiredRowServedCheck: all pass");
process.exit(fail ? 1 : 0);
