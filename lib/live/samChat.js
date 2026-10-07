// /buy conversation, run by Claude with the engine as tools (Lane C, Oct 2026). Each turn: the full
// conversation + the current search state go to Claude (SAM_MODEL) with three tools:
//   search_live  - the live auctions, through the same /buy search (resolver, spec-priced budget,
//                  location + radius, abroad hidden) with counts of what each filter cut
//   market_check - what cars like it sold for (the One Box engine, archive only)
//   car_history  - one car's auction appearances (VIN or listing link)
// market_check (plain car) and car_history are Lane A's handlers (lib/tools/, the one copy the MCP
// server also uses); market_check for a LIVE car reads that listing's own cohort from the range ladder
// (lib/live/search.js), the same cohort its card's rail shows. Engine files are imported read-only,
// never edited. ZERO OldCarsData.
import { resolveVehicle } from "../vehicle.js";
import { supabaseSelect } from "../_supabase.js";
import { marketCheck } from "../tools/marketCheck.js";
import { carHistory } from "../tools/carHistory.js";
import { emptyFilters, resolveForBuy, searchLive, gensNamed, colourKey, BODIES, listingMarket, nounFor } from "./search.js";
import { kindOf, budgetBySpec, placeAny, searchAll } from "./converse.js";
import { zipCoord, listingCoord, milesBetween, nearestPlace } from "./geo.js";
import { houseName } from "../../api/_historyData.js";
const usd = n => (n == null || !Number.isFinite(Number(n)) ? null : "$" + Math.round(Number(n)).toLocaleString("en-US"));
const BANNED = /\b(valuation|valued|worth|estimate[sd]?|apprais\w*|AI)\b/gi;
// polish: dashes, "an 11k-mile", spacing. Banned words are NOT rewritten here: the guard sees them and
// the reply is regenerated (a mid-sentence rewrite read "in Saratoga Also, at 299 miles").
const polish = s => String(s || "").replace(/[–—]/g, ",")
  .replace(/\ba (?=(?:8|11|18)(?:\d{0,2})?(?:[,k\s-]|$))/g, "an ").replace(/\bA (?=(?:8|11|18)(?:\d{0,2})?(?:[,k\s-]|$))/g, "An ").replace(/\s+([,.])/g, "$1").replace(/\s{2,}/g, " ").replace(/(^|[.!?]\s+)([a-z])/g, (m, a, b) => a + b.toUpperCase()).trim();
// clean: the last line of defence for the reply built in code (never seen by a model).
const clean = s => polish(String(s || "").replace(BANNED, ""));

