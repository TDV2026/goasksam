// DESK V3 CLICKS (Lane E, Nov 8 2026). The header figures Assessment and Reserve, in the summary and in the sticky bar, land on the right input in Decision; the tabs switch without losing what was typed.
//   node scripts/deskV3ClickCheck.mjs      (offline, Chrome; mutants must be caught)
import { demoHtml, launch, openPage, tally } from "./deskV3Harness.mjs";
const { ok, done } = tally(), b = await launch(), html = await demoHtml();
const focusId = p => p.evaluate(() => document.activeElement && document.activeElement.id), sel = p => p.evaluate(() => [...document.querySelectorAll("#tabs3 [role=tab]")].find(t => t.getAttribute("aria-selected") === "true").dataset.tab);
async function run(h, w, tag) {
  const bad = [], p = await openPage(b, h, w);
  for (const [btn, want] of [["#figA", "in-alow"], ["#figR", "in-reserve"]]) {
    await p.evaluate(() => document.querySelector('[data-tab="vehicle"]').click()); await p.click(btn); await new Promise(r => setTimeout(r, 120));
    if ((await sel(p)) !== "decision" || (await focusId(p)) !== want) bad.push(`${btn} at ${w} lands on ${await sel(p)} / ${await focusId(p)}, not Decision / ${want}`);
  }
  // the sticky bar's own Assessment and Reserve, shown after the summary has scrolled out
  await p.evaluate(() => document.querySelector('[data-tab="market"]').click()); await new Promise(r => setTimeout(r, 120));
  for (const [go, want] of [["assess", "in-alow"], ["reserve", "in-reserve"]]) { const shown = await p.evaluate(() => !document.getElementById("stk").hidden); if (!shown) { bad.push("the sticky bar is not shown on Market evidence"); break; }
    await p.evaluate(() => document.querySelector('[data-tab="market"]').click()); if (!(await p.$(`#stk [data-go="${go}"]`))) { bad.push(`the sticky bar has no ${go} target`); continue; } await p.click(`#stk [data-go="${go}"]`); await new Promise(r => setTimeout(r, 120)); if ((await sel(p)) !== "decision" || (await focusId(p)) !== want) bad.push(`sticky ${go} at ${w} lands on ${await focusId(p)}, not ${want}`); }
  // state survives tab switches
  await p.evaluate(() => document.querySelector('[data-tab="decision"]').click()); await p.$eval("#in-reserve", el => { el.value = ""; }); await p.type("#in-reserve", "54321");
  for (const t of ["vehicle", "market", "decision"]) await p.evaluate(x => document.querySelector(`#tabs3 [data-tab="${x}"]`).click(), t);
  if ((await p.$eval("#in-reserve", el => el.value)) !== "54321") bad.push("a typed reserve was lost on a tab switch");
  if (p._err.length) bad.push("page error: " + p._err[0]);
  await p.close(); return bad;
}
for (const w of [1440, 1280, 1024]) { const bad = await run(html, w, "real"); for (const x of bad) ok(false, x); ok(!bad.length, `@${w}: Assessment and Reserve, in the summary and the sticky bar, land on their inputs; tabs keep state`); }
const MUT = [["the Assessment figure goes to the reserve input", h => h.replace('id="figA" ', 'id="figA" data-x="1" ').replace('data-go="assess" id="figA"', 'data-go="reserve" id="figA"')],
  ["the Reserve figure goes nowhere", h => h.replace('data-go="reserve" id="figR"', 'data-go="nothing" id="figR"')],
  ["the sticky Reserve goes to the assessment", h => h.replace(/(<button type="button" data-go=")reserve("[^>]*class="sk cu")/, "$1assess$2")],
  ["a tab switch re-renders and loses state", h => h.replace("p.hidden=x!==k", "p.hidden=x!==k;if(x===k&&k==='decision')p.querySelectorAll('input').forEach(function(i){i.value=''})")]];
for (const [n, fn] of MUT) { const bad = await run(fn(html), 1440, "mutant"); ok(bad.length > 0, "mutant caught: " + n); }
await b.close(); done("deskV3ClickCheck");
