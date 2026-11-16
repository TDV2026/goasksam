// THE PREVIEW DOOR'S IMAGE FETCH (Lane D, Nov 10 2026, Lane C's hand back: the preview report had no photo because ctxOf passed fetchImage: async () => null, and a function that returns null means "no bytes").
// This fetches the report's pictures (cover, comparables, logo) the way the real Desk does, but only from the listing photo hosts, only over https, with the same 5 second abort, and under the photo rule's size limit (lib/live/photoRule.js: an image, at most 600 KB).
// Anything else answers null, so the report draws its plain band instead of reaching an address nobody listed. A data: picture (an inline logo) is decoded as it is.
import { MAX_PHOTO_BYTES } from "../live/photoRule.js";
import { cachedImage, keepImage, IMG_TIMEOUT, SALE_IMG_TIMEOUT, imageHeaders, IMG_RETRY_WAIT } from "../desk/imageCache.js";
export const PREVIEW_IMAGE_HOSTS = ["bringatrailer.com", "carsandbids.com", "pcarmarket.com", "hagerty.com", "hagertymarketplace.com", "rmsothebys.com", "goodingco.com", "bonhams.com", "mecum.com", "barrett-jackson.com", "collectingcars.com", "carandclassic.com", "hemmings.com", "goasksam.com", "hagerty-marketplace-prod.imgix.net", "broadarrowauctions.com", "sothebysmotorsport.com", "allcollectorcars.com", "pistonheads.com", "themarket.com", "mbmarket.co.uk"];   // every source the engine reads has its photo host here (Nov 16 2026: a sale on a house not listed printed "not available" though the screen showed it)
export const hostAllowed = (h, list = PREVIEW_IMAGE_HOSTS) => list.some(d => h === d || h.endsWith("." + d));
export function previewFetchImage({ fetchImpl, hosts = PREVIEW_IMAGE_HOSTS, timeoutMs = SALE_IMG_TIMEOUT, maxBytes = MAX_PHOTO_BYTES } = {}) {
  return async (url, opts = {}) => {
    const s = String(url || "");
    const d = /^data:image\/[a-z0-9.+-]+;base64,(.*)$/i.exec(s); if (d) return Buffer.from(d[1], "base64");
    let u; try { u = new URL(s); } catch { return null; }
    if (u.protocol !== "https:" || !hostAllowed(u.hostname.toLowerCase(), hosts)) return null;
    if (!fetchImpl) { const hit = cachedImage(s); if (hit) return hit; }   // a check that injects its own fetch is never served from the process cache
    const f = fetchImpl || globalThis.fetch;
    // THE WAY THE SCREEN DOES (Nov 16 2026): a browser's own request headers, a timeout on each try, and ONE retry after a short wait; null only when both tries fail
    for (let attempt = 0; attempt < 2; attempt++) {
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeoutMs);
      try {
        const r = await f(s, { signal: ctl.signal, headers: imageHeaders(opts && opts.referer), redirect: "follow" });
        if (r && r.ok) {
          const type = (r.headers && r.headers.get && r.headers.get("content-type")) || "", len = Number(r.headers && r.headers.get && r.headers.get("content-length"));
          if (!(type && !/^image\//i.test(type)) && !(Number.isFinite(len) && len > maxBytes)) { const b = Buffer.from(await r.arrayBuffer()); if (b.length > 0 && b.length <= maxBytes) return fetchImpl ? b : keepImage(s, b); }
        }
      } catch { /* timed out or refused */ } finally { clearTimeout(t); }
      if (attempt === 0) await new Promise(res => setTimeout(res, IMG_RETRY_WAIT));
    }
    return null;
  };
}
