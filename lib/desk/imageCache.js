// A FETCHED PICTURE IS KEPT FOR A WHILE (order 2318, Nov 14 2026; the draft report on pv_hm took 8.5 s). The report build itself is a few milliseconds; the time was the pictures from the sale sites' CDN (the cover, the comparables' photos, the report photos), fetched again on every preview.
// Only a successful fetch of an https address is kept, for ten minutes, at most 64 of them, in this process. One place for the two doors that fetch (the Desk's own loadImage and the preview's fetch).
const CACHE = new Map(), TTL = 10 * 60 * 1000, MAX = 64;
export const IMG_TIMEOUT = 3000;
// A SALE'S PHOTO IS FETCHED AS A BROWSER WOULD (Nov 16 2026): a browser's user agent, the sale's own page as the referer, an accept of JPEG and PNG (never AVIF or WebP, which the report's PDF writer cannot read), a 6 second timeout on each try and ONE retry after a short wait; only an image answer is taken (an HTML page, an empty body or an error is a failure), and a good picture is kept for a while (keepImage).
export const IMG_HEADERS = { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15", accept: "image/jpeg,image/png;q=0.9,image/*;q=0.5", "accept-language": "en-US,en;q=0.9" };
export const IMG_RETRY_WAIT = 250, IMG_MAX_BYTES = 8 * 1024 * 1024, SALE_IMG_TIMEOUT = 6000;
export const imageHeaders = referer => ({ ...IMG_HEADERS, ...(referer && /^https:\/\//.test(referer) ? { referer } : {}) });
export const looksLikeImage = b => !!b && b.length > 12 && ((b[0] === 0xff && b[1] === 0xd8) || b.slice(1, 4).toString() === "PNG" || b.slice(0, 3).toString() === "GIF" || (b.slice(0, 4).toString() === "RIFF" && b.slice(8, 12).toString() === "WEBP") || b.slice(4, 12).toString() === "ftypavif" || b.slice(4, 8).toString() === "ftyp");
export async function fetchImageBytes(url, { referer = null, timeout = SALE_IMG_TIMEOUT, retries = 1, wait = IMG_RETRY_WAIT } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeout); let status = 0;
    try {
      const r = await fetch(url, { signal: ctl.signal, headers: imageHeaders(referer), redirect: "follow" }); status = r ? r.status : 0;
      if (r && r.ok) { const type = (r.headers && r.headers.get && r.headers.get("content-type")) || "", b = Buffer.from(await r.arrayBuffer()); if (b.length && b.length <= IMG_MAX_BYTES && looksLikeImage(b) && !(type && /^text\/|json|html/i.test(type))) return b; }
    } catch { /* timed out or refused: tried again once */ } finally { clearTimeout(t); }
    if (status === 404 || status === 410) return null;
    if (attempt < retries) await new Promise(res => setTimeout(res, wait));
  }
  return null;
}
export const cachedImage = url => { const h = CACHE.get(url); return h && Date.now() - h.at < TTL ? h.b : null; };
export const keepImage = (url, b) => { if (b && /^https:\/\//.test(String(url || ""))) { CACHE.set(url, { b, at: Date.now() }); if (CACHE.size > MAX) CACHE.delete(CACHE.keys().next().value); } return b; };
export const clearImageCache = () => CACHE.clear();
