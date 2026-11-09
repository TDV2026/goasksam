// clock: real-ok every clock in the worlds is a fixed date (Lane B, Nov 2026)
// SELL EXAMPLE, IN LANE E'S SHAPE (Lane B, Nov 8 2026). lib/live/marketCheckExamples.js sellExample(env, req) -> { pickDate, note, cars: [ { title, line, url } x2 or x3 ] }, read by Lane E's own reader (lib/preview/mcSellPreview.js sellExampleOf):
//   (1) the shape is the reader's exactly: two or three cars, each with a title and a line, and the reader draws the section from it
//   (2) every number traces to the Sell answer for that car (lib/sell/sellFacts.js placesFor): the total is the sum of the venues printed, each count is that venue's sales; sentences are the reason table's; nothing promises a price
//   (3) the daily pick is the same all day and differs across days; (4) the kill switch (CREW_SELL_EXAMPLE=0, SELL_EXAMPLE_FIELD=0) and a visitor without the crew cookie give no field; fewer than two cars with a real record give no field, never an invented car
//   (5) the class: crewPage.js reads this very file and function; zero OldCarsData
//   node scripts/sellExampleCheck.mjs [root]     --mutants proves each rule by breaking it in a copy
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { fileURLToPath } from "node:url"; import { spawnSync } from "node:child_process";
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), rootArg = args.find(a => !a.startsWith("--")), ROOT = path.resolve(rootArg || path.join(here, ".."));
if (args.includes("--mutants")) {
  const MX = "lib/live/marketCheckExamples.js", EE = "lib/live/entryExamples.js", RWF = "lib/reasonWords.js";
  const muts = [
    [MX, "data.cars.length >= 2 &&", "data.cars.length >= 1 &&", "(1) one car passes the shaper"],
    [MX, "if (total < 8) { why[text] = \"under_eight_sales\"; return; }", "", "(2) a car with a thin record is shown"],
    [MX, "const platforms = platformsOf(pl), total = platforms.reduce((t, p) => t + p.sales, 0);", "const platforms = platformsOf(pl), total = platforms.reduce((t, p) => t + p.sales, 0) + 3;", "(2) the total is not the sum of the venues"],
    [MX, "off: \"CREW_SELL_EXAMPLE\", also: [\"SELL_EXAMPLE_FIELD\"],", "off: \"NOT_A_SWITCH\", also: [],", "(4) the kill switch does nothing"],
    [MX, "also: [\"SELL_EXAMPLE_FIELD\"], key: SELL_STORE", "also: [], key: SELL_STORE", "(4) the older switch does nothing"],
    [MX, "data.cars.length <= 3 &&", "data.cars.length <= 9 &&", "(1) four cars make a field"],
    [MX, "line: reasonLine(\"entry.sell_car\", {", "line: \"Sells best on Bring a Trailer\" + (0 ? reasonLine(\"entry.sell_car\", {", "(2) a sentence typed here, not the table's"],
    [RWF, "venueSplitWords(list) {\n  const parts = (list || []).map(v => `${Number(v.sales).toLocaleString(\"en-US\")} on ${v.name}`);", "venueSplitWords(list) {\n  const parts = (list || []).map(v => `${Number(v.sales) + 1} on ${v.name}`);", "(2) a venue's count is not the venue's"],
    [MX, "export const SELL_PARALLEL = 3,", "export const SELL_PARALLEL = 1,", "(6) the candidates are asked one by one again"],
    [MX, "export const SELL_PARALLEL = 3,", "export const SELL_PARALLEL = 7,", "(6) all the candidates are asked at once"],
    [MX, "await withClock(Promise.all(Array.from({ length: Math.min(SELL_PARALLEL, list.length) }, worker)), all);", "await Promise.all(Array.from({ length: Math.min(SELL_PARALLEL, list.length) }, worker));", "(6) the whole build has no clock"],
    [MX, "catch { why[text] = \"threw\"; return; }", "catch { return; }", "(6) a read that threw is not counted"],
    [MX, "if (cars.length < 2) { try { console.error(", "if (false) { try { console.error(", "(6) a build that finds nothing says nothing"],
    [EE, "if (st && st.v === STORE_V && st.data && st.data.pickDate === dateKey) return st.data;", "", "(3) the day's pick is built again on every read"]
  ];
  let survivors = 0;
  for (const [file, from, to, want] of muts) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sxc-"));
    spawnSync("rsync", ["-a", "--exclude", ".git", "--exclude", "node_modules", "--exclude", "proofs", ROOT + "/", dir + "/"]); fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"));
    const fp = path.join(dir, file), src = fs.readFileSync(fp, "utf8"), m = src.replace(from, to);
    if (m === src) { console.log("MUTANT NOT APPLIED  " + want); survivors++; fs.rmSync(dir, { recursive: true, force: true }); continue; }
    fs.writeFileSync(fp, m);
    const r = spawnSync(process.execPath, [path.join(dir, "scripts/sellExampleCheck.mjs"), dir], { encoding: "utf8", timeout: 90000 }), killed = r.status !== 0;
    console.log((killed ? "killed  " : "SURVIVED") + "  " + want); if (!killed) survivors++;
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(survivors ? "\n" + survivors + " mutant(s) survived" : "\nall mutants killed"); process.exit(survivors ? 1 : 0);
}
const { load } = await import("./_mcExamplesWorld.mjs");
const X = await load(ROOT), { MX, M, RW, env, CREW, NOCREW, D1, DAY } = X;
let failed = 0, n = 0; const ok = (name, c, d) => { n++; if (!c) failed++; console.log((c ? "PASS" : "FAIL") + "  " + name + (d ? "  " + d : "")); };
const pats = RW.reasonPatterns(), inTable = (field, line) => pats.some(p => p.field === field && p.re.test(line));
const PL = X.places(3), every = X.ALLSELL(PL);
{ // (1) the shape and the reader
  const W = X.world({}, every), f = await MX.sellExample(env, CREW, W.d);
  ok("(1) a field with three cars and a note", f && f.cars.length === 3 && f.pickDate === "2026-11-09" && typeof f.note === "string");
  ok("(1) each car carries exactly title, line, url", f.cars.every(c => JSON.stringify(Object.keys(c).sort()) === JSON.stringify(["line", "title", "url"])));
  const rows = M.sellExampleOf(f);
  ok("(1) Lane E's own reader accepts the field", rows && rows.length === 3 && rows.every(r => r.title && r.line), JSON.stringify(rows && rows[0]));
  const html = M.entryHtml("sell", { sellExample: f });
  ok("(1) the entry page draws the section with a card per car, each a link into Sell", /data-sell-example/.test(html) && (html.match(/class="pc"/g) || []).length === 3 && f.cars.every(c => html.includes(c.title)) && /href="\/sell\?car=/.test(html));
  const two = await MX.sellExample(env, CREW, X.world({}, Object.fromEntries(X.EE.SELL_CANDIDATES.map((t, i) => [t, i < 2 ? PL : null]))).d);
  ok("(1) two cars with a record: a field of two", two && two.cars.length === 2 && M.sellExampleOf(two).length === 2);
}
{ // (2) every number traces to the Sell answer
  const W = X.world({}, every), f = await MX.sellExample(env, CREW, W.d), c = f.cars[0];
  ok("(2) the line is the reason table's", f.cars.every(x => inTable("sellExample.cars[].line", x.line)) && inTable("sellExample.note", f.note), c.line);
  ok("(2) the total is the sum of the venues printed and each venue's count is the Sell answer's", /^17 sales in the last 24 months: 9 on Bring a Trailer, 5 on Cars & Bids and 3 on RM Sotheby's\.$/.test(c.line), c.line);
  ok("(2) every number in every line is a count from the record (17, 9, 5, 3, 24)", f.cars.every(x => (x.line.match(/\d[\d,]*/g) || []).every(v => ["17", "9", "5", "3", "24"].includes(v))));
  ok("(2) the title is the Sell answer's own cohort name", f.cars.every(x => x.title === "2008 Porsche 911"));
  ok("(2) the note says these are sales that happened, not a promise", /not a promise of a price/.test(f.note) && f.cars.every(x => !/guarantee|best price|promise|worth|estimate/i.test(x.line)));
  const thin = { cohort_name: "1999 Nissan Skyline", window_label: "in the last 24 months", places: [{ name: "Bring a Trailer", house: false, sales: 4, most_sold_between: null }, { name: "Cars & Bids", house: false, sales: 3, most_sold_between: null }] };
  const g = await MX.sellExample(env, CREW, X.world({}, X.ALLSELL(thin)).d);
  ok("(2) cars with 7 sales are not shown: no field", g === null);
  const one = await MX.sellExample(env, CREW, X.world({}, Object.fromEntries(X.EE.SELL_CANDIDATES.map((t, i) => [t, i === 0 ? PL : null]))).d);
  ok("(2) one car with a record: no field, no invented second car", one === null);
  const oneVenue = await MX.sellExample(env, CREW, X.world({}, X.ALLSELL({ cohort_name: "x", window_label: "in the last 24 months", places: [{ name: "Bring a Trailer", house: false, sales: 30, most_sold_between: null }] })).d);
  ok("(2) a record on one venue only: no comparison, no field", oneVenue === null);
  ok("(2) no Sell answer at all: no field", (await MX.sellExample(env, CREW, X.world({}, {}).d)) === null);
}
{ // (3) the daily pick
  const W = X.world({}, every), a = await MX.sellExample(env, CREW, W.d); const asked = W.asked.length; W.clock = D1 + 5 * 3600000;
  const b = await MX.sellExample(env, CREW, W.d);
  ok("(3) the same pick later the same day, the engine not asked again", JSON.stringify(a) === JSON.stringify(b) && W.asked.length === asked);
  const sets = new Set(); for (let k = 0; k < 8; k++) { const g = await MX.sellExample(env, CREW, X.world({}, every, D1 + k * DAY).d); sets.add(g.cars.map(c => c.url).join("|")); }
  ok("(3) across eight days the cars are not always the same three", sets.size >= 3, String(sets.size));
  const nd = X.world({}, every, D1 + DAY); nd.store = new Map(W.store);
  ok("(3) a stored pick of yesterday is not served today", (await MX.sellExample(env, CREW, nd.d)).pickDate === "2026-11-10");
}
{ // (4) kill switch, crew
  const W = X.world({}, every);
  ok("(4) a visitor without the crew cookie: no field", (await MX.sellExample(env, NOCREW, W.d)) === null && W.asked.length === 0);
  process.env.CREW_SELL_EXAMPLE = "0"; const off = await MX.sellExample(env, CREW, X.world({}, every).d); delete process.env.CREW_SELL_EXAMPLE;
  ok("(4) CREW_SELL_EXAMPLE=0: no field", off === null);
  process.env.SELL_EXAMPLE_FIELD = "0"; const old = await MX.sellExample(env, CREW, X.world({}, every).d); delete process.env.SELL_EXAMPLE_FIELD;
  ok("(4) the older SELL_EXAMPLE_FIELD=0 also hides it", old === null);
  ok("(4) no field draws no section", !/data-sell-example/.test(M.entryHtml("sell", { sellExample: null })) && !/data-sell-example/.test(M.entryHtml("sell", { sellExample: { cars: [{ title: "a", line: "b" }] } })));
  ok("(4) switched on again: the field is back", (await MX.sellExample(env, CREW, X.world({}, every).d)) !== null);
}
{ // (1) the shaper, on stored data that is wrong
  ok("(1) four cars, no cars, a car without a line: no field", MX.sellShape({ cars: [1, 2, 3, 4].map(i => ({ title: "t", line: "l" })) }) === null && MX.sellShape({ cars: [] }) === null && MX.sellShape({ cars: [{ title: "t", line: "l" }] }) === null && MX.sellShape({ cars: [{ title: "t", line: "l" }, { title: "t", line: "" }] }) === null && MX.sellShape(null) === null);
}
{ // (6) WHY /preview/sell CAME BACK EMPTY (Nov 9 2026, from the code): the build asked the candidates one at a time with no clock on the whole. It asks three at a time, under one clock, keeps the cars found, and says why when it finds fewer than two
  const logs = []; const realErr = console.error; console.error = (...a) => { logs.push(a.join(" ")); };
  const withPlaces = (fn) => { const W = X.world({}, {}); W.d.places = fn; W.d.budgetMs = 10000; W.d.buildMs = 300; return W; };
  const sleep = ms => new Promise(r => setTimeout(r, ms)), HANG = () => new Promise(() => {});
  { let calls = 0; const W = withPlaces(async () => { calls++; return calls <= 2 ? HANG() : PL; }); const t0 = Date.now(), f = await MX.sellExample(env, CREW, W.d), took = Date.now() - t0;
    ok("(6) two candidates that never answer do not hold the build: the cars found are kept, inside the one clock", f && f.cars.length === 3 && took < 3000, took + " ms"); }
  { let now = 0, peak = 0; const W = withPlaces(async () => { now++; peak = Math.max(peak, now); await sleep(25); now--; return null; }); W.d.buildMs = 5000; await MX.sellExample(env, CREW, W.d);
    ok("(6) the candidates are asked three at a time, not one by one and not all at once", peak === 3, "peak " + peak); }
  { const W = withPlaces(async () => { throw new Error("read failed"); }); logs.length = 0; const f = await MX.sellExample(env, CREW, W.d), line = logs.map(l => { try { return JSON.parse(l); } catch { return null; } }).find(x => x && x.tag === "crew_sell_example_miss");
    ok("(6) every read failing: no field, and the miss is logged with the reason of each candidate (threw), never silent", f === null && line && line.found === 0 && Object.values(line.reasons).length === X.EE.SELL_CANDIDATES.length && Object.values(line.reasons).every(r => r === "threw"), JSON.stringify(line && line.reasons).slice(0, 120)); }
  { const W = withPlaces(async (e, t) => (t === X.EE.SELL_CANDIDATES[X.EE.SELL_CANDIDATES.length - 1] || t === X.EE.SELL_CANDIDATES[X.EE.SELL_CANDIDATES.length - 2]) ? PL : null); const f = await MX.sellExample(env, CREW, W.d);
    ok("(6) when only the last two candidates have a record, a real candidate is found: a field of those two", f && f.cars.length === 2); }
  { const W = withPlaces(async () => null); logs.length = 0; const f = await MX.sellExample(env, CREW, W.d);
    ok("(6) when no candidate has a record the section stays hidden, and the miss is logged", f === null && logs.some(l => /crew_sell_example_miss/.test(l))); }
  console.error = realErr;
}
{ // (5) the class
  const crew = fs.readFileSync(path.join(ROOT, "api/crewPage.js"), "utf8");
  ok("(5) api/crewPage.js reads sellExample from lib/live/marketCheckExamples.js, which exports it", /readIfBuilt\("\.\.\/lib\/live\/marketCheckExamples\.js", "sellExample"/.test(crew) && typeof MX.sellExample === "function");
  ok("(5) zero OldCarsData", X.metered === 0);
}
console.log("\nsellExampleCheck: " + (n - failed) + " pass, " + failed + " FAIL"); process.exit(failed ? 1 : 0);
