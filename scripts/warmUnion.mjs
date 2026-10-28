// THE UNION WARM, SLICED (Sam, Oct 28 2026). Every spec any live listing resolves to (task=warmLive, trafficDays=0), warmed in SHARDS run in parallel, each shard looping until it reports done, then a second
// pass for what a shard missed or held. Three shards at a time (the heavy-read limit is three). The named list is warmed before this by scripts/warmNamed.mjs, never after.
//   PROBE_KEY=... BYPASS_SECRET=... node scripts/warmUnion.mjs [--shards 3] [--base https://goasksam.com]
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg("base", "https://goasksam.com").replace(/\/$/, ""), N = Math.max(1, Math.min(3, Number(arg("shards", 3))));
const KEY = process.env.PROBE_KEY, BYP = process.env.BYPASS_SECRET;
if (!KEY) { console.log("warmUnion: PROBE_KEY is not set; nothing was called."); process.exit(2); }
const H = { "x-ops-key": KEY, ...(BYP ? { "x-vercel-protection-bypass": BYP } : {}) };
const call = async (shard) => { try { const r = await fetch(`${BASE}/api/usageDashboard?view=ops&task=warmLive&budget=240000&width=6&trafficDays=0&shard=${shard}`, { headers: H, signal: AbortSignal.timeout(295000) }); return await r.json(); } catch (e) { return { error: String(e && e.message || e).slice(0, 80) }; } };
const t0 = Date.now(); const tot = { calls: 0, warmed: 0, failed: 0, specs: 0 };
for (let pass = 1; pass <= 2; pass++) {
  const tp = Date.now();
  await Promise.all(Array.from({ length: N }, async (_, k) => {
    for (let i = 0; i < 12; i++) {
      const j = await call(`${k}/${N}`); tot.calls++;
      console.log(`pass ${pass} shard ${k}/${N} call ${i + 1}: specs ${j.distinctSpecs} alreadyWarm ${j.alreadyWarm} warmed ${j.warmed} failed ${j.failed} held ${j.heldOut} notReached ${j.notReached} done ${j.done}${j.error ? " ERROR " + j.error : ""}`);
      tot.warmed += j.warmed || 0; tot.failed += j.failed || 0; if (j.distinctSpecs) tot.specs = Math.max(tot.specs, j.distinctSpecs * N);
      if (j.done || j.error) break;
    }
  }));
  console.log(`pass ${pass} took ${Math.round((Date.now() - tp) / 1000)} s`);
}
console.log(`warmUnion: ${tot.calls} calls, about ${tot.specs} specs, warmed ${tot.warmed}, failed ${tot.failed}, ${Math.round((Date.now() - t0) / 1000)} s in all`);
