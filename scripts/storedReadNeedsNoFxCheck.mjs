// A STORED MARKET CHECK READ DOES NOT WAIT FOR THE EXCHANGE-RATE TABLE, AND NOTHING THAT COMPUTES STARTS WITHOUT IT (Lane B, Oct 31 2026).
// CAUSE: api/sellerDecision.js awaited ensureFxReady (the whole fx_rates table, up to 6 s) at the top of EVERY request. A stored answer already holds its numbers; serving it (withReadFields) converts no currency, so the wait was dead time on every stored read of a fresh instance.
// WHO ELSE: every Market Check, Find card and Task read that is answered from a stored row. Live computes still need the table: they arm it themselves (oneEngineAnswer and runOneBox open with ensureFxReady), and every non-Market-Check request still waits at the handler.
// This check: (1) the handler no longer waits for the table on a Market Check request, and still does on every other; (2) both engine entries arm it first (bounded); (3) CLASS: for every answer fixture, the served answer (withReadFields) is the same whether dated rates are armed or not,
// so the lazy start can never change a stored read; (4) a sync converter on the read path would break (3), so it is caught here, not in production. Fails without the fix.
//   node scripts/storedReadNeedsNoFxCheck.mjs [repo root]
import fs from "node:fs";
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const strip = t => t.replace(/\/\/[^\n]*/g, "");
const sd = strip(fs.readFileSync("api/sellerDecision.js", "utf8")), ob = strip(fs.readFileSync("lib/onebox.js", "utf8"));
const at = sd.indexOf("ensureFxReady({ supabaseUrl, supabaseKey })"), seg = sd.slice(at - 80, at + 700);
ok("the handler starts the table's load and waits for it only when the request is not a Market Check read", /const fxLazy = !!req\.body\?\.oneBox/.test(seg) && /if \(fxLazy\) fxLoad\.catch/.test(seg) && /else try \{ await Promise\.race\(\[fxLoad/.test(seg));
ok("priceProbe and oneBoxProof keep the wait (they convert without the engine)", /!req\.body\?\.oneBoxProof && !req\.body\?\.priceProbe/.test(seg));
const oe = ob.slice(ob.indexOf("export async function oneEngineAnswer"), ob.indexOf("export async function oneEngineAnswer") + 2500);
ok("oneEngineAnswer arms the table first, bounded, before anything converts", /await Promise\.race\(\[ensureFxReady\(env\), new Promise/.test(oe) && oe.indexOf("ensureFxReady") < oe.indexOf("bandedRefine(refine)"));
ok("runOneBox still arms it (directly, or through runOneBoxCore which opens with ensureFxReady)", /export async function runOneBox\([^)]*\) \{\s*try \{ await ensureFxReady\(env\)/.test(ob) || (/export async function runOneBox\([^)]*\) \{[\s\S]{0,200}runOneBoxCore\(/.test(ob) && /async function runOneBoxCore\([^)]*\) \{\s*try \{ await ensureFxReady\(env\)/.test(ob)));
// CLASS: every stored read is the same with dated rates armed or not
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href), H = await import(pathToFileURL(path.join(root, "lib/_houseComps.js")).href), FX = await import(pathToFileURL(path.join(root, "lib/_fx.js")).href);
const dir = "scripts/fixtures", files = fs.readdirSync(dir).filter(f => /^(answer-|m3Answer)/.test(f) && f.endsWith(".json"));
const armed = FX.makeFx(new Map([["EUR", [{ month: "2020-01", rate: 1.5 }, { month: "2026-10", rate: 1.9 }]], ["GBP", [{ month: "2020-01", rate: 1.7 }, { month: "2026-10", rate: 2.1 }]], ["CHF", [{ month: "2020-01", rate: 1.6 }, { month: "2026-10", rate: 1.8 }]]]));
ok("there are answer fixtures to sweep", files.length >= 4, files.join(" "));
for (const f of files) {
  const d = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")), a = d.raw || d, car = { year: a.resolvedCar && a.resolvedCar.year || 2000 };
  H.setFxRates(null); const off = JSON.stringify(E.withReadFields(JSON.parse(JSON.stringify(a)), "x", car));
  H.setFxRates(armed); const on = JSON.stringify(E.withReadFields(JSON.parse(JSON.stringify(a)), "x", car));
  ok(`${f}: the served answer is the same with dated rates armed or not`, off === on);
}
// CLASS (static): no function the stored read reaches from withReadFields converts currency (toUsd, hammerUsd, priceDisplay, nativePrices, mileageInfo is not a converter). Walks the calls through lib/onebox.js's own functions.
{
  const fnBody = name => { const m = new RegExp("(?:export )?(?:async )?function " + name + "\\(").exec(ob); if (!m) return null; let i = ob.indexOf("{", m.index), d = 0, j = i; for (; j < ob.length; j++) { if (ob[j] === "{") d++; else if (ob[j] === "}" && --d === 0) break; } return ob.slice(m.index, j + 1); };
  const seen = new Map(), todo = ["withReadFields", "withReadFieldsInner"];
  while (todo.length) { const n = todo.pop(); if (seen.has(n)) continue; const b = fnBody(n); seen.set(n, b); if (!b) continue; for (const m of b.matchAll(/\b([A-Za-z_]\w*)\(/g)) if (!seen.has(m[1]) && fnBody(m[1])) todo.push(m[1]); }
  const conv = /\b(toUsd|hammerUsd|priceDisplay|nativePrices)\(/, bad = [...seen].filter(([n, b]) => b && conv.test(b)).map(([n]) => n);
  ok(`the ${seen.size} functions a stored read reaches convert no currency`, seen.size > 10 && bad.length === 0, bad.join(" "));
}
H.setFxRates(null);
console.log(fail ? `storedReadNeedsNoFxCheck: ${fail} failure(s)` : "storedReadNeedsNoFxCheck: all pass");
process.exit(fail ? 1 : 0);