// ---------------------------------------------------------------- system prompt (Sam's rules)
export function systemPrompt(state, today) {
  return `You are Sam, the voice of GoAskSam, helping someone find a collector car at live auctions. You speak about yourself in the third person ("Sam found", "Sam can look"), never "I", "me" or "my".

How you talk:
- Plain, short sentences. Two sentences is usual, three at most (four when answering "is it any good"). No dashes of any kind. No bullet lists, no headings, no markdown.
- Never use the words AI, valuation, valued, worth, estimate or appraisal.
- Never give a verdict on a live bid (never cheap, expensive, a deal, good value, overpriced, a steal, a good buy). Never predict what a car will sell for or whether to buy it. You state facts from the tools.
- Never say how many sources, houses or platforms GoAskSam covers.
- Every number you say (counts, prices, miles, distances, years of sales) must come from a tool result in THIS conversation. If a number is not in a tool result, do not say it. Do not round tool numbers into new ones, do not add them up, do not compute averages.
- Ask at most one question per reply, and only when the answer would change the results. Ask it naturally ("Where are you, roughly?"). The question is the last sentence: never explain why you ask it. Never offer a list of options to pick from.
- When a filter cut results, say so in words and offer the change ("13 more Cayennes are further than 500 miles away. Want to see them?"), using the counts the tool returned.
- The cars appear as cards under your reply, so do not list every car. Mention one or two only when it helps, by year and model.

How you work:
- Call the tools first and write your reply only after the results are in. Never write a sentence before a tool call.
- Search first. As soon as the buyer names a car, a make, a type or a budget, call search_live with what you have and tell them what is live. Then, if it would narrow things, ask your one question (for example where they are) in that same reply. Never answer a search request with only a question.
- "The ones further away" or "over 500 miles" means anywhere true with min_distance_miles (500, or the radius they had), so the count and the cards are only those further cars.
- When the buyer names a distance ("250 miles", "within 100 miles"), use exactly that radius, whether it is larger or smaller than before. Just apply it and report the result; never comment on the change itself.
- search_live returns count_sentences, written for you. Use them WORD FOR WORD for every count about the search ("4 further than 500 miles", "2 more abroad"). Never combine them, never add counts together, never write a count that is not in one of them.
- When count_sentences include cars set aside because their spec sells above the budget, always offer to show them. If the buyer says yes, search again with include_above_budget true.
- Use search_live for anything about what is for sale now. Send the COMPLETE set of filters every time (the current search below plus the buyer's change), so filters persist across turns and change only when the buyer changes them ("expand to 250 miles" changes only the radius; "what about Boxsters" changes the model; "show me the ones further away" means radius anywhere).
- A budget ("under 50k", "under 120") is budget_max in dollars ("under 120" for a Porsche means $120,000). It filters on what that exact spec sells for, not on the current bid.
- The buyer's location is a ZIP or a city. "Near me" without a place: search first without a location, say the first count sentence, then ask where they are ("Sam found 12 black manual 911s under 50k miles. Where are you, roughly?").
- Use market_check for "what does X sell for / what has X been selling for". Then offer to show what is live.
- Use car_history for one specific car (a VIN or a listing). When the buyer describes a live car in words ("the white 964 on BaT"), find it yourself with search_live (colour, generation, house), then call car_history with that card's vin or url. Never ask the buyer for a link you can find.
- "Is this car any good?" or "should I bid?": find it with search_live, then call market_check with its listing_id and car_history with its vin. Say the sold, bid_vs_spec and miles_vs_spec sentences word for word (they name the group of sales they come from), then its history. Never a verdict: never good, bad, nice, solid, fair, well below or a deal, and no comment on whether to bid.
- Years, trims, places and every other detail about a car come only from tool results (card titles and fields). Do not add model years or facts from your own knowledge.
- Only the tool results of THIS turn are in front of you. Never restate a distance, price or count from an earlier reply unless this turn's tool result has it; never write "around" or "about" with a number.
- Correct obvious typos silently (porshe is Porsche, manul is manual).
- Never talk about Sam itself or its limits (never "Sam can only share facts", "not a verdict", "those are the facts Sam has", "Sam doesn't give opinions"). State the facts, then offer the next step.

Today is ${today}. Current search (empty means none yet): ${JSON.stringify(state && state.filters ? state.filters : {})}`;
}

// ---------------------------------------------------------------- tools
export const TOOLS = [
  { name: "search_live", description: "Search the collector cars live at auction right now. Send the complete filter set every time. Returns how many match, counts by kind, what the radius / budget / country cut, and the cards to show (with bid, miles, distance, ends, url, vin).",
    input_schema: { type: "object", properties: {
      make: { type: "string" }, model: { type: "string", description: "Model or family, e.g. 911, Cayenne, M3, Boxster" },
      generation: { type: "string", description: "Generation code, e.g. 997, 993, E46" }, trim: { type: "string", description: "e.g. Carrera S, GT3, Turbo" },
      body: { type: "string", description: "coupe, cabriolet, convertible, targa, roadster, sedan, wagon, suv" },
      gearbox: { type: "string", enum: ["manual", "automatic"] }, colour: { type: "string" },
      budget_max: { type: "number", description: "Dollars. Filters on what the exact spec sells for." },
      miles_max: { type: "number" }, location: { type: "string", description: "ZIP or city, e.g. 90210 or Austin, TX" },
      radius_miles: { type: "number", description: "Default 500 when a location is known" },
      min_distance_miles: { type: "number", description: "Only cars FURTHER than this from the location (for 'the ones further away', 'over 500 miles'). Use with anywhere true." }, anywhere: { type: "boolean", description: "true lifts the radius and shows cars abroad too" },
      country: { type: "string", description: "Two-letter country code when the buyer names one" },
      include_above_budget: { type: "boolean", description: "true shows the cars set aside because their spec sells above the budget" },
      house: { type: "string", description: "Auction site slug when the buyer names one, e.g. bringatrailer, carsandbids, pcarmarket, hagerty, hemmings, mecum, barrettjackson, bonhams, rmsothebys, gooding, broadarrow, collectingcars, carandclassic, themarket, pistonheads. Search it; never say a site is not searched." },
      sort: { type: "string", enum: ["nearest", "ending_soon", "lowest_bid", "lowest_miles"] }
    } } },
  { name: "market_check", description: "What cars like one exact spec actually sold for at auction: the sold range, number of sales, the period. For a LIVE car, pass its listing_id (the card's id): the answer is that car's exact spec, with bid_vs_spec and miles_vs_spec sentences. Otherwise pass a plain-language car, e.g. 'manual 997 Carrera S coupe'.",
    input_schema: { type: "object", properties: { car: { type: "string" }, listing_id: { type: "number" } } } },
  { name: "car_history", description: "Every auction appearance of one specific car, by VIN or listing URL: date, house, miles, sold or not, hammer or high bid, reserve.",
    input_schema: { type: "object", properties: { vin_or_url: { type: "string" } }, required: ["vin_or_url"] } }
];

