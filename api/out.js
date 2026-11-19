// Tracked outbound redirect (Part 6). GET /out?p={slug}&s={searchId}&... logs one
// click row, then 302s to the platform's own submission page with opaque referral
// UTMs. It NEVER open-redirects: p must be a known slug (whitelist). Logging is
// best-effort and NEVER blocks the redirect. An abandon beacon (outcome=abandoned
// or beacon=1) logs only and returns 204 with no redirect.
import { isNum } from "../lib/_num.js";
import { supabaseEnv, supabaseInsert } from "../lib/_supabase.js";
import { SUBMISSION_URLS, REFERRAL_UTM } from "../lib/submissionUrls.js";
import { recordJourneyEvent, journeyVehicle } from "../lib/_journey.js";
import { beaconAllowed } from "../lib/_ceilings.js";
import { isSourceUrl, platformKeyFor } from "../lib/outboundUtm.js";
import { track } from "../lib/track/log.js";

function clip(value, max = 160) {
  if (value == null) return null;
  const s = String(value).trim();
  return s ? s.slice(0, max) : null;
}

function withUtm(url) {
  return url + (url.includes("?") ? "&" : "?") + REFERRAL_UTM;
}

export default async function handler(req, res) {
  const q = req.query || {};
  // A Task email's listing link (Lane D, Oct 26 2026): GET /out?l=<the already tagged listing address>&sf=tasks_email. Logs one auction_clickout (best effort, never
  // blocks) and redirects to that same address, utm tags untouched. Only an https link on one of the 19 sources is ever followed; anything else goes home.
  if (q.l != null) {
    const dest = String(q.l);
    if (!isSourceUrl(dest)) { res.setHeader("Location", "/"); res.status(302).end(); return; }
    try { track(req, "auction_clickout", { platform: platformKeyFor(dest), state: "live", surface: "tasks_email" }, { product: "tasks", surface: "email" }); } catch { /* never block the redirect */ }
    res.setHeader("Location", dest);
    res.status(302).end();
    return;
  }
  const slug = String(q.p || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const target = SUBMISSION_URLS[slug];
  const outcome = q.outcome === "abandoned" ? "abandoned" : "continued";
  const beacon = q.beacon === "1" || outcome === "abandoned";

  // Best-effort click log. Any failure (missing table, missing env, network) is
  // swallowed so a logging problem never breaks the seller's redirect.
  try {
    const env = supabaseEnv();
    // Security F-08: past the address ceiling the redirect still happens and no click row is written.
    if (env && await beaconAllowed(env, req, "beacon_out")) {
      const row = {
        search_id: clip(q.s),
        session_id: clip(q.sid),
        platform: slug || clip(q.p),
        card: q.card === "alt" ? "alt" : q.card === "pick" ? "pick" : clip(q.card),
        year: isNum(q.year) ? Number(q.year) : null,
        make: clip(q.make),
        model: clip(q.model),
        trim: clip(q.trim),
        location: clip(q.location),
        landed_rung: clip(q.rung),
        reason: clip(q.reason),
        seller_preference: clip(q.pref),
        outcome
      };
      await supabaseInsert("outbound_clicks", [row], env.supabaseUrl, env.supabaseKey, "return=minimal");
      // Business journey: a REAL platform CTA click (not the abandon beacon). Deduped
      // per (journey, platform, search) so a re-click/refresh is not double counted.
      if (!beacon && q.j) {
        await recordJourneyEvent(env, {
          journeyId: String(q.j), eventType: "platform_cta_clicked",
          anonId: clip(q.a, 64), platformId: slug || clip(q.p, 40),
          dedupKey: `${slug}:${clip(q.s) || ""}`,
          vehicle: journeyVehicle({ year: q.year, make: clip(q.make), model: clip(q.model), trim: clip(q.trim) }, { state: clip(q.location) }),
          metadata: { card: row.card, reason: row.reason, pref: row.seller_preference }
        });
      }
    }
  } catch { /* never block the redirect on a logging failure */ }

  // Abandon beacon: log only, no navigation.
  if (beacon) { res.status(204).end(); return; }
  // Unknown/misconfigured platform: never open-redirect to an arbitrary URL.
  if (!target) { res.setHeader("Location", "/"); res.status(302).end(); return; }
  res.setHeader("Location", withUtm(target));
  res.status(302).end();
}
