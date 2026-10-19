// SELL ASKS THE ENGINE'S QUESTION FIRST (Sam's rule, every product; Lane C as integrator, Oct 19 2026). A bare
// "1965 Ford Mustang" asks Convertible, Coupe or Fastback on Market Check; Sell asks the same question, in the engine's
// own prompt and options, before any range. Checks: choiceOf over engine answers (lib/sell/sellFacts.js), buildResult
// returns the question before any read of its own (lib/sell/sellFlow.js), and the Sell client (lib/sell/sellMcClient.js)
// on a stubbed page: the question in the existing card, a chip or the option's name reads that car next, other words
// are added to the car. No network.
//   node scripts/sellQuestionCheck.mjs     exit 1 on any failure.
import fs from "node:fs";
import { choiceOf } from "../lib/sell/sellFacts.js";
import { SELL_MC_CLIENT } from "../lib/sell/sellMcClient.js";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };

// 1. choiceOf: the engine's own question, nothing of ours.
const PROMPT = "These sold as Convertible, Coupe and Fastback, and they price differently. Which one is it?";
const body = choiceOf({ tier: "body_choice", prompt: PROMPT, bodyOptions: ["Convertible", "Coupe", "Fastback"], optionCounts: [20, 25, 18], resolvedCar: { year: 1965, make: "Ford", model: "Mustang" } });
ok(body && body.prompt === PROMPT, "body: the engine's prompt, verbatim");
ok(body && body.options.map(o => o.label).join("|") === "Convertible|Coupe|Fastback", "body: the engine's options, in its order");
ok(body && body.options[2].car === "1965 Ford Mustang Fastback", "body: an answer reads the resolved car plus the body (Market Check's chip rule)");
const gen = choiceOf({ tier: "generation_choice", prompt: "Which generation is it?", generationOptions: [{ label: "E36 (1995 to 1999)", query: "1999 BMW M3 E36" }, { label: "E46 (2000 to 2006)", query: "1999 BMW M3 E46" }] });
ok(gen && gen.options[1].car === "1999 BMW M3 E46", "generation: an answer is the engine's own query");
ok(choiceOf({ tier: "result", cluster: [22500, 47000], poolN: 63 }) === null, "a range: no question");
ok(choiceOf({ tier: "thin", thinLine: "x" }) === null, "a thin answer: no question");
ok(choiceOf({ tier: "body_choice", bodyOptions: ["Coupe"], resolvedCar: { year: 1965, make: "Ford", model: "Mustang" } }) === null, "no engine prompt: no question of ours");
ok(choiceOf({ tier: "gearbox_choice", prompt: "Manual or automatic?", options: [] }) === null, "other identity questions are not asked here");
ok(choiceOf(null) === null && choiceOf(undefined) === null, "no answer: no question");

// 2. buildResult: the question returns before the facts, the pick or the partner are read.
const flow = fs.readFileSync(new URL("../lib/sell/sellFlow.js", import.meta.url), "utf8");
const br = flow.slice(flow.indexOf("export async function buildResult("));
ok(br.indexOf("engineQuestion(car)") > 0 && br.indexOf("if (question) return") < br.indexOf("sellFactsFor(car)") && br.indexOf("if (question) return") < br.indexOf("pickPlatform("), "buildResult: the question returns before any range, pick or partner read");

// 3. The client on a stubbed page.
const listeners = {}, calls = [], addr = [];
let replies = [];
const OBX = { root: { innerHTML: "" }, esc: s => String(s), inboxHtml: () => "", footHtml: () => "", wire() {}, renderError(t) { OBX.root.innerHTML = "ERR " + t; }, renderEmpty() {},
  qscreenHtml: (p, c, eb) => `<eyebrow>${eb}</eyebrow><q>${p}</q>${c}`, samMsgHtml: a => a.join(" "), saleCardHtml: () => "" };