const isoDay = d => (d ? String(d).slice(0, 10) : null);
const singular = n => String(n).replace(/ cars$/, "").replace(/(ch|sh)es$/, "$1").replace(/(?<!s)s$/, "");
// Does this message name a car (a make, a model or a nickname the resolver knows)? Bounded at 2.5s.
export async function namesCar(text) {
  const t = String(text || "").trim(); if (t.length < 2) return false;
  const r = await Promise.race([resolveVehicle(t).catch(() => null), new Promise(res => setTimeout(() => res(null), 2500))]);
  return !!(r && r.vehicle && r.vehicle.make);
}
function cardSummary(x) {
  const r = x.r;
  return { id: r.id, title: r.listing_title, house: houseName(r.source), bid_usd: r.current_bid_usd != null ? Math.round(Number(r.current_bid_usd)) : null,
    miles: x.facts.miles || null, colour: x.facts.colour || null, gearbox: x.facts.gearboxLabel || null, body: x.facts.body || null,
    location: r.location || null, country: r.country || null, distance_miles: x.distance != null ? Math.max(1, Math.round(x.distance)) : null,
    ends: isoDay(r.end_time), url: r.url || null, vin: r.vin_norm || null, listing_does_not_say: x.unknown && x.unknown.length ? x.unknown : undefined,
    ...specFacts(x) };
}
// The card's spec market and where THIS car sits, as sentences written in code (facts, no verdict).
function specFacts(x) {
  const m = x.market; if (!m || !m.family) return {};
  // The cohort is named for what it is (the ladder may have stepped past the gearbox or the body).
  const out = { spec: m.family, cohort_step: m.step || "exact" };
  if (m.kind === "range") {
    out.spec_sold = `Across ${m.count} sales of ${m.family} in ${m.window}, most sold between ${usd(m.low)} and ${usd(m.high)}`;
    const bid = Number(x.r.current_bid_usd);
    if (bid > 0) out.bid_vs_spec = bid < m.low ? `The current bid is below where most ${m.family} sold` : bid > m.high ? `The current bid is above where most ${m.family} sold` : `The current bid is within where most ${m.family} sold`;
  } else if (m.count) out.spec_sold = `Only ${m.count} ${m.family} sold in ${m.window}, too few for a range`;
  if (m.miles && m.miles.soldN >= 8) {
    const pct = m.miles.fewer / m.miles.soldN;
    out.miles_vs_spec = pct <= 0.1 ? `Fewer miles than almost all the ${m.family} that sold` : pct < 0.25 ? `Fewer miles than most of the ${m.family} that sold` : pct > 0.75 ? `More miles than most of the ${m.family} that sold` : `About typical miles for the ${m.family} that sold`;
  }
  return out;
}

