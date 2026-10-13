// Partner premium freshness (Oct 2026, Lane C): the read behind the ops task premiumfresh and the /admin line, and the
// nightly premium step's readable failure. No network: fixtures only. Run by prePush.
//   node scripts/premiumFreshCheck.mjs
import fs from "node:fs";
import { premiumFreshness, readPremiumFreshness, PREMIUM_STALE_HOURS } from "../lib/ops/premiumFresh.js";

let fails = 0, passes = 0;
const ok = (c, what) => { if (c) passes++; else { fails++; console.log("FAIL  " + what); } };
const NOW = new Date("2026-10-13T12:00:00Z");
const ago = h => new Date(NOW.getTime() - h * 36e5).toISOString();
const row = (name, h, active = true) => ({ name, slug: name.toLowerCase(), active, specialties: h == null ? { makes: ["Porsche"] } : { premium: { pct: 5, n: 20, source: "data_verified", computedAt: ago(h) } } });

// 1. The newest stamp sets the age; a partner without a stamp is listed, not aged.
{
  const f = premiumFreshness([row("A", 20), row("B", 20.2), row("C", null)], NOW);
  ok(f.lastRefreshed === ago(20) && f.hoursOld === 20 && f.stale === false, `fresh at 20 hours (got ${JSON.stringify([f.lastRefreshed, f.hoursOld, f.stale])})`);
  ok(f.partners.length === 3 && f.partners.find(p => p.name === "C").computedAt === null && f.partners.find(p => p.name === "C").hoursOld === null, "no stamp: listed with null time");
  ok(f.staleAfterHours === 36 && PREMIUM_STALE_HOURS === 36, "stale limit is 36 hours");
}
// 2. Past 36 hours is stale; exactly 36 is not.
ok(premiumFreshness([row("A", 36)], NOW).stale === false, "36 hours: not stale");
ok(premiumFreshness([row("A", 46.5)], NOW).stale === true, "46.5 hours: stale");
// 3. No stamp anywhere is stale, with no time.
{ const f = premiumFreshness([row("A", null)], NOW); ok(f.stale === true && f.lastRefreshed === null && f.hoursOld === null, "no stamps: stale, no time"); }
// 4. A failed partners read throws; it never reads as fresh.
{ let threw = false; try { await readPremiumFreshness(async () => null, {}, NOW); } catch { threw = true; } ok(threw, "failed read throws"); }
{ const f = await readPremiumFreshness(async (_e, p) => (/^partners\?select=name,slug,active,specialties/.test(p) ? [row("A", 3)] : null), {}, NOW); ok(f.hoursOld === 3 && !f.stale, "read selects the partners table"); }

// 5. The /admin line, drawn by the page's own function.
{
  const src = fs.readFileSync(new URL("../api/admin.js", import.meta.url), "utf8");
  const a = src.indexOf("function hoursText("), b = src.indexOf("var PARTS=");
  ok(a > 0 && b > a, "admin page carries premiumLine");
  const E = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const n = x => x == null ? "-" : Number(x).toLocaleString("en-US");
  const premiumLine = new Function("E", "n", src.slice(a, b) + "; return premiumLine;")(E, n);
  const text = h => h.replace(/<[^>]+>/g, "");
  const fresh = premiumLine(premiumFreshness([row("A", 7.2), row("B", 30), row("C", null)], NOW));
  ok(text(fresh).startsWith("Premium numbers last refreshed seven hours ago.") && !/amber/.test(fresh), `fresh line, number word (got ${JSON.stringify(text(fresh))})`);
  ok(/Older than that run: B\./.test(text(fresh)) && /No stored number \(below the sales needed\): C\./.test(text(fresh)), "partner notes");
  const one = premiumLine(premiumFreshness([row("A", 1.2)], NOW));
  ok(text(one).startsWith("Premium numbers last refreshed one hour ago."), "one hour, singular");
  const stale = premiumLine(premiumFreshness([row("A", 46.5)], NOW));
  ok(/class="fresh amber"/.test(stale) && text(stale).startsWith("Premium numbers last refreshed 47 hours ago. That is over 36 hours: check the nightly premium job."), `stale line is amber (got ${JSON.stringify(text(stale))})`);
  ok(/amber/.test(premiumLine({ error: true })) && /could not be read/.test(premiumLine({ error: true })), "failed read is amber and says so");
  ok(/amber/.test(premiumLine(premiumFreshness([row("A", null)], NOW))), "no stored number anywhere is amber");
  for (const h of [fresh, one, stale]) ok(!/[–—]/.test(h), "no dashes in the admin line");
}

// 6. The nightly step (docs/nightly-workflow.yml, the copy of record): the key never on curl's command line, and a
//    failure names the HTTP status and the body's first line.
{
  const y = fs.readFileSync(new URL("../docs/nightly-workflow.yml", import.meta.url), "utf8");
  const a = y.indexOf("- name: Recompute and persist partner premiums"), step = y.slice(a, y.indexOf("\n  cube:", a));
  ok(a > 0 && /-H @-/.test(step) && /printf 'x-ops-key: %s\\n' "\$PROBE_KEY" \|/.test(step), "key reaches curl on stdin");
  ok(!/-H "x-ops-key: \$\{?PROBE_KEY/.test(step) && !/opskey=/.test(step), "key never in curl's arguments or the address");
  ok(/::error::Premium recompute request FAILED: HTTP \$\{status\}/.test(step) && /Body: \$\{first:-empty\}/.test(step), "failure names status and body line");
  ok(/case "\$status" in 000\|429\|502\|503\)/.test(step) && /for attempt in 1 2 3/.test(step), "retries only fast transient answers, three tries");
}

console.log(`premiumFreshCheck: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
