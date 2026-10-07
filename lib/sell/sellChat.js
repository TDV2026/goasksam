// /sell conversation (Lane C, Oct 2026): Claude runs it with the engine as tools, on the same core as
// /buy (lib/live/chatCore.js: streaming, the output guard, regeneration, the reply built in code).
//   where_to_sell      the top places for this exact spec, ranked by the record (lib/sell/sellFacts.js,
//                      the One Box engine's own pool), with the cohort's tiles and latest sales
//   market_check       what cars like it sold for (Lane A's handler, lib/tools/)
//   car_history        one car's appearances, by VIN or listing link (Lane A's handler)
//   search_powersellers partners matched on make + region, numbers only when computed from the archive
// Zero OldCarsData.
import { runChatTurn, usd } from "../live/chatCore.js";
import { marketCheck } from "../tools/marketCheck.js";
import { carHistory } from "../tools/carHistory.js";
import { resolveSellCar, sellFactsFor, powersellersFor, monthYear } from "./sellFacts.js";

export function systemPrompt(ctx, today) {
  return `You are Sam, the voice of GoAskSam, helping someone decide where to sell a collector car. You always speak about Sam in the third person ("Sam's pick is", "Sam can show"), never "I", "me", "my", "we", "our" or "us", and never "if this were my car".

How you talk:
- Two sentences is usual, three at most. Plain words, no dashes, no lists, no markdown.
- Never use the words AI, valuation, valued, worth, estimate, appraisal or verdict, not even in a negation ("no valuations", "not an estimate" are banned too). Never "we track" or a count of sources or houses.
- Every number comes from a tool result in THIS turn or the seller's own words. Never round, add up or approximate ("around", "about").
- Never describe the page or its layout. Never say a site is not covered.
- At most one question, as the last sentence, and only when the answer changes the recommendation. One offer, never a choice ("or" never appears in a question). Never ask for something the seller already said.

How you work:
- Answer first. As soon as the seller names a car (or a VIN, or a listing link), call where_to_sell with the car exactly as they described it (year, make, model, trim, body, gearbox, mileage, colour) plus their state if given. Then reply using its "say" sentences WORD FOR WORD: they name the top places, their sales, and Sam's pick. Do not add other numbers.
- A VIN or a listing link: call car_history first, then where_to_sell with the car it names.
- Then at most one question, only if it changes the answer: if the top places include an auction house and the state is unknown, ask where the car is ("Where is the car?"). Otherwise, if the seller has not said whether they will run the sale or want it handled, you may ask ("Would the seller rather have the sale handled for them?" phrased naturally in the third person, e.g. "Would you like someone to handle the sale?").
- If the seller wants the sale handled, call search_powersellers (make, model, state) and use its "say" sentence word for word. Never repeat a number in the same sentence.
- Never ask what the seller hopes to get. If they say a price, state it and the sold range as two separate facts ("The ask is $65,000. Most sold between $50,000 and $82,000."), no comparison word (above, below, within, under, over).
- Ask about trim only when where_to_sell says the model has trims that change the market (trim_matters true) and the seller did not say one. A model that is itself the edition (CLK DTM, GT3 RS, Z06) never gets a trim question.
- "What is my car worth" without a car: ask which car it is. Nothing else.
- A tile fact (reserve, day ending, season) may be mentioned as one plain fact from the tool, never as advice ("list with no reserve" is never said).

Today is ${today}. What the seller has said so far: ${JSON.stringify(ctx.said || {})}`;
}

export const TOOLS = [
  { name: "where_to_sell", description: "The top places to sell this exact car, ranked by the record for its spec: sales in the window, sold-through where the venue records unsold cars, where most sold, the last sale, the next sale and consignment close for auction houses, and Sam's pick. Also the cohort's tiles and latest sales. Returns 'say' sentences to use word for word.",
    input_schema: { type: "object", properties: { car: { type: "string", description: "The car as the seller described it, with year, make, model, trim, body, gearbox, mileage, colour" }, state: { type: "string" }, intent: { type: "string", enum: ["self", "handled", "unknown"] } }, required: ["car"] } },
  { name: "market_check", description: "What cars like one exact spec sold for at auction (sold range, count, period).",
    input_schema: { type: "object", properties: { car: { type: "string" } }, required: ["car"] } },
  { name: "car_history", description: "Every auction appearance of one car, by VIN or listing URL: date, house, miles, sold or not, price.",
    input_schema: { type: "object", properties: { vin_or_url: { type: "string" } }, required: ["vin_or_url"] } },
  { name: "search_powersellers", description: "PowerSellers (people who run the whole sale for the owner) matched to this make and the seller's state. Numbers only when computed from their recorded sales of this make.",
    input_schema: { type: "object", properties: { make: { type: "string" }, model: { type: "string" }, state: { type: "string" } }, required: ["make"] } }
];

