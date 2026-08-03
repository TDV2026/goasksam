// Phase 3 / 2A: account bootstrap ("ensure"). The client calls this after a
// successful sign-in (either door). It validates the token, upserts the account
// row (default tier 'free'), and stores the marketing-consent choice captured at
// the sign-in card. Returns the account's public state. Beehiiv tiering (2B) and
// result-claiming (2C) attach to this same endpoint later.
import { validateBearer } from "../lib/_auth.js";
import { supabaseEnv, supabaseSelect, supabaseInsert } from "../lib/_supabase.js";

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function publicAccount(row) {
  return {
    status: "ok",
    email: row.email,
    tier: row.tier || "free",
    bonusSearches: row.bonus_searches || 0,
    marketingConsent: !!row.marketing_consent
  };
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }

  const auth = await validateBearer(req.headers.authorization);
  if (!auth) { res.status(401).json({ status: "auth_required" }); return; }

  const env = supabaseEnv();
  if (!env) { res.status(500).json({ error: "storage not configured" }); return; }

  // Consent is only meaningful when the client explicitly sends it (captured at
  // the sign-in card, applied once the account exists per 11d). Absent => leave
  // whatever is stored; never silently flip an existing opt-in back off.
  const consent = req.body && typeof req.body.marketingConsent === "boolean" ? req.body.marketingConsent : undefined;

  try {
    const existing = await supabaseSelect(env,
      `accounts?user_id=eq.${auth.userId}&select=user_id,email,tier,bonus_searches,marketing_consent,tier_checked_at,created_at&limit=1`);
    const row = existing && existing[0];

    if (!row) {
      const insert = await supabaseInsert("accounts", [{
        user_id: auth.userId,
        email: auth.email,
        tier: "free",
        marketing_consent: consent === true
      }], env.supabaseUrl, env.supabaseKey, "resolution=merge-duplicates,return=representation", "?on_conflict=user_id");
      const created = (insert.rows && insert.rows[0]) ||
        { email: auth.email, tier: "free", bonus_searches: 0, marketing_consent: consent === true };
      res.status(200).json(publicAccount(created));
      return;
    }

    if (consent !== undefined && consent !== row.marketing_consent) {
      await supabaseInsert("accounts", [{
        user_id: auth.userId, email: auth.email, tier: row.tier,
        bonus_searches: row.bonus_searches, marketing_consent: consent,
        tier_checked_at: row.tier_checked_at, created_at: row.created_at
      }], env.supabaseUrl, env.supabaseKey, "resolution=merge-duplicates,return=representation", "?on_conflict=user_id");
      row.marketing_consent = consent;
    }
    res.status(200).json(publicAccount(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
