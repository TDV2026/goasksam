// A REAL TRIM WORD IS NEVER SILENTLY DROPPED (Lane B, Nov 5 2026). LIVE: Market Check for "2024 Land Rover Range Rover Autobiography" printed "Sam didn't use 'autobiography' in this search." and answered for the bare 2024 Range Rover.
// CAUSE: "Autobiography" was not in TRIM_VOCABULARY (lib/vehicleData.js), the whitelist of trim words, so the resolver set it aside as a dirty token (trim null) and the engine read the model without it. Not a thin trim pool: the word never reached the pool.
// CLASS: any real trim, series or edition word that is a pure word (no digit) and not in the list: Range Rover Autobiography, SVR, HSE, Vogue, Dynamic, Westminster; Jaguar Autobiography and SVR; Maybach; Jeep Trackhawk; Rolls-Royce Black Badge; Tesla Plaid;
// Toyota GR Sport; Maserati MC; Bentley Speed; Cayenne E-Hybrid; and a hyphenated make or model word (Mercedes-AMG, GT-R) wrongly named as unused. No network, no database: the resolver runs on its curated data.
// Must hold: (1) for each real trim query the trim word is read (in the trim or the model) and the leftover line is empty; (2) when the named trim has too few sales and the answer reads the wider model, the sentence counts the trim's own sales from the pool's titles
// and the trim is a Narrow by pill with that count; (3) a trim with none of its own sales says nothing it cannot back; (4) the wiring.
//   node scripts/trimWordKeptCheck.mjs [repo root]        (a tree without the fix fails it)
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const ROOT = path.resolve(process.argv[2] || path.join(path.dirname(new URL(import.meta.url).pathname), ".."));
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
const V = await imp("lib/vehicle.js"), U = await imp("lib/live/unusedWords.js"), E = await imp("lib/onebox.js");
// [typed search, the trim word that must be read]
const REAL = [
  ["2024 Land Rover Range Rover Autobiography", "autobiography"], ["2022 Range Rover Sport Autobiography", "autobiography"], ["2020 Range Rover Sport SVR", "svr"], ["2021 Range Rover Sport SV", "sv"], ["2023 Range Rover SV", "sv"],
  ["2019 Range Rover Sport HSE", "hse"], ["2018 Range Rover Vogue", "vogue"], ["2019 Range Rover Evoque Dynamic", "dynamic"], ["2008 Range Rover Westminster", "westminster"], ["2020 Land Rover Defender Hse", "hse"],
  ["2024 Range Rover Sport Autobiography Edition One", "autobiography"], ["2017 Jaguar F-Type SVR", "svr"], ["2019 Jaguar XJ Autobiography", "autobiography"], ["2020 Land Rover Discovery HSE Luxury", "hse"],
  ["2019 Mercedes-Benz S-Class Maybach", "maybach"], ["2021 Jeep Grand Cherokee Trackhawk", "trackhawk"], ["2016 Rolls-Royce Ghost Black Badge", "badge"], ["2021 Tesla Model S Plaid", "plaid"],
  ["2022 Toyota Land Cruiser GR Sport", "gr"], ["2018 Maserati GranTurismo MC", "mc"], ["2018 Bentley Continental GT Speed", "speed"], ["2019 Porsche Cayenne Turbo S E-Hybrid", "hybrid"],
  // already read before the fix, kept as the guard that the list did not break them
  ["2021 BMW M3 Competition", "competition"], ["2019 BMW M4 CS", "cs"], ["2020 BMW M5 Competition", "competition"], ["2018 Porsche 911 Turbo S", "turbo s"], ["2017 Porsche 911 GTS", "gts"], ["2020 Porsche 718 Cayman GT4", "gt4"],
  ["2018 Porsche Panamera Turbo S", "turbo s"], ["2017 Chevrolet Camaro ZL1", "zl1"], ["2021 Dodge Charger Scat Pack", "scat pack"], ["2018 Dodge Challenger SRT Demon", "demon"], ["2018 Lamborghini Aventador SV", "sv"],
  ["2019 Mercedes-AMG C63 S", "c63"], ["2018 Mercedes-AMG GT R", "r"], ["2016 Nissan GT-R Nismo", "nismo"], ["2020 Acura NSX Type S", "type s"], ["2008 Land Rover Range Rover Supercharged", "supercharged"]
];
const bad = [];
for (const [q, word] of REAL) {
  const r = await V.resolveVehicle(q, {}), v = r.vehicle || {};
  const read = (String(v.trim || "") + " " + String(v.model || "") + " " + String(v.edition || "")).toLowerCase().includes(word);
  const u = U.unusedWordsOf(q, v, r.corrections);
  if (!read || u.unused.length || (v.dirtyTokens || []).some(t => String(word).split(" ").includes(String(t).toLowerCase()))) bad.push(`${q} [trim ${JSON.stringify(v.trim)}, dirty ${JSON.stringify(v.dirtyTokens)}, unused ${JSON.stringify(u.unused)}]`);
}
ok(`(1) ${REAL.length} real trim queries: the trim word is read and no 'didn't use' line is printed`, bad.length === 0, bad.slice(0, 3).join("; "));
const r1 = await V.resolveVehicle("2024 Land Rover Range Rover Autobiography", {});
ok("(1) the 2024 Range Rover Autobiography: trim Autobiography, model Range Rover, nothing dropped", r1.vehicle && r1.vehicle.trim === "Autobiography" && r1.vehicle.model === "Range Rover" && !(r1.vehicle.dirtyTokens || []).length, JSON.stringify([r1.vehicle && r1.vehicle.trim, r1.vehicle && r1.vehicle.dirtyTokens]));
ok("(1) a hyphenated make word is not named unused: 'Mercedes-AMG' and 'GT-R'", !U.unusedWordsOf("2019 Mercedes-AMG C63 S", (await V.resolveVehicle("2019 Mercedes-AMG C63 S", {})).vehicle, null).unused.length && !U.unusedWordsOf("2016 Nissan GT-R Nismo", (await V.resolveVehicle("2016 Nissan GT-R Nismo", {})).vehicle, null).unused.length);
ok("(1) a word that is not a trim is still named: 'sunroof' on a Range Rover", U.unusedWordsOf("2024 Range Rover Autobiography sunroof", r1.vehicle, null).unused.includes("sunroof"));
// (2) the sentence and the pill
const T = (t, extra = {}) => ({ raw_title: t, ...extra });
const pool = [T("2024 Land Rover Range Rover P530 Autobiography LWB"), T("2023 Land Rover Range Rover P530 Autobiography LWB"), T("2024 Range Rover P530 SE"), T("2025 Range Rover P400 SE LWB"), T("2023 Range Rover SV Carmel Edition"), T("2024 Range Rover SE SWB"), T("2025 Range Rover P530 SE LWB"), T("2023 Range Rover P530 SE LWB")];
ok("(2) trimCarsIn counts the trim's own sales from the titles (2 of 8)", E.trimCarsIn(pool, "Autobiography") === 2 && E.trimCarsIn(pool, "HSE") === 0);
ok("(2) the sentence: 'Too few Autobiography sales for their own range; two of these eight are Autobiography cars.'", E.trimThinSentence("Autobiography", 2, 8) === "Too few Autobiography sales for their own range; two of these eight are Autobiography cars.", E.trimThinSentence("Autobiography", 2, 8));
ok("(2) one sale reads 'is an' for a vowel trim and the sentence is null with none", /one of these eight is an Autobiography car\.$/.test(E.trimThinSentence("Autobiography", 1, 8)) && E.trimThinSentence("Autobiography", 0, 8) === null);
const ans = { tier: "result", widening: E.trimThinSentence("Autobiography", 2, 8), resolvedCar: { trim: "Autobiography" }, cards: pool, refineOptions: [{ dimension: "body", label: "LWB", value: "lwb", n: 5 }] };
const pill = E.withTrimPill(ans), tp = (pill.refineOptions || []).find(o => o.dimension === "trim");
ok("(2) the trim is a Narrow by pill with its count and the refine a click sends back", !!tp && tp.label === "Autobiography" && tp.n === 2 && tp.refine && tp.refine.trim === "Autobiography", JSON.stringify(tp));
ok("(2) the pill keeps the other pills and is added once", pill.refineOptions.length === 2 && E.withTrimPill(pill).refineOptions.length === 2);
ok("(3) an answer that did not widen past a trim, or whose trim has no sale in the pool, gets no pill", E.withTrimPill({ ...ans, widening: null }) === undefined || !(E.withTrimPill({ ...ans, widening: null }).refineOptions || []).some(o => o.dimension === "trim"));
ok("(3) no trim sale in the pool: no pill, no count claimed", !(E.withTrimPill({ ...ans, cards: pool.filter(c => !/Autobiography/.test(c.raw_title)) }).refineOptions || []).some(o => o.dimension === "trim"));
// (4) wiring
const src = fs.readFileSync(path.join(ROOT, "lib/onebox.js"), "utf8"), vd = fs.readFileSync(path.join(ROOT, "lib/vehicleData.js"), "utf8");
ok("(4) the widened answer's sentence counts the trim's sales (runOneBox)", /trimThinSentence\(spec\.trim, trimCarsIn\(solid, spec\.trim\), solid\.length\)/.test(src));
ok("(4) every caller of pooledApartGuard gets the pill", /export function pooledApartGuard\(d, refine\) \{ return withTrimPill\(pooledApartGuardRead\(d, refine\)\); \}/.test(src));
ok("(4) the trim list holds the words", ["autobiography", "hse", "svr", "vogue", "westminster", "maybach", "trackhawk", "plaid"].every(w => new RegExp(`"${w}"`).test(vd.slice(vd.indexOf("export const TRIM_VOCABULARY")))));
console.log(failed ? `\n${failed} FAILED` : "\ntrimWordKeptCheck: all passed");
process.exit(failed ? 1 : 0);
