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
ok(b.samLines({ market: range })[0].text === "The typical range for 997 Carrera coupe sales: $40,000 to $60,000.", "a range card's line is unchanged");
const src = fs.readFileSync(new URL("../lib/live/search.js", import.meta.url), "utf8");
// Nov 19 2026 (stale shape): the no-core line grew the zero-sales and refusal answers (Lane B), so the old one-line regex no longer matched. The intent is unchanged and is pinned
// by meaning: in the no-core branch of listingMarket every not-tracked / refused answer is gated on opts.notTracked, and the fall-through for a caller that does not ask is null.
const noCore = (src.match(/if \(!core\) \{ const nt = [^\n]*/) || [""])[0];
ok(/const nt = opts\.notTracked \? notTrackedMem\.get\(spec\.key\) : null;/.test(noCore) && /const zero = opts\.notTracked && thinZeroMem\.has\(spec\.key\);/.test(noCore) && /const rf = opts\.notTracked \? refusalMem\.get\(spec\.key\) : null;/.test(noCore) && /return opts\.notTracked \? \{ kind: "not_tracked"[^}]*\} : null; \}/.test(noCore), "listingMarket returns the not-tracked market only when the caller passes opts.notTracked");
const buy = fs.readFileSync(new URL("../api/buySearch.js", import.meta.url), "utf8");
// Buy's card paths grew (the second go after a pending read, the lot rows), so the count is not pinned to 4: Buy asks only through listingMarket, and at least its four card reads do.
// The other callers (tasks, buy alerts, watches) are pinned below not to ask.
const calls = (buy.match(/notTracked: true/g) || []).length, viaListing = (buy.match(/listingMarket\([^)]*\{[^}]*notTracked: true/g) || []).length;
ok(calls >= 4 && calls === viaListing, `only Buy's card reads ask for it, each through listingMarket (${calls} call sites in api/buySearch.js)`);
// the chat search's own cards ask too (Oct 20 2026, the Bugatti card on the chat path), and its facts still read no market
const chat = fs.readFileSync(new URL("../lib/live/samChat.js", import.meta.url), "utf8"), conv = fs.readFileSync(new URL("../lib/live/converse.js", import.meta.url), "utf8");
ok(/listingMarket\(env, x\.r, x\.facts, \{ noBlock: true, notTracked: true \}\)/.test(chat), "the chat search's cards ask for the not-tracked line");
ok(/listingMarket\(env, x\.r, x\.facts, \{ noBlock: true, notTracked: true \}\)/.test(conv), "the chat search's price-filtered cards ask too");
const { applyRung } = await import("../lib/live/rung.js");
ok(JSON.stringify(applyRung(nt)) === JSON.stringify(nt), "the rung step passes a not_tracked market through untouched");
ok(!applyRung(nt).family, "a not_tracked market has no family, so the chat's facts read it as no market (as before)");
for (const f of ["../lib/tasks/tasks.js", "../lib/live/buyAlerts.js", "../lib/live/watches.js"]) {
  ok(!/notTracked: true/.test(fs.readFileSync(new URL(f, import.meta.url), "utf8")), `${f.replace("../", "")} does not ask (keeps reading null)`);
}
console.log(bad ? `notTrackedCardCheck: ${bad} failed` : "notTrackedCardCheck: all passed");
process.exit(bad ? 1 : 0);
