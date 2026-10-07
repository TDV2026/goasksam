// car_history tool handler (extracted verbatim from api/mcp.js). Resolves a VIN, a listing URL, or a
// bare BaT slug (via the indexed url_norm), then reuses vinAppearances + merges has_reserve.
import { supabaseSelect } from "../_supabase.js";
import { vinAppearances, normVin, carIdentity, carSlug } from "../../api/_historyData.js";
import { normalizeListingUrl, batSlugToUrlNorm } from "../_urlNorm.js";
import { sam, usd, SITE, MAX_RESULTS } from "./_shared.js";

export async function carHistory(input, env) {
  const raw = String(input || "").trim();
  let vin = "";
  // Listing link or bare BaT slug -> resolve via the INDEXED url_norm (exact match, no scan). Otherwise
  // treat the input as a VIN / chassis. A slug has hyphens and is not VIN-shaped.
  const byUrlNorm = async (norm) => {
    if (!norm) return "";
    const s = await supabaseSelect(env, `sales_archive?url_norm=eq.${encodeURIComponent(norm)}&select=vin_norm&limit=1`).catch(() => null);
    if (s && s[0] && s[0].vin_norm) return normVin(s[0].vin_norm);
    const a = await supabaseSelect(env, `auction_attempts?url_norm=eq.${encodeURIComponent(norm)}&select=chassis_vin_norm&limit=1`).catch(() => null);
    if (a && a[0] && a[0].chassis_vin_norm) return normVin(a[0].chassis_vin_norm);
    return "";
  };
  if (/^https?:\/\//i.test(raw)) vin = await byUrlNorm(normalizeListingUrl(raw));
  else if (/-/.test(raw) && !/^[A-Za-z0-9]{10,17}$/.test(raw)) vin = await byUrlNorm(batSlugToUrlNorm(raw));
  else vin = normVin(raw);
  if (!(vin && vin.length >= 6)) return { kind: "refusal", reason: sam("That does not look like a VIN or a listing link GoAskSam can match.") };
  const data = await vinAppearances(env, vin);
  if (!data || !data.ok || !data.appearances.length) return { kind: "refusal", vin, reason: sam("GoAskSam has no recorded auction appearances for that car.") };
  // Reserve isn't in vinAppearances' output (Lane C), so read has_reserve from the archive and merge by date.
  const resMap = {};
  try {
    const [sR, aR] = await Promise.all([
      supabaseSelect(env, `sales_archive?vin_norm=eq.${encodeURIComponent(vin)}&select=sale_date,has_reserve`),
      supabaseSelect(env, `auction_attempts?chassis_vin_norm=eq.${encodeURIComponent(vin)}&select=attempt_date,has_reserve`)
    ]);
    for (const x of [...(sR || []), ...(aR || [])]) { const dd = String(x.sale_date || x.attempt_date || "").slice(0, 10); if (dd && x.has_reserve != null) resMap[dd] = x.has_reserve; }
  } catch { /* reserve is additive */ }
  const apps = data.appearances.slice(0, MAX_RESULTS).map(a => {
    const rv = resMap[a.date];
    return {
      date: a.date || null, house: a.house || null, miles: Number.isFinite(a.mileage) ? a.mileage : null,
      result: a.kind === "sale" ? "sold" : "not sold", reserve: rv == null ? null : (rv ? "reserve" : "no reserve"),
      hammerUsd: a.kind === "sale" ? usd(a.priceUsd) : null, highBidUsd: a.kind === "sale" ? null : usd(a.bidUsd), url: a.url || null
    };
  });
  let id = null; try { id = await carIdentity(data.appearances, vin); } catch { /* */ }
  const link = id ? `${SITE}/history/${carSlug(id)}/${vin}` : `${SITE}/vin/${vin}`;
  return { kind: "answer", vin, car: id ? [id.year, id.make, id.family].filter(Boolean).join(" ") : null, appearances: apps, link };
}
