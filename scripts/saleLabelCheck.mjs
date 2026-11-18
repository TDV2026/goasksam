// saleLabelCheck (Lane S, Nov 17 2026): the sale card label on the Market Check result (lib/saleLabelPage.js), CREW ONLY behind SALE_LABEL_PUBLIC, through the live handler (api/marketCheck.js, NEW_DESIGN=1, the crew cookie) in Chrome, on the ENGINE'S REAL ANSWER for "1987 Pontiac Firebird" (scripts/saleLabelEngineAnswer.mjs: the live handler api/sellerDecision.js, the crew's request, Lane B's recorded Firebird archive; no fixture answer), served to the page as it came. THE FIELD (Lane B, lane-b-variant-split-2): card.variantLabel, a string or null, on every card of a family car.
//   1 THE LINE: every card prints the engine's variantLabel as sent, ABOVE the price (label, then price, then the meta lines); mixed variants read apart; an unstated sale reads "1987 Firebird"; a replica reads "1987 Firebird Replica"; a set aside tile prints its own
//   2 THE ENGINE'S WORDS, NOT THE TITLE'S: a card whose listing title says Trans Am GTA while the engine says "1987 Firebird" prints the engine's words
//   3 NOTHING TO PRINT: a card with no variantLabel, an empty one, a blank one, one that is not a string: no line and the card is otherwise the same
//   4 THE OTHER CARDS OF THE PAGE: the three cards of "Sales behind this answer" (a pool over sixteen) print the line too
//   5 A LATER ANSWER: one with no variantLabel takes the lines away
//   6 ONE LINE: at 390 and 1440 no sideways scroll, every line on one row, in the card's own meta type
//   7 THE SOURCE COMPUTES NOTHING: no title read, sort, sum, year or word added; 8 THE SWEEP: every file that draws a sale card is named (the class), the labelled one and the ones left for their own branch
//   9 A VISITOR gets the same bytes until the switch is on
//   MUTANTS (in a copy of the worktree): node scripts/saleLabelCheck.mjs --mutants        node scripts/saleLabelCheck.mjs [--shots]     offline; Chrome
import fs from "node:fs"; import path from "node:path"; import { execFileSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (!fs.existsSync(CHROME)) { console.log("saleLabelCheck: SKIP no Chrome"); process.exit(0); }
const FILES = { sl: "lib/saleLabelPage.js", bar: "lib/carBar.js" };
if (process.argv.includes("--mutants")) {
  const MUT = [
    ["the page still reads the field it was first built against (saleLine)", FILES.sl, 'typeof o.variantLabel==="string"&&o.variantLabel.trim())map[String(o.id)]=o.variantLabel.trim();', 'typeof o.saleLine==="string"&&o.saleLine.trim())map[String(o.id)]=o.saleLine.trim();'],
    ["the line printed under the price", FILES.sl, "at.parentNode.insertBefore(p,at)", "at.parentNode.insertBefore(p,at.nextSibling)"],
    ["the line read from the card's title", FILES.sl, 'line=map[id],old=', 'line=map[id]||(el.querySelector(".thin-tile-title,.salescard-title")||{}).textContent,old='],
    ["a card with no variantLabel given the year and model", FILES.sl, "if(!line){if(old)old.remove();continue}", 'if(!line){line="1987 Firebird"}'],
    ["a blank variantLabel accepted", FILES.sl, 'typeof o.variantLabel==="string"&&o.variantLabel.trim())map[String(o.id)]=o.variantLabel.trim();', 'typeof o.variantLabel==="string")map[String(o.id)]=o.variantLabel;'],
    ["a stale line kept when a later answer has none", FILES.sl, "if(isAnswer(j)||(j&&isAnswer(j.answer)))map={};", ""],
    ["the line trimmed to a word", FILES.sl, "p.textContent=line;p.title=line;", "p.textContent=line.split(' ').slice(0,2).join(' ');p.title=line;"],
    ["the line wrapped", FILES.sl, "white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%", "white-space:normal"],
    ["the line in the wrong type", FILES.sl, ".sale-line{margin:0 0 2px;font:400 13px/1.35 var(--sans)", ".sale-line{margin:0 0 2px;font:700 19px/1.35 var(--serif)"],
    ["the other cards left out", FILES.sl, ".thin-tile[data-gas-listing-id],.salescard[data-gas-listing-id]", ".thin-tile[data-gas-listing-id]"],
    ["the set aside tiles left out", FILES.sl, ".thin-tile[data-gas-listing-id],.salescard", ".thin-tile:not(.thin-tile-aside)[data-gas-listing-id],.salescard"],
    ["the module added for a visitor", FILES.sl, "(!SALE_LABEL_PUBLIC && isCrewRequest(req) !== true)", "false"],
    ["the switch on", FILES.sl, "export const SALE_LABEL_PUBLIC = false;", "export const SALE_LABEL_PUBLIC = true;"],
    ["the module not wired into the page", FILES.bar, "return saleLabelFinish(modelChoiceFinish(", "return (modelChoiceFinish("],
    ["the module on every tool", FILES.sl, 'if (tool !== "mc" || (!SALE_LABEL_PUBLIC', 'if ((!SALE_LABEL_PUBLIC'],
    ["a line wider than the card", FILES.sl, ".sale-line{margin:0 0 2px;", ".sale-line{min-width:900px;margin:0 0 2px;"],
  ];
  let bad = 0;
  for (const [name, file, from, to] of MUT) {
    const f = path.join(ROOT, file), src = fs.readFileSync(f, "utf8");
    if (src.split(from).length !== 2) { console.log("MISSED  " + name + " (the target text is not in " + file + " exactly once)"); bad++; continue; }
    fs.writeFileSync(f, src.replace(from, () => to));
    let caught = false; try { execFileSync(process.execPath, [fileURLToPath(import.meta.url)], { cwd: ROOT, stdio: "pipe", timeout: 600000, env: { ...process.env } }); } catch { caught = true; } finally { fs.writeFileSync(f, src); }
    console.log((caught ? "caught   " : "MISSED   ") + name); if (!caught) bad++;
  }
  console.log(bad ? "saleLabelCheck mutants: " + bad + " not caught" : "saleLabelCheck mutants: all " + MUT.length + " caught"); process.exit(bad ? 1 : 0);
}
process.env.NEW_DESIGN = "1"; process.env.CURTAIN_CREW_CODE = process.env.CURTAIN_CREW_CODE || "fixture-crew-code"; process.env.LAUNCH_STAGE = "2";
const H = await import(pathToFileURL(path.join(ROOT, "scripts/mcSellHarness.mjs")).href), { open, launch, loadFixtures } = H;
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
let pass = 0, fail = 0; const out = []; const ok = (c, m) => { if (c) pass++; else { fail++; out.push("FAIL " + m); } };
let SL = null, CB = null, MCH = null, mint = null;
try { SL = await imp("lib/saleLabelPage.js"); } catch (e) { ok(false, "lib/saleLabelPage.js loads :: " + String(e.message).slice(0, 100)); }
CB = await imp("lib/carBar.js"); MCH = (await imp("api/marketCheck.js")).default; mint = (await imp("lib/_crew.js")).mintCrewCookieValue;
const base = loadFixtures("mc-1995-porsche-911"), KEY = Object.keys(base).find(k => /^POST \/api\/sellerDecision/.test(k));
// THE ENGINE'S ANSWER, read live from the handler in a child process (it borrows the environment and the fetch)
let ENGINE = null; try { ENGINE = JSON.parse(execFileSync(process.execPath, [path.join(ROOT, "scripts/saleLabelEngineAnswer.mjs")], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 26, timeout: 300000 })); } catch (e) { ok(false, "the engine answers for 1987 Pontiac Firebird through the live handler :: " + String(e.message).slice(0, 120)); }
if (!ENGINE) { console.log(out.join("\n")); console.log("saleLabelCheck: " + pass + " pass, " + (fail + 1) + " FAIL (no engine answer)"); process.exit(1); }
const N = ENGINE.cards.length;
ok(!!ENGINE && ENGINE.tier === "result" && N >= 9 && ENGINE.cards.every(c => typeof c.variantLabel === "string" && c.variantLabel.trim()), "the engine's real answer for 1987 Pontiac Firebird: every card carries variantLabel :: " + JSON.stringify(ENGINE && ENGINE.cards.map(c => c.variantLabel)));
ok(!!ENGINE && new Set(ENGINE.cards.map(c => c.variantLabel)).size >= 4, "the engine's Firebird cards are of mixed variants :: " + JSON.stringify(ENGINE && [...new Set(ENGINE.cards.map(c => c.variantLabel))]));
const URL0 = "/market-check?q=1995%20Porsche%20911";
// the engine's cards, as it served them (nine); more than nine are the same cards again under new ids (the cards of "Sales behind this answer" show over sixteen); over[i] replaces the label of card i (a null, a blank, a long one: the page's own handling)
const TRAP = ENGINE ? ENGINE.cards.findIndex(c => c.variantLabel === "Base") : 0;   // this card's listing title is made to say Trans Am GTA while the engine says Base
const shaped = (n, over = {}, mut) => { const j = JSON.parse(JSON.stringify(ENGINE)); const src = j.cards; j.cards = Array.from({ length: n }, (_, i) => { const x = { ...src[i % src.length] }; if (i >= src.length) x.id = x.id + "-" + i; if (i in over) { if (over[i] === undefined) delete x.variantLabel; else x.variantLabel = over[i]; } if (i === TRAP) x.title = "1987 Pontiac Firebird Trans Am GTA"; return x; });
  if (mut) mut(j); const f = { ...base }; f[KEY] = { ...base[KEY], body: JSON.stringify(j) }; return [f, j]; };
