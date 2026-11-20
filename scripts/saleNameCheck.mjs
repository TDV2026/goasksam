// clock: real-ok the fixture sales are dated relative to now (days ago); no calendar date is asserted
// EVERY SALE CARD CARRIES THE ENGINE'S OWN NAME FOR THE CAR, AND NO PAGE OR EMAIL IS HANDED A SCRAPED LISTING TITLE (Lane B, lane-b-sale-name, Nov 18 2026; order bc85, Lane S's finding in docs/lane-notes.md).
// CAUSE: a card served make, model, variantLabel, the date and the SALE'S OWN LISTING TITLE and no year, so Market Check's "Sales behind this answer", Find's list, Sell's list, the thin tiles, the closest
// sale of the tools, the watch emails and the partner rows each printed (or were forced to rebuild from) scraped listing text, and no three of them could agree. FIX: lib/onebox.js saleNameFields is the one
// namer (the archive's year, make and model in the engine's spelling, the variant its own words name), every card carries year, carName, variantLabel, carLine, bodyWord; the listing's own words
// (title, raw title columns, description text) stay server side and leave on no wire (lib/onebox.js scrubServed, api/sellerDecision.js); the buyer's fee words come from lib/buyerFee.js.
// CLASS: every card shape (cards, set aside rows, lowest and highest, closest, buckets, trend periods, thin sales, house receipts, partner rows), every car (a plain model, a family car with variants, a base-model
// family named as the variant itself, a car with no year), every surface that prints a sale (Market Check, Find, Sell, tools, watch emails, partner), and the VIN page's fee. THE WORLD HAS A MARKER IN EVERY
// LISTING TITLE (ZQLISTINGX plus scraped selling words): any answer, page or email that holds it has leaked a title.
//   node scripts/saleNameCheck.mjs [repo root]      --mutants breaks one rule at a time in a copy (each must fail)
import fs from "node:fs"; import path from "node:path"; import { spawnSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const args = process.argv.slice(2), here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(args.find(a => !a.startsWith("--")) || path.join(here, ".."));
if (args.includes("--mutants")) process.exit(mutants());
process.chdir(ROOT);
process.env.SUPABASE_URL = "https://fake.example"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.SUPABASE_ANON_KEY = "k"; process.env.OLDCARSDATA_API_KEY = "x"; process.env.LAUNCH_STAGE = "2";
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href), read = f => fs.readFileSync(path.join(ROOT, f), "utf8"), has = f => fs.existsSync(path.join(ROOT, f));
const WLD = await import(pathToFileURL(path.join(here, "_deskOlderWorld.mjs")).href), OB = await imp("lib/onebox.js");
let pass = 0, fail = 0; const fails = []; const ok = (n, c, d) => { if (c) pass++; else { fail++; fails.push(n + (d !== undefined ? " " + JSON.stringify(d).slice(0, 300) : "")); } };
console.error = () => {};
const w = WLD.install(ROOT), DAY = 864e5; let seq = 0;
const MARK = "ZQLISTINGX", SCRAPED = "Showroom Fresh One Owner Garage Kept";   // the scraped words every listing title carries in this world
const world = (make, model, years, spec, o = {}) => {   // spec: [[variant words, count, price]]
  const rows = []; let k = 0;
  for (const [words, count, price] of spec) for (let i = 0; i < count; i++) {
    const year = years[0] + (k % (years[1] - years[0] + 1)), id = "sn" + (seq++), title = `${year} ${make} ${model}${words ? " " + words : ""} ${MARK} ${SCRAPED}`;
    const raw = { id, title, featured_image_url: "https://img.example/" + id + ".jpg", mileage: String(30000 + k * 211), body_style: o.body || "Coupe", modifications: null, currency: "USD", transmission: "Manual (5-Speed)", exterior_color: "Red", title_status: "Clean", url: "https://bat.example/" + id, source_url: "https://src.example/" + id, city: "Austin", state: "TX", country_code: "US" };
    rows.push({ id, source_id: id, sale_price: price + i * 1100, sale_date: new Date(Date.now() - (40 + (k % 9) * 8) * DAY).toISOString().slice(0, 10), platform: k % 3 === 0 ? "Cars & Bids" : "Bring a Trailer", listing_title: title, year, make, model, vin_norm: null, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: false, raw_record: raw, vehicle_type: "car" });
    k++;
  }
  return rows;
};
const install = (model, rows) => { w.DATA.clear(); w.DATA.set(model, rows); };
const CARS = {
  "1987 Pontiac Firebird": { v: { year: 1987, make: "Pontiac", model: "Firebird" }, model: "Firebird", rows: () => world("Pontiac", "Firebird", [1987, 1987], [["Trans Am", 14, 14000], ["Formula", 12, 11500], ["", 12, 9500], ["Trans Am GTA", 5, 24000]]), line: /^1987 Pontiac Firebird( (Base|Trans Am|Formula|Trans Am GTA|GTA))?$/, plain: "1987 Pontiac Firebird" },
  "1990 Rolls-Royce Silver Spur": { v: { year: 1990, make: "Rolls-Royce", model: "Silver Spur" }, model: "Silver Spur", rows: () => world("Rolls-Royce", "Silver Spur", [1990, 1990], [["", 14, 17000]], { body: "Sedan" }), line: /^1990 Rolls-Royce Silver Spur$/ },
  "2002 BMW Z8": { v: { year: 2002, make: "BMW", model: "Z8" }, model: "Z8", rows: () => world("BMW", "Z8", [2002, 2002], [["", 14, 190000]], { body: "Convertible" }), line: /^2002 BMW Z8$/ },
  "1965 Ferrari 330 GT": { v: { year: 1965, make: "Ferrari", model: "330 GT" }, model: "330 GT", rows: () => world("Ferrari", "330 GT", [1965, 1967], [["GT 2+2 Series II", 14, 230000], ["GTC", 14, 480000]]), line: /^(1965|1966|1967) Ferrari 330 (GT 2\+2|GTC)$/ },
};
w.deps.resolveVehicle = async text => { const c = CARS[Object.keys(CARS).find(k => text.startsWith(k) || k.startsWith(text))] || CARS["1987 Pontiac Firebird"]; return { status: "valid", vehicle: { ...c.v } }; };
const answer = async text => { const c = CARS[text]; install(c.model, c.rows()); const a = (await OB.oneEngineAnswer({ ...c.v }, null, text, { ...w.env, asked: 2 })).raw; if (process.env.SN_DEBUG) process.stdout.write(text + " tier " + a.tier + " " + String(a.samLine || "").slice(0, 120) + " " + JSON.stringify([a.refusal, a.thinReason, a.setAsideReasons, a.verifyWhy, a.refusal_line]).slice(0, 300) + "\n"); return a; };
// a sale-shaped object: a price and a date or an address (the same test the engine's scrub uses, written again so the check does not depend on the code it checks)
const isNum = x => typeof x === "number" && Number.isFinite(x);
const saleShaped = o => o && typeof o === "object" && !Array.isArray(o) && (isNum(o.price) || isNum(o.priceUsd) || isNum(o.hammer)) && (o.platform != null || o.venue != null || o.url != null || o.image != null || o.house != null || o.month != null);
const walk = (v, f, p = "$", seen = new Set()) => { if (!v || typeof v !== "object" || seen.has(v)) return; seen.add(v); f(v, p); for (const k of Object.keys(v)) walk(v[k], f, p + "." + k, seen); };
const sales = v => { const out = []; walk(v, (o, p) => { if (saleShaped(o)) out.push([p, o]); }); return out; };
const leaks = v => { const t = JSON.stringify(v === undefined ? null : v); return t.includes(MARK) || t.includes("Showroom"); };

