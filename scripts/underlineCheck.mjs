// THE NUMBER RULE, RENDERED (Sam, Oct 28 2026, e98). Every card, every state: exactly one visual weight for a number. Nothing that is a number is ever underlined, ever a link, ever small, and under the figures a card
// carries at most two small lines. This renders the same pages e98Shots.mjs photographs (Market Check: 2004 M3 split, 2001 M3 alike with options, 1985 Defender 110 year split, 1994 911 Carrera Cabriolet with 27,000
// typed; Find: 2003 Alpina Roadster V8, 2014 Boxster, the black BMW page) in Chrome at 1440 and 390 wide and reads the COMPUTED styles, so a new class or a new state is caught by what it looks like, not by its name.
//   FAIL: a currency figure inside an anchor, or under an underline (the element's or any ancestor's text-decoration), inside an answer card (.sfc-card, the Find Sam box .sl);
//         a range ("$a to $b") set below 20px (the two small lines Sam allows, the other option's line and the near-miles line, are lines, not figures); more than two small lines under the figures; the stale line ("Sales read on ... Updating now.") or "Latest sale:" anywhere in a card; a footer over one sentence-line of facts.
//   node scripts/underlineCheck.mjs        E98_ROOT=<another checkout> to read that tree's pages (how it was shown failing on main)
import { MC, FIND, FIND_MATCHED, CORVETTE, BLACK_BMW, M3_ROW, PORSCHE_2005, NO_META, MC_WITHHELD_SENTINEL, HISTORY, HISTORY_EXPECT, MC_BAD_COUNTS } from "./e98Fixtures.mjs";
import { startBrowser, openMC, ROOT } from "./e98Render.mjs";
import { buildCards, openFind } from "./e98FindRender.mjs";
import { inPage, judge as judgeIn, printedProblems } from "./e98DomCheck.mjs";
import { readEmails, judgeEmails } from "./e98EmailDom.mjs";
import { pathToFileURL } from "node:url";
import path from "node:path";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
// the stale line is an engine field (api/sellerDecision.js) the pages must never print: no page-side file may read it into markup
{ const fs = await import("node:fs"), path = await import("node:path"); const bad = [];
  const walk = d => { for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) { const p = d + "/" + e.name; if (e.isDirectory()) walk(p); else if (/\.(js|mjs)$/.test(e.name) && !/^api\/sellerDecision\.js$|^lib\/engineFields\.js$|^lib\/live\/search\.js$|^lib\/reasonWords\.js$/.test(p)) { const code = fs.readFileSync(path.join(ROOT, p), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, ""); if (/\.staleLine\b|Sales since then are not in yet/.test(code)) bad.push(p); } } };
  for (const d of ["api", "lib", "public/js"]) walk(d);
  ok(!bad.length, "no page or email reads the engine's staleLine into markup (api/sellerDecision.js and lib/engineFields.js set it; lib/live/search.js, Lane B's ER7 Find data layer, and lib/reasonWords.js, the wording table, carry it as a field and print nothing)" + (bad.length ? " (" + bad.join(", ") + ")" : "")); }
// the words "See the bid on" (the heading link above a car's name) print nowhere: not in Find's client, not in a lib or page file
{ const fs = await import("node:fs"), path = await import("node:path"); const hits = [];
  const walk = d => { for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) { const p = d + "/" + e.name; if (e.isDirectory()) walk(p); else if (/\.(js|mjs|html)$/.test(e.name) && /See the bid on/.test(fs.readFileSync(path.join(ROOT, p), "utf8"))) hits.push(p); } };
  for (const d of ["api", "lib", "public"]) walk(d);
  ok(!hits.length, "nothing prints 'See the bid on'" + (hits.length ? " (" + hits.join(", ") + ")" : "")); }
