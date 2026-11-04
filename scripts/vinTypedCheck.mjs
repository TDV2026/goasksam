// A VIN SEARCH AND THE TYPED SEARCH OF THE SAME CAR GIVE THE SAME ANSWER (Lane B, Oct 29 2026, Lane F's live rerun on bee760b6: the stored sample VIN of a 2001 BMW M3 said "No figures are shown because this car could not be checked", then asked "Say which BMW M3 Coupe
// 6-Speed it is" about the car it had just named; the typed car read $22,500 to $41,000).
// CAUSE: a search whose vehicle carried a VIN or chassis never read the stored answer, and ran the engine live as a different spec (the VIN's own title words, the VIN string as the search text), so its pool, questions and refusal were not the typed car's.
// FIX (lib/vinAsTyped.js, api/sellerDecision.js): the VIN names the car (year, make, model); that car goes through the SAME path a typed search takes; the VIN car's own sales (ownSales) and the option its words and fields name (matchedOption) go on the finished answer.
// This check runs both paths on real VINs and their cars (the nine kinds in scripts/vinIdentityCheck.mjs, which the nightly VIN index met, plus the 2001 BMW M3 stand-in) against a seeded pool, and fails on ANY difference between the typed answer and the VIN answer
// other than the two facts the VIN adds. A VIN that names no car says so in the engine's line and shows no number.
//   node scripts/vinTypedCheck.mjs [repo root]
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.LAUNCH_STAGE = "2";
globalThis.fetch = async (url) => { const u = new URL(String(url)); if (u.hostname !== "fake.supabase.test") throw new Error("offline"); return new Response("[]", { status: 200 }); };
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href), V = await import(pathToFileURL(path.join(root, "lib/vehicle.js")).href), A = await import(pathToFileURL(path.join(root, "lib/vinAsTyped.js")).href);
// real VINs and the cars they name (title words as the listing or the VIN index writes them); the 2001 BMW M3 is the stand-in for Lane F's stored sample VIN
const CARS = [
  ["WBSBL93461JR12345", 2001, "BMW", "M3", "Coupe", "6-Speed Manual", "the 2001 BMW M3 stand-in"],
  ["1G1YY22G0X5100000", 1999, "Chevrolet", "Corvette", "Coupe", null, "a 1999 Corvette (VIN index)"],
  ["WP0AA2999YS621235", 2000, "Porsche", "911", null, null, "a 2000 Porsche 911 Carrera 4 (VIN index)"],
  ["WP0AC2A9XES183617", 2014, "Porsche", "911", "GT3", null, "a 2014 911 GT3 (sell check)"],
  ["WDBSK76F55F091924", 2005, "Mercedes-Benz", "SL-Class", null, null, "a 2005 SL600 (VIN index)"],
  ["SALME11494A157867", 2004, "Land Rover", "Range Rover", null, null, "a 2004 Range Rover HSE (VIN index)"],
  ["1GNFK16K2PJ402195", 1993, "Chevrolet", "Suburban", null, null, "a 1993 Suburban (VIN index)"]
];
const poolFor = (year, make, model, ownVin) => Array.from({ length: 40 }, (_, i) => ({ id: "p" + i, price: 20000 + i * 500, _usd: 20000 + i * 500, auction_end_date: `2026-0${1 + (i % 9)}-${10 + (i % 9)}`, year, make, model, raw_title: `${year} ${make} ${model}`, rtitle: `${year} ${make} ${model}`, mileage: String(30000 + i * 2000), vin_norm: i === 7 && ownVin ? ownVin : "ZZZ" + (100000 + i), transmission: i % 2 ? "Manual (6-speed)" : "Automatic", image: "https://img.test/x.jpg", source: "bringatrailer", platform: "bringatrailer" }));
// THREE MORE FACTS A VIN ANSWER CARRIES (Lane B, Nov 2 2026, lane-b-narrow 2471931f; Lane C's prePush on 81340cb8 failed all seven cars on exactly these): rangeMileage, nearestSales and nearestSalesHeading.
// They are allowed because they are MILEAGE-derived, never VIN-derived: both paths call the one function, mileageBasisOf(d, { live, record, recordDate }), and nearestSalesOf(d, miles) on the answer's own pool.
// A typed search has the same hints when it is given the same mileage (vehicle.recordMiles + recordDate, vehicle.listingMiles) or the same miles entered (d.queryMileage), and then returns the same fields.
// The VIN path only SUPPLIES a mileage (its last sale record, or its live listing) that a typed search would otherwise get from the reader. The guards are the "MILEAGE-DERIVED" assertions in the loop below:
//   rangeMileage       <- (A) typed with the VIN's record miles and date: deep-equal; (B) typed with the same miles entered: same miles, same narrowed flag, source "entered" (the line names where the miles came from)
//   nearestSales       <- (A) deep-equal; (B) deep-equal; (C) a different mileage gives different nearest sales (so the assertions are not vacuous)
//   nearestSalesHeading<- (A) deep-equal; (B) deep-equal; (D) the live-listing mileage gives the same fields on both paths
// A field is added to VIN_ADDS only with a guard named in MILEAGE_GUARDS; the last assertion of the file fails if one has none.
const MILEAGE_FACTS = ["rangeMileage", "nearestSales", "nearestSalesHeading"];
const MILEAGE_GUARDS = { rangeMileage: ["A", "B"], nearestSales: ["A", "B", "C"], nearestSalesHeading: ["A", "B", "D"] };
const ranGuards = new Set();
const KEEP_OUT = new Set(["readAt", "latencyMs", "timings", "snapshotId", "dedup"]), VIN_ADDS = new Set(["ownSales", "matchedOption", "options", "optionLines", "headlineLines", "optionsNote", "refineOptions", "optionsRemainder", "chart", "mileageLine", ...MILEAGE_FACTS]);
const strip = (d, dropAdds) => { const o = {}; for (const [k, v] of Object.entries(d || {})) { if (KEEP_OUT.has(k)) continue; if (dropAdds && VIN_ADDS.has(k)) continue; o[k] = v; } return o; };
const env = rows => ({ supabaseUrl: "https://fake.supabase.test", supabaseKey: "k", asked: 0, poolSeed: { rows } });
for (const [vin, year, make, model, body, gear, label] of CARS) {
  const words = `${year} ${make} ${model}`, rows = poolFor(year, make, model, vin.replace(/[^A-Z0-9]/g, ""));
  const tr = await V.resolveVehicle(words, {}); const tv = tr && tr.vehicle;
  if (!tv || !tv.model) { ok(`${label}: the typed words resolve to the car`, false, tr && tr.status); continue; }
  const rawTyped = (await E.oneEngineAnswer(tv, null, words, env(rows), null)).raw, typed = E.withReadFields(rawTyped, words, tv);
  // the VIN as the page gives it: a vehicle that carries the VIN, the car's year, make, model and the words its listing wrote
  const vinVehicle = { year, make, model, nameModel: model, bodyStyle: body ? body.toLowerCase() : null, trim: null, transmission: gear, vin, raw: vin };
  const plan = await A.vinSearchPlan(vinVehicle, { resolveVehicle: V.resolveVehicle });
  ok(`${label}: the VIN names the car and plans a typed search of it`, !!plan && !plan.unresolved && plan.text === words, JSON.stringify(plan && { text: plan.text, unresolved: plan.unresolved }));
  if (!plan || plan.unresolved) continue;
  const viaVin = A.applyVinOverlay(E.withReadFields((await E.oneEngineAnswer(plan.vehicle, null, plan.text, env(rows), null)).raw, plan.text, plan.vehicle), plan.ctx);
  const a = JSON.stringify(strip(typed, true)), b = JSON.stringify(strip(viaVin, true));
  const diff = a === b ? "" : Object.keys({ ...strip(typed, true), ...strip(viaVin, true) }).filter(k => JSON.stringify(typed[k]) !== JSON.stringify(viaVin[k])).slice(0, 6).join(", ");
  ok(`${label}: every field of the typed answer and the VIN answer is the same (except the two facts the VIN adds)`, a === b, diff);
  // ONE ENGINE, field by field (the cars that failed Lane C's prePush): the stored row key is the typed car's, and the three mileage facts are mileage-derived, not VIN-derived
  { const SM = await import(pathToFileURL(path.join(root, "lib/live/search.js")).href);
    ok(`${label}: the VIN search reads the typed car's stored row (same key)`, SM.warmAnswerKeyFor(tv, null, null) === SM.warmAnswerKeyFor(plan.vehicle, null, null), `${SM.warmAnswerKeyFor(tv, null, null)}`);
    const ls = viaVin.ownSales && viaVin.ownSales.lastSale, same = (x, y, ks) => ks.every(k => JSON.stringify(x[k]) === JSON.stringify(y[k]));
    if (ls && ls.miles > 0) {
      // (A) the same record mileage handed to the typed path as the hint it takes: every one of the three fields, deep-equal
      const tA = E.withReadFields(rawTyped, words, { ...tv, recordMiles: ls.miles, recordDate: ls.date }); ranGuards.add("A");
      ok(`MILEAGE-DERIVED (A) ${label}: a typed search given the VIN's record miles and date returns the same rangeMileage, nearestSales and nearestSalesHeading`, same(tA, viaVin, MILEAGE_FACTS) && !!viaVin.rangeMileage, MILEAGE_FACTS.filter(k => JSON.stringify(tA[k]) !== JSON.stringify(viaVin[k])).join(", "));
      // (B) the same miles ENTERED: the miles, the narrowed flag, the nearest sales and their heading are the same; the line names where the miles came from, so source and line say "entered"
      const tB = E.withReadFields({ ...rawTyped, queryMileage: ls.miles }, words, tv); ranGuards.add("B");
      ok(`MILEAGE-DERIVED (B) ${label}: a typed search with the same miles entered returns the same miles, narrowed flag, nearestSales and heading (its source says "entered")`, !!tB.rangeMileage && tB.rangeMileage.miles === viaVin.rangeMileage.miles && tB.rangeMileage.narrowed === viaVin.rangeMileage.narrowed && tB.rangeMileage.source === "entered" && same(tB, viaVin, ["nearestSales", "nearestSalesHeading"]), JSON.stringify(tB.rangeMileage));
      // (C) not vacuous: another mileage moves the miles and the nearest sales
      const tC = E.withReadFields({ ...rawTyped, queryMileage: ls.miles + 6000 }, words, tv); ranGuards.add("C");
      ok(`MILEAGE-DERIVED (C) ${label}: a different mileage gives different miles and different nearest sales`, !!tC.rangeMileage && tC.rangeMileage.miles !== viaVin.rangeMileage.miles && JSON.stringify(tC.nearestSales) !== JSON.stringify(viaVin.nearestSales));
      // (D) the live listing's mileage on the VIN path, the same mileage as the listing's on the typed path
      const live = ls.miles + 500, vD = A.applyVinOverlay(E.withReadFields(rawTyped, plan.text, plan.vehicle), { ...plan.ctx, vf: { ...(plan.ctx.vf || {}), liveMiles: live } }), tD = E.withReadFields(rawTyped, words, { ...tv, listingMiles: live }); ranGuards.add("D");
      ok(`MILEAGE-DERIVED (D) ${label}: a live-listing mileage gives the same three fields on the VIN path and the typed path`, !!vD.rangeMileage && vD.rangeMileage.source === "live_listing" && same(vD, tD, MILEAGE_FACTS), MILEAGE_FACTS.filter(k => JSON.stringify(vD[k]) !== JSON.stringify(tD[k])).join(", "));
    } else ok(`MILEAGE-DERIVED ${label}: the VIN car has a last sale with miles to check`, false, "no ownSales.lastSale.miles"); }
  ok(`${label}: the same tier, range, count, window and questions (${typed.tier} ${JSON.stringify(typed.cluster)})`, typed.tier === viaVin.tier && JSON.stringify(typed.cluster) === JSON.stringify(viaVin.cluster) && typed.poolN === viaVin.poolN && typed.windowWords === viaVin.windowWords);
  ok(`${label}: the VIN car's own sale rides on top (ownSales names it)`, !!(viaVin.ownSales && viaVin.ownSales.lastSale), viaVin.ownSales ? "yes" : "no ownSales");
  ok(`${label}: it never says it could not check a car it named, and asks no question the typed car does not`, !/could not be checked/i.test(JSON.stringify(viaVin.refusal_line || viaVin.samLine || "")) && /_choice$/.test(String(typed.tier)) === /_choice$/.test(String(viaVin.tier)));
}
// the ops task vintypedlive (api/usageDashboard.js) compares the same two answers on live reads with its OWN copy of the allowance; two copies drift (they did: Lane B added three facts to one). They must be the same set.
{ const src = fs.readFileSync(path.join(root, "api/usageDashboard.js"), "utf8"), mm = /ADDS = new Set\(\[([^\]]*)\]\)/.exec(src), ops = new Set(mm ? mm[1].split(",").map(x => x.trim().replace(/^"|"$/g, "")).filter(Boolean) : []);
  ok("the ops task vintypedlive allows exactly the facts this check allows on a VIN answer", !!mm && ops.size === VIN_ADDS.size && [...VIN_ADDS].every(k => ops.has(k)), mm ? [...VIN_ADDS].filter(k => !ops.has(k)).concat([...ops].filter(k => !VIN_ADDS.has(k))).join(", ") : "no ADDS set found"); }
