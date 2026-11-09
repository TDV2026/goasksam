// DESK V3 STAGE 7, THE DEMO WALKTHROUGH (Lane E, Nov 9 2026). Chrome drives the whole road against the REAL readers (the preview door, Lane D's case_new and case_edit and case_pdf and case_finalize, caseView, readinessOf, Lane B's deskBlock):
// a case from nothing through the New case form, two photos (the first becomes the cover), condition Good then Excellent then Fair with the market line changing each time and the page never reloading, the valuation typed, the reserve and rationale,
// the draft report opened in the pane, Finalize, version 1 locked. The only stand-in is the archive: a registered engine answers from tiered sample sales through Lane B's deskBlock (the same block the page reads live).
// Mutants: a figure that does not move on a condition change, a photo that does not appear, a form field that does not reach the case, a Preview that opens nothing.   node scripts/deskV3DemoFlowCheck.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { V3, launch, imp, tally } from "./deskV3Harness.mjs";
const PV = await imp("lib/preview/deskPreview.js"), SR = await imp("lib/desk/sheetRead.js"), DB = await imp("lib/deskV3.js");
const day = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
// 36 sample sales of one car in four tiers (1 Concours .. 4 Fair), each tier with its own price level; every row carries the engine's normalised fields
const LEVEL = { 1: 1.32, 2: 1.14, 3: 1.0, 4: 0.82 }, ROWS = []; for (let i = 0; i < 36; i++) { const t = 1 + (i % 4), base = 30000 + (i * 397) % 4200; ROWS.push({ id: "t" + i, title: "2001 BMW M3", year: 2001, generation: "E46", body: "coupe", gearbox: "manual", gearboxWord: "6-speed manual", miles: 60000 + (i * 811) % 30000, platform: ["Bring a Trailer", "Cars & Bids", "PCarMarket"][i % 3], date: day(3 + i * 4), price: Math.round(base * LEVEL[t] / 50) * 50, url: "https://example.test/sale/" + i, photo: null, tier: t, inPopulation: true, outReason: null }); }
SR.useSheetEngine(async (env, input) => ({ desk: await DB.deskBlock(ROWS.filter(r => !input.tier || r.tier === input.tier), { caseDate: (input.desk && input.desk.caseDate) || day(0), ...(input.tier ? { tier: input.tier } : {}), subjectFacts: { year: 2001, generation: "E46", body: "coupe", gearbox: "manual", miles: Number(input.mileage) || 72100 }, subject: { transmission: "Manual", label: (input.desk && input.desk.label) || "2001 BMW M3" } }), exact: {} }));
const br0 = await launch(); const shot = async c => { const p = await br0.newPage(); await p.setContent(`<body style="margin:0;background:${c}"><div style="width:640px;height:400px"></div></body>`); const b = await p.screenshot({ type: "jpeg", clip: { x: 0, y: 0, width: 640, height: 400 } }); await p.close(); return b; };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deskflow-")), P1 = path.join(dir, "front.jpg"), P2 = path.join(dir, "rear.jpg"); fs.writeFileSync(P1, await shot("#6d8aa3")); fs.writeFileSync(P2, await shot("#a38a6d"));
const wait = ms => new Promise(r => setTimeout(r, ms));
async function flow(mut = x => x, log = false) {
  const bad = [], note = m => { if (log) console.log("  . " + m); };
  const p = await br0.newPage(); await p.setViewport({ width: 1440, height: 900 }); await p.setRequestInterception(true); p._err = []; p.on("pageerror", e => p._err.push(String(e).slice(0, 160)));
  p.on("request", async r => { try { const u = new URL(r.url()); if (u.host !== "goasksam.com") return r.respond({ status: 204, body: "" });
    if (r.method() === "POST" && u.pathname === "/preview/desk/api") return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(await PV.previewDeskApi(JSON.parse(r.postData() || "{}"))) });
    const m = /^\/preview\/desk(?:\/case\/([\w-]+))?$/.exec(u.pathname); if (r.method() === "GET" && m) return r.respond({ status: 200, contentType: "text/html", body: mut(await V3.renderDeskV3({ query: m[1] ? { case: m[1] } : {} })) });
    return r.respond({ status: 204, body: "" }); } catch (e) { try { r.respond({ status: 500, body: String(e.message) }); } catch {} } });
  if (log) p.on("response", async r => { if (r.request().method() === "POST") { try { const j = JSON.parse(await r.text()), q = JSON.parse(r.request().postData() || "{}"); if (q.action === "case_finalize" || j.ok === false) console.log("  . api " + q.action + (q.op ? "/" + q.op : "") + " -> " + JSON.stringify(j).slice(0, 300)); } catch {} } });
  await p.goto("https://goasksam.com/preview/desk", { waitUntil: "load" }); await wait(300);
  // 1. a case from nothing
  await p.click("#newcase-btn"); await wait(100); if (!(await p.evaluate(() => !document.getElementById("newcase").hidden))) bad.push("New case does not open the form");
  for (const [id, v] of [["nc-year", "2001"], ["nc-make", "BMW"], ["nc-model", "M3"], ["nc-mileage", "72100"], ["nc-trans", "Manual"], ["nc-body", "Coupe"], ["nc-colour", "Silver"], ["nc-seller", "Hal Moreau"], ["nc-asking", "30000"]]) await p.type("#" + id, v);
  await p.type("#nc-notes", "One owner, garaged."); await (await p.$("#nc-photos")).uploadFile(P1, P2);
  await Promise.all([p.waitForNavigation({ waitUntil: "load", timeout: 20000 }).catch(() => null), p.click("#nc-go")]); await wait(600);
  const url = p.url(); if (!/\/preview\/desk\/case\//.test(url)) { bad.push("Create case did not open the case (" + url + "; " + (await p.evaluate(() => (document.getElementById("nc-msg") || {}).textContent)) + ")"); await p.close(); return bad; }
  const id = url.split("/").pop(); await p.evaluate(() => { window.__nr = 1; });
  const sm = await p.evaluate(() => ({ car: (document.querySelector("#chd h1") || {}).textContent, spec: (document.querySelector(".chd-spec") || {}).textContent || "", vehicle: document.getElementById("pn-vehicle").innerText, big: (document.getElementById("valBig") || {}).textContent, mline: (document.getElementById("mline") || {}).textContent }));
  note(JSON.stringify({ car: sm.car, spec: sm.spec, big: sm.big, mline: sm.mline }));
  if (!/2001 BMW M3/.test(sm.car || "")) bad.push("the case header is not the car entered: " + sm.car);
  if (!/72,100/.test(sm.spec + sm.vehicle)) bad.push("the mileage did not reach the case"); if (!/Silver/.test(sm.vehicle)) bad.push("the colour did not reach the case"); if (!/Manual/.test(sm.vehicle)) bad.push("the transmission did not reach the case");
  if (!/^Market: typical \$[\d,]+ to \$[\d,]+ · \d+ sales/.test(sm.mline || "")) bad.push("the engine's market line is not in the summary of the new case: " + sm.mline);
  if (!/^\$[\d,]+$/.test(sm.big || "")) bad.push("the Valuation did not start at the engine's median: " + sm.big);
  // 2. photos: both appear as real images, the first is the cover and the header photo
  const ph = await p.evaluate(() => ({ thumbs: [...document.querySelectorAll("#pn-vehicle img")].map(i => ({ ok: i.complete && i.naturalWidth > 0, src: i.src.slice(0, 40) })), head: (() => { const i = document.querySelector("#chd .chd-ph img"); return i ? { ok: i.complete && i.naturalWidth > 0 } : null; })() }));
  note(JSON.stringify(ph)); if (ph.thumbs.filter(t => t.ok).length < 2) bad.push("the two photos do not show as real images in the Vehicle tab (" + ph.thumbs.filter(t => t.ok).length + ")"); if (!ph.head || !ph.head.ok) bad.push("the case header has no cover photo");
  // 3. condition Good, Excellent, Fair: the market line, the bar and the Market evidence tab redraw in place, the page never reloads
  await p.evaluate(() => document.querySelector('[data-tab="decision"]').click()); const lines = [sm.mline];
  for (const [t, name] of [[3, "Good"], [2, "Excellent"], [4, "Fair"]]) {
    await p.click(`[data-cond="${t}"]`); await wait(900);
    const r = await p.evaluate(() => ({ mline: (document.getElementById("mline") || {}).textContent, med: (document.querySelector("#sum .mk-median em") || {}).textContent, kept: window.__nr === 1, sel: (document.querySelector('[data-cond][aria-checked="true"]') || {}).textContent, market: document.getElementById("pn-market").innerText.slice(0, 400) }));
    note(name + ": " + r.mline + " | median " + r.med);
    if (!r.kept) bad.push(`condition ${name} reloaded the page`); if (r.sel !== name) bad.push(`condition ${name} is not the selected rung (${r.sel})`); if (!r.mline || lines.includes(r.mline)) bad.push(`the market line did not change on ${name} (${r.mline})`); lines.push(r.mline);
  }
  // 4. valuation, reserve, explanation, rationale; save
  await p.$eval("#in-afigure", e => { e.value = ""; }); await p.type("#in-afigure", "28500"); await p.type("#in-aexp", "Priced to the Fair sales: the car is original and the mileage is average, with no records to lift it."); await p.$eval("#in-reserve", e => { e.value = ""; }); await p.type("#in-reserve", "26000"); await p.type("#in-rrat", "Held under the typical low."); await wait(700);
  const big = await p.evaluate(() => (document.getElementById("valBig") || {}).textContent); if (big !== "$28,500") bad.push("the big number does not show the typed valuation (" + big + ")");
  await p.click("#b-save"); await wait(900); const saved = await p.$eval("#dmsg", e => e.textContent); if (!/Saved/.test(saved)) bad.push("Save draft did not confirm (" + saved + ")");
  // 5. readiness: clear what Lane D lists, through the page's own controls
  await p.evaluate(() => document.querySelector('[data-tab="vehicle"]').click()); await wait(200);
  await p.click('[data-edit="accident_history"]'); await wait(150); await p.type("#pn-vehicle td input.ed", "No accidents reported"); await p.click("#pn-vehicle [data-save]"); await wait(800);   // the analyst enters the accident history from the seller's word, then verifies it
  const tried = new Set(); for (const sel0 of ['[data-need][data-act="verify"]', '[data-need][data-act="waive"]']) for (let i = 0; i < 6; i++) { const b = await p.$("#pn-vehicle " + sel0); if (!b) break; const key = sel0 + await b.evaluate(e => e.dataset.need); if (tried.has(key)) break; tried.add(key); await b.click(); await wait(700); }
  await p.evaluate(() => document.querySelector('[data-tab="market"]').click()); const sel = await p.$("#pn-market [data-sel]"); if (sel) { await sel.click(); await wait(700); }
  await p.evaluate(() => document.querySelector('[data-tab="decision"]').click()); await wait(300);
  const blockers = await p.$$eval("#dc-rdy [data-blocker]", l => l.map(x => x.textContent)); note("blockers: " + JSON.stringify(blockers));
  // 6. Preview report opens the draft in the pane
  await p.click("#b-prev"); await wait(2500); const pane = await p.evaluate(() => ({ open: !document.getElementById("pdfpane").hidden, src: document.getElementById("pdff").getAttribute("src") || "", msg: document.getElementById("dmsg").textContent })); note("preview: " + JSON.stringify(pane));
  if (!pane.open || !/^blob:/.test(pane.src)) bad.push("Preview report opened nothing in the pane (" + pane.msg + ")");
  // 7. Finalize: version 1, locked
  const dis = await p.$eval("#b-fin", b => b.disabled); if (dis) bad.push("Finalize is disabled; Lane D's readiness still lists " + JSON.stringify(blockers));
  else { await Promise.all([p.waitForNavigation({ waitUntil: "load", timeout: 15000 }).catch(() => null), p.evaluate(() => document.getElementById("b-fin").click())]); await wait(800); note("after finalize: " + (await p.evaluate(() => (document.getElementById("dmsg") || {}).textContent)));
    const v = await PV.previewDeskApi({ action: "case_version", id }); note("version: " + JSON.stringify({ ok: v.ok, version: v.version, versions: v.versions }));
    if (!v.ok || v.version !== 1) bad.push("no version 1 row after Finalize (" + JSON.stringify(v).slice(0, 120) + ")");
    const st = await p.evaluate(() => document.body.innerText); if (!/Finalised/.test(st || "")) bad.push("the case is not Finalised after Finalize (" + st + ")"); }
  if (p._err.length) bad.push("page error: " + p._err[0]);
  await p.close(); return bad;
}
const { ok, done } = tally();
const good = await flow(x => x, process.argv.includes("--log")); for (const b of good) ok(false, b); ok(!good.length, "the whole walkthrough: new case, two photos, three condition changes with the market line moving, valuation, reserve, preview in the pane, Finalize, version 1");
const MUT = [["a figure that does not move on a condition change", h => h.replace('["chd","sum","stk",', '["chd","stk",'), /market line did not change/],
  ["a photo that does not appear", h => h.replace("files.forEach(function(f,i)", "[].forEach(function(f,i)"), /photos do not show|cover photo/],
  ["a form field that does not reach the case", h => h.replace(',["colour",v("nc-colour")]', ""), /colour did not reach/],
  ["a preview that opens nothing", h => h.replace('$("pdfpane").hidden=false;', ""), /opened nothing/]];
for (const [n, fn, re] of MUT) { const b = await flow(h => fn(h)); ok(b.some(x => re.test(x)), `mutant caught: ${n} (${b[0] || "NOT CAUGHT"})`); }
await br0.close(); fs.rmSync(dir, { recursive: true, force: true }); done("deskV3DemoFlowCheck");
