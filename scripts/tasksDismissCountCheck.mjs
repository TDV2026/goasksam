// clock: real-ok every time is relative to one now read at the top (soon and ago hours), and the draft age is tested against that same clock, so the verdict does not change with the day (Lane G, Oct 29 2026)
// DISMISS AND COUNT CHECK (Lane D, Oct 29 2026): two bugs from Sam's live Tasks page, and the class behind each. Offline: the REAL page code (api/tasksPage.js) in headless Chrome
// at 1440 and 390 with /api/tasks answered by fixtures; no network, no site.
//   1. A control that dismisses something must make it go. "Never mind" on the limit card did nothing: the card is drawn from the server's atLimit, and the control only cleared a local
//      variable. Every dismiss, close, cancel, discard and "never mind" control found on the page in each state is clicked, and what it dismisses must be gone.
//   2. A count of cars must have a list the person can open. "21 close ones" and "select the card to read the note" counted near misses that are stored as a number only. Every count of
//      cars on a Task card is checked against the cars its opened card lists, and the banned phrases are looked for in the source of every surface.
// node scripts/tasksDismissCountCheck.mjs
import path from "node:path"; import { pathToFileURL, fileURLToPath } from "node:url";
import { reasonLine } from "../lib/reasonWords.js";
const CR = reasonLine("cold.reading"), CS = reasonLine("cold.still"), CM = reasonLine("cold.missed");   // the engine's own wording (lib/reasonWords.js), never a copy here
process.env.LAUNCH_STAGE = "2"; process.env.LAUNCH_BUSINESS = "1";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = process.argv.includes("--shots");
const puppeteer = (await import(pathToFileURL(path.join(ROOT, "node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js")).href).catch(() => import("puppeteer-core"))).default;
const { limitFacts } = await import(pathToFileURL(path.join(ROOT, "lib/tasks/limit.js")).href);
const { overviewFacts } = await import(pathToFileURL(path.join(ROOT, "lib/tasks/overview.js")).href);   // the count lines come from the server module, never the page
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL  " + m); } };
const now = Date.now(), soon = h => new Date(now + h * 3600e3).toISOString(), ago = h => new Date(now - h * 3600e3).toISOString();
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="432"><rect width="100%" height="100%" fill="#8ab"/></svg>`;
const card = (id, t, extra) => Object.assign({ id, title: t, make: "Porsche", url: "https://auction.test/" + id, source: "Bring a Trailer", sourceSlug: "bringatrailer", photo_url: "https://img.test/" + id + ".jpg", end_time: soon(14), reserve: "none", current_bid_usd: 40000 + id * 1000, bid_at: ago(0.4), miles: 30000 + id * 1000, location: "King of Prussia, PA", country: "US", chips: ["Manual", "Guards Red"], market: { kind: "range", low: 55000, high: 78000, count: 24, query: "1995 Porsche 911", basisLine: "Based on 24 sales, the latest in October 2026." }, sam_lines: [{ kind: "range", rung: [], placing: "below the range", text: "The middle half of 911 sales landed at $55,000 to $78,000 since December 2025. The bid is below the range." }], timeline: [], seen_before: { n: 0 }, history_url: null }, extra || {});
const CARDS = [card(1, "1995 Porsche 911 Carrera"), card(2, "1996 Porsche 911 Carrera 4"), card(3, "1994 Porsche 964 Carrera RS")];
const mkTask = (n, state = "running", extra = {}) => ({ id: "00000000-0000-4000-8000-00000000000" + n, state, kind: "hunt", summary: ["Sam is looking for red manual Porsche 911s.", "Sam is looking for G-body sedans.", "Sam is looking for a 1995 Land Rover Defender under $100,000.", "Sam is looking for Ford Mustangs."][n - 1], filters: {}, unread: 0, created_at: ago(5), updates: [{ id: 100 + n, role: "sam", kind: "system", created_at: ago(5), text: "Started. Sam checks every new listing and tells you when one matches." }, { id: 200 + n, role: "sam", kind: "match", created_at: ago(4.9), text: "x", data: { opening: true, total: 3, line: "3 live cars match.", cards: CARDS.map(c => ({ id: c.id, title: c.title, url: c.url })) } }], ...extra });

// A fake account: tasks mutate with the page's calls, the way the server would; counts and the limit come from the same limitFacts.
function account(tasks, opts = {}) {
  const A = { tasks, calls: [], notify: { on: true, email: "me@example.com", every: "daily", everyReady: true }, firstDelay: opts.firstDelay || 0, cardsDelay: opts.cardsDelay || 0, enrich: opts.enrich || (() => ({ cards: [] })) };
  A.working = () => A.tasks.filter(t => ["running", "needs_you"].includes(t.state)).length;
  A.list = () => ({  tasks: A.tasks.map(t => ({ ...t, overview: overviewFacts(t), updates: (t.updates || []).map(u => ({ ...u, task_id: t.id, data: u.data ? { ...u.data, full: undefined } : u.data })) })), count: A.tasks.filter(t => t.state !== "done").length, limit: limitFacts(A.working()), suggestions: [], notify: { ...A.notify, junk: !!A.junk } });
  A.blocked = () => { const w = A.tasks.filter(t => ["running", "needs_you"].includes(t.state)); return { blocked: { task_id: w[0].id, max: 3, line: limitFacts(w.length).line, tasks: w.map(t => ({ id: t.id, summary: t.summary })) } }; };
  A.handle = async b => {
    A.calls.push(b.action + (b.act ? ":" + b.act : "") + (b.event ? ":" + b.event : ""));
    if (b.action === "list") return b.draft ? { ...A.list(), draft_ok: !!b.draft.at && Date.now() - Date.parse(b.draft.at) < 864e5 } : A.list();
    if (b.action === "say" && !b.task_id && A.sayFn) return A.sayFn(b);
    if (b.action === "say" && !b.task_id) { if (A.working() >= 3) return A.blocked(); const w = String(b.text); return { draft: { words: w, kind: "hunt", filters: { make: "X" }, question: null, summary: "Sam is looking for " + w + ".", thread: [{ role: "sam", text: "Sam will look for " + w + ". Start?" }] }, reply: "Sam will look for " + w + ". Start?" }; }
    if (b.action === "start") { if (A.working() >= 3) return A.blocked(); const t = mkTask(A.tasks.length + 1, "running", { summary: b.draft.summary, updates: [{ id: 900 + A.tasks.length, role: "sam", kind: "system", created_at: new Date().toISOString(), text: "Started. Sam checks every new listing and tells you when one matches." }] }); A.tasks.unshift(t); A.newest = t; return { task: { ...t, starting: !!b.defer } }; }
    if (b.action === "first") { if (A.firstDelay) await new Promise(r => setTimeout(r, A.firstDelay)); const t = A.tasks.find(x => x.id === b.task_id); t.updates.push(mkTask(1).updates[1]); return { task: t, ran: true }; }
    if (b.action === "cards") { if (A.cardsDelay) await new Promise(r => setTimeout(r, A.cardsDelay)); const t = A.tasks.find(x => x.id === b.task_id); return { updates: (t.updates || []).filter(u => u.data && u.data.cards).map(u => ({ id: u.id, full: A.cardsOf ? A.cardsOf() : CARDS.map(c => ({ ...c })) })) }; }
    if (b.action === "control") { const t = A.tasks.find(x => x.id === b.task_id); if (b.act === "stop") t.state = "done"; else if (b.act === "pause") t.state = "paused"; else if (b.act === "resume") { if (A.working() >= 3) return { ...A.blocked(), task: t }; t.state = "running"; } return { task: t }; }
    if (b.action === "limit") { if (b.event === "stop") { const t = A.tasks.find(x => x.id === b.task_id); if (t) t.state = "done"; if (b.mode === "draft" && b.draft) { if (A.working() >= 3) return A.blocked(); const n = mkTask(A.tasks.length + 1, "running", { summary: b.draft.summary }); A.tasks.unshift(n); return { ok: true, task: { ...n, starting: true } }; } } return { ok: true }; }
    if (b.action === "looking") { if (!A.lookingRows) return { rows: [], counts: {} }; const W = A.lookingRows.filter(r => r.kind !== "alert").length, E = A.lookingRows.filter(r => r.kind === "alert").length; return { rows: A.lookingRows, counts: { tasks: { working: A.working(), max: 3 }, watches: { count: W, max: 25 }, alerts: { count: E, max: 25 }, total: A.working() + W + E, line: "Tasks " + A.working() + " of 3 (searches you describe). Watching " + W + " of 25 (cars you want to hear about when they sell). Before-it-ends emails " + E + " of 25 (one email about two hours before a bid ends)." } }; }
    if (b.action === "looking_stop") { A.lookingRows = (A.lookingRows || []).filter(r => r.ref !== b.ref); return { ok: true }; }
    if (b.action === "notify") { if (typeof b.on === "boolean") A.notify.on = b.on; if (b.every) A.notify.every = b.every; return A.notify; }
    return {};
  };
  return A;
}

const mod = async (f, url, q) => { const { default: h } = await import(pathToFileURL(path.join(ROOT, "api", f + ".js")).href); return await new Promise(r => { const res = { setHeader() {}, getHeader() {}, status() { return res; }, send(x) { r(String(x)); return res; }, end(x) { r(String(x || "")); return res; }, json(o) { r(JSON.stringify(o)); return res; }, writeHead() { return res; }, write() {} }; h({ method: "GET", url, query: q || {}, headers: { host: "goasksam.com", cookie: "gas_crew=x" }, socket: {} }, res); }); };
const tasksHtml = await mod("tasksPage", "/tasks/mine?app=1", { app: "1" });
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
async function open(A, width, search = "", signedOut = false, ssDraft = null) {
  const p = await b.newPage(); await p.setViewport({ width, height: 900 }); const errs = []; p.on("pageerror", e => errs.push(e.message.slice(0, 120))); p._errs = errs; p._A = A; if (ssDraft) await p.evaluateOnNewDocument(d => { if (!sessionStorage.getItem("__seeded")) { sessionStorage.setItem("__seeded", "1"); sessionStorage.setItem("gas_task_draft", JSON.stringify(d)); } }, ssDraft);
  if (signedOut) await p.evaluateOnNewDocument(() => localStorage.clear()); else await p.evaluateOnNewDocument(() => localStorage.setItem("gas_auth_session", JSON.stringify({ access_token: "tok", expires_at: 9999999999 }))); await p.setRequestInterception(true);
  p.on("request", async r => { const u = new URL(r.url());
    if (u.host === "goasksam.com" && r.isNavigationRequest() && u.pathname === "/tasks") return r.respond({ status: 200, contentType: "text/html", body: "<html><body>explainer</body></html>" });
    if (u.host === "goasksam.com" && r.isNavigationRequest()) return r.respond({ status: 200, contentType: "text/html", body: tasksHtml });
    if (u.host === "img.test") return r.respond({ status: 200, contentType: "image/svg+xml", body: svg });
    if (u.host === "goasksam.com" && u.pathname === "/api/tasks") { let body = {}; try { body = JSON.parse(r.postData() || "{}"); } catch {} if (r.method() === "GET") return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ signedIn: true, count: A.tasks.filter(t => t.state !== "done").length, limit: limitFacts(A.working()) }) }); const out = await A.handle(body); return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(out) }); }
    if (u.host === "goasksam.com" && u.pathname === "/api/buySearch") { let body = {}; try { body = JSON.parse(r.postData() || "{}"); } catch {} A.enrichCalls = (A.enrichCalls || 0) + 1; return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(A.enrich(body, A.enrichCalls)) }); }
    if (u.host === "goasksam.com" && /^\/(api|js)/.test(u.pathname)) return r.respond({ status: 200, contentType: /\.js$/.test(u.pathname) ? "application/javascript" : "application/json", body: /\.js$/.test(u.pathname) ? "" : "{}" });
    if (u.host !== "goasksam.com") return r.respond({ status: 204, body: "" }); r.continue(); });
  await p.goto("https://goasksam.com/tasks/mine?app=1" + search, { waitUntil: "networkidle2" }).catch(() => {}); await new Promise(r => setTimeout(r, 900)); return p;
}
const openTask = async (p, n = 1) => { await p.click(`#task-00000000-0000-4000-8000-00000000000${n} [data-toggle]`); await wait(900); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const text = p => p.evaluate(() => document.getElementById("tkapp").innerText);
const badge = p => p.evaluate(() => { const b = document.querySelector("[data-gas-tasks-badge],[data-tasks-badge]"); return b && !b.hidden ? b.textContent : ""; });
const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: path.join(ROOT, "proofs/tasks3", name + ".png"), fullPage: true }); };
import fs from "node:fs";
import * as ovMod from "../lib/tasks/overview.js";
const withoutRestCount = ovMod.withoutRestCount || (t => t);
import { statusLine } from "../lib/tasks/tasks.js";
const NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const countsIn = s => [...String(s).matchAll(/\b(\d[\d,]*|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:live\s+|new\s+|other\s+|close\s+|more\s+)*(cars?|ones?|listings?|matches)\b/gi)].map(m => ({ n: NUM[m[1].toLowerCase()] || Number(m[1].replace(/,/g, "")), phrase: m[0] }));
const gone = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); return !e || e.hidden || getComputedStyle(e).display === "none" || e.getBoundingClientRect().height === 0; }, sel);

