// /buy conversation, run by Claude with the engine as tools (Lane C, Oct 2026). Each turn: the full
// conversation + the current search state go to Claude (SAM_MODEL) with three tools:
//   search_live  - the live auctions, through the same /buy search (resolver, spec-priced budget,
//                  location + radius, abroad hidden) with counts of what each filter cut
//   market_check - what cars like it sold for (the One Box engine, archive only)
//   car_history  - one car's auction appearances (VIN or listing link)
// market_check / car_history mirror Lane A's MCP tools (api/mcp.js does not export them), built on
// the same shared engine calls: resolveVehicle, findGeneration, runOneBox, vinAppearances.
// Engine files are imported read-only, never edited. ZERO OldCarsData.
import { resolveVehicle, sanitizeResolvedVehicle } from "../vehicle.js";
import { findGeneration } from "../generations.js";
import { runOneBox } from "../onebox.js";
import { supabaseSelect } from "../_supabase.js";
import { normalizeListingUrl, batSlugToUrlNorm } from "../_urlNorm.js";
import { emptyFilters, resolveForBuy, searchLive, gensNamed, colourKey, BODIES } from "./search.js";
import { kindOf, budgetBySpec, placeAny, searchAll } from "./converse.js";
import { zipCoord, listingCoord, milesBetween, nearestPlace } from "./geo.js";
import { vinAppearances, normVin, carIdentity, carSlug, houseName } from "../../api/_historyData.js";

