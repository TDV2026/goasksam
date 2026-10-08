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
import { supabaseSelect } from "../_supabase.js";
import { marketCheck } from "../tools/marketCheck.js";
import { resolveSpec, specLabel } from "../tools/_shared.js";
import { findGeneration } from "../generations.js";
import { runOneBox } from "../onebox.js";
import { carHistory } from "../tools/carHistory.js";
import { parseQuery, emptyFilters, resolveForBuy, searchLive, gensNamed, colourKey, BODIES, listingMarket, nounFor } from "./search.js";
import { kindOf, budgetBySpec, placeAny, searchAll } from "./converse.js";
import { zipCoord, listingCoord, milesBetween, nearestPlace } from "./geo.js";
import { houseName } from "../../api/_historyData.js";
import { usd, polish, clean, namesCar, claudeStream, guardReply, runChatTurn } from "./chatCore.js";
export { guardReply, namesCar };
// ---------------------------------------------------------------- system prompt (Sam's rules)
export function systemPrompt(state, today) {
  return `You are Sam, the voice of GoAskSam, helping someone find a collector car at live auctions. You speak about yourself in the third person ("Sam found", "Sam can look"), never "I", "me" or "my".

How you talk:
- Plain, short sentences. Two sentences is usual, three at most. No dashes of any kind. No bullet lists, no headings, no markdown.
- Never use the words AI, valuation, valued, worth, estimate or appraisal.
- Never give a verdict on a live bid (never cheap, expensive, a deal, good value, overpriced, a steal, a good buy). Never compare the live bid with the sold range: state the bid as a fact and the range as a fact, in separate sentences, with no word (below, above, under, within) linking them. Never predict what a car will sell for or whether to buy it. You state facts from the tools.
- Never say how many sources, houses or platforms GoAskSam covers.
- Every number you say (counts, prices, miles, distances, years of sales) must come from a tool result in THIS conversation. If a number is not in a tool result, do not say it. Do not round tool numbers into new ones, do not add them up, do not compute averages.
- Ask at most one question per reply, and only when the answer would change the results. Ask it naturally. The question is the last sentence: never explain why you ask it. One offer per reply, never a choice: "Want to see the 10 further away?", never "the 10 further away, or the 2 above budget?". No "or" in a question.
- The cars appear as cards under your reply, so do not list every car. Mention one or two only when it helps, by year and model.

How you work:
- Call the tools first and write your reply only after the results are in. Never write a sentence before a tool call.
- Search first. As soon as the buyer names a car, a make, a type or a budget, call search_live with what you have. Never answer a search request with only a question.
- After a search the page shows the live count and the choices (cars near the buyer, cars abroad, cars above the budget) as buttons above the cards. So on a search turn never write a count, never offer cars abroad, further away or above the budget, never ask where the buyer is, and never describe the mix or spread of the cars. Only when something the buttons do not cover matters (a filter that could not be applied), say it in one short plain sentence; otherwise reply exactly: Here they are.
- "The ones further away" or "over 500 miles" means anywhere true with min_distance_miles (500, or the radius they had), so the count and the cards are only those further cars.
- When the buyer names a distance ("250 miles", "within 100 miles"), use exactly that radius, whether it is larger or smaller than before. Just apply it and report the result; never comment on the change itself.
- When the buyer asks for the cars above the budget, search again with include_above_budget true. When the buyer asks for the ones that don't say (their colour, gearbox, body or miles), search again with include_unstated true. When the buyer asks for the cars abroad, search again with anywhere true.
- Use search_live for anything about what is for sale now. Send the COMPLETE set of filters every time (the current search below plus the buyer's change), so filters persist across turns and change only when the buyer changes them ("expand to 250 miles" changes only the radius; "what about Boxsters" changes the model; "show me the ones further away" means radius anywhere).
- Cars by default: set vehicle to motorcycle only when the buyer says motorcycle, motorbike or bike, or names a bike model; otherwise leave it as car, even for a make that also builds motorcycles (BMW, Honda, Triumph).
- A budget ("under 50k", "under 120") is budget_max in dollars ("under 120" for a Porsche means $120,000). It filters on what that exact spec sells for, not on the current bid.
- The buyer's location is a ZIP or a city. Never ask where they are yourself: the page offers it as a button. "Near me" without a place: search without a location. "Show them all" or "skip" means no location: keep the search as it is.
- Use market_check for "what does X sell for / what has X been selling for". Then offer to show what is live.
- Use car_history for one specific car (a VIN or a listing). When the buyer describes a live car in words ("the white 964 on BaT"), find it yourself with search_live (colour, generation, house), then call car_history with that card's vin or url. Never ask the buyer for a link you can find.
- "Is this car any good?" or "should I bid?": find it with search_live, then call market_check with its listing_id and car_history with its vin. Answer in three sentences at most: what the car is (year, spec, miles, house, closing date, current bid); the sold sentence word for word (it names the group of sales it comes from); its history ("First time at auction." or its earlier sales). Never a verdict: never good, bad, nice, solid, fair, well below or a deal, and no comment on whether to bid.
- Years, trims, places and every other detail about a car come only from tool results (card titles and fields). Do not add model years or facts from your own knowledge.
- Only the tool results of THIS turn are in front of you. Never restate a distance, price or count from an earlier reply unless this turn's tool result has it; never write "around" or "about" with a number.
- Never describe the page or the cards' layout ("the cards above", "the first six"). Say "this car", never "this VIN". Say "one" for a single car ("one XJS coupe"), never "1 XJS".
- A stated year, range or decade always goes in year_min and year_max, and only those years match. If nothing in those years is live, search_live itself looks one year each side and the page says so above the cards; never widen further yourself.
- Correct obvious typos silently (porshe is Porsche, manul is manual).
- Never talk about Sam itself or its limits (never "Sam can only share facts", "not a verdict", "those are the facts Sam has", "Sam doesn't give opinions"). State the facts, then offer the next step.

Today is ${today}. Current search (empty means none yet): ${JSON.stringify(state && state.filters ? state.filters : {})}`;
}

