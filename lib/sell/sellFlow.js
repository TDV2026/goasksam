// The one-direction Sell (Lane C, Oct 2026). Behind SELL_NEXT_ON. The car questions are Market Check's own
// (js/onebox.js on the One Box engine, served by api/sellNext.js); this file takes the named car, the
// state and how the seller wants to sell, and builds the result: the platform with three or four reasons
// (each figure from a shared engine function, see pickFacts), and the PowerSeller whenever the partner
// gate passes, first when the seller asked for someone to handle it, second otherwise. Then the three
// latest sales. Every sentence passes the shared guard (lib/live/chatCore.js guardReply) or is not shown.
import { resolveSellCar, sellFactsFor, poolMedianUsd } from "./sellFacts.js";
import { reserveInsightForVehicle, reserveDayInsightForVehicle } from "../onebox.js";
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
function placeWhy(step, place, cohortNoun, make) {
  const name = place.name;
  if (step === "class_era") return `There is very little on record for this exact car, so Sam looked at ${make}s of its era. They have gone to ${name} more than anywhere else.`;
  if (place.house) return `Cars like this have gone to the big auction houses rather than online, and ${name} has handled them more than anyone else.`;
  return `${name} is where ${cohortNoun || "cars like this"} have sold most often, and it is where their buyers look.`;
}

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
async function pickFacts(env, car, pl, place, opts = {}) {
  const name = pl.cohort_name ? `${pl.cohort_name} sales` : `sales of ${String(pl.cohort_noun || "cars like this")}`;
  const Name = name.charAt(0).toUpperCase() + name.slice(1);
  const months = Number(pl.window_months) || 12;
  const total = Number(pl.total) || 0, here = Number(place.sales) || 0;
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
    if (opts.asap) { whyWords = `Of the auction houses where cars like this have sold, ${place.name} has the soonest sale coming up.`; why = `Of the auction houses where cars like this have sold, ${place.name} has the soonest sale coming up, and ${here} of the ${total} sales in the last ${months} months were there.`; }
    else if (!top && topHouse) { whyWords = `${place.name} is the auction house where cars like this sold most often.`; why = `${place.name} is the auction house where cars like this sold most often, ${here} of ${total} in the last ${months} months.`; }
    else if (here / total >= 0.5) { whyWords = `Most ${name} at auction were on ${place.name}.`; why = `Most ${name} at auction were on ${place.name}, ${here} of ${total} in the last ${months} months.`; }
    else { whyWords = `${Name} at auction were on ${place.name} more than anywhere else.`; why = `${Name} at auction were on ${place.name} more than anywhere else, ${here} of ${total} in the last ${months} months.`; }
    // Thin pools (Sam, Oct 9 2026): over one or two sales the reason never says "most"; it says what the
    // record holds. The count words ARE the fact here, so the figure-free version keeps them too.
    if (total < 3) {
      const span = `in the last ${months} months`, prep = place.house ? "at" : "on";
      const thin = total === 1 ? `The one sale ${span} was ${prep} ${place.name}.`
        : here === 2 ? `Both sales ${span} were ${prep} ${place.name}.`
        : `One of the two sales ${span} was ${prep} ${place.name}.`;
      const thinAnon = total === 1 ? `The one sale ${span} was at one ${siteWord}.`
        : here === 2 ? `Both sales ${span} were at one ${siteWord}.`
        : `One of the two sales ${span} was at this ${siteWord}.`;
      if (opts.asap) { why = whyWords = `Of the auction houses where cars like this have sold, ${place.name} has the soonest sale coming up. ${thin}`; }
      else { why = whyWords = thin; whyAnon = thinAnon; }
    }
  }
  const boxes = [];
  const [ri, rd] = await Promise.all([
    reserveInsightForVehicle(car.v, car.generation, env).catch(() => null),
    reserveDayInsightForVehicle(car.v, car.generation, env).catch(() => null)
  ]);
  // Reserve: only the share that sold with no reserve (Sam, Oct 2026). Never a price comparison.
  if (ri && ri.ok && Number(ri.nReserve) >= 8 && Number(ri.nNoReserve) >= 8) {
    const n = Number(ri.n) || (Number(ri.nReserve) + Number(ri.nNoReserve)), noRes = Number(ri.nNoReserve), m = ri.windowMonths || 12;
    const without = noRes / n >= 0.5;
    boxes.push({ key: "reserve", label: "Reserve", head: without ? "Most sold without one" : "Most sold with one", line: `${noRes} of ${n} no reserve, ${m} months`,
      words: without ? "Most of these sold without a reserve." : "Most of these sold with a reserve." });
  }
  if (rd && rd.ok && Number.isFinite(Number(rd.weekendPct)) && Number.isFinite(Number(rd.weekdayPct))) {
    const we = Number(rd.weekendPct), wd = Number(rd.weekdayPct), weW = rd.winner !== "weekday";
    // words: what the figure measures (the share that sold), never "did better" (it is not a price read).
    boxes.push({ key: "day", label: "Best day to end", head: weW ? "Weekend" : "Midweek", line: weW ? `${we}% sold vs ${wd}% midweek, ${rd.sample} auctions` : `${wd}% sold vs ${we}% at the weekend, ${rd.sample} auctions`,
      words: weW ? "Weekend endings sold more often." : "Midweek endings sold more often." });
  }
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
  const pick = await pickPlatform(car.v, car.generation, env, pickCriteria).catch(() => null);
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
      pl.cohort_name ? { icon: "car", main: pl.cohort_name, sub: "Analysis scope" } : null,
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
  const title = humanTitle(car.label);
  const carLine = { title, generation: gen && !new RegExp("\\b" + gen.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i").test(title) ? gen : null };
  return { label: car.label, carLine, make: (car.v && car.v.make) || null, cohort: pl.cohort_name || null, state, how, rush: rush || null, order, platform, partner,
    // A photo from the same pool that is NOT one of the three latest sales (the Sell landing's band).
    bandPhoto: facts.extraPhoto || null,
    empty: !platform && !partner ? "Sam has not seen this car sell yet, so there is no place on record to point to." : null,
    recent: (facts.recent || []).map(r => ({ title: r.title, house: r.house, date: r.date, price: r.price, url: r.url, photo: r.photo })) };
}