// 1. THE NAME ON EVERY CARD, FROM THE ENGINE (the live engine, four cars)
for (const text of Object.keys(CARS)) {
  const d = await answer(text), c = CARS[text];
  const all = [...(d.cards || []), ...(d.setAsideRows || []), ...(d.belowRangeSales || []), ...(d.aboveRangeSales || []), ...(d.lowestSale ? [d.lowestSale] : []), ...(d.highestSale ? [d.highestSale] : [])];
  ok(`${text}: the engine answered with cards (${all.length})`, (d.cards || []).length >= 8, { tier: d.tier, n: (d.cards || []).length });
  ok(`${text}: every card carries carLine, a year, carName, and the line the engine's namer gives`, all.length > 0 && all.every(x => typeof x.carLine === "string" && x.carLine.length > 0 && Number(x.year) > 0 && typeof x.carName === "string" && c.line.test(x.carLine)), all.filter(x => !(typeof x.carLine === "string" && c.line.test(x.carLine))).slice(0, 2).map(x => [x.carLine, x.year, x.carName]));
  ok(`${text}: carLine is the year, the name and the variant, in that order, with no body or gearbox words in it`, all.every(x => x.carLine === [x.year, x.carName, x.variantLabel && !String(x.carName).toLowerCase().endsWith(String(x.variantLabel).toLowerCase()) ? x.variantLabel : null].filter(Boolean).join(" ") && !/\b(manual|automatic|coupe|convertible|sedan)\b/i.test(x.carLine)), all.slice(0, 2).map(x => x.carLine));
  ok(`${text}: no card's carLine holds a listing word (the marker or the selling words)`, all.every(x => !leaks(x.carLine) && !leaks(x.carName)), all.slice(0, 1).map(x => x.carLine));
  ok(`${text}: body and gearbox ride as their own fields (bodyWord, gearboxWord), never inside the line`, all.every(x => "bodyWord" in x && "gearboxWord" in x), Object.keys(all[0] || {}));
}
{ // the family cars: the variant stays its own field, a base-model family is named as the variant itself
  const fb = await answer("1987 Pontiac Firebird"), named = fb.cards.filter(x => x.variantLabel), unnamed = fb.cards.filter(x => !x.variantLabel);
  ok("1987 Firebird: a sale that names a variant carries it as variantLabel and in carLine (1987 Pontiac Firebird Formula)", named.length > 0 && named.every(x => String(x.carLine).endsWith(" " + x.variantLabel)) && named.some(x => /Formula$/.test(x.carLine)), named.slice(0, 2).map(x => x.carLine));
  ok("1987 Firebird: every sale is named as the Firebird of its own year, whatever its variant", fb.cards.every(x => String(x.carLine).startsWith("1987 Pontiac Firebird")) && unnamed.every(x => x.carLine === "1987 Pontiac Firebird"), fb.cards.slice(0, 1).map(x => x.carLine));
  const fe = await answer("1965 Ferrari 330 GT");
  ok("Ferrari 330 GT: a GTC sale is named as itself (Ferrari 330 GTC), the GT 2+2 as Ferrari 330 GT 2+2, the variant its own field, no 'GTC GTC'", fe.cards.some(x => x.carName === "Ferrari 330 GTC" && x.variantLabel === "GTC" && /^\d{4} Ferrari 330 GTC$/.test(x.carLine)) && fe.cards.some(x => x.carName === "Ferrari 330 GT 2+2" && /^\d{4} Ferrari 330 GT 2\+2$/.test(x.carLine)), fe.cards.slice(0, 3).map(x => x.carLine));
}
// the line is never built from the title: a row whose title names another car is named by its own columns; a row with no year is the name alone
{ const f = OB.saleNameFields; ok("saleNameFields exists and names a row from its columns", typeof f === "function");
  if (typeof f === "function") {
    const a = f({ year: 2002, make: "BMW", model: "Z8", raw_title: "1999 Ford Mustang " + MARK }), b = f({ year: null, make: "BMW", model: "Z8", raw_title: "2002 BMW Z8 " + MARK }), c = f({ year: 1997, make: "Porsche", model: "993", raw_title: "x" }), d = f({ year: 1973, make: "DeTomaso", model: "Pantera", raw_title: "x" });
    ok("a row whose title names another car is named by its own columns (2002 BMW Z8)", a.carLine === "2002 BMW Z8" && a.year === 2002, a);
    ok("a sale with no year reads the name alone (BMW Z8), year null", b.carLine === "BMW Z8" && b.year === null, b);
    ok("the Porsche 911 chassis code is never the printed model (the resolver own word)", /^1997 Porsche 911( Carrera)?$/.test(c.carLine), c);
    ok("a make with a display name prints in the maker's spelling (De Tomaso)", d.carLine === "1973 De Tomaso Pantera", d); } }

