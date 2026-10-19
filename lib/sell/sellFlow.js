// The one-direction Sell (Lane C, Oct 2026). Behind SELL_NEXT_ON. The car questions are Market Check's own
// (js/onebox.js on the One Box engine, served by api/sellNext.js); this file takes the named car, the
// state and how the seller wants to sell, and builds the result: the platform with three or four reasons
// (each figure from a shared engine function, see pickFacts), and the PowerSeller whenever the partner
// gate passes, first when the seller asked for someone to handle it, second otherwise. Then the three
// latest sales. Every sentence passes the shared guard (lib/live/chatCore.js guardReply) or is not shown.
import { resolveSellCar, sellFactsFor, poolMedianUsd, engineFirst } from "./sellFacts.js";
import { reserveInsightForVehicle } from "../onebox.js";
import { guardReply } from "../live/chatCore.js";
import { evaluatePartnerReferral, buildAnalysisFromStore } from "../../api/sellerDecision.js";
import { pickPlatform } from "../platformPick.js";
import { partnerCardFacts } from "./sellPartner.js";
import { humanTitle } from "../carTitle.js";

const STATES = ["Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming"];
// Where each place's OWN selling page is (information, never "start your listing" in Sam's voice).
const SELL_PAGES = {
  bringatrailer: "https://bringatrailer.com/submit-a-vehicle/", carsandbids: "https://carsandbids.com/sell-car-online",
  pcarmarket: "https://www.pcarmarket.com/sell/", hagerty: "https://www.hagerty.com/marketplace/sell", hemmings: "https://www.hemmings.com/auction/sell",
  rmsothebys: "https://rmsothebys.com/en/consign", gooding: "https://www.goodingco.com/consign/", bonhams: "https://www.bonhams.com/department/MOT-CAR/",
  broadarrow: "https://www.broadarrowauctions.com/consign", mecum: "https://www.mecum.com/consign/", barrettjackson: "https://www.barrett-jackson.com/consign"
};

export function stateOf(text) {
  const t = String(text || "");
  return STATES.find(s => new RegExp("\\b" + s + "\\b", "i").test(t)) || null;
}

// ---------------------------------------------------------------- 2. the result: one direction
const guardOk = (sentence, facts) => !guardReply(sentence, [{ tool: "sell_facts", result: facts }], "", []).length;
// placeWhy (removed, Sam, Oct 13 2026): it was no longer called, and its sentences claimed more than the
// records show ("where their buyers look", "has handled them more than anyone else"). The pick card's
// reason is pickFacts's counted sentence below, which says only what the sales show.

// The partner: the SHARED gate and ranking the live /sell uses (api/sellerDecision.js evaluatePartnerReferral),
// with the criteria shaped exactly as the old wizard sends them (js/steps.js: involvement + sellerPreference;
// the timeline chips; no asking price is asked here, so "Not set" as when a seller skips it). The analysis it
// reads is the landed rung's thresholdMet and the comps median, from the Sell engine's pool (8+ sales).
const INVOLVEMENT = { self: "I'll manage it myself", handled: "Want someone to handle everything", house: "Take it through an auction house", unsure: null };
const PREFERENCE = { self: "diy", handled: "powerseller", house: "auction_house", unsure: "unsure" };
const TIMELINE = { fast: "ASAP", month: "Within a month", none: "No rush" };
async function partnerFor(env, car, { state, how, rush }, facts) {
  // Item 4 (one engine rule): the SAME analysis-building step live /sell feeds evaluatePartnerReferral
  // (buildAnalysisFromStore, api/sellerDecision.js) - a read of vehicle_market_records (the store both
  // pages already read on a cache hit), zero OldCarsData, zero metering, zero persistence. Was this
  // file's own pool-median approximation; a car with no store history yet (never searched live) falls
  // back to the same honest not-yet-measured shape the old analysis has when its own ladder is thin.
  const analysis = await buildAnalysisFromStore(car.v, car.generation, env.supabaseUrl, env.supabaseKey).catch(() => null)
    || { ladder: { landed: { thresholdMet: false } }, estimatedValue: null };
  const criteria = { region: "US", state: state || null, timeline: TIMELINE[rush] || null, involvement: INVOLVEMENT[how] || null, sellerPreference: PREFERENCE[how] || null, targetPrice: "Not set" };
  const ref = await evaluatePartnerReferral(analysis, criteria, car.v, env.supabaseUrl, env.supabaseKey);
  return ref && ref.partner ? ref : null;
}

