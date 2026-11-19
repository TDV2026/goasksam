// typicalRangeWordsCheck (Lane B, Oct 21 2026, Sam's Market Check fix 1: "The typical range for cars like this", no definition anywhere
// but the partner card's one line and How Sam decides): offline. Reads the sources and checks that the reader-facing sentences say
// "typical range" and that no reader-facing text still says "middle half", "percentile" or "25th"; the engine's own comments and
// code (internal) are not read. The partner card's HOW_LINE is the one allowed definition.
import fs from "fs";
let bad = 0;
const ok = (c, m) => { console.log((c ? "ok   " : "FAIL ") + m); if (!c) bad++; };
const rd = f => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter(l => !/^\s*\/\//.test(l)).join("\n");
const SOURCES = ["lib/live/buyAlerts.js", "lib/live/search.js", "api/buy.js", "api/partnerDemo.js", "public/js/onebox.js", "lib/sell/sellFlow.js", "lib/live/marketCheckLanding.js"];
for (const f of SOURCES) {
  const s = strip(rd(f));
  // the sentences themselves (api/buy.js is one big client string, so its comments are not told apart; the old SENTENCES are)
  const hits = (f === "api/buy.js" ? (s.match(/middle half of comparable sales landed here|The middle half of \\" \+ \(m\.salesNoun/g) || []) : s.match(/(The|the) middle half (of|was)|middle half landed|the range the middle half|edge of the middle half|closest to typical|\d+(st|th) percentile/g) || []);
  ok(hits.length === 0, `${f}: no reader-facing "The middle half of", "middle half landed", "edge of the middle half" or "percentile" sentence (${hits.length ? hits[0] : "none"})`);
}
ok(/The typical range for \$\{noun\}: /.test(rd("lib/live/buyAlerts.js")), "(1) the email line says the typical range");
ok(/The typical range for \$\{salesNoun\(m\)\}: /.test(rd("lib/live/search.js")), "(2) the Buy card line says the typical range");
ok(/the typical range for comparable sales/.test(rd("api/buy.js")) && /Typical miles for/.test(rd("api/buy.js")), "(3) and (4) the Buy drawer and the miles fact");
ok(/The typical range, from /.test(rd("api/partnerDemo.js")), "(5) the partner demo line");
const o = rd("public/js/onebox.js");
// Nov 19 2026 (stale pins, three of them moved on purpose):
//  (7) the prior-year sentence is built by the engine now (reason table trend.prior_year, "(written by the page ...)" before), no longer in the page;
//  (8) the Sell day-range comparison sentence was removed (bcf321a3, "no day-range comparison sentence"), so the check pins that it stays gone and that the sell flow says no "middle half";
//  (9) the Market Check landing sub is Sam's locked Oct 9 2026 headline wording ("See what cars like yours actually sold for."), not a typical-range sentence.
const rw = rd("lib/reasonWords.js");
ok(/The typical range for comparable sales, without the extremes at either end\./.test(o) && /one at each edge of it\./.test(o) && /"trend\.prior_year":[^\n]*The year before, the typical range was /.test(rw) && !/The year before, the typical range/.test(strip(o)), "(6), (7) and (11) the Market Check lines (7 from the engine's reason table, never written by the page)");
ok(!/The typical range for \$\{t\.day\} sales was /.test(rd("lib/sell/sellFlow.js")) && !/middle half/i.test(strip(rd("lib/sell/sellFlow.js"))), "(8) the Sell day tile sentence stays gone and the sell flow has no middle half");
ok(/sub: "See what cars like yours actually sold for\."/.test(rd("lib/live/marketCheckLanding.js")) && !/middle half|percentile/i.test(strip(rd("lib/live/marketCheckLanding.js"))), "(9) the Market Check landing sub is Sam's locked wording and has no middle half");
ok(/HOW_LINE = "The typical range is the middle of the market: a quarter of sales landed below it and a quarter above\."/.test(rd("api/partnerAnswer.js")), "(10) the partner card's one definition");
ok(/The typical range of those sales\./.test(rd("api/_chrome.js")) && !/where most of those sales landed/.test(rd("api/_chrome.js")), "(12) the history and hub pages' note");
console.log(bad ? `typicalRangeWordsCheck: ${bad} failed` : "typicalRangeWordsCheck: all passed");
process.exit(bad ? 1 : 0);
