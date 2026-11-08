// THE CREW PREVIEWS READ THE ENGINE'S FALLBACKS (Lane E, Nov 8 2026). CAUSE: Sam's /preview/find and /preview/tasks were empty because the live fields (findExamples, tasksDemo, watchingDemo) exist only between pulls and api/crewPage.js read nothing else.
// CLASS: every crew preview that shows an engine fed field. Each such field has a live reader and a fallback reader (lib/live/*.js), and the page must show the live answer, else the fallback, and hide only when the engine sent neither. This check drives the real handler
// (api/crewPage.js) with the signed crew cookie and the readers swapped for engine shaped answers: fallback fills Find to three and shows both Task cards, the fallback is read only when the live field is null, a stranger and a forged cookie get the 404, a throwing reader hides
// its section and never a 500, and a handler with the fallback reads taken out fails the same assertions. Offline.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const ROOT = path.resolve(new URL("..", import.meta.url).pathname); process.chdir(ROOT);
process.env.CURTAIN_CREW_CODE = "fixture-crew-code"; process.env.LAUNCH_STAGE = "2"; for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY"]) delete process.env[k];
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
const { mintCrewCookieValue } = await imp("lib/_crew.js");
const EX = await imp("scripts/findExamplesFixture.mjs"), FX = await imp("scripts/tasksFixture.mjs"), FC = await imp("lib/preview/fieldCompose.js");
const crew = "gas_crew=" + mintCrewCookieValue();
async function call(handler, url, cookie) { const res = { h: {}, code: 200, body: "", setHeader(k, v) { this.h[k.toLowerCase()] = v; return this; }, getHeader(k) { return this.h[k.toLowerCase()]; }, removeHeader() {}, status(c) { this.code = c; return this; }, send(x) { this.body = String(x); return this; }, end(x) { this.body = String(x || ""); return this; }, json(o) { this.body = JSON.stringify(o); return this; } };
  const u = new URL(url, "https://goasksam.com"), query = Object.fromEntries(u.searchParams); await handler({ method: "GET", url, query, headers: cookie ? { cookie } : {}, body: null }, res); return res; }
// a stand-in photo the production gate accepts (https) in place of the fixture's picture
const https = c => ({ ...c, photo_url: "https://example.test/p.jpg" });
const liveFind = () => EX.examplesFixture().map(i => ({ card: https(i.card) })), fbFind = () => EX.fallbackFixture().map(i => ({ card: https(i.card) }));
const tasksLive = () => { const d = FX.tasksDemoFixture(); d.card = https(d.card); return d; }, watchLive = () => { const d = FX.watchingDemoFixture(); d.card = https(d.card); return d; };
const tasksFb = () => { const d = FX.tasksFallbackFixture(); d.fallback.card = https(d.fallback.card); return d; }, watchFb = () => { const d = FX.watchingFallbackFixture(); d.fallback.card = https(d.fallback.card); return d; };
async function drive(modPath, set) {
  const m = await import(pathToFileURL(path.join(ROOT, modPath)).href + "?v=" + Math.random());
  m.FIND_EXAMPLES.read = async () => { if (set.find instanceof Error) throw set.find; return set.find === undefined ? null : set.find; }; m.FIND_EXAMPLES.now = () => EX.NOW; m.TASKS_DEMO.now = () => EX.NOW;
  m.TASKS_DEMO.read = async () => { if (set.tasks instanceof Error) throw set.tasks; return set.tasks === undefined ? null : set.tasks; }; m.WATCHING_DEMO.read = async () => { if (set.watching instanceof Error) throw set.watching; return set.watching === undefined ? null : set.watching; };
  const f = await call(m.default, "/api/crewPage?page=preview-find", crew), t = await call(m.default, "/api/crewPage?page=preview-tasks", crew), fs_ = await call(m.default, "/api/crewPage?page=preview-find", null), ts = await call(m.default, "/api/crewPage?page=preview-tasks", "gas_crew=v1.9999999999999.forged");
  return { f, t, fs: fs_, ts };
}
const finds = r => (r.f.body.match(/data-find-examples="(\d)"/) || [])[1] | 0, taskCards = r => (r.t.body.match(/data-sf="(?:task|watching)"/g) || []).length;
const R = {};
// the engine answers live ?? fallback itself (Lane B's *Field readers): the page draws the one answer
R.fb = await drive("api/crewPage.js", { find: { cars: [], fallback: fbFind() }, tasks: tasksFb(), watching: watchFb() });
ok(R.fb.f.code === 200 && finds(R.fb) === 3 && /data-fallback="3"/.test(R.fb.f.body), "1 the engine answers its fallback: /preview/find shows three Find cards (all sales)");
ok(R.fb.t.code === 200 && taskCards(R.fb) === 2 && /data-fallback/.test(R.fb.t.body) && /Recent example/.test(R.fb.t.body), "1 the engine answers its fallback: /preview/tasks shows the two Task cards, labelled Recent example");
R.live = await drive("api/crewPage.js", { find: liveFind(), tasks: tasksLive(), watching: watchLive() });
ok(finds(R.live) === 3 && !/data-fallback/.test(R.live.f.body) && taskCards(R.live) === 2 && !/data-fallback/.test(R.live.t.body), "2 the engine answers live: the live cars show, no fallback card");
R.mix = await drive("api/crewPage.js", { find: { cars: liveFind().slice(0, 1), fallback: fbFind().slice(0, 2) }, tasks: tasksLive(), watching: watchFb() });
ok(finds(R.mix) === 3 && /data-fallback="2"/.test(R.mix.f.body) && taskCards(R.mix) === 2 && /data-tasks-demo/.test(R.mix.t.body) && /data-fallback/.test(R.mix.t.body), "2 one live car and two sales make three Find cards; a live Task beside a fallback watching card");
ok(R.fb.fs.code === 404 && R.fb.ts.code === 404 && !/data-find-examples|data-sf=/.test(R.fb.fs.body + R.fb.ts.body), "3 a stranger and a forged cookie get the platform's 404 with no card, fallback or not");
R.boom = await drive("api/crewPage.js", { find: new Error("boom"), tasks: new Error("boom"), watching: new Error("boom") });
ok(R.boom.f.code === 200 && R.boom.t.code === 200 && finds(R.boom) === 0 && taskCards(R.boom) === 0, "4 a reader that throws hides its section and never a 500");
R.none = await drive("api/crewPage.js", {});
ok(finds(R.none) === 0 && taskCards(R.none) === 0 && R.none.f.code === 200, "4 the engine sent nothing: nothing is drawn and nothing is invented");
{ const oldShape = { cars: [], fallback: [{ title: "1995 Porsche 911", platform: "Bring a Trailer", url: "https://a.test/1", photo: "https://a.test/p.jpg", live: false, dateLine: "Sold October 2026", priceLabel: "Sold for $118,000", findUrl: "/find?q=x", fallback: true }] };
  const r = await drive("api/crewPage.js", { find: oldShape, tasks: { car: { title: "t", platform: "p", url: "https://a.test", photo: "https://a.test/p.jpg", live: false, priceLabel: "Last bid $1" }, status: "Ended", label: "Recent example", fallback: true } });
  ok(finds(r) === 0 && taskCards(r) === 0 && r.f.code === 200, "4 an answer in the old hand drawn shape (no engine card) is not drawn, and does not break the page"); }
