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
// 4. the reserve card (from the engine's own pool; nothing when a side is under eight or the sides are level)
const { reserveTile } = await import("../lib/sell/sellFlow.js");
const { reserveBuckets } = await import("../lib/sell/sellFacts.js");
const row = (price, has) => ({ sale_price: price, hammer_usd: price, price, _usd: price, has_reserve: has, source: "bringatrailer", auction_end_date: "2026-09-01" });
const many = (n, p0, has) => Array.from({ length: n }, (_, i) => row(p0 + i * 500, has));
const win = reserveBuckets([...many(9, 60000, false), ...many(11, 50000, true)]);
ok(win && win.winner === "no_reserve" && win.no_reserve.count === 9 && win.reserve.count === 11 && win.total === 20, "reserve: both sides eight or more and a clear gap gives the better side");
const t = reserveTile({ by_reserve: win });
ok(t && t.label === "Reserve or no reserve" && t.head === "No reserve" && t.line === "nine of the 20 sales were no reserve and they brought the stronger results", "reserve card: label, the winner as the big words, the engine's counts in the line (" + (t && t.line) + ")");
ok(reserveTile({ by_reserve: reserveBuckets([...many(11, 50000, false), ...many(9, 62000, true)]) }).head === "Reserve", "reserve card: the reserve side can win");
ok(reserveBuckets([...many(7, 60000, false), ...many(30, 50000, true)]) === null && reserveTile({ by_reserve: null }) === null, "reserve: a side under eight shows nothing");
ok(reserveBuckets([...many(9, 60000, false), ...many(9, 60500, true)]) === null, "reserve: level sides show nothing");
ok(reserveBuckets(many(30, 50000, undefined)) === null && reserveBuckets([]) === null, "reserve: rows that do not say are left out; no flags, nothing");
ok(!/[–—]|%|\$/.test((t && (t.line + t.head + t.label)) || ""), "reserve card: no dash, no percentage, no price");
// 5. the day card keeps its present label until the engine can pick a best day (Change 1 stopped for a decision)
console.log(`sellResultLinksCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
