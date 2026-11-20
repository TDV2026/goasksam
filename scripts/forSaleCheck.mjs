// forSaleCheck (Lane D, lane-d-forsale, Nov 2026; order 2318): dealer cars and classifieds beside Find's live auctions, engine side, US only, crew only behind FORSALE_PUBLIC.
// Through the LIVE HANDLERS (api/pullForSale.js, api/buySearch.js, api/sellerDecision.js) over a fake PostgREST and a stand-in for the vendor built on the RECORDED SHAPE of the real endpoint
// (scripts/fixtures/forsaleShape.json: its fields, parameters and the census's counts, no listing text). Every rule of the order is a case:
//   pull: US and dollars only, active only, the held sources never asked for, an unknown source dropped and counted, no seller name, no zip, no description stored, the vendor key in no output;
//   serve: active, not in the stale set (hidden), not gone, its source's polls current, held sources never served, one card per car (a VIN under two sources: the dealer's own page wins; no VIN: no match is guessed), a listing the resolver cannot place is not served and is counted;
//   the answer: the groups and the four counts, the default group, the card's finished words, the car's earlier record, on EVERY Find road (typed words, the car token, a partial car, chat, rerun, more, the mileage band);
//   an asking price is in no sold range, pool or count; a visitor's answer is as it was (no key, no read of our table); no card runs the engine; Market Check's one line.
//   node scripts/forSaleCheck.mjs [repo root]      --mutants breaks one rule at a time in a copy (each must fail)
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import { spawnSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const args = process.argv.slice(2), here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(args.find(a => !a.startsWith("--")) || path.join(here, ".."));
if (args.includes("--mutants")) process.exit(await mutants());
process.chdir(ROOT);
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
const W = await import(pathToFileURL(path.join(here, "_typedThroughWorld.mjs")).href); W.setEnv();
const KEY = "VENDOR-KEY-" + "Zq7Pw9Lm", PROBE = "probe-key-" + "Hn4Xr2Td";
process.env.OLDCARSDATA_API_KEY = KEY; process.env.PROBE_KEY = PROBE; process.env.CURTAIN_CREW_CODE = process.env.CURTAIN_CREW_CODE || "fixture-crew-code"; process.env.ANTHROPIC_API_KEY = "fixture-key";
let pass = 0, fail = 0; const fails = []; const ok = (n, c, d) => { if (c) pass++; else { fail++; if (fails.length < 90) fails.push(n + (d !== undefined ? "  " + JSON.stringify(d).slice(0, 260) : "")); } };
const log = console.log, errlog = console.error; const LOGS = []; console.log = (...a) => { LOGS.push(a.join(" ")); }; console.error = (...a) => { LOGS.push(a.join(" ")); };
const section = async (name, fn) => { try { await fn(); } catch (e) { ok(name + " ran without throwing", false, String((e && e.stack) || e).slice(0, 500)); } };
const SHAPE = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts/fixtures/forsaleShape.json"), "utf8"));
const { mintCrewCookieValue } = await imp("lib/_crew.js"), CREW = "gas_crew=" + mintCrewCookieValue();
const CT = await imp("lib/carToken.js");
const tryImp = async f => { try { return await imp(f); } catch { return null; } };   // a tree without the for-sale code (main) fails each case below instead of crashing here
const RULES = await tryImp("lib/forsale/rules.js") || { typeOf() {}, pulledSources: () => [] }, SERVE = await tryImp("lib/forsale/serve.js") || { forSaleReset() {}, forSaleFor() {}, forSaleCountLine() {} }, GATE = await tryImp("lib/forsale/gate.js") || { FORSALE_PUBLIC: null, withForSale: (r, f) => f() };
const HAVE = !!(await tryImp("lib/forsale/rules.js") && await tryImp("api/pullForSale.js"));
const BUY = (await imp("api/buySearch.js")).default, MC = (await imp("api/sellerDecision.js")).default, PULL = ((await tryImp("api/pullForSale.js")) || { default: async () => { throw new Error("api/pullForSale.js is not in this tree"); } }).default;
const SP = await imp("lib/live/samChat.js");
const BUD = (await tryImp("lib/forsale/budget.js")) || { BUDGET: {}, planRun: () => ({}), daysLeft: () => 0, cycleStart: () => new Date(0), callsFor: () => -1 }, INGEST = await tryImp("lib/forsale/sync.js");   // the sync engine (load, change poll, stale poll)
const BUDGET = BUD ? BUD.BUDGET : {};   // the SAME config object the handler reads: a case sets a number here, as a person would in data/forsaleBudget.json
const SHIPPED = fs.existsSync(path.join(ROOT, "data/forsaleBudget.json")) ? JSON.parse(fs.readFileSync(path.join(ROOT, "data/forsaleBudget.json"), "utf8")) : null;
let REMAIN = 90000, FIG = { remaining: 90000, limit: 10000, reset: "1795580863", at: Date.now() }, SEED_FS = 0, SEED_AUC = 0, USAGE_DOWN = false;   // the vendor's own count left, queries counted before this run (for sale, auction feed), the usage table unreadable
const DAY = 864e5, HOUR = 36e5, NOW = Date.now(), ago = h => new Date(NOW - h * HOUR).toISOString();
// THE WORLD OF THE OLDER CASES: a person has set a budget and switched every group on (the shipped default is 0 and autotraderclassics off: its own cases are in section 8). The same config object the handler reads.
const WORLD_CFG = { plan_monthly: 100000, auction_reserve_monthly: 10, forsale_monthly_budget: 90000, forsale_run_cap: 400, cycle_reset_day: 25, max_pages_per_source: 400, pull: { dealers: true, classifieds: true, autotraderclassics: true }, schedule: { pull_on: false, prepare_on: false } };
const setRemain = n => { REMAIN = n; FIG = n == null ? null : { remaining: n, limit: 10000, reset: "1795580863", at: Date.now() }; };   // the vendor's own count: in its response headers and in the figures kept
const setCfg = over => { for (const k of Object.keys(BUDGET)) delete BUDGET[k]; Object.assign(BUDGET, JSON.parse(JSON.stringify({ ...WORLD_CFG, ...over }))); };
if (BUD) setCfg({});

// ---- the world: an archive that sold 1987 Porsche 911s and 2009 BMW M3s (the engine reads it through its own queries), the stored answers, a live board, the vendor and OUR table ----
const CARS = [
  { name: "1987 Porsche 911", make: "Porsche", model: "911", title: "911 Carrera", year: 1987, price: 70000, n: 16, lowMiles: 30000, spanMiles: 50000, body: "Coupe" },
  { name: "2009 BMW M3", make: "BMW", model: "M3", title: "M3", year: 2009, price: 32000, n: 16, lowMiles: 20000, spanMiles: 50000, body: "Coupe" }
];
const world = W.install(CARS, {}), baseFetch = globalThis.fetch;
const LIVE = []; let LID = 1;
const liveRow = (year, make, model, miles) => LIVE.push({ id: LID++, source: "bringatrailer", source_listing_id: "L" + LID, url: "https://bringatrailer.com/listing/l" + LID, listing_title: `${year} ${make} ${model}`, make, model, year, vin_norm: null, mileage: miles, body: "Coupe", transmission: "Manual", status: "live", end_time: new Date(NOW + 30 * HOUR).toISOString(), current_bid: 50000, current_bid_usd: 50000, currency: "USD", bid_count: 3, photo_url: "https://img.example/l" + LID + ".jpg", country: "US", location: "Austin, TX", last_seen: ago(0.1), has_reserve: false, special_flag: null, mileage_unit: "mi" });
for (const [y, m, mi] of [[1987, "911", 41000], [1987, "911", 61000], [1986, "911", 52000]]) liveRow(y, "Porsche", m, mi);
const TABLE = []; let TID = 1;        // OUR for_sale_listings
const VENDOR_CALLS = [], DB_WRITES = [], FSREADS = [];   // every vendor request (its parameters), every write body to our table, every read of our table
const USAGE = [];
const SYNC = { rows: new Map(), writes: [], down: false };   // the sync's own state rows in app_config (forsale_sync:<source>)
// the stand-in for the vendor: the recorded shape's fields, synthetic values; paged by cursor, filtered by the documented parameters
const SELLER = "ZZ-SELLER-MARKER", ZIP = "99999";
const DATASET = [];
let VID = 1000;
const vin = n => "WP0AB0916HS" + String(100000 + n).slice(-6);
function rec(source, over = {}) {
  const id = VID++, base = Object.fromEntries(SHAPE.fields.map(k => [k, null]));
  return Object.assign(base, { id, source, source_listing_id: "S" + id, url: `https://www.${source}.example/inventory/${id}`, title: "1987 Porsche 911 Carrera Coupe", sale_type: "dealer", status: "active", year: 1987, listing_make: "Porsche", listing_model: "911", ocd_make_name: "Porsche", ocd_model_name: "911",
    vin: vin(id), mileage: 40000 + (id % 9) * 1000, mileage_unit: "miles", transmission: "Manual", body_style: "Coupe", exterior_color: "Red", asking_price: 45000 + (id % 7) * 1000, currency: "USD", location: "Austin, TX", city: "Austin", state: "TX", zip: ZIP, country_code: "US",
    seller_name: SELLER, seller_type: "dealer", featured_image_url: `https://img.example/${id}.jpg`, last_seen_at: ago(1), last_observed_at: ago(1), last_checked_at: ago(1), updated_at: ago(1), changed_at: ago(2), first_seen_at: ago(48) }, over, over.asking_price_history ? {} : { asking_price_history: null });
}
// the vendor's own clock for what it writes while the check runs: every stamp is later than the one before, so the (changed_at, id) and (updated_at, id) orders are never ties by accident
let STAMP = 0; const stamp = () => new Date(Date.now() + 1000 + (++STAMP)).toISOString();
const history = r => (Array.isArray(r.asking_price_history) ? r.asking_price_history : []);
// what the vendor does to a listing (the docs' semantics): a PRICE change and a STATUS move are changes (changed_at moves, and updated_at with it); a PRESENCE check is not (last_seen_at and updated_at move, changed_at does not)
const V_PRICE = (r, price) => { const t = stamp(); r.asking_price_history = [...(history(r).length ? history(r) : [{ price: r.asking_price, observed_at: r.first_seen_at }]), { price, observed_at: t }]; r.asking_price = price; r.last_asking_price = price; r.last_asking_price_observed_at = t; r.changed_at = t; r.updated_at = t; r.last_seen_at = t; return r; };
const V_STATUS = (r, status) => { const t = stamp(); r.status = status; r.changed_at = t; r.updated_at = t; return r; };
const V_FACT = (r, over) => { const t = stamp(); Object.assign(r, over); r.changed_at = t; r.updated_at = t; return r; };   // a specification fact changed (colour, mileage...): a change
const V_SEEN = (r) => { const t = stamp(); r.last_seen_at = t; r.updated_at = t; return r; };
const V_STALE = (r, hoursAgo) => { r.last_seen_at = ago(hoursAgo); r.updated_at = ago(hoursAgo); return r; };
const P = "1987 Porsche 911 Carrera Coupe", M = "2009 BMW M3 Coupe";
// dealers
const STREET = [0, 1, 2, 3, 4].map(i => rec("streetside", { vin: vin(i + 1), asking_price: 48123 + i * 1000, mileage: 38000 + i * 3000 }));
DATASET.push(...STREET);
DATASET.push(rec("streetside", { title: P, country_code: "CA", vin: vin(50) }));                       // not US
DATASET.push(rec("streetside", { title: P, currency: "EUR", vin: vin(51) }));                          // US coded, priced in euros
DATASET.push(rec("streetside", { title: P, status: "sold", vin: vin(52) }));                           // not active
DATASET.push(rec("mysterysource", { title: P, vin: vin(53) }));                                        // a source that is not in the file, inside a page
DATASET.push(rec("grautogallery", { vin: vin(6), asking_price: 52000 }), rec("grautogallery", { vin: vin(7), asking_price: 55000 }));
DATASET.push(rec("grautogallery", { title: M, listing_make: "BMW", listing_model: "M3", ocd_make_name: "BMW", ocd_model_name: "M3", year: 2009, vin: "WBSPM9C50AE" + "100001", asking_price: 31000, mileage: 51000 }));
DATASET.push(rec("rkmotors", { title: P, vin: null, asking_price: 47000 }));                           // no VIN (twin below)
// classifieds
DATASET.push(rec("classiccars", { vin: vin(1), asking_price: 47500, seller_type: "private" }));        // the SAME car as the first streetside row: the dealer's page wins
DATASET.push(rec("classiccars", { vin: vin(8), asking_price: 44000, last_seen_at: ago(0.2) }));
DATASET.push(rec("autotraderclassics", { vin: vin(8), asking_price: 43500, last_seen_at: ago(5) })); // the same car under two classifieds: the one seen most recently wins (not the first in the alphabet)
DATASET.push(rec("autotraderclassics", { vin: vin(9), asking_price: 46000 }));
DATASET.push(rec("autotraderclassics", { vin: vin(10), asking_price: 41000, last_seen_at: ago(30) }));  // seen 30 hours ago: not served
DATASET.push(rec("autotraderclassics", { vin: vin(11), asking_price: null }));                          // no asking price
DATASET.push(rec("autotraderclassics", { title: "1987 Zzyzx Frobnicator", listing_make: "Zzyzx", listing_model: "Frobnicator", ocd_make_name: "Zzyzx", ocd_model_name: "Frobnicator", vin: vin(12), asking_price: 20000 })); // the resolver cannot place it
DATASET.push(rec("barnfinds", { title: P, vin: null, asking_price: 47000 }));                           // no VIN, same title as the rkmotors row: both are served (no match is guessed)
DATASET.push(rec("autotraderclassics", { title: M, listing_make: "BMW", listing_model: "M3", ocd_make_name: "BMW", ocd_model_name: "M3", year: 2009, vin: "WBSPM9C50AE" + "100002", asking_price: 29000, mileage: 62000 }));
// held sources: present at the vendor, never asked for
for (const s of ["gatewayclassiccars", "lowmilesnomiles", "carandclassic"]) DATASET.push(rec(s, { vin: vin(60 + s.length) }));
// THE VENDOR'S GET /classifieds, as its docs say it behaves (scripts/fixtures/forsaleShape.json "syncDocs"): filters ANDed; status (default active, or all); last_seen_before strictly before, an unknown time never matches; changed_since inclusive on changed_at, ordered (changed_at, id);
// otherwise ordered (updated_at, id), desc by default; KEYSET pages over the CURRENT data (a listing re-stamped mid walk moves in the order, so a descending walk can miss it and an ascending one cannot); page cursors expire 24 hours after the first page and are bound to the filters;
// with changed_since and direction asc the last page carries meta.next_sync_cursor, a checkpoint with no expiry bound to the same filters; an unknown, repeated or blank parameter, or a bad cursor, is HTTP 400.
const CLOCK = { shiftMs: 0 }, REFUSE = { checkpoints: false }, ENDPOINT = { fail: null };   // time passed for cursor expiry; a rotated signing key; a source's endpoint that errors
const sigOf = p => JSON.stringify(Object.entries(p).filter(([k]) => k !== "cursor" && k !== "limit").sort(([a], [b]) => a < b ? -1 : 1));
const tok = o => Buffer.from(JSON.stringify(o)).toString("base64url");
const pageOf = u => {
  const q = u.searchParams, p = Object.fromEntries(q), bad = (m) => ({ code: 400, body: { error: "invalid_request", message: m } });
  VENDOR_CALLS.push({ ...p, auth: undefined });
  const names = [...q.keys()]; if (new Set(names).size !== names.length) return bad("repeated parameter");
  for (const k of names) { if (!SHAPE.parameters.includes(k)) return bad("unknown parameter " + k); if (!String(q.get(k)).trim()) return bad("blank " + k); }
  if (p.source && ENDPOINT.fail === p.source) return { code: 500, body: { error: "database query failed" } };
  const key = p.changed_since ? "changed_at" : "updated_at", dir = p.direction === "asc" ? 1 : -1, limit = Math.min(100, Number(p.limit) || 50), sig = sigOf(p);
  const t = v => Date.parse(v);
  let rows = DATASET.filter(r => (!p.source || r.source === p.source || (p.source === "streetside" && r.source === "mysterysource")) && (!p.country_code || r.country_code === p.country_code || (r.country_code === "CA" && p.source === "streetside"))
    && ((p.status || "active") === "all" || r.status === (p.status || "active") || (r.status === "sold" && (p.status || "active") === "active" && p.source === "streetside" && !p.changed_since && !p.last_seen_before))
    && (!p.changed_since || t(r.changed_at) >= t(p.changed_since)) && (!p.updated_since || t(r.updated_at) >= t(p.updated_since)) && (!p.last_seen_before || (r.last_seen_at && t(r.last_seen_at) < t(p.last_seen_before))));
  rows = rows.slice().sort((a, b) => dir * ((t(a[key]) - t(b[key])) || (a.id - b.id)));
  let after = null, wasCheckpoint = false;
  if (p.cursor) {
    let c; try { c = JSON.parse(Buffer.from(p.cursor, "base64url").toString()); } catch { return bad("malformed cursor"); }
    if (!c || c.sig !== sig) return bad("cursor does not match these filters");
    if (c.kind === "page") { if (Date.now() + CLOCK.shiftMs - c.at > DAY) return bad("cursor expired"); }
    else if (c.kind === "sync") { if (REFUSE.checkpoints) return bad("checkpoint signing key rotated"); wasCheckpoint = true; }
    else return bad("malformed cursor");
    after = c.after;
  }
  if (after) rows = rows.filter(r => { const d = (t(r[key]) - t(after[0])) || (r.id - after[1]); return dir * d > 0; });
  const data = rows.slice(0, limit), more = rows.length > limit, last = data[data.length - 1];
  const meta = { pagination: "cursor", limit, has_more: more, next_cursor: more ? tok({ kind: "page", sig, at: Date.now() + CLOCK.shiftMs, after: [last[key], last.id] }) : null };
  if (!more && p.changed_since && p.direction === "asc") { const b = last ? [last[key], last.id] : after; if (b) meta.next_sync_cursor = tok({ kind: "sync", sig, after: b }); }   // an initial empty search with no prior cursor has none
  void wasCheckpoint;
  return { code: 200, body: { data, meta } };
};
const applyFilter = (rows, u) => {   // a plain PostgREST over our table: the filters the engine and the jobs send
  let out = rows;
  for (const [k, v] of u.searchParams) {
    const m = /^(eq|neq|gte|lte|lt|gt|is|not\.is|in|ilike)\.(.*)$/.exec(v); if (!m || ["select", "order", "limit", "on_conflict", "or"].includes(k)) continue;
    const [, op, val] = m;
    out = out.filter(r => { const x = r[k]; if (op === "eq") return String(x) === val; if (op === "neq") return String(x) !== val; if (op === "lt") return String(x) < val; if (op === "gte") return String(x) >= val; if (op === "gt") return Number(x) > Number(val); if (op === "is") return val === "null" ? x == null : String(x) === val; if (op === "not.is") return val === "null" ? x != null : true; if (op === "ilike") return new RegExp("^" + val.split("*").map(t => t.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$", "i").test(String(x ?? "")); if (op === "in") return val.replace(/^\(|\)$/g, "").split(",").includes(String(x)); return true; });
  }
  const orp = u.searchParams.get("or");
  if (orp && /^\(read\.is\.null,/.test(orp)) { const ver = (/engine_version\.neq\.([^,]+),/.exec(orp) || [])[1], lt = (/at\.lt\.([^)]+)\)$/.exec(orp) || [])[1]; out = out.filter(r => r.read == null || r.read.engine_version !== decodeURIComponent(ver) || String(r.read.at) < decodeURIComponent(lt)); }
  if (orp && /resolve_state\.is\.null/.test(orp)) out = out.filter(r => r.resolve_state == null || !r.car || r.car.engine_version !== (orp.match(/neq\.([^)]+)\)/) || [])[1]);
  return out;
};
globalThis.fetch = async (url, init) => {
  const s = String(url), u = new URL(s), p = u.pathname;
  if (/api\.anthropic\.com/.test(s)) return fakeModel(init);
  if (u.host === "api.oldcarsdata.com" && p === "/classifieds") { const hdr = init && init.headers || {}; if (!/Bearer /.test(String(hdr.Authorization || ""))) return new Response("{}", { status: 401 }); { const pg = pageOf(u); return new Response(JSON.stringify(pg.body), { status: pg.code, headers: { ...(REMAIN == null ? {} : { "x-ratelimit-remaining": String(REMAIN), "x-ratelimit-reset": "1795580863" }), "x-ratelimit-limit": "10000" } }); } }
  if (p.endsWith("/for_sale_listings")) {
    const method = (init && init.method) || "GET";
    if (method === "POST") { const rows = JSON.parse(init.body); DB_WRITES.push(...rows); for (const r of rows) { const i = TABLE.findIndex(x => x.source === r.source && x.source_listing_id === r.source_listing_id); if (i >= 0) Object.assign(TABLE[i], r); else TABLE.push({ id: TID++, first_seen: new Date().toISOString(), resolve_state: null, read: null, history: null, car: null, car_key: null, gone: false, ...r }); } return new Response("", { status: 201 }); }
    if (method === "PATCH") { const body = JSON.parse(init.body), hit = applyFilter(TABLE, u); if (!/id=eq\./.test(u.search)) for (const r of hit) Object.assign(r, body); else for (const r of hit) Object.assign(r, body); return new Response(JSON.stringify(hit), { status: 200 }); }
    if (method === "HEAD") { const hit = applyFilter(TABLE, u); return new Response("", { status: 200, headers: { "content-range": `0-0/${hit.length}` } }); }
    FSREADS.push(u.search); let hit = applyFilter(TABLE, u); const lim = Number(u.searchParams.get("limit")); if (lim) hit = hit.slice(0, lim);
    const rg = init && init.headers && (init.headers.Range || init.headers.range); if (rg) { const m = /(\d+)-(\d+)/.exec(rg); if (m) hit = hit.slice(Number(m[1]), Number(m[2]) + 1); }
    return new Response(JSON.stringify(hit), { status: 200 });
  }
  if (p.endsWith("/app_config") && /^like\.forsale_sync/.test(u.searchParams.get("key") || "")) { if (SYNC.down) return new Response("{}", { status: 500 }); return new Response(JSON.stringify([...SYNC.rows].map(([key, value]) => ({ key, value }))), { status: 200 }); }
  if (p.endsWith("/app_config") && init && init.method === "POST" && /forsale_sync:/.test(String(init.body))) { const b = JSON.parse(init.body)[0]; SYNC.writes.push(b.key); SYNC.rows.set(b.key, JSON.parse(JSON.stringify(b.value))); return new Response("", { status: 201 }); }
  if (p.endsWith("/app_config") && u.searchParams.get("key") === "eq.ocd_rate_limit") {   // the vendor's own figures, as the live jobs keep them (a pull writes them too)
    if (init && init.method === "POST") { try { FIG = JSON.parse(init.body)[0].value; } catch {} return new Response("", { status: 201 }); }
    return new Response(JSON.stringify(FIG == null ? [] : [{ value: JSON.stringify(FIG) }]), { status: 200 });
  }
  if (p.endsWith("/app_config") && init && init.method === "POST") { try { const b = JSON.parse(init.body)[0]; if (b && b.key === "ocd_rate_limit") FIG = b.value; } catch {} return new Response("", { status: 201 }); }
  if (p.endsWith("/app_usage_events")) {
    if (init && init.method === "POST") { USAGE.push(init.body); return new Response("", { status: 201 }); }
    if (USAGE_DOWN) return new Response("{}", { status: 500 });
    const posted = USAGE.map(b => { try { return JSON.parse(b); } catch { return null; } }).filter(Boolean);
    if (u.searchParams.get("event_type") === "eq.forsale_prepare_halt") return new Response(JSON.stringify(posted.flat().filter(e => e && e.event_type === "forsale_prepare_halt").map(() => ({ id: 1 }))), { status: 200 });
    if (u.searchParams.get("event_type") === "eq.forsale_prepare_lease") { let k = 0; return new Response(JSON.stringify(posted.flat().filter(e => e && e.event_type === "forsale_prepare_lease").map(e => ({ id: ++k, status: e.status, metadata: e.metadata }))), { status: 200 }); }
    if (/^in\.\(forsale_pull/.test(u.searchParams.get("event_type") || "")) { const last = posted.filter(e => /^forsale_pull/.test(e.event_type)).pop(); return new Response(JSON.stringify(last ? [{ created_at: new Date().toISOString(), event_type: last.event_type, metadata: last.metadata }] : []), { status: 200 }); }
    const job = (u.searchParams.get("metadata->>job") || "").replace(/^eq\./, "");   // what the budget counts: the metered rows the vendor client wrote (one per call), by job
    const rows = posted.filter(e => e.event_type === "ocd_call" && (!job || (e.metadata && e.metadata.job === job))).map(e => ({ oldcarsdata_metered_requests: e.oldcarsdata_metered_requests }));
    rows.push({ oldcarsdata_metered_requests: (job ? 0 : SEED_AUC) + SEED_FS });
    return new Response(JSON.stringify(rows), { status: 200 });
  }
  if (p.endsWith("/taxonomy_makes")) return new Response(JSON.stringify(["BMW", "Porsche", "Audi"].map(name => ({ name }))), { status: 200 });
  if (p.endsWith("/live_listings")) { const make = (u.searchParams.get("make") || "").replace(/^ilike\./, "").replace(/\*/g, "").toLowerCase(); return new Response(JSON.stringify(LIVE.filter(r => (!make || r.make.toLowerCase().includes(make)) && r.status === "live")), { status: 200 }); }
  if (p.endsWith("/vin_index")) return new Response("[]", { status: 200 });
  if (p.endsWith("/sales_archive") && /vin_norm/.test(u.search) && u.searchParams.get("vin_norm")) { const v = u.searchParams.get("vin_norm").replace(/^eq\./, ""); return new Response(JSON.stringify(v === vin(2) ? [{ sale_date: "2024-03-12", sale_price: 36500, sale_price_usd: 36500, mileage: 41000, platform: "Bring a Trailer" }] : []), { status: 200 }); }
  if (p.endsWith("/auction_attempts")) { const v = (u.searchParams.get("chassis_vin_norm") || "").replace(/^eq\./, ""); return new Response(JSON.stringify(v === vin(3) ? [{ attempt_date: "2026-05-09", high_bid: 31000, high_bid_usd: 31000, source_slug: "bringatrailer", mileage: "44000" }] : []), { status: 200 }); }
  if (p.endsWith("/sales_archive") && u.searchParams.get("select") === "model" && /^eq\./.test(u.searchParams.get("make") || "")) {
    const make = u.searchParams.get("make").slice(3); let lo = null, hi = null; for (const v of u.searchParams.getAll("year")) { const m = /^(gte|lte)\.(\d+)$/.exec(v); if (m) { if (m[1] === "gte") lo = Number(m[2]); else hi = Number(m[2]); } }
    const since = ((u.searchParams.getAll("sale_date").find(v => v.startsWith("gte.")) || "").slice(4)) || "0000";
    return new Response(JSON.stringify(world.rows.filter(r => r.make === make && (lo == null || r.year >= lo) && (hi == null || r.year <= hi) && String(r.sale_date) >= since).map(r => ({ model: r.model }))), { status: 200 });
  }
  return baseFetch(url, init);
};
// the model is the only fixture on the engine's side: a stand-in for api.anthropic.com that calls search_live with the filters the app's own parser reads from the typed words (the chat road)
const sse = evts => new Response(new ReadableStream({ start(c) { const e = new TextEncoder(); for (const x of evts) c.enqueue(e.encode("data: " + JSON.stringify(x) + "\n\n")); c.close(); } }), { status: 200, headers: { "content-type": "text/event-stream" } });
async function fakeModel(init) {
  const body = JSON.parse(init.body), msgs = body.messages || [], last = msgs[msgs.length - 1], hasResult = last && Array.isArray(last.content) && last.content.some(c => c.type === "tool_result");
  if (hasResult) return sse([{ type: "message_start", message: { usage: { input_tokens: 10 } } }, { type: "content_block_start", index: 0, content_block: { type: "text" } }, { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Here they are." } }, { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 5 } }, { type: "message_stop" }]);
  const text = String((typeof last.content === "string" ? last.content : (last.content || []).map(c => c.text || "").join(" ")) || ""), f = await SP.filtersFromText({ supabaseUrl: process.env.SUPABASE_URL, supabaseKey: "k" }, text);
  return sse([{ type: "message_start", message: { usage: { input_tokens: 10 } } }, { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "tu1", name: "search_live" } }, { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify(f || {}) } }, { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 5 } }, { type: "message_stop" }]);
}
async function call(handler, url, { method = "GET", body = null, crew = true, headers = {} } = {}) {
  const chunks = []; const res = { h: {}, code: 200, body: "", setHeader(k, v) { this.h[k.toLowerCase()] = v; return this; }, getHeader(k) { return this.h[k.toLowerCase()]; }, removeHeader() {}, writeHead(c, hh) { this.code = c; if (hh) for (const k of Object.keys(hh)) this.h[k.toLowerCase()] = hh[k]; return this; },
    status(c) { this.code = c; return this; }, json(o) { this.h["content-type"] = "application/json"; this.body = JSON.stringify(o); return this; }, send(s) { this.body = typeof s === "string" ? s : JSON.stringify(s); return this; }, write(c) { chunks.push(String(c)); return true; }, flush() {}, flushHeaders() {}, on() {}, end(s) { if (s) chunks.push(String(s)); if (chunks.length) this.body = (this.body || "") + chunks.join(""); this.ended = true; return this; } };
  const u = new URL(url, "https://goasksam.com");
  await handler({ method, url, query: Object.fromEntries(u.searchParams), headers: { cookie: crew ? CREW : "", host: "goasksam.com", origin: "https://goasksam.com", "content-type": "application/json", ...headers }, socket: {}, body: body ? (typeof body === "string" ? JSON.parse(body) : body) : null, on() {} }, res);
  return res;
}
const json = r => { try { return JSON.parse(r.body); } catch { return null; } };
const chatDone = r => { const m = /event: done\ndata: (.*)\n/.exec(r.body || ""); try { return m ? JSON.parse(m[1]) : null; } catch { return null; } };
const find = (b, o) => call(BUY, "/api/buySearch" + (o && o.qs || ""), { method: "POST", body: b, crew: !(o && o.crew === false) });
const mc = (search, o = {}) => call(MC, "/api/sellerDecision", { method: "POST", body: { oneBox: true, search, ...(o.body || {}) }, crew: o.crew !== false });
const everyWrite = () => JSON.stringify(DB_WRITES) + USAGE.join("") + LOGS.join("\n");

ok("the for-sale engine is in this tree (lib/forsale, api/pullForSale.js, data/forsaleSources.json, docs/supabase-forsale.sql)", HAVE && ["data/forsaleSources.json", "docs/supabase-forsale.sql"].every(f => fs.existsSync(path.join(ROOT, f))));
// ================= 0. THE FILE OF SOURCES (one data file a person can read) =================
await section("sources", async () => {
  const F = JSON.parse(fs.readFileSync(path.join(ROOT, "data/forsaleSources.json"), "utf8")).sources;
  ok("every source in the file has a type of dealer or classified", Object.values(F).every(s => s.type === "dealer" || s.type === "classified"), F);
  ok("the three held sources are held, with a reason each", ["gatewayclassiccars", "lowmilesnomiles", "carandclassic"].every(k => F[k] && F[k].hold === true && String(F[k].reason || "").length > 10));
  ok("no other source is held", Object.entries(F).filter(([k, s]) => s.hold).map(([k]) => k).sort().join() === "carandclassic,gatewayclassiccars,lowmilesnomiles");
  ok("the pull asks for every source in the file that is not held, and only those", RULES.pulledSources().sort().join() === Object.keys(F).filter(k => !F[k].hold).sort().join() && !RULES.pulledSources().some(k => F[k].hold));
  ok("every census US source is in the file or named as unlisted (nothing silently missing)", Object.keys(SHAPE.censusUsActive).every(k => F[k]));
});

// ================= 1. THE SYNC, through the live handler: the load, then the change poll and the stale poll =================
const probeH = { "x-ops-key": PROBE }, runPull = async (qs = "") => { const before = VENDOR_CALLS.length, r = await call(PULL, "/api/pullForSale?mode=pull" + qs, { crew: false, headers: probeH }); return { r, o: json(r) || {}, calls: VENDOR_CALLS.slice(before) }; };
const stateOf = src => SYNC.rows.get("forsale_sync:" + src);
await section("pull", async () => {
  const { r, o, calls } = await runPull();
  ok("the first run answers 200 with the probe key in the header", r.code === 200 && o.ok === true, o);
  const noKey = await call(PULL, "/api/pullForSale?mode=pull", { crew: false }); ok("no key: 401", noKey.code === 401);
  const inAddr = await call(PULL, "/api/pullForSale?mode=pull&key=" + PROBE, { crew: false, headers: probeH }); ok("a key in the address is refused", inAddr.code === 400);
  const asked = [...new Set(calls.map(c => c.source))];
  ok("with nothing loaded the first run is the LOAD: each source not held asked for once (one page each here), and nothing else", asked.sort().join() === RULES.pulledSources().sort().join() && calls.every(c => c.status === "active" && !c.changed_since && !c.last_seen_before), asked);
  ok("the held sources were never asked for", !VENDOR_CALLS.some(c => ["gatewayclassiccars", "lowmilesnomiles", "carandclassic"].includes(c.source)));
  ok("every load request asked for active US listings, ASCENDING, a hundred a page, with parameters the vendor documents (ascending: a presence check sends a listing to the END of the order, so a walk cannot miss it)", calls.every(c => c.status === "active" && c.country_code === "US" && c.direction === "asc" && Number(c.limit) === 100 && Object.keys(c).filter(k => k !== "auth").every(k => SHAPE.parameters.includes(k))), calls[0]);
  ok("each source's load is saved as finished, with the change poll's starting time kept (the load's start less an overlap)", RULES.pulledSources().every(k => { const st = stateOf(k); return st && st.load && st.load.done === true && st.change && Date.parse(st.change.since) < Date.parse(st.load.started_at) && Date.parse(st.change.since) > Date.parse(st.load.started_at) - 3 * HOUR; }), stateOf("streetside"));
  ok("a listing coded Canada is not stored", !TABLE.some(r => r.vin === vin(50)));
  ok("a US listing priced in euros is not stored", !TABLE.some(r => r.vin === vin(51)));
  ok("a listing the vendor does not call active is not stored by a load", !TABLE.some(r => r.vin === vin(52)));
  ok("a source that is not in the file is not stored", !TABLE.some(r => r.source === "mysterysource" || r.vin === vin(53)));
  ok("the run counts what it dropped, by reason", o.dropped && o.dropped.not_us >= 2 && o.dropped.not_active >= 1 && o.dropped.unknown_source >= 1, o.dropped);
  ok("every kept row is US, in dollars, with its source's type from the file", TABLE.every(r => r.country_code === "US" && (r.source_type === RULES.typeOf(r.source))));
  ok("every stored row is a source the file types: dealers and classifieds are both there", TABLE.some(r => r.source_type === "dealer") && TABLE.some(r => r.source_type === "classified"));
  const allowed = new Set(["source", "source_listing_id", "source_type", "vendor_id", "title", "url", "image_url", "asking_price_usd", "price_history", "mileage", "location", "state", "country_code", "vin", "vin_norm", "year", "body", "transmission", "exterior_color", "make", "model", "status", "changed_at", "last_seen", "hidden", "hidden_at", "pulled_at", "gone", "gone_at", "updated_at"]);
  ok("a row is written with only the columns a card needs (and the sync's own: the vendor's id, status, changed_at, our dated price facts, hidden)", DB_WRITES.length > 0 && DB_WRITES.every(w => Object.keys(w).every(k => allowed.has(k))), [...new Set(DB_WRITES.flatMap(w => Object.keys(w)))].filter(k => !allowed.has(k)));
  ok("no seller name is stored", !JSON.stringify(DB_WRITES).includes(SELLER) && !DB_WRITES.some(w => "seller_name" in w) && ![...SYNC.rows.values()].some(v => JSON.stringify(v).includes(SELLER)));
  ok("no zip code is stored", !JSON.stringify(DB_WRITES).includes(ZIP) && !DB_WRITES.some(w => "zip" in w));
  ok("no listing description is stored (the vendor never returns one; the row has no field for it)", !DB_WRITES.some(w => "description" in w) && !SHAPE.fields.includes("description"));
  ok("the vendor key is in no write, no usage row, no log, no saved state and no answer", !everyWrite().includes(KEY) && !JSON.stringify([...SYNC.rows]).includes(KEY) && !(r.body || "").includes(KEY) && !(noKey.body || "").includes(KEY));
  ok("the run spent vendor queries and said how many, one a page", Number(o.requests) === calls.length && o.requests >= RULES.pulledSources().length, o.requests);
  ok("the run is recorded as a usage row", USAGE.some(u => /forsale_pull/.test(u)));
  ok("the load alone marks nothing gone, including a listing a source did not list (a walk that ends never proves a listing gone)", o.markedGone === 0 && TABLE.filter(r => r.gone).length === 0, TABLE.filter(r => r.gone).length);
  // the SECOND run: every source is loaded, so it is the polls: a change poll and a stale poll per source, and nothing else. (A poll that finds nothing has no checkpoint to save, the vendor's own rule: one listing per source changes first, so every source has one.)
  const sinceOf = {}; for (const k of RULES.pulledSources()) { sinceOf[k] = stateOf(k).change.since; { const d0 = DATASET.find(d => d.source === k); if (d0) V_FACT(d0, { exterior_color: "Blue" }); } }
  const two = await runPull(); const ch = two.calls.filter(c => c.changed_since), st = two.calls.filter(c => c.last_seen_before);
  ok("the second run is the polls: one change poll and one stale poll for each source, no load", two.r.code === 200 && ch.length === RULES.pulledSources().length && st.length === RULES.pulledSources().length && two.calls.length === ch.length + st.length, [two.calls.length, ch.length, st.length]);
  ok("the change poll asks status=all, ascending, changed_since fixed, US, a hundred a page", ch.every(c => c.status === "all" && c.direction === "asc" && c.country_code === "US" && Number(c.limit) === 100 && Number.isFinite(Date.parse(c.changed_since))), ch[0]);
  ok("the stale poll asks status=active with a cutoff 24 hours before the poll, and no cursor to start", st.every(c => c.status === "active" && c.country_code === "US" && !c.cursor && Math.abs(Date.now() - Date.parse(c.last_seen_before) - 24 * HOUR) < 5 * 60e3), st[0]);
  const had = RULES.pulledSources().filter(k => DATASET.some(d => d.source === k)), cp1 = {}; for (const k of had) cp1[k] = stateOf(k).change.checkpoint;
  ok("each source whose change poll found changes saved the vendor's checkpoint (meta.next_sync_cursor) and when the poll finished; each stale poll saved when it finished", had.length >= 5 && had.every(k => cp1[k] && stateOf(k).change.ok_at) && RULES.pulledSources().every(k => stateOf(k).stale && stateOf(k).stale.ok_at), stateOf("streetside"));
  const three = await runPull(), ch3 = three.calls.filter(c => c.changed_since);
  ok("the third run's change poll passes the SAVED checkpoint back as cursor with the SAME filters (changed_since unchanged); a source with no checkpoint sends none", ch3.length === ch.length && ch3.every((c, i) => c.source === ch[i].source && c.changed_since === ch[i].changed_since && c.status === "all" && c.direction === "asc" && Number(c.limit) === 100 && (had.includes(c.source) ? c.cursor === cp1[c.source] : !c.cursor)), ch3[0]);
  ok("a poll that finds nothing, resumed from its checkpoint, gets a checkpoint again (the vendor's own rule) and the poll finished is stamped", had.every(k => stateOf(k).change.checkpoint && Date.parse(stateOf(k).change.ok_at) >= Date.parse(two.o.ms !== undefined ? stateOf(k).change.ok_at : 0)) && three.o.errors.length === 0, three.o.errors);
  // the held sources: whatever sat in the table is gone and never served
  TABLE.push({ id: TID++, source: "gatewayclassiccars", source_listing_id: "H1", source_type: "dealer", title: P, url: "https://x/h1", asking_price_usd: 40000, vin: vin(70), vin_norm: vin(70), year: 1987, make: "Porsche", model: "911", country_code: "US", status: "active", last_seen: ago(1), gone: false, hidden: false, resolve_state: "resolved", car: { key: "k", engine_version: "x" }, read: { sold_line: "x", engine_version: "x" } });
  await runPull();
  ok("a held source's rows already in the table are marked gone by the next run", TABLE.find(r => r.source_listing_id === "H1").gone === true);
});

// ================= 2. THE READ MADE READY, through the live handler (the real resolver and engine over the archive) =================
await section("prepare", async () => {
  ok("before the prepare job, nothing is resolved", TABLE.filter(r => r.source_listing_id !== "H1").every(r => r.resolve_state == null));
  let o = null;
  for (let i = 0; i < 3; i++) { const r = await call(PULL, "/api/pullForSale?mode=prepare&budgetMs=240000", { crew: false, headers: { "x-ops-key": PROBE } }); o = json(r); if (process.env.DBGP) process.stderr.write(JSON.stringify(o) + "\n"); ok("prepare run " + (i + 1) + " answers 200 and spends no vendor query", r.code === 200 && o && o.vendorQueries === 0, o); }
  const live = TABLE.filter(r => !r.gone);
  const zz = TABLE.find(r => r.vin === vin(12));
  ok("a listing the resolver cannot place is marked unresolved and is counted", zz && zz.resolve_state === "unresolved" && (o.unresolved || 0) + TABLE.filter(r => r.resolve_state === "unresolved").length >= 1);
  const res = live.filter(r => r.resolve_state === "resolved");
  ok("the placeable listings are resolved to the engine's car (name, make, model, year, key, engine version)", res.length >= 8 && res.every(r => r.car && r.car.name && r.car.make && r.car.model && r.car.key && r.car.engine_version && r.car_key === r.car.key), res[0] && res[0].car);
  ok("the engine's car name carries the year, make and model", /1987/.test(res.find(r => r.model === "911").car.name) && /Porsche/.test(res.find(r => r.model === "911").car.name), res.find(r => r.model === "911") && res.find(r => r.model === "911").car);
  const withRead = res.filter(r => r.asking_price_usd > 0 && r.read);
  ok("every placeable listing with an asking price has the engine's read stored", withRead.length >= 8 && withRead.length === res.filter(r => r.asking_price_usd > 0).length, { withRead: withRead.length, res: res.length, left: o.left });
  const rr = withRead.find(r => r.read.kind === "range");
  ok("a read with a range says what cars like this sold for, from the archive (never the asking price)", rr && /^Cars like this sold for \$[\d,]+ to \$[\d,]+\.$/.test(rr.read.sold_line) && rr.read.low > 0 && rr.read.high > rr.read.low, rr && rr.read);
  const h2 = TABLE.find(r => r.vin === vin(2)), h3 = TABLE.find(r => r.vin === vin(3));
  ok("a VIN that sold before has the line: This car sold for $36,500 in March 2024.", h2 && h2.history && h2.history.line === "This car sold for $36,500 in March 2024.", h2 && h2.history);
  ok("a VIN that was bid and did not sell has the line: This car was bid to $31,000 and did not sell in May 2026.", h3 && h3.history && h3.history.line === "This car was bid to $31,000 and did not sell in May 2026.", h3 && h3.history);
  ok("a VIN with no record has no line", TABLE.find(r => r.vin === vin(4)).history && TABLE.find(r => r.vin === vin(4)).history.none === true);
  ok("a listing with no asking price gets no read (it is not served)", !TABLE.find(r => r.vin === vin(11)).read);
  ok("the run is recorded", USAGE.some(u => /forsale_prepare/.test(u)));
});

// ================= 3. THE ANSWER ON EVERY FIND ROAD =================
const forSaleOf = r => { const o = json(r); return o && o.forSale; };
const served2 = (g, row) => !!g && [...g.dealers.cards, ...g.classifieds.cards].some(c => c.id === "fs-" + row.id);
let FS = null;
await section("direct", async () => {
  SERVE.forSaleReset();
  const r = await find({ q: "1987 Porsche 911" }), o = json(r); FS = o && o.forSale;
  ok("Find answers 200 with live auctions as today", r.code === 200 && o.status === "ok" && Array.isArray(o.cards) && o.cards.length === o.total && o.total >= 2, o && { total: o.total, status: o.status });
  ok("the answer carries forSale for the crew, beside the cards", !!FS && FS.default === "auctions", FS && Object.keys(FS));
  if (process.env.FS_DEBUG) { process.stdout.write(JSON.stringify({ inv: FS && FS.inventory, counts: FS && FS.counts, reads: FSREADS.slice(-3), tbl: TABLE.slice(0, 3).map(r => ({ s: r.source, g: r.gone, rs: r.resolve_state, ls: r.last_seen, ask: r.asking_price_usd, read: !!r.read })) }, null, 1) + "\n"); }
  ok("the four counts: all = auctions + dealers + classifieds, and auctions is the number Find already reports", FS && FS.counts.auctions === o.total && FS.counts.all === FS.counts.auctions + FS.counts.dealers + FS.counts.classifieds && FS.counts.dealers === FS.dealers.count && FS.counts.classifieds === FS.classifieds.count, FS && FS.counts);
  ok("every card of the dealers group is a Dealer and every card of the classifieds group is a Classified", FS && FS.dealers.cards.every(c => c.kind === "dealer" && c.typeWord === "Dealer") && FS.classifieds.cards.every(c => c.kind === "classified" && c.typeWord === "Classified") && FS.dealers.count > 0 && FS.classifieds.count > 0, FS && { d: FS.dealers.count, c: FS.classifieds.count });
  const all = FS ? [...FS.dealers.cards, ...FS.classifieds.cards] : [];
  ok("a card carries the engine's car name, asking, mileage, location, link, image and the read", all.length > 0 && all.every(c => c.name && /^Asking \$[\d,]+$/.test(c.askingLine) && /^[\d,]+ miles$/.test(c.milesLine) && c.location && /^https:\/\//.test(c.url) && /^https:\/\//.test(c.image) && c.read && c.host), all[0]);
  ok("the read reads: Asking $X. then the engine's range or its honest line", all.every(c => c.read.startsWith(c.askingLine + ". ") && (/Cars like this sold for \$[\d,]+ to \$[\d,]+\.$/.test(c.read) || c.readKind === "none")), all.map(c => c.read).slice(0, 3));
  { const rg = all.filter(c => c.readKind === "range"); ok("the cards carry the archive's range (the next section proves the range does not move when the asking prices do)", rg.length > 0 && rg.every(c => /sold for \$[\d,]+ to \$[\d,]+\.$/.test(c.read))); }
  const sold = all.find(c => c.historyLine && /sold for/.test(c.historyLine)), unsold = all.find(c => c.historyLine && /did not sell/.test(c.historyLine));
  ok("a card whose VIN sold before says: This car sold for $36,500 in March 2024.", sold && sold.historyLine === "This car sold for $36,500 in March 2024.", all.map(c => c.historyLine).filter(Boolean));
  ok("a card whose VIN was bid and did not sell says it", unsold && unsold.historyLine === "This car was bid to $31,000 and did not sell in May 2026.");
  ok("a card with no earlier record carries no history line", all.some(c => c.historyLine === null));
  ok("the answer carries no seller name, no zip, no vendor key", !JSON.stringify(o).includes(SELLER) && !JSON.stringify(o).includes(ZIP) && !JSON.stringify(o).includes(KEY));
  ok("only Porsches are in a Porsche search (the BMWs are another search)", all.every(c => c.car.make === "Porsche"));
  // THE RULES at the serve
  const vins = id => TABLE.find(r => "fs-" + r.id === id);
  const ids = new Set(all.map(c => c.id)), rowOf = v => TABLE.find(r => r.vin === v);
  const served = v => ids.has("fs-" + (rowOf(v) && rowOf(v).id));
  ok("a listing last seen 30 hours ago is not served", rowOf(vin(10)) && !served(vin(10)));
  ok("a held source's row is not served", !all.some(c => c.source === "gatewayclassiccars" || c.source === "lowmilesnomiles" || c.source === "carandclassic"));
  ok("a listing the resolver could not place is not served", !served(vin(12)));
  ok("a listing with no asking price is not served", !served(vin(11)));
  ok("one card per car: a VIN under a dealer and a classified shows the dealer's page", served(vin(1)) && all.find(c => c.id === "fs-" + rowOf(vin(1)).id).kind === "dealer" && !all.some(c => c.source === "classiccars" && c.id === "fs-" + TABLE.find(r => r.source === "classiccars" && r.vin === vin(1)).id));
  ok("one card per car: the same VIN under two classifieds shows the one seen most recently", (() => { const a = TABLE.find(r => r.source === "autotraderclassics" && r.vin === vin(8)), c = TABLE.find(r => r.source === "classiccars" && r.vin === vin(8)); return ids.has("fs-" + c.id) && !ids.has("fs-" + a.id); })());
  const rk = TABLE.find(r => r.source === "rkmotors" && r.vin == null), bf = TABLE.find(r => r.source === "barnfinds" && r.vin == null);
  ok("no VIN: two sources listing the same title are both shown (no match is guessed)", ids.has("fs-" + rk.id) && ids.has("fs-" + bf.id));
  ok("the answer says what is counted but not served (unresolved, twins)", FS.inventory && FS.inventory.unresolved >= 1 && FS.inventory.twins >= 2 && Array.isArray(FS.inventory.sources_live) && FS.inventory.sources_live.includes("streetside"), FS.inventory);
  { const r = TABLE.find(x => x.source_listing_id === "H1"); r.gone = false; r.read = { ...TABLE.find(x => x.vin === vin(4)).read }; r.car = { ...TABLE.find(x => x.vin === vin(4)).car }; r.vin = vin(80); r.vin_norm = vin(80); r.last_seen = ago(1); SERVE.forSaleReset(); const g = forSaleOf(await find({ q: "1987 Porsche 911" })); ok("a held source's row is not served even when it is live, fresh and read (the rule is at the serve, not only at the pull)", g && served2(g, r) === false); r.gone = true; SERVE.forSaleReset(); }
  { const r = rowOf(vin(9)); r.gone = true; SERVE.forSaleReset(); const g = forSaleOf(await find({ q: "1987 Porsche 911" })); ok("a listing marked gone is not served", g && served2(g, r) === false && served2(FS, r) === true); r.gone = false; SERVE.forSaleReset(); }
});
await section("same answer without the groups", async () => {
  // the auctions of the crew's answer are byte for byte the visitor's cards (the groups add a field; they change nothing else)
  SERVE.forSaleReset();
  const crew = json(await find({ q: "1987 Porsche 911" })), vis = json(await find({ q: "1987 Porsche 911" }, { crew: false }));
  const strip = o => { const c = JSON.parse(JSON.stringify(o)); delete c.forSale; delete c.car; return JSON.stringify(c.cards.map(x => ({ id: x.id, title: x.title, url: x.url, current_bid_usd: x.current_bid_usd }))) + JSON.stringify({ total: c.total, understood: c.understood }); };
  ok("the crew's live auctions are the visitor's (cards and counts)", strip(crew) === strip(vis));
  ok("a visitor's answer has no forSale, no for-sale field of any kind", vis && !("forSale" in vis) && !/forSale|for_sale|fs-\d/.test(JSON.stringify(vis)), Object.keys(vis || {}));
});
await section("a visitor reads nothing of ours", async () => {
  FSREADS.length = 0; DB_WRITES.length = 0;
  const empty = TABLE.splice(0, TABLE.length);
  const a = JSON.stringify(json(await find({ q: "1987 Porsche 911" }, { crew: false })).cards.map(c => c.id));
  TABLE.push(...empty);
  const b = JSON.stringify(json(await find({ q: "1987 Porsche 911" }, { crew: false })).cards.map(c => c.id));
  ok("a visitor's answer is the same with our table empty and full", a === b);
  ok("a visitor's Find request does not read our table at all", FSREADS.length === 0, FSREADS.slice(0, 2));
  for (const body of [{ action: "rerun", filters: { make: "Porsche", model: "911" } }, { action: "more", filters: { make: "Porsche", model: "911" }, offset: 0 }]) { const o = json(await find(body, { crew: false })); ok("a visitor's " + body.action + " answer has no forSale", o && !("forSale" in o)); }
  ok("a visitor's Market Check carries no for-sale line", !/forSaleLine|forSaleCounts|forSaleLink/.test(String((await mc("1987 Porsche 911 Carrera", { crew: false })).body)));
  ok("no read of our table by a visitor on any road", FSREADS.length === 0, FSREADS.slice(0, 2));
});
await section("roads", async () => {
  SERVE.forSaleReset();
  const car = CT.decodeCar ? null : null;
  const full = CT.encodeCar({ year: 1987, make: "Porsche", model: "911", trim: null, canonicalLabel: "1987 Porsche 911" });
  const partial = CT.encodeCar({ make: "Porsche" });
  const roads = {
    "typed words": () => find({ q: "1987 Porsche 911" }),
    "the car bar token": () => find({ q: "1987 Porsche 911" }, { qs: "?car=" + encodeURIComponent(full) }),
    "a partial car (a make, no model)": () => partial ? find({ q: "" }, { qs: "?car=" + encodeURIComponent(partial) }) : find({ q: "Porsche" }),
    "the rerun (an address reloaded)": () => find({ action: "rerun", filters: { make: "Porsche", model: "911" } }),
    "more": () => find({ action: "more", filters: { make: "Porsche", model: "911" }, offset: 0 }),
    "the mileage band": () => find({ q: "1987 Porsche 911 38,400 miles" }),
    "the mileage band as a limit": () => find({ action: "rerun", filters: { make: "Porsche", model: "911", miles_max: 50000 } })
  };
  for (const [name, run] of Object.entries(roads)) {
    const o = json(await run()), g = o && o.forSale;
    ok(`${name}: the answer carries forSale with the four counts and both groups`, !!g && g.default === "auctions" && ["all", "auctions", "dealers", "classifieds"].every(k => Number.isFinite(g.counts[k])) && Array.isArray(g.dealers.cards) && Array.isArray(g.classifieds.cards), o && Object.keys(o));
    ok(`${name}: it has dealers and classifieds (the Porsches for sale)`, g && g.counts.dealers > 0 && g.counts.classifieds > 0, g && g.counts);
    if (name === "the mileage band as a limit") ok(`${name}: the miles limit applies to the for-sale cards too`, g && [...g.dealers.cards, ...g.classifieds.cards].every(c => c.miles <= 50000), g && g.dealers.cards.map(c => c.miles));
  }
  // the chat road
  const cr = await call(BUY, "/api/buySearch", { method: "POST", body: { action: "chat", messages: [{ role: "user", content: "1987 Porsche 911" }], state: { filters: {} }, turns: 0 } }), d = chatDone(cr);
  ok("the chat road: the done event carries forSale with the counts and groups", !!(d && d.forSale && d.forSale.counts && d.forSale.dealers && d.forSale.counts.dealers > 0), d && Object.keys(d));
  const cv = await call(BUY, "/api/buySearch", { method: "POST", body: { action: "chat", messages: [{ role: "user", content: "1987 Porsche 911" }], state: { filters: {} }, turns: 0 }, crew: false }), dv = chatDone(cv);
  ok("the chat road for a visitor: no forSale", !!dv && !("forSale" in dv));
  // a static sweep: every place buySearch answers with a search's cards spells the groups
  const src = fs.readFileSync(path.join(ROOT, "api/buySearch.js"), "utf8");
  const sites = src.split("\n").filter(l => /res\.status\(200\)\.json\(/.test(l) && /\bcards\b/.test(l) && /(out\.car|withServedCar)/.test(l));
  ok("every buySearch answer that carries a search's cards and its car also carries forSale (rerun, more, direct)", sites.length >= 2 && sites.every(l => /forSale/.test(l)) || /withServedCar\(\{\s*\n\s*status: "ok",\s*\n\s*\.\.\.\(forSale/.test(src), sites.map(l => l.slice(0, 80)));
  ok("the chat shape carries forSale", /shape: async out => withSuggest\(out, \{ \.\.\.\(out\.car \? \{ car: out\.car \} : \{\}\), \.\.\.\(out\.forSale/.test(src));
  ok("Tasks and the alerts are not touched: nothing under lib/tasks or lib/live/buyAlerts.js reads the for-sale table", ["lib/tasks/tasks.js", "lib/live/buyAlerts.js", "lib/live/watches.js"].every(f => !/forsale|for_sale/i.test(fs.readFileSync(path.join(ROOT, f), "utf8"))));
});

await section("the range does not move with the asking price", async () => {
  const before = new Map(TABLE.filter(r => r.read && r.source_listing_id !== "H1").map(r => [r.id, r.read.sold_line]));
  const asks = new Map(TABLE.map(r => [r.id, r.asking_price_usd]));
  for (const r of TABLE) { if (r.asking_price_usd) r.asking_price_usd = Math.round(r.asking_price_usd * 1.7); r.read = null; }
  for (let i = 0; i < 3; i++) await call(PULL, "/api/pullForSale?mode=prepare&budgetMs=240000", { crew: false, headers: { "x-ops-key": PROBE } });
  let same = 0, diff = [];
  for (const r of TABLE) if (before.has(r.id)) { if (r.read && r.read.sold_line === before.get(r.id)) same++; else diff.push([before.get(r.id), r.read && r.read.sold_line]); }
  ok("every car's range is the same when every asking price is 70 percent higher (the range is read from sales, never from an asking price)", same === before.size && before.size >= 8, { same, n: before.size, diff: diff.slice(0, 2) });
  for (const r of TABLE) r.asking_price_usd = asks.get(r.id);
  for (let i = 0; i < 3; i++) await call(PULL, "/api/pullForSale?mode=prepare&budgetMs=240000", { crew: false, headers: { "x-ops-key": PROBE } });
  SERVE.forSaleReset();
});

// ================= 4. AN ASKING PRICE IS IN NO SOLD RANGE, POOL OR COUNT =================
await section("asking never in sold", async () => {
  const ASK = 48123, spy = s => s.replace(/\\"/g, '"');
  const strip = o => { const c = JSON.parse(JSON.stringify(o || {})); for (const k of ["forSaleLine", "forSaleCounts", "forSaleLink", "forSale"]) delete c[k]; for (const k of ["timings", "snapshotId", "readAt", "cached", "ms"]) delete c[k]; if (c.dedup && typeof c.dedup === "object") { const noTime = o => { if (Array.isArray(o)) o.forEach(noTime); else if (o && typeof o === "object") for (const k of Object.keys(o)) { if (typeof o[k] === "number" && /(^t\d|ms$|at$|time|wait|age|elapsed)/i.test(k) || k === "marks") delete o[k]; else noTime(o[k]); } }; noTime(c.dedup); } return c; };   // the engine's own timing instrumentation (any number named like a time) is not the sales part   // the engine's own timing marks differ on every fresh read; everything else of dedup is compared
  await mc("1987 Porsche 911 Carrera");   // the first call stores the answer; the two that are compared are both read the same way
  const withRows = json(await mc("1987 Porsche 911 Carrera")), saved = TABLE.splice(0, TABLE.length);
  const without = json(await mc("1987 Porsche 911 Carrera"));
  TABLE.push(...saved);
  ok("Market Check answered a range for the Porsche (a real answer to compare)", withRows && withRows.status === "one_box" && /^(result|thin)$/.test(String(withRows.tier)), withRows && { status: withRows.status, tier: withRows.tier });
  const key = o => JSON.stringify({ tier: o.tier, cluster: o.cluster, poolN: o.poolN, qualifyingTotal: o.qualifyingTotal, cards: (o.cards || []).map(c => [c.price, c.title]), windowMonths: o.windowMonths });
  ok("the sold range, pool and counts are the same with and without the for-sale rows in our table", key(withRows) === key(without), { a: key(withRows).slice(0, 160), b: key(without).slice(0, 160) });
  ok("no asking price is in any sold figure of the answer (the rows carry 48,123 asking)", !/48123|48,123/.test(JSON.stringify(strip(withRows).cards || []) + JSON.stringify(withRows.cluster || []) + String(withRows.samLine || "")));
  { const A = strip(withRows), B = strip(without), diff = [...new Set([...Object.keys(A), ...Object.keys(B)])].filter(k => JSON.stringify(A[k]) !== JSON.stringify(B[k])); ok("the whole sales part of the answer (everything but the for-sale line) is the same with and without the table", diff.length === 0, diff); }
  void ASK; void spy;
  // the class: nothing that builds a range, pool or count reads the for-sale table; only the for-sale code and its two hooks do
  const walk = d => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? (["node_modules", "fixtures", "proofs"].includes(e.name) ? [] : walk(path.join(d, e.name))) : /\.(js|mjs)$/.test(e.name) ? [path.join(d, e.name)] : []);
  const readers = [...walk("lib"), ...walk("api")].filter(f => /for_sale_listings|asking_price_usd/.test(fs.readFileSync(path.join(ROOT, f), "utf8"))).sort();
  ok("only the for-sale code reads or writes the for-sale table or an asking price column", readers.join() === ["api/pullForSale.js", "lib/forsale/prepare.js", "lib/forsale/report.js", "lib/forsale/rules.js", "lib/forsale/serve.js", "lib/forsale/sync.js"].sort().join(), readers);
  const eng = ["lib/onebox.js", "lib/_classify.js", "lib/desk/execute.js", "lib/_houseComps.js", "lib/variants.js", "lib/sell/sellFacts.js"].map(f => fs.existsSync(path.join(ROOT, f)) ? fs.readFileSync(path.join(ROOT, f), "utf8") : "");
  ok("the sales engine files name no for-sale table, no asking price field and no forsale module", eng.every(t => !/for_sale|forsale|asking_price_usd/.test(t)));
});

// ================= 5. NO CARD RUNS THE ENGINE IN A REQUEST =================
await section("no cold run", async () => {
  const sv = fs.readFileSync(path.join(ROOT, "lib/forsale/serve.js"), "utf8");
  ok("the serve file imports no engine run (no oneEngineAnswer, listingMarket, specCore, refreshSpec, runOneBox)", !/oneEngineAnswer|listingMarket|specCore|refreshSpec|runOneBox|specOf\b|prefetchSpecs/.test(sv.replace(/\/\/.*$/gm, "")));
  const ps = fs.readFileSync(path.join(ROOT, "lib/forsale/prepare.js"), "utf8");
  ok("the engine is run by the prepare job (listingMarket, specOf), which no request calls", /listingMarket/.test(ps) && ["api/buySearch.js", "api/sellerDecision.js", "lib/live/samChat.js", "lib/forsale/serve.js"].every(f => !/prepareForSale|forsale\/prepare/.test(fs.readFileSync(path.join(ROOT, f), "utf8"))));
  // a request's own reads of the world for the for-sale part: only our table
  SERVE.forSaleReset();
  const seen = []; const f0 = globalThis.fetch; globalThis.fetch = async (u, i) => { seen.push(String(u)); return f0(u, i); };
  const G = await GATE_RUN(() => SERVE.forSaleFor({ supabaseUrl: process.env.SUPABASE_URL, supabaseKey: "k" }, async rows => ({ rows: rows.map(r => ({ r, facts: {}, unknown: [] })) }), 3));
  globalThis.fetch = f0;
  ok("forSaleFor reads only our own table (no sales archive, no cache row, no vendor)", seen.length > 0 && seen.every(u => /for_sale_listings|app_config\?key=like\.forsale_sync/.test(u)) && seen.some(u => /for_sale_listings/.test(u)), seen.filter(u => !/for_sale_listings|app_config\?key=like\.forsale_sync/.test(u)).slice(0, 3));   // our own listings and the sync's own state row, nothing else
  ok("forSaleFor with the switch off reads nothing and returns null", await (async () => { const s2 = []; const f1 = globalThis.fetch; globalThis.fetch = async (u, i) => { s2.push(u); return f1(u, i); }; const g = await SERVE.forSaleFor({ supabaseUrl: "x", supabaseKey: "k" }, async () => ({ rows: [] }), 1); globalThis.fetch = f1; return g === null && s2.length === 0; })());
  ok("a listing whose read is not ready is SERVED with the holding line, never a range (Nov 19 2026)", await (async () => { const r = TABLE.find(x => x.vin === vin(4)); const save = r.read; r.read = null; SERVE.forSaleReset(); const g = await GATE_RUN(() => SERVE.forSaleFor({ supabaseUrl: process.env.SUPABASE_URL, supabaseKey: "k" }, async rows => ({ rows: rows.map(x => ({ r: x, facts: {}, unknown: [] })) }), 0)); r.read = save; SERVE.forSaleReset(); const c = g && [...g.dealers.cards, ...g.classifieds.cards].find(c => c.id === "fs-" + r.id); return !!c && /My read is on its way\./.test(c.read) && c.readKind === "pending" && !/sold for/.test(c.read) && !(g.inventory.held_back || {}).read_pending; })());
  void G;
});
async function GATE_RUN(fn) { const { AsyncLocalStorage } = await import("node:async_hooks"); void AsyncLocalStorage; return await new Promise((resolve, reject) => { GATE.withForSale({ headers: { cookie: CREW } }, () => fn().then(resolve, reject)); }); }

// ================= 6. MARKET CHECK'S ONE LINE =================
await section("market check line", async () => {
  SERVE.forSaleReset();
  const o = json(await mc("1987 Porsche 911 Carrera")), tok = o && o.car && o.car.token, lbl = tok && CT.carWords(CT.decodeCar(tok)).label, fsd = tok ? json(await find({ q: lbl }, { qs: "?car=" + encodeURIComponent(tok) })).forSale : null;
  ok("Market Check serves one line under the range for the crew: N for sale now: A at auction, D at dealers, C classifieds", o && /^\d+ for sale now: \d+ at auction, \d+ at (dealers|a dealer), \d+ classifieds?$/.test(o.forSaleLine || ""), o && o.forSaleLine);
  ok("the counts of the line are Find's own counts for that car", o && fsd && o.forSaleCounts && o.forSaleCounts.dealers === fsd.counts.dealers && o.forSaleCounts.classifieds === fsd.counts.classifieds && o.forSaleCounts.auctions === fsd.counts.auctions, { mc: o && o.forSaleCounts, find: fsd && fsd.counts });
  ok("the line says the sum", o && Number((/^(\d+) for sale/.exec(o.forSaleLine) || [])[1]) === o.forSaleCounts.auctions + o.forSaleCounts.dealers + o.forSaleCounts.classifieds);
  // THE CLASS (Lane C's hold, variantRowsCheck 826/3): a line added to an answer runs NO market read of its own and writes nothing to the shared stores. The year window was read through the market engine (liveYearWindow, familyMarket, listingMarket), which ran
  // the engine a second time for the car and filled the spec market cache, so the next reads of that family (a Sell answer's variant rows) came back changed. The window now comes from the answer handed in (its poolYears).
  { const touched = [], f0 = globalThis.fetch; globalThis.fetch = async (u, i) => { const su = String(u), m = String((i && i.method) || "GET").toUpperCase(); touched.push(m + " " + su); return f0(u, i); };
    let again = null; try { SERVE.forSaleReset(); again = await GATE_RUN(() => SERVE.withForSaleLine({ supabaseUrl: process.env.SUPABASE_URL, supabaseKey: "k" }, JSON.parse(JSON.stringify(o)))); } finally { globalThis.fetch = f0; }
    const bad = touched.filter(x => /spec_market_cache|market_cache|sales_archive|vehicle_market_records|app_usage_events|\/rpc\//.test(x) || !/^(GET|HEAD) /.test(x));
    ok("the line runs no market read and writes nothing to a shared store (no spec market cache, no archive read, no usage write, only reads of the live and for-sale tables)", !!again && again.forSaleLine === o.forSaleLine && bad.length === 0, { line: again && again.forSaleLine, bad: bad.slice(0, 4) }); }
  { const cold = { tier: "result", car: { token: CT.encodeCar({ raw: "1991 Porsche 911 Carrera", year: 1991, make: "Porsche", model: "911", trim: "Carrera" }) } }, touched = [], f0 = globalThis.fetch;
    globalThis.fetch = async (u, i) => { touched.push(String((i && i.method) || "GET").toUpperCase() + " " + String(u)); return f0(u, i); };
    try { SERVE.forSaleReset(); await GATE_RUN(() => SERVE.withForSaleLine({ supabaseUrl: process.env.SUPABASE_URL, supabaseKey: "k" }, cold)); } finally { globalThis.fetch = f0; }
    const bad = touched.filter(x => /spec_market_cache|market_cache|sales_archive|vehicle_market_records|app_usage_events|\/rpc\//.test(x) || !/^(GET|HEAD) /.test(x));
    ok("a car whose market was never read: the line still runs no market read (no spec market cache, no archive, no write) and the engine is not run for it", bad.length === 0, bad.slice(0, 4)); }
  { const sv = fs.readFileSync(new URL("../lib/forsale/serve.js", import.meta.url), "utf8"), sr = fs.readFileSync(new URL("../lib/live/search.js", import.meta.url), "utf8");
    ok("the class, in the source: serve.js hands searchLive the answer's own year window (opts.yearWindow) and reads no market engine (familyMarket, listingMarket, engineAnswer, runOneBox, liveYearWindow)", /yearWindow: yw|\.\.\.so/.test(sv) && !/\b(familyMarket|listingMarket|engineAnswer|runOneBox|liveYearWindow|specOf)\b/.test(sv.replace(/\/\/.*$/gm, "")) && /opts\.yearWindow \|\| await liveYearWindow/.test(sr)); }
  ok("the line links to Find for that car (the car's own token)", o && o.car && o.forSaleLink === "/find?car=" + encodeURIComponent(o.car.token), o && o.forSaleLink);
  ok("a car nothing is for sale for carries no line", await (async () => { const o2 = json(await mc("2009 BMW M3")); return o2 && (o2.forSaleLine === undefined || /^1 for sale|^\d+ for sale/.test(o2.forSaleLine)); })());
  ok("the count line: one dealer reads at a dealer, one classified reads classified", SERVE.forSaleCountLine({ auctions: 0, dealers: 1, classifieds: 1 }) === "2 for sale now: 0 at auction, 1 at a dealer, 1 classified" && SERVE.forSaleCountLine({ auctions: 0, dealers: 0, classifieds: 0 }) === null && SERVE.forSaleCountLine({ auctions: 3, dealers: 12, classifieds: 5 }) === "20 for sale now: 3 at auction, 12 at dealers, 5 classifieds");
});

await section("each rule on its own (the pure rule, one row at a time)", async () => {
  const EV = (await imp("lib/onebox.js")).ENGINE_VERSION, now = Date.now();
  const good = { id: 1, source: "streetside", source_type: "dealer", country_code: "US", gone: false, last_seen: new Date(now - 2 * HOUR).toISOString(), resolve_state: "resolved", car: { key: "k" }, asking_price_usd: 40000, read: { sold_line: "x", engine_version: EV } };
  const why = over => RULES.heldBack({ ...good, ...over }, now, EV);
  ok("a good row is served", why({}) === null);
  ok("a row in the STALE SET (hidden: the vendor has not seen it for 24 hours) is not served and says why", why({ hidden: true }) === "stale");
  ok("a row's OWN last_seen is no freshness test any more (presence rechecks do not reach us): one stored as seen 40 hours ago and not hidden is served", why({ last_seen: new Date(now - 40 * HOUR).toISOString() }) === null);
  ok("a row the vendor never dated a sighting of is not served", why({ last_seen: null }) === "no_presence");
  ok("a sold, withdrawn, gone or unknown listing is not served", ["sold", "withdrawn", "gone", "unknown"].every(st => why({ status: st }) === "not_active"));
  ok("a source whose polls have lapsed is not served (the set of live sources is the caller's)", RULES.heldBack({ ...good }, now, EV, { live: new Set(["classiccars"]) }) === "sync_lapsed" && RULES.heldBack({ ...good }, now, EV, { live: new Set(["streetside"]) }) === null);
  ok("a gone row is not served", why({ gone: true }) === "gone");
  ok("a held source is not served", ["gatewayclassiccars", "lowmilesnomiles", "carandclassic"].every(s => why({ source: s }) === "held_source"));
  ok("a source not in the file is not served", why({ source: "nowhere" }) === "unknown_source");
  ok("a listing outside the US is not served", why({ country_code: "GB" }) === "not_us");
  ok("an unresolved listing is not served and says why", why({ resolve_state: "unresolved", car: null }) === "unresolved");
  ok("a listing not yet resolved is not served and says why", why({ resolve_state: null, car: null }) === "resolve_pending");
  ok("a listing with no asking price is not served", why({ asking_price_usd: null }) === "no_price");
  ok("a listing whose read is not ready, or from another engine version, is not held back (it is served with the holding line)", why({ read: null }) === null && why({ read: { sold_line: "x", engine_version: "old" } }) === null);
  const cars = [{ id: 1, source: "classiccars", source_type: "classified", vin_norm: vin(1), last_seen: ago(1) }, { id: 2, source: "streetside", source_type: "dealer", vin_norm: vin(1), last_seen: ago(9) }, { id: 3, source: "rkmotors", source_type: "dealer", vin_norm: null, last_seen: ago(1) }, { id: 4, source: "barnfinds", source_type: "classified", vin_norm: null, last_seen: ago(1) }, { id: 5, source: "a", source_type: "classified", vin_norm: "SHORT123", last_seen: ago(1) }, { id: 6, source: "b", source_type: "classified", vin_norm: "SHORT123", last_seen: ago(1) }];
  const one = RULES.onePerCar(cars);
  ok("onePerCar: the dealer wins over a marketplace even when the marketplace was seen more recently", one.rows.some(r => r.id === 2) && !one.rows.some(r => r.id === 1));
  ok("onePerCar: rows with no VIN or a short chassis number are never matched (all four stay)", [3, 4, 5, 6].every(i => one.rows.some(r => r.id === i)) && one.rows.length === 5 && one.droppedAsTwin === 1);
  ok("onePerCar does not depend on the order the rows arrive in", RULES.onePerCar(cars.slice().reverse()).rows.map(r => r.id).sort().join() === one.rows.map(r => r.id).sort().join());
  ok("US only: a listing is US when its country is US and its price is in dollars", RULES.isUs({ country_code: "US", currency: "USD" }) && !RULES.isUs({ country_code: "US", currency: "EUR" }) && !RULES.isUs({ country_code: "GB", currency: "USD" }) && !RULES.isUs({ country_code: null, currency: "USD" }));
  // the standing limit: never more than three engine reads at once
  const PREP = await tryImp("lib/forsale/prepare.js"); if (PREP) {
    let cur = 0, maxCur = 0;
    const rows = Array.from({ length: 12 }, (_, i) => ({ id: 900 + i, source: "streetside", source_type: "dealer", title: "t" + i, asking_price_usd: 1000, gone: false, last_seen: new Date(Date.now() - 1000).toISOString(), resolve_state: "resolved", car_key: "key" + i, car: { key: "key" + i, engine_version: "v" }, read: null, vin_norm: null }));
    const f0 = globalThis.fetch; globalThis.fetch = async (u, i) => { const su = String(u); if (/for_sale_listings/.test(su) && (!i || !i.method || i.method === "GET")) return new Response(JSON.stringify(/resolve_state\.is\.null/.test(decodeURIComponent(su)) || /vin_norm=not\.is\.null/.test(su) ? [] : rows), { status: 200 }); if (/for_sale_listings/.test(su)) return new Response("", { status: 204 }); return f0(u, i); };
    await PREP.prepareForSale({ supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" }, { budgetMs: 30000, concurrency: 99, engine: { specOf: async () => null, seenBefore: async () => null, listingMarket: async () => { cur++; maxCur = Math.max(maxCur, cur); await new Promise(r => setTimeout(r, 15)); cur--; return { kind: "range", low: 1000, high: 2000 }; } } });
    globalThis.fetch = f0;
    ok("the prepare job never runs more than three engine reads at once (the standing limit of heavy reads), whatever it is asked for", maxCur >= 2 && maxCur <= 3, maxCur);
  }
});

// ================= 9. SHOW MORE of the dealers and the classifieds (Lane D, Nov 18 2026): the first answer sends 24 of each group; the rest on request by the road auctions use for more, same rules, same order =================
// CAUSE this guards: forSale carried the first 24 cards of each group and a count, with no way to ask for the rest, so a group of 300 cars drew 24 and stopped. CLASS: every list the answer cuts to a first batch must say how many are left and serve the rest by the one road, in the one order, under the same rules.
await section("show more", async () => {
  const postedFs = () => USAGE.map(b => { try { return JSON.parse(b); } catch { return null; } }).filter(e => e && e.event_type === "ocd_call" && e.metadata && e.metadata.job === "pull_for_sale").reduce((t, e) => t + (Number(e.oldcarsdata_metered_requests) || 0), 0);
  const setSpent = k => { SEED_FS = k - postedFs(); };
  setCfg({}); setRemain(90000); setSpent(0);
  const EXTRA_D = ["streetside", "grautogallery", "classicautomall"], EXTRA_C = ["dupontregistry", "classiccars", "barnfinds"];
  for (let i = 0; i < 30; i++) { DATASET.push(rec(EXTRA_D[i % 3], { vin: vin(300 + i), asking_price: 40000 + i * 500, mileage: 30000 + i * 700, changed_at: stamp() })); DATASET.push(rec(EXTRA_C[i % 3], { vin: vin(400 + i), asking_price: 39000 + i * 450, mileage: 31000 + i * 650, seller_type: "private", changed_at: stamp() })); }   // NEW listings arrive through the change poll (their changed_at is now)
  const pr = json(await call(PULL, "/api/pullForSale?mode=pull", { crew: false, headers: { "x-ops-key": PROBE } })) || {};
  if (process.env.FS_DEBUG) process.stderr.write("DBG pull " + JSON.stringify({ sk: pr.skipped, why: pr.why, req: pr.requests, wrote: pr.wrote, stopped: pr.stopped, err: pr.errors, tbl: TABLE.length }) + "\n");
  for (let i = 0; i < 4; i++) await call(PULL, "/api/pullForSale?mode=prepare&budgetMs=240000", { crew: false, headers: { "x-ops-key": PROBE } });
  SERVE.forSaleReset();
  const filters = { make: "Porsche", model: "911" }, first = json(await find({ action: "rerun", filters })), FS = first && first.forSale;   // the first answer and every later batch are the same search: these filters
  const more = (group, offset, o = {}) => find({ action: "more", filters, forSaleGroup: group, forSaleOffset: offset, ...(o.body || {}) }, { crew: o.crew !== false }).then(json);
  ok("the first answer carries 24 cards of each group (the one batch size, the same as the auctions' SHOW_BATCH) and says how many are left and how many the next ask returns", !!FS && FS.dealers.count > 24 && FS.classifieds.count > 24 && FS.dealers.cards.length === 24 && FS.classifieds.cards.length === 24 && SERVE.CARDS_SHOWN === SP.SHOW_BATCH && FS.dealers.shown === 24 && FS.dealers.remaining === FS.dealers.count - 24 && FS.dealers.nextN === Math.min(24, FS.dealers.remaining) && FS.dealers.offset === 0, FS && [FS.dealers.count, FS.dealers.cards.length, FS.dealers.remaining, FS.dealers.nextN]);
  for (const [name, kind] of [["dealers", "dealer"], ["classifieds", "classified"]]) {
    const g0 = FS[name], seen = [...g0.cards.map(c => c.id)]; let off = 24, guard = 0, last = null, batches = 0, counts = true, onlyKind = true, otherEmpty = true, noAuctions = true;
    while (off < g0.count && guard++ < 20) {
      const m = await more(name, off), g = m && m.forSale && m.forSale[name]; last = g; if (!g) break; batches++;
      counts = counts && JSON.stringify(m.forSale.counts) === JSON.stringify(FS.counts); onlyKind = onlyKind && g.cards.every(c => c.kind === kind && c.typeWord === (kind === "dealer" ? "Dealer" : "Classified")); otherEmpty = otherEmpty && m.forSale[name === "dealers" ? "classifieds" : "dealers"].cards.length === 0; noAuctions = noAuctions && Array.isArray(m.cards) && m.cards.length === 0 && m.forSale.more === name;
      seen.push(...g.cards.map(c => c.id)); off += g.cards.length; if (!g.cards.length) break;
    }
    ok("the " + name + ": asking for the rest returns every card after the first 24, none twice, none missing (" + g0.count + " in all)", seen.length === g0.count && new Set(seen).size === seen.length && batches >= 1, [seen.length, g0.count, batches]);
    ok("the " + name + ": the last batch says nothing is left", !!last && last.remaining === 0 && last.nextN === 0 && last.shown === g0.count, last && [last.remaining, last.nextN, last.shown]);
    ok("the " + name + ": each batch carries the same four counts as the first answer, only that group's cards, and no auction card", counts && onlyKind && otherEmpty && noAuctions);
    const again = await more(name, 0); ok("the " + name + ": more from 0 is the first answer's own 24, in the same order (one order, one set of rules)", !!again && again.forSale[name].cards.map(c => c.id).join() === g0.cards.map(c => c.id).join(), again && again.forSale[name].cards.length);
    const m2 = await more(name, 24), m3 = await more(name, 24); ok("the " + name + ": asking twice gives the same batch", JSON.stringify(m2.forSale[name].cards.map(c => c.id)) === JSON.stringify(m3.forSale[name].cards.map(c => c.id)));
    const edge = await more(name, 100000); ok("the " + name + ": an offset past the end returns no cards and nothing left", edge && edge.forSale[name].cards.length === 0 && edge.forSale[name].remaining === 0 && edge.forSale[name].count === g0.count, edge && edge.forSale && edge.forSale[name]);
    const neg = await more(name, -7); ok("the " + name + ": an offset below 0 is read as 0", neg && neg.forSale[name].cards.map(c => c.id).join() === g0.cards.map(c => c.id).join());
  }
  const bogus = await find({ action: "more", filters, forSaleGroup: "bogus", offset: 0 }).then(json); ok("an unknown group is an ordinary more of the auctions (no forSale more, the auction cards come back)", bogus && !(bogus.forSale && bogus.forSale.more) && Array.isArray(bogus.cards) && bogus.cards.length > 0, bogus && bogus.forSale && bogus.forSale.more);
  // the SAME rules: a listing in the stale set, or gone, is in no batch
  const victim = TABLE.find(r => r.source === "streetside" && r.vin === vin(300)), g1 = FS.dealers.count;
  victim.hidden = true; SERVE.forSaleReset(); const f2 = json(await find({ action: "rerun", filters })), all2 = [...f2.forSale.dealers.cards.map(c => c.id)]; let off2 = 24; while (off2 < f2.forSale.dealers.count) { const m = await more("dealers", off2); all2.push(...m.forSale.dealers.cards.map(c => c.id)); off2 += m.forSale.dealers.cards.length || 1000; }
  ok("a listing in the stale set (hidden) is in no batch (the same rule), and the count says so", f2.forSale.dealers.count === g1 - 1 && !all2.includes("fs-" + victim.id) && all2.length === g1 - 1, [f2.forSale.dealers.count, g1, all2.length]);
  victim.hidden = false; SERVE.forSaleReset();
  // a visitor: no for sale in the answer, no read of our table
  const f0 = FSREADS.length, v = json(await find({ action: "more", filters, forSaleGroup: "dealers", forSaleOffset: 24 }, { crew: false }));
  ok("a visitor asking for more of the dealers gets no for-sale group and no card, and our table is not read", v && !("forSale" in v) && Array.isArray(v.cards) && v.cards.length === 0 && FSREADS.length === f0, v && Object.keys(v));
  const nv = json(await find({ action: "more", filters, offset: 0 }, { crew: false })); ok("a visitor's ordinary more is as before: no forSale, the auctions' batch", nv && !("forSale" in nv) && Array.isArray(nv.cards));
  const src = fs.readFileSync(path.join(ROOT, "api/buySearch.js"), "utf8");
  ok("the more road for sale is one ask on the auctions' own action: buySearch has no second endpoint and no slicing of its own (the batch is cut in lib/forsale/serve.js)", /b\.action === "more"/.test(src) && /forSaleGroup/.test(src) && !/slice\(.*forSale/.test(src.replace(/\/\/.*$/gm, "")));
  // the cards of a batch are finished words, the same card as the first answer
  const mm = await more("dealers", 24); const cd = mm.forSale.dealers.cards[0]; ok("a card of a later batch is the same card: name, asking line, miles line, location, link, image, the read", !!cd && cd.name && /^Asking \$[\d,]+$/.test(cd.askingLine) && /^[\d,]+ miles$/.test(cd.milesLine) && cd.location && /^https:\/\//.test(cd.url) && cd.read.startsWith(cd.askingLine + ". "), cd);
});

// ================= 10. THE SYNC (Lane D, lane-d-forsale-sync, Nov 19 2026): changes and stale listings, not a walk of everything =================
// CAUSE this guards: the first build served a listing only while its STORED last_seen (the vendor's last_seen_at, re-read at every full pull) was inside 24 hours, and told us a car was gone when a complete walk no longer listed it. The vendor now sends changes (changed_since), stops sending
// presence rechecks, and finds the stale ones itself (last_seen_before): a stored last_seen is no longer refreshed for an unchanged listing, so the old rule would have dropped every unchanged live car after a day, and a walk that ends proves nothing. CLASS: any served rule that reads a
// timestamp which is no longer refreshed for an unchanged row; any "gone" decided from what a walk did not return. Every consumer of last_seen is swept below (rules, serve, prepare, sync): none tests it against a clock.
await section("sync", async () => {
  const ENV = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
  setCfg({}); setRemain(90000); SEED_FS = 0;
  const DS = (src, v) => DATASET.find(d => d.source === src && d.vin === vin(v)), RW = (src, v) => TABLE.find(r => r.source === src && r.vin === vin(v));
  const servable = async () => { SERVE.forSaleReset(); return SERVE.servableRows(ENV); }, isServed = async row => (await servable()).some(x => x.id === row.id);
  const run = async (qs = "") => { const x = await runPull(qs); ok("a sync run answers 200 with no error", x.r.code === 200 && x.o.ok === true && (x.o.errors || []).length === 0, x.o.errors); return x; };
  const prep = async () => { for (let i = 0; i < 3; i++) await call(PULL, "/api/pullForSale?mode=prepare&budgetMs=240000", { crew: false, headers: probeH }); };
  const postedFs = () => USAGE.map(b => { try { return JSON.parse(b); } catch { return null; } }).filter(e => e && e.event_type === "ocd_call" && e.metadata && e.metadata.job === "pull_for_sale").reduce((t, e) => t + (Number(e.oldcarsdata_metered_requests) || 0), 0), setSpent = k => { SEED_FS = k - postedFs(); };

  // ---- THE RULE ON ITS OWN: nothing that serves reads a stored last_seen against a clock any more ----
  { const src = f => fs.readFileSync(path.join(ROOT, f), "utf8"), held = src("lib/forsale/rules.js"), body = held.slice(held.indexOf("export function heldBack"), held.indexOf("// ONE CARD PER CAR"));
    ok("CLASS SWEEP: the serve rule (heldBack) tests no stored time against a clock; the prepare job and the serve read no last_seen filter either (the stale poll is the freshness test now)", !/FRESH_MS|now\s*-\s*seen|last_seen\s*(<|>)/.test(body) && !/last_seen=(gte|lt|gt|lte)/.test(src("lib/forsale/serve.js") + src("lib/forsale/prepare.js")) && !/FRESH_MS/.test(src("lib/forsale/serve.js") + src("lib/forsale/prepare.js")));
    { const mk = h => RULES.rowOf({ ...rec("streetside", {}), last_seen_at: new Date(NOW - h * HOUR).toISOString() }, new Date(NOW).toISOString());
    ok("a record the vendor last saw 30 hours ago is stored HIDDEN, one seen 23 hours ago is not (the stale rule applies at the write too, not only at the next stale poll), and a hidden row carries when it was hidden", mk(30).hidden === true && !!mk(30).hidden_at && mk(23).hidden === false && mk(23).hidden_at == null);
    ok("only a source whose load FINISHED and whose change poll and stale poll both finished within the lapse is live (a load restarted over an old polled state is not)", (() => { const t = new Date(NOW).toISOString(), L = (done) => ({ s: { load: { done }, change: { ok_at: t }, stale: { ok_at: t } } }); return INGEST && INGEST.liveSources(L(true), NOW).has("s") && !INGEST.liveSources(L(false), NOW).has("s") && !INGEST.liveSources({ s: { load: { done: true }, change: { ok_at: t } } }, NOW).has("s") && INGEST.liveSources(null, NOW).size === 0; })()); }
  ok("the stale cutoff is one number (24 hours) in one place, and the rule on it is strict: equal is not stale, an unknown time is not in the stale set", RULES.FRESH_MS === 24 * HOUR && RULES.isStaleSeen(new Date(NOW - 24 * HOUR).toISOString(), NOW) === false && RULES.isStaleSeen(new Date(NOW - 24 * HOUR - 1).toISOString(), NOW) === true && RULES.isStaleSeen(null, NOW) === false); }

  // ---- A PRICE CHANGE: applied, dated, and our own history keeps what the vendor's list drops ----
  { const d = DS("grautogallery", 6), before = RW("grautogallery", 6), was = before.asking_price_usd, nHist = (before.price_history || []).length;
    ok("before: the row holds the price the load stored, as a dated fact", was === 52000 && nHist >= 1 && before.price_history.every(f => f.price > 0 && Number.isFinite(Date.parse(f.observed_at))), before.price_history);
    const keepRead = { kind: "range", low: 1, high: 2, sold_line: "x", engine_version: "v", at: new Date().toISOString() }, ctrl = RW("grautogallery", 7); before.read = { ...keepRead }; ctrl.read = { ...keepRead };
    V_PRICE(d, 49500); const x = await run(); const row = RW("grautogallery", 6);
    ok("a price change clears that listing's read at once (the next prepare run reads it fresh) and counts it; a listing whose price did not change keeps its read", row.read === null && ctrl.read && ctrl.read.sold_line === "x" && x.o.requeuedForPrice >= 1, [row.read, x.o.requeuedForPrice]);
    ok("the change poll applied the new asking price, and counted a price change", row.asking_price_usd === 49500 && x.o.priceChanges >= 1, [row.asking_price_usd, x.o.priceChanges]);
    ok("the old and the new price are both kept as dated price facts, oldest first, numbers and dates only (no text)", row.price_history.length >= 2 && row.price_history.some(f => f.price === 52000) && row.price_history[row.price_history.length - 1].price === 49500 && row.price_history.every((f, i, a) => Object.keys(f).sort().join() === "observed_at,price" && (i === 0 || Date.parse(a[i - 1].observed_at) <= Date.parse(f.observed_at))), row.price_history);
    d.asking_price_history = d.asking_price_history.slice(-1); V_FACT(d, { exterior_color: "Silver" }); await run();
    ok("a price fact once dated stays even when the vendor's own list is shorter the next time", RW("grautogallery", 6).price_history.some(f => f.price === 52000), RW("grautogallery", 6).price_history);
    ok("a price change alone does not send the car back to the resolver (the car is the same; only its read is made again)", RW("grautogallery", 6).resolve_state === "resolved" && !!RW("grautogallery", 6).car && RW("grautogallery", 6).read === null);
    const rr = RULES.rowOf({ ...d, asking_price: 41000, asking_price_history: [{ price: 45000, observed_at: "2026-11-10T10:00:00Z" }], last_asking_price_observed_at: "2026-11-12T09:00:00Z" }, new Date().toISOString());
    ok("a price the vendor lists but has not yet put in its history is still a dated fact (dated by when the vendor observed it)", rr.price_history.length === 2 && rr.price_history[1].price === 41000 && rr.price_history[1].observed_at === "2026-11-12T09:00:00.000Z", rr.price_history);
    const card = (await servable()).find(r => r.id === RW("grautogallery", 6).id); ok("the car is served at its new asking price", !!card && card.asking_price_usd === 49500); }

  // ---- EACH STATUS MOVE: sold, withdrawn, gone, unknown, and back to active ----
  { const moves = [["sold", DS("grautogallery", 7), RW("grautogallery", 7)], ["withdrawn", DS("streetside", 3), RW("streetside", 3)], ["gone", DS("streetside", 4), RW("streetside", 4)], ["unknown", DS("streetside", 303), RW("streetside", 303)]];
    for (const [st, d, r] of moves) ok("before: " + st + " target is served", !!r && !!d && await isServed(r), st);
    for (const [st, d] of moves) V_STATUS(d, st);
    const x = await run();
    for (const [st, d, r] of moves) { const row = RW(d.source, Number(d.vin.slice(-6)) - 100000); ok("the change poll moves it to " + st + ": status is " + st + ", it is gone for us (not live), and it is not served", row.status === st && row.gone === true && !!row.gone_at && !(await isServed(row)), [row.status, row.gone]); }
    ok("the run counted each move by kind", x.o.moved.sold >= 1 && x.o.moved.withdrawn >= 1 && x.o.moved.gone >= 1 && x.o.moved.unknown >= 1, x.o.moved);
    V_STATUS(DS("streetside", 4), "active"); await run(); const back = RW("streetside", 4);
    ok("a listing the vendor calls active again comes back (the vendor's word, not a walk's)", back.status === "active" && back.gone === false && back.gone_at == null && await isServed(back), [back.status, back.gone]);
    DATASET.push(rec("streetside", { vin: vin(950), status: "sold", changed_at: stamp() })); DATASET.push(rec("mysterysource", { vin: vin(951), changed_at: stamp() })); const y = await run();
    ok("a listing the vendor calls sold that we never held is not stored; a source not in the file is not stored (both counted)", !TABLE.some(r => r.vin === vin(950) || r.vin === vin(951)) && y.o.dropped.not_active >= 1 && y.o.dropped.unknown_source >= 1, y.o.dropped); }

  // ---- A NEW LISTING arrives by the change poll, is resolved and read by prepare, and is then served ----
  { DATASET.push(rec("grautogallery", { vin: vin(960), asking_price: 60500, changed_at: stamp() })); await run(); const row = RW("grautogallery", 960);
    ok("a listing new at the vendor arrives by the change poll (stored, not yet resolved, not served)", !!row && row.status === "active" && row.resolve_state == null && !(await isServed(row)));
    await prep(); ok("then prepare resolves and reads it and it is served", await isServed(RW("grautogallery", 960))); }

  // ---- A CHANGE IN WHAT THE CAR IS sends it back to the resolver ----
  { const d = DS("grautogallery", 960); V_FACT(d, { title: "1987 Porsche 911 Carrera 3.2 Coupe" }); await run(); const row = RW("grautogallery", 960);
    ok("a changed title sends the listing back to the resolver (no stale car or read kept, not served until prepared again)", row.resolve_state == null && row.car == null && row.read == null && !(await isServed(row)), [row.resolve_state]);
    await prep(); ok("and prepare makes it ready again", await isServed(RW("grautogallery", 960))); }

  // ---- STALE: hidden, not deleted, back by the two roads ----
  { const d = DS("classiccars", 401), r0 = RW("classiccars", 401);
    ok("before: a live classified is served", await isServed(r0));
    V_STALE(d, 30); const x = await run(); let row = RW("classiccars", 401);
    ok("the vendor has not seen it for 30 hours: the stale poll returns it and it is HIDDEN (still in the table, status active, not gone, its read and car kept) and not served", row.hidden === true && !!row.hidden_at && row.status === "active" && row.gone === false && row.resolve_state === "resolved" && !!row.read && x.o.hidden >= 1 && !(await isServed(row)), [row.hidden, x.o.hidden]);
    const inv = (await servable()).inventory; ok("the answer's inventory counts it as stale", inv.held_back.stale >= 1, inv.held_back);
    const x2 = await run(); ok("it stays hidden while the vendor still has not seen it (no flapping, nothing re-added)", RW("classiccars", 401).hidden === true && x2.o.unhidden === 0, [x2.o.unhidden]);
    // road (b): a presence check moves last_seen_at (and updated_at) but is NOT a change: the change poll never carries it, the next COMPLETE stale poll no longer lists it, and it comes back
    V_SEEN(d); const lastSeenBefore = RW("classiccars", 401).last_seen; const x3 = await run(); row = RW("classiccars", 401);
    ok("ROAD B: seen again by a presence check only: the change poll does not carry it (its stored last_seen is still the old one) and the next complete stale poll no longer lists it, so it is unhidden and served", row.hidden === false && row.hidden_at == null && row.last_seen === lastSeenBefore && x3.o.unhidden >= 1 && await isServed(row), [row.hidden, x3.o.unhidden]);
    // road (a): hidden again, then a real change that carries a fresh last_seen_at
    V_STALE(d, 30); await run(); ok("hidden again", RW("classiccars", 401).hidden === true);
    V_PRICE(d, 39999); const x4 = await run(); row = RW("classiccars", 401);
    ok("ROAD A: a change poll that carries it with a last_seen_at inside 24 hours unhides it by itself (the stale poll had nothing left to unhide) and it is served at the new price", row.hidden === false && row.asking_price_usd === 39999 && x4.o.unhidden === 0 && await isServed(row), [row.hidden, x4.o.unhidden]);
    // a hidden listing the vendor then calls sold stays out (the stale poll's absence road never revives a listing that is not active)
    V_STALE(d, 30); await run(); V_STATUS(d, "sold"); const xs = await run(); row = RW("classiccars", 401);
    ok("a hidden listing the vendor then calls sold is gone for us and the stale poll no longer listing it (it is not active) brings nothing back: nothing is unhidden, the row stays hidden and gone", row.status === "sold" && row.gone === true && row.hidden === true && xs.o.unhidden === 0 && !(await isServed(row)), [row.status, row.hidden, xs.o.unhidden]);
    V_STATUS(d, "active"); V_SEEN(d); await run(); }

  // ---- A SHORT ALLOWANCE: change polls first, then stale polls, then loads; a stale poll cut short never brings anything back ----
  { const d = DS("grautogallery", 960); V_STALE(d, 30); await run(); ok("hidden for the short allowance case (in the second source: the stale poll that is cut short)", RW("grautogallery", 960).hidden === true); V_SEEN(d);
    const order = RULES.pulledSources(), nCh = order.length, okBefore = SYNC.rows.get("forsale_sync:grautogallery").stale.ok_at;
    setCfg({ forsale_run_cap: nCh + 1 }); setSpent(0); const x = await runPull();
    ok("with an allowance of one more than the change polls, the run does every change poll, then ONE stale poll, and stops on the allowance in the stale phase", x.calls.slice(0, nCh).every(c => c.changed_since) && x.calls[nCh] && x.calls[nCh].last_seen_before && x.o.stopped && x.o.stopped.reason === "allowance" && x.o.stopped.phase === "stale", [x.calls.length, x.o.stopped]);
    ok("a stale poll cut short brings nothing back and does not stamp itself finished (the vendor has seen it again, but a partial poll cannot say it is no longer listed)", RW("grautogallery", 960).hidden === true && x.o.unhidden === 0 && SYNC.rows.get("forsale_sync:grautogallery").stale.ok_at === okBefore, x.o.unhidden);
    setCfg({ forsale_run_cap: 5 }); setSpent(0); const y = await runPull();
    ok("a run too short for the change polls does change polls only, none of the stale polls", y.calls.length === 5 && y.calls.every(c => c.changed_since) && y.o.stopped.phase === "change", [y.calls.length, y.o.stopped]);
    setCfg({}); setSpent(0); await run(); ok("a full run then brings it back (road B)", RW("grautogallery", 960).hidden === false); }

  // ---- A RESUMED FULL LOAD: the cursor saved after each page, never serving or marking anything from an unfinished walk, ascending ----
  let BFALL = [];
  { const BF = Array.from({ length: 230 }, (_, i) => rec("barnfinds", { vin: vin(2000 + i), asking_price: 30000 + i, changed_at: stamp() })); DATASET.push(...BF); BFALL = BF;
    SYNC.rows.delete("forsale_sync:barnfinds"); const only = { pull: { dealers: false, classifieds: false, autotraderclassics: false, barnfinds: true } }, bfRows = () => TABLE.filter(r => r.source === "barnfinds" && BF.some(b => b.id === r.vendor_id)).length;
    setCfg({ ...only, forsale_run_cap: 1 }); setSpent(0); const calls0 = VENDOR_CALLS.length; let x = await runPull();
    ok("a load with an allowance of 1 reads one page (100 listings) and stops on the allowance in the load phase", x.calls.length === 1 && x.calls[0].status === "active" && x.calls[0].direction === "asc" && !x.calls[0].cursor && x.o.stopped && x.o.stopped.reason === "allowance" && x.o.stopped.phase === "load" && bfRows() <= 100 && bfRows() > 0, [x.calls.length, bfRows(), x.o.stopped]);
    let st = SYNC.rows.get("forsale_sync:barnfinds");
    ok("the page cursor is saved after the page was written; the load is not finished; the change poll has not started", st.load.done === false && !!st.load.cursor && st.load.pages === 1 && !st.change, st);
    ok("an unfinished load serves nothing: the source is not live, and nothing was marked gone", !(await servable()).inventory.sources_live.includes("barnfinds") && TABLE.filter(r => r.source === "barnfinds" && r.gone).length === 0);
    // while the load is stopped, the vendor re-stamps (a presence check) one listing not yet read and one already read
    V_SEEN(BF[229]); V_SEEN(BF[0]);
    setCfg({ ...only, forsale_run_cap: 5 }); setSpent(0); x = await runPull();
    ok("the next run RESUMES at the saved cursor (not page 1) and finishes the load", x.calls[0].cursor === st.load.cursor && x.calls.length >= 2 && x.o.stopped === null && SYNC.rows.get("forsale_sync:barnfinds").load.done === true, [x.calls.length, x.o.stopped]);
    ok("EVERY listing is stored once, including the one re-stamped before it was read (an ascending walk puts a re-stamped listing at the END of its order, so a presence check never makes a walk miss it)", bfRows() === 230 && TABLE.filter(r => r.source === "barnfinds" && r.vendor_id === BF[229].id).length === 1, bfRows());
    // an expired page cursor (24 hours): the load for that source restarts, says so, and still finishes
    SYNC.rows.delete("forsale_sync:barnfinds"); setCfg({ ...only, forsale_run_cap: 1 }); setSpent(0); await runPull(); CLOCK.shiftMs = 25 * HOUR;
    setCfg({ ...only, forsale_run_cap: 9 }); setSpent(0); x = await runPull(); CLOCK.shiftMs = 0;
    ok("a page cursor older than 24 hours is refused by the vendor (400): that source's load restarts from the first page, the run says so, and it finishes", (x.o.errors || []).some(e => /load cursor refused/.test(e.error)) && SYNC.rows.get("forsale_sync:barnfinds").load.done === true && bfRows() === 230, x.o.errors);
    setCfg({}); setSpent(0); await run(); ok("after the load the source is polled: its checkpoint is saved and it serves again", !!SYNC.rows.get("forsale_sync:barnfinds").change.checkpoint && (await servable()).inventory.sources_live.includes("barnfinds")); }

  // ---- A CHANGE POLL THAT SPANS PAGES: the page cursor is kept, the checkpoint moves only when the poll ends, a refused cursor or checkpoint recovers ----
  { const GA = DATASET.filter(d => d.source === "grautogallery"); const fill = Array.from({ length: 250 }, (_, i) => rec("grautogallery", { vin: vin(3000 + i), asking_price: 20000 + i, changed_at: stamp() })); DATASET.push(...fill);
    const only = { pull: { dealers: false, classifieds: false, autotraderclassics: false, grautogallery: true } }, cp0 = SYNC.rows.get("forsale_sync:grautogallery").change.checkpoint;
    setCfg({ ...only, forsale_run_cap: 1 }); setSpent(0); let x = await runPull(); let st = SYNC.rows.get("forsale_sync:grautogallery");
    ok("a change poll of more than a page, stopped after one page: the page is written, the page cursor is saved, the checkpoint has NOT moved", x.calls.length === 1 && x.calls[0].cursor === cp0 && !!st.change.page_cursor && st.change.checkpoint === cp0 && TABLE.filter(r => r.vendor_id >= fill[0].id && r.source === "grautogallery").length === 100, [x.calls.length, !!st.change.page_cursor, TABLE.filter(r => r.source === "grautogallery" && r.vendor_id >= fill[0].id).length]);
    setCfg({ ...only, forsale_run_cap: 2 }); setSpent(0); x = await runPull(); st = SYNC.rows.get("forsale_sync:grautogallery");
    ok("the next run resumes the traversal at its saved page cursor with the SAME filters, and at its last page saves the new checkpoint", x.calls[0].cursor && x.calls[0].changed_since === SYNC.rows.get("forsale_sync:grautogallery").change.since && x.calls[0].status === "all" && !st.change.page_cursor && st.change.checkpoint && st.change.checkpoint !== cp0 && TABLE.filter(r => r.source === "grautogallery" && r.vendor_id >= fill[0].id).length === 250, [x.calls.length, TABLE.filter(r => r.source === "grautogallery" && r.vendor_id >= fill[0].id).length]);
    DATASET.push(...fill.slice(0, 0)); for (const f of fill.slice(0, 150)) V_FACT(f, { exterior_color: "Black" });
    setCfg({ ...only, forsale_run_cap: 1 }); setSpent(0); await runPull(); CLOCK.shiftMs = 25 * HOUR; setCfg({ ...only, forsale_run_cap: 9 }); setSpent(0); x = await runPull(); CLOCK.shiftMs = 0;
    ok("a page cursor that expired (400) restarts the traversal from the saved checkpoint, says so, and finishes", (x.o.errors || []).some(e => /change cursor refused/.test(e.error)) && !SYNC.rows.get("forsale_sync:grautogallery").change.page_cursor && x.o.stopped === null, x.o.errors);
    for (const f of fill.slice(0, 20)) V_FACT(f, { exterior_color: "White" }); REFUSE.checkpoints = true; setCfg({ ...only, forsale_run_cap: 9 }); setSpent(0); x = await runPull(); REFUSE.checkpoints = false;
    ok("a refused checkpoint (the vendor's key rotated) restarts from the fixed changed_since: nothing lost, rows applied again harmlessly", (x.o.errors || []).some(e => /change cursor refused/.test(e.error)) && !!SYNC.rows.get("forsale_sync:grautogallery").change.checkpoint && TABLE.filter(r => r.source === "grautogallery" && r.vendor_id >= fill[0].id).length === 250, x.o.errors);
    setCfg({}); setSpent(0); void GA;
    for (let i = DATASET.length - 1; i >= 0; i--) if (fill.includes(DATASET[i]) || BFALL.includes(DATASET[i])) DATASET.splice(i, 1);   // the bulk listings of these cases leave the vendor again: the budget cases below are one page a source
  }

  // ---- THE LAPSE: a source whose polls have not finished lately is not served ----
  { const key = "forsale_sync:streetside", st = SYNC.rows.get(key), keep = JSON.stringify(st), r = RW("streetside", 1);
    const at = h => new Date(Date.now() - h * HOUR).toISOString();
    ok("polls finished 29 hours ago: still served (one missed run at twice a day is tolerated)", (st.change.ok_at = at(29), st.stale.ok_at = at(29), SYNC.rows.set(key, st), await isServed(r)));
    ok("the change poll last finished 31 hours ago: the source is not served (and the inventory says it lapsed)", (st.change.ok_at = at(31), st.stale.ok_at = at(1), SYNC.rows.set(key, st), !(await isServed(r)) && (await servable()).inventory.held_back.sync_lapsed >= 1));
    ok("the stale poll last finished 31 hours ago: the source is not served", (st.change.ok_at = at(1), st.stale.ok_at = at(31), SYNC.rows.set(key, st), !(await isServed(r))));
    ok("no change poll ever finished: not served", (delete st.change.ok_at, st.stale.ok_at = at(1), SYNC.rows.set(key, st), !(await isServed(r))));
    SYNC.rows.set(key, JSON.parse(keep)); ok("restored, served again", await isServed(r));
    SYNC.down = true; SERVE.forSaleReset(); const g = await SERVE.servableRows(ENV).then(() => "served", () => "refused"); const calls0 = VENDOR_CALLS.length, w0 = DB_WRITES.length; const z = await runPull(); SYNC.down = false; SERVE.forSaleReset();
    ok("the state of the sync unreadable: nothing is served, the run makes no vendor query, writes nothing, and says why", g === "refused" && z.calls.length === 0 && DB_WRITES.length === w0 && z.o.stopped && z.o.stopped.reason === "state_unreadable", [g, z.calls.length, z.o.stopped]); }

  // ---- THE BUDGET AND THE AUCTION FEED'S RESERVE bind the POLLS exactly as they bind a load (the run is the same run) ----
  { const RES = () => Math.ceil(300000 * Math.min(1, BUD.daysLeft(Date.now(), 25) / 30));
    setCfg({ plan_monthly: 1000000, auction_reserve_monthly: 300000, forsale_monthly_budget: 900000, forsale_run_cap: 400 }); setSpent(0);
    setRemain(RES() + 5); let x = await runPull();
    ok("everything loaded, the vendor's count left 5 above what the auction feed is kept for: the polls make exactly 5 queries, change polls first, and stop on the reserve", x.calls.length === 5 && x.calls.every(c => c.changed_since) && x.o.binding === "auction_reserve" && x.o.stopped && x.o.stopped.reason === "allowance" && x.o.stopped.phase === "change", [x.calls.length, x.o.binding, x.o.stopped]);
    setRemain(RES()); x = await runPull();
    ok("at the reserve itself the polls make no query and say so", x.calls.length === 0 && x.o.skipped === "auction_reserve", [x.calls.length, x.o.skipped]);
    setSpent(0); setCfg({ forsale_monthly_budget: 7, forsale_run_cap: 400 }); setRemain(90000); x = await runPull();
    ok("a monthly budget of 7: the polls make 7 queries and no more", x.calls.length === 7 && x.o.binding === "monthly_budget", [x.calls.length, x.o.binding]);
    setCfg({}); setSpent(0); setRemain(90000); }

  // ---- THE STAND-IN IS THE VENDOR'S: every request of every phase used only parameters the docs list, and the stand-in refused none ----
  { const used = new Set(VENDOR_CALLS.flatMap(c => Object.keys(c).filter(k => k !== "auth")));
    ok("every parameter any phase sent is one the vendor lists (changed_since, last_seen_before, direction, cursor, status, source, country_code, limit)", [...used].every(k => SHAPE.parameters.includes(k)) && ["changed_since", "last_seen_before", "direction", "cursor"].every(k => used.has(k)), [...used]);
    ok("a request the vendor would refuse is refused by the stand-in (an unknown parameter, a changed filter on a cursor)", (() => { const u = new URL("https://api.oldcarsdata.com/classifieds?availability=active"); return pageOf(u).code === 400; })() && (() => { const a = pageOf(new URL("https://api.oldcarsdata.com/classifieds?source=streetside&status=all&direction=asc&changed_since=2020-01-01T00:00:00Z&limit=1")); const c = a.body.meta.next_cursor; return pageOf(new URL("https://api.oldcarsdata.com/classifieds?source=streetside&status=all&direction=asc&changed_since=2021-01-01T00:00:00Z&limit=1&cursor=" + c)).code === 400; })()); }
});

// ================= 8. THE BUDGET, THE RESERVE, THE RUN CAP, THE ORDER, THE SCHEDULE (Lane D, Nov 18 2026; Lane F's real pull: 76,690 listings, about 770 queries a full pull, against a plan of 10,000 the auction feed shares) =================
// CAUSE this guards: the pull was built on a census count (10,054 listings, about 90 queries) with no spending limit of its own: it would have drawn about 92,000 queries a month from a plan of 10,000 and taken the auction feed's allowance. CLASS: any
// job that spends vendor queries must have its own budget and a per run cap read from one config (default 0), keep a hard reserve for the auction feed, stop cleanly (marking nothing gone) and say so in the report, and no schedule may fire until a person says so.
await section("budget", async () => {
  process.env.CRON_SECRET = process.env.CRON_SECRET || "cron-secret-" + "Bq3Lw8Vn"; const CRON = "Bearer " + process.env.CRON_SECRET;
  const vjA = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8")), probeHdr = { "x-ops-key": PROBE }, n = () => VENDOR_CALLS.length, writes = () => DB_WRITES.length;
  const pull = async (extra = "", keep = false) => { if (!keep) SYNC.rows.clear(); const before = n(), r = await call(PULL, "/api/pullForSale?mode=pull" + extra, { crew: false, headers: probeHdr }); return { r, o: json(r) || {}, calls: VENDOR_CALLS.slice(before) }; };   // each budget case starts from nothing loaded (a first run is the load: one call per source here) unless it says keep
  const postedFs = () => USAGE.map(b => { try { return JSON.parse(b); } catch { return null; } }).filter(e => e && e.event_type === "ocd_call" && e.metadata && e.metadata.job === "pull_for_sale").reduce((t, e) => t + (Number(e.oldcarsdata_metered_requests) || 0), 0);
  const setSpent = k => { SEED_FS = k - postedFs(); };       // what this cycle has cost so far, counted from the metered rows (the run's own rows are in it)
  const all = RULES.pulledSources(), DEALERS = all.filter(k => RULES.typeOf(k) === "dealer");
  const backdate = () => TABLE.forEach(r => { r.pulled_at = new Date(Date.now() - 10 * 60e3).toISOString(); });
  // ---- A. THE SHIPPED CONFIG: the 14 dealers plus classiccars, dupontregistry and barnfinds, twice a day, inside the room (switched on on Sam's word, Nov 19 2026) ----
  const EXTRA = ["classiccars", "dupontregistry", "barnfinds"];
  let a; const A_SRC = [...DEALERS, ...EXTRA], A_CALLS = BUD.callsFor(SHAPE.laneFActiveUsLast24h || {}, DEALERS);
  const cronOf = pat => (vjA.crons || []).filter(c => pat.test(c.path)), perDay = sched => { const m = /^\d+ \*\/(\d+) \* \* \*$/.exec(sched || ""), mm = /^\*\/(\d+) \* \* \* \*$/.exec(sched || ""); return m ? 24 / Number(m[1]) : mm ? 1440 / Number(mm[1]) : /^\d+ \* \* \* \*$/.test(sched || "") ? 24 : null; };
  ok("the shipped config exists and a person can read it: a plan, an auction reserve, a budget, a per run cap, the groups and the schedule switches", !!SHIPPED && ["plan_monthly", "auction_reserve_monthly", "forsale_monthly_budget", "forsale_run_cap", "pull", "schedule"].every(k => k in SHIPPED), SHIPPED && Object.keys(SHIPPED));
  ok("the shipped plan is the 10,000 the auction feed shares, with a hard reserve for auctions above 0 and under the plan", !!SHIPPED && SHIPPED.plan_monthly === 10000 && SHIPPED.auction_reserve_monthly > 0 && SHIPPED.auction_reserve_monthly < SHIPPED.plan_monthly, SHIPPED && [SHIPPED.plan_monthly, SHIPPED.auction_reserve_monthly]);
  ok("the shipped pull is exactly the 14 dealers plus classiccars, dupontregistry and barnfinds (17 sources), and NOT autotraderclassics", !!SHIPPED && RULES.pulledSources(SHIPPED.pull).slice().sort().join() === A_SRC.slice().sort().join() && RULES.pulledSources(SHIPPED.pull).length === 17 && !RULES.pulledSources(SHIPPED.pull).includes("autotraderclassics") && DEALERS.length === 14, SHIPPED && RULES.pulledSources(SHIPPED.pull));
  ok("autotraderclassics is off by its own switch, not only by its group, and the three classifieds are on by their own names", !!SHIPPED && SHIPPED.pull.autotraderclassics === false && EXTRA.every(k => SHIPPED.pull[k] === true) && SHIPPED.pull.dealers === true);
  ok("the shipped schedule is ON for the pull and for prepare (Sam's word, Nov 19 2026): both flags are true", !!SHIPPED && SHIPPED.schedule && SHIPPED.schedule.pull_on === true && SHIPPED.schedule.prepare_on === true, SHIPPED && SHIPPED.schedule);
  { const pc = cronOf(/pullForSale\?mode=pull$/), pr = cronOf(/pullForSale\?mode=prepare$/);
    ok("vercel.json carries exactly the two cron lines for the route (pull twice a day, prepare every 10 minutes, Sam's word) and the function's own maxDuration stays", cronOf(/pullForSale/).length === 2 && pc.length === 1 && pr.length === 1 && pc[0].schedule === "10 */12 * * *" && pr[0].schedule === "*/10 * * * *" && !!(vjA.functions && vjA.functions["api/pullForSale.js"] && vjA.functions["api/pullForSale.js"].maxDuration >= 300), cronOf(/pullForSale/)); }
  { const about = String(SHIPPED && SHIPPED._about || ""), pullCron = /mode=pull with schedule (10 \*\/12 \* \* \*)/.exec(about), prepCron = /mode=prepare with schedule (\*\/10 \* \* \* \*)/.exec(about);
    const flagsOn = !!SHIPPED && SHIPPED.schedule.pull_on === true && SHIPPED.schedule.prepare_on === true, linesOn = cronOf(/pullForSale\?mode=pull$/).length === 1 && cronOf(/pullForSale\?mode=prepare$/).length === 1;
    ok("a flag and its cron line go together: both flags are on AND both lines are there (never one without the other, which would fire nothing), and the config's words name the same two lines", flagsOn === linesOn && flagsOn && !!pullCron && !!prepCron && perDay(pullCron[1]) === 2 && perDay(prepCron[1]) === 144 && pullCron[1] === cronOf(/pullForSale\?mode=pull$/)[0].schedule && prepCron[1] === cronOf(/pullForSale\?mode=prepare$/)[0].schedule, about.slice(0, 200)); }
  { const about = String(SHIPPED && SHIPPED._about || ""), room = SHIPPED ? SHIPPED.plan_monthly - SHIPPED.auction_reserve_monthly : 0, C0 = SHAPE.laneFActiveUsLast24h || {}, k = perDay((/mode=pull with schedule (10 \*\/12 \* \* \*)/.exec(about) || [])[1]) || 0;
    const floorRunA = BUD.pollCalls(C0, DEALERS, k, 0), worstRunA = BUD.pollCalls(C0, DEALERS, k, 1), loadA = A_CALLS;
    ok("the dealers' own cost model still holds at twice a day: a poll run is 28 queries when nothing changed and 40 when every listing changes in a day; the load is 42", k === 2 && floorRunA === 28 && worstRunA === 40 && loadA === 42, [k, floorRunA, worstRunA, loadA]);
    ok("the config's own words carry the dealers' numbers (56 a day, 1,680 and 2,400 a month, 80 a day, the load 42) and the 17 sources' (427 to load, 34 a poll run, 68 a day, 104 a day, 9 percent)", /56 queries a day \(1,680 a month\)/.test(about) && /at most 80 a day \(2,400 a month\)/.test(about) && /plus 42 once for the load/.test(about) && /the load is 427 queries/.test(about) && /34 queries when nothing changed \(68 a day/.test(about) && /104 a day/.test(about) && /under about 9 percent/.test(about), about.slice(0, 120));
    ok("the shipped monthly budget is 2,800 and sits inside the room (plan minus the auction reserve): the sync can never reach the auction reserve", !!SHIPPED && SHIPPED.forsale_monthly_budget === 2800 && SHIPPED.forsale_monthly_budget <= room && room === 3000, [SHIPPED && SHIPPED.forsale_monthly_budget, room]);
    ok("the shipped per run cap is 120: it covers a poll run of the 17 sources at their worst (a poll run floor 34, ceiling 40 for the dealers, each with the reading query) and lets the 427 query load finish over four to five runs, never one run", !!SHIPPED && SHIPPED.forsale_run_cap === 120 && SHIPPED.forsale_run_cap > worstRunA && SHIPPED.forsale_run_cap < 427 && Math.ceil(427 / SHIPPED.forsale_run_cap) <= 5, SHIPPED && [SHIPPED.forsale_run_cap, worstRunA]);
    ok("the shipped sync window: sync.lapse_hours is 30, between two and three poll intervals (one missed run tolerated, two in a row take a source dark)", !!SHIPPED && SHIPPED.sync && SHIPPED.sync.lapse_hours === 30 && SHIPPED.sync.lapse_hours > 2 * 24 / k && SHIPPED.sync.lapse_hours < 3 * 24 / k, SHIPPED && SHIPPED.sync); }
  ok("FORSALE_PUBLIC stays off", GATE.FORSALE_PUBLIC === false);
  if (SHIPPED) { for (const k of Object.keys(BUDGET)) delete BUDGET[k]; Object.assign(BUDGET, JSON.parse(JSON.stringify(SHIPPED))); }
  setRemain(90000); setSpent(0);
  { const d0 = n(), w0b = writes(); a = await pull(); ok("the shipped config, run as shipped, pulls the 17 sources (and never autotraderclassics) inside its run cap", a.r.code === 200 && a.calls.length === A_SRC.length && a.calls.every(c => A_SRC.includes(c.source)) && a.o.stopped === null, [a.calls.length, a.o.stopped]); }
  { const w1 = writes(), u0 = USAGE.length;
    setCfg({ forsale_monthly_budget: 0 }); a = await pull();
    ok("a budget of 0 makes no vendor query, writes nothing, and says why (budget_zero)", a.r.code === 200 && a.calls.length === 0 && writes() === w1 && a.o.skipped === "budget_zero" && a.o.vendorQueries === 0, [a.calls.length, a.o.skipped]);
    ok("a skipped pull is recorded as a usage row", USAGE.slice(u0).some(b => /forsale_pull_skipped/.test(b))); }
  setCfg({ forsale_run_cap: 0 }); a = await pull(); ok("a monthly budget with a per run cap of 0 pulls nothing", a.calls.length === 0 && a.o.skipped === "budget_zero", a.o.skipped);
  setCfg({ forsale_monthly_budget: "ten" }); a = await pull(); ok("a budget that is not a number is 0 (nothing is pulled)", a.calls.length === 0, a.o.skipped);

  // ---- B. THE PER RUN CAP: stops cleanly after exactly that many queries, marks nothing gone, says where ----
  setCfg({ forsale_run_cap: 3 }); setSpent(0); setRemain(90000);
  const gi = DATASET.findIndex(d => d.source === "streetside" && d.vin === vin(5)), removed = DATASET.splice(gi, 1)[0]; backdate();
  const goneBefore = TABLE.filter(r => r.gone).length;
  a = await pull();
  ok("a per run cap of 3 makes exactly 3 vendor queries", a.calls.length === 3 && a.o.vendorQueries === 3, [a.calls.length, a.o.vendorQueries]);
  ok("the run loaded the dealers first, in the file's order", a.calls.map(c => c.source).join() === DEALERS.slice(0, 3).join(), a.calls.map(c => c.source));
  ok("the run says it stopped, why (the allowance), in which phase, where, and what it had not done", !!a.o.stopped && a.o.stopped.reason === "allowance" && a.o.stopped.phase === "load" && a.o.stopped.source === DEALERS[3] && a.o.stopped.sourcesLeft.length === all.length - 3, a.o.stopped);
  ok("a run that stops marks NOTHING gone (a source it did not reach, or one that no longer lists a car, still holds it)", a.o.markedGone === 0 && TABLE.filter(r => r.gone).length === goneBefore && TABLE.find(r => r.vin === vin(5) && r.source === "streetside").gone === false, [a.o.markedGone]);
  ok("the sources it did not reach have no finished load saved (they serve nothing, and the next run starts them)", DEALERS.slice(3).every(k => !stateOf(k) || !stateOf(k).load || !stateOf(k).load.done) && DEALERS.slice(0, 3).every(k => stateOf(k).load.done), DEALERS.slice(0, 4).map(k => stateOf(k)));
  ok("the run names its binding limit and the plan it was given", a.o.binding === "run_cap" && a.o.plan && a.o.plan.limits.runCap === 3, [a.o.binding, a.o.plan]);
  // the report route says so, spends nothing
  const q0 = n(), rep = json(await call(PULL, "/api/pullForSale?report=1", { crew: false, headers: probeHdr })) || {}, B = rep.budget || {};
  ok("the report route says the last run stopped, why and where, with the vendor untouched, and prints each source's sync (loaded or not, when its polls last finished, whether it is served)", n() === q0 && rep.vendorQueries === 0 && B.lastRun && B.lastRun.stopped && B.lastRun.stopped.reason === "allowance" && B.lastRun.stopped.source === DEALERS[3] && B.lastRun.requests === 3 && rep.sync && rep.sync.lapseHours === 30 && rep.sync.sources[DEALERS[0]].loaded === true && rep.sync.sources[DEALERS[3]] === undefined, [B.lastRun, rep.sync]);
  ok("the report route gives the budget: the plan, the reserve, the budget, the run cap, what this cycle has cost, the vendor's count left, the next run's allowance and the limit that binds", ["planMonthly", "auctionReserveMonthly", "forsaleMonthlyBudget", "forsaleRunCap", "spentThisCycle", "vendorRemaining", "nextRunAllowance", "nextRunBinding", "pull", "schedule"].every(k => k in B) && B.spentThisCycle === 3 && B.nextRunAllowance === 3, B);
  // a run that EXACTLY fits is not a stop: it finishes every source's load
  setCfg({ forsale_run_cap: all.length }); setSpent(0); backdate();
  a = await pull();
  ok("a run whose allowance exactly covers every source's load finishes (no stop) and uses all of it", a.calls.length === all.length && a.o.stopped === null && all.every(k => stateOf(k).load.done), [a.calls.length, a.o.stopped]);
  ok("a FINISHED load marks nothing gone either: the car its source no longer lists stays as it was (only the vendor's own status moves a listing: lib/forsale/sync.js)", a.o.markedGone === 0 && TABLE.find(r => r.vin === vin(5) && r.source === "streetside").gone === false, a.o.markedGone);
  DATASET.push(removed); setCfg({}); setSpent(0);
  { const calls = []; SYNC.rows.clear(); const E = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
    const out = INGEST ? await INGEST.syncForSale(E, KEY, { call: async p => { calls.push(p); return { data: [], meta: { has_more: false, next_cursor: null } }; } }) : { requests: -1 };
    ok("the sync itself, given no allowance, makes no vendor query (a caller that forgets one spends nothing)", calls.length === 0 && out.requests === 0, [calls.length, out.requests]);
    const out2 = INGEST ? await INGEST.syncForSale(E, KEY, { maxRequests: 2, call: async p => { calls.push(p); return { data: [], meta: { has_more: true, next_cursor: "x" } }; } }) : { requests: -1 };
    ok("the sync itself, given an allowance of 2, makes 2 and says it stopped on the allowance, marking nothing gone", calls.length === 2 && out2.requests === 2 && out2.stopped && out2.stopped.reason === "allowance" && out2.markedGone === 0, [calls.length, out2.stopped]);
    SYNC.rows.clear(); }
  // ---- C. THE MONTHLY BUDGET: its own, counted from the metered rows; the next run sees what the last spent ----
  setCfg({ forsale_monthly_budget: 10, forsale_run_cap: 400 }); setSpent(8);
  a = await pull();
  ok("8 spent of a monthly budget of 10: the run is given 2 and makes 2", a.calls.length === 2 && a.o.stopped && a.o.stopped.reason === "allowance" && a.o.binding === "monthly_budget", [a.calls.length, a.o.binding]);
  a = await pull();
  ok("then 10 are spent (counted from the metered rows the first run wrote): the next run makes none and says the budget is spent", a.calls.length === 0 && a.o.skipped === "monthly_budget" && a.o.plan.spentCycle === 10, [a.calls.length, a.o.skipped, a.o.plan && a.o.plan.spentCycle]);
  setCfg({ plan_monthly: 1000, auction_reserve_monthly: 700, forsale_monthly_budget: 5000, forsale_run_cap: 400 }); setSpent(299);
  a = await pull();
  ok("a budget above plan minus the auction reserve is held to it: 299 spent of a room of 300, one query", a.calls.length === 1 && a.o.plan.monthlyCap === 300, [a.calls.length, a.o.plan && a.o.plan.monthlyCap]);
  setSpent(300); a = await pull();
  ok("300 spent, the room is gone: the for sale pull cannot spend the auction feed's allowance whatever its own budget says", a.calls.length === 0 && a.o.skipped === "monthly_budget", [a.calls.length, a.o.skipped]);

  // ---- D. THE AUCTION FEED'S RESERVE, from the vendor's own count left ----
  const RES = () => Math.ceil(300000 * Math.min(1, BUD.daysLeft(Date.now(), 25) / 30));
  setCfg({ plan_monthly: 1000000, auction_reserve_monthly: 300000, forsale_monthly_budget: 900000, forsale_run_cap: 400 }); setSpent(0);
  setRemain(RES() + 5); a = await pull();
  ok("the vendor's count left is 5 above what the auction feed is kept for the days left: 5 queries, no more", a.calls.length === 5 && a.o.binding === "auction_reserve", [a.calls.length, a.o.binding]);
  setRemain(RES()); a = await pull();
  ok("the vendor's count left is exactly the auction feed's reserve: the pull makes no query", a.calls.length === 0 && a.o.skipped === "auction_reserve", [a.calls.length, a.o.skipped]);
  setRemain(RES() - 500); a = await pull();
  ok("under the reserve: no query", a.calls.length === 0 && a.o.skipped === "auction_reserve", [a.calls.length, a.o.skipped]);
  ok("the reserve is the auction feed's use scaled to the days left in the cycle (it shrinks as the cycle runs out)", BUD.planRun({ cfg: { plan_monthly: 10000, auction_reserve_monthly: 7000, forsale_monthly_budget: 5000, forsale_run_cap: 400, cycle_reset_day: 25 }, spentCycle: 0, remaining: 5000, now: Date.UTC(2026, 10, 18, 12) }).reserveLeft === Math.ceil(7000 * (Date.UTC(2026, 10, 25) - Date.UTC(2026, 10, 18, 12)) / 864e5 / 30));
  setRemain(90000);

  // ---- E. WHAT IT CANNOT PROVE IT MAY NOT SPEND ----
  setCfg({}); setSpent(0); USAGE_DOWN = true; a = await pull(); USAGE_DOWN = false;
  ok("the usage table unreadable: the run cannot count what the cycle has cost, so it spends nothing", a.calls.length === 0 && a.o.skipped === "spend_unreadable", [a.calls.length, a.o.skipped]);
  ok("the pure plan, every edge: zero budget, zero cap, spent, reserve, unknowns", (() => {
    const base = { plan_monthly: 10000, auction_reserve_monthly: 7000, forsale_monthly_budget: 2000, forsale_run_cap: 100, cycle_reset_day: 25 }, now = Date.UTC(2026, 10, 18, 12), P = (o, x) => BUD.planRun({ cfg: { ...base, ...o }, spentCycle: 0, remaining: 9000, now, ...x }).allowance;
    const RL = Math.ceil(7000 * (Date.UTC(2026, 10, 25) - now) / 864e5 / 30);   // what the auction feed is kept for the days left
    return P({}) === 100 && P({ forsale_run_cap: 0 }) === 0 && P({ forsale_monthly_budget: 0 }) === 0 && P({}, { spentCycle: 1950 }) === 50 && P({}, { spentCycle: 2000 }) === 0 && P({ forsale_monthly_budget: 99999 }, { spentCycle: 2999 }) === 1 && P({ forsale_monthly_budget: 99999 }, { spentCycle: 3000 }) === 0
      && P({}, { spentCycle: null }) === 0 && P({}, { remaining: null }) === 0 && P({}, { remaining: 1000 }) === 0 && P({}, { remaining: RL }) === 0 && P({}, { remaining: RL + 60 }) === 60 && P({}, { remaining: RL + 5000 }) === 100 && P({ auction_reserve_monthly: 10000 }) === 0;
  })());
  ok("the billing cycle begins on the reset day, across a year end", [[Date.UTC(2026, 10, 18), Date.UTC(2026, 9, 25)], [Date.UTC(2026, 10, 25, 3), Date.UTC(2026, 10, 25)], [Date.UTC(2027, 0, 3), Date.UTC(2026, 11, 25)]].every(([now, want]) => BUD.cycleStart(now, 25).getTime() === want));

  // ---- F. THE ORDER AND THE SWITCHES: the dealers first, then the classifieds, autotraderclassics last and its own switch ----
  setCfg({}); setSpent(0); a = await pull(); const order = [...new Set(a.calls.map(c => c.source))];
  ok("every dealer is walked before any classified, and autotraderclassics is the last of all", order.length === all.length && order.slice(0, DEALERS.length).every(k => RULES.typeOf(k) === "dealer") && order.slice(DEALERS.length).every(k => RULES.typeOf(k) === "classified") && order[order.length - 1] === "autotraderclassics", order);
  setCfg({ pull: { dealers: true, classifieds: true, autotraderclassics: false } }); setSpent(0); a = await pull();
  ok("autotraderclassics switched off on its own: it is never asked for, the other classifieds still are", !a.calls.some(c => c.source === "autotraderclassics") && a.calls.some(c => c.source === "classiccars") && a.calls.some(c => c.source === "streetside"), [...new Set(a.calls.map(c => c.source))]);
  setCfg({ pull: { dealers: true, classifieds: false, autotraderclassics: false } }); setSpent(0); a = await pull();
  ok("dealers only: the dealers' sources and nothing else", a.calls.length === DEALERS.length && a.calls.every(c => RULES.typeOf(c.source) === "dealer"), [...new Set(a.calls.map(c => c.source))]);
  setCfg({ pull: { dealers: false, classifieds: false, autotraderclassics: true } }); setSpent(0); a = await pull();
  ok("autotraderclassics alone: only it", a.calls.length >= 1 && a.calls.every(c => c.source === "autotraderclassics"), [...new Set(a.calls.map(c => c.source))]);
  { const P = g => RULES.pulledSources(g).join();
    ok("a source's own switch wins over its group: dupontregistry off leaves the other classifieds; classiccars on alone with every group off is asked for alone", P({ dealers: false, classifieds: true, autotraderclassics: false, dupontregistry: false }) === "classiccars,barnfinds" || P({ dealers: false, classifieds: true, autotraderclassics: false, dupontregistry: false }).split(",").sort().join() === "barnfinds,classiccars", P({ dealers: false, classifieds: true, autotraderclassics: false, dupontregistry: false }));
    ok("a classified on by its own name with its group off is the only one asked for", P({ dealers: false, classifieds: false, autotraderclassics: false, classiccars: true }) === "classiccars", P({ dealers: false, classifieds: false, autotraderclassics: false, classiccars: true }));
    ok("a dealer off by its own name is not asked for", !RULES.pulledSources({ dealers: true, classifieds: false, streetside: false }).includes("streetside") && RULES.pulledSources({ dealers: true, classifieds: false, streetside: false }).length === 13); }
  ok("a held source is never in any order, whatever the switches", ["gatewayclassiccars", "lowmilesnomiles", "carandclassic"].every(k => !RULES.pulledSources({ dealers: true, classifieds: true, autotraderclassics: true }).includes(k)));

  // ---- G. THE REAL CALLS A PULL COSTS, from Lane F's per source counts (100 a page is the vendor's largest) ----
  const C = SHAPE.laneFActiveUsLast24h || {}, order0 = RULES.pulledSources({ dealers: true, classifieds: true, autotraderclassics: true });
  const dealerSrc = order0.filter(k => RULES.typeOf(k) === "dealer"), classSrc = order0.filter(k => RULES.typeOf(k) === "classified" && k !== "autotraderclassics");
  ok("the calls per pull from Lane F's counts: the 14 dealers 42, the three other classifieds 385, autotraderclassics 349, everything 776 (the order's about 770)", BUD.callsFor(C, dealerSrc) === 42 && BUD.callsFor(C, classSrc) === 385 && BUD.callsFor(C, ["autotraderclassics"]) === 349 && BUD.callsFor(C, order0) === 776, [BUD.callsFor(C, dealerSrc), BUD.callsFor(C, classSrc), BUD.callsFor(C, ["autotraderclassics"]), BUD.callsFor(C, order0)]);
  const op = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts/fixtures/forsaleShape.json"), "utf8"));
  ok("the vendor's published page size is 100 at most (no larger page is offered) and the pull asks for it", op.limitMax === 100 && (INGEST ? INGEST.PAGE === 100 : false), [op.limitMax]);

  // ---- H. NO SCHEDULE FIRES UNTIL SAM SAYS SO ----
  const vj = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
  ok("every cron vercel.json carries for the for sale route is the pull or prepare, and a cron fires nothing the config does not switch on (the scheduled cases below)", (vj.crons || []).filter(c => /pullForSale/.test(c.path)).every(c => /^\/api\/pullForSale\?mode=(pull|prepare)$/.test(c.path)));
  ok("vercel.json pins the function's maxDuration (300 seconds) and the pull stops itself before it", vj.functions && vj.functions["api/pullForSale.js"] && vj.functions["api/pullForSale.js"].maxDuration === 300 && /240000/.test(fs.readFileSync(path.join(ROOT, "lib/forsale/sync.js"), "utf8")), vj.functions && vj.functions["api/pullForSale.js"]);
  setCfg({ schedule: { pull_on: false, prepare_on: false } }); setSpent(0); const f0 = FSREADS.length; const q1 = n();
  let r = await call(PULL, "/api/pullForSale?mode=pull", { crew: false, headers: { authorization: CRON } }); let o = json(r) || {};
  ok("a scheduled pull call (Bearer cron secret) with the pull schedule off does nothing and says so", r.code === 200 && o.skipped === "schedule_off" && n() === q1, [r.code, o.skipped]);
  r = await call(PULL, "/api/pullForSale?mode=prepare", { crew: false, headers: { authorization: CRON } }); o = json(r) || {};
  ok("a scheduled prepare call with the prepare schedule off does nothing and says so (no engine run, no read of the table)", r.code === 200 && o.skipped === "schedule_off" && FSREADS.length === f0, [r.code, o.skipped]);
  setCfg({ schedule: { pull_on: true, prepare_on: false } }); setSpent(0); r = await call(PULL, "/api/pullForSale?mode=pull", { crew: false, headers: { authorization: CRON } }); o = json(r) || {};
  ok("switched on in the config, a scheduled pull runs (still inside the budget)", r.code === 200 && !o.skipped && n() > q1, [r.code, o.skipped]);
  setCfg({}); setSpent(0);
  const man = await call(PULL, "/api/pullForSale?mode=pull", { crew: false, headers: probeHdr }); ok("a person with the probe key can still run it by hand with the schedule off (inside the budget)", (json(man) || {}).skipped === undefined && man.code === 200);
  // (last of all: a response with no remaining header makes the vendor client fail closed for the rest of the process, as it does in production)
  { setRemain(90000); FIG = null; setSpent(0); setCfg({}); const f0 = n(); a = await pull();
    ok("no fresh figures kept for the vendor's count: ONE query reads them from the response headers, keeps them, and the run then goes on inside its reserve", a.calls.length >= 2 && a.calls[0].limit === "1" && FIG && FIG.remaining === 90000 && FIG.limit === 10000 && a.o.vendorQueries === a.calls.length, [a.calls.length, a.calls[0] && a.calls[0].limit, FIG]);
    const sizeA = FIG && FIG.at; setRemain(4321); FIG = { remaining: 5000, limit: 10000, reset: "1795580863", at: Date.now() }; REMAIN = 4321; setSpent(0); a = await pull();
    ok("after a run the vendor's own figures from the last response header are kept (the stored count moves from 5000 to the header's 4321)", FIG && FIG.remaining === 4321 && a.calls.length > 1, [FIG && FIG.remaining]);
    { const rep2 = json(await call(PULL, "/api/pullForSale?report=1", { crew: false, headers: probeHdr })) || {}, V = (rep2.budget || {}).vendor || {};
      ok("the report prints the vendor's own plan, remaining and reset as the response header gave them, and when they were read", V.plan === 10000 && V.remaining === 4321 && String(V.reset) === "1795580863" && V.resetAt === "2026-11-25T04:27:43.000Z" && typeof V.readAt === "string" && V.fresh === true && /x-ratelimit-limit/.test(String(V.from)), V);
      ok("the vendor's figures are in the report with no vendor query", rep2.vendorQueries === 0); }
    setRemain(null); a = await pull(); setRemain(90000);
    ok("the vendor's count unknown even from its headers: the reserve cannot be proved, so it spends nothing more than the one reading query and goes no further", a.calls.length <= 1 && a.o.skipped === "remaining_unknown", [a.calls.length, a.o.skipped]); }
  ok("the vendor key is in no skipped answer, report or usage row of these cases", !everyWrite().includes(KEY) && !JSON.stringify(rep).includes(KEY));
});

// ================= 7. THE KEY NEVER IN ANY OUTPUT =================
await section("key", async () => {
  ok("the vendor key is in no log line, usage row or write of this whole run", !everyWrite().includes(KEY));
  const srcs = ["lib/forsale/sync.js", "lib/forsale/prepare.js", "lib/forsale/serve.js", "lib/forsale/rules.js", "api/pullForSale.js", "docs/supabase-forsale.sql", "data/forsaleSources.json"].map(f => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n");
  ok("the key is read from the environment and written in no source file or doc", /process\.env\.OLDCARSDATA_API_KEY/.test(fs.readFileSync(path.join(ROOT, "api/pullForSale.js"), "utf8")) && !/[A-Za-z0-9]{32,}/.test(srcs.replace(/https?:\/\/\S+/g, "")));
  const sql = fs.readFileSync(path.join(ROOT, "docs/supabase-forsale.sql"), "utf8");
  ok("the SQL locks the table down from creation (row level security on, anon and authenticated revoked)", /alter table for_sale_listings enable row level security;/.test(sql) && /revoke all on for_sale_listings from anon, authenticated;/.test(sql));
  { // THE CLASS: a column the code writes or filters on that the table (already created from an EARLIER file) does not have. Every such write or read then fails at the database, whatever the code looks like.
    const body = (/create table if not exists for_sale_listings \(([\s\S]*?)\n\);/.exec(sql) || [])[1] || "", cols = new Set(body.split("\n").map(l => /^\s{2}([a-z_]+)\s+(?!key\b)/.exec(l)).filter(m => m && m[1] !== "unique").map(m => m[1]));
    const EARLIER = new Set("id source source_listing_id source_type title url image_url asking_price_usd mileage location state country_code vin vin_norm year body transmission exterior_color make model car car_key resolve_state read history first_seen last_seen pulled_at gone gone_at updated_at".split(" "));
    const added = [...cols].filter(c => !EARLIER.has(c)), altered = new Set([...sql.matchAll(/alter table for_sale_listings add column if not exists ([a-z_]+) /g)].map(m => m[1]));
    ok("every column the earlier SQL file did not create has its own 'alter table ... add column if not exists' line, so the one file runs on a table that already exists", added.length >= 6 && added.every(c => altered.has(c)) && [...altered].every(c => cols.has(c)), [added, [...altered]]);
    const used = new Set(); for (const r of DB_WRITES) Object.keys(r).forEach(k => used.add(k)); for (const r of TABLE) Object.keys(r).forEach(k => used.add(k));
    const code = ["lib/forsale/sync.js", "lib/forsale/prepare.js", "lib/forsale/serve.js", "lib/forsale/rules.js", "api/pullForSale.js"].map(f => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n").split("\n").filter(l => !/app_usage_events|app_config|event_type|vehicle_market_records|sales_archive|search_events/.test(l)).join("\n");
    for (const m of code.matchAll(/[?&(`"'](?:order=)?([a-z_]+)=(?:eq|neq|in|gte|lte|lt|gt|is|not\.is)\./g)) used.add(m[1]);
    for (const m of code.matchAll(/for_sale_listings\?[^`"']*?select=([a-z_,]+)/g)) m[1].split(",").forEach(c => used.add(c));
    const missing = [...used].filter(c => !cols.has(c) && c !== "select" && c !== "order" && c !== "limit");
    ok("every column the code writes to or filters the table by (the rows the run wrote, the stored rows, every query string in the sync, prepare, serve and the route) is a column in the SQL", used.size > 30 && missing.length === 0, missing); }
  ok("the SQL has no column for a seller name, a description or a zip", !/seller_name|\bdescription\b\s+text|\bzip\b\s+text/.test(sql.replace(/--.*$/gm, "")));
  ok("FORSALE_PUBLIC is off", GATE.FORSALE_PUBLIC === false);
});
console.log = log; console.error = errlog;
log(`forSaleCheck: ${pass} passed, ${fail} failed`); for (const f of fails) log("FAIL " + f);
process.exit(fail ? 1 : 0);

// ----------------------------------------------------------------- the mutants: each breaks one rule in a COPY of the tree; the check must fail
async function mutants() {
  const SRC = ROOT, tmp = fs.mkdtempSync(path.join(os.tmpdir(), "forsale-mut-"));
  const copy = path.join(tmp, "tree");
  for (const d of ["lib", "api", "data", "docs", "scripts"]) fs.cpSync(path.join(SRC, d), path.join(copy, d), { recursive: true });
  for (const f of ["package.json", "vercel.json"]) if (fs.existsSync(path.join(SRC, f))) fs.copyFileSync(path.join(SRC, f), path.join(copy, f));
  fs.symlinkSync(path.join(SRC, "node_modules"), path.join(copy, "node_modules"));
  const M = JSON.parse(fs.readFileSync(path.join(here, "fixtures/forsaleMutants.json"), "utf8"));
  let survived = 0, killed = 0;
  for (const m of M) {
    if (process.env.FS_MUTANT && !new RegExp(process.env.FS_MUTANT).test(m.name)) continue;
    const saved = [];
    let missing = false;
    for (const e of m.edits) { const file = path.join(copy, e.file), orig = fs.readFileSync(file, "utf8"); if (!orig.includes(e.from)) { missing = true; break; } saved.push([file, orig]); fs.writeFileSync(file, orig.replace(e.from, e.to)); }
    if (missing) { for (const [f, o] of saved) fs.writeFileSync(f, o); console.log(`SKIP ${m.name}: text not found`); survived++; continue; }
    const r = spawnSync(process.execPath, [path.join(copy, "scripts/forSaleCheck.mjs"), copy], { encoding: "utf8", timeout: 400000, env: { ...process.env } });
    for (const [f, o] of saved.reverse()) fs.writeFileSync(f, o);
    const dead = r.status !== 0; if (dead) killed++; else survived++;
    console.log(`${dead ? "KILLED  " : "SURVIVED"} ${m.name}`);
  }
  console.log(`mutants: ${killed} of ${M.length} killed${survived ? `, ${survived} SURVIVED` : ""}`);
  fs.rmSync(tmp, { recursive: true, force: true });
  return survived ? 1 : 0;
}
