// CREW-ONLY STATIC PAGES, SERVED BY THE SERVER (Sam, Oct 28 2026). The design preview (/onebox-preview) and the Desk page (/desk) used to sit in public/, where Vercel serves a file to anyone who asks for its path (/onebox-preview.html, /desk.html) and the
// only gate was a script inside the page. They now live in lib/crewPages/ (never served as files) and this function sends them only to a request carrying the signed crew cookie (the Desk also to a tester): everyone else gets the same disguised 404 as a
// page that was never there. vercel.json rewrites /onebox-preview and /desk here.
import fs from "node:fs";
import path from "node:path";
import { isCrewRequest } from "../lib/_crew.js";
import { isTesterRequest } from "../lib/_tester.js";
import { sendDisguisedNotFound } from "../lib/_notFound.js";
import { resolveSeatCookie } from "../lib/desk/seatCookie.js";
import { PREVIEW_PAGES } from "../lib/preview/previewPages.js";
// A page is a file in lib/crewPages/ or a render function (the design previews /preview/home and /preview/find, built from the engine's approved copy at request time). hiddenCrewCheck reads this list, so a page added here is covered by it.
export const PAGES = { "onebox-preview": { file: "onebox-preview.html", tester: true }, desk: { file: "desk.html", tester: true }, "preview-home": { render: PREVIEW_PAGES["preview-home"] }, "preview-find": { render: PREVIEW_PAGES["preview-find"] } };
export default async function handler(req, res) {
  const name = String((req.query && req.query.page) || "").toLowerCase(), p = PAGES[name];
  let seat = false;
  if (p && name === "desk" && !(isCrewRequest(req) || (p.tester && isTesterRequest(req)))) {   // a seat: a signed gas_seat cookie whose seat is still active (re-read here); the page opens in Valuations mode
    const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    seat = !!(url && await resolveSeatCookie(req, { env: { supabaseUrl: url, supabaseKey: key } }).catch(() => null));
  }
  if (!p || !(seat || isCrewRequest(req) || (p.tester && isTesterRequest(req)))) return sendDisguisedNotFound(res, req);
  let html; try { html = p.render ? p.render() : fs.readFileSync(path.join(process.cwd(), "lib/crewPages", p.file), "utf8"); } catch { return sendDisguisedNotFound(res, req); }
  if (seat) html = html.replace("<script>", "<script>window.__DESK_SEAT__=1;</script><script>");
  res.setHeader("Content-Type", "text/html; charset=utf-8"); res.setHeader("Cache-Control", "private, no-store"); res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.status(200).send(html);
}
