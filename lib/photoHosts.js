// A DEAD PHOTO HOST IS NEVER HANDED TO A PAGE (Lane B, Oct 29 2026). pushCheck found the 1995 Porsche 911 Carrera Market Check page carrying a 993 Cabriolet sale photo on d2niwqq19lf86s.cloudfront.net, which no longer resolves, so the card showed a broken image.
// CAUSE: the archive keeps the photo URL it was given at ingest; nothing asked whether the host still exists, and stored answers keep the URL they were built with. FIX: data/deadPhotoHosts.json lists hosts that fail DNS; every answer the engine serves
// (withReadFields, so stored rows too) and every Find card has any photo on those hosts set to null, and the card shows its no-photo slot. The sale stays in the pool and the range: only the picture goes.
import fs from "node:fs";
let HOSTS = null;
function hosts() {
  if (HOSTS) return HOSTS;
  try { HOSTS = new Set((JSON.parse(fs.readFileSync(new URL("../data/deadPhotoHosts.json", import.meta.url), "utf8")).hosts || []).map(h => String(h.host).toLowerCase())); } catch { HOSTS = new Set(); }
  return HOSTS;
}
export function hostOf(url) { try { return new URL(String(url)).hostname.toLowerCase(); } catch { return ""; } }
export function photoHostDead(url) { const h = hostOf(url); return !!h && hosts().has(h); }
export const photoOrNull = url => (typeof url === "string" && url && !photoHostDead(url)) ? url : (typeof url === "string" && url ? null : url);
const PHOTO_KEY = /(image|photo|img|thumb)/i;   // any property that names a picture (image, photo, photo_url, photos, extraPhoto, bandPhoto, img...)
const isUrl = x => typeof x === "string" && /^https?:\/\//i.test(x);
// a copy of the value with every photo on a dead host set to null (a list of photos loses the dead ones); arrays and objects walked, nothing else touched. Returns the same object when nothing changed.
export function scrubDeadPhotos(v, depth = 0, key = "") {
  if (depth > 8 || v == null) return v;
  if (typeof v === "string") return PHOTO_KEY.test(key) && isUrl(v) ? photoOrNull(v) : v;
  if (typeof v !== "object") return v;
  if (Array.isArray(v)) {
    if (PHOTO_KEY.test(key) && v.some(isUrl)) { const kept = v.filter(x => !(isUrl(x) && photoHostDead(x))); return kept.length === v.length ? v : kept; }
    let out = null; for (let i = 0; i < v.length; i++) { const n = scrubDeadPhotos(v[i], depth + 1, key); if (n !== v[i]) { if (!out) out = v.slice(); out[i] = n; } } return out || v;
  }
  let out = null;
  for (const k of Object.keys(v)) { const x = v[k], n = scrubDeadPhotos(x, depth + 1, k); if (n !== x) { if (!out) out = { ...v }; out[k] = n; } }
  return out || v;
}
