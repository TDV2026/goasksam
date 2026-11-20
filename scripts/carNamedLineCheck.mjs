// A SENTENCE THAT NAMES THE CAR EITHER NAMES IT OR IS NOT PRINTED (Lane B, lane-b-read-resilience, Nov 18 2026; Lane C's find, public/js/onebox.js line 2034). A page with no resolved car printed "When the next this car sells, Sam will email you":
// carLabel(null) answers the placeholder "this car", and the sentence put it after "the next". CLASS: every sentence in the Market Check page that puts the car's name inside a sentence ("the next {car} sells", "next sale of {car}",
// "Not enough real {car} sales"): with a car it names it, with none it is left out (or reads without the name), never the placeholder. The real functions are read out of the page code and run.
//   node scripts/carNamedLineCheck.mjs [repo root]      --mutants breaks one rule in a copy
import fs from "node:fs"; import path from "node:path"; import { spawnSync } from "node:child_process"; import { fileURLToPath } from "node:url";
const args = process.argv.slice(2), here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(args.find(a => !a.startsWith("--")) || path.join(here, ".."));
if (args.includes("--mutants")) process.exit(mutants());
let pass = 0, fail = 0; const fails = []; const ok = (n, c, d) => { if (c) pass++; else { fail++; fails.push(n + (d !== undefined ? " " + JSON.stringify(d).slice(0, 200) : "")); } };
const src = fs.readFileSync(path.join(ROOT, "public/js/onebox.js"), "utf8");
const fnSrc = name => { const i = src.search(new RegExp("function " + name + "\\s*\\(")); if (i < 0) return ""; let k = src.indexOf("{", i), d = 0; for (; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) break; } } return src.slice(i, k + 1); };
const sfn = fnSrc("samOnItHtml"), lab = fnSrc("carLabel"), named = fnSrc("carNamed");
ok("the page has samOnItHtml and carLabel", !!sfn && !!lab);
const build = (extra) => new Function("esc", "lint", "OB_WATCH_READY", "state", `var obWatchArmed = state.armed, obWatchFirst = false, obWatchAlready = false; function cap(s){return s} function lintX(){} ${lab}\n${named}\n${sfn}\nreturn samOnItHtml;`)(s => String(s), (s) => s, true, extra);
const run = (d, m, armed) => { try { return build({ armed })(d, m, false); } catch (e) { return "ERR " + e.message; } };
const car = { canonicalLabel: "1987 Pontiac Firebird", make: "Pontiac", model: "Firebird", year: 1987 };
const html = run({ resolvedCar: car }, null, null);
ok("a car: the sentence names it (When the next 1987 Pontiac Firebird sells)", /When the next 1987 Pontiac Firebird sells, Sam will email you/.test(html), html.slice(0, 160));
for (const [name, rc] of [["no resolved car (null)", null], ["an empty resolved car", {}], ["undefined", undefined]]) {
  const h = run({ resolvedCar: rc }, null, null);
  ok(`${name}: no sentence with a placeholder in it ("this car sells", "next this car")`, !/this car sells|next this car|next sale of this car/i.test(h), h.slice(0, 200));
  ok(`${name}: the sentence is not printed at all`, !/When the next/.test(h), h.slice(0, 200));
  ok(`${name}: the way to ask Sam to keep looking is still there`, /id="ob-samonit"/.test(h), h.slice(0, 200));
  const a = run({ resolvedCar: rc }, null, { label: "" });
  ok(`${name}, already armed with no label: no "next sale of this car"`, !/next sale of this car|next sale of\s*\./i.test(a), a.slice(0, 200));
}
ok("armed with a label: it names the car", /next sale of 1999 BMW M3\./.test(run({ resolvedCar: null }, null, { label: "1999 BMW M3" })));
ok("an exact car (a matched VIN) keeps its own sentence", /If this exact car comes up again/.test(run({ resolvedCar: null }, { displayName: "x" }, null)));
// the class: no sentence in the page builds a name after a word with the placeholder behind it
const bad = [...src.matchAll(/"[^"\n]*\b(?:next|the|real) "\s*\+\s*(?:esc\()?carLabel\(/g)].map(m => m[0].slice(0, 80));
ok("no sentence in the page puts carLabel (which answers 'this car' for no car) after next, the or real", bad.length === 0, bad);
console.log(`carNamedLineCheck: ${pass} pass, ${fail} FAIL` + (fail ? "\n" + fails.map(f => "  FAIL " + f).join("\n") : ""));
process.exit(fail ? 1 : 0);
function mutants() {
  const SRC = ROOT, COPY = fs.mkdtempSync(path.join(path.dirname(SRC), "goasksam-b-cnmut-"));
  spawnSync("sh", ["-c", `mkdir -p "${COPY}/public/js" "${COPY}/scripts" && cp "${SRC}/public/js/onebox.js" "${COPY}/public/js/" && cp "${SRC}/scripts/carNamedLineCheck.mjs" "${COPY}/scripts/"`]);
  const F = path.join(COPY, "public/js/onebox.js"), orig = fs.readFileSync(F, "utf8");
  const MUT = [
    ["the offer prints the placeholder again", s => s.replace("(offerName ? \"When the next \" + esc(offerName) + \" sells, Sam will email you, with the sale attached.\" : \"\")", "\"When the next \" + esc(carLabel(d.resolvedCar)) + \" sells, Sam will email you, with the sale attached.\"")],
    ["the armed line prints the placeholder again", s => s.replace("(armName ? \"Sam’s looking for the next sale of \" + esc(armName) + \".\" : \"\")", "\"Sam’s looking for the next sale of \" + esc(carLabel(d.resolvedCar)) + \".\"")],
    ["carNamed answers the placeholder", s => s.replace("function carNamed(rc) { return rc && (rc.canonicalLabel || rc.make || rc.model) ? carLabel(rc) : \"\"; }", "function carNamed(rc) { return carLabel(rc); }")],
    ["the sentence is printed with an empty name", s => s.replace("(line ? '<p>' + lint(line, \"samonit\") + '</p>' : \"\")", "'<p>' + lint(line || \"When the next  sells, Sam will email you.\", \"samonit\") + '</p>'")],
    ["the zero line says 'Not enough real this car sales'", s => s.replace("(carNamed(d.resolvedCar) ? carNamed(d.resolvedCar) + \" \" : \"\")", "carLabel(d.resolvedCar) + \" \"")]
  ];
  let bad = 0;
  for (const [name, fn] of MUT) {
    const next = fn(orig); if (next === orig) { console.log("STALE MUTANT: " + name); bad++; continue; }
    fs.writeFileSync(F, next); const r = spawnSync("node", [path.join(COPY, "scripts/carNamedLineCheck.mjs"), COPY], { encoding: "utf8" }); fs.writeFileSync(F, orig);
    console.log((r.status !== 0 ? "killed   " : "SURVIVED ") + name); if (r.status === 0) bad++;
  }
  fs.rmSync(COPY, { recursive: true, force: true }); console.log(bad ? bad + " survived" : "all " + MUT.length + " mutants killed"); return bad ? 1 : 0;
}
