// clock: real-ok the crew cookie is signed against the real clock; every example read is given its own fixed clock (d.now)
// PUBLIC EXAMPLES CHECK (Lane B, Nov 10 2026). THE CLASS: an entry page example is a STORED daily pick. A public request (PUBLIC_EXAMPLES=1, no crew cookie) may only READ that stored pick: it never builds, never calls the engine or OldCarsData,
// never writes; a missing or stale pick is null (the section hides); flag off (the default) is null for the public; each example keeps its own kill switch; the build lives on the cron (lib/live/publicExamples.js) and the crew rebuild task.
// The nine readers (api/publicExamples.js READERS): find, findSales, featured, mcCard, mcResult, mcSales, sellCard, sellCars, tasksEmail. No database, no network: a fake store, and a counter on every engine, builder and vendor door.
//   node scripts/publicExamplesCheck.mjs [root]      --mutants proves each rule by breaking it in a copy
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { fileURLToPath, pathToFileURL } from "node:url"; import { spawnSync } from "node:child_process";
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), rootArg = args.find(a => !a.startsWith("--")), root = path.resolve(rootArg || path.join(here, ".."));
if (args.includes("--mutants")) {
  const DA = "lib/live/entryExamples.js", FE = "lib/live/findExamples.js", TD = "lib/live/tasksDemo.js", MC = "lib/live/marketCheckExamples.js", PA = "lib/live/publicAccess.js", FH = "lib/live/featuredHistory.js", API = "api/publicExamples.js";
  const muts = [
    [DA, "if (isPublicRead(req)) { const ps", "if (false) { const ps", "(3) a public request builds the pick when none is stored"],
    [DA, "pst.data.pickDate === ptDateKey(d.now()) ? pst.data : null", "pst.data ? pst.data : null", "(4) a public request is served yesterday's pick"],
    [DA, "const ps = await readStore(env, d, key), pst = ps.value; return", "const ps = await readStore(env, d, key), pst = ps.value; await d.write(env, { key, value: pst }); return", "(3) a public request writes"],
    [DA, "if (process.env[off] === \"0\" || also.some(k => process.env[k] === \"0\") || !mayRead(req)) return null;", "if (!mayRead(req)) return null;", "(5) the kill switch is ignored"],
    [PA, "export const publicExamplesOn = () => process.env.PUBLIC_EXAMPLES === \"1\";", "export const publicExamplesOn = () => process.env.PUBLIC_EXAMPLES !== \"0\";", "(1) the flag is on by default"],
    [PA, "export const mayRead = req => isCrewRequest(req) || publicExamplesOn();", "export const mayRead = req => isCrewRequest(req);", "(2) the flag does not open the public read"],
    [PA, "export const isPublicRead = req => publicExamplesOn() && !isCrewRequest(req);", "export const isPublicRead = req => false;", "(3) a public request is treated as a crew one and builds"],
    [FE, "if (isPublicRead(reqOrCookie)) { if (!fresh(st)) return null; }\n  else if (!fresh(st))", "if (!fresh(st))", "(3) the Find sales are built on a public request"],
    [TD, "if (isPublicRead(reqOrCookie)) {\n    const rows = await d.select", "if (false) {\n    const rows = await d.select", "(3) the Tasks email example is built on a public request"],
    [TD, "v.pickDate === pacificDay(d.now()) && v.data && typeof v.data === \"object\" ? v.data : null;", "v.data && typeof v.data === \"object\" ? v.data : null;", "(4) a stale Tasks email example is served"],
    [MC, "if (isPublicRead(req)) return data;", "", "(3) a public request checks photos and rebuilds"],
    [FH, "!mayRead(reqOrCookie)) return null;", "!isCrewRequest(reqOrCookie)) return null;", "(2) the flag does not open the featured history"],
    [FE, "if (process.env.FIND_EXAMPLES === \"0\" || !mayRead(reqOrCookie)) return null;   // crew, or PUBLIC_EXAMPLES=1: the stored pick and keyed reads only, never a build", "if (!mayRead(reqOrCookie)) return null;", "(5) the Find kill switch is ignored"],
    [API, "import { findExamples } from \"../lib/live/findExamples.js\";", "import { findExamples } from \"../lib/live/findExamples.js\";\nimport { refreshEntryExamples } from \"../lib/live/publicExamples.js\";", "(6) the public endpoint imports the build side"]
  ];
  let survivors = 0;
  for (const [file, from, to, want] of muts) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pex-"));
    spawnSync("rsync", ["-a", "--exclude", ".git", "--exclude", "node_modules", "--exclude", "proofs", root + "/", dir + "/"]); fs.symlinkSync(path.join(root, "node_modules"), path.join(dir, "node_modules"));
    const fp = path.join(dir, file), src = fs.readFileSync(fp, "utf8"), m = src.replace(from, to);
    if (m === src) { console.log("MUTANT NOT APPLIED  " + want); survivors++; fs.rmSync(dir, { recursive: true, force: true }); continue; }
    fs.writeFileSync(fp, m);
    const r = spawnSync(process.execPath, [path.join(dir, "scripts/publicExamplesCheck.mjs"), dir], { encoding: "utf8" }), killed = r.status !== 0;
    console.log((killed ? "killed  " : "SURVIVED") + "  " + want); if (!killed) survivors++;
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(survivors ? `\n${survivors} mutant(s) survived` : "\nall mutants killed"); process.exit(survivors ? 1 : 0);
}
process.chdir(root);
process.env.CURTAIN_CREW_CODE = "pubex-check-secret"; process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
for (const k of ["PUBLIC_EXAMPLES", "FIND_EXAMPLES", "TASKS_DEMO", "FEATURED_HISTORY", "CREW_MC_EXAMPLES", "MC_EXAMPLE_SALES", "CREW_SELL_EXAMPLE", "SELL_EXAMPLE_FIELD"]) delete process.env[k];
let vendor = 0; globalThis.fetch = async u => { if (!/fake\.supabase\.test/.test(String(u))) vendor++; return new Response("[]", { status: 200 }); };   // anything that is not the (fake) database: OldCarsData, a vendor, a photo host
let failed = 0, n = 0; const ok = (name, c, d) => { n++; if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${d ? "  " + d : ""}`); };
const imp = f => import(pathToFileURL(path.join(root, f)).href);
const FE = await imp("lib/live/findExamples.js"), FH = await imp("lib/live/featuredHistory.js"), TD = await imp("lib/live/tasksDemo.js"), MCX = await imp("lib/live/marketCheckExamples.js"), PX = await imp("lib/live/publicExamples.js"), EE = await imp("lib/live/entryExamples.js"), C = await imp("lib/_crew.js"), S = await imp("lib/live/search.js");
const API = await imp("api/publicExamples.js");
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
const CREW = "gas_crew=" + C.mintCrewCookieValue(), FORGED = "gas_crew=v1.9999999999.forged", PUBLIC = "";
const NOW = Date.parse("2026-11-10T20:00:00Z"), HOUR = 3600e3, DAY = 24 * HOUR, TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(NOW)), YESTERDAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(NOW - DAY));
const NAMES = Object.keys(API.READERS);
ok("the public endpoint serves the nine examples and nothing else", JSON.stringify(NAMES) === JSON.stringify(["find", "findSales", "featured", "mcCard", "mcResult", "mcSales", "sellCard", "sellCars", "tasksEmail"]), NAMES.join(","));

// ---- the world: a fake store, live rows, and a counter on every door that builds or spends
let id = 0;
const car = (make, model, year, o = {}) => ({ id: ++id, source: o.source || "bringatrailer", url: "https://auction.test/lot/" + id, photo_url: "https://img.test/p" + id + ".jpg", listing_title: `${year} ${make} ${model}`, year, make, model, vin_norm: o.vin || "VIN" + String(id).padStart(14, "0"), mileage: 20000, mileage_unit: "miles", current_bid: 60000, current_bid_usd: 60000, currency: "USD", country: "US", location: "Austin, TX", transmission: "Manual", exterior_color: "Red", body: null, status: "live", end_time: new Date(NOW + (o.h ?? 30 + id) * HOUR).toISOString(), description: "" });
const sale = (vin, o = {}) => ({ kind: "sale", date: "2022-05-14", house: "Bring a Trailer", url: "https://bringatrailer.com/listing/" + vin + "/", image: "https://img.test/old-" + vin + ".jpg", mileage: 15000, priceUsd: 46000, vinNorm: vin, year: 2008, make: "Porsche", model: "911", ...o });
const mk = () => {
  const w = { store: new Map(), rows: [], apps: {}, clock: NOW, selects: 0, writes: 0, builds: 0, engine: 0, head: 0, headOk: true };
  w.reset = () => { w.selects = 0; w.writes = 0; w.builds = 0; w.engine = 0; w.head = 0; vendor = 0; };
  w.d = { now: () => w.clock, head: async () => { w.head++; return w.headOk ? { status: 200, bytes: 1000, type: "image/jpeg" } : { status: 404, bytes: 0, type: "" }; },
    appearances: async (e, vin) => ({ ok: true, vinNorm: vin, appearances: w.apps[vin] || [] }), urlStatus: async () => 200, facts: async r => S.listingFacts(r),
    answer: async () => { w.engine++; w.builds++; return null; }, sellBlock: async () => { w.engine++; w.builds++; return null; }, places: async () => { w.engine++; w.builds++; return null; },
    enrich: async (e, o) => { w.engine++; return { title: FE.titleOf(o.r), end_time: o.r.end_time, url: o.r.url }; }, blocks: async () => { w.engine++; w.builds++; return []; },
    select: async (e, q) => { w.selects++; let m = /^app_config\?key=eq\.([a-z_]+)/.exec(q); if (m) { const v = w.store.get(m[1]); return v ? [{ value: v }] : []; }
      m = /^live_listings\?id=eq\.([^&]+)/.exec(q); if (m) return w.rows.filter(r => String(r.id) === decodeURIComponent(m[1])).slice(0, 1);
      if (/^live_listings\?status=eq\.live/.test(q)) return w.rows.filter(r => r.status === "live" && r.photo_url && Date.parse(r.end_time) > w.clock);
      if (/^task_updates/.test(q)) { w.builds++; return w.updates || []; }
      if (/^tasks\?id=/.test(q)) { w.builds++; return w.taskRow ? [w.taskRow] : []; }
      if (/^vin_index\?|^sales_archive\?/.test(q)) { const m2 = /in\.\((.*)\)&/.exec(q); if (m2) return decodeURIComponent(m2[1]).replace(/"/g, "").split(",").filter(v => w.apps[v]).map(v => ({ vin_norm: v })); return []; }
      return []; },
    cardName: async (e, row) => ({ name: [row.year, row.make, row.model, "Carrera S"].join(" "), trim: "Carrera S" }),
    write: async (e, row) => { w.writes++; w.store.set(row.key, row.value); }, clear: async (e, key) => { w.store.delete(key); } };
  return w;
};
const vS = "VINSOLD0000000001";
const W = mk(); W.rows = [car("Porsche", "911", 2008, { vin: vS }), car("BMW", "M3", 2006), car("Ferrari", "F430", 2007)]; W.apps = { [vS]: [sale(vS)] };
W.updates = [{ id: 7, task_id: 3, created_at: "2026-11-05T10:00:00Z", data: { cards: [{ id: W.rows[1].id, title: "1995 BMW M3 Coupe", house: "Bring a Trailer", miles: 147000, location: "West New York NJ" }] } }]; W.taskRow = { filters: { make: "BMW", year_min: 1995 }, summary: "Sam is looking for BMWs from 1995." };
W.d.blocks = async () => [{ cardHtml: "<p>card</p>", cardText: "card", bid: 1000 }];
// the stored picks, made the way the cron makes them (find, featured) and hand-written for the daily ones (the shapes the readers' own guards accept)
await FE.refreshFindExamples(env, W.d); const fhr = await FH.refreshFeaturedHistory(env, W.d); await TD.refreshTasksEmailExample(env, W.d);
const h = u => u, https = k => "https://img.test/" + k + ".jpg";
const mcSalesData = { pickDate: TODAY, model: "2001 BMW M3", poolN: 30, line: "Three of the 30 of this model sold for $20,000 to $30,000.", sales: [1, 2, 3].map(i => ({ title: "2001 BMW M3 " + i, priceLabel: "$2" + i + ",000", milesLabel: "30,000 miles", platform: "Bring a Trailer", dateLine: "Sold October 2026", photo: https("m" + i), url: "https://auction.test/m" + i, price: 20000 + i })) };
const mcResultData = { ...mcSalesData, result: { tier: "result", cards: mcSalesData.sales.map(s => ({ url: s.url })), cluster: [20000, 30000] } };
const mcCardData = { pickDate: TODAY, model: "2001 BMW M3", titleLine: "2001 BMW M3", photo: https("c1"), range: { low: 20000, high: 30000 }, rangeLine: "x", countLine: "30 sales", periodLine: "in the last 12 months", recentSale: { price: 25000, priceLine: "Sold for $25,000", platform: "Bring a Trailer", milesLine: "30,000 miles", metaLine: "x", url: "https://auction.test/r1", photo: https("c2") }, resultUrl: "/market-check?q=2001%20BMW%20M3" };
const sellCardData = { pickDate: TODAY, model: "1995 Mazda Miata", titleLine: "1995 Mazda Miata", photo: https("s1"), platformPick: { name: "Bring a Trailer", sentence: "11 of 14 relevant completed online sales were on Bring a Trailer.", mark: "BaT" }, reserve: { headline: "Reserve?", sentence: "x" }, resultUrl: "/sell?car=1995%20Mazda%20Miata" };
const sellCarsData = { pickDate: TODAY, note: "These are sales that happened, not a promise of a price.", cars: [{ title: "1995 Mazda Miata", line: "14 sales: x", url: "/sell?car=a" }, { title: "2001 BMW M3", line: "12 sales: y", url: "/sell?car=b" }] };
const emailData = { source: "preferred", update: { id: 1, at: "2026-11-05T10:00:00.000Z" }, subject: "A match", why: "Matches your Task: a BMW from 1995.", task: { summary: "Sam is looking for BMWs from 1995.", filters: { make: "BMW" } }, block: { cardHtml: "<p>x</p>", cardText: "x" } };
const store = (pickDate = TODAY) => {
  const a = { ...mcSalesData, pickDate }, c = { ...mcCardData, pickDate }, s = { ...sellCardData, pickDate }, k = { ...sellCarsData, pickDate }, r = { ...mcResultData, pickDate };
  W.store.set(MCX.MC_STORE, { v: EE.STORE_V, data: r, builtAt: "x" }); W.store.set(MCX.MC_CARD_KEY, { v: EE.STORE_V, data: c, builtAt: "x" }); W.store.set(MCX.SELL_CARD_KEY, { v: EE.STORE_V, data: s, builtAt: "x" }); W.store.set(MCX.SELL_STORE, { v: EE.STORE_V, data: k, builtAt: "x" });
};
store();
W.store.set(FE.FALLBACK_KEY, { v: FE.FALLBACK_V, builtAt: new Date(NOW).toISOString(), items: [1, 2, 3].map(i => ({ title: "199" + i + " Porsche 911 Carrera", platform: ["Bring a Trailer", "Cars & Bids", "PCarMarket"][i - 1], url: "https://auction.test/s" + i, photo: "https://img.test/s" + i + ".jpg", priceLabel: "Sold for $10" + i + ",000", dateLine: "Sold October 2026", live: false, fallback: true, soldAt: "2026-10-1" + i, findUrl: "/find" })) });
const READ = {
  find: (req, d = W.d) => FE.findExamples(env, req, d), findSales: (req, d = W.d) => FE.findExamplesFallback(env, req, d), featured: (req, d = W.d) => FH.readFeaturedHistory(env, req, d),
  mcCard: (req, d = W.d) => MCX.marketCheckExample(env, req, d), mcResult: (req, d = W.d) => MCX.marketCheckExampleResult(env, req, d), mcSales: (req, d = W.d) => MCX.marketCheckExampleSales(env, req, d),
  sellCard: (req, d = W.d) => MCX.sellExampleCard(env, req, d), sellCars: (req, d = W.d) => MCX.sellExample(env, req, d), tasksEmail: (req, d = W.d) => TD.tasksEmailExample(env, req, d)
};
ok("the world holds a pick for every example (the crew reads all nine)", (await Promise.all(NAMES.map(k => READ[k](CREW)))).every(x => x !== null), JSON.stringify(await Promise.all(NAMES.map(async k => [k, (await READ[k](CREW)) !== null]))));

// ---- (1) flag off: the public gets null, and nothing is read
for (const v of [undefined, "0", "", "true", "yes", "on"]) {
  if (v === undefined) delete process.env.PUBLIC_EXAMPLES; else process.env.PUBLIC_EXAMPLES = v;
  W.reset(); const got = await Promise.all(NAMES.map(k => READ[k](PUBLIC)));
  ok(`(1) PUBLIC_EXAMPLES ${v === undefined ? "unset" : JSON.stringify(v)}: all nine are null for the public, with no store read, no build, no engine and no vendor call`, got.every(x => x === null) && W.selects === 0 && W.builds === 0 && W.engine === 0 && vendor === 0 && W.writes === 0, JSON.stringify(got.map(x => x !== null)) + " selects " + W.selects);
  ok(`(1) PUBLIC_EXAMPLES ${v === undefined ? "unset" : JSON.stringify(v)}: a forged crew cookie is the public`, (await Promise.all(NAMES.map(k => READ[k](FORGED)))).every(x => x === null));
}
// ---- (2) flag on: the public gets the stored pick, byte equal to the crew read
process.env.PUBLIC_EXAMPLES = "1";
{ const rows = [];
  for (const k of NAMES) { W.reset(); const pub = await READ[k](PUBLIC), selects = W.selects, writes = W.writes, builds = W.builds, engine = W.engine, ven = vendor, crew = await READ[k](CREW);
    ok(`(2) ${k}: flag on, the public gets the stored pick, byte equal to the crew read`, pub !== null && JSON.stringify(pub) === JSON.stringify(crew), pub === null ? "null" : "");
    ok(`(2) ${k}: the public read writes nothing, builds nothing, calls no engine and no vendor`, writes === 0 && builds === 0 && engine === 0 && ven === 0, `writes ${writes} builds ${builds} engine ${engine} vendor ${ven}`);
    rows.push(`${k} ${selects}`); }
  console.log("INFO  store/database reads per public read of each example (flag on, pick stored): " + rows.join(", ")); }
ok("(2) a forged crew cookie with the flag on is a public read, the same pick", JSON.stringify(await READ.mcCard(FORGED)) === JSON.stringify(await READ.mcCard(CREW)));
// ---- (3) no stored pick: the public makes zero engine, zero builder and zero vendor calls, and writes nothing; the crew read of the same state DOES build (so the zero is not a dead counter)
{ const E = mk(); E.rows = W.rows; E.apps = W.apps; E.reset();
  const got = await Promise.all(["mcCard", "mcResult", "mcSales", "sellCard", "sellCars", "tasksEmail"].map(k => READ[k](PUBLIC, E.d)));
  ok("(3) the daily examples with nothing stored: all null for the public", got.every(x => x === null), JSON.stringify(got.map(x => x !== null)));
  ok("(3) and the public made zero engine, zero builder, zero vendor calls and zero writes", E.engine === 0 && E.builds === 0 && vendor === 0 && E.writes === 0 && E.head === 0, `engine ${E.engine} builds ${E.builds} vendor ${vendor} writes ${E.writes} head ${E.head}`);
  ok("(3) find and featured with nothing stored are null for the public, with no write and no engine card", (await READ.find(PUBLIC, E.d)) === null && (await READ.featured(PUBLIC, E.d)) === null && E.writes === 0 && E.engine === 0);
  E.reset(); await READ.mcCard(CREW, E.d); ok("(3) the counter is live: the CREW read of the same empty state does call the builder", E.engine > 0 || E.builds > 0, `engine ${E.engine} builds ${E.builds}`);
  E.reset(); await READ.tasksEmail(CREW, E.d); ok("(3) the counter is live for the Tasks email example too: the crew read reads the updates", E.builds > 0);
  const F = mk(); F.reset(); const fb = await FE.findExamplesFallback(env, PUBLIC, F.d);
  ok("(3) Find's fallback sales with nothing stored: null for the public, no archive read, no write", fb === null && F.writes === 0 && F.selects === 1, `selects ${F.selects} writes ${F.writes}`);
  const F2 = mk(); F2.reset(); await FE.findExamplesFallback(env, CREW, F2.d); ok("(3) the crew read of the same state builds them (a second select reaches the archive)", F2.selects > 1, "selects " + F2.selects);
  const F3 = mk(); F3.store.set(FE.FALLBACK_KEY, { v: FE.FALLBACK_V, items: [], builtAt: new Date(NOW - 3 * DAY).toISOString() }); F3.reset(); ok("(3) a stale fallback store is null for the public and is not rebuilt", (await FE.findExamplesFallback(env, PUBLIC, F3.d)) === null && F3.writes === 0 && F3.selects === 1); }
// ---- (4) a stale pick (yesterday's) is null for the public, never built, never written
{ const T = mk(); T.rows = W.rows; T.apps = W.apps; for (const [k, v] of W.store) T.store.set(k, v);
  const old = (key, f) => { const v = T.store.get(key); T.store.set(key, f(v)); };
  old(MCX.MC_STORE, v => ({ ...v, data: { ...v.data, pickDate: YESTERDAY } })); old(MCX.MC_CARD_KEY, v => ({ ...v, data: { ...v.data, pickDate: YESTERDAY } })); old(MCX.SELL_CARD_KEY, v => ({ ...v, data: { ...v.data, pickDate: YESTERDAY } })); old(MCX.SELL_STORE, v => ({ ...v, data: { ...v.data, pickDate: YESTERDAY } })); old(TD.EMAIL_EXAMPLE_KEY, v => ({ ...v, pickDate: YESTERDAY }));
  T.reset(); const got = await Promise.all(["mcCard", "mcResult", "mcSales", "sellCard", "sellCars", "tasksEmail"].map(k => READ[k](PUBLIC, T.d)));
  ok("(4) yesterday's pick: all six daily examples are null for the public", got.every(x => x === null), JSON.stringify(got.map(x => x !== null)));
  ok("(4) and nothing was built, written or called", T.writes === 0 && T.builds === 0 && T.engine === 0 && vendor === 0);
  // find and featured: the stored pick is older than the 90 minute check, or its auction ended: null
  const G = mk(); G.rows = W.rows; G.apps = W.apps; for (const [k, v] of W.store) G.store.set(k, v); G.clock = NOW + 3 * HOUR;
  ok("(4) Find's pick not re-checked within 90 minutes is null for the public", (await READ.find(PUBLIC, G.d)) === null && (await READ.featured(PUBLIC, G.d)) === null); }
// ---- (4b) the hourly revalidation still drops an ended auction on the public read: a car whose listing ended is not served
{ const E = mk(); E.rows = W.rows.map(r => ({ ...r })); E.apps = W.apps; for (const [k, v] of W.store) E.store.set(k, v);
  const before = (await READ.find(PUBLIC, E.d)) || []; E.rows[0].status = "ended_sold"; E.rows[0].end_time = new Date(NOW - HOUR).toISOString();
  const after = (await READ.find(PUBLIC, E.d)) || [];
  ok("(4) a car whose auction has ended is dropped from the public Find examples at the read (the cron revalidation removes it from the store within the hour)", before.length === 3 && after.length === 2 && !after.some(i => i.title === before[0].title), `${before.length} then ${after.length}`);
  const f = await READ.featured(PUBLIC, E.d); if (f) { const fid = E.store.get(FH.STORE_KEY).listingId, row = E.rows.find(r => String(r.id) === String(fid)); if (row) { row.status = "ended_sold"; row.end_time = new Date(NOW - HOUR).toISOString(); } ok("(4) the featured history of an ended auction is null for the public", (await READ.featured(PUBLIC, E.d)) === null); } }
// ---- (4c) a stored pick whose photo has gone is NOT rebuilt by a public request (the cron does that); it is served as stored
{ const E = mk(); for (const [k, v] of W.store) E.store.set(k, v); E.headOk = false; MCX.resetRecheck(); E.reset();
  const got = await READ.mcCard(PUBLIC, E.d);
  ok("(4) a public request does not check photos or rebuild: the stored pick is served as stored, no head request, no builder", got !== null && E.head === 0 && E.builds === 0 && E.engine === 0 && E.writes === 0, `head ${E.head} builds ${E.builds}`);
  MCX.resetRecheck(); E.reset(); const crew = await READ.mcCard(CREW, E.d); ok("(4) the crew read of the same pick does check the photo (the counter is live)", E.head > 0, "head " + E.head); }
// ---- (5) each example keeps its own kill switch, for everyone
{ const SW = [["FIND_EXAMPLES", ["find", "findSales"]], ["FEATURED_HISTORY", ["featured"]], ["TASKS_DEMO", ["tasksEmail"]], ["CREW_MC_EXAMPLES", ["mcCard", "mcResult", "mcSales"]], ["MC_EXAMPLE_SALES", ["mcCard", "mcResult", "mcSales"]], ["CREW_SELL_EXAMPLE", ["sellCard", "sellCars"]], ["SELL_EXAMPLE_FIELD", ["sellCard", "sellCars"]]];
  for (const [sw, names] of SW) { process.env[sw] = "0"; for (const who of [["public", PUBLIC], ["crew", CREW]]) { const got = await Promise.all(names.map(k => READ[k](who[1]))); ok(`(5) ${sw}=0: ${names.join(", ")} are null for the ${who[0]}`, got.every(x => x === null)); }
    const others = NAMES.filter(k => !names.includes(k)), live = await Promise.all(others.map(k => READ[k](PUBLIC))); ok(`(5) ${sw}=0 turns off only its own examples (the other ${others.length} still answer the public)`, live.filter(x => x !== null).length >= others.length - 3, JSON.stringify(live.map(x => x !== null))); delete process.env[sw]; } }
// ---- (6) the cron builds what the public reads (stub doors, no engine): Sell cars, the Tasks email example and the Find sales, then the public read serves exactly what was stored
{ const B = mk(); B.rows = W.rows; B.apps = W.apps;
  const place = (name, sales) => ({ name, sales, house: false, most_sold_between: [20000, 30000] });
  B.d.places = async () => ({ cohort_name: "1995 Mazda Miata", window_label: "in the last 36 months", places: [place("Bring a Trailer", 9), place("Cars & Bids", 5)] });
  B.d.blocks = async (e, rows, cards) => [{ cardHtml: "<p>card</p>", cardText: "card", bid: 1000 }];
  B.d.select = (orig => async (e, q) => { if (/^task_updates/.test(q)) return [{ id: 7, task_id: 3, created_at: "2026-11-05T10:00:00Z", data: { cards: [{ id: W.rows[0].id, title: "1995 BMW M3 Coupe", house: "Bring a Trailer", miles: 147000, location: "West New York NJ" }] } }]; if (/^tasks\?id=/.test(q)) return [{ filters: { make: "BMW", year_min: 1995 }, summary: "Sam is looking for BMWs from 1995." }]; if (/^live_listings\?id=eq\./.test(q)) return W.rows.slice(0, 1); return orig(e, q); })(B.d.select);
  const words = await PX.refreshEntryExamples(env, B.d, ["sellCars", "tasksEmail"]);
  ok("(6) the cron builds Sell cars and the Tasks email example", words.sellCars === "built" && words.tasksEmail === "built", JSON.stringify(words));
  B.reset(); const pubCars = await READ.sellCars(PUBLIC, B.d), pubMail = await READ.tasksEmail(PUBLIC, B.d);
  ok("(6) the public read then serves what the cron stored, with no builder call", pubCars && pubCars.cars.length >= 2 && pubMail && pubMail.block && B.builds === 0 && B.engine === 0 && B.writes === 0, JSON.stringify([pubCars && pubCars.cars.length, !!pubMail, B.builds]));
  const again = await PX.refreshEntryExamples(env, B.d, ["sellCars", "tasksEmail"]); ok("(6) the cron keeps today's pick and does not build twice", again.sellCars === "kept" && again.tasksEmail === "kept", JSON.stringify(again));
  ok("(6) the crew read of the Tasks email example equals the public one", JSON.stringify(await READ.tasksEmail(CREW, B.d)) === JSON.stringify(pubMail)); }
// ---- (7) the class, in the source
{ const src = f => fs.readFileSync(path.join(root, f), "utf8"), api = src("api/publicExamples.js");
  ok("(7) the public endpoint imports no builder: not lib/live/publicExamples.js, no refresh or build name", !/publicExamples\.js|\brefresh\w*\(|\bbuild\w*\(/.test(api.replace(/^\/\/.*$/gm, "")), "");
  ok("(7) the endpoint is GET only and answers 404 for a name it does not serve", /req\.method !== "GET"/.test(api) && /res\.statusCode = 404/.test(api));
  ok("(7) a crew response is never cached and a public one is held at most a minute at the edge", /private, no-store/.test(api) && /s-maxage=60/.test(api) && !/s-maxage=(?!60\b)\d+/.test(api));
  const pull = src("api/pullLive.js"); ok("(7) the cron builds them: the hourly quiet slot calls refreshEntryWord, which runs refreshEntryExamples", /entryExamples = await refreshEntryWord\(env\)/.test(pull) && /refreshEntryExamples\(env\)/.test(pull));
  ok("(7) every public reader gate is the one mayRead (the flag lives in lib/live/publicAccess.js only)", ["lib/live/findExamples.js", "lib/live/featuredHistory.js", "lib/live/entryExamples.js"].every(f => /mayRead\(/.test(src(f))) && (src("lib/live/publicAccess.js").match(/PUBLIC_EXAMPLES/g) || []).length >= 1 && !["lib/live/findExamples.js", "lib/live/featuredHistory.js", "lib/live/entryExamples.js", "lib/live/tasksDemo.js", "lib/live/marketCheckExamples.js"].some(f => /process\.env\.PUBLIC_EXAMPLES/.test(src(f).replace(/\/\/.*$/gm, ""))));
  const ex = src("lib/live/entryExamples.js"), i = ex.indexOf("export async function daily("), j = ex.indexOf("export async function buildDaily(");
  ok("(7) in daily() the public branch returns before any build (the build is a separate function, buildDaily)", i > 0 && j > i && /isPublicRead\(req\)/.test(ex.slice(i, j)) && !/build\(/.test(ex.slice(i, j))); }
console.log(`\npublicExamplesCheck: ${n - failed} pass, ${failed} FAIL`);
process.exit(failed ? 1 : 0);
