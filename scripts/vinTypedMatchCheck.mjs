// A VIN WITH A DECODED TRIM READS THE TYPED ANSWER OF THAT TRIM (Lane B, Nov 3 2026, lane-b-vintrim). The partner page for VIN 2C3CDZH92JH100451 was titled "2018 Dodge Challenger SRT Demon" and printed the bare 2018 Challenger pool widened to 2016 to 2021
// ($23,500 to $30,500 on 8 sales); the typed Demon reads $91,000 to $105,000 on 23.
// CAUSE: api/partnerAnswer.js built the engine text as year, make and model (the decoded trim travelled only as a fact for settling a question) and lib/vinAsTyped.js vinSearchPlan did the same (a trim only when the VIN's own sale named one).
// FIX: lib/vinAsTyped.js vinTypedText / vinTrimOf name the VIN car's words, trim included, for both paths.
// THIS CHECK: for each VIN car below (decoded trim in hand) the typed answer of "year make model trim" and the answer the VIN paths give (the partner page's text, the VIN plan) must have the same pool count, range, scope line, set of cards and hero photo, and
// the answer must NOT be the bare model's (so the check is not vacuous). A seeded pool, no database.
//   node scripts/vinTypedMatchCheck.mjs [repo root]     (run against a tree without the fix to see it fail)
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.LAUNCH_STAGE = "2";
globalThis.fetch = async (url) => { const u = new URL(String(url)); if (u.hostname !== "fake.supabase.test") throw new Error("offline"); return new Response("[]", { status: 200 }); };
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href), V = await import(pathToFileURL(path.join(root, "lib/vehicle.js")).href), A = await import(pathToFileURL(path.join(root, "lib/vinAsTyped.js")).href), P = await import(pathToFileURL(path.join(root, "api/partnerAnswer.js")).href);
// [VIN, year, make, model, decoded trim]
const CARS = [
  ["2C3CDZH92JH100451", 2018, "Dodge", "Challenger", "SRT Demon"], ["2C3CDZC94JH100001", 2018, "Dodge", "Challenger", "SRT Hellcat"], ["2C3CDZFJ5JH100002", 2018, "Dodge", "Challenger", "SRT Hellcat Widebody"],
  ["WP0AF2A99KS100003", 2019, "Porsche", "911", "GT3 RS"], ["WP0AE2A99KS100004", 2019, "Porsche", "911", "GT2 RS"], ["WP0AC2A99FS100005", 2015, "Porsche", "911", "Carrera 4S"],
  ["1G1YU2D61F5100006", 2015, "Chevrolet", "Corvette", "Z06"], ["1G1YW2DW5B5100007", 2011, "Chevrolet", "Corvette", "ZR1"], ["1ZVBP8JZ3E5100008", 2014, "Ford", "Mustang", "Shelby GT500"],
  ["WBS8M9C57J5100009", 2018, "BMW", "M3", "Competition"], ["19XFC1F31KE100010", 2019, "Honda", "Civic", "Type R"], ["1FA6P8JZ2H5100011", 2017, "Ford", "Mustang", "Shelby GT350R"],
  ["1G1YM2D78G5100012", 2016, "Chevrolet", "Corvette", "Z06"], ["WP0CD2A99JS100013", 2018, "Porsche", "718 Cayman", "GT4"], ["1C3CDZH92HN100014", 2017, "Dodge", "Charger", "SRT Hellcat"],
  ["ZFF76ZFA5H0100015", 2017, "Ferrari", "488", "GTB"], ["WDDLJ7GB5GA100016", 2016, "Mercedes-Benz", "AMG GT", "S"], ["JN1AZ4EH4DM100017", 2013, "Nissan", "370Z", "Nismo"],
  ["1FADP3L9XEL100018", 2014, "Ford", "Focus", "ST"], ["1G1FH1R78H0100019", 2017, "Chevrolet", "Camaro", "ZL1"], ["WAUPFAFR5CA100020", 2012, "Audi", "R8", "GT"], ["SAJWA6ET5H8100021", 2017, "Jaguar", "F-Type", "SVR"]
];
const rowsFor = (year, make, model, trim) => {
  const mk = (i, withTrim) => ({ id: (withTrim ? "t" : "b") + i, price: withTrim ? 90000 + i * 700 : 22000 + i * 400, _usd: withTrim ? 90000 + i * 700 : 22000 + i * 400, auction_end_date: `2026-0${1 + (i % 9)}-${10 + (i % 9)}`, year: withTrim ? year : year + ((i % 5) - 2), make, model,
    raw_title: `${withTrim ? year : year + ((i % 5) - 2)} ${make} ${model}${withTrim ? " " + trim : ""}`, rtitle: `${withTrim ? year : year + ((i % 5) - 2)} ${make} ${model}${withTrim ? " " + trim : ""}`, mileage: String(5000 + i * 900), vin_norm: "ZZZ" + (withTrim ? 2 : 1) + (100000 + i), transmission: "Automatic", image: `https://img.test/${withTrim ? "t" : "b"}${i}.jpg`, source: "bringatrailer", platform: "bringatrailer" });
  return [...Array.from({ length: 14 }, (_, i) => mk(i, false)), ...Array.from({ length: 14 }, (_, i) => mk(i, true))];
};
const env = rows => ({ supabaseUrl: "https://fake.supabase.test", supabaseKey: "k", asked: 0, poolSeed: { rows } });
const facts = (d, year) => ({ poolN: d.poolN, cluster: JSON.stringify(d.cluster), range: JSON.stringify([d.rangeLow ?? null, d.rangeHigh ?? null, d.headline ?? null]), scope: d.scopeLine || null, rung: d.rungLabel || null, cards: JSON.stringify((d.cards || []).map(c => c.id || c.image || c.title)), hero: JSON.stringify((P.carPhotoOf ? P.carPhotoOf(d, year) : null)), tier: d.tier });
const read = async (vehicle, text, rows) => E.withReadFields((await E.oneEngineAnswer(vehicle, null, text, env(rows), null)).raw, text, vehicle);
const diffKeys = (a, b) => Object.keys(a).filter(k => a[k] !== b[k]);
let vacuous = 0;
for (const [vin, year, make, model, trim] of CARS) {
  const label = `${year} ${make} ${model} ${trim}`, rows = rowsFor(year, make, model, trim), typedText = `${year} ${make} ${model} ${trim}`, bareText = `${year} ${make} ${model}`;
  const tr = await V.resolveVehicle(typedText, {}); const tv = tr && tr.vehicle;
  if (!tv || !tv.model) { ok(`${label}: the typed words resolve`, false, tr && tr.status); continue; }
  const typed = await read(tv, typedText, rows), F = facts(typed, year);
  // the bare model answer (what the VIN paths gave before): proves the trim matters for this car
  const br = await V.resolveVehicle(bareText, {}), bare = br && br.vehicle ? facts(await read(br.vehicle, bareText, rows), year) : null;
  if (bare && diffKeys(F, bare).length === 0) vacuous++;
  // PARTNER PAGE: the engine text the page builds for this VIN (id from the archive or the decode)
  const partnerText = typeof A.vinTypedText === "function" ? A.vinTypedText({ year, make, model, nameModel: model, trim }) : [year, make, model].join(" ");
  const pr = await V.resolveVehicle(partnerText, {}), pv = pr && pr.vehicle ? pr.vehicle : null;
  const viaPartner = pv ? facts(await read(pv, partnerText, rows), year) : null;
  ok(`${label}: the partner page's text is the typed words ("${partnerText}")`, partnerText === typedText, partnerText);
  ok(`${label}: partner answer equals typed answer on pool count, range, scope line, cards and hero photo`, !!viaPartner && diffKeys(F, viaPartner).length === 0, viaPartner ? diffKeys(F, viaPartner).join(", ") : "no vehicle");
  // CONSUMER VIN PLAN
  const vinVehicle = { year, make, model, nameModel: model, trim, bodyStyle: null, transmission: null, vin, raw: vin };
  const plan = await A.vinSearchPlan(vinVehicle, { resolveVehicle: V.resolveVehicle });
  const viaPlan = plan && !plan.unresolved ? facts(A.applyVinOverlay(await read(plan.vehicle, plan.text, rows), plan.ctx), year) : null;
  ok(`${label}: the VIN plan's answer equals the typed answer on pool count, range, scope line, cards and hero photo`, !!viaPlan && diffKeys(F, viaPlan).length === 0, viaPlan ? diffKeys(F, viaPlan).join(", ") : "no plan");
}
ok("the check is not vacuous: the trim changes the answer for most of the cars (the bare model reads another pool)", vacuous <= Math.floor(CARS.length / 3), `${vacuous} of ${CARS.length} read the same with and without the trim`);
// the partner endpoint must build its text with the one function (a page that builds its own words drifts)
{ const src = fs.readFileSync(path.join(root, "api/partnerAnswer.js"), "utf8"); ok("api/partnerAnswer.js builds a VIN's engine text with vinTypedText", /vinTypedText\(/.test(src) && !/\[id\.year, id\.make, id\.family \|\| id\.model\]/.test(src)); }
console.log(fail ? `vinTypedMatchCheck: ${fail} failure(s)` : "vinTypedMatchCheck: all pass");
process.exit(fail ? 1 : 0);
