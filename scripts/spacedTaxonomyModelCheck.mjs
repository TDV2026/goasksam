// A TAXONOMY MODEL NAMED WITH A SPACE IS NOT REFUSED FOR ITS OWN SALES (Lane B, Oct 29 2026, Sam's live check on 84c54259: Market Check "2022 Audi RS 6 Avant" and Find "Audi RS 6 Avant" both printed "No figures are shown because this car could not be checked.", with "Based on 11 sales since November 2024.").
// CAUSE: not the typed spelling (1cd8a234 glues "RS 6" to RS6 when the resolver cuts it) but the TAXONOMY's own model names: it files "RS 3", "RS 4", "RS 5", "RS 6", "RS 6 Avant", while the sales are titled and filed "RS6", "RS3". The warm and the stored row key the car by the taxonomy name
// ("RS 6 Avant"); the output invariant receipts_carry_resolved_car (lib/onebox.js runOutputInvariants) took the model's first whitespace word ("RS") as the token every receipt must carry, found "RS" in no "RS6" title, called the pool swapped and refused 11 good sales. The refusal
// row was stored (stamp e99, the stamp did not change with the fix), so read-time freshening never recomputes it. The 11 sales behind it were right, which is why the refusal printed a "Based on 11 sales" line: the refusal rewrote the answer, not the pool.
// FIX: a leading letters-and-number pair (RS 6, M 3, X 5, RX 7, SL 500, C 63) is read as the glued code in either spelling, for the column and the title. CLASS: every taxonomy model with a spaced code; this check runs a table of them (Audi RS/S/A/Q/R, BMW M/X/Z, Mazda RX/MX, Mercedes codes)
// with sales filed glued, filed spaced and titled hyphenated, and a swapped pool (another code's sales) which must still refuse.
//   node scripts/spacedTaxonomyModelCheck.mjs [repo root]
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
globalThis.fetch = async (u) => { const x = new URL(String(u)); if (x.hostname !== "fake.supabase.test") throw new Error("offline"); return new Response("[]", { status: 200 }); };
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
// [make, taxonomy model, glued column, another code of the make (a swapped pool)]
const TABLE = [["Audi", "RS 3", "RS3", "RS 6"], ["Audi", "RS 4", "RS4", "RS 6"], ["Audi", "RS 5", "RS5", "RS 3"], ["Audi", "RS 6", "RS6", "RS 3"], ["Audi", "RS 6 Avant", "RS6", "RS 3"], ["Audi", "S 4", "S4", "S 6"], ["Audi", "A 6 Avant", "A6", "A 4"], ["Audi", "Q 7", "Q7", "Q 5"], ["Audi", "R 8", "R8", "S 4"],
  ["BMW", "M 3", "M3", "M 5"], ["BMW", "X 5", "X5", "X 3"], ["BMW", "Z 4", "Z4", "Z 3"], ["Mazda", "RX 7", "RX-7", "RX 8"], ["Mazda", "MX 5", "MX-5", "MX 6"], ["Mercedes-Benz", "SL 500", "SL500", "SL 600"], ["Mercedes-Benz", "C 63", "C63", "C 43"], ["Mercedes-Benz", "E 55", "E55", "E 63"]];
const code = m => m.replace(/\s+(Avant)$/i, "");
const mk = (make, model, col, titleOf, n = 6) => Array.from({ length: n }, (_, i) => ({ make, model: col, title: titleOf(i), price: 80000 + i * 500, year: 2018 + (i % 5), date: "2026-0" + (1 + i) + "-10", url: "https://x/" + i }));
const run = (make, model, cards) => { const veh = { make, model, year: 2020 }; return E.runOutputInvariants({ tier: "result", poolN: cards.length, cards, rawPool: [], cluster: [70000, 90000], resolvedCar: veh }, veh).filter(c => !c.ok).map(c => c.name); };
for (const [make, model, glued, other] of TABLE) {
  const c0 = code(model), g = glued;
  const filedGlued = mk(make, model, g, i => `${2018 + i} ${make} ${g.replace("-", i % 2 ? "-" : "")}${/avant/i.test(model) ? " Avant" : ""}`);
  const filedSpaced = mk(make, model, c0, i => `${2018 + i} ${make} ${c0}`);
  const hyph = mk(make, model, c0.replace(" ", "-"), i => `${2018 + i} ${make} ${c0.replace(" ", "-")}`);
  for (const [how, cards] of [["filed glued", filedGlued], ["filed spaced", filedSpaced], ["filed hyphenated", hyph]]) { const f = run(make, model, cards); ok(`${make} ${model}: sales ${how} pass the output invariants`, !f.includes("receipts_carry_resolved_car"), f.join(",")); }
  const oc = code(other); const swapped = mk(make, model, oc.replace(" ", ""), i => `${2018 + i} ${make} ${oc.replace(" ", "")}`);
  ok(`${make} ${model}: a pool of another code's sales (${oc}) still refuses`, run(make, model, swapped).includes("receipts_carry_resolved_car"));
}
console.log(fail ? `spacedTaxonomyModelCheck: ${fail} failure(s)` : "spacedTaxonomyModelCheck: all pass");
process.exit(fail ? 1 : 0);
