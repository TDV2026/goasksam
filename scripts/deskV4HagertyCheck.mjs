// DESK V4, HAGERTY AS HIGHLIGHTING (Lane S, Nov 14 2026; Stage 3 redesigned: no block). A sale whose venue is Hagerty is drawn, ordered and filterable; nothing about Hagerty appears on a view with none.
//   1 DOTS: every Hagerty sale is a dot in the palette's second colour (--an), the others keep theirs; the legend names "Hagerty sale" only when at least one Hagerty dot is on the chart.
//   2 CLOSEST SALES: the Hagerty rows come first, each with a small Hagerty mark; the order inside each group is the model's.
//   3 THE CHIP: beside the condition chips, "Hagerty" with desk.hagerty.count AS SENT (never counted from the rows), only when the count for the view is above 0.
//   4 SELECTING IT: the chart and the list keep the Hagerty sales, desk.hagerty.line shows under the chart (with medianLine and lastLine when sent); deselecting restores the view; a view switch to one with none clears it.
//   5 NOTHING AT ALL on a view with no Hagerty sales: no chip, no legend entry, no mark, no sentence.
//   6 THE PAGE COMPUTES NOTHING: no block, no formatting or counting in the Hagerty code; mutants: the chip counts rows instead of reading desk.hagerty.count, the old order, one colour, no legend rule, the chip shown at a count of 0, the list not filtered.
//   CLASS: every surface that draws sales from the model (the chart's dots and Closest sales) treats a Hagerty row the same way: the check walks every flagged id through both.
//   node scripts/deskV4HagertyCheck.mjs
import fs from "node:fs"; import path from "node:path";
import { launch, openLive, tally, ROOT, V3, PV } from "./deskV4Harness.mjs";
const { ok, done } = tally(), wait = ms => new Promise(r => setTimeout(r, ms)), b = await launch();
const LINE = "Hagerty sold 5 of the 39. Median $18,250 against $17,900 across all venues.", MEDLINE = "Median $18,250", LASTLINE = "Last sold 2 October 2026 for $19,101", COUNT = 5;   // 5 on purpose: the model has two Hagerty sale rows and three comparable rows, so a page that counts rows says something else
const mark = (x, flag) => ({ ...x, ...(flag ? { platform: "Hagerty", venue: "hagerty" } : {}) });
const SALE_IDX = [2, 9], COMP_IDX = [3, 7, 20];
const model = (flag, hag) => k => { const d = { ...k.desk }; d.sales = d.sales.map((s, i) => mark(s, flag && SALE_IDX.includes(i))); d.comparables = d.comparables.map((c, i) => mark(c, flag && COMP_IDX.includes(i))); d.hagerty = hag; k.desk = d; };
const HAG = { venue: "Hagerty", count: COUNT, median: 18250.4, last: null, line: LINE, medianLine: MEDLINE, lastLine: LASTLINE, sellerLine: "S" }, ZERO = { venue: "Hagerty", count: 0, median: null, last: null, line: "Hagerty has not sold one of these in the last 12 months.", sellerLine: null };
const give = mut => html => { const m = /window\.__V4__=([\s\S]*?);window\.__DESK_V3__/.exec(html), o = JSON.parse(m[1]); mut(o.kase); return html.replace(m[0], "window.__V4__=" + JSON.stringify(o).replace(/</g, "\\u003c") + ";window.__DESK_V3__"); };
const page = async (mut, extra = {}) => openLive(b, { ...extra, mutate: h => { const x = mut ? give(mut)(h) : h; return extra.html ? extra.html(x) : x; } });
const READ = () => { const g = i => document.getElementById(i), vis = e => !!e && !e.hidden && e.offsetWidth > 0 && e.offsetHeight > 0, K = window.__v4.K(), cs = getComputedStyle(document.documentElement), an = cs.getPropertyValue("--an").trim().toLowerCase(), evd = cs.getPropertyValue("--ev-dot").trim().toLowerCase();
  const dots = [...document.querySelectorAll("#plot circle.dot")].map(c => ({ id: c.dataset.sale, h: c.dataset.hagerty === "1", fill: (c.getAttribute("fill") || "").toLowerCase() }));
  const rows = [...document.querySelectorAll("#comps .comp")].map(r => ({ id: r.dataset.comp, hidden: r.hidden || r.offsetHeight === 0, mark: (r.querySelector(".hmark") || {}).textContent || null }));
  const chip = g("hgchip"), lg = g("lg-hagerty"), ln = g("hgline");
  return { an, evd, dots, rows, chip: chip && vis(chip) ? chip.textContent : null, chipOn: chip ? chip.getAttribute("aria-pressed") : null, count: g("hgcount") ? g("hgcount").textContent : null, beside: chip ? chip.getBoundingClientRect().top - g("cond").getBoundingClientRect().top : null, legend: vis(lg) ? lg.textContent : null, line: vis(ln) ? [...ln.querySelectorAll("span")].map(x => x.textContent) : null, lineTop: vis(ln) ? ln.getBoundingClientRect().top : null, plotBottom: g("plot").getBoundingClientRect().bottom, market: g("s-market").innerText, order: K.desk.comparables.map(c => String(c.id)), saleIds: K.desk.sales.map(s => String(s.id)) }; };
