// THE UNION WARM, SLICED (Sam, Oct 28 2026). Every spec any live listing resolves to (task=warmLive, trafficDays=0), warmed in SHARDS run in parallel, each shard looping until it reports done, then a second
// pass for what a shard missed or held. Three shards at a time (the heavy-read limit is three). The named list is warmed before this by scripts/warmNamed.mjs, never after.
//   PROBE_KEY=... BYPASS_SECRET=... node scripts/warmUnion.mjs [--shards 3] [--base <deployment address> | --live-main]
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : d; };
// The warm targets a PINNED deployment address (Sam, Oct 28 2026): a deployment address does not change when main is pushed, so a push no longer swaps code under a running warm.
// --base <address> or WARM_BASE names it (find it with: vercel inspect <deployment>); --live-main targets the live site on purpose (read-only checks only).
const _arg = n => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : null; };
const _BASE0 = process.argv.includes("--live-main") ? "https://goasksam.com" : (_arg("base") || process.env.WARM_BASE || "");
if (!_BASE0) { console.log("warmUnion: no address given. Pass --base <the deployment address of the build to warm> or set WARM_BASE; --live-main targets goasksam.com on purpose."); process.exit(2); }
const BASE = _BASE0.replace(/\/$/, ""), N = Math.max(1, Math.min(3, Number(arg("shards", 3))));
const KEY = process.env.PROBE_KEY, BYP = process.env.BYPASS_SECRET;
if (!KEY) { console.log("warmUnion: PROBE_KEY is not set; nothing was called."); process.exit(2); }
const H = { "x-ops-key": KEY, ...(BYP ? { "x-vercel-protection-bypass": BYP } : {}) };
const call = async (shard, all) => { try { const r = await fetch(`${BASE}/api/usageDashboard?view=ops&task=warmLive&budget=240000&width=6&trafficDays=0${all ? "&allScope=1" : ""}&shard=${shard}`, { headers: H, signal: AbortSignal.timeout(295000) }); return await r.json(); } catch (e) { return { error: String(e && e.message || e).slice(0, 80) }; } };
const t0 = Date.now(); const tot = { calls: 0, warmed: 0, failed: 0, specs: 0 };
// pass 3 (Sam, Oct 29 2026): the listings outside the launch scope too (--no-scopedout leaves it off). Their specs are Market Check rows a reader can type; they get warmed LAST so the in-scope specs are always done first.
const PASSES = process.argv.includes("--no-scopedout") ? 2 : 3;
for (let pass = 1; pass <= PASSES; pass++) {
  const tp = Date.now();
  await Promise.all(Array.from({ length: N }, async (_, k) => {
    for (let i = 0; i < 12; i++) {
      const j = await call(`${k}/${N}`, pass === 3); tot.calls++;
      console.log(`pass ${pass} shard ${k}/${N} call ${i + 1}: specs ${j.distinctSpecs} alreadyWarm ${j.alreadyWarm} warmed ${j.warmed} failed ${j.failed} held ${j.heldOut} notReached ${j.notReached} done ${j.done}${j.error ? " ERROR " + j.error : ""}`);
      tot.warmed += j.warmed || 0; tot.failed += j.failed || 0; if (j.distinctSpecs) tot.specs = Math.max(tot.specs, j.distinctSpecs * N);
      if (j.done || j.error) break;
    }
  }));
  console.log(`pass ${pass} took ${Math.round((Date.now() - tp) / 1000)} s`);
}
console.log(`warmUnion: ${tot.calls} calls, about ${tot.specs} specs, warmed ${tot.warmed}, failed ${tot.failed}, ${Math.round((Date.now() - t0) / 1000)} s in all`);
