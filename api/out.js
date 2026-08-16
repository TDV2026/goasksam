// Tracked outbound redirect (Part 6). GET /out?p={slug}&s={searchId}&... logs one
// click row, then 302s to the platform's own submission page with opaque referral
// UTMs. It NEVER open-redirects: p must be a known slug (whitelist). Logging is
// best-effort and NEVER blocks the redirect. An abandon beacon (outcome=abandoned
// or beacon=1) logs only and returns 204 with no redirect.
import { supabaseEnv, supabaseInsert } from "../lib/_supabase.js";
import { SUBMISSION_URLS, REFERRAL_UTM } from "../lib/submissionUrls.js";
import { recordJourneyEvent, journeyVehicle } from "../lib/_journey.js";

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
  const slug = String(q.p || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const target = SUBMISSION_URLS[slug];
  const outcome = q.outcome === "abandoned" ? "abandoned" : "continued";
  const beacon = q.beacon === "1" || outcome === "abandoned";

  // Best-effort click log. Any failure (missing table, missing env, network) is
  // swallowed so a logging problem never breaks the seller's redirect.
  try {
    const env = supabaseEnv();
    if (env) {
      const row = {
        search_id: clip(q.s),
        session_id: clip(q.sid),
        platform: slug || clip(q.p),
        card: q.card === "alt" ? "alt" : q.card === "pick" ? "pick" : clip(q.card),
        year: Number.isFinite(Number(q.year)) ? Number(q.year) : null,
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