const SHOWN = r => r.rows.filter(x => !x.hidden).map(x => x.id);

const p = await page(model(true, HAG)), r = await p.evaluate(READ);
const flaggedSales = SALE_IDX.map(i => r.saleIds[i]), flaggedComps = COMP_IDX.map(i => r.order[i]);
{ // 1 DOTS
  const hd = r.dots.filter(d => d.h), other = r.dots.filter(d => !d.h);
  ok(hd.length === 2 && hd.every(d => flaggedSales.includes(d.id) && d.fill === r.an) && other.length === r.saleIds.length - 2 && other.every(d => d.fill === r.evd || d.fill !== r.an), "every Hagerty sale is a dot in the second colour (--an) and the others keep theirs", JSON.stringify([hd.length, r.an, hd.map(d => d.fill)]));
  ok(r.legend === "Hagerty sale", "the legend names Hagerty sale when a Hagerty dot is on the chart", String(r.legend));
  const noh = await (await page(model(false, ZERO))).evaluate(READ); ok(noh.legend === null && noh.dots.every(d => !d.h), "with no Hagerty sale the legend does not name Hagerty and no dot is marked"); }

{ // 2 CLOSEST SALES ORDER AND MARK
  const first = r.rows.slice(0, 3), rest = r.rows.slice(3), orderH = r.order.filter(id => flaggedComps.includes(id)), orderRest = r.order.filter(id => !flaggedComps.includes(id));
  ok(first.map(x => x.id).join() === orderH.join() && first.every(x => x.mark === "Hagerty"), "the Hagerty rows come first, each with a small Hagerty mark, in the model's order among themselves", JSON.stringify(first));
  ok(rest.map(x => x.id).join() === orderRest.join() && rest.every(x => x.mark === null), "the other rows follow in the model's order with no mark");
  ok(flaggedSales.length === 2 && flaggedComps.length === 3 && r.rows.filter(x => x.mark).length === 3 && r.dots.filter(d => d.h).length === 2, "CLASS: each flagged sale is treated the same on both surfaces (dots and list), none missed", JSON.stringify([r.rows.filter(x => x.mark).length, r.dots.filter(d => d.h).length])); }

{ // 3 THE CHIP
  ok(r.chip !== null && /Hagerty/.test(r.chip) && r.count === String(COUNT), `the chip reads Hagerty and desk.hagerty.count as sent (${COUNT}, though the rows number two and three)`, JSON.stringify([r.chip, r.count]));
  ok(r.beside !== null && Math.abs(r.beside) < 40, "it sits beside the condition chips", String(r.beside)); }

{ // 4 SELECTING IT
  await p.bringToFront(); await p.click("#hgchip"); await wait(200); const s1 = await p.evaluate(READ), vis = SHOWN(s1);   // the page was opened before others: a click on a page in the background never lands
  ok(s1.chipOn === "true" && s1.dots.length === 2 && s1.dots.every(d => d.h) && vis.length === 3 && vis.every(id => flaggedComps.includes(id)), "selected: the chart and the list keep the Hagerty sales only", JSON.stringify([s1.chipOn, s1.dots.length, vis.length]));
  ok(s1.line && s1.line[0] === LINE && s1.line[1] === MEDLINE && s1.line[2] === LASTLINE && s1.lineTop >= s1.plotBottom - 1, "desk.hagerty.line shows under the chart, with the median and last lines as sent", JSON.stringify(s1.line));
  await p.click("#hgchip"); await wait(200); const s2 = await p.evaluate(READ);
  ok(s2.chipOn === "false" && s2.dots.length === r.saleIds.length && SHOWN(s2).length === r.order.length && s2.line === null, "deselected: the view is restored and the line is gone", JSON.stringify([s2.dots.length, SHOWN(s2).length, s2.line]));
  const ans = async hag => { const g = await PV.previewDeskApi({ action: "case_get", id: V3.DEMO_ID }); const k = g.case; model(hag.count > 0, hag)(k); k.desk.windows = [3, 6, 12, 24].map(x => ({ months: x, label: x + " months" })); return { ok: true, id: V3.DEMO_ID, case: k }; };
  const q = await page(model(true, HAG), { intercept: async bd => (bd.action === "case_edit" && bd.op === "window" ? ans(ZERO) : undefined) });
  await q.click("#hgchip"); await wait(150); await q.evaluate(() => { const b = [...document.querySelectorAll("#period button")].find(x => !x.classList.contains("on")); b.setAttribute("data-pick", "1"); }); await q.click("#period button[data-pick]"); await wait(900); const s3 = await q.evaluate(READ);
  ok(s3.chip === null && s3.legend === null && s3.line === null && s3.dots.every(d => !d.h) && s3.rows.every(x => !x.hidden && x.mark === null), "switching to a view with no Hagerty sale clears the selection and everything Hagerty", JSON.stringify([s3.chip, s3.legend, s3.line, s3.rows.filter(x => x.hidden).length])); }