// ---------------------------------------------------------------- tools
export const TOOLS = [
  { name: "search_live", description: "Search the collector cars live at auction right now. Send the complete filter set every time. Returns how many match, counts by kind, what the radius / budget / country cut, and the cards to show (with bid, miles, distance, ends, url, vin).",
    input_schema: { type: "object", properties: {
      vehicle: { type: "string", enum: ["car", "motorcycle"], description: "car unless the buyer says motorcycle, motorbike or bike, or names a bike model (BMW R90S, Ducati 900SS)" },
      make: { type: "string" }, model: { type: "string", description: "Model or family, e.g. 911, Cayenne, M3, Boxster" },
      generation: { type: "string", description: "Generation code, e.g. 997, 993, E46" }, trim: { type: "string", description: "e.g. Carrera S, GT3, Turbo" },
      body: { type: "string", description: "coupe, cabriolet, convertible, targa, roadster, sedan, wagon, suv" },
      gearbox: { type: "string", enum: ["manual", "automatic"] }, colour: { type: "string" },
      budget_max: { type: "number", description: "Dollars. Filters on what the exact spec sells for." },
      miles_max: { type: "number" }, year_min: { type: "number", description: "A stated year, range or decade: '66 Mustang is 1966 to 1966, the 60s is 1960 to 1969, 1965 to 1970 as given" }, year_max: { type: "number" }, location: { type: "string", description: "ZIP or city, e.g. 90210 or Austin, TX" },
      radius_miles: { type: "number", description: "Default 500 when a location is known" },
      min_distance_miles: { type: "number", description: "Only cars FURTHER than this from the location (for 'the ones further away', 'over 500 miles'). Use with anywhere true." }, anywhere: { type: "boolean", description: "true lifts the radius and shows cars abroad too" },
      country: { type: "string", description: "Two-letter country code when the buyer names one" },
      include_above_budget: { type: "boolean", description: "true shows the cars set aside because their spec sells above the budget" },
      include_unstated: { type: "boolean", description: "true also shows listings that don't state an attribute the buyer named (colour, gearbox, body, miles); only when the buyer asks for them" },
      house: { type: "string", description: "Auction site slug when the buyer names one, e.g. bringatrailer, carsandbids, pcarmarket, hagerty, hemmings, mecum, barrettjackson, bonhams, rmsothebys, gooding, broadarrow, collectingcars, carandclassic, themarket, pistonheads. Search it; never say a site is not searched." },
      sort: { type: "string", enum: ["nearest", "ending_soon", "lowest_bid", "lowest_miles"] }
    } } },
  { name: "market_check", description: "What cars like one exact spec actually sold for at auction: the sold range, number of sales, the period. For a LIVE car, pass its listing_id (the card's id): the answer is that car's own group of sales, named, as one sold sentence. Otherwise pass a plain-language car, e.g. 'manual 997 Carrera S coupe'.",
    input_schema: { type: "object", properties: { car: { type: "string" }, listing_id: { type: "number" } } } },
  { name: "car_history", description: "Every auction appearance of one specific car, by VIN or listing URL: date, house, miles, sold or not, hammer or high bid, reserve.",
    input_schema: { type: "object", properties: { vin_or_url: { type: "string" } }, required: ["vin_or_url"] } }
];

