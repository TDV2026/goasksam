// modelFoldCheck (Lane B, Oct 21 2026, Sam's Buy 1f item 3: a plain "BMW" search shows duplicate model chips): offline, no network.
// A generation or chassis code folds into its model: one chip per model with the summed count, the chips add up to the cars, models
// without codes are untouched, and the generation question stays behind the model choice (askRule asks it only with a model set).
globalThis.fetch = async () => { throw new Error("blocked"); };
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const { partitionModels, foldModelLabel } = await import("../lib/live/samChat.js");
const { askRule } = await import("../lib/live/narrow.js");
let bad = 0;
const ok = (c, m) => { console.log((c ? "ok   " : "FAIL ") + m); if (!c) bad++; };
const rowsOf = (make, spec) => spec.flatMap(([model, n]) => Array.from({ length: n }, (_, i) => ({ id: `${model}-${i}`, make, model })));
const chipOf = (res, label) => res.chips.find(c => c.label === label);
const total = res => res.chips.reduce((a, c) => a + c.n, 0) + res.unread;
// BMW: Sam's own list
const bmwSpec = [["M3", 6], ["M3 (E90/E92/E93)", 5], ["E30 M3", 2], ["G80 M3", 1], ["M3 (G80)", 1], ["3-Series", 14], ["M5", 7], ["X5", 5], ["Z4", 3], ["M3 CSL", 2], ["Z3", 4]];
const bmw = partitionModels(rowsOf("BMW", bmwSpec), null);
ok(chipOf(bmw, "M3") && chipOf(bmw, "M3").n === 15, `BMW: one M3 chip with the summed count (${chipOf(bmw, "M3") && chipOf(bmw, "M3").n})`);
ok(bmw.chips.filter(c => /^m3$/i.test(c.label)).length === 1 && !bmw.chips.some(c => /\(|^E30|^G80/.test(c.label)), "BMW: no duplicate M3 chip, no code in any label");
ok(total(bmw) === bmwSpec.reduce((a, [, n]) => a + n, 0), `BMW: the chips add up to the cars (${total(bmw)})`);
ok(chipOf(bmw, "M3 CSL").n === 2 && chipOf(bmw, "3-Series").n === 14 && chipOf(bmw, "M5").n === 7, "BMW: other models keep their own chips and counts (M3 CSL, 3-Series, M5)");
// Porsche: 996/997/991/992 fold into 911 (parentModelOf), codes in brackets too
const por = partitionModels(rowsOf("Porsche", [["911", 40], ["996", 6], ["997", 9], ["991", 11], ["992", 7], ["991.1", 2], ["911 (993)", 3], ["Cayenne", 12], ["Boxster", 8], ["356", 5]]), null);
ok(chipOf(por, "911") && chipOf(por, "911").n === 78 && !por.chips.some(c => /^(996|997|991|992|991\.1|993)$/.test(c.label)), `Porsche: the 911 chips fold into one 911 (${chipOf(por, "911") && chipOf(por, "911").n})`);
ok(chipOf(por, "Cayenne").n === 12 && chipOf(por, "356").n === 5, "Porsche: other models untouched");
// Mercedes-Benz
const mb = partitionModels(rowsOf("Mercedes-Benz", [["SL-Class", 10], ["SL-Class (R107)", 4], ["E-Class (W124)", 6], ["W124 E-Class", 2], ["E-Class", 5], ["G-Class", 8], ["300SL", 3]]), null);
ok(chipOf(mb, "SL-Class").n === 14 && chipOf(mb, "E-Class").n === 13 && chipOf(mb, "G-Class").n === 8 && chipOf(mb, "300SL").n === 3, "Mercedes-Benz: SL-Class 14, E-Class 13 fold; G-Class and 300SL untouched");
// Ferrari: nothing to fold; names with a real word or a year in brackets stay
const fer = partitionModels(rowsOf("Ferrari", [["308 GTB", 7], ["250 GT (Lusso)", 3], ["F40", 4], ["Testarossa", 6], ["Dino 246 GT (1969)", 2], ["355", 5]]), null);
ok(["308 GTB", "250 GT (Lusso)", "F40", "Testarossa", "Dino 246 GT (1969)", "355"].every(l => chipOf(fer, l)), "Ferrari: no label changes (a word or a year in brackets stays; F40 stays)");
ok(foldModelLabel("BMW", "E30 M3") === "M3" && foldModelLabel("BMW", "M3 (G80)") === "M3" && foldModelLabel("BMW", "G80 M3") === "M3" && foldModelLabel("BMW", "G63") === "G63" && foldModelLabel("Ferrari", "F40 LM") === "F40 LM", "foldModelLabel: codes out, real names kept (G63, F40 LM)");
// the generation question comes only after a model is chosen
const xs = Array.from({ length: 30 }, (_, i) => ({ id: i }));
const gens = [{ code: "E30", from: 1986, to: 1991 }, { code: "E36", from: 1992, to: 1999 }, { code: "E46", from: 2000, to: 2006 }];
const noModel = askRule(xs.map((x, i) => ({ ...x, year: 1990 + (i % 16), facts: { body: "coupe" } })), { p: {}, v: { make: "BMW", model: null }, gens, models: bmw.chips });
ok(!noModel.some(q => q.dim === "generation"), "a make-only search never asks the generation question (only the model one)");
console.log(bad ? `modelFoldCheck: ${bad} failed` : "modelFoldCheck: all passed");
process.exit(bad ? 1 : 0);
