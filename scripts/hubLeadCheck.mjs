// THE HUB LEAD, ONE COUNT (Sam's decision 1, Oct 20 2026; Lane C). "The {model} sold {n} times at auction in {window},
// as of {date}."; once with one sale; a year hub names the year and make; never starts with a number; the count and the
// window are the engine's (poolCount, poolWindow); no engine pool keeps "Each car below by VIN, with its auction results,
// as of {date}."; no VIN-list count in the lead or the meta description. No network.
//   node scripts/hubLeadCheck.mjs     exit 1 on any failure.
import fs from "node:fs";
import { hubLead, hubWindow } from "../api/history.js";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const D = "October 20, 2026";
const W12 = "in the last twelve months";
ok(hubLead({ year: 2009, make: "Porsche", family: "911 Carrera S", n: 12, win: W12, date: D }) === "The 2009 Porsche 911 Carrera S sold 12 times at auction in the last twelve months, as of October 20, 2026.", "a year hub: The {year} {make} {model} sold {n} times ...");
ok(hubLead({ year: null, make: "Cadillac", family: "DeVille", n: 90, win: W12, date: D }) === "The Cadillac DeVille sold 90 times at auction in the last twelve months, as of October 20, 2026.", "an all-years hub names the make too");
ok(hubLead({ year: null, make: "Ford", family: "Ford GT", n: 3, win: W12, date: D }).startsWith("The Ford GT sold") , "the make is not repeated when the model label starts with it");
ok(hubLead({ year: null, make: "Ferrari", family: "275 GTB", n: 1, win: "since October 2023", date: D }) === "The Ferrari 275 GTB sold once at auction since October 2023, as of October 20, 2026.", "one sale; a non-twelve-month window in the engine's own words");
ok(hubLead({ year: null, make: "Bentley", family: "Continental S2", n: 4, win: "", date: D }) === "The Bentley Continental S2 sold 4 times at auction, as of October 20, 2026.", "no plain engine window: no window clause");
ok(hubLead({ year: null, make: "BMW", family: "M3", n: 1303, win: W12, date: D }).includes("sold 1,303 times"), "a large count keeps its thousands separator");
for (const n of [0, null, undefined]) ok(hubLead({ year: 2001, make: "Ford", family: "Falcon", n, win: W12, date: D }) === "Each car below by VIN, with its auction results, as of October 20, 2026.", `no engine pool (${n}): the list's own sentence`);
ok([[2009, "Porsche", "911", 3], [null, "Ford", "Mustang", 2]].every(([y, m, f, n]) => /^The /.test(hubLead({ year: y, make: m, family: f, n, win: W12, date: D }))), "never starts with a number");
// The window is the engine's: Sam's words for its twelve-month window, else its windowWords, else none; never hardcoded.
ok(hubWindow({ windowLabel: "last twelve months", windowWords: "since October 2025" }) === W12, "the engine's twelve-month window: Sam's words");
ok(hubWindow({ windowLabel: "last two years", windowWords: "since October 2024" }) === "since October 2024" && hubWindow({ tier: "thin", windowLabel: "past 5 years", windowWords: "since October 2021" }) === "since October 2021", "two years, a thin read: the engine's own windowWords");
ok(hubWindow({ windowLabel: "all years on record", windowWords: null }) === "" && hubWindow(null) === "", "no plain window: no clause");
const h = fs.readFileSync(new URL("../api/history.js", import.meta.url), "utf8");
ok(/const ctx = hubLead\(\{ year: hub\.year, make: id\.make, family: id\.family, n, win: hubWindow\(d\), date: asOfDate\(\) \}\);/.test(h), "the hub reads the engine's count (n = poolCount(d)) and window (hubWindow)");
ok(!/recorded sale/.test(h), "no VIN-list count ('recorded sales') anywhere on the history pages");
ok(/description: ctx, canonical/.test(h), "the meta description carries the same sentence");
ok(!/[\u2013\u2014]|our data/i.test(hubLead({ year: 2009, make: "Porsche", family: "911", n: 3, win: W12, date: D })), "no dashes, no 'our data'");
console.log(`hubLeadCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