// every fact allowed on a VIN answer by this file's MILEAGE allowance has a named guard and that guard ran
ok("every mileage fact allowed on a VIN answer has a guard, and each guard ran", MILEAGE_FACTS.every(k => Array.isArray(MILEAGE_GUARDS[k]) && MILEAGE_GUARDS[k].length > 0 && MILEAGE_GUARDS[k].every(g => ranGuards.has(g))), MILEAGE_FACTS.filter(k => !(MILEAGE_GUARDS[k] || []).every(g => ranGuards.has(g))).join(", "));
// a VIN that names no car: the engine's plain line, no numbers
{ const plan = await A.vinSearchPlan({ vin: "1ABCDEFGHJKLMNPRS", raw: "1ABCDEFGHJKLMNPRS" }, { resolveVehicle: V.resolveVehicle });
  ok("a VIN that names no car says so in the engine's line and shows no number", !!plan && plan.unresolved === true && /does not name a car/.test(plan.line), plan && plan.line); }
// a plain typed search is not a VIN search
ok("a typed search has no VIN plan", (await A.vinSearchPlan({ year: 2001, make: "BMW", model: "M3" }, { resolveVehicle: V.resolveVehicle })) === null);
console.log(fail ? `vinTypedCheck: ${fail} failure(s)` : "vinTypedCheck: all pass");
process.exit(fail ? 1 : 0);
