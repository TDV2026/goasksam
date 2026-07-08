// Partner-history backfill. Fills vehicle_market_records with a partner's
// full tracked auction history via their seller usernames, so career-wide
// stats (locked rule 14) rest on real data instead of whatever past searches
// happened to touch.
//
// Two modes, both metered, run probe FIRST and get approval before --run:
//   --probe   2-4 metered requests. Tests whether OldCarsData can filter
//             /auctions by seller username (tries seller_username, seller,
//             then keyword), reports what works, how many records exist and
//             the estimated request cost of a full backfill. Makes NO writes.
//   --run     Executes the backfill plan. Refuses to start if it would push
//             today's metered usage past OCD_DAILY_REQUEST_BUDGET (default
//             33), unless FORCE=1.
//
// Usage:
//   OLDCARSDATA_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/backfillPartnerHistory.js --probe
//   ...same env... node scripts/backfillPartnerHistory.js --run

const OCD_KEY = process.env.OLDCARSDATA_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DAILY_BUDGET = Number(process.env.OCD_DAILY_REQUEST_BUDGET || 33);
const MODE = process.argv.includes("--run") ? "run" : process.argv.includes("--probe") ? "probe" : null;
if (!MODE) { console.error("Pass --probe or --run."); process.exit(1); }
if (!OCD_KEY || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing OLDCARSDATA_API_KEY, SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const SB = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
let meteredUsed = 0;

async function ocd(params) {
  meteredUsed++;
  const url = new URL("https://api.oldcarsdata.com/auctions");
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${OCD_KEY}` } });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

async function sbSelect(pathAndQuery) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, { headers: SB });
  return res.ok ? res.json() : null;
}

async function partnersWithUsernames() {
  const rows = await sbSelect("partners?active=is.true&select=slug,seller_usernames&limit=50") || [];
  return rows.filter(p => (p.seller_usernames || []).length);
}

async function usedToday() {
  const since = new Date(); since.setUTCHours(0, 0, 0, 0);
  const rows = await sbSelect(`app_usage_events?created_at=gte.${since.toISOString()}&oldcarsdata_metered_requests=gt.0&select=oldcarsdata_metered_requests&limit=2000`) || [];
  return rows.reduce((s, r) => s + (Number(r.oldcarsdata_metered_requests) || 0), 0);
}

function sellerOf(record) {
  return String(record.seller_username || record.seller_name || record.seller || record.username || "").toLowerCase();
}

// ---- Probe ----
async function probe() {
  const partners = await partnersWithUsernames();
  const username = partners[0]?.seller_usernames?.[0];
  if (!username) { console.error("No active partner with seller usernames."); process.exit(1); }
  console.log(`Probing seller-filter support with username "${username}" (each attempt = 1 metered request)\n`);

  const attempts = [
    ["seller_username param", { seller_username: username, limit: 50 }],
    ["seller param", { seller: username, limit: 50 }],
    ["keyword param", { keyword: username, limit: 50 }]
  ];
  let working = null;
  for (const [label, params] of attempts) {
    const { ok, status, json } = await ocd(params);
    const rows = json.data || [];
    const matching = rows.filter(r => sellerOf(r) === username.toLowerCase()).length;
    const total = json.meta?.total_results ?? json.meta?.total ?? rows.length;
    console.log(`${label}: http ${status}, ${rows.length} rows returned, ${matching} match the username, reported total ${total}`);
    if (ok && rows.length && matching === rows.length && matching > 0) { working = { label, params: Object.keys(params)[0], total }; break; }
    if (ok && matching > 0 && !working) working = { label, params: Object.keys(params)[0], total, partial: true };
  }

  console.log("");
  if (!working) {
    console.log("VERDICT: no probe attempt returned seller-filtered results.");
    console.log("Backfill ceiling: only records surfaced by normal model searches will ever");
    console.log("accumulate for this partner; career stats stay sparse until OldCarsData");
    console.log("exposes a seller filter.");
  } else {
    const partners2 = await partnersWithUsernames();
    const usernameCount = partners2.reduce((s, p) => s + p.seller_usernames.length, 0);
    const perUsernamePages = Math.max(1, Math.ceil(Number(working.total || 50) / 50));
    // x2: one pass for sold, one with status unfiltered to capture unsold
    // listings (needed for sell-through).
    const estimate = usernameCount * perUsernamePages * 2;
    console.log(`VERDICT: ${working.label} works${working.partial ? " (partially, verify before trusting)" : ""}.`);
    console.log(`Estimated full backfill: ~${estimate} metered requests`);
    console.log(`  (${usernameCount} usernames x ~${perUsernamePages} pages x 2 status passes, ~$${(estimate * 0.049).toFixed(2)} at plan rate)`);
    console.log(`Today's metered usage so far: ${await usedToday()}/${DAILY_BUDGET}`);
    console.log("\nGet approval, then rerun with --run.");
  }
  console.log(`\nProbe spent ${meteredUsed} metered requests.`);
}