// 2. NO LISTING TITLE ON THE WIRE: the live handler, a visitor, four cars (Market Check's answer), every sale-shaped object named and none holding a title
{ const H = (await imp("api/sellerDecision.js")).default; let n = 0;
  const hit = async body => { let out = null; const res = { status(c) { this.code = c; return this; }, json(b) { out = b; if (process.env.SN_DEBUG) process.stdout.write("HANDLER " + this.code + " " + JSON.stringify(b).slice(0, 300) + "\n"); return this; }, setHeader() {}, end() {}, getHeader() {} }; await H({ method: "POST", headers: { origin: "https://goasksam.com", cookie: "" }, query: {}, body, socket: { remoteAddress: "10.9." + Math.floor(++n / 250) + "." + (n % 250) } }, res); return out; };
  for (const text of Object.keys(CARS)) {
    const c = CARS[text]; install(c.model, c.rows());
    const wire = await hit({ oneBox: true, search: text });
    ok(`${text}: the handler served an answer with sales (a visitor)`, !!wire && wire.status === "one_box" && /^(result|thin)$/.test(String(wire.tier)), wire && [wire.status, wire.tier, wire.samLine]);
    const ss = sales(wire);
    ok(`${text}: the served answer holds no listing title, raw title or selling word anywhere`, !leaks(wire), (JSON.stringify(wire).match(new RegExp(".{40}(" + MARK + "|Showroom).{20}")) || [""])[0]);
    ok(`${text}: no sale-shaped object on the wire has a title key`, ss.length > 0 && ss.every(([, o]) => !("title" in o)), ss.filter(([, o]) => "title" in o).slice(0, 3).map(([p]) => p));
    if (process.env.SN_DEBUG) for (const [p, o] of ss.filter(([, o]) => typeof o.carLine !== "string").slice(0, 1)) process.stdout.write("NOCAR " + p + " " + JSON.stringify(o).slice(0, 300) + "\n"); ok(`${text}: every sale-shaped object on the wire carries carLine`, ss.length > 0 && ss.every(([, o]) => typeof o.carLine === "string" && o.carLine.length > 0), ss.filter(([, o]) => !(typeof o.carLine === "string")).slice(0, 4).map(([p]) => p));
    ok(`${text}: no row on the wire carries the archive's raw title columns or description text`, !(() => { let bad = false; walk(wire, o => { for (const k of ["raw_title", "rtitle", "listing_title", "_descText", "mods"]) if (k in o) bad = true; }); return bad; })());
  } }

