// DESK V4 WIRE CHECK (Lane S, Nov 10 2026). The screen computes nothing: every figure and sentence in the centre column and the Reserve panel is a string the server sent (Lane B's desk.*, Lane D's case view) or a fixed interface label.
//   1 TRACE: in Chrome on the real reader, every text node and input value that carries a digit equals a string the page was given (the case view as it now stands, or the model words), or is two or more of them joined by a space or a dot (the reach and position lines are two sent sentences).
//     The only exceptions are the list lengths the screen draws as labels (#ccount, #pcount, #showall, #attN, #dcount, the step numbers); none of them is an evidence figure.
//   2 THE ONE ARITHMETIC: the client source may use Math, parseFloat, toFixed, toLocaleString, Intl, reduce or a multiplication ONLY inside scaleOf, figureAt, domain and plot (the plot's own axis: price to x, pointer back to a figure).
//     And the axis is exactly invertible: figureAt(scaleOf(v)) returns v within a dollar for the sent q1, median and q3 (the pointer position becomes a figure on the plot's own axis and nothing else).
//   2b PRINTED AS SENT: where the engine sent a line the screen has a place for (the median, each closest sale's price, miles and date), the line is on the screen as sent, never blank (a blank is how a page ends up building its own).
//   3 MUTANTS, each run through the same assertions, must be caught: a typed sentence, a page built count, a page built range, a Math.round on a sent figure.
//   CLASS: any figure or sentence the page makes itself instead of printing the server's. numberSentenceCheck sweeps the files for formatters; this one proves it on the rendered page.
//   node scripts/deskV4WireCheck.mjs
import fs from "node:fs";
import { launch, openLive, tally, V4 } from "./deskV4Harness.mjs";
const { ok, done } = tally();
const SRC = fs.readFileSync("lib/preview/deskV4Client.js", "utf8");

const TRACE = () => {
  const M = new Set(), walk = o => { if (o == null) return; if (typeof o === "string") M.add(o.trim()); else if (typeof o === "number") M.add(String(o)); else if (typeof o === "object") for (const k in o) walk(o[k]); };
  walk(window.__v4.K()); walk(window.__v4.D); const arr = [...M].filter(Boolean);
  const covered = (t, depth = 0) => { t = t.replace(/\s*↗/g, "").replace(/^[\s·.]+/, "").replace(/[\s·.]+$/, ""); if (!t) return true; if (arr.some(m => m === t || m.replace(/[\s·.]+$/, "") === t)) return true; if (depth > 4) return false; return arr.some(m => m.length >= 4 && t.startsWith(m.replace(/[\s·.]+$/, "")) && covered(t.slice(m.replace(/[\s·.]+$/, "").length), depth + 1)); };
  const allowed = e => e.closest("#ccount,#pcount,#showall,#attN,#dcount,#stepAuto,.steps .num");
  const bad = [], seen = [];
  for (const root of [document.getElementById("col"), document.getElementById("val")]) {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n; (n = w.nextNode());) { const t = n.nodeValue.trim(); if (!t || !/\d/.test(t) || n.parentElement.closest("script,style,#newcase,select")) continue; if (allowed(n.parentElement)) continue; seen.push(t); if (!covered(t)) bad.push(t); }
    for (const i of root.querySelectorAll("input,textarea")) { if (i.type === "file" || i.type === "checkbox" || i.closest("#newcase")) continue; const t = String(i.value || "").trim(); if (!t || !/\d/.test(t) || allowed(i)) continue; seen.push(t); if (!covered(t)) bad.push(t); }
  }
  return { bad, n: seen.length };
};

