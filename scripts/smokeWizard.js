// Wizard-level production smoke tests: runs the real index.html wizard logic
// in Node with a stubbed DOM against the LIVE APIs. Asserts the global
// invariants inside clarification sub-states, where they once silently failed:
// off-script input must reach the chat layer from any state, and repeated
// failed input must never produce the same message twice.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findForbidden } from "./forbiddenPatterns.js";
import { labelIsProvablyCar } from "../lib/vehicle.js";

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
const artifactsDir = path.join(repoRoot, "smoke-artifacts");
fs.mkdirSync(artifactsDir, { recursive: true });
function saveArtifact(name, text) {
  fs.writeFileSync(path.join(artifactsDir, `${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.txt`), text);
}
// Guardrails applied to every journey: forbidden-pattern registry (A),
// field-contamination check on the car label (D), repetition guard (E).
function guardRender(name, text) {
  const clean = String(text).replace(/<[^>]+>/g, "\n");
  saveArtifact(name, clean);
  const hits = findForbidden(clean);
  check(`[registry] ${name}: no forbidden patterns`, hits.length === 0, hits.join(" | "));
  const sentences = clean.split(/(?<=[.!?])\s+|\n/).map(x => x.trim()).filter(x => x.length > 30 && !/^</.test(x));
  const dupes = sentences.filter((x, i) => sentences.indexOf(x) !== i);
  check(`[repetition] ${name}: no sentence renders twice`, dupes.length === 0, JSON.stringify([...new Set(dupes)].slice(0, 2)));
}
function guardCarLabel(name) {
  const label = String(sellState.carName || "");
  if (sellState.vehicleIdentityValidated && sellState.resolvedVehicle?.canonicalLabel) {
    check(`[render gate] ${name}: label IS the canonical resolution`, label === sellState.resolvedVehicle.canonicalLabel, `label="${label}" canonical="${sellState.resolvedVehicle.canonicalLabel}"`);
    check(`[render gate] ${name}: label provably a car`, labelIsProvablyCar(label, sellState.resolvedVehicle), `label="${label}"`);
  }
  const contaminated = /\b(us|usa|uk|europe|australia|middle east|california|texas|florida|new york)\b/i.test(label)
    || /\$|\b\d{2,3}k\b|\bmiles?\b|\basap\b|\bfast\b/i.test(label)
    || /half restored|fully restored|barn find|needs work|project\b|\bmint\b|\brough\b/i.test(label);
  check(`[contamination] ${name}: car label carries no foreign-field tokens`, !contaminated, `car="${label}"`);
}
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
  sellState.priceGapContextGathered = false; sellState.awaitingPriceGapContext = false; sellState.priceContextNote = null;
  sellState.lastMissingAsk = null; sellState.editReturnStep = null; sellState.editPrevVehicle = null;
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
  const output = renderedResult() + "\n" + allSamText();
  guardRender(`result-${car.label}`, output);
  guardCarLabel(`result-${car.label}`);
  return output;
};
const mustang = { label: "1990 Ford Mustang", vehicle: { raw: "1990 Ford Mustang", year: 1990, make: "Ford", model: "Mustang", trim: null, confidence: "high", canonicalLabel: "1990 Ford Mustang" } };
const gts = { label: "2018 Porsche 911 Carrera GTS", vehicle: { raw: "2018 Porsche 911 Carrera GTS", year: 2018, make: "Porsche", model: "911", trim: "Carrera GTS", confidence: "high", canonicalLabel: "2018 Porsche 911 Carrera GTS" } };