// Three or four reasons, each with the words-only sentence, the sentence with figures, and the figures
// alone (for "see the numbers"). Every figure comes from a shared engine function: the venue counts from
// the Sell engine's placesFor, the reserve read from lib/onebox.js reserveInsightForVehicle, the day read
// from reserveDayInsightForVehicle, the next house sale from lib/houseCalendar.js (via placesFor). A reason
// with no supported figure is left out. No ask comparison, no band.
// What feeds the live /sell pick card: WHY (one plain sentence carrying its figure) and up to two stat
// boxes (RESERVE, BEST DAY TO END), every figure from a shared engine function: the venue counts from the
// Sell engine's placesFor, the reserve read from lib/onebox.js reserveInsightForVehicle, the day read from
// reserveDayInsightForVehicle. A box with no supported figure is left out; no price comparison anywhere. A
// house pick (which carries no reserve or day read) gets the published next sale (lib/houseCalendar.js).
// The day-of-week tile. Counts always; a range (the middle half, as the venue ranges) only when the top day and the other days
// together each hold eight or more sales. Number words one to ten, digits from 11. Never a cause, never a percentage.
const DNW = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"], dnw = n => DNW[n] || String(n);
const dusd = n => "$" + Math.round(n).toLocaleString("en-US");
export function dayTile(pl) {
  const bd = pl && pl.by_day;
  if (!bd || !(bd.dated >= 8) || bd.dated !== bd.days.reduce((n, g) => n + g.count, 0)) return null;
  const inWin = pl.window_label || `in the last ${Number(pl.window_months) || 12} months`;
  const of = `of the ${dnw(bd.dated)} sales ${inWin}`;
  if (bd.tied) {
    if (bd.tied.length !== 2) return null;
    const c = bd.days[0].count, [a, b] = bd.tied;
    return { key: "day", label: "Day the sale ended", head: `${a} and ${b}`, line: `${dnw(c)} sales each, among the ${dnw(bd.dated)} ${inWin}`, line2: null,
      words: `${a} and ${b} each had more sales than any other day.` };
  }
  const t = bd.top, o = bd.other;
  let range = null;
  if (t.most_sold_between && o.most_sold_between) {
    const r = x => `between ${dusd(x[0])} and ${dusd(x[1])}`;
    range = `The middle half of ${t.day} sales landed ${r(t.most_sold_between)}, and of sales on other days ${r(o.most_sold_between)}.`;
  }
  return { key: "day", label: "Day the sale ended", head: t.day, line: `${dnw(t.count)} ${of}`, line2: range,
    words: `More of these sold on a ${t.day} than on any other day.` };   // words carry no figures (the landing example uses them)
}
export async function pickFacts(env, car, pl, place, opts = {}) {
  const name = pl.cohort_name ? `${pl.cohort_name} sales` : `sales of ${String(pl.cohort_noun || "cars like this")}`;
  const Name = name.charAt(0).toUpperCase() + name.slice(1);
  const months = Number(pl.window_months) || 12;
  const inWin = pl.window_label || `in the last ${months} months`;   // the engine's own window, in words (lib/sell/sellFacts.js engineWindow)
  const total = Number(pl.total) || 0, here = Number(place.sales) || 0;
  // Counts inside a sentence: one to ten in words, digits from 11 ("two of the 30 sales").
  const NW = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"], nw = n => NW[n] || String(n);
  const top = (pl.places || [])[0] === place, topHouse = (pl.places || []).find(p => p.house) === place;
  // why: the sentence with its figure (the result card). whyWords: the SAME sentence from the same branch
  // with the figure left off (the Sell landing's example, which shows no figures but sold prices).
  // whyAnon: the same branch again with the venue left unnamed (the Sell landing's example names no site;
  // the venue is revealed only in the real result once the visitor's car is known).
  let why = null, whyWords = null, whyAnon = null;
  const siteWord = place.house ? "auction house" : "auction site";
  if (total && here) {
    if (opts.asap) whyAnon = "Of the auction houses where cars like this sold, one has the soonest sale coming up.";
    else if (!top && topHouse) whyAnon = "Cars like this went to one auction house more often than any other.";
    else if (here / total >= 0.5) whyAnon = `Most ${name} were at one ${siteWord}.`;
    else whyAnon = `${Name} were at one ${siteWord} more than anywhere else.`;
    if (opts.asap) { whyWords = `Of the auction houses where cars like this have sold, ${place.name} has the soonest sale coming up.`; why = `Of the auction houses where cars like this have sold, ${place.name} has the soonest sale coming up, and ${nw(here)} of the ${nw(total)} sales ${inWin} were there.`; }
    else if (!top && topHouse) { whyWords = `${place.name} is the auction house where cars like this sold most often.`; why = `${place.name} is the auction house where cars like this sold most often, ${nw(here)} of ${nw(total)} ${inWin}.`; }
    // "at auction" dropped (Sam, Oct 13 2026): every sale on record is an auction, so it counted nothing. The
    // sentence names what is counted: the sales of this car in the window, and how many were at this venue.
    // A house takes "at", a site "on" (the same preposition rule as the too-few block below).
    else { const prep = place.house ? "at" : "on";
      if (here / total >= 0.5) { whyWords = `Most ${name} were ${prep} ${place.name}.`; why = `Most ${name} were ${prep} ${place.name}, ${nw(here)} of ${nw(total)} ${inWin}.`; }
      else { whyWords = `${Name} were ${prep} ${place.name} more than anywhere else.`; why = `${Name} were ${prep} ${place.name} more than anywhere else, ${nw(here)} of ${nw(total)} ${inWin}.`; } }
    // One or two sales (Sam, Oct 9 2026): never "most"; the too-few block below says where they were.
  }
  // TOO FEW TO COMPARE VENUES (Sam, Oct 13 2026): under eight sales in the engine's pool, or no venue with three of
  // them, there is nothing honest to split by venue. The line says so plainly and still prints the pool count:
  //   one or two sales: where they were, then "One sale is too few to compare venues." (the where is the fact);
  //   three to seven: "Five sales in the last 12 months are too few to compare venues.";
  //   eight or more, no venue with three: "30 sales in the last 12 months, but no single venue has enough of them to compare."
  // A pick that is not the top venue (an ASAP house) is judged by the top venue: it has its own reason line above.
  // Number words one to ten, digits from 11. Never how many venues exist.
  const topSales = Math.max(0, ...(pl.places || []).map(p => Number(p.sales) || 0));
  if (total && (total < 8 || topSales < 3)) {
    const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
    const Cnt = n => WORDS[n] ? WORDS[n].charAt(0).toUpperCase() + WORDS[n].slice(1) : String(n);
    const lead = opts.asap ? `Of the auction houses where cars like this have sold, ${place.name} has the soonest sale coming up. ` : "";
    const leadAnon = opts.asap ? "Of the auction houses where cars like this sold, one has the soonest sale coming up. " : "";
    let line, anon;
    if (total < 3 && here) {
      const prep = place.house ? "at" : "on", few = total === 1 ? "One sale is too few to compare venues." : "Two sales are too few to compare venues.";
      line = (total === 1 ? `The one sale ${inWin} was ${prep} ${place.name}.` : here === 2 ? `Both sales ${inWin} were ${prep} ${place.name}.` : `One of the two sales ${inWin} was ${prep} ${place.name}.`) + " " + few;
      const atA = place.house ? "at an auction house" : "on an auction site", same = place.house ? "at the same auction house" : "on the same auction site";
      anon = (total === 1 ? `The one sale ${inWin} was ${atA}.` : here === 2 ? `Both sales ${inWin} were ${same}.` : `One of the two sales ${inWin} was ${place.house ? "at this auction house" : "on this auction site"}.`) + " " + few;
    } else if (total < 8) {
      line = anon = `${Cnt(total)} sales ${inWin} are too few to compare venues.`;
    } else {
      line = anon = `${Cnt(total)} sales ${inWin}, but no single venue has enough of them to compare.`;
    }
    why = whyWords = lead + line;
    whyAnon = leadAnon + anon;
  }
  const boxes = [];
  // RESERVE box HIDDEN (Lane B2, Oct 13 2026): reserveInsightForVehicle reads its own pool (the generation, every trim, every
  // fence off, a separate 12-month read of sales_archive), so it printed counts like "204 of 624 no reserve" beside a page
  // that says 21 sales. The engine's pool rows carry no reserve flag yet; see FOR LANE B in docs/lane-notes.md. It returns
  // when it can be counted from the engine's own pool.
  // Day of the week the sales ended (Oct 2026, Lane B2): counts of SOLD cars by the day the sale ended, from the engine's pool
  // (pl.by_day, lib/sell/sellFacts.js dayBuckets). No sell-through, no percentage, no failed bids. Hidden under eight sales.
  const dt = dayTile(pl);
  if (dt) boxes.push(dt);
  if (!boxes.length && place.house && place.next_sale && place.next_sale.month) {
    const ns = place.next_sale;
    boxes.push({ key: "next_sale", label: "Next sale", head: ns.month, line: `${ns.city ? ns.city + ", " : ""}by its published calendar; confirm with ${place.name}`,
      words: `${place.name}'s next sale is in ${ns.month}${ns.city ? " in " + ns.city : ""} by its published calendar; confirm with ${place.name}.` });
  }
  return { why, whyWords, whyAnon, boxes: boxes.slice(0, 2) };
}