// the arithmetic scan: every use is inside one of the plot's own axis functions
function arithmeticOutsideAxis(src) {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map(l => l.replace(/^\s*\/\/.*$/, "").replace(/("(?:[^"\\]|\\.)*")|('(?:[^'\\]|\\.)*')/g, '""')).join("\n");
  const OK = new Set(["scaleOf", "figureAt", "domain", "plot"]), hits = []; let fn = "";
  for (const line of code.split("\n")) {
    const m = line.match(/^  function (\w+)\(/) || line.match(/^  window\.(\w+) = function/); if (m) fn = m[1]; else if (/^export function/.test(line)) fn = "";
    if (/\bMath\.\w+|\bparseFloat\b|\bparseInt\b|\.toFixed\(|\.toLocaleString\(|\bIntl\.|\.reduce\(|[\w)\]]\s\*\s[\w(]/.test(line) && !OK.has(fn)) hits.push(`${fn || "(top)"}: ${line.trim().slice(0, 90)}`);
  }
  return hits;
}
ok(arithmeticOutsideAxis(SRC).length === 0, "the client source does arithmetic only inside the plot's axis functions" + (arithmeticOutsideAxis(SRC).length ? ": " + arithmeticOutsideAxis(SRC).join(" | ") : ""));

const SENT = () => { const K = window.__v4.K(), e = K.desk.evidence, miss = [];
  if (e.medianLine && (document.getElementById("mMed") || {}).textContent !== e.medianLine) miss.push("medianLine");
  for (const c of K.desk.comparables) { const r = document.querySelector(`[data-comp="${c.id}"]`); if (!r) { miss.push("row " + c.id); continue; } if (c.priceLine && r.querySelector(".pr").textContent !== c.priceLine) miss.push("priceLine " + c.id); const m = r.querySelector(".m").textContent; for (const k of ["milesLine", "dateLine"]) if (c[k] && !m.includes(c[k])) miss.push(k + " " + c.id); }
  return miss; };
const b = await launch();
async function run(label, mutate, expectBad) {
  const p = await openLive(b, { mutate }); const r = await p.evaluate(TRACE); const arith = arithmeticOutsideAxis(mutate ? (mutate(SRC)) : SRC);
  const miss = await p.evaluate(SENT).catch(() => ["page closed"]); const caught = r.bad.length > 0 || arith.length > 0 || (expectBad === "blank" && miss.length > 0);
  await p.close();
  if (!expectBad) ok(miss.length === 0, `${label}: every engine line the screen has a place for is printed as sent${miss.length ? " | missing: " + miss.slice(0, 4).join(", ") : ""}`);
  if (expectBad) ok(caught, `mutant caught: ${label}${caught ? "" : " (the check passed it)"}`); else ok(!caught && r.n > 15, `${label}: ${r.n} figures and sentences traced, none made by the page${r.bad.length ? " | untraced: " + r.bad.slice(0, 5).join(" / ") : ""}`);
}
await run("the demonstration case as served", null, false);
// the page after real edits (a typed reserve, a condition, a window) still prints only what the server sent
{ const p = await openLive(b); await p.focus("#valIn"); await p.evaluate(() => document.getElementById("valIn").select()); await p.keyboard.type("61000"); await new Promise(r => setTimeout(r, 1500)); await p.click('#cond [data-c="3"]'); await new Promise(r => setTimeout(r, 1200));
  const r = await p.evaluate(TRACE); ok(r.bad.length === 0 && r.n > 15, `after a typed reserve and a condition: ${r.n} traced${r.bad.length ? " | untraced: " + r.bad.slice(0, 5).join(" / ") : ""}`);
  const rt = await p.evaluate(() => { const K = window.__v4.K(), e = K.desk.evidence, a = window.__v4; return [e.q1, e.median, e.q3].map(v => Math.abs(a.figureAt(a.scaleOf(v)) - v)); });
  ok(rt.every(d => d <= 1), `the plot's axis is exactly invertible (round trip off by ${rt.join(", ")} dollars)`); await p.close(); }
// the mutants
await run("a typed sentence (the count typed into the page)", h => h.replace('id: "mN", text: e.countLine', 'id: "mN", text: "39 sales"'), true);
await run("a page built count (the sales listed, counted by the page, while the engine says otherwise)", h => h.split('"countLine":"9 sales"').join('"countLine":"41 sales"').replace('id: "mN", text: e.countLine', 'id: "mN", text: (desk().sales || []).length + " sales"'), true);
await run("a page built range (q1 and q3 joined by the page)", h => h.replace('id: "mBand", text: e.typicalLine', 'id: "mBand", text: "$" + e.q1 + " to $" + e.q3'), true);
await run("a blank where the engine sent a price line", h => h.replace('text: c.priceLine || ""', 'text: ""'), "blank");
await run("arithmetic on a sent figure (a Math.round on the median line)", h => h.replace('id: "mMed", text: e.medianLine', 'id: "mMed", text: String(Math.round(e.median * 1.1))'), true);
await b.close();
done("deskV4WireCheck");
