// HOT-PATH LOG LINES PER REQUEST (Lane E, Nov 3 2026, lane-e-vercelcost). Vercel usage Oct 25 to Nov 3: 5.02M observability events ($5.25), the largest line on the bill. Every console.log / console.warn / console.error a function
// prints is one log event, and so is every request. CAUSE: the engine printed a "cache_decision" line (with the full spec key) for every cache it read, every time it read one (lib/live/search.js logCacheDecision: the in-memory
// range cache, the stored Market Check row, the question row, the spec memory, the stored spec row), and "stage_ms" for every engine read (lib/onebox.js), so ONE Find search of 24 cars printed a line per car per cache, and a
// Market Check read printed one per cache it walked. Neither line carries a decision or an error: both are diagnostics. WHO ELSE: every page that reads the engine through engineAnswer / oneEngineAnswer / prefetchSpecs (Find search,
// Show more, the card popup, Market Check, Tasks, the Sell block, the history pages, the nightly warms). FIX: diagnostics print only when DEBUG_LOG=1; errors and warnings that carry a decision stay.
// This check runs the REAL engine over a fake archive (no network), counts the console lines of each hot request, and fails when a path prints more than its agreed count. It also fails when a folder that is not runtime is deployable
// (.vercelignore): proofs/, docs/ (screens), smoke-artifacts/, test/, ops/, .github/, and scripts/ beyond the few files a function reads.
//   node scripts/logLinesCheck.mjs [--table]     --table prints the counts
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url"; import { spawnSync } from "node:child_process";
const root = path.resolve(path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
delete process.env.DEBUG_LOG;
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const realLog = console.log.bind(console);
let LIVE = [], SALES = [], STORE = new Map(), ARCHIVE_DOWN = false;
const likeRe = v => new RegExp("^" + String(v).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i");
globalThis.fetch = async (url, init) => {
  const u = new URL(String(url)), sp = u.searchParams;
  if (!/fake\.supabase/.test(u.hostname)) return new Response("", { status: 500 });
  if (/taxonomy|generations/.test(u.pathname)) return new Response("[]", { status: 200 });   // the resolver falls back to its curated lists, as it does with the tables unreachable
  if (u.pathname.endsWith("/app_config")) return new Response(JSON.stringify([{ value: "2026-11-01T00:00:00Z" }]), { status: 200 });   // the sales epoch row exists in production
  if (u.pathname.endsWith("/live_listings")) {
    const rg = String((init && init.headers && (init.headers.Range || init.headers.range)) || ""), off = Number((/^(\d+)-/.exec(rg) || [])[1] || sp.get("offset") || 0);
    const mk = sp.get("make") && likeRe(sp.get("make").replace(/^ilike\./, ""));
    return new Response(JSON.stringify(off > 0 ? [] : LIVE.filter(r => !mk || mk.test(r.make))), { status: 200 });
  }
  if (u.pathname.endsWith("/spec_market_cache")) {   // the stored rows (the card's market line and the stored whole Market Check answer)
    if ((init && init.method) === "POST") { for (const r of JSON.parse(init.body)) STORE.set(r.spec_key, { ...r, computed_at: r.computed_at || new Date().toISOString() }); return new Response("", { status: 201 }); }
    if ((init && init.method) === "DELETE") return new Response("", { status: 204 });
    const k = sp.get("spec_key") || "", keys = k.startsWith("in.(") ? [...k.slice(4, -1).matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(m => m[1].replace(/\\"/g, '"')) : [k.replace(/^eq\./, "")];
    return new Response(JSON.stringify(keys.map(x => STORE.get(x)).filter(Boolean)), { status: 200 });
  }
  if (u.pathname.endsWith("/sales_archive")) {
    if (ARCHIVE_DOWN && /raw_record|price/.test(sp.get("select") || "")) return new Response("", { status: 500 });   // the pool read fails; the resolver's name lookups still answer
    const sel = sp.get("select") || "", ys = sp.getAll("year"), ymin = Number((ys.find(v => v.startsWith("gte.")) || "gte.0").slice(4)), ymax = Number((ys.find(v => v.startsWith("lte.")) || "lte.9999").slice(4));
    const mk = sp.get("make") && likeRe(sp.get("make").replace(/^ilike\./, "")), md = sp.get("model") && likeRe(sp.get("model").replace(/^ilike\./, "")), ti = sp.get("listing_title") && likeRe(sp.get("listing_title").replace(/^ilike\./, ""));
    const keep = SALES.filter(r => r.year >= ymin && r.year <= ymax && (!mk || mk.test(r.make)) && (!md || md.test(r.model)) && (!ti || ti.test(r.listing_title)));
    const cols = sel.split(",").map(it => { const ci = it.indexOf(":"); const a = ci > 0 && it[ci + 1] !== ":" ? it.slice(0, ci) : null, ex = a ? it.slice(ci + 1) : it; return [a || (ex.startsWith("raw_record->>") ? ex.slice(13) : ex), ex]; });
    return new Response(JSON.stringify(keep.map(r => Object.fromEntries(cols.map(([a, ex]) => [a, ex.startsWith("raw_record->>") ? (r.raw_record[ex.slice(13)] ?? null) : (ex === "price" ? r.sale_price : ex === "auction_end_date" ? r.sale_date : r[ex] ?? null)])))), { status: 200 });
  }
  return new Response("[]", { status: 200 });
};
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.LAUNCH_STAGE = "2";
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };


const imp = (f, q) => import(pathToFileURL(path.join(root, f)).href + (q ? "?" + q : ""));
const soon = new Date(Date.now() + 6 * 864e5).toISOString();
let id = 0;
const sale = (make, year, title, price, model = "Capri") => ({ id: "S" + ++id, source_id: "s" + id, sale_price: price, sale_date: new Date(Date.now() - (30 + id) * 864e5).toISOString().slice(0, 10), platform: "Bring a Trailer", source_slug: "bringatrailer", make, model, year, listing_title: title, vin_norm: "V" + id, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: null, vehicle_type: "car", sale_price_usd: price, model_family: model,
  raw_record: { featured_image_url: "https://x/i.jpg", mileage: "60000", body_style: null, modifications: null, title, currency: "USD", transmission: null, exterior_color: null, title_status: null, url: "https://u/" + id, source_url: null, city: "Austin", state: "TX", country_code: "US" } });

const row = (n, o = {}) => ({ id: 9000 + n, source: "sothebysmotorsport", make: "Porsche", model: "911", year: 2016, listing_title: "2016 Porsche 911 GT3 RS", current_bid_usd: 76000, end_time: soon, country: "US", photo_url: "https://x/i.jpg", status: "live", mileage: 3000, exterior_color: "Purple", ...o });
// ---- count every console line a request prints
let LINES = [];
for (const k of ["log", "warn", "error", "info", "debug"]) console[k] = (...a) => { LINES.push([k, a.map(x => typeof x === "string" ? x : (() => { try { return JSON.stringify(x); } catch { return String(x); } })()).join(" ").slice(0, 160)]); };
const measure = async (name, fn) => { LINES = []; let err = null; try { await fn(); } catch (e) { err = e; } const lines = LINES; LINES = []; return { name, n: lines.length, lines, err }; };
const handler = async (file, body) => { const { default: h } = await imp(file); let out = null; const res = { setHeader() {}, getHeader() {}, status() { return res; }, json(b) { out = b; return res; }, send(b) { out = b; return res; }, end() { return res; }, writeHead() {} }; await h({ method: "POST", url: "/" + file.replace(/\.js$/, ""), query: {}, headers: { host: "goasksam.com", "user-agent": "Mozilla/5.0" }, body }, res); return out; };
// 24 live listings of 6 different cars, each with enough sales for a range
const CARS = [["Porsche", "911", "Carrera", 2005], ["Porsche", "Boxster", "S", 2003], ["BMW", "M3", "Coupe", 1995], ["Ford", "Mustang", "GT", 2006], ["Chevrolet", "Corvette", "Stingray", 1969], ["Mazda", "MX-5 Miata", "Club", 1999]];
let n = 0;
for (const [mk, md, tr, yr] of CARS) { for (let i = 0; i < 12; i++) SALES.push(sale(mk, yr, `${yr} ${mk} ${md} ${tr}`, 20000 + i * 1500, md)); for (let k = 0; k < 4; k++) LIVE.push(row(++n, { make: mk, model: md, year: yr, listing_title: `${yr} ${mk} ${md} ${tr}`, vin_norm: "VIN" + n })); }
for (let k = 0; k < 4; k++) LIVE.push(row(++n, { make: "Porsche", model: "911", year: 2005, listing_title: "2005 Porsche 911 Carrera", vin_norm: "VIN" + n }));
const FILTERS = { make: "Porsche" };
const R = [];
R.push(await measure("Find search (rerun, one batch of cards)", () => handler("api/buySearch.js", { action: "rerun", filters: FILTERS, turns: 0 })));
R.push(await measure("Find search again (warm: the stored rows and caches in hand)", () => handler("api/buySearch.js", { action: "rerun", filters: FILTERS, turns: 0 })));
R.push(await measure("Show more (the next batch)", () => handler("api/buySearch.js", { action: "more", filters: FILTERS, offset: 0 })));
R.push(await measure("Enrich (eight cards)", () => handler("api/buySearch.js", { action: "enrich", ids: LIVE.slice(0, 8).map(r => r.id) })));
{ const L = await imp("lib/live/search.js", "cold"); const car = LIVE[0]; const f = L.listingFacts(car);
  R.push(await measure("Card popup (panel)", () => L.panelOf(env, car, f)));
  STORE.clear();
  R.push(await measure("Market Check cold read (engine, empty store)", async () => { const { resolveVehicle } = await imp("lib/vehicle.js"); const rv = await resolveVehicle("2005 Porsche 911 Carrera", {}); const OE = await imp("lib/onebox.js"); const E = (await imp("lib/live/search.js", "cold2")); await E.engineAnswer(rv.vehicle, null, "2005 Porsche 911 Carrera", env, null); }));
  R.push(await measure("Market Check warm read (engine, stored row)", async () => { const { resolveVehicle } = await imp("lib/vehicle.js"); const rv = await resolveVehicle("2005 Porsche 911 Carrera", {}); const E = (await imp("lib/live/search.js", "cold2")); await E.engineAnswer(rv.vehicle, null, "2005 Porsche 911 Carrera", env, null); })); }
console.log = realLog;
for (const k of ["warn", "error", "info", "debug"]) console[k] = (...a) => realLog("[" + k + "]", ...a);
if (process.argv.includes("--table") || process.argv.includes("--lines")) for (const r of R) { realLog(`${String(r.n).padStart(4)}  ${r.name}${r.err ? "   (threw: " + String(r.err.message).slice(0, 60) + ")" : ""}`); if (process.argv.includes("--lines")) { const c = {}; for (const [k, l] of r.lines) { const key = k + " " + ((/"tag":"([a-z_]+)"/.exec(l) || [])[1] || l.slice(0, 50)); c[key] = (c[key] || 0) + 1; } realLog("      " + JSON.stringify(c)); } }

// 1. THE AGREED LINES PER REQUEST: a hot path prints at most 2 lines (one decision, one error); a diagnostic prints only with DEBUG_LOG=1
const BUDGET = 2;
for (const r of R) ok(r.n <= BUDGET && !r.err, `${r.name}: ${r.n} console lines per request (agreed: at most ${BUDGET})${r.err ? "; threw " + r.err.message : ""}${r.n > BUDGET ? "; " + JSON.stringify([...new Set(r.lines.map(x => (/"tag":"([a-z_]+)"/.exec(x[1]) || [])[1] || x[1].slice(0, 40)))]) : ""}`);
// the diagnostics are still there behind DEBUG_LOG=1
{ process.env.DEBUG_LOG = "1"; console.log = (...a) => { LINES.push(["log", a.join(" ").slice(0, 160)]); }; const L = await imp("lib/live/search.js", "dbg"); const car = LIVE[0], f = L.listingFacts(car);
  const d = await measure("popup with DEBUG_LOG=1", () => L.panelOf(env, car, f)); delete process.env.DEBUG_LOG; console.log = realLog;
  ok(d.n >= 1, `DEBUG_LOG=1 turns the diagnostics back on (${d.n} lines for one popup)`); }

// 2. THE CLASS: no new un-gated diagnostic line. Every console.log / warn / info / debug in api/ and lib/ outside the allow-list below must sit behind debugLogOn(); errors are not counted here (the lines per request above count them).
const ALLOWED = { "api/deskInbound.js": 1, "api/cspReport.js": 1, "api/feedback.js": 1, "api/sellerDecision.js": 1, "api/usageDashboard.js": 2, "lib/_email.js": 1, "lib/_epoch.js": 1, "lib/_houseComps.js": 1, "lib/_spendAlerts.js": 1, "lib/_vinDecodeStore.js": 1, "lib/newsletterSignup.js": 1, "lib/tasks/tasks.js": 3, "lib/vehicle.js": 1 };
// (each of these is a latched once-per-process line, an outcome of a rare action, a budget warning, a cron summary or a decision; none runs per Find or Market Check request)
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : /\.js$/.test(e.name) ? [path.join(d, e.name)] : []);
const found = {};
for (const f of [...walk("api"), ...walk("lib")]) { const t = fs.readFileSync(f, "utf8").split("\n"); t.forEach((l, i) => { if (/^\s*(\/\/|\*)/.test(l)) return; const m = l.match(/console\.(log|warn|info|debug)\b/g); if (!m) return; if (/debugLogOn|DEBUG_LOG/.test(l) || /debugLogOn|DEBUG_LOG/.test(t[i - 1] || "") || /debugLogOn/.test(t[i - 2] || "")) return; found[f] = (found[f] || 0) + m.length; }); }
for (const [f, c] of Object.entries(found)) ok(c <= (ALLOWED[f] || 0), `${f} has ${c} un-gated console.log/warn/info line(s), ${ALLOWED[f] || 0} agreed: a per-request diagnostic goes behind debugLogOn() (lib/_debugLog.js)`);

// 3. THE DEPLOYMENT: only runtime folders are uploaded. A folder is non-runtime until it is listed here as read by a function or served to a browser.
const RUNTIME_DIRS = new Set(["api", "lib", "public", "data"]), RUNTIME_FILES = new Set(["package.json", "package-lock.json", "vercel.json", ".vercelignore"]);
const g = spawnSync("git", ["ls-files", "-z"], { encoding: "utf8", maxBuffer: 1 << 28 }), tracked = g.stdout.split("\0").filter(f => f && fs.existsSync(f));
const gi = spawnSync("git", ["ls-files", "-c", "-i", "-z", "--exclude-from=.vercelignore"], { encoding: "utf8", maxBuffer: 1 << 28 }), ignored = new Set(gi.stdout.split("\0"));
const deployed = tracked.filter(f => !ignored.has(f));
const size = fs.readFileSync ? deployed.reduce((t, f) => t + fs.statSync(f).size, 0) : 0;
const SCRIPTS_READ = new Set(["scripts/warm-list.json", "scripts/warm-named.json", "scripts/crossProductCheck.js", "scripts/buildCanonical.js", "scripts/buildVinIndex.js", "scripts/buildSpecMarketCache.js"]);
const stray = deployed.filter(f => { const top = f.split("/")[0]; return f.includes("/") ? !(RUNTIME_DIRS.has(top) || (top === "scripts" && SCRIPTS_READ.has(f))) : !RUNTIME_FILES.has(f); });
const byTop = {}; for (const f of stray) { const t = f.split("/")[0]; byTop[t] = (byTop[t] || 0) + fs.statSync(f).size; }
ok(stray.length === 0, `no non-runtime file is deployable (${stray.length} are: ${Object.entries(byTop).map(([k, v]) => k + " " + (v / 1e6).toFixed(1) + " MB").join(", ")}; add the folder to .vercelignore)`);
for (const d of ["proofs", "docs", "smoke-artifacts", "test", "ops", ".github"]) ok(!deployed.some(f => f.startsWith(d + "/")), `${d}/ is in .vercelignore (nothing under it is uploaded)`);
if (process.argv.includes("--table")) realLog(`deployed upload: ${deployed.length} files, ${(size / 1e6).toFixed(2)} MB`);
console.log(`logLinesCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
