// clock: real-ok every clock in the worlds is a fixed date (Lane B, Nov 2026)
// MARKET CHECK EXAMPLE SALES, IN LANE E'S SHAPE (Lane B, Nov 8 2026). lib/live/marketCheckExamples.js marketCheckExampleSales(env, req) is read by Lane E's own reader (lib/preview/mcSellPreview.js exampleSalesOf) and by api/crewPage.js from that file:
//   (1) the shape is the reader's exactly: three sales, each with title, soldLine, mileageLine, platformLine, dateLine, photo_url and url, and the reader draws the section from it
//   (2) no card without a real sale: a sale without a photo that passed the rule (200, image, under 600 KB) or a receipt link is never a card; the price is the sale's own
//   (3) the daily pick is the same all day for every visitor (the engine is asked once) and differs across days
//   (4) the kill switch (CREW_MC_EXAMPLES=0, and the older MC_EXAMPLE_SALES=0) and a visitor without the crew cookie give no field, and no field draws no section
//   (5) the photos of a stored pick are re-checked once an hour; a pick whose photo has gone is built again, else the section is hidden
//   (6) the class: crewPage.js reads this very file and function; zero OldCarsData
//   node scripts/mcExamplesCheck.mjs [root]     --mutants proves each rule by breaking it in a copy
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { fileURLToPath } from "node:url"; import { spawnSync } from "node:child_process";
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), rootArg = args.find(a => !a.startsWith("--")), ROOT = path.resolve(rootArg || path.join(here, ".."));
if (args.includes("--mutants")) {
  const MX = "lib/live/marketCheckExamples.js", EE = "lib/live/entryExamples.js";
  const muts = [
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
  const html = M.entryHtml("mc", { exampleSales: f });
  ok("(1) the entry page draws the section with three cards, each a link to the sale with its photo", /data-example-sales/.test(html) && (html.match(/class="pc"/g) || []).length === 3 && f.sales.every(s => html.includes(s.url) && html.includes(s.photo_url)));
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
  ok("(6) api/crewPage.js reads marketCheckExampleSales from lib/live/marketCheckExamples.js, which exports it", /readIfBuilt\("\.\.\/lib\/live\/marketCheckExamples\.js", "marketCheckExampleSales"/.test(crew) && typeof MX.marketCheckExampleSales === "function");
  ok("(6) zero OldCarsData", X.metered === 0);
}
console.log("\nmcExamplesCheck: " + (n - failed) + " pass, " + failed + " FAIL"); process.exit(failed ? 1 : 0);
