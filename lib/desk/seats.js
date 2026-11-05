// Sam Desk Valuations: seats and the caller gate (Lane S, Nov 4 2026). Spec: three experts for the Hagerty org, "each their own seat".
// =====================================================================
// Who is calling, and for which org:
//   - the signed CREW cookie (lib/_crew.js) is the operator (Sam): acts on any org;
//   - a signed-in account (Supabase Auth bearer, lib/_auth.js) with an ACTIVE seat is that seat, in that seat's ONE org;
//   - anyone else is nobody (the endpoint answers the disguised 404).
// A seat is invited by email (subject "pending:<email>") and binds to the account on its first signed-in call, so the invite works
// for the person who owns that email and nobody else. The limit on seats (3 for Hagerty) is checked here AND by a database trigger.
// A seat never acts outside its own org: canActOnOrg is the single test every Desk write goes through.
import { supabaseSelect, supabaseInsert, supabasePatch } from "../_supabase.js";
import { validateBearer } from "../_auth.js";
import { isCrewRequest } from "../_crew.js";
import { validOrg } from "./storage.js";
import { resolveViewAs } from "./viewAs.js";

export const SEAT_ROLES = Object.freeze(["member", "admin"]);   // 'owner' exists for the operator's own org seat and is never granted here
const EMAIL_RE = /^[A-Za-z0-9._%+-]{1,64}@([A-Za-z0-9-]{1,63}\.)+[A-Za-z]{2,24}$/;
export const pendingSubject = email => "pending:" + String(email || "").trim().toLowerCase();

// THE order of doors: (1) crew WHILE VIEWING AS a seat (explicit, crew-only switch, lib/desk/viewAs.js) is that one seat; (2) crew is the operator; (3) a signed-in account with an active
// seat is that seat. Crew-first is deliberate (the operator keeps the analyst view), so a person who is both crew and a seat sees the Hagerty queue only by switching, never by accident.
// Pass isCrew: () => false to ask "what seat does this ACCOUNT hold" regardless of any crew cookie (the seat-cookie mint does).
export async function resolveCaller(req, { env, validate = validateBearer, isCrew = isCrewRequest, viewAs = resolveViewAs, select } = {}) {
  if (isCrew(req)) {
    const v = await viewAs(req, { env, isCrew, ...(select ? { select } : {}) }).catch(() => null);
    return v || { kind: "crew", operator: true, org: "sam", role: "owner", seatId: null, actor: "crew" };
  }
  const auth = (req && req.headers && (req.headers.authorization || req.headers.Authorization)) || "";
  if (!auth) return null;
  const who = await validate(auth).catch(() => null);
  if (!who || !who.userId) return null;
  const sel = select || supabaseSelect;
  let rows = await sel(env, `desk_seats?select=id,org_id,role,subject&subject=eq.${encodeURIComponent(who.userId)}&active=eq.true&limit=2`);
  if (!Array.isArray(rows)) return null;
  if (!rows.length && who.email) {
    const pend = await sel(env, `desk_seats?select=id,org_id,role,subject&subject=eq.${encodeURIComponent(pendingSubject(who.email))}&active=eq.true&limit=2`);
    if (Array.isArray(pend) && pend.length === 1) {
      const b = await supabasePatch(env, `desk_seats?id=eq.${pend[0].id}&subject=eq.${encodeURIComponent(pendingSubject(who.email))}`, { subject: who.userId });
      if (!b.error) rows = [{ ...pend[0], subject: who.userId }];
    }
  }
  if (rows.length !== 1) return null;   // no seat, or (never expected) two: nobody
  const s = rows[0];
  return { kind: "seat", operator: false, org: s.org_id, role: s.role, seatId: s.id, actor: "seat:" + s.id, email: who.email || null };
}

// THE org test for every Desk action: the operator acts anywhere; a seat only in its own org.
export function canActOnOrg(caller, org) { return !!caller && validOrg(org) && (caller.operator === true || (caller.kind === "seat" && caller.org === org)); }
export function canAdminOrg(caller, org) { return canActOnOrg(caller, org) && (caller.operator === true || caller.role === "admin" || caller.role === "owner"); }

export async function listSeats(env, caller, org) {
  if (!canActOnOrg(caller, org)) return { ok: false, status: 403, error: "not your org" };
  const rows = await supabaseSelect(env, `desk_seats?select=id,email,display_name,role,active,subject,created_at&org_id=eq.${encodeURIComponent(org)}&order=id.asc`);
  if (!Array.isArray(rows)) return { ok: false, status: 500, error: "could not read seats" };
  return { ok: true, seats: rows.map(r => ({ id: r.id, email: r.email, display_name: r.display_name, role: r.role, active: r.active, signed_in: !String(r.subject).startsWith("pending:") && r.subject !== "crew", created_at: r.created_at })) };
}

export async function activeSeatCount(env, org) {
  const rows = await supabaseSelect(env, `desk_seats?select=id&org_id=eq.${encodeURIComponent(org)}&active=eq.true&limit=1000`);
  return Array.isArray(rows) ? rows.length : null;
}

export async function addSeat(env, caller, org, { email, role = "member", displayName = null } = {}) {
  if (!canAdminOrg(caller, org)) return { ok: false, status: 403, error: "only an admin of this org can add a seat" };
  const e = String(email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(e)) return { ok: false, status: 400, error: "that is not an email address" };
  if (!SEAT_ROLES.includes(role)) return { ok: false, status: 400, error: "role must be member or admin" };
  const lim = await supabaseSelect(env, `desk_org_settings?select=seat_limit&org_id=eq.${encodeURIComponent(org)}&limit=1`);
  if (!Array.isArray(lim)) return { ok: false, status: 500, error: "could not read the seat limit" };
  const limit = lim[0] ? lim[0].seat_limit : 3;
  const n = await activeSeatCount(env, org);
  if (n === null) return { ok: false, status: 500, error: "could not count seats" };
  if (n >= limit) return { ok: false, status: 409, error: `this org already has ${n} of ${limit} seats` };
  const ins = await supabaseInsert("desk_seats", [{ org_id: org, subject: pendingSubject(e), email: e, role, display_name: displayName ? String(displayName).slice(0, 120) : null }], env.supabaseUrl, env.supabaseKey, "return=representation");
  if (!ins.ok) {
    const t = String(ins.error || "");
    if (/duplicate|23505/.test(t)) return { ok: false, status: 409, error: "that email already has a seat" };
    if (/active seats \(limit/.test(t)) return { ok: false, status: 409, error: "the seat limit is reached" };
    return { ok: false, status: 500, error: "seat not added" };
  }
  return { ok: true, seat: { id: ins.rows[0].id, email: e, role, active: true, signed_in: false } };
}

export async function deactivateSeat(env, caller, org, seatId) {
  if (!canAdminOrg(caller, org)) return { ok: false, status: 403, error: "only an admin of this org can remove a seat" };
  if (!Number.isInteger(seatId)) return { ok: false, status: 400, error: "bad seat" };
  if (caller.kind === "seat" && caller.seatId === seatId) return { ok: false, status: 409, error: "you cannot remove your own seat" };
  const r = await supabasePatch(env, `desk_seats?id=eq.${seatId}&org_id=eq.${encodeURIComponent(org)}`, { active: false });
  return r.error ? { ok: false, status: 500, error: "seat not removed" } : { ok: true };
}