const SITE = "https://goasksam.com";
const usd = n => (n == null || !Number.isFinite(Number(n)) ? null : "$" + Math.round(Number(n)).toLocaleString("en-US"));
const BANNED = /\b(valuation|valued|worth|estimate[sd]?|apprais\w*|AI)\b/gi;
// Last line of defence (the prompt already forbids these): rephrase rather than cut mid-sentence.
const clean = s => String(s || "").replace(/[–—]/g, ",")
  .replace(/\b(?:it'?s |also )?worth (?:knowing|noting|mentioning|a look)\b:?/gi, "Also,")
  .replace(BANNED, "").replace(/\s+([,.])/g, "$1").replace(/\s{2,}/g, " ").replace(/(^|[.!?]\s+)([a-z])/g, (m, a, b) => a + b.toUpperCase()).trim();

// ---------------------------------------------------------------- system prompt (Sam's rules)
export function systemPrompt(state, today) {
  return `You are Sam, the voice of GoAskSam, helping someone find a collector car at live auctions. You speak about yourself in the third person ("Sam found", "Sam can look"), never "I", "me" or "my".

How you talk:
- Plain, short sentences. Two to four sentences per reply is usual. No dashes of any kind. No bullet lists, no headings, no markdown.
- Never use the words AI, valuation, valued, worth, estimate or appraisal.
- Never give a verdict on a live bid (never cheap, expensive, a deal, good value, overpriced, a steal, a good buy). Never predict what a car will sell for or whether to buy it. You state facts from the tools.
- Never say how many sources, houses or platforms GoAskSam covers.
- Every number you say (counts, prices, miles, distances, years of sales) must come from a tool result in THIS conversation. If a number is not in a tool result, do not say it. Do not round tool numbers into new ones, do not add them up, do not compute averages.
- Ask at most one question per reply, and only when the answer would change the results. Ask it naturally ("Where are you, roughly?"). Never offer a list of options to pick from.
- When a filter cut results, say so in words and offer the change ("13 more Cayennes are further than 500 miles away. Want to see them?"), using the counts the tool returned.
- The cars appear as cards under your reply, so do not list every car. Mention one or two only when it helps, by year and model.

How you work:
- Call the tools first and write your reply only after the results are in. Never write a sentence before a tool call.
- Search first. As soon as the buyer names a car, a make, a type or a budget, call search_live with what you have and tell them what is live. Then, if it would narrow things, ask your one question (for example where they are) in that same reply. Never answer a search request with only a question.
- "The ones further away" or "over 500 miles" means anywhere true with min_distance_miles (500, or the radius they had), so the count and the cards are only those further cars.
- When the buyer names a distance ("250 miles", "within 100 miles"), use exactly that radius, whether it is larger or smaller than before. Just apply it and report the result; never comment on the change itself.
- Say counts exactly as a tool gives them, each in its own meaning (further_than_radius.count is how many matching cars are further away than the radius). Never add two counts together or describe a range of counts.
- Use search_live for anything about what is for sale now. Send the COMPLETE set of filters every time (the current search below plus the buyer's change), so filters persist across turns and change only when the buyer changes them ("expand to 250 miles" changes only the radius; "what about Boxsters" changes the model; "show me the ones further away" means radius anywhere).
- A budget ("under 50k", "under 120") is budget_max in dollars ("under 120" for a Porsche means $120,000). It filters on what that exact spec sells for, not on the current bid.
- The buyer's location is a ZIP or a city. "Near me" without a place means you need their location: ask for it.
- Use market_check for "what does X sell for / what has X been selling for". Then offer to show what is live.
- Use car_history for one specific car (a VIN or a listing). When the buyer describes a live car in words ("the white 964 on BaT"), find it yourself with search_live (colour, generation, house), then call car_history with that card's vin or url. Never ask the buyer for a link you can find. For "is this car any good", give its facts and history only (miles, what it sold for before, reserve, ending), never a verdict.
- Years, trims, places and every other detail about a car come only from tool results (card titles and fields). Do not add model years or facts from your own knowledge.
- Only the tool results of THIS turn are in front of you. Never restate a distance, price or count from an earlier reply unless this turn's tool result has it; never write "around" or "about" with a number.
- Correct obvious typos silently (porshe is Porsche, manul is manual).

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
      house: { type: "string", description: "Auction site when the buyer names one: bringatrailer, carsandbids, pcarmarket, hagerty, mecum, bonhams, rmsothebys, gooding, broadarrow, collectingcars, carandclassic" },
      sort: { type: "string", enum: ["nearest", "ending_soon", "lowest_bid", "lowest_miles"] }
    } } },
  { name: "market_check", description: "What cars like one exact spec actually sold for at auction: the sold range, number of sales, the period, and the closest recorded sale. Input a plain-language car, e.g. 'manual 997 Carrera S coupe'.",
    input_schema: { type: "object", properties: { car: { type: "string" } }, required: ["car"] } },
  { name: "car_history", description: "Every auction appearance of one specific car, by VIN or listing URL: date, house, miles, sold or not, hammer or high bid, reserve.",
    input_schema: { type: "object", properties: { vin_or_url: { type: "string" } }, required: ["vin_or_url"] } }
];

const isoDay = d => (d ? String(d).slice(0, 10) : null);
function cardSummary(x) {
  const r = x.r;
  return { id: r.id, title: r.listing_title, house: houseName(r.source), bid_usd: r.current_bid_usd != null ? Math.round(Number(r.current_bid_usd)) : null,
    miles: x.facts.miles || null, colour: x.facts.colour || null, gearbox: x.facts.gearboxLabel || null, body: x.facts.body || null,
    location: r.location || null, country: r.country || null, distance_miles: x.distance != null ? Math.max(1, Math.round(x.distance)) : null,
    ends: isoDay(r.end_time), url: r.url || null, vin: r.vin_norm || null, listing_does_not_say: x.unknown && x.unknown.length ? x.unknown : undefined };
}

async function toolSearchLive(env, p, ctx) {
  const text = [p.make, p.model, p.generation, p.trim].filter(Boolean).join(" ").trim();
  const v = text ? await resolveForBuy(text, env) : null;
  const f = emptyFilters();
  if (p.body) { const b = String(p.body).toLowerCase(); if (BODIES.includes(b)) f.bodies = [b]; }
  if (p.gearbox) { f.gearbox = p.gearbox === "manual" ? "manual" : "auto"; f.gearboxLabel = p.gearbox; }
  if (p.colour) { const c = colourKey(String(p.colour).toLowerCase()); if (c) f.colours = [c]; }
  if (Number(p.budget_max) > 0) f.priceMax = Math.round(Number(p.budget_max));
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
  matches = await budgetBySpec(env, matches, f);
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
  const shown = matches.slice(0, 12);
  ctx.lastCards = shown;
  ctx.state.filters = Object.fromEntries(Object.entries(p).filter(([, val]) => val !== undefined && val !== null && val !== ""));
  return {
    understood: v ? [v.make, v.parentModel || v.model, v.genCode, v.trim].filter(Boolean).join(" ") : (p.make || "any car"),
    matching_live: matches.length, cards_shown: shown.length, by_kind: byKind,
    location: placeName, radius_miles: radius, only_further_than_miles: center && Number(p.min_distance_miles) > 0 ? Math.round(Number(p.min_distance_miles)) : undefined, further_than_radius: beyond || undefined, listed_without_a_usable_location: center && radius && noLocation ? noLocation : undefined,
    abroad_hidden: abroadHidden || undefined, cut_because_spec_sells_above_budget: f.priceMax ? cutByBudget : undefined,
    listings_that_do_not_state_a_filtered_detail: matches.filter(x => (x.unknown || []).length).length || undefined,
    sort: sortKey, cards: shown.map(cardSummary)
  };
}

async function toolMarketCheck(env, car) {
  const resolution = await resolveVehicle(String(car || "")).catch(() => null);
  const v0 = resolution && resolution.vehicle;
  if (!v0 || !v0.make || !v0.model) return { kind: "question", question: "Which exact car? A make and model works best." };
  const vehicle = sanitizeResolvedVehicle(v0) || v0; vehicle.raw = vehicle.raw || car;
  const generation = await findGeneration(vehicle, env).catch(() => null);
  const run = asked => runOneBox(vehicle, generation, vehicle.raw, { supabaseUrl: env.supabaseUrl, supabaseKey: env.supabaseKey, asked }, null).catch(() => null);
  let d = await run(0);
  if (d && /_choice$/.test(String(d.tier || ""))) d = await run(2);
  if (!d || !d.tier || /_choice$/.test(String(d.tier || ""))) return { kind: "none", reason: "No recorded sales to read for that car yet." };
  const rc = d.resolvedCar || vehicle;
  const spec = [rc.year, rc.make, rc.model, rc.trim, rc.bodyStyle].filter(Boolean).join(" ");
  const c = d.representative && d.representative.closest;
  const closestUsd = c ? [c.price, c.value, c.allIn].map(Number).find(n => Number.isFinite(n) && n > 0) : null;
  const closest = c ? { title: c.title || spec, sold_usd: usd(closestUsd), date: isoDay(c.date), url: c.url || null } : null;
  const link = `${SITE}/onebox?q=${encodeURIComponent(spec)}`;
  if (Array.isArray(d.cluster) && d.cluster.length === 2) return { kind: "range", spec, sold_range_usd: { low: usd(d.cluster[0]), high: usd(d.cluster[1]) }, sales: Number(d.poolN) || null, period: d.windowLabel || null, closest_sale: closest, link };
  const n = d.tier === "thin" ? ((d.thin && d.thin.receipts) || d.cards || []).length : (Number(d.poolN) || (d.cards || []).length || 0);
  return { kind: "no_range", spec, sales: n || null, reason: n && n < 8 ? "Too few recorded sales for a typical range." : "The recorded sales are too spread out for one range.", closest_sale: closest, link };
}

async function toolCarHistory(env, input) {
  const raw = String(input || "").trim();
  const byUrlNorm = async (norm) => {
    if (!norm) return "";
    const s = await supabaseSelect(env, `sales_archive?url_norm=eq.${encodeURIComponent(norm)}&select=vin_norm&limit=1`).catch(() => null);
    if (s && s[0] && s[0].vin_norm) return normVin(s[0].vin_norm);
    const a = await supabaseSelect(env, `auction_attempts?url_norm=eq.${encodeURIComponent(norm)}&select=chassis_vin_norm&limit=1`).catch(() => null);
    if (a && a[0] && a[0].chassis_vin_norm) return normVin(a[0].chassis_vin_norm);
    const l = await supabaseSelect(env, `live_listings?url=eq.${encodeURIComponent(raw)}&select=vin_norm&limit=1`).catch(() => null);
    return l && l[0] && l[0].vin_norm ? normVin(l[0].vin_norm) : "";
  };
  let vin = "";
  if (/^https?:\/\//i.test(raw)) vin = await byUrlNorm(normalizeListingUrl(raw));
  else if (/-/.test(raw) && !/^[A-Za-z0-9]{10,17}$/.test(raw)) vin = await byUrlNorm(batSlugToUrlNorm(raw));
  else vin = normVin(raw);
  if (!(vin && vin.length >= 6)) return { kind: "none", reason: "That does not look like a VIN or a listing GoAskSam can match." };
  const data = await vinAppearances(env, vin);
  if (!data || !data.ok || !data.appearances.length) return { kind: "none", vin, reason: "No recorded auction appearances for this car before this listing." };
  const apps = data.appearances.slice(0, 20).map(a => ({ date: a.date || null, house: a.house || null, miles: Number.isFinite(a.mileage) ? a.mileage : null, result: a.kind === "sale" ? "sold" : "not sold", hammer_usd: a.kind === "sale" ? usd(a.priceUsd) : null, high_bid_usd: a.kind === "sale" ? null : usd(a.bidUsd), url: a.url || null }));
  let id = null; try { id = await carIdentity(data.appearances, vin); } catch { /* */ }
  return { kind: "history", vin, car: id ? [id.year, id.make, id.family].filter(Boolean).join(" ") : null, appearances: apps, link: id ? `${SITE}/history/${carSlug(id)}/${vin}` : `${SITE}/vin/${vin}` };
}

async function execTool(env, name, input, ctx) {
  try {
    if (name === "search_live") return await toolSearchLive(env, input || {}, ctx);
    if (name === "market_check") return await toolMarketCheck(env, input && input.car);
    if (name === "car_history") return await toolCarHistory(env, input && input.vin_or_url);
    return { error: "unknown tool" };
  } catch (e) { console.error("samChat tool failed:", name, e && e.message); return { error: "The search did not come back. Try again." }; }
}

// ---------------------------------------------------------------- one Claude call, streamed
async function claudeStream({ apiKey, model, system, messages, onText, onToolStart, signal }) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", signal,
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: 700, system, messages, tools: TOOLS, stream: true })
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

// ---------------------------------------------------------------- a turn
// messages: [{role:"user"|"assistant", content:"..."}] (plain text history). Returns the reply, the
// cards' listing rows (to enrich), the updated state, and a trace of tool calls and results.
export async function runTurn({ env, apiKey, model, messages, state, onText, onReset, deadlineMs = 50000 }) {
  const t0 = Date.now(), ctx = { state: { filters: { ...((state && state.filters) || {}) } }, lastCards: null };
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "America/Los_Angeles" });
  const system = systemPrompt(ctx.state, today);
  const convo = messages.map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "").slice(0, 2000) })).filter(m => m.content);
  const usage = { input_tokens: 0, output_tokens: 0 }, trace = [];
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), deadlineMs);
  let reply = "", textOut = false;
  try {
    for (let round = 0; round < 6; round++) {
      let roundText = "";
      const out = await claudeStream({ apiKey, model, system, messages: convo, signal: ctl.signal,
        onText: t => { roundText += t; textOut = true; onText && onText(t); },
        onToolStart: () => { if (roundText) { roundText = ""; onReset && onReset(); } } });
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
  } finally { clearTimeout(timer); }
  return { reply: clean(reply), textOut, cards: ctx.lastCards || [], state: ctx.state, usage, trace, ms: Date.now() - t0 };
}
