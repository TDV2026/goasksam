// LIVE: this script calls production (goasksam.com). Run it only in a gap the lanes name, with the key and the protection-bypass secret in the environment (never printed):
//   export PROBE_KEY="$(security find-generic-password -s goasksam-probe -w)" BYPASS_SECRET="$(security find-generic-password -s goasksam-bypass -w)"
//   node scripts/warmNamed.mjs [--part named|golden|top|all] [--no-warm] [--base https://goasksam.com]
// THE NAMED WARM (Sam, Oct 28 2026): the named list (scripts/warm-named.json), the golden table (docs/golden-rules.md) and the 50 most searched Market Check specs (ops task buyqueries&product=market_check)
// are warmed FIRST in every warm run, before the Buy specs, through the ops task warmDemo (the same path the page reads, trims allowed, archive only, no vendor spend). Then every spec is read once through
// the public Market Check path and must come back warmHit true. Prints the count that failed and the reason of each. Exit 1 when any named spec is cold.
import fs from "node:fs";
const arg = n => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : null; };
const BASE = (arg("base") || "https://goasksam.com").replace(/\/$/, ""), PART = arg("part") || "all", NO_WARM = process.argv.includes("--no-warm");
const KEY = process.env.PROBE_KEY, BYP = process.env.BYPASS_SECRET || null;
if (!KEY) { console.log("warmNamed: PROBE_KEY is not set; nothing was called."); process.exit(2); }
const H = extra => ({ "x-ops-key": KEY, ...(BYP ? { "x-vercel-protection-bypass": BYP } : {}), ...(extra || {}) });
const named = JSON.parse(fs.readFileSync(new URL("./warm-named.json", import.meta.url), "utf8")).named;
let golden = []; try { const doc = fs.readFileSync(new URL("../docs/golden-rules.md", import.meta.url), "utf8"); const gm = /```json golden\n([\s\S]*?)```/.exec(doc); golden = gm ? JSON.parse(gm[1]).map(g => g.q).filter(Boolean) : []; } catch {}
const getJson = async (url, ms = 290000) => { const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms); try { const r = await fetch(url, { headers: H(), signal: ac.signal }); const x = await r.text(); try { return { status: r.status, j: JSON.parse(x) }; } catch { return { status: r.status, j: null, text: x.slice(0, 120) }; } } catch (e) { return { status: 0, j: null, text: String(e && e.message || e) }; } finally { clearTimeout(t); } };
let top = [];
if (PART === "top" || PART === "all") { const r = await getJson(`${BASE}/api/usageDashboard?view=ops&task=buyqueries&product=market_check&days=30&top=50`, 120000); top = r.j && Array.isArray(r.j.top) ? r.j.top.map(x => x.q) : []; if (!top.length) console.log("warmNamed: the Market Check log gave no top specs (" + (r.status || r.text) + ")"); }
const lists = { named, golden, top };
const parts = PART === "all" ? ["named", "golden", "top"] : [PART];
const seen = new Set(), todo = [];
for (const p of parts) for (const q of lists[p] || []) { const k = q.toLowerCase(); if (!seen.has(k)) { seen.add(k); todo.push({ q, part: p }); } }
console.log(`warmNamed: ${todo.length} specs (${parts.map(p => p + " " + (lists[p] || []).length).join(", ")})`);
const warmRows = {};
if (!NO_WARM) {
  for (let pass = 1; pass <= 2; pass++) {
    const need = todo.filter(t => !warmRows[t.q] || !warmRows[t.q].stored);
    for (let i = 0; i < need.length; i += 4) {
      const chunk = need.slice(i, i + 4);
      const r = await getJson(`${BASE}/api/usageDashboard?view=ops&task=warmDemo&budget=250000&list=${encodeURIComponent(chunk.map(c => c.q).join("|"))}`);
      for (const row of (r.j && r.j.rows) || []) warmRows[row.q] = row;
      if (!r.j) for (const c of chunk) warmRows[c.q] = { q: c.q, error: "warm call: HTTP " + r.status + " " + (r.text || "") };
    }
    console.log(`warm pass ${pass}: ${todo.filter(t => warmRows[t.q] && warmRows[t.q].stored).length} of ${todo.length} stored`);
    if (todo.every(t => warmRows[t.q] && warmRows[t.q].stored)) break;
  }
}
const results = [];
for (const t of todo) {
  let reason = null, hit = false, tier = null;
  try {
    const r = await fetch(`${BASE}/api/sellerDecision`, { method: "POST", headers: H({ "content-type": "application/json", "x-launch-stage-test": "2" }), body: JSON.stringify({ oneBox: true, anonId: "warm-named", car: { raw: t.q }, asked: 0 }) });
    const d = await r.json().catch(() => null);
    tier = d && d.tier; hit = !!(d && d.timings && d.timings.warmHit === true && !d.stale);
    if (!hit) reason = !d ? "HTTP " + r.status : d.computing ? "still computing" : d.stale ? "stale row" : /_choice$/.test(String(d.tier)) ? "question tier (" + d.tier + ", not stored as an answer)" : d.tier === "refusal" ? "refusal tier (computed per read, never stored)" : "no stored row (" + (warmRows[t.q] && (warmRows[t.q].error || "not stored") || "not warmed") + ")";
  } catch (e) { reason = String(e && e.message || e); }
  results.push({ ...t, hit, tier, reason });
}
const bad = results.filter(r => !r.hit);
for (const r of results) if (r.part === "named" || !r.hit) console.log(`${r.hit ? "HIT " : "COLD"}  ${r.part.padEnd(6)} ${r.q}${r.reason ? "  :: " + r.reason : ""}`);
const byPart = p => results.filter(r => r.part === p);
for (const p of parts) console.log(`${p}: ${byPart(p).filter(r => r.hit).length} of ${byPart(p).length} warmHit true, ${byPart(p).filter(r => !r.hit).length} failed`);
console.log(`warmNamed: ${results.length - bad.length} warmHit true, ${bad.length} failed`);
process.exit(results.some(r => r.part === "named" && !r.hit) ? 1 : 0);