async function toolSearchLive(env, p, ctx) {
  const text = [p.make, p.model, p.generation, p.trim].filter(Boolean).join(" ").trim();
  const v = text ? await resolveForBuy(text, env) : null;
  const f = emptyFilters();
  if (p.body) { const b = String(p.body).toLowerCase(); if (BODIES.includes(b)) f.bodies = [b]; }
  if (p.gearbox) { f.gearbox = p.gearbox === "manual" ? "manual" : "auto"; f.gearboxLabel = p.gearbox; }
  if (p.colour) { const c = colourKey(String(p.colour).toLowerCase()); if (c) f.colours = [c]; }
  if (Number(p.budget_max) > 0) f.priceMax = Math.round(Number(p.budget_max));
  const budgetBySpecOn = !p.include_above_budget;
  if (Number(p.miles_max) > 0) f.miMax = Math.round(Number(p.miles_max));
  if (p.country) f.countries = [String(p.country).toUpperCase().slice(0, 2)];
  if (p.house) { const h = String(p.house).toLowerCase().replace(/&/g, "and").replace(/[^a-z]/g, ""); f.houses = [h === "bat" ? "bringatrailer" : h === "cb" ? "carsandbids" : h]; }
  if (v && p.generation) { const g = gensNamed(String(p.generation), v.make); if (g.length) f.gens = g; }
  const res = v ? await searchLive(env, v, f, text) : (Object.values(p).some(Boolean) ? await searchAll(env, f) : { rows: [] });
  let matches = res.rows || [];
  // Abroad: hidden unless the buyer said anywhere or named a country.
  const isAbroad = x => { const cc = String(x.r.country || "").toUpperCase(); return !!cc && cc !== "US"; };
  const abroadHidden = (!p.anywhere && !f.countries.length) ? matches.filter(isAbroad).length : 0;
  if (!p.anywhere && !f.countries.length) matches = matches.filter(x => !isAbroad(x));
  // Budget by what the exact spec sells for.
  const before = matches.length;
  if (budgetBySpecOn) matches = await budgetBySpec(env, matches, f);
  const cutByBudget = before - matches.length;
  // Location and radius.
  const loc = p.location ? String(p.location).trim() : "";
  const center = loc ? (zipCoord((/\d{5}/.exec(loc) || [])[0]) || placeAny(loc)) : null;
  const placeName = center ? (center.name || ((nearestPlace(center) || {}).name) || loc) : null;
  let radius = null, beyond = null, noLocation = 0;
  if (center) {
    for (const x of matches) { const c = listingCoord(x.r); x.distance = c ? milesBetween(center, c) : null; }
    radius = p.anywhere ? null : (Number(p.radius_miles) > 0 ? Math.round(Number(p.radius_miles)) : 500);
    if (radius) {
      const out = matches.filter(x => x.distance != null && x.distance > radius);
      noLocation = matches.filter(x => x.distance == null).length;
      beyond = { count: out.length, of_which_up_to_500_miles: out.filter(x => x.distance <= 500).length, of_which_500_to_1000_miles: out.filter(x => x.distance > 500 && x.distance <= 1000).length, of_which_over_1000_miles: out.filter(x => x.distance > 1000).length };
      matches = matches.filter(x => x.distance != null && x.distance <= radius);
    }
    if (Number(p.min_distance_miles) > 0) matches = matches.filter(x => x.distance != null && x.distance > Number(p.min_distance_miles));
  }
  // Order: confirmed matches first, then nearest (or the requested sort).
  const sorters = {
    nearest: (a, b) => (a.distance == null ? 1e9 : a.distance) - (b.distance == null ? 1e9 : b.distance),
    ending_soon: (a, b) => String(a.r.end_time || "9").localeCompare(String(b.r.end_time || "9")),
    lowest_bid: (a, b) => (Number(a.r.current_bid_usd) || 1e12) - (Number(b.r.current_bid_usd) || 1e12),
    lowest_miles: (a, b) => (a.facts.miles || 1e9) - (b.facts.miles || 1e9)
  };
  const sortKey = p.sort && sorters[p.sort] ? p.sort : (center ? "nearest" : "ending_soon");
  matches.sort((a, b) => ((a.unknown || []).length ? 1 : 0) - ((b.unknown || []).length ? 1 : 0) || sorters[sortKey](a, b));
  const byKind = {}; for (const x of matches) { const k = kindOf(x, v && v.make); byKind[k] = (byKind[k] || 0) + 1; }
  // Count sentences, written in code: Sam uses them word for word and never combines them.
  // The first sentence names what was searched: "12 black manual 911s under 50k miles".
  const nLive = matches.length, nShown = Math.min(12, nLive);
  const plural = v ? nounFor(v, f) : "cars";
  const k = n => (n % 1000 === 0 ? n / 1000 + "k" : n.toLocaleString("en-US"));
  const descOf = noun => [f.colours.length ? String(p.colour).toLowerCase() : "", f.gearbox ? (f.gearbox === "manual" ? "manual" : "automatic") : "", noun, f.miMax ? `under ${k(f.miMax)} miles` : ""].filter(Boolean).join(" ");
  const lead = nLive ? `${nLive} ${descOf(nLive === 1 ? singular(plural) : plural)}` : `No ${descOf(plural)}`;
  const say = [];
  say.push(center && radius ? `${lead} within ${radius} miles of ${placeName}` : (center && Number(p.min_distance_miles) > 0 ? `${lead} further than ${Math.round(Number(p.min_distance_miles))} miles` : lead));
  if (nLive > nShown) say.push(`Here are ${nShown} of them`);
  if (beyond && beyond.count) say.push(`${beyond.count} further than ${radius} miles`);
  if (center && radius && noLocation) say.push(`${noLocation} more with no usable location`);
  if (abroadHidden) say.push(`${abroadHidden} more abroad`);
  if (f.priceMax && budgetBySpecOn && cutByBudget) say.push(`${cutByBudget} set aside because that spec usually sells above your budget`);
  const unstated = matches.filter(x => (x.unknown || []).length).length;
  if (unstated) say.push(`${unstated} of them whose listing doesn't say ${f.colours.length ? "the colour" : f.gearbox ? "the gearbox" : f.miMax ? "the miles" : "every detail"}`);
  const shown = matches.slice(0, 12);
  await Promise.all(shown.map(async x => { if (x.market === undefined) { const m = await listingMarket(env, x.r, x.facts, { noBlock: true }).catch(() => null); x.market = m && m.kind === "pending" ? undefined : m; } }));
  ctx.lastCards = shown;
  ctx.state.filters = Object.fromEntries(Object.entries(p).filter(([, val]) => val !== undefined && val !== null && val !== ""));
  return {
    understood: v ? [v.make, v.parentModel || v.model, v.genCode, v.trim].filter(Boolean).join(" ") : (p.make || "any car"),
    count_sentences: say, by_kind: byKind, location: placeName, radius_miles: radius, sort: sortKey, cards: shown.map(cardSummary)
  };
}

