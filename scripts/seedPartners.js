// Seeds the partners table with the real howS content that previously lived
// hardcoded in index.html. Every claim here is partner_provided: howS emailed
// this information directly. Nothing in this file is market data; data_verified
// stats are computed at request time from vehicle_market_records.
//
// The old frontend also carried three invented placeholder partners (Chris,
// Alex, Morgan). Those were fabrications and are NOT migrated.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run seed:partners

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment.");
  process.exit(1);
}

const provided = text => ({ text, source: "partner_provided" });

const PARTNERS = [
  {
    slug: "hows-motorcars-main-line",
    name: "howS",
    display_name: "howS / Motorcars of the Main Line",
    active: true,
    regions: [
      "Nationwide", "Pennsylvania", "New Jersey", "New York", "Connecticut",
      "Massachusetts", "Maryland", "Virginia", "Washington DC", "East Coast",
      "New England", "Florida", "Texas", "Colorado"
    ],
    specialties: {
      makes: ["Porsche", "Ford", "Ferrari", "BMW", "Mercedes-Benz", "Audi", "Toyota", "Land Rover", "Jaguar"],
      segments: ["air_cooled_porsche", "911", "vintage_mustang", "collector", "performance", "high_value"],
      notes: "Air-cooled Porsche, 911s, vintage Mustangs, unusual automotive items (per howS)",
      source: "partner_provided"
    },
    platforms: [
      { name: "Bring a Trailer", source: "partner_provided" },
      { name: "Cars & Bids", source: "partner_provided" },
      { name: "PCarMarket", source: "partner_provided" },
      { name: "Hemmings", source: "partner_provided" }
    ],
    service_claims: [
      provided("Manages the entire auction: prep, photos, listing, buyer questions, comments, scheduling and paperwork"),
      provided("Recommends the platform before listing rather than assuming one is always right"),
      provided("400+ auctions managed as howS, plus a long Bring a Trailer history under bruce_m"),
      provided("BaT VIP with direct scheduling relationships; Motorcars is a major Cars & Bids seller"),
      provided("Can arrange national transport and shorter-distance flatbed"),
      provided("Based in Upper Makefield PA, with Motorcars of the Main Line in King of Prussia"),
      provided("Fee structure is usually flexible: flat fee, percentage, or incentive depending on the car")
    ],
    seller_usernames: ["howS", "hows", "bruce_m"],
    referral_terms: "howS pays GoAskSam a referral fee if the seller proceeds. Placement cannot be bought; the match is based on fit.",
    min_value_usd: 10000,
    updated_at: new Date().toISOString()
  }
];

const res = await fetch(`${SUPABASE_URL}/rest/v1/partners?on_conflict=slug`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    Prefer: "resolution=merge-duplicates,return=representation"
  },
  body: JSON.stringify(PARTNERS)
});
const text = await res.text();
if (!res.ok) {
  console.error(`partners upsert failed: ${res.status} ${text.slice(0, 400)}`);
  process.exit(1);
}
console.log(`Upserted ${PARTNERS.length} partner(s):`, JSON.parse(text).map(p => p.slug).join(", "));
