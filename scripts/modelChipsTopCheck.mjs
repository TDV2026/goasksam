// MODEL CHIPS, NO WALL (Sam's order 3, Oct 21 2026; Lane C, the page half; Lane B folds the engine's chips): a "Which model?" question
// shows the 8 models with the most cars, 'More models' opens the rest inline, 'Any {make} (N)' stays last; every count is the engine's.
// Rendered with the page's real builders on BMW, Porsche, Mercedes-Benz and Ferrari fixtures (the folded shapes Lane B's modelfold
// sends). No network.   node scripts/modelChipsTopCheck.mjs   (from the repo root)
import fs from "node:fs";
import vm from "node:vm";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const page = fs.readFileSync(new URL("../api/buy.js", import.meta.url), "utf8");
const c = JSON.parse(/^const CLIENT = (".*");$/m.exec(page)[1]), css = JSON.parse(/^const BUY_CARD_CSS = (".*");$/m.exec(page)[1]);
const a = c.indexOf("  var MODEL_TOP"), b = c.indexOf("  // Listings that don");
const env = "function esc(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/\"/g,'&quot;'); } function num(n){ return Number(n).toLocaleString('en-US'); } function numWord(n){ return String(n); }\n" + c.slice(a, b) + "\nwindow.__ask = askHtml;";
const ctx = vm.createContext({ window: {}, Number, String, Array, Object, JSON, Math }); vm.runInContext(env, ctx);
const ask = (make, models, any) => ({ dim: "model", q: "Which model?", chips: models.map(([label, n]) => ({ label, n, patch: { model: label } })), any: { label: "Any " + make, n: any }, unstated: 0 });
const FIX = {
  BMW: ask("BMW", [["M3", 15], ["3 Series", 11], ["M5", 7], ["X5", 3], ["5 Series", 6], ["Z4", 2], ["M2", 4], ["1M", 1], ["Z3", 2], ["X3", 2], ["7 Series", 1], ["i8", 1], ["M4", 5], ["M6", 1], ["Z8", 1]], 72),
  Porsche: ask("Porsche", [["911", 23], ["Boxster", 3], ["Cayman", 4], ["928", 1], ["944", 2], ["914", 2], ["Cayenne", 2], ["356", 3], ["Macan", 1], ["Panamera", 1]], 42),
  "Mercedes-Benz": ask("Mercedes-Benz", [["SL-Class", 19], ["E-Class", 9], ["C-Class", 6], ["G-Class", 5], ["S-Class", 4], ["CLK", 3], ["190E", 2], ["300SL", 2], ["AMG GT", 3], ["SLK", 1]], 55),
  Ferrari: ask("Ferrari", [["308", 5], ["355", 4], ["F430", 6], ["Testarossa", 3], ["348", 2], ["California", 2]], 22)
};
const txt = h => h.replace(/<[^>]+>/g, "|").replace(/\|+/g, "|");
for (const [make, q] of Object.entries(FIX)) {
  const h = ctx.window.__ask(q, {}, ""), chips = [...h.matchAll(/<button[^>]*?(hidden )?[^>]*>([^<]*(?:<span class="an">[^<]*<\/span>)?)<\/button>/g)].map(m => m[0]);
  const labels = [...h.matchAll(/<button type="button" class="rchip achip[^"]*"[^>]*data-ask(?:patch|any)="[^"]*"[^>]*>([^<]*)/g)].map(m => m[1].trim());
  const sorted = q.chips.slice().sort((x, y) => y.n - x.n), top = sorted.slice(0, 8).map(x => x.label);
  if (q.chips.length > 8) {
    const body = h.slice(h.indexOf("ask-ch")), moreAt = body.indexOf("data-askmore");
    ok(/data-askmore[^>]*>More models</.test(h), make + ": 'More models' is there");
    const shown = [...body.slice(0, moreAt).matchAll(/data-askpatch="[^"]*"[^>]*>([^<]*)/g)].map(m => m[1].trim());
    ok(JSON.stringify(shown) === JSON.stringify(top.map(l => l + " ")) || JSON.stringify(shown.map(s => s.replace(/\s+\(\d+\)$/, "").trim())) === JSON.stringify(top), make + ": the 8 shown are the 8 with the most cars (" + shown.map(s => s.trim()).join(", ") + ")");
    ok((h.match(/data-askrest/g) || []).length === q.chips.length - 8 && (h.match(/<button hidden data-askrest /g) || []).length === q.chips.length - 8, make + ": the other " + (q.chips.length - 8) + " are hidden until More models opens them");
  } else {
    ok(!/data-askmore|data-askrest/.test(h), make + ": 8 or fewer models, drawn as before, no More button");
  }
  ok(new RegExp(">Any " + make.replace(/[-]/g, "\\-") + " <span class=\"an\">\\(" + q.any.n + "\\)</span></button></div>").test(h) || h.indexOf('data-askany="model"') > h.lastIndexOf("data-askpatch"), make + ": 'Any " + make + " (" + q.any.n + ")' is last");
  ok(q.chips.every(x => h.includes(">" + x.label + " <span class=\"an\">(" + x.n + ")</span>")), make + ": every model keeps its engine count");
}
ok(/\.ask-ch \[hidden\]\{display:none!important\}/.test(css), "the hidden rest is really hidden");
ok(/var am = e\.target\.closest && e\.target\.closest\("\[data-askmore\]"\); if \(am\)/.test(c) && /b\.hidden = false/.test(c), "More models opens the rest inline");
console.log(`modelChipsTopCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
