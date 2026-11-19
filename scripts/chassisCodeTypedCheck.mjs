// A CHASSIS CODE IN THE TYPED WORDS IS THE RESOLVED CAR'S OWN GENERATION, NEVER A DIFFERENT MODEL (Lane B, Oct 29 2026).
// LIVE (Sam's Find card): the 2011 Porsche 997.2 Carrera GTS Cabriolet (PCarMarket, 66,685 miles) printed "No figures are shown because this car could not be checked." CAUSE: typedModelMismatch (lib/onebox.js) found the
// archive model name "997" in the title, saw that it was not the resolved model (911), and refused the answer (typed_model_mismatch), although 997 is the 911's own chassis code. The warm could not cure it: a fresh compute refused.
// CLASS: every listing whose title writes the chassis code of its own car in front of the model (997.2, 991.1, 987.2, 981...) where the archive also files cars under that code as a model. This check walks every curated generation
// (lib/generations.js), writes the title the way sellers do ("<year> <make> <code> <model>", with and without the half-generation decimal) and requires no mismatch; and a different model's number (944 on a 911, 550 Spyder) still refuses.
//   node scripts/chassisCodeTypedCheck.mjs [repo root]
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.LAUNCH_STAGE = "2";
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href), G = await import(pathToFileURL(path.join(root, "lib/generations.js")).href);
let n = 0; const bad = [];
for (const g of G.CURATED_GENERATIONS) {
  const base = String(g.code).split(".")[0]; if (!/^\d{3}$/.test(base)) continue;
  for (const code of new Set([g.code, base, base + ".2", base + ".1"])) {
    const year = Math.min(g.yearEnd, Math.max(g.yearStart, g.yearStart + 1)); n++;
    const m = E.typedModelMismatch(`${year} ${g.make} ${code} ${g.model}`, { make: g.make, model: g.model });
    if (m) bad.push(`${year} ${g.make} ${code} ${g.model} (names ${m.namesModel})`);
  }
}
ok(`no curated generation's own code, typed in front of its model, reads as a different model (${n} titles)`, bad.length === 0, bad.slice(0, 5).join(" | "));
ok("the 2011 Porsche 997.2 Carrera GTS Cabriolet is not a mismatch", E.typedModelMismatch("2011 Porsche 997.2 Carrera GTS Cabriolet", { make: "Porsche", model: "911", trim: "Carrera GTS" }) === null);
ok("a different model's number on a 911 still refuses (944, 550 Spyder)", !!E.typedModelMismatch("2011 Porsche 944 Turbo", { make: "Porsche", model: "911" }) && !!E.typedModelMismatch("2011 Porsche 550 Spyder", { make: "Porsche", model: "911" }));
console.log(fail ? `chassisCodeTypedCheck: ${fail} failure(s)` : "chassisCodeTypedCheck: all pass");
process.exit(fail ? 1 : 0);
