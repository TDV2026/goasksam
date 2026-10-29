// A MODEL CODE TYPED WITH A SPACE IS THE SAME MODEL, AND THE CARD NEVER SAYS "COULD NOT BE CHECKED" FOR A KNOWN CAR (Lane B, Oct 29 2026, Sam's Find screen: the 2022 Audi RS 6 Avant, Bring a Trailer, 86,000 miles, $36,500 bid).
// WHY: "RS 6 Avant" resolved to the model "RS" with the trim "Avant"; the sales the engine found are filed RS6, so the output invariant receipts_carry_resolved_car (lib/onebox.js runOutputInvariants) found the pool swapped and the engine refused the answer
// with refusal.verify ("No figures are shown because this car could not be checked."). Not an unresolved model, not a timeout, not a failed compute: the resolver cut the code at the space. The invariant is correct and stays; the sentence appears only when an invariant really fails.
// CLASS: any letters-and-number code typed with a space: Audi RS/S/A/Q/R 3 to 8, BMW M/X/Z, Mazda RX/MX. FIX: glueSpacedModelCodes in lib/vehicle.js (make named in the text). This check: each spaced spelling resolves to the glued model, the glued spelling is unchanged, a
// non-code (Audi A 6 Avant trim words, Porsche 911 GT 3, a year) is not glued, and the engine invariant passes on the glued resolution and refuses on the old one (shown with the old model "RS").
//   node scripts/spacedModelCodeCheck.mjs [repo root]
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
globalThis.fetch = async (u) => { const x = new URL(String(u)); if (x.hostname !== "fake.supabase.test") throw new Error("offline"); return new Response("[]", { status: 200 }); };
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const V = await import(pathToFileURL(path.join(root, "lib/vehicle.js")).href), E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
const CASES = [["2022 Audi RS 6 Avant", "RS6", "Avant"], ["2013 Audi RS 6 Avant", "RS6", "Avant"], ["2022 Audi RS6 Avant", "RS6", "Avant"], ["2018 Audi RS 3", "RS3", null], ["2016 Audi R 8", "R8", null], ["2020 Audi A 6 Avant", "A6", "Avant"], ["2011 Audi S 4", "S4", null],
  ["2008 BMW M 3 Coupe", "M3", null], ["2015 BMW X 5", "X5", null], ["2005 BMW Z 4", "Z4", null], ["1993 Mazda RX 7", "RX-7", null], ["1991 Mazda MX 5", "MX-5", null], ["2019 Porsche 911 GT 3", "911", "GT3"]];
for (const [t, model, trim] of CASES) { const r = await V.resolveVehicle(t, {}), v = r.vehicle || {}; ok(`"${t}" resolves to ${model}${trim ? " " + trim : ""}`, r.status === "valid" && v.model === model && (v.trim || null) === trim, `${r.status} ${v.model} ${v.trim || ""}`); }
{ const cards = [["RS6", "2021 Audi RS6 Avant"], ["RS6", "2020 Audi RS 6 Avant"], ["RS6", "2022 Audi RS6 Avant"], ["RS6", "2023 Audi RS 6 Avant"]].map(([m, t], i) => ({ make: "Audi", model: m, title: t, price: 100000 + i, year: 2020 + i, date: "2026-0" + (i + 1) + "-01" }));
  const run = veh => E.runOutputInvariants({ tier: "result", poolN: 4, cards, rawPool: [], cluster: [90000, 110000], resolvedCar: veh }, veh).filter(c => !c.ok).map(c => c.name);
  const real = await V.resolveVehicle("2022 Audi RS 6 Avant", {});
  ok("the engine's invariants pass on what the resolver now returns for the RS 6 Avant", run(real.vehicle).length === 0, run(real.vehicle).join(","));
  ok("and still refuse a swapped pool (the old resolution, model RS): the refusal is for real errors", run({ make: "Audi", model: "RS", trim: "Avant", year: 2022 }).includes("receipts_carry_resolved_car")); }
console.log(fail ? `spacedModelCodeCheck: ${fail} failure(s)` : "spacedModelCodeCheck: all pass");
process.exit(fail ? 1 : 0);
