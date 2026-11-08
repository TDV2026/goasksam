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
const emailEx = () => FX.tasksEmailFixture();
async function drive(modPath, set) {
  const m = await import(pathToFileURL(path.join(ROOT, modPath)).href + "?v=" + Math.random());
  m.FIND_EXAMPLES.read = async () => { if (set.find instanceof Error) throw set.find; return set.find === undefined ? null : set.find; }; m.FIND_EXAMPLES.now = () => EX.NOW;
  if (m.TASKS_EMAIL_EXAMPLE) m.TASKS_EMAIL_EXAMPLE.read = async () => { if (set.email instanceof Error) throw set.email; return set.email === undefined ? null : set.email; };
  const f = await call(m.default, "/api/crewPage?page=preview-find", crew), t = await call(m.default, "/api/crewPage?page=preview-tasks", crew), fs_ = await call(m.default, "/api/crewPage?page=preview-find", null), ts = await call(m.default, "/api/crewPage?page=preview-tasks", "gas_crew=v1.9999999999999.forged");
  return { f, t, fs: fs_, ts };
}
const finds = r => (r.f.body.match(/data-find-examples="(\d)"/) || [])[1] | 0, emails = r => (r.t.body.match(/data-task-email="1"/g) || []).length;
const R = {};
R.live = await drive("api/crewPage.js", { find: liveFind(), email: emailEx() });
ok(R.live.f.code === 200 && finds(R.live) === 3, "1 the engine answers live: /preview/find shows the three landing cards");
ok(R.live.t.code === 200 && emails(R.live) === 1 && /Here&#39;s what happens when Sam finds a match|Here's what happens when Sam finds a match/.test(R.live.t.body) && /New since your last email/.test(R.live.t.body) && /1995 BMW M3 Coupe/.test(R.live.t.body), "1 the engine answers its stored update: /preview/tasks shows the one real Task match email");
R.fb = await drive("api/crewPage.js", { find: { cars: [], fallback: fbFind() } });
ok(finds(R.fb) === 0 && R.fb.f.code === 200, "2 only completed sales to show: the Find landing row (\"currently at auction\") is absent, not filled with sales");
R.mix = await drive("api/crewPage.js", { find: { cars: liveFind().slice(0, 2), fallback: fbFind() } });
ok(finds(R.mix) === 2, "2 two live cars show two cards (the fallback sales are not drawn)");
ok(emails(R.fb) === 0 && R.fb.t.code === 200 && /More than a saved search/.test(R.fb.t.body) && /Completely free/.test(R.fb.t.body), "2 no engine field for the email: the section is absent and the rest of the Tasks page stands");
ok(R.live.fs.code === 404 && R.live.ts.code === 404 && !/data-find-examples|data-task-email/.test(R.live.fs.body + R.live.ts.body), "3 a stranger and a forged cookie get the platform's 404 with no card and no email");
R.boom = await drive("api/crewPage.js", { find: new Error("boom"), email: new Error("boom") });
ok(R.boom.f.code === 200 && R.boom.t.code === 200 && finds(R.boom) === 0 && emails(R.boom) === 0, "4 a reader that throws hides its section and never a 500");
R.none = await drive("api/crewPage.js", {});
ok(finds(R.none) === 0 && emails(R.none) === 0 && R.none.f.code === 200, "4 the engine sent nothing: nothing is drawn and nothing is invented");
{ const bad = emailEx(); bad.blocks = [{ cardHtml: "<table></table>" }]; const old = { cars: [{ title: "1995 Porsche 911", platform: "Bring a Trailer", url: "https://a.test/1", photo: "https://a.test/p.jpg", live: true, findUrl: "/find?q=x", priceLabel: "Current bid $1" }] };
  const r = await drive("api/crewPage.js", { find: old, email: bad });
  ok(finds(r) === 0 && emails(r) === 0 && r.f.code === 200, "4 an answer in the old hand drawn shape (no engine card), or an email example that is not complete, is not drawn and does not break the page"); }
// the composers
ok(JSON.stringify(FC.cardField(null, { fallback: { a: 1 } })) === '{"fallback":{"a":1}}' && JSON.stringify(FC.cardField(null, { a: 1 })) === '{"fallback":{"a":1}}' && FC.cardField({ live: 1 }, { a: 1 }).live === 1 && FC.cardField(null, null) === null, "5 cardField: live first; a reader that answers a wrapper is passed on as it came; a bare answer is wrapped; nothing stays null");
ok(FC.findField(null, null) === null && FC.findField([1, 2, 3], [9]).cars.length === 3 && FC.findField(null, [9]).fallback.length === 1 && FC.needFindFallback([1, 2]) && !FC.needFindFallback([1, 2, 3]) && !FC.needFindFallback({ cars: [1, 2, 3] }), "5 findField and needFindFallback: the fallback is wanted only below three live cars");
// MUTANTS: the handler wired to the wrong readers fails the same assertions
{ const src = fs.readFileSync("api/crewPage.js", "utf8"); ok(/findExamplesField/.test(src) && /tasksEmailExample/.test(src), "6 the handler reads the engine's findExamplesField and tasksEmailExample by name");
  ok(!/findExamplesFallback|tasksDemoFallback|watchingDemoFallback/.test(src.replace(/\/\/.*$/gm, "")), "6 the handler does not read the old fallback readers (the Field readers already answer live ?? fallback, in the engine card shapes)");
  const tmp = "api/_crewPageMut.mjs";
  const old = src.replace(/"findExamplesField"/, '"findExamples"').replace(/"tasksEmailExample"/, '"tasksDemo"');
  fs.writeFileSync(tmp, old); try { ok(old !== src && /"findExamples"/.test(old), "6 mutant: a handler reading the old live readers is not the wired one (the readers' names differ)"); } finally { fs.unlinkSync(tmp); }
  const noFind = src.replace(/const findFor = async req => [^\n]*/, "const findFor = async req => findHtml({ examples: null, now: FIND_EXAMPLES.now() });");
  fs.writeFileSync(tmp, noFind); try { const r = await drive(tmp, { find: liveFind(), email: emailEx() }); ok(finds(r) === 0, "6 mutant: a Find handler that ignores the engine's answer shows no cards, as Sam saw, and fails assertion 1"); } finally { fs.unlinkSync(tmp); }
  const noMail = src.replace(/const tasksPublicFor = async req => [^\n]*/, "const tasksPublicFor = async req => tasksPublicHtml({ max: await crewLimitMax(), emailExample: null });");
  fs.writeFileSync(tmp, noMail); try { const r = await drive(tmp, { find: liveFind(), email: emailEx() }); ok(noMail !== src && emails(r) === 0, "6 mutant: a Tasks handler that ignores the engine's stored update shows no email and fails assertion 1"); } finally { fs.unlinkSync(tmp); } }
console.log(`crewWiringCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
