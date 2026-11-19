// clock: real-ok every clock in the worlds is a fixed date (Lane B, Nov 2026)
// MARKET CHECK EXAMPLE SALES, IN LANE E'S SHAPE (Lane B, Nov 8 2026). lib/live/marketCheckExamples.js marketCheckExampleSales(env, req) is read by Lane E's own reader (lib/preview/mcSellPreview.js exampleSalesOf) and by api/crewPage.js from that file:
//   (1) the shape is the reader's exactly: three sales, each with title, soldLine, mileageLine, platformLine, dateLine, photo_url and url, and the reader draws the section from it
//   (2) no card without a real sale: a sale without a photo that passed the rule (200, image, under 600 KB) or a receipt link is never a card; the price is the sale's own
//   (3) the daily pick is the same all day for every visitor (the engine is asked once) and differs across days
//   (4) the kill switch (CREW_MC_EXAMPLES=0, and the older MC_EXAMPLE_SALES=0) and a visitor without the crew cookie give no field, and no field draws no section
//   (5) the photos of a stored pick are re-checked once an hour; a pick whose photo has gone is built again, else the section is hidden
//   (6) the class: crewPage.js reads this very file and function; zero OldCarsData
//   node scripts/mcExamplesCheck.mjs [root]     --mutants proves each rule by breaking it in a copy
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { fileURLToPath, pathToFileURL } from "node:url"; import { spawnSync } from "node:child_process";
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), rootArg = args.find(a => !a.startsWith("--")), ROOT = path.resolve(rootArg || path.join(here, ".."));
if (args.includes("--mutants")) {
  const MX = "lib/live/marketCheckExamples.js", EE = "lib/live/entryExamples.js";
  const muts = [
    [EE, "if (d.now() - t0 > BUILD_TOTAL_MS) return null;   // out of time", "", "(8) the Market Check build has no limit on the whole"],
    [MX, "if (!sales.every(s => s && urls.has(s.url))) return null;", "", "(7) a sale outside the result's pool is accepted"],
    [EE, "result: resultOf(a), poolN,", "result: resultOf({ ...a, cards: a.cards.filter(c => !three.includes(c)) }), poolN,", "(7) the result is built without the pool the three sales were taken from"],
    [EE, "out[k] = JSON.parse(JSON.stringify(a[k]));", "out[k] = k === \"poolN\" ? a[k] + 1 : JSON.parse(JSON.stringify(a[k]));", "(7) a number of the result is not the page's number"],
    [EE, "\"latestSaleLine\", \"latestSaleDate\"", "\"latestSaleDate\"", "(7) a line the page draws is left out"],
    [MX, "also: [\"MC_EXAMPLE_SALES\"], key: MC_STORE, build: buildMarketCheckExample });\n  return mcResultShape", "also: [], key: \"NOT_A_KEY\", build: buildMarketCheckExample });\n  return mcResultShape", "(7) the result reads another pick than the sales"],
    [MX, "if (!r || r.tier !== \"result\" ||", "if (!r ||", "(7) a result that is not a result is shown"],
    [EE, "\"resolvedCar\", \"resolvedSpec\", \"rungLabel\",", "\"resolvedSpec\",", "(7) the car's title and period line are left out of the result"],
    [EE, "[\"tier\", \"titleLine\", \"resolvedCar\",", "[\"tier\", \"resolvedCar\",", "(7) the title line is left out of the result"],
    ["lib/onebox.js", "if (out && typeof out === \"object\" && out.resolvedCar) out.titleLine = titleLineOf(out.resolvedCar);", "", "(7) the engine serves no titleLine"],
    ["lib/onebox.js", "[rc.year, rc.make, rc.nameModel || rc.model, rc.trim, body].filter(Boolean).join(\" \") || null;", "[rc.year, rc.make, rc.nameModel || rc.model, body].filter(Boolean).join(\" \") || null;", "(7) the engine's title drops the trim the page prints"],
    [EE, "\"poolYears\", \"fallbackRung\",", "\"fallbackRung\",", "(7) the period's years are left out of the result"],

    [MX, "photo_url: https(s.photo) ? s.photo : \"\"", "photo_url: s.photo || \"\"", "(1) a photo that is not https passes"],
    [MX, "soldLine: s.priceLabel || \"\"", "soldLine: s.dateLine || \"\"", "(1) the sold line is not the price line"],
    [MX, "data.sales.length !== 3", "data.sales.length < 1", "(1) fewer than three sales make a field"],
    [MX, "return sales.every(s => s.title && s.soldLine && s.photo_url && s.url) ? {", "return sales.length ? {", "(2) a sale with no photo or link is a card"],
    [MX, "off: \"CREW_MC_EXAMPLES\", also: [\"MC_EXAMPLE_SALES\"],", "off: \"NOT_A_SWITCH\", also: [],", "(4) the kill switch does nothing"],
    [MX, "also: [\"MC_EXAMPLE_SALES\"], key: MC_STORE", "also: [], key: MC_STORE", "(4) the older switch does nothing"],
    [MX, "if (res.every(Boolean)) return data;", "return data;", "(5) a stored pick is never re-checked"],
    [MX, "if (!built) return null;\n  try { await d.write", "if (!built) return data;\n  try { await d.write", "(5) a pick whose photo has gone stays when it cannot be built again"],
    [MX, "if (last && d.now() - last < RECHECK_MS) return data;", "", "(5) the photos are re-checked on every read"],
    [EE, "if (!(await choosePhoto(photoCandidates({ photo_url: c.image }), d.head))) bad.push(c);", "", "(2) the photo rule is not applied to the three sales"],
    [EE, "if (st && st.v === STORE_V && st.data && st.data.pickDate === dateKey) return st.data;", "", "(3) the day's pick is built again on every read"]
  ];
  let survivors = 0;
  for (const [file, from, to, want] of muts) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mxc-"));
    spawnSync("rsync", ["-a", "--exclude", ".git", "--exclude", "node_modules", "--exclude", "proofs", ROOT + "/", dir + "/"]); fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"));
    const fp = path.join(dir, file), src = fs.readFileSync(fp, "utf8"), m = src.replace(from, to);
    if (m === src) { console.log("MUTANT NOT APPLIED  " + want); survivors++; fs.rmSync(dir, { recursive: true, force: true }); continue; }
    fs.writeFileSync(fp, m);
    const r = spawnSync(process.execPath, [path.join(dir, "scripts/mcExamplesCheck.mjs"), dir], { encoding: "utf8" }), killed = r.status !== 0;
    console.log((killed ? "killed  " : "SURVIVED") + "  " + want); if (!killed) survivors++;
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(survivors ? "\n" + survivors + " mutant(s) survived" : "\nall mutants killed"); process.exit(survivors ? 1 : 0);
}
const { load } = await import("./_mcExamplesWorld.mjs");
const X = await load(ROOT), { MX, EE, M, env, CREW, NOCREW, D1, DAY } = X;
let failed = 0, n = 0; const ok = (name, c, d) => { n++; if (!c) failed++; console.log((c ? "PASS" : "FAIL") + "  " + name + (d ? "  " + d : "")); };
{ // (1) the shape and Lane E's reader
  const W = X.world(X.ALLMC(X.pool(14))), f = await MX.marketCheckExampleSales(env, CREW, W.d);
  ok("(1) a field with three sales", f && f.sales.length === 3 && f.pickDate === "2026-11-09");
  ok("(1) each sale carries exactly the keys of Lane E's reader", f.sales.every(s => JSON.stringify(Object.keys(s).sort()) === JSON.stringify(["dateLine", "mileageLine", "photo_url", "platformLine", "soldLine", "title", "url"])), JSON.stringify(Object.keys(f.sales[0])));
  const rows = M.exampleSalesOf(f);
  ok("(1) Lane E's own reader accepts the field and returns three rows", rows && rows.length === 3 && rows.every(r => r.title && r.sold && r.photo && r.url && r.mi && r.plat && r.date), JSON.stringify(rows && rows[0]));
  const html = M.entryHtml("mc", { exampleResult: await MX.marketCheckExampleResult(env, CREW, W.d) });
  ok("(1) the entry page no longer draws the result frame or the three card sales section (Lane E, Nov 9 2026: it draws marketCheckExample as one card, held by scripts/entryFinalCheck.mjs)", !/data-example-result/.test(html) && !/<iframe/.test(html) && !/data-example-sales/.test(html) && (html.match(/class="pc"/g) || []).length === 0);
  ok("(1) the lines are table lines: 'Sold for $52,000', '20,000 miles', 'Sold <Month> <year>'", /^Sold for \$[\d,]+$/.test(f.sales[0].soldLine) && /^[\d,]+ miles$/.test(f.sales[0].mileageLine) && /^Sold [A-Z][a-z]+ \d{4}$/.test(f.sales[0].dateLine) && /^Three of the 14 sales of this model/.test(f.line));
  ok("(1) platformLine is the venue's name", f.sales.every(s => s.platformLine === "Bring a Trailer"));
}
{ // (2) no card without a real sale
  const big = X.pool(14), W = X.world(X.ALLMC(big)); W.heads[big[0].image] = { status: 200, bytes: 3100000, type: "image/jpeg" }; W.heads[big[13].image] = { status: 404, bytes: null, type: "" };
  const f = await MX.marketCheckExampleSales(env, CREW, W.d);
  ok("(2) a 3.1 MB photo and a 404 are never a card; the three come from sales that passed", f && f.sales.every(s => s.photo_url !== big[0].image && s.photo_url !== big[13].image));
  const price = f.sales[0].soldLine, src = big.find(c => c.image === f.sales[0].photo_url);
  ok("(2) the sold line is the sale's own price", src && price === "Sold for $" + src.price.toLocaleString("en-US"));
  const nolink = X.pool(14).map(c => ({ ...c, url: "http://x.test/a" })), g = await MX.marketCheckExampleSales(env, CREW, X.world(X.ALLMC(nolink)).d);
  ok("(2) sales with no https receipt: no field, nothing invented", g === null);
  const nophoto = X.pool(14).map(c => ({ ...c, image: null })), h = await MX.marketCheckExampleSales(env, CREW, X.world(X.ALLMC(nophoto)).d);
  ok("(2) sales with no photo: no field", h === null);
  const allbad = X.pool(14), W2 = X.world(X.ALLMC(allbad)); for (const c of allbad) W2.heads[c.image] = { status: 200, bytes: 3100000, type: "image/jpeg" };
  ok("(2) every photo over 600 KB: no field", (await MX.marketCheckExampleSales(env, CREW, W2.d)) === null);
  ok("(2) no engine answer at all: no field", (await MX.marketCheckExampleSales(env, CREW, X.world({}).d)) === null);
}
{ // (2) the shaper, on stored data that is wrong
  const good = { pickDate: "2026-11-09", model: "m", poolN: 9, line: "l", sales: [1, 2, 3].map(i => ({ title: "T" + i, photo: "https://img.test/" + i + ".jpg", priceLabel: "Sold for $1", milesLabel: "1 miles", platform: "Bring a Trailer", dateLine: "Sold May 2026", url: "https://bat.test/" + i })) };
  const mut = (i, o) => ({ ...good, sales: good.sales.map((s, j) => (j === i ? { ...s, ...o } : s)) });
  ok("(2) a complete stored pick is shaped", MX.mcShape(good) !== null);
  ok("(2) an http photo makes no field", MX.mcShape(mut(1, { photo: "http://img.test/x.jpg" })) === null);
  ok("(2) a missing photo, receipt, title or price line makes no field", [{ photo: "" }, { url: "" }, { title: "" }, { priceLabel: "" }].every(o => MX.mcShape(mut(0, o)) === null));
  ok("(2) two sales or four sales make no field", MX.mcShape({ ...good, sales: good.sales.slice(0, 2) }) === null && MX.mcShape({ ...good, sales: [...good.sales, good.sales[0]] }) === null);
  ok("(2) nothing stored makes no field", MX.mcShape(null) === null && MX.mcShape({}) === null);
}
{ // (3) the daily pick
  const W = X.world(X.ALLMC(X.pool(14))), a = await MX.marketCheckExampleSales(env, CREW, W.d); const asked = W.asked.length; W.clock = D1 + 3 * 3600000;
  const b = await MX.marketCheckExampleSales(env, CREW, W.d);
  ok("(3) the same pick later the same day, the engine not asked again", JSON.stringify(a) === JSON.stringify(b) && W.asked.length === asked);
  const models = new Set(); for (let k = 0; k < 8; k++) { const w = X.world(X.ALLMC(X.pool(14)), {}, D1 + k * DAY), g = await MX.marketCheckExampleSales(env, CREW, w.d); models.add(g.model); }
  ok("(3) across eight days the pick is not always the same model", models.size >= 3, [...models].join(" | "));
  const same = await MX.marketCheckExampleSales(env, CREW, X.world(X.ALLMC(X.pool(14)), {}, D1).d);
  ok("(3) the same day on a fresh instance gives the same model (deterministic)", same.model === a.model);
  const nextDay = X.world(X.ALLMC(X.pool(14)), {}, D1 + DAY); nextDay.store = new Map(W.store); const c = await MX.marketCheckExampleSales(env, CREW, nextDay.d);
  ok("(3) a stored pick of yesterday is not served today", c && c.pickDate === "2026-11-10");
}
{ // (4) kill switch, crew
  const W = X.world(X.ALLMC(X.pool(14)));
  ok("(4) a visitor without the crew cookie: no field", (await MX.marketCheckExampleSales(env, NOCREW, W.d)) === null && W.asked.length === 0);
  process.env.CREW_MC_EXAMPLES = "0"; const off = await MX.marketCheckExampleSales(env, CREW, X.world(X.ALLMC(X.pool(14))).d); delete process.env.CREW_MC_EXAMPLES;
  ok("(4) CREW_MC_EXAMPLES=0: no field", off === null);
  process.env.MC_EXAMPLE_SALES = "0"; const old = await MX.marketCheckExampleSales(env, CREW, X.world(X.ALLMC(X.pool(14))).d); delete process.env.MC_EXAMPLE_SALES;
  ok("(4) the older MC_EXAMPLE_SALES=0 also hides it", old === null);
  ok("(4) no field draws no section, never a half or invented one", !/data-example-sales/.test(M.entryHtml("mc", { exampleSales: null })) && !/data-example-sales/.test(M.entryHtml("mc", { exampleSales: { sales: [{ title: "x" }] } })));
  ok("(4) switched on again: the field is back", (await MX.marketCheckExampleSales(env, CREW, X.world(X.ALLMC(X.pool(14))).d)) !== null);
}
{ // (5) the hourly photo check
  const pl = X.pool(14), W = X.world(X.ALLMC(pl)), a = await MX.marketCheckExampleSales(env, CREW, W.d), first = a.sales.map(s => s.photo_url);
  W.clock = D1 + 1800000; W.heads[first[0]] = { status: 404, bytes: null, type: "" };
  const b = await MX.marketCheckExampleSales(env, CREW, W.d);
  ok("(5) inside the hour the stored pick is served without a new check", JSON.stringify(b.sales.map(s => s.photo_url)) === JSON.stringify(first));
  W.clock = D1 + 2 * 3600000; const c = await MX.marketCheckExampleSales(env, CREW, W.d);
  ok("(5) after the hour a photo that has gone makes the pick be built again, without that photo", c && c.sales.length === 3 && !c.sales.some(s => s.photo_url === first[0]), JSON.stringify(c && c.sales.map(s => s.photo_url)));
  for (const p of pl) W.heads[p.image] = { status: 404, bytes: null, type: "" };
  W.clock = D1 + 4 * 3600000; ok("(5) every photo gone and no pick can be built: the section is hidden", (await MX.marketCheckExampleSales(env, CREW, W.d)) === null);
}
{ // (6) the class
  const crew = fs.readFileSync(path.join(ROOT, "api/crewPage.js"), "utf8");
  ok("(6) api/crewPage.js reads marketCheckExampleResult (the entry page's real result; its sales are the result's own cards) from lib/live/marketCheckExamples.js, which exports it and still exports marketCheckExampleSales", /readIfBuilt\("\.\.\/lib\/live\/marketCheckExamples\.js", "marketCheckExampleResult"/.test(crew) && typeof MX.marketCheckExampleResult === "function" && typeof MX.marketCheckExampleSales === "function");
  ok("(6) zero OldCarsData", X.metered === 0);
}
{ // (8) THE CLASS OF THE EMPTY /preview/sell (Nov 9 2026): a build that walks its candidates one by one has a limit on the whole, so a slow day ends the build instead of the request
  const W = X.world({}, {}); let calls = 0; W.d.answer = async () => { calls++; W.clock += 20000; return null; };
  const f = await MX.marketCheckExampleSales(env, CREW, W.d);
  ok("(8) Market Check's build stops asking after 45 seconds of candidates and gives no field", f === null && calls >= 2 && calls <= 4 && X.EE.BUILD_TOTAL_MS === 45000, "asked " + calls);
  const W2 = X.world({}, {}); let c2 = 0; W2.d.places = async () => { c2++; W2.clock += 20000; return null; };
  ok("(8) the first Sell build stops the same way", (await X.EE.buildSellExample(env, W2.d, "2026-11-09")) === null && c2 >= 2 && c2 <= 4, "asked " + c2);
  const src = ["lib/live/entryExamples.js", "lib/live/marketCheckExamples.js"].map(f => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n");
  const loops = [...src.matchAll(/for \((?:const|let) \w+ of rotate\(/g)].length, guarded = [...src.matchAll(/d\.now\(\) - t0 > BUILD_TOTAL_MS/g)].length;
  ok(`(8) the class: every candidate loop that awaits one by one carries the limit on the whole (${loops} loops, ${guarded} guarded); the Sell cars build runs under its own clock`, loops === guarded && /SELL_BUILD_MS/.test(src) && !/for \(const text of rotate\(SELL_CANDIDATES, dateKey, "sellcars"\)/.test(src));
}
{ // (7) THE RESULT OF THE SAME PICK (Nov 8 2026): the engine's answer for the car whose three sales are shown, in the answer's own fields; the sales are rows of that result's table
  const W = X.world(X.ALLMC(X.pool(14))), s = await MX.marketCheckExampleSales(env, CREW, W.d), r = await MX.marketCheckExampleResult(env, CREW, W.d);
  const page = await W.d.answer(env, s.model);   // the answer the results page draws for this car
  ok("(7) a result for the day's pick: the same date, the same car", r && r.pickDate === s.pickDate && r.model === s.model && r.result.tier === "result");
  ok("(7) the engine is asked once for the car, whether the sales or the result is read first", W.asked.filter(t => t === s.model).length === 2 /* the pick, and this check's own page read */ && W.asked.filter(t => t !== s.model).length <= X.EE.MC_CANDIDATES.length);
  const EXPECT = ["cluster", "referenceFigure", "poolN", "windowMonths", "windowWords", "windowLabel", "lowestSaleN", "highestSaleN", "latestSaleLine", "basisLine", "countLine", "rangeSentence", "updatedLine", "chart", "cards"];
  ok("(7) every field the page draws is there: the figure, the band, the count, the period, the range sentence, the chart and the table", EXPECT.every(k => r.result[k] !== undefined), EXPECT.filter(k => r.result[k] === undefined).join(","));
  ok("(7) every number equals the results page's number for that car (figure, low, high, count, period, band, chart, sentences)", EXPECT.every(k => JSON.stringify(r.result[k]) === JSON.stringify(page[k])), EXPECT.filter(k => JSON.stringify(r.result[k]) !== JSON.stringify(page[k])).join(","));
  ok("(7) the engine's working fields are not in the field (no rawPool, no timings)", !("rawPool" in r.result) && !("timings" in r.result));
  const rowByUrl = new Map(r.result.cards.map(c => [c.url, c]));
  ok("(7) the three sales are sales inside that result: each is a row of its table, the same price", s.sales.every(x => rowByUrl.has(x.url)) && s.sales.every(x => x.soldLine.includes(Math.round(rowByUrl.get(x.url).price).toLocaleString("en-US"))));
  ok("(7) the result's count is the table's own count", r.result.poolN === r.result.cards.length && r.result.referenceFigure.salesCount === r.result.cards.length);
  const nd = X.world(X.ALLMC(X.pool(14)), {}, X.D1 + X.DAY); nd.store = new Map(W.store); const r2 = await MX.marketCheckExampleResult(env, CREW, nd.d);
  ok("(7) the same pick all day, another day another pick", JSON.stringify(await MX.marketCheckExampleResult(env, CREW, W.d)) === JSON.stringify(r) && r2 && r2.pickDate === "2026-11-10");
  process.env.CREW_MC_EXAMPLES = "0"; const off = await MX.marketCheckExampleResult(env, CREW, X.world(X.ALLMC(X.pool(14))).d); delete process.env.CREW_MC_EXAMPLES;
  ok("(7) CREW_MC_EXAMPLES=0 and a visitor without the crew cookie: no result", off === null && (await MX.marketCheckExampleResult(env, NOCREW, X.world(X.ALLMC(X.pool(14))).d)) === null);
  // hourly revalidation: the photo of one sale goes; the pick is built again and the result still holds its three sales
  const H = X.world(X.ALLMC(X.pool(14))), h1 = await MX.marketCheckExampleSales(env, CREW, H.d); H.heads[h1.sales[1].photo_url] = { status: 404, bytes: 0, type: "text/html" }; H.clock += 2 * 3600000;
  const h2 = await MX.marketCheckExampleResult(env, CREW, H.d), h2s = await MX.marketCheckExampleSales(env, CREW, H.d);
  ok("(7) after the hourly check drops a sale, the result and the sales are the same rebuilt pick and still agree", h2 && h2s && h2s.sales.every(x => h2.result.cards.some(c => c.url === x.url)) && !h2s.sales.some(x => x.url === h1.sales[1].url));
  // hidden fallback
  const none = await MX.marketCheckExampleResult(env, CREW, X.world({}).d);
  ok("(7) no pool for any car: no field, the section is hidden", none === null);
  // the shaper on stored data that is wrong: a sale outside the result's pool, a refusal, a table missing
  const good = { pickDate: "2026-11-09", model: "x", sales: s.sales.map(x => ({ ...x })), result: JSON.parse(JSON.stringify(r.result)) };
  const outside = { ...good, sales: [good.sales[0], good.sales[1], { ...good.sales[2], url: "https://example.test/a-sale-not-in-the-result" }] };
  ok("(7) a stored pick with a sale that is not in the result's table gives no result", MX.mcResultShape(good) !== null && MX.mcResultShape(outside) === null);
  ok("(7) a stored pick whose answer is not a result, has no table, or has no result gives no result", MX.mcResultShape({ ...good, result: { ...good.result, tier: "thin" } }) === null && MX.mcResultShape({ ...good, result: { ...good.result, cards: undefined } }) === null && MX.mcResultShape({ ...good, result: undefined }) === null && MX.mcResultShape(null) === null);
  // the engine's real answer shape: resultOf on a stored answer of the engine copies its fields value for value
  const real = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts/fixtures/answer-325i.json"), "utf8")), ra = real.raw || real, ro = EE.resultOf(ra);
  ok("(7) on a real engine answer (the 325i fixture) every field it has is copied unchanged, and the others are absent", Object.keys(ro).every(k => EE.RESULT_FIELDS.includes(k) && JSON.stringify(ro[k]) === JSON.stringify(ra[k])) && ro.poolN === ra.poolN && JSON.stringify(ro.cluster) === JSON.stringify(ra.cluster) && !("rawPool" in ro));
  // THE CAR'S TITLE AND ITS PERIOD LINE (Nov 8 2026): resolvedCar (year, make, nameModel, trim, bodyStyle, canonicalLabel) and the hero's grey line (rungLabel, poolYears, fallbackRung, siblingName, metaLine, scopeLine) are the answer's own values
  ok("(7) the car's title: resolvedCar is the page's resolvedCar for that car, year, make and model in it, unchanged", r.result.resolvedCar && JSON.stringify(r.result.resolvedCar) === JSON.stringify(page.resolvedCar) && r.result.resolvedCar.year && r.result.resolvedCar.make && (r.result.resolvedCar.nameModel || r.result.resolvedCar.model));
  ok("(7) the period line: rungLabel, poolYears and the rest of the grey line are the page's, unchanged", ["rungLabel", "poolYears", "scopeLabel", "resolvedSpec"].every(k => JSON.stringify(r.result[k]) === JSON.stringify(page[k])) && Array.isArray(r.result.poolYears) && /\d{4}/.test(r.result.rungLabel));
  ok("(7) on the real 325i answer the title and the period line are copied unchanged (resolvedCar, rungLabel, poolYears, resolvedSpec, scopeLabel)", ["resolvedCar", "rungLabel", "poolYears", "resolvedSpec", "scopeLabel"].every(k => JSON.stringify(ro[k]) === JSON.stringify(ra[k]) && ro[k] !== undefined));
  // THE TITLE LINE (Nov 8 2026): the engine's titleLine is the text of the results page's own carLabel (public/js/onebox.js), run here from the page's source
  { const js = fs.readFileSync(path.join(ROOT, "public/js/onebox.js"), "utf8"), i0 = js.indexOf("function carLabel(rc) {"), i1 = js.indexOf("\n  }\n", i0) + 4, c0 = js.indexOf("function cap(s)"), c1 = js.indexOf("\n", c0);
    const carLabel = new Function(js.slice(c0, c1) + "\n" + js.slice(i0, i1) + "\nreturn carLabel;")(), OB = await import(pathToFileURL(path.join(ROOT, "lib/onebox.js")).href);
    ok("(7) titleLine in the result equals the page's carLabel for that car", typeof r.result.titleLine === "string" && r.result.titleLine === carLabel(r.result.resolvedCar) && r.result.titleLine === page.titleLine, r.result.titleLine);
    const CARS = [{ year: 2006, make: "BMW", model: "325i", nameModel: "325i", trim: null, bodyStyle: "sedan" }, { year: 1990, make: "BMW", model: "E30 M3", nameModel: "M3", trim: null, bodyStyle: null, canonicalLabel: "1990 BMW M3" }, { year: 1957, make: "Mercedes-Benz", model: "300SL", trim: "Roadster", bodyStyle: "roadster" }, { year: 1999, make: "Porsche", model: "911", nameModel: "911", trim: "Carrera", bodyStyle: "coupe" }, { year: 1965, make: "Ferrari", model: "275 GTB", trim: null, bodyStyle: "" }, { make: "Ford", model: "Mustang" }, null];
    ok("(7) the class: titleLineOf is carLabel for every kind of car (a canonical label, a trim that carries the body, no body, no year, no car)", CARS.every(c => OB.titleLineOf(c) === (c ? carLabel(c) : null) || (c && carLabel(c) === "this car" && OB.titleLineOf(c) === null)), CARS.map(c => OB.titleLineOf(c)).join(" | "));
    const FX = path.join(ROOT, "scripts/fixtures"), files = fs.readdirSync(FX).filter(f => f.endsWith(".json")); let seen = 0, wrong = [];
    for (const f of files) { let j; try { j = JSON.parse(fs.readFileSync(path.join(FX, f), "utf8")); } catch { continue; } const a = j.raw || j; if (!a || typeof a !== "object" || !a.resolvedCar) continue; seen++;
      const out = OB.withReadFields(JSON.parse(JSON.stringify(a)), "x", a.vehicle || null); if (out.titleLine !== carLabel(out.resolvedCar)) wrong.push(f); }
    ok(`(7) the class: every stored engine answer that names a car serves a titleLine equal to the page's carLabel (${seen} answers read; wrong: ${wrong.join(", ") || "none"})`, seen >= 3 && wrong.length === 0); }
  // THE CLASS: every answer field the results page's title and grey line read is carried by the result, or named here as a count the example does not print
  { const js = fs.readFileSync(path.join(ROOT, "public/js/onebox.js"), "utf8"), a0 = js.indexOf("The scope segment of the hero's one grey line"), blk = js.slice(a0, a0 + 9000), read = [...new Set((blk.match(/\bd\.([A-Za-z_]+)/g) || []).map(x => x.slice(2)))], NOT_PRINTED = ["basisPool", "ownSales", "soldCount"];
    const missing = read.filter(k => !EE.RESULT_FIELDS.includes(k) && !NOT_PRINTED.includes(k));
    ok(`(7) the class: every answer field the results page's grey line reads is in the result (${read.length} read; missing: ${missing.join(", ") || "none"})`, a0 > 0 && read.length >= 6 && missing.length === 0); }
  // the class: the result path only copies. No arithmetic, no formatting, no sorting of a figure in it
  const src = fs.readFileSync(path.join(ROOT, "lib/live/marketCheckExamples.js"), "utf8"), shaper = src.slice(src.indexOf("export function mcResultShape"), src.indexOf("// the Sell cars:")), ee = fs.readFileSync(path.join(ROOT, "lib/live/entryExamples.js"), "utf8"), copier = ee.slice(ee.indexOf("export function resultOf"), ee.indexOf("export function saleOf"));
  ok("(7) the class: the result path computes nothing (no Math, reduce, toLocaleString, toFixed, sort, or arithmetic on a figure)", !/Math\.|reduce\(|toLocaleString|toFixed|\.sort\(|\+\s*1\b|\*\s*\d/.test(shaper.replace(/\/\/.*$/gm, "") + copier.replace(/\/\/.*$/gm, "")));
  ok("(7) the class: every engine field the result carries is on the list the page reads (no field is made here)", s && EE.RESULT_FIELDS.every(k => typeof k === "string") && Object.keys(r.result).every(k => EE.RESULT_FIELDS.includes(k)));
}
console.log("\nmcExamplesCheck: " + (n - failed) + " pass, " + failed + " FAIL"); process.exit(failed ? 1 : 0);
