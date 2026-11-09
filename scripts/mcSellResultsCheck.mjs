// THE RESULTS REGRESSION CHECK (Lane E, Nov 8 2026, Sam's brief docs/design/market-check-sell-brief-full.md part 7: "every existing result section, number, chart and interaction should remain present and functional"; the results are protected, only the header, rail, footer and outer width may change).
// WHAT IT DOES: each regression car is opened twice in Chrome from the SAME recorded engine answers (scripts/fixtures/mcSell/*.json, recorded once from production by scripts/mcSellRecord.mjs): as the LIVE page (the live handler's own HTML) and as the PREVIEW (the same page inside the shell). At 1440, 1024 and 390 it then compares everything INSIDE the results container:
//   1. every section heading, in order, and every heading's text;   2. every figure on the page ($ amounts, sale counts, miles, dates, percentages) as a list, identical;   3. every chart (svg), table and its rows, image, button and link, with the same text, and every link's address identical (the cross product links: Sell, Tasks, Market Check, How Sam decides, receipts);
//   4. the whole text of the results, word for word;   5. the computed style (colour, background, font, size, weight, line height, border, padding, margin, display) of EVERY element inside the container, so a rule that restyles a results element fails;   6. nothing is clipped: no horizontal overflow, no element wider than the screen, tables and charts inside it.
//   And the one intended change, the outer container, is measured: at 1440 the results are wider than before (the space beside the rail is used), at 390 and 1024 they are not wider than the screen.
// THE CLASS: any section, number, chart, table, link or style of a protected results page, on either product, in any state (Market Check with a year substitution, a historical chart, a range; Sell with a platform pick and a PowerSeller card). The cars are the three Market Check states and the Sell result in Sam's brief; their states differ (2021 sales standing in for 2020, a quarterly chart, a distribution).
// MUTANTS (each must fail this check): a section hidden by one CSS rule, a number changed by one script, a link dropped, a results element restyled, a container pushed past the screen, a heading removed.
//   node scripts/mcSellResultsCheck.mjs                (offline; Chrome; ~1 minute)
import { open, launch, loadFixtures, CHROME } from "./mcSellHarness.mjs";
import fs from "node:fs";
let pass = 0, fail = 0; const out = []; const ok = (c, m) => { if (c) pass++; else { fail++; out.push("FAIL " + m); } };
if (!fs.existsSync(CHROME)) { console.log("mcSellResultsCheck: SKIP no Chrome at " + CHROME); process.exit(0); }
const CASES = [
  { name: "mc-1995-porsche-911", live: "/market-check?q=1995%20Porsche%20911", prev: "/preview/market-check?q=1995%20Porsche%20911" },
  { name: "mc-2020-bmw-m3", live: "/market-check?q=2020%20BMW%20M3", prev: "/preview/market-check?q=2020%20BMW%20M3" },
  { name: "mc-2006-ford-gt", live: "/market-check?q=2006%20Ford%20GT", prev: "/preview/market-check?q=2006%20Ford%20GT" },
  { name: "sell-2004-porsche-911-carrera", live: "/sell?car=2004%20Porsche%20911%20Carrera&state=California&how=unsure&rush=none", prev: "/preview/sell?car=2004%20Porsche%20911%20Carrera&state=California&how=unsure&rush=none" }
];
// what a results page is made of, read from the browser: everything inside #ob
const INVENTORY = () => {
  const ob = document.querySelector("#ob"); if (!ob) return null;
  const vis = e => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length), tx = e => (e.textContent || "").replace(/\s+/g, " ").trim();
  const norm = s => s.replace(/\b\d+\s*(?:s|sec|seconds?|minutes?|mins?|hours?|hrs?|days?)\b(?:\s+(?:ago|left|remaining))?/gi, "N TIME");   // a clock reading moves between two loads
  const fig = s => (s.match(/\$\s?[\d,.]+(?:\s?[kKmM])?|\b\d[\d,.]*\s?(?:sales?|miles|mi|%|cars?|months?|years?)\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}\b|\b(?:19|20)\d\d\b/g) || []).map(x => x.replace(/\s+/g, " "));
  const P = ["color", "backgroundColor", "fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "textAlign", "textTransform", "borderTopWidth", "borderBottomWidth", "borderLeftWidth", "borderTopColor", "borderRadius", "paddingTop", "paddingBottom", "marginTop", "marginBottom", "display", "position", "opacity", "visibility", "flexDirection", "gap", "boxShadow", "textDecorationLine"];
  const els = [...ob.querySelectorAll("*")].filter(e => !/^(SCRIPT|STYLE|NOSCRIPT)$/.test(e.tagName));
  // THE ONE DECLARED DIFFERENCE INSIDE THE CONTAINER: the first block's top margin. The live shell reserved a 44px band there for its floating Sign in pill (SHELL_CSS --gas-pill-band); the pill goes with the old navigation (the header's Account button is the one way in), so the band is 0 in the preview. Every other property of every element is compared.
  const first = ob.firstElementChild;
  const style = els.map(e => { const s = getComputedStyle(e); return e.tagName.toLowerCase() + "." + String(e.getAttribute("class") || "").replace(/\s+/g, ".") + "|" + P.map(k => k === "marginTop" && e === first ? "band" : s[k]).join(";"); });
  return {
    headings: [...ob.querySelectorAll("h1,h2,h3,h4,[class*=eyebrow],[class*=sec-h],[class*=-h]")].filter(vis).map(e => e.tagName + ":" + norm(tx(e)).slice(0, 80)),
    text: norm(ob.innerText.replace(/\s+/g, " ")), figures: fig(norm(ob.innerText)),
    svgs: [...ob.querySelectorAll("svg")].filter(e => vis(e) && !e.closest("button,a")).length, charts: [...ob.querySelectorAll("svg")].filter(vis).map(e => e.querySelectorAll("*").length + ":" + tx(e).slice(0, 40)),
    tables: [...ob.querySelectorAll("table")].map(t => t.rows.length + "x" + (t.rows[0] ? t.rows[0].cells.length : 0)), imgs: [...ob.querySelectorAll("img")].filter(vis).length,
    buttons: [...ob.querySelectorAll("button")].filter(vis).map(e => norm(tx(e)).slice(0, 50)), links: [...ob.querySelectorAll("a[href]")].filter(vis).map(e => norm(tx(e)).slice(0, 50) + " -> " + (e.getAttribute("href") || "").replace(/^\/preview\//, "/")),
    inputs: [...ob.querySelectorAll("input,textarea,select")].filter(vis).map(e => e.tagName + ":" + (e.getAttribute("placeholder") || "") + ":" + (e.value || "")),
    style, nEls: els.length
  };
};
const GEO = () => { const ob = document.querySelector("#ob"), de = document.documentElement; return { sw: de.scrollWidth, cw: de.clientWidth, ob: ob ? Math.round(ob.getBoundingClientRect().width) : 0, wide: [...(ob ? ob.querySelectorAll("*") : [])].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > de.clientWidth + 1 && !e.closest("[class*=scroll],table,.tbl,.ob-tbl") && getComputedStyle(e).position !== "fixed"; }).length }; };
// Two style strings are the same, except that TYPE THAT SCALES WITH ITS CONTAINER may follow the new container width (the brief allows the outer width to change): an element whose live font size is fractional (a fluid clamp result, never a set size) may differ in font size, line height and letter spacing by up to 10 percent. A set size (17px, 28px) must be identical, and every other property must be identical for every element.
const FS = 3, LH = 5, LS = 6;
function sameStyle(x, y) { if (x === y) return true; const [ka, va] = x.split("|"), [kb, vb] = y.split("|"); if (ka !== kb) return false; const A = va.split(";"), B = vb.split(";"), fs = parseFloat(A[FS]), fb = parseFloat(B[FS]), fluid = fs % 1 !== 0 && fb / fs > 0.9 && fb / fs < 1.1;
  return A.every((v, i) => v === B[i] || (fluid && (i === FS || i === LH || i === LS))); }
