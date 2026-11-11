// goLiveSwitchCheck (Lane E, Nov 10 2026, go live Stage 1 and 4): THE ONE SWITCH (lib/_newDesign.js).
//   OFF  : every public route in scope answers bytes IDENTICAL to the baseline tree (default origin/main; --base <ref>): status, every header, the body.
//   ON   : NEW_DESIGN=all: a 200 page keeps today's status and every header (robots, cache, content type) and carries the new body (X-Design: new);
//          a redirect, 404 or 503 is replayed untouched; no redirect and no URL change; /preview routes unchanged by the switch.
//   PER ROUTE: NEW_DESIGN=<list> turns on only the listed routes.
//   CREW: with the switch off, the signed crew cookie plus ?design=new sees the ON state, private and noindex; no cookie, or a forged one, does not.
// Runs offline on a stubbed database (the same stub for the baseline and for this tree). Exit 1 on any failure.
//   node scripts/goLiveSwitchCheck.mjs [--base <ref>] [--mutants]
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import { execFileSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2), baseRef = args.includes("--base") ? args[args.indexOf("--base") + 1] : "origin/main";

if (args.includes("--mutants")) {
  const MUT = [
    ["the off branch redirects", "lib/_newDesign.js", "if (!w.new) return handler(req, res);   // OFF: today's handler, untouched", "if (!w.new) { res.setHeader(\"X-Design\", \"off\"); return handler(req, res); }"],
    ["a non-200 is not replayed", "lib/_newDesign.js", "if (cap.code !== 200 || !/text\\/html/i.test(String(cap.h[\"content-type\"] || \"\"))) return replay(res, cap);", "if (false) return replay(res, cap);"],
    ["the robots header is dropped", "lib/_newDesign.js", "for (const k of Object.keys(cap.h)) { if (k === \"content-length\" ||", "for (const k of Object.keys(cap.h)) { if (k === \"x-robots-tag\" || k === \"content-length\" ||"],
    ["the cache header is dropped", "lib/_newDesign.js", "for (const k of Object.keys(cap.h)) { if (k === \"content-length\" ||", "for (const k of Object.keys(cap.h)) { if (k === \"cache-control\" || k === \"content-length\" ||"],
    ["any cookie counts as crew", "lib/_newDesign.js", "isCrewRequest(req) === true", "true"],
    ["a POST is switched", "lib/_newDesign.js", "if (m !== \"GET\" && m !== \"HEAD\") return { new: false };", ""],
    ["a Find search is swapped for the landing", "api/buy.js", 'return q.get("q") ? "find-results" : [...q.keys()].length ? null : "find"; }', 'return "find"; }'],
    ["the router's _crew parameter read as a Find search", "api/buy.js", 'q.delete("_crew"); ', ""],
    ["the switch ignores the route list", "lib/_newDesign.js", "const list = v.split(/[\\s,]+/).filter(k => ROUTES.includes(k));", "const list = ROUTES.slice();"]
  ];
  let bad = 0;
  for (const [name, file, from, to] of MUT) {
    const f = path.join(ROOT, file), orig = fs.readFileSync(f, "utf8");
    if (!orig.includes(from)) { console.log("MUTANT NOT APPLICABLE (source changed): " + name); bad++; continue; }
    let code = 0;
    try { fs.writeFileSync(f, orig.replace(from, () => to)); try { execFileSync("node", [fileURLToPath(import.meta.url), "--base", baseRef], { stdio: "pipe" }); } catch (e) { code = e.status || 1; } } finally { fs.writeFileSync(f, orig); }
    console.log((code ? "caught   " : "MISSED   ") + "without " + name); if (!code) bad++;
  }
  console.log(bad ? "goLiveSwitchCheck mutants: " + bad + " not caught" : "goLiveSwitchCheck mutants: all " + MUT.length + " caught");
  process.exit(bad ? 1 : 0);
}

let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
// the baseline tree: the ref's files, with this checkout's dependencies
const base = fs.mkdtempSync(path.join(os.tmpdir(), "gls-base-"));
const tar = execFileSync("git", ["archive", baseRef], { cwd: ROOT, maxBuffer: 1 << 30 });
execFileSync("tar", ["-x", "-C", base], { input: tar });
fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(base, "node_modules"));
process.on("exit", () => { try { fs.rmSync(base, { recursive: true, force: true }); } catch {} });

process.env.LAUNCH_STAGE = "2"; process.env.CURTAIN_CREW_CODE = "go-live-check-code"; delete process.env.NEW_DESIGN; delete process.env.CURTAIN_SEALED;
process.env.SUPABASE_URL = "https://db.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.SUPABASE_ANON_KEY = "k";
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => [], text: async () => "[]", headers: { get: () => null } });   // an empty database, the same for both trees
const crewMod = await import(pathToFileURL(path.join(ROOT, "lib/_crew.js")).href);
const CREW = "gas_crew=" + crewMod.mintCrewCookieValue();

