// A SEAT'S NAME (Lane D, Nov 15 2026, redesign order 2318 item 2, Lane S's top bar). Every served seat carries displayName and initials, read from the seat row (desk_seats.display_name) and defaulting to the seat's own name; the crew seat's default is "Sam".
// An email address is never a name: a seat with no display name reads "Seat N". The signed-in seat sets only its OWN name (seat_name { name }); each change is one audit event (desk_seat_events). Pure: the words come from lib/reasonWords.js.
import { reasonLine } from "../reasonWords.js";
export const CREW_NAME = "Sam", NAME_MAX = 40, SEED_NAMES = ["Crew preview"];   // SEED_NAMES: the label the setup SQL gave the crew seat row; it is not a name anyone chose
export const initialsOf = n => { const w = String(n || "").split(/\s+/).filter(Boolean); return !w.length ? "" : w.length === 1 ? (/^[A-Za-z]+$/.test(w[0]) ? w[0][0] : w[0].slice(0, 2)).toUpperCase() : (w[0][0] + w[1][0]).toUpperCase(); };
// what a typed name becomes, or the table's refusal id
export function cleanName(raw) {
  const t = String(raw == null ? "" : raw).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/[\u2013\u2014]/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return { refuse: "case.seat.refuse_empty" }; if (/@/.test(t)) return { refuse: "case.seat.refuse_address" }; if (t.length > NAME_MAX) return { refuse: "case.seat.refuse_long" };
  return { name: t };
}
// names = { [seat label]: stored display name | null } from store.seatNames(org); the label of a seat is its id as text, or "crew"
export function nameOf(label, names, own) {
  if (label == null || label === "") return null; const t = String(label), n = names && names[t];
  if (n && !SEED_NAMES.includes(n)) return n;
  if (own && own.label === t && own.name && !/@/.test(own.name)) return t === "crew" ? CREW_NAME : own.name;
  if (t === "crew") return CREW_NAME; if (/^\d+$/.test(t)) return reasonLine("case.seat.default", { n: t });
  return /@/.test(t) ? reasonLine("case.seat.default", { n: "" }).trim() : t;
}
export const seatViewOf = (label, names, own) => { const displayName = nameOf(label, names, own); return { id: String(label), displayName, initials: initialsOf(displayName) }; };
// the names shown on the page for a list of people: a case's analyst and who it is assigned to
export const namesOnView = (v, names, own) => { const m = x => (x == null ? x : nameOf(x, names, own)); if (v && v.header) v.header.analyst = m(v.header.analyst); if (v && v.lifecycle) v.lifecycle.assignedTo = m(v.lifecycle.assignedTo); return v; };
