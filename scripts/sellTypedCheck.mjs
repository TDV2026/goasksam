// SELL SENDS THE VISITOR'S OWN WORDS TO THE ONE ENGINE (e69, Sam approved, Oct 19 2026; Lane C). Every Sell step reads
// the car as the visitor typed it, not only the resolver's name for it, so an answer that reads the typed words (a
// "2004 Porsche 911 Carrera GT" is not a 911) is the same on Sell as on Market Check. The name shown is unchanged; an
// answer to the engine's question joins the typed words, so no question repeats. Stubbed page, no network: what each
// step sends, and what draws for the engine's replies.
//   node scripts/sellTypedCheck.mjs     exit 1 on any failure.
import { SELL_MC_CLIENT } from "../lib/sell/sellMcClient.js";
import { sellsForCardHtml } from "../lib/sellsForCard.js";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const listeners = {}, calls = [], addr = [];
let replies = [], popstate = null;
const OBX = { root: { innerHTML: "" }, esc: s => String(s), inboxHtml: v => `<inbox ${v}>`, footHtml: () => "<foot>", wire() {}, renderError(t) { OBX.root.innerHTML = "ERR " + t; }, renderEmpty() {},
  qscreenHtml: (p, c) => `<q>${p}</q>${c}`, samMsgHtml: (a, x, size) => `<sam ${size}>${a.join(" ")}</sam>`, saleCardHtml: () => "<sale>" };
globalThis.window = { OBX, addEventListener: (k, f) => { if (k === "popstate") popstate = f; }, matchMedia: () => ({ matches: false }), scrollTo() {}, sellsForCardHtml };
globalThis.location = { search: "", pathname: "/sell" };
const states = [];
globalThis.history = { pushState: (s, t, u) => { states.push(s); addr.push(u); }, replaceState: (s, t, u) => { states.push(s); addr.push("R " + u); } };
globalThis.localStorage = { getItem: () => null, setItem() {} };
globalThis.document = { addEventListener: (k, f) => { listeners[k] = f; }, getElementById: () => null, createElement: () => ({}), head: { appendChild() {} } };
globalThis.fetch = (u, o) => { calls.push(JSON.parse(o.body)); return Promise.resolve({ json: () => Promise.resolve(replies.shift() || {}) }); };
new Function(SELL_MC_CLIENT)();
const S = window.GAS_SELL, tick = async () => { for (let i = 0; i < 4; i++) await new Promise(r => setTimeout(r, 0)); };
const chip = (key, text) => listeners.click({ preventDefault() {}, target: { closest: sel => (sel === "[data-sellchip]" ? { textContent: text, getAttribute: () => key } : null) } });
const three = () => { chip("California", "California"); chip("self", "x"); chip("none", "x"); };
const last = () => calls[calls.length - 1];
const text = () => OBX.root.innerHTML.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const PROMPT = "These sold as Convertible, Coupe and Fastback, and they price differently. Which one is it?";
const BODYQ = { tier: "body_choice", prompt: PROMPT, options: [{ label: "Convertible", car: "1965 Ford Mustang Convertible" }, { label: "Coupe", car: "1965 Ford Mustang Coupe" }, { label: "Fastback", car: "1965 Ford Mustang Fastback" }] };
const RANGE = (lo, hi, n) => ({ label: "x", make: "Ford", order: ["platform"], platform: { slug: "bringatrailer", name: "Bring a Trailer", why: "x", boxes: [], meta: [] }, marketAnswer: { cluster: [lo, hi], poolN: n, basisLine: `Based on ${n} sales, the latest in September 2026.` } });

