// A NARROWING SHOWS (Sam, Oct 29 2026). Cause: after a pill, a band, a gearbox or a body was tapped the page redrew the narrowed range with nothing saying a filter was on and no way to take it off but typing the car again. The engine now names the narrowing (appliedLine, appliedFilters [{kind, words, clear}]); the page prints the line above the range and one clear control per filter that sends the engine's own `clear`.
// Class: every way of narrowing on the page that answers with a refine: an option pill, a mileage band chip, a gearbox, a body, a typed mileage. Rendered at 1440 and 390 on real fixtures with a stand-in sellerDecision that answers the way the engine does (the engine's own appliedFiltersOf and appliedLineOf over the refine the page sent): after the tap the line shows the engine's words, one clear control with the label "Remove <words>" sits on each filter, the footer and the title line carry no number that contradicts the line (no count in either), tapping the control sends the engine's clear and the unfiltered answer is back with no line.   node scripts/appliedFiltersCheck.mjs
import { startBrowser, openMC } from "./e98Render.mjs";
import { MC } from "./e98Fixtures.mjs";
import { appliedFiltersOf, appliedLineOf } from "../lib/onebox.js";
let pass = 0, fail = 0, skip = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const WAYS = [
  ["a mileage band chip", "2001 BMW M3 (alike with options)", d => (d.refineOptions || []).find(o => o && o.refine && o.refine.miMin != null), "chip"],
  ["a gearbox option", "2004 BMW M3 (split)", d => (d.options || []).find(o => o && o.refine && o.refine.tx), "opt"],
  ["a body option", "1986 Porsche 911 (Targa 11, Cabriolet 11, Coupe 16 against 35)", d => (d.options || []).find(o => o && o.refine && o.refine.body), "opt"],
  ["a year option", "1985 Land Rover Defender 110 (year split)", d => (d.options || []).find(o => o && o.refine && o.refine.year), "opt"],
  ["a typed mileage", "2004 BMW M3 (split)", null, "typed"]
];
const b = await startBrowser();
for (const w of [1440, 390]) for (const [name, key, pick, how] of WAYS) {
  const fx0 = MC[key], sent = []; let target = null;
  if (pick) { target = pick(fx0.d); if (!target) { ok(false, `${name} at ${w}: the fixture has a narrowing to tap`); continue; } }
  const fx = { ...fx0, respond: (n, body) => { sent.push(body && body.refine || null); const rf = body && body.refine, af = rf ? appliedFiltersOf(rf, fx0.d) : [];
    return { status: "one_box", ...fx0.d, ...(af.length ? { appliedFilters: af, appliedLine: appliedLineOf(af) } : { appliedFilters: [], appliedLine: null }), _echoRefine: rf || null }; } };
  const p = await openMC(b, fx, w);
  if (how === "typed") { await p.type("#ob-miles", "60000"); await p.keyboard.press("Enter"); }
  else await p.evaluate((ref) => { const el = [...document.querySelectorAll("[data-refine]")].find(e => { try { return JSON.stringify(JSON.parse(e.getAttribute("data-refine"))) === JSON.stringify(ref); } catch (x) { return false; } }); if (el) el.click(); }, target.refine);
  await new Promise(r => setTimeout(r, 4200));
  const rf = sent[sent.length - 1], af = rf ? appliedFiltersOf(rf, fx0.d) : [];
  if (!af.length) { skip++; console.log(`SKIP ${name} at ${w}: the engine's appliedFiltersOf names no filter for the refine the page sent (${JSON.stringify(rf)}): Lane B`); await p.close(); continue; }
  const r = await p.evaluate(() => { const l = document.querySelector(".applied-line"), xs = [...document.querySelectorAll(".applied-x")], q = document.querySelector(".hero-carname + .hero-scope, .hero-scope"), f = document.querySelector(".sfc-footer-left"); return { line: l ? l.innerText.trim() : null, xs: xs.map(x => ({ label: x.getAttribute("aria-label"), vis: x.getClientRects().length > 0, w: Math.round(x.getBoundingClientRect().width), h: Math.round(x.getBoundingClientRect().height), words: x.closest(".applied-chip").querySelector(".applied-w").innerText.trim() })), above: !!(l && document.querySelector(".sfc-card") && (l.compareDocumentPosition(document.querySelector(".sfc-card")) & Node.DOCUMENT_POSITION_FOLLOWING)), title: q ? q.innerText.replace(/\s+/g, " ").trim() : "", foot: f ? f.innerText.replace(/\s+/g, " ").trim() : "" }; });
  ok(r.line === appliedLineOf(af) && r.above, `${name} at ${w}: the engine's line shows above the range ("${r.line}")`);
  ok(r.xs.length === af.length && r.xs.every((x, i) => x.vis && x.words === af[i].words && x.label === "Remove " + af[i].words && x.w >= 36 && x.h >= 32), `${name} at ${w}: one visible clear control per filter, labelled "Remove <words>" (${r.xs.map(x => x.label).join("; ")})`);
  { const e = fx0.d, f = r.foot.replace(/\s+/g, " "), t = r.title; ok(!/null|undefined/.test(f + t) && (!e.windowLine || f.includes(e.windowLine) || (e.rangeSentence && f.includes(e.rangeSentence))) && (!e.scopeLine || t.includes(e.scopeLine.split(" · ")[0])), `${name} at ${w}: the footer and the title line are the engine's own fields beside the line, unchanged by the page (${t} | ${f})`); }
  const before = sent.length; await p.click(".applied-x"); await new Promise(r2 => setTimeout(r2, 4200));
  const sentClear = sent[sent.length - 1], expect = af[0].clear, after = await p.evaluate(() => ({ line: !!document.querySelector(".applied-line"), xs: document.querySelectorAll(".applied-x").length }));
  ok(sent.length === before + 1 && JSON.stringify(sentClear) === JSON.stringify(expect), `${name} at ${w}: the control sends the engine's own clear refine (${JSON.stringify(sentClear)})`);
  const left = appliedFiltersOf(sentClear, fx0.d);
  ok(left.length ? after.xs === left.length : (!after.line && after.xs === 0), `${name} at ${w}: after clearing ${left.length ? "the other filters stay" : "the unfiltered answer is back with no line"} (${after.xs} controls)`);
  await p.close(); }
await b.close();
console.log(`appliedFiltersCheck: ${pass} pass, ${fail} FAIL${skip ? ", " + skip + " SKIP (engine gap, see lane notes)" : ""}`); process.exit(fail ? 1 : 0);
