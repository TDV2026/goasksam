// A MAKE AND A YEAR WITH MORE THAN ONE MODEL THAT HAS SALES ASKS WHICH ONE, BEFORE ANY RANGE (Lane B, Oct 29 2026). Live, "1995 porsche" answered the 1995 Porsche 911 with no question; Porsche sold the 911 (993),
// the 928 GTS and the 968 that year.
// CAUSE (lib/vehicle.js resolveVehicle, "A make with exactly one known model resolves silently"): the resolver took the model from vPIC's list of models for the year when that list had ONE name. vPIC's year list is
// incomplete (it names only the 911 for a 1995 Porsche), so one name there is not one model that sold. Rule 13 (a make with exactly one known model auto-resolves) was applied to a list that is not "known models".
// FIX: the single-model inference for a make+year also reads the sales archive (modelsWithSalesForMakeYear: model families with at least ASK_MODEL_MIN sales that year); two or more means the question is asked, with
// those models as the chips. Nothing else changes: a make whose archive holds one model that year still resolves silently.
// Every make: the check runs "1995 porsche", "1990 bmw", "1969 chevrolet" and "2005 mercedes" against an archive where the make has more than one model with sales that year and a vPIC that lists ONE.
//   node scripts/makeYearAskCheck.mjs [repo root]
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.LAUNCH_STAGE = "2";
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
// the archive: per make and year, the models with sales (family, count)
const ARCHIVE = {
  "porsche|1995": [["911", 31], ["928", 9], ["968", 5]],
  "bmw|1990": [["3-Series", 14], ["M3", 12], ["5-Series", 6]],
  "chevrolet|1969": [["Camaro", 60], ["Corvette", 80], ["Chevelle", 40], ["Nova", 12]],
  "mercedes-benz|2005": [["E-Class", 10], ["SL-Class", 12], ["CLK-Class", 8]],
  "lotus|1995": [["Esprit", 9]]                       // one model with sales: still silent
};
const VPIC_ONE = { porsche: "911", bmw: "3 Series", chevrolet: "Camaro", "mercedes-benz": "E-Class", lotus: "Esprit" };   // vPIC names one model for the year
globalThis.fetch = async (url) => {
  const u = new URL(String(url)), p = u.pathname;
  if (u.hostname.includes("nhtsa")) {
    const m = /getmodelsformakeyear\/make\/([^/]+)\/modelyear/i.exec(p), mk = m && decodeURIComponent(m[1]).toLowerCase().replace(/\s+/g, "-");
    const one = mk && (VPIC_ONE[mk] || VPIC_ONE[mk.replace(/-benz$/, "")]);
    return new Response(JSON.stringify({ Results: one ? [{ Model_Name: one, Make_Name: mk }] : [] }), { status: 200 });
  }
  if (p.endsWith("/sales_archive")) {
    const mk = (u.searchParams.get("make") || "").replace(/^ilike\./, "").toLowerCase().replace(/\s+/g, "-"), yr = (u.searchParams.get("year") || "").replace(/^eq\./, "");
    const rows = ARCHIVE[mk + "|" + yr] || ARCHIVE[mk.replace(/^mercedes$/, "mercedes-benz") + "|" + yr];
    const out = rows ? rows.flatMap(([model, n]) => Array.from({ length: n }, () => ({ model, model_family: model }))) : [];
    return new Response(JSON.stringify(out), { status: 200 });
  }
  if (p.endsWith("/taxonomy_makes")) return new Response(JSON.stringify(["Porsche", "BMW", "Chevrolet", "Mercedes-Benz", "Lotus"].map(name => ({ name }))), { status: 200 });
  if (p.endsWith("/taxonomy_models")) { const slug = (u.searchParams.get("make_slug") || "").replace(/^eq\./, ""); const rows = Object.entries(ARCHIVE).filter(([k]) => k.split("|")[0] === slug).flatMap(([, v]) => v.map(([name]) => ({ name, year_ranges: null }))); return new Response(JSON.stringify([...new Map(rows.map(r => [r.name, r])).values()]), { status: 200 }); }
  if (u.hostname.includes("fake.supabase")) return new Response("[]", { status: 200 });
  throw new Error("offline");
};
const V = await import(pathToFileURL(path.join(root, "lib/vehicle.js")).href);
const ask = async q => { const r = await V.resolveVehicle(q, {}); return r; };
for (const [q, want] of [["1995 porsche", ["911", "928", "968"]], ["1990 bmw", ["3-Series", "M3", "5-Series"]], ["1969 chevrolet", ["Corvette", "Camaro", "Chevelle"]], ["2005 mercedes", ["SL-Class", "E-Class", "CLK-Class"]]]) {
  const r = await ask(q);
  const chips = (r.clarification && r.clarification.chips) || [];
  ok(`"${q}" asks which model before any range (not resolved to one)`, r.status === "needs_clarification" && !(r.vehicle && r.vehicle.model), `${r.status} ${r.vehicle && r.vehicle.model}`);
  ok(`"${q}": a chip for every model that has sales (${want.join(", ")})`, want.every(w => chips.includes(w)), chips.join(" | "));
  ok(`"${q}": the chips are those models, most-sold first, then Not sure`, chips[0] === want[0] && chips[chips.length - 1] === "Not sure", chips.join(" | "));
}
{ const r = await ask("1995 lotus"); ok("a make with one model that sold that year still resolves silently", r.status === "valid" && r.vehicle && r.vehicle.model === "Esprit", `${r.status} ${r.vehicle && r.vehicle.model}`); }
{ const r = await ask("1995 porsche 911"); ok("naming the model is never asked again", r.status === "valid" && r.vehicle && r.vehicle.model === "911", `${r.status} ${r.vehicle && r.vehicle.model}`); }
console.log(fail ? `makeYearAskCheck: ${fail} failure(s)` : "makeYearAskCheck: all pass");
process.exit(fail ? 1 : 0);
