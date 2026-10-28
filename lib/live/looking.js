// EVERYTHING A FIND TOGGLE OR BUTTON CREATES IS ON THE TASKS PAGE (Sam, Oct 29 2026). Find makes two kinds of standing notice outside the Task box: a "before it ends" alert on one live car (buy_alerts,
// lib/live/buyAlerts.js) and a watch (watches, lib/live/watches.js): the next sale of a car's spec, or this exact car coming up again. They were not on the Tasks page, not counted anywhere and not limited. This is the one list:
// lookingList reads the signed-in person's own alerts and watches, each with what it watches (the engine's own label, never one the page builds) and a way to stop it, and the counts apart from the Task limit
// (a Task is one of FREE_TASK_LIMIT working Tasks; a watch or an alert never uses one up). Limits are per account (WATCH_CAP, ALERT_CAP) and per address (lib/_ceilings.js watch_arm, through lib/_routeLimit.js).
import { FREE_TASK_LIMIT } from "../tasks/limit.js";
import { listAlerts, TOGGLE_LINE } from "./buyAlerts.js";
import { list as listWatches } from "./watches.js";
import { WATCH_CAP, ALERT_CAP, CAP_LINES } from "./lookingCaps.js";

export { WATCH_CAP, ALERT_CAP, CAP_LINES };
const iso = v => { const t = Date.parse(v || ""); return Number.isFinite(t) ? new Date(t).toISOString() : null; };

// The rows: { ref: "w:<id>" | "a:<listing_id>", kind: "spec_watch" | "car_watch" | "alert", what, detail, ends_at, ended }
export function lookingRows(watches, alerts) {
  const rows = [];
  for (const w of watches || []) rows.push({ ref: "w:" + w.id, kind: w.kind === "vin" ? "car_watch" : "spec_watch", what: w.label, detail: w.kind === "vin" ? "This exact car, if it comes up again." : "The next sale of this car.", paused: !!w.paused_at, last: w.last_event || null });
  for (const a of alerts || []) if (!a.ended) rows.push({ ref: "a:" + a.listing_id, kind: "alert", what: a.title, detail: TOGGLE_LINE, ends_at: iso(a.end_time), ended: false });
  return rows;
}
export function lookingCounts(tasksWorking, rows) {
  const w = rows.filter(r => r.kind !== "alert").length, a = rows.filter(r => r.kind === "alert").length;
  return { tasks: { working: tasksWorking, max: FREE_TASK_LIMIT }, watches: { count: w, max: WATCH_CAP }, alerts: { count: a, max: ALERT_CAP } };
}
export async function lookingList(env, user, tasksWorking = 0) {
  const [w, a] = await Promise.all([listWatches(env, user).catch(() => ({ watches: [] })), listAlerts(env, user).catch(() => ({ items: [] }))]);
  const rows = lookingRows(w.watches, a.items);
  return { rows, counts: lookingCounts(tasksWorking, rows), rule: TOGGLE_LINE };
}
// Stop one by its ref; only the signed-in person's own (stopOne checks the owner).
export async function lookingStop(env, user, ref) {
  const m = /^(w|a):([0-9a-f-]{8,36}|\d{1,12})$/i.exec(String(ref || ""));
  if (!m) return { ok: false, error: "ref" };
  if (m[1].toLowerCase() === "a") { const { cancelAlert } = await import("./buyAlerts.js"); return cancelAlert(env, user, m[2]); }
  const { stop } = await import("./watches.js");
  return stop(env, user, m[2]);
}
