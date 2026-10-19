// A BUILDER CAR IS NEVER COMPARED ON SELL (Sam's Singer rule, Oct 19 2026, e68; Lane C as integrator). When the engine
// refuses a car as a builder's car (refusal kind builder_car), Sell shows the engine's own line alone: no venue counts,
// no why line, no pick, no partner, no card, no sales list, no follow-up box. Every other answer is unchanged. Checks:
// refusalOf (lib/sell/sellFacts.js), buildResult returns before any read of its own (lib/sell/sellFlow.js), and the Sell
// client (lib/sell/sellMcClient.js) on a stubbed page, for a Singer and a plain 1992 Carrera 4. No network.
//   node scripts/sellBuilderCheck.mjs     exit 1 on any failure.
import fs from "node:fs";
import { refusalOf } from "../lib/sell/sellFacts.js";
import { SELL_MC_CLIENT } from "../lib/sell/sellMcClient.js";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const LINE = "Singer cars are not compared with standard 911s. Sam shows no range for this car.";
const SINGER = { tier: "refusal", refusal: { kind: "builder_car", builder: "Singer" }, samLine: LINE, poolN: 0, soldCount: null, soldCountN: 0 };

// 1. refusalOf: builder_car only, the engine's own line.
ok(JSON.stringify(refusalOf(SINGER)) === JSON.stringify({ kind: "builder_car", line: LINE }), "builder_car: the engine's line, verbatim");
ok(refusalOf({ ...SINGER, samLine: "" }) === null, "builder_car with no engine line: nothing of ours");
ok(refusalOf({ tier: "refusal", refusal: { kind: "invariant_failed" }, samLine: "Sam could not verify this one, so no figures are shown." }) === null, "other refusal kinds: unchanged here (invariant)");
ok(refusalOf({ tier: "refusal", refusal: { kind: "thin" }, samLine: "x" }) === null, "other refusal kinds: unchanged here (thin)");
ok(refusalOf({ tier: "result", cluster: [60000, 90000], poolN: 30 }) === null && refusalOf(null) === null, "a range or no answer: no refusal");

// 2. buildResult: the refusal returns before the facts, the pick or the partner are read.
const flow = fs.readFileSync(new URL("../lib/sell/sellFlow.js", import.meta.url), "utf8");
const br = flow.slice(flow.indexOf("export async function buildResult("));
const at = br.indexOf("if (first.refusal) return");
ok(at > 0 && at < br.indexOf("sellFactsFor(car)") && at < br.indexOf("pickPlatform(") && at < br.indexOf("partnerFor("), "buildResult: the refusal returns before any venue, pick or partner read");
ok(/if \(first\.refusal\) return \{[^}]*refusal: first\.refusal \}/.test(br) && !/if \(first\.refusal\) return \{[^}]*(places|platform|partner|marketAnswer|recent)/.test(br), "buildResult: the refusal carries nothing but the engine's line");

// 3. The client on a stubbed page.
const listeners = {}, calls = [];
let replies = [];
const OBX = { root: { innerHTML: "" }, esc: s => String(s), inboxHtml: () => "<inbox>", footHtml: () => "<foot>", wire() {}, renderError(t) { OBX.root.innerHTML = "ERR " + t; }, renderEmpty() {},
  qscreenHtml: (p, c, eb) => `<eyebrow>${eb}</eyebrow><q>${p}</q>${c}`, samMsgHtml: (a, x, size) => `<sam ${size}>${a.join(" ")}</sam>`, saleCardHtml: () => "<sale>" };
globalThis.window = { OBX, addEventListener() {}, matchMedia: () => ({ matches: false }), scrollTo() {}, sellsForCardHtml: d => `<card ${d.cluster ? "$" + d.cluster[0] : ""}>` };
globalThis.location = { search: "", pathname: "/sell" };
globalThis.history = { pushState() {}, replaceState() {} };
globalThis.localStorage = { getItem: () => null, setItem() {} };
globalThis.document = { addEventListener: (k, f) => { listeners[k] = f; }, getElementById: () => null, createElement: () => ({}), head: { appendChild() {} } };
globalThis.fetch = (u, o) => { calls.push(JSON.parse(o.body)); return Promise.resolve({ json: () => Promise.resolve(replies.shift() || {}) }); };
new Function(SELL_MC_CLIENT)();
const S = window.GAS_SELL, tick = () => new Promise(r => setTimeout(r, 0));
const chip = (key, text) => listeners.click({ preventDefault() {}, target: { closest: sel => (sel === "[data-sellchip]" ? { textContent: text, getAttribute: () => key } : null) } });
async function run(rc, typed, reply) { S.onCar({ resolvedCar: rc }, typed); chip("California", "California"); chip("self", "x"); chip("none", "x"); replies = [reply]; await tick(); await tick(); await tick(); return OBX.root.innerHTML; }
// Singer
const singer = await run({ year: 1990, make: "Porsche", model: "911", trim: "Singer" }, "Singer 911", { label: "1990 Porsche 911 Singer", make: "Porsche", refusal: { kind: "builder_car", line: LINE } });
ok(singer.includes(`<sam big>${LINE}</sam>`), "Singer: the engine's line, in the existing message style");
ok(!/\$\d/.test(singer) && !/\b\d+ (sales|of)\b/.test(singer), "Singer: no figure, no count");
ok(!/<card|<sale>|pcard|Ask Sam about this|data-sellchip/.test(singer), "Singer: no card, no sales list, no pick or partner card, no follow-up box, no chips");
ok(singer.includes("<inbox>") && singer.includes("<foot>"), "Singer: the search bar stays, so another car can be typed");
// A plain 1992 Carrera 4: unchanged, the result draws its cards, the shared card and the follow-up box.
const plain = await run({ year: 1992, make: "Porsche", model: "911", trim: "Carrera 4" }, "1992 Porsche 911 Carrera 4",
  { label: "1992 Porsche 911 Carrera 4", make: "Porsche", order: ["platform"], platform: { slug: "bringatrailer", name: "Bring a Trailer", why: "x", boxes: [], meta: [] }, marketAnswer: { cluster: [70000, 95000], poolN: 24 } });
ok(calls[calls.length - 1].car === "1992 Porsche 911 Carrera 4", "1992 Carrera 4: the result is read for the car as named");
ok(/<card \$70000>/.test(plain) && plain.includes("Ask Sam about this") && !plain.includes(LINE), "1992 Carrera 4: unchanged, the shared card and the follow-up box, no refusal line");

console.log(`sellBuilderCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
