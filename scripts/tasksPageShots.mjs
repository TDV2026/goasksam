// TASKS PAGE, RENDERED (Lane D, Oct 2026): the REAL page code (api/tasksPage.js) in headless Chrome with /api/tasks and /api/buySearch
// answered by fixtures, so the page's own flow is exercised without a network: 0, 1, 2 and 3 Tasks, the limit card, the starting state,
// the close-and-start flow, the badge after each, the stale-notice case, the "still reading" holding line, and the layout at 1440 and 390
// (no overlap of the email toggle and How often; no clipped badge on a card).  node scripts/tasksPageShots.mjs [--shots]
// --shots also writes the screenshots to proofs/tasks3/.
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
    if (b.action === "looking") { if (!A.lookingRows) return { rows: [], counts: {} }; return { rows: A.lookingRows, counts: { tasks: { working: A.working(), max: 3 }, watches: { count: A.lookingRows.filter(r => r.kind !== "alert").length, max: 25 }, alerts: { count: A.lookingRows.filter(r => r.kind === "alert").length, max: 25 } }, rule: "Sam sends one email two hours before bidding ends, at any hour of the day or night." }; }
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
const layout = p => p.evaluate(() => {
  const r = s => { const e = document.querySelector(s); return e ? e.getBoundingClientRect() : null; };
  const swEl = document.querySelector(".notify .tksw"), sw = r(".notify .tksw"), often = r(".notify .often"), sel = r(".notify .often select"), nt = r(".notify");
  const hit = (a, c) => a && c && !(a.right <= c.left + 0.5 || c.right <= a.left + 0.5 || a.bottom <= c.top + 0.5 || c.bottom <= a.top + 0.5);
  const clipped = [...document.querySelectorAll("article.car .chips")].filter(c => c.scrollWidth > c.clientWidth + 1 || [...c.children].some(k => { const kb = k.getBoundingClientRect(), cb = c.parentElement.getBoundingClientRect(); return kb.right > cb.right + 1 || kb.left < cb.left - 1; })).length;
  return { overlap: hit(sw, often) || (swEl ? swEl.scrollWidth > swEl.clientWidth + 1 : false), selOut: sel && nt ? sel.right > nt.right + 1 : false, hscroll: document.documentElement.scrollWidth > window.innerWidth + 1, clipped, chips: [...document.querySelectorAll("article.car .chips")].length };
});
try {
  for (const W of [1440, 390]) {
    // 0 Tasks
    { const A = account([]); const p = await open(A, W, "&start=1"); const t = await text(p);
      ok(/Tell Sam what to look for/.test(t) && /You have 0 of 3 Tasks running\. 3 Tasks left\./.test(t) && !/Stop one|Paused/.test(t), `[${W}] 0 Tasks: the box and the status line, no limit notice`); ok((await badge(p)) === "", `[${W}] 0 Tasks: no badge`);
      const L = await layout(p); ok(!L.overlap && !L.selOut && !L.hscroll, `[${W}] 0 Tasks: email toggle and How often do not overlap ${JSON.stringify(L)}`); await shot(p, `tasks-0-${W}`); await p.close(); }
    // 2 Tasks
    { const A = account([mkTask(1), mkTask(2)]); const p = await open(A, W); await wait(700); const t = await text(p);
      ok(/Tell Sam what to look for/.test(t) && /red manual Porsche 911s/.test(t) && /G-body sedans/.test(t) && !/Stop one to start/.test(t), `[${W}] 2 Tasks: the box first, both Tasks, no limit notice`);
      ok((await badge(p)) === "2", `[${W}] 2 Tasks: the badge reads 2 (${await badge(p)})`);
      ok(await p.evaluate(() => document.getElementById("tkapp").innerHTML.indexOf("tkq\"") < document.getElementById("tkapp").innerHTML.indexOf("task-0000")), `[${W}] 2 Tasks: the new-Task box comes before the Tasks`);
      await shot(p, `tasks-2-closed-${W}`); await openTask(p, 1);
      const L = await layout(p); ok(!L.overlap && !L.selOut && !L.hscroll && L.clipped === 0 && L.chips >= 3, `[${W}] 2 Tasks: no overlap, no clipped badge ${JSON.stringify(L)}`);
      await shot(p, `tasks-2-open-${W}`); await p.close(); }
    // 3 Tasks: the limit card REPLACES the box (no box to type into), a Stop frees a slot and the box comes back, then Start fills it again
    { const A = account([mkTask(1), mkTask(2), mkTask(3)]); const p = await open(A, W); await wait(700); let t = await text(p);
      ok((await badge(p)) === "3" && /You have 3 Tasks running\. Stop one to add another\./.test(t) && (t.match(/Stop and start this one/g) || []).length === 3, `[${W}] 3 Tasks: badge 3, the limit card with three Stop and start this one`);
      ok(!(await p.$("#tkq")) && !/of 3 Tasks running/.test(t), `[${W}] 3 Tasks: no box to type into, no status line`);
      ok(!/\bAI\b|upgrade|plan|Pro\b/.test(await p.evaluate(() => document.querySelector(".limitbox").innerText)), `[${W}] limit card: no upsell wording`);
      await shot(p, `tasks-3-${W}`);
      await p.click(".limitbox .lrow:nth-of-type(2) button"); await wait(900); t = await text(p);
      ok(!/Stop one to add another/.test(t) && !!(await p.$("#tkq")) && /You have 2 of 3 Tasks running\. 1 Task left\./.test(t), `[${W}] stopping one at the limit brings the box back, the status line says 2 of 3`);
      ok(A.working() === 2 && (await badge(p)) === "2", `[${W}] after stopping: 2 working, badge ${await badge(p)}`);
      await p.type("#tkq", "find me a Mustang"); await p.keyboard.press("Enter"); await wait(700);
      await p.click("[data-start]"); await wait(900); t = await text(p);
      ok(A.working() === 3 && (await badge(p)) === "3" && /Stop one to add another/.test(t) && !/Stop one to start this one|one job at a time|You already have/.test(t), `[${W}] after Start: 3 working, the card is back with the entry line (no stale attempt line)`);
      ok(p._errs.length === 0, `[${W}] no page errors ${JSON.stringify(p._errs)}`); await p.close(); }
    // arriving with a new job (seed) at the limit: the card names it; Stop and start this one drafts it
    { const A = account([mkTask(1), mkTask(2), mkTask(3)]); const p = await open(A, W, "&seed=typed&words=find%20me%20a%20Mustang"); await wait(600); let t = await text(p);
      ok(/You have 3 Tasks running\. Stop one to start this one\./.test(t), `[${W}] seed at the limit: the card says Stop one to start this one`);
      await shot(p, `tasks-limit-${W}`);
      await p.click(".limitbox .lrow:nth-of-type(2) button"); await wait(1100); t = await text(p);
      ok(/Sam will look for find me a Mustang\. Start\?/.test(t) && A.working() === 2, `[${W}] seed: stopping one drafts the new Task (read-back with Start)`); await p.close(); }
    // the reported stale-notice case: at the limit with a job in hand the card shows; the person stops a Task with its own Stop; the card goes
    { const A = account([mkTask(1), mkTask(2), mkTask(3)]); const p = await open(A, W, "&seed=typed&words=g%20body%20sedans"); await wait(600);
      ok(/Stop one to start this one/.test(await text(p)), `[${W}] stale case: the card shows at the limit`);
      await p.click("[data-act=stop]"); await wait(900); const t = await text(p);
      ok(!/Stop one to start|one job at a time|You already have/.test(t) && /Tell Sam what to look for/.test(t), `[${W}] stale case: after a Stop the card is gone (the server says 2 working)`);
      ok(await p.evaluate(() => document.getElementById("tkq").value) === "g body sedans", `[${W}] stale case: the attempted words are back in the box`); await p.close(); }
    // THE OVERVIEW (Oct 25 2026): compact cards side by side, all closed; one detail opens directly below its row
    { const A = account([mkTask(1, "running", { created_at: ago(30), unread: 2 }), mkTask(2, "running", { created_at: ago(5) }), mkTask(3, "paused", { created_at: ago(3) })]); const p = await open(A, W); await wait(700); const t = await text(p);
      ok(/You have 2 of 3 Tasks running\. 1 Task left\./.test(t), `[${W}] overview: the status line`);
      const geo = await p.$$eval(".tgrid > .tc", cs => cs.map(c => { const r = c.getBoundingClientRect(); return { id: c.id.slice(-1), top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), text: c.innerText.replace(/\s+/g, " "), btns: [...c.querySelectorAll(".tbtns button")].map(b => b.textContent).join() }; }));
      ok(geo.length === 3 && !(await p.$(".tdetail")) && !(await p.$(".tkq-x")) && !(await p.$("[id^=tkq-]")), `[${W}] overview: three compact cards, all closed, no change box, no cars (${geo.length})`);
      if (W === 1440) ok(new Set(geo.map(g => g.top)).size === 1 && geo[0].left < geo[1].left && geo[1].left < geo[2].left, `[1440] overview: three across in one row ${JSON.stringify(geo.map(g => [g.top, g.left]))}`);
      else ok(new Set(geo.map(g => g.left)).size === 1 && geo[0].top < geo[1].top && geo[1].top < geo[2].top, `[390] overview: a single column ${JSON.stringify(geo.map(g => [g.top, g.left]))}`);
      const g1 = geo.find(g => g.id === "1"), g3 = geo.find(g => g.id === "3");
      ok(/Running/i.test(g1.text) && /red manual Porsche 911s/.test(g1.text) && /Three live cars match/.test(g1.text) && /2 new/.test(g1.text) && g1.btns === "Pause,Stop", `[${W}] card: status, sentence, count line, 2 new, Pause and Stop (${g1.text})`);
      ok(/Paused/i.test(g3.text) && g3.btns === "Resume,Stop" && !/new/.test(geo.find(g => g.id === "2").text), `[${W}] card: a Paused Task shows Resume and Stop; no "new" when there are none`);
      await shot(p, `tasks-overview-closed-${W}`);
      // Pause from the card without opening it; the card stays closed
      await p.click("#task-00000000-0000-4000-8000-000000000002 [data-act=pause]"); await wait(900);
      ok(A.tasks[1].state === "paused" && !(await p.$(".tdetail")), `[${W}] Pause works from the closed card`);
      // opening: the detail sits directly below its row and holds the change box, cars and timeline; the open card is marked
      await p.click("#task-00000000-0000-4000-8000-000000000001 [data-toggle]"); await wait(1000);
      const op = await p.evaluate(() => { const d = document.querySelector(".tdetail"), c = document.querySelector(".tc.open"), cs = [...document.querySelectorAll(".tgrid > .tc")]; const dr = d && d.getBoundingClientRect(); const rowBottom = Math.max(...cs.filter(x => Math.abs(x.getBoundingClientRect().top - c.getBoundingClientRect().top) < 4).map(x => x.getBoundingClientRect().bottom)); return { n: document.querySelectorAll(".tdetail").length, below: dr && dr.top >= rowBottom - 1, sameRow: dr && cs.every(x => x.getBoundingClientRect().top < dr.top || x.getBoundingClientRect().top > dr.bottom - 1 || true), box: !!d.querySelector("input[id^=tkq-]"), cars: d.querySelectorAll("article.car").length, feed: !!d.querySelector(".feed"), exp: c.querySelector("[data-toggle]").getAttribute("aria-expanded"), outline: getComputedStyle(c).outlineStyle, chev: getComputedStyle(c.querySelector("[data-toggle]"), "::after").content }; });
      ok(op.n === 1 && op.below && op.box && op.cars >= 1 && op.feed && op.exp === "true" && op.outline === "solid" && op.chev !== "none", `[${W}] open: one detail below its row with the change box, cars and timeline; marked ${JSON.stringify(op)}`);
      if (W === 1440) { const place = await p.evaluate(() => { const cs = [...document.querySelectorAll(".tgrid > *")].map(e => e.className.split(" ")[0] + ":" + Math.round(e.getBoundingClientRect().top)); return cs; }); ok(place[3] && place[3].startsWith("tdetail") && Number(place[3].split(":")[1]) > Number(place[2].split(":")[1]), `[1440] open: the detail follows the row of three (${place})`); }
      else { const order = await p.$$eval(".tgrid > *", es => es.map(e => e.id || e.className).join()); ok(/^task-1,detail-1,task-2/.test(order.replace(/00000000-0000-4000-8000-00000000000/g, "")), `[390] open: the detail sits directly below that card (${order.replace(/00000000-0000-4000-8000-00000000000/g, "")})`); }
      await shot(p, `tasks-overview-open-${W}`);
      // a redraw keeps the open Task; a reload keeps it; opening another closes the first; clicking the open one closes it
      await p.reload({ waitUntil: "networkidle2" }); await wait(900);
      ok(await p.$eval("#task-00000000-0000-4000-8000-000000000001", c => c.classList.contains("open")) && (await p.$$(".tdetail")).length === 1, `[${W}] a reload keeps the open Task`);
      await p.click("#task-00000000-0000-4000-8000-000000000003 [data-toggle]"); await wait(800);
      ok((await p.$$(".tdetail")).length === 1 && (await p.$$eval(".tc.open", e => e.map(x => x.id.slice(-1)).join())) === "3", `[${W}] only one Task is open at a time`);
      await p.click("#task-00000000-0000-4000-8000-000000000003 [data-toggle]"); await wait(500);
      ok((await p.$$(".tdetail")).length === 0 && (await p.$$(".tc.open")).length === 0, `[${W}] clicking the open Task again closes it`);
      ok(p._errs.length === 0, `[${W}] overview: no page errors ${JSON.stringify(p._errs)}`); await p.close(); }
    // keyboard: Tab reaches the card, Enter opens, Escape closes and the focus stays on the card
    { const A = account([mkTask(1), mkTask(2)]); const p = await open(A, W); await wait(600);
      await p.focus("#tt-00000000-0000-4000-8000-000000000001"); await p.keyboard.press("Enter"); await wait(900);
      ok((await p.$$(".tdetail")).length === 1 && await p.evaluate(() => document.activeElement && document.activeElement.id === "tt-00000000-0000-4000-8000-000000000001"), `[${W}] keyboard: Enter opens the Task and the focus stays on its card`);
      await p.keyboard.press("Tab"); await p.keyboard.press("Tab"); const f = await p.evaluate(() => document.activeElement.textContent); ok(/Pause|Stop/.test(f), `[${W}] keyboard: Tab reaches Pause and Stop (${f})`);
      await p.keyboard.press("Escape"); await wait(400);
      ok((await p.$$(".tdetail")).length === 0 && await p.evaluate(() => document.activeElement.id === "tt-00000000-0000-4000-8000-000000000001"), `[${W}] keyboard: Escape closes and returns the focus to the card`); await p.close(); }
    // 0 matches, 45 matches (the number is the server's), and a Task that needs the person
    { const mk45 = (n, total) => mkTask(n, "running", { updates: [{ id: 300 + n, role: "sam", kind: "match", created_at: ago(2), text: "x", listing_ids: total ? [1, 2, 3, ...Array.from({ length: total - 3 }, (_, i) => 1000 + i)] : [], data: { opening: true, total, cards: total ? CARDS.map(c => ({ id: c.id, title: c.title, url: c.url })) : [] } }] });
      const A = account([mk45(1, 0), mk45(2, 45), mkTask(3, "needs_you")]); const p = await open(A, W); await wait(900);
      const tx = await p.$$eval(".tgrid > .tc", cs => cs.map(c => c.innerText.replace(/\s+/g, " ")));
      ok(/No live cars match yet/.test(tx[0]) && /45 live cars match/.test(tx[1]) && /Needs you/i.test(tx[2]), `[${W}] counts: 0 matches, 45 matches (the server's number) and Needs you (${tx.join(" | ")})`);
      ok((await p.$$eval(".tc.open", e => e.map(x => x.id.slice(-1)).join())) === "3" && (await p.$$(".tdetail")).length === 1, `[${W}] a Task that needs you opens itself`);
      await shot(p, `tasks-needs-you-${W}`);
      await p.click("#task-00000000-0000-4000-8000-000000000002 [data-toggle]"); await wait(900);
      ok((await p.$$("#detail-00000000-0000-4000-8000-000000000002 .cars li, #detail-00000000-0000-4000-8000-000000000002 article.car")).length >= 1 && !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), `[${W}] a Task with 45 matches opens without a sideways scroll`);
      await shot(p, `tasks-45-open-${W}`); await p.close(); }
    // THE CASE FROM THE LIVE ACCOUNT (Oct 26 2026): the opening read found nothing (total 0, no cars), a later check found one live car (a follow-up update
    // with a card and NO total). The card said "No live cars match yet" over a thread that listed the car. The count now reads the thread's own cars; the whole
    // card is one real button with a visible text label; Pause and Stop stay separate.
    { const opening = { id: 410, role: "sam", kind: "match", created_at: ago(5), text: "Nothing new matches right now.", listing_ids: [], data: { opening: true, total: 0, cards: [] } };
      const follow = { id: 411, role: "sam", kind: "match", created_at: ago(2), text: "x", listing_ids: [3], data: { cards: [{ id: 3, title: CARDS[2].title, url: CARDS[2].url }] } };
      const T = mkTask(1, "running", { updates: [opening, follow] }), B = mkTask(2, "running", { updates: [opening] });
      const f1 = overviewFacts(T), f0 = overviewFacts(B), fEnded = overviewFacts(T, new Set());
      ok(f1.live === "One live car matches" && f1.liveCount === 1, `[${W}] one live match in the thread: the server's count is 1 (${JSON.stringify(f1)})`);
      ok(f0.live === "No live cars match yet" && f0.liveCount === 0 && fEnded.live === "No live cars match right now" && fEnded.liveCount === 0, `[${W}] no cars at all says yet; every car ended says right now (${f0.live} | ${fEnded.live})`);
      const A = account([T, B]); const p = await open(A, W); await wait(900);
      const cardText = async n => p.$eval("#task-00000000-0000-4000-8000-00000000000" + n, c => c.innerText.replace(/\s+/g, " "));
      const c1 = await cardText(1), c2 = await cardText(2);
      ok(/One live car matches/.test(c1) && !/No live cars match yet/.test(c1) && /Select the card to see it/.test(c1) && /Show one car/.test(c1), `[${W}] the card with one live match: count, where to look and the label (${c1})`);
      ok(/No live cars match yet/.test(c2) && /Show cars/.test(c2) && !/Select the card/.test(c2), `[${W}] the card with no cars: yet line, plain Show cars label (${c2})`);
      const tg = await p.$eval("#tt-00000000-0000-4000-8000-000000000001", b => { const cs = getComputedStyle(b), pr = getComputedStyle(b, "::before"), c = b.closest(".tc").getBoundingClientRect(), r = b.getBoundingClientRect(); return { tag: b.tagName, type: b.type, label: (b.querySelector(".tshow") || {}).innerText, cursor: cs.cursor, cover: pr.position === "absolute" && pr.inset !== "" , exp: b.getAttribute("aria-expanded"), ctl: b.getAttribute("aria-controls"), w: Math.round(c.width), h: Math.round(c.height), noDash: !/[\u2013\u2014]/.test(b.innerText) }; });
      ok(tg.tag === "BUTTON" && tg.type === "button" && tg.label === "Show one car" && tg.cursor === "pointer" && tg.cover && tg.exp === "false" && !!tg.ctl, `[${W}] the toggle is a real button with a visible text label, a pointer and full-card cover (${JSON.stringify(tg)})`);
      ok(!/\b(he|him|his)\b/i.test(c1 + " " + c2), `[${W}] the card words never call Sam he, him or his`);
      // the whole card is the control: a click in the empty space at the bottom right of the card (the Pause and Stop row) opens it; Pause and Stop do not toggle
      const rect = await p.$eval("#task-00000000-0000-4000-8000-000000000001", c => { const r = c.getBoundingClientRect(); return { x: r.right - 24, y: r.bottom - 18 }; });
      await p.mouse.move(rect.x, rect.y); const hov = await p.$eval("#task-00000000-0000-4000-8000-000000000001", c => getComputedStyle(c).borderTopColor);
      await p.mouse.click(rect.x, rect.y); await wait(900);
      const o1 = await p.evaluate(() => ({ open: document.querySelector("#task-00000000-0000-4000-8000-000000000001").classList.contains("open"), label: document.querySelector("#tt-00000000-0000-4000-8000-000000000001 .tshow").innerText, line: document.querySelector("#task-00000000-0000-4000-8000-000000000001 .tcount").innerText, d: document.querySelectorAll(".tdetail").length }));
      ok(o1.open && o1.label === "Hide one car" && /Shown below/.test(o1.line) && o1.d === 1, `[${W}] a click anywhere on the card opens it: label Hide one car, line says shown below (${JSON.stringify(o1)})`);
      ok(hov !== "rgba(0, 0, 0, 0)", `[${W}] the card has a hover state (${hov})`);
      // the one car in the thread is a full-width card, never squeezed into one of six tracks (Find's own n1 class: the grid carries its car count)
      const cw = await p.evaluate(() => { const c = document.querySelector(".tkgrid .car"), g = document.querySelector(".tkgrid"); return c && g ? { car: Math.round(c.getBoundingClientRect().width), grid: Math.round(g.getBoundingClientRect().width), cls: g.className } : null; });
      ok(cw && /\bn1\b/.test(cw.cls) && cw.car >= Math.min(300, cw.grid - 2), `[${W}] the one car in the thread is not squeezed (${JSON.stringify(cw)})`);
      await shot(p, `tasks-one-match-open-${W}`);
      await p.click("#task-00000000-0000-4000-8000-000000000001 [data-act=stop]"); await wait(700);
      ok(A.tasks[0].state === "done", `[${W}] Stop is its own button and acts on its own`);
      ok(p._errs.length === 0, `[${W}] the one-match card: no page errors ${JSON.stringify(p._errs)}`);
      ok(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), `[${W}] the one-match card: no sideways scroll`); await p.close(); }
    // THE TWO LIVE TASKS (Oct 26 2026): a later quiet check rewrites the opening update to its status line (data.total 0, data.loose) and leaves its old listing_ids column;
    // those ids are not matches. Only data.cards count, each car once; near misses are a count ("31 close ones"), never "match".
    { const stale = n => Array.from({ length: n }, (_, i) => 100 + i);
      const bmwOpen = { id: 420, role: "sam", kind: "match", created_at: ago(6), text: "Nothing red yet. 31 other cars match the rest.", listing_ids: stale(3), data: { opening: true, edit: false, total: 0, loose: { dropped: "colour", count: 31 } } };
      const porOpen = { id: 421, role: "sam", kind: "match", created_at: ago(6), text: "Nothing with a manual gearbox yet. Nine other cars match the rest.", listing_ids: stale(10), data: { opening: true, edit: false, total: 0, loose: { dropped: "gearbox", count: 9 } } };
      const car = { id: 3, title: CARDS[2].title, url: CARDS[2].url };
      const porNew = { id: 422, role: "sam", kind: "match", created_at: ago(2), text: "x", listing_ids: [3], data: { line: "One new car matches.", cards: [car] } };
      const porAgain = { id: 423, role: "sam", kind: "match", created_at: ago(1), text: "x", listing_ids: [3], data: { line: "One new car matches.", cards: [car] } };
      const BMW = mkTask(1, "running", { summary: "Sam is looking for red BMWs with under 50,000 miles.", updates: [bmwOpen] });
      const POR = mkTask(2, "running", { summary: "Sam is looking for black manual Porsches.", updates: [porOpen, porNew, porAgain] });
      const fb = overviewFacts(BMW), fp = overviewFacts(POR), fpEnded = overviewFacts(POR, new Set());
      ok(fb.liveCount === 0 && fb.live === "No live cars match yet" && fb.close === "31 close ones" && !/\d.* (live )?cars? match/.test(fb.live + " " + fb.close), `[${W}] BMW: nothing red yet with 31 other cars gives a live count of 0, the line No live cars match yet and 31 close ones (${JSON.stringify(fb)})`);
      ok(fp.liveCount === 1 && fp.live === "One live car matches" && fp.close === null, `[${W}] Porsche: one exact car and 9 near misses gives a live count of 1; the stale opening list is not read (${JSON.stringify(fp)})`);
      ok(fpEnded.liveCount === 0 && fpEnded.live === "No live cars match right now", `[${W}] Porsche: if the one car has ended the count is 0`);
      ok(overviewFacts(mkTask(3, "running", { updates: [{ ...porNew, id: 1 }, { ...porAgain, id: 2 }] })).liveCount === 1, `[${W}] a car repeated across two updates counts once`);
      ok(overviewFacts(mkTask(3, "running", { updates: [{ id: 5, role: "sam", kind: "match", created_at: ago(1), listing_ids: Array.from({ length: 45 }, (_, i) => 1 + i), data: { opening: true, total: 45, cards: [car, { id: 1, title: "a" }, { id: 2, title: "b" }] } }] })).liveCount === 45, `[${W}] an opening that still holds its own list counts its cars past the first twelve`);
      const A = account([BMW, POR]); const p = await open(A, W); await wait(900);
      const t1 = await p.$eval("#task-00000000-0000-4000-8000-000000000001", c => c.innerText.replace(/\s+/g, " ")), t2 = await p.$eval("#task-00000000-0000-4000-8000-000000000002", c => c.innerText.replace(/\s+/g, " "));
      ok(/No live cars match yet/.test(t1) && /31 close ones, select the card to read the note/.test(t1) && /Show cars/.test(t1) && !/\d+ live cars? match/.test(t1) && !/Show \d/.test(t1), `[${W}] the BMW card as drawn: ${t1}`);
      ok(/One live car matches/.test(t2) && /Show one car/.test(t2) && !/close one/.test(t2), `[${W}] the Porsche card as drawn: ${t2}`);
      await shot(p, `tasks-two-live-${W}`); await p.close(); }
    { const A = account([mkTask(1)]); const p = await open(A, W); await wait(600); ok(/You have 1 of 3 Tasks running\. 2 Tasks left\./.test(await text(p)), `[${W}] 1 Task: the status line`); await p.close(); }
    // the junk-folder line shows only while the server says no alert email has gone out yet
    { const A = account([mkTask(1)]); A.junk = true; const p = await open(A, W); await wait(600); ok(/check your junk folder/.test(await text(p)), `[${W}] junk line: shown while the server says so`); await p.close(); }
    { const A = account([mkTask(1)]); A.junk = false; const p = await open(A, W); await wait(600); ok(!/junk folder/.test(await text(p)), `[${W}] junk line: gone once the first email has arrived`); await p.close(); }
    // the starting state: Start shows the Task at once, the first run is slow, cards fill in after
    { const A = account([mkTask(1)], { firstDelay: 1800, cardsDelay: 600 }); const p = await open(A, W); await wait(500);
      await p.type("#tkq", "g body sedans"); await p.keyboard.press("Enter"); await wait(500); await p.click("[data-start]"); await wait(500);
      let t = await text(p); ok(/Sam is starting/i.test(t) && /Sam is checking the live cars now\./.test(t) && /g body sedans/.test(t), `[${W}] starting state: the Task shows at once as "Sam is starting" while the first run is out`);
      ok(A.working() === 2 && (await badge(p)) === "2", `[${W}] starting state: count and badge already 2`);
      await shot(p, `tasks-starting-${W}`);
      await wait(3500); t = await text(p); ok(!/Sam is starting/i.test(t) && /Three live cars match/.test(await text(p)), `[${W}] starting state clears when the first run lands`); await p.close(); }
  }
  // SIGNED OUT: the app page asks for sign-in (sends to the explainer's sign-in card, keeping where it was going); after sign-in the
  // same page completes ONE create.
  { const A0 = account([]); const p = await open(A0, 1440, "&start=1", true); const u = new URL(p.url());
    ok(u.pathname === "/tasks" && u.searchParams.get("signin") === "1" && /^\/tasks\/mine/.test(u.searchParams.get("next") || ""), "signed out: the app asks to sign in and remembers where it was going (" + p.url().slice(0, 120) + ")");
    ok(A0.calls.length === 0, "signed out: nothing was asked of the server"); await p.close();
    const A = account([]); const q = await open(A, 1440, "&start=1");
    await q.type("#tkq", "g body sedans"); await q.keyboard.press("Enter"); await wait(500); await q.click("[data-start]"); await wait(1200);
    ok(A.tasks.length === 1 && A.calls.filter(c => c === "start").length === 1, "signed out then signed in: the Task is created once (" + A.tasks.length + " Task, " + A.calls.filter(c => c === "start").length + " start call)"); await q.close(); }
  // CS only while a card is actually loading (1440)
  { const pend = { kind: "pending", stillReading: true, line: CS, retry: true, retryAfterMs: 4500 };
    const A = account([mkTask(1)], { enrich: (body, n) => ({ cards: (body.ids || []).map(id => n < 2 ? { id, market: { ...pend } } : { id, market: CARDS[0].market, seen_before: { n: 0 }, timeline: [], sam_lines: CARDS[0].sam_lines }) }) });
    A.cardsOf = () => CARDS.map(c => ({ ...c, market: { ...pend }, sam_lines: [] }));
    const p = await open(A, 1440); p.on("pageerror", e => console.log("ERR", e.message)); await openTask(p); await wait(300); const early = await text(p); await wait(6000); const late = await text(p);
    ok(/still being read|being read/.test(early) || /Getting the cars/.test(early), "reading: the holding line shows while the market is out");
    ok(!/being read/.test(late) && /\$[\d,]+ to \$[\d,]+/.test(late), "reading: the line is gone once each card's own market lands, and the range is there");
    ok((A.enrichCalls || 0) >= 2, "reading: the page asked again after the engine's own retry wait (" + A.enrichCalls + " asks)"); await p.close(); }
  // a market that never comes: said plainly when the ENGINE's wait (waitMaxMs) ends, never at a number of the page's own
  const never = async (waitMaxMs, settle) => { const pend = { kind: "pending", stillReading: true, line: CS, retry: true, retryAfterMs: 120, waitMaxMs };
    const A = account([mkTask(1)], { enrich: body => ({ cards: (body.ids || []).map(id => ({ id, market: { ...pend } })) }) }); A.cardsOf = () => CARDS.map(c => ({ ...c, market: { ...pend }, sam_lines: [] }));
    const p = await open(A, 1440); await p.evaluate(() => { window.GAS_WAIT_SCALE = 0.02; }); await openTask(p); await wait(settle); const t = await text(p); await p.close(); return t; };
  { const t = await never(85000, 3500);   // the clock scaled down for the check only: the engine's 85 seconds becomes 1.7
    ok(!/still reading/.test(t) && t.includes(CM) && !/try again/i.test(t), "reading: a market that never comes is said plainly once the engine's own waitMaxMs (85 seconds) has passed, never try again, not left on the holding line"); }
  { const t = await never(400000, 3500);   // the engine says wait 400 s (8 s scaled): a page with a wait of its own (45 s = 0.9 s scaled) would already have given up
    ok(/being read|Getting the cars|still reading/.test(t) && !t.includes(CM), "reading: the page keeps waiting while the engine's waitMaxMs has not passed (it carries no wait of its own)"); }
  // WHAT FIND'S TOGGLES AND BUTTONS MADE (Oct 29 2026): the watches and before-it-ends emails are on the Tasks page with what they watch and a Stop, counted apart from the Task limit.
  { const A = account([mkTask(1), mkTask(2), mkTask(3)]);
    A.lookingRows = [{ ref: "w:aaaaaaaa-0000-4000-8000-000000000001", kind: "spec_watch", what: "1995 Chevrolet Impala SS", detail: "The next sale of this car." }, { ref: "w:aaaaaaaa-0000-4000-8000-000000000002", kind: "car_watch", what: "1994 Porsche 911 Carrera Cabriolet", detail: "This exact car, if it comes up again." }, { ref: "a:4412", kind: "alert", what: "2010 Porsche 911 Carrera Cabriolet", detail: "Sam sends one email two hours before bidding ends, at any hour of the day or night.", ends_at: new Date(Date.now() + 5 * 864e5).toISOString() }];
    const p = await open(A, 1440); const t = await text(p);
    ok(/Watching/.test(t) && /1995 Chevrolet Impala SS/.test(t) && /1994 Porsche 911 Carrera Cabriolet/.test(t) && /2010 Porsche 911 Carrera Cabriolet/.test(t), "watching: every watch and email Find made is on the Tasks page, by the engine's name for the car");
    ok(/Tasks 3 of 3 · watches 2 of 25 · before-it-ends emails 1 of 25/.test(t) && /do not use up your Tasks/.test(t), "watching: the counts are shown apart from the Task limit (3 of 3 Tasks, 2 watches, 1 email)");
    ok(/two hours before bidding ends, at any hour/.test(t) && /Bidding ends/.test(t), "watching: an email shows the rule and when bidding ends");
    ok((await p.evaluate(() => document.querySelectorAll("[data-lk-stop]").length)) === 3, "watching: each has a Stop");
    await p.click('[data-lk-stop="w:aaaaaaaa-0000-4000-8000-000000000001"]'); await wait(900); const t2 = await text(p);
    ok(!/1995 Chevrolet Impala SS/.test(t2) && /watches 1 of 25/.test(t2) && A.calls.includes("looking_stop") && A.working() === 3, "watching: Stop ends that one only, the counts follow, the Tasks keep running"); await p.close(); }
  { const A = account([mkTask(1)]); const p = await open(A, 1440); const t = await text(p); ok(!/Watching/.test(t), "watching: nothing made by Find, no section"); await p.close(); }
  // SETUP QUESTIONS AND DRAFTS (Lane D, Oct 24 2026): choices are buttons, a typed answer is read leniently, a draft left behind shows
  // as a small card under the clean box (Continue, Discard), and a draft older than a day is dropped by the server.
  const Qm = "Which Porsche model should Sam look for?", stampNow = () => new Date().toISOString();
  const qDraft = (extra = {}) => ({ at: stampNow(), asks: 1, words: "red porsche", kind: "hunt", filters: { make: "Porsche", colour: "red" }, question: Qm, qkind: "model", options: ["911", "Boxster", "Cayenne", "356", "Cayman", "944"], any: "Any Porsche", summary: null, thread: [{ role: "buyer", text: "red porsche" }, { role: "sam", text: Qm }], ...extra });
  const readBack = w => ({ at: stampNow(), asks: 1, words: w, kind: "hunt", filters: { make: "Porsche", colour: "red", any_model: "1" }, question: null, summary: "Sam is looking for red Porsches.", thread: [{ role: "sam", text: "Sam will look for red Porsches. Start?" }] });
  const norm = x => String(x).toLowerCase().replace(/[^a-z ]/g, "").trim();
  const sayFn = b => { const t = norm(b.text);
    if (!b.draft || !b.draft.question) return { draft: qDraft({ words: b.text }), reply: Qm };
    if (["any", "any porsche", "doesnt matter", "no preference", "either"].includes(t) || t === "cayman" || t === "boxter" || t === "911") return { draft: readBack(b.draft.words), reply: "Sam will look for red Porsches. Start?" };
    return { draft: b.draft, reply: "Sam didn't understand that answer. The choices are 911, Boxster, Cayenne, 356, Cayman, 944 or Any Porsche.", miss: true }; };
  for (const W of [1440, 390]) {
    // "red porsche": the question comes with buttons (each choice, the Any option) and the box.
    { const A = account([]); A.sayFn = sayFn; const p = await open(A, W, "&start=1"); await p.type("#tkq", "red porsche"); await p.click("[data-send=tkq]"); await wait(500);
      let labels = await p.$$eval("[data-choice]", els => els.map(e => e.textContent));
      ok(labels.join("|") === "911|Boxster|Cayenne|356|Cayman|944|Any Porsche" && /Which Porsche model/.test(await text(p)) && !!(await p.$("#tkq")), `[${W}] red porsche: the question shows each choice as a button, the Any option, and the box (${labels})`);
      const hs = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1); ok(!hs, `[${W}] red porsche: no horizontal scroll`); await shot(p, `tasks-choices-${W}`);
      // a typed answer not understood: said once, the buttons shown again, never the line alone
      await p.type("#tkq", "banana"); await p.click("[data-send=tkq]"); await wait(500);
      ok(/didn't understand/.test(await text(p)) && (await p.$$("[data-choice]")).length === 7, `[${W}] not understood: said once and the buttons are back`);
      // a button click answers the question
      await p.click('[data-choice="Any Porsche"]'); await wait(500);
      ok(/Sam will look for red Porsches/.test(await text(p)) && !!(await p.$("[data-start]")) && !(await p.$("[data-choice]")), `[${W}] clicking Any Porsche reads the job back with Start`); await p.close(); }
    // typed answers: any form, a typo
    for (const said of ["any", "Any Porsche", "doesn't matter", "no preference", "either", "Boxter"]) {
      const A = account([]); A.sayFn = sayFn; const p = await open(A, W, "&start=1", false, qDraft()); await p.type("#tkq", said); await p.click("[data-send=tkq]"); await wait(400);
      ok(/Sam will look for red Porsches/.test(await text(p)) && !!(await p.$("[data-start]")), `[${W}] "${said}" counts as an answer`); await p.close(); }
    // leaving mid-question and coming back: the clean box first, the unfinished card under it, no old error line
    { const A = account([]); A.sayFn = sayFn; const p = await open(A, W, "", false, qDraft({ thread: [{ role: "sam", text: "Sam didn't understand that answer. The choices are 911, Boxster, Cayenne, 356, Cayman, 944 or Any Porsche." }] }));
      const t = await text(p), html = await p.evaluate(() => document.getElementById("tkapp").innerHTML);
      ok(/Tell Sam what to look for/.test(t) && /Unfinished: red porsche/.test(t) && html.indexOf("Tell Sam what to look for") < html.indexOf("Unfinished:") && !/didn't understand/.test(t) && !(await p.$("[data-choice]")), `[${W}] from the rail: the clean setup box first, the unfinished card under it, no error line`);
      ok(!!(await p.$("[data-continue]")) && !!(await p.$("[data-discard]")), `[${W}] the unfinished card has Continue and Discard`); await shot(p, `tasks-unfinished-${W}`);
      await p.click("[data-continue]"); await wait(300); const t2 = await text(p);
      ok(/Which Porsche model/.test(t2) && !/didn't understand/.test(t2) && (await p.$$("[data-choice]")).length === 7, `[${W}] Continue shows the question last asked with its buttons, never the old error`); await p.close(); }
    { const A = account([]); A.sayFn = sayFn; const p = await open(A, W, "", false, qDraft()); await p.click("[data-discard]"); await wait(300);
      ok(!/Unfinished/.test(await text(p)) && (await p.evaluate(() => sessionStorage.getItem("gas_task_draft"))) === null, `[${W}] Discard removes the draft for good`);
      await p.reload({ waitUntil: "networkidle2" }); await wait(500); ok(!/Unfinished/.test(await text(p)), `[${W}] and it stays gone after a reload`); await p.close(); }
    // typing in the clean box starts fresh, not an answer to the old question
    { const A = account([]); A.sayFn = sayFn; const p = await open(A, W, "", false, qDraft({ words: "old words" })); await p.type("#tkq", "red porsche"); await p.click("[data-send=tkq]"); await wait(500);
      ok(A.calls.includes("say") && !(await text(p)).includes("old words"), `[${W}] a new request from the clean box replaces the unfinished draft`); await p.close(); }
    // older than a day: the server says so and the page shows nothing
    { const A = account([]); A.sayFn = sayFn; const p = await open(A, W, "", false, qDraft({ at: new Date(Date.now() - 26 * 3600e3).toISOString() })); await wait(300);
      ok(!/Unfinished/.test(await text(p)) && (await p.evaluate(() => sessionStorage.getItem("gas_task_draft"))) === null, `[${W}] a draft older than a day is dropped, not shown`); await p.close(); }
  }
} finally { await b.close(); }
console.log(`tasksPageShots: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
