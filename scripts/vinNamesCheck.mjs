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
  // live: fetched from vPIC on Nov 5 2026 (the VINs are pattern VINs for the model, the rows are what vPIC returned)
  ["WBSBR93422EX21856", row(2002, "BMW", "M3Ci", "", "Convertible/Cabriolet", "3-Series"), "M3", null, "convertible", "live"],
  ["WBSBR93432EX12345", row(2002, "BMW", "M3Ci", "", "Convertible/Cabriolet", "3-Series"), "M3", null, "convertible", "live"],
  ["WBSBL93402JR12345", row(2002, "BMW", "M3", "", "Coupe", "3-Series"), "M3", null, "coupe", "live"],
  ["WBSKG9C50BE123456", row(2011, "BMW", "M3", "", "Coupe", "3-Series"), "M3", null, "coupe", "live"],
  ["WBSDE93422CR12345", row(2002, "BMW", "M5", "", "Sedan/Saloon", "5-Series"), "M5", null, "sedan", "live"],
  ["JHMAP11441T004798", row(2001, "HONDA", "S2000", "", "Convertible/Cabriolet"), "S2000", null, "convertible", "live"],
  ["JHMAP21405T000011", row(2005, "HONDA", "S2000", "", "Convertible/Cabriolet"), "S2000", null, "convertible", "live"],
  ["1B3BR65E0PV200106", row(1993, "DODGE", "Viper", "RT/10", "Convertible/Cabriolet"), "Viper", "RT/10", "convertible", "live: a real single trim with a slash is kept"],
  ["1B3JZ69Z06V101012", row(2006, "DODGE", "Viper", "SRT-10", "Coupe", "ZB"), "Viper", "SRT-10", "coupe", "live"],
  ["WP0AC29964S692123", row(2004, "PORSCHE", "911", "GT3", "Coupe"), "911", "GT3", "coupe", "live"],
  ["WP0AB29958S750123", row(2008, "PORSCHE", "911", "S (2WD), 4S (4WD)", "Coupe", "Carrera"), "911", null, "coupe", "live: the 997 trim is a list (S or 4S), so no trim"],
  ["WP0CB29978S750123", row(2008, "PORSCHE", "911", "S Cabriolet (2WD), 4S Cabriolet (4WD)", "Convertible/Cabriolet", "Carrera"), "911", null, "convertible", "live: same"],
  ["WP0AA29958S700001", row(2008, "PORSCHE", "911", "Carrera (2WD), Carrera 4 (4WD)", "Coupe", "Carrera"), "911", null, "coupe", "live: 997 Carrera or Carrera 4"],
  ["WP0AB2A94HS700018", row(2017, "PORSCHE", "911", "S, 4S, GTS, 4 GTS", "Coupe", "Turbo/Turbo S"), "911", null, "coupe", "live: 991.2 four variants"],
  ["WP0AC29958S700007", row(2008, "PORSCHE", "911", "Base, RS", "Coupe", "GT3"), "911", null, "coupe", "live: GT3 or GT3 RS"],
  ["WP0AA2A92JS700019", row(2018, "PORSCHE", "911", "Carrera (2WD) / Carrera 4 (4WD)", "Coupe", "Type 991"), "911", null, "coupe", "live: the slash form, dropped before this fix too"],
  ["WAUFGAFC7EN000027", row(2014, "AUDI", "A6", "quattro Premium, quattro Premium Plus", "Sedan/Saloon"), "A6", null, "sedan", "live: Audi list"],
  ["WAUFFAFL1CN000021", row(2012, "AUDI", "A4", "quattro Premium Plus", "Sedan/Saloon"), "A4", "quattro Premium Plus", "sedan", "live control: one trim, kept"],
  ["5UXWX9C58E0000033", row(2014, "BMW", "X3", "xDrive28i", "Sport Utility Vehicle [SUV]/Multipurpose Vehicle [MPV]"), "X3", "xDrive28i", null, "live control"],
  ["WDDGF8BB3CR000042", row(2012, "MERCEDES-BENZ", "C-Class", "C300 4-MATIC", "Sedan/Saloon"), "C-Class", "C300 4-MATIC", "sedan", "live control"],
  ["JF1VA1E65G9000056", row(2016, "SUBARU", "WRX", "Premium + MR", "Sedan/Saloon"), "WRX", "Premium + MR", "sedan", "live control"],
  ["2C3CDYBT5EH100002", row(2014, "DODGE", "Challenger", "R/T", "Coupe"), "Challenger", "R/T", "coupe", "live: slash trim kept"],
  ["2C3CDZFJ5JH100005", row(2018, "DODGE", "Challenger", "R/T 392", "Coupe"), "Challenger", "R/T 392", "coupe", "live: slash trim kept"],
  ["2C3CDXCT5EH100008", row(2014, "DODGE", "Charger", "R/T", "Sedan/Saloon"), "Charger", "R/T", "sedan", "live: slash trim kept"],
  ["2C3CDXGJ5HH100009", row(2017, "DODGE", "Charger", "R/T 392", "Sedan/Saloon"), "Charger", "R/T 392", "sedan", "live: slash trim kept"],
  ["1G1YM2D75F5100022", row(2015, "CHEVROLET", "Corvette", "Stingray 3LT w/Z51", "Coupe"), "Corvette", null, "coupe", "live: w/ is part of the name, not a list of variants; since Nov 11 2026 (lib/vinDecodeTrim.js) the equipment (3LT, w/Z51) is dropped and Stingray is the plain model, so no trim: scripts/vinDecodeTrimCheck.mjs"],
  ["JM1NC2PF5E0100028", row(2014, "MAZDA", "MX-5", "Grand Touring/GT", "Convertible/Cabriolet"), "MX-5", null, "convertible", "live: two names for one trim, no trim"],
  ["5TFTX4CN1FX000065", row(2015, "TOYOTA", "Tacoma", "Delux Grade", "Pickup", "TRN225L/GRN225L"), "Tacoma", "Delux Grade", null, "live control: the Series code list never becomes a trim"],
  ["WBABN53432JJ12345", row(2002, "BMW", "330Ci", "", "Coupe", "3-Series"), "330Ci", null, "coupe", "live control: a marketed name is not a code"],
  ["WDBFA68F42F123456", row(2002, "MERCEDES-BENZ", "SL-Class", "SL500", "Convertible/Cabriolet"), "SL-Class", "SL500", "convertible", "live control"],
  ["1G1YY22G025123456", row(2002, "CHEVROLET", "Corvette", "", "Coupe"), "Corvette", null, "coupe", "live control"],
  // shaped: the same fields as the code family, NOT seen from vPIC (no live VIN found that decodes this way)
  ["WBSBR93432EX00001", row(2003, "BMW", "M3Cic", "", "Convertible/Cabriolet"), "M3", null, "convertible", "shaped"],
  ["WBSBR93432EX00002", row(2002, "BMW", "M3is", "", "Coupe"), "M3", null, "coupe", "shaped"],
  ["WBSNB93422CR00004", row(2008, "BMW", "M6Ci", "", "Convertible/Cabriolet"), "M6", null, "convertible", "shaped"],
  ["WP0AB29922S650008", row(2002, "PORSCHE", "911", "TT", "Coupe"), "911", "TT", "coupe", "shaped control: trim codes are not touched here"]
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
  ok(`${tag}: /sell VIN wizard (flag on) asks the engine about ${model}`, !ov || !/M[2-8](Ci|Cic|Cis|is|ic|Ti|i|d)$/i.test(String(ov.model || "")) && (!/^M[2-8]$/.test(model) || !ov.model || String(ov.model).toUpperCase().replace(/\s/g, "").startsWith(model.toUpperCase().replace(/\s/g, "")) || ov.model === model), ov && ov.model);
  // flag off: the silent decode
  const off = await V.resolveVehicle(`my car is ${vin}`, {}).catch(e => ({ error: String(e.message) }));
  const fv = off && off.vehicle;
  ok(`${tag}: /sell VIN decode (flag off) has no code-style model`, !fv || !/^M[2-8](Ci|Cic|Cis|is|ic|Ti|i|d)$/i.test(String(fv.model || "")), fv && fv.model);
}
// THE TRIM CLASS (vPIC puts a drivetrain note or several variants into one trim string): a single trim loses its note, a list is no trim, and no consumer ever
// sees a parenthesis, a comma or a stray separator. The strings are the forms seen live on Nov 5 2026 (Porsche 911 997 and 991, Audi A6) plus the notes
// other makers use (xDrive, 4MATIC, quattro, AWD).
const TRIMS = [["S (2WD), 4S (4WD)", null], ["Carrera (2WD), Carrera 4 (4WD)", null], ["Cabriolet (2WD), 4 Cabriolet (4WD)", null], ["Base (2WD), 4 (4WD)", null], ["Base, RS", null], ["S, 4S, GTS, 4 GTS", null],
  ["quattro Premium, quattro Premium Plus", null], ["GT2 (2WD), Turbo (4WD)", null], ["S ,", "S"], [", S", "S"], ["S;", "S"], ["Carrera (2WD)", "Carrera"], ["Premium Plus (AWD)", "Premium Plus"], ["xDrive28i (4WD)", "xDrive28i"],
  ["C300 4MATIC (AWD, 4x4)", "C300 4MATIC"], ["Sport (4WD) (Auto)", "Sport"], ["(4WD)", null], ["R (AWD)", "R"], ["Type R", "Type R"],
  ["R/T", "R/T"], ["R/T 392", "R/T 392"], ["RT/10", "RT/10"], ["GTB/4", "GTB/4"], ["Z/28", "Z/28"], ["T/A", "T/A"], ["Stingray 3LT w/Z51", "Stingray 3LT w/Z51"], ["w/o Z51", "w/o Z51"], ["R/T (A/T)", "R/T"], ["GT A/T", "GT"], ["A/T", null],
  ["S/4S", null], ["SS/RS", null], ["GT/CS", null], ["Grand Touring/GT", null], ["Turbo/Turbo S", null], ["TRN225L/GRN225L", null], ["Carrera (2WD) / Carrera 4 (4WD)", null], ["R / T", null], ["R/T/392", null], ["Sport/Touring", null], ["XL/XLT", null], ["SLE/SLT", null], ["Premium + MR", "Premium + MR"], ["STI-S", "STI-S"], ["S / 4S", null]];
