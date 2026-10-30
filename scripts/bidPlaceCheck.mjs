// e100: every sentence about where a bid sits agrees with the figures printed beside it, from ONE engine function (lib/onebox.js bidPlaceOf).
// Cause (Oct 28, Find fixtures): a card carried several bid sentences, each compared with its own pair: the pooled span of all sales (bidAgainstSales) under a card whose large figure was ONE option's range
// (2014 Boxster S PDK, bid $29,000, "PDK $31,000 to $41,000": "within the sales"), and the sales near the car's miles (mileageNear) beside the pooled range. Six places compared a price with a range on their own.
// Part 1: the boundaries. Part 2: the source sweep (no surface compares a bid with a range itself). Part 3: the real Find path over fixtures and a bid grid (below, at the low, inside, at the high, above).
//   node scripts/bidPlaceCheck.mjs [repo root]
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
process.env.LAUNCH_STAGE = "2"; process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
globalThis.fetch = async () => { throw new Error("no network in this check"); };
const imp = f => import(pathToFileURL(path.join(root, f)).href);
const E = await imp("lib/onebox.js");
// PART 1: the one function and its boundaries
ok("bidPlaceOf is the engine's one comparison", typeof E.bidPlaceOf === "function");
if (typeof E.bidPlaceOf === "function") {
  const P = (b, lo, hi) => { const r = E.bidPlaceOf(b, lo, hi); return r && r.against; };
  ok("below: bid under the low", P(29000, 31000, 41000) === "below");
  ok("the low itself is within", P(31000, 31000, 41000) === "within");
  ok("inside the pair is within", P(35000, 31000, 41000) === "within");
  ok("the high itself is within", P(41000, 31000, 41000) === "within");
  ok("above: bid over the high", P(41001, 31000, 41000) === "above");
  ok("the Alpina bid ($255,000) is within $150,000 to $297,000", P(255000, 150000, 297000) === "within");
  ok("no bid, no pair, or low above high is null", P(0, 1, 2) === null && P(5, 0, 2) === null && P(5, 9, 2) === null && P(null, 1, 2) === null);
  const r = E.bidPlaceOf(255000, 150000, 297000, "range", "17 hours");
  ok("the result carries the pair it compared, and the time left in its line", r && r.low === 150000 && r.high === 297000 && r.bid === 255000 && r.line === "The bid is within the range with 17 hours left.", JSON.stringify(r));
  ok("with no time left given the comparison has no line (a live car never prints a comparison without it)", E.bidPlaceOf(255000, 150000, 297000).line === null);
}
// PART 2: no surface compares a bid with a range itself. A line that holds both "below" and "above" as words chosen by a comparison is a second comparison.
const files = []; const walk = d => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { if (f.name === "node_modules" || f.name.startsWith(".") || f.name === "proofs") continue; const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.(js|mjs)$/.test(f.name) && !/Check\.mjs$/.test(f.name) && f.name !== "bidPlaceVerify.js" && !/^scripts\//.test(path.relative(root, p))) files.push(p); } };
for (const d of ["lib", "api", "public/js", "js"]) if (fs.existsSync(d)) walk(d);
const NOT_A_BID = [/const against = b < lo \?/, /const dir = below/, /dv\.direction === "below"/, /const where = p < c25/, /bidPlaceOf\(/, /premium < 0/, /the band test/i];
const second = [];
for (const f of files) { const ls = fs.readFileSync(f, "utf8").split("\n"); ls.forEach((ln, i) => { if (/["'`](below|above)["'`]/.test(ln) && /\?/.test(ln) && /[<>]/.test(ln) && /["'`](below|above)["'`]\s*:|["'`](below|above)["'`]\s*\?/.test(ln) && /"above"[^;]*"below"|"below"[^;]*"above"/.test(ln) && !NOT_A_BID.some(r => r.test(ln))) second.push(`${path.relative(root, f)}:${i + 1}`); }); }
ok("no surface compares a bid or price with a range on its own", second.length === 0, second.join(", "));
// PART 3: the real Find path on fixtures, every bid in the grid
const S = await imp("lib/live/search.js"), { samLines } = await imp("api/buySearch.js"), { slimNearPool } = E;
const V = await imp("lib/live/bidPlaceVerify.js").catch(() => null);
ok("the verifier exists", !!V);
if (V) {
  const base = JSON.parse(fs.readFileSync("scripts/fixtures/m3Answer.json", "utf8"));
  const row = (year, make, model, title) => ({ id: 1, listing_title: title, year, make, model, source: "bringatrailer", end_time: new Date(Date.now() + 4 * 864e5).toISOString() });
  const NEAR = [270000, 281000, 297000, 190000, 205000, 160000, 150000].map((p, i) => ({ p, m: [10200, 11000, 11800, 52000, 61000, 80000, 90000][i] }));
  const split = (matched) => ({ ...base, cluster: null, noCluster: true, poolN: 21, optionsState: "split", ...(matched ? { matchedOption: "PDK" } : {}), headlineLines: ["Manual $33,000 to $43,000, 12 sales", "PDK $31,000 to $41,000, 9 sales"], optionLines: ["Manual $33,000 to $43,000, 12 sales", "PDK $31,000 to $41,000, 9 sales"], thinReason: "pooled_apart", thinLine: "No typical range, these sell in two groups.", countLine: "21 sales since November 2025.", windowWords: "since November 2025", span: [28000, 45000] });
  const CARS = {
    "Alpina Roadster V8, 11,000 miles": { row: row(2003, "BMW", "Z8", "2003 BMW Alpina Roadster V8 with 11,000 miles"), v: { year: 2003, make: "BMW", model: "Z8" }, miles: 11000, d: { ...base, cluster: [150000, 297000], poolN: 14, countLine: "14 sales since January 2024.", windowWords: "since January 2024", wideLine: null, optionsState: "none", span: [140000, 310000], nearPool: NEAR }, bids: [255000, 140000, 150000, 297000, 300000, 285000, 260000] },
    "Boxster S PDK, split, PDK named": { row: row(2014, "Porsche", "Boxster", "2014 Porsche Boxster S 7-Speed PDK"), v: { year: 2014, make: "Porsche", model: "Boxster", trim: "S" }, d: split(true), bids: [29000, 31000, 36000, 41000, 42000, 27000] },
    "Boxster S, split, nothing named": { row: row(2014, "Porsche", "Boxster", "2014 Porsche Boxster S"), v: { year: 2014, make: "Porsche", model: "Boxster", trim: "S" }, d: split(false), bids: [29000, 33000, 43000, 44000] },
    "2002 M3 Coupe, apart": { row: row(2002, "BMW", "M3", "2002 BMW M3 Coupe"), v: { year: 2002, make: "BMW", model: "M3", bodyStyle: "coupe" }, d: { ...base, cluster: null, noCluster: true, poolN: 21, optionsState: "apart", headlineLines: ["Manual $38,000 to $52,000, 12 sales", "SMG $24,000 to $31,000, 9 sales"], optionLines: ["Manual $38,000 to $52,000, 12 sales", "SMG $24,000 to $31,000, 9 sales"], thinReason: "pooled_apart", thinLine: "No typical range, these sell in two groups.", countLine: "21 sales since March 2024.", windowWords: "since March 2024", span: [22000, 56000] }, bids: [30000, 24000, 45000, 60000] },
    "Z4 sDrive35is, one range": { row: row(2015, "BMW", "Z4", "2015 BMW Z4 sDrive35is"), v: { year: 2015, make: "BMW", model: "Z4", trim: "sDrive35is" }, d: { ...base, cluster: [38000, 52000], poolN: 10, countLine: "Ten sales since February 2025.", windowWords: "since February 2025", scope_reason: "Too few 2015 sales, showing 2015 to 2016.", wideLine: null, optionsState: "none", span: [33000, 58000] }, bids: [41000, 37999, 38000, 52000, 53000] },
  };
  let cards = 0, sentences = 0; const bad = [];
  for (const [name, c] of Object.entries(CARS)) {
    const spec = { v: c.v, title: c.row.listing_title };
    const core = S.coreOf(c.d, spec); if (!core) { bad.push(`${name}: no core`); continue; }
    if (c.d.nearPool) core.nearPool = slimNearPool(c.d.nearPool.map(x => ({ _usd: x.p, mileage: x.m })));
    for (const bid of c.bids) {
      const m = S.marketFromCore(core, c.row, { miles: c.miles || null, priceUsd: bid }, spec);
      if (c.d.matchedOption) m.matchedOption = c.d.matchedOption;
      const l = { id: 1, title: c.row.listing_title, market: m, current_bid_usd: bid, end_time: c.row.end_time, sam_lines: [] };
      l.sam_lines = samLines(l, Date.now()); cards++;
      sentences += l.sam_lines.filter(e => /The bid is/.test(e.text || "") || /The bid is/.test(e.bidLine || "")).length + (m.mileageNear && m.mileageNear.bidLine ? 1 : 0);
      for (const p of V.bidWordProblems(l, bid)) bad.push(`${name} bid ${bid}: ${p}`);
    }
  }
  ok(`every bid sentence agrees with the figures beside it (${cards} cards, ${sentences} sentences)`, bad.length === 0, bad.slice(0, 6).join(" | "));
  // the Find card's own answer (findAnswerOf), the same grid
  if (typeof E.findAnswerOf === "function") {
    const rows = Array.from({ length: 12 }, (_, i) => ({ _usd: 31000 + i * 900, mileage: 40000 + i * 1000, auction_end_date: "2026-0" + (1 + (i % 9)) + "-10" }));
    const d = { tier: "result", poolN: 12, cluster: [31000, 41000], windowWords: "since November 2025", optionsState: "none", rawPool: rows };
    const fb = [];
    for (const bid of [29000, 30999, 31000, 36000, 41000, 41001]) {
      const fa = E.findAnswerOf(d, { title: "2014 Porsche Boxster S", miles: null, bid, year: 2014, live: true, endTime: new Date(Date.now() + 17 * 36e5 + 6e5).toISOString() });
      const want = bid < 31000 ? "below" : bid > 41000 ? "above" : "within";
      if (!fa || fa.bid !== want || !fa.lines.some(x => x.includes(` ${want} the range with 17 hours left`))) fb.push(`${bid}: ${JSON.stringify(fa && fa.lines)}`);
    }
    ok("findAnswerOf: the bid word is the one the pair gives", fb.length === 0, fb.join(" | "));
  }
}
process.exit(fail ? 1 : 0);
