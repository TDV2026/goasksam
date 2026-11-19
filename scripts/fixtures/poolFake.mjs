// Test double for the pool read of the tier job (ct3): which fake sales a band read (model=eq.X, or model_family=eq.X with a year range) returns. Used by the tier checks' fake PostgREST.
import { deskModelFamily } from "../../lib/desk/familyKey.js";
const fam = r => deskModelFamily({ make: r.make, model: r.model, title: r.listing_title || "" });
export function poolRows(rows, sp) {
  const strip = (k, p) => (sp.get(k) || "").replace(p, "");
  const make = strip("make", "eq.");
  const f = strip("model_family", "eq."), model = strip("model", "eq.");
  const lo = sp.getAll("year").find(v => v.startsWith("gte.")), hi = sp.getAll("year").find(v => v.startsWith("lte."));
  return rows.filter(r => (!make || r.make === make) && (f ? fam(r) === f : model ? r.model === model : true)
    && (!lo || Number(r.year) >= Number(lo.slice(4))) && (!hi || Number(r.year) <= Number(hi.slice(4))));
}
export const poolParam = sp => sp.get("model_family") || sp.get("model") || "";
