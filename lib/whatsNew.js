// WHAT'S NEW (Lane E, Oct 31 2026): the one reader of data/whatsNew.json, [{ date: "YYYY-MM-DD", text, thanks? }]. The page (api/whatsNew.js) and the sitemap's lastmod read it here and compute nothing else:
// an entry without a real date or without text is skipped, entries are grouped by date and the groups run newest first (an entry keeps its place in the file within a day). A missing or unreadable file is no entries, never an error.
import fs from "node:fs";
import { switchRoutes } from "./_newDesign.js";
let RAW = null;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/, str = v => typeof v === "string" && v.trim() ? v.trim() : null;
function rawEntries() {
  if (RAW) return RAW;
  let raw = [];
  try { raw = JSON.parse(fs.readFileSync(new URL("../data/whatsNew.json", import.meta.url), "utf8")); } catch { raw = []; }
  RAW = Array.isArray(raw) ? raw : [];
  return RAW;
}
// An entry is a dated sentence { date, text, thanks? } or a titled one { date, title, lines: [sentence, ...] }. Two optional gates, both read at request time:
//   when: "NEW_DESIGN"   the entry shows only while the new design switch is on for any route (lib/_newDesign.js)
//   dateEnv: "NAME"      the entry has no date in the file; its date is the YYYY-MM-DD in that environment variable (Lane C sets it the day the switch is flipped). No date there = no entry, never a made up one.
export function whatsNewEntries(env = process.env) {
  const out = [];
  for (const e of rawEntries()) {
    if (!e || typeof e !== "object") continue;
    if (e.when === "NEW_DESIGN" && !switchRoutes(env).length) continue;
    if (e.when && e.when !== "NEW_DESIGN") continue;
    const date = DATE_RE.test(String(e.date || "")) ? e.date : (e.dateEnv && DATE_RE.test(String(env[e.dateEnv] || "").trim()) ? String(env[e.dateEnv]).trim() : null);
    if (!date) continue;
    const thanks = str(e.thanks);
    if (Array.isArray(e.lines)) { const title = str(e.title), lines = e.lines.map(str).filter(Boolean); if (title && lines.length) out.push({ date, text: title, title, lines, thanks }); continue; }
    const text = str(e.text); if (text) out.push({ date, text, title: null, lines: null, thanks });
  }
  return out;
}
export function whatsNewGroups(entries) {
  const list = Array.isArray(entries) ? entries : whatsNewEntries(), by = new Map();
  for (const e of list) { if (!by.has(e.date)) by.set(e.date, []); by.get(e.date).push(e); }
  return [...by.keys()].sort().reverse().map(date => ({ date, entries: by.get(date) }));
}
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const dateHeading = d => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d)); return m ? Number(m[3]) + " " + MONTHS[Number(m[2]) - 1] + " " + m[1] : String(d); };
export const newestDate = () => { const g = whatsNewGroups(); return g.length ? g[0].date : null; };
