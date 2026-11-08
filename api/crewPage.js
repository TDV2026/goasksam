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
import { tasksMineHtml, previewTasksApi } from "../lib/preview/tasksMine.js";
import { renderDeskPreview, previewDeskApi } from "../lib/preview/deskPreview.js";
// The crew preview of the Homepage reads Lane B's featuredHistory (the same read GET /api/featuredHistory answers with, crew cookie required inside it). FEATURED is the seam the local run swaps for a test store.
export const FEATURED = { read: async req => { const { historyEnv } = await import("./_historyData.js"), env = historyEnv(); if (!env) return null; const { readFeaturedHistory } = await import("../lib/live/featuredHistory.js"); return readFeaturedHistory(env, req); }, now: () => Date.now() };
// A page is a file in lib/crewPages/ or a render function (the design previews /preview/home and /preview/find, built from the engine's approved copy at request time). hiddenCrewCheck reads this list, so a page added here is covered by it.
// The Tasks redesign (crew only, not live): the public page reads Lane B's demo field when lib/live/tasksDemo.js exists (tasksDemo(env, req) -> the field or null) and the crew limit when Lane S's exists; otherwise the centrepiece is hidden and the live limit is printed.
export const TASKS_DEMO = { read: async req => { try { const { historyEnv } = await import("./_historyData.js"), env = historyEnv(); if (!env) return null; const m = await import("../lib/live/tasksDemo.js"); return typeof m.tasksDemo === "function" ? await m.tasksDemo(env, req) : null; } catch { return null; } }, now: () => Date.now() };
// The two new engine fields (Lane B, NEEDED FROM LANE B in docs/lane-notes.md): lib/live/findExamples.js findExamples(env, req) -> the list or null, and lib/live/watchingDemo.js watchingDemo(env, req) -> the field or null. Each is read only when its module exists, crew only; a missing module, a throw or null leaves its section hidden.
const readField = async (file, fn, req) => { try { const { historyEnv } = await import("./_historyData.js"), env = historyEnv(); if (!env) return null; const m = await import(file); return typeof m[fn] === "function" ? await m[fn](env, req) : null; } catch { return null; } };
export const FIND_EXAMPLES = { read: req => readField("../lib/live/findExamples.js", "findExamples", req), now: () => Date.now() };
export const WATCHING_DEMO = { read: req => readField("../lib/live/watchingDemo.js", "watchingDemo", req), now: () => Date.now() };
const tasksPublicFor = async req => { let demo = null, watching = null; try { demo = await TASKS_DEMO.read(req); } catch { demo = null; } try { watching = await WATCHING_DEMO.read(req); } catch { watching = null; } return tasksPublicHtml({ max: await crewLimitMax(), demo, watching, now: TASKS_DEMO.now() }); };
const findFor = async req => { let examples = null; try { examples = await FIND_EXAMPLES.read(req); } catch { examples = null; } return findHtml({ examples, now: FIND_EXAMPLES.now() }); };
export const PAGES = { "onebox-preview": { file: "onebox-preview.html", tester: true }, desk: { file: "desk.html", tester: true }, "preview-tasks": { render: () => tasksPublicHtml({}), renderAsync: tasksPublicFor }, "preview-tasks-mine": { render: tasksMineHtml }, "preview-desk": { render: renderDeskPreview }, "preview-home": { render: PREVIEW_PAGES["preview-home"], renderAsync: req => homeHtmlFor(req, { read: FEATURED.read, now: FEATURED.now() }) }, "preview-find": { render: PREVIEW_PAGES["preview-find"], renderAsync: findFor } };
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
  res.setHeader("Content-Type", "text/html; charset=utf-8"); res.setHeader("Cache-Control", "private, no-store"); res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.status(200).send(html);
}