for (const [raw, want] of TRIMS) {
  const f = V.vpicFacts(row(2008, "PORSCHE", "911", raw, "Coupe"), "WP0AB29958S750123");
  ok(`trim "${raw}" reads ${want === null ? "no trim" : `"${want}"`}`, (f.trim ?? null) === want, f.trim);
  ok(`trim "${raw}": nothing a consumer would print is garbled`, f.trim == null || !/[(),;]|^\s|\s$|\s{2}/.test(f.trim), f.trim);
}
// the same through the /sell wizard (flag on): the Series ("Carrera") never stands in for a trim that was a list
{ rows.set("WP0AB29958S700002", row(2008, "PORSCHE", "911", "S (2WD), 4S (4WD)", "Coupe", "Carrera"));
  const w = await V.resolveVehicle("my car is WP0AB29958S700002", { vinConfirm: true }).catch(() => null), wv = w && w.vehicle;
  ok("/sell VIN wizard: a 997 S or 4S is not read as a Carrera, S or 4S (no trim)", !wv || !wv.trim, wv && wv.trim);
  rows.set("WP0AB29958S700009", row(2008, "PORSCHE", "911", "", "Coupe", "Carrera"));
  const w2 = await V.resolveVehicle("my car is WP0AB29958S700009", { vinConfirm: true }).catch(() => null), v2 = w2 && w2.vehicle;
  ok("/sell VIN wizard: an empty Trim still falls back to the Series, as before (control)", !v2 || /carrera/i.test(String(v2.trim || "")), v2 && v2.trim); }