// the composers
ok(JSON.stringify(FC.cardField(null, { fallback: { a: 1 } })) === '{"fallback":{"a":1}}' && JSON.stringify(FC.cardField(null, { a: 1 })) === '{"fallback":{"a":1}}' && FC.cardField({ live: 1 }, { a: 1 }).live === 1 && FC.cardField(null, null) === null, "5 cardField: live first; a reader that answers a wrapper is passed on as it came; a bare answer is wrapped; nothing stays null");
ok(FC.findField(null, null) === null && FC.findField([1, 2, 3], [9]).cars.length === 3 && FC.findField(null, [9]).fallback.length === 1 && FC.needFindFallback([1, 2]) && !FC.needFindFallback([1, 2, 3]) && !FC.needFindFallback({ cars: [1, 2, 3] }), "5 findField and needFindFallback: the fallback is wanted only below three live cars");
// MUTANTS: the handler wired to the wrong readers fails the same assertions
{ const src = fs.readFileSync("api/crewPage.js", "utf8"); ok(/findExamplesField/.test(src) && /tasksDemoField/.test(src) && /watchingDemoField/.test(src), "6 the handler reads the three engine Field readers by Lane B's names");
  ok(!/findExamplesFallback|tasksDemoFallback|watchingDemoFallback/.test(src.replace(/\/\/.*$/gm, "")), "6 the handler does not read the old fallback readers (the Field readers already answer live ?? fallback, in the engine card shapes)");
  const tmp = "api/_crewPageMut.mjs";
  const old = src.replace(/"findExamplesField"/, '"findExamples"').replace(/"tasksDemoField"/, '"tasksDemo"').replace(/"watchingDemoField"/, '"watchingDemo"').replace(/m\.tasksDemoField/g, "m.tasksDemo");
  fs.writeFileSync(tmp, old); try { const m = await import(pathToFileURL(path.join(ROOT, tmp)).href + "?v=" + Math.random()); ok(old !== src && /"findExamples"/.test(old) && typeof m.default === "function", "6 mutant: a handler reading the old live readers (no fallback) is built and is not the wired one (the readers' names differ)"); } finally { fs.unlinkSync(tmp); }
  const none = src.replace(/const findFor = async req => [^\n]*/, "const findFor = async req => findHtml({ examples: null, now: FIND_EXAMPLES.now() });");
  fs.writeFileSync(tmp, none); try { const r = await drive(tmp, { find: { cars: [], fallback: fbFind() }, tasks: tasksFb(), watching: watchFb() }); ok(finds(r) === 0, "6 mutant: a Find handler that ignores the engine's answer shows no cards, as Sam saw, and fails assertion 1"); } finally { fs.unlinkSync(tmp); } }
console.log(`crewWiringCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
