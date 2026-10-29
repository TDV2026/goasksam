// A WITHHELD CHART PRINTS NO REASON (Sam, Oct 29 2026, read time only). CAUSE: when the Market Check chart is withheld the page printed the engine's reason (the mix-changed or the too-few sentence) in the chart's place, on Market Check; the engine
// now sends a plain heading, "Latest sales" (reason table chart.latest), as answer.chart.caption (the slot the chart caption sits in), and the sales and the See all link follow as before. The reasons stay in the engine (chart.withheld.reason and .line, chart.note)
// and on How Sam decides. WHO PRINTS A CHART: only the Market Check/One Box page script (public/js/onebox.js, which Find and Sell open through the same card); no email and no other page reads them. A drawn chart is unchanged.
// This check (offline): (1) the engine sends the heading on every withheld chart, pooled and option-tried, and keeps the reason; (2) a stored row serves the heading at read time (withReadFields), no warm; (3) the page's three withheld spots print the heading and neither sentence,
// even when the engine sends both; (4) no page, email or api file outside the engine reads chart.note or chart.withheld.line; (5) a drawn chart still prints its caption.
//   node scripts/chartNoReasonCheck.mjs [repo root]
import fs from "node:fs";
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.LAUNCH_STAGE = "2";
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href), R = await import(pathToFileURL(path.join(root, "lib/reasonWords.js")).href);
const HEAD = "Latest sales", MIX = R.reasonLine("chart.held"), FEW = R.reasonLine("chart.withheld_few");
const sale = (i, date) => ({ id: "s" + i, _usd: 30000 + (i % 7) * 900, auction_end_date: date, transmission: "Manual", rtitle: "2004 BMW M3 Coupe", raw_title: "2004 BMW M3 Coupe", year: 2004 });
const rows = Array.from({ length: 6 }, (_, i) => sale(i, `2026-0${1 + i}-10`));
// 1. the engine: pooled held for its mix, and for too few; both carry the heading and keep the reason
for (const [name, held, want] of [["mix changed", { reason: "mix_changes" }, "mix_changes"], ["too few", { reason: "too_few" }, "too_few"]]) {
  const c = E.chartOf({ tier: "result", poolN: 6, rawPool: rows, trendHeld: held, trend: { quarters: [] }, cluster: null });
  ok(`${name}: the withheld chart carries the plain heading in the caption slot`, c && c.type === "withheld" && c.caption === HEAD, c && JSON.stringify(c.caption));
  ok(`${name}: the reason stays in the engine (withheld.reason, withheld.line)`, c && c.withheld && c.withheld.reason === want && typeof c.withheld.line === "string" && c.withheld.line.length > 10, c && JSON.stringify(c.withheld));
}
// 2. a stored row (no chart field, as stored before) serves the heading at read time
{ const stored = { tier: "result", poolN: 6, rawPool: rows, trendHeld: { reason: "mix_changes" }, trend: { quarters: [] }, cluster: null, windowLine: "6 sales, since June 2025." };
  const served = E.withReadFields(stored, "2004 BMW M3", { year: 2004 });
  ok("a stored row serves chart.caption = the heading at read time, no warm", served.chart && served.chart.type === "withheld" && served.chart.caption === HEAD, served.chart && JSON.stringify(served.chart.caption)); }
