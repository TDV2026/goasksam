// Targeted 180-day share: for each candidate make/model, pull BaT + C&B counts
// from OldCarsData and combine with the cached Hagerty/PCARMarket counts to
// compute true cross-platform share. Only queries the models that could
// plausibly reach 10% (quota-responsible; popular models included to confirm).

import { callOldCarsData } from "../lib/_ocd.js";
import { supabaseEnv, supabaseSelect } from "../lib/_supabase.js";

const env = supabaseEnv();
const KEY = process.env.OLDCARSDATA_API_KEY;
if (!env || !KEY) { console.error("Need SUPABASE + OLDCARSDATA env."); process.exit(1); }
const DAYS = 180;
const cutoff = new Date(Date.now() - DAYS * 86400000);
const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

const candidates = [
  ["Chevrolet", "Corvette"], ["Ford", "Mustang"], ["Chevrolet", "Camaro"], ["Ford", "F-Series"],
  ["Mercedes-Benz", "SL-Class"], ["Ford", "Thunderbird"], ["Pontiac", "Firebird"], ["Jaguar", "XJ"],
  ["Chevrolet", "C/K"], ["Volkswagen", "Beetle"], ["Dodge", "Challenger"], ["Chevrolet", "Chevelle"],
  ["Chevrolet", "Impala"], ["Chevrolet", "3100"],
  ["Porsche", "911"], ["Porsche", "997"], ["Porsche", "991"], ["Porsche", "996"], ["Porsche", "944"],
  ["Porsche", "Cayman"], ["Porsche", "992"], ["Porsche", "718"], ["Porsche", "964"], ["Porsche", "356"]
];

let metered = 0;
async function countModel(source, make, model) {
  let n = 0;
  for (let p = 1; p <= 40; p++) {
    metered++;
    const res = await callOldCarsData("/auctions", { source, make, model, status: "sold", sort: "date", direction: "desc", page: p, limit: 50 }, KEY);
    const rows = res.data || [];
    if (!rows.length) break;
    let oldest = null;
    for (const r of rows) {
      const d = new Date(r.auction_end_date || "");
      if (!Number.isFinite(d.getTime())) continue;
      if (d < oldest || oldest === null) oldest = d;
      if (d >= cutoff && norm(r.ocd_make_name || r.listing_make) === norm(make) && norm(r.ocd_model_name || r.listing_model) === norm(model)) n++;
    }
    if (oldest && oldest < cutoff) break;
    if (p >= (res.meta?.total_pages || 1)) break;
  }
  return n;
}

// cached niche-platform counts (180d already in sales_archive)
async function cachedCount(platform, make, model) {
  const r = await supabaseSelect(env, `sales_archive?platform=eq.${encodeURIComponent(platform)}&make=eq.${encodeURIComponent(make)}&model=eq.${encodeURIComponent(model)}&select=source_id`);
  return (r || []).length;
}

console.log("make/model | BaT | C&B | Hagerty | PCARM | Total | Hagerty% | PCARM% | >10% niche?");
const results = [];
for (const [make, model] of candidates) {
  const bat = await countModel("bringatrailer", make, model);
  const cab = await countModel("carsandbids", make, model);
  const hag = await cachedCount("Hagerty", make, model);
  const pcm = await cachedCount("PCARMarket", make, model);
  const total = bat + cab + hag + pcm;
  const hp = total ? (hag / total * 100) : 0, pp = total ? (pcm / total * 100) : 0;
  const flag = hp >= 10 ? `HAGERTY ${hp.toFixed(1)}%` : pp >= 10 ? `PCARM ${pp.toFixed(1)}%` : "no";
  console.log(`${make} ${model} | ${bat} | ${cab} | ${hag} | ${pcm} | ${total} | ${hp.toFixed(1)}% | ${pp.toFixed(1)}% | ${flag}`);
  results.push({ make, model, bat, cab, hag, pcm, total, hp, pp });
}
console.log(`\nMetered requests: ${metered}`);

// Ready-to-REVIEW WIN_CONDITIONS draft (do NOT paste blindly — routing change).
// A model qualifies only when the niche platform is the #2 platform (beats C&B)
// AND its share is >=10%. Confidence: n>=100 high, 50-100 moderate, <50 low.
// segmentLabel and any yearMax (e.g. air-cooled 911 <=1998) are human judgment.
console.log(`\n// ===== SUGGESTED lib/winConditions.js rows (review before committing) =====`);
console.log(`// Regenerated ${new Date().toISOString().slice(0, 10)} (180-day window).`);
for (const r of results) {
  const nicheIsHag = r.hag >= r.pcm;
  const platform = nicheIsHag ? "hagerty" : "pcarmarket";
  const nicheCount = nicheIsHag ? r.hag : r.pcm, nicheShare = nicheIsHag ? r.hp : r.pp;
  if (nicheShare < 10 || nicheCount <= r.cab) continue; // must beat C&B and clear 10%
  const confidence = r.total >= 100 ? "high" : r.total >= 50 ? "moderate" : "low";
  console.log(`  { make: ${JSON.stringify(r.make)}, model: ${JSON.stringify(r.model)}, platform: ${JSON.stringify(platform)}, share: ${nicheShare.toFixed(1)}, n: ${r.total}, confidence: ${JSON.stringify(confidence)}, segmentLabel: "REVIEW" },`);
}
console.log(`// low-confidence rows (n<50) are emitted above but must stay confidence:"low" (never auto-routed).`);
