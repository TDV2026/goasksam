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

// Vercel Protection Bypass for Automation: /api/sellerDecision sits behind the Vercel
// firewall's Security Checkpoint, which 429s a headless (non-browser) client like this
// GitHub Actions runner. The bypass secret (x-vercel-protection-bypass header) clears the
// checkpoint. Project-wide secret, stored ONLY as the VERCEL_AUTOMATION_BYPASS_SECRET GitHub
// Actions secret and passed in via env; never hardcoded. Absent -> we warn once and every
// call will fail the res.ok check below (loud), instead of the old phantom-"warmed" success.
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";
if (!BYPASS) console.error("::warning::VERCEL_AUTOMATION_BYPASS_SECRET is not set; warm calls will be blocked by the Vercel Security Checkpoint (429).");
const reqHeaders = { "Content-Type": "application/json", ...(BYPASS ? { "x-vercel-protection-bypass": BYPASS } : {}) };

console.log(`Warming ${batch.length} nameplate(s) from a ${list.length}-entry list (cursor ${cursor}).`);
let warmed = 0, degraded = 0, spent = 0, failed = 0;
const failures = [];
for (const [make, model] of batch) {
  const vehicle = make ? { raw: `${make} ${model}`, make, model, confidence: "high" } : { raw: model, confidence: "high" };
  const label = `${make || ""} ${model}`.trim();
  try {
    const res = await fetch(`${BASE}/api/sellerDecision`, {
      method: "POST", headers: reqHeaders,
      body: JSON.stringify({ warm: true, car: { vehicle, region: "US" } })
    });
    // FAIL LOUD (defect: the old code did res.json().catch(()=>({})), so a 429 bot-checkpoint
    // HTML page silently became {} and still counted as "warmed"). A non-2xx, or a 2xx whose
    // body is not a real decision, is a hard failure now - never a phantom success.
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const reason = /Vercel Security Checkpoint/i.test(body)
        ? `HTTP ${res.status} Vercel Security Checkpoint (bot firewall) - VERCEL_AUTOMATION_BYPASS_SECRET missing or invalid`
        : `HTTP ${res.status} - ${body.slice(0, 120)}`;
      throw new Error(reason);
    }
    const j = await res.json().catch(() => null);
    if (!j || (!j.evidence && !j.decision && !j.status)) {
      throw new Error(`2xx but no decision body (keys: ${j ? Object.keys(j).join(",") : "non-json"})`);
    }
    const fs2 = j.evidence?.fetchStrategy || {};
    spent += Number(fs2.meteredRequests || 0);
    const budgetHit = /budget/.test(String(fs2.stopReason || ""));
    if (budgetHit) degraded++; else warmed++;
    console.log(`  ${warmed + degraded}. ${label}: ${budgetHit ? "budget-reserved (stopped, search headroom kept)" : `warmed (${fs2.meteredRequests || 0} metered, cache=${fs2.marketFetchCache})`}`);
    if (budgetHit) break; // warm reserve reached: stop, leave the rest for searches
  } catch (e) { failed++; failures.push(`${label}: ${e.message}`); console.error(`::error::warm ${label} FAILED: ${e.message}`); }
}
console.log(`\nDONE. warmed=${warmed} stopped-on-reserve=${degraded} failed=${failed} metered=${spent}.`);
// A warm run where every call failed (or any call failed) is a real red, not a green exit-0.
// This is what should have been happening while the bot checkpoint was silently bouncing warm.
if (failed > 0) {
  console.error(`::error::warm: ${failed}/${batch.length} call(s) failed and reached no decision. First few: ${failures.slice(0, 3).join(" | ")}`);
  process.exit(1);
}
