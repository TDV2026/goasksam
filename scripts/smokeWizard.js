// Wizard-level production smoke tests: runs the real index.html wizard logic
// in Node with a stubbed DOM against the LIVE APIs. Asserts the global
// invariants inside clarification sub-states, where they once silently failed:
// off-script input must reach the chat layer from any state, and repeated
// failed input must never produce the same message twice.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.SMOKE_BASE_URL || "https://goasksam.vercel.app";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(repoRoot, "index.html"), "utf8");
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];

const elemStub = () => new Proxy(function () {}, {
  get: (t, p) => {
    if (p === "style") return {};
    if (p === "classList") return { add() {}, remove() {}, toggle() {} };
    if (["value", "innerHTML", "textContent", "id", "className"].includes(p)) return "";
    if (["scrollTop", "scrollHeight", "offsetHeight", "clientHeight"].includes(p)) return 0;
    if (p === Symbol.toPrimitive) return () => "";
    return typeof t[p] !== "undefined" ? t[p] : elemStub();
  },
  set: () => true,
  apply: () => elemStub()
});
const documentStub = {
  getElementById: () => elemStub(), createElement: () => elemStub(),
  querySelector: () => elemStub(), querySelectorAll: () => [],
  addEventListener() {}, body: elemStub(), documentElement: elemStub(), head: elemStub()
};
const windowStub = {
  addEventListener() {}, location: { search: "", hostname: "smoke", href: "" },
  matchMedia: () => ({ matches: false, addEventListener() {} }), innerWidth: 1200, scrollTo() {}
};
const prodFetch = (url, opts) => fetch(String(url).startsWith("http") ? url : `${BASE}${url}`, opts);

