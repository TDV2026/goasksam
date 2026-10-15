// SET-ASIDE SALES (Sam, Oct 15 2026): a sale the engine sets aside is shown, labelled with the engine's own reason, and
// never blended or judged against the range. Nothing here decides what is set aside: the rows and their reason words
// come from the engine's answer for the car (lib/onebox.js setAsideRows, each with `reason`), read through the same
// engineAnswer the card's market reads (lib/live/search.js). This file only finds a sale among them and words it.
import { specOf, engineAnswer } from "../live/search.js";

// The reason as it reads after "set aside as": the engine's words (e47: modified, odd sale, replica, project,
// professional restoration, or a variant's own name such as "Carrera four-cam", kept as the engine writes it), with
// an article where English needs one.
const AS = { modified: "modified", replica: "a replica", project: "a project car", "odd sale": "an odd sale", variant: "a different variant", "professional restoration": "a professional restoration" };
export function setAsideWords(reason) {
  const r = String(reason || "").trim(), low = r.toLowerCase();
  if (!r) return null;
  return AS[low] || (/^(a|an|the)\s/i.test(r) || /ed$/i.test(r) ? r : (/^[aeiou]/i.test(r) ? "an " : "a ") + r);
}
// The sold Task email's line and the ended card's line: "This one was set aside as modified, so it does not sit in the
// range." When the engine's answer has no range (a thin read), the line names the reason only.
export function setAsideSentence(reason, hasRange = true) {
  const w = setAsideWords(reason);
  const head = w ? `This one was set aside as ${w}` : "This one was set aside";
  return hasRange ? `${head}, so it does not sit in the range.` : `${head}.`;
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
