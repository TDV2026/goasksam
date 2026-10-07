// market_check tool handler (extracted verbatim from api/mcp.js). Archive-only, reuses the engine
// (resolveVehicle + findGeneration + runOneBox). Returns { kind: answer | question | refusal, ... }.
import { findGeneration } from "../generations.js";
import { runOneBox } from "../onebox.js";
import { sam, usd, resolveSpec, specLabel, pageLink } from "./_shared.js";

export async function marketCheck(text, env) {
  const r = await resolveSpec(text);
  if (r.question) return { kind: "question", question: sam(r.question), options: [] };
  const generation = await findGeneration(r.vehicle, env).catch(() => null);
  let d = await runOneBox(r.vehicle, generation, r.vehicle.raw, { supabaseUrl: env.supabaseUrl, supabaseKey: env.supabaseKey, asked: 0 }, null).catch(() => null);
  if (d && /_choice$/.test(String(d.tier || ""))) {
    const opts = (d.variantOptions || d.gearboxOptions || d.genChoices || (d.clarification && d.clarification.options) || []).map(o => (typeof o === "string" ? o : (o.label || o.value || o.q))).filter(Boolean).slice(0, 8);
    return { kind: "question", question: sam(d.question || (d.clarification && d.clarification.question) || "Which exact version is it?"), options: opts, spec: specLabel(d.resolvedCar) };
  }
  if (!d || !d.tier) return { kind: "refusal", reason: sam("There is no recorded sales history to read for that car yet."), spec: specLabel(d && d.resolvedCar) };
  const rc = d.resolvedCar || r.vehicle;
  const spec = specLabel(rc);
  const closestRaw = d.representative && d.representative.closest;
  // The engine's closest card renders price as `price` (the USD figure the One Box page shows), with
  // `value` (USD implied hammer) and `allIn` as fallbacks; title/url are `title`/`url`.
  const closestUsd = closestRaw ? [closestRaw.price, closestRaw.value, closestRaw.allIn].map(Number).find(n => Number.isFinite(n) && n > 0) || null : null;
  const closest = closestRaw ? {
    title: closestRaw.title || closestRaw.ctitle || closestRaw.spec || spec,
    url: closestRaw.url || closestRaw.srcurl || null,
    hammerUsd: usd(closestUsd),
    date: (closestRaw.date || "").slice(0, 10) || null
  } : null;
  const cluster = Array.isArray(d.cluster) && d.cluster.length === 2 ? d.cluster : null;
  const link = pageLink(rc);
  if (cluster) {
    return {
      kind: "answer", spec,
      soldRangeHammerUsd: { low: usd(cluster[0]), high: usd(cluster[1]) },
      salesCount: Number(d.poolN) || null, period: d.windowLabel || null,
      closestSale: closest, link
    };
  }
  // tier present but no cluster: honest thin / too-spread -> lead with the closest sale, no headline band
  return { kind: "refusal", spec, reason: sam(d.tier === "thin" ? "Too few recorded sales of this exact car to mark a typical band yet." : "The recorded sales are too spread out to mark a typical band."), closestSale: closest, link };
}