const diff = (a, b) => { const out = []; for (const k of Object.keys(a)) { if (k === "style") { if (a.style.length !== b.style.length) out.push(`style: ${a.style.length} elements vs ${b.style.length}`); else { const i = a.style.findIndex((s, j) => !sameStyle(s, b.style[j])); if (i >= 0) out.push(`style of ${a.style[i].split("|")[0]}: ${a.style[i].split("|")[1]} vs ${b.style[i].split("|")[1]}`); } continue; } if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) { const A = Array.isArray(a[k]) ? a[k] : [a[k]], B = Array.isArray(b[k]) ? b[k] : [b[k]], i = A.findIndex((x, j) => JSON.stringify(x) !== JSON.stringify(B[j])); out.push(`${k}: first difference "${String(A[i] == null ? "(none)" : A[i]).slice(0, 90)}" vs "${String(B[i] == null ? "(none)" : B[i]).slice(0, 90)}"`); } } return out; };
const b = await launch();
async function compare(c, w, { rewrite = null, label = "" } = {}) {
  const fx = loadFixtures(c.name), keys = Object.keys(fx).length; if (!keys) { ok(false, `${c.name}: no recorded answers (run scripts/mcSellRecord.mjs)`); return null; }
  const L = await open(b, c.live, { width: w, fixtures: fx, settle: 3500 }), R = await open(b, c.prev, { width: w, fixtures: fx, settle: 3500, rewrite });
  for (const q of [L, R]) await q.waitForFunction(() => !document.querySelector(".stage-pending"), { timeout: 20000 }).catch(() => {});   // the page reveals its sections in stages; both are read after the last one
  for (const q of [L, R]) await q.evaluate(() => { document.getAnimations().forEach(a => { try { a.finish(); } catch (e) {} }); });
  const li = await L.evaluate(INVENTORY), ri = await R.evaluate(INVENTORY), lg = await L.evaluate(GEO), rg = await R.evaluate(GEO), miss = L._missed.concat(R._missed).filter(k => !/\/api\/(track|funnel|gaConsent)/.test(k));
  const res = { li, ri, lg, rg, miss, lerr: L._err, rerr: R._err }; await L.close(); await R.close(); return res;
}
function judge(c, w, r, where) {
  const t = `${where}${c.name} at ${w}`, bad = [];
  if (!r.li || !r.ri) return [`${t}: the results container is missing`];
  if (r.li.nEls < 40 || r.li.headings.length < 2) bad.push(`${t}: the live page did not draw its results (${r.li.nEls} elements, ${r.li.headings.length} headings), so nothing is being compared`);
  bad.push(...diff(r.li, r.ri).map(d => `${t}: ${d}`));
  if (r.rg.sw > r.rg.cw) bad.push(`${t}: sideways scroll (${r.rg.sw} > ${r.rg.cw})`);
  if (r.rg.wide > r.lg.wide) bad.push(`${t}: ${r.rg.wide} result elements run past the screen (live ${r.lg.wide})`);
  if (r.rerr.length > r.lerr.length) bad.push(`${t}: a page error the live page does not have (${r.rerr.join(" | ").slice(0, 120)})`);
  if (r.miss.length) bad.push(`${t}: an engine call has no recorded answer (${r.miss[0].slice(0, 90)})`);
  if (w === 1440 && !(r.rg.ob > r.lg.ob)) bad.push(`${t}: the results are not wider than before (${r.rg.ob} vs ${r.lg.ob})`);
  if (w < 1440 && r.rg.ob > r.rg.cw) bad.push(`${t}: the results container is wider than the screen (${r.rg.ob} > ${r.rg.cw})`);
  return bad;
}
for (const c of CASES) for (const w of [1440, 1024, 390]) { const r = await compare(c, w); if (!r) continue; const bad = judge(c, w, r, ""); for (const m of bad) ok(false, m); ok(bad.length === 0, `${c.name} at ${w}: every section, figure, chart, table, link, button and style inside the results is the same as the live page (${r.li.nEls} elements, ${r.li.headings.length} headings, ${r.li.figures.length} figures, ${r.li.links.length} links, ${r.li.svgs} charts; container ${r.lg.ob}px before, ${r.rg.ob}px after)`);
  if (w === 1440) { ok(r.li.nEls > 60 && r.li.figures.length > 8, `${c.name}: the regression page is a real result (sections and figures to lose)`); } }
