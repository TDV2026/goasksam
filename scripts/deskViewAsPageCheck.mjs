// The footer of the Desk page says who is looking (Lane S, Nov 5 2026). The server sends org, seat name and viewAs with the queue; the page only prints them.
//   - crew viewing as Expert 1 of Hagerty: "Hagerty Marketplace · seat: Expert 1 · viewing as, crew" and a "Back to crew view" button, in Valuations only (Analyst hidden);
//   - a plain seat: no "viewing as", no Back button, no View as picker;
//   - the crew (not viewing): "Sam · seat: crew".
//   node scripts/deskViewAsPageCheck.mjs
import { startDesk, seed, wait } from "./deskValsRender.mjs";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
async function foot(ctxExtra, opts = {}) {
  const D = await startDesk({ org: opts.org || "hagerty", orgSettings: { name: opts.name || "Hagerty Marketplace" }, ctxExtra });
  await seed(D.store, { org: opts.org || "hagerty" }); const p = await D.open(1440, opts.page || {});
  if (opts.flag) await p.evaluate(f => { window[f] = 1; }, opts.flag);
  await wait(700);
  const r = await p.evaluate(() => ({ line: document.getElementById("seatline").innerText.replace(/\s+/g, " "), back: !!document.getElementById("vaBack"), pick: !!document.getElementById("vaPick") }));
  await D.close(); return r;
}
{ const r = await foot({ seatName: "Expert 1", viewAs: { seatId: 2, org: "hagerty", name: "Expert 1" } });
  ok(/Hagerty Marketplace · seat: Expert 1 · viewing as, crew/.test(r.line) && r.back, `viewing as: footer reads "${r.line}", back button ${r.back}`); }
{ const r = await foot({ seatName: "Expert 1" });
  ok(/Hagerty Marketplace · seat: Expert 1/.test(r.line) && !/viewing as/.test(r.line) && !r.back && !r.pick, `a plain seat: footer reads "${r.line}", back ${r.back}, picker ${r.pick}`); }
{ const r = await foot({}, { org: "sam", name: "Sam" });
  ok(/Sam · seat: crew/.test(r.line) && !r.back, `the crew: footer reads "${r.line}"`); }
console.log(`deskViewAsPageCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
