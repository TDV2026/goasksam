// THE LIVE RENDER CHECK OF THE CREW PREVIEWS (Lane E, Nov 8 2026; Lane C's standing order: after every crew preview deploy, /preview/find and /preview/tasks are loaded live with the crew cookie in a real browser and a missing section is a RED, not a pass).
// CAUSE it guards: a94djqku4 served both previews with a 200, no console error and no section (the engine reads failed silently), so nothing looked broken. CLASS: every engine fed section on every crew preview: it must be on the page, drawn, and told apart from "the engine sent nothing" and "the read failed".
//   node scripts/livePreviewCheck.mjs                              OFFLINE: the assertions run on pages the real handler renders from fixtures; a good render passes, and the a94djqku4 renders (no sections) and a failed read each fail them (the proof the check goes red)
//   GAS_CREW_COOKIE='gas_crew=v1....' node scripts/livePreviewCheck.mjs --live [BASE]     LIVE (default https://goasksam.com): loads both previews with the crew cookie in Chrome and asserts the same, plus the 404 without the cookie
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const ROOT = path.resolve(new URL("..", import.meta.url).pathname); process.chdir(ROOT);
const puppeteer = createRequire(path.join(ROOT, "package.json"))("puppeteer-core");
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const args = process.argv.slice(2), LIVE = args.includes("--live"), BASE = (args.find(a => /^https?:\/\//.test(a)) || "https://goasksam.com").replace(/\/$/, "");
let pass = 0, fail = 0; const out = []; const ok = (c, m) => { if (c) pass++; else { fail++; out.push("FAIL " + m); } };
// what a page must show: the markers Lane C names (data-find-examples with 3 cards, data-task-email visible, the car and task words), drawn, with no failure line
const FIND_PROBE = () => { const q = s => document.querySelector(s), cards = [...document.querySelectorAll("#fx-grid .lc")], f = q("footer.ft"), imgs = cards.map(c => c.querySelector("img"));
  return { marker: q("[data-find-examples]") ? q("[data-find-examples]").getAttribute("data-find-examples") : null, cards: cards.length, titles: cards.map(c => (c.querySelector(".lc-t") || {}).textContent || ""), plats: cards.map(c => (c.querySelector(".lc-p") || {}).textContent || ""), links: cards.map(c => (c.querySelector(".lc-l") || {}).textContent || ""), hrefs: cards.map(c => c.getAttribute("href") || ""), shown: cards.every(c => c.getBoundingClientRect().height > 100), imgsDone: imgs.every(i => i && i.complete && i.naturalWidth > 0),
    heading: (q(".fx-h") || {}).textContent || "", failure: !!q("[data-could-not-read]"), hs: document.documentElement.scrollWidth > innerWidth + 1, gap: cards.length && f ? Math.round(f.getBoundingClientRect().top + scrollY - (Math.max(...cards.map(c => c.getBoundingClientRect().bottom)) + scrollY)) : null, pinned: document.documentElement.scrollHeight <= innerHeight + 1 }; };
const TASKS_PROBE = () => { const q = s => document.querySelector(s), fr = q(".em-frame"), r = fr ? fr.getBoundingClientRect() : null, t = fr ? fr.innerText.replace(/\s+/g, " ") : "";
  return { marker: !!q("[data-task-email]"), shown: !!r && r.width > 200 && r.height > 200, text: t, img: !!(fr && fr.querySelector("img")), links: fr ? [...fr.querySelectorAll("a")].map(a => a.textContent.trim()) : [], failure: !!q("[data-could-not-read]"), hs: document.documentElement.scrollWidth > innerWidth + 1, h: r ? Math.round(r.height) : 0 }; };
export function findings(find, tasks) {
  const bad = [];
  if (find.failure) bad.push("find: the page says the read failed"); if (find.marker !== "3" || find.cards !== 3) bad.push(`find: the section is missing or short (data-find-examples=${find.marker}, ${find.cards} cards)`);
  if (find.cards === 3) { if (!find.shown) bad.push("find: the cards are not drawn"); if (!find.imgsDone) bad.push("find: a photo did not load"); if (find.titles.some(t => t.trim().length < 6) || find.plats.some(t => !t.trim())) bad.push("find: a card has no title or platform"); if (!find.links.every(l => /^(Explore this car|Sold before · See its history) ↗$/.test(l.trim()))) bad.push(`find: a card's link line is wrong (${find.links.join(" | ")})`); if (!find.hrefs.every(h => /^\/find\?/.test(h))) bad.push("find: a card is not a link to a Find result"); if (!/currently at auction/.test(find.heading)) bad.push("find: the section heading is missing"); }
  if (find.hs) bad.push("find: sideways scroll");
  if (tasks.failure) bad.push("tasks: the page says the read failed"); if (!tasks.marker) bad.push("tasks: the email section is missing (no data-task-email)");
  if (tasks.marker) { if (!tasks.shown) bad.push("tasks: the email is not visible"); if (!/new since your last email/i.test(tasks.text)) bad.push("tasks: no \"New since your last email\""); if (!/Matches your Task:/.test(tasks.text)) bad.push("tasks: no \"Matches your Task:\" line"); if (!tasks.img) bad.push("tasks: no photo in the email"); if (!tasks.links.some(l => /View auction/.test(l)) || !tasks.links.some(l => /Market Check/.test(l))) bad.push("tasks: the View auction and Market Check buttons are missing"); }
  if (tasks.hs) bad.push("tasks: sideways scroll");
  return bad;
}
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const IMG = '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="100%" height="100%" fill="#8aa3b8"/></svg>';
async function probe(openFn, w) { const p = await b.newPage(); await p.setViewport({ width: w, height: 900 }); await openFn(p); await new Promise(r => setTimeout(r, 700)); const find = { ...(await p.evaluate(FIND_PROBE)) }; return { p, find }; }
async function render(findUrlOrHtml, tasksUrlOrHtml, w, mode) {
  const load = async (p, what) => { if (mode === "html") { await p.setRequestInterception(true); p.on("request", r => r.resourceType() === "image" ? r.respond({ status: 200, contentType: "image/svg+xml", body: IMG }) : r.isNavigationRequest() ? r.respond({ status: 200, contentType: "text/html", body: what }) : r.respond({ status: 204, body: "" })); await p.goto("https://goasksam.com/x", { waitUntil: "load" }); } else { if (process.env.GAS_CREW_COOKIE) { const [k, ...v] = process.env.GAS_CREW_COOKIE.split("="); await p.setCookie({ name: k, value: v.join("="), url: BASE }); } await p.goto(what, { waitUntil: "networkidle2" }); } };
  const pf = await b.newPage(); await pf.setViewport({ width: w, height: 900 }); await load(pf, findUrlOrHtml); await new Promise(r => setTimeout(r, 600)); const find = await pf.evaluate(FIND_PROBE); await pf.close();
  const pt = await b.newPage(); await pt.setViewport({ width: w, height: 900 }); await load(pt, tasksUrlOrHtml); await new Promise(r => setTimeout(r, 600)); const tasks = await pt.evaluate(TASKS_PROBE); await pt.close();
  return findings(find, tasks).concat(find.gap != null && w >= 1440 && !find.pinned && !(find.gap >= 20 && find.gap <= 90) ? [`find: the footer is ${find.gap}px under the cards (it should sit within 90px)`] : []);
}
if (LIVE) {
  if (!process.env.GAS_CREW_COOKIE) { console.log("FAIL set GAS_CREW_COOKIE to the signed crew cookie (gas_crew=v1....) to run the live check"); process.exit(1); }
  for (const w of [1440, 390]) { const bad = await render(BASE + "/preview/find", BASE + "/preview/tasks", w, "url"); ok(bad.length === 0, `live ${BASE} @${w}: both previews render their sections with the crew cookie: ${bad.join("; ") || "ok"}`); }
  const r1 = await fetch(BASE + "/preview/find", { redirect: "manual" }), r2 = await fetch(BASE + "/preview/tasks", { redirect: "manual" }); ok(r1.status === 404 && r2.status === 404, `live: both previews answer 404 without the crew cookie (${r1.status}, ${r2.status})`);
} else {
  process.env.CURTAIN_CREW_CODE = "fixture-crew-code"; process.env.LAUNCH_STAGE = "2"; for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY"]) delete process.env[k];
  const imp = (f, q = "") => import(pathToFileURL(path.join(ROOT, f)).href + q), { mintCrewCookieValue } = await imp("lib/_crew.js"), EX = await imp("scripts/findExamplesFixture.mjs"), FX = await imp("scripts/tasksFixture.mjs");
  async function call(handler, url) { const res = { h: {}, code: 200, body: "", setHeader(k, v) { this.h[k.toLowerCase()] = v; return this; }, getHeader(k) { return this.h[k.toLowerCase()]; }, removeHeader() {}, status(c) { this.code = c; return this; }, send(x) { this.body = String(x); return this; }, end(x) { this.body = String(x || ""); return this; }, json(o) { this.body = JSON.stringify(o); return this; } };
    const u = new URL(url, "https://goasksam.com"); await handler({ method: "GET", url, query: Object.fromEntries(u.searchParams), headers: { cookie: "gas_crew=" + mintCrewCookieValue() }, body: null }, res); return res.body; }
  const examples = () => EX.examplesFixture().map((i, k) => { const c = { ...i.card, photo_url: "https://example.test/p" + k + ".jpg" }; if (k === 0) { c.timeline = [{ date: "2023-05-02", result: "sold", price: 21000, miles: 140000, house: "Bring a Trailer", url: null }]; c.seen_before = { n: 1 }; c.history_url = "/vin/ABC"; } return { card: c }; });
  async function pages(set) { const m = await imp("api/crewPage.js", "?v=" + Math.random()); const rd = v => async () => { if (v instanceof Error) throw v; return v === undefined ? null : v; }; m.FIND_EXAMPLES.read = rd(set.find); m.FIND_EXAMPLES.now = () => EX.NOW; m.TASKS_EMAIL_EXAMPLE.read = rd(set.email); return { f: await call(m.default, "/api/crewPage?page=preview-find"), t: await call(m.default, "/api/crewPage?page=preview-tasks") }; }
  const realErr = console.error; console.error = () => {};
  const good = await pages({ find: examples(), email: FX.tasksEmailFixture() }), blank = await pages({}), failed = await pages({ find: new Error("boom"), email: new Error("boom") });
  console.error = realErr;
  for (const w of [1440, 390]) { const bad = await render(good.f, good.t, w, "html"); ok(bad.length === 0, `a good render @${w} (three Find cards with their photos, the email with its words and buttons, no failure line, the footer under the cards): ${bad.join("; ") || "ok"}`); }
  const rb = await render(blank.f, blank.t, 1440, "html"); ok(rb.length >= 2 && rb.some(x => /find: the section is missing/.test(x)) && rb.some(x => /tasks: the email section is missing/.test(x)), `the a94djqku4 render (a 200 with no sections) is RED: ${rb.slice(0, 2).join("; ")}`);
  const rf = await render(failed.f, failed.t, 1440, "html"); ok(rf.some(x => /the page says the read failed/.test(x)) && rf.length >= 4, `a failed read is RED and says so: ${rf.slice(0, 2).join("; ")}`);
  const short = await render(good.f.replace(/"findUrl":"[^"]*"/g, '"findUrl":"/nowhere"'), good.t, 1440, "html"); ok(short.some(x => /not a link to a Find result/.test(x)), `a card that does not link to Find is RED: ${short[0] || "NOT CAUGHT"}`);
  const hid = await render(good.f, good.t.replace(".em-frame{max-width:540px;", ".em-frame{display:none;max-width:540px;"), 1440, "html"); ok(hid.some(x => /the email is not visible/.test(x)), `an email that is in the page but not visible is RED: ${hid[0] || "NOT CAUGHT"}`);
}
await b.close();
console.log(out.join("\n")); console.log(`livePreviewCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
