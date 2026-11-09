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
    [FE, "export const isCarRow = row => !!row && ", "export const isCarRow = row => true || ", "(5) a motorcycle or a part can be an example"],
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
  ok("(6) venue and timing are the listing's own: the venue name, and ends in N days or live now", items.every(i => /^(Bring a Trailer|Cars & Bids|RM Sotheby's|PCarMarket|Hemmings)/.test(i.venue) && /^(Ends in \d+ days?|Live now)$/.test(i.timing)), JSON.stringify(items.map(i => [i.venue, i.timing])));
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
ok("(7) zero requests left the fake database", ocdCalls === 0, String(ocdCalls));
console.log(`\nfindIntelCheck: ${n - failed} pass, ${failed} FAIL`); process.exit(failed ? 1 : 0);
