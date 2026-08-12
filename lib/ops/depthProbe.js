// Depth-probe CORE, shared by the CLI (scripts/depthProbe.js) and the web trigger
// (api/usageDashboard.js ?view=ops&task=probe). It performs a REPORT-ONLY sold
// census across OldCarsData platforms (platform x market x window sold counts) and
// NEVER writes to the archive/classifications. The caller owns budget reads, the
// report file, the usage event and any console output; this module just runs the
// census and returns the report object. Metered endpoint is /auctions only.
import { callOldCarsData } from "../_ocd.js";

// Integrated today (we ingest these). Slugs proven against OCD in lib/_ocd.js callers.
export const INTEGRATED = {
  bringatrailer: "Bring a Trailer", carsandbids: "Cars & Bids", hagerty: "Hagerty Marketplace",
  pcarmarket: "PCARMarket", acc: "All Collector Cars", gooding: "Gooding & Co",
  rmsothebys: "RM Sotheby's", sothebysmotorsport: "Sotheby's Motorsport", autohunter: "AutoHunter",
  hemmings: "Hemmings"
};
// Not integrated yet - candidate slugs (BEST-GUESS: OCD has no source-listing
// endpoint, so the run itself validates them; a slug that returns nothing is a
// coverage finding, not a silent drop).
export const CANDIDATE = {
  mbmarket: "MB Market", pistonheads: "PistonHeads", themarket: "The Market",
  carandclassic: "Car & Classic", collectingcars: "Collecting Cars", bonhams: "Bonhams",
  bonhamscars: "Bonhams Cars", mecum: "Mecum", barrettjackson: "Barrett-Jackson",
  silverstoneauctions: "Silverstone Auctions", historics: "Historics", classiccarauctions: "Classic Car Auctions",
  broadarrow: "Broad Arrow", artcurial: "Artcurial", bonhamsmph: "Bonhams | MPH"
};
export const ALL = { ...INTEGRATED, ...CANDIDATE };
// The US-launch default set for the web trigger: the 8 launch platforms, ordered
// launch-priority FIRST. A bounded probe (a request ceiling) validates the
// never-fetched candidates (MB Market, AutoHunter) and the sparser platforms before
// the dense giants (Cars & Bids, Bring a Trailer) would consume the whole budget.
export const LAUNCH_SOURCES = [
  "mbmarket", "autohunter", "sothebysmotorsport", "hemmings",
  "hagerty", "pcarmarket", "carsandbids", "bringatrailer"
];

export const MARKET_BUCKETS = ["US", "UK", "EU", "CA", "AU", "Other", "Unknown"];
const LOC_FIELDS = ["country", "listing_country", "seller_country", "auction_country", "location_country",
  "location", "seller_location", "region", "market", "sale_location"];
export function marketOf(r) {
  let raw = "";
  for (const f of LOC_FIELDS) { const v = r && r[f]; if (v != null && String(v).trim()) { raw = String(v).trim(); break; } }
  const l = raw.toLowerCase();
  if (!l) return "Unknown";
  if (/\b(usa|u\.s\.a|united states|u\.s\.|\bus\b|america|american)\b/.test(l) || /,\s*[a-z]{2}\s*\d{5}/.test(l)) return "US";
  if (/\b(uk|u\.k\.|united kingdom|england|scotland|wales|northern ireland|britain|british|gb)\b/.test(l)) return "UK";
  if (/\b(canada|canadian|ontario|quebec|alberta|british columbia)\b/.test(l)) return "CA";
  if (/\b(australia|australian|nsw|victoria|queensland|new zealand)\b/.test(l)) return "AU";
  if (/\b(germany|france|italy|spain|netherlands|belgium|switzerland|sweden|austria|portugal|ireland|denmark|norway|finland|poland|europe|european|monaco)\b/.test(l)) return "EU";
  if (/^[a-z]{2}$/.test(l) && "al ak az ar ca co ct de fl ga hi id il in ia ks ky la me md ma mi mn ms mo mt ne nv nh nj nm ny nc nd oh ok or pa ri sc sd tn tx ut vt va wa wv wi wy dc".split(" ").includes(l)) return "US";
  return "Other";
}

const toDate = v => { const d = new Date(v || ""); return Number.isFinite(d.getTime()) ? d : null; };
const daysAgo = n => new Date(Date.now() - n * 86400000);

