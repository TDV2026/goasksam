// A FETCHED PICTURE IS KEPT FOR A WHILE (order 2318, Nov 14 2026; the draft report on pv_hm took 8.5 s). The report build itself is a few milliseconds; the time was the pictures from the sale sites' CDN (the cover, the comparables' photos, the report photos), fetched again on every preview.
// Only a successful fetch of an https address is kept, for ten minutes, at most 64 of them, in this process. One place for the two doors that fetch (the Desk's own loadImage and the preview's fetch).
const CACHE = new Map(), TTL = 10 * 60 * 1000, MAX = 64;
export const IMG_TIMEOUT = 3000;
export const cachedImage = url => { const h = CACHE.get(url); return h && Date.now() - h.at < TTL ? h.b : null; };
export const keepImage = (url, b) => { if (b && /^https:\/\//.test(String(url || ""))) { CACHE.set(url, { b, at: Date.now() }); if (CACHE.size > MAX) CACHE.delete(CACHE.keys().next().value); } return b; };
export const clearImageCache = () => CACHE.clear();
