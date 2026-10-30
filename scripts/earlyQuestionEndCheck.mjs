// THE EARLY FIRST QUESTION MUST NOT OUTLIVE ITS ANSWER (Lane E, Oct 29 2026, review of 29bf08f0). One Box hands Sell the computing answer (onCarEarly) and Sell draws "Which state is it in?" at once. CAUSE of the fault found in review:
// when the final answer is NOT a result (a body/generation/model/trim/variant/gearbox question, a typo confirmation, a clarification, a could-not, an error), One Box draws its own screen over the question and never calls Sell's onCar, so Sell kept its early flag and stage "state" with nothing on the screen.
// The next search (a tap on that question's chip) then drew no question (stage already set) and its final answer was swallowed by the early branch of onCar, which returns true without drawing: the loading bar never cleared. Every non-result tier is affected (the question tiers on Market Check, Find's hand-off and Sell alike).
// FIX: One Box calls GAS_SELL.onEarlyEnd() when an answer ends without reaching onCar (public/js/onebox.js runPool, a try/finally with the result path excepted); Sell forgets the early question. This check runs the real client on a stub page, and reads the page for the hook on every path.
//   node scripts/earlyQuestionEndCheck.mjs
import fs from "node:fs";
import { SELL_MC_CLIENT } from "../lib/sell/sellMcClient.js";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const mk = () => { const drawn = [];
  const OBX = { esc: x => String(x), root: { set innerHTML(v) { drawn.push(String(v)); }, get innerHTML() { return drawn[drawn.length - 1] || ""; } }, inboxHtml: () => "", qscreenHtml: t => "Q:" + t, footHtml: () => "", wire() {}, renderEmpty() {}, syncRail() {} };
  const win = { OBX, GAS_SELL_CFG: {}, location: { pathname: "/sell", search: "" }, history: { replaceState() {}, pushState() {} }, addEventListener() {}, scrollTo() {} };
  const doc = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, createElement: () => ({ style: {}, appendChild() {} }), body: {}, head: { appendChild() {} } };
  new Function("window", "document", "location", "history", "URLSearchParams", "setTimeout", "fetch", SELL_MC_CLIENT)(win, doc, win.location, win.history, URLSearchParams, () => 0, () => new Promise(() => {}));
  return { sell: win.GAS_SELL, drawn }; };
const car = { year: 2004, make: "Porsche", model: "911" }, computing = { computing: true, resolvedCar: car }, result = { status: "one_box", tier: "result", resolvedCar: car };
for (const kind of ["body_choice", "generation_choice", "model_choice", "needs_clarification", "could not read", "error"]) {
  const { sell, drawn } = mk();
  sell.onCarEarly(computing, "2004 Porsche 911");                          // the early question is drawn
  if (sell.onEarlyEnd) sell.onEarlyEnd();                                  // the answer ended on One Box's own screen (never onCar)
  const again = sell.onCarEarly(computing, "2004 Porsche 911 Coupe");      // the tap on that screen's chip searches again
  const n = drawn.length;
  sell.onCar(result, "2004 Porsche 911 Coupe");
  ok(drawn.length >= 2 && /Which state/.test(drawn[drawn.length - 1]), `${kind}: after the screen, the next search shows the first question (drawn ${drawn.length}, early again ${again})`);
  ok(!/Which state/.test(drawn[0]) || drawn.length <= 3, `${kind}: never drawn more than twice`);
}
{ const { sell, drawn } = mk(); sell.onCarEarly(computing, "x"); sell.onCar(result, "x"); ok(drawn.length === 1, "a result arriving after the early question draws nothing more (unchanged)"); if (sell.onEarlyEnd) sell.onEarlyEnd(); ok(drawn.length === 1, "onEarlyEnd after a consumed early question is a no-op"); }
{ const { sell, drawn } = mk(); sell.onCarEarly(computing, "x"); sell.onEarlyEnd && sell.onEarlyEnd(); ok(typeof sell.onEarlyEnd === "function" && sell.onCar({ ...result, resolvedCar: {} }, "x") === false, "a refusal after the early question: Sell steps aside for One Box's screen"); }

// THE SWAP IS SAFE (Lane E, follow-up): a state answered while the early question was up is kept when the body question arrives, and the next search goes on to the next unanswered question.
{ const { sell, drawn } = mk(); sell.onCarEarly(computing, "2004 Porsche 911"); sell.onSubmit("Texas");
  ok(/How would you like to sell it/.test(drawn[drawn.length - 1]), "the state answered during the early question moves on to the how question");
  sell.onEarlyEnd(); const d0 = drawn.length;
  sell.onCarEarly(computing, "2004 Porsche 911 Coupe");
  ok(/How would you like to sell it/.test(drawn[drawn.length - 1]) && !drawn.slice(d0).some(x => /Which state/.test(x)), "after the body question the state is not asked again: the how question is drawn");
  sell.onCar(result, "2004 Porsche 911 Coupe"); ok(!/Which state/.test(drawn[drawn.length - 1]) && drawn.slice(d0).length === 1, "the result arriving afterwards draws nothing more"); }
{ const { sell, drawn } = mk(); sell.onCarEarly(computing, "x"); sell.onEarlyEnd(); sell.onCarEarly(computing, "x y");
  ok(/Which state/.test(drawn[drawn.length - 1]), "nothing answered before the swap: the next search asks the state question as before"); }
{ const { sell, drawn } = mk(); sell.onCarEarly(computing, "x"); sell.onSubmit("Texas"); sell.onEarlyEnd(); sell.onCar(result, "x y");
  ok(/How would you like to sell it/.test(drawn[drawn.length - 1]), "an answer carried over is used when the next answer arrives without an early question (onCar)"); }

// ANSWERS BELONG TO THEIR CAR (Oct 30 2026): a state answered for one car is never carried to a DIFFERENT car's question.
{ const vette = { year: 1967, make: "Chevrolet", model: "Corvette" };
  { const { sell, drawn } = mk(); sell.onCarEarly(computing, "2004 Porsche 911"); sell.onSubmit("Texas"); sell.onEarlyEnd(); sell.onCarEarly({ computing: true, resolvedCar: vette }, "1967 Chevrolet Corvette");
    ok(/Which state/.test(drawn[drawn.length - 1]), "an answer carried from the swap is not used for a different car: its own state question is asked"); }
  { const { sell, drawn } = mk(); sell.onCarEarly(computing, "2004 Porsche 911"); sell.onSubmit("Texas"); sell.onEarlyEnd(); sell.onCar({ status: "one_box", tier: "result", resolvedCar: vette }, "1967 Chevrolet Corvette");
    ok(/Which state/.test(drawn[drawn.length - 1]), "the same through onCar: a different car's result does not skip its state question"); }
  { const { sell, drawn } = mk(); sell.onCarEarly(computing, "2004 Porsche 911"); sell.onSubmit("Texas"); sell.onCar({ status: "one_box", tier: "result", resolvedCar: vette }, "1967 Chevrolet Corvette");
    ok(/Which state/.test(drawn[drawn.length - 1]), "an early question for one car, a different car arriving: the arriving car asks its own state question"); } }
const src = fs.readFileSync(new URL("../public/js/onebox.js", import.meta.url), "utf8"), i = src.indexOf("obAskUntilRead(payload, coldT0"), blk = src.slice(i, i + 12000);
ok(/SELL\.onEarlyEnd/.test(blk) && /finally/.test(blk) && /viaFinish/.test(blk), "One Box ends the early question on every answer that does not reach onCar (finally), and in the catch");
console.log(`earlyQuestionEndCheck: ${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0);
