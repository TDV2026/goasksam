// DESK V4, SOLD ON HAGERTY (Lane S, Nov 14 2026; Stage 3). The block under What the market paid renders from desk.hagerty and nothing else:
//   1 THE FIGURES AS SENT: heading "Sold on Hagerty"; the count and the median as figures, the last sale as its title, date and price linked to its listing, and desk.hagerty.line beneath; each string exactly as the model sent it.
//   2 NO SALES: count 0 shows the line alone, no figure, no link; no desk.hagerty shows no block.
//   3 IT FOLLOWS THE SWITCHES: switching the period or the condition rerenders the block from the view the server answers with.
//   4 THE PAGE COMPUTES NOTHING: a mutant that formats a median on the page fails; a mutant that draws figures for a zero count fails; no formatting call in the block's source.
//   5 PAGE TWO OF THE MARKET REPORT (the on screen preview is the report PDF, built by case_pdf): desk.hagerty.sellerLine is on page two when the model carries it.
//   node scripts/deskV4HagertyCheck.mjs
import fs from "node:fs"; import path from "node:path";
import { launch, openLive, tally, imp, ROOT, V3, V4, PV } from "./deskV4Harness.mjs";
const { ok, done } = tally(), wait = ms => new Promise(r => setTimeout(r, ms)), b = await launch();
const H = { venue: "Hagerty", count: 3, median: 18250.4, medianLine: "$18,250", last: { date: "2026-10-02", price: 19100.6, priceLine: "$19,101", dateLine: "Oct 2, 2026", title: "1972 Datsun 240Z 4-Speed", url: "https://example.test/h/1" }, share: { hagerty: 3, all: 11 }, line: "Hagerty sold 3 of the 11. Median $18,250 against $17,900 across all venues.", sellerLine: "Hagerty sold 3 of these cars in the last 12 months. The last one made $19,101 in October." };
const H0 = { venue: "Hagerty", count: 0, median: null, last: null, share: { hagerty: 0, all: 9 }, line: "Hagerty has not sold one of these in the last 12 months.", sellerLine: null };
const H6 = { ...H, count: 1, median: 17000, medianLine: "$17,000", last: { ...H.last, title: "1972 Datsun 240Z", url: "https://example.test/h/2", priceLine: "$17,000", dateLine: "Sep 9, 2026" }, share: { hagerty: 1, all: 4 }, line: "Hagerty sold 1 of the 4. Median $17,000." };
const HC = { ...H, count: 2, median: 18900, medianLine: "$18,900", last: { ...H.last, title: "1972 Datsun 240Z Good", url: "https://example.test/h/3", priceLine: "$18,900", dateLine: "Oct 20, 2026" }, share: { hagerty: 2, all: 6 }, line: "Hagerty sold 2 of the 6. Median $18,900." };
const withH = h => k => { k.desk = { ...k.desk, hagerty: h }; };
const give = mut => html => { const m = /window\.__V4__=([\s\S]*?);window\.__DESK_V3__/.exec(html), o = JSON.parse(m[1]); mut(o.kase); return html.replace(m[0], "window.__V4__=" + JSON.stringify(o).replace(/</g, "\\u003c") + ";window.__DESK_V3__"); };
const page = async (mut, extra = {}) => openLive(b, { ...extra, mutate: h => { const x = mut ? give(mut)(h) : h; return extra.html ? extra.html(x) : x; } });
const READ = () => { const g = i => document.getElementById(i), box = g("hagerty"), R = e => e.getBoundingClientRect(), t = i => g(i) ? g(i).textContent : null;
  return { shown: !!box && !box.hidden && box.offsetWidth > 0, heading: box ? (box.querySelector("h4") || {}).textContent : null, count: t("hgCount"), median: t("hgMedian"), last: g("hgLast") ? { text: g("hgLast").textContent.replace(/\s*↗$/, ""), href: g("hgLast").href || null } : null, date: t("hgLastDate"), price: t("hgLastPrice"), line: t("hgLine"), tiles: box ? box.querySelectorAll(".st").length : 0, inMarket: !!box && !!document.getElementById("s-market").contains(box), under: !!box && R(box).top >= R(g("plot")).bottom - 1, text: box ? box.textContent : "" }; };

