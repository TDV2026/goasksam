// NO SELL STEP LEAVES THE READER LOOKING AT NOTHING (Lane B, Oct 29 2026, Sam's live 2004 Porsche 911 at 7:40 AM and 5:25 AM Pacific: the first Sell question took "an age").
// CAUSE (from the production logs, task cache_decision on /api/sellerDecision: 5:21:28 "MCWARM Porsche 911 2004 996" no_row, stored 11 seconds later; 7:42:15 no_row again, still no_row 11 seconds later): the bare 2004 Porsche 911 answer was not stored, so the engine read it cold.
// The Sell page (lib/sell/sellMcClient.js) drew its first question ("Which state is it in?") only when public/js/onebox.js called GAS_SELL.onCar with the WHOLE Market Check answer, so the question waited for the read: the engine's 8 second hand-off, then a poll every 2 seconds,
// for up to the engine's wait (85 seconds). The state question needs only the named car, and the engine's "computing" answer already carries it (resolvedCar).
// FIX: One Box calls GAS_SELL.onCarEarly with the computing answer; Sell draws the first question at once (the loading bar goes away under it), and the answer arriving later does not draw it again (onCar). The later steps (how, how quickly) are questions that need no read; the result
// step already has its own engine hand-off wait (lib/sell/sellBlock.js) and says "Reading the sales" while it waits.
// This check runs the real client script on a stub page: (1) the computing answer draws the first question; (2) the final answer afterwards draws nothing more and keeps the question; (3) a computing answer with no car draws nothing; (4) the page hands every computing answer to Sell.
//   node scripts/firstQuestionNowCheck.mjs [repo root]
import fs from "node:fs";
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const M = await import(pathToFileURL(path.join(root, "lib/sell/sellMcClient.js")).href);
const mk = () => {
  const drawn = [];
  const root_ = { set innerHTML(v) { drawn.push(String(v)); }, get innerHTML() { return drawn[drawn.length - 1] || ""; } };
  const OBX = { esc: x => String(x), chipHtml: () => "", root: root_, inboxHtml: () => "", qscreenHtml: (t) => "Q:" + t, footHtml: () => "", wire() {}, renderEmpty() {}, syncRail() {} };
  const win = { OBX, GAS_SELL_CFG: {}, location: { pathname: "/sell", search: "" }, history: { replaceState() {}, pushState() {} }, addEventListener() {}, scrollTo() {} };
  const doc = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, createElement: () => ({ style: {}, appendChild() {} }), body: {}, head: { appendChild() {} } };
  const fn = new Function("window", "document", "location", "history", "URLSearchParams", "setTimeout", "fetch", M.SELL_MC_CLIENT);
  fn(win, doc, win.location, win.history, URLSearchParams, () => 0, () => new Promise(() => {}));
  return { sell: win.GAS_SELL, drawn };
};
const stub = { status: "one_box", tier: "unavailable", computing: true, resolvedCar: { year: 2004, make: "Porsche", model: "911" }, samLine: "Sam is reading the sales for this one." };
{ const { sell, drawn } = mk();
  ok("the client has an early hook (onCarEarly)", typeof sell.onCarEarly === "function");
  const r = sell.onCarEarly ? sell.onCarEarly(stub, "2004 Porsche 911") : false;
  ok("the computing answer draws the first question at once", r === true && drawn.length === 1 && /Which state is it in/.test(drawn[0]), drawn[0]);
  const again = sell.onCarEarly ? sell.onCarEarly(stub, "2004 Porsche 911") : false;
  ok("every later poll draws nothing more", again === false && drawn.length === 1, String(drawn.length));
  const fin = sell.onCar({ status: "one_box", tier: "result", resolvedCar: { year: 2004, make: "Porsche", model: "911" } }, "2004 Porsche 911");
  ok("the answer arriving afterwards keeps the question and draws nothing", fin === true && drawn.length === 1, String(drawn.length)); }
{ const { sell, drawn } = mk(); const r = sell.onCarEarly ? sell.onCarEarly({ ...stub, resolvedCar: {} }, "x") : false; ok("a computing answer that names no car draws nothing", !r && drawn.length === 0); }
{ const src = fs.readFileSync("public/js/onebox.js", "utf8"); ok("the page hands each computing answer to Sell (onCarEarly)", /obAskUntilRead\(payload, coldT0, function \(cd\) \{[^}]*SELL\.onCarEarly\(cd, text\)/.test(src)); }
console.log(fail ? `firstQuestionNowCheck: ${fail} failure(s)` : "firstQuestionNowCheck: all pass");
process.exit(fail ? 1 : 0);
