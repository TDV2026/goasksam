// NO CHECK PINS A PAST ENGINE STAMP (Lane C, Nov 18 2026). THE CLASS: a check that asserts "the stamp is still e99" (or "the stamp is the one of commit 60cfa555") states a fact about ONE commit ("this change did not bump the
// stamp"); it is true on that commit and false on every later one, so it goes red the day the stamp moves for a reason of its own and says nothing about the behaviour it was written for. houseSalesCountCheck (F),
// widenedLineCheck (H) and mileageBandNearCheck went red this way on Nov 18 (e103). The behaviour such a check cares about ("a row with no tag is read as no row, every other row keeps serving") is asserted by its
// neighbours against the CURRENT stamp (data/engineStamp.json, lib/onebox.js ENGINE_VERSION); the stamp itself is lifted and verified by scripts/engineStampCheck.mjs.
// This check reads every check script (comments left out) and fails on a line that tests ENGINE_VERSION against a literal stamp (e<number>-<8 digits>...). A check that needs a historical stamp as FIXTURE DATA (a stored row written under
// an old stamp) writes it as a string value, never as the thing compared with ENGINE_VERSION.   node scripts/stampPinCheck.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { repoFiles } from "./_repoWalk.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0; const fails = []; const ok = (n, c, d) => { if (c) pass++; else { fail++; fails.push(n + (d !== undefined ? " " + JSON.stringify(d).slice(0, 300) : "")); } };
const STAMP = String.raw`e\d{2,3}-(?:\d{8}-)?[a-z]*`;   // a literal stamp such as e99-, e100-20261110-oldergens, e103-20261118-nodead
const PIN = [new RegExp(String.raw`ENGINE_VERSION[^;\n]{0,120}?(?:===?|!==?)\s*["'\x60]` + STAMP), new RegExp(String.raw`["'\x60]` + STAMP + String.raw`[^;\n]{0,40}["'\x60]\s*(?:===?|!==?)\s*[A-Za-z_.]*ENGINE_VERSION`), new RegExp(String.raw`/\^?` + STAMP + String.raw`[^/\n]{0,40}/\.test\([^)\n]{0,60}ENGINE_VERSION`), new RegExp(String.raw`ENGINE_VERSION[^;\n]{0,60}\.(?:startsWith|includes)\(\s*["'\x60]` + STAMP)];
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map(l => l.replace(/(^|[^:"'\x60\\])\/\/.*$/, "$1")).join("\n");
const hits = [];
for (const rel of repoFiles(ROOT, { exts: /Check\.mjs$/ }).filter(f => f.startsWith("scripts/") && !f.includes("/", 8) && f !== "scripts/stampPinCheck.mjs")) {
  const lines = strip(fs.readFileSync(path.join(ROOT, rel), "utf8")).split("\n");
  lines.forEach((l, i) => { const joined = l + " " + (lines[i + 1] || ""); if (/ENGINE_VERSION/.test(l) && PIN.some(re => re.test(joined.length > 400 ? joined.slice(0, 400) : joined))) hits.push(rel + ":" + (i + 1)); });
}
ok("no check script tests ENGINE_VERSION against a literal stamp (" + hits.length + " found)", hits.length === 0, hits);
// the rule itself: it flags the three shapes that went red, and leaves a comparison with the stamp file and a stored fixture row alone
const flags = s => PIN.some(re => re.test(s));
ok("it flags /^e99-/.test(E.ENGINE_VERSION)", flags('/^e99-/.test(String(E.ENGINE_VERSION))'));
ok("it flags the stamp of a commit", flags('/^e100-20261110-oldergens/.test(E.ENGINE_VERSION)'));
ok("it flags an equality with a literal stamp", flags('E.ENGINE_VERSION === "e103-20261118-nodead"'));
ok("it leaves a comparison with the stamp file alone", !flags('E.ENGINE_VERSION === STAMP_FILE.stamp'));
ok("it leaves a stored fixture row written under an old stamp alone", !flags('const row = { engineVersion: "e99-20261028-trimfix", raw: 1 }; use(E.ENGINE_VERSION, row)'));
console.log(`stampPinCheck: ${pass} pass, ${fail} FAIL`); for (const f of fails) console.log("FAIL " + f);
process.exit(fail ? 1 : 0);
