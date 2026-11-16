// READ ONLY SWEEP OF THE HAGERTY ORG FOR PARTIAL STORED ANSWERS (Lane D, Nov 16 2026). Lists the cases whose stored market answer looks partial: no period views with comparables listed (the engine's empty pool under load), or a stored count of 0 while comparables are listed, or a marker. One case_list and one case_get per case through the preview API, one at a time, paced; it writes nothing and prints no address, no seller name and no email: the case alias (first 8 of the id), the title, the stored count, the comparables, the period views, the shape and the reason.
//   node scripts/deskPartialSweep.mjs            (a HEAVY STEP: post START and DONE lines in docs/lane-notes.md, one at a time, no PUSH LOCK open)
// The crew cookie and the bypass header come from the macOS Keychain (goasksam-crew, goasksam-bypass), held in memory, never printed.
import { execFileSync } from "node:child_process"; import path from "node:path"; import { pathToFileURL } from "node:url";
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), ".."), imp = f => import(pathToFileURL(path.join(root, f)).href);
const { crewCookie } = await imp("scripts/_crewCookie.mjs"), { storedAnswerWhy } = await imp("lib/desk/answerHealth.js");
const byp = execFileSync("security", ["find-generic-password", "-s", "goasksam-bypass", "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(), ck = await crewCookie();
const post = async b => { const r = await fetch("https://goasksam.com/preview/desk/api", { method: "POST", headers: { "content-type": "application/json", "x-vercel-protection-bypass": byp, cookie: "gas_crew=" + ck }, body: JSON.stringify(b) }); const t = await r.text(); try { return JSON.parse(t); } catch { return { ok: false, why: "status " + r.status }; } };
const list = await post({ action: "case_list", includeArchived: true }), rows = (list.rows || []).filter(r => r && r.id), out = [];
for (const r of rows) {
  const g = await post({ action: "case_get", id: r.id }), c = g.case || {}, d = c.desk || null;
  if (!d || !d.evidence) { out.push({ alias: r.id.slice(0, 8), title: r.title, state: "no answer stored" + (c.readRetry ? " (retry marker)" : "") }); await new Promise(x => setTimeout(x, 300)); continue; }
  const comps = (d.comparables || []).length, views = d.views ? Object.keys(d.views).length : 0, count = d.evidence.count, why = storedAnswerWhy(c) || (count === 0 && comps > 0 ? "count 0 with comparables" : null);
  if (why) out.push({ alias: r.id.slice(0, 8), title: r.title, count, comparables: comps, views, shape: d.shape, why });
  await new Promise(x => setTimeout(x, 300));
}
console.log(JSON.stringify({ cases: rows.length, partial: out.length, list: out }, null, 1));
