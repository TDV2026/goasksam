// A REFUSAL NEVER PRINTS A "BASED ON N SALES" LINE (Lane B, Oct 29 2026, Sam's live check: the 2022 Audi RS 6 Avant said "No figures are shown because this car could not be checked." and, under it, "Based on 11 sales since November 2024.").
// CAUSE: the refusal replaced the verdict but the stored answer kept its pool lines (basisLine, windowLine ...), and the page prints whichever lines the engine sends. FIX: withReadFields (lib/onebox.js) empties the count lines of every refusal, stored or fresh.
// CLASS: every refusal kind (invariant_failed, not_a_car, thin, varied ...) on every stored stamp. This check serves each with a pool above zero and fails if any count line survives; a result keeps its lines.
//   node scripts/refusalNoCountCheck.mjs [repo root]
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
const COUNT = /\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+sales?\b|Based on/i;
const base = { poolN: 11, soldCount: 11, basisLine: "Based on 11 sales since November 2024.", windowLine: "11 sales, since November 2024.", windowWords: "since November 2024", rangeSentence: "The range is the middle of the market: a quarter of sales landed below it and a quarter above.", headlineLines: ["Manual $1 to $2, 11 sales"], optionLines: ["32 sales"], thin_sales: { answer_line: "Six sales, too few for a range.", count_line: "Six sales since June 2025.", count: 6 } };
for (const kind of ["invariant_failed", "not_a_car", "thin", "varied", "builder_car"]) {
  const out = E.withReadFields({ ...base, tier: "refusal", refusal: { kind, failedChecks: kind === "invariant_failed" ? ["receipts_carry_resolved_car"] : [], verify: "No figures are shown because this car could not be checked." } }, "2022 Audi RS 6 Avant", { year: 2022 });
  const lines = [out.basisLine, out.windowLine, out.rangeSentence, ...(out.headlineLines || []), ...(out.optionLines || []), out.thin_sales && out.thin_sales.answer_line, out.thin_sales && out.thin_sales.count_line].filter(Boolean);
  ok(`a ${kind} refusal with a pool of 11 prints no count line`, lines.length === 0 && !COUNT.test(lines.join(" ")), JSON.stringify(lines));
}
{ const out = E.withReadFields({ ...base, tier: "result", cluster: null }, "x", { year: 2022 }); ok("a result keeps its basis line", out.basisLine === base.basisLine, out.basisLine); }
console.log(fail ? `refusalNoCountCheck: ${fail} failure(s)` : "refusalNoCountCheck: all pass");
process.exit(fail ? 1 : 0);
