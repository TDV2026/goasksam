// where_to_sell tool handler. Archive-only. Reads ONE oneEngineAnswer and returns the engine's own figures: the sales it counted by venue
// (venueCountsOf, a count and the newest month per venue), its range and its sale count. Nothing is computed here: no median, no price per
// venue (the engine holds none, so none is printed).
import { findGeneration } from "../generations.js";
import { oneEngineAnswer, venueCountsOf } from "../onebox.js";
import { sam, usd, resolveSpec, specLabel, pageLink, monthYear, MAX_RESULTS } from "./_shared.js";

export async function whereToSell(text, env) {
  const r = await resolveSpec(text);
  if (r.question) return { kind: "question", question: sam(r.question) };
  const generation = await findGeneration(r.vehicle, env).catch(() => null);
  const d = (await oneEngineAnswer(r.vehicle, generation, r.vehicle.raw, { supabaseUrl: env.supabaseUrl, supabaseKey: env.supabaseKey, asked: 0 }, null).catch(() => null))?.raw || null;
  const venues = /^(result|thin)$/.test(String(d && d.tier || "")) ? venueCountsOf(d) : [];
  if (!venues.length) return { kind: "refusal", spec: specLabel(r.vehicle), reason: sam("GoAskSam does not have enough recorded sales of this car yet to say where it sells best.") };
  const cluster = Array.isArray(d.cluster) && d.cluster.length === 2 ? d.cluster : null;
  return { kind: "answer", spec: specLabel(d.resolvedCar || r.vehicle),
    platforms: venues.slice(0, MAX_RESULTS).map(v => ({ platform: v.platform, sales: v.sales, latestSale: monthYear(v.latest) || null })),
    salesCount: Number(d.poolN) || null, soldRangeHammerUsd: cluster ? { low: usd(cluster[0]), high: usd(cluster[1]) } : null,
    scopeReason: d.scope_reason || null, link: pageLink(d.resolvedCar || r.vehicle) };
}
