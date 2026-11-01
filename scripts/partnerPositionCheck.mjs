// THE PARTNER ANSWER PLACES TYPED PRICES AND ORDERS THE SALES; THE PAGE COMPARES NOTHING (Lane B, Nov 1 2026; Lane E's NEEDS LANE B note for the eBay listing form, partner view b).
// CAUSE: api/partnerAnswer.js took no price and no mileage, so api/partnerDemo.js worked out "below / inside / above" itself (placing(), used by views b and c) and had no sales in the order closest to a mileage.
// FIX: lib/onebox.js partnerPositionsOf (read time, from the finished answer; placingFor is the one comparison): positions[] for up to four tagged prices (starting_bid, buy_it_now, reserve, item_price), and five sales { date, miles, price, name, photo (by id), place } (no venue and no address, Sam Nov 1 2026)
// in the order asked (miles | date | price; miles falls back to date with no mileage, and the order echoed is the one used). api/partnerAnswer.js passes them as positions, placedSales and order only when the request carries a price, a mileage or an order;
// the stored answer and the rest of the answer are unchanged. The page's placing() now only words an entry it is given. CLASS: any page that compares a price with the engine's range. This check fails without the fix.
//   node scripts/partnerPositionCheck.mjs [repo root]
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href), PA = await import(pathToFileURL(path.join(root, "api/partnerAnswer.js")).href);
const fn = E.partnerPositionsOf; ok("lib/onebox.js exports partnerPositionsOf", typeof fn === "function");
const DEAD = JSON.parse(fs.readFileSync("data/deadPhotoHosts.json", "utf8")).hosts[0].host;
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const card = (price, date, mi, extra = {}) => ({ id: uid(price), price, date, mi, title: `${date.slice(0, 4)} Porsche 911 GT3`, platformName: "Bring a Trailer", platform: "Bring a Trailer", url: "https://example.test/lot/" + price, image: "https://img.example.test/" + price + ".jpg", ...extra });
const CARDS = [card(70000, "2026-03-10", 21000), card(82000, "2026-01-05", 9000), card(64000, "2025-12-20", 44000), card(91000, "2026-04-02", 15000), card(76000, "2025-11-11", null), card(88000, "2026-02-14", 32000), card(61000, "2025-10-01", 30000, { image: `https://${DEAD}/a.jpg` })];
const D = { tier: "result", cluster: [65000, 90000], cards: CARDS };
if (fn) {
  // 1. typed prices
  const P = r => Object.fromEntries(r.positions.map(p => [p.key, p]));
  const r1 = fn(D, { prices: { starting_bid: 50000, buy_it_now: 75000, reserve: 65000, item_price: 90001 } }), p1 = P(r1);
  ok("a price below the range is below", p1.starting_bid && p1.starting_bid.place === "below");
  ok("a price inside the range is within", p1.buy_it_now && p1.buy_it_now.place === "within");
  ok("a price equal to the low end is within", p1.reserve && p1.reserve.place === "within");
  ok("a price above the range is above", p1.item_price && p1.item_price.place === "above");
  ok("every entry carries the key, the value and the middle half it judged against", r1.positions.every(p => p.value > 0 && p.low === 65000 && p.high === 90000) && r1.positions.length === 4);
  ok("a price equal to the high end is within", P(fn(D, { prices: { reserve: 90000 } }).positions.length ? fn(D, { prices: { reserve: 90000 } }) : { positions: [] }).reserve.place === "within");
  const r2 = fn(D, { prices: { starting_bid: 0, buy_it_now: -5, reserve: NaN, item_price: "x", bogus: 70000 } });
  ok("a price it cannot place has no entry (zero, negative, not a number, an unknown tag)", r2.positions.length === 0);
  // 2. no range: no positions, no sales
  const r3 = fn({ tier: "thin", cluster: null, cards: CARDS }, { prices: { reserve: 70000 }, mileage: 20000, order: "miles" });
  ok("no range: no positions and no sales", r3.positions.length === 0 && r3.sales.length === 0, JSON.stringify([r3.positions.length, r3.sales.length]));
  // 3. the sales: five, three orders
  const dates = fn(D, { order: "date" }), prices = fn(D, { order: "price" }), miles = fn(D, { order: "miles", mileage: 20000 });
  ok("five sales", dates.sales.length === 5 && prices.sales.length === 5 && miles.sales.length === 5);
  ok("each sale carries date, miles, price, title and place", dates.sales.every(s => "date" in s && "miles" in s && s.price > 0 && s.title && ["below", "within", "above"].includes(s.place)));
  ok("a sale carries NO venue and NO address, at the source (the engine's own rows, not hidden by a page)", [dates, prices, miles].every(r => r.sales.every(s => !("venue" in s) && !("url" in s) && !JSON.stringify(s).match(/Bring a Trailer|https?:/i))), JSON.stringify(dates.sales[0]));
  ok("order date: newest first", dates.order === "date" && dates.sales.map(s => s.date).join() === ["2026-04-02", "2026-03-10", "2026-02-14", "2026-01-05", "2025-12-20"].join(), dates.sales.map(s => s.date).join());
  ok("order price: highest price first, the newer sale first on a tie", prices.order === "price" && prices.sales.map(s => s.price).join() === CARDS.slice().sort((x, y) => y.price - x.price || Date.parse(y.date) - Date.parse(x.date)).slice(0, 5).map(c => c.price).join(), prices.sales.map(s => s.price).join());
  // nearest to 20,000 miles on known mileages: 21000 (1000), 15000 (5000), 9000 (11000), 32000 (12000), 30000 (10000 -> before 9000? 9000 is 11000 away)
  ok("order miles: nearest to the typed mileage first (known mileages)", miles.order === "miles" && miles.sales.map(s => s.miles).join() === "21000,15000,30000,9000,32000", miles.sales.map(s => s.miles).join());
  const all = fn({ ...D, cards: CARDS.slice(0, 6) }, { order: "miles", mileage: 20000 });
  ok("a sale with no mileage comes after every sale that has one (six sales, one with none, five shown)", all.sales.length === 5 && all.sales.every(s => s.miles != null));
  // 4. fallbacks
  const nm = fn(D, { order: "miles" });
  ok("order miles with no mileage falls back to date and says so", nm.order === "date" && nm.sales[0].date === "2026-04-02", nm.order);
  ok("no order and no mileage is date; a mileage with no order is nearest-miles", fn(D, {}).order === "date" && fn(D, { mileage: 20000 }).order === "miles");
  // 5. photo
  const ph = fn({ ...D, cards: [CARDS[6], CARDS[0]] }, { order: "date" });
  ok("a sale whose photo host is dead returns no photo", ph.sales.find(s => s.price === 61000) && !("photoId" in ph.sales.find(s => s.price === 61000)));
  ok("a sale with a photo on a live host returns it, by id (never an address)", ph.sales.find(s => s.price === 70000).photoId === uid(70000));
  ok("a sale with no photo returns none", !("photoId" in fn({ ...D, cards: [card(70000, "2026-03-10", 21000, { image: null })] }, { order: "date" }).sales[0]));
  // 6. fewer than five
  ok("fewer than five sales returns fewer", fn({ ...D, cards: CARDS.slice(0, 3) }, { order: "date" }).sales.length === 3);
  // 7. each sale's place is the same comparison
  ok("each sale's place is against the same range", dates.sales.every(s => s.place === (s.price < 65000 ? "below" : s.price > 90000 ? "above" : "within")));
}
// 8. the request: shapes, and nothing asked means nothing added
const ask = PA.positionAskOf;
ok("positionAskOf exists", typeof ask === "function");
if (ask) {
  ok("a request with no price, mileage or order carries no ask (the answer is exactly what it was)", ask({ q: "2014 Porsche 911 GT3" }) === null);
  const a1 = ask({ prices: { reserve: "85,000", item_price: 90000 }, mileage: "30,400", order: "miles" });
  ok("tagged prices (as a nested object), mileage and order are read", a1 && a1.prices.reserve === 85000 && a1.prices.item_price === 90000 && a1.mileage === 30400 && a1.order === "miles", JSON.stringify(a1));
  const a2 = ask({ starting_bid: "$50,000", buy_it_now: 99000, reserve: 80000, item_price: 90000, extra: 5 });
  ok("the four tags as flat fields, up to four prices", a2 && Object.keys(a2.prices).length === 4 && !("extra" in a2.prices));
  ok("a JSON string of prices is read", ask({ prices: JSON.stringify({ reserve: 70000 }) }).prices.reserve === 70000);
  ok("an unknown order is dropped", ask({ order: "alphabetical", mileage: 5000 }).order === null);
  const leaks = o => PA.venueLeak(o);
  ok("placedSaleOf exists", typeof PA.placedSaleOf === "function");
  const row = PA.placedSaleOf({ date: "2026-04-02", miles: 15000, price: 91000, title: "2014 Porsche 911 GT3", photoId: uid(91000), place: "within" });
  ok("a placed sale is date, miles, price, name, photo (by id) and place, nothing else", JSON.stringify(Object.keys(row)) === JSON.stringify(["date", "miles", "price", "name", "photo", "place"]) && row.photo === uid(91000), JSON.stringify(row));
  ok("a placed sale has no venue, no address and no title key", !("venue" in row) && !("url" in row) && !("title" in row) && !JSON.stringify(row).match(/https?:/));
  ok("a placed sale with no photo has no photo key", !("photo" in PA.placedSaleOf({ date: "2026-04-02", miles: 1, price: 5, title: "x", place: "within" })));
  ok("the guard blocks nothing less than before: a placed sale answer is clean", leaks({ ok: true, positions: [{ key: "reserve", value: 1, place: "within", low: 1, high: 2 }], placedSales: [row], order: "date" }).length === 0);
  ok("the guard exempts nothing: a venue, an address or a title key in placedSales is blocked", leaks({ placedSales: [{ ...row, venue: "x" }] }).length > 0 && leaks({ placedSales: [{ ...row, url: "https://example.test/x" }] }).length > 0 && leaks({ placedSales: [{ ...row, title: "x" }] }).length > 0);
  ok("a venue name in a sale's title is still blocked", leaks({ ok: true, placedSales: [{ ...row, name: "2014 Porsche 911 GT3 on Bring a Trailer" }] }).length > 0 && leaks({ ok: true, sales: [{ name: "2014 Porsche 911 GT3, Bonhams" }] }).length > 0);
  ok("placedSaleOf never lets a title that names a venue through (the venue-safe name, as the other rows)", PA.placedSaleOf({ date: null, miles: null, price: 5, title: "2014 Porsche 911 GT3 Bring a Trailer", place: "within" }).name === null);
  ok("any other field still cannot carry a venue or a url", leaks({ ok: true, sales: [{ title: "x", url: "https://example.test/x" }] }).length > 0 && leaks({ ok: true, positions: [{ venue: "x" }] }).length > 0);
}
// 9. the wiring: read time, after the last good answer is stored, and the stored shortcut is skipped for a request that asks
const strip = t => t.replace(/\/\/[^\n]*/g, "");
const pa = strip(fs.readFileSync("api/partnerAnswer.js", "utf8"));
ok("the answer guard has no exemption for any path", !/placedSales/.test(pa.slice(pa.indexOf("export function venueLeak"), pa.indexOf("export default async function handler"))));
const iStore = pa.indexOf("writeLast(env, lk, storedWithPlaced(out, r.d))"), iPos = pa.indexOf("partnerPositionsOf(r.d, ask)");
ok("positions are added after the last good answer is stored, so a stored answer never carries them", iStore > 0 && iPos > iStore, `${iStore} < ${iPos}`);
ok("a request that needs the live engine (a typed mileage, another order, a stored answer without the placed sales) is read through Market Check", /servedFromStored\(qlast\.out, ask\)/.test(pa) && /ask\.mileage \|\| \(ask\.order && ask\.order !== "date"\)/.test(pa));
// 10. THE CLASS: no page compares a price with the engine's range. A comparison with a number (range.low > 0) is a test for a range, not a place.
const COMPARE = /[<>]=?\s*(?!0\b)[\w$.\[\]]*range\.(?:low|high)\b|range\.(?:low|high)\s*[<>]=?\s*(?!0\b)[\w$.\[\]]/;
const ALLOW = [
  { file: "api/partnerDemo.js", has: "p <= a.range.high", why: "the sample asking price of the listing mock (a demo constant for a typed car with no listing), not a typed price; Lane E: ask the engine for it when view b is rebuilt" },
  { file: "api/partnerDemo.js", has: "a.range.high >= a.range.low", why: "the range against itself (a sanity test)" },
  { file: "api/_amazonDemo.js", has: "sl.price >= a.range.low", why: "the Amazon demo's fixed sample price kept only when it sits in the range (a demo constant, not typed)" }
];
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? (/node_modules|\.git/.test(e.name) ? [] : walk(path.join(d, e.name))) : /\.(js|mjs|html)$/.test(e.name) ? [path.join(d, e.name)] : []);
const hits = [];
for (const f of [...walk("api"), ...walk("public")]) {
  if (f === path.join("api", "partnerAnswer.js")) continue;
  const text = fs.readFileSync(f, "utf8");
  text.split("\n").forEach((line, i) => { if (!COMPARE.test(line.replace(/\\"/g, '"'))) return; const al = ALLOW.find(a => a.file === f.split(path.sep).join("/") && line.includes(a.has)); if (!al) hits.push(`${f}:${i + 1}: ${line.trim().slice(0, 90)}`); });
}
ok("no page file compares a price with the range (api/partnerDemo.js and every file under api and public)", hits.length === 0, hits.slice(0, 3).join(" | "));
const pd = fs.readFileSync("api/partnerDemo.js", "utf8");
ok("api/partnerDemo.js has no placing() (Sam, Nov 1 2026) and words only the engine's positions (posOf, posPill)", !/\bplacing\s*\(/.test(pd) && /function posOf\(a, key\)\{[^}]*\.positions|var l = a && a\.positions/.test(pd) && /function posPill\(p, who\)\{[^}]*PLACE_PILL\[p && p\.place\]/.test(pd));
ok("the listing views send their prices to the engine (c: item_price; b: starting bid, Buy It Now, reserve or item price, and the mileage and order)", /prices: \{ item_price: D\.price \}/.test(pd) && /body\.prices = pr/.test(pd) && /body\.mileage = mi/.test(pd) && /body\.order = /.test(pd));
// 11. span (the bar's ends) is the engine's exact lowest and highest sale, and the contract says so
{ const sh = PA.partnerShape({ status: "one_box", tier: "result", cluster: [130000, 150000], span: [100000, 200000], lowestSaleN: 123456, highestSaleN: 187654, poolN: 12, cards: [] }, "x", 0, {});
  ok("span is lowestSaleN / highestSaleN (exact), never the rounded rail d.span", sh.span && sh.span.low === 123456 && sh.span.high === 187654, JSON.stringify(sh.span));
  ok("span is null without a range", PA.partnerShape({ status: "one_box", tier: "thin", cluster: null, span: [1, 2], lowestSaleN: 5, highestSaleN: 9, poolN: 3, cards: [] }, "x", 0, {}).span === null);
  ok("span is numbers only and clean under the answer guard", PA.venueLeak({ span: sh.span }).length === 0 && Object.values(sh.span).every(v => typeof v === "number"));
  const doc = fs.readFileSync("docs/partner-answer-contract.md", "utf8");
  ok("docs/partner-answer-contract.md lists positions, placedSales, order and span, and that no venue or address is in a sale", /positions\[\]/.test(doc) && /placedSales\[\]/.test(doc) && /`span`/.test(doc) && /No venue and no address/.test(doc)); }
console.log(fail ? `partnerPositionCheck: ${fail} failure(s)` : "partnerPositionCheck: all pass");
process.exit(fail ? 1 : 0);