const b = await startBrowser();
console.log("underlineCheck reading " + ROOT);
const WANT = { "2001 BMW M3 (alike with options)": "candles", "Chart: option-scoped candles (2004 BMW M3, Manual)": "scoped", "Chart: SEEDED dots (the engine sends type dots): the page draws none": "none", "1985 Land Rover Defender 110 (year split)": "withheld" };
for (const [n, fx] of Object.entries(MC)) for (const w of [1440, 390]) { const p = await openMC(b, fx, w), r = await p.evaluate(inPage); judgeIn(ok, `Market Check ${n} at ${w}`, r, fx.needs || fx.typed.split(" ").slice(1, 3));
  { const bk = fx.d.chart && fx.d.chart.type === "candles" && fx.d.chart.buckets ? fx.d.chart.buckets : fx.d.trend && fx.d.trend.movement ? fx.d.trend.movement.buckets : null;
    if (bk && bk.every(b => /^\d{4}-Q[1-4]$/.test(b.period))) { const ord = b => +b.period.slice(0, 4) * 4 + (+b.period.slice(-1) - 1), o = bk.map(ord), expect = o[o.length - 1] - o[0] + 1 - o.length; ok(r.gaps === expect, `Market Check ${n} at ${w}: every quarter the engine left out shows as a gap in the chart (${r.gaps} of ${expect})`); } }
  ok(r.strip && r.strip.miles && r.strip.pills >= 0, `Market Check ${n} at ${w}: the narrow strip holds the mileage box`);
  const kind = WANT[n]; if (kind === "none") ok(r.panels.length === 0 && r.panels.every(q => q.circles === 0), `${n} at ${w}: the engine's dots become no chart and no point (${r.panels.length} panels)`); else if (kind) { const q = r.panels[0] || {}; ok(kind === "withheld" ? r.panels.length === 0 : q.kind === kind, `Market Check ${n} at ${w}: the chart panel is the ${kind} state (${q.kind || "no panel"})`);
    if (kind === "scoped") ok(q.scope === fx.d.chart.scope.line, `${n} at ${w}: the scope line is the engine's own words ("${q.scope}")`);

    if (kind === "withheld") ok(r.panels.length === 0 && r.noband.includes(fx.d.chart.note), `${n} at ${w}: no chart panel and no heading; the engine's withheld sentence is the one caption of the withheld layout (${r.noband[0] || "none"})`); }
  await p.close(); }
// NEVER A DOT (Sam's ruling, Oct 28 2026): no page code draws a per-sale point in a chart: no dots builder, no hc-dot class, no <circle> markup in the page scripts or the shared kit.
{ const fs = await import("node:fs"), path = await import("node:path"), hits = [], rd = rel => { try { return fs.readFileSync(path.join(ROOT, rel), "utf8"); } catch { return ""; } };
  const ob = rd("public/js/onebox.js"), c0 = ob.indexOf("function candleChartHtml"), c1 = ob.indexOf("function heroChartHtml"), chartSrc = c0 > 0 && c1 > c0 ? ob.slice(c0, c1) : ob;   // the chart builders only: an icon elsewhere may use a circle
  if (/<circle|createElementNS\([^)]*circle|dotsChartHtml|hc-dot\b/.test(chartSrc)) hits.push("public/js/onebox.js (chart builders)");
  for (const rel of ["lib/sellsForCard.js", "public/onebox.html", "lib/sell/sellMcClient.js"]) if (/dotsChartHtml|hc-dot\b/.test(rd(rel))) hits.push(rel);
  ok(!hits.length, "no page code draws a per-sale point (dots, circles) in a chart" + (hits.length ? " (" + hits.join(", ") + ")" : "")); }