const prelude = `const __samLog=[];\n`;
const patched = script.replace(
  /function addMsg\(/,
  "function addMsg(...__a){__samLog.push(__a);return __addMsgReal(...__a)}\nfunction __addMsgReal("
);
const exportTail = `;globalThis.__t={handleSellStep,sellState,addMsgLog:__samLog,SELL_SYS,SELL_STEP_QUESTIONS,remainingWizardQuestions,localPreRoute};`;
const fn = new Function("document", "window", "fetch", "localStorage", "navigator", "location", "MutationObserver", "IntersectionObserver", "requestAnimationFrame", prelude + patched + exportTail);
fn(documentStub, windowStub, prodFetch, { getItem: () => null, setItem() {}, removeItem() {} }, { userAgent: "smoke", clipboard: {} }, { search: "", hostname: "smoke", href: "", pathname: "/" }, class { observe() {} disconnect() {} }, class { observe() {} disconnect() {} }, cb => cb && cb(0));

const { handleSellStep, sellState, addMsgLog, SELL_SYS, remainingWizardQuestions, localPreRoute } = globalThis.__t;
const samMessages = () => addMsgLog.filter(a => a[0] === "sam").map(a => String(a[1]));
const lastSam = () => samMessages().at(-1) || null;
let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  [wizard] ${name}${ok ? "" : "  ->  " + detail}`);
  if (!ok) failures++;
};

function resetToStep1() {
  sellState.active = true; sellState.step = 1;
  sellState.carName = null; sellState.carRaw = null;
  sellState.pendingVehicleIdentity = null; sellState.vehicleIdentityValidated = false;
  sellState.lastVehicleAsk = null; sellState.vehicleClarifyRepeats = 0;
  sellState.notSureRepeats = 0; sellState.involvement = null;
  sellState.vehicleDetailSkipped = false; sellState.demandRepeats = 0;
  addMsgLog.length = 0;
}

// 1. Step-1 invariants (regression guard)
resetToStep1();
check("step 1: off-script input routes to chat", (await handleSellStep("after i give you this what will happen")) === false);
resetToStep1();
await handleSellStep("2018 911 Carrera GTS");
check("step 1: make inference advances wizard", sellState.step === 11 && /Porsche/.test(sellState.carName || ""), `step=${sellState.step} car=${sellState.carName}`);

// 2. Enter a clarification sub-state, then assert the invariants INSIDE it.
resetToStep1();
await handleSellStep("2018 porsche something weird xyzzy");
check("sub-state: clarification opened", sellState.step === 17 && !!sellState.pendingVehicleIdentity, `step=${sellState.step}`);

const inSubState = sellState.step === 17;
if (inSubState) {
  // Off-script question from inside the sub-state must route to chat.
  const routed = await handleSellStep("how long will this take");
  check("sub-state: question routes to chat layer", routed === false, "handled=" + routed);
  const routed2 = await handleSellStep("but you never told me how long");
  check("sub-state: conversational follow-up routes to chat too", routed2 === false, "handled=" + routed2);

  // Repeated failed input must escalate with different wording every time.
  const before = samMessages().length;
  await handleSellStep("2018 porsche fnord blorp");
  await handleSellStep("2018 porsche fnord blorp");
  await handleSellStep("2018 porsche fnord blorp");
  const asks = samMessages().slice(before);
  const consecutiveRepeat = asks.some((msg, i) => i > 0 && msg === asks[i - 1]);
  check("sub-state: repeated failure never repeats the same message", asks.length >= 3 && !consecutiveRepeat, JSON.stringify(asks));

  // Repeated "not sure" escalates and finally proceeds broad instead of looping.
  const beforeNs = samMessages().length;
  await handleSellStep("not sure");
  await handleSellStep("not sure");
  await handleSellStep("not sure");
  const nsAsks = samMessages().slice(beforeNs);
  const nsRepeat = nsAsks.some((msg, i) => i > 0 && msg === nsAsks[i - 1]);
  check("sub-state: repeated 'not sure' escalates without repeating", nsAsks.length >= 3 && !nsRepeat, JSON.stringify(nsAsks));
  check("sub-state: third 'not sure' proceeds at make level", sellState.step === 11, `step=${sellState.step} last="${lastSam()}"`);
}

// 3. Chip-step invariants: questions route to chat and are NEVER stored.
resetToStep1();
sellState.step = 4; // Service records step
sellState.carName = "2018 Porsche 911 Carrera"; sellState.region = "US"; sellState.state = "California";
sellState.mileage = "24k"; sellState.condition = "Completely stock"; sellState.records = null;
const chipQ = await handleSellStep("how many more questions");
check("chip step: off-script question routes to chat", chipQ === false, "handled=" + chipQ);
check("chip step: question NOT stored as field value", sellState.records === null, `records=${JSON.stringify(sellState.records)}`);
check("chip step: step did not advance", sellState.step === 4, `step=${sellState.step}`);

// Content assertion: the chat layer answers with the actual remaining count.
const remaining = remainingWizardQuestions();
const chatRes = await prodFetch("/api/chat", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    messages: [{ role: "user", content: "how many more questions" }],
    system: SELL_SYS,
    context: `Current sell state: {"car":"2018 Porsche 911 Carrera","step":4}\nNext question: Service records?\nQuestions remaining after the current one: ${remaining}. If asked how many questions are left, use this exact number.`
  })
});
const chatBody = await chatRes.json();
const chatText = String(chatBody.text || "");
check("chip step: chat answer contains a count", new RegExp(`\\b(${remaining}|two|three|four|five|six)\\b`, "i").test(chatText), `remaining=${remaining} text="${chatText.slice(0, 160)}"`);

// A recognized answer still stores and advances.
await handleSellStep("Some records");
check("chip step: real answer stores and advances", sellState.records === "Some records" && sellState.step === 5, `records=${JSON.stringify(sellState.records)} step=${sellState.step}`);

// 4. Partial state accumulates: make+model accepted, only the year asked, and
// the year answer completes the car (the vw camper van transcript).
resetToStep1();
await handleSellStep("vw camper van");
check("partial: camper van resolves make+model, asks year only", sellState.step === 17 && /year/i.test(lastSam() || "") && /Volkswagen Bus/.test(sellState.pendingVehicleIdentity?.baseVehicle || ""), `step=${sellState.step} base=${sellState.pendingVehicleIdentity?.baseVehicle} ask="${lastSam()}"`);
await handleSellStep("1965");
check("partial: bare year completes the car, nothing re-asked", sellState.step === 11 && /1965 Volkswagen Bus/.test(sellState.carName || ""), `step=${sellState.step} car=${sellState.carName} last="${lastSam()}"`);

// 5. Explicit move-on always advances at the level known.
resetToStep1();
await handleSellStep("2018 porsche 911");
const atTrim = sellState.step === 17;
check("move-on: trim question opened", atTrim, `step=${sellState.step} last="${lastSam()}"`);
if (atTrim) {
  await handleSellStep("dont know");
  check("move-on: dont know proceeds broad with clean car name", sellState.step === 11 && sellState.carName === "2018 Porsche 911" && sellState.vehicleDetailSkipped === true, `step=${sellState.step} car=${JSON.stringify(sellState.carName)} last="${lastSam()}"`);
}
// Explicit move-on advances from the clarification sub-state too.
resetToStep1();
await handleSellStep("vw camper van");
if (sellState.step === 17) {
  await handleSellStep("lets move on");
  check("move-on: explicit move on advances from clarification", sellState.step === 11 && /Volkswagen Bus/.test(sellState.carName || ""), `step=${sellState.step} car=${sellState.carName} last="${lastSam()}"`);
}

// 6. The fallback demand line can never render twice in a row.
resetToStep1();
sellState.step = 17;
sellState.pendingVehicleIdentity = { type: "model", ask: "x", chips: [], suggestion: null, baseVehicle: null };
const beforeDemand = samMessages().length;
await handleSellStep("zzz qqq");
await handleSellStep("zzz qqq");
const demands = samMessages().slice(beforeDemand);
check("fallback demand: never identical twice in a row", demands.length >= 2 && demands[0] !== demands[1], JSON.stringify(demands));

// 7. EVERY declared wizard state through the shared pipeline: questions route
// to chat and store nothing; refusals normalize; real answers store.
const PIPELINE_STEPS = {
  2: { answer: "Under 30k", field: "mileage" },
  3: { answer: "Completely stock", field: "condition" },
  4: { answer: "Some records", field: "records" },
  5: { answer: "Clean title", field: "title" },
  6: { answer: "90000", field: "price" },
  7: { answer: "Within a month", field: "timeline" },
  9: { answer: "fresh paint last year", field: "notes" },
  11: { answer: "US", field: "region" },
  18: { answer: "California", field: "state" }
};
for (const [stepStr, cfg] of Object.entries(PIPELINE_STEPS)) {
  const step = Number(stepStr);
  resetToStep1();
  sellState.step = step; sellState.carName = "2018 Porsche 911"; if (step === 18) sellState.region = "US";
  sellState[cfg.field] = null;
  const routed = await handleSellStep("whats the point of this question");
  check(`pipeline step ${step}: question routes to chat`, routed === false, `handled=${routed}`);
  check(`pipeline step ${step}: question never stored`, sellState[cfg.field] === null, `${cfg.field}=${JSON.stringify(sellState[cfg.field])}`);
  if (step !== 11) {
    sellState.step = step;
    await handleSellStep("no idea");
    check(`pipeline step ${step}: refusal normalized`, [null, "Not sure", "Not set"].includes(sellState[cfg.field]), `${cfg.field}=${JSON.stringify(sellState[cfg.field])}`);
  }
  sellState.step = step; sellState[cfg.field] = null;
  await handleSellStep(cfg.answer);
  check(`pipeline step ${step}: real answer stores`, sellState[cfg.field] !== null && !/whats the point/i.test(String(sellState[cfg.field])), `${cfg.field}=${JSON.stringify(sellState[cfg.field])}`);
}

// 8. Confirmation affirmation: "yeh" accepts the cleaned corrected suggestion.
resetToStep1();
await handleSellStep("sell my porche 9111 turbo from 2007");
check("confirm: suggestion is fully cleaned and corrected", sellState.pendingVehicleIdentity?.suggestion === "2007 Porsche 911 Turbo", `suggestion=${JSON.stringify(sellState.pendingVehicleIdentity?.suggestion)}`);
await handleSellStep("yeh");
check("confirm: 'yeh' accepts and Porsche persists", /2007 Porsche 911 Turbo/.test(sellState.carName || "") && !/yeh/i.test(sellState.carName || "") && sellState.step === 11, `car=${JSON.stringify(sellState.carName)} step=${sellState.step}`);

// 9. Entry state has the pipeline too: vehicle text starts the wizard, and
// unmatched input probes the resolver instead of a canned fallthrough.
sellState.active=false;sellState.step=0;
check("entry: vehicle text triggers the wizard", !!localPreRoute("e46 m3").sellTrigger, JSON.stringify(localPreRoute("e46 m3")));
check("entry: unmatched input probes instead of canned reply", !!localPreRoute("is this site legit").entryProbe, JSON.stringify(localPreRoute("is this site legit")));

console.log(`\n${failures === 0 ? "WIZARD ALL PASS" : failures + " FAILURE(S)"}`);
process.exit(failures === 0 ? 0 : 1);
