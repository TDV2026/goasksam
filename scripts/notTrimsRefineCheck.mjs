// notTrimsRefineCheck (Lane B, Oct 20 2026, Lane C's shared-file check): the server's refine sanitizer (api/sellerDecision.js)
// keeps refine.notTrims, the list of named trims the "Other trims" chip is NOT, shape-checked like refine.trim. Before, it was
// dropped, so the chip read the whole pool. Offline: the sanitizer's own line is read from the file and run on sample
// inputs; then the engine's own reader (lib/onebox.js) is checked to read the same field.
import fs from "fs";
let bad = 0;
const ok = (c, m) => { if (c) console.log("ok   " + m); else { bad++; console.log("FAIL " + m); } };
const src = fs.readFileSync(new URL("../api/sellerDecision.js", import.meta.url), "utf8");
const line = src.split("\n").find(l => /^\s+notTrims: \(\(\) => \{/.test(l));
ok(!!line, "the sanitizer carries a notTrims line");
const expr = line ? line.trim().replace(/^notTrims:\s*/, "").replace(/,\s*$/, "") : "null";
const san = rawRefine => new Function("rawRefine", "return " + expr)(rawRefine);
ok(san({ notTrims: "gt,gt350" }) === "gt,gt350", "a comma list of trim words passes");
ok(san({ notTrims: ["carrera", "carrera-s"] }) === "carrera,carrera-s", "an array passes as a comma list");
ok(san({ notTrims: "gt,<script>,GT350,x y" }) === "gt", "anything not shaped like a trim word is dropped");
ok(san({}) === null && san({ notTrims: "" }) === null, "no notTrims stays null (an emptied refine is still no refine)");
ok(san({ notTrims: Array.from({ length: 20 }, (_, i) => "t" + i) }).split(",").length === 12, "at most 12 words");
const ob = fs.readFileSync(new URL("../lib/onebox.js", import.meta.url), "utf8");
ok(/String\(refine\.notTrims \|\| ""\)\.toLowerCase\(\)\.split\(","\)/.test(ob), "the engine reads refine.notTrims as the same comma list");
console.log(bad ? `notTrimsRefineCheck: ${bad} failed` : "notTrimsRefineCheck: all passed");
process.exit(bad ? 1 : 0);
