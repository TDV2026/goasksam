// The Desk seat door (Lane C, Nov 4 2026; lib/desk/seatCookie.js). POST with the signed-in account's bearer: if resolveCaller finds an active seat, answer 200 and set the signed gas_seat cookie that the router
// and /api/desk accept. Anyone else (no bearer, no seat, the crew) gets the platform's own 404 as a page that was never there. Called quietly by the site's sign-in (public/js/auth.js) and nothing is linked.
import { sendDisguisedNotFound } from "../lib/_notFound.js";
import { supabaseEnv } from "../lib/_supabase.js";
import { resolveCaller } from "../lib/desk/seats.js";
import { mintSeatCookieValue, seatCookieHeader } from "../lib/desk/seatCookie.js";
import { routeLimit, sendTooMany } from "../lib/_routeLimit.js";

export default async function handler(req, res) {
  const env = supabaseEnv();
  if (req.method !== "POST" || !env) return sendDisguisedNotFound(res, req);
  const lim = await routeLimit(env, req, "desk_seat", { route: "/api/deskSeat" }); if (!lim.ok) return sendTooMany(res, lim.retryAfter);
  let caller = null; try { caller = await resolveCaller(req, { env }); } catch { caller = null; }
  if (!caller || caller.kind !== "seat") return sendDisguisedNotFound(res, req);
  const v = mintSeatCookieValue(caller.seatId); if (!v) return sendDisguisedNotFound(res, req);
  res.setHeader("Set-Cookie", seatCookieHeader(v)); res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ ok: true });
}
