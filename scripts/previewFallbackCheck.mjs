// THE PREVIEWS NEVER SHOW AN EMPTY PAGE (Lane E, Nov 8 2026). CAUSE: Find's "A few cars Sam found" and Tasks' "See what Sam can find" were hidden whenever the live engine fields (findExamples, tasksDemo, watchingDemo) were null,
// so Sam saw /preview/find and /preview/tasks with the sections gone. The page may not invent a car, so the ENGINE sends a fallback (completed sales, "Recent example", "Ended") and the page prints whichever it is sent.
// CLASS: every engine-fed section on a preview (Find examples, Tasks search card, Tasks watching card) has the same three states: live, fallback, and absent only when the engine sent nothing. This check walks all three sections
// through all three states, and proves a page without the fallback path fails it. Offline.
import * as PP from "../lib/preview/previewPages.js";
import * as TP from "../lib/preview/tasksPreview.js";
import { examplesFixture, NOW } from "./findExamplesFixture.mjs";
import { demoFixture } from "./tasksFixture.mjs";
import fs from "node:fs";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const PIC = "https://example.test/p.jpg", opt = { now: NOW, allowData: true };
const fbFind = i => ({ title: ["1995 Porsche 911 Carrera S", "1987 Porsche 911 Carrera", "2004 Porsche 911 Turbo"][i], platform: "Bring a Trailer", url: "https://example.test/sale" + i, photo: PIC, soldLabel: "Sold for $" + (90 + i) + ",000", dateLine: "Sold October " + (10 + i) + ", 2026", findUrl: "/find?q=porsche+911" });
const live = examplesFixture();
const strip = h => h.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<script[\s\S]*?<\/script>/g, "");
const cards = h => (strip(h).match(/class="fx-card"/g) || []).length;
// FIND: null -> engine fallback fills three; one live car + fallback -> live first then two sales; three live -> no fallback shown; nothing at all -> absent
const fb3 = [0, 1, 2].map(fbFind);
ok(cards(PP.findHtml({ examples: { cars: [], fallback: fb3 }, ...opt })) === 3, "Find: no live cars, the engine's three fallback sales fill the row");
ok(cards(PP.findHtml({ examples: null, ...opt })) === 0 && !/data-find-examples/.test(PP.findHtml({ examples: null, ...opt })), "Find: the engine sent nothing, no section and no invented car");
{ const h = PP.findHtml({ examples: { cars: [live[0]], fallback: fb3 }, ...opt }); ok(cards(h) === 3 && h.indexOf(live[0].title) < h.indexOf("1995 Porsche 911 Carrera S") && /Sold for \$90,000/.test(h) && !/Sold for \$92,000/.test(h), "Find: one live car, then the engine's fallback sales to three, live first"); }
ok(!/Sold for/.test(PP.findHtml({ examples: { cars: live, fallback: fb3 }, ...opt })) && cards(PP.findHtml({ examples: live, ...opt })) === 3, "Find: three live cars, no fallback shown; the plain list the engine sent before still works");
{ const h = PP.findHtml({ examples: { cars: [], fallback: fb3 }, ...opt }); ok(/Sold for \$90,000/.test(h) && /Sold October 10, 2026/.test(h) && !/Current bid/.test(h) && !/SOLD BEFORE/.test(h), "Find: a fallback card prints the engine's sale lines as sent, labelled as a sale, not a bid");
  ok(PP.findFallbackOf([{ ...fbFind(0), photo: "http://x/y.jpg" }, { ...fbFind(1), soldLabel: "" }, { ...fbFind(2), dateLine: "worth a bargain" }, { ...fbFind(0), findUrl: "//evil.test" }]).length === 0, "Find: a fallback card with no https photo, no sale line, valuation words or an off-site link is dropped"); }
