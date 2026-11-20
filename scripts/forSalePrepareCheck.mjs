// forSalePrepareCheck (Lane D, lane-d-forsale-prepare, Nov 19 2026): the for sale prepare job's catch up and the report's split, on a fake table (no network, no engine, no model).
//  1 THE RESOLVER ALONE, FIRST, ONCE PER DISTINCT TITLE: listings that give it the same inputs are one call, the answer is written to all of them; nothing is read from the engine before the resolver has had its turn.
//  2 ONE ENGINE READ PER DISTINCT CAR AND MILEAGE BAND: not per listing; the read is stamped on every listing of the group; a different band is another read; the biggest groups go first.
//  3 THE LIMITS: three engine reads at once, one run at a time (a lease), the time budget, a run with nothing to do ends at once, the table's 1,000 row page is walked in full.
//  4 THE CATCH UP: what is left is counted from the table, and a few runs finish a table of thousands.
//  5 THE REPORT: a split for every source (held, live, resolved, unresolved, not tried, hidden, gone, read, VIN history matches), the totals, the VIN history match count.
//   node scripts/forSalePrepareCheck.mjs [repo root]      --mutants breaks one rule at a time in a copy (each must fail)
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { spawnSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const args = process.argv.slice(2), here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(args.find(a => !a.startsWith("--")) || path.join(here, ".."));
if (args.includes("--mutants")) process.exit(mutants());
process.chdir(ROOT);
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
const PREP = await imp("lib/forsale/prepare.js"), REPORT = await imp("lib/forsale/report.js"), RULES = await imp("lib/forsale/rules.js"), { ENGINE_VERSION } = await imp("lib/onebox.js");
let pass = 0, fail = 0; const fails = []; const ok = (n, c, d) => { if (c) pass++; else { fail++; fails.push(n + (d !== undefined ? " " + JSON.stringify(d).slice(0, 260) : "")); } };
const section = async (name, fn) => { try { await fn(); } catch (e) { fail++; fails.push(name + " threw " + String(e && e.stack || e).slice(0, 300)); } };

// ---- a fake table with the filters the job and the report send (PostgREST in miniature) ----------------------------------------------------------------------------------------
const ENV = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
let NIGHTLY = [], NIGHTLY_DOWN = false, TABLE = [], LEASES = [], HALTS = [], LOG = [], PAGE_SEEN = [], FAIL_LEASE = false;
const jget = (r, p) => { const [a, b] = p.split("->>"); const v = r[a]; return b == null ? v : v == null ? null : v[b]; };
const filterRows = (rows, u) => {
  let out = rows;
  for (const [k, v] of u.searchParams) {
    if (["select", "order", "limit", "or"].includes(k)) continue;
    const m = /^(eq|neq|gt|lt|is|not\.is|in)\.(.*)$/.exec(v); if (!m) continue; const [, op, val] = m;
    out = out.filter(r => { const x = jget(r, k); if (op === "eq") return String(x) === val; if (op === "neq") return String(x) !== val; if (op === "gt") return Number(x) > Number(val); if (op === "lt") return String(x) < val; if (op === "is") return val === "null" ? x == null : String(x) === val; if (op === "not.is") return val === "null" ? x != null : true; if (op === "in") return val.replace(/^\(|\)$/g, "").split(",").includes(String(x)); return true; });
  }
  const orp = decodeURIComponent(u.searchParams.get("or") || "");
  if (/^\(resolve_state\.is\.null,/.test(orp)) { const ver = /neq\.([^)]+)\)$/.exec(orp)[1]; out = out.filter(r => r.resolve_state == null || !r.car || r.car.engine_version !== ver); }
  if (/^\(read\.is\.null,/.test(orp)) { const ver = /engine_version\.neq\.([^,]+),/.exec(orp)[1], lt = /at\.lt\.([^)]+)\)$/.exec(orp)[1]; out = out.filter(r => r.read == null || r.read.engine_version !== ver || String(r.read.at) < lt); }
  return out;
};
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = new URL(String(url)), method = (init && init.method) || "GET";
  if (u.pathname.endsWith("/app_usage_events") && (method === "POST" ? /nightly_lease/.test(String(init && init.body)) : u.searchParams.get("event_type") === "eq.nightly_lease")) {   // THE NIGHTLY LEASE rows (lib/nightlyLease.js): their own list, their own failure switch
    if (NIGHTLY_DOWN) return new Response("{}", { status: 500 });
    if (method === "POST") { for (const r of JSON.parse(init.body)) NIGHTLY.push({ id: NIGHTLY.length + 1, at: Date.now() + (globalThis.__SKEW || 0), status: r.status, metadata: r.metadata }); return new Response("", { status: 201 }); }
    const gte = decodeURIComponent(u.searchParams.get("created_at") || "").replace(/^gte\./, ""); return new Response(JSON.stringify(NIGHTLY.filter(l => !gte || l.at >= Date.parse(gte)).map(l => ({ id: l.id, status: l.status, metadata: l.metadata, created_at: new Date(l.at).toISOString() }))), { status: 200 });
  }
  if (u.pathname.endsWith("/app_usage_events")) {
    if (FAIL_LEASE === "throw") throw new Error("network");
    if (method === "POST") { if (FAIL_LEASE) return new Response("{}", { status: 500 }); for (const r of JSON.parse(init.body)) if (r.event_type === "forsale_prepare_halt") HALTS.push({ id: HALTS.length + 1, at: Date.now() + (globalThis.__SKEW || 0), metadata: r.metadata }); else LEASES.push({ id: LEASES.length + 1, at: Date.now() + (globalThis.__SKEW || 0), status: r.status, metadata: r.metadata }); return new Response("", { status: 201 }); }
    const gte = decodeURIComponent(u.searchParams.get("created_at") || "").replace(/^gte\./, ""); if (FAIL_LEASE) return new Response("{}", { status: 500 });
    if (u.searchParams.get("event_type") === "eq.forsale_prepare_halt") return new Response(JSON.stringify(HALTS.filter(h => !gte || h.at >= Date.parse(gte)).map(h => ({ id: h.id }))), { status: 200 });
    return new Response(JSON.stringify(LEASES.filter(l => !gte || l.at >= Date.parse(gte)).map(l => ({ id: l.id, status: l.status, metadata: l.metadata }))), { status: 200 });
  }
  if (!u.pathname.endsWith("/for_sale_listings")) return new Response("{}", { status: 404 });
  const hit = filterRows(TABLE, u);
  if (method === "PATCH") { const body = JSON.parse(init.body); for (const r of hit) Object.assign(r, body); LOG.push(["PATCH", hit.length]); return new Response("[]", { status: 200 }); }
  if (method === "HEAD") return new Response("", { status: 200, headers: { "content-range": `0-0/${hit.length}` } });
  const lim = Math.min(Number(u.searchParams.get("limit")) || 1000, 1000); PAGE_SEEN.push(lim);
  return new Response(JSON.stringify(hit.slice().sort((a, b) => a.id - b.id).slice(0, lim)), { status: 200 });
};