globalThis.window = { OBX, addEventListener() {}, matchMedia: () => ({ matches: false }), scrollTo() {} };
globalThis.location = { search: "", pathname: "/sell" };
globalThis.history = { pushState: (s, t, u) => addr.push(u), replaceState: (s, t, u) => addr.push("R " + u) };
globalThis.localStorage = { getItem: () => null, setItem() {} };
globalThis.document = { addEventListener: (k, f) => { listeners[k] = f; }, getElementById: () => null, createElement: () => ({}), head: { appendChild() {} } };
globalThis.fetch = (u, o) => { const b = JSON.parse(o.body); calls.push(b); return Promise.resolve({ json: () => Promise.resolve(replies.shift() || {}) }); };
new Function(SELL_MC_CLIENT)();
const S = window.GAS_SELL, tick = () => new Promise(r => setTimeout(r, 0));
const chip = (key, text) => listeners.click({ preventDefault() {}, target: { closest: sel => (sel === "[data-sellchip]" ? { textContent: text, getAttribute: () => key } : null) } });
S.onCar({ resolvedCar: { year: 1965, make: "Ford", model: "Mustang" } }, "1965 Ford Mustang");
chip("California", "California"); chip("self", "I'll sell it myself"); chip("none", "No rush, right result only");
replies = [{ label: "1965 Ford Mustang", question: body }];
await tick(); await tick(); await tick();
ok(calls.length === 1 && calls[0].step === "result" && calls[0].car === "1965 Ford Mustang", "the result is asked for the car as named");
ok(OBX.root.innerHTML.includes(`<q>${PROMPT}</q>`), "the engine's question shows, in its own words");
ok(/data-sellchip="0">Convertible<.*data-sellchip="1">Coupe<.*data-sellchip="2">Fastback</.test(OBX.root.innerHTML), "the engine's options, as the existing chips");
ok(!/\$\d/.test(OBX.root.innerHTML), "no figure before the answer");
replies = [{ label: "1965 Ford Mustang Fastback", order: ["platform"], platform: null }];
chip("2", "Fastback"); await tick(); await tick(); await tick();
ok(calls.length === 2 && calls[1].car === "1965 Ford Mustang Fastback" && calls[1].state === "California" && calls[1].how === "self" && calls[1].rush === "none", "a chip reads that car next, the answers kept");
ok(addr.some(a => /^R \/sell\?car=1965\+Ford\+Mustang\+Fastback&state=California/.test(a)), "the address names the answered car");
// Typed words that name an option are that option; other words are added to the car.
S.onCar({ resolvedCar: { year: 1965, make: "Ford", model: "Mustang" } }, "1965 Ford Mustang");
chip("California", "California"); chip("self", "x"); chip("none", "x");
replies = [{ question: body }]; await tick(); await tick(); await tick();
replies = [{}]; S.onSubmit("coupe"); await tick(); await tick();
ok(calls[calls.length - 1].car === "1965 Ford Mustang Coupe", "typed 'coupe' is the Coupe option");
S.onCar({ resolvedCar: { year: 1965, make: "Ford", model: "Mustang" } }, "1965 Ford Mustang");
chip("California", "California"); chip("self", "x"); chip("none", "x");
replies = [{ question: body }]; await tick(); await tick(); await tick();
replies = [{}]; S.onSubmit("GT fastback 2+2"); await tick(); await tick();
ok(calls[calls.length - 1].car === "1965 Ford Mustang GT fastback 2+2", "other words are added to the car");

// A car whose body was already answered in Market Check's own question screen: Sell names it with the body and
// asks nothing more (the engine answers that car with its range, no question).
S.onCar({ resolvedCar: { year: 1965, make: "Ford", model: "Mustang", bodyStyle: "Fastback" } }, "1965 Ford Mustang Fastback");
const before = calls.length;
chip("California", "California"); chip("self", "x"); chip("none", "x");
replies = [{ label: "1965 Ford Mustang Fastback", order: ["platform"], platform: null, marketAnswer: { cluster: [43500, 56500], poolN: 11 } }];
await tick(); await tick(); await tick();
ok(calls.length === before + 1 && calls[before].car === "1965 Ford Mustang Fastback", "answered in Market Check: the result reads the car with its body, once");
ok(!OBX.root.innerHTML.includes("<q>") && !/data-sellchip="\d"/.test(OBX.root.innerHTML), "answered in Market Check: no second question");

console.log(`sellQuestionCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
