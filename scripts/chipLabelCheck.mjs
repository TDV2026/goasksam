// F-30 (Lane S's CodeQL triage, Oct 21 2026; Lane C): the Sell chip buttons carry their label in data-chip and onclick reads
// this.dataset.chip, never a JS string built from the label. In a real browser (no network): both builders (result-copy.js
// chipsHTML, chat-core.js parseResults) show and send exactly the label, for plain labels and for one with quotes, angle
// brackets and an ampersand, which renders as text and runs nothing.
//   node scripts/chipLabelCheck.mjs     exit 1 on any failure.
import fs from "node:fs";
import puppeteer from "puppeteer-core";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const read = f => fs.readFileSync(new URL(`../public/js/${f}`, import.meta.url), "utf8");
const cc = read("chat-core.js"), rc = read("result-copy.js");
const fnOf = (src, head) => { const i = src.indexOf(head); if (i < 0) throw new Error("missing " + head); let d = 0, j = src.indexOf("{", i); for (let k = j; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}" && !--d) return src.slice(i, k + 1); } throw new Error("unclosed " + head); };
ok(!/handleChip\('\$\{/.test(cc + rc), "no chip builds a JS string from its label any more");
const lib = [cc.slice(cc.indexOf("function escapeHtml("), cc.indexOf("\n", cc.indexOf("function escapeHtml("))), fnOf(cc, "function parseResults(raw){"), fnOf(rc, "function chipsHTML(chips){")].join("\n");
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new" });
const p = await b.newPage();
await p.setContent("<!doctype html><body><div id=a></div><div id=b></div></body>");
const hostile = `Say "hi" <img src=x onerror="window.__pwn=1"> & 'quoted'`;
const res = await p.evaluate((lib, hostile) => {
  window.__sent = []; window.__pwn = 0;
  window.currentChipStep = () => 7; window.handleChip = (t, s) => window.__sent.push([t, s === undefined ? null : s]);
  (0, eval)(lib);
  document.getElementById("a").innerHTML = chipsHTML(["Yes", "Bring a Trailer", "It's a manual", hostile]);
  document.getElementById("b").innerHTML = parseResults("Pick one [CHIPS:Yes|It's a manual|" + hostile + "]").chipsHTML;
  for (const btn of document.querySelectorAll("button.chip")) btn.click();
  return { sent: window.__sent, texts: [...document.querySelectorAll("button.chip")].map(x => x.textContent.trim()), pwn: window.__pwn, imgs: document.querySelectorAll("img").length };
}, lib, hostile);
await new Promise(r => setTimeout(r, 300));
const pwn = await p.evaluate(() => window.__pwn);
await b.close();
ok(JSON.stringify(res.sent.slice(0, 4)) === JSON.stringify([["Yes", 7], ["Bring a Trailer", 7], ["It's a manual", 7], [hostile, 7]]), "result-copy chips send exactly their label, with the step (got " + JSON.stringify(res.sent.slice(0, 4)) + ")");
ok(JSON.stringify(res.sent.slice(4)) === JSON.stringify([["Yes", null], ["It's a manual", null], [hostile, null]]), "chat-core chips send exactly their label");
ok(JSON.stringify(res.texts) === JSON.stringify(["Yes", "Bring a Trailer", "It's a manual", hostile, "Yes", "It's a manual", hostile]), "each chip shows its label as text");
ok(res.imgs === 0 && pwn === 0, "a label with quotes and angle brackets renders as text and runs nothing");
console.log(`chipLabelCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