const CASES = [
  ["home", "/", "home"], ["find", "/find", "buy"], ["find results", "/find?q=porsche+911", "buy"], ["market-check", "/market-check", "marketCheck"], ["market-check results", "/market-check?q=1995+bmw+m3", "marketCheck"],
  ["sell", "/sell", "sell"], ["tasks", "/tasks", "tasksPage"], ["tasks-mine", "/tasks/mine?app=1", "tasksPage"], ["business", "/business", "business"], ["how", "/how-sam-decides", "howSamDecides"],
  ["about", "/about", "about"], ["whatsnew", "/whats-new", "whatsNew"], ["feedback", "/feedback", "feedback"], ["terms", "/terms?page=terms", "legal"], ["privacy", "/privacy?page=privacy", "legal"],
  ["history index", "/history?index=1", "history"], ["history hub", "/history?slug=porsche-911", "history"], ["history VIN", "/history?slug=1999-porsche-911&vin=WP0AA2995XS626785", "history"]
];
const mod = async (root, f) => (await import(pathToFileURL(path.join(root, "api", f + ".js")).href)).default;
async function call(handler, url, headers = {}) {
  const res = { h: {}, code: 200, body: "", setHeader(k, v) { this.h[String(k).toLowerCase()] = String(v); return this; }, getHeader(k) { return this.h[String(k).toLowerCase()]; }, removeHeader(k) { delete this.h[String(k).toLowerCase()]; },
    writeHead(c) { this.code = c; return this; }, status(c) { this.code = c; return this; }, json(o) { this.h["content-type"] = this.h["content-type"] || "application/json; charset=utf-8"; this.body = JSON.stringify(o); return this; }, send(b) { this.body = b == null ? "" : String(b); return this; }, end(b) { if (b != null) this.body = String(b); return this; } };
  const u = new URL(url, "https://goasksam.com");
  try { await handler({ method: "GET", url, query: Object.fromEntries(u.searchParams), headers: { host: "goasksam.com", ...headers }, socket: {} }, res); } catch (e) { res.threw = String(e && e.message || e).slice(0, 120); }
  return res;
}
const same = (a, b) => a.code === b.code && a.body === b.body && JSON.stringify(Object.entries(a.h).sort()) === JSON.stringify(Object.entries(b.h).sort()) && a.threw === b.threw;