const READ = () => { const tiles = [...document.querySelectorAll(".thin-tile, .salescard")]; return { n: tiles.length, overflow: document.documentElement.scrollWidth - innerWidth, vw: innerWidth,
  tiles: tiles.map(t => { const l = t.querySelector(".sale-line"), body = t.querySelector(".thin-tile-body,.salescard-body"), pr = t.querySelector(".thin-tile-price,.salescard-price"), mt = t.querySelector(".thin-tile-meta,.salescard-meta"), lr = l && l.getBoundingClientRect(), tr = t.getBoundingClientRect(), cs = l && getComputedStyle(l), ms = mt && getComputedStyle(mt);
    return { id: t.getAttribute("data-gas-listing-id"), aside: t.classList.contains("thin-tile-aside"), line: l ? l.textContent : null, above: !!(l && pr && l.compareDocumentPosition(pr) & 4), oneRow: !!l && lr.height <= parseFloat(cs.lineHeight) * 1.5, clipped: !!l && l.scrollWidth > l.clientWidth + 1, first: !!l && !!body && body.firstElementChild === l, wd: l ? [Math.round(lr.width), Math.round(tr.width), l.scrollWidth, l.clientWidth] : null, inside: !!l && lr.right <= tr.right + 1 && lr.left >= tr.left - 1,
      font: cs ? cs.fontSize + " " + cs.fontFamily.split(",")[0] : null, metaFont: ms ? ms.fontSize + " " + ms.fontFamily.split(",")[0] : null, text: t.textContent.replace(/\s+/g, " ").trim().slice(0, 140) }; }) }; };