// Lane A's market_check, in the conversation's field names.
async function toolMarketCheck(env, car) {
  const o = await marketCheck(String(car || ""), env);
  if (o.kind === "question") return { kind: "question", question: o.question, options: o.options || [] };
  const closest = o.closestSale ? { title: o.closestSale.title, sold_usd: o.closestSale.hammerUsd, date: o.closestSale.date, url: o.closestSale.url } : null;
  if (o.kind === "answer") return { kind: "range", spec: o.spec, sold_range_usd: o.soldRangeHammerUsd, sales: o.salesCount, period: o.period, closest_sale: closest, link: o.link };
  return { kind: "no_range", spec: o.spec || null, reason: o.reason, closest_sale: closest, link: o.link || null };
}

// A live car's own exact spec (the same spec its card line uses), computed if not cached yet.
async function toolMarketCheckListing(env, id) {
  const { liveRows, listingFacts } = await import("./search.js");
  const rows = await liveRows(env, `id=eq.${id}`);
  const r = rows && rows[0]; if (!r) return { kind: "none", reason: "That listing is no longer live." };
  const facts = listingFacts(r);
  const m = await listingMarket(env, r, facts);
  if (!m || m.kind === "pending") return { kind: "none", reason: "No recorded sales of this car's spec, with or without its gearbox and body, in the window." };
  const sf = specFacts({ market: m, r });
  return { kind: m.kind === "range" ? "range" : "no_range", cohort: m.family, cohort_step: m.step || "exact", sold: sf.spec_sold || null, bid_vs_spec: sf.bid_vs_spec || null, miles_vs_spec: sf.miles_vs_spec || null };
}
// Lane A's car_history; a LIVE listing's link (not yet in the archive) resolves through its VIN first.
async function toolCarHistory(env, input) {
  let raw = String(input || "").trim();
  if (/^https?:\/\//i.test(raw)) {
    const l = await supabaseSelect(env, `live_listings?url=eq.${encodeURIComponent(raw)}&select=vin_norm&limit=1`).catch(() => null);
    if (l && l[0] && l[0].vin_norm) raw = l[0].vin_norm;
  }
  const o = await carHistory(raw, env);
  if (o.kind !== "answer") return { kind: "none", vin: o.vin || null, reason: o.vin ? "No recorded auction appearances for this car before this listing." : o.reason };
  return { kind: "history", vin: o.vin, car: o.car, appearances: o.appearances.map(a => ({ date: a.date, when: a.when, house: a.house, miles: a.miles, result: a.result, reserve: a.reserve, hammer_usd: a.hammerUsd, high_bid_usd: a.highBidUsd, url: a.url })), link: o.link };
}

