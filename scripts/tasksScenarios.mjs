// Tasks scenarios (Lane C, Oct 2026): the 13 named Tasks tests, on the draft flow (a task row exists only
// after Start; one task holds the slot). 1-10 run through the deployed /api/tasks probe test_scenario (an
// in-memory store, seeded listing rows, no email), 9 also runs the shared guard locally, 11-12 load the
// live pages signed out, 13 diffs How Sam Decides against its last change.
//   PROBE_KEY=... node scripts/tasksScenarios.mjs
import puppeteer from "puppeteer-core";
import { execSync } from "node:child_process";
import { guardReply } from "../lib/live/chatCore.js";

const KEY = process.env.PROBE_KEY;
if (!KEY) { console.error("PROBE_KEY is required"); process.exit(2); }
const SITE = process.env.SITE || "https://goasksam.com";
const results = [];
const check = (name, ok, detail) => { results.push([name, !!ok]); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "\n      " + detail : ""}`); };

const b = await puppeteer.launch({ executablePath: process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage(); await p.goto(SITE + "/buy", { waitUntil: "domcontentloaded" });
const scenario = steps => p.evaluate(async (steps, K) => (await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json", "x-probe-key": K }, body: JSON.stringify({ action: "test_scenario", steps }) })).json(), steps, KEY);
const ends = new Date(Date.now() + 5 * 864e5).toISOString(), old = new Date(Date.now() - 864e5).toISOString(), soon = new Date(Date.now() + 2 * 60e3).toISOString();
let nid = 990001001;
const row = o => ({ id: nid++, source: "bringatrailer", url: "https://bringatrailer.com/listing/s" + nid, make: "Porsche", model: "911", country: "US", current_bid_usd: 40000, end_time: ends, first_seen: soon, status: "live", description: "", vin_norm: null, ...o });
const bm = (yr, loc, tr = "Manual", t = "Coupe 6-Speed", extra = {}) => row({ listing_title: `${yr} Porsche 911 Carrera ${t}`, year: yr, mileage: 52000, transmission: tr, exterior_color: "Black", std_color: "black", location: loc, ...extra });
const sam = j => (j.updates || []).filter(u => u.role === "sam");
const BM = "Find me a black manual 997 under $70k";

try {
  // 1. Filters read back; one matching listing -> exactly one update; an automatic -> nothing.
  { const j = await scenario([{ say: BM }, { control: "start", rows: [] }, { run: { rows: [bm(2008, "Scottsdale, AZ"), bm(2007, "Denver, CO", "Automatic", "Coupe Tiptronic")] } }, { run: { rows: [bm(2007, "Austin, TX", "Automatic", "Cabriolet Tiptronic")] } }]);
    const rb = j.steps[0].out.reply || "", m = sam(j).filter(u => u.kind === "match" && u.listing_ids);
    check("1 black manual 997 under $70k: read-back lists every filter, one update for the match, none for automatics", /black/.test(rb) && /manual/.test(rb) && /997/.test(rb) && /\$70,000/.test(rb) && m.length === 1 && m[0].listing_ids.length === 1 && j.steps[3].out.matched === 0, `read-back: ${rb} | match updates: ${m.length}`); }
  // 2. Radius: 600 miles no, 300 miles yes.
  { const j = await scenario([{ say: "Keep looking for a 964 within 500 miles of LA" }, { control: "start", rows: [] }, { run: { rows: [row({ listing_title: "1991 Porsche 911 Carrera 2 Coupe", year: 1991, location: "Salt Lake City, UT", mileage: 88000 })] } }, { run: { rows: [row({ listing_title: "1992 Porsche 911 Carrera 2 Coupe", year: 1992, location: "San Francisco, CA", mileage: 74000 })] } }]);
    check("2 964 within 500 miles of LA: about 600 miles away no, about 350 miles away yes", j.steps[2].out.matched === 0 && j.steps[3].out.matched === 1, `runs: ${j.steps[2].out.matched}, ${j.steps[3].out.matched}`); }
  // 3. Research with a VIN with prior sales: one update, then Done.
  { const j = await scenario([{ say: "Research this car and tell me if it has sold before: SAJNW5845NC181631" }, { control: "start" }]);
    const r = sam(j).filter(u => u.kind === "research");
    check("3 research by VIN: one update with the prior sale, then Done", j.steps[1].out.state === "done" && r.length === 1 && /2022/.test(r[0].text) && /\$11,000/.test(r[0].text), r[0] && r[0].text); }
  // 4. One question, then the read-back; nothing written before Start.
  { const j = await scenario([{ say: "find me a Porsche" }, { say: "a 993 Carrera" }]);
    const a = j.steps[0].out, c = j.steps[1].out;
    check("4 'find me a Porsche': exactly one question, then the read-back, no task row before Start", a.draft && a.draft.question && !a.draft.summary && /\?$/.test(a.reply) && c.draft && c.draft.summary && a.rows === 0 && c.rows === 0, `${a.reply} -> ${c.reply}`); }
  // 5. A match keeps the task Running.
  { const j = await scenario([{ say: BM }, { control: "start", rows: [] }, { run: { rows: [bm(2008, "Scottsdale, AZ")] } }]);
    check("5 a match keeps the task Running", j.steps[2].out.matched === 1 && j.steps[2].out.state_after === "running" && j.tasks[0].state === "running"); }
  // 6. Two matches in one pull: one combined update, one email (test status).
  { const j = await scenario([{ say: BM }, { control: "start", rows: [] }, { run: { rows: [bm(2008, "Scottsdale, AZ"), bm(2006, "Portland, OR")] } }]);
    const m = sam(j).filter(u => u.kind === "match" && u.listing_ids && u.listing_ids.length);
    check("6 two matches in one pull: one combined update, one email", m.length === 1 && m[0].listing_ids.length === 2 && m[0].email_status === "test", m[0] && m[0].text); }
  // 7. (changed) A second task is blocked by the one-task rule and nothing is created.
  { const j = await scenario([{ say: BM }, { control: "start", rows: [] }, { say: "Keep looking for a 964 within 500 miles of LA", new: true }, { control: "pause" }, { say: "Keep looking for a 964 near LA", new: true }, { control: "stop" }, { say: "Keep looking for a 964 within 500 miles of LA", new: true }]);
    const s2 = j.steps[2].out, s4 = j.steps[4].out, s6 = j.steps[6].out;
    check("7 second task: blocked while one runs or is paused (nothing created); allowed after Stop", s2.blocked && s2.blocked.state === "running" && s4.blocked && s4.blocked.state === "paused" && !s6.blocked && s6.draft && s6.draft.summary && s6.rows === 1, `running: ${JSON.stringify(s2.blocked)} | paused: ${JSON.stringify(s4.blocked)} | after stop: ${s6.reply}`); }
  // 8. Guard: "worth a look" / "Sam thinks" blocked twice, then the update built in code.
  { const j = await scenario([{ say: BM }, { control: "start", rows: [] }, { run: { testBad: true, rows: [bm(2008, "Scottsdale, AZ")] } }]);
    const u = sam(j).filter(x => x.kind === "match" && x.listing_ids).pop() || {};
    check("8 guard on updates: 'worth a look' / 'Sam thinks' blocked, regenerated, then the code-built update", (u.guards || []).length === 2 && !/worth a look|Sam thinks/i.test(u.text || ""), u.text); }
  // 9. Guard: Sam describing itself as an AI or AI hype blocked; a factual AI mention allowed.
  { const a = guardReply("Sam is an AI that finds cars.", [], "", []), h = guardReply("This search is powered by AI.", [], "", []), f = guardReply("AI helps Sam understand the question; the matches come from the rules-based matching algorithm.", [], "", []);
    check("9 guard: 'Sam is an AI' and 'powered by AI' blocked, a factual AI sentence allowed", a.length > 0 && h.length > 0 && f.length === 0, JSON.stringify({ a, h, f })); }
  // 10. 60 days: one Still looking?, auto-pause 7 days later, one tap resumes.
  { const now = Date.now();
    const j = await scenario([{ say: BM }, { control: "start", rows: [] }, { set: { last_interaction_at: new Date(now - 61 * 864e5).toISOString() } }, { run: { rows: [] } }, { run: { rows: [] } }, { set: { still_looking_sent_at: new Date(now - 8 * 864e5).toISOString() } }, { run: { rows: [] } }, { control: "resume" }]);
    check("10 60-day rule: one Still looking?, auto-pause 7 days later, resume", j.steps[3].out.still_looking && !j.steps[4].out.still_looking && j.steps[6].out.auto_paused && j.steps[7].out.state === "running" && sam(j).filter(u => u.kind === "still_looking").length === 1); }
  // 11. (changed) Signed out: the app page, the /buy link and the VIN button all lead to sign-in.
  { const ctx = await b.createBrowserContext(); const q = await ctx.newPage(); await q.setViewport({ width: 1280, height: 900 });
    await q.goto(SITE + "/tasks/mine?seed=buy&words=black%20manual%20997", { waitUntil: "networkidle2" }); await q.waitForSelector("#auth-modal", { timeout: 10000 }).catch(() => {});
    const app = { url: q.url().replace(SITE, ""), card: !!(await q.$("#auth-modal")) };
    await q.goto(SITE + "/history/1992-jaguar-xjs-v12/SAJNW5845NC181631", { waitUntil: "networkidle2" });
    const vinHref = await q.evaluate(() => (document.querySelector("a[data-task-entry]") || {}).getAttribute && document.querySelector("a[data-task-entry]").getAttribute("href"));
    await q.click("a[data-task-entry]"); await q.waitForSelector("#auth-modal", { timeout: 15000 }).catch(() => {});
    const vin = { url: q.url().replace(SITE, ""), card: !!(await q.$("#auth-modal")) };
    await q.goto(SITE + "/tasks", { waitUntil: "networkidle2" }); await q.click("#tkcta"); await q.waitForSelector("#auth-modal", { timeout: 10000 }).catch(() => {});
    const cta = !!(await q.$("#auth-modal"));
    await ctx.close();
    check("11 signed out: /tasks/mine, the VIN page button and 'Give Sam a task' all open sign-in, then return to the app", /^\/tasks\?signin=1&next=%2Ftasks%2Fmine/.test(app.url) && app.card && /^\/tasks\/mine\?seed=vin/.test(vinHref || "") && vin.card && /next=%2Ftasks%2Fmine/.test(vin.url) && cta, JSON.stringify({ app, vinHref, vin, cta })); }
  // 12. The public page: exact copy, valid FAQPage, in the sitemap, no hype.
  { const r = await p.evaluate(async () => { const t = await (await fetch("/tasks?c=" + Date.now())).text(); const sm = await (await fetch("/sitemap-pages.xml")).text(); return { t, sm }; });
    const ld = [...r.t.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1])), faq = ld.find(o => o["@type"] === "FAQPage");
    const text = r.t.replace(/<[^>]+>/g, " ").replace(/&#39;/g, "'");
    check("12 public /tasks: exact lead and how-it-works, valid FAQPage, in the sitemap, no hype", /<h1>A free AI buying agent for collector cars\.<\/h1>/.test(r.t) && text.includes("Tell Sam what you're looking for. Sam keeps checking the market and lets you know when something matches.") && text.includes("The cars Sam shows you come from our rules-based matching algorithm.") && faq && faq.mainEntity.length === 6 && faq.mainEntity.every(q => q.acceptedAnswer && q.acceptedAnswer.text) && r.sm.includes("https://goasksam.com/tasks<") && !/powered by AI|AI-powered|revolutionary|cutting-edge/i.test(text)); }
  // 13. How Sam Decides: exactly the two lines changed.
  { const st = execSync("git diff --numstat 614e219~1 614e219 -- how-sam-decides.html").toString().trim();
    check("13 How Sam Decides: only the two agreed lines changed", /^2\s+2\s+how-sam-decides\.html$/.test(st), st); }
} catch (e) { check("run", false, String(e && e.stack || e).slice(0, 400)); }
await b.close();
const pass = results.filter(r => r[1]).length;
console.log(`\n${pass}/${results.length} PASS`);
process.exit(pass === results.length ? 0 : 1);