{ // 5 NOTHING AT ALL
  const z = await (await page(model(false, ZERO))).evaluate(READ);
  ok(z.chip === null && z.legend === null && z.line === null && z.rows.every(x => x.mark === null) && !/Hagerty/i.test(z.market), "a view with no Hagerty sales shows no chip, no legend entry, no mark and no sentence", JSON.stringify([z.chip, z.legend, z.line]));
  const n = await (await page(k => { const d = { ...k.desk }; delete d.hagerty; k.desk = d; })).evaluate(READ); ok(n.chip === null && n.legend === null, "a model with no desk.hagerty shows none of it");
  const c0 = await (await page(model(true, { ...ZERO, count: 0 }))).evaluate(READ); ok(c0.chip === null, "a count of 0 shows no chip, whatever the rows say"); }

{ // 6 THE PAGE COMPUTES NOTHING
  const src = fs.readFileSync(path.join(ROOT, "lib/preview/deskV4Client.js"), "utf8"), i = src.indexOf("function hagerty()"), body = src.slice(src.indexOf("var hgOn = false;"), src.indexOf("function rungline()", i)).replace(/\/\/[^\n]*/g, "");
  ok(i > 0 && !/toLocaleString|toFixed|Math\.|Intl\.|parseFloat|\.length\s*[+\-*]|\.reduce\(/.test(body) && !/Sold on Hagerty/.test(src) && !/id="hagerty"/.test(fs.readFileSync(path.join(ROOT, "lib/preview/deskV4.js"), "utf8")), "no block, and no formatting or counting in the Hagerty code");
  const m1 = await (await page(model(true, HAG), { html: h => h.replace('el("small", { id: "hgcount", text: String(h.count) })', 'el("small", { id: "hgcount", text: String((desk().sales || []).filter(isH).length) })') })).evaluate(READ); ok(m1.count !== String(COUNT), "mutant caught: the chip counts the Hagerty rows on the page instead of reading desk.hagerty.count (" + m1.count + ")");
  const m2 = await (await page(model(true, HAG), { html: h => h.replace("rows = list.filter(isH).concat(list.filter(function (c) { return !isH(c); }));", "rows = list.slice();") })).evaluate(READ); ok(m2.rows.slice(0, 3).some(x => x.mark === null), "mutant caught: the Hagerty rows not first");
  const m3 = await (await page(model(true, HAG), { html: h => h.replace("fill: isH(s) ? an : on ? evc : evd", "fill: on ? evc : evd") })).evaluate(READ); ok(m3.dots.filter(d => d.h).every(d => d.fill !== m3.an), "mutant caught: a Hagerty dot in the ordinary colour");
  const m4 = await (await page(model(false, ZERO), { html: h => h.replace("lgh.hidden = !salesShown().some(isH);", "lgh.hidden = false;") })).evaluate(READ); ok(m4.legend === "Hagerty sale", "mutant caught: the legend named with no Hagerty dot");
  const m5 = await (await page(model(false, ZERO), { html: h => h.replace("function hgCount() { var h = desk().hagerty; return h && h.count > 0 ? h.count : 0; }", "function hgCount() { var h = desk().hagerty; return h ? 1 : 0; }") })).evaluate(READ); ok(m5.chip !== null, "mutant caught: the chip shown at a count of 0");
  const m6 = await page(model(true, HAG), { html: h => h.replace("function hFilter() { rows.forEach(function (c) { var r = document.querySelector('[data-comp=\"' + c.id + '\"]'); if (r) r.hidden = hgOn && !isH(c); }); }", "function hFilter() {}") }); await m6.click("#hgchip"); await wait(200); ok(SHOWN(await m6.evaluate(READ)).length > 3, "mutant caught: the list not filtered when the chip is selected"); }

await b.close(); done();