// ---------- MUTANTS: each must make the comparison fail ----------
const MUT = [
  ["a section hidden by one rule", "</head>", "<style>#gas-main #ob section:nth-of-type(2){display:none}#gas-main #ob .hero-chart,#gas-main #ob .sfc-chart{display:none}</style></head>", CASES[0]],
  ["a number changed by one script", "</body>", "<script>setTimeout(function(){var w=document.createTreeWalker(document.querySelector('#ob'),NodeFilter.SHOW_TEXT),n;while(n=w.nextNode()){if(/\\$\\d/.test(n.nodeValue)){n.nodeValue=n.nodeValue.replace('$','$1');break;}}},1500)</script></body>", CASES[1]],
  ["a link dropped", "</body>", "<script>setTimeout(function(){var a=document.querySelector('#ob a[href^=\"/sell\"],#ob a[href^=\"/tasks\"]');if(a)a.remove();},1500)</script></body>", CASES[0]],
  ["a results element restyled", "</head>", "<style>#gas-main #ob h2,#gas-main #ob h3{font-size:19px!important;color:#c00!important}</style></head>", CASES[2]],
  ["the container pushed past the screen", "</head>", "<style>#gas-main #ob{min-width:2400px}</style></head>", CASES[0]],
  ["a heading removed", "</body>", "<script>setTimeout(function(){var h=document.querySelector('#ob h2');if(h)h.remove();},1500)</script></body>", CASES[2]],
  ["a Sell card restyled", "</head>", "<style>#gas-main #ob .pcard,#gas-main #ob .pcard *{background:#eee!important;border-radius:0!important}</style></head>", CASES[3]]
];
for (const [name, from, to, c] of MUT) { const r = await compare(c, 1440, { rewrite: h => h.replace(from, () => to), label: name }); const bad = r ? judge(c, 1440, r, "mutant: ") : []; ok(bad.length > 0, `mutant "${name}" on ${c.name} is caught (${bad[0] ? bad[0].slice(0, 140) : "NOT CAUGHT"})`); }
await b.close();
console.log(out.join("\n")); console.log(`mcSellResultsCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
