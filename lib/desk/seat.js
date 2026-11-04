// DESK: who is calling (Lane D, Nov 2026). A seat is a row of desk_seats in one org. The signed crew cookie is the seeded owner seat of org "sam"; a signed-in
// user (Supabase bearer) is the seat whose email matches, in exactly one org. Lane S owns seat and org admin; this is only the read both new endpoints share.
import { isCrewRequest } from "../_crew.js";
import { validateBearer } from "../_auth.js";

export async function resolveSeat(req, store) {
  if (isCrewRequest(req)) {
    const org = await store.orgById("sam");
    const seat = org && (await store.seatsOf("sam")).find(s => s.subject === "crew");
    if (org && seat) return { org, seat: { ...seat, email: seat.email || "crew@goasksam.com" } };
  }
  const user = await validateBearer(req.headers && (req.headers.authorization || req.headers.Authorization));
  if (user && user.email && store.seatByEmail) {
    const hit = await store.seatByEmail(user.email);
    if (hit) return hit;
  }
  return null;
}
