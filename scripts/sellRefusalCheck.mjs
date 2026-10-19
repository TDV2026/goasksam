// SELL ON A REFUSAL (Sam, Oct 19 2026: "when the engine's answer is a refusal of any kind ... Sell shows the engine's own
// line and the engine's own sales rows where the engine shows them, exactly as Market Check does"; Lane C). Each refusal
// kind and a thin answer draw only the engine's card (lib/sellsForCard.js, the real one): no venue counts, why line,
// pick, partner, tiles or follow-up box. A normal range answer is unchanged. Checks noRangeOf (lib/sell/sellFacts.js),
// buildResult's order (lib/sell/sellFlow.js) and the Sell client (lib/sell/sellMcClient.js) on a stubbed page. No network.
//   node scripts/sellRefusalCheck.mjs     exit 1 on any failure.
import fs from "node:fs";
import { noRangeOf, refusalOf } from "../lib/sell/sellFacts.js";
import { SELL_MC_CLIENT } from "../lib/sell/sellMcClient.js";
import { sellsForCardHtml } from "../lib/sellsForCard.js";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const row = (price, date, title) => ({ id: "r" + price, price, date, mi: null, title, image: null, platformName: "Mecum", url: "https://example.com/lot/" + price });
const raw = (price, date, title) => ({ id: "r" + price, sale_price: price, auction_end_date: date, title, source: "Mecum" });
const KINDS = {
  thin: { tier: "refusal", refusal: { kind: "thin", model: "Citroen SM" }, thinReason: "few_sales", thinLine: "Not enough sales of this exact car to give a reliable range. These are the sales we found.", latestSaleLine: "Latest sale: May 2026.", poolN: 2, cards: [row(61000, "2026-05-02", "1971 Citroen SM"), row(48000, "2025-03-10", "1972 Citroen SM")], rawPool: [raw(61000, "2026-05-02", "1971 Citroen SM"), raw(48000, "2025-03-10", "1972 Citroen SM")] },
  varied: { tier: "refusal", refusal: { kind: "varied", model: "911" }, samLine: "Sales too spread out for a range.", poolN: 2, cards: [row(90000, "2026-02-01", "1990 Porsche 911 Carrera 4"), row(240000, "2026-01-11", "1990 Porsche 911 Carrera 4")], rawPool: [raw(90000, "2026-02-01", "x"), raw(240000, "2026-01-11", "x")] },
  invariant: { tier: "refusal", refusal: { kind: "invariant_failed", failedChecks: ["x"] }, samLine: "Sam could not verify this one, so no figures are shown.", poolN: 0, cards: [], rawPool: [] },
  thinTier: { tier: "thin", thinReason: "house_share", thinLine: "The sales of this car are too one-sided to mark a range from. These are the sales we found.", latestSaleLine: "Latest sale: October 2025.", poolN: 2, cards: [row(132500, "2024-01-12", "2000 Ford Mustang SVT Cobra R"), row(47300, "2025-10-03", "2000 Ford Mustang SVT Cobra R")], rawPool: [] }
};
const RANGE = { tier: "result", cluster: [70000, 95000], poolN: 24, basisLine: "Based on 24 sales, the latest in September 2026.", cards: [], rawPool: [] };

// 1. noRangeOf: every refusal kind and a thin answer; never a range, never a builder car.
for (const [k, d] of Object.entries(KINDS)) {
  const n = noRangeOf(d);
  ok(n && n.card && n.line === (d.thinLine || d.samLine), `${k}: the engine's own line`);
  ok(n && !("rawPool" in n.card) && (n.card.cards || []).length === d.cards.length, `${k}: the engine's own rows, its card fields only`);
}
ok(noRangeOf(RANGE) === null, "a normal range answer: not a refusal");
ok(noRangeOf({ tier: "refusal", refusal: { kind: "builder_car" }, samLine: "Singer cars are not compared with standard 911s, so Sam shows no range for this car." }) === null && refusalOf({ tier: "refusal", refusal: { kind: "builder_car" }, samLine: "x" }), "a builder car stays on its own line-only path");
ok(noRangeOf(null) === null, "no answer: nothing");