// ---- Run ----
async function run() {
  const before = await usedToday();
  if (before >= DAILY_BUDGET && process.env.FORCE !== "1") {
    console.error(`Refusing: today's metered usage ${before} already at/over budget ${DAILY_BUDGET}. Set FORCE=1 to override.`);
    process.exit(1);
  }
  const partners = await partnersWithUsernames();
  const batchId = crypto.randomUUID();
  let inserted = 0;
  for (const partner of partners) {
    for (const username of partner.seller_usernames) {
      for (const statusPass of ["sold", null]) {
        for (let page = 1; page <= 40; page++) {
          if (await usedToday() + meteredUsed - before >= DAILY_BUDGET && process.env.FORCE !== "1") {
            console.error("Daily budget reached mid-run; stopping cleanly. Rerun tomorrow to continue.");
            page = 999; break;
          }
          const { ok, json } = await ocd({ seller_username: username, status: statusPass || undefined, sort: "date", direction: "desc", page, limit: 50 });
          if (!ok) { console.error(`fetch failed for ${username} page ${page}`); break; }
          const rows = (json.data || []).filter(r => sellerOf(r) === username.toLowerCase());
          if (!rows.length) break;
          const payload = rows.map(record => ({
            source: record.platform || record.source || "unknown",
            source_record_id: String(record.id ?? record.source_record_id ?? record.listing_id ?? crypto.randomUUID()),
            source_url: record.url || record.listing_url || null,
            platform: record.platform || record.source || "unknown",
            make: record.ocd_make_name || record.listing_make || null,
            model: record.ocd_model_name || record.listing_model || null,
            year: record.year || null,
            raw_title: record.title || record.listing_title || null,
            price: Number(record.sold_price ?? record.final_price ?? record.price ?? record.current_bid) || null,
            auction_status: record.auction_status || record.status || null,
            auction_end_date: record.auction_end_date || null,
            seller_username: record.seller_username || username,
            raw_record: record,
            ingested_at: new Date().toISOString(),
            ingestion_batch_id: batchId
          }));
          const res = await fetch(`${SUPABASE_URL}/rest/v1/vehicle_market_records?on_conflict=source,source_record_id`, {
            method: "POST",
            headers: { ...SB, "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates,return=minimal" },
            body: JSON.stringify(payload)
          });
          if (!res.ok) console.error(`insert failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
          else inserted += payload.length;
          if (page >= (json.meta?.total_pages || 1)) break;
        }
      }
    }
  }
  await fetch(`${SUPABASE_URL}/rest/v1/app_usage_events`, {
    method: "POST",
    headers: { ...SB, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({
      created_at: new Date().toISOString(),
      event_type: "partner_backfill",
      route: "scripts/backfillPartnerHistory",
      status: "ok",
      oldcarsdata_metered_requests: meteredUsed,
      metadata: { inserted, batchId }
    })
  });
  console.log(`Backfill done: ${inserted} rows upserted, ${meteredUsed} metered requests.`);
}

await (MODE === "probe" ? probe() : run());
