// EVERYTHING A FIND TOGGLE OR BUTTON CREATES IS ON THE TASKS PAGE (Sam, Oct 29 2026). Find makes two kinds of standing notice outside the Task box: a "before it ends" alert on one live car (buy_alerts,
// lib/live/buyAlerts.js) and a watch (watches, lib/live/watches.js): the next sale of a car or market, or this exact car coming up again. This is the one list, the one count and the one set of words:
//   - lookingList reads the signed-in person's own alerts and watches, each with what it watches (the engine's own label, never one the page builds), the words that say what it does, and a way to stop it;
//   - standingCounts / badgeFacts are the ONE count behind the Tasks badge everywhere (Sam, Oct 29 2026): open Tasks + watches + before-it-ends emails that are on (a watch or an email never uses up a working Task, but
//     the badge counts everything active);
//   - ARM_LINES / refusalLine are the sentences for a refused or failed arm; every arm path logs through logArm (event standing_arm), success or refusal.
// Limits are per account (WATCH_CAP, ALERT_CAP) and per address (lib/_ceilings.js watch_arm, through lib/_routeLimit.js).
import { FREE_TASK_LIMIT } from "../tasks/limit.js";
import { listAlerts } from "./buyAlerts.js";
import { list as listWatches } from "./watches.js";
import { WATCH_CAP, ALERT_CAP, CAP_LINES } from "./lookingCaps.js";
import { supabaseSelect } from "../_supabase.js";
import { trackCurrent } from "../track/log.js";

export { WATCH_CAP, ALERT_CAP, CAP_LINES };
const iso = v => { const t = Date.parse(v || ""); return Number.isFinite(t) ? new Date(t).toISOString() : null; };

// The words on the Tasks page for each kind of row (written here, never by the page).
export const LOOKING_WORDS = {
  watch: "Sam tells you when the next one sells.",
  exact: "This exact car.",
  alert: "One email two hours before bidding ends."
};
// The sentence for a refused or failed arm, by reason. A limit says what to stop to make room.
export const ARM_LINES = {
  cap_watch: CAP_LINES.watch, cap_alert: CAP_LINES.alert,
  ended: "Bidding on this car has ended.",
  no_address: "Sam has no email address for this account.",
  limited: "That is a lot of notices from here just now. Sam will take more in a few minutes.",
  signed_out: "Sign in so Sam can keep looking. Free. No card, no plan.",
  failed: "That didn't work just now. Try again."
};
const REASON_OF = { "not found": "not_found", "no vin": "no_vin", "no spec": "no_spec", "unknown vin": "unknown_vin", kind: "kind", cap: "cap", ended: "ended", no_address: "no_address", cap_alert: "cap" };
// Turn an arm result into { outcome, reason, line }. which: "watch" (lib/live/watches.js arm) or "alert" (lib/live/buyAlerts.js armAlert).
export function armOutcome(which, r) {
  if (which === "watch") {
    if (r && r.watch) return { outcome: r.already ? "already" : "added" };
    const reason = REASON_OF[r && r.error] || "failed";
    return { outcome: "refused", reason: reason === "cap" ? "cap_watch" : reason, line: reason === "cap" ? ARM_LINES.cap_watch : (ARM_LINES[reason] || ARM_LINES.failed) };
  }
  if (r && r.ok) return { outcome: r.already ? "already" : "added" };
  const reason = REASON_OF[r && r.reason] || "failed";
  return { outcome: "refused", reason: reason === "cap" ? "cap_alert" : reason, line: reason === "cap" ? ARM_LINES.cap_alert : (ARM_LINES[reason] || ARM_LINES.failed) };
}
// A Task create (lib/tasks/tasks.js startDraft): created, over the limit, or failed.
export function taskOutcome(r) {
  if (r && r.task && !r.blocked) return { outcome: "added" };
  if (r && r.blocked) return { outcome: "refused", reason: "cap_task", line: r.blocked.line || ARM_LINES.failed };
  return { outcome: "refused", reason: "failed", line: ARM_LINES.failed };
}
export const refusalLine = reason => ARM_LINES[reason] || ARM_LINES.failed;
// One event for every arm: the control, the result, the reason when refused, the kind and the listing. The account rides on the event's user.
export function logArm(userId, control, oc, { kind, listing } = {}) {
  try {
    trackCurrent("standing_arm", { control, outcome: oc.outcome, reason: oc.reason || undefined, kind: kind || undefined, listing_id: listing != null && listing !== "" ? String(listing).replace(/[^A-Za-z0-9_.:|\- ]/g, "").slice(0, 60) : undefined },
      { product: "tasks", surface: "api", user_id: userId || undefined });
  } catch { /* logging never blocks the answer */ }
}