const b = await launch();
const view = async (fx, w = 1440) => { const p = await open(b, URL0, { width: w, fixtures: fx, settle: 3500 }); const r = await p.evaluate(READ); return [p, r]; };
async function call(handler, url, crew) { const res = { h: {}, code: 200, body: "", setHeader(k, v) { this.h[k.toLowerCase()] = v; return this; }, getHeader(k) { return this.h[k.toLowerCase()]; }, removeHeader() {}, writeHead(c) { this.code = c; return this; }, status(c) { this.code = c; return this; }, json(o) { this.body = JSON.stringify(o); return this; }, send(x) { this.body = String(x); return this; }, end(x) { if (x != null) this.body += String(x); return this; } };
  const u = new URL(url, "https://goasksam.com"), log = console.log, err = console.error; console.log = () => {}; console.error = () => {};
  try { await handler({ method: "GET", url, query: Object.fromEntries(u.searchParams), headers: { cookie: crew ? "gas_crew=" + mint() : "", host: "goasksam.com" }, socket: {}, body: null }, res); } finally { console.log = log; console.error = err; } return res; }
// 0 the page as served
{ const res = await call(MCH, URL0, true); ok(res.code === 200 && res.h["x-design"] === "new" && /id="sl-mod"/.test(res.body) && /id="sl-css"/.test(res.body), "the live handler with the new design on serves Market Check with the sale label module to the crew :: " + res.code + " " + (res.h["x-design"] || "none")); }
// 1 and 2 the engine's own cards: every card prints its variantLabel as sent
{ const [fx, j] = shaped(N), [p, r] = await view(fx);
  ok(r.n === N, "the engine's " + N + " sale cards are drawn :: " + r.n);
  const byId = Object.fromEntries(j.cards.map(c => [String(c.id), c.variantLabel]));
  ok(r.tiles.every(t => t.line === byId[t.id]), "every card prints the engine's variantLabel exactly as sent :: " + JSON.stringify(r.tiles.map(t => t.line)));
  ok(r.tiles.every(t => t.above && t.first), "the line is the first thing in the card's body, above the price, on every card");
  ok(new Set(r.tiles.map(t => t.line)).size >= 4, "mixed variants read apart (GTA, Trans Am, Formula, Base) :: " + [...new Set(r.tiles.map(t => t.line))].join(" | "));
  ok(r.tiles.filter(t => t.line === "Base").length === ENGINE.cards.filter(c => c.variantLabel === "Base").length, "a car that names no variant reads as the engine's Base, as sent");
  const trap = r.tiles.find(t => t.id === String(j.cards[TRAP].id)); ok(trap && trap.line === "Base", "the engine's word beats the listing title (the title said Trans Am GTA, the engine says Base) :: " + (trap && trap.line));
  ok(!p._err.length, "no page error :: " + p._err.join("|")); await p.close(); }
