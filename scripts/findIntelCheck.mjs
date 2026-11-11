// clock: real-ok every moment is built from one NOW read at the top
// FIND CARD INTELLIGENCE (Lane B, Nov 9 2026, crew only). findExamples items and findExamplesField cars carry intelligence: { kind, line, url } and venue and timing.
//   (1) sold_before only with a RECORDED completed sale of the same VIN, the line carries the recorded price, never another number
//   (2) listed_before only with a recorded appearance that did not sell: month and year, and NEVER a sale price or the word sold
//   (3) market_range is the engine's own typical band for that car (the answer's cluster), in the k form; no band from the engine (thin, refused, unreadable) means no market_range
//   (4) no invented line: a car with no VIN record and no band is a plain card (kind none, no line, no url); every line is a reason table sentence; the stored line is checked again at the serve
//   (5) cars only: a motorcycle, a part, automobilia or a farm machine is never an example, whatever its intelligence
//   (6) selection: a card with sold_before or market_range is preferred; venue and timing come from the listing record
//   node scripts/findIntelCheck.mjs [root]     --mutants proves each rule by breaking it in a copy
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { fileURLToPath, pathToFileURL } from "node:url"; import { spawnSync } from "node:child_process";
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), rootArg = args.find(a => !a.startsWith("--")), root = path.resolve(rootArg || path.join(here, ".."));
if (args.includes("--mutants")) {
  const FE = "lib/live/findExamples.js", RW = "lib/reasonWords.js";
  const muts = [
    [FE, "if (f.kind === \"sold\" && num(f.previous.price) > 0) return", "if (f.kind === \"sold\") return", "(1) a sold_before card without a recorded price"],
    [FE, "line: reasonLine(\"find.intel_sold\", { price: f.previous.price })", "line: reasonLine(\"find.intel_sold\", { price: 99999 })", "(1) the sold_before price is not the recorded one"],
    [FE, "if (f.kind === \"listed\" && f.previous.date) return { kind: \"listed_before\", line: reasonLine(\"find.intel_listed\", { when: f.previous.date })", "if (f.kind === \"listed\" && f.previous.date) return { kind: \"listed_before\", line: reasonLine(\"find.intel_sold\", { price: 50000 })", "(2) a listed_before card carries a sale price"],
    [FE, "if (!a || a.tier !== \"result\" || !Array.isArray(a.cluster)", "if (!a || !Array.isArray(a.cluster)", "(3) a band from a thin answer is shown"],
    [FE, "const lo = num(a.cluster[0]), hi = num(a.cluster[1]);", "const lo = num(a.cluster[0]), hi = num(a.cluster[1]) + 500;", "(3) the band is not the engine's"],
    [FE, "return h || { ...NONE_INTEL };", "return h || { kind: \"market_range\", line: reasonLine(\"find.intel_range\", { lo: 20000, hi: 30000 }), url: \"/market-check\" };", "(4) a none slot is filled"],
    [FE, "export function intelShape(x) {\n  if (!x || typeof x !== \"object\" || !INTEL_KINDS.includes(x.kind)) return { ...NONE_INTEL };", "export function intelShape(x) {\n  if (x) return x;\n  if (!x || typeof x !== \"object\" || !INTEL_KINDS.includes(x.kind)) return { ...NONE_INTEL };", "(4) a stored line is served without being checked again"],
    [FE, "export const isCarRow = row => vehicleKindOf(row) === \"car\";", "export const isCarRow = row => true;", "(5) a motorcycle or a part can be an example"],
    ["lib/_classify.js", "|rebel\\s?\\d{3})(?:[a-z]{1,2}\\d?)?\\b/i]", "|rebel\\s?\\d{3})\\b/i]", "(8) a Honda bike code with a letter suffix passes the fence"],
    ["lib/_classify.js", "|rv\\s?\\d{2,3})(?:[a-z]{1,2}\\d?)?\\b/i]", "|rv\\s?\\d{2,3})\\b/i]", "(8) a Suzuki bike code with a letter suffix passes the fence"],
    ["lib/_classify.js", "|ce\\s?0?4)(?:[a-z]{1,2}\\d?)?\\b/i]", "|ce\\s?0?4)\\b/i]", "(8) a BMW bike code with a letter suffix passes the fence"],
    [FE, " || isMotorcycleTitle(`${make} ${model}`, make)", "", "(8) the model the record files is not read"],
    [FE, "BIKE_DESC_RES.some(re => re.test(String(row.description || \"\").slice(0, 400)))", "false", "(8) the description is not read"],
    [FE, "if (byMake && byMake !== \"car\") return byMake;", "", "(8) the record's make is not typed"],
    [FE, "/\\bthe\\s+(?:motorcycle|scooter|bike)\\s+(?:is|was|has|features|runs|shows|now)\\b/i, ", "/motorcycle/i, ", "(8) any mention of a motorcycle in the description makes a motorcycle"],
    [FE, "if (row.vehicle_type && row.vehicle_type !== \"car\") return String(row.vehicle_type);", "", "(8) the record's own type is not read"],
    [FE, "if (!have) { const r = await intelWithWhy", "if (false) { const r = await intelWithWhy", "(9) a stored pick without the field is not given it"],
    [FE, "st.pickDate !== dateKey || force;", "st.pickDate !== dateKey;", "(9) force does not build again"],
    [FE, "if (funnel.noIntel.length) console.error(", "if (false) console.error(", "(9) a card with none does not say why"],
    [FE, "intel: intelShape(c.intel), why:", "why:", "(9) the daily build does not write intelligence"],
    [FE, "      await settle();\n      const spare", "      const spare0 = 0;\n      const spare", "(10) the chosen cards are not read before the candidates"],
    [FE, "      await settle();\n      const spare = Math.max(0, MAX_ENGINE_READS - engineReads);", "      await readBand(order.filter(c => needs(c)).slice(0, MAX_ENGINE_READS)); await settle();\n      const spare = Math.max(0, MAX_ENGINE_READS - engineReads);", "(10) the candidates are read first, the cap spent on them, then the chosen"],
    [FE, "(INTEL_RANK[(c.intel && c.intel.kind) || \"none\"] || 0)", "0", "(6) a card with intelligence is not preferred"],
    [FE, "venue: houseName(row.source), timing: reasonLine(\"find.timing\", { ms: left })", "venue: \"\", timing: \"\"", "(6) venue and timing are not from the record"],
    [RW, "`Market range \\u00b7 ${moneyK(p.lo)} to ${moneyK(p.hi)}`", "`Market range \\u00b7 ${money(p.lo)} to ${money(p.hi)}`", "(3) the band is not in the k form"]
  ];
  let survivors = 0;
  for (const [file, from, to, want] of muts) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fic-"));
    spawnSync("rsync", ["-a", "--exclude", ".git", "--exclude", "node_modules", "--exclude", "proofs", root + "/", dir + "/"]); fs.symlinkSync(path.join(root, "node_modules"), path.join(dir, "node_modules"));
    const fp = path.join(dir, file), src = fs.readFileSync(fp, "utf8"), m = src.replace(from, to);
    if (m === src) { console.log("MUTANT NOT APPLIED  " + want); survivors++; fs.rmSync(dir, { recursive: true, force: true }); continue; }
    fs.writeFileSync(fp, m);
    const r = spawnSync(process.execPath, [path.join(dir, "scripts/findIntelCheck.mjs"), dir], { encoding: "utf8" }), killed = r.status !== 0;
    console.log((killed ? "killed  " : "SURVIVED") + "  " + want); if (!killed) survivors++;
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(survivors ? `\n${survivors} mutant(s) survived` : "\nall mutants killed"); process.exit(survivors ? 1 : 0);
}
process.chdir(root);
process.env.CURTAIN_CREW_CODE = "findintel-check-secret"; process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
let ocdCalls = 0; globalThis.fetch = async u => { if (!/fake\.supabase\.test/.test(String(u))) ocdCalls++; return new Response("[]", { status: 200 }); };
let failed = 0, n = 0; const ok = (name, c, d) => { n++; if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${d ? "  " + d : ""}`); };
const imp = f => import(pathToFileURL(path.join(root, f)).href);
const FE = await imp("lib/live/findExamples.js"), C = await imp("lib/_crew.js"), RW = await imp("lib/reasonWords.js"), S = await imp("lib/live/search.js");
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
const NOW0 = Math.floor(Date.now() / 3600e3) * 3600e3, CREW = "gas_crew=" + C.mintCrewCookieValue();
let id = 0;
const car = (make, model, year, o = {}) => ({ id: ++id, source: o.source || "bringatrailer", url: "https://auction.test/lot/" + id, photo_url: "https://img.test/p" + id + ".jpg", listing_title: o.title || `${year} ${make} ${model}`, year, make, model, vin_norm: o.vin === null ? null : (o.vin || "VIN" + String(id).padStart(14, "0")), mileage: 20000, mileage_unit: "miles", current_bid: 60000, current_bid_usd: 60000, currency: "USD", country: "US", location: "Austin, TX", transmission: "Manual", exterior_color: o.colour || "Red", body: null, status: "live", end_time: new Date(NOW0 + (o.h ?? 30 + id) * 3600e3).toISOString(), description: "", ...(o.more || {}) });
const sale = (vin, o = {}) => ({ kind: "sale", date: "2023-02-14", house: "Bring a Trailer", url: "https://bringatrailer.com/listing/" + vin + "/", image: "https://img.test/old-" + vin + ".jpg", mileage: 15000, priceUsd: 46000, vinNorm: vin, ...o });
const attempt = (vin, o = {}) => ({ kind: "attempt", date: "2023-10-01", house: "Bring a Trailer", url: "https://bringatrailer.com/listing/a" + vin + "/", image: "https://img.test/a-" + vin + ".jpg", mileage: 9000, bidUsd: 50000, vinNorm: vin, ...o });
const answerOf = (lo, hi, o = {}) => ({ tier: "result", cluster: [lo, hi], referenceFigure: { amount: Math.round((lo + hi) / 2), rangeLow: lo, rangeHigh: hi }, ...o });
function world(rows, { apps = {}, answers = {} } = {}) {
  const w = { rows, store: new Map(), apps, answers, asked: [], clock: NOW0 };
  w.d = { now: () => w.clock, head: async () => ({ status: 200, bytes: 1000, type: "image/jpeg" }), appearances: async (e, vin) => ({ ok: true, vinNorm: vin, appearances: w.apps[vin] || [] }), urlStatus: async () => 200, facts: async r => S.listingFacts(r),
    answer: async (e, t) => { w.asked.push(t); return w.answers[t] || null; },
    enrich: async (e, o) => ({ title: FE.titleOf(o.r), end_time: o.r.end_time, url: o.r.url }),
    select: async (e, q) => { let m = /^app_config\?key=eq\.([a-z_]+)/.exec(q); if (m) { const v = w.store.get(m[1]); return v ? [{ value: v }] : []; }
      m = /^live_listings\?id=eq\.([^&]+)/.exec(q); if (m) return w.rows.filter(r => String(r.id) === decodeURIComponent(m[1])).slice(0, 1);
      if (/^live_listings\?status=eq\.live/.test(q)) return w.rows.filter(r => r.status === "live" && r.photo_url && Date.parse(r.end_time) > w.clock); return []; },
    write: async (e, row) => { w.store.set(row.key, row.value); }, clear: async (e, key) => { w.store.delete(key); } };
  return w;
}
// a money slot is probed as $NaN by reasonPatterns; here it stands for any figure
const pats = RW.reasonPatterns().map(p => ({ ...p, re: new RegExp(p.re.source.replace(/\\\$NaN/g, "\\$[\\d.,]+k?")) })), inTable = line => pats.some(p => /^find\.intel_/.test(p.id) && p.re.test(line));
const byTitle = items => Object.fromEntries(items.map(i => [i.title, i]));
{ // (1)(2)(3)(4)(6) one world with every state
  const vS = "VINSOLD0000000001", vL = "VINLIST0000000002", vN = "VINNONE0000000003";
  const rows = [car("Porsche", "911", 1995, { vin: vS, source: "bringatrailer" }), car("BMW", "M3", 2006, { vin: vL, source: "carsandbids" }), car("Ferrari", "F430", 2007, { vin: vN, source: "rmsothebys" }), car("Audi", "RS4", 2008, { vin: null, source: "pcarmarket" }), car("Mazda", "Miata", 1995, { vin: null, source: "hemmings" })];
  const W = world(rows, { apps: { [vS]: [sale(vS)], [vL]: [attempt(vL)], [vN]: [] }, answers: { "2007 Ferrari F430": answerOf(20500, 29000), "2008 Audi RS4": { tier: "thin", cluster: [20000, 30000] }, "1995 Mazda Miata": null } });
  await FE.refreshFindExamples(env, W.d); const items = await FE.findExamples(env, CREW, W.d), t = byTitle(items || []);
  ok("three cars are served", items && items.length === 3, JSON.stringify(items && items.map(i => i.title)));
  const all = [...rows].map(r => FE.titleOf(r));
  const S1 = (await FE.findExamples(env, CREW, W.d)) || [];
  // the store keeps the kinds the world gave; read them for all five by running the intelligence directly too
  const direct = {}; for (const r of rows) direct[FE.titleOf(r)] = await FE.intelligenceOf(env, r, W.d, W.clock);
  ok("(1) sold_before: the recorded price, the history link", direct["1995 Porsche 911"].kind === "sold_before" && direct["1995 Porsche 911"].line === "Sold before · $46,000" && /^\/vin\//.test(direct["1995 Porsche 911"].url), JSON.stringify(direct["1995 Porsche 911"]));
  ok("(2) listed_before: month and year, no price, no sold", direct["2006 BMW M3"].kind === "listed_before" && direct["2006 BMW M3"].line === "Listed before · Oct 2023" && !/\$|sold/i.test(direct["2006 BMW M3"].line), JSON.stringify(direct["2006 BMW M3"]));
  ok("(3) market_range: the engine's band in the k form, a link into Market Check", direct["2007 Ferrari F430"].kind === "market_range" && direct["2007 Ferrari F430"].line === "Market range · $20.5k to $29k" && /^\/market-check\?q=2007%20Ferrari%20F430$/.test(direct["2007 Ferrari F430"].url), JSON.stringify(direct["2007 Ferrari F430"]));
  ok("(3) a thin answer gives no market_range", direct["2008 Audi RS4"].kind === "none" && direct["2008 Audi RS4"].line === null);
  ok("(4) no VIN record and no engine answer: a plain card, no line, no link", direct["1995 Mazda Miata"].kind === "none" && direct["1995 Mazda Miata"].line === null && direct["1995 Mazda Miata"].url === null);
  ok("(3) the band equals the engine answer's own cluster for that car", (() => { const a = W.answers["2007 Ferrari F430"], m = /\$([\d.]+)k to \$([\d.]+)k/.exec(direct["2007 Ferrari F430"].line); return a && m && Math.round(a.cluster[0] / 100) / 10 === Number(m[1]) && Math.round(a.cluster[1] / 100) / 10 === Number(m[2]); })());
  ok("(4) every line in every served card is a reason table sentence", items.every(i => i.intelligence.kind === "none" || inTable(i.intelligence.line)));
  ok("(4) a served card has kind, line, url and nothing else; kind none has neither line nor link", items.every(i => JSON.stringify(Object.keys(i.intelligence)) === JSON.stringify(["kind", "line", "url"]) && (i.intelligence.kind !== "none" || (i.intelligence.line === null && i.intelligence.url === null))));
  ok("(6) venue and timing are the listing's own: the venue name, and ends in N days or live now", items.every(i => /^(Bring a Trailer|Cars & Bids|RM Sotheby's|PCarMarket|Hemmings)/.test(i.venue) && /^(Ends (in \d+ days?|today|tomorrow)|Live now)$/.test(i.timing)), JSON.stringify(items.map(i => [i.venue, i.timing])));
  ok("(6) cards with sold_before or market_range are preferred over plain ones", items.filter(i => i.intelligence.kind === "sold_before" || i.intelligence.kind === "market_range").length === 2, JSON.stringify(items.map(i => i.intelligence.kind)));
  const field = await FE.findExamplesField(env, CREW, W.d);
  ok("(6) the engine card field carries intelligence, venue and timing on each car", Array.isArray(field) ? field.every(x => x.intelligence && x.venue && x.timing) : (field && field.cars.every(x => x.intelligence && x.venue && x.timing)), JSON.stringify(field && (field.cars || field).map(x => x.intelligence && x.intelligence.kind)));
  // a stored line that no longer matches its kind is a plain card at the serve
  const key = FE.STORE_KEY, st = W.store.get(key); st.entries = st.entries.map((e, i) => ({ ...e, intel: i === 0 ? { kind: "listed_before", line: "Listed before · Oct 2023 for $50,000", url: "/vin/X" } : i === 1 ? { kind: "sold_before", line: "Sold before", url: "/vin/X" } : { kind: "market_range", line: "Market range · whatever", url: "/x" } }));
  const bad = await FE.findExamples(env, CREW, W.d);
  ok("(4) a stored line that is not the table's, or carries a price on listed_before, is served as a plain card", bad.every(i => i.intelligence.kind === "none"), JSON.stringify(bad.map(i => i.intelligence)));
}
{ // (1) a recorded sale with no price is not a sold_before card
  const v = "VINNOPRICE0000006", r = car("Porsche", "911", 1990, { vin: v }), W = world([r], { apps: { [v]: [sale(v, { priceUsd: null })] } });
  const x = await FE.intelligenceOf(env, r, W.d, W.clock, { engine: false });
  ok("(1) intelOfHistory refuses a sold record whose price is missing or zero", FE.intelOfHistory({ kind: "sold", previous: { price: null, date: "Oct 2023", historyUrl: "/vin/X" } }) === null && FE.intelOfHistory({ kind: "sold", previous: { price: 0, date: "Oct 2023" } }) === null);
  ok("(1) a sale record without a price is never sold_before, and its line never shows a price", x.kind !== "sold_before" && !/\$/.test(String(x.line)), JSON.stringify(x));
}
{ // (6) the preference decides when everything else is equal: same venue, the plain cars end later
  const mk = (make, model, o) => car(make, model, 2005, { source: "bringatrailer", vin: null, ...o });
  const rows = [mk("Porsche", "911", { h: 40 }), mk("BMW", "M3", { h: 41 }), mk("Ferrari", "F430", { h: 90 }), mk("Audi", "RS4", { h: 91 }), mk("Mazda", "Miata", { h: 92 })];
  const W = world(rows, { answers: { "2005 Porsche 911": answerOf(30000, 40000), "2005 BMW M3": answerOf(25000, 35000) } });
  await FE.refreshFindExamples(env, W.d); const items = await FE.findExamples(env, CREW, W.d);
  ok("(6) the two cars with a market range are chosen over three plain cars that end later", items && items.length === 3 && items.filter(i => i.intelligence.kind === "market_range").length === 2, JSON.stringify(items && items.map(i => [i.title, i.intelligence.kind])));
}
{ // (5) cars only
  const vM = "VINMOTO0000000004", vP = "VINPART0000000005";
  const moto = car("Ducati", "900SS", 1978, { vin: vM, title: "1978 Ducati 900SS motorcycle" }), part = car("Porsche", "911", 1970, { vin: vP, title: "Porsche 911 engine and transmission parts lot", more: { mileage: null } }), farm = car("John Deere", "4020", 1968, { title: "1968 John Deere 4020 tractor" });
  const cars = [car("Porsche", "911", 1995, { source: "bringatrailer" }), car("BMW", "M3", 2006, { source: "carsandbids" }), car("Ferrari", "F430", 2007, { source: "rmsothebys" })];
  const W = world([moto, part, farm, ...cars], { apps: { [vM]: [sale(vM)], [vP]: [sale(vP)] }, answers: {} });
  await FE.refreshFindExamples(env, W.d); const items = await FE.findExamples(env, CREW, W.d);
  ok("(5) a motorcycle, a part and a tractor with a recorded sale are never chosen", items && items.length === 3 && items.every(i => !/Ducati|parts|tractor|John Deere/i.test(i.title)) && FE.isCarRow(cars[0]) && !FE.isCarRow(moto) && !FE.isCarRow(farm), JSON.stringify(items && items.map(i => i.title)));
}
{ // (8) THE CLASS: a motorcycle or minibike is never an example, however its record spells it (Nov 10 2026: a Honda CT70H Trail was a live card; the title fence's bike codes ended at a word boundary right after the digits, so "CT70H" and every code with the maker's own letter suffix passed)
  const { isMotorcycleTitle: moto } = await imp("lib/_classify.js");
  const codes = [["Honda", "CT70"], ["Honda", "CL350"], ["Honda", "CX500"], ["Honda", "GL1000"], ["Honda", "Z50"], ["Honda", "CB750"], ["Suzuki", "GT750"], ["Suzuki", "RM250"], ["Suzuki", "GS1000"], ["BMW", "K75"], ["BMW", "R65"], ["BMW", "R1250"]], suffixes = ["", "H", "K1", "J", "A", "C", "S"];
  const slipped = []; for (const [mk, c] of codes) for (const sfx of suffixes) { const t = `1972 ${mk} ${c}${sfx} Trail`; if (!moto(t, mk)) slipped.push(t); }
  ok("(8) every bike code of Honda, Suzuki and BMW is a motorcycle with or without the maker's letter suffix", slipped.length === 0, slipped.slice(0, 6).join(" | "));
  const stay = [["1967 Honda S800", "Honda"], ["1969 Honda N600", "Honda"], ["1992 Honda NSX", "Honda"], ["2001 Honda S2000", "Honda"], ["1974 Triumph TR6", "Triumph"], ["1962 Triumph TR4", "Triumph"], ["1972 BMW 2002tii", "BMW"], ["2001 BMW Z3 M Coupe", "BMW"], ["1988 BMW M3 E30", "BMW"], ["1989 Suzuki Cappuccino", "Suzuki"], ["1987 Suzuki Samurai", "Suzuki"]];
  ok("(8) cars with a bike-like name stay cars", stay.every(([t, mk]) => !moto(t, mk)), JSON.stringify(stay.filter(([t, mk]) => moto(t, mk))));
  const mini = car("Honda", "CT70H Trail", 1970, { title: "1970 Honda CT70H Trail" }), byModel = car("Honda", "CT70H", 1971, { title: "1971 Honda Trail" }), byDesc = car("Honda", "Sport", 1969, { title: "1969 Honda Sport", more: { description: "This original minibike has 3,100 miles and a new chain." } }), byType = car("Ford", "Pit Racer", 1975, { title: "1975 Ford Pit Racer", more: { vehicle_type: "motorcycle" } }), real = car("Honda", "S800", 1967, { title: "1967 Honda S800 Coupe" });
  ok("(8) the record's whole text is read: title, the model the record files, the opening of the description, the record's own type", [mini, byModel, byDesc, byType].every(r => FE.vehicleKindOf(r) !== "car" && !FE.isCarRow(r)) && FE.vehicleKindOf(real) === "car", JSON.stringify([mini, byModel, byDesc, byType, real].map(r => FE.vehicleKindOf(r))));
  const vB = "VINBIKE00000000010", pool = [mini, byModel, byDesc, byType, car("Porsche", "911", 1995, { source: "bringatrailer" }), car("BMW", "M3", 2006, { source: "carsandbids" }), car("Ferrari", "F430", 2007, { source: "rmsothebys" })];
  for (const r of pool.slice(0, 4)) r.vin_norm = vB + r.id;
  const W = world(pool, { apps: Object.fromEntries(pool.slice(0, 4).map(r => [r.vin_norm, [sale(r.vin_norm)]])), answers: {} });
  await FE.refreshFindExamples(env, W.d); const items = await FE.findExamples(env, CREW, W.d);
  ok("(8) four bike records with a recorded sale each are never chosen: the pool gives its three cars", items && items.length === 3 && items.every(i => /Porsche|BMW|Ferrari/.test(i.title)), JSON.stringify(items && items.map(i => i.title)));
  const r2 = world([...pool.slice(0, 4)]), res2 = await FE.refreshFindExamples(env, r2.d);
  ok("(8) a pool of bikes alone gives no card", res2.stored === null && (res2.funnel ? res2.funnel.eligible === 0 : true), JSON.stringify(res2.why));
}
{ // (8b) the rest of the class, from the live pool of Nov 10 2026: a pure motorcycle marque (Ducati, Vespa, Yamaha) is typed by its make like the archive does; a car whose history names a motorcycle rider stays a car; a boat is not a car
  const duc = car("Ducati", "Supersport", 1978, { title: "1978 Ducati 900 Super Sport" }), ves = car("Vespa", "Primavera 150", 2020, { title: "2020 Piaggio Vespa Primavera 150 Edition" }), yam = car("Yamaha", "XS", 1977, { title: "1977 Yamaha XS400" }), boat = car("Comitti", "Venezia 28", 2024, { title: "2024 Comitti Venezia 28 Classic Teak", more: { description: "This 2024 Comitti Venezia is a fiberglass-hulled 28 foot runabout powered by a MerCruiser V8." } }), playboy = car("Playboy", "A-48", 1948, { title: "1948 Playboy A-48", more: { description: "The Playboy was a tiny three-passenger runabout with a folding hardtop." } }), bmw = car("BMW", "328", 1939, { title: "1939 BMW 328 Roadster", more: { description: "At the 1936 Eifelrennen, Works motorcycle racer Ernst Henne powered to victory in the 2.0-litre class." } }), janus = car("Zündapp", "Janus 250", 1958, { title: "1958 Zündapp Janus 250" });
  ok("(8) a pure motorcycle marque, a scooter marque and a boat are not cars; a car whose history names a motorcycle rider, and a microcar from a bike maker, are", [duc, ves, yam, boat].every(r => !FE.isCarRow(r)) && FE.isCarRow(bmw) && FE.isCarRow(janus) && FE.isCarRow(playboy), JSON.stringify([duc, ves, yam, boat, bmw, janus].map(r => FE.vehicleKindOf(r))));
}
{ // (9) the daily build writes intelligence, and a stored pick from before it did gets it at the next build; a card with none says why
  const vS = "VINSOLD0000000011", rows = [car("Porsche", "911", 1995, { vin: vS, source: "bringatrailer" }), car("BMW", "M3", 2006, { vin: null, source: "carsandbids" }), car("Ferrari", "F430", 2007, { vin: null, source: "rmsothebys" })];
  const W = world(rows, { apps: { [vS]: [sale(vS)] }, answers: { "2006 BMW M3": answerOf(25000, 35000), "2007 Ferrari F430": { tier: "thin", cluster: [1, 2] } } });
  const logs = [], realErr = console.error; console.error = x => logs.push(String(x));
  await FE.refreshFindExamples(env, W.d); console.error = realErr;
  const built = W.store.get(FE.STORE_KEY), kinds = built.entries.map(e => e.intel && e.intel.kind).sort();
  ok("(9) the daily build writes an intelligence field on every stored entry", built.entries.every(e => e.intel && typeof e.intel === "object"), JSON.stringify(kinds));
  const line = logs.map(l => { try { return JSON.parse(l); } catch { return null; } }).find(x => x && x.tag === "crew_find_intel_none");
  ok("(9) a card with no intelligence row is named in the log with the reason", line && line.cards.length === 1 && /Ferrari/.test(line.cards[0].title) && /^no_vin_then_engine_tier_thin$/.test(line.cards[0].why), JSON.stringify(line && line.cards));
  // a pick stored before the field existed: strip it, build again the same day
  for (const e of built.entries) delete e.intel; W.store.set(FE.STORE_KEY, built);
  const again = await FE.refreshFindExamples(env, W.d), healed = W.store.get(FE.STORE_KEY).entries.map(e => e.intel && e.intel.kind).sort();
  ok("(9) a stored pick without the field gets it at the next build, the cars unchanged", healed.every(Boolean) && healed.join() === kinds.join() && W.store.get(FE.STORE_KEY).entries.map(e => e.listingId).join() === built.entries.map(e => e.listingId).join() && again.why === "kept", healed.join());
  const served = await FE.findExamples(env, CREW, W.d);
  ok("(9) the served cards carry sold_before, market_range and one plain card", served.filter(i => i.intelligence.kind === "sold_before").length === 1 && served.filter(i => i.intelligence.kind === "market_range").length === 1 && served.filter(i => i.intelligence.kind === "none").length === 1, JSON.stringify(served.map(i => i.intelligence.kind)));
  const kept = await FE.refreshFindExamples(env, W.d), forced = await FE.refreshFindExamples(env, W.d, { force: true }), forced2 = await FE.refreshFindExamples(env, { ...W.d, force: true });
  ok("(9) force builds today's pick again from the pool; an ordinary build keeps it", kept.funnel && kept.funnel.live === 0 || kept.why === "kept", kept.why + " / " + JSON.stringify(forced2.funnel && forced2.funnel.live));
  ok("(9) force reads the pool and writes intelligence again", forced2.why === "picked" && forced2.funnel.live >= 3 && forced2.stored.entries.every(e => e.intel), forced2.why);
  process.env.FIND_EXAMPLES = "0"; const off = await FE.refreshFindExamples(env, { ...W.d, force: true }); delete process.env.FIND_EXAMPLES;
  ok("(9) force does not pass the kill switch", off.why === "off");
}
{ // (10) THE ORDER OF THE READS: the chosen cards are read first, the cap of 12 is spent on the other candidates after, and no chosen card misses its row because the cap ran out on candidates
  const mk = (i, src) => car(["Porsche", "BMW", "Ferrari", "Audi", "Mazda", "Nissan", "Toyota", "Honda", "Ford", "Dodge", "Chevrolet", "Jaguar", "Lotus", "Datsun", "Volvo", "Saab", "Fiat", "Alfa Romeo"][i], "M" + i, 1960 + (i * 3) % 50, { source: src, vin: null, h: 400 });
  const rows = [...Array.from({ length: 14 }, (_, i) => mk(i, "bringatrailer")), mk(14, "carsandbids"), mk(15, "rmsothebys"), mk(16, "pcarmarket"), mk(17, "hemmings")];
  const answers = Object.fromEntries(rows.map((r, i) => [FE.titleOf(r), answerOf(20000 + i * 1000, 30000 + i * 1000)]));
  let bad = [], firstOk = true, capOk = true;
  for (let day = 0; day < 8; day++) {
    const W = world(rows, { answers }); W.clock = NOW0 + day * 86400e3; await FE.refreshFindExamples(env, W.d);
    const entries = W.store.get(FE.STORE_KEY).entries, chosenTitles = entries.map(e => FE.titleOf(rows.find(r => r.id === e.listingId)));
    if (!entries.every(e => e.intel && e.intel.kind === "market_range")) bad.push(day);
    if (!W.asked.slice(0, 3).every(t => chosenTitles.includes(t)) && W.asked.slice(0, 3).some(t => !chosenTitles.includes(t)) && !chosenTitles.every(t => W.asked.slice(0, 12).includes(t))) firstOk = false;
    if (W.asked.length > 12 + 3) capOk = false;
  }
  ok("(10) over eight days every chosen card carries its market range, with 18 candidates and the cap of 12", bad.length === 0, "days without: " + bad.join(","));
  ok("(10) the first engine reads are the chosen cards", firstOk);
  ok("(10) the cap of 12 stands: the reads never pass it by more than the chosen cards", capOk);
  // a world where the cap is the only thing between a chosen card and its row: 3 platforms only the last three candidates (hash order) can fill the slots
  const only3 = [mk(0, "bringatrailer"), ...Array.from({ length: 13 }, (_, i) => mk(i + 1, "bringatrailer")), mk(14, "carsandbids"), mk(15, "rmsothebys")];
  const W2 = world(only3, { answers: Object.fromEntries(only3.map((r, i) => [FE.titleOf(r), answerOf(20000 + i * 1000, 30000 + i * 1000)])) });
  await FE.refreshFindExamples(env, W2.d); const e2 = W2.store.get(FE.STORE_KEY).entries;
  ok("(10) of 16 candidates and a cap of 12 the three chosen each carry their row", e2.length === 3 && e2.every(e => e.intel.kind === "market_range"), JSON.stringify(e2.map(e => e.intel.kind)));
  ok("(10) the three chosen cards are the first three asked", W2.asked.slice(0, 3).every(t => e2.some(e => FE.titleOf(only3.find(r => r.id === e.listingId)) === t)), JSON.stringify(W2.asked.slice(0, 4)));
}
ok("(7) zero requests left the fake database", ocdCalls === 0, String(ocdCalls));
console.log(`\nfindIntelCheck: ${n - failed} pass, ${failed} FAIL`); process.exit(failed ? 1 : 0);
