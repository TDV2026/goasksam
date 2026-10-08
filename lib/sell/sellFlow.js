// The one-direction Sell (Lane C, Oct 2026, Sam's approved proposal). Behind SELL_NEXT_ON.
// The seller is asked, in this order: the car (typed, or a pasted VIN), narrowing questions ONLY while the
// shared resolver cannot name one specific car (only what is missing: the model, the year, the body
// style), the state, and "How would you like to sell it?". No question asks for or shows a number.
// The result is ONE direction: one place to sell with a plain reason (no figures, no badge, no second
// pick), one link to that place's own selling page, the three latest sales ("Sold $X"), and How Sam
// decides. A PowerSeller is the direction only when the seller asked for someone to handle it and the
// partner gate passes; then nothing else is recommended.
// Every engine read is the shared one: the resolver (lib/vehicle.js, its VIN decode included), the Sell
// facts engine (lib/sell/sellFacts.js: placesFor + its rungs, Lane B's class-era via
// assessClassEraForVehicle, recentSales, powersellersFor) and the value gate (powerSellerValueMet). Every
// sentence the page shows passes the shared guard (lib/live/chatCore.js guardReply) or is not shown.
import { resolveVehicle, sanitizeResolvedVehicle } from "../vehicle.js";
import { resolveSellCar, sellFactsFor, specPool, powersellersFor, parseSellerText, poolMedianUsd } from "./sellFacts.js";
import { guardReply } from "../live/chatCore.js";
import { powerSellerValueMet } from "../../api/sellerDecision.js";
import { supabaseSelect } from "../_supabase.js";

export const STATE_CHIPS = ["California", "Florida", "Texas", "New York", "New Jersey", "Arizona"];
export const HOW_CHIPS = [
  { key: "self", label: "I'll sell it myself" },
  { key: "handled", label: "I'd like someone to handle it" },
  { key: "house", label: "Through an auction house" },
  { key: "unsure", label: "I'm not sure yet" }
];
const STATES = ["Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming"];
// Where each place's OWN selling page is (information, never "start your listing" in Sam's voice).
const SELL_PAGES = {
  bringatrailer: "https://bringatrailer.com/submit-a-vehicle/", carsandbids: "https://carsandbids.com/sell-car-online",
  pcarmarket: "https://www.pcarmarket.com/sell/", hagerty: "https://www.hagerty.com/marketplace/sell", hemmings: "https://www.hemmings.com/auction/sell",
  rmsothebys: "https://rmsothebys.com/en/consign", gooding: "https://www.goodingco.com/consign/", bonhams: "https://www.bonhams.com/department/MOT-CAR/",
  broadarrow: "https://www.broadarrowauctions.com/consign", mecum: "https://www.mecum.com/consign/", barrettjackson: "https://www.barrett-jackson.com/consign"
};
const BODY_RE = { fastback: /\bfastback\b/i, coupe: /\bcoup[eé]\b|\bhardtop\b/i, cabriolet: /\bcabriolet\b/i, convertible: /\bconvertible\b/i, targa: /\btarga\b/i, roadster: /\broadster\b/i, sedan: /\bsedan\b|\bsaloon\b/i, wagon: /\bwagon\b|\bestate\b/i };
const NUMBER = /\d/;
const clean = s => String(s || "").replace(/\s+/g, " ").trim();