// THE HELD SENTENCE IS THE ENGINE'S (pageReasonCopyCheck, ER9): the withheld panel prints answer.chart.note, else answer.chart.withheld.line, and never a copy of either sentence; no page or email file holds the table's chart sentences as literals.
for (const [mode, want, not] of [["note", "SENTINEL chart note from the engine.", "SENTINEL withheld line"], ["line", "SENTINEL withheld line from the engine.", "SENTINEL chart note"]]) { for (const w of [1440, 390]) { const p = await openMC(b, MC_WITHHELD_SENTINEL(mode), w), tx = await p.evaluate(() => [...document.querySelectorAll(".hero-held .hw-cap")].map(e => e.innerText).join(" ").replace(/\s+/g, " ")); ok(tx.includes(want) && !tx.includes(not) && !/mix of cars changed|too few sales in each period/.test(tx), `withheld, no panel (${mode}) at ${w}: the engine's own sentence is the caption of the withheld layout and no other (${tx.slice(0, 120)})`); await p.close(); } }
{ const fs = await import("node:fs"), path = await import("node:path"), hits = [], WORDS = ["The mix of cars changed from quarter to quarter", "There are too few sales in each period to draw a chart", "Only 2 dated sales, too few to chart"];
  const walk = d => { for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) { const p = d + "/" + e.name; if (e.isDirectory()) walk(p); else if (/\.(js|html)$/.test(e.name) && !/^lib\/(reasonWords|onebox)\.js$/.test(p)) { let src = fs.readFileSync(path.join(ROOT, p), "utf8"); src = src.split("\n").filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n"); if (WORDS.some(wd => src.includes(wd))) hits.push(p); } } };
  for (const d of ["api", "lib", "public"]) walk(d);
  ok(!hits.length, "no page or email file carries the engine's chart sentences as literals" + (hits.length ? " (" + hits.join(", ") + ")" : "")); }
// ONE chart panel builder: no page draws a panel of its own (every state identical everywhere the kit draws it)
{ const fs = await import("node:fs"), path = await import("node:path"), src = fs.readFileSync(path.join(ROOT, "public/js/onebox.js"), "utf8"), a = src.indexOf("function chartPanelHtml"), z = src.indexOf("function heroChartHtml");
  const rest = a > 0 && z > a ? src.slice(0, a) + src.slice(z) : src; ok(a > 0 && !/class="hero-chart/.test(rest), "the chart panel is drawn by ONE function (chartPanelHtml); no other code builds a hero-chart"); }
const sets = { "Find card 2003 BMW Alpina Roadster V8": [FIND["2003 BMW Alpina Roadster V8"]], "Find card 2014 Porsche Boxster": [FIND["2014 Porsche Boxster"]], "Find page, black BMW": Object.values(BLACK_BMW), "Find card Boxster S PDK (matched option)": [FIND_MATCHED], "Find single live match, 1965 Chevrolet Corvette": [CORVETTE], "Find row, three BMW M3s": Object.values(M3_ROW), "Find page, 2005 Porsche 911 with a no-answer card": Object.values(PORSCHE_2005), "Find row, two M3s and one with no miles and no place": [...Object.values(M3_ROW).slice(0, 2), NO_META] };
const seen = new Set();
for (const [n, defs] of Object.entries(sets)) { const cards = await buildCards(defs); for (const w of [1440, 390]) { const p = await openFind(b, cards, w), r = await p.evaluate(inPage); judgeIn(ok, `${n} at ${w}`, r); r.classes.forEach(k => seen.add(k));
  if (defs[0] === CORVETTE) { ok(r.drawn === 1, `${n} at ${w}: exactly one live match is drawn (${r.drawn})`); ok(r.sale.length === 0, `${n} at ${w}: the card carries no sale line (${r.sale.length}); the sales are in See the sales`);
    ok(r.specs.join("|") === CORVETTE.extra.chips.join("|"), `${n} at ${w}: the chips row is the card's own chips, untouched (${r.specs.join(", ")})`);
    const tx = (await p.evaluate(() => document.querySelector("article.car .sl").innerText)).replace(/\s+/g, " "); ok(tx.includes(CORVETTE.findAnswer.lines[0]) && !tx.includes(CORVETTE.findAnswer.lines[1]) && !/Thin so far|Only \d+ sales/.test(tx), `${n} at ${w}: the answer is the engine's first line, and the pointer ("${CORVETTE.findAnswer.lines[1]}") is not printed beside the See the sales button`);
    ok(/LAST BID SEEN/.test(await p.evaluate(() => document.querySelector("article.car").innerText)), `${n} at ${w}: the Last bid seen overlay is on the photo`); }
  await p.close(); } }
// THE CLASS: a Find card state nobody renders is a state nobody checks (the single live match was not in the seven proof pages). Across every Find render above, each piece a card can carry appears at least once.
{ const need = ["fx-spec", "fx-ans", "fx-range", "fx-answer", "fx-count", "mlab", "vauc", "specs"], missing = need.filter(k => !seen.has(k)); ok(!missing.length, "every Find card piece is rendered by at least one proof page" + (missing.length ? " (never rendered: " + missing.join(", ") + ")" : "")); }
// the Task emails: the real live preview (scripts/fixtures/taskEmailPreview.html, read Oct 28 18:57Z) holds each email in an iframe; each is read on its own. A check that read only the wrapper page finds 0 figures and fails.
{ const fs = await import("node:fs"), html = fs.readFileSync("scripts/fixtures/taskEmailPreview.html", "utf8"); judgeEmails(ok, "Task emails (live preview fixture)", await readEmails(b, html, null));
  const wrap = await b.newPage(); await wrap.setContent(html); const wrapperFigures = ((await wrap.evaluate(() => document.body.innerText)).match(/\$[\d,]+/g) || []).length; await wrap.close(); ok(wrapperFigures === 0, "the wrapper page alone carries no figures (reading it instead of the iframes is what the first live run did), " + wrapperFigures); }
// "Powered by GoAskSam" lives only on the surfaces that sit away from our own pages: the partner demo card and the Amazon demo (both read the one kit option poweredBy); never on a goasksam.com page's card.
{ const { sellsForCardHtml } = await import(pathToFileURL(path.join(ROOT, "lib/sellsForCard.js")).href), { PARTNER_CARD_OPTS } = await import(pathToFileURL(path.join(ROOT, "api/partnerAnswer.js")).href), { AMAZON_PROFILE } = await import(pathToFileURL(path.join(ROOT, "api/_amazonDemo.js")).href);
  const d = MC["2001 BMW M3 (alike with options)"].d, own = sellsForCardHtml(d, { updated: "Oct 28, 2026" }), partner = sellsForCardHtml(d, { ...PARTNER_CARD_OPTS, updated: "Oct 28, 2026" });
  ok(!/Powered by/.test(own), "our own pages' card footer has no Powered by"); ok(/Powered by GoAskSam\./.test(partner), "the partner demo card keeps Powered by GoAskSam (the poweredBy kit option)"); ok(AMAZON_PROFILE.attribution === "Powered by GoAskSam", "the Amazon demo keeps Powered by GoAskSam"); }
// THE CAR'S OWN HISTORY (Sam's rule): a Find card for a car listed or sold before shows it (the chip at the end of the chip row, "Sold before" or "Listed before", opening the history popup with the car's own sale or bid); a car with none shows no chip.
// The comparable-sale lines left the card (ENGINE READY 10); the car's own record did not. Same cards on the Tasks page (the kit) and in the Task email (emailCardData.hist).
{ const cards = await buildCards(Object.values(HISTORY)), names = Object.keys(HISTORY);
  for (const w of [1440, 390]) { const p = await openFind(b, cards, w);
    const rows = await p.evaluate(() => [...document.querySelectorAll("article.car")].map(c => ({ title: c.querySelector(".ttl") ? c.querySelector(".ttl").innerText : "", chip: (c.querySelector(".specs .hchip") || {}).innerText || "", last: !!c.querySelector(".specs .hchip") && c.querySelector(".specs").lastElementChild === c.querySelector(".specs .hchip"), hidden: !!c.querySelector(".specs .hchip") && c.querySelector(".specs .hchip").hidden, under: !!c.querySelector(".specs .hchip") && /underline/.test(getComputedStyle(c.querySelector(".specs .hchip")).textDecorationLine) })));
    names.forEach((nm, i) => { const want = HISTORY_EXPECT[nm], got = rows[i] || {}; if (want) ok(got.chip === want.chip && got.last && !got.hidden, `Find ${nm} at ${w}: the card shows its own history, the chip "${want.chip}", last in the chip row (${got.chip || "no chip"})`); else ok(!got.chip, `Find ${nm} at ${w}: no chip where the car has no history`); });
    await p.close(); }
  // the popup, once per card
  for (const [i, nm] of names.entries()) { const want = HISTORY_EXPECT[nm]; if (!want) continue; const p = await openFind(b, cards, 1440); await p.evaluate(k => { const h = document.querySelectorAll("article.car")[k].querySelector(".hchip"); if (h) h.click(); }, i); await new Promise(r => setTimeout(r, 600));
    const pop = await p.evaluate(() => { const e = document.querySelector(".hpop"); return e ? e.innerText.replace(/\s+/g, " ") : ""; }); ok(pop.includes(want.pop), `Find ${nm}: the chip opens the history popup with the car's own price ${want.pop} (${pop.slice(0, 90)})`); await p.close(); }
  // the Task email and the Tasks page share the card code: the history tag survives there too
  const { emailCardData } = await import(pathToFileURL(path.join(ROOT, "lib/tasks/emailCards.js")).href);
  names.forEach((nm, i) => { const want = HISTORY_EXPECT[nm], d = emailCardData(cards[i]); ok(want ? d.hist === want.chip : !d.hist, `Task email card ${nm}: the history tag ${want ? "is " + want.chip : "is absent"} (${d.hist || "none"})`); }); }
// THE ONE RULE (lib/optionProblems.js): a page that prints option counts which do not add up to the footer and shows no window fails the rule; the same pool printed with each option's since date passes.
for (const w of [1440, 390]) { const p = await openMC(b, MC_BAD_COUNTS, w), pr = printedProblems(await p.evaluate(inPage)); ok(pr.length > 0 && /add to 38, footer 35/.test(pr.join(" ")), `1986 Porsche 911 without windows at ${w}: optionProblems refuses 38 against 35 with no remainder and no since date (${pr[0] || "NOT REFUSED"})`); await p.close(); }
// THE OPTION-COUNT EXPLANATION IS GONE (Sam, Oct 28 2026): the engine sends no optionsNote and no windowNote; no page or email prints one, and no page file carries the sentence ("Each option's count is read over its own window...") or reads the field to print it.
{ const fs = await import("node:fs"), path = await import("node:path"), hits = [], ALLOWED = /^lib\/(reasonWords|onebox|engineFields|optionProblems|live\/search)\.js$/, WORDS = /read over its own window|use their own time spans|add up to more than the (?:headline count|total)/;
  const walk = d => { for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) { const p = d + "/" + e.name; if (e.isDirectory()) walk(p); else if (/\.(js|html)$/.test(e.name) && !ALLOWED.test(p)) { const src = fs.readFileSync(path.join(ROOT, p), "utf8").split("\n").filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n"); if (WORDS.test(src) || /\.optionsNote\b|d\.windowNote\b/.test(src)) hits.push(p); } } };
  for (const d of ["api", "lib", "public/js"]) walk(d);
  ok(!hits.length, "no page or email prints the option-count explanation (optionsNote, windowNote, its sentence)" + (hits.length ? " (" + hits.join(", ") + ")" : ""));
  const { sellsForCardHtml } = await import(pathToFileURL(path.join(ROOT, "lib/sellsForCard.js")).href), d0 = { ...MC["2004 BMW M3 (split)"].d, optionsNote: "SEEDED option note", windowLonger: true, windowNote: "SEEDED window note" };
  const h0 = sellsForCardHtml(d0, { interactive: true }); ok(!/SEEDED/.test(h0), "the card prints neither a seeded optionsNote nor a seeded windowNote"); }
// the control: with NO cards the header must say so (the line is not simply deleted)
{ const p = await openFind(b, [], 1440); const r = await p.evaluate(inPage); ok(r.drawn === 0 && r.hasNothingLine, "Find with no cards: the header says there is nothing live (" + r.drawn + " cards)"); await p.close(); }
await b.close();
console.log(`underlineCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