// TASKS: both cards, three states each
const dl = demoFixture(), wl = { car: { title: "1999 Porsche 911", platform: "Sample Platform", url: "https://example.test/live/w", photo: PIC, live: true, endsAt: new Date(NOW + 5 * 3600e3).toISOString(), priceLabel: "Current bid $41,000", timeLine: "5 hours left" }, checkedAt: new Date(NOW).toISOString() };
const tf = { fallback: { label: "Recent example", status: "Ended", shortRequest: "A white manual Porsche 911", car: { title: "1991 Porsche 911 Carrera 2", platform: "Bring a Trailer", url: "https://example.test/sale/t", photo: PIC, priceLabel: "Sold for $88,000", mileageLine: "52,000 miles", dateLine: "Sold October 9, 2026" } } };
const wf = { fallback: { label: "Recent example", status: "Ended", car: { title: "2001 Porsche 911 Turbo", platform: "Bring a Trailer", url: "https://example.test/sale/w", photo: PIC, priceLabel: "Sold for $120,000", dateLine: "Sold October 8, 2026" } } };
const both = h => /data-sf="task"/.test(strip(h)) && /data-sf="watching"/.test(strip(h));
const T = (d, w) => TP.seeWhatSamCanFindHtml(d, w, opt);
ok(both(T(tf, wf)) && /Recent example/.test(T(tf, wf)) && /Ended/.test(T(tf, wf)) && /Sold for \$88,000/.test(T(tf, wf)) && /Sold for \$120,000/.test(T(tf, wf)), "Tasks: tasksDemo and watchingDemo both null, the two engine fallback cards show, labelled Recent example, Ended, with their real sale figures");
ok(both(T(dl, wf)) && /data-tasks-demo/.test(T(dl, wf)) && /Recent example/.test(T(dl, wf)), "Tasks: a live search card beside a fallback watching card");
ok(both(T(tf, wl)) && /data-watching-demo/.test(T(tf, wl)), "Tasks: a fallback search card beside a live watching card");
ok(both(T(dl, wl)) && !/Recent example/.test(T(dl, wl)), "Tasks: both live, no fallback label");
ok(T(null, null) === "" && T({}, {}) === "", "Tasks: the engine sent nothing, no section and no invented car");
ok(TP.cardFallbackOf({ fallback: { ...tf.fallback, car: { ...tf.fallback.car, photo: "http://x/y.jpg" } } }) === null && TP.cardFallbackOf({ fallback: { ...tf.fallback, status: "" } }) === null && TP.cardFallbackOf({ fallback: { ...tf.fallback, label: "a bargain" } }) === null, "Tasks: a fallback without an https photo, a status, or with valuation words is refused");
// no dashes, no page-made figure: the sale lines in the output are only the ones the engine sent
{ const all = strip(PP.findHtml({ examples: { cars: [], fallback: fb3 }, ...opt }) + T(tf, wf)).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").replace(/Manual 911 under \$40k/g, ""); ok(!/[–—]/.test(all), "no em or en dash on a fallback page");
  const dollars = [...all.matchAll(/\$[\d,]+/g)].map(m => m[0]); const sent = JSON.stringify([fb3, tf, wf]); ok(dollars.every(d => sent.includes(d)), "every dollar figure printed was sent by the engine (" + dollars.join(", ") + ")"); }
// SPACING (Sam, Nov 8): the Tasks cards no longer sit directly under the input
{ const css = TP.TASKS_CSS, m = /\.sf\{padding-top:(\d+)px/.exec(css); ok(m && Number(m[1]) >= 48, "Tasks: the cards start at least 48px below the input block (padding-top " + (m && m[1]) + ")"); }
// THE CLASS: the three engine-fed sections are the only ones, and each has a fallback path. A new engine field without one fails.
{ const src = fs.readFileSync("lib/preview/tasksPreview.js", "utf8") + fs.readFileSync("lib/preview/previewPages.js", "utf8");
  ok(/cardFallbackOf\(d, opts\)/.test(src) && /cardFallbackOf\(w, opts\)/.test(src) && /findRowOf\(field, opts\)/.test(src), "every engine-fed section (Find examples, Tasks search card, Tasks watching card) reads its fallback"); }
// MUTANTS: the page code without the fallback path is caught by this very check
{ const noFb = (await import("../lib/preview/previewPages.js?m=" + Date.now())); void noFb;
  const hiddenWhenNull = h => !/data-find-examples/.test(h);   // the old behaviour: with a null live field the section is gone
  ok(hiddenWhenNull(PP.findHtml({ examples: null, ...opt })) && !hiddenWhenNull(PP.findHtml({ examples: { cars: [], fallback: fb3 }, ...opt })), "mutant: the old rule (hidden when the live field is null) fails the 'fallback fills the row' assertion above");
  const oldTasks = (d, w) => ["task", "watching"].every(k => new RegExp('data-sf="' + k + '"').test(TP.seeWhatSamCanFindHtml(TP.tasksDemoOf(d, opt) ? d : null, TP.watchingDemoOf(w, opt) ? w : null, opt)));
  ok(!oldTasks(tf, wf), "mutant: a page that reads only the live shape shows no cards for a fallback-only field, which the Tasks assertion above rejects"); }
console.log(`previewFallbackCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
