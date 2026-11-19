// EVENT NAME SWEEP (Lane B, Oct 25 2026), read-only. For each event, race or livery phrase, the stored sales titles that hold it (ops task=poolrows,
// sales_archive) are read by the resolver twice: with the event table emptied (how it read before) and as it reads now. Reports how many titles read a
// DIFFERENT trim, with samples. The key is read from the Keychain per run and never printed.   node scripts/eventNameSweep.mjs [phrase ...]
import { execSync } from "node:child_process";
import { resolveVehicle } from "../lib/vehicle.js";
import { EVENT_NAMES } from "../lib/vehicleData.js";
const key = execSync("security find-generic-password -s goasksam-probe -w", { encoding: "utf8" }).trim();
let bypass = ""; try { bypass = execSync("security find-generic-password -s goasksam-bypass -w", { encoding: "utf8" }).trim(); } catch {}
const PHRASES = process.argv.slice(2).length ? process.argv.slice(2) : ["Panamericana", "Mille Miglia", "Targa Florio", "Le Mans", "Monte Carlo", "Tour de France", "Gumball", "Cannonball", "Pikes Peak", "Baja 1000", "Rolex 24", "Daytona 24", "Gulf", "Martini", "Rothmans", "Marlboro", "Brumos", "Jagermeister"];
const saved = EVENT_NAMES.slice();
const read = async t => { try { const r = await resolveVehicle(t, {}); const v = r && r.vehicle; return v ? { make: v.make, model: v.model, trim: v.trim || null } : null; } catch { return null; } };
let total = 0, changed = 0, rowsOut = [];
for (const ph of PHRASES) {
  const res = await fetch(`https://goasksam.com/api/usageDashboard?view=ops&task=poolrows&limit=200&title=${encodeURIComponent(ph)}`, { headers: { "x-ops-key": key, "x-vercel-protection-bypass": bypass } });
  const j = await res.json().catch(() => ({})); const rows = j.rows || [];
  let n = 0, ch = 0; const samples = [];
  for (const r of rows) {
    const t = r.listing_title; if (!t) continue; n++;
    EVENT_NAMES.length = 0; const a = await read(t);
    EVENT_NAMES.push(...saved); const b = await read(t);
    if (JSON.stringify(a) !== JSON.stringify(b)) { ch++; if (samples.length < (Number(process.env.SAMPLES) || 3)) samples.push(`${t.slice(0, 80)} | ${a && a.model}/${a && a.trim} -> ${b && b.model}/${b && b.trim}`); }
  }
  total += n; changed += ch;
  console.log(`${ph.padEnd(16)} titles ${String(n).padStart(3)} (of ${j.total ?? "?"})  read differently ${ch}${samples.length ? "\n   " + samples.join("\n   ") : ""}`);
}
console.log(`TOTAL titles read ${total}, read differently now ${changed}`);
