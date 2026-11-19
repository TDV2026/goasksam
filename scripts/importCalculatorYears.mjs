// Regenerates data/calculatorModelYears.json from the Daily Vroom import calculator repo (a sibling checkout: ../dailyvroom-calculator/index.html, const CAR_MODELS).
//   node scripts/importCalculatorYears.mjs [path to the calculator's index.html]
import fs from "node:fs"; import path from "node:path"; import { execSync } from "node:child_process";
const src = path.resolve(process.argv[2] || path.join(process.cwd(), "../dailyvroom-calculator/index.html"));
const html = fs.readFileSync(src, "utf8");
const i = html.indexOf("const CAR_MODELS={"); if (i < 0) throw new Error("CAR_MODELS not found in " + src);
let depth = 0, j = i + "const CAR_MODELS=".length; const start = j;
for (; j < html.length; j++) { if (html[j] === "{") depth++; else if (html[j] === "}") { depth--; if (depth === 0) break; } }
const makes = Function("return " + html.slice(start, j + 1))();
let commit = ""; try { commit = execSync("git -C " + JSON.stringify(path.dirname(src)) + " rev-parse --short HEAD", { encoding: "utf8" }).trim(); } catch {}
fs.writeFileSync(path.join(process.cwd(), "data/calculatorModelYears.json"), JSON.stringify({ source: "dailyvroom-calculator index.html CAR_MODELS" + (commit ? " (commit " + commit + ")" : ""), note: "[model, firstYear, lastYear] per make; fills production years the taxonomy lacks", makes }));
console.log("makes", Object.keys(makes).length, "models", Object.values(makes).reduce((t, v) => t + v.length, 0));
