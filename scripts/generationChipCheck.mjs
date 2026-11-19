// Generation chips (Lane B, Oct 26 2026, e91): a generation chip resolves for the WHOLE generation and carries no invented year.
// For every curated model that asks which generation, each chip's query (a) holds no four-digit year and (b) when run binds
// that generation (the answer's resolved generation code is set, the question is not asked again). No database: an empty archive.
//   node scripts/generationChipCheck.mjs [repo root]
process.env.GAS_TEST_NO_QUESTION_RULE = "1";   // the only place the question rule is switched off (see scripts/noQuestionRuleCheck.mjs)
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
globalThis.fetch = async (url) => { const u = new URL(String(url)); if (u.pathname.endsWith("/sales_archive")) return new Response("[]", { status: 200 }); if (u.hostname.includes("fake.supabase")) return new Response("[]", { status: 200 }); throw new Error("offline"); };
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
const G = await import(pathToFileURL(path.join(root, "lib/generations.js")).href);
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k", noQuestionRule: true };   // the chips are read as the engine builds them; the question rule needs sales behind each option
const models = [...new Set(G.CURATED_GENERATIONS.map(g => g.make + "|" + g.model))].map(k => k.split("|"));
let asked = 0, chips = 0, bad = [];
for (const [make, model] of models) {
  const v = { make, model, trim: "", year: null, bodyStyle: null };
  const a = (await E.oneEngineAnswer(v, null, `${make} ${model}`, { ...env, asked: 0 }, null)).raw;
  if (!a || a.tier !== "generation_choice") continue;
  asked++;
  for (const o of a.generationOptions || []) {
    chips++;
    const yr = (o.query.match(/\b(18|19|20)\d{2}\b/g) || []).some(y => !String(o.label).includes(y));   // a year that is in the generation's own code ("1960-1966", "1958") is not an invented one
    const r = (await E.oneEngineAnswer(v, null, o.query, { ...env, asked: 1 }, null)).raw;
    const rc = r && r.resolvedCar || {};
    if (yr || !rc.genCode || r.tier === "generation_choice") bad.push(`${o.query} -> ${r && r.tier} gen=${rc.genCode || "none"}${yr ? " YEAR" : ""}`);
  }
}
ok(`every generation chip of ${asked} models (${chips} chips) carries no year and binds its generation`, bad.length === 0 && chips > 20, bad.slice(0, 12).join(" ; "));
process.exit(failed ? 1 : 0);