// Trims that change the market (a 911 "Carrera" vs "Turbo"); a model that is itself the edition never asks.
const TRIM_MODELS = /^(911|993|964|996|997|991|992|Corvette|Mustang|Camaro|M3|M5|Cayenne|Boxster|Cayman|Defender|Land Cruiser|SL|E-Type)$/i;
const plural = n => (n === 1 ? "" : "s");
function placeSentences(f) {
  if (!f.places.length) return [`No ${f.cohort} sales are on record in the window, so there is no place to rank yet.`];
  const w = f.window_months === 12 ? "the last 12 months" : `the last ${f.window_months} months`;
  const parts = f.places.map(p => `${p.name} ${p.sales}`);
  // The cohort first, then the count: a number never sits directly before a year or a generation number.
  const cap = String(f.cohort).charAt(0).toUpperCase() + String(f.cohort).slice(1);
  const s1 = `${cap}: ${f.total} sold at auction in ${w}, ${parts.length === 1 ? parts[0] : parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1]}.`;
  const pk = f.places[0];
  const bits = [pk.sold_through ? `${pk.sold_through.pct}% of the ${pk.sold_through.offered} offered there sold` : null, pk.most_sold_between ? `most sold between ${usd(pk.most_sold_between[0])} and ${usd(pk.most_sold_between[1])}` : (pk.last_sale ? `the last for ${usd(pk.last_sale.price)} in ${monthYear(pk.last_sale.date)}` : null)].filter(Boolean);
  const s2 = `Sam's pick is ${pk.name}${bits.length ? ", where " + bits.join(", ") : ""}.`;
  return [s1, s2];
}
async function toolWhereToSell(env, p, ctx) {
  const text = [p.car, p.state].filter(Boolean).join(", ");
  const { car, said } = await resolveSellCar(text, env);
  Object.assign(ctx.said, Object.fromEntries(Object.entries(said).filter(([, v]) => v != null)));
  if (p.state) ctx.said.state = p.state; if (p.intent && p.intent !== "unknown") ctx.said.intent = p.intent;
  if (!car) return { kind: "question", say: ["Which car is it? A year, make and model works best."] };
  car.env = env;
  if (said.gearbox) car.v.gearbox = said.gearbox;
  const facts = await sellFactsFor(car);
  const places = facts.places, tiles = { tiles: facts.tiles }, recent = facts.recent;
  ctx.model = car.v.model; ctx.cached = facts.cached;
  ctx.page = { car: car.label, cohort: places.cohort, cohort_noun: places.cohort_noun, cohort_years: places.cohort_years, window_months: places.window_months, total: places.total, most_sold_between: places.most_sold_between, places: places.places, pick: places.pick, tiles: tiles.tiles || [], recent, said: { ...ctx.said } };
  const say = placeSentences(places);
  if (ctx.said.ask && places.most_sold_between) say.push(`The ask is ${usd(ctx.said.ask)}. Most ${places.cohort_noun || places.cohort} sold between ${usd(places.most_sold_between[0])} and ${usd(places.most_sold_between[1])}.`);
  return { understood: car.label, route: places.route, cohort: places.cohort, window_months: places.window_months, total_sales: places.total,
    places: places.places.map(x => ({ name: x.name, kind: x.house ? "auction house" : "online platform", sales: x.sales, sold_through: x.sold_through, most_sold_between: x.most_sold_between, last_sale: x.last_sale, next_sale: x.next_sale })),
    pick: places.places[0] ? places.places[0].name : null, has_house: places.places.some(x => x.house),
    trim_matters: TRIM_MODELS.test(String(car.v.model)) && !car.v.trim,
    tiles: (tiles.tiles || []).map(t => t.kind), seller_said: ctx.said, say };
}
// "Howard Silvers specializes in vintage Mustangs and has 17 recorded Ford sales, median $26,500."
// The specialty clause is the part of the partner's own note that names this car (or make), if any.
function psSentence(m, make, model) {
  const clauses = String(m.specialty || "").replace(/\s*\(per [^)]*\)\s*$/i, "").split(/,\s*|\s+and\s+/).map(x => x.trim()).filter(Boolean);
  const hit = clauses.find(c => model && new RegExp(String(model).replace(/s$/i, ""), "i").test(c)) || clauses.find(c => new RegExp(String(make || ""), "i").test(c));
  const n = m.on_this_make;
  const nums = n ? `${n.sales} recorded ${make} sale${plural(n.sales)}${n.median ? `, median ${usd(n.median)}` : ""}` : "";
  if (hit && nums) return `${m.name} specializes in ${hit} and has ${nums}.`;
  if (hit) return `${m.name} specializes in ${hit}.`;
  if (nums) return `${m.name} has ${nums}.`;
  return `${m.name} handles the whole sale for the owner.`;
}
async function toolPowersellers(env, p, ctx) {
  const list = await powersellersFor(env, { make: p.make, state: p.state || ctx.said.state });
  ctx.page = ctx.page || {}; ctx.page.powerseller = list[0] || null;
  if (!list.length) return { matches: [], say: [] };
  const m = list[0];
  return { matches: list.map(x => ({ name: x.name, specialty: x.specialty, on_this_make: x.on_this_make })),
    say: [psSentence(m, p.make, p.model || ctx.model)] };
}
async function execTool(env, name, input, ctx) {
  try {
    if (name === "where_to_sell") return await toolWhereToSell(env, input || {}, ctx);
    if (name === "market_check") { const o = await marketCheck(String((input && input.car) || ""), env); return o.kind === "answer" ? { kind: "range", spec: o.spec, sold_range: o.soldRangeHammerUsd, sales: o.salesCount, period: o.period } : { kind: o.kind, reason: o.reason || o.question }; }
    if (name === "car_history") { const o = await carHistory(String((input && input.vin_or_url) || ""), env); if (o.kind === "answer") { ctx.said.vin = o.vin; } return o.kind === "answer" ? { kind: "history", car: o.car, appearances: o.appearances.map(a => ({ when: a.when, house: a.house, miles: a.miles, result: a.result, price: a.hammerUsd || a.highBidUsd })) } : { kind: "none", reason: o.reason }; }
    if (name === "search_powersellers") return await toolPowersellers(env, input || {}, ctx);
    return { error: "unknown tool" };
  } catch (e) { console.error("sellChat tool failed:", name, e && e.message); return { error: "That didn't come back. Try again." }; }
}
// The reply built in code: the where_to_sell sentences (and a PowerSeller line), in Sam's voice.
// A VIN or a link opens with the car's own last appearance, so the history is never dropped.
function historyLead(h) {
  const a = h && h.result && h.result.kind === "history" ? h.result.appearances[0] : null;
  if (!a) return null;
  return a.result === "sold" ? `This car last sold ${/^(Gooding|RM|Bonhams|Broad|Mecum|Barrett)/.test(a.house || "") ? "at" : "on"} ${a.house} in ${a.when}${a.price ? ` for ${a.price}` : ""}.`
    : `This car was last offered on ${a.house} in ${a.when}${a.price ? `, bid to ${a.price}` : ""}, and didn't sell.`;
}
export function codeReply(trace) {
  const w = trace.filter(t => t.tool === "where_to_sell").pop();
  const ps = trace.filter(t => t.tool === "search_powersellers").pop();
  const hist = historyLead(trace.filter(t => t.tool === "car_history").pop());
  const out = [hist, ...((w && w.result && w.result.say) || []).slice(0, hist ? 1 : 2), ...((ps && ps.result && ps.result.say) || []).slice(0, hist ? 0 : 1)].filter(Boolean);
  return out.join(" ") || "Which car is it? A year, make and model works best.";
}
// Sell-only guard lines: never ask the hoped-for price, never set an ask against the range, never an
// "if this were my car" line.
const EXTRA = [
  [/\b(?:hoping to get|hope to get|asking price|what (?:are|do) you (?:want|hope|expect)|how much (?:do|would) you (?:want|like))[^?]*\?/i, "asked the seller's price"],
  [/\bif (?:this|it) were (?:my|Sam's) car\b/i, "'if this were my car'"],
  [/(?<!(?:January|February|March|April|May|June|July|August|September|October|November|December)\s\d{0,2},?)(?<![\d,$])\b\d[\d,]*\s+(?:(?:19|20)\d{2}|\d{3}(?:\.\d)?|[A-Z]\d{2,3}[A-Z]?)\b/, "a count directly before a year or a generation number (put the cohort first)"],
  [/\bask\b[^.]*\b(?:above|below|within|under|over|inside|outside|higher|lower|short of|in line with)\b[^.]*\b(?:range|sold|most|typical)\b|\b(?:above|below|within|under|over)\b[^.]*\bthe ask\b/i, "the ask compared with the range"]
];
const SELL = {
  system: systemPrompt, tools: TOOLS, execTool, codeReply, extraBlocks: EXTRA,
  rewriteHint: "Use only the tool results above, the 'say' sentences word for word, no approximations, no judgements, nothing about Sam itself, third person, one question at most and never about price."
};
export async function runSellTurn({ env, apiKey, model, messages, state, onText, onGuard, deadlineMs = 25000 }) {
  const ctx = { said: { ...((state && state.said) || {}) }, page: null };
  const out = await runChatTurn(SELL, { env, apiKey, model, messages, ctx, onText, onGuard, deadlineMs });
  // The ask set against the range, in either order, is also a comparison (checked on the final reply).
  return { ...out, page: ctx.page, state: { said: ctx.said } };
}
