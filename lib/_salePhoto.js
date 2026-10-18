// THE DEMO'S SALE PHOTO (Sam, Oct 18 2026; partner demo only, served by api/partnerAnswer.js at /api/partnerAnswer?photo=<id>).
// The page names a sale by its archive id and nothing else. The photo's address is looked up here, server side, with
// one primary-key read of sales_archive, fetched with a short deadline, and streamed back with no trace of where it
// came from: no address, no venue name, no venue header. Anything that is not a clean image within the limits is a
// plain refusal, and the page shows its neutral tile instead.
import net from "node:net";
import { supabaseSelect } from "./_supabase.js";

export const PHOTO_TIMEOUT_MS = 4000;
export const PHOTO_MAX_BYTES = 4 * 1024 * 1024;
const IMAGE_TYPES = /^image\/(jpeg|png|webp|gif|avif)$/i;

// Only a plain archive id: the archive's UUID (or a plain number), nothing else (never an address, a host or a path).
// Oct 18 2026: sales_archive ids are UUIDs; a digits-only check refused every one and the live list showed no photos.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function photoId(v) {
  const s = String(v == null ? "" : v).toLowerCase();
  return UUID_RE.test(s) || /^\d{1,15}$/.test(s) ? s : null;
}

// The stored address must be an ordinary https address on a public host name: no credentials, no port, no IP
// literal, no local or internal name.
export function safeImageUrl(raw) {
  let u;
  try { u = new URL(String(raw || "")); } catch { return null; }
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return null;
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!h.includes(".") || net.isIP(h) || /(^|\.)(localhost|local|internal|lan|home|corp)$/.test(h)) return null;
  return u;
}

// The one read: the photo address of exactly this archive row.
export async function photoUrlFor(env, id) {
  const rows = await supabaseSelect(env, `sales_archive?id=eq.${id}&select=image:raw_record->>featured_image_url&limit=1`);
  const raw = rows && rows[0] && rows[0].image;
  return raw ? safeImageUrl(raw) : null;
}

// Fetch with the deadline and the size cap; a redirect is followed (at most twice) only to the same host.
export async function fetchPhoto(url, { timeoutMs = PHOTO_TIMEOUT_MS, maxBytes = PHOTO_MAX_BYTES, fetchImpl = fetch } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    let cur = url;
    for (let hop = 0; hop < 3; hop++) {
      const r = await fetchImpl(cur.href, { redirect: "manual", signal: ctl.signal, headers: { accept: "image/avif,image/webp,image/jpeg,image/png,image/gif" } });
      if (r.status >= 300 && r.status < 400) {
        const next = r.headers.get("location") ? safeImageUrl(new URL(r.headers.get("location"), cur).href) : null;
        if (!next || next.hostname !== url.hostname) return null;
        cur = next; continue;
      }
      if (r.status !== 200) return null;
      const type = String(r.headers.get("content-type") || "").split(";")[0].trim();
      if (!IMAGE_TYPES.test(type)) return null;
      const len = Number(r.headers.get("content-length"));
      if (Number.isFinite(len) && len > maxBytes) return null;
      const reader = r.body && r.body.getReader ? r.body.getReader() : null;
      if (!reader) return null;
      const parts = []; let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) { ctl.abort(); return null; }
        parts.push(Buffer.from(value));
      }
      return size ? { type: type.toLowerCase(), body: Buffer.concat(parts) } : null;
    }
    return null;
  } catch { return null; } finally { clearTimeout(t); }
}
