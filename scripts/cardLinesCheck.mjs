// EVERY LINE ON A CARD SITS INSIDE ITS BOX IN THE CARD'S OWN STYLE (Sam, Oct 29 2026). Cause: the Find card printed the engine's remainder line ("2 sales do not say their gearbox.") as a <p> below the buttons; where the page's rule for it was not applied the paragraph fell to the browser's serif at body size, outside the answer box, a style no other line on the card uses.
// Class: any engine line a small card prints that lands outside the card or in a font no other line on it uses. Rendered here at 1440 and 390 for every Find fixture card and the See the sales drawer: each text element must sit inside its card, be set in the card's sans, except the title and the answer box, which are the card's serif (.ttl, .fx-ans). A stray unstyled paragraph added to a card (the mutant) must be caught.   node scripts/cardLinesCheck.mjs
import { startBrowser } from "./e98Render.mjs";
import { buildCards, openFind } from "./e98FindRender.mjs";
import { openPanel } from "./e98PanelRender.mjs";
import { M3_ROW, FIND } from "./e98Fixtures.mjs";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const SCAN = () => { const bad = [], SANS = "Instrument Sans", SERIF_OK = e => e.closest(".ttl, .fx-ans"); let n = 0;
  for (const a of document.querySelectorAll("article.car, .mcdrawer")) { const ar = a.getBoundingClientRect();
    for (const e of a.querySelectorAll("*")) { if (![...e.childNodes].some(x => x.nodeType === 3 && x.textContent.trim())) continue; const r = e.getBoundingClientRect(); if (!r.width || !r.height) continue; n++;
      const fam = getComputedStyle(e).fontFamily.split(",")[0].replace(/["']/g, ""), why = [];
      if (r.left < ar.left - 1 || r.right > ar.right + 1 || r.bottom > ar.bottom + 1 || r.top < ar.top - 1) why.push("outside its card");
      if (fam !== SANS && !SERIF_OK(e)) why.push("in " + fam + " where the card's lines are " + SANS);
      if (why.length) bad.push(e.tagName.toLowerCase() + "." + String(e.className) + " \"" + e.textContent.trim().slice(0, 30) + "\": " + why.join(", ")); } }
  return { bad, n }; };
const b = await startBrowser(), cards = await buildCards([...Object.values(M3_ROW), ...Object.values(FIND)].slice(0, 8));
for (const w of [1440, 390]) {
  const p = await openFind(b, cards, w), r = await p.evaluate(SCAN); ok(r.n > 40 && r.bad.length === 0, `Find cards at ${w}: every line sits inside its card in the card's own style (${r.n} lines read${r.bad.length ? "; " + r.bad.slice(0, 3).join(" ; ") : ""})`);
  await p.evaluate(() => { const a = document.querySelector("article.car"); const x = document.createElement("p"); x.textContent = "2 sales do not say their gearbox."; a.appendChild(x); });   // the mutant: a paragraph with no rule of its own
  const m = await p.evaluate(SCAN); ok(m.bad.length > 0, `Find cards at ${w}: an unstyled paragraph added to a card is caught (${m.bad[0] || "not caught"})`); await p.close();
  const d = await openPanel(b, w), q = await d.evaluate(SCAN); ok(q.n > 10 && q.bad.length === 0, `See the sales drawer at ${w}: every line sits inside its box in the card's own style (${q.n} lines read${q.bad.length ? "; " + q.bad.slice(0, 3).join(" ; ") : ""})`); await d.close(); }
await b.close();
console.log(`cardLinesCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