// The rows: { ref: "w:<id>" | "a:<listing_id>", kind: "spec_watch" | "car_watch" | "alert", what, detail, ends_at, ended }
export function lookingRows(watches, alerts, liveEnds = {}) {
  const rows = [];
  for (const w of watches || []) {
    const car = w.kind === "vin";
    rows.push({ ref: "w:" + w.id, kind: car ? "car_watch" : "spec_watch", what: w.identity || w.label, detail: car ? LOOKING_WORDS.exact : LOOKING_WORDS.watch, ends_at: car ? iso(liveEnds[String(w.key || "").toUpperCase()]) : null, paused: !!w.paused_at, last: w.last_event || null });
  }
  for (const a of alerts || []) if (!a.ended && !a.sent_at) rows.push({ ref: "a:" + a.listing_id, kind: "alert", what: a.title, detail: LOOKING_WORDS.alert, ends_at: iso(a.end_time), ended: false });
  return rows;
}
export function lookingCounts(tasksWorking, rows, tasksOpen) {
  const w = rows.filter(r => r.kind !== "alert").length, a = rows.filter(r => r.kind === "alert").length;
  return countsOf(tasksWorking, w, a, tasksOpen);
}
// The counts and the one plain line about them (Sam's order and words: Tasks, Watching, Before-it-ends emails).
export function countsOf(tasksWorking, watches, alerts, tasksOpen) {
  const open = tasksOpen == null ? tasksWorking : tasksOpen;
  const c = { tasks: { working: tasksWorking, open, max: FREE_TASK_LIMIT }, watches: { count: watches, max: WATCH_CAP }, alerts: { count: alerts, max: ALERT_CAP }, total: open + watches + alerts };
  c.line = `Tasks ${tasksWorking} of ${FREE_TASK_LIMIT} (searches you describe). Watching ${watches} of ${WATCH_CAP} (cars you want to hear about when they sell). Before-it-ends emails ${alerts} of ${ALERT_CAP} (one email two hours before a bid ends).`;
  return c;
}
// The badge and the header line, one read: the watches that are not stopped and the emails that are on (armed, not sent, not cancelled, the car still live). A failed read counts that part as 0 and says so.
export async function standingCounts(env, userId) {
  const one = async f => { try { return await f(); } catch { return null; } };
  const [w, a] = await Promise.all([
    one(() => supabaseSelect(env, `watches?user_id=eq.${userId}&stopped_at=is.null&select=id&limit=200`)),
    one(async () => {
      const rows = await supabaseSelect(env, `buy_alerts?user_id=eq.${userId}&cancelled_at=is.null&sent_at=is.null&select=listing_id&limit=200`);
      if (!rows || !rows.length) return rows;
      const ids = [...new Set(rows.map(r => Number(r.listing_id)).filter(Boolean))];
      const live = ids.length ? await supabaseSelect(env, `live_listings?id=in.(${ids.join(",")})&status=eq.live&end_time=gt.${encodeURIComponent(new Date().toISOString())}&select=id`) : [];
      return live == null ? null : rows.filter(r => live.some(l => Number(l.id) === Number(r.listing_id)));
    })
  ]);
  return { watches: w == null ? 0 : w.length, alerts: a == null ? 0 : a.length, read: w != null && a != null };
}
export function badgeFacts(tasksWorking, tasksOpen, standing) {
  const s = standing || { watches: 0, alerts: 0, read: false };
  return { ...countsOf(tasksWorking, s.watches, s.alerts, tasksOpen), read: !!s.read };
}
export async function lookingList(env, user, tasksWorking = 0, tasksOpen) {
  const [w, a] = await Promise.all([listWatches(env, user).catch(() => ({ watches: [] })), listAlerts(env, user).catch(() => ({ items: [] }))]);
  // The end time of an exact car that is live right now (one bounded read).
  const vins = (w.watches || []).filter(x => x.kind === "vin" && x.key).map(x => String(x.key).toUpperCase());
  const liveEnds = {};
  if (vins.length) { const r = await supabaseSelect(env, `live_listings?vin_norm=in.(${vins.map(encodeURIComponent).join(",")})&status=eq.live&select=vin_norm,end_time`).catch(() => null); for (const x of r || []) liveEnds[String(x.vin_norm).toUpperCase()] = x.end_time; }
  const rows = lookingRows(w.watches, a.items, liveEnds);
  return { rows, counts: lookingCounts(tasksWorking, rows, tasksOpen), rule: LOOKING_WORDS.alert };
}
// Stop one by its ref; only the signed-in person's own (stopOne checks the owner).
export async function lookingStop(env, user, ref) {
  const m = /^(w|a):([0-9a-f-]{8,36}|\d{1,12})$/i.exec(String(ref || ""));
  if (!m) return { ok: false, error: "ref" };
  if (m[1].toLowerCase() === "a") { const { cancelAlert } = await import("./buyAlerts.js"); return cancelAlert(env, user, m[2]); }
  const { stop } = await import("./watches.js");
  return stop(env, user, m[2]);
}
