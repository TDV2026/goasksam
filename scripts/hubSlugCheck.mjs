// A HUB SLUG NEVER CARRIES A LEADING OR DOUBLED DASH (Lane C, Oct 19 2026; Lane E's audit found
// /history/-ford-falcon-sprint-v8). A make that slugifies to nothing (a dash, a symbol, non-Latin text) used to give an
// empty first part. hubSlug joins only the parts that exist; the VIN-sitemap rollout gives such a car no hub and no
// sitemap entry (no proper title); no history link joins slugs without dropping an empty part. No network.
//   node scripts/hubSlugCheck.mjs     exit 1 on any failure.
import fs from "node:fs";
import { hubSlug, carSlug, slugify } from "../api/_historyData.js";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
ok(hubSlug("Porsche", "911") === "porsche-911" && hubSlug("Ford", "Falcon Sprint V8") === "ford-falcon-sprint-v8" && hubSlug("Mercedes-Benz", "SL") === "mercedes-benz-sl", "a normal hub slug is unchanged");
for (const mk of ["-", "—", "?", "フォード", "", null]) ok(!/^-|--|-$/.test(hubSlug(mk, "Ford Falcon Sprint V8")) && hubSlug(mk, "Ford Falcon Sprint V8") === "ford-falcon-sprint-v8", `a make that slugifies to nothing (${JSON.stringify(mk)}): no leading dash`);
ok(slugify("—") === "" && slugify("?") === "", "such makes do slugify to nothing (the cause)");
ok(carSlug({ year: 1968, make: "—", family: "Ford Falcon Sprint V8" }) === "1968-ford-falcon-sprint-v8", "a car slug drops the empty part too");
const h = fs.readFileSync(new URL("../api/history.js", import.meta.url), "utf8"), d = fs.readFileSync(new URL("../api/_historyData.js", import.meta.url), "utf8");
const unfiltered = s => (s.match(/\[[^\]\n]*slugify\([^\]\n]*\]\.join\("-"\)/g) || []).length + (s.match(/slugify\([^)]*\) \+ "-" \+ slugify\(/g) || []).length + (s.match(/\$\{slugify\([^}]*\)\}-\$\{slugify\(/g) || []).length;
ok(unfiltered(h) === 0 && unfiltered(d) === 0, "no history link or key joins slugs without dropping an empty part");
ok(/if \(!g\.make \|\| !slugify\(g\.make\) \|\| !saneFamily\(g\.family\)\) \{ counts\.no_proper_title\+\+; continue; \}/.test(h), "the VIN-sitemap rollout gives a make that slugifies to nothing no hub and no sitemap entry");
ok(/const raw = hubSlug\(g\.make, g\.family\), hk = hubSlug\(c\.make, c\.family\);/.test(h), "the rollout's hub keys are built by hubSlug");
console.log(`hubSlugCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
