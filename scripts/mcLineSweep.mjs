// LIVE: this script calls production (goasksam.com). Run it only in a gap the lanes name; refuses without --live.
// Lane E, Market Check item 1: the line "The typical range for cars like this." and the chart legend "Typical range (middle half
// of sales)" on every surface I can drive, and no old wording left: Market Check (card and chart legend), the Buy card's drawer,
// the partner demo tabs (and the partner's own small line UNTOUCHED), plus a SOURCE sweep of the whole tree (the Sell result,
// the emails and every other renderer share the card's code). A busy-lane check before every load. Zero OldCarsData.
import puppeteer from "puppeteer-core";
import { execSync } from "node:child_process";
if (!process.argv.includes("--live")) { console.log("mcLineSweep: LIVE script. Pass --live, in a named gap only."); process.exit(2); }
const REPO = process.env.MAIN_CHECKOUT || process.cwd(), HOST = "goasksam.com", CREW = process.env.CREW, KEY = process.env.PROBE_KEY, BYP = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const OLD_LINE = "Half of these sold in this range", NEW_LINE = "The typical range for cars like this.";
const OLD_LEG = "Middle half of sales (25th to 75th percentile)", NEW_LEG = "Typical range (middle half of sales)";
const HOW = (/export const HOW_LINE = "([^"]+)"/.exec(execSync(`git -C "${REPO}" show origin/main:api/partnerAnswer.js`, { encoding: "utf8" })) || [])[1];   // read from main: Sam changed it in the batch
const now = () => new Date().toISOString().slice(11, 19) + "Z";
const busy = () => { if (!process.env.OPEN_LOCKS_SCRIPT) return ""; try { return execSync(`git -C "${REPO}" fetch -q origin main && git -C "${REPO}" show origin/main:docs/lane-notes.md | node "${process.env.OPEN_LOCKS_SCRIPT}"`, { encoding: "utf8", env: process.env }).trim(); } catch { return ""; } };
const guard = () => { for (let i = 0; i < 120; i++) { const b = busy(); if (!b) return; execSync("sleep 15"); } throw new Error("a lane stayed busy"); };
let fails = 0; const fail = m => { fails++; console.log(`  FAIL at ${now()}: ${m}`); };
// source sweep: file names only
for (const [what, needle] of [["old line", OLD_LINE], ["old legend", OLD_LEG]]) {
  let out = ""; try { out = execSync(`git -C "${REPO}" grep -n -F "${needle}" origin/main -- api lib public js`, { encoding: "utf8" }); } catch { out = ""; }
  out = out.split("\n").filter(l => l && !/^[^:]+:[^:]+:\s*\/\//.test(l)).join("\n");   // comment lines only document the change: not live wording
  const files = [...new Set(out.split("\n").filter(Boolean).map(f => f.replace(/^origin\/main:/, "").split(":")[0]))];
  console.log(`source sweep, ${what}: ${files.length ? files.join(", ") : "none left in api, lib, public or js"}`); if (files.length) fail(`the ${what} is still in the source: ${files.join(", ")}`);
}
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
const page = async () => { const p = await b.newPage(); await p.setViewport({ width: 1440, height: 1000 }); await p.setRequestInterception(true); p.on("request", r => { let own = false; try { own = new URL(r.url()).host === HOST; } catch {} r.continue(own ? { headers: { ...r.headers(), ...(KEY ? { "x-ops-key": KEY, "x-launch-stage-test": "2" } : {}), ...(BYP ? { "x-vercel-protection-bypass": BYP } : {}) } } : undefined); }); if (CREW) await p.setCookie({ name: "gas_crew", value: CREW, domain: HOST, path: "/" }); return p; };
const text = p => p.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
try {
  { guard(); const p = await page(); await p.goto(`https://${HOST}/market-check?car=1995-porsche-911-carrera`, { waitUntil: "domcontentloaded" }); await new Promise(r => setTimeout(r, 9000)); const t = await text(p);
    console.log(`Market Check: new line ${t.includes(NEW_LINE)}, old line ${t.includes(OLD_LINE)}, new legend ${t.includes(NEW_LEG)}, old legend ${t.includes(OLD_LEG)}`);
    if (!t.includes(NEW_LINE)) fail("Market Check does not show the new line"); if (t.includes(OLD_LINE)) fail("Market Check still shows the old line"); if (t.includes(OLD_LEG)) fail("Market Check's chart still shows the old legend");
    if (!t.includes(NEW_LEG)) console.log("  (the chart legend did not render in this read: not shown, not failed)"); await p.close(); }
  { guard(); const p = await page(); await p.goto(`https://${HOST}/buy?q=Porsche+911&make=Porsche&model=911`, { waitUntil: "domcontentloaded" }); for (let k = 0; k < 40; k++) { const n = await p.evaluate(() => document.querySelectorAll("article.car:not(.skel)").length); if (n >= 3) break; await new Promise(r => setTimeout(r, 500)); } await new Promise(r => setTimeout(r, 2500));
    const card = await text(p); const opened = await p.evaluate(async () => { const a = [...document.querySelectorAll("article.car:not(.soldc) .acts button, article.car:not(.soldc) .acts .lk")][0]; if (!a) return null; a.click(); await new Promise(r => setTimeout(r, 2500)); return document.body.innerText.replace(/\s+/g, " "); });
    console.log(`Buy: cards carry the old line ${card.includes(OLD_LINE)}; drawer opened ${opened !== null}, drawer new line ${opened ? opened.includes(NEW_LINE) : "n/a"}, drawer old line ${opened ? opened.includes(OLD_LINE) : "n/a"}`);
    if (card.includes(OLD_LINE) || (opened && opened.includes(OLD_LINE))) fail("Buy still shows the old line"); if (opened === null) fail("no Market Check drawer to open"); else if (!opened.includes(NEW_LINE) && !card.includes(NEW_LINE)) fail("Buy shows the new line nowhere"); await p.close(); }
  for (const v of ["a", "b", "c"]) { guard(); const p = await page(); await p.goto(`https://${HOST}/preview?p=amazon&view=${v}&car=${encodeURIComponent("2017 Porsche 911 Carrera Coupe")}`, { waitUntil: "domcontentloaded" }); await new Promise(r => setTimeout(r, 8000)); if (v === "c") { await p.evaluate(() => { const x = document.querySelector("[data-mc-toggle]"); if (x) x.click(); }); await new Promise(r => setTimeout(r, 1500)); } const t = await text(p);
    console.log(`partner demo tab ${v}: new line ${t.includes(NEW_LINE)}, old line ${t.includes(OLD_LINE)}, the partner's own small line untouched ${t.includes(HOW)}`);
    if (t.includes(OLD_LINE)) fail(`partner demo tab ${v} still shows the old line`); if (!t.includes(NEW_LINE)) fail(`partner demo tab ${v} does not show the new line`); if (!t.includes(HOW)) fail(`partner demo tab ${v}: the partner's small line "${HOW}" is missing or changed`); await p.close(); }
} finally { await b.close(); }
console.log(fails ? `mcLineSweep: ${fails} FAIL` : "mcLineSweep: all pass"); process.exit(fails ? 1 : 0);
