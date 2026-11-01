// THE EBAY PARTNER DEMO NEVER SHOWS A BLANK PANEL (Lane E, Oct 31 2026, the 2025 Porsche 911 card). On the live head the demo (/preview, api/partnerDemo.js)
// drew the identity chips and the List it button and nothing between them: the engine asked for the trim (tier trim_choice), the demo's questionOf did not
// map that tier, the page read a.question alone, and an answer with no range, no thin line and no card drew an empty panel. The class: ANY engine answer
// the demo does not map must still draw a range, the engine's thin / waiting / refusal line, the engine's own question, or the one plain line the engine registers.
// This check renders all four views (a, b, c, d) at 1440 and 390 against stubbed engine answers in the CURRENT shape, through the real partnerShape, with the page
// served as it is. It fails on a missing panel, a dead pill (a reserve that gets no pill, or a pill with no words) and any error text. No network.
//   node scripts/partnerDemoCheck.mjs     exit 1 on any failure.
import { MC } from "./e98Fixtures.mjs";
import { startBrowser } from "./e98Render.mjs";
import { pageHtml, DUMMY } from "../api/partnerDemo.js";
import { partnerShape } from "../api/partnerAnswer.js";
import { reasonLine } from "../lib/reasonWords.js";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const COULD_NOT = reasonLine("cold.missed"), READING = reasonLine("cold.reading");

const RANGE = { status: "one_box", ...MC["2001 BMW M3 (alike with options)"].d };
const SPLIT = { status: "one_box", ...MC["2004 BMW M3 (split)"].d };
const strip = d => { const o = { ...d }; for (const k of ["options", "optionLines", "headlineLines", "optionsState", "windowLine", "rangeSentence", "trimQuestion", "bodyOptions", "variantOptionsLine", "inlineSplits", "thinLine", "refusal_line", "optionsRemainder", "refineOptions"]) delete o[k]; return o; };
const THIN_LINE = "Only 3 sales of cars like this in the last year, too few for a typical range.";
const THIN = { ...strip(RANGE), tier: "thin", cluster: null, thinLine: THIN_LINE, poolN: 3 };
const REFUSAL_LINE = "Sales too spread out for a range.";
const REFUSAL = { ...strip(RANGE), tier: "refusal", cluster: null, refusal_line: REFUSAL_LINE, samLine: REFUSAL_LINE };
const WAITING = { status: "one_box", tier: "unavailable", stillReading: true, samLine: READING, retry: false };
const NOTHING = { ...strip(RANGE), tier: "thin", cluster: null, cards: [], poolN: 0 };   // an engine answer that names no line at all: the demo still draws one plain line
const RC = { year: 2025, make: "Porsche", model: "911", nameModel: "911", canonicalLabel: "2025 Porsche 911 (992)" };
const MODEL_Q = { status: "one_box", tier: "model_choice", askIndex: 1, resolvedCar: { year: 2025, make: "Porsche" }, baseLabel: "2025 Porsche", prompt: "Which Porsche model?", modelOptions: ["911", "Cayenne"] };
const TRIM_Q = { status: "one_box", tier: "trim_choice", askIndex: 2, resolvedCar: RC, prompt: "Which 911?", trimOptions: [{ label: "Carrera", value: "carrera", n: 14 }, { label: "Carrera S", value: "carrera s", n: 9 }], trimChips: ["Carrera (14)", "Carrera S (9)"], optionCounts: [14, 9] };

// each scenario: the engine answers in order (the last repeats), what the panel must say, whether a range is expected
const SCENARIOS = [
  { name: "range", answers: [RANGE], say: ["$22,500", "$41,000"], range: true },
  { name: "split (one block per option)", answers: [SPLIT], say: ["$"], range: false },
  { name: "thin", answers: [THIN], say: [THIN_LINE], range: false },
  { name: "refusal", answers: [REFUSAL], say: [REFUSAL_LINE], range: false },
  { name: "waiting", answers: [WAITING], say: [READING], range: false, allowTryAgain: true },
  { name: "engine names no line", answers: [NOTHING], say: [COULD_NOT], range: false, allowCouldNot: true },
  { name: "model question", answers: [MODEL_Q, RANGE], say: ["Which Porsche model?"], range: false, ask: true },
  { name: "trim question (the 2025 911)", answers: [TRIM_Q, RANGE], say: ["Which 911?", "Carrera"], range: false, ask: true, follow: ["$22,500", "$41,000"] }
];
const ERR = /undefined|NaN|\[object|TypeError|ReferenceError|Unexpected token|Something went wrong|\bnull\b/;

const browser = await startBrowser();
async function open(view, car, width, answers) {
  const p = await browser.newPage(); await p.setViewport({ width, height: 900, deviceScaleFactor: 1 });
  const errs = [], html = pageHtml(view, car); let n = 0; p._asked = [];
  p.on("pageerror", e => errs.push("pageerror " + e.message)); p.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push("console " + m.text()); });
  await p.setRequestInterception(true);
  p.on("request", r => { const u = new URL(r.url());
    if (u.host === "goasksam.com" && r.isNavigationRequest()) return r.respond({ status: 200, contentType: "text/html", body: html });
    if (u.host === "goasksam.com" && u.pathname === "/api/partnerAnswer" && r.method() === "POST") {
      let b = {}; try { b = JSON.parse(r.postData() || "{}"); } catch {} p._asked.push(b);
      const d = answers[Math.min(n++, answers.length - 1)], out = { ...partnerShape(d, b.q || car, Number(b.asked) || 0, {}), updated: null };
      return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(out) }); }
    if (u.host === "goasksam.com") return r.respond({ status: 204, body: "" });
    return r.respond({ status: 204, body: "" }); });
  await p.goto("https://goasksam.com/preview?view=" + view + "&car=" + encodeURIComponent(car), { waitUntil: "networkidle2" }).catch(() => {});
  await new Promise(r => setTimeout(r, 500));
  return { p, errs };
}
const OUT = { a: "#a-out", b: "#b-out", c: "#c-rail", d: "#c-rail" };   // d is the merged listing page: the rail and the list under the gallery
const textOf = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); return e ? e.innerText.replace(/\s+/g, " ").trim() : null; }, sel).catch(() => null);

