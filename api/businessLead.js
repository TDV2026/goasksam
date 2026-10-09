// Sam Desk "Request a walkthrough" lead capture (Lane A, Oct 2026). No existing contact form or
// lead path existed anywhere in the codebase for /business - the old button was a bare mailto: link.
// This is the fallback the task spec asked for: a short form, a new small endpoint, a new table
// (docs/supabase-business-leads.sql, RLS on, run once - until then this degrades to the mailto link,
// see api/business.js). Server-only insert (service role key); the browser never gets a table grant.
//
// NOTIFICATION FIX (round 2): the email to LEADS_NOTIFY_EMAIL was previously fired without being
// awaited - sendTaskEmail(...).catch(()=>{}) with no await, immediately followed by the response -
// so the serverless function could (and did) return and freeze before the fetch to Resend ever
// completed. The call is now awaited, and its outcome (ok/error) is recorded on the row itself
// (docs/supabase-business-leads.sql notify_ok/notify_error/notified_at, additive, run once) so a
// missing notification can be found later by reading the table, never by re-diagnosing from scratch.
// The visitor never sees any of this - a failed notification still returns the same success response,
// since the lead (the record of truth) saved regardless.
import { supabaseEnv, supabaseInsert, supabasePatch } from "../lib/_supabase.js";
import { sendTaskEmail } from "../lib/_email.js";

const isEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || ""));
// Project ref from docs/lane-notes.md's confirmed prod ref - a plain link to the table, not a
// row-specific deep link (Supabase's table editor needs the table's internal numeric id for that,
// which this code has no way to know); the lead's own bigint id is named in the email text instead,
// so the row is still findable without a fragile/unverifiable URL.
const SUPABASE_EDITOR_LINK = "https://supabase.com/dashboard/project/otkmxyrglikdoychnmvy/editor";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });
  const env = supabaseEnv();
  if (!env) return res.status(500).json({ ok: false, error: "not configured" });
  const b = req.body || {};
  const name = String(b.name || "").trim().slice(0, 200);
  const company = String(b.company || "").trim().slice(0, 200);
  const email = String(b.email || "").trim().slice(0, 200);
  const message = String(b.message || "").trim().slice(0, 2000);
  if (!name || !isEmail(email)) return res.status(400).json({ ok: false, error: "name and a work email are required" });

  let leadId = null;
  try {
    const ins = await supabaseInsert("business_leads", [{ name, company: company || null, email, message: message || null }],
      env.supabaseUrl, env.supabaseKey, "return=representation", "");
    if (ins.error) throw new Error(ins.error);
    leadId = (ins.rows && ins.rows[0] && ins.rows[0].id) || null;
  } catch (e) {
    console.error("businessLead insert failed:", e && e.message);
    return res.status(500).json({ ok: false, error: "That didn't save. Try again in a moment." });
  }

  const to = String(process.env.LEADS_NOTIFY_EMAIL || "").trim() || "feedback@goasksam.com";
  const leadLine = leadId ? `Lead: ${SUPABASE_EDITOR_LINK} (business_leads, id ${leadId})` : `Lead: ${SUPABASE_EDITOR_LINK} (business_leads)`;
  const lines = [`Name: ${name}`];
  if (company) lines.push(`Company: ${company}`);
  lines.push(`Work email: ${email}`);
  if (message) lines.push(`One line: ${message}`);
  lines.push("", leadLine);

  let sent;
  try { sent = await sendTaskEmail({ to, subject: "New Sam Desk request", text: lines.join("\n") }); }
  catch (e) { sent = { ok: false, error: (e && e.message) || "threw" }; }

  if (leadId) {
    const notifyPatch = { notify_ok: !!sent.ok, notify_error: sent.ok ? null : String(sent.error || sent.reason || "unknown").slice(0, 300), notified_at: new Date().toISOString() };
    await supabasePatch(env, `business_leads?id=eq.${encodeURIComponent(leadId)}`, notifyPatch).catch(e => console.error("businessLead notify-status patch failed (columns may not exist yet, see docs/supabase-business-leads.sql):", e && e.message));
  }
  if (!sent.ok) console.error("businessLead notification failed:", JSON.stringify(sent));

  return res.status(200).json({ ok: true });
}
