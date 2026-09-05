// Phase 3 / 2A: public front-end config. Returns the Supabase URL + ANON key so
// js/auth.js can talk to GoTrue (Supabase Auth) directly. The anon key is public
// by design (protected by RLS); serving it from env keeps it out of the repo and
// lets the frontend stay in sync with the deployed project. No secrets here.
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, max-age=300");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  const supabaseUrl = process.env.SUPABASE_URL || null;
  const anonKey = process.env.SUPABASE_ANON_KEY || null;
  // Optional custom auth domain (e.g. https://auth.goasksam.com). When set, the frontend
  // routes the Google OAuth authorize + magic-link through it so the consent screen and
  // email links read as goasksam.com instead of the raw <ref>.supabase.co. UNSET = byte-
  // identical to today (falls back to supabaseUrl), so this ships dark and the cutover is
  // a single env flip with instant rollback (unset it). The data API stays on SUPABASE_URL.
  const authUrl = process.env.SUPABASE_AUTH_URL || null;
  if (!supabaseUrl || !anonKey) { res.status(500).json({ error: "auth not configured" }); return; }
  res.status(200).json({ supabaseUrl, anonKey, authUrl });
}
