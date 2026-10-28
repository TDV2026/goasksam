import { FIND, FIND_MATCHED, CORVETTE, BLACK_BMW, M3_ROW, PORSCHE_2005, NO_META, HISTORY } from "./e98Fixtures.mjs";
import { startBrowser } from "./e98Render.mjs";
import { buildCards, openFind } from "./e98FindRender.mjs";
const out = process.argv[2] || "docs/screens/e98", b = await startBrowser();
const slug = s => s.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
const sets = { "find-page-black-bmw": Object.values(BLACK_BMW) };
sets["find-card-boxster-s-pdk-matched"] = [FIND_MATCHED];
sets["find-single-live-match-1965-corvette"] = [CORVETTE];
sets["find-row-bmw-m3"] = Object.values(M3_ROW);
sets["find-row-prior-history"] = Object.values(HISTORY);
sets["find-row-no-miles-no-place"] = [...Object.values(M3_ROW).slice(0, 2), NO_META];
sets["find-page-2005-porsche-911-no-answer"] = Object.values(PORSCHE_2005);
for (const [n, c] of Object.entries(FIND)) sets["find-card-" + slug(n)] = [c];
for (const [name, defs] of Object.entries(sets)) { const cards = await buildCards(defs); for (const w of [1440, 390]) { const p = await openFind(b, cards, w, "black BMW"), f = `${out}/${name}-${w}.png`; await p.screenshot({ path: f, fullPage: true }); console.log(f, p._inputs); await p.close(); } }
await b.close();
