// PLACEHOLDERS ON THE FOUR START PAGES (Sam, Oct 23 2026; Lane C). OFFLINE (always): each page's first HTML carries exactly the placeholder
// lib/startPlaceholders.js names, in clean copy (no dashes, no first person beyond Sam's ordered Sell line). LIVE (with PROBE_KEY and
// GAS_CREW_COOKIE or CREW in the environment; skips itself without them): every APPROVED placeholder is run through the engine and must
// give a populated result with no leftover-words line and no question; a "pending" entry is printed with its reason and never fails the run.
//   node scripts/placeholderCheck.mjs [--live]
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PLACEHOLDERS } from "../lib/startPlaceholders.js";
process.env.LAUNCH_STAGE = "2"; process.env.SELL_NEXT_ON = "1";
const ROOT = path.resolve(new URL("..", import.meta.url).pathname); process.chdir(ROOT);
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const render = async (mod, url) => { const { default: h } = await import(pathToFileURL(path.join(ROOT, "api", mod + ".js")).href);
  return await new Promise(r => { const res = { setHeader() {}, getHeader() {}, status() { return res; }, send(b) { r(String(b)); return res; }, end(b) { r(String(b || "")); return res; }, json(o) { r(JSON.stringify(o)); return res; } }; Promise.resolve(h({ method: "GET", url, query: {}, headers: { host: "goasksam.com", cookie: "" }, socket: {} }, res)).catch(() => r("")); setTimeout(() => r(""), 25000); }); };
const esc = s => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const pages = { home: await render("home", "/"), find: await render("buy", "/find"), mc: await render("marketCheck", "/market-check"), sell: await render("sellNext", "/api/sellNext") };
ok(PLACEHOLDERS.home.examples.every(x => pages.home.includes(esc(x)) || pages.home.includes(esc(x).replace(/'/g, "&#39;"))), "Home carries its examples");
for (const k of ["find", "mc", "sell"]) ok(PLACEHOLDERS[k].examples.every(x => pages[k].includes(esc(x)) || pages[k].includes(esc(x).replace(/'/g, "&#39;")) || pages[k].replace(/&amp;quot;/g, "&quot;").includes(esc(x))), `${k} carries its three examples (they rotate; the real placeholder stays blank for a screen reader)`);
for (const [k, v] of Object.entries(PLACEHOLDERS)) for (const t of (v.examples || [v.text])) ok(!/[–—]/.test(t) && !/collector/i.test(t), `${k}: "${t}" has no dash and no collector`);
const live = process.argv.includes("--live"), KEY = process.env.PROBE_KEY, CREW = process.env.CREW || process.env.GAS_CREW_COOKIE;
if (live && KEY && CREW) {
  const { createRequire } = await import("node:module"); const req = createRequire(path.join(ROOT, "package.json")); const puppeteer = (await import(pathToFileURL(req.resolve("puppeteer-core")).href)).default;
  const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
  const p = await b.newPage(); await p.setCookie({ name: "gas_crew", value: CREW, domain: "goasksam.com", path: "/" }); await p.setRequestInterception(true);
  p.on("request", r => { let own = false; try { own = new URL(r.url()).host === "goasksam.com"; } catch {} r.continue(own ? { headers: { ...r.headers(), "x-ops-key": KEY, "x-launch-stage-test": "2" } } : {}); });
  await p.goto("https://goasksam.com/find", { waitUntil: "domcontentloaded" });
  const find = q => p.evaluate(async q => { const r = await fetch("/api/buySearch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "chat", messages: [{ role: "user", content: q }], state: {}, turns: 0, anonId: "t" + Date.now() }) }); const t = await r.text(); const dd = t.slice(t.indexOf("event: done")); let j = null; try { j = JSON.parse(dd.slice(dd.indexOf("data:") + 5).trim().split("\n")[0]); } catch (e) {} const m = (j && j.meta) || {}; return { cards: ((j && j.cards) || []).length, unused: m.unusedLine || null, asks: (m.asks || []).length }; }, q);
  const mc = q => p.evaluate(async q => { const r = await fetch("/api/sellerDecision", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ oneBox: true, anonId: "t" + Date.now(), car: { raw: q }, asked: 0 }) }); const j = await r.json().catch(() => ({})); return { cards: j.tier === "result" ? Number(j.soldCount) || 1 : 0, unused: j.unusedLine || null, asks: /choice|question/.test(String(j.tier)) ? 1 : 0 }; }, q);
  for (const [k, v] of Object.entries(PLACEHOLDERS)) { if (!v.via) continue;
    for (const t of (v.examples || [v.text])) { if (/^Or paste a VIN$/i.test(t)) continue; const q = t.replace(/\.\.\.$/, ""); const r = await (v.via === "marketCheck" ? mc(q) : find(q)); const good = r.cards > 0 && !r.unused && r.asks === 0;
      if (v.pending) console.log(`PENDING ${k} "${t}": ${good ? "works" : JSON.stringify(r)} (${v.pending})`); else ok(good, `${k} "${t}" gives a populated result with no leftover words and no question (${JSON.stringify(r)})`); } }
  await b.close();
} else console.log(live ? "SKIP the live engine run: needs PROBE_KEY and the crew cookie" : "(offline only; --live runs the engine)");
console.log(`placeholderCheck: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