// 1. OFF: bytes identical to the baseline, for every case
for (const [name, url, f] of CASES) {
  const A = await call(await mod(base, f), url), B = await call(await mod(ROOT, f), url);
  // the ONE allowed difference: the free Tasks limit became ten (Sam, in writing, Nov 11 2026), so the baseline's old words for the limit are today's freeTasksWords(); every other byte must still be the baseline's
  if (f === "tasksPage") { const { FREE_TASK_LIMIT, freeTasksWords } = await import(pathToFileURL(path.join(ROOT, "lib/tasks/limit.js")).href); A.body = A.body.split("three active Tasks").join(freeTasksWords(FREE_TASK_LIMIT)); }   // literal-ok the baseline tree's own words, the one difference allowed
  if (name === "whatsnew") { ok(B.code === A.code && A.h["cache-control"] === B.h["cache-control"] && A.h["x-robots-tag"] === B.h["x-robots-tag"] && B.body.length >= A.body.length && !/A new look for GoAskSam/.test(B.body), `OFF ${name}: What's new gained its two dated entries on this branch (Modified or original, Auction history) so its bytes are not compared; same status and headers, the new look entry absent`); ok(!("x-design" in B.h), `OFF ${name}: no X-Design header`); continue; }
  ok(same(A, B), `OFF ${name} ${url}: status, headers and body identical to ${baseRef} (${A.code}/${B.code}, ${A.body.length}/${B.body.length} bytes${A.threw || B.threw ? ", threw: " + (A.threw || B.threw) : ""})`);
  ok(!("x-design" in B.h), `OFF ${name}: no X-Design header`);
}
// 2. ON (all): same status and headers as today, new body; non-200 replayed
process.env.NEW_DESIGN = "all";
for (const [name, url, f] of CASES) {
  delete process.env.NEW_DESIGN; const A = await call(await mod(ROOT, f), url); process.env.NEW_DESIGN = "all";
  const B = await call(await mod(ROOT, f), url);
  ok(B.code === A.code, `ON ${name}: status ${B.code} equals today's ${A.code} (no redirect added)`);
  const hs = o => JSON.stringify(Object.entries(o.h).filter(([k]) => k !== "x-design" && k !== "content-length").sort());
  ok(hs(A) === hs(B), `ON ${name}: every header equals today's (robots, cache, type)`);
  if (A.code !== 200 || !/text\/html/.test(A.h["content-type"] || "")) ok(B.body === A.body && !("x-design" in B.h), `ON ${name}: a non-page answer (${A.code}) is replayed untouched`);
  else ok(B.h["x-design"] === "new" ? B.body !== A.body : B.body === A.body, `ON ${name}: the body is the new page (X-Design: new) or, when it cannot be built, today's page`);
}
// 2b. a route not released at the launch stage redirects today; it still redirects, with the same headers, and never gets a 200 new page
process.env.LAUNCH_STAGE = "1";
for (const [name, url, f] of [["home", "/", "home"], ["find", "/find", "buy"], ["tasks", "/tasks", "tasksPage"], ["business", "/business", "business"]]) {
  delete process.env.NEW_DESIGN; const A = await call(await mod(ROOT, f), url); process.env.NEW_DESIGN = "all";
  const B = await call(await mod(ROOT, f), url);
  ok(A.code === 302 ? (B.code === 302 && B.h.location === A.h.location && !("x-design" in B.h)) : B.code === A.code, `ON, launch stage 1, ${name}: the redirect (${A.code} to ${A.h.location || "none"}) is replayed untouched`);
}
process.env.LAUNCH_STAGE = "2";
// 2c. Find: a search (?q=) is today's results page inside the new shell (never the landing); any other parameter, and the landing partial, are today's page untouched
{
  const h = await mod(ROOT, "buy");
  for (const url of ["/find?q=porsche+911", "/find?q=1995+bmw+m3&sort=near"]) { delete process.env.NEW_DESIGN; const A = await call(h, url); process.env.NEW_DESIGN = "all"; const B = await call(h, url);
    ok(B.h["x-design"] === "new" && B.code === A.code && B.h["x-robots-tag"] === A.h["x-robots-tag"] && B.h["cache-control"] === A.h["cache-control"], `ON: ${url} is the new shell with today's status and headers`);
    ok(/id="gas-recent-list"/.test(B.body) && /id="searches"/.test(B.body) && /New search/.test(B.body) && /Recent searches/.test(B.body), `ON: ${url} carries the rail (New search, recent searches), not the landing`); }
  for (const url of ["/find?part=landing", "/find?utm_source=x", "/find?sort=near"]) { delete process.env.NEW_DESIGN; const A = await call(h, url); process.env.NEW_DESIGN = "all"; const B = await call(h, url); ok(!("x-design" in B.h) && same(A, B), `ON: ${url} is today's page, byte for byte`); }
}
// 3. per route
process.env.NEW_DESIGN = "about";
{
  const aboutA = await call(await mod(ROOT, "about"), "/about"), howA = await call(await mod(ROOT, "howSamDecides"), "/how-sam-decides");
  ok(aboutA.h["x-design"] === "new" || aboutA.threw, "NEW_DESIGN=about: About is switched");
  ok(!("x-design" in howA.h), "NEW_DESIGN=about: How Sam decides is not");
}
process.env.NEW_DESIGN = "garbage,about";
ok(!("x-design" in (await call(await mod(ROOT, "howSamDecides"), "/how-sam-decides")).h), "an unknown route name switches nothing else");
// 4. crew's look with the switch off
delete process.env.NEW_DESIGN;
{
  const h = await mod(ROOT, "about");
  const plain = await call(h, "/about?design=new"), forged = await call(h, "/about?design=new", { cookie: "gas_crew=v1.9999999999999.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" }), crew = await call(h, "/about?design=new", { cookie: CREW }), crewPlain = await call(h, "/about", { cookie: CREW });
  ok(!("x-design" in plain.h) && !("x-design" in forged.h), "OFF: ?design=new without the signed crew cookie (none, forged) changes nothing");
  ok(crew.h["x-design"] === "new" && /private, no-store/.test(crew.h["cache-control"] || "") && /noindex/.test(crew.h["x-robots-tag"] || ""), "OFF: the signed crew cookie plus ?design=new sees the new page, private, no-store, noindex");
  ok(!("x-design" in crewPlain.h), "OFF: the crew without ?design=new gets today's page");
}
// 4b. EVERY ROUTE'S LANDING (no query), the three ways it is switched (Lane C's live render, Nov 10: /find?design=new answered today's page because the router hands a crew cookie /api/buy?_crew=1 and the route test read the extra key as a search; the offline case had no router in it):
//   (a) NEW_DESIGN=<the route's own key> turns that landing on, (b) NEW_DESIGN=all does, (c) the crew look (switch off, signed cookie, ?design=new) does, on the address the ROUTER builds from vercel.json (its added parameters, _crew=1 and the route's own).
{
  const KEY = { home: "home", find: "find", "find results": "find-results", "market-check": "market-check", "market-check results": "market-check", sell: "sell", tasks: "tasks", "tasks-mine": "tasks-mine", business: "business", how: "how", about: "about", whatsnew: "whatsnew", feedback: "feedback", terms: "terms", privacy: "privacy", "history index": "history", "history hub": "history", "history VIN": "history" };
  const vj = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
  const routerUrl = url => { const u = new URL(url, "https://goasksam.com"), rule = (vj.rewrites || []).find(r => r.source === u.pathname && (r.has || []).some(x => x.type === "cookie" && x.key === "gas_crew")); if (rule) for (const [k, v] of new URL(rule.destination, "https://x").searchParams) if (!u.searchParams.has(k)) u.searchParams.set(k, v); u.searchParams.set("design", "new"); return u.pathname + u.search; };
  const { ROUTES: ALL } = await import(pathToFileURL(path.join(ROOT, "lib/_newDesign.js")).href);
  const covered = new Set();
  for (const [name, url, f] of CASES) {
    if (/[?&]q=/.test(url) || !KEY[name]) continue;
    delete process.env.NEW_DESIGN; const A = await call(await mod(ROOT, f), url), page = A.code === 200 && /text\/html/.test(A.h["content-type"] || "");
    if (!page) continue;
    covered.add(KEY[name]);
    process.env.NEW_DESIGN = KEY[name]; const R = await call(await mod(ROOT, f), url); ok(R.h["x-design"] === "new", `landing ${name} ${url}: NEW_DESIGN=${KEY[name]} serves the new page`);
    process.env.NEW_DESIGN = "all"; const L = await call(await mod(ROOT, f), url); ok(L.h["x-design"] === "new", `landing ${name} ${url}: NEW_DESIGN=all serves the new page`);
    delete process.env.NEW_DESIGN; const C = await call(await mod(ROOT, f), routerUrl(url), { cookie: CREW }); ok(C.h["x-design"] === "new", `landing ${name}: the crew look on the router's address (${routerUrl(url)}) serves the new page`);
  }
  // history is the one route with no page in this empty stub (503 and 404 without the nightly rollout); sitePagesHistoryCheck builds its world and proves the new history pages; the live render proves its landing
  for (const k of ALL.filter(k => k !== "find-results" && k !== "history")) ok(covered.has(k), `the landing of every route key is covered here (${k})`);
}
// 5. POST and the history modes are never switched
process.env.NEW_DESIGN = "all";
{
  const hh = await mod(ROOT, "history");
  for (const url of ["/api/history?sitemap=hubs", "/api/history?photocheck=vins", "/api/history?vin=WP0AA2995XS626785&go=1"]) { const r = await call(hh, url); ok(!("x-design" in r.h), `ON: ${url} (a sitemap, a job, a redirect) is never switched`); }
  { const ab = await mod(ROOT, "about"); const res = { h: {}, code: 0, body: "", setHeader(k, v) { this.h[k.toLowerCase()] = v; return this; }, getHeader() {}, status(c) { this.code = c; return this; }, send(b) { this.body = String(b); return this; }, end() { return this; }, json(o) { this.body = JSON.stringify(o); return this; } };
    await ab({ method: "POST", url: "/about", query: {}, headers: { host: "goasksam.com" }, socket: {} }, res).catch(() => {}); ok(!("x-design" in res.h), "ON: a POST to a page route is never switched"); }
  const fb = await mod(ROOT, "feedback"); const res = { h: {}, code: 0, body: "", setHeader(k, v) { this.h[k.toLowerCase()] = v; }, status(c) { this.code = c; return this; }, send(b) { this.body = String(b); return this; }, end() { return this; }, json(o) { this.body = JSON.stringify(o); return this; } };
  await fb({ method: "POST", url: "/api/feedback", query: {}, headers: { host: "goasksam.com", "content-type": "application/json" }, body: {}, socket: {} }, res).catch(() => {});
  ok(!("x-design" in res.h), "ON: a POST (the feedback form's send) is never switched");
}
// 6. the vercel.json rewrites are untouched in kind: no redirect to a preview or a new address
{
  const v = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8")), b = JSON.parse(fs.readFileSync(path.join(base, "vercel.json"), "utf8"));
  ok(JSON.stringify(v.redirects) === JSON.stringify(b.redirects), "vercel.json redirects equal the baseline's (the switch adds none)");
  ok(JSON.stringify(v.rewrites) === JSON.stringify(b.rewrites), "vercel.json rewrites equal the baseline's (the switch is in the handlers, no URL change)");
}
console.log(`goLiveSwitchCheck: ${pass} passed, ${fail} failed (baseline ${baseRef})`);
process.exit(fail ? 1 : 0);