{
  const uk = await runResult("UK", null, "150k", mustang);
  check("non-US UK: Car & Classic card is contextual with the volume stat", /Car &(amp;)? Classic/.test(uk) && /130K\+ sales annually/.test(uk) && !/Classic cars, modern classics, performance models/.test(uk), uk.replace(/<[^>]+>/g," ").slice(0, 300));
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
  check("regional: unmapped make gets generic proof, no unrelated headliners", /high-value Ferraris, Porsches and Lamborghinis, plus more/.test(euHigh) && !/F40 \(£1\.7M\)/.test(euHigh), euHigh.replace(/<[^>]+>/g," ").slice(0, 300));
  check("regional: no duplicated Specialist-platform line", (euHigh.match(/Specialist platform/g) || []).length === 1, `occurrences=${(euHigh.match(/Specialist platform/g) || []).length}`);
  check("regional: EU high-value shows no US-platform mentions", !/Bring a Trailer|Cars &(amp;)? Bids/i.test(euHigh), "US platform mentioned");

  // 1968 Corvette (US): the comps scope is the C3 generation, never
  // all-Corvette, so any median comparison is year/generation-specific.
  const vette = { label: "1968 Chevrolet Corvette", vehicle: { raw: "1968 Chevrolet Corvette", year: 1968, make: "Chevrolet", model: "Corvette", trim: null, confidence: "high", canonicalLabel: "1968 Chevrolet Corvette" } };
  const vetteFast = await runResult("US", "Texas", "60k", vette, { timeline: "Want it gone fast" });
  check("corvette: evidence scoped to the C3 generation, not all Corvettes", sellState.sellDecision?.evidence?.generation?.code === "C3", JSON.stringify(sellState.sellDecision?.evidence?.generation || null));
  check("corvette speed: Hagerty renders as the speed option", /Hagerty/.test(vetteFast) && /stronger fit when speed matters/.test(vetteFast), vetteFast.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 300));
}

