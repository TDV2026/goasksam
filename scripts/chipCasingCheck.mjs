// EVERY CHIP LABEL PRINTS THE WAY THE MODEL IS WRITTEN (Lane B, Oct 31 2026; live "2024 BMW" offered M3, M4, M5, 8-Series, M2, X5, 7-Series and "m8").
// CAUSE: buildAskModels (lib/vehicle.js) offered a model as the record wrote it, and for a model known only by its family key it fell back to the lowercase normalised key ("m8"); no display rule sat between a source value and the page.
// WHO ELSE: every model chip of every make (the Which model question, Market Check's model_choice), and the generation, trim, body, variant and gearbox chips that carry a source value; a chip is a label, so the fix is display only: values, queries, counts, stored answers, stamp and epoch are untouched.
// FIX: lib/chipLabel.js is the one rule (chipLabel for a label, casedChips for an answer's chip lists), applied where the model chips are built and where an answer is read.
// This check: (1) the rule on the labels in the brief and the labels that must not change; (2) the model chips built from records whose model or family is lowercase, for several makes; (3) every static chip list (curated model chips, body labels) has no unset case;
// (4) an answer's chip lists are cased and nothing else about the answer changes. Fails without the fix.
//   node scripts/chipCasingCheck.mjs [repo root]
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const imp = f => import(pathToFileURL(path.join(root, f)).href);
const { chipLabel, casedChips } = await imp("lib/chipLabel.js").catch(() => ({})), V = await imp("lib/vehicle.js"), B = await imp("lib/bodyWords.js"), E = await imp("lib/onebox.js");
const BMW_I = /^i(\d|x)\d*$/i, NUM_SUFFIX = /^[a-z]{0,2}\d{2,4}(i|is|xi|ci|ti|d|e|hp|cc|ps)$/i, unsetWord = w => /[a-z]/i.test(w) && !/[A-Z]/.test(w) && !BMW_I.test(w) && !NUM_SUFFIX.test(w);
const faults = label => /[A-Z]/.test(label) ? [] : String(label).split(/[\s\-/]+/).filter(unsetWord);   // a label with no capital at all, the way "m8" arrived
ok("lib/chipLabel.js exists", typeof chipLabel === "function");
if (typeof chipLabel === "function") {
  const WANT = { m8: "M8", gt3: "GT3", rs6: "RS6", "300sl": "300SL", "e-type": "E-Type", "land cruiser": "Land Cruiser", "8-series": "8-Series", "7-series": "7-Series", x5: "X5", "bel air": "Bel Air", "e30 m3": "E30 M3", "cj-5": "CJ-5", "f-100": "F-100", ix: "iX", i3: "i3", "850i": "850i", m850i: "M850i", "325is": "325is", "20hp": "20hp", "300sel": "300SEL", i8: "i8", "vw bus": "VW Bus", "pre-a": "Pre-A" };
  for (const [a, b] of Object.entries(WANT)) ok(`"${a}" prints "${b}"`, chipLabel(a) === b, chipLabel(a));
  const SAME = ["M3", "M8", "911", "2002", "SL-Class", "GT-R", "E-Type", "Land Cruiser", "300SL", "RS6", "GT3", "8-Series", "Not sure", "Bel Air", "CLK DTM", "i3", "iX", "Model T", "F-150"];
  ok("a label that already carries its case is printed as written", SAME.every(x => chipLabel(x) === x), SAME.filter(x => chipLabel(x) !== x).join(" "));
  ok("the rule is idempotent", Object.values(WANT).every(x => chipLabel(chipLabel(x)) === chipLabel(x)));
  // (2) model chips built from records
  const mk = (make, models) => { const rows = []; for (const [m, fam, n] of models) for (let i = 0; i < n; i++) rows.push({ model: m, model_family: fam, year: 2024 }); return V.buildAskModels([], rows, make, 2024).models.map(x => x.model); };
  const cases = [["BMW", [["M3", "M3", 9], ["M4", "M4", 8], ["8-Series", "8-Series", 8], ["m8", "m8", 8], ["M8 Competition", "m8", 3], ["X5", "X5", 7]]], ["Porsche", [["gt3", "gt3", 9], ["911", "911", 9], ["rs6", "rs6", 5]]], ["Audi", [["rs6", "rs6", 9], ["A4", "A4", 8], ["300sl", "300sl", 8]]], ["Jaguar", [["e-type", "e-type", 9], ["XK120", "XK120", 8], ["land cruiser", "land cruiser", 8]]], ["Mercedes-Benz", [["300sl", "300sl", 9], ["sl-class", "sl-class", 8], ["s-class", "S-Class", 8]]]];
  for (const [make, models] of cases) { const chips = mk(make, models); ok(`${make}: the model chips carry no unset case`, chips.length > 0 && chips.every(c => faults(c).length === 0), chips.join(", ")); }
  ok("2024 BMW: m8 prints M8 and is offered once", mk("BMW", cases[0][1]).filter(c => /^m8\b/i.test(c) && c === "M8").length === 1, mk("BMW", cases[0][1]).join(", "));
  // (3) static lists
  const lists = Object.entries(V.CURATED_MODEL_CHIPS || {}).flatMap(([mkr, l]) => l.map(x => [`curated chips ${mkr}`, x])).concat(B.BODY_BUCKETS.map(b => ["body bucket", b.label]));
  const bad = lists.filter(([, x]) => faults(x).length).map(([s, x]) => `${s}: ${x}`);
  ok(`${lists.length} curated model chips and body labels carry no unset case`, lists.length > 40 && bad.length === 0, bad.join(" | "));
  // (4) an answer's chip lists
  const ans = { tier: "trim_choice", trimChips: ["gt3", "Touring"], trimOptions: [{ value: "gt3", label: "gt3", n: 4 }, { value: "touring", label: "Touring", n: 2 }], generationOptions: [{ label: "e30 m3", query: "1988 BMW e30 m3" }], bodyOptions: [{ label: "targa", value: "targa" }], modelOptions: ["m8", "X5"], samLine: "unchanged m8" };
  const out = casedChips(ans);
  ok("the answer's chip lists are cased", JSON.stringify(out.trimChips) === '["GT3","Touring"]' && out.trimOptions[0].label === "GT3" && out.generationOptions[0].label === "E30 M3" && out.bodyOptions[0].label === "Targa" && out.modelOptions[0] === "M8");
  ok("values, queries, counts and prose are untouched", out.trimOptions[0].value === "gt3" && out.trimOptions[0].n === 4 && out.generationOptions[0].query === "1988 BMW e30 m3" && out.bodyOptions[0].value === "targa" && out.samLine === "unchanged m8");
  ok("an answer with nothing to case is returned as it is", casedChips({ tier: "result", poolN: 3 }) && (() => { const x = { tier: "result", trimChips: ["GT3"] }; return casedChips(x) === x; })());
  const served = E.withReadFields({ ...ans }, "x", { year: 2024 });
  ok("a read of an answer prints the cased labels", served && served.trimChips && served.trimChips[0] === "GT3" && (served.trimOptions || [])[0].label === "GT3", JSON.stringify(served && served.trimChips));
}
console.log(fail ? `chipCasingCheck: ${fail} failure(s)` : "chipCasingCheck: all pass");
process.exit(fail ? 1 : 0);