// SLASH TRIMS through the wizard: a real single trim with a slash is asked about as that trim; a slash between variants is no trim and the Series ("Type 991") does not stand in
{ for (const [vin, r, re] of [["2C3CDZFJ5JH100005", row(2018, "DODGE", "Challenger", "R/T 392", "Coupe"), /R\/T 392/i], ["1B3BR65E0PV100012", row(1993, "DODGE", "Viper", "RT/10", "Convertible/Cabriolet"), /RT\/10/i]]) {
    rows.set(vin, r); const w = await V.resolveVehicle(`my car is ${vin}`, { vinConfirm: true }).catch(() => null), wv = w && w.vehicle;
    ok(`/sell VIN wizard: ${r.Trim} is kept as the trim`, !!wv && re.test(String(wv.trim || "")), wv && wv.trim); }
  rows.set("WP0AA2A92JS700019", row(2018, "PORSCHE", "911", "Carrera (2WD) / Carrera 4 (4WD)", "Coupe", "Type 991"));
  const w3 = await V.resolveVehicle("my car is WP0AA2A92JS700019", { vinConfirm: true }).catch(() => null), v3 = w3 && w3.vehicle;
  ok("/sell VIN wizard: a slash between two variants is no trim, and the Series (Type 991) does not become the model", !!v3 && !v3.trim && String(v3.model) === "911", v3 && { m: v3.model, t: v3.trim }); }
// the class: every code form is caught, no marketed name or other model is
for (const [m, want] of [["M3Ci", "M3"], ["M3Cic", "M3"], ["M3is", "M3"], ["M3i", "M3"], ["M5i", "M5"], ["M6Ci", "M6"], ["M2", "M2"], ["M3", "M3"], ["330Ci", "330Ci"], ["325i", "325i"], ["Z3", "Z3"], ["X5", "X5"], ["M3 CSL", "M3 CSL"]])
  ok(`BMW model "${m}" reads "${want}"`, V.vpicFacts(row(2002, "BMW", m, "", "Coupe"), "WBSBL93402JR12345").model === want, V.vpicFacts(row(2002, "BMW", m, "", "Coupe"), "WBSBL93402JR12345").model);
ok("a non BMW model with the same letters is untouched (Ford M3i is not a BMW code)", V.vpicFacts(row(2002, "FORD", "M3Ci", "", "Coupe"), "1FA6P8CF5J5123456").model === "M3Ci");
console.log(`vinNamesCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
