// SET-ASIDE SALES (Sam, Oct 15 2026): a sale the engine sets aside is shown, labelled with the engine's own reason, and
// never blended or judged against the range. Nothing here decides what is set aside: the rows and their reason words
// come from the engine's answer for the car (lib/onebox.js setAsideRows, each with `reason`), read through the same
// engineAnswer the card's market reads (lib/live/search.js). This file only finds a sale among them and words it.
import { specOf, engineAnswer } from "../live/search.js";

// The reason as it reads after "set aside as": the engine's words, with an article where English needs one.
const AS = { modified: "modified", replica: "a replica", project: "a project car", "odd sale": "an odd sale", variant: "a different variant", "professional restoration": "a professional restoration" };
export function setAsideWords(reason) {
  const r = String(reason || "").trim().toLowerCase();
  if (!r) return null;
  return AS[r] || (/^(a|an|the)\s/.test(r) || /ed$/.test(r) ? r : (/^[aeiou]/.test(r) ? "an " : "a ") + r);
}
// The sold Task email's line and the ended card's line: "This one was set aside as modified, so it does not sit in the range."
export function setAsideSentence(reason) {
  const w = setAsideWords(reason);
  return w ? `This one was set aside as ${w}, so it does not sit in the range.` : "This one was set aside, so it does not sit in the range.";
}
// The short label on a past sale in Buy's "This car has sold before" popup: "Set aside as modified".
export function setAsideLabel(reason) { const w = setAsideWords(reason); return w ? `Set aside as ${w}` : "Set aside"; }

const normUrl = u => String(u || "").toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/[?#].*$/, "").replace(/\/+$/, "");
const normVin = v => String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
// The engine's set-aside row that IS this sale: the same listing URL, else the same car (VIN) sold within three days
// at the same price. null when the engine did not set it aside (or never read it).
export function asideMatch(rows, sale) {
  if (!Array.isArray(rows) || !rows.length || !sale) return null;
  const u = normUrl(sale.url);
  if (u) { const hit = rows.find(r => r && normUrl(r.url) === u); if (hit) return hit; }
  const v = normVin(sale.vin), t = Date.parse(String(sale.date || "").slice(0, 10)), p = Math.round(Number(sale.price) || 0);
  if (v.length < 6 || !Number.isFinite(t)) return null;
  return rows.find(r => r && normVin(r.vinNorm) === v && Math.abs(Date.parse(String(r.date || "").slice(0, 10)) - t) <= 3 * 864e5 && (!p || Math.round(Number(r.price) || 0) === p)) || null;
}
// The engine's set-aside rows for a live listing's own car (the spec its card reads). [] when none; null when the
// read did not come back (the caller then labels nothing and judges nothing).
export async function asideRowsFor(env, row, facts) {
  const sp = await specOf(env, row, facts).catch(() => null);
  if (!sp) return [];
  const d = await engineAnswer(sp.v, sp.generation, sp.title, env, sp.refine).catch(() => undefined);
  if (d === undefined) return null;
  return (d && Array.isArray(d.setAsideRows)) ? d.setAsideRows : [];
}
