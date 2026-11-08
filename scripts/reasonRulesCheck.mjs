// DESK VALUATIONS: THE DECISION RULES (Lane E, Nov 4 2026; docs/desk-valuations-spec.md "The one number"). Finalise is refused or allowed exactly as the spec says, for a reserve and for a range, and
// the guards never block but always require a typed line. The rules live in one function (lib/desk/decisionRules.js); finalise runs it, the page prints what it says as the expert types.
//   node scripts/reasonRulesCheck.mjs
import fs from "node:fs";
import { fixtureRead } from "../lib/desk/sheetShape.js";
import { evaluateDecision as ev } from "../lib/desk/decisionRules.js";
import { handleSheetAction, emptyState } from "../lib/desk/sheetActions.js";
import { memoryStore } from "../lib/desk/sheetStore.js";
import { startDesk, seed, wait, press, typeIn, settle } from "./deskValsRender.mjs";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const VIN = "WP0AB29918S745123", R2 = fixtureRead({ vin: VIN, tier: 2 }), R4 = fixtureRead({ vin: VIN, tier: 4 }), R0 = fixtureRead({ vin: VIN });
// tier 2: the meter's range $65,500 to $71,500, engine median $69,050 (the engine's, in the fixture); tier 4 holds too few sales, so its meter is the body pool's $49,500 to $74,000 (median $63,100)
const keys = r => r.missing.map(m => m.key).join(",");
const base = { reasons: [], otherText: "", line: "", guardLines: {} };
const R = (extra, read = R2, o = {}) => ev({ read, draft: { ...base, ...extra }, org: o.org, priors: o.priors });