{ // 1 THE FIGURES AS SENT
  const p = await page(withH(H)), r = await p.evaluate(READ);
  ok(r.shown && r.heading === "Sold on Hagerty" && r.inMarket && r.under, "the block headed Sold on Hagerty sits under the market plot, inside What the market paid", JSON.stringify([r.shown, r.heading, r.inMarket, r.under]));
  ok(r.count === String(H.count) && r.median === H.medianLine && r.tiles === 2, "the count and the median print as figures exactly as the model sent them", JSON.stringify([r.count, r.median]));
  ok(r.last && r.last.text === H.last.title && r.last.href === H.last.url && r.date === H.last.dateLine && r.price === H.last.priceLine, "the last sale prints as its title, date and price, the title linked to its url", JSON.stringify([r.last, r.date, r.price]));
  ok(r.line === H.line, "desk.hagerty.line prints beneath, as sent", r.line); }

{ // 2 NO SALES
  const z = await (await page(withH(H0))).evaluate(READ);
  ok(z.shown && z.heading === "Sold on Hagerty" && z.line === H0.line && z.tiles === 0 && z.count === null && z.median === null && z.last === null && !/\d/.test(z.text.replace(H0.line, "").replace("Sold on Hagerty", "")), "a count of 0 shows the line alone: no figure, no median, no link", JSON.stringify(z));
  const n = await (await page(k => { const d = { ...k.desk }; delete d.hagerty; k.desk = d; })).evaluate(READ);
  ok(!n.shown, "a model with no desk.hagerty shows no block"); }

{ // 3 IT FOLLOWS THE PERIOD AND THE CONDITION SWITCHES, from the view the server answers with
  const id = V3.DEMO_ID, answer = async (hag) => { const g = await PV.previewDeskApi({ action: "case_get", id }); g.case.desk = { ...g.case.desk, hagerty: hag, windows: [3, 6, 12, 24].map(x => ({ months: x, label: x + " months" })) }; return { ok: true, id, case: g.case }; };
  const p = await page(withH(H), { intercept: async bd => { if (bd.action === "case_edit" && bd.op === "window") return answer(H6); if (bd.action === "case_edit" && bd.op === "condition") return answer(bd.selected ? HC : H); } });
  await p.evaluate(() => { const b = [...document.querySelectorAll("#period button")].find(x => !x.classList.contains("on")); if (b) b.setAttribute("data-pick", "1"); });
  await p.click("#period button[data-pick]"); await wait(800); const a = await p.evaluate(READ);
  ok(a.count === String(H6.count) && a.median === H6.medianLine && a.last && a.last.href === H6.last.url && a.line === H6.line, "switching the period rerenders the block from the view the server answered with", JSON.stringify(a));
  const tier = await p.evaluate(() => { const b = document.querySelector('#cond button[data-c]:not([data-c="0"])'); if (b) b.setAttribute("data-pick2", "1"); return !!b; });
  if (tier) { await p.click("#cond button[data-pick2]"); await wait(800); const c = await p.evaluate(READ); ok(c.count === String(HC.count) && c.median === HC.medianLine && c.line === HC.line, "switching the condition rerenders it from the new view", JSON.stringify(c)); } else ok(false, "the demonstration case offers a condition to switch"); }

