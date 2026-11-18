// SELL ON A REFUSAL (Sam, Oct 19 2026: "when the engine's answer is a refusal of any kind ... Sell shows the engine's own
// line and the engine's own sales rows where the engine shows them, exactly as Market Check does"; Lane C). Each refusal
// kind and a thin answer draw only the engine's card (lib/sellsForCard.js, the real one): no venue counts, why line,
// pick, partner, tiles or follow-up box. A normal range answer is unchanged. Checks noRangeOf (lib/sell/sellFacts.js),
// buildResult's order (lib/sell/sellFlow.js) and the Sell client (lib/sell/sellMcClient.js) on a stubbed page. No network.
//   node scripts/sellRefusalCheck.mjs     exit 1 on any failure.
import fs from "node:fs";
import { spawnSync } from "node:child_process"; import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
// MUTANTS (lane-b-sell-nolump): node scripts/sellRefusalCheck.mjs --mutants, in a COPY of the repo; each must fail the check.
if (process.argv.includes("--mutants")) {
  const R = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
  const M = [
    ["a no-range answer stops Sell on the server again", "lib/sell/sellFlow.js", "  const noRange = first.noRange ? {", "  if (first.noRange) return done({ ...head, noRange: first.noRange });\n  const noRange = first.noRange ? {"],
    ["the client stops on the engine's card again", "lib/sell/sellMcClient.js", "if (nrj) j.marketAnswer = nrj.card || {};", "if (nrj) { stopWait(); S.result = j; refusalScreen(nrj.line || \"\"); return; }"],
    ["the result drops the price line", "lib/sell/sellFlow.js", "...(noRange ? { noRange, priceLine: noRange.priceLine } : {}),", "...(noRange ? { noRange } : {}),"],
    ["the client does not print the price line in the result", "lib/sell/sellMcClient.js", "    if (j && j.priceLine) h += x.samMsgHtml", "    if (false) h += x.samMsgHtml"],
    ["the price line is not printed while the rest loads", "lib/sell/sellMcClient.js", "(nrj && nrj.priceLine ? X().samMsgHtml([e(nrj.priceLine)], \"\", \"big\") : \"\") + (nrj && nrj.line", "\"\" + (nrj && nrj.line"],
    ["the price line counts a number of its own", "lib/sell/sellFacts.js", "const n = Number(nr.total) || 0,", "const n = Number(nr.total) || 7,"],
    ["the price line states a dollar figure", "lib/reasonWords.js", "only ${p.total} on record. Here is where", "only ${p.total} on record, about $50,000. Here is where"],
    ["the engine's card is not where the range card stands", "lib/sell/sellMcClient.js", "if (nrj) j.marketAnswer = nrj.card || {};", "if (nrj) j.marketAnswer = {};"],
    ["a builder car is let through to the pick", "lib/sell/sellFlow.js", "  if (first.refusal) return done({ ...head, refusal: first.refusal });\n  if (first.question)", "  if (first.question)"],
    ["the not-seen line counts only the places read", "lib/sell/sellFlow.js", "const salesN = Math.max(Number(p0.total) || 0, Number(noRange && noRange.total) || 0, list.length);", "const salesN = Number(p0.total) || 0;"],
    ["the not-seen line ignores the sales the page lists", "lib/sell/sellFlow.js", "Number(noRange && noRange.total) || 0, list.length);", "Number(noRange && noRange.total) || 0);"],
    ["the not-seen line ignores the engine's total", "lib/sell/sellFlow.js", "Number(p0.total) || 0, Number(noRange && noRange.total) || 0, list.length);", "Number(p0.total) || 0, list.length);"],
    ["buildResult prints its own not-seen line", "lib/sell/sellFlow.js", "empty: emptyLine,", "empty: !platform && !partner ? (note || \"Sam has not seen this car sell yet, so there is no place on record to point to.\") : null,"],
    ["the client ignores the cards of the way in", "lib/sell/sellMcClient.js", "if (d && d.variantSplit && d.variantSplit.show === true) {", "if (false) {"],
    ["the client ignores the cards of the range step", "lib/sell/sellMcClient.js", "if (j && j.split && j.split.show === true) {", "if (false) {"],
    ["the cards link to the Market Check address, not Sell's", "lib/sell/sellMcClient.js", 'CARDS(vs, "sellAddress")', 'CARDS(vs)'],
    ["the range step drops the cards", "lib/sell/sellFlow.js", "  if (first && first.split) return { ...head, split: first.split };", ""],
    ["the rest of Sell builds the blend's decision beside the cards", "lib/sell/sellFlow.js", "  if (first.split) return done({ ...head, split: first.split });", ""],
    ["Sell never reads the cards", "lib/sell/sellBlock.js", "if (!VARIANT_SPLIT_PUBLIC || !d ||", "if (true || !d ||"],
    ["the cards of a block are not kept", "lib/sell/sellBlock.js", "if (sp) first.split = sp; }\n  const base", "}\n  const base"],
    ["the page never asks for the cards before the first question", "lib/sell/sellMcClient.js", "    if (!key || S.cardsFor === key) { next(); return; }", "    next(); return;"],
    ["the cards are asked again and again", "lib/sell/sellMcClient.js", "S.cardsFor = key; S.busy = true;", "S.busy = true;"],
    ["a failed cards read blocks Sell", "lib/sell/sellMcClient.js", "}).catch(function(){ if (seq0 === S.seq) { stopWait(); S.busy = false; next(); } });", "}).catch(function(){});"],
    ["a VIN is asked for its cards", "lib/sell/sellMcClient.js", "S.cardsFor = engineCar();   // a VIN names its car", "   // a VIN names its car"],
    ["the cards step is not in the server", "api/sellChat.js", 'if (b.step === "cards")', 'if (b.step === "cardsX")'],
    ["the range step carries no price line", "lib/sell/sellFlow.js", "noRange: { ...first.noRange, priceLine: first.noRange.priceLine || priceLineOf(first.noRange) } };", "noRange: first.noRange };"],
  ];
  let bad = 0; const me = fileURLToPath(import.meta.url);
  for (const [name, file, from, to] of M) {
    const tmp = fs.mkdtempSync(path.join(fs.realpathSync("/tmp"), "sr-"));
    try {
      for (const d of ["lib", "api", "data", "package.json"]) spawnSync("cp", ["-R", path.join(R, d), tmp]);
      fs.mkdirSync(path.join(tmp, "scripts")); spawnSync("cp", [me, path.join(tmp, "scripts/")]); fs.symlinkSync(path.join(R, "node_modules"), path.join(tmp, "node_modules"));
      const f = path.join(tmp, file), src = fs.readFileSync(f, "utf8");
      if (src.split(from).length !== 2) { console.log("MISSED   " + name + " (target text not exactly once in " + file + ")"); bad++; continue; }
      fs.writeFileSync(f, src.replace(from, () => to));
      const r = spawnSync(process.execPath, [path.join(tmp, "scripts/sellRefusalCheck.mjs")], { encoding: "utf8", timeout: 240000, cwd: tmp }); const caught = r.status !== 0;
      console.log((caught ? "caught   " : "MISSED   ") + name); if (!caught) bad++;
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }
  console.log(bad ? "sellRefusalCheck mutants: " + bad + " not caught" : "sellRefusalCheck mutants: all " + M.length + " caught"); process.exit(bad ? 1 : 0);
}
import { noRangeOf, refusalOf } from "../lib/sell/sellFacts.js";
import { rangeFromAnswer } from "../lib/sell/sellFlow.js";
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
ok(noRangeOf({ tier: "refusal", refusal: { kind: "builder_car" }, samLine: "Singer cars are not compared with standard 911s, so no range is shown." }) === null && refusalOf({ tier: "refusal", refusal: { kind: "builder_car" }, samLine: "x" }), "a builder car stays on its own line-only path");
ok(noRangeOf(null) === null, "no answer: nothing");

// 2. buildResult (lane-b-sell-nolump, Nov 18 2026, Sam's live "Ferrari 330 GT"; this reverses Sam's Oct 19 rule that Sell stops on the engine's card): no range does NOT stop Sell. The result is built the whole way (the pick and its reasons, the house record, the partner), carrying the engine's no-range card and the one line about price. A builder car still stops.
const flow = fs.readFileSync(new URL("../lib/sell/sellFlow.js", import.meta.url), "utf8");
const br = flow.slice(flow.indexOf("export async function buildResult("));
ok(!/if \(first\.noRange\) return/.test(br), "buildResult: a no-range answer does not return before the pick, the partner and the house record");
ok(/if \(first\.refusal\) return done\(\{ \.\.\.head, refusal: first\.refusal \}\)/.test(br), "buildResult: a builder car (the Singer rule) still returns its line alone");
ok(/\.\.\.\(noRange \? \{ noRange, priceLine: noRange\.priceLine \} : \{\}\)/.test(br) && /marketAnswer: noRange \? null/.test(br), "buildResult: the result carries the engine's no-range card and the price line, and no range card");
// THE PRICE LINE: Sam's voice, the engine's count, nothing invented
for (const [code, total, re] of [["mixed_cars", 158, /158 sales on record are different cars at different prices/], ["varied", 12, /12 sales on record are too spread out/], ["few_sales", 3, /only 3 sales on record/], ["few_comparable", 9, /only 9 sales on record/], ["no_cluster", 20, /^I can't put a price range on this one\./], ["few_sales", null, /^I can't put a price range on this one\. Here/], [null, null, /^I can't put a price range on this one\./]]) {
  const nr = noRangeOf({ tier: "refusal", refusal: { kind: "varied" }, samLine: "x", noRangeCode: code, noRangeTotal: total, cards: [], rawPool: [] }), line = nr && nr.priceLine;
  ok(typeof line === "string" && re.test(line) && /Here is where I would sell it, from the sales I do have\./.test(line), `price line (${code}, ${total}): ${line}`);
  ok(!/[\u2013\u2014]|\$|worth|valu/i.test(line || "") && ((line || "").match(/\d+/g) || []).every(x => Number(x) === total), `price line (${code}): no dash, no dollar figure, no valuation word, and no number but the engine's count`);
}

// 3. The client on a stubbed page, with the real shared card (every entry; see the entries below).
const listeners = {}, calls = [];
let replies = [];
const OBX = { root: { innerHTML: "" }, esc: s => String(s), inboxHtml: () => "<inbox>", footHtml: () => "<foot>", wire() {}, renderError(t) { OBX.root.innerHTML = "ERR " + t; }, renderCouldNot() { OBX.root.innerHTML = "ERR Sam couldn't read this one yet."; }, renderEmpty() {},
  qscreenHtml: (p, c, eb) => `<q>${p}</q>${c}`, samMsgHtml: (a, x, size) => `<sam ${size}>${a.join(" ")}</sam>`, saleCardHtml: () => "<sale>" };
globalThis.window = { OBX, addEventListener() {}, matchMedia: () => ({ matches: false }), scrollTo() {}, sellsForCardHtml };
globalThis.location = { search: "", pathname: "/sell" };
globalThis.history = { pushState() {}, replaceState() {} };
globalThis.localStorage = { getItem: () => null, setItem() {} };
globalThis.document = { addEventListener: (k, f) => { listeners[k] = f; }, getElementById: id => id === "sell-slot" ? { set innerHTML(v) { OBX.root.innerHTML = OBX.root.innerHTML.replace(/<div id="sell-slot">[\s\S]*?<\/div><\/div>/, () => '<div id="sell-slot">' + v + "</div>"); } } : id === "sell-sales" ? { set innerHTML(v) { OBX.root.innerHTML = OBX.root.innerHTML.replace(/<div id="sell-sales">[\s\S]*?<\/div>/, () => '<div id="sell-sales">' + v + "</div>"); } } : null, createElement: () => ({}), head: { appendChild() {} } };
const cardCalls = []; let cardsReply = { split: null };   // the cards step (lane-b-sell-cards-first) is read before the first question; the stub answers it apart from the queue of the other steps
globalThis.fetch = (u, o) => { const b0 = JSON.parse(o.body); if (b0.step === "cards") { cardCalls.push(b0); return Promise.resolve({ json: () => Promise.resolve(cardsReply) }); } calls.push(b0); return Promise.resolve({ json: () => Promise.resolve(replies.shift() || {}) }); };
new Function(SELL_MC_CLIENT)();
let S = window.GAS_SELL; const tick = () => new Promise(r => setTimeout(r, 0));
const tickN = async () => { for (let i = 0; i < 5; i++) await tick(); };
const chip = (key, text) => listeners.click({ preventDefault() {}, target: { closest: sel => (sel === "[data-sellchip]" ? { textContent: text, getAttribute: () => key } : null) } });
async function run(label, reply) { S.onCar({ resolvedCar: { year: 1990, make: "Porsche", model: "911" } }, label); await tickN(); chip("California", "California"); chip("self", "x"); chip("none", "x"); replies = reply && reply.marketAnswer && !reply.noRange && !reply.refusal && !reply.question ? [{ label: reply.label, make: reply.make, marketAnswer: reply.marketAnswer }, reply] : [reply]; await tick(); await tick(); await tick(); return OBX.root.innerHTML; }
// THE ENTRIES (Sam's list: typed words, the car bar token, a VIN, the finish and the email): each ends on the same thing for a no-range answer: the engine's card where the range card stands, the one price line, then the decision (the pick and its reasons, the partner, the latest sales).
const PICK = { slug: "bringatrailer", name: "Bring a Trailer", why: "Of the 41 sales on record, 30 sold on Bring a Trailer.", boxes: [], meta: [], house: false };
const PARTNER = { slug: "hows", name: "Howard S", first: "Howard", intro: "Howard handles cars like this.", tiles: [], about: "Howard handles cars like this." };
const restFor = (nr, extra = {}) => ({ label: "car", make: "Ferrari", order: ["platform", "partner"], platform: PICK, partner: PARTNER, carLine: { title: "Ferrari 330 GT", generation: null, span: null }, noRange: nr, priceLine: nr.priceLine, recent: [{ title: "1967 Ferrari 330 GTC", house: "Bring a Trailer", date: "2026-11-13", price: 791000, url: "https://example.com/x", photo: null }], marketAnswer: null, ...extra });
const NO_SELL_LEFT = /Sam could not verify/;
async function enter(how, kind, d) {
  const nr = noRangeOf(d); calls.length = 0; globalThis.location = { search: "", pathname: "/sell" };
  replies = [{ label: "car", make: "Ferrari", noRange: nr }, restFor(nr)];
  if (how === "bar") {   // the car bar: the address of a result opened with the car in hand (the token's words), the answers in the address
    globalThis.location = { search: "?car=Ferrari%20330%20GT&state=California&how=self&rush=none", pathname: "/sell" }; new Function(SELL_MC_CLIENT)(); window.GAS_SELL.homeHtml(() => "<inbox>"); for (let i = 0; i < 10; i++) await tick(); return { html: OBX.root.innerHTML, calls: calls.slice() };
  }
  new Function(SELL_MC_CLIENT)(); const S2 = window.GAS_SELL;
  if (how === "vin") S2.onCar({ resolvedCar: { year: 1990, make: "Porsche", model: "911" } }, "WP0AB0912LS450001"); else S2.onCar({ resolvedCar: { year: null, make: "Ferrari", model: "330 GT" } }, "Ferrari 330 GT");
  await tickN(); chip("California", "California"); chip("self", "x"); chip("none", "x");
  for (let i = 0; i < 10; i++) await tick();
  return { html: OBX.root.innerHTML, calls: calls.slice() };
}
for (const how of ["typed", "bar", "vin"]) for (const [k, d] of Object.entries(KINDS)) {
  const { html: h, calls: cs } = await enter(how, k, d), text = h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "), nr = noRangeOf(d);
  ok(cs.length === 2 && cs[0].step === "range" && cs[1].step === "rest" && cs[0].car === cs[1].car, `${how}/${k}: Sell asks for the range and then for the rest, the same car both times (${cs.map(c => c.step).join(",")})`);
  if (how === "vin") ok(!/WP0AB0912LS450001/.test(JSON.stringify(cs)), `${how}/${k}: the VIN is in no request (the resolver's car name is)`);
  ok(text.includes(d.thinLine || d.samLine), `${how}/${k}: the engine's own line shows`);
  ok(d.cards.every(c => h.includes("$" + c.price.toLocaleString("en-US"))) && (h.match(/class="sfc-row"/g) || []).length === d.cards.length, `${how}/${k}: exactly the engine's rows, where the range card stands`);
  ok(text.includes(nr.priceLine), `${how}/${k}: the one line about price is printed (the engine's words)`);
  ok(/pcard/.test(h) && text.includes("Bring a Trailer") && text.includes("Of the 41 sales on record, 30 sold on Bring a Trailer."), `${how}/${k}: Sell still gives where to sell it, with its reasons (the pick card)`);
  ok(/sell-ps/.test(h) && text.includes("Howard"), `${how}/${k}: the PowerSeller is still offered`);
  ok(text.includes("The latest sales") && h.includes("<sale>"), `${how}/${k}: the latest sales are shown`);
  ok(h.includes("<inbox>") && h.includes("<foot>"), `${how}/${k}: the search bar stays`);
}
// THE FINISH AND THE EMAIL: on a no-range result the PowerSeller's email form sends the lead for the car, as on any result
{ calls.length = 0; const sent = []; const f0 = globalThis.fetch;
  const { html } = await enter("typed", "varied", KINDS.varied); ok(/class="sell-ps"/.test(html), "the finish: the email form is on a no-range result");
  globalThis.fetch = (u, o) => { if (/submitSellerLead/.test(u)) { sent.push(JSON.parse(o.body)); return Promise.resolve({ json: () => Promise.resolve({ ok: true, reference: "r1" }) }); } return f0(u, o); };
  const input = { value: "buyer@example.com" }, btn = {}, form = { querySelector: sel => sel === "input" ? input : btn, nextElementSibling: {}, getAttribute: k => k === "data-name" ? "Howard S" : "hows" };
  listeners.submit({ preventDefault() {}, target: { closest: sel => sel === ".sell-ps" ? form : null } }); for (let i = 0; i < 4; i++) await tick();
  ok(sent.length === 1 && sent[0].seller.email === "buyer@example.com" && /Ferrari 330 GT/.test(sent[0].car.raw) && sent[0].choice.destinationType === "powerseller", "the email: one lead for the car, single destination, sent from a no-range result");
  globalThis.fetch = f0; }
// WHILE THE REST LOADS the seller already has the engine's card and the one line about price (the rest step never answers here)
{ calls.length = 0; new Function(SELL_MC_CLIENT)(); const nr = noRangeOf(KINDS.varied); replies = [{ label: "car", make: "Ferrari", noRange: nr }, new Promise(() => {})]; window.GAS_SELL.onCar({ resolvedCar: { year: null, make: "Ferrari", model: "330 GT" } }, "Ferrari 330 GT"); await tickN(); chip("California", "California"); chip("self", "x"); chip("none", "x"); for (let i = 0; i < 8; i++) await tick();
  const h = OBX.root.innerHTML, text = h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "); ok(text.includes(nr.priceLine) && text.includes(KINDS.varied.samLine) && !/pcard/.test(h), "while the rest loads: the price line and the engine's line are already on the page"); }
// A STORED BLOCK from before this change carries no price line: the range step adds it
{ const old = { kind: "varied", line: "x", card: null, code: "mixed_cars", total: 40 }, r = rangeFromAnswer({}, null, { noRange: old }, {}, null); ok(r.noRange && /40 sales on record are different cars at different prices/.test(r.noRange.priceLine), "the range step gives a stored no-range block its price line"); }
// A BUILDER CAR (the Singer rule) still stops on its own line: no range, and nothing else is read
{ const { html } = await (async () => { calls.length = 0; new Function(SELL_MC_CLIENT)(); const S = window.GAS_SELL; replies = [{ label: "x", refusal: { kind: "builder_car", line: "Singer cars are not compared with standard 911s, so no range is shown." } }]; S.onCar({ resolvedCar: { year: 1990, make: "Porsche", model: "911" } }, "Singer 911"); await tickN(); chip("California", "California"); chip("self", "x"); chip("none", "x"); for (let i = 0; i < 6; i++) await tick(); return { html: OBX.root.innerHTML }; })();
  ok(html.includes("Singer cars are not compared") && !/pcard|sell-ps/.test(html) && calls.length === 1, "a builder car: the engine's line alone, one request, no pick and no partner"); }
// A card that draws nothing (no line, no rows): the engine's line alone, then still the decision; never an empty screen.
{ calls.length = 0; new Function(SELL_MC_CLIENT)(); const S = window.GAS_SELL; const nr = { kind: "invariant_failed", line: "Sam could not verify this one, so no figures are shown.", card: {}, priceLine: "I can't put a price range on this one. Here is where I would sell it, from the sales I do have." };
  replies = [{ label: "car", make: "Ferrari", noRange: nr }, restFor(nr)]; S.onCar({ resolvedCar: { year: null, make: "Ferrari", model: "330 GT" } }, "Ferrari 330 GT"); await tickN(); chip("California", "California"); chip("self", "x"); chip("none", "x"); for (let i = 0; i < 8; i++) await tick();
  const h = OBX.root.innerHTML; if (process.env.DBG) console.log("DBG", h.slice(0, 700)); ok(h.includes("Sam could not verify this one") && /pcard/.test(h), "a card that draws nothing: the engine's line in the message style, then the pick"); }
new Function(SELL_MC_CLIENT)(); S = window.GAS_SELL;
// A normal range answer (a plain 1992 Carrera 4): unchanged.
const plain = await run("1992 Porsche 911 Carrera 4", { label: "1992 Porsche 911 Carrera 4", make: "Porsche", order: ["platform"], platform: { slug: "bringatrailer", name: "Bring a Trailer", why: "x", boxes: [], meta: [] }, marketAnswer: { cluster: [70000, 95000], poolN: 24, basisLine: "Based on 24 sales, the latest in September 2026." } });
const plainText = plain.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
ok(plainText.includes("$70,000 to $95,000") && plain.includes("Based on 24 sales, the latest in September 2026.") && !plain.includes("Ask Sam about this") && !plain.includes("sell-ask") && /pcard/.test(plain), "normal range answer: unchanged (pick card, the shared card), no Ask Sam section");

// THE CARDS ON SELL (lane-b-sell-nolump-3, Nov 18 2026; Sam: "Sell must know which car is being sold ... tapping a card starts Sell for that exact car with the car bar carrying it. No mixed list"). Live, Sell for "Ferrari 330 GT" printed the engine's "different cars" line and ten sales of both cars in one list. THE SHAPE is the live variantSplit of "Ferrari 330 GT" (Nov 18 2026: GT 2+2 $268,000 to $314,000 ten sales; GTC $479,000 to $600,000 12 sales; GTS seven sales, too few) with the engine's Sell address on each car.
// CAUSE: Sell read the blended answer's own card (noRange) and the pool's sales; the cards (variantSplit) were computed only in the way in's request (api/sellerDecision.js), never in Sell's. EVERY ENTRY: the typed words and a partial car's chosen model (the way in's answer carries the cards: shown before any question), the car bar token or a pasted address (the range step carries them), the finish and the email (a result is only ever for ONE car: the cards carry no pick, partner or email form; the tapped car's Sell is the normal result, which has them).
const mk = (label, rangeText, salesText, n, fewText) => ({ label, name: label, priced: !!rangeText, rangeText, salesText, n, ...(fewText ? { fewText } : {}), mileageNote: null, car: { token: "v1.tok" + label.replace(/\W/g, ""), words: "Ferrari 330 " + label, address: "/market-check?q=" + encodeURIComponent("Ferrari 330 " + label), sellAddress: "/sell?car=v1.tok" + label.replace(/\W/g, ""), line: "Ferrari 330 " + label, short: "330" } });
const SPLIT330 = { show: true, line: "A 330 GT's price depends on which one it is.", rows: [mk("GT 2+2", "$268,000 to $314,000", "ten sales", 10), mk("GTC", "$479,000 to $600,000", "12 sales", 12), mk("GTS", null, "seven sales", 7, "Too few sales for a range.")], mileageLine: "The range is for all mileages.", asideLine: null };
for (const how of ["typed", "bar", "partial"]) {
  calls.length = 0; globalThis.location = { search: "", pathname: "/sell" }; new Function(SELL_MC_CLIENT)(); const S3 = window.GAS_SELL;
  let h3;
  if (how === "bar") { replies = [{ label: "Ferrari 330 GT", make: "Ferrari", split: SPLIT330 }, restFor(noRangeOf(KINDS.varied))]; globalThis.location = { search: "?car=Ferrari%20330%20GT&state=California&how=self&rush=none", pathname: "/sell" }; new Function(SELL_MC_CLIENT)(); window.GAS_SELL.homeHtml(() => "<inbox>"); for (let i = 0; i < 10; i++) await tick(); h3 = OBX.root.innerHTML; }
  else { replies = []; if (how === "partial") S3.homeHtml(() => "<inbox>"); S3.onCar({ resolvedCar: { year: null, make: "Ferrari", model: "330 GT" }, variantSplit: SPLIT330 }, "Ferrari 330 GT"); for (let i = 0; i < 6; i++) await tick(); h3 = OBX.root.innerHTML; }
  const t3 = h3.replace(/<[^>]+>/g, " ").replace(/&#39;/g, "'").replace(/\s+/g, " ");
  ok(SPLIT330.rows.every(r => h3.includes('href="' + r.car.sellAddress + '"') && t3.includes(r.label) && t3.includes(r.salesText)), `${how}: Sell shows one card per car, each a link to Sell for that exact car (its token), each with its count`);
  ok(t3.includes("$268,000 to $314,000") && t3.includes("$479,000 to $600,000") && t3.includes("Too few sales for a range.") && t3.includes(SPLIT330.line), `${how}: the engine's own words (the line, each range, the too-few line), none of the page's`);
  ok(!/<q>|pcard|sell-ps|<sale>|sfc-row|Latest sales|The latest sales|different cars at different prices/.test(h3), `${how}: no question yet, no mixed sales list, no pick, no PowerSeller, no email form, no engine card for the blend`);
  ok(h3.includes("<inbox>") && h3.includes("<foot>"), `${how}: the search bar stays`);
  ok(how !== "bar" || calls.length === 1 && calls[0].step === "range", `${how}: the cards come from the range step alone (no request for the rest of a blend) (${calls.map(c => c.step).join(",")})`);
}
// the VIN names its car: no cards, the questions as before; a card tapped is a Sell address with the car token that the page's server reads (carBar cb)
{ calls.length = 0; globalThis.location = { search: "", pathname: "/sell" }; new Function(SELL_MC_CLIENT)(); replies = []; window.GAS_SELL.onCar({ resolvedCar: { year: 1990, make: "Porsche", model: "911" } }, "WP0AB0912LS450001"); await tick(); ok(/<q>/.test(OBX.root.innerHTML) && !/vrs-row/.test(OBX.root.innerHTML), "a VIN (the car is named): no cards, the first question as before"); }
// THE CARDS COME FIRST (lane-b-sell-cards-first, Nov 18 2026; Lane C's live check: Sell for "Ferrari 330 GT" (typed and from the car bar) and "1987 Firebird" opened on "Which state is it in?" and drew the cards only after all three questions). CAUSE: a typed search and a car bar address reach Sell as an address and the first question is asked from the words alone; no engine answer exists, so the cards (which ride on it) had nowhere to be read until the range step. NOW: the page asks the server for the cards (step "cards") before the first question. EVERY ENTRY:
for (const how of ["typed", "bar", "partial"]) {
  calls.length = 0; cardCalls.length = 0; cardsReply = { split: SPLIT330 }; globalThis.location = { search: how === "bar" ? "?car=Ferrari%20330%20GT" : "?car=Ferrari%20330%20GT", pathname: "/sell" }; new Function(SELL_MC_CLIENT)(); replies = [];
  window.GAS_SELL.homeHtml(() => "<inbox>"); for (let i = 0; i < 8; i++) await tick();
  const h4 = OBX.root.innerHTML, t4 = h4.replace(/<[^>]+>/g, " ").replace(/&#39;/g, "'").replace(/\s+/g, " ");
  ok(cardCalls.length === 1 && cardCalls[0].car === "Ferrari 330 GT" && calls.length === 0, `${how}: the cards are asked for once, before any question, and nothing else is asked (${cardCalls.length} cards, ${calls.length} other)`);
  ok(SPLIT330.rows.every(r => h4.includes('href="' + r.car.sellAddress + '"') && t4.includes(r.label) && t4.includes(r.salesText)) && t4.includes(SPLIT330.line), `${how}: the cards show first, the engine's words, each a link that starts Sell for that variant`);
  ok(!/<q>|Which state|One question first/.test(h4) && !/pcard|sell-ps|<sale>/.test(h4), `${how}: no question yet, no pick, no PowerSeller`);
  // a car with one variant, or in no list: no cards, the first question exactly as before, one cards read
  calls.length = 0; cardCalls.length = 0; cardsReply = { split: null }; globalThis.location = { search: "?car=Ferrari%20330%20GTC", pathname: "/sell" }; new Function(SELL_MC_CLIENT)(); window.GAS_SELL.homeHtml(() => "<inbox>"); for (let i = 0; i < 8; i++) await tick();
  ok(/Which state is it in/.test(OBX.root.innerHTML) && cardCalls.length === 1 && !/vrs-row/.test(OBX.root.innerHTML), `${how}: one variant (no cards): the state question, exactly as before`);
}
// a failed cards read never blocks Sell: the first question comes
{ calls.length = 0; cardCalls.length = 0; globalThis.location = { search: "?car=Ferrari%20330%20GT", pathname: "/sell" }; const f9 = globalThis.fetch; globalThis.fetch = (u, o) => { if (JSON.parse(o.body).step === "cards") return Promise.reject(new Error("net")); return f9(u, o); }; new Function(SELL_MC_CLIENT)(); window.GAS_SELL.homeHtml(() => "<inbox>"); for (let i = 0; i < 8; i++) await tick(); globalThis.fetch = f9;
  ok(/Which state is it in/.test(OBX.root.innerHTML), "a cards read that fails: the first question, Sell is never blocked"); }
// a VIN: no cards, the questions (the page never asks the server for the cards of a VIN)
{ calls.length = 0; cardCalls.length = 0; cardsReply = { split: SPLIT330 }; globalThis.location = { search: "", pathname: "/sell" }; new Function(SELL_MC_CLIENT)(); replies = []; window.GAS_SELL.onCar({ resolvedCar: { year: 1987, make: "Porsche", model: "911" } }, "WP0AB0912LS450001"); for (let i = 0; i < 6; i++) await tick(); ok(/<q>/.test(OBX.root.innerHTML) && cardCalls.length === 0, "a VIN: the first question at once, no cards asked"); }
cardsReply = { split: null };
const ROOTD = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
// THE NOT-SEEN LINE IS FOR A CAR WITH NO SALE (lane-b-sell-nolump-2, Nov 18 2026; live: Sell for the 1991 Lamborghini LM002 printed "Sam has not seen this car sell yet, so there is no place on record to point to." under "only 5 sales on record" with the five sales listed).
// CAUSE: buildResult printed the line whenever the result had no pick and no PowerSeller and the places read (pl.total) was 0; on a no-range car the places read holds nothing while the engine's own total (noRange.total) and the sales the page lists do. THE CLASS: every Sell result with no pick (typed words, the car bar, a VIN, the finish) and every page or email that prints the line.
{ const SF2 = await import(pathToFileURL(path.join(ROOTD, "lib/sell/sellFlow.js")).href), recent = n => Array.from({ length: n }, (_, i) => ({ title: "1991 Lamborghini LM002", date: "2026-0" + (9 - i) + "-10", price: 360000 + i * 1000 }));
  const lm = SF2.noPickFor({ platform: null, partner: null, pl: { total: 0 }, noRange: { total: 5 }, recent: recent(5) });
  ok(!!lm.empty && !/has not seen/.test(lm.empty) && /^Five sales/.test(lm.empty) && lm.note === lm.empty, "LM002 (five sales, no range, the places read empty): the line is the count, never the not-seen line :: " + lm.empty);
  const onlyList = SF2.noPickFor({ platform: null, partner: null, pl: { total: 0 }, noRange: null, recent: recent(3) });
  ok(!/has not seen/.test(onlyList.empty || "") && !!onlyList.empty, "sales listed on the page and nothing else: still never the not-seen line :: " + onlyList.empty);
  const onlyEngine = SF2.noPickFor({ platform: null, partner: null, pl: {}, noRange: { total: 12 }, recent: [] });
  ok(!/has not seen/.test(onlyEngine.empty || "") && /12 sales/.test(onlyEngine.empty || ""), "the engine's count alone (no rows listed): the count line :: " + onlyEngine.empty);
  const none = SF2.noPickFor({ platform: null, partner: null, pl: { total: 0 }, noRange: { total: 0 }, recent: [] });
  ok(none.empty === SF2.NOT_SEEN_LINE, "a car with no sale at all: the not-seen line stands");
  ok(SF2.noPickFor({ platform: { slug: "x" }, partner: null, pl: { total: 0 }, noRange: { total: 5 }, recent: recent(5) }).empty === null && SF2.noPickFor({ platform: null, partner: { slug: "p" }, pl: { total: 0 }, noRange: { total: 5 }, recent: recent(5) }).empty === null, "a pick or a PowerSeller: no empty line");
  // the sweep: the sentence is written in ONE place and read from there; no page or email carries its own copy
  const hits = []; const walk = d => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { if (f.name === "node_modules" || f.name === ".git" || f.name === "scripts" || f.name === "docs" || f.name === "proofs") continue; const q = path.join(d, f.name); if (f.isDirectory()) walk(q); else if (/\.(js|mjs|html|json)$/.test(f.name)) { const t = fs.readFileSync(q, "utf8"); if (/has not seen this car sell|not seen this car sell/i.test(t.replace(/\/\/.*$/gm, ""))) hits.push(path.relative(ROOTD, q)); } } }; walk(ROOTD);
  ok(hits.length === 1 && hits[0] === "lib/sell/sellFlow.js", "no page, client or email carries the not-seen sentence of its own: it is written once, in lib/sell/sellFlow.js :: " + hits.join(","));
  const src = fs.readFileSync(path.join(ROOTD, "lib/sell/sellFlow.js"), "utf8"); ok(/empty: emptyLine,/.test(src) && !/note \|\| "Sam has not seen/.test(src), "buildResult's empty line is noPickFor's"); }
console.log(`sellRefusalCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
