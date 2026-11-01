// A MODEL OR TRIM THE READER NAMED IS NEVER DROPPED TO THE WHOLE MAKE, A FILTER NEVER APPEARS THAT THE READER DID NOT TYPE, AND A BADGE-ENGINEERED CAR IS READ UNDER BOTH BADGES (Lane B, Nov 1 2026).
// Reader report: "a first gen Ford Capri" opened /find?q=Ford+Capri+RS+from+1968+to+1974&make=Ford&model=Capri&trim=RS&from=1968&to=1974 and showed "20 live matches. That's everything matching your search" over a
// 1972 Mustang, a Ranchero, an F-350, a Bronco and an F-100, and asked "Which body style?" from those cars. CAUSE: the resolver does not confirm Capri as a Ford model, so lib/live/samChat.js runSearch and
// lib/live/search.js searchLive read the make with no model word to hold a listing to (and searchAll, for a car the resolver cannot read at all, read every live car); the trim RS was the chat tool's own (genPhraseCheck);
// the Mercury Capri (the first generation reached the US under that badge) was never read. WHO ELSE: every car outside the resolver's taxonomy, on the Find address, the chat tool, the typed Buy search, widenings, Task
// matching and Task emails, the body-style question and the count line, the sales fallback. This check runs Ford Capri, Ford Capri RS, De Tomaso Pantera and Opel GT (no live cars) and a Ford Mustang control through
// each path with a table of live listings that holds ONLY other models, then with the car present. It fails without the fix.
//   node scripts/namedModelCheck.mjs [repo root]
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
let LIVE = [], SALES = [];
const likeRe = v => new RegExp("^" + String(v).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i");
globalThis.fetch = async (url, init) => {
  const u = new URL(String(url)), sp = u.searchParams;
  if (!/fake\.supabase/.test(u.hostname)) return new Response("", { status: 500 });
  if (/taxonomy|generations/.test(u.pathname)) return new Response("", { status: 500 });   // the resolver falls back to its curated lists, as it does with the tables unreachable
  if (u.pathname.endsWith("/live_listings")) {
    const rg = String((init && init.headers && (init.headers.Range || init.headers.range)) || ""), off = Number((/^(\d+)-/.exec(rg) || [])[1] || sp.get("offset") || 0);
    const mk = sp.get("make") && likeRe(sp.get("make").replace(/^ilike\./, ""));
    return new Response(JSON.stringify(off > 0 ? [] : LIVE.filter(r => !mk || mk.test(r.make))), { status: 200 });
  }
  if (u.pathname.endsWith("/sales_archive")) {
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
const S = await import(pathToFileURL(path.join(root, "lib/live/samChat.js")).href), L = await import(pathToFileURL(path.join(root, "lib/live/search.js")).href);
const soon = new Date(Date.now() + 6 * 864e5).toISOString();
let id = 0;
const live = (make, model, year, title) => ({ id: "L" + ++id, source: "bringatrailer", make, model, year, listing_title: title || `${year} ${make} ${model}`, current_bid_usd: 21000, end_time: soon, country: "US", photo_url: "https://x/i.jpg", status: "live", mileage: 50000 });
const OTHERS = [live("Ford", "Mustang", 1972, "1972 Ford Mustang Mach 1"), live("Ford", "Ranchero", 1974), live("Ford", "F-350", 1973), live("Ford", "Bronco", 1972), live("Ford", "F-100", 1968), live("Ford", "Mustang", 1968, "1968 Ford Mustang Coupe"),
  live("Porsche", "911", 1972, "1972 Porsche 911 T"), live("Chevrolet", "Corvette", 1970), live("Ford", "Pinto", 1973), live("Mercury", "Cougar", 1972)];
const titles = r => (r.matches || []).map(x => x.r.listing_title);
const CARS = [
  { name: "Ford Capri", p: { make: "Ford", model: "Capri" }, word: /capri/i },
  { name: "Ford Capri RS", p: { make: "Ford", model: "Capri", trim: "RS" }, word: /capri/i },
  { name: "De Tomaso Pantera", p: { make: "De Tomaso", model: "Pantera" }, word: /pantera/i },
  { name: "Opel GT", p: { make: "Opel", model: "GT" }, word: /\bgt\b/i }
];
const sale = (make, year, title, price, model = "Capri") => ({ id: "S" + ++id, source_id: "s" + id, sale_price: price, sale_date: new Date(Date.now() - (30 + id) * 864e5).toISOString().slice(0, 10), platform: "Bring a Trailer", source_slug: "bringatrailer", make, model, year, listing_title: title, vin_norm: "V" + id, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: null, vehicle_type: "car", sale_price_usd: price, model_family: model,
  raw_record: { featured_image_url: "https://x/i.jpg", mileage: "60000", body_style: null, modifications: null, title, currency: "USD", transmission: null, exterior_color: null, title_status: null, url: "https://u/" + id, source_url: null, city: "Austin", state: "TX", country_code: "US" } });
const FORD = [], M70 = [], M80 = [], M90 = [];
for (let i = 0; i < 6; i++) FORD.push(sale("Ford", 1970 + (i % 4), `${1970 + (i % 4)} Ford Capri 2000 GT`, 14000 + i * 500));
for (let i = 0; i < 5; i++) M70.push(sale("Mercury", 1971 + (i % 4), `${1971 + (i % 4)} Mercury Capri`, 12000 + i * 500));
for (let i = 0; i < 5; i++) M80.push(sale("Mercury", 1980 + i, `${1980 + i} Mercury Capri GS`, 6000 + i * 300));
for (let i = 0; i < 3; i++) M90.push(sale("Mercury", 1991 + i, `${1991 + i} Mercury Capri XR2`, 8000 + i * 300));
const PANTERA = Array.from({ length: 12 }, (_, i) => sale("De Tomaso", 1972 + (i % 3), `${1972 + (i % 3)} De Tomaso Pantera`, 90000 + i * 2500, "Pantera"));
SALES = FORD.slice(0, 3).concat(PANTERA);   // the archive holds three Capri sales (thin) and twelve Pantera sales for every section below
// ---- 1. no live cars of the named model: no other model on any path
LIVE = OTHERS.slice();
for (const c of CARS) for (const yrs of [{}, { year_min: 1968, year_max: 1974 }]) {
  const p = { ...c.p, ...yrs }, tag = `${c.name}${yrs.year_min ? " 1968 to 1974" : ""}`;
  const sr = await S.runSearch(env, p, {});
  ok(`${tag}: the search (Find address, chat tool, Task, widenings share runSearch) returns no car of another model`, sr.matches.length === 0, JSON.stringify(titles(sr).slice(0, 3)));
  const sr2 = await S.runSearch(env, p, { rows: LIVE });
  ok(`${tag}: the same search on rows already read (a widening, a Task candidate list) returns none`, sr2.matches.length === 0, JSON.stringify(titles(sr2).slice(0, 3)));
  const fl = await S.runFilters(env, p, {});
  ok(`${tag}: the reloaded address has no cards, no search line over other cars, a no-cars sentence that names the car`, fl.cards.length === 0 && !fl.searchNote && /no .*(live|for sale)|nothing live/i.test(fl.reply || ""), JSON.stringify(fl.reply).slice(0, 120));
  ok(`${tag}: no live matches means no narrowing question`, !(fl.meta && (fl.meta.live || 0) > 0));
}
// the typed Buy search (parseQueryResolved then searchLive)
for (const c of CARS) {
  const typed = `${c.p.make} ${c.p.model}${c.p.trim ? " " + c.p.trim : ""}`;
  const pq = await L.parseQueryResolved(typed, env), sl = pq.vehicle ? await L.searchLive(env, pq.vehicle, pq.filters, pq.text) : { rows: [] };
  ok(`typed "${typed}": a car with no live listings returns nothing, not the make`, (sl.rows || []).length === 0, JSON.stringify((sl.rows || []).map(x => x.r.listing_title).slice(0, 3)));
}
// ---- 2. the car is live: only that car
LIVE = OTHERS.concat([live("Ford", "Capri", 1971, "1971 Ford Capri 2000 GT"), live("Ford", "Capri", 1972, "1972 Ford Capri 1600"), live("Ford", "Capri", 1973, "1973 Ford Capri RS 2600"),
  live("De Tomaso", "Pantera", 1973, "1973 De Tomaso Pantera"), live("Opel", "GT", 1970, "1970 Opel GT"), live("Opel", "Kadett", 1970, "1970 Opel Kadett")]);
for (const c of CARS) {
  const sr = await S.runSearch(env, c.p, {});
  const want = c.name === "Ford Capri RS" ? 1 : 1 + (c.name === "Ford Capri" ? 2 : 0);
  ok(`${c.name}: with the car live, every match is that car`, sr.matches.length === want && titles(sr).every(t => c.word.test(t)), JSON.stringify(titles(sr)));
}
ok("Ford Capri RS: the RS the reader typed is a whole-word fence (the 2000 GT and the 1600 are out)", titles(await S.runSearch(env, { make: "Ford", model: "Capri", trim: "RS" }, {})).join("|") === "1973 Ford Capri RS 2600");
// the control: a model that has live cars, and a bare make still reads the make
LIVE = OTHERS.slice();
const mu = await S.runSearch(env, { make: "Ford", model: "Mustang" }, {});
ok("control Ford Mustang: its live cars show and nothing else", mu.matches.length === 2 && titles(mu).every(t => /mustang/i.test(t)), JSON.stringify(titles(mu)));
const bare = await S.runSearch(env, { make: "Ford" }, {});
ok("control bare make: a make with no model still reads the whole make", bare.matches.length >= 6, String(bare.matches.length));
// ---- 3. no filter the reader did not type (the chat tool's own guards, lib/genPhrase.js; the tool applies them before it searches)
const G0 = await import(pathToFileURL(path.join(root, "lib/genPhrase.js")).href), fs = await import("node:fs");
const G = { guardGenPhraseFilters: G0.guardGenPhraseFilters || (p => p), dropUnsaidYears: G0.dropUnsaidYears || (p => p), dropUnsaidTrim: G0.dropUnsaidTrim || (p => p) };   // a missing guard is a FAIL below, not a crash
const tool = { make: "Ford", model: "Capri", trim: "RS", year_min: 1968, year_max: 1974 };
for (const typed of ["Ford Capri", "first gen Ford Capri", "Ford Capri 1972", "show me a Capri"]) {
  const sy = L.parseQuery(typed).filters; let q = G.dropUnsaidYears(tool, !!(sy.yearMin || sy.yearMax), null); q = G.guardGenPhraseFilters(q, typed, !!(sy.yearMin || sy.yearMax)); q = G.dropUnsaidTrim(q, typed, null);
  ok(`typed "${typed}": the tool's own trim RS is dropped (the reader did not type it)`, !q.trim, JSON.stringify(q));
  ok(`typed "${typed}": no years unless the reader typed them or the generation table has the row`, /1972/.test(typed) ? Number(q.year_min) === 1968 : (!q.year_min || (q.year_min === 1969 && q.year_max === 1974)), JSON.stringify(q));
}
ok("typed \"Ford Capri RS\": the RS the reader typed is kept", G.dropUnsaidTrim(tool, "Ford Capri RS", null).trim === "RS");
ok("typed \"Corvette Z06\": a trim the reader typed is kept, also squashed (GT-3 for GT3)", G.dropUnsaidTrim({ make: "Chevrolet", model: "Corvette", trim: "Z06" }, "chevy corvette z06", null).trim === "Z06" && G.dropUnsaidTrim({ make: "Porsche", model: "911", trim: "GT3" }, "a gt-3 please", null).trim === "GT3");
ok("a trim carried from the search before is kept on a follow-up", G.dropUnsaidTrim({ make: "Porsche", model: "911", trim: "Carrera S" }, "only manual", "Carrera S").trim === "Carrera S");
{ const src = fs.readFileSync(path.join(root, "lib/live/samChat.js"), "utf8"); ok("the chat tool applies the trim and years guards before it searches", /dropUnsaidTrim\(p, ctx\.lastUser/.test(src) && /dropUnsaidYears\(p, /.test(src)); }
{ const addr = await S.runFilters(env, { make: "Ford", model: "Capri" }, {});
  ok("the reloaded address filters are the ones in the address (no trim or years added)", !(addr.state.filters || {}).trim && !(addr.state.filters || {}).year_min, JSON.stringify(addr.state.filters)); }
// ---- 4. the Mercury Capri: first generation years only, shown with the badge as listed
LIVE = OTHERS.concat([live("Ford", "Capri", 1971, "1971 Ford Capri 2000 GT"), live("Mercury", "Capri", 1972, "1972 Mercury Capri"), live("Mercury", "Capri", 1974, "1974 Mercury Capri"),
  live("Mercury", "Capri", 1981, "1981 Mercury Capri GS"), live("Mercury", "Capri", 1986, "1986 Mercury Capri RS"), live("Mercury", "Capri", 1992, "1992 Mercury Capri XR2 Convertible")]);
for (const [tag, p] of [["Ford Capri", { make: "Ford", model: "Capri" }], ["first generation Ford Capri", { make: "Ford", model: "Capri", year_min: 1969, year_max: 1974 }]]) {
  const t = titles(await S.runSearch(env, p, {}));
  ok(`${tag}: the 1970 to 1974 Mercury Capris are in, with their own title`, t.includes("1972 Mercury Capri") && t.includes("1974 Mercury Capri") && t.includes("1971 Ford Capri 2000 GT"), JSON.stringify(t));
  ok(`${tag}: the 1979 to 1986 and 1991 to 1994 Mercury Capris are out`, !t.some(x => /1981|1986|1992/.test(x)), JSON.stringify(t));
}
{ const t = titles(await S.runSearch(env, { make: "Ford", model: "Capri", year_min: 1980, year_max: 1990 }, {}));
  ok("Ford Capri asked for 1980 to 1990: the Mercury alias adds nothing outside its own years", !t.some(x => /Mercury/.test(x)), JSON.stringify(t)); }
{ const t = titles(await S.runSearch(env, { make: "Mercury", model: "Capri" }, {}));
  ok("Mercury Capri asked for itself: untouched, it still reads the Mercury make", t.length >= 1 && t.every(x => /mercury/i.test(x)), JSON.stringify(t)); }
// the sales pool (the engine): the same alias, from the archive
const O = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
const poolOf = async rows => { SALES = rows; const a = await O.oneEngineAnswer({ make: "Ford", model: "Capri" }, null, "Ford Capri", env).catch(() => null); return a ? Number(a.poolSize) || 0 : -1; };
const nFord = await poolOf(FORD), nBoth = await poolOf(FORD.concat(M70)), nAll = await poolOf(FORD.concat(M70, M80, M90)), nLate = await poolOf(FORD.concat(M80, M90));
ok("the sales pool of the Ford Capri takes in the 1970 to 1974 Mercury Capri sales", nBoth - nFord >= 3, `ford ${nFord}, with Mercury ${nBoth}`);
ok("the sales pool takes in no 1979 to 1986 or 1991 to 1994 Mercury Capri", nAll === nBoth && nLate === nFord, `with late ${nAll} (want ${nBoth}), Ford plus late only ${nLate} (want ${nFord})`);
// ---- 5. NONE LIVE, ON THE READER'S ADDRESS (/find?q=Ford+Capri+RS+from+1968+to+1974&make=Ford&model=Capri&trim=RS&from=1968&to=1974): the page says none is live right now, named for the car, shows the car's own
// recent sales as the engine says them (thin wording under eight, no range, no sale lines), offers Keep looking, and never prints "N live matches" or "That's everything matching your search" over other cars.
LIVE = OTHERS.slice();
SALES = FORD.slice(0, 3);   // three Capri sales: thin
const addr = { make: "Ford", model: "Capri", trim: "RS", year_min: 1968, year_max: 1974 };
const z = await S.runFilters(env, addr, {});
ok("the reader's address: no cards, no live count", z.cards.length === 0 && z.meta && z.meta.live === 0, JSON.stringify(z.meta && z.meta.live));
ok("the reader's address: the reply says none is live right now and names the car (Capri)", /capri/i.test(z.reply || "") && /live right now/i.test(z.reply || "") && !/mustang|ranchero|bronco|f-?350|f-?100/i.test(z.reply || ""), JSON.stringify(z.reply));
const nl = z.meta && z.meta.noneLive; ok("the reader's address: the Capri's recent sales come from the engine, thin wording under eight", !!nl && nl.lines.length >= 1 && /too few for a range/i.test(nl.lines.join(" ")), JSON.stringify(nl));
ok("the reader's address: thin means no range and no sale lines (no dollar figure, no title, no date list)", !!nl && !/\$\d/.test(nl.lines.join(" ")) && !/Ford Capri|Mercury/i.test(nl.lines.join(" ")), JSON.stringify(nl && nl.lines));
ok("the reader's address: the sales are the Capri's, never another model's", !!nl && Number(nl.count) <= 3, JSON.stringify(nl && nl.count));
SALES = FORD.slice(0, 3).concat(PANTERA);
const zp = await S.runFilters(env, { make: "De Tomaso", model: "Pantera" }, {});
ok("De Tomaso Pantera with 12 sales and none live: the engine's range sentence, no other model", zp.cards.length === 0 && !!(zp.meta && zp.meta.noneLive) && /typical range/i.test(zp.meta.noneLive.lines.join(" ")) && /\$\d/.test(zp.meta.noneLive.lines.join(" ")), JSON.stringify(zp.meta && zp.meta.noneLive));
LIVE = OTHERS.concat([live("Ford", "Capri", 1972, "1972 Ford Capri 1600")]);
const zl = await S.runFilters(env, { make: "Ford", model: "Capri" }, {});
ok("control: with a Capri live there is no none-live block", zl.cards.length === 1 && !(zl.meta && zl.meta.noneLive));
{ const page = fs.readFileSync(path.join(root, "api/buy.js"), "utf8").replace(/\\n/g, "\n").replace(/\\"/g, '"');
  const iN = page.indexOf(": n ? '<p class=\"sc-1\">' + esc(matchesLine(n, true))"), iZ = page.indexOf(": matchesLine(0,", iN);
  ok("the page prints \"N live matches\" and \"That's everything matching your search\" only in the branch that has matches (n)", iN > 0 && iZ > iN && page.slice(iN, iZ).includes("everythingLine(m, f)") && (page.match(/esc\(everythingLine\(m, f\)\)/g) || []).length === 1);
  ok("the page prints the engine's none-live lines and computes nothing (meta.noneLive.lines, escaped text)", /d\.meta\.noneLive\.lines\.map\(function\(x\)\{ return "<p>" \+ esc\(x\) \+ "<\/p>"; \}\)/.test(page));
  ok("the page offers Keep looking when nothing is live (keepHtml with no cards)", /keepHtml\(cards\.length, q, qp\)/.test(page) && /<h3>Nothing live right now\.<\/h3>/.test(page)); }
console.log(fail ? `namedModelCheck: ${fail} FAIL` : "namedModelCheck: all pass");
process.exit(fail ? 1 : 0);
