// Rolling nightly warm (7E). Warms ~30 nameplates/night against the live search
// engine, cycling the top list roughly every 10 days. Each warm is a normal
// sellerDecision call with warm:true, so it reuses the exact fetch + persist +
// cache-stamp path and is gated to a RESERVED fraction of the daily budget - a
// real seller search always outranks the warm.
//
//   node scripts/warm.js [--count=30] [--base=https://goasksam.vercel.app]
//
// The nameplate list is the top movers by real search volume (app_usage_events),
// falling back to a curated collector-core seed until that history builds up. A
// rotation cursor in scripts/warm-progress.json cycles the whole list.
import fs from "node:fs";
import { supabaseEnv, supabaseSelect } from "../lib/_supabase.js";

const args = process.argv.slice(2);
const flag = (n, d) => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const COUNT = Number(flag("count", 30));
const BASE = flag("base", process.env.FLOW_BASE || "https://goasksam.vercel.app");
const CURSOR_FILE = new URL("./warm-progress.json", import.meta.url).pathname;

// Curated collector-core seed (used until search volume accumulates). make/model.
const SEED = [
  ["Porsche", "911"], ["Chevrolet", "Corvette"], ["Ford", "Mustang"], ["Chevrolet", "Camaro"],
  ["Toyota", "Land Cruiser"], ["Ford", "Bronco"], ["Mazda", "MX-5 Miata"], ["BMW", "M3"],
  ["Nissan", "GT-R"], ["Chevrolet", "Chevelle"], ["Dodge", "Charger"], ["Dodge", "Challenger"],
  ["Porsche", "Cayman"], ["Porsche", "Boxster"], ["Honda", "S2000"], ["Acura", "NSX"],
  ["Toyota", "Supra"], ["Nissan", "240Z"], ["Mazda", "RX-7"], ["Ferrari", "308"],
  ["Ferrari", "F355"], ["Lamborghini", "Gallardo"], ["Jaguar", "E-Type"], ["Mercedes-Benz", "SL"],
  ["BMW", "M5"], ["Subaru", "Impreza"], ["Ford", "GT"], ["Chevrolet", "Bel Air"],
  ["Volkswagen", "Beetle"], ["Land Rover", "Defender"], ["Alfa Romeo", "Spider"], ["Datsun", "510"],
  ["Pontiac", "Firebird"], ["Plymouth", "Barracuda"], ["Aston Martin", "Vantage"], ["Maserati", "GranTurismo"]
];

// Top nameplates by real search volume, if we have it yet.
async function topByVolume(env) {
  const rows = await supabaseSelect(env, `app_usage_events?event_type=eq.seller_search&search_text=not.is.null&select=search_text&order=created_at.desc&limit=5000`);
  if (!rows || !rows.length) return null;
  const counts = new Map();
  for (const r of rows) {
    const t = String(r.search_text || "").toLowerCase().replace(/\b(19|20)\d{2}\b/g, "").replace(/\s+/g, " ").trim();
    if (t.length < 3) continue;
    counts.set(t, (counts.get(t) || 0) + 1);
  }
  const ordered = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 300).map(([t]) => t);
  return ordered.length ? ordered.map(t => [null, t]) : null;
}

function loadCursor() { try { return JSON.parse(fs.readFileSync(CURSOR_FILE, "utf8")).cursor || 0; } catch { return 0; } }
function saveCursor(c) { try { fs.writeFileSync(CURSOR_FILE, JSON.stringify({ cursor: c, at: new Date().toISOString() })); } catch {} }

const env = supabaseEnv();
const list = (env && await topByVolume(env)) || SEED;
let cursor = loadCursor() % list.length;
const batch = [];
for (let i = 0; i < Math.min(COUNT, list.length); i++) { batch.push(list[(cursor + i) % list.length]); }
saveCursor((cursor + batch.length) % list.length);

console.log(`Warming ${batch.length} nameplate(s) from a ${list.length}-entry list (cursor ${cursor}).`);
let warmed = 0, degraded = 0, spent = 0;
for (const [make, model] of batch) {
  const vehicle = make ? { raw: `${make} ${model}`, make, model, confidence: "high" } : { raw: model, confidence: "high" };
  try {
    const res = await fetch(`${BASE}/api/sellerDecision`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ warm: true, car: { vehicle, region: "US" } })
    });
    const j = await res.json().catch(() => ({}));
    const fs2 = j.evidence?.fetchStrategy || {};
    spent += Number(fs2.meteredRequests || 0);
    const budgetHit = /budget/.test(String(fs2.stopReason || ""));
    if (budgetHit) degraded++; else warmed++;
    console.log(`  ${warmed + degraded}. ${make || ""} ${model}: ${budgetHit ? "budget-reserved (stopped, search headroom kept)" : `warmed (${fs2.meteredRequests || 0} metered, cache=${fs2.marketFetchCache})`}`);
    if (budgetHit) break; // warm reserve reached: stop, leave the rest for searches
  } catch (e) { console.error(`  ${make} ${model}: ${e.message}`); }
}
console.log(`\nDONE. warmed=${warmed} stopped-on-reserve=${degraded} metered=${spent}.`);
