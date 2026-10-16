// /buy search API (Lane C, Oct 2026). ZERO OldCarsData: live_listings (cron-filled) + the archive.
//   POST { q, filters? }                -> what was understood + every live match (first 10 enriched with
//                                          their own family's market line and seen-before), facets, US first.
//                                          /buy never asks: filters (from the words or the chips) narrow.
//   POST { action:"enrich", ids:[...] } -> market line + seen-before for more cards ("Show all").
//   POST { action:"panel", id } -> { market, representative } for a card's Market Check panel (same spec as its line).
//   POST { action:"watch", key, email } -> watch_requests (key = VIN, family:..., live:...)
//   GET  ?panel=1&make&model&trim&year&body(&lo&hi) -> { count, positions, rows[<=3] } for the One Box
//                                          (each row's `miles`: the Buy card's own miles, cardMiles, or null)
//                                          live panel. lo/hi (optional): Market Check's own headline
//                                          band (d.cluster); each row's `placing` and the `positions`
//                                          tally are computed ONCE in the engine (lib/live/search.js
//                                          liveForFamily, via lib/onebox.js placingFor) against the
//                                          SAME range shown on the page, over the full fenced match
//                                          set, not just the <=3 cards shown - this route renders only
//                                          what it returns, never a second placingFor call (job 3).
//   POST { action:"arm"|"disarm", listing_id } / { action:"alerts" } (signed in) -> Before it ends (lib/live/buyAlerts.js)
//   GET  ?alerts=run                    -> the Before it ends probe run (the probe key in the x-ops-key header only)
//   GET|POST ?alert=stop&t=<signed>     -> the message's stop link: GET shows a confirm page, only a POST acts
import { track, withTracking } from "../lib/track/log.js";
import { historyEnv, houseName, normVin } from "./_historyData.js";
import { isAbroadRow, parseQuery, parseQueryResolved, emptyFilters, gensNamed, resolveForBuy, searchLive, listingFacts, listingMarket, seenBefore, nounFor, liveForFamily, liveRows, familyMarket, COUNTRY_NAME, COLOURS } from "../lib/live/search.js";
import { placingFor, ENGINE_VERSION } from "../lib/onebox.js";
import { asideRowsFor, asideMatch, setAsideLabel } from "../lib/tasks/setAside.js";
import { findGeneration } from "../lib/generations.js";
import { converse } from "../lib/live/converse.js";
import { listingDetail, facetsOf, cardFlag, seenCount, listingSays, listingSamFacts, specOf, ladderSteps, walkLadder, panelOf } from "../lib/live/search.js";
import { vinAppearances } from "./_historyData.js";
import { applyRung, askedName, countText } from "../lib/live/rung.js";
// A card's market with the rung applied (lib/live/rung.js). On the sibling rung the Task door follows the car asked
// about, so its name is read from the listing's own resolved spec (the same specOf the card line uses); any other
// rung, or none, never reads anything more.
async function rungMarket(env, r, facts, m) {
  const a = applyRung(m);
  if (!a || a.rung !== "sibling") return a;
  const sp = await specOf(env, r, facts).catch(() => null);
  return applyRung(a, { asked: askedName(sp && sp.v) });
}
// A count that opens a sentence: "Three", "14", "3,715" (one to ten as words, 11 and up as digits).
const CountText = n => { const s = countText(n); return s.charAt(0).toUpperCase() + s.slice(1); };
import { validateBearer } from "../lib/_auth.js";
import { hasServerCredential, hasHeaderKey, keyInAddress, ADDRESS_KEY_REFUSED } from "../lib/_credential.js";
import { checkCeiling, testLimits, CALM, buyModelGuard, recordBuyModelTurn, noteBuySearch, BUY_MODEL_PAUSED } from "../lib/_ceilings.js";
import { isReleased, notReleasedJson } from "../lib/_launchStage.js";
import { logEvent, EVENTS } from "../lib/events.js";
import { readVisitorId } from "../lib/_visitor.js";
import { freshnessOn, underReserve, ocdWithRetry } from "../lib/live/ocdGuard.js";
import { callOldCarsData, configureOcdUsage, flushOcdUsage } from "../lib/_ocd.js";
import { mapLiveRecord, upsertLive } from "../lib/live/feed.js";
import { listingCoord } from "../lib/live/geo.js";
import { runTurn, runFilters, runSearch } from "../lib/live/samChat.js";
import { humanTitle } from "../lib/carTitle.js";
import { supabaseSelect, supabaseSelectAll } from "../lib/_supabase.js";
import { chatOut } from "../lib/live/chatHttp.js";
import { armAlert, cancelAlert, listAlerts, runAlerts, stopAll, verifyStop, verifyItem, stopOne, itemLabel, testSend, isMissingTable, alertsReady, useNamer } from "../lib/live/buyAlerts.js";

