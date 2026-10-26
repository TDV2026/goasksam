// THE HEADER SCROLLS WITH THE PAGE, AND FIND STARTS OVER (Lane C, Oct 26 2026). Real browser at 1440x900 and 390x844 on the pages being pushed (rendered in
// this process); what the pages call (the Find search) goes to goasksam.com with the probe credential. Reads only.
//  1. the signed-in header (the top right pill) is never position:fixed, and after the page scrolls it has moved with the content, on every shell page;
//  2. Find: a "New search" link at the top right of the results clears the results and the box, returns to the start page and focuses the box;
//     the rail's Find item does the same while results show; the bottom box reads "Search another car, or tell Sam what to change." (phones: "Search another car").
// No PROBE_KEY: SKIP.   node scripts/shellHeaderFindCheck.mjs
import path from "node:path";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";
process.env.LAUNCH_STAGE = "2";
const KEY = process.env.PROBE_KEY || "", BYPASS = process.env.VERCEL_BYPASS || "";
if (!KEY) { console.log("shellHeaderFindCheck: SKIP (no PROBE_KEY)"); process.exit(0); }
const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const render = async (mod, url, query = {}) => { const { default: h } = await import(pathToFileURL(path.join(ROOT, "api", mod + ".js")).href);
  return await new Promise(resolve => { const res = { setHeader() {}, getHeader() {}, status() { return res; }, send(b) { resolve(String(b)); return res; }, end(b) { resolve(String(b || "")); return res; }, json(o) { resolve(JSON.stringify(o)); return res; }, writeHead() { return res; }, write() {} };
    Promise.resolve(h({ method: "GET", url, query, headers: { host: "goasksam.com", cookie: "" }, socket: {} }, res)).catch(() => resolve("")); setTimeout(() => resolve(""), 20000); }); };
const PAGES = [["buy", "/find"], ["tasksPage", "/tasks"], ["marketCheck", "/market-check"], ["about", "/about"], ["feedback", "/feedback"], ["legal", "/privacy", { page: "privacy" }], ["home", "/"]];
const html = {}; for (const [mod, url, q] of PAGES) html[url] = await render(mod, url, q || {});
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
async function open(W, H, url) {
  const p = await b.newPage(); await p.setViewport({ width: W, height: H });
  await p.setRequestInterception(true);
  p.on("request", r => { const u = r.url(); const path0 = u.replace("https://goasksam.com", "").split("?")[0];
    if (r.resourceType() === "document" && u.startsWith("https://goasksam.com") && html[path0.replace(/\/$/, "") || "/"]) return r.respond({ status: 200, contentType: "text/html; charset=utf-8", body: html[path0.replace(/\/$/, "") || "/"] });
    if (u.startsWith("https://goasksam.com/")) return r.continue({ headers: { ...r.headers(), "x-ops-key": KEY, "x-launch-stage-test": "2", ...(BYPASS ? { "x-vercel-protection-bypass": BYPASS } : {}) } });
    return r.continue(); });
  await p.goto("https://goasksam.com" + url, { waitUntil: "networkidle2", timeout: 60000 }).catch(() => {});
  await sleep(1200); return p;
}
const pillOf = () => { const vis = e => e && getComputedStyle(e).display !== "none" && e.getBoundingClientRect().width > 0; const d = document.querySelector(".gas-signbar"), m = document.querySelector(".gas-signbar-m"); const e = vis(d) ? d : vis(m) ? m : null; return e ? { pos: getComputedStyle(e).position, top: e.getBoundingClientRect().top } : null; };
for (const [W, H] of [[1440, 900], [390, 844]]) {
  const tag = `${W}x${H}`;
  // 1. every shell page: not fixed, and it moves when the page scrolls
  for (const [, url] of PAGES) {
    const p = await open(W, H, url);
    const before = await p.evaluate(pillOf);
    ok(before && before.pos !== "fixed" && before.pos !== "sticky", `${tag} ${url}: the header is not fixed or sticky (${before && before.pos})`);
    const moved = await p.evaluate(() => { const sc = document.getElementById("scroll") || document.scrollingElement; const was = sc.scrollTop; sc.scrollTop = was + 400; return { by: sc.scrollTop - was, can: sc.scrollHeight > sc.clientHeight + 40 }; });
    if (moved.by > 50) { const after = await p.evaluate(pillOf); ok(after && after.top < before.top - moved.by * 0.8, `${tag} ${url}: after the page scrolled ${moved.by}px the header moved up with it (${before.top} to ${after && after.top})`); }
    await p.close();
  }
  // 2. Find
  const p = await open(W, H, "/find");
  const ph0 = await p.evaluate(() => (document.getElementById("q") || {}).placeholder);
  await p.evaluate(() => document.getElementById("hq").focus()); await p.keyboard.type("red manual porsche 911", { delay: 5 }); await p.keyboard.press("Enter");
  await p.waitForSelector(".msg.results .shead", { timeout: 60000 }).catch(() => {}); await sleep(1500);
  const R = await p.evaluate(() => { const res = document.querySelector(".msg.results"), n = res && res.querySelector(".shead-new"); const rr = res && res.getBoundingClientRect(), nr = n && n.getBoundingClientRect(); const q = document.getElementById("q");
    return { has: !!res, link: !!n, text: n && n.textContent.trim(), right: nr && rr ? Math.round(rr.right - nr.right) : null, top: nr && rr ? Math.round(nr.top - rr.top) : null, ph: q && q.placeholder }; });
  ok(R.has, `${tag} Find: a search draws results`);
  ok(R.link && R.text === "New search", `${tag} Find: the results carry a New search link (${R.text})`);
  ok(R.right != null && R.right >= 0 && R.right < 60 && R.top < 60, `${tag} Find: the link sits at the top right of the results (${R.right}px from the right, ${R.top}px from the top)`);
  ok(W > 520 ? R.ph === "Search another car, or tell Sam what to change." : R.ph === "Search another car", `${tag} Find: the bottom box reads the new line (${R.ph})`);
  const start = () => p.evaluate(() => ({ results: !!document.querySelector(".msg.results"), lead: !!document.getElementById("lead"), q: (document.getElementById("q") || {}).value, hq: (document.getElementById("hq") || {}).value, focus: document.activeElement && document.activeElement.id, path: location.pathname + location.search }));
  await p.evaluate(() => { const n = document.querySelector(".shead-new"); if (n) n.click(); }); await sleep(600);
  let S = await start();
  ok(!S.results && S.lead && S.q === "" && S.hq === "" && S.focus === "hq" && S.path === "/find", `${tag} Find: New search clears the results and the box, shows the start page and focuses the box (${JSON.stringify(S)})`);
  // the rail's Find item, with results showing (phones: the rail opens from the menu; the link is clicked in the page all the same)
  await p.evaluate(() => document.getElementById("hq").focus()); await p.keyboard.type("red manual porsche 911", { delay: 5 }); await p.keyboard.press("Enter");
  await p.waitForSelector(".msg.results .shead", { timeout: 60000 }).catch(() => {}); await sleep(1500);
  await p.evaluate(() => { const n = document.querySelector('#gas-rail a.gas-navitem[href="/find"]'); if (n) n.click(); }); await sleep(600);
  S = await start();
  ok(!S.results && S.lead && S.q === "" && S.hq === "" && S.focus === "hq" && S.path === "/find", `${tag} Find: the rail's Find item does the same while results show (${JSON.stringify(S)})`);
  await p.close();
}
await b.close();
console.log(`shellHeaderFindCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
