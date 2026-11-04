// DESK: the calling seat for Lane D's endpoints, from Lane S's one seat module (lib/desk/seats.js resolveCaller). A seat is itself; the operator (signed crew
// cookie) acts for the seeded crew seat of org "sam". Anyone else is nobody: the endpoint answers the disguised 404.
import { resolveCaller, canActOnOrg } from "../seats.js";

export async function callerSeat(req, env, store) {
  const caller = await resolveCaller(req, { env });
  if (!caller || !canActOnOrg(caller, caller.org)) return null;
  const org = await store.orgById(caller.org);
  if (!org) return null;
  if (caller.kind === "seat") return { caller, org, seat: { id: caller.seatId, email: caller.email || null } };
  const crew = (await store.seatsOf(caller.org)).find(s => s.subject === "crew");
  return crew ? { caller, org, seat: { id: crew.id, email: crew.email || null } } : null;
}
