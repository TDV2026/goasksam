// One server-side check for "this request comes from us" (Oct 2026, open-search policy, spend protection).
// A request counts only when it carries the probe key (PROBE_KEY, or OPS_KEY) in the x-probe-key or x-ops-key
// HEADER, or the cron secret as `Authorization: Bearer <CRON_SECRET>`. Never read from the address or the
// body: a key in an address ends up in logs and histories. Keys are read from the environment only, so a
// rotated key needs no code change.
import crypto from "node:crypto";

function same(a, b) {
  const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || ""));
  return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function hasServerCredential(req) {
  const h = (req && req.headers) || {};
  const probe = process.env.PROBE_KEY, ops = process.env.OPS_KEY, cron = process.env.CRON_SECRET;
  const sent = [h["x-probe-key"], h["x-ops-key"]].filter(Boolean);
  if (sent.some(s => (probe && same(s, probe)) || (ops && same(s, ops)))) return true;
  const auth = String(h.authorization || "");
  return !!(cron && auth.startsWith("Bearer ") && same(auth.slice(7), cron));
}