// ---- fixtures: listings over a few cars, with titles, mileages and a VIN or not -------------------------------------------------------------------------------------------------
const mk = (i, o = {}) => ({ id: i, source: "streetside", source_type: "dealer", source_listing_id: "L" + i, title: o.title || "1987 Porsche 911 Carrera", year: o.year || 1987, make: "Porsche", model: "911", asking_price_usd: o.price === undefined ? 50000 : o.price, mileage: o.mileage === undefined ? 40000 : o.mileage, gone: !!o.gone, hidden: !!o.hidden, resolve_state: o.resolve_state || null, car: o.car || null, car_key: o.car_key || null, read: o.read || null, history: null, vin_norm: o.vin || null, last_seen: new Date().toISOString(), body: null, transmission: null, exterior_color: null, location: "X, ST", country_code: "US", currency: "USD" });
const specFor = title => /Ghost/.test(title) ? null : { key: "key:" + title.replace(/^\d{4} /, "").replace(/\s+/g, "_"), v: /Mustang/.test(title) ? { make: "Ford", model: "Mustang", year: 1965 } : { make: "Porsche", model: "911", year: 1987 }, generation: null };
const ENGINE = (log = {}) => ({
  specOf: async (env, lr) => { log.spec = (log.spec || 0) + 1; (log.order = log.order || []).push("spec"); await new Promise(r => setTimeout(r, log.specMs || 0)); if (log.specUndefined && log.specUndefined.test(lr.listing_title)) return undefined; return specFor(lr.listing_title); },
  listingMarket: async (env, lr, facts) => { if (log.failReads && (log.callN = (log.callN || 0) + 1) <= log.failReads) throw new Error("archive read failed"); (log.order = log.order || []).push("read"); log.reads = (log.reads || 0) + 1; log.cur = (log.cur || 0) + 1; log.max = Math.max(log.max || 0, log.cur); await new Promise(r => setTimeout(r, log.readMs || 5)); log.cur--; (log.keys = log.keys || []).push(lr.listing_title + "|" + facts.miles); return { kind: "range", low: 40000, high: 60000 }; },
  seenBefore: async (env, vin) => { log.vins = (log.vins || 0) + 1; return null; }
});
// the config the older rules below run under: three wide, no nightly window (the rules they cover are about the lease, the budget, the failures and the table, not the width setting; the width and the window have their own section at the end)
const CFG0 = JSON.parse(fs.readFileSync(path.join(ROOT, "data/forsaleBudget.json"), "utf8")), WIDE = { ...CFG0, schedule: { ...CFG0.schedule, prepare_on: false }, prepare: { ...CFG0.prepare, read_width: 3, nightly_pause_utc: null } };
const reset = rows => { NIGHTLY = []; NIGHTLY_DOWN = false; TABLE = rows; LEASES = []; HALTS = []; LOG = []; PAGE_SEEN = []; FAIL_LEASE = false; globalThis.__SKEW = 0; };
const run = (log, o) => PREP.prepareForSale(ENV, { cfg: WIDE, budgetMs: 20000, engine: ENGINE(log), ...(o || {}) });