const FIRST = 10, MAX = 200;
// A live car's miles, as its Buy card shows them (liveTrust through listingFacts): stated miles, a US lot with no stated
// unit, or null when unknown or when the listing states kilometres (the card shows those as km). Never a guess.
export const cardMiles = facts => (facts && !facts.km && Number(facts.miles) > 0 ? Math.round(Number(facts.miles)) : null);
const titleCaseIfShouting = s => String(s || "").split(",").map(p => { const t = p.trim(); return t && t === t.toUpperCase() && /[A-Z]{3}/.test(t) ? t.toLowerCase().replace(/\b([a-z])/g, c => c.toUpperCase()) : t; }).filter(Boolean).join(", ");
// SPEC CHIPS (Sam, Oct 14 2026): gearbox, exterior over interior colour, title status and the VIN shortened, each only
// when the listing states it; a field the listing doesn't state is left out, never guessed.
const COLOUR_WORDS = new Set(Object.values(COLOURS).flat().concat(["gray", "tan", "cream", "ivory", "oxblood", "cinnamon", "saddle", "camel", "parchment", "stone", "biscuit", "magnolia", "natural"]));
const isColourPhrase = s => String(s || "").toLowerCase().split(/[\s-]+/).some(w => COLOUR_WORDS.has(w));
// A colour exactly as the listing words it, capitals kept ("Guards Red over Black"); only a leading article (a, an, the)
// is dropped, and "in" (the title's own "in Black over Tan"), so "A Black" reads "Black". The chip's first letter is a
// capital (Sam, Oct 14 2026).
const colourWords = s => String(s || "").trim().replace(/\s+/g, " ").replace(/^(?:(?:a|an|the|in)\s+)+/i, "");
const sentenceCase = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
// An interior ends at its last colour word: "sand beige full" (from "full leather") reads "sand beige", "black nappa" "black".
const toLastColour = s => { const w = String(s || "").split(" "); let i = w.length; while (i > 0 && !w[i - 1].toLowerCase().split("-").some(x => COLOUR_WORDS.has(x))) i--; return w.slice(0, i).join(" ") || null; };
const INTERIOR_NOUN = "(?:leather|leatherette|vinyl|cloth|upholstery|interior|alcantara|houndstooth|tartan|corduroy|velour|sport-?tex|suede|seats|trim)";
const OVER_DESC = new RegExp("\\b(?:finished|painted|refinished|presented|is shown|done|wears)\\s+in\\s+([a-z][a-z -]{1,30}?)\\s+over\\s+([a-z][a-z -]{1,30}?)\\s+" + INTERIOR_NOUN + "\\b", "i");
const OVER_TITLE = /\b([A-Za-z]+(?: [A-Za-z]+)?) over ([A-Za-z]+(?: [A-Za-z]+)?)\b/;
export function colourChip(r, facts) {
  const ext = facts && facts.colour ? colourWords(facts.colour) : null, extKey = ext && ext.toLowerCase();
  const m = OVER_TITLE.exec(String(r.listing_title || "")) || OVER_DESC.exec(String(r.description || ""));
  const paint = m && isColourPhrase(m[1]) ? colourWords(m[1]) : null, trim = m && isColourPhrase(m[2]) ? toLastColour(colourWords(m[2])) : null;
  // The paint as the listing words it when it is the same colour the card reads; the interior only as stated.
  const sameColour = paint && ext && paint.toLowerCase().split(/[\s-]+/).some(w => (COLOURS[extKey] || []).includes(w) || w === extKey);
  const outside = sameColour ? paint : (ext || paint);
  if (!outside) return null;   // no paint stated: no colour chip (an interior alone says too little)
  return sentenceCase(trim ? `${outside} over ${trim}` : outside);
}
const TITLE_RE = /\b(clean(?: and clear)?|salvage|rebuilt|branded|reconstructed|flood|lemon)\s+(?:[A-Z][a-z]+\s+){0,2}title\b/gi;
export function titleChip(r) {
  const t = String(r.description || "") + " . " + String(r.listing_title || "");
  let best = null;
  for (const m of t.matchAll(TITLE_RE)) {
    if (/\b(?:no|never|not|without|free of)\b[^.]{0,20}$/i.test(t.slice(Math.max(0, m.index - 24), m.index))) continue;
    const w = m[1].toLowerCase().startsWith("clean") ? "clean" : m[1].toLowerCase();
    if (!best || best === "clean") best = w;   // a branded title, when stated, is the one that shows
  }
  return best ? `${best.charAt(0).toUpperCase() + best.slice(1)} title` : null;
}
export function vinChip(r) { const v = String(r.vin_norm || "").toUpperCase(); return /^[A-HJ-NPR-Z0-9]{17}$/.test(v) ? `VIN ${v.slice(0, 6)}\u2026${v.slice(-4)}` : null; }
export function specChips(r, facts) { return [facts && facts.gearboxLabel, colourChip(r, facts || {}), titleChip(r), vinChip(r)].filter(Boolean); }
// THE SAM LINES (Sam, Oct 14 2026), built here once for every path that draws a card (a search, Show more, the panel):
// first the range line with the bid judged against that range ("The bid is below the range."), then the car's own sale
// history ("This exact car sold for $79,500 in June 2023."). No history: the range line only. The range is the card's
// own engine answer (listingMarket, the same call Market Check makes); the judgement is the engine's placingFor on the
// live bid in dollars, only for a live car with a real range of its own (never the sibling or count-only rung, never a
// range the engine says is not body-scoped).
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const usdText = n => "$" + Math.round(Number(n)).toLocaleString("en-US");
function whenFull(d, now) { const m = /^(\d{4})-(\d{2})/.exec(String(d || "")); if (!m) return ""; const y = +m[1], mo = +m[2] - 1, n = new Date(now), ago = (n.getUTCFullYear() - y) * 12 + (n.getUTCMonth() - mo); return MONTHS[mo] + (ago >= 0 && ago < 3 ? "" : " " + y); }
export function bidPlacing(c, now = Date.now()) {
  const m = c && c.market;
  if (!m || m.kind !== "range" || m.rung === "sibling" || m.rung === "not_enough_data" || m.bodyScoped === false) return null;
  if (c.bid_unknown || !(Number(c.current_bid_usd) > 0) || (c.end_time && Date.parse(c.end_time) <= now)) return null;
  return placingFor(Number(c.current_bid_usd), [Number(m.low), Number(m.high)]);
}
export function samLines(c, now = Date.now()) {
  if (!c || c.swap) return [];
  const out = [], m = c.market;
  if (m && m.kind !== "pending" && m.soldLine) {
    const pl = bidPlacing(c, now);
    out.push({ kind: "range", rung: m.rungLines || [], text: m.soldLine + (pl ? ` The bid is ${pl}.` : "") });
  }
  const t = (c.timeline || []).filter(a => a && a.date);
  const s0 = c.seen_before;
  const a = t.length ? t[t.length - 1] : (s0 && s0.date ? { date: s0.date, result: s0.result === "sold" ? "sold" : "not_sold", price: s0.priceUsd, url: null } : null);
  if (a && a.price) {
    const w = whenFull(a.date, now), what = a.result === "sold" ? `sold for ${usdText(a.price)}${w ? " in " + w : ""}` : `bid to ${usdText(a.price)}${w ? " in " + w : ""}`;
    out.push(a.result === "sold" ? { kind: "same", text: `This exact car ${what}.`, lead: "This exact car ", link: what, tail: ".", url: /^https?:\/\//.test(String(a.url || "")) ? a.url : null }
      : { kind: "same", text: `This exact car was ${what} and didn\u2019t sell.`, lead: "This exact car was ", link: what, tail: " and didn\u2019t sell.", url: /^https?:\/\//.test(String(a.url || "")) ? a.url : null });
  }
  return out;
}
export function cardOf(x) {
  const r = x.r, facts = x.facts, cc = String(r.country || "").toUpperCase();
  return { id: r.id, source: houseName(r.source), sourceSlug: r.source, title: r.listing_title, url: r.url, photo_url: r.photo_url, swap: !!x.swap,
    // Bids through liveTrust: a dollar figure only when it is dollars; a "USD" price on a lot priced
    // abroad, or a bid the feed reports without an amount, shows nothing (never "No bids yet").
    current_bid_usd: facts.priceUsd || null, current_bid: (facts.priceState === "usd" || facts.priceState === "converted") && r.current_bid != null ? Math.round(Number(r.current_bid)) : null, currency: r.currency || "USD",
    bid_unknown: facts.priceState === "suspect" || facts.priceState === "unconverted" || (!facts.priceUsd && Number(r.bid_count) > 0),
    // The bid's own time only (bid_at), never when we last read the row: the page shows a bid by it (lib/tasks/bidTime.js).
    bid_at: r.bid_at || null, end_time: r.end_time, year: r.year, make: r.make || null,
    miles: cardMiles(facts), km: facts.km || null, colour: facts.colour, colourSrc: facts.colourSrc || null, body: facts.body, gearbox: facts.gearboxLabel,
    location: titleCaseIfShouting(r.location) || null, country: cc || null, countryName: COUNTRY_NAME[cc] || cc || null, abroad: isAbroadRow(r),
    vin_norm: r.vin_norm || null, generation: x.gen ? x.gen.code : null, unknown: x.unknown, flag: cardFlag(r),
    reserve: r.has_reserve === true ? "reserve" : r.has_reserve === false ? "none" : null, says: listingSays(r), sam_facts: listingSamFacts(r, facts), chips: specChips(r, facts) };
}
// The car's own past appearances, oldest first, for the card's timeline: vin_index, falling back to the
// archive exactly as the Sam line's history does (vinAppearances), so the two never disagree. This
// live listing itself is never one of them (it is the "Now" dot).
// opts.asideWaitMs (Lane E's E4, Oct 16 2026): the most the set-aside labels may hold the card. asideRowsFor runs an
// engine read when this instance has no stored range for the spec; past the wait the timeline goes out with its sold rows
// marked set_aside_pending (no label yet, the read keeps running), and the page fetches that card again (action enrich,
// no wait) so the label is never silently missing. Labels only: no pool, fence or range depends on it.
export async function timelineOf(env, x, opts = {}) {
  const vin = x.r.vin_norm; if (!vin || String(vin).length < 6) return null;
  const data = await vinAppearances(env, vin).catch(() => null);
  if (!data || !data.ok) return null;
  const today = new Date().toISOString().slice(0, 10), norm = u => String(u || "").replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "");
  const list = data.appearances.filter(a => a.date && a.date < today && norm(a.url) !== norm(x.r.url))
    .map(a => ({ date: a.date, house: a.house, result: a.kind === "sale" ? "sold" : (/withdraw/i.test(String(a.status || a.result || "")) ? "withdrawn" : "not_sold"), price: a.kind === "sale" ? (a.priceUsd || null) : (a.bidUsd || null), url: /^https?:\/\//.test(String(a.url || "")) ? String(a.url) : null, miles: a.mileage || null, photo: a.image || null }))
    .sort((a, b) => a.date.localeCompare(b.date));
  // A past sale the engine set aside for this car's own market carries the engine's reason as its label ("Set aside
  // as modified"); nothing here judges a sale against the range (Sam, Oct 15 2026).
  if (list.some(a => a.result === "sold")) {
    const wait = Number(opts.asideWaitMs), LATE = Symbol("late");
    const read = asideRowsFor(env, x.r, x.facts || {}).catch(() => null);
    const rows = Number.isFinite(wait) ? await Promise.race([read, new Promise(r => setTimeout(() => r(LATE), wait))]) : await read;
    if (rows === LATE) { for (const a of list) if (a.result === "sold") a.set_aside_pending = true; return list; }
    for (const a of list) { const hit = a.result === "sold" ? asideMatch(rows, { url: a.url, vin: vin, date: a.date, price: a.price }) : null; if (hit) { a.set_aside = String(hit.reason || ""); a.set_aside_label = setAsideLabel(hit.reason); } }
  }
  return list;
}
// The card's name from the resolved spec: year, make, model, trim, body. Never the seller's copy
// ("With Less Than 73k Miles", "Restored", "No Reserve"); null when the title doesn't resolve.
const BODY_WORD = { coupe: "Coupe", cabriolet: "Cabriolet", convertible: "Convertible", targa: "Targa", roadster: "Roadster", sedan: "Sedan", spider: "Spider", spyder: "Spyder", speedster: "Speedster", wagon: "Wagon", suv: "", hatchback: "Hatchback" };
export async function nameOf(env, x) {
  const sp = await specOf(env, x.r, x.facts).catch(() => null);
  const v = sp && sp.v; if (!v || !v.make || !v.model) return null;
  // The body only as the card's market reads it (the resolver's word from the listing's own title, specOf), never the
  // feed's body field: a feed "coupe" named a 330 GT 2+2 "1965 Ferrari 330 GT2 Coupe" while its market read every 330
  // GT2, so typing the card's own name into Market Check gave a different range (Oct 15 2026, B2's golden run).
  const body = BODY_WORD[String(v.bodyStyle || "").toLowerCase()] || "";
  const parts = [x.r.year || v.year, v.make, v.model, v.trim, body].filter(Boolean).map(String);
  // A part already said in full is not repeated, compared by whole words: the trim "S" is not inside
  // "Porsche" (a letter-inside-a-word test dropped it, so a Boxster S read as a Boxster).
  const out = [], said = () => new Set(out.join(" ").toLowerCase().split(/[\s-]+/));
  for (const w of parts) { const have = said(); if (!w.toLowerCase().split(/[\s-]+/).every(t => have.has(t))) out.push(w); }
  // The case a person would write it (lib/carTitle.js, shared): "X3 xDrive35i M Sport", never "XDRIVE35I".
  return humanTitle(out.join(" "));
}
useNamer(nameOf);   // Before it ends names a car the way its card does
async function enrich(env, x) {
  let [market, seen, timeline] = await Promise.all([x.market !== undefined ? x.market : listingMarket(env, x.r, x.facts), seenBefore(env, x.r.vin_norm), timelineOf(env, x)]);
  if (market && market.kind === "pending") market = await listingMarket(env, x.r, x.facts);   // one more go, warm now
  market = await rungMarket(env, x.r, x.facts, market);   // the engine's fallback rung, when it names one; else unchanged
  const c = { ...cardOf(x), market, seen_before: seen, timeline, history_url: timeline && timeline.length ? "/vin/" + encodeURIComponent(x.r.vin_norm) : null, name: await nameOf(env, x) };
  return { ...c, sam_lines: samLines(c) };
}
async function enrichFast(env, x) {
  const [market, seen, timeline, name] = await Promise.all([x.market !== undefined ? x.market : listingMarket(env, x.r, x.facts, { noBlock: true }), seenBefore(env, x.r.vin_norm), timelineOf(env, x, { asideWaitMs: 1500 }), nameOf(env, x)]);
  const c = { ...cardOf(x), market: await rungMarket(env, x.r, x.facts, market), seen_before: seen, timeline, history_url: timeline && timeline.length ? "/vin/" + encodeURIComponent(x.r.vin_norm) : null, name };
  return { ...c, sam_lines: samLines(c) };
}
async function logSearch(env, v, anonId) {
  try {
    const r = await fetch(`${env.supabaseUrl}/rest/v1/search_events`, {
      method: "POST", headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ surface: "buy", user_id: null, anon_id: anonId || null, make: v ? v.make || null : null, model: v ? v.model || null : null, year: v && Number(v.year) ? Number(v.year) : null })
    });
    if (!r.ok) console.error("buy search_events log failed", r.status, (await r.text().catch(() => "")).slice(0, 160));
  } catch (e) { console.error("buy search_events log threw", e && e.message); }
}
// Client chip state, sanitised to the known filter shape.
function cleanFilters(raw) {
  const f = emptyFilters(); if (!raw || typeof raw !== "object") return null;
  const arr = (k, re) => Array.isArray(raw[k]) ? raw[k].map(String).filter(s => re.test(s)).slice(0, 12) : [];
  f.bodies = arr("bodies", /^[a-z ]{3,20}$/); f.colours = arr("colours", /^[a-z]{3,10}$/); f.notColours = arr("notColours", /^[a-z]{3,10}$/);
  f.countries = arr("countries", /^[A-Z]{2}$/); f.houses = arr("houses", /^[a-z]{2,24}$/); f.gens = arr("gens", /^[A-Za-z0-9.]{1,8}$/);
  f.kind = typeof raw.kind === "string" && /^[A-Za-z0-9 .\-]{1,30}$/.test(raw.kind) ? raw.kind : null;
  f.gearbox = raw.gearbox === "manual" || raw.gearbox === "auto" ? raw.gearbox : null; f.gearboxLabel = typeof raw.gearboxLabel === "string" ? raw.gearboxLabel.slice(0, 20) : null;
  for (const k of ["miMax", "miMin", "priceMax", "priceMin", "yearMin", "yearMax"]) f[k] = Number(raw[k]) > 0 ? Number(raw[k]) : null;
  return f;
}

async function handler(req, res) {
  const env = historyEnv();
  if (!env) return res.status(500).json({ status: "error" });
  res.setHeader("Cache-Control", "no-store");
  // Search results are private and endless: no result response is ever indexable (the landing /buy is).
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  try {
    const q0 = req.query || {};
    // BEFORE IT ENDS: the stop link in the message (and the one-click unsubscribe). A GET or HEAD only shows
    // the confirm page (mail scanners open every link); the page's button, or the mail provider's one-click
    // POST, is the only thing that acts. Private and noindex.
    if (q0.alert === "stop" || q0.stop === "1") {   // ?stop=1 since Oct 2026; ?alert=stop kept for links already sent
      res.setHeader("Content-Type", "text/html; charset=utf-8"); res.setHeader("Cache-Control", "private, no-store");
      const page = (status, body) => { const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>Stop these messages? | GoAskSam</title><style>${STOP_CSS}</style></head><body><main><p class="brand">GoAskSam</p>${body}</main></body></html>`; return req.method === "HEAD" ? res.status(status).end() : res.status(status).send(html); };
      const uid = verifyStop(q0.t);
      if (!uid) return page(400, `<h1>That link has expired.</h1><p><a href="/buy">Back to Buy</a></p>`);
      // A message's own link also names its one watch or notice (signed; lib/live/buyAlerts.js stopLink):
      // the page offers "Stop this one" beside "Stop everything". The mail client's one-click POST goes to
      // the header link, which names no item, so it always stops everything (as List-Unsubscribe requires).
      const item = q0.i ? verifyItem(uid, q0.i) : null;
      const lab = item ? await itemLabel(env, uid, item) : null;
      const base = `/api/buySearch?stop=1&t=${encodeURIComponent(String(q0.t))}${item ? `&i=${encodeURIComponent(String(q0.i))}` : ""}`;
      const esc2 = s => String(s).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
      if (req.method !== "POST") {
        // From an email: only the one notice it belongs to (only=1); stopping everything is on the Tasks page.
        if (lab && q0.only === "1") return page(200, `<h1>Stop ${esc2(lab.text)}?</h1><p>This stops ${esc2(lab.text)} only. Everything else keeps running.</p><form method="post" action="${base}&scope=one"><button type="submit">Stop this one</button></form><p class="quiet"><a href="/tasks/mine">Open your tasks instead</a></p>`);
        if (lab) return page(200, `<h1>Stop these messages?</h1><p>Stop ${esc2(lab.text)}, or stop everything GoAskSam sends about the cars you picked: the before-it-ends notices and every task email.</p><div class="two"><form method="post" action="${base}&scope=one"><button type="submit">Stop this one</button></form><form method="post" action="${base}&scope=all"><button type="submit" class="alt">Stop everything</button></form></div><p class="quiet"><a href="/buy">Back to Buy instead</a></p>`);
        return page(200, `<h1>Stop these messages?</h1><p>This stops every message GoAskSam sends about the cars you picked: the before-it-ends notices and every task email. You can turn them on again from any car.</p><form method="post" action="${base}&scope=all"><button type="submit">Stop everything</button></form><p class="quiet"><a href="/buy">Back to Buy instead</a></p>`);
      }
      if (item && q0.scope === "one") {
        await stopOne(env, uid, item).catch(e => console.error("buy stop one:", e.message));
        return page(200, `<h1>Stopped.</h1><p>GoAskSam won't send any more messages from ${esc2(lab ? lab.text : "that one")}. Everything else stays on.</p><p class="quiet"><a href="/buy">Back to Buy</a></p>`);
      }
      await stopAll(env, uid).catch(e => console.error("buy alert stop:", e.message));
      return page(200, `<h1>Stopped.</h1><p>GoAskSam won't send any more messages about the cars you picked.</p><p class="quiet"><a href="/buy">Back to Buy</a></p>`);
    }
    if (req.method === "GET" && q0.alerts === "run") {
      // No Vercel cron calls this (the send is /api/tasks?send=1): the probe key in a header only (lib/_credential.js);
      // a key in the address is refused.
      if (keyInAddress(req)) return res.status(400).json(ADDRESS_KEY_REFUSED);
      if (!hasHeaderKey(req)) return res.status(401).json({ error: "Unauthorized." });
      try { return res.status(200).json(await runAlerts(env, { freshBid })); }
      catch (e) { if (isMissingTable(e)) return res.status(200).json({ checked: 0, sent: 0, setup: "run docs/supabase-buy-alerts.sql" }); throw e; }
    }
    if (req.method === "GET" && req.query && req.query.panel) {
      // This GET branch is Market Check's own "LIVE RIGHT NOW" panel, not Buy's search (Buy's POST
      // actions below are gated separately, by Buy's own stage) - gate it by Market Check's stage.
      if (!isReleased("market-check", req)) return notReleasedJson(res);
      const q = req.query;
      const vehicle = { make: String(q.make || ""), model: String(q.model || ""), trim: q.trim ? String(q.trim) : null, year: Number(q.year) || null, bodyStyle: q.body ? String(q.body) : null };
      if (!vehicle.make || !vehicle.model) return res.status(200).json({ count: 0, rows: [] });
      const generation = await findGeneration(vehicle, env);
      // Item 5: a band only when the caller passed one (Market Check's own headline cluster) - never
      // guessed here. A row with no usable USD figure gets no position either (placingFor is null-safe).
      const lo = Number(q.lo), hi = Number(q.hi);
      const band = Number.isFinite(lo) && Number.isFinite(hi) ? [lo, hi] : null;
      // position/positions (job 3): computed once in the engine (lib/live/search.js liveForFamily),
      // over the SAME fenced live-match set the count itself reports - this route only renders what
      // it returns, never a second placingFor call of its own.
      const live = await liveForFamily(env, vehicle, generation, null, 3, band);
      res.setHeader("Cache-Control", "public, s-maxage=300");
      // source_slug + id (Round 6 Job 1, tracking fix): the panel only ever sent the display name
      // (source, via houseName) and no row identifier at all - Lane A's auction_clickout needs the
      // real platform slug, never the display name, and a listing id for which car was clicked.
      // Both are already on the row; this just carries them through, nothing computed.
      return res.status(200).json({ count: live.total, positions: live.positions, rows: live.rows.map(r => ({ id: r.id, source: houseName(r.source), source_slug: r.source || null, title: r.listing_title, url: r.url, photo_url: r.photo_url || null, current_bid_usd: r.current_bid_usd != null ? Math.round(Number(r.current_bid_usd)) : null, current_bid: r.current_bid, currency: r.currency, end_time: r.end_time, bid_at: r.bid_at || r.last_seen || null, placing: r.position, miles: cardMiles(listingFacts(r)) })) });
    }
    if (req.method !== "POST") return res.status(405).json({ status: "error" });
    // Everything from here down is Buy's own endpoint (search, chat, saved searches, alerts) - gated
    // by Buy's own stage. The stop-all-alerts tap and the alerts cron above are handled before this
    // point and never reach here.
    if (!isReleased("buy", req)) return notReleasedJson(res);
    const b = req.body || {};
    if (b.action === "watch") {
      const raw = String(b.key || "").trim();
      const key = /^(family|live):/i.test(raw) ? raw.toLowerCase().replace(/[^a-z0-9:._-]/g, "").slice(0, 120) : normVin(raw);
      const email = String(b.email || "").trim().toLowerCase().slice(0, 200);
      if (!key || key.length < 5 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return res.status(400).json({ ok: false });
      const r = await fetch(`${env.supabaseUrl}/rest/v1/watch_requests?on_conflict=vin_norm,email`, {
        method: "POST", headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates,return=minimal" },
        body: JSON.stringify([{ vin_norm: key, email }])
      });
      return res.status(r.ok ? 200 : 500).json({ ok: r.ok });
    }
    if (b.action === "enrich") {
      const ids = (Array.isArray(b.ids) ? b.ids : []).map(Number).filter(Number.isFinite).slice(0, 60);
      if (!ids.length) return res.status(200).json({ cards: [] });
      const rows = await liveRows(env, `id=in.(${ids.join(",")})`);
      const cards = await Promise.all(rows.map(r => { const facts = listingFacts(r); return Promise.all([listingMarket(env, r, facts), seenBefore(env, r.vin_norm), timelineOf(env, { r })]).then(async ([market, seen, timeline]) => { if (market && market.kind === "pending") market = await listingMarket(env, r, facts); const c = { ...cardOf({ r, facts, gen: null, unknown: [] }), market: await rungMarket(env, r, facts, market), seen_before: seen, timeline }; return { id: r.id, market: c.market, seen_before: seen, timeline, sam_lines: samLines(c) }; }); }));
      // engineVersion: the engine this deploy reads, so a check can tie each card to the engine read it compares with.
      return res.status(200).json({ cards, engineVersion: ENGINE_VERSION });
    }
    // The Market Check panel under a card: the card's own spec key and engine answer (lib/live/search.js panelOf).
    if (b.action === "panel") {
      const id = Number(b.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false });
      const rows = await liveRows(env, `id=eq.${id}`);
      const r = rows && rows[0]; if (!r) return res.status(200).json({ market: null, representative: null });
      const p = (await panelOf(env, r, listingFacts(r))) || { market: null, representative: null };
      // The rung (lib/live/rung.js): a not_enough_data answer is count-only, so its three priced sales are not shown.
      const pm = await rungMarket(env, r, listingFacts(r), p.market);
      // The card's two Sam lines from this same answer, so the card and its panel never disagree on screen.
      const [seen, timeline] = await Promise.all([seenBefore(env, r.vin_norm), timelineOf(env, { r })]);
      const sl = samLines({ ...cardOf({ r, facts: listingFacts(r), gen: null, unknown: [] }), market: pm, seen_before: seen, timeline });
      return res.status(200).json({ ...p, market: pm, representative: pm && pm.rung === "not_enough_data" ? null : p.representative, sam_lines: sl });
    }
    // Probe (PROBE_KEY): live listings for the card tests (repeat VINs, no photo, no reserve, long titles).
    // Probe: the landing's example pick (chips, example, and what each candidate search returned).
    if (b.action === "landing" && process.env.PROBE_KEY && b.key === process.env.PROBE_KEY) {
      const { exampleBand } = await import("../lib/live/buyExample.js");
      return res.status(200).json(await exampleBand(env, 60000, { fresh: !!b.fresh }));
    }
    // LIVE AUDIT (Lane C, Oct 15 2026; read-only, our own credential in the header only): every live listing's id, title
    // and the make, model and year it is filed under, for the check that every live car draws a card with a market.
    if (b.action === "liveaudit" && hasServerCredential(req)) {
      const rows = (await liveRows(env, "id=gt.0")) || [];
      return res.status(200).json({ live: rows.length, rows: rows.map(r => ({ id: r.id, title: r.listing_title, make: r.make || null, model: r.model || null, year: r.year || null, abroad: isAbroadRow(r), source: r.source || null })) });
    }
    if (b.action === "finds" && process.env.PROBE_KEY && b.key === process.env.PROBE_KEY) {
      const rows = (await liveRows(env, "id=gt.0")) || [];
      const us = rows.filter(r => !isAbroadRow(r));
      const vins = [...new Set(us.map(r => r.vin_norm).filter(v => v && String(v).length >= 11))];
      const reps = [];
      for (let i = 0; i < vins.length; i += 80) {
        const part = vins.slice(i, i + 80);
        const vs = await supabaseSelect(env, `vin_summary?vin_norm=in.(${part.map(encodeURIComponent).join(",")})&appearances=gte.2&select=vin_norm,appearances`).catch(() => null);
        for (const v of vs || []) reps.push(v);
      }
      const byVin = Object.fromEntries(reps.map(v => [v.vin_norm, v.appearances]));
      const pick = r => ({ id: r.id, title: r.listing_title, house: r.source, location: r.location, ends: r.end_time });
      const all = await supabaseSelectAll(env, "live_listings?status=eq.live&select=id,photo_url,has_reserve&order=id.asc").catch(() => null);
      return res.status(200).json({ live: rows.length, liveTotal: all ? all.length : null, noPhotoTotal: all ? all.filter(r => !r.photo_url).length : null, noPhotoIds: all ? all.filter(r => !r.photo_url).slice(0, 10).map(r => r.id) : null,
        repeats: us.filter(r => byVin[r.vin_norm]).map(r => ({ ...pick(r), appearances: byVin[r.vin_norm] })).sort((a, b) => b.appearances - a.appearances).slice(0, 15),
        nophoto: us.filter(r => !r.photo_url).slice(0, 10).map(pick),
        noreserve: us.filter(r => r.has_reserve === false).slice(0, 10).map(pick),
        longest: us.slice().sort((a, b) => String(b.listing_title || "").length - String(a.listing_title || "").length).slice(0, 8).map(pick) });
    }
    // Probe (PROBE_KEY, header only): real traffic for choosing the invisible ceilings and for the cache
    // question. Read-only: per address (sell searches, chat, Buy chat; app_usage_events ip_address) and per
    // browser (Buy searches; search_events anon_id), the busiest hour and day, with percentiles; and the last
    // 7 days of sell searches by cache status, tier and metered calls.
    // Probe (PROBE_KEY, header only; read only, aggregates only, never a key, address or user): measured use of
    // the Sell chat and of Tasks setup and research, for setting their limits. Per device and per address from
    // the ceilings ledger (ip_rate_hits, crew never recorded), per minute, hour and day; the Sell chat's model
    // calls and cost from app_usage_events; Tasks per account per day from tasks and task_updates.
    const BOTUA = /HeadlessChrome|node|undici|curl|python|axios|Go-http|okhttp|bot|spider|crawl|vercel/i;
    // Probe (PROBE_KEY, header only; read only): the email's middle-half line next to the engine range it is built from,
    // for live listings of one make and model, with the Market Check question for the same car (m.query), so a check
    // can open Market Check for it and compare.
    if (b.action === "rangeproof" && process.env.PROBE_KEY && req.headers["x-probe-key"] === process.env.PROBE_KEY) {
      const { liveRows, listingMarket, listingFacts } = await import("../lib/live/search.js");
      const { middleHalfLine } = await import("../lib/live/buyAlerts.js");
      const mk = String(b.make || "Porsche").replace(/[^A-Za-z0-9 -]/g, ""), md = String(b.model || "911").replace(/[^A-Za-z0-9 -]/g, "");
      const rows = ((await liveRows(env, `make=ilike.${encodeURIComponent(mk)}&model=ilike.${encodeURIComponent(md)}`)) || []).slice(0, Math.min(40, Number(b.scan) || 20));
      const out = [];
      for (const r of rows) {
        const m = await listingMarket(env, r, listingFacts(r)).catch(() => null);
        if (!m || m.kind === "pending") continue;
        out.push({ id: r.id, title: r.listing_title, kind: m.kind, low: m.low, high: m.high, count: m.count, family: m.family, window: m.window, query: m.query, cardLine: m.soldLine, emailLine: middleHalfLine(m) });
        if (out.filter(x => x.kind === "range").length >= (Number(b.want) || 4)) break;
      }
      return res.status(200).json({ rows: out });
    }
    if (b.action === "limits" && process.env.PROBE_KEY && req.headers["x-probe-key"] === process.env.PROBE_KEY) {
      const days = Math.min(60, Number(b.days) || 30), since = new Date(Date.now() - days * 864e5).toISOString();
      const pct = (arr, q) => { if (!arr.length) return null; const s2 = arr.slice().sort((x, y) => x - y); return s2[Math.min(s2.length - 1, Math.floor(q * (s2.length - 1)))]; };
      const spread = (rows, keyOf, cut) => { const m = {}; for (const r of rows) { const k = keyOf(r); if (!k) continue; const kk = k + "|" + String(r.created_at).slice(0, cut); m[kk] = (m[kk] || 0) + 1; } const v = Object.values(m); return { buckets: v.length, p50: pct(v, 0.5), p90: pct(v, 0.9), p99: pct(v, 0.99), max: pct(v, 1), top: v.sort((x, y) => y - x).slice(0, 5) }; };
      const three = (rows, keyOf) => ({ keys: new Set(rows.map(keyOf).filter(Boolean)).size, perMinute: spread(rows, keyOf, 16), perHour: spread(rows, keyOf, 13), perDay: spread(rows, keyOf, 10) });
      const hits = (await supabaseSelectAll(env, `ip_rate_hits?kind=in.(c:sell_assist,c:sell_chat,a:sell_followup)&created_at=gte.${since}&select=ip,kind,created_at&order=id.asc`).catch(() => null)) || [];
      const dev = r => String(r.ip).startsWith("dev:") ? r.ip : null, adr = r => String(r.ip).startsWith("ip:") ? r.ip : null, acct = r => String(r.ip).startsWith("user:") ? r.ip : null;
      const sellAll = hits.filter(h => h.kind !== "a:sell_followup");
      const chat = (await supabaseSelectAll(env, `app_usage_events?event_type=in.(chat,sell_chat_turn,sell_followup_turn)&created_at=gte.${since}&select=created_at,event_type,status,anthropic_cost_usd,anthropic_input_tokens,metadata&order=id.asc`).catch(() => null)) || [];
      const paid = chat.filter(r => Number(r.anthropic_cost_usd) > 0), ipOf = r => (r.metadata && (r.metadata.ip_hash || r.metadata.ip_address)) ? "ip:" + (r.metadata.ip_hash || r.metadata.ip_address) : null;
      const costs = paid.map(r => Number(r.anthropic_cost_usd));
      const tasks = (await supabaseSelectAll(env, `tasks?created_at=gte.${since}&select=id,user_id,kind,created_at&order=created_at.asc`).catch(() => null)) || [];
      const owner = new Map(tasks.map(t => [t.id, t.user_id]));
      const msgs = (await supabaseSelectAll(env, `task_updates?role=eq.buyer&kind=eq.message&created_at=gte.${since}&select=task_id,created_at&order=id.asc`).catch(() => null)) || [];
      const tm = (await supabaseSelectAll(env, `app_usage_events?event_type=in.(tasks_model_turn,tasks_model_paused)&created_at=gte.${since}&select=created_at,event_type,anthropic_cost_usd,anthropic_input_tokens,anthropic_output_tokens,metadata&order=id.asc`).catch(() => null)) || [];
      // Buy chat per address (the request ceiling's ledger rows carry the address) and per device (model turns).
      const bc = (await supabaseSelectAll(env, `ip_rate_hits?kind=in.(c:buy_chat,m:buy_chat)&created_at=gte.${since}&select=ip,kind,created_at&order=id.asc`).catch(() => null)) || [];
      // Sign-ups: accounts created per day, and sign-ins completed per visitor per day (no address is stored).
      const accts = (await supabaseSelectAll(env, `accounts?created_at=gte.${since}&select=created_at&order=created_at.asc`).catch(() => null)) || [];
      const sic = (await supabaseSelectAll(env, `funnel_events?event=eq.sign_in_completed&created_at=gte.${since}&select=created_at,visitor_id&order=id.asc`).catch(() => null)) || [];
      const perDayCount = rows => rows.reduce((o, r) => { const d = String(r.created_at).slice(0, 10); o[d] = (o[d] || 0) + 1; return o; }, {});
      // Where addresses sit (Job 3, Oct 2026): counts and ages only, never an address. The old Supabase hook's rows
      // (kind "signup", raw address) and the ceilings' address keys; app_usage_events rows carrying an address.
      const H = { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, Prefer: "count=exact", "Range-Unit": "items", Range: "0-0" };
      const cnt = async q => { const r = await fetch(`${env.supabaseUrl}/rest/v1/${q}`, { headers: H }).catch(() => null); return r ? Number((/\/(\d+)$/.exec(r.headers.get("content-range") || "") || [])[1]) : null; };
      const oldest = async q => { const r = await fetch(`${env.supabaseUrl}/rest/v1/${q}&select=created_at&order=created_at.asc&limit=1`, { headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}` } }).catch(() => null); const j = r && r.ok ? await r.json() : []; return j[0] ? j[0].created_at : null; };
      const hookRows = (await supabaseSelectAll(env, `ip_rate_hits?kind=eq.signup&select=ip,created_at&order=id.asc`).catch(() => null)) || [];
      const addressStore = {
        ipRateHits: { rows: await cnt("ip_rate_hits?select=id"), oldest: await oldest("ip_rate_hits?id=gt.0"), rawAddressKeys: await cnt("ip_rate_hits?ip=like.ip:*&select=id"), cookielessDeviceKeys: await cnt("ip_rate_hits?ip=like.dev:h*&select=id"), oldHookSignupRows: hookRows.length, oldHookOldest: hookRows[0] ? hookRows[0].created_at : null },
        oldHookPerAddress: three(hookRows, r => r.ip),
        usageEventsWithAddress: { ipAddress: await cnt("app_usage_events?metadata->>ip_address=not.is.null&select=id"), oldest: await oldest("app_usage_events?metadata->>ip_address=not.is.null"), ipHint: await cnt("app_usage_events?metadata->>ip_hint=not.is.null&select=id") }
      };
      return res.status(200).json({ days, addressStore,
        buyChat: { requestsPerAddress: three(bc.filter(r => r.kind === "c:buy_chat"), adr), requestsPerDevice: three(bc.filter(r => r.kind === "c:buy_chat"), dev), modelTurnsPerDevice: three(bc.filter(r => r.kind === "m:buy_chat"), dev) },
        signups: { accountsCreated: accts.length, accountsPerDay: perDayCount(accts), signInsCompleted: sic.length, signInsPerVisitor: three(sic, r => r.visitor_id || null) },
        sellChat: { ledgerRows: hits.length, byKind: hits.reduce((o, h) => (o[h.kind] = (o[h.kind] || 0) + 1, o), {}), perDevice: three(sellAll, dev), perAddress: three(sellAll, adr), followupPerAccount: three(hits.filter(h => h.kind === "a:sell_followup"), acct),
          modelRows: chat.length, byEvent: chat.reduce((o, r) => (o[r.event_type + ":" + r.status] = (o[r.event_type + ":" + r.status] || 0) + 1, o), {}), paidCalls: paid.length, narrationCacheHits: chat.filter(r => r.metadata && r.metadata.narrationCache === "hit").length,
          costUsd: { total: Math.round(costs.reduce((a, c) => a + c, 0) * 100) / 100, perCallP50: pct(costs, 0.5), perCallP90: pct(costs, 0.9), max: pct(costs, 1) }, paidPerAddress: three(paid, ipOf),
          // Real browsers apart from automated callers (our smoke tests, headless checks, scripts), by user agent.
          browserPerAddress: three(chat.filter(r => !BOTUA.test(String((r.metadata && r.metadata.user_agent) || ""))), ipOf), automatedRows: chat.filter(r => BOTUA.test(String((r.metadata && r.metadata.user_agent) || ""))).length,
          browserPerAddressDevice: three(chat.filter(r => !BOTUA.test(String((r.metadata && r.metadata.user_agent) || ""))), r => ipOf(r) && ipOf(r) + "|" + String((r.metadata && r.metadata.user_agent) || "")) },
        tasks: { created: tasks.length, byKind: tasks.reduce((o, t) => (o[t.kind] = (o[t.kind] || 0) + 1, o), {}), accounts: new Set(tasks.map(t => t.user_id)).size,
          setupMessagesPerAccount: three(msgs.map(m => ({ ...m, u: owner.get(m.task_id) || null })), r => r.u), researchPerAccount: three(tasks.filter(t => t.kind === "research"), r => r.user_id), tasksPerAccount: three(tasks, r => r.user_id),
          modelTurns: { rows: tm.length, byKind: tm.reduce((o, r) => { const k = r.event_type + ":" + ((r.metadata && r.metadata.kind) || "?"); o[k] = (o[k] || 0) + 1; return o; }, {}), costUsd: Math.round(tm.reduce((a, r) => a + (Number(r.anthropic_cost_usd) || 0), 0) * 1000) / 1000,
            cache: tm.filter(r => r.event_type === "tasks_model_turn").map(r => ({ at: r.created_at, kind: r.metadata && r.metadata.kind, calls: r.metadata && r.metadata.calls, read: r.metadata && r.metadata.cache_read, write: r.metadata && r.metadata.cache_write, input: r.anthropic_input_tokens, output: r.anthropic_output_tokens, usd: r.anthropic_cost_usd })).slice(-20) } } });
    }
    if (b.action === "traffic" && process.env.PROBE_KEY && req.headers["x-probe-key"] === process.env.PROBE_KEY) {
      const days = Math.min(60, Number(b.days) || 30), since = new Date(Date.now() - days * 864e5).toISOString(), since7 = new Date(Date.now() - 7 * 864e5).toISOString();
      const pct = (arr, q) => { if (!arr.length) return null; const s = arr.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))]; };
      const dist = (rows, keyOf) => {
        const hour = {}, day = {};
        for (const r of rows) { const k = keyOf(r); if (!k) continue; const t = String(r.created_at); hour[k + "|" + t.slice(0, 13)] = (hour[k + "|" + t.slice(0, 13)] || 0) + 1; day[k + "|" + t.slice(0, 10)] = (day[k + "|" + t.slice(0, 10)] || 0) + 1; }
        const hv = Object.values(hour), dv = Object.values(day);
        const topDay = Object.entries(day).sort((x, y) => y[1] - x[1]).slice(0, 8).map(([k, n]) => ({ key: k.replace(/^[^|]+/, m => m.length > 6 ? m.slice(0, 4) + "…" : m), n }));
        return { rows: rows.length, keys: new Set(rows.map(keyOf).filter(Boolean)).size, perHour: { p50: pct(hv, 0.5), p90: pct(hv, 0.9), p99: pct(hv, 0.99), max: pct(hv, 1) }, perDay: { p50: pct(dv, 0.5), p90: pct(dv, 0.9), p99: pct(dv, 0.99), max: pct(dv, 1) }, busiestDays: topDay };
      };
      const ev = t => supabaseSelectAll(env, `app_usage_events?event_type=eq.${t}&created_at=gte.${since}&select=created_at,status,metadata,oldcarsdata_metered_requests&order=created_at.asc`).catch(() => []);
      const [sd, chat, bchat, se] = await Promise.all([ev("seller_decision"), ev("chat"), ev("buy_chat_turn"), supabaseSelectAll(env, `search_events?surface=eq.buy&created_at=gte.${since}&select=created_at,anon_id,user_id&order=created_at.asc`).catch(() => [])]);
      const ipOf = r => (r.metadata && (r.metadata.ip_hash || r.metadata.ip_address)) || null;
      const recent = (sd || []).filter(r => r.created_at >= since7);
      const by = (rows, f) => rows.reduce((o, r) => { const k = f(r) || "none"; o[k] = (o[k] || 0) + 1; return o; }, {});
      const sum = rows => rows.reduce((n, r) => n + (Number(r.oldcarsdata_metered_requests) || 0), 0);
      // Buy's model use against completed searches (the chat path logs one funnel search per new car; the
      // no-model paths log search_events), and devices by distinct make|model searched within one hour.
      const [fs, turnsRows] = await Promise.all([
        supabaseSelectAll(env, `funnel_events?event=eq.search&tool=eq.buy&created_at=gte.${since}&select=created_at,visitor_id,props&order=created_at.asc`).catch(() => []),
        supabaseSelectAll(env, `app_usage_events?event_type=eq.buy_chat_turn&created_at=gte.${since}&select=created_at,anthropic_cost_usd,metadata&order=created_at.asc`).catch(() => [])]);
      const perHour = {}; for (const r of fs || []) { const k = (r.visitor_id || "none") + "|" + String(r.created_at).slice(0, 13); (perHour[k] = perHour[k] || new Set()).add(String((r.props && r.props.key) || "")); }
      const hv = Object.values(perHour).map(x => x.size);
      const cost = (turnsRows || []).reduce((n, r) => n + (Number(r.anthropic_cost_usd) || 0), 0);
      const buyModel = { turns: (turnsRows || []).length, chatSearches: (fs || []).length, fallbackSearches: (se || []).length, costUsd: Math.round(cost * 100) / 100,
        turnsPerChatSearch: fs && fs.length ? Math.round(100 * turnsRows.length / fs.length) / 100 : null,
        callsPerTurnLogged: (turnsRows || []).filter(r => r.metadata && r.metadata.calls).map(r => r.metadata.calls),
        // Turn 1 of a conversation is its first search; later turns are follow-ups (chat or a refinement).
        byTurnNumber: (turnsRows || []).reduce((o, r) => { const t = Number(r.metadata && r.metadata.turn) || 0; const k = t >= 5 ? "5+" : String(t); o[k] = (o[k] || 0) + 1; return o; }, {}),
        firstChatSearchAt: fs && fs.length ? fs[0].created_at : null, turnsSinceFirstChatSearch: fs && fs.length ? (turnsRows || []).filter(r => r.created_at >= fs[0].created_at).length : null,
        distinctCarsPerDeviceHour: { deviceHours: hv.length, p50: pct(hv, 0.5), p90: pct(hv, 0.9), p99: pct(hv, 0.99), max: pct(hv, 1), over10: hv.filter(n => n > 10).length, over30: hv.filter(n => n > 30).length } };
      return res.status(200).json({ days, buyModel,
        sellSearchesPerAddress: dist(sd || [], ipOf), chatPerAddress: dist(chat || [], ipOf), buyChatPerAddress: dist(bchat || [], ipOf),
        buySearchesPerBrowser: dist(se || [], r => r.anon_id || (r.user_id ? "u" + r.user_id : null)),
        sell7d: { searches: recent.length, byCache: by(recent, r => r.metadata && r.metadata.marketFetchCache), byTier: by(recent, r => r.metadata && r.metadata.tier),
          metered: sum(recent), meteredSearches: recent.filter(r => Number(r.oldcarsdata_metered_requests) > 0).length,
          meteredByTier: recent.filter(r => Number(r.oldcarsdata_metered_requests) > 0).reduce((o, r) => { const k = (r.metadata && r.metadata.tier) || "none"; o[k] = (o[k] || 0) + Number(r.oldcarsdata_metered_requests); return o; }, {}) } });
    }
    // Probe (PROBE_KEY): which live listings a search shows, and for every live listing whose title carries
    // `like` (any make field), why it is or is not shown (the search's own stage that left it out).
    if (b.action === "explain" && process.env.PROBE_KEY && b.key === process.env.PROBE_KEY) {
      const trace = [], sr = await runSearch(env, b.p || {}, { trace });
      const shown = new Set(sr.matches.map(x => x.r.id)), why = {};
      for (const t of trace) if (!why[t.id]) why[t.id] = t.why;
      const re = b.like ? new RegExp(String(b.like), "i") : null;
      const all = re ? ((await liveRows(env, "id=gt.0")) || []).filter(r => re.test(String(r.listing_title || ""))) : [];
      const row = r => ({ id: r.id, title: r.listing_title, make: r.make, model: r.model, year: r.year, house: r.source, country: r.country, url: r.url, shown: shown.has(r.id), why: shown.has(r.id) ? null : (why[r.id] || "not read: make field is " + JSON.stringify(r.make)) });
      return res.status(200).json({ resolved: sr.v ? { make: sr.v.make, model: sr.v.model, trim: sr.v.trim || null } : null, shown: sr.matches.length, abroadHidden: sr.abroadHidden, unstated: sr.unstated, cutByBudget: sr.cutByBudget, titleMatches: all.map(row) });
    }
    // Probe (PROBE_KEY): what the range ladder returns at each rung for one live listing.
    if (b.action === "ladder" && process.env.PROBE_KEY && b.key === process.env.PROBE_KEY) {
      const rows = await liveRows(env, `id=eq.${Number(b.id) || 0}`);
      const r = rows && rows[0]; if (!r) return res.status(200).json({ error: "not live" });
      const facts = listingFacts(r), spec = await specOf(env, r, facts), trace = [];
      if (!spec) return res.status(200).json({ error: "unresolved", title: r.listing_title });
      // Every rung, not just up to the first range (the walk itself stops at the first range).
      const steps = [];
      for (const st of ladderSteps(spec)) { const t = []; await walkLadder(env, { ...spec, v: st.v, title: st.title, refine: st.refine }, t); steps.push({ ...(t[0] || {}), step: st.step }); }
      const chosen = await walkLadder(env, spec, trace);
      return res.status(200).json({ title: r.listing_title, key: spec.key, steps, refine: spec.refine || null, chosen: chosen && { step: chosen.step, family: chosen.family, refinedNote: chosen.refinedNote || null, kind: chosen.kind, count: chosen.count, low: chosen.low, high: chosen.high, span: chosen.span } });
    }
    if (b.action === "geocoverage") return res.status(200).json(await geoCoverage(env));
    if (b.action === "converse") { const cv = await converseOut(env, b); await noteBuySearch(env, req, cv && cv.filters); return res.status(200).json(cv); }
    // The invisible ceiling on every search path (lib/_ceilings.js, the one guard Buy and Sell share): a
    // calm reply when hit, never a sign in demand. Our own jobs (credential) skip it unless a test ceiling
    // is sent with them (x-ceiling-test), which is how the ceiling is tested without touching real numbers.
    const searching = b.action === "chat" || b.action === "rerun" || b.action === "converse" || (!b.action && b.q);
    if (searching) {
      const cred = hasServerCredential(req), lim = testLimits(req, cred);
      if (!cred || lim) {
        const ce = await checkCeiling(env, req, b.action === "chat" ? "buy_chat" : "buy_search", { tool: "buy", limits: lim });
        if (!ce.ok) return res.status(200).json(b.action === "chat" || b.action === "rerun" || b.action === "converse" ? { reply: CALM.search, cards: [], limited: true, turns: Number(b.turns) || 0 } : { status: "unresolved", message: CALM.search, limited: true });
      }
    }
    if (b.action === "chat") {
      // The model's own ceilings (lib/_ceilings.js buyModelGuard: 20 model turns per device a day, a nuisance
      // guard; $50 of Buy chat model cost a day, the authoritative one). Past either: the page's no-model search.
      const mg = await buyModelGuard(env, req);
      if (!mg.ok) return res.status(200).json({ fallback: true, capped: mg.why, note: BUY_MODEL_PAUSED });
      return await buyChat(res, env, b, readVisitorId(req), req);
    }
    // The searching state's "what has been understood so far": the words parsed and the car resolved (the
    // same parser and resolver the search uses, no model call), as short chips. Never a count.
    if (b.action === "parse") {
      const text = String(b.text || "").slice(0, 200);
      const pq = await Promise.race([parseQueryResolved(text, env).catch(() => parseQuery(text)), new Promise(r => setTimeout(() => r(parseQuery(text)), 1500))]);
      const f = pq.filters || {};
      const v = pq.vehicle || null;
      const chips = [];
      if (f.yearMin && f.yearMax) chips.push(f.yearMin === f.yearMax ? String(f.yearMin) : `${f.yearMin} to ${f.yearMax}`);
      for (const c of f.colours || []) chips.push(c);
      if (v && v.make) chips.push(v.make);
      if (v && v.model) chips.push(v.model);
      if (v && v.trim) chips.push(v.trim);
      if (f.gearbox) chips.push(f.gearbox === "auto" ? "automatic" : f.gearbox);
      for (const bd of f.bodies || []) chips.push(bd);
      if (f.priceMax) chips.push("under $" + Number(f.priceMax).toLocaleString("en-US"));
      if (f.miMax) chips.push("under " + Number(f.miMax).toLocaleString("en-US") + " miles");
      // label: the search in plain words for the page's one waiting line ("Sam is finding live red Porsche 911s."),
      // colours, the make and the engine's own plural noun; null when the words don't name a car.
      let label = null;
      if (v && v.make) { const noun = nounFor(v, { gens: f.gens || [], bodies: f.bodies || [] }); label = [...(f.colours || []), new RegExp("^" + String(v.make).replace(/[^a-z0-9]/gi, "."), "i").test(noun) ? "" : v.make, noun].filter(Boolean).join(" "); }
      return res.status(200).json({ chips: [...new Set(chips.map(String))].slice(0, 8), label });
    }
    // A result address reloaded or pasted (/buy?q=...&make=...): the same search from its filters, no model call.
    if (b.action === "rerun") {
      // zip: the buyer's zip for the distance question (kept by the page for the session), never a filter by itself.
      const out = await runFilters(env, b.filters || {}, { zip: /^\d{5}$/.test(String(b.zip || "")) ? String(b.zip) : null });
      const cards = await Promise.all(out.cards.map(async x => { const c = await enrichFast(env, x); if (x.distance != null) c.distance = x.distance; return c; }));
      return res.status(200).json({ reply: out.reply, searchNote: out.searchNote || null, cards, noun: out.noun, meta: out.meta, state: out.state, turns: (Number(b.turns) || 0) + 1 });
    }
    // The detail's live bid refresh can meter one upstream call: only our own jobs may trigger it, never a
    // public visitor (open-search policy: public answers come from the cache and the archive only).
    if (b.action === "detail") return res.status(200).json(await detailOut(env, b, { fresh: hasServerCredential(req) }));
    if (b.action === "save" || b.action === "list" || b.action === "watchsearch" || b.action === "remove" || b.action === "visit" || b.action === "hide" || b.action === "hideall") return await savedSearches(env, req, res, b);
    if (b.action === "alerts_ready") return res.status(200).json({ ready: await alertsReady(env) });
    if (b.action === "arm" || b.action === "disarm" || b.action === "alerts" || b.action === "alert_test") {
      const user = await validateBearer(req.headers.authorization || "").catch(() => null);
      if (!user || !user.userId) return res.status(401).json({ ok: false, needSignIn: true });
      try {
        if (b.action === "alerts") return res.status(200).json(await listAlerts(env, user));
        if (b.action === "arm") return res.status(200).json(await armAlert(env, user, b.listing_id));
        if (b.action === "disarm") return res.status(200).json(await cancelAlert(env, user, b.listing_id));
        // Probe only: this signed-in buyer's armed car, its message now, to a disposable test inbox.
        if (process.env.PROBE_KEY && b.key === process.env.PROBE_KEY && /^[^@\s]+@[^@\s]+$/.test(String(b.to || ""))) return res.status(200).json(await testSend(env, user.userId, b.listing_id, String(b.to), { freshBid, noMark: !!b.noMark }));
        return res.status(400).json({ ok: false });
      } catch (e) { if (isMissingTable(e)) return res.status(200).json({ ok: false, setup: true, items: [] }); throw e; }
    }
    const q = String(b.q || "").slice(0, 200).trim();
    if (!q) return res.status(400).json({ status: "error" });
    const buyT0 = Date.now();
    const parsed = await parseQueryResolved(q, env);
    const v = parsed.vehicle;
    // search_run (docs/analytics-events.md): Buy answers with live cars, so "range" here means live cars were
    // shown and "zero_result" that none were (or the car was not recognised).
    const buyRun = props => track(req, "search_run", { query_text: q, latency_ms: Date.now() - buyT0, model_used: false, cost_usd: 0,
      vehicle_key: v && v.make ? `${v.make}|${v.parentModel || v.model || ""}`.toLowerCase() : undefined, year: Number(v && v.year) || undefined, ...props },
      { product: "buy", surface: "buy_page" });
    if (!v) buyRun({ answer_type: "zero_result", reason_flag: "unresolved", result_count: 0, live_count: 0 });
    if (!v) return res.status(200).json({ status: "unresolved", message: "Sam couldn’t tell which car that is. Try a make and model, like Porsche 911 or Ferrari 812." });
    const f = cleanFilters(b.filters) || parsed.filters;
    if (!b.filters) { const named = gensNamed(parsed.text, v.make); if (named.length > 1 || (named.length === 1 && !v.genCode)) f.gens = named; }
    const { rows, facets } = await searchLive(env, v, f, parsed.text);
    // The market (the US and Canada, lib/live/search.js isAbroadRow) first, then abroad; inside each, every-filter-confirmed before "may match".
    const ordered = [...rows.filter(x => !isAbroadRow(x.r)), ...rows.filter(x => isAbroadRow(x.r))]
      .sort((a, b2) => { const ab = c => (isAbroadRow(c.r) ? 2 : 0) + (c.unknown.length ? 1 : 0); return ab(a) - ab(b2); });
    const capped = ordered.slice(0, MAX);
    const first = await Promise.all(capped.slice(0, FIRST).map(x => enrich(env, x)));
    const emptyMarket = rows.length ? null : applyRung(await familyMarket(env, v, f, { noBlock: true }));
    const rest = capped.slice(FIRST).map(cardOf);
    logSearch(env, v, typeof b.anonId === "string" ? b.anonId.slice(0, 64) : null);
    buyRun({ answer_type: rows.length ? "range" : "zero_result", result_count: capped.length, live_count: rows.length,
      transmission: f && (f.gearbox === "manual" || f.gearbox === "auto") ? f.gearbox : undefined });
    // search event (Oct 2026, open-search policy Part 1.2): the canonical vocabulary's own record of
    // this search, alongside (not replacing) the existing search_events log above - that table has no
    // visitor_id/admin-dashboard join, this one does. Resolved make|model key only, never the typed q.
    if (v && v.make) logEvent(env, { event: EVENTS.SEARCH, tool: "buy", visitorId: readVisitorId(req), props: { key: `${v.make}|${v.model || ""}` } }).catch(() => {});
    const familyKey = ["family", v.make, v.parentModel || v.model, v.trim, (f.gens || []).join("-"), (f.bodies || []).join("-")].filter(Boolean).join(":").toLowerCase().replace(/[^a-z0-9:-]+/g, "-");
    return res.status(200).json({
      status: "ok",
      understood: { make: v.make, model: v.parentModel || v.model || null, trim: v.trim || null, year: v.year || null, noun: nounFor(v, f), filters: f },
      total: rows.length, shownCap: capped.length, cards: first.concat(rest), facets, familyKey, emptyMarket
    });
  } catch (e) {
    console.error("buySearch failed:", (e && e.stack) || e);
    return res.status(500).json({ status: "error" });
  }
}

// ---------------------------------------------------------------- the conversation
function cleanState(s) {
  s = s && typeof s === "object" ? s : {};
  return {
    messages: (Array.isArray(s.messages) ? s.messages : []).map(m => String(m || "").slice(0, 300)).filter(Boolean).slice(-10),
    filters: cleanFilters(s.filters) || null,
    answered: (Array.isArray(s.answered) ? s.answered : []).map(String).filter(k => /^(generation|body|mileage|budget|location|zip|kind|travel)$/.test(k)),
    travel: /^(100|500|any)$/.test(String(s.travel || "")) ? String(s.travel) : null,
    asked: Math.max(0, Math.min(4, Number(s.asked) || 0)),
    zip: /^\d{5}$/.test(String(s.zip || "")) ? String(s.zip) : null,
    place: typeof s.place === "string" && /^[A-Za-z .,'-]{3,60}$/.test(s.place) ? s.place.trim() : null,
    showNow: !!s.showNow,
    // The chat's filters (what the page's address is built from), so a saved search reopens at its own
    // address rather than its typed words: plain short values only.
    chatState: s.chatState && typeof s.chatState === "object" ? { filters: cleanChatFilters(s.chatState.filters) } : null
  };
}
function cleanChatFilters(f) {
  if (!f || typeof f !== "object" || Array.isArray(f)) return null;
  const out = {};
  for (const [k, v] of Object.entries(f).slice(0, 40)) {
    if (!/^[A-Za-z_]{1,24}$/.test(k)) continue;
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof v === "boolean") out[k] = v;
    else if (typeof v === "string" && v.length <= 120) out[k] = v;
    else if (Array.isArray(v)) { const a = v.filter(x => typeof x === "string" && x.length <= 40).slice(0, 10); if (a.length) out[k] = a; }
  }
  return Object.keys(out).length ? out : null;
}
async function converseOut(env, b) {
  const st = cleanState(b.state);
  if (!st.messages.length) return { type: "nonsense", say: "Tell Sam a car, a budget or a type of car and Sam will find what's live.", options: ["a black manual BMW M3", "Porsches under $50k", "anything ending today"] };
  const r = await converse(env, st);
  if (r.type === "question" || r.type === "nonsense") return r;
  const seenN = r.vins && r.vins.length ? await seenCount(env, r.vins).catch(() => 0) : 0;
  if (r.type === "groups") {
    // Each group: its cards (the first four enriched here, so every card a buyer can see renders WITH
    // its Sam line) and its set-aside cars (modified, engine-swapped, project), which are not cards.
    // The heading is a plain Sam line; each card carries its own exact-spec range.
    const shape = list => Promise.all((list || []).map(async g => {
      const { keep, aside } = splitAside(g.items);
      const cards = await Promise.all(keep.slice(0, 40).map((x, i) => i < 4 ? enrich(env, x) : cardOf(x)));
      cards.forEach((c, i) => { if (keep[i] && keep[i].distance != null) c.distance = keep[i].distance; });
      return { label: g.label, n: keep.length, cards, setAside: await setAsideOf(env, aside) };
    })).then(gs => gs.filter(g => g.n || g.setAside.length));
    const [groups, maybeGroups] = await Promise.all([shape(r.groups), shape(r.maybeGroups)]);
    const total = groups.concat(maybeGroups).reduce((k, g) => k + g.n, 0);
    const say = r.near ? r.say : total && seenN ? `${CountText(total)} live, grouped by model. ${sauce(seenN)}` : (r.say || null);
    logSearch(env, null, typeof b.anonId === "string" ? b.anonId.slice(0, 64) : null);
    return { type: "groups", say, groups, maybeGroups, maybeKeys: r.maybeKeys || [], filters: r.filters || null, geo: !!r.geo, footnote: !!r.footnote, perCard: !!r.perCard };
  }
  const matches = (r.matches || []).slice(0, MAX);
  // Stated matches first, then the ones whose listing doesn't say; nearest first within each.
  const ordered = [...matches].sort((a, x) => { const k = c => (c.unknown.length ? 10 : 0) + (c.distance != null ? 0 : (isAbroadRow(c.r) ? 2 : 1)); return k(a) - k(x) || ((a.distance == null ? 1e9 : a.distance) - (x.distance == null ? 1e9 : x.distance)); });
  const split = splitAside(ordered);
  // Fill every card drawn first: the first 10 confirmed matches and the first 4 unconfirmed ones.
  let unsureSeen = 0, sureSeen = 0;
  const cards = await Promise.all(split.keep.map(x => { const un = (x.unknown || []).length; const k = un ? unsureSeen++ : sureSeen++; return (un ? k < 4 : k < FIRST) ? enrich(env, x) : cardOf(x); }));
  cards.forEach((c, i) => { if (split.keep[i].distance != null) c.distance = split.keep[i].distance; });
  const setAside = await setAsideOf(env, split.aside);
  logSearch(env, null, typeof b.anonId === "string" ? b.anonId.slice(0, 64) : null);
  // The opener carries what only Sam knows: how many of these have an auction history.
  let say = r.say;
  // Count only the confirmed matches; the ones whose listing doesn't say are named as such.
  const allM = r.matches || [], unsure = allM.filter(x => (x.unknown || []).length).length, sureN = allM.length - unsure;
  const countLine = (unsure && sureN) ? `${CountText(sureN)} live, and ${countText(unsure)} more whose listing doesn't say.` : `${CountText(allM.length)} live.`;
  // A nearest-years result keeps the shared sentence (lib/live/search.js nearLine) as its opener.
  if (r.near) say = r.say;
  else if (!r.closest && !r.outOfScope && /^There are [\w,]+ live right now\./.test(r.say || "") && (seenN || (unsure && sureN))) say = countLine + (seenN ? " " + sauce(seenN) : "") + (r.geo ? " Closest first." : "");
  else if (seenN && !r.closest && !r.outOfScope) say = allM.length === 1 ? r.say + " It has been through auction before, and Sam has its history." : (r.say || "") + " " + sauce(seenN);
  return { type: "results", say: say, near: r.near || null, market: applyRung(r.market) || null, outOfScope: !!r.outOfScope, geo: !!r.geo, closest: !!r.closest, total: cards.length, cards, setAside, facets: r.closest ? null : facetsOf(ordered), filters: r.filters || null };
}
// Set-aside cars (modified, engine-swapped, project) are never cards: one quiet line each, with a thumbnail.
const ASIDE_KINDS = { engine_swap: "engine-swapped", modified: "modified", project: "a project car" };
function splitAside(items) {
  const keep = [], aside = [];
  for (const x of items) { const f = cardFlag(x.r); (f && ASIDE_KINDS[f.kind] ? aside : keep).push(x); }
  return { keep, aside };
}
async function setAsideOf(env, aside) {
  return Promise.all(aside.slice(0, 6).map(async x => {
    const c = cardOf(x), m = await listingMarket(env, x.r, x.facts).catch(() => null);
    return { id: c.id, title: c.title, url: c.url, photo_url: c.photo_url, colour: c.colour, year: c.year, why: ASIDE_KINDS[c.flag.kind], query: m && m.query ? m.query : null };
  }));
}
async function detailOut(env, b, opts = {}) {
  const id = Number(b.id); if (!Number.isFinite(id)) return { ok: false };
  const rows = await liveRows(env, `id=eq.${id}`);
  let row = rows && rows[0]; if (!row) return { ok: false };
  if (opts.fresh) row = await freshBid(env, row);
  const facts = listingFacts(row);
  const [detail, hist] = await Promise.all([listingDetail(env, row), row.vin_norm ? vinAppearances(env, row.vin_norm) : Promise.resolve(null)]);
  const history = hist && hist.appearances ? hist.appearances.map(a => ({ kind: a.kind, date: a.date, house: a.house, price: a.kind === "sale" ? a.priceUsd : a.bidUsd, miles: a.mileage, url: a.url })) : [];
  return { ok: true, card: cardOf({ r: row, facts, gen: null, unknown: [] }), detail: detail && detail.market ? { ...detail, market: applyRung(detail.market) } : detail, history, historyUrl: row.vin_norm && history.length ? `/vin/${row.vin_norm}` : null };
}
// ---------------------------------------------------------------- saved searches (signed in)
async function savedSearches(env, req, res, b) {
  const user = await validateBearer(req.headers.authorization || "").catch(() => null);
  if (!user || !user.userId) return res.status(401).json({ ok: false, needSignIn: true });
  const H = { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, "Content-Type": "application/json" };
  const base = `${env.supabaseUrl}/rest/v1/buy_conversations`;
  // ONE LIST (Sam, Oct 9 2026): "Your searches" is the account's list when signed in, these rows: each search
  // the visitor runs (action "visit", one row per address) and the searches saved before (rows without an
  // address; the page names them by their filters). Remove and Clear all HIDE rows (state.hidden), they never
  // delete one, so no saved search is ever lost; a hidden row's watch, if any, is untouched.
  const isHidden = s => !!(s && s.state && s.state.hidden === true);
  const hideRows = async ids => {
    ids = [...new Set((ids || []).map(String).filter(id => /^[0-9a-f-]{36}$/.test(id)))].slice(0, 100);
    if (!ids.length) return true;
    const rr = await fetch(`${base}?user_id=eq.${user.userId}&id=in.(${ids.join(",")})&select=id,state`, { headers: H });
    if (!rr.ok) return false;
    const rows = await rr.json();
    const out = await Promise.all(rows.filter(x => !isHidden(x)).map(x => fetch(`${base}?id=eq.${x.id}&user_id=eq.${user.userId}`, { method: "PATCH", headers: H, body: JSON.stringify({ state: { ...(x.state || {}), hidden: true } }) }).then(r => r.ok)));
    return out.every(Boolean);
  };
  if (b.action === "list") {
    const r = await fetch(`${base}?user_id=eq.${user.userId}&select=id,title,messages,filters,state,watch,updated_at&order=updated_at.desc&limit=100`, { headers: H });
    return res.status(r.ok ? 200 : 500).json({ ok: r.ok, items: r.ok ? (await r.json()).filter(s => !isHidden(s)).slice(0, 50) : [] });
  }
  if (b.action === "visit") {
    const url = String(b.url || "");
    if (!/^\/buy\?[^\s<>"]{1,400}$/.test(url)) return res.status(400).json({ ok: false });
    const title = String(b.title || "Search").replace(/\s+/g, " ").trim().slice(0, 120) || "Search";
    const now = new Date().toISOString();
    const rr = await fetch(`${base}?user_id=eq.${user.userId}&select=id,state&order=updated_at.desc&limit=200`, { headers: H });
    const hit = rr.ok ? (await rr.json()).find(x => x.state && x.state.url === url) : null;
    const st = { ...cleanState(b.state), url, hidden: false };
    const r = hit
      ? await fetch(`${base}?id=eq.${hit.id}&user_id=eq.${user.userId}`, { method: "PATCH", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify({ title, state: { ...(hit.state || {}), ...st }, updated_at: now }) })
      : await fetch(base, { method: "POST", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify([{ user_id: user.userId, title, messages: [title], filters: {}, state: st, updated_at: now }]) });
    const out = r.ok ? await r.json() : null;
    return res.status(r.ok ? 200 : 500).json({ ok: r.ok, id: out && out[0] && out[0].id });
  }
  if (b.action === "hide") return res.status(200).json({ ok: await hideRows(Array.isArray(b.ids) ? b.ids : []) });
  if (b.action === "hideall") {
    const rr = await fetch(`${base}?user_id=eq.${user.userId}&select=id,state&limit=500`, { headers: H });
    return res.status(200).json({ ok: rr.ok && await hideRows((await rr.json()).filter(x => !isHidden(x)).map(x => x.id)) });
  }
  if (b.action === "save") {
    const st = cleanState(b.state);
    const title = String(b.title || st.messages[0] || "Search").slice(0, 120);
    const row = { user_id: user.userId, title, messages: st.messages, filters: st.filters || {}, state: st, updated_at: new Date().toISOString() };
    const r = b.id && /^[0-9a-f-]{36}$/.test(String(b.id))
      ? await fetch(`${base}?id=eq.${b.id}&user_id=eq.${user.userId}`, { method: "PATCH", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify(row) })
      : await fetch(base, { method: "POST", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify([row]) });
    const out = r.ok ? await r.json() : null;
    if (!r.ok) console.error("buy_conversations save failed", r.status);
    return res.status(r.ok ? 200 : 500).json({ ok: r.ok, id: out && out[0] && out[0].id });
  }
  // Remove hides the row (never a delete; see ONE LIST above).
  if (b.action === "remove" && /^[0-9a-f-]{36}$/.test(String(b.id))) return res.status(200).json({ ok: await hideRows([b.id]) });
  if (b.action === "watchsearch" && /^[0-9a-f-]{36}$/.test(String(b.id))) {
    const email = user.email || String(b.email || "").toLowerCase();
    if (!email) return res.status(400).json({ ok: false });
    await fetch(`${base}?id=eq.${b.id}&user_id=eq.${user.userId}`, { method: "PATCH", headers: H, body: JSON.stringify({ watch: true, updated_at: new Date().toISOString() }) });
    const r = await fetch(`${env.supabaseUrl}/rest/v1/watch_requests?on_conflict=vin_norm,email`, { method: "POST", headers: { ...H, Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify([{ vin_norm: "search:" + b.id, email }]) });
    return res.status(r.ok ? 200 : 500).json({ ok: r.ok });
  }
  return res.status(400).json({ ok: false });
}

const STOP_CSS = "body{margin:0;background:#F6F3EC;color:#15201A;font:400 17px/1.55 system-ui,-apple-system,'Segoe UI',sans-serif}main{max-width:520px;margin:0 auto;padding:48px 20px}.brand{font:600 20px/1 Georgia,serif;margin:0 0 32px}h1{font:500 30px/1.15 Georgia,serif;margin:0 0 14px}button{margin:10px 0 6px;min-height:48px;padding:0 22px;border:0;border-radius:10px;background:#1E4D38;color:#fff;font:600 16px/1 system-ui,sans-serif;cursor:pointer}a{color:#1E4D38}.quiet{font-size:14px;color:#5E6B63}.two{display:flex;flex-wrap:wrap;gap:10px;align-items:center}.two form{margin:0}button.alt{background:#fff;color:#1E4D38;border:1px solid #1E4D38}";
// On-demand current bid for one auction when its detail view opens, cached 5 minutes. OFF unless
// LIVE_FRESHNESS=1, and never under the monthly reserve. One metered request at most (2 retries on 5xx).
const bidCache = new Map();
async function freshBid(env, row) {
  if (!freshnessOn() || !process.env.OLDCARSDATA_API_KEY) return row;
  const key = row.source + "|" + row.source_listing_id, hit = bidCache.get(key);
  if (hit && Date.now() - hit.at < 300e3) return { ...row, ...hit.patch };
  if (await underReserve(env)) return row;
  try {
    configureOcdUsage({ ...env, job: "pull_live_bid" });
    const r = await ocdWithRetry(() => callOldCarsData("/auctions/" + encodeURIComponent(row.source_listing_id), {}, process.env.OLDCARSDATA_API_KEY));
    const rec = (r && (r.data || r)) || null;
    const m = rec && mapLiveRecord(Array.isArray(rec) ? rec[0] : rec, new Date().toISOString());
    await flushOcdUsage();
    if (!m) return row;
    await upsertLive(env, [m]);
    const patch = { current_bid: m.current_bid, current_bid_usd: m.current_bid_usd != null ? m.current_bid_usd : row.current_bid_usd, bid_at: m.bid_at || new Date().toISOString(), end_time: m.end_time || row.end_time };
    bidCache.set(key, { at: Date.now(), patch });
    return { ...row, ...patch };
  } catch (e) { console.error("freshBid:", e && e.message); return row; }
}

// Which sources give a usable US location (city + state that geocodes), over the live listings. Read-only.
async function geoCoverage(env) {
  const rows = await liveRows(env, "id=gt.0");
  const by = {};
  for (const r of rows) {
    const s = houseName(r.source); by[s] = by[s] || { live: 0, us: 0, usable: 0, abroad: 0 };
    by[s].live++;
    if (isAbroadRow(r)) { by[s].abroad++; continue; }
    by[s].us++;
    if (listingCoord(r)) by[s].usable++;
  }
  return { ocdRequests: 0, sources: by };
}

// "Three have been through auction before, and Sam has their history." (small counts in words)
function sauce(n) { const w = CountText(n); return n === 1 ? "One has been through auction before, and Sam has its history." : `${w} have been through auction before, and Sam has their history.`; }

// ---------------------------------------------------------------- the conversation, run by Claude
// POST {action:"chat", messages:[{role,content}], state:{filters}, turns} -> text/event-stream:
//   event: text      the reply as it streams
//   event: done      {reply, cards, state, turns}   (cards enriched exactly like the scripted flow's)
//   event: fallback  {}  the Claude call failed before any text: the page falls back to the scripted flow
// Turn cap 30; each turn logged to app_usage_events (tokens, tools, latency); a timeout ends with a
// plain line. SAM_MODEL and the same key as api/chat.js.
// Buy's turn through the shared chat endpoint: cards never wait for the engine (a spec not cached yet
// comes back "pending" and the page fetches that card's line before drawing it).
function buyChat(res, env, b, visitorId, req) {
  return chatOut(res, env, b, { surface: "buy", run: runTurn, visitorId,
    // After the turn: a ledger row when the model was called (the device ceiling), and the heavy-use note.
    afterTurn: async (usage, out) => { if (usage && usage.calls > 0) await recordBuyModelTurn(env, req); await noteBuySearch(env, req, out && out.state && out.state.filters); },
    // Lane E's E3 (Oct 16 2026): the cards' enrichment may start the moment search_live returns, alongside the model's
    // reply (chatOut calls prepare per card; out.prepared is a Map from the listing id to that promise). A card takes
    // its prepared result only by its own listing id, never by position, so a re-sort or a second search can never
    // give one car another's market; anything not prepared is enriched here as before.
    prepare: x => enrichFast(env, x),
    shape: async out => ({ cards: await Promise.all(out.cards.map(async x => { const pre = out.prepared instanceof Map && x && x.r ? out.prepared.get(x.r.id) : null; const c = (pre ? await pre.catch(() => null) : null) || await enrichFast(env, x); if (x.distance != null) c.distance = x.distance; return c; })), noun: out.noun, meta: out.meta || null, searchNote: out.searchNote }) });
}

// Analytics (docs/analytics-events.md): an error event when this route throws or answers 5xx.
export default withTracking("/api/buySearch", handler, "buy");
