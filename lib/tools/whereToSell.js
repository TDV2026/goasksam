// where_to_sell tool handler (extracted verbatim from api/mcp.js). Archive-only: ranks the platforms a
// spec has sold on, by recorded sales, with the median hammer per platform (listSalesForVehicle).
import { findGeneration } from "../generations.js";
import { listSalesForVehicle } from "../onebox.js";
import { sam, usd, resolveSpec, specLabel, pageLink, MAX_RESULTS } from "./_shared.js";

export async function whereToSell(text, env) {
  const r = await resolveSpec(text);
  if (r.question) return { kind: "question", question: sam(r.question) };
  const generation = await findGeneration(r.vehicle, env).catch(() => null);
  const lst = await listSalesForVehicle(r.vehicle, generation, { supabaseUrl: env.supabaseUrl, supabaseKey: env.supabaseKey }).catch(() => null);
  const sales = (lst && lst.ok && Array.isArray(lst.sales)) ? lst.sales : [];
  if (!sales.length) return { kind: "refusal", spec: specLabel(r.vehicle), reason: sam("GoAskSam does not have enough recorded sales of this car yet to say where it sells best.") };
  const by = new Map();
  for (const s of sales) {
    const plat = s.platform || s.source || s.source_slug; if (!plat) continue;
    const u = Number(s.priceUsd) || null;
    const b = by.get(plat) || { platform: plat, sales: 0, prices: [] };
    b.sales++; if (u) b.prices.push(u); by.set(plat, b);
  }
  const ranked = [...by.values()].sort((a, z) => z.sales - a.sales).slice(0, MAX_RESULTS).map(b => {
    b.prices.sort((a, z) => a - z); const mid = b.prices.length ? b.prices[Math.floor(b.prices.length / 2)] : null;
    return { platform: b.platform, sales: b.sales, medianHammerUsd: usd(mid) };
  });
  return { kind: "answer", spec: specLabel(r.vehicle), platforms: ranked, link: pageLink(r.vehicle) };
}
