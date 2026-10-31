// THE FIND CARD'S SAM BOX (Sam, Oct 28 2026; the shape is the three slots below, ENGINE READY 10). Every Find card prints the same slots in the same order, each one the engine's: the spec, the answer (the range, or the engine's one
// thin sentence), and one small line (the count with its window and the bid). No sale line, no scope or near-miles line of the card's own: the sales are in See the sales (checks 1 to 4 once described a five-line box
// and a card of sales listed as lines; both are gone, findNoSaleLineCheck keeps it that way).
// Cause: the card was assembled by the page from several lines of its own ("Thin so far", "Only N sales of cars like this", "The typical range for cars like this", a bare list of prices that linked to Market Check).
// Cards affected: every Find card (grid and rows), Tasks' cars (the same code, lib/findCardKit.js), and the Tasks email's cars (lib/tasks/emailCards.js reads the same lines). Fixtures run the real Find path: engine answer,
// coreOf, marketFromCore, samLines, the card's client code.   node scripts/findCardShapeCheck.mjs
import fs from "node:fs";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
process.env.LAUNCH_STAGE = "2"; process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
globalThis.fetch = async () => { throw new Error("no network in this check"); };
const S = await import("../lib/live/search.js"), { samLines } = await import("../api/buySearch.js"), { mileageNearOf, slimNearPool } = await import("../lib/onebox.js");
const src = fs.readFileSync("api/buy.js", "utf8"), i0 = src.indexOf("const CLIENT = ") + "const CLIENT = ".length, C = JSON.parse(src.slice(i0, src.indexOf('";\n', i0) + 1));
const block = (from, to) => { const a = C.indexOf(from), b = C.indexOf(to, a); if (a < 0 || b < 0) throw new Error("missing " + from); return C.slice(a, b); };
const esc = x => String(x == null ? "" : x).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
const usd = n => "$" + Math.round(Number(n)).toLocaleString("en-US"), num = n => Math.round(Number(n)).toLocaleString("en-US");
const samLineOf = new Function("esc", "usd", "num", "READING_LINE", "rungHtml", "rungShown", "saleLink", "REL_MC", block("  function fxOpt(", "  // SPEC CHIPS under the bid line") + "\nreturn samLine;")(esc, usd, num, "Sam is reading the sales for this one.", () => "", () => [], t => t, true);
const flat = h => String(h || "").replace(/<[^>]+>/g, "|").replace(/\|+/g, "|").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/^\||\|$/g, "");
const sale = (price, date, month, gearbox, mi, extra = {}) => ({ price, date, month, gearbox, mi, venue: "Bring a Trailer", url: "https://bringatrailer.com/listing/x" + price, title: "x", photo: "https://img.test/" + price + ".jpg", year: 2010, body: "Convertible", ...extra });
const base = JSON.parse(fs.readFileSync("scripts/fixtures/m3Answer.json", "utf8"));
const row = (year, make, model, title, extra = {}) => ({ id: 1, listing_title: title, year, make, model, source: "bringatrailer", current_bid: 0, current_bid_usd: 0, end_time: new Date(Date.now() + 4 * 864e5).toISOString(), ...extra });
const NEAR = [270000, 281000, 297000, 190000, 205000, 160000, 150000].map((p, i) => ({ p, m: [10200, 11000, 11800, 52000, 61000, 80000, 90000][i] }));
const CARS = {
  "2010 Porsche 911 Carrera Cabriolet (six sales)": { row: row(2010, "Porsche", "911", "2010 Porsche 911 Carrera Cabriolet"), bid: 61000, d: { ...base, tier: "thin", cluster: null, poolN: 6, thinReason: "few_sales", thinLine: "Not enough sales of this exact car to give a reliable range. Here they are.", windowWords: "since June 2025", rawPool: [], cards: [1, 2, 3, 4, 5, 6].map(k => ({ price: 60000 + k * 1000 })), thin: { receipts: [1, 2, 3, 4, 5, 6], span: [61000, 66000] }, scope_reason: null, wideLine: null, optionsState: undefined, thin_sales: { count: 6, thin: true, threshold: 8, answer_line: "Six sales, too few for a range.", count_line: "Six sales since June 2025.", latest_month: "March 2026", sales: [sale(66000, "2026-03-03", "March 2026", "Manual", 31000), sale(65000, "2026-01-12", "January 2026", "PDK", 28000), sale(64000, "2025-11-20", "November 2025", "Manual", 40000), sale(63000, "2025-10-02", "October 2025", "PDK", 22000), sale(62000, "2025-08-14", "August 2025", "Manual", 55000), sale(61000, "2025-07-01", "July 2025", "PDK", 47000)] } } },
  "2002 BMW M3 Coupe (21 sales, range withheld)": { row: row(2002, "BMW", "M3", "2002 BMW M3 Coupe"), bid: 30000, d: { ...base, cluster: null, noCluster: true, poolN: 21, optionsState: "apart", headlineLines: ["Manual $38,000 to $52,000, 12 sales", "SMG $24,000 to $31,000, 9 sales"], optionLines: ["Manual $38,000 to $52,000, 12 sales", "SMG $24,000 to $31,000, 9 sales"], thinReason: "pooled_apart", thinLine: "No typical range, these sell in two groups. Pick one to read its sales.", countLine: "21 sales since March 2024.", windowWords: "since March 2024", span: [22000, 56000], wideLine: null, scope_reason: null } },
  "2015 BMW Z4 sDrive35is (scope line)": { row: row(2015, "BMW", "Z4", "2015 BMW Z4 sDrive35is"), bid: 41000, d: { ...base, cluster: [38000, 52000], poolN: 10, countLine: "Ten sales since February 2025.", windowWords: "since February 2025", scope_reason: "Too few 2015 sales, showing 2015 to 2016.", wideLine: null, optionsState: "none", span: [33000, 58000] } },
  "2014 BMW 650i M Sport Convertible (one body)": { row: row(2014, "BMW", "650i", "2014 BMW 650i M Sport Convertible"), bid: 22000, d: { ...base, cluster: [26000, 33000], poolN: 9, countLine: "Nine sales since November 2024.", windowWords: "since November 2024", scope_reason: null, wideLine: null, optionsState: "none", span: [21000, 36000] } },
  "2003 BMW Alpina Roadster V8 at 11,000 miles (mileageNear)": { row: row(2003, "BMW", "Z8", "2003 BMW Alpina Roadster V8 with 11,000 miles"), bid: 255000, miles: 11000, d: { ...base, cluster: [150000, 297000], poolN: 14, countLine: "14 sales since January 2024.", windowWords: "since January 2024", scope_reason: null, wideLine: "Wide because 10,200 to 90,000 miles. Add yours.", optionsState: "none", span: [140000, 310000], nearPool: NEAR } },
};
CARS["2014 Porsche Boxster (split, PDK and Manual)"] = { row: row(2014, "Porsche", "Boxster", "2014 Porsche Boxster S 7-Speed PDK"), bid: 29000, d: { ...base, cluster: null, noCluster: true, poolN: 21, optionsState: "split", headlineLines: ["Manual $33,000 to $43,000, 12 sales", "PDK $31,000 to $41,000, 9 sales"], optionLines: ["Manual $33,000 to $43,000, 12 sales", "PDK $31,000 to $41,000, 9 sales"], thinReason: "pooled_apart", thinLine: "No typical range, these sell in two groups.", countLine: "21 sales since November 2025.", windowWords: "since November 2025", span: [28000, 45000], wideLine: null, scope_reason: null } };
CARS["1965 Chevrolet Corvette (single live match, three sales)"] = { row: row(1965, "Chevrolet", "Corvette", "1965 Chevrolet Corvette Sting Ray Convertible"), bid: 78000, d: { ...base, cluster: null, tier: "thin", poolN: 3, thinReason: "few_sales", thinLine: "Not enough sales of this exact car to give a reliable range. Here they are.", windowWords: "since March 2025", rawPool: [], cards: [1, 2, 3].map(k => ({ price: 70000 + k * 4000 })), thin: { receipts: [1, 2, 3], span: [74000, 82000] }, scope_reason: null, wideLine: null, optionsState: undefined,
  thin_sales: { count: 3, thin: true, threshold: 8, answer_line: "Three sales, too few for a range.", count_line: "Three sales since March 2025.", latest_month: "September 2026", sales: [sale(82000, "2026-09-14", "September 2026", "Manual", 38000), sale(78000, "2026-04-02", "April 2026", "Manual", 52000), sale(74000, "2025-06-21", "June 2025", "Automatic", 61000)] } } };
