// THE PREVIEW DOOR'S IMAGE FETCH (Lane D, Nov 10 2026, Lane C's hand back: the preview report had no photo because ctxOf passed fetchImage: async () => null, and a function that returns null means "no bytes").
// This fetches the report's pictures (cover, comparables, logo) the way the real Desk does, but only from the listing photo hosts, only over https, with the same 5 second abort, and under the photo rule's size limit (lib/live/photoRule.js: an image, at most 600 KB).
// Anything else answers null, so the report draws its plain band instead of reaching an address nobody listed. A data: picture (an inline logo) is decoded as it is.
import { MAX_PHOTO_BYTES } from "../live/photoRule.js";
export const PREVIEW_IMAGE_HOSTS = ["bringatrailer.com", "carsandbids.com", "pcarmarket.com", "hagerty.com", "hagertymarketplace.com", "rmsothebys.com", "goodingco.com", "bonhams.com", "mecum.com", "barrett-jackson.com", "collectingcars.com", "carandclassic.com", "hemmings.com", "goasksam.com"];
export const hostAllowed = (h, list = PREVIEW_IMAGE_HOSTS) => list.some(d => h === d || h.endsWith("." + d));
export function previewFetchImage({ fetchImpl, hosts = PREVIEW_IMAGE_HOSTS, timeoutMs = 5000, maxBytes = MAX_PHOTO_BYTES } = {}) {
  return async url => {
    const s = String(url || "");
    const d = /^data:image\/[a-z0-9.+-]+;base64,(.*)$/i.exec(s); if (d) return Buffer.from(d[1], "base64");
    let u; try { u = new URL(s); } catch { return null; }
    if (u.protocol !== "https:" || !hostAllowed(u.hostname.toLowerCase(), hosts)) return null;
    const f = fetchImpl || globalThis.fetch, ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const r = await f(s, { signal: ctl.signal }); if (!r || !r.ok) return null;
      const type = (r.headers && r.headers.get && r.headers.get("content-type")) || ""; if (type && !/^image\//i.test(type)) return null;
      const len = Number(r.headers && r.headers.get && r.headers.get("content-length")); if (Number.isFinite(len) && len > maxBytes) return null;
      const b = Buffer.from(await r.arrayBuffer()); return b.length > 0 && b.length <= maxBytes ? b : null;
    } catch { return null; } finally { clearTimeout(t); }
  };
}
