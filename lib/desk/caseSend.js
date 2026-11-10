// DESK V4: SEND TO SELLER (Lane D, Nov 10 2026). The two ops case_send_preview and case_send (lib/desk/sheetActions.js) take the finalized version's report and send it through the SAME sending code the older Desk uses (lib/desk/send.js: the org's verified
// address, the org's signature, no analyst name, the copy kept, nothing sent twice by accident); this file holds the rules in front of it and the one adapter to it. Nothing here makes a figure or a sentence of its own: the words are lib/reasonWords.js.
// Sending is never done by a check: the sender is injected (ctx.sendCase), and the live one only runs with a database and the provider key set.
import { reasonLine } from "../reasonWords.js";

export const EMAIL = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/;

// the newest finalized version in the chain of revisions that starts at this sheet (a revision is a new sheet that corrects the one before it)
export function chainOf(all, s0) {
  let cur = s0; const seen = new Set([s0.id]);
  for (;;) { const kid = (all || []).find(x => x.corrects === cur.id && !seen.has(x.id)); if (!kid) return { latest: cur, openRevision: false }; seen.add(kid.id); if (!(kid.case && kid.case.status === "finalized")) return { latest: cur, openRevision: true }; cur = kid; }
}

// WHY A SEND IS REFUSED, in the order the analyst would hit it. Returns a reasonWords line id and its parameters, or null when the case may be sent.
export function sendRefusal({ s0, all, preview, version }) {
  const c = s0.case;
  if (!c || !c.fields) return { id: "send.refuse.no_case" };
  if (c.status !== "finalized" || !s0.final) return { id: s0.corrects || c.version > 1 ? "send.refuse.edited" : preview ? "send.refuse.no_final" : "send.refuse.draft" };
  const { latest, openRevision } = chainOf(all, s0);
  if (latest.id !== s0.id) return { id: "send.refuse.version" };
  if (openRevision) return { id: "send.refuse.edited" };
  if (!preview && Number(version) !== c.version) return { id: "send.refuse.version" };
  return null;
}

// the sending side of the org: its verified address, its name and whether it may send now
export async function sendingOf(ctx, org, set) {
  if (ctx.sending) return ctx.sending;
  if (ctx.env && ctx.env.supabaseUrl) {
    const { supabaseStore } = await import("./intake/store.js"), { sendingReady } = await import("./orgSettings.js");
    const s = await supabaseStore(ctx.env).settingsOf(org);
    return { from: s.sending_address || null, fromName: s.sending_name || set.name, ready: sendingReady(s) };
  }
  return { from: set.sendingAddress || null, fromName: set.name, ready: false };
}

// the live sender: lib/desk/send.js over the intake store (the same desk_sheets row). A first send is sendSheet (its three once-only locks); an explicit second send of the same version is resendSheet (no lock, its own idempotency key, a second export).
export async function defaultSendCase({ ctx, org, seat, sheet, to, subject, message, pdf, again }) {
  if (!ctx.env || !ctx.env.supabaseUrl || !process.env.RESEND_API_KEY) return { ok: false, why: reasonLine("send.refuse.not_switched") };
  const { supabaseStore } = await import("./intake/store.js"), { sendSheet, resendSheet } = await import("./send.js"), store = supabaseStore(ctx.env);
  const seatRow = { id: Number(seat) || seat };
  const out = again ? await resendSheet({ store, org: { id: org, name: ctx.orgName || org }, seat: seatRow, sheetId: sheet.id, to, subject, message, pdf }) : await sendSheet({ store, org: { id: org, name: ctx.orgName || org }, seat: seatRow, sheetId: sheet.id, to, subject, message, pdf, mode: "manual" });
  return out.ok ? { ok: true, id: out.providerId || null, at: out.sentAt } : { ok: false, why: reasonLine("send.refuse.failed"), code: out.reason || null };
}
