// BODIES, OPTION ORDER AND THE SET-ASIDE LINE (Lane B, Oct 29 2026, Sam's look at the live 2008 BMW 3-Series Market Check).
// 1. BODY VOCABULARY. The 2008 3-Series showed Coupe 6, Sedan 3, Convertible 14, "4 sales do not say their body", and a Touring and a Sports Wagon in the latest sales: the engine's body words (lib/bodyWords.js) had no wagon, hatchback, SUV, pickup or van, so those
//    sales were counted as not saying their body and the title line ("Convertibles, coupes and sedans") left the wagon out. NOW one vocabulary (whole-word matches, "Touring" a wagon on a BMW or Alpina only) feeds the pool, the matcher and, at read time, the options
//    (a body the titles name that is not an option becomes one on the footer's window) and the title line (every body the pool carries). Real titles below.
// 2. THE SET-ASIDE LINE says the count once: "5 odd sales set aside." / "1 odd sale set aside." (it was "5 sales set aside: 5 odd sales."). One field, setAsideLine; the card prints it; stored rows get it through freshenStoredText.
// 3. OPTION ORDER (mileage bands are the exception since Oct 30 2026: they print ascending, under 50,000, 50,000 to 100,000, over 100,000): options with a range first, largest first; the thin ones ("too few for a range") after, largest first; the option the listing named leads. Ranges are not touched.
//   node scripts/bodiesOrderAsideCheck.mjs [repo root]
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.LAUNCH_STAGE = "2";
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href), B = await import(pathToFileURL(path.join(root, "lib/bodyWords.js")).href), C = await import(pathToFileURL(path.join(root, "lib/sellsForCard.js")).href);
// 1. real titles
const TITLES = [["2008 BMW 335i Touring M Sport", "wagon"], ["2008 BMW 328xi Sports Wagon", "wagon"], ["2013 Audi RS6 Avant", "wagon"], ["2011 Cadillac CTS-V Sport Wagon", "wagon"], ["1999 Mercedes-Benz E320 Estate", "wagon"], ["2014 Ferrari FF Shooting Brake", "wagon"], ["2012 Porsche Panamera Gran Turismo", "hatchback"], ["1991 Honda CRX Hatchback", "hatchback"],
  ["2008 BMW 328i Convertible", "convertible"], ["2008 BMW 335i Coupe", "coupe"], ["2008 BMW 328i Sedan", "sedan"], ["1995 Volkswagen Vanagon Van", "van"], ["2005 Ford F-150 Crew Cab Pickup", "pickup"], ["2018 Land Rover Range Rover SUV", "suv"],
  ["1958 Porsche 356 A 1600 Speedster by Reutter", "speedster"], ["1989 Porsche 911 Speedster", "speedster"], ["2001 Ferrari 550 Barchetta Pininfarina", "roadster"], ["1936 Ford V8 Phaeton", "phaeton"], ["1934 Bentley 3½-Litre All-Weather Tourer by Barker", "touring"], ["1967 Lincoln Continental Executive Limousine by Lehmann-Peterson", "sedan"],   // live titles the bodywords read found unread (Oct 29 2026)
  ["2004 Aston Martin Vanquish", null], ["1961 Ferrari 250 GT Touring Superleggera", null], ["2019 Porsche 911 Carrera T Touring", null], ["Estate sale lot: 1962 Jaguar poster", null]];
