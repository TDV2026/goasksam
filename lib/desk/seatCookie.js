// The Desk seat door (Lane C, Nov 4 2026). A seat is a signed-in account holding an active desk_seats row (lib/desk/seats.js resolveCaller). The Desk page is routed only for a request carrying a signed cookie
// (the router answers the platform's own 404 otherwise), so a seat gets one: gas_seat, minted by POST /api/deskSeat after resolveCaller confirms the seat.
//
//   gas_seat=s1.<expiry ms>.<seat id>.<HMAC-SHA256 over "gas_seat|s1|<expiry ms>|<seat id>">
//
// Same secret as the crew cookie (CURTAIN_CREW_CODE) under its own label, so a crew value can never pass as a seat value or the reverse. The cookie proves who the seat WAS when it was minted; it is never trusted
// alone: every call re-reads the seat row (active, bound to an account, not the crew seat), so a removed seat is out on the next call. With no secret set nothing is a seat (fail closed).
import crypto from "node:crypto";
import { cookieValue } from "../_crew.js";
import { supabaseSelect } from "../_supabase.js";

export const SEAT_COOKIE = "gas_seat";
export const SEAT_MAX_AGE_S = 30 * 24 * 3600;
export const SEAT_SHAPE_RE_SRC = "(?:^|; )gas_seat=s1\\.";   // the router's and the page's shape test; never trusted for access
const key = () => { const s = process.env.CURTAIN_CREW_CODE || ""; return s ? crypto.createHash("sha256").update("gas_seat_cookie_v1:" + s).digest() : null; };
const sign = (exp, id, k) => crypto.createHmac("sha256", k).update(`gas_seat|s1|${exp}|${id}`).digest("base64url");

export function mintSeatCookieValue(seatId, nowMs = Date.now()) {
  const k = key(); if (!k || !Number.isInteger(seatId) || seatId < 1) return null;
  const exp = nowMs + SEAT_MAX_AGE_S * 1000;
  return `s1.${exp}.${seatId}.${sign(exp, seatId, k)}`;
}
export function parseSeatCookieValue(v, nowMs = Date.now()) {
  const m = /^s1\.(\d{13})\.(\d{1,12})\.([A-Za-z0-9_-]{43})$/.exec(String(v || ""));
  if (!m) return null;
  const exp = Number(m[1]), id = Number(m[2]); if (!(exp > nowMs) || !(id >= 1)) return null;
  const k = key(); if (!k) return null;
  const want = Buffer.from(sign(exp, id, k)), got = Buffer.from(m[3]);
  return want.length === got.length && crypto.timingSafeEqual(want, got) ? { seatId: id, exp } : null;
}
export const seatCookieHeader = (value, maxAge = SEAT_MAX_AGE_S) => `${SEAT_COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;

// The seat behind a request's cookie, or null: signature good, not expired, and the seat row is active, bound to an account (not pending, not the crew seat). Same shape as resolveCaller's seat.
export async function resolveSeatCookie(req, { env, select = supabaseSelect, nowMs = Date.now() } = {}) {
  if (!env) return null;
  const p = parseSeatCookieValue(cookieValue(req && req.headers && req.headers.cookie, SEAT_COOKIE), nowMs); if (!p) return null;
  const rows = await select(env, `desk_seats?select=id,org_id,role,subject,email,display_name&id=eq.${p.seatId}&active=eq.true&limit=2`).catch(() => null);
  if (!Array.isArray(rows) || rows.length !== 1) return null;
  const s = rows[0];
  if (!s.subject || s.subject === "crew" || String(s.subject).startsWith("pending:")) return null;
  return { kind: "seat", operator: false, org: s.org_id, role: s.role, seatId: s.id, actor: "seat:" + s.id, email: s.email || null, name: s.display_name || s.email || ("Seat " + s.id) };
}