// ---------------------------------------------------------------- 1. the car, and only what is missing
// answers: { car: the seller's text, picks: [answers to narrowing questions in order] }.
// Returns { car: {label, text} } once one specific car is named, else { ask: {field, question, chips} }.
export async function identify(env, answers) {
  const base = clean(answers.car);
  const text = clean([base, ...(answers.picks || [])].join(" "));
  const r = await resolveVehicle(text, { vinConfirm: true, supabaseUrl: env.supabaseUrl, supabaseKey: env.supabaseKey }).catch(() => null);
  if (!r) return { ask: { field: "car", question: "Which car is it? The make and model is enough, or paste the VIN.", chips: [] } };
  const cl = r.clarification || null;
  // A VIN that decodes to one specific car is the car; a partial decode or a chassis number asks only
  // for what is missing (the resolver's own question).
  if (cl && cl.kind === "vin_confirmation" && r.vehicle && r.vehicle.make && r.vehicle.model && r.vehicle.year) return named(env, sanitizeResolvedVehicle(r.vehicle) || r.vehicle, text);
  if (r.status === "needs_confirmation" && cl) return { ask: { field: "confirm", question: cl.question, chips: (cl.chips || []).filter(c => !NUMBER.test(c)).slice(0, 6) } };
  if ((r.status === "needs_clarification" || r.status === "invalid_vehicle") && cl && cl.question) {
    const chips = (cl.chips || cl.options || []).filter(c => typeof c === "string" && !/^(not sure|change car|let me type it)$/i.test(c) && !NUMBER.test(c)).slice(0, 8);
    return { ask: { field: cl.kind || "model", question: cl.question, chips } };
  }
  const v = r.vehicle ? (sanitizeResolvedVehicle(r.vehicle) || r.vehicle) : null;
  if (!v || !v.make) return { ask: { field: "car", question: "Which car is it? The make and model is enough, or paste the VIN.", chips: [] } };
  if (!v.model) return { ask: { field: "model", question: `Which ${v.make} is it?`, chips: [] } };
  return named(env, v, text);
}
async function named(env, v, text) {
  // The year, when it is missing: the market moves by generation, so one question for it.
  if (!v.year) return { ask: { field: "year", question: `Which year is the ${v.make} ${v.model}?`, chips: [] } };
  // The body style, only when the record for this car splits between body styles and the seller did not
  // say which (a coupe and a cabriolet are different markets).
  if (!v.bodyStyle) {
    const sc = await resolveSellCar(text, env).catch(() => null);
    if (sc && sc.car) {
      const sp = await specPool({ ...sc.car, env }, 1095).catch(() => null);
      const titles = ((sp && sp.pool) || []).map(r => String(r.raw_title || r.rtitle || ""));
      const counts = Object.entries(BODY_RE).map(([b, re]) => [b, titles.filter(t => re.test(t)).length]).filter(([, n]) => n >= 3);
      const total = titles.length;
      const real = counts.filter(([, n]) => total && n / total >= 0.15);
      if (real.length >= 2) return { ask: { field: "body", question: `Is it a ${real.map(([b]) => b).join(" or a ")}?`, chips: real.map(([b]) => b[0].toUpperCase() + b.slice(1)) } };
    }
  }
  const label = [v.year, v.make, v.model, v.trim, v.bodyStyle].filter(Boolean).join(" ");
  return { car: { label, text: clean(`${label}`) } };
}

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

export async function buildResult(env, { carText, state, how }) {
  const sc = await resolveSellCar(carText, env);
  if (!sc.car) return { error: "car" };
  const car = { ...sc.car, env };
  const facts = await sellFactsFor(car);
  const pl = facts.places || {};
  const places = pl.places || [];
  // The value for the partner gate: the median of the engine's own pool (computed in sellFacts).
  if (!facts.value_usd && facts.places && facts.places.total >= 8) facts.value_usd = await poolMedianUsd(car).catch(() => null);
  const make = car.v.make;
  let rec = null;
  if (how === "handled") {
    const ps = await partnerFor(env, car, state, facts);
    if (ps) {
      const why = `${ps.name} can run the whole sale for you: the photographs, the listing, the questions from buyers and the choice of where it sells.`;
      // The partner's own words, attributed once (some notes already carry "(per ...)").
      const note = ps.specialty ? (/\(per\s/i.test(ps.specialty) ? ps.specialty : `${ps.specialty} (per ${ps.name})`) : null;
      rec = { kind: "powerseller", slug: ps.slug, name: ps.name, headline: `I'd hand it to ${ps.name}.`, why: guardOk(why, facts) ? why : null, note: note && !NUMBER.test(note) ? note : null };
    }
  }
  if (!rec && places.length) {
    // An explicit auction-house choice is honoured when a house is on the record for this car.
    const place = how === "house" ? (places.find(p => p.house) || places[0]) : places[0];
    let why = placeWhy(pl.step, place, pl.cohort_noun, make);
    // No figures: a digit is allowed only inside the car's own name ("997 Carrera S coupes").
    const figures = why.replace(String(pl.cohort_noun || ""), "").replace(String(place.name || ""), "");
    if (!guardOk(why, facts) || NUMBER.test(figures)) why = `${place.name} is where cars like this have sold.`;
    rec = { kind: "place", slug: place.slug, name: place.name, house: !!place.house, headline: `I'd sell it on ${place.name}.`.replace(/^I'd sell it on (RM Sotheby's|Gooding|Bonhams|Broad Arrow|Mecum|Barrett-Jackson)/, "I'd take it to $1"),
      why: guardOk(why, facts) ? why : null, link: SELL_PAGES[place.slug] || null };
  }
  if (!rec) rec = { kind: "none", headline: "Sam has not seen this car sell yet.", why: "There are no recorded auction sales of this car or its close relatives to point to one place." };
  return { label: car.label, state, how, rec, recent: (facts.recent || []).map(r => ({ title: r.title, house: r.house, date: r.date, price: r.price, url: r.url, photo: r.photo })) };
}
