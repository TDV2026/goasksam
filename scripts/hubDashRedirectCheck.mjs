// A DASHED HUB ADDRESS 301s TO THE TIDY ONE (Lane C, Oct 19 2026; HELD for Sam: a redirect changes links). The old
// empty-make links (/history/-ford-falcon-sprint-v8) served a second indexable copy of the hub with its own canonical.
// A leading, trailing or doubled dash now 301s to the same page at its tidy address, before any read. No network.
//   node scripts/hubDashRedirectCheck.mjs     exit 1 on any failure.
import fs from "node:fs";
import { tidySlug } from "../api/history.js";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
ok(tidySlug("-ford-falcon-sprint-v8") === "ford-falcon-sprint-v8", "a leading dash is dropped");
ok(tidySlug("1968--ford-falcon") === "1968-ford-falcon" && tidySlug("porsche-911-") === "porsche-911", "a doubled or trailing dash is tidied");
for (const s of ["porsche-911", "1968-ford-falcon-sprint-v8", "mercedes-benz-sl"]) ok(tidySlug(s) === s, `a tidy slug is unchanged (${s})`);
ok(tidySlug("-") === "" && tidySlug("") === "", "a slug of dashes only has no tidy form (no redirect, the page 404s as before)");
const h = fs.readFileSync(new URL("../api/history.js", import.meta.url), "utf8");
const at = h.indexOf("const tidy = tidySlug(slug);");
ok(at > 0 && at < h.indexOf("if (q.go && vin)") && at < h.indexOf("return await hubPage(req, res, env, slug)"), "the redirect runs before any read");
ok(/if \(slug && tidy && tidy !== slug\) \{ res\.setHeader\("Location", `\/history\/\$\{tidy\}` \+ \(vin \? `\/\$\{vin\}` : ""\)\);[^}]*return res\.status\(301\)\.end\(\); \}/.test(h), "a 301 to the tidy address, the VIN kept");
console.log(`hubDashRedirectCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