await section("the resolver alone, first, once per distinct title", async () => {
  // 40 listings of 5 distinct titles (8 each), one title the resolver cannot place
  const titles = ["1987 Porsche 911 Carrera", "1988 Porsche 911 Carrera", "1989 Porsche 911 Targa", "1990 Porsche 911 Speedster", "1987 Ghost Mobile"];
  reset(Array.from({ length: 40 }, (_, i) => mk(i + 1, { title: titles[i % 5], year: 1987 + (i % 5) })));
  const log = {}, o = await run(log);
  ok("40 listings of 5 distinct titles are 5 resolver calls, not 40", log.spec === 5 && o.resolveCalls === 5 && o.distinctInputs === 5, [log.spec, o.resolveCalls, o.distinctInputs]);
  ok("every listing of a placed title is resolved to the same car (name, key, engine version, its own title)", TABLE.filter(r => r.resolve_state === "resolved").length === 32 && TABLE.filter(r => r.resolve_state === "resolved").every(r => r.car && r.car.key === r.car_key && r.car.engine_version === ENGINE_VERSION && r.car.title === r.title), TABLE[0].car);
  ok("every listing of the title the resolver cannot place is unresolved (8), counted, and never read", o.unresolved === 8 && TABLE.filter(r => r.resolve_state === "unresolved").length === 8 && TABLE.filter(r => /Ghost/.test(r.title)).every(r => r.read == null));
  const firstRead = log.order.indexOf("read"), lastSpec = log.order.lastIndexOf("spec");
  ok("the resolver has had every distinct title before the first engine read (resolver alone first)", firstRead > lastSpec && lastSpec >= 0, log.order.slice(0, 12));
  ok("the writes are one patch for a group, not one a listing: 5 resolve patches for 40 listings", LOG.filter(x => x[0] === "PATCH").slice(0, 5).map(x => x[1]).join() === "8,8,8,8,8" || LOG.slice(0, 5).every(x => x[1] === 8), LOG.slice(0, 6));
  const t = {}; reset(Array.from({ length: 6 }, (_, i) => mk(i + 1, { title: i < 3 ? "1991 Porsche 911 Carrera" : "1992 Porsche 911 Carrera", year: i < 3 ? 1991 : 1992 })));
  const o2 = await run({ specUndefined: /1992/ });
  ok("a resolver that does not answer leaves its listings untried (never marked unresolved), the others resolved", TABLE.filter(r => r.year === 1992).every(r => r.resolve_state == null) && TABLE.filter(r => r.year === 1991).every(r => r.resolve_state === "resolved"), TABLE.map(r => r.resolve_state));
});
await section("one engine read per distinct car and mileage band", async () => {
  // car A: 30 listings, 20 at 40,000 miles (band 25000-50000) and 10 at 80,000 (50000-100000); car B: 12 listings in the same band; one listing with no mileage; one with no price
  const rows = [];
  for (let i = 0; i < 20; i++) rows.push(mk(rows.length + 1, { title: "1987 Porsche 911 Carrera", mileage: 40000 }));
  for (let i = 0; i < 10; i++) rows.push(mk(rows.length + 1, { title: "1987 Porsche 911 Carrera", mileage: 80000 }));
  for (let i = 0; i < 12; i++) rows.push(mk(rows.length + 1, { title: "1989 Porsche 911 Targa", year: 1989, mileage: 30000 + i * 100 }));
  rows.push(mk(rows.length + 1, { title: "1989 Porsche 911 Targa", year: 1989, mileage: null }));
  rows.push(mk(rows.length + 1, { title: "1989 Porsche 911 Targa", year: 1989, mileage: 30000, price: 0 }));
  reset(rows); const log = {}, o = await run(log);
  ok("44 priced listings are 4 engine reads (car A in two mileage bands, car B in one band, car B with no mileage), not 44", log.reads === 4 && o.readCalls === 4 && o.readGroups === 4, [log.reads, o.readCalls, o.readGroups]);
  ok("the read is stamped on EVERY listing of a group (43 listings read), the same range and the same stamp time inside a group", o.reads === 43 && TABLE.filter(r => r.read).length === 43 && new Set(TABLE.filter(r => r.mileage === 40000 && r.title.includes("Carrera")).map(r => JSON.stringify(r.read))).size === 1, [o.reads, TABLE.filter(r => r.read).length]);
  ok("a different mileage band is another read of the same car (40,000 and 80,000 miles: 2 reads of car A)", log.keys.filter(k => /Carrera/.test(k)).length === 2, log.keys);
  ok("a listing with no price is not read (no read stamped, no engine call for it)", TABLE.find(r => r.price === 0 || r.asking_price_usd === 0).read === null);
  ok("the stamped read is the engine's words (a range and the engine's version), the same shape one listing a read gave", TABLE[0].read.kind === "range" && TABLE[0].read.low === 40000 && TABLE[0].read.engine_version === ENGINE_VERSION && typeof TABLE[0].read.sold_line === "string" && TABLE[0].read.sold_line.length > 5, TABLE[0].read);
  ok("the biggest group is read first (the 20 listing group before the 10 and the 12)", log.keys[0].endsWith("|40000"), log.keys);
  const again = {}, o2 = await run(again); ok("a second run reads nothing again (the stamped reads are current) and ends at once", again.reads === undefined && o2.reads === 0 && o2.readCalls === 0, o2);
  const ageH = h => new Date(Date.now() - h * 3600e3).toISOString(), pick = TABLE.filter(r => r.read).slice(0, 10);
  pick.forEach(r => { r.read = { ...r.read, at: ageH(13) }; });
  const l3 = {}; const o3 = await run(l3); ok("a read 13 hours old is KEPT (a read lives 7 days, data/forsaleBudget.json prepare.read_age_hours 168): no engine read, nothing requeued", (l3.reads || 0) === 0 && o3.reads === 0 && o3.readCalls === 0 && pick.every(r => r.read && r.read.at === pick[0].read.at), [l3.reads, o3.reads]);
  pick.forEach(r => { r.read = { ...r.read, at: ageH(24 * 8) }; });
  const l8 = {}; const o8 = await run(l8); ok("a read 8 days old is made again, still one read per group", l8.reads >= 1 && l8.reads <= 3 && o8.reads >= 10 && pick.every(r => Date.now() - Date.parse(r.read.at) < 3600e3), [l8.reads, o8.reads]);
  ok("the age is the setting, not a constant: 168 hours in data/forsaleBudget.json, read by readAgeMs", PREP.READ_MAX_AGE_MS === 168 * 3600e3 && PREP.readAgeMs({ prepare: { read_age_hours: 24 } }) === 24 * 3600e3 && PREP.readAgeMs({}) === 168 * 3600e3);
  reset(Array.from({ length: 5 }, (_, i) => mk(i + 1, { gone: i === 0, hidden: i === 1 }))); const l4 = {}; await run(l4);
  ok("a gone listing and a hidden listing are never resolved or read", TABLE[0].resolve_state == null && TABLE[1].resolve_state == null && TABLE.slice(2).every(r => r.resolve_state === "resolved" && r.read));
  { const rc = { resolve_state: "resolved", car_key: "key:old", car: { key: "key:old", engine_version: ENGINE_VERSION } }; reset([mk(1, { ...rc, gone: true }), mk(2, { ...rc, hidden: true }), mk(3, rc)]); const l6 = {}; const o6 = await run(l6);
    ok("a RESOLVED listing that is gone or hidden is not read either (1 read for the one live listing)", l6.reads === 1 && TABLE[0].read === null && TABLE[1].read === null && TABLE[2].read !== null && o6.reads === 1, [l6.reads, o6.reads]); }
  const nr = mk(1); reset([nr, mk(2)]); const l5 = {}; const o5 = await PREP.prepareForSale(ENV, { cfg: WIDE, budgetMs: 20000, engine: { ...ENGINE(l5), listingMarket: async () => ({ kind: "pending" }) } });
  ok("a read the engine has not got ready stamps nothing, and every listing of the group stays to be read", o5.readsNotReady === 2 && TABLE.every(r => r.read === null) && o5.left.toRead === 2, o5);
});
await section("the VIN history, once per VIN", async () => {
  const V = "WP0AB0914HS120001"; reset(Array.from({ length: 6 }, (_, i) => mk(i + 1, { title: "1987 Porsche 911 Carrera", vin: V })).concat([mk(7, { title: "1987 Porsche 911 Carrera", vin: "WP0AB0914HS120002" })]));
  const log = {}, o = await run(log);
  ok("a VIN is looked up once however many listings carry it (7 listings, 2 VINs: 2 lookups) and the finished record is stamped on all of them", log.vins === 2 && o.histories === 7 && TABLE.every(r => r.history && r.history.none === true), [log.vins, o.histories]);
});
await section("the limits", async () => {
  reset(Array.from({ length: 30 }, (_, i) => mk(i + 1, { title: "1987 Porsche 911 Carrera " + i, year: 1987, mileage: 40000 })));
  const log = { readMs: 20 }; await run(log, { concurrency: 99 });
  ok("never more than three engine reads at once, whatever it is asked for (30 distinct cars, concurrency 99)", log.max === 3, log.max);
  // one run at a time
  reset(Array.from({ length: 6 }, (_, i) => mk(i + 1, { title: "1987 Porsche 911 Carrera " + i, mileage: 40000 })));
  const a = {}, b = {}, [r1, r2] = await Promise.all([run({ readMs: 80 }), run(b)]);
  ok("two runs at once: the second is refused as already running and does no work; the first completes", (r1.skipped === "already_running") !== (r2.skipped === "already_running") && [r1, r2].some(r => r.reads === 6) && b.spec === undefined || (r2.skipped === "already_running" && r1.reads === 6) || (r1.skipped === "already_running" && r2.reads === 6), [r1.skipped, r2.skipped, r1.reads, r2.reads]);
  ok("the lease is released when the run ends (running then released), so the next run goes", LEASES.map(l => l.status).filter(x => x === "released").length >= 1 && (await run({})).skipped === undefined);
  reset([mk(1)]); LEASES.push({ id: 99, at: Date.now() - 400000, status: "running", metadata: { lease: "dead" } }); const lapsed = await run({});
  ok("a lease that lapsed (a run that died 400 seconds ago) does not block the next run", lapsed.skipped === undefined && lapsed.reads === 1, lapsed);
  reset([mk(1)]); LEASES.push({ id: 99, at: Date.now(), status: "running", metadata: { lease: "live" } }); const busy = await run({});
  ok("a run that is live blocks: the next is refused, and reads and resolves nothing", busy.skipped === "already_running" && TABLE[0].resolve_state == null, busy);
  reset([mk(1)]); FAIL_LEASE = true; const down = await run({}); ok("fail closed: a lease that cannot be written or read means the run does nothing", !!down.skipped && TABLE[0].resolve_state == null, down);
  reset([mk(1)]); FAIL_LEASE = "throw"; const net = await run({}); ok("fail closed on a network error too: the run does nothing", !!net.skipped && TABLE[0].resolve_state == null, net);
  FAIL_LEASE = false;
  reset(Array.from({ length: 12 }, (_, i) => mk(i + 1, { title: "1987 Porsche 911 Carrera " + i })));
  const slow = {}, t0 = Date.now(), o = await PREP.prepareForSale(ENV, { cfg: WIDE, budgetMs: 2500, engine: ENGINE({ specMs: 400, readMs: 400 }), resolveWidth: 1, concurrency: 1 });
  ok("the time budget stops a run (budget 2.5 s with 0.4 s calls, one at a time): it ends inside the budget with work left, and says how much", Date.now() - t0 < 4200 && o.left.toResolve + o.left.toRead > 0 && o.resolveCalls < 12, [Date.now() - t0, o.resolveCalls, o.left]);
  ok("and what is left to resolve is counted from the table: the run says how many listings the resolver still has to place", o.left.toResolve > 0 && o.left.toResolve === TABLE.filter(r => r.resolve_state == null).length, [o.left, TABLE.filter(r => r.resolve_state == null).length]);
  { const rc = i => ({ resolve_state: "resolved", car_key: "key:c" + i, car: { key: "key:c" + i, engine_version: ENGINE_VERSION } }); reset(Array.from({ length: 12 }, (_, i) => mk(i + 1, { title: "1987 Porsche 911 Carrera " + i, ...rc(i) })));
    const tb = Date.now(), o2 = await PREP.prepareForSale(ENV, { cfg: WIDE, budgetMs: 1500, engine: ENGINE({ readMs: 300 }), concurrency: 1 });
    ok("the time budget stops the reads: 12 cars at 0.3 s one at a time in a budget of 1.5 s are not all read, and the run ends inside the budget", o2.reads < 12 && o2.reads >= 1 && Date.now() - tb < 2600 && o2.left.toRead === 12 - o2.reads, [o2.reads, Date.now() - tb, o2.left]); }
  reset([]); const none = await run({}); ok("a run with nothing to do ends at once with nothing left", none.ms < 500 && none.left.toResolve === 0 && none.left.toRead === 0 && none.resolved === 0, none);
  reset(Array.from({ length: 2300 }, (_, i) => mk(i + 1, { title: "1987 Porsche 911 Carrera " + (i % 40) }))); PAGE_SEEN = [];
  const big = await PREP.prepareForSale(ENV, { cfg: WIDE, budgetMs: 60000, engine: ENGINE({}) });
  ok("the table answers 1,000 rows a page: all 2,300 listings are walked in full (3 pages), resolved and read", big.resolved === 2300 && TABLE.every(r => r.resolve_state === "resolved") && PAGE_SEEN.some(n => n === 1000), [big.resolved, big.reads]);
});

