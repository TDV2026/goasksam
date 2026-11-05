// WHICH DOOR a /api/desk request came through, and the org and seat the Desk then acts as (Lane S, Nov 5 2026). One function so the API and the check read the same rules:
//   crew + a good "view as" switch   -> that ONE seat, in its one org, Valuations actions only (lib/desk/viewAs.js)
//   crew                             -> the operator: org "sam", seat "crew", every action
//   tester                           -> the tester tier (org "tester")
//   a signed gas_seat cookie         -> that seat, in its one org, Valuations actions only
//   anything else                    -> null (the disguised 404)
// A seat's org is only ever its own seat row's org. Nothing here lets any caller name an org.
import { isCrewRequest } from "../_crew.js";
import { isTesterRequest } from "../_tester.js";
import { resolveSeatCookie } from "./seatCookie.js";
import { resolveViewAs } from "./viewAs.js";

export async function deskDoor(req, { env, isCrew = isCrewRequest, isTester = isTesterRequest, seatCookie = resolveSeatCookie, viewAs = resolveViewAs } = {}) {
  const crew = !!isCrew(req), tester = !!isTester(req);
  let seat = null, viewing = false;
  if (crew && env) { seat = await viewAs(req, { env, isCrew }).catch(() => null); viewing = !!seat; }
  if (!crew && !tester) { seat = env ? await seatCookie(req, { env }).catch(() => null) : null; if (!seat) return null; }
  const ctx = {
    crew: crew && !viewing, tester: tester && !viewing, seatCaller: !!seat,
    viewAs: viewing ? { seatId: seat.seatId, org: seat.org, name: seat.name || null } : null, seatName: seat ? (seat.name || null) : null,
    org: seat ? seat.org : (crew ? "sam" : (tester ? "tester" : "public")), seat: seat ? String(seat.seatId) : "crew"
  };
  return { realCrew: crew, tester, seat, viewing, ctx };
}
