// BUY STAGE 1f, Lane E's offline behaviour and data checks, to Sam's block that replaces every earlier one (Oct 21 2026).
// No network. For prePush in Lane C's last 1f commit (before it, the panel checks describe 1f). The live half is buy1fLive.mjs.
//  - the question panel's markup: no "S" mark (.sq-mark) and no "Sam" label (.sq-who); Sam's line "Choose one, or tell Sam
//    how else to narrow your search below." under the engine's question;
//  - "Show them too →": the unknown-data control reads with its arrow;
//  - no star, heart or save glyph or label in the Buy page; no en or em dash in code outside comments;
//  - the composer ruling (Lane F): no free text input other than #q; numeric zip boxes inside the engine question allowed;
//    the inline "Edit the search" field (#sfin) is gone;
//  - the engine's chips: a make-only search asks which model, the engine's counts in order, "Any Porsche" last.
import fs from "node:fs";
import { askRule } from "../lib/live/narrow.js";
let fail = 0, pass = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const src = fs.readFileSync(new URL("../api/buy.js", import.meta.url), "utf8");
const codeOnly = src.replace(/\/\/[^\n]*/g, "");
// api/buy.js holds the page's client code as ONE JSON string: its line breaks are the two characters backslash and n, so the
// function's end is matched on that literal (Lane C's scope finding, Oct 21 2026), never on a real newline
const panelFn = (/function samAskHtml\([^)]*\)\{[\s\S]*?\\n {2,4}\}/.exec(src) || [""])[0];
ok(!!panelFn, "the question panel's builder (samAskHtml) is found");
ok(!/class=\\?"sq-mark/.test(panelFn) && !/>S<\/span>/.test(panelFn), "the panel draws no \"S\" mark");
ok(!/class=\\?"sq-who/.test(panelFn) && !/>Sam<\/p>/.test(panelFn), "the panel draws no \"Sam\" label");
ok(panelFn.length > 0 && panelFn.length < 2000 && !/lturn|lbub/.test(panelFn), `the panel's builder is matched on its own (${panelFn.length} characters), not run on into the location turn`);
// Lane F's ruling: no "S" mark anywhere in the Sam turns (the location question's turn included); the plain turn has no mark
ok(!/class=\\?"(sq-mark|lav)\\?"/.test(src) && !/aria-hidden=\\?"true\\?">S<\/span>/.test(src), "no \"S\" mark anywhere in the Sam turns (the panel and the location question's turn)");
ok(src.includes("Choose one, or tell Sam how else to narrow your search below."), "Sam's line under the question is in the page");
ok(/Show them too \\u2192|Show them too →|Show them too &rarr;|Show them too &#8594;/.test(src), "\"Show them too →\" carries its arrow");
ok(!/[★☆♥♡]/.test(src) && !/aria-label=\\?"(Save|Favou?rite|Star)/i.test(src), "no star, heart or save icon in the Buy page");
ok(!/[–—]/.test(codeOnly), "no en or em dash in the page's code outside comments");
const inputs = (src.match(/<input\b[^>]*>/g) || []).filter(t => !/type=\\?"(hidden|checkbox|radio|submit|button|email)\\?"/.test(t));
const zipAnswer = t => /name=\\?"zip\\?"/.test(t) && /inputmode=\\?"numeric\\?"/.test(t);
const free = inputs.filter(t => !zipAnswer(t));
ok(free.length === 1 && /id=\\?"q\\?"/.test(free[0]), `no free text input other than the composer #q (${free.length} free: ${free.map(t => (/id=\\?"([^"\\]+)/.exec(t) || [])[1] || "unnamed").join(", ")}); zip answer boxes: ${inputs.length - free.length}, allowed`);
ok(!/id=\\?"sfin\\?"/.test(src), "the inline \"Edit the search\" field (#sfin) is gone");
const car = (model, i) => ({ r: { id: i, make: "Porsche", model, year: 2001, listing_title: `2001 Porsche ${model}` }, facts: { body: null, gearbox: null }, gen: null, unknown: [] });
const xs = [...Array(23)].map((_, i) => car("911", i)).concat([...Array(5)].map((_, i) => car("Boxster", 100 + i)), [...Array(3)].map((_, i) => car("928", 200 + i)));
const models = [{ label: "911", n: 23, patch: { model: "911" } }, { label: "Boxster", n: 5, patch: { model: "Boxster" } }, { label: "928", n: 3, patch: { model: "928" } }];
const m = askRule(xs, { p: { make: "Porsche" }, v: { make: "Porsche" }, gens: null, models }).find(a => a.dim === "model");
ok(m && JSON.stringify(m.chips.map(c => `${c.label} (${c.n})`)) === JSON.stringify(["911 (23)", "Boxster (5)", "928 (3)"]), "the model chips are the engine's counts in order");
ok(m && m.any && m.any.label === "Any Porsche" && m.any.n === xs.length, "\"Any Porsche\" closes the chips with every car");
console.log(`buy1fCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
