// A VIN WITH A DECODED TRIM READS THE TYPED ANSWER OF THAT TRIM (Lane B, Nov 3 2026, lane-b-vintrim). The partner page for VIN 2C3CDZH92JH100451 was titled "2018 Dodge Challenger SRT Demon" and printed the bare 2018 Challenger pool widened to 2016 to 2021
// ($23,500 to $30,500 on 8 sales); the typed Demon reads $91,000 to $105,000 on 23.
// CAUSE: api/partnerAnswer.js built the engine text as year, make and model (the decoded trim travelled only as a fact for settling a question) and lib/vinAsTyped.js vinSearchPlan did the same (a trim only when the VIN's own sale named one).
// FIX: lib/vinAsTyped.js decodeTrimRerun (called in api/sellerDecision.js on every VIN path): a finished bare answer on a VIN whose decode names a trim the resolver knows is answered again as the typed search of that trim.
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
// [VIN, year, make, model, decoded trim, decoded body]
const CARS = [
  ["2C3CDZH92JH100451", 2018, "Dodge", "Challenger", "SRT Demon"], ["2C3CDZC94JH100001", 2018, "Dodge", "Challenger", "SRT Hellcat"], ["2C3CDZFJ5JH100002", 2018, "Dodge", "Challenger", "SRT Hellcat Widebody"],
  ["WP0AF2A99KS100003", 2019, "Porsche", "911", "GT3 RS"], ["WP0AE2A99KS100004", 2019, "Porsche", "911", "GT2 RS"], ["WP0AC2A99FS100005", 2015, "Porsche", "911", "Carrera 4S"],
  ["1G1YU2D61F5100006", 2015, "Chevrolet", "Corvette", "Z06"], ["1G1YW2DW5B5100007", 2011, "Chevrolet", "Corvette", "ZR1"], ["1ZVBP8JZ3E5100008", 2014, "Ford", "Mustang", "Shelby GT500"],
  ["WBS8M9C57J5100009", 2018, "BMW", "M3", "Competition"], ["19XFC1F31KE100010", 2019, "Honda", "Civic", "Type R"], ["1FA6P8JZ2H5100011", 2017, "Ford", "Mustang", "Shelby GT350R"],
  ["1G1YM2D78G5100012", 2016, "Chevrolet", "Corvette", "Z06"], ["WP0CD2A99JS100013", 2018, "Porsche", "718 Cayman", "GT4"], ["1C3CDZH92HN100014", 2017, "Dodge", "Charger", "SRT Hellcat"],
  ["ZFF76ZFA5H0100015", 2017, "Ferrari", "488", "GTB"], ["WDDLJ7GB5GA100016", 2016, "Mercedes-Benz", "AMG GT", "S"], ["JN1AZ4EH4DM100017", 2013, "Nissan", "370Z", "Nismo"],
  ["1FADP3L9XEL100018", 2014, "Ford", "Focus", "ST"], ["1G1FH1R78H0100019", 2017, "Chevrolet", "Camaro", "ZL1"], ["WAUPFAFR5CA100020", 2012, "Audi", "R8", "GT"], ["SAJWA6ET5H8100021", 2017, "Jaguar", "F-Type", "SVR"],
  // body: a decoded or recorded body is part of the typed words (the 2002 BMW M3 convertible of VIN WBSBR93422EX21856 asked "Which M3? Convertible or Coupe" about a car whose own sale the engine had matched as a convertible)
  ["WBSBR93422EX21856", 2002, "BMW", "M3", null, "convertible"], ["WP0CB29978S100022", 2008, "Porsche", "911", "Carrera S", "cabriolet"], ["ZFF67NFA5D0100023", 2013, "Ferrari", "458", "Spider", null],
  ["WBSBR93432EX21857", 2002, "BMW", "M3", "Competition", "coupe"], ["1ZVBP8JZ3E5100024", 2014, "Ford", "Mustang", null, "convertible"]
];
const BODYW = { cabriolet: "cabriolet", spider: "spider", convertible: "convertible", coupe: "coupe" }, OTHERB = { cabriolet: "coupe", spider: "coupe", convertible: "coupe", coupe: "convertible" };
const rowsFor = (year, make, model, trim, body) => {
  const mk = (i, withTrim) => ({ id: (withTrim ? "t" : "b") + i, price: withTrim ? 90000 + i * 700 : 22000 + i * 400, _usd: withTrim ? 90000 + i * 700 : 22000 + i * 400, auction_end_date: `2026-0${1 + (i % 9)}-${10 + (i % 9)}`, year: withTrim ? year : year + ((i % 5) - 2), make, model,
    raw_title: `${withTrim ? year : year + ((i % 5) - 2)} ${make} ${model}${withTrim ? " " + trim : ""}`, rtitle: `${withTrim ? year : year + ((i % 5) - 2)} ${make} ${model}${withTrim ? " " + trim : ""}`, mileage: String(5000 + i * 900), vin_norm: "ZZZ" + (withTrim ? 2 : 1) + (100000 + i), transmission: "Automatic", image: `https://img.test/${withTrim ? "t" : "b"}${i}.jpg`, source: "bringatrailer", platform: "bringatrailer" });
  const withBody = (r, b, price) => ({ ...r, id: b + r.id, price, _usd: price, raw_title: r.raw_title + " " + b, rtitle: r.rtitle + " " + b, vin_norm: r.vin_norm + b });
  if (body) return [...Array.from({ length: 14 }, (_, i) => withBody(mk(i, !!trim), BODYW[body], 80000 + i * 500)), ...Array.from({ length: 14 }, (_, i) => withBody(mk(i, !!trim), OTHERB[body], 30000 + i * 400))];
  return [...Array.from({ length: 14 }, (_, i) => mk(i, false)), ...Array.from({ length: 14 }, (_, i) => mk(i, true))];
};
const env = rows => ({ supabaseUrl: "https://fake.supabase.test", supabaseKey: "k", asked: 0, poolSeed: { rows } });
const facts = (d, year) => ({ poolN: d.poolN, cluster: JSON.stringify(d.cluster), range: JSON.stringify([d.rangeLow ?? null, d.rangeHigh ?? null, d.headline ?? null]), scope: d.scopeLine || null, rung: d.rungLabel || null, cards: JSON.stringify((d.cards || []).map(c => c.id || c.image || c.title)), hero: JSON.stringify((P.carPhotoOf ? P.carPhotoOf(d, year) : null)), tier: d.tier });
const read = async (vehicle, text, rows) => E.withReadFields((await E.oneEngineAnswer(vehicle, null, text, env(rows), null)).raw, text, vehicle);
const diffKeys = (a, b) => Object.keys(a).filter(k => a[k] !== b[k]);
let vacuous = 0;
for (const [vin, year, make, model, trim, body] of CARS) {
  const label = [year, make, model, trim, body].filter(Boolean).join(" "), rows = rowsFor(year, make, model, trim, body), typedText = label, bareText = `${year} ${make} ${model}`;
  const tr = await V.resolveVehicle(typedText, {}); const tv = tr && tr.vehicle;
  if (!tv || !tv.model) { ok(`${label}: the typed words resolve`, false, tr && tr.status); continue; }
  const typed = await read(tv, typedText, rows), F = facts(typed, year);
  // the bare model answer (what the VIN paths gave before): proves the trim matters for this car
  const br = await V.resolveVehicle(bareText, {}), bare = br && br.vehicle ? facts(await read(br.vehicle, bareText, rows), year) : null;
  if (bare && diffKeys(F, bare).length === 0) vacuous++;
  // PARTNER PAGE: the engine reads the car's words as the page sends them (year make model), then the engine's own decodeTrimRerun runs on the finished answer with the decode's trim (api/sellerDecision.js, the same call on every VIN path)
  const finalOf = async (vehicle, text, ctx, again) => { const bare0 = await read(vehicle, text, rows), rr = typeof A.decodeTrimRerun === "function" ? await A.decodeTrimRerun(bare0, ctx, { resolveVehicle: V.resolveVehicle }) : null; return rr ? await again(rr) : bare0; };
  const partnerCtx = { vf: { decodeTrim: trim, decodeBody: body }, text: bareText };
  const viaPartnerD = await finalOf(br.vehicle, bareText, partnerCtx, async rr => read(rr.vehicle, rr.text, rows)), viaPartner = facts(viaPartnerD, year);
  ok(`${label}: partner answer equals typed answer on pool count, range, scope line, cards and hero photo`, diffKeys(F, viaPartner).length === 0, diffKeys(F, viaPartner).join(", "));
  // CONSUMER VIN PLAN (the VIN page, Find, ops vintypedlive): the plan of the VIN, then the same rerun, which hands the plan the decode's trim
  const vinVehicle = { year, make, model, nameModel: model, trim, bodyStyle: body || null, transmission: null, vin, raw: vin };
  const plan = await A.vinSearchPlan(vinVehicle, { resolveVehicle: V.resolveVehicle });
  let viaPlanD = null;
  if (plan && !plan.unresolved) {
    const b0 = A.applyVinOverlay(await read(plan.vehicle, plan.text, rows), plan.ctx), rr = typeof A.decodeTrimRerun === "function" ? await A.decodeTrimRerun(b0, { ...plan.ctx, text: plan.text }, { resolveVehicle: V.resolveVehicle }) : null;
    if (rr) { const p2 = await A.vinSearchPlan(vinVehicle, { resolveVehicle: V.resolveVehicle, rerunWords: [rr.trim, rr.body].filter(Boolean).join(" ") }); viaPlanD = A.applyVinOverlay(await read(p2.vehicle, p2.text, rows), p2.ctx); } else viaPlanD = b0;
  }
  ok(`${label}: no trim or body question is asked when the VIN answers it (partner ${viaPartnerD.tier}, plan ${viaPlanD && viaPlanD.tier}; typed ${typed.tier})`, !/_choice$/.test(String(viaPartnerD.tier)) && !!viaPlanD && !/_choice$/.test(String(viaPlanD.tier)) || /_choice$/.test(String(typed.tier)));
  const viaPlan = viaPlanD ? facts(viaPlanD, year) : null;
  ok(`${label}: the VIN plan's answer equals the typed answer on pool count, range, scope line, cards and hero photo`, !!viaPlan && diffKeys(F, viaPlan).length === 0, viaPlan ? diffKeys(F, viaPlan).join(", ") : "no plan");
}
// MILEAGE RIDES WITH THE VIN (lane-b-vinpool item 3): VIN WP0CA29951S650259, a 2001 996 Carrera cabriolet listed at 153,098 miles, was answered from the whole pool ($20,500 to $30,000) while the 101,000 mile car in it sold for $18,750.
// With the listing's mileage the VIN answer is the typed answer with that mileage (the engine's own band, refine.miTarget); without it the engine's one line says the range is for all mileages.
{
  const year = 2001, make = "Porsche", model = "911", trim = "Carrera", body = "cabriolet", vin = "WP0CA29951S650259", MI = 153098, label = "2001 Porsche 911 Carrera cabriolet at 153,098 miles";
  const rows = Array.from({ length: 40 }, (_, i) => { const mi = 20000 + i * 3700, price = Math.round(31000 - mi * 0.09 + (i % 3) * 150); return { id: "m" + i, price: i === 20 ? 18750 : price, _usd: i === 20 ? 18750 : price, auction_end_date: `2026-0${1 + (i % 9)}-${10 + (i % 9)}`, year, make, model, raw_title: `${year} ${make} ${model} ${trim} ${body}`, rtitle: `${year} ${make} ${model} ${trim} ${body}`, mileage: String(i === 20 ? 101000 : mi), vin_norm: "ZZM" + (100000 + i), transmission: "Automatic", image: `https://img.test/m${i}.jpg`, source: "bringatrailer", platform: "bringatrailer" }; });
  const words = `${year} ${make} ${model} ${trim} ${body}`, tr = await V.resolveVehicle(words, {}), tv = tr && tr.vehicle;
  const run = async (vehicle, text, refine) => E.withReadFields((await E.oneEngineAnswer(vehicle, null, text, env(rows), refine || null)).raw, text, vehicle);
  const vinVehicle = { year, make, model, nameModel: model, trim, bodyStyle: body, transmission: null, vin, raw: vin };
  const viaVin = async refine => { const plan = await A.vinSearchPlan(vinVehicle, { resolveVehicle: V.resolveVehicle }); const b0 = A.applyVinOverlay(await run(plan.vehicle, plan.text, refine), plan.ctx);
    const rr = typeof A.decodeTrimRerun === "function" ? await A.decodeTrimRerun(b0, { ...plan.ctx, text: plan.text }, { resolveVehicle: V.resolveVehicle }) : null;
    if (!rr) return b0; const p2 = await A.vinSearchPlan(vinVehicle, { resolveVehicle: V.resolveVehicle, rerunWords: [rr.trim, rr.body].filter(Boolean).join(" ") }); return A.applyVinOverlay(await run(p2.vehicle, p2.text, refine), p2.ctx); };
  const typedAll = await run(tv, words, null), typedMi = await run(tv, words, { miTarget: MI }), vinMi = await viaVin({ miTarget: MI }), vinAll = await viaVin(null);
  ok(`${label}: the mileage changes the answer (the whole pool's range is not the 153k band's)`, JSON.stringify(typedAll.cluster) !== JSON.stringify(typedMi.cluster) || typedAll.poolN !== typedMi.poolN, `all ${JSON.stringify(typedAll.cluster)} n=${typedAll.poolN}; at ${MI} ${JSON.stringify(typedMi.cluster)} n=${typedMi.poolN}`);
  const FM = facts(typedMi, year), FV = facts(vinMi, year);
  ok(`${label}: the VIN answer with the mileage equals the typed answer with the mileage on pool count, range, scope line, cards and hero photo`, diffKeys(FM, FV).length === 0, diffKeys(FM, FV).join(", "));
  ok(`${label}: with the mileage the engine's line names it (mileageLine)`, typeof vinMi.mileageLine === "string" && vinMi.mileageLine.includes("153,098"), String(vinMi.mileageLine));
  ok(`${label}: without the mileage the engine's one line says the range is for all mileages`, vinAll.mileageLine === "The range is for all mileages." && !vinAll.rangeMileage, String(vinAll.mileageLine));
  ok(`${label}: without the mileage the VIN answer equals the typed answer (the whole pool)`, diffKeys(facts(typedAll, year), facts(vinAll, year)).length === 0);
  // TYPED CAR WITH A MILEAGE (Sam, Nov 3 2026): the same behaviour however the car was entered. The partner page's typed car and mileage is the typed answer with that mileage, which is what Market Check gives; without the mileage the same one line.
  { const tMi = await run(tv, words, { miTarget: MI }), tAll = await run(tv, words, null);
    ok(`typed ${words} with ${MI.toLocaleString("en-US")} miles equals the VIN answer with the mileage (range, count, scope, cards, hero) and carries the mileage line`, diffKeys(facts(tMi, year), FV).length === 0 && typeof tMi.mileageLine === "string" && tMi.mileageLine.includes("153,098"), String(tMi.mileageLine));
    ok(`typed ${words} without a mileage carries the engine's all-mileages line`, tAll.mileageLine === "The range is for all mileages.", String(tAll.mileageLine)); }
  { const src = fs.readFileSync(path.join(root, "api/partnerAnswer.js"), "utf8"), pg = fs.readFileSync(path.join(root, "api/partnerDemo.js"), "utf8");
    ok("api/partnerAnswer.js hands ANY request's mileage (VIN or typed car) to the engine as the typed mileage (refine.miTarget), never stores it as the last good, and prints the engine's mileageLine", /engineRefine = ask && ask\.mileage/.test(src) && /!engineRefine \? demoKey/.test(src) && /mileageLine: typeof d\.mileageLine/.test(src));
    ok("the demo page has a mileage field beside the VIN field, sends it, and prints the engine's line", /id="a-mileage"/.test(pg) && /mileage: mi/.test(pg) && /a\.mileageLine/.test(pg)); }
}
ok("the check is not vacuous: the trim changes the answer for most of the cars (the bare model reads another pool)", vacuous <= Math.floor(CARS.length / 3), `${vacuous} of ${CARS.length} read the same with and without the trim`);
// the partner endpoint must build its text with the one function (a page that builds its own words drifts)
{ const src = fs.readFileSync(path.join(root, "api/sellerDecision.js"), "utf8"); ok("api/sellerDecision.js runs decodeTrimRerun on a finished VIN answer, for the VIN page and the partner read alike", /decodeTrimRerun\(oneBox, vinCtx/.test(src)); }
console.log(fail ? `vinTypedMatchCheck: ${fail} failure(s)` : "vinTypedMatchCheck: all pass");
process.exit(fail ? 1 : 0);
