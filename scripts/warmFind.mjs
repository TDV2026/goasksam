// LIVE: this script calls production (goasksam.com) or a pinned deployment. Run it only in a gap the lanes name, with the key and the protection-bypass secret in the environment (never printed):
//   export PROBE_KEY="$(security find-generic-password -s goasksam-probe -w)" BYPASS_SECRET="$(security find-generic-password -s goasksam-bypass -w)"
//   node scripts/warmFind.mjs --base <deployment address> [--chain k/n] [--force] [--from N] [--count] [--limit N]
// THE FIND PRE-FILL (Lane B, Oct 29 2026): for every live listing spec the engine asks a question about first (every *_choice kind: documented history, trim, generation, body, gearbox, variant, model), computes and stores the spec's own Find answer under its
// FINDANS: row at the live stamp and epoch (ops task warmFind: archive only, zero OldCarsData), so a card never computes its own on a reader's first open. The list is sorted by spec key, so --chain k/n (every nth spec from k) runs n chains in parallel
// and --from N resumes. A row already stored at the current epoch and stamp is skipped (--force overrides). A progress line prints every 500 specs. --count prints the list size and the split by kind and writes nothing.
// Check the result with the read-only task findasks (before and after): stillReading must fall to 0.
const arg = n => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : null; };
const BASE0 = process.argv.includes("--live-main") ? "https://goasksam.com" : (arg("base") || process.env.WARM_BASE || "");
if (!BASE0) { console.log("warmFind: no address given. Pass --base <the deployment address of the build to fill> or set WARM_BASE; --live-main targets goasksam.com on purpose."); process.exit(2); }
const BASE = BASE0.replace(/\/$/, ""), KEY = process.env.PROBE_KEY, BYP = process.env.BYPASS_SECRET || null;
if (!KEY) { console.log("warmFind: PROBE_KEY is not set; nothing was called."); process.exit(2); }
const H = { "x-ops-key": KEY, ...(BYP ? { "x-vercel-protection-bypass": BYP } : {}) };
const getJson = async (qs, ms = 290000) => { const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms); try { const r = await fetch(`${BASE}/api/usageDashboard?view=ops&task=warmFind${qs}`, { headers: H, signal: ac.signal }); const x = await r.text(); try { return { status: r.status, j: JSON.parse(x) }; } catch { return { status: r.status, j: null, text: x.slice(0, 120) }; } } catch (e) { return { status: 0, j: null, text: String(e && e.message || e) }; } finally { clearTimeout(t); } };
const chain = arg("chain") ? `&chain=${encodeURIComponent(arg("chain"))}` : "", force = process.argv.includes("--force") ? "&force=1" : "", limit = Number(arg("limit")) > 0 ? Number(arg("limit")) : 12;
if (process.argv.includes("--count")) { const r = await getJson("&count=1" + chain, 120000); console.log(r.j ? `warmFind: ${r.j.total} live specs asked a question first (of ${r.j.liveSpecs} live specs); by kind ${JSON.stringify(r.j.byKind)}` : `warmFind: count failed, HTTP ${r.status} ${r.text || ""}`); process.exit(r.j ? 0 : 1); }
let offset = Number(arg("from")) || 0, stored = 0, skipped = 0, failed = 0, total = null, lastReport = Math.floor(offset / 500), errors = 0;
while (true) {
  const r = await getJson(`&offset=${offset}&limit=${limit}${chain}${force}`);
  if (!r.j) { if (++errors >= 5) { console.log(`warmFind: stopped at ${offset} after 5 failed calls (HTTP ${r.status} ${r.text || ""}); resume with --from ${offset}`); process.exit(1); } continue; }
  errors = 0; total = r.j.total; stored += r.j.stored; skipped += r.j.skipped; failed += r.j.failed;
  for (const row of r.j.rows || []) if (!row.stored) console.log(`NOT STORED  ${row.q} (${row.kind})  ${row.error || row.tier || ""}`);
  offset = r.j.next == null ? total : r.j.next;
  if (Math.floor(offset / 500) > lastReport) { lastReport = Math.floor(offset / 500); console.log(`warmFind: ${offset} of ${total} specs, ${stored} stored, ${skipped} skipped, ${failed} failed`); }
  if (r.j.done || r.j.next == null) break;
}
console.log(`warmFind: done, ${total} specs, ${stored} stored, ${skipped} skipped, ${failed} failed`);
process.exit(failed ? 1 : 0);
