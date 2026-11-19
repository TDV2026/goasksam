// A SALE'S PHOTOGRAPH, ONE SOURCE (Lane D, Nov 16 2026; Sam's SL500: the draft printed "Listing photograph not available" for two of three sales the screen showed with photos). The sale's address is the stored comparable's `photo` (a text or { url }); desk2, the report and any page read it through salePhotoUrl, and the report's pictures are loaded through loadSalePhoto only. Pure except the load.
// CAUSE (read live): (A) a listing photo that is a palette PNG, a WebP, an AVIF or a GIF is fetched fine but the report's PDF writer (lib/pdf/mini.js) reads only JPEG and 8 bit PNG, so nothing drew; (B) the preview door fetched only listed hosts, and the Hagerty marketplace's own image host (imgix) was not listed. FIX: the address is fetched as a browser would (browser user agent, the sale page as referer, an accept of JPEG and PNG, 6 second timeout, one retry, image answers only), and a picture the writer cannot read is converted to JPEG by the intake's own converter; the next stored image of the sale is tried when there is one; a sale with no picture at all prints its text across the full width, with no placeholder.
import { canDraw } from "../pdf/mini.js";
import { loadImage } from "./reportPdf.js";
export const salePhotoUrl = s => { const p = s && s.photo; const u = p && typeof p === "object" ? p.url : p; return typeof u === "string" && /^(https:\/\/|data:image\/)/i.test(u.trim()) ? u.trim() : null; };
// the sale's own address first, then any other stored image of that sale (photos, images, gallery: lists of addresses or { url }), no duplicates
export const salePhotoUrls = s => { const out = [], add = v => { const u = salePhotoUrl({ photo: v }); if (u && !out.includes(u)) out.push(u); }; add(s && s.photo); for (const k of ["photos", "images", "gallery", "photoUrls"]) if (s && Array.isArray(s[k])) s[k].forEach(add); return out; };
export const toDrawableJpeg = async bytes => { try { const { resizeUpright } = await import("./intake/images.js"); const r = await resizeUpright(bytes, { contentType: "" }); return r && r.ok && r.jpeg && canDraw(r.jpeg) ? r.jpeg : null; } catch { return null; } };
export async function loadSalePhoto(sale, { fetchImage, load } = {}) {   // load(url, referer): the builder's own once-per-address fetch, so a picture used in two places is fetched once
  const referer = sale && typeof sale.url === "string" && /^https:\/\//.test(sale.url) ? sale.url : null;
  for (const url of salePhotoUrls(sale)) {
    const bytes = await (load ? load(url, referer) : loadImage(url, fetchImage, { referer })); if (!bytes || !bytes.length) continue;
    if (canDraw(bytes)) return bytes;
    const jpeg = await toDrawableJpeg(bytes); if (jpeg) return jpeg;
  }
  return null;
}
