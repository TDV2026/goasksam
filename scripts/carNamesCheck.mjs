// DESK INTAKE: THE CAR'S NAME ON THE SHEET (Lane D, Nov 5 2026). The Hagerty test email made a sheet reading "2002 BMW M3Ci": the VIN decode (vPIC) names the car by
// BMW's body-suffix code. An analyst must read "2002 BMW M3 Convertible". The class: any decoded model or trim that is a code ("M3Ci", Porsche "C2S", "Base"),
// a body class in the decoder's words ("Convertible/Cabriolet"), a shouted make ("HONDA"). Runs the real decode wording (decodeVinPublic) on vPIC-shaped rows
// through the real intake and reads the label stored on the sheet. Offline (fetch is stubbed).
//   node scripts/carNamesCheck.mjs [repo root]   (a tree without the fix fails: scripts/intakeFailsWithout.mjs)
import path from "node:path"; import { fileURLToPath } from "node:url";
import { loadKit, reporter } from "./deskIntakeKit.mjs";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root); process.env.SUPABASE_URL = ""; process.env.SUPABASE_SERVICE_ROLE_KEY = "";
const { ok, result } = reporter();
const K = await loadKit(root);
// [vin, vPIC fields, the label an analyst should read, real?]  "live" rows were fetched from vPIC on Nov 5 2026; "shaped" rows follow the same fields but were
// not fetched (the service was refusing requests): they stand for the code families named in the brief.
const row = (y, make, model, trim, body, series = "") => ({ ModelYear: String(y), Make: make, Model: model, Trim: trim, Series: series, BodyClass: body });
const CASES = [
  ["WBSBR93422EX21856", row(2002, "BMW", "M3Ci", "", "Convertible/Cabriolet", "3-Series"), "2002 BMW M3 Convertible", "live"],
  ["WBSBL93402JR12345", row(2002, "BMW", "M3", "", "Coupe", "3-Series"), "2002 BMW M3 Coupe", "live"],
  ["JHMAP11441T004798", row(2001, "HONDA", "S2000", "", "Convertible/Cabriolet"), "2001 Honda S2000 Convertible", "live"],
  ["1B3BR65E0PV200106", row(1993, "DODGE", "Viper", "RT/10", "Convertible/Cabriolet"), "1993 Dodge Viper RT/10 Convertible", "live"],
  ["WBSBR93432EX00001", row(2003, "BMW", "M3Cic", "", "Convertible/Cabriolet"), "2003 BMW M3 Convertible", "shaped"],
  ["WBSBR93432EX00002", row(2002, "BMW", "M3is", "", "Coupe"), "2002 BMW M3 Coupe", "shaped"],
  ["WBSDE93422CR00003", row(2002, "BMW", "M5i", "", "Sedan/Saloon"), "2002 BMW M5 Sedan", "shaped"],
  ["WBSNB93422CR00004", row(2008, "BMW", "M6Ci", "", "Convertible/Cabriolet"), "2008 BMW M6 Convertible", "shaped"],
  ["WP0AB29928S750005", row(2008, "PORSCHE", "911", "C2S", "Coupe"), "2008 Porsche 911 Carrera S Coupe", "shaped"],
  ["WP0CB29928S750006", row(2008, "PORSCHE", "911", "C4S", "Convertible/Cabriolet"), "2008 Porsche 911 Carrera 4S Convertible", "shaped"],
  ["WP0AA29922S620007", row(2002, "PORSCHE", "911", "C2", "Coupe"), "2002 Porsche 911 Carrera Coupe", "shaped"],
  ["WP0AB29922S650008", row(2002, "PORSCHE", "911", "TT", "Coupe"), "2002 Porsche 911 Turbo Coupe", "shaped"],
  ["WP0AB29928S750009", row(2008, "PORSCHE", "911", "Base", "Coupe"), "2008 Porsche 911 Coupe", "shaped"],
  ["WP0AC29928S750010", row(2008, "PORSCHE", "911", "GT3", "Coupe"), "2008 Porsche 911 GT3 Coupe", "shaped"],
  ["JHMAP21405T000011", row(2005, "HONDA", "S2000", "Base", "Roadster"), "2005 Honda S2000 Roadster", "shaped"],
  ["1B3JZ69Z06V101012", row(2006, "DODGE", "Viper", "SRT10", "Convertible/Cabriolet"), "2006 Dodge Viper SRT10 Convertible", "shaped"],
  ["WBABN53432JJ00013", row(2003, "BMW", "330Ci", "", "Convertible/Cabriolet"), "2003 BMW 330Ci Convertible", "control: a marketed name is not a code"],
  ["WDBFA68F42F000014", row(2002, "MERCEDES-BENZ", "SL500", "", "Convertible/Cabriolet"), "2002 Mercedes-Benz SL500 Convertible", "control"],
  ["1G1YY22G025000015", row(2002, "CHEVROLET", "Corvette", "Z06", "Coupe"), "2002 Chevrolet Corvette Z06 Coupe", "control"]
];
const rows = new Map(CASES.map(c => [c[0], c[1]]));
globalThis.fetch = async url => { const v = /DecodeVinValues\/([A-Z0-9]+)/.exec(String(url)); const r = v && rows.get(v[1]); return { ok: !!r, json: async () => ({ Results: [r || {}] }) }; };
const { processInbound, decodeVinPublic } = K.run;
// a resolver that takes whatever words it is given as the car (the worst case: nothing downstream repairs a code)
const takeWords = async t => { const m = /^(\d{4}) (\S+) (\S+)(?: (.+))?$/.exec(String(t).trim()); return m ? { status: "valid", vehicle: { year: Number(m[1]), make: m[2], model: m[3], trim: m[4] || null } } : { status: "needs_clarification", vehicle: null }; };
for (const [vin, , want, kind] of CASES) {
  const { st, deps } = K.fresh(); deps.decodeVin = decodeVinPublic; deps.resolveVehicle = takeWords;
  const r = await processInbound(K.mail({ from: "ann@hagerty.example", subject: "Fwd: car", text: `VIN ${vin}\n12,000 miles` }), deps);
  const sheet = st._state.sheets[0];
  ok(`${vin} [${kind}] reads "${want}"`, sheet && sheet.car_label === want, { got: sheet && sheet.car_label, r: r.outcome });
  if (/M3|M5|M6/.test(want)) ok(`${vin}: the model column is the plain M model`, sheet && /^M[356]$/.test(sheet.model), sheet && sheet.model);
}
{ const { st, deps, reads } = K.fresh(); deps.decodeVin = decodeVinPublic; deps.resolveVehicle = takeWords;
  await processInbound(K.mail({ from: "ann@hagerty.example", subject: "Fwd: car", text: "VIN WBSBR93422EX21856" }), deps);
  ok("the engine read is started with the plain car (model M3, body convertible)", reads[0] && reads[0].car.model === "M3" && /convertible/i.test(reads[0].car.bodyStyle || ""), reads[0] && reads[0].car); }
