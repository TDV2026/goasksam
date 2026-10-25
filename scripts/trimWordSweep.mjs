// TRIM WORD SWEEP (Lane B, Oct 25 2026), read-only. For each trim word that can sit inside a nickname, event, livery or edition name, the stored sales
// titles that hold it (ops task=poolrows, sales_archive, newest first, up to CAP per word) go through the resolver offline. A title is FLAGGED when it
// resolves to a trim holding the word AND the word sits where a trim does not: after Ex/La/Le/The/style/tribute/replica/inspired, inside quotes or
// brackets, or before Panamericana/Rally/Race/Trophy/Livery/Pace. The flag is a heuristic to find candidates; the examples are read by hand.
//   CAP=300 node scripts/trimWordSweep.mjs [word ...]
import { execSync } from "node:child_process";
import { resolveVehicle } from "../lib/vehicle.js";
const key = execSync("security find-generic-password -s goasksam-probe -w", { encoding: "utf8" }).trim();
let bypass = ""; try { bypass = execSync("security find-generic-password -s goasksam-bypass -w", { encoding: "utf8" }).trim(); } catch {}
const WORDS = process.argv.slice(2).length ? process.argv.slice(2) : ["Carrera", "Turbo", "Sport", "GT", "RS", "Cobra", "Shelby", "Boss", "SS", "Z28", "Mach", "Trans Am", "GTS", "Competition", "Spyder", "Cup", "Rally", "Super", "Touring", "Classic"];
const CAP = Number(process.env.CAP) || 300;
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const PRE = /(?:\bex[\s–-]*|\bla\s+|\ble\s+|\bthe\s+|-?style\s+|inspired\s+|tribute\s+|replica\s+|clone\s+|livery\s+|pace\s+car\s+|\bof\s+the\s+|\bformerly\s+|\bwinning\s+)$/i;
const POST = /^[\s,.:;–-]*(?:panamericana|rally|rallye|race|trophy|livery|pace\s+car|winning|winner|tail|look|inspired|-?style|tribute|replica|clone)\b/i;
const flagged = (title, word) => {
  const re = new RegExp(`(^|[^a-z0-9])(${esc(word).replace(/\\ /g, "\\s+")})(?=[^a-z0-9]|$)`, "ig");
  let m;
  while ((m = re.exec(title))) {
    const i = m.index + m[1].length, before = title.slice(Math.max(0, i - 30), i), after = title.slice(i + m[2].length, i + m[2].length + 25);
    const inQuote = (title.slice(0, i).match(/["“”']/g) || []).length % 2 === 1 || (title.slice(0, i).split("(").length > title.slice(0, i).split(")").length);
    if (PRE.test(before) || POST.test(after) || inQuote) return true;
  }
  return false;
};
let grand = 0, grandFlag = 0;
for (const w of WORDS) {
  let rows = [], total = null;
  for (let off = 0; off < CAP; off += 500) {
    const r = await fetch(`https://goasksam.com/api/usageDashboard?view=ops&task=poolrows&limit=${Math.min(500, CAP - off)}&offset=${off}&title=${encodeURIComponent(w)}`, { headers: { "x-ops-key": key, "x-vercel-protection-bypass": bypass } });
    const j = await r.json().catch(() => ({})); total = j.total ?? total; rows = rows.concat(j.rows || []); if (!(j.rows || []).length) break;
  }
  let n = 0, withTrim = 0, bad = 0; const ex = [];
  const wre = new RegExp(`(^|[^a-z0-9])${esc(w).replace(/\\ /g, "\\s+")}(?=[^a-z0-9]|$)`, "i");
  for (const r of rows) {
    const t = r.listing_title; if (!t || !flagged(t, w)) { if (t) n++; continue; } n++;
    let v = null; try { const x = await resolveVehicle(t, {}); v = x && x.vehicle; } catch {}
    if (v && v.trim && wre.test(v.trim)) { withTrim++; bad++; if (ex.length < 5) ex.push(`${t.slice(0, 95)} => ${v.model}/${v.trim}`); }
  }
  grand += n; grandFlag += bad;
  console.log(`${w.padEnd(12)} stored titles with the word ${String(total ?? "?").padStart(5)}, read ${String(n).padStart(3)}, word sits in a nickname/event/livery place AND resolves into the trim: ${bad}${ex.length ? "\n   " + ex.join("\n   ") : ""}`);
}
console.log(`TOTAL read ${grand}, flagged wrong ${grandFlag}`);
