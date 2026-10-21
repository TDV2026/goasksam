// AMAZON DEMO REVISION 4, STAGE R4-B (Sam, Oct 20 2026, item 2): the engine's question as Amazon-styled chips under the car
// name on tabs a and b. The question, its options and their order come only from the engine's answer (answer.question); the
// page writes no question text. Choosing a chip re-reads the engine with that option's own send values, makes the answer the
// current car (the address, the name under every box and all four tab links) and carries across the four tabs; tab c never
// asks (it reads the car as narrowed, or shows the engine's question in the Market Check panel). No network.
//   node scripts/amazonQuestionChipsCheck.mjs     exit 1 on any failure.
import fs from "node:fs";
import { amazonPageHtml } from "../api/_amazonDemo.js";
import { carOf, DUMMY } from "../api/partnerDemo.js";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const h = amazonPageHtml("a", "2019 porsche 911", { carOf, listing: DUMMY }), js = h.slice(h.indexOf("<script>") + 8, h.lastIndexOf("</script>"));
const page = h.replace(/<script>[\s\S]*<\/script>/, "");
const cardFn = js.slice(js.indexOf("function cardHtml(a){"), js.indexOf("// This exact car's history"));
ok(/function askOf\(a\)\{ return a && \(a\.engineQuestion \|\| a\.question\) \|\| null; \}/.test(js) && /if \(askOf\(a\)\) \{\s*var q = askOf\(a\), opts = \(q\.options \|\| \[\]\)\.concat\(q\.skip \? \[q\.skip\] : \[\]\);/.test(js.slice(js.indexOf("function askOf(a)"), js.indexOf("// This exact car's history"))), "the chips are drawn from the engine's question only (engineQuestion, else question): its options, then the engine's skip, in the engine's order");
ok(/\(o\.count != null && !\/\\\(\\d\+\\\)\/\.test\(String\(o\.label\)\) \? " \(" \+ esc\(o\.count\) \+ "\)" : ""\)/.test(cardFn + js.slice(js.indexOf("function askOf(a)"), js.indexOf("// This exact car's history"))), "a count beside a label is the engine's own count, never one of the page's, and never twice");
ok(/'<p class="q-text">' \+ esc\(q\.text\)/.test(cardFn) && /esc\(o\.label\)/.test(cardFn) && /data-qsend="' \+ esc\(JSON\.stringify\(o\.send \|\| \{\}\)\)/.test(cardFn), "the question text and every label are the engine's own; each chip carries the option's own send");
ok(/q\.skip && i === opts\.length - 1 \? " skip" : ""/.test(cardFn), "the engine's skip option is the last, plainer chip");
// no question text of the page's own anywhere in the page or its script
ok(!/Which (911|one|car|body|model|generation)|Did you mean|Is it a /i.test(h), "the page writes no question text");
// the chip click
const click = js.slice(js.indexOf('var o = e.target.closest("[data-qsend]")'), js.indexOf("// TAB c: the vehicle page."));
ok(/var cw = o\.getAttribute\("data-carword"\) \|\| send\.q \|\| "", words = cw \? carWord\(cw\) : null; if \(words && words !== CAR\) setCar\(words\);/.test(click) && /ANS = Object\.keys\(ns\)\.length \? ns : null; syncAddress\(\);/.test(click) && /read\(send, draw\);/.test(click) && /data-carword="' \+ esc\(o\.carWord \|\| ""\)/.test(js), "choosing a chip re-reads the engine with the option's own send and makes it the current car: the engine's carWord in the boxes and the address (words, links, boxes)");
ok(/ns\.refine = send\.refine; if \(typeof send\.label === "string"\) ns\.label = send\.label; if \(send\.q\) ns\.q = send\.q; \} if \(typeof send\.asked === "number"\) ns\.asked = send\.asked;/.test(click), "only the engine's own send values (q, refine, label, asked) are carried, so every tab re-reads the same narrowed pool");
ok(/function syncAddress\(\)\{[\s\S]*history\.replaceState\(null, "", qs\(VIEW\)\)[\s\S]*querySelectorAll\("\.tabs a\[data-view\]"\)[\s\S]*\.back-l/.test(js) && /function qs\(view\)\{ return "\?p=amazon&view=" \+ view \+ "&car=" \+ encodeURIComponent\(CAR\) \+ \(ANS \? "&ans=" \+ encodeURIComponent\(JSON\.stringify\(ANS\)\) : ""\); \}/.test(js), "the choice rewrites the address and every tab link, no reload");
ok(/function withAns\(b\)\{ if \(ANS && b && \(b\.q === CAR \|\| b\.q === LISTCAR\)\) \{ if \(ANS\.q\) b\.q = ANS\.q;/.test(js) && /read\(withAns\(\{ q: q \}\), drawA\)/.test(js) && /read\(withAns\(LIST/.test(js) && /function bodyOf\(\)\{ return withAns\(/.test(js), "every tab's read carries the chosen answer, so tabs a, b, c and d read the car with the same narrowing");
ok(/aj\.refine\[k\] === "string"/.test(js) && /typeof aj\.asked === "number"/.test(js), "a hand-edited address cannot send anything but string refine values and a number");
ok(/ANS = null; syncAddress\(\);/.test(js.slice(js.indexOf("function setCar(t){"), js.indexOf("function nameLine"))), "a newly typed car clears the old choice");
// tab c never asks: its panel shows the engine's question, with no price block
ok(/var block = ok && !a\.question,/.test(js) && /var scope = ok && \(inScope\(a\) \|\| !!askOf\(a\)\)/.test(js) && /function mcCard\(a\)\{ return cardHtml\(a\)/.test(js), "tab c: an engine question shows in the Market Check panel as the engine words it, with no listing block");
// inert apart from the re-read
const buttons = (page.match(/<button\b[^>]*>/g) || []);
ok(buttons.every(b => /type="submit"/.test(b) || /data-(inert|mc-toggle|hist|close|a-go|b-go|qsend|stab)/.test(b)), "every control stays inert apart from the allowed ones");
const css = h.slice(h.indexOf("<style>"), h.indexOf("</style>"));
ok(/\.qchip\{[^}]*border-radius:999px/.test(css) && /\.qchip\.skip\{/.test(css), "Amazon-styled chips");
for (const v of ["a", "b", "c", "d"]) for (const car of ["2019 porsche 911", "3", "1G1YY12S035102964"]) {
  const hv = amazonPageHtml(v, car, { carOf, listing: DUMMY });
  let parsed = true; try { new Function(hv.slice(hv.indexOf("<script>") + 8, hv.lastIndexOf("</script>"))); } catch (e) { parsed = false; console.log(String(e.message)); }
  ok(parsed, `the page script parses (view ${v}, car ${car})`);
}
ok(/var wait = v === "a" \? \$\("a-out"\) : v === "b" \? \$\("b-out"\) : \$\("mc-body"\); if \(wait\) wait\.innerHTML = '<p class="loading">Reading the sales for this one\.<\/p>';\s*read\(send, draw\);/.test(click), "a chosen chip shows the page's own reading line at once, until the engine answers");
ok(!/[–—]/.test(h), "no dashes");
console.log(`amazonQuestionChipsCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
