// DESK "VIEW AS" (Lane S, Nov 5 2026). A person who is both crew (the operator, org "sam") and an active seat (Hagerty, Expert 1) used to land in the crew view only, which has no
// Hagerty queue. The crew can now switch, EXPLICITLY, to see the Desk exactly as one named seat sees it:
//   - only a request that ALSO carries the signed crew cookie can use it (a gas_viewas cookie on its own is nothing);
//   - it names ONE seat, re-read on every call (active, and not the crew seat of org sam); the crew then acts AS that seat in that seat's one org, Valuations
//     actions only, with none of the operator's powers while it is on, so a switch can never show a seat another org's data;
//   - it is never automatic: it exists only after a crew POST to /api/desk viewas_set, it lasts 8 hours, it is shown in the footer and every switch and every action taken while
//     viewing is logged (app_usage_events, event desk_view_as).
//   gas_viewas=v1.<expiry ms>.<seat id>.<HMAC-SHA256 over "gas_viewas|v1|<expiry ms>|<seat id>">   same secret as the crew cookie, its own label.
import crypto from "node:crypto";
import { cookieValue, isCrewRequest } from "../_crew.js";
import { supabaseSelect } from "../_supabase.js";

export const VIEWAS_COOKIE = "gas_viewas";
export const VIEWAS_MAX_AGE_S = 8 * 3600;
const key = () => { const s = process.env.CURTAIN_CREW_CODE || ""; return s ? crypto.createHash("sha256").update("gas_viewas_cookie_v1:" + s).digest() : null; };
const sign = (exp, id, k) => crypto.createHmac("sha256", k).update(`gas_viewas|v1|${exp}|${id}`).digest("base64url");

export function mintViewAsValue(seatId, nowMs = Date.now()) {
  const k = key(); if (!k || !Number.isInteger(seatId) || seatId < 1) return null;
  const exp = nowMs + VIEWAS_MAX_AGE_S * 1000;
  return `v1.${exp}.${seatId}.${sign(exp, seatId, k)}`;
}
export function parseViewAsValue(v, nowMs = Date.now()) {
  const m = /^v1\.(\d{13})\.(\d{1,12})\.([A-Za-z0-9_-]{43})$/.exec(String(v || ""));
  if (!m) return null;
  const exp = Number(m[1]), id = Number(m[2]); if (!(exp > nowMs) || !(id >= 1)) return null;
  const k = key(); if (!k) return null;
  const want = Buffer.from(sign(exp, id, k)), got = Buffer.from(m[3]);
  return want.length === got.length && crypto.timingSafeEqual(want, got) ? { seatId: id, exp } : null;
}
export const viewAsHeader = value => `${VIEWAS_COOKIE}=${value}; Path=/; Max-Age=${VIEWAS_MAX_AGE_S}; HttpOnly; Secure; SameSite=Lax`;
export const clearViewAsHeader = () => `${VIEWAS_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

const SEAT_COLS = "id,org_id,role,subject,email,display_name";
const shape = s => ({ kind: "seat", operator: false, org: s.org_id, role: s.role, seatId: s.id, actor: "seat:" + s.id, email: s.email || null, name: s.display_name || s.email || ("Seat " + s.id), viaCrew: true });
// Any ACTIVE seat except the org "sam" crew seat (that one IS the crew view). An invited seat whose person has not signed in yet can be viewed: the switch is the operator's, who can already see every org, and it needs no account.
const realSeat = s => !!s && !!s.subject && s.subject !== "crew";
const pending = s => String(s.subject).startsWith("pending:");

// The seat a CREW request is currently viewing as, or null. Needs the signed crew cookie AND a good gas_viewas AND an active, bound seat row.
export async function resolveViewAs(req, { env, select = supabaseSelect, isCrew = isCrewRequest, nowMs = Date.now() } = {}) {
  if (!env || !isCrew(req)) return null;
  const p = parseViewAsValue(cookieValue(req && req.headers && req.headers.cookie, VIEWAS_COOKIE), nowMs); if (!p) return null;
  const rows = await select(env, `desk_seats?select=${SEAT_COLS}&id=eq.${p.seatId}&active=eq.true&limit=2`).catch(() => null);
  if (!Array.isArray(rows) || rows.length !== 1 || !realSeat(rows[0])) return null;
  return shape(rows[0]);
}

// The seats the crew can view as: every active seat except the crew seat. Crew only; the caller checks that.
export async function listViewable(env, { select = supabaseSelect } = {}) {
  const rows = await select(env, `desk_seats?select=${SEAT_COLS}&active=eq.true&order=org_id.asc,id.asc&limit=200`);
  if (!Array.isArray(rows)) return null;
  return rows.filter(realSeat).map(s => ({ seatId: s.id, org: s.org_id, role: s.role, label: (s.display_name || s.email || ("Seat " + s.id)) + (pending(s) ? " (invited, not signed in yet)" : ""), email: s.email || null }));
}
// One seat by id, for viewas_set: the same test as resolveViewAs.
export async function viewableSeat(env, seatId, { select = supabaseSelect } = {}) {
  if (!Number.isInteger(seatId) || seatId < 1) return null;
  const rows = await select(env, `desk_seats?select=${SEAT_COLS}&id=eq.${seatId}&active=eq.true&limit=2`).catch(() => null);
  return Array.isArray(rows) && rows.length === 1 && realSeat(rows[0]) ? shape(rows[0]) : null;
}
