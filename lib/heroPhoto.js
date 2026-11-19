// THE PHOTO OF A CAR, IN ONE ORDER, FOR EVERY SURFACE (Lane E, Nov 3 2026, lane-e-history-hero). Sam: the history page for the 1971 Porsche 911 (VIN 9111100778, live on Cars & Bids) showed a grey box with the car's name instead of a photo.
// CAUSE: the history page's hero took its photo only from the car's PAST appearances (sales and attempts); the live listing was fetched for the "Back at auction now" card and never offered to the hero, so a car whose only photo is the live
// listing's drew the box. The same shape elsewhere: a popup row for a sale whose own record has no photo (two GT3 RS rows), a Find or Tasks card for a live car with no photo of its own, the partner page's sale tile.
// THE ORDER: the live listing's photo when there is one, else the most recent sale (appearance) of the same car that has one, else the box. A page prints the photo it is given; it never goes looking.
import { photoOrNull } from "./photoHosts.js";
import { supabaseSelect } from "./_supabase.js";

const url = u => (typeof u === "string" && /^https?:\/\//i.test(u) ? photoOrNull(u) : null);
// appearances are newest first on the history page; sort by date anyway so the rule does not rest on the caller's order
const newest = apps => (Array.isArray(apps) ? apps.slice() : []).filter(a => a && url(a.image)).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))[0] || null;
export function heroPhotoOf({ live, appearances }) {
  const lp = live && url(live.photo_url);
  if (lp) return { image: lp, url: live.url || null, house: live.house || null, from: "live" };
  const a = newest(appearances);
  return a ? { image: url(a.image), url: a.url || null, house: a.house || null, from: "sale" } : null;
}
// every other photo on record, the chosen one left out (the page tries them in this order when a host has taken one down)
export function otherPhotosOf({ live, appearances }, chosen) {
  const all = [live && url(live.photo_url)].concat((Array.isArray(appearances) ? appearances : []).map(a => a && url(a.image))).filter(Boolean);
  return [...new Set(all)].filter(u => !chosen || u !== chosen.image);
}
// a card for a live car: its own photo, else the photo of the car's most recent earlier appearance (the timeline Find already reads: { date, photo })
export function cardPhotoOf(photoUrl, timeline) {
  const own = url(photoUrl); if (own) return own;
  const t = (Array.isArray(timeline) ? timeline : []).filter(x => x && url(x.photo)).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))[0];
  return t ? url(t.photo) : (photoUrl == null ? photoUrl : null);
}
// the photo the archive holds for each VIN (its newest appearance with one), one read
export async function photoByVin(env, vins) {
  const list = [...new Set((vins || []).filter(v => v && String(v).length >= 6))].slice(0, 100), out = new Map();
  if (!list.length) return out;
  const rows = await supabaseSelect(env, `vin_index?vin_norm=in.(${list.map(v => encodeURIComponent(v)).join(",")})&photo_url=not.is.null&select=vin_norm,photo_url,appearance_date&order=appearance_date.desc&limit=400`).catch(() => null);
  for (const r of rows || []) if (!out.has(r.vin_norm) && url(r.photo_url)) out.set(r.vin_norm, url(r.photo_url));
  return out;
}
// the sales of a popup: a sale whose own record has no photo takes the photo of another sale of the same car (the pool's own rows first, then the archive), never a box
export async function fillCardPhotos(env, cards) {
  if (!Array.isArray(cards) || !cards.some(c => c && !c.image && c.vinNorm)) return cards;
  const byVin = new Map(); for (const c of cards) if (c && c.image && c.vinNorm && !byVin.has(c.vinNorm)) byVin.set(c.vinNorm, c.image);
  const need = cards.filter(c => c && !c.image && c.vinNorm && !byVin.has(c.vinNorm)).map(c => c.vinNorm), found = need.length ? await photoByVin(env, need) : new Map();
  return cards.map(c => c && !c.image && c.vinNorm ? { ...c, image: byVin.get(c.vinNorm) || found.get(c.vinNorm) || null } : c);
}
