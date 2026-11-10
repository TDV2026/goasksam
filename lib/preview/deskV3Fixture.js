// The demonstration case for the Desk v3 preview (Lane E, Nov 8 2026): Lane D's real demonstration case (lib/desk/caseDemo.js, lead HM-24117, a 1999 Porsche 911 Carrera) with the engine block
// Lane B's own function (lib/deskV3.js deskBlock) builds over twelve SAMPLE sales, stored on the case as case.desk the way the Desk stores a read. The assessment and reserve are set through the case's own writers
// (lib/desk/caseWorkflow.js). The sample sales are written here and nothing on the page is typed: every figure the page prints is read from the case or from the desk block.
import { deskBlock, liveOf } from "../deskV3.js";
import { demoCase } from "../desk/caseDemo.js";
import { setAssessment, setReserve, syncNeeds, settle, recallKey } from "../desk/caseWorkflow.js";

import { DEMO_CAR, DEMO_VIN } from "../desk/demoCar.js";
export const DEMO_ID = "pv_hm";
const day = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const SALES = [[1, 58500, 31200], [9, 61200, 24800], [17, 54000, 52100], [26, 57250, 38400], [33, 63000, 19900], [41, 52500, 67300], [52, 59800, 28800], [60, 55500, 44100], [71, 60400, 26500], [83, 56800, 40200], [94, 53250, 58700], [110, 62100, 21300]];
export const DEMO_ROWS = SALES.map(([ago, price, miles], i) => ({ id: "s" + (i + 1), title: "1999 Porsche 911 Carrera", year: 1999, generation: "996", body: "coupe", gearbox: i % 4 === 3 ? "automatic" : "manual", gearboxWord: i % 4 === 3 ? "Tiptronic" : "6-speed manual", miles, platform: ["Bring a Trailer", "Cars & Bids", "PCarMarket"][i % 3], date: day(ago), price, url: "https://example.test/sale/" + (i + 1), photo: null, tier: null, inPopulation: i % 4 !== 3, outReason: i % 4 === 3 ? "transmission" : null }));
const flat = (label, fill) => "data:image/svg+xml;base64," + Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320"><rect width="480" height="320" fill="${fill}"/><text x="20" y="300" font-family="Arial" font-size="18" fill="#fff">${label}</text></svg>`).toString("base64");
// The archive keeps ONE picture per sale, so the first photo is the real listing picture; the second is still a drawn stand-in until a source with more pictures exists (the cover button needs a second photo to show).
export const DEMO_PHOTOS = [{ id: "ph_front", name: "front.jpg", url: DEMO_CAR.photoUrl, from: DEMO_CAR.listingUrl }, { id: "ph_rear", name: "rear.jpg", url: flat("Rear (stand-in)", "#6b6a63"), standIn: true }];

export const DEMO_LIVE = [{ listing_title: "1999 Porsche 911 Carrera", platform: "Bring a Trailer", current_bid_usd: 52000, end_time: "2026-11-20T18:00:00Z", listing_url: "https://example.test/live/1" }, { listing_title: "1999 Porsche 911 Carrera Cabriolet", platform: "Cars & Bids", status: "no sale", current_bid_usd: 47500, listing_url: "https://example.test/live/2" }, { listing_title: "1999 Porsche 911 Carrera", platform: "Hemmings", ask_price_usd: 63500, listing_url: "https://example.test/live/3" }];
export async function demoDesk(now = new Date().toISOString()) { const d = await deskBlock(DEMO_ROWS, { caseDate: now.slice(0, 10), subjectFacts: { year: 1999, generation: "996", body: "coupe", gearbox: "manual", miles: 61200 }, subject: { transmission: "Manual", label: "1999 Porsche 911 Carrera" } }); d.live = liveOf(DEMO_LIVE); return d; }
// the case as the Desk holds it: Lane D's demonstration case, the engine block stored on it, the analyst's decisions set through the case writers
export async function demoCaseRecord(now = new Date().toISOString()) {
  let c = demoCase(now); c.desk = { key: null, ...(await demoDesk(now)) }; c.desk.key = recallKey(c);   // stored under its key, like a read the Desk made: an edit that moves none of the engine's inputs costs no read
  c = setAssessment(c, { figure: 58500, low: 56000, high: 61000, explanation: "" }, now); c = setReserve(c, { figure: 55500, rationale: "" }, now);
  return settle(syncNeeds(c), now);
}

// THE PREVIEW'S STAND-IN FOR THE ENGINE READ, for the demonstration car only. It answers the way the engine's own read does (lib/onebox.js withDesk): the same twelve sample sales, the gearbox the case names and the condition tier it is asked for cut the
// population, and Lane B's deskBlock (the engine's own block builder) makes the evidence, the comparables and the insufficient sentence. Nothing here is computed for the page: a tier with fewer than five sales gets deskBlock's "too few" sentence, not a range.
// The tier of each sample sale is sample data (like the prices); the sales are the same twelve in every tier.
export const DEMO_TIERS = { s1: 3, s2: 3, s3: 2, s4: 3, s5: 3, s6: 2, s7: 3, s8: 2, s9: 3, s10: 2, s11: 4, s12: 4 };
const TIER_NAME = { 1: "Concours", 2: "Excellent", 3: "Good", 4: "Fair" };
const isDemoCar = i => (i.vin && String(i.vin).toUpperCase() === DEMO_VIN) || (Number(i.year) === 1999 && /porsche/i.test(i.make || "") && /^911$/i.test(i.model || "")) || /^\s*1999 porsche 911/i.test(i.text || "");
export async function demoRead(input = {}) {
  if (!isDemoCar(input)) return null;
  const tier = [1, 2, 3, 4].includes(Number(input.tier)) ? Number(input.tier) : null, d = input.desk || {}, manual = !d.transmission || /manual/i.test(d.transmission);
  const rows = DEMO_ROWS.map(r => { const t = DEMO_TIERS[r.id] || null, txOut = d.transmission && r.gearbox && (r.gearbox === "manual") !== manual, tierOut = tier && t !== tier; return { ...r, tier: t, inPopulation: !(txOut || tierOut), outReason: txOut ? "transmission" : tierOut ? "tier" : null }; });
  const desk = await deskBlock(rows, { caseDate: d.caseDate || new Date().toISOString().slice(0, 10), tier, tierName: tier ? TIER_NAME[tier] : null, subject: { transmission: d.transmission || null, label: d.label || null, tierName: tier ? TIER_NAME[tier] : null }, subjectFacts: { year: 1999, generation: "996", body: "coupe", gearbox: manual ? "manual" : "automatic", miles: Number(input.mileage) || null, tier }, exclusions: d.exclusions || [], case: d.case || null });
  desk.live = liveOf(DEMO_LIVE);
  return { car: { decode: { vin: input.vin || DEMO_VIN, year: 1999, make: "Porsche", model: "911", trim: "Carrera", body: "Coupe" } }, desk, exact: { appearances: [], none: null } };
}
