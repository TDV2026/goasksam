// A FILTERED ANSWER IS COMPUTED FROM THE FILTERED SALES, SAYS WHICH FILTER IS ON, AND KEEPS ITS BASIS (Lane B, Oct 29 2026, Sam's live look at the 2008 BMW 3-Series: after tapping "50,000 to 100,000 miles" the card read $7,500 to $11,500, the same as the unfiltered
// Convertible block, lost its count and window, and nothing on the page said a filter was on).
// FOOTER: the total and since date are dropped only when the card shows option BLOCKS (optionsState split or apart); a range with option pills (alike) is a single range card and prints its basis once.
// APPLIED: appliedFilters / appliedLine name every narrowing in the engine's words and order, scopeLine carries it, each filter carries the refine that takes it off.
// RANGE: built from a car with a real price spread by mileage (price falls with the odometer) and gearbox (manual dearer), run through the real engine with the stored pool as the seed (the path Market Check takes for a refine): every band and gearbox filter must return a range from
// its own sales only, never the unfiltered range when its sales do not support it.
//   node scripts/filtersRangeCheck.mjs [repo root]
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.LAUNCH_STAGE = "2";
globalThis.fetch = async (url) => { const u = new URL(String(url)); if (u.hostname !== "fake.supabase.test") throw new Error("offline"); return new Response("[]", { status: 200 }); };
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href), V = await import(pathToFileURL(path.join(root, "lib/vehicle.js")).href), C = await import(pathToFileURL(path.join(root, "lib/sellsForCard.js")).href);
const TEXT = "1995 Porsche 911 Carrera Coupe", env = (rows) => ({ supabaseUrl: "https://fake.supabase.test", supabaseKey: "k", asked: 2, poolSeed: { rows } });
// 90 sales: price falls with miles (from about $52,000 at 10,000 miles to about $35,000 at 140,000), a manual sells $600 above the automatic
const rows = Array.from({ length: 90 }, (_, i) => { const mi = 10000 + i * 1500, manual = i % 2 === 0; return { id: "r" + i, price: Math.round(52000 - (mi - 10000) * 0.14 + (manual ? 300 : -300)), auction_end_date: `2026-0${1 + (i % 9)}-${10 + (i % 9)}`, year: 1995, make: "Porsche", model: "911", raw_title: TEXT + (manual ? " 6-Speed" : " Tiptronic"), rtitle: TEXT + (manual ? " 6-Speed" : " Tiptronic"), mileage: String(mi), vin_norm: "WP0AB099" + (100000 + i), transmission: manual ? "Manual (6-speed)" : "Automatic (Tiptronic)", image: "https://img.test/x.jpg", source: "bringatrailer" }; }).map(r => ({ ...r, _usd: r.price }));
const v = (await V.resolveVehicle(TEXT, {})).vehicle;
const run = async refine => (await E.oneEngineAnswer(v, null, TEXT, env(rows), refine)).raw;
const base = await run(null); if (!base.cluster) console.log("base:", base.tier, base.thinReason, base.poolN); const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
ok("the unfiltered answer carries a range and no applied filter", base.tier === "result" && Array.isArray(base.cluster) && (!base.appliedFilters || base.appliedFilters.length === 0), JSON.stringify(base.cluster));
const FILTERS = [["under 50,000 miles", { miMin: 0, miMax: 50000, label: "Under 50,000 miles" }, r => Number(r.mileage) < 50000, "Under 50,000 miles"], ["50,000 to 100,000 miles", { miMin: 50000, miMax: 100000, label: "50,000 to 100,000 miles" }, r => Number(r.mileage) >= 50000 && Number(r.mileage) < 100000, "50,000 to 100,000 miles"],
  ["over 100,000 miles", { miMin: 100000, miMax: null, label: "Over 100,000 miles" }, r => Number(r.mileage) >= 100000, "Over 100,000 miles"], ["Manual", { tx: "manual", label: "Manual" }, r => /manual/i.test(r.transmission), "Manual"], ["Automatic", { tx: "auto", label: "Automatic" }, r => /automatic/i.test(r.transmission), "Automatic"]];
