// THE POOL A SALE'S MILEAGE IS READ AGAINST (Lane B, Nov 5 2026, condition tier ct3). Pure: no database, no network.
// CAUSE of ct3: ct2 took the mileage quartiles of the RAW model value. OldCarsData files one nameplate under several model values (a 2003 911 is "911" or "996"; a C3 is "Corvette" or "C3"),
// so the same car was banded against a different pool by how its seller's source spelled it, and "911" pooled every generation from 1965 to today. The Desk groups these sales as ONE model_family
// (lib/desk/familyKey.js: a chassis or generation code is never a family) and the engine reads them by GENERATION (lib/generations.js), so neither saw the split the job saw.
// RULE: a sale's pool is its Desk family, narrowed to the generation its year falls in when the model has curated generations; a year no generation covers (a handover year left unmapped on purpose)
// reads the whole family; a sale with no family (junk model) reads its raw model as ct2 did. Same key for every sale of the pool, so each pool's quartiles are read once.
import { deskModelFamily } from "./desk/familyKey.js";
import { CURATED_GENERATIONS } from "./generations.js";

const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

export function poolOf(row) {
  const r = row || {};
  const make = r.make == null ? "" : String(r.make);
  if (!make || r.model == null || r.model === "") return null;                // no make or model: no pool, mileage is not observed
  const family = deskModelFamily({ make, model: r.model, title: r.listing_title || r.title || "" });
  if (!family) return { key: `${make}|model|${r.model}`, make, model: String(r.model) };
  const y = Number(r.year);
  let gen = null;
  if (Number.isFinite(y) && y > 0) {
    const hits = CURATED_GENERATIONS.filter(g => norm(g.make) === norm(make) && norm(g.model) === norm(family) && y >= g.yearStart && y <= g.yearEnd);
    // overlapping rows (a handover year mapped twice): the narrowest wins, then the earliest code, so one year always lands in one pool
    hits.sort((a, b) => (a.yearEnd - a.yearStart) - (b.yearEnd - b.yearStart) || String(a.code).localeCompare(String(b.code)));
    gen = hits[0] || null;
  }
  return gen
    ? { key: `${make}|${family}|${gen.code}`, make, family, code: gen.code, yearStart: gen.yearStart, yearEnd: gen.yearEnd }
    : { key: `${make}|${family}|*`, make, family };
}
export const poolKeyOf = row => { const p = poolOf(row); return p ? p.key : `${row && row.make}|${row && row.model}`; };

// The PostgREST filter that returns the sales of a pool (the read the quartiles are taken from).
export function poolFilter(p, q = encodeURIComponent) {
  if (!p) return null;
  if (p.family == null) return `make=eq.${q(p.make)}&model=eq.${q(p.model)}`;
  const base = `make=eq.${q(p.make)}&model_family=eq.${q(p.family)}`;
  return p.code ? `${base}&year=gte.${p.yearStart}&year=lte.${p.yearEnd}` : base;
}