async function execTool(env, name, input, ctx) {
  try {
    if (name === "search_live") return await toolSearchLive(env, input || {}, ctx);
    if (name === "market_check" && input && Number(input.listing_id) > 0) return await toolMarketCheckListing(env, Number(input.listing_id));
    if (name === "market_check") return await toolMarketCheck(env, input && input.car);
    if (name === "car_history") return await toolCarHistory(env, input && input.vin_or_url);
    return { error: "unknown tool" };
  } catch (e) { console.error("samChat tool failed:", name, e && e.message); return { error: "The search did not come back. Try again." }; }
}

// ---------------------------------------------------------------- one Claude call, streamed
async function claudeStream({ apiKey, model, system, messages, onText, onToolStart, signal, toolChoice }) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", signal,
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: 700, system, messages, tools: TOOLS, stream: true, ...(toolChoice ? { tool_choice: toolChoice } : {}) })
  });
  if (!r.ok || !r.body) { const t = await r.text().catch(() => ""); throw new Error("anthropic " + r.status + " " + t.slice(0, 200)); }
  const blocks = []; let usage = { input_tokens: 0, output_tokens: 0 }, stop = null, buf = "";
  const dec = new TextDecoder();
  for await (const chunk of r.body) {
    buf += dec.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const evt = buf.slice(0, i); buf = buf.slice(i + 2);
      const line = evt.split("\n").find(l => l.startsWith("data: "));
      if (!line) continue;
      let j; try { j = JSON.parse(line.slice(6)); } catch { continue; }
      if (j.type === "message_start" && j.message && j.message.usage) usage.input_tokens += Number(j.message.usage.input_tokens || 0);
      else if (j.type === "content_block_start") { blocks[j.index] = j.content_block.type === "tool_use" ? { type: "tool_use", id: j.content_block.id, name: j.content_block.name, json: "" } : { type: "text", text: "" }; if (j.content_block.type === "tool_use" && onToolStart) onToolStart(); }
      else if (j.type === "content_block_delta") {
        const b = blocks[j.index]; if (!b) continue;
        if (j.delta.type === "text_delta") { b.text += j.delta.text; onText && onText(j.delta.text); }
        else if (j.delta.type === "input_json_delta") b.json += j.delta.partial_json;
      } else if (j.type === "message_delta") { if (j.usage) usage.output_tokens += Number(j.usage.output_tokens || 0); if (j.delta && j.delta.stop_reason) stop = j.delta.stop_reason; }
      else if (j.type === "error") throw new Error("anthropic stream error " + JSON.stringify(j.error || {}).slice(0, 200));
    }
  }
  const content = blocks.filter(Boolean).map(b => b.type === "tool_use" ? { type: "tool_use", id: b.id, name: b.name, input: (() => { try { return b.json ? JSON.parse(b.json) : {}; } catch { return {}; } })() } : { type: "text", text: b.text });
  return { content, usage, stop };
}

