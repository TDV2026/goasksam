// clock: real-ok stored-row fixtures are stamped with the current time and read on the same day; no assertion depends on the date
// NON-CAR NAMES NEVER REACH A CAR'S NAME (Lane B, Nov 4 2026, job lane-b-names; Rick Carey's launch-day list). Offline: the resolver reads each title; no database, no network.
// CAUSE, per pattern (parser step in lib/nameGuard.js): coachbuilder phrase "by X" -> read as the model ("Chrysler By", "Delahaye By"); engine or gearbox word -> model or trim ("Dodge Hemi R T", "Chevrolet LT1", "Ferrari F1", Mustang "GT V8");
// two-word model -> its front half ("Jaguar Mark", "Packard Super"); reference number -> trim ("Ferrari 275 GTB RN26"); a badge several cars wear -> the model ("Alfa Romeo GTA" without Giulia).
// WHO ELSE: every car named from a title or typed text: VIN pages (carIdentity), spec and hub names, Market Check, Find, Buy, Tasks, Sell. One resolver, so one check drives all of them, over every coachbuilder in Rick's list, every phrased model, every engine word.
// Rule 20 and the controls: real trims that carry an engine word (Porsche 911 Turbo, Corvette L88, Barracuda Hemi, SN95 Mustang) keep it.
//   node scripts/nameGuardCheck.mjs [repo root]   (pointing it at a tree without the fix shows it fail)
import path from "node:path"; import fs from "node:fs"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root); process.env.SUPABASE_URL = ""; process.env.SUPABASE_SERVICE_ROLE_KEY = "";
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${!c && d ? "  " + d : ""}`); };
const imp = f => import(pathToFileURL(path.join(root, f)).href);
const { resolveVehicle } = await imp("lib/vehicle.js");
const quiet = console.error, log = console.log; console.error = () => {};
const read = async t => { const r = await resolveVehicle(t, {}).catch(() => null); const v = r && r.vehicle; return v ? { make: v.make, model: v.model || null, trim: v.trim || null, coachbuilder: v.coachbuilder || null } : null; };
const eq = (n, got, want) => ok(n, got && Object.entries(want).every(([k, w]) => (got[k] ?? null) === w), JSON.stringify(got));
// 1. Rick's names, one title each (the title the name came from)
eq("Chrysler By -> Chrysler Imperial, coachbuilder Ghia", await read("1958 Chrysler Imperial Crown Southampton by Ghia"), { model: "Imperial", coachbuilder: "Ghia" });
eq("Delahaye By -> model 135, never 'By'; coachbuilder Chapron", await read("1936 Delahaye 135 by Chapron"), { model: "135", coachbuilder: "Chapron" });
eq("Delahaye 135M by Figoni et Falaschi keeps 135M", await read("1938 Delahaye 135M Roadster by Figoni et Falaschi"), { model: "135M", coachbuilder: "Figoni et Falaschi" });
eq("Dodge Hemi R T -> no model 'Hemi'; trim R/T", await read("1969 Dodge Hemi R/T"), { model: null, trim: "R/T" });
eq("Dodge Hemi Challenger R/T -> Challenger R/T", await read("1970 Dodge Hemi Challenger R/T"), { model: "Challenger", trim: "R/T" });
eq("Ferrari F1 -> no model F1", await read("1995 Ferrari F1"), { model: null });
eq("Ferrari 360 Modena F1 -> the gearbox is not the trim", await read("2001 Ferrari 360 Modena F1"), { model: "360", trim: null });
eq("Ferrari F430 F1 Spider -> trim Spider", await read("2005 Ferrari F430 F1 Spider"), { model: "F430", trim: "Spider" });
eq("Chevrolet LT1 -> no model LT1", await read("1993 Chevrolet LT1"), { model: null });
eq("Jaguar Mark VII", await read("1951 Jaguar Mark VII Saloon"), { model: "Mark VII" });
eq("Jaguar Mark X", await read("1964 Jaguar Mark X 4.2"), { model: "Mark X" });
eq("Jaguar Mk 2", await read("1962 Jaguar Mk 2"), { model: "Mark 2" });
eq("Packard Super Eight", await read("1936 Packard Super Eight Convertible Victoria"), { model: "Super Eight", trim: null });
eq("Packard Super 8", await read("1938 Packard Super 8 Sedan"), { model: "Super Eight" });
eq("Ferrari 275 GTB RN26 -> reference number dropped", await read("1965 Ferrari 275 GTB RN26"), { model: "275", trim: "GTB" });
eq("lot number dropped", await read("Lot 123: 1966 Ferrari 275 GTB/6C"), { model: "275", trim: "GTB/6C" });
eq("reference number dropped", await read("1966 Ferrari 275 GTB Ref. No. 07823"), { model: "275", trim: "GTB" });
eq("Alfa Romeo GTA 1966 -> Giulia GTA", await read("1966 Alfa Romeo GTA"), { model: "Giulia", trim: "GTA" });
eq("Alfa Romeo GTA with no year to name one car -> no model", await read("Alfa Romeo GTA"), { model: null });
eq("Alfa Romeo GTAm 1970 -> Giulia GTAm", await read("1970 Alfa Romeo GTAm"), { model: "Giulia", trim: "GTAm" });
eq("Mustang GT 5-Speed V8 -> trim GT", await read("2005 Ford Mustang GT 5-Speed V8"), { model: "Mustang", trim: "GT" });
eq("Plymouth Hemi Cuda -> Barracuda Cuda", await read("1972 Plymouth Hemi Cuda"), { model: "Barracuda", trim: "Cuda" });
// 2. the class: every coachbuilder in Rick's list, in the "by" phrase, never becomes a model or a trim; the car stays
{ const cbs = [...new Set(fs.readFileSync("docs/rick-nomenclature.csv", "utf8").split("\n").slice(1).map(l => l.split(",")[0].trim()).filter(Boolean))]; let bad = [];
  for (const cb of cbs) { const g = await read(`1938 Delahaye 135M Roadster by ${cb}`); if (!g || g.model !== "135M" || /^by$/i.test(g.model || "") || /\bby\b/i.test(g.trim || "") || (g.trim && g.trim.toLowerCase().includes(cb.toLowerCase().split(" ")[0]))) bad.push(cb); }
  ok(`all ${cbs.length} coachbuilders in "by <name>": the model stays 135M, no 'By' or firm name in model or trim`, !bad.length, bad.join(", "));
  const g2 = await read("1957 Chrysler Imperial by Ghia"); ok("a firm in the list is kept as the coachbuilder field", g2 && g2.coachbuilder === "Ghia", JSON.stringify(g2)); }
// 3. the class: engine and gearbox words never stay as the model or in a trim beside another trim word
for (const w of ["V8", "V6", "V12", "5-Speed", "Manual", "Automatic", "Diesel", "F1"]) { const g = await read(`2004 Ford Mustang GT ${w}`); ok(`"GT ${w}": the trim is GT`, g && g.model === "Mustang" && g.trim === "GT", JSON.stringify(g)); }
for (const w of ["Hemi", "LT1", "L88", "LS6", "V8", "Turbo"]) { const g = await read(`1970 Plymouth ${w}`); ok(`"Plymouth ${w}": ${w} is never the model`, !g || !g.model || !new RegExp(`^${w}$`, "i").test(g.model), JSON.stringify(g)); }
// 4. controls: real trims that carry an engine word keep it
eq("control: Porsche 911 Turbo keeps Turbo", await read("1987 Porsche 911 Turbo"), { model: "911", trim: "Turbo" });
eq("control: Corvette L88 keeps L88", await read("1967 Chevrolet Corvette L88"), { model: "Corvette", trim: "L88" });
eq("control: Barracuda Hemi keeps Hemi", await read("1970 Plymouth Barracuda Hemi"), { model: "Barracuda", trim: "Hemi" });
eq("control: Mustang SN95 is not a reference number", await read("1998 Ford Mustang SN95 GT"), { model: "Mustang" });
eq("control: Giulia GTA stays Giulia GTA", await read("1965 Alfa Romeo Giulia Sprint GTA"), { model: "Giulia" });
eq("control: Shelby Cobra 427 untouched", await read("1965 Shelby Cobra 427"), { model: "Cobra", trim: "427" });
eq("control: Ferrari 250 GTO", await read("1962 Ferrari 250 GTO"), { model: "250 GT", trim: "GTO" });
// 5. the stored rows: a row under a non-car name is read as no row by both Market Check readers until it carries the tag
{ const E = await imp("lib/onebox.js"), S = await imp("lib/live/search.js"), N = await imp("lib/nameGuard.js").catch(() => ({ badNameOf: () => "missing" }));
  const rowOf = (rc, extra = {}) => ({ market: { engineVersion: E.ENGINE_VERSION, warmEpoch: null, raw: { tier: "result", resolvedCar: rc, questionRulesTag: E.QUESTION_RULES_TAG, prewarBodyTag: E.PREWAR_BODY_TAG, ...extra }, }, computed_at: new Date().toISOString() });
  const rows = { by: rowOf({ year: 1936, make: "Delahaye", model: "By" }), mark: rowOf({ year: 1951, make: "Jaguar", model: "Mark" }), hemi: rowOf({ year: 1969, make: "Dodge", model: "Hemi", trim: "R/T" }), trimV8: rowOf({ year: 2005, make: "Ford", model: "Mustang", trim: "GT V8" }),
    tagged: rowOf({ year: 1936, make: "Delahaye", model: "By" }, { nameRulesTag: E.NAME_RULES_TAG }), good: rowOf({ year: 1967, make: "Chevrolet", model: "Corvette", trim: "L88" }), mustang: rowOf({ year: 2005, make: "Ford", model: "Mustang", trim: "GT" }) };
  const served = { by: false, mark: false, hemi: false, trimV8: false, tagged: true, good: true, mustang: true };
  const f0 = globalThis.fetch; globalThis.fetch = async url => { const u = String(url); const m = /spec_key=eq\.([^&]+)/.exec(u); if (/spec_market_cache/.test(u) && m) return new Response(JSON.stringify([rows[decodeURIComponent(m[1])]]), { status: 200 }); return new Response("[]", { status: 200 }); };
  const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
  for (const k of Object.keys(rows)) { const a = await S.readWarmAnswerDetailed(env, k), b = await S.readWarmAnswer(env, k); ok(`stored ${k}: both readers ${served[k] ? "serve" : "read no row"}`, !!(a && a.raw) === served[k] && !!b === served[k]); }
  globalThis.fetch = f0;
  ok("badNameOf names the pattern for each of Rick's stored names", N.badNameOf({ make: "Delahaye", model: "By" }) === "connective" && N.badNameOf({ make: "Jaguar", model: "Mark" }) === "partial_model" && N.badNameOf({ make: "Dodge", model: "Hemi" }) === "engine_or_gearbox_as_model" && N.badNameOf({ make: "Alfa Romeo", model: "GTA" }) === "badge_only_model" && N.badNameOf({ make: "Ford", model: "Mustang", trim: "GT V8" }) === "engine_or_gearbox_in_trim" && N.badNameOf({ make: "Ford", model: "Mustang", trim: "GT" }) === null); }
// 6. A KNOWN MODEL NEVER BLANKS (lane-b-names2, Nov 4 2026). CAUSE: the taxonomy did not hold Delahaye 135, 175, 235 ("1936 Delahaye 135" had no model), the 1750 and 2000 GTV read as GTV and 2000, and a guard keyed on the word alone would blank McLaren F1,
// Aston Martin V8, Ford V8 and F-1, Lagonda V12, Cadillac V-8 (real cars named like an engine). Per make, so "Ferrari F1" and "Chevrolet LT1" stay unnamed.
for (const m of ["135", "135M", "135MS", "148", "175", "235"]) eq(`Delahaye ${m} resolves`, await read(`1938 Delahaye ${m}`), { model: m });
eq("Delahaye 135 by Chapron keeps 135 and the coachbuilder", await read("1936 Delahaye 135 by Chapron"), { model: "135", coachbuilder: "Chapron" });
eq("Alfa Romeo 1750 GTV", await read("1969 Alfa Romeo 1750 GTV"), { model: "1750 GTV" });
eq("Alfa Romeo 2000 GTV", await read("1972 Alfa Romeo 2000 GTV"), { model: "2000 GTV" });
eq("Alfa Romeo 1750 Berlina", await read("1969 Alfa Romeo 1750 Berlina"), { model: "1750 Berlina" });
eq("Alfa Romeo 2000 Spider", await read("1960 Alfa Romeo 2000 Spider"), { model: "2000 Spider" });
eq("control: the 1995 to 2006 Alfa Romeo GTV stays GTV", await read("1998 Alfa Romeo GTV"), { model: "GTV" });
eq("2021 Giulia GTA", await read("2021 Alfa Romeo Giulia GTA"), { model: "Giulia", trim: "GTA" });
eq("Daimler V8 250 resolves", await read("1966 Daimler V8 250"), { model: "V8 250" });
eq("Daimler SP250 resolves", await read("1961 Daimler SP250"), { model: "SP250" });
eq("Daimler V8-250 hyphen resolves", await read("1966 Daimler V8-250"), { model: "V8 250" });
eq("McLaren F1 keeps F1", await read("1995 McLaren F1"), { model: "F1" });
eq("Aston Martin V8 keeps V8", await read("1975 Aston Martin V8"), { model: "V8" });
eq("Ford V8 keeps V8", await read("1934 Ford V8"), { model: "V8" });
eq("Ford F-1 keeps F1", await read("1948 Ford F-1"), { model: "F1" });
eq("Lagonda V12 keeps V12", await read("1938 Lagonda V12"), { model: "V12" });
eq("Cadillac V-8 keeps V8", await read("1932 Cadillac V-8"), { model: "V8" });
eq("Jaguar E-Type V12 keeps the V12 trim", await read("1973 Jaguar E-Type V12"), { model: "E-Type", trim: "V12" });
{ // the class: every model the engine knows by name (generation table, curated models, model aliases, Rick's marque and model pairs) reads the same with and without the guard, and a curated model always resolves
  const G = await imp("lib/generations.js"), D = await imp("lib/vehicleData.js");
  const pairs = new Map(); const add = (mk, md) => { if (mk && md) pairs.set(mk + "|" + md, [mk, md]); };
  for (const g of G.CURATED_GENERATIONS) add(g.make, g.model);
  for (const [mk, ms] of Object.entries(D.CURATED_MODELS)) for (const m of ms) add(mk, m);
  for (const a of D.MODEL_ALIASES) add(a.make, a.model);
  for (const l of fs.readFileSync("docs/rick-nomenclature.csv", "utf8").split("\n").slice(1)) { const c = l.split(","); if (c[2] && c[3]) add(c[2].trim(), c[3].trim()); }
  let blanked = [], unresolved = [], n = 0;
  for (const [mk, md] of pairs.values()) { n++; const t = `1965 ${mk} ${md}`; const a = await resolveVehicle(t, { noNameGuard: true }).catch(() => null), b = await resolveVehicle(t, {}).catch(() => null), av = a && a.vehicle, bv = b && b.vehicle;
    if (av && av.model && !(bv && bv.model)) blanked.push(t);
    if (D.CURATED_MODELS[mk.toLowerCase()] && D.CURATED_MODELS[mk.toLowerCase()].includes(md) && !(bv && bv.model)) unresolved.push(t); }
  ok(`${n} known make and model pairs: the guard blanks none that the resolver read`, !blanked.length, blanked.slice(0, 6).join(" | "));
  ok("every curated model resolves", !unresolved.length, unresolved.slice(0, 6).join(" | ")); }
// 7. A MULTI-WORD MODEL NEVER LOSES ITS FIRST WORD (lane-b-names3, Nov 5 2026). Live: "1949 Rolls-Royce Silver Wraith" was titled "1949 Rolls-Royce Wraith", the 2013 to 2021 car. CAUSES: a colour word (Silver) is stripped before the model is read; a model the taxonomy files
// under its second word (Ferrari 166 MM read as MM); a Roman numeral read alone (Jaguar Mark VIII read as VIII). WHO ELSE: every page that names a car from the resolver. The list is the real cars the sweep of 294 multi-word models found; a control proves the one-word cars stay.
for (const [mk, y, names] of [["Rolls-Royce", 1955, ["Silver Wraith", "Silver Ghost", "Silver Dawn", "Silver Cloud", "Silver Shadow", "Silver Spirit", "Silver Spur", "Silver Seraph"]], ["Ferrari", 1960, ["166 MM", "166 Inter", "195 Inter", "212 Export", "212 Inter", "340 America", "342 America", "410 Superamerica", "288 GTO"]],
  ["Lamborghini", 1965, ["350 GT", "400 GT"]], ["Maserati", 1960, ["5000 GT"]], ["Alfa Romeo", 1936, ["8C 2900"]], ["Bentley", 1953, ["R-Type Continental"]], ["Jaguar", 1955, ["Mark VII", "Mark VIII", "Mark IX", "Mark X"]]])
  for (const n of names) { const g = await read(`${y} ${mk} ${n}`); ok(`${mk} ${n} keeps its first word`, g && g.model === n, JSON.stringify(g)); }
eq("1949 Rolls-Royce Silver Wraith is not the Wraith", await read("1949 Rolls-Royce Silver Wraith Touring Limousine"), { model: "Silver Wraith" });
eq("control: 2015 Rolls-Royce Wraith stays the Wraith", await read("2015 Rolls-Royce Wraith"), { model: "Wraith" });
eq("control: 2012 Rolls-Royce Ghost stays the Ghost", await read("2012 Rolls-Royce Ghost"), { model: "Ghost" });
eq("control: Bentley Continental GT keeps Continental and GT", await read("2005 Bentley Continental GT"), { model: "Continental", trim: "GT" });
console.error = quiet;
log(fail ? `\nnameGuardCheck: ${fail} FAILED` : "\nnameGuardCheck: all passed"); process.exit(fail ? 1 : 0);
