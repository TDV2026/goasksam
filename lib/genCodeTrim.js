// A GENERATION CODE IS THE GENERATION, NEVER A TRIM (lane-b-find-gens, Nov 11 2026; the one rule, read by the shared resolver (lib/vehicle.js), the live search and its noun (lib/live/search.js)).
// "BMW 3 Series E30", "Corvette C2", "Supra A80", "Audi A4 B6" came out of the resolver with the code as the car's trim (or as a word every title had to print), and a live car dated into that generation is titled "1988 BMW 325i Convertible",
// never with the code, so the search found nothing and the noun printed the code twice ("E30 E30 convertibles"). A trim (or trim fence) that is one of THIS car's curated generation codes (lib/generations.js) becomes the generation;
// every other trim stays exactly as it was.
import { CURATED_GENERATIONS } from "./generations.js";
const squash = x => String(x || "").toLowerCase().replace(/[^a-z0-9]/g, "");
export function codeNotTrim(v, gens) {
  try {
    if (!v || !v.make) return v;
    const t = v.trim || v.trimFence; if (!t) return v;
    // a trim that is one word of a generation code the search names ("Mk2" of "Mk1-Mk2") is that generation's word
    if ((gens || []).some(c => String(c).split(/[-\s]+/).some(w => squash(w) && squash(w) === squash(t)))) { const o = { ...v }; if (v.trim && squash(v.trim) === squash(t)) o.trim = null; if (v.trimFence && squash(v.trimFence) === squash(t)) delete o.trimFence; return o; }
    const mk = squash(v.make), md = squash(v.parentModel || v.model || "");
    const row = CURATED_GENERATIONS.find(g => squash(g.make) === mk && (squash(g.model) === md || squash(g.model) === squash(v.model || "")) && squash(g.code) === squash(t));
    if (!row) {
      // a trim that carries the code beside its own words ("C63 W204"): the code is the generation, the rest stays the trim
      const tw = String(t).split(/\s+/).filter(Boolean); if (tw.length < 2) return v;
      const hit = CURATED_GENERATIONS.find(g => squash(g.make) === mk && tw.some(w => squash(w) === squash(g.code)) && (squash(g.model) === md || squash(g.model) === squash(v.model || "") || tw.some(w => squash(w) === squash(g.model))));
      if (!hit) return v;
      const rest = tw.filter(w => squash(w) !== squash(hit.code)).join(" ");
      const o = { ...v, genCode: v.genCode || hit.code, generation: v.generation || hit.code };
      if (v.trim) o.trim = rest || null; else o.trimFence = rest || undefined;
      return o;
    }
    const out = { ...v, genCode: v.genCode || row.code, generation: v.generation || row.code };
    if (v.trim && squash(v.trim) === squash(t)) out.trim = null;
    if (v.trimFence && squash(v.trimFence) === squash(t)) delete out.trimFence;
    return out;
  } catch { return v; }
}
