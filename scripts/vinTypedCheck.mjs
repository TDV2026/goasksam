// A VIN SEARCH AND THE TYPED SEARCH OF THE SAME CAR GIVE THE SAME ANSWER (Lane B, Oct 29 2026, Lane F's live rerun on bee760b6: the stored sample VIN of a 2001 BMW M3 said "No figures are shown because this car could not be checked", then asked "Say which BMW M3 Coupe
// 6-Speed it is" about the car it had just named; the typed car read $22,500 to $41,000).
// CAUSE: a search whose vehicle carried a VIN or chassis never read the stored answer, and ran the engine live as a different spec (the VIN's own title words, the VIN string as the search text), so its pool, questions and refusal were not the typed car's.
// FIX (lib/vinAsTyped.js, api/sellerDecision.js): the VIN names the car (year, make, model); that car goes through the SAME path a typed search takes; the VIN car's own sales (ownSales) and the option its words and fields name (matchedOption) go on the finished answer.
// This check runs both paths on real VINs and their cars (the nine kinds in scripts/vinIdentityCheck.mjs, which the nightly VIN index met, plus the 2001 BMW M3 stand-in) against a seeded pool, and fails on ANY difference between the typed answer and the VIN answer
// other than the two facts the VIN adds. A VIN that names no car says so in the engine's line and shows no number.
//   node scripts/vinTypedCheck.mjs [repo root]
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
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
const KEEP_OUT = new Set(["readAt", "latencyMs", "timings", "snapshotId", "dedup"]), VIN_ADDS = new Set(["ownSales", "matchedOption", "options", "optionLines", "headlineLines", "optionsNote", "refineOptions", "optionsRemainder", "chart"]);
const strip = (d, dropAdds) => { const o = {}; for (const [k, v] of Object.entries(d || {})) { if (KEEP_OUT.has(k)) continue; if (dropAdds && VIN_ADDS.has(k)) continue; o[k] = v; } return o; };
const env = rows => ({ supabaseUrl: "https://fake.supabase.test", supabaseKey: "k", asked: 0, poolSeed: { rows } });
for (const [vin, year, make, model, body, gear, label] of CARS) {
  const words = `${year} ${make} ${model}`, rows = poolFor(year, make, model, vin.replace(/[^A-Z0-9]/g, ""));
  const tr = await V.resolveVehicle(words, {}); const tv = tr && tr.vehicle;
  if (!tv || !tv.model) { ok(`${label}: the typed words resolve to the car`, false, tr && tr.status); continue; }
  const typed = E.withReadFields((await E.oneEngineAnswer(tv, null, words, env(rows), null)).raw, words, tv);
  // the VIN as the page gives it: a vehicle that carries the VIN, the car's year, make, model and the words its listing wrote
  const vinVehicle = { year, make, model, nameModel: model, bodyStyle: body ? body.toLowerCase() : null, trim: null, transmission: gear, vin, raw: vin };
  const plan = await A.vinSearchPlan(vinVehicle, { resolveVehicle: V.resolveVehicle });
  ok(`${label}: the VIN names the car and plans a typed search of it`, !!plan && !plan.unresolved && plan.text === words, JSON.stringify(plan && { text: plan.text, unresolved: plan.unresolved }));
  if (!plan || plan.unresolved) continue;
  const viaVin = A.applyVinOverlay(E.withReadFields((await E.oneEngineAnswer(plan.vehicle, null, plan.text, env(rows), null)).raw, plan.text, plan.vehicle), plan.ctx);
  const a = JSON.stringify(strip(typed, true)), b = JSON.stringify(strip(viaVin, true));
  const diff = a === b ? "" : Object.keys({ ...strip(typed, true), ...strip(viaVin, true) }).filter(k => JSON.stringify(typed[k]) !== JSON.stringify(viaVin[k])).slice(0, 6).join(", ");
  ok(`${label}: every field of the typed answer and the VIN answer is the same (except the two facts the VIN adds)`, a === b, diff);
  ok(`${label}: the same tier, range, count, window and questions (${typed.tier} ${JSON.stringify(typed.cluster)})`, typed.tier === viaVin.tier && JSON.stringify(typed.cluster) === JSON.stringify(viaVin.cluster) && typed.poolN === viaVin.poolN && typed.windowWords === viaVin.windowWords);
  ok(`${label}: the VIN car's own sale rides on top (ownSales names it)`, !!(viaVin.ownSales && viaVin.ownSales.lastSale), viaVin.ownSales ? "yes" : "no ownSales");
  ok(`${label}: it never says it could not check a car it named, and asks no question the typed car does not`, !/could not be checked/i.test(JSON.stringify(viaVin.refusal_line || viaVin.samLine || "")) && /_choice$/.test(String(typed.tier)) === /_choice$/.test(String(viaVin.tier)));
}
// a VIN that names no car: the engine's plain line, no numbers
{ const plan = await A.vinSearchPlan({ vin: "1ABCDEFGHJKLMNPRS", raw: "1ABCDEFGHJKLMNPRS" }, { resolveVehicle: V.resolveVehicle });
  ok("a VIN that names no car says so in the engine's line and shows no number", !!plan && plan.unresolved === true && /does not name a car/.test(plan.line), plan && plan.line); }
// a plain typed search is not a VIN search
ok("a typed search has no VIN plan", (await A.vinSearchPlan({ year: 2001, make: "BMW", model: "M3" }, { resolveVehicle: V.resolveVehicle })) === null);
console.log(fail ? `vinTypedCheck: ${fail} failure(s)` : "vinTypedCheck: all pass");
process.exit(fail ? 1 : 0);
