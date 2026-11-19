// A FACTORY PACKAGE NAMED IN THE VARIANT DATA (Lane B, lane-b-coverage, Nov 19 2026; Sam: three genuine 2006 Ford GTs, two Heritage Editions and one plain, were set aside as "project or incomplete car (tribute)").
// CAUSE: the project flag (lib/_classify.js projectFlagReason) reads "tribute", "replica" and "recreation" in a listing's DESCRIPTION, and a factory edition's own story uses the word ("pays tribute to the 1968 and 1969 Le Mans winning GT40", "one of 500 built as a
// tribute to the 1966 GT350-H"): the Heritage Edition Ford GT, the 2007 Shelby GT-H and every edition of that kind read as a tribute CAR. The stored project_flag column carries the old verdict, and the engine read the column.
// THE RULE: when the sale's TITLE names a variant (a trim, edition or package) that data/variantFamilies.json lists for that make, model and year, the description's tribute, replica or recreation never flags it. A title that itself says tribute, replica, recreation, clone or
// continuation still flags (the title is read first), and so does a title that names no variant. The same function is used on a stored flag at read time (effectiveProjectFlag, lib/_classify.js), so no re-stamp of the archive is needed.
import FAMILIES from "../data/variantFamilies.json" with { type: "json" };
const esc = s => String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const PLAIN = new Set(["base", "standard", "other"]);
let INDEX = null;
function index() {
  if (INDEX) return INDEX;
  INDEX = (FAMILIES.families || []).map(f => ({
    id: f.id, make: String(f.make || "").toLowerCase(), years: f.years || null,
    models: (f.models || []).map(m => { const star = /\*$/.test(m), core = esc(String(m).replace(/\*$/, "")).replace(/[\s-]+/g, "[\\s-]*"); return new RegExp("\\b" + core + (star ? "" : "\\b"), "i"); }),   // "330*" is a prefix (330 GT, 330 GTC), "3-Series" reads "3 Series" too
    variants: (f.variants || []).filter(v => v && v.name && !PLAIN.has(String(v.name).toLowerCase()) && Array.isArray(v.words) && v.words.length).map(v => ({ name: v.name, years: v.years || null, res: v.words.map(w => { try { return new RegExp(w, "i"); } catch { return null; } }).filter(Boolean) }))
  }));
  return INDEX;
}
// the name of the variant (a factory edition, trim or package in the variant data) a listing title names for its make, model and year, or null
export function factoryPackageIn(title) {
  const t = String(title || ""); if (!t) return null;
  const ym = /\b(19\d{2}|20\d{2})\b/.exec(t), year = ym ? Number(ym[1]) : null, low = t.toLowerCase();
  for (const f of index()) {
    if (!f.make || !low.includes(f.make) || !f.models.some(re => re.test(t))) continue;
    if (year != null && f.years && (year < f.years[0] || year > f.years[1])) continue;
    for (const v of f.variants) {
      if (year != null && v.years && (year < v.years[0] || year > v.years[1])) continue;
      if (v.res.some(re => re.test(t))) return v.name;
    }
  }
  return null;
}
export const SOFT_PROJECT_KEYS = new Set(["tribute", "replica", "recreation"]);
