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
const a = withLink.match(/<a class="sfc-footer-link" href="([^"]*)" target="_blank" rel="noopener">See the sales<\/a>/);
ok(a && a[1] === href, "See the sales opens Market Check for the same car in a new tab (target _blank, rel noopener)");
ok(withLink.indexOf("See the sales") < withLink.indexOf("How Sam decides") && withLink.includes('<a class="sfc-footer-link" href="/how-sam-decides">How Sam decides</a>'), "See the sales sits next to How Sam decides, the same style, and How Sam decides keeps its own link");
ok(!plain.includes("See the sales") && !plain.includes("data-href"), "a card drawn without the address (Market Check, Find, the partner demo) is unchanged");
ok(/\$70,000/.test(withLink) && /\$95,000/.test(withLink), "the range is the engine's (card unchanged apart from the link)");
// the address is built from the very words the engine read, and the click opens a new tab without touching the card's own links
ok(/marketHref: "\/market-check\?q=" \+ encodeURIComponent\(engineCar\(\)\)/.test(client), "the Sell client builds the address from engineCar(), the words the engine just read");
ok(/window\.open\(rc\.getAttribute\("data-href"\), "_blank", "noopener"\)/.test(client) && /closest\("a, button"\)/.test(client), "the whole card opens it in a new tab, and a click on a link or button inside keeps its own target");
ok(/\.sfc-card\[data-href\]\{cursor:pointer\}/.test(fs.readFileSync(new URL("../lib/sellsForCard.js", import.meta.url), "utf8")), "the card shows a pointer");
ok(!/[–—]/.test(withLink), "no dashes");
console.log(`sellResultLinksCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
