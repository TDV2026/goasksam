// THE FOR SALE TEST WORLD (Lane S, Nov 18 2026), lifted from Lane D's scripts/forSaleCheck.mjs (the imports to the `everyWrite` line, unchanged except the mutant switch and the exports): the same fake PostgREST, the vendor stand-in,
// the archive of 1987 Porsche 911s and 2009 BMW M3s and the model stand-in, so the page check reads the LIVE handlers' real answers (api/buySearch.js after the pull and the prepare job), never a sample.
// Importing this file boots the world: the pull runs once, the prepare job three times, the table is read-ready. It prints nothing.
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import { spawnSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const args = [], here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(args.find(a => !a.startsWith("--")) || path.join(here, ".."));
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
const DAY = 864e5, HOUR = 36e5, NOW = Date.now(), ago = h => new Date(NOW - h * HOUR).toISOString();

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
// the stand-in for the vendor: the recorded shape's fields, synthetic values; paged by cursor, filtered by the documented parameters
const SELLER = "ZZ-SELLER-MARKER", ZIP = "99999";
const DATASET = [];
let VID = 1000;
const vin = n => "WP0AB0916HS" + String(100000 + n).slice(-6);
function rec(source, over = {}) {
  const id = VID++, base = Object.fromEntries(SHAPE.fields.map(k => [k, null]));
  return Object.assign(base, { id, source, source_listing_id: "S" + id, url: `https://www.${source}.example/inventory/${id}`, title: "1987 Porsche 911 Carrera Coupe", sale_type: "dealer", status: "active", year: 1987, listing_make: "Porsche", listing_model: "911", ocd_make_name: "Porsche", ocd_model_name: "911",
    vin: vin(id), mileage: 40000 + (id % 9) * 1000, mileage_unit: "miles", transmission: "Manual", body_style: "Coupe", exterior_color: "Red", asking_price: 45000 + (id % 7) * 1000, currency: "USD", location: "Austin, TX", city: "Austin", state: "TX", zip: ZIP, country_code: "US",
    seller_name: SELLER, seller_type: "dealer", featured_image_url: `https://img.example/${id}.jpg`, last_seen_at: ago(1), last_observed_at: ago(1), last_checked_at: ago(1), updated_at: ago(1), first_seen_at: ago(48) }, over);
}
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
const pageOf = u => {
  const q = u.searchParams, p = Object.fromEntries(q);
  VENDOR_CALLS.push({ ...p, auth: undefined });
  let rows = DATASET.filter(r => (!p.source || r.source === p.source || (p.source === "streetside" && r.source === "mysterysource")) && (!p.status || p.status === "all" || r.status === p.status || (r.status === "sold" && p.status === "active" && p.source === "streetside")) && (!p.country_code || r.country_code === p.country_code || (r.country_code === "CA" && p.source === "streetside")));
  const limit = Math.min(100, Number(p.limit) || 50), off = p.cursor ? Number(Buffer.from(p.cursor, "base64").toString()) : 0, data = rows.slice(off, off + limit), more = off + limit < rows.length;
  return { data, meta: { pagination: "cursor", limit, has_more: more, next_cursor: more ? Buffer.from(String(off + limit)).toString("base64") : null } };
};
const applyFilter = (rows, u) => {   // a plain PostgREST over our table: the filters the engine and the jobs send
  let out = rows;
  for (const [k, v] of u.searchParams) {
    const m = /^(eq|neq|gte|lte|lt|gt|is|not\.is|in|ilike)\.(.*)$/.exec(v); if (!m || ["select", "order", "limit", "on_conflict", "or"].includes(k)) continue;
    const [, op, val] = m;
    out = out.filter(r => { const x = r[k]; if (op === "eq") return String(x) === val; if (op === "neq") return String(x) !== val; if (op === "lt") return String(x) < val; if (op === "gte") return String(x) >= val; if (op === "gt") return Number(x) > Number(val); if (op === "is") return val === "null" ? x == null : String(x) === val; if (op === "not.is") return val === "null" ? x != null : true; if (op === "ilike") return new RegExp("^" + val.split("*").map(t => t.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$", "i").test(String(x ?? "")); if (op === "in") return val.replace(/^\(|\)$/g, "").split(",").includes(String(x)); return true; });
  }
  const orp = u.searchParams.get("or");
  if (orp && /resolve_state\.is\.null/.test(orp)) out = out.filter(r => r.resolve_state == null || !r.car || r.car.engine_version !== (orp.match(/neq\.([^)]+)\)/) || [])[1]);
  return out;
};
globalThis.fetch = async (url, init) => {
  const s = String(url), u = new URL(s), p = u.pathname;
  if (/api\.anthropic\.com/.test(s)) return fakeModel(init);
  if (u.host === "api.oldcarsdata.com" && p === "/classifieds") { const hdr = init && init.headers || {}; if (!/Bearer /.test(String(hdr.Authorization || ""))) return new Response("{}", { status: 401 }); return new Response(JSON.stringify(pageOf(u)), { status: 200, headers: { "x-ratelimit-remaining": "90000", "x-ratelimit-limit": "100000" } }); }
  if (p.endsWith("/for_sale_listings")) {
    const method = (init && init.method) || "GET";
    if (method === "POST") { const rows = JSON.parse(init.body); DB_WRITES.push(...rows); for (const r of rows) { const i = TABLE.findIndex(x => x.source === r.source && x.source_listing_id === r.source_listing_id); if (i >= 0) Object.assign(TABLE[i], r); else TABLE.push({ id: TID++, first_seen: new Date().toISOString(), resolve_state: null, read: null, history: null, car: null, car_key: null, gone: false, ...r }); } return new Response("", { status: 201 }); }
    if (method === "PATCH") { const body = JSON.parse(init.body), hit = applyFilter(TABLE, u); if (!/id=eq\./.test(u.search)) for (const r of hit) Object.assign(r, body); else for (const r of hit) Object.assign(r, body); return new Response(JSON.stringify(hit), { status: 200 }); }
    if (method === "HEAD") { const hit = applyFilter(TABLE, u); return new Response("", { status: 200, headers: { "content-range": `0-0/${hit.length}` } }); }
    FSREADS.push(u.search); let hit = applyFilter(TABLE, u); const lim = Number(u.searchParams.get("limit")); if (lim) hit = hit.slice(0, lim);
    const rg = init && init.headers && (init.headers.Range || init.headers.range); if (rg) { const m = /(\d+)-(\d+)/.exec(rg); if (m) hit = hit.slice(Number(m[1]), Number(m[2]) + 1); }
    return new Response(JSON.stringify(hit), { status: 200 });
  }
  if (p.endsWith("/app_usage_events")) { if (init && init.method === "POST") { USAGE.push(init.body); return new Response("", { status: 201 }); } return new Response("[]", { status: 200 }); }
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

await call(PULL, "/api/pullForSale?mode=pull", { crew: false, headers: { "x-ops-key": PROBE } });
for (let i = 0; i < 3; i++) await call(PULL, "/api/pullForSale?mode=prepare&budgetMs=240000", { crew: false, headers: { "x-ops-key": PROBE } });
SERVE.forSaleReset();
export { call, find, json, chatDone, BUY, MC, SERVE, TABLE, CREW, CT, W, world, LOGS, ROOT, ago, vin, SP, pathToFileURL };