CARS["2014 Porsche Boxster S PDK (matchedOption PDK)"] = { row: row(2014, "Porsche", "Boxster", "2014 Porsche Boxster S 7-Speed PDK"), bid: 29000, d: { ...CARS["2014 Porsche Boxster (split, PDK and Manual)"].d, matchedOption: "PDK" } };
const FIX_SPEC = { "1965 Chevrolet Corvette (single live match, three sales)": { v: { year: 1965, make: "Chevrolet", model: "Corvette", bodyStyle: "convertible" } }, "2014 Porsche Boxster S PDK (matchedOption PDK)": { v: { year: 2014, make: "Porsche", model: "Boxster", trim: "S" } }, "2014 Porsche Boxster (split, PDK and Manual)": { v: { year: 2014, make: "Porsche", model: "Boxster", trim: "S" } }, "2010 Porsche 911 Carrera Cabriolet (six sales)": { v: { year: 2010, make: "Porsche", model: "911", trim: "Carrera", bodyStyle: "convertible" } }, "2002 BMW M3 Coupe (21 sales, range withheld)": { v: { year: 2002, make: "BMW", model: "M3", bodyStyle: "coupe" } }, "2015 BMW Z4 sDrive35is (scope line)": { v: { year: 2015, make: "BMW", model: "Z4", trim: "sDrive35is" } }, "2014 BMW 650i M Sport Convertible (one body)": { v: { year: 2014, make: "BMW", model: "650i", trim: "M Sport", bodyStyle: "convertible" } }, "2003 BMW Alpina Roadster V8 at 11,000 miles (mileageNear)": { v: { year: 2003, make: "BMW", model: "Alpina Roadster V8" } } };
const ORDER = ["fx-ans", "fx-count", "fx-bid"]; // Oct 29 2026 card level: answer, count line, bid line; the car name is the card title's, never repeated in the box
const classes = h => [...String(h).matchAll(/<(?:p|div) class="(fx-[a-z]+)(?: [a-z -]*)?"/g)].map(m => m[1]).filter(k => k !== "fx-sl");
const bare = h => [...String(h).matchAll(/<p class="((?:fx-[a-z]+ ?)+)">/g)].map(m => m[1]);
// THE FIND CARD, THREE SLOTS (Sam, Oct 28 2026; ENGINE READY 10 market.findAnswer): the spec line, the answer (the range in the large serif, or one thin sentence), ONE small line. Never a sale line, a "pick one" line, a second range, a near-miles line of the card's own, a mileage band line.
const FA = {
  range: { state: "range", basis: "option", option: null, range: { low: 38000, high: 52000 }, n: 17, bid: "below", lines: ["17 sales since November 2024.", "The bid is below the range."], pointer: null },
  band: { state: "range", basis: "band", option: null, range: { low: 33500, high: 42000 }, n: 10, bid: "below", lines: ["Ten sales near its miles.", "The bid is below the range."], pointer: null },
  few: { state: "few", basis: "option", option: { dimension: "gearbox", value: "manual", label: "Manual" }, range: null, n: 7, bid: null, lines: ["Seven Manual sales, too few for a range.", "See the sales for all seven."], pointer: "See the sales for all seven." },
  split: { state: "split_unsaid", basis: "pooled", option: null, range: null, n: 21, bid: null, lines: ["Sales of this car split into options priced apart, and the listing does not say which."], pointer: null },
};
const mkCard = (name, over = {}, lextra = {}) => { const c = CARS[name], spec = { v: FIX_SPEC[name].v, title: c.row.listing_title }, core = S.coreOf(c.d, spec); core.nearPool = c.d.nearPool ? slimNearPool(c.d.nearPool.map(x => ({ _usd: x.p, mileage: x.m }))) : core.nearPool;
  const m = { ...S.marketFromCore(core, c.row, { miles: c.miles || null, priceUsd: c.bid }, spec), ...over }; mkCard.lastMarket = m; const l = { ...lextra, id: 1, title: c.row.listing_title, make: c.row.make, year: c.row.year, market: m, current_bid_usd: c.bid, end_time: c.row.end_time, sam_lines: [] };
  l.sam_lines = samLines(l, Date.now()); const out = samLineOf(l); return { c, m, l, h: out ? out.html : "" }; };