// Who the partner is, where they work and what they sell, in one plain sentence from the partner record
// (display name, regions, specialties). No source note on the page (Sam, Oct 2026).
function partnerSentence(ps, state) {
  const regions = (ps.regions || []).map(String);
  const local = state && regions.some(r => r.toLowerCase() !== "nationwide" && (r.toLowerCase() === String(state).toLowerCase()));
  const nationwide = regions.some(r => r.toLowerCase() === "nationwide");
  const named = regions.filter(r => r.toLowerCase() !== "nationwide");
  const where = local ? `works with sellers in ${state}` : nationwide ? "works with sellers across the country" : named.length ? `works with sellers in ${named.slice(0, 3).join(", ").replace(/, ([^,]*)$/, " and $1")}` : "";
  // The record's notes can carry their own source note ("(per howS)"); the page shows none.
  let what = String(ps.specialty || "").replace(/\s*\((?:per|via|source:?)\s[^)]*\)/gi, "").trim().replace(/[.]+$/, "");
  if (what && /^[A-Z][a-z]/.test(what)) what = what.charAt(0).toLowerCase() + what.slice(1);
  if (what && !/\band\b/.test(what)) what = what.replace(/, ([^,]*)$/, " and $1");
  const parts = [where, what ? `sells ${what}` : ""].filter(Boolean);
  return `${ps.name} is a PowerSeller${parts.length ? " who " + parts.join(" and ") : ""}.`;
}

