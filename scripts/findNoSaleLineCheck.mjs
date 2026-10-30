// NO SALE LINE ON A FIND CARD (Sam, Oct 28 2026; ENGINE READY 10, market.findAnswer). The Find card is three slots (spec, answer, one small line) and prints no sale line: not a list of prices, not a "$a, $b" row, not a month and
// miles row, not a button that opens one. The sales are in See the sales. Cause of the fault this check came from: findCardKitCheck, findSalesButtonCheck and findCardShapeCheck's own header still described the old shape
// (a card of sales listed as lines; the engine's count in digits), so they failed on the new card while the card was right. Cards affected: every Find card (grid, rows, history of a search), Tasks' cars (the same code, lib/findCardKit.js)
// and the Task email's cars. The email prints the engine's sale rows only when the engine's emailMode is "sales" (Sam, Oct 26); it never prints them for any other mode.
// The class: the card's code has no sale-line builder, and a card whose engine answer carries three sales (the old trigger) renders none.   node scripts/findNoSaleLineCheck.mjs
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
const sale = (price, date, month, gearbox, mi) => ({ price, date, month, gearbox, mi, venue: "Bring a Trailer", url: "https://bringatrailer.com/listing/x" + price, title: "x", photo: "https://img.test/" + price + ".jpg", year: 1965, body: "Convertible" });
const base = JSON.parse(fs.readFileSync("scripts/fixtures/m3Answer.json", "utf8"));
const SALES = [sale(82000, "2026-09-14", "September 2026", "Manual", 38000), sale(78000, "2026-04-02", "April 2026", "Manual", 52000), sale(74000, "2025-06-21", "June 2025", "Automatic", 61000)];
const THIN = { count: 3, thin: true, threshold: 8, answer_line: "Three sales, too few for a range.", count_line: "Three sales since March 2025.", latest_month: "September 2026", sales: SALES };
const d = { ...base, cluster: null, tier: "thin", poolN: 3, thinReason: "few_sales", windowWords: "since March 2025", rawPool: [], cards: [1, 2, 3].map(k => ({ price: 70000 + k * 4000 })), thin: { receipts: [1, 2, 3], span: [74000, 82000] }, scope_reason: null, wideLine: null, optionsState: undefined, thin_sales: THIN };
const r = { id: 1, listing_title: "1965 Chevrolet Corvette Sting Ray Convertible", year: 1965, make: "Chevrolet", model: "Corvette", source: "bringatrailer", current_bid: 0, current_bid_usd: 0, end_time: new Date(Date.now() + 4 * 864e5).toISOString() };
const spec = { v: { year: 1965, make: "Chevrolet", model: "Corvette", bodyStyle: "convertible" }, title: r.listing_title }, core = S.coreOf(d, spec);
const m = S.marketFromCore(core, r, { miles: null, priceUsd: 78000 }, spec);
const l = { id: 1, title: r.listing_title, make: r.make, year: r.year, market: m, current_bid_usd: 78000, end_time: r.end_time, sam_lines: [] }; l.sam_lines = samLines(l, Date.now());
ok(Array.isArray(m.thin_sales && m.thin_sales.sales) && m.thin_sales.sales.length === 3, "the fixture is the old trigger: the engine's answer carries three sales on the card's market");
// 1 the card's code has no sale-line builder
const box = block("  function fxOpt(", "  // SPEC CHIPS under the bid line");
ok(!/saleLineText|data-fxsale="|fx-sale/.test(C), "the card's client code has no sale-line builder (saleLineText, data-fxsale, fx-sale)");
ok(!/\.sales\b[^;{]*\.(map|forEach|slice|join)\(|\bsales\[/.test(box.replace(/^\s*\/\/.*$/gm, "")), "the card's Sam box code reads the engine's count and sentence, and only asks whether sales exist, never lists them");
// 2 the rendered box prints none, with and without the engine's findAnswer
for (const [label, over] of [["no findAnswer", {}], ["findAnswer few", { findAnswer: { state: "few", basis: "pooled", option: null, range: null, n: 3, bid: null, lines: ["Three sales, too few for a range.", "See the sales for all three."], pointer: "See the sales for all three." } }]]) {
  const lm = { ...l, market: { ...m, ...over } }, out = samLineOf(lm), h = out ? out.html : "", t = flat(h);
  ok(h.length > 20, label + ": the box prints");
  ok(!/\$[\d,]+(, \$[\d,]+)+/.test(t) && !/\$[\d,]+ ?·/.test(t) && !/(January|February|March|April|May|June|July|August|September|October|November|December) 20\d\d.*\$[\d,]+|\$[\d,]+.*(January|February|March|April|May|June|July|August|September|October|November|December) 20\d\d/.test(t.replace(/since (January|February|March|April|May|June|July|August|September|October|November|December) 20\d\d/g, "")), label + ": no price list, no sale row, no month and price together (" + t + ")");
  for (const s of SALES) ok(!h.includes(String(s.price)) && !h.includes(num(s.price)) && !/<a /.test(h) && !h.includes(s.url), label + ": the sale at " + usd(s.price) + " is not in the box");
  ok(!/data-fxsale|<button/.test(h), label + ": no sale button in the box");
}
// 3 Tasks lifts the same code; the email prints sale rows only when the engine says sales
const kit = fs.readFileSync("lib/findCardKit.js", "utf8");
ok(/"fxOpt", "fxSlots", "fxFindHtml", "fxCount", "fxBid"/.test(kit), "Tasks' cars are the same box code (findCardKit), so the checks above cover them");
const { emailCardHtml } = await import("../lib/tasks/emailCards.js");
const el = { id: 1, title: r.listing_title, make: "Chevrolet", url: "https://a.test/1", source: "Bring a Trailer", photo_url: "https://i.test/a.jpg", end_time: r.end_time, current_bid_usd: 78000, market: { ...m } };
for (const mode of ["range", "options", "range_with_options", "none", undefined]) { const h = emailCardHtml({ ...el, market: { ...el.market, emailMode: mode } }); ok(!SALES.some(s => h.includes(num(s.price))), "email, emailMode " + mode + ": no sale row"); }
{ const h = emailCardHtml({ ...el, market: { ...el.market, emailMode: "sales" } }); ok(SALES.every(s => h.includes(num(s.price))), "email, emailMode sales: the engine's sale rows print (Sam, Oct 26)"); }
console.log(`findNoSaleLineCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
