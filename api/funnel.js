// Phase 3 / 2F: lightweight funnel beacon for client-only steps (homepage_view,
// wizard_start, wizard_complete, signup_shown). Server-side steps (rec_shown,
// limit_hit, second_search_attempt, signup_completed, hunt_submitted) are logged
// where they happen and never come through here. Fire-and-forget: always 204,
// never blocks the UI. Idempotent where a dedup_key is supplied (11e).
import { supabaseEnv, supabaseInsert } from "../lib/_supabase.js";

const ALLOWED = new Set(["homepage_view", "wizard_start", "wizard_complete", "signup_shown"]);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  // Always answer 204 so a beacon never surfaces an error to the user.
  try {
    const body = typeof req.body === "object" && req.body ? req.body : {};
    const event = String(body.event || "");
    if (ALLOWED.has(event)) {
      const env = supabaseEnv();
      if (env) {
        await supabaseInsert("funnel_events", [{
          event,
          anon_session_id: body.anonSessionId ? String(body.anonSessionId).slice(0, 64) : null,
          user_id: null,
          dedup_key: body.dedupKey ? String(body.dedupKey).slice(0, 128) : null
        }], env.supabaseUrl, env.supabaseKey, "resolution=ignore-duplicates,return=minimal",
          body.dedupKey ? "?on_conflict=event,dedup_key" : "");
      }
    }
  } catch { /* never block */ }
  res.status(204).end();
}
