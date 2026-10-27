// THE FOUR START PAGES, TIGHTENED (Sam, Oct 26 2026): Home, Find, Market Check and Sell draw the same box: one line, about 72 px high (64 on a phone), 960 px wide, the
// mic and the arrow at the right edge, no helper line, no eyebrow on Home; a placeholder that rotates through three examples (a plain fade, it stops on focus or text, and it
// never rewrites the real placeholder, so a screen reader reads the label and hears no rotation); each page's accessible label; the hero starts the same distance from the top
// on all four pages; the freshness lines, one style, whose date is the real last-ingest date (lib/asOf.js lastUpdatedDate, mocked here), never the clock. Copy and CSS only.
// Renders each handler's HTML in the local browser at 1440 and 390.   node scripts/homeTightenCheck.mjs
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";
process.env.LAUNCH_STAGE = "2"; process.env.SELL_NEXT_ON = "1";
process.env.SUPABASE_URL = "https://example.supabase.co"; process.env.SUPABASE_SERVICE_ROLE_KEY = "x";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const ROOT = path.resolve(new URL("..", import.meta.url).pathname); process.chdir(ROOT);
// the date reaches the pages only through lastUpdatedDate: serve it one nightly-ingest row, and nothing else
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, o) => String(u).includes("job_ingest") ? new Response(JSON.stringify([{ created_at: "2026-10-26T14:00:00Z" }]), { status: 200, headers: { "content-type": "application/json" } }) : new Response("[]", { status: 200 });
const call = async (mod, url) => { const { default: h } = await import(pathToFileURL(path.join(ROOT, "api", mod + ".js")).href);
  return await new Promise(resolve => { const res = { setHeader() {}, getHeader() {}, status(c) { res.code = c; return res; }, json(b) { resolve(JSON.stringify(b)); }, send(b) { resolve(String(b)); }, end() { resolve(""); } };
    Promise.resolve(h({ method: "GET", url, query: {}, headers: { host: "goasksam.com", cookie: "" }, socket: {} }, res)).catch(e => resolve("ERR " + e)); setTimeout(() => resolve(""), 15000); }); };