const isoDay = d => (d ? String(d).slice(0, 10) : null);
const singular = n => String(n).replace(/ cars$/, "").replace(/(ch|sh)es$/, "$1").replace(/(?<!s)s$/, "");
function cardSummary(x) {
  const r = x.r;
  return { id: r.id, title: r.listing_title, house: houseName(r.source), bid_usd: x.facts.priceUsd || null,
    miles: x.facts.km ? null : (x.facts.miles || null), km: x.facts.km || undefined, colour: x.facts.colour || null, gearbox: x.facts.gearboxLabel || null, body: x.facts.body || null,
    location: r.location || null, country: r.country || null, distance_miles: x.distance != null ? Math.max(1, Math.round(x.distance)) : null,
    ends: isoDay(r.end_time), url: r.url || null, vin: r.vin_norm || null, listing_does_not_say: x.unknown && x.unknown.length ? x.unknown : undefined,
    ...specFacts(x) };
}
// The card's spec market as a sentence written in code (a fact about finished sales, no verdict).
function specFacts(x) {
  const m = x.market; if (!m || !m.family) return {};
  // The cohort is named for what it is (the ladder may have stepped past the gearbox or the body).
  const out = { spec: m.family, cohort_step: m.step || "exact" };
  if (m.kind === "range") {
    out.spec_sold = `Across ${m.count} sales of ${m.family} in ${m.window}, most sold between ${usd(m.low)} and ${usd(m.high)}`;
  } else if (m.count) out.spec_sold = `Only ${m.count} ${m.family} sold in ${m.window}, too few for a range`;
  // Never the live bid against the range (a verdict on an open bid), never this car's miles against it.
  return out;
}

