// A BUY CARD NAMES ITS BODY (Lane C, Sam's Oct 16 2026 follow-up to Lane E's 136132 find: "1965 Ford Mustang V8" was a
// hardtop's card, and typed into Market Check it read every body). For EVERY body word the shared resolver can return
// (read from lib/vehicle.js's own BODY_STYLE_WORDS / BODY_STYLE_CANONICAL, as text, so a word added there is tested here
// with no edit to this file) and every body the engine labels (lib/onebox.js BODY_LABEL):
//   1. the card's name (api/buySearch.js nameFromSpec, the function nameOf uses) contains the word;
//   2. that name, read back by the same resolver Market Check reads words with (lib/live/search.js parseQueryResolved),
//      gives the same make, model and body as the card's own spec, so Market Check scopes the same pool as the card's
//      market. (The pool's sales themselves are compared live, card by card, by scripts/buyEngineMatch.mjs.)
// No network needed (the resolver's curated fallback); exits 1 on any failure.
import fs from "node:fs";
const { nameFromSpec } = await import("../api/buySearch.js");
const { parseQueryResolved } = await import("../lib/live/search.js");
const { BODY_LABEL, detectBodyStyle } = await import("../lib/onebox.js");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL  " + m); } };
const src = fs.readFileSync(new URL("../lib/vehicle.js", import.meta.url), "utf8");
const lit = re => { const m = re.exec(src); if (!m) throw new Error("lib/vehicle.js no longer has " + re); return Function('"use strict";return (' + m[1] + ")")(); };
const WORDS = lit(/const BODY_STYLE_WORDS = (\[[^\]]*\])/), CANON = lit(/const BODY_STYLE_CANONICAL = (\{[^}]*\})/);
const resolverBodies = [...new Set(WORDS.map(w => CANON[w] || w))];
const engineBodies = Object.keys(BODY_LABEL);
const all = [...new Set([...resolverBodies, ...engineBodies])];
const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
console.log(`body words: resolver ${resolverBodies.join(", ")}; engine ${engineBodies.join(", ")}`);
for (const b of all) {
  const spec = { make: "Ford", model: "Mustang", trim: "V8", bodyStyle: b };
  const name = nameFromSpec(spec, 1965);
  ok(name && norm(name).includes(norm(b)), `"${b}": the card's name contains it (got "${name}")`);
  const r = await Promise.race([parseQueryResolved(name, null).catch(() => null), new Promise(x => setTimeout(() => x(null), 15000))]);
  const v = r && r.vehicle;
  // Market Check takes the body from the resolver's spec, else from the typed words (detectBodyStyle).
  const back = (v && v.bodyStyle) || detectBodyStyle(name);
  ok(v && norm(v.make) === "ford" && norm(v.parentModel || v.model) === "mustang", `"${b}": the name reads back as the same car (got ${v ? v.make + " " + (v.parentModel || v.model) : "nothing"})`);
  ok(norm(back) === norm(b), `"${b}": the name reads back as the same body, so Market Check scopes the card's own pool (got "${back}")`);
}
console.log(`buyNameBodyCheck: ${pass} passed, ${fail} failed (${all.length} body words)`);
process.exit(fail ? 1 : 0);
