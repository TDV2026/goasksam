// SELL RESULT PAGE, THREE DISPLAY CHANGES (Lane C, Oct 26 2026): no "Ask Sam about this" section, no day-range comparison sentence, and the
// range card links to Market Check for the same car in a new tab. Offline. node scripts/sellResultLinksCheck.mjs
import fs from "node:fs";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL  " + m); } };
const client = fs.readFileSync(new URL("../lib/sell/sellMcClient.js", import.meta.url), "utf8");
const flow = fs.readFileSync(new URL("../lib/sell/sellFlow.js", import.meta.url), "utf8");
const code = s => s.replace(/\/\/[^\n]*/g, "");
// 1. the section is not drawn (the route and followAsk stay)
ok(!/sell-askq|data-sellask">|class="sell-ask"/.test(code(client).split("function followAsk")[0].split("function draw")[1] || ""), "the draw no longer builds the Ask Sam form");
ok(!/<h2>Ask Sam about this<\/h2>/.test(code(client)) && !/placeholder="Ask Sam about this/.test(code(client)), "no heading and no input placeholder for it in the Sell client");
ok(/function followAsk/.test(client) && fs.readFileSync(new URL("../api/sellChat.js", import.meta.url), "utf8").length > 0, "the follow-up code and route are still there for other surfaces");
// 2. the day card
ok(!/sales on other days/.test(code(flow)) && !/The typical range for \$\{t\.day\} sales/.test(code(flow)), "the day card no longer builds the comparison sentence");
// 3. the range card
const { sellsForCardHtml } = await import("../lib/sellsForCard.js");
const ans = { cluster: [70000, 95000], poolN: 24, basisLine: "Based on 24 sales, the latest in September 2026.", readAt: "2026-10-26T12:00:00Z" };
const words = "2004 Porsche 911 Carrera";
const href = "/market-check?q=" + encodeURIComponent(words);
const withLink = sellsForCardHtml(ans, { marketHref: href }), plain = sellsForCardHtml(ans, {});
ok(withLink.includes('class="sfc-card" data-href="' + href + '"'), "the range card carries the Market Check address (data-href)");
const a = withLink.match(/<a class="sfc-footer-link" href="([^"]*)" target="_blank" rel="noopener"><span class="sfc-long">See all 24 sales in Market Check<\/span><span class="sfc-short">All 24 sales in Market Check<\/span><\/a>/);
ok(a && a[1] === href, "the link reads See all 24 sales in Market Check (phone: All 24 sales in Market Check), the count the basis line prints, and opens Market Check for the same car in a new tab (target _blank, rel noopener)");
ok(/See all eight sales in Market Check/.test(sellsForCardHtml({ ...ans, basisLine: "Based on eight sales, the latest in September 2026." }, { marketHref: href })), "under ten the count is in words, as the basis line prints it");
ok(/See every sale in Market Check/.test(sellsForCardHtml({ cluster: [70000, 95000], readAt: ans.readAt }, { marketHref: href })) && !/See the sales/.test(withLink), "no count: See every sale in Market Check; the old words are gone");
ok(withLink.indexOf("in Market Check") < withLink.indexOf("How Sam decides") && withLink.includes('<a class="sfc-footer-link" href="/how-sam-decides">How Sam decides</a>'), "the Market Check link sits next to How Sam decides, the same style, and How Sam decides keeps its own link");
ok(!plain.includes("in Market Check") && !plain.includes("data-href"), "a card drawn without the address (Market Check, Find, the partner demo) is unchanged");
ok(/\$70,000/.test(withLink) && /\$95,000/.test(withLink), "the range is the engine's (card unchanged apart from the link)");
// the address is built from the very words the engine read, and the click opens a new tab without touching the card's own links
ok(/marketHref: "\/market-check\?q=" \+ encodeURIComponent\(engineCar\(\)\)/.test(client), "the Sell client builds the address from engineCar(), the words the engine just read");
ok(/window\.open\(rc\.getAttribute\("data-href"\), "_blank", "noopener"\)/.test(client) && /closest\("a, button"\)/.test(client), "the whole card opens it in a new tab, and a click on a link or button inside keeps its own target");
ok(/\.sfc-card\[data-href\]\{cursor:pointer\}/.test(fs.readFileSync(new URL("../lib/sellsForCard.js", import.meta.url), "utf8")), "the card shows a pointer");
ok(!/[–—]/.test(withLink), "no dashes");
const { dayBuckets } = await import("../lib/sell/sellFacts.js");
// 4. the reserve card (e91): drawn from the engine's reserve_split as it stands; the page counts nothing
const { reserveTile } = await import("../lib/sell/sellFlow.js");
const rsOf = (winner, an, bn, label = "2004 Porsche 911 Carrera", months = 12) => ({ winner, a: { side: "no_reserve", n: an, median: 61000 }, b: { side: "reserve", n: bn, median: 52000 }, n: an + bn, gap_pct: 17.3, scope_label: label, window: { months, from: "2025-10-27", to: "2026-10-20" } });
const own = { window_label: "in the last 12 months", pool_years: [2004, 2004] };
let t = reserveTile({ ...own, reserve_split: rsOf("no_reserve", 9, 11, "2004 911 Carrera") });
ok(t && t.label === "Reserve or no reserve" && t.head === "No reserve" && t.line === "Nine of the 20 sales were no reserve and they brought the stronger results." && t.line2 === null, "reserve card, no reserve wins: the words from the engine's counts, no scope line when the scope is the page's own car (" + (t && t.line) + ")");
t = reserveTile({ ...own, reserve_split: rsOf("reserve", 9, 11, "2004 911 Carrera") });
ok(t && t.head === "With a reserve" && t.line === "11 of the 20 sales had a reserve and they brought the stronger results.", "reserve card, a reserve wins (" + (t && t.line) + ")");
t = reserveTile({ ...own, reserve_split: rsOf("none", 9, 11, "2004 911 Carrera") });
ok(t && t.head === "No real difference" && t.line === "Nine no reserve and 11 with a reserve closed about level.", "reserve card, no difference (" + (t && t.line) + ")");
t = reserveTile({ ...own, reserve_split: rsOf("no_reserve", 9, 11, "2001 to 2005 911 Carrera", 36) });
ok(t && t.line2 === "Counted across 2001 to 2005 911 Carrera, in the last three years.", "reserve card: a wider scope adds the small line with the engine's scope and window (" + (t && t.line2) + ")");
t = reserveTile({ ...own, reserve_split: rsOf("no_reserve", 9, 11, "911 Carrera", 12) });
ok(t && t.line2 === "Counted across 911 Carrera, in the last 12 months.", "reserve card: a scope with no years is wider than the page's car");
ok(reserveTile({ ...own, reserve_split: null }) === null && reserveTile({ ...own }) === null && reserveTile(null) === null, "reserve card: null shows nothing");
ok(!/[–—]|%|\$/.test(JSON.stringify([reserveTile({ ...own, reserve_split: rsOf("none", 9, 11, "2001 to 2005 911 Carrera") })])), "reserve card: no dash, no percentage, no price");
// the old page-side counting is gone: the card reads only the engine field
const factsSrc = fs.readFileSync(new URL("../lib/sell/sellFacts.js", import.meta.url), "utf8"), flowSrc = fs.readFileSync(new URL("../lib/sell/sellFlow.js", import.meta.url), "utf8");
ok(!/reserveBuckets|by_reserve|RESERVE_SIDE_MIN/.test(factsSrc.replace(/\/\/[^\n]*/g, "") + flowSrc.replace(/\/\/[^\n]*/g, "")) && !/has_reserve/.test(flowSrc.replace(/\/\/[^\n]*/g, "")), "the page-side has_reserve counting is gone");
ok(/reserve_split: \(d && d\.reserve_split\) \|\| null/.test(factsSrc) && /best_day: \(d && d\.best_day\) \|\| null/.test(factsSrc), "the facts pass the engine's two fields through unchanged");
// the best day card (e91)
const { dayTile: dt2 } = await import("../lib/sell/sellFlow.js");
const bdf = { day: "Sunday", count: 5, n: 13, measure: "median_vs_pool_median_pct", lead_pct: 29.3, median: 40200, pool_median: 31100, margin: 32.2, fence: { min_sales: 5, min_margin: 5 }, window: { months: 12, from: "2025-10-27", to: "2026-10-20" } };
const bt = dt2({ best_day: bdf, window_label: "since October 2025", by_day: null });
ok(bt && bt.label === "Best day to end your auction" && bt.head === "Sunday" && bt.line === "Sunday sales have closed about 29 percent above the typical price for cars like this, five of the 13 sales since October 2025.", "best day card: label, the day, the engine's count line (" + (bt && bt.line) + ")");
ok(!/[–—]|%|\$|lead_pct/.test(JSON.stringify(bt)) && /about 29 percent above the typical price/.test(bt.line), "best day card: the engine's lead_pct as 'about N percent', no percent sign, no price, no dash");
const both = dt2({ best_day: bdf, window_label: "since October 2025", by_day: dayBuckets(drows0(), false) });
ok(both && both.label === "Best day to end your auction", "best day present: that card, never the most-often card as well");
ok(dt2({ best_day: null, window_label: "since October 2025", by_day: dayBuckets(drows0(), false) }).label === "Most often sold on a", "best day null: the most-often-sold-on card from the day counts, unchanged");
function drows0() { const r = (d, p) => ({ auction_end_date: d + "T18:00:00Z", _usd: p, _hv: p, source: "bringatrailer" }); return [...Array(5).fill(0).map((_, i) => r("2026-09-14", 50000 + i * 900)), ...Array(3).fill(0).map((_, i) => r("2026-09-15", 48000 + i * 900)), ...Array(4).fill(0).map((_, i) => r("2026-09-17", 46000 + i * 900))]; }
// 5. the day card (Oct 26 2026): the plain fact from dayBuckets, never "best"; the old label is gone
const { dayTile } = await import("../lib/sell/sellFlow.js");
const dayRow = (date, price) => ({ auction_end_date: date + "T18:00:00Z", _usd: price, _hv: price, source: "bringatrailer" });
const drows = [...Array(5).fill(0).map((_, i) => dayRow("2026-09-14", 50000 + i * 900)), ...Array(3).fill(0).map((_, i) => dayRow("2026-09-15", 48000 + i * 900)), ...Array(4).fill(0).map((_, i) => dayRow("2026-09-17", 46000 + i * 900))];
const one = dayTile({ by_day: dayBuckets(drows, false), window_label: "since October 2025" });
ok(one && one.label === "Most often sold on a" && one.head === "Monday" && one.line === "Five of the 12 sales since October 2025 ended on a Monday.", "day card: label, the day as the big word, the count line from dayBuckets (" + (one && one.label + " | " + one.head + " | " + one.line) + ")");
const tieRows = [...Array(4).fill(0).map((_, i) => dayRow("2026-09-14", 50000 + i * 900)), ...Array(4).fill(0).map((_, i) => dayRow("2026-09-17", 46000 + i * 900)), ...Array(2).fill(0).map((_, i) => dayRow("2026-09-15", 48000 + i * 900))];
const tie = dayTile({ by_day: dayBuckets(tieRows, false), window_label: "since October 2025" });
ok(tie && /^Most often sold on$/.test(tie.label) && / and /.test(tie.head), "day card: on a tie the label drops the a and the big word names both days (" + (tie && tie.head) + ")");
ok(!/Day the sale ended|best/i.test(JSON.stringify([one, tie])), "day card: no Day the sale ended, no best");
// 6. the result in pieces (Oct 26 2026): the range alone, then the rest; each reports how long its pieces took; the waiting lines are the three in the order
const chatSrc = fs.readFileSync(new URL("../api/sellChat.js", import.meta.url), "utf8");
ok(/export async function buildRange\(/.test(flowSrc) && /export async function buildRest\(/.test(flowSrc) && /export async function buildResult\(/.test(flowSrc), "the flow has the range, the rest and the whole result");
const rangeSrc = flowSrc.slice(flowSrc.indexOf("export async function buildRange("), flowSrc.indexOf("export async function buildResult("));
ok(!/sellFactsFor\(|pickPlatform\(|partnerFor\(|buildBlock\(/.test(rangeSrc) && /answerFor\(car/.test(rangeSrc) && /readBlock\(/.test(rangeSrc), "the range reads the stored block or the engine's one answer and nothing else (no pool, pick or partner read)");
ok(/timings\.resolve/.test(flowSrc) && /capped\("block_read"/.test(flowSrc) && /timings\.answer/.test(flowSrc) && /timings\.build/.test(flowSrc) && /capped\("partner"/.test(flowSrc) && /total: Date\.now\(\) - T0/.test(flowSrc), "every piece reports its milliseconds (resolve, the block read, the answer and where it came from, the build, the partner, the total)");
ok(/b\.step === "range"/.test(chatSrc) && /b\.step === "rest"/.test(chatSrc) && /b\.step === "result"/.test(chatSrc), "the Sell route answers range, rest and result");
ok(client.includes("Reading the sales for the ") && client.includes("Checking where cars like this sold") && client.includes("Nearly there") && client.includes("This one is taking longer than usual"), "the waiting lines are the ones asked for, in the client");
ok(/startWait\("sell-waitbox", \[\[0, "Reading the sales for the " \+ S\.label\]\]\)/.test(client) && /startWait\("sell-slotwait", \[\[0, "Checking where cars like this sold"\], \[8, "Nearly there"\]\]\)/.test(client), "in order: reading (until the range), then checking, then nearly there");
ok(/restFailed\(/.test(client) && /couldn\\'t read where cars like this sold yet/.test(client), "a rest that fails says so in its own place");
console.log(`sellResultLinksCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