// a set aside tile that carries a variantLabel prints it (the engine's set aside rows carry none in this answer: replicas are counted in variantSplit.asideLine)
{ const [fx] = shaped(N, {}, j => { const a = { ...j.cards[0], id: "aside-1", variantLabel: "Trans Am", reason: "a replica" }; j.setAsideRows = [a]; j.asideCards = [a]; }); const [p, r] = await view(fx);
  const a = r.tiles.find(t => t.aside); ok(a && a.line === "Trans Am", "a set aside tile prints its own variantLabel :: " + JSON.stringify(a && [a.aside, a.line])); await p.close(); }
// 3 nothing to print: absent, null, empty, blank, a number
{ const [fx, j] = shaped(N, { 0: undefined, 1: null, 2: "", 3: "   ", 4: 7 }), [p, r] = await view(fx);
  const none = [0, 1, 2, 3, 4].map(i => r.tiles.find(t => t.id === String(j.cards[i].id)));
  ok(none.every(t => t && t.line === null), "a card with no variantLabel, a null, an empty one, a blank one or a number has no line :: " + JSON.stringify(none.map(t => t && t.line)));
  ok(r.tiles.filter(t => t.line !== null).length === N - 5 && r.tiles.filter(t => t.line !== null).every(t => t.line === j.cards.find(c => String(c.id) === t.id).variantLabel), "the cards that have a label still print it");
  ok(none.every(t => t && /\$/.test(t.text)), "a card with no line is otherwise the same (its price is there)"); await p.close(); }
