// THE FIND CARD'S SAM BOX, ONE SHAPE (Sam, Oct 29 2026). Every Find card prints the same lines in the same order, each one the engine's: (1) the spec, the engine's identity of the live car; (2) the scope, only when the engine sends
// one; (3) the answer: the range on its own line, or the engine's reason line when a range is withheld, or "Six sales, too few for a range."; (4) the count with its window and the bid, in one line; (5) when the engine sends
// mileageNear, the sales near the car's own miles with the bid against them; then the wide line, only when set. A card of sales only lists each sale as a line (price, month, gearbox, miles) that opens the Sold before modal's shape.
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
const FIX_SPEC = { "2010 Porsche 911 Carrera Cabriolet (six sales)": { v: { year: 2010, make: "Porsche", model: "911", trim: "Carrera", bodyStyle: "convertible" } }, "2002 BMW M3 Coupe (21 sales, range withheld)": { v: { year: 2002, make: "BMW", model: "M3", bodyStyle: "coupe" } }, "2015 BMW Z4 sDrive35is (scope line)": { v: { year: 2015, make: "BMW", model: "Z4", trim: "sDrive35is" } }, "2014 BMW 650i M Sport Convertible (one body)": { v: { year: 2014, make: "BMW", model: "650i", trim: "M Sport", bodyStyle: "convertible" } }, "2003 BMW Alpina Roadster V8 at 11,000 miles (mileageNear)": { v: { year: 2003, make: "BMW", model: "Alpina Roadster V8" } } };
const ORDER = ["fx-spec", "fx-scope", "fx-range", "fx-answer", "fx-opt", "fx-sales", "fx-count", "fx-near", "fx-wide"];
const classes = h => [...String(h).matchAll(/<(?:p|div) class="(fx-[a-z]+)"/g)].map(m => m[1]).filter(k => k !== "fx-sl");
for (const [name, c] of Object.entries(CARS)) {
  const spec = { ...S.specOf(c.row), ...FIX_SPEC[name], title: c.row.listing_title };
  const core = S.coreOf(c.d, spec); ok(!!core, `${name}: the engine answer becomes a core`);
  if (!core) continue;
  core.nearPool = c.d.nearPool ? slimNearPool(c.d.nearPool.map ? c.d.nearPool.map(x => ({ _usd: x.p, mileage: x.m })) : []) : core.nearPool;
  const m = S.marketFromCore(core, c.row, { miles: c.miles || null, priceUsd: c.bid }, spec);
  const l = { id: 1, title: c.row.listing_title, make: c.row.make, year: c.row.year, market: m, current_bid_usd: c.bid, end_time: c.row.end_time, sam_lines: [] };
  l.sam_lines = samLines(l, Date.now());
  const out = samLineOf(l), h = out ? out.html : "", t = flat(h), cls = classes(h);
  ok(h.length > 20, `${name}: the Sam box prints`);
  // order: the classes are a subsequence of the five-line order, no repeats
  let at = -1, inOrder = true; for (const k of cls) { const j = ORDER.indexOf(k); if (j < at || (j === at && k !== "fx-opt")) inOrder = false; at = Math.max(at, j); }
  ok(inOrder && cls.length >= 3, `${name}: the lines come in the one order (${cls.join(" > ")})`);
  ok(cls[0] === "fx-spec" && h.includes(esc(m.specLabel || "~")), `${name}: line 1 is the engine's spec ("${m.specLabel}")`);
  if (c.d.scope_reason) ok(cls[1] === "fx-scope" && h.includes(esc(c.d.scope_reason)), `${name}: line 2 is the engine's scope`);
  else ok(!cls.includes("fx-scope"), `${name}: no scope line where the engine sends none`);
  if (m.kind === "range") ok(cls.includes("fx-range") && new RegExp(">" + usd(m.low).replace("$", "\\$") + " to " + usd(m.high).replace("$", "\\$") + "<").test(h), `${name}: line 3 is the range on its own line`);
  else ok(cls.includes("fx-answer") && !!m.answerLine && h.includes(esc(m.answerLine)) || (m.thin_sales && h.includes(esc(m.thin_sales.answer_line))), `${name}: line 3 is the engine's reason line (${m.answerLine || (m.thin_sales && m.thin_sales.answer_line)})`);
  if (m.countLine) ok(new RegExp('<p class="fx-count">' + esc(m.countLine).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(h), `${name}: line 4 starts with the engine's count and window ("${m.countLine}")`);
  const bid = l.sam_lines.filter(x => x.kind === "range").map(x => x.bidLine).filter(Boolean)[0];
  if (bid) ok(h.includes(esc(bid)) && h.indexOf(esc(m.countLine || "~")) < h.indexOf(esc(bid)), `${name}: the bid sentence follows the count in the same line ("${bid}")`);
  if (m.mileageNear && m.mileageNear.line) ok(cls.includes("fx-near") && h.includes(esc(m.mileageNear.line)), `${name}: line 5 is the engine's mileageNear ("${m.mileageNear.line}${m.mileageNear.bidLine ? " " + m.mileageNear.bidLine : ""}")`);
  if (m.wideLine) ok(cls[cls.length - 1] === "fx-wide" && h.includes(esc(m.wideLine)), `${name}: the wide line comes last`);
  // never: the old strings, a link, a bare price list
  ok(!/Thin so far|Only \d+ sales|The typical range for cars like this|Based on \d|Market Check|market-check/i.test(h), `${name}: none of the old lines or links`);
  ok(!/<a /.test(h), `${name}: no link in the box (a sale opens the modal, nothing goes to Market Check)`);
  ok(!/\$[\d,]+(, \$[\d,]+)+/.test(t) && !/^(\|?\$[\d,]+\|?)+$/.test(t), `${name}: no bare list of prices`);
  if (m.thin_sales && m.thin_sales.sales && m.thin_sales.sales.length) {
    const btns = [...h.matchAll(/<button type="button" class="fx-sale" data-fxsale="(\d+)"[^>]*>([^<]*)<\/button>/g)];
    ok(btns.length === m.thin_sales.sales.length, `${name}: each sale is a line that opens the modal (${btns.length})`);
    ok(btns.every((b, k) => { const s = m.thin_sales.sales[k]; return b[2].includes(usd(s.price)) && b[2].includes(s.month) && (!s.gearbox || b[2].includes(s.gearbox)) && (!(s.mi > 0) || b[2].includes(num(s.mi) + " miles")); }), `${name}: a sale line carries price, month, gearbox and miles from the engine`);
  }
  // no word the engine did not send: remove every engine string and every number, what is left has no letters
  let rest = t; for (const e of [m.specLabel, c.d.scope_reason, m.answerLine, m.thin_sales && m.thin_sales.answer_line, m.countLine, bid, m.wideLine, m.mileageNear && m.mileageNear.line, m.mileageNear && m.mileageNear.bidLine, ...(m.optionLines || []), ...((m.thin_sales && m.thin_sales.sales) || []).flatMap(s => [s.month, s.gearbox, "miles"])]) if (e) rest = rest.split(String(e)).join("|");
  rest = rest.replace(/\$[\d,]+/g, "|").replace(/[\d,]+/g, "|").replace(/\bto\b/g, "|");
  ok(!/[A-Za-z]/.test(rest), `${name}: no word on the box that the engine did not send (left over: "${rest.replace(/\|+/g, " ").trim()}")`);
}
// the button, and the same code on Tasks
ok(/"See the sales"/.test(C), "the card's button is See the sales");
const kit = fs.readFileSync("lib/findCardKit.js", "utf8");
ok(/"fxHead", "fxTail", "rangeFirst", "noRange", "compactNoRange", "saleLineText", "thinSales"/.test(kit), "Tasks lifts the same box code (findCardKit)");
console.log(`findCardShapeCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