await section("the queue by demand (Nov 19 2026)", async () => {
  const mkRows = () => { const rows = [];
  for (let i = 0; i < 20; i++) rows.push(mk(rows.length + 1, { title: "1987 Porsche 911 Carrera", mileage: 40000 }));
  for (let i = 0; i < 5; i++) rows.push(mk(rows.length + 1, { title: "1965 Ford Mustang", year: 1965, mileage: 40000 }));
  for (let i = 0; i < 9; i++) rows.push(mk(rows.length + 1, { title: "1989 Porsche 911 Targa", year: 1989, mileage: 40000 })); return rows; };
  const demand = new Map([[PREP.demandKey("Ford", "Mustang"), 120], [PREP.demandKey("Porsche", "911"), 7]]);
  reset(mkRows()); const log = {}, o = await run(log, { demand });
  ok("the car searched most is read first, though it has the fewest cards (Mustang 120 searches, 5 listings, before the 911s)", log.keys[0].startsWith("1965 Ford Mustang"), log.keys);
  ok("then the cars with the same demand go by card count (Carrera 20 before Targa 9)", log.keys.findIndex(k => /Carrera/.test(k)) < log.keys.findIndex(k => /Targa/.test(k)), log.keys);
  ok("the top of the queue is reported: car name, listings, searches, in the order it started", Array.isArray(o.started) && o.started.length === 3 && o.started[0].searches === 120 && o.started[0].listings === 5 && o.started[1].listings === 20 && o.started[0].car && !("title" in o.started[0]), o.started);
  reset(mkRows()); const l2 = {}; await run(l2, { demand: new Map() });
  ok("no demand at all keeps the old order (the most cards first)", l2.keys[0].startsWith("1987 Porsche 911 Carrera"), l2.keys);
  ok("demandKey ignores case, spaces and punctuation; demandOf with the table unreadable is no demand, never an error", PREP.demandKey("Mercedes-Benz", "300 SL") === PREP.demandKey("mercedes benz", "300sl") && (await PREP.demandOf({ supabaseUrl: "http://127.0.0.1:9", supabaseKey: "k" })) instanceof Map && (await PREP.demandOf(null)) instanceof Map && await (async () => { const f = globalThis.fetch; globalThis.fetch = async () => new Response("nope", { status: 500 }); try { return (await PREP.demandOf(ENV)) instanceof Map; } finally { globalThis.fetch = f; } })());
  const by = PREP.byDemand([[{ r: { car: { make: "A", model: "x" } } }], [{ r: { car: { make: "B", model: "y" } } }, { r: {} }]], new Map([[PREP.demandKey("A", "x"), 3]]));
  ok("byDemand puts demand before size", by[0][0].r.car.make === "A");
});

