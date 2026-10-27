// HOMEPAGE TIGHTENING (Sam, Oct 26 2026): no eyebrow, a one-line search box about 72 px high on desktop and the same shape on a phone, no helper line,
// a placeholder that rotates through three examples (a plain fade, stops on focus or any text, never rewrites the real placeholder so a screen reader
// never hears it), the accessible label "Describe the car you want", the sidebar line "Find, check, sell.", the freshness line from the engine's
// date. Copy and CSS only. Renders the handler's HTML in the local browser.   node scripts/homeTightenCheck.mjs
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";
process.env.LAUNCH_STAGE = "2";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const ROOT = path.resolve(new URL("..", import.meta.url).pathname); process.chdir(ROOT);
const { default: h } = await import(pathToFileURL(path.join(ROOT, "api", "home.js")).href);
const body = await new Promise(resolve => { const res = { setHeader() {}, getHeader() {}, status(c) { res.code = c; return res; }, send(b) { resolve(b); }, end() { resolve(""); } };
  Promise.resolve(h({ method: "GET", url: "/", query: {}, headers: { host: "goasksam.com", cookie: "" }, socket: {} }, res)).catch(e => resolve(String(e))); setTimeout(() => resolve(""), 15000); });
const EX = ["A 1965 Chevrolet Corvette within 500 miles of Chicago", "A manual 911 under $80,000", "Low mile E46 M3, no modifications"];
const markup = body.replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<script[\s\S]*?<\/script>/g, "");
ok(!/WELCOME TO GOASKSAM/i.test(markup) && !/class="gst-eye"/.test(markup), "no eyebrow");
ok(!/Speak or type naturally/.test(body) && /<label class="gst-sr" for="gst-home-q">Describe the car you want<\/label>/.test(body), "no helper line; the accessible label is 'Describe the car you want'");
ok(/data-ph="[^"]*Chevrolet Corvette within 500 miles of Chicago[^"]*manual 911 under \$80,000[^"]*E46 M3, no modifications/.test(body.replace(/&quot;/g, '"').replace(/\\u0024/g, "$")) || EX.every(x => body.replace(/&quot;/g, '"').includes(x.replace(/'/g, "&#39;")) || body.includes(x)), "the three examples are on the page");
ok(/<p class="gas-tag">Find, check, sell\.<\/p>/.test(body), "the sidebar line is 'Find, check, sell.'");
ok(/data-lead-sentence>Live auctions and completed sales(, updated [A-Z][a-z]+ \d{1,2}, \d{4})?\.<\/p>/.test(body), "the freshness line reads 'Live auctions and completed sales, updated {date}.' (date from the last ingest, lib/asOf.js)");
ok(!/new Date\(\)|Date\.now\(\)/.test(fs.readFileSync("api/home.js", "utf8").split("export default")[1]), "the home handler never reads the clock for the date");
ok(!/[–—]/.test(body.replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<script[\s\S]*?<\/script>/g, "")), "no dashes in the copy");
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (!fs.existsSync(CHROME)) { console.log("SKIP browser part: no Chrome at " + CHROME); console.log(`homeTightenCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0); }
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
for (const [name, w, hgt, tall] of [["desktop", 1440, 900, [66, 80]], ["phone", 390, 844, [56, 76]]]) {
  const page = await browser.newPage(); await page.setViewport({ width: w, height: hgt });
  await page.setContent(body.replace(/<script src="[^"]*"[^>]*><\/script>/g, ""), { waitUntil: "domcontentloaded" });
  await page.addStyleTag({ content: "*{animation:none!important}" });
  await new Promise(r => setTimeout(r, 300));
  const m = await page.evaluate(() => { const b = document.querySelector(".gst-box").getBoundingClientRect(), i = document.querySelector(".gst-in").getBoundingClientRect(), mic = document.querySelector(".gst-go").getBoundingClientRect(), ph = document.querySelector(".gst-ph"), cs = getComputedStyle(document.querySelector(".gst-box")), ps = getComputedStyle(document.querySelector(".gst-in"));
    return { boxH: b.height, boxW: b.width, radius: cs.borderTopLeftRadius, inFont: ps.fontSize, goRight: b.right - mic.right, goMid: (mic.top + mic.height / 2) - (b.top + b.height / 2), phText: ph && ph.textContent, phFont: ph && getComputedStyle(ph).fontSize, helpShown: !!document.querySelector(".gst-help") && getComputedStyle(document.querySelector(".gst-help")).display !== "none", noScroll: document.documentElement.scrollWidth <= window.innerWidth + 1 }; });
  ok(m.boxH >= tall[0] && m.boxH <= tall[1], `${name}: the box is one line, about 72 px (${Math.round(m.boxH)} px)`);
  ok(Math.abs(m.goMid) < 2 && m.goRight > 8 && m.goRight < 30, `${name}: the arrow stays at the right edge, centred (right gap ${Math.round(m.goRight)}, off-centre ${Math.round(m.goMid)})`);
  ok(m.radius === (w > 700 ? "22px" : "18px"), `${name}: the corner radius is kept (${m.radius})`);
  ok(m.phText === EX[0] && m.phFont === m.inFont, `${name}: the placeholder is the first example at the normal input size (${m.phFont})`);
  ok(!m.helpShown, `${name}: no helper line`);
  ok(w > 700 ? Math.round(m.boxW) >= 900 : m.boxW > 300, `${name}: the box keeps its width (${Math.round(m.boxW)})`);
  ok(m.noScroll, `${name}: no horizontal scroll`);
  // rotation: stops at focus, hides on text, never touches the real placeholder
  const real0 = await page.$eval(".gst-in", e => e.getAttribute("placeholder"));
  ok(real0 === " ", `${name}: the real placeholder is a blank space, so a screen reader reads the label only and nothing rotates for it`);
  await page.focus(".gst-in");
  const vis1 = await page.$eval(".gst-ph", e => getComputedStyle(e).display);
  ok(vis1 !== "none", `${name}: focused and empty, the example stays shown`);
  await page.keyboard.type("911");
  const vis2 = await page.$eval(".gst-ph", e => getComputedStyle(e).display);
  ok(vis2 === "none", `${name}: any text hides the example`);
  await page.close();
}
// the rotation itself, with a short clock: it advances through the three and the real placeholder is untouched
const page = await browser.newPage(); await page.setViewport({ width: 1440, height: 900 });
await page.setContent(body.replace(/<script src="[^"]*"[^>]*><\/script>/g, "").replace("setInterval(", "setInterval(").replace(/5200\)/g, "300)"), { waitUntil: "domcontentloaded" });
const texts = new Set(); let real = null;
for (let k = 0; k < 40; k++) { await new Promise(r => setTimeout(r, 60)); const x = await page.evaluate(() => ({ ov: document.querySelector(".gst-ph").textContent, real: document.querySelector(".gst-in").getAttribute("placeholder") })); texts.add(x.ov); real = x.real; }
ok(texts.size >= 2 && [...texts].every(t => EX.includes(t)), "the example advances on its own through the three (" + [...texts].length + " seen)");
ok(real === " ", "the real placeholder (what a screen reader reads) never changed");
await browser.close();
console.log(`homeTightenCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
