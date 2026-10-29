// A QUESTION ALWAYS HAS A WAY OUT, A LABEL NEVER PRINTS OVER NOTHING (Sam, Oct 29 2026). Causes: (1) the question pages (which model, generation, body, trim) drew only the engine's option buttons; the engine's wayOut ("Something else", with the text to keep and the hint) was never read, so a person whose car was not in the buttons had nowhere to go. (2) The NARROW BY label printed whenever the strip held the mileage box, so a strip with no chip under it showed the label over a box.
// Class: any question page with no way out; any label or heading whose body is empty or hidden. Rendered at 1440 and 390 on the real page: the four question tiers (wayOut built by the engine's own wayOutFor), and the Market Check result fixtures (every .sfc-label, h2, h3 and eyebrow must have visible content after it; a result with no pills prints no NARROW BY).   node scripts/wayOutAndLabelCheck.mjs
import { startBrowser, openMC } from "./e98Render.mjs";
import { MC } from "./e98Fixtures.mjs";
import { wayOutFor } from "../lib/questionWayOut.js";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const rc = { year: 1995, make: "Porsche", model: "911", nameModel: "911", trim: null, bodyStyle: null, canonicalLabel: "1995 Porsche 911" };
const base = { resolvedCar: rc, askIndex: 1 };
const Q = [
  ["which model (1995 Porsche)", { typed: "1995 porsche", d: { ...base, tier: "model_choice", prompt: "Which Porsche model?", modelOptions: ["911", "928", "968"], wayOut: wayOutFor("model", { year: 1995, make: "Porsche" }) } }, "model"],
  ["which model (1969 Chevrolet)", { typed: "1969 chevrolet", d: { ...base, resolvedCar: { year: 1969, make: "Chevrolet", model: null }, tier: "model_choice", prompt: "Which Chevrolet model?", modelOptions: ["Camaro", "Chevelle", "Corvette"], wayOut: wayOutFor("model", { year: 1969, make: "Chevrolet" }) } }, "model"],
  ["which body", { typed: "1995 porsche 911", d: { ...base, tier: "body_choice", prompt: "Which body is it?", bodyOptions: ["Coupe", "Cabriolet", "Targa"], wayOut: wayOutFor("body", rc) } }, "body"],
  ["which generation", { typed: "1995 porsche 911", d: { ...base, tier: "generation_choice", prompt: "Which generation is it?", generationOptions: [{ label: "993", query: "1995 Porsche 911 993" }, { label: "964", query: "1995 Porsche 911 964" }], wayOut: wayOutFor("generation", rc) } }, "generation"],
  ["which trim", { typed: "1995 porsche 911", d: { ...base, tier: "trim_choice", prompt: "These sold as Carrera and Carrera S. Which one is it?", trimOptions: [{ value: "carrera", label: "Carrera", n: 5 }, { value: "carrera s", label: "Carrera S", n: 4 }], trimChips: ["Carrera (five)", "Carrera S (four)"], optionCounts: [5, 4], wayOut: wayOutFor("trim", rc) } }, "trim"]
];
const b = await startBrowser();
for (const w of [1440, 390]) {
  for (const [name, fx, kind] of Q) { const p = await openMC(b, fx, w), eng = fx.d.wayOut;
    const r = await p.evaluate(() => { const row = document.querySelector(".idq-options-row"), kids = row ? [...row.children] : [], last = kids[kids.length - 1], btn = document.querySelector("[data-wayout]"); return { row: !!row, n: kids.length, lastWay: !!(last && last.hasAttribute("data-wayout")), text: btn ? btn.innerText.trim() : null, vis: btn ? btn.getClientRects().length > 0 : false }; });
    ok(r.row && r.n >= 2 && r.lastWay && r.vis && r.text === eng.label, `${name} at ${w}: the engine's way out ("${eng.label}") is the last button (${r.n} buttons, last is the way out: ${r.lastWay}, reads "${r.text}")`);
    if (r.vis) { await p.click("[data-wayout]"); const a = await p.evaluate(() => { const i = document.getElementById("ob-input"); return { v: i.value, ph: i.getAttribute("placeholder"), focus: document.activeElement === i, at: i.selectionStart === i.value.length }; });
      ok(a.v === eng.prefill && a.ph === eng.placeholder && a.focus && a.at, `${name} at ${w}: a tap puts the engine's text ("${eng.prefill}") and hint in the search box with the cursor after it (value "${a.v}", focused ${a.focus})`); }
    await p.close(); }
  // every label and heading has a body
  for (const [name, fx] of Object.entries(MC)) { const p = await openMC(b, fx, w), r = await p.evaluate(() => { const vis = e => e.getClientRects().length > 0 && getComputedStyle(e).display !== "none"; const bad = [];
      for (const e of document.querySelectorAll("main .sfc-label, main h2, main h3, main .eyebrow")) { if (!vis(e) || !e.textContent.trim()) continue; if (/^(All \\w+ comparable|Market Check|How Sam)/.test(e.textContent.trim()) && e.closest("#more-sales")) { /* body is the table */ }
        let body = e.nextElementSibling, text = ""; while (body && !text) { if (vis(body)) text = body.innerText.trim(); body = body.nextElementSibling; }
        if (!text && e.parentElement && e.parentElement.classList.contains("sec-head")) { const sec = e.parentElement.nextElementSibling; text = sec && vis(sec) ? sec.innerText.trim() : ""; }
        if (!text) bad.push(e.tagName.toLowerCase() + ":" + e.textContent.trim().slice(0, 30)); }
      const strip = document.querySelector(".narrow-strip"), lab = strip && strip.querySelector(".sfc-label"), chips = strip ? strip.querySelectorAll(".sfc-pill, .sfc-chip, .sfc-opt-btn").length : 0;
      return { bad, labelNoChips: !!(lab && chips === 0) }; });
    ok(r.bad.length === 0 && !r.labelNoChips, `${name} at ${w}: no label or heading prints over an empty body${r.bad.length ? " (" + r.bad.slice(0, 3).join(" ; ") + ")" : ""}${r.labelNoChips ? " (NARROW BY with no chip)" : ""}`); await p.close(); }
  // a result with the mileage box and no pills prints no NARROW BY
  const fx = MC["1986 Porsche 911 (Targa 11, Cabriolet 11, Coupe 16 against 35)"], d = { ...fx.d, options: [], optionLines: [], optionsState: "none", refineOptions: [] }, p = await openMC(b, { ...fx, d }, w);
  const r = await p.evaluate(() => { const s = document.querySelector(".narrow-strip"); return { strip: !!s, label: !!(s && s.querySelector(".sfc-label")), miles: !!document.querySelector("#ob-miles"), pills: s ? s.querySelectorAll(".sfc-pill,.sfc-chip,.sfc-opt-btn").length : 0 }; });
  ok(r.miles && r.pills === 0 && !r.label, `no pills, the mileage box only, at ${w}: the box prints and NARROW BY does not (box ${r.miles}, pills ${r.pills}, label ${r.label})`); await p.close(); }
await b.close();
console.log(`wayOutAndLabelCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
