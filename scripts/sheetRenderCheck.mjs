// DESK VALUATIONS: THE SHEET PRINTS THE OBJECT (Lane E, Nov 4 2026; docs/desk-valuations-spec.md). The real Desk page (lib/crewPages/desk.html, public/js/desk.js, public/js/deskvals.js) rendered in Chrome
// against the real sheet actions: every section prints from the sheetRead object and the sheet, in the fixed order, and the page computes nothing, not even the starting figure.
//   CLASS: any figure on the sheet (money, count, date part) that the object it was printed from does not carry is a figure the page made. The scan reads every number the page prints and requires the
//   object (read, evaluation, sheet, org) to carry it; a mutant page that computes one (a midpoint, a gap, a count) must be caught.     node scripts/sheetRenderCheck.mjs
import fs from "node:fs";
import path from "node:path";
import { startDesk, seed, wait, ROOT } from "./deskValsRender.mjs";
import { allowedFigures, unexplained, figuresIn } from "./figureScan.mjs";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const JS = fs.readFileSync(path.join(ROOT, "public/js/deskvals.js"), "utf8");

// ---- the page holds no arithmetic of its own (a lint on top of the render scan)
ok(!/Math\.|\.sort\(|\.reduce\(|parseFloat|toFixed|toPrecision/.test(JS), "the Valuations page holds no Math, sort, reduce or rounding of its own");
ok(!/\.\s*(low|high)\s*[-+*\/]|[-+*\/]\s*\w+\.(p25|p75|median|startingFigure|price|count)\b/.test(JS), "no figure is added to, taken from or scaled in the page");

const SECS = ["The car", "This exact car", "The market", "Condition", "What we cannot see", "Decision", "Finalise"];
async function sheetText(p) { return p.evaluate(() => { const c = document.querySelector(".sheet"); if (!c) return ""; const out = [], w = document.createTreeWalker(c, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { const e = n.parentElement; if (e.closest(".no, .covfix, textarea, script, style")) continue; out.push(n.textContent); } return out.join(" | "); }); }
// the figure blocks of section 3, label by label, against the object: each is exactly what the engine sent (the scan above cannot see a small count that happens to match a date part)
const figBlocks = p => p.evaluate(() => Object.fromEntries([...document.querySelectorAll(".sheet .fig")].map(f => [f.querySelector(".l").textContent.trim().toLowerCase(), f.querySelector(".v").textContent.trim()])));
const figsWrong = (b, rd) => { const u = n => "$" + Math.round(n).toLocaleString("en-US"), m = rd.market, w = []; if (b["median"] !== u(m.median)) w.push("median"); if (b["typical range"] !== u(m.p25) + " to " + u(m.p75)) w.push("range"); if (b["sales"] !== String(m.count)) w.push("sales"); if (b["newest sale"] !== m.newest) w.push("newest"); if ((m.startingFigure ? u(m.startingFigure) : undefined) !== b["starting figure"]) w.push("starting figure"); return w; };
const secs = p => p.evaluate(() => [...document.querySelectorAll(".sheet [data-sec]")].map(e => ({ n: e.getAttribute("data-sec"), h: e.querySelector("h2").textContent, t: e.querySelector(".card").innerText })));

const D = await startDesk({ calls: [] }); let car; const bare = await seed(D.store, { vin: "WP0CA29974S650321", minutesAgo: 3 }), none = await seed(D.store, { vin: null, status: "Needs the car" });
for (const w of [1440, 390]) {
  car = await seed(D.store); const p = await D.open(w); await p.click(`[data-open="${car.id}"]`); await wait(900);
  const v = () => p.evaluate(() => window.__deskVals.state.sheets[window.__deskVals.state.active].v);
  let obj = await v(), S = await secs(p);
  ok(JSON.stringify(S.map(s => s.h)) === JSON.stringify(SECS) && S.map(s => s.n).join("") === "1234567", `${w}: the seven sections print in the fixed order (${S.map(s => s.h).join(" | ")})`);
  const t = Object.fromEntries(S.map(s => [s.n, s.t])), rd = obj.read, usd = n => "$" + Math.round(n).toLocaleString("en-US");
  // 1 the car
  ok(t[1].includes(rd.car.vin) && t[1].includes(rd.car.decode.model) && t[1].includes(rd.car.decode.trim) && t[1].includes(String(rd.car.mileage.value.toLocaleString("en-US"))), `${w}: 1 The car prints the VIN, the decode and the submission's mileage`);
  ok(rd.car.prior && t[1].includes(rd.car.prior.lastSaleDate) && t[1].includes(rd.car.prior.colour), `${w}: 1 a prior listing's colour, gearbox and mileage at the last sale are printed`);
  // 2 this exact car
  ok(rd.exact.appearances.every(a => t[2].includes(a.date) && t[2].includes(a.venue) && t[2].includes(a.outcome === "sold" ? usd(a.price) : usd(a.highBid))), `${w}: 2 every appearance of the VIN prints with its date, venue and price or high bid`);
  // 3 the market
  const m = rd.market;
  ok([m.median, m.p25, m.p75].every(n => t[3].includes(usd(n))) && t[3].includes(String(m.count)) && t[3].includes(m.newest) && t[3].includes(m.window.stated), `${w}: 3 the median, the quartiles, the count, the newest sale and the window are the engine's`);
  ok(m.comparables.every(c => t[3].includes(usd(c.price)) && t[3].includes(c.date)), `${w}: 3 every comparable prints (${m.comparables.length})`);
  ok(m.splits[0].options.every(o => t[3].includes(o.label) && t[3].includes(usd(o.median))) && t[3].includes(m.live[0].venue) && t[3].includes(usd(m.live[0].bid)), `${w}: 3 the splits and the live listings print`);
  ok(m.startingFigure == null && !/Starting figure/i.test(t[3].replace(/Pick a condition tier for a starting figure\./, "")) && t[3].includes(m.startingNote), `${w}: 3 with no tier chosen there is no starting figure, only the engine's words (${m.startingNote})`);
  ok(figsWrong(await figBlocks(p), rd).length === 0, `${w}: 3 each figure block is exactly the engine's (median, range, sales, newest sale)`);
  // 4 the tier click asks the engine again and prints its answer
  ok(obj.read.condition.tiers.every(x => t[4].includes(x.label)), `${w}: 4 the four tiers print with the engine's counts`);
  const before = D.calls.length; await p.click('[data-tier="2"]'); await wait(900);
  const asked = D.calls.slice(before).find(c => c.action === "sheet_save");
  ok(asked && asked.patch.tier === 2, `${w}: 4 the tier click is an ask carrying tier 2`);
  obj = await v(); S = await secs(p); Object.assign(t, Object.fromEntries(S.map(s => [s.n, s.t])));
  ok(obj.read.market.count === 6 && obj.read.market.startingFigure === 69050 && t[3].includes(usd(69050)) && /Starting figure/i.test(t[3]) && t[4].includes("6 sales in this condition"), `${w}: 4 section 3 is re-filtered by the engine: ${obj.read.market.count} sales, starting figure ${usd(obj.read.market.startingFigure)}`);
  ok(figsWrong(await figBlocks(p), obj.read).length === 0, `${w}: 4 after the tier click the blocks are the new read's, the starting figure included`);
  ok(obj.read.market.comparables.every(c => c.tier === 2) && obj.read.market.comparables.every(c => t[3].includes(usd(c.price))), `${w}: 4 the comparables are the same tier pool, as sent`);
  await p.click('[data-tier="4"]'); await wait(900); obj = await v(); S = await secs(p); Object.assign(t, Object.fromEntries(S.map(s => [s.n, s.t])));
  ok(obj.read.condition.tooFew && obj.read.market.startingFigure == null && /sales of this body.* in tier 4, shown on the full set\./.test(t[4]) && !/Starting figure\s*\$/.test(t[3]) && /Range from \d+ sales: \$[\d,]+ to \$[\d,]+\. Median \$[\d,]+\./.test(t[3]), `${w}: 4 too few sales in a tier: no starting figure, the count and the range are stated`);
  await p.click('[data-tier="2"]'); await wait(800);
  // 5 the checklist
  ok(["Title status", "Service records", "Ownership history", "Modifications", "Accident or repair history", "Provenance"].every(l => t[5].includes(l)) && (t[5].match(/Not supplied/g) || []).length === 6 && !/\$|\d/.test(t[5].replace(/Mark each\. A free line is optional\. No numbers here\./, "")), `${w}: 5 the six checklist items, each Seen / Not seen / Not supplied, and no figure in the section`);
  await p.click('[data-chk="title"][data-state="Seen"]'); await wait(600);
  ok(await p.evaluate(() => document.querySelector('[data-chk="title"][data-state="Seen"]').classList.contains("on")), `${w}: 5 a mark is kept`);
  // 6 the decision's figures beside the fields are the engine's
  obj = await v(); S = await secs(p); Object.assign(t, Object.fromEntries(S.map(s => [s.n, s.t])));
  ok(t[6].includes(usd(obj.read.market.p25) + " to " + usd(obj.read.market.p75)) && t[6].includes(usd(obj.read.market.startingFigure)), `${w}: 6 the market range and the starting figure sit beside the fields, as sent`);
  // the figure scan: every number on the sheet is in the object
  const text = await sheetText(p); obj = await v();
  const allowed = allowedFigures(obj.read, obj.evaluation, obj.sheet, obj.org, obj.thisCar, obj.sections, obj.checklist, obj.reasons);
  const bad = unexplained(text, allowed);
  ok(bad.length === 0 && figuresIn(text).length > 60, `${w}: every figure printed is one the object carries (${figuresIn(text).length} figures read; unexplained: ${bad.join(", ") || "none"})`);
  // a car with no prior auction record says so; a car with no read says so
  await p.click(`[data-open="${bare.id}"]`); await wait(900); const t2 = (await secs(p)).find(s => s.n === "2").t;
  ok(/No prior auction record for this VIN\./.test(t2), `${w}: 2 a car with no appearances prints "No prior auction record for this VIN." (never hidden)`);
  await p.click(`[data-open="${none.id}"]`); await wait(700); const t3 = await p.evaluate(() => document.querySelector(".sheet").innerText);
  ok(/No car was found in this submission/.test(t3) && !(await p.evaluate(() => !!document.querySelector("[data-sec]"))), `${w}: a row with no car prints the plain line and no sections`);
  ok(p._errs.length === 0, `${w}: no page error (${p._errs.join("; ").slice(0, 120)})`);
  await p.close();
}
// ---- a page that computes one figure is caught (the mutant)
{
  const mutants = [
    ["a midpoint of the range", s => s.replace("f(\"Sales\", nf(m.count))", "f(\"Sales\", nf(m.count)) + f(\"Mid\", usd((m.p25 + m.p75) / 2 + 17))")],
    ["a count made by the page", s => s.replace("f(\"Sales\", nf(m.count))", "f(\"Sales\", nf(m.count + 5))")],
    ["a starting figure the engine did not send", s => s.replace("(m.startingFigure ? f(\"Starting figure\", usd(m.startingFigure), \"start\") : \"\")", "f(\"Starting figure\", usd(m.median + 333), \"start\")")]
  ];
  for (const [name, fn] of mutants) {
    const mutated = fn(JS); ok(mutated !== JS, `mutant ${name} applies`);
    const D2 = await startDesk({ mutateJs: mutated }), c2 = await seed(D2.store), p = await D2.open(1440); await p.click(`[data-open="${c2.id}"]`); await wait(900);
    const obj = await p.evaluate(() => window.__deskVals.state.sheets[window.__deskVals.state.active].v), text = await sheetText(p), bad = unexplained(text, allowedFigures(obj.read, obj.evaluation, obj.sheet, obj.org, obj.thisCar, obj.sections, obj.checklist, obj.reasons));
    const wrong = figsWrong(await figBlocks(p), obj.read); ok(bad.length > 0 || wrong.length > 0, `the sheet check catches a page that computes ${name} (${bad.join(", ") || wrong.join(", ") || "NOT CAUGHT"})`); await D2.close();
  }
}
await D.close();
console.log(`sheetRenderCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
