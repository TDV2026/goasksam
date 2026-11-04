// WHAT THE ARCHIVE SAYS ABOUT A VIN PREFIX AND ITS TRIM (Lane B, Nov 3 2026, lane-b-vinpool; the table builder behind scripts/learnVinTrimCodes.mjs). PURE: rows in, a table out; it reads nothing and applies nothing.
// For each make and model, the sales are grouped by the VIN's positions from..to (default 4 to 8, 1-based). A prefix is SINGLE when every sale behind it carries the same trim phrase, FAMILY when the trims differ but share their first word
// (Carrera, Carrera 4, Carrera S: one family), SPLIT when they do not. Nothing here becomes a rule: lib/vinTrimCodes.js holds only what a person confirmed.
import { trimPhraseFromRecord } from "./vinAsTyped.js";
const norm = x => String(x == null ? "" : x).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export function prefixOf(vin, from = 4, to = 8) { const v = String(vin || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); return v.length === 17 ? v.slice(from - 1, to) : null; }
export function trimOfSale(r) { const t = trimPhraseFromRecord({ make: r.make, model: r.model, archiveTitle: r.listing_title || r.title || null }); return t ? norm(t) : null; }
export function learnTable(rows, { from = 4, to = 8, min = 3 } = {}) {
  const by = new Map();
  for (const r of rows || []) {
    const p = prefixOf(r.vin_norm || r.vin, from, to); if (!p || !r.make || !r.model) continue;
    const k = `${r.make}\u0000${r.model}\u0000${p}`; let g = by.get(k); if (!g) { g = { make: String(r.make), model: String(r.model), prefix: p, n: 0, trims: new Map(), years: new Set() }; by.set(k, g); }
    g.n++; const t = trimOfSale(r) || "(none)"; g.trims.set(t, (g.trims.get(t) || 0) + 1); if (r.year) g.years.add(Number(r.year));
  }
  const out = [];
  for (const g of by.values()) {
    if (g.n < min) continue;
    const trims = [...g.trims.entries()].sort((a, b) => b[1] - a[1]).map(([trim, n]) => ({ trim, n })), named = trims.filter(t => t.trim !== "(none)");
    const first = new Set(named.map(t => t.trim.split(" ")[0]));
    const kind = named.length === 0 ? "untrimmed" : named.length === 1 && trims.length === 1 ? "single" : first.size === 1 ? "family" : "split";
    const ys = [...g.years].sort((a, b) => a - b);
    out.push({ make: g.make, model: g.model, prefix: g.prefix, n: g.n, kind, trims, years: ys.length ? [ys[0], ys[ys.length - 1]] : null });
  }
  return out.sort((a, b) => a.make.localeCompare(b.make) || a.model.localeCompare(b.model) || b.n - a.n || a.prefix.localeCompare(b.prefix));
}
// one table per make, as text for a person to read and confirm
export function printTable(rows, { from = 4, to = 8 } = {}) {
  const lines = []; let make = null;
  for (const r of rows) {
    if (r.make !== make) { make = r.make; lines.push("", `== ${make} (VIN positions ${from} to ${to}) ==`, "model | prefix | sales | years | kind | trims (sales)"); }
    lines.push([r.model, r.prefix, r.n, r.years ? r.years.join("-") : "", r.kind.toUpperCase(), r.trims.map(t => `${t.trim} (${t.n})`).join("; ")].join(" | "));
  }
  return lines.join("\n");
}