// 4 the other cards of the page: a pool over sixteen draws the three cards of "Sales behind this answer"
{ const [fx] = shaped(41), [p, r] = await view(fx);
  ok(r.tiles.length >= 3 && r.tiles.every(t => t.line && t.above), "the cards of \"Sales behind this answer\" print the line above the price :: " + JSON.stringify(r.tiles.map(t => t.line))); await p.close(); }
// 4b the cards of "Sales behind this answer" with no label print no line (the card's own title is never used)
{ const [fx] = shaped(41, Object.fromEntries(Array.from({ length: 41 }, (_, i) => [i, null]))), [p, r] = await view(fx); ok(r.tiles.length >= 3 && r.tiles.every(t => t.line === null), "the cards of \"Sales behind this answer\" with no variantLabel have no line (the title is not used) :: " + JSON.stringify(r.tiles.map(t => t.line))); await p.close(); }
// 4c a line longer than the card stays on one row, cut by an ellipsis, the whole line in its title
{ const LONG = "20th Anniversary Turbo Trans Am Special Edition Package"; const [fx, j] = shaped(N, { 0: LONG }), [p, r] = await view(fx, 390);
  const t = r.tiles.find(x => x.id === String(j.cards[0].id)), full = await p.evaluate(() => document.querySelector(".sale-line").title);
  ok(t && t.line === LONG && t.oneRow && t.clipped && t.inside && full === LONG, "a line longer than the card stays on one row inside the card, cut by an ellipsis, with the whole line in its title :: " + JSON.stringify(t && [t.oneRow, t.clipped, t.inside, full])); await p.close(); }
// 5 a later answer with no variantLabel takes the lines away
{ const NEXT = '{"probe":2}', [fx, j] = shaped(N), j1 = JSON.parse(JSON.stringify(j)); j1.cards.forEach(c => { delete c.variantLabel; });
  fx["POST /api/sellerDecision " + NEXT] = { status: 200, contentType: "application/json", body: JSON.stringify(j1) };
  const p = await open(b, URL0, { width: 1440, fixtures: fx, settle: 3000 }), r0 = await p.evaluate(READ);
  await p.evaluate(b2 => fetch("/api/sellerDecision", { method: "POST", headers: { "content-type": "application/json" }, body: b2 }).then(r => r.json()).then(() => new Promise(r => setTimeout(r, 800))), NEXT);
  const n0 = r0.tiles.filter(t => t.line).length, n1 = await p.evaluate(() => document.querySelectorAll(".sale-line").length);
  ok(n0 === N && n1 === 0, "a later answer with no variantLabel takes the lines away :: " + n0 + " then " + n1); await p.close(); }
// 6 one line, the card's own type; phone and desktop
for (const w of [390, 1440]) { const [fx] = shaped(N), [p, r] = await view(fx, w);
  ok(r.overflow <= 0, "at " + w + " px no sideways scroll :: " + r.overflow);
  ok(r.tiles.length === N && r.tiles.every(t => t.oneRow && !t.clipped && t.inside), "at " + w + " px every line is on one row, whole and inside its card :: " + JSON.stringify(r.tiles.filter(t => !(t.oneRow && !t.clipped && t.inside)).map(t => [t.line, t.oneRow, t.clipped, t.inside, t.wd])));
  ok(r.tiles.every(t => t.font === t.metaFont), "at " + w + " px the line has the card's own meta type :: " + JSON.stringify([r.tiles[0].font, r.tiles[0].metaFont]));
  if (process.argv.includes("--shots")) { await p.evaluate(() => { const c = document.querySelector(".thin-tile"); if (c) { c.scrollIntoView({ block: "start" }); window.scrollBy(0, -140); } }); await new Promise(r => setTimeout(r, 400)); await p.screenshot({ path: path.join(ROOT, "docs/demo-run/sale-card-label-" + (w === 390 ? "phone-390" : "desktop-1440") + ".png") }); }
  await p.close(); }
