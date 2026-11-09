// Each mutation puts one hand formatted figure back into a Desk or PDF file on a scratch copy; scripts/deskFormatCheck.mjs must go red on every one. The first mutation (reportPdfV3 gets its own usd back) must also turn
// scripts/reasonWordsCheck.mjs red, which is the check Lane C holds the push on.
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { execFileSync } from "node:child_process"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const PV = "lib/desk/reportPdfV3.js";
const MUT = [
  ["reportPdfV3 gets its own usd back (the Lane C hold)", PV, s => s.replace('import { moneyWords } from "../reasonWords.js";', 'import { moneyWords } from "../reasonWords.js";\nconst usd = n => n == null ? "" : "$" + Math.round(n).toLocaleString("en-US");'), true],
  ["the query chips group digits by hand", "lib/desk/query.js", s => s.replace('"over " + moneyWords(f.price_min)', '"over $" + Number(f.price_min).toLocaleString("en-US")')],
  ["the handler chips group digits by hand", "lib/desk/handler.js", s => s.replace('"over " + moneyWords(f.price.min)', '"over $" + f.price.min.toLocaleString("en-US")')],
  ["the executor's reason builds the dollar floor by hand", "lib/desk/execute.js", s => s.replace("${moneyWords(DESK_PRICE_FLOOR)}", "$${DESK_PRICE_FLOOR.toLocaleString(\"en-US\")}")],
  ["the old report formats its counts by hand again", "lib/desk/reportPdf.js", s => s.replace('const ns = n => countNoun(n, "sale", { words: false });', 'const ns = n => `${Number(n).toLocaleString("en-US")} sales`;')],
  ["the old report prints its mileage with a typed noun", "lib/desk/reportPdf.js", s => s.replace('countNoun(miles, "mile", { words: false })} (', 'miles} miles (')],
  ["the fixture groups the mileage band by hand", "lib/desk/sheetShape.js", s => s.replace('${countNoun(miles, "mile", { words: false })},', '${miles.toLocaleString("en-US")} miles,')],
  ["the report wording joins a number to miles", "lib/desk/reportState.js", s => s.replace('countNoun(m.value, "mile", { words: false })', '`${m.value} miles`')],
  ["the PDF writer formats a number with Intl", "lib/pdf/mini.js", s => s.replace("const fx = n =>", "const fmt = n => new Intl.NumberFormat(\"en-US\").format(n);\nconst fx = n =>")],
  ["a Desk file rounds a figure to text with toFixed", "lib/desk/caseView.js", s => s.replace("const dur = sec =>", "const pctText = v => v.toFixed(1) + \"%\";\nconst dur = sec =>")]
];
function copyTree(dst) {
  for (const d of ["lib", "scripts", "public", "api", "data", "docs"]) if (fs.existsSync(path.join(ROOT, d))) fs.cpSync(path.join(ROOT, d), path.join(dst, d), { recursive: true, filter: s => !/node_modules|proofs/.test(s) });
  for (const f of ["package.json", "vercel.json"]) if (fs.existsSync(path.join(ROOT, f))) fs.copyFileSync(path.join(ROOT, f), path.join(dst, f));
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dst, "node_modules"));
}
const red = (dir, script) => { try { execFileSync("node", ["scripts/" + script, dir], { cwd: dir, stdio: "pipe", timeout: 120000 }); return false; } catch { return true; } };
let bad = 0;
for (const [i, [name, file, fn, alsoReasonWords]] of MUT.entries()) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "df-")); copyTree(dir);
  const p = path.join(dir, file), before = fs.readFileSync(p, "utf8"), after = fn(before);
  if (after === before) { console.log("FAIL  mutation did not apply: " + name); bad++; }
  else {
    fs.writeFileSync(p, after);
    const a = red(dir, "deskFormatCheck.mjs"), b = alsoReasonWords ? red(dir, "reasonWordsCheck.mjs") : true;
    console.log((a && b ? "ok  " : "FAIL") + `  [${i}] deskFormatCheck goes red${alsoReasonWords ? " and reasonWordsCheck goes red" : ""} with: ` + name + (a ? "" : "  (deskFormatCheck stayed green)") + (b ? "" : "  (reasonWordsCheck stayed green)"));
    if (!(a && b)) bad++;
  }
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`deskFormatFailsWithout: ${bad ? bad + " PROBLEM" : "every mutation is caught"}`); process.exit(bad ? 1 : 0);