{ // 4 THE PAGE COMPUTES NOTHING
  const src = fs.readFileSync(path.join(ROOT, "lib/preview/deskV4Client.js"), "utf8"), i = src.indexOf("function hagerty()"), body = src.slice(i, src.indexOf("function rungline()", i));
  ok(i > 0 && !/toLocaleString|toFixed|Math\.|Intl\.|parseFloat|Number\(|\* |\/ \d|\+ "\$"|"\$"/.test(body.replace(/\/\/[^\n]*/g, "")), "the block's source carries no formatting or arithmetic");
  const m1 = await (await page(withH(H), { html: h => h.replace('text: h.medianLine', 'text: "$" + Number(h.median).toLocaleString("en-US", { maximumFractionDigits: 1 })') })).evaluate(READ);
  ok(m1.median !== H.medianLine, "mutant caught: a median formatted on the page (" + m1.median + ")");
  const m2 = await (await page(withH(H0), { html: h => h.replace("if (h.count > 0) {", "if (true) {") })).evaluate(READ);
  ok(m2.count !== null || m2.tiles > 0, "mutant caught: figures drawn for a count of 0");
  const m3 = await (await page(withH(H), { html: h => h.replace('el("a", { id: "hgLast", href: l.url,', 'el("a", { id: "hgLast", href: "#",') })).evaluate(READ);
  ok(m3.last && m3.last.href !== H.last.url, "mutant caught: the last sale not linked to its url"); }

{ // 1b THE WORDS ARE THE SERVER'S: a model that carries the median and the last sale as numbers gets its lines made in caseView, in the table's words, so the page prints text and formats nothing
  const { moneyWords } = await imp("lib/reasonWords.js"), store = await PV.previewStore(), sh = await store.get(PV.PREVIEW_ORG.id, V3.DEMO_ID), raw = { venue: "Hagerty", count: 2, median: 18250, last: { date: "2026-10-02", price: 19100, title: "T", url: "https://example.test/x" }, share: { hagerty: 2, all: 7 }, line: "L", sellerLine: "S" };
  sh.case.desk = { ...sh.case.desk, hagerty: raw }; await store.put(PV.PREVIEW_ORG.id, sh);
  const g = (await PV.previewDeskApi({ action: "case_get", id: V3.DEMO_ID })).case.desk.hagerty;
  ok(g.medianLine === moneyWords(18250) && g.last.priceLine === moneyWords(19100) && g.last.dateLine === "2 October 2026" && g.count === 2 && g.line === "L", "the case view words the median, the last price and the date from the model's numbers", JSON.stringify([g.medianLine, g.last.priceLine, g.last.dateLine])); }

{ // 5 PAGE TWO OF THE MARKET REPORT (the on screen preview is the report PDF)
  const rs = fs.readFileSync(path.join(ROOT, "lib/desk/reportState.js"), "utf8"), mini = await imp("lib/pdf/mini.js");
  if (!/hagertyLine/.test(rs)) console.log("PENDING  Lane D's report line (report.v4.hagertyLine) is not in this tree yet: the page two assertion runs once it is merged");
  else {
    const store = await PV.previewStore(), sh = await store.get(PV.PREVIEW_ORG.id, V3.DEMO_ID); sh.case.desk = { ...sh.case.desk, hagerty: H }; await store.put(PV.PREVIEW_ORG.id, sh);
    const r = await PV.previewDeskApi({ action: "case_pdf", id: V3.DEMO_ID, draft: true }), pages = r && r.ok ? mini.pdfPages(Buffer.from(r.pdf_b64, "base64")).map(x => x.join(" ")) : [];
    ok(pages.length >= 2 && pages[1].includes(H.sellerLine), "the report preview's page two carries desk.hagerty.sellerLine as sent", pages.length + " pages");
    const z = await store.get(PV.PREVIEW_ORG.id, V3.DEMO_ID); z.case.desk = { ...z.case.desk, hagerty: H0 }; await store.put(PV.PREVIEW_ORG.id, z);
    const r0 = await PV.previewDeskApi({ action: "case_pdf", id: V3.DEMO_ID, draft: true }), p0 = r0 && r0.ok ? mini.pdfPages(Buffer.from(r0.pdf_b64, "base64")).map(x => x.join(" ")) : [];
    ok(p0.length >= 2 && !p0.join(" ").includes("Hagerty sold"), "a count of 0 puts no Hagerty sentence in the report"); } }

await b.close(); done();
