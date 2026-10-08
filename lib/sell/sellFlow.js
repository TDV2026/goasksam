// The one-direction Sell (Lane C, Oct 2026). Behind SELL_NEXT_ON. The car questions are Market Check's own
// (js/onebox.js on the One Box engine, served by api/sellNext.js); this file takes the named car, the
// state and how the seller wants to sell, and builds the result: the platform with three or four reasons
// (each figure from a shared engine function, see reasonsFor), and the PowerSeller whenever the partner
// gate passes, first when the seller asked for someone to handle it, second otherwise. Then the three
// latest sales. Every sentence passes the shared guard (lib/live/chatCore.js guardReply) or is not shown.
import { resolveSellCar, sellFactsFor, powersellersFor, poolMedianUsd, houseComparisonFor } from "./sellFacts.js";
import { reserveInsightForVehicle, reserveDayInsightForVehicle } from "../onebox.js";
import { guardReply } from "../live/chatCore.js";
import { powerSellerValueMet } from "../../api/sellerDecision.js";
import { supabaseSelect } from "../_supabase.js";

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

async function partnerFor(env, car, state, facts) {
  // The partner match is the Sell engine's (powersellersFor: make + region); the value floor is the
  // shared gate mechanic (powerSellerValueMet: comps value against each partner's own floor, with the
  // tolerance dial). The value comes only from real comps (a pool the engine landed with 8+ sales).
  const list = await powersellersFor(env, { make: car.v.make, state }).catch(() => []);
  if (!list.length) return null;
  const value = facts.places && facts.places.total >= 8 ? facts.value_usd : null;
  if (!value) return null;
  const tolRow = await supabaseSelect(env, "app_config?key=eq.ps_min_tolerance_pct&select=value&limit=1").catch(() => null);
  const tol = Number(tolRow && tolRow[0] && tolRow[0].value) || 20;
  const floorDefault = Number(process.env.POWERSELLER_MIN_VALUE_USD || 40000);
  for (const p of list) if (powerSellerValueMet(value, null, Number(p.min_value_usd) > 0 ? Number(p.min_value_usd) : floorDefault, tol)) return p;
  return null;
}

