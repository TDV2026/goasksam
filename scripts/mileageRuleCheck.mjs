// mileageRuleCheck (Lane B, Oct 23 2026, Sam's rule: "mileage never makes the answer worse"): offline, no network; the engine's real
// buildResult over synthetic rows. Mileage narrows ONLY when the narrowed pool still meets the range minimum (8); otherwise the
// ORIGINAL answer stands (tier, range, count, years) and the answer carries mileageNote; mileage never changes the year window.
// Modelled on the 1963 Jaguar E-Type (8 sales, years 1962 to 1966; 36,000 miles used to cut it to 3 sales and 1964 to 1966), a 2014
// 911 and a deep-sales car.
globalThis.fetch = async () => { throw new Error("blocked"); };
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const { buildResult, RANGE_THRESHOLD_FOR_TEST } = await import("../lib/onebox.js");
let bad = 0;
const ok = (c, m) => { console.log((c ? "ok   " : "FAIL ") + m); if (!c) bad++; };
const now = Date.now(), DAY = 864e5;
const iso = days => new Date(now - days * DAY).toISOString();
const mk = (n, year, miles, usd, daysAgo) => ({ _usd: usd, raw_title: `${year} Jaguar E-Type Series 1 Roadster ${n}`, rtitle: `${year} Jaguar E-Type Series 1 Roadster ${n}`, year, auction_end_date: new Date(now - daysAgo * DAY).toISOString().slice(0, 10), source: "bringatrailer", mods: "", transmission: "Manual (4-Speed)", mileage: String(miles) });
const base = () => ({ resolvedCar: { make: "Jaguar", model: "E-Type", year: 1963 }, resolvedSpec: null, dedup: {}, vehicle: { make: "Jaguar", model: "E-Type", trim: null, year: 1963 }, exactSale: null, inlineSplits: [] });
const spec = { make: "Jaguar", model: "E-Type", trim: "", year: 1963, excludeVariants: [], genCode: null };
const chosen = rows => ({ rows, step: "base", windowLabel: "past 2 years" });
const MILES = refine => ({ miMin: refine - 15000, miMax: refine + 15000, miTarget: refine, label: `around ${Math.round(refine / 1000)}k` });
const keyOf = r => JSON.stringify({ tier: r.tier, cluster: r.cluster, poolN: r.poolN, years: r.poolYears, label: r.rungLabel });

// (1) THE 1963 E-TYPE: eight sales, five years, only three near 36,000 miles
const etype = [mk(1, 1962, 9000, 98000, 30), mk(2, 1963, 36500, 104000, 60), mk(3, 1963, 41000, 101000, 90), mk(4, 1964, 34000, 108000, 120), mk(5, 1965, 80000, 92000, 150), mk(6, 1966, 12000, 112000, 200), mk(7, 1962, 66000, 90000, 240), mk(8, 1965, 95000, 88000, 300)];
const e0 = buildResult(chosen(etype), base(), iso, spec, null);
const e1 = buildResult(chosen(etype), base(), iso, spec, MILES(36000));
ok(e0.tier === "result" && Array.isArray(e0.cluster), `the 1963 E-Type without mileage: a range (${e0.tier} ${JSON.stringify(e0.cluster)}, ${e0.poolN} sales)`);
ok(keyOf(e1) === keyOf(e0), "with 36,000 miles: the SAME answer (tier, range, count, years, label) as without");
ok(e1.mileageNote === `Too few sales near 36,000 miles to narrow it, so this is the range for all eight.`, `the plain line: "${e1.mileageNote}"`);
ok(e1.refined && e1.refined.mileage === true && e1.refined.narrowed === false, "refined says a mileage was given and the pool was not narrowed");
ok(e1.mileageFallback === null && e1.nearestInMiles === null, "no 'nearest in miles' set replaces the answer");
ok(Array.isArray(e1.poolYears) && e1.poolYears[0] === e0.poolYears[0] && e1.poolYears[1] === e0.poolYears[1], `the years stay (${JSON.stringify(e1.poolYears)}), never 1964 to 1966`);

// (2) A 2014 911 shape: nine sales, five near 30,000 miles: still under eight, so the original answer
const y14 = Array.from({ length: 9 }, (_, i) => mk(i, 2014, i < 5 ? 28000 + i * 800 : 70000 + i * 4000, 80000 + i * 1500, 40 * (i + 1)));
const d0 = buildResult(chosen(y14), base(), iso, spec, null), d1 = buildResult(chosen(y14), base(), iso, spec, MILES(30000));
ok(keyOf(d1) === keyOf(d0) && /Too few sales near 30,000 miles/.test(d1.mileageNote || ""), "a 2014 911 shape (5 near the miles): the original answer and the line");

// (3) A deep-sales car: forty sales, fifteen near 36,000 miles: the narrowing is honoured, no line
const deep = Array.from({ length: 40 }, (_, i) => mk(i, 1963 + (i % 4), i < 15 ? 30000 + i * 700 : 80000 + i * 1500, 60000 + i * 900, 10 * (i + 1)));
const p0 = buildResult(chosen(deep), base(), iso, spec, null), p1 = buildResult(chosen(deep), base(), iso, spec, MILES(36000));
ok(p1.poolN < p0.poolN && p1.poolN >= 8 && !p1.mileageNote && p1.refined && p1.refined.narrowed === true, `a deep-sales car narrows (${p0.poolN} -> ${p1.poolN}) with no line`);
// (4) exactly at the minimum: eight near the miles narrows; seven does not
const eight = Array.from({ length: 20 }, (_, i) => mk(i, 1964, i < 8 ? 34000 + i * 300 : 90000 + i * 2000, 70000 + i * 800, 15 * (i + 1)));
const seven = eight.map((r, i) => (i === 7 ? { ...r, mileage: "99000" } : r));
ok(!buildResult(chosen(eight), base(), iso, spec, MILES(36000)).mileageNote, "eight sales near the miles: narrowed");
ok(!!buildResult(chosen(seven), base(), iso, spec, MILES(36000)).mileageNote, "seven sales near the miles: not narrowed, the line");
// the count is written the way the engine writes counts elsewhere: a word under ten, digits from ten
const twelve = Array.from({ length: 12 }, (_, i) => mk(i, 1964, i < 2 ? 36000 : 90000 + i * 500, 80000 + i * 900, 20 * (i + 1)));
ok(/range for all 12\.$/.test(buildResult(chosen(twelve), base(), iso, spec, MILES(36000)).mileageNote || ""), "twelve sales: 'all 12'");
console.log(bad ? `mileageRuleCheck: ${bad} failed` : "mileageRuleCheck: all passed");
process.exit(bad ? 1 : 0);
