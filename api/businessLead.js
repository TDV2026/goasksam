// Sam Desk "Request a walkthrough" lead capture (Lane A, Oct 2026). No existing contact form or
// lead path existed anywhere in the codebase for /business - the old button was a bare mailto: link.
// This is the fallback the task spec asked for: a short form, a new small endpoint, a new table
// (docs/supabase-business-leads.sql, RLS on, run once - until then this degrades to the mailto link,
// see api/business.js). Server-only insert (service role key); the browser never gets a table grant.
import { supabaseEnv, supabaseInsert } from "../lib/_supabase.js";
import { sendTaskEmail } from "../lib/_email.js";

const isEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || ""));

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
  try {
    await supabaseInsert("business_leads", [{ name, company: company || null, email, message: message || null }],
      env.supabaseUrl, env.supabaseKey, "return=minimal", "");
  } catch (e) {
    console.error("businessLead insert failed:", e && e.message);
    return res.status(500).json({ ok: false, error: "That didn't save. Try again in a moment." });
  }
  // Best-effort notification only - the table row above is the record of truth, so a missing
  // RESEND_API_KEY or a send failure never turns a saved lead into a reported failure.
  sendTaskEmail({
    to: "feedback@goasksam.com",
    subject: "Sam Desk walkthrough request",
    text: `${name}${company ? " (" + company + ")" : ""} <${email}>\n\n${message || "(no message)"}`
  }).catch(() => {});
  return res.status(200).json({ ok: true });
}
