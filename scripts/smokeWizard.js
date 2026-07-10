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
// The frontend script lives in js/ modules loaded by index.html in order;
// concatenating them in that order reproduces the exact browser script.
const html = fs.readFileSync(path.join(repoRoot, "index.html"), "utf8");
const moduleFiles = [...html.matchAll(/<script src="(js\/[^"]+)"><\/script>/g)].map(m => m[1]);
if (!moduleFiles.length) throw new Error("no js module script tags found in index.html");
const script = moduleFiles.map(file => fs.readFileSync(path.join(repoRoot, file), "utf8")).join("\n");

const appendedHTML = [];
const elemStub = () => new Proxy(function () {}, {
  get: (t, p) => {
    if (p === "style") return {};
    if (p === "classList") return { add() {}, remove() {}, toggle() {} };
    if (["value", "textContent", "id", "className"].includes(p)) return "";
    if (p === "innerHTML") return t.__html || "";
    if (["scrollTop", "scrollHeight", "offsetHeight", "clientHeight"].includes(p)) return 0;
    if (p === "appendChild") return x => { if (x && x.__html !== undefined) appendedHTML.push(x.__html); return elemStub(); };
    if (p === "scrollIntoView" || p === "remove") return () => elemStub();
    if (p === Symbol.toPrimitive) return () => "";
    return typeof t[p] !== "undefined" ? t[p] : elemStub();
  },
  set: (t, p, v) => { if (p === "innerHTML") t.__html = v; return true; },
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
const exportTail = `;globalThis.__t={handleSellStep,sellState,addMsgLog:__samLog,SELL_SYS,SELL_STEP_QUESTIONS,remainingWizardQuestions,localPreRoute,askNextSellQuestion,showSellRecommendation,handleSellRecommendationFollowup,editCarName};`;
const fn = new Function("document", "window", "fetch", "localStorage", "navigator", "location", "MutationObserver", "IntersectionObserver", "requestAnimationFrame", prelude + patched + exportTail);
fn(documentStub, windowStub, prodFetch, { getItem: () => null, setItem() {}, removeItem() {} }, { userAgent: "smoke", clipboard: {} }, { search: "", hostname: "smoke", href: "", pathname: "/" }, class { observe() {} disconnect() {} }, class { observe() {} disconnect() {} }, cb => cb && cb(0));

const { handleSellStep, sellState, addMsgLog, SELL_SYS, remainingWizardQuestions, localPreRoute , askNextSellQuestion, showSellRecommendation, handleSellRecommendationFollowup, editCarName } = globalThis.__t;
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
  sellState.mileage = null; sellState.resolvedVehicle = null; sellState.trimAskAttempts = 0;
  sellState.region = null; sellState.state = null; sellState.condition = null; sellState.records = null;
  sellState.title = null; sellState.price = null; sellState.timeline = null; sellState.notes = null;
  sellState.returnToConfirm = false;
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

// 5. Trim step and its escalation contract: the trim question always runs
// before location for a trim-less 911; "dont know" gets a chat explanation
// (not a silent skip); the re-ask offers a Skip chip; three attempts max.
resetToStep1();
await handleSellStep("2018 porsche 911");
const atTrim = sellState.step === 17;
check("trim: asked before location for a model with no trim", atTrim && /which 911/i.test(lastSam() || ""), `step=${sellState.step} last="${lastSam()}"`);
if (atTrim) {
  const routed = await handleSellStep("dont know");
  check("trim: 'dont know' routes to chat for a real answer", routed === false, `returned=${routed}`);
  askNextSellQuestion(); // simulate the chat handback re-ask
  const reAskChips = String(addMsgLog.at(-1)?.[3] || "");
  check("trim: Skip chip appears on the second ask", /skip this step/i.test(reAskChips), `chips="${reAskChips.slice(0, 160)}"`);
  await handleSellStep("Skip this step");
  check("trim: Skip advances straight to location", sellState.step === 11 && sellState.vehicleDetailSkipped === true, `step=${sellState.step} last="${lastSam()}"`);
}
// Retry cap: after 3 rendered attempts the wizard advances by itself.
resetToStep1();
await handleSellStep("2018 porsche 911");
if (sellState.step === 17) {
  askNextSellQuestion(); // attempt 2
  askNextSellQuestion(); // attempt 3
  askNextSellQuestion(); // would be attempt 4: must auto-advance instead
  check("trim: auto-advance after 3 attempts, no fourth ask", sellState.step === 11 && /where is the car located/i.test(lastSam() || ""), `step=${sellState.step} last="${lastSam()}"`);
}
// Explicit move-on advances from the clarification sub-state too.
resetToStep1();
await handleSellStep("vw camper van");
if (sellState.step === 17) {
  await handleSellStep("lets move on");
  check("move-on: explicit move on advances from clarification", sellState.step === 11 && /Volkswagen Bus/.test(sellState.carName || ""), `step=${sellState.step} car=${sellState.carName} last="${lastSam()}"`);
}

// 5b. Entry partials, decades and personalized examples (locked behaviors).
// Cold partial "2018 pors": typo-confirm, then "carrera 30k miles" seeds
// trim AND mileage; neither is ever re-asked.
resetToStep1();
await handleSellStep("2018 pors");
check("partial entry: 2018 pors gets a typo confirm", /did you mean porsche/i.test(lastSam() || ""), `last="${lastSam()}"`);
await handleSellStep("2018 Porsche");
check("partial entry: confirm lands on the model question", sellState.step === 17 && /which model/i.test(lastSam() || ""), `step=${sellState.step} last="${lastSam()}"`);
await handleSellStep("carrera 30k miles");
check("partial entry: carrera 30k seeds trim and mileage, no re-ask",
  /911 Carrera/.test(sellState.carName || "") && /30,000/.test(sellState.mileage || "") && sellState.step === 11,
  `car=${sellState.carName} mileage=${sellState.mileage} step=${sellState.step}`);
await handleSellStep("US");
await handleSellStep("California");
check("partial entry: mileage step skipped, condition asked next", /stock or modified/i.test(lastSam() || ""), `last="${lastSam()}"`);

// Decade at the vehicle step: year range stored, no year re-ask.
resetToStep1();
await handleSellStep("vw camper van from the 80s");
check("decade: 80s Bus resolves with a year range, no year ask",
  sellState.step === 11 && /Volkswagen Bus/.test(sellState.carName || "") &&
  sellState.resolvedVehicle?.yearRange?.start === 1980 && sellState.resolvedVehicle?.yearRange?.end === 1989,
  `step=${sellState.step} car=${sellState.carName} range=${JSON.stringify(sellState.resolvedVehicle?.yearRange || null)}`);

// Year re-ask example is the user's own car; go-with carrying the car
// completes it (decade counts as the year).
resetToStep1();
await handleSellStep("vw camper van");
await handleSellStep("Not sure");
await handleSellStep("zzz unknown");
const yearReAsk = lastSam() || "";
check("year re-ask: example is their car, never someone else's",
  /Volkswagen Bus/.test(yearReAsk) && !/Porsche/.test(yearReAsk), `last="${yearReAsk}"`);
await handleSellStep("cant see it now lets jsut go with vw camper van from the 80's");
check("year step: go-with carrying the car completes it and advances",
  sellState.step === 11 && /1980s Volkswagen Bus/.test(sellState.carName || ""),
  `step=${sellState.step} car=${sellState.carName} last="${lastSam()}"`);

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

// 7b. EVERY step accepts EVERY one of its own chip labels as typed text.
for (const [stepStr, cfg] of Object.entries(PIPELINE_STEPS)) {
  const step = Number(stepStr);
  const chips = (globalThis.__t.SELL_STEP_QUESTIONS[step]?.chips || []).filter(c => !/^(not sure|skip|other)$/i.test(c));
  for (const chip of chips) {
    resetToStep1();
    sellState.step = step; sellState.carName = "2018 Porsche 911"; if (step === 18) sellState.region = "US";
    sellState[cfg.field] = null;
    const before = samMessages().length;
    await handleSellStep(chip);
    const rejected = samMessages().slice(before).some(m => /didn't catch that|Still on this question/i.test(m));
    check(`chip self-validation step ${step}: "${chip}"`, !rejected && sellState[cfg.field] !== null, `${cfg.field}=${JSON.stringify(sellState[cfg.field])} rejected=${rejected}`);
  }
}

// 7c. Move-on at the model question advances to location in the same turn.
resetToStep1();
await handleSellStep("vw camper van"); // -> asks year (step 17)
if (sellState.step === 17) {
  const before = samMessages().length;
  await handleSellStep("lets forget the model now");
  const msgs17 = samMessages().slice(before);
  check("move-on waiver: advances to location in the same turn", sellState.step === 11 && msgs17.some(m => /where is the car located/i.test(m)), `step=${sellState.step} msgs=${JSON.stringify(msgs17)}`);
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
const entryVehicle=localPreRoute("e46 m3");
check("entry: vehicle text starts the wizard (trigger or resolver probe)", !!(entryVehicle.sellTrigger||entryVehicle.entryProbe), JSON.stringify(entryVehicle));
check("entry: unmatched input probes instead of canned reply", !!localPreRoute("is this site legit").entryProbe, JSON.stringify(localPreRoute("is this site legit")));

// 7d. Five-fix assertions: regional cards, US-only choice, no sample counts,
// edit link, depth-first breadth.
const allSamText = () => addMsgLog.filter(a => a[0] === "sam").map(a => `${a[1]} ${a[3] || ""} ${a[2] || ""}`).join("\n");
const renderedResult = () => [...appendedHTML].join("\n");
const runResult = async (region, state, price, car, extras) => {
  resetToStep1();
  appendedHTML.length = 0;
  sellState.active = true; sellState.step = 12;
  sellState.carName = car.label; sellState.carRaw = car.label;
  sellState.region = region; sellState.state = state; sellState.price = price;
  sellState.vehicleIdentityValidated = true;
  sellState.resolvedVehicle = car.vehicle;
  sellState.involvement = null; sellState.awaitingPathChoice = false; sellState.pendingResultSections = null;
  Object.assign(sellState, extras || {});
  await showSellRecommendation();
  await new Promise(r => setTimeout(r, 100));
  return renderedResult() + "\n" + allSamText();
};
const mustang = { label: "1990 Ford Mustang", vehicle: { raw: "1990 Ford Mustang", year: 1990, make: "Ford", model: "Mustang", trim: null, confidence: "high", canonicalLabel: "1990 Ford Mustang" } };
const gts = { label: "2018 Porsche 911 Carrera GTS", vehicle: { raw: "2018 Porsche 911 Carrera GTS", year: 2018, make: "Porsche", model: "911", trim: "Carrera GTS", confidence: "high", canonicalLabel: "2018 Porsche 911 Carrera GTS" } };

{
  const uk = await runResult("UK", null, "150k", mustang);
  check("non-US UK: Car & Classic card with approved copy", /Car &(amp;)? Classic/.test(uk) && /130K\+ sales annually, 4M\+ monthly visits/.test(uk), uk.slice(0, 300));
  check("non-US UK: Collecting Cars card at $100k+ with approved copy", /Collecting Cars/.test(uk) && /24,000\+ lots sold/.test(uk) && /\$1\.5B\+ generated for sellers/.test(uk), uk.slice(0, 300));
  check("non-US UK: no involvement choice", !/Want it handled, or run it yourself/.test(uk), "choice rendered");

  const au = await runResult("Australia", null, "150k", mustang);
  check("non-US AU: Collecting Cars only with approved copy", /Collecting Cars/.test(au) && /350,000\+ members in 100\+ countries/.test(au) && !/Car &(amp;)? Classic/.test(au), au.slice(0, 300));
  check("non-US AU: no involvement choice", !/Want it handled, or run it yourself/.test(au), "choice rendered");

  const us = await runResult("US", "California", "140k", gts);
  check("US $50k+: involvement choice renders with three chips", /Want it handled, or run it yourself/.test(us) && /Have it handled/.test(us) && /run it myself/.test(us) && /Not sure/.test(us), us.slice(0, 400));
  handleSellRecommendationFollowup("Not sure");
  await new Promise(r => setTimeout(r, 100));
  const usCards = renderedResult();
  check("US: no sample-size counts on platform cards", !/\d+ of \d+ comparable|\d+ sales? in the last \d+|recent vs \d+ earlier|\(\d+ listings\)|versus the prior \d+/.test(usCards), (usCards.match(/[^\n]*\d+ (of|sales?|recent)[^\n]*/) || [""])[0].slice(0, 200));
  const landed = sellState.sellDecision?.evidence?.ladder?.landed;
  check("depth-first: 45-day start, broadens only when thin", !!landed && landed.windowDays >= 45, `landed=${JSON.stringify(landed)}`);
}

{
  // Regional context: non-US results never explain themselves against US platforms.
  const ukLow = await runResult("UK", null, "50k", mustang);
  check("regional: UK low-value renders Car & Classic, no US-platform mentions", /Car &(amp;)? Classic/.test(ukLow) && !/Bring a Trailer|Cars &(amp;)? Bids|PCarMarket/i.test(ukLow), (ukLow.match(/[^\n]*(Bring a Trailer|Cars & Bids)[^\n]*/i) || ["render missing"])[0].slice(0, 200));

  // High-value Europe: Collecting Cars leads with the proof-sale copy, deduped.
  const euHigh = await runResult("Europe", null, "250k", mustang);
  const ccIdx = euHigh.indexOf("Collecting Cars");
  const cacIdx = euHigh.search(/Car &(amp;)? Classic/);
  check("regional: EU $100k+ leads with Collecting Cars", ccIdx > -1 && cacIdx > -1 && ccIdx < cacIdx, `ccIdx=${ccIdx} cacIdx=${cacIdx}`);
  check("regional: Collecting Cars card carries concrete proof sales", /Ferrari F40 \(£1\.7M\)/.test(euHigh) && /Porsche 918 Spyder/.test(euHigh), euHigh.slice(0, 300));
  check("regional: no duplicated Specialist-platform line", (euHigh.match(/Specialist platform/g) || []).length === 1, `occurrences=${(euHigh.match(/Specialist platform/g) || []).length}`);
  check("regional: EU high-value shows no US-platform mentions", !/Bring a Trailer|Cars &(amp;)? Bids/i.test(euHigh), "US platform mentioned");

  // 1968 Corvette (US): the comps scope is the C3 generation, never
  // all-Corvette, so any median comparison is year/generation-specific.
  const vette = { label: "1968 Chevrolet Corvette", vehicle: { raw: "1968 Chevrolet Corvette", year: 1968, make: "Chevrolet", model: "Corvette", trim: null, confidence: "high", canonicalLabel: "1968 Chevrolet Corvette" } };
  const vetteFast = await runResult("US", "Texas", "60k", vette, { timeline: "Want it gone fast" });
  check("corvette: evidence scoped to the C3 generation, not all Corvettes", sellState.sellDecision?.evidence?.generation?.code === "C3", JSON.stringify(sellState.sellDecision?.evidence?.generation || null));
  check("corvette speed: Hagerty renders as the speed option", /Hagerty/.test(vetteFast) && /stronger fit when speed matters/.test(vetteFast), vetteFast.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 300));
}

// Edit at every step: clicking returns to vehicle entry keeping answers.
resetToStep1();
await handleSellStep("2018 porsche 911 carrera gts");
check("edit: resolve lands on a post-vehicle question", sellState.step === 11, `step=${sellState.step}`);
await handleSellStep("US");
await handleSellStep("California");
const preEditStep = sellState.step;
editCarName();
check("edit: editCarName returns to vehicle entry", sellState.step === 1, `step=${sellState.step}`);
await handleSellStep("1969 ford mustang");
check("edit: new car keeps answers, resumes at first unanswered", /Mustang/.test(sellState.carName || "") && sellState.region === "US" && sellState.state === "California" && sellState.step === preEditStep, `car=${sellState.carName} region=${sellState.region} state=${sellState.state} step=${sellState.step} (was ${preEditStep})`);

console.log(`\n${failures === 0 ? "WIZARD ALL PASS" : failures + " FAILURE(S)"}`);
process.exit(failures === 0 ? 0 : 1);