{
  // Voice rule 15: recommendation closes are declarative, never hedged.
  const HEDGE=/pan out|revisit|feel free|come back if|change your mind|second opinion|let me know if/i;
  const closes=[];
  const sedan={label:"2011 BMW 335i",vehicle:{raw:"2011 BMW 335i",year:2011,make:"BMW",model:"3-Series",trim:"335i",confidence:"high",canonicalLabel:"2011 BMW 335i"}};
  const sports={label:"2018 Porsche 911 Carrera GTS",vehicle:gts.vehicle};
  const classic={label:"1968 Chevrolet Corvette",vehicle:{raw:"1968 Chevrolet Corvette",year:1968,make:"Chevrolet",model:"Corvette",trim:null,confidence:"high",canonicalLabel:"1968 Chevrolet Corvette"}};
  for(const car of [sedan,sports,classic]){
    const out=await runResult("US","Texas",null,car);
    if(sellState.awaitingPathChoice){handleSellRecommendationFollowup("I'll run it myself");await new Promise(r=>setTimeout(r,100));}
    const rendered=renderedResult().replace(/<[^>]+>/g,"\n");
    const afterResults=[...rendered.matchAll(/([^\n]+)\n*$/g)];
    const closeLine=(rendered.split("\n").map(l=>l.trim()).filter(Boolean).at(-1))||"";
    closes.push(`${car.label}: "${closeLine}"`);
    check(`voice close (${car.label.split(" ").at(-1)}): declarative, unhedged`, !!closeLine && !/\?\s*$/.test(closeLine) && !HEDGE.test(rendered), `close="${closeLine}" hedge=${(rendered.match(HEDGE)||[""])[0]}`);
    check(`headline (${car.label.split(" ").at(-1)}): direct, no indirect phrasing`, !/have come through|data points to|I’d start with|I'd start with|the platform I’d use/i.test(rendered), (rendered.match(/[^\n]*(have come through|data points to|start with|platform I’d use)[^\n]*/i)||[""])[0].slice(0,200));
  }
}

// Confirmation with a self-correction suffix confirms, never re-asks.
// "2018 pors" reliably produces a typo-confirm suggestion.
resetToStep1();
await handleSellStep("2018 pors");
check("confirm: suffix test reached a suggestion confirm", !!sellState.pendingVehicleIdentity?.suggestion, JSON.stringify(sellState.pendingVehicleIdentity));
await handleSellStep("it is that car my mistake");
check("confirm: self-correction suffix still confirms and advances", (sellState.step === 11 || sellState.step === 17) && /Porsche/i.test(sellState.carName || "") && !/my mistake/i.test(sellState.carName || ""), `step=${sellState.step} car=${sellState.carName} last="${lastSam()}"`);

// Speed-tiebreak copy (locked): sub-$50k + fast timeline + close medians ->
// the pick is owned. No consolation framing, no "may matter", no "tradeoff".
{
  const DEFENSIVE_SPEED=/close enough that speed and process may matter|may take longer|timing is the tradeoff|where I.d (start|begin) if you (are )?sell(ing)? it yourself/i;
  const speedCars=[
    {label:"1972 Volkswagen Beetle",vehicle:{raw:"1972 Volkswagen Beetle",year:1972,make:"Volkswagen",model:"Beetle",trim:null,confidence:"high",canonicalLabel:"1972 Volkswagen Beetle"}},
    {label:"2005 Mazda MX-5",vehicle:{raw:"2005 Mazda MX-5",year:2005,make:"Mazda",model:"MX-5",trim:null,confidence:"high",canonicalLabel:"2005 Mazda MX-5"}},
    {label:"1990 Ford Mustang",vehicle:mustang.vehicle}
  ];
  const SPEED_POOL=/tends to get listings live fast|historically closes quicker|moves faster to market|gets a listing live sooner|runs the quicker auction cycle|faster route from listing to close/i;
  const GAP_POOL=/are similar between the top choices|at similar money lately|close across the leading platforms|meaningful platform gap|near-identical recent results|similar levels across the top platforms/i;
  const speedReasons=[];
  const seenStats=[];
  for(const car of speedCars){
    const out=await runResult("US","Texas","20k",car,{timeline:"Want it gone fast"});
    const rendered=(renderedResult()+"\n"+allSamText()).replace(/<[^>]+>/g," ");
    check(`speed copy (${car.label.split(" ").at(-1)}): no consolation or hedge framing`, !DEFENSIVE_SPEED.test(rendered), (rendered.match(DEFENSIVE_SPEED)||[""])[0].slice(0,160));
    // FIX 1: sub-5% gaps never show direction; negligible framing carries no dollars
    check(`median gate (${car.label.split(" ").at(-1)}): no sub-5% directional claims`, !/\b[1-4]% (above|below)\b/i.test(rendered), (rendered.match(/[^\n]*% (above|below)[^\n]*/i)||[""])[0].slice(0,160));
    if(/negligible between/i.test(rendered)){
      check(`median gate (${car.label.split(" ").at(-1)}): negligible line carries no dollar amounts`, !/negligible[^<]*\$\d/i.test(rendered), rendered.slice(rendered.search(/negligible/i),rendered.search(/negligible/i)+200));
    }
    const decoded=rendered.replace(/&#39;|&apos;/g,"'").replace(/&amp;/g,"&");
    check(`bullet 3 (${car.label.split(" ").at(-1)}): fast timeline gets the speed line`, /prioritizing a fast close|market I'd trust to move it|tends to get listings live fast|historically closes quicker|moves faster to market|gets a listing live sooner|quicker auction cycle|faster route from listing to close/i.test(decoded), (decoded.match(/[^\n]*(fast|quick)[^\n]*/i)||["none"])[0].slice(0,160));
    // FIX 2: locked two-part Why when the speed tiebreak fired
    if(SPEED_POOL.test(rendered)){
      speedReasons.push((rendered.match(SPEED_POOL)||[""])[0]);
      check(`why structure (${car.label.split(" ").at(-1)}): speed phrase + gap phrase`, GAP_POOL.test(rendered), rendered.slice(0,300));
      check(`speed headline (${car.label.split(" ").at(-1)}): confirms the heard preference`, /You want it gone fast/i.test(rendered), rendered.slice(0,300));
    }
    check(`cta (${car.label.split(" ").at(-1)}): active submit language`, /Submit your car to /.test(rendered) && !/>Sell on /.test(rendered), (rendered.match(/[^\n]*Sell on[^\n]*/)||[""])[0].slice(0,140));
    if(/% of .* listings here sold/.test(rendered)){
      const statMatches=rendered.match(/% of [^\n]* listings here sold/g)||[];
      seenStats.push(...statMatches);
    }
  }
  check("stat dedupe: sell-through stat renders at most once per session key", seenStats.length===new Set(seenStats).size, JSON.stringify(seenStats));
  if(speedReasons.length>=2){
    check("why structure: wording varies across different cars", new Set(speedReasons).size>=2, JSON.stringify(speedReasons));
  }
}

// Card specificity (locked): structured reason bullets, percent+period+
// platform comparable claims, make-aware regional proof, gated weekday.
{
  const us=await runResult("US","California","140k",gts);
  if(sellState.awaitingPathChoice){handleSellRecommendationFollowup("I'll run it myself");await new Promise(r=>setTimeout(r,150));}
  const rendered=(renderedResult()+"\n"+allSamText()).replace(/<li>/g,"\n• ").replace(/<[^>]+>/g,"\n");
  const heroHasPct=/\d+% of [^\n]* sales (over the past [^\n]*|across everything[^\n]*) closed on (Bring a Trailer|Cars & Bids|PCarMarket|Hagerty)/i.test(rendered.replace(/&amp;/g,"&"));
  const heroHasSafeProse=/Recent comparable [^\n]* sales have closed here/i.test(rendered);
  check("card specificity: hero is a specific claim or gated safe prose", heroHasPct||heroHasSafeProse, (rendered.match(/[^\n]*(closed on|closed here)[^\n]*/i)||["no hero line"])[0].slice(0,180));
  check("card specificity: no 'Every comparable sale' vagueness", !/Every comparable sale we tracked/i.test(rendered), "vague claim rendered");
  check("card regression: Why bullet 1 validates existence, zero dollars", /sales have closed on (Bring a Trailer|Cars & Bids|PCarMarket|Hagerty) (over the past|across everything)/i.test(rendered.replace(/&amp;/g,"&")), (rendered.match(/[^\n]*sales have closed on[^\n]*/i)||["missing"])[0].slice(0,160));
  check("card regression: no median prices on platform cards", !/Median (sale )?\$[\d,]+/.test(rendered)&&!/\$[\d,]+ here vs/.test(rendered), (rendered.match(/[^\n]*(Median|here vs)[^\n]*/)||[""])[0].slice(0,160));
  check("card regression: no buyer-base or strongest-run filler", !/Buyer base:|strongest run recently|enthusiast and collector cars across every era/i.test(rendered), (rendered.match(/[^\n]*(Buyer base|strongest run|every era)[^\n]*/i)||[""])[0].slice(0,160));
  // Bullet 3 contract: sell-through is qualitative and the speed line only
  // follows a fast timeline (this run has no timeline set).
  check("bullet 3: sell-through never renders as a percentage", !/sell-through for [^\n]*%/.test(rendered), (rendered.match(/[^\n]*sell-through for[^\n]*/i)||[""])[0].slice(0,160));
  check("bullet 3: no speed line without a fast timeline", !/prioritizing a fast close|market I.{0,6}d trust to move it/i.test(rendered), (rendered.match(/[^\n]*(fast close|move it)[^\n]*/i)||[""])[0].slice(0,160));
  check("card specificity: weekday lines only render with a material lift", !/(around|at ~)[1-9]% above other days/.test(rendered), (rendered.match(/[^\n]*above other days[^\n]*/)||[""])[0]);
  // FIX 1 validation gate: any percent claim requires a proven 10+ denominator
  const pctClaim=rendered.replace(/&amp;/g,"&").match(/(\d+)% of [^\n]*closed on/);
  const landedSales=sellState.sellDecision?.evidence?.ladder?.landed?.sales??0;
  if(pctClaim){
    check("claim gate: percent claims carry a proven 10+ denominator", landedSales>=10 && Number(pctClaim[1])<=100, `claim=${pctClaim[0].slice(0,80)} landedSales=${landedSales}`);
  }else{
    check("claim gate: thin data falls back to safe prose, no invented percent", landedSales>=10 || /Recent comparable [^\n]* sales have closed here/i.test(rendered) || !/closed on/.test(rendered), `landedSales=${landedSales}`);
  }

  const huracan={label:"2015 Lamborghini Huracan",vehicle:{raw:"2015 Lamborghini Huracan",year:2015,make:"Lamborghini",model:"Huracan",trim:null,confidence:"high",canonicalLabel:"2015 Lamborghini Huracan"}};
  const eu=await runResult("Europe",null,"250k",huracan);
  check("card specificity: Collecting Cars proof is make-specific for a Lamborghini", /sold many Lamborghini models at premium prices/i.test(eu) && /Huracán and Aventador/i.test(eu) && !/F40/.test(eu), eu.replace(/<[^>]+>/g," ").slice(0,300));
  check("card specificity: single Specialist-platform mention holds", (eu.match(/Specialist platform/g)||[]).length===1, `count=${(eu.match(/Specialist platform/g)||[]).length}`);
}

// Bullet 3 renders whenever segment data exists, no timeline needed.
{
  const carrera={label:"1987 Porsche 911 Carrera",vehicle:{raw:"1987 Porsche 911 Carrera",year:1987,make:"Porsche",model:"911",trim:"Carrera",confidence:"high",canonicalLabel:"1987 Porsche 911 Carrera"}};
  const out=await runResult("US","California","95k",carrera,{timeline:"No rush, right result only"});
  if(sellState.awaitingPathChoice){handleSellRecommendationFollowup("I'll run it myself");await new Promise(r=>setTimeout(r,150));}
  const rendered=(renderedResult()+"\n"+allSamText()).replace(/<[^>]+>/g,"\n").replace(/&#39;/g,"'");
  check("bullet 3: renders on no-rush when segment data exists", /(Strong|Consistent) sell-through for classic Porsches in the \$50k to \$150k range/.test(rendered), (rendered.match(/[^\n]*sell-through[^\n]*/i)||["missing"])[0].slice(0,160));
  check("bullet 3: no speed line on a no-rush timeline", !/prioritizing a fast close|market I'd trust to move it/.test(rendered), (rendered.match(/[^\n]*(fast close|move it)[^\n]*/i)||[""])[0]);
  check("carrera: zero price-gap prose despite the 57% gap", !/your asking price|the average for recent/i.test(rendered), (rendered.match(/[^\n]*asking price[^\n]*/i)||[""])[0]);
}

// Price-gap prose is deleted (locked): a big ask-vs-comps gap changes
// NOTHING about the render. No note, no ask, no percentage.
{
  const out=await runResult("US","California","20k",gts);
  if(sellState.awaitingPathChoice){handleSellRecommendationFollowup("I'll run it myself");await new Promise(r=>setTimeout(r,150));}
  const released=(renderedResult()+"\n"+allSamText()).replace(/<[^>]+>/g,"\n");
  check("price gap: results render immediately, no pre-results ask", /Seller Intelligence|Want it handled/i.test(released) && !/what'?s different about yours/i.test(released), released.slice(0,200));
  check("price gap: zero gap prose anywhere", !/your asking price|above the average|below the average|worth knowing/i.test(released), (released.match(/[^\n]*(asking price|the average)[^\n]*/i)||[""])[0].slice(0,180));
}

// Battery: field-contamination entries (locked guard D).
resetToStep1();
await handleSellStep("2020 BMW M3, US");
guardCarLabel("entry-location-contaminated");
check("contamination: location token routed to the region field", sellState.region==="US" && /^2020 BMW M3$/.test(sellState.carName||""), `car=${sellState.carName} region=${sellState.region} step=${sellState.step}`);
check("contamination: location question skipped to the state ask", sellState.step===18||sellState.step===17, `step=${sellState.step} last="${lastSam()}"`);

resetToStep1();
await handleSellStep("m3 around 60k");
if(sellState.step===17)await handleSellStep("2020");
guardCarLabel("entry-price-contaminated");
check("contamination: price token routed to the price field", String(sellState.price||"")==="60k" && !/60k/.test(sellState.carName||""), `car=${sellState.carName} price=${sellState.price}`);

// Battery: real-phrasing fixes.
resetToStep1();
await handleSellStep("wife's lexus lx470 maybe 2004 not sure exact year");
check("hedged entry: resolves to a tentative-year confirm", /2004 Lexus LX 470/i.test(lastSam()||"") && /sound right/i.test(lastSam()||""), `last="${lastSam()}"`);
await handleSellStep("yes");
guardCarLabel("hedged-lexus");
check("hedged entry: confirm advances with the clean car", /Lexus LX 470/i.test(sellState.carName||"") && sellState.step!==1, `car=${sellState.carName} step=${sellState.step}`);

resetToStep1();
await handleSellStep("2016 hellcat");
check("nickname: hellcat asks Challenger vs Charger with chips", /which hellcat/i.test(lastSam()||"") && /Challenger Hellcat/.test(String(addMsgLog.at(-1)?.[3]||"")), `last="${lastSam()}" chips="${String(addMsgLog.at(-1)?.[3]||"").slice(0,120)}"`);
await handleSellStep("Challenger Hellcat");
check("nickname: chip completes the car", /Challenger/i.test(sellState.carName||""), `car=${sellState.carName} step=${sellState.step} last="${lastSam()}"`);

resetToStep1();
await handleSellStep("73 bronco half restored");
guardCarLabel("condition-bronco");
check("condition token: label clean, note captured", /^1973 Ford Bronco$/.test(sellState.carName||"") && /half restored/i.test(sellState.notes||""), `car=${sellState.carName} notes=${sellState.notes}`);
await handleSellStep("US");
await handleSellStep("Texas");
await handleSellStep("60k to 100k");
check("condition token: the condition ask pre-acknowledges", /you mentioned it'?s half restored/i.test(lastSam()||""), `last="${lastSam()}"`);

// Regression battery: today's three exact label failures.
resetToStep1();
await handleSellStep("thinking about selling my dads old porsche 911 maybe 1987 or 88 not sure");
check("regression 1: conversational 911 reads as a 911, never as conversation", /porsche 911|911/i.test(lastSam()||"") && !/thinking|weird|or 88/i.test(lastSam()||""), `last="${lastSam()}"`);
if(/sound right/i.test(lastSam()||""))await handleSellStep("yes");
else if(sellState.step===17)await handleSellStep("Carrera");
guardCarLabel("regression-1-hedged-911");
check("regression 1: label is a clean era-or-year 911", /^(19\d{2}|1980s) Porsche 911/.test(sellState.carName||"") && !/thinking|about|or 88/i.test(sellState.carName||""), `car=${sellState.carName}`);

resetToStep1();
await handleSellStep("2015 lamborghini huracan that weird but smaller 2016 one");
guardCarLabel("regression-2-huracan");
check("regression 2: huracan label sheds the conversation", /^2015 Lamborghini Huracan/.test(sellState.carName||"") && !/weird|smaller|2016/i.test(sellState.carName||""), `car=${sellState.carName}`);

resetToStep1();
await handleSellStep("got a raptor truck been sitting needs some tlc");
check("regression 3: mid-sentence raptor resolves, year asked", /Ford F-150/i.test(lastSam()||"") && /year/i.test(lastSam()||""), `last="${lastSam()}" step=${sellState.step}`);
await handleSellStep("2018");
guardCarLabel("regression-3-raptor");
check("regression 3: raptor survives to the label", /F-150/i.test(sellState.carName||""), `car=${sellState.carName}`);
// year conflict honesty: raptor typed at the model step with an old year held
resetToStep1();
await handleSellStep("1976 ford");
if (sellState.step === 17) {
  await handleSellStep("raptor");
  check("regression 3b: old-year raptor gets the honest conflict, never dropped", /Raptor wasn'?t produced in 1976|F-100 or F-150/i.test(lastSam()||""), `last="${lastSam()}"`);
}

// Battery: multi-trim asks (FIX 2).
resetToStep1();
await handleSellStep("2018 mercedes c63");
check("trim spread: C63 asks C63 vs C63 S", sellState.step===17 && /C63 and C63 S/i.test(lastSam()||""), `step=${sellState.step} last="${lastSam()}"`);
resetToStep1();
await handleSellStep("2020 bmw m3");
check("trim spread: modern M3 asks Base vs Competition", sellState.step===17 && /Base and Competition/i.test(lastSam()||""), `step=${sellState.step} last="${lastSam()}"`);
await handleSellStep("Competition");
check("trim spread: Competition answer advances with the trim", /M3 Competition/i.test(sellState.carName||"") && sellState.step!==17, `car=${sellState.carName} step=${sellState.step}`);

// Edit mid-flow keeps context: re-confirming the same car resumes at the
// step the user was on, never back at vehicle entry.
resetToStep1();
await handleSellStep("2020 bmw m3");
if (sellState.step === 17) await handleSellStep("Competition");
check("edit-resume: M3 lands on the location question", sellState.step === 11, `step=${sellState.step} last="${lastSam()}"`);
editCarName();
await handleSellStep("yes it is that car my bad");
check("edit-resume: same-car confirm with suffix resumes at location", sellState.step === 11 && /where is the car located/i.test(lastSam() || "") && /M3/i.test(sellState.carName || ""), `step=${sellState.step} car=${sellState.carName} last="${lastSam()}"`);
editCarName();
await handleSellStep("my mistake its is this car");
check("edit-resume: prefix suffix + 'is this car' confirms and resumes", sellState.step === 11 && /where is the car located/i.test(lastSam() || "") && /M3/i.test(sellState.carName || "") && !/mistake/i.test(sellState.carName || ""), `step=${sellState.step} car=${sellState.carName} last="${lastSam()}"`);
editCarName();
await handleSellStep("actually different car 1965 jag");
check("edit-resume: different car resolves, model clarification allowed", sellState.step === 17 || sellState.step === 11, `step=${sellState.step} last="${lastSam()}"`);
if (sellState.step === 17) await handleSellStep("e-type");
check("edit-resume: different car resumes at location after clarification", sellState.step === 11 && /where is the car located/i.test(lastSam() || "") && /Jaguar/i.test(sellState.carName || ""), `step=${sellState.step} car=${sellState.carName} last="${lastSam()}"`);

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

// Phrasing fuzzer (Addendum C): combinatorial real-world entries. Every
// generated entry must either resolve or produce ONE grounded question;
// a make-bearing input may never come back with the car dropped.
{
  const CARS=[
    {token:"porsche 911",make:"Porsche"},{token:"vette",make:"Chevrolet"},{token:"stang",make:"Ford"},
    {token:"lexus lx470",make:"Lexus"},{token:"bmw m3",make:"BMW"},{token:"miata",make:"Mazda"},
    {token:"vw camper van",make:"Volkswagen"},{token:"corvette stingray",make:"Chevrolet"},
    {token:"mercedes sl",make:"Mercedes-Benz"},{token:"landcruiser",make:"Toyota"}
  ];
  const POSSESSIVES=["","my ","wife's ","dad's "];
  const YEARS=["","1972 ","maybe 2004 ","from the 80s "];
  const SUFFIXES=["",", US"," half restored"," around 60k"];
  const cases=[];
  for(const car of CARS)for(const p of POSSESSIVES.slice(0,2))for(const y of YEARS)for(const suffix of SUFFIXES.slice(0,2)){
    cases.push({text:`${p}${y}${car.token}${suffix}`.trim(),make:car.make});
  }
  // sprinkle the harder possessive/hedge/suffix combos on a subset
  for(const car of CARS.slice(0,5)){
    cases.push({text:`wife's ${car.token} maybe 2004 not sure exact year`,make:car.make});
    cases.push({text:`dad's old ${car.token} half restored, US`,make:car.make});
    cases.push({text:`thinking about selling the ${car.token} you know the one`,make:car.make});
    cases.push({text:`${car.token} 1987 or 88 not sure somewhere around there`,make:car.make});
    cases.push({text:`got a ${car.token} been sitting needs some tlc`,make:car.make});
  }
  let fuzzFailures=[];
  const CHUNK=10;
  for(let i=0;i<cases.length;i+=CHUNK){
    await Promise.all(cases.slice(i,i+CHUNK).map(async c=>{
      try{
        const res=await fetch(`${BASE}/api/vehicleIdentity`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:c.text})});
        const data=await res.json();
        const ok=res.ok
          &&["valid","needs_clarification","invalid_vehicle"].includes(data.status)
          &&(data.status==="valid"
            ?String(data.vehicle?.make||"").toLowerCase()===c.make.toLowerCase()||!!data.vehicle?.make
            :!!(data.clarification?.question))
          &&!(data.status==="needs_clarification"&&!data.vehicle?.make&&!data.vehicle?.model&&!data.fallback);
        if(!ok)fuzzFailures.push(`"${c.text}" -> ${data.status} make=${data.vehicle?.make} q="${(data.clarification?.question||"").slice(0,60)}"`);
        const label=String(data.vehicle?.canonicalLabel||"");
        if(/\b(us|usa)\b|\$|\b\d{2,3}k\b|half restored|barn find/i.test(label))fuzzFailures.push(`contaminated label: "${c.text}" -> "${label}"`);
        if(label&&data.vehicle?.make&&data.vehicle?.model&&!labelIsProvablyCar(label,data.vehicle))fuzzFailures.push(`label fails sanity gate: "${c.text}" -> "${label}"`);
      }catch(err){fuzzFailures.push(`"${c.text}" threw ${err.message.slice(0,50)}`);}
    }));
  }
  check(`fuzzer: ${cases.length} generated entries all resolve or ask one grounded question`, fuzzFailures.length===0, fuzzFailures.slice(0,5).join(" || "));
}

console.log(`\n${failures === 0 ? "WIZARD ALL PASS" : failures + " FAILURE(S)"}`);
process.exit(failures === 0 ? 0 : 1);
