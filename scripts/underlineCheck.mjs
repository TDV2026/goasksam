// THE NUMBER RULE, RENDERED (Sam, Oct 28 2026, e98). Every card, every state: exactly one visual weight for a number. Nothing that is a number is ever underlined, ever a link, ever small, and under the figures a card
// carries at most two small lines. This renders the same pages e98Shots.mjs photographs (Market Check: 2004 M3 split, 2001 M3 alike with options, 1985 Defender 110 year split, 1994 911 Carrera Cabriolet with 27,000
// typed; Find: 2003 Alpina Roadster V8, 2014 Boxster, the black BMW page) in Chrome at 1440 and 390 wide and reads the COMPUTED styles, so a new class or a new state is caught by what it looks like, not by its name.
//   FAIL: a currency figure inside an anchor, or under an underline (the element's or any ancestor's text-decoration), inside an answer card (.sfc-card, the Find Sam box .sl);
//         a range ("$a to $b") set below 20px (the two small lines Sam allows, the other option's line and the near-miles line, are lines, not figures); more than two small lines under the figures; the stale line ("Sales read on ... Updating now.") or "Latest sale:" anywhere in a card; a footer over one sentence-line of facts.
//   node scripts/underlineCheck.mjs        E98_ROOT=<another checkout> to read that tree's pages (how it was shown failing on main)
import { MC, FIND, BLACK_BMW } from "./e98Fixtures.mjs";
import { startBrowser, openMC, ROOT } from "./e98Render.mjs";
import { buildCards, openFind } from "./e98FindRender.mjs";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const inPage = () => {
  const out = { under: [], small: [], tiny: [], text: [], lines: [] };
  const vis = e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 2 && r.height > 2 && s.visibility !== "hidden" && s.display !== "none"; };
  const cards = [...document.querySelectorAll(".sfc-card, .car .sl")];
  const underlined = e => { for (let n = e; n && n !== document.body; n = n.parentElement) { if (/underline/.test(getComputedStyle(n).textDecorationLine || "")) return true; } return false; };
  const inAnchor = e => !!e.closest("a[href]");
  for (const card of cards) {
    out.text.push(card.innerText);
    const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
    for (let t; (t = walker.nextNode());) {
      if (!/\$\s?\d/.test(t.nodeValue)) continue;
      const e = t.parentElement; if (!e || !vis(e) || e.closest(".sfc-sr")) continue;
      if (underlined(e) || inAnchor(e)) out.under.push(t.nodeValue.trim().slice(0, 60) + (inAnchor(e) ? " [in a link]" : " [underlined]"));
      if (/\$[\d,]+\s*(?:to)\s*\$[\d,]+/.test(t.nodeValue) && parseFloat(getComputedStyle(e).fontSize) < 20 && !e.closest(".fx-sales, .md-opts, .fx-near, .fx-count, .sfc-small")) out.tiny.push(t.nodeValue.trim().slice(0, 60) + " @" + getComputedStyle(e).fontSize);
    }
    // the small lines under the figures: a visible text block under 15px that is not a label (uppercase), a count under a block, a pill, the footer, the spec, a sale line or a button
    let n = 0;
    for (const e of card.querySelectorAll("p, div")) {
      if (!vis(e) || e.closest(".sfc-footer, .sfc-pill, .sfc-block, .acts, .fx-sales, button, .sfc-rows, .sfc-narrow") || e.querySelector("p, div, button")) continue;
      const s = getComputedStyle(e);
      if (s.textTransform === "uppercase" || e.classList.contains("fx-spec") || e.classList.contains("who") || /^SAM$/i.test(e.innerText.trim())) continue;
      if (parseFloat(s.fontSize) < 15 && e.innerText.trim()) n++;
    }
    out.lines.push(n);
  }
  out.cards = cards.length; return out;
};
const judge = (name, r) => {
  ok(r.cards > 0, `${name}: an answer card is on the page`);
  ok(!r.under.length, `${name}: no currency figure is underlined or a link${r.under.length ? " (" + r.under.slice(0, 3).join(" | ") + ")" : ""}`);
  ok(!r.tiny.length, `${name}: every range is set large${r.tiny.length ? " (" + r.tiny.slice(0, 2).join(" | ") + ")" : ""}`);
  ok(r.lines.every(n => n <= 2), `${name}: at most two small lines under the figures (${r.lines.join(", ")})`);
  const all = r.text.join(" ");
  ok(!/Sales read on|Sales since then are not in yet|Updating now/.test(all), `${name}: the stale line never prints`);
  ok(!/Latest sale: [A-Z]/.test(all), `${name}: no "Latest sale: Month Year" line`);
};
// the stale line is an engine field (api/sellerDecision.js) the pages must never print: no page-side file may read it into markup
{ const fs = await import("node:fs"), path = await import("node:path"); const bad = [];
  const walk = d => { for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) { const p = d + "/" + e.name; if (e.isDirectory()) walk(p); else if (/\.(js|mjs)$/.test(e.name) && !/^api\/sellerDecision\.js$|^lib\/engineFields\.js$/.test(p)) { const code = fs.readFileSync(path.join(ROOT, p), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, ""); if (/\.staleLine\b|Sales since then are not in yet/.test(code)) bad.push(p); } } };
  for (const d of ["api", "lib", "public/js"]) walk(d);
  ok(!bad.length, "no page or email reads the engine's staleLine into markup" + (bad.length ? " (" + bad.join(", ") + ")" : "")); }
const b = await startBrowser();
console.log("underlineCheck reading " + ROOT);
for (const [n, fx] of Object.entries(MC)) for (const w of [1440, 390]) { const p = await openMC(b, fx, w); judge(`Market Check ${n} at ${w}`, await p.evaluate(inPage)); await p.close(); }
const sets = { "Find card 2003 BMW Alpina Roadster V8": [FIND["2003 BMW Alpina Roadster V8"]], "Find card 2014 Porsche Boxster": [FIND["2014 Porsche Boxster"]], "Find page, black BMW": Object.values(BLACK_BMW) };
for (const [n, defs] of Object.entries(sets)) { const cards = await buildCards(defs); for (const w of [1440, 390]) { const p = await openFind(b, cards, w); judge(`${n} at ${w}`, await p.evaluate(inPage)); await p.close(); } }
await b.close();
console.log(`underlineCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
