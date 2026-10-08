// The follow-up question after a one-direction Sell result (Lane C, Oct 2026; behind SELL_NEXT_ON). The
// seller asks in their own words ("compare", "why not Cars and Bids", "how would you run the listing") and
// Claude answers on the SHARED chat core (lib/live/chatCore.js runChatTurn) and the shared guard. Its one
// tool returns this car's facts from the shared Sell engine (lib/sell/sellFacts.js) in WORDS ONLY: the
// places in rank order, online or auction house, the venues with no record of cars like this, and the
// recommendation with its reason. No price, count, percentage or band ever reaches the model, and the
// surface blocks any figure in the reply (regenerate once, then the reply built in code).
import { runChatTurn } from "../live/chatCore.js";
import { resolveSellCar, sellFactsFor } from "./sellFacts.js";
import { buildResult } from "./sellFlow.js";

const KNOWN = [["bringatrailer", "Bring a Trailer", false], ["carsandbids", "Cars & Bids", false], ["pcarmarket", "PCarMarket", false], ["hagerty", "Hagerty Marketplace", false],
  ["rmsothebys", "RM Sotheby's", true], ["gooding", "Gooding", true], ["bonhams", "Bonhams", true], ["broadarrow", "Broad Arrow", true], ["mecum", "Mecum", true], ["barrettjackson", "Barrett-Jackson", true]];

// The engine's facts for this car, as words.
async function factsInWords(env, ctx) {
  if (ctx.words) return ctx.words;
  const sc = await resolveSellCar(ctx.carText, env);
  if (!sc.car) return (ctx.words = { car: null, note: "Sam could not read which car this is." });
  const facts = await sellFactsFor({ ...sc.car, env });
  const pl = facts.places || {}, places = pl.places || [];
  const result = ctx.result || await buildResult(env, { carText: ctx.carText, state: ctx.state, how: ctx.how, rush: ctx.rush });
  const ranked = places.map((p, i) => ({ place: p.name, kind: p.house ? "auction house" : "online auction", standing: i === 0 ? "where cars like this have sold most often" : "where fewer cars like this have sold", most_recent_sale_here: i === places.slice().sort((a, b) => String((b.last_sale || {}).date || "").localeCompare(String((a.last_sale || {}).date || "")))[0] ? "yes" : "no" }));
  const seen = new Set(places.map(p => p.slug));
  return (ctx.words = {
    car: sc.car.label, state: ctx.state || null, how_the_seller_wants_to_sell: { self: "sell it themselves", handled: "have someone handle it", house: "through an auction house", unsure: "not sure yet" }[ctx.how] || "not sure yet",
    sams_recommendation: result && result.platform ? { headline: result.platform.house ? `Sam would take it to ${result.platform.name}.` : `Sam would sell it on ${result.platform.name}.`, reasons: [result.platform.why, ...(result.platform.boxes || []).map(x => `${x.label}: ${x.head}`)].filter(Boolean), first: result.order && result.order[0] === "partner" && result.partner ? `hand it to ${result.partner.name}` : (result.platform.house ? `take it to ${result.platform.name}` : `sell it on ${result.platform.name}`) } : (result && result.partner ? { headline: `Sam would hand it to ${result.partner.name}.`, reasons: [] } : null),
    how_quickly: { fast: "wants it gone fast", month: "within a month", none: "no rush" }[ctx.rush] || null,
    powerseller_offered: result && result.partner ? `${result.partner.name}, who can run the whole sale` : null,
    where_cars_like_this_sold: ranked,
    venues_with_no_record_of_cars_like_this: KNOWN.filter(([slug]) => !seen.has(slug)).map(([, name, house]) => `${name} (${house ? "auction house" : "online auction"})`),
    how_the_record_was_read: pl.step === "class_era" ? "this exact car is rare, so the record is cars of the same make and era" : pl.step === "houses" || pl.step === "keyword" ? "this car sells mainly at the auction houses" : "sales of cars like this, matched on model, generation and body",
    what_sam_does_not_do: "Sam never puts a price on a car and never says what a car will bring. Sam shows where cars like it sell, and the real past sales."
  });
}

const TOOLS = [{ name: "car_facts", description: "This car's selling record from the engine, in words: Sam's recommendation and its reason, the places cars like it sold (rank order, online or auction house), the venues with no record of cars like it.", input_schema: { type: "object", properties: {} } }];
function system(ctx, today) {
  return `You are Sam, answering a seller's follow-up question about where to sell their car, in the third person ("Sam would", never "I", "we" or "our"). Call car_facts first, then answer in at most three short plain sentences.
Rules:
- Use only what car_facts says. If it does not cover the question, say plainly that Sam has nothing on record to answer that, and say what Sam can tell them instead. Better nothing than a guess.
- Never a number about the market: no prices, no price ranges, no counts of sales, no percentages, no sell-through. Words only ("most often", "fewer", "rarely").
- Never put a price on the car, never say what it will bring. If they ask about price or value, say Sam does not put a price on cars, and that Sam shows where cars like theirs sell and the real past sales instead.
- Sam's recommendation stands. Never suggest a second option unless they ask. If they ask to compare, compare the places in words only, from car_facts.
- How to run a listing: only general, factual steps a seller takes (good photographs, full records, an honest description); never fees, never platform rules stated as fact.
- Name every place exactly as car_facts names it ("Cars & Bids", never "Cars and Bids"), even when the seller spells it differently.
- No dashes. Today is ${today}.`;
}
function codeReply(trace, ctx) {
  const w = (trace.find(t => t.tool === "car_facts") || {}).result || ctx.words || {};
  const rec = w.sams_recommendation;
  const first = rec && rec.reasons && rec.reasons[0];
  return first ? `${first} Sam has nothing more on record to answer that one.` : "Sam has nothing on record to answer that one.";
}
// Figures are blocked on this surface (the shared guard already blocks valuation words and numbers
// that are not in the tool results; the tool results here carry none).
const FIGURES = [
  [/\$\s?\d|\b\d[\d,.]*\s?(k|thousand|million)\b/i, "a price figure"],
  [/\b\d+(\.\d+)?\s?%|\bper ?cent\b/i, "a percentage"],
  [/\b\d+\s+(of\s+\d+\s+)?(sales?|sold|cars|auctions|lots|listings|times)\b/i, "a count of sales"],
  [/\bsell[- ]?through\b/i, "a sell-through claim"],
  [/\bCars and Bids\b/i, "the venue's own name is Cars & Bids"]
];
const SURFACE = { system, tools: TOOLS, execTool: async (env, name, input, ctx) => name === "car_facts" ? factsInWords(env, ctx) : { error: "unknown tool" }, codeReply, extraBlocks: FIGURES,
  rewriteHint: "Words only from car_facts: no prices, counts or percentages; Sam's recommendation stands; if car_facts does not cover it, say so plainly." };

export async function followUp(env, { carText, state, how, rush, question, history, apiKey, model }) {
  const ctx = { carText, state, how, rush, words: null };
  const msgs = (Array.isArray(history) ? history : []).slice(-6).map(m => ({ role: m.role === "sam" ? "assistant" : "user", content: String(m.text || "").slice(0, 1000) }))
    .concat([{ role: "user", content: String(question || "").slice(0, 600) }]);
  const out = await runChatTurn(SURFACE, { env, apiKey, model, messages: msgs, ctx, deadlineMs: 25000 });
  return { reply: out.reply };
}