// 3. EVERY SURFACE THAT PRINTS A SALE READS carLine
{ const d = await answer("1987 Pontiac Firebird");
  // Sell and Find lift the engine's answer into their own card shapes
  const SF = await imp("lib/sell/sellFacts.js"), SC = await imp("lib/sellsForCard.js");
  const lifted = SF.cardAnswerOf(d);
  ok("Sell's card answer carries each sale's carLine and no title", lifted.cards.length > 0 && lifted.cards.every(c => c.carLine && !("title" in c)), lifted.cards[0]);
  const html = (SC.sellsForCardHtml || SC.default || (() => ""))({ ...lifted, cluster: null, tier: "thin", samLine: "Only a few sales." }, { updated: "Nov 18 2026" });   // a card with no range lists its sales
  ok("the shared sales list prints the engine's line and no scraped word", typeof html === "string" && /sfc-row-title">1987 Pontiac Firebird/.test(html) && !leaks(html), html && html.slice(0, 120));
  // Market Check's page prints carLine at every place a sale card is drawn (the live listing rows keep their own title: they are for-sale listings, not sale cards)
  const pg = read("public/js/onebox.js");
  ok("Market Check's page prints no sale card's title (cleanReceiptTitle / titleCaseSaleTitle of a card, a receipt or a sale)", !/cleanReceiptTitle\((c|rc|s)\.title\)|titleCaseSaleTitle\((c|rc|s)\.title\)|esc\((c|rc)\.title\)|shortCarName\(rc\.title\)/.test(pg));
  ok("Market Check's page draws each card from carLine", (pg.match(/\.carLine/g) || []).length >= 8, (pg.match(/\.carLine/g) || []).length);
  for (const f of ["lib/sellsForCard.js", "lib/sell/sellClient.js", "lib/sell/sellMcClient.js"]) ok(`${f} prints a sale's carLine, never its title`, /carLine/.test(read(f)) && !/(c|r|s)\.title\b/.test(read(f).replace(/cl\.title|l\.title/g, "")), f);
  // the tools and the partner rows
  const TM = await imp("lib/tools/marketCheck.js"), ta = TM.toolAnswerOf ? TM.toolAnswerOf({ ...d, representative: { closest: d.cards[0] } }, { vehicle: { year: 1987, make: "Pontiac", model: "Firebird" } }) : null;
  ok("the tool answer's closest sale is named by carLine, no title", !!ta && ta.closestSale && ta.closestSale.carLine === d.cards[0].carLine && !("title" in ta.closestSale), ta && ta.closestSale);
  const PL = await imp("lib/placedSale.js");
  ok("a name that already ends with its variant is not repeated (Ford GT Heritage, Heritage), a name that does not gets it", OB.saleLineOf(2006, "Ford GT Heritage", "Heritage") === "2006 Ford GT Heritage" && OB.saleLineOf(1987, "Pontiac Firebird", "GTA") === "1987 Pontiac Firebird GTA" && OB.saleLineOf(null, "Ford GT", null) === "Ford GT");
  ok("a partner row's name is the engine's line, never a title", PL.rowTitle({ carLine: "1987 Pontiac Firebird", title: "x " + MARK }) === "1987 Pontiac Firebird" && PL.placedSaleOf({ carLine: "1987 Pontiac Firebird", price: 1, title: MARK }).name === "1987 Pontiac Firebird");
  // emails: the watch email names the sale by carLine
  const WT = await imp("lib/live/watches.js"), ev = { key: "s:1", kind: "sale", date: new Date().toISOString().slice(0, 10), price: 12000, miles: 30000, house: "Bring a Trailer", url: "https://x/1", carLine: d.cards[0].carLine, image: null, band: null, bandNow: null, poolN: 14 };
  const msg = WT.messageFor({ id: "w1", kind: "spec", label: "1987 Pontiac Firebird", spec: {} }, [ev], { first: true, now: new Date() });
  ok("the watch email names the sale by the engine's line and holds no scraped word", JSON.stringify(msg).includes("1987 Pontiac Firebird") && !leaks(msg), JSON.stringify(msg).slice(0, 160));
  { const ev2 = { ...ev, key: "s:2", carLine: "1987 Pontiac Firebird Trans Am", title: "SCRAPED " + MARK }, m2 = WT.messageFor({ id: "w2", kind: "spec", label: "Pontiac Firebird", spec: {} }, [ev2], { first: true, now: new Date() }), line = JSON.stringify(m2);
    { const ev3 = { ...ev2, key: "s:3", url: "https://x/3", carLine: "1987 Pontiac Firebird GTA", title: "SCRAPED " + MARK }, m3 = WT.messageFor({ id: "w3", kind: "spec", label: "Pontiac Firebird", spec: {} }, [ev2, ev3], { first: true, now: new Date() }), t3 = JSON.stringify(m3);
      ok("a watch email with two sales names each by its own carLine and holds no scraped word", t3.includes("1987 Pontiac Firebird Trans Am") && t3.includes("1987 Pontiac Firebird GTA") && !t3.includes("SCRAPED") && !t3.includes(MARK), t3.slice(0, 300)); }
    ok("the watch email's sale line is the event's own carLine (a line that differs from the Task's label), never the scraped title", String(m2.subject).includes("1987 Pontiac Firebird Trans Am just sold") && !line.includes("SCRAPED") && !line.includes(MARK), line.slice(0, 700)); }
  ok("the watch events are built from the card's carLine (no title field)", /carLine: c\.carLine \|\| ""/.test(read("lib/live/watches.js")) && !/title: c\.title \|\| ""/.test(read("lib/live/watches.js")));
}

// 4. THE VIN PAGE'S BUYER'S FEE COMES FROM THE ENGINE, THE PAGE WORKS OUT NOTHING
{ const hist = read("api/history.js");
  ok("the VIN page holds no fee table and no fee arithmetic (no FEES, withFee, 0.05, 0.045, Math.min with a cap)", !/\bFEES\b|\bwithFee\(|0\.045|0\.05\b|Math\.min\(f\[2\]/.test(hist));
  ok("the VIN page prints the engine's withFeeLine", /a\.withFeeLine/.test(hist));
  if (has("lib/buyerFee.js")) {
    const BF = await imp("lib/buyerFee.js");
    ok("the engine's fee words: BaT 5% ($20,000 reads $21,000), the $250 floor, the $7,500 cap, Cars & Bids 4.5% and its $4,500 cap", BF.withFeeLineOf("Bring a Trailer", 20000) === "$21,000 with buyer's fee" && BF.withFeeLineOf("Bring a Trailer", 2000) === "$2,250 with buyer's fee" && BF.withFeeLineOf("Bring a Trailer", 200000) === "$207,500 with buyer's fee" && BF.withFeeLineOf("Cars & Bids", 50000) === "$52,250 with buyer's fee" && BF.withFeeLineOf("Cars & Bids", 200000) === "$204,500 with buyer's fee", [BF.withFeeLineOf("Bring a Trailer", 20000), BF.withFeeLineOf("Cars & Bids", 200000)]);
    ok("no fee words for a house with no published fee, a native-currency price, or no price", BF.withFeeLineOf("Mecum", 50000) === null && BF.withFeeLineOf("Bring a Trailer", 20000, 15000) === null && BF.withFeeLineOf("Bring a Trailer", null) === null);
    // the data layer serves it on each sale appearance (a fake vin_index read)
    const HD = await imp("api/_historyData.js"), prevFetch = globalThis.fetch;
    globalThis.fetch = async u => new Response(String(u).includes("vin_index") ? JSON.stringify([{ appearance_date: "2024-05-01", source: "bringatrailer", url: "https://x/a", listing_title: "2002 BMW Z8 " + MARK, make: "BMW", model: "Z8", model_family: "Z8", vehicle_type: "car", year: 2002, mileage: 20000, result: "sold", price_usd: 20000, currency: "USD", country: "US", photo_url: null }, { appearance_date: "2023-05-01", source: "mecum", url: "https://x/b", listing_title: "2002 BMW Z8", make: "BMW", model: "Z8", model_family: "Z8", vehicle_type: "car", year: 2002, mileage: 20000, result: "sold", price_usd: 20000, currency: "USD", country: "US", photo_url: null }]) : "[]", { status: 200, headers: { "content-type": "application/json" } });
    const got = await HD.vinAppearances({ supabaseUrl: "https://fake.example", supabaseKey: "k" }, "WBAEJ1344YLH00000").catch(e => ({ err: String(e) }));
    globalThis.fetch = prevFetch;
    const a = (got.appearances || []);
    ok("each sale appearance carries withFeeLine from the engine (BaT $21,000; Mecum none)", a.length === 2 && a.find(x => /bring/i.test(x.house || "")) && a.find(x => /bring/i.test(x.house || "")).withFeeLine === "$21,000 with buyer's fee" && a.find(x => /mecum/i.test(x.house || "")).withFeeLine === null, a.map(x => [x.house, x.withFeeLine]));
    { globalThis.fetch = async u => new Response(String(u).includes("sales_archive") ? JSON.stringify([{ vin_norm: "WBAEJ1344YLH00000", sale_date: "2024-05-01", sale_price: 20000, sale_price_usd: 20000, platform: "Bring a Trailer", listing_title: "2002 BMW Z8", year: 2002, make: "BMW", model: "Z8", model_family: "Z8", mileage: 20000, currency: "USD", url: "https://x/a" }]) : "[]", { status: 200, headers: { "content-type": "application/json" } });
      const g2 = await HD.vinAppearances({ supabaseUrl: "https://fake.example", supabaseKey: "k" }, "WBAEJ1344YLH00000").catch(e => ({ err: String(e) })); globalThis.fetch = prevFetch;
      ok("the archive read (no index row) carries withFeeLine from the engine too ($21,000 for a $20,000 BaT hammer)", g2.source === "archive" && (g2.appearances || []).length === 1 && g2.appearances[0].withFeeLine === "$21,000 with buyer's fee", g2); }
  } else ok("lib/buyerFee.js exists", false);
}

// 2. THE LIVE SHAPES (order bc85 item 7; scripts/fixtures/saleNameLive.json, read from production Nov 19 2026: year, make, model, the reader's variant, source, hammer and age of every sold Firebird 1986 to 1988, Silver Spur 1988 to 1992 and Z8 2000 to 2003)
// The archive is rebuilt from those rows (each listing title carries the marker and the selling words, plus the variant words the reader named); every card of the engine's answer for a typical year of each family is named by the engine alone.
{ const LIVE = JSON.parse(read("scripts/fixtures/saleNameLive.json")).families, LABEL = { bringatrailer: "Bring a Trailer", carsandbids: "Cars & Bids", hagerty: "Hagerty", barrettjackson: "Barrett-Jackson", rmsothebys: "RM Sotheby's", themarket: "The Market", bonhams: "Bonhams", collectingcars: "Collecting Cars", pcarmarket: "PCARMarket", mecum: "Mecum", gooding: "Gooding & Co", broadarrow: "Broad Arrow", sothebysmotorsport: "Sotheby's Motorsport", acc: "All Collector Cars", carandclassic: "Car & Classic" };
  const VW = { "Trans Am": "Trans Am", GTA: "Trans Am GTA", Formula: "Formula", Base: "" };
  for (const [id, text, v, model] of [["pontiac-firebird", "1987 Pontiac Firebird", { year: 1987, make: "Pontiac", model: "Firebird" }, "Firebird"], ["rolls-royce-silver-spur", "1990 Rolls-Royce Silver Spur", { year: 1990, make: "Rolls-Royce", model: "Silver Spur" }, "Silver Spur"], ["bmw-z8", "2002 BMW Z8", { year: 2002, make: "BMW", model: "Z8" }, "Z8"]]) {
    const F = LIVE[id], rows = F.sales.filter(x => x.hammerUsd > 0).map((x, i) => { const rid = "ln" + (seq++), words = x.variant ? (VW[x.variant] != null ? VW[x.variant] : x.variant) : "", title = `${x.year} ${x.make} ${x.model}${words ? " " + words : ""} ${MARK} ${SCRAPED}`, raw = { id: rid, title, featured_image_url: x.hasPhoto ? "https://img.example/" + rid + ".jpg" : null, mileage: String(20000 + i * 137), body_style: x.body || "Coupe", modifications: null, currency: "USD", transmission: "Manual (5-Speed)", exterior_color: "Red", title_status: "Clean", url: "https://src.example/" + rid, source_url: "https://src.example/" + rid, city: "Austin", state: "TX", country_code: "US" };
      return { id: rid, source_id: rid, sale_price: x.hammerUsd, sale_date: new Date(Date.now() - Math.max(5, Math.min(500, x.ageDays)) * DAY).toISOString().slice(0, 10), platform: LABEL[x.source] || x.source, listing_title: title, year: x.year, make: x.make, model: x.model, vin_norm: null, stated_mileage: null, project_flag: x.projectFlag || null, desc_facts: null, has_reserve: false, raw_record: raw, vehicle_type: "car" }; });
    install(model, rows); w.deps.resolveVehicle = async () => ({ status: "valid", vehicle: { ...v } });
    const d = (await OB.oneEngineAnswer({ ...v }, null, text, { ...w.env, asked: 2 })).raw, all = [...(d.cards || []), ...(d.setAsideRows || []), ...(d.belowRangeSales || []), ...(d.aboveRangeSales || [])];
    const wantName = { "pontiac-firebird": "Pontiac Firebird", "rolls-royce-silver-spur": "Rolls-Royce Silver Spur", "bmw-z8": "BMW Z8" }[id];
    ok(`live shape ${id} (${rows.length} recorded sales): the engine answered with cards from them`, (d.cards || []).length >= 8, { tier: d.tier, n: (d.cards || []).length });
    ok(`live shape ${id}: every card is named by the engine (year, the family's name as the archive spells it, the variant the reader gave) and the name holds no listing word`, all.length > 0 && all.every(x => Number(x.year) > 0 && String(x.carName).startsWith(wantName) && String(x.carLine).startsWith(x.year + " " + wantName) && !leaks(x.carLine) && !leaks(x.carName)), all.slice(0, 2).map(x => [x.year, x.carName, x.carLine]));
    if (id === "pontiac-firebird") ok("live shape Firebird: the variants the cards carry are the recorded ones (GTA, Trans Am, Formula, Base)", ["GTA", "Trans Am", "Formula", "Base"].every(n => all.some(x => x.variantLabel === n)) || ["GTA", "Trans Am", "Formula"].every(n => (d.rawPool || []).length === 0 || all.some(x => x.variantLabel === n)), [...new Set(all.map(x => x.variantLabel))]);
    ok(`live shape ${id}: every house venue in the recorded sales prints its own name on its card, never "others" or a slug`, all.every(x => !x.venue && !x.platform || !/^(others?|[a-z]{6,})$/.test(String(x.platformName || x.venue || x.platform || "Bring a Trailer"))), all.slice(0, 3).map(x => x.platformName || x.venue || x.platform)); }
}
console.log(`saleNameCheck: ${pass} pass, ${fail} FAIL` + (fail ? "\n" + fails.map(f => "  FAIL " + f).join("\n") : ""));
process.exit(fail ? 1 : 0);

function mutants() {
  const SRC = path.resolve(args.find(a => !a.startsWith("--")) || path.join(here, ".."));
  const COPY = fs.mkdtempSync(path.join(path.dirname(SRC), "goasksam-b-snmut-"));
  const cp = spawnSync("sh", ["-c", `cd "${SRC}" && for d in lib api public data scripts package.json; do cp -R "$d" "${COPY}/" 2>/dev/null; done; ln -s "${SRC}/node_modules" "${COPY}/node_modules"`]);
  const rd = f => fs.readFileSync(path.join(COPY, f), "utf8"), wr = (f, s) => fs.writeFileSync(path.join(COPY, f), s);
  const MUT = [
    ["the carLine is built from the listing title again", "lib/onebox.js", s => s.replace("carLine: line || saleLineOf(year, carName, variantLabel), ...trust };", "carLine: String(r.raw_title || r.rtitle || r.listing_title || \"\"), ...trust };")],
    ["the year is read from the title, not the archive's year column", "lib/onebox.js", s => s.replace("const year = Number(r.year) > 0 ? Number(r.year) : null; let carName", "const year = Number((/\\b(19|20)\\d{2}\\b/.exec(String(r.raw_title || \"\")) || [])[0]) || null; let carName")],
    ["the variant is repeated after a name that already ends with it", "lib/onebox.js", s => s.replace("const v = variantLabel && !String(carName || \"\").toLowerCase().endsWith(String(variantLabel).toLowerCase()) ? variantLabel : null;", "const v = variantLabel || null;")],
    ["a sale with no year reads 'null' in the line", "lib/onebox.js", s => s.replace("return [Number(year) > 0 ? Number(year) : null, carName, v].filter(Boolean).join(\" \") || null;", "return [Number(year) > 0 ? Number(year) : \"null\", carName, v].filter(Boolean).join(\" \") || null;")],
    ["the body word is put inside the line", "lib/onebox.js", s => s.replace("function shapeCards(rows) {\n  return rows.map(r => ({\n    ...saleNameFields(r), bodyWord: saleBodyWord(r),", "function shapeCards(rows) {\n  return rows.map(r => ({\n    ...(() => { const n = saleNameFields(r), b = saleBodyWord(r); return { ...n, carLine: String(n.carLine) + (b ? \" \" + b : \"\") }; })(), bodyWord: saleBodyWord(r),")],
    ["the wire keeps the sale's title", "lib/onebox.js", s => s.replace("if (\"title\" in v && isSaleShape(v)) delete v.title;", "")],
    ["the wire keeps the archive's raw title columns", "lib/onebox.js", s => s.replace("for (const k of SCRAPED_KEYS) if (k in v) delete v[k];", "")],
    ["the handler serves the answer without the scrub", "api/sellerDecision.js", s => s.replace("...servedCopy(slimAnswerForWire(oneBox)), ...staleFields", "...slimAnswerForWire(oneBox), ...staleFields")],
    ["Market Check's page prints the card's title again", "public/js/onebox.js", s => s.replace("function thinTileHtml(c, asideLabel) {\n    var href = utmUrl(c.url);\n    var title = (c.carLine || \"\");", "function thinTileHtml(c, asideLabel) {\n    var href = utmUrl(c.url);\n    var title = cleanReceiptTitle(c.title);")],
    ["Market Check's page prints a house receipt's title again", "public/js/onebox.js", s => s.replace("title: rc.carLine || \"\",", "title: cleanReceiptTitle(shortCarName(rc.title)),")],
    ["Sell's list prints the title again", "lib/sellsForCard.js", s => s.replace("String(c.carLine || \"\").trim()", "String(c.title || \"\").trim()")],
    ["Sell's card answer drops the line", "lib/sell/sellFacts.js", s => s.replace("rangeLabel: c.rangeLabel || null, year: c.year ?? null, carName: c.carName ?? null, variantLabel: c.variantLabel ?? null, carLine: c.carLine ?? null,", "rangeLabel: c.rangeLabel || null, title: c.title || null,")],
    ["the tool's closest sale is named by a title again", "lib/tools/marketCheck.js", s => s.replace("carLine: closestRaw.carLine || spec,", "title: closestRaw.title || spec,")],
    ["a partner row is named by the title", "lib/placedSale.js", s => s.replace("String((r && r.carLine) || \"\").trim()", "String((r && (r.title || r.carLine)) || \"\").trim()")],
    ["the watch email's subject names the sale from the title", "lib/live/watches.js", s => s.replace("const nm = evs[0].carLine || \"car\";", "const nm = carName(evs[0].title);")],
    ["the watch email's card names the sale from the title", "lib/live/watches.js", s => s.replace("title = String(e.carLine || humanTitle(", "title = String(carName(e.title) || humanTitle(")],
    ["the VIN page works out the fee itself again", "api/history.js", s => s.replace("function salePriceFee(a) { return salePrice(a) + (a.withFeeLine ? ` (${a.withFeeLine})` : \"\"); }", "const FEES = { \"Bring a Trailer\": [0.05, 250, 7500] };\nfunction salePriceFee(a) { const f = FEES[a.house]; return salePrice(a) + (f && a.priceUsd ? ` ($${a.priceUsd + Math.min(f[2], Math.max(f[1], Math.round(a.priceUsd * f[0])))} with buyer's fee)` : \"\"); }")],
    ["the fee table's cap is dropped", "lib/buyerFee.js", s => s.replace("Math.min(f[2], Math.max(f[1], Math.round(Number(priceUsd) * f[0])))", "Math.max(f[1], Math.round(Number(priceUsd) * f[0]))")],
    ["a native-currency price gets the fee", "lib/buyerFee.js", s => s.replace("|| nativePrice) return null", ") return null")],
    ["the appearances are served without the fee words", "api/_historyData.js", s => s.replace("appearances: out.map(a => ({ ...a, ...feeFieldsOf(a) }))", "appearances: out")],
  ];
  let bad = 0;
  for (const [name, file, fn] of MUT) {
    const orig = rd(file), next = fn(orig);
    if (next === orig) { console.log("STALE MUTANT (no change): " + name); bad++; continue; }
    wr(file, next);
    const r = spawnSync("node", [path.join(COPY, "scripts/saleNameCheck.mjs"), COPY], { encoding: "utf8", timeout: 240000 });
    wr(file, orig);
    const killed = r.status !== 0; console.log((killed ? "killed   " : "SURVIVED ") + name); if (!killed) bad++;
  }
  fs.rmSync(COPY, { recursive: true, force: true });
  console.log(bad ? `${bad} mutant(s) survived or stale` : `all ${MUT.length} mutants killed`);
  return bad ? 1 : 0;
}