// 1. A typed bare 1965 Ford Mustang: the typed words are read, the engine asks the body, Fastback joins the typed words,
//    and the result reads the Fastback's own range with no question repeated.
S.onCar({ resolvedCar: { year: 1965, make: "Ford", model: "Mustang" } }, "1965 ford mustang");
three(); replies = [{ question: BODYQ }]; await tick();
ok(last().step === "result" && last().car === "1965 ford mustang", "typed Mustang: the engine reads the visitor's own words");
ok(OBX.root.innerHTML.includes(`<q>${PROMPT}</q>`), "typed Mustang: the engine's body question");
replies = [RANGE(43500, 56500, 11)]; chip("2", "Fastback"); await tick();
ok(last().car === "1965 ford mustang Fastback", "typed Mustang: Fastback joins the typed words");
ok(text().includes("$43,500 to $56,500") && text().includes("Based on 11 sales") && !OBX.root.innerHTML.includes("<q>"), "typed Mustang: the Fastback's 11-sale range, no question repeated");
ok(addr.some(a => /car=1965\+ford\+mustang\+Fastback/.test(a)), "typed Mustang: the address carries the answered words, so a reload reads the same car");
// The follow-up step reads the same words.
replies = [{ reply: "ok" }];
listeners.submit({ preventDefault() {}, target: { closest: sel => (sel === "[data-sellask]" ? {} : null) } });
globalThis.document.getElementById = id => (id === "sell-askq" ? { value: "why there?" } : id === "fturns" ? { insertAdjacentHTML() {}, lastElementChild: { set outerHTML(v) {} } } : null);
listeners.submit({ preventDefault() {}, target: { closest: sel => (sel === "[data-sellask]" ? {} : null) } }); await tick();
ok(last().step === "ask" && last().car === "1965 ford mustang Fastback", "follow-up: reads the same typed words");
globalThis.document.getElementById = () => null;

// 2. A typed "2004 Porsche 911 Carrera GT": the resolver names a 911, but the engine reads the typed words; its refusal
//    shows (the engine's line), never a 911 range.
S.onCar({ resolvedCar: { year: 2004, make: "Porsche", model: "911" } }, "2004 Porsche 911 Carrera GT");
three(); replies = [{ noRange: { kind: "invariant_failed", line: "Sam could not verify this one, so no figures are shown.", card: { tier: "refusal", refusal: { kind: "invariant_failed" }, samLine: "Sam could not verify this one, so no figures are shown.", poolN: 0, cards: [] } } }]; await tick();
ok(last().car === "2004 Porsche 911 Carrera GT", "typed Carrera GT: the engine reads 'Carrera GT', not the resolver's 911");
ok(text().includes("Sam could not verify this one") && !/\$\d/.test(text()), "typed Carrera GT: the engine's refusal, no 911 range");
ok(OBX.root.innerHTML.includes("<inbox 2004 Porsche 911 Carrera GT>"), "typed Carrera GT: the search bar keeps the visitor's words");

// 3. A typed Singer: the engine's line at the hand-over, nothing read.
const n0 = calls.length;
S.onCar({ tier: "refusal", refusal: { kind: "builder_car" }, samLine: "Singer cars are not compared with standard 911s, so Sam shows no range for this car.", resolvedCar: { year: 1992, make: "Porsche", model: "911", trim: "Carrera 4" } }, "1992 Porsche 911 Carrera 4 by Singer");
await tick();
ok(calls.length === n0 && text().includes("Singer cars are not compared with standard 911s, so Sam shows no range for this car."), "typed Singer: the engine's line, no Sell read");

// 4. An unchanged plain car: typed words the same as the resolver's name read exactly as before.
S.onCar({ resolvedCar: { year: 1992, make: "Porsche", model: "911", trim: "Carrera 4" } }, "1992 Porsche 911 Carrera 4");
three(); replies = [RANGE(70000, 95000, 24)]; await tick();
ok(last().car === "1992 Porsche 911 Carrera 4" && text().includes("$70,000 to $95,000"), "plain 1992 Carrera 4: the same words, the same range");

// 5. The address path (no typed words): reads the address's car, as before.
popstate({ state: { sell: true, car: "1965 Ford Mustang Fastback", state: "California", how: "self", rush: "none" } });
replies = [RANGE(43500, 56500, 11)]; await tick();
ok(last().car === "1965 Ford Mustang Fastback", "address path: reads the address's car");
// Back to a typed entry restores its own words, never the last car's.
const typedEntry = states.find(s0 => s0 && s0.typed === "2004 Porsche 911 Carrera GT" && s0.rush);
popstate({ state: typedEntry }); replies = [{}]; await tick();
ok(typedEntry && last().car === "2004 Porsche 911 Carrera GT", "Back to a typed entry: reads that entry's own words");
popstate({ state: { sell: true, car: "1973 Porsche 911 Carrera RS", state: "California", how: "self", rush: "none" } }); replies = [{}]; await tick();
ok(last().car === "1973 Porsche 911 Carrera RS", "Back to an entry with no typed words: no stale words from another car");

console.log(`sellTypedCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
