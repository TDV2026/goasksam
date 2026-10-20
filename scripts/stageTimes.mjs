// LIVE: this script calls production (goasksam.com). Run it only in a gap the lanes name, with the protection-bypass header (Lane F's rule, Oct 20 2026).
// STAGE TIMES (Lane B, speed job, Oct 15 2026): where a Market Check answer's time goes, stage by stage, cold and
// warm, through the public path (POST /api/sellerDecision). For each car: one ordinary call (fills the warm row if
// it was missing), one COLD call (fresh: true, credentialed: the warm row is skipped and the engine computes), then
// one WARM call (the stored row). Stages come from the response's timings field: resolveMs (working out the car),
// fetch (the archive reads, count / sum / longest), pool (ranking and fences, from the engine's marks), extras (trend,
// tiles, identity options), mapMs + the client's own wait beyond the server (the response). Diagnostics only.
//
//   export PROBE_KEY="$(security find-generic-password -s goasksam-probe -w)"   # per command, never printed
//   node scripts/stageTimes.mjs [--base https://goasksam.com] [--cars "a|b|c"] [--label daytime]
import puppeteer from "puppeteer-core";

const arg = n => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : null; };
const BASE = (arg("base") || "https://goasksam.com").replace(/\/$/, "");
const LABEL = arg("label") || "";
const CARS = (arg("cars") || "2011 BMW M3 Coupe|2020 Ferrari F8 Tributo|1982 Chevrolet Corvette|2006 Lexus SC 430|2007 BMW Z4 M Roadster|2008 Porsche 997 Carrera|1957 Porsche 356 Speedster|1965 Ford Mustang|2005 Porsche 911|2023 Porsche 911 GT3").split("|").map(s => s.trim()).filter(Boolean);
const KEY = process.env.PROBE_KEY || null;
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (!KEY) { console.log("stageTimes: no PROBE_KEY in the environment."); process.exit(1); }

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", protocolTimeout: 600000, args: ["--no-sandbox"] });
const rows = [];
try {
  const page = await browser.newPage();
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 1000));
  const ask = (q, extra) => page.evaluate(async (u, k, body) => {
    const t0 = Date.now(); const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 120000);
    try {
      const r = await fetch(u, { method: "POST", headers: { "Content-Type": "application/json", "x-ops-key": k, "x-launch-stage-test": "2" }, body: JSON.stringify(body), signal: ac.signal });
      const txt = await r.text(); const clientMs = Date.now() - t0; let d = null; try { d = JSON.parse(txt); } catch {}
      return { status: r.status, clientMs, bytes: txt.length, d: d ? { tier: d.tier, poolN: d.poolN, rungLabel: d.rungLabel || null, timings: d.timings || null } : null };
    } catch (e) { return { status: 0, clientMs: Date.now() - t0, error: String(e && e.message || e) }; } finally { clearTimeout(t); }
  }, BASE + "/api/sellerDecision", KEY, { oneBox: true, anonId: "stagetimes", car: { raw: q }, asked: 0, ...(extra || {}) });
  const stages = r => {
    const t = (r.d && r.d.timings) || {};
    const marks = {};
    for (const [n, ms] of (t.marks || [])) { if (marks[n] == null) marks[n] = ms; if (n === "pool_built" && marks.pool_chosen != null && ms >= marks.pool_chosen && (marks._pb == null)) { marks._pb = ms; } }
    if (marks._pb != null) marks.pool_built = marks._pb;
    const fetches = t.fetchMs || [];
    const fetchSum = fetches.reduce((a, b) => a + b, 0), fetchMax = fetches.length ? Math.max(...fetches) : 0;
    const pool = marks.pool_built != null && marks.pool_chosen != null ? marks.pool_built - marks.pool_chosen : null;
    const extras = marks.result_built != null && marks.pool_built != null ? marks.result_built - marks.pool_built : null;
    const engine = t.engineMs ?? null;
    const server = t.totalMs ?? null;
    return { resolve: t.resolveMs ?? null, warmRead: t.warmReadMs ?? null, warmHit: !!t.warmHit, engine, fetchN: fetches.length, fetchSum, fetchMax, thinAt: marks.thin_checked ?? null, poolAt: marks.pool_chosen ?? null, pool, extras, doneAt: marks.done ?? null, map: t.mapMs ?? null, server, client: r.clientMs, response: server != null ? r.clientMs - server : null, bytes: r.bytes };
  };
  const fmt = v => v == null ? "-" : String(v);
  console.log(`stageTimes ${LABEL} ${new Date().toISOString()} base ${BASE}`);
  console.log("car | kind | resolve | warmRead(hit) | engine | fetches n/sum/max | thin@ | pool@ | pool | extras | done@ | map | server | client | response | tier/poolN");
  for (const q of CARS) {
    await ask(q, null);   // prime: fills the warm row if missing (its own timing is not reported)
    const cold = await ask(q, { fresh: true });
    const warm = await ask(q, null);
    for (const [kind, r] of [["cold", cold], ["warm", warm]]) {
      const s = stages(r);
      rows.push({ q, kind, ...s, tier: r.d && r.d.tier, poolN: r.d && r.d.poolN });
      console.log(`${q} | ${kind} | ${fmt(s.resolve)} | ${fmt(s.warmRead)}(${s.warmHit ? "hit" : "miss"}) | ${fmt(s.engine)} | ${s.fetchN}/${s.fetchSum}/${s.fetchMax} | ${fmt(s.thinAt)} | ${fmt(s.poolAt)} | ${fmt(s.pool)} | ${fmt(s.extras)} | ${fmt(s.doneAt)} | ${fmt(s.map)} | ${fmt(s.server)} | ${s.client} | ${fmt(s.response)} | ${r.d ? r.d.tier + "/" + r.d.poolN : "HTTP " + r.status + " " + (r.error || "")}`);
    }
  }
  const med = a => { const v = a.filter(x => Number.isFinite(x)).sort((x, y) => x - y); return v.length ? v[Math.floor(v.length / 2)] : null; };
  for (const kind of ["cold", "warm"]) {
    const k = rows.filter(r => r.kind === kind);
    console.log(`\nMEDIANS ${kind}: resolve ${med(k.map(r => r.resolve))}, warmRead ${med(k.map(r => r.warmRead))}, engine ${med(k.map(r => r.engine))}, fetch sum ${med(k.map(r => r.fetchSum))} (longest ${med(k.map(r => r.fetchMax))}), pool ${med(k.map(r => r.pool))}, extras ${med(k.map(r => r.extras))}, map ${med(k.map(r => r.map))}, server ${med(k.map(r => r.server))}, client ${med(k.map(r => r.client))}, response ${med(k.map(r => r.response))}`);
  }
  const slowest = rows.filter(r => r.kind === "cold").map(r => { const parts = { resolve: r.resolve, archive: r.fetchSum, pool: r.pool, extras: r.extras, response: r.response }; const top = Object.entries(parts).filter(([, v]) => Number.isFinite(v)).sort((a, b) => b[1] - a[1])[0]; return top ? top[0] : null; });
  const tally = {}; for (const s of slowest) if (s) tally[s] = (tally[s] || 0) + 1;
  console.log(`SLOWEST STAGE on cold answers (count of cars): ${JSON.stringify(tally)}`);
} finally { await browser.close(); }