// Three or four reasons, each with the words-only sentence, the sentence with figures, and the figures
// alone (for "see the numbers"). Every figure comes from a shared engine function: the venue counts from
// the Sell engine's placesFor, the reserve read from lib/onebox.js reserveInsightForVehicle, the day read
// from reserveDayInsightForVehicle, the next house sale from lib/houseCalendar.js (via placesFor). A reason
// with no supported figure is left out. No ask comparison, no band.
const poss = n => (/s$/i.test(n) ? `${n}'` : `${n}'s`);
async function reasonsFor(env, car, pl, place, opts = {}) {
  const out = [];
  // The car named in the singular with "sales" ("997 Carrera S coupe sales"), so a badge name is never
  // pluralized; the class-era read (no single model) keeps its own noun.
  const name = pl.cohort_name ? `${pl.cohort_name} sales` : `sales of ${String(pl.cohort_noun || "cars like this")}`;
  const months = Number(pl.window_months) || 12;
  const total = Number(pl.total) || 0, here = Number(place.sales) || 0;
  const top = (pl.places || [])[0] === place;
  const topHouse = (pl.places || []).find(p => p.house) === place;
  if (total && here && opts.asap) {
    // Picked by the shared buildHouseComparison asap reorder: the soonest sale among the houses on record.
    out.push({ key: "platform", label: "Soonest sale", words: `Of the auction houses where cars like this have sold, ${place.name} has the soonest sale coming up.`,
      figures: `${here} of ${total} sales here, last ${months} months` });
  } else if (total && here && !top && topHouse) {
    out.push({ key: "platform", label: "Where they sell", words: `${place.name} is the auction house where cars like this sold most often.`,
      figures: `${here} of ${total} sales, last ${months} months` });
  } else if (total && here) {
    const most = here / total >= 0.5, Name = name.charAt(0).toUpperCase() + name.slice(1);
    out.push({ key: "platform", label: "Where they sell",
      words: most ? `Most ${name} at auction were on ${place.name}.` : `${Name} at auction were on ${place.name} more than anywhere else.`,
      figures: `${here} of ${total} sales, last ${months} months` });
  }
  const [ri, rd] = await Promise.all([
    reserveInsightForVehicle(car.v, car.generation, env).catch(() => null),
    reserveDayInsightForVehicle(car.v, car.generation, env).catch(() => null)
  ]);
  // Reserve: only the share that sold with no reserve (Sam, Oct 2026). Never a price comparison between
  // reserve and no-reserve cars.
  if (ri && ri.ok && Number(ri.nReserve) >= 8 && Number(ri.nNoReserve) >= 8) {
    const n = Number(ri.n) || (Number(ri.nReserve) + Number(ri.nNoReserve)), noRes = Number(ri.nNoReserve), m = ri.windowMonths || 12;
    out.push({ key: "reserve", label: "Reserve", words: noRes / n >= 0.5 ? "Most of these sold with no reserve." : "Most of these sold with a reserve.",
      figures: `${noRes} of ${n} with no reserve, last ${m} months` });
  }
  if (rd && rd.ok && Number.isFinite(Number(rd.weekendPct)) && Number.isFinite(Number(rd.weekdayPct))) {
    const we = Number(rd.weekendPct), wd = Number(rd.weekdayPct), weW = rd.winner !== "weekday";
    out.push({ key: "day", label: "Best day to end", words: weW ? "Weekend endings did better: reserve cars ending at the weekend sold more often." : "Midweek endings did better: reserve cars ending midweek sold more often.",
      figures: `weekend ${we}%, midweek ${wd}%, ${rd.sample} auctions, last ${rd.windowMonths || 24} months` });
  }
  if (place.house && place.next_sale && place.next_sale.month) {
    const ns = place.next_sale;
    out.push({ key: "next_sale", label: "Next sale", words: `By its published calendar, ${poss(place.name)} next ${ns.city ? ns.city + " " : ""}sale is in ${ns.month}; confirm the consignment date with ${place.name}.`, figures: null });
  }
  return out.slice(0, 4);
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
  // The platform: the engine's pick. An explicit auction-house choice is honoured; in a rush, the shared
  // buildHouseComparison asap reorder picks the house with the soonest sale (product rule 22e: a rush never
  // lets a house lead on its own, only within an explicit auction-house choice).
  let platform = null;
  if (places.length) {
    let place = how === "house" ? (places.find(p => p.house) || places[0]) : places[0], asapPick = false;
    if (how === "house" && rush === "fast") {
      const hc = await houseComparisonFor(car, { asap: true }).catch(() => null);
      const lead = hc && hc.asapLead && places.find(p => p.slug === hc.asapLead);
      if (lead && lead !== place) { place = lead; asapPick = true; }
    }
    const reasons = (await reasonsFor(env, car, pl, place, { asap: asapPick })).filter(r => guardOk(r.words, { pl, r }) && (!r.figures || guardOk(r.figures, { pl, r })));
    platform = { slug: place.slug, name: place.name, house: !!place.house, reasons, link: SELL_PAGES[place.slug] || null };
  }
  // The PowerSeller, whenever the partner gate passes for this car and state. TEMP: the Sell engine's
  // powersellersFor + the shared value gate, until Lane B exports the shared evaluatePartnerReferral.
  const ps = await partnerFor(env, car, state, facts).catch(() => null);
  const partner = ps ? { slug: ps.slug, name: ps.name, tempRanking: true, about: partnerSentence(ps, state) } : null;
  const order = how === "handled" && partner ? ["partner", "platform"] : ["platform", "partner"];
  return { label: car.label, state, how, rush: rush || null, order, platform, partner,
    empty: !platform && !partner ? "Sam has not seen this car sell yet, so there is no place on record to point to." : null,
    recent: (facts.recent || []).map(r => ({ title: r.title, house: r.house, date: r.date, price: r.price, url: r.url, photo: r.photo })) };
}
