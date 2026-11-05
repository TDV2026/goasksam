// A VIN'S MODEL READS AS THE PLAIN MODEL, EVERY PATH (Lane D, Nov 5 2026). vPIC names some cars by the maker's code: the 2002 BMW M3 convertible of VIN
// WBSBR93422EX21856 decodes as Model "M3Ci" (BMW's coupe/convertible suffix). lib/vehicle.js passed that through, so the /sell VIN wizard (decodeVinRich and the
// flag-off decodeVin), api/partnerAnswer.js and api/usageDashboard.js (decodeVinFacts, vpicFacts) read "M3Ci", and the engine key was the thin ["BMW","M3CI",...].
// CLASS: any decoded model carrying a body/drive suffix code (M3Ci, M3Cic, M3is, M5i, M6Ci); a control proves a marketed name (330Ci) and every other field
// (trim, body style, make) is as decoded, so no other car's answer moves. Offline (fetch is stubbed).
//   node scripts/vinNamesCheck.mjs [repo root]   (a tree without the fix fails: run against origin/main)
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.LAUNCH_STAGE = "2";
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) pass++; else { fail++; console.log("FAIL " + n + (d !== undefined ? " " + JSON.stringify(d) : "")); } };
// [vin, vPIC row fields, the model the engine should be asked about, trim as decoded, bodyStyle as decoded]  ("live": fetched from vPIC Nov 5 2026; "shaped": same fields, not fetched)
const row = (y, make, model, trim, body, series = "") => ({ ModelYear: String(y), Make: make, Model: model, Trim: trim, Series: series, BodyClass: body });
const CASES = [
  ["WBSBR93422EX21856", row(2002, "BMW", "M3Ci", "", "Convertible/Cabriolet", "3-Series"), "M3", null, "convertible", "live"],
  ["WBSBL93402JR12345", row(2002, "BMW", "M3", "", "Coupe", "3-Series"), "M3", null, "coupe", "live"],
  ["JHMAP11441T004798", row(2001, "HONDA", "S2000", "", "Convertible/Cabriolet"), "S2000", null, "convertible", "live"],
  ["1B3BR65E0PV200106", row(1993, "DODGE", "Viper", "RT/10", "Convertible/Cabriolet"), "Viper", null, "convertible", "live"],   // the "/" trim is dropped by cleanVinTrim, as before
  ["WBSBR93432EX00001", row(2003, "BMW", "M3Cic", "", "Convertible/Cabriolet"), "M3", null, "convertible", "shaped"],
  ["WBSBR93432EX00002", row(2002, "BMW", "M3is", "", "Coupe"), "M3", null, "coupe", "shaped"],
  ["WBSDE93422CR00003", row(2002, "BMW", "M5i", "", "Sedan/Saloon"), "M5", null, "sedan", "shaped"],
  ["WBSNB93422CR00004", row(2008, "BMW", "M6Ci", "", "Convertible/Cabriolet"), "M6", null, "convertible", "shaped"],
  ["WP0AB29928S750005", row(2008, "PORSCHE", "911", "C2S", "Coupe"), "911", "C2S", "coupe", "shaped"],          // trim codes are the resolver's (it already reads C2S as Carrera S): untouched here
  ["WP0AB29922S650008", row(2002, "PORSCHE", "911", "TT", "Coupe"), "911", "TT", "coupe", "shaped"],
  ["JHMAP21405T000011", row(2005, "HONDA", "S2000", "Base", "Roadster"), "S2000", "Base", "convertible", "shaped"],   // a roadster is already a convertible in the bodyStyle vocabulary, as before
  ["WBABN53432JJ00013", row(2003, "BMW", "330Ci", "", "Convertible/Cabriolet"), "330Ci", null, "convertible", "control: a marketed name is not a code"],
  ["WDBFA68F42F000014", row(2002, "MERCEDES-BENZ", "SL500", "", "Convertible/Cabriolet"), "SL500", null, "convertible", "control"],
  ["1G1YY22G025000015", row(2002, "CHEVROLET", "Corvette", "Z06", "Coupe"), "Corvette", "Z06", "coupe", "control"]
];
const rows = new Map(CASES.map(c => [c[0], c[1]]));
globalThis.fetch = async url => {
  const u = new URL(String(url)), m = /DecodeVinValues\/([A-Z0-9]+)/.exec(u.pathname);
  if (u.hostname.includes("vpic") && m) { const r = rows.get(m[1]); return new Response(JSON.stringify({ Results: [r || {}] }), { status: 200 }); }
  if (u.hostname === "fake.supabase.test") return new Response("[]", { status: 200 });
  throw new Error("offline");
};
const V = await import(pathToFileURL(path.join(root, "lib/vehicle.js")).href);
const wordsOf = f => [f.year, f.make, f.model, f.trim].filter(Boolean).join(" ");
for (const [vin, r, model, trim, body, kind] of CASES) {
  const f = V.vpicFacts(r, vin), tag = `${vin} [${kind}]`;
  ok(`${tag}: vpicFacts model is ${model}`, f.model === model, f.model);
  ok(`${tag}: vpicFacts trim and body style are as decoded (${trim}, ${body})`, (f.trim ?? null) === trim && (f.bodyStyle ?? null) === body, { trim: f.trim, body: f.bodyStyle });
  const d = await V.decodeVinFacts(vin);
  ok(`${tag}: decodeVinFacts (partner answer, usage dashboard) model is ${model}`, d && d.model === model, d && d.model);
  // the /sell wizard, flag on: rich decode, propose, the engine is asked about the resolved vehicle
  const on = await V.resolveVehicle(`my car is ${vin}`, { vinConfirm: true }).catch(e => ({ error: String(e.message) }));
  const ov = on && on.vehicle;
  ok(`${tag}: /sell VIN wizard (flag on) asks the engine about ${model}`, !ov || !/M[2-8](Ci|Cic|Cis|is|ic|Ti|i|d)$/i.test(String(ov.model || "")) && (kind.startsWith("control") || !ov.model || String(ov.model).toUpperCase().replace(/\s/g, "").startsWith(model.toUpperCase().replace(/\s/g, "")) || ov.model === model), ov && ov.model);
  // flag off: the silent decode
  const off = await V.resolveVehicle(`my car is ${vin}`, {}).catch(e => ({ error: String(e.message) }));
  const fv = off && off.vehicle;
  ok(`${tag}: /sell VIN decode (flag off) has no code-style model`, !fv || !/^M[2-8](Ci|Cic|Cis|is|ic|Ti|i|d)$/i.test(String(fv.model || "")), fv && fv.model);
}
// the class: every code form is caught, no marketed name or other model is
for (const [m, want] of [["M3Ci", "M3"], ["M3Cic", "M3"], ["M3is", "M3"], ["M3i", "M3"], ["M5i", "M5"], ["M6Ci", "M6"], ["M2", "M2"], ["M3", "M3"], ["330Ci", "330Ci"], ["325i", "325i"], ["Z3", "Z3"], ["X5", "X5"], ["M3 CSL", "M3 CSL"]])
  ok(`BMW model "${m}" reads "${want}"`, V.vpicFacts(row(2002, "BMW", m, "", "Coupe"), "WBSBL93402JR12345").model === want, V.vpicFacts(row(2002, "BMW", m, "", "Coupe"), "WBSBL93402JR12345").model);
ok("a non BMW model with the same letters is untouched (Ford M3i is not a BMW code)", V.vpicFacts(row(2002, "FORD", "M3Ci", "", "Coupe"), "1FA6P8CF5J5123456").model === "M3Ci");
console.log(`vinNamesCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
