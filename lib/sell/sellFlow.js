// The one-direction Sell (Lane C, Oct 2026). Behind SELL_NEXT_ON. The car questions are Market Check's own
// (js/onebox.js on the One Box engine, served by api/sellNext.js); this file takes the named car, the
// state and how the seller wants to sell, and builds the result: the platform with three or four reasons
// (each figure from a shared engine function, see reasonsFor), and the PowerSeller whenever the partner
// gate passes, first when the seller asked for someone to handle it, second otherwise. Then the three
// latest sales. Every sentence passes the shared guard (lib/live/chatCore.js guardReply) or is not shown.
import { resolveSellCar, sellFactsFor, powersellersFor, poolMedianUsd } from "./sellFacts.js";
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
async function reasonsFor(env, car, pl, place) {
  const out = [];
  const noun = String(pl.cohort_noun || "cars like this");
  const months = Number(pl.window_months) || 12;
  const total = Number(pl.total) || 0, here = Number(place.sales) || 0;
  const top = (pl.places || [])[0] === place;
  if (total && here && !top) {
    out.push({ key: "platform", words: `${place.name} is the auction house where cars like this sold most often.`,
      numbers: `Of the ${noun} sold at auction in the last ${months} months, ${place.name} sold ${here} of ${total}, the most of any auction house.`,
      figures: `${here} of ${total} sales, last ${months} months` });
  } else if (total && here) {
    const most = here / total >= 0.5;
    out.push({ key: "platform",
      words: most ? `Most ${noun} that sold at auction sold on ${place.name}.` : `More ${noun} sold on ${place.name} than anywhere else.`,
      numbers: `Of the ${noun} sold at auction in the last ${months} months, ${place.name} sold ${here} of ${total}.`,
      figures: `${here} of ${total} sales, last ${months} months` });
  }
  const [ri, rd] = await Promise.all([
    reserveInsightForVehicle(car.v, car.generation, env).catch(() => null),
    reserveDayInsightForVehicle(car.v, car.generation, env).catch(() => null)
  ]);
  if (ri && ri.ok && Number(ri.nReserve) >= 8 && Number(ri.nNoReserve) >= 8) {
    const n = Number(ri.n) || (Number(ri.nReserve) + Number(ri.nNoReserve)), noRes = Number(ri.nNoReserve), pct = Number(ri.deltaPct), N = Math.round(Math.abs(pct));
    const share = noRes / n >= 0.5 ? "Most of these sold with no reserve" : "Most of these sold with a reserve";
    const priceW = Math.abs(pct) < 3 ? "and with or without one they sold for about the same" : pct > 0 ? "and the ones with a reserve sold for more" : "and the ones without a reserve sold for more";
    const priceN = Math.abs(pct) < 3 ? "with and without a reserve they sold within a few points of each other" : `those with a reserve sold ${N}% ${pct > 0 ? "higher" : "lower"} than those without`;
    out.push({ key: "reserve", words: `${share}, ${priceW}.`, numbers: `${noRes} of ${n} sold with no reserve in the last ${ri.windowMonths || 12} months, and ${priceN}.`,
      figures: `${noRes} of ${n} with no reserve; ${Math.abs(pct) < 3 ? "within a few points" : (pct > 0 ? "+" : "-") + N + "% with a reserve"}; last ${ri.windowMonths || 12} months` });
  }
  if (rd && rd.ok && Number.isFinite(Number(rd.weekendPct)) && Number.isFinite(Number(rd.weekdayPct))) {
    const we = Number(rd.weekendPct), wd = Number(rd.weekdayPct), weW = rd.winner !== "weekday";
    out.push({ key: "day", words: weW ? "Weekend endings did better: reserve cars ending at the weekend sold more often." : "Midweek endings did better: reserve cars ending midweek sold more often.",
      numbers: weW ? `Reserve cars like this sold ${we}% of the time ending at the weekend and ${wd}% midweek, from ${rd.sample} auctions.` : `Reserve cars like this sold ${wd}% of the time ending midweek and ${we}% at the weekend, from ${rd.sample} auctions.`,
      figures: `weekend ${we}%, midweek ${wd}%, ${rd.sample} auctions, last ${rd.windowMonths || 24} months` });
  }
  if (place.house && place.next_sale && place.next_sale.month) {
    const ns = place.next_sale;
    const line = `By its published calendar, ${place.name}'s next ${ns.city ? ns.city + " " : ""}sale is in ${ns.month}; confirm the consignment date with ${place.name}.`;
    out.push({ key: "next_sale", words: line, numbers: line, figures: null });
  }
  return out.slice(0, 4);
}

export async function buildResult(env, { carText, state, how }) {
  const sc = await resolveSellCar(carText, env);
  if (!sc.car) return { error: "car" };
  const car = { ...sc.car, env };
  const facts = await sellFactsFor(car);
  const pl = facts.places || {};
  const places = pl.places || [];
  if (!facts.value_usd && pl.total >= 8) facts.value_usd = await poolMedianUsd(car).catch(() => null);
  // The platform: the engine's pick (an explicit auction-house choice honoured when a house is on record).
  let platform = null;
  if (places.length) {
    const place = how === "house" ? (places.find(p => p.house) || places[0]) : places[0];
    const reasons = (await reasonsFor(env, car, pl, place)).filter(r => guardOk(r.words, { pl, r }) && guardOk(r.numbers, { pl, r }));
    platform = { slug: place.slug, name: place.name, house: !!place.house, headline: place.house ? `I'd take it to ${place.name}.` : `I'd sell it on ${place.name}.`, reasons, link: SELL_PAGES[place.slug] || null };
  }
  // The PowerSeller, whenever the partner gate passes for this car and state. TEMP: the Sell engine's
  // powersellersFor + the shared value gate, until Lane B exports the shared evaluatePartnerReferral.
  const ps = await partnerFor(env, car, state, facts).catch(() => null);
  const partner = ps ? { slug: ps.slug, name: ps.name, tempRanking: true,
    what: `${ps.name} can run the whole sale for you: the photographs, the listing, the questions from buyers and the choice of where it sells.`,
    note: ps.specialty ? (/\(per\s/i.test(ps.specialty) ? ps.specialty : `${ps.specialty} (per ${ps.name})`) : null } : null;
  const order = how === "handled" && partner ? ["partner", "platform"] : ["platform", "partner"];
  return { label: car.label, state, how, order, platform, partner,
    empty: !platform && !partner ? "Sam has not seen this car sell yet, so there is no place on record to point to." : null,
    recent: (facts.recent || []).map(r => ({ title: r.title, house: r.house, date: r.date, price: r.price, url: r.url, photo: r.photo })) };
}