const PAGES = {
  home: { html: await call("home", "/"), label: "Describe the car you want", fresh: "Live auctions and completed sales, updated Oct 26, 2026.", ex: ["A 1965 Chevrolet Corvette within 500 miles of Chicago", "A manual 911 under $80,000", "Low mile E46 M3, no modifications"] },
  find: { html: await call("buy", "/find"), label: "Describe the car you want", fresh: "Live auctions \u00b7 Updated Oct 26, 2026", ex: ["A 1965 Chevrolet Corvette within 500 miles of Chicago", "A manual 911 under $80,000", "Low mile E46 M3, no modifications"] },
  mc: { html: await call("marketCheck", "/market-check"), label: "Describe the car or paste a VIN", fresh: "Completed sales \u00b7 Updated Oct 26, 2026", ex: ["1995 Porsche 911 Carrera", "2001 BMW M3, manual", "Or paste a VIN"] },
  sell: { html: await call("sellNext", "/api/sellNext"), label: "Describe the car you are selling or paste a VIN", fresh: "Auction data \u00b7 Updated Oct 26, 2026", ex: ["2004 Porsche 911 Carrera", "2006 BMW M5", "Or paste a VIN"] }
};
globalThis.fetch = realFetch;
const markup = h => h.replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<script[\s\S]*?<\/script>/g, "");
const flat = h => markup(h).replace(/<[^>]+>/g, "|").replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/\|+/g, "|");
const src = k => fs.readFileSync({ home: "api/home.js", find: "api/buy.js", mc: "lib/live/marketCheckLanding.js", sell: "lib/sell/sellLanding.js" }[k], "utf8");
for (const [k, P] of Object.entries(PAGES)) {
  ok(P.html.length > 2000 && !/^ERR/.test(P.html), `${k}: the page renders`);
  ok(!/Speak or type naturally|Type it or say it|Type or speak naturally|Describe the car, enter a VIN/.test(markup(P.html)), `${k}: no helper line`);
  ok(new RegExp(`<label class="gst-sr" for="[^"]+">${P.label.replace(/[.*+?^$()|[\]\\]/g, "\\$&")}</label>`).test(P.html), `${k}: the accessible label is '${P.label}'`);
  ok(flat(P.html).includes("|" + P.fresh + "|"), `${k}: the freshness line reads '${P.fresh}'`);
  ok(!/[\u2013\u2014]/.test(markup(P.html)), `${k}: no dashes in the copy`);
  const dp = (/data-ph="([^"]*)"/.exec(P.html) || [])[1] || "";
  const list = (() => { try { return JSON.parse(dp.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#39;/g, "'")); } catch { return null; } })();
  ok(list && JSON.stringify(list) === JSON.stringify(P.ex), `${k}: the three examples rotate (${list ? list.join(" | ") : "none"})`);
  ok(/class="gst-in"[^>]*placeholder=" "/.test(P.html), `${k}: the real placeholder is a blank space, so a screen reader hears no rotation`);
}
ok(!/class="gst-eye"/.test(markup(PAGES.home.html)) && !/WELCOME TO GOASKSAM/i.test(markup(PAGES.home.html)), "home: no eyebrow");
for (const k of ["find", "mc", "sell"]) ok(/class="gst-eye"/.test(markup(PAGES[k].html)), `${k}: its eyebrow is kept`);
ok(/See what cars like yours actually sold for\./.test(PAGES.mc.html) && /Completed sales only\. Every result links to its source\./.test(PAGES.mc.html), "mc: the subtitle, and the line under the box is kept");
ok(/Platform performance \u00b7 Selling strategy \u00b7 PowerSeller matching/.test(PAGES.sell.html) && !/Real completed sales\. Evidence behind the recommendations/.test(PAGES.sell.html), "sell: the line under the box is kept and the lower floating line is gone");
ok(/<p class="gas-tag">Find, check, sell\.<\/p>/.test(PAGES.home.html), "the sidebar line is 'Find, check, sell.'");
// the dates come from the ingest row, never the clock: no date at all when it cannot be read
ok(!/new Date\(\)\.toLocale|toLocaleDateString/.test(src("find").split("export default")[1] || "") && !/new Date\(\)/.test(src("home").split("export default")[1] || ""), "home and find never read the clock for the date");
// with no readable date the line prints without one (the fallback is in each page's source, lib/asOf.js returns null when the ingest row cannot be read)
ok(/updated \? `Live auctions \\u00b7 Updated \$\{shortDate\(updated\)\}` : "Live auctions"/.test(src("find")), "find: with no readable date the line prints 'Live auctions' with no date");
ok(/: "Live auctions and completed sales\."/.test(src("home")), "home: with no readable date the line prints 'Live auctions and completed sales.' with no date");
ok(/"Completed sales" \+ \(updated \?/.test(src("mc")) && /"Auction data" \+ \(updated \?/.test(src("sell")), "mc and sell: with no readable date the line prints without one");

const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (!fs.existsSync(CHROME)) { console.log("SKIP browser part: no Chrome at " + CHROME); console.log(`homeTightenCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0); }
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const tops = {}, widths = {};
for (const [name, w, hgt] of [["desktop", 1440, 900], ["desktop tall", 1440, 1100], ["phone", 390, 844]]) {
  for (const [k, P] of Object.entries(PAGES)) {
    const page = await browser.newPage(); await page.setViewport({ width: w, height: hgt });
    await page.setContent(P.html.replace(/<script src="[^"]*"[^>]*><\/script>/g, ""), { waitUntil: "domcontentloaded" });
    await page.addStyleTag({ content: "*{animation:none!important}" });
    await new Promise(r => setTimeout(r, 300));
    const m = await page.evaluate(() => { const g = document.querySelector("[data-gst]"), box = g.querySelector(".gst-box"), b = box.getBoundingClientRect(), go = g.querySelector(".gst-go").getBoundingClientRect(), ph = g.querySelector(".gst-ph"), cs = getComputedStyle(box), inp = getComputedStyle(g.querySelector(".gst-in")), help = g.querySelector(".gst-help");
      return { top: Math.round(g.firstElementChild.getBoundingClientRect().top), boxH: b.height, boxW: Math.round(b.width), radius: cs.borderTopLeftRadius, goRight: b.right - go.right, goMid: (go.top + go.height / 2) - (b.top + b.height / 2), phText: ph && ph.textContent, phFont: ph && getComputedStyle(ph).fontSize, inFont: inp.fontSize, helpShown: !!help && getComputedStyle(help).display !== "none", noScroll: document.documentElement.scrollWidth <= window.innerWidth + 1 }; });
    const tag = `${k} ${name}`;
    ok(w > 700 ? m.boxH >= 68 && m.boxH <= 78 : m.boxH >= 60 && m.boxH <= 70, `${tag}: the box is one line, ${w > 700 ? "about 72" : "about 64"} px (${Math.round(m.boxH)})`);
    ok(Math.abs(m.goMid) < 2 && m.goRight > 8 && m.goRight < 30, `${tag}: the arrow sits at the right edge, centred (gap ${Math.round(m.goRight)}, off-centre ${Math.round(m.goMid)})`);
    ok(m.radius === (w > 700 ? "22px" : "18px"), `${tag}: the corner radius is kept (${m.radius})`);
    ok(m.phText === P.ex[0] && m.phFont === m.inFont, `${tag}: the example is at the normal input size (${m.phFont})`);
    ok(!m.helpShown, `${tag}: no helper line`);
    ok(m.noScroll, `${tag}: no horizontal scroll`);
    (tops[name] = tops[name] || {})[k] = m.top; (widths[name] = widths[name] || {})[k] = m.boxW;
    if (name === "desktop") {
      const real0 = await page.$eval(".gst-in", e => e.getAttribute("placeholder"));
      await page.focus(".gst-in");
      const vis1 = await page.$eval(".gst-ph", e => getComputedStyle(e).display);
      await page.keyboard.type("911");
      const vis2 = await page.$eval(".gst-ph", e => getComputedStyle(e).display);
      ok(real0 === " " && vis1 !== "none" && vis2 === "none", `${tag}: focused and empty the example stays, any text hides it, the real placeholder never changes`);
    }
    await page.close();
  }
}
for (const [name, t] of Object.entries(tops)) { const v = Object.values(t); ok(v.every(x => Math.abs(x - v[0]) <= 1), `${name}: the hero starts the same distance from the top on all four pages (${JSON.stringify(t)})`); }
for (const name of ["desktop", "phone"]) { const v = Object.values(widths[name]); ok(v.every(x => Math.abs(x - v[0]) <= 1), `${name}: the box is the same width on all four pages (${JSON.stringify(widths[name])})`); }
ok(tops.desktop.mc === 236 && tops.phone.mc === 108, "the hero start is Market Check's position before this change: 236 px on a desktop, 108 px on a phone");
// the rotation itself, one page with a short clock: it advances through the three and the real placeholder is untouched
for (const k of ["home", "mc"]) {
  const page = await browser.newPage(); await page.setViewport({ width: 1440, height: 900 });
  await page.setContent(PAGES[k].html.replace(/<script src="[^"]*"[^>]*><\/script>/g, "").replace(/5200\)/g, "300)"), { waitUntil: "domcontentloaded" });
  const texts = new Set(); let real = null;
  for (let n = 0; n < 40; n++) { await new Promise(r => setTimeout(r, 60)); const x = await page.evaluate(() => ({ ov: document.querySelector(".gst-ph").textContent, real: document.querySelector(".gst-in").getAttribute("placeholder") })); texts.add(x.ov); real = x.real; }
  ok(texts.size >= 2 && [...texts].every(t => PAGES[k].ex.includes(t)), `${k}: the example advances on its own through the three (${texts.size} seen)`);
  ok(real === " ", `${k}: the real placeholder (what a screen reader reads) never changed`);
  await page.close();
}
await browser.close();
console.log(`homeTightenCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