// 3. the page: the three spots that print for a withheld chart
const src = fs.readFileSync("public/js/onebox.js", "utf8");
const grab = name => { const i = src.indexOf("function " + name + "("); let d = 0, j = src.indexOf("{", i); for (let k = j; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}" && --d === 0) return src.slice(i, k + 1); } return ""; };
const both = { chart: { type: "withheld", scope: null, buckets: null, caption: HEAD, note: MIX, withheld: { reason: "too_few", line: FEW } }, trend: null, poolN: 6 };
{ const wrap = (names, ret) => new Function("lint", "esc", "obCount", "heroPoolSizeNum", "candleChartHtml", names.map(grab).join("\n") + "\nreturn " + ret + ";")((s) => s, s => String(s), () => "Six sales", () => 6, () => "");
  const heading = grab("chartLatestHeading");
  ok("the page reads the engine's caption for a withheld chart (chartLatestHeading)", heading.length > 0 && wrap(["chartLatestHeading"], "chartLatestHeading")(both) === HEAD);
  // THE LAYOUT (Lane E, Oct 29 2026, noChartLayoutCheck asserts it in a browser at 1440 and 390): a withheld chart has NO chart panel and NO no-chart line; the one place the heading prints is the held panel (chartLatestHeading over the engine's latest sales
  // d.cards, up to six, and a link to all of them). No sale rows, no heading. No reason sentence anywhere, even when the engine sends both.
  const stubs = "var utmUrl=function(u){return u||''},fullDateOrMonth=function(){return 'Jun 10, 2026'},longMiles=function(){return ''},venueOf=function(){return 'Bring a Trailer'},cleanReceiptTitle=function(t){return t},usd=function(n){return '$'+n};\n";
  const HAS_HELD = grab("heldPanelHtml").length > 0;
  ok("the page has the held panel (heldPanelHtml)", HAS_HELD);
  const held = !HAS_HELD ? () => "" : new Function("lint", "esc", stubs + grab("chartLatestHeading") + "\n" + grab("heldPanelHtml") + "\nreturn heldPanelHtml;")((s) => s, s => String(s));
  const cards = rows.map(r => ({ title: r.rtitle, price: r._usd, url: "https://x.test/" + r.id }));
  const withRows = held({ ...both, cards }), noRows = held({ ...both, cards: [] });
  const count = (h, t) => h.split(t).length - 1;
  const panel = wrap(["chartLatestHeading", "chartPanelHtml"], "chartPanelHtml")(both), line = wrap(["chartLatestHeading", "noChartLineHtml"], "noChartLineHtml")(both);
  ok("the chart panel prints nothing for a withheld chart (no heading, no sentence, no empty panel)", panel === "", panel.slice(0, 160));
  ok("the no-chart line prints nothing for a withheld chart (the held panel is the one place)", line === "", line.slice(0, 160));
  ok("the held panel prints the heading once, over the engine's sales (six rows) and a link to all of them", count(withRows, HEAD) === 1 && count(withRows, '<li class="hw-row">') === 6 && /hw-all/.test(withRows), `${count(withRows, HEAD)} headings, ${count(withRows, '<li class="hw-row">')} rows`);
  ok("the held panel prints no reason sentence, even when the engine sends both", !withRows.includes(MIX) && !withRows.includes(FEW) && !/mix of cars|too few sales in each/i.test(withRows));
  ok("the held panel with no sales prints nothing: a heading is never printed over no rows", noRows === "", noRows.slice(0, 160));
  ok("the thin-tile spot (heldSaid) prints the heading, not a sentence", /var heldSaid = chartLatestHeading\(d\)/.test(src) && !/chartHeldSentence/.test(src)); }
// 4. nobody else reads the reasons (the one allowed read is the note a DRAWN, option-scoped chart carries, which is unchanged)
{ const hits = []; const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (!/node_modules|\.git/.test(e.name)) walk(p); } else if (/\.(js|html|mjs)$/.test(e.name) && !/^lib\/(onebox|reasonWords|engineFields)\.js$|^api\/usageDashboard\.js$|^api\/howSamDecides/.test(p)) { const t = fs.readFileSync(p, "utf8").replace(/\/\/[^\n]*/g, "").replace(/d\.chart\.scope && d\.chart\.note \? [^\n]*?esc\(d\.chart\.note\)/, ""); if (/withheld\.line|chart\.note|\.withheld\.reason/.test(t)) hits.push(p); } } };
  for (const d of ["api", "lib", "public"]) walk(d);
  ok("no page, email or api file outside the engine, its words table and the ops reads reads chart.note or chart.withheld.line", hits.length === 0, hits.join(" | ")); }
// 5. a drawn chart still prints its caption
{ const drawn = { chart: { type: "candles", caption: "By quarter, June 2025 to September 2026.", scope: null }, chartCaption: "By quarter, June 2025 to September 2026." };
  ok("a drawn chart's caption comes from the same field and is unchanged", /chartCaption/.test(src) && !/chartLatestHeading\(d\)\) return/.test(grab("candleChartHtml")), drawn.chart.caption); }
// 6. THE CHART WINDOW LINE IS DROPPED (Sam, Oct 29 2026: "The chart covers 15 months, the range the last 11." under the 2001 BMW M3 candles). The engine never sends chartWindowLine, a stored row that carries it is stripped at read time (no warm),
//    and no page, email or fixture prints it. The other chart lines are kept: chartCaption ("By quarter, ..., quarters under 5 sales left out."), the scope line, the year-before line.
{ const stored = { tier: "result", poolN: 17, rawPool: rows, windowMonths: 11, windowWords: "since December 2025", trend: { movement: { size: "quarter", spanLabel: "November 2023 to September 2026", buckets: Array.from({ length: 5 }, (_, i) => ({ period: "2025-Q" + (1 + i % 4), n: 6, low: 1, high: 2 })) } }, chartWindowLine: "The chart covers 15 months, the range the last 11.", chartCaption: "By quarter, November 2023 to September 2026, quarters under 5 sales left out." };
  const served = E.withReadFields(stored, "2001 BMW M3", { year: 2001 }), fresh = E.freshenStoredText({ chartWindowLine: "The chart covers 15 months, the range the last 11.", windowLine: "17 sales, since December 2025." });
  ok("a stored row that carries chartWindowLine serves without it (read time, no warm)", !("chartWindowLine" in served) && !("chartWindowLine" in fresh), JSON.stringify(Object.keys(served).filter(k => /chart/i.test(k))));
  ok("the chart caption line is kept", typeof served.chartCaption === "string" && /^By quarter, .+ under 5 sales left out\.$/.test(served.chartCaption), String(served.chartCaption));
  ok("the table has no chart.window line and the field is not registered", !/"chart\.window"/.test(fs.readFileSync("lib/reasonWords.js", "utf8")) && !/"chartWindowLine"/.test(fs.readFileSync("lib/engineFields.js", "utf8")));
  const hits = []; const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (!/node_modules|\.git/.test(e.name)) walk(p); } else if (/\.(js|html|mjs)$/.test(e.name) && p !== path.join("scripts", "chartNoReasonCheck.mjs") && p !== path.join("lib", "reasonWords.js")) { const t = fs.readFileSync(p, "utf8").replace(/\/\/[^\n]*/g, ""); if (/The chart covers|d\.chartWindowLine/.test(t) || (/chartWindowLine/.test(t) && !/^scripts\//.test(p) && p !== path.join("lib", "onebox.js"))) hits.push(p); } } };
  for (const d of ["api", "lib", "public", "scripts"]) walk(d);
  ok("no page, email, fixture or check prints or builds the chart window line", hits.length === 0, hits.join(" | ")); }
console.log(fail ? `chartNoReasonCheck: ${fail} failure(s)` : "chartNoReasonCheck: all pass");
process.exit(fail ? 1 : 0);
