// PUBLIC (left) and CREW (right) side by side, one PNG per page and width. E98_ROOT picks the tree (the previous head for "before").   node scripts/e98SideBySide.mjs <outdir> <prefix>
import { startBrowser, openAny, openMC } from "./e98Render.mjs";
import { buildCards, openFind } from "./e98FindRender.mjs";
import { MC, BLACK_BMW } from "./e98Fixtures.mjs";
const out = process.argv[2], pre = process.argv[3], b = await startBrowser(), cards = await buildCards(Object.values(BLACK_BMW));
const PAGES = [["find", w => ({ pub: openFind(b, cards, w, "black BMW", {}), crew: openFind(b, cards, w, "black BMW", { crew: true }) })], ["market-check", w => ({ pub: openMC(b, MC["2001 BMW M3 (alike with options)"], w, {}), crew: openMC(b, MC["2001 BMW M3 (alike with options)"], w, { crew: true }) })],
  ["home", w => ({ pub: openAny(b, "api/home.js", "/", w, {}), crew: openAny(b, "api/home.js", "/", w, { crew: true }) })], ["tasks", w => ({ pub: openAny(b, "api/tasksPage.js", "/tasks", w, {}), crew: openAny(b, "api/tasksPage.js", "/tasks", w, { crew: true }) })], ["sell", w => ({ pub: openAny(b, "api/sellPage.js", "/sell", w, {}), crew: openAny(b, "api/sellPage.js", "/sell", w, { crew: true }) })]];
for (const w of [390, 1440]) for (const [name, mk] of PAGES) {
  const { pub, crew } = mk(w), [pp, cp] = [await pub, await crew], img = async p => (await p.screenshot({ type: "png" })).toString("base64"), [a, c] = [await img(pp), await img(cp)]; await pp.close(); await cp.close();
  const s = await b.newPage(), cw = w === 390 ? 390 : 900; await s.setViewport({ width: cw * 2 + 60, height: 600 });
  await s.setContent(`<body style="margin:0;background:#888;font:600 16px sans-serif;color:#fff"><div style="display:flex;gap:20px;padding:10px"><div><p style="margin:0 0 6px">PUBLIC, ${name}, ${w}</p><img style="width:${cw}px;display:block" src="data:image/png;base64,${a}"></div><div><p style="margin:0 0 6px">CREW, ${name}, ${w}</p><img style="width:${cw}px;display:block" src="data:image/png;base64,${c}"></div></div>`);
  await s.screenshot({ path: `${out}/${pre}-${name}-${w}.png`, fullPage: true }); await s.close(); console.log(`${out}/${pre}-${name}-${w}.png`); }
await b.close();