for (const [t, want] of TITLES) ok(`"${t}" reads as ${want || "no body"}`, B.bodyFromText(t) === want, String(B.bodyFromText(t)));
// 2. the 2008 3-Series, built from those titles
const sale = (i, title) => ({ id: "s" + i, _usd: 8000 + i * 150, auction_end_date: "2026-0" + (1 + (i % 9)) + "-12", year: 2008, rtitle: title, raw_title: title, mileage: 60000 + i, vin_norm: "WBA" + String(100000 + i) });
let id = 0; const pool = [];
for (let i = 0; i < 14; i++) pool.push(sale(id++, "2008 BMW 328i Convertible")); for (let i = 0; i < 6; i++) pool.push(sale(id++, "2008 BMW 335i Coupe")); for (let i = 0; i < 3; i++) pool.push(sale(id++, "2008 BMW 328i Sedan"));
pool.push(sale(id++, "2008 BMW 335i Touring M Sport"), sale(id++, "2008 BMW 335i Touring"), sale(id++, "2008 BMW 328xi Sports Wagon")); for (let i = 0; i < 4; i++) pool.push(sale(id++, "2008 BMW 328i"));
const o = (l, v, n, thin) => ({ dimension: "body", label: l, value: v, n, low: thin ? null : 7500, high: thin ? null : 11500, rangeFloor: !!thin, ownWindow: false, windowWords: "since December 2025" });
const a = { tier: "result", poolN: pool.length, rawPool: pool, cluster: null, optionsState: "split", headlineDimension: "body", thinReason: "pooled_apart", headlineLines: ["x", "y", "z"], windowWords: "since December 2025", freshness: { through: "2026-10-20" }, rungLabel: "2008 3-Series, convertibles, coupes and sedans", poolYears: [2008, 2008],
  resolvedCar: { year: 2008, make: "BMW", model: "3-Series", canonicalLabel: "2008 BMW 3-Series" }, setAsideReasons: { "odd sale": 5 },
  options: [o("Coupe", "coupe", 6, true), o("Sedan", "sedan", 3, true), o("Convertible", "open", 14, false)] };
const d = E.withReadFields(a, "2008 BMW 3-Series", { year: 2008 }), opts = d.options || [];
ok("a Wagon is an option now (3 sales: the Touring M Sport, the Touring and the Sports Wagon)", opts.some(x => x.value === "wagon" && x.n === 3), opts.map(x => x.label + " " + x.n).join(" | "));
ok("the body remainder is the 4 sales that really name no body", d.optionsRemainder && d.optionsRemainder.n === 4, JSON.stringify(d.optionsRemainder && d.optionsRemainder.n));
const unnamed = pool.filter(r => !opts.some(x => String(x.value) === (B.bodyFromText(r.rtitle) === "convertible" ? "open" : B.bodyFromText(r.rtitle))));
ok("no sale whose title names a known body is counted as not saying its body", unnamed.every(r => !B.bodyFromText(r.rtitle)), unnamed.filter(r => B.bodyFromText(r.rtitle)).map(r => r.rtitle).join(" | "));
const bodiesInPool = new Set(pool.map(r => B.bodyFromText(r.rtitle)).filter(Boolean)), line = String(d.scopeLine || "").toLowerCase();
ok("every body the sales carry is named in the title line", [...bodiesInPool].every(b => line.includes(b === "convertible" ? "convertible" : b + "s".slice(0, 0))) && /wagons/.test(line), d.scopeLine);
// the open bodies are one word in the title line (cabriolet, convertible, roadster: Oct 29 2026, "Cabriolets, convertibles, coupes and sedans" on the narrowed 2008 3-Series)
{ const mix = ["2008 BMW 328i Convertible", "2008 BMW 335i Cabriolet", "2008 BMW 335i Coupe", "2008 BMW 328i Sedan"].map((t, i) => ({ id: "m" + i, _usd: 9000 + i, auction_end_date: "2026-05-1" + i, year: 2008, rtitle: t, raw_title: t }));
  const l = String(E.scopeLineOf({ tier: "result", rawPool: mix, resolvedCar: { year: 2008, canonicalLabel: "2008 BMW 3-Series" }, poolYears: [2008, 2008], freshness: { through: "2026-10-16" }, options: [{ dimension: "body", value: "open", label: "Convertible" }], rungLabel: "2008 3-Series, convertibles, coupes and sedans" })).toLowerCase();
  ok("the title line says the open body once (convertibles), never cabriolets beside convertibles", /convertibles/.test(l) && !/cabriolets/.test(l), l); }
