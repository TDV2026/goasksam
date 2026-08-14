// Make-typo + VIN resolution regression (Set-2 B8/B9). Runs against prod
// /api/vehicleIdentity. Product rule 6: a misspelled MAKE now CONFIRMS ("Did you
// mean the X?") instead of silently auto-correcting; ABBREVIATIONS still resolve
// silently. A pasted VIN decodes (vPIC) to a real vehicle.
const BASE = process.env.FLOW_BASE || "https://goasksam.com";
async function resolve(text) {
  try { const r = await fetch(`${BASE}/api/vehicleIdentity`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: "gas_crew=ok" }, body: JSON.stringify({ text }) }); return await r.json(); }
  catch (e) { return { status: `(fetch ${e.message})` }; }
}
let failures = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  ->  " + String(detail).slice(0, 120)}`); if (!ok) failures++; };

// B8a: misspelled MAKE -> needs_confirmation naming the make (rule 6, never silent).
const TYPOS = [
  ["2006 porsch", "Porsche"], ["2006 porshce", "Porsche"], ["Poesche", "Porsche"], ["Poesche 911", "Porsche"],
  ["2015 chevorlet", "Chevrolet"], ["2012 mercedez", "Mercedes-Benz"], ["2018 ferarri", "Ferrari"],
  ["2016 lamborgini", "Lamborghini"], ["2010 toyata", "Toyota"], ["2010 nisan", "Nissan"], ["2010 volkswagon", "Volkswagen"]
];
for (const [text, make] of TYPOS) {
  const j = await resolve(text);
  const sugg = (j.clarification?.suggestion || "") + " " + (j.clarification?.question || "");
  check(`typo "${text}" -> CONFIRM "${make}"`, j.status === "needs_confirmation" && new RegExp(make.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"), "i").test(sugg), `status=${j.status} sugg="${sugg.trim()}"`);
}
// B8b: ABBREVIATIONS still resolve silently (rule 6 allows), NOT a confirmation.
const ABBR = [["2015 chevy", "Chevrolet"], ["2012 merc", "Mercedes-Benz"], ["2016 lambo", "Lamborghini"], ["2010 landrover", "Land Rover"]];
for (const [text, make] of ABBR) {
  const j = await resolve(text);
  check(`abbr "${text}" -> silent "${make}" (no confirm)`, j.status !== "needs_confirmation" && (j.vehicle?.make === make), `status=${j.status} make=${j.vehicle?.make}`);
}
// B9: VIN -> decodes to a real vehicle.
const VINS = [["WP0AB2A99KS123456", "Porsche", "911"], ["1G1YY22G965105633", "Chevrolet", "Corvette"]];
for (const [vin, make, model] of VINS) {
  const j = await resolve(vin);
  const v = j.vehicle || {};
  check(`VIN ${vin} -> ${make} ${model}`, v.make === make && new RegExp(model, "i").test(String(v.model || "")), `status=${j.status} make=${v.make} model=${v.model}`);
}
console.log(failures ? `\n${failures} FAILURE(S)` : "\nMAKE-TYPO + VIN ALL PASS");
process.exit(failures ? 1 : 0);
