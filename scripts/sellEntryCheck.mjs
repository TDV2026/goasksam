// THE SELL ENTRY PAGE (Sam, Oct 26 2026), offline: the signed-in Sell page draws the same heading pieces as Find, Market Check and Home (the shared start component:
// eyebrow, serif headline, sans sub), has no script-font text, shows an "e.g." example in its box like Tasks, keeps its words, and never calls Sam he, him or his. No network.
//   node scripts/sellEntryCheck.mjs
import fs from "node:fs";
process.env.LAUNCH_STAGE = "2";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const { sellShellHtml } = await import("../api/sellPage.js");
const entry = await import("../lib/sell/sellEntry.js"), start = await import("../lib/startPage.js"), ph = await import("../lib/startPlaceholders.js");
const html = await sellShellHtml({ headers: { host: "goasksam.com", cookie: "" }, query: {}, url: "/sell" });
const hero = (/<div id="msgs">([\s\S]*?)<\/section><\/div>/.exec(html) || [])[1] || "";
const text = s => s.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ").replace(/&middot;/g, "·").replace(/\s+/g, " ");
// one component with Find, Market Check and Home
ok(/<p class="gst-eye">/.test(hero) && /<h1 class="gst-h">Tell Sam the car you&#39;re selling\.|<h1 class="gst-h">Tell Sam the car you're selling\./.test(hero) && /<p class="gst-sub">Sam will show you where to sell it, and why\.<\/p>/.test(hero), "the Sell heading uses the shared eyebrow, headline and sub classes with its own words");
const sh = start.startHtml({ eyebrow: "E", title: "T", sub: "S", ids: {} });
ok(/class="gst-eye"/.test(sh) && /class="gst-h"/.test(sh) && /class="gst-sub"/.test(sh), "the shared component draws those same three classes");
for (const f of ["lib/live/buyLanding.js", "lib/live/marketCheckLanding.js", "api/home.js"]) ok(/startHtml/.test(fs.readFileSync(f, "utf8")), f + " draws the shared start component");
ok(/\.gst-h\{[^}]*Newsreader|\.gst-h\{[^}]*var\(--serif/.test(start.START_CSS) && /--serif:"Newsreader"/.test(entry.SELL_ENTRY_CSS) && /newsreader-normal-latin\.woff2/.test(html), "the heading's serif is Newsreader, loaded on the page");
// no script font
ok(!/hp-script/.test(hero) && !/Go ahead, ask Sam/.test(html), "no handwritten script line in the Sell page");
ok(/\.hp-script\{font:600 12px[^}]*Instrument Sans[^}]*!important/.test(html), "any remaining script-class text (Your results) is drawn as the quiet eyebrow, not the script font");
const css = fs.readFileSync("public/styles.css", "utf8");
const scriptUses = [...css.matchAll(/([^{}]+)\{[^}]*font-family:\s*var\(--pc-script-f\)[^}]*\}/g)].map(m => m[1].trim());
ok(scriptUses.every(s => /\.hp-script|\.pcard-script/.test(s)) && /\.pcard-script\{font-family:"Newsreader"[^}]*!important/.test(html), "the script font is used only by .hp-script and .pcard-script, both overridden on this page (" + scriptUses.join(" | ") + ")");
// the example in the box, like Tasks
const place = (/<textarea id="inp"[^>]*placeholder="([^"]*)"/.exec(html) || [])[1] || "";
ok(/^e\.g\. 2004 Porsche 911 Carrera, or paste a VIN\.$/.test(place), "the box shows an example starting with e.g. (" + place + ")");
ok(/PLACEHOLDER_EXAMPLES = \["e\.g\. /.test(fs.readFileSync("public/js/homepage.js", "utf8")), "the page script keeps the same example");
ok(/^e\.g\./.test(ph.PLACEHOLDERS.sell.text), "the new Sell's placeholder is the same example");
ok(/placeholder="e\.g\. /.test(fs.readFileSync("api/tasksPage.js", "utf8")) || /e\.g\. find me a black manual 997/.test(fs.readFileSync("api/tasksPage.js", "utf8")), "Tasks shows its example the same way (e.g.)");
ok(!/[0-9]/.test(place.replace("2004", "").replace("911", "")), "the only numbers in the example are the year and the model name");
// the browser copy of the heading equals the server's
const rc = fs.readFileSync("public/js/result-copy.js", "utf8");
ok(rc.includes(entry.SELL_ENTRY.title) && rc.includes(entry.SELL_ENTRY.sub) && rc.includes('Sell \\u00b7 Selling intelligence') && !/hp-script/.test(/function homeHeroHTML[\s\S]*?\n\}/.exec(rc)[0]), "the page script's own heading (after a new search) says the same words and has no script line");
// the two small lines stay
ok(/Real auction results/.test(text(html)) && /Platform performance/.test(text(html)) && /PowerSeller data/.test(text(html)) && /Built for enthusiast and specialty vehicles/.test(text(html)), "the two small lines under the box are kept");
// wording
const words = text(hero) + " " + place;
ok(!/\b(he|him|his)\b/i.test(words) && !/[–—]/.test(words), "no he, him, his or dash in the heading words");
console.log(`sellEntryCheck: ${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0);
