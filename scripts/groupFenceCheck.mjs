// The price fence is read within the group a sale belongs to (Lane B, Nov 5 2026, job lane-b-prewar2, Sam: "a convertible at twice the sedans is a body, not an outlier"). No database, no network.
// THE CLASS: r4Split cut every sale over 1.35 x the pool's p75 before any apart rule saw the pool, so a group that prices apart (a body, a gearbox, a generation or year, a mileage band) lost its dearer sales as "outliers" and the
// answer could never show it apart. A sale over the pool fence is now kept when its group prices apart from the rest (splitMaterial; a pre-war body is apart by default) and it is not an outlier INSIDE that group. Must hold:
//  (1) a pool of one group: a lone high sale is still set aside (the control, nothing moved);
//  (2) body, gearbox, year (generation), mileage band: the dearer group is kept whole when it prices apart;
//  (3) a pre-1949 body of two sales at twice the sedans is kept;
//  (4) a real outlier INSIDE the dear group (five times its peers) is still set aside;
//  (5) a group too small to price apart (post-war, under 3 sales) does not rescue its high sale.
//   node scripts/groupFenceCheck.mjs          (LIB_ROOT=<dir holding lib/> runs it against another tree to show it fails)
import path from "node:path";
import { pathToFileURL } from "node:url";
const ROOT = process.env.LIB_ROOT ? path.resolve(process.env.LIB_ROOT) : path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const E = await import(pathToFileURL(path.join(ROOT, "lib/onebox.js")).href);
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
if (typeof E.r4Split !== "function") { console.log("FAIL  r4Split is not exported (the class cannot be checked)"); process.exit(1); }
let n = 0;
const row = (usd, o = {}) => ({ id: "r" + ++n, rtitle: `${o.year || 2005} Testmake Zed ${o.body || ""}`.trim(), year: o.year || 2005, mileage: o.mi != null ? String(o.mi) : "60000", transmission: o.tx || null, _usd: usd });
const many = (k, base, o = {}) => Array.from({ length: k }, (_, i) => row(base + (i % 4) * 600, o));
const kept = (rows, set) => set.every(r => E.r4Split(rows, false).solid.includes(r));
const asideOf = (rows, r) => E.r4Split(rows, false).aside.includes(r);
// (1) control
{ const base = many(12, 40000), hi = row(120000); ok("(1) one group: a lone high sale is still set aside", asideOf([...base, hi], hi)); }
// (2) each dimension
{ const sed = many(12, 40000, { body: "Sedan" }), cv = many(4, 90000, { body: "Convertible" }); ok("(2) body: four convertibles at twice the sedans are kept", kept([...sed, ...cv], cv)); }
{ const au = many(12, 40000, { tx: "Automatic" }), ma = many(4, 90000, { tx: "Manual (6-Speed)" }); ok("(2) gearbox: four manuals at twice the automatics are kept", kept([...au, ...ma], ma)); }
{ const a = many(12, 40000, { year: 2004 }), b = many(4, 90000, { year: 2008 }); ok("(2) year (generation): four 2008s at twice the 2004s are kept", kept([...a, ...b], b)); }
{ const hi = many(12, 40000, { mi: 110000 }), lo = many(4, 90000, { mi: 6000 }); ok("(2) mileage: four low-mile sales at twice the high-mile ones are kept", kept([...hi, ...lo], lo)); }
// (3) pre-war body
{ const sed = many(9, 60000, { body: "Sedan", year: 1934 }), cv = many(2, 120000, { body: "Convertible", year: 1934 }); ok("(3) 1934: two convertibles at twice the sedans are kept", kept([...sed, ...cv], cv)); }
// (4) outlier inside the dear group
{ const au = many(12, 40000, { tx: "Automatic" }), ma = many(4, 90000, { tx: "Manual (6-Speed)" }), wild = row(500000, { tx: "Manual (6-Speed)" }); ok("(4) a sale five times its own group is still set aside", asideOf([...au, ...ma, wild], wild) && kept([...au, ...ma, wild], ma)); }
// (5) too small a group
{ const sed = many(12, 40000, { body: "Sedan" }), cv = many(2, 90000, { body: "Convertible" }); ok("(5) post-war: two dearer sales are not a group that prices apart (still set aside)", cv.every(r => asideOf([...sed, ...cv], r))); }
// (6) stored rows: an answer that set sales aside, stored before the group fence (ps1 or none), is read again; a ps1 row with nothing set aside keeps serving; the current tag serves
{ const st = (extra) => ({ tier: "result", rawPool: [{ id: "a", source: "bringatrailer" }], poolSourceTag: "ps1-20261105", ...extra });
  ok("(6) a ps1 answer with set-aside sales is read again", E.storedPoolSourceOvertaken(st({ asideCards: [{ id: "x" }] })) === true);
  ok("(6) a ps1 answer with nothing set aside keeps serving", E.storedPoolSourceOvertaken(st({ asideCards: [] })) === false);
  ok("(6) the current tag serves", E.storedPoolSourceOvertaken(st({ asideCards: [{ id: "x" }], poolSourceTag: E.POOL_SOURCE_TAG })) === false); }
console.log(failed ? `\n${failed} FAILED` : "\ngroupFenceCheck: all pass"); process.exit(failed ? 1 : 0);
