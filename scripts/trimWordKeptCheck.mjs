// clock: real-ok same pass and fail counts and the same exit with the clock at +0 and +60 days (Lane C probe, Nov 18 2026: node --import scripts/_clockShift.mjs); a date in it is built from the real now or never read
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
ok("(4) the make-scoped table holds every added word, each for its own make", ["autobiography", "hse", "svr", "vogue", "dynamic", "westminster", "luxury", "maybach", "trackhawk", "badge", "plaid", "gr", "mc", "hybrid", "speed"].every(w => new RegExp(`\\b${w}:`).test(vd.slice(vd.indexOf("export const MAKE_SCOPED_TRIM_WORDS")))) && !/"speed"/.test(vd.slice(vd.indexOf("export const TRIM_VOCABULARY"), vd.indexOf("export const MAKE_SCOPED_TRIM_WORDS"))));
// (5) THE THREE REDS OF THE COMBINED PREPUSH, AND THE CLASS: a make-scoped word is a trim on its own make only
const read = async q => { const r = await V.resolveVehicle(q, {}); return r.vehicle || {}; };
const reds = [["Turbo-Look BMW 2002", null], ["GT-Style 914", null], ["Mustang GT 5-Speed V8", "GT"], ["1969 Mustang GT 4-Speed", "GT4"], ["Porsche 911 6-Speed", null]];
const redBad = []; for (const [q, want] of reds) { const v = await read(q); if (/speed/i.test(String(v.trim || "")) || (want !== null && String(v.trim) !== want)) redBad.push(`${q} -> ${JSON.stringify(v.trim)}`); }
ok("(5) 'Turbo-Look BMW 2002', 'GT-Style 914', 'Mustang GT 5-Speed V8' and gearbox phrases never read Speed as a trim", redBad.length === 0, redBad.join("; "));
ok("(5) Speed is a trim on a Bentley, after the model word and as the model's own trim", (await read("2018 Bentley Continental GT Speed")).trim === "GT Speed" && (await read("2019 Bentley Flying Spur Speed")).trim === "Speed");
const OWN = { autobiography: ["Land Rover", "Range Rover"], hse: ["Land Rover", "Range Rover Sport"], svr: ["Jaguar", "F-Type"], vogue: ["Land Rover", "Range Rover"], dynamic: ["Land Rover", "Range Rover Evoque"], westminster: ["Land Rover", "Range Rover"], luxury: ["Land Rover", "Discovery"], maybach: ["Mercedes-Benz", "S-Class"], trackhawk: ["Jeep", "Grand Cherokee"], badge: ["Rolls-Royce", "Ghost Black"], plaid: ["Tesla", "Model S"], gr: ["Toyota", "Land Cruiser"], mc: ["Maserati", "GranTurismo"], hybrid: ["Porsche", "Cayenne Turbo S E"] };
const leaks = [], misses = [];
for (const [w, [mk, mdl]] of Object.entries(OWN)) {
  const own = await read(`2019 ${mk} ${mdl} ${w}`); if (!String(own.trim || "").toLowerCase().includes(w)) misses.push(`${mk} ${mdl} ${w} -> ${JSON.stringify(own.trim)}`);
  for (const other of ["2019 Ford Mustang GT", "2004 BMW M3", "1990 Porsche 911 Carrera", "1972 Chevrolet Corvette"]) { if (/porsche/i.test(other) && w === "hybrid") continue; for (const fmt of [`${other} ${w}`, `${other} 5-${w}`, `${w} ${other}`]) { const v = await read(fmt); if (String(v.trim || "").toLowerCase().split(/\s+/).includes(w)) leaks.push(`${fmt} -> ${JSON.stringify(v.trim)}`); } }
}
ok("(5) each scoped word is a trim on its own make (14 words)", misses.length === 0, misses.slice(0, 3).join("; "));
ok("(5) no scoped word becomes a trim on another make or as a hyphen tail (Mustang, M3, 911, Corvette; word, 5-word, word first)", leaks.length === 0, leaks.slice(0, 3).join("; "));
const TK = await imp("lib/tasks/tasks.js");
ok("(5) Tasks keeps a scoped trim for its own make and drops it for another (knownTrim)", TK.knownTrim("Autobiography", { make: "Land Rover", model: "Range Rover" }) === "Autobiography" && TK.knownTrim("Autobiography", { make: "Ford", model: "Mustang" }) === null && TK.knownTrim("Speed", { make: "Bentley", model: "Continental" }) === "Speed");
// (6) A TYPED MODEL WORD BESIDE A GENERATION CODE KEEPS BOTH (Lane B, Nov 13 2026). LIVE: Market Check for "1978 Mercedes 450SL R107" answered "1978 Mercedes-Benz SL-Class", dropped the typed 450SL and pooled other SLs among its sales.
// CAUSE: the resolver keeps a generation code in the trim slot (its convention); buildSpec cleared the slot only when the trim WAS the code. "450SL R107" is the model word AND the code in one string: the title fence "450SL R107" matched no listing ("1978 Mercedes-Benz 450SL"),
// the pool came back empty, the ladder dropped the trim and read the family. FIX: buildSpec takes the code word out of a trim that carries it and keeps the model word as the trim and the fence; the code is the generation. Every door builds its spec there
// (Market Check, Sell's price band and sales, the Desk read, Find's card read, spec pages). CLASS TABLE: [typed search, the trim words that must stay in the spec's trim, the generation code the spec must carry] across SL-Class, Corvette, Mustang, 911 and M3 (C-Class and E-Class carry no curated generation rows by Sam's decision, c63GenCheck, so their codes are not read here).
const TYPED = [["1978 Mercedes 450SL R107", "450SL", "r107"], ["1978 Mercedes R107 450SL", "450SL", "r107"], ["1978 Mercedes 450SL R107 Roadster", "450SL Roadster", "r107"], ["1969 Chevrolet Corvette L88 C3 Coupe", "L88", "C3"], ["1995 Porsche 911 993 Carrera S", "Carrera S", "993"], ["1975 Mercedes-Benz 380SL R107", "380SL", "r107"], ["1986 Mercedes 560SL R107", "560SL", "r107"], ["1968 Mercedes 280SL W113", "280SL", "w113"], ["1966 Mercedes 230SL W113", "230SL", "w113"], ["1965 Mercedes 250SL W113", "250SL", "w113"],
  ["2001 Chevrolet Corvette Z06 C5", "Z06", "C5"], ["2009 Chevrolet Corvette ZR1 C6", "ZR1", "C6"], ["1968 Chevrolet Corvette L88 C3", "L88", "C3"], ["1980 Chevrolet Corvette L82 C3", "L82", "C3"],
  ["2003 Ford Mustang Mach 1 SN95", "Mach 1", "SN95"], ["2007 Ford Mustang GT500 S197", "GT500", "S197"], ["1989 Ford Mustang LX 5.0 Fox-body", "LX", "Fox-body"],
  ["1995 Porsche 911 Carrera 4 993", "Carrera 4", "993"], ["1995 Porsche 911 Carrera S 993", "Carrera S", "993"], ["1990 Porsche 911 Carrera 2 964", "Carrera", "964"], ["2008 BMW M3 Competition E92", "Competition", "e92"]];