// 2. buildResult: a refusal returns before any venue, pick, partner or tile read, carrying only the engine's card.
const flow = fs.readFileSync(new URL("../lib/sell/sellFlow.js", import.meta.url), "utf8");
const br = flow.slice(flow.indexOf("export async function buildResult("));
const at = br.indexOf("if (first.noRange) return");
ok(at > 0 && at < br.indexOf("sellFactsFor(car)") && at < br.indexOf("pickPlatform(") && at < br.indexOf("partnerFor("), "buildResult: a refusal returns before any venue, pick, partner or tile read");
ok(/if \(first\.noRange\) return \{[^}]*noRange: first\.noRange \}/.test(br) && !/if \(first\.noRange\) return \{[^}]*(places|platform|partner|tiles|recent|marketAnswer)/.test(br), "buildResult: the refusal carries nothing but the engine's card");

// 3. The client on a stubbed page, with the real shared card.
const listeners = {}, calls = [];
let replies = [];
const OBX = { root: { innerHTML: "" }, esc: s => String(s), inboxHtml: () => "<inbox>", footHtml: () => "<foot>", wire() {}, renderError(t) { OBX.root.innerHTML = "ERR " + t; }, renderEmpty() {},
  qscreenHtml: (p, c, eb) => `<q>${p}</q>${c}`, samMsgHtml: (a, x, size) => `<sam ${size}>${a.join(" ")}</sam>`, saleCardHtml: () => "<sale>" };
globalThis.window = { OBX, addEventListener() {}, matchMedia: () => ({ matches: false }), scrollTo() {}, sellsForCardHtml };
globalThis.location = { search: "", pathname: "/sell" };
globalThis.history = { pushState() {}, replaceState() {} };
globalThis.localStorage = { getItem: () => null, setItem() {} };
globalThis.document = { addEventListener: (k, f) => { listeners[k] = f; }, getElementById: () => null, createElement: () => ({}), head: { appendChild() {} } };
globalThis.fetch = (u, o) => { calls.push(JSON.parse(o.body)); return Promise.resolve({ json: () => Promise.resolve(replies.shift() || {}) }); };
new Function(SELL_MC_CLIENT)();
const S = window.GAS_SELL, tick = () => new Promise(r => setTimeout(r, 0));
const chip = (key, text) => listeners.click({ preventDefault() {}, target: { closest: sel => (sel === "[data-sellchip]" ? { textContent: text, getAttribute: () => key } : null) } });
async function run(label, reply) { S.onCar({ resolvedCar: { year: 1990, make: "Porsche", model: "911" } }, label); chip("California", "California"); chip("self", "x"); chip("none", "x"); replies = [reply]; await tick(); await tick(); await tick(); return OBX.root.innerHTML; }
const NO_OURS = /pcard|sell-ps|Ask Sam about this|data-sellchip|sell-for|Analysis window|Sam would sell|\b\d+ of \d+\b/;
for (const [k, d] of Object.entries(KINDS)) {
  const h = await run("car " + k, { label: "car " + k, noRange: noRangeOf(d) });
  const text = h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  ok(text.includes(d.thinLine || d.samLine), `${k}: the engine's line shows`);
  ok(d.cards.every(c => h.includes("$" + c.price.toLocaleString("en-US"))) && (h.match(/class="sfc-row"/g) || []).length === d.cards.length, `${k}: exactly the engine's rows`);
  ok(!NO_OURS.test(h), `${k}: no pick, why line, venue count, partner, tiles or follow-up box`);
  ok(!/Mecum|example\.com/.test(h), `${k}: no venue name or sale link of ours`);
  ok(h.includes("<inbox>") && h.includes("<foot>"), `${k}: the search bar stays`);
}
// A card that draws nothing (no line, no rows): the engine's line alone, else an honest error, never an empty screen.
const empty = await run("car empty", { noRange: { kind: "invariant_failed", line: "Sam could not verify this one, so no figures are shown.", card: {} } });
ok(empty.includes("<sam big>Sam could not verify this one, so no figures are shown.</sam>"), "a card that draws nothing: the engine's line in the message style");
// A normal range answer (a plain 1992 Carrera 4): unchanged.
const plain = await run("1992 Porsche 911 Carrera 4", { label: "1992 Porsche 911 Carrera 4", make: "Porsche", order: ["platform"], platform: { slug: "bringatrailer", name: "Bring a Trailer", why: "x", boxes: [], meta: [] }, marketAnswer: { cluster: [70000, 95000], poolN: 24, basisLine: "Based on 24 sales, the latest in September 2026." } });
const plainText = plain.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
ok(plainText.includes("$70,000 to $95,000") && plain.includes("Based on 24 sales, the latest in September 2026.") && plain.includes("Ask Sam about this") && /pcard/.test(plain), "normal range answer: unchanged (pick card, the shared card, the follow-up box)");

console.log(`sellRefusalCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