// a label already frozen on a finalised sheet is never rewritten
{ const { st, deps } = K.fresh(); deps.decodeVin = decodeVinPublic; deps.resolveVehicle = takeWords;
  await processInbound(K.mail({ from: "ann@hagerty.example", subject: "Fwd: car", text: "VIN WBSBR93422EX21856" }), deps);
  const first = st._state.sheets[0]; await st.patchSheet("hagerty", first.id, { car_label: "2002 BMW M3Ci", status: "finalised" });
  await processInbound(K.mail({ from: "ann@hagerty.example", subject: "Fwd: car again", text: "VIN WBSBR93422EX21856 more photos" }), deps);
  const frozen = st._state.sheets.find(s => s.id === first.id), others = st._state.sheets.filter(s => s.id !== first.id);
  ok("a finalised sheet keeps the label it was frozen with", frozen.car_label === "2002 BMW M3Ci" && frozen.status === "finalised", frozen.car_label);
  ok("a later email makes a new sheet with the plain label, pointing back", others.length === 1 && others[0].car_label === "2002 BMW M3 Convertible" && others[0].supersedes_sheet_id === first.id, others.map(o => o.car_label)); }
{ const r = result(); console.log(`carNamesCheck: ${r.pass} pass, ${r.fail} FAIL`); process.exit(r.fail ? 1 : 0); }