// 7 the source computes nothing
if (SL) { const src = SL.SALE_LABEL_JS; ok(!/\.sort\(|\.reduce\(|Math\.|parseInt|parseFloat|Number\(|\.match\(|\.replace\(|\.split\(|\.title\b/.test(src.replace(/p\.title=line/, "")), "the module has no sort, sum, regex, split or title read (it prints variantLabel and nothing else)");
  ok(!/\.year|\.make|\.model|Replica|Trans/.test(src), "the module names no year, make, model or variant word"); }
// 8 the sweep: every file that draws a sale card or a sale row is named
{ const MARKS = ['class="thin-tile"', "class=\"thin-tile", 'class="salescard"', "class=\"salescard", 'class="sfc-row"', "class=\\\"sfc-row", "saleRowHtml", "View the sale", "partner-sale-row", "placedSales"];
  const REG = {
    "public/js/onebox.js": "LABELLED on Market Check by lib/saleLabelPage.js (thin tiles, Sales behind this answer cards); the same file draws /onebox, left as it is",
    "lib/sellsForCard.js": "swept, NOT changed here: the shared card's sale rows (Find See the sales, Sell sales list, Buy); its own branch",
    "lib/live/watches.js": "swept, NOT changed here: the watch email's sale card (View the sale); emails are their own branch",
    "lib/onebox.js": "swept, NOT changed here: the engine (the field Lane B serves) and the email cards it builds",
    "lib/saleLabelPage.js": "the module itself",
    "api/partnerAnswer.js": "swept, NOT changed here: the partner answer's sale rows",
    "api/partnerDemo.js": "swept, NOT changed here: the partner demo's sale rows",
    "api/_amazonDemo.js": "swept, NOT changed here: the marketplace demo's sale rows",
    "lib/placedSale.js": "swept, NOT changed here: the partner answer's placed sales",
  };
  const hits = []; const walk = d => { for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) { if (e.name === "node_modules" || e.name.startsWith(".") || /^(fixtures|demo-run|proofs)$/.test(e.name)) continue; const rel = d + "/" + e.name; if (e.isDirectory()) walk(rel); else if (/\.(js|mjs|html)$/.test(e.name)) { const s = fs.readFileSync(path.join(ROOT, rel), "utf8"); if (MARKS.some(m => s.includes(m))) hits.push(rel); } } };
  for (const d of ["lib", "api", "public"]) walk(d);
  const missing = hits.filter(h => !REG[h] && !/^(scripts|docs)\//.test(h)); ok(missing.length === 0, "every file that draws a sale card or row is named in the sweep (a new one fails until it is named) :: " + JSON.stringify(missing));
  ok(Object.keys(REG).every(k => fs.existsSync(path.join(ROOT, k))), "every file the sweep names exists"); }
// 9 a visitor
if (SL) { const vis = await call(MCH, URL0, false), crewRes = await call(MCH, URL0, true), req0 = { headers: { host: "goasksam.com" }, url: URL0 };
  ok(vis.code === 200 && !/sl-mod|sl-css|variantLabel/.test(vis.body) && /id="gas-carbar"/.test(vis.body), "a visitor's Market Check page has the car bar and no sale label module");
  ok(SL.saleLabelFinish(vis.body, req0, "mc") === vis.body && !/sl-mod/.test(CB.carBarFinish(vis.body, req0, "mc")), "for a visitor the label finish returns the page byte for byte and the bar's finish adds no label");
  ok(SL.SALE_LABEL_PUBLIC === false, "the switch is off");
  ok(["buy", "find", "sell", "tasks"].every(t => SL.saleLabelFinish("<body>x</body>", { headers: { cookie: "gas_crew=" + mint(), host: "goasksam.com" }, url: "/" }, t) === "<body>x</body>"), "the module is on Market Check only (not Buy, Find, Sell, Tasks), crew or not");
  ok(crewRes.body.length > vis.body.length, "the crew's page carries the module on top of the visitor's"); }
await b.close();
console.log(out.join("\n")); console.log("saleLabelCheck: " + pass + " pass, " + fail + " FAIL"); process.exit(fail ? 1 : 0);
