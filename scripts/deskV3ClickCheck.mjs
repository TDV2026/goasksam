// DESK V3 CLICKS (Lane E, Nov 8 2026). The header figures Assessment and Reserve, in the summary and in the sticky bar, land on the right input in Decision; the tabs switch without losing what was typed.
//   node scripts/deskV3ClickCheck.mjs      (offline, Chrome; mutants must be caught)
import { demoHtml, launch, openPage, tally } from "./deskV3Harness.mjs";
const { ok, done } = tally(), b = await launch(), html = await demoHtml();
const focusId = p => p.evaluate(() => document.activeElement && document.activeElement.id), sel = p => p.evaluate(() => [...document.querySelectorAll("#tabs3 [role=tab]")].find(t => t.getAttribute("aria-selected") === "true").dataset.tab);
async function run(h, w, tag) {
  const bad = [], p = await openPage(b, h, w);
  for (const [btn, want] of [["#figA", "in-afigure"]]) {   // one figure in the header now (Nov 9): the Valuation
    await p.evaluate(() => document.querySelector('[data-tab="vehicle"]').click()); await p.click(btn); await new Promise(r => setTimeout(r, 120));
    if ((await sel(p)) !== "decision" || (await focusId(p)) !== want) bad.push(`${btn} at ${w} lands on ${await sel(p)} / ${await focusId(p)}, not Decision / ${want}`);
  }
  // the sticky bar's own Assessment and Reserve, shown after the summary has scrolled out
  await p.evaluate(() => document.querySelector('[data-tab="market"]').click()); await new Promise(r => setTimeout(r, 120));
  for (const [go, want] of [["assess", "in-afigure"]]) { const shown = await p.evaluate(() => !document.getElementById("stk").hidden); if (!shown) { bad.push("the sticky bar is not shown on Market evidence"); break; }
    await p.evaluate(() => document.querySelector('[data-tab="market"]').click()); if (!(await p.$(`#stk [data-go="${go}"]`))) { bad.push(`the sticky bar has no ${go} target`); continue; } await p.click(`#stk [data-go="${go}"]`); await new Promise(r => setTimeout(r, 120)); if ((await sel(p)) !== "decision" || (await focusId(p)) !== want) bad.push(`sticky ${go} at ${w} lands on ${await focusId(p)}, not ${want}`); }
  // state survives tab switches
  await p.evaluate(() => document.querySelector('[data-tab="decision"]').click()); await p.$eval("#in-reserve", el => { el.value = ""; }); await p.type("#in-reserve", "54321");
  for (const t of ["vehicle", "market", "decision"]) await p.evaluate(x => document.querySelector(`#tabs3 [data-tab="${x}"]`).click(), t);
  if ((await p.$eval("#in-reserve", el => el.value)) !== "54321") bad.push("a typed reserve was lost on a tab switch");
  if (p._err.length) bad.push("page error: " + p._err[0]);
  await p.close(); return bad;
}
for (const w of [1440, 1280, 1024]) { const bad = await run(html, w, "real"); for (const x of bad) ok(false, x); ok(!bad.length, `@${w}: the Valuation figure, in the summary and the sticky bar, lands on its input; tabs keep state`); }
const MUT = [["the Assessment figure goes to the reserve input", h => h.replace('id="figA" ', 'id="figA" data-x="1" ').replace('data-go="assess" id="figA"', 'data-go="reserve" id="figA"')],
  ["the sticky Valuation goes nowhere", h => h.replace(/(<button type="button" data-go=")assess("[^>]*class="sk cu")/, "$1nothing$2")],
  ["a tab switch re-renders and loses state", h => h.replace("p.hidden=x!==k", "p.hidden=x!==k;if(x===k&&k==='decision')p.querySelectorAll('input').forEach(function(i){i.value=''})")]];
for (const [n, fn] of MUT) { const bad = await run(fn(html), 1440, "mutant"); ok(bad.length > 0, "mutant caught: " + n); }

// the Vehicle tab's photo actions are Lane D's case_edit ops (cover, report_photos, photo_add), never the sheet's own actions
async function photoOps(h) {
  const bad = [], p = await openPage(b, h, 1440), posts = []; p.on("request", r => { if (r.method() === "POST") { try { posts.push(JSON.parse(r.postData() || "{}")); } catch {} } });
  const cover = await p.$("[data-cover]:not([disabled])"); if (!cover) bad.push("no Make cover button"); else { await cover.click(); await new Promise(r => setTimeout(r, 200)); const c = posts.find(x => x.op === "cover" || x.action === "sheet_save"); if (!c || c.action !== "case_edit" || c.op !== "cover" || !c.photoId) bad.push("Make cover did not post case_edit cover with a photoId: " + JSON.stringify(c)); }
  posts.length = 0; const box = await p.$("[data-report]"); if (box) { await box.click(); await new Promise(r => setTimeout(r, 200)); const c = posts[0]; if (!c || c.action !== "case_edit" || c.op !== "report_photos" || !Array.isArray(c.ids)) bad.push("the Report box did not post case_edit report_photos with ids: " + JSON.stringify(c)); } else bad.push("no Report box");
  { const veh = (h.match(/<div class="pn" id="pn-vehicle"[\s\S]*?<div class="pn" id="pn-market"/) || [""])[0], n = (veh.match(/data-report="/g) || []).length, np = (veh.match(/data-photo="/g) || []).length; if (!np || n !== np) bad.push(`the Report photo selection control is not on every photo of the Vehicle tab (${n} controls, ${np} photos)`); }
  const hasAdd = /op:"photo_add"/.test(h); if (!hasAdd) bad.push("upload does not use case_edit photo_add"); if (/sheet_save|sheet_photo_add/.test(h)) bad.push("the page still calls a sheet photo action");
  await p.close(); return bad;
}
{ const bad = await photoOps(html); for (const x of bad) ok(false, x); ok(!bad.length, "cover, report selection and upload post Lane D's case_edit ops (cover, report_photos, photo_add)");
  for (const [n, fn] of [["cover through the sheet's own action", h => h.replace('edit("cover",{photoId:b.dataset.cover})', 'post({action:"sheet_save",id:C.active,patch:{heroId:b.dataset.cover}}).then(done)')], ["report selection through the sheet's own action", h => h.replace('edit("report_photos",{ids:ids})', 'post({action:"sheet_save",id:C.active,patch:{photosSelected:ids}}).then(done)')], ["the Report box dropped from the photos", h => h.replace(/<label><input type="checkbox" data-report="[^"]*"[^>]*> Report<\/label>/g, "")], ["upload through the sheet's own action", h => h.replace('op:"photo_add",', '').replace('action:"case_edit"', 'action:"sheet_photo_add"')]]) ok((await photoOps(fn(html))).length > 0, "mutant caught: " + n); }
await b.close(); done("deskV3ClickCheck");
