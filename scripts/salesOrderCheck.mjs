// Sales order check (Lane B, Nov 4 2026, job lane-b-rick point 1, Rick Carey's launch-day feedback). THE CLASS: sales lists reached the pages in different orders (cards by price, the partner
// `sales` by price, asideRows by whatever), the engine offered a `salesOrder` option nothing read, and partnerDemo sorted in the page. ONE rule: the engine sends every sales list date newest first
// (the dearer sale first on a tie); nearest-in-miles sales and an asked partner order are the only exceptions; no page sorts. Must hold:
//  (1) salesNewestFirst orders by date, price on a tie, the list's own order after that, undated last, and returns the same sales;
//  (2) withReadFields serves cards, asideCards, taggedCards and thin_sales.sales newest first, and serves no salesOrder;
//  (3) the partner answer's sales, rows and asideRows are newest first (they were price order);
//  (4) api/partnerDemo.js sorts no sales list (the engine's order is the page's order).
//   node scripts/salesOrderCheck.mjs          (ROOT=<tree> runs it against another tree to show it fails)
import fs from "node:fs"; import path from "node:path"; import { pathToFileURL } from "node:url";
const ROOT = process.env.ROOT ? path.resolve(process.env.ROOT) : path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const E = await import(pathToFileURL(path.join(ROOT, "lib/onebox.js")).href), P = await import(pathToFileURL(path.join(ROOT, "api/partnerAnswer.js")).href);
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const mk = (i, date, price) => ({ id: "id" + i, title: "2001 Porsche 911 Carrera " + i, price, date, mi: 20000 + i, setAside: true, reason: "x", allIn: price });
const rows = [mk(1, "2026-01-05", 50000), mk(2, "2026-09-01", 40000), mk(3, "2026-09-01", 60000), mk(4, null, 99000), mk(5, "2026-05-20", 70000)];
const want = ["id3", "id2", "id5", "id1", "id4"];
const nf = E.salesNewestFirst;
ok("salesNewestFirst: newest first, dearer first on a tie, undated last", typeof nf === "function" && nf(rows).map(r => r.id).join() === want.join(), typeof nf === "function" ? nf(rows).map(r => r.id).join() : "missing");
ok("... and it is the same sales, the input untouched", typeof nf === "function" && nf(rows).length === 5 && rows[0].id === "id1");
const d = { tier: "result", cards: rows, asideCards: rows, taggedCards: rows, thin_sales: { sales: rows }, setAsideRows: rows, poolN: 5, cluster: [40000, 70000] };
const r = E.withReadFields(d, "2001 Porsche 911 Carrera", { year: 2001 });
const ids = a => (a || []).map(x => x.id).join();
ok("withReadFields: cards newest first", ids(r.cards) === want.join(), ids(r.cards));
ok("withReadFields: asideCards, taggedCards and thin_sales.sales newest first", [r.asideCards, r.taggedCards, r.thin_sales && r.thin_sales.sales].every(a => ids(a) === want.join()));
ok("withReadFields: no salesOrder option is served", !("salesOrder" in r) && !("salesOrder" in (r.thin_sales || {})));
const sales = P.salesOf(d).map(s => s.name + "|" + s.date).join(), rowsOut = P.rowsOf(d).map(s => s.date).join();
ok("partner salesOf is newest first (was price order)", P.salesOf(d).map(s => s.date).join() === "2026-09-01,2026-09-01,2026-05-20,2026-01-05,", sales);
ok("partner rowsOf and asideRowsOf are newest first", rowsOut === "2026-09-01,2026-09-01,2026-05-20,2026-01-05," && P.asideRowsOf(d).map(s => s.date).join() === "2026-09-01,2026-09-01,2026-05-20,2026-01-05,");
const page = fs.readFileSync(path.join(ROOT, "api/partnerDemo.js"), "utf8");
ok("partnerDemo.js sorts no sales list (the page shows the engine's order)", !/\.sort\(function\s*\(\s*x\s*,\s*y\s*\)\s*\{\s*return String\(y\.date/.test(page));
console.log(failed ? `\n${failed} FAILED` : "\nsalesOrderCheck: all pass"); process.exit(failed ? 1 : 0);
