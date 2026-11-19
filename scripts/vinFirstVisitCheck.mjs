// A FIRST VISIT TO A VIN PAGE IS A STORED READ, NOT A LIVE ENGINE READ (Lane B, Nov 8 2026; Lane F's audit: cold VIN pages took 10.4, 22.2 and 32.2 s, 0.35 s once cached).
// WHERE THE TIME WENT (api/_historyData.js oneBoxFor, read from the code and timed on production): the VIN page's market block is the engine read WITH the car's own sale, which had no stored row, so every first visit computed the pool from the archive inside the request
// (40 s deadline): 3.4 to 5 s on the small families I timed, 10 to 32 s on the big ones. Not the VIN index (the identity comes from the nightly rollout row in one read) and not a missing family warm row (a hub's warm row only sped hubs up; the VIN page never read it).
// NOW: the VIN's own stored row; else the family's stored answer as a stand-in with the exact read finishing behind the response; else a 1.5 s wait and a "still reading" page that is not cached while the read finishes behind it. CLASS: every first-visit shape has a time bound,
// measured with the archive made slow (every archive read 3 s), so any step that waits for the engine fails here.
//   node scripts/vinFirstVisitCheck.mjs [root]      --mutants proves each rule by breaking it in a copy
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
if (process.argv.includes("--mutants")) {
  const { spawnSync } = await import("node:child_process"), fsm = await import("node:fs"), osm = await import("node:os");
  const R = path.resolve(process.argv.find((x, i) => i > 1 && !x.startsWith("--")) || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
  const muts = [
    ["api/_historyData.js", "if (own && own.raw && own.raw.tier) {", "if (false) {", "the VIN's own stored row is not read"],
    ["api/_historyData.js", "if (fam && fam.raw && fam.raw.tier === \"result\"", "if (false && fam && fam.raw && fam.raw.tier === \"result\"", "the family's stored answer is not used as the stand-in"],
    ["api/_historyData.js", "new Promise(r => setTimeout(() => r(\"late\"), VIN_FIRST_READ_MS))", "new Promise(r => setTimeout(() => r(\"late\"), 40000))", "a first visit with nothing stored waits for the whole read (40 s)"],
    ["api/_historyData.js", "if (own.stale) behind(); return own.raw;", "return own.raw;", "a stale VIN row is served and never refreshed"],
    ["api/history.js", "vinCold.timedOut || vinCold.standIn ? { \"Cache-Control\": \"private, no-store\" } : {}", "{}", "a page without its own market block is cached"]
  ];
  let survivors = 0;
  for (const [file, from, to, want] of muts) {
    const dir = fsm.mkdtempSync(path.join(osm.tmpdir(), "vinfirst-"));
    spawnSync("rsync", ["-a", "--exclude", ".git", "--exclude", "node_modules", "--exclude", "proofs", R + "/", dir + "/"]);
    fsm.symlinkSync(path.join(R, "node_modules"), path.join(dir, "node_modules"));
    const fp = path.join(dir, file), src = fsm.readFileSync(fp, "utf8"), m = src.replace(from, to);
    if (m === src) { console.log(`MUTANT NOT APPLIED  ${want}`); survivors++; fsm.rmSync(dir, { recursive: true, force: true }); continue; }
    fsm.writeFileSync(fp, m);
    const r = spawnSync(process.execPath, [path.join(dir, "scripts/vinFirstVisitCheck.mjs"), dir], { encoding: "utf8", timeout: 240000 });
    const killed = r.status !== 0 && /^FAIL/m.test((r.stdout || "") + (r.stderr || ""));
    console.log(`${killed ? "killed  " : "SURVIVED"}  ${want}`); if (!killed) survivors++;
    fsm.rmSync(dir, { recursive: true, force: true });
  }
  console.log(survivors ? `\n${survivors} mutant(s) survived` : "\nall mutants killed"); process.exit(survivors ? 1 : 0);
}
const ROOT = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.env.LAUNCH_STAGE = "2"; process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
const fs = await import("node:fs");
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const ev = (row, it) => { const ci = it.indexOf(":"); const alias = ci > 0 && it[ci + 1] !== ":" ? it.slice(0, ci) : null; const expr = alias ? it.slice(ci + 1) : it; if (expr.startsWith("raw_record->>")) { const k = expr.slice(13); const v = row.raw_record[k]; return [alias || k, v == null ? null : String(v)]; } return [alias || expr, row[expr] === undefined ? null : row[expr]]; };
const likeRe = v => new RegExp("^" + String(v).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i");
const day = i => new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
const rows = []; let n = 0;
const sale = (make, model, year, body, price, ago) => { n++; const title = `${year} ${make} ${model} ${body}`; rows.push({ id: "00000000-0000-4000-8000-" + String(n).padStart(12, "0"), source_id: "pb" + n, sale_price: price, sale_date: day(ago), platform: "Bring a Trailer", source_slug: "bringatrailer", make, model, year, listing_title: title, vin_norm: "V" + n, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: null, vehicle_type: "car", sale_price_usd: price,
  raw_record: { featured_image_url: "https://x/i.jpg", mileage: String(30000 + n * 300), body_style: body, modifications: null, title, currency: "USD", transmission: null, exterior_color: null, title_status: null, url: "https://u/" + n, source_url: null, city: "Austin", state: "TX", country_code: "US", auction_end_precision: null } }); };
const CARS = [["Duesenberg", "Model J", [[1930, "Roadster", 1400000, 3], [1931, "Phaeton", 1500000, 3], [1932, "Sedan", 600000, 3], [1933, "Coupe", 900000, 3]]], ["Auburn", "851", [[1935, "Speedster", 380000, 5], [1935, "Roadster", 120000, 2], [1936, "Convertible", 140000, 4], [1936, "Sedan", 60000, 3]]]];
for (const [mk, md, list] of CARS) { let i = 0; for (const [yr, body, base, cnt] of list) for (let k = 0; k < cnt; k++) sale(mk, md, yr, body, base + (k % 4) * 900, 20 + ((i++) % 12) * 9); }
let SLOW = 0, archiveReads = 0, EPOCH = null; const STORE = new Map();
globalThis.fetch = async (url, opt) => {
  const u = new URL(String(url));
  if (u.pathname.endsWith("/spec_market_cache")) {
    const m = (opt && opt.method) || "GET";
    if (m === "POST") { for (const r of JSON.parse(opt.body)) STORE.set(r.spec_key, r); return new Response("", { status: 201 }); }
    if (m === "DELETE") { STORE.delete((u.searchParams.get("spec_key") || "").replace(/^eq\./, "")); return new Response("", { status: 204 }); }
    const k = (u.searchParams.get("spec_key") || "").replace(/^eq\./, ""); return new Response(JSON.stringify(STORE.has(k) ? [{ spec_key: k, market: STORE.get(k).market, computed_at: STORE.get(k).computed_at }] : []), { status: 200 });
  }
  if (u.pathname.endsWith("/app_config")) return new Response(JSON.stringify(EPOCH ? [{ value: EPOCH }] : []), { status: 200 });
  if (u.pathname.endsWith("/sales_archive")) {
    archiveReads++; if (SLOW) await new Promise(r => setTimeout(r, SLOW));
    const sp = u.searchParams, sel = sp.get("select"), sd = sp.getAll("sale_date");
    const ge = sd.filter(v => v.startsWith("gte.")).map(v => v.slice(4)), lt = sd.filter(v => v.startsWith("lt.")).map(v => v.slice(3));
    const ys = sp.getAll("year"), ymin = Number((ys.find(v => v.startsWith("gte.")) || "gte.0").slice(4)), ymax = Number((ys.find(v => v.startsWith("lte.")) || "lte.9999").slice(4));
    const mk = sp.get("make") && likeRe(sp.get("make").replace(/^ilike\./, "")), md = sp.get("model") && likeRe(sp.get("model").replace(/^ilike\./, "")), ti = sp.get("listing_title") && likeRe(sp.get("listing_title").replace(/^ilike\./, ""));
    const keep = rows.filter(r => (!ge.length || r.sale_date >= ge[0]) && (!lt.length || r.sale_date < lt[0]) && r.year >= ymin && r.year <= ymax && (!mk || mk.test(r.make)) && (!md || md.test(r.model)) && (!ti || ti.test(r.listing_title)));
    return new Response(JSON.stringify(keep.map(r => Object.fromEntries(sel.split(",").map(it => ev(r, it))))), { status: 200 });
  }
  return new Response("[]", { status: 200 });
};
const H = await import(pathToFileURL(path.join(ROOT, "api/_historyData.js")).href), S = await import(pathToFileURL(path.join(ROOT, "lib/live/search.js")).href), G = await import(pathToFileURL(path.join(ROOT, "lib/generations.js")).href), E = await import(pathToFileURL(path.join(ROOT, "lib/onebox.js")).href);
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
const idOf = (make, model, year) => ({ year, make, model, family: model, trim: null, vehicle: { make, model, trim: null, year }, bodyStyle: null });
const DUES = idOf("Duesenberg", "Model J", 1931), AUB = idOf("Auburn", "851", 1935), exactSale = { price: 1500000, mileage: 31000, soldDate: day(40) };
const poll = async (key, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (STORE.has(key)) return true; await new Promise(r => setTimeout(r, 100)); } return false; };
if (typeof H.vinRowKey !== "function" || typeof H.warmVinRow !== "function") ok("api/_historyData.js exports vinRowKey and warmVinRow", false);
else {
  // 1. the VIN's own stored row: served at once, no archive read
  SLOW = 0; const w1 = await H.warmVinRow(env, DUES, exactSale, "VINOWN1");
  ok("ops warmVin stores the VIN's row (the exact read, the car's own sale in it)", w1.state === "stored" && STORE.has(H.vinRowKey("VINOWN1")), JSON.stringify(w1));
  ok("a second warmVin finds the row fresh and reads nothing", (await H.warmVinRow(env, DUES, exactSale, "VINOWN1")).state === "fresh");
  SLOW = 3000; archiveReads = 0; let cold = {}, t = Date.now();
  let d = await H.oneBoxFor(env, DUES, exactSale, { vin: "VINOWN1", cold });
  ok(`a car with its own stored row: the first visit is served in ${Date.now() - t} ms (bound 400) with ${archiveReads} archive reads while the archive takes 3 s a read`, !!d && d.tier && Date.now() - t < 400 && archiveReads === 0 && cold.source === "vin_row", JSON.stringify(cold));
  // 2. no row of its own, the family's stored answer exists: the stand-in, the exact read behind
  SLOW = 0; const famKey = S.warmAnswerKeyFor(DUES.vehicle, await G.findGeneration(DUES.vehicle, env), null);
  const famRaw = (await E.oneEngineAnswer({ ...DUES.vehicle, year: null }, null, "Duesenberg Model J", { ...env, asked: 0 }, null)).raw;
  await S.writeWarmAnswer(env, famKey, famRaw);
  ok("the family's stored answer is a ranged result the page can print", !!(await S.readWarmAnswerDetailed(env, famKey)).raw, famRaw && famRaw.tier);
  SLOW = 3000; cold = {}; t = Date.now();
  d = await H.oneBoxFor(env, DUES, exactSale, { vin: "VINFAM2", cold });
  const t2 = Date.now() - t;
  ok(`no row of its own, the family's stored answer exists: the first visit is served in ${t2} ms (bound 600) as the stand-in`, !!d && d.tier === "result" && t2 < 600 && cold.standIn === true && cold.source === "family_row", JSON.stringify(cold));
  SLOW = 0;
  ok("and the exact read finishes behind the response and stores the VIN's row for the next visit", await poll(H.vinRowKey("VINFAM2"), 20000));
  // 3. nothing stored at all: 1.5 s, a "still reading" answer, the read finishes behind
  SLOW = 3000; cold = {}; t = Date.now();
  d = await H.oneBoxFor(env, AUB, { price: 380000, mileage: 20000, soldDate: day(30) }, { vin: "VINNONE3", cold });
  const t3 = Date.now() - t;
  ok(`nothing stored: the first visit answers in ${t3} ms (bound 2000), not the whole read, and says it is still reading`, d == null && cold.timedOut === true && t3 < 2000, JSON.stringify({ t3, cold }));
  SLOW = 0;
  ok("the read finishes behind the response and stores the row (the second visit is a stored read)", await poll(H.vinRowKey("VINNONE3"), 30000));
  // 3b. a stored row from before the ingest's epoch bump is served at once and refreshed behind the response
  EPOCH = "2026-11-08T14:00:00.000Z"; await new Promise(r => setTimeout(r, 5200));   // the instance's epoch poll (5 s) sees the bump
  SLOW = 3000; cold = {}; t = Date.now();
  d = await H.oneBoxFor(env, DUES, exactSale, { vin: "VINOWN1", cold });
  ok(`a VIN row from before the epoch bump is served in ${Date.now() - t} ms (bound 400), not recomputed in the request`, !!d && Date.now() - t < 400 && cold.source === "vin_row");
  SLOW = 0; { const t0 = Date.now(); let fresh = false; while (Date.now() - t0 < 20000 && !fresh) { fresh = STORE.get(H.vinRowKey("VINOWN1")).market.warmEpoch === EPOCH; if (!fresh) await new Promise(r => setTimeout(r, 100)); } ok("and the refresh behind the response stamps the row with the new epoch", fresh); }
  // 4. the page is not cached when it went out without its own block; the warm task and the page use the same functions
  const hs = fs.readFileSync(path.join(ROOT, "api/history.js"), "utf8"), ud = fs.readFileSync(path.join(ROOT, "api/usageDashboard.js"), "utf8");
  ok("a page that went out without its market block, or with the family's stand-in, is sent not cached", /vinCold\.timedOut \|\| vinCold\.standIn \? \{ "Cache-Control": "private, no-store" \} : \{\}/.test(hs));
  ok("the car page asks oneBoxFor with its VIN (the stored-row path), and ops task=warmVin stores through the same warmVinRow", /oneBoxFor\(env, id, exactSale, \{ vin: vinNorm, cold: vinCold \}\)/.test(hs) && /if \(task === "warmVin"\)/.test(ud) && /warmVinPage/.test(ud));
}
console.log(failed ? `\nvinFirstVisitCheck: ${failed} FAIL` : "\nvinFirstVisitCheck: PASS"); process.exit(failed ? 1 : 0);
