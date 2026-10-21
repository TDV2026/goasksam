// BUY STAGE 1f, Lane E's offline behaviour and data checks (Sam, Oct 21 2026). No network. Run in prePush once Lane C's
// 1f commits are in (before them the wording checks fail by design: they describe 1f). The live half is buy1fLive.mjs.
//  - the composer: Sam's placeholder, and it is the page's only text input (one <input> for the composer in the page);
//  - the keep-looking wording after the results: the heading, Sam's line, the button "Have Sam keep looking for {search}";
//  - no star, heart or save glyph anywhere in the Buy page's code;
//  - the Sam question's chips come only from the engine's results (askRule over the cars), "Any {make}" last, with the
//    model question's counts equal to the cars that carry each model.
import fs from "node:fs";
import { askRule } from "../lib/live/narrow.js";
let fail = 0, pass = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const src = fs.readFileSync(new URL("../api/buy.js", import.meta.url), "utf8");
ok(src.includes("Tell Sam what to change, like under 50,000 miles or near 90210"), "the composer's placeholder is Sam's: \"Tell Sam what to change, like under 50,000 miles or near 90210\"");
// Lane F's ruling (Oct 21 2026, Sam asleep, the brief wins): no FREE text input other than the composer #q; the numeric
// zip boxes inside the engine's own distance question are answer boxes and are allowed; the inline "Edit the search" field
// (#sfin) goes.
const inputs = (src.match(/<input\b[^>]*>/g) || []).filter(t => !/type=\\?"(hidden|checkbox|radio|submit|button|email)\\?"/.test(t));
const zipAnswer = t => /name=\\?"zip\\?"/.test(t) && /inputmode=\\?"numeric\\?"/.test(t) && /pattern=\\?"\[0-9\]\{5\}\\?"/.test(t);
const free = inputs.filter(t => !zipAnswer(t));
ok(free.length === 1 && /id=\\?"q\\?"/.test(free[0]), `no free text input other than the composer #q (${free.length} free: ${free.map(t => (/id=\\?"([^"\\]+)/.exec(t) || [])[1] || "unnamed").join(", ")}); numeric zip boxes inside the engine question: ${inputs.length - free.length}, allowed`);
ok(!/id=\\?"sfin\\?"/.test(src), "the inline \"Edit the search\" field (#sfin) is gone");
ok(src.includes("Have Sam keep looking") && src.includes("Sam will keep watching new listings and email you when another matching car goes live."), "the keep-looking heading and Sam's line are in the page");
ok(/Have Sam keep looking for /.test(src), "the button reads \"Have Sam keep looking for {search}\"");
ok(!/[★☆♥♡]/.test(src) && !/aria-label=\\?"(Save|Favou?rite|Star)/i.test(src), "no star, heart or save icon anywhere in the Buy page");
ok(!/[–—]/.test(src.replace(/\/\/[^\n]*/g, "")), "no en or em dash in the page's code outside comments");
// the Sam question: the engine's own chips, "Any Porsche" last
const car = (model, i) => ({ r: { id: i, make: "Porsche", model, year: 2001, listing_title: `2001 Porsche ${model}` }, facts: { body: null, gearbox: null }, gen: null, unknown: [] });
const xs = [...Array(23)].map((_, i) => car("911", i)).concat([...Array(5)].map((_, i) => car("Boxster", 100 + i)), [...Array(3)].map((_, i) => car("928", 200 + i)));
const models = [{ label: "911", n: 23, patch: { model: "911" } }, { label: "Boxster", n: 5, patch: { model: "Boxster" } }, { label: "928", n: 3, patch: { model: "928" } }];
const asks = askRule(xs, { p: { make: "Porsche" }, v: { make: "Porsche" }, gens: null, models });
const m = asks.find(a => a.dim === "model");
ok(!!m, "a make-only search asks which model");
ok(m && JSON.stringify(m.chips.map(c => `${c.label} (${c.n})`)) === JSON.stringify(["911 (23)", "Boxster (5)", "928 (3)"]), `the model chips are the engine's counts in order (${m && JSON.stringify(m.chips.map(c => c.label + " " + c.n))})`);
ok(m && m.any && m.any.label === "Any Porsche" && m.any.n === xs.length, `"Any Porsche" closes the chips with every car (${m && m.any && m.any.label} ${m && m.any && m.any.n})`);
console.log(`buy1fCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
