// Where a person's Task messages go (Oct 2026, Lane C, Sam's decision): THE one place delivery channels are decided.
// Every Task sender (the start email, notify, the combined Task email, Before it ends, the sold-car email) asks this
// for the owner's targets and sends to nothing else. Today there is one channel: email, to the address the sign-in
// provider holds for the account (Supabase Auth, confirmed by the email code or by Google). A typed or stored
// notification address (accounts.task_email, tasks.email, watches.email, buy_alerts.email) is never a target; those
// columns stay as they are and are no longer read for delivery. A text channel can be added here later, from a
// verified phone number only, and every sender picks it up with no change of its own.
const held = new Map();   // userId -> { email, at }: one Auth read per person per 10 minutes on a warm instance
const HOLD_MS = 10 * 60e3;

// The account's own confirmed sign-in address, or null (no account, not confirmed, or the read failed: nothing is sent).
export async function signInEmail(env, userId) {
  if (!userId || !/^[0-9a-f-]{36}$/i.test(String(userId))) return null;
  if (env && env.mem) return (env.mem.authEmails && env.mem.authEmails[userId]) || null;
  const h = held.get(userId);
  if (h && Date.now() - h.at < HOLD_MS) return h.email;
  if (!env || !env.supabaseUrl || !env.supabaseKey) return null;
  const r = await fetch(`${env.supabaseUrl}/auth/v1/admin/users/${userId}`, { headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}` } }).catch(() => null);
  if (!r || !r.ok) return null;   // not held: a failed read is tried again on the next run
  const u = await r.json().catch(() => null);
  const email = u && u.email && (u.email_confirmed_at || u.confirmed_at) ? String(u.email).trim().toLowerCase() : null;
  held.set(userId, { email, at: Date.now() });
  if (held.size > 5000) held.delete(held.keys().next().value);
  return email;
}

// [{ channel: "email", to }] or [] when the account has no confirmed address.
export async function getDeliveryTargets(env, userId) {
  const email = await signInEmail(env, userId);
  return email ? [{ channel: "email", to: email }] : [];
}
// The email target's address, or null.
export const emailOf = targets => ((targets || []).find(t => t.channel === "email") || {}).to || null;
// A probe's test send (api/tasks.js, api/watch.js, api/buySearch.js) goes only to our own inbox, feedback@goasksam.com
// (or a feedback+tag@goasksam.com alias of it); any other address is refused, never a stand-in for a person's.
export const testInbox = to => /^feedback(\+[a-z0-9._-]+)?@goasksam\.com$/i.test(String(to || "").trim()) ? String(to).trim().toLowerCase() : null;
