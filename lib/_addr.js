// A person's network address is NEVER stored (Oct 2026, the Privacy promise: "we do not keep your IP address in our
// records and use it only briefly to limit abuse"). Where a limit needs to count by address, it stores only a keyed
// hash whose salt changes every UTC day: today's hash cannot be linked to yesterday's, and every ledger row is
// deleted after 24 hours (lib/_ceilings.js pruneLedger). The secret comes from the environment (ADDRESS_HASH_SECRET,
// else CRON_SECRET, else the service role key) and is never printed.
import crypto from "node:crypto";

const SECRET = () => process.env.ADDRESS_HASH_SECRET || process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const dayOf = t => new Date(t).toISOString().slice(0, 10);
const saltFor = day => crypto.createHmac("sha256", SECRET()).update("address-salt|" + day).digest();
// The address's hash for one UTC day (22 characters, base64url).
export function addressHash(ip, t = Date.now()) {
  if (!ip) return null;
  return crypto.createHmac("sha256", saltFor(dayOf(t))).update(String(ip).trim().toLowerCase()).digest("base64url").slice(0, 22);
}
// Today's hash and yesterday's: a rolling 24 hour count reads both (the salt changes at midnight UTC), and writes
// today's only.
export function addressHashes(ip, t = Date.now()) {
  if (!ip) return [];
  return [addressHash(ip, t), addressHash(ip, t - 864e5)];
}
// For a log or an event that wants to tell callers apart within a day: the same daily hash, never the address.
export const addressTag = (ip, t = Date.now()) => (ip ? "h:" + addressHash(ip, t) : null);