// The /buy search, shared by Sam's search tool and the Tasks matcher: the same input gives the same
// answer. opts.rows searches given listing rows instead of the live table; opts.keep(row) narrows the
// rows before the spec-priced budget (Tasks: only listings new since the task's checkpoint).
// opts.widenYears (Buy only): the SAME car and filters, the stated years widened by that many each side.
export async function runSearch(env, p, opts = {}) {
  // A stated year filters: the tool's year_min/year_max, or a year in the car words themselves.
  const raw = [p.make, p.model, p.generation, p.trim].filter(Boolean).join(" ").trim();
  const pq = parseQuery(raw);
  let yMin = Number(p.year_min) || pq.filters.yearMin || null, yMax = Number(p.year_max) || pq.filters.yearMax || null;
  if (yMin && !yMax) yMax = Number(p.year_max) || yMin; if (yMax && !yMin) yMin = yMax;
  const text = [yMin && yMin === yMax ? yMin : "", raw.replace(/\b(?:19|20)\d{2}\b/g, "").trim()].filter(Boolean).join(" ").trim();
  const v = raw ? await resolveForBuy(text, env) : null;
  const f = emptyFilters();
  if (yMin) { f.yearMin = yMin - (opts.widenYears || 0); f.yearMax = yMax + (opts.widenYears || 0); }
  if (p.body) { const b = String(p.body).toLowerCase(); if (BODIES.includes(b)) f.bodies = [b]; }
  // Cars by default; motorcycles only when asked (the tool's vehicle field, the words, or a bike model).
  if (p.vehicle === "motorcycle" || pq.filters.vehicle === "motorcycle") f.vehicle = "motorcycle";
  if (p.gearbox) { f.gearbox = p.gearbox === "manual" ? "manual" : "auto"; f.gearboxLabel = p.gearbox; }
  if (p.colour) { const c = colourKey(String(p.colour).toLowerCase()); if (c) f.colours = [c]; }
  if (Number(p.budget_max) > 0) f.priceMax = Math.round(Number(p.budget_max));
  const budgetBySpecOn = !p.include_above_budget;
  if (Number(p.miles_max) > 0) f.miMax = Math.round(Number(p.miles_max));
  if (p.country) f.countries = [String(p.country).toUpperCase().slice(0, 2)];
  if (p.house) { const h = String(p.house).toLowerCase().replace(/&/g, "and").replace(/[^a-z]/g, ""); f.houses = [h === "bat" ? "bringatrailer" : h === "cb" ? "carsandbids" : h]; }
  if (v && p.generation) { const g = gensNamed(String(p.generation), v.make); if (g.length) f.gens = g; }
  const res = v ? await searchLive(env, v, f, text, { rows: opts.rows }) : (opts.rows ? { rows: [] } : (Object.values(p).some(Boolean) ? await searchAll(env, f) : { rows: [] }));
  let matches = res.rows || [];
  if (opts.keep) matches = matches.filter(x => opts.keep(x.r));
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
  // UNKNOWN IS NOT A MATCH (Oct 2026): a listing that does not state an attribute the buyer named (colour,
  // gearbox, body, miles) is not a match, for the Buy chat, Tasks and the landing alike. They are counted
  // (by the attribute most often unstated) and shown only when the buyer asks (include_unstated).
  const unstatedList = matches.filter(x => (x.unknown || []).length);
  const tally = {}; for (const x of unstatedList) for (const k of x.unknown) tally[k] = (tally[k] || 0) + 1;
  const unstatedWhat = Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([k]) => k)[0] || null;
  if (!p.include_unstated) matches = matches.filter(x => !(x.unknown || []).length);
  return { v, f, text, matches, abroadHidden, cutByBudget, budgetBySpecOn, center, placeName, radius, beyond, noLocation, unstated: p.include_unstated ? 0 : unstatedList.length, unstatedWhat };
}
async function toolSearchLive(env, p, ctx) {
  let sr = await runSearch(env, p);
  // Nothing live in the stated years: the SAME search (same car, same filters) one year each side, never
  // a different car. The cards are only the neighbouring years; none there either says so, with no list.
  let near = null;
  if (!sr.matches.length && sr.f.yearMin && sr.v) {
    const w = await runSearch(env, p, { widenYears: 1 });
    const asked = [sr.f.yearMin, sr.f.yearMax];
    const yr = x => Number(x.r.year) || Number((/\b(19\d{2}|20[0-3]\d)\b/.exec(String(x.r.title || "")) || [])[1]) || null;
    const nm = w.matches.filter(x => { const y = yr(x); return y && (y < asked[0] || y > asked[1]); });
    near = { asked, years: [...new Set(nm.map(yr))].sort((a, b) => a - b), noun: nounFor(sr.v, { ...sr.f, yearMin: null, yearMax: null }) };
    if (nm.length) sr = { ...w, matches: nm };
  }
  const { v, f, text, matches: m0, abroadHidden, cutByBudget, budgetBySpecOn, center, placeName, radius, beyond, noLocation, unstated, unstatedWhat } = sr;
  let matches = m0;
  // Order: confirmed matches first, then nearest (or the requested sort).
  const sorters = {
    nearest: (a, b) => (a.distance == null ? 1e9 : a.distance) - (b.distance == null ? 1e9 : b.distance),
    ending_soon: (a, b) => String(a.r.end_time || "9").localeCompare(String(b.r.end_time || "9")),
    lowest_bid: (a, b) => (a.facts.priceUsd || 1e12) - (b.facts.priceUsd || 1e12),
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
  // The years come after the noun ("Mustangs from 1966"), so a count never sits before a year.
  const yrs = f.yearMin ? (f.yearMin === f.yearMax ? `from ${f.yearMin}` : (f.yearMax - f.yearMin === 9 && f.yearMin % 10 === 0 ? `from the ${f.yearMin}s` : `from ${f.yearMin} to ${f.yearMax}`)) : "";
  const descOf = noun => [f.colours.length ? String(p.colour).toLowerCase() : "", f.gearbox ? (f.gearbox === "manual" ? "manual" : "automatic") : "", noun, yrs, f.miMax ? `under ${k(f.miMax)} miles` : ""].filter(Boolean).join(" ");
  const lead = nLive ? `${nLive === 1 ? "one" : nLive} ${descOf(nLive === 1 ? singular(plural) : plural)}` : `No ${descOf(plural)}`;
  const say = [];
  say.push(center && radius ? `${lead} within ${radius} miles of ${placeName}` : (center && Number(p.min_distance_miles) > 0 ? `${lead} further than ${Math.round(Number(p.min_distance_miles))} miles` : lead));
  if (beyond && beyond.count) say.push(`${beyond.count} further than ${radius} miles`);
  if (center && radius && noLocation) say.push(`${noLocation} more with no usable location`);
  if (abroadHidden) say.push(`${abroadHidden} more abroad`);
  if (f.priceMax && budgetBySpecOn && cutByBudget) say.push(`${cutByBudget} set aside because that spec usually sells above your budget`);
  // The same counts as sentences that read like Sam, for the reply built in code (never "1 Allante.").
  const is = n => (n === 1 ? "is" : "are");
  const plain = [];
  const whereTxt = center && radius ? ` within ${radius} miles of ${placeName}` : (center && Number(p.min_distance_miles) > 0 ? ` further than ${Math.round(Number(p.min_distance_miles))} miles away` : "");
  plain.push(nLive ? `Sam found ${nLive === 1 ? "one" : nLive} ${descOf(nLive === 1 ? singular(plural) : plural)}${whereTxt} live right now.` : `Nothing live matches ${descOf(plural)}${whereTxt} right now.`);
  if (beyond && beyond.count) plain.push(`${beyond.count} more ${is(beyond.count)} further than ${radius} miles away.`);
  else if (abroadHidden) plain.push(`${abroadHidden} more ${is(abroadHidden)} abroad.`);
  if (f.priceMax && budgetBySpecOn && cutByBudget) plain.push(`${cutByBudget} ${cutByBudget === 1 ? "was" : "were"} set aside because that spec usually sells above your budget.`);
  let nearNote = null;
  if (near) {
    // "No 2009 911 Cabriolets are live right now. Here are the 2008 and 2010 ones."
    const a = near.asked, askedTxt = a[0] === a[1] ? `${a[0]} ` : "", rangeTxt = a[0] === a[1] ? "" : ` from ${a[0]} to ${a[1]}`;
    const nounTxt = [f.colours.length ? String(p.colour).toLowerCase() : "", f.gearbox ? (f.gearbox === "manual" ? "manual" : "automatic") : "", near.noun, f.miMax ? `under ${k(f.miMax)} miles` : ""].filter(Boolean).join(" ");
    const none = `No ${askedTxt}${nounTxt}${rangeTxt} are live right now`;
    const ys = near.years.join(" and ");
    const line = near.years.length ? `${none}. Here are the ${ys} ones.` : `${none}, and none from ${a[0] - 1} or ${a[1] + 1} either.`;
    say.length = 0; say.push(line); plain.length = 0; plain.push(line);
    if (!near.years.length) matches = [];
    nearNote = line;
  }
  // The page's results box (Oct 2026): the live count, and the choices as buttons (near me, show them all,
  // cars abroad, cars above the budget), never as sentences in the reply. The nearest-years sentence is
  // the box's note. The reply built in code for a search turn says nothing beyond the box.
  ctx.plain = [];
  ctx.searchMeta = { live: matches.length, abroad: abroadHidden || 0, aboveBudget: f.priceMax && budgetBySpecOn ? (cutByBudget || 0) : 0, located: !!center, place: placeName || null, radius: radius || null, beyond: beyond ? beyond.count : 0, note: nearNote, unstated: unstated || 0, unstatedWhat: unstatedWhat || null };
  // The page shows 6 and offers "Show 6 more" (up to 24); Sam sees the first 6.
  const shown = matches.slice(0, 24);
  ctx.noun = plural;
  await Promise.all(shown.map(async x => { if (x.market === undefined) { const m = await listingMarket(env, x.r, x.facts, { noBlock: true }).catch(() => null); x.market = m && m.kind === "pending" ? undefined : m; } }));
  ctx.lastCards = shown;
  ctx.state.filters = Object.fromEntries(Object.entries(p).filter(([, val]) => val !== undefined && val !== null && val !== ""));
  return {
    understood: v ? [v.make, v.parentModel || v.model, v.genCode, v.trim].filter(Boolean).join(" ") : (p.make || "any car"),
    location: placeName, radius_miles: radius, sort: sortKey, cards: shown.slice(0, 6).map(cardSummary)
  };
}

// Lane A's market_check, in the conversation's field names.
async function toolMarketCheck(env, car) {
  const o = await marketCheck(String(car || ""), env);
  // Answer first: when the handler would ask which variant (coupe or cabriolet), read the engine's own
  // across-the-variants answer (its two-question cap) and name what it covers, never a choice question.
  if (o.kind === "question") {
    const r = await resolveSpec(String(car || "")).catch(() => null);
    if (r && r.vehicle) {
      const generation = await findGeneration(r.vehicle, env).catch(() => null);
      const d = await runOneBox(r.vehicle, generation, r.vehicle.raw, { supabaseUrl: env.supabaseUrl, supabaseKey: env.supabaseKey, asked: 2 }, null).catch(() => null);
      if (d && Array.isArray(d.cluster) && d.cluster.length === 2) return { kind: "range", spec: specLabel(d.resolvedCar || r.vehicle) + (o.options && o.options.length ? ` (${o.options.join(", ")} together)` : ""), sold_range_usd: { low: usd(d.cluster[0]), high: usd(d.cluster[1]) }, sales: Number(d.poolN) || null, period: d.windowLabel || null };
    }
    return { kind: "no_range", reason: "Too few recorded sales across its versions for a range.", spec: null };
  }
  const closest = o.closestSale ? { title: o.closestSale.title, sold_usd: o.closestSale.hammerUsd, date: o.closestSale.date, url: o.closestSale.url } : null;
  if (o.kind === "answer") return { kind: "range", spec: o.spec, sold_range_usd: o.soldRangeHammerUsd, sales: o.salesCount, period: o.period, closest_sale: closest, link: o.link };
  return { kind: "no_range", spec: o.spec || null, reason: o.reason, closest_sale: closest, link: o.link || null };
}

// A live car's own exact spec (the same spec its card line uses), computed if not cached yet.
async function toolMarketCheckListing(env, id) {
  const { liveRows, listingFacts, specOf } = await import("./search.js");
  const rows = await liveRows(env, `id=eq.${id}`);
  const r = rows && rows[0]; if (!r) return { kind: "none", reason: "That listing is no longer live." };
  const facts = listingFacts(r);
  // The car named by its spec, the way a buyer says it: "964 Carrera 4 coupe", "Allante convertible".
  const sp = await specOf(env, r, facts).catch(() => null);
  const gc = sp && sp.generation && sp.generation.code, v = sp && sp.v;
  const carSpec = v ? [gc && !/^(first|second|third|fourth|fifth|sixth|seventh|eighth)$/i.test(gc) ? gc : (String(v.model) === "911" ? "911" : v.model), gc && String(v.model) !== "911" && !/^[A-Z]?\d/.test(gc) ? null : (gc && String(v.model) !== "911" ? v.model : null), v.trim, (/^(suv|sedan|wagon|hatchback|pickup|truck)$/i.test(String(v.bodyStyle || facts.body || "")) ? null : (String(v.bodyStyle || facts.body || "").toLowerCase() || null))].filter(Boolean).filter((w, i, a) => a.indexOf(w) === i).join(" ") : null;
  const m = await listingMarket(env, r, facts);
  if (!m || m.kind === "pending") return { kind: "none", reason: "No recorded sales of this car's spec, with or without its gearbox and body, in the window." };
  const sf = specFacts({ market: m, r });
  return { kind: m.kind === "range" ? "range" : "no_range", car_spec: carSpec, cohort: m.family, cohort_step: m.step || "exact", sold: sf.spec_sold || null, count: m.count || null, low: m.kind === "range" ? m.low : null, high: m.kind === "range" ? m.high : null, window: m.window || null };
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

// The reply built in code when a model reply fails twice: the tools' own facts, in Sam's voice.
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthYear = d => { const m = /^(\d{4})-(\d{2})/.exec(String(d || "")); return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : ""; };
function historySentence(r) {
  if (!r || r.kind !== "history" || !r.appearances.length) return "First time at auction.";
  const apps = r.appearances.slice().sort((a, b) => String(a.date || "").localeCompare(String(b.date || ""))).slice(-2);
  const bits = apps.map((a, i) => a.result === "sold" ? (i > 0 && apps[i - 1].result === "sold" && a.hammer_usd ? `${a.hammer_usd} in ${monthYear(a.date)}` : `sold for ${a.hammer_usd || "an undisclosed amount"} in ${monthYear(a.date)}`) : `was bid to ${a.high_bid_usd || "an undisclosed amount"} in ${monthYear(a.date)} and didn't sell`);
  return `This car ${bits.join(", then ")}.`;
}
function carSentence(c, spec) {
  const ends = c.ends ? (() => { const d = new Date(c.ends + "T12:00:00Z"); return isNaN(d) ? "" : d.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" }); })() : "";
  const name = spec || String(c.title || "").replace(/^.*?\b(?:19|20)\d{2}\s+/, "").replace(/\s+(?:with|w\/|for)\s.*$/i, "").replace(/\s+\d-Speed.*$/i, "");
  const has = [c.miles ? `${Number(c.miles).toLocaleString("en-US")} miles` : "", c.bid_usd ? `a ${usd(c.bid_usd)} bid` : ""].filter(Boolean).join(" and ");
  return `This ${name}${has ? ` has ${has}` : " is"}${c.house ? ` on ${c.house}` : ""}${ends ? `, closing ${ends}` : ""}.`;
}
// "In the past year 14 Carrera 4s from the 964 generation sold": a count never sits right before a
// model number ("14 964 Carrera 4s" reads as one number).
function rangeSentence(r) {
  const when = String(r.window || "the past year").replace(/^the /, "the ");
  const fam = String(r.cohort || "cars like it");
  const m = /^(\S*\d\S*)\s+(.+)$/.exec(fam);
  const span = `most for ${usd(r.low)} to ${usd(r.high)}`;
  if (m) return `In ${when} ${r.count} ${m[2]} from the ${m[1]} generation sold, ${span}.`;
  if (/^\S*\d/.test(fam)) return `In ${when} ${fam} sold ${r.count} times, ${span}.`;
  return `In ${when} ${r.count} ${fam} sold, ${span}.`;
}
export function codeReply(trace, ctx) {
  const mc = trace.filter(t => t.tool === "market_check" && t.input && t.input.listing_id).pop();
  if (mc) {
    // "Is it any good?": what the car is, its group's range, its history. Three sentences.
    const cards = trace.filter(t => t.tool === "search_live").flatMap(t => (t.result && t.result.cards) || []);
    const c = cards.find(x => Number(x.id) === Number(mc.input.listing_id));
    const ch = trace.filter(t => t.tool === "car_history").pop();
    const r = mc.result || {};
    const range = r.low && r.high && r.count ? rangeSentence(r) : (r.sold ? r.sold + "." : r.reason || "");
    return [c ? carSentence(c, r.car_spec) : "", range, historySentence(ch && ch.result)].filter(Boolean).join(" ");
  }
  const parts = [];
  for (const t of trace) {
    const r = t.result || {};
    if (t.tool === "search_live") { if (ctx && ctx.plain) { parts.length = 0; parts.push(...ctx.plain); } }
    else if (t.tool === "market_check" && r.kind === "range") parts.push(`${r.spec} sold for ${r.sold_range_usd.low} to ${r.sold_range_usd.high}${r.sales ? ` across ${r.sales} sales` : ""}${r.period ? ` in the ${String(r.period).toLowerCase()}` : ""}.`);
    else if (t.tool === "market_check" && r.reason) parts.push(r.reason);
    else if (t.tool === "car_history") parts.push(historySentence(r));
  }
  if (!parts.length && trace.some(t => t.tool === "search_live")) return "Here they are.";   // the results box says the rest
  return parts.slice(0, 3).join(" ") || "Sam couldn't put that into words. Try asking another way.";
}

// ---------------------------------------------------------------- a turn (the shared core)
const BUY = {
  system: (ctx, today) => systemPrompt(ctx.state, today),
  tools: TOOLS, execTool, codeReply,
  // "Is it any good?": the answer is the three facts, built in code (the car, its group's range, its
  // history), so it is always three short sentences and can carry no verdict on the bid.
  override: (trace, ctx) => trace.some(t => t.tool === "market_check" && t.input && t.input.listing_id) ? codeReply(trace, ctx) : null,
  rewriteHint: "Use only the tool results above, the count_sentences word for word, no approximations, no judgements, nothing about Sam itself, third person."
};
// The opening reply on a search turn never carries counts or filler (Oct 2026): the results box above
// the cards shows the live count and the choices as buttons. The prompt says so; this is the check in
// code, sentence by sentence, for anything the model writes anyway (and for the live text as it streams).
const SEARCH_FILLER = /\bSam found\b|\b(?:are|is) live\b|\blive (?:right now|at auction|today)\b|\babroad\b|\bfurther (?:than|away)\b|\bset aside\b|\bspread\b|\brang(?:e|es|ing) from\b|\bspanning\b|\bthe cards\b|\bin the mix\b|\bgenerations?\b|\bnear you\b|\bwhere you are\b|\blocated\b|\blocation\b|\bnarrow (?:it|things|them|the search) down\b|\bskip it\b|\bwant to see\b|\bthere (?:are|is)\b|^\s*here they are\.?\s*$|^\s*(?:\d[\d,]*|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s/i;
// With cars found, the chips carry every choice, so no question stays; with none found, one offer to widen
// the search may stay, but never a sentence that only restates the box ("Nothing came back").
export function cleanSearchReply(text, opts = {}) {
  const parts = String(text || "").replace(/\s+/g, " ").trim().match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
  return parts.map(x => x.trim()).filter(x => x && !SEARCH_FILLER.test(x) && !(opts.found && /\?\s*$/.test(x)) && !/^nothing\b/i.test(x)).join(" ").trim();
}
export async function runTurn({ env, apiKey, model, messages, state, onText, onGuard, deadlineMs = 25000 }) {
  const ctx = { state: { filters: { ...((state && state.filters) || {}) } }, lastCards: null };
  const found = () => !!(ctx.searchMeta && ctx.searchMeta.live > 0);
  const streamed = onText ? t => onText(ctx.searchMeta ? cleanSearchReply(t, { found: found() }) : t) : onText;
  const out = await runChatTurn(BUY, { env, apiKey, model, messages, ctx, onText: streamed, onGuard, deadlineMs });
  const reply = String(out.reply || "").trim();
  // searchNote: what is left of the reply on a search turn (often nothing); meta: the box's facts.
  return { ...out, reply, searchNote: ctx.searchMeta ? cleanSearchReply(reply, { found: found() }) : null, meta: ctx.searchMeta || null, cards: ctx.lastCards || [], state: ctx.state, noun: ctx.noun || null };
}