for (const name of Object.keys(CARS)) {
  const { c, m, l, h } = mkCard(name), t = flat(h), cls = bare(h).map(k => k.split(" ")[0]);
  ok(h.length > 20, `${name}: the Sam box prints`);
  ok(JSON.stringify(cls) === JSON.stringify(ORDER), `${name}: exactly three slots in one order (${cls.join(" > ")})`);
  ok(!/fx-spec/.test(h) && !(m.specLabel && flat(h).includes(m.specLabel)), `${name}: the box does not repeat the car name ("${m.specLabel}"); the card title carries it`);
  ok(!/fx-sale|fx-sales|fx-near|fx-lab|fx-scope|fx-wide|fx-opt/.test(h), `${name}: no sale line, near line, option label, scope or wide line of its own`);
  ok(!/Thin so far|Only \d+ sales|The typical range for cars like this|Based on \d|Market Check|market-check|Pick one|pick one/i.test(h) && !/<a /.test(h), `${name}: none of the old lines, no link in the box`);
  const second = (t.match(/\$[\d,]+ to \$[\d,]+/g) || []).length; ok(second <= 1, `${name}: at most one range (${second})`);
  ok(!/\$[\d,]+(, \$[\d,]+)+/.test(t) && !/miles/.test(t), `${name}: no sale line, no mileage in the box`);
  if (m.kind === "range") ok(/class="fx-ans fx-range"/.test(h) && new RegExp(">" + usd(m.low).replace("$", "\\$") + " to " + usd(m.high).replace("$", "\\$") + "<").test(h), `${name}: the answer is the range in the large serif`);
  else ok(/class="fx-ans fx-answer"/.test(h), `${name}: the answer is one thin sentence`);
  if (m.countLine) ok(new RegExp('<p class="fx-count">' + esc(m.countLine).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(h), `${name}: the small line starts with the engine's count ("${m.countLine}")`);
  const bid = l.sam_lines.filter(x => x.kind === "range").map(x => x.bidLine).filter(Boolean)[0];
  if (bid && m.kind === "range") ok(h.includes(esc(bid)), `${name}: the bid sentence is in the same small line ("${bid}")`);
}
// findAnswer: the page prints findAnswer.range and findAnswer.lines and nothing of its own
for (const [label, fa, name] of [["range", FA.range, "2015 BMW Z4 sDrive35is (scope line)"], ["near-miles headline", FA.band, "2003 BMW Alpina Roadster V8 at 11,000 miles (mileageNear)"], ["few", FA.few, "2010 Porsche 911 Carrera Cabriolet (six sales)"], ["split unsaid", FA.split, "2002 BMW M3 Coupe (21 sales, range withheld)"]]) {
  const { h } = mkCard(name, { findAnswer: fa }), cls = bare(h).map(k => k.split(" ")[0]), t = flat(h);
  ok(JSON.stringify(cls) === JSON.stringify(ORDER), `findAnswer ${label}: three slots (${cls.join(" > ")})`);
  if (fa.state === "range") { ok(h.includes('class="fx-ans fx-range">' + usd(fa.range.low) + " to " + usd(fa.range.high) + "<"), `findAnswer ${label}: the range is the answer`); ok(h.includes('<p class="fx-count">' + esc(fa.lines[0]) + "</p>") && h.includes('<p class="fx-bid">' + esc(fa.lines.slice(1).join(" ")) + "</p>"), `findAnswer ${label}: the count line then the bid line are the engine's lines, in order (${fa.lines.join(" ")})`); }
  else { ok(h.includes('class="fx-ans fx-answer">' + esc(fa.lines[0]) + "</p>"), `findAnswer ${label}: the answer is the engine's first line`);
    const hasBtn = !!(mkCard.lastMarket && mkCard.lastMarket.query), pointer = fa.pointer, rest = fa.lines.slice(1).filter(x => !(hasBtn && pointer && x === pointer));
    ok(h.includes('<p class="fx-count">' + esc(rest.join(" ")) + "</p>"), `findAnswer ${label}: the small line is the engine's remaining lines (${rest.join(" ") || "none: the pointer is the button's job"})`);
    // THE POINTER IS NOT PRINTED NEXT TO ITS OWN BUTTON (Sam, Oct 29 2026): a card with the See the sales button (a market query) never prints "See the sales for all five."; a card with no such button keeps it
    if (pointer) { const withBtn = mkCard(name, { findAnswer: fa, query: "a query" }), noBtn = mkCard(name, { findAnswer: fa, query: null });
      ok(!withBtn.h.includes(esc(pointer)), `findAnswer ${label}: a card with the See the sales button does not also print "${pointer}"`);
      ok(noBtn.h.includes(esc(pointer)), `findAnswer ${label}: a card with no See the sales button keeps "${pointer}"`);
      const em = mkCard(name, { findAnswer: fa, query: "a query" }, { emailCard: true }); ok(em.h.includes(esc(pointer)), `findAnswer ${label}: the Task email card (a Market Check link, no See the sales button) keeps "${pointer}"`); } ok(!/\$\d/.test(t), `findAnswer ${label}: no range printed`); }
  ok(!/pick one|miles|\$[\d,]+ · /i.test(t.replace(/near its miles/, "")), `findAnswer ${label}: no pick one, no mileage line, no sale line`);
}
// the button, and the same code on Tasks
ok(/"See the sales"/.test(C), "the card's button is See the sales");
ok(/md-opts/.test(C) && /fa1\.otherLines/.test(C) && /optShown\.map/.test(C), "the options the headline does not state (findAnswer.otherLines) print in the expanded panel (drawerHtml), not the whole list");
const kit = fs.readFileSync("lib/findCardKit.js", "utf8");
ok(/"fxOpt", "fxSlots", "fxFindHtml", "fxCount", "fxBid", "rangeFirst", "noRange", "compactNoRange", "thinSales"/.test(kit), "Tasks lifts the same box code (findCardKit)");
// optionsRemainder (Sam, Oct 29 2026, replacing the Oct 29 e101 print): a FIND CARD prints no remainder line ("2 sales do not say their gearbox."), with the engine's line set or not: the options a card did not match are Market Check's, beside the options. Market Check still prints it. Rendered in the real pages.
{ const { startBrowser, openMC } = await import("./e98Render.mjs"), { buildCards, openFind } = await import("./e98FindRender.mjs"), { M3_ROW, MC } = await import("./e98Fixtures.mjs");
  const cards = await buildCards([M3_ROW["2008 BMW M3 Coupe"], M3_ROW["2008 BMW M3 Coupe"]]), LINE = "2 sales do not say their gearbox.";
  cards.forEach((c, k) => { c.market = { ...c.market, query: "2008 bmw m3 coupe", optionsRemainder: k === 0 ? { n: 2, dimension: "gearbox", line: LINE } : null }; });
  const b = await startBrowser();
  for (const w of [1440, 390]) { const p = await openFind(b, cards, w), r = await p.evaluate(() => [...document.querySelectorAll("article.car")].map(a => ({ rem: !!a.querySelector(".fx-rem"), text: /do not say their|are over [\d,]+ miles|sales do not/i.test(a.innerText), btn: !!a.querySelector("button[data-mc]") })));
    ok(r.length >= 2 && r.every(x => x.btn && !x.rem && !x.text), `Find card at ${w}: no remainder line, whether the engine set optionsRemainder or not (${r.map(x => x.rem || x.text ? "printed" : "none").join(", ")})`); await p.close(); }
  const fxd = MC["2004 BMW M3 (split)"], rl = fxd.d.optionsRemainder && fxd.d.optionsRemainder.line;
  for (const w of [1440, 390]) { const p = await openMC(b, fxd, w), t = await p.evaluate(() => document.body.innerText.replace(/\s+/g, " ")); ok(!!rl && t.includes(rl), `Market Check at ${w}: the remainder line still prints beside the options ("${rl}")`); await p.close(); }
  await b.close(); }
console.log(`findCardShapeCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
