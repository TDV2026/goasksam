// CREW KEYS REPORT (Lane B, Nov 6 2026; Sam: "the small read-only ops task that reports what crew_featured_history and crew_tasks_demo hold and the funnel counts, so I can ask Lane F for them").
// ops task=crewkeys (api/usageDashboard.js -> api/pullLive.js -> crewKeysReport in lib/live/tasksDemo.js): behind the ops key like every ops task; for each of the two keys: held or not, the pick (car, request, criteria, earlier record, selected and checked
// times) or the no-pick marker; with funnel=1 the counts the refresh finds on the live pool (live, with a VIN, with an earlier record, tried, why each failed). READ ONLY: no write, no delete, no OldCarsData.
// No public surface returns it: the cron response still carries only a word (featuredHistoryCheck 8, tasksDemoCheck 7).
//   node scripts/crewKeysCheck.mjs [repo root]      --mutants proves each rule by breaking it in a copy
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { fileURLToPath, pathToFileURL } from "node:url"; import { spawnSync } from "node:child_process";
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), rootArg = args.find(a => !a.startsWith("--"));
const root = path.resolve(rootArg || path.join(here, ".."));
if (args.includes("--mutants")) {
  const muts = [
    ["lib/live/tasksDemo.js", "{ select: sel, write: noop, clear: noop }).catch(e => ({ why: \"error\", error: String(e && e.message || e) }));\n    const f2", "{ select: sel }).catch(e => ({ why: \"error\", error: String(e && e.message || e) }));\n    const f2", "the featured funnel run writes or clears the store"],
    ["lib/live/tasksDemo.js", "const f2 = await td.refreshTasksDemo(env, { select: sel, write: noop, clear: noop })", "const f2 = await td.refreshTasksDemo(env, { select: sel })", "the demo funnel run writes or clears the store"],
    ["lib/live/tasksDemo.js", "const sel = (e, q) => (/^app_config/.test(q) ? Promise.resolve([]) : supabaseSelect(e, q))", "const sel = (e, q) => supabaseSelect(e, q)", "the funnel run reads the stored pick and stops at kept"],
    ["api/usageDashboard.js", "if (task === \"crewkeys\") {\n    if (!env)", "if (task === \"crewkeys\" && false) {\n    if (!env)", "the ops task is not served"],
    ["lib/live/tasksDemo.js", "const one = (v, pick) => (!v ? { held: false } :", "const one = (v, pick) => (!v ? { held: true } :", "an empty key reads as held"],
    ["lib/live/tasksDemo.js", "const funnel = { live: live.length,", "const funnel = { live: 0,", "the demo funnel counts a wrong live pool"]
  ];
  let survivors = 0;
  for (const [file, from, to, want] of muts) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "crewkeys-"));
    spawnSync("rsync", ["-a", "--exclude", ".git", "--exclude", "node_modules", "--exclude", "proofs", root + "/", dir + "/"]);
    fs.symlinkSync(path.join(root, "node_modules"), path.join(dir, "node_modules"));
    const fp = path.join(dir, file), src = fs.readFileSync(fp, "utf8"), m = src.replace(from, to);
    if (m === src) { console.log(`MUTANT NOT APPLIED  ${want}`); survivors++; fs.rmSync(dir, { recursive: true, force: true }); continue; }
    fs.writeFileSync(fp, m);
    const r = spawnSync(process.execPath, [path.join(dir, "scripts/crewKeysCheck.mjs"), dir], { encoding: "utf8" });
    const killed = r.status !== 0 && /^FAIL/m.test((r.stdout || "") + (r.stderr || ""));
    console.log(`${killed ? "killed  " : "SURVIVED"}  ${want}`); if (!killed) survivors++;
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(survivors ? `\n${survivors} mutant(s) survived` : "\nall mutants killed"); process.exit(survivors ? 1 : 0);
}
process.chdir(root);
process.env.LAUNCH_STAGE = "2"; process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.PROBE_KEY = "check-key-not-real"; process.env.OLDCARSDATA_API_KEY = "not-used";
const imp = f => import(pathToFileURL(path.join(root, f)).href);
let pass = 0, fail = 0; const ok = (name, c, d) => { if (c) pass++; else fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${d ? "  " + d : ""}`); };
const NOW = Date.now(), IN = h => new Date(NOW + h * 3600e3).toISOString();
let STORE = {}; const calls = [];
const live = [1, 2, 3, 4].map(i => ({ id: i, source: "bringatrailer", url: "https://auction.test/" + i, photo_url: "https://img.test/" + i + ".jpg", listing_title: "2019 Porsche 911 lot " + i, year: 2019, make: "Porsche", model: "911", vin_norm: i <= 3 ? "WP0AB2A9XKS00000" + i : null, mileage: 4000 + i, mileage_unit: "miles", transmission: "Manual", exterior_color: "White", current_bid: 100000, current_bid_usd: 100000, currency: "USD", country: "US", location: "Charlotte, NC", status: "live", end_time: IN(5 + i), description: "" }));
globalThis.fetch = async (u, init = {}) => {
  const url = String(u), method = String(init.method || "GET").toUpperCase(); calls.push({ method, url });
  const hdr = { "content-type": "application/json", "content-range": "0-0/1" };
  if (/app_config/.test(url) && method === "GET") { const rows = Object.entries(STORE).map(([key, value]) => ({ key, value })); const m = /key=eq\.([a-z_]+)/.exec(url); return new Response(JSON.stringify(m ? rows.filter(r => r.key === m[1]) : rows), { status: 200, headers: hdr }); }
  if (/live_listings/.test(url) && method === "GET") return new Response(JSON.stringify(/id=eq\.|id=in\./.test(url) ? live.filter(r => url.includes("id=eq." + r.id)) : live), { status: 200, headers: hdr });
  if (method === "GET") return new Response("[]", { status: 200, headers: hdr });
  return new Response("{}", { status: 200, headers: hdr });
};
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
const PL = await imp("api/pullLive.js"), FH = await imp("lib/live/featuredHistory.js"), TD = await imp("lib/live/tasksDemo.js");
const writes = () => calls.filter(c => c.method !== "GET" && !/spec_market_cache/.test(c.url)).length;   // the crew keys and everything else: none. The Task matcher the demo funnel runs may fill the market cache for the cars it matches (spec_market_cache, a cache, written in the background); that is the matcher's own, existing, and is counted apart below
// 1 nothing held
{
  STORE = {}; calls.length = 0; const r = await PL.crewKeysReport(env);
  ok("no key held: both read as not held", r[FH.STORE_KEY] && r[FH.STORE_KEY].held === false && r[TD.STORE_KEY] && r[TD.STORE_KEY].held === false, JSON.stringify([r[FH.STORE_KEY], r[TD.STORE_KEY]]));
  ok("the report is read only and spends no OldCarsData", writes() === 0 && r.writes === 0 && r.ocdSpend === 0, `${writes()} writes`);
}
// 2 both held, and a no-pick marker
{
  STORE = {
    [FH.STORE_KEY]: { v: FH.STORE_V, listingId: 3, selectedAt: IN(-3), checkedAt: IN(-0.2), featured: { kind: "sold", current: { title: "2019 Porsche 911", platform: "Sotheby's Motorsport", endsAt: IN(8), mileage: 4783 }, previous: { kind: "sold", date: "February 2023", platform: "Bring a Trailer", mileage: 3100, price: 325000, historyUrl: "/vin/WP0AB2A9XKS000003" } } },
    [TD.STORE_KEY]: { none: true, sweptAt: IN(-0.1) }
  };
  calls.length = 0; const r = await PL.crewKeysReport(env), a = r[FH.STORE_KEY], b = r[TD.STORE_KEY];
  ok("a held history pick is reported: the car, the earlier record, when selected and checked", a.held && a.car.title === "2019 Porsche 911" && a.car.platform === "Sotheby's Motorsport" && a.previous.price === 325000 && a.previous.historyUrl === "/vin/WP0AB2A9XKS000003" && !!a.selectedAt && !!a.checkedAt && a.listingId === 3, JSON.stringify(a));
  ok("a no-pick marker is reported as held with none and the sweep time", b.held && b.none === true && !!b.sweptAt && !b.car, JSON.stringify(b));
  STORE[TD.STORE_KEY] = { v: TD.STORE_V, listingId: 3, matchedAt: IN(-1), checkedAt: IN(-0.2), field: { request: "Find me a manual white Porsche 911 with under 10,000 miles, under $250,000, within 25 miles of Charlotte, NC", criteria: ["white", "manual", "under $250,000"], car: { title: "2019 Porsche 911", platform: "Sotheby's Motorsport", priceLabel: "Current bid $199,000", mileage: 4783, location: "Charlotte, NC", endsAt: IN(8) }, previous: { kind: "sold", date: "February 2023", platform: "Bring a Trailer", mileage: 3100, price: 325000, historyUrl: "/vin/WP0AB2A9XKS000003" } } };
  const r2 = await PL.crewKeysReport(env), d = r2[TD.STORE_KEY];
  ok("a held demo pick is reported: the request, the criteria, the price line and the earlier record", d.held && /^Find me a manual white Porsche 911/.test(d.request) && d.criteria.length === 3 && d.car.priceLabel === "Current bid $199,000" && d.previous.kind === "sold" && !!d.matchedAt, JSON.stringify(d));
}
// 3 the funnel: counts only, nothing written, the stored pick hidden so the selection really runs
{
  calls.length = 0; const r = await PL.crewKeysReport(env, { funnel: true }), f = r.funnel;
  ok("the funnel run writes and deletes nothing in the crew keys or anywhere but the market cache, even with a pick stored", writes() === 0, `${writes()} writes: ${calls.filter(c => c.method !== "GET").map(c => c.method + " " + c.url.slice(-40)).join(" | ")}`);
  ok("the demo funnel counts the live pool and the cars with a VIN (4 live, 3 with a VIN)", f && f.demo && f.demo.funnel && f.demo.funnel.live === 4 && f.demo.funnel.withVin === 3, JSON.stringify(f && f.demo));
  ok("the history funnel counts the same pool", f && f.featured && f.featured.funnel ? f.featured.funnel.live === 4 && f.featured.funnel.withVin === 3 : f && f.featured && ["none_eligible", "selected", "screen_unreadable", "live_unreadable"].includes(f.featured.why), JSON.stringify(f && f.featured));
  ok("the funnel run ran the selection (it did not stop at kept)", f && f.demo.why !== "kept" && f.featured.why !== "kept", `${f && f.demo.why} / ${f && f.featured.why}`);
}
// 4 the door: behind the ops key; the cron response still carries no car
{
  const UD = await imp("api/usageDashboard.js"), run = async headers => { let st = 0, body = null; const res = { setHeader() {}, status(c) { st = c; return this; }, json(j) { body = j; return this; }, end() { return this; } }; await UD.default({ method: "GET", query: { view: "ops", task: "crewkeys" }, headers, url: "/api/usageDashboard?view=ops&task=crewkeys", socket: { remoteAddress: "127.0.0.1" } }, res); return { st, body }; };
  const no = await run({}), bad = await run({ "x-ops-key": "wrong" }), yes = await run({ "x-ops-key": "check-key-not-real" });
  ok("without the ops key the task answers 401 and no pick", no.st === 401 && !JSON.stringify(no.body || {}).includes("held"), `${no.st}`);
  ok("with a wrong key the task answers 401", bad.st === 401, `${bad.st}`);
  ok("with the ops key the task answers the report", yes.st === 200 && yes.body && yes.body.task === "crewkeys" && yes.body[FH.STORE_KEY] && yes.body[TD.STORE_KEY], `${yes.st} ${JSON.stringify(yes.body).slice(0, 200)}`);
  const pl = fs.readFileSync("api/pullLive.js", "utf8"), handler = pl.slice(0, pl.indexOf("export async function crewKeysReport"));
  ok("no cron or public branch calls the report", !/crewKeysReport/.test(handler.replace(/\/\/.*$/gm, "")));
}
console.log(`\ncrewKeysCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