export async function buildResult(env, { carText, state, how, rush }) {
  const sc = await resolveSellCar(carText, env);
  if (!sc.car) return { error: "car" };
  const car = { ...sc.car, env };
  // The engine's first answer (sellFacts.js engineFirst): a builder car's refusal is shown alone (Sam's Singer rule),
  // and the engine's question comes first: no range, no pick, no card until it is answered.
  const first = await engineFirst(car).catch(() => ({}));
  if (first.refusal) return { label: car.label, make: (car.v && car.v.make) || null, state, how, rush: rush || null, refusal: first.refusal };
  // Any other refusal, or a thin answer: the engine's own card and nothing Sell computes (Sam, Oct 19 2026). The route
  // recommendation is dropped here: Sell's pick and its why line are built from venue counts the engine did not produce.
  if (first.noRange) return { label: car.label, make: (car.v && car.v.make) || null, state, how, rush: rush || null, noRange: first.noRange };
  const question = first.question || null;
  if (question) return { label: car.label, make: (car.v && car.v.make) || null, state, how, rush: rush || null, question };
  const facts = await sellFactsFor(car);
  const pl = facts.places || {};
  const places = pl.places || [];
  if (!facts.value_usd && pl.total >= 8) facts.value_usd = await poolMedianUsd(car).catch(() => null);
  // The platform: the SHARED pick (lib/platformPick.js, one engine rule) - live /sell can run the same
  // function behind SELL_PICK_SHARED. sellFactsFor's own `places` still supplies the venue counts and
  // cohort text pickFacts renders; the shared function only decides WHICH platform leads and why (rules
  // 10/22e: an auction house leads only on an explicit "through an auction house" choice, never on sales
  // count alone - the old `places[0]` here could pick a house on count, which is the bug being fixed).
  let platform = null;
  const pickCriteria = { timeline: TIMELINE[rush] || null, sellerPreference: PREFERENCE[how] || null, involvement: INVOLVEMENT[how] || null };
  // The vehicle as the resolver gave it, the way Market Check asks the engine (a 997 is model 997), so the pick reads the same pool as the count.
  const pick = await pickPlatform(car.vEngine || car.v, car.vEngine ? car.generationEngine : car.generation, env, pickCriteria).catch(() => null);
  if (pick && pick.platform) {
    const asapPick = pick.mode === "house" && pick.reasonCode === "speed";
    const matched = places.find(p => p.slug === pick.platform);
    const place = matched || {
      slug: pick.platform, name: pick.platformDisplay, house: pick.mode === "house",
      sales: (pick.figures && (pick.figures.evidenceSales || pick.figures.count)) || 0,
      next_sale: (pick.figures && pick.figures.nextSale) || null
    };
    const pf = await pickFacts(env, car, pl, place, { asap: asapPick });
    const why = pf.why && guardOk(pf.why, { pl, pf }) ? pf.why : null;
    const whyWords = why && pf.whyWords && guardOk(pf.whyWords, { pl, pf }) ? pf.whyWords : null;
    const whyAnon = why && pf.whyAnon && guardOk(pf.whyAnon, { pl, pf }) ? pf.whyAnon : null;
    const boxes = pf.boxes.filter(x => guardOk(`${x.head}. ${x.line}.`, { pl, pf }));
    // reasonCode/reasonFigures are carried through (not yet used to write `why` - that is still
    // sellFacts's own count-based phrasing, unchanged here) so the reason sentence can be rewritten
    // to match the actual branch the shared function used. See docs/lane-notes.md.
    // The pick card's right column (the live /sell card's .pcard-meta rows): the car and where it is, the
    // scope and the window the WHY counts were read over. Shown only alongside that counted WHY, from the
    // same placesFor read (cohort name, window months); nothing new is computed here.
    const meta = why ? [
      { icon: "pin", main: humanTitle(car.label), sub: state || null },
      (pl.scope_label || pl.cohort_name) ? { icon: "car", main: pl.scope_label || pl.cohort_name, sub: "Analysis scope" } : null,
      { icon: "cal", main: `Last ${Number(pl.window_months) || 12} months`, sub: "Analysis window" }
    ].filter(Boolean) : [];
    platform = { slug: place.slug, name: place.name, house: !!place.house, why, whyWords, whyAnon, boxes, meta, link: SELL_PAGES[place.slug] || null, reasonCode: pick.reasonCode, reasonFigures: pick.figures };
  }
  // The PowerSeller, whenever the shared partner gate (evaluatePartnerReferral) returns one for this car.
  const ref = await partnerFor(env, car, { state, how, rush }, facts).catch(e => { console.error("sell partner:", e && e.message); return null; });
  const pp = ref && ref.partner;
  const ps = pp ? { slug: pp.slug, name: pp.displayName || pp.name, regions: pp.regions || [], specialty: (pp.specialties && (pp.specialties.notes || (pp.specialties.segments || []).join(", "))) || null } : null;
  // The card's facts by the live /sell PowerSeller card's own rules (lib/sell/sellPartner.js). When those
  // rules give the card nothing beyond a name, there is no card (never a thin one).
  const card = ref ? partnerCardFacts(ref, car.v, state) : null;
  const partner = ps && card ? { ...card, slug: ps.slug, about: partnerSentence(ps, state) } : null;
  const order = how === "handled" && partner ? ["partner", "platform"] : ["platform", "partner"];
  // The line above the cards: the car they are for, in its humanised title, with its generation when the
  // engine named one and the title does not already carry it.
  // A chassis-style code reads in capitals ("E46", "C7"); a word ("first") stays as it is.
  const gen0 = car.generation && car.generation.code ? String(car.generation.code) : null;
  const gen = gen0 && /^[a-z]{1,3}\d[\w.]*$/i.test(gen0) ? gen0.toUpperCase() : gen0;
  const title = humanTitle(car.label) + (pl.pool_trim && !new RegExp("\\b" + String(pl.pool_trim).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i").test(car.label) ? " " + pl.pool_trim : "");
  const carLine = { title, generation: gen && !new RegExp("\\b" + gen.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i").test(title) ? gen : null,
    // The years the engine read, when it read a span ("2005 to 2007"): every page names them, the thin pages too (Oct 14 2026, golden cars 6 and 14).
    span: (/\b\d{4} to \d{4}\b/.exec(String(pl.scope_label || "")) || [null])[0] };
  return { label: car.label, carLine, make: (car.v && car.v.make) || null, cohort: pl.cohort_name || null, state, how, rush: rush || null, order, platform, partner,
    // A photo from the same pool that is NOT one of the three latest sales (the Sell landing's band).
    bandPhoto: facts.extraPhoto || null,
    empty: !platform && !partner ? "Sam has not seen this car sell yet, so there is no place on record to point to." : null,
    // The engine's own answer, slimmed to the shared card's fields (Lane A, one engine / one card job):
    // the same "What these sell for" numbers Market Check shows for this car, from the one engine read
    // already made above - never a second computation.
    marketAnswer: pl.engineAnswer || null,
    recent: (facts.recent || []).map(r => ({ title: r.title, house: r.house, date: r.date, price: r.price, url: r.url, photo: r.photo })) };
}