await section("back to back, and the failure rules (Nov 20 2026)", async () => {
  const many = n => Array.from({ length: n }, (_, i) => mk(i + 1, { title: "1987 Porsche 911 Carrera " + i, mileage: 40000 }));
  // BACK TO BACK: a run keeps making passes until its time is used, not one batch (the passes are limited here to 40 rows so one batch is not the whole table)
  reset(many(120)); const lA = {}; const one = await PREP.prepareForSale(ENV, { cfg: WIDE, budgetMs: 60000, engine: ENGINE(lA), resolveLimit: 40, readLimit: 40, onePass: true });
  ok("one pass is one batch (the limit of 40 rows): 80 listings are left", one.passes === 1 && one.left.toResolve + one.left.toRead > 0 && TABLE.filter(r => r.read).length <= 40, [one.passes, one.left]);
  reset(many(120)); const lB = {}; const all = await PREP.prepareForSale(ENV, { cfg: WIDE, budgetMs: 60000, engine: ENGINE(lB), resolveLimit: 40, readLimit: 40 });
  ok("a run keeps making passes until the work is done or the time is used: 120 listings resolved and read in ONE run", all.passes >= 3 && TABLE.every(r => r.resolve_state === "resolved" && r.read) && all.left.toResolve === 0 && all.left.toRead === 0, [all.passes, all.left]);
  ok("and the reads stayed at three at once", (lB.max || 0) <= 3 && all.readWidth === 3, [lB.max, all.readWidth]);
  // THE FAILURE RULES: per 100 reads, over 5 failed drops to two at once; over 20 stops the run, records the halt and holds the job
  reset(many(260)); const lC = { failReads: 8, readMs: 4 }; const c = await PREP.prepareForSale(ENV, { cfg: WIDE, budgetMs: 60000, engine: ENGINE(lC), onePass: true });
  ok("8 failed reads in the first 100: the run drops to two reads at once, says so, and goes on", !!c.widthLowered && c.readWidth === 2 && !c.halted && c.reads > 100 && /over 5/.test(c.widthLowered.rule), [c.widthLowered, c.readWidth, c.reads]);
  reset(many(260)); const lD = { failReads: 30, readMs: 4 }; const d = await PREP.prepareForSale(ENV, { cfg: WIDE, budgetMs: 60000, engine: ENGINE(lD), onePass: true });
  ok("30 failed reads in the first 100: the run STOPS (halted, DECISION NEEDED) and does not go on to read the rest", !!d.halted && d.decisionNeeded === true && d.readCalls < 130 && TABLE.filter(r => r.read).length < 100 && HALTS.length === 1, [d.halted, d.readCalls, HALTS.length]);
  const lE = {}; const e = await PREP.prepareForSale(ENV, { cfg: WIDE, budgetMs: 60000, engine: ENGINE(lE), onePass: true });
  ok("the next run is refused for the hour (halted): it reads nothing until a person has looked", e.skipped === "halted" && lE.reads === undefined);
  reset(many(260)); const lF = { failReads: 5, readMs: 4 }; const f = await PREP.prepareForSale(ENV, { cfg: WIDE, budgetMs: 60000, engine: ENGINE(lF), onePass: true });
  ok("5 failed reads in 100 is inside the rule: no change of width, no halt", !f.widthLowered && !f.halted && f.readWidth === 3, [f.widthLowered, f.halted]);
});
await section("the catch up", async () => {
  // 3,000 listings, 200 distinct titles; the engine is slow enough that one run does not finish; the runs left are counted from the table, and the table is done in a few runs
  reset(Array.from({ length: 3000 }, (_, i) => mk(i + 1, { title: "1987 Porsche 911 Carrera " + (i % 200), mileage: 20000 + (i % 3) * 30000 }))); const total = { spec: 0, reads: 0 }; let runs = 0, o;
  do { const l = { specMs: 2, readMs: 6 }; o = await PREP.prepareForSale(ENV, { cfg: WIDE, budgetMs: 4500, engine: ENGINE(l), resolveWidth: 4 }); total.spec += l.spec || 0; total.reads += l.reads || 0; runs++; } while ((o.left.toResolve > 0 || o.left.toRead > 0) && runs < 40);
  ok("3,000 listings of 200 distinct titles are done in a few runs, with 200 resolver calls and 400 engine reads in all (200 cars in two mileage bands; not 3,000 of each)", runs <= 12 && total.spec === 200 && total.reads === 400 && TABLE.every(r => r.resolve_state === "resolved" && r.read), [runs, total]);
  ok("the run that ends the catch up says nothing is left (resolve 0, read 0)", o.left.toResolve === 0 && o.left.toRead === 0, o.left);
  const rep = await REPORT.catchUp(ENV); ok("the catch up arithmetic read off the table: 3,000 listings in 400 read groups (7.5 listings each), 200 distinct cars, none pending", rep.resolved_listings === 3000 && rep.read_groups === 400 && rep.distinct_cars === 200 && rep.read_groups_pending === 0 && rep.listings_per_group_avg === 7.5, rep);
});
await section("the report: a split for every source and the VIN history count", async () => {
  const S = Object.keys(RULES.SOURCE_TABLE), held = S.filter(s => RULES.SOURCE_TABLE[s].hold), live = S.filter(s => !RULES.SOURCE_TABLE[s].hold);
  const rows = []; let id = 1;
  const add = (source, n, o) => { for (let i = 0; i < n; i++) rows.push({ ...mk(id++, o), source }); };
  add(live[0], 5, { resolve_state: "resolved", car_key: "k", car: { key: "k", engine_version: ENGINE_VERSION }, read: { engine_version: ENGINE_VERSION, at: new Date().toISOString() } });
  add(live[0], 2, { resolve_state: "unresolved" }); add(live[0], 3, {}); add(live[0], 1, { hidden: true }); add(live[0], 4, { gone: true });
  add(live[1], 6, { resolve_state: "resolved", car_key: "k2", car: { key: "k2", engine_version: ENGINE_VERSION } });
  rows.slice(0, 3).forEach(r => { r.history = { none: false, line: "x", at: "z" }; }); rows[3].history = { none: true, at: "z" }; rows[18].history = { none: false, line: "y", at: "z" };
  add(live[1], 3, { gone: true, resolve_state: "resolved", car_key: "k3" });
  add(held[0], 4, {});
  reset(rows); const r = await REPORT.sourceSplit(ENV), b = r.bySource;
  ok("EVERY source the table knows is in the split, held ones too, each with every cell", S.every(s => b[s] && Object.keys(REPORT.CELLS).every(c => c in b[s]) && "held" in b[s]) && Object.keys(b).length === S.length, Object.keys(b).length);
  ok("a source's cells are its own (live " + live[0] + ": live 11 of 15 not gone, resolved 5, unresolved 2, not tried 3 (and the hidden one), hidden 1, gone 4)", b[live[0]].live === 11 && b[live[0]].resolved === 5 && b[live[0]].unresolved === 2 && b[live[0]].not_tried === 4 && b[live[0]].hidden === 1 && b[live[0]].gone === 4 && b[live[0]].with_read === 5, b[live[0]]);
  ok("another source is counted apart (resolved 6, live 6), and a source with no rows reads 0 in every cell", b[live[1]].resolved === 6 && b[live[1]].live === 6 && Object.keys(REPORT.CELLS).every(c => b[live[2]][c] === 0), [b[live[1]], b[live[2]]]);
  ok("held is a fact of the source (the held source says held true and still shows its rows)", b[held[0]].held === true && b[held[0]].live === 4 && b[live[0]].held === false, b[held[0]]);
  ok("the VIN history match count: a match is a history that is not none (4 rows), by source (3 for the first source, 1 for the second)", b[live[0]].vin_history_match === 3 && b[live[1]].vin_history_match === 1 && r.total.vin_history_match === 4, [b[live[0]].vin_history_match, r.total.vin_history_match]);
  ok("the totals are the sums of the sources, and say how many sources are held", r.total.live === 4 + 11 + 6 && r.total.gone === 7 && r.total.resolved === 11 && r.total.held_sources === held.length && r.total.sources === S.length, r.total);
  const api = fs.readFileSync(path.join(ROOT, "api/pullForSale.js"), "utf8");
  ok("the report route carries the split, the VIN history match count and (on cars=1) the catch up arithmetic", /sourceSplit\(env\)/.test(api) && /vinHistoryMatches/.test(api) && /q\.cars/.test(api) && /catchUp\(env\)/.test(api) && /lib\/forsale\/report\.js/.test(api));
  ok("the report names no listing text, seller or VIN: counts only", !/title|seller|vin_norm/.test(JSON.stringify(r)));
});
// 6 THE NIGHTLY LEASE AND THE WIDTH (Nov 20 2026): GitHub starts the nightly anywhere from 07:00 to 17:00 UTC, so no clock decides: the nightly's first script sets a lease (lib/nightlyLease.js), its last clears it, it expires alone after 90 minutes; the prepare job (the cron and the loop, one route) makes no read while it is held; the width follows data/forsaleBudget.json prepare.read_width.
await section("nightly lease and width", async () => {
  const NL = await imp("lib/nightlyLease.js"), LIVE = JSON.parse(fs.readFileSync(path.join(ROOT, "data/forsaleBudget.json"), "utf8")), mkRows = n => Array.from({ length: n }, (_, i) => mk(i + 1, { title: "1987 Porsche 911 Carrera " + i, mileage: 40000 })), E = { ...ENV };
  ok("the shipped file: no clock window, width 3", !("nightly_pause_utc" in (LIVE.prepare || {})) && LIVE.prepare.read_width === 3, LIVE.prepare);
  reset(mkRows(30)); const l0 = {}; const free = await PREP.prepareForSale(ENV, { cfg: WIDE, budgetMs: 20000, engine: ENGINE(l0) });
  ok("no lease: the job reads", free.skipped === undefined && (l0.reads || 0) > 0, [free.skipped, l0.reads]);
  reset(mkRows(30)); const set = await NL.setNightlyLease(ENV); const l1 = {}; const held = await PREP.prepareForSale(ENV, { cfg: WIDE, budgetMs: 20000, engine: ENGINE(l1) });
  ok("the lease is set by one call", set.ok === true && NIGHTLY.length === 1 && NIGHTLY[0].status === "running", NIGHTLY);
  ok("NO READ WHILE THE LEASE IS HELD: nothing resolved, nothing read, no prepare lease taken, and it says why and for how long", held.skipped === "nightly_lease" && !l1.reads && !l1.spec && LEASES.length === 0 && held.resumeInMs > 80 * 60000 && held.resumeInMs <= 90 * 60000, [held.skipped, l1, LEASES.length, held.resumeInMs]);
  ok("the lease EXPIRES BY ITSELF after 90 minutes (no clear needed)", (await NL.nightlyLeaseHeld(ENV, Date.now() + 91 * 60000)).held === false);
  ok("and is still held at 89 minutes", (await NL.nightlyLeaseHeld(ENV, Date.now() + 89 * 60000)).held === true);
  const cl = await NL.clearNightlyLease(ENV); ok("the last script clears it", cl.ok === true && cl.cleared === 1 && (await NL.nightlyLeaseHeld(ENV)).held === false, cl);
  const l2 = {}; const after = await PREP.prepareForSale(ENV, { cfg: WIDE, budgetMs: 20000, engine: ENGINE(l2) }); ok("after the clear the job reads again", after.skipped === undefined && (l2.reads || 0) > 0, [after.skipped, l2.reads]);
  reset(mkRows(30)); NIGHTLY_DOWN = true; const l3 = {}; const dark = await PREP.prepareForSale(ENV, { cfg: WIDE, budgetMs: 20000, engine: ENGINE(l3) });
  ok("a lease that cannot be read is held: the job says so and reads nothing", dark.skipped === "nightly_lease" && dark.unreadable === true && !l3.reads, [dark.skipped, l3]);
  NIGHTLY_DOWN = true; ok("and a script that cannot write it does not fail (the call answers ok false)", (await NL.setNightlyLease(ENV)).ok === false && (await NL.clearNightlyLease(ENV)).cleared === 0); NIGHTLY_DOWN = false;
  reset(mkRows(120)); const lm = { readMs: 6, onNthRead: null }; let started = false; const eng = ENGINE(lm), base = eng.listingMarket; eng.listingMarket = async (...a) => { if (!started) { started = true; await NL.setNightlyLease(ENV); } return base(...a); };
  const mid = await PREP.prepareForSale(ENV, { cfg: WIDE, budgetMs: 60000, engine: eng, resolveLimit: 40, readLimit: 40 });
  ok("a nightly that starts DURING a run stops it after the pass it is in (no later pass reads)", mid.stoppedFor === "nightly_lease" && mid.passes >= 1 && TABLE.filter(r => r.read).length < 120, [mid.stoppedFor, mid.passes, TABLE.filter(r => r.read).length]);
  // the width follows the file
  for (const w of [1, 2, 3]) { reset(mkRows(30)); const lw = { readMs: 20 }; const o = await PREP.prepareForSale(ENV, { cfg: { ...LIVE, prepare: { ...LIVE.prepare, read_width: w } }, budgetMs: 20000, engine: ENGINE(lw), concurrency: 99 }); ok(`width ${w} in the file reads ${w} at once, whatever a call asks (concurrency 99)`, (lw.max || 0) === w && o.readWidth === w, [lw.max, o.readWidth]); }
  ok("the width falls back to three when the file has none", PREP.readWidthCap({ prepare: {} }) === 3 && PREP.readWidthCap({}) === 3 && PREP.readWidthCap({ prepare: { read_width: 9 } }) === 3);
  // the scripts
  const rd = f => fs.readFileSync(path.join(ROOT, f), "utf8"), LP = rd("scripts/prepareLoop.mjs"), IN = rd("scripts/ingest.js"), VR = rd("scripts/buildVinRolloutCache.js"), API = rd("api/pullForSale.js");
  ok("the nightly's FIRST script (scripts/ingest.js) sets the lease and its last (buildVinRolloutCache.js) clears it", /setNightlyLease/.test(IN) && /clearNightlyLease/.test(VR) && !/clearNightlyLease/.test(IN) && !/setNightlyLease/.test(VR), null);
  ok("no workflow file names the lease (none is edited)", !fs.readdirSync(path.join(ROOT, ".github/workflows")).some(f => /nightlyLease|nightly_lease/.test(rd(".github/workflows/" + f))), null);
  ok("the loop waits on the route's nightly_lease answer, reads the width from the file, and has no clock window", /nightly_lease/.test(LP) && /read_width/.test(LP) && !/nightly_pause_utc/.test(LP), null);
  ok("the loop runs at two until 19:00 UTC on Nov 20 and then at the file's width", /TWO_UNTIL/.test(LP) && /Date\.UTC\(2026, 10, 20, 19, 0\)/.test(LP), null);
  ok("the loop sends the width, never a fixed three", !/concurrency=3/.test(LP) && /concurrency=\$\{conc\}/.test(LP), null);
  ok("the route answers a nightly_lease skip as it comes (the prepare job's own answer is the route's body)", /prepareForSale\(env/.test(API), null);
});
globalThis.fetch = realFetch;
console.log(`forSalePrepareCheck: ${pass} pass, ${fail} FAIL`); for (const f of fails) console.log("FAIL " + f);
process.exit(fail ? 1 : 0);

function mutants() {
  const R = ROOT, sub = (file, from, to) => [file, s => { if (!s.includes(from)) return s; return s.replace(from, () => to); }, from];
  const P = "lib/forsale/prepare.js", RP = "lib/forsale/report.js", A = "api/pullForSale.js";
  const M = [
    ["the resolver is called once a listing, not once a distinct title", ...sub(P, "x => resolveKeyOf(x.r, x.facts)).values()]", "x => resolveKeyOf(x.r, x.facts) + x.r.id).values()]")],
    ["the resolver key ignores the title (one call for everything)", ...sub(P, "[row.title || \"\", row.year || \"\"", "[row.make || \"\", \"\"")],
    ["the engine is read once a listing, not once a car and band", ...sub(P, "x => readKeyOf(x.r, x.facts)).values()]", "x => readKeyOf(x.r, x.facts) + x.r.id).values()]")],
    ["the mileage band is left out of the read key", ...sub(P, "(row.car_key || (row.car && row.car.key) || \"\") + \"|\" + bandOf(facts ? facts.miles : row.mileage)", "(row.car_key || (row.car && row.car.key) || \"\")")],
    ["every mileage is one band", ...sub(P, "const i = MILES_BANDS.findIndex(b => n < b);", "const i = 1;")],
    ["the smallest group is read first", ...sub(P, ".sort((a, b) => b.length - a.length);", ".sort((a, b) => a.length - b.length);")],
    ["the read is stamped on the first listing of a group only", ...sub(P, "await patchIds(env, g.map(x => x.r.id), { read, updated_at: at }); out.reads += g.length;", "await patchIds(env, [g[0].r.id], { read, updated_at: at }); out.reads += g.length;")],
    ["the resolver result is written to the first listing of a group only (resolve)", ...sub(P, "const ids = g.map(x => x.r.id);", "const ids = [g[0].r.id];")],
    ["the resolver never runs", ...sub(P, "while (gi < groups.length && left() > budget * 0.45) {", "while (false) {")],
    ["the engine reads run before the resolver has finished (reads start in the resolver's time)", ...sub(P, "await Promise.all(Array.from({ length: Math.min(RES_WIDTH, groups.length) }, rWorker));", "void Promise.all(Array.from({ length: Math.min(RES_WIDTH, groups.length) }, rWorker));")],
    ["thirty engine reads at once", ...sub(P, "Math.max(1, Math.min(3, Number(opts.concurrency) || 3))", "Math.max(1, Math.min(30, Number(opts.concurrency) || 3))")],
    ["no lease is taken", ...sub(P, "if (!opts.noLease) { L = await takeLease(env);", "if (false) { L = await takeLease(env);")],
    ["the lease is not released", ...sub(P, "finally { if (L) await release(env, L.lease); }", "finally { }")],
    ["a lapsed lease still blocks", ...sub(P, "LEASE_MS = 330000;", "LEASE_MS = 1e12;")],
    ["a run starts when its lease cannot be written or read", ...sub(P, '} catch { return { ok: false, why: "lease_unwritable" }; }', '} catch { return { ok: true, lease: "x" }; }')],
    ["a run starts when a live lease exists (rank not checked)", ...sub(P, "if (rank !== 0) {", "if (false) {")],
    ["only the first page of a table is read", ...sub(P, "if (page.length < want) break; last =", "break; last =")],
    ["a gone listing is read", ...sub(P, "const READ_Q = stale => `gone=eq.false&", "const READ_Q = stale => `")],
    ["a hidden listing is resolved", ...sub(P, "const RESOLVE_Q = () => `gone=eq.false&hidden=eq.false&", "const RESOLVE_Q = () => `gone=eq.false&")],
    ["a listing with no price is read", ...sub(P, "&asking_price_usd=gt.0&or=(read.is.null", "&or=(read.is.null")],
    ["a resolver that did not answer marks the listing unresolved", ...sub(P, "if (spec === undefined) continue;", "if (spec === undefined) spec = null;")],
    ["a read older than 12 hours is not made again", ...sub(P, ",read->>at.lt.${encodeURIComponent(stale)})&select=*`;", ")&select=*`;")],
    ["what is left to read is not counted", ...sub(P, "countOf(env, READ_Q(stale)), Promise.resolve", "Promise.resolve(0), Promise.resolve")],
    ["what is left to resolve is not counted", ...sub(P, "const [a, b, c] = await Promise.all([countOf(env, RESOLVE_Q()),", "const [a, b, c] = await Promise.all([Promise.resolve(0),")],
    ["the time budget is not applied to the reads", ...sub(P, "while (ri < rg.length && left() > Math.min(8000, budget * 0.15)) {", "while (ri < rg.length) {")],
    ["the time budget is not applied to the resolver", ...sub(P, "while (gi < groups.length && left() > budget * 0.45) {", "while (gi < groups.length) {")],
    ["a VIN is looked up once a listing", ...sub(P, "groupRows(hs, r => r.vin_norm).values()", "groupRows(hs, r => r.vin_norm + r.id).values()")],
    ["the report leaves out the held sources", ...sub(RP, "const names = Object.keys(SOURCE_TABLE),", "const names = Object.keys(SOURCE_TABLE).filter(s => !SOURCE_TABLE[s].hold),")],
    ["the report counts resolved without the live filter", ...sub(RP, "resolved: \"gone=eq.false&resolve_state=eq.resolved\"", "resolved: \"resolve_state=eq.resolved\"")],
    ["the report counts a no-match history as a match", ...sub(RP, "vin_history_match: \"gone=eq.false&history->>none=eq.false\"", "vin_history_match: \"gone=eq.false&history=not.is.null\"")],
    ["the report's cells are not per source", ...sub(RP, "`source=eq.${encodeURIComponent(s)}&${CELLS[c]}`", "`${CELLS[c]}`")],
    ["the report's totals are wrong", ...sub(RP, "total[c] = names.reduce((a, s) => sum(a, out[s][c]), 0);", "total[c] = out[names[0]][c];")],
    ["the job reads while the nightly lease is held", ...sub(P, "if (nl.held) return { skipped: \"nightly_lease\"", "if (false) return { skipped: \"nightly_lease\"")],
    ["a nightly that starts during a run does not stop it", ...sub(P, "if (nl2.held) { stoppedFor = \"nightly_lease\"; break; }", "if (false) { break; }")],
    ["the lease never expires", ...sub("lib/nightlyLease.js", "&created_at=gte.${encodeURIComponent(since)}", "")],
    ["a lease that is cleared is still held", ...sub("lib/nightlyLease.js", "const gone = new Set(rows.filter(x => x && x.status === \"released\")", "const gone = new Set([].filter(x => x && x.status === \"released\")")],
    ["a lease that cannot be read is not held", ...sub("lib/nightlyLease.js", "if (!Array.isArray(rows)) return { held: true, unreadable: true, expiresInMs: 300000, leases: [] };", "if (!Array.isArray(rows)) return { held: false, expiresInMs: 0, leases: [] };")],
    ["the lease is 30 minutes, not 90", ...sub("lib/nightlyLease.js", "NIGHTLY_LEASE_MS = 90 * 60000", "NIGHTLY_LEASE_MS = 30 * 60000")],
    ["the width is read as three whatever the file says", ...sub(P, "return Math.max(1, Math.min(3, set >= 1 ? set : 3));", "return 3;")],
    ["the nightly's first script does not set the lease", ...sub("scripts/ingest.js", "await setNightlyLease(env);", "")],
    ["the nightly's last script does not clear it", ...sub("scripts/buildVinRolloutCache.js", "await clearNightlyLease(env);", "")],
    ["the loop has no two-until-19:00 rule", ...sub("scripts/prepareLoop.mjs", "Date.now() < TWO_UNTIL ? 2 : 3", "3")],
    ["the loop ignores the route's nightly_lease answer", ...sub("scripts/prepareLoop.mjs", "if (o.skipped === \"nightly_lease\") {", "if (o.skipped === \"nightly_leaseX\") {")],
    ["the route does not carry the split", ...sub(A, "...(await sourceSplit(env)), ", "")],
    ["the route does not carry the VIN history match count", ...sub(A, "vinHistoryMatches: await count(\"gone=eq.false&history->>none=eq.false\"), ", "")],
  ];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fsprep-mut-")), copy = path.join(tmp, "tree");
  for (const d of ["lib", "api", "data", "docs", "scripts", ".github"]) fs.cpSync(path.join(R, d), path.join(copy, d), { recursive: true });
  for (const f of ["package.json"]) if (fs.existsSync(path.join(R, f))) fs.copyFileSync(path.join(R, f), path.join(copy, f));
  fs.symlinkSync(path.join(R, "node_modules"), path.join(copy, "node_modules"));
  let killed = 0, survived = 0;
  for (const [name, file, fn] of M) {
    const fp = path.join(copy, file), orig = fs.readFileSync(fp, "utf8"), mut = fn(orig);
    if (mut === orig) { console.log("SKIP (text not found) " + name); survived++; continue; }
    fs.writeFileSync(fp, mut);
    const r = spawnSync(process.execPath, [path.join(copy, "scripts/forSalePrepareCheck.mjs"), copy], { encoding: "utf8", timeout: 200000 });
    fs.writeFileSync(fp, orig);
    const dead = r.status !== 0; if (dead) killed++; else survived++; console.log((dead ? "KILLED   " : "SURVIVED ") + name);
  }
  console.log(`forSalePrepareCheck mutants: ${killed} of ${M.length} killed${survived ? `, ${survived} SURVIVED or skipped` : ""}`);
  fs.rmSync(tmp, { recursive: true, force: true });
  return survived ? 1 : 0;
}