for (const width of [1440, 390]) for (const view of ["a", "b", "c", "d"]) for (const sc of SCENARIOS) {
  const car = view === "c" || view === "d" ? DUMMY.q : "2025 Porsche 911", tag = `${view} ${width} ${sc.name}`;
  const { p, errs } = await open(view, car, width, sc.answers);
  try {
    const t = await textOf(p, OUT[view]);
    ok(t != null && t.length > 0, `${tag}: the panel exists and is not empty (${t == null ? "no panel" : "empty"})`);
    ok(sc.say.every(s => (t || "").includes(s)), `${tag}: the panel says ${JSON.stringify(sc.say)}, got ${JSON.stringify((t || "").slice(0, 160))}`);
    const body = await p.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
    ok(!ERR.test((t || "")), `${tag}: no error text in the panel (${((t || "").match(ERR) || [])[0]})`);
    ok(sc.allowCouldNot || !(t || "").includes(COULD_NOT), `${tag}: the "could not read" line is only for a read that gave nothing`);
    ok(sc.allowTryAgain || !/Try again/.test(t || ""), `${tag}: no Try again on a read that answered`);
    ok(errs.length === 0, `${tag}: no page or console error (${errs[0] || ""})`);
    ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${tag}: no sideways scroll`);
    if (sc.ask && (view === "a" || view === "b")) {
      const opts = await p.$$(OUT[view] + " button.opt");
      ok(opts.length >= 2, `${tag}: the engine's question has its options as tappable chips (${opts.length})`);
      const tall = await p.evaluate(s => Array.from(document.querySelectorAll(s + " button.opt")).every(b => b.getBoundingClientRect().height >= 30), OUT[view]);
      ok(tall, `${tag}: the chips are tappable size`);
      const labels = await p.evaluate(s => Array.from(document.querySelectorAll(s + " button.opt")).map(b => b.innerText.trim()), OUT[view]);
      ok(labels.every(l => !/\(\d[\d,]*\)\s*\(\d[\d,]*\)/.test(l)), `${tag}: a count is printed once beside a chip (${labels.join(" | ")})`);
      if (sc.follow && opts.length) {
        await opts[0].click(); await new Promise(r => setTimeout(r, 900));
        const t2 = await textOf(p, OUT[view]);
        ok(sc.follow.every(s => (t2 || "").includes(s)), `${tag}: choosing the first chip draws the range, got ${JSON.stringify((t2 || "").slice(0, 120))}`);
        const sent = p._asked[p._asked.length - 1] || {};
        ok(sent.refine && sent.refine.trim === "carrera", `${tag}: the chip sends the engine's own refine (${JSON.stringify(sent)})`);
      }
    }
    // THE PILL (views b and c): a reserve (b) or the sample price (c) is placed against the engine's range field, and a pill with no words is dead
    if (sc.name === "range" || sc.name === "thin") {
      if (view === "b") {
        const cases = sc.range ? [[30000, "in"], [60000, "above"], [10000, "below"]] : [[30000, null]];   // no range: no pill (Sam, Oct 19 2026), and the engine's line says why
        for (const [v, cls] of cases) {
          await p.evaluate(x => { const i = document.getElementById("b-res"); i.value = String(x); i.dispatchEvent(new Event("input", { bubbles: true })); i.dispatchEvent(new Event("change", { bubbles: true })); }, v);
          await new Promise(r => setTimeout(r, 250));
          const pill = await p.evaluate(() => { const e = document.querySelector("#b-out .pill"); return e ? { cls: e.className, text: e.innerText.trim() } : null; });
          if (cls) ok(pill && new RegExp("\\b" + cls + "\\b").test(pill.cls) && pill.text.length > 3, `${tag}: a reserve of ${v} gets the ${cls} pill with words (${JSON.stringify(pill)})`);
          else ok(!pill, `${tag}: with no range a reserve gets no pill (${JSON.stringify(pill)})`);
        }
      }
      if (view === "c" && sc.range) {
        const pill = await p.evaluate(() => { const e = document.querySelector("#c-rail .pill, #c-sample .pill"); return e ? { cls: e.className, text: e.innerText.trim() } : null; });
        ok(pill && /\b(in|above|below)\b/.test(pill.cls) && pill.text.length > 3, `${tag}: the price on the listing gets a pill against the range (${JSON.stringify(pill)})`);
      }
    }
    if (view === "d" && sc.range) {
      const list = await textOf(p, "#d-sales");
      ok(list != null && list.length > 0, `${tag}: the sales list under the listing is not empty`);
    }
  } catch (e) { ok(false, `${tag}: threw ${e.message}`); }
  await p.close();
}
await browser.close();
console.log(`partnerDemoCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
