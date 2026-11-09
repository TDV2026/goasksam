// THE PHOTO RULE FOR EVERY EXAMPLE PICK (Lane B, Nov 8 2026; the 2004 Maybach 57 on Find: a 3.1 MB, 3000 pixel JPEG that took 11 seconds to load). When a crew example car is SELECTED (the Find pick, the Tasks example, the watching card, the Homepage pick, the entry example fields), its first photo is
// HEADed: it must answer 200, be an image, and be under MAX_PHOTO_BYTES (600 KB). If it is not, the listing's next photo is tried (a resized copy first where the row carries one, then the photo, then any further photos of the same listing the caller passes), else the car is skipped. An earlier appearance's photo is never a stand-in: the cards print it as the car's OTHER picture.
// A header that gives no length is read to the limit and refused beyond it. The check is at selection (the pick is made once; a stored pick keeps the photo it was chosen with), zero OldCarsData.
export const MAX_PHOTO_BYTES = 600 * 1024, HEAD_TIMEOUT_MS = 4000, MAX_TRIES = 4;
const isHttps = u => /^https:\/\/[^\s"'<>]+$/i.test(String(u || ""));
// resized copies first (where the row or the archive holds one), then the photo itself, then the extras the caller passes (further photos of the same listing); https only, no repeats, a bounded few
export function photoCandidates(row, extra = []) {
  const r = row || {}, list = [r.photo_small, r.photo_thumb, r.thumbnail_url, r.photo_url, ...(Array.isArray(extra) ? extra : [])];
  return [...new Set(list.filter(isHttps))].slice(0, MAX_TRIES);
}
export async function headPhoto(url) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), HEAD_TIMEOUT_MS);
  try {
    const r = await fetch(url, { method: "HEAD", redirect: "follow", signal: c.signal });
    const type = r.headers && r.headers.get ? r.headers.get("content-type") || "" : "", len = r.headers && r.headers.get ? Number(r.headers.get("content-length")) : NaN;
    if (r.status === 200 && Number.isFinite(len) && len > 0) return { status: 200, bytes: len, type };
    if (r.status !== 200) return { status: r.status, bytes: null, type };
    // no length on the HEAD: read up to the limit and refuse anything beyond it
    const g = await fetch(url, { method: "GET", redirect: "follow", signal: c.signal, headers: { Range: `bytes=0-${MAX_PHOTO_BYTES}` } });
    let n = 0; if (g.body && g.body.getReader) { const rd = g.body.getReader(); for (;;) { const { done, value } = await rd.read(); if (done) break; n += value.length; if (n > MAX_PHOTO_BYTES) { try { await rd.cancel(); } catch {} break; } } }
    return { status: g.status === 206 ? 200 : g.status, bytes: n, type: g.headers.get("content-type") || type };
  } catch { return null; } finally { clearTimeout(t); }
}
export const photoOk = (h, max = MAX_PHOTO_BYTES) => !!h && h.status === 200 && (!h.type || /^image\//i.test(String(h.type))) && Number.isFinite(h.bytes) && h.bytes > 0 && h.bytes <= max;
// the first candidate that passes, or null (the car is skipped)
export async function choosePhoto(candidates, head = headPhoto, max = MAX_PHOTO_BYTES) {
  for (const u of (candidates || []).filter(isHttps).slice(0, MAX_TRIES)) { let h = null; try { h = await head(u); } catch { h = null; } if (photoOk(h, max)) return u; }
  return null;
}
