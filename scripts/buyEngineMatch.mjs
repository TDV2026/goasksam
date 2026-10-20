// LIVE: this script calls production (goasksam.com). Run it only in a gap the lanes name, with the protection-bypass header (Lane F's rule, Oct 20 2026).
// BUY CARD vs ENGINE (Lane C, Oct 15 2026): every Buy card's range and count against a fresh engine read of the
// listing's own car, its title as typed into Market Check, on the same engine version. Exits 1 on any difference.
// Live and read-only: the Buy page and its enrich answer, and the keyed enginecheck ops task (zero writes, zero
// OldCarsData). The probe key comes from the environment, goes only in the x-ops-key header, never printed.
//   PROBE_KEY=... node scripts/buyEngineMatch.mjs "1965 Ferrari 330 GT2 Coupe" "997 Carrera" ...
import puppeteer from "puppeteer-core";
const K = process.env.PROBE_KEY, HOST = "goasksam.com";
const qs = process.argv.slice(2).filter(a => !a.startsWith("--"));
if (!K || !qs.length) { console.error("usage: PROBE_KEY=... node scripts/buyEngineMatch.mjs <search> ..."); process.exit(2); }
const chrome = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const b = await puppeteer.launch({ executablePath: chrome, headless: "new", args: ["--no-sandbox"], protocolTimeout: 900000 });
const p = await b.newPage(); await p.setRequestInterception(true);
p.on("request", r => { let own = false; try { own = new URL(r.url()).host === HOST; } catch (e) {} r.continue(own ? { headers: { ...r.headers(), "x-ops-key": K, "x-launch-stage-test": "2" } } : undefined); });
// The card's own words, cleaned the way the card's spec reads its title (lib/live/search.js specOf).
const asTyped = t => String(t || "").replace(/^\s*[\d,.]+\s*k?\s*-?\s*mile[s]?\b/i, "").replace(/\s+\d+[- ]speed\b/ig, "").trim();
const enrich = ids => p.evaluate(async ids => (await fetch("/api/buySearch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "enrich", ids }) })).json(), ids);
const engine = specs => p.evaluate(async u => { const r = await fetch(u); /* the key header is added by the request handler above */ return r.ok ? r.json() : { error: r.status }; },
  "/api/usageDashboard?view=ops&task=enginecheck&buypaths=0&livefences=0&representative=0&splitpools=0&overtime=0&livelisting=0&cacheconsistency=0&formpairs=0&identitycounts=0&specs=" + encodeURIComponent(specs.join("|")));
let same = 0, diff = 0, pend = 0;
for (const q of qs) {
  await p.goto(`https://${HOST}/buy?q=` + encodeURIComponent(q), { waitUntil: "networkidle2", timeout: 90000 }).catch(() => {});
  for (let i = 0; i < 45 && !(await p.evaluate(() => !!document.querySelector(".msg.results[data-done]"))); i++) await new Promise(r => setTimeout(r, 2000));
  const ids = await p.evaluate(() => [...document.querySelectorAll(".msg.results article.car:not(.skel)")].filter(a => !a.hidden).map(a => Number(a.dataset.id)));
  // The cards' markets as the page reads them, asked until none is pending (up to about two minutes).
  let e = null;
  for (let i = 0; i < 8; i++) { e = await enrich(ids); if (!(e.cards || []).some(c => !c.market || c.market.kind === "pending")) break; await new Promise(r => setTimeout(r, 15000)); }
  const titles = await p.evaluate(ids => Object.fromEntries(ids.map(id => { const a = document.querySelector(`article.car[data-id="${id}"]`); return [id, { title: a.querySelector(".trow h3").textContent.trim(), sam: [...a.querySelectorAll(".sl p")].map(x => x.textContent).join(" ") }]; })), ids);
  const v0 = e.engineVersion;
  const want = [...new Set((e.cards || []).map(c => asTyped(titles[c.id] && titles[c.id].title)))];
  const rows = {};
  for (let i = 0; i < want.length; i += 3) { const j = await engine(want.slice(i, i + 3)); for (const r of (j.rows || [])) rows[r.q] = r; }
  const v1 = (await enrich(ids.slice(0, 1))).engineVersion;
  console.log(`== ${q}  (engine ${v0}${v1 !== v0 ? `, CHANGED to ${v1} during the check` : ""})`);
  if (v1 !== v0) diff++;
  for (const c of e.cards || []) {
    const t = asTyped(titles[c.id] && titles[c.id].title), m = c.market || {}, mc = rows[t] && rows[t].lanes && rows[t].lanes.marketCheck;
    if (!m.kind || m.kind === "pending") { pend++; console.log(`  PENDING ${c.id} "${t}"`); continue; }
    if (!mc) { diff++; console.log(`  NO ENGINE READ ${c.id} "${t}"`); continue; }
    const cl = m.kind === "range" ? [m.low, m.high] : [null, null], el = [mc.low ?? null, mc.high ?? null];
    const shown = /\$([\d,]+) to \$([\d,]+)/.exec(titles[c.id].sam || ""), sl = shown ? shown.slice(1).map(x => Number(x.replace(/,/g, ""))) : null;
    const ok = (m.count || null) === (mc.count || null) && cl[0] === el[0] && cl[1] === el[1] && (!sl || (sl[0] === el[0] && sl[1] === el[1]));
    ok ? same++ : diff++;
    console.log(`  ${ok ? "SAME" : "DIFF"} ${c.id} "${t}": Buy ${m.count} ${cl.join("-")} ("${m.query}")${sl ? ` shown ${sl.join("-")}` : ""} | Market Check ${mc.count} ${el.join("-")} ("${mc.rungLabel || mc.label || ""}")`);
  }
}
await b.close();
console.log(`buyEngineMatch: ${same} same, ${diff} different, ${pend} still pending`);
process.exit(diff ? 1 : 0);
