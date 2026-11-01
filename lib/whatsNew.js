// WHAT'S NEW (Lane E, Oct 31 2026): the one reader of data/whatsNew.json, [{ date: "YYYY-MM-DD", text, thanks? }]. The page (api/whatsNew.js) and the sitemap's lastmod read it here and compute nothing else:
// an entry without a real date or without text is skipped, entries are grouped by date and the groups run newest first (an entry keeps its place in the file within a day). A missing or unreadable file is no entries, never an error.
import fs from "node:fs";
let CACHE = null;
export function whatsNewEntries() {
  if (CACHE) return CACHE;
  let raw = [];
  try { raw = JSON.parse(fs.readFileSync(new URL("../data/whatsNew.json", import.meta.url), "utf8")); } catch { raw = []; }
  CACHE = (Array.isArray(raw) ? raw : []).filter(e => e && typeof e.text === "string" && e.text.trim() && typeof e.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.date))
    .map(e => ({ date: e.date, text: e.text.trim(), thanks: typeof e.thanks === "string" && e.thanks.trim() ? e.thanks.trim() : null }));
  return CACHE;
}
export function whatsNewGroups(entries) {
  const list = Array.isArray(entries) ? entries : whatsNewEntries(), by = new Map();
  for (const e of list) { if (!by.has(e.date)) by.set(e.date, []); by.get(e.date).push(e); }
  return [...by.keys()].sort().reverse().map(date => ({ date, entries: by.get(date) }));
}
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const dateHeading = d => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d)); return m ? Number(m[3]) + " " + MONTHS[Number(m[2]) - 1] + " " + m[1] : String(d); };
export const newestDate = () => { const g = whatsNewGroups(); return g.length ? g[0].date : null; };
