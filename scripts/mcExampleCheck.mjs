// clock: real-ok every clock in the worlds is a fixed date (Lane B, Nov 2026)
// THE MARKET CHECK ENTRY CARD (Lane B, Nov 9 2026, the final entry-page brief). lib/live/marketCheckExamples.js marketCheckExample(env, req) -> { pickDate, model, titleLine, photo, range:{low,high}, rangeLine, countLine, periodLine, recentSale:{price, priceLine, platform, milesLine, metaLine, url, photo}, resultUrl } or null.
//   (1) the shape: every field the card draws, every sentence a reason table line (mc.card_*), a link into Market Check for that car
//   (2) ONE ENGINE ANSWER: the range, the count and the period are the answer's referenceFigure (rangeLow, rangeHigh, salesCount, windowLabel) and nothing else; the range is never narrowed
//   (3) the recent sale is a sale of that same answer's cards (its url is in the pool), the newest with a photo that passes the photo rule, the hammer price of that card; a failing photo moves to the next sale
//   (4) the pick prefers the most focused range among the candidates that give a result; the same pick all day, a different day builds again
//   (5) kill switch CREW_MC_EXAMPLES=0, a visitor without the crew cookie, no result: no card
//   node scripts/mcExampleCheck.mjs [root]     --mutants proves each rule by breaking it in a copy
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { fileURLToPath } from "node:url"; import { spawnSync } from "node:child_process";
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), rootArg = args.find(a => !a.startsWith("--")), ROOT = path.resolve(rootArg || path.join(here, ".."));
if (args.includes("--mutants")) {
  const MX = "lib/live/marketCheckExamples.js", RWF = "lib/reasonWords.js";
  const muts = [
    [MX, "range: { low: Math.round(lo), high: Math.round(hi) }", "range: { low: Math.round(lo + (hi - lo) * 0.25), high: Math.round(hi - (hi - lo) * 0.25) }", "(2) the range is narrowed to look tight"],
    [MX, "countLine: reasonLine(\"mc.card_count\", { n })", "countLine: reasonLine(\"mc.card_count\", { n: a.cards.length + 1 })", "(2) the count is not the figure's own"],
    [MX, "periodLine: reasonLine(\"mc.card_period\", { label: f.windowLabel })", "periodLine: reasonLine(\"mc.card_period\", { label: \"the last 12 months\" })", "(2) the period is typed, not the engine's"],
    [MX, "const sales = a.cards.filter(cardSaleOk).sort(newestFirst)", "const sales = a.cards.filter(cardSaleOk).sort(newestFirst).reverse()", "(3) the recent sale is not the newest"],
    [MX, "const rs = good[0], pic", "const rs = { ...good[0], url: \"https://outside.test/not-in-the-pool\" }, pic", "(3) the recent sale is not inside the pool"],
    [MX, "price: Math.round(rs.price), priceLine", "price: Math.round(rs.price) + 1000, priceLine", "(3) the price is not the card's hammer price"],
    [MX, "if (await choosePhoto(photoCandidates({ photo_url: c.image }), d.head)) good.push(c); }", "good.push(c); }", "(3) the photo rule is not applied"],
    [MX, "(x.focus ?? 9) - (y.focus ?? 9)", "(y.focus ?? 9) - (x.focus ?? 9)", "(4) the widest range is preferred"],
    [MX, "off: \"CREW_MC_EXAMPLES\", also: [\"MC_EXAMPLE_SALES\"], key: MC_CARD_STORE", "off: \"NOT_A_SWITCH\", also: [], key: MC_CARD_STORE", "(5) the kill switch does nothing"],
    [MX, "a.failedRead || a.tier !== \"result\" || !Array.isArray(a.cards)", "a.failedRead || !Array.isArray(a.cards)", "(5) a thin answer makes a card"],
    [RWF, "text: p => `${money(p.lo)} to ${money(p.hi)}` },\n  \"mc.card_sale\"", "text: p => `${money(p.lo)} - ${money(p.hi)}` },\n  \"mc.card_sale\"", "(1) a sentence is typed with a dash"]
  ];
  let survivors = 0;
  for (const [file, from, to, want] of muts) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mce-"));
    spawnSync("rsync", ["-a", "--exclude", ".git", "--exclude", "node_modules", "--exclude", "proofs", ROOT + "/", dir + "/"]); fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"));
    const fp = path.join(dir, file), src = fs.readFileSync(fp, "utf8"), m = src.replace(from, to);
    if (m === src) { console.log("MUTANT NOT APPLIED  " + want); survivors++; fs.rmSync(dir, { recursive: true, force: true }); continue; }
    fs.writeFileSync(fp, m);
    const r = spawnSync(process.execPath, [path.join(dir, "scripts/mcExampleCheck.mjs"), dir], { encoding: "utf8" }), killed = r.status !== 0;
    console.log((killed ? "killed  " : "SURVIVED") + "  " + want); if (!killed) survivors++;
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(survivors ? "\n" + survivors + " mutant(s) survived" : "\nall mutants killed"); process.exit(survivors ? 1 : 0);
}
const { load } = await import("./_mcExamplesWorld.mjs");
const X = await load(ROOT), { MX, RW, env, CREW, NOCREW, D1, DAY } = X;
let failed = 0, n = 0; const ok = (name, c, d) => { n++; if (!c) failed++; console.log((c ? "PASS" : "FAIL") + "  " + name + (d ? "  " + d : "")); };
// a money slot is probed as $NaN by reasonPatterns; here it stands for any figure
const pats = RW.reasonPatterns().map(p => ({ ...p, re: new RegExp(p.re.source.replace(/\\\$NaN/g, "\\$[\\d,]+")) })), inTable = line => pats.some(p => /^mc\.card_|^tasks\.demo_miles$/.test(p.id) && p.re.test(line));
const pool = X.pool(14), every = X.ALLMC(pool);
{ // (1)(2)(3)
  const W2 = X.world(every, {}), c = await MX.marketCheckExample(env, CREW, W2.d), ans = await X.world(every, {}).d.answer(env, c ? c.model : "x");
  ok("(1) a card with every field the page draws", c && c.pickDate === "2026-11-09" && c.titleLine === "2001 BMW M3" && /^https:/.test(c.photo) && c.range && c.rangeLine && c.countLine && c.periodLine && c.recentSale && c.recentSale.priceLine && c.recentSale.metaLine && /^\/market-check\?q=2001%20BMW%20M3$/.test(c.resultUrl), JSON.stringify(c && Object.keys(c)));
  const lines = c ? [c.rangeLine, c.countLine, c.periodLine, c.recentSale.priceLine, c.recentSale.metaLine, c.recentSale.milesLine] : [];
  ok("(1) every sentence is a reason table line, none typed here", c && lines.every(inTable), JSON.stringify(lines));
  ok("(1) no dash in any sentence", c && !lines.some(l => /[–—]|\s-\s/.test(l)));
  const f = ans.referenceFigure;
  ok("(2) the range is the engine answer's own figure, not narrowed", c.range.low === f.rangeLow && c.range.high === f.rangeHigh && c.rangeLine === "$" + f.rangeLow.toLocaleString("en-US") + " to $" + f.rangeHigh.toLocaleString("en-US"), c.rangeLine);
  ok("(2) the count is the figure's salesCount and the period is its window", c.countLine === f.salesCount + " completed sales" && c.periodLine === "Last 36 months", c.countLine + " | " + c.periodLine);
  const inPool = ans.cards.find(x => x.url === c.recentSale.url);
  ok("(3) the recent sale is a sale of the same answer's cards, with its hammer price, venue and miles", inPool && inPool.price === c.recentSale.price && inPool.image === c.recentSale.photo && c.recentSale.platform === inPool.platformName && c.recentSale.milesLine === Math.round(inPool.mi).toLocaleString("en-US") + " miles", JSON.stringify(c.recentSale));
  ok("(3) it is the newest sale of the pool", ans.cards.filter(x => x.image && x.mi > 0).every(x => x.date <= inPool.date), inPool && inPool.date);
  ok("(1) the reader accepts it and refuses a card without a price or a link", MX.mcCardShape(c) === c && MX.mcCardShape({ ...c, recentSale: { ...c.recentSale, price: 0 } }) === null && MX.mcCardShape({ ...c, resultUrl: "x" }) === null);
  const W3 = X.world(every, {}), newest = pool.slice().sort((p, q) => q.date.localeCompare(p.date))[0];
  W3.heads[newest.image] = { status: 404, bytes: 0, type: "text/html" };
  const c3 = await MX.marketCheckExample(env, CREW, W3.d);
  ok("(3) a recent sale whose photo fails the photo rule is passed over for the next one", c3 && c3.recentSale.url !== newest.url && c3.recentSale.photo !== newest.image, c3 && c3.recentSale.url);
}
{ // (4) the focused range is preferred
  const wide = X.engineAnswer(X.pool(12)), tight = X.engineAnswer(X.pool(12));
  wide.referenceFigure = { ...wide.referenceFigure, rangeLow: 20000, rangeHigh: 60000 }; tight.referenceFigure = { ...tight.referenceFigure, rangeLow: 40000, rangeHigh: 44000 };
  const cands = X.EE.MC_CANDIDATES, pools = Object.fromEntries(cands.map((t, i) => [t, i % 2 ? tight : wide]));
  const c = await MX.marketCheckExample(env, CREW, X.world(pools, {}).d);
  ok("(4) of a wide-range car and a focused one the focused one is the day's card", c && c.range.low === 40000 && c.range.high === 44000, c && c.rangeLine);
  const W = X.world(every, {}), a = await MX.marketCheckExample(env, CREW, W.d); const asked = W.asked.length; W.clock = D1 + 5 * 3600000;
  const b = await MX.marketCheckExample(env, CREW, W.d);
  ok("(4) the same card later the same day, the engine not asked again", JSON.stringify(a) === JSON.stringify(b) && W.asked.length === asked);
  const sets = new Set();
  for (let k = 0; k < 8; k++) { const g = await MX.marketCheckExample(env, CREW, X.world(Object.fromEntries(cands.map((t, i) => [t, Object.assign(X.engineAnswer(X.pool(12)), { titleLine: "car " + i })])), {}, D1 + k * DAY).d); sets.add(g.model); }
  ok("(4) across eight days the car is not always the same", sets.size >= 2, String(sets.size));
}
{ // (5) switch, crew, nothing
  const W = X.world(every, {});
  ok("(5) a visitor without the crew cookie: no card, the engine not asked", (await MX.marketCheckExample(env, NOCREW, W.d)) === null && W.asked.length === 0);
  process.env.CREW_MC_EXAMPLES = "0"; const off = await MX.marketCheckExample(env, CREW, X.world(every, {}).d); delete process.env.CREW_MC_EXAMPLES;
  ok("(5) CREW_MC_EXAMPLES=0: no card", off === null);
  ok("(5) the engine gives no result for any candidate: no card, never an invented one", (await MX.marketCheckExample(env, CREW, X.world(X.ALLMC({ ...X.engineAnswer(X.pool(12)), tier: "thin" }), {}).d)) === null);
  ok("(5) zero OldCarsData", X.metered === 0);
}
console.log("\nmcExampleCheck: " + (n - failed) + " pass, " + failed + " FAIL"); process.exit(failed ? 1 : 0);
