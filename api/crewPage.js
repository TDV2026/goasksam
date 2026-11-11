// CREW-ONLY STATIC PAGES, SERVED BY THE SERVER (Sam, Oct 28 2026). The design preview (/onebox-preview) and the Desk page (/desk) used to sit in public/, where Vercel serves a file to anyone who asks for its path (/onebox-preview.html, /desk.html) and the
// only gate was a script inside the page. They now live in lib/crewPages/ (never served as files) and this function sends them only to a request carrying the signed crew cookie (the Desk also to a tester): everyone else gets the same disguised 404 as a
// page that was never there. vercel.json rewrites /onebox-preview and /desk here.
import { noRangeLineOn } from "../lib/noRangeFlag.js";
import fs from "node:fs";
import path from "node:path";
import { isCrewRequest } from "../lib/_crew.js";
import { isTesterRequest } from "../lib/_tester.js";
import { sendDisguisedNotFound } from "../lib/_notFound.js";
import { resolveSeatCookie } from "../lib/desk/seatCookie.js";
import { resolveViewAs } from "../lib/desk/viewAs.js";
import { PREVIEW_PAGES, homeHtmlFor, findHtml } from "../lib/preview/previewPages.js";
import { tasksPublicHtml, crewLimitMax } from "../lib/preview/tasksPreview.js";
import { taskLimitFor } from "../lib/tasks/limit.js";
import { tasksMineHtml, previewTasksApi } from "../lib/preview/tasksMine.js";
import { findField } from "../lib/preview/fieldCompose.js";
import { publicFindExamples as publicFind } from "../lib/preview/publicFind.js";
import { entryHtml, wrapLive, patchOneboxJs, exampleResultOf, exampleFrameHtml } from "../lib/preview/mcSellPreview.js";
import marketCheckPage from "./marketCheck.js";
import sellDoor from "./sell.js";
import findPage from "./buy.js";
import businessPage from "./business.js";
import howPage from "./howSamDecides.js";
import aboutPage from "./about.js";
import whatsNewPage from "./whatsNew.js";
import feedbackPage from "./feedback.js";
import legalPage from "./legal.js";
import historyPage from "./history.js";
import { SITE, wrapSite } from "../lib/preview/sitePages.js";
import { renderDeskPreview, previewDeskApi } from "../lib/preview/deskPreview.js";
import { renderDeskV4, deskV4Shell } from "../lib/preview/deskV4.js";
import { AsyncLocalStorage } from "node:async_hooks";
// PUBLIC MODE (go live Stage 3): when the new design answers a public address (lib/_newDesign.js, newPageHtml), every example read runs in a time box and a read that is slow, fails or says "could not read" leaves its section OUT, silently:
// the search box is in the page the moment it is sent and never waits on an example. The crew previews are unchanged (a failed read still prints its visible line there).
const PUBLIC_CTX = new AsyncLocalStorage();
// In public mode every example is read as a VISITOR reads it: the same request without the crew cookie. The crew look (?design=new) is the flip seen early, so it must show what a visitor will get (the stored daily pick, and nothing at all while PUBLIC_EXAMPLES is off).
const withoutCrew = req => { const headers = { ...((req && req.headers) || {}) }, c = String(headers.cookie || ""); if (c) headers.cookie = c.split(/;\s*/).filter(x => !/^gas_crew=/.test(x)).join("; "); return Object.assign(Object.create(Object.getPrototypeOf(req || {})), req || {}, { headers }); };
const visitorOf = req => PUBLIC_CTX.getStore() ? withoutCrew(req) : req;
export const PUBLIC_READ_MS = Number(process.env.PUBLIC_READ_MS) > 0 ? Number(process.env.PUBLIC_READ_MS) : 2000;
const boxed = async (fn, what) => {
  if (!PUBLIC_CTX.getStore()) return fn();
  let timer; const timeout = new Promise(r => { timer = setTimeout(() => r(null), PUBLIC_READ_MS); });
  try { const r = await Promise.race([Promise.resolve().then(fn), timeout]); return r && typeof r === "object" && r.couldNotRead === true ? null : r; }
  catch (e) { try { console.error(JSON.stringify({ tag: "public_example_failed", what: String(what).slice(0, 120), message: String(e && e.message || e).slice(0, 200) })); } catch {} return null; }
  finally { clearTimeout(timer); }
};
// The crew preview of the Homepage reads Lane B's featuredHistory (the same read GET /api/featuredHistory answers with, crew cookie required inside it). FEATURED is the seam the local run swaps for a test store.
export const FEATURED = { read: async req => { const { historyEnv } = await import("./_historyData.js"), env = historyEnv(); if (!env) return null; const { readFeaturedHistory } = await import("../lib/live/featuredHistory.js"); return readFeaturedHistory(env, visitorOf(req)); }, now: () => Date.now() };
// A page is a file in lib/crewPages/ or a render function (the design previews /preview/home and /preview/find, built from the engine's approved copy at request time). hiddenCrewCheck reads this list, so a page added here is covered by it.
// The Tasks redesign (crew only, not live): the public page reads Lane B's demo field when lib/live/tasksDemo.js exists (tasksDemo(env, req) -> the field or null) and the crew limit when Lane S's exists; otherwise the centrepiece is hidden and the live limit is printed.
// The Tasks preview shows ONE real email (Sam, Nov 8 2026): Lane B's tasksEmailExample(env, req) -> { task, blocks, every } from a real stored update, or null (the section is then absent). Crew only inside the reader.
export const TASKS_EMAIL_EXAMPLE = { read: req => readField("../lib/live/tasksDemo.js", "tasksEmailExample", req) };
// The two new engine fields (Lane B, NEEDED FROM LANE B in docs/lane-notes.md): lib/live/findExamples.js findExamples(env, req) -> the list or null, and lib/live/watchingDemo.js watchingDemo(env, req) -> the field or null. Each is read only when its module exists, crew only; a missing module, a throw or null leaves its section hidden.
// A READ THAT FAILS IS NEVER SILENT (Lane C's standing order, Nov 8 2026, after a94djqku4 went blank): a missing module, a missing export or a thrown read is logged (module, function, message) and answers the COULD-NOT-READ marker, which the preview prints as a visible line where the section would be; a field that is null because the engine sent null stays absent.
// Three different things on the page: absent (the engine sent null), a visible line (the read failed), the section (the field is there). The path is a variable, so vercel.json must list its folder in this function's includeFiles (scripts/crewReadCheck.mjs checks it).
export const COULD_NOT_READ = "couldNotRead";
export const couldNotRead = x => !!x && typeof x === "object" && x[COULD_NOT_READ] === true;
const failed = (what, e) => { try { console.error(JSON.stringify({ tag: "crew_read_failed", what: String(what).slice(0, 120), message: String(e && e.message || e).slice(0, 300) })); } catch {} return { [COULD_NOT_READ]: true, what: String(what) }; };
export const readField = async (file, fn, req) => { try { const { historyEnv } = await import("./_historyData.js"), env = historyEnv(); if (!env) return null; const m = await import(file); if (typeof m[fn] !== "function") return failed(file + " " + fn, new Error("the module has no " + fn)); return await m[fn](env, visitorOf(req)); } catch (e) { return failed(file + " " + fn, e); } };
// the crew preview reads the engine's card field; a PUBLIC page reads the stored daily pick as a visitor does (the two readers /api/publicExamples serves as find and findSales), in one move into the card the page draws (lib/preview/fieldCompose.js publicFindField)
const publicFindExamples = req => publicFind(readField, couldNotRead, req);
export const FIND_EXAMPLES = { read: req => PUBLIC_CTX.getStore() ? publicFindExamples(req) : readField("../lib/live/findExamples.js", "findExamplesField", req), now: () => Date.now() };
// THE ENGINE ANSWERS live ?? fallback ITSELF (Lane B, lane-b-examples3: findExamplesField, tasksDemoField, watchingDemoField, in the engine card shapes of docs/lane-notes.md SHAPES B lane-e-crew-refine8): each reader returns the live answer, else the fallback (a recent sale or ended car), else null. The page reads the one answer and picks nothing.
const safe = async (f, what = "field") => { if (PUBLIC_CTX.getStore()) return boxed(f, what); try { return await f(); } catch (e) { return failed(what, e); } };
// the Tasks limit a PUBLIC page prints is the live one (3); only a crew viewer sees the crew limit
const tasksMaxFor = async req => PUBLIC_CTX.getStore() ? taskLimitFor(isCrewRequest(req) === true) : crewLimitMax();
const tasksPublicFor = async req => { const ex = await safe(() => TASKS_EMAIL_EXAMPLE.read(req), "tasksEmailExample"); return couldNotRead(ex) ? tasksPublicHtml({ max: await tasksMaxFor(req), readError: "Could not read the Tasks email." }) : tasksPublicHtml({ max: await tasksMaxFor(req), emailExample: ex }); };
// FIND RESULTS ON THE NEW SHELL (go live): with a search in the address the page is today's Find page (its own results, its own script) inside the new header, the rail (New search, recent searches) and the footer, exactly as Market Check and Sell are; without one it is the new landing.
const findResultsFor = async req => {
  try { const search = String(req.url).slice(String(req.url).indexOf("?")), live = await capture(findPage, "/find" + search, req); if (live.code !== 200) throw new Error("the live page answered " + live.code); return wrapLive("find", live.body); }
  catch (e) { return previewFailed("find", e); }
};
const findFor = async req => hasSearch(req) ? findResultsFor(req) : findLandingFor(req);
const findLandingFor = async req => { const ex = await safe(() => FIND_EXAMPLES.read(req), "findExamplesField"); return couldNotRead(ex) ? findHtml({ examples: null, readError: "Could not read the Find examples.", now: FIND_EXAMPLES.now() }) : findHtml({ examples: findField(ex, null), now: FIND_EXAMPLES.now() }); };
// MARKET CHECK AND SELL ON THE NEW SHELL (Sam's approved brief, Nov 8 2026; lib/preview/mcSellPreview.js). Without a search in the address the page is the new ENTRY; with one (?q= or ?car= or ?vin=, and every address the live pages push) it is the LIVE page, exactly as the live handler answers it, inside the shell. Nothing is computed here.
// The two example fields are Lane B's (marketCheckExampleSales, sellExample); a field's module that is not built yet is simply absent (the section is hidden), one that is built and fails prints the visible could-not-read line like every other read.
export const MC_EXAMPLES = { read: req => readIfBuilt("../lib/live/marketCheckExamples.js", "marketCheckExampleResult", req) };   // the day's pick car's real result, with its sales as the result's own cards (Lane B)
export const MC_CARD = { read: req => readIfBuilt("../lib/live/marketCheckExamples.js", "marketCheckExample", req) };   // Lane B's Market Check entry card (final entry pages, Nov 9 2026)
export const SELL_CARD = { read: req => readIfBuilt("../lib/live/marketCheckExamples.js", "sellExampleCard", req) };   // Lane B's Sell entry card
export const SELL_EXAMPLE = { read: req => readIfBuilt("../lib/live/marketCheckExamples.js", "sellExample", req) };
async function readIfBuilt(file, fn, req) { try { if (!fs.existsSync(new URL(file.replace("../", "../"), import.meta.url))) return null; } catch { return null; } return readField(file, fn, req); }
const hasSearch = req => /[?&](q|car|vin)=[^&]/.test(String(req.url || ""));
function capture(handler, url, req) {
  // the door (lib/_newDesign.js) has already run the current handler for this very address: its answer is used ONCE instead of running the handler again
  if (req && req.__legacy) { const L = req.__legacy; req.__legacy = null; return Promise.resolve({ code: L.code, h: L.h, body: String(L.body) }); }
  return new Promise((resolve, reject) => {
    const u = new URL(url, "https://goasksam.com"), res = { h: {}, code: 200, setHeader(k, v) { this.h[String(k).toLowerCase()] = v; return this; }, getHeader(k) { return this.h[String(k).toLowerCase()]; }, removeHeader() {}, writeHead(c) { this.code = c; return this; }, status(c) { this.code = c; return this; }, json(o) { return this.send(JSON.stringify(o)); }, end(x) { return this.send(x); }, send(x) { resolve({ code: this.code, h: this.h, body: x == null ? "" : String(x) }); return this; } };
    Promise.resolve(handler({ ...req, __nd: true, method: "GET", url, query: Object.fromEntries(u.searchParams), headers: req.headers || {} }, res)).catch(reject);
  });
}
const previewFailed = (kind, e) => { try { console.error(JSON.stringify({ tag: "crew_preview_failed", kind, message: String(e && e.message || e).slice(0, 300) })); } catch {} return `<!DOCTYPE html><meta charset="utf-8"><title>Preview</title><body style="font:16px system-ui;padding:40px"><p>Could not build the ${kind === "mc" ? "Market Check" : kind === "find" ? "Find" : "Sell"} preview.</p></body>`; };
async function mcSellFor(kind, req) {
  try {
    if (hasSearch(req)) {
      const search = String(req.url).slice(String(req.url).indexOf("?")), live = await capture(kind === "mc" ? marketCheckPage : sellDoor, (kind === "mc" ? "/market-check" : "/sell") + search, req);
      if (live.code !== 200) throw new Error("the live page answered " + live.code);
      return wrapLive(kind, live.body);
    }
    const f = await safe(() => (kind === "mc" ? MC_CARD : SELL_CARD).read(req), kind === "mc" ? "marketCheckExample" : "sellExampleCard");
    return couldNotRead(f) ? entryHtml(kind, { readError: kind === "mc" ? "Could not read the Market Check example." : "Could not read the selling example." }) : entryHtml(kind, kind === "mc" ? { mcCard: f } : { sellCard: f });
  } catch (e) { return previewFailed(kind, e); }
}
// Market Check's script with its one path test widened to the preview path (the live file is never edited); crew only like every page here.
// the entry page's real result: the live Market Check page's own document, handed the engine's result for the day's pick car, drawn by the results script (lib/preview/mcSellPreview.js exampleFrameHtml). No result, no frame: the door answers the 404.
async function exampleFrame(req) {
  const f = await safe(() => MC_EXAMPLES.read(req), "marketCheckExampleResult");
  if (couldNotRead(f) || !exampleResultOf(f)) throw new Error("no example result");
  const live = await capture(marketCheckPage, "/market-check", req); if (live.code !== 200) throw new Error("the live page answered " + live.code);
  return exampleFrameHtml(live.body, f);
}
function oneboxJs() { return patchOneboxJs(fs.readFileSync(path.join(process.cwd(), "public", "js", "onebox.js"), "utf8")); }
// THE SITE PAGES ON THE NEW SHELL (Sam's order, Nov 9 2026; lib/preview/sitePages.js): the live handler's own page, its <main> carried over byte for byte inside the approved header and footer, no rail. A page that cannot be built answers the platform 404.
const SITE_HANDLERS = { business: businessPage, how: howPage, about: aboutPage, whatsnew: whatsNewPage, feedback: feedbackPage, terms: legalPage, privacy: legalPage };
async function siteFor(key, req) {
  const s = SITE[key], live = await capture(SITE_HANDLERS[key], "/api/" + s.api + (s.query ? "?" + s.query : ""), req);
  if (live.code !== 200) throw new Error("the live page answered " + live.code);
  return wrapSite(live.body);
}
// the history pages: the index, a hub (/preview/history/<slug>) and a VIN page (/preview/history/<slug>/<vin>), each the live handler's own page for the same address. A page the live handler does not serve (an unknown hub, a redirect, "Sam is busy") answers the platform 404.
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,120}$/, VIN_RE = /^[A-Za-z0-9]{5,20}$/;
async function historyFor(req) {
  const q = req.query || {}, slug = String(q.slug || ""), vin = String(q.vin || "");
  if ((slug && !SLUG_RE.test(slug)) || (vin && !VIN_RE.test(vin))) throw new Error("not a history address");
  const live = await capture(historyPage, "/api/history?" + (slug ? "slug=" + encodeURIComponent(slug) + (vin ? "&vin=" + encodeURIComponent(vin) : "") : "index=1"), req);
  if (live.code !== 200) throw new Error("the live history page answered " + live.code);
  return wrapSite(live.body);
}
const SITE_PAGES = Object.fromEntries(Object.keys(SITE).map(k => ["preview-site-" + k, { frame: true, render: () => "", renderAsync: req => siteFor(k, req) }]));
export const PAGES = { ...SITE_PAGES, "preview-history": { frame: true, render: () => "", renderAsync: historyFor }, "onebox-preview": { file: "onebox-preview.html", tester: true }, desk: { file: "desk.html", tester: true }, "preview-tasks": { render: () => tasksPublicHtml({}), renderAsync: tasksPublicFor }, "preview-tasks-mine": { render: tasksMineHtml }, "preview-desk": { render: () => deskV4Shell(), renderAsync: renderDeskV4 }, "preview-desk-valuations": { render: renderDeskPreview }, "preview-home": { render: PREVIEW_PAGES["preview-home"], renderAsync: req => homeHtmlFor(req, { read: r => boxed(() => FEATURED.read(r), "featuredHistory"), now: FEATURED.now() }) }, "preview-find": { render: PREVIEW_PAGES["preview-find"], renderAsync: findFor }, "preview-market-check": { render: () => entryHtml("mc"), renderAsync: req => mcSellFor("mc", req) }, "preview-sell": { render: () => entryHtml("sell"), renderAsync: req => mcSellFor("sell", req) }, "preview-market-check-example": { frame: true, render: () => { throw new Error("no example result"); }, renderAsync: exampleFrame }, "preview-onebox-js": { render: oneboxJs, contentType: "application/javascript; charset=utf-8" } };
export default async function handler(req, res) {
  const name = String((req.query && req.query.page) || "").toLowerCase(), p = PAGES[name];
  if (name === "preview-tasks-api") {   // the Tasks preview's own door: crew only, POST only; the live handler answers (lib/preview/tasksMine.js)
    if (req.method !== "POST" || !isCrewRequest(req)) return sendDisguisedNotFound(res, req);
    if (typeof req.body === "string") { try { req.body = JSON.parse(req.body); } catch { req.body = {}; } }
    return previewTasksApi(req, res);
  }
  if (name === "preview-desk-api") {   // the redesigned Desk preview's own door (lib/preview/deskPreview.js): crew only, POST only, sample sheets only
    if (req.method !== "POST" || !isCrewRequest(req)) return sendDisguisedNotFound(res, req);
    let b = req.body; if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } }
    const out = await previewDeskApi(b || {}); res.setHeader("Content-Type", "application/json; charset=utf-8"); res.setHeader("Cache-Control", "private, no-store"); res.setHeader("X-Robots-Tag", "noindex, nofollow");
    return res.status(200).send(JSON.stringify(out));
  }
  let seat = false;
  if (p && name === "desk" && !(isCrewRequest(req) || (p.tester && isTesterRequest(req)))) {   // a seat: a signed gas_seat cookie whose seat is still active (re-read here); the page opens in Valuations mode
    const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    seat = !!(url && await resolveSeatCookie(req, { env: { supabaseUrl: url, supabaseKey: key } }).catch(() => null));
  }
  let viewing = false;   // the crew, switched to view as one seat: the page opens as that seat does (Valuations only) with the way back
  if (p && name === "desk" && isCrewRequest(req)) { const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY; viewing = !!(url && await resolveViewAs(req, { env: { supabaseUrl: url, supabaseKey: key } }).catch(() => null)); }
  if (!p || !(seat || isCrewRequest(req) || (p.tester && isTesterRequest(req)))) return sendDisguisedNotFound(res, req);
  let html; try { html = p.renderAsync ? await p.renderAsync(req) : p.render ? p.render() : fs.readFileSync(path.join(process.cwd(), "lib/crewPages", p.file), "utf8"); } catch { return sendDisguisedNotFound(res, req); }
  if (name === "desk") html = html.replace("<script>", "<script>window.GAS_NORANGE=" + (noRangeLineOn(req) ? "true" : "false") + ";</script><script>");   // the no-range wording flag (lib/noRangeFlag.js)
  if (seat) html = html.replace("<script>", "<script>window.__DESK_SEAT__=1;</script><script>");
  else if (viewing) html = html.replace("<script>", "<script>window.__DESK_VIEWAS__=1;</script><script>");
  res.setHeader("Content-Type", p.contentType || "text/html; charset=utf-8"); res.setHeader("Cache-Control", "private, no-store"); res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.status(200).send(html);
}

// Kept AFTER the crew handler on purpose: featuredHistoryCheck reads this file top to bottom and wants the crew gate (sendDisguisedNotFound) before the first preview render. This public door has no crew test of its own; the switch is the permission, and the featured field still checks the crew cookie inside its reader.
// The new design's page for a public address (lib/_newDesign.js): the same renderer the crew preview uses, no crew test here (the switch is the permission).
export function newPageHtml(name, req) { return PUBLIC_CTX.run({ public: true }, () => newPageHtmlIn(name, req)); }
async function newPageHtmlIn(name, req) {
  const p = PAGES[name]; if (!p) return null;
  const html = p.renderAsync ? await p.renderAsync(req) : p.render ? p.render() : fs.readFileSync(path.join(process.cwd(), "lib/crewPages", p.file), "utf8");
  if (/^<!DOCTYPE html><meta charset="utf-8"><title>Preview<\/title>/.test(String(html))) throw new Error("the new page could not be built (" + name + ")");   // the preview's could-not-build page is never a public answer
  return html;
}