// 3. the set-aside line
const ASIDE = [[{ "odd sale": 5 }, "5 odd sales set aside."], [{ "odd sale": 1 }, "1 odd sale set aside."], [{ "odd sale": 3, modified: 2 }, "3 odd sales and 2 modified sales set aside."], [{ project: 1 }, "1 project car set aside."]];
for (const [r, want] of ASIDE) ok(`set-aside line ${JSON.stringify(r)}: "${want}"`, E.setAsideLineOf(r, null) === want, E.setAsideLineOf(r, null));
const badAside = l => /set aside:/.test(l) || (() => { const m = /^(\d+) (?:sales?|[a-z ]+?) set aside\.$/.exec(l); return false; })() || /(\d+) sales set aside, \1 /.test(l);
ok("no set-aside line says \"set aside:\" or repeats its own count", ASIDE.every(([r]) => !badAside(E.setAsideLineOf(r, null))) && !badAside(d.setAsideLine || ""), d.setAsideLine);
ok("the served answer carries the line, and the old stored wording is gone (a stored row serves it through freshenStoredText)", d.setAsideLine === "5 odd sales set aside." && E.freshenStoredText({ ...a, setAsideLine: undefined }).setAsideLine === "5 odd sales set aside.");
const html = C.sellsForCardHtml(d, { updated: "Oct 28, 2026" }), asideP = (html.match(/<p class="sfc-aside">([^<]*)<\/p>/) || [])[1];
ok("the card prints the engine's line", asideP === "5 odd sales set aside.", asideP);
const html2 = C.sellsForCardHtml({ ...d, setAsideLine: undefined }, {}), asideP2 = (html2.match(/<p class="sfc-aside">([^<]*)<\/p>/) || [])[1];
ok("an answer with no setAsideLine field still reads the same (the card's twin)", asideP2 === "5 odd sales set aside.", asideP2);
// 4. option order, every shape
const SHAPES = [["body, alike", { optionsState: "alike", cluster: [1, 2], options: [o("Coupe", "coupe", 6, true), o("Sedan", "sedan", 3, true), o("Convertible", "open", 14, false), o("Targa", "targa", 9, false)] }],
  ["gearbox, split", { optionsState: "split", headlineDimension: "gearbox", options: [{ dimension: "gearbox", label: "SMG", value: "auto", n: 3, low: null, high: null, rangeFloor: true, windowWords: "since December 2025" }, { dimension: "gearbox", label: "Manual", value: "manual", n: 33, low: 1, high: 2, rangeFloor: false, windowWords: "since December 2025" }] }],
  ["mileage, apart", { optionsState: "apart", headlineDimension: "mileage", options: [{ dimension: "mileage", label: "Over 100,000 miles", value: "o100", n: 5, low: null, high: null, rangeFloor: true, windowWords: "since December 2025" }, { dimension: "mileage", label: "Under 50,000 miles", value: "u50", n: 12, low: 1, high: 2, rangeFloor: false, windowWords: "since December 2025" }, { dimension: "mileage", label: "50,000 to 100,000 miles", value: "m", n: 20, low: 1, high: 2, rangeFloor: false, windowWords: "since December 2025" }] }]];
for (const [name, s] of SHAPES) {
  const x = E.withReadFields({ ...a, headlineLines: ["a", "b", "c"], rawPool: [], poolN: 60, ...s }, "x", { year: 2008 }), ox = x.options || [];
  const ranged = ox.filter(q => !q.rangeFloor), thin = ox.filter(q => q.rangeFloor), idxLast = ox.map(q => !q.rangeFloor).lastIndexOf(true), idxFirstThin = ox.findIndex(q => q.rangeFloor);
  if (/^mileage/.test(name)) { ok(`${name}: mileage bands print ascending`, ox.map(q => q.label).join("|") === "Under 50,000 miles|50,000 to 100,000 miles|Over 100,000 miles", ox.map(q => q.label).join(" | ")); continue; }
  ok(`${name}: options with a range first, largest first; thin ones after, largest first`, (idxFirstThin < 0 || idxLast < idxFirstThin) && ranged.every((q, i) => i === 0 || ranged[i - 1].n >= q.n) && thin.every((q, i) => i === 0 || thin[i - 1].n >= q.n), ox.map(q => q.label + " " + q.n + (q.rangeFloor ? " thin" : "")).join(" | "));
  ok(`${name}: the option lines follow the same order`, (x.optionLines || []).every((l, i) => String(l).startsWith(ox[i].label)), (x.optionLines || []).join(" | "));
}
console.log(fail ? `bodiesOrderAsideCheck: ${fail} failure(s)` : "bodiesOrderAsideCheck: all pass");
process.exit(fail ? 1 : 0);
