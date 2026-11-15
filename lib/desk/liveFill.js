// THE LIVE CARDS OF A CASE STORED BEFORE THEY CARRIED A PHOTO (Stage 2, Nov 14 2026; the Datsun 240Z case showed two live listings, both "No photo", though the Bring a Trailer listing has photos).
// CAUSE: the live items a case stores (desk.live, made by lib/deskV3.js liveOf at read time) kept no photo and no display name for the venue, so every case read before the card existed has items with no `photo` key and the venue as the source slug ("bringatrailer"). The live read itself (live_listings.photo_url, lib/live/search.js LIVE_SEL) carried the photo all along.
// FIX FOR THE STORED CASES: at serve time one read of live_listings by the items' own addresses fills `photo` (the listing's photo when it has an https one, else null) and the venue's display name; a case read since carries both from liveOf and is not touched. No figure is made here.
// Injected by a check: ctx.livePhotos(urls) -> { [url]: { photo_url, source } }. The default is one PostgREST read with the service key; with no database the items are left as stored.
import { supabaseSelect } from "../_supabase.js";
import { houseName } from "../../api/_historyData.js";
const slugLike = v => typeof v === "string" && /^[a-z0-9_]+$/.test(v);
const https = u => (/^https:\/\//.test(String(u || "")) ? String(u) : null);
export async function liveFill(ctx, sheet) {
  const live = sheet && sheet.case && sheet.case.desk && sheet.case.desk.live;
  if (!Array.isArray(live) || !live.length) return sheet;
  const need = live.filter(l => l && l.url && (!("photo" in l) || slugLike(l.platform)));
  if (!need.length) return sheet;
  let got = null;
  try {
    const urls = [...new Set(need.map(l => l.url))];
    if (ctx.livePhotos) got = await ctx.livePhotos(urls);
    else if (ctx.env && ctx.env.supabaseUrl) { const rows = await supabaseSelect(ctx.env, "live_listings?url=in.(" + urls.map(u => '"' + String(u).replace(/"/g, "") + '"').join(",") + ")&select=url,photo_url,source"); got = Object.fromEntries((rows || []).map(r => [r.url, r])); }
  } catch { got = null; }
  const items = live.map(l => { if (!l || !l.url) return l; const r = got && got[l.url]; return { ...l, ...(("photo" in l) ? {} : { photo: r ? https(r.photo_url) : null }), ...(slugLike(l.platform) ? { platform: houseName(l.platform) || l.platform } : {}) }; });
  return { ...sheet, case: { ...sheet.case, desk: { ...sheet.case.desk, live: items } } };
}