for (const [name, refine, inSet, words] of FILTERS) {
  const a = await run(refine), mine = rows.filter(inSet).map(r => r._usd), lo = Math.min(...mine), hi = Math.max(...mine);
  ok(`${name}: a range, from its own sales (inside ${lo}..${hi})`, a.tier === "result" && Array.isArray(a.cluster) && a.cluster[0] >= lo - 500 && a.cluster[1] <= hi + 500, JSON.stringify(a.cluster));
  const unfilteredSupported = Math.abs(q(mine, 0.25) - base.cluster[0]) < 0.08 * base.cluster[0] && Math.abs(q(mine, 0.75) - base.cluster[1]) < 0.08 * base.cluster[1];
  ok(`${name}: not the unfiltered range ${JSON.stringify(base.cluster)} unless its own sales support it`, unfilteredSupported || JSON.stringify(a.cluster) !== JSON.stringify(base.cluster), JSON.stringify(a.cluster));
  ok(`${name}: the engine says which filter is on ("${words}"), in scopeLine and metaLine`, Array.isArray(a.appliedFilters) && a.appliedFilters.some(f => f.words === words) && /Narrowed to/.test(String(a.appliedLine)) && String(a.scopeLine).toLowerCase().includes(words.toLowerCase()) && String(a.metaLine || a.scopeLine).includes("Narrowed to"), `${a.appliedLine} | ${a.scopeLine}`);
  ok(`${name}: each filter carries the refine that takes it off`, a.appliedFilters.every(f => f.clear && typeof f.clear === "object" && !("label" in f.clear)));
  // the card: one range prints its basis once
  const html = C.sellsForCardHtml(a, { updated: "Oct 28, 2026" }), foot = ((html.match(/<div class="sfc-footer">[\s\S]*$/) || [""])[0]).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const single = /^(alike|none)$/.test(String(a.optionsState || "none")) || !a.optionsState;
  if (single) ok(`${name}: a single range card prints its count and since date once, and the range sentence once`, (foot.match(/\d[\d,]* sales?, since [A-Z][a-z]+ \d{4}/g) || []).length === 1 && (foot.match(/The range is the middle of the market: a quarter of sales landed below it and a quarter above\./g) || []).length === 1, foot.slice(0, 160));
}
// a typed mileage is said in the engine's words
{ const a = await run({ miTarget: 60000, miMin: 50000, miMax: 70000, miBand: 10000, label: "60,000 miles" }); ok("typed miles: \"within 10,000 miles of 60,000\" is on the answer", /within 10,000 miles of 60,000/.test(String(a.appliedLine)), a.appliedLine); }
// the footer rule, on the shapes a tap or typed miles reaches
const pool = n => rows.slice(0, n);
const SH = [["range with gearbox pills (alike)", { optionsState: "alike", cluster: [30000, 40000], windowLine: "20 sales, since Nov 2025.", headlineDimension: "gearbox", options: [{ dimension: "gearbox", label: "Manual", value: "manual", n: 10, low: 1, high: 2, rangeFloor: false, windowWords: "since Nov 2025" }, { dimension: "gearbox", label: "Automatic", value: "auto", n: 10, low: 1, high: 2, rangeFloor: false, windowWords: "since Nov 2025" }], expectTotal: true }],
  ["option blocks (split)", { optionsState: "split", cluster: null, windowLine: "20 sales, since Nov 2025.", headlineDimension: "body", headlineLines: ["a", "b"], options: [{ dimension: "body", label: "Coupe", value: "coupe", n: 10, low: 1, high: 2, rangeFloor: false, windowWords: "since Nov 2025" }, { dimension: "body", label: "Sedan", value: "sedan", n: 10, low: 1, high: 2, rangeFloor: false, windowWords: "since Nov 2025" }], expectTotal: false }],
  ["a plain range", { optionsState: "none", cluster: [30000, 40000], windowLine: "20 sales, since Nov 2025.", options: [], expectTotal: true }]];
for (const [name, s] of SH) { const { expectTotal, ...rest } = s; const d = E.withReadFields({ tier: "result", poolN: 20, rawPool: pool(20), windowWords: "since Nov 2025", freshness: { through: "2026-10-20" }, resolvedCar: { year: 1995, canonicalLabel: "1995 Porsche 911" }, ...rest }, TEXT, { year: 1995 });
  const html = C.sellsForCardHtml(d, { updated: "Oct 28, 2026" }), foot = ((html.match(/<div class="sfc-footer">[\s\S]*$/) || [""])[0]).replace(/<[^>]+>/g, " ").replace(/\s+/g, " "), has = /\d+ sales?, since/.test(foot);
  ok(`${name}: the footer ${expectTotal ? "prints" : "does not print"} the count and since date`, has === expectTotal, foot.slice(0, 140)); }
console.log(fail ? `filtersRangeCheck: ${fail} failure(s)` : "filtersRangeCheck: all pass");
process.exit(fail ? 1 : 0);
