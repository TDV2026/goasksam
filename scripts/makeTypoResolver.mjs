// Fix 2 (2d): make-typo resolution regression. Confirms common misspellings across
// major makes resolve silently to the canonical make. Runs against prod /api/vehicleIdentity.
const BASE = process.env.FLOW_BASE || "https://goasksam.vercel.app";
const CASES = [
  ["2006 porsch","Porsche"],["2006 porshc","Porsche"],["2006 porcha","Porsche"],["2006 porshce","Porsche"],
  ["2015 chevorlet","Chevrolet"],["2015 chevrolette","Chevrolet"],["2015 chevy","Chevrolet"],
  ["2012 mercedez","Mercedes-Benz"],["2012 mercedes","Mercedes-Benz"],["2012 merc","Mercedes-Benz"],
  ["2018 ferarri","Ferrari"],["2018 ferari","Ferrari"],
  ["2016 lamborgini","Lamborghini"],["2016 lambo","Lamborghini"],
  ["2010 landrover","Land Rover"],["2010 toyata","Toyota"],["2010 nisan","Nissan"],["2010 volkswagon","Volkswagen"]
];
let failures = 0;
for (const [text, expect] of CASES) {
  let make = "(err)";
  try { const r = await fetch(`${BASE}/api/vehicleIdentity`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({text}) }); make = (await r.json()).vehicle?.make || "(none)"; }
  catch (e) { make = `(fetch ${e.message})`; }
  const ok = make === expect;
  console.log(`${ok?"PASS":"FAIL"}  "${text}" -> ${make}${ok?"":` (expected ${expect})`}`);
  if (!ok) failures++;
}
console.log(failures ? `\n${failures} FAILURE(S)` : "\nMAKE-TYPO ALL PASS");
process.exit(failures ? 1 : 0);
