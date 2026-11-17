// clock: real-ok no calendar date is asserted; the years in the typed words are fixed per make
// A MILEAGE IS NEVER A MODEL (Lane B, lane-b-mileage-model, Nov 16 2026; order bc85). "2003 Mercedes-Benz SL500 38,400" came out as a Mercedes "400" (the tail of the grouped number) and "1999 Porsche Boxster 45,911 miles" as a Porsche 911,
// because normalize() turns the comma into a space and the model readers scan the typed text before the mileage is taken out. One rule in the shared resolver (lib/numberPhrases.js, read at the entry of lib/vehicle.js resolveVehicle):
// a mileage phrase, a price phrase and a grouped number are set aside first; the mileage goes back on the car as mileage; a bare number with no unit is a typed model and stays one.
// BUILT FROM THE TAXONOMY: every make whose models include a bare number (the curated lists in lib/vehicleData.js, the calculator's model lists in data/calculatorModelYears.json, and the numeric models the live taxonomy holds that the curated lists omit:
// Mercedes-Benz 190 to 600, BMW 1600/2002, Volvo 240 to 960, Datsun 510/1600/2000, Fiat 124/500/600/850, Peugeot 205 to 604, Audi 80 to 200, Saab 99/900/9000 ...). For each numeric model N and each stated model M of that make, the typed car is
// "<year> <make> <M> <mileage ending in N's digits>": it must resolve to the SAME model and trim as "<year> <make> <M>" typed alone, with the full mileage. The same words typed with no stated model must resolve as they do on the old path.
// The old path (options.noNumberPhrases) is run beside every case and the number of typed forms it resolves wrongly is printed. Run against a tree without the fix, the check fails.
//   node scripts/resolverMileageCheck.mjs [repo root]     --mutants breaks one rule at a time (each must fail)
import fs from "node:fs"; import path from "node:path"; import { spawnSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const args = process.argv.slice(2), here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(args.find(a => !a.startsWith("--")) || path.join(here, ".."));
if (args.includes("--mutants")) process.exit(mutants());
process.chdir(root);
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const imp = f => import(pathToFileURL(path.join(root, f)).href);
const VD = await imp("lib/vehicleData.js");
const cal = JSON.parse(fs.readFileSync(path.join(root, "data/calculatorModelYears.json"), "utf8")).makes || {};
// ---- the universe: make -> { numeric models, stated models, year } ----
const MAKE_NAME = { delahaye: "Delahaye", datsun: "Datsun", daimler: "Daimler", dodge: "Dodge" };
const U = new Map(); const slot = mk => { const k0 = MAKE_NAME[String(mk).toLowerCase()] || String(mk), k = [...U.keys()].find(x => x.toLowerCase().replace(/[^a-z0-9]/g, "") === k0.toLowerCase().replace(/[^a-z0-9]/g, "")) || k0; if (!U.has(k)) U.set(k, new Set()); return U.get(k); };
for (const o of VD.MODEL_OWNERSHIP) for (const mk of o.makes) slot(mk).add(o.model);
for (const r of VD.PRODUCTION_RULES) slot(r.make).add(r.model);
for (const [k, v] of Object.entries(VD.CURATED_MODELS)) for (const m of v) slot(k).add(m);
for (const a of VD.MODEL_ALIASES) slot(a.make).add(a.model);
for (const [mk, rows] of Object.entries(cal)) { if (/pre-war/i.test(mk)) continue; for (const row of rows) slot(mk).add(Array.isArray(row) ? row[0] : (row && row.name) || row); }
// numeric models the live taxonomy (OCD /models, taxonomy_models) holds and the curated lists omit; stated models the same makes carry
const LIVE = {
  "Mercedes-Benz": { nums: ["190", "220", "230", "250", "280", "300", "380", "400", "420", "450", "500", "560", "600"], stated: ["SL-Class", "C-Class", "E-Class", "S-Class", "G-Class", "SLK-Class"], year: 2003 },
  BMW: { nums: ["1600", "2002"], stated: ["M3", "M5", "Z3", "Z4", "3 Series", "5 Series"], year: 2001 },
  Porsche: { nums: ["356", "911", "912", "914", "924", "928", "944", "968", "718"], stated: ["Boxster", "Cayman", "Carrera GT"], year: 1999 },
  Ferrari: { nums: ["308", "328", "348", "355", "360", "430", "456", "458", "488", "512", "550", "575", "599", "612", "812"], stated: ["Testarossa", "Enzo", "California", "Mondial"], year: 1999 },
  Volvo: { nums: ["240", "740", "850", "940", "960"], stated: ["P1800", "V70", "XC90", "S60"], year: 1990 },
  Datsun: { nums: ["510", "1600", "2000"], stated: ["240Z", "260Z", "280Z"], year: 1972 },
  Nissan: { nums: ["300", "350"], stated: ["Skyline", "Silvia", "Pulsar"], year: 1992 },
  Fiat: { nums: ["124", "500", "600", "850"], stated: ["X1/9", "Dino", "Abarth"], year: 1975 },
  Peugeot: { nums: ["205", "404", "504", "505", "604"], stated: ["RCZ", "J7", "Boxer"], year: 1985 },
  Audi: { nums: ["80", "90", "100", "200"], stated: ["Quattro", "TT", "R8", "Fox"], year: 1992 },
  Saab: { nums: ["99", "900", "9000"], stated: ["Sonett", "Turbo"], year: 1988 },
  Lotus: { nums: ["340"], stated: ["Elise", "Esprit", "Europa", "Elan"], year: 1999 },
  Mazda: { nums: ["323", "626"], stated: ["Miata", "RX-7"], year: 1991 }
};
for (const [mk, o] of Object.entries(LIVE)) { const s = slot(mk); for (const n of [...o.nums, ...o.stated]) s.add(n); }
const norm = x => String(x || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const isNum = m => /^\d{2,4}$/.test(String(m));
const YEAR = { Ferrari: 1999, Porsche: 1999, "Alfa Romeo": 1995, "Austin-Healey": 1962, Cord: 1936, Delahaye: 1938, Oldsmobile: 1970, Subaru: 1975, Toyota: 1991, Lancia: 1982, SAAB: 1988 };
for (const [mk, o] of Object.entries(LIVE)) YEAR[mk] = o.year;
const MAKES = [...U.entries()].filter(([, s]) => [...s].some(isNum)).map(([mk, s]) => {
  const nums = [...s].filter(isNum), others = [...s].filter(m => !isNum(m) && !/^(model|type|series)$/i.test(m));
  const lv = LIVE[mk] ? LIVE[mk].stated : [], stated = [...new Set([...lv, ...others])].filter(m => m.length <= 24 && !/\d{2,4}/.test(m) || lv.includes(m)).slice(0, 5);
  return { make: mk, nums, stated, year: YEAR[mk] || 1995, universe: [...s] };
}).filter(x => x.stated.length);
// the typed mileage whose last digits are the model's digits: grouped for 2 and 3 digits, five digits (unit typed) for 4 digits
const mileOf = (n, i) => { const lead = [38, 45, 62, 21, 74][i % 5]; const d = String(n); return d.length === 4 ? { text: `${lead}${d}`, value: Number(`${lead}${d}`), grouped: false } : { text: `${lead},${d.padStart(3, "0")}`, value: Number(`${lead}${d.padStart(3, "0")}`), grouped: true }; };
globalThis.fetch = async (url) => { url = String(url);
  const m = /\/models\?make=([^&]+)/.exec(url); if (m) { const mk = decodeURIComponent(m[1]); const e = MAKES.find(x => norm(x.make) === norm(mk)); return new Response(JSON.stringify({ data: e ? e.universe : [] }), { status: 200 }); }
  if (/\/makes/.test(url)) return new Response(JSON.stringify({ data: MAKES.map(x => x.make) }), { status: 200 });
  return new Response("[]", { status: 200 }); };
const { resolveVehicle } = await imp("lib/vehicle.js");
let pass = 0, fail = 0; const fails = []; const ok = (n, c, d) => { if (c) pass++; else { fail++; fails.push(n + (d !== undefined ? " " + JSON.stringify(d) : "")); } };
const read = async (t, opts = {}) => { try { const r = await resolveVehicle(t, opts); return { r, v: (r && r.vehicle) || {} }; } catch (e) { return { r: null, v: {}, err: String(e.message) }; } };
const key = v => `${norm(v.model)}|${norm(v.trim)}`;
let oldNoModelWrong = 0, cases = 0, oldWrong = 0, skipped = 0, noModelCases = 0, typedCases = 0;
for (const mk of MAKES) {
  let i = 0;
  for (const N of mk.nums) for (const M of mk.stated) {
    const ref = await read(`${mk.year} ${mk.make} ${M}`);
    if (!ref.v.model || ref.v.model === N || ref.r.status === "needs_clarification") { skipped++; continue; }   // the stated model alone has to read as a car for the case to compare
    const mi = mileOf(N, i++);
    const forms = [`${mk.year} ${mk.make} ${M} ${mi.text} miles`, mi.grouped ? `${mk.year} ${mk.make} ${M} ${mi.text}` : `${mk.year} ${mk.make} ${M} ${mi.text} mi`];
    for (const t of forms) {
      cases++;
      const now = await read(t), old = await read(t, { noNumberPhrases: true });
      const bad = x => key(x.v) !== key(ref.v) || Number(x.v.mileage) !== mi.value;
      if (bad(old)) oldWrong++;
      ok(`${t}: the stated model "${M}" stays (model|trim ${key(ref.v)}) and the mileage is ${mi.value}`, !bad(now), { model: now.v.model, trim: now.v.trim, mileage: now.v.mileage, status: now.r && now.r.status });
      ok(`${t}: the model is never the number "${N}"`, norm(now.v.model) !== norm(N) || norm(M) === norm(N), { model: now.v.model });
    }
  }
}
// the same strings WITHOUT a stated model: a typed model beats a bare number; with no model the read is the old path's
for (const mk of MAKES) {
  let i = 0;
  for (const N of mk.nums) {
    const mi = mileOf(N, i++), t0 = `${mk.year} ${mk.make} ${N}`;
    const typed = await read(t0), typedOld = await read(t0, { noNumberPhrases: true }); typedCases++;
    ok(`${t0}: a typed model is read exactly as on the old path`, key(typed.v) === key(typedOld.v) && String(typed.r && typed.r.status) === String(typedOld.r && typedOld.r.status), { now: key(typed.v), old: key(typedOld.v) });
    const t1 = `${mk.year} ${mk.make} ${N} ${mi.text} miles`, a = await read(t1), b = await read(t1, { noNumberPhrases: true });
    ok(`${t1}: the typed model ${N} beats the number, the mileage is ${mi.value}`, a.v.model && norm(a.v.model) === norm(typed.v.model) && Number(a.v.mileage) === mi.value, { model: a.v.model, mileage: a.v.mileage });
    const t2 = `${mk.year} ${mk.make} ${mi.text} miles`, c = await read(t2), d = await read(t2, { noNumberPhrases: true }); noModelCases++;
    ok(`${t2}: with no model typed the number is never the model (the old path read "${key(d.v)}")`, norm(c.v.model) !== norm(N), { now: key(c.v), old: key(d.v), status: c.r && c.r.status });
    if (norm(d.v.model) === norm(N)) oldNoModelWrong++;
  }
}
// the order's own words, and the phrase forms: mileage, price and year set aside, the mileage still reaches the answer as mileage
const FORMS = [
  ["2003 Mercedes-Benz SL500 38,400 miles", 38400], ["2003 Mercedes-Benz SL500 38400 mi", 38400], ["2003 Mercedes-Benz SL500 38.4k", 38400], ["2003 Mercedes-Benz SL500 38k miles", 38000], ["2003 Mercedes-Benz SL500 38,400", 38400],
  ["2003 Mercedes-Benz SL500 62,000 km", null], ["2003 Mercedes-Benz SL500 $18,000", null], ["2003 Mercedes-Benz SL500 under 60k", null], ["2003 Mercedes-Benz SL500 38,400 miles $18,000", 38400],
  ["2003 Mercedes-Benz SL500 $18,400", null], ["2003 Mercedes-Benz SL500 around 18,400", null], ["1999 Porsche Boxster budget $45,911", null], ["1999 Porsche Boxster under 45,911", null], ["1999 Porsche Boxster 45,911 miles", 45911], ["1999 Porsche Boxster 45,911", 45911], ["2001 BMW M3 62,328 miles", 62328], ["38,400 miles 2003 Mercedes-Benz SL500", 38400], ["2003 Mercedes-Benz SL500, 38,400 miles, asking $18,000", 38400]
];
for (const [t, mileage] of FORMS) {
  const x = await read(t), want = /Mercedes/.test(t) ? "slclass|sl500" : /Boxster/.test(t) ? "boxster|" : "m3|";
  ok(`phrase form "${t}": the stated model stays`, key(x.v) === want, { model: x.v.model, trim: x.v.trim });
  ok(`phrase form "${t}": the mileage reaches the answer as ${mileage} (a price or kilometres typed is never read as miles)`, mileage == null ? x.v.mileage == null : Number(x.v.mileage) === mileage, { mileage: x.v.mileage });
}
// A PRICE PHRASE BESIDE A MODEL (lane-b-notice, Nov 17 2026): one mutant survived the forms above, "a price phrase is left in the words", because every price there ends in a comma group the grouped-number rule also takes out.
// These carry a price that ONLY the price rule can set aside: "$400" and "$911" (a dollar price with no comma is, left in the words, the model 400 or the Porsche 911), "under 60k" and "up to $45k" beside a typed model
// (left in the words, 60k is read as a MILEAGE of 60,000), and "budget $18,000" (the cue word goes with the price). The model stays, no mileage is invented, and the price is the price.
{
  const PRICE = [["2003 Mercedes-Benz SL500 $400", "slclass|sl500"], ["2003 Mercedes-Benz SL500 $18,000", "slclass|sl500"], ["2003 Mercedes-Benz SL500 budget $18,000", "slclass|sl500"], ["2003 Mercedes-Benz SL500 up to $45k", "slclass|sl500"],
    ["2003 Mercedes-Benz SL500 under 60k", "slclass|sl500"], ["2003 Mercedes-Benz SL500 around 18,000", "slclass|sl500"], ["2003 Mercedes-Benz 500 under 60k", "500|"], ["2003 Mercedes-Benz 500 $18,000", "500|"],
    ["1999 Porsche Boxster $911", "boxster|"], ["1999 Porsche Boxster under 45k", "boxster|"], ["1999 Porsche Boxster budget $45k", "boxster|"], ["2001 BMW M3 $2002", "m3|"], ["2001 BMW M3 under 60k", "m3|"]];
  const np2 = await imp("lib/numberPhrases.js").catch(() => null);
  for (const [t, want] of PRICE) {
    const x = await read(t);
    ok(`price phrase "${t}": the stated model stays`, key(x.v) === want, { model: x.v.model, trim: x.v.trim });
    ok(`price phrase "${t}": no mileage is read from a price`, x.v.mileage == null, { mileage: x.v.mileage });
    ok(`price phrase "${t}": no price word is left on the car's words`, !/[$]|\bunder\b|\bbudget\b|\bup to\b|\baround\b/i.test(String((x.r && x.r.vehicle && x.r.vehicle.trim) || "") + " " + String(x.v.model || "")), { model: x.v.model, trim: x.v.trim });
    if (np2) { const a = np2.setAsideNumbers(t); ok(`price phrase "${t}": the price leaves the words and is returned as the price`, a.changed && !!a.price && a.mileage == null && !/[$]|under|budget|up to|around|\d{2,}k|\b(?:400|911|2002|18,000|45k|60k)\b/i.test(a.text.replace(/\b(?:1999|2001|2003)\b/, "")), a); }
  }
  const nm = await read("2003 Mercedes-Benz $400"); ok("price phrase \"2003 Mercedes-Benz $400\": the price is never the model 400", norm(nm.v.model) !== "400", { model: nm.v.model });
}
{ const a = await read("2003 Mercedes-Benz SL500 38,400 miles"); ok("the typed words are kept as typed on the car (raw)", /38,400 miles/.test(String(a.v.raw || "")), { raw: a.v.raw }); }
{ const np = await imp("lib/numberPhrases.js").catch(() => null); ok("lib/numberPhrases.js is there", !!np);
  if (np) for (const t of ["1936 Mercedes-Benz 540K", "1990 Fiat 500", "2003 Mercedes-Benz 400", "1972 BMW 2002", "1975 Fiat 124 Spider", "1992 Audi 100", "1988 Saab 9000", "1999 Ferrari 456", "1970 Oldsmobile 442", "2005 Mercedes-Benz 300 SL", "1989 Porsche 911 Carrera"])
    ok(`a bare number with no unit, no comma and no k is never touched: "${t}"`, np.setAsideNumbers(t).changed === false && np.setAsideNumbers(t).text === t, np.setAsideNumbers(t)); }
// EVERY SURFACE THAT READS TYPED CAR WORDS (the sweep): Market Check (lib/tools/_shared.js resolveSpec), Find / Buy / the Tasks composer (lib/live/search.js parseQueryResolved), the Sell car step (api/vehicleIdentity.js),
// Sell's own read of the seller's words (lib/sell/sellFacts.js resolveSellCar: it turned the comma into a space BEFORE the resolver, so "38,400" arrived as "38 400"), the Desk new case (lib/desk/intake/run.js resolveCarWords, when its image
// package is installed) and the car token (the read, encoded and decoded). Each reads the same typed forms and must keep the stated model.
{
  const SURF = [["2003 Mercedes-Benz SL500 38,400 miles", "slclass|sl500", 38400], ["2003 Mercedes-Benz SL500 38,400", "slclass|sl500", 38400], ["1999 Porsche Boxster 45,911 miles", "boxster|", 45911], ["1999 Porsche Boxster 45,911", "boxster|", 45911], ["2001 BMW M3 62,328 miles", "m3|", 62328], ["2001 BMW M3 62,328", "m3|", 62328]];
  const T = await imp("lib/tools/_shared.js"), S = await imp("lib/live/search.js"), SF = await imp("lib/sell/sellFacts.js"), CT = await imp("lib/carToken.js");
  const VI = (await imp("api/vehicleIdentity.js")).default, DK = await imp("lib/desk/intake/run.js").catch(() => null);
  const keyOf = v => `${norm(v && v.model)}|${norm(v && v.trim)}`;
  for (const [t, want, mi] of SURF) {
    const a = await T.resolveSpec(t); ok(`Market Check: "${t}" keeps the stated model`, keyOf(a.vehicle) === want, { got: keyOf(a.vehicle), asks: a.question });
    const b = await S.parseQueryResolved(t, {}); ok(`Find / Buy / Tasks composer: "${t}" keeps the stated model`, keyOf(b.vehicle) === want, { got: keyOf(b.vehicle) });
    let out = null; const res = { status() { return this; }, json(x) { out = x; return this; }, setHeader() {}, end() {}, getHeader() {}, removeHeader() {} };
    try { await VI({ method: "POST", headers: {}, query: {}, body: { vehicle: t, text: t, raw: t } }, res); } catch (e) { out = { err: String(e.message) }; }
    ok(`Sell car step (vehicleIdentity): "${t}" keeps the stated model`, keyOf(out && out.vehicle) === want, { got: keyOf(out && out.vehicle) });
    const c = await SF.resolveSellCar(t, {}); ok(`Sell (resolveSellCar): "${t}" keeps the stated model and the mileage ${mi}`, keyOf(c && c.car && c.car.v) === want && Number(c.car.v.mileage) === mi, { got: keyOf(c && c.car && c.car.v), mileage: c && c.car && c.car.v && c.car.v.mileage });
    if (DK) { const d = await DK.resolveCarWords([t], { resolveVehicle }); ok(`Desk new case: "${t}" keeps the stated model`, !d || `${norm(d.model)}|${norm(d.trim)}` === want, { got: d && d.model }); }
    if (a.vehicle) { const back = CT.decodeCar(CT.encodeCar(a.vehicle)); ok(`car token: the read of "${t}" survives the token with its model`, keyOf(back) === want, { got: keyOf(back) }); }
  }
  console.log(`resolverMileageCheck: ${SURF.length} typed forms through Market Check, Find/Buy/Tasks, the Sell car step, Sell's own read, the car token${DK ? ", the Desk new case" : " (the Desk new case could not be loaded here: its image package is not installed)"}`);
}
console.log(`resolverMileageCheck: ${MAKES.length} makes with numeric models (${MAKES.map(x => x.make).join(", ")})`);
console.log(`resolverMileageCheck: ${cases} stated-model forms, ${typedCases} typed-model reads, ${noModelCases} no-model reads, ${skipped} model pairs skipped (the stated model alone gave no car); the OLD path read ${oldWrong} of the ${cases} stated-model forms wrongly; of the ${noModelCases} no-model reads (a mileage and no model) the old path took the number as the model in ${oldNoModelWrong}, the new path asks for the model`);
for (const f of fails.slice(0, +(process.env.SHOW || 40))) console.log("FAIL " + f);
if (fails.length > 40) console.log(`... and ${fails.length - 40} more`);
console.log(`resolverMileageCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

function mutants() {
  const me = fileURLToPath(import.meta.url), R = path.resolve(args.find(a => !a.startsWith("--")) || path.join(path.dirname(me), ".."));
  const M = [
    ["the number phrases are never set aside", "lib/numberPhrases.js", s => s.replace("return { text, mileage, km, price, changed: true };", "return { text: original, mileage: null, km: null, price: null, changed: false };")],
    ["the mileage is set aside but not put back on the car", "lib/vehicle.js", s => s.replace("if ((v.mileage == null || !Number.isFinite(Number(v.mileage))) && aside.mileage != null) v.mileage = aside.mileage;", "")],
    ["a grouped number with no unit is left in the words", "lib/numberPhrases.js", s => s.replace("text = text.replace(GROUPED_RE,", "text = text.replace(/(?!)/g,")],
    ["a mileage with its unit is left in the words", "lib/numberPhrases.js", s => s.replace("text = text.replace(MILEAGE_UNIT_RE,", "text = text.replace(/(?!)/g,")],
    ["the k mileage (38.4k) is left in the words", "lib/numberPhrases.js", s => s.replace("text = text.replace(BARE_K_RE,", "text = text.replace(/(?!)/g,")],
    ["a price phrase is left in the words", "lib/numberPhrases.js", s => s.replace("text = text.replace(PRICE_DOLLAR,", "text = text.replace(/(?!)/g,").replace("text = text.replace(PRICE_CUE,", "text = text.replace(/(?!)/g,")],
    ["a bare three digit number is set aside too (a typed model loses to a number)", "lib/numberPhrases.js", s => s.replace("text = text.replace(GROUPED_RE,", "text = text.replace(/(?<![A-Za-z0-9.,$])\\d{3}(?![A-Za-z0-9,])/g, \" \").replace(GROUPED_RE,")],
    ["Sell turns the comma into a space before the number is set aside", "lib/sell/sellFacts.js", s => s.replace("const aside = setAsideNumbers(carText); if (aside.changed) carText = aside.text;", "const aside = { changed: false, mileage: null };")],
    ["the typed words (raw) are replaced by the stripped words", "lib/vehicle.js", s => s.replace("if (typeof v.raw === \"string\" && v.raw === aside.text) v.raw = asText(rawInput);", "")],
    ["the entry of the resolver never sets numbers aside", "lib/vehicle.js", s => s.replace("if (!aside || !aside.changed) return resolveVehicleWords(rawInput, options);", "return resolveVehicleWords(rawInput, options);")]
  ];
  let survived = 0;
  for (const [name, file, fn] of M) {
    const tmp = fs.mkdtempSync(path.join(fs.realpathSync("/tmp"), "rm-"));
    try {
      for (const d of ["lib", "api", "data", "package.json"]) spawnSync("cp", ["-R", path.join(R, d), tmp]);
      fs.symlinkSync(path.join(R, "node_modules"), path.join(tmp, "node_modules"));
      const f = path.join(tmp, file), before = fs.readFileSync(f, "utf8"), after = fn(before); if (before === after) { console.log("SKIP (no change) " + name); survived++; continue; }
      fs.writeFileSync(f, after);
      const r = spawnSync(process.execPath, [me, tmp], { encoding: "utf8" }), killed = r.status !== 0; console.log((killed ? "killed   " : "SURVIVED ") + name); if (!killed) survived++;
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }
  console.log(survived ? `${survived} mutant(s) survived` : "all mutants killed"); return survived ? 1 : 0;
}
