// BUY REDESIGN STAGE 1, THE CARD (Sam, Oct 19 2026; Lane C markup). Runs Buy's own client helpers on fixture cards:
// the money figure is labelled, never a bare number (LAST BID SEEN with the bid's own time until Lane E states the feed
// per source); mileage and location on one line; no VIN pill; no "Have Sam keep looking" on a card; the order photo,
// money, car, meta, specs, Sam block, history, actions. No network.
//   node scripts/buyStage1Check.mjs     exit 1 on any failure.
import fs from "node:fs";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const s = fs.readFileSync(new URL("../api/buy.js", import.meta.url), "utf8");
const i = s.indexOf("const CLIENT = ") + "const CLIENT = ".length, c = JSON.parse(s.slice(i, s.indexOf('";\n', i) + 1));
const line = from => { const a = c.indexOf(from); if (a < 0) throw new Error("missing " + from); return c.slice(a, c.indexOf("\n", a)) + "\n"; };
const block = (from, to) => { const a = c.indexOf(from), b = c.indexOf(to, a); if (a < 0 || b < 0) throw new Error("missing " + from); return c.slice(a, b); };
const env = ["  function esc(s)", "  function usd(n)", "  function num(n)", "  var TZ = ", "  function timePT(d)", "  function sameDay(a,b)", "  function bidAt(iso)", "  var SYM = ", "  function localMoney(n, cur)", "  function notUS(l)"].map(line).join("") +
  "var CPHRASE = {}; function cityOf(l){ return l.location || ''; }\n" + line("  function awayWords(d)") + block("  // onPhoto: drawn inside the photo", "  function bidAge(ms)") + line("  function localTime(t)") + block("  function bidLine(l){", "  var CUR_F = null;") + block("  // The VIN pill is not shown", "  // HAVE SAM KEEP LOOKING");
const { moneyHtml, metaLine, chipsHtml, bidLine } = new Function(env + "\nreturn { moneyHtml: moneyHtml, metaLine: metaLine, chipsHtml: chipsHtml, bidLine: bidLine };")();
const text = h => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
// The money figure: labelled, with the bid's own time; never a bare number.
const m1 = moneyHtml({ current_bid_usd: 10900, bid_at: "2026-10-19T15:35:00Z", end_time: "2099-01-01" });
ok(/^<p class="mlab"><span class="mk">LAST BID SEEN<\/span> <span class="mv">\$10,900<\/span> <span class="mt">8:35am PT/.test(m1), "a live bid: LAST BID SEEN $10,900 with its own time");
// Lane E (one auction feed, stored snapshots): a fresh bid is the last one seen too; no bid time, or an ended auction:
// no number at all, only the way to the bid.
const fresh = new Date(Date.now() - 10 * 60e3).toISOString();
ok(text(moneyHtml({ current_bid_usd: 42500, bid_at: fresh, end_time: "2099-01-01" })).startsWith("LAST BID SEEN $42,500"), "a bid under an hour old: LAST BID SEEN, never a bare 'Bid'");
ok(text(moneyHtml({ current_bid_usd: 42500, source: "Bring a Trailer", url: "https://x/1" })) === "See the bid on Bring a Trailer" && !/\$\d/.test(moneyHtml({ current_bid_usd: 42500, source: "Bring a Trailer", url: "https://x/1" })), "a bid with no time: no number, only 'See the bid on {source}'");
ok(text(moneyHtml({ current_bid_usd: 42500, bid_at: fresh, end_time: "2020-01-01", source: "Cars & Bids", url: "https://x/2" })) === "See the bid on Cars &amp; Bids" && !/\$\d/.test(moneyHtml({ current_bid_usd: 42500, bid_at: fresh, end_time: "2020-01-01", source: "Cars & Bids", url: "https://x/2" })), "an ended auction: no number, only the way to the bid");
// The detail panel's line follows the same rule.
ok(/^Last bid we saw: \$42,500 at /.test(text(bidLine({ current_bid_usd: 42500, bid_at: fresh, end_time: "2099-01-01", source: "Bring a Trailer", url: "https://x/1" }))), "panel, a fresh bid: 'Last bid we saw' with its time, never 'Bid $X'");
ok(!/\$\d/.test(bidLine({ current_bid_usd: 42500, source: "Bring a Trailer", url: "https://x/1" })) && !/\$\d/.test(bidLine({ current_bid_usd: 42500, bid_at: fresh, end_time: "2020-01-01", source: "Bring a Trailer", url: "https://x/1" })), "panel, no bid time or an ended auction: no number");
ok(!/"Bid " \+|>Bid </.test(c), "no bare 'Bid' line anywhere in the client");
ok(text(moneyHtml({ end_time: "2099-01-01" })) === "No bids yet" && moneyHtml({ bid_unknown: true }) === "", "no bid: the existing 'No bids yet'; a bid not known: nothing");
const abroad = { current_bid_usd: 30000, current_bid: 24000, currency: "GBP", country: "GB", bid_at: fresh, end_time: "2099-01-01" };
ok(/LAST BID SEEN.*\$\d/.test(text(moneyHtml(abroad))) && text(moneyHtml(abroad)).includes("(£24,000)"), "a car abroad: the USD figure with its own currency beside it, labelled");
// Mileage and location on one line, the record's own.
ok(text(metaLine({ miles: 60000, location: "Orlando, FL" })) === "60,000 miles · Orlando, FL", "mileage, then location, on one line");
ok(text(metaLine({ location: "Orlando, FL" })) === "Orlando, FL" && metaLine({}) === "", "nothing stated: nothing invented");
// The VIN pill is gone, the other chips stay.
const ch = chipsHtml({ chips: ["Automatic", "Alpine White over Saddle Brown", "VIN WBAEA5…3774"] });
ok(ch.includes("Automatic") && ch.includes("Alpine White over Saddle Brown") && !/VIN/.test(ch), "the VIN pill is not shown; the other chips stay");
// The card: the order, no keep pill, the money on the photo or at the top of the text.
const card = block("  function card(l, big, eager){", "  // THE ADAPTIVE GRID");
ok(!/keepPill\(\)/.test(card), "no 'Have Sam keep looking' on a card");
ok(!/priceLine\(l\)|placeLine\(l\)/.test(card) && /metaLine\(l\) \+ chipsHtml\(l\)/.test(card), "one meta line, then the specs");
ok(/var onPh = moneyHtml\(l, true\); if \(onPh\) ph = ph\.replace\(\/<\\\/a>\$\/, onPh \+ "<\/a>"\)/.test(card) && /money = ph \? "" : moneyHtml\(l, false\)/.test(card) && /'<div class="tx">' \+ \(ph \? "" : money\)/.test(card), "the money figure sits on the photo (inside its link), or at the top of the card when there is no photo");
ok(moneyHtml({ current_bid_usd: 42500, source: "Bring a Trailer", url: "https://x/1" }, true) === '<span class="mlab nobid">See the bid on Bring a Trailer</span>' && !/<a /.test(moneyHtml({ current_bid_usd: 42500, source: "Bring a Trailer", url: "https://x/1" }, true)), "on the photo (itself a link), the figure carries no link of its own");
const order = ["photoHtml(l, eager)", "<h3>", "metaLine(l)", "chipsHtml(l)", '<div class="sl">', 'class="hrow"', 'class="acts"'].map(x => card.indexOf(x));
ok(order.every((x, k) => x > 0 && (k === 0 || x > order[k - 1])), "the order: photo (with the money), car, meta, specs, Sam block, history, actions");
console.log(`buyStage1Check: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
