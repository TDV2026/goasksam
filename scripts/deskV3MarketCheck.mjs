// DESK V3 MARKET EVIDENCE (Lane E, Nov 8 2026): the tab prints desk.* as the engine sent it, original beside current, every comparable with its photo slot, why sentence, relevance, link, exclude with a required reason and a scope,
// excluded rows greyed in place (never removed), a quarter with shown false drawn as nothing, current listings labelled Bid, Ask or Not sold, the population's outsiders with the engine's sentence. The page computes nothing.
//   node scripts/deskV3MarketCheck.mjs      (offline, Chrome; mutants must be caught)
import { demoHtml, V3, FX, RW, CN, launch, openPage, tally } from "./deskV3Harness.mjs";
import { demoCaseRecord } from "../lib/preview/deskV3Fixture.js";
const { ok, done } = tally(), kase = await demoCaseRecord(), d = kase.desk;
const page = k => V3.pageHtml({ cases: [{ id: "x", car: "1999 Porsche 911 Carrera", spec: "", seller: "S", ref: "x", age: "1 d", submitted: "2026-11-08", status: "New", group: "new", photo: null, demo: true }], activeId: "x", kase: k, sheet: null });
// the recorded read of the 996 held no listing for sale or ended on the day it was read, so the label mutants run on a variant that carries test listings formatted by the engine's own liveOf (test inputs, not part of the preview)
const { liveOf } = await import("../lib/deskV3.js"), liveK = structuredClone(kase); liveK.desk.live = liveOf([{ listing_title: "1999 Porsche 911 Carrera", platform: "Bring a Trailer", current_bid_usd: 30000, end_time: "2099-01-01T00:00:00Z", listing_url: "https://example.test/l/1" }, { listing_title: "1999 Porsche 911 Carrera", platform: "Cars & Bids", status: "no sale", current_bid_usd: 28000, listing_url: "https://example.test/l/2" }]);
const mk = h => (h.match(/<div class="mk4">[\s\S]*?<\/div><\/div>\s*<div class="pn" id="pn-decision"/) || h.match(/<div class="mk4">[\s\S]*$/) || [""])[0];
const text = h => mk(h).replace(/<[^>]+>/g, "\n").split("\n").map(x => x.trim()).filter(Boolean);
function assertions(k, h) {
  const bad = [], m = mk(h), t = text(h);
  if (!m) return ["no market tab"];
  const ev = k.desk.evidence, org = k.desk.original;
  const cols = [...m.matchAll(/<div class="evc"><h3>([^<]*)<\/h3><dl>([\s\S]*?)<\/dl>/g)].map(x => [x[1], [...x[2].matchAll(/<dt>([^<]*)<\/dt><dd>([^<]*)<\/dd>/g)].map(y => [y[1], y[2]])]);
  for (const [title, e] of [["Original engine result", org], ["Current selected set", ev]]) { const col = cols.find(c => c[0] === title); if (!col) continue; const get = n => (col[1].find(r => r[0] === n) || [])[1]; if (!e.insufficient) { if (get("Median") !== RW.moneyWords(e.median)) bad.push(`${title}: the median is not the engine's (${get("Median")})`); if (get("Typical range") !== RW.moneyWords(e.q1) + " to " + RW.moneyWords(e.q3)) bad.push(`${title}: the typical range is not the engine's`); if (get("Sales") !== CN.countNoun(e.count, "sale", { words: false })) bad.push(`${title}: the count is not the engine's`); } }
  if (!/Original engine result/.test(m) || !/Current selected set/.test(m) || (m.match(/class="evc"/g) || []).length !== 2) bad.push("original and current are not side by side");
  for (const c of k.desk.comparables) { const row = new RegExp(`<tr class="cp[^"]*" data-sale="${c.id}"`).exec(m); if (!row) bad.push(`comparable ${c.id} is not listed`); else { const seg = m.slice(row.index, m.indexOf("</tr>", row.index)); if (!seg.includes(c.why)) bad.push(`${c.id}: no why sentence`); if (c.url && !seg.includes(`href="${c.url}"`)) bad.push(`${c.id}: no listing link`); if (!/data-excl=/.test(seg)) bad.push(`${c.id}: no exclude`); if (!/Close|Similar/.test(seg)) bad.push(`${c.id}: no relevance`); } }
  for (const e of k.exclusions || []) { const row = new RegExp(`<tr class="cp ex[^"]*" data-sale="${e.saleId}"`).exec(m); if (!row) bad.push(`an excluded sale (${e.saleId}) is not greyed in place`); else if (!m.slice(row.index, m.indexOf("</tr>", row.index)).includes(e.reason)) bad.push(`an excluded sale shows no reason`); }
  if (!(k.exclusions || []).length && /<tr class="cp ex/.test(m)) bad.push("a row is greyed with no exclusion");
  const nq = (k.desk.quarters || []).filter(q => q.shown).length; if ((m.match(/<th scope="row">/g) || []).length !== nq) bad.push(`quarters drawn ${(m.match(/<th scope="row">/g) || []).length}, shown ${nq}`);
  for (const q of k.desk.quarters || []) if (!q.shown && m.includes(q.label)) bad.push(`a quarter with shown false is drawn (${q.label})`);
  for (const l of k.desk.live || []) { const lab = V3.LIVE_LABEL[l.type]; if (!lab || !t.includes(lab)) bad.push(`a live ${l.type} listing is not labelled ${lab}`); }
  for (const o of k.desk.outside || []) if (!m.includes(o.sentence.replace(/&/g, "&amp;"))) bad.push("an outside sentence is missing");
  if (!(k.desk.outside || []).length && /Outside the population/.test(m)) bad.push("an outside heading with nothing under it");
  if (!(k.desk.live || []).length && /Current listings/.test(m)) bad.push("a listings heading with nothing under it");
  return bad;
}
const real = assertions(kase, page(kase)); for (const b of real) ok(false, b); ok(!real.length, "the market tab prints the engine's evidence, comparables, quarters, listings and outsiders as sent");
// variants: an excluded sale, a quarter with shown false, no live, no outside
const withEx = structuredClone(kase); withEx.exclusions = [{ saleId: kase.desk.comparables[0].id, scope: "market_calc", reason: "A different car", at: "x" }, { saleId: kase.desk.comparables[1].id, scope: "report", reason: "Photos show a repaint", at: "x" }];
{ const b = assertions(withEx, page(withEx)); for (const x of b) ok(false, "excluded: " + x); ok(!b.length, "excluded sales stay in their rows, greyed, each with its scope and reason"); }
const hid = structuredClone(kase); hid.desk.quarters = [{ label: "Q2 2024", median: null, count: 1, shown: false }, ...hid.desk.quarters]; hid.desk.live = []; hid.desk.outside = [];
{ const b = assertions(hid, page(hid)); for (const x of b) ok(false, "sparse: " + x); ok(!b.length, "a quarter with shown false, no listings and no outsiders draw nothing"); }
// the exclusion needs a reason, in Chrome
{ const br = await launch(), p = await openPage(br, await demoHtml(), 1440, 900);
  await p.evaluate(() => document.querySelector('[data-tab="market"]').click()); await p.click("[data-excl]"); const dis = await p.$eval("[data-xgo]", b => b.disabled); ok(dis, "Exclude stays disabled until a reason is typed");
  await p.type(".xr", "Not the same car"); ok(!(await p.$eval("[data-xgo]", b => b.disabled)), "Exclude enables with a reason"); const opts = await p.$$eval(".xs option", o => o.map(x => x.textContent)); ok(opts.join() === "Report comps,Market calc", "scopes offered: " + opts);
  const wide = await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth); ok(wide, "no overflow at 1440");
  await p.setViewport({ width: 390, height: 800 }); await new Promise(r => setTimeout(r, 200)); ok(await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), "no overflow at 390 (the table scrolls inside its own box)"); await br.close(); }
// mutants
const M = [["a page computed median on the current side", h => h.replace(/(Current selected set[\s\S]*?<dd>)\$[\d,]+/, "$1$99,999")],
  ["an excluded row removed", h => h.replace(/<tr class="cp ex[\s\S]*?<\/tr>/, "")],
  ["a shown false quarter drawn", h => h.replace(/(<h2>By quarter<\/h2>[\s\S]*?<tbody>)/, "$1<tr><th scope=\"row\">Q2 2024</th><td>$1</td><td>1 sale</td></tr>")],
  ["a listing without its label", h => h.replace(">Not sold<", "><")],
  ["the exclude control removed from a row", h => h.replace(/<button type="button" class="lnk" data-excl="[^"]*">Exclude<\/button>/, "")],
  ["the original column dropped", h => h.replace("Original engine result", "Result")]];
for (const [n, fn] of M) { const base = n.startsWith("a listing") ? liveK : n.startsWith("an excluded") || n.startsWith("a shown") ? (n.startsWith("an excluded") ? withEx : hid) : kase; ok(assertions(base, fn(page(base))).length > 0, "mutant caught: " + n); }
done("deskV3MarketCheck");