// ---- a reserve
ok(R({ mode: "reserve", reserve: "68000" }).canFinalise && R({ mode: "reserve", reserve: "68000" }).inRange, "reserve inside the market range: no reason needed, finalise allowed");
ok(R({ mode: "reserve", reserve: "65500" }).canFinalise && R({ mode: "reserve", reserve: "71500" }).canFinalise, "reserve at either edge of the market range is inside");
{ const r = R({ mode: "reserve", reserve: "75000" }); ok(!r.canFinalise && keys(r).includes("reasons") && keys(r).includes("line"), `reserve above the range: refused for no reason and no line (${keys(r)})`); }
{ const r = R({ mode: "reserve", reserve: "75000", reasons: ["documentation"] }); ok(!r.canFinalise && keys(r) === "line", `a reason ticked but no typed line: refused, naming the line (${keys(r)})`); }
{ const r = R({ mode: "reserve", reserve: "75000", line: "Full service file." }); ok(!r.canFinalise && keys(r).includes("reasons"), `a line but no reason: refused, naming the reason (${keys(r)})`); }
ok(R({ mode: "reserve", reserve: "75000", reasons: ["documentation"], line: "Full service file.", guardLines: { start: "Records are complete." } }).canFinalise, "reserve above the range with a reason, a line and the guard's line: allowed");
{ const r = R({ mode: "reserve", reserve: "75000", reasons: ["other"], line: "x", guardLines: { start: "y" } }); ok(!r.canFinalise && keys(r) === "other", `Other ticked with nothing typed: refused (${keys(r)})`); }
ok(R({ mode: "reserve", reserve: "75000", reasons: ["other"], otherText: "A one-off colour", line: "x", guardLines: { start: "y" } }).canFinalise, "Other ticked and typed: allowed");
ok(!R({ mode: "reserve", reserve: "60000", reasons: [], line: "" }).canFinalise, "reserve below the range needs reasons too");
{ const r = R({ mode: "reserve" }); ok(!r.canFinalise && keys(r) === "reserve", `no reserve entered: refused (${keys(r)})`); }
{ const r = R({}); ok(!r.canFinalise && keys(r) === "mode", `neither a reserve nor a range chosen: refused (${keys(r)})`); }
// ---- a range
ok(R({ mode: "range", low: "65600", high: "71000" }).canFinalise, "range wholly inside the market range: allowed with no reason");
{ const r = R({ mode: "range", low: "65000", high: "70000" }); ok(!r.canFinalise && !r.inRange && keys(r).includes("reasons"), `range with a low outside: refused (${keys(r)})`); }
{ const r = R({ mode: "range", low: "67000", high: "73000" }); ok(!r.canFinalise && keys(r).includes("reasons"), "range with a high outside: refused"); }
ok(R({ mode: "range", low: "65000", high: "70000", reasons: ["condition"], line: "Better than the tier.", guardLines: {} }).canFinalise, "range outside with a reason and a line, within the guard threshold: allowed");
{ const r = R({ mode: "range", low: "70000", high: "67000" }); ok(!r.canFinalise && keys(r) === "range", `low above high: refused (${keys(r)})`); }
{ const r = R({ mode: "range", low: "67000" }); ok(!r.canFinalise && keys(r) === "range", `no high: refused (${keys(r)})`); }
// ---- too few sales: no starting figure, the wider range shown, the expert types with a reason
{ const r = R({ mode: "reserve", reserve: "45000" }, R4); ok(R4.market.startingFigure == null && R4.market.meter.scope === "body" && !r.canFinalise && keys(r).includes("reasons") && keys(r).includes("line"), `too few same tier sales: the meter is the body pool's, a reserve outside it needs a reason and a line (${keys(r)})`); }
ok(R({ mode: "reserve", reserve: "45000", reasons: ["market_movement"], line: "Two recent cars not in the sales.", guardLines: { start: "Matches two private sales." } }, R4).canFinalise, "too few sales: a figure outside the body range is allowed with a reason, a line and the guard's line");
{ const r = R({ mode: "reserve", reserve: "63000" }, R4); ok(r.canFinalise && r.inRange, "too few sales: a figure inside the range the sheet shows (the body pool's) is inside, whatever the tier (the $55,000 case: it was called outside while the page showed a range around it)"); }
// ---- no tier chosen: the engine has no starting figure either
{ const r = R({ mode: "reserve", reserve: "63100" }, R0); ok(R0.market.startingFigure == null && r.guards.length === 0, "no tier chosen: no starting figure, so no start guard"); }
// ---- the guards: never block, always require a typed line
{ const g = R({ mode: "reserve", reserve: "69000" }); ok(g.guards.length === 0, "a reserve within 15 percent of the starting figure: no guard"); }
{ const g = R({ mode: "reserve", reserve: "79500", reasons: ["provenance"], line: "Known history." }); ok(g.guards.map(x => x.key).join() === "start" && !g.canFinalise && keys(g) === "guard_start", `a reserve more than 15 percent from the starting figure: the guard shows and asks for a line (${keys(g)})`); }
ok(R({ mode: "reserve", reserve: "79500", reasons: ["provenance"], line: "Known history.", guardLines: { start: "Matches two recent private sales." } }).canFinalise, "the guard never blocks: with its typed line the sheet can be finalised");
{ const g = R({ mode: "range", low: "80000", high: "84000", reasons: ["provenance"], line: "Known history." }); ok(g.guards.some(x => x.key === "start"), "a range's MIDDLE more than 15 percent from the starting figure: the guard shows"); }
{ const g = R({ mode: "range", low: "75000", high: "79000", reasons: ["provenance"], line: "x" }); ok(g.guards.length === 0, "the middle ($77,000) is inside 15 percent of $69,050 only at 11.5 percent: no guard"); }
const prior = [{ reportNumber: "DV-2026-0007", mode: "reserve", reserve: 60000, low: null, high: null, finalisedAt: "2026-09-01T10:00:00Z" }];
{ const g = R({ mode: "reserve", reserve: "68000" }, R2, { priors: prior }); ok(!g.guards.some(x => x.key === "prior"), "same VIN valued before, 13.3 percent apart (inside the 15 percent threshold): no prior guard"); }
{ const g = R({ mode: "reserve", reserve: "69500" }, R2, { priors: prior }); ok(g.guards.some(x => x.key === "prior") && /DV-2026-0007/.test(g.guards[0].text) && keys(g) === "guard_prior", `same VIN valued before, 15 percent or more apart: the guard names the report and asks for a line (${keys(g)})`); }
ok(R({ mode: "reserve", reserve: "69500", guardLines: { prior: "The earlier figure was before the paint work." } }, R2, { priors: prior }).canFinalise, "the prior-valuation guard never blocks: its line is enough");
ok(R({ mode: "reserve", reserve: "69500" }, R2, { priors: prior, org: { threshold: 0.6 } }).guards.length === 0, "the threshold is the org's setting: 60 percent, no guard");
ok(R({ mode: "reserve", reserve: "68000" }, R2, { priors: prior, org: { threshold: 0.05 } }).guards.some(x => x.key === "prior"), "the threshold is the org's setting: 5 percent, the guard shows");
ok(R({ mode: "reserve", reserve: "69500" }, R2, { priors: [{ ...prior[0], finalisedAt: null }] }).guards.length === 0, "an unfinalised earlier sheet is not a valuation: no guard");

