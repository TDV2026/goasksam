// DESK, SOLD ON HAGERTY (Lane D, Nov 14 2026, order 2318 stage 2): desk.hagerty = { venue, count, median, last: { date, price, title, url }, share: { hagerty, all }, line, sellerLine } for the current view and inside every desk.views entry, from the same pool read that feeds the views, filtered to the Hagerty venue (the pool's own: slug "hagerty", shown "Hagerty").
// CLASS: every view of every car (the filter lives in lib/deskV3.js hagertyOf, called once per view by deskBlock). The expected figures here are made independently from the fake archive's own rows (id, price, sale_date, platform) for the sales of that very view.
//   node scripts/deskHagertySalesCheck.mjs [rootDir]
import path from "node:path"; import fs from "node:fs"; import { pathToFileURL } from "node:url"; import { setup } from "./_deskCaseWorld.mjs";
const root = path.resolve(process.argv[2] || "."), imp = f => import(pathToFileURL(path.join(root, f)).href), J = x => JSON.stringify(x);
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) pass++; else { fail++; console.log("FAIL " + n + (d ? " :: " + d : "")); } };
const DV = await imp("lib/deskV3.js"), RW = await imp("lib/reasonWords.js"), R = await imp("lib/desk/reportState.js"), P = await imp("lib/desk/reportPdfV3.js"), mini = await imp("lib/pdf/mini.js");
const q = (a, p) => { const s = a.slice().sort((x, y) => x - y), i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
const money = n => "$" + Math.round(n).toLocaleString("en-US");
// (A) a world where every other sale the fake archive lets through (the i % 3 === 0 rows) is a Hagerty sale
const A = await setup(root, { hagerty: (ci, i) => i % 6 === 0 }), caseA = await A.readyCase(), rowsById = new Map([...A.w.DATA.values()].flat().map(r => [r.id, r]));
const expectFor = (sales, months, all, allMedian) => {
  const mine = sales.filter(s => s.platform === "Hagerty"), rows = mine.map(s => rowsById.get(s.id)).filter(Boolean), prices = mine.map(s => s.price);
  if (!mine.length) return { count: 0 };
  const last = rows.map((r, k) => ({ d: r.sale_date, p: mine[k].price })).sort((a, b) => b.d.localeCompare(a.d))[0];
  return { count: mine.length, median: Math.round(q(prices, 0.5)), last };
};
const h = caseA.desk.hagerty, e0 = expectFor(caseA.desk.sales, caseA.desk.evidence.windowMonths, caseA.desk.evidence.count);
ok("HAGERTY 1: a case with Hagerty sales in the pool shows the right count, median and last sale (the current view)", h && h.venue === "Hagerty" && h.count > 0 && h.count === e0.count && h.median === e0.median && h.last && h.last.date === e0.last.d && h.last.price === e0.last.p && /^https?:/.test(h.last.url || "") && !!h.last.title, J(h) + " vs " + J(e0));
ok("HAGERTY 2: the share is Hagerty's count of the view's sales, and the line is the table's words with the all venue median", h.share.hagerty === h.count && h.share.all === caseA.desk.evidence.count && h.line === `Hagerty sold ${h.count} of the ${h.share.all}. Median ${money(h.median)} against ${money(caseA.desk.evidence.median)} across all venues.`, h.line);
ok("HAGERTY 3: the sellerLine is the seller's sentence, with the last sale's price and month", h.sellerLine === `Hagerty sold ${h.count} of these cars in the last ${caseA.desk.evidence.windowMonths} months. The last one made ${money(h.last.price)} in ${["January","February","March","April","May","June","July","August","September","October","November","December"][Number(h.last.date.slice(5, 7)) - 1]}.`, h.sellerLine);
// every view of the case carries its own, equal to the independent figures for that view's sales
{ const bad = []; let n = 0;
  for (const key of Object.keys(caseA.desk.views)) { const v = DV.viewOf(caseA.desk, key), hv = caseA.desk.views[key].hagerty, ex = expectFor(v.sales, v.evidence.windowMonths, v.evidence.count); n++;
    if (!hv || hv.count !== ex.count || hv.share.all !== v.evidence.count || (ex.count && (hv.median !== ex.median || hv.last.date !== ex.last.d || hv.last.price !== ex.last.p)) || (!ex.count && (hv.median !== null || hv.last !== null))) bad.push(key + " " + J(hv && { c: hv.count, m: hv.median }) + " vs " + J(ex)); }
  ok(`HAGERTY 4: every view (${n}) carries its own desk.hagerty equal to the independent count, median and last sale of that view's sales`, n === 15 && !bad.length, bad.slice(0, 3).join(" | ")); }
// a period that holds fewer of them reads fewer: nothing is carried from a wider window
{ const c3 = A.K.setWindow(caseA, 3, A.T), c12 = A.K.setWindow(caseA, 12, A.T); ok("HAGERTY 5: the 3 month view counts its own Hagerty sales, never the 12 month figure (3 months holds fewer, or the same sales it names)", c3.desk.hagerty.count <= c12.desk.hagerty.count && c3.desk.hagerty.count === expectFor(c3.desk.sales).count && c3.desk.hagerty.share.all === c3.desk.evidence.count, J(c3.desk.hagerty.share) + " " + J(c12.desk.hagerty.share)); }
// (B) a world with none
const B = await setup(root, {}), caseB = await B.readyCase(), hb = caseB.desk.hagerty;
ok("HAGERTY 6: a case with none shows the words and no figures", hb.count === 0 && hb.median === null && hb.last === null && hb.sellerLine === null && hb.line === `Hagerty has not sold one of these in the last ${caseB.desk.evidence.windowMonths} months.` && hb.share.hagerty === 0, J(hb));
ok("HAGERTY 7: ... in every view too (the period named is that view's)", Object.keys(caseB.desk.views).every(k => { const v = caseB.desk.views[k].hagerty, m = Number(k.split(":")[1]); return v.count === 0 && v.median === null && v.last === null && v.line === `Hagerty has not sold one of these in the last ${m} months.`; }));
// (C) the report: page two carries the sellerLine under the heading; none carries no sentence
const sheetOf = c => ({ id: "x", owner_seat: "Jane Park", forwarded_by: "Jane Park", created_at: A.T, submission: { typed: false, photos: [] }, state: {}, case: c, final: { reportNumber: "DV-2026-0007", org: { name: "Acme Auctions", color: null }, finalisedAt: A.T } });
const build = c => P.buildReportV3(sheetOf(c), { name: "Acme Auctions", contactEmail: "desk@acme.example" }, { fetchImage: async () => null });
{ const ra = await build(caseA), rb = await build(caseB), pa = mini.pdfPages(ra.bytes).map(p => p.join(" ")), pb = mini.pdfPages(rb.bytes).map(p => p.join(" "));
  ok("HAGERTY 8: the report carries the sellerLine on page two, and the state holds the engine's sentence as sent", R.reportState(caseA).v4.hagertyLine === h.sellerLine && (pa[1] || "").includes(h.sellerLine), (pa[1] || "").slice(0, 200));
  ok("HAGERTY 9: a case with none prints no Hagerty sentence and no figure from it", R.reportState(caseB).v4.hagertyLine === null && !/Hagerty/.test(pb.join(" ")), String(R.reportState(caseB).v4.hagertyLine)); }
// (D) the words: the three sentences are the table's, in the forms the order gave
ok("HAGERTY 10: the words table makes the order's sentences", RW.reasonLine("desk4.hagerty_line", { count: 4, all: 39, median: 26500, allMedian: 28000 }) === "Hagerty sold 4 of the 39. Median $26,500 against $28,000 across all venues." && RW.reasonLine("desk4.hagerty_seller", { count: 4, months: 12, price: 26500, month: "September" }) === "Hagerty sold 4 of these cars in the last 12 months. The last one made $26,500 in September." && RW.reasonLine("desk4.hagerty_none", { months: 12 }) === "Hagerty has not sold one of these in the last 12 months.");
// (E) the filter itself, as a unit: a pool of mixed venues
{ const when = "2026-11-14", pool = [{ price: 20000, date: "2026-10-01", venue: "hagerty", title: "a", url: "u" }, { price: 30000, date: "2026-10-05", venue: "bringatrailer" }, { price: 40000, date: "2026-09-01", venue: "carsandbids" }], hv = DV.hagertyOf(pool, 12, when, { count: 3, median: 30000 });
  ok("HAGERTY 11: only the Hagerty venue counts (the unit over a mixed pool)", hv.count === 1 && hv.median === 20000 && hv.last.price === 20000 && hv.share.all === 3, J(hv)); }
// (F) the class: the filter lives in the one function, and the page and the PDF compute nothing of their own
{ const src = d => fs.readFileSync(path.join(root, d), "utf8"); ok("HAGERTY 12: the filter is the one in deskV3 (hagertyOf), and neither the report state nor the PDF counts venues", /isHagertyRow/.test(src("lib/deskV3.js")) && !/isHagertyRow|"hagerty"|Hagerty/.test(src("lib/desk/reportPdfV3.js").replace(/hagertyLine|Sold on Hagerty/g, "")) && !/venue/.test(src("lib/desk/reportState.js").split("hagertyLine")[0].split("\n").filter(l => /hagerty/i.test(l)).join("")));}
// (G) the worded strings the page prints as sent: medianLine and lastLine, null when count is 0, in every view
{ const shortDate = d => new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }), bad = [];
  for (const key of Object.keys(caseA.desk.views)) { const hv = caseA.desk.views[key].hagerty; if (hv.count > 0 ? !(hv.medianLine === `Hagerty median ${money(hv.median)}` && hv.lastLine === `Last Hagerty sale ${money(hv.last.price)} on ${shortDate(hv.last.date)}`) : !(hv.medianLine === null && hv.lastLine === null)) bad.push(key + " " + J([hv.medianLine, hv.lastLine])); }
  ok("HAGERTY 13: medianLine and lastLine are the table's words in every view, and null when count is 0 (the page formats nothing)", !bad.length && h.medianLine === `Hagerty median ${money(h.median)}` && hb.medianLine === null && hb.lastLine === null && Object.values(caseB.desk.views).every(v => v.hagerty.medianLine === null && v.hagerty.lastLine === null), bad.slice(0, 2).join(" | ")); }
console.log(`deskHagertySalesCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
