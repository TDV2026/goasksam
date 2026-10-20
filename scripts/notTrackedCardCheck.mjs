// notTrackedCardCheck (Lane B, Oct 20 2026, the 1932 Bugatti Type 55 card): offline check that the not-tracked carry-through
// changes nothing on a card until Lane C draws it, and that only Buy's card callers ask for it. No network, no database.
import fs from "fs";
const b = await import("../api/buySearch.js"), s = await import("../lib/live/search.js");
let bad = 0; const ok = (c, msg) => { if (!c) bad++; console.log(`${c ? "ok  " : "FAIL"} ${msg}`); };
const LINE = "We haven’t tracked a Bugatti Type 55 sale yet. When one sells, it’ll show up here.";
const nt = { kind: "not_tracked", notTrackedLine: LINE };
ok(JSON.stringify(b.samLines({ market: nt })) === JSON.stringify(b.samLines({ market: null })), "a not_tracked market adds no Sam line (the card is unchanged until Lane C draws notTrackedLine)");
ok(b.bidPlacing({ market: nt, current_bid_usd: 50000 }) === null, "no bid placing on a not_tracked market");
const range = { kind: "range", low: 40000, high: 60000, count: 12, family: "997 Carrera coupes" }; range.soldLine = s.soldLine(range);
ok(b.samLines({ market: range })[0].text === "The middle half of 997 Carrera coupe sales landed at $40,000 to $60,000.", "a range card's line is unchanged");
const src = fs.readFileSync(new URL("../lib/live/search.js", import.meta.url), "utf8");
ok(/if \(!core\) \{ const nt = opts\.notTracked \? notTrackedMem\.get\(spec\.key\) : null; return nt \? \{ kind: "not_tracked", notTrackedLine: nt \} : null; \}/.test(src), "listingMarket returns the not-tracked market only when the caller passes opts.notTracked");
const buy = fs.readFileSync(new URL("../api/buySearch.js", import.meta.url), "utf8");
const calls = (buy.match(/notTracked: true/g) || []).length;
ok(calls === 4, `only Buy's card reads ask for it (${calls} call sites in api/buySearch.js)`);
for (const f of ["../lib/tasks/tasks.js", "../lib/live/samChat.js", "../lib/live/buyAlerts.js", "../lib/live/watches.js", "../lib/live/converse.js"]) {
  ok(!/notTracked: true/.test(fs.readFileSync(new URL(f, import.meta.url), "utf8")), `${f.replace("../", "")} does not ask (keeps reading null)`);
}
console.log(bad ? `notTrackedCardCheck: ${bad} failed` : "notTrackedCardCheck: all passed");
process.exit(bad ? 1 : 0);
