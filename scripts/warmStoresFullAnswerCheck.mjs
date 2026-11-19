// THE STORED ANSWER IS THE WHOLE ANSWER (Sam, Oct 28 2026; found on the e96 warm). The warm tasks stored lib/onebox.js runOneBox(), the engine's middle: it has no question rule, no
// options guard (optionsState, optionLines, headlineLines, refineOptions), no windowLine, no emailMode, no sell fields. The page reads the stored row, so every car warmed that way came back
// without its e96 fields. A stored answer must be the one a visitor's read computes: oneEngineAnswer(). Cause: warmDemo, warmDemoCheck, warmMC and the nightly bare-nameplate script kept the
// pre-e96 call. Every other writer of a stored Market Check row (api/sellerDecision.js, lib/live/search.js, lib/sell/sellBlock.js, api/_historyData.js) already calls oneEngineAnswer.
//   For every call of writeWarmAnswer( in the repo: the engine call that feeds it, looking back from the write to the start of its function or 60 lines, is oneEngineAnswer, never runOneBox.
//   node scripts/warmStoresFullAnswerCheck.mjs
import fs from "node:fs";
import { execSync } from "node:child_process";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const files = execSync("grep -rln 'writeWarmAnswer(' api lib scripts --include=*.js --include=*.mjs", { encoding: "utf8" }).split("\n").filter(f => f && f !== "lib/live/search.js" || f === "lib/live/search.js");
let sites = 0;
for (const f of new Set(files)) {
  const L = fs.readFileSync(f, "utf8").split("\n");
  L.forEach((l, i) => {
    if (!/writeWarmAnswer\(/.test(l) || /export async function writeWarmAnswer|^import /.test(l) || /^\s*\/\//.test(l)) return;
    sites++;
    const back = L.slice(Math.max(0, i - 60), i + 1).join("\n");
    const eng = [...back.matchAll(/\b(oneEngineAnswer|runOneBox)\(/g)].map(m => m[1]);
    const last = eng[eng.length - 1];
    ok(last === "oneEngineAnswer" || (f.endsWith("sellerDecision.js") && /finishStore|slimAnswerForWire\(fr\)/.test(back)) || (f === "lib/live/search.js" && /oneEngineAnswer/.test(L.slice(Math.max(0, i - 40), i + 1).join("\n"))), `${f}:${i + 1}: the answer written to the stored row comes from oneEngineAnswer (found ${last || "no engine call"})`);
  });
}
ok(sites >= 8, "the scan found the writers (" + sites + " call sites)");
console.log(`warmStoresFullAnswerCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
