// Phase 3 / 2E: the hunt door. A signed-in account tells Sam what it's hunting;
// we store it (demand capture only - no matching, no results, no timing promise).
// Available to every signed-in account.
import { validateBearer } from "../lib/_auth.js";
import { supabaseEnv, supabaseInsert } from "../lib/_supabase.js";
import { cors as gasCors } from "../lib/_cors.js";
import { failBody } from "../lib/_fail.js";

// One CORS helper (lib/_cors.js, security F-06): only GoAskSam's own hosts get a cross-origin answer.
function cors(res, req) { gasCors(req || { headers: {} }, res, { methods: "POST, OPTIONS", headers: "Content-Type, Authorization" }); }

async function funnel(env, event, fields) {
  try {
    await supabaseInsert("funnel_events", [{
      event, anon_session_id: fields.anon_session_id || null, user_id: fields.user_id || null, dedup_key: fields.dedup_key || null
    }], env.supabaseUrl, env.supabaseKey, "resolution=ignore-duplicates,return=minimal", fields.dedup_key ? "?on_conflict=event,dedup_key" : "");
  } catch {}
}

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }

  const auth = await validateBearer(req.headers.authorization);
  if (!auth) { res.status(401).json({ status: "auth_required" }); return; }

  const text = String((req.body && req.body.text) || "").trim().slice(0, 2000);
  if (!text) { res.status(400).json({ error: "empty" }); return; }

  const env = supabaseEnv();
  if (!env) { res.status(500).json({ error: "storage not configured" }); return; }

  try {
    const ins = await supabaseInsert("hunts", [{ user_id: auth.userId, text }],
      env.supabaseUrl, env.supabaseKey, "return=representation", "");
    const id = ins.rows && ins.rows[0] && ins.rows[0].id;
    // hunt_submitted funnel event, deduped by the hunt id (11e).
    if (id) await funnel(env, "hunt_submitted", { user_id: auth.userId, dedup_key: `hunt:${id}` });
    res.status(200).json({ status: "ok", id: id || null });
  } catch (err) {
    res.status(500).json(failBody("hunts", err));
  }
}