// Run the census. Options:
//   apiKey       (required) OldCarsData key
//   sources      array of source slugs (default LAUNCH_SOURCES)
//   windows      array of window-day numbers (default [45,90,180])
//   maxRequests  hard ceiling of metered /auctions calls (default 40)
//   pageLimit    page size (default 50)
//   budgetLeft   remaining daily OCD budget in requests (default Infinity)
//   log          progress callback (default noop)
// Returns the report object: { generatedAt, windows, widestDays, markets,
//   meteredRequests, sources:[{source,label,integrated,totalSold,...,counts}], ukPool }.
export async function runDepthProbe({ apiKey, sources, windows, maxRequests = 40, pageLimit = 50, budgetLeft = Infinity, log = () => {} } = {}) {
  if (!apiKey) throw new Error("runDepthProbe needs an OldCarsData apiKey.");
  const SOURCES = (Array.isArray(sources) && sources.length) ? sources : LAUNCH_SOURCES.slice();
  const WINDOWS = ((Array.isArray(windows) && windows.length) ? windows : [45, 90, 180]).map(Number).filter(n => n > 0).sort((a, b) => a - b);
  const WIDEST = WINDOWS[WINDOWS.length - 1];
  const MAX = Math.max(1, Number(maxRequests) || 40);
  const counts = {}; const meta = {}; let metered = 0;
  const cutoff = daysAgo(WIDEST);
  // Pre-initialize EVERY source up front so a probe that stops early (max_requests,
  // budget or rate limit) still returns a complete, crash-free report: unreached
  // sources render as empty rather than leaving meta[s]/counts[s] undefined (which
  // the post-loop ukPool/report construction would then read .label off of).
  for (const source of SOURCES) {
    counts[source] = {}; MARKET_BUCKETS.forEach(m => { counts[source][m] = {}; WINDOWS.forEach(w => counts[source][m][w] = 0); });
    meta[source] = { label: ALL[source] || source, integrated: !!INTEGRATED[source], totalSold: 0, pagesRead: 0, sawData: false, oldestSeen: null, note: null };
  }
  let stoppedEarly = null;
  const stopBudget = () => {
    if (metered >= MAX) return "max_requests";
    if (budgetLeft !== Infinity && metered >= budgetLeft) return "daily_budget";
    return null;
  };

  outer:
  for (const source of SOURCES) {
    const label = meta[source].label;
    for (let p = 1; p <= 10000; p++) {
      const reason = stopBudget();
      if (reason) { meta[source].note = `stopped: ${reason}`; stoppedEarly = reason; log(`[budget] ${reason} at ${metered} request(s)`); break outer; }
      metered++;
      let res;
      try {
        res = await callOldCarsData("/auctions", { source, status: "sold", sort: "date", direction: "desc", page: p, limit: pageLimit }, apiKey);
      } catch (e) {
        meta[source].note = `error p${p}: ${e.message}`;
        if (e.rateLimited) { stoppedEarly = "ratelimit"; log(`[ratelimit] ${label} p${p}: ${e.message}`); break outer; }
        break;
      }
      const rows = res.data || [];
      if (!rows.length) break;
      meta[source].sawData = true; meta[source].pagesRead = p;
      let oldest = null;
      for (const r of rows) {
        const d = toDate(r.auction_end_date);
        if (d && (!oldest || d < oldest)) oldest = d;
        if (!d || d < cutoff) continue;
        const mk = marketOf(r);
        meta[source].totalSold++;
        for (const w of WINDOWS) { if (d >= daysAgo(w)) counts[source][mk][w]++; }
      }
      if (oldest) meta[source].oldestSeen = (!meta[source].oldestSeen || oldest < new Date(meta[source].oldestSeen)) ? oldest.toISOString().slice(0, 10) : meta[source].oldestSeen;
      if (oldest && oldest < cutoff) break;
      if (p >= (res.meta?.total_pages || 1)) break;
    }
    if (!meta[source].sawData) meta[source].note = meta[source].note || "no data (unknown slug or empty)";
    log(`${label}: ${meta[source].totalSold} sold in last ${WIDEST}d${meta[source].note ? ` (${meta[source].note})` : ""}`);
  }

  // Any source the early stop never reached keeps its pre-init'd empty entry; label
  // it so the report is honest about partial coverage.
  if (stoppedEarly) for (const s of SOURCES) { if (!meta[s].sawData && meta[s].note === null) meta[s].note = `not reached (stopped: ${stoppedEarly})`; }

  const ukPool = SOURCES
    .map(s => ({ label: meta[s].label, source: s, integrated: meta[s].integrated, uk: counts[s].UK[WIDEST] }))
    .filter(x => x.uk > 0).sort((a, b) => b.uk - a.uk);

  return {
    generatedAt: new Date().toISOString(), windows: WINDOWS, widestDays: WIDEST, markets: MARKET_BUCKETS,
    meteredRequests: metered, budgetLeftAtStart: budgetLeft === Infinity ? null : budgetLeft, maxRequests: MAX,
    sources: SOURCES.map(s => ({ source: s, ...meta[s], counts: counts[s] })),
    ukPool
  };
}