const sqz = x => String(x || "").toLowerCase().replace(/[^a-z0-9]/g, ""), typedBad = [];
for (const [q, trimWords, code] of TYPED) {
  const r = await V.resolveVehicle(q, {}), v = r.vehicle || {}; if (!v.make) { typedBad.push(`${q}: no car`); continue; }
  const sp = E.buildSpec(v, null, q), trimOk = sqz(sp.trim) === sqz(trimWords), codeOk = sqz(sp.genCode) === sqz(code), fence = sqz(sp.titleContains);
  if (!trimOk || !codeOk || (fence && fence.includes(sqz(code)) && sqz(code) !== fence)) typedBad.push(`${q}: trim ${JSON.stringify(sp.trim)} (want ${JSON.stringify(trimWords)}), generation ${JSON.stringify(sp.genCode)} (want ${code}), fence ${JSON.stringify(sp.titleContains)}`);
}
ok(`(6) ${TYPED.length} typed model-plus-generation searches keep BOTH: the model word is the spec's trim and fence, the code is the generation and is in no fence`, typedBad.length === 0, typedBad.slice(0, 3).join("; "));
// (6b) end to end on a fake archive: the 450SL pool holds 450SLs only (the answer on main read the SL-Class and pooled a 380SL), and Sell's sales list agrees
{ const rows = []; let n = 0; const day = i => new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
  const ev = (row, it) => { const ci = it.indexOf(":"); const alias = ci > 0 && it[ci + 1] !== ":" ? it.slice(0, ci) : null; const expr = alias ? it.slice(ci + 1) : it; if (expr.startsWith("raw_record->>")) { const k = expr.slice(13), val = row.raw_record[k]; return [alias || k, val == null ? null : String(val)]; } return [alias || expr, row[expr] === undefined ? null : row[expr]]; };
  const likeRe = x => new RegExp("^" + String(x).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i");
  const sale = (title, yr, price, ago) => { n++; rows.push({ id: "00000000-0000-4000-8000-" + String(n).padStart(12, "0"), source_id: "sl" + n, sale_price: price, sale_date: day(ago), platform: "Bring a Trailer", source_slug: "bringatrailer", make: "Mercedes-Benz", model: "SL-Class", year: yr, listing_title: title, vin_norm: "V" + n, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: null, vehicle_type: "car", sale_price_usd: price,
    raw_record: { featured_image_url: "https://x/i.jpg", mileage: String(60000 + n * 900), body_style: "Convertible", modifications: null, title, currency: "USD", transmission: null, exterior_color: null, title_status: null, url: "https://u/" + n, source_url: null, city: "Costa Mesa", state: "CA", country_code: "US", auction_end_precision: null } }); };
  for (let i = 0; i < 12; i++) sale(`${1973 + i % 8} Mercedes-Benz 450SL`, 1973 + i % 8, 15000 + i * 900, 20 + i * 40);
  for (let i = 0; i < 6; i++) sale(`${1981 + i % 4} Mercedes-Benz 380SL`, 1981 + i % 4, 18000 + i * 900, 30 + i * 50);
  for (let i = 0; i < 5; i++) sale(`${1968 + i % 4} Mercedes-Benz 280SL`, 1968 + i % 4, 70000 + i * 5000, 25 + i * 45);
  globalThis.fetch = async (url) => { const u = new URL(String(url));
    if (u.pathname.endsWith("/sales_archive")) { const sp = u.searchParams, sel = sp.get("select"), sd = sp.getAll("sale_date"), ge = sd.filter(x => x.startsWith("gte.")).map(x => x.slice(4)), lt = sd.filter(x => x.startsWith("lt.")).map(x => x.slice(3)), ys = sp.getAll("year"), ymin = Number((ys.find(x => x.startsWith("gte.")) || "gte.0").slice(4)), ymax = Number((ys.find(x => x.startsWith("lte.")) || "lte.9999").slice(4));
      const mk = sp.get("make") && likeRe(sp.get("make").replace(/^ilike\./, "")), md = sp.get("model") && likeRe(sp.get("model").replace(/^ilike\./, "")), ti = sp.get("listing_title") && likeRe(sp.get("listing_title").replace(/^ilike\./, ""));
      const keep = rows.filter(r => (!ge.length || r.sale_date >= ge[0]) && (!lt.length || r.sale_date < lt[0]) && r.year >= ymin && r.year <= ymax && (!mk || mk.test(r.make)) && (!md || md.test(r.model)) && (!ti || ti.test(r.listing_title)));
      return new Response(JSON.stringify(keep.map(r => Object.fromEntries(sel.split(",").map(it => ev(r, it))))), { status: 200 }); }
    if (u.hostname.includes("fake.supabase")) return new Response("[]", { status: 200 }); throw new Error("offline"); };
  const env6 = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
  for (const q of ["1978 Mercedes 450SL R107", "1978 Mercedes 450SL"]) {
    const v = (await V.resolveVehicle(q, {})).vehicle, a = (await E.oneEngineAnswer(v, null, q, env6, null)).raw, titles = (a.cards || []).map(c => String(c.title || c.listing_title || ""));
    ok(`(6) Market Check "${q}": the pool holds 450SLs only, the car keeps its 450SL, the line names it`, a.tier === "result" && titles.length > 0 && titles.every(t => /450SL/.test(t)) && a.resolvedCar && a.resolvedCar.trim === "450SL" && /450SL/.test(String(a.scopeLabel || "")), JSON.stringify([a.tier, a.resolvedCar && a.resolvedCar.trim, a.scopeLabel, titles.slice(0, 3)]));
  }
  const vs = (await V.resolveVehicle("1978 Mercedes 450SL R107", {})).vehicle, sold = await E.listSalesForVehicle(vs, null, env6, 3650).catch(e => ({ err: String(e.message) })), list = Array.isArray(sold) ? sold : ((sold && (sold.sales || sold.rows)) || []);
  ok("(6) Sell (listSalesForVehicle): the sales listed for the typed 450SL R107 are 450SLs only", list.length > 0 && list.every(r => /450SL/.test(String(r.listing_title || r.title || r.raw_title || ""))), JSON.stringify([list.length, (list[0] && Object.keys(list[0]).slice(0, 6)) || sold]));
}
console.log(failed ? `\n${failed} FAILED` : "\ntrimWordKeptCheck: all passed");
process.exit(failed ? 1 : 0);
