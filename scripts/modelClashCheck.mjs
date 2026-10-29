// e100: a listing whose title names a model different from the model on its Sam line is found, by the engine's own rule, in any list of listings.
// Cause class (Sam, Oct 28): the Find fixture priced a 2003 BMW Alpina Roadster V8 under "2003 BMW Z8" and its 14 sales. The engine's rival rule (rivalFromModels) leaves a clash alone when either name holds a digit
// ("Alpina Roadster V8" has V8), so a coded clash is invisible to it. titleModelClash names every clash, plain or coded; the ops task modelclash runs it over the live specs; this check pins its reading.
//   node scripts/modelClashCheck.mjs [repo root]
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
ok("titleModelClash exists", typeof E.titleModelClash === "function");
if (typeof E.titleModelClash === "function") {
  const list = n => n.map(name => ({ name, norm: name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(), ranges: null }));
  const BMW = list(["Z8", "Alpina Roadster V8", "M3", "3 Series", "Z4", "650i", "M5"]), MCL = list(["Speedtail", "Senna", "720S"]), BUICK = list(["Regal", "Grand National", "LeSabre"]), CHEV = list(["Impala", "Impala SS", "Bel Air", "Corvette"]);
  const C = (make, model, title, l) => E.titleModelClash(make, model, title, null, l);
  const a = C("BMW", "Z8", "2003 BMW Alpina Roadster V8 with 11,000 miles", BMW);
  ok("Alpina Roadster V8 under Z8 is a clash (coded)", a && a.titleModel === "Alpina Roadster V8" && a.kind === "coded", JSON.stringify(a));
  const b = C("McLaren", "Speedtail", "2020 McLaren Senna", MCL);
  ok("a Senna under Speedtail is a clash (plain)", b && b.titleModel === "Senna" && b.kind === "plain", JSON.stringify(b));
  ok("the Z8 under Z8 is not a clash", C("BMW", "Z8", "2002 BMW Z8", BMW) === null);
  ok("an Alpina Roadster V8 under its own model is not a clash", C("BMW", "Alpina Roadster V8", "2003 BMW Alpina Roadster V8", BMW) === null);
  ok("a title that names both models is the spec's model (Bel Air Impala)", C("Chevrolet", "Impala", "1958 Chevrolet Bel Air Impala", CHEV) === null);
  ok("a longer form of the spec's own model is not a clash (Impala SS under Impala)", C("Chevrolet", "Impala", "1995 Chevrolet Impala SS", CHEV) === null);
  ok("no model in the title is no clash", C("BMW", "Z4", "2015 BMW sDrive35is", BMW) === null);
  ok("a title with no make is no clash", C("BMW", "Z8", "2003 Alpina Roadster V8", BMW) === null);
  ok("no model list is no reading", C("BMW", "Z8", "2003 BMW Alpina Roadster V8", null) === null);
}
process.exit(fail ? 1 : 0);
