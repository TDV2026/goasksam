// Road-type classification for the VIN index + sitemaps (Oct 2026). ONE source of truth used by
// buildVinIndex (what goes in vin_summary), api/history.js rollout (which sitemap a VIN lands in) and
// carPage (index + page wording), so the three never disagree.
//
//   classifyRoad -> "car" | "motorcycle" | "other" | "nonroad"
//     car        : cars + trucks (self-propelled road vehicles)   -> sitemap-vins.xml
//     motorcycle : motorcycles                                    -> sitemap-motorcycles.xml
//     other      : other SELF-PROPELLED (tractor, golf cart, ATV/UTV, RV/motorhome, military) -> sitemap-other.xml
//     nonroad    : NOT self-propelled (boat, aircraft, standalone trailer/caravan, memorabilia,
//                  parts, loose engine) -> excluded from vin_summary + every sitemap, page noindex
//
// The non-road detector is the one Sam approved from the nonroadpreview dry run. Guards: replica/
// recreation/tribute/continuation/evocation = a car; ignore everything after "with"/"w/" for the
// standalone signals; self-propelled keywords always stay; model/body names never count (boat-tail,
// runabout, Neon, Quad Cab, "car"); memorabilia only on the article/quantity opener basis; boat/
// aircraft/trailer only when NO car make resolves.
import { classifyUnknown, typeByMake } from "./_unknownClassify.js";

const REPLICA = /\b(replica|recreation|re-creation|tribute|continuation|evocation|homage|in the style of|-style\b|style\s+(?:tourer|roadster|saloon))\b/i;
const SELFPROP = /\b(motor\s?home|motor\s?coach|motor[-\s]?caravan|dormobile|\brv\b|camper\s?van|unimog|tractor|golf\s?cart|\batv\b|\butv\b|\brzr\b|side[-\s]?by[-\s]?side|snowmobile|ski[-\s]?doo|motorcycle|scooter|moped|quad\s?cab|peterbilt|kenworth|freightliner|\bmack\b)\b/i;
const BOAT = /\b(boat|yacht|sailboat|catamaran|chris[-\s]?craft|correct[-\s]?craft|outboard\s+boat)\b/i;
const BOAT_FALSE = /\bboat[-\s]?tail\b|\bboattail\b|\brunabout\b|\bcar\b/i;
const AIRCRAFT = /\b(airplane|aeroplane|aircraft|helicopter|biplane|warbird|glider|cessna|beechcraft)\b/i;
const AIRCRAFT_FALSE = /aircraft[-\s]?themed|\bcar\b/i;
const TRAILER = /\b(trailer|caravan|teardrop|fifth[-\s]?wheel|toy\s?hauler|land\s?yacht)\b/i;
const LOOSE_PART = /\b(engine\s+(?:and|&|\+)\s+(?:gear\s?box|transmission)|bare\s+engine|complete\s+engine|engine\s+block|rolling\s+chassis|body\s?shell|chassis\s+only|pair\s+of\s+(?:wheels|doors|seats|lamps|lights|headlamps|bumpers|fenders)|set\s+of\s+(?:wheels|seats))\b/i;

// Returns the non-road reason ("boat" | "aircraft" | "trailer" | "memorabilia") or null when the title
// is a road vehicle (car/truck/motorcycle/other self-propelled). Shared by isNonRoad and any caller
// (the Market Check entry-point gate) that wants to name the thing in plain words.
export function nonRoadReason(title) {
  const t = String(title || "");
  if (!t) return null;
  if (REPLICA.test(t)) return null;         // a replica / tribute / continuation is a car
  if (SELFPROP.test(t)) return null;        // self-propelled stays (other / motorcycle)
  const base = t.split(/\s+w\/|\bwith\b/i)[0];   // the lot is the vehicle; ignore what follows "with"
  const cu = classifyUnknown({ listing_title: t }) || {};
  const hasYear = /\b(?:18|19|20)\d{2}\b/.test(t);
  // memorabilia only on the article/quantity opener ("A pair of...", "An ... book"); the broad
  // non_vehicle verdict over-matches catalog cars on "Engine no."/"Trophy"/"Badge".
  const opener = cu.vehicle_type === "non_vehicle" && /opener/i.test(String(cu.basis || ""));
  const loosePart = !hasYear && LOOSE_PART.test(base);
  if (opener || loosePart) return "memorabilia";
  if (!cu.make) {                           // boat/aircraft/trailer only when NO car make resolves
    if (BOAT.test(base) && !BOAT_FALSE.test(base)) return "boat";
    if (AIRCRAFT.test(base) && !AIRCRAFT_FALSE.test(base)) return "aircraft";
    if (TRAILER.test(base)) return "trailer";
  }
  return null;
}
export function isNonRoad(title) { return nonRoadReason(title) != null; }

export function classifyRoad({ title, vehicleType, make } = {}) {
  if (isNonRoad(title)) return "nonroad";
  const st = String(vehicleType || "").toLowerCase();
  if (st === "non_vehicle") return "nonroad";        // already-vetted memorabilia/parts
  if (st === "motorcycle") return "motorcycle";
  if (st === "other") return "other";
  // classify on the base (before "with"/"w/") so a towed accessory never retypes the vehicle.
  const base = String(title || "").split(/\s+w\/|\bwith\b/i)[0];
  const cu = classifyUnknown({ listing_title: base }) || {};
  if (cu.vehicle_type === "motorcycle") return "motorcycle";
  if (cu.vehicle_type === "other") return "other";   // do NOT trust cu non_vehicle here (isNonRoad already took the safe cases)
  const bm = typeByMake(make);
  if (bm === "motorcycle") return "motorcycle";
  if (bm === "other") return "other";
  return "car";
}