// ---------------------------------------------------------------- the output guard (server side)
// Nothing reaches the page unchecked: every number must come from THIS turn's tool results (or the
// buyer's own words), and the reply must not approximate, editorialise or add model facts.
const numTok = /(?<![A-Za-z0-9])\$?\d[\d,]*(?:\.\d+)?k?(?![A-Za-z0-9])/gi;
const normNum = t => { let x = String(t).toLowerCase().replace(/[$,]/g, ""); const k = /k$/.test(x); x = x.replace(/k$/, ""); const n = Number(x); return Number.isFinite(n) ? String(Math.round(k ? n * 1000 : n)) : null; };
function allowedNumbers(trace, userText) {
  const set = new Set();
  const addText = t => { for (const m of String(t).match(numTok) || []) { const n = normNum(m); if (n) set.add(n); } for (const m of String(t).match(/\d+/g) || []) set.add(String(Number(m))); };
  const walk = (o, key) => { if (o == null) return; if (Array.isArray(o)) return o.forEach(x => walk(x, key)); if (typeof o === "object") return Object.entries(o).forEach(([k, v]) => { if (/^(id|vin|url|link)$/i.test(k)) return; addText(k); walk(v, k); }); if (typeof o === "number") { set.add(String(Math.round(o))); return; } addText(o); };
  for (const t of trace) { walk(t.input); walk(t.result); }
  addText(userText || "");
  return set;
}
const BLOCKS = [
  [/\b(?:around|roughly|about|approximately|nearly|almost|some)\s+\$?\d/i, "an approximate number"],
  [/\bhighlights? include/i, "'Highlights include'"],
  [/\b(?:newer|more powerful|faster|rarer|quicker|desirable|sought[- ]after|collectible|iconic|legendary|investment|bargain|deal|cheap|expensive|overpriced|underpriced|good value|steal|solid|nice|great|good|bad)\b/i, "a judgement or a fact not in the tool results"],
  [/\b(?:I|I'm|I've|I'd|I'll)\b|\b(?:me|my|mine)\b/, "first person"],
  [/\b(?:well|far|way|just|slightly)\s+(?:below|above|under|over)\b/i, "a judgement on the bid"],
  [/\b(?:should (?:you )?bid|whether (?:you|to) (?:should )?bid)\b/i, "comment on whether to bid"],
  // Sam never describes itself or its limits: facts, then the next step.
  [/\bSam (?:can only|only (?:shares?|states?|gives?|has|knows?)|(?:doesn'?t|does not|won'?t|will not|can'?t|cannot|isn'?t able to|is not able to) (?:give|offer|share|say|judge|tell|comment|make|provide|weigh)|has no (?:view|opinion))\b|\b(?:not a verdict|verdicts?|opinions?|those are the facts|the facts Sam has|facts Sam can)\b|\bSam (?:doesn'?t|does not|can'?t|cannot|never) (?:search|cover|see|find|access|track|include)\b|\bnot (?:a|an) (?:house|site|platform|auction) (?:Sam|GoAskSam)\b/i, "a sentence about Sam itself"],
  [/\b(?:AI|valuation|worth|estimates?|good deal|overpriced|underpriced)\b/i, "a banned word"]
];
export function guardReply(reply, trace, userText) {
  const reasons = [];
  const ok = allowedNumbers(trace, userText);
  const bad = (String(reply).match(numTok) || []).map(normNum).filter(n => n && !ok.has(n));
  if (bad.length) reasons.push("numbers not in this turn's tool results: " + [...new Set(bad)].join(", "));
  if ((String(reply).match(/\?/g) || []).length > 1) reasons.push("more than one question");
  else if (/\?\s*\S/.test(String(reply).trim())) reasons.push("the question must be the last sentence");
  const sentences = (String(reply).trim().match(/[.!?](?=\s+[A-Z0-9"]|\s*$)/g) || []).length;
  const anyGood = trace.some(t => t.tool === "market_check" && t.input && t.input.listing_id) || trace.some(t => t.tool === "car_history");
  if (sentences > (anyGood ? 4 : 3)) reasons.push(`${sentences} sentences (at most ${anyGood ? 4 : 3})`);
  for (const [re, why] of BLOCKS) { const m = re.exec(reply); if (m) reasons.push(why + ` ("${m[0]}")`); }
  return reasons;
}
// The reply built in code when a model reply fails twice: the tools' own sentences.
function codeReply(trace) {
  const parts = [];
  for (const t of trace) {
    const r = t.result || {};
    if (t.tool === "search_live" && Array.isArray(r.count_sentences)) parts.push(r.count_sentences.join(". ") + ".");
    else if (t.tool === "market_check" && r.sold) parts.push([r.sold, r.bid_vs_spec, r.miles_vs_spec].filter(Boolean).join(". ") + ".");
    else if (t.tool === "market_check" && r.kind === "range") parts.push(`${r.spec} sold for ${r.sold_range_usd.low} to ${r.sold_range_usd.high}${r.sales ? ` across ${r.sales} sales` : ""}${r.period ? ` in the ${String(r.period).toLowerCase()}` : ""}.`);
    else if (t.tool === "market_check" && r.reason) parts.push(r.reason);
    else if (t.tool === "car_history" && r.kind === "history") parts.push(`This car has ${r.appearances.length === 1 ? "one recorded auction appearance" : r.appearances.length + " recorded auction appearances"}, the latest in ${r.appearances[0].when || String(r.appearances[0].date || "").slice(0, 7)}.`);
    else if (t.tool === "car_history" && r.reason) parts.push(r.reason);
  }
  return parts.join(" ") || "Sam couldn't put that into words. Try asking another way.";
}

// ---------------------------------------------------------------- a turn
// messages: [{role:"user"|"assistant", content:"..."}] (plain text history). Returns the reply, the
// cards' listing rows (to enrich), the updated state, and a trace of tool calls and results.
export async function runTurn({ env, apiKey, model, messages, state, onText, onReset, onGuard, deadlineMs = 25000 }) {
  const t0 = Date.now(), ctx = { state: { filters: { ...((state && state.filters) || {}) } }, lastCards: null };
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "America/Los_Angeles" });
  const system = systemPrompt(ctx.state, today);
  const convo = messages.map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "").slice(0, 2000) })).filter(m => m.content);
  const usage = { input_tokens: 0, output_tokens: 0 }, trace = [];
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), deadlineMs);
  let reply = "", textOut = false, mustTool = false;
  try {
    // Search first, always: a turn that names a car must call a tool before any words.
    const lastUser = (convo.filter(m => m.role === "user").pop() || {}).content || "";
    mustTool = await namesCar(lastUser);
    for (let round = 0; round < 6; round++) {
      let roundText = "";
      const out = await claudeStream({ apiKey, model, system, messages: convo, signal: ctl.signal, toolChoice: round === 0 && mustTool ? { type: "any" } : null,
        onText: t => { roundText += t; },
        onToolStart: () => { roundText = ""; } });
      usage.input_tokens += out.usage.input_tokens; usage.output_tokens += out.usage.output_tokens;
      // Text written before a tool call is withdrawn (the page clears it); only the answer stays.
      if (!out.content.some(b => b.type === "tool_use")) reply += roundText;
      const uses = out.content.filter(b => b.type === "tool_use");
      if (!uses.length || out.stop !== "tool_use") break;
      convo.push({ role: "assistant", content: out.content });
      const results = [];
      for (const u of uses) {
        const result = await execTool(env, u.name, u.input, ctx);
        trace.push({ tool: u.name, input: u.input, result });
        results.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(result) });
      }
      convo.push({ role: "user", content: results });
    }
    // The guard: checked before anything reaches the page; one regeneration with the failure named.
    const userText = (convo.filter(m => m.role === "user" && typeof m.content === "string").pop() || {}).content || "";
    reply = polish(reply);
    let reasons = guardReply(reply, trace, userText);
    if (reasons.length) {
      onGuard && onGuard({ attempt: 1, reasons, reply });
      convo.push({ role: "assistant", content: reply || "(empty)" });
      convo.push({ role: "user", content: "Rewrite your reply. It broke these rules: " + reasons.join("; ") + ". Use only the tool results above, the count_sentences word for word, no approximations, no judgements, nothing about Sam itself, third person." });
      const out = await claudeStream({ apiKey, model, system, messages: convo, signal: ctl.signal, onText: () => {} });
      usage.input_tokens += out.usage.input_tokens; usage.output_tokens += out.usage.output_tokens;
      reply = polish(out.content.filter(b => b.type === "text").map(b => b.text).join(""));
      reasons = guardReply(reply, trace, userText);
      if (reasons.length) { onGuard && onGuard({ attempt: 2, reasons, reply }); reply = clean(codeReply(trace)); }
    }
    textOut = true; onText && onText(reply);
  } finally { clearTimeout(timer); }
  return { reply, textOut, cards: ctx.lastCards || [], state: ctx.state, usage, trace, ms: Date.now() - t0, forcedTool: mustTool };
}
