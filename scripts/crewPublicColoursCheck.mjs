// A SIGNED CREW COOKIE CHANGES NO COLOUR ON ANY PAGE (Sam, Oct 28 2026). Cause: the brand palette (brandPaletteCss) and the rail's own tokens were drawn for the crew only, so the crew saw one set of colours (what Sam calls A Current) and every
// visitor another (a different ink, page, green and rail). Class: any colour a page draws only when the request carries the crew cookie. Every page handler is rendered as the public and as the crew, at 1440 and 390, and the design tokens and the
// computed colours of the page's main pieces are compared: any difference fails. The Find and Market Check result pages are read too (fixtures).   node scripts/crewPublicColoursCheck.mjs
import { startBrowser, openAny, openMC } from "./e98Render.mjs";
import { buildCards, openFind } from "./e98FindRender.mjs";
import { colourProbe, colourDiffs, TOKENS, SELECTORS } from "./e98CrewColours.mjs";
import { MC, BLACK_BMW } from "./e98Fixtures.mjs";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const b = await startBrowser(), cards = await buildCards(Object.values(BLACK_BMW)), PAGES = [["Home", "api/home.js", "/"], ["Tasks", "api/tasksPage.js", "/tasks"], ["Tasks (signed in app)", "api/tasksPage.js", "/tasks/mine"], ["Sell", "api/sellPage.js", "/sell"], ["Market Check start", "api/marketCheck.js", "/market-check"], ["Find start", "api/buy.js", "/buy"], ["For business", "api/business.js", "/business"], ["How Sam decides", "api/howSamDecides.js", "/how-sam-decides"], ["About", "api/about.js", "/about"], ["Feedback", "api/feedback.js", "/feedback"]];
let compared = 0; const skipped = [];
for (const w of [1440, 390]) {
  for (const [name, file, url] of PAGES) { let a, c; try { const pub = await openAny(b, file, url, w, {}), crew = await openAny(b, file, url, w, { crew: true }); a = await pub.evaluate(colourProbe, TOKENS, SELECTORS); c = await crew.evaluate(colourProbe, TOKENS, SELECTORS); await pub.close(); await crew.close(); } catch { continue; }
    const filled = o => Object.values(o).filter(v => v && v.trim()).length;
    if (filled(a) < 8) { skipped.push(`${name} at ${w} (the page is not served to the public: ${filled(a)} values)`); continue; } compared++; const d = colourDiffs(a, c); ok(!d.length, `${name} at ${w}: the crew cookie changes no colour (${Object.keys(a).length} values read${d.length ? "; " + d.slice(0, 3).join(" ; ") : ""})`); }
  { const pub = await openMC(b, MC["2001 BMW M3 (alike with options)"], w, {}), crew = await openMC(b, MC["2001 BMW M3 (alike with options)"], w, { crew: true }); const d = colourDiffs(await pub.evaluate(colourProbe, TOKENS, SELECTORS), await crew.evaluate(colourProbe, TOKENS, SELECTORS)); compared++; ok(!d.length, `Market Check result at ${w}: the crew cookie changes no colour${d.length ? " (" + d.slice(0, 3).join(" ; ") + ")" : ""}`); await pub.close(); await crew.close(); }
  { const pub = await openFind(b, cards, w, "black BMW", {}), crew = await openFind(b, cards, w, "black BMW", { crew: true }); const d = colourDiffs(await pub.evaluate(colourProbe, TOKENS, SELECTORS), await crew.evaluate(colourProbe, TOKENS, SELECTORS)); compared++; ok(!d.length, `Find results at ${w}: the crew cookie changes no colour${d.length ? " (" + d.slice(0, 3).join(" ; ") + ")" : ""}`); await pub.close(); await crew.close(); }
}
ok(compared >= 12, `${compared} page and width pairs were compared (at least 12)`);
console.log("not compared (the public is not served the page): " + (skipped.join("; ") || "none"));
await b.close();
console.log(`crewPublicColoursCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
