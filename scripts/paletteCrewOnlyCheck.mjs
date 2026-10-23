// THE PALETTE PICKER IS FOR THE CREW ONLY (Sam, Buy Stage 1c item 8a, Oct 20 2026; Lane C). Every page that carries the
// picker shows it only to a signed crew request: no tester cookie, no ?palette=1 in the address. Its removal before
// launch is a launch-checklist row. No network.
//   node scripts/paletteCrewOnlyCheck.mjs     exit 1 on any failure.
import fs from "node:fs";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const want = { "api/buy.js": 1, "api/marketCheck.js": 1, "api/tasksPage.js": 2, "api/business.js": 1, "api/home.js": 1 };
for (const [f, n] of Object.entries(want)) {
  const s = fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");
  ok((s.match(/const showPal = crew;/g) || []).length === n, `${f}: the picker shows for the crew only (${n} place${n > 1 ? "s" : ""})`);
  ok(!/showPal = [^;\n]*(isTesterRequest|palette=1)/.test(s), `${f}: no tester or ?palette=1 path to the picker`);
}
// Sam, Oct 23 2026: no Sell page carries the bar (old Sell, new Sell).
ok(!/paletteSwitcherHtml|PALETTE_SWITCHER|showPal/.test(fs.readFileSync(new URL("../api/sellPage.js", import.meta.url), "utf8").replace(/\/\/[^\n]*/g, "")) && !/paletteSwitcherHtml|PALETTE_SWITCHER/.test(fs.readFileSync(new URL("../api/sellNext.js", import.meta.url), "utf8")), "no Sell page carries the palette bar");
// No other page carries the picker.
const carriers = fs.readdirSync(new URL("../api/", import.meta.url)).filter(f => f.endsWith(".js")).filter(f => /PALETTE_SWITCHER_JS|paletteSwitcherHtml\(/.test(fs.readFileSync(new URL("../api/" + f, import.meta.url), "utf8"))).map(f => "api/" + f).sort();
ok(JSON.stringify(carriers) === JSON.stringify(Object.keys(want).sort()), `the picker is on these pages only (${carriers.join(", ")})`);
console.log(`paletteCrewOnlyCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