// ---- the same rules at finalise (the real action, memory store): refused naming what is missing, allowed, then immutable
const store = memoryStore(), cx = (seat = "crew") => ({ env: {}, org: "sam", seat, store, orgSettings: { name: "Hagerty Marketplace" } });
const s1 = await seed(store); await handleSheetAction("sheet_open", { id: s1.id }, cx());
await handleSheetAction("sheet_save", { id: s1.id, patch: { tier: 2 } }, cx());
let f = await handleSheetAction("sheet_finalise", { id: s1.id }, cx()); ok(f.refused && /Choose a reserve or a range/.test(f.why), "finalise with no decision is refused and says so: " + f.why);
await handleSheetAction("sheet_save", { id: s1.id, patch: { decision: { ...base, mode: "reserve", reserve: "75000" } } }, cx());
f = await handleSheetAction("sheet_finalise", { id: s1.id }, cx()); ok(f.refused && /tick at least one reason/.test(f.why) && /line of reasoning/.test(f.why) && f.missing.length >= 2, "finalise outside the range names the missing reason and line: " + f.why);
await handleSheetAction("sheet_save", { id: s1.id, patch: { decision: { ...base, mode: "reserve", reserve: "68000" } } }, cx());
f = await handleSheetAction("sheet_finalise", { id: s1.id }, cx()); ok(f.ok && f.sheet.status === "Finalised" && /^DV-\d{4}-\d{4}$/.test(f.sheet.final.reportNumber), "finalise inside the range: allowed, a report number is stamped (" + (f.sheet && f.sheet.final.reportNumber) + ")");
const after = await handleSheetAction("sheet_save", { id: s1.id, patch: { decision: { ...base, mode: "reserve", reserve: "69999" } } }, cx()); ok(after.refused, "a finalised sheet cannot be changed: " + after.why);
const again = await handleSheetAction("sheet_finalise", { id: s1.id }, cx()); ok(again.refused, "a finalised sheet cannot be finalised again");
const frozen = await store.get("sam", s1.id); ok(frozen.read.frozen === true && frozen.final.seat === "crew" && frozen.final.finalisedAt && frozen.final.decision.reserve === "68000", "finalise froze the read and stamped the seat and the time");
const fixCopy = await handleSheetAction("sheet_correct", { id: s1.id }, cx()); const nw = await store.get("sam", fixCopy.id); ok(fixCopy.ok && nw.corrects === s1.id && nw.status === "New", "a correction is a NEW sheet that references the old one");
// guard through the action: a second sheet for the same VIN, 15 percent or more from the first
const s2 = await seed(store); await handleSheetAction("sheet_open", { id: s2.id }, cx()); await handleSheetAction("sheet_save", { id: s2.id, patch: { tier: 2, decision: { ...base, mode: "reserve", reserve: "80000", reasons: ["provenance"], line: "History." } } }, cx());
f = await handleSheetAction("sheet_finalise", { id: s2.id }, cx()); ok(f.refused && /earlier valuation of this VIN/.test(f.why) && /engine median/.test(f.why), "both guards ask for their lines at finalise: " + f.why.slice(0, 130));

// ---- the page prints it: the reasons, the guards inline, the refusal naming what is missing
{
  const D = await startDesk({ org: "org-page" }); const a = await seed(D.store, { org: "org-page" }); const p = await D.open(1440); await press(p, `[data-open="${a.id}"]`); await wait(800); await press(p, '[data-tier="2"]'); await wait(700);
  await press(p, '[data-dmode="reserve"]'); await wait(500); await typeIn(p, '[data-k="d-reserve"]', "82000"); await wait(900);
  const t = await p.evaluate(() => document.querySelector('[data-sec="6"]').innerText);
  ok(/Outside the market range/i.test(t) && /at least one/i.test(t) && /\$65,500 to \$71,500/.test(t) && /\$69,050/.test(t), "the page shows outside the market range, that a reason is needed, and the meter's range and engine median beside the field");
  ok(await p.evaluate(() => !!document.querySelector(".guard")) && /more than 15 percent from the engine median of \$69,050/.test(await p.evaluate(() => document.querySelector(".guard").innerText)), "the guard shows inline, as the expert types, in the engine's words");
  await press(p, "[data-finalise]"); await wait(700);
  const r = await p.evaluate(() => document.querySelector('[data-sec="7"]').innerText);
  ok(/cannot be finalised yet/.test(r) && /tick at least one reason/.test(r) && /line of reasoning/.test(r) && /Type why this is away from the engine median/.test(r), "Finalise is refused on the page and the refusal names what is missing: " + r.replace(/\s+/g, " ").slice(0, 200));
  await press(p, '[data-reason="provenance"]'); await settle(p); await typeIn(p, '[data-k="d-line"]', "Known history."); await typeIn(p, '[data-k="g-start"]', "Two matching private sales."); await settle(p); await wait(1000);
  await press(p, "[data-finalise]"); await settle(p); await wait(900);
  const r2 = await p.evaluate(() => document.querySelector('[data-sec="7"]').innerText);
  ok(/Report\s+DV-\d{4}-\d{4}/.test(r2) && /Download the PDF/.test(r2) && await p.evaluate(() => [...document.querySelectorAll(".sheet input, .sheet textarea, .sheet select, .sheet [data-tier], .sheet [data-chk]")].filter(e => !e.closest(".send")).every(e => e.disabled)), "with the reason, the line and the guard's line the sheet finalises, and every field is locked");
  ok(p._errs.length === 0, "no page error");
  await D.close();
}
console.log(`reasonRulesCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