// ---- A. static: no count without a list, in the source of every surface
{
  const files = ["api/tasksPage.js", "lib/tasks/overview.js", "lib/tasks/tasks.js", "lib/tasks/digest.js", "lib/tasks/emailCaps.js", "lib/tasks/fullCards.js", "lib/live/watches.js", "lib/appShell.js", "api/buy.js", "public/js/onebox.js"];
  const BAN = [/close ones?\b/i, /select the card to read the note/i, /other cars? match(?:es)? the rest/i];
  const hits = [];
  for (const f of files) {
    const s = fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");
    for (const [i, line] of s.split("\n").entries()) { if (/^\s*\/\//.test(line) || /withoutRestCount/.test(line)) continue; for (const re of BAN) if (re.test(line)) hits.push(f + ":" + (i + 1)); }
  }
  ok(hits.length === 0, "no user-facing 'close ones', 'read the note' or 'other cars match the rest' in any surface source: " + hits.join(", "));
  ok(!/match the rest/.test(statusLine({ colour: "red" }, "colour", 21)) && /^Nothing red yet\./.test(statusLine({ colour: "red" }, "colour", 21)), "the status line names the unmet part and prints no count of near misses");
  ok(withoutRestCount("Nothing red yet. 21 other cars match the rest.") === "Nothing red yet. Sam is watching." && withoutRestCount("Nothing red yet. One other car matches the rest.") === "Nothing red yet. Sam is watching." && withoutRestCount("Two live cars match.") === "Two live cars match.", "an older stored status line loses its near-miss count when read");
  // Find: a line that counts cars it is not showing carries the control that shows them
  const cl = fs.readFileSync(new URL("../api/buy.js", import.meta.url), "utf8").match(/const CLIENT = ("(?:[^"\\]|\\.)*");/);
  const js = JSON.parse(cl[1]); const bare = [];
  for (const m of js.matchAll(/class="unst">/g)) { const seg = js.slice(m.index, m.index + 700); if (!/<button|<a /.test(seg)) bare.push(m.index); }
  ok(bare.length === 0 && /class="unst"/.test(js), "Find: every 'N more ...' line that counts cars not shown carries the control that shows them");
}

// ---- A2. static: the dismiss controls on pages this check cannot drive offline (Find needs the live parse, Sell and Market Check need the engine): every control rendered has a handler that closes what it belongs to
{
  const js = JSON.parse(fs.readFileSync(new URL("../api/buy.js", import.meta.url), "utf8").match(/const CLIENT = ("(?:[^"\\]|\\.)*");/)[1]);
  const rendered = [...new Set([...js.matchAll(/data-(close|mcclose|hpclose)\b/g)].map(m => m[1]))];
  ok(rendered.length === 3, "Find renders three close controls: " + rendered.join(","));
  ok(/hasAttribute\("data-close"\)\) \{ \$\("detail"\)\.hidden = true/.test(js), "Find: the notes X hides the notes overlay");
  ok(/hasAttribute\("data-mcclose"\)\) return closeOverlays\(\)/.test(js) && /closest\("\[data-hpclose\]"\)\) \{ e\.preventDefault\(\); return closeOverlays\(\)/.test(js), "Find: the sales X and the prior-year X and scrim close their popovers");
  ok(/e\.key === "Escape"[\s\S]{0,200}closeOverlays\(\)/.test(js), "Find: Escape closes the open popovers");
  const co = js.match(/function closeOverlays\(except\)\{[\s\S]*?\n  \}/)[0]; ok(/\.mcdrawer/.test(co) && /\.hpop,\.hscrim/.test(co), "Find: closeOverlays removes the sales drawer, the popover and its scrim");
  const rs = fs.readFileSync(new URL("../public/js/result.js", import.meta.url), "utf8"); ok(/function closeMethodologyModal\(\)\{\s*const m=document\.getElementById\("methodology-modal"\);if\(m&&m\.remove\)m\.remove\(\)/.test(rs), "Sell: the methodology X removes the modal");
  const cb = fs.readFileSync(new URL("../lib/consentBanner.js", import.meta.url), "utf8"); ok(/function setConsent\(v\)\{[\s\S]*?hideBanner\(\);/.test(cb), "Consent banner: accept and decline hide the banner");
  const au = fs.readFileSync(new URL("../public/js/auth.js", import.meta.url), "utf8"); ok(/function authCloseModal\(\) \{ const m = document\.getElementById\("auth-modal"\); if \(m && m\.remove\) m\.remove\(\)/.test(au), "Sign-in card: close removes the modal");
}

try {
  for (const W of [1440, 390]) {
    const resident = () => account([mkTask(1), mkTask(2), mkTask(3)]);
    // ---- B. the limit card
    { const A = resident(); const p = await open(A, W); await wait(700);
      ok(!!(await p.$(".limitbox")), `[${W}] 3 of 3: the limit card shows`);
      await p.click("[data-limit-keep]"); await wait(400);
      ok(await gone(p, ".limitbox"), `[${W}] Never mind closes the limit card`); ok(!!(await p.$("#tkq")) && (await badge(p)) === "3", `[${W}] after Never mind: the page is usable (box back), badge still 3`);
      await p.type("#tkq", "find me a Mustang"); await p.keyboard.press("Enter"); await wait(800);
      ok(!!(await p.$(".limitbox")), `[${W}] a new attempt at the limit opens the card again`);
      await p.click("[data-limit-keep]"); await wait(400); ok(await gone(p, ".limitbox"), `[${W}] and Never mind closes it a second time`); ok(p._errs.length === 0, `[${W}] no page errors ${JSON.stringify(p._errs)}`); await p.close(); }
    { const A = resident(); const p = await open(A, W); await wait(700); await p.keyboard.press("Escape"); await wait(300);
      ok(await gone(p, ".limitbox"), `[${W}] Escape closes the limit card`); await p.close(); }
    { const A = resident(); const p = await open(A, W, "&seed=typed&words=find%20me%20a%20Mustang"); await wait(700);
      ok(!!(await p.$(".limitbox")), `[${W}] arriving with a new job at the limit: the card shows`);
      await p.click("[data-limit-keep]"); await wait(500);
      ok(await gone(p, ".limitbox") && !/seed=/.test(p.url()) && A.calls.includes("limit:keep"), `[${W}] seed: Never mind closes it, drops the seed from the address and tells the server (${p.url().slice(-40)})`); await p.close(); }
    { const A = resident(); const p = await open(A, W, "&seed=typed&words=find%20me%20a%20Mustang"); await wait(700); await p.keyboard.press("Escape"); await wait(400);
      ok(await gone(p, ".limitbox"), `[${W}] seed: Escape closes the card`); await p.close(); }
    { const A = resident(); const p = await open(A, W, "&seed=typed&words=find%20me%20a%20Mustang"); await wait(700);
      await p.click(".limitbox .lrow:nth-of-type(2) button"); await wait(1200);
      ok(await gone(p, ".limitbox") && A.working() === 2, `[${W}] Stop and start this one: that Task is stopped (2 working) and the card is closed`);
      await p.click("[data-start]"); await wait(1000); const t = await text(p);
      ok(A.working() === 3 && (await badge(p)) === "3" && A.tasks.length === 4, `[${W}] ...and the new Task is started: 3 working, badge 3 (${await badge(p)})`);
      ok(!/Stopping|Sam will look for/.test(t), `[${W}] ...and no half-finished line is left`); await p.close(); }
    // ---- C. the sweep: every dismiss-type control on the page, in each state
    const DISMISS = /^(never mind|discard|close|cancel|dismiss|not now|no thanks|hide cars|hide|×|x)$/i;
    const states = [
      ["limit card", () => account([mkTask(1), mkTask(2), mkTask(3)]), "", null, ""],
      ["limit card with a new job", () => account([mkTask(1), mkTask(2), mkTask(3)]), "&seed=typed&words=g%20body%20sedans", null, ""],
      ["unfinished draft", () => account([]), "", { words: "red porsche", summary: "Sam is looking for red porsche.", at: new Date().toISOString(), question: null, filters: { make: "Porsche" }, kind: "hunt" }, ""],
      ["an opened Task", () => account([mkTask(1)]), "", null, "open"],
    ];
    for (const [name, mk, q, draft, pre] of states) {
      const probe = await open(mk(), W, q, false, draft); await wait(600);
      if (pre === "open") { await openTask(probe, 1); }
      const found = await probe.evaluate(re => { const rx = new RegExp(re, "i"); return [...document.querySelectorAll("#tkapp button, #tkapp a, #tkapp [role=button]")].filter(e => rx.test((e.innerText || e.getAttribute("aria-label") || "").trim()) && e.getBoundingClientRect().height > 0).map(e => (e.innerText || e.getAttribute("aria-label")).trim()); }, DISMISS.source);
      await probe.close();
      ok(true, `[${W}] sweep: ${name}: dismiss controls found: ${JSON.stringify(found)}`);
      for (let i = 0; i < found.length; i++) {
        const p = await open(mk(), W, q, false, draft); await wait(600); if (pre === "open") await openTask(p, 1);
        const before = await p.evaluate(() => document.getElementById("tkapp").innerHTML.length);
        const key = await p.evaluate((re, i) => { const rx = new RegExp(re, "i"); const e = [...document.querySelectorAll("#tkapp button, #tkapp a, #tkapp [role=button]")].filter(e => rx.test((e.innerText || e.getAttribute("aria-label") || "").trim()) && e.getBoundingClientRect().height > 0)[i]; const box = e.closest(".limitbox,.unfin,.tc,section,article") || e.parentElement; const probeId = "dz" + Math.random().toString(36).slice(2, 7); box.setAttribute("data-dz", probeId); e.click(); return probeId; }, DISMISS.source, i);
        await wait(500);
        const still = await p.evaluate(k => { const e = document.querySelector('[data-dz="' + k + '"]'); return !!e && e.getBoundingClientRect().height > 0 && getComputedStyle(e).display !== "none" && !(e.classList.contains("tc") && !e.classList.contains("open")); }, key);
        ok(!still, `[${W}] sweep: ${name}: "${found[i]}" dismisses what it belongs to`); await p.close();
      }
    }
    // ---- D. counts of cars have a list behind them
    { const loose = [{ id: 801, role: "sam", kind: "match", text: "Nothing red yet. Sam is watching.", created_at: ago(2), data: { opening: true, total: 0, loose: { count: 21, dropped: "colour" } } }];
      const A = account([mkTask(1, "running", { summary: "Sam is looking for red BMWs with under 50,000 miles.", updates: loose })]); const p = await open(A, W); await wait(700);
      let t = await text(p); ok(!/close one|read the note|other cars? match/i.test(t), `[${W}] a Task with only near misses: no 'close ones', no 'read the note' (${(t.match(/No live cars[^\n]*/) || [""])[0]})`);
      ok(countsIn((t.match(/No live cars[^\n]*/) || [""])[0]).length === 0, `[${W}] ...and no count of cars the card cannot show`);
      await openTask(p, 1); t = await text(p); ok(!/close one|read the note|other cars? match/i.test(t), `[${W}] ...nor once opened`); await p.close(); }
    { const A = account([mkTask(1), mkTask(2)]); const p = await open(A, W); await wait(700);
      for (const id of [1, 2]) {
        const line = await p.evaluate(i => { const c = document.querySelector("#task-00000000-0000-4000-8000-00000000000" + i + " .tcount"); return c ? c.innerText : ""; }, id);
        const counts = countsIn(line).filter(c => /car/i.test(c.phrase));
        await p.click(`#task-00000000-0000-4000-8000-00000000000${id} [data-toggle]`); await wait(900);
        const shown = await p.evaluate(i => document.querySelectorAll("#task-00000000-0000-4000-8000-00000000000" + i + " article.car, #detail-00000000-0000-4000-8000-00000000000" + i + " article.car").length, id);
        ok(counts.every(c => shown >= c.n), `[${W}] Task ${id}: "${line.replace(/\n/g, " ")}" counts ${JSON.stringify(counts.map(c => c.n))} cars and the opened card lists ${shown}`);
        await p.click(`#task-00000000-0000-4000-8000-00000000000${id} [data-toggle]`); await wait(300);
      }
      await p.close(); }
  }
} finally { await b.close(); }
console.log(`tasksDismissCountCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
