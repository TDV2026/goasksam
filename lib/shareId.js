// The share id a stored read hands out before its row is written (Lane B, Oct 31 2026). The first 12 hex digits are the millisecond clock, the rest random, version 7 and variant 8 so the database reads it as a uuid.
// /o/<id> waits for the row only while the id is under a minute old: a made-up id, or an old id whose row is gone, never holds a request.
export function timedShareId(now = Date.now()) {
  const t = now.toString(16).padStart(12, "0"), r = globalThis.crypto.randomUUID().replace(/-/g, "");
  return `${t.slice(0, 8)}-${t.slice(8, 12)}-7${r.slice(0, 3)}-8${r.slice(3, 6)}-${r.slice(6, 18)}`;
}
export function isFreshShareId(id, now = Date.now()) {
  const m = /^([0-9a-f]{8})-([0-9a-f]{4})-7[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/i.exec(String(id));
  if (!m) return false;
  const age = now - parseInt(m[1] + m[2], 16);
  return age >= -5000 && age < 60000;
}
